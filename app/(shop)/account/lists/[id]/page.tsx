import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { B2BNotice } from "@/components/b2b/B2BNotice";
import { AddListToCartButton, DeleteListButton, RemoveListItemButton } from "@/components/b2b/ListActions";
import { getActivePersona } from "@/lib/session";
import { getProductsByIds, isId } from "@/lib/shopware/catalog";
import { getShoppingList } from "@/lib/shopware/b2b";
import { money, summarize } from "@/lib/pricing";

export const metadata: Metadata = { title: "Shopping list" };

export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) notFound();
  const persona = await getActivePersona();
  const list = await getShoppingList(id);
  if (!list.ok) {
    if (list.status === 404) notFound();
    return <B2BNotice persona={persona} message={list.status === 403 ? "Shopping lists are available to dealer accounts." : `The list could not be loaded (${list.message}).`} />;
  }
  const items = list.data.lineItems ?? [];
  // Prices for the active persona come from the Store API product route (the list stores product + quantity).
  const products = await getProductsByIds(items.map((i) => i.productId));
  const byId = new Map(products.map((p) => [p.id, summarize(p, persona)]));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm"><Link href="/account/lists" className="text-primary underline">Shopping lists</Link></p>
          <h1 className="text-4xl font-semibold" data-testid="list-title">{list.data.name}</h1>
        </div>
        <AddListToCartButton listId={id} count={items.length} />
      </div>
      {items.length === 0 ? (
        <p className="text-black/60">This list is empty. Add products from a product page or the quick order pad.</p>
      ) : (
        <table className="w-full rounded-[var(--brand-radius)] bg-white text-sm" data-testid="list-items">
          <thead>
            <tr className="border-b border-black/15 text-left text-black/60">
              <th className="p-3 font-medium">Product</th>
              <th className="p-3 font-medium">SKU</th>
              <th className="p-3 text-right font-medium">Qty</th>
              <th className="p-3 text-right font-medium">Unit price</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const p = byId.get(it.productId);
              return (
                <tr key={it.id} className="border-b border-black/5" data-testid="list-item" data-sku={p?.productNumber}>
                  <td className="p-3">{p ? <Link href={`/p/${p.id}`} className="hover:underline">{p.name}</Link> : <span className="text-black/50">Unavailable product</span>}</td>
                  <td className="p-3 font-mono text-xs">{p?.productNumber}</td>
                  <td className="p-3 text-right tabular-nums" data-testid="list-item-qty">{it.quantity}</td>
                  <td className="p-3 text-right tabular-nums">{p?.price.unit != null ? money(p.price.unit) : ""}</td>
                  <td className="p-3 text-right"><RemoveListItemButton listId={id} lineItemId={it.id} label={p?.name ?? "item"} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <DeleteListButton listId={id} name={list.data.name} />
    </div>
  );
}
