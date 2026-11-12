/**
 * Renders the TRAVIO PWA icons (PNG) from the SVG source using the
 * pre-installed Playwright Chromium. Run: node scripts/generate-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { iconSvg } from './icon.svg.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('favicon.svg', out), iconSvg({ rounded: true }));

const targets = [
  { file: 'icon-192.png', size: 192, svg: iconSvg({ rounded: true }) },
  { file: 'icon-512.png', size: 512, svg: iconSvg({ rounded: true }) },
  // iOS applies its own corner mask → full-bleed square
  { file: 'apple-touch-icon.png', size: 180, svg: iconSvg({ rounded: false }) },
  // Maskable: full bleed, motif within the 80 % safe zone
  { file: 'icon-maskable-512.png', size: 512, svg: iconSvg({ rounded: false, scale: 0.78 }) },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${t.svg.replace('width="512" height="512"', `width="${t.size}" height="${t.size}"`)}</body></html>`);
  const buf = await page.locator('svg').screenshot({ omitBackground: true });
  writeFileSync(new URL(t.file, out), buf);
  console.log('wrote', t.file);
}
await browser.close();
