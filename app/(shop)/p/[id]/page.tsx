import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PriceBlock } from "@/components/PriceBlock";
import { ProductBuyBox } from "@/components/ProductBuyBox";
import { getActivePersona } from "@/lib/session";
import { getProduct, isId } from "@/lib/shopware/catalog";
import { isDealer, summarize } from "@/lib/pricing";
import { seriesCopy, seriesInfo } from "@/lib/series";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const p = isId(id) ? await getProduct(id) : null;
  return { title: p ? (p.translated?.name ?? p.name ?? p.productNumber) : "Product" };
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  if (!isId(id)) notFound();
  const product = await getProduct(id);
  if (!product) notFound();
  const persona = await getActivePersona();
  const s = summarize(product, persona);
  const series = seriesInfo(s.series);
  const gallery = (product.media ?? []).map((m) => m.media.url);
  const description = product.translated?.description ?? product.description ?? "";

  return (
    <article className="grid gap-8 md:grid-cols-2" data-testid="pdp" data-sku={s.productNumber}>
      <section aria-label="Product images" className="space-y-3">
        {s.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.image} alt={s.name} width={800} height={800} className="aspect-square w-full rounded-[var(--brand-radius)] border border-black/10 bg-white object-cover" />
        )}
        {gallery.length > 1 && (
          <div className="flex gap-2">
            {gallery.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="" width={80} height={80} className="h-20 w-20 rounded border border-black/10 object-cover" />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-5">
        <div>
          {s.brand && <p className="text-sm uppercase tracking-wide text-black/60">{s.brand}</p>}
          <h1 className="text-4xl font-semibold leading-tight" data-testid="pdp-title">{s.name}</h1>
          <p className="mt-1 text-sm text-black/60" data-testid="pdp-sku">SKU {s.productNumber}</p>
        </div>

        <div className="rounded-[var(--brand-radius)] border border-black/10 bg-white p-4">
          <PriceBlock price={s.price} size="lg" />
        </div>

        {series && (
          <p className="rounded-[var(--brand-radius)] border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary" data-testid="series-callout">
            <strong className="mr-1">Series {series.code}.</strong>
            {seriesCopy(series)}
            {!isDealer(persona) && <span className="block text-xs text-black/60">Series pricing is available to dealer accounts.</span>}
          </p>
        )}

        <ProductBuyBox productId={s.id} available={s.available} tiers={s.tiers} />

        <p className="text-sm text-black/60">
          {s.available ? `In stock (${product.availableStock ?? product.stock ?? 0})` : "Out of stock"}
        </p>
        {description && <div className="prose max-w-none text-sm text-black/80"><p>{description}</p></div>}
      </section>
    </article>
  );
}
