import type {
  LimitOrder,
  MarketOrder,
  Order,
  Side,
  StopOrder,
  Trade,
} from "./types";

export class OrderBook {
  private bids: LimitOrder[] = [];
  private asks: LimitOrder[] = [];
  private stops: StopOrder[] = [];
  private nextSequence = 1;
  private last: number | undefined;

  submit(order: Order): Trade[] {
    if (order.type === "stop") {
      this.stops.push({ ...order });
      return this.triggerStops(order.timestamp);
    }
    const trades = this.match(order);
    return [...trades, ...this.triggerStops(order.timestamp)];
  }

  cancel(orderId: string): boolean {
    return (
      removeById(this.bids, orderId) ||
      removeById(this.asks, orderId) ||
      removeById(this.stops, orderId)
    );
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

  lastPrice(): number | undefined {
    return this.last;
  }

  restingQuantity(side: Side): number {
    const book = side === "buy" ? this.bids : this.asks;
    return book.reduce((total, order) => total + order.quantity, 0);
  }

  pendingStops(): number {
    return this.stops.length;
  }

  private match(order: LimitOrder | MarketOrder): Trade[] {
    const incoming = { ...order };
    const opposite = incoming.side === "buy" ? this.asks : this.bids;
    const trades: Trade[] = [];

    while (
      incoming.quantity > 0 &&
      opposite.length > 0 &&
      this.crosses(incoming, opposite[0])
    ) {
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

      this.last = resting.price;
      incoming.quantity -= quantity;
      resting.quantity -= quantity;
      if (resting.quantity === 0) opposite.shift();
    }

    if (incoming.quantity > 0 && incoming.type === "limit") this.rest(incoming);
    return trades;
  }

  private crosses(
    incoming: LimitOrder | MarketOrder,
    resting: LimitOrder,
  ): boolean {
    if (incoming.type === "market") return true;
    return incoming.side === "buy"
      ? incoming.price >= resting.price
      : incoming.price <= resting.price;
  }

  private rest(order: LimitOrder): void {
    if (order.side === "buy") {
      this.bids.push(order);
      this.bids.sort((a, b) => b.price - a.price || a.timestamp - b.timestamp);
    } else {
      this.asks.push(order);
      this.asks.sort((a, b) => a.price - b.price || a.timestamp - b.timestamp);
    }
  }

  private triggerStops(timestamp: number): Trade[] {
    const trades: Trade[] = [];
    let stop = this.nextTriggeredStop();

    while (stop) {
      this.stops.splice(this.stops.indexOf(stop), 1);
      trades.push(
        ...this.match({
          id: stop.id,
          traderId: stop.traderId,
          side: stop.side,
          type: "market",
          quantity: stop.quantity,
          timestamp,
        }),
      );
      stop = this.nextTriggeredStop();
    }

    return trades;
  }

  private nextTriggeredStop(): StopOrder | undefined {
    const last = this.last;
    if (last === undefined) return undefined;
    return this.stops
      .filter((s) =>
        s.side === "buy" ? last >= s.stopPrice : last <= s.stopPrice,
      )
      .sort((a, b) => a.timestamp - b.timestamp)[0];
  }
}

function removeById<T extends { id: string }>(list: T[], id: string): boolean {
  const index = list.findIndex((order) => order.id === id);
  if (index === -1) return false;
  list.splice(index, 1);
  return true;
}
