import { expect, test, type Page } from "@playwright/test";
import { bff, openPdp, passGate, resetDemo } from "./helpers";
import { allowedSkus, fitmentIndex, fitmentOf, inTopCategory, universalSkus } from "./fixture-data";

// S6 · Shop by vehicle (DEV_GUIDE §8): YMM selector, My Garage, PLP/search filtering, PDP badge + table.
const V = { make: "Chevrolet", key: "CHE-MALIBU-1978-1983", year: 1980, label: "1980 Chevrolet Malibu" };
const V2 = { make: "Ford", key: Object.keys(fitmentIndex.vehicles).find((k) => fitmentIndex.vehicles[k]!.make === "Ford")! };
const TOP = "Shocks";

async function openGarage(page: Page) {
  const panel = page.getByTestId("garage-panel");
  if (!(await panel.isVisible())) await page.getByTestId("garage-toggle").click();
  await expect(panel).toBeVisible();
  return panel;
}

/** Fitment-index IDs are the seeded product IDs (stableId), so PDPs can be opened directly. */
async function openPdpById(page: Page, id: string, sku: string) {
  await page.goto(`/p/${id}`);
  await expect(page.getByTestId("pdp")).toHaveAttribute("data-sku", sku);
}

async function addVehicle(page: Page, make: string, key: string, year: number) {
  const panel = await openGarage(page);
  await panel.getByTestId("ymm-make").selectOption(make);
  await panel.getByTestId("ymm-model").selectOption(key);
  await panel.getByTestId("ymm-year").selectOption(String(year));
  await panel.getByTestId("ymm-add").click();
  await expect(page.getByTestId("garage-toggle")).toContainText(`${year} ${make}`);
}

