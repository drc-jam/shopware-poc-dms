import type { Metadata } from "next";
import { PERSONAS } from "@/lib/personas";
import { plannedMinutes, tour, tourError, TOUR_BUDGET_MINUTES } from "@/lib/tour";
import { TourRunButton } from "@/components/tour/TourRunButton";

export const metadata: Metadata = { title: "Guided tour" };

const fmt = (m: number) => (Number.isInteger(m) ? `${m}` : m.toFixed(1));

/** S1–S10 presenter tour (DEV_GUIDE §9.4). Text lives in data/tour.json. */
export default function TourPage() {
  if (tourError || !tour.steps.length) {
    return (
      <div role="alert" className="mx-auto max-w-2xl space-y-2 rounded-[var(--brand-radius)] border border-red-700/30 bg-red-50 p-6" data-testid="tour-invalid">
        <h1 className="text-3xl font-semibold">The tour script needs fixing</h1>
        <p className="text-sm text-red-900">data/tour.json did not pass validation, so the tour is hidden. The rest of the demo works.</p>
        {tourError && <p className="font-mono text-xs text-red-900">{tourError}</p>}
      </div>
    );
  }
  const total = plannedMinutes();
  const pillars = [...new Set(tour.steps.map((s) => s.pillar))];
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-widest text-black/60">Presenter</p>
          <h1 className="text-4xl font-semibold" data-testid="tour-title">Guided tour</h1>
          <p className="mt-1 max-w-2xl text-black/70">
            {tour.steps.length} steps across {pillars.join(", ")}. Each button switches persona, prepares the cart or vehicle, and opens the right page.
            A bar at the top keeps the expected result and the next step in view. Use <strong>Reset</strong> in the header before a new audience.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <p className="text-sm text-black/60" data-testid="tour-minutes">
            Planned: <strong>{fmt(total)} min</strong> of {TOUR_BUDGET_MINUTES}
          </p>
          <TourRunButton step={tour.steps[0]!.id} label="Start tour" testId="tour-start" />
        </div>
      </header>

      <ol className="space-y-4">
        {tour.steps.map((s) => (
          <li key={s.id} id={s.id} className="scroll-mt-24 rounded-[var(--brand-radius)] border border-black/10 bg-white p-5" data-testid="tour-step" data-step={s.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-black/50">{s.id} · {s.pillar} · ~{fmt(s.minutes)} min</p>
                <h2 className="text-2xl font-semibold">{s.title}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {s.runs.map((r, i) => (
                  <TourRunButton key={r.label} step={s.id} run={i} label={`${r.label}`} variant={i === 0 ? "primary" : "secondary"} />
                ))}
              </div>
            </div>
            <p className="mt-1 text-sm text-black/60">
              {s.runs.map((r) => PERSONAS[r.persona].label).filter((v, i, a) => a.indexOf(v) === i).join(" → ")}
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-black/80" data-testid="tour-points">
              {s.talkingPoints.map((t) => <li key={t}>{t}</li>)}
            </ul>
            <p className="mt-3 rounded bg-surface px-3 py-2 text-sm"><strong>Expected:</strong> {s.expected}</p>
            {s.dmsRef && (
              <p className="mt-2 text-xs text-black/50">
                DMS reference: <a href={s.dmsRef.url} target="_blank" rel="noreferrer noopener" className="underline">{s.dmsRef.label}</a>
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
