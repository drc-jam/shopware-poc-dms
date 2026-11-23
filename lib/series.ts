import "server-only";
import site from "@/data/fixture/site-project.json";

// Series metadata for the PDP callout ("Mix any Series C items: 10+ save 5%…").
// The discount itself is applied by Shopware promotions (DEV_GUIDE §6.4); this is display copy only.
export interface SeriesInfo {
  code: string;
  label: string;
  tiers: { minQty: number; discountPct: number }[];
}

const SERIES: Record<string, SeriesInfo> = Object.fromEntries(
  site.series.map((s) => [s.code, { code: s.code, label: s.label, tiers: s.tiers }]),
);

export const seriesInfo = (code: string | null): SeriesInfo | null => (code ? (SERIES[code] ?? null) : null);

export const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")}%`;

export function seriesCopy(s: SeriesInfo): string {
  return `Mix and match any ${s.label} shocks (front, rear, any chassis): ${s.tiers.map((t) => `${t.minQty}+ save ${pct(t.discountPct)}`).join(", ")}`;
}
