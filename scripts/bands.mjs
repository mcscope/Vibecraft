// Retakes the army cards' pictures (each faction's band.ts; ?mode=sprites&pose=1) into src/assets/band-<faction>-<team>.webp: node scripts/bands.mjs [faction ...] (dev server on :5179 or BASE=<url>; CANDIDATES=1: every candidate instead, blue, into docs/review/bands/ with a labeled sheet.png; OUT=<dir>, PNG=1 full size, TEAMS=0,1)
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const base = (process.env.BASE ?? 'http://localhost:5179').replace(/\/$/, ''), candidates = !!process.env.CANDIDATES;
const out = process.env.OUT ?? (candidates ? 'docs/review/bands' : 'src/assets');
mkdirSync(out, { recursive: true });
// every faction with art, unless named
const factions = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync('src/factions').filter((d) => existsSync(`src/factions/${d}/art.ts`));
const appleSilicon = process.platform === 'darwin' && execSync('sysctl -n hw.optional.arm64 2>/dev/null || echo 0').toString().trim() === '1';
const browser = await chromium.launchPersistentContext(process.env.PROFILE ?? 'profiles/.chrome-bands', {
  ...(appleSilicon ? { executablePath: 'scripts/chrome-arm64.sh' } : { channel: 'chrome' }),
  headless: true, viewport: { width: 960, height: 720 },
});

/** One picture: the page's canvas drawn down to 720 wide, saved as WebP (and the full size as PNG); false if there's no such candidate. */
async function take(query, name) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log(`${name}: page error: ${e.message}`));
  try {
    await page.goto(`${base}/?mode=sprites&pose=1&${query}`, { timeout: 900000 });
    await page.waitForFunction(() => document.title.startsWith('sprites ready'), null, { timeout: 900000 });
    if (await page.title() !== 'sprites ready') return false;
    const [webp, png] = await page.evaluate((full) => {
      const c = [...document.querySelectorAll('canvas')].pop(), small = document.createElement('canvas');
      small.width = 720; small.height = Math.round((c.height * 720) / c.width);
      const g = small.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(c, 0, 0, small.width, small.height);
      return [small.toDataURL('image/webp', 0.8), full ? c.toDataURL('image/png') : ''];
    }, !!process.env.PNG);
    writeFileSync(`${out}/${name}.webp`, Buffer.from(webp.split(',')[1], 'base64'));
    if (png) writeFileSync(`${out}/${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
    console.log(`saved ${out}/${name}.webp (${Math.round((webp.length * 0.75) / 1024)} KB)`);
    return true;
  } finally {
    await page.close();
  }
}

if (!candidates) {
  await Promise.all(factions.flatMap((f) => (process.env.TEAMS ?? '0,1').split(',').map((team) => take(`faction=${f}&team=${team}`, `band-${f}-${team}`))));
} else {
  // each faction's candidates in turn (1, 2, … until it has no more), then one sheet of them all, labeled
  const made = [];
  for (const f of factions) for (let n = 1; n <= 20 && await take(`faction=${f}&team=0&take=${n}`, `band-${f}-${n}`); n++) made.push([f, n]);
  const page = await browser.newPage();
  const shots = made.map(([f, n]) => [`${f} ${n}`, `data:image/webp;base64,${readFileSync(`${out}/band-${f}-${n}.webp`).toString('base64')}`]);
  const sheet = await page.evaluate(async (shots) => {
    const cols = 5, w = 360, h = 270, label = 34, gap = 8, rows = Math.ceil(shots.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * (w + gap) + gap; c.height = rows * (h + label + gap) + gap;
    const g = c.getContext('2d');
    g.fillStyle = '#14120e'; g.fillRect(0, 0, c.width, c.height);
    g.font = '600 20px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#f0d48a';
    for (const [i, [name, url]] of shots.entries()) {
      const img = new Image();
      img.src = url;
      await img.decode();
      const x = gap + (i % cols) * (w + gap), y = gap + Math.floor(i / cols) * (h + label + gap);
      g.drawImage(img, x, y, w, h);
      g.fillText(name, x + w / 2, y + h + 24);
    }
    return c.toDataURL('image/png');
  }, shots);
  writeFileSync(`${out}/sheet.png`, Buffer.from(sheet.split(',')[1], 'base64'));
  console.log(`saved ${out}/sheet.png`);
}
await Promise.race([browser.close(), new Promise((ok) => setTimeout(ok, 5000))]); // (the wrapped Chrome can keep closing for ever)
process.exit(0);
