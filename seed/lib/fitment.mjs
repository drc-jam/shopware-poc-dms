// App-side fitment index (DEV_GUIDE §8). Pure; IDs are stableId("product", productNumber).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./env.mjs";
import { stableId } from "./stable-id.mjs";

export const FITMENT_INDEX = path.join(ROOT, "data/fitment-index.json");

export function buildFitmentIndex(fx, salesChannelId) {
  const pid = (sku) => stableId("product", sku);
  const vehicles = {};
  const makes = {};
  for (const v of [...fx.vehicles].sort((a, b) => a.key.localeCompare(b.key))) {
    vehicles[v.key] = { make: v.make, model: v.model, years: [v.yearFrom, v.yearTo], type: v.type };
    (makes[v.make] ??= new Set()).add(v.model);
  }
  const byProduct = {};
  const byVehicleYear = {};
  const universal = [];
  const skuById = {};
  for (const p of fx.products) {
    const id = pid(p.productNumber);
    skuById[id] = p.productNumber;
    const fits = p.demo.fitment ?? [];
    if (!fits.length) {
      universal.push(id);
      continue;
    }
    byProduct[id] = [...fits].sort();
    for (const key of fits) {
      const v = vehicles[key];
      if (!v) throw new Error(`${p.productNumber}: unknown vehicle ${key}`);
      for (let y = v.years[0]; y <= v.years[1]; y++) (byVehicleYear[`${key}|${y}`] ??= []).push(id);
    }
  }
  const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  for (const k of Object.keys(byVehicleYear)) byVehicleYear[k].sort();
  return {
    version: 1,
    generatedAt: null,
    salesChannelId,
    vehicles,
    makes: sortObj(Object.fromEntries(Object.entries(makes).map(([m, s]) => [m, [...s].sort()]))),
    byVehicleYear: sortObj(byVehicleYear),
    byProduct: sortObj(byProduct),
    universal: universal.sort(),
    skuById: sortObj(skuById),
  };
}

/** Writes data/fitment-index.json; keeps the previous generatedAt when nothing else changed. */
export function writeFitmentIndex(index) {
  let action = "created";
  if (existsSync(FITMENT_INDEX)) {
    const prev = JSON.parse(readFileSync(FITMENT_INDEX, "utf8"));
    const same = JSON.stringify({ ...prev, generatedAt: null }) === JSON.stringify({ ...index, generatedAt: null });
    action = same ? "unchanged" : "updated";
    index.generatedAt = same ? prev.generatedAt : new Date().toISOString();
  } else {
    index.generatedAt = new Date().toISOString();
  }
  writeFileSync(FITMENT_INDEX, JSON.stringify(index, null, 2) + "\n");
  return action;
}
