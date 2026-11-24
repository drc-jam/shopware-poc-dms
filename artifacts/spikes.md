# Phase 0 spikes: results and decisions

**Instance:** Shopware Commercial (Evolve) **6.7.16.1**, sales channel "Headless" (selected by the access key).
**Run:** 2026-11-23 with `node seed/spikes/phase0.mjs`. Raw results are in `artifacts/spike-results.json`, and every record the spike wrote is in `artifacts/spike-ledger.json`. Both files are local only.
**Order safety:** the order count was 0 before and 0 after. The spike never calls an order-creating route.

| # | Spike | Result | Decision |
| --- | --- | --- | --- |
| A | Cross-SKU series promotion (§6.4) | **PASS**, with 2 behavioral differences from DMS | **Decided:** all-units cart-rule promotions (D1); series SKUs keep tiers 1/5 only (D2) |
| B | Employee login (§9.3) | **PASS** | Employees use `POST account/login`. `employeeLogin` stays `null` in `data/b2b-routes.json` |
| C | Approval routes (S10) | **PASS**, with a fallback for listing | Request / approve / decline work. **Decided:** pending-order IDs tracked in an httpOnly cookie (D3) |
| — | Shopping lists (S8) | **PASS** | The seeder can create lists and items through the Admin API |
| — | Quick order (S7) | **No Store API route**. App-side composition **PASS** | Quick order = product lookup by `productNumber` + cart add |

---

## A. Series promotion (§6.4)

**Setup:** dealer tiers were A: 70/66/63/60 and B: 56/53/50/48 at quantities 1/5/10/25 (retail 100 / 80). Series membership comes from the product custom field, which feeds a product stream and then the rule `cartLineItemInProductStream`. Promotions are restricted to the Dealer customer-group rule (`personaRules`).

**A1, as the guide describes it (set groups):** `useSetGroups`, set group COUNT = N filtered by the series rule, discount scope `set`, 5% at 10+ and 10% at 25+, mutual `exclusionIds`, and priority 25 > 10.

| Cart (dealer) | Promotion line | Check |
| --- | --- | --- |
| 5A + 5B | −29.75 = 5% × (5·66 + 5·53) | (a) **pass**: the series is targeted through the stream |
| 4A + 5B | none | pass |
| 8A + 5B (13) | −29.75: only the **cheapest 10** units are discounted, and the 3 remaining units are not | (b) package math confirmed, but **differs from DMS** (D1) |
| 10A + 10B (20) | −56.5: two packages, so all 20 units | pass |
| 13A + 12B (25) | −141.9 = 10% of all 25 units. The 10+ promotion does not apply | (c) **pass: no stacking** |
| 10A (single SKU) | unit 63 (tier 10) **and** −31.5 (5%) | **double discount** (D2) |
| 5A + 5B + 5 non-series | −29.75; the non-series SKU is excluded | pass |
| 5A + 5B (retail) | none | pass |

**A2, an alternative (still native: Promotions + Rule Builder, no code):** the cart rule is `cartLineItemGoodsTotal ≥ N`, with a child filter `cartLineItemInProductStream`. The discount scope is `cart` (percentage) and `discountRules` = the series rule, so only series items are discounted. There are no set groups. Results are identical to A1 except for **8A + 5B, where all 13 units are discounted** (−39.65 = 5% × 793). This matches DMS "all units get the tier" behavior. It does not stack and it excludes non-series items. The double discount (D2) remains.

The spike leaves its own A1 promotions active and A2 inactive. That is spike data only; the Phase 2 seeder creates the real `DEMO ·` promotions using A2.

