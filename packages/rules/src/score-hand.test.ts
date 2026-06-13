import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Card } from "@ferbli/protocol";
import { scoreHand } from "./index.js";

function card(suit: Card["suit"], rank: Card["rank"]): Card {
  return { suit, rank };
}

describe("scoreHand", () => {
  describe("four cards, four different suits (high card)", () => {
    it("ace high beats face cards and pips", () => {
      const hand: Card[] = [
        card("hearts", "ace"),
        card("bells", "king"),
        card("leaves", "nine"),
        card("acorns", "seven"),
      ];
      assert.equal(scoreHand(hand), 11);
    });

    it("king high when ace is absent", () => {
      const hand: Card[] = [
        card("hearts", "king"),
        card("bells", "ten"),
        card("leaves", "nine"),
        card("acorns", "seven"),
      ];
      assert.equal(scoreHand(hand), 10);
    });

    it("four sevens, one per suit: minimum high card is 7", () => {
      const hand: Card[] = [
        card("hearts", "seven"),
        card("bells", "seven"),
        card("leaves", "seven"),
        card("acorns", "seven"),
      ];
      assert.equal(scoreHand(hand), 7);
    });

    it("nine high when that beats sevens and eight", () => {
      const hand: Card[] = [
        card("hearts", "seven"),
        card("bells", "eight"),
        card("leaves", "nine"),
        card("acorns", "seven"),
      ];
      assert.equal(scoreHand(hand), 9);
    });
  });

  describe("four cards, same-suit combinations", () => {
    it("three of one suit + off-suit: best triple (README-style)", () => {
      const hand: Card[] = [
        card("hearts", "ace"),
        card("hearts", "king"),
        card("hearts", "nine"),
        card("bells", "seven"),
      ];
      assert.equal(scoreHand(hand), 30);
    });

    it("four of one suit: sum of all four point values", () => {
      const hand: Card[] = [
        card("hearts", "ace"),
        card("hearts", "king"),
        card("hearts", "ten"),
        card("hearts", "nine"),
      ];
      assert.equal(scoreHand(hand), 11 + 10 + 10 + 9);
    });

    it("two + two by suit: pick the better pair sum", () => {
      const hand: Card[] = [
        card("hearts", "ace"),
        card("hearts", "seven"),
        card("bells", "king"),
        card("bells", "ten"),
      ];
      assert.equal(scoreHand(hand), 20);
    });

    it("exactly two sharing a suit: only that pair counts", () => {
      const hand: Card[] = [
        card("hearts", "ober"),
        card("hearts", "unter"),
        card("bells", "ace"),
        card("leaves", "king"),
      ];
      assert.equal(scoreHand(hand), 20);
    });
  });

  describe("(hypothetical)fewer than four cards (high card when no same-suit pair)", () => {
    it("two cards, different suits: best single card", () => {
      assert.equal(
        scoreHand([card("hearts", "nine"), card("bells", "king")]),
        10,
      );
    });

    it("three cards, three suits: best single card", () => {
      assert.equal(
        scoreHand([
          card("hearts", "ace"),
          card("bells", "king"),
          card("leaves", "ten"),
        ]),
        11,
      );
    });
  });

});
