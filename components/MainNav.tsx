import Link from "next/link";
import type { NavCategory } from "@/lib/shopware/types";
import { nameOf } from "@/lib/shopware/queries";

const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const href = (c: NavCategory) => `/c/${c.id}/${slug(nameOf(c))}`;

/** Mega-nav from the Store API main navigation (CSS-only dropdowns; keyboard reachable via focus-within). */
export function MainNav({ items }: { items: NavCategory[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Categories" className="bg-primary text-white">
      <ul className="mx-auto flex max-w-7xl flex-wrap px-2">
        {items.map((c) => {
          const children = (c.children ?? []).filter((k) => k.visible !== false);
          return (
            <li key={c.id} className="group relative">
              <Link href={href(c)} className="block px-3 py-2.5 text-sm font-medium hover:bg-white/10 focus:bg-white/10">
                {nameOf(c)}
              </Link>
              {children.length > 0 && (
                <ul className="absolute left-0 top-full z-20 hidden min-w-56 max-w-[calc(100vw-2rem)] rounded-b-[var(--brand-radius)] bg-white py-2 text-ink shadow-lg group-focus-within:block group-hover:block">
                  {children.map((k) => (
                    <li key={k.id}>
                      <Link href={href(k)} className="block px-4 py-2 text-sm hover:bg-surface focus:bg-surface">
                        {nameOf(k)}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
