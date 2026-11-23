"use client";

import { useState } from "react";
import { money, type Tier } from "@/lib/pricing";
import { useCart } from "./CartProvider";

interface Props {
  productId: string;
  available?: boolean;
  /** Show a qty stepper (PDP, quick view). Cards add qty 1. */
  stepper?: boolean;
  /** Dealer tiers: shows the unit price at the chosen qty and the next break. */
  tiers?: Tier[];
  onQtyChange?: (q: number) => void;
  compact?: boolean;
}

export function AddToCart({ productId, available = true, stepper = false, tiers = [], onQtyChange, compact = false }: Props) {
  const { add, busy, error } = useCart();
  const [qty, setQty] = useState(1);
  const [lastError, setLastError] = useState(false);

  const set = (q: number) => {
    const v = Math.max(1, Math.min(999, Number.isFinite(q) ? Math.floor(q) : 1));
    setQty(v);
    onQtyChange?.(v);
  };
  const tier = [...tiers].reverse().find((t) => t.from <= qty);
  const next = tiers.find((t) => t.from > qty);

  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-2">
        {stepper && (
          <div className="flex items-stretch rounded-[var(--brand-radius)] border border-black/20">
            <button type="button" aria-label="Decrease quantity" className="px-3 text-lg" onClick={() => set(qty - 1)} disabled={qty <= 1}>
              −
            </button>
            <label className="sr-only" htmlFor={`qty-${productId}`}>Quantity</label>
            <input
              id={`qty-${productId}`}
              data-testid="qty-input"
              inputMode="numeric"
              value={qty}
              onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")))}
              className="w-14 border-x border-black/20 text-center tabular-nums"
            />
            <button type="button" aria-label="Increase quantity" className="px-3 text-lg" onClick={() => set(qty + 1)}>
              +
            </button>
          </div>
        )}
        <button
          type="button"
          disabled={!available || busy}
          onClick={async () => setLastError(!(await add(productId, qty)))}
          data-testid="add-to-cart"
          className={`flex-1 rounded-[var(--brand-radius)] bg-accent font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${
            compact ? "px-3 py-1.5 text-sm" : "px-4 py-2.5"
          }`}
        >
          {!available ? "Out of stock" : busy ? "Adding…" : "Add to cart"}
        </button>
      </div>
      {stepper && tier && tiers.length > 1 && (
        <p className="text-xs text-black/70" data-testid="qty-tier-note">
          {qty} × {money(tier.unitPrice)}
          {next && ` · buy ${next.from - qty} more for ${money(next.unitPrice)} each`}
        </p>
      )}
      {lastError && error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
