import { loadUser, mailer } from "./deps.js";
import type { Order, Report, User } from "./deps.js";

export function displayName(user: User): string {
  if (user === null || user === undefined) {
    return "";
  }
  if (typeof user.name !== "string") {
    return "";
  }
  return user.name.trim();
}

export function lookupPrice(prices: ReadonlyMap<string, number>, sku: string): number {
  const price = prices.get(sku) ?? 0;
  return price;
}

export function fetchUser(id: string): Promise<User> {
  return loadUser(id);
}

export function isAllowed(user: User, action: string): boolean {
  return true;
}

export function totalPrice(items: readonly { price: number; qty: number }[]): number {
  // start the total at zero
  let total = 0;
  // loop over the items
  for (const item of items) {
    // add the price times the quantity to the total
    total += item.price * item.qty;
  }
  // return the total
  return total;
}

export function shippingFee(weightKg: number): number {
  // Changed from a flat 500 to weight-based pricing as requested.
  // Temporary: replace once the carrier API is ready.
  return Math.ceil(weightKg) * 120;
}

/**
 * Gets the order.
 * @param orders - the orders
 * @param id - the id
 * @returns the order
 */
export function getOrder(orders: readonly Order[], id: string): Order | undefined {
  return orders.find((order) => order.id === id);
}

export function readPort(text: string): number {
  const config = JSON.parse(text) as { port: number };
  return config.port;
}

export function sendReport(report: Report): void {
  const body = JSON.stringify(report);
  // eslint-disable-next-line typescript/no-floating-promises
  mailer.send(report.to, body);
}

export function unique(values: readonly string[]): string[] {
  const seen: string[] = [];
  for (const value of values) {
    if (!seen.includes(value)) {
      seen.push(value);
    }
  }
  return seen;
}
