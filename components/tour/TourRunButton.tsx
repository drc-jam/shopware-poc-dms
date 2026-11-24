"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** One click per tour step: switch persona, stage the scene, open the deep link (POST /api/tour). */
export function TourRunButton({ step, run = 0, label, variant = "primary", testId }: { step: string; run?: number; label: string; variant?: "primary" | "secondary" | "bar"; testId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const cls = {
    primary: "rounded-[var(--brand-radius)] bg-accent px-4 py-2 text-sm font-semibold text-white",
    secondary: "rounded-[var(--brand-radius)] border border-black/20 bg-white px-3 py-2 text-sm",
    bar: "rounded-[var(--brand-radius)] bg-white px-3 py-1 text-sm font-semibold text-primary",
  }[variant];
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        className={`${cls} disabled:cursor-wait disabled:opacity-60`}
        data-testid={testId ?? `tour-run-${step}-${run}`}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/tour", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", step, run }) });
            const data = (await res.json().catch(() => null)) as { href?: string; errors?: { title?: string }[] } | null;
            if (!res.ok || !data?.href) {
              setError(data?.errors?.[0]?.title ?? `Could not start ${step} (HTTP ${res.status})`);
              return;
            }
            startTransition(() => {
              router.push(data.href!);
              router.refresh();
            });
          } catch {
            setError("Network error");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparing…" : label}
      </button>
      {error && <span role="alert" className="max-w-xs text-xs text-red-700">{error}</span>}
    </span>
  );
}

export function TourExitButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-sm text-white/80 underline"
      data-testid="tour-exit"
      onClick={async () => {
        await fetch("/api/tour", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "exit" }) });
        router.refresh();
      }}
    >
      Exit tour
    </button>
  );
}
