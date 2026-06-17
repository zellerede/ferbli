import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Card } from "@ferbli/protocol";
import { compareHands, scoreHand } from "./index.js";

function card(suit: Card["suit"], rank: Card["rank"]): Card {
  return { suit, rank };
}

function beats(a: Card[], b: Card[]): boolean {
  return compareHands(a, b) > 0;
}

describe("scoreHand", () => {
  describe("four cards, four different suits (high card tier)", () => {
    it("ace high beats face cards and pips", () => {
      const hand: Card[] = [
        card("hearts", "ace"),
        card("bells", "king"),
        card("leaves", "nine"),
        card("acorns", "seven"),
      ];
      assert.deepEqual(scoreHand(hand), {
        figure: "high-card",
        score: 11,
      });
    });

    it("king high when ace is absent", () => {
      const hand: Card[] = [
        card("hearts", "king"),
        card("bells", "ten"),
        card("leaves", "nine"),
        card("acorns", "seven"),
      ];
      assert.deepEqual(scoreHand(hand), {
        figure: "high-card",
        score: 10,
      });
    });

    it("four sevens, one per suit: quadruplet (beats high card)", () => {
      const hand: Card[] = [
        card("hearts", "seven"),
        card("bells", "seven"),
        card("leaves", "seven"),
        card("acorns", "seven"),
      ];
      assert.deepEqual(scoreHand(hand), {
        figure: "quadruplet",
        score: 28,
      });
    });

    it("nine high when that beats sevens and eight", () => {
      const hand: Card[] = [
        card("hearts", "seven"),
        card("bells", "eight"),
        card("leaves", "nine"),
        card("acorns", "seven"),
      ];
      assert.deepEqual(scoreHand(hand), {
        figure: "high-card",
        score: 9,
      });
    });
  });

  describe("same-suit combinations (one-suite)", () => {
    it("three of one suit + off-suit: best triple (README-style)", () => {
      const hand: Card[] = [
        card("hearts", "ace"),
        card("hearts", "king"),
        card("hearts", "nine"),
        card("bells", "seven"),
      ];
      assert.deepEqual(scoreHand(hand), {
        figure: "one-suite",
        score: 30,
        suiteSize: 3,
      });
    });

    it("four of one suit: sum of all four point values", () => {
      const hand: Card[] = [
        card("hearts", "ace"),
        card("hearts", "king"),
        card("hearts", "ten"),
        card("hearts", "nine"),
      ];
      assert.deepEqual(scoreHand(hand), {
        figure: "one-suite",
        score: 40,
        suiteSize: 4,
      });
    });

    it("two + two by suit: pick the better pair sum", () => {
      const hand: Card[] = [
        card("hearts", "ace"),
        card("hearts", "seven"),
        card("bells", "king"),
        card("bells", "ten"),
      ];
      assert.deepEqual(scoreHand(hand), {
        figure: "one-suite",
        score: 20,
        suiteSize: 2,
      });
    });

    it("exactly two sharing a suit: only that pair counts", () => {
      const hand: Card[] = [
        card("hearts", "ober"),
        card("hearts", "unter"),
        card("bells", "ace"),
        card("leaves", "king"),
      ];
      assert.deepEqual(scoreHand(hand), {
        figure: "one-suite",
        score: 20,
        suiteSize: 2,
      });
    });
  });

  describe("rank-based patterns", () => {
    it("quadruplet beats any same-suit combination", () => {
      const quad = [
        card("hearts", "seven"),
        card("bells", "seven"),
        card("leaves", "seven"),
        card("acorns", "seven"),
      ];
      const suitBest = [
        card("hearts", "ace"),
        card("hearts", "king"),
        card("hearts", "nine"),
        card("bells", "seven"),
      ];
      assert.ok(beats(quad, suitBest));
    });

    it("triplet beats same-suit triple of equal point sum", () => {
      const tripleRank = [
        card("hearts", "king"),
        card("bells", "king"),
        card("leaves", "king"),
        card("acorns", "nine"),
      ];
      const suitTriple = [
        card("hearts", "ace"),
        card("hearts", "king"),
        card("hearts", "nine"),
        card("bells", "seven"),
      ];
      assert.ok(beats(tripleRank, suitTriple));
    });

    it("triplet beats four-suit high card", () => {
      const tripleRank = [
        card("hearts", "ten"),
        card("bells", "ten"),
        card("leaves", "ten"),
        card("acorns", "seven"),
      ];
      const highOnly = [
        card("hearts", "ace"),
        card("bells", "king"),
        card("leaves", "nine"),
        card("acorns", "seven"),
      ];
      assert.ok(beats(tripleRank, highOnly));
    });

    it("quadruplet beats triplet by rank", () => {
      const quad = [
        card("hearts", "seven"),
        card("bells", "seven"),
        card("leaves", "seven"),
        card("acorns", "seven"),
      ];
      const triple = [
        card("hearts", "king"),
        card("bells", "king"),
        card("leaves", "king"),
        card("acorns", "nine"),
      ];
      assert.ok(beats(quad, triple));
    });

    it("one-suite-4 beats triplet (tier order)", () => {
      const flush4 = [
        card("hearts", "ace"),
        card("hearts", "king"),
        card("hearts", "ten"),
        card("hearts", "nine"),
      ];
      const triple = [
        card("hearts", "king"),
        card("bells", "king"),
        card("leaves", "king"),
        card("acorns", "ace"),
      ];
      assert.ok(beats(flush4, triple));
    });

    it("ace-pair beats king-high four suits", () => {
      const aces = [
        card("hearts", "ace"),
        card("bells", "ace"),
        card("leaves", "king"),
        card("acorns", "nine"),
      ];
      const kingHigh = [
        card("hearts", "king"),
        card("bells", "ten"),
        card("leaves", "nine"),
        card("acorns", "seven"),
      ];
      assert.ok(beats(aces, kingHigh));
    });

    it("ace-pair beats any two-card one-suite", () => {
      const aces = [
        card("hearts", "ace"),
        card("bells", "ace"),
        card("leaves", "king"),
        card("acorns", "nine"),
      ];
      const suitPair = [
        card("hearts", "ace"),
        card("hearts", "seven"),
        card("bells", "king"),
        card("leaves", "nine"),
      ];
      assert.ok(beats(aces, suitPair));
    });

    it("ace-pair loses to three-card one-suite or better", () => {
      const aces = [
        card("hearts", "ace"),
        card("bells", "ace"),
        card("leaves", "king"),
        card("acorns", "nine"),
      ];
      const suitTriple = [
        card("hearts", "ace"),
        card("hearts", "king"),
        card("hearts", "nine"),
        card("bells", "seven"),
      ];
      assert.ok(beats(suitTriple, aces));
    });
  });

  describe("(hypothetical) fewer than four cards", () => {
    it("two cards, different suits: high-card is higher point value", () => {
      assert.deepEqual(
        scoreHand([card("hearts", "nine"), card("bells", "king")]),
        {
          figure: "high-card",
          score: 10,
        },
      );
    });

    it("three cards, three suits: ace high", () => {
      assert.deepEqual(
        scoreHand([
          card("hearts", "ace"),
          card("bells", "king"),
          card("leaves", "ten"),
        ]),
        {
          figure: "high-card",
          score: 11,
        },
      );
    });
  });
});

