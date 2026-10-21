// Implements ModelBuilder on top of three.js. Geometries and materials are
// cached and shared; each frame just builds a fresh tree of Mesh objects.
import * as THREE from 'three';
import type { TeamColors } from '../../art/contract';
import type { Mat, ModelBuilder, Section, Vec3 } from './types';
import { texture } from './textures';

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}

/** Texture repeats per model unit: tiles textures at a steady density so big walls aren't smeared and small parts aren't noise. */
const TEX_PER_UNIT = 0.55;

export interface BuildOpts {
  /** 0..1 soot/darkening (damaged buildings). */
  grime?: number;
  /** Clip planes applied to this geometry (construction / collapse). */
  clip?: THREE.Plane[];
  clipKey?: string;
}

const matCache = new Map<string, THREE.Material>();
const texCache = new Map<string, THREE.Texture>();
function tiled(t: THREE.Texture, ru: number, rv: number, key: string): THREE.Texture {
  let c = texCache.get(key);
  if (!c) {
    c = t.clone();
    c.repeat.set(ru, rv);
    c.needsUpdate = true;
    texCache.set(key, c);
  }
  return c;
}
function material(m: Mat, team: TeamColors, rep: [number, number], o: BuildOpts): THREE.Material {
  const color = m.team ? team[m.team] : (m.color ?? '#888888');
  const tex = m.tex ?? 'none';
  const q = (v: number) => Math.max(0.25, Math.round(v * 4) / 4);
  const ru = q(rep[0] * TEX_PER_UNIT), rv = q(rep[1] * TEX_PER_UNIT);
  const grime = o.grime ?? 0;
  const key = `${color}|${tex}|${m.rough ?? -1}|${m.metal ?? -1}|${m.emissive ?? ''}|${tex === 'none' ? '' : `${ru}x${rv}`}|${grime}|${o.clipKey ?? ''}`;
  let mat = matCache.get(key);
  if (!mat) {
    const t = tex === 'none' ? null : texture(tex);
    const c = new THREE.Color(color);
    if (grime) c.lerp(new THREE.Color('#1c1814'), grime);
    mat = new THREE.MeshStandardMaterial({
      color: c,
      roughness: m.rough ?? (tex === 'metal' ? 0.45 : 0.85),
      metalness: m.metal ?? (tex === 'metal' ? 0.6 : 0),
      map: t ? tiled(t.map, ru, rv, `${tex}/map/${ru}x${rv}`) : null,
      bumpMap: t ? tiled(t.bump, ru, rv, `${tex}/bump/${ru}x${rv}`) : null,
      bumpScale: t ? 2.6 : 0,
      emissive: new THREE.Color(m.emissive ?? '#000000'),
      emissiveIntensity: m.emissive ? 0.6 : 0,
      clippingPlanes: o.clip ?? [],
      clipShadows: !!o.clip,
      side: o.clip ? THREE.DoubleSide : THREE.FrontSide,
    });
    matCache.set(key, mat);
  }
  return mat;
}

const CRYSTAL: Mat = { color: '#8fe6ff', rough: 0.12, metal: 0.15, emissive: '#2a8fc0' };

function rockGeometry(seed: number): THREE.BufferGeometry {
  return geo(`rock${seed}`, () => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.attributes.position;
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    // Displace shared vertices consistently (icosahedron is non-indexed, so key by position).
    const offsets = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (!offsets.has(k)) offsets.set(k, 0.75 + rnd() * 0.45);
      const f = offsets.get(k)!;
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.8, pos.getZ(i) * f);
    }
    g.computeVertexNormals();
    return g;
  });
}

export class Builder implements ModelBuilder {
  constructor(readonly team: TeamColors, private parent: THREE.Object3D, private opts: BuildOpts = {}) {}

