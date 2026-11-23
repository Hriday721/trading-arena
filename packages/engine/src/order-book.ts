import { BookSide } from "./price-levels";
import type {
  DepthSnapshot,
  LimitOrder,
  MarketOrder,
  Order,
  Side,
  StopOrder,
  Trade,
} from "./types";

export class OrderBook {
  private bids = new BookSide("buy");
  private asks = new BookSide("sell");
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
      this.bids.remove(orderId) ||
      this.asks.remove(orderId) ||
      removeById(this.stops, orderId)
    );
  }

  bestBid(): number | undefined {
    return this.bids.bestPrice();
  }

  bestAsk(): number | undefined {
    return this.asks.bestPrice();
  }

  spread(): number | undefined {
    const bid = this.bestBid();
    const ask = this.bestAsk();
    return bid === undefined || ask === undefined ? undefined : ask - bid;
  }

  midPrice(): number | undefined {
    const bid = this.bestBid();
    const ask = this.bestAsk();
    return bid === undefined || ask === undefined ? undefined : (bid + ask) / 2;
  }

  lastPrice(): number | undefined {
    return this.last;
  }

  restingQuantity(side: Side): number {
    return (side === "buy" ? this.bids : this.asks).totalQuantity();
  }

  pendingStops(): number {
    return this.stops.length;
  }

  depth(maxLevels?: number): DepthSnapshot {
    return {
      bids: this.bids.depth(maxLevels),
      asks: this.asks.depth(maxLevels),
      lastPrice: this.last,
      spread: this.spread(),
      midPrice: this.midPrice(),
    };
  }

  private match(order: LimitOrder | MarketOrder): Trade[] {
    const incoming = { ...order };
    const opposite = incoming.side === "buy" ? this.asks : this.bids;
    const trades: Trade[] = [];

    let resting = opposite.best();
    while (
      incoming.quantity > 0 &&
      resting &&
      this.crosses(incoming, resting)
    ) {
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
      opposite.fillBest(quantity);
      resting = opposite.best();
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
    (order.side === "buy" ? this.bids : this.asks).add(order);
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
