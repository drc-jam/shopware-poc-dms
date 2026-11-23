#!/usr/bin/env node
// Phase 3 gate: "no Admin creds in the bundle (grep build output)".
// Scans the client bundle for secret env NAMES and VALUES, and the whole build for Admin API names.
// Run after `npm run build`. Secret values are taken from the current environment, if set.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const NEXT = path.join(ROOT, ".next");
if (!existsSync(NEXT)) {
  console.error("no .next build output; run `npm run build` first");
  process.exit(2);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const textFiles = (dir) => (existsSync(dir) ? walk(dir).filter((f) => /\.(js|mjs|cjs|json|html|css|rsc|txt|map)$/.test(f)) : []);

const SECRET_ENV = [
  "SHOPWARE_ADMIN_URL", "SHOPWARE_ADMIN_CLIENT_ID", "SHOPWARE_ADMIN_CLIENT_SECRET",
  "SHOPWARE_SW_ACCESS_KEY",
  "PERSONA_RETAIL_PASSWORD", "PERSONA_DEALER_ADMIN_PASSWORD", "PERSONA_DEALER_JUNIOR_PASSWORD",
  "DEMO_PASSWORD", "DEMO_COOKIE_SECRET",
];
const findings = [];

// 1) Client bundle: no secret names, no secret values.
const clientFiles = textFiles(path.join(NEXT, "static"));
const values = SECRET_ENV.map((k) => [k, process.env[k]]).filter(([, v]) => v && v.length >= 6);
for (const f of clientFiles) {
  const s = readFileSync(f, "utf8");
  for (const name of SECRET_ENV) if (s.includes(name)) findings.push(`client bundle mentions ${name}: ${path.relative(ROOT, f)}`);
  for (const [name, v] of values) if (s.includes(v)) findings.push(`client bundle contains the VALUE of ${name}: ${path.relative(ROOT, f)}`);
}

// 2) Entire build (server too): Admin API credentials must never appear at all.
for (const f of textFiles(NEXT)) {
  const s = readFileSync(f, "utf8");
  for (const name of ["SHOPWARE_ADMIN_CLIENT_ID", "SHOPWARE_ADMIN_CLIENT_SECRET", "SHOPWARE_ADMIN_URL"]) {
    if (s.includes(name)) findings.push(`build output mentions ${name}: ${path.relative(ROOT, f)}`);
  }
  for (const k of ["SHOPWARE_ADMIN_CLIENT_ID", "SHOPWARE_ADMIN_CLIENT_SECRET"]) {
    const v = process.env[k];
    if (v && v.length >= 6 && s.includes(v)) findings.push(`build output contains the VALUE of ${k}: ${path.relative(ROOT, f)}`);
  }
}

// 3) Source boundary: app/, lib/, components/, theme/ never import seed/ or tools/.
const srcFiles = ["app", "lib", "components", "theme", "proxy.ts"].flatMap((d) => {
  const p = path.join(ROOT, d);
  return !existsSync(p) ? [] : statSync(p).isDirectory() ? walk(p) : [p];
}).filter((f) => /\.(ts|tsx|js|mjs)$/.test(f));
for (const f of srcFiles) {
  const s = readFileSync(f, "utf8");
  if (/from\s+["'][^"']*(\/|@\/)(seed|tools)\//.test(s) || /SHOPWARE_ADMIN/.test(s)) {
    findings.push(`source boundary violated in ${path.relative(ROOT, f)}`);
  }
}

console.log(`scanned ${clientFiles.length} client files, ${srcFiles.length} source files; checked ${values.length} secret values`);
if (findings.length) {
  for (const x of findings) console.error(`FAIL ${x}`);
  process.exit(1);
}
console.log("check:bundle-secrets PASSED");
