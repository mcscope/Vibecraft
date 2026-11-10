// Retakes the army cards' pictures (each faction's band.ts; ?mode=sprites&pose=1) into src/assets/band-<faction>-<team>.webp: node scripts/bands.mjs [faction ...] (dev server on :5179 or BASE=<url>; CANDIDATES=1: every candidate instead, blue, and the whole game's pictures (src/dev/gameBand.ts), into docs/review/bands/ with a labeled sheet.png; OUT=<dir>, PNG=1 full size, TEAMS=0,1; BANNERS=1: the front page's staged banners into docs/review/banners/staged-NN.jpg, photographed on the real page, with staged-sheet.png; ONLY=3,5: just those)
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

/**
 * One picture: the page's canvas drawn down to 720 wide and saved as WebP (and the full size as PNG), or with `wide`
 * kept at full size as JPEG; its label on the page (a candidate's name), or false if there's no such picture.
 */
async function take(query, name, wide = false, tries = 3, dir = out) {
  // (the dev server can reload the page under us when a source file changes: try again)
  try { return await takeOnce(query, name, wide, dir); } catch (e) { if (tries <= 1) throw e; console.log(`${name}: ${e.message.split('\n')[0]}; again`); return take(query, name, wide, tries - 1, dir); }
}
async function takeOnce(query, name, wide, dir) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log(`${name}: page error: ${e.message}`));
  try {
    await page.goto(`${base}/?mode=sprites&pose=1&${query}`, { timeout: 900000 });
    await page.waitForFunction(() => document.title.startsWith('sprites ready'), null, { timeout: 900000 });
    if (await page.title() !== 'sprites ready') return false;
    const [pic, png, label] = await page.evaluate(([full, wide]) => {
      const c = [...document.querySelectorAll('canvas')].pop(), small = document.createElement('canvas');
      if (wide) return [c.toDataURL('image/jpeg', 0.86), '', document.body.dataset.label ?? ''];
      small.width = 720; small.height = Math.round((c.height * 720) / c.width);
      const g = small.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(c, 0, 0, small.width, small.height);
      return [small.toDataURL('image/webp', 0.8), full ? c.toDataURL('image/png') : '', document.body.dataset.label ?? ''];
    }, [!!process.env.PNG, wide]);
    const file = `${dir}/${name}.${wide ? 'jpg' : 'webp'}`;
    writeFileSync(file, Buffer.from(pic.split(',')[1], 'base64'));
    if (png) writeFileSync(`${dir}/${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
    console.log(`saved ${file} (${Math.round((pic.length * 0.75) / 1024)} KB)`);
    return label || true;
  } finally {
    await page.close();
  }
}

if (process.env.BANNERS) {
  // the front page's banner, staged (src/dev/gameBand.ts BANNERS): each rendered, then put on the real front page
  // (the request for menu-bg.jpg answered with it) and photographed at desktop sizes and on a phone; one sheet of them
  const dir = process.env.OUT ?? 'docs/review/banners', shots = process.env.SHOTS ?? join(tmpdir(), 'vibecraft-banner-shots');
  mkdirSync(dir, { recursive: true }); mkdirSync(shots, { recursive: true });
  const all = process.env.BANNERS === '1' && !process.env.ONLY;
  const numbers = all ? Array.from({ length: 40 }, (_, i) => i + 1) : (process.env.ONLY ?? process.env.BANNERS).split(',').map(Number);
  const made = [];
  for (const n of numbers) {
    const name = `staged-${String(n).padStart(2, '0')}`;
    const label = await take(`banner=${n}`, name, true, 3, dir);
    if (!label) { if (all) break; continue; }
    for (const [w, h] of [[1440, 900], [1920, 1080], [390, 844]]) {
      const page = await browser.newPage();
      await page.setViewportSize({ width: w, height: h });
      await page.route('**/menu-bg.jpg*', (r) => r.fulfill({ path: `${dir}/${name}.jpg`, contentType: 'image/jpeg' }));
      await page.goto(`${base}/`, { timeout: 120000 });
      await page.waitForSelector('.menu-hero h1');
      await page.waitForTimeout(1500);
      const box = await page.evaluate(() => { const r = document.querySelector('.menu-hero').getBoundingClientRect(); return { x: 0, y: 0, width: innerWidth, height: Math.round(r.bottom + 30) }; });
      await page.screenshot({ path: `${shots}/${name}-${w}.png`, clip: box });
      await page.close();
    }
    console.log(`photographed ${name} on the front page (${shots})`);
    made.push([n, typeof label === 'string' ? label : '']);
  }
  // the sheet: the best first (★1, ★2 …), then by number; each the desktop header with a phone beside it
  const rank = ([n, label]) => { const m = /★(\d+)/.exec(label); return (m ? +m[1] : 100) * 100 + n; };
  const rows = [...made].sort((a, b) => rank(a) - rank(b)).map(([n, label]) => {
    const name = `staged-${String(n).padStart(2, '0')}`, png = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
    return [`${String(n).padStart(2, '0')} ${label.replace(/★\d+ /, (m) => m)}`, png(`${shots}/${name}-1440.png`), png(`${shots}/${name}-390.png`)];
  });
  if (rows.length && !process.env.NOSHEET) {
    const page = await browser.newPage();
    const sheet = await page.evaluate(async (rows) => {
      const load = async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; };
      const imgs = await Promise.all(rows.map(async ([, a, b]) => [await load(a), await load(b)]));
      const W = 1100, gap = 14, label = 30, deskW = 860;
      const heights = imgs.map(([a, b]) => Math.max((a.height * deskW) / a.width, (b.height * 220) / b.width));
      const c = document.createElement('canvas');
      c.width = W; c.height = heights.reduce((s, h) => s + h + label + gap, gap);
      const g = c.getContext('2d');
      g.fillStyle = '#14120e'; g.fillRect(0, 0, c.width, c.height);
      let y = gap;
      rows.forEach(([name], i) => {
        const [a, b] = imgs[i];
        g.fillStyle = /★/.test(name) ? '#9fe08a' : '#f0d48a'; g.font = '600 20px sans-serif'; g.fillText(name, gap, y + 21);
        g.drawImage(a, gap, y + label, deskW, (a.height * deskW) / a.width);
        g.drawImage(b, gap * 2 + deskW, y + label, 220, (b.height * 220) / b.width);
        y += heights[i] + label + gap;
      });
      return c.toDataURL('image/png');
    }, rows);
    writeFileSync(`${dir}/staged-sheet.png`, Buffer.from(sheet.split(',')[1], 'base64'));
    console.log(`saved ${dir}/staged-sheet.png`);
  }
} else if (!candidates) {
  await Promise.all(factions.flatMap((f) => (process.env.TEAMS ?? '0,1').split(',').map((team) => take(`faction=${f}&team=${team}`, `band-${f}-${team}`))));
} else {
  // each faction's candidates in turn (1, 2, … until it has no more), then the whole game's pictures (4:3 and wide),
  // then one sheet of them all: a row each, every picture labeled with its name
  const rows = [];
  for (const f of factions) {
    const row = [];
    for (let n = 1, label; n <= 20 && (label = await take(`faction=${f}&team=0&take=${n}`, `band-${f}-${n}`)); n++) row.push([`${f} ${n}${typeof label === 'string' ? `: ${label}` : ''}`, `band-${f}-${n}.webp`]);
    rows.push(row);
  }
  if (!process.argv.slice(2).length) {
    const row = [];
    for (let n = 1, label; n <= 20 && (label = await take(`game=${n}`, `vibecraft-${n}`)); n++) {
      await take(`game=${n}&wide=1`, `vibecraft-${n}-wide`, true);
      row.push([`VibeCraft ${n}${typeof label === 'string' ? `: ${label}` : ''}`, `vibecraft-${n}.webp`]);
    }
    rows.push(row);
  }
  // the best first in each row (marked ★1, ★2 …), then the other new ones, then the rest; a long row wraps at 8
  const rank = ([name]) => { const m = /★(\d+)/.exec(name); return m ? +m[1] : /\bnew\b/.test(name) ? 100 : 200; };
  const sorted = rows.flatMap((row) => { const r = [...row].sort((a, b) => rank(a) - rank(b)); return Array.from({ length: Math.ceil(r.length / 8) }, (_, i) => r.slice(i * 8, i * 8 + 8)); });
  rows.splice(0, rows.length, ...sorted);
  const page = await browser.newPage();
  const shots = rows.map((row) => row.map(([name, file]) => [name, `data:image/webp;base64,${readFileSync(`${out}/${file}`).toString('base64')}`]));
  const sheet = await page.evaluate(async (rows) => {
    const cols = Math.max(...rows.map((r) => r.length)), w = 360, h = 270, label = 34, gap = 8;
    const c = document.createElement('canvas');
    c.width = cols * (w + gap) + gap; c.height = rows.length * (h + label + gap) + gap;
    const g = c.getContext('2d');
    g.fillStyle = '#14120e'; g.fillRect(0, 0, c.width, c.height);
    g.font = '600 17px sans-serif'; g.textAlign = 'center';
    for (const [ri, row] of rows.entries()) for (const [i, [name, url]] of row.entries()) {
      const img = new Image();
      img.src = url;
      await img.decode();
      const x = gap + i * (w + gap), y = gap + ri * (h + label + gap);
      g.drawImage(img, x, y, w, h);
      g.fillStyle = /\bnew\b/.test(name) ? '#9fe08a' : '#f0d48a'; // (the new ones in green)
      g.fillText(name, x + w / 2, y + h + 23, w - 8);
    }
    return c.toDataURL('image/png');
  }, shots);
  writeFileSync(`${out}/sheet.png`, Buffer.from(sheet.split(',')[1], 'base64'));
  console.log(`saved ${out}/sheet.png`);
}
await Promise.race([browser.close(), new Promise((ok) => setTimeout(ok, 5000))]); // (the wrapped Chrome can keep closing for ever)
process.exit(0);
