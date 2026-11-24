import type { Metadata } from "next";
import { ListingView } from "@/components/ListingView";
import { FitmentBar } from "@/components/Fitment";
import { allowedProductIds, fitStatus, getGarage } from "@/lib/fitment";
import { getActivePersona } from "@/lib/session";
import { searchProducts } from "@/lib/shopware/catalog";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const term = (sp.search ?? "").slice(0, 100).trim();
  const persona = await getActivePersona();
  if (!term) {
    return <h1 className="text-3xl font-semibold">Search for a part name or SKU</h1>;
  }
  const { active } = await getGarage();
  const listing = await searchProducts(term, {
    p: Number(sp.p) || 1,
    order: sp.order,
    manufacturer: sp.manufacturer,
    ids: active ? allowedProductIds(active) : undefined,
  });
  const fit = active ? Object.fromEntries(listing.elements.map((p) => [p.id, fitStatus(p.id, active)])) : undefined;
  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-semibold" data-testid="search-title">Results for “{term}”</h1>
      <ListingView
        listing={listing}
        persona={persona}
        basePath="/search"
        params={{ search: term, p: sp.p, order: sp.order, manufacturer: sp.manufacturer }}
        fit={fit}
        banner={active ? <FitmentBar vehicle={active} /> : null}
      />
    </div>
  );
}
