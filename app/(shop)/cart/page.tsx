import type { Metadata } from "next";
import Link from "next/link";
import { CartLineControls } from "@/components/CartLineControls";
import { PromotionLine, productLines, promotionLines } from "@/components/CartSummaryLines";
import { getActivePersona } from "@/lib/session";
import { getCart, getProductsByIds } from "@/lib/shopware/catalog";
import { isDealer, money, tiersOf } from "@/lib/pricing";
import { PERSONAS } from "@/lib/personas";
import { SubmitForApproval } from "@/components/b2b/ApprovalActions";

/**
 * Shopware 6.7.16 adds a blocking cart error for an employee whose role needs approval:
 * key "order-approval-blocked", messageKey "warning.<condition>", translatedMessage for display.
 * Returns the message to show, or null.
 */
function approvalNotice(errors: unknown): string | null {
  const list = (Array.isArray(errors) ? errors : Object.values((errors as Record<string, unknown>) ?? {})) as {
    key?: string;
    translatedMessage?: string;
  }[];
  const e = list.find((x) => x && (x.key === "order-approval-blocked" || /order-?approval/i.test(x.key ?? "")));
  return e ? (e.translatedMessage || "This cart needs approval before it can be ordered.") : null;
}

export const metadata: Metadata = { title: "Cart" };

export default async function CartPage() {
  const persona = await getActivePersona();
  const cart = await getCart();
  const lines = productLines(cart.lineItems);
  const promos = promotionLines(cart.lineItems);
  // Tier notes: the cart line has no tier data, so read the products' calculatedPrices (dealer only).
  const products = isDealer(persona) ? await getProductsByIds(lines.map((l) => l.referencedId ?? l.id)) : [];
  const tiersById = new Map(products.map((p) => [p.id, tiersOf(p.calculatedPrices)]));

  if (lines.length === 0) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-semibold">Your cart is empty</h1>
        <p className="text-black/60">Browsing as {PERSONAS[persona].label}.</p>
        <Link href="/" className="inline-block rounded-[var(--brand-radius)] bg-primary px-4 py-2 text-white">Start shopping</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <section className="space-y-4">
        <h1 className="text-4xl font-semibold">Cart</h1>
        <ul className="divide-y divide-black/10 rounded-[var(--brand-radius)] border border-black/10 bg-white" data-testid="cart-lines">
          {lines.map((li) => {
            const tiers = tiersById.get(li.referencedId ?? li.id) ?? [];
            const tier = [...tiers].reverse().find((t) => t.from <= li.quantity);
            const next = tiers.find((t) => t.from > li.quantity);
            return (
              <li key={li.id} className="flex flex-wrap gap-4 p-4" data-testid="cart-line" data-sku={li.payload?.productNumber}>
                {li.cover?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={li.cover.url} alt="" width={80} height={80} className="h-20 w-20 rounded border border-black/10 object-cover" />
                )}
                <div className="min-w-48 flex-1 space-y-1">
                  <Link href={`/p/${li.referencedId ?? li.id}`} className="font-medium hover:underline">{li.label}</Link>
                  <p className="text-xs text-black/60" data-testid="cart-line-sku">SKU {li.payload?.productNumber}</p>
                  <p className="text-sm">
                    <span data-testid="cart-line-unit">{money(li.price?.unitPrice ?? 0)}</span> each
                    {li.price?.listPrice && <s className="ml-2 text-xs text-black/50">{money(li.price.listPrice.price)}</s>}
                  </p>
                  {tier && tiers.length > 1 && (
                    <p className="text-xs text-emerald-800" data-testid="cart-line-tier">
                      Tier {tier.to === null ? `${tier.from}+` : `${tier.from}–${tier.to}`} price
                      {next && ` · add ${next.from - li.quantity} for ${money(next.unitPrice)} each`}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <CartLineControls lineItemId={li.id} quantity={li.quantity} />
                  <span className="font-semibold tabular-nums" data-testid="cart-line-total">{money(li.price?.totalPrice ?? 0)}</span>
                </div>
              </li>
            );
          })}
        </ul>
        {promos.length > 0 && (
          <div className="space-y-2">
            {promos.map((li) => <PromotionLine key={li.id} li={li} />)}
          </div>
        )}
      </section>

      <aside className="h-fit space-y-4 rounded-[var(--brand-radius)] border border-black/10 bg-white p-5">
        <h2 className="text-2xl font-semibold">Summary</h2>
        <div className="flex justify-between text-lg font-semibold">
          <span>Total</span>
          <span className="tabular-nums" data-testid="cart-total">{money(cart.price?.totalPrice ?? 0)}</span>
        </div>
        {persona === "dealer-junior" ? (
          <>
            {approvalNotice(cart.errors) && (
              <p className="rounded border border-amber-700/30 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="approval-required">
                {approvalNotice(cart.errors)} Submit it to your Dealer Admin.
              </p>
            )}
            <SubmitForApproval />
            <p className="rounded bg-surface px-3 py-2 text-xs text-black/60" data-testid="checkout-disabled">
              Checkout is disabled in this demo; an approved request does not place an order.
            </p>
          </>
        ) : (
          <p className="rounded bg-surface px-3 py-2 text-sm text-black/70" data-testid="checkout-disabled">
            Checkout is disabled in this demo.
          </p>
        )}
      </aside>
    </div>
  );
}
