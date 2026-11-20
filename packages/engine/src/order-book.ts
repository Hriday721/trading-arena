import type { Order, Trade } from "./types";

export class OrderBook {
  private bids: Order[] = [];
  private asks: Order[] = [];
  private nextSequence = 1;

  submit(order: Order): Trade[] {
    const incoming = { ...order };
    const opposite = incoming.side === "buy" ? this.asks : this.bids;
    const trades: Trade[] = [];

    while (incoming.quantity > 0 && opposite.length > 0 && this.crosses(incoming, opposite[0])) {
      const resting = opposite[0];
      const quantity = Math.min(incoming.quantity, resting.quantity);

      trades.push({
        sequence: this.nextSequence++,
        aggressor: incoming.side,
        buyOrderId: incoming.side === "buy" ? incoming.id : resting.id,
        sellOrderId: incoming.side === "sell" ? incoming.id : resting.id,
        price: resting.price,
        quantity,
        timestamp: incoming.timestamp,
      });

      incoming.quantity -= quantity;
      resting.quantity -= quantity;
      if (resting.quantity === 0) opposite.shift();
    }

    if (incoming.quantity > 0) this.rest(incoming);
    return trades;
  }

  bestBid(): number | undefined {
    return this.bids[0]?.price;
  }

  bestAsk(): number | undefined {
    return this.asks[0]?.price;
  }

  spread(): number | undefined {
    const bid = this.bestBid();
    const ask = this.bestAsk();
    return bid === undefined || ask === undefined ? undefined : ask - bid;
  }

  restingQuantity(side: "buy" | "sell"): number {
    const book = side === "buy" ? this.bids : this.asks;
    return book.reduce((total, order) => total + order.quantity, 0);
  }

  private crosses(incoming: Order, resting: Order): boolean {
    return incoming.side === "buy" ? incoming.price >= resting.price : incoming.price <= resting.price;
  }

  private rest(order: Order): void {
    if (order.side === "buy") {
      this.bids.push(order);
      this.bids.sort((a, b) => b.price - a.price || a.timestamp - b.timestamp);
    } else {
      this.asks.push(order);
      this.asks.sort((a, b) => a.price - b.price || a.timestamp - b.timestamp);
    }
  }
}
