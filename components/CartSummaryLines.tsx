import { money } from "@/lib/pricing";
import type { CartLineItem } from "@/lib/shopware/types";

/** Promotion lines rendered as "Series savings" (S4). Shared by drawer and cart page. */
export function PromotionLine({ li }: { li: CartLineItem }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--brand-radius)] bg-emerald-50 px-3 py-2 text-sm text-emerald-900" data-testid="series-savings">
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wide">Series savings</span>
        <span>{li.label}</span>
      </div>
      <span className="font-semibold tabular-nums" data-testid="series-savings-amount">{money(li.price?.totalPrice ?? 0)}</span>
    </div>
  );
}

export const productLines = (items: CartLineItem[]) => items.filter((li) => li.type === "product");
export const promotionLines = (items: CartLineItem[]) => items.filter((li) => li.type === "promotion");