async function openTopCategory(page: Page) {
  await page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: TOP }).click();
  await expect(page.getByTestId("plp-title")).toHaveText(TOP);
}
const totalOf = async (page: Page) => Number((await page.getByTestId("listing-total").innerText()).split(" ")[0]);
const cardSkus = (page: Page) => page.locator('[data-testid="product-card"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-sku")!));

test.beforeEach(async ({ page }) => {
  await passGate(page);
  await resetDemo(page);
});

test.describe("S6 · Shop by vehicle", () => {
  test("selecting a vehicle narrows the PLP to fitting + universal parts; counts match the fitment index; Clear restores", async ({ page }) => {
    await openTopCategory(page);
    const all = await totalOf(page);
    expect(all).toBe(inTopCategory(TOP).length);
    await expect(page.getByTestId("fitment-bar")).toHaveCount(0);

    await addVehicle(page, V.make, V.key, V.year);
    await expect(page.getByTestId("fitment-bar")).toContainText(`Showing parts that fit ${V.label}`);
    const allowed = allowedSkus(V.key, V.year);
    const expected = inTopCategory(TOP).filter((s) => allowed.has(s)).length;
    expect(expected).toBeLessThan(all);
    await expect(page.getByTestId("listing-total")).toHaveText(new RegExp(`^${expected} product`));
    for (const sku of await cardSkus(page)) expect(allowed.has(sku), sku).toBe(true);
    await expect(page.getByTestId("fit-chip").first()).toBeVisible();

    await page.getByTestId("fitment-clear").click();
    await expect(page.getByTestId("fitment-bar")).toHaveCount(0);
    await expect(page.getByTestId("listing-total")).toHaveText(new RegExp(`^${all} product`));
    // Clearing keeps the vehicle in the garage.
    await openGarage(page);
    await expect(page.getByTestId("garage-item")).toHaveCount(1);
  });

  test("search results are filtered by the active vehicle", async ({ page }) => {
    const unfiltered = await bff(page, "POST", "search", { search: "shock", limit: 100 });
    const allSkus: string[] = (await unfiltered.json()).elements.map((p: { productNumber: string }) => p.productNumber);
    const allowed = allowedSkus(V.key, V.year);
    const expected = allSkus.filter((s) => allowed.has(s)).length;
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(allSkus.length);

    await addVehicle(page, V.make, V.key, V.year);
    await page.goto("/search?search=shock");
    await expect(page.getByTestId("fitment-bar")).toBeVisible();
    await expect(page.getByTestId("listing-total")).toHaveText(new RegExp(`^${expected} product`));
    for (const sku of await cardSkus(page)) expect(allowed.has(sku), sku).toBe(true);
  });

  test("PDP badge and fitment table are correct on 3 sampled products", async ({ page }) => {
    const fitsId = fitmentIndex.byVehicleYear[`${V.key}|${V.year}`]![0]!;
    const fits = fitmentIndex.skuById[fitsId]!;
    const noFit = Object.entries(fitmentIndex.byProduct).find(([, keys]) => !keys.includes(V.key))![0];
    const noFitSku = fitmentIndex.skuById[noFit]!;
    const universal = universalSkus()[0]!;
    const idOf = (sku: string) => Object.keys(fitmentIndex.skuById).find((id) => fitmentIndex.skuById[id] === sku)!;

    // Without a vehicle the badge asks for one; the table is shown for fitment-specific parts.
    await openPdp(page, fits);
    await expect(page.getByTestId("fitment-badge")).toHaveAttribute("data-fit", "unknown");
    await expect(page.getByTestId("fitment-row")).toHaveCount(fitmentOf(fits).length);

    await addVehicle(page, V.make, V.key, V.year);
    // With a vehicle active, search hides non-fitting parts, so open the PDPs directly.
    await openPdpById(page, fitsId, fits);
    await expect(page.getByTestId("fitment-badge")).toHaveAttribute("data-fit", "fits");
    await expect(page.getByTestId("fitment-badge")).toContainText(`Fits your ${V.label}`);
    await expect(page.getByTestId("fitment-row")).toHaveCount(fitmentOf(fits).length);
    await expect(page.locator(`[data-testid="fitment-row"][data-vehicle="${V.key}"]`)).toContainText("Malibu");

    await openPdpById(page, noFit, noFitSku);
    await expect(page.getByTestId("fitment-badge")).toHaveAttribute("data-fit", "no-fit");
    await expect(page.getByTestId("fitment-badge")).toContainText(`Doesn't fit your ${V.label}`);

    await openPdpById(page, idOf(universal), universal);
    await expect(page.getByTestId("fitment-badge")).toHaveAttribute("data-fit", "universal");
    await expect(page.getByTestId("fitment-badge")).toContainText("Universal fit");
    await expect(page.getByTestId("fitment-table")).toHaveCount(0);
  });

  test("the garage persists across reloads, holds up to 3 vehicles, and switching the active vehicle re-filters", async ({ page }) => {
    const ford = fitmentIndex.vehicles[V2.key]!;
    const others = Object.entries(fitmentIndex.vehicles).filter(([k]) => k !== V.key && k !== V2.key).slice(0, 2);
    await addVehicle(page, V.make, V.key, V.year);
    await addVehicle(page, ford.make, V2.key, ford.years[0]);
    for (const [k, v] of others) await addVehicle(page, v.make, k, v.years[1]);

    await page.reload();
    await openGarage(page);
    const items = page.getByTestId("garage-item");
    await expect(items).toHaveCount(3);
    // The oldest (the Malibu) was dropped; the last added is active.
    await expect(page.locator(`[data-testid="garage-item"][data-vehicle="${V.key}|${V.year}"]`)).toHaveCount(0);
    const last = others.at(-1)!;
    await expect(page.locator(`[data-testid="garage-item"][data-vehicle="${last[0]}|${last[1].years[1]}"] [data-testid="garage-select"]`)).toHaveAttribute("aria-pressed", "true");

    // Switch to the Ford: the PLP re-filters for it.
    await page.locator(`[data-testid="garage-item"][data-vehicle="${V2.key}|${ford.years[0]}"] [data-testid="garage-select"]`).click();
    await expect(page.getByTestId("garage-toggle")).toContainText(`${ford.years[0]} Ford`);
    await openTopCategory(page);
    const expected = inTopCategory(TOP).filter((s) => allowedSkus(V2.key, ford.years[0]).has(s)).length;
    await expect(page.getByTestId("listing-total")).toHaveText(new RegExp(`^${expected} product`));

    // Removing the active vehicle stops filtering.
    await openGarage(page);
    await page.locator(`[data-testid="garage-item"][data-vehicle="${V2.key}|${ford.years[0]}"] [data-testid="garage-remove"]`).click();
    await expect(page.getByTestId("fitment-bar")).toHaveCount(0);
    await expect(page.getByTestId("listing-total")).toHaveText(new RegExp(`^${inTopCategory(TOP).length} product`));
  });

  test("the home page hero selector sets the active vehicle", async ({ page }) => {
    await page.goto("/");
    const hero = page.getByTestId("ymm-hero");
    await hero.getByTestId("ymm-make").selectOption(V.make);
    await hero.getByTestId("ymm-model").selectOption(V.key);
    await hero.getByTestId("ymm-year").selectOption(String(V.year));
    await hero.getByTestId("ymm-add").click();
    await expect(page.getByTestId("ymm-hero-active")).toContainText(V.label);
    await expect(page.getByTestId("garage-toggle")).toContainText(V.label);
  });

  test("Reset demo clears the garage", async ({ page }) => {
    await addVehicle(page, V.make, V.key, V.year);
    await resetDemo(page);
    await expect(page.getByTestId("garage-toggle")).toHaveText(/Select vehicle/);
  });

  test("tampered garage cookies and unknown vehicles are rejected", async ({ page, context }) => {
    const url = new URL(page.url()).origin;
    await context.addCookies([
      { name: "garage", value: "NOT-A-VEHICLE|1999,CHE-MALIBU-1978-1983|2030", url },
      { name: "garage_active", value: "NOT-A-VEHICLE|1999", url },
    ]);
    await openTopCategory(page);
    await expect(page.getByTestId("fitment-bar")).toHaveCount(0);
    await expect(page.getByTestId("listing-total")).toHaveText(new RegExp(`^${inTopCategory(TOP).length} product`));
    const res = await page.request.post("/api/garage", {
      data: JSON.stringify({ action: "add", vehicle: "NOT-A-VEHICLE|1999" }),
      headers: { Origin: url, "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const cross = await page.request.post("/api/garage", {
      data: JSON.stringify({ action: "add", vehicle: `${V.key}|${V.year}` }),
      headers: { Origin: "https://evil.example.com", "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    expect(cross.status()).toBe(403);
  });
});
