import { describe, expect, it } from "vitest";
import { buildB2BRules, CORE_RULES, decide, type B2BRoutesFile } from "./allowlist";
import type { ActivePersona } from "@/lib/personas";

const ALL: ActivePersona[] = ["guest", "retail", "dealer-admin", "dealer-junior"];

// Synthetic route templates for testing rule mechanics only. They are NOT real Shopware B2B routes;
// real ones come from discovery (CLAUDE.md).
const discovered: B2BRoutesFile = {
  status: "discovered",
  routes: [
    { id: "approval.request", method: "POST", path: "test-b2b/approval-request", kind: "approval-request" },
    { id: "approval.approve", method: "POST", path: "test-b2b/approval/{id}/approve", kind: "approval-decide" },
    { id: "approval.decline", method: "POST", path: "test-b2b/approval/{id}/decline", kind: "approval-decide" },
    { id: "lists", method: "POST", path: "test-b2b/lists", kind: "read" },
  ],
};
const rules = [...CORE_RULES, ...buildB2BRules(discovered)];

describe("BFF allowlist", () => {
  it("denies order creation for every persona", () => {
    for (const p of ALL) {
      for (const path of ["checkout/order", "checkout/order/abc", "handle-payment", "account/login", "account/register"]) {
        const d = decide("POST", path, p, rules);
        expect(d.allowed, `${p} ${path}`).toBe(false);
        if (!d.allowed) expect(d.status).toBe(403);
      }
    }
  });

  it("denies unknown routes and wrong methods by default", () => {
    expect(decide("POST", "some/unknown", "dealer-admin", rules).allowed).toBe(false);
    expect(decide("DELETE", "account/customer", "retail", rules).allowed).toBe(false);
    expect(decide("PATCH", "context", "retail", rules).allowed).toBe(false);
    expect(decide("GET", "product-listing/abc", "guest", rules).allowed).toBe(false);
  });

  it("allows core catalog and cart routes for everyone", () => {
    for (const p of ALL) {
      expect(decide("POST", "product-listing/0123456789abcdef0123456789abcdef", p, rules).allowed).toBe(true);
      expect(decide("POST", "checkout/cart/line-item", p, rules).allowed).toBe(true);
      expect(decide("GET", "checkout/cart", p, rules).allowed).toBe(true);
    }
  });

  it("restricts account/customer to logged-in personas", () => {
    expect(decide("GET", "account/customer", "guest", rules).allowed).toBe(false);
    expect(decide("GET", "account/customer", "retail", rules).allowed).toBe(true);
  });

  it("allows approval-request only for dealer-junior", () => {
    for (const p of ALL) expect(decide("POST", "test-b2b/approval-request", p, rules).allowed).toBe(p === "dealer-junior");
  });

  it("allows approve/decline only for dealer-admin", () => {
    for (const p of ALL) {
      expect(decide("POST", "test-b2b/approval/abc123/approve", p, rules).allowed).toBe(p === "dealer-admin");
      expect(decide("POST", "test-b2b/approval/abc123/decline", p, rules).allowed).toBe(p === "dealer-admin");
    }
  });

  it("restricts B2B read routes to B2B personas", () => {
    expect(decide("POST", "test-b2b/lists", "retail", rules).allowed).toBe(false);
    expect(decide("POST", "test-b2b/lists", "dealer-junior", rules).allowed).toBe(true);
  });

  it("adds no B2B rules until discovery has run", () => {
    expect(buildB2BRules({ status: "pending-discovery", routes: discovered.routes })).toEqual([]);
  });

  it("refuses B2B config that would re-allow a hard-denied route", () => {
    expect(() =>
      buildB2BRules({ status: "discovered", routes: [{ id: "x", method: "POST", path: "/store-api/checkout/order", kind: "approval-request" }] }),
    ).toThrow(/hard-deny/);
  });

  it("refuses malformed templates", () => {
    expect(() => buildB2BRules({ status: "discovered", routes: [{ id: "x", method: "POST", path: "a/../b", kind: "read" }] })).toThrow();
  });
});
