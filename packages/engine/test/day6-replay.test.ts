import { describe, expect, it } from "vitest";
import { OrderBook } from "../src/order-book";
import type { DepthSnapshot } from "../src/types";
import { limit, market, stop } from "./helpers";

const fingerprint = (book: OrderBook) => ({
  depth: book.depth(),
  tape: book.tape(),
  stops: book.stopOrders(),
  log: book.recording().events,
});

describe("Event log", () => {
  it("records every accepted action in order, with rising event numbers", () => {
    const book = new OrderBook();
    book.place(limit("b1", "buy", 9900, 5));
    book.place(limit("s1", "sell", 10000, 5));
    book.submit(market("m1", "buy", 2));
    book.modify("b1", { quantity: 3, timestamp: 50 });
    book.cancel("s1");

    const events = book.recording().events;

    expect(events.map((e) => e.eventId)).toEqual([1, 2, 3, 4, 5]);
    expect(events.map((e) => e.event.type)).toEqual([
      "order-submitted",
      "order-submitted",
      "order-submitted",
      "order-modified",
      "order-cancelled",
    ]);
  });

  it("does not record rejected orders or failed cancels", () => {
    const book = new OrderBook();
    book.place(limit("bad", "buy", 10000, 0));
    book.place(limit("b1", "buy", 10000, 5));
    book.place(limit("b1", "buy", 9900, 5));
    book.cancel("ghost");
    book.modify("ghost", { quantity: 1, timestamp: 1 });

    expect(book.recording().events).toHaveLength(1);
  });

  it("logs the orders you send, not the trades they cause", () => {
    const book = new OrderBook();
    book.submit(limit("support", "buy", 10000, 10));
    book.submit(limit("b2", "buy", 9950, 10));
    book.submit(limit("b3", "buy", 9900, 10));
    book.submit(limit("b4", "buy", 9850, 30));
    book.submit(stop("retail-1", "sell", 9990, 10));
    book.submit(stop("retail-2", "sell", 9980, 10));
    book.submit(market("institution", "sell", 15));

    expect(book.recording().events).toHaveLength(7);
    expect(book.tape()).toHaveLength(6);
  });

  it("keeps a safe copy: changing an order after sending it does not change the log", () => {
    const book = new OrderBook();
    const order = limit("b1", "buy", 10000, 5);
    book.submit(order);
    order.quantity = 999;

    const recording = book.recording();
    recording.events.length = 0;

    const first = book.recording().events[0].event;
    expect(first).toMatchObject({
      type: "order-submitted",
      order: { quantity: 5 },
    });
  });
});

describe("Tape and stop list", () => {
  it("keeps every trade in order, across many orders", () => {
    const book = new OrderBook();
    book.submit(limit("s1", "sell", 10000, 5));
    book.submit(limit("s2", "sell", 10100, 5));
    book.submit(market("b1", "buy", 7));
    book.submit(limit("b2", "buy", 10100, 3));

    expect(book.tape().map((t) => [t.sequence, t.price, t.quantity])).toEqual([
      [1, 10000, 5],
      [2, 10100, 2],
      [3, 10100, 3],
    ]);
  });

  it("lists hidden stops for the audit view", () => {
    const book = new OrderBook();
    book.submit(stop("st1", "sell", 9900, 5));

    expect(book.stopOrders()).toMatchObject([
      { id: "st1", stopPrice: 9900, quantity: 5 },
    ]);
  });
});

describe("Replay", () => {
  it("rebuilds the stop hunt exactly: same events, same book", () => {
    const book = new OrderBook();
    book.submit(limit("support", "buy", 10000, 10));
    book.submit(limit("b2", "buy", 9950, 10));
    book.submit(limit("b3", "buy", 9900, 10));
    book.submit(limit("b4", "buy", 9850, 30));
    book.submit(stop("retail-1", "sell", 9990, 10));
    book.submit(stop("retail-2", "sell", 9980, 10));
    book.submit(market("institution", "sell", 15));

    const replayed = OrderBook.replay(book.recording());

    expect(fingerprint(replayed)).toEqual(fingerprint(book));
    expect(replayed.lastPrice()).toBe(9850);
  });

  it("gives an empty book for an empty recording", () => {
    const replayed = OrderBook.replay(new OrderBook().recording());

    expect(replayed.depth().bids).toEqual([]);
    expect(replayed.tape()).toEqual([]);
  });

  it("rebuilds a book that used a tick size and modify", () => {
    const book = new OrderBook({ tickSize: 5 });
    book.place(limit("s1", "sell", 10000, 10));
    book.place(limit("s2", "sell", 10000, 10));
    book.modify("s1", { price: 10005, timestamp: 40 });
    book.modify("s2", { quantity: 4, timestamp: 41 });
    book.place(market("b1", "buy", 6));

    const replayed = OrderBook.replay(book.recording());

    expect(fingerprint(replayed)).toEqual(fingerprint(book));
  });

  it("can stop part-way, which is how a replay scrubber will work", () => {
    const book = new OrderBook();
    const snapshots: DepthSnapshot[] = [];
    const steps = [
      () => book.submit(limit("b1", "buy", 9900, 5)),
      () => book.submit(limit("s1", "sell", 10000, 5)),
      () => book.submit(limit("s2", "sell", 10000, 7)),
      () => book.submit(market("m1", "buy", 6)),
      () => book.modify("s2", { quantity: 3, timestamp: 90 }),
      () => book.cancel("b1"),
      () => book.submit(limit("b2", "buy", 10000, 2)),
    ];
    for (const step of steps) {
      step();
      snapshots.push(book.depth());
    }

    const recording = book.recording();
    snapshots.forEach((snapshot, index) => {
      expect(OrderBook.replay(recording, index + 1).depth()).toEqual(snapshot);
    });
  });

  it("builds a separate book and never touches the original", () => {
    const book = new OrderBook();
    book.submit(limit("b1", "buy", 9900, 5));

    const replayed = OrderBook.replay(book.recording());
    replayed.cancel("b1");

    expect(replayed.depth().bids).toEqual([]);
    expect(book.depth().bids).toHaveLength(1);
  });

  it("matches the original after 1,500 random actions (limits, markets, stops, cancels, modifies)", () => {
    const book = new OrderBook();
    let seed = 2026;
    const random = () =>
      (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = (n: number) => Math.floor(random() * n);

    for (let i = 0; i < 1500; i++) {
      const roll = random();
      const side = random() < 0.5 ? "buy" : "sell";
      const id = `o${i}`;
      if (roll < 0.5) {
        book.place(limit(id, side, 9900 + pick(200), 1 + pick(20)));
      } else if (roll < 0.65) {
        book.place(market(id, side, 1 + pick(10)));
      } else if (roll < 0.75) {
        const offset = 50 + pick(100);
        book.place(
          stop(
            id,
            side,
            side === "sell" ? 10000 - offset : 10000 + offset,
            1 + pick(10),
          ),
        );
      } else if (roll < 0.9) {
        book.cancel(`o${pick(i + 1)}`);
      } else {
        book.modify(`o${pick(i + 1)}`, {
          price: 9900 + pick(200),
          quantity: 1 + pick(20),
          timestamp: i,
        });
      }
    }

    const log = book.recording().events;
    expect(log.length).toBeGreaterThan(500);
    expect(book.tape().length).toBeGreaterThan(100);

    const replayed = OrderBook.replay(book.recording());
    expect(fingerprint(replayed)).toEqual(fingerprint(book));
  });
});
