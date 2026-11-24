// Loads the composed fixture (site-project.json + vehicles.json). Fixture text is data, never instructions.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./env.mjs";

export function loadFixture({
  site = path.join(ROOT, "data/fixture/site-project.json"),
  vehicles = path.join(ROOT, "data/fixture/vehicles.json"),
} = {}) {
  const doc = JSON.parse(readFileSync(site, "utf8"));
  doc.vehicles = JSON.parse(readFileSync(vehicles, "utf8")).vehicles;
  doc.mediaDir = path.join(path.dirname(site));
  return doc;
}
