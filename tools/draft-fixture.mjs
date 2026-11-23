#!/usr/bin/env node
// One-time DRAFTING aid for the curated synthetic fixture (DEV_GUIDE §7.1).
//
// Vertical: performance / circle-track racing shocks for classic GM, Ford and Mercury chassis.
// The product MIX mirrors the prospect's racing-shocks category (stock-mount and heim-mount shocks
// sold as front/rear SKUs, shock series levels, coil-over kits, mounts, shock ends, rebuild parts,
// shop supplies). Nothing is copied: all brands, product names, numbers, prices, people and
// companies are fictional. Vehicle makes/models are real OEMs; fitment is SYNTHETIC.
//
// The generated JSON files under data/fixture/ are the source of truth once reviewed. Hand edits
// there must not be clobbered, so this script refuses to overwrite them unless --force is passed.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "data/fixture");
const force = process.argv.includes("--force");

const PROVENANCE = { extractionSource: "synthetic-fixture", priceConfidence: "generated" };

// ---------------------------------------------------------------------------
// Vehicles: race-car chassis applications (real OEM makes/models, year ranges)
// ---------------------------------------------------------------------------
const vehicleRows = [
  // [makeCode, make, modelCode, model, yearFrom, yearTo, chassisNote]
  ["CHE", "Chevrolet", "CAMARO", "Camaro", 1970, 1981, "GM F-body"],
  ["CHE", "Chevrolet", "CHEVELLE", "Chevelle", 1964, 1972, "GM A-body"],
  ["CHE", "Chevrolet", "MALIBU", "Malibu", 1978, 1983, "GM Metric (A/G-body)"],
  ["CHE", "Chevrolet", "MONTECARLO", "Monte Carlo", 1977, 1986, "GM Metric (A/G-body)"],
  ["CHE", "Chevrolet", "NOVA", "Nova", 1975, 1979, "GM X-body"],
  ["OLD", "Oldsmobile", "CUTLASS", "Cutlass", 1977, 1986, "GM Metric (A/G-body)"],
  ["PON", "Pontiac", "GRANDPRIX", "Grand Prix", 1977, 1986, "GM Metric (A/G-body)"],
  ["PON", "Pontiac", "GTO", "GTO", 1964, 1972, "GM A-body"],
  ["PON", "Pontiac", "TEMPEST", "Tempest", 1964, 1970, "GM A-body"],
  ["BUI", "Buick", "REGAL", "Regal", 1977, 1986, "GM Metric (A/G-body)"],
  ["FOR", "Ford", "MUSTANG", "Mustang", 1979, 1993, "Ford Fox-body"],
  ["FOR", "Ford", "MUSTANGII", "Mustang II", 1974, 1978, "Ford Mustang II"],
  ["FOR", "Ford", "TBIRD", "Thunderbird", 1977, 1979, "Ford/Mercury mid-size"],
  ["MER", "Mercury", "COUGAR", "Cougar", 1977, 1979, "Ford/Mercury mid-size"],
  ["MER", "Mercury", "MONTEGO", "Montego", 1972, 1976, "Ford/Mercury mid-size"],
];
const vehicles = vehicleRows.map(([mk, make, code, model, yearFrom, yearTo]) => ({
  key: `${mk}-${code}-${yearFrom}-${yearTo}`,
  make,
  model,
  yearFrom,
  yearTo,
  type: "Car",
  ...PROVENANCE,
}));
const V = Object.fromEntries(vehicleRows.map(([mk, , code, , a, b]) => [code, `${mk}-${code}-${a}-${b}`]));

// Chassis groups (how racers shop: "GM Metric", "A-body", ...)
const GM_METRIC = [V.MALIBU, V.MONTECARLO, V.CUTLASS, V.GRANDPRIX, V.REGAL];
const GM_A = [V.CHEVELLE, V.GTO, V.TEMPEST];
const GM_F_X = [V.CAMARO, V.NOVA];
const FOX = [V.MUSTANG];
const M2 = [V.MUSTANGII];
const FORD_MID = [V.TBIRD, V.COUGAR, V.MONTEGO];

