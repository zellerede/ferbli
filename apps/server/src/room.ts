import {
  MAX_SEATS,
  PROTOCOL_VERSION,
  type Card,
  type ClientMessage,
  type HandPhase,
  type PlayerHandSnapshot,
  type RoomSnapshot,
  type SeatSnapshot,
} from "@ferbli/protocol";
import {
  createDeck,
  pickRandomAnteAction,
  scoreHand,
  shuffle,
} from "@ferbli/rules";

const STARTING_COINS = 20;

type InternalSeat = {
  kind: "human" | "bot";
  displayName: string;
  coins: number;
  connectionId: string | null;
};

type SeatCards = {
  public: [Card, Card];
  private: [Card, Card];
  inRound: boolean;
  foldedAnte: boolean;
};

type ActiveHand = {
  dealerSeat: number;
  blindSeat: number;
  handSeats: number[];
  /** Non-blind seats that must choose fold/enter (any order). */
  anteOrder: number[];
  cards: Map<number, SeatCards>;
  pot: number;
  phase: "ante" | "reveal" | "showdown";
};

function nextCircularActors(
  handSeats: number[],
  blindSeat: number,
): number[] {
  const set = new Set(handSeats);
  const out: number[] = [];
  for (let step = 1; step < MAX_SEATS; step++) {
    const s = (blindSeat + step) % MAX_SEATS;
    if (set.has(s) && s !== blindSeat) out.push(s);
  }
  return out;
}

function nextDealer(handSeats: number[], previousDealer: number | null): number {
  const sorted = [...handSeats].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  if (previousDealer === null) return sorted[0]!;
  const idx = sorted.indexOf(previousDealer);
  if (idx === -1) return sorted[0]!;
  return sorted[(idx + 1) % sorted.length]!;
}

function blindForDealer(handSeats: number[], dealerSeat: number): number {
  const sorted = [...handSeats].sort((a, b) => a - b);
  const idx = sorted.indexOf(dealerSeat);
  if (idx === -1) return sorted[0]!;
  return sorted[(idx + 1) % sorted.length]!;
}

export type SendFn = (msg: unknown) => void;

export class Room {
  readonly code: string;
  hostConnectionId: string | null;
  seats: (InternalSeat | null)[] = Array.from({ length: MAX_SEATS }, () => null);
  lastDealerSeat: number | null = null;
  lastMessage: string | null = null;
  /** connectionId -> send */
  readonly connections = new Map<string, SendFn>();
  activeHand: ActiveHand | null = null;
  /** Persisted reveal for UI after `activeHand` is cleared. */
  showdownHands: PlayerHandSnapshot[] | null = null;
  phase: HandPhase = "idle";
  /** Human seats that must send `ack_round_result` before the next deal. */
  private roundAckRequired: Set<number> | null = null;
  private roundAcked: Set<number> | null = null;

  constructor(code: string, hostConnectionId: string) {
    this.code = code;
    this.hostConnectionId = hostConnectionId;
  }

  addConnection(connectionId: string, send: SendFn): void {
    this.connections.set(connectionId, send);
  }

  removeConnection(connectionId: string): void {
    const waivedSeats: number[] = [];
    for (let i = 0; i < MAX_SEATS; i++) {
      const seat = this.seats[i];
      if (seat?.kind === "human" && seat.connectionId === connectionId) {
        waivedSeats.push(i);
        seat.connectionId = null;
      }
    }
    for (const s of waivedSeats) {
      this.waiveAckForSeatIfWaiting(s);
    }
    this.connections.delete(connectionId);
    if (this.hostConnectionId === connectionId) {
      this.hostConnectionId = this.pickNextHost(connectionId);
    }
  }

  pickNextHost(exclude: string): string | null {
    for (const [id] of this.connections) {
      if (id !== exclude) return id;
    }
    return null;
  }

  private roundAckWaiting(): boolean {
    if (!this.roundAckRequired || this.roundAckRequired.size === 0) {
      return false;
    }
    if (!this.roundAcked) return true;
    for (const s of this.roundAckRequired) {
      if (!this.roundAcked.has(s)) return true;
    }
    return false;
  }

