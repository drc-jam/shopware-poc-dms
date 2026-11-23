// BFF allowlist (DEV_GUIDE §9.2). Default deny: a request passes only if it matches a rule here.
// B2B routes are NOT hard-coded: they come from data/b2b-routes.json, which seed:discover derives
// from the instance's /store-api/_info/openapi3.json (CLAUDE.md).
import b2bRoutesFile from "@/data/b2b-routes.json";
import type { ActivePersona, PersonaKey } from "@/lib/personas";

export type Method = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * read          – any logged-in B2B persona (dealer-admin, dealer-junior)
 * write         – any logged-in B2B persona (quick order / shopping list mutations)
 * approval-request – dealer-junior only
 * approval-decide  – dealer-admin only
 */
export type B2BKind = "read" | "write" | "approval-request" | "approval-decide";

export interface Rule {
  id: string;
  method: Method;
  pattern: RegExp;
  /** Personas allowed; undefined = everyone, including guest. */
  personas?: readonly ActivePersona[];
}

export interface B2BRouteEntry {
  id: string;
  method: Method;
  /** Store API path template relative to /store-api/, e.g. "some/route/{id}". */
  path: string;
  kind: B2BKind;
}

export interface B2BRoutesFile {
  status: "pending-discovery" | "discovered";
  routes: B2BRouteEntry[];
  employeeLogin?: { method: Method; path: string } | null;
  /** Every order-creating route the instance exposes (from discovery). The BFF must deny all of them. */
  orderCreatingRoutes?: { method: string; path: string; operationId: string | null }[];
}

const ID = "[A-Za-z0-9_-]{1,64}";
const exact = (p: string) => new RegExp(`^${p}$`);

const B2B_PERSONAS: readonly PersonaKey[] = ["dealer-admin", "dealer-junior"];
const LOGGED_IN: readonly PersonaKey[] = ["retail", "dealer-admin", "dealer-junior"];

/** Order creation and account-mutation routes: denied for every persona, and B2B config may not re-allow them. */
export const HARD_DENY: readonly RegExp[] = [
  // Order creation anywhere in the path, e.g. B2B "pending-order/{id}/checkout/order" (found in Phase 0 discovery).
  /(^|\/)checkout\/order(\/|$)/,
  // Any "<something>/order" conversion route, e.g. B2B "quote/{id}/order". Plain "order" (list own orders) is not matched.
  /\/order(\/|$)/,
  // Order returns (write on placed orders).
  /^order\/[^/]+\/return(\/|$)/,
  /^handle-payment(\/|$)/,
  /^order\/payment(\/|$)/,
  /^account\/login(\/|$)/, // only via /api/persona (server-held credentials)
  /^account\/logout(\/|$)/,
  /^account\/register(\/|$)/,
  /^account\/customer-recovery-is-expired(\/|$)/,
  /^account\/recovery-password(\/|$)/,
  /^account\/change-/,
];

export const CORE_RULES: readonly Rule[] = [
  { id: "context.get", method: "GET", pattern: exact("context") },
  { id: "account.customer.get", method: "GET", pattern: exact("account/customer"), personas: LOGGED_IN },
  { id: "account.customer.read", method: "POST", pattern: exact("account/customer"), personas: LOGGED_IN },
  { id: "navigation", method: "POST", pattern: exact(`navigation/${ID}/${ID}`) },
  { id: "category", method: "POST", pattern: exact(`category/${ID}`) },
  { id: "product-listing", method: "POST", pattern: exact(`product-listing/${ID}`) },
  { id: "product.list", method: "POST", pattern: exact("product") },
  { id: "product.detail", method: "POST", pattern: exact(`product/${ID}`) },
  { id: "search", method: "POST", pattern: exact("search") },
  { id: "search-suggest", method: "POST", pattern: exact("search-suggest") },
  { id: "cart.get", method: "GET", pattern: exact("checkout/cart") },
  { id: "cart.clear", method: "DELETE", pattern: exact("checkout/cart") },
  { id: "cart.line-item.add", method: "POST", pattern: exact("checkout/cart/line-item") },
  { id: "cart.line-item.update", method: "PATCH", pattern: exact("checkout/cart/line-item") },
  { id: "cart.line-item.remove", method: "DELETE", pattern: exact("checkout/cart/line-item") },
  { id: "cart.line-item.remove-post", method: "POST", pattern: exact("checkout/cart/line-item/delete") },
];

const KIND_PERSONAS: Record<B2BKind, readonly PersonaKey[]> = {
  read: B2B_PERSONAS,
  write: B2B_PERSONAS,
  "approval-request": ["dealer-junior"],
  "approval-decide": ["dealer-admin"],
};

const METHODS: readonly Method[] = ["GET", "POST", "PATCH", "DELETE"];

function templateToRegExp(template: string): RegExp {
  const clean = template.replace(/^\/?(store-api\/)?/, "").replace(/\/+$/, "");
  if (!/^[A-Za-z0-9_\-/{}.]+$/.test(clean) || clean.includes("..")) throw new Error(`invalid B2B route template "${template}"`);
  const src = clean
    .split("/")
    .map((seg) => (/^\{[A-Za-z0-9_]+\}$/.test(seg) ? ID : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return exact(src);
}

/** Builds B2B rules from discovery output. Throws if config tries to allow a hard-denied route. */
export function buildB2BRules(file: B2BRoutesFile): Rule[] {
  if (file.status !== "discovered") return [];
  return file.routes.map((r) => {
    if (!METHODS.includes(r.method)) throw new Error(`B2B route ${r.id}: unsupported method ${r.method}`);
    if (!(r.kind in KIND_PERSONAS)) throw new Error(`B2B route ${r.id}: unknown kind ${r.kind}`);
    const pattern = templateToRegExp(r.path);
    const probe = r.path.replace(/\{[^}]+\}/g, "x").replace(/^\/?(store-api\/)?/, "");
    if (HARD_DENY.some((d) => d.test(probe))) throw new Error(`B2B route ${r.id} (${r.path}) matches a hard-deny pattern`);
    return { id: `b2b.${r.id}`, method: r.method, pattern, personas: KIND_PERSONAS[r.kind] };
  });
}

export type Decision =
  | { allowed: true; rule: Rule }
  | { allowed: false; status: 403 | 404; reason: string };

export function decide(
  method: string,
  path: string,
  persona: ActivePersona,
  rules: readonly Rule[] = defaultRules(),
): Decision {
  const m = method.toUpperCase();
  if (HARD_DENY.some((d) => d.test(path))) {
    return { allowed: false, status: 403, reason: "route is blocked in this demo" };
  }
  const candidates = rules.filter((r) => r.pattern.test(path));
  if (candidates.length === 0) return { allowed: false, status: 403, reason: "route is not allowlisted" };
  const sameMethod = candidates.filter((r) => r.method === m);
  if (sameMethod.length === 0) return { allowed: false, status: 403, reason: "method is not allowlisted for this route" };
  const rule = sameMethod.find((r) => !r.personas || r.personas.includes(persona));
  if (!rule) return { allowed: false, status: 403, reason: `not permitted for persona "${persona}"` };
  return { allowed: true, rule };
}

let cached: Rule[] | null = null;
export function defaultRules(): Rule[] {
  cached ??= [...CORE_RULES, ...buildB2BRules(b2bRoutesFile as B2BRoutesFile)];
  return cached;
}

export const b2bStatus = (b2bRoutesFile as B2BRoutesFile).status;
