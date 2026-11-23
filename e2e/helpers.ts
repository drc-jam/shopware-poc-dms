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
