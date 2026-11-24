import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { plannedMinutes, tour, TourSchema, TOUR_BUDGET_MINUTES } from "./tour";
import { parseVehicle } from "./fitment";

const fx = JSON.parse(readFileSync(new URL("../data/fixture/site-project.json", import.meta.url), "utf8"));
const skus = new Set(fx.products.map((p: { productNumber: string }) => p.productNumber));

describe("presenter tour (data/tour.json)", () => {
  it("covers S1–S10 in order", () => {
    expect(tour.steps.map((s) => s.id)).toEqual(Array.from({ length: 10 }, (_, i) => `S${i + 1}`));
  });

  it(`fits the ${TOUR_BUDGET_MINUTES}-minute budget`, () => {
    expect(plannedMinutes()).toBeLessThanOrEqual(TOUR_BUDGET_MINUTES);
  });

  it("references only fixture SKUs, categories, lists and valid vehicles", () => {
    const cats = new Set(fx.categories.map((c: { path: string[] }) => c.path.join(" > ")));
    const lists = new Set(fx.b2b.shoppingLists.map((l: { name: string }) => l.name));
    for (const s of tour.steps) {
      for (const r of s.runs) {
        const t = r.target;
        if (t.type === "product") expect(skus.has(t.sku), `${s.id} ${t.sku}`).toBe(true);
        if (t.type === "category") expect(cats.has(t.path.join(" > ")), `${s.id} ${t.path}`).toBe(true);
        if (t.type === "list") expect(lists.has(t.name), `${s.id} ${t.name}`).toBe(true);
        for (const c of r.setup?.cart ?? []) expect(skus.has(c.sku), `${s.id} cart ${c.sku}`).toBe(true);
        if (r.setup?.vehicle) expect(parseVehicle(r.setup.vehicle), `${s.id} ${r.setup.vehicle}`).not.toBeNull();
      }
    }
  });

  it("only allows in-app deep links (no open redirect through /api/tour)", () => {
    const bad = structuredClone(JSON.parse(readFileSync(new URL("../data/tour.json", import.meta.url), "utf8")));
    bad.steps[0].runs[0].target = { type: "path", href: "https://evil.example.com" };
    expect(TourSchema.safeParse(bad).success).toBe(false);
    bad.steps[0].runs[0].target = { type: "path", href: "//evil.example.com" };
    expect(TourSchema.safeParse(bad).success).toBe(false);
  });

  it("never stages more than the declared persona actions (no checkout targets)", () => {
    for (const s of tour.steps) for (const r of s.runs) expect(JSON.stringify({ target: r.target, setup: r.setup })).not.toMatch(/checkout\/order|pending-order|approve|decline/);
  });
});
