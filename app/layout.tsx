import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { brand, brandCssVars, brandFontsHref } from "@/theme/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: "Powersports B2B commerce demo (fictional brand).",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-US" style={brandCssVars() as CSSProperties}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={brandFontsHref()} />
      </head>
      <body className="min-h-screen bg-surface text-ink antialiased">{children}</body>
    </html>
  );
}
