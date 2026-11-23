// Price display rules (DEV_GUIDE §6.3, §6.5). Pure and client-safe.
import type { ActivePersona } from "./personas";
import type { CalculatedPrice, Product } from "./shopware/types";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = (n: number) => usd.format(n);

export const isDealer = (p: ActivePersona) => p === "dealer-admin" || p === "dealer-junior";

export const customField = (p: Pick<Product, "translated" | "customFields">, key: string): unknown =>
  p.translated?.customFields?.[key] ?? p.customFields?.[key] ?? null;

export const seriesOf = (p: Pick<Product, "translated" | "customFields">): string | null => {
  const v = customField(p, "demo_series");
  return typeof v === "string" && v ? v : null;
};

export const mapPolicyOf = (p: Pick<Product, "translated" | "customFields">) =>
  customField(p, "demo_map_policy") === "hide_until_cart" ? "hide_until_cart" : "none";

/** MAP is an app rule: retail-facing personas (guest, retail) see "See price in cart". Dealers always see their price. */
export const hidesPrice = (p: Pick<Product, "translated" | "customFields">, persona: ActivePersona) =>
  mapPolicyOf(p) === "hide_until_cart" && !isDealer(persona);

export interface Tier {
  from: number;
  to: number | null;
  unitPrice: number;
  listPrice: number | null;
}

/** Rebuild tier ranges from Shopware calculatedPrices (quantity = END of range; last = START). */
export function tiersOf(prices: CalculatedPrice[] | undefined | null): Tier[] {
  const list = prices ?? [];
  return list.map((p, i) => {
    const from = i === 0 ? 1 : (list[i - 1]?.quantity ?? 0) + 1;
    const last = i === list.length - 1;
    return { from: last && i > 0 ? p.quantity : from, to: last ? null : p.quantity, unitPrice: p.unitPrice, listPrice: p.listPrice?.price ?? null };
  });
}

/** Unit price for a quantity, from tiers (falls back to calculatedPrice). */
export function unitPriceAt(product: Pick<Product, "calculatedPrice" | "calculatedPrices">, qty: number): number {
  const tiers = tiersOf(product.calculatedPrices);
  let unit = tiers[0]?.unitPrice ?? product.calculatedPrice.unitPrice;
  for (const t of tiers) if (t.from <= qty) unit = t.unitPrice;
  return unit;
}

export interface DisplayPrice {
  kind: "price" | "map";
  /** qty-1 price for this persona (S2: the PLP shows the persona's qty-1 price, not the default). */
  unit: number;
  /** Retail reference (struck through) when the persona's price is below it. */
  list: number | null;
  label: "Your price" | "Price";
  /** Lowest tier price when tiers exist. */
  tiersFrom: number | null;
}

export function displayPrice(product: Pick<Product, "calculatedPrice" | "calculatedPrices" | "translated" | "customFields">, persona: ActivePersona): DisplayPrice {
  const first = product.calculatedPrices?.[0] ?? product.calculatedPrice;
  const list = first.listPrice && first.listPrice.price > first.unitPrice ? first.listPrice.price : null;
  const tiers = product.calculatedPrices ?? [];
  return {
    kind: hidesPrice(product, persona) ? "map" : "price",
    unit: first.unitPrice,
    list,
    label: isDealer(persona) ? "Your price" : "Price",
    tiersFrom: tiers.length > 1 ? Math.min(...tiers.map((t) => t.unitPrice)) : null,
  };
}

/** Client-safe product summary passed to client components (no unneeded payload). */
export interface ProductSummary {
  id: string;
  productNumber: string;
  name: string;
  brand: string | null;
  image: string | null;
  series: string | null;
  price: DisplayPrice;
  tiers: Tier[];
  available: boolean;
}

export function summarize(p: Product, persona: ActivePersona): ProductSummary {
  return {
    id: p.id,
    productNumber: p.productNumber,
    name: p.translated?.name ?? p.name ?? p.productNumber,
    brand: p.manufacturer?.translated?.name ?? p.manufacturer?.name ?? null,
    image: p.cover?.media.url ?? null,
    series: seriesOf(p),
    price: displayPrice(p, persona),
    tiers: isDealer(persona) ? tiersOf(p.calculatedPrices) : [],
    available: p.available !== false && (p.availableStock ?? p.stock ?? 1) > 0,
  };
}
