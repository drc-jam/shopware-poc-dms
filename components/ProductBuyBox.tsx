"use client";

import { useState } from "react";
import type { Tier } from "@/lib/pricing";
import { AddToCart } from "./AddToCart";
import { TierTable } from "./TierTable";

/** PDP tier table (dealer only) + qty stepper + add to cart; highlights the active tier as qty changes. */
export function ProductBuyBox({ productId, available, tiers }: { productId: string; available: boolean; tiers: Tier[] }) {
  const [qty, setQty] = useState(1);
  return (
    <div className="space-y-4">
      <TierTable tiers={tiers} activeQty={qty} />
      <AddToCart productId={productId} available={available} stepper tiers={tiers} onQtyChange={setQty} />
    </div>
  );
}
