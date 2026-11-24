#!/usr/bin/env node
// tour:generate — writes data/tour.json (the /tour presenter script, DEV_GUIDE §9.4) from the fixture.
//
// Regeneration keeps presenter edits: for a step id that already exists, the text fields (title, talkingPoints,
// expected, minutes, dmsRef) are preserved; only the `runs` (persona, target, setup) are refreshed from the
// fixture, unless the step has "lockRuns": true. Re-run after re-skinning the fixture for a new prospect.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FILE = path.join(ROOT, "data/tour.json");
const fx = JSON.parse(readFileSync(path.join(ROOT, "data/fixture/site-project.json"), "utf8"));
const vehicles = JSON.parse(readFileSync(path.join(ROOT, "data/fixture/vehicles.json"), "utf8")).vehicles;

// ---- pick fixture items for each scenario (deterministic)
const tiered = fx.products.find((p) => !p.demo.series && p.demo.dealerTiers.length >= 4 && p.demo.mapPolicy === "none");
const series = fx.series[0];
const [seriesA, seriesB] = fx.products.filter((p) => p.demo.series === series.code);
const mapSku = fx.products.find((p) => p.demo.mapPolicy === "hide_until_cart");
const fitCounts = new Map();
for (const p of fx.products) for (const k of p.demo.fitment ?? []) fitCounts.set(k, (fitCounts.get(k) ?? 0) + 1);
const vehicle = [...vehicles].sort((a, b) => (fitCounts.get(b.key) ?? 0) - (fitCounts.get(a.key) ?? 0) || a.key.localeCompare(b.key))[0];
const vehicleYear = Math.round((vehicle.yearFrom + vehicle.yearTo) / 2);
const list = fx.b2b.shoppingLists[0];
const universalForQuickOrder = list.items.slice(0, 2).map((i) => i.productNumber);
const tier10 = series.tiers[0];
const tier25 = series.tiers.at(-1);
const vehicleLabel = `${vehicleYear} ${vehicle.make} ${vehicle.model}`;
const tieredCategory = tiered.categoryPath;

