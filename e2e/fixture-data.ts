import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Expected values come from the reviewed fixture (same data the seeder writes to Shopware).
interface FixtureProduct {
  productNumber: string;
  name: string;
  categoryPath: string[];
  price: { gross: number };
  demo: { series?: string; mapPolicy: string; dealerTiers: { minQty: number; gross: number }[] };
}
const site = JSON.parse(readFileSync(fileURLToPath(new URL("../data/fixture/site-project.json", import.meta.url)), "utf8")) as {
  products: FixtureProduct[];
  series: { code: string; tiers: { minQty: number; discountPct: number }[] }[];
};

export const product = (sku: string) => {
  const p = site.products.find((x) => x.productNumber === sku);
  if (!p) throw new Error(`fixture has no ${sku}`);
  return p;
};
export const dealerAt = (sku: string, qty: number) => {
  let unit = product(sku).demo.dealerTiers[0]!.gross;
  for (const t of product(sku).demo.dealerTiers) if (t.minQty <= qty) unit = t.gross;
  return unit;
};
export const seriesMembers = (code: string) => site.products.filter((p) => p.demo.series === code).map((p) => p.productNumber);
export const mapSkus = () => site.products.filter((p) => p.demo.mapPolicy === "hide_until_cart").map((p) => p.productNumber);
export const series = (code: string) => site.series.find((s) => s.code === code)!;

// Fitment expectations come from the generated index (the same file the app bundles).
interface FitmentIndexFile {
  vehicles: Record<string, { make: string; model: string; years: [number, number] }>;
  byVehicleYear: Record<string, string[]>;
  byProduct: Record<string, string[]>;
  universal: string[];
  skuById: Record<string, string>;
}
export const fitmentIndex = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/fitment-index.json", import.meta.url)), "utf8"),
) as FitmentIndexFile;
const idBySku = Object.fromEntries(Object.entries(fitmentIndex.skuById).map(([id, sku]) => [sku, id]));
export const universalSkus = () => fitmentIndex.universal.map((id) => fitmentIndex.skuById[id]!);
/** SKUs shown for a vehicle: parts that fit that model year plus universal parts. */
export const allowedSkus = (key: string, year: number) =>
  new Set([...(fitmentIndex.byVehicleYear[`${key}|${year}`] ?? []), ...fitmentIndex.universal].map((id) => fitmentIndex.skuById[id]!));
export const fitmentOf = (sku: string) => fitmentIndex.byProduct[idBySku[sku]!] ?? [];
export const inTopCategory = (top: string) => site.products.filter((p) => p.categoryPath[0] === top).map((p) => p.productNumber);

// B2B fixture (S7–S10): the seeded shopping list and employees.
const b2bFixture = JSON.parse(readFileSync(fileURLToPath(new URL("../data/fixture/site-project.json", import.meta.url)), "utf8")).b2b as {
  employees: { firstName: string; lastName: string; email: string }[];
  roles: { name: string }[];
  shoppingLists: { name: string; items: { productNumber: string; quantity: number }[] }[];
};
export const seededList = () => b2bFixture.shoppingLists[0]!;
export const juniorEmployee = () => b2bFixture.employees[0]!;
export const roleNames = () => b2bFixture.roles.map((r) => r.name);
