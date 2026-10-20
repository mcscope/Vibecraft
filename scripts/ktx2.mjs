// GPU-compressed sprite pages: encode each pre-baked faction page (dist/baked/<key>.<n>.webp) to a KTX2 file
// (Basis UASTC with zstd) beside it, and mark the faction's JSON `ktx2: true`. The game then uploads the pages
// compressed (about a quarter of the GPU memory of raw pixels: the GPU keeps them compressed and decodes as it draws),
// falling back to the WebP pages where it can't. Biome art stays WebP: the ground painter draws it on the CPU.
// Run: node scripts/ktx2.mjs [dir=dist/baked]   (npm run build runs it after the pre-bake)
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

if (isMainThread) {
  const dir = process.argv[2] ?? 'dist/baked';
  const keys = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('biome.')).map((f) => f.slice(0, -5));
  const jobs = keys.flatMap((key) => {
    const { pages } = JSON.parse(readFileSync(join(dir, `${key}.json`), 'utf8'));
    return Array.from({ length: pages }, (_, i) => join(dir, `${key}.${i}`));
  });
  console.log(`ktx2: ${jobs.length} pages from ${keys.length} factions`);
  const t0 = Date.now();
  let next = 0, done = 0, failed = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs.length, availableParallelism() - 1)) }, () => new Promise((resolve) => {
    const w = new Worker(new URL(import.meta.url));
    const feed = () => { if (next < jobs.length) w.postMessage(jobs[next++]); else { w.terminate(); resolve(); } };
    w.on('message', (m) => { done++; if (!m.ok) { failed++; console.error(`ktx2: ${m.path}: ${m.error}`); } feed(); });
    w.on('error', (e) => { console.error('ktx2 worker:', e); failed++; resolve(); });
    feed();
  })));
  if (failed) { console.error(`ktx2: ${failed} pages failed; leaving those factions on WebP`); process.exitCode = 1; }
  // mark the factions whose pages all encoded
  for (const key of keys) {
    const p = join(dir, `${key}.json`), j = JSON.parse(readFileSync(p, 'utf8'));
    const ok = Array.from({ length: j.pages }, (_, i) => { try { readFileSync(join(dir, `${key}.${i}.ktx2`)); return true; } catch { return false; } }).every(Boolean);
    if (ok) writeFileSync(p, JSON.stringify({ ...j, ktx2: true }));
  }
  console.log(`ktx2: ${done} pages in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
} else {
  const { encodeToKTX2 } = await import('ktx2-encoder');
  const sharp = (await import('sharp')).default;
  const imageDecoder = async (buffer) => {
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(data), width: info.width, height: info.height };
  };
  parentPort.on('message', async (path) => {
    try {
      const src = `${path}.webp`, meta = await sharp(src).metadata();
      // block-compressed: pad to whole 4×4 blocks (sprites keep their coordinates; the padding is transparent)
      const W = Math.ceil(meta.width / 4) * 4, H = Math.ceil(meta.height / 4) * 4;
      const png = await sharp(src).ensureAlpha().extend({ right: W - meta.width, bottom: H - meta.height, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      const out = await encodeToKTX2(new Uint8Array(png), { isUASTC: true, enableSupercompression: true, needSupercompression: true, uastcLDRQualityLevel: 2, generateMipmap: false, enableDebug: false, imageDecoder });
      writeFileSync(`${path}.ktx2`, out);
      parentPort.postMessage({ ok: true, path });
    } catch (e) {
      parentPort.postMessage({ ok: false, path, error: String(e) });
    }
  });
}
