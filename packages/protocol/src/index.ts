/** Wire format version for client/server compatibility. */
export const PROTOCOL_VERSION = 1;

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
  /** During ante: set once the player chose to fold (vs still deciding / not reached yet). */
  foldedAnte?: boolean;
  /** Shown after showdown for in-round players. */
  score: number | null;
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
  /** Whose turn to fold/enter (null if not applicable). */
  actionSeat: number | null;
  /** Between hands (no activeHand): seat that will deal next; null if fewer than two players with coins. */
  nextDealerSeat: number | null;
  hands: PlayerHandSnapshot[];
  /** After a hand completes, all cards face-up until the next hand starts. */
  showdownHands: PlayerHandSnapshot[] | null;
  /** Last hand result message for UI. */
  lastMessage: string | null;
};

export type ClientMessage =
  | { type: "hello"; protocolVersion: number }
  | { type: "create_room"; displayName: string }
  | { type: "join_room"; roomCode: string; displayName: string }
  | { type: "leave_room" }
  | { type: "claim_seat"; seatIndex: number; displayName?: string }
  | { type: "release_seat" }
  | { type: "set_bot"; seatIndex: number; enabled: boolean }
  | { type: "start_hand" }
  | { type: "hand_action"; action: "fold" | "enter" };

export type ServerMessage =
  | { type: "welcome"; connectionId: string }
  | { type: "error"; message: string }
  | { type: "room_state"; state: RoomSnapshot };
