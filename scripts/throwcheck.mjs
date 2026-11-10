// Photographs ?mode=throwcheck (src/dev/throwCheck.ts) into docs/review/<OUT>.png and prints its pixel totals:
// node scripts/throwcheck.mjs [faction] [building] (dev server on :5179 or BASE=<url>; OUT=name)
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [faction = 'wildwelds', building = 'web-tower'] = process.argv.slice(2);
const base = (process.env.BASE ?? 'http://localhost:5179').replace(/\/$/, ''), out = `docs/review/${process.env.OUT ?? `${building}-throw`}.png`;
mkdirSync('docs/review', { recursive: true });
const appleSilicon = process.platform === 'darwin' && execSync('sysctl -n hw.optional.arm64 2>/dev/null || echo 0').toString().trim() === '1';
const browser = await chromium.launch({ ...(appleSilicon ? { executablePath: 'scripts/chrome-arm64.sh' } : { channel: 'chrome' }), headless: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log(`page error: ${e.message}`));
  await page.goto(`${base}/?mode=throwcheck&faction=${faction}&building=${building}`);
  await page.waitForFunction(() => document.title === 'throwcheck ready', null, { timeout: 600000 });
  console.log(JSON.stringify(await page.evaluate(() => window.throwStats)));
  const png = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
  console.log(`saved ${out}`);
} finally {
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
}