  /** Clears barrier when every required seat has acked (or lists became empty). */
  private tryFinishRoundAckBarrier(): void {
    if (!this.roundAckRequired || this.roundAckRequired.size === 0) {
      this.roundAckRequired = null;
      this.roundAcked = null;
      return;
    }
    if (!this.roundAcked) return;
    for (const s of this.roundAckRequired) {
      if (!this.roundAcked.has(s)) return;
    }
    this.roundAckRequired = null;
    this.roundAcked = null;
  }

  /** Seat left or disconnected: no longer must (or can) ack for this barrier. */
  private waiveAckForSeatIfWaiting(seat: number): void {
    if (!this.roundAckRequired?.has(seat)) return;
    this.roundAckRequired.delete(seat);
    this.roundAcked?.delete(seat);
    if (this.roundAckRequired.size === 0) {
      this.roundAckRequired = null;
      this.roundAcked = null;
    } else {
      this.tryFinishRoundAckBarrier();
    }
  }

  /**
   * After a hand ends (showdown or abort), require connected humans who were
   * in that hand to ack before the next deal. `excludeSeat` skips a departing player.
   */
  private beginRoundAck(hand: ActiveHand, opts?: { excludeSeat?: number }): void {
    const exclude = opts?.excludeSeat;
    const required = new Set<number>();
    for (const seat of hand.handSeats) {
      if (seat === exclude) continue;
      const pl = this.seats[seat];
      if (pl?.kind === "human" && pl.connectionId) {
        required.add(seat);
      }
    }
    if (required.size === 0) {
      this.roundAckRequired = null;
      this.roundAcked = null;
      return;
    }
    this.roundAckRequired = required;
    this.roundAcked = new Set();
  }

  ackRoundResult(connectionId: string): string | null {
    if (!this.roundAckWaiting()) {
      return null;
    }
    const required = this.roundAckRequired;
    const acked = this.roundAcked;
    if (!required || !acked) {
      return null;
    }
    const seatIdx = this.seats.findIndex(
      (s) => s?.kind === "human" && s.connectionId === connectionId,
    );
    if (seatIdx === -1) return "You are not seated";
    if (!required.has(seatIdx)) {
      return "You did not take part in that round";
    }
    if (acked.has(seatIdx)) {
      return null;
    }
    acked.add(seatIdx);
    this.tryFinishRoundAckBarrier();
    return null;
  }

  broadcast(): void {
    const snap = this.snapshot();
    const payload = JSON.stringify({ type: "room_state", state: snap });
    for (const [, send] of this.connections) {
      send(payload);
    }
    this.maybeAutoDealForBotDealer();
  }

  /** If the next dealer is a bot, start the hand here (no human presses Deal). */
  maybeAutoDealForBotDealer(): void {
    if (this.activeHand) return;
    if (this.phase !== "idle") return;
    if (this.roundAckWaiting()) return;
    const dealerSeat = this.peekNextDealerSeat();
    if (dealerSeat === null) return;
    const seat = this.seats[dealerSeat];
    if (!seat || seat.kind !== "bot") return;
    const err = this.startHand();
    if (err) return;
    this.broadcast();
    this.advanceAnteOrFinish();
    this.broadcast();
  }

  snapshot(): RoomSnapshot {
    const seatSnaps: (SeatSnapshot | null)[] = this.seats.map((s) =>
      s
        ? {
            kind: s.kind,
            displayName: s.displayName,
            coins: s.coins,
            connectionId: s.connectionId,
          }
        : null,
    );

    const hands: PlayerHandSnapshot[] = [];
    if (this.activeHand) {
      const revealAll =
        this.activeHand.phase === "reveal" ||
        this.activeHand.phase === "showdown";
      for (const seat of this.activeHand.handSeats) {
        const c = this.activeHand.cards.get(seat);
        if (!c) continue;
        const cards = [
          { card: c.public[0]!, faceUp: true },
          { card: c.public[1]!, faceUp: true },
          { card: c.private[0]!, faceUp: revealAll },
          { card: c.private[1]!, faceUp: revealAll },
        ];
        const score =
          this.activeHand.phase === "showdown" && c.inRound
            ? scoreHand([
                c.public[0]!,
                c.public[1]!,
                c.private[0]!,
                c.private[1]!,
              ])
            : null;
        hands.push({
          seatIndex: seat,
          cards,
          inRound: c.inRound,
          foldedAnte:
            this.activeHand.phase === "ante" ? c.foldedAnte : undefined,
          score,
        });
      }
    }

    return {
      protocolVersion: PROTOCOL_VERSION,
      roomCode: this.code,
      hostConnectionId: this.hostConnectionId,
      seats: seatSnaps,
      dealerSeat: this.activeHand?.dealerSeat ?? null,
      blindSeat: this.activeHand?.blindSeat ?? null,
      phase: this.phase,
      pot: this.activeHand?.pot ?? 0,
      handSeats: this.activeHand?.handSeats ?? [],
      actionSeat: this.getActionSeat(),
      nextDealerSeat: !this.activeHand ? this.peekNextDealerSeat() : null,
      hands,
      showdownHands: this.showdownHands,
      lastMessage: this.lastMessage,
      roundResultPending: this.roundAckWaiting(),
      roundResultRequiredSeats: this.roundAckRequired
        ? [...this.roundAckRequired].sort((a, b) => a - b)
        : [],
      roundResultAckedSeats: this.roundAcked
        ? [...this.roundAcked].sort((a, b) => a - b)
        : [],
    };
  }

