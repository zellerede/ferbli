import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  Card,
  ClientMessage,
  HandPhase,
  HandScore,
  LobbyRoomSummary,
  PlayerHandSnapshot,
  RoomSnapshot,
} from "@ferbli/protocol";
import { MAX_SEATS, PROTOCOL_VERSION } from "@ferbli/protocol";
import { compareHands, handScoreTier } from "@ferbli/rules";
import { CardFace } from "./CardFace.js";
import { LoginScreen } from "./LoginScreen.js";
import {
  clearPlayerSession,
  getNicknameDraftForForm,
  loadPlayerSession,
  saveGuestSession,
  type PlayerSession,
} from "./player-session.js";

function wsUrlFromLocation(): string {
  const env = import.meta.env.VITE_WS_URL;
  if (env) return env;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

/** Non-Blob frames can be decoded synchronously (avoids applying messages after the socket closed). */
function wireDataToStringSync(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new TextDecoder().decode(
      view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
    );
  }
  return String(data);
}

function formatHandScore(s: HandScore): string {
  const label: Record<HandScore["figure"], string> = {
    "high-card": "High card",
    "one-suite": "One suite",
    "ace-pair": "Ace pair",
    triplet: "Triplet",
    quadruplet: "Quadruplet",
  };
  return `${label[s.figure]} ${s.score}`;
}

function coinSeatIndices(roomState: RoomSnapshot): number[] {
  const out: number[] = [];
  for (let i = 0; i < MAX_SEATS; i++) {
    const s = roomState.seats[i];
    if (s && s.coins >= 1) out.push(i);
  }
  out.sort((a, b) => a - b);
  return out;
}

/** Next blind after dealer, among seats with 1+ coin (matches server blind rule). */
function nextBlindAfterDealer(
  dealerSeat: number,
  coinSeats: number[],
): number | null {
  if (coinSeats.length < 2) return null;
  const sorted = [...coinSeats].sort((a, b) => a - b);
  const idx = sorted.indexOf(dealerSeat);
  if (idx === -1) return null;
  return sorted[(idx + 1) % sorted.length]!;
}

/** Status line during / after a hand (ante vs later phases differ). */
function handRoundLabel(
  phase: HandPhase,
  h: PlayerHandSnapshot,
  blindSeat: number | null,
): string {
  if (h.inRound) return "in round";
  if (phase === "ante") {
    if (h.foldedAnte) return "folded";
    if (blindSeat !== null && h.seatIndex !== blindSeat) return "to decide";
    return "waiting";
  }
  return "folded";
}

