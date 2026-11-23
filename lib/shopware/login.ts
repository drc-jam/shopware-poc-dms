import "server-only";
import b2bRoutesFile from "@/data/b2b-routes.json";
import { personaCredentials } from "@/lib/env";
import type { PersonaKey } from "@/lib/personas";
import { storeFetch, StoreApiError } from "./store-client";
import type { B2BRoutesFile } from "./allowlist";

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
  const res = await storeFetch<{ contextToken?: string }>(path, {
    method: employeeRoute?.method ?? "POST",
    body: { email, username: email, password },
  });
  const token = res.contextToken ?? res.data?.contextToken ?? null;
  if (!res.ok || !token) throw new StoreApiError(`login failed for persona ${key} (HTTP ${res.status})`, res.ok ? 502 : 401);
  return token;
}

/** True when the token still belongs to a logged-in customer. */
export async function tokenIsLoggedIn(token: string): Promise<boolean> {
  try {
    const res = await storeFetch("account/customer", { method: "GET", contextToken: token });
    return res.ok;
  } catch {
    return false;
  }
}
