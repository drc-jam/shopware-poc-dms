#!/usr/bin/env node
// seed:verify (DEV_GUIDE §11.4). Readback + Store API flow checks against the seeded instance.
// Writes artifacts/verify-report.json and prints a pass/fail table. Exits non-zero on any failure.
//
// Side effects on the instance (by design, demo company only): two pending orders per run (one approved,
// one declined) and temporary cart contents that are cleared at the end. It never places an order and
// asserts the order count stays 0.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT, adminEnv, loadSeedEnv, storeEnv } from "./lib/env.mjs";
import { createAdminClient } from "./lib/admin-client.mjs";
import { createStoreClient, storeErrorSummary } from "./lib/store-client.mjs";
import { loadFixture } from "./lib/fixture.mjs";
import { buildModel, ownedIds } from "./lib/model.mjs";
import { resolveReference } from "./lib/reference.mjs";
import { existingIds } from "./lib/state.mjs";
import { FITMENT_INDEX } from "./lib/fitment.mjs";
import { stableId } from "./lib/stable-id.mjs";

loadSeedEnv();
const admin = createAdminClient({ ...adminEnv(), readOnly: true });
const store = createStoreClient(storeEnv());
const fx = loadFixture();
const ref = await resolveReference(admin, fx);
const model = buildModel(fx, ref);
const results = [];
const check = (id, label, ok, detail = null, level = "fail") => {
  results.push({ id, label, status: ok ? "pass" : level, detail });
  return ok;
};
const pid = (sku) => stableId("product", sku);
const bySku = new Map(fx.products.map((p) => [p.productNumber, p]));
const dealerAt = (sku, qty) => {
  let u = bySku.get(sku).demo.dealerTiers[0].gross;
  for (const t of bySku.get(sku).demo.dealerTiers) if (t.minQty <= qty) u = t.gross;
  return u;
};
const close = (a, b, tol = 0.011) => typeof a === "number" && Math.abs(a - b) <= tol;
const r2 = (n) => Math.round(n * 100) / 100;

async function guarded(id, label, fn) {
  try {
    await fn();
  } catch (e) {
    check(id, label, false, `error: ${String(e.message ?? e).slice(0, 400)}`);
  }
}

// ------------------------------------------------------------------ 1. ledger
await guarded("ledger", "last seed ledger has no failed entries", async () => {
  const p = path.join(ROOT, "artifacts/seed-ledger.json");
  if (!existsSync(p)) return check("ledger", "last seed ledger has no failed entries", false, "artifacts/seed-ledger.json missing; run seed:apply");
  const l = JSON.parse(readFileSync(p, "utf8"));
  const failed = l.entries.filter((e) => e.action === "failed");
  check("ledger", "last seed ledger has no failed entries", failed.length === 0, { mode: l.mode, finishedAt: l.finishedAt, summary: l.summary?.byAction, failed: failed.slice(0, 5) });
});

// ------------------------------------------------------------------ 2. readback counts
await guarded("readback", "every fixture-owned record exists", async () => {
  const missing = {};
  for (const o of ownedIds(model)) {
    const ex = await existingIds(admin, o.entity, o.ids, ref.pageSize);
    if (ex.size !== o.ids.length) missing[o.entity] = `${ex.size}/${o.ids.length}`;
  }
  check("readback", "every fixture-owned record exists (counts match the fixture)", Object.keys(missing).length === 0, Object.keys(missing).length ? missing : `${ownedIds(model).reduce((n, o) => n + o.ids.length, 0)} records`);
});

