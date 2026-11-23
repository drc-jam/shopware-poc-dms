#!/usr/bin/env node
// Strict fixture validation (DEV_GUIDE §7.3). Exits non-zero on ANY schema or business error,
// so it fails CI (unlike the factory's validate-project.mjs).
//
// Usage: node seed/validate-fixture.mjs [--site path] [--vehicles path] [--json]

import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { checkFixture } from "./lib/fixture-checks.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : fallback;
};
const sitePath = arg("--site", path.join(ROOT, "data/fixture/site-project.json"));
const vehiclesPath = arg("--vehicles", path.join(ROOT, "data/fixture/vehicles.json"));
const asJson = process.argv.includes("--json");

export function loadSchemas() {
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true, multipleOfPrecision: 6 });
  addFormats(ajv);
  const site = JSON.parse(readFileSync(path.join(ROOT, "schemas/site-project.demo.schema.json"), "utf8"));
  const veh = JSON.parse(readFileSync(path.join(ROOT, "schemas/vehicles.demo.schema.json"), "utf8"));
  ajv.addSchema(site);
  ajv.addSchema(veh);
  return { validateSite: ajv.getSchema(site.$id), validateVehicles: ajv.getSchema(veh.$id) };
}

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    console.error(`cannot read ${path.relative(ROOT, p)}: ${e.message}`);
    process.exit(2);
  }
}

const fmt = (errs) => (errs ?? []).map((e) => `${e.instancePath || "/"} ${e.message}${e.params ? " " + JSON.stringify(e.params) : ""}`);

const site = readJson(sitePath);
const vehDoc = readJson(vehiclesPath);
const { validateSite, validateVehicles } = loadSchemas();

const errors = [];
if (!validateVehicles(vehDoc)) errors.push(...fmt(validateVehicles.errors).map((e) => `schema(vehicles.json) ${e}`));
if ("vehicles" in site) errors.push("site-project.json must not contain vehicles; they live in vehicles.json");
const composed = { ...site, vehicles: vehDoc.vehicles };
if (!validateSite(composed)) errors.push(...fmt(validateSite.errors).map((e) => `schema(site-project) ${e}`));

let warnings = [];
let stats = null;
if (errors.length === 0) {
  const r = checkFixture(composed, { fixtureDir: path.dirname(sitePath) });
  errors.push(...r.errors);
  warnings = r.warnings;
  stats = r.stats;
}

if (asJson) {
  console.log(JSON.stringify({ ok: errors.length === 0, errors, warnings, stats }, null, 2));
} else {
  if (stats) {
    console.log(
      `fixture: ${stats.products} products (${stats.fitmentSpecific} fitment, ${stats.universal} universal), ` +
        `${stats.tiered} tiered, ${stats.map} MAP, series ${JSON.stringify(stats.series)}, ${stats.vehicles} vehicles`,
    );
  }
  for (const w of warnings) console.warn(`WARN  ${w}`);
  for (const e of errors) console.error(`ERROR ${e}`);
  console.log(errors.length === 0 ? "fixture:validate PASSED" : `fixture:validate FAILED (${errors.length} errors)`);
}
process.exitCode = errors.length === 0 ? 0 : 1;
