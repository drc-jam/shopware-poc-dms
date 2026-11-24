// Instance state helpers shared by plan (read-only) and apply: existence by ID, business-key conflicts, ledger.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./env.mjs";

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** IDs (of `ids`) that exist for an entity. Paged by the instance-safe page size. */
export async function existingIds(admin, entity, ids, pageSize = 100) {
  const found = new Set();
  for (const part of chunks([...new Set(ids)], pageSize)) {
    for (const x of await admin.searchIdsAll(entity, { ids: part }, pageSize)) found.add(x);
  }
  return found;
}

/**
 * Business-key collisions: a record we would write whose business key already belongs to an entity
 * with a different ID (not created by this fixture). Apply refuses those (never writes to non-demo entities).
 * @returns Map<"entity:key", { existingId, field, value }>
 */
export async function businessKeyConflicts(admin, model, pageSize = 100) {
  const out = new Map();
  const check = async (entity, field, recs, valueOf) => {
    const values = recs.map(valueOf).filter(Boolean);
    for (const part of chunks(values, pageSize)) {
      const r = await admin.search(entity, { filter: [{ type: "equalsAny", field, value: part }], limit: pageSize, includes: { [entity]: ["id", field] } });
      for (const row of r.data ?? []) {
        const rec = recs.find((x) => valueOf(x) === row[field]);
        if (rec && rec.id !== row.id) out.set(`${rec.entity}:${rec.key}`, { existingId: row.id, field, value: row[field] });
      }
    }
  };
  const recsOf = (entity) => model.stages.filter((s) => s.entity === entity).flatMap((s) => s.records.map((r) => ({ ...r, entity })));
  await check("product", "productNumber", recsOf("product"), (r) => r.payload.productNumber);
  await check("customer", "email", recsOf("customer"), (r) => r.payload.email);
  await check("b2b_employee_account", "email", recsOf("b2b_employee_account").filter((r) => r.payload.email), (r) => r.payload.email);
  await check("b2b_employee", "email", recsOf("b2b_employee"), (r) => r.payload.email);
  await check("custom_field_set", "name", recsOf("custom_field_set"), (r) => r.payload.name);
  // custom fields are nested in the set; check their names too.
  const sets = recsOf("custom_field_set");
  const fields = sets.flatMap((r) => r.payload.customFields.map((f) => ({ entity: "custom_field", key: f.name, id: f.id, payload: f, setKey: r.key })));
  const before = new Set(out.keys());
  await check("custom_field", "name", fields, (r) => r.payload.name);
  // Report a field-name collision on the owning set record: that is the record plan shows and apply writes.
  for (const [k, c] of [...out].filter(([k]) => !before.has(k) && k.startsWith("custom_field:"))) {
    const f = fields.find((x) => `custom_field:${x.key}` === k);
    out.delete(k);
    if (f && !out.has(`custom_field_set:${f.setKey}`)) out.set(`custom_field_set:${f.setKey}`, { ...c, field: `customField ${c.field}` });
  }
  const media = recsOf("media");
  for (const m of media) {
    const r = await admin.search("media", { filter: [{ type: "equals", field: "fileName", value: m.file.fileName }], limit: 5, includes: { media: ["id", "fileName"] } });
    const other = (r.data ?? []).find((x) => x.id !== m.id);
    if (other) out.set(`media:${m.key}`, { existingId: other.id, field: "fileName", value: m.file.fileName });
  }
  return out;
}

export function createLedger(mode, meta = {}) {
  const file = path.join(ROOT, "artifacts/seed-ledger.json");
  const ledger = { mode, startedAt: new Date().toISOString(), finishedAt: null, ...meta, entries: [] };
  const save = () => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...ledger, summary: summarize(ledger.entries) }, null, 2) + "\n");
  };
  return {
    ledger,
    add(entity, key, id, action, extra = {}) {
      ledger.entries.push({ entity, key, id, action, ...extra });
    },
    save,
    finish() {
      ledger.finishedAt = new Date().toISOString();
      save();
      return summarize(ledger.entries);
    },
  };
}

export function summarize(entries) {
  const byAction = {};
  const byEntity = {};
  for (const e of entries) {
    byAction[e.action] = (byAction[e.action] ?? 0) + 1;
    byEntity[e.entity] ??= {};
    byEntity[e.entity][e.action] = (byEntity[e.entity][e.action] ?? 0) + 1;
  }
  return { total: entries.length, byAction, byEntity };
}

/** Runs fn over items with at most `limit` in flight. */
export async function pMap(items, fn, limit = 6) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export { chunks };
