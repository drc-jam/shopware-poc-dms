import Link from "next/link";
import type { ProductSummary } from "@/lib/pricing";
import { seriesInfo } from "@/lib/series";
import { AddToCart } from "./AddToCart";
import { PriceBlock } from "./PriceBlock";
import { QuickView } from "./QuickView";
import { FitChip } from "./Fitment";
import type { FitStatus } from "@/lib/fitment";

export function ProductCard({ product, fit }: { product: ProductSummary; fit?: FitStatus }) {
  return (
    <article className="flex flex-col rounded-[var(--brand-radius)] border border-black/10 bg-white p-3" data-testid="product-card" data-sku={product.productNumber}>
      <Link href={`/p/${product.id}`} className="block">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image} alt="" width={300} height={300} loading="lazy" className="aspect-square w-full rounded object-cover" />
        ) : (
          <div className="aspect-square w-full rounded bg-surface" />
        )}
      </Link>
      <div className="mt-3 flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {fit && <FitChip status={fit} />}
          {product.series && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary" data-testid="series-badge">
              {seriesInfo(product.series)?.label ?? `Series ${product.series}`}
            </span>
          )}
        </div>
        {product.brand && <p className="text-xs uppercase tracking-wide text-black/50">{product.brand}</p>}
        <h3 className="font-body text-sm font-medium leading-snug">
          <Link href={`/p/${product.id}`} className="hover:underline">{product.name}</Link>
        </h3>
        <p className="text-xs text-black/60">SKU {product.productNumber}</p>
        <div className="mt-auto pt-1"><PriceBlock price={product.price} size="sm" /></div>
        <div className="flex gap-2">
          <div className="flex-1"><AddToCart productId={product.id} available={product.available} compact /></div>
          <QuickView product={product} />
        </div>
      </div>
    </article>
  );
}
