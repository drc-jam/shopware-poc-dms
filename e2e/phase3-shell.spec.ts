import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bff, mockHits, passGate, switchPersona } from "./helpers";

const usingMock = !process.env.E2E_BASE_URL;
// Order-creating routes recorded by seed:discover from the instance (e.g. the B2B pending-order and quote conversions).
const discoveredOrderRoutes: string[] = (
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../data/b2b-routes.json"), "utf8")).orderCreatingRoutes ?? []
).map((r: { path: string }) => r.path.replace(/\{[^}]+\}/g, "0123456789abcdef0123456789abcdef"));

test.describe("demo gate", () => {
  test("redirects to /gate and blocks the API without the cookie", async ({ page }) => {
    await page.goto("/c/abc");
    await expect(page).toHaveURL(/\/gate\?next=%2Fc%2Fabc/);
    const api = await page.request.get("/api/sw/context", { failOnStatusCode: false });
    expect(api.status()).toBe(401);
  });

  test("rejects a wrong password and accepts the right one", async ({ page }) => {
    await page.goto("/gate");
    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: "Enter demo" }).click();
    await expect(page.getByTestId("gate-error")).toBeVisible();
    await passGate(page);
    await expect(page.getByTestId("persona-current")).toHaveText("Guest");
  });

  test("returns to the requested page after the gate", async ({ page }) => {
    await page.goto("/cart");
    await expect(page).toHaveURL(/\/gate\?next=%2Fcart/);
    await page.getByLabel("Password").fill(process.env.E2E_DEMO_PASSWORD ?? "e2e-demo-password");
    await page.getByRole("button", { name: "Enter demo" }).click();
    await expect(page).toHaveURL(/\/cart$/);
  });
});

test.describe("persona switcher", () => {
  test.beforeEach(async ({ page }) => passGate(page));

  test("each persona logs in with one click", async ({ page }) => {
    await switchPersona(page, "retail", "Retail Racer");
    await expect(page.getByTestId("persona-who")).toContainText("Jordan Avery");

    await switchPersona(page, "dealer-admin", "Dealer Admin");
    await expect(page.getByTestId("persona-who")).toContainText("Morgan Ellis · Summit Trail Race Shop");

    await switchPersona(page, "dealer-junior", "Dealer Junior Buyer");
    await expect(page.getByTestId("persona-who")).toContainText("Casey Brooks");

    await switchPersona(page, "guest", "Guest");
    await expect(page.getByTestId("persona-error")).toHaveCount(0);
  });

  test("the main navigation renders from the Store API", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Categories" });
    await expect(nav.getByRole("link", { name: "Shocks" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Shop Supplies" })).toBeVisible();
  });

  test("carts persist per persona; reset clears them", async ({ page }) => {
    await switchPersona(page, "retail", "Retail Racer");
    const found = await bff(page, "POST", "search", { search: "VRD-SM-A-1001", limit: 1 });
    const productId = ((await found.json()) as { elements: { id: string }[] }).elements[0]!.id;
    const add = await bff(page, "POST", "checkout/cart/line-item", { items: [{ type: "product", id: productId, referencedId: productId, quantity: 2 }] });
    expect(add.status()).toBe(200);
    await page.reload();
    await expect(page.getByTestId("cart-count")).toHaveText("2");

    await switchPersona(page, "dealer-admin", "Dealer Admin");
    await expect(page.getByTestId("cart-count")).toHaveText("0");

    await switchPersona(page, "retail", "Retail Racer");
    await expect(page.getByTestId("cart-count")).toHaveText("2");

    page.once("dialog", (d) => d.accept());
    await page.getByTestId("persona-reset").click();
    await expect(page.getByTestId("persona-current")).toHaveText("Guest");
    await switchPersona(page, "retail", "Retail Racer");
    await expect(page.getByTestId("cart-count")).toHaveText("0");
  });
});

test.describe("BFF allowlist (negative tests)", () => {
  test.beforeEach(async ({ page }) => passGate(page));

  test("no persona can create an order", async ({ page, request }) => {
    for (const [key, label] of [
      ["guest", "Guest"],
      ["retail", "Retail Racer"],
      ["dealer-admin", "Dealer Admin"],
      ["dealer-junior", "Dealer Junior Buyer"],
    ] as const) {
      if (key !== "guest") await switchPersona(page, key, label);
      for (const path of ["checkout/order", "handle-payment", "account/login", ...discoveredOrderRoutes]) {
        const res = await bff(page, "POST", path, {});
        expect(res.status(), `${key} → ${path}`).toBe(403);
      }
    }
    if (usingMock) {
      const hits = await mockHits(request);
      expect(hits.filter((h) => /(^|\/)checkout\/order|\/order$/.test(h.route))).toEqual([]);
    }
  });

  test("unlisted routes and methods return 403", async ({ page }) => {
    expect((await bff(page, "POST", "some/unknown/route", {})).status()).toBe(403);
    expect((await bff(page, "PATCH", "context", {})).status()).toBe(403);
    expect((await bff(page, "DELETE", "account/customer")).status()).toBe(403);
  });

  test("cross-origin requests are rejected", async ({ page }) => {
    const res = await bff(page, "POST", "checkout/cart/line-item", { items: [] }, "https://evil.example");
    expect(res.status()).toBe(403);
  });

  test("allowlisted routes pass through with no-store", async ({ page }) => {
    const res = await bff(page, "GET", "checkout/cart");
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("routes outside the allowlist stay denied, including unknown B2B-looking paths", async ({ page }) => {
    await switchPersona(page, "dealer-junior", "Dealer Junior Buyer");
    // Not a real Shopware route; anything not in data/b2b-routes.json (or the core rules) must be denied.
    expect((await bff(page, "POST", "b2b/anything", {})).status()).toBe(403);
  });

  test("path traversal and oversized bodies are rejected", async ({ page }) => {
    const big = { blob: "x".repeat(70 * 1024) };
    expect((await bff(page, "POST", "search", big)).status()).toBe(413);
    const trav = await page.request.fetch("/api/sw/%2e%2e/admin", { method: "GET", failOnStatusCode: false });
    expect([400, 403, 404]).toContain(trav.status());
  });
});
