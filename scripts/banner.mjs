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
  { what: 'All three armies round an open middle: Fenfolk left, Wildwelds right, Meadowfolk at the back (the menu banner)', q: 'mode=faceoff&you=fenfolk&foe=wildwelds&third=meadowfolk', zoom: 0.75,
    go: async () => [26, 26] },
  { what: 'Fenfolk and Meadowfolk charge into each other', q: 'mode=faceoff&you=fenfolk&foe=meadowfolk', zoom: 1.1,
    go: async () => { await B.clash(1.5); return B.fight(); } },
  { what: 'All three armies meet in one brawl', q: 'mode=faceoff&you=fenfolk&foe=wildwelds&third=meadowfolk', zoom: 0.9,
    go: async () => { await B.clash(3); return B.fight(); } },
  { what: 'A Wildweld swarm hits the Meadowfolk line, close up', q: 'mode=faceoff&you=wildwelds&foe=meadowfolk', zoom: 1.4,
    go: async () => { await B.clash(1); return B.fight(); } },
  { what: 'A Meadowfolk town at work, five minutes in', q: 'mode=spectate&you=meadowfolk&foe=fenfolk&map=woodlands&ai=hard&skip=300', zoom: 0.9,
    go: async () => { await B.play(4); return B.base(0); } },
  { what: 'A Fenfolk marsh camp on the Water Donut', q: 'mode=spectate&you=fenfolk&foe=meadowfolk&map=water-donut&ai=hard&skip=300', zoom: 0.9,
    go: async () => { await B.play(4); return B.base(0); } },
  { what: 'A Wildweld nest on the steppe', q: 'mode=spectate&you=wildwelds&foe=fenfolk&map=steppe&ai=hard&skip=300', zoom: 0.9,
    go: async () => { await B.play(4); return B.base(0); } },
  { what: 'Battle on The Mesa: Meadowfolk against Wildwelds', q: 'mode=battle&you=meadowfolk&foe=wildwelds&map=mesa&budget=4000', zoom: 0.85, battle: true,
    go: async () => { const [x, y] = B.middle(1); B.charge(0, x, y); await B.play(22); return B.fight(); } },
  { what: 'Fliers of all three armies in the air', q: 'mode=faceoff&you=fenfolk&foe=wildwelds&third=meadowfolk', zoom: 1.25,
    go: async () => { B.wake(B.fliers()); B.send(B.fliers(), 30, 30); await B.play(5); return B.middleOf(B.fliers().filter((id) => window.world.units.get(id)?.airborne)); } },
  { what: 'Two champions meet: the biggest Fenfolk and Meadowfolk fighters, close up', q: 'mode=faceoff&you=fenfolk&foe=meadowfolk', zoom: 1.7,
    go: async () => { const a = B.biggest(0), b = B.biggest(1); B.wake([a, b]); B.attack(a, b); B.attack(b, a); for (let i = 0; i < 40 && B.apart(a, b) > 2.5; i++) await B.play(0.5); await B.play(0.6); return B.middleOf([a, b]); } },
  { what: 'A big fight late in a game on Sunken Temple', q: 'mode=spectate&you=meadowfolk&foe=wildwelds&map=sunken-temple&ai=hard&skip=600', zoom: 0.85,
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
    // its heaviest fighter on foot that fights up close
    biggest: (p) => w.unitsOf(p).filter((u) => u.stats.canAttack && !u.stats.flight && u.stats.range < 3).reduce((a, u) => (u.stats.mass > a.stats.mass ? u : a)).id,
    apart: (a, b) => { const u = w.units.get(a), v = w.units.get(b); return u && v ? Math.hypot(u.x - v.x, u.y - v.y) : 0; },
    middle: (p) => mid(w.unitsOf(p)),
    middleOf: (ids) => mid(units().filter((u) => ids.includes(u.id))),
    base: (p) => { const b = w.baseOf(p); return b ? [b.ox + b.spec.size / 2, b.oy + b.spec.size / 2] : mid(w.unitsOf(p)); },
    fighting: () => units().filter((u) => u.engage).length >= 8,
    // every army charges the middle of the others; once the fight has started, `secs` more
    clash: async (secs) => {
      B.wake();
      const sides = [...new Set(units().map((u) => u.owner))];
      for (const p of sides) { const [x, y] = mid(units().filter((u) => u.owner !== p)); B.charge(p, x, y); }
      for (let i = 0; i < 40 && !B.fighting(); i++) await B.play(0.5);
      await B.play(secs);
    },
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
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'], // (the real GPU: software drawing bakes the art many times slower)
});
// no live reloading: an edit elsewhere in the checkout would restart the page mid-shot
await browser.routeWebSocket(/.*/, () => {});
const take = async (n) => {
  const shot = SHOTS[n], page = await browser.newPage();
  page.on('pageerror', (e) => console.log(`  page error: ${e.message}`));
  await page.goto(`${base}/?${shot.q}&seed=7`, { timeout: 900000 });
  if (shot.battle) { // the draft: a few of everything it can afford, then deploy and start
    await page.waitForSelector('[data-add]', { timeout: 900000 });
    await page.evaluate(() => { // (each click redraws the list, so look each button up afresh)
      const ids = [...document.querySelectorAll('[data-add][data-d="1"]')].map((b) => b.dataset.add);
      for (let round = 0; round < 6; round++) for (const id of ids) document.querySelector(`[data-add="${id}"][data-d="1"]:not([disabled])`)?.click();
    });
    await page.click('[data-go]');
  }
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.world, null, { timeout: 900000 });
  if (shot.battle) { await page.waitForSelector('[data-ready]', { timeout: 60000 }); await page.click('[data-ready]'); }
  await page.addStyleTag({ content: '#hud, #help, #score, #tooltip, #chat, #overlay, #settings, #arena { display: none !important; }' });
  await page.evaluate(helpers);
  await page.evaluate(() => { window.world.isBearer = () => false; }); // (no supply bars over the ammo bearers)
  const at = await page.evaluate(`(${shot.go.toString()})()`);
  // hold the moment (speed 0), hide the health bars (full health shows none), then frame it
  // (a candidate's subject goes to one side, `side` of the width from the middle: the title sits in the middle)
  await page.evaluate(([x, y, z, side]) => {
    window.input.speed = 0;
    for (const u of window.world.units.values()) if (u.hp > 0) u.hp = u.stats.maxHp;
    const cam = window.renderer.cam; cam.zoom = z; cam.centerOn(x, y);
    cam.cx -= (side * cam.width) / z;
  }, [...at, shot.zoom, n > 0 ? shot.side ?? -0.3 : 0]);
  await page.waitForTimeout(1500);
  const dir = process.env.OUT ?? (n ? 'docs/review/banners' : null);
  if (dir) mkdirSync(dir, { recursive: true });
  const jpg = dir ? `${dir}/${n ? `banner-${String(n).padStart(2, '0')}` : 'menu-bg'}.jpg` : 'src/assets/menu-bg.jpg';
  if (!n) await page.screenshot({ path: dir ? `${dir}/header.png` : 'docs/screenshots/header.png' });
  await page.screenshot({ path: jpg, type: 'jpeg', quality: 82 });
  console.log(`${n}: ${shot.what} -> ${jpg}`);
  await quick(page.close());
};
for (const n of which) {
  for (let tries = 3; tries--; ) {
    try { await take(n); break; } catch (e) { console.log(`${n}: ${e.message.split('\n')[0]}${tries ? ', trying again' : ''}`); }
  }
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
