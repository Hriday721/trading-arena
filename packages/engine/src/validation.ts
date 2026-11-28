import type { BookConfig, Order, Rejected, RejectReason } from "./types";

export function rejection(reason: RejectReason, message: string): Rejected {
  return { ok: false, reason, message };
}

export function checkQuantity(
  quantity: number,
  config: BookConfig,
): Rejected | undefined {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return rejection(
      "invalid-quantity",
      "Quantity must be a whole number above zero",
    );
  }
  if (quantity % config.lotSize !== 0) {
    return rejection(
      "lot-size",
      `Quantity must be a multiple of the lot size (${config.lotSize})`,
    );
  }
  return undefined;
}

export function checkPrice(
  price: number,
  config: BookConfig,
): Rejected | undefined {
  if (!Number.isInteger(price) || price <= 0) {
    return rejection(
      "invalid-price",
      "Price must be a whole number of paise above zero",
    );
  }
  if (price % config.tickSize !== 0) {
    return rejection(
      "tick-size",
      `Price must be a multiple of the tick size (${config.tickSize} paise)`,
    );
  }
  return undefined;
}

export function validateNewOrder(
  order: Order,
  config: BookConfig,
): Rejected | undefined {
  const quantityProblem = checkQuantity(order.quantity, config);
  if (quantityProblem) return quantityProblem;
  if (order.type === "limit") return checkPrice(order.price, config);
  if (order.type === "stop") return checkPrice(order.stopPrice, config);
  return undefined;
}
