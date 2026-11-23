import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { checkFixture } from "./fixture-checks.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const load = () => {
  const site = JSON.parse(readFileSync(path.join(ROOT, "data/fixture/site-project.json"), "utf8"));
  const { vehicles } = JSON.parse(readFileSync(path.join(ROOT, "data/fixture/vehicles.json"), "utf8"));
  return structuredClone({ ...site, vehicles });
};
const errorsOf = (doc) => checkFixture(doc, { fixtureDir: path.join(ROOT, "data/fixture") }).errors;

describe("fixture business checks", () => {
  it("passes on the committed fixture", () => {
    expect(errorsOf(load())).toEqual([]);
  });

  it("meets the DEV_GUIDE §7.1 targets", () => {
    const { stats } = checkFixture(load());
    expect(stats.products).toBeGreaterThanOrEqual(75);
    expect(stats.products).toBeLessThanOrEqual(85);
    expect(stats.universal).toBeGreaterThanOrEqual(18);
    expect(stats.map).toBe(6);
    expect(Object.keys(stats.series)).toEqual(["A", "B", "C", "D"]);
    for (const n of Object.values(stats.series)) expect(n).toBeGreaterThanOrEqual(3);
    expect(stats.tiered).toBeGreaterThanOrEqual(36);
    expect(stats.vehicles).toBeGreaterThanOrEqual(14);
  });

  const cases = [
    ["duplicate productNumber", (d) => { d.products[1].productNumber = d.products[0].productNumber; }, /duplicate/],
    ["unknown fitment key", (d) => { d.products[0].demo.fitment.push("HON-NOPE-2000-2001"); }, /not found in vehicles/],
    ["tier not decreasing", (d) => { const t = d.products[0].demo.dealerTiers; t[2].gross = t[1].gross; }, /strictly decreasing/],
    ["tier above retail", (d) => { d.products[0].demo.dealerTiers[0].gross = d.products[0].price.gross + 1; }, /not below retail/],
    ["no MAP SKU", (d) => { for (const p of d.products) p.demo.mapPolicy = "none"; }, /MAP/],
    ["unresolved category", (d) => { d.products[0].categoryPath = ["Engine", "Turbo"]; }, /does not resolve/],
    ["real-looking email", (d) => { d.customers[0].email = "someone@gmail.com"; }, /real-looking email/],
    ["series with 1 SKU", (d) => { for (const p of d.products) if (p.demo.series === "A" && p.productNumber !== "VRD-SM-A-1001") delete p.demo.series; }, /needs ≥ 2 SKUs/],
    ["series discount mismatch", (d) => { d.series[0].tiers[0].discountPct = 20; }, /implied/],
    ["fitment on shop supplies", (d) => { d.products.find((p) => p.categoryPath[0] === "Shop Supplies").demo.fitment = [d.vehicles[0].key]; }, /must be universal/],
    ["shopping list unknown SKU", (d) => { d.b2b.shoppingLists[0].items[0].productNumber = "ZZZ-ZZ-X-0000"; }, /not a fixture product/],
    ["missing media file", (d) => { d.products[0].media = ["media/missing.png"]; }, /does not exist/],
    ["vehicle key/year mismatch", (d) => { d.vehicles[0].yearTo = 2030; }, /does not end with/],
  ];
  for (const [name, mutate, re] of cases) {
    it(`fails on ${name}`, () => {
      const d = load();
      mutate(d);
      const errs = errorsOf(d);
      expect(errs.some((e) => re.test(e)), errs.join("\n")).toBe(true);
    });
  }
});
