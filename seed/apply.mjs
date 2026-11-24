#!/usr/bin/env node
// seed:apply (DEV_GUIDE §11.3). Writes the demo to the instance and records every record in
// artifacts/seed-ledger.json as created | updated | unchanged | skipped | failed (| deleted with --replace-demo).
//
// Rules (CLAUDE.md): deterministic IDs (stableId), upsert by business key (records whose business key belongs
// to a non-fixture entity are refused, never overwritten), bounded concurrency, paged searches within the
// instance limit, cached media uploads, no writes to non-fixture entities except the logged navigation-root
// alignment of the demo sales channel. A run with any `failed` entry exits non-zero.
//
// Usage: node seed/apply.mjs [--concurrency 6] [--replace-demo]
//   --replace-demo  deletes every fixture-owned record (and runtime B2B data of the demo company) first.
//                   It is the ONLY delete path and must be passed explicitly.

import { readFileSync } from "node:fs";
import { adminEnv, loadSeedEnv, storeEnv } from "./lib/env.mjs";
import { createAdminClient } from "./lib/admin-client.mjs";
import { createStoreClient, storeErrorSummary } from "./lib/store-client.mjs";
import { loadFixture } from "./lib/fixture.mjs";
import { buildModel, ownedIds, INTENT_PERMISSIONS } from "./lib/model.mjs";
import { resolveReference } from "./lib/reference.mjs";
import { businessKeyConflicts, chunks, createLedger, existingIds, pMap } from "./lib/state.mjs";
import { buildFitmentIndex, writeFitmentIndex } from "./lib/fitment.mjs";

loadSeedEnv();
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const CONCURRENCY = Math.max(1, Math.min(12, Number(opt("--concurrency", 6)) || 6));
const REPLACE = flag("--replace-demo");

const admin = createAdminClient({ ...adminEnv(), readOnly: false });
const store = createStoreClient(storeEnv());
const fx = loadFixture();
const ref = await resolveReference(admin, fx);
const model = buildModel(fx, ref);
const L = createLedger(REPLACE ? "apply --replace-demo" : "apply", { salesChannelId: ref.salesChannelId, concurrency: CONCURRENCY, pageSize: ref.pageSize });
const log = (...a) => console.log(...a);
const errText = (e) => String(e?.message ?? e).slice(0, 600);

// ------------------------------------------------------------------ preflight: secrets
const secretEnvs = [...new Set(model.stages.flatMap((s) => s.records.map((r) => r.passwordEnv).filter(Boolean)))];
const missing = secretEnvs.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`missing ${missing.join(", ")}; run \`npm run seed:init-env\` (writes .env.seed) or set them in the environment`);
  process.exit(2);
}

const sync = (entity, action, payload) =>
  admin.request("POST", "/_action/sync", { body: [{ key: `${entity}-${action}`, action, entity, payload }] });

// ------------------------------------------------------------------ --replace-demo (explicit only)
if (REPLACE) {
  log("--replace-demo: deleting fixture-owned records");
  const customerIds = model.stages.filter((s) => s.entity === "customer").flatMap((s) => s.records.map((r) => r.id));
  // Runtime B2B data of the demo company (created by the app / verify), so customers can be removed.
  for (const [entity, field] of [["b2b_components_pending_order", "customerId"], ["b2b_components_shopping_list", "customerId"]]) {
    const rows = await admin.searchIdsAll(entity, { filter: [{ type: "equalsAny", field, value: customerIds }] }, ref.pageSize);
    for (const part of chunks(rows, ref.pageSize)) {
      try {
        await sync(entity, "delete", part.map((id) => ({ id })));
        for (const id of part) L.add(entity, "runtime", id, "deleted");
      } catch (e) {
        for (const id of part) L.add(entity, "runtime", id, "failed", { error: errText(e) });
      }
    }
  }
  for (const o of ownedIds(model, { forDelete: true })) {
    // Re-check existence right before deleting: earlier deletes may have cascaded (e.g. account → employee).
    const ex = [...(await existingIds(admin, o.entity, o.ids, ref.pageSize))];
    for (const part of chunks(ex, ref.pageSize)) {
      try {
        await sync(o.entity, "delete", part.map((id) => ({ id })));
        for (const id of part) L.add(o.entity, null, id, "deleted");
      } catch {
        // One by one, so a blocked record does not fail the whole batch and the ledger names it.
        for (const id of part) {
          try {
            await sync(o.entity, "delete", [{ id }]);
            L.add(o.entity, null, id, "deleted");
          } catch (e) {
            const gone = !(await existingIds(admin, o.entity, [id], ref.pageSize)).size;
            L.add(o.entity, null, id, gone ? "deleted" : "failed", gone ? { note: "removed by cascade" } : { error: errText(e) });
          }
        }
      }
    }
  }
  const kept = model.stages.flatMap((s) => s.records.filter((r) => r.keepOnReplace).map((r) => [s.entity, r]));
  for (const [entity, r] of kept) L.add(entity, r.key, r.id, "skipped", { note: "kept on --replace-demo: the sales channel navigation root points here; its children are replaced" });
  L.save();
}

