// Dev-only art cache: art baked in `npm run dev` is kept in the browser (IndexedDB), so a reload loads it in seconds
// instead of baking again. Each entry is keyed by a fingerprint of the source it was baked from: the faction's own
// folder plus the shared art code (the baker, the biomes, the art contract). Edit a model, a helper or the baker and
// the fingerprint changes, so that art bakes fresh; edit anything else and the cache holds.
import { packArt, unpackArt } from './prebaked';

const DB = 'vibecraft-art', STORE = 'art';

// every source file a bake reads, raw (Vite loads these only in dev, on demand)
const SOURCES = import.meta.glob(['/src/factions/**/*.ts', '/src/kits/**/*.ts', '/src/biomes/**/*.ts', '/src/art/*.ts'], { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

/** FNV-1a over the text, twice with different seeds: 64 bits as hex. */
function hash(text: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 15);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** Only art baked from source files here can be fingerprinted (a faction that arrived online has none). */
const hasSource = (factionId: string | null) => factionId === null || Object.keys(SOURCES).some((p) => p.startsWith(`/src/factions/${factionId}/`));

const prints = new Map<string, Promise<string>>();
/** The fingerprint of what a faction's (or the default land's, with null) art is baked from. */
function fingerprint(factionId: string | null): Promise<string> {
  const k = factionId ?? '';
  if (!prints.has(k)) {
    prints.set(k, (async () => {
      const paths = Object.keys(SOURCES).filter((p) => !p.startsWith('/src/factions/') || (factionId !== null && p.startsWith(`/src/factions/${factionId}/`))).sort();
      const texts = await Promise.all(paths.map((p) => SOURCES[p]()));
      return hash(paths.map((p, i) => `${p}\n${texts[i]}`).join('\n'));
    })());
  }
  return prints.get(k)!;
}

const open = (): Promise<IDBDatabase> => new Promise((ok, fail) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => ok(r.result);
  r.onerror = () => fail(r.error);
});
const tx = <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => open().then((db) => new Promise<T>((ok, fail) => {
  const req = run(db.transaction(STORE, mode).objectStore(STORE));
  req.onsuccess = () => ok(req.result);
  req.onerror = () => fail(req.error);
}));

/** Cached art for `key`, baked from `factionId`'s source (null: the default land); null if none matches. */
export async function cachedArt<T>(factionId: string | null, key: string): Promise<T | null> {
  if (!import.meta.env.DEV || !hasSource(factionId)) return null;
  try {
    const id = `${key}@${await fingerprint(factionId)}`;
    const hit = await tx<{ art: unknown; pages: Blob[] } | undefined>('readonly', (s) => s.get(id));
    return hit ? await unpackArt<T>(hit.art, hit.pages) : null;
  } catch { return null; }
}

/** Keep freshly baked art for next time, replacing older bakes of the same key (in the background; a failure only means baking again). */
export function cacheArt(factionId: string | null, key: string, art: unknown): void {
  if (!import.meta.env.DEV || !hasSource(factionId)) return;
  void (async () => {
    try {
      const id = `${key}@${await fingerprint(factionId)}`, { json, pages } = await packArt(art);
      const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
      for (const k of keys) if (typeof k === 'string' && k.startsWith(`${key}@`) && k !== id) await tx('readwrite', (s) => s.delete(k));
      await tx('readwrite', (s) => s.put({ art: JSON.parse(json), pages }, id));
    } catch { /* private mode, or the store is full */ }
  })();
}
