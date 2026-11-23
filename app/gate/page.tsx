import type { Metadata } from "next";
import Image from "next/image";
import { brand } from "@/theme/brand";
import { safeNextPath } from "@/lib/gate";

export const metadata: Metadata = { title: "Demo access" };

export default async function GatePage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        method="post"
        action="/api/gate"
        className="w-full max-w-sm space-y-4 rounded-[var(--brand-radius)] border border-black/10 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <Image src={brand.logo} alt="" width={32} height={32} />
          <span className="font-heading text-lg font-semibold text-primary">{brand.name}</span>
        </div>
        <h1 className="text-2xl font-semibold">Demo access</h1>
        <p className="text-sm text-black/60">This is a private demo. Enter the shared demo password.</p>
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm font-medium" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          className="w-full rounded-[var(--brand-radius)] border border-black/20 px-3 py-2"
        />
        {sp.error && (
          <p role="alert" className="text-sm text-red-700" data-testid="gate-error">That password is not correct.</p>
        )}
        <button type="submit" className="w-full rounded-[var(--brand-radius)] bg-primary px-4 py-2 font-medium text-white hover:opacity-90">
          Enter demo
        </button>
      </form>
    </main>
  );
}
