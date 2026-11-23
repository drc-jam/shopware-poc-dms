import Link from "next/link";
import type { ActivePersona } from "@/lib/personas";
import { summarize } from "@/lib/pricing";
import type { ListingResult } from "@/lib/shopware/types";
import { nameOf } from "@/lib/shopware/queries";
import { ProductCard } from "./ProductCard";

type Params = Record<string, string | undefined>;

const withParams = (base: string, current: Params, patch: Params) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
};

/** PLP/search grid with sorting, manufacturer filter (Store API aggregations) and pagination. */
export function ListingView({ listing, persona, basePath, params }: { listing: ListingResult; persona: ActivePersona; basePath: string; params: Params }) {
  const selected = new Set((params.manufacturer ?? "").split("|").filter(Boolean));
  const manufacturers = listing.aggregations?.manufacturer?.entities ?? [];
  const pages = Math.max(1, Math.ceil(listing.total / listing.limit));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return [...next].join("|") || undefined;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <aside aria-label="Filters" className="space-y-5">
        {manufacturers.length > 0 && (
          <section>
            <h2 className="mb-2 text-lg font-semibold">Brand</h2>
            <ul className="space-y-1 text-sm">
              {manufacturers.map((m) => (
                <li key={m.id}>
                  <Link
                    href={withParams(basePath, params, { manufacturer: toggle(m.id), p: undefined })}
                    className="flex items-center gap-2 hover:underline"
                    aria-current={selected.has(m.id) ? "true" : undefined}
                  >
                    <span className={`inline-block h-4 w-4 rounded border ${selected.has(m.id) ? "border-primary bg-primary" : "border-black/30"}`} aria-hidden />
                    {nameOf(m)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p data-testid="listing-total">{listing.total} {listing.total === 1 ? "product" : "products"}</p>
          <nav aria-label="Sort" className="flex flex-wrap gap-1">
            {(listing.availableSortings ?? []).map((s) => (
              <Link
                key={s.key}
                href={withParams(basePath, params, { order: s.key, p: undefined })}
                aria-current={listing.sorting === s.key ? "true" : undefined}
                className={`rounded px-2 py-1 ${listing.sorting === s.key ? "bg-primary text-white" : "hover:bg-white"}`}
              >
                {s.translated?.label ?? s.label ?? s.key}
              </Link>
            ))}
          </nav>
        </div>

        {listing.elements.length === 0 ? (
          <p className="rounded-[var(--brand-radius)] border border-dashed border-black/20 bg-white p-8 text-center text-black/60">
            No products match these filters.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" data-testid="product-grid">
            {listing.elements.map((p) => (
              <ProductCard key={p.id} product={summarize(p, persona)} />
            ))}
          </div>
        )}

        {pages > 1 && (
          <nav aria-label="Pagination" className="flex justify-center gap-1 text-sm">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={withParams(basePath, params, { p: n === 1 ? undefined : String(n) })}
                aria-current={listing.page === n ? "page" : undefined}
                className={`rounded px-3 py-1 ${listing.page === n ? "bg-primary text-white" : "bg-white hover:bg-surface"}`}
              >
                {n}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
