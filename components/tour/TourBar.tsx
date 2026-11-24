import Link from "next/link";
import { cookies } from "next/headers";
import { nextStep, stepById, tour, TOUR_COOKIE } from "@/lib/tour";
import { TourExitButton, TourRunButton } from "./TourRunButton";

/** Presenter bar on every page while a tour step is active: where we are, what to expect, what's next. */
export async function TourBar() {
  const step = stepById((await cookies()).get(TOUR_COOKIE)?.value);
  if (!step) return null;
  const index = tour.steps.findIndex((s) => s.id === step.id) + 1;
  const next = nextStep(step.id);
  return (
    <aside aria-label="Presenter tour" className="bg-ink text-white" data-testid="tour-bar" data-step={step.id}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
        <Link href={`/tour#${step.id}`} className="font-semibold underline-offset-2 hover:underline" data-testid="tour-bar-step">
          Tour {index}/{tour.steps.length} · {step.id} {step.title}
        </Link>
        <span className="min-w-0 flex-1 text-white/80" data-testid="tour-bar-expected">Expect: {step.expected}</span>
        <span className="flex flex-wrap items-center gap-2">
          {step.runs.slice(1).map((r, i) => (
            <TourRunButton key={r.label} step={step.id} run={i + 1} label={r.label} variant="bar" />
          ))}
          {next ? (
            <TourRunButton step={next.id} label={`Next: ${next.id} ›`} variant="bar" testId="tour-next" />
          ) : (
            <Link href="/tour" className="rounded-[var(--brand-radius)] bg-white px-3 py-1 font-semibold text-primary" data-testid="tour-done">Tour complete</Link>
          )}
          <TourExitButton />
        </span>
      </div>
    </aside>
  );
}
