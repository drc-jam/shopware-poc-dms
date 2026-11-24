/** Shown while a page's Store API calls run (navigation, tour steps). */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading" data-testid="page-loading">
      <div className="h-9 w-64 rounded bg-black/10" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-[var(--brand-radius)] border border-black/5 bg-white p-3">
            <div className="aspect-square rounded bg-black/5" />
            <div className="h-4 w-3/4 rounded bg-black/10" />
            <div className="h-4 w-1/3 rounded bg-black/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
