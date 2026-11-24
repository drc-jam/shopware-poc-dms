// Store API client for seeder discovery, verify and spikes (local/CI only).

export function createStoreClient({ url, accessKey, timeoutMs = 60_000 }) {
  async function call(method, path, { body, token, headers = {} } = {}) {
    const res = await fetch(`${url}/store-api/${path.replace(/^\/+/, "")}`, {
      method,
      headers: {
        "sw-access-key": accessKey,
        Accept: "application/json",
        ...(token ? { "sw-context-token": token } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, ok: res.ok, data, contextToken: res.headers.get("sw-context-token") };
  }
  return { call };
}

/** One-line error summary from a Store API error body. */
export const storeErrorSummary = (data) =>
  Array.isArray(data?.errors) ? data.errors.map((e) => `${e.code ?? e.status}: ${e.detail ?? e.title}`).join("; ") : String(JSON.stringify(data)).slice(0, 300);
