import "server-only";
import { cookies } from "next/headers";
import { getActivePersona, getContextToken } from "@/lib/session";
import { COOKIE, PERSONAS } from "@/lib/personas";
import { parsePendingOrderIds } from "@/lib/pending-orders";
import { storeFetch } from "./store-client";
import type { B2bEmployee, B2bRole, EntitySearchResult, PendingOrder, ShoppingList } from "./types";

// Server-side B2B reads (S8–S10) for the active persona. Every call carries the persona's context token
// (no shared cache). Writes go through the allowlisted BFF from client components.

export type B2BResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function ctx() {
  const persona = await getActivePersona();
  return { persona, token: await getContextToken(persona) };
}

const errorOf = (status: number, data: unknown): B2BResult<never> => ({
  ok: false,
  status,
  message: (data as { errors?: { title?: string; detail?: string }[] } | null)?.errors?.[0]?.title ?? `HTTP ${status}`,
});

/** B2B pages are for the dealer company personas only. */
export async function requireB2BPersona(): Promise<B2BResult<{ persona: "dealer-admin" | "dealer-junior"; token: string }>> {
  const { persona, token } = await ctx();
  if (!PERSONAS[persona].b2b || !token) return { ok: false, status: 403, message: "Switch to a dealer persona to use B2B features." };
  return { ok: true, data: { persona: persona as "dealer-admin" | "dealer-junior", token } };
}

export async function getShoppingLists(): Promise<B2BResult<(ShoppingList & { itemCount: number })[]>> {
  const who = await requireB2BPersona();
  if (!who.ok) return who;
  const res = await storeFetch<EntitySearchResult<ShoppingList>>("shopping-lists", { method: "POST", body: { limit: 50 }, contextToken: who.data.token });
  if (!res.ok || !res.data) return errorOf(res.status, res.data);
  // The index has lineItems: null (6.7.16), so counts come from the detail route.
  const lists = await Promise.all(
    res.data.elements.map(async (l) => {
      const d = await storeFetch<ShoppingList>(`shopping-list/${l.id}`, { method: "POST", body: { associations: { lineItems: {} } }, contextToken: who.data.token });
      return { ...l, itemCount: d.ok ? (d.data?.lineItems?.length ?? 0) : 0 };
    }),
  );
  return { ok: true, data: lists };
}

/** Names only (index route; no per-list detail calls). For pickers on the PDP and quick order. */
export async function getShoppingListNames(): Promise<{ id: string; name: string }[]> {
  const who = await requireB2BPersona();
  if (!who.ok) return [];
  const res = await storeFetch<EntitySearchResult<ShoppingList>>("shopping-lists", { method: "POST", body: { limit: 50 }, contextToken: who.data.token });
  return res.ok && res.data ? res.data.elements.map((l) => ({ id: l.id, name: l.name })) : [];
}

export async function getShoppingList(id: string): Promise<B2BResult<ShoppingList>> {
  const who = await requireB2BPersona();
  if (!who.ok) return who;
  const res = await storeFetch<ShoppingList>(`shopping-list/${id}`, { method: "POST", body: { associations: { lineItems: {} } }, contextToken: who.data.token });
  if (!res.ok || !res.data) return errorOf(res.status, res.data);
  return { ok: true, data: res.data };
}

/** S9: employees (with role) and roles. Company admin only; Shopware also enforces employee.read / role.read. */
export async function getCompany(): Promise<B2BResult<{ employees: B2bEmployee[]; roles: B2bRole[] }>> {
  const who = await requireB2BPersona();
  if (!who.ok) return who;
  if (who.data.persona !== "dealer-admin") return { ok: false, status: 403, message: "Your role cannot view company employees and roles." };
  const [emp, roles] = await Promise.all([
    storeFetch<EntitySearchResult<B2bEmployee>>("employee", { method: "POST", body: { associations: { role: {} }, limit: 100 }, contextToken: who.data.token }),
    storeFetch<EntitySearchResult<B2bRole>>("role", { method: "GET", contextToken: who.data.token }),
  ]);
  if (!emp.ok || !emp.data) return errorOf(emp.status, emp.data);
  if (!roles.ok || !roles.data) return errorOf(roles.status, roles.data);
  return { ok: true, data: { employees: emp.data.elements, roles: roles.data.elements } };
}

/** S10: the pending orders requested in this browser (D3 cookie), newest first. */
export async function getTrackedPendingOrders(): Promise<B2BResult<PendingOrder[]>> {
  const who = await requireB2BPersona();
  if (!who.ok) return who;
  const ids = parsePendingOrderIds((await cookies()).get(COOKIE.pendingOrders)?.value).reverse();
  const rows = await Promise.all(
    ids.map(async (id) => {
      const r = await storeFetch<PendingOrder>(`pending-order/${id}`, {
        method: "POST",
        body: { associations: { stateMachineState: {}, employee: {} } },
        contextToken: who.data.token,
      });
      return r.ok && r.data ? r.data : null;
    }),
  );
  return { ok: true, data: rows.filter((r): r is PendingOrder => r !== null) };
}

export const pendingState = (po: PendingOrder) => po.stateMachineState?.technicalName ?? "unknown";
export const pendingStateLabel = (po: PendingOrder) =>
  po.stateMachineState?.translated?.name ?? po.stateMachineState?.name ?? pendingState(po);
