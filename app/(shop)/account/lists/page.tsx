import type { Metadata } from "next";
import Link from "next/link";
import { B2BNotice } from "@/components/b2b/B2BNotice";
import { CreateListForm } from "@/components/b2b/ListActions";
import { getActivePersona } from "@/lib/session";
import { getShoppingLists } from "@/lib/shopware/b2b";

export const metadata: Metadata = { title: "Shopping lists" };

export default async function ListsPage() {
  const persona = await getActivePersona();
  const lists = await getShoppingLists();
  if (!lists.ok) return <B2BNotice persona={persona} message={lists.status === 403 ? "Shopping lists are available to dealer accounts." : `Shopping lists could not be loaded (${lists.message}).`} />;
  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-semibold">Shopping lists</h1>
      {lists.data.length === 0 ? (
        <p className="text-black/60">No lists yet.</p>
      ) : (
        <ul className="divide-y divide-black/10 rounded-[var(--brand-radius)] border border-black/10 bg-white" data-testid="lists">
          {lists.data.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-4 p-4" data-testid="list-row" data-list-name={l.name}>
              <Link href={`/account/lists/${l.id}`} className="font-medium text-primary hover:underline">{l.name}</Link>
              <span className="text-sm text-black/60" data-testid="list-count">{l.itemCount} item{l.itemCount === 1 ? "" : "s"}</span>
            </li>
          ))}
        </ul>
      )}
      <CreateListForm />
    </div>
  );
}