  getActionSeat(): number | null {
    return null;
  }

  /** Non-blind player still deciding fold vs enter (not yet acted). */
  private isAntePending(hand: ActiveHand, seat: number): boolean {
    if (seat === hand.blindSeat) return false;
    const sc = hand.cards.get(seat);
    if (!sc) return false;
    return !sc.inRound && !sc.foldedAnte;
  }

  private allAnteDecided(hand: ActiveHand): boolean {
    return hand.anteOrder.every((seat) => {
      const sc = hand.cards.get(seat);
      return sc && (sc.inRound || sc.foldedAnte);
    });
  }

  isHost(connectionId: string): boolean {
    return this.hostConnectionId === connectionId;
  }

  /** Display names of seated humans, in seat order (for lobby list). */
  humanSeatDisplayNames(): string[] {
    const names: string[] = [];
    for (const s of this.seats) {
      if (s?.kind === "human") names.push(s.displayName);
    }
    return names;
  }

  /** Seat index that will be dealer for the next hand, or null if play cannot start. */
  peekNextDealerSeat(): number | null {
    const handSeats: number[] = [];
    for (let i = 0; i < MAX_SEATS; i++) {
      const s = this.seats[i];
      if (s && s.coins >= 1) handSeats.push(i);
    }
    if (handSeats.length < 2) return null;
    return nextDealer(handSeats, this.lastDealerSeat);
  }

  /** Between hands: only the human seated at the next dealer seat may deal (never a bot seat). */
  canDeal(connectionId: string): boolean {
    if (this.activeHand) return false;
    if (this.roundAckWaiting()) return false;
    const dealerSeat = this.peekNextDealerSeat();
    if (dealerSeat === null) return false;
    const seat = this.seats[dealerSeat];
    if (!seat || seat.kind === "bot") return false;
    return seat.connectionId === connectionId;
  }

  handleMessage(connectionId: string, raw: unknown): string | null {
    let msg: ClientMessage;
    try {
      msg = raw as ClientMessage;
      if (!msg || typeof msg !== "object" || !("type" in msg)) {
        return "Invalid message";
      }
    } catch {
      return "Invalid JSON";
    }

    switch (msg.type) {
      case "hello":
        return null;
      case "claim_seat": {
        const err = this.claimSeat(connectionId, msg.seatIndex, msg.displayName);
        if (err) return err;
        this.broadcast();
        return null;
      }
      case "release_seat": {
        this.releaseSeat(connectionId);
        this.broadcast();
        return null;
      }
      case "set_bot": {
        if (!this.isHost(connectionId)) return "Only host can add bots";
        const err = this.setBot(msg.seatIndex, msg.enabled);
        if (err) return err;
        this.broadcast();
        this.advanceAnteOrFinish();
        this.broadcast();
        return null;
      }
      case "start_hand": {
        if (!this.canDeal(connectionId)) return "Only the dealer can deal";
        const err = this.startHand();
        if (err) return err;
        this.broadcast();
        this.advanceAnteOrFinish();
        this.broadcast();
        return null;
      }
      case "hand_action": {
        const err = this.applyHandAction(connectionId, msg.action);
        if (err) return err;
        this.broadcast();
        this.advanceAnteOrFinish();
        this.broadcast();
        return null;
      }
      case "ack_round_result": {
        const err = this.ackRoundResult(connectionId);
        if (err) return err;
        this.broadcast();
        return null;
      }
      default:
        return "Unknown message type";
    }
  }

