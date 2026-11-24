// Mock Store API catalog + pricing engine, built from the reviewed fixture (data/fixture/).
// Emulates the Shopware 6.7 Store API response SHAPES the app relies on. It is not Shopware:
// the real pricing/promotion behavior is verified against the instance in Phase 0/2 (seed:verify).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const site = JSON.parse(readFileSync(path.join(ROOT, "data/fixture/site-project.json"), "utf8"));

const md5 = (s) => createHash("md5").update(s).digest("hex");
export const categoryId = (pathArr) => md5(`category:${pathArr.join(" > ")}`);
export const productId = (sku) => md5(`product:${sku}`); // = stableId("product", sku), DEV_GUIDE §8
const manufacturerId = (name) => md5(`manufacturer:${name}`);
const round = (n) => Math.round(n * 100) / 100;

export const series = site.series;

export const categories = site.categories.map((c) => ({
  id: categoryId(c.path),
  path: c.path,
  name: c.path.at(-1),
  translated: { name: c.path.at(-1) },
  breadcrumb: c.path,
  description: c.description ?? null,
}));

export const products = site.products.map((p) => {
  const id = productId(p.productNumber);
  const media = p.media.map((m, i) => ({
    id: md5(`media:${p.productNumber}:${i}`),
    media: { id: md5(`m:${m}`), url: `__MOCK_BASE__/${m}`, alt: p.name, metaData: { width: 800, height: 800 } },
    position: i,
  }));
  const customFields = { demo_series: p.demo.series ?? null, demo_map_policy: p.demo.mapPolicy };
  return {
    id,
    productNumber: p.productNumber,
    name: p.name,
    description: p.description ?? "",
    translated: { name: p.name, description: p.description ?? "", customFields },
    customFields,
    manufacturer: { id: manufacturerId(p.brand), name: p.brand, translated: { name: p.brand } },
    manufacturerId: manufacturerId(p.brand),
    stock: p.stock,
    availableStock: p.stock,
    available: p.stock > 0,
    categoryPath: p.categoryPath,
    categoryTree: p.categoryPath.map((_, i) => categoryId(p.categoryPath.slice(0, i + 1))),
    cover: media[0] ?? null,
    media,
    // pricing inputs (stripped from responses)
    _retail: p.price.gross,
    _dealerTiers: p.demo.dealerTiers,
    _series: p.demo.series ?? null,
  };
});
export const productById = new Map(products.map((p) => [p.id, p]));

const priceObj = (unit, qty, retail) => ({
  unitPrice: unit,
  quantity: qty,
  totalPrice: round(unit * qty),
  calculatedTaxes: [],
  taxRules: [],
  referencePrice: null,
  listPrice:
    retail !== undefined && retail > unit
      ? { price: retail, discount: round(unit - retail), percentage: round(((retail - unit) / retail) * 100) }
      : null,
  regulationPrice: null,
});

/** Dealer unit price for a quantity (highest tier whose minQty ≤ qty). */
export function unitPriceFor(p, group, qty) {
  if (group !== "Dealer") return p._retail;
  let unit = p._dealerTiers[0].gross;
  for (const t of p._dealerTiers) if (t.minQty <= qty) unit = t.gross;
  return unit;
}

/** Product as the Store API returns it in the given customer-group context. */
export function priced(p, group, base) {
  const { _retail, _dealerTiers, _series, categoryPath, ...rest } = p;
  const fixUrl = (m) => (m ? { ...m, media: { ...m.media, url: m.media.url.replace("__MOCK_BASE__", base) } } : m);
  const out = { ...rest, cover: fixUrl(rest.cover), media: rest.media.map(fixUrl) };
  if (group === "Dealer") {
    // Shopware: calculatedPrices[i].quantity is the END of the tier range; the last tier carries its start.
    out.calculatedPrices = _dealerTiers.map((t, i) => {
      const next = _dealerTiers[i + 1];
      return priceObj(t.gross, next ? next.minQty - 1 : t.minQty, _retail);
    });
    out.calculatedPrice = priceObj(_dealerTiers[0].gross, 1, _retail);
    out.calculatedCheapestPrice = priceObj(_dealerTiers.at(-1).gross, 1, _retail);
  } else {
    out.calculatedPrices = [];
    out.calculatedPrice = priceObj(_retail, 1);
    out.calculatedCheapestPrice = priceObj(_retail, 1);
  }
  return out;
}

const SORTINGS = [
  { key: "name-asc", label: "Name A–Z", cmp: (a, b) => a.name.localeCompare(b.name) },
  { key: "name-desc", label: "Name Z–A", cmp: (a, b) => b.name.localeCompare(a.name) },
  { key: "price-asc", label: "Price low to high", cmp: (a, b) => a.calculatedPrice.unitPrice - b.calculatedPrice.unitPrice },
  { key: "price-desc", label: "Price high to low", cmp: (a, b) => b.calculatedPrice.unitPrice - a.calculatedPrice.unitPrice },
];

