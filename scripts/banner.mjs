// Retakes the front page's banner, or a numbered banner candidate: node scripts/banner.mjs [n|all] [url=http://localhost:5179]
// Needs a dev server or vite preview running. No number: the menu banner (all three armies in ?mode=faceoff), saved as
// docs/screenshots/header.png and src/assets/menu-bg.jpg. A number: candidate n of SHOTS below, saved as
// docs/review/banners/banner-NN.jpg ("all": every candidate). OUT=<dir> saves there instead. "sheet": one labelled
// contact sheet of the menu banner and every candidate, docs/review/banners/sheet.png.
// The first run bakes every army's art (minutes); profiles/.chrome-banner keeps it for later runs.
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

// Each shot: the page to open, the camera zoom, and `go`, run in the page once it has loaded (window.B: helpers below).
// `go` gives orders, lets the game run, and returns where to look: [x, y] in map tiles.
export const SHOTS = [
  { what: 'All three armies gathered round an open field (the menu banner)', q: 'mode=faceoff&you=fenfolk&foe=meadowfolk&third=wildwelds', zoom: 0.8,
    go: async () => [24, 24] },
  { what: 'Fenfolk and Meadowfolk charge into each other', q: 'mode=faceoff&you=fenfolk&foe=meadowfolk', zoom: 1.1,
    go: async () => { B.wake(); B.charge(0, 27, 25); B.charge(1, 23, 27); await B.play(6); return B.fight(); } },
  { what: 'All three armies meet in one brawl', q: 'mode=faceoff&you=fenfolk&foe=meadowfolk&third=wildwelds', zoom: 0.85,
    go: async () => { B.wake(); for (const p of [0, 1, 2]) B.charge(p, 25, 26); await B.play(9); return B.fight(); } },
  { what: 'A Wildweld swarm hits the Meadowfolk line, close up', q: 'mode=faceoff&you=wildwelds&foe=meadowfolk', zoom: 1.4,
    go: async () => { B.wake(); B.charge(0, 30, 21); B.charge(1, 21, 30); await B.play(6); return B.fight(); } },
  { what: 'A Meadowfolk town at work, five minutes in', q: 'mode=spectate&you=meadowfolk&foe=fenfolk&map=woodlands&ai=hard&skip=300', zoom: 0.9,
    go: async () => { await B.play(4); return B.base(0); } },
  { what: 'A Fenfolk marsh camp on the Water Donut', q: 'mode=spectate&you=fenfolk&foe=meadowfolk&map=water-donut&ai=hard&skip=300', zoom: 0.9,
    go: async () => { await B.play(4); return B.base(0); } },
  { what: 'A Wildweld nest on the steppe', q: 'mode=spectate&you=wildwelds&foe=fenfolk&map=steppe&ai=hard&skip=300', zoom: 0.9,
    go: async () => { await B.play(4); return B.base(0); } },
  { what: 'Battle on The Mesa: Meadowfolk against Wildwelds', q: 'mode=battle&you=meadowfolk&foe=wildwelds&map=mesa&budget=4000', zoom: 0.85, battle: true,
    go: async () => { const [x, y] = B.middle(1); B.charge(0, x, y); await B.play(22); return B.fight(); } },
  { what: 'Fliers of all three armies in the air', q: 'mode=faceoff&you=fenfolk&foe=meadowfolk&third=wildwelds', zoom: 1.25,
    go: async () => { B.wake(B.fliers()); B.send(B.fliers(), 26, 30); await B.play(4); return B.middleOf(B.fliers()); } },
  { what: 'Two champions meet: the biggest Fenfolk and Meadowfolk bodies', q: 'mode=faceoff&you=fenfolk&foe=meadowfolk', zoom: 2.2,
    go: async () => { const a = B.biggest(0), b = B.biggest(1); B.wake([a, b]); B.attack(a, b); B.attack(b, a); await B.play(5); return B.middleOf([a, b]); } },
  { what: 'A big fight late in a game on Sunken Temple', q: 'mode=spectate&you=meadowfolk&foe=wildwelds&map=sunken-temple&ai=hard&skip=900', zoom: 0.85,
    go: async () => { for (let i = 0; i < 12 && !B.fighting(); i++) await B.play(5); return B.fight(); } },
];

