#!/usr/bin/env node
// Generates neutral placeholder product shots (one per leaf category) into data/fixture/media/.
// Original generated artwork: no scraped or prospect assets (DEV_GUIDE §7.1).
// Uses the pre-installed Playwright Chromium to rasterize an inline SVG to PNG.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const OUT = path.resolve(import.meta.dirname, "../data/fixture/media");

// Simple geometric glyphs per category (stroke-only, brand-neutral).
const glyphs = {
  "brakes": `<circle cx="400" cy="380" r="170" fill="none" stroke-width="28"/><circle cx="400" cy="380" r="55" fill="none" stroke-width="20"/><path d="M520 250 a170 170 0 0 1 40 120 l-60 0 a110 110 0 0 0 -25 -80z" stroke-width="16"/>`,
  "drive-axles": `<rect x="170" y="360" width="460" height="40" rx="20" stroke-width="18" fill="none"/><circle cx="170" cy="380" r="70" fill="none" stroke-width="22"/><circle cx="630" cy="380" r="70" fill="none" stroke-width="22"/>`,
  "suspension": `<path d="M400 190 v40 l-60 25 l120 40 l-120 40 l120 40 l-120 40 l60 25 v40" fill="none" stroke-width="20" stroke-linejoin="round"/><rect x="350" y="150" width="100" height="40" rx="8" fill="none" stroke-width="16"/><rect x="350" y="530" width="100" height="40" rx="8" fill="none" stroke-width="16"/>`,
  "filters": `<rect x="290" y="210" width="220" height="330" rx="30" fill="none" stroke-width="22"/>${Array.from({ length: 7 }, (_, i) => `<line x1="${320 + i * 27}" y1="250" x2="${320 + i * 27}" y2="500" stroke-width="10"/>`).join("")}`,
  "gaskets-seals": `<rect x="200" y="240" width="400" height="280" rx="60" fill="none" stroke-width="22"/><circle cx="330" cy="380" r="60" fill="none" stroke-width="16"/><circle cx="470" cy="380" r="60" fill="none" stroke-width="16"/>`,
  "ignition": `<rect x="370" y="170" width="60" height="90" rx="10" fill="none" stroke-width="16"/><rect x="340" y="260" width="120" height="70" rx="8" fill="none" stroke-width="18"/><rect x="365" y="330" width="70" height="150" fill="none" stroke-width="16"/><line x1="400" y1="480" x2="400" y2="560" stroke-width="16"/>`,
  "batteries": `<rect x="220" y="250" width="360" height="260" rx="20" fill="none" stroke-width="22"/><rect x="270" y="210" width="60" height="40" fill="none" stroke-width="16"/><rect x="470" y="210" width="60" height="40" fill="none" stroke-width="16"/><path d="M300 380 h50 M325 355 v50 M450 380 h50" stroke-width="16"/>`,
  "lighting": `<rect x="160" y="300" width="480" height="140" rx="40" fill="none" stroke-width="22"/>${Array.from({ length: 5 }, (_, i) => `<circle cx="${230 + i * 85}" cy="370" r="28" fill="none" stroke-width="12"/>`).join("")}`,
  "tires-wheels": `<circle cx="400" cy="380" r="190" fill="none" stroke-width="40" stroke-dasharray="30 14"/><circle cx="400" cy="380" r="110" fill="none" stroke-width="18"/><circle cx="400" cy="380" r="25" stroke-width="12" fill="none"/>`,
  "shop-supplies": `<rect x="300" y="250" width="200" height="290" rx="24" fill="none" stroke-width="22"/><rect x="355" y="190" width="90" height="60" rx="10" fill="none" stroke-width="16"/><line x1="330" y1="360" x2="470" y2="360" stroke-width="12"/><line x1="330" y1="400" x2="440" y2="400" stroke-width="12"/>`,
};

const svg = (name, glyph) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
<rect width="800" height="800" fill="#F6F5F2"/><rect x="24" y="24" width="752" height="752" rx="24" fill="#FFFFFF" stroke="#E2DFD8" stroke-width="2"/>
<g stroke="#1F3A5F" fill="#1F3A5F" stroke-linecap="round">${glyph}</g>
<text x="400" y="680" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#5A6472">${name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</text>
<text x="400" y="720" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#8A929C">Demo placeholder image</text></svg>`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 1 });
for (const [name, glyph] of Object.entries(glyphs)) {
  await page.setContent(`<html><body style="margin:0">${svg(name, glyph)}</body></html>`);
  await page.locator("svg").screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`wrote media/${name}.png`);
}
await browser.close();
