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

/** Ace (high) = 8 … seven = 1 — for tiebreaks and tier sub-scores. */
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

function bestSameSuitSum(cards: Card[]): number {
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
  return best;
}

function encodeHighCard(cards: Card[]): number {
  const sorted = sortCardsForKicker(cards);
  const pts = sorted.map(cardPoints);
  while (pts.length < 4) pts.push(0);
  const [a, b, c, d] = pts;
  const rs = sorted.map((x) => rankStrength(x.rank));
  const [ra, rb, rc, rd] = [
    rs[0] ?? 0,
    rs[1] ?? 0,
    rs[2] ?? 0,
    rs[3] ?? 0,
  ];
  return (
    10_000_000 +
    a * 100_000 +
    b * 5_000 +
    c * 200 +
    d * 10 +
    ra * 7 +
    rb * 5 +
    rc * 3 +
    rd
  );
}

/** Best triple-by-rank: three same rank on three different suits (32-card deck). */
function bestTripleRankScore(cards: Card[]): number | null {
  if (cards.length < 3) return null;
  const byRank = new Map<Rank, Card[]>();
  for (const c of cards) {
    const arr = byRank.get(c.rank) ?? [];
    arr.push(c);
    byRank.set(c.rank, arr);
  }
  let best: number | null = null;
  for (const [rank, group] of byRank) {
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
    const used = new Set(pickThree.map((c) => `${c.suit}:${c.rank}`));
    const kickers = cards.filter((c) => !used.has(`${c.suit}:${c.rank}`));
    const kickerCard =
      kickers.length > 0 ? sortCardsForKicker(kickers)[0]! : null;
    const rs = rankStrength(rank);
    const kp = kickerCard ? cardPoints(kickerCard) : 0;
    const ks = kickerCard ? suitIndex(kickerCard.suit) : 0;
    const kr = kickerCard ? rankStrength(kickerCard.rank) : 0;
    const score =
      40_000_000 +
      rs * 100_000 +
      kp * 500 +
      ks * 10 +
      kr;
    if (best === null || score > best) best = score;
  }
  return best;
}

function quadRankScore(cards: Card[]): number | null {
  if (cards.length !== 4) return null;
  const r0 = cards[0]!.rank;
  if (cards.every((c) => c.rank === r0)) {
    return 50_000_000 + rankStrength(r0) * 100_000;
  }
  return null;
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

/**
 * Comparable hand strength (higher wins).
 *
 * Tiers (see tests in score-hand.test.ts):
 * - **50M+** Four of a kind (same rank, four suits).
 * - **40M+** Three of a kind by rank on three different suits + kicker.
 * - **25M+** Best same-suit sum (2–4 cards), legacy point sums (typically 14–41).
 * - **15M+** Exactly two aces by rank + kickers (only rank-pair that counts).
 * - **10M+** High card / kickers when no higher pattern applies.
 */
export function scoreHand(cards: Card[]): number {
  if (cards.length === 0) return 0;

  const quad = quadRankScore(cards);
  if (quad !== null) return quad;

  const tripleRank = bestTripleRankScore(cards);
  const suitSum = bestSameSuitSum(cards);
  const suitTier = suitSum > 0 ? 25_000_000 + suitSum : 0;

  if (tripleRank !== null && tripleRank > suitTier) return tripleRank;
  if (suitTier > 0) return suitTier;

  const aces = acePairScore(cards);
  if (aces !== null) return aces;

  return encodeHighCard(cards);
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
