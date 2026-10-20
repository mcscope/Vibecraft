// The one performance measurement: open a skirmish in Chrome, profile loading plus 30 s of play, save the profile
// (open it in Chrome DevTools: Performance > Load profile) and print a summary of where the time went.
// Usage: node scripts/perf.mjs <label> [url=http://localhost:5179] [noprof]   (a dev server or a vite preview must be running)
// noprof: frame times only, no CPU profile (the profiler's sampling slows the page a lot, so its frame times run long)
// trace: a Chrome trace of the play instead (exact times for scripts, garbage collection and compiling, no sampling);
//        saved as profiles/<date>-<label>.trace.json (DevTools: Performance > Load profile)
// Profiles land in profiles/<date>-<label>.cpuprofile. Same scenario every time, so runs compare like for like.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const [label = 'run', base = 'http://localhost:5179', mode] = process.argv.slice(2);
const profiling = mode !== 'noprof' && mode !== 'trace', tracing = mode === 'trace';
// MODE=demo (etc.): another game mode; JSFLAGS='...': flags for Chrome's JavaScript engine (V8)
const url = `${base.replace(/\/$/, '')}/?mode=${process.env.MODE ?? 'skirmish'}&you=meadowfolk&foe=fenfolk&map=woodlands&ai=easy&debug`;
const PLAY_S = 30, SETTLED_S = 10; // then the frame rate over 10 s more, once start-up is over (not profiled)

// a kept browser profile: the dev server's baked-art cache survives between runs (else every run re-bakes for minutes)
// headless: a visible window gets throttled by macOS when it's behind other apps, which made runs vary wildly
// (WINDOW=1 to watch it)
const browser = await chromium.launchPersistentContext('profiles/.chrome', { channel: 'chrome', headless: !process.env.WINDOW, args: process.env.JSFLAGS ? [`--js-flags=${process.env.JSFLAGS}`] : [], viewport: { width: 1500, height: 880 }, deviceScaleFactor: +(process.env.DPR ?? 1) });
const page = await browser.newPage();
// the window may take focus when it opens: keys and clicks meant for other apps mustn't reach the game (p pauses it)
await page.addInitScript(() => {
  for (const type of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel', 'contextmenu']) window.addEventListener(type, (e) => { if (e.isTrusted) { e.stopImmediatePropagation(); e.preventDefault(); } }, { capture: true, passive: false });
});
page.on('pageerror', (e) => console.log(`  page error: ${e.message}`));
const cdp = await page.context().newCDPSession(page);
if (profiling) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
}
const t0 = Date.now();
await page.goto(url, { timeout: 900000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 900000 });
const loadS = (Date.now() - t0) / 1000;
const traceEvents = [];
if (tracing) {
  cdp.on('Tracing.dataCollected', (e) => traceEvents.push(...e.value));
  await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'v8', 'v8.execute', 'disabled-by-default-v8.gc', 'disabled-by-default-v8.compile', 'blink.user_timing', 'gpu'] } });
}
// every frame's length, timed in the page
await page.evaluate(() => { window.__frameMs = []; let prev = performance.now(); const f = (now) => { window.__frameMs.push(now - prev); prev = now; requestAnimationFrame(f); }; requestAnimationFrame(f); });
await page.waitForTimeout(PLAY_S * 1000);
const tick = await page.evaluate(() => window.world.tick);
const playFrames = await page.evaluate(() => window.__frameMs.splice(0));
const slow = await page.evaluate(() => window.slowFrames.splice(0));
const profile = profiling ? (await cdp.send('Profiler.stop')).profile : null;
if (tracing) { const done = new Promise((ok) => cdp.once('Tracing.tracingComplete', ok)); await cdp.send('Tracing.end'); await done; }
await page.waitForTimeout(SETTLED_S * 1000);
const fps = (await page.evaluate(() => window.__frameMs.length)) / SETTLED_S;
await browser.close();

const stalls = playFrames.filter((ms) => ms > 300);
console.log(`${label}: load ${loadS.toFixed(1)} s | play ${PLAY_S} s reached tick ${tick} (${(tick / 20 / PLAY_S).toFixed(2)}x speed)`);
console.log(`  ${playFrames.length} frames in play; ${stalls.length} stalls over 300 ms, ${(stalls.reduce((a, b) => a + b, 0) / 1000).toFixed(1)} s in all; then ${fps.toFixed(0)} fps over the next ${SETTLED_S} s`);
// the slow frames' parts (ms): the gap since the frame before, and this frame's sim, draw and HUD
const sum = (k) => slow.reduce((a, f) => a + f[k], 0);
console.log(`  slow frames (over 100 ms): ${slow.length}; of their ${sum('gap')} ms: sim ${sum('sim')}, draw ${sum('draw')}, hud ${sum('hud')}, outside the frame ${sum('gap') - sum('sim') - sum('draw') - sum('hud')}`);
for (const f of slow.slice(0, 12)) console.log(`    ${JSON.stringify(f)}`);
if (tracing) {
  mkdirSync('profiles', { recursive: true });
  const out = `profiles/${new Date().toISOString().slice(0, 10)}-${label}.trace.json`;
  writeFileSync(out, JSON.stringify({ traceEvents }));
  // the page's main thread: total time per kind of event (each event's own time, not counting events inside it)
  const main = traceEvents.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain' && traceEvents.some((x) => x.pid === e.pid && x.name === 'FunctionCall'));
  const evs = traceEvents.filter((e) => main && e.pid === main.pid && e.tid === main.tid && e.ph === 'X' && e.dur).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const own = new Map(), stack = [];
  for (const e of evs) {
    while (stack.length && stack.at(-1).ts + stack.at(-1).dur <= e.ts) stack.pop();
    if (stack.length) own.set(stack.at(-1), (own.get(stack.at(-1)) ?? stack.at(-1).dur) - e.dur);
    own.set(e, own.get(e) ?? e.dur);
    stack.push(e);
  }
  const byName = new Map();
  for (const [e, d] of own) byName.set(e.name, (byName.get(e.name) ?? 0) + d);
  console.log('  main thread, own time by kind (s):');
  for (const [k, v] of [...byName].sort((a, b) => b[1] - a[1]).slice(0, 16)) console.log(`    ${(v / 1e6).toFixed(2)}  ${k}`);
  console.log(`  saved ${out}`);
  process.exit(0);
}
if (!profile) process.exit(0);
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
console.log(`  ground paint ${s('paintTerrain')} s | drawing ${s('draw')} s | game logic ${s('tryStep')} s | garbage collection ${s('(garbage collector)')} s`);
console.log(`  saved ${out}`);
