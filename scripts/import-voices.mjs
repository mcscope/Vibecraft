// Import unit voices from the Voice Lab: the newest voicelab_labels*.json (repo root or ~/Downloads) and the raw
// clips in public/voicelab/ → public/voices/ (AAC clips + manifest.json, read by src/audio/clips.ts).
// A group label ("<faction>:infantry", the Wildwelds' "all" or a tiered body) joins each of its units. macOS only (uses afconvert).
// Usage: node scripts/import-voices.mjs [labels.json]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// a label for a group joins each of its units
const tiers = (u) => [1, 2, 3].map((t) => `wildwelds:${u}${t}`);
const WILDWELDS = [...tiers('mother'), ...tiers('egg'), ...tiers('larva'), ...['cocoon', 'charger', 'micropike', 'flier', 'whipweld', 'slinger', 'dragon-fly', 'ground-attacker3'].map((u) => `wildwelds:${u}`)];
const GROUPS = {
  'meadowfolk:infantry': ['villager', 'slinger', 'maceman', 'pikeman'].map((u) => `meadowfolk:${u}`),
  'fenfolk:infantry': ['fenling', 'reedguard'].map((u) => `fenfolk:${u}`),
  'wildwelds:all': WILDWELDS, 'wildwelds:mother': tiers('mother'), 'wildwelds:egg': tiers('egg'), 'wildwelds:larva': tiers('larva'),
};
const unitsOf = (u) => GROUPS[u] ?? [u];
// groups of tiers of one body: a clip labelled for one is pitched for each tier by its size (src/audio/clips.ts)
const SIZED = new Set(['wildwelds:mother', 'wildwelds:egg', 'wildwelds:larva']);

const newest = () => [process.cwd(), join(homedir(), 'Downloads')]
  .flatMap((d) => (existsSync(d) ? readdirSync(d).filter((f) => /^voicelab_labels.*\.json$/.test(f)).map((f) => join(d, f)) : []))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const file = process.argv[2] ?? newest();
if (!file) throw new Error('no voicelab_labels*.json found');
const labels = JSON.parse(readFileSync(file, 'utf8'));
// (labels saved before the Wildwelds' id was 'wildwelds' say 'newfaction:')
const renamed = (u) => (typeof u === 'string' ? u.replace(/^newfaction:/, 'wildwelds:') : u);
const labelled = (labels.clips ?? labels).map((c) => ({ ...c, unit: renamed(c.unit) }));
labels.unitTreatments = Object.fromEntries(Object.entries(labels.unitTreatments ?? {}).map(([k, v]) => [renamed(k), v]));
// combat clips not labelled yet keep the Voice Lab's measured guess (public/voicelab/combat.json)
const seen = new Set(labelled.map((c) => c.id));
const combat = existsSync('public/voicelab/combat.json') ? JSON.parse(readFileSync('public/voicelab/combat.json', 'utf8')) : [];
// voice clips cut since the labels were saved keep their guesses too (unit, and line where one was guessed)
const voices = existsSync('public/voicelab/clips.json') ? JSON.parse(readFileSync('public/voicelab/clips.json', 'utf8')) : [];
const unlabelled = [...combat, ...voices].filter((c) => !seen.has(c.id)).map((c) => ({ id: c.id, unit: c.guess, line: c.guessLine ?? 'any' }));
const clips = [...labelled, ...unlabelled].filter((c) => c.unit && c.unit !== 'skip'); // (unlabelled clips stay out)

const out = 'public/voices';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const lines = {}, sized = {};
const add = (unit, line, id) => ((lines[unit] ??= {})[line] ??= []).push(id);
for (const c of clips) {
  for (const u of unitsOf(c.unit)) add(u, c.line, c.id);
  if (SIZED.has(c.unit)) sized[c.id] = unitsOf(c.unit);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', `public/voicelab/${c.id}.wav`, `${out}/${c.id}.m4a`]);
}
const keep = new Set(clips.map((c) => c.id));
const clipFx = Object.fromEntries(Object.entries(labels.clipTreatments ?? {}).filter(([id]) => keep.has(id)));
// a unit treatment set on a group applies to each of its units
const unitFx = {};
for (const [u, fx] of Object.entries(labels.unitTreatments ?? {})) {
  for (const t of unitsOf(u)) unitFx[t] = { ...unitFx[t], ...fx };
}
writeFileSync(`${out}/manifest.json`, JSON.stringify({ lines, clipFx, unitFx, sized }, null, 1));
console.log(`imported ${clips.length} clips from ${file}`);
for (const [u, ls] of Object.entries(lines).sort()) console.log(`  ${u.padEnd(28)} ${Object.entries(ls).map(([l, ids]) => `${l} ${ids.length}`).join(', ')}`);
