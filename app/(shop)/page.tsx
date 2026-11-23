import Link from "next/link";
import { getActivePersona } from "@/lib/session";
import { PERSONAS } from "@/lib/personas";
import { brand } from "@/theme/brand";

export default async function Home() {
  const persona = await getActivePersona();
  return (
    <div className="space-y-10">
      <section className="rounded-[var(--brand-radius)] bg-primary px-6 py-12 text-white sm:px-10">
        <p className="text-sm uppercase tracking-widest text-white/70">Shop by vehicle</p>
        <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">Racing shocks for your chassis</h1>
        <p className="mt-3 max-w-xl text-white/85">
          Pick your year, make and model to see the shocks, coil-overs and mounts that fit. The vehicle selector arrives in Phase 5.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Demo status">
        <div className="rounded-[var(--brand-radius)] border border-black/10 bg-white p-5">
          <h2 className="text-xl font-semibold">You are browsing as</h2>
          <p className="mt-1 text-2xl text-primary" data-testid="home-persona">{PERSONAS[persona].label}</p>
          <p className="mt-1 text-sm text-black/60">{PERSONAS[persona].description}</p>
        </div>
        <div className="rounded-[var(--brand-radius)] border border-black/10 bg-white p-5">
          <h2 className="text-xl font-semibold">Dealer pricing</h2>
          <p className="mt-1 text-sm text-black/70">Switch to a dealer persona to see your price, quantity tiers and series savings.</p>
        </div>
        <div className="rounded-[var(--brand-radius)] border border-black/10 bg-white p-5">
          <h2 className="text-xl font-semibold">Guided tour</h2>
          <p className="mt-1 text-sm text-black/70">
            The presenter tour lives at <Link className="text-primary underline" href="/tour">/tour</Link> (Phase 7).
          </p>
        </div>
      </section>
      <p className="sr-only">{brand.name}</p>
    </div>
  );
}
