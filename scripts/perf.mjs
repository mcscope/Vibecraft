// The one performance measurement: open a skirmish in Chrome, profile loading plus 30 s of play, save the profile
// (open it in Chrome DevTools: Performance > Load profile) and print a summary of where the time went.
// Usage: node scripts/perf.mjs <label> [url=http://localhost:5179]   (a dev server or a vite preview must be running)
// Profiles land in profiles/<date>-<label>.cpuprofile. Same scenario every time, so runs compare like for like.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const [label = 'run', base = 'http://localhost:5179'] = process.argv.slice(2);
const url = `${base.replace(/\/$/, '')}/?mode=skirmish&you=meadowfolk&foe=fenfolk&map=woodlands&ai=easy`;
const PLAY_S = 30, SETTLED_S = 10; // then the frame rate over 10 s more, once start-up is over (not profiled)

// a kept browser profile: the dev server's baked-art cache survives between runs (else every run re-bakes for minutes)
const browser = await chromium.launchPersistentContext('profiles/.chrome', { channel: 'chrome', headless: false, viewport: { width: 1500, height: 880 } });
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 900000 });
const loadS = (Date.now() - t0) / 1000;
await page.waitForTimeout(PLAY_S * 1000);
const tick = await page.evaluate(() => window.world.tick);
const { profile } = await cdp.send('Profiler.stop');
await page.evaluate(() => { window.__frames = 0; const f = () => { window.__frames++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
await page.waitForTimeout(SETTLED_S * 1000);
const fps = (await page.evaluate(() => window.__frames)) / SETTLED_S;
await browser.close();

mkdirSync('profiles', { recursive: true });
const out = `profiles/${new Date().toISOString().slice(0, 10)}-${label}.cpuprofile`;
writeFileSync(out, JSON.stringify(profile));

// inclusive time per function name (each counted once per sample)
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const incl = new Map();
profile.samples.forEach((id, i) => {
  const d = profile.timeDeltas[i] ?? 0, seen = new Set();
  for (let x = id; x; x = parent.get(x)) {
    const k = byId.get(x).callFrame.functionName || '(anon)';
    if (!seen.has(k)) { incl.set(k, (incl.get(k) ?? 0) + d); seen.add(k); }
  }
});
const s = (k) => ((incl.get(k) ?? 0) / 1e6).toFixed(1);
console.log(`${label}: load ${loadS.toFixed(1)} s | play ${PLAY_S} s reached tick ${tick} (${(tick / 20 / PLAY_S).toFixed(2)}x speed)`);
console.log(`  then ${fps.toFixed(0)} fps over the next ${SETTLED_S} s`);
console.log(`  ground paint ${s('paintTerrain')} s | drawing ${s('draw')} s | game logic ${s('tryStep')} s | garbage collection ${s('(garbage collector)')} s`);
console.log(`  saved ${out}`);
