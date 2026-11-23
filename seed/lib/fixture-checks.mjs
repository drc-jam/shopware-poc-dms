// Business checks for the composed fixture (DEV_GUIDE §7.3).
// Pure functions: take the composed document, return { errors, warnings, stats }.

import { existsSync } from "node:fs";
import path from "node:path";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const UNIVERSAL_ROOTS = new Set(["Shop Supplies"]);
const CENT = 0.005;

/**
 * @param {any} doc composed document (site-project.json + vehicles from vehicles.json)
 * @param {{ fixtureDir?: string }} [opts] fixtureDir enables media file existence checks
 */
export function checkFixture(doc, opts = {}) {
  const errors = [];
  const warnings = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

  const products = doc.products ?? [];
  const vehicles = doc.vehicles ?? [];
  const series = doc.series ?? [];

  // --- unique keys -----------------------------------------------------------
  const dupes = (items, keyFn, label) => {
    const seen = new Set();
    for (const it of items) {
      const k = keyFn(it);
      if (seen.has(k)) err(label, `duplicate "${k}"`);
      seen.add(k);
    }
    return seen;
  };
  const productNumbers = dupes(products, (p) => p.productNumber, "products");
  const vehicleKeys = dupes(vehicles, (v) => v.key, "vehicles");
  const seriesCodes = dupes(series, (s) => s.code, "series");
  dupes(doc.customers ?? [], (c) => c.key, "customers");
  dupes(doc.b2b?.employees ?? [], (e) => e.key, "b2b.employees");
  dupes(doc.b2b?.roles ?? [], (r) => r.key, "b2b.roles");
  dupes(doc.categories ?? [], (c) => c.path.join(" > "), "categories");
  dupes(vehicles, (v) => `${v.make}|${v.model}|${v.yearFrom}|${v.yearTo}`, "vehicles(make/model/years)");

  // --- vehicles --------------------------------------------------------------
  for (const v of vehicles) {
    if (v.yearFrom > v.yearTo) err(`vehicle ${v.key}`, `yearFrom ${v.yearFrom} > yearTo ${v.yearTo}`);
    if (!v.key.endsWith(`-${v.yearFrom}-${v.yearTo}`)) err(`vehicle ${v.key}`, `key does not end with -${v.yearFrom}-${v.yearTo}`);
    if (!v.key.startsWith(v.make.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() + "-")) {
      err(`vehicle ${v.key}`, `key prefix does not match make "${v.make}"`);
    }
  }

  // --- categories ------------------------------------------------------------
  const categoryKeys = new Set((doc.categories ?? []).map((c) => c.path.join(" > ")));
  for (const c of doc.categories ?? []) {
    for (let i = 1; i < c.path.length; i++) {
      const parent = c.path.slice(0, i).join(" > ");
      if (!categoryKeys.has(parent)) err(`category ${c.path.join(" > ")}`, `parent "${parent}" is not declared`);
    }
  }

  // --- brands ----------------------------------------------------------------
  const brandByName = new Map((doc.brands ?? []).map((b) => [b.name, b]));

  // --- products --------------------------------------------------------------
  let mapCount = 0;
  for (const p of products) {
    const where = `product ${p.productNumber}`;
    const cat = p.categoryPath.join(" > ");
    if (!categoryKeys.has(cat)) err(where, `categoryPath "${cat}" does not resolve`);

    const brand = brandByName.get(p.brand);
    if (!brand) err(where, `brand "${p.brand}" is not declared in brands[]`);
    else if (!p.productNumber.startsWith(`${brand.code}-`)) err(where, `productNumber prefix does not match brand code ${brand.code}`);

    for (const key of p.demo.fitment) {
      if (!vehicleKeys.has(key)) err(where, `fitment key "${key}" not found in vehicles`);
    }
    if (UNIVERSAL_ROOTS.has(p.categoryPath[0]) && p.demo.fitment.length > 0) {
      err(where, `"${p.categoryPath[0]}" items must be universal (no fitment)`);
    }

    // Tiers: start at qty 1, minQty strictly increasing, price strictly decreasing, all below retail.
    const tiers = p.demo.dealerTiers;
    if (tiers[0]?.minQty !== 1) err(where, "dealerTiers must start at minQty 1");
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      if (!(t.gross < p.price.gross)) err(where, `dealer tier qty ${t.minQty} (${t.gross}) is not below retail (${p.price.gross})`);
      if (i > 0) {
        const prev = tiers[i - 1];
        if (!(t.minQty > prev.minQty)) err(where, `tier minQty not strictly increasing (${prev.minQty} → ${t.minQty})`);
        if (!(t.gross < prev.gross)) err(where, `tier price not strictly decreasing (${prev.gross} → ${t.gross})`);
      }
    }
    // Guide targets (§7.1) are soft: warn, don't fail.
    const ratio = tiers[0].gross / p.price.gross;
    if (ratio < 0.65 || ratio > 0.75) warn(where, `dealer qty-1 ratio ${ratio.toFixed(3)} outside ~0.70 target`);

    if (p.demo.mapPolicy === "hide_until_cart") mapCount++;
    if (p.demo.series && !seriesCodes.has(p.demo.series)) err(where, `series "${p.demo.series}" not declared`);

    if (opts.fixtureDir) {
      for (const m of p.media) {
        if (!existsSync(path.join(opts.fixtureDir, m))) err(where, `media file "${m}" does not exist`);
      }
    }
  }
  if (mapCount < 1) err("products", "at least one MAP (hide_until_cart) SKU is required");

  // --- series ----------------------------------------------------------------
  for (const s of series) {
    const where = `series ${s.code}`;
    const members = products.filter((p) => p.demo.series === s.code);
    if (members.length < 2) {
      err(where, `needs ≥ 2 SKUs, has ${members.length}`);
      continue;
    }
    if (members.length < 3 || members.length > 6) warn(where, `has ${members.length} SKUs (guide target 3–6)`);

    // ≥ 2 members must share at least one tier break (minQty) beyond qty 1.
    const breaks = members.map((m) => new Set(m.demo.dealerTiers.map((t) => t.minQty).filter((q) => q > 1)));
    const shared = [...(breaks[0] ?? [])].filter((q) => breaks.filter((b) => b.has(q)).length >= 2);
    if (shared.length === 0) err(where, "no two member SKUs share a tier break");

    // Series discount must match 1 − tierPrice(qty)/tierPrice(5) on every member (§6.4).
    const tierQtys = s.tiers.map((t) => t.minQty);
    if (new Set(tierQtys).size !== tierQtys.length) err(where, "duplicate series tier minQty");
    for (let i = 1; i < s.tiers.length; i++) {
      if (!(s.tiers[i].minQty > s.tiers[i - 1].minQty && s.tiers[i].discountPct > s.tiers[i - 1].discountPct)) {
        err(where, "series tiers must increase in both minQty and discountPct");
      }
    }
    for (const m of members) {
      const at = (q) => m.demo.dealerTiers.find((t) => t.minQty === q)?.gross;
      const base = at(5);
      if (base === undefined) {
        err(`${where} / ${m.productNumber}`, "series member has no qty-5 dealer tier (needed for discount math)");
        continue;
      }
      for (const t of s.tiers) {
        const tierPrice = at(t.minQty);
        if (tierPrice === undefined) {
          err(`${where} / ${m.productNumber}`, `series tier ${t.minQty} has no matching dealer tier on this SKU`);
          continue;
        }
        const implied = (1 - tierPrice / base) * 100;
        if (Math.abs(implied - t.discountPct) > 1.5) {
          err(`${where} / ${m.productNumber}`, `discountPct ${t.discountPct}% vs implied ${implied.toFixed(2)}% at qty ${t.minQty}`);
        } else if (Math.abs(implied - t.discountPct) > 0.75) {
          warn(`${where} / ${m.productNumber}`, `discountPct ${t.discountPct}% vs implied ${implied.toFixed(2)}% (rounding drift)`);
        }
      }
    }
  }

  // --- customers, personas, b2b ----------------------------------------------
  const customerKeys = new Set((doc.customers ?? []).map((c) => c.key));
  const employeeKeys = new Set((doc.b2b?.employees ?? []).map((e) => e.key));
  const roleKeys = new Set((doc.b2b?.roles ?? []).map((r) => r.key));
  for (const p of doc.personas ?? []) {
    if (p.customer && !customerKeys.has(p.customer)) err(`persona ${p.key}`, `customer "${p.customer}" not found`);
    if (p.employee && !employeeKeys.has(p.employee)) err(`persona ${p.key}`, `employee "${p.employee}" not found`);
  }
  const personaKeys = new Set((doc.personas ?? []).map((p) => p.key));
  for (const k of ["retail", "dealer-admin", "dealer-junior"]) if (!personaKeys.has(k)) err("personas", `missing persona "${k}"`);

  const b2b = doc.b2b;
  if (b2b) {
    const owner = (doc.customers ?? []).find((c) => c.key === b2b.company.ownerCustomer);
    if (!owner) err("b2b.company", `ownerCustomer "${b2b.company.ownerCustomer}" not found`);
    else if (owner.customerGroup !== "Dealer") err("b2b.company", "company owner must be in the Dealer group");
    for (const e of b2b.employees) if (!roleKeys.has(e.role)) err(`b2b.employee ${e.key}`, `role "${e.role}" not found`);
    for (const r of b2b.approvalRules) {
      for (const k of [r.affectedRole, r.reviewerRole]) if (!roleKeys.has(k)) err(`b2b.approvalRule ${r.key}`, `role "${k}" not found`);
    }
    for (const l of b2b.shoppingLists) {
      if (!employeeKeys.has(l.owner) && !customerKeys.has(l.owner)) err(`b2b.shoppingList ${l.key}`, `owner "${l.owner}" not found`);
      for (const it of l.items) {
        if (!productNumbers.has(it.productNumber)) err(`b2b.shoppingList ${l.key}`, `item "${it.productNumber}" is not a fixture product`);
      }
      dupes(l.items, (i) => i.productNumber, `b2b.shoppingList ${l.key}`);
    }
  }

  // --- no real-looking emails anywhere ----------------------------------------
  walkStrings(doc, (s, at) => {
    for (const m of s.match(EMAIL_RE) ?? []) {
      if (!/@example\.com$/i.test(m)) err(at, `real-looking email "${m}" (use @example.com)`);
    }
  });

  // --- stats for the report ----------------------------------------------------
  const perVehicle = Object.fromEntries(vehicles.map((v) => [v.key, products.filter((p) => p.demo.fitment.includes(v.key)).length]));
  for (const [k, n] of Object.entries(perVehicle)) if (n < 5) warn(`vehicle ${k}`, `only ${n} fitting SKUs (thin demo result)`);
  const stats = {
    products: products.length,
    fitmentSpecific: products.filter((p) => p.demo.fitment.length > 0).length,
    universal: products.filter((p) => p.demo.fitment.length === 0).length,
    tiered: products.filter((p) => p.demo.dealerTiers.length > 1).length,
    map: mapCount,
    series: Object.fromEntries(series.map((s) => [s.code, products.filter((p) => p.demo.series === s.code).length])),
    vehicles: vehicles.length,
    fittingSkusPerVehicle: perVehicle,
  };
  return { errors, warnings, stats };
}

function walkStrings(node, fn, at = "$") {
  if (typeof node === "string") fn(node, at);
  else if (Array.isArray(node)) node.forEach((v, i) => walkStrings(v, fn, `${at}[${i}]`));
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walkStrings(v, fn, `${at}.${k}`);
}
