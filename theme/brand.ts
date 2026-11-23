// Brand tokens (DEV_GUIDE §9.5). Swap this file + public/brand/logo.svg to re-skin for a prospect.
// Never use a real prospect's name, logo or imagery in the template build.
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "Trailhead Parts Supply (Demo)",
  logo: "/brand/logo.svg",
  colors: { primary: "#1F3A5F", accent: "#E4572E", surface: "#F6F5F2", ink: "#1B1B1B" },
  fonts: { heading: "Barlow Condensed", body: "Inter" },
  radius: "6px",
} as const;

export type Brand = typeof brand;

/** CSS custom properties consumed by app/globals.css (Tailwind @theme). */
export function brandCssVars(b: Brand = brand): Record<string, string> {
  return {
    "--brand-primary": b.colors.primary,
    "--brand-accent": b.colors.accent,
    "--brand-surface": b.colors.surface,
    "--brand-ink": b.colors.ink,
    "--brand-radius": b.radius,
    "--brand-font-heading": `"${b.fonts.heading}", ui-sans-serif, system-ui, sans-serif`,
    "--brand-font-body": `"${b.fonts.body}", ui-sans-serif, system-ui, sans-serif`,
  };
}

/** Google Fonts stylesheet URL for the brand fonts (runtime link, so re-skinning needs no code change). */
export function brandFontsHref(b: Brand = brand): string {
  const fam = (f: string, w: string) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@${w}`;
  return `https://fonts.googleapis.com/css2?${fam(b.fonts.heading, "500;600;700")}&${fam(b.fonts.body, "400;500;600")}&display=swap`;
}
