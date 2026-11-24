import type { FitStatus, Vehicle } from "@/lib/fitment";
import { ClearVehicleButton } from "./GarageSelector";

/** PLP/search bar while a vehicle is active (DEV_GUIDE §8). */
export function FitmentBar({ vehicle }: { vehicle: Vehicle }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--brand-radius)] border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary" data-testid="fitment-bar">
      <span>
        Showing parts that fit <strong data-testid="fitment-bar-vehicle">{vehicle.label}</strong>
        <span className="text-black/60"> (plus universal parts)</span>
      </span>
      <span aria-hidden>·</span>
      <ClearVehicleButton />
    </div>
  );
}

const BADGE: Record<Exclude<FitStatus, "unknown">, string> = {
  fits: "border-green-700/30 bg-green-50 text-green-800",
  "no-fit": "border-red-700/30 bg-red-50 text-red-800",
  universal: "border-primary/30 bg-primary/5 text-primary",
};

/** PDP badge: Fits your vehicle / Doesn't fit your … / Universal fit. */
export function FitmentBadge({ status, vehicle }: { status: FitStatus; vehicle: Vehicle | null }) {
  if (status === "unknown") {
    return (
      <p className="rounded-[var(--brand-radius)] border border-black/15 bg-white px-4 py-2 text-sm text-black/70" data-testid="fitment-badge" data-fit="unknown">
        Select your vehicle in the header to check fitment.
      </p>
    );
  }
  const text =
    status === "universal"
      ? "Universal fit: no vehicle-specific fitment required"
      : status === "fits"
        ? `Fits your ${vehicle?.label}`
        : `Doesn't fit your ${vehicle?.label}`;
  return (
    <p className={`rounded-[var(--brand-radius)] border px-4 py-2 text-sm font-semibold ${BADGE[status]}`} data-testid="fitment-badge" data-fit={status}>
      <span aria-hidden className="mr-1">{status === "no-fit" ? "✕" : "✓"}</span>
      {text}
    </p>
  );
}

/** Make / Model / Years table for a fitment-specific product. */
export function FitmentTable({ rows, activeKey }: { rows: { key: string; make: string; model: string; years: string }[]; activeKey?: string | null }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="fitment-heading" className="space-y-2">
      <h2 id="fitment-heading" className="text-xl font-semibold">Vehicle fitment</h2>
      <table className="w-full text-sm" data-testid="fitment-table">
        <thead>
          <tr className="border-b border-black/15 text-left text-black/60">
            <th className="py-1 pr-3 font-medium">Make</th>
            <th className="py-1 pr-3 font-medium">Model</th>
            <th className="py-1 font-medium">Years</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={`border-b border-black/5 ${r.key === activeKey ? "bg-green-50 font-semibold" : ""}`} data-testid="fitment-row" data-vehicle={r.key}>
              <td className="py-1 pr-3">{r.make}</td>
              <td className="py-1 pr-3">{r.model}</td>
              <td className="py-1">{r.years}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Small PLP card badge. */
export function FitChip({ status }: { status: FitStatus }) {
  if (status !== "fits" && status !== "universal") return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${status === "fits" ? "bg-green-100 text-green-800" : "bg-black/5 text-black/70"}`} data-testid="fit-chip" data-fit={status}>
      {status === "fits" ? "Fits your vehicle" : "Universal"}
    </span>
  );
}
