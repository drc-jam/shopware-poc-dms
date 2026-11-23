#!/usr/bin/env node
// One-time DRAFTING aid for the curated synthetic fixture (DEV_GUIDE §7.1).
//
// The generated JSON files under data/fixture/ are the source of truth once reviewed.
// Hand edits there must not be clobbered, so this script refuses to overwrite existing
// files unless --force is passed. Everything here is fictional: brands, people,
// companies, addresses. Vehicle makes/models are real OEMs, but fitment is SYNTHETIC
// (not real OEM fitment data).

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "data/fixture");
const force = process.argv.includes("--force");

const PROVENANCE = { extractionSource: "synthetic-fixture", priceConfidence: "generated" };

// ---------------------------------------------------------------------------
// Vehicles (~15 models across real OEM makes, with year ranges)
// ---------------------------------------------------------------------------
const vehicleRows = [
  ["HON", "Honda", "TRX420", "FourTrax Rancher 420", 2015, 2024, "ATV"],
  ["HON", "Honda", "FOR520", "FourTrax Foreman 520", 2020, 2025, "ATV"],
  ["HON", "Honda", "PIO1000", "Pioneer 1000", 2016, 2025, "UTV"],
  ["HON", "Honda", "TAL1000", "Talon 1000X", 2019, 2025, "UTV"],
  ["YAM", "Yamaha", "GRIZ700", "Grizzly 700", 2016, 2025, "ATV"],
  ["YAM", "Yamaha", "KOD450", "Kodiak 450", 2018, 2025, "ATV"],
  ["YAM", "Yamaha", "WOLV1000", "Wolverine RMAX2 1000", 2021, 2025, "UTV"],
  ["YAM", "Yamaha", "YXZ1000", "YXZ1000R", 2016, 2025, "UTV"],
  ["POL", "Polaris", "SPT570", "Sportsman 570", 2014, 2025, "ATV"],
  ["POL", "Polaris", "RZRXP1K", "RZR XP 1000", 2014, 2023, "UTV"],
  ["POL", "Polaris", "RGRXP1K", "Ranger XP 1000", 2018, 2025, "UTV"],
  ["CAN", "Can-Am", "OUT570", "Outlander 570", 2016, 2023, "ATV"],
  ["CAN", "Can-Am", "MAVX3", "Maverick X3", 2017, 2025, "UTV"],
  ["CAN", "Can-Am", "DEFHD10", "Defender HD10", 2017, 2025, "UTV"],
  ["KAW", "Kawasaki", "BF750", "Brute Force 750 4x4i", 2012, 2025, "ATV"],
  ["KAW", "Kawasaki", "MULEFXT", "Mule PRO-FXT", 2015, 2025, "UTV"],
];
const vehicles = vehicleRows.map(([mk, make, code, model, yearFrom, yearTo, type]) => ({
  key: `${mk}-${code}-${yearFrom}-${yearTo}`,
  make,
  model,
  yearFrom,
  yearTo,
  type,
  ...PROVENANCE,
}));
const V = Object.fromEntries(vehicleRows.map(([mk, , code, , a, b]) => [code, `${mk}-${code}-${a}-${b}`]));

// ---------------------------------------------------------------------------
// Fictional brands
// ---------------------------------------------------------------------------
const brandRows = {
  STP: "Stoneridge Moto",
  RDG: "Ridgeback Drivetrain",
  IRV: "Ironvale Offroad",
  HLV: "Halvard Filtration",
  KST: "Kestrel Powersports",
  BCE: "Bluecairn Electric",
  TGT: "Tallgrass Tire Co.",
  CPL: "Cinderpeak Lubricants",
};
const brands = Object.entries(brandRows).map(([code, name]) => ({ code, name, fictional: true, ...PROVENANCE }));