// in the page: ways to give orders to any side and to find where to look
const helpers = () => {
  const w = window.world, units = () => [...w.units.values()];
  const mid = (us) => (us.length ? [us.reduce((a, u) => a + u.x, 0) / us.length, us.reduce((a, u) => a + u.y, 0) / us.length] : [28, 28]);
  window.B = {
    play: (s) => new Promise((ok) => setTimeout(ok, s * 1000)),
    wake: (ids) => { for (const u of units()) if (!ids || ids.includes(u.id)) u.dummy = false; },
    charge: (p, x, y) => w.enqueue({ player: p, cmd: { type: 'attackMove', units: w.unitsOf(p).map((u) => u.id), x, y } }),
    send: (ids, x, y) => { for (const u of units()) if (ids.includes(u.id)) w.enqueue({ player: u.owner, cmd: { type: 'move', units: [u.id], x, y } }); },
    attack: (id, target) => w.enqueue({ player: w.units.get(id).owner, cmd: { type: 'attack', units: [id], target } }),
    fliers: () => units().filter((u) => u.stats.flight).map((u) => u.id),
    biggest: (p) => w.unitsOf(p).reduce((a, u) => (u.stats.mass > a.stats.mass ? u : a)).id,
    middle: (p) => mid(w.unitsOf(p)),
    middleOf: (ids) => mid(units().filter((u) => ids.includes(u.id))),
    base: (p) => { const b = w.baseOf(p); return b ? [b.x + b.spec.size / 2 + 1, b.y + b.spec.size / 2 + 1] : mid(w.unitsOf(p)); },
    fighting: () => units().filter((u) => u.engage).length >= 8,
    // the middle of the thickest fight: the engaged unit with the most engaged units near it, and those around it
    fight: () => {
      const e = units().filter((u) => u.engage);
      if (!e.length) return mid(units().filter((u) => !u.dummy));
      const near = (a) => e.filter((b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < 36);
      return mid(near(e.reduce((a, b) => (near(b).length > near(a).length ? b : a))));
    },
  };
};

// (closing a page or Chrome sometimes never finishes: give it a few seconds, then go on)
const quick = (p) => Promise.race([p, new Promise((ok) => setTimeout(ok, 5000))]);
const args = process.argv.slice(2);
const base = (args.find((a) => a.includes('://')) ?? 'http://localhost:5179').replace(/\/$/, '');
const pick = args.find((a) => !a.includes('://'));
const which = pick === 'sheet' ? [] : pick === 'all' ? SHOTS.map((_, i) => i).slice(1) : [pick ? +pick : 0];
const appleSilicon = process.platform === 'darwin' && execSync('sysctl -n hw.optional.arm64 2>/dev/null || echo 0').toString().trim() === '1';
const browser = await chromium.launchPersistentContext('profiles/.chrome-banner', {
  ...(appleSilicon ? { executablePath: 'scripts/chrome-arm64.sh' } : { channel: 'chrome' }),
  headless: true, viewport: { width: 1240, height: 360 }, deviceScaleFactor: 2,
});
for (const n of which) {
  const shot = SHOTS[n], page = await browser.newPage();
  page.on('pageerror', (e) => console.log(`  page error: ${e.message}`));
  await page.goto(`${base}/?${shot.q}&seed=7`, { timeout: 900000 });
  if (shot.battle) { // the draft: a few of everything it can afford, then deploy and start
    await page.waitForSelector('[data-add]', { timeout: 900000 });
    for (let round = 0; round < 6; round++) for (const b of await page.$$('[data-add][data-d="1"]:not([disabled])')) await b.click();
    await page.click('[data-go]');
  }
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.world, null, { timeout: 900000 });
  if (shot.battle) { await page.waitForSelector('[data-ready]', { timeout: 60000 }); await page.click('[data-ready]'); }
  await page.addStyleTag({ content: '#hud, #help, #score, #tooltip, #chat, #overlay, #settings, #arena { display: none !important; }' });
  await page.evaluate(helpers);
  await page.evaluate(() => { window.world.isBearer = () => false; }); // (no supply bars over the ammo bearers)
  const at = await page.evaluate(`(${shot.go.toString()})()`);
  // hold the moment (speed 0), then frame it
  await page.evaluate(([x, y, z]) => { window.input.speed = 0; const cam = window.renderer.cam; cam.zoom = z; cam.centerOn(x, y); }, [...at, shot.zoom]);
  await page.waitForTimeout(1500);
  const dir = process.env.OUT ?? (n ? 'docs/review/banners' : null);
  if (dir) mkdirSync(dir, { recursive: true });
  const jpg = dir ? `${dir}/${n ? `banner-${String(n).padStart(2, '0')}` : 'menu-bg'}.jpg` : 'src/assets/menu-bg.jpg';
  if (!n) await page.screenshot({ path: dir ? `${dir}/header.png` : 'docs/screenshots/header.png' });
  await page.screenshot({ path: jpg, type: 'jpeg', quality: 82 });
  console.log(`${n}: ${shot.what} -> ${jpg}`);
  await quick(page.close());
}
if (pick === 'sheet') {
  const img = (f) => (existsSync(f) ? `data:image/jpeg;base64,${readFileSync(f).toString('base64')}` : '');
  const cells = SHOTS.map((s, n) => ({ n, what: s.what, src: img(n ? `docs/review/banners/banner-${String(n).padStart(2, '0')}.jpg` : 'src/assets/menu-bg.jpg') }));
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.setContent(`<body style="margin:0;padding:16px;background:#14120e;color:#eee;font:20px system-ui;display:grid;grid-template-columns:1fr 1fr;gap:18px 16px;width:1568px">
    ${cells.map((c) => `<figure style="margin:0"><img src="${c.src}" style="display:block;width:100%;aspect-ratio:2480/720;background:#333">
      <figcaption style="padding:6px 2px"><b style="color:#f0d48a">${c.n ? c.n : 'Now'}</b> ${c.what}</figcaption></figure>`).join('')}</body>`);
  await page.waitForTimeout(500);
  mkdirSync('docs/review/banners', { recursive: true });
  await page.screenshot({ path: 'docs/review/banners/sheet.png', fullPage: true });
  console.log('sheet -> docs/review/banners/sheet.png');
}
await quick(browser.close());
process.exit(0);
