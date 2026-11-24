#!/usr/bin/env node
// Phase 0 spikes (DEV_GUIDE §12 Phase 0, §6.4, §9.3, §6.6). WRITES to the instance, but only
// spike-scoped records: every ID is stableId(<entity>, "spike:<key>"), every name starts with
// "SPIKE ·", and every write is listed in artifacts/spike-ledger.json. It never calls an
// order-creating route, and it asserts the order count is unchanged at the end.
//
//   node seed/spikes/phase0.mjs              set up spike data, run all spikes, write artifacts/spike-results.json
//   node seed/spikes/phase0.mjs --cleanup    delete exactly the records listed in artifacts/spike-ledger.json
//
// Results feed artifacts/spikes.md (written by hand from spike-results.json).

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT, adminEnv, loadSeedEnv, storeEnv } from "../lib/env.mjs";
import { createAdminClient } from "../lib/admin-client.mjs";
import { createStoreClient, storeErrorSummary } from "../lib/store-client.mjs";
import { stableId } from "../lib/stable-id.mjs";

loadSeedEnv();
const ART = path.join(ROOT, "artifacts");
mkdirSync(ART, { recursive: true });
const LEDGER = path.join(ART, "spike-ledger.json");
const RESULTS = path.join(ART, "spike-results.json");

const admin = createAdminClient({ ...adminEnv(), readOnly: false });
const store = createStoreClient(storeEnv());
const sid = (entity, key) => stableId(entity, `spike:${key}`);
const LIVE_VERSION = "0fa91ce3e96a4bc2be4bd9ce752c3425"; // Shopware live version id (constant across instances)
const MARK = { demo_fixture: "phase0-spike" };

// ------------------------------------------------------------------ ledger
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { entries: [] };
const remember = (entity, key, id, action, extra = {}) => {
  ledger.entries = ledger.entries.filter((e) => !(e.entity === entity && e.id === id));
  ledger.entries.push({ entity, key, id, action, at: new Date().toISOString(), ...extra });
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
};

const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === "_key" ? undefined : v)));
async function up(entity, payload) {
  const items = Array.isArray(payload) ? payload : [payload];
  const keyOf = (p) => p._key ?? p.name ?? p.id;
  try {
    await admin.request("POST", "/_action/sync", { body: [{ key: `${entity}-upsert`, action: "upsert", entity, payload: items.map(strip) }] });
    for (const p of items) remember(entity, keyOf(p), p.id, "upserted");
  } catch (e) {
    for (const p of items) remember(entity, keyOf(p), p.id, "failed", { error: e.message.slice(0, 500) });
    throw e;
  }
}

// ------------------------------------------------------------------ cleanup mode
if (process.argv.includes("--cleanup")) {
  const order = [
    "b2b_components_pending_order", "b2b_components_shopping_list", "b2b_components_approval_rule", "b2b_employee_account", "b2b_employee", "b2b_components_role",
    "customer_specific_features", "b2b_business_partner", "promotion", "customer", "product", "rule", "product_stream",
    "custom_field_set", "customer_group",
  ];
  for (const entity of order) {
    // Deleting the employee account removes its primary membership (B2B__PRIMARY_MEMBERSHIP_CANNOT_BE_DELETED
    // otherwise), so only delete what still exists.
    const listed = [...new Set(ledger.entries.filter((e) => e.entity === entity && e.action !== "deleted").map((e) => e.id))];
    const ids = listed.length ? await admin.searchIdsAll(entity, { ids: listed }) : [];
    for (const id of listed.filter((x) => !ids.includes(x))) remember(entity, null, id, "deleted", { note: "already gone (cascade)" });
    if (!ids.length) continue;
    await admin.request("POST", "/_action/sync", { body: [{ key: `${entity}-delete`, action: "delete", entity, payload: ids.map((id) => ({ id })) }] });
    for (const id of ids) remember(entity, null, id, "deleted");
    console.log(`deleted ${ids.length} ${entity}`);
  }
  process.exit(0);
}

const results = { startedAt: new Date().toISOString(), spikes: {}, notes: [] };
const save = () => writeFileSync(RESULTS, JSON.stringify(results, null, 2) + "\n");
const log = (...a) => console.log(...a);

