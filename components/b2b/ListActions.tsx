"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { callBff } from "@/lib/client-bff";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const run = async (method: "POST" | "DELETE", path: string, body: unknown, after?: () => void) => {
    setBusy(true);
    setError(null);
    const r = await callBff(method, path, body);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    if (after) after();
    else startTransition(() => router.refresh());
    return true;
  };
  return { busy, error, run, router };
}

export function CreateListForm() {
  const { busy, error, run } = useAction();
  const [name, setName] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (name.trim() && (await run("POST", "shopping-list", { name: name.trim() }))) setName("");
      }}
    >
      <label className="grid gap-1 text-sm">
        <span className="font-medium">New list</span>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="e.g. Track day kit" className="rounded border border-black/20 px-2 py-1.5" data-testid="list-new-name" />
      </label>
      <button type="submit" disabled={busy || !name.trim()} className="rounded-[var(--brand-radius)] bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" data-testid="list-create">
        Create list
      </button>
      {error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}
    </form>
  );
}

export function AddListToCartButton({ listId, count }: { listId: string; count: number }) {
  const { busy, error, run, router } = useAction();
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy || count === 0}
        onClick={() => run("POST", "shopping-lists/add-to-cart", { ids: [listId] }, () => router.push("/cart"))}
        className="rounded-[var(--brand-radius)] bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        data-testid="list-add-to-cart"
      >
        Add all {count} to cart
      </button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function RemoveListItemButton({ listId, lineItemId, label }: { listId: string; lineItemId: string; label: string }) {
  const { busy, error, run } = useAction();
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => run("POST", "shopping-list/line-item/remove", { ids: [lineItemId], listId })}
        className="rounded px-2 py-1 text-sm text-black/60 hover:bg-surface hover:text-black"
        aria-label={`Remove ${label} from the list`}
        data-testid="list-item-remove"
      >
        Remove
      </button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </>
  );
}

export function DeleteListButton({ listId, name }: { listId: string; name: string }) {
  const { busy, error, run, router } = useAction();
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => confirm(`Delete the list "${name}"?`) && run("DELETE", "shopping-list", { ids: [listId] }, () => router.push("/account/lists"))}
        className="text-sm text-red-700 underline"
        data-testid="list-delete"
      >
        Delete list
      </button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </>
  );
}

/** PDP: add this product to one of the company's shopping lists (B2B personas). */
export function AddToListForm({ productId, lists }: { productId: string; lists: { id: string; name: string }[] }) {
  const { busy, error, run } = useAction();
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [done, setDone] = useState<string | null>(null);
  if (!lists.length) {
    return <p className="text-sm text-black/60">No shopping lists yet. <Link href="/account/lists" className="text-primary underline">Create one</Link>.</p>;
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2 text-sm"
      data-testid="pdp-add-to-list"
      onSubmit={async (e) => {
        e.preventDefault();
        setDone(null);
        const q = Math.max(1, Math.min(9999, Number(qty) || 1));
        if (await run("POST", `shopping-list/${listId}/add`, { lineItems: { [productId]: { id: productId, quantity: q } } }, () => {})) {
          setDone(lists.find((l) => l.id === listId)?.name ?? "list");
        }
      }}
    >
      <span className="font-medium">Add to list</span>
      <select value={listId} onChange={(e) => setListId(e.target.value)} aria-label="Shopping list" className="rounded border border-black/20 px-2 py-1" data-testid="pdp-list-select">
        {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} aria-label="List quantity" className="w-16 rounded border border-black/20 px-2 py-1" inputMode="numeric" data-testid="pdp-list-qty" />
      <button type="submit" disabled={busy} className="rounded-[var(--brand-radius)] border border-black/20 px-3 py-1 disabled:opacity-50" data-testid="pdp-list-add">
        Add
      </button>
      {done && (
        <span role="status" className="text-emerald-800" data-testid="pdp-list-done">
          Added to <Link href={`/account/lists/${listId}`} className="underline">{done}</Link>
        </span>
      )}
      {error && <span role="alert" className="text-red-700">{error}</span>}
    </form>
  );
}
