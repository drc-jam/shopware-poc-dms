import "server-only";
import { z } from "zod";
import type { PersonaKey } from "./personas";

// Server-only env access. Never prefix any of these with NEXT_PUBLIC_.
// Admin API credentials are deliberately NOT read here: they exist only in .env.seed for seed/.

const storeSchema = z.object({
  SHOPWARE_STORE_API_URL: z.url().transform((u) => u.replace(/\/+$/, "")),
  SHOPWARE_SW_ACCESS_KEY: z.string().min(8),
});

export function storeEnv() {
  const r = storeSchema.safeParse(process.env);
  if (!r.success) throw new Error(`Store API env invalid: ${r.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  return r.data;
}

const PERSONA_ENV: Record<PersonaKey, string> = {
  retail: "PERSONA_RETAIL",
  "dealer-admin": "PERSONA_DEALER_ADMIN",
  "dealer-junior": "PERSONA_DEALER_JUNIOR",
};

export function personaCredentials(key: PersonaKey): { email: string; password: string } {
  const prefix = PERSONA_ENV[key];
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`Missing ${prefix}_EMAIL / ${prefix}_PASSWORD`);
  return { email, password };
}

export function gateEnv() {
  const password = process.env.DEMO_PASSWORD;
  const secret = process.env.DEMO_COOKIE_SECRET;
  if (!password || !secret || secret.length < 32) {
    throw new Error("DEMO_PASSWORD and DEMO_COOKIE_SECRET (≥ 32 chars) must be set");
  }
  return { password, secret };
}