// ------------------------------------------------------------------ reference data (read)
const disc = JSON.parse(readFileSync(path.join(ART, "discovery.json"), "utf8"));
const SC = disc.salesChannel;
const scFull = (await admin.search("sales_channel", { ids: [SC.id] })).data[0];
const LANG = scFull.languageId;
const USD = SC.defaultCurrency.id;
const US = SC.defaultCountry.id;
const currencies = await admin.searchAll("currency", {}, 100);
const SYS = currencies.find((c) => c.isSystemDefault) ?? currencies.find((c) => c.factor === 1);
const usdFactor = currencies.find((c) => c.id === USD).factor;
const TAX0 = disc.reference.taxes.find((t) => t.taxRate === 0)?.id;
if (!TAX0) throw new Error("no 0% tax rule on the instance");
const INVOICE = SC.paymentMethods.find((p) => /invoice/i.test(p.technicalName)).id;
const RETAIL_GROUP = SC.customerGroup.id;
const SALUTATION = (await admin.search("salutation", { filter: [{ type: "equals", field: "salutationKey", value: "not_specified" }] })).data?.[0]?.id;
const ordersBefore = await admin.count("order");
results.reference = { salesChannelId: SC.id, languageId: LANG, systemCurrency: SYS.isoCode, usdFactor, tax0: TAX0, ordersBefore };

const money = (usdGross) => [
  ...(SYS.id !== USD ? [{ currencyId: SYS.id, gross: +(usdGross / usdFactor).toFixed(4), net: +(usdGross / usdFactor).toFixed(4), linked: false }] : []),
  { currencyId: USD, gross: usdGross, net: usdGross, linked: false },
];

// ------------------------------------------------------------------ setup: catalog + rules + promotions
const ID = {
  cfs: sid("custom_field_set", "spike_demo"),
  cf: sid("custom_field", "spike_series"),
  dealerGroup: sid("customer_group", "dealer"),
  stream: sid("product_stream", "series-spk"),
  ruleDealer: sid("rule", "dealer"),
  ruleSeries: sid("rule", "series-spk"),
  p10: sid("promotion", "spk-10"),
  p25: sid("promotion", "spk-25"),
  ruleQty10: sid("rule", "series-spk-qty-10"),
  ruleQty25: sid("rule", "series-spk-qty-25"),
  p10b: sid("promotion", "spk-10-allunits"),
  p25b: sid("promotion", "spk-25-allunits"),
};
const SKUS = [
  { sku: "SPIKE-SPK-A", name: "SPIKE · Series SPK shock A", retail: 100, tiers: [[1, 70], [5, 66], [10, 63], [25, 60]] },
  { sku: "SPIKE-SPK-B", name: "SPIKE · Series SPK shock B", retail: 80, tiers: [[1, 56], [5, 53], [10, 50], [25, 48]] },
  { sku: "SPIKE-OTHER", name: "SPIKE · Not in series", retail: 20, tiers: [] },
];
const pid = (sku) => stableId("product", sku); // same algorithm the seeder/fitment index use