  claimSeat(
    connectionId: string,
    seatIndex: number,
    displayName?: string,
  ): string | null {
    if (seatIndex < 0 || seatIndex >= MAX_SEATS) return "Invalid seat";
    if (this.seats[seatIndex]) return "Seat taken";
    const existing = this.seats.findIndex(
      (s) => s?.kind === "human" && s.connectionId === connectionId,
    );
    if (existing !== -1) return "Already seated";
    this.seats[seatIndex] = {
      kind: "human",
      displayName: displayName?.trim() || "Player",
      coins: STARTING_COINS,
      connectionId,
    };
    return null;
  }

  releaseSeat(connectionId: string): void {
    const idx = this.seats.findIndex(
      (s) => s?.kind === "human" && s.connectionId === connectionId,
    );
    if (idx === -1) return;

    this.waiveAckForSeatIfWaiting(idx);

    if (this.activeHand) {
      const hand = this.activeHand;
      this.lastMessage = "Hand aborted: player left.";
      this.activeHand = null;
      this.phase = "idle";
      this.showdownHands = null;
      this.beginRoundAck(hand, { excludeSeat: idx });
    }
    this.seats[idx] = null;
  }

  setBot(seatIndex: number, enabled: boolean): string | null {
    if (seatIndex < 0 || seatIndex >= MAX_SEATS) return "Invalid seat";
    if (enabled) {
      if (this.seats[seatIndex]) return "Seat not empty";
      this.seats[seatIndex] = {
        kind: "bot",
        displayName: `Bot ${seatIndex + 1}`,
        coins: STARTING_COINS,
        connectionId: null,
      };
    } else {
      const s = this.seats[seatIndex];
      if (!s || s.kind !== "bot") return "No bot there";
      if (this.activeHand) {
        const hand = this.activeHand;
        this.lastMessage = "Hand aborted: bot removed.";
        this.activeHand = null;
        this.phase = "idle";
        this.showdownHands = null;
        this.beginRoundAck(hand);
      }
      this.seats[seatIndex] = null;
    }
    return null;
  }

  startHand(): string | null {
    if (this.activeHand) return "Hand already running";
    if (this.roundAckWaiting()) {
      return "Wait until every player has acknowledged the last round.";
    }
    this.showdownHands = null;
    const handSeats: number[] = [];
    for (let i = 0; i < MAX_SEATS; i++) {
      const s = this.seats[i];
      if (s && s.coins >= 1) handSeats.push(i);
    }
    if (handSeats.length < 2) return "Need at least 2 players with 1+ coin";

    const dealerSeat = nextDealer(handSeats, this.lastDealerSeat);
    const blindSeat = blindForDealer(handSeats, dealerSeat);
    this.lastDealerSeat = dealerSeat;

    const deck = shuffle(createDeck());
    let k = 0;
    const cards = new Map<number, SeatCards>();
    for (const seat of handSeats) {
      const pub: [Card, Card] = [deck[k++]!, deck[k++]!];
      const priv: [Card, Card] = [deck[k++]!, deck[k++]!];
      cards.set(seat, {
        public: pub,
        private: priv,
        inRound: false,
        foldedAnte: false,
      });
    }

    const blindSeatData = this.seats[blindSeat];
    if (!blindSeatData || blindSeatData.coins < 1)
      return "Blind seat cannot pay";

    blindSeatData.coins -= 1;
    const blindCards = cards.get(blindSeat)!;
    blindCards.inRound = true;

    const anteOrder = nextCircularActors(handSeats, blindSeat);

    this.activeHand = {
      dealerSeat,
      blindSeat,
      handSeats,
      anteOrder,
      cards,
      pot: 1,
      phase: "ante",
    };
    this.phase = "ante";
    this.lastMessage = `Hand started. Dealer seat ${dealerSeat + 1}, blind seat ${blindSeat + 1}.`;

    return null;
  }

