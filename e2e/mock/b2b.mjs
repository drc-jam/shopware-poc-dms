// B2B Components routes for the mock Store API, shaped like Shopware 6.7.16 responses observed on the
// Evolve instance (Phase 0 spikes + Phase 6 probes). Seeded from data/fixture/site-project.json.
//   - employees / roles: company admin only; employees get 403 B2B__EMPLOYEE_MISSING_PERMISSIONS
//   - shopping lists: index has lineItems: null; detail returns lineItems; add-to-cart adds every item
//   - approvals: only the Junior Buyer may request; the request empties the cart; approve / decline need
//     the admin role; deciding never creates an order (orderId stays null)
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const md5 = (s) => createHash("md5").update(s).digest("hex");
const newId = () => randomBytes(16).toString("hex");
const site = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../data/fixture/site-project.json"), "utf8"));
const productId = (sku) => md5(`product:${sku}`);
const now = () => new Date().toISOString();

const search = (entity, elements) => ({ elements, aggregations: [], page: 1, limit: 100, entity, total: elements.length, states: [], apiAlias: "dal_entity_search_result" });
const missing = (perm) => ({ status: 403, code: "B2B__EMPLOYEE_MISSING_PERMISSIONS", title: `Employee is missing permissions: ${perm}` });

export function createB2B(customers) {
  const owner = customers.find((c) => c.persona === "dealer-admin");
  const junior = customers.find((c) => c.persona === "dealer-junior");
  const fxEmp = site.b2b.employees[0];
  const roles = site.b2b.roles.map((r) => ({
    id: md5(`b2b_components_role:${r.key}`), name: r.name, default: false,
    permissions: r.permissions?.includes("*")
      ? ["approval_rule.create", "approval_rule.delete", "approval_rule.read", "approval_rule.update", "employee.create", "employee.delete", "employee.edit", "employee.read", "order.read.all", "pending_order.approve_decline", "pending_order.approve_decline_all", "pending_order.read_all", "role.create", "role.delete", "role.edit", "role.read"]
      : [],
    apiAlias: "b2b_components_role",
  }));
  const employee = {
    id: md5(`b2b_employee:${fxEmp.key}`), firstName: junior.firstName, lastName: junior.lastName, email: "junior.buyer@example.com",
    status: "active", isPrimaryMembership: true, roleId: roles.find((r) => r.name === "Junior Buyer").id, apiAlias: "b2b_employee",
  };
  const state = { lists: new Map(), pending: new Map() };

  function seedLists() {
    state.lists.clear();
    for (const l of site.b2b.shoppingLists) {
      const id = md5(`b2b_components_shopping_list:${l.key}`);
      state.lists.set(id, {
        id, name: l.name, active: true, customerId: owner.id, employeeId: employee.id, createdAt: now(),
        items: l.items.map((it) => ({ id: md5(`b2b_components_shopping_list_line_item:${l.key}:${it.productNumber}`), productId: productId(it.productNumber), quantity: it.quantity })),
      });
    }
  }
  seedLists();

  const listView = (l, withItems) => ({
    id: l.id, name: l.name, active: l.active, customerId: l.customerId, employeeId: l.employeeId, createdAt: l.createdAt, updatedAt: null, price: null,
    lineItems: withItems ? l.items.map((it) => ({ id: it.id, productId: it.productId, quantity: it.quantity, price: null, apiAlias: "b2b_components_shopping_list_line_item" })) : null,
    apiAlias: "b2b_components_shopping_list",
  });
  const pendingView = (po, assoc) => ({
    id: po.id, createdAt: po.createdAt, updatedAt: po.updatedAt, reason: null, orderId: null, employeeId: employee.id, customerId: owner.id,
    amountTotal: po.amountTotal, amountNet: po.amountTotal, price: { totalPrice: po.amountTotal, netPrice: po.amountTotal, positionPrice: po.amountTotal },
    ...(assoc?.stateMachineState ? { stateMachineState: { technicalName: po.state, name: po.state[0].toUpperCase() + po.state.slice(1), translated: { name: po.state[0].toUpperCase() + po.state.slice(1) } } } : {}),
    ...(assoc?.employee ? { employee: { firstName: employee.firstName, lastName: employee.lastName, email: employee.email } } : {}),
    apiAlias: "b2b_components_pending_order",
  });

  /**
   * @returns {null | { status: number, body?: unknown, error?: { status, code, title } }}
   */
  function handle(method, route, body, ctx) {
    const who = customers.find((c) => c.id === ctx.session.customerId)?.persona ?? null;
    const isCompany = who === "dealer-admin" || who === "dealer-junior";
    const isAdmin = who === "dealer-admin";
    const key = `${method} ${route}`;
    let m;
    const b2bRoute = /^(employee|role|permission|shopping-lists?|pending-orders?|approval-rule)(\/|$)/.test(route);
    if (!b2bRoute) return null;
    if (!isCompany) return { status: 403, error: { status: 403, code: "CHECKOUT__CUSTOMER_NOT_LOGGED_IN", title: "Customer is not a B2B employee or business partner" } };

    // ---- employees / roles (admin only)
    if (key === "GET employee" || key === "POST employee") {
      if (!isAdmin) return { status: 403, error: missing("employee.read") };
      const withRole = key === "GET employee" ? null : body.associations?.role;
      return { status: 200, body: search("b2b_employee", [{ ...employee, role: withRole ? roles.find((r) => r.id === employee.roleId) : null }]) };
    }
    if (key === "GET role" || key === "POST role") {
      if (!isAdmin) return { status: 403, error: missing("role.read") };
      return { status: 200, body: search("b2b_components_role", roles) };
    }

    // ---- shopping lists (company personas)
    if (key === "POST shopping-lists") return { status: 200, body: search("b2b_components_shopping_list", [...state.lists.values()].filter((l) => l.customerId === owner.id).map((l) => listView(l, false))) };
    if (key === "POST shopping-list") {
      if (!body.name || typeof body.name !== "string") return { status: 400, error: { status: 400, code: "VIOLATION::IS_BLANK_ERROR", title: "name should not be blank" } };
      const id = newId();
      const items = Object.values(body.lineItems ?? {}).map((it) => ({ id: newId(), productId: it.id, quantity: Math.max(1, Number(it.quantity) || 1) }));
      state.lists.set(id, { id, name: body.name.slice(0, 255), active: true, customerId: owner.id, employeeId: who === "dealer-junior" ? employee.id : null, createdAt: now(), items });
      return { status: 201, body: {} };
    }
    if (key === "DELETE shopping-list") {
      for (const id of body.ids ?? []) state.lists.delete(id);
      return { status: 204 };
    }
    if (method === "POST" && (m = /^shopping-list\/([0-9a-f]{32})$/.exec(route))) {
      const l = state.lists.get(m[1]);
      return l ? { status: 200, body: listView(l, true) } : { status: 404, error: { status: 404, code: "B2B__SHOPPING_LIST_NOT_FOUND", title: "Shopping list not found" } };
    }
    if (method === "POST" && (m = /^shopping-list\/([0-9a-f]{32})\/add$/.exec(route))) {
      const l = state.lists.get(m[1]);
      if (!l) return { status: 404, error: { status: 404, code: "B2B__SHOPPING_LIST_NOT_FOUND", title: "Shopping list not found" } };
      for (const it of Object.values(body.lineItems ?? {})) {
        const existing = l.items.find((x) => x.productId === it.id);
        if (existing) existing.quantity += Math.max(1, Number(it.quantity) || 1);
        else l.items.push({ id: newId(), productId: it.id, quantity: Math.max(1, Number(it.quantity) || 1) });
      }
      return { status: 204 };
    }
    if (key === "POST shopping-list/line-item/remove") {
      const l = state.lists.get(body.listId);
      if (!l) return { status: 404, error: { status: 404, code: "B2B__SHOPPING_LIST_NOT_FOUND", title: "Shopping list not found" } };
      const ids = new Set(body.ids ?? []);
      l.items = l.items.filter((x) => !ids.has(x.id));
      return { status: 204 };
    }
    if (key === "POST shopping-lists/add-to-cart") {
      for (const id of body.ids ?? []) {
        const l = state.lists.get(id);
        for (const it of l?.items ?? []) ctx.session.cart.set(it.productId, (ctx.session.cart.get(it.productId) ?? 0) + it.quantity);
      }
      return { status: 204 };
    }

    // ---- approvals
    if (key === "POST pending-orders/request") {
      if (who !== "dealer-junior") return { status: 400, error: { status: 400, code: "ORDER_APPROVAL__CAN_NOT_REQUEST_PENDING_ORDER", title: "Not allow to request pending order" } };
      const c = ctx.cart();
      if (!c.lineItems.some((l) => l.type === "product")) return { status: 400, error: { status: 400, code: "ORDER_APPROVAL__CAN_NOT_REQUEST_PENDING_ORDER", title: "Not allow to request pending order" } };
      const po = { id: newId(), state: "pending", amountTotal: c.price.totalPrice, createdAt: now(), updatedAt: null, comment: typeof body.comment === "string" ? body.comment.slice(0, 500) : null };
      state.pending.set(po.id, po);
      ctx.session.cart.clear();
      return { status: 200, body: pendingView(po, {}) };
    }
    if (method === "POST" && (m = /^pending-order\/([0-9a-f]{32})$/.exec(route))) {
      const po = state.pending.get(m[1]);
      return po ? { status: 200, body: pendingView(po, body.associations ?? {}) } : { status: 404, error: { status: 404, code: "ORDER_APPROVAL__PENDING_ORDER_NOT_FOUND", title: "Pending order not found" } };
    }
    if (method === "POST" && (m = /^pending-order\/([0-9a-f]{32})\/(approve|decline)$/.exec(route))) {
      if (!isAdmin) return { status: 403, error: missing("pending_order.approve_decline") };
      const po = state.pending.get(m[1]);
      if (!po) return { status: 404, error: { status: 404, code: "ORDER_APPROVAL__PENDING_ORDER_NOT_FOUND", title: "Pending order not found" } };
      if (po.state !== "pending") return { status: 400, error: { status: 400, code: "ORDER_APPROVAL__PENDING_ORDER_ALREADY_DECIDED", title: "Pending order was already decided" } };
      po.state = m[2] === "approve" ? "approved" : "declined";
      po.updatedAt = now();
      return { status: 204 };
    }
    // Deliberately answers so a BFF leak would show up in the hit log (the BFF must block it).
    if (method === "POST" && /^pending-order\/[0-9a-f]{32}\/checkout\/order$/.test(route)) return { status: 200, body: { id: "order-should-never-exist" } };
    return null;
  }

  /** Cart error Shopware 6.7.16 adds for an employee whose role needs approval (seeded rule: cartCartAmount ≥ 0.01). Exact shape from the instance. */
  const cartErrors = (session) =>
    customers.find((c) => c.id === session.customerId)?.persona === "dealer-junior" && session.cart.size
      ? {
          "order-approval-blocked": {
            message: "Order need to be approved first. Reason: ", code: 0, translatedMessage: "This order's grand total requires review and approval.",
            key: "order-approval-blocked", level: 10, messageKey: "warning.cartCartAmount",
            parameters: { id: md5("b2b_components_approval_rule:junior-buyer-always"), reason: null, amount: 0.01, operator: "approvalRules.condition.operator.>=" },
            block: true, blockResubmit: true,
          },
        }
      : {};

  return { handle, cartErrors, reset: () => { seedLists(); state.pending.clear(); } };
}