describe("compareHands", () => {
  it("ties high-card when display score matches (no kicker: king vs ober)", () => {
    const kingTop = [
      card("hearts", "king"),
      card("bells", "nine"),
      card("leaves", "eight"),
      card("acorns", "seven"),
    ];
    const oberTop = [
      card("hearts", "ober"),
      card("bells", "nine"),
      card("leaves", "eight"),
      card("acorns", "seven"),
    ];
    assert.deepEqual(scoreHand(kingTop), { figure: "high-card", score: 10 });
    assert.deepEqual(scoreHand(oberTop), { figure: "high-card", score: 10 });
    assert.equal(compareHands(kingTop, oberTop), 0);
    assert.equal(compareHands(oberTop, kingTop), 0);
    assert.equal(compareHands(kingTop, kingTop), 0);
  });

  it("ties ace-high when display score matches (no kicker)", () => {
    const strongSecond = [
      card("hearts", "ace"),
      card("bells", "king"),
      card("leaves", "nine"),
      card("acorns", "seven"),
    ];
    const weakSecond = [
      card("hearts", "ace"),
      card("bells", "ten"),
      card("leaves", "nine"),
      card("acorns", "seven"),
    ];
    assert.deepEqual(scoreHand(strongSecond), { figure: "high-card", score: 11 });
    assert.deepEqual(scoreHand(weakSecond), { figure: "high-card", score: 11 });
    assert.equal(compareHands(strongSecond, weakSecond), 0);
  });

  it("ranks one-suite-2 by pair sum (different display scores)", () => {
    const higherPair = [
      card("hearts", "king"),
      card("hearts", "ten"),
      card("bells", "seven"),
      card("leaves", "eight"),
    ];
    const lowerPair = [
      card("hearts", "ace"),
      card("hearts", "seven"),
      card("bells", "king"),
      card("leaves", "ten"),
    ];
    assert.deepEqual(scoreHand(higherPair), {
      figure: "one-suite",
      score: 20,
      suiteSize: 2,
    });
    assert.deepEqual(scoreHand(lowerPair), {
      figure: "one-suite",
      score: 18,
      suiteSize: 2,
    });
    assert.ok(compareHands(higherPair, lowerPair) > 0);
  });

  it("ties triplet when display score matches (no kicker on odd card)", () => {
    const highKicker = [
      card("hearts", "ten"),
      card("bells", "ten"),
      card("leaves", "ten"),
      card("acorns", "ace"),
    ];
    const lowKicker = [
      card("hearts", "ten"),
      card("bells", "ten"),
      card("leaves", "ten"),
      card("acorns", "seven"),
    ];
    assert.deepEqual(scoreHand(highKicker), {
      figure: "triplet",
      score: 30,
    });
    assert.deepEqual(scoreHand(lowKicker), {
      figure: "triplet",
      score: 30,
    });
    assert.equal(compareHands(highKicker, lowKicker), 0);
  });

  it("treats identical multiset as a full tie", () => {
    const a = [
      card("hearts", "ace"),
      card("bells", "king"),
      card("leaves", "nine"),
      card("acorns", "seven"),
    ];
    const b = [
      card("bells", "king"),
      card("acorns", "seven"),
      card("hearts", "ace"),
      card("leaves", "nine"),
    ];
    assert.equal(compareHands(a, b), 0);
  });
});
