#!/usr/bin/env node
// seed:plan (DEV_GUIDE §11.2). READ-ONLY, guaranteed: the Admin client runs in readOnly mode
// (GET + /search only), even when write-capable credentials are present.
//
// Output: artifacts/seed-plan.json with creates / updates / conflicts per entity.
// Usage: node seed/plan.mjs [--replace-demo]   (with the flag, also lists what --replace-demo would delete)

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT, adminEnv, loadSeedEnv } from "./lib/env.mjs";
import { createAdminClient } from "./lib/admin-client.mjs";
import { loadFixture } from "./lib/fixture.mjs";
import { buildModel, ownedIds } from "./lib/model.mjs";
import { resolveReference } from "./lib/reference.mjs";
import { businessKeyConflicts, existingIds } from "./lib/state.mjs";

loadSeedEnv();
const admin = createAdminClient({ ...adminEnv(), readOnly: true });
const fx = loadFixture();
const ref = await resolveReference(admin, fx);
const model = buildModel(fx, ref);
const conflicts = await businessKeyConflicts(admin, model, ref.pageSize);

const stages = [];
for (const st of model.stages) {
  const exists = st.entity === "sales_channel" ? new Set([ref.salesChannelId]) : await existingIds(admin, st.entity, st.records.map((r) => r.id), ref.pageSize);
  const records = st.records.map((r) => {
    const c = conflicts.get(`${st.entity}:${r.key}`);
    let action = c ? "conflict" : exists.has(r.id) ? "update" : "create";
    if (st.entity === "sales_channel") action = ref.originalNavigationCategoryId === r.payload.navigationCategoryId ? "unchanged" : "update (alignment)";
    return { key: r.key, id: r.id, action, ...(c ? { conflict: c } : {}) };
  });
  const count = (a) => records.filter((r) => r.action.startsWith(a)).length;
  stages.push({ stage: st.name, entity: st.entity, create: count("create"), update: count("update"), unchanged: count("unchanged"), conflict: count("conflict"), records });
}

// Secrets the apply step will need (values are never written to the plan).
const secretEnvs = [...new Set(model.stages.flatMap((s) => s.records.map((r) => r.passwordEnv).filter(Boolean)))];
const missingSecrets = secretEnvs.filter((k) => !process.env[k]);

let replaceDemo = null;
if (process.argv.includes("--replace-demo")) {
  replaceDemo = [];
  for (const o of ownedIds(model, { forDelete: true })) {
    const ex = await existingIds(admin, o.entity, o.ids, ref.pageSize);
    replaceDemo.push({ entity: o.entity, wouldDelete: ex.size });
  }
}

const plan = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  salesChannel: { id: ref.salesChannelId, name: ref.salesChannelName },
  reference: { languageId: ref.languageId, systemCurrency: ref.systemCurrencyIso, usdFactor: ref.usdFactor, pageSize: ref.pageSize, notes: ref.notes },
  secrets: { required: secretEnvs, missing: missingSecrets },
  totals: {
    create: stages.reduce((n, s) => n + s.create, 0),
    update: stages.reduce((n, s) => n + s.update, 0),
    unchanged: stages.reduce((n, s) => n + s.unchanged, 0),
    conflict: stages.reduce((n, s) => n + s.conflict, 0),
  },
  stages,
  ...(replaceDemo ? { replaceDemo } : {}),
};
mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
writeFileSync(path.join(ROOT, "artifacts/seed-plan.json"), JSON.stringify(plan, null, 2) + "\n");

console.log(`Plan for sales channel "${ref.salesChannelName}" (${ref.salesChannelId}); read-only`);
for (const n of ref.notes) console.log(`  note: ${n}`);
console.log(`\n${"stage".padEnd(34)} ${"entity".padEnd(30)} create update same conflict`);
for (const s of stages) console.log(`${s.stage.padEnd(34)} ${s.entity.padEnd(30)} ${String(s.create).padStart(6)} ${String(s.update).padStart(6)} ${String(s.unchanged).padStart(4)} ${String(s.conflict).padStart(8)}`);
console.log(`\ntotal: ${plan.totals.create} create, ${plan.totals.update} update, ${plan.totals.unchanged} unchanged, ${plan.totals.conflict} conflict`);
if (replaceDemo) console.log(`--replace-demo would delete: ${replaceDemo.filter((r) => r.wouldDelete).map((r) => `${r.entity}=${r.wouldDelete}`).join(", ") || "nothing"}`);
if (missingSecrets.length) console.log(`missing secrets for apply: ${missingSecrets.join(", ")} (run npm run seed:init-env)`);
for (const s of stages) for (const r of s.records) if (r.conflict) console.log(`  CONFLICT ${s.entity} ${r.key}: ${r.conflict.field}="${r.conflict.value}" belongs to ${r.conflict.existingId}`);
console.log("wrote artifacts/seed-plan.json");
