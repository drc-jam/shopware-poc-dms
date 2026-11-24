import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-3 text-center" data-testid="not-found">
      <h1 className="text-4xl font-semibold">Not found</h1>
      <p className="text-black/60">That page, product or list does not exist in this demo catalog. If the catalog was just re-seeded, re-deploy so links match.</p>
      <div className="flex justify-center gap-4">
        <Link href="/" className="text-primary underline">Home</Link>
        <Link href="/tour" className="text-primary underline">Guided tour</Link>
      </div>
    </div>
  );
}
