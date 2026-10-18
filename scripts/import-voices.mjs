// Import unit voices from the Voice Lab: the newest voicelab_labels*.json (repo root or ~/Downloads) and the raw
// clips in public/voicelab/ → public/voices/ (AAC clips + manifest.json, read by src/audio/clips.ts).
// "<faction>:infantry" clips join every infantry unit of that faction. macOS only (uses afconvert).
// Usage: node scripts/import-voices.mjs [labels.json]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const INFANTRY = { meadowfolk: ['villager', 'slinger', 'maceman', 'pikeman'], fenfolk: ['fenling', 'reedguard'] };

const newest = () => [process.cwd(), join(homedir(), 'Downloads')]
  .flatMap((d) => (existsSync(d) ? readdirSync(d).filter((f) => /^voicelab_labels.*\.json$/.test(f)).map((f) => join(d, f)) : []))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const file = process.argv[2] ?? newest();
if (!file) throw new Error('no voicelab_labels*.json found');
const labels = JSON.parse(readFileSync(file, 'utf8'));
const clips = (labels.clips ?? labels).filter((c) => c.unit !== 'skip');

const out = 'public/voices';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const lines = {};
const add = (unit, line, id) => ((lines[unit] ??= {})[line] ??= []).push(id);
for (const c of clips) {
  const [faction, unit] = c.unit.split(':');
  if (unit === 'infantry') for (const u of INFANTRY[faction] ?? []) add(`${faction}:${u}`, c.line, c.id);
  else add(c.unit, c.line, c.id);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', `public/voicelab/${c.id}.wav`, `${out}/${c.id}.m4a`]);
}
const keep = new Set(clips.map((c) => c.id));
const clipFx = Object.fromEntries(Object.entries(labels.clipTreatments ?? {}).filter(([id]) => keep.has(id)));
// a unit treatment set on a group applies to each of its units
const unitFx = {};
for (const [u, fx] of Object.entries(labels.unitTreatments ?? {})) {
  const [faction, unit] = u.split(':');
  for (const t of unit === 'infantry' ? (INFANTRY[faction] ?? []).map((x) => `${faction}:${x}`) : [u]) unitFx[t] = { ...unitFx[t], ...fx };
}
writeFileSync(`${out}/manifest.json`, JSON.stringify({ lines, clipFx, unitFx }, null, 1));
console.log(`imported ${clips.length} clips from ${file}`);
for (const [u, ls] of Object.entries(lines).sort()) console.log(`  ${u.padEnd(28)} ${Object.entries(ls).map(([l, ids]) => `${l} ${ids.length}`).join(', ')}`);
