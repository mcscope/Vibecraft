// A faction's band picture staged in 3D (its band.ts: BandStaging): its models built into one scene, lit like the
// baked art (the same three lights, turned with the camera), shot once from a free camera, low and close.
import * as THREE from 'three';
import type { TeamColors } from '../art/contract';
import type { BandStaging, FactionSpec } from '../factions/types';
import { Builder } from '../kits/bake3d/builder';
import { bakedPose, type BakedAnim, type UnitBakeOptions } from '../kits/bake3d/baker';
import type { BuildingModel, UnitModel } from '../kits/bake3d/types';
import { texture } from '../kits/bake3d/textures';

/** A side in the picture: its faction, its colours, what its units bake (their trailing parts). */
export interface BandSide { f: FactionSpec; team: TeamColors; opts?: (u: never) => UnitBakeOptions }

/**
 * Render `staging` into a W×H canvas (drawn at twice that and brought down, for clean edges). Its cast are of
 * `sides[0]`, unless one says another (`side`: a picture of several armies).
 */
export function renderBand(sides: BandSide[], staging: BandStaging, W: number, H: number): HTMLCanvasElement {
  const team = sides[0].team;
  const SS = 2, renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W * SS, H * SS, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = staging.exposure ?? 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const [cx, cy, cz] = staging.camera.from, [tx, ty, tz] = staging.camera.to;
  // the baker's three lights, set like a photographer's around this camera: the warm key sun high to the left and
  // a little behind us (casting the shadows), a cool fill from the right, a rim light from behind picking out edges
  const fwd = new THREE.Vector3(tx - cx, 0, tz - cz).normalize(), up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(fwd, up);
  const place = (r: number, u: number, f: number) => right.clone().multiplyScalar(r).addScaledVector(up, u).addScaledVector(fwd, f);
  const xs = staging.cast.map((c) => c.at[0]), zs = staging.cast.map((c) => c.at[1]);
  const mid = new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
  const reach = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2 + 14;
  const moon = !!staging.sun?.moon; // (by moonlight: everything cooler and dimmer)
  scene.add(new THREE.HemisphereLight(moon ? '#7f93c8' : '#dfe6ff', moon ? '#3a3a4a' : '#8c7650', moon ? 0.55 : 1)); // (the lit ground bounces warm light up into undersides a low camera sees)
  const low = staging.sun ? staging.sun.elevation < 30 : false, sun = new THREE.DirectionalLight(moon ? '#b8c8ff' : low ? '#ffcf96' : '#ffe6c4', moon ? 1.6 : low ? 3.6 : 3.1);
  if (staging.sun) {
    const az = (staging.sun.azimuth * Math.PI) / 180, el = (staging.sun.elevation * Math.PI) / 180;
    sun.position.copy(place(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(80).add(mid));
  } else sun.position.copy(place(-0.55, 0.8, -0.35).multiplyScalar(60).add(mid));
  sun.target.position.copy(mid);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 2;
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 260 });
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#a9c0ff', moon ? 0.35 : 0.7);
  fill.position.copy(place(0.8, 0.4, -0.5));
  // (two rims, from behind on either side: a dark glossy body against the sky needs its edges picked out)
  const rim = new THREE.DirectionalLight('#fff3dc', 2.2), rim2 = new THREE.DirectionalLight('#fff3dc', 1.6);
  rim.position.copy(place(-0.5, 0.5, 1));
  rim2.position.copy(place(0.6, 0.45, 1));
  scene.add(fill, rim, rim2);
  // lamps in the scene (crystal light, fires): each lights what's near it
  for (const l of staging.lights ?? []) {
    const p = new THREE.PointLight(l.color, l.intensity ?? 30, l.reach ?? 12, 1.6);
    p.position.set(l.at[0], l.y ?? 1.5, l.at[1]);
    scene.add(p);
  }
  // a dusk sky with the side's colour glowing low behind the band; grass running off into haze
  const camera = new THREE.PerspectiveCamera(staging.camera.fov, W / H, 0.3, 400);
  camera.position.set(cx, cy, cz);
  camera.lookAt(tx, ty, tz);
  camera.updateMatrixWorld();
  // (where the horizon falls in the picture, so the sky meets the far ground there)
  const hz = Math.min(0.98, Math.max(0.05, (1 - new THREE.Vector3(cx + fwd.x * 1000, cy, cz + fwd.z * 1000).project(camera).y) / 2));
  const [top, horizon] = staging.sky ?? ['#33496a', '#efd6a2'];
  const sky = paintSky(staging, W / H, hz, top, horizon, sides.length > 1 ? null : team.primary);
  const bg = new THREE.CanvasTexture(sky);
  bg.colorSpace = THREE.SRGBColorSpace;
  scene.background = bg;
  const fogFrom = staging.fog?.[0] ?? Math.max(30, Math.hypot(cx - mid.x, cz - mid.z) * 1.3);
  scene.fog = new THREE.Fog(staging.fogColor ?? horizon, fogFrom, staging.fog?.[1] ?? fogFrom + 130); // (the ground fades into the sky at the horizon)
  const grass = texture('leaf').map.clone();
  grass.repeat.set(160, 160);
  grass.needsUpdate = true;
  // the ground: flat far off, shaped by the hills near (each a smooth mound), with pools lying in it
  const height = (x: number, z: number) => (staging.hills ?? []).reduce((y, h) => {
    const d = Math.hypot(x - h.at[0], z - h.at[1]) / h.r;
    return d >= 1 ? y : y + h.h * (0.5 + 0.5 * Math.cos(Math.PI * d));
  }, 0);
  const groundMat = new THREE.MeshStandardMaterial({ color: staging.ground ?? '#62743a', map: grass, roughness: 1 });
  const far = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMat);
  far.rotation.x = -Math.PI / 2;
  far.position.y = -0.01;
  far.receiveShadow = true;
  scene.add(far);
  // ridgelines on the horizon, one behind another, fading into the haze (flat colour, the fog greys them)
  for (const [i, r] of (staging.ridges ?? []).entries()) {
    const n = 200, width = r.distance * 4.2, g = new THREE.BufferGeometry(), pts: number[] = [], idx: number[] = [];
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x), base = new THREE.Vector3(cx, 0, cz).addScaledVector(fwd, r.distance);
    for (let k = 0; k <= n; k++) {
      const t = k / n - 0.5, u = t * 9 + i * 3.7, jag = r.jag ?? 0.5;
      const y = r.height * (0.55 + 0.3 * Math.sin(u * 1.3) + 0.15 * Math.sin(u * 3.1 + 1) + jag * 0.18 * Math.sin(u * 11.7) + jag * 0.08 * Math.sin(u * 27.3)) * (r.peaks ? 1 + 0.9 * Math.max(0, Math.sin(u * 0.9 + i)) ** 6 : 1);
      const p = base.clone().addScaledVector(side, t * width);
      pts.push(p.x, -2, p.z, p.x, Math.max(0, y), p.z);
      if (k < n) idx.push(2 * k, 2 * k + 2, 2 * k + 1, 2 * k + 1, 2 * k + 2, 2 * k + 3);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setIndex(idx);
    // (aerial perspective by hand: further, more of the horizon's colour; no fog, so the furthest still stand out)
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(r.color).lerp(new THREE.Color(staging.fogColor ?? horizon), Math.min(0.5, r.distance / 300)), side: THREE.DoubleSide, fog: false })));
  }
  if (staging.hills?.length || staging.groundColors) {
    const near = new THREE.PlaneGeometry(160, 160, 320, 320);
    near.rotateX(-Math.PI / 2);
    near.translate(mid.x, 0, mid.z);
    const pos = near.attributes.position, cols = staging.groundColors?.map((c) => new THREE.Color(c));
    const colour = new Float32Array(pos.count * 3), tint = new THREE.Color();
    // (a smooth noise, from a few sine waves: patches of the palette's colours, the same every time)
    const noise = (x: number, z: number, k: number) => 0.5 + 0.25 * Math.sin(x * 0.21 * k + z * 0.13 + k) * Math.sin(z * 0.17 * k - x * 0.07 + 2 * k) + 0.25 * Math.sin((x + z) * 0.43 * k + 3 * k);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, height(x, z));
      if (cols) {
        const n = noise(x, z, 1) * (cols.length - 1), j = Math.min(cols.length - 2, Math.floor(n));
        tint.copy(cols[j]).lerp(cols[j + 1], Math.min(1, n - j)).multiplyScalar(0.9 + 0.2 * noise(x, z, 3.1));
      } else tint.set(staging.ground ?? '#62743a');
      tint.toArray(colour, i * 3);
    }
    near.setAttribute('color', new THREE.BufferAttribute(colour, 3));
    near.computeVertexNormals();
    const hill = new THREE.Mesh(near, new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, map: grass, roughness: 1 }));
    hill.receiveShadow = hill.castShadow = true;
    scene.add(hill);
  }
  for (const w of staging.water ?? []) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(w.r, 48), new THREE.MeshStandardMaterial({ color: '#4d6a70', roughness: 0.12, metalness: 0.2, emissive: new THREE.Color(horizon).multiplyScalar(0.45), transparent: true, opacity: 0.92 })); // (no reflections: the sky's colour glows in it)
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(w.at[0], height(w.at[0], w.at[1]) + 0.04, w.at[1]);
    pool.receiveShadow = true;
    scene.add(pool);
  }
  // scattered scenery: spots at random in a disc (the same every time)
  const strewn = (staging.scatter ?? []).flatMap((sc, k) => Array.from({ length: sc.n }, (_, i) => {
    const h = (m: number) => { const v = Math.sin((i + 1) * 12.9898 * m + (k + 1) * 78.233) * 43758.5453; return v - Math.floor(v); };
    const a = h(1) * Math.PI * 2, d = Math.sqrt(h(2)) * sc.r, [lo, hi] = sc.scale ?? [1, 1];
    return { model: sc.models[Math.floor(h(3) * sc.models.length)], at: [sc.at[0] + Math.cos(a) * d, sc.at[1] + Math.sin(a) * d] as [number, number], face: h(4) * 360, scale: lo + (hi - lo) * h(5) };
  }));
  // A flier or a thrown crystal stays whole in the picture: one staged so high that its top would cross the upper edge
  // comes down until it sits just inside (things on the ground are left alone: up close they may fill the frame).
  const keepInFrame = (o: THREE.Object3D): void => {
    const span = Math.tan((staging.camera.fov * Math.PI) / 360), v = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      o.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(o);
      if (box.isEmpty()) return;
      let over = 0;
      for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) {
        const depth = -v.set(x, box.max.y, z).applyMatrix4(camera.matrixWorldInverse).z;
        if (depth > 0.3) over = Math.max(over, (v.y / (depth * span) - 0.88) * depth * span); // (its top above 6 % from the edge: by how many metres)
      }
      // (and its sides inside the left and right edges: it slides along the camera's right-hand axis)
      let side = 0;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const depth = -v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse).z, half = depth * span * (W / H) * 0.97;
        if (depth > 0.3 && Math.abs(v.x) > half && Math.abs(v.x) - half > Math.abs(side)) side = Math.sign(v.x) * (Math.abs(v.x) - half);
      }
      if (over <= 0.01 && Math.abs(side) <= 0.01) return;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      o.position.x -= right.x * side; o.position.z -= right.z * side;
      o.position.y = Math.max(height(o.position.x, o.position.z), o.position.y - Math.max(0, over));
    }
  };
  for (const p of [...(staging.props ?? []), ...strewn]) {
    const g = new THREE.Group();
    g.position.set(p.at[0], height(p.at[0], p.at[1]) + ((p as { lift?: number }).lift ?? 0), p.at[1]);
    g.rotation.y = ((p.face ?? 0) * Math.PI) / 180;
    g.scale.setScalar(p.scale ?? 1);
    p.model(new Builder(team, g));
    if ((p as { lift?: number }).lift) keepInFrame(g);
    scene.add(g);
  }
  for (const c of staging.cast) {
    const { f, team, opts } = sides[(c as { side?: number }).side ?? 0];
    const unit = f.units.find((u) => u.id === c.id) as (FactionSpec['units'][number] & { model?: UnitModel }) | undefined;
    const building = f.buildings?.find((b) => b.id === c.id) as { model?: BuildingModel } | undefined;
    const body = new THREE.Group();
    body.position.set(c.at[0], height(c.at[0], c.at[1]) + (c.lift ?? 0), c.at[1]);
    body.rotation.order = 'YXZ'; // (turned to face its way, then rolled about its length, then pitched nose down)
    body.rotation.set(((c.roll ?? 0) * Math.PI) / 180, ((c.face ?? 0) * Math.PI) / 180 - Math.PI / 2, (-(c.pitch ?? 0) * Math.PI) / 180); // (models face +x)
    if (unit?.model) {
      const pose = bakedPose((c.anim ?? 'idle') as BakedAnim, c.phase ?? 0, team), segments = opts?.(unit as never).segments;
      if (!segments?.length) unit.model(new Builder(team, body), pose);
      else [0, ...segments].forEach((behind, part) => { // (a body in trailing parts: each that far back along its way)
        const g = new THREE.Group();
        g.position.x = -behind;
        body.add(g);
        unit.model!(new Builder(team, g), { ...pose, part });
      });
    } else if (building?.model) building.model(new Builder(team, body));
    else continue;
    if (c.lift) keepInFrame(body);
    scene.add(body);
  }
  renderer.render(scene, camera);
  // brought down to size, finished as the baker finishes its sprites (a touch more contrast and colour), edges shaded
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const g = out.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.filter = 'contrast(1.07) saturate(1.12)';
  g.drawImage(renderer.domElement, 0, 0, W, H);
  g.filter = 'none';
  const vignette = g.createRadialGradient(W / 2, H * 0.55, H * 0.4, W / 2, H * 0.55, W * 0.78);
  vignette.addColorStop(0, 'rgba(10,9,7,0)'); vignette.addColorStop(1, 'rgba(10,9,7,0.55)');
  g.fillStyle = vignette; g.fillRect(0, 0, W, H);
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}