const sku = (p) => ({ type: "product", sku: p.productNumber });
const DEFAULTS = [
  {
    id: "S1", title: "Retail vs “Your price”", pillar: "Dealer pricing", minutes: 1.5,
    runs: [
      { label: "Show as Retail", persona: "retail", target: sku(tiered) },
      { label: "Show as Dealer Admin", persona: "dealer-admin", target: sku(tiered) },
    ],
    talkingPoints: [
      "DMS today: dealers and retail customers see the same default price until a custom price display is built.",
      "Shopware: one product, a Dealer customer-group rule with advanced prices. Retail sees one price; the dealer sees retail struck through and “Your price”.",
      "No extension and no price-list app: it is standard Rule Builder + advanced pricing.",
    ],
    expected: "Retail: a single price. Dealer Admin: retail struck through, “Your price” at the dealer qty-1 price, and a tier table.",
    dmsRef: { label: "Retail + 'Yours' price display", url: "https://app.clickup.com/t/868k5m8mz" },
  },
  {
    id: "S2", title: "Listing pages show the persona's price", pillar: "Dealer pricing", minutes: 1,
    runs: [{ label: "Open the category as Dealer Admin", persona: "dealer-admin", target: { type: "category", path: [tieredCategory[0]] } }],
    talkingPoints: [
      "DMS 11/18 feedback: price-list customers saw the default price on the category page and only their price on the product page.",
      "Shopware calculates prices in the customer's context for listings too (calculatedPrice / cheapest price), so the card already shows “Your price”.",
      "Same Store API call for every persona; the context token decides the price.",
    ],
    expected: "Every card shows the dealer qty-1 price labelled “Your price”, not the retail price.",
    dmsRef: { label: "11/18 Meeting Feedback", url: "https://app.clickup.com/t/1gage70c48a" },
  },
  {
    id: "S3", title: "Quantity tiers on the PDP and in the cart", pillar: "Dealer pricing", minutes: 1.5,
    runs: [{ label: "Open the cart with 4 in it", persona: "dealer-admin", target: { type: "path", href: "/cart" }, setup: { cart: [{ sku: tiered.productNumber, qty: 4 }] } }],
    talkingPoints: [
      "DMS needed quantity-break pricing visible on the product page and honoured in the cart.",
      "Shopware advanced prices carry quantity ranges (1 / 5 / 10 / 25); the PDP tier table and the cart re-pricing both come from the same data.",
      "Change the quantity from 4 to 5, then 10 and 25: the unit price steps down at each break with no custom code.",
    ],
    expected: "Cart line at qty 4 shows the next-break hint; changing to 5 / 10 / 25 lowers the unit price at each break.",
    dmsRef: { label: "Quantity tier pricing on PDP", url: "https://app.clickup.com/t/868k5m8n2" },
  },
  {
    id: "S4", title: "Cross-SKU series tiers (mix and match)", pillar: "Dealer pricing", minutes: 1.5,
    runs: [{
      label: `Open the cart with 5 + 5 ${series.label}`, persona: "dealer-admin", target: { type: "path", href: "/cart" },
      setup: { cart: [{ sku: seriesA.productNumber, qty: 5 }, { sku: seriesB.productNumber, qty: 5 }] },
    }],
    talkingPoints: [
      "DMS: quantities across SKUs in the same series must add up to reach a tier. BigCommerce needed a custom bridge app.",
      `Shopware: an automatic promotion per series tier with a Rule Builder condition on the series quantity: ${tier10.minQty}+ saves ${tier10.discountPct}%, ${tier25.minQty}+ saves ${tier25.discountPct}%, the higher tier replaces the lower.`,
      "Front and rear shocks, any chassis, count together; other products in the cart do not. No code.",
    ],
    expected: `The cart shows a “${series.label} mix-and-match — ${tier10.minQty}+ tier” savings line. Set one line to 4 and it disappears.`,
    dmsRef: { label: "Product Group Quantity Tier Pricing", url: "https://app.clickup.com/t/868k5m8mv" },
  },
  {
    id: "S5", title: "MAP: price hidden until the cart", pillar: "Dealer pricing", minutes: 1,
    runs: [
      { label: "Open a MAP product as Retail", persona: "retail", target: sku(mapSku), setup: { cart: [{ sku: mapSku.productNumber, qty: 1 }] } },
      { label: "Then the cart", persona: "retail", target: { type: "path", href: "/cart" } },
    ],
    talkingPoints: [
      "DMS flags MAP items so the advertised price is not shown below MAP on listing and product pages.",
      "The demo marks MAP items with a product custom field; the storefront shows “See price in cart” for retail and the real price in the cart.",
      "This is a storefront rule (stated openly); dealers always see their price.",
    ],
    expected: "PDP and listings show “See price in cart” for Retail; the cart shows the real price.",
    dmsRef: { label: "MAP compliance flags", url: "https://app.clickup.com/t/868k5m8n3" },
  },
  {
    id: "S6", title: "Shop by vehicle", pillar: "Vehicle fitment", minutes: 2,
    runs: [{
      label: `Shop Shocks for a ${vehicleLabel}`, persona: "retail",
      target: { type: "category", path: ["Shocks"] }, setup: { vehicle: `${vehicle.key}|${vehicleYear}` },
    }],
    talkingPoints: [
      "DMS relies on a third-party search and fitment app on BigCommerce.",
      "Here the year / make / model selector and My Garage filter category pages and search to parts that fit plus universal parts; the PDP shows a fit badge and a fitment table.",
      "Fitment is a data file generated with the catalog, so a production build can swap in a full ACES/PIES fitment service without changing pages.",
    ],
    expected: `The fitment bar reads “Showing parts that fit ${vehicleLabel}”, the count drops, and each PDP shows Fits / Doesn't fit / Universal.`,
    dmsRef: { label: "Convermax Search & Vehicle Fitment", url: "https://app.clickup.com/t/868k5m8p7" },
  },
  {
    id: "S7", title: "Quick order pad", pillar: "B2B buying", minutes: 1.5,
    runs: [{ label: "Open quick order as the Junior Buyer", persona: "dealer-junior", target: { type: "path", href: "/quick-order" } }],
    talkingPoints: [
      "DMS dealers order by part number in bulk; BigCommerce needed a quick-order add-on.",
      `Type ${universalForQuickOrder.join(" and ")} plus a made-up SKU, or paste rows from a spreadsheet: unknown SKUs get a row error, valid rows go to the cart or a list.`,
      "Built on Shopware's B2B Quick Order feature and the Store API product lookup.",
    ],
    expected: "The bad SKU row shows “Unknown SKU”; the valid rows are added and the mini-cart opens.",
    dmsRef: { label: "Quick Order Pad", url: "https://app.clickup.com/t/868k5m8mp" },
  },
  {
    id: "S8", title: "Shopping lists", pillar: "B2B buying", minutes: 1,
    runs: [{ label: `Open “${list.name}”`, persona: "dealer-junior", target: { type: "list", name: list.name } }],
    talkingPoints: [
      "DMS dealers reorder the same restock items every week from saved lists.",
      "Shopware B2B Shopping Lists: shared by the company, add from any product page or the quick order pad, then add the whole list to the cart.",
      `Click “Add all to cart”: ${list.items.length} lines, priced for the dealer.`,
    ],
    expected: `The list shows ${list.items.length} items; “Add all to cart” fills the cart with ${list.items.length} lines.`,
    dmsRef: { label: "Saved product lists", url: "https://app.clickup.com/t/868k5m8mu" },
  },
  {
    id: "S9", title: "Company, roles and permissions", pillar: "B2B buying", minutes: 1,
    runs: [
      { label: "Company view as Dealer Admin", persona: "dealer-admin", target: { type: "path", href: "/account/company" } },
      { label: "Same page as Junior Buyer", persona: "dealer-junior", target: { type: "path", href: "/account/company" } },
    ],
    talkingPoints: [
      "DMS needs company accounts where an owner manages buyers with limited rights.",
      "Shopware B2B Employee Management: the Admin role has every permission; the Junior Buyer role can shop, use lists and quick order, and must request approval.",
      "The Junior Buyer does not get the Company menu, and Shopware itself refuses the data (403), not just the UI.",
    ],
    expected: "Admin: employees with roles and a permission summary. Junior Buyer: no Company menu; the page explains the role cannot view it.",
    dmsRef: { label: "Company accounts / roles / approval", url: "https://app.clickup.com/t/868k5m8mg" },
  },
  {
    id: "S10", title: "Approval loop", pillar: "B2B buying", minutes: 2,
    runs: [
      {
        label: "Junior Buyer: cart ready to submit", persona: "dealer-junior", target: { type: "path", href: "/cart" },
        setup: { cart: list.items.slice(0, 3).map((i) => ({ sku: i.productNumber, qty: i.quantity })) },
      },
      { label: "Dealer Admin: approve or decline", persona: "dealer-admin", target: { type: "path", href: "/account/approvals" } },
    ],
    talkingPoints: [
      "DMS wants junior buyers to build carts that an owner approves before anything is ordered.",
      "Shopware B2B Order Approval: an approval rule says every Junior Buyer cart needs the Admin role's approval. Submitting creates a pending request, not an order.",
      "The Admin approves or declines with a comment; the Junior sees the result under My requests. In this demo no order is ever placed.",
    ],
    expected: "The cart shows the approval notice; after Submit, My requests shows Pending; the Admin approves it and the Junior sees Approved.",
    dmsRef: { label: "Company accounts / roles / approval", url: "https://app.clickup.com/t/868k5m8mg" },
  },
];

const TEXT_FIELDS = ["title", "pillar", "talkingPoints", "expected", "minutes", "dmsRef"];
const prev = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { steps: [] };
const prevById = new Map((prev.steps ?? []).map((s) => [s.id, s]));
let kept = 0;
const steps = DEFAULTS.map((d) => {
  const old = prevById.get(d.id);
  if (!old) return d;
  kept++;
  const merged = { ...d };
  for (const f of TEXT_FIELDS) if (old[f] !== undefined) merged[f] = old[f];
  if (old.lockRuns) {
    merged.runs = old.runs;
    merged.lockRuns = true;
  }
  return merged;
});
const out = {
  $comment: "Presenter tour (DEV_GUIDE §9.4). Edit the text freely; `npm run tour:generate` keeps title, pillar, talkingPoints, expected, minutes and dmsRef, and refreshes runs from the fixture unless a step has \"lockRuns\": true.",
  version: 1,
  steps,
};
writeFileSync(FILE, JSON.stringify(out, null, 2) + "\n");
console.log(`data/tour.json: ${steps.length} steps (${kept} kept existing text), ${steps.reduce((n, s) => n + s.minutes, 0)} min planned`);
