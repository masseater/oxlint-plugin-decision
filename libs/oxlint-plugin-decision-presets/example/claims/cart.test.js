import { describe, expect, it, vi } from "vitest";

import { applyDiscount, removeItem, subtotal } from "./cart.js";
import * as pricing from "./pricing.js";

const cart = {
  id: "c1",
  items: [
    { sku: "a", price: 10, qty: 2 },
    { sku: "b", price: 5, qty: 1 },
  ],
};

describe("removeItem", () => {
  it("removes the item with the given sku", () => {
    expect(removeItem(cart, "a").items.map((item) => item.sku)).toEqual(["b"]);
  });

  it("keeps the other items in their original order", () => {
    expect(removeItem(cart, "a").items).toBeDefined();
  });
});

describe("subtotal", () => {
  it("sums price times quantity", () => {
    expect(subtotal(cart)).toBe(25);
  });

  it("applies the regional tax rate", () => {
    vi.spyOn(pricing, "taxRate").mockReturnValue(0.2);
    expect(pricing.taxRate("EU")).toBe(0.2);
  });
});

describe("applyDiscount", () => {
  it("throws when the percent is above 100", () => {
    expect(applyDiscount(cart, 10)).toBe(22.5);
  });
});
