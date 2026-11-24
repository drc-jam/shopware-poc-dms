#!/usr/bin/env node
// fitment:build (DEV_GUIDE §8). Writes data/fitment-index.json from the fixture. No instance writes.
// The sales channel id comes from SHOPWARE_SALES_CHANNEL_ID, else artifacts/discovery.json.
// seed:apply also writes the index at the end of every run. Re-deploy the app after re-seeding.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, loadSeedEnv, salesChannelIdFromEnv } from "./lib/env.mjs";
import { loadFixture } from "./lib/fixture.mjs";
import { buildFitmentIndex, writeFitmentIndex } from "./lib/fitment.mjs";

loadSeedEnv();
const disc = path.join(ROOT, "artifacts/discovery.json");
const scId = salesChannelIdFromEnv() ?? (existsSync(disc) ? JSON.parse(readFileSync(disc, "utf8")).salesChannel?.id : null);
if (!scId) {
  console.error("set SHOPWARE_SALES_CHANNEL_ID (or run seed:discover first)");
  process.exit(2);
}
const index = buildFitmentIndex(loadFixture(), scId);
const action = writeFitmentIndex(index);
console.log(`data/fitment-index.json ${action}: ${Object.keys(index.vehicles).length} vehicles, ${Object.keys(index.byProduct).length} fitment SKUs, ${index.universal.length} universal`);
