import { expect, test, type Page } from "@playwright/test";
import { bff, mockHits, openPdp, passGate, resetDemo, switchPersona } from "./helpers";
import { juniorEmployee, roleNames, seededList } from "./fixture-data";

// S7–S10 · B2B buying (DEV_GUIDE §9.4) + the no-order negative tests (CLAUDE.md security boundaries).
const usingMock = !process.env.E2E_BASE_URL;
const [A, B] = seededList().items.map((i) => i.productNumber) as [string, string];
const JUNIOR = ["dealer-junior", "Dealer Junior Buyer"] as const;
const ADMIN = ["dealer-admin", "Dealer Admin"] as const;
const ZERO_ID = "0".repeat(32);

test.beforeEach(async ({ page }) => {
  await passGate(page);
  await resetDemo(page);
});

/** Creates a throwaway list through the BFF (as the current persona) and returns its id. */
async function createList(page: Page, name: string): Promise<string> {
  expect((await bff(page, "POST", "shopping-list", { name })).ok()).toBe(true);
  const lists = await (await bff(page, "POST", "shopping-lists", {})).json();
  return lists.elements.find((l: { name: string }) => l.name === name).id;
}
const deleteList = (page: Page, id: string) => bff(page, "DELETE", "shopping-list", { ids: [id] });

async function fillRow(page: Page, i: number, sku: string, qty: number) {
  await page.getByTestId("qo-sku").nth(i).fill(sku);
  await page.getByTestId("qo-qty").nth(i).fill(String(qty));
}

test.describe("S7 · Quick order", () => {
  test("one bad SKU shows a row error, and the good rows are added to the cart", async ({ page }) => {
    await switchPersona(page, ...JUNIOR);
    await page.getByTestId("nav-quick-order").click();
    await expect(page.getByTestId("qo-title")).toBeVisible();
    await fillRow(page, 0, A, 2);
    await fillRow(page, 1, "NOPE-404", 1);
    await fillRow(page, 2, B.toLowerCase(), 3); // case-insensitive lookup
    const rows = page.getByTestId("qo-row");
    await expect(rows.nth(0)).toHaveAttribute("data-status", "ok");
    await expect(rows.nth(1)).toHaveAttribute("data-status", "error");
    await expect(rows.nth(1).getByTestId("qo-row-error")).toContainText('Unknown SKU "NOPE-404"');
    await expect(rows.nth(2)).toHaveAttribute("data-status", "ok");

    await page.getByTestId("qo-add-to-cart").click();
    await expect(page.getByTestId("mini-cart")).toBeVisible();
    await expect(page.getByTestId("qo-message")).toContainText("Added 2 products");
    await expect(page.getByTestId("qo-message")).toContainText("1 row with errors skipped");
    await page.goto("/cart");
    await expect(page.getByTestId("cart-line")).toHaveCount(2);
    await expect(page.locator(`[data-testid="cart-line"][data-sku="${A}"] [data-testid="cart-line-qty"]`)).toHaveValue("2");
    await expect(page.locator(`[data-testid="cart-line"][data-sku="${B}"] [data-testid="cart-line-qty"]`)).toHaveValue("3");
  });

  test("pasted CSV rows load into the grid and can be added to a shopping list", async ({ page }) => {
    await switchPersona(page, ...JUNIOR);
    const name = `E2E quick order ${Date.now()}`;
    const listId = await createList(page, name);
    try {
      await page.goto("/quick-order");
      await page.getByTestId("qo-csv").fill(`SKU,Qty\n${A},4\n${B}\t1\nBAD-SKU-1,2`);
      await page.getByTestId("qo-csv-load").click();
      await expect(page.getByTestId("qo-sku").nth(0)).toHaveValue(A);
      await expect(page.getByTestId("qo-qty").nth(0)).toHaveValue("4");
      await expect(page.getByTestId("qo-row").nth(2)).toHaveAttribute("data-status", "error");
      await expect(page.getByTestId("qo-summary")).toContainText("2 valid products");
      await page.getByTestId("qo-list").selectOption(listId);
      await page.getByTestId("qo-add-to-list").click();
      await expect(page.getByTestId("qo-message")).toContainText(`Added 2 products to "${name}"`);
      await page.goto(`/account/lists/${listId}`);
      await expect(page.getByTestId("list-item")).toHaveCount(2);
      await expect(page.locator(`[data-testid="list-item"][data-sku="${A}"] [data-testid="list-item-qty"]`)).toHaveText("4");
    } finally {
      await deleteList(page, listId);
    }
  });

  test("retail and guest personas get no dealer tools", async ({ page }) => {
    await switchPersona(page, "retail", "Retail Racer");
    await expect(page.getByTestId("b2b-nav")).toHaveCount(0);
    await page.goto("/quick-order");
    await expect(page.getByTestId("b2b-notice")).toContainText("dealer accounts");
    expect((await bff(page, "POST", "shopping-lists", {})).status()).toBe(403);
  });
});