  applyHandAction(
    connectionId: string,
    action: "fold" | "enter",
  ): string | null {
    if (!this.activeHand || this.activeHand.phase !== "ante") {
      return "No action expected";
    }
    const hand = this.activeHand;
    const seat = this.seats.findIndex(
      (s) => s?.kind === "human" && s.connectionId === connectionId,
    );
    if (seat === -1) return "Not seated";
    if (!hand.anteOrder.includes(seat)) return "Not in this ante";
    const seatData = this.seats[seat];
    if (!seatData || seatData.kind !== "human") return "Not your seat to act";
    if (!this.isAntePending(hand, seat)) return "Already acted";
    return this.resolveAnteForSeat(seat, action);
  }

  resolveAnteForSeat(seat: number, action: "fold" | "enter"): string | null {
    const hand = this.activeHand;
    if (!hand || hand.phase !== "ante") return "Invalid state";
    if (seat === hand.blindSeat) return "Blind is automatic";
    if (!hand.anteOrder.includes(seat)) return "Not in this ante";
    if (!this.isAntePending(hand, seat)) return "Already acted";

    const data = this.seats[seat];
    const sc = hand.cards.get(seat);
    if (!data || !sc) return "No cards";

    if (action === "fold") {
      sc.inRound = false;
      sc.foldedAnte = true;
    } else {
      if (data.coins < 1) return "Cannot enter: no coins";
      data.coins -= 1;
      sc.inRound = true;
      sc.foldedAnte = false;
      hand.pot += 1;
    }
    return null;
  }

  advanceAnteOrFinish(): void {
    const hand = this.activeHand;
    if (!hand || hand.phase !== "ante") return;

    const ctx = { blindSeat: hand.blindSeat, handSeats: hand.handSeats };
    for (const nextSeat of hand.anteOrder) {
      const sd = this.seats[nextSeat];
      if (sd?.kind !== "bot") continue;
      const pending = this.isAntePending(hand, nextSeat);
      const choice = pickRandomAnteAction(ctx, nextSeat, pending);
      if (!choice) continue;
      const err = this.resolveAnteForSeat(nextSeat, choice);
      if (err) break;
    }

    if (this.allAnteDecided(hand)) {
      hand.phase = "reveal";
      this.phase = "reveal";
      this.finishShowdown();
    }
  }

  finishShowdown(): void {
    const hand = this.activeHand;
    if (!hand) return;
    hand.phase = "showdown";
    this.phase = "showdown";

    const revealSnapshots: PlayerHandSnapshot[] = [];
    for (const seat of hand.handSeats) {
      const c = hand.cards.get(seat);
      if (!c) continue;
      const cards = [
        { card: c.public[0]!, faceUp: true },
        { card: c.public[1]!, faceUp: true },
        { card: c.private[0]!, faceUp: true },
        { card: c.private[1]!, faceUp: true },
      ];
      const score = c.inRound
        ? scoreHand([c.public[0]!, c.public[1]!, c.private[0]!, c.private[1]!])
        : null;
      revealSnapshots.push({
        seatIndex: seat,
        cards,
        inRound: c.inRound,
        foldedAnte: c.foldedAnte ? true : undefined,
        score,
      });
    }
    this.showdownHands = revealSnapshots;

    const contenders: { seat: number; score: number }[] = [];
    for (const seat of hand.handSeats) {
      const sc = hand.cards.get(seat);
      if (!sc || !sc.inRound) continue;
      const all: Card[] = [
        ...sc.public,
        ...sc.private,
      ];
      contenders.push({ seat, score: scoreHand(all) });
    }

    if (contenders.length === 0) {
      this.lastMessage = "No players entered the showdown.";
      this.beginRoundAck(hand);
      this.activeHand = null;
      this.phase = "idle";
      return;
    }

    const best = Math.max(...contenders.map((c) => c.score));
    const winners = contenders.filter((c) => c.score === best);
    const pot = hand.pot;
    const base = Math.floor(pot / winners.length);
    let remainder = pot - base * winners.length;

    const sortedWinners = [...winners].sort((a, b) => a.seat - b.seat);
    const winnerNames = sortedWinners.map((w) => this.seats[w.seat]?.displayName);
    for (const w of sortedWinners) {
      const add = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      const pl = this.seats[w.seat];
      if (pl) pl.coins += add;
    }

    this.lastMessage = `Showdown: winner is ${winnerNames.join(", ")} with ${best} pts. Pot ${pot} is taken.`;
    this.beginRoundAck(hand);
    this.activeHand = null;
    this.phase = "idle";
  }
}
