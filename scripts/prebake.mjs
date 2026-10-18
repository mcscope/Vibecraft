// Pre-bake the shipped factions' and lands' art for a production build (see src/art/prebaked.ts):
// serves the game, opens ?mode=prebake in Chrome, and saves each baked art as JSON + WebP pages.
// Usage: node scripts/prebake.mjs [outDir=dist/baked]
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? 'dist/baked';
await mkdir(out, { recursive: true });
const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
// a real GPU bakes in seconds; software GL takes minutes
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
try {
  const page = await browser.newPage();
  await page.goto(`${url}?mode=prebake`);
  await page.waitForFunction(() => document.title === 'prebake ready', null, { timeout: 120000 });
  const keys = await page.evaluate(() => window.prebakeKeys());
  for (const key of keys) {
    const t = Date.now();
    const { json, pages } = await page.evaluate((k) => window.prebake(k), key);
    await writeFile(join(out, `${key}.json`), JSON.stringify({ pages: pages.length, art: JSON.parse(json) }));
    let bytes = 0;
    for (const [i, d] of pages.entries()) { const buf = Buffer.from(d.split(',')[1], 'base64'); bytes += buf.length; await writeFile(join(out, `${key}.${i}.webp`), buf); }
    console.log(`${key}: ${pages.length} pages, ${(bytes / 1e6).toFixed(1)} MB, ${((Date.now() - t) / 1000).toFixed(0)} s`);
  }
} finally {
  await browser.close();
  await server.close();
}
