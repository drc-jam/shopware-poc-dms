import "server-only";
import { cache } from "react";
import type { ActivePersona } from "@/lib/personas";
import { getContextToken } from "@/lib/session";
import { storeFetch } from "./store-client";
import type { Cart, NavCategory, StoreContext } from "./types";

export const nameOf = (c: { translated?: { name?: string | null }; name?: string | null }) => c.translated?.name ?? c.name ?? "";

/** Main navigation (context-free → ISR-cached; never carries a context token). */
export const getMainNavigation = cache(async (): Promise<{ items: NavCategory[]; error?: string }> => {
  try {
    const res = await storeFetch<NavCategory[]>("navigation/main-navigation/main-navigation", {
      method: "POST",
      body: { depth: 2, buildTree: true },
      revalidate: 300,
    });
    if (!res.ok || !Array.isArray(res.data)) return { items: [], error: `navigation HTTP ${res.status}` };
    return { items: res.data.filter((c) => c.visible !== false && c.active !== false) };
  } catch (e) {
    return { items: [], error: (e as Error).message };
  }
});

export interface HeaderState {
  cartCount: number;
  displayName: string | null;
  company: string | null;
  error?: string;
}

/** Persona-specific header data. Always no-store (carries a context token). */
export const getHeaderState = cache(async (persona: ActivePersona): Promise<HeaderState> => {
  const token = await getContextToken(persona);
  const state: HeaderState = { cartCount: 0, displayName: null, company: null };
  if (!token) return state;
  try {
    // GET context, not account/customer: the latter is 403 for B2B employees (Phase 0). For an employee,
    // context.customer is the company (business partner) and extensions.b2bEmployee is the employee.
    const [cart, context] = await Promise.all([
      storeFetch<Cart>("checkout/cart", { method: "GET", contextToken: token }),
      persona === "guest" ? null : storeFetch<StoreContext>("context", { method: "GET", contextToken: token }),
    ]);
    if (cart.ok && cart.data) {
      state.cartCount = cart.data.lineItems.filter((li) => li.type === "product").reduce((n, li) => n + li.quantity, 0);
    }
    const customer = context?.ok ? context.data?.customer : null;
    if (customer?.id) {
      const person = context?.data?.extensions?.b2bEmployee ?? customer;
      state.displayName = `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() || null;
      state.company = customer.company ?? customer.activeBillingAddress?.company ?? null;
    } else if (context) {
      state.error = "session expired; switch persona again";
    }
  } catch (e) {
    state.error = (e as Error).message;
  }
  return state;
});
