import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientMessage, RoomSnapshot } from "@ferbli/protocol";
import { PROTOCOL_VERSION } from "@ferbli/protocol";
import { CardFace } from "./CardFace.js";

function wsUrlFromLocation(): string {
  const env = import.meta.env.VITE_WS_URL;
  if (env) return env;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

export function App() {
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("You");
  const [joinCode, setJoinCode] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    const ws = new WebSocket(wsUrlFromLocation());
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as {
        type: string;
        connectionId?: string;
        message?: string;
        state?: RoomSnapshot;
      };
      if (msg.type === "welcome" && msg.connectionId) {
        setConnectionId(msg.connectionId);
        setError(null);
      }
      if (msg.type === "room_state" && msg.state) {
        setRoomState(msg.state);
        setError(null);
      }
      if (msg.type === "error" && msg.message) {
        setError(msg.message);
      }
    };
    ws.onopen = () => {
      send({ type: "hello", protocolVersion: PROTOCOL_VERSION });
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [send]);

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

  const handsToShow = useMemo(() => {
    if (!roomState) return [];
    if (roomState.hands.length > 0) return roomState.hands;
    return roomState.showdownHands ?? [];
  }, [roomState]);

  if (!connectionId) {
    return (
      <div className="app">
        <p className="muted">Connecting…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Ferbli</h1>
      <p className="muted">
        German 32-card room play · dealer rotates · blind pays 1 coin · others
        fold or pay 1 after seeing two up-cards · best same-suit combo wins the
        pot.
      </p>

      {!roomState && (
        <div className="panel">
          <div className="row">
            <label>
              Name{" "}
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
          </div>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button type="button" onClick={() => send({ type: "create_room", displayName })}>
              Create room
            </button>
          </div>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <input
              placeholder="Room code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
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
              <p className="muted">Pick a free seat below.</p>
            ) : (
              <p className="muted">
                You are in seat {mySeat + 1}. Coins:{" "}
                {roomState.seats[mySeat]?.coins ?? "—"}
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

          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Seats</h2>
            <div className="seat-grid">
              {roomState.seats.map((seat, i) => (
                <div
                  key={i}
                  className={`seat ${roomState.hostConnectionId && seat?.connectionId === roomState.hostConnectionId ? "host" : ""}`}
                >
                  <div>
                    <strong>Seat {i + 1}</strong>
                  </div>
                  {seat ? (
                    <div>
                      {seat.displayName}{" "}
                      <span className="muted">
                        ({seat.kind}) · {seat.coins} coins
                      </span>
                    </div>
                  ) : (
                    <div className="muted">Empty</div>
                  )}
                  <div className="row" style={{ marginTop: "0.5rem" }}>
                    {!seat && (
                      <button
                        type="button"
                        onClick={() =>
                          send({
                            type: "claim_seat",
                            seatIndex: i,
                            displayName,
                          })
                        }
                      >
                        Sit here
                      </button>
                    )}
                    {isHost && !seat && (
                      <button
                        type="button"
                        onClick={() =>
                          send({ type: "set_bot", seatIndex: i, enabled: true })
                        }
                      >
                        Add bot
                      </button>
                    )}
                    {isHost && seat?.kind === "bot" && (
                      <button
                        type="button"
                        onClick={() =>
                          send({ type: "set_bot", seatIndex: i, enabled: false })
                        }
                      >
                        Remove bot
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Hand</h2>
            <div className="row">
              <span>Phase: {roomState.phase}</span>
              <span className="muted">Pot: {roomState.pot}</span>
              {roomState.dealerSeat !== null && (
                <span className="muted">Dealer: seat {roomState.dealerSeat + 1}</span>
              )}
              {roomState.blindSeat !== null && (
                <span className="muted">Blind: seat {roomState.blindSeat + 1}</span>
              )}
              {roomState.actionSeat !== null && (
                <span className="muted">
                  Action: seat {roomState.actionSeat + 1}
                </span>
              )}
            </div>
            {isHost && (
              <div className="row" style={{ marginTop: "0.75rem" }}>
                <button type="button" onClick={() => send({ type: "start_hand" })}>
                  Start hand
                </button>
              </div>
            )}
            {roomState.phase === "ante" &&
              mySeat !== null &&
              roomState.actionSeat === mySeat && (
                <div className="row" style={{ marginTop: "0.75rem" }}>
                  <button type="button" onClick={() => send({ type: "hand_action", action: "enter" })}>
                    Enter (pay 1 coin)
                  </button>
                  <button type="button" onClick={() => send({ type: "hand_action", action: "fold" })}>
                    Fold
                  </button>
                </div>
              )}
            {roomState.lastMessage && (
              <p style={{ marginTop: "0.75rem" }}>{roomState.lastMessage}</p>
            )}
          </div>

          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Cards</h2>
            {handsToShow.length === 0 && (
              <p className="muted">No active hand. Start a hand as host.</p>
            )}
            {handsToShow.map((h) => (
              <div key={h.seatIndex} style={{ marginBottom: "1rem" }}>
                <div>
                  <strong>Seat {h.seatIndex + 1}</strong>{" "}
                  <span className="muted">
                    {h.inRound ? "in round" : "folded"} · score{" "}
                    {h.score ?? "—"}
                  </span>
                </div>
                <div className="card-row" style={{ marginTop: "0.35rem" }}>
                  {h.cards.map((slot, idx) => (
                    <CardFace
                      key={idx}
                      card={slot.card}
                      faceDown={!slot.faceUp}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
