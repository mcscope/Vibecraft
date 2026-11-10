// Exports units as 3D-printable STL files (millimetres, Z up, one watertight solid each), in any pose their art has.
//
//   npx vite-node scripts/stl.ts <unit> [anim] [phase] [mm-per-metre] [options]
//   npx vite-node scripts/stl.ts all [faction]          every faction's standard set (its prints.ts), or one faction's
//   npx vite-node scripts/stl.ts <unit> articulated     its poseable figure (its prints.ts says how it comes apart)
//
//   <unit>     a unit id (mother3, ground-attacker3, …), or faction/unit if two factions share one
//   anim       idle, walk, charge, brace, attack, slam, lay, gather, fly, soar, glide, leap, hatch, grow, reload, …
//              (the animations its art bakes; default idle)
//   phase      0 … 1, how far through the animation (default 0)
//   mm-per-metre  the scale (default: tabletop, 28 mm to a 1.7 m person, made bigger for a small unit to reach --min-size)
//   --air      it's off the ground: held up on a post from a base disc       --base / --no-base   a base disc, or none
//   --unarmed  without its crystal         --min-size=36  smallest a print may be, mm (its longest side)
//   --thick=1.4  thinnest part, mm         --out=prints/<faction>  where the files go       --name=<pose name>
//
// Each file is checked as it's written (read back from its bytes: watertight, wound outward, no degenerate triangles,
// one shell, its volume, size, how thin it gets, whether it stands) and the results go in <out>/report.json, which
// scripts/stl-sheet.mjs turns into a labeled review image.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifold } from 'manifold-3d';
import { PLAYABLE } from '../src/factions';
import type { FactionSpec } from '../src/factions/types';
import type { BakedAnim, UnitBakeOptions } from '../src/kits/bake3d/baker';
import type { UnitModel } from '../src/kits/bake3d/types';
import { checkMesh, readStl, toStl, type MeshCheck } from '../src/kits/print3d/check';
import { DEFAULT_PRINT, TABLETOP, printPose, recordPose, type PrintOptions, type PrintPose, type PrintReport, type UnitPrints } from '../src/kits/print3d/print';
import { articulate } from '../src/kits/print3d/articulate';
import { extent, manifoldKit } from '../src/kits/print3d/solid';

const arts = import.meta.glob('../src/factions/*/art.ts') as Record<string, () => Promise<{ bakeOpts?: (u: never) => UnitBakeOptions }>>;
const printSets = import.meta.glob('../src/factions/*/prints.ts') as Record<string, () => Promise<{ prints: UnitPrints[] }>>;

const argv = process.argv.slice(2).filter((a) => a !== '--');
const flags = new Map(argv.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? 'true'] as const; }));
const args = argv.filter((a) => !a.startsWith('--'));
if (!args.length) { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 19).join('\n')); process.exit(1); }

const w = await manifoldKit();
const minSize = Number(flags.get('min-size') ?? 36);
/** The thinnest a part should be, mm, for the thickness check (parts are thickened to `--thick`, a little more). */
const THIN = 1.2;
const base: Omit<PrintOptions, 'mmPerUnit'> = { ...DEFAULT_PRINT, minThick: Number(flags.get('thick') ?? DEFAULT_PRINT.minThick) };

type Unit = FactionSpec['units'][number] & { model?: UnitModel };
function findUnit(id: string): { f: FactionSpec; u: Unit & { model: UnitModel } } {
  const [fid, uid] = id.includes('/') ? id.split('/') : [null, id];
  for (const f of PLAYABLE) {
    if (fid && f.id !== fid) continue;
    const u = f.units.find((x) => x.id === uid) as Unit | undefined;
    if (u?.model) return { f, u: u as Unit & { model: UnitModel } };
  }
  throw new Error(`no unit ${id} with a model`);
}
async function bakeOptsOf(f: FactionSpec, u: Unit): Promise<UnitBakeOptions> {
  const load = arts[`../src/factions/${f.id}/art.ts`];
  const mod = load ? await load() : {};
  return mod.bakeOpts ? mod.bakeOpts(u as never) : {};
}
async function printsOf(f: FactionSpec): Promise<UnitPrints[]> {
  const load = printSets[`../src/factions/${f.id}/prints.ts`];
  return load ? (await load()).prints : [];
}

/** The unit's scale: tabletop, or bigger so its longest side (in its first standard pose, or standing) is at least `minSize` mm. */
function scaleOf(model: UnitModel, bake: UnitBakeOptions, given?: number, ref: PrintPose = { name: 'standing', anim: 'idle', phase: 0 }): { mm: number; kind: string } {
  if (given) return { mm: given, kind: 'given' };
  const e = extent(w, recordPose(model, ref, TABLETOP, bake), { ...base, facet: 3 });
  const longest = Math.max(...e);
  if (longest >= minSize) return { mm: TABLETOP, kind: 'tabletop' };
  const mm = Math.ceil(((TABLETOP * minSize) / longest) * 2) / 2;
  return { mm, kind: 'display' };
}

