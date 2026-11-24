# shopware-poc-dms: Powersports B2B Demo on Shopware

Shopware POC based on Day Motor Sports (DMS) requirements. The storefront itself uses a neutral fictional brand (see DEV_GUIDE §0).

This is a re-skinnable, neutral-branded racing-parts B2B demo (catalog: performance racing shocks). It is a Next.js App Router app (BFF to the Shopware 6.7 Store API) plus a seeder.
Scope, decisions, and acceptance criteria live in [`DEV_GUIDE.md`](DEV_GUIDE.md). Agent rules are in [`CLAUDE.md`](CLAUDE.md).

**Demo brand:** Full Throttle Supply Co. (fictional), set in `theme/brand.ts` and overridable with `NEXT_PUBLIC_BRAND_NAME`.

## Quick start (no Shopware instance yet)

```bash
npm ci
npm run fixture:validate      # strict schema + business checks on data/fixture/
npm run fixture:review        # regenerate data/fixture/REVIEW.md (shows approval status)
npm test                      # unit tests (fixture checks, BFF allowlist, gate cookie)
npm run build && npm run e2e  # e2e against the mock Store API in e2e/mock-store-api.mjs
```

For local dev against the mock: copy `.env.example` to `.env.local` and use the values from `e2e/test-env.mjs`. Then run `npm run mock:store-api` and `npm run dev`.

## CI

