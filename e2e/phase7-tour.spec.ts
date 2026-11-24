import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { passGate, resetDemo } from "./helpers";
import { allowedSkus, dealerAt, inTopCategory, product, seededList } from "./fixture-data";

// Phase 7 "Done when": a presenter can run S1–S10 in ≤ 15 minutes on desktop and tablet.
// This spec runs the whole tour through the UI only (tour buttons, tour bar, page controls), checks each
// step's expected result, and times it. TOUR_SCREENSHOTS=1 saves one screenshot per step to artifacts/tour/
// (or TOUR_SCREENSHOTS=<dir>; `npm run tour:screenshots` writes docs/tour/).
type Run = { label: string; persona: string; target: { type: string; sku?: string; path?: string[]; name?: string; href?: string }; setup?: { cart?: { sku: string; qty: number }[]; vehicle?: string } };
type Step = { id: string; title: string; minutes: number; runs: Run[] };
// Expectations come from the same file the app renders.
const steps = (JSON.parse(readFileSync(new URL("../data/tour.json", import.meta.url), "utf8")) as { steps: Step[] }).steps;
const step = (id: string) => steps.find((s) => s.id === id)!;
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const BUDGET_MS = 15 * 60 * 1000;

test.setTimeout(5 * 60 * 1000);

