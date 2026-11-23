// SHA-256 over the reviewed fixture data (site-project.json + vehicles.json), used to tie a
// human approval to the exact data that was reviewed.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
export const APPROVAL_FILE = path.join(ROOT, "data/fixture/review-approval.json");

export function fixtureHash() {
  const h = createHash("sha256");
  for (const f of ["data/fixture/site-project.json", "data/fixture/vehicles.json"]) h.update(readFileSync(path.join(ROOT, f)));
  return h.digest("hex");
}
