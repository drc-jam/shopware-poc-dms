# shopware-poc-dms: Powersports B2B Demo on Shopware

Shopware POC based on Day Motor Sports (DMS) requirements. The storefront itself uses a neutral fictional brand (see DEV_GUIDE §0).

This is a re-skinnable, neutral-branded powersports B2B demo. It is a Next.js App Router app (BFF to the Shopware 6.7 Store API) plus a seeder.
Scope, decisions, and acceptance criteria live in [`DEV_GUIDE.md`](DEV_GUIDE.md). Agent rules are in [`CLAUDE.md`](CLAUDE.md).

## Quick start (no Shopware instance yet)

```bash
npm ci
npm run fixture:validate      # strict schema + business checks on data/fixture/
npm test                      # unit tests (fixture checks, BFF allowlist, gate cookie)
npm run build && npm run e2e  # e2e against the mock Store API in e2e/mock-store-api.mjs
```

For local dev against the mock: copy `.env.example` to `.env.local` and use the values from `e2e/test-env.mjs`. Then run `npm run mock:store-api` and `npm run dev`.

## Status

| Phase | State | Notes |
| --- | --- | --- |
| 0 · Instance and spikes | **Blocked** | Waiting on §13 instance prerequisites |
| 1 · Fixture | **Built, awaiting human review** | Review `data/fixture/REVIEW.md` (`npm run fixture:review` regenerates it) |
| 2 · Seeder | Not started | Needs the factory repo (stableId, admin client) and an instance |
| 3 · App shell | **Done (against mock)** | Gate, BFF + allowlist, persona switcher, brand tokens, header/nav |
| 4 · Catalog and pricing | **Done (against mock)** | S1–S5 e2e green; PLP/PDP/search, PriceBlock, TierTable, MAP, mini-cart, Quick View, cart with series savings |
| 5–8 | Not started | |

### Open items and deviations from the guide

- **Factory reconciliation pending.** The factory repo was not readable when Phase 1 was built. The base roots in `schemas/site-project.demo.schema.json` (`source`, `currency`, `categories`, `products`, `customers`) follow the guide's example, not the factory schema. They must be reconciled before Phase 2. `stableId` is not implemented yet.
- **Series promotion double-discount (needs the Phase 0 spike).** A single SKU at qty ≥ 10 already gets its own tier-10 unit price. The qty-10 series promotion is computed from the tier-5 price (§6.4), so it would discount that line a second time. The spike should decide one of three options: limit the promotion to mixes where no single line has reached the tier, accept and disclose the overlap, or note a cart processor as the production answer.
- **Series discount rounding.** Series discounts (5% / 9.75%) come from the tier ratios. On cheap SKUs, rounding to .x9 prices leaves drift of up to about 0.8 pp (validator warning on `HLV-OF-B-3104`).
- **Next 16** renamed `middleware.ts` to `proxy.ts`. The gate lives in `proxy.ts` and behaves as §9.3 describes.
- **Vehicles live in `data/fixture/vehicles.json`** (per the repo layout §5). The validator composes them with `site-project.json` before checking the schema.
- **B2B Store API routes are not hard-coded.** `data/b2b-routes.json` stays `pending-discovery` until `seed:discover` fills it from the instance's OpenAPI document. Until then the BFF denies every B2B route.
- **Fitment data is synthetic.** Vehicle makes and models are real OEMs, but which parts fit which vehicle is invented.
- **The mock Store API emulates Shopware response shapes and the intended pricing** (`e2e/mock/catalog.mjs`, built from the fixture). Green e2e against the mock proves the app logic, not Shopware's pricing or promotions. `seed:verify` and e2e against the real instance prove those.
- **Placeholder images** in `data/fixture/media/` are generated category illustrations (`tools/make-placeholder-media.mjs`).
- `lib/shopware/types.ts` is hand-written for now. Replace it with `npm run types:generate` in Phase 0.
