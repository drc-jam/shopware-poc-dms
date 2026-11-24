#!/usr/bin/env node
// seed:init-env — fills missing seeder values in .env.seed (gitignored). Never prints secret values.
//   PERSONA_*_EMAIL       from the fixture (customers / employees)
//   PERSONA_*_PASSWORD    random, 24 chars base64url (only if missing)
//   SHOPWARE_SALES_CHANNEL_ID  from artifacts/discovery.json (only if missing)
// Existing values (in .env.seed or the process environment) are kept.
// For Vercel, copy the PERSONA_* values from .env.seed into the project's env (Phase 8).
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const file = path.join(ROOT, ".env.seed");
const current = existsSync(file) ? readFileSync(file, "utf8") : "";
const has = (k) => new RegExp(`^${k}=.+$`, "m").test(current) || !!process.env[k];

const site = JSON.parse(readFileSync(path.join(ROOT, "data/fixture/site-project.json"), "utf8"));
const people = [...site.customers, ...site.b2b.employees];
const add = [];
for (const p of people) {
  const prefix = p.passwordEnv.replace(/_PASSWORD$/, "");
  if (!has(`${prefix}_EMAIL`)) add.push([`${prefix}_EMAIL`, p.email]);
  if (!has(p.passwordEnv)) add.push([p.passwordEnv, randomBytes(18).toString("base64url")]);
}
const disc = path.join(ROOT, "artifacts/discovery.json");
if (!has("SHOPWARE_SALES_CHANNEL_ID") && existsSync(disc)) {
  const id = JSON.parse(readFileSync(disc, "utf8")).salesChannel?.id;
  if (id) add.push(["SHOPWARE_SALES_CHANNEL_ID", id]);
}
if (!add.length) {
  console.log(".env.seed already has every seeder value");
  process.exit(0);
}
const block = `\n# added by seed:init-env ${new Date().toISOString().slice(0, 10)}\n${add.map(([k, v]) => `${k}=${v}`).join("\n")}\n`;
writeFileSync(file, current + block);
chmodSync(file, 0o600);
console.log(`.env.seed: added ${add.map(([k]) => k).join(", ")} (values not printed)`);
