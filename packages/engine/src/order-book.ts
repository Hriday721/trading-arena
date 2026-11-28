import { DEFAULT_BOOK_CONFIG } from "./config";
import { BookSide } from "./price-levels";
import type {
  BookConfig,
  BookEvent,
  DepthSnapshot,
  LimitOrder,
  LoggedEvent,
  MarketOrder,
  ModifyChanges,
  ModifyResult,
  Order,
  PlaceResult,
  Recording,
  Side,
  StopOrder,
  Trade,
} from "./types";
import {
  checkPrice,
  checkQuantity,
  rejection,
  validateNewOrder,
} from "./validation";

export class OrderBook {
  private bids = new BookSide("buy");
  private asks = new BookSide("sell");
  private stops: StopOrder[] = [];
  private nextSequence = 1;
  private last: number | undefined;
  private readonly config: BookConfig;
  private events: LoggedEvent[] = [];
  private nextEventId = 1;
  private tradeLog: Trade[] = [];

  constructor(config: Partial<BookConfig> = {}) {
    this.config = { ...DEFAULT_BOOK_CONFIG, ...config };
    if (!Number.isInteger(this.config.tickSize) || this.config.tickSize <= 0) {
      throw new Error("tickSize must be a whole number above zero");
    }
    if (!Number.isInteger(this.config.lotSize) || this.config.lotSize <= 0) {
      throw new Error("lotSize must be a whole number above zero");
    }
  }

  place(order: Order): PlaceResult {
    const problem = validateNewOrder(order, this.config);
    if (problem) return problem;
    if (order.type !== "market" && this.hasOrder(order.id)) {
      return rejection(
        "duplicate-id",
        `An order with id "${order.id}" is already in the book`,
      );
    }
    return { ok: true, trades: this.submit(order) };
  }

  modify(orderId: string, changes: ModifyChanges): ModifyResult {
    if (changes.price === undefined && changes.quantity === undefined) {
      return rejection(
        "nothing-to-modify",
        "Give a new price, a new quantity, or both",
      );
    }
    const side = this.bids.has(orderId)
      ? this.bids
      : this.asks.has(orderId)
        ? this.asks
        : undefined;
    const current = side?.get(orderId);
    if (!side || !current) {
      return rejection(
        "unknown-order",
        `No resting order with id "${orderId}"`,
      );
    }

    const price = changes.price ?? current.price;
    const quantity = changes.quantity ?? current.quantity;
    const problem =
      checkQuantity(quantity, this.config) ?? checkPrice(price, this.config);
    if (problem) return problem;

    this.record({ type: "order-modified", orderId, changes: { ...changes } });

    if (price === current.price && quantity <= current.quantity) {
      side.reduce(orderId, quantity);
      return { ok: true, trades: [], keptPriority: true };
    }

    this.remove(orderId);
    const trades = this.process({
      ...current,
      price,
      quantity,
      timestamp: changes.timestamp,
    });
    return { ok: true, trades, keptPriority: false };
  }

  submit(order: Order): Trade[] {
    this.record({ type: "order-submitted", order: { ...order } });
    return this.process(order);
  }

  cancel(orderId: string): boolean {
    const removed = this.remove(orderId);
    if (removed) this.record({ type: "order-cancelled", orderId });
    return removed;
  }

  recording(): Recording {
    return { config: { ...this.config }, events: structuredClone(this.events) };
  }

  static replay(
    recording: Recording,
    untilEventId = Number.POSITIVE_INFINITY,
  ): OrderBook {
    const book = new OrderBook(recording.config);
    for (const { eventId, event } of recording.events) {
      if (eventId > untilEventId) break;
      switch (event.type) {
        case "order-submitted":
          book.submit(event.order);
          break;
        case "order-cancelled":
          book.cancel(event.orderId);
          break;
        case "order-modified":
          book.modify(event.orderId, event.changes);
          break;
      }
    }
    return book;
  }

  tape(): Trade[] {
    return this.tradeLog.map((trade) => ({ ...trade }));
  }

  stopOrders(): StopOrder[] {
    return this.stops.map((stop) => ({ ...stop }));
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

  hasOrder(orderId: string): boolean {
    return (
      this.bids.has(orderId) ||
      this.asks.has(orderId) ||
      this.stops.some((s) => s.id === orderId)
    );
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

  private record(event: BookEvent): void {
    this.events.push({ eventId: this.nextEventId++, event });
  }

  private process(order: Order): Trade[] {
    if (order.type === "stop") {
      this.stops.push({ ...order });
      return this.triggerStops(order.timestamp);
    }
    const trades = this.match(order);
    return [...trades, ...this.triggerStops(order.timestamp)];
  }

  private remove(orderId: string): boolean {
    return (
      this.bids.remove(orderId) ||
      this.asks.remove(orderId) ||
      removeById(this.stops, orderId)
    );
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

      const trade: Trade = {
        sequence: this.nextSequence++,
        aggressor: incoming.side,
        buyOrderId: incoming.side === "buy" ? incoming.id : resting.id,
        sellOrderId: incoming.side === "sell" ? incoming.id : resting.id,
        price: resting.price,
        quantity,
        timestamp: incoming.timestamp,
      };
      trades.push(trade);
      this.tradeLog.push(trade);

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
