import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingView } from "@/components/ListingView";
import { FitmentBar } from "@/components/Fitment";
import { allowedProductIds, fitStatus, getGarage } from "@/lib/fitment";
import { getActivePersona } from "@/lib/session";
import { getCategory, getListing, isId } from "@/lib/shopware/catalog";
import { nameOf } from "@/lib/shopware/queries";

type Props = { params: Promise<{ slug: string[] }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [id] = (await params).slug;
  const cat = isId(id) ? await getCategory(id) : null;
  return { title: cat ? nameOf(cat) : "Category" };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const id = slug[0];
  if (!isId(id)) notFound();
  const sp = await searchParams;
  const category = await getCategory(id);
  if (!category) notFound();

  const persona = await getActivePersona();
  const { active } = await getGarage();
  const query = { p: sp.p, order: sp.order, manufacturer: sp.manufacturer };
  const listing = await getListing(id, {
    p: Number(sp.p) || 1,
    order: sp.order,
    manufacturer: sp.manufacturer && /^[0-9a-f|]+$/i.test(sp.manufacturer) ? sp.manufacturer : undefined,
    // Fitment (DEV_GUIDE §8): with an active vehicle, only parts that fit it plus universal parts.
    ids: active ? allowedProductIds(active) : undefined,
  });
  const fit = active ? Object.fromEntries(listing.elements.map((p) => [p.id, fitStatus(p.id, active)])) : undefined;

  return (
    <div className="space-y-6">
      <header>
        {/* Shopware's breadcrumb starts with the sales channel's navigation root (not shown) and ends with this category. */}
        {(category.breadcrumb?.length ?? 0) > 2 && (
          <p className="text-sm text-black/60" data-testid="plp-breadcrumb">{category.breadcrumb!.slice(1, -1).join(" › ")}</p>
        )}
        <h1 className="text-4xl font-semibold" data-testid="plp-title">{nameOf(category)}</h1>
        {category.description && <p className="mt-1 text-black/70">{category.description}</p>}
      </header>
      <ListingView
        listing={listing}
        persona={persona}
        basePath={`/c/${slug.join("/")}`}
        params={query}
        fit={fit}
        banner={active ? <FitmentBar vehicle={active} /> : null}
      />
    </div>
  );
}
