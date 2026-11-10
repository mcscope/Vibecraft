// Pre-bake the shipped factions' and lands' art for a production build (see src/art/prebaked.ts):
// serves the game, opens ?mode=prebake in Chrome, and saves each baked art as JSON + WebP pages. Each army's sprite
// pixels are reported against the budget (scripts/spriteBudget.mjs), anything over it flagged.
// Usage: node scripts/prebake.mjs [outDir=dist/baked] (ONLY=fenfolk.2f5fbf: just the arts whose names start so)
import { mkdir, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { formatReport, spriteReport } from './spriteBudget.mjs';

const out = process.argv[2] ?? 'dist/baked';
await mkdir(out, { recursive: true });
const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
// a real GPU bakes in seconds; software GL takes minutes
// (Chrome's native Apple Silicon build: started from an Intel-build Node, Chrome runs translated, many times slower)
const appleSilicon = process.platform === 'darwin' && execSync('sysctl -n hw.optional.arm64 2>/dev/null || echo 0').toString().trim() === '1';
const browser = await chromium.launch({ ...(appleSilicon ? { executablePath: 'scripts/chrome-arm64.sh' } : { channel: 'chrome' }), args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
try {
  const open = async () => {
    const page = await browser.newPage();
    await page.goto(`${url}?mode=prebake`);
    await page.waitForFunction(() => document.title === 'prebake ready', null, { timeout: 120000 });
    return page;
  };
  const first = await open();
  const keys = (await first.evaluate(() => window.prebakeKeys())).filter((k) => !process.env.ONLY || process.env.ONLY.split(',').some((o) => k.startsWith(o)));
  const over = [];
  await first.close();
  for (const key of keys) {
    const t = Date.now();
    // a fresh page for each bake: one page baking everything slows down and loses its GL context
    const page = await open();
    const { json, pages, cpu } = await page.evaluate((k) => window.prebake(k), key);
    await page.close();
    await writeFile(join(out, `${key}.json`), JSON.stringify({ pages: pages.length, cpu, art: JSON.parse(json) }));
    let bytes = 0;
    for (const [i, d] of pages.entries()) { const buf = Buffer.from(d.split(',')[1], 'base64'); bytes += buf.length; await writeFile(join(out, `${key}.${i}.webp`), buf); }
    console.log(`${key}: ${pages.length} pages, ${(bytes / 1e6).toFixed(1)} MB, ${((Date.now() - t) / 1000).toFixed(0)} s`);
    if (key.startsWith('biome.')) continue;
    const report = spriteReport(JSON.parse(json));
    console.log(formatReport(key, report, 8));
    if (report.armyOver || report.over.length) over.push(key);
  }
  if (over.length) console.log(`\nOVER THE SPRITE BUDGET: ${over.join(', ')} (npm run sprites for the whole table; README "Sprite budget" says what to do)`);
} finally {
  // either close can wait forever (Playwright on a Chrome that has already gone, Vite on its file watcher),
  // so each gets a few seconds
  const atMost = (p) => Promise.race([p, new Promise((r) => setTimeout(r, 5000))]);
  await atMost(browser.close());
  await atMost(server.close());
}
// whatever Vite still holds open would keep the process (and the build after it) waiting
process.exit(0);
