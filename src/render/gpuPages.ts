// Loads a GPU-compressed sprite page (KTX2: scripts/ktx2.mjs) as a renderer texture, transcoded by our own copy of
// the KTX transcoder (public/transcoders/ktx) to whatever compressed format this GPU takes (BC7, ASTC, ETC2...).
import { Assets, setKTXTranscoderPath, type Texture } from 'pixi.js';
import 'pixi.js/ktx2';

// (absolute: the transcoder may run in a worker, which resolves relative URLs against itself)
setKTXTranscoderPath({
  jsUrl: new URL('transcoders/ktx/libktx.js', document.baseURI).href,
  wasmUrl: new URL('transcoders/ktx/libktx.wasm', document.baseURI).href,
});

/** A compressed page's texture source (what art/gpu.ts keeps behind a sprite's stand-in `img`). */
export async function loadGpuPage(url: string): Promise<unknown> {
  return ((await Assets.load(url)) as Texture).source;
}