interface FileReport { file: string; unit: string; pose: string; anim: string; phase: number; armed: boolean; air: boolean; base: boolean; mmPerUnit: number; scale: string; label: string; size: number[]; check: MeshCheck; print?: PrintReport; part?: string; warnings: string[] }

/** Write a solid as STL, check the file as written, and say how it did. */
function write(dir: string, file: string, m: Manifold, minThick = THIN): MeshCheck {
  const bytes = toStl(m, `VibeCraft ${file}`);
  writeFileSync(join(dir, file), bytes);
  return checkMesh(readStl(bytes), w, minThick);
}
const ok = (c: MeshCheck) => c.watertight && c.oriented && !c.degenerate && c.shells === 1 && c.volume > 0 && c.manifoldOk !== false;
const fmt = (c: MeshCheck) => `${c.size.map((x) => x.toFixed(1)).join(' x ')} mm, ${c.triangles} tris, ${(c.volume / 1000).toFixed(2)} cm3, ${ok(c) ? 'solid OK' : `PROBLEM (open ${c.openEdges}, oriented ${c.oriented}, degenerate ${c.degenerate}, shells ${c.shells}, manifold ${c.manifoldOk})`}, thinnest p1 ${c.thin?.p1.toFixed(2)} mm`;

const reports: FileReport[] = [];
async function exportPose(id: string, pose: PrintPose, mmGiven: number | undefined, dir: string): Promise<void> {
  const { f, u } = findUnit(id), bake = await bakeOptsOf(f, u), { mm, kind } = scaleOf(u.model, bake, mmGiven, (await printsOf(f)).find((p) => p.unit === u.id)?.poses[0]);
  const t0 = Date.now(), warnings: string[] = [];
  let { solid, report } = printPose(w, u.model, pose, { ...base, mmPerUnit: mm }, bake);
  if ((!report.stands || report.margin < 1) && pose.base === undefined && !pose.air) { // (it would fall over: on a base it stands)
    pose = { ...pose, base: true };
    ({ solid, report } = printPose(w, u.model, pose, { ...base, mmPerUnit: mm }, bake));
    warnings.push('on a base: it tips over without one');
  }
  const file = `${u.id}-${pose.name}.stl`, check = write(dir, file, solid, THIN);
  if (!ok(check)) warnings.push('not a clean solid');
  if (!report.stands) warnings.push('tips over');
  if ((check.thin?.under ?? 0) > 0.03) warnings.push(`${Math.round((check.thin?.under ?? 0) * 100)}% of its surface under ${THIN} mm thick (edges and points)`);
  if (report.connect.bridged) warnings.push(`${report.connect.bridged} loose piece(s) joined on by a strut`);
  if (report.belowGround > 0.02) warnings.push(`${Math.round(report.belowGround * 100)}% of it was below the ground and cut away`);
  const label = `${u.name}: ${pose.name} (${pose.anim} ${pose.phase}${pose.armed === false ? ', unarmed' : ''}${pose.air ? ', on a post' : pose.base ? ', on a base' : ''}), ${check.size.map((x) => x.toFixed(0)).join('x')} mm at ${mm.toFixed(1)} mm/m ${kind}, ${check.triangles} tris`;
  reports.push({ file, unit: u.id, pose: pose.name, anim: pose.anim, phase: pose.phase, armed: pose.armed ?? true, air: !!pose.air, base: pose.base ?? !!pose.air, mmPerUnit: mm, scale: kind, label, size: check.size, check, print: report, warnings });
  console.log(`${file}: ${fmt(check)}, ${report.stands ? 'stands' : 'TIPS'} (margin ${report.margin.toFixed(1)} mm)${warnings.length ? ' | ' + warnings.join('; ') : ''} [${((Date.now() - t0) / 1000).toFixed(1)} s]`);
}