function applyCriteria(list, body) {
  let out = list;
  for (const f of body.filter ?? []) {
    if (f.type === "equalsAny" && f.field === "id" && Array.isArray(f.value)) {
      const set = new Set(f.value);
      out = out.filter((p) => set.has(p.id));
    } else if (f.type === "equalsAny" && f.field === "productNumber" && Array.isArray(f.value)) {
      const set = new Set(f.value);
      out = out.filter((p) => set.has(p.productNumber));
    } else if (f.type === "equals" && f.field === "productNumber") {
      out = out.filter((p) => p.productNumber === f.value);
    }
  }
  if (Array.isArray(body.ids)) {
    const set = new Set(body.ids);
    out = out.filter((p) => set.has(p.id));
  }
  return out;
}

/** Listing result (product-listing / search) in Shopware's ProductListingResult shape. */
export function listing(source, body, group, base) {
  let list = applyCriteria(source, body).map((p) => priced(p, group, base));
  const manufacturers = [...new Map(list.map((p) => [p.manufacturer.id, p.manufacturer])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const prices = list.map((p) => p.calculatedPrice.unitPrice);
  if (typeof body.manufacturer === "string" && body.manufacturer) {
    const ids = new Set(body.manufacturer.split("|"));
    list = list.filter((p) => ids.has(p.manufacturer.id));
  }
  const order = SORTINGS.find((s) => s.key === body.order) ?? SORTINGS[0];
  list = [...list].sort(order.cmp);
  const limit = Math.min(Math.max(Number(body.limit) || 24, 1), 100);
  const page = Math.max(Number(body.p) || 1, 1);
  return {
    apiAlias: "product_listing",
    total: list.length,
    page,
    limit,
    elements: list.slice((page - 1) * limit, page * limit),
    aggregations: {
      manufacturer: { entities: manufacturers },
      price: { min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 },
    },
    sorting: order.key,
    availableSortings: SORTINGS.map(({ key, label }) => ({ key, label, translated: { label } })),
    currentFilters: { manufacturer: body.manufacturer ? body.manufacturer.split("|") : [] },
  };
}

export function inCategory(catId) {
  return products.filter((p) => p.categoryTree.includes(catId));
}

export function search(term) {
  const words = String(term ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return products.filter((p) => {
    const hay = `${p.name} ${p.productNumber} ${p.manufacturer.name}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/**
 * Cart calculation, including series promotions as configured after Phase 0 decision D1
 * ("all units", verified on Shopware 6.7.16): Dealer only; per series pick the highest tier whose
 * minQty ≤ total series qty (higher tier excludes lower); the percentage applies to EVERY series unit
 * in the cart (cart rule on total series quantity + discount rule = series items; no set-group packages).
 */
export function calculateCart(token, items, group, base) {
  const lineItems = [];
  for (const [id, quantity] of items) {
    const p = productById.get(id);
    if (!p) continue;
    const unit = unitPriceFor(p, group, quantity);
    const pp = priced(p, group, base);
    lineItems.push({
      id,
      referencedId: id,
      type: "product",
      label: p.name,
      quantity,
      good: true,
      removable: true,
      stackable: true,
      cover: pp.cover?.media ?? null,
      price: priceObj(unit, quantity, group === "Dealer" ? p._retail : undefined),
      payload: { productNumber: p.productNumber, customFields: p.customFields, manufacturerId: p.manufacturerId },
    });
  }

  if (group === "Dealer") {
    for (const s of series) {
      const units = [];
      for (const li of lineItems) {
        if (productById.get(li.id)?._series !== s.code) continue;
        for (let i = 0; i < li.quantity; i++) units.push(li.price.unitPrice);
      }
      const tier = [...s.tiers].sort((a, b) => b.minQty - a.minQty).find((t) => units.length >= t.minQty);
      if (!tier) continue;
      const discountBase = units.reduce((n, u) => n + u, 0);
      const discount = round((discountBase * tier.discountPct) / 100);
      lineItems.push({
        id: `promotion-series-${s.code}-${tier.minQty}`,
        referencedId: null,
        type: "promotion",
        label: `${s.label} mix-and-match — ${tier.minQty}+ tier`,
        quantity: 1,
        good: false,
        removable: false,
        price: priceObj(-discount, 1),
        payload: { promotionId: md5(`promo:${s.code}:${tier.minQty}`), discountType: "percentage", value: String(tier.discountPct), code: "" },
      });
    }
  }

  const positionPrice = round(lineItems.reduce((n, li) => n + li.price.totalPrice, 0));
  return {
    apiAlias: "cart",
    token,
    lineItems,
    price: { netPrice: positionPrice, totalPrice: positionPrice, positionPrice, rawTotal: positionPrice, taxStatus: "gross", calculatedTaxes: [] },
    errors: {},
  };
}

/** Main navigation tree (depth 2) in Shopware's navigation shape, derived from the fixture categories. */
export const navigation = categories
  .filter((c) => c.path.length === 1)
  .map((root) => ({
    id: root.id,
    name: root.name,
    translated: { name: root.name },
    type: "page",
    visible: true,
    active: true,
    children: categories
      .filter((c) => c.path.length === 2 && c.path[0] === root.name)
      .map((c) => ({ id: c.id, name: c.name, translated: { name: c.name }, type: "page", visible: true, active: true, children: [] })),
  }));
