// Desired Shopware state for the demo, derived from the fixture (DEV_GUIDE §6, §11.3).
// Pure: no I/O. plan, apply and --replace-demo all use it, so IDs and payloads are identical everywhere.
//
// IDs are stableId(<entity>, <business key>) (DEV_GUIDE §8). Product IDs = stableId("product", productNumber),
// which the fitment index and the e2e mock also use.

import path from "node:path";
import { stableId } from "./stable-id.mjs";

export const MARKER_FIELD = "demo_fixture";

/** Approved Phase 0 decision D1: series tiers are promotions with a cart rule on total series quantity. */
const SERIES_PROMO_LABEL = (series, minQty) => `${series.label} mix-and-match — ${minQty}+ tier`;

/** Fixture feature names → customer_specific_features codes (read from the instance in Phase 0). */
export const FEATURE_CODES = {
  employee_management: "EMPLOYEE_MANAGEMENT",
  order_approval: "ORDER_APPROVAL",
  quick_order: "QUICK_ORDER",
  shopping_list: "SHOPPING_LISTS",
};

/**
 * Junior Buyer permission intents → instance permissions. Phase 0: shopping lists, quick order and
 * requesting approval are not permission-gated in 6.7.16, and product/cart access needs none.
 */
export const INTENT_PERMISSIONS = {
  view_products: [],
  cart: [],
  quick_order: [],
  shopping_lists: [],
  request_approval: [],
};

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {object} fx   composed fixture (loadFixture)
 * @param {object} ref  resolved reference IDs:
 *   { salesChannelId, languageId, usdId, systemCurrencyId, usdFactor, countryIds: {US}, salutationIds: {key: id},
 *     invoicePaymentId, productMediaFolderId }
 */