// ------------------------------------------------------------------ business-key conflicts (refuse, never overwrite)
const conflicts = await businessKeyConflicts(admin, model, ref.pageSize);
for (const [k, c] of conflicts) log(`  CONFLICT ${k}: ${c.field}="${c.value}" belongs to non-fixture ${c.existingId}`);

// ------------------------------------------------------------------ helpers
const CHILD_FK = { product_price: "productId", product_media: "productId", b2b_components_shopping_list_line_item: "shoppingListId" };

/** Deletes child rows of existing parents that the fixture no longer contains (e.g. dealer tiers removed by D2). */
async function pruneChildren(records, exists) {
  const pruned = new Map();
  const parents = records.filter((r) => r.keepChildren && exists.has(r.id));
  if (!parents.length) return pruned;
  for (const childEntity of Object.keys(parents[0].keepChildren)) {
    const fk = CHILD_FK[childEntity];
    const keep = new Set(parents.flatMap((r) => r.keepChildren[childEntity]));
    const rows = [];
    for (const part of chunks(parents.map((r) => r.id), ref.pageSize)) {
      rows.push(...(await admin.searchAll(childEntity, { filter: [{ type: "equalsAny", field: fk, value: part }], includes: { [childEntity]: ["id", fk] } }, ref.pageSize)));
    }
    const extra = rows.filter((r) => !keep.has(r.id));
    for (const part of chunks(extra, ref.pageSize)) await sync(childEntity, "delete", part.map((r) => ({ id: r.id })));
    for (const r of extra) pruned.set(r[fk], (pruned.get(r[fk]) ?? 0) + 1);
  }
  return pruned;
}

let permissionNames = null;
async function instancePermissions() {
  if (permissionNames) return permissionNames;
  const owner = model.stages.find((s) => s.entity === "customer").records.find((r) => r.key === fx.b2b.company.ownerCustomer);
  const login = await store.call("POST", "account/login", { body: { email: owner.email, password: process.env[owner.passwordEnv] } });
  const token = login.contextToken ?? login.data?.contextToken;
  if (!login.ok || !token) throw new Error(`owner login for permissions failed: HTTP ${login.status} ${storeErrorSummary(login.data)}`);
  const r = await store.call("GET", "permission", { token });
  if (!r.ok || !Array.isArray(r.data)) throw new Error(`GET permission failed: HTTP ${r.status} ${storeErrorSummary(r.data)}`);
  permissionNames = [...new Set(r.data.map((p) => p.permissionName).filter(Boolean))].sort();
  return permissionNames;
}

async function preparePayload(st, r) {
  const payload = structuredClone(r.payload);
  if (r.passwordEnv && (st.entity === "customer" || st.entity === "b2b_employee_account" || st.entity === "b2b_employee")) {
    payload.password = process.env[r.passwordEnv];
  }
  let note;
  if (st.needsPermissions) {
    const all = await instancePermissions();
    if (r.permissionsSpec?.includes("*")) {
      payload.permissions = all;
      note = `"*" expanded to ${all.length} instance permissions`;
    } else {
      const fromIntents = (r.permissionIntents ?? []).flatMap((i) => {
        if (!(i in INTENT_PERMISSIONS)) throw new Error(`unknown permission intent "${i}"`);
        return INTENT_PERMISSIONS[i];
      });
      const explicit = (r.permissionsSpec ?? []).filter((p) => all.includes(p));
      payload.permissions = [...new Set([...fromIntents, ...explicit])].sort();
      note = `intents ${JSON.stringify(r.permissionIntents ?? [])} → ${payload.permissions.length} permissions (not permission-gated in this version; Phase 0)`;
    }
  }
  return { payload, note };
}