// ---------------------------------------------------------------------------
// Categories (DEV_GUIDE §6.7)
// ---------------------------------------------------------------------------
const L = {
  brakes: ["ATV & UTV Parts", "Brakes"],
  drive: ["ATV & UTV Parts", "Drive & Axles"],
  susp: ["ATV & UTV Parts", "Suspension"],
  filters: ["Engine", "Filters"],
  gaskets: ["Engine", "Gaskets & Seals"],
  ignition: ["Engine", "Ignition"],
  batteries: ["Electrical", "Batteries"],
  lighting: ["Electrical", "Lighting"],
  tires: ["Tires & Wheels"],
  supplies: ["Shop Supplies"],
};
const categoryPaths = [
  ["ATV & UTV Parts"], L.brakes, L.drive, L.susp,
  ["Engine"], L.filters, L.gaskets, L.ignition,
  ["Electrical"], L.batteries, L.lighting,
  L.tires,
  L.supplies,
];
const categoryDescriptions = {
  "Shop Supplies": "Universal shop consumables. No vehicle fitment required.",
};
const categories = categoryPaths.map((p) => ({
  path: p,
  ...(categoryDescriptions[p.join(" > ")] ? { description: categoryDescriptions[p.join(" > ")] } : {}),
  ...PROVENANCE,
}));
const mediaFor = {
  brakes: "media/brakes.png", drive: "media/drive-axles.png", susp: "media/suspension.png",
  filters: "media/filters.png", gaskets: "media/gaskets-seals.png", ignition: "media/ignition.png",
  batteries: "media/batteries.png", lighting: "media/lighting.png", tires: "media/tires-wheels.png",
  supplies: "media/shop-supplies.png",
};

// ---------------------------------------------------------------------------
// Series (cross-SKU tiers, DEV_GUIDE §6.4)
// ---------------------------------------------------------------------------
const TIER_STEP = 0.95; // each break lowers the dealer unit price ~5% (guide: 4–6%)
const DEALER_RATIO = 0.7; // dealer qty-1 ≈ retail × 0.70
const pct = (x) => Math.round(x * 10000) / 100;
// discountPct = 1 − tierPrice(qty)/tierPrice(5) (guide §6.4), from the unrounded ratios.
const seriesDiscount10 = pct(1 - TIER_STEP); // 5.0
const seriesDiscount25 = pct(1 - TIER_STEP * TIER_STEP); // 9.75
const seriesRows = [
  ["A", "CV Axle Series A", "Ridgeback heavy-duty CV axles"],
  ["B", "Oil Filter Series B", "Halvard oil filters"],
  ["C", "Brake Pad Series C", "Stoneridge sintered brake pads across models"],
  ["D", "Spark Plug Series D", "Kestrel iridium spark plugs"],
];
const series = seriesRows.map(([code, label, description]) => ({
  code,
  label,
  description,
  tiers: [
    { minQty: 10, discountPct: seriesDiscount10 },
    { minQty: 25, discountPct: seriesDiscount25 },
  ],
  ...PROVENANCE,
}));

// ---------------------------------------------------------------------------
// Products: [productNumber, name, category, retailGross, { fit, series, tiered, map }]
// ---------------------------------------------------------------------------
const HON_YAM_ATV = [V.TRX420, V.FOR520, V.GRIZ700, V.KOD450];
const ALL_ATV = [V.TRX420, V.FOR520, V.GRIZ700, V.KOD450, V.SPT570, V.OUT570, V.BF750];

