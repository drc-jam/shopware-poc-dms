#!/usr/bin/env node
// Mock of the Shopware Store API for e2e until the instance exists (CLAUDE.md).
// Implements only what the app calls. Catalog/pricing: e2e/mock/catalog.mjs (from data/fixture/).
// Customers and navigation: e2e/fixtures/.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { calculateCart, categories, inCategory, listing, navigation, priced, productById, products, search } from "./mock/catalog.mjs";

const FIX = path.join(import.meta.dirname, "fixtures");
const MEDIA = path.resolve(import.meta.dirname, "../data/fixture/media");
const { customers } = JSON.parse(readFileSync(path.join(FIX, "customers.json"), "utf8"));
const PORT = Number(process.env.MOCK_STORE_API_PORT ?? 4010);
const BASE = `http://127.0.0.1:${PORT}`;
const ACCESS_KEY = process.env.SHOPWARE_SW_ACCESS_KEY;

const sessions = new Map(); // token -> { customerId | null, cart: Map<productId, qty> }
const hits = [];
const newToken = () => randomBytes(16).toString("hex");

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const err = (res, status, code, title, headers = {}) =>
  send(res, status, { errors: [{ status: String(status), code, title, detail: "mock", meta: { trace: "internal" } }] }, headers);

const groupOf = (session) => customers.find((c) => c.id === session.customerId)?.group ?? "Retail";

createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const p = url.pathname;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return err(res, 400, "FRAMEWORK__INVALID_JSON", "invalid JSON");
  }

  if (p === "/__mock/hits") return send(res, 200, hits);
  if (p === "/__mock/reset") { hits.length = 0; sessions.clear(); return send(res, 200, { ok: true }); }
  if (p.startsWith("/media/")) {
    const file = path.join(MEDIA, path.basename(p));
    if (!existsSync(file)) return err(res, 404, "MEDIA__NOT_FOUND", "not found");
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" });
    return res.end(readFileSync(file));
  }
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
  const group = groupOf(session);
  const H = { "sw-context-token": token };
  const key = `${req.method} ${route}`;
  const cart = () => calculateCart(token, session.cart, group, BASE);
  let m;

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
    if (!c) return err(res, 403, "CHECKOUT__CUSTOMER_NOT_LOGGED_IN", "Customer is not logged in.", H);
    return send(res, 200, { id: c.id, firstName: c.firstName, lastName: c.lastName, company: c.company, group: { name: c.group } }, H);
  }
  if (key === "GET context") return send(res, 200, { token, customer: session.customerId ? { id: session.customerId } : null }, H);
  if (req.method === "POST" && /^navigation\/[^/]+\/[^/]+$/.test(route)) return send(res, 200, navigation, H);

  // ---- catalog ----
  if (req.method === "POST" && (m = /^category\/([0-9a-f]{32})$/.exec(route))) {
    const c = categories.find((x) => x.id === m[1]);
    return c ? send(res, 200, c, H) : err(res, 404, "CONTENT__CATEGORY_NOT_FOUND", "Category not found", H);
  }
  if (req.method === "POST" && (m = /^product-listing\/([0-9a-f]{32})$/.exec(route))) {
    if (!categories.some((x) => x.id === m[1])) return err(res, 404, "CONTENT__CATEGORY_NOT_FOUND", "Category not found", H);
    return send(res, 200, listing(inCategory(m[1]), body, group, BASE), H);
  }
  if (key === "POST product") {
    const r = listing(products, { ...body, limit: body.limit ?? 100 }, group, BASE);
    return send(res, 200, { apiAlias: "dal_entity_search_result", total: r.total, elements: r.elements, aggregations: {} }, H);
  }
  if (req.method === "POST" && (m = /^product\/([0-9a-f]{32})$/.exec(route))) {
    const prod = productById.get(m[1]);
    if (!prod) return err(res, 404, "PRODUCT__PRODUCT_NOT_FOUND", "Product not found", H);
    return send(res, 200, { product: priced(prod, group, BASE), configurator: [] }, H);
  }
  if (key === "POST search" || key === "POST search-suggest") {
    const limit = key === "POST search-suggest" ? 6 : body.limit;
    return send(res, 200, listing(search(body.search), { ...body, limit }, group, BASE), H);
  }

  // ---- cart ----
  if (key === "GET checkout/cart") return send(res, 200, cart(), H);
  if (key === "DELETE checkout/cart") { session.cart.clear(); return send(res, 204, undefined, H); }
  if (key === "POST checkout/cart/line-item") {
    for (const it of body.items ?? []) {
      const id = it.referencedId ?? it.id;
      if (!productById.has(id)) return err(res, 404, "PRODUCT__PRODUCT_NOT_FOUND", `Product ${id} not found`, H);
      session.cart.set(id, (session.cart.get(id) ?? 0) + Math.max(1, Number(it.quantity) || 1));
    }
    return send(res, 200, cart(), H);
  }
  if (key === "PATCH checkout/cart/line-item") {
    for (const it of body.items ?? []) {
      if (!session.cart.has(it.id)) return err(res, 404, "CHECKOUT__CART_LINE_ITEM_NOT_FOUND", "Line item not found", H);
      const q = Number(it.quantity);
      if (!Number.isInteger(q) || q < 1) return err(res, 400, "CHECKOUT__CART_INVALID_LINEITEM_QUANTITY", "Invalid quantity", H);
      session.cart.set(it.id, q);
    }
    return send(res, 200, cart(), H);
  }
  if (key === "POST checkout/cart/line-item/delete" || key === "DELETE checkout/cart/line-item") {
    const ids = body.ids ?? url.searchParams.getAll("ids[]");
    for (const id of ids) session.cart.delete(id);
    return send(res, 200, cart(), H);
  }
  // Deliberately answers so a BFF leak would be visible in the hit log.
  if (key === "POST checkout/order") return send(res, 200, { id: "order-should-never-exist" }, H);
  return err(res, 404, "FRAMEWORK__ROUTE_NOT_FOUND", `mock has no route ${key}`, H);
}).listen(PORT, "127.0.0.1", () => console.log(`mock Store API on ${BASE}`));
