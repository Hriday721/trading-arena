import { describe, expect, it } from "vitest";
import { OrderBook } from "../src/order-book";
import { limit, market, stop } from "./helpers";

describe("Market orders", () => {
  it("fill against the best prices available, whatever they are", () => {
    const book = new OrderBook();
    book.submit(limit("s1", "sell", 10000, 5));
    book.submit(limit("s2", "sell", 10100, 5));
    const trades = book.submit(market("b1", "buy", 8));

    expect(trades.map((t) => [t.price, t.quantity])).toEqual([
      [10000, 5],
      [10100, 3],
    ]);
  });

  it("never rest in the book; any unfilled remainder is dropped", () => {
    const book = new OrderBook();
    book.submit(limit("s1", "sell", 10000, 5));
    const trades = book.submit(market("b1", "buy", 8));

    expect(trades[0].quantity).toBe(5);
    expect(book.bestBid()).toBeUndefined();
    expect(book.restingQuantity("buy")).toBe(0);
  });

  it("do nothing when the other side is empty", () => {
    const book = new OrderBook();
    expect(book.submit(market("b1", "buy", 10))).toEqual([]);
  });
});

describe("Cancelling orders", () => {
  it("removes a resting order from the book", () => {
    const book = new OrderBook();
    book.submit(limit("b1", "buy", 9900, 5));

    expect(book.cancel("b1")).toBe(true);
    expect(book.bestBid()).toBeUndefined();
  });

  it("returns false for an order that does not exist", () => {
    const book = new OrderBook();
    expect(book.cancel("ghost")).toBe(false);
  });

  it("means the cancelled order can no longer trade", () => {
    const book = new OrderBook();
    book.submit(limit("s1", "sell", 10000, 5));
    book.cancel("s1");

    expect(book.submit(market("b1", "buy", 5))).toEqual([]);
  });
});

describe("Last traded price", () => {
  it("is undefined before any trade and then follows the latest trade", () => {
    const book = new OrderBook();
    expect(book.lastPrice()).toBeUndefined();

    book.submit(limit("s1", "sell", 10000, 5));
    book.submit(limit("s2", "sell", 10100, 5));
    book.submit(market("b1", "buy", 7));

    expect(book.lastPrice()).toBe(10100);
  });
});

describe("Stop orders", () => {
  it("wait hidden until price falls to their level, then sell at market", () => {
    const book = new OrderBook();
    book.submit(limit("b1", "buy", 10000, 5));
    book.submit(limit("b2", "buy", 9950, 5));
    book.submit(limit("b3", "buy", 9900, 20));
    book.submit(stop("retail-stop", "sell", 9950, 5));

    expect(book.bestBid()).toBe(10000);
    expect(book.pendingStops()).toBe(1);

    book.submit(market("m1", "sell", 5));
    expect(book.pendingStops()).toBe(1);

    const trades = book.submit(market("m2", "sell", 5));

    expect(book.pendingStops()).toBe(0);
    expect(trades.map((t) => [t.sellOrderId, t.price])).toEqual([
      ["m2", 9950],
      ["retail-stop", 9900],
    ]);
  });

  it("trigger when price rises to a buy stop level", () => {
    const book = new OrderBook();
    book.submit(limit("s1", "sell", 10000, 5));
    book.submit(limit("s2", "sell", 10050, 5));
    book.submit(limit("s3", "sell", 10100, 10));
    book.submit(stop("short-cover", "buy", 10050, 5));

    const trades = book.submit(market("b1", "buy", 6));

    expect(trades.map((t) => [t.buyOrderId, t.price, t.quantity])).toEqual([
      ["b1", 10000, 5],
      ["b1", 10050, 1],
      ["short-cover", 10050, 4],
      ["short-cover", 10100, 1],
    ]);
  });

  it("can be cancelled before they trigger", () => {
    const book = new OrderBook();
    book.submit(limit("b1", "buy", 10000, 5));
    book.submit(limit("b2", "buy", 9900, 5));
    book.submit(stop("st1", "sell", 9950, 5));
    book.cancel("st1");

    const trades = book.submit(market("m1", "sell", 10));

    expect(trades.every((t) => t.sellOrderId === "m1")).toBe(true);
    expect(book.pendingStops()).toBe(0);
  });

  it("cascade when a push through support triggers a chain of stop-losses", () => {
    const book = new OrderBook();
    book.submit(limit("support", "buy", 10000, 10));
    book.submit(limit("b2", "buy", 9950, 10));
    book.submit(limit("b3", "buy", 9900, 10));
    book.submit(limit("b4", "buy", 9850, 30));
    book.submit(stop("retail-1", "sell", 9990, 10));
    book.submit(stop("retail-2", "sell", 9980, 10));

    const trades = book.submit(market("institution", "sell", 15));

    expect(trades.map((t) => [t.sellOrderId, t.price, t.quantity])).toEqual([
      ["institution", 10000, 10],
      ["institution", 9950, 5],
      ["retail-1", 9950, 5],
      ["retail-1", 9900, 5],
      ["retail-2", 9900, 5],
      ["retail-2", 9850, 5],
    ]);
    expect(book.lastPrice()).toBe(9850);
    expect(trades.map((t) => t.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
