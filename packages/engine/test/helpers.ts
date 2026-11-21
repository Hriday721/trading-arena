import type { LimitOrder, MarketOrder, Side, StopOrder } from "../src/types";

let clock = 0;

export const limit = (id: string, side: Side, price: number, quantity: number): LimitOrder => ({
  id,
  traderId: `trader-${id}`,
  side,
  type: "limit",
  price,
  quantity,
  timestamp: clock++,
});

export const market = (id: string, side: Side, quantity: number): MarketOrder => ({
  id,
  traderId: `trader-${id}`,
  side,
  type: "market",
  quantity,
  timestamp: clock++,
});

export const stop = (id: string, side: Side, stopPrice: number, quantity: number): StopOrder => ({
  id,
  traderId: `trader-${id}`,
  side,
  type: "stop",
  stopPrice,
  quantity,
  timestamp: clock++,
});