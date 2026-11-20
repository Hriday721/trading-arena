export type Side = "buy" | "sell";

export type OrderType = "limit" | "market";

export interface Order {
  id: string;
  traderId: string;
  side: Side;
  type: OrderType;
  price: number;
  quantity: number;
  timestamp: number;
}

export interface Trade {
  sequence: number;
  aggressor: Side;
  buyOrderId: string;
  sellOrderId: string;
  price: number;
  quantity: number;
  timestamp: number;
}