const productRows = [
  // Brakes — Series C (6)
  ["STP-BP-C-0142", "Sintered Front Brake Pads – Honda/Yamaha", "brakes", 54.99, { series: "C", fit: [V.TRX420, V.GRIZ700, V.WOLV1000, V.YXZ1000] }],
  ["STP-BP-C-0143", "Sintered Rear Brake Pads – Honda/Yamaha", "brakes", 49.99, { series: "C", fit: [V.TRX420, V.GRIZ700, V.KOD450] }],
  ["STP-BP-C-0210", "Sintered Front Brake Pads – Polaris", "brakes", 57.99, { series: "C", fit: [V.SPT570, V.RZRXP1K, V.RGRXP1K] }],
  ["STP-BP-C-0211", "Sintered Rear Brake Pads – Polaris", "brakes", 52.99, { series: "C", fit: [V.SPT570, V.RZRXP1K, V.RGRXP1K] }],
  ["STP-BP-C-0315", "Sintered Front Brake Pads – Can-Am", "brakes", 59.99, { series: "C", fit: [V.OUT570, V.MAVX3, V.DEFHD10] }],
  ["STP-BP-C-0420", "Sintered Front Brake Pads – Kawasaki/Honda", "brakes", 55.99, { series: "C", fit: [V.BF750, V.MULEFXT, V.PIO1000, V.TAL1000, V.FOR520] }],
  // Brakes — other (4)
  ["STP-BR-X-0501", "Front Brake Rotor, Sport UTV", "brakes", 89.99, { fit: [V.RZRXP1K, V.MAVX3, V.TAL1000] }],
  ["STP-BR-X-0502", "Front Brake Rotor, Utility ATV", "brakes", 79.99, { fit: [V.GRIZ700, V.KOD450, V.SPT570] }],
  ["STP-CK-X-0610", "Brake Caliper Rebuild Kit", "brakes", 34.99, { tiered: true, fit: [V.BF750, V.OUT570, V.TRX420, V.FOR520] }],
  ["STP-BL-X-0720", "Stainless Braided Brake Line Kit", "brakes", 129.99, { fit: [V.RZRXP1K, V.YXZ1000, V.DEFHD10] }],

  // Drive & Axles — Series A (4)
  ["RDG-CV-A-1101", "Heavy-Duty Front CV Axle – Honda", "drive", 159.99, { series: "A", fit: [V.TRX420, V.FOR520, V.PIO1000] }],
  ["RDG-CV-A-1102", "Heavy-Duty Front CV Axle – Polaris", "drive", 169.99, { series: "A", fit: [V.SPT570, V.RGRXP1K] }],
  ["RDG-CV-A-1103", "Heavy-Duty Rear CV Axle – Polaris RZR", "drive", 189.99, { series: "A", fit: [V.RZRXP1K] }],
  ["RDG-CV-A-1104", "Heavy-Duty Front CV Axle – Can-Am/Kawasaki", "drive", 174.99, { series: "A", fit: [V.OUT570, V.DEFHD10, V.BF750] }],
  // Drive & Axles — other (4)
  ["RDG-WB-X-1201", "Front Wheel Bearing & Seal Kit", "drive", 39.99, { tiered: true, fit: [V.TRX420, V.GRIZ700, V.KOD450, V.SPT570] }],
  ["RDG-WB-X-1202", "Rear Wheel Bearing & Seal Kit", "drive", 44.99, { tiered: true, fit: [V.MAVX3, V.YXZ1000, V.WOLV1000] }],
  ["RDG-DB-X-1301", "Performance CVT Drive Belt – Polaris", "drive", 119.99, { fit: [V.RZRXP1K, V.RGRXP1K, V.SPT570] }],
  ["RDG-DB-X-1302", "Performance CVT Drive Belt – Can-Am", "drive", 129.99, { fit: [V.MAVX3, V.DEFHD10, V.OUT570] }],

  // Suspension (7)
  ["IRV-SH-X-2101", "Adjustable Front Shock Pair", "susp", 549.99, { map: true, fit: [V.RZRXP1K, V.TAL1000, V.YXZ1000] }],
  ["IRV-SH-X-2102", "Gas-Charged Rear Shock", "susp", 249.99, { fit: [V.GRIZ700, V.KOD450, V.BF750] }],
  ["IRV-AB-X-2201", "A-Arm Bushing Kit – Polaris/Can-Am", "susp", 59.99, { fit: [V.SPT570, V.RGRXP1K, V.OUT570] }],
  ["IRV-AB-X-2202", "A-Arm Bushing Kit – Honda/Yamaha", "susp", 54.99, { fit: [V.TRX420, V.FOR520, V.PIO1000, V.WOLV1000] }],
  ["IRV-TR-X-2301", "Heavy-Duty Tie Rod End Kit, Sport UTV", "susp", 69.99, { tiered: true, fit: [V.RZRXP1K, V.MAVX3, V.TAL1000] }],
  ["IRV-TR-X-2302", "Tie Rod End Kit, Utility", "susp", 49.99, { tiered: true, fit: [V.GRIZ700, V.BF750, V.MULEFXT] }],
  ["IRV-BJ-X-2401", "Upper Ball Joint", "susp", 32.99, { fit: [V.DEFHD10, V.RGRXP1K, V.PIO1000] }],

  // Filters — Series B (5)
  ["HLV-OF-B-3101", "Oil Filter – Honda", "filters", 11.99, { series: "B", fit: [V.TRX420, V.FOR520, V.PIO1000, V.TAL1000] }],
  ["HLV-OF-B-3102", "Oil Filter – Yamaha", "filters", 12.49, { series: "B", fit: [V.GRIZ700, V.KOD450, V.WOLV1000, V.YXZ1000] }],
  ["HLV-OF-B-3103", "Oil Filter – Polaris", "filters", 13.99, { series: "B", fit: [V.SPT570, V.RZRXP1K, V.RGRXP1K] }],
  ["HLV-OF-B-3104", "Oil Filter – Can-Am", "filters", 14.49, { series: "B", fit: [V.OUT570, V.MAVX3, V.DEFHD10] }],
  ["HLV-OF-B-3105", "Oil Filter – Kawasaki", "filters", 12.99, { series: "B", fit: [V.BF750, V.MULEFXT] }],
  // Filters — air (3)
  ["HLV-AF-X-3201", "High-Flow Air Filter – Polaris", "filters", 34.99, { tiered: true, fit: [V.RZRXP1K, V.RGRXP1K, V.SPT570] }],
  ["HLV-AF-X-3202", "Dual-Stage Foam Air Filter", "filters", 24.99, { tiered: true, fit: [V.TRX420, V.GRIZ700, V.BF750, V.KOD450] }],
  ["HLV-AF-X-3203", "High-Flow Air Filter – Sport UTV", "filters", 39.99, { tiered: true, fit: [V.MAVX3, V.YXZ1000, V.TAL1000] }],

  // Gaskets & Seals (6)
  ["KST-GK-X-4101", "Top End Gasket Kit – Honda", "gaskets", 44.99, { tiered: true, fit: [V.TRX420, V.FOR520] }],
  ["KST-GK-X-4102", "Top End Gasket Kit – Yamaha", "gaskets", 49.99, { tiered: true, fit: [V.GRIZ700, V.KOD450] }],
  ["KST-GK-X-4201", "Complete Engine Gasket Kit – Polaris", "gaskets", 129.99, { fit: [V.SPT570, V.RGRXP1K] }],
  ["KST-SK-X-4301", "Front Differential Seal Kit", "gaskets", 29.99, { fit: [V.RZRXP1K, V.MAVX3, V.DEFHD10] }],
  ["KST-SK-X-4302", "Water Pump Rebuild Kit", "gaskets", 59.99, { fit: [V.BF750, V.MULEFXT, V.OUT570] }],
  ["KST-SK-X-4303", "Valve Cover Gasket", "gaskets", 18.99, { fit: [V.PIO1000, V.TAL1000, V.WOLV1000, V.YXZ1000] }],

  // Ignition — Series D (4)
  ["KST-SP-D-5101", "Iridium Spark Plug – Honda/Yamaha ATV", "ignition", 12.99, { series: "D", fit: [V.TRX420, V.FOR520, V.PIO1000, V.TAL1000, V.GRIZ700, V.KOD450] }],
  ["KST-SP-D-5102", "Iridium Spark Plug – Polaris", "ignition", 13.49, { series: "D", fit: [V.SPT570, V.RZRXP1K, V.RGRXP1K] }],
  ["KST-SP-D-5103", "Iridium Spark Plug – Can-Am", "ignition", 13.99, { series: "D", fit: [V.OUT570, V.MAVX3, V.DEFHD10] }],
  ["KST-SP-D-5104", "Iridium Spark Plug – Kawasaki/Yamaha UTV", "ignition", 12.49, { series: "D", fit: [V.BF750, V.MULEFXT, V.WOLV1000, V.YXZ1000] }],
  // Ignition — other (2)
  ["KST-IC-X-5201", "Ignition Coil – Polaris", "ignition", 89.99, { fit: [V.SPT570, V.RGRXP1K] }],
  ["KST-IC-X-5202", "Ignition Coil – Yamaha/Kawasaki", "ignition", 94.99, { fit: [V.GRIZ700, V.KOD450, V.BF750] }],

  // Batteries (5 fitment-specific)
  ["BCE-BT-X-6101", "AGM Battery, 12V 12Ah", "batteries", 119.99, { map: true, fit: HON_YAM_ATV }],
  ["BCE-BT-X-6102", "AGM Battery, 12V 14Ah", "batteries", 139.99, { fit: [V.SPT570, V.OUT570, V.BF750] }],
  ["BCE-BT-X-6103", "AGM Battery, 12V 18Ah", "batteries", 169.99, { fit: [V.RZRXP1K, V.RGRXP1K, V.PIO1000] }],
  ["BCE-BT-X-6104", "AGM Battery, 12V 20Ah", "batteries", 179.99, { fit: [V.MAVX3, V.DEFHD10, V.TAL1000] }],
  ["BCE-BT-X-6105", "AGM Battery, 12V 14Ah Sport", "batteries", 144.99, { fit: [V.WOLV1000, V.YXZ1000, V.MULEFXT] }],

  // Lighting (4 fitment-specific)
  ["BCE-HL-X-6201", "LED Headlight Upgrade Kit – Polaris", "lighting", 189.99, { map: true, fit: [V.RZRXP1K, V.RGRXP1K] }],
  ["BCE-HL-X-6202", "LED Headlight Upgrade Kit – Can-Am", "lighting", 179.99, { fit: [V.MAVX3, V.DEFHD10] }],
  ["BCE-HL-X-6203", "LED Headlight Upgrade Kit – Honda/Yamaha UTV", "lighting", 169.99, { fit: [V.TAL1000, V.PIO1000, V.WOLV1000, V.YXZ1000] }],
  ["BCE-TL-X-6301", "LED Tail Light Assembly", "lighting", 74.99, { fit: [V.GRIZ700, V.KOD450, V.TRX420, V.FOR520, V.SPT570] }],

  // Tires & Wheels (6 fitment-specific)
  ["TGT-TR-X-7101", "All-Terrain Tire 26x9-12", "tires", 129.99, { map: true, fit: ALL_ATV }],
  ["TGT-TR-X-7102", "All-Terrain Tire 26x11-12", "tires", 139.99, { fit: ALL_ATV }],
  ["TGT-TR-X-7201", "Mud Tire 30x10-14", "tires", 219.99, { map: true, fit: [V.RZRXP1K, V.MAVX3, V.TAL1000, V.YXZ1000] }],
  ["TGT-TR-X-7202", "Mud Tire 28x10-14", "tires", 199.99, { fit: [V.RGRXP1K, V.DEFHD10, V.PIO1000, V.WOLV1000, V.MULEFXT] }],
  ["TGT-WH-X-7301", "Cast Aluminum Wheel 14x7, 4/156", "tires", 159.99, { fit: [V.RZRXP1K, V.RGRXP1K, V.SPT570] }],
  ["TGT-WH-X-7302", "Cast Aluminum Wheel 14x7, 4/137", "tires", 159.99, { fit: [V.MAVX3, V.DEFHD10, V.OUT570] }],

  // ---- Universal (20) ----
  ["CPL-OL-X-8101", "Synthetic 10W-40 Engine Oil, 4 qt", "supplies", 44.99, { tiered: true }],
  ["CPL-OL-X-8102", "Synthetic 75W-90 Gear Oil, 1 qt", "supplies", 16.99, { tiered: true }],
  ["CPL-GR-X-8201", "Waterproof Marine Grease, 14 oz", "supplies", 9.99, { tiered: true }],
  ["CPL-CL-X-8301", "Brake Parts Cleaner, 14 oz", "supplies", 7.49, { tiered: true }],
  ["CPL-CL-X-8302", "Electrical Contact Cleaner, 11 oz", "supplies", 8.99, { tiered: true }],
  ["CPL-CT-X-8401", "Extended-Life Coolant, 1 gal", "supplies", 24.99, { tiered: true }],
  ["CPL-FS-X-8501", "Fuel Stabilizer, 8 oz", "supplies", 11.99, { tiered: true }],
  ["CPL-TL-X-8601", "Medium-Strength Thread Locker, 10 ml", "supplies", 6.99, { tiered: true }],
  ["CPL-DG-X-8602", "Dielectric Grease, 3 oz", "supplies", 5.99, { tiered: true }],
  ["IRV-TD-X-8701", "Ratchet Tie-Down Straps, 4-pack", "supplies", 39.99, { tiered: true }],
  ["CPL-ZT-X-8801", "Heavy-Duty Zip Ties, 100-pack", "supplies", 12.99, {}],
  ["CPL-GL-X-8802", "Nitrile Shop Gloves, box of 100", "supplies", 17.99, {}],
  ["CPL-TW-X-8803", "Shop Towels, 200-count roll", "supplies", 14.99, {}],
  ["CPL-AC-X-8804", "Air Filter Oil & Cleaner Kit", "supplies", 19.99, {}],
  ["BCE-BC-X-8901", "Smart Battery Maintainer, 12V", "batteries", 64.99, {}],
  ["BCE-LB-X-9101", "30\" Dual-Row LED Light Bar", "lighting", 249.99, { map: true }],
  ["BCE-LP-X-9102", "LED Pod Light Pair, 3\"", "lighting", 89.99, {}],
  ["BCE-WH-X-9103", "Light Bar Wiring Harness with Switch", "lighting", 34.99, {}],
  ["TGT-RK-X-9201", "Tubeless Tire Plug Repair Kit", "tires", 24.99, { tiered: true }],
  ["TGT-VS-X-9202", "Rubber Valve Stem Kit, 4-pack", "tires", 9.99, { tiered: true }],
];

