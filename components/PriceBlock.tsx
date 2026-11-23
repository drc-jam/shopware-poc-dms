import { money, type DisplayPrice } from "@/lib/pricing";

/** Retail vs "Your price" (S1/S2) and MAP (S5). Pure: usable from server and client components. */
export function PriceBlock({ price, size = "md" }: { price: DisplayPrice; size?: "sm" | "md" | "lg" }) {
  const big = size === "lg" ? "text-3xl" : size === "md" ? "text-xl" : "text-lg";
  if (price.kind === "map") {
    return (
      <div data-testid="price-block" data-kind="map">
        <p className={`${big} font-semibold text-primary`} data-testid="price-map">See price in cart</p>
        <p className="text-xs text-black/60">Manufacturer pricing policy: price shown once in your cart.</p>
      </div>
    );
  }
  return (
    <div data-testid="price-block" data-kind="price">
      {price.list !== null && (
        <p className="text-sm text-black/60">
          Retail <s data-testid="price-list">{money(price.list)}</s>
        </p>
      )}
      <p className={`${big} font-semibold tabular-nums`}>
        {price.label === "Your price" && <span className="mr-1.5 text-sm font-medium text-accent">Your price</span>}
        <span data-testid="price-unit">{money(price.unit)}</span>
      </p>
      {price.tiersFrom !== null && (
        <p className="text-xs text-black/60" data-testid="price-tiers-from">Volume pricing from {money(price.tiersFrom)}</p>
      )}
    </div>
  );
}
