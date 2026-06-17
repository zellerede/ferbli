import type { Card, HandScore, Rank, Suit } from "@ferbli/protocol";

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

/** Ace (high) = 8 … seven = 1 — for kicker ordering and tier sub-scores. */
export function rankStrength(rank: Rank): number {
  return RANKS.indexOf(rank) === -1 ? 0 : 8 - RANKS.indexOf(rank);
}

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

function suitIndex(suit: Suit): number {
  return SUITS.indexOf(suit);
}

/** Sort cards best-first for high-card / kicker chains. */
function sortCardsForKicker(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const dp = cardPoints(b) - cardPoints(a);
    if (dp !== 0) return dp;
    return rankStrength(b.rank) - rankStrength(a.rank);
  });
}

type SuitCombo = {
  count: 2 | 3 | 4;
  sum: number;
  suitedCards: Card[];
  suit: Suit;
};

function betterSuitCombo(next: SuitCombo, cur: SuitCombo | null): boolean {
  if (cur === null) return true;
  if (next.sum !== cur.sum) return next.sum > cur.sum;
  if (next.count !== cur.count) return next.count > cur.count;
  const rankKey = (pick: Card[]) =>
    [...pick]
      .sort((a, b) => rankStrength(b.rank) - rankStrength(a.rank))
      .map((c) => rankStrength(c.rank))
      .join(",");
  const nk = rankKey(next.suitedCards);
  const ck = rankKey(cur.suitedCards);
  if (nk !== ck) return nk > ck;
  return suitIndex(next.suit) > suitIndex(cur.suit);
}

/** Best same-suit subset (2–4 cards) by point sum, with sensible tie-breaks. */
function bestSameSuitCombination(cards: Card[]): SuitCombo | null {
  let best: SuitCombo | null = null;
  for (const suit of SUITS) {
    const suited = cards.filter((c) => c.suit === suit);
    for (const k of [4, 3, 2] as const) {
      if (suited.length < k) continue;
      const sorted = sortCardsForKicker(suited);
      const pick = sorted.slice(0, k);
      const sum = pick.reduce((s, c) => s + cardPoints(c), 0);
      const candidate: SuitCombo = {
        count: k,
        sum,
        suitedCards: pick,
        suit,
      };
      if (betterSuitCombo(candidate, best)) best = candidate;
    }
  }
  return best;
}

/**
 * Lexicographic tier index (higher beats lower).
 * Order: high-card (one-suite-1), one-suite-2, ace-pair, one-suite-3, triplet,
 * one-suite-4, quadruplet — while `figure` on the wire stays `"one-suite"` /
 * `"high-card"` for display.
 */
export function handScoreTier(h: HandScore): number {
  switch (h.figure) {
    case "high-card":
      return 0;
    case "one-suite": {
      const s = h.suiteSize;
      if (s === 2) return 1;
      if (s === 3) return 3;
      if (s === 4) return 5;
      return 1;
    }
    case "ace-pair":
      return 2;
    case "triplet":
      return 4;
    case "quadruplet":
      return 6;
    default:
      return 0;
  }
}

/** Winning patterns from the same deal: compare tier then display score only. */
function compareSameHandCandidates(a: HandScore, b: HandScore): number {
  const ta = handScoreTier(a);
  const tb = handScoreTier(b);
  if (ta !== tb) return ta - tb;
  return a.score - b.score;
}

/**
 * Compare two hands from their cards (any length supported by `scoreHand`).
 * Uses pattern tier then display `score` only; same tier and score returns `0`
 * (no kicker / multiset tie-break).
 */
export function compareHands(a: Card[], b: Card[]): number {
  const ha = resolveWinningHandScore(a);
  const hb = resolveWinningHandScore(b);
  const ta = handScoreTier(ha);
  const tb = handScoreTier(hb);
  if (ta !== tb) return ta - tb;
  return ha.score - hb.score;
}

