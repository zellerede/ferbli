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

function suiteComboStrength(combo: SuitCombo, allCards: Card[]): number {
  const base = combo.count >= 3 ? 40_000_000 : 30_000_000;
  const used = new Set(combo.suitedCards.map((c) => `${c.suit}:${c.rank}`));
  const rest = allCards.filter((c) => !used.has(`${c.suit}:${c.rank}`));
  const kickerPart = encodeHighCard(rest);
  return base + combo.sum * 100_000 + (kickerPart - 10_000_000);
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
    const strength =
      50_000_000 + rs * 100_000 + kp * 500 + ks * 10 + kr;
    const sample = pickThree[0]!;
    const candidate: HandScore = {
      figure: "triplet",
      score: 3 * cardPoints(sample),
      strength,
    };
    if (!best || candidate.strength > best.strength) best = candidate;
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
    strength: 60_000_000 + rankStrength(r0) * 100_000,
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
  const raw = acePairScore(cards);
  if (raw === null) return null;
  return {
    figure: "ace-pair",
    score: 22,
    strength: 38_000_000 + (raw - 15_000_000),
  };
}

function highCardCandidate(cards: Card[]): HandScore {
  const sorted = sortCardsForKicker(cards);
  const top = sorted[0]!;
  return {
    figure: "high-card",
    score: cardPoints(top),
    strength: encodeHighCard(cards),
  };
}

/**
 * Best hand pattern and a small display `score`, plus `strength` for strict ordering.
 *
 * Ordering (highest wins first): quadruplet → triplet → one-suite (3–4 cards in a
 * suit) → ace-pair → one-suite (2 cards in a suit) → high-card.
 *
 * Display `score` by figure: high-card = highest card points; one-suite = sum of
 * that suit run; ace-pair = 22; triplet = 3× card points of the rank; quadruplet =
 * 4× card points of the rank.
 */
export function scoreHand(cards: Card[]): HandScore {
  if (cards.length === 0) {
    return { figure: "high-card", score: 0, strength: 0 };
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
      strength: suiteComboStrength(suitCombo, cards),
    });
  }

  const aces = acePairCandidate(cards);
  if (aces) candidates.push(aces);

  candidates.push(highCardCandidate(cards));

  return candidates.reduce((a, b) => (b.strength > a.strength ? b : a));
}

/** Positive if `a` beats `b` (same strength = tie). */
export function compareHandScores(a: HandScore, b: HandScore): number {
  return a.strength - b.strength;
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
