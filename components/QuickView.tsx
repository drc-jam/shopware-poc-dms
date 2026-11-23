"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ProductSummary } from "@/lib/pricing";
import { AddToCart } from "./AddToCart";
import { PriceBlock } from "./PriceBlock";
import { TierTable } from "./TierTable";

/** PLP Quick View modal: price block + add to cart without leaving the listing (DMS 11/18 feedback). */
export function QuickView({ product }: { product: ProductSummary }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [qty, setQty] = useState(1);
  const [open, setOpen] = useState(false);
  // Mount the dialog only while open: keeps 24-card listings light and avoids duplicate controls in the DOM.
  useEffect(() => {
    if (open) ref.current?.showModal();
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-[var(--brand-radius)] border border-black/15 px-3 py-1.5 text-sm hover:bg-surface"
        data-testid="quick-view-open"
      >
        Quick view
      </button>
      {open && (
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        aria-labelledby={`qv-${product.id}`}
        className="m-auto w-[min(42rem,calc(100vw-2rem))] rounded-[var(--brand-radius)] p-0 backdrop:bg-black/40"
        data-testid="quick-view"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          {product.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image} alt={product.name} width={400} height={400} className="aspect-square w-full rounded border border-black/10 object-cover" />
          )}
          <div className="space-y-3">
            <div>
              {product.brand && <p className="text-xs uppercase tracking-wide text-black/60">{product.brand}</p>}
              <h2 id={`qv-${product.id}`} className="text-2xl font-semibold">{product.name}</h2>
              <p className="text-xs text-black/60">SKU {product.productNumber}</p>
            </div>
            <PriceBlock price={product.price} />
            <TierTable tiers={product.tiers} activeQty={qty} />
            <AddToCart productId={product.id} available={product.available} stepper tiers={product.tiers} onQtyChange={setQty} />
            <div className="flex justify-between text-sm">
              <Link href={`/p/${product.id}`} className="text-primary underline">Full details</Link>
              <button type="button" onClick={() => ref.current?.close()} className="text-black/60 hover:underline">Close</button>
            </div>
          </div>
        </div>
      </dialog>
      )}
    </>
  );
}