// ---------------------------------------------------------------------------
// Fictional brands
// ---------------------------------------------------------------------------
const brandRows = {
  VRD: "Velocity Ride Dynamics",
  KST: "Kestrel Race Products",
  HLV: "Halvard Machine Works",
  IRV: "Ironvale Chassis",
  CPL: "Cinderpeak Racing Fluids",
  TGT: "Tallgrass Pit Tools",
  BCE: "Bluecairn Spring Co.",
  STP: "Stoneridge Track Supply",
};
const brands = Object.entries(brandRows).map(([code, name]) => ({ code, name, fictional: true, ...PROVENANCE }));

// ---------------------------------------------------------------------------
// Categories (mirrors a racing-shocks department)
// ---------------------------------------------------------------------------
const L = {
  stock: ["Shocks", "Stock Mount Shocks"],
  heim: ["Shocks", "Heim Mount Shocks"],
  packages: ["Shocks", "Shock Packages"],
  coilover: ["Coil-Overs", "Coil-Over Kits"],
  ends: ["Coil-Overs", "Shock Ends & Extensions"],
  mounts: ["Shock Mounts"],
  rebuild: ["Rebuild Components"],
  supplies: ["Shop Supplies"],
};
const categoryPaths = [["Shocks"], L.stock, L.heim, L.packages, ["Coil-Overs"], L.coilover, L.ends, L.mounts, L.rebuild, L.supplies];
const categoryDescriptions = {
  Shocks: "Stock-mount and heim-mount racing shocks for circle track and street/strip. Front and rear are sold separately.",
  "Shocks > Shock Packages": "Matched four-shock packages per chassis.",
  "Rebuild Components": "Pistons, seals and service parts for shock rebuilds. Universal.",
  "Shop Supplies": "Universal pit and shop supplies. No vehicle fitment required.",
};
const categories = categoryPaths.map((p) => ({
  path: p,
  ...(categoryDescriptions[p.join(" > ")] ? { description: categoryDescriptions[p.join(" > ")] } : {}),
  ...PROVENANCE,
}));
const mediaFor = {
  stock: "media/stock-mount-shock.png",
  heim: "media/heim-mount-shock.png",
  packages: "media/shock-package.png",
  coilover: "media/coil-over-kit.png",
  ends: "media/shock-ends.png",
  mounts: "media/shock-mounts.png",
  rebuild: "media/rebuild-components.png",
  supplies: "media/shop-supplies.png",
};

