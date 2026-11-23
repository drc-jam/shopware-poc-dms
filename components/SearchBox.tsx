"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

interface Suggestion {
  id: string;
  productNumber: string;
  name: string;
}

/** Header search with suggestions via the BFF (search-suggest). Prices are omitted here (MAP-safe). */
export function SearchBox({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setItems([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/sw/search-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ search: term, limit: 6 }),
        });
        if (!res.ok || mine !== seq.current) return;
        const data = (await res.json()) as { elements?: { id: string; productNumber: string; name?: string; translated?: { name?: string } }[] };
        setItems((data.elements ?? []).map((p) => ({ id: p.id, productNumber: p.productNumber, name: p.translated?.name ?? p.name ?? p.productNumber })));
        setOpen(true);
      } catch {
        /* suggestions are best-effort */
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <form
      role="search"
      className="relative order-last w-full sm:order-none sm:ml-4 sm:w-auto sm:flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        if (q.trim()) router.push(`/search?search=${encodeURIComponent(q.trim())}`);
      }}
    >
      <label htmlFor="q" className="sr-only">Search parts</label>
      <input
        id="q"
        name="search"
        type="search"
        value={q}
        autoComplete="off"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search parts or SKU…"
        aria-controls={listId}
        aria-expanded={open && items.length > 0}
        role="combobox"
        aria-autocomplete="list"
        className="w-full rounded-[var(--brand-radius)] border border-black/15 px-3 py-2 text-sm"
        data-testid="search-input"
      />
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-[var(--brand-radius)] border border-black/10 bg-white shadow-lg" data-testid="search-suggest">
          {items.map((s) => (
            <li key={s.id} role="option" aria-selected={false}>
              <Link href={`/p/${s.id}`} className="block px-3 py-2 text-sm hover:bg-surface" onClick={() => setOpen(false)}>
                <span className="block">{s.name}</span>
                <span className="text-xs text-black/60">SKU {s.productNumber}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