// Round to a cents value ending in 9 (e.g. 38.493 → 38.49).
const end9 = (v) => Math.round((Math.round(v * 10) / 10 - 0.01) * 100) / 100;

function dealerTiers(retail, tiered) {
  const d1 = retail * DEALER_RATIO;
  if (!tiered) return [{ minQty: 1, gross: end9(d1) }];
  const d5 = d1 * TIER_STEP;
  const d10 = d5 * TIER_STEP;
  const d25 = d10 * TIER_STEP;
  return [
    { minQty: 1, gross: end9(d1) },
    { minQty: 5, gross: end9(d5) },
    { minQty: 10, gross: end9(d10) },
    { minQty: 25, gross: end9(d25) },
  ];
}

// Deterministic pseudo-random stock (no Math.random so re-drafts are stable).
function stockFor(sku) {
  let h = 2166136261;
  for (const ch of sku) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return 20 + (h % 281);
}

const describe = {
  brakes: "Synthetic demo item. Brake component for listed models; confirm fitment before ordering.",
  drive: "Synthetic demo item. Drivetrain component built for trail and work use.",
  susp: "Synthetic demo item. Suspension component for listed models.",
  filters: "Synthetic demo item. Filtration component; replace at each service interval.",
  gaskets: "Synthetic demo item. Gasket/seal kit for listed engines.",
  ignition: "Synthetic demo item. Ignition component for listed models.",
  batteries: "Synthetic demo item. Maintenance-free electrical component.",
  lighting: "Synthetic demo item. Lighting component; off-road use only.",
  tires: "Synthetic demo item. Tire, wheel or tire-service item.",
  supplies: "Synthetic demo item. Universal shop supply; no vehicle fitment required.",
};

