// Small procedural textures that give baked sprites a painted, material feel.
import * as THREE from 'three';

type TexName = 'cloth' | 'fur' | 'wood' | 'stone' | 'thatch' | 'leather' | 'metal' | 'skin' | 'hair' | 'leaf';

const cache = new Map<string, { map: THREE.Texture; bump: THREE.Texture }>();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise. */
function valueNoise(size: number, cells: number, r: () => number): Float32Array {
  const grid = new Float32Array(cells * cells).map(() => r());
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const g = (gx: number, gy: number) => grid[((gy % cells) * cells) + (gx % cells)];
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * sx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * sx;
    out[y * size + x] = a + (b - a) * sy;
  }
  return out;
}

export function texture(name: TexName): { map: THREE.Texture; bump: THREE.Texture } {
  const hit = cache.get(name);
  if (hit) return hit;
  const S = 128;
  const r = rng(name.length * 7919 + name.charCodeAt(0));
  const n1 = valueNoise(S, 6, r), n2 = valueNoise(S, 24, r), n3 = valueNoise(S, 64, r);
  const v = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    let k: number;
    switch (name) {
      case 'cloth': k = 0.55 + 0.25 * n1[i] + 0.15 * ((x % 2) ^ (y % 2)) + 0.1 * n3[i]; break;
      case 'fur': k = 0.45 + 0.3 * n1[i] + 0.35 * n3[(y * S + ((x + Math.floor(n1[i] * 8)) % S))] * (0.6 + 0.4 * Math.sin(y * 0.9 + n2[i] * 6)); break;
      case 'hair': k = 0.5 + 0.35 * Math.abs(Math.sin(x * 0.7 + n2[i] * 5)) + 0.15 * n3[i]; break;
      case 'wood': k = 0.55 + 0.3 * Math.abs(Math.sin((y + n1[i] * 14) * 0.45)) + 0.15 * n3[i]; break;
      case 'stone': k = 0.4 + 0.35 * n1[i] + 0.25 * n2[i] + (n2[i] > 0.72 ? -0.25 : 0); break;
      case 'thatch': k = 0.4 + 0.45 * Math.abs(Math.sin(x * 1.3 + n2[i] * 4)) * (0.6 + 0.4 * n3[i]) + 0.15 * n1[i]; break;
      case 'leather': k = 0.6 + 0.25 * n2[i] + 0.15 * n3[i]; break;
      case 'metal': k = 0.7 + 0.15 * n3[i] + 0.15 * n1[i]; break;
      case 'skin': k = 0.85 + 0.1 * n1[i] + 0.05 * n3[i]; break;
      case 'leaf': k = 0.3 + 0.55 * n3[i] * n3[i] + 0.25 * n2[i] + (n3[i] > 0.8 ? 0.2 : 0); break;
    }
    v[i] = Math.max(0, Math.min(1, k));
  }
  const make = (fn: (k: number) => number) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const g = Math.round(fn(v[i]) * 255);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  // Colour map stays near white so material colours read true; bump uses full range.
  const map = make((k) => 0.72 + 0.28 * k);
  const bump = make((k) => k);
  bump.colorSpace = THREE.NoColorSpace;
  const out = { map, bump };
  cache.set(name, out);
  return out;
}