// ------------------------------------------------------------------ 3. media
await guarded("media", "product covers have files and are delivered", async () => {
  const rows = await admin.searchAll("product", { ids: fx.products.map((p) => pid(p.productNumber)), associations: { cover: { associations: { media: {} } } }, includes: { product: ["id", "productNumber", "cover"], product_media: ["media"], media: ["id", "hasFile", "url"] } }, ref.pageSize);
  const bad = rows.filter((p) => !p.cover?.media?.hasFile).map((p) => p.productNumber);
  const urls = [...new Set(rows.map((p) => p.cover?.media?.url).filter(Boolean))];
  const fetched = [];
  for (const u of urls) {
    const res = await fetch(u, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(30000) }).catch((e) => ({ ok: false, status: e.message }));
    fetched.push({ url: u.replace(/^https?:\/\/[^/]+/, ""), status: res.status, type: res.headers?.get?.("content-type") ?? null });
  }
  const undelivered = fetched.filter((f) => !(f.status === 200 && /^image\//.test(f.type ?? "")));
  check("media", "every product has a cover with a file; each distinct cover URL returns an image", rows.length === fx.products.length && !bad.length && !undelivered.length, { products: rows.length, missingCover: bad, distinctCovers: urls.length, undelivered });
});

// ------------------------------------------------------------------ 4. catalog via Store API (guest)
await guarded("catalog", "Store API catalog", async () => {
  const ids = fx.products.map((p) => pid(p.productNumber));
  const seen = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await store.call("POST", "product", { body: { ids: ids.slice(i, i + 50), limit: 50, includes: { product: ["id", "productNumber", "customFields"] } } });
    if (!r.ok) throw new Error(`product HTTP ${r.status}: ${storeErrorSummary(r.data)}`);
    seen.push(...(r.data.elements ?? []));
  }
  check("catalog.visible", "all fixture products are visible in the demo sales channel (Store API)", seen.length === ids.length, `${seen.length}/${ids.length}`);
  const mapSeen = seen.filter((p) => p.customFields?.demo_map_policy === "hide_until_cart").length;
  const mapFx = fx.products.filter((p) => p.demo.mapPolicy === "hide_until_cart").length;
  const seriesSeen = seen.filter((p) => p.customFields?.demo_series).length;
  check("catalog.customFields", "MAP and series custom fields are exposed to the Store API", mapSeen === mapFx && seriesSeen === fx.products.filter((p) => p.demo.series).length, { map: `${mapSeen}/${mapFx}`, series: seriesSeen });

  const nav = await store.call("POST", "navigation/main-navigation/main-navigation", { body: { depth: 2, buildTree: true } });
  const top = (nav.data ?? []).map((c) => c.translated?.name ?? c.name);
  const want = fx.categories.filter((c) => c.path.length === 1).map((c) => c.path[0]);
  check("catalog.navigation", "main navigation shows the fixture's top-level categories in order", JSON.stringify(top) === JSON.stringify(want), { got: top, want });

  const shocks = model.ids.catId(["Shocks"]);
  const lst = await store.call("POST", `product-listing/${shocks}`, { body: { limit: 1, "total-count-mode": "exact" } });
  const wantShocks = fx.products.filter((p) => p.categoryPath[0] === "Shocks").length;
  check("catalog.listing", "parent category listing includes nested products", lst.data?.total === wantShocks, `Shocks: ${lst.data?.total} / ${wantShocks}`);

  const q = await store.call("POST", "product", { body: { filter: [{ type: "equalsAny", field: "productNumber", value: [fx.products[0].productNumber, fx.products[1].productNumber, "NOPE-404"] }], includes: { product: ["productNumber"] } } });
  check("catalog.quickOrder", "quick-order lookup by productNumber finds known SKUs and not unknown ones", (q.data?.elements ?? []).length === 2, (q.data?.elements ?? []).map((p) => p.productNumber));
});

// ------------------------------------------------------------------ 5. logins
const tokens = {};
await guarded("login", "persona logins", async () => {
  const personas = [
    ["retail", "PERSONA_RETAIL"],
    ["dealer-admin", "PERSONA_DEALER_ADMIN"],
    ["dealer-junior", "PERSONA_DEALER_JUNIOR"],
  ];
  const out = {};
  // E-mails are not secrets: fall back to the fixture when PERSONA_*_EMAIL is unset (passwords must come from env).
  const fixtureEmail = Object.fromEntries([...fx.customers, ...fx.b2b.employees].map((p) => [p.passwordEnv.replace(/_PASSWORD$/, ""), p.email]));
  for (const [k, env] of personas) {
    const r = await store.call("POST", "account/login", { body: { email: process.env[`${env}_EMAIL`] ?? fixtureEmail[env], password: process.env[`${env}_PASSWORD`] } });
    tokens[k] = r.contextToken ?? r.data?.contextToken ?? null;
    out[k] = r.status;
  }
  check("login", "all 3 personas log in through Store API account/login", Object.values(tokens).every(Boolean), out);
  const ctx = await store.call("GET", "context", { token: tokens["dealer-junior"] });
  check("login.employee", "Junior Buyer context = employee of the dealer company, Dealer group", !!ctx.data?.extensions?.b2bEmployee && ctx.data?.customer?.id === model.ids.customerId(fx.b2b.company.ownerCustomer) && ctx.data?.currentCustomerGroup?.id === model.ids.groups.Dealer, { employee: ctx.data?.extensions?.b2bEmployee?.email ?? null, group: ctx.data?.currentCustomerGroup?.name });
});

