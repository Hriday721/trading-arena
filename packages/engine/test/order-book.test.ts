import { describe, expect, it } from "vitest";
import { OrderBook } from "../src/order-book";
import { limit } from "./helpers";

describe("OrderBook", () => {
  it("matches a buy and a sell at the same price into one trade", () => {
    const book = new OrderBook();
    book.submit(limit("s1", "sell", 10000, 10));
    const trades = book.submit(limit("b1", "buy", 10000, 10));

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      buyOrderId: "b1",
      sellOrderId: "s1",
      price: 10000,
      quantity: 10,
    });
    expect(book.bestBid()).toBeUndefined();
    expect(book.bestAsk()).toBeUndefined();
  });

  it("rests orders that do not cross and reports the spread", () => {
    const book = new OrderBook();
    book.submit(limit("b1", "buy", 9900, 5));
    book.submit(limit("s1", "sell", 10000, 5));

    expect(book.bestBid()).toBe(9900);
    expect(book.bestAsk()).toBe(10000);
    expect(book.spread()).toBe(100);
  });

  it("partially fills and leaves the remainder resting", () => {
    const book = new OrderBook();
    book.submit(limit("s1", "sell", 10000, 10));
    const trades = book.submit(limit("b1", "buy", 10000, 4));

    expect(trades[0].quantity).toBe(4);
    expect(book.restingQuantity("sell")).toBe(6);
  });

  it("fills the older order first at the same price", () => {
    const book = new OrderBook();
    book.submit(limit("s-early", "sell", 10000, 5));
    book.submit(limit("s-late", "sell", 10000, 5));
    const trades = book.submit(limit("b1", "buy", 10000, 5));

    expect(trades[0].sellOrderId).toBe("s-early");
  });

  it("fills the better price first", () => {
    const book = new OrderBook();
    book.submit(limit("s-high", "sell", 10100, 5));
    book.submit(limit("s-low", "sell", 10000, 5));
    const trades = book.submit(limit("b1", "buy", 10100, 5));

    expect(trades[0].sellOrderId).toBe("s-low");
  });

  it("trades at the resting order's price", () => {
    const book = new OrderBook();
    book.submit(limit("s1", "sell", 10000, 5));
    const trades = book.submit(limit("b1", "buy", 10200, 5));

    expect(trades[0].price).toBe(10000);
  });

  it("sweeps several price levels when the order is large", () => {
    const book = new OrderBook();
    book.submit(limit("s1", "sell", 10000, 5));
    book.submit(limit("s2", "sell", 10050, 5));
    book.submit(limit("s3", "sell", 10100, 5));
    const trades = book.submit(limit("b1", "buy", 10100, 12));

    expect(trades.map((t) => t.price)).toEqual([10000, 10050, 10100]);
    expect(trades.map((t) => t.quantity)).toEqual([5, 5, 2]);
    expect(book.bestAsk()).toBe(10100);
  });

  it("numbers trades in order and records who started them", () => {
    const book = new OrderBook();
    book.submit(limit("s1", "sell", 10000, 5));
    book.submit(limit("s2", "sell", 10050, 5));
    const trades = book.submit(limit("b1", "buy", 10050, 10));

    expect(trades.map((t) => t.sequence)).toEqual([1, 2]);
    expect(trades.every((t) => t.timestamp === trades[0].timestamp)).toBe(true);
    expect(trades.every((t) => t.aggressor === "buy")).toBe(true);
  });
});
