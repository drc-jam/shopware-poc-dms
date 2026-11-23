"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { money } from "@/lib/pricing";
import { useCart } from "./CartProvider";
import { productLines, promotionLines, PromotionLine } from "./CartSummaryLines";

export function MiniCartDrawer() {
  const { cart, open, setOpen } = useCart();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open || !cart) return null;
  const products = productLines(cart.lineItems);
  const promos = promotionLines(cart.lineItems);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="mini-cart-title" data-testid="mini-cart">
      <button type="button" aria-label="Close cart" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} tabIndex={-1} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <h2 id="mini-cart-title" className="text-2xl font-semibold">Added to cart</h2>
          <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-sm hover:bg-surface">
            Close
          </button>
        </div>
        <ul className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {products.map((li) => (
            <li key={li.id} className="flex gap-3">
              {li.cover?.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={li.cover.url} alt="" width={64} height={64} className="h-16 w-16 rounded border border-black/10 object-cover" />
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{li.label}</p>
                <p className="text-xs text-black/60">SKU {li.payload?.productNumber}</p>
                <p className="text-xs text-black/70">
                  {li.quantity} × {money(li.price?.unitPrice ?? 0)}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums">{money(li.price?.totalPrice ?? 0)}</span>
            </li>
          ))}
          {promos.map((li) => (
            <li key={li.id}><PromotionLine li={li} /></li>
          ))}
        </ul>
        <div className="space-y-3 border-t border-black/10 px-5 py-4">
          <div className="flex justify-between text-lg font-semibold">
            <span>Subtotal</span>
            <span className="tabular-nums" data-testid="mini-cart-total">{money(cart.price?.totalPrice ?? 0)}</span>
          </div>
          <Link href="/cart" onClick={() => setOpen(false)} className="block rounded-[var(--brand-radius)] bg-primary px-4 py-2.5 text-center font-medium text-white hover:opacity-90">
            View cart
          </Link>
          <button type="button" onClick={() => setOpen(false)} className="block w-full text-center text-sm text-primary underline">
            Continue shopping
          </button>
        </div>
      </aside>
    </div>
  );
}