async function setupCatalog() {
  await up("custom_field_set", {
    id: ID.cfs, name: "spike_demo", config: { label: { "en-GB": "SPIKE demo (Phase 0)" } },
    relations: [{ id: sid("custom_field_set_relation", "spike_demo-product"), entityName: "product" }],
    customFields: [{ id: ID.cf, name: "spike_series", type: "text", config: { label: { "en-GB": "SPIKE series" } } }],
  });
  await up("customer_group", { id: ID.dealerGroup, name: "SPIKE · Dealer", displayGross: true, customFields: MARK });
  await up("product_stream", {
    id: ID.stream, name: "SPIKE · Series SPK", customFields: MARK,
    filters: [{ id: sid("product_stream_filter", "series-spk"), type: "equals", field: "customFields.spike_series", value: "SPK", position: 0 }],
  });
  await up("rule", {
    id: ID.ruleDealer, name: "SPIKE · Customer group = Dealer", priority: 100, customFields: MARK,
    conditions: [{ id: sid("rule_condition", "dealer"), type: "customerCustomerGroup", value: { operator: "=", customerGroupIds: [ID.dealerGroup] } }],
  });
  await up("rule", {
    id: ID.ruleSeries, name: "SPIKE · Line item in Series SPK", priority: 100, customFields: MARK,
    conditions: [{ id: sid("rule_condition", "series-spk"), type: "cartLineItemInProductStream", value: { operator: "=", streamIds: [ID.stream] } }],
  });
  await up(
    "product",
    SKUS.map((s) => ({
      _key: s.sku, id: pid(s.sku), productNumber: s.sku, name: s.name, stock: 1000, active: true, taxId: TAX0,
      price: money(s.retail),
      visibilities: [{ id: sid("product_visibility", s.sku), salesChannelId: SC.id, visibility: 30 }],
      customFields: { ...MARK, ...(s.sku.includes("SPK") ? { spike_series: "SPK" } : {}) },
      prices: s.tiers.map(([q, g], i) => ({
        id: sid("product_price", `${s.sku}-${q}`), ruleId: ID.ruleDealer, quantityStart: q,
        quantityEnd: s.tiers[i + 1] ? s.tiers[i + 1][0] - 1 : null,
        price: money(g).map((m) => ({ ...m, listPrice: money(s.retail).find((r) => r.currencyId === m.currencyId) })),
      })),
    })),
  );
  const promo = (id, key, tierQty, pct, priority, exclude) => ({
    _key: key, id, name: `SPIKE · Series SPK mix-and-match — ${tierQty}+ tier`, active: true, priority, exclusive: false,
    useCodes: false, useIndividualCodes: false, useSetGroups: true, preventCombination: false, customerRestriction: false,
    exclusionIds: [exclude], customFields: MARK,
    salesChannels: [{ id: sid("promotion_sales_channel", key), salesChannelId: SC.id, priority: 1 }],
    personaRules: [{ id: ID.ruleDealer }],
    setgroups: [{ id: sid("promotion_setgroup", key), packagerKey: "COUNT", sorterKey: "PRICE_ASC", value: tierQty, setGroupRules: [{ id: ID.ruleSeries }] }],
    discounts: [{ id: sid("promotion_discount", key), scope: "set", type: "percentage", value: pct, considerAdvancedRules: false, sorterKey: "PRICE_ASC", applierKey: "ALL", usageKey: "ALL", pickerKey: "VERTICAL" }],
  });
  await up("promotion", [promo(ID.p10, "spk-10", 10, 5, 1, ID.p25), promo(ID.p25, "spk-25", 25, 10, 2, ID.p10)]);

  // Variant A2 ("all units"): cart rule = total quantity of series items >= N; discount only on series items.
  const qtyRule = (id, key, n) => ({
    _key: key, id, name: `SPIKE · Series SPK total qty >= ${n}`, priority: 100, customFields: MARK,
    conditions: [{
      id: sid("rule_condition", key), type: "cartLineItemGoodsTotal", value: { operator: ">=", count: n },
      children: [{ id: sid("rule_condition", `${key}-filter`), type: "cartLineItemInProductStream", value: { operator: "=", streamIds: [ID.stream] } }],
    }],
  });
  await up("rule", [qtyRule(ID.ruleQty10, "series-spk-qty-10", 10), qtyRule(ID.ruleQty25, "series-spk-qty-25", 25)]);
  const promoAll = (id, key, rule, tierQty, pct, priority, exclude) => ({
    _key: key, id, name: `SPIKE · Series SPK all-units — ${tierQty}+ tier`, active: false, priority, exclusive: false,
    useCodes: false, useIndividualCodes: false, useSetGroups: false, preventCombination: false, customerRestriction: false,
    exclusionIds: [exclude], customFields: MARK,
    salesChannels: [{ id: sid("promotion_sales_channel", key), salesChannelId: SC.id, priority: 1 }],
    personaRules: [{ id: ID.ruleDealer }],
    cartRules: [{ id: rule }],
    discounts: [{ id: sid("promotion_discount", key), scope: "cart", type: "percentage", value: pct, considerAdvancedRules: true, discountRules: [{ id: ID.ruleSeries }] }],
  });
  await up("promotion", [promoAll(ID.p10b, "spk-10-allunits", ID.ruleQty10, 10, 5, 1, ID.p25b), promoAll(ID.p25b, "spk-25-allunits", ID.ruleQty25, 25, 10, 2, ID.p10b)]);
}

async function usePromotionVariant(variant) {
  const a1 = variant === "setgroup";
  await up("promotion", [
    { _key: "spk-10", id: ID.p10, active: a1 }, { _key: "spk-25", id: ID.p25, active: a1 },
    { _key: "spk-10-allunits", id: ID.p10b, active: !a1 }, { _key: "spk-25-allunits", id: ID.p25b, active: !a1 },
  ]);
}