async function upsertStage(st) {
  const records = [];
  for (const r of st.records) {
    const c = conflicts.get(`${st.entity}:${r.key}`);
    if (c) L.add(st.entity, r.key, r.id, "failed", { error: `business key ${c.field}="${c.value}" belongs to non-fixture record ${c.existingId}; refusing to overwrite` });
    else records.push(r);
  }
  if (!records.length) return;
  const exists = await existingIds(admin, st.entity, records.map((r) => r.id), ref.pageSize);
  const pruned = await pruneChildren(records, exists);
  const prepared = [];
  for (const r of records) {
    try {
      prepared.push({ r, ...(await preparePayload(st, r)) });
    } catch (e) {
      L.add(st.entity, r.key, r.id, "failed", { error: errText(e) });
    }
  }
  const record = (x, action, extra = {}) => {
    const notes = [x.note, pruned.get(x.r.id) ? `pruned ${pruned.get(x.r.id)} obsolete child row(s)` : null].filter(Boolean);
    L.add(st.entity, x.r.key, x.r.id, action, { ...(notes.length ? { note: notes.join("; ") } : {}), ...extra });
  };
  await pMap(chunks(prepared, st.chunk ?? 50), async (part) => {
    try {
      await sync(st.entity, "upsert", part.map((x) => x.payload));
      for (const x of part) record(x, exists.has(x.r.id) ? "updated" : "created");
    } catch (e) {
      // Retry one by one so the ledger names the exact failing record.
      for (const x of part) {
        try {
          await sync(st.entity, "upsert", [x.payload]);
          record(x, exists.has(x.r.id) ? "updated" : "created");
        } catch (e2) {
          record(x, "failed", { error: errText(e2) });
        }
      }
    }
  }, CONCURRENCY);
}

async function mediaStage(st) {
  await upsertStage(st);
  await pMap(st.records, async (r) => {
    if (conflicts.has(`media:${r.key}`)) return;
    try {
      const m = (await admin.search("media", { ids: [r.id], includes: { media: ["id", "hasFile", "fileName"] } })).data?.[0];
      if (m?.hasFile) {
        L.add("media-file", r.key, r.id, "unchanged", { note: "file already uploaded (cached)" });
        return;
      }
      const bytes = readFileSync(r.file.path);
      await admin.request("POST", `/_action/media/${r.id}/upload?extension=${encodeURIComponent(r.file.extension)}&fileName=${encodeURIComponent(r.file.fileName)}`, {
        rawBody: bytes, contentType: `image/${r.file.extension === "jpg" ? "jpeg" : r.file.extension}`,
      });
      L.add("media-file", r.key, r.id, "created", { note: `uploaded ${bytes.length} bytes` });
    } catch (e) {
      L.add("media-file", r.key, r.id, "failed", { error: errText(e) });
    }
  }, CONCURRENCY);
}

async function alignmentStage(st) {
  for (const r of st.records) {
    const sc = (await admin.search("sales_channel", { ids: [r.id], includes: { sales_channel: ["id", "navigationCategoryId"] } })).data?.[0];
    if (sc?.navigationCategoryId === r.payload.navigationCategoryId) {
      L.add("sales_channel", r.key, r.id, "unchanged", { note: "navigation root already points at the demo root category" });
      continue;
    }
    try {
      await sync("sales_channel", "upsert", [r.payload]);
      L.add("sales_channel", r.key, r.id, "updated", { note: `reference alignment: navigationCategoryId ${sc?.navigationCategoryId} → ${r.payload.navigationCategoryId}`, previous: sc?.navigationCategoryId ?? null });
    } catch (e) {
      L.add("sales_channel", r.key, r.id, "failed", { error: errText(e) });
    }
  }
}

// ------------------------------------------------------------------ run
const t0 = Date.now();
for (const st of model.stages) {
  const before = L.ledger.entries.length;
  try {
    if (st.entity === "sales_channel") await alignmentStage(st);
    else if (st.entity === "media") await mediaStage(st);
    else await upsertStage(st);
  } catch (e) {
    for (const r of st.records) L.add(st.entity, r.key, r.id, "failed", { error: `stage error: ${errText(e)}` });
  }
  const mine = L.ledger.entries.slice(before);
  const c = (a) => mine.filter((e) => e.action === a).length;
  log(`${st.name.padEnd(34)} created ${String(c("created")).padStart(3)}  updated ${String(c("updated")).padStart(3)}  unchanged ${String(c("unchanged")).padStart(2)}  failed ${c("failed")}`);
  L.save();
}

// fitment index (DEV_GUIDE §8)
try {
  const action = writeFitmentIndex(buildFitmentIndex(fx, ref.salesChannelId));
  L.add("fitment-index", "data/fitment-index.json", null, action);
  log(`fitment index                      ${action}`);
} catch (e) {
  L.add("fitment-index", "data/fitment-index.json", null, "failed", { error: errText(e) });
}

const summary = L.finish();
log(`\nledger: ${JSON.stringify(summary.byAction)} in ${((Date.now() - t0) / 1000).toFixed(1)}s → artifacts/seed-ledger.json`);
const failed = L.ledger.entries.filter((e) => e.action === "failed");
for (const f of failed.slice(0, 20)) log(`  FAILED ${f.entity} ${f.key ?? f.id}: ${f.error}`);
if (failed.length) process.exitCode = 1;
