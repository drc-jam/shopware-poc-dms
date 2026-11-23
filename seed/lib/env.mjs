// Seeder env (local/CI only). Admin API credentials live in .env.seed and never reach app/ or lib/.
import { existsSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../..");

/** Loads .env.seed if present. Variables already set in the process environment win. */
export function loadSeedEnv() {
  const file = path.join(ROOT, ".env.seed");
  if (existsSync(file)) process.loadEnvFile(file);
  return process.env;
}

function req(env, name) {
  const v = env[name];
  if (!v || /placeholder|example\.invalid|^0{32}$/i.test(v)) throw new Error(`${name} is missing or still a placeholder (.env.seed)`);
  return v;
}

/** Strips a trailing /admin or /api so both "https://host/admin" and "https://host" work. */
export const normalizeBase = (url) => url.replace(/\/+$/, "").replace(/\/(admin|api)$/, "");

export function adminEnv(env = process.env) {
  return {
    url: normalizeBase(req(env, "SHOPWARE_ADMIN_URL")),
    clientId: req(env, "SHOPWARE_ADMIN_CLIENT_ID"),
    clientSecret: req(env, "SHOPWARE_ADMIN_CLIENT_SECRET"),
  };
}

export function storeEnv(env = process.env) {
  return {
    url: normalizeBase(req(env, "SHOPWARE_STORE_API_URL")),
    accessKey: req(env, "SHOPWARE_SW_ACCESS_KEY"),
  };
}

/** Optional explicit sales channel; discovery derives it from the access key when unset. */
export function salesChannelIdFromEnv(env = process.env) {
  const v = env.SHOPWARE_SALES_CHANNEL_ID;
  return v && /^[0-9a-f]{32}$/.test(v) && !/^0{32}$/.test(v) ? v : null;
}
