import { describe, expect, it } from "vitest";
import { loadFixture } from "./fixture.mjs";
import { buildFitmentIndex } from "./fitment.mjs";
import { stableId } from "./stable-id.mjs";

const fx = loadFixture();
const idx = buildFitmentIndex(fx, "a".repeat(32));

describe("fitment index", () => {
  it("covers every product exactly once: fitment-specific or universal", () => {
    const fit = Object.keys(idx.byProduct);
    expect(fit.length + idx.universal.length).toBe(fx.products.length);
    expect(new Set([...fit, ...idx.universal]).size).toBe(fx.products.length);
  });

  it("uses stableId('product', productNumber)", () => {
    for (const p of fx.products) expect(idx.skuById[stableId("product", p.productNumber)]).toBe(p.productNumber);
  });

  it("lists a product under every year of every vehicle it fits", () => {
    const p = fx.products.find((x) => x.demo.fitment?.length);
    const id = stableId("product", p.productNumber);
    for (const key of p.demo.fitment) {
      const v = idx.vehicles[key];
      for (let y = v.years[0]; y <= v.years[1]; y++) expect(idx.byVehicleYear[`${key}|${y}`]).toContain(id);
      expect(idx.byVehicleYear[`${key}|${v.years[1] + 1}`] ?? []).not.toContain(id);
    }
  });

  it("groups models by make for the YMM selector", () => {
    for (const v of fx.vehicles) expect(idx.makes[v.make]).toContain(v.model);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(buildFitmentIndex(loadFixture(), "a".repeat(32)))).toBe(JSON.stringify(idx));
  });
});
