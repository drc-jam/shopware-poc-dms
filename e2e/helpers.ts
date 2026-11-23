import { expect, type APIRequestContext, type Page } from "@playwright/test";
// @ts-expect-error plain ESM helper without types
import { MOCK_PORT, testEnv } from "./test-env.mjs";

export const DEMO_PASSWORD: string = process.env.E2E_DEMO_PASSWORD ?? testEnv.DEMO_PASSWORD;
export const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

export async function passGate(page: Page) {
  await page.goto("/gate");
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Enter demo" }).click();
  await expect(page.getByTestId("persona-switcher")).toBeVisible();
}

export async function switchPersona(page: Page, key: "guest" | "retail" | "dealer-admin" | "dealer-junior", label: string) {
  await page.getByTestId(`persona-${key}`).click();
  await expect(page.getByTestId("persona-current")).toHaveText(label);
}

/** BFF call with a same-origin Origin header (as a browser fetch would send). */
export function bff(page: Page, method: string, path: string, data?: unknown, origin?: string) {
  const base = new URL(page.url()).origin;
  return page.request.fetch(`/api/sw/${path}`, {
    method,
    data: data === undefined ? undefined : JSON.stringify(data),
    headers: { Origin: origin ?? base, "Content-Type": "application/json" },
    failOnStatusCode: false,
  });
}

export async function mockHits(request: APIRequestContext): Promise<{ method: string; route: string }[]> {
  return (await request.get(`${MOCK_URL}/__mock/hits`)).json();
}

/** Clears every persona's cart and the garage (same as the Reset button, without the confirm dialog). */
export async function resetDemo(page: Page) {
  const base = new URL(page.url()).origin;
  const res = await page.request.post("/api/persona", {
    data: JSON.stringify({ action: "reset" }),
    headers: { Origin: base, "Content-Type": "application/json" },
  });
  expect(res.status()).toBe(200);
  await page.reload();
}

/** Opens a PDP by SKU through the search page (IDs come from the Store API, never computed). */
export async function openPdp(page: Page, sku: string) {
  await page.goto(`/search?search=${encodeURIComponent(sku)}`);
  const card = page.locator(`[data-testid="product-card"][data-sku="${sku}"]`);
  await card.getByRole("link").last().click();
  await expect(page.getByTestId("pdp")).toHaveAttribute("data-sku", sku);
}

export async function addFromPdp(page: Page, sku: string, qty: number) {
  await openPdp(page, sku);
  await page.getByTestId("qty-input").fill(String(qty));
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("mini-cart")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
}

export const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
