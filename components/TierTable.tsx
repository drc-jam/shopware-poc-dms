import { money, type Tier } from "@/lib/pricing";

/** Quantity tier table (S3). Dealer personas only; rendered when more than one tier exists. */
export function TierTable({ tiers, activeQty }: { tiers: Tier[]; activeQty?: number }) {
  if (tiers.length < 2) return null;
  return (
    <table className="w-full text-sm" data-testid="tier-table">
      <caption className="pb-1 text-left text-xs font-semibold uppercase tracking-wide text-black/60">Quantity pricing</caption>
      <thead>
        <tr className="border-b border-black/10 text-left text-black/60">
          <th className="py-1 font-medium">Quantity</th>
          <th className="py-1 text-right font-medium">Unit price</th>
          <th className="py-1 text-right font-medium">Save vs retail</th>
        </tr>
      </thead>
      <tbody>
        {tiers.map((t) => {
          const active = activeQty !== undefined && activeQty >= t.from && (t.to === null || activeQty <= t.to);
          return (
            <tr key={t.from} className={`border-b border-black/5 ${active ? "bg-accent/10 font-semibold" : ""}`} data-testid="tier-row">
              <td className="py-1.5">{t.to === null ? `${t.from}+` : t.from === t.to ? `${t.from}` : `${t.from}–${t.to}`}</td>
              <td className="py-1.5 text-right tabular-nums">{money(t.unitPrice)}</td>
              <td className="py-1.5 text-right tabular-nums text-black/60">
                {t.listPrice ? `${Math.round((1 - t.unitPrice / t.listPrice) * 100)}%` : ""}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
