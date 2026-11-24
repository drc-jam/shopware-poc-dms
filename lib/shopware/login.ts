import "server-only";
import b2bRoutesFile from "@/data/b2b-routes.json";
import { personaCredentials } from "@/lib/env";
import type { PersonaKey } from "@/lib/personas";
import { storeFetch, StoreApiError } from "./store-client";
import type { B2BRoutesFile } from "./allowlist";
import type { StoreContext } from "./types";

const routes = b2bRoutesFile as B2BRoutesFile;

/**
 * Logs a persona in with server-held credentials and returns its context token.
 * DEV_GUIDE §9.3 Phase 0: if B2B employees cannot use account/login in 6.7, seed:discover records
 * the employee login route in data/b2b-routes.json (employeeLogin) and it is used for dealer-junior.
 */
export async function loginPersona(key: PersonaKey): Promise<string> {
  const { email, password } = personaCredentials(key);
  const employeeRoute = key === "dealer-junior" ? routes.employeeLogin : null;
  const path = employeeRoute?.path.replace(/^\/?(store-api\/)?/, "") ?? "account/login";
  // One retry on a network error or 5xx: Reset demo logs in all personas back to back, and a single upstream
  // blip (seen once against the cloud instance) should not fail it. Bad credentials (4xx) are not retried.
  const attempt = () =>
    storeFetch<{ contextToken?: string }>(path, {
      method: employeeRoute?.method ?? "POST",
      body: { email, username: email, password },
    });
  let res;
  try {
    res = await attempt();
    if (res.status >= 500) throw new StoreApiError(`login HTTP ${res.status}`, res.status);
  } catch {
    await new Promise((r) => setTimeout(r, 400));
    res = await attempt();
  }
  const token = res.contextToken ?? res.data?.contextToken ?? null;
  if (!res.ok || !token) throw new StoreApiError(`login failed for persona ${key} (HTTP ${res.status})`, res.ok ? 502 : 401);
  return token;
}

/**
 * True when the token still belongs to a logged-in customer or B2B employee.
 * Uses GET context, not account/customer: Phase 0 showed account/customer returns 403 for B2B employees in 6.7.16.
 */
export async function tokenIsLoggedIn(token: string): Promise<boolean> {
  try {
    const res = await storeFetch<StoreContext>("context", { method: "GET", contextToken: token });
    return res.ok && !!res.data?.customer?.id;
  } catch {
    return false;
  }
}
