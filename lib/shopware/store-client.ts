import "server-only";
import { storeEnv } from "@/lib/env";

// Typed-enough Store API client (server-only). Priced/context calls are never shared-cached:
// any call carrying a context token uses cache: "no-store" (DEV_GUIDE §4).

export interface StoreRequest {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Raw query string without "?" (already validated by the caller). */
  query?: string;
  contextToken?: string | null;
  /** ISR seconds for context-free content only. Ignored when a context token is present. */
  revalidate?: number;
  timeoutMs?: number;
}

export interface StoreResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T | null;
  /** Rotated context token returned by Shopware, if any. */
  contextToken: string | null;
}

export class StoreApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function storeFetch<T = unknown>(path: string, req: StoreRequest = {}): Promise<StoreResponse<T>> {
  const { SHOPWARE_STORE_API_URL, SHOPWARE_SW_ACCESS_KEY } = storeEnv();
  const url = `${SHOPWARE_STORE_API_URL}/store-api/${path.replace(/^\/+/, "")}${req.query ? `?${req.query}` : ""}`;
  const method = req.method ?? (req.body === undefined ? "GET" : "POST");
  const headers: Record<string, string> = {
    Accept: "application/json",
    "sw-access-key": SHOPWARE_SW_ACCESS_KEY,
  };
  if (req.body !== undefined) headers["Content-Type"] = "application/json";
  if (req.contextToken) headers["sw-context-token"] = req.contextToken;

  const caching: RequestInit & { next?: { revalidate: number } } =
    !req.contextToken && req.revalidate ? { next: { revalidate: req.revalidate } } : { cache: "no-store" };

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      redirect: "manual",
      signal: AbortSignal.timeout(req.timeoutMs ?? 15_000),
      ...caching,
    });
  } catch (e) {
    throw new StoreApiError(`Store API unreachable: ${(e as Error).name}`, 502);
  }
  if (res.status >= 300 && res.status < 400) throw new StoreApiError("Store API redirect rejected", 502);

  const text = await res.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      throw new StoreApiError("Store API returned non-JSON", 502);
    }
  }
  return { status: res.status, ok: res.ok, data, contextToken: res.headers.get("sw-context-token") };
}

/** Reduce a Store API error payload to safe, display-only fields. */
export function sanitizeErrors(data: unknown, status: number) {
  const raw = (data as { errors?: unknown })?.errors;
  const list = Array.isArray(raw) ? raw : [];
  const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const errors = list.slice(0, 10).map((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    return { status: str(o.status, 8) ?? String(status), code: str(o.code, 120), title: str(o.title), detail: str(o.detail) };
  });
  return { errors: errors.length ? errors : [{ status: String(status), title: "Store API error" }] };
}