// ------------------------------------------------------------------ setup: customers + B2B
const PW = { dealer: randomBytes(18).toString("base64url"), retail: randomBytes(18).toString("base64url"), junior: randomBytes(18).toString("base64url") };
const CUST = {
  dealer: { id: sid("customer", "dealer-admin"), email: "spike.dealer.admin@example.com" },
  retail: { id: sid("customer", "retail"), email: "spike.retail@example.com" },
};
const JUNIOR = { id: sid("b2b_employee", "junior"), account: sid("b2b_employee_account", "junior"), email: "spike.junior.buyer@example.com" };
const ROLE = { admin: sid("b2b_components_role", "admin"), junior: sid("b2b_components_role", "junior") };

function customer(key, c, group, business) {
  const addr = sid("customer_address", key);
  return {
    _key: key, id: c.id, email: c.email, password: PW[key], groupId: group, salesChannelId: SC.id, languageId: LANG,
    customerNumber: `SPIKE-${key.toUpperCase()}`, firstName: "Spike", lastName: key === "dealer" ? "Dealer Admin" : "Retail",
    accountType: business ? "business" : "private", company: business ? "SPIKE Dealer Co. (fictional)" : null,
    active: true, guest: false, lastPaymentMethodId: INVOICE, customFields: MARK,
    defaultBillingAddressId: addr, defaultShippingAddressId: addr,
    salutationId: SALUTATION,
    addresses: [{ id: addr, salutationId: SALUTATION, firstName: "Spike", lastName: "Test", street: "1 Example Way", zipcode: "46204", city: "Indianapolis", countryId: US, company: business ? "SPIKE Dealer Co. (fictional)" : null }],
  };
}

async function setupCustomers() {
  await up("customer", [customer("dealer", CUST.dealer, ID.dealerGroup, true), customer("retail", CUST.retail, RETAIL_GROUP, false)]);
  await up("b2b_business_partner", { _key: "dealer", id: sid("b2b_business_partner", "dealer"), customerId: CUST.dealer.id, customFields: MARK });
  await up("customer_specific_features", {
    _key: "dealer", id: sid("customer_specific_features", "dealer"), customerId: CUST.dealer.id,
    features: { EMPLOYEE_MANAGEMENT: true, ORDER_APPROVAL: true, QUICK_ORDER: true, SHOPPING_LISTS: true },
  });
}

// ------------------------------------------------------------------ Store API helpers
async function login(email, password) {
  const r = await store.call("POST", "account/login", { body: { email, password } });
  return { status: r.status, token: r.data?.contextToken ?? r.contextToken ?? null, error: r.ok ? null : storeErrorSummary(r.data) };
}
async function setCart(token, items) {
  await store.call("DELETE", "checkout/cart", { token });
  const r = await store.call("POST", "checkout/cart/line-item", {
    token,
    body: { items: items.map(([sku, qty]) => ({ id: pid(sku), referencedId: pid(sku), type: "product", quantity: qty })) },
  });
  if (!r.ok) throw new Error(`cart add failed: ${storeErrorSummary(r.data)}`);
  return r.data;
}
const summarizeCart = (cart) => ({
  total: cart.price?.totalPrice,
  products: cart.lineItems.filter((l) => l.type === "product").map((l) => ({ sku: l.payload?.productNumber, qty: l.quantity, unit: l.price?.unitPrice, total: l.price?.totalPrice })),
  promotions: cart.lineItems.filter((l) => l.type === "promotion").map((l) => ({ label: l.label, total: l.price?.totalPrice, composition: (l.payload?.composition ?? []).map((c) => ({ id: c.id === pid("SPIKE-SPK-A") ? "A" : c.id === pid("SPIKE-SPK-B") ? "B" : c.id, qty: c.quantity, discount: c.discount })) })),
  errors: Object.values(cart.errors ?? {}).map((e) => `${e.messageKey ?? e.key}: ${e.message ?? ""}`.trim()),
});

