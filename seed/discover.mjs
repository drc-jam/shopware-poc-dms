#!/usr/bin/env node
// seed:discover (DEV_GUIDE §11.1, Phase 0). READ-ONLY: the Admin client runs in readOnly mode
// (GET + /search only) and the Store API calls are GETs / anonymous reads.
//
// Outputs:
//   artifacts/discovery.json   instance facts, §13 prerequisite checks, B2B route inventory, page limit
//   data/b2b-routes.json       BFF B2B allowlist input, derived from the discovered OpenAPI document
//
// Usage: node seed/discover.mjs [--no-route-file]

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ROOT, loadSeedEnv, adminEnv, storeEnv, salesChannelIdFromEnv } from "./lib/env.mjs";
import { createAdminClient } from "./lib/admin-client.mjs";
import { createStoreClient } from "./lib/store-client.mjs";
import { listOperations, isB2B, isOrderCreating, buildRouteFile, APP_B2B_OPERATIONS } from "./lib/b2b-routes.mjs";

loadSeedEnv();
const writeRouteFile = !process.argv.includes("--no-route-file");
const admin = createAdminClient({ ...adminEnv(), readOnly: true });
const store = createStoreClient(storeEnv());
const now = new Date().toISOString();

const checks = [];
const check = (id, label, status, evidence) => checks.push({ id, label, status, evidence });

// ---------------------------------------------------------------- instance + commercial features
const { version } = await admin.get("/_info/version");
const config = await admin.get("/_info/config");
const bundles = Object.keys(config.bundles ?? {}).sort();
const toggleGroups = {};
for (const [k, v] of Object.entries(config.licenseToggles ?? {})) {
  const g = k.replace(/-\d+$/, "");
  toggleGroups[g] = (toggleGroups[g] ?? false) || v === true;
}
const B2B_FEATURES = {
  EMPLOYEE_MANAGEMENT: "EmployeeManagement",
  ORDER_APPROVAL: "OrderApproval",
  QUICK_ORDER: "QuickOrder",
  SHOPPING_LISTS: "ShoppingList",
  ORGANIZATION_UNITS: "OrganizationUnit",
};
const b2bFeatures = Object.fromEntries(
  Object.entries(B2B_FEATURES).map(([lic, bundle]) => [lic, { licensed: toggleGroups[lic] === true, bundleInstalled: bundles.includes(bundle) }]),
);
const required = ["EMPLOYEE_MANAGEMENT", "ORDER_APPROVAL", "QUICK_ORDER", "SHOPPING_LISTS"];
check(
  "13.1",
  "Shopware 6.7.x Commercial with B2B Components (Employee Mgmt, Order Approval, Quick Order, Shopping Lists)",
  /^6\.7\./.test(version) && required.every((f) => b2bFeatures[f].licensed) && bundles.includes("SwagCommercial") ? "pass" : "fail",
  { version, commercial: bundles.includes("SwagCommercial"), b2bFeatures },
);

// ---------------------------------------------------------------- page-size limit (probe; no 250/500 assumptions)
async function probePageLimit() {
  const probes = [];
  for (const entity of ["locale", "country", "country_state"]) {
    const total = await admin.count(entity);
    // Probe past the row count too: some instances reject an over-limit request instead of capping it.
    for (const limit of [100, 250, 500, 1000]) {
      try {
        const r = await admin.search(entity, { limit, includes: { [entity]: ["id"] } });
        probes.push({ entity, total, requested: limit, returned: r.data.length });
      } catch (e) {
        probes.push({ entity, total, requested: limit, error: e.message.slice(0, 200) });
      }
    }
  }
  const capped = probes.filter((p) => !p.error && p.returned < Math.min(p.requested, p.total));
  const errored = probes.filter((p) => p.error);
  const maxOk = Math.max(...probes.filter((p) => !p.error && p.returned === Math.min(p.requested, p.total)).map((p) => Math.min(p.requested, p.total)));
  const declared = errored.map((p) => Number(/MAX_LIMIT\(=(\d+)\)/.exec(p.error)?.[1])).filter(Number.isFinite);
  const inferredMax = declared.length
    ? Math.min(...declared)
    : capped.length
      ? Math.min(...capped.map((p) => p.returned))
      : errored.length
        ? Math.min(...errored.map((p) => p.requested)) - 1
        : null;
  return {
    probes,
    source: declared.length ? "declared by instance (MAX_LIMIT error)" : capped.length ? "observed cap" : errored.length ? "error bound" : "no cap detected",
    inferredMax,
    largestVerified: Number.isFinite(maxOk) ? maxOk : null,
    // The seeder paginates with this. Stay well under any detected cap.
    seederPageSize: inferredMax ? Math.min(100, inferredMax) : 100,
  };
}
const pageLimit = await probePageLimit();

