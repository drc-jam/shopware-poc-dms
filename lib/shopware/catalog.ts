import "server-only";
import { cache } from "react";
import { getActivePersona, getContextToken } from "@/lib/session";
import { storeFetch, StoreApiError } from "./store-client";
import type { Cart, Category, ListingResult, Product } from "./types";

// Priced catalog reads for the active persona. All carry the persona's context token → no-store.

async function ctx() {
  const persona = await getActivePersona();
  return { persona, token: await getContextToken(persona) };
}

export interface ListingParams {
  p?: number;
  limit?: number;
  order?: string;
  manufacturer?: string;
  /** Phase 5: restrict to product IDs (fitment). */
  ids?: string[];
}

function criteria(params: ListingParams) {
  const body: Record<string, unknown> = { p: params.p ?? 1, limit: params.limit ?? 24 };
  if (params.order) body.order = params.order;
  if (params.manufacturer) body.manufacturer = params.manufacturer;
  if (params.ids) body.filter = [{ type: "equalsAny", field: "id", value: params.ids }];
  return body;
}

export const getCategory = cache(async (id: string): Promise<Category | null> => {
  const { token } = await ctx();
  const res = await storeFetch<Category>(`category/${id}`, { method: "POST", body: {}, contextToken: token });
  if (res.status === 404) return null;
  if (!res.ok || !res.data) throw new StoreApiError(`category HTTP ${res.status}`, res.status);
  return res.data;
});

export async function getListing(categoryId: string, params: ListingParams): Promise<ListingResult> {
  const { token } = await ctx();
  const res = await storeFetch<ListingResult>(`product-listing/${categoryId}`, { method: "POST", body: criteria(params), contextToken: token });
  if (!res.ok || !res.data) throw new StoreApiError(`product-listing HTTP ${res.status}`, res.status);
  return res.data;
}

export async function searchProducts(term: string, params: ListingParams): Promise<ListingResult> {
  const { token } = await ctx();
  const res = await storeFetch<ListingResult>("search", { method: "POST", body: { search: term, ...criteria(params) }, contextToken: token });
  if (!res.ok || !res.data) throw new StoreApiError(`search HTTP ${res.status}`, res.status);
  return res.data;
}

export const getProduct = cache(async (id: string): Promise<Product | null> => {
  const { token } = await ctx();
  const res = await storeFetch<{ product: Product }>(`product/${id}`, { method: "POST", body: {}, contextToken: token });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok || !res.data) throw new StoreApiError(`product HTTP ${res.status}`, res.status);
  return res.data.product;
});

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const { token } = await ctx();
  const res = await storeFetch<{ elements: Product[] }>("product", {
    method: "POST",
    body: { ids, limit: ids.length },
    contextToken: token,
  });
  if (!res.ok || !res.data) throw new StoreApiError(`product HTTP ${res.status}`, res.status);
  return res.data.elements;
}

export async function getCart(): Promise<Cart> {
  const { token } = await ctx();
  if (!token) return { lineItems: [] };
  const res = await storeFetch<Cart>("checkout/cart", { method: "GET", contextToken: token });
  if (!res.ok || !res.data) throw new StoreApiError(`cart HTTP ${res.status}`, res.status);
  return res.data;
}

export const isId = (v: string | undefined): v is string => !!v && /^[0-9a-f]{32}$/i.test(v);
