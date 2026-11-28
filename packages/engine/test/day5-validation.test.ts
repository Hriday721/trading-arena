import { describe, expect, it } from "vitest";
import { NSE_EQUITY_CONFIG } from "../src/config";
import { OrderBook } from "../src/order-book";
import type { ModifyResult, PlaceResult, Rejected } from "../src/types";
import { limit, market, stop } from "./helpers";

function accepted<T extends PlaceResult | ModifyResult>(
  result: T,
): Extract<T, { ok: true }> {
  if (!result.ok)
    throw new Error(`Unexpected reject: ${(result as Rejected).reason}`);
  return result as Extract<T, { ok: true }>;
}

describe("place(): accepting orders", () => {
  it("accepts a valid order and returns its trades", () => {
    const book = new OrderBook();
    accepted(book.place(limit("s1", "sell", 10000, 5)));
    const result = accepted(book.place(limit("b1", "buy", 10000, 5)));

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ price: 10000, quantity: 5 });
  });

  it("accepts any whole price and size when no config is given", () => {
    const book = new OrderBook();
    expect(book.place(limit("b1", "buy", 10001, 3)).ok).toBe(true);
  });
});

describe("place(): rejecting bad quantity", () => {
  it("rejects zero, negative, fractional and NaN quantities", () => {
    const book = new OrderBook();
    for (const quantity of [0, -5, 2.5, Number.NaN]) {
      const result = book.place(limit("x", "buy", 10000, quantity));
      expect(result).toMatchObject({ ok: false, reason: "invalid-quantity" });
    }
  });

  it("leaves the book untouched after a reject", () => {
    const book = new OrderBook();
    book.place(limit("x", "buy", 10000, 0));

    expect(book.bestBid()).toBeUndefined();
    expect(book.depth().bids).toEqual([]);
  });

  it("rejects quantities that are not a multiple of the lot size", () => {
    const book = new OrderBook({ lotSize: 10 });

    expect(book.place(limit("b1", "buy", 10000, 15))).toMatchObject({
      ok: false,
      reason: "lot-size",
    });
    expect(book.place(market("m1", "buy", 15))).toMatchObject({
      ok: false,
      reason: "lot-size",
    });
    expect(book.place(limit("b2", "buy", 10000, 20)).ok).toBe(true);
  });
});

describe("place(): rejecting bad prices", () => {
  it("rejects zero, negative and fractional prices", () => {
    const book = new OrderBook();
    for (const price of [0, -100, 99.5]) {
      expect(book.place(limit("x", "buy", price, 5))).toMatchObject({
        ok: false,
        reason: "invalid-price",
      });
    }
  });

  it("rejects prices that are not a multiple of the tick size", () => {
    const book = new OrderBook(NSE_EQUITY_CONFIG);

    expect(book.place(limit("b1", "buy", 10003, 5))).toMatchObject({
      ok: false,
      reason: "tick-size",
    });
    expect(book.place(limit("b2", "buy", 10005, 5)).ok).toBe(true);
  });

  it("applies the tick rule to stop prices too", () => {
    const book = new OrderBook({ tickSize: 5 });

    expect(book.place(stop("st1", "sell", 9903, 5))).toMatchObject({
      ok: false,
      reason: "tick-size",
    });
    expect(book.place(stop("st2", "sell", 9905, 5)).ok).toBe(true);
    expect(book.pendingStops()).toBe(1);
  });
});

describe("place(): duplicate ids", () => {
  it("rejects an id that is already resting, without changing the book", () => {
    const book = new OrderBook();
    book.place(limit("b1", "buy", 10000, 5));

    const result = book.place(limit("b1", "buy", 9900, 7));

    expect(result).toMatchObject({ ok: false, reason: "duplicate-id" });
    expect(book.depth().bids).toEqual([
      { price: 10000, quantity: 5, orders: 1, cumulative: 5 },
    ]);
  });

  it("rejects an id that belongs to a pending stop", () => {
    const book = new OrderBook();
    book.place(stop("st1", "sell", 9900, 5));

    expect(book.place(limit("st1", "buy", 9000, 1))).toMatchObject({
      ok: false,
      reason: "duplicate-id",
    });
    expect(book.pendingStops()).toBe(1);
  });

  it("lets an id be reused once its order has left the book", () => {
    const book = new OrderBook();
    book.place(limit("b1", "buy", 10000, 5));
    book.cancel("b1");

    expect(book.place(limit("b1", "buy", 10000, 5)).ok).toBe(true);
  });
});