// ------------------------------------------------------------------ spike A: series promotion
async function spikePromotions(variant) {
  await usePromotionVariant(variant);
  const s = { variant, cases: [] };
  const dealer = await login(CUST.dealer.email, PW.dealer);
  const retail = await login(CUST.retail.email, PW.retail);
  s.dealerLogin = dealer.status; s.retailLogin = retail.status;
  if (!dealer.token) throw new Error(`dealer login failed: ${dealer.error}`);
  const cases = [
    ["5A+5B (dealer) → 10+ tier", dealer.token, [["SPIKE-SPK-A", 5], ["SPIKE-SPK-B", 5]]],
    ["4A+5B (dealer) → none", dealer.token, [["SPIKE-SPK-A", 4], ["SPIKE-SPK-B", 5]]],
    ["8A+5B = 13 (dealer) → packages vs remainder", dealer.token, [["SPIKE-SPK-A", 8], ["SPIKE-SPK-B", 5]]],
    ["10A+10B = 20 (dealer) → two packages of 10?", dealer.token, [["SPIKE-SPK-A", 10], ["SPIKE-SPK-B", 10]]],
    ["13A+12B = 25 (dealer) → 25+ only, no stacking", dealer.token, [["SPIKE-SPK-A", 13], ["SPIKE-SPK-B", 12]]],
    ["10A single SKU (dealer) → tier-10 unit price AND promo? (double discount)", dealer.token, [["SPIKE-SPK-A", 10]]],
    ["5A+5B+5 other (dealer) → other excluded from set", dealer.token, [["SPIKE-SPK-A", 5], ["SPIKE-SPK-B", 5], ["SPIKE-OTHER", 5]]],
    ["5A+5B (retail) → none", retail.token, [["SPIKE-SPK-A", 5], ["SPIKE-SPK-B", 5]]],
  ];
  for (const [label, token, items] of cases) {
    try {
      const cart = summarizeCart(await setCart(token, items));
      s.cases.push({ label, ...cart });
      log(`  ${label}: promos=${JSON.stringify(cart.promotions.map((p) => [p.label, p.total]))}`);
    } catch (e) {
      s.cases.push({ label, error: e.message });
    }
  }
  await store.call("DELETE", "checkout/cart", { token: dealer.token });
  if (retail.token) await store.call("DELETE", "checkout/cart", { token: retail.token });
  return s;
}

