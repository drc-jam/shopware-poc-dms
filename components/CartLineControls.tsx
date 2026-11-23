"use client";

import { useState } from "react";
import { useCart } from "./CartProvider";

/** Quantity update/remove for a cart line (Store API PATCH / delete via the BFF). */
export function CartLineControls({ lineItemId, quantity }: { lineItemId: string; quantity: number }) {
  const { update, remove, busy, error } = useCart();
  const [value, setValue] = useState(String(quantity));
  const [failed, setFailed] = useState(false);
  const commit = async (q: number) => {
    if (!Number.isInteger(q) || q < 1 || q === quantity) return setValue(String(quantity));
    setFailed(!(await update(lineItemId, q)));
  };
  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="sr-only" htmlFor={`cq-${lineItemId}`}>Quantity</label>
      <input
        id={`cq-${lineItemId}`}
        data-testid="cart-line-qty"
        inputMode="numeric"
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
        onBlur={() => commit(Number(value))}
        onKeyDown={(e) => e.key === "Enter" && commit(Number(value))}
        className="w-16 rounded border border-black/20 px-2 py-1 text-center tabular-nums"
      />
      <button type="button" disabled={busy} onClick={async () => setFailed(!(await remove(lineItemId)))} className="text-black/60 underline" data-testid="cart-line-remove">
        Remove
      </button>
      {failed && error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
