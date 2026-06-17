import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Card } from "@ferbli/protocol";
import { compareHandScores, scoreHand } from "./index.js";

function card(suit: Card["suit"], rank: Card["rank"]): Card {
  return { suit, rank };
}

function beats(a: Card[], b: Card[]): boolean {
  return compareHandScores(scoreHand(a), scoreHand(b)) > 0;
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
        strength: 11_151_971,
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
        strength: 11_051_949,
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
        strength: 60_100_000,
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
        strength: 10_941_505,
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
        strength: 43_700_007,
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
        strength: 44_000_000,
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
        strength: 33_135_061,
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
        strength: 33_150_091,
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
          strength: 11_045_064,
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
          strength: 11_152_103,
        },
      );
    });
  });
});