// ------------------------------------------------------------------ spike B/C: employee login, approvals, lists
async function spikeB2B() {
  const s = {};
  const owner = await login(CUST.dealer.email, PW.dealer);
  s.ownerLogin = { status: owner.status, error: owner.error };
  if (!owner.token) return s;

  // Permissions as the owner sees them (Store API), used for role definitions.
  const perms = await store.call("GET", "permission", { token: owner.token });
  s.permissions = { status: perms.status, data: perms.ok ? perms.data : storeErrorSummary(perms.data) };
  const all = [];
  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x && typeof x === "object") {
      if (typeof x.permissionName === "string") all.push(x.permissionName);
      else if (typeof x.name === "string" && /\./.test(x.name)) all.push(x.name);
      Object.values(x).forEach(walk);
    }
  };
  walk(perms.data);
  const permissionNames = [...new Set(all)].sort();
  s.permissionNames = permissionNames;
  // Shopping lists, quick order and requesting approval are not permission-gated in this version.
  const juniorPerms = [];
  s.juniorPermissions = juniorPerms;

  await up("b2b_components_role", [
    { _key: "admin", id: ROLE.admin, businessPartnerCustomerId: CUST.dealer.id, name: "SPIKE Admin", permissions: permissionNames, customFields: MARK },
    { _key: "junior", id: ROLE.junior, businessPartnerCustomerId: CUST.dealer.id, name: "SPIKE Junior Buyer", permissions: juniorPerms, customFields: MARK },
  ]);

  // Employee with an account + password set via the Admin API (no invite e-mail flow).
  s.employeeWrite = {};
  try {
    await up("b2b_employee_account", { _key: "junior", id: JUNIOR.account, firstName: "Spike", lastName: "Junior Buyer", email: JUNIOR.email, password: PW.junior, languageId: LANG, status: "active", customFields: MARK });
    s.employeeWrite.account = "ok";
  } catch (e) {
    s.employeeWrite.account = e.message.slice(0, 400);
  }
  try {
    await up("b2b_employee", {
      _key: "junior", id: JUNIOR.id, businessPartnerCustomerId: CUST.dealer.id, roleId: ROLE.junior, firstName: "Spike", lastName: "Junior Buyer",
      email: JUNIOR.email, password: PW.junior, languageId: LANG, status: "active", accountId: s.employeeWrite.account === "ok" ? JUNIOR.account : undefined,
      isPrimaryMembership: true, customFields: MARK,
    });
    s.employeeWrite.employee = "ok";
  } catch (e) {
    s.employeeWrite.employee = e.message.slice(0, 400);
  }
  if (s.employeeWrite.account === "ok") {
    await up("b2b_employee_account", { _key: "junior", id: JUNIOR.account, defaultEmployeeId: JUNIOR.id }).catch((e) => (s.employeeWrite.defaultEmployee = e.message.slice(0, 300)));
  }
  const emp = (await admin.search("b2b_employee", { ids: [JUNIOR.id], associations: { account: {} } })).data?.[0];
  s.employeeRecord = emp && { status: emp.status, accountId: emp.accountId, accountStatus: emp.account?.status, roleId: emp.roleId };

  // --- employee login spike (§9.3)
  const jr = await login(JUNIOR.email, PW.junior);
  s.employeeLogin = { route: "POST account/login", status: jr.status, error: jr.error };
  if (jr.token) {
    const me = await store.call("GET", "account/customer", { token: jr.token });
    s.employeeLogin.accountCustomer = { status: me.status, customerId: me.data?.id, isOwnerCustomer: me.data?.id === CUST.dealer.id, groupId: me.data?.groupId, extensions: Object.keys(me.data?.extensions ?? {}) };
    const ctx = await store.call("POST", "employee/context", { token: jr.token });
    s.employeeLogin.employeeContext = { status: ctx.status, data: ctx.ok ? ctx.data : storeErrorSummary(ctx.data) };
    const listing = await store.call("POST", "product", { token: jr.token, body: { filter: [{ type: "equals", field: "productNumber", value: "SPIKE-SPK-A" }], includes: { product: ["productNumber", "calculatedPrice", "calculatedPrices"] } } });
    s.employeeLogin.productUnitPriceQty1 = listing.data?.elements?.[0]?.calculatedPrice?.unitPrice;
    const jctx = await store.call("GET", "context", { token: jr.token });
    s.employeeLogin.context = { customerId: jctx.data?.customer?.id, customerIsOwner: jctx.data?.customer?.id === CUST.dealer.id, customerGroup: jctx.data?.currentCustomerGroup?.name, customerGroupId: jctx.data?.currentCustomerGroup?.id, ruleIds: (jctx.data?.ruleIds ?? []).filter((r) => Object.values(ID).includes(r)).map((r) => Object.keys(ID).find((k) => ID[k] === r)), customerExtensions: Object.keys(jctx.data?.customer?.extensions ?? {}) };
    const jcart = summarizeCart(await setCart(jr.token, [["SPIKE-SPK-A", 1]]));
    s.employeeLogin.cartUnitPriceQty1 = jcart.products[0]?.unit;
    const octx = await store.call("GET", "context", { token: owner.token });
    s.employeeLogin.ownerContext = { customerGroup: octx.data?.currentCustomerGroup?.name, ruleIds: (octx.data?.ruleIds ?? []).filter((r) => Object.values(ID).includes(r)).map((r) => Object.keys(ID).find((k) => ID[k] === r)) };
  }

  // --- approval rule (seeder path = Admin API). Condition type from the instance's own Storefront form
  // (data-b2b-approval-rule-base-options): "orderApprovalAllOrders" = "All orders", value [].
  // The Store API create route reads name/reviewerRoleId/affectedRoleId and a JSON-string approvalRuleCondition,
  // not the approvalRule* names in the OpenAPI document; it also accepts unknown condition types unvalidated.
  const RULE_ID = sid("b2b_components_approval_rule", "junior-always");
  try {
    await up("b2b_components_approval_rule", {
      _key: "junior-always", id: RULE_ID, businessPartnerCustomerId: CUST.dealer.id, name: "SPIKE · Junior Buyer always",
      description: "Phase 0 spike: every Junior Buyer cart needs approval", priority: 10, active: true,
      conditions: [{ type: "orderApprovalAllOrders", value: [] }], reviewerRoleId: ROLE.admin, affectedRoleId: ROLE.junior, customFields: MARK,
    });
    const row = (await admin.search("b2b_components_approval_rule", { ids: [RULE_ID] })).data[0];
    s.approvalRule = { via: "Admin API", stored: { conditions: row.conditions, reviewerRoleId: row.reviewerRoleId, affectedRoleId: row.affectedRoleId, active: row.active, priority: row.priority } };
  } catch (e) {
    s.approvalRule = { via: "Admin API", error: e.message.slice(0, 500) };
  }
  const visible = await store.call("GET", "approval-rule", { token: owner.token });
  s.approvalRule.visibleToOwnerViaStoreApi = { status: visible.status, names: (visible.data?.elements ?? visible.data ?? []).map?.((r) => r.name) ?? storeErrorSummary(visible.data) };

  // --- approval round trip (§6.6 / S10). Never calls an order-creating route.
  if (jr.token) {
    const roundTrip = async (label, decide) => {
      const t = { label };
      const cart = summarizeCart(await setCart(jr.token, [["SPIKE-SPK-A", 2], ["SPIKE-SPK-B", 1]]));
      t.cartErrors = cart.errors;
      const req = await store.call("POST", "pending-orders/request", { token: jr.token, body: { comment: `SPIKE ${label}` } });
      t.request = { status: req.status, error: req.ok ? null : storeErrorSummary(req.data), id: req.data?.id, number: req.data?.number, orderId: req.data?.orderId ?? null };
      if (!req.ok) return t;
      remember("b2b_components_pending_order", label, req.data.id, "created-via-store-api");
      const cartAfter = await store.call("GET", "checkout/cart", { token: jr.token });
      t.cartEmptiedAfterRequest = (cartAfter.data?.lineItems ?? []).length === 0;
      const asJunior = await store.call("POST", `pending-order/${req.data.id}`, { token: jr.token, body: { associations: { stateMachineState: {} } } });
      t.juniorCanRead = { status: asJunior.status, state: asJunior.data?.stateMachineState?.technicalName };
      const juniorDecide = await store.call("POST", `pending-order/${req.data.id}/${decide}`, { token: jr.token, body: { comment: "junior tries" } });
      t.juniorCannotDecide = { status: juniorDecide.status, error: juniorDecide.ok ? "UNEXPECTED: allowed" : storeErrorSummary(juniorDecide.data) };
      const d = await store.call("POST", `pending-order/${req.data.id}/${decide}`, { token: owner.token, body: { comment: `SPIKE owner ${decide}` } });
      t.ownerDecide = { status: d.status, error: d.ok ? null : storeErrorSummary(d.data) };
      const after = await store.call("POST", `pending-order/${req.data.id}`, { token: owner.token, body: { associations: { stateMachineState: {} } } });
      t.stateAfter = after.data?.stateMachineState?.technicalName ?? after.status;
      t.orderIdAfter = after.data?.orderId ?? null;
      return t;
    };
    s.approve = await roundTrip("approve", "approve");
    s.decline = await roundTrip("decline", "decline");

    // Listing pending orders: no documented Store API list route. Probe the obvious candidates (read-only).
    s.pendingOrderListing = {};
    for (const [m, p] of [["POST", "pending-orders"], ["GET", "pending-orders"], ["POST", "order"]]) {
      const r = await store.call(m, p, { token: owner.token, body: m === "POST" ? { limit: 5 } : undefined });
      s.pendingOrderListing[`${m} ${p}`] = { status: r.status, total: r.data?.total ?? r.data?.orders?.total ?? null, keys: r.ok && r.data && typeof r.data === "object" ? Object.keys(r.data).slice(0, 10) : storeErrorSummary(r.data) };
    }
  }

  // --- shopping lists (S8): Store API create as junior, and Admin API create (seeder path), both read back via Store API
  if (jr.token) {
    s.shoppingList = {};
    const items = Object.fromEntries(["SPIKE-SPK-A", "SPIKE-SPK-B", "SPIKE-OTHER"].map((k, i) => [pid(k), { id: pid(k), quantity: i + 1 }]));
    const lists0 = await store.call("POST", "shopping-lists", { token: jr.token, body: {} });
    const already = (lists0.data?.elements ?? []).find((l) => l.name === "SPIKE · Store API list");
    const created = already ? { status: "exists" } : await store.call("POST", "shopping-list", { token: jr.token, body: { name: "SPIKE · Store API list", lineItems: items } });
    s.shoppingList.storeCreate = { status: created.status, error: created.ok === false ? storeErrorSummary(created.data) : null };
    const adminListId = sid("b2b_components_shopping_list", "admin-list");
    try {
      await up("b2b_components_shopping_list", {
        _key: "admin-list", id: adminListId, name: "SPIKE · Admin API list", active: true, salesChannelId: SC.id, customerId: CUST.dealer.id, employeeId: JUNIOR.id, customFields: MARK,
        lineItems: ["SPIKE-SPK-A", "SPIKE-SPK-B", "SPIKE-OTHER"].map((k, i) => ({ id: sid("b2b_components_shopping_list_line_item", `admin-list-${k}`), productId: pid(k), productVersionId: LIVE_VERSION, quantity: i + 2 })),
      });
      s.shoppingList.adminCreate = "ok";
    } catch (e) {
      s.shoppingList.adminCreate = e.message.slice(0, 400);
    }
    const lists = await store.call("POST", "shopping-lists", { token: jr.token, body: {} });
    s.shoppingList.listedForJunior = (lists.data?.elements ?? []).map((l) => ({ id: l.id, name: l.name, lineItems: l.lineItems?.length ?? null }));
    for (const l of lists.data?.elements ?? []) {
      if (!/^SPIKE/.test(l.name ?? "")) continue;
      remember("b2b_components_shopping_list", l.name, l.id, "seen");
      const one = await store.call("POST", `shopping-list/${l.id}`, { token: jr.token, body: { associations: { lineItems: {} } } });
      const n = one.data?.lineItems?.length ?? one.data?.lineItems?.elements?.length ?? null;
      s.shoppingList[`detail:${l.name}`] = { status: one.status, lineItemCount: n };
    }
    const adminList = (lists.data?.elements ?? []).find((l) => l.id === adminListId);
    if (adminList) {
      await store.call("DELETE", "checkout/cart", { token: jr.token });
      const add = await store.call("POST", "shopping-lists/add-to-cart", { token: jr.token, body: { ids: [adminListId] } });
      const cart = await store.call("GET", "checkout/cart", { token: jr.token });
      s.shoppingList.addToCart = { status: add.status, cartLines: (cart.data?.lineItems ?? []).map((li) => [li.payload?.productNumber, li.quantity]) };
      await store.call("DELETE", "checkout/cart", { token: jr.token });
    }
  }

  // --- quick order (S7): no Store API route; app-side composition = product lookup by productNumber + cart add
  const q = await store.call("POST", "product", { token: jr.token ?? owner.token, body: { filter: [{ type: "equalsAny", field: "productNumber", value: ["SPIKE-SPK-A", "SPIKE-SPK-B", "NOPE-404"] }], includes: { product: ["id", "productNumber"] } } });
  s.quickOrderComposition = { status: q.status, found: (q.data?.elements ?? []).map((p) => p.productNumber), unknown: ["NOPE-404"].filter((n) => !(q.data?.elements ?? []).some((p) => p.productNumber === n)) };
  return s;
}

// ------------------------------------------------------------------ run
try {
  log("setup: catalog, rules, promotions");
  await setupCatalog();
  log("setup: customers, business partner, feature toggles");
  await setupCustomers();
  log("spike A1: series promotions via set groups");
  results.spikes.promotions = await spikePromotions("setgroup");
  save();
  log("spike A2: series promotions via cart rule (all units)");
  results.spikes.promotionsAllUnits = await spikePromotions("allunits");
  await usePromotionVariant("setgroup"); // leave the guide's primary approach active
  save();
  log("spike B/C: employee login, approvals, shopping lists, quick order");
  results.spikes.b2b = await spikeB2B();
} catch (e) {
  results.error = e.message;
  console.error(e);
} finally {
  results.ordersAfter = await admin.count("order");
  results.noOrdersCreated = results.ordersAfter === ordersBefore;
  results.finishedAt = new Date().toISOString();
  save();
  log(`orders before=${ordersBefore} after=${results.ordersAfter} → ${results.noOrdersCreated ? "OK, no orders" : "ORDERS CHANGED"}`);
  log(`wrote ${path.relative(ROOT, RESULTS)} and ${path.relative(ROOT, LEDGER)}`);
}
