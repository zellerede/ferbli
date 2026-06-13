/** Wire format version for client/server compatibility. */
export const PROTOCOL_VERSION = 4;

/** Max seats at the table (humans + bots). */
export const MAX_SEATS = 6;

/** Sprite sheet layout: 8 columns (ranks), 4 rows (suits). */
export const SPRITE_COLS = 8;
export const SPRITE_ROWS = 4;

export type Suit = "hearts" | "bells" | "leaves" | "acorns";

export type Rank =
  | "ace"
  | "king"
  | "ober"
  | "unter"
  | "ten"
  | "nine"
  | "eight"
  | "seven";

export type Card = {
  suit: Suit;
  rank: Rank;
};

export type SeatKind = "human" | "bot";

export type SeatSnapshot = {
  kind: SeatKind;
  displayName: string;
  /** Coins remaining (server authoritative). */
  coins: number;
  /** Connection id if human and currently connected; null otherwise. */
  connectionId: string | null;
};

export type HandPhase =
  | "idle"
  | "ante"
  | "reveal"
  | "showdown"
  | "payout";

export type CardSlot = {
  card: Card;
  /** During reveal/showdown, private cards become visible to everyone. */
  faceUp: boolean;
};

export type PlayerHandSnapshot = {
  seatIndex: number;
  /** Up to 4 cards: first two usually public during ante. */
  cards: CardSlot[];
  /** Still competing for the pot after ante. */
  inRound: boolean;
  /** During ante: true if folded; false while deciding or after entering (see also inRound). */
  foldedAnte?: boolean;
  /** Shown after showdown for in-round players. */
  score: number | null;
};

/** One row for the lobby browser (open rooms). */
export type LobbyRoomSummary = {
  roomCode: string;
  /** Seated humans in seat order (left to right). */
  humanNames: string[];
};

export type RoomSnapshot = {
  protocolVersion: typeof PROTOCOL_VERSION;
  roomCode: string;
  /** Connection id of the host (room admin; e.g. add/remove bots). */
  hostConnectionId: string | null;
  seats: (SeatSnapshot | null)[];
  /** Dealer seat index for current / last hand. */
  dealerSeat: number | null;
  /** Blind seat pays and is forced in for the current hand. */
  blindSeat: number | null;
  phase: HandPhase;
  pot: number;
  /** Seat indices participating in the current hand (had enough coins at start). */
  handSeats: number[];
  /**
   * Reserved for turn-based phases. During ante, decisions are parallel
   * (every non-blind player when ready), so this is always null.
   */
  actionSeat: number | null;
  /** Between hands (no activeHand): seat that will deal next; null if fewer than two players with coins. */
  nextDealerSeat: number | null;
  hands: PlayerHandSnapshot[];
  /** After a hand completes, all cards face-up until the next hand starts. */
  showdownHands: PlayerHandSnapshot[] | null;
  /** Last hand result message for UI. */
  lastMessage: string | null;
  /**
   * When true, the next hand must not start until every seat in
   * `roundResultRequiredSeats` has sent `ack_round_result` (then appears in
   * `roundResultAckedSeats`). Bots never appear in these lists.
   */
  roundResultPending: boolean;
  /** Human seats that must acknowledge before the next deal (subset of last `handSeats`). */
  roundResultRequiredSeats: number[];
  /** Human seats that have already acknowledged for this barrier. */
  roundResultAckedSeats: number[];
};

export type ClientMessage =
  | { type: "hello"; protocolVersion: number }
  | { type: "list_rooms" }
  | { type: "create_room"; displayName: string }
  | { type: "join_room"; roomCode: string; displayName: string }
  | { type: "leave_room" }
  | { type: "claim_seat"; seatIndex: number; displayName?: string }
  | { type: "release_seat" }
  | { type: "set_bot"; seatIndex: number; enabled: boolean }
  | { type: "start_hand" }
  | { type: "hand_action"; action: "fold" | "enter" }
  | { type: "ack_round_result" };

export type ServerMessage =
  | { type: "welcome"; connectionId: string }
  | { type: "error"; message: string }
  | { type: "room_list"; rooms: LobbyRoomSummary[] }
  | { type: "room_state"; state: RoomSnapshot };
