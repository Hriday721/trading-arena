import { describe, expect, it } from "vitest";
import { OrderBook } from "../src/order-book";
import { limit, market } from "./helpers";

describe("Benchmark: 10,000 resting orders", () => {
  it("rests, cancels and sweeps without slowing down", () => {
    const book = new OrderBook();
    let seed = 42;
    const random = () =>
      (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

    const startRest = performance.now();
    for (let i = 0; i < 5000; i++) {
      book.submit(
        limit(
          `b${i}`,
          "buy",
          9000 + Math.floor(random() * 1000),
          1 + Math.floor(random() * 20),
        ),
      );
      book.submit(
        limit(
          `s${i}`,
          "sell",
          10001 + Math.floor(random() * 1000),
          1 + Math.floor(random() * 20),
        ),
      );
    }
    const restMs = performance.now() - startRest;

    const startCancel = performance.now();
    for (let i = 0; i < 2000; i++) {
      book.cancel(`b${i}`);
      book.cancel(`s${i}`);
    }
    const cancelMs = performance.now() - startCancel;

    const startSweep = performance.now();
    let traded = 0;
    for (let i = 0; i < 2000; i++) {
      const trades = book.submit(
        market(
          `m${i}`,
          i % 2 === 0 ? "buy" : "sell",
          1 + Math.floor(random() * 10),
        ),
      );
      traded += trades.length;
    }
    const sweepMs = performance.now() - startSweep;

    console.log(
      `Benchmark: rest 10,000 orders ${restMs.toFixed(1)} ms | cancel 4,000 ${cancelMs.toFixed(1)} ms | ` +
        `2,000 market orders (${traded} trades) ${sweepMs.toFixed(1)} ms`,
    );

    const bid = book.bestBid();
    const ask = book.bestAsk();
    expect(bid !== undefined && ask !== undefined && bid < ask).toBe(true);
    expect(restMs + cancelMs + sweepMs < 5000).toBe(true);
  });
});