/**
 * The sky behind the picture, painted to its shape: a gradient from `top` to `horizon` (meeting the ground at `hz`, 0
 * the top of the picture, 1 the bottom), with the staging's sun (its glow, a disc, rays), clouds lit from the sun's
 * side, a storm front darkening one side, distant glows on the horizon, and a hint of `tint` (one side's colour).
 */
function paintSky(staging: BandStaging, aspect: number, hz: number, top: string, horizon: string, tint: string | null): HTMLCanvasElement {
  const SW = 1024, SH = Math.round(SW / aspect), c = document.createElement('canvas');
  c.width = SW; c.height = SH;
  const g = c.getContext('2d')!, H = hz * SH, mix = (a: string, b: string, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k).getStyle();
  // (a deterministic random, so every retake paints the same sky)
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const grad = g.createLinearGradient(0, 0, 0, SH);
  grad.addColorStop(0, top); grad.addColorStop(hz * 0.55, mix(top, horizon, 0.38)); grad.addColorStop(hz * 0.85, mix(top, horizon, 0.75)); grad.addColorStop(hz, horizon); grad.addColorStop(1, horizon);
  g.fillStyle = grad; g.fillRect(0, 0, SW, SH);
  const radial = (x: number, y: number, r: number, color: string, alpha: number) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r), col = new THREE.Color(color);
    const rgba = (a: number) => `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a})`;
    rg.addColorStop(0, rgba(alpha)); rg.addColorStop(1, rgba(0));
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  if (tint) radial(SW / 2, H, SW * 0.6, tint, 0.22);
  const sun = staging.sun, sx = sun ? SW / 2 + (SW / 2) * Math.sin((sun.azimuth * Math.PI) / 180) * 0.9 : SW / 2, sy = H - SH * 0.05 - (sun ? (sun.elevation / 90) * SH * 0.6 : 0);
  if (sun) radial(sx, H, SW * 0.55, sun.moon ? '#9fb4e8' : '#ffbe78', sun.moon ? 0.25 : 0.55);
  for (const glow of staging.glows ?? []) radial(glow.x * SW, H, SW * (glow.r ?? 0.12), glow.color, 0.7); // (distant fires, crystal light)
  for (let i = 0; i < (staging.stars ?? 0); i++) { // stars, thinning toward the horizon
    const x = rnd() * SW, y = rnd() ** 1.6 * H * 0.85, r = 0.4 + rnd() * 1.1;
    g.fillStyle = `rgba(235,240,255,${0.35 + 0.6 * rnd() * (1 - y / H)})`; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  if (staging.storm) { // a storm front: one side dark and heavy
    const st = g.createLinearGradient(staging.storm < 0 ? 0 : SW, 0, SW / 2, 0);
    st.addColorStop(0, 'rgba(24,26,38,0.82)'); st.addColorStop(1, 'rgba(24,26,38,0)');
    g.fillStyle = st; g.fillRect(0, 0, SW, H);
  }
  if (staging.clouds) { // long banks of cloud in layers: each a soft streak in shade, its underside lit warm toward the sun
    const n = staging.clouds === 'many' ? 46 : 24;
    for (let i = 0; i < n; i++) {
      const band = (0.12 + 0.8 * rnd()) * H * 0.95, x = rnd() * SW * 1.3 - SW * 0.15, rx = SW * (0.12 + rnd() * 0.3), ry = SH * (0.012 + rnd() * 0.03);
      const storm = staging.storm && Math.sign(x - SW / 2) === staging.storm, near = 1 - band / H; // (higher up: bigger and darker)
      const lit = Math.max(0, 1 - Math.abs(x - sx) / SW) * 0.6 + 0.2;
      const body = storm ? `rgba(30,30,44,${0.55 + 0.25 * near})` : `rgba(${mix(top, '#6a6070', 0.55).slice(4, -1)},${0.28 + 0.25 * near})`;
      const glow = storm ? 'rgba(150,100,80,0.25)' : `rgba(255,${Math.round(200 + 30 * lit)},${Math.round(150 + 40 * lit)},${0.25 + 0.35 * lit})`;
      for (const [dy, col, k] of [[0, body, 1], [ry * 0.55, glow, 0.85]] as const) {
        g.save(); g.translate(x, band + dy); g.scale(1, (ry * k) / (rx * k));
        const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx * k);
        rg.addColorStop(0, col); rg.addColorStop(0.55, col.replace(/[\d.]+\)$/, (m) => `${parseFloat(m) * 0.5})`)); rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(0, 0, rx * k, 0, Math.PI * 2); g.fill(); g.restore();
      }
    }
  }
  for (const bolt of staging.lightning ?? []) { // a forked bolt from the cloud base, glowing
    let x = bolt * SW, y = H * 0.08;
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(220,230,255,0.9)'; g.shadowColor = '#b8c8ff'; g.shadowBlur = 18; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(x, y);
    while (y < H * 0.85) { x += (rnd() - 0.5) * SW * 0.03; y += H * (0.04 + rnd() * 0.05); g.lineTo(x, y); }
    g.stroke(); g.restore();
    radial(bolt * SW, H * 0.3, SW * 0.12, '#c8d4ff', 0.25);
  }
  if (sun?.disc) { // the low sun itself, and rays fanning from it through the haze
    if (sun.rays) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        const a = Math.PI * (0.05 + 0.9 * (i / 15)) + (rnd() - 0.5) * 0.08, len = SW * (0.6 + rnd() * 0.5), w = 0.015 + rnd() * 0.03;
        const rg = g.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
        rg.addColorStop(0, 'rgba(255,220,170,0.16)'); rg.addColorStop(1, 'rgba(255,220,170,0)');
        g.fillStyle = rg; g.beginPath(); g.moveTo(sx, sy);
        g.lineTo(sx + Math.cos(a - w) * len, sy + Math.sin(a - w) * len); g.lineTo(sx + Math.cos(a + w) * len, sy + Math.sin(a + w) * len); g.fill();
      }
      g.restore();
    }
    radial(sx, sy, SW * 0.16, sun.moon ? '#b8c8f0' : '#ffd9a0', sun.moon ? 0.35 : 0.75);
    radial(sx, sy, SW * 0.035, sun.moon ? '#e8eeff' : '#fff4dc', sun.moon ? 0.6 : 1);
    g.fillStyle = sun.moon ? '#eef2ff' : '#fffaf0'; g.beginPath(); g.arc(sx, sy, SW * 0.018, 0, Math.PI * 2); g.fill();
  }
  return c;
}
