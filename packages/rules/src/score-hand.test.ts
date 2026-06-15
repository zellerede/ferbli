import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Card } from "@ferbli/protocol";
import { scoreHand } from "./index.js";

function card(suit: Card["suit"], rank: Card["rank"]): Card {
  return { suit, rank };
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
      assert.equal(scoreHand(hand), 11_151_971);
    });

    it("king high when ace is absent", () => {
      const hand: Card[] = [
        card("hearts", "king"),
        card("bells", "ten"),
        card("leaves", "nine"),
        card("acorns", "seven"),
      ];
      assert.equal(scoreHand(hand), 11_051_949);
    });

    it("four sevens, one per suit: four of a kind (beats high card)", () => {
      const hand: Card[] = [
        card("hearts", "seven"),
        card("bells", "seven"),
        card("leaves", "seven"),
        card("acorns", "seven"),
      ];
      assert.equal(scoreHand(hand), 50_100_000);
    });

    it("nine high when that beats sevens and eight", () => {
      const hand: Card[] = [
        card("hearts", "seven"),
        card("bells", "eight"),
        card("leaves", "nine"),
        card("acorns", "seven"),
      ];
      assert.equal(scoreHand(hand), 10_941_505);
    });
  });

  describe("four cards, same-suit combinations (25M tier)", () => {
    it("three of one suit + off-suit: best triple (README-style)", () => {
      const hand: Card[] = [
        card("hearts", "ace"),
        card("hearts", "king"),
        card("hearts", "nine"),
        card("bells", "seven"),
      ];
      assert.equal(scoreHand(hand), 25_000_030);
    });

    it("four of one suit: sum of all four point values", () => {
      const hand: Card[] = [
        card("hearts", "ace"),
        card("hearts", "king"),
        card("hearts", "ten"),
        card("hearts", "nine"),
      ];
      assert.equal(scoreHand(hand), 25_000_000 + (11 + 10 + 10 + 9));
    });

    it("two + two by suit: pick the better pair sum", () => {
      const hand: Card[] = [
        card("hearts", "ace"),
        card("hearts", "seven"),
        card("bells", "king"),
        card("bells", "ten"),
      ];
      assert.equal(scoreHand(hand), 25_000_020);
    });

    it("exactly two sharing a suit: only that pair counts", () => {
      const hand: Card[] = [
        card("hearts", "ober"),
        card("hearts", "unter"),
        card("bells", "ace"),
        card("leaves", "king"),
      ];
      assert.equal(scoreHand(hand), 25_000_020);
    });
  });

  describe("rank-based patterns", () => {
    it("four of a kind beats any same-suit combination", () => {
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
      assert.ok(scoreHand(quad) > scoreHand(suitBest));
    });

    it("three same rank on three suits beats same-suit triple of equal point sum", () => {
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
      assert.ok(scoreHand(tripleRank) > scoreHand(suitTriple));
    });

    it("three same rank on three suits beats four-suit high card", () => {
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
      assert.ok(scoreHand(tripleRank) > scoreHand(highOnly));
    });

    it("four of a kind beats three-of-a-kind by rank", () => {
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
      assert.ok(scoreHand(quad) > scoreHand(triple));
    });

    it("pair of aces (two aces by rank) beats king-high four suits", () => {
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
      assert.ok(scoreHand(aces) > scoreHand(kingHigh));
    });

    it("pair of aces loses to any scored same-suit pair or better", () => {
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
      assert.ok(scoreHand(suitPair) > scoreHand(aces));
    });
  });

  describe("(hypothetical) fewer than four cards", () => {
    it("two cards, different suits: best single card encoded", () => {
      assert.equal(
        scoreHand([card("hearts", "nine"), card("bells", "king")]),
        11_045_064,
      );
    });

    it("three cards, three suits: best single card encoded", () => {
      assert.equal(
        scoreHand([
          card("hearts", "ace"),
          card("bells", "king"),
          card("leaves", "ten"),
        ]),
        11_152_103,
      );
    });
  });
});
