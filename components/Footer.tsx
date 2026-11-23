import { brand } from "@/theme/brand";

export function Footer() {
  return (
    <footer className="border-t border-black/10 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-black/60">
        <p>
          <strong className="text-ink">{brand.name}</strong> is a fictional demo brand. All products, prices, people and
          companies shown are fictional. Checkout is disabled.
        </p>
      </div>
    </footer>
  );
}