  /** `rep`: the surface's real size in model units (u, v), for texture tiling. */
  private add(g: THREE.BufferGeometry, m: Mat, at: Vec3, scale: Vec3, rot?: Vec3, rep?: [number, number]): THREE.Mesh {
    const r: [number, number] = rep ?? [Math.max(Math.abs(scale[0]), Math.abs(scale[2])), Math.abs(scale[1])];
    const mesh = new THREE.Mesh(g, material(m, this.team, r, this.opts));
    mesh.position.set(at[0], at[1], at[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.parent.add(mesh);
    return mesh;
  }

  /** Build part of a model with extra options (clipping, grime) — kit-internal, used for building states. */
  withOpts(extra: BuildOpts, build: (b: ModelBuilder) => void): void {
    const g = new THREE.Group();
    this.parent.add(g);
    build(new Builder(this.team, g, { ...this.opts, ...extra }));
  }

  joint(at: Vec3, rot: Vec3, build: (b: ModelBuilder) => void, scale = 1): void {
    const g = new THREE.Group();
    g.position.set(at[0], at[1], at[2]);
    g.rotation.set(rot[0], rot[1], rot[2]);
    g.scale.setScalar(scale);
    this.parent.add(g);
    build(new Builder(this.team, g, this.opts));
  }

  box(size: Vec3, at: Vec3, mat: Mat, rot?: Vec3): void {
    this.add(geo('box', () => new THREE.BoxGeometry(1, 1, 1)), mat, at, size, rot);
  }

  sphere(radius: number | Vec3, at: Vec3, mat: Mat, rot?: Vec3): void {
    const r: Vec3 = typeof radius === 'number' ? [radius, radius, radius] : radius;
    this.add(geo('sphere', () => new THREE.SphereGeometry(1, 20, 14)), mat, at, r, rot, [Math.PI * (r[0] + r[2]), Math.PI * r[1]]);
  }

  cylinder(rTop: number, rBottom: number, height: number, at: Vec3, mat: Mat, rot?: Vec3, sides = 16): void {
    const ratio = rBottom > 0 ? rTop / rBottom : 1;
    const g = geo(`cyl${ratio.toFixed(3)}:${sides}`, () => new THREE.CylinderGeometry(ratio, 1, 1, sides));
    const rb = rBottom > 0 ? rBottom : rTop;
    this.add(g, mat, at, [rb, height, rb], rot, [2 * Math.PI * rb, height]);
  }

  cone(radius: number, height: number, at: Vec3, mat: Mat, rot?: Vec3, sides = 16): void {
    this.add(geo(`cone${sides}`, () => new THREE.ConeGeometry(1, 1, sides)), mat, at, [radius, height, radius], rot);
  }

  loft(sections: Section[], mat: Mat): void {
    if (sections.length < 2) return;
    // a smooth path through the sections (Catmull-Rom, every value), a ring of points around each step
    const SUB = 6, AROUND = 28;
    const val = (s: Section): number[] => [...s.at, s.w, s.up, s.down, s.keel ?? 0, s.flat ?? 0];
    const pts = sections.map(val);
    const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
    const rings: number[][] = [];
    for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < (i === pts.length - 2 ? SUB + 1 : SUB); k++) {
      const t = k / SUB, p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      rings.push(p1.map((_, j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t)));
    }
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    rings.forEach((r, ri) => {
      const [x, y, z, w, up, down, keel, flat] = r;
      for (let a = 0; a < AROUND; a++) {
        const th = (a / AROUND) * Math.PI * 2, side = Math.sin(th), c = Math.cos(th);
        // above: an ellipse, squared off by `flat`; below: narrowing to a ridge by `keel`
        const sq = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;
        const py = c >= 0 ? up * sq(c, 1 - flat * 0.6) : down * c;
        const pz = c >= 0 ? w * sq(side, 1 - flat * 0.6) : w * side * (1 - Math.max(0, Math.min(1, keel)) * -c) ** 1.3;
        pos.push(x, y + py, z + pz);
        uv.push(a / AROUND, ri / rings.length);
      }
    });
    for (let ri = 0; ri < rings.length - 1; ri++) for (let a = 0; a < AROUND; a++) {
      const i0 = ri * AROUND + a, i1 = ri * AROUND + ((a + 1) % AROUND), j0 = i0 + AROUND, j1 = i1 + AROUND;
      idx.push(i0, j0, i1, i1, j0, j1);
    }
    // the ends close on a centre point
    for (const [ri, flip] of [[0, false], [rings.length - 1, true]] as const) {
      const c = pos.length / 3, [x, y, z, , up, down] = rings[ri];
      pos.push(x, y + (up - down) / 2, z); uv.push(0.5, ri / rings.length);
      for (let a = 0; a < AROUND; a++) { const i0 = ri * AROUND + a, i1 = ri * AROUND + ((a + 1) % AROUND); if (flip) idx.push(c, i1, i0); else idx.push(c, i0, i1); }
    }
    // facing outward whichever way the spine runs: the first quad's normal at the top should point up
    const v = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const n = v(AROUND).sub(v(0)).cross(v(1).sub(v(0)));
    if (n.y < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const span = Math.hypot(rings[0][0] - rings[rings.length - 1][0], rings[0][1] - rings[rings.length - 1][1]);
    const girth = Math.max(...rings.map((r) => r[3]));
    this.add(g, mat, [0, 0, 0], [1, 1, 1], undefined, [Math.PI * 2 * girth, span]);
  }

  limb(a: Vec3, b: Vec3, radius: number, mat: Mat, radiusB = radius): void {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    if (len < 1e-4) return;
    const mid = va.clone().add(vb).multiplyScalar(0.5);
    const ratio = radiusB / radius;
    const g = geo(`limb${ratio.toFixed(3)}`, () => new THREE.CylinderGeometry(1, ratio, 1, 12));
    const mesh = this.add(g, mat, [mid.x, mid.y, mid.z], [radius, len, radius], undefined, [2 * Math.PI * radius, len]);
    // cylinder axis is +y; rotate it onto a→b
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), vb.clone().sub(va).normalize());
    this.sphere(radius, a, mat);
    this.sphere(radiusB, b, mat);
  }

  roof(size: Vec3, at: Vec3, mat: Mat, rot?: Vec3): void {
    // 4-sided cone rotated 45° = square pyramid; scale makes it rectangular.
    const g = geo('roof', () => {
      const c = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
      c.rotateY(Math.PI / 4);
      c.translate(0, 0.5, 0);
      return c;
    });
    this.add(g, mat, at, size, rot);
  }

  rock(size: Vec3, at: Vec3, mat: Mat, seed = 1): void {
    this.add(rockGeometry(seed % 7), mat, at, size, [0, seed * 1.3, 0]);
  }

  crystal(length: number, at: Vec3, rot?: Vec3): void {
    this.joint(at, rot ?? [0, 0, 0], (b) => {
      const r = length * 0.22;
      b.cylinder(r, r, length * 0.6, [0, length * 0.3, 0], CRYSTAL, undefined, 6);
      b.cone(r, length * 0.4, [0, length * 0.8, 0], CRYSTAL, undefined, 6);
      b.cone(r, length * 0.15, [0, -length * 0.075, 0], CRYSTAL, [Math.PI, 0, 0], 6);
    });
  }
}