describe("OrderBook configuration", () => {
  it("throws for a tick or lot size that makes no sense", () => {
    expect(() => new OrderBook({ tickSize: 0 })).toThrow();
    expect(() => new OrderBook({ lotSize: 2.5 })).toThrow();
  });
});

describe("modify()", () => {
  it("keeps the queue position when only the size goes down", () => {
    const book = new OrderBook();
    book.place(limit("s1", "sell", 10000, 10));
    book.place(limit("s2", "sell", 10000, 10));

    const result = accepted(book.modify("s1", { quantity: 4, timestamp: 100 }));
    const trades = book.submit(market("b1", "buy", 5));

    expect(result).toMatchObject({ keptPriority: true, trades: [] });
    expect(trades.map((t) => [t.sellOrderId, t.quantity])).toEqual([
      ["s1", 4],
      ["s2", 1],
    ]);
  });

  it("keeps the level total correct after a size cut", () => {
    const book = new OrderBook();
    book.place(limit("s1", "sell", 10000, 10));
    book.place(limit("s2", "sell", 10000, 10));
    book.modify("s1", { quantity: 3, timestamp: 100 });

    expect(book.depth().asks).toEqual([
      { price: 10000, quantity: 13, orders: 2, cumulative: 13 },
    ]);
    expect(book.restingQuantity("sell")).toBe(13);
  });

  it("sends the order to the back of the queue when the size goes up", () => {
    const book = new OrderBook();
    book.place(limit("s1", "sell", 10000, 5));
    book.place(limit("s2", "sell", 10000, 5));

    const result = accepted(book.modify("s1", { quantity: 8, timestamp: 100 }));
    const trades = book.submit(market("b1", "buy", 10));

    expect(result.keptPriority).toBe(false);
    expect(trades.map((t) => [t.sellOrderId, t.quantity])).toEqual([
      ["s2", 5],
      ["s1", 5],
    ]);
  });

  it("moves the order to a new price level and to the back of that queue", () => {
    const book = new OrderBook();
    book.place(limit("s1", "sell", 10000, 5));
    book.place(limit("s2", "sell", 10100, 5));

    const result = accepted(
      book.modify("s1", { price: 10100, timestamp: 100 }),
    );

    expect(result.keptPriority).toBe(false);
    expect(book.depth().asks).toEqual([
      { price: 10100, quantity: 10, orders: 2, cumulative: 10 },
    ]);
    const trades = book.submit(market("b1", "buy", 5));
    expect(trades[0].sellOrderId).toBe("s2");
  });

  it("trades straight away when the new price crosses the book", () => {
    const book = new OrderBook();
    book.place(limit("b1", "buy", 9900, 5));
    book.place(limit("s1", "sell", 10000, 5));

    const result = accepted(book.modify("s1", { price: 9900, timestamp: 100 }));

    expect(result.trades.map((t) => [t.price, t.quantity])).toEqual([
      [9900, 5],
    ]);
    expect(book.depth().bids).toEqual([]);
    expect(book.depth().asks).toEqual([]);
  });

  it("works on an order that was already partly filled", () => {
    const book = new OrderBook();
    book.place(limit("s1", "sell", 10000, 10));
    book.submit(market("b1", "buy", 4));

    accepted(book.modify("s1", { quantity: 3, timestamp: 100 }));

    expect(book.restingQuantity("sell")).toBe(3);
  });

  it("rejects unknown orders, empty requests and bad numbers", () => {
    const book = new OrderBook({ tickSize: 5 });
    book.place(limit("s1", "sell", 10000, 10));

    expect(book.modify("ghost", { quantity: 1, timestamp: 100 })).toMatchObject(
      { ok: false, reason: "unknown-order" },
    );
    expect(book.modify("s1", { timestamp: 100 })).toMatchObject({
      ok: false,
      reason: "nothing-to-modify",
    });
    expect(book.modify("s1", { quantity: 0, timestamp: 100 })).toMatchObject({
      ok: false,
      reason: "invalid-quantity",
    });
    expect(book.modify("s1", { price: 10003, timestamp: 100 })).toMatchObject({
      ok: false,
      reason: "tick-size",
    });
    expect(book.depth().asks).toEqual([
      { price: 10000, quantity: 10, orders: 1, cumulative: 10 },
    ]);
  });

  it("cannot modify an order that has been fully filled", () => {
    const book = new OrderBook();
    book.place(limit("s1", "sell", 10000, 5));
    book.submit(market("b1", "buy", 5));

    expect(book.modify("s1", { quantity: 2, timestamp: 100 })).toMatchObject({
      ok: false,
      reason: "unknown-order",
    });
  });
});