async function exportArticulated(id: string, dir: string): Promise<void> {
  const { f, u } = findUnit(id), bake = await bakeOptsOf(f, u);
  const spec = (await printsOf(f)).find((p) => p.unit === u.id)?.articulated;
  if (!spec) throw new Error(`${u.id} has no articulated figure in ${f.id}/prints.ts`);
  const t0 = Date.now();
  const fig = articulate(w, u.model, spec, base, bake);
  const lay = `${u.id}-articulated.stl`, check = write(dir, lay, fig.plate);
  // (the plate is several parts: one shell each is right)
  const plateOk = check.watertight && check.oriented && !check.degenerate && check.shells === fig.parts.length;
  console.log(`${lay}: ${fig.parts.length} parts laid out, ${fmt(check).replace(/solid OK|PROBLEM.*?\)/, plateOk ? 'plate OK' : 'PLATE PROBLEM')} [${((Date.now() - t0) / 1000).toFixed(1)} s]`);
  reports.push({ file: lay, unit: u.id, pose: 'articulated', anim: spec.pose.anim, phase: spec.pose.phase, armed: spec.pose.armed ?? true, air: false, base: !!spec.baseOn, mmPerUnit: spec.mmPerUnit, scale: 'given', label: `${u.name}: poseable figure, ${fig.parts.length} parts on one plate, ${check.size.map((x) => x.toFixed(0)).join('x')} mm at ${spec.mmPerUnit} mm/m, ${check.triangles} tris`, size: check.size, check, warnings: [...fig.notes, ...(plateOk ? [] : ['plate is not clean'])] });
  // (all the parts in place, as posed: for looking at, not printing)
  const together = w.Manifold.compose(fig.assembled), tb = together.boundingBox(), shown = `${u.id}-articulated-assembled.stl`;
  let overlap = 0;
  fig.assembled.forEach((a, i) => fig.assembled.slice(i + 1).forEach((b, k) => {
    const v = a.intersect(b).volume();
    overlap += v;
    if (v > 0.05) console.log(`  (${fig.parts[i].name} and ${fig.parts[i + 1 + k].name} overlap by ${v.toFixed(2)} mm3)`);
  }));
  write(dir, shown, together.translate([-(tb.min[0] + tb.max[0]) / 2, -(tb.min[1] + tb.max[1]) / 2, -tb.min[2]]));
  console.log(`  ${shown}: the parts in place (to look at); parts overlap by ${overlap.toFixed(2)} mm3`);
  reports.push({ file: shown, unit: u.id, pose: 'articulated', part: 'assembled', anim: spec.pose.anim, phase: spec.pose.phase, armed: true, air: false, base: !!spec.baseOn, mmPerUnit: spec.mmPerUnit, scale: 'given', label: `${u.name}: the poseable figure put together (a preview, not for printing); parts overlap ${overlap.toFixed(1)} mm3`, size: [], check: checkMesh(readStl(toStl(together))), warnings: overlap > 0.5 ? ['parts overlap'] : [] });
  for (const p of fig.parts) {
    const file = `${u.id}-articulated-${p.name}.stl`, c = write(dir, file, p.solid);
    console.log(`  ${file}: ${fmt(c)}${p.note ? ' | ' + p.note : ''}`);
    reports.push({ file, unit: u.id, pose: 'articulated', part: p.name, anim: spec.pose.anim, phase: spec.pose.phase, armed: spec.pose.armed ?? true, air: false, base: p.name === spec.baseOn, mmPerUnit: spec.mmPerUnit, scale: 'given', label: `${u.name}: part '${p.name}'${p.note ? ` (${p.note})` : ''}, ${c.size.map((x) => x.toFixed(0)).join('x')} mm, ${c.triangles} tris`, size: c.size, check: c, warnings: ok(c) ? [] : ['not a clean solid'] });
  }
  for (const note of fig.notes) console.log(`  note: ${note}`);
  console.log(`  joints: ${fig.joints.map((j) => `${j.name} ball ${(2 * j.ball).toFixed(1)} mm, neck ${(2 * j.neck).toFixed(1)} mm, wall ${j.wall.toFixed(1)} mm, snap ${j.lip.toFixed(2)} mm`).join('; ')}`);
}

const [what, ...rest] = args;
if (what === 'all') {
  const factions = rest[0] ? PLAYABLE.filter((f) => f.id === rest[0]) : PLAYABLE;
  for (const f of factions) {
    const set = await printsOf(f);
    if (!set.length) continue;
    const dir = flags.get('out') ?? join('prints', f.id);
    mkdirSync(dir, { recursive: true });
    for (const p of set) {
      for (const pose of p.poses) await exportPose(`${f.id}/${p.unit}`, pose, p.mmPerUnit, dir);
      if (p.articulated && flags.get('articulated') !== 'false') await exportArticulated(`${f.id}/${p.unit}`, dir);
    }
    saveReport(dir, f.name);
  }
} else {
  const { f, u } = findUnit(what);
  const dir = flags.get('out') ?? join('prints', f.id);
  mkdirSync(dir, { recursive: true });
  if (rest[0] === 'articulated') await exportArticulated(`${f.id}/${u.id}`, dir);
  else {
    const anim = (rest[0] ?? 'idle') as BakedAnim, phase = Number(rest[1] ?? 0);
    const pose: PrintPose = { name: flags.get('name') ?? (rest.length ? `${anim}-${phase}` : 'standing'), anim, phase, air: flags.has('air'), armed: !flags.has('unarmed'), base: flags.has('base') ? true : flags.has('no-base') ? false : undefined };
    await exportPose(`${f.id}/${u.id}`, pose, rest[2] ? Number(rest[2]) : undefined, dir);
  }
  saveReport(dir, f.name);
}

/** Merge this run's files into the folder's report.json (a file exported again replaces its entry). */
function saveReport(dir: string, title: string): void {
  const path = join(dir, 'report.json');
  const old: { files: FileReport[] } = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { files: [] };
  const mine = reports.filter((r) => r.file && existsSync(join(dir, r.file)));
  const files = [...old.files.filter((o) => !mine.some((r) => r.file === o.file)), ...mine];
  writeFileSync(path, JSON.stringify({ title: `${title}: 3D prints`, files }, null, 1));
}