test.describe("S8 · Shopping lists", () => {
  test(`the seeded "${seededList().name}" list adds all ${seededList().items.length} items to the cart`, async ({ page }) => {
    await switchPersona(page, ...JUNIOR);
    await page.getByTestId("nav-lists").click();
    const row = page.locator(`[data-testid="list-row"][data-list-name="${seededList().name}"]`);
    await expect(row.getByTestId("list-count")).toHaveText(`${seededList().items.length} items`);
    await row.getByRole("link").click();
    await expect(page.getByTestId("list-title")).toHaveText(seededList().name);
    await expect(page.getByTestId("list-item")).toHaveCount(seededList().items.length);
    await page.getByTestId("list-add-to-cart").click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByTestId("cart-line")).toHaveCount(seededList().items.length);
    for (const it of seededList().items) {
      await expect(page.locator(`[data-testid="cart-line"][data-sku="${it.productNumber}"] [data-testid="cart-line-qty"]`)).toHaveValue(String(it.quantity));
    }
  });

  test("create a list, add from the PDP, remove the item, delete the list", async ({ page }) => {
    await switchPersona(page, ...JUNIOR);
    const name = `E2E list ${Date.now()}`;
    await page.goto("/account/lists");
    await page.getByTestId("list-new-name").fill(name);
    await page.getByTestId("list-create").click();
    const row = page.locator(`[data-testid="list-row"][data-list-name="${name}"]`);
    await expect(row.getByTestId("list-count")).toHaveText("0 items");
    const href = await row.getByRole("link").getAttribute("href");
    const listId = href!.split("/").pop()!;
    try {
      await openPdp(page, A);
      await page.getByTestId("pdp-list-select").selectOption(listId);
      await page.getByTestId("pdp-list-qty").fill("3");
      await page.getByTestId("pdp-list-add").click();
      await expect(page.getByTestId("pdp-list-done")).toContainText(name);
      await page.goto(`/account/lists/${listId}`);
      await expect(page.getByTestId("list-item")).toHaveCount(1);
      await expect(page.getByTestId("list-item-qty")).toHaveText("3");
      await page.getByTestId("list-item-remove").click();
      await expect(page.getByTestId("list-item")).toHaveCount(0);
      page.once("dialog", (d) => d.accept());
      await page.getByTestId("list-delete").click();
      await expect(page).toHaveURL(/\/account\/lists$/);
      await expect(page.locator(`[data-testid="list-row"][data-list-name="${name}"]`)).toHaveCount(0);
    } finally {
      await deleteList(page, listId);
    }
  });
});

test.describe("S9 · Company and roles", () => {
  test("the Dealer Admin sees employees, roles and permissions", async ({ page }) => {
    await switchPersona(page, ...ADMIN);
    await page.getByTestId("nav-company").click();
    await expect(page.getByTestId("company-title")).toBeVisible();
    const emp = juniorEmployee();
    const row = page.getByTestId("employee-row").filter({ hasText: `${emp.firstName} ${emp.lastName}` });
    await expect(row).toContainText(emp.email);
    await expect(row.getByTestId("employee-role")).toHaveText("Junior Buyer");
    for (const r of roleNames()) await expect(page.locator(`[data-testid="role-row"][data-role="${r}"]`)).toBeVisible();
    await expect(page.locator('[data-testid="role-row"][data-role="Admin"]')).toContainText("pending order");
  });

  test("the Junior Buyer sees restricted menus and cannot read the company", async ({ page }) => {
    await switchPersona(page, ...JUNIOR);
    await expect(page.getByTestId("b2b-nav")).toBeVisible();
    await expect(page.getByTestId("nav-company")).toHaveCount(0);
    await expect(page.getByTestId("nav-approvals")).toHaveText("My requests");
    await page.goto("/account/company");
    await expect(page.getByTestId("b2b-notice")).toContainText("Your role cannot view company employees and roles");
    // Shopware itself enforces the permission too (employee.read): the BFF passes the 403 through.
    expect((await bff(page, "GET", "employee")).status()).toBe(403);
  });
});

