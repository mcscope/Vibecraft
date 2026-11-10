// Renders exported STL files as plain grey solids, four views each, into one labeled review image:
//   node scripts/stl-sheet.mjs <folder> [sheet.png]
// It reads <folder>/report.json (written by scripts/stl.ts) for each file's label, loads every listed STL back with
// three.js's STLLoader in headless Chrome and draws it from the front three-quarter, its left side, the front and
// above. Each tile: the file name, its pose, its size in mm and its triangle count.
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'prints'), out = resolve(process.argv[3] ?? join(dir, 'sheet.png'));
const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
const files = report.files.filter((f) => existsSync(join(dir, f.file)));
const three = resolve('node_modules/three');

const page = `<!doctype html><html><body style="margin:0;background:#fff">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
window.sheet = async (files, cols) => {
  const V = 230, TW = V * 4, TH = V + 46, rows = Math.ceil(files.length / cols);
  const out = document.createElement('canvas');
  out.width = cols * TW; out.height = rows * TH + 40;
  const g = out.getContext('2d');
  g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, out.width, out.height);
  g.fillStyle = '#222'; g.font = 'bold 22px sans-serif';
  g.fillText(${JSON.stringify(report.title ?? 'Prints')}, 12, 28);
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(V, V);
  const loader = new STLLoader();
  for (const [i, f] of files.entries()) {
    const geo = loader.parse(await (await fetch('/files/' + f.file)).arrayBuffer());
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#a9a9a9', roughness: 0.75, metalness: 0.05, flatShading: false }));
    geo.computeBoundingSphere();
    const s = geo.boundingSphere, scene = new THREE.Scene();
    scene.background = new THREE.Color('#ffffff');
    scene.add(mesh, new THREE.HemisphereLight('#ffffff', '#666666', 1.3));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    scene.add(key);
    const x0 = (i % cols) * TW, y0 = 40 + Math.floor(i / cols) * TH;
    const views = [[1, -1, 0.7], [0, -1, 0.12], [1, 0, 0.12], [0.001, 0, 1]];
    for (const [k, [vx, vy, vz]] of views.entries()) {
      const cam = new THREE.OrthographicCamera(-s.radius, s.radius, s.radius, -s.radius, 0.1, s.radius * 10);
      const d = new THREE.Vector3(vx, vy, vz).normalize();
      cam.up.set(k === 3 ? 1 : 0, 0, k === 3 ? 0 : 1);
      cam.position.copy(s.center).addScaledVector(d, s.radius * 4);
      cam.lookAt(s.center);
      key.position.copy(cam.position).add(new THREE.Vector3(-s.radius * 2, -s.radius, s.radius * 3));
      r.render(scene, cam);
      g.drawImage(r.domElement, x0 + k * V, y0);
    }
    g.strokeStyle = '#ccc'; g.strokeRect(x0 + 0.5, y0 + 0.5, TW - 1, TH - 1);
    g.fillStyle = '#111'; g.font = 'bold 15px sans-serif';
    g.fillText(f.file, x0 + 8, y0 + V + 18);
    g.fillStyle = '#444'; g.font = '13px sans-serif';
    g.fillText(f.label, x0 + 8, y0 + V + 37);
  }
  return out.toDataURL('image/png');
};
document.title = 'ready';
</script></body></html>`;

const types = { '.js': 'text/javascript', '.stl': 'model/stl' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const path = url === '/' ? null : url.startsWith('/three/') ? join(three, url.slice(7)) : url.startsWith('/files/') ? join(dir, url.slice(7)) : null;
  if (url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page); return; }
  if (!path || !existsSync(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
}).listen(0);
const port = server.address().port;
const appleSilicon = process.platform === 'darwin' && execSync('sysctl -n hw.optional.arm64 2>/dev/null || echo 0').toString().trim() === '1';
const browser = await chromium.launch({ ...(appleSilicon ? { executablePath: 'scripts/chrome-arm64.sh' } : { channel: 'chrome' }), headless: true, args: ['--use-angle=metal', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => console.log('page error:', e.message));
  await p.goto(`http://localhost:${port}/`);
  await p.waitForFunction(() => document.title === 'ready');
  const png = await p.evaluate(([f, c]) => window.sheet(f, c), [files, Number(process.env.COLS ?? 2)]);
  writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
  console.log(`${out}: ${files.length} files`);
} finally {
  await browser.close();
  server.close();
}
