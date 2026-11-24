import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { COOKIE, PERSONAS, type PersonaKey } from "@/lib/personas";
import { isSameOrigin, isSecure, jsonError, NO_STORE, readCappedBody } from "@/lib/http";
import { cookieBase, CTX_COOKIE_MAX_AGE } from "@/lib/session";
import { ensurePersonaToken } from "@/lib/persona-session";
import { storeFetch, StoreApiError } from "@/lib/shopware/store-client";
import { getMainNavigation, nameOf } from "@/lib/shopware/queries";
import { GARAGE_COOKIE_MAX_AGE, parseGarage, parseVehicle, serializeGarage } from "@/lib/fitment";
import { stepById, TOUR_COOKIE, type TourRun, type TourTarget } from "@/lib/tour";
import type { EntitySearchResult, NavCategory, ShoppingList } from "@/lib/shopware/types";

// Runs one presenter-tour step (DEV_GUIDE §9.4): switch persona, stage the scene declared in data/tour.json
// (replace the persona's cart, set or clear the active vehicle), resolve the deep link, remember the step.
// It performs only those declared actions; it never touches checkout or any B2B write.
export const runtime = "nodejs";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run"), step: z.string().max(4), run: z.number().int().min(0).max(2).default(0) }),
  z.object({ action: z.literal("exit") }),
]);

async function productIds(skus: string[], token: string | null): Promise<Map<string, string>> {
  const res = await storeFetch<{ elements: { id: string; productNumber: string }[] }>("product", {
    method: "POST",
    body: { filter: [{ type: "equalsAny", field: "productNumber", value: skus }], limit: skus.length },
    contextToken: token,
  });
  if (!res.ok || !res.data) throw new StoreApiError(`product lookup HTTP ${res.status}`, res.status);
  return new Map(res.data.elements.map((p) => [p.productNumber, p.id]));
}

function findCategory(items: NavCategory[], path: string[]): NavCategory | null {
  let level = items;
  let found: NavCategory | null = null;
  for (const name of path) {
    found = level.find((c) => nameOf(c) === name) ?? null;
    if (!found) return null;
    level = found.children ?? [];
  }
  return found;
}

async function resolveHref(target: TourTarget, token: string | null): Promise<string> {
  switch (target.type) {
    case "path":
      return target.href;
    case "product": {
      const id = (await productIds([target.sku], token)).get(target.sku);
      if (!id) throw new StoreApiError(`tour product ${target.sku} not found`, 404);
      return `/p/${id}`;
    }
    case "category": {
      const c = findCategory((await getMainNavigation()).items, target.path);
      if (!c) throw new StoreApiError(`tour category ${target.path.join(" > ")} not found`, 404);
      return `/c/${c.id}`;
    }
    case "list": {
      const res = await storeFetch<EntitySearchResult<ShoppingList>>("shopping-lists", { method: "POST", body: { limit: 50 }, contextToken: token });
      const l = res.ok ? res.data?.elements.find((x) => x.name === target.name) : null;
      if (!l) throw new StoreApiError(`tour shopping list "${target.name}" not found`, 404);
      return `/account/lists/${l.id}`;
    }
  }
}

async function stageCart(run: TourRun, token: string) {
  const items = run.setup?.cart;
  if (!items) return;
  await storeFetch("checkout/cart", { method: "DELETE", contextToken: token });
  const ids = await productIds(items.map((i) => i.sku), token);
  const missing = items.filter((i) => !ids.has(i.sku)).map((i) => i.sku);
  if (missing.length) throw new StoreApiError(`tour products not found: ${missing.join(", ")}`, 404);
  const res = await storeFetch("checkout/cart/line-item", {
    method: "POST",
    body: { items: items.map((i) => ({ id: ids.get(i.sku), referencedId: ids.get(i.sku), type: "product", quantity: i.qty })) },
    contextToken: token,
  });
  if (!res.ok) throw new StoreApiError(`tour cart setup HTTP ${res.status}`, res.status);
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "cross-origin request rejected");
  const raw = await readCappedBody(req, 512);
  if (raw === null) return jsonError(413, "payload too large");
  let parsed;
  try {
    parsed = Body.safeParse(JSON.parse(raw || "{}"));
  } catch {
    return jsonError(400, "invalid JSON");
  }
  if (!parsed.success) return jsonError(400, "invalid request");
  const secure = isSecure(req);

  if (parsed.data.action === "exit") {
    const res = NextResponse.json({ exited: true }, { headers: NO_STORE });
    res.cookies.delete(TOUR_COOKIE);
    return res;
  }

  const step = stepById(parsed.data.step);
  const run = step?.runs[parsed.data.run];
  if (!step || !run) return jsonError(404, "unknown tour step");

  try {
    const persona = run.persona;
    const token = persona === "guest" ? null : await ensurePersonaToken(req, persona as PersonaKey);
    if (token) await stageCart(run, token);
    const href = await resolveHref(run.target, token);

    const res = NextResponse.json({ step: step.id, run: parsed.data.run, persona, label: PERSONAS[persona].label, href }, { headers: NO_STORE });
    const opts = { ...cookieBase(secure), maxAge: CTX_COOKIE_MAX_AGE };
    res.cookies.set(COOKIE.persona, persona, opts);
    if (token) res.cookies.set(COOKIE.ctx(persona), token, opts);
    res.cookies.set(TOUR_COOKIE, step.id, opts);

    // Vehicle: a step that declares one makes it active; any other step shops without a vehicle (garage kept).
    const vehicle = parseVehicle(run.setup?.vehicle ?? null);
    if (vehicle) {
      const garage = [...parseGarage(req.cookies.get(COOKIE.garage)?.value).filter((v) => v.id !== vehicle.id), vehicle].slice(-3);
      res.cookies.set(COOKIE.garage, serializeGarage(garage), { ...cookieBase(secure), maxAge: GARAGE_COOKIE_MAX_AGE });
      res.cookies.set(COOKIE.garageActive, vehicle.id, { ...cookieBase(secure), maxAge: GARAGE_COOKIE_MAX_AGE });
    } else {
      res.cookies.delete(COOKIE.garageActive);
    }
    return res;
  } catch (e) {
    const status = e instanceof StoreApiError ? e.status : 500;
    console.error("[tour]", step.id, (e as Error).message);
    return jsonError(status === 404 ? 404 : 502, `could not prepare ${step.id}: ${(e as Error).message}`.slice(0, 200));
  }
}