### Decisions (approved by Jamersan on 2026-11-24, recorded in DEV_GUIDE §0, §6.3, §6.4, §7.1, §7.3, §9.4)
- **D1. Remainder units → A2 approved.** A1 (set groups, as locked in §0) discounts only whole packages of N. A2 discounts every series unit once the total reaches N, which is closer to DMS. *Recommendation: A2.* Switching changes the §0 wording ("promotions with set groups"), so **it needs your approval** (CLAUDE.md).
- **D2. Double discount on a single SKU at a tier break → tiers 1/5 on series SKUs approved.** Applied to `data/fixture/site-project.json` (20 series SKUs) and enforced by `fixture:validate`. A line that reaches qty 10 on its own already gets its tier-10 unit price, and the series promotion then takes another 5%. That makes 10 × A cost 59.85/unit, which is below the 25+ tier price. *Recommendation:* series SKUs carry dealer tiers at **1 and 5 only**, and the promotion provides the 10/25 breaks. Because the fixture computes `discountPct = 1 − tier(qty)/tier(5)`, A2 then gives **exact DMS unit parity** for both single-SKU and mixed carts, apart from rounding. Non-series SKUs keep tiers 1/5/10/25. This edits the approved fixture (re-approval needed) and changes what the TierTable shows for series SKUs. Alternatives: accept the overlap and disclose it, or point to a cart processor for production.

---

## B. Employee login (§9.3)

- Employee records were created through the Admin API, without the invite e-mail flow. The `b2b_employee_account` (email, password, status `active`) is linked to `b2b_employee` (business partner, role, `accountId`, `isPrimaryMembership`), and `defaultEmployeeId` is set on the account.
- **`POST account/login` with the employee's e-mail and password returns 200.** `employee/context` lists one membership with `contextSelectionRequired: false`, so no context switch is needed.
- Pricing is inherited. The employee's context customer is the business partner (Dealer group), and product tiers and the cart unit price (70) are identical to the owner's.
- **Gotchas found and fixed in the app:**
  - `GET account/customer` returns **403** for an employee. `tokenIsLoggedIn` and the header now use `GET context`. The employee's name comes from `context.extensions.b2bEmployee`, and the company from `context.customer`.
  - `GET context` for an employee **includes the employee's bcrypt password hash** (`extensions.b2bEmployee.password`). The BFF now strips credential fields (`password`, `recoveryHash`, `hash`, …) from every response (`lib/shopware/redact.ts`), and an e2e test asserts it.
- Permissions available on this instance (Store API `GET permission`) are `employee.*`, `role.*`, `approval_rule.*`, `order.read.all`, `pending_order.read_all`, `pending_order.approve_decline`, `pending_order.approve_decline_all`, `organization_unit.*`, and `subscription.read.all`. **Shopping lists, quick order and requesting approval are not permission-gated.** The Junior Buyer role therefore needs **no** permissions, and the Admin role gets all of them.

## C. Approval routes (S10)

Routes come from the instance's OpenAPI document and are recorded in `data/b2b-routes.json`.

| Step | Route | Persona (BFF) | Result |
| --- | --- | --- | --- |
| Rule | Admin API `b2b_components_approval_rule`, `conditions: [{ "type": "orderApprovalAllOrders", "value": [] }]`, reviewer = Admin role, affected = Junior role | seeder | Stored. The Junior's cart then shows `warning.orderApprovalAllOrders` |
| Request | `POST pending-orders/request { comment }` | dealer-junior | 200. Returns a pending order with `orderId: null` and **empties the cart** |
| Read | `POST pending-order/{id}` | both | 200, state `pending` |
| Decide | `POST pending-order/{id}/approve` and `…/decline { comment }` | dealer-admin | 204. State becomes `approved` / `declined`, and **no order is created** (`orderId` stays null) |
| Junior decides | same | — | 403 `B2B__EMPLOYEE_MISSING_PERMISSIONS`. Shopware enforces this too, in addition to the BFF |
| Place order | `pending-order/{id}/checkout/order` | **nobody** | Not called. It is denied by the BFF hard-deny list (unit + e2e tests) |