// ---------------------------------------------------------------- integration (write access for the seeder)
const integration = (
  await admin.search("integration", {
    filter: [{ type: "equals", field: "accessKey", value: adminEnv().clientId }],
    associations: { aclRoles: {} },
    includes: { integration: ["id", "label", "admin", "aclRoles", "createdAt"], acl_role: ["name", "privileges"] },
  }).catch((e) => ({ error: e.message }))
).data?.[0];
check(
  "13.3",
  "Integration (Admin API) with write access, for the seeder only",
  integration?.admin === true ? "pass" : integration ? "warn" : "unknown",
  integration
    ? { label: integration.label, admin: integration.admin, aclRoles: (integration.aclRoles ?? []).map((r) => r.name) }
    : { note: "integration record not readable with these credentials; OAuth works" },
);

// ---------------------------------------------------------------- sales channel (from the access key)
const accessKey = storeEnv().accessKey;
const scCriteria = {
  filter: [{ type: "equals", field: "accessKey", value: accessKey }],
  associations: {
    type: {},
    currency: {},
    currencies: {},
    country: {},
    countries: {},
    language: {},
    languages: { associations: { locale: {} } },
    domains: { associations: { currency: {}, language: { associations: { locale: {} } } } },
    paymentMethod: {},
    paymentMethods: {},
    shippingMethod: {},
    shippingMethods: { associations: { prices: {} } },
    customerGroup: {},
  },
};
const sc = (await admin.search("sales_channel", scCriteria)).data?.[0] ?? null;
const envScId = salesChannelIdFromEnv();
const pick = (o, keys) => (o ? Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]])) : null);
const salesChannel = sc && {
  id: sc.id,
  name: sc.name ?? sc.translated?.name,
  type: sc.type?.name ?? sc.type?.translated?.name ?? sc.typeId,
  typeId: sc.typeId,
  active: sc.active,
  maintenance: sc.maintenance,
  defaultCurrency: pick(sc.currency, ["id", "isoCode"]),
  currencies: (sc.currencies ?? []).map((c) => c.isoCode),
  defaultCountry: pick(sc.country, ["id", "iso"]),
  countries: (sc.countries ?? []).map((c) => c.iso),
  defaultLanguage: sc.language?.name,
  languages: (sc.languages ?? []).map((l) => l.locale?.code ?? l.name),
  domains: (sc.domains ?? []).map((d) => ({ url: d.url, currency: d.currency?.isoCode, locale: d.language?.locale?.code })),
  defaultPaymentMethod: sc.paymentMethod && { id: sc.paymentMethod.id, technicalName: sc.paymentMethod.technicalName, name: sc.paymentMethod.translated?.name ?? sc.paymentMethod.name },
  paymentMethods: (sc.paymentMethods ?? []).map((p) => ({ id: p.id, technicalName: p.technicalName, name: p.translated?.name ?? p.name, active: p.active, handler: p.handlerIdentifier })),
  defaultShippingMethod: sc.shippingMethod && { id: sc.shippingMethod.id, technicalName: sc.shippingMethod.technicalName, name: sc.shippingMethod.translated?.name ?? sc.shippingMethod.name },
  shippingMethods: (sc.shippingMethods ?? []).map((s) => ({
    id: s.id,
    technicalName: s.technicalName,
    name: s.translated?.name ?? s.name,
    active: s.active,
    prices: (s.prices ?? []).map((p) => ({ calculation: p.calculation, quantityStart: p.quantityStart, price: p.currencyPrice?.[0]?.gross ?? null, ruleId: p.ruleId ?? null })),
  })),
  customerGroup: pick(sc.customerGroup, ["id", "name"]) ?? { id: sc.customerGroupId },
  navigationCategoryId: sc.navigationCategoryId,
};
const usd = salesChannel?.currencies.includes("USD");
const us = salesChannel?.countries.includes("US");
check(
  "13.2",
  "Dedicated demo sales channel (Storefront or Headless) with USD, US, and a domain",
  salesChannel && usd && us && salesChannel.active && (salesChannel.domains.length > 0 || /headless/i.test(salesChannel.type)) ? "pass" : "fail",
  {
    found: !!salesChannel,
    id: salesChannel?.id,
    name: salesChannel?.name,
    type: salesChannel?.type,
    active: salesChannel?.active,
    usd,
    us,
    defaultCurrency: salesChannel?.defaultCurrency?.isoCode,
    domains: salesChannel?.domains,
    envSalesChannelId: envScId ? (envScId === salesChannel?.id ? "matches" : "MISMATCH") : "unset (derived from access key)",
  },
);
check("13.4", "Sales channel access key for the Store API", salesChannel ? "pass" : "fail", { resolvesToSalesChannel: !!salesChannel });

