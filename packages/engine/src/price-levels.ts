import type { DepthLevel, LimitOrder, Side } from "./types";

interface PriceLevel {
  price: number;
  orders: LimitOrder[];
  quantity: number;
}

export class BookSide {
  private levels: PriceLevel[] = [];
  private byId = new Map<string, LimitOrder>();
  private readonly side: Side;

  constructor(side: Side) {
    this.side = side;
  }

  best(): LimitOrder | undefined {
    return this.levels[0]?.orders[0];
  }

  bestPrice(): number | undefined {
    return this.levels[0]?.price;
  }

  add(order: LimitOrder): void {
    const index = this.insertionIndex(order.price);
    const level = this.levels[index];
    if (level && level.price === order.price) {
      level.orders.push(order);
      level.quantity += order.quantity;
    } else {
      this.levels.splice(index, 0, { price: order.price, orders: [order], quantity: order.quantity });
    }
    this.byId.set(order.id, order);
  }

  fillBest(quantity: number): void {
    const level = this.levels[0];
    if (!level) return;
    const order = level.orders[0];
    order.quantity -= quantity;
    level.quantity -= quantity;
    if (order.quantity === 0) {
      level.orders.shift();
      this.byId.delete(order.id);
      if (level.orders.length === 0) this.levels.shift();
    }
  }

  remove(orderId: string): boolean {
    const order = this.byId.get(orderId);
    if (!order) return false;
    const levelIndex = this.levels.findIndex((l) => l.price === order.price);
    const level = this.levels[levelIndex];
    level.orders.splice(level.orders.indexOf(order), 1);
    level.quantity -= order.quantity;
    if (level.orders.length === 0) this.levels.splice(levelIndex, 1);
    this.byId.delete(orderId);
    return true;
  }

  totalQuantity(): number {
    return this.levels.reduce((total, level) => total + level.quantity, 0);
  }

  depth(maxLevels?: number): DepthLevel[] {
    let cumulative = 0;
    return this.levels.slice(0, maxLevels).map((level) => {
      cumulative += level.quantity;
      return { price: level.price, quantity: level.quantity, orders: level.orders.length, cumulative };
    });
  }

  private isBetter(a: number, b: number): boolean {
    return this.side === "buy" ? a > b : a < b;
  }

  private insertionIndex(price: number): number {
    let low = 0;
    let high = this.levels.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.isBetter(this.levels[mid].price, price)) low = mid + 1;
      else high = mid;
    }
    return low;
  }
}