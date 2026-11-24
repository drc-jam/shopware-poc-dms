import Link from "next/link";
import { getActivePersona } from "@/lib/session";
import { PERSONAS } from "@/lib/personas";
import { brand } from "@/theme/brand";
import { GarageSelector } from "@/components/GarageSelector";
import { getGarage, vehicleTree } from "@/lib/fitment";

export default async function Home() {
  const persona = await getActivePersona();
  const garage = await getGarage();
  return (
    <div className="space-y-10">
      <section className="rounded-[var(--brand-radius)] bg-primary px-6 py-12 text-white sm:px-10">
        <p className="text-sm uppercase tracking-widest text-white/70">Shop by vehicle</p>
        <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">Racing shocks for your chassis</h1>
        <p className="mt-3 max-w-xl text-white/85">
          Pick your make, model and year to see the shocks, coil-overs and mounts that fit. Category pages and search then show only
          parts for your chassis, plus universal parts.
        </p>
        <div className="mt-6 max-w-3xl">
          <GarageSelector
            tree={vehicleTree()}
            garage={garage.vehicles.map(({ id, label }) => ({ id, label }))}
            active={garage.active?.id ?? null}
            variant="hero"
          />
        </div>
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
            Ten one-click steps across dealer pricing, vehicle fitment and B2B buying. <Link className="text-primary underline" href="/tour" data-testid="home-tour-link">Open the tour</Link>.
          </p>
        </div>
      </section>
      <p className="sr-only">{brand.name}</p>
    </div>
  );
}