export function buildModel(fx, ref) {
  const marker = { [MARKER_FIELD]: fx.source.name };
  const id = stableId;
  const sc = ref.salesChannelId;

  // Prices: system default currency is required by Shopware (EUR on this instance) plus an explicit USD price.
  // The demo tax is 0%, so net = gross.
  const money = (usdGross, listUsd) => {
    const row = (currencyId, gross, list) => ({
      currencyId, gross, net: gross, linked: false,
      ...(list !== undefined ? { listPrice: { currencyId, gross: list, net: list, linked: false } } : {}),
    });
    const out = [row(ref.usdId, usdGross, listUsd)];
    if (ref.systemCurrencyId !== ref.usdId) {
      const f = ref.usdFactor;
      out.unshift(row(ref.systemCurrencyId, round2(usdGross / f), listUsd !== undefined ? round2(listUsd / f) : undefined));
    }
    return out;
  };

  const ids = {
    tax: id("tax", "demo-0"),
    groups: { Retail: id("customer_group", "Retail"), Dealer: id("customer_group", "Dealer") },
    ruleDealer: id("rule", "customer-group-dealer"),
    rootCategory: id("category", "__root__"),
    customFieldSet: id("custom_field_set", "demo"),
  };
  const catId = (p) => id("category", p.join(" > "));
  const brandByName = new Map(fx.brands.map((b) => [b.name, b]));
  const manufacturerId = (name) => id("product_manufacturer", brandByName.get(name)?.code ?? name);
  const productId = (sku) => id("product", sku);
  const mediaFile = (rel) => `ftsc-demo-${path.basename(rel, path.extname(rel))}`;
  const mediaId = (rel) => id("media", mediaFile(rel));

  const stages = [];
  const stage = (name, entity, records, opts = {}) => stages.push({ name, entity, records, ...opts });

  // ---- reference alignment: demo tax (0%)
  stage("tax", "tax", [{ key: "demo-0", id: ids.tax, payload: { id: ids.tax, name: "DEMO · No tax (demo fixture)", taxRate: 0, position: 90, customFields: marker } }]);

  // ---- customer groups
  stage("customer groups", "customer_group", ["Retail", "Dealer"].map((g) => ({
    key: g, id: ids.groups[g], payload: { id: ids.groups[g], name: g, displayGross: true, customFields: marker },
  })));

  // ---- rules (dealer persona rule; series rules come after streams)
  stage("rules: dealer", "rule", [{
    key: "customer-group-dealer", id: ids.ruleDealer,
    payload: {
      id: ids.ruleDealer, name: "DEMO · Customer group = Dealer", priority: 100, customFields: marker,
      conditions: [{ id: id("rule_condition", "customer-group-dealer"), type: "customerCustomerGroup", value: { operator: "=", customerGroupIds: [ids.groups.Dealer] } }],
    },
  }]);

  // ---- categories: own root + fixture tree, ordered as in the fixture
  const catRecords = [[{
    // The demo sales channel's navigation root points here, so --replace-demo keeps it (children are replaced).
    key: "__root__", id: ids.rootCategory, keepOnReplace: true,
    payload: { id: ids.rootCategory, name: "Demo catalog (fixture)", type: "page", productAssignmentType: "product", displayNestedProducts: true, active: true, visible: true, customFields: marker },
  }]];
  const maxDepth = Math.max(...fx.categories.map((c) => c.path.length));
  for (let depth = 1; depth <= maxDepth; depth++) {
    const level = fx.categories.filter((c) => c.path.length === depth);
    const prevSibling = new Map();
    catRecords.push(level.map((c) => {
      const parentKey = c.path.slice(0, -1).join(" > ");
      const cid = catId(c.path);
      const after = prevSibling.get(parentKey) ?? null;
      prevSibling.set(parentKey, cid);
      return {
        key: c.path.join(" > "), id: cid,
        payload: {
          id: cid, parentId: depth === 1 ? ids.rootCategory : catId(c.path.slice(0, -1)), afterCategoryId: after,
          name: c.path.at(-1), description: c.description ?? null, type: "page", productAssignmentType: "product",
          displayNestedProducts: true, active: true, visible: true, customFields: marker,
        },
      };
    }));
  }
  catRecords.forEach((records, i) => stage(`categories (level ${i})`, "category", records));

  // ---- navigation root of the demo sales channel (explicit, logged reference alignment)
  stage("sales channel navigation root", "sales_channel", [{
    key: "navigationCategoryId", id: sc, alignment: true,
    payload: { id: sc, navigationCategoryId: ids.rootCategory },
  }]);

  // ---- manufacturers
  stage("manufacturers", "product_manufacturer", fx.brands.map((b) => ({
    key: b.code, id: id("product_manufacturer", b.code), payload: { id: id("product_manufacturer", b.code), name: b.name, customFields: marker },
  })));

  // ---- custom fields (storeApiAware so the app sees them; allowCartExpose for cart line items)
  const field = (name, type, label, extra = {}) => ({
    id: id("custom_field", name), name, type, active: true, storeApiAware: true, allowCartExpose: true,
    config: { label: { "en-GB": label }, ...extra },
  });
  stage("custom field set", "custom_field_set", [{
    key: "demo", id: ids.customFieldSet,
    payload: {
      id: ids.customFieldSet, name: "demo", active: true, config: { label: { "en-GB": "Demo fixture" } },
      relations: [{ id: id("custom_field_set_relation", "demo:product"), entityName: "product" }],
      customFields: [
        field("demo_series", "text", "Series code"),
        field("demo_map_policy", "select", "MAP policy", {
          componentName: "sw-single-select", customFieldType: "select",
          options: [{ value: "none", label: { "en-GB": "None" } }, { value: "hide_until_cart", label: { "en-GB": "Hide price until cart" } }],
        }),
        field(MARKER_FIELD, "text", "Demo fixture marker"),
      ],
    },
  }]);

  // ---- media (entities; files are uploaded by apply and cached by hasFile)
  const mediaFiles = [...new Set(fx.products.flatMap((p) => p.media ?? []))].sort();
  stage("media", "media", mediaFiles.map((rel) => ({
    key: mediaFile(rel), id: mediaId(rel),
    file: { path: path.join(fx.mediaDir, rel), fileName: mediaFile(rel), extension: path.extname(rel).slice(1) },
    payload: { id: mediaId(rel), mediaFolderId: ref.productMediaFolderId, private: false, alt: null, customFields: marker },
  })));

  // ---- series: product stream → line-item rule → qty rules → promotions (D1: all units, no set groups)
  const streams = [], seriesRules = [], promotions = [];
  for (const s of fx.series) {
    const streamId = id("product_stream", `series-${s.code}`);
    const lineRule = id("rule", `series-${s.code}-line-item`);
    streams.push({
      key: `series-${s.code}`, id: streamId,
      payload: {
        id: streamId, name: `DEMO · Series ${s.code} (${s.label})`, customFields: marker,
        filters: [{ id: id("product_stream_filter", `series-${s.code}`), type: "equals", field: "customFields.demo_series", value: s.code, position: 0 }],
      },
    });
    seriesRules.push({
      key: `series-${s.code}-line-item`, id: lineRule,
      payload: {
        id: lineRule, name: `DEMO · Series ${s.code} line item`, priority: 100, customFields: marker,
        conditions: [{ id: id("rule_condition", `series-${s.code}-line-item`), type: "cartLineItemInProductStream", value: { operator: "=", streamIds: [streamId] } }],
      },
    });
    const tierIds = s.tiers.map((t) => id("promotion", `series-${s.code}-${t.minQty}`));
    s.tiers.forEach((t, i) => {
      const qtyRule = id("rule", `series-${s.code}-qty-${t.minQty}`);
      const key = `series-${s.code}-${t.minQty}`;
      seriesRules.push({
        key: `series-${s.code}-qty-${t.minQty}`, id: qtyRule,
        payload: {
          id: qtyRule, name: `DEMO · Series ${s.code} qty ≥ ${t.minQty}`, priority: 100, customFields: marker,
          conditions: [{
            id: id("rule_condition", `series-${s.code}-qty-${t.minQty}`), type: "cartLineItemGoodsTotal", value: { operator: ">=", count: t.minQty },
            children: [{ id: id("rule_condition", `series-${s.code}-qty-${t.minQty}-filter`), type: "cartLineItemInProductStream", value: { operator: "=", streamIds: [streamId] } }],
          }],
        },
      });
      promotions.push({
        key, id: tierIds[i],
        payload: {
          id: tierIds[i], name: SERIES_PROMO_LABEL(s, t.minQty), active: true, priority: i + 1, exclusive: false,
          useCodes: false, useIndividualCodes: false, useSetGroups: false, preventCombination: false, customerRestriction: false,
          exclusionIds: tierIds.filter((x) => x !== tierIds[i]), customFields: { ...marker, demo_series: s.code },
          salesChannels: [{ id: id("promotion_sales_channel", `${key}:${sc}`), salesChannelId: sc, priority: 1 }],
          personaRules: [{ id: ids.ruleDealer }],
          cartRules: [{ id: qtyRule }],
          discounts: [{
            id: id("promotion_discount", key), scope: "cart", type: "percentage", value: t.discountPct,
            considerAdvancedRules: true, discountRules: [{ id: lineRule }],
          }],
        },
      });
    });
  }
  // Streams BEFORE products: Shopware computes product.streamIds when a product is written, so a stream created
  // after the products stays empty on a fresh build (found by the first --replace-demo run). The series rules
  // match line items through these streams.
  stage("product streams", "product_stream", streams);

  // ---- products + media + advanced prices (dealer tiers with retail listPrice)
  const productRecords = fx.products.map((p) => {
    const pid = productId(p.productNumber);
    const tiers = p.demo.dealerTiers ?? [];
    const prices = tiers.map((t, i) => ({
      id: id("product_price", `${p.productNumber}:${t.minQty}`),
      ruleId: ids.ruleDealer,
      quantityStart: t.minQty,
      quantityEnd: tiers[i + 1] ? tiers[i + 1].minQty - 1 : null,
      price: money(t.gross, p.price.gross),
    }));
    const pm = (p.media ?? []).map((rel, i) => ({ id: id("product_media", `${p.productNumber}:${i}`), mediaId: mediaId(rel), position: i }));
    return {
      key: p.productNumber, id: pid,
      keepChildren: { product_price: prices.map((x) => x.id), product_media: pm.map((x) => x.id) },
      payload: {
        id: pid, productNumber: p.productNumber, name: p.name, description: p.description ?? null,
        active: true, stock: p.stock, taxId: ids.tax, manufacturerId: manufacturerId(p.brand),
        price: money(p.price.gross),
        categories: [{ id: catId(p.categoryPath) }],
        visibilities: [{ id: id("product_visibility", `${p.productNumber}:${sc}`), salesChannelId: sc, visibility: 30 }],
        media: pm,
        coverId: pm[0]?.id ?? null,
        prices,
        customFields: { ...marker, demo_series: p.demo.series ?? null, demo_map_policy: p.demo.mapPolicy ?? "none" },
      },
    };
  });
  stage("products", "product", productRecords, { chunk: 20 });

  stage("rules: series", "rule", seriesRules);
  stage("promotions", "promotion", promotions);

  // ---- customers
  const customerId = (key) => id("customer", key);
  const customers = fx.customers.map((c) => {
    const addr = id("customer_address", c.key);
    const salutationId = ref.salutationIds[c.salutation] ?? ref.salutationIds.not_specified;
    return {
      key: c.key, id: customerId(c.key), email: c.email, passwordEnv: c.passwordEnv,
      payload: {
        id: customerId(c.key), email: c.email, groupId: ids.groups[c.customerGroup], salesChannelId: sc, languageId: ref.languageId,
        customerNumber: `DEMO-${c.key.toUpperCase()}`, salutationId, firstName: c.firstName, lastName: c.lastName,
        accountType: c.company ? "business" : "private", company: c.company ?? null, active: true, guest: false,
        lastPaymentMethodId: ref.invoicePaymentId, customFields: marker,
        defaultBillingAddressId: addr, defaultShippingAddressId: addr,
        addresses: [{
          id: addr, salutationId, firstName: c.firstName, lastName: c.lastName, company: c.company ?? null,
          street: c.address.street, zipcode: c.address.zipcode, city: c.address.city, countryId: ref.countryIds[c.address.countryIso],
        }],
      },
    };
  });
  stage("customers", "customer", customers, { secrets: true });

  // ---- B2B (DEV_GUIDE §6.6)
  const b2b = fx.b2b;
  const owner = customerId(b2b.company.ownerCustomer);
  stage("b2b business partner", "b2b_business_partner", [{
    key: b2b.company.ownerCustomer, id: id("b2b_business_partner", b2b.company.ownerCustomer),
    payload: { id: id("b2b_business_partner", b2b.company.ownerCustomer), customerId: owner, customFields: marker },
  }]);
  stage("b2b feature toggles", "customer_specific_features", [{
    key: b2b.company.ownerCustomer, id: id("customer_specific_features", b2b.company.ownerCustomer),
    payload: {
      id: id("customer_specific_features", b2b.company.ownerCustomer), customerId: owner,
      features: Object.fromEntries(b2b.company.features.map((f) => [FEATURE_CODES[f], true])),
    },
  }]);
  const roleId = (key) => id("b2b_components_role", key);
  stage("b2b roles", "b2b_components_role", b2b.roles.map((r) => ({
    key: r.key, id: roleId(r.key),
    // permissions are resolved by apply from the instance (GET permission as the owner): "*" = all.
    permissionsSpec: r.permissions ?? null, permissionIntents: r.permissionIntents ?? null,
    payload: { id: roleId(r.key), businessPartnerCustomerId: owner, name: r.name, customFields: marker },
  })), { needsPermissions: true });

  const employees = b2b.employees.map((e) => ({
    key: e.key, email: e.email, passwordEnv: e.passwordEnv,
    accountId: id("b2b_employee_account", e.key), id: id("b2b_employee", e.key),
    account: { id: id("b2b_employee_account", e.key), firstName: e.firstName, lastName: e.lastName, email: e.email, languageId: ref.languageId, status: e.active ? "active" : "inactive", customFields: marker },
    employee: {
      id: id("b2b_employee", e.key), businessPartnerCustomerId: owner, roleId: roleId(e.role), firstName: e.firstName, lastName: e.lastName,
      email: e.email, languageId: ref.languageId, status: e.active ? "active" : "inactive", accountId: id("b2b_employee_account", e.key),
      isPrimaryMembership: true, customFields: marker,
    },
  }));
  stage("b2b employee accounts", "b2b_employee_account", employees.map((e) => ({ key: e.key, id: e.accountId, passwordEnv: e.passwordEnv, payload: e.account })), { secrets: true });
  stage("b2b employees", "b2b_employee", employees.map((e) => ({ key: e.key, id: e.id, passwordEnv: e.passwordEnv, payload: e.employee })), { secrets: true });
  stage("b2b employee default membership", "b2b_employee_account", employees.map((e) => ({ key: `${e.key}:default`, id: e.accountId, payload: { id: e.accountId, defaultEmployeeId: e.id } })));

  stage("b2b approval rules", "b2b_components_approval_rule", b2b.approvalRules.map((r) => ({
    key: r.key, id: id("b2b_components_approval_rule", r.key),
    payload: {
      id: id("b2b_components_approval_rule", r.key), businessPartnerCustomerId: owner, name: r.name,
      description: "Demo: every Junior Buyer cart needs approval", priority: 10, active: true,
      conditions: approvalConditions(r.condition),
      reviewerRoleId: roleId(r.reviewerRole), affectedRoleId: roleId(r.affectedRole), customFields: marker,
    },
  })));

  const employeeByKey = new Map(employees.map((e) => [e.key, e]));
  stage("b2b shopping lists", "b2b_components_shopping_list", b2b.shoppingLists.map((l) => ({
    key: l.key, id: id("b2b_components_shopping_list", l.key),
    keepChildren: { b2b_components_shopping_list_line_item: l.items.map((it) => id("b2b_components_shopping_list_line_item", `${l.key}:${it.productNumber}`)) },
    expectItems: l.items.length,
    payload: {
      id: id("b2b_components_shopping_list", l.key), name: l.name, active: true, salesChannelId: sc, customerId: owner,
      employeeId: employeeByKey.get(l.owner)?.id ?? null, customFields: marker,
      lineItems: l.items.map((it) => ({
        id: id("b2b_components_shopping_list_line_item", `${l.key}:${it.productNumber}`),
        productId: productId(it.productNumber), productVersionId: LIVE_VERSION, quantity: it.quantity,
      })),
    },
  })));

  return { stages, ids: { ...ids, productId, customerId, roleId, catId }, marker };
}