function renderGameTableSeat(opts: {
  seatIdx: number;
  roomState: RoomSnapshot;
  handsToShow: PlayerHandSnapshot[];
  mySeat: number | null;
  isHost: boolean;
  displayName: string;
  send: (m: ClientMessage) => void;
}): ReactNode {
  const { seatIdx, roomState, handsToShow, mySeat, isHost, displayName, send } = opts;
  const seat = roomState.seats[seatIdx] ?? null;
  const isHostSeat =
    !!roomState.hostConnectionId &&
    seat?.connectionId === roomState.hostConnectionId;
  const hand = handsToShow.find((h) => h.seatIndex === seatIdx) ?? null;
  const inHand = roomState.handSeats.includes(seatIdx);
  const isViewerOwner = mySeat !== null && mySeat === seatIdx;
  const isAnte = roomState.phase === "ante";

  const dealPreviewPills =
    roomState.phase === "idle" &&
    !roomState.roundResultPending &&
    roomState.nextDealerSeat !== null;
  const pillDealerSeat: number | null = dealPreviewPills
    ? roomState.nextDealerSeat
    : roomState.dealerSeat;
  const pillBlindSeat: number | null = dealPreviewPills
    ? nextBlindAfterDealer(
        roomState.nextDealerSeat!,
        coinSeatIndices(roomState),
      )
    : roomState.blindSeat;

  return (
    <div
      className={`game-table-seat ${isHostSeat ? "host" : ""} ${mySeat === seatIdx ? "is-me" : ""} ${pillDealerSeat === seatIdx ? "is-dealer" : ""} ${pillBlindSeat === seatIdx ? "is-blind" : ""} ${inHand ? "in-hand" : ""}`}
    >
      <div className="game-table-seat-head">
        {pillDealerSeat === seatIdx ? (
          <span className="game-table-dealer-pill">Dealer</span>
        ) : null}
        {pillBlindSeat === seatIdx ? (
          <span className="game-table-blind-pill">Blind</span>
        ) : null}
      </div>
      {seat ? (
        <div className="game-table-seat-name">
          <strong className="game-table-player-name">{seat.displayName}</strong>
        </div>
      ) : (
        <div className="muted game-table-seat-name">Open seat</div>
      )}
      {seat ? (
        <div className="game-table-seat-meta">
          <span className="muted">
            ({seat.kind}) · {seat.coins} coins
          </span>
        </div>
      ) : null}
      {hand && inHand && isAnte ? (
        <>
          <div className="muted game-table-hand-status">
            {handRoundLabel(roomState.phase, hand, roomState.blindSeat)}
          </div>
          {isViewerOwner ? (
            <div className="game-table-card-zones">
              <div className="game-table-zone game-table-zone-hand">
                <span className="game-table-zone-label">In hand</span>
                <div className="card-row game-table-card-row">
                  <CardFace
                    key="o0"
                    card={hand.cards[0]?.card ?? null}
                    faceDown={!hand.cards[0]?.faceUp}
                  />
                  <CardFace
                    key="o1"
                    card={hand.cards[1]?.card ?? null}
                    faceDown={!hand.cards[1]?.faceUp}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : hand ? (
        <div className="muted game-table-hand-status">
          {handRoundLabel(roomState.phase, hand, roomState.blindSeat)}
        </div>
      ) : (
        <div className="muted game-table-no-cards">—</div>
      )}
      <div className="row game-table-seat-actions">
        {!seat && mySeat === null && roomState.phase === "idle" && (
          <button
            type="button"
            onClick={() =>
              send({
                type: "claim_seat",
                seatIndex: seatIdx,
                displayName,
              })
            }
          >
            Sit
          </button>
        )}
        {isHost && !seat && roomState.phase === "idle" && (
          <button
            type="button"
            onClick={() => send({ type: "set_bot", seatIndex: seatIdx, enabled: true })}
          >
            Bot
          </button>
        )}
        {isHost && seat?.kind === "bot" && roomState.phase === "idle" && (
          <button
            type="button"
            onClick={() =>
              send({ type: "set_bot", seatIndex: seatIdx, enabled: false })
            }
          >
            −Bot
          </button>
        )}
      </div>
    </div>
  );
}

type RoundResultModal = {
  variant: "win" | "lose" | "cancelled";
  title: string;
  detail: string;
  /** Last hand reveal for this seat; null if unavailable (e.g. aborted hand). */
  playerHand: PlayerHandSnapshot | null;
};

type RoundResultSummary = Omit<RoundResultModal, "playerHand">;

function abortedRoundMessage(lastMessage: string | null): boolean {
  const t = lastMessage ?? "";
  return t.includes("aborted") || t.includes("player left");
}

/** Same tier + display score only (no kicker); used if face-up cards are incomplete. */
function compareScoresRough(a: HandScore, b: HandScore): number {
  const t = handScoreTier(a) - handScoreTier(b);
  if (t !== 0) return t;
  return a.score - b.score;
}

function cardsFromFaceUpSlots(
  slots: PlayerHandSnapshot["cards"],
): Card[] | null {
  const out: Card[] = [];
  for (const s of slots) {
    if (!s.faceUp || s.card === null) return null;
    out.push(s.card);
  }
  return out.length === 4 ? out : null;
}

function roundResultForSeat(
  roomState: RoomSnapshot,
  mySeat: number,
): RoundResultSummary | null {
  const hands = roomState.showdownHands;
  if (!hands?.length) return null;

  const mine = hands.find((h) => h.seatIndex === mySeat);
  if (!mine) return null;

  const potCarried =
    roomState.carryOverPot !== null && roomState.carryOverDealerSeat !== null;

  const inShowdown = hands.filter((h) => h.inRound && h.score !== null);
  if (inShowdown.length === 0) {
    if (!mine.inRound) {
      return {
        variant: "lose",
        title: "You lost this round",
        detail: "You did not enter the showdown.",
      };
    }
    return {
      variant: "lose",
      title: "You lost this round",
      detail: "No one contested the pot.",
    };
  }

  const rows: { hand: (typeof inShowdown)[0]; cards: Card[] }[] = [];
  for (const h of inShowdown) {
    const cards = cardsFromFaceUpSlots(h.cards);
    if (cards) rows.push({ hand: h, cards });
  }
  const useCardOrder =
    rows.length > 0 && rows.length === inShowdown.length;

  let bestScore: HandScore;
  let winnerCount: number;
  let bestHandExample: HandScore | undefined;
  let bestRow: (typeof rows)[0] | null = null;

  if (useCardOrder) {
    bestRow = rows[0]!;
    for (const r of rows.slice(1)) {
      if (compareHands(r.cards, bestRow.cards) > 0) bestRow = r;
    }
    bestScore = bestRow.hand.score!;
    winnerCount = rows.filter(
      (r) => compareHands(r.cards, bestRow!.cards) === 0,
    ).length;
    bestHandExample = rows.find(
      (r) => compareHands(r.cards, bestRow!.cards) === 0,
    )?.hand.score ?? undefined;
  } else {
    bestScore = inShowdown.reduce(
      (b, h) =>
        compareScoresRough(h.score!, b) > 0 ? h.score! : b,
      inShowdown[0]!.score!,
    );
    winnerCount = inShowdown.filter(
      (h) => compareScoresRough(h.score!, bestScore) === 0,
    ).length;
    bestHandExample =
      inShowdown.find((h) => compareScoresRough(h.score!, bestScore) === 0)
        ?.score ?? undefined;
  }

  const mineCards = cardsFromFaceUpSlots(mine.cards);
  const mineIsBest = useCardOrder
    ? !!(
        mineCards &&
        bestRow &&
        compareHands(mineCards, bestRow.cards) === 0
      )
    : compareScoresRough(mine.score!, bestScore) === 0;

  if (!mine.inRound || mine.score === null) {
    return {
      variant: "lose",
      title: "You lost this round",
      detail: mine.foldedAnte
        ? "You folded in the ante."
        : "You did not enter the showdown.",
    };
  }

  if (potCarried) {
    if (mineIsBest && winnerCount > 1) {
      return {
        variant: "lose",
        title: "Tied for best",
        detail:
          "There is no split pot — the pot stays on the table. Everyone pays 1 coin and the same dealer runs an extra round.",
      };
    }
    if (mineIsBest) {
      return {
        variant: "lose",
        title: "Pot carries",
        detail:
          "No single winner this round. The pot stays; everyone pays 1 coin and the same dealer deals again.",
      };
    }
    return {
      variant: "lose",
      title: "Pot carries",
      detail: `Your hand was ${formatHandScore(mine.score)}; the best at the table was ${bestHandExample ? formatHandScore(bestHandExample) : "unknown"}. The pot stays for a replay.`,
    };
  }

  if (mineIsBest) {
    return {
      variant: "win",
      title: "You won this round",
      detail: `Your ${formatHandScore(mine.score)} took the pot.`,
    };
  }

  return {
    variant: "lose",
    title: "You lost this round",
    detail: `Your hand was ${formatHandScore(mine.score)}; the best at the table was ${bestHandExample ? formatHandScore(bestHandExample) : "unknown"}.`,
  };
}

export function App() {
  const [playerSession, setPlayerSession] = useState<PlayerSession | null>(
    loadPlayerSession,
  );
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [lobbyRooms, setLobbyRooms] = useState<LobbyRoomSummary[] | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const welcomedRef = useRef(false);
  /** Messages sent while the socket is still CONNECTING (e.g. React Strict Mode remount). */
  const outboundQueueRef = useRef<ClientMessage[]>([]);
  const playerSessionRef = useRef<PlayerSession | null>(playerSession);
  playerSessionRef.current = playerSession;

  type GuestReserveResult =
    | { ok: true; displayName: string }
    | { ok: false; message: string };

  const guestReserveWaiterRef = useRef<
    ((result: GuestReserveResult) => void) | null
  >(null);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (!ws) {
      setError(
        "Not connected to the game server (socket missing). Try refreshing; if it persists, run `npm run dev` from the repo root.",
      );
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return;
    }
    if (ws.readyState === WebSocket.CONNECTING) {
      outboundQueueRef.current.push(msg);
      return;
    }
    setError(
      "Cannot send to the server: WebSocket is not open. Refresh the page or wait until you are connected.",
    );
  }, []);

  const reserveGuestDisplayName = useCallback(
    (displayName: string): Promise<GuestReserveResult> => {
      return new Promise((resolve) => {
        guestReserveWaiterRef.current = resolve;
        send({ type: "guest_reserve_display_name", displayName });
        window.setTimeout(() => {
          if (guestReserveWaiterRef.current === resolve) {
            guestReserveWaiterRef.current = null;
            resolve({
              ok: false,
              message: "Server did not respond. Try again.",
            });
          }
        }, 15_000);
      });
    },
    [send],
  );

  useEffect(() => {
    let cancelled = false;
    const wsUrl = wsUrlFromLocation();
    welcomedRef.current = false;
    outboundQueueRef.current = [];
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setError(null);
    ws.onmessage = (ev) => {
      const myWs = ws;

      const applyPayload = (text: string) => {
        // Drop stale events from an old socket or after close (wsRef cleared).
        if (wsRef.current !== myWs) return;

        let msg: {
          type: string;
          connectionId?: string;
          message?: string;
          displayName?: string;
          state?: RoomSnapshot;
          rooms?: LobbyRoomSummary[];
        };
        try {
          msg = JSON.parse(text) as typeof msg;
        } catch {
          setError("Invalid message from server (not JSON).");
          return;
        }
        if (wsRef.current !== myWs) return;

        if (msg.type === "welcome" && msg.connectionId) {
          welcomedRef.current = true;
          setConnectionId(msg.connectionId);
          setError(null);
        }
        if (msg.type === "room_state" && msg.state) {
          setRoomState(msg.state);
          setError(null);
        }
        if (msg.type === "room_list" && Array.isArray(msg.rooms)) {
          setLobbyRooms(msg.rooms);
          setError(null);
        }
        if (msg.type === "error" && msg.message) {
          setError(msg.message);
        }
        if (msg.type === "guest_display_name_reserved" && msg.displayName) {
          const fn = guestReserveWaiterRef.current;
          guestReserveWaiterRef.current = null;
          fn?.({ ok: true, displayName: msg.displayName });
        }
        if (msg.type === "guest_display_name_rejected" && msg.message) {
          const fn = guestReserveWaiterRef.current;
          guestReserveWaiterRef.current = null;
          fn?.({ ok: false, message: msg.message });
        }
      };

      const raw = ev.data;
      if (typeof raw === "string") {
        applyPayload(raw);
        return;
      }
      if (raw instanceof Blob) {
        void raw.text().then((text) => {
          if (wsRef.current !== myWs) return;
          applyPayload(text);
        });
        return;
      }
      applyPayload(wireDataToStringSync(raw));
    };
    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      ws.send(
        JSON.stringify({
          type: "hello",
          protocolVersion: PROTOCOL_VERSION,
        }),
      );
      const queued = outboundQueueRef.current;
      outboundQueueRef.current = [];
      for (const m of queued) {
        ws.send(JSON.stringify(m));
      }
    };
    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setError(
        `WebSocket error (could not reach game server). Tried: ${wsUrl}. With Vite dev, use "npm run dev" from the repo root and keep the server on port 3333.`,
      );
    };
    ws.onclose = () => {
      const stillTracked = wsRef.current === ws;
      if (stillTracked) {
        wsRef.current = null;
      }
      if (cancelled) return;
      if (!stillTracked) return;
      const hadWelcome = welcomedRef.current;
      welcomedRef.current = false;
      const w = guestReserveWaiterRef.current;
      guestReserveWaiterRef.current = null;
      w?.({
        ok: false,
        message: "Lost connection to the server.",
      });
      setConnectionId(null);
      setRoomState(null);
      if (!hadWelcome) {
        setError(
          `WebSocket closed before welcome. Tried: ${wsUrl}. Start the game server on port 3333, or set VITE_WS_URL=ws://127.0.0.1:3333/ws if the UI is not served by Vite.`,
        );
      } else {
        setError(
          playerSessionRef.current
            ? "Disconnected from the game server. Refresh the page, then create or join a room again."
            : "Lost connection to the server. Check that the game server is running, then refresh the page.",
        );
      }
    };
    return () => {
      cancelled = true;
      const w = guestReserveWaiterRef.current;
      guestReserveWaiterRef.current = null;
      w?.({
        ok: false,
        message: "Lost connection to the server.",
      });
      setConnectionId(null);
      setRoomState(null);
      welcomedRef.current = false;
      ws.close();
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [send]);

  useEffect(() => {
    if (!playerSession || !connectionId || roomState !== null) return;
    const requestList = () => send({ type: "list_rooms" });
    requestList();
    const interval = window.setInterval(requestList, 4500);
    return () => window.clearInterval(interval);
  }, [playerSession, connectionId, roomState, send]);

  useEffect(() => {
    if (roomState !== null) setLobbyRooms(null);
  }, [roomState]);

  const isHost = useMemo(() => {
    if (!connectionId || !roomState?.hostConnectionId) return false;
    return roomState.hostConnectionId === connectionId;
  }, [connectionId, roomState?.hostConnectionId]);

  const mySeat = useMemo(() => {
    if (!connectionId || !roomState) return null;
    const idx = roomState.seats.findIndex(
      (s) => s?.kind === "human" && s.connectionId === connectionId,
    );
    return idx === -1 ? null : idx;
  }, [connectionId, roomState]);

  /** Between hands: next dealer seat; if that seat is a bot, the server deals automatically. */
  const canDeal = useMemo(() => {
    if (!connectionId || !roomState || roomState.phase !== "idle") return false;
    if (roomState.roundResultPending) return false;
    const d = roomState.nextDealerSeat;
    if (d === null) return false;
    const seat = roomState.seats[d];
    if (!seat || seat.kind === "bot") return false;
    return seat.connectionId === connectionId;
  }, [connectionId, roomState]);

  /** Active hand only — showdown stays in the round-result modal, not on the table. */
  const handsToShow = useMemo(() => {
    if (!roomState) return [];
    return roomState.hands;
  }, [roomState]);

  /** Blind for the next hand when idle and a deal is allowed (matches dealer pills). */
  const idleNextBlindSeat = useMemo(() => {
    if (
      !roomState ||
      roomState.phase !== "idle" ||
      roomState.roundResultPending ||
      roomState.nextDealerSeat === null
    ) {
      return null;
    }
    return nextBlindAfterDealer(
      roomState.nextDealerSeat,
      coinSeatIndices(roomState),
    );
  }, [roomState]);

  /** During ante, this seat still needs a fold/enter choice (blind is automatic). */
  const myAnteNeedsChoice = useMemo(() => {
    if (!roomState || roomState.phase !== "ante" || mySeat === null) return false;
    if (roomState.blindSeat === mySeat) return false;
    const h = roomState.hands.find((x) => x.seatIndex === mySeat);
    if (!h) return false;
    return !h.inRound && !h.foldedAnte;
  }, [roomState, mySeat]);

  const acknowledgeRound = useCallback(() => {
    send({ type: "ack_round_result" });
  }, [send]);

  /** You must acknowledge before the next deal; server clears this after `ack_round_result`. */
  const roundAckBlocking = useMemo((): RoundResultModal | null => {
    if (!roomState?.roundResultPending || mySeat === null) return null;
    const required = roomState.roundResultRequiredSeats;
    const acked = roomState.roundResultAckedSeats;
    if (!required.includes(mySeat) || acked.includes(mySeat)) return null;

    const last = roomState.lastMessage;
    const playerHand =
      roomState.showdownHands?.find((h) => h.seatIndex === mySeat) ?? null;

    if (abortedRoundMessage(last)) {
      return {
        variant: "cancelled",
        title: "Hand cancelled",
        detail: last ?? "The hand was stopped.",
        playerHand,
      };
    }

    const summary =
      roundResultForSeat(roomState, mySeat) ?? {
        variant: "lose" as const,
        title: "Round over",
        detail: last ?? "Press OK to continue.",
      };

    return { ...summary, playerHand };
  }, [roomState, mySeat]);

  const roundAckWaitingNotice = useMemo(() => {
    if (!roomState?.roundResultPending) return null;
    const required = roomState.roundResultRequiredSeats;
    const acked = roomState.roundResultAckedSeats;
    const waitingOn = required.filter((s) => !acked.includes(s));
    if (waitingOn.length === 0) return null;

    if (mySeat === null) {
      return "The next hand will start after all players in the last round acknowledge the result.";
    }
    if (!required.includes(mySeat)) {
      return "The next hand will start after players in the last round acknowledge the result.";
    }
    if (acked.includes(mySeat)) {
      return "Waiting for other players to acknowledge the last round…";
    }
    return null;
  }, [roomState, mySeat]);

  useEffect(() => {
    if (!roundAckBlocking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") acknowledgeRound();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roundAckBlocking, acknowledgeRound]);

  const displayName = playerSession?.displayName ?? "";

  const signOutPlayer = useCallback(() => {
    clearPlayerSession();
    setPlayerSession(null);
  }, []);

  if (!playerSession) {
    return (
      <LoginScreen
        initialNickname={getNicknameDraftForForm()}
        socketReady={connectionId !== null}
        reserveGuestDisplayName={reserveGuestDisplayName}
        onGuestContinue={(session) => {
          saveGuestSession(session.displayName);
          setPlayerSession(session);
        }}
      />
    );
  }

  if (!connectionId) {
    return (
      <div className="app">
        <h1>Ferbli</h1>
        {error ? (
          <p className="error">{error}</p>
        ) : (
          <p className="muted">Connecting…</p>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Ferbli</h1>
      {error ? <p className="error">{error}</p> : null}
      <p className="muted">
        German 32-card table game: blind pays 1 coin; others fold or pay 1 after
        seeing their own up-cards (open cards stay private to each player). Same
        dealer replays when the pot carries (tie or all others fold in the ante).
      </p>

      {!roomState && (
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <p className="muted" style={{ margin: 0 }}>
              Playing as <strong>{displayName}</strong> (guest)
            </p>
            <button type="button" className="button-quiet" onClick={signOutPlayer}>
              Change player
            </button>
          </div>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button type="button" onClick={() => send({ type: "create_room", displayName })}>
              Create room
            </button>
          </div>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <input
              placeholder="e.g. calm-otter"
              value={joinCode}
              onChange={(e) =>
                setJoinCode(
                  e.target.value
                    .trimStart()
                    .toLowerCase()
                    .replace(/\s+/g, "-")
                    .replace(/_+/g, "-"),
                )
              }
            />
            <button
              type="button"
              onClick={() =>
                send({ type: "join_room", roomCode: joinCode, displayName })
              }
            >
              Join room
            </button>
          </div>
          <div className="lobby-open-rooms">
            <h2 className="lobby-open-rooms-title">Open rooms</h2>
            {lobbyRooms === null ? (
              <p className="lobby-room-list-status">Loading open rooms…</p>
            ) : lobbyRooms.length === 0 ? (
              <p className="lobby-room-list-status">No open rooms right now.</p>
            ) : (
              <ul className="lobby-room-list">
                {lobbyRooms.map((r) => (
                  <li key={r.roomCode}>
                    <button
                      type="button"
                      className="lobby-room-row"
                      onClick={() => {
                        setJoinCode(r.roomCode);
                        send({
                          type: "join_room",
                          roomCode: r.roomCode,
                          displayName,
                        });
                      }}
                    >
                      <span className="lobby-room-code">{r.roomCode}</span>
                      <span className="lobby-room-names">
                        {r.humanNames.length > 0
                          ? r.humanNames.join(" · ")
                          : "No seated humans"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {roomState && (
        <>
          <div className="panel">
            <div className="row">
              <strong>Room {roomState.roomCode}</strong>
              {isHost && <span className="muted"> · You are host</span>}
            </div>
            {mySeat === null ? (
              roomState.phase === "idle" ? (
                <p className="muted">Pick a free seat below.</p>
              ) : (
                <p className="muted">
                  A hand is in progress. You cannot take a seat until it ends.
                </p>
              )
            ) : (
              <p className="muted">
                Seated as <strong>{roomState.seats[mySeat]?.displayName ?? displayName}</strong>
                {" · "}
                {roomState.seats[mySeat]?.coins ?? "—"} coins
              </p>
            )}
            <div className="row" style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              onClick={() => {
                send({ type: "leave_room" });
                setRoomState(null);
              }}
            >
              Leave room
            </button>
              {mySeat !== null && (
                <button type="button" onClick={() => send({ type: "release_seat" })}>
                  Stand up
                </button>
              )}
            </div>
          </div>

          <div className="panel game-table-panel">
            <h2 style={{ marginTop: 0 }}>Table</h2>
            <div className="game-table-wrap">
              <div className="game-table-row game-table-row-top">
                {[3, 4, 5].map((seatIdx) => (
                  <div key={seatIdx} className="game-table-seat-wrap">
                    {renderGameTableSeat({
                      seatIdx,
                      roomState,
                      handsToShow,
                      mySeat,
                      isHost,
                      displayName,
                      send,
                    })}
                  </div>
                ))}
              </div>
              <div className="game-table-row game-table-row-mid">
                <div className="game-table-seat-wrap">
                  {renderGameTableSeat({
                    seatIdx: 2,
                    roomState,
                    handsToShow,
                    mySeat,
                    isHost,
                    displayName,
                    send,
                  })}
                </div>
                <div className="game-table-felt">
                  <div className="game-table-pot">
                    <span className="game-table-pot-label">Pot</span>
                    <strong className="game-table-pot-value">{roomState.pot}</strong>
                  </div>
                  {roomState.phase === "ante" &&
                  mySeat !== null &&
                  roomState.handSeats.includes(mySeat) &&
                  handsToShow.some((h) => h.seatIndex === mySeat) ? (
                    <div
                      className="game-table-felt-holes"
                      aria-label="Your hole cards on the table"
                    >
                      <CardFace key="my-hole-0" card={null} faceDown />
                      <CardFace key="my-hole-1" card={null} faceDown />
                    </div>
                  ) : null}
                  {canDeal ? (
                    <div className="row game-table-felt-actions">
                      <button type="button" onClick={() => send({ type: "start_hand" })}>
                        Deal
                      </button>
                    </div>
                  ) : null}
                  {roomState.phase === "ante" && myAnteNeedsChoice ? (
                    <div className="row game-table-felt-actions">
                      <button
                        type="button"
                        onClick={() => send({ type: "hand_action", action: "enter" })}
                      >
                        Enter (pay 1 coin)
                      </button>
                      <button
                        type="button"
                        onClick={() => send({ type: "hand_action", action: "fold" })}
                      >
                        Fold
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="game-table-seat-wrap">
                  {renderGameTableSeat({
                    seatIdx: 0,
                    roomState,
                    handsToShow,
                    mySeat,
                    isHost,
                    displayName,
                    send,
                  })}
                </div>
              </div>
              <div className="game-table-row game-table-row-bot">
                <div className="game-table-seat-spacer" aria-hidden />
                <div className="game-table-seat-wrap">
                  {renderGameTableSeat({
                    seatIdx: 1,
                    roomState,
                    handsToShow,
                    mySeat,
                    isHost,
                    displayName,
                    send,
                  })}
                </div>
                <div className="game-table-seat-spacer" aria-hidden />
              </div>
            </div>

            <div className="game-table-controls">
              {roomState.carryOverPot != null ? (
                <p className="game-table-carry muted">
                  Carry-over: next deal each hand seat pays 1 coin (same dealer).
                </p>
              ) : null}
              <div className="game-table-meta row">
                <span>Phase: {roomState.phase}</span>
                {roomState.dealerSeat !== null ? (
                  <span className="muted">
                    Dealer:{" "}
                    {roomState.seats[roomState.dealerSeat]?.displayName ?? "—"}
                  </span>
                ) : roomState.phase === "idle" &&
                  roomState.nextDealerSeat !== null ? (
                  <span className="muted">
                    Next dealer:{" "}
                    {roomState.seats[roomState.nextDealerSeat]?.displayName ?? "—"}
                  </span>
                ) : null}
                {roomState.blindSeat !== null ? (
                  <span className="muted">
                    Blind:{" "}
                    {roomState.seats[roomState.blindSeat]?.displayName ?? "—"}
                  </span>
                ) : idleNextBlindSeat !== null ? (
                  <span className="muted">
                    Next blind:{" "}
                    {roomState.seats[idleNextBlindSeat]?.displayName ?? "—"}
                  </span>
                ) : null}
              </div>
              {roomState.phase === "ante" ? (
                <p className="muted game-table-hint">
                  Ante: non-blind players fold or enter (any order).
                </p>
              ) : null}
              {roundAckWaitingNotice ? (
                <p className="muted game-table-hint">{roundAckWaitingNotice}</p>
              ) : null}
              {handsToShow.length === 0 && !roomState.roundResultPending ? (
                <p className="muted game-table-hint">
                  No active hand. The dealer presses Deal when ready.
                </p>
              ) : null}
              {handsToShow.length === 0 && roomState.roundResultPending ? (
                <p className="muted game-table-hint">
                  Waiting for all players in the last round to acknowledge before the next
                  deal.
                </p>
              ) : null}
              {roomState.lastMessage &&
              !roomState.lastMessage.toLowerCase().includes("showdown") ? (
                <p className="game-table-lastmsg">{roomState.lastMessage}</p>
              ) : null}
            </div>
          </div>
        </>
      )}

      {roundAckBlocking ? (
        <div className="round-result-backdrop" role="presentation">
          <div
            className={`round-result-dialog round-result-${roundAckBlocking.variant}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="round-result-title"
          >
            <h2 id="round-result-title" style={{ marginTop: 0 }}>
              {roundAckBlocking.title}
            </h2>
            <p style={{ marginBottom: 0 }}>{roundAckBlocking.detail}</p>
            {roundAckBlocking.playerHand ? (
              <div style={{ marginTop: "1.1rem" }}>
                <div className="muted" style={{ marginBottom: "0.35rem" }}>
                  Your cards
                </div>
                <div className="card-row">
                  {roundAckBlocking.playerHand.cards.map((slot, idx) => (
                    <CardFace
                      key={idx}
                      card={slot.card}
                      faceDown={!slot.faceUp}
                    />
                  ))}
                </div>
                {roundAckBlocking.playerHand.score !== null ? (
                  <p className="muted" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
                    Hand: {formatHandScore(roundAckBlocking.playerHand.score)}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="row" style={{ marginTop: "1.25rem", justifyContent: "flex-end" }}>
              <button type="button" onClick={acknowledgeRound}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
