"use client";

import Link from "next/link";

/** Page-level error state (e.g. the Store API timed out). Keeps the header so the presenter can switch or reset. */
export default function ShopError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-3 rounded-[var(--brand-radius)] border border-black/10 bg-white p-6 text-center" role="alert" data-testid="page-error">
      <h1 className="text-3xl font-semibold">This page could not load</h1>
      <p className="text-black/70">The store did not answer in time. Try again; if it keeps failing, use Reset in the header or check the Shopware instance.</p>
      <div className="flex justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-[var(--brand-radius)] bg-primary px-4 py-2 text-white">Try again</button>
        <Link href="/" className="rounded-[var(--brand-radius)] border border-black/20 px-4 py-2">Home</Link>
        <Link href="/tour" className="rounded-[var(--brand-radius)] border border-black/20 px-4 py-2">Tour</Link>
      </div>
      {error.digest && <p className="text-xs text-black/40">Reference {error.digest}</p>}
    </div>
  );
}
