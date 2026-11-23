import { describe, expect, it } from "vitest";
import { OrderBook } from "../src/order-book";
import { limit, market, stop } from "./helpers";

describe("Depth snapshot", () => {
  it("is empty for a new book", () => {
    const book = new OrderBook();
    expect(book.depth()).toEqual({
      bids: [],
      asks: [],
      lastPrice: undefined,
      spread: undefined,
      midPrice: undefined,
    });
  });

  it("groups orders at the same price into one level", () => {
    const book = new OrderBook();
    book.submit(limit("b1", "buy", 9900, 5));
    book.submit(limit("b2", "buy", 9900, 7));

    expect(book.depth().bids).toEqual([
      { price: 9900, quantity: 12, orders: 2, cumulative: 12 },
    ]);
  });

  it("lists bids highest first and asks lowest first, with running totals", () => {
    const book = new OrderBook();
    book.submit(limit("b1", "buy", 9800, 4));
    book.submit(limit("b2", "buy", 9900, 5));
    book.submit(limit("b3", "buy", 9700, 6));
    book.submit(limit("s1", "sell", 10200, 3));
    book.submit(limit("s2", "sell", 10000, 2));
    book.submit(limit("s3", "sell", 10100, 8));

    const depth = book.depth();

    expect(depth.bids.map((l) => [l.price, l.quantity, l.cumulative])).toEqual([
      [9900, 5, 5],
      [9800, 4, 9],
      [9700, 6, 15],
    ]);
    expect(depth.asks.map((l) => [l.price, l.quantity, l.cumulative])).toEqual([
      [10000, 2, 2],
      [10100, 8, 10],
      [10200, 3, 13],
    ]);
    expect(depth.spread).toBe(100);
  });

  it("can be limited to the best few levels", () => {
    const book = new OrderBook();
    for (let i = 0; i < 5; i++)
      book.submit(limit(`b${i}`, "buy", 9900 - i * 10, 1));

    expect(book.depth(2).bids.map((l) => l.price)).toEqual([9900, 9890]);
  });

  it("shrinks a level on a partial fill and removes it when empty", () => {
    const book = new OrderBook();
    book.submit(limit("s1", "sell", 10000, 10));
    book.submit(limit("s2", "sell", 10100, 5));

    book.submit(market("b1", "buy", 4));
    expect(book.depth().asks[0]).toEqual({
      price: 10000,
      quantity: 6,
      orders: 1,
      cumulative: 6,
    });

    book.submit(market("b2", "buy", 6));
    expect(book.depth().asks.map((l) => l.price)).toEqual([10100]);
  });

  it("updates when an order is cancelled, and drops an emptied level", () => {
    const book = new OrderBook();
    book.submit(limit("b1", "buy", 9900, 5));
    book.submit(limit("b2", "buy", 9900, 7));
    book.submit(limit("b3", "buy", 9800, 3));

    book.cancel("b1");
    expect(book.depth().bids[0]).toEqual({
      price: 9900,
      quantity: 7,
      orders: 1,
      cumulative: 7,
    });

    book.cancel("b2");
    expect(book.depth().bids.map((l) => l.price)).toEqual([9800]);
    expect(book.bestBid()).toBe(9800);
  });

  it("keeps first-come-first-served inside a level after a cancel", () => {
    const book = new OrderBook();
    book.submit(limit("s1", "sell", 10000, 5));
    book.submit(limit("s2", "sell", 10000, 5));
    book.submit(limit("s3", "sell", 10000, 5));
    book.cancel("s2");

    const trades = book.submit(market("b1", "buy", 10));

    expect(trades.map((t) => t.sellOrderId)).toEqual(["s1", "s3"]);
  });

  it("never shows hidden stop orders", () => {
    const book = new OrderBook();
    book.submit(limit("b1", "buy", 10000, 5));
    book.submit(stop("hidden", "sell", 9900, 50));

    expect(book.pendingStops()).toBe(1);
    expect(book.depth().bids).toEqual([
      { price: 10000, quantity: 5, orders: 1, cumulative: 5 },
    ]);
  });

  it("shows the book thinning out after a stop cascade", () => {
    const book = new OrderBook();
    book.submit(limit("support", "buy", 10000, 10));
    book.submit(limit("b2", "buy", 9950, 10));
    book.submit(limit("b3", "buy", 9900, 10));
    book.submit(limit("b4", "buy", 9850, 30));
    book.submit(stop("retail-1", "sell", 9990, 10));
    book.submit(stop("retail-2", "sell", 9980, 10));
    book.submit(market("institution", "sell", 15));

    const depth = book.depth();
    expect(depth.lastPrice).toBe(9850);
    expect(depth.bids.map((l) => [l.price, l.quantity])).toEqual([[9850, 25]]);
  });
});

describe("Mid price", () => {
  it("is undefined until both sides have orders", () => {
    const book = new OrderBook();
    expect(book.midPrice()).toBeUndefined();

    book.submit(limit("b1", "buy", 9900, 5));
    expect(book.midPrice()).toBeUndefined();
  });

  it("is halfway between the best bid and the best ask", () => {
    const book = new OrderBook();
    book.submit(limit("b1", "buy", 9900, 5));
    book.submit(limit("s1", "sell", 10000, 5));

    expect(book.midPrice()).toBe(9950);
    expect(book.depth().midPrice).toBe(9950);
  });

  it("moves when the best price changes, and can land between two paise", () => {
    const book = new OrderBook();
    book.submit(limit("b1", "buy", 9900, 5));
    book.submit(limit("s1", "sell", 10001, 5));
    expect(book.midPrice()).toBe(9950.5);

    book.submit(limit("b2", "buy", 9950, 5));
    expect(book.midPrice()).toBe(9975.5);
  });
});

describe("Large books", () => {
  it("keep exact price order and conserve every share", () => {
    const book = new OrderBook();
    let seed = 12345;
    const random = () =>
      (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

    let totalAsked = 0;
    for (let i = 0; i < 3000; i++) {
      const quantity = 1 + Math.floor(random() * 20);
      totalAsked += quantity;
      book.submit(
        limit(`s${i}`, "sell", 10000 + Math.floor(random() * 500), quantity),
      );
    }

    expect(book.restingQuantity("sell")).toBe(totalAsked);
    const asks = book.depth().asks;
    expect(asks.map((l) => l.price)).toEqual(
      [...asks.map((l) => l.price)].sort((a, b) => a - b),
    );

    const trades = book.submit(market("big-buy", "buy", totalAsked));

    const prices = trades.map((t) => t.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(trades.reduce((sum, t) => sum + t.quantity, 0)).toBe(totalAsked);
    expect(book.restingQuantity("sell")).toBe(0);
    expect(book.depth().asks).toEqual([]);
  });
});
