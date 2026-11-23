import { expect, test } from "@playwright/test";
import { addFromPdp, openPdp, passGate, resetDemo, switchPersona, usd } from "./helpers";
import { dealerAt, mapSkus, product, series, seriesMembers } from "./fixture-data";

// S1–S5 (DEV_GUIDE §3). Against the mock by default; against a deployment with E2E_BASE_URL.
const SKU = "VRD-SM-A-1001"; // tiered, Series A (front shock), not MAP
const [SERIES_A, SERIES_B] = seriesMembers("A") as [string, string]; // front + rear of the same series
const MAP_SKU = mapSkus().find((s) => s === "VRD-SM-X-1103") ?? mapSkus()[0]!;

test.beforeEach(async ({ page }) => {
  await passGate(page);
  await resetDemo(page);
});

test.describe("S1 · Retail vs Your price on the PDP", () => {
  test("Retail sees only the retail price", async ({ page }) => {
    await switchPersona(page, "retail", "Retail Racer");
    await openPdp(page, SKU);
    await expect(page.getByTestId("price-unit")).toHaveText(usd(product(SKU).price.gross));
    await expect(page.getByTestId("price-list")).toHaveCount(0);
    await expect(page.getByText("Your price")).toHaveCount(0);
    await expect(page.getByTestId("tier-table")).toHaveCount(0);
  });

  test("Dealer sees retail struck through plus Your price", async ({ page }) => {
    await switchPersona(page, "dealer-admin", "Dealer Admin");
    await openPdp(page, SKU);
    await expect(page.getByTestId("price-list")).toHaveText(usd(product(SKU).price.gross));
    await expect(page.getByTestId("price-unit")).toHaveText(usd(dealerAt(SKU, 1)));
    await expect(page.getByTestId("price-block").getByText("Your price")).toBeVisible();
  });
});

test.describe("S2 · PLP shows the persona's price", () => {
  for (const [key, label, expected] of [
    ["retail", "Retail Racer", () => product(SKU).price.gross],
    ["dealer-admin", "Dealer Admin", () => dealerAt(SKU, 1)],
  ] as const) {
    test(`${label} card price on the category listing`, async ({ page }) => {
      await switchPersona(page, key, label);
      await page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: product(SKU).categoryPath[0] }).click();
      await expect(page.getByTestId("plp-title")).toHaveText(product(SKU).categoryPath[0]!);
      const card = page.locator(`[data-testid="product-card"][data-sku="${SKU}"]`);
      await expect(card.getByTestId("price-unit")).toHaveText(usd(expected()));
      await expect(card.getByText(`SKU ${SKU}`)).toBeVisible();
    });
  }
});

test.describe("S3 · Quantity tiers", () => {
  test("Dealer PDP shows the tier table from calculatedPrices", async ({ page }) => {
    await switchPersona(page, "dealer-admin", "Dealer Admin");
    await openPdp(page, SKU);
    const rows = page.getByTestId("tier-row");
    const tiers = product(SKU).demo.dealerTiers;
    await expect(rows).toHaveCount(tiers.length);
    for (const [i, t] of tiers.entries()) await expect(rows.nth(i)).toContainText(usd(t.gross));
    await expect(rows.last()).toContainText(`${tiers.at(-1)!.minQty}+`);
  });

  test("Cart re-prices when quantity crosses each break", async ({ page }) => {
    await switchPersona(page, "dealer-admin", "Dealer Admin");
    await addFromPdp(page, SKU, 4);
    await page.goto("/cart");
    const line = page.locator(`[data-testid="cart-line"][data-sku="${SKU}"]`);
    await expect(line.getByTestId("cart-line-unit")).toHaveText(usd(dealerAt(SKU, 4)));
    await expect(line.getByTestId("cart-line-sku")).toHaveText(`SKU ${SKU}`);
    for (const qty of [5, 10, 25]) {
      const qtyInput = line.getByTestId("cart-line-qty");
      await qtyInput.fill(String(qty));
      await qtyInput.press("Enter");
      await expect(line.getByTestId("cart-line-unit")).toHaveText(usd(dealerAt(SKU, qty)));
      await expect(line.getByTestId("cart-line-total")).toHaveText(usd(Math.round(dealerAt(SKU, qty) * qty * 100) / 100));
    }
  });
});