const products = productRows.map(([productNumber, name, cat, retail, o]) => {
  const brandCode = productNumber.slice(0, 3);
  const tiered = Boolean(o.tiered || o.series);
  return {
    productNumber,
    name,
    brand: brandRows[brandCode],
    categoryPath: L[cat],
    description: describe[cat],
    price: { gross: retail },
    stock: stockFor(productNumber),
    media: [mediaFor[cat]],
    demo: {
      ...(o.series ? { series: o.series } : {}),
      mapPolicy: o.map ? "hide_until_cart" : "none",
      dealerTiers: dealerTiers(retail, tiered),
      fitment: o.fit ?? [],
    },
    ...PROVENANCE,
  };
});

// ---------------------------------------------------------------------------
// Customers, personas, B2B (all fictional; passwords come from env, never here)
// ---------------------------------------------------------------------------
const demoAddress = {
  street: "100 Demo Trail Rd",
  zipcode: "00000",
  city: "Exampleville",
  countryIso: "US",
  // A placeholder: the seeder resolves countryState from discovery if one is required.
};
const customers = [
  {
    key: "retail-rider",
    salutation: "not_specified",
    firstName: "Jordan",
    lastName: "Avery",
    email: "retail.rider@example.com",
    customerGroup: "Retail",
    passwordEnv: "PERSONA_RETAIL_PASSWORD",
    address: demoAddress,
    ...PROVENANCE,
  },
  {
    key: "dealer-admin",
    salutation: "not_specified",
    firstName: "Morgan",
    lastName: "Ellis",
    email: "dealer.admin@example.com",
    customerGroup: "Dealer",
    company: "Summit Trail Powersports (Demo Dealer)",
    passwordEnv: "PERSONA_DEALER_ADMIN_PASSWORD",
    address: { ...demoAddress, street: "200 Demo Dealer Pkwy" },
    ...PROVENANCE,
  },
];
const personas = [
  { key: "retail", label: "Retail Rider", customer: "retail-rider" },
  { key: "dealer-admin", label: "Dealer Admin", customer: "dealer-admin" },
  { key: "dealer-junior", label: "Dealer Junior Buyer", employee: "junior-buyer" },
];
const b2b = {
  company: { ownerCustomer: "dealer-admin", features: ["employee_management", "order_approval", "quick_order", "shopping_list"] },
  roles: [
    { key: "admin", name: "Admin", permissions: ["*"] },
    {
      key: "junior-buyer",
      name: "Junior Buyer",
      // Permission codes are resolved against discovery (seed:discover) before apply.
      // These are intents, not hard-coded B2B permission keys.
      permissionIntents: ["view_products", "cart", "quick_order", "shopping_lists", "request_approval"],
    },
  ],
  employees: [
    {
      key: "junior-buyer",
      firstName: "Casey",
      lastName: "Brooks",
      email: "junior.buyer@example.com",
      role: "junior-buyer",
      active: true,
      passwordEnv: "PERSONA_DEALER_JUNIOR_PASSWORD",
      ...PROVENANCE,
    },
  ],
  approvalRules: [
    {
      key: "junior-buyer-always",
      name: "DEMO · Junior Buyer approval",
      affectedRole: "junior-buyer",
      reviewerRole: "admin",
      condition: { type: "cartAmountGte", value: 0.01 },
    },
  ],
  shoppingLists: [
    {
      key: "weekly-shop-restock",
      name: "Weekly Shop Restock",
      owner: "junior-buyer",
      items: [
        { productNumber: "HLV-OF-B-3101", quantity: 10 },
        { productNumber: "KST-SP-D-5101", quantity: 8 },
        { productNumber: "CPL-OL-X-8101", quantity: 6 },
        { productNumber: "CPL-CL-X-8301", quantity: 12 },
        { productNumber: "CPL-GL-X-8802", quantity: 2 },
        { productNumber: "CPL-TW-X-8803", quantity: 4 },
      ],
    },
  ],
};

const siteProject = {
  $schema: "../../schemas/site-project.demo.schema.json",
  source: {
    type: "synthetic-fixture",
    name: "powersports-b2b-demo",
    description: "Curated synthetic powersports catalog. All brands, people and companies are fictional. Fitment is synthetic.",
    ...PROVENANCE,
  },
  currency: "USD",
  brands,
  categories,
  series,
  personas,
  products,
  customers,
  b2b,
};
const vehiclesDoc = { $schema: "../../schemas/vehicles.demo.schema.json", vehicles };

mkdirSync(OUT_DIR, { recursive: true });
for (const [file, doc] of [["site-project.json", siteProject], ["vehicles.json", vehiclesDoc]]) {
  const target = path.join(OUT_DIR, file);
  if (existsSync(target) && !force) {
    console.error(`refusing to overwrite ${path.relative(ROOT, target)} (reviewed source of truth); pass --force`);
    process.exitCode = 1;
    continue;
  }
  writeFileSync(target, JSON.stringify(doc, null, 2) + "\n");
  console.log(`wrote ${path.relative(ROOT, target)}`);
}
