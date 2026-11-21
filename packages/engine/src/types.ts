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