async function shot(page: Page, name: string) {
  const target = process.env.TOUR_SCREENSHOTS;
  if (!target) return;
  const dir = `${target === "1" ? "artifacts/tour" : target}/${test.info().project.name}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
}
const bar = (page: Page) => page.getByTestId("tour-bar");
async function atStep(page: Page, id: string) {
  await expect(bar(page)).toHaveAttribute("data-step", id, { timeout: 20_000 });
  await expect(page.getByTestId("page-loading")).toHaveCount(0);
}
const next = async (page: Page) => bar(page).getByTestId("tour-next").click();
const alt = async (page: Page, id: string, i: number) => bar(page).getByTestId(`tour-run-${id}-${i}`).click();

test("the presenter runs S1–S10 end to end within the time budget", async ({ page }) => {
  const started = Date.now();
  await passGate(page);
  await resetDemo(page);
  await page.goto("/tour");
  await expect(page.getByTestId("tour-step")).toHaveCount(10);
  await shot(page, "00-tour");
  await page.getByTestId("tour-start").click();

  // S1 · Retail vs Your price
  const s1 = step("S1").runs[0]!.target.sku!;
  await atStep(page, "S1");
  await expect(page.getByTestId("pdp")).toHaveAttribute("data-sku", s1);
  await expect(page.getByTestId("persona-current")).toHaveText("Retail Racer");
  await expect(page.getByTestId("price-unit")).toHaveText(usd(product(s1).price.gross));
  await expect(page.getByTestId("price-list")).toHaveCount(0);
  await alt(page, "S1", 1);
  await expect(page.getByTestId("persona-current")).toHaveText("Dealer Admin");
  await expect(page.getByTestId("price-list")).toHaveText(usd(product(s1).price.gross));
  await expect(page.getByTestId("price-unit")).toHaveText(usd(dealerAt(s1, 1)));
  await shot(page, "S1");

  // S2 · PLP shows the persona's price
  await next(page);
  await atStep(page, "S2");
  await expect(page.getByTestId("plp-title")).toHaveText(step("S2").runs[0]!.target.path!.at(-1)!);
  await expect(page.locator(`[data-testid="product-card"][data-sku="${s1}"] [data-testid="price-unit"]`)).toHaveText(usd(dealerAt(s1, 1)));
  await shot(page, "S2");

  // S3 · Quantity tiers (cart staged at 4; the presenter steps to 5)
  await next(page);
  await atStep(page, "S3");
  const s3 = step("S3").runs[0]!.setup!.cart![0]!;
  const line = page.locator(`[data-testid="cart-line"][data-sku="${s3.sku}"]`);
  await expect(line.getByTestId("cart-line-unit")).toHaveText(usd(dealerAt(s3.sku, s3.qty)));
  await line.getByTestId("cart-line-qty").fill("5");
  await line.getByTestId("cart-line-qty").press("Enter");
  await expect(line.getByTestId("cart-line-unit")).toHaveText(usd(dealerAt(s3.sku, 5)));
  await shot(page, "S3");

  // S4 · Series mix and match (cart staged 5 + 5)
  await next(page);
  await atStep(page, "S4");
  await expect(page.getByTestId("cart-line")).toHaveCount(2);
  await expect(page.getByTestId("series-savings")).toContainText("10+ tier");
  await shot(page, "S4");

  // S5 · MAP: hidden on the PDP for Retail, real price in the cart
  await next(page);
  await atStep(page, "S5");
  const map = step("S5").runs[0]!.target.sku!;
  await expect(page.getByTestId("persona-current")).toHaveText("Retail Racer");
  await expect(page.getByTestId("price-map")).toHaveText("See price in cart");
  await shot(page, "S5");
  await alt(page, "S5", 1);
  await expect(page.locator(`[data-testid="cart-line"][data-sku="${map}"] [data-testid="cart-line-unit"]`)).toHaveText(usd(product(map).price.gross));

  // S6 · Shop by vehicle
  await next(page);
  await atStep(page, "S6");
  const [vkey, vyear] = step("S6").runs[0]!.setup!.vehicle!.split("|") as [string, string];
  await expect(page.getByTestId("fitment-bar")).toBeVisible();
  await expect(page.getByText("Demo catalog", { exact: false })).toHaveCount(0); // navigation root never shown
  const top = step("S6").runs[0]!.target.path![0]!;
  const expected = inTopCategory(top).filter((s) => allowedSkus(vkey, Number(vyear)).has(s)).length;
  await expect(page.getByTestId("listing-total")).toHaveText(new RegExp(`^${expected} product`));
  await shot(page, "S6");

  // S7 · Quick order (one bad SKU)
  await next(page);
  await atStep(page, "S7");
  const [qa, qb] = seededList().items.map((i) => i.productNumber) as [string, string];
  await page.getByTestId("qo-sku").nth(0).fill(qa);
  await page.getByTestId("qo-sku").nth(1).fill("NOPE-404");
  await page.getByTestId("qo-sku").nth(2).fill(qb);
  await expect(page.getByTestId("qo-row").nth(1)).toHaveAttribute("data-status", "error");
  await expect(page.getByTestId("qo-row").nth(2)).toHaveAttribute("data-status", "ok");
  await page.getByTestId("qo-add-to-cart").click();
  await expect(page.getByTestId("mini-cart")).toBeVisible();
  await shot(page, "S7");
  await page.getByRole("button", { name: "Close", exact: true }).click();

  // S8 · Shopping list
  await next(page);
  await atStep(page, "S8");
  await expect(page.getByTestId("list-title")).toHaveText(seededList().name);
  await expect(page.getByTestId("list-item")).toHaveCount(seededList().items.length);
  await shot(page, "S8");

  // S9 · Company (Admin), then the Junior's restricted view
  await next(page);
  await atStep(page, "S9");
  await expect(page.getByTestId("employee-row").first()).toBeVisible();
  await shot(page, "S9");
  await alt(page, "S9", 1);
  await expect(page.getByTestId("b2b-notice")).toBeVisible();
  await expect(page.getByTestId("nav-company")).toHaveCount(0);

  // S10 · Approval loop
  await next(page);
  await atStep(page, "S10");
  await expect(page.getByTestId("approval-required")).toBeVisible();
  await page.getByTestId("submit-for-approval").click();
  await expect(page.getByTestId("approval-row").first()).toHaveAttribute("data-state", "pending");
  await alt(page, "S10", 1);
  await expect(page.getByTestId("approvals-title")).toHaveText("Approvals");
  const row = page.getByTestId("approval-row").first();
  await row.getByTestId("decide-approve").click();
  await expect(row).toHaveAttribute("data-state", "approved");
  await shot(page, "S10");
  await expect(bar(page).getByTestId("tour-done")).toBeVisible();

  const elapsed = Date.now() - started;
  test.info().annotations.push({ type: "tour-duration", description: `${(elapsed / 1000).toFixed(1)} s (automated clicks; presenter talk time is planned in data/tour.json)` });
  expect(elapsed).toBeLessThan(BUDGET_MS);
  const planned = steps.reduce((n, s) => n + s.minutes, 0);
  expect(planned).toBeLessThanOrEqual(15);
});

test("the tour bar can be exited and the tour page lists every step", async ({ page }) => {
  await passGate(page);
  await resetDemo(page);
  await page.goto("/tour");
  for (const s of steps) await expect(page.locator(`[data-testid="tour-step"][data-step="${s.id}"] [data-testid="tour-points"] li`)).toHaveCount(3);
  await page.getByTestId("tour-run-S8-0").click();
  await atStep(page, "S8");
  await bar(page).getByTestId("tour-exit").click();
  await expect(bar(page)).toHaveCount(0);
});

test("pages fit the viewport without horizontal scrolling", async ({ page }) => {
  await passGate(page);
  await resetDemo(page);
  for (const path of ["/", "/tour", "/search?search=shock", "/cart"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
