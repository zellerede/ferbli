import type { Card, Rank, Suit } from "@ferbli/protocol";

const SUITS: Suit[] = ["hearts", "bells", "leaves", "acorns"];
const RANKS: Rank[] = [
  "ace",
  "king",
  "ober",
  "unter",
  "ten",
  "nine",
  "eight",
  "seven",
];

/** Row index in the 8×4 sprite (0 = hearts … 3 = acorns). */
export function suitSpriteRow(suit: Suit): number {
  return SUITS.indexOf(suit);
}

/** Column index in the 8×4 sprite (0 = ace … 7 = seven). */
export function rankSpriteCol(rank: Rank): number {
  return RANKS.indexOf(rank);
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** Fisher–Yates shuffle in place; returns the same array for chaining. */
export function shuffle<T>(arr: T[], random: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function cardPoints(card: Card): number {
  switch (card.rank) {
    case "ace":
      return 11;
    case "seven":
      return 7;
    case "eight":
      return 8;
    case "nine":
      return 9;
    case "ten":
      return 10;
    case "king":
    case "ober":
    case "unter":
      return 10;
  }
}

/**
 * Best hand score:
 * - **Four cards, four suits:** highest single-card point value.
 * - **Otherwise:** best sum from **2–4 cards of the same suit** (per suit, then max
 *   across suits). If no suit has at least two cards, the score is the **high card**
 * — `max(cardPoints)` (never below **7** for a non-empty hand in this deck).
 */
export function scoreHand(cards: Card[]): number {
  if (cards.length === 0) return 0;

  if (cards.length === 4) {
    const suits = new Set(cards.map((c) => c.suit));
    if (suits.size === 4) {
      return Math.max(...cards.map(cardPoints));
    }
  }

  const bySuit = new Map<Suit, Card[]>();
  for (const s of SUITS) bySuit.set(s, []);
  for (const c of cards) {
    bySuit.get(c.suit)!.push(c);
  }
  let best = 0;
  for (const [, suited] of bySuit) {
    if (suited.length < 2) continue;
    const values = suited.map(cardPoints).sort((a, b) => b - a);
    for (const k of [4, 3, 2] as const) {
      if (values.length >= k) {
        let sum = 0;
        for (let i = 0; i < k; i++) sum += values[i]!;
        if (sum > best) best = sum;
      }
    }
  }
  if (best > 0) return best;
  return Math.max(...cards.map(cardPoints));
}

export type AnteAction = "fold" | "enter";

export type AnteContext = {
  /** Seat index whose turn it is (not the blind during their auto-enter). */
  actionSeat: number;
  blindSeat: number;
  /** Seats still in hand at ante (ordered). */
  handSeats: number[];
};

/**
 * Legal ante actions for a seat. Blind never chooses here (forced enter).
 */
export function legalAnteActions(
  ctx: AnteContext,
  seatIndex: number,
): AnteAction[] {
  if (ctx.actionSeat !== seatIndex) return [];
  if (seatIndex === ctx.blindSeat) return [];
  return ["fold", "enter"];
}

export function pickRandomAnteAction(
  ctx: AnteContext,
  seatIndex: number,
  random: () => number = Math.random,
): AnteAction | null {
  const legal = legalAnteActions(ctx, seatIndex);
  if (legal.length === 0) return null;
  return legal[Math.floor(random() * legal.length)]!;
}
