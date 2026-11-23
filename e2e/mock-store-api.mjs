#!/usr/bin/env node
// Minimal mock of the Shopware Store API for e2e until the instance exists (CLAUDE.md).
// Only implements what the Phase 3 shell calls. Fixture data lives in e2e/fixtures/.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const FIX = path.join(import.meta.dirname, "fixtures");
const navigation = JSON.parse(readFileSync(path.join(FIX, "navigation.json"), "utf8"));
const { customers } = JSON.parse(readFileSync(path.join(FIX, "customers.json"), "utf8"));
const PORT = Number(process.env.MOCK_STORE_API_PORT ?? 4010);
const ACCESS_KEY = process.env.SHOPWARE_SW_ACCESS_KEY;

const sessions = new Map(); // token -> { customerId | null, cart: Map<referencedId, qty> }
const hits = [];
const newToken = () => randomBytes(16).toString("hex");

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const err = (res, status, code, title) => send(res, status, { errors: [{ status: String(status), code, title, detail: "mock", meta: { trace: "internal" } }] });

function cartOf(token) {
  const s = sessions.get(token);
  const lineItems = [...(s?.cart ?? new Map())].map(([ref, quantity]) => ({ id: ref, referencedId: ref, type: "product", quantity, label: `Mock ${ref}` }));
  return { token, lineItems, price: { totalPrice: lineItems.reduce((n, li) => n + li.quantity * 10, 0) } };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};

  if (p === "/__mock/hits") return send(res, 200, hits);
  if (p === "/__mock/reset") { hits.length = 0; sessions.clear(); return send(res, 200, { ok: true }); }
  if (!p.startsWith("/store-api/")) return err(res, 404, "FRAMEWORK__NOT_FOUND", "not found");

  const route = p.slice("/store-api/".length);
  hits.push({ method: req.method, route });
  if (req.headers["sw-access-key"] !== ACCESS_KEY) return err(res, 401, "FRAMEWORK__API_INVALID_ACCESS_KEY", "invalid access key");

  let token = req.headers["sw-context-token"];
  if (!token || !sessions.has(token)) {
    token = newToken();
    sessions.set(token, { customerId: null, cart: new Map() });
  }
  const session = sessions.get(token);
  const H = { "sw-context-token": token };
  const key = `${req.method} ${route}`;

  if (key === "POST account/login") {
    const email = body.email ?? body.username;
    const c = customers.find((x) => process.env[`${x.envPrefix}_EMAIL`] === email);
    if (!c || process.env[`${c.envPrefix}_PASSWORD`] !== body.password) {
      return err(res, 401, "CHECKOUT__CUSTOMER_AUTH_BAD_CREDENTIALS", "Invalid username and/or password.");
    }
    // Like Shopware: restore the customer's previous context (and cart) if one exists.
    const prior = [...sessions].find(([t, s]) => s.customerId === c.id && t !== token);
    const t = prior ? prior[0] : newToken();
    if (!prior) sessions.set(t, { customerId: c.id, cart: new Map() });
    return send(res, 200, { contextToken: t }, { "sw-context-token": t });
  }
  if (key === "GET account/customer" || key === "POST account/customer") {
    const c = customers.find((x) => x.id === session.customerId);
    if (!c) return err(res, 403, "CHECKOUT__CUSTOMER_NOT_LOGGED_IN", "Customer is not logged in.");
    return send(res, 200, { id: c.id, firstName: c.firstName, lastName: c.lastName, company: c.company, group: { name: c.group } }, H);
  }
  if (key === "GET context") return send(res, 200, { token, customer: session.customerId ? { id: session.customerId } : null }, H);
  if (req.method === "POST" && /^navigation\/[^/]+\/[^/]+$/.test(route)) return send(res, 200, navigation, H);
  if (key === "GET checkout/cart") return send(res, 200, cartOf(token), H);
  if (key === "DELETE checkout/cart") { session.cart.clear(); return send(res, 204, undefined, H); }
  if (key === "POST checkout/cart/line-item") {
    for (const it of body.items ?? []) {
      const ref = it.referencedId ?? it.id;
      session.cart.set(ref, (session.cart.get(ref) ?? 0) + (it.quantity ?? 1));
    }
    return send(res, 200, cartOf(token), H);
  }
  // Deliberately answers so a BFF leak would be visible in the hit log.
  if (key === "POST checkout/order") return send(res, 200, { id: "order-should-never-exist" }, H);
  return err(res, 404, "FRAMEWORK__ROUTE_NOT_FOUND", `mock has no route ${key}`);
}).listen(PORT, "127.0.0.1", () => console.log(`mock Store API on http://127.0.0.1:${PORT}`));