/** Three same rank on three different suits (32-card deck). */
function tripletCandidate(cards: Card[]): HandScore | null {
  if (cards.length < 3) return null;
  const byRank = new Map<Rank, Card[]>();
  for (const c of cards) {
    const arr = byRank.get(c.rank) ?? [];
    arr.push(c);
    byRank.set(c.rank, arr);
  }
  let best: HandScore | null = null;
  for (const [_rank, group] of byRank) {
    if (group.length < 3) continue;
    const suits = new Set(group.map((c) => c.suit));
    if (suits.size < 3) continue;
    const sortedG = sortCardsForKicker(group);
    const pickThree: Card[] = [];
    const seenS = new Set<Suit>();
    for (const c of sortedG) {
      if (seenS.has(c.suit)) continue;
      seenS.add(c.suit);
      pickThree.push(c);
      if (pickThree.length === 3) break;
    }
    if (pickThree.length !== 3) continue;
    const sample = pickThree[0]!;
    const candidate: HandScore = {
      figure: "triplet",
      score: 3 * cardPoints(sample),
    };
    if (!best || compareSameHandCandidates(candidate, best) > 0) best = candidate;
  }
  return best;
}

function quadrupletCandidate(cards: Card[]): HandScore | null {
  if (cards.length !== 4) return null;
  const r0 = cards[0]!.rank;
  if (!cards.every((c) => c.rank === r0)) return null;
  const sample = cards[0]!;
  return {
    figure: "quadruplet",
    score: 4 * cardPoints(sample),
  };
}

function acePairScore(cards: Card[]): number | null {
  const aces = cards.filter((c) => c.rank === "ace");
  if (aces.length !== 2) return null;
  const others = cards.filter((c) => c.rank !== "ace");
  const sorted = sortCardsForKicker(others);
  const k1 = sorted[0] ? cardPoints(sorted[0]!) : 0;
  const k2 = sorted[1] ? cardPoints(sorted[1]!) : 0;
  const r1 = sorted[0] ? rankStrength(sorted[0]!.rank) : 0;
  const r2 = sorted[1] ? rankStrength(sorted[1]!.rank) : 0;
  const s1 = sorted[0] ? suitIndex(sorted[0]!.suit) : 0;
  const s2 = sorted[1] ? suitIndex(sorted[1]!.suit) : 0;
  return (
    15_000_000 +
    k1 * 10_000 +
    k2 * 500 +
    r1 * 50 +
    r2 * 7 +
    s1 * 3 +
    s2
  );
}

function acePairCandidate(cards: Card[]): HandScore | null {
  if (acePairScore(cards) === null) return null;
  return {
    figure: "ace-pair",
    score: 22,
  };
}

function highCardCandidate(cards: Card[]): HandScore {
  const sorted = sortCardsForKicker(cards);
  const top = sorted[0]!;
  return {
    figure: "high-card",
    score: cardPoints(top),
  };
}

/**
 * Best display hand for `cards`. To decide a winner between two seats, use
 * `compareHands` on their card lists (not `HandScore` alone).
 */
function resolveWinningHandScore(cards: Card[]): HandScore {
  if (cards.length === 0) {
    return { figure: "high-card", score: 0 };
  }

  const candidates: HandScore[] = [];

  const quad = quadrupletCandidate(cards);
  if (quad) candidates.push(quad);

  const trip = tripletCandidate(cards);
  if (trip) candidates.push(trip);

  const suitCombo = bestSameSuitCombination(cards);
  if (suitCombo) {
    candidates.push({
      figure: "one-suite",
      score: suitCombo.sum,
      suiteSize: suitCombo.count,
    });
  }

  const aces = acePairCandidate(cards);
  if (aces) candidates.push(aces);

  candidates.push(highCardCandidate(cards));

  return candidates.reduce((a, b) =>
    compareSameHandCandidates(b, a) > 0 ? b : a,
  );
}

export function scoreHand(cards: Card[]): HandScore {
  return resolveWinningHandScore(cards);
}

export type AnteAction = "fold" | "enter";

export type AnteContext = {
  blindSeat: number;
  /** Seats dealt into this hand (includes blind). */
  handSeats: number[];
};

/**
 * Legal ante actions for a seat. Blind never chooses here (forced enter).
 * @param antePending — true if this seat has not yet chosen fold or enter.
 */
export function legalAnteActions(
  ctx: AnteContext,
  seatIndex: number,
  antePending: boolean,
): AnteAction[] {
  if (!antePending) return [];
  if (seatIndex === ctx.blindSeat) return [];
  if (!ctx.handSeats.includes(seatIndex)) return [];
  return ["fold", "enter"];
}

export function pickRandomAnteAction(
  ctx: AnteContext,
  seatIndex: number,
  antePending: boolean,
  random: () => number = Math.random,
): AnteAction | null {
  const legal = legalAnteActions(ctx, seatIndex, antePending);
  if (legal.length === 0) return null;
  return legal[Math.floor(random() * legal.length)]!;
}
