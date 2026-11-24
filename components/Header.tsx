import Link from "next/link";
import Image from "next/image";
import { brand } from "@/theme/brand";
import { getActivePersona } from "@/lib/session";
import { getHeaderState, getMainNavigation } from "@/lib/shopware/queries";
import { MainNav } from "./MainNav";
import { PERSONAS } from "@/lib/personas";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { SearchBox } from "./SearchBox";
import { GarageSelector } from "./GarageSelector";
import { getGarage, vehicleTree } from "@/lib/fitment";

export async function Header() {
  const persona = await getActivePersona();
  const [nav, state, garage] = await Promise.all([getMainNavigation(), getHeaderState(persona), getGarage()]);
  const garageItems = garage.vehicles.map(({ id, label }) => ({ id, label }));

  return (
    <header className="border-b border-black/10 bg-white">
      {nav.error && (
        <div role="status" className="bg-amber-100 px-4 py-1 text-center text-xs text-amber-900" data-testid="store-api-warning">
          Store API not reachable ({nav.error}). Check SHOPWARE_STORE_API_URL. Phase 0 is pending instance provisioning.
        </div>
      )}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2" aria-label={`${brand.name} home`}>
          <Image src={brand.logo} alt="" width={36} height={36} priority />
          <span className="font-heading text-xl font-semibold text-primary">{brand.name}</span>
        </Link>

        <SearchBox />
        <GarageSelector tree={vehicleTree()} garage={garageItems} active={garage.active?.id ?? null} />

        <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 sm:ml-auto sm:w-auto sm:justify-end">
          <PersonaSwitcher
            persona={persona}
            displayName={state.displayName}
            company={state.company}
            warning={state.error ?? null}
          />
          <Link
            href="/cart"
            className="relative rounded-[var(--brand-radius)] border border-black/15 px-3 py-2 text-sm"
            data-testid="cart-link"
          >
            Cart
            <span
              className="ml-2 inline-flex min-w-6 justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-white"
              data-testid="cart-count"
              aria-label={`${state.cartCount} items in cart`}
            >
              {state.cartCount}
            </span>
          </Link>
        </div>
      </div>
      {PERSONAS[persona].b2b && (
        <nav aria-label="Dealer tools" className="border-t border-black/5 bg-surface" data-testid="b2b-nav">
          <ul className="mx-auto flex max-w-7xl flex-wrap gap-x-5 gap-y-1 px-4 py-1.5 text-sm">
            <li className="font-semibold text-black/60">Dealer tools</li>
            <li><Link href="/quick-order" className="text-primary hover:underline" data-testid="nav-quick-order">Quick order</Link></li>
            <li><Link href="/account/lists" className="text-primary hover:underline" data-testid="nav-lists">Shopping lists</Link></li>
            <li>
              <Link href="/account/approvals" className="text-primary hover:underline" data-testid="nav-approvals">
                {persona === "dealer-admin" ? "Approvals" : "My requests"}
              </Link>
            </li>
            {persona === "dealer-admin" && (
              <li><Link href="/account/company" className="text-primary hover:underline" data-testid="nav-company">Company</Link></li>
            )}
          </ul>
        </nav>
      )}
      <MainNav items={nav.items} />
    </header>
  );
}
