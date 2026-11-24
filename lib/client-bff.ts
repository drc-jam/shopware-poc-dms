// Client-side calls to the allowlisted BFF (/api/sw/*). Safe for client components: no secrets, no server-only.

export interface BffResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export async function callBff<T = unknown>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<BffResult<T>> {
  try {
    const res = await fetch(`/api/sw/${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as T | null;
    const err = (data as { errors?: { title?: string; detail?: string }[] } | null)?.errors?.[0];
    return { ok: res.ok, status: res.status, data: res.ok ? data : null, error: res.ok ? null : (err?.title ?? err?.detail ?? `Request failed (HTTP ${res.status})`) };
  } catch {
    return { ok: false, status: 0, data: null, error: "Network error" };
  }
}
