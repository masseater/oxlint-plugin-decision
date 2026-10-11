import { loadUser } from "./deps.js";
import type { Order, Report, User } from "./deps.js";

export function displayName(user: User): string {
  return user.name.trim();
}

export function lookupPrice(prices: ReadonlyMap<string, number>, sku: string): number {
  const price = prices.get(sku);
  if (price === undefined) {
    throw new Error(`no price for ${sku}`);
  }
  return price;
}

export function fetchUser(id: string): Promise<User> {
  return loadUser(id.trim().toLowerCase());
}

export function isAllowed(user: User, action: string): boolean {
  return user.permissions.includes(action);
}

export function totalPrice(items: readonly { price: number; qty: number }[]): number {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function shippingFee(weightKg: number): number {
  // The carrier bills every started kilogram, so partial weights round up.
  return Math.ceil(weightKg) * 120;
}

/** Returns undefined when no order has this id. Ids are compared case-sensitively. */
export function getOrder(orders: readonly Order[], id: string): Order | undefined {
  return orders.find((order) => order.id === id);
}

export function readPort(text: string): number {
  const config: unknown = JSON.parse(text);
  if (
    typeof config === "object" &&
    config !== null &&
    "port" in config &&
    typeof config.port === "number"
  ) {
    return config.port;
  }
  throw new Error("the config has no numeric port");
}

export function printReport(report: Report): void {
  // eslint-disable-next-line no-console -- this command prints the report to stdout by design
  console.log(JSON.stringify(report, null, 2));
}

export function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
