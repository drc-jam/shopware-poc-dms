import { describe, expect, it } from "vitest";
import { displayPrice, hidesPrice, tiersOf, unitPriceAt } from "./pricing";
import type { Product } from "./shopware/types";

const lp = (price: number, unit: number) => ({ price, discount: unit - price, percentage: 0 });
const dealer: Pick<Product, "calculatedPrice" | "calculatedPrices" | "translated" | "customFields"> = {
  calculatedPrice: { unitPrice: 38.49, quantity: 1, totalPrice: 38.49, listPrice: lp(54.99, 38.49) },
  calculatedPrices: [
    { unitPrice: 38.49, quantity: 4, totalPrice: 0, listPrice: lp(54.99, 38.49) },
    { unitPrice: 36.59, quantity: 9, totalPrice: 0, listPrice: lp(54.99, 36.59) },
    { unitPrice: 34.69, quantity: 24, totalPrice: 0, listPrice: lp(54.99, 34.69) },
    { unitPrice: 32.99, quantity: 25, totalPrice: 0, listPrice: lp(54.99, 32.99) },
  ],
  customFields: { demo_series: "C", demo_map_policy: "none" },
};

describe("pricing rules", () => {
  it("rebuilds tier ranges from Shopware calculatedPrices", () => {
    expect(tiersOf(dealer.calculatedPrices).map((t) => [t.from, t.to])).toEqual([[1, 4], [5, 9], [10, 24], [25, null]]);
  });
  it("picks the unit price at each break", () => {
    expect([1, 4, 5, 9, 10, 24, 25, 100].map((q) => unitPriceAt(dealer, q))).toEqual([38.49, 38.49, 36.59, 36.59, 34.69, 34.69, 32.99, 32.99]);
  });
  it("shows the dealer qty-1 price with the retail reference (S1/S2)", () => {
    const d = displayPrice(dealer, "dealer-admin");
    expect(d).toMatchObject({ kind: "price", unit: 38.49, list: 54.99, label: "Your price", tiersFrom: 32.99 });
  });
  it("shows retail only when there is no reference price", () => {
    const r = displayPrice({ calculatedPrice: { unitPrice: 54.99, quantity: 1, totalPrice: 54.99 }, calculatedPrices: [] }, "retail");
    expect(r).toMatchObject({ unit: 54.99, list: null, label: "Price", tiersFrom: null });
  });
  it("hides MAP prices for retail-facing personas only (S5)", () => {
    const map = { customFields: { demo_map_policy: "hide_until_cart" } };
    expect(hidesPrice(map, "guest")).toBe(true);
    expect(hidesPrice(map, "retail")).toBe(true);
    expect(hidesPrice(map, "dealer-admin")).toBe(false);
    expect(hidesPrice(map, "dealer-junior")).toBe(false);
  });
});
