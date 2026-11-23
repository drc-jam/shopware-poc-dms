// Minimal Shopware Admin API client for the seeder (standalone; DEV_GUIDE §11).
// readOnly (the default) allows only GET and POST /api/search(-ids)/<entity>, so discover and plan
// stay read-only even when write-capable credentials are present (CLAUDE.md seeder rules).

const READ_ONLY_POST = /^\/(search|search-ids)\/[a-z0-9_-]+$/;

export class AdminApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function createAdminClient({ url, clientId, clientSecret, readOnly = true, timeoutMs = 60_000 }) {
  let token = null;
  let tokenExpires = 0;

  async function auth() {
    if (token && Date.now() < tokenExpires - 30_000) return token;
    const res = await fetch(`${url}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.access_token) throw new AdminApiError(`Admin OAuth failed (HTTP ${res.status})`, res.status, null);
    token = body.access_token;
    tokenExpires = Date.now() + (body.expires_in ?? 600) * 1000;
    return token;
  }

  async function request(method, path, { body, headers = {} } = {}) {
    const m = method.toUpperCase();
    if (readOnly && !(m === "GET" || (m === "POST" && READ_ONLY_POST.test(path)))) {
      throw new Error(`read-only admin client refused ${m} ${path}`);
    }
    const res = await fetch(`${url}/api${path}`, {
      method: m,
      headers: {
        Authorization: `Bearer ${await auth()}`,
        Accept: "application/json",
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
    if (!res.ok) {
      const detail = data?.errors?.map((e) => e.detail || e.title).join("; ") ?? String(text).slice(0, 300);
      throw new AdminApiError(`${m} ${path} → HTTP ${res.status}: ${detail}`, res.status, data);
    }
    return data;
  }

  // Admin API routes use hyphens (country-state); criteria `includes` keys use the entity name (country_state).
  const route = (entity) => entity.replaceAll("_", "-");
  const search = (entity, criteria = {}) =>
    request("POST", `/search/${route(entity)}`, { body: { "total-count-mode": 1, ...criteria } });

  /** Paginates with the given page size (use the discovered instance limit; no 250/500 assumptions). */
  async function searchAll(entity, criteria = {}, pageSize = 100) {
    const out = [];
    for (let page = 1; ; page++) {
      const r = await search(entity, { ...criteria, limit: pageSize, page });
      out.push(...(r.data ?? []));
      if (!r.data?.length || out.length >= (r.total ?? 0) || r.data.length < pageSize) break;
    }
    return out;
  }

  const count = async (entity, filter = []) => (await search(entity, { limit: 1, filter, includes: { [entity]: ["id"] } })).total ?? 0;

  return { request, get: (p) => request("GET", p), search, searchAll, count, route, readOnly };
}
