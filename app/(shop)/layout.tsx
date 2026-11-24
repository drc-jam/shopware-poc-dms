import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CartProvider } from "@/components/CartProvider";
import { TourBar } from "@/components/tour/TourBar";

export const dynamic = "force-dynamic"; // persona-specific header and prices

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <CartProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <TourBar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
        <Footer />
      </div>
    </CartProvider>
  );
}