const invoice = salesChannel?.paymentMethods.find((p) => /invoice/i.test(`${p.technicalName} ${p.handler} ${p.name}`));
const flat = salesChannel?.shippingMethods.find((s) => s.active && s.prices.length > 0);
check(
  "13.5",
  "Invoice payment and a flat-rate shipping method assigned to the sales channel",
  invoice?.active && flat ? "pass" : "fail",
  { invoice: invoice ?? null, shippingCandidates: salesChannel?.shippingMethods ?? [] },
);

// ---------------------------------------------------------------- reference data (§6.1), read-only
const ref = {};
ref.currencyUSD = pick((await admin.search("currency", { filter: [{ type: "equals", field: "isoCode", value: "USD" }] })).data?.[0], ["id", "isoCode", "factor", "symbol"]);
ref.countryUS = pick((await admin.search("country", { filter: [{ type: "equals", field: "iso", value: "US" }] })).data?.[0], ["id", "iso", "active", "shippingAvailable"]);
const enUS = (await admin.search("language", { filter: [{ type: "equals", field: "locale.code", value: "en-US" }], associations: { locale: {} } })).data?.[0];
ref.languageEnUS = enUS ? { id: enUS.id, name: enUS.name } : null;
ref.taxes = (await admin.searchAll("tax", {}, pageLimit.seederPageSize)).map((t) => pick(t, ["id", "name", "taxRate", "position"]));
ref.salutations = (await admin.searchAll("salutation", {}, pageLimit.seederPageSize)).map((s) => s.salutationKey);
ref.customerGroups = (await admin.searchAll("customer_group", {}, pageLimit.seederPageSize)).map((g) => ({ id: g.id, name: g.translated?.name ?? g.name, displayGross: g.displayGross, registrationActive: g.registrationActive }));
ref.paymentMethods = (await admin.searchAll("payment_method", {}, pageLimit.seederPageSize)).map((p) => ({ id: p.id, technicalName: p.technicalName, name: p.translated?.name ?? p.name, active: p.active }));
ref.shippingMethods = (await admin.searchAll("shipping_method", {}, pageLimit.seederPageSize)).map((s) => ({ id: s.id, technicalName: s.technicalName, name: s.translated?.name ?? s.name, active: s.active }));
ref.salesChannels = (await admin.searchAll("sales_channel", { associations: { type: {} } }, pageLimit.seederPageSize)).map((s) => ({ id: s.id, name: s.translated?.name ?? s.name, type: s.type?.translated?.name ?? s.type?.name, active: s.active }));
ref.customFieldSets = (await admin.searchAll("custom_field_set", { filter: [{ type: "prefix", field: "name", value: "demo" }] }, pageLimit.seederPageSize)).map((s) => s.name);

// ---------------------------------------------------------------- existing data (is the instance safe to seed / reset?)
const COUNT_ENTITIES = [
  "product", "category", "product_manufacturer", "customer", "order", "promotion", "rule", "product_stream", "media",
  "b2b_business_partner", "b2b_employee", "b2b_components_role", "b2b_components_approval_rule",
  "b2b_components_pending_order", "b2b_components_shopping_list",
];
const counts = {};
for (const e of COUNT_ENTITIES) counts[e] = await admin.count(e).catch((err) => `error: ${err.message.slice(0, 120)}`);
const ordersInChannel = salesChannel ? await admin.count("order", [{ type: "equals", field: "salesChannelId", value: salesChannel.id }]) : null;
check(
  "13.8",
  "Instance can be reset safely; nothing points at production data",
  "manual",
  { note: "Not machine-verifiable. Owner must confirm. Data present on the instance is listed under existingData.", firstMigrationDate: config.settings?.firstMigrationDate, appUrl: config.appUrl },
);
check(
  "13.6",
  "B2B features activated at the system level",
  required.every((f) => b2bFeatures[f].licensed) ? "pass" : "fail",
  { note: "Licensed per licenseToggles. Customer-specific toggles are set by the seeder; the Phase 0 spikes exercise them." },
);
check("13.7", "CORS not required (all calls are server-side through the BFF)", "n/a", null);