// ---------------------------------------------------------------------------
// Series (cross-SKU tiers, DEV_GUIDE §6.4): shock "series" levels, mixed front/rear and chassis
// ---------------------------------------------------------------------------
const TIER_STEP = 0.95; // each break lowers the dealer unit price ~5% (guide: 4–6%)
const DEALER_RATIO = 0.7; // dealer qty-1 ≈ retail × 0.70
const pct = (x) => Math.round(x * 10000) / 100;
// discountPct = 1 − tierPrice(qty)/tierPrice(5) (guide §6.4), from the unrounded ratios.
const seriesDiscount10 = pct(1 - TIER_STEP); // 5.0
const seriesDiscount25 = pct(1 - TIER_STEP * TIER_STEP); // 9.75
const seriesRows = [
  ["A", "Velocity 70 Series", "Monotube stock-mount dry shocks, front and rear, across GM chassis"],
  ["B", "Kestrel 27 Series", "Twin-tube stock-mount shocks for GM and Ford/Mercury chassis"],
  ["C", "Velocity SL Series", "Heim-mount monotube shocks, 7\" and 9\" stroke"],
  ["D", "Kestrel 5Q Series", "Steel twin-tube heim-mount circle track shocks"],
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
const productRows = [
  // ---- Stock Mount Shocks: Series A (6) ----
  ["VRD-SM-A-1001", "Velocity 70 Series Monotube Dry Shock, Front – GM Metric", "stock", 119.99, { series: "A", fit: GM_METRIC }],
  ["VRD-SM-A-1002", "Velocity 70 Series Monotube Dry Shock, Rear – GM Metric", "stock", 119.99, { series: "A", fit: GM_METRIC }],
  ["VRD-SM-A-1003", "Velocity 70 Series Monotube Dry Shock, Front – GM A-Body", "stock", 124.99, { series: "A", fit: GM_A }],
  ["VRD-SM-A-1004", "Velocity 70 Series Monotube Dry Shock, Rear – GM A-Body", "stock", 124.99, { series: "A", fit: GM_A }],
  ["VRD-SM-A-1005", "Velocity 70 Series Monotube Dry Shock, Front – Camaro/Nova", "stock", 129.99, { series: "A", fit: GM_F_X }],
  ["VRD-SM-A-1006", "Velocity 70 Series Monotube Dry Shock, Rear – Camaro/Nova", "stock", 129.99, { series: "A", fit: GM_F_X }],
  // ---- Stock Mount Shocks: Series B (6) ----
  ["KST-SM-B-2001", "Kestrel 27 Series Twin-Tube Shock, Front – GM Metric", "stock", 99.99, { series: "B", fit: GM_METRIC }],
  ["KST-SM-B-2002", "Kestrel 27 Series Twin-Tube Shock, Rear – GM Metric", "stock", 99.99, { series: "B", fit: GM_METRIC }],
  ["KST-SM-B-2003", "Kestrel 27 Series Twin-Tube Shock, Front – Mustang/Mustang II", "stock", 104.99, { series: "B", fit: [...FOX, ...M2] }],
  ["KST-SM-B-2004", "Kestrel 27 Series Twin-Tube Shock, Rear – Mustang/Mustang II", "stock", 104.99, { series: "B", fit: [...FOX, ...M2] }],
  ["KST-SM-B-2005", "Kestrel 27 Series Twin-Tube Shock, Front – Ford/Mercury Mid-Size", "stock", 104.99, { series: "B", fit: FORD_MID }],
  ["KST-SM-B-2006", "Kestrel 27 Series Twin-Tube Shock, Rear – Ford/Mercury Mid-Size", "stock", 104.99, { series: "B", fit: FORD_MID }],
  // ---- Stock Mount Shocks: other (14) ----
  ["VRD-SM-X-1101", "Velocity Drag Race Shock, Front – Camaro", "stock", 159.99, { map: true, fit: [V.CAMARO] }],
  ["VRD-SM-X-1102", "Velocity Drag Race Shock, Rear – Camaro/Nova", "stock", 159.99, { fit: GM_F_X }],
  ["VRD-SM-X-1103", "Velocity Double-Adjustable Drag Shock, Front – Mustang", "stock", 349.99, { map: true, fit: FOX }],
  ["VRD-SM-X-1104", "Velocity Double-Adjustable Drag Shock, Rear – Mustang", "stock", 349.99, { map: true, fit: FOX }],
  ["VRD-SM-X-1105", "Velocity Steel Stock Mount Dry Shock, Front – Ford/Mercury Mid-Size", "stock", 114.99, { fit: FORD_MID }],
  ["VRD-SM-X-1106", "Velocity Steel Stock Mount Dry Shock, Rear – Ford/Mercury Mid-Size", "stock", 114.99, { fit: FORD_MID }],
  ["VRD-SM-X-1107", "Velocity Steel Stock Mount Dry Shock, Front – Mustang II", "stock", 114.99, { fit: M2 }],
  ["VRD-SM-X-1108", "Velocity Steel Stock Mount Dry Shock, Rear – Mustang II", "stock", 114.99, { fit: M2 }],
  ["KST-SM-X-2101", "Kestrel Street Stock Steel Shock, Front – GM A-Body", "stock", 89.99, { fit: GM_A }],
  ["KST-SM-X-2102", "Kestrel Street Stock Steel Shock, Rear – GM A-Body", "stock", 89.99, { fit: GM_A }],
  ["KST-SM-X-2103", "Kestrel Street Stock Steel Shock, Front – Camaro", "stock", 94.99, { fit: [V.CAMARO] }],
  ["KST-SM-X-2104", "Kestrel Street Stock Steel Shock, Rear – Camaro", "stock", 94.99, { fit: [V.CAMARO] }],
  ["KST-SM-X-2105", "Kestrel Street Stock Steel Shock, Front – Nova", "stock", 94.99, { fit: [V.NOVA] }],
  ["KST-SM-X-2106", "Kestrel Street Stock Steel Shock, Rear – Nova", "stock", 94.99, { fit: [V.NOVA] }],

  // ---- Heim Mount Shocks: Series C (4) ----
  ["VRD-HM-C-3001", "Velocity SL Series Heim Mount Shock, 7\" Stroke, Front", "heim", 189.99, { series: "C", fit: [...GM_METRIC, ...GM_A] }],
  ["VRD-HM-C-3002", "Velocity SL Series Heim Mount Shock, 7\" Stroke, Rear", "heim", 189.99, { series: "C", fit: [...GM_METRIC, ...GM_A] }],
  ["VRD-HM-C-3003", "Velocity SL Series Heim Mount Shock, 9\" Stroke, Front", "heim", 199.99, { series: "C", fit: [...GM_F_X, ...FOX, ...M2] }],
  ["VRD-HM-C-3004", "Velocity SL Series Heim Mount Shock, 9\" Stroke, Rear", "heim", 199.99, { series: "C", fit: [...GM_F_X, ...FOX, ...M2] }],
  // ---- Heim Mount Shocks: Series D (4) ----
  ["KST-HM-D-4001", "Kestrel 5Q Series Steel Twin-Tube Shock, 7\" Stroke, Front", "heim", 139.99, { series: "D", fit: [...GM_METRIC, ...GM_A] }],
  ["KST-HM-D-4002", "Kestrel 5Q Series Steel Twin-Tube Shock, 7\" Stroke, Rear", "heim", 139.99, { series: "D", fit: [...GM_METRIC, ...GM_A] }],
  ["KST-HM-D-4003", "Kestrel 5Q Series Steel Twin-Tube Shock, 9\" Stroke, Front", "heim", 144.99, { series: "D", fit: [...FORD_MID, ...FOX] }],
  ["KST-HM-D-4004", "Kestrel 5Q Series Steel Twin-Tube Shock, 9\" Stroke, Rear", "heim", 144.99, { series: "D", fit: [...FORD_MID, ...FOX] }],
  // ---- Heim Mount Shocks: other (2) ----
  ["VRD-HM-X-3101", "Velocity Single-Adjustable Heim Mount Shock, 7\" Stroke", "heim", 299.99, { map: true, fit: GM_METRIC }],
  ["KST-HM-X-4101", "Kestrel Rebound-Adjustable Heim Mount Shock, 9\" Stroke", "heim", 229.99, { fit: [...GM_F_X, ...FORD_MID] }],

  // ---- Shock Packages (4) ----
  ["VRD-PK-X-1201", "Velocity 70 Series 4-Shock Package – GM Metric", "packages", 449.99, { map: true, fit: GM_METRIC }],
  ["VRD-PK-X-1202", "Velocity SL Series Heim Mount 4-Shock Package – GM A-Body", "packages", 739.99, { map: true, fit: GM_A }],
  ["KST-PK-X-2201", "Kestrel 27 Series 4-Shock Package – Mustang", "packages", 379.99, { fit: FOX }],
  ["KST-PK-X-2202", "Kestrel 27 Series 4-Shock Package – GM A-Body", "packages", 389.99, { fit: GM_A }],

  // ---- Coil-Over Kits (8 fitment + 2 universal) ----
  ["HLV-CO-X-5001", "Front Coil-Over Conversion Kit – GM Metric", "coilover", 262.99, { fit: GM_METRIC }],
  ["HLV-CO-X-5002", "Front Coil-Over Conversion Kit – GM A-Body", "coilover", 262.99, { fit: GM_A }],
  ["HLV-CO-X-5003", "Front Coil-Over Conversion Kit – Camaro/Nova", "coilover", 274.99, { fit: GM_F_X }],
  ["HLV-CO-X-5004", "Rear Coil-Over Conversion Kit – GM Metric", "coilover", 239.99, { fit: GM_METRIC }],
  ["HLV-CO-X-5005", "Rear Coil-Over Conversion Kit – GM A-Body", "coilover", 239.99, { fit: GM_A }],
  ["HLV-CO-X-5006", "Rear Coil-Over Conversion Kit – Camaro", "coilover", 249.99, { fit: [V.CAMARO] }],
  ["HLV-CO-X-5007", "Coil-Over Conversion Kit – Mustang/Mustang II", "coilover", 284.99, { fit: [...FOX, ...M2] }],
  ["HLV-CO-X-5008", "Coil-Over Conversion Kit – Ford/Mercury Mid-Size", "coilover", 279.99, { fit: FORD_MID }],
  ["HLV-CO-X-5101", "Coil-Over Sleeve Kit for 5\" ID Springs", "coilover", 164.95, { tiered: true }],
  ["HLV-CO-X-5102", "Coil-Over Sleeve Kit for 2.5\" ID Springs", "coilover", 99.95, { tiered: true }],

  // ---- Shock Ends & Extensions (3 fitment + 3 universal) ----
  ["HLV-SE-X-5201", "Stud-Top Shock Extension, 1\" – GM Metric Front", "ends", 14.95, { tiered: true, fit: GM_METRIC }],
  ["HLV-SE-X-5202", "Stud-Top Shock Extension, 2\" – GM A-Body Front", "ends", 16.95, { tiered: true, fit: GM_A }],
  ["HLV-SE-X-5203", "Lower Shock Eye Adapter – Mustang II", "ends", 18.95, { fit: M2 }],
  ["HLV-SE-X-5301", "Steel Heim End, 5/8\" Bore", "ends", 24.99, { tiered: true }],
  ["HLV-SE-X-5302", "Stud-Top to Eye Conversion Adapter", "ends", 12.99, { tiered: true }],
  ["HLV-SE-X-5303", "Shock Spacer Kit, 1/2\" Bolt", "ends", 9.99, { tiered: true }],

  // ---- Shock Mounts (9 fitment) ----
  ["IRV-MT-X-6001", "Weld-On Lower Shock Mount, Front – GM Metric", "mounts", 44.99, { tiered: true, fit: GM_METRIC }],
  ["IRV-MT-X-6002", "Upper Shock Mount Plate – GM Metric", "mounts", 39.99, { tiered: true, fit: GM_METRIC }],
  ["IRV-MT-X-6003", "Rear Shock Relocation Bracket – GM A-Body", "mounts", 69.99, { fit: GM_A }],
  ["IRV-MT-X-6004", "Rear Shock Relocation Bracket – GM Metric", "mounts", 69.99, { fit: GM_METRIC }],
  ["IRV-MT-X-6005", "Front Shock Tower Mount – Camaro", "mounts", 54.99, { fit: [V.CAMARO] }],
  ["IRV-MT-X-6006", "Rear Lower Shock Mount – Mustang", "mounts", 59.99, { fit: FOX }],
  ["IRV-MT-X-6007", "Rear Shock Mount Kit – Ford/Mercury Mid-Size", "mounts", 64.99, { fit: FORD_MID }],
  ["IRV-MT-X-6008", "Front Upper Shock Mount – Nova", "mounts", 49.99, { fit: [V.NOVA] }],
  ["IRV-MT-X-6009", "Rear Upper Shock Crossmember – GM Metric", "mounts", 89.99, { fit: GM_METRIC }],

  // ---- Rebuild Components (5 universal) ----
  ["KST-RB-X-7001", "Linear-Digressive Shock Piston", "rebuild", 68.95, { tiered: true }],
  ["KST-RB-X-7002", "Shock Shaft Seal Kit", "rebuild", 14.99, { tiered: true }],
  ["KST-RB-X-7003", "Shock Fill Plug Assembly", "rebuild", 7.49, { tiered: true }],
  ["KST-RB-X-7004", "Valving Shim Assortment", "rebuild", 29.99, { tiered: true }],
  ["KST-RB-X-7005", "Stud-Top Bushing Kit", "rebuild", 5.95, { tiered: true }],

  // ---- Shop Supplies (10 universal) ----
  ["CPL-OL-X-8001", "Racing Shock Oil, 1 qt", "supplies", 14.99, { tiered: true }],
  ["CPL-OL-X-8002", "Racing Shock Oil, 1 gal", "supplies", 48.99, { tiered: true }],
  ["TGT-TL-X-8101", "Coil-Over Spanner Wrench Set", "supplies", 54.99, { tiered: true }],
  ["TGT-TL-X-8102", "Nitrogen Shock Inflation Tool", "supplies", 159.95, {}],
  ["TGT-RK-X-8201", "Aluminum Shock Rack, 12-Shock", "supplies", 184.99, {}],
  ["TGT-RK-X-8202", "Shock Rack Pin Kit", "supplies", 69.99, {}],
  ["BCE-BB-X-8301", "Urethane Shock Bumper, Medium", "supplies", 32.99, { tiered: true }],
  ["BCE-BS-X-8302", "Bump Spring, 400 lb", "supplies", 89.99, { tiered: true }],
  ["STP-CV-X-8401", "Coil-Over Spring Covers, Pair", "supplies", 24.99, { tiered: true }],
  ["STP-GA-X-8501", "Ride Height Gauge", "supplies", 39.99, {}],
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
  return 8 + (h % 113);
}

const describe = {
  stock: "Synthetic demo item. Stock-mount racing shock; front and rear sold separately. Confirm chassis fitment before ordering.",
  heim: "Synthetic demo item. Heim-mount racing shock; confirm stroke and mounting for your chassis.",
  packages: "Synthetic demo item. Matched four-shock package (two front, two rear) for the listed chassis.",
  coilover: "Synthetic demo item. Coil-over conversion hardware; springs sold separately.",
  ends: "Synthetic demo item. Shock end, extension or adapter.",
  mounts: "Synthetic demo item. Weld-on or bolt-in shock mounting hardware for the listed chassis.",
  rebuild: "Synthetic demo item. Shock rebuild component. Universal.",
  supplies: "Synthetic demo item. Universal pit and shop supply; no vehicle fitment required.",
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
const demoAddress = { street: "100 Demo Speedway Rd", zipcode: "00000", city: "Exampleville", countryIso: "US" };
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
    company: "Summit Trail Race Shop (Demo Dealer)",
    passwordEnv: "PERSONA_DEALER_ADMIN_PASSWORD",
    address: { ...demoAddress, street: "200 Demo Pit Row" },
    ...PROVENANCE,
  },
];
const personas = [
  { key: "retail", label: "Retail Racer", customer: "retail-rider" },
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
        { productNumber: "CPL-OL-X-8001", quantity: 12 },
        { productNumber: "KST-RB-X-7002", quantity: 10 },
        { productNumber: "KST-RB-X-7003", quantity: 20 },
        { productNumber: "KST-RB-X-7005", quantity: 20 },
        { productNumber: "HLV-SE-X-5301", quantity: 8 },
        { productNumber: "BCE-BB-X-8301", quantity: 8 },
      ],
    },
  ],
};

const siteProject = {
  $schema: "../../schemas/site-project.demo.schema.json",
  source: {
    type: "synthetic-fixture",
    name: "racing-shocks-b2b-demo",
    description: "Curated synthetic racing-shocks catalog. All brands, products, people and companies are fictional. Fitment is synthetic.",
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
