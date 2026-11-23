"use client";

export default function ShopError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-3 rounded-[var(--brand-radius)] border border-black/10 bg-white p-6 text-center" role="alert">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="text-black/70">The store could not be reached. If the Shopware instance is not connected yet, this is expected.</p>
      <button type="button" onClick={reset} className="rounded-[var(--brand-radius)] bg-primary px-4 py-2 text-white">Try again</button>
    </div>
  );
}