const cart = {
  clear: (t) => store.call("DELETE", "checkout/cart", { token: t }),
  async set(t, items) {
    await cart.clear(t);
    const r = await store.call("POST", "checkout/cart/line-item", { token: t, body: { items: items.map(([sku, qty]) => ({ id: pid(sku), referencedId: pid(sku), type: "product", quantity: qty })) } });
    if (!r.ok) throw new Error(`cart add HTTP ${r.status}: ${storeErrorSummary(r.data)}`);
    return r.data;
  },
};
const promoLines = (c) => (c.lineItems ?? []).filter((l) => l.type === "promotion").map((l) => ({ label: l.label, total: l.price?.totalPrice }));
const unitOf = (c, sku) => (c.lineItems ?? []).find((l) => l.referencedId === pid(sku))?.price?.unitPrice;

// ------------------------------------------------------------------ 6. prices per persona (5 sampled SKUs at qty 1, 5, 10)
const tiered = fx.products.filter((p) => !p.demo.series && p.demo.dealerTiers.length === 4 && p.demo.mapPolicy === "none");
const sample = [];
for (const pick of [
  () => tiered[0], () => tiered[Math.floor(tiered.length / 2)],
  () => fx.products.find((p) => p.demo.series),
  () => fx.products.find((p) => p.demo.mapPolicy === "hide_until_cart"),
  () => fx.products.find((p) => p.demo.dealerTiers.length === 1 && p.demo.mapPolicy === "none" && !sample.includes(p.productNumber)),
]) {
  const p = pick();
  if (p && !sample.includes(p.productNumber)) sample.push(p.productNumber);
}
if (sample.length !== 5) throw new Error(`price sample needs 5 distinct SKUs, got ${sample.length}`);
await guarded("prices", "persona pricing", async () => {
  const issues = [];
  // Retail: product route shows retail, no dealer tiers; cart shows retail.
  for (const sku of sample) {
    const r = await store.call("POST", "product", { token: tokens.retail, body: { ids: [pid(sku)], includes: { product: ["calculatedPrice", "calculatedPrices"] } } });
    const p = r.data?.elements?.[0];
    if (!close(p?.calculatedPrice?.unitPrice, bySku.get(sku).price.gross) || (p?.calculatedPrices ?? []).length) issues.push(`retail ${sku}: ${p?.calculatedPrice?.unitPrice} tiers=${(p?.calculatedPrices ?? []).length}`);
  }
  const c = await cart.set(tokens.retail, [[sample[0], 5]]);
  if (!close(unitOf(c, sample[0]), bySku.get(sample[0]).price.gross)) issues.push(`retail cart ${sample[0]} @5: ${unitOf(c, sample[0])}`);
  // Dealer admin + junior: cart unit price at qty 1, 5, 10 equals the fixture tier; tier listPrice = retail.
  for (const who of ["dealer-admin", "dealer-junior"]) {
    for (const sku of sample) {
      for (const qty of [1, 5, 10]) {
        const cc = await cart.set(tokens[who], [[sku, qty]]);
        const got = unitOf(cc, sku);
        if (!close(got, dealerAt(sku, qty))) issues.push(`${who} ${sku} @${qty}: got ${got}, want ${dealerAt(sku, qty)}`);
      }
      const r = await store.call("POST", "product", { token: tokens[who], body: { ids: [pid(sku)], includes: { product: ["calculatedPrices"] } } });
      const first = r.data?.elements?.[0]?.calculatedPrices?.[0];
      if (bySku.get(sku).demo.dealerTiers.length > 1 && !close(first?.listPrice?.price, bySku.get(sku).price.gross)) issues.push(`${who} ${sku}: tier listPrice ${first?.listPrice?.price}`);
    }
  }
  check("prices", `persona prices match the fixture (5 SKUs × qty 1/5/10; retail, admin, junior)`, issues.length === 0, issues.length ? issues : { sample });
});

