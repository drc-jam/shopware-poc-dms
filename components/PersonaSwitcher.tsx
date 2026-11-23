"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PERSONAS, type ActivePersona } from "@/lib/personas";

const ORDER: ActivePersona[] = ["guest", "retail", "dealer-admin", "dealer-junior"];

interface Props {
  persona: ActivePersona;
  displayName: string | null;
  company: string | null;
  warning: string | null;
}

/** One-click persona switcher (DEV_GUIDE §9.3). Logs in server-side with env credentials. */
export function PersonaSwitcher({ persona, displayName, company, warning }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<ActivePersona | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(body: object, marker: ActivePersona | "reset") {
    setBusy(marker);
    setError(null);
    try {
      const res = await fetch("/api/persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { errors?: { title?: string }[] } | null;
        setError(data?.errors?.[0]?.title ?? `Switch failed (HTTP ${res.status})`);
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  }

  const who = displayName ? `${displayName}${company ? ` · ${company}` : ""}` : PERSONAS[persona].description;

  return (
    <div className="flex min-w-0 flex-col items-start gap-1 sm:items-end" data-testid="persona-switcher">
      <div className="min-w-0 max-w-full text-xs leading-tight sm:text-right">
        <span className="font-semibold text-primary" data-testid="persona-current">{PERSONAS[persona].label}</span>
        <span className="block max-w-72 truncate text-black/60" data-testid="persona-who" title={who}>{who}</span>
      </div>
      <div role="group" aria-label="Switch demo persona" className="flex overflow-hidden rounded-[var(--brand-radius)] border border-black/15">
        {ORDER.map((key) => {
          const active = key === persona;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              disabled={pending || busy !== null}
              onClick={() => !active && post({ action: "switch", key }, key)}
              title={PERSONAS[key].description}
              data-testid={`persona-${key}`}
              className={`whitespace-nowrap px-2 py-1 text-xs font-medium sm:px-2.5 transition-colors disabled:cursor-wait ${
                active ? "bg-primary text-white" : "bg-white text-ink hover:bg-surface"
              } ${busy === key ? "opacity-60" : ""}`}
            >
              {PERSONAS[key].short}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => confirm("Reset the demo? This clears every persona's cart and the garage.") && post({ action: "reset" }, "reset")}
          disabled={pending || busy !== null}
          className="border-l border-black/15 bg-white px-2 py-1 text-xs text-black/60 hover:bg-surface"
          data-testid="persona-reset"
          title="Clear all persona carts and the garage, then re-login"
        >
          Reset
        </button>
      </div>
      {(error || warning) && (
        <p role="alert" className="text-xs text-red-700" data-testid="persona-error">{error ?? warning}</p>
      )}
    </div>
  );
}
