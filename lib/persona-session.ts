import "server-only";
import type { NextRequest } from "next/server";
import { COOKIE, type PersonaKey } from "@/lib/personas";
import { loginPersona, tokenIsLoggedIn } from "@/lib/shopware/login";

/** The persona's existing logged-in context token (keeps its cart), or a fresh login. */
export async function ensurePersonaToken(req: NextRequest, key: PersonaKey): Promise<string> {
  const existing = req.cookies.get(COOKIE.ctx(key))?.value;
  return existing && (await tokenIsLoggedIn(existing)) ? existing : await loginPersona(key);
}