// ------------------------------------------------------------------ 7. series promotions (D1 + D2)
await guarded("series", "series promotions", async () => {
  const s = fx.series[0];
  const [a, b] = fx.products.filter((p) => p.demo.series === s.code).map((p) => p.productNumber);
  const pct = (q) => s.tiers.filter((t) => t.minQty <= q).at(-1)?.discountPct ?? 0;
  const expect = (items) => {
    const total = items.reduce((n, [sku, q]) => n + q, 0);
    const base = items.reduce((n, [sku, q]) => n + q * dealerAt(sku, q), 0);
    return pct(total) ? -r2((base * pct(total)) / 100) : null;
  };
  const cases = [
    ["5A+5B → 10+ tier", "dealer-admin", [[a, 5], [b, 5]]],
    ["4A+5B → none", "dealer-admin", [[a, 4], [b, 5]]],
    ["8A+5B → all 13 units", "dealer-admin", [[a, 8], [b, 5]]],
    ["10A single SKU → tier-5 unit + 10+ promo (no double discount)", "dealer-admin", [[a, 10]]],
    ["13A+12B → 25+ only (no stacking)", "dealer-admin", [[a, 13], [b, 12]]],
    ["5A+5B Junior Buyer → 10+ tier", "dealer-junior", [[a, 5], [b, 5]]],
    ["5A+5B retail → none", "retail", [[a, 5], [b, 5]]],
  ];
  const out = [];
  let ok = true;
  for (const [label, who, items] of cases) {
    const c = await cart.set(tokens[who], items);
    const promos = promoLines(c);
    const want = who === "retail" ? null : expect(items);
    const good = want === null ? promos.length === 0 : promos.length === 1 && close(promos[0].total, want, 0.02);
    const unitOk = label.startsWith("10A") ? close(unitOf(c, a), dealerAt(a, 5)) : true;
    ok &&= good && unitOk;
    out.push({ case: label, want, got: promos, ...(label.startsWith("10A") ? { unit: unitOf(c, a), wantUnit: dealerAt(a, 5) } : {}), pass: good && unitOk });
  }
  check("series", `series ${s.code} promotions: 10+/25+ on all units, no stacking, no double discount, dealer only`, ok, out);
});

// ------------------------------------------------------------------ 8. fitment index
await guarded("fitment", "fitment index", async () => {
  if (!existsSync(FITMENT_INDEX)) return check("fitment", "fitment index exists", false, "data/fitment-index.json missing");
  const idx = JSON.parse(readFileSync(FITMENT_INDEX, "utf8"));
  const ids = [...new Set([...Object.keys(idx.byProduct), ...idx.universal, ...Object.values(idx.byVehicleYear).flat()])];
  const ex = await existingIds(admin, "product", ids, ref.pageSize);
  check("fitment", "every product ID in data/fitment-index.json exists; index targets this sales channel", ex.size === ids.length && idx.salesChannelId === ref.salesChannelId, { ids: ids.length, existing: ex.size, universal: idx.universal.length, vehicles: Object.keys(idx.vehicles).length });
});