[![CI](https://github.com/drc-jam/shopware-poc-dms/actions/workflows/ci.yml/badge.svg)](https://github.com/drc-jam/shopware-poc-dms/actions/workflows/ci.yml)

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request:
- fixture validation, typecheck, unit tests, build, and the bundle secret scan
- Playwright e2e against the mock Store API, using test-only values from `e2e/test-env.mjs`

No repository secrets are needed. Checks against the real instance (`seed:verify`, e2e against the deployment) are added in Phases 2 and 8.

## Status

| Phase | State | Notes |
| --- | --- | --- |
| 0 · Instance and spikes | **Done** | Evolve 6.7.16.1: all §13 prerequisites met (13.8 confirmed by the owner 2026-11-24). `seed:discover` recorded the B2B routes; spikes and decisions D1–D3 (approved 2026-11-24) in [`artifacts/spikes.md`](artifacts/spikes.md) |
| 1 · Fixture | **Done** | Racing-shocks catalog approved 2026-11-23 (`data/fixture/review-approval.json`, bound to the fixture hash; any edit needs `npm run fixture:approve` again) |
| 2 · Seeder | **Done** | Standalone seeder against Evolve 6.7.16.1: clean apply (155 created, 0 failed), second apply a no-op (0 created), `seed:verify` 16/16 green |
| 3 · App shell | **Done (against mock)** | Gate, BFF + allowlist, persona switcher, brand tokens, header/nav |
| 4 · Catalog and pricing | **Done (against mock)** | S1–S5 e2e green; PLP/PDP/search, PriceBlock, TierTable, MAP, mini-cart, Quick View, cart with series savings |
| 5 · Fitment | **Done (against mock)** | S6 e2e green: YMM selector (header + home hero), My Garage (3 vehicles, cookies validated against the index), PLP/search filtered to fitting + universal parts, PDP badge + fitment table. The real Store API honors the `id` filter (probe: Shocks 40 → 10 for a 1980 Malibu, matching the index) |
| 6 · B2B buying | **Done** | S7–S10 + no-order negative tests green against the mock **and the real Evolve instance** (full suite 47/47 both ways, 2026-11-24): quick order (row errors, CSV paste, add to cart / list), shopping lists (seeded list → 6 cart lines; create / add from PDP / remove / delete), company view (Admin only; Shopware enforces `employee.read` too), approvals (Junior submits, Admin approves / declines; pending IDs tracked in a cookie per D3; never an order) |
| 7 · Tour and polish | **Done** | `/tour` runs S1–S10 with one click per step (persona switch + cart / vehicle staging + deep link) and a presenter bar with the expected result and Next. Planned 14 of 15 min. The full tour passes e2e on desktop and tablet (810×1080, touch) against the mock and the real instance (suite 53/53 both). Loading, error and not-found states; responsive header (phone / tablet / desktop); screenshots in [`docs/tour/`](docs/tour/) |
| 8 · Deploy | Not started | |

### Open items and deviations from the guide

- **Standalone seeder (decided).** The factory repo is not used. `schemas/site-project.demo.schema.json` is the full schema (not an extension), and `stableId(entity, key)` = hex MD5 of `"entity:key"` (DEV_GUIDE §8). The mock Store API already uses the same IDs.
- **Series pricing (Phase 0 decisions D1 + D2, approved 2026-11-24).** Series promotions use a cart rule on total series quantity and discount every series unit (not set groups). Series SKUs carry dealer tiers 1/5 only; the promotion provides the 10/25 breaks, so 10 of one SKU and a 5 + 5 mix price the same and nothing is discounted twice. The mock Store API and S3/S4 e2e follow this.
- **Next 16** renamed `middleware.ts` to `proxy.ts`. The gate lives in `proxy.ts` and behaves as §9.3 describes.
- **Vehicles live in `data/fixture/vehicles.json`** (per the repo layout §5). The validator composes them with `site-project.json` before checking the schema.
- **B2B Store API routes are not hard-coded.** `data/b2b-routes.json` is generated by `seed:discover` from the instance's OpenAPI document (6.7.16.1). It also lists every order-creating route the instance exposes; unit and e2e tests assert the BFF denies all of them (including `pending-order/{id}/checkout/order` and `quote/{id}/order`).
- **Employees use `account/login`** but get 403 on `account/customer`; the app reads identity from `GET context`. That response carries the employee's password hash, so the BFF redacts credential fields from every response (`lib/shopware/redact.ts`).
- **Quick order has no Store API route** on this instance; it is composed app-side (product lookup by `productNumber` + cart add).
- **Pending orders cannot be listed** through the Store API; the BFF records each request ID in the httpOnly `pending_orders` cookie (D3, max 20, cleared by Reset demo) and the Approvals page fetches them one by one.
- **Approval notice in the cart** uses Shopware's own blocking cart error (`order-approval-blocked`, `translatedMessage`), observed on 6.7.16.
- **Running e2e against the real instance locally:** `npm run build`, then start the app with the real `SHOPWARE_*` and `PERSONA_*` env plus any `DEMO_PASSWORD` / `DEMO_COOKIE_SECRET` (`npx next start -p 3200`), then `E2E_BASE_URL=http://127.0.0.1:3200 E2E_DEMO_PASSWORD=<that password> npx playwright test --trace off`. Side effects stay in demo data (carts cleared, test lists deleted, a few pending approvals; never an order).
- **Fitment data is synthetic.** Chassis makes and models are real OEMs (GM, Ford, Mercury), but which parts fit which chassis is invented. The product mix mirrors the prospect's racing-shocks department; no names, prices, text or images are copied.
- **The mock Store API emulates Shopware response shapes and the intended pricing** (`e2e/mock/catalog.mjs`, built from the fixture). Green e2e against the mock proves the app logic, not Shopware's pricing or promotions. `seed:verify` and e2e against the real instance prove those.
- **Placeholder images** in `data/fixture/media/` are generated category illustrations (`tools/make-placeholder-media.mjs`).
- `lib/shopware/types.ts` is hand-written for now. Replace it with `npm run types:generate` in Phase 0.

## Seeder (needs Admin + Store API credentials in `.env.seed` or the environment; local/CI only)

```bash
npm run seed:discover   # read-only: §13 checks, page limit, B2B routes → artifacts/discovery.json + data/b2b-routes.json
npm run seed:init-env   # once: adds persona e-mails, random persona passwords and the sales channel id to .env.seed (values not printed)
npm run seed:plan       # read-only: creates / updates / conflicts per entity → artifacts/seed-plan.json
npm run seed:apply      # writes the demo; ledger → artifacts/seed-ledger.json; also writes data/fitment-index.json
npm run seed:verify     # readback + Store API flows (prices, series, approval, lists, no orders) → artifacts/verify-report.json
npm run fitment:build   # rebuild data/fitment-index.json from the fixture only
npm run spike:phase0    # Phase 0 spikes (SPIKE-tagged records only)
```

`npm run seed:apply -- --replace-demo` deletes every fixture-owned record (and the demo company's runtime pending orders and shopping lists) before applying, then rebuilds from the fixture. It is the only delete path and is never run implicitly; `npm run seed:plan -- --replace-demo` previews it read-only. The navigation root category is kept (the sales channel points at it); its children are replaced. Tested 2026-11-24: 146 deleted, 153 created, 0 failed, `seed:verify` 16/16.

Persona passwords (`PERSONA_RETAIL_PASSWORD`, `PERSONA_DEALER_ADMIN_PASSWORD`, `PERSONA_DEALER_JUNIOR_PASSWORD`) and `SHOPWARE_SALES_CHANNEL_ID` are set as environment variables in the Claude Code cloud environment (since 2026-11-24); the owner keeps the passwords for Vercel (Phase 8). Process env wins over `.env.seed`. Persona e-mails default to the fixture. Re-running `seed:apply` with new passwords rotates them; `seed:init-env` only fills values that are missing everywhere.

### Seeder notes (Phase 2)
- **IDs and ownership.** Every record ID is `stableId(entity, businessKey)`, so plan, apply, verify and `--replace-demo` agree without a database. Records carry `customFields.demo_fixture`. A business key (product number, customer or employee e-mail, custom field name, media file name) that belongs to a non-fixture record is refused and logged as `failed`, never overwritten.
- **Reference alignment (logged).** The demo sales channel's navigation root is pointed at a fixture-owned root category, `Demo catalog (fixture)`. The previous value is in the ledger. The sales channel's default customer group is left unchanged (guests see retail prices either way); personas are assigned to the fixture's `Retail` and `Dealer` groups.
- **Instance specifics.** Prices are written in the system currency (EUR) and USD. A fixture-owned `DEMO · No tax (demo fixture)` 0% tax rule is used. Custom fields are `storeApiAware` and `allowCartExpose`.
- **Shopware quirk.** Reading `b2b_components_shopping_list` through the Admin `search` endpoint fails on this instance (`Could not find currency b7d2554b…`, the stock default-currency ID, which this SaaS instance does not use). The seeder uses `search-ids` for existence checks; the Store API reads lists normally.
- **Stage order matters.** Product streams are created before products: Shopware fills `product.streamIds` when a product is written, so streams created later stay empty on a fresh build and the series promotions never fire. `--replace-demo` deletes in reverse stage order (the dealer price rule only after the products that use it).
- **Approval rule.** The fixture's `cartAmountGte 0.01` maps to the instance condition `cartCartAmount ≥ 0.01`; `seed:verify` confirms a Junior Buyer cart requires approval.
- **Each `seed:verify` run** leaves two decided pending orders (one approved, one declined) on the demo company. They are not orders; `--replace-demo` removes them.
- **Phase 0 spike records** were removed on 2026-11-24 with `node seed/spikes/phase0.mjs --cleanup` (28 records; none remain).

## Presenter tour (Phase 7)

- Open **/tour** (also linked in the header). Press **Reset** in the header before a new audience, then **Start tour**.
- Each step button switches persona, stages the scene declared in `data/tour.json` (replaces that persona's cart, sets or clears the active vehicle) and opens the page. The dark bar shows the expected result, extra views for the step (e.g. "Show as Dealer Admin") and **Next**.
- Edit titles, talking points, expected results and minutes in `data/tour.json`. `npm run tour:generate` refreshes the targets from the fixture (after a re-skin) and keeps your text; add `"lockRuns": true` to a step to keep its targets too. The schema (`lib/tour.ts`) only allows in-app deep links.
- `npm run tour:screenshots` (after `npm run build`, with the mock or `E2E_BASE_URL`) saves one screenshot per step and device to `docs/tour/`.

## Deploy to Vercel (Phase 8)

The app is a standard Next.js project; `vercel.json` pins the functions to `fra1` (the Shopware instance is in the EU) and `package.json` pins Node 22.

Set these in the Vercel project (Production and Preview). Never add `SHOPWARE_ADMIN_*`: the app refuses to run on Vercel if they are present.

| Variable | Value |
| --- | --- |
| `SHOPWARE_STORE_API_URL` | Store API base URL of the instance (no trailing `/store-api`) |
| `SHOPWARE_SW_ACCESS_KEY` | Sales channel access key (server-only) |
| `PERSONA_RETAIL_EMAIL` / `_PASSWORD` | `retail.rider@example.com` / the seeded password |
| `PERSONA_DEALER_ADMIN_EMAIL` / `_PASSWORD` | `dealer.admin@example.com` / the seeded password |
| `PERSONA_DEALER_JUNIOR_EMAIL` / `_PASSWORD` | `junior.buyer@example.com` / the seeded password |
| `DEMO_PASSWORD` | The shared password presenters type at `/gate` |
| `DEMO_COOKIE_SECRET` | 32+ random characters, e.g. `openssl rand -base64 48` |
| `NEXT_PUBLIC_BRAND_NAME` | Optional brand override (public) |

After a deploy, check it from a machine with the seeder env:

```bash
npm run seed:verify
```

```bash
E2E_BASE_URL=https://<production-domain> E2E_DEMO_PASSWORD=<DEMO_PASSWORD> npx playwright test --trace off
```

Re-deploy after re-seeding (`data/fitment-index.json` is bundled with the build).