test.describe("S10 · Approval loop", () => {
  async function submitCart(page: Page, comment: string) {
    await switchPersona(page, ...JUNIOR);
    const prod = await (await bff(page, "POST", "product", { filter: [{ type: "equalsAny", field: "productNumber", value: [A, B] }] })).json();
    const items = prod.elements.map((p: { id: string }) => ({ id: p.id, referencedId: p.id, type: "product", quantity: 2 }));
    expect((await bff(page, "POST", "checkout/cart/line-item", { items })).ok()).toBe(true);
    await page.goto("/cart");
    await expect(page.getByTestId("approval-required")).toBeVisible();
    await page.getByTestId("approval-comment").fill(comment);
    await page.getByTestId("submit-for-approval").click();
    await expect(page).toHaveURL(/\/account\/approvals\?requested=1$/);
    await expect(page.getByTestId("approval-submitted")).toBeVisible();
    const row = page.getByTestId("approval-row").first();
    await expect(row).toHaveAttribute("data-state", "pending");
    return (await row.getAttribute("data-id"))!;
  }

  test("Junior submits for approval; the Admin approves one request and declines another; no order is created", async ({ page }) => {
    const first = await submitCart(page, "Restock for Saturday");
    await expect(page.getByTestId("decide")).toHaveCount(0); // the Junior cannot decide
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
    const second = await submitCart(page, "Second request");

    await switchPersona(page, ...ADMIN);
    await page.getByTestId("nav-approvals").click();
    await expect(page.getByTestId("approvals-title")).toHaveText("Approvals");
    const r1 = page.locator(`[data-testid="approval-row"][data-id="${first}"]`);
    const r2 = page.locator(`[data-testid="approval-row"][data-id="${second}"]`);
    await expect(r1).toHaveAttribute("data-state", "pending");
    await expect(r1).toContainText(juniorEmployee().firstName);
    await r1.getByTestId("decide-comment").fill("OK for Saturday");
    await r1.getByTestId("decide-approve").click();
    await expect(r1).toHaveAttribute("data-state", "approved");
    await r2.getByTestId("decide-decline").click();
    await expect(r2).toHaveAttribute("data-state", "declined");
    await expect(page.getByTestId("decide")).toHaveCount(0);

    // The Junior sees the outcome under My requests.
    await switchPersona(page, ...JUNIOR);
    await page.goto("/account/approvals");
    await expect(page.locator(`[data-testid="approval-row"][data-id="${first}"]`)).toHaveAttribute("data-state", "approved");
    await expect(page.locator(`[data-testid="approval-row"][data-id="${second}"]`)).toHaveAttribute("data-state", "declined");

    // Neither request turned into an order.
    for (const id of [first, second]) {
      const po = await (await bff(page, "POST", `pending-order/${id}`, {})).json();
      expect(po.orderId ?? null).toBeNull();
    }
  });

  test("approval-request is Junior-only and approve/decline is Admin-only (BFF)", async ({ page }) => {
    await switchPersona(page, ...ADMIN);
    const adminReq = await bff(page, "POST", "pending-orders/request", {});
    expect(adminReq.status()).toBe(403);
    await switchPersona(page, ...JUNIOR);
    for (const d of ["approve", "decline"]) {
      const r = await bff(page, "POST", `pending-order/${ZERO_ID}/${d}`, {});
      expect(r.status(), d).toBe(403);
      expect((await r.json()).errors[0].code).toBe("DEMO__ROUTE_DENIED");
    }
    await switchPersona(page, "retail", "Retail Racer");
    expect((await bff(page, "POST", "pending-orders/request", {})).status()).toBe(403);
  });

  test("Reset demo clears the tracked requests", async ({ page }) => {
    await submitCart(page, "to be reset");
    await resetDemo(page);
    await switchPersona(page, ...JUNIOR);
    await page.goto("/account/approvals");
    await expect(page.getByTestId("approvals-empty")).toBeVisible();
  });
});

test.describe("Negative · no order can be created", () => {
  test("every order-creating route is blocked for every persona, including converting an approved request", async ({ page }) => {
    // A real pending order to try to convert.
    await switchPersona(page, ...JUNIOR);
    const prod = await (await bff(page, "POST", "product", { filter: [{ type: "equals", field: "productNumber", value: A }] })).json();
    await bff(page, "POST", "checkout/cart/line-item", { items: [{ id: prod.elements[0].id, referencedId: prod.elements[0].id, type: "product", quantity: 1 }] });
    const req = await (await bff(page, "POST", "pending-orders/request", {})).json();
    await switchPersona(page, ...ADMIN);
    expect((await bff(page, "POST", `pending-order/${req.id}/approve`, {})).ok()).toBe(true);

    for (const [key, label] of [["guest", "Guest"], ["retail", "Retail Racer"], ADMIN, JUNIOR] as const) {
      await switchPersona(page, key, label);
      for (const path of ["checkout/order", `pending-order/${req.id}/checkout/order`, `quote/${ZERO_ID}/order`, "order/" + ZERO_ID + "/return"]) {
        const r = await bff(page, "POST", path, {});
        expect(r.status(), `${key} ${path}`).toBe(403);
      }
    }
    if (usingMock) {
      const hits = await mockHits(page.request);
      expect(hits.filter((h) => /(^|\/)checkout\/order|\/order$|\/return$/.test(h.route))).toEqual([]);
    }
  });
});
