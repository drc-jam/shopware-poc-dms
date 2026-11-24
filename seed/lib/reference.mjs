// Resolves the instance reference data the model needs (DEV_GUIDE §6.1). Read-only.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, salesChannelIdFromEnv, storeEnv } from "./env.mjs";

export async function resolveReference(admin, fx) {
  const notes = [];
  // Sales channel: explicit env id, else the one the Store API access key belongs to.
  let scId = salesChannelIdFromEnv();
  const byKey = (await admin.search("sales_channel", { filter: [{ type: "equals", field: "accessKey", value: storeEnv().accessKey }], associations: { paymentMethods: {}, shippingMethods: {}, currencies: {}, countries: {} } })).data?.[0];
  if (!byKey) throw new Error("no sales channel matches SHOPWARE_SW_ACCESS_KEY");
  if (scId && scId !== byKey.id) throw new Error(`SHOPWARE_SALES_CHANNEL_ID (${scId}) does not match the access key's sales channel (${byKey.id})`);
  if (!scId) notes.push(`SHOPWARE_SALES_CHANNEL_ID unset; using the access key's sales channel ${byKey.id}`);
  scId = byKey.id;
  const sc = byKey;

  const currencies = await admin.searchAll("currency", {}, 100);
  const usd = currencies.find((c) => c.isoCode === fx.currency);
  const sys = currencies.find((c) => c.isSystemDefault) ?? currencies.find((c) => c.factor === 1);
  if (!usd) throw new Error(`currency ${fx.currency} missing on the instance`);
  if (!(sc.currencies ?? []).some((c) => c.id === usd.id)) throw new Error(`currency ${fx.currency} is not assigned to the sales channel`);

  const isoNeeded = [...new Set(fx.customers.map((c) => c.address.countryIso))];
  const countries = (await admin.search("country", { filter: [{ type: "equalsAny", field: "iso", value: isoNeeded }] })).data;
  const countryIds = Object.fromEntries(countries.map((c) => [c.iso, c.id]));
  for (const iso of isoNeeded) if (!countryIds[iso]) throw new Error(`country ${iso} missing`);

  const salutations = await admin.searchAll("salutation", {}, 100);
  const salutationIds = Object.fromEntries(salutations.map((s) => [s.salutationKey, s.id]));

  const invoice = (sc.paymentMethods ?? []).find((p) => p.active && /invoice/i.test(`${p.technicalName} ${p.handlerIdentifier}`));
  if (!invoice) throw new Error("no active Invoice payment method assigned to the sales channel (§13)");
  const shipping = (sc.shippingMethods ?? []).filter((s) => s.active);
  if (!shipping.length) throw new Error("no active shipping method assigned to the sales channel (§13)");

  const folder = (await admin.search("media_folder", { filter: [{ type: "equals", field: "defaultFolder.entity", value: "product" }] })).data?.[0];
  if (!folder) notes.push("no default product media folder; media is created without a folder");

  // Page size: the instance declared MAX_LIMIT in discovery; stay well under it.
  const discPath = path.join(ROOT, "artifacts/discovery.json");
  const pageSize = existsSync(discPath) ? (JSON.parse(readFileSync(discPath, "utf8")).apiPageLimit?.seederPageSize ?? 100) : 100;

  return {
    salesChannelId: scId,
    salesChannelName: sc.translated?.name ?? sc.name,
    originalNavigationCategoryId: sc.navigationCategoryId,
    languageId: sc.languageId,
    usdId: usd.id,
    usdFactor: usd.factor,
    systemCurrencyId: sys.id,
    systemCurrencyIso: sys.isoCode,
    countryIds,
    salutationIds,
    invoicePaymentId: invoice.id,
    productMediaFolderId: folder?.id ?? null,
    pageSize,
    notes,
  };
}
