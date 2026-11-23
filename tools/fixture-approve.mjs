#!/usr/bin/env node
// Records the Phase 1 human review: `npm run fixture:approve -- --by "Name" [--note "..."]`.
// The approval is bound to the fixture's hash; any later edit invalidates it until re-approved.
import { writeFileSync } from "node:fs";
import { APPROVAL_FILE, fixtureHash } from "./fixture-hash.mjs";

const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const by = arg("--by");
if (!by) {
  console.error('usage: npm run fixture:approve -- --by "Reviewer" [--note "..."]');
  process.exit(1);
}
const record = { approvedAt: new Date().toISOString().slice(0, 10), approvedBy: by, note: arg("--note") ?? null, fixtureSha256: fixtureHash() };
writeFileSync(APPROVAL_FILE, JSON.stringify(record, null, 2) + "\n");
console.log(`fixture approved by ${by} (${record.fixtureSha256.slice(0, 12)}…)`);