/** Shopware live version id (a platform constant). */
export const LIVE_VERSION = "0fa91ce3e96a4bc2be4bd9ce752c3425";

/**
 * Fixture approval condition → B2B Order Approval condition list (stored shape verified in Phase 0).
 * Condition types offered by the instance: see artifacts/spikes.md.
 */
export function approvalConditions(cond) {
  if (cond.type === "cartAmountGte") return [{ type: "cartCartAmount", value: { operator: ">=", amount: cond.value } }];
  throw new Error(`unsupported approval condition ${cond.type}`);
}

/**
 * Record IDs the model owns, in reverse stage (dependency) order, for readback and --replace-demo.
 * Stages are kept separate (the dealer rule must go after the products whose prices use it); each ID is listed once.
 * With { forDelete: true }, records marked keepOnReplace (the navigation root anchor) are left out.
 */
export function ownedIds(model, { forDelete = false } = {}) {
  const seen = new Set();
  const out = [];
  for (const st of [...model.stages].reverse()) {
    if (st.entity === "sales_channel") continue; // alignment, never deleted
    const ids = st.records.filter((r) => !(forDelete && r.keepOnReplace)).map((r) => r.id).filter((id) => !seen.has(`${st.entity}:${id}`));
    ids.forEach((id) => seen.add(`${st.entity}:${id}`));
    if (!ids.length) continue;
    const last = out.at(-1);
    if (last?.entity === st.entity) last.ids.push(...ids);
    else out.push({ entity: st.entity, ids });
  }
  return out;
}
