import { PERSONAS, type ActivePersona } from "@/lib/personas";

/** Shown instead of a B2B page when the active persona may not use it. */
export function B2BNotice({ persona, message }: { persona: ActivePersona; message: string }) {
  return (
    <div className="rounded-[var(--brand-radius)] border border-black/10 bg-white p-8 text-center" data-testid="b2b-notice">
      <p className="text-lg font-semibold">{message}</p>
      <p className="mt-1 text-sm text-black/60">You are browsing as {PERSONAS[persona].label}.</p>
    </div>
  );
}
