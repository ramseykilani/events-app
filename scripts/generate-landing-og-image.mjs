#!/usr/bin/env node
// Renders apps/events/landing/og-image.png — the 1200×630 link-preview card
// for the landing and FAQ pages — from the landing page's own hero, so the
// card always matches the live copy and the Paper tokens. Rerun after any
// hero copy change:
//
//   node scripts/generate-landing-og-image.mjs
//
// The month label is hidden: the card is a static image, and a named month
// would go stale.

import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const landing = path.join(root, 'apps/events/landing');
const out = path.join(landing, 'og-image.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(landing, 'index.html')).href);
await page.evaluate(() => localStorage.removeItem('theme_preference'));
await page.reload();
await page.addStyleTag({
  content: `
    body { padding: 0 !important; }
    .beta, .how, .hero-actions, footer, #mock-month, #theme-swatch { display: none !important; }
    header { position: absolute; top: 40px; left: 72px; padding: 0 !important; margin: 0 !important; }
    .hero {
      max-width: none !important;
      height: 630px;
      margin: 0 !important;
      padding: 0 72px !important;
      grid-template-columns: 1fr 440px !important;
      gap: 64px !important;
    }
    .hero h1 { font-size: 54px !important; }
    .mock { max-width: 440px !important; }
  `,
});
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log(`wrote ${path.relative(root, out)}`);
