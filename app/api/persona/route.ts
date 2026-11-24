import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { COOKIE, PERSONA_KEYS, PERSONAS, type ActivePersona, type PersonaKey } from "@/lib/personas";
import { isSameOrigin, isSecure, jsonError, NO_STORE, readCappedBody } from "@/lib/http";
import { cookieBase, CTX_COOKIE_MAX_AGE } from "@/lib/session";
import { loginPersona } from "@/lib/shopware/login";
import { ensurePersonaToken } from "@/lib/persona-session";
import { storeFetch, StoreApiError } from "@/lib/shopware/store-client";

export const runtime = "nodejs";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("switch"), key: z.enum(["guest", ...PERSONA_KEYS]) }),
  z.object({ action: z.literal("reset") }),
]);

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "cross-origin request rejected");
  const raw = await readCappedBody(req, 1024);
  if (raw === null) return jsonError(413, "payload too large");
  let parsed;
  try {
    parsed = Body.safeParse(JSON.parse(raw || "{}"));
  } catch {
    return jsonError(400, "invalid JSON");
  }
  if (!parsed.success) return jsonError(400, "invalid request");

  const secure = isSecure(req);
  try {
    if (parsed.data.action === "reset") return await reset(req, secure);
    return await switchTo(req, parsed.data.key, secure);
  } catch (e) {
    const status = e instanceof StoreApiError ? e.status : 500;
    console.error("[persona]", (e as Error).message);
    return jsonError(status === 401 ? 401 : 502, "persona login failed; check persona env vars and the Shopware instance");
  }
}

async function switchTo(req: NextRequest, key: ActivePersona, secure: boolean) {
  const res = NextResponse.json({ persona: key, label: PERSONAS[key].label }, { headers: NO_STORE });
  res.cookies.set(COOKIE.persona, key, { ...cookieBase(secure), maxAge: CTX_COOKIE_MAX_AGE });
  if (key === "guest") return res;

  // Reuse the persona's existing context (keeps its cart) if it is still logged in; otherwise log in.
  const token = await ensurePersonaToken(req, key);
  res.cookies.set(COOKIE.ctx(key), token, { ...cookieBase(secure), maxAge: CTX_COOKIE_MAX_AGE });
  return res;
}

/** Reset demo: clear every persona's cart and the garage, then re-login (DEV_GUIDE §9.3). */
async function reset(req: NextRequest, secure: boolean) {
  const res = NextResponse.json({ persona: "guest", reset: true }, { headers: NO_STORE });
  const all: ActivePersona[] = ["guest", ...PERSONA_KEYS];
  for (const p of all) {
    const token = req.cookies.get(COOKIE.ctx(p))?.value;
    if (token) await storeFetch("checkout/cart", { method: "DELETE", contextToken: token }).catch(() => undefined);
    res.cookies.delete(COOKIE.ctx(p));
  }
  for (const key of PERSONA_KEYS as readonly PersonaKey[]) {
    const token = await loginPersona(key);
    // A fresh login may restore a saved cart; clear it so every persona starts empty.
    await storeFetch("checkout/cart", { method: "DELETE", contextToken: token }).catch(() => undefined);
    res.cookies.set(COOKIE.ctx(key), token, { ...cookieBase(secure), maxAge: CTX_COOKIE_MAX_AGE });
  }
  res.cookies.set(COOKIE.persona, "guest", { ...cookieBase(secure), maxAge: CTX_COOKIE_MAX_AGE });
  res.cookies.delete(COOKIE.garage);
  res.cookies.delete(COOKIE.garageActive);
  res.cookies.delete(COOKIE.pendingOrders);
  res.cookies.delete("tour_step");
  return res;
}
