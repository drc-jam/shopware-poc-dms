import { describe, expect, it } from "vitest";
import { loadFixture } from "./fixture.mjs";
import { buildModel, ownedIds, approvalConditions, MARKER_FIELD } from "./model.mjs";
import { stableId } from "./stable-id.mjs";

const ref = {
  salesChannelId: "a".repeat(32), languageId: "b".repeat(32), usdId: "c".repeat(32), systemCurrencyId: "d".repeat(32), usdFactor: 1.2,
  countryIds: { US: "e".repeat(32) }, salutationIds: { not_specified: "f".repeat(32) }, invoicePaymentId: "1".repeat(32), productMediaFolderId: "2".repeat(32),
};
const fx = loadFixture();
const model = buildModel(fx, ref);
const stage = (entity) => model.stages.filter((s) => s.entity === entity).flatMap((s) => s.records);

describe("seed model", () => {
  it("is deterministic", () => {
    expect(JSON.stringify(buildModel(loadFixture(), ref))).toBe(JSON.stringify(model));
  });

  it("uses stableId('product', productNumber) for products (fitment index + mock rely on it)", () => {
    for (const p of fx.products) expect(stage("product").some((r) => r.id === stableId("product", p.productNumber))).toBe(true);
    expect(stage("product")).toHaveLength(fx.products.length);
  });

  it("prices every product in the system currency and USD, with dealer tiers carrying the retail list price", () => {
    for (const r of stage("product")) {
      const cur = r.payload.price.map((x) => x.currencyId).sort();
      expect(cur).toEqual([ref.usdId, ref.systemCurrencyId].sort());
      for (const tier of r.payload.prices) {
        const usd = tier.price.find((x) => x.currencyId === ref.usdId);
        expect(usd.listPrice.gross).toBe(r.payload.price.find((x) => x.currencyId === ref.usdId).gross);
        expect(usd.gross).toBeLessThan(usd.listPrice.gross);
      }
    }
  });

  it("gives tier rows contiguous quantity ranges", () => {
    for (const r of stage("product")) {
      const t = r.payload.prices;
      t.forEach((row, i) => expect(row.quantityEnd).toBe(t[i + 1] ? t[i + 1].quantityStart - 1 : null));
    }
  });

  it("series SKUs carry tiers below the first series break only (decision D2)", () => {
    for (const p of fx.products.filter((x) => x.demo.series)) {
      const r = stage("product").find((x) => x.key === p.productNumber);
      expect(r.payload.prices.map((x) => x.quantityStart)).toEqual([1, 5]);
    }
  });

  it("builds one all-units promotion per series tier, dealer-only, with mutual exclusions (decision D1)", () => {
    const promos = stage("promotion");
    expect(promos).toHaveLength(fx.series.reduce((n, s) => n + s.tiers.length, 0));
    for (const pr of promos) {
      expect(pr.payload.useSetGroups).toBe(false);
      expect(pr.payload.personaRules).toEqual([{ id: model.ids.ruleDealer }]);
      expect(pr.payload.cartRules).toHaveLength(1);
      expect(pr.payload.discounts[0]).toMatchObject({ scope: "cart", type: "percentage", considerAdvancedRules: true });
      expect(pr.payload.exclusionIds.length).toBeGreaterThan(0);
      expect(pr.payload.exclusionIds).not.toContain(pr.id);
    }
  });

  it("marks every owned record with the fixture marker where the entity has custom fields", () => {
    for (const e of ["product", "category", "product_manufacturer", "rule", "promotion", "customer", "customer_group", "tax"]) {
      for (const r of stage(e)) expect(r.payload.customFields?.[MARKER_FIELD]).toBe(fx.source.name);
    }
  });

  it("maps B2B features, the approval condition and the shopping list from the fixture", () => {
    const feats = stage("customer_specific_features")[0].payload.features;
    expect(feats).toEqual({ EMPLOYEE_MANAGEMENT: true, ORDER_APPROVAL: true, QUICK_ORDER: true, SHOPPING_LISTS: true });
    expect(approvalConditions({ type: "cartAmountGte", value: 0.01 })).toEqual([{ type: "cartCartAmount", value: { operator: ">=", amount: 0.01 } }]);
    const list = stage("b2b_components_shopping_list")[0];
    expect(list.payload.name).toBe("Weekly Shop Restock");
    expect(list.payload.lineItems).toHaveLength(6);
    expect(list.payload.employeeId).toBe(stableId("b2b_employee", "junior-buyer"));
  });

  it("never puts a password into a payload (passwords are injected by apply from env)", () => {
    expect(JSON.stringify(model)).not.toMatch(/"password"/);
  });

  it("lists owned IDs once, in reverse dependency order, excluding the sales channel", () => {
    const owned = ownedIds(model);
    const all = owned.flatMap((o) => o.ids.map((id) => `${o.entity}:${id}`));
    expect(new Set(all).size).toBe(all.length);
    const entities = owned.map((o) => o.entity);
    expect(entities).not.toContain("sales_channel");
    expect(entities.indexOf("b2b_components_shopping_list")).toBeLessThan(entities.indexOf("product"));
    expect(entities.indexOf("product")).toBeLessThan(entities.indexOf("tax"));
    // employee account before employee (deleting the primary membership directly is refused)
    expect(entities.indexOf("b2b_employee_account")).toBeLessThan(entities.indexOf("b2b_employee"));
  });

  it("deletes the dealer rule only after the products whose prices reference it (--replace-demo)", () => {
    const owned = ownedIds(model, { forDelete: true });
    const dealerAt = owned.findIndex((o) => o.entity === "rule" && o.ids.includes(model.ids.ruleDealer));
    expect(dealerAt).toBeGreaterThan(owned.findIndex((o) => o.entity === "product"));
    expect(dealerAt).toBeGreaterThan(owned.findIndex((o) => o.entity === "promotion"));
  });

  it("creates product streams before products (product.streamIds is computed on product write)", () => {
    const at = (entity) => model.stages.findIndex((st) => st.entity === entity);
    expect(at("product_stream")).toBeLessThan(at("product"));
    expect(at("product")).toBeLessThan(at("promotion"));
  });

  it("keeps the navigation root category on --replace-demo but deletes its children", () => {
    const cats = ownedIds(model, { forDelete: true }).filter((o) => o.entity === "category").flatMap((o) => o.ids);
    expect(cats).not.toContain(model.ids.rootCategory);
    expect(cats).toHaveLength(fx.categories.length);
  });
});
