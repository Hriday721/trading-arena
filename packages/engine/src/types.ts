export type Side = "buy" | "sell";

export type OrderType = "limit" | "market" | "stop";

interface BaseOrder {
  id: string;
  traderId: string;
  side: Side;
  quantity: number;
  timestamp: number;
}

export interface LimitOrder extends BaseOrder {
  type: "limit";
  price: number;
}

export interface MarketOrder extends BaseOrder {
  type: "market";
}

export interface StopOrder extends BaseOrder {
  type: "stop";
  stopPrice: number;
}

export type Order = LimitOrder | MarketOrder | StopOrder;

export interface Trade {
  sequence: number;
  aggressor: Side;
  buyOrderId: string;
  sellOrderId: string;
  price: number;
  quantity: number;
  timestamp: number;
}

export interface DepthLevel {
  price: number;
  quantity: number;
  orders: number;
  cumulative: number;
}

export interface DepthSnapshot {
  bids: DepthLevel[];
  asks: DepthLevel[];
  lastPrice: number | undefined;
  spread: number | undefined;
  midPrice: number | undefined;
}

export interface BookConfig {
  tickSize: number;
  lotSize: number;
}

export type RejectReason =
  | "invalid-quantity"
  | "lot-size"
  | "invalid-price"
  | "tick-size"
  | "duplicate-id"
  | "unknown-order"
  | "nothing-to-modify";

export interface Rejected {
  ok: false;
  reason: RejectReason;
  message: string;
}

export interface PlaceAccepted {
  ok: true;
  trades: Trade[];
}

export interface ModifyAccepted {
  ok: true;
  trades: Trade[];
  keptPriority: boolean;
}

export type PlaceResult = PlaceAccepted | Rejected;

export type ModifyResult = ModifyAccepted | Rejected;

export interface ModifyChanges {
  price?: number;
  quantity?: number;
  timestamp: number;
}

export type BookEvent =
  | { type: "order-submitted"; order: Order }
  | { type: "order-cancelled"; orderId: string }
  | { type: "order-modified"; orderId: string; changes: ModifyChanges };

export interface LoggedEvent {
  eventId: number;
  event: BookEvent;
}

export interface Recording {
  config: BookConfig;
  events: LoggedEvent[];
}