- **D3. Listing pending orders → cookie fallback approved.** The Store API has no list route (`POST/GET pending-orders` return 404, and `POST order` does not include pending orders). *Fallback:* the app keeps the IDs returned by `pending-orders/request` in an httpOnly cookie and fetches each with `pending-order/{id}`. This works because one presenter's browser holds both personas. A Store API app-script endpoint would be the production answer.
- The condition types this instance offers come from its own Storefront approval-rule form: `orderApprovalAllOrders` ("All orders"), `cartCartAmount`, `cartPositionPrice`, `cartGoodsPrice`, `cartShippingCost`, `cartGoodsCount`, `cartLineItemGoodsTotal`, `cartLineItemsInCartCount`, `cartVolume`, `cartWeight`, `cartTotalPurchasePrice`, `paymentMethod`, and `shippingMethod`.
- The Store API `approval-rule/create` route does **not** match its OpenAPI document. It reads `name` / `reviewerRoleId` / `affectedRoleId` and a JSON-**string** `approvalRuleCondition`, and it accepts unknown condition types without validation. The BFF does not allow this route; the seeder uses the Admin API.

## Shopping lists (S8)
- Store API `POST shopping-list { name, lineItems }` creates a list with its items, and an Admin API `b2b_components_shopping_list` with nested `lineItems` (`productVersionId` = live version) works too. Both show **3/3 items** through `POST shopping-list/{id}`.
- `POST shopping-lists` (the index) does **not** include line items, so `verify` and the app must use the detail route for counts.
- `POST shopping-lists/add-to-cart { ids }` returns 204, and the cart then contains the list's products and quantities.

## Quick order (S7)
- The `QUICK_ORDER` feature is licensed and enabled, but it is Storefront-only (`/account/quick-order`) and has **no Store API route**. The app composes it from `POST product` with `equalsAny` on `productNumber` (unknown SKUs become row errors) followed by `checkout/cart/line-item`. Verified: 2 of 3 SKUs were found, and the unknown one was reported.

---

## Instance facts the seeder (Phase 2) must handle
- **System default currency is EUR** (USD factor 1.17085). Every price needs an EUR entry plus an explicit USD entry (`linked: false`).
- **API page limit:** `MAX_LIMIT = 500`, declared by the instance. The seeder pages at 100.
- **Addresses need a salutation.** Without one, the cart raises `salutation-missing-billing-address`, and approval requests are refused.
- **Customer-specific features** (`customer_specific_features.features`: `EMPLOYEE_MANAGEMENT`, `ORDER_APPROVAL`, `QUICK_ORDER`, `SHOPPING_LISTS`) must be set on the business-partner customer, because all global defaults are `false`.
- There is **no `en-US` language**. The sales channel uses en-GB (system default). *Recommendation:* keep en-GB for content and format en-US in the app; §6.1 says to create en-US only if missing.
- The tax rules are EU defaults (19% / 7% / 0%). A 0% rule exists ("Reduced rate 2") and the spike used it. The seeder should create or reuse a `DEMO · 0%` tax.
- With advanced prices, `calculatedPrice` stays at the **retail default**. The dealer price is `calculatedPrices[0]`, `calculatedCheapestPrice` is the **lowest tier**, and the tier `quantity` is the range end. Tier `listPrice` (retail) is returned, so the strike-through works. The app already reads `calculatedPrices[0]`.
- The `SHOPWARE_SALES_CHANNEL_ID` env var is unset, so discovery derived `98432def39fc4624b33213a56b8c944d` from the access key. Set it in `.env.seed`.

## Spike records
Every spike record (28, all `SPIKE ·` / `spike.*@example.com`, plus 2 pending orders) was **deleted on 2026-11-24** with `node seed/spikes/phase0.mjs --cleanup`, and a check confirmed none remain. Note for any B2B cleanup: delete the `b2b_employee_account` (it removes the primary membership); deleting the `b2b_employee` first fails with `B2B__PRIMARY_MEMBERSHIP_CANNOT_BE_DELETED`.
