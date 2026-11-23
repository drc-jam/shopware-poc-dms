import "server-only";
import { cache } from "react";
import type { ActivePersona } from "@/lib/personas";
import { getContextToken } from "@/lib/session";
import { storeFetch } from "./store-client";
import type { Cart, Customer, NavCategory } from "./types";

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
    const [cart, customer] = await Promise.all([
      storeFetch<Cart>("checkout/cart", { method: "GET", contextToken: token }),
      persona === "guest" ? null : storeFetch<Customer>("account/customer", { method: "GET", contextToken: token }),
    ]);
    if (cart.ok && cart.data) {
      state.cartCount = cart.data.lineItems.filter((li) => li.type === "product").reduce((n, li) => n + li.quantity, 0);
    }
    if (customer?.ok && customer.data) {
      state.displayName = `${customer.data.firstName} ${customer.data.lastName}`.trim();
      state.company = customer.data.company ?? customer.data.activeBillingAddress?.company ?? null;
    } else if (customer) {
      state.error = "session expired; switch persona again";
    }
  } catch (e) {
    state.error = (e as Error).message;
  }
  return state;
});
