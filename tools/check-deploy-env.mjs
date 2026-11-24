#!/usr/bin/env node
// prebuild: a Vercel build (VERCEL=1) fails if any Shopware Admin API variable is set in the project.
// CLAUDE.md: Admin API credentials exist only for local/CI seeding and are never set in Vercel.
// Lives in tools/ (outside the app's source boundary), so the app itself never references these names.
import { pathToFileURL } from "node:url";

const PREFIX = "SHOPWARE_ADMIN_";

/** Names of Admin API variables present in a Vercel build environment (empty elsewhere). */
export function adminVarsOnVercel(env = process.env) {
  if (env.VERCEL !== "1") return [];
  return Object.keys(env).filter((k) => k.startsWith(PREFIX) && env[k]).sort();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const found = adminVarsOnVercel();
  if (found.length) {
    console.error(`Build refused: ${found.join(", ")} must not be set in Vercel. Admin API credentials are for local/CI seeding only; remove them from the Vercel project and redeploy.`);
    process.exit(1);
  }
  if (process.env.VERCEL === "1") console.log("check-deploy-env: no Admin API variables in the Vercel environment");
}
