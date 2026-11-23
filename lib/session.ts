import "server-only";
import { cookies } from "next/headers";
import { COOKIE, parseActivePersona, type ActivePersona } from "@/lib/personas";

export async function getActivePersona(): Promise<ActivePersona> {
  return parseActivePersona((await cookies()).get(COOKIE.persona)?.value);
}

export async function getContextToken(persona?: ActivePersona): Promise<string | null> {
  const jar = await cookies();
  const p = persona ?? parseActivePersona(jar.get(COOKIE.persona)?.value);
  const v = jar.get(COOKIE.ctx(p))?.value;
  return v && /^[A-Za-z0-9_-]{8,128}$/.test(v) ? v : null;
}

export const CTX_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export function cookieBase(secure: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };
}