test.describe("S4 · Cross-SKU series tiers", () => {
  const tier10 = series("A").tiers.find((t) => t.minQty === 10)!;

  test("5 × A + 5 × B shows the series savings line", async ({ page }) => {
    await switchPersona(page, "dealer-admin", "Dealer Admin");
    await addFromPdp(page, SERIES_A, 5);
    await addFromPdp(page, SERIES_B, 5);
    await page.goto("/cart");
    const savings = page.getByTestId("series-savings");
    await expect(savings).toHaveCount(1);
    await expect(savings).toContainText("10+ tier");
    // discount = pct × value of the 10 series units (all at their qty-5 price)
    const base = 5 * dealerAt(SERIES_A, 5) + 5 * dealerAt(SERIES_B, 5);
    await expect(page.getByTestId("series-savings-amount")).toHaveText(usd(-Math.round(base * tier10.discountPct) / 100));
  });

  test("4 × A + 5 × B does not", async ({ page }) => {
    await switchPersona(page, "dealer-admin", "Dealer Admin");
    await addFromPdp(page, SERIES_A, 4);
    await addFromPdp(page, SERIES_B, 5);
    await page.goto("/cart");
    await expect(page.getByTestId("cart-line")).toHaveCount(2);
    await expect(page.getByTestId("series-savings")).toHaveCount(0);
  });

  test("25 mixed items switch to the 25+ tier (tiers do not stack)", async ({ page }) => {
    await switchPersona(page, "dealer-admin", "Dealer Admin");
    await addFromPdp(page, SERIES_A, 13);
    await addFromPdp(page, SERIES_B, 12);
    await page.goto("/cart");
    await expect(page.getByTestId("series-savings")).toHaveCount(1);
    await expect(page.getByTestId("series-savings")).toContainText("25+ tier");
  });

  test("Retail gets no series savings", async ({ page }) => {
    await switchPersona(page, "retail", "Retail Racer");
    await addFromPdp(page, SERIES_A, 5);
    await addFromPdp(page, SERIES_B, 5);
    await page.goto("/cart");
    await expect(page.getByTestId("series-savings")).toHaveCount(0);
  });
});

test.describe("S5 · MAP", () => {
  test("Retail: price hidden on PLP and PDP, real price in cart", async ({ page }) => {
    await switchPersona(page, "retail", "Retail Racer");
    const p = product(MAP_SKU);
    await page.goto(`/search?search=${MAP_SKU}`);
    const card = page.locator(`[data-testid="product-card"][data-sku="${MAP_SKU}"]`);
    await expect(card.getByTestId("price-map")).toHaveText("See price in cart");
    await expect(card.getByTestId("price-unit")).toHaveCount(0);

    await openPdp(page, MAP_SKU);
    await expect(page.getByTestId("price-map")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(usd(p.price.gross));

    await page.getByTestId("add-to-cart").click();
    await expect(page.getByTestId("mini-cart")).toContainText(usd(p.price.gross));
    await page.goto("/cart");
    await expect(page.locator(`[data-testid="cart-line"][data-sku="${MAP_SKU}"]`).getByTestId("cart-line-unit")).toHaveText(usd(p.price.gross));
  });

  test("Dealer always sees the price", async ({ page }) => {
    await switchPersona(page, "dealer-admin", "Dealer Admin");
    await openPdp(page, MAP_SKU);
    await expect(page.getByTestId("price-map")).toHaveCount(0);
    await expect(page.getByTestId("price-unit")).toHaveText(usd(dealerAt(MAP_SKU, 1)));
  });
});

test.describe("PLP UX carried over from DMS feedback", () => {
  test("add to cart opens the mini-cart drawer without leaving the page", async ({ page }) => {
    await switchPersona(page, "retail", "Retail Racer");
    await page.goto(`/search?search=${SKU}`);
    const url = page.url();
    await page.locator(`[data-testid="product-card"][data-sku="${SKU}"]`).getByTestId("add-to-cart").click();
    await expect(page.getByTestId("mini-cart")).toBeVisible();
    await expect(page.getByTestId("mini-cart")).toContainText(`SKU ${SKU}`);
    expect(page.url()).toBe(url);
    await expect(page.getByTestId("cart-count")).toHaveText("1");
  });

  test("Quick view shows the price block and adds to cart", async ({ page }) => {
    await switchPersona(page, "dealer-admin", "Dealer Admin");
    await page.goto(`/search?search=${SKU}`);
    await page.locator(`[data-testid="product-card"][data-sku="${SKU}"]`).getByTestId("quick-view-open").click();
    const qv = page.getByTestId("quick-view");
    await expect(qv).toBeVisible();
    await expect(qv.getByTestId("price-unit")).toHaveText(usd(dealerAt(SKU, 1)));
    await expect(qv.getByTestId("tier-table")).toBeVisible();
    await qv.getByTestId("add-to-cart").click();
    await expect(page.getByTestId("mini-cart")).toBeVisible();
  });

  test("search suggestions link to the PDP", async ({ page }) => {
    await page.getByTestId("search-input").fill(SKU);
    await page.getByTestId("search-suggest").getByRole("link").first().click();
    await expect(page.getByTestId("pdp")).toHaveAttribute("data-sku", SKU);
  });
});
