"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import type { VehicleTree } from "@/lib/fitment";

export interface GarageItem {
  id: string;
  label: string;
}

interface Props {
  tree: VehicleTree;
  garage: GarageItem[];
  active: string | null;
  /** header: compact button + panel with My Garage. hero: inline selector on the home page. */
  variant?: "header" | "hero";
}

async function postGarage(body: object): Promise<string | null> {
  const res = await fetch("/api/garage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return null;
  const data = (await res.json().catch(() => null)) as { errors?: { title?: string }[] } | null;
  return data?.errors?.[0]?.title ?? `Garage update failed (HTTP ${res.status})`;
}

/** Year / Make / Model selector + "My Garage" (DEV_GUIDE §8). Dependent dropdowns: Make → Model → Year. */
export function GarageSelector({ tree, garage, active, variant = "header" }: Props) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [make, setMake] = useState("");
  const [modelKey, setModelKey] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pathname = usePathname();
  // Close the panel when the presenter navigates.
  useEffect(() => setOpen(false), [pathname]);

  const models = useMemo(() => tree.makes.find((m) => m.make === make)?.models ?? [], [tree, make]);
  const years = useMemo(() => models.find((m) => m.key === modelKey)?.years ?? [], [models, modelKey]);
  const activeItem = garage.find((g) => g.id === active) ?? null;

  async function run(body: object, after?: () => void) {
    setError(null);
    const err = await postGarage(body);
    if (err) {
      setError(err);
      return;
    }
    after?.();
    startTransition(() => router.refresh());
  }

  const add = () =>
    run({ action: "add", vehicle: `${modelKey}|${year}` }, () => {
      setMake("");
      setModelKey("");
      setYear("");
      if (variant === "header") setOpen(false);
    });

  const selects = (
    <div className={variant === "hero" ? "grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto]" : "grid gap-2"}>
      <label className="grid gap-1 text-xs font-medium">
        <span>Make</span>
        <select
          id={`${uid}-make`}
          value={make}
          onChange={(e) => {
            setMake(e.target.value);
            setModelKey("");
            setYear("");
          }}
          className="rounded-[var(--brand-radius)] border border-black/20 bg-white px-2 py-2 text-sm text-ink"
          data-testid="ymm-make"
        >
          <option value="">Select make</option>
          {tree.makes.map((m) => (
            <option key={m.make} value={m.make}>{m.make}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">
        <span>Model</span>
        <select
          value={modelKey}
          disabled={!make}
          onChange={(e) => {
            setModelKey(e.target.value);
            setYear("");
          }}
          className="rounded-[var(--brand-radius)] border border-black/20 bg-white px-2 py-2 text-sm text-ink disabled:opacity-50"
          data-testid="ymm-model"
        >
          <option value="">Select model</option>
          {models.map((m) => (
            <option key={m.key} value={m.key}>{m.model}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">
        <span>Year</span>
        <select
          value={year}
          disabled={!modelKey}
          onChange={(e) => setYear(e.target.value)}
          className="rounded-[var(--brand-radius)] border border-black/20 bg-white px-2 py-2 text-sm text-ink disabled:opacity-50"
          data-testid="ymm-year"
        >
          <option value="">Select year</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!year || pending}
        onClick={add}
        className="self-end rounded-[var(--brand-radius)] bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        data-testid="ymm-add"
      >
        {variant === "hero" ? "Shop parts that fit" : "Add to garage"}
      </button>
    </div>
  );

  if (variant === "hero") {
    return (
      <div className="space-y-2" data-testid="ymm-hero">
        {selects}
        {activeItem && <p className="text-sm text-white/85" data-testid="ymm-hero-active">Shopping for your {activeItem.label}.</p>}
        {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
      </div>
    );
  }

  return (
    <div className="relative" data-testid="garage">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${uid}-panel`}
        className="max-w-56 truncate rounded-[var(--brand-radius)] border border-black/15 bg-white px-3 py-2 text-sm"
        data-testid="garage-toggle"
        title={activeItem ? `Shopping for ${activeItem.label}` : "Select your vehicle"}
      >
        <span aria-hidden className="mr-1">🏁</span>
        {activeItem ? activeItem.label : "Select vehicle"}
      </button>
      {open && (
        <div
          id={`${uid}-panel`}
          role="dialog"
          aria-label="My Garage"
          className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-4 rounded-[var(--brand-radius)] border border-black/10 bg-white p-4 shadow-lg"
          data-testid="garage-panel"
        >
          <section>
            <h2 className="mb-2 text-lg font-semibold">Add a vehicle</h2>
            {selects}
          </section>
          <section>
            <h2 className="mb-2 text-lg font-semibold">My Garage <span className="text-sm font-normal text-black/50">({garage.length}/3)</span></h2>
            {garage.length === 0 ? (
              <p className="text-sm text-black/60">No vehicles yet. Up to 3 are kept in this browser.</p>
            ) : (
              <ul className="space-y-1" data-testid="garage-list">
                {garage.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 text-sm" data-testid="garage-item" data-vehicle={g.id}>
                    <button
                      type="button"
                      onClick={() => (g.id !== active ? run({ action: "select", vehicle: g.id }, () => setOpen(false)) : setOpen(false))}
                      aria-pressed={g.id === active}
                      className={`flex-1 rounded px-2 py-1 text-left ${g.id === active ? "bg-primary text-white" : "hover:bg-surface"}`}
                      data-testid="garage-select"
                    >
                      {g.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => run({ action: "remove", vehicle: g.id })}
                      className="rounded px-2 py-1 text-black/50 hover:bg-surface hover:text-black"
                      aria-label={`Remove ${g.label}`}
                      data-testid="garage-remove"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {active && (
              <button type="button" onClick={() => run({ action: "clear-active" })} className="mt-2 text-sm text-primary underline" data-testid="garage-clear-active">
                Shop without a vehicle
              </button>
            )}
          </section>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** "Clear" on the fitment bar: stop filtering by the active vehicle (the garage is kept). */
export function ClearVehicleButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          const err = await postGarage({ action: "clear-active" });
          setError(err);
          if (!err) startTransition(() => router.refresh());
        }}
        className="font-semibold underline"
        data-testid="fitment-clear"
      >
        Clear
      </button>
      {error && <span role="alert" className="text-red-700">{error}</span>}
    </>
  );
}
