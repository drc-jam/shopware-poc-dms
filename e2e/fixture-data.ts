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
