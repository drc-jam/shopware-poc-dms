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
const shockBody = (x, s = 1) =>
  `<g transform="translate(${x} 0) scale(${s} 1)"><rect x="-34" y="230" width="68" height="250" rx="12" fill="none" stroke-width="16"/>` +
  `<line x1="0" y1="480" x2="0" y2="560" stroke-width="14"/></g>`;
const glyphs = {
  "stock-mount-shock": `${shockBody(400)}<circle cx="400" cy="195" r="32" fill="none" stroke-width="14"/><circle cx="400" cy="592" r="32" fill="none" stroke-width="14"/>`,
  "heim-mount-shock": `${shockBody(400)}<rect x="440" y="250" width="70" height="140" rx="12" fill="none" stroke-width="12"/><line x1="434" y1="300" x2="440" y2="300" stroke-width="10"/>` +
    `<circle cx="400" cy="185" r="38" fill="none" stroke-width="12"/><circle cx="400" cy="185" r="12"/><circle cx="400" cy="600" r="38" fill="none" stroke-width="12"/><circle cx="400" cy="600" r="12"/>`,
  "shock-package": [250, 350, 450, 550].map((x) => `<g transform="translate(0 40) scale(1 0.85)">${shockBody(x, 0.7)}<circle cx="${x}" cy="200" r="22" fill="none" stroke-width="10"/><circle cx="${x}" cy="590" r="22" fill="none" stroke-width="10"/></g>`).join(""),
  "coil-over-kit": `${shockBody(400)}<path d="M330 250 l140 25 l-140 25 l140 25 l-140 25 l140 25 l-140 25 l140 25 l-140 25 l140 25" fill="none" stroke-width="12" stroke-linejoin="round"/>` +
    `<rect x="320" y="232" width="160" height="16" rx="4"/><rect x="320" y="500" width="160" height="16" rx="4"/>`,
  "shock-ends": `<circle cx="400" cy="300" r="95" fill="none" stroke-width="24"/><circle cx="400" cy="300" r="35" fill="none" stroke-width="14"/><rect x="370" y="395" width="60" height="170" rx="8" fill="none" stroke-width="16"/>` +
    Array.from({ length: 6 }, (_, i) => `<line x1="372" y1="${420 + i * 24}" x2="428" y2="${430 + i * 24}" stroke-width="6"/>`).join(""),
  "shock-mounts": `<path d="M220 520 h360 v-60 h-300 v-240 h-60 z" fill="none" stroke-width="18" stroke-linejoin="round"/><circle cx="250" cy="300" r="18" fill="none" stroke-width="10"/><circle cx="420" cy="490" r="18" fill="none" stroke-width="10"/><circle cx="520" cy="490" r="18" fill="none" stroke-width="10"/>`,
  "rebuild-components": `<circle cx="400" cy="380" r="170" fill="none" stroke-width="24"/><circle cx="400" cy="380" r="40" fill="none" stroke-width="16"/>` +
    Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3; return `<circle cx="${400 + 105 * Math.cos(a)}" cy="${380 + 105 * Math.sin(a)}" r="20" fill="none" stroke-width="10"/>`; }).join(""),
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