// ---------------------------------------------------------------- Store API: OpenAPI + B2B routes
const oaRes = await store.call("GET", "_info/openapi3.json");
if (!oaRes.ok) throw new Error(`Store API OpenAPI fetch failed: HTTP ${oaRes.status}`);
const openapi = oaRes.data;
const ops = listOperations(openapi);
const b2bOps = ops.filter(isB2B);
const byTag = {};
for (const op of b2bOps) for (const t of op.tags) (byTag[t] ??= []).push({ method: op.method, path: op.path, operationId: op.operationId, summary: op.summary });
const routeFile = buildRouteFile(ops, { shopwareVersion: version, discoveredAt: now });
const quickOrderRoutes = ops.filter((op) => /quick/i.test(`${op.path} ${op.operationId} ${op.tags.join(" ")}`));
const loginOp = ops.find((op) => op.operationId === "loginCustomer");

const ctx = await store.call("GET", "context");
const storeContext = ctx.ok
  ? { salesChannelId: ctx.data?.salesChannel?.id, currency: ctx.data?.currency?.isoCode, customerGroup: ctx.data?.currentCustomerGroup?.name, taxState: ctx.data?.taxState }
  : { error: `HTTP ${ctx.status}` };

const discovery = {
  generatedAt: now,
  readOnly: true,
  instance: {
    host: new URL(adminEnv().url).host,
    shopwareVersion: version,
    storeApiOpenApiVersion: openapi.info?.version,
    commercial: bundles.includes("SwagCommercial"),
    b2bFeatures,
    bundles,
  },
  prerequisites: checks.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
  apiPageLimit: pageLimit,
  salesChannel,
  storeContext,
  reference: ref,
  existingData: { counts, ordersInDemoSalesChannel: ordersInChannel },
  storeApi: {
    pathCount: Object.keys(openapi.paths ?? {}).length,
    b2bRoutesByTag: byTag,
    appB2BRoutes: routeFile.routes,
    appOperationsNotFound: Object.keys(APP_B2B_OPERATIONS).filter((id) => !ops.some((op) => op.operationId === id)),
    orderCreatingRoutes: routeFile.orderCreatingRoutes,
    quickOrder: quickOrderRoutes.length
      ? { routes: quickOrderRoutes }
      : { routes: [], note: "No Quick Order Store API route. Quick order must be composed app-side (product search by productNumber + cart line-item add)." },
    customerLogin: loginOp ? { method: loginOp.method, path: loginOp.path, operationId: loginOp.operationId } : null,
    employeeLogin: { status: "pending-spike", note: "Whether B2B employees use account/login is decided by the Phase 0 spike (artifacts/spikes.md)." },
  },
};

mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
writeFileSync(path.join(ROOT, "artifacts/discovery.json"), JSON.stringify(discovery, null, 2) + "\n");

if (writeRouteFile) {
  const routePath = path.join(ROOT, "data/b2b-routes.json");
  // Preserve the spike decision on employee login across rediscovery.
  if (existsSync(routePath)) {
    const prev = JSON.parse(readFileSync(routePath, "utf8"));
    if (prev.employeeLogin) routeFile.employeeLogin = prev.employeeLogin;
  }
  writeFileSync(routePath, JSON.stringify(routeFile, null, 2) + "\n");
}

// ---------------------------------------------------------------- summary
console.log(`Shopware ${version} @ ${discovery.instance.host}  (Store API OpenAPI ${discovery.instance.storeApiOpenApiVersion}, ${discovery.storeApi.pathCount} paths)`);
console.log(`Sales channel: ${salesChannel?.name ?? "NOT FOUND"} (${salesChannel?.type ?? "?"}) ${salesChannel?.id ?? ""}`);
console.log(`Page limit: inferredMax=${pageLimit.inferredMax ?? "none detected"} largestVerified=${pageLimit.largestVerified} seederPageSize=${pageLimit.seederPageSize}`);
console.log(`B2B Store API operations: ${b2bOps.length}; app routes: ${routeFile.routes.length}; order-creating routes: ${routeFile.orderCreatingRoutes.length}`);
console.log("\n§13 prerequisites:");
for (const c of discovery.prerequisites) console.log(`  ${c.status.toUpperCase().padEnd(7)} ${c.id.padEnd(5)} ${c.label}`);
console.log(`\nwrote artifacts/discovery.json${writeRouteFile ? " and data/b2b-routes.json" : ""}`);
const failed = discovery.prerequisites.filter((c) => c.status === "fail");
if (failed.length) {
  console.error(`\n${failed.length} prerequisite(s) failed: ${failed.map((c) => c.id).join(", ")}`);
  process.exitCode = 1;
}