// ------------------------------------------------------------------ 9. shopping list
await guarded("lists", "shopping list", async () => {
  const want = fx.b2b.shoppingLists[0];
  const lists = await store.call("POST", "shopping-lists", { token: tokens["dealer-junior"], body: {} });
  const l = (lists.data?.elements ?? []).find((x) => x.id === stableId("b2b_components_shopping_list", want.key));
  const one = l ? await store.call("POST", `shopping-list/${l.id}`, { token: tokens["dealer-junior"], body: { associations: { lineItems: {} } } }) : null;
  const n = one?.data?.lineItems?.length ?? one?.data?.lineItems?.elements?.length ?? 0;
  await cart.clear(tokens["dealer-junior"]);
  const add = l ? await store.call("POST", "shopping-lists/add-to-cart", { token: tokens["dealer-junior"], body: { ids: [l.id] } }) : null;
  const c = await store.call("GET", "checkout/cart", { token: tokens["dealer-junior"] });
  const lines = (c.data?.lineItems ?? []).filter((x) => x.type === "product").length;
  check("lists", `"${want.name}" is visible to the Junior Buyer with ${want.items.length} items and adds ${want.items.length} lines to the cart`, !!l && n === want.items.length && add?.ok && lines === want.items.length, { found: !!l, items: n, addToCart: add?.status, cartLines: lines });
  await cart.clear(tokens["dealer-junior"]);
});

// ------------------------------------------------------------------ 10. approval round trip
const ordersBefore = await admin.count("order");
await guarded("approval", "approval round trip", async () => {
  const jr = tokens["dealer-junior"], ad = tokens["dealer-admin"];
  const trip = async (decision) => {
    const c = await cart.set(jr, [[sample[0], 2], [sample[1], 1]]);
    const needs = Object.values(c.errors ?? {}).some((e) => /orderApproval|approv/i.test(`${e.messageKey ?? ""} ${e.key ?? ""} ${e.message ?? ""}`));
    const req = await store.call("POST", "pending-orders/request", { token: jr, body: { comment: `seed:verify ${decision}` } });
    if (!req.ok) return { decision, needsApproval: needs, request: `HTTP ${req.status} ${storeErrorSummary(req.data)}` };
    const id = req.data.id;
    const juniorDecides = await store.call("POST", `pending-order/${id}/${decision}`, { token: jr, body: { comment: "junior" } });
    const before = await store.call("POST", `pending-order/${id}`, { token: ad, body: { associations: { stateMachineState: {} } } });
    const d = await store.call("POST", `pending-order/${id}/${decision}`, { token: ad, body: { comment: `seed:verify ${decision}` } });
    const after = await store.call("POST", `pending-order/${id}`, { token: ad, body: { associations: { stateMachineState: {} } } });
    return {
      decision, needsApproval: needs, pendingId: id, orderIdOnRequest: req.data.orderId ?? null,
      stateBefore: before.data?.stateMachineState?.technicalName, juniorDecideStatus: juniorDecides.status,
      decideStatus: d.status, stateAfter: after.data?.stateMachineState?.technicalName, orderIdAfter: after.data?.orderId ?? null,
    };
  };
  const ap = await trip("approve");
  const de = await trip("decline");
  const good = (t, state) => t.needsApproval && t.stateBefore === "pending" && t.juniorDecideStatus === 403 && t.decideStatus < 300 && t.stateAfter === state && !t.orderIdOnRequest && !t.orderIdAfter;
  check("approval", "Junior cart needs approval → request → pending → Admin approves (and declines a second); Junior cannot decide; no order", good(ap, "approved") && good(de, "declined"), { approve: ap, decline: de });
});
const ordersAfter = await admin.count("order");
check("orders", "no placed orders exist on the instance", ordersBefore === 0 && ordersAfter === 0, { before: ordersBefore, after: ordersAfter });

// cleanup carts
for (const t of Object.values(tokens)) if (t) await cart.clear(t).catch(() => {});

// ------------------------------------------------------------------ report
const failed = results.filter((r) => r.status === "fail");
const report = { generatedAt: new Date().toISOString(), salesChannelId: ref.salesChannelId, passed: results.filter((r) => r.status === "pass").length, failed: failed.length, results };
mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
writeFileSync(path.join(ROOT, "artifacts/verify-report.json"), JSON.stringify(report, null, 2) + "\n");
for (const r of results) console.log(`${r.status === "pass" ? "PASS" : "FAIL"}  ${r.id.padEnd(22)} ${r.label}`);
for (const f of failed) console.log(`\n${f.id}: ${JSON.stringify(f.detail, null, 1).slice(0, 1500)}`);
console.log(`\n${report.passed} passed, ${report.failed} failed → artifacts/verify-report.json`);
if (failed.length) process.exitCode = 1;
