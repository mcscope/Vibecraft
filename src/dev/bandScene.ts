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
  renderer.toneMappingExposure = 1.2;
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
  scene.add(new THREE.HemisphereLight('#dfe6ff', '#8c7650', 1)); // (the lit ground bounces warm light up into undersides a low camera sees)
  const sun = new THREE.DirectionalLight('#ffe6c4', 3.1);
  sun.position.copy(place(-0.55, 0.8, -0.35).multiplyScalar(60).add(mid));
  sun.target.position.copy(mid);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 2;
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 200 });
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#a9c0ff', 0.7);
  fill.position.copy(place(0.8, 0.4, -0.5));
  // (two rims, from behind on either side: a dark glossy body against the sky needs its edges picked out)
  const rim = new THREE.DirectionalLight('#fff3dc', 2.2), rim2 = new THREE.DirectionalLight('#fff3dc', 1.6);
  rim.position.copy(place(-0.5, 0.5, 1));
  rim2.position.copy(place(0.6, 0.45, 1));
  scene.add(fill, rim, rim2);
  // a dusk sky with the side's colour glowing low behind the band; grass running off into haze
  const camera = new THREE.PerspectiveCamera(staging.camera.fov, W / H, 0.3, 400);
  camera.position.set(cx, cy, cz);
  camera.lookAt(tx, ty, tz);
  camera.updateMatrixWorld();
  // (where the horizon falls in the picture, so the sky meets the far ground there)
  const hz = Math.min(0.98, Math.max(0.05, (1 - new THREE.Vector3(cx + fwd.x * 1000, cy, cz + fwd.z * 1000).project(camera).y) / 2));
  const sky = document.createElement('canvas');
  sky.width = 256; sky.height = 256;
  const sg = sky.getContext('2d')!, grad = sg.createLinearGradient(0, 0, 0, 256);
  const [top, horizon] = staging.sky ?? ['#33496a', '#efd6a2'];
  grad.addColorStop(0, top); grad.addColorStop(hz * 0.65, new THREE.Color(top).lerp(new THREE.Color(horizon), 0.5).getStyle()); grad.addColorStop(hz, horizon); grad.addColorStop(1, horizon);
  sg.fillStyle = grad; sg.fillRect(0, 0, 256, 256);
  const glow = sg.createRadialGradient(128, hz * 256, 0, 128, hz * 256, 150);
  glow.addColorStop(0, team.primary); glow.addColorStop(1, 'rgba(0,0,0,0)');
  sg.globalAlpha = sides.length > 1 ? 0 : 0.22; sg.fillStyle = glow; // (a hint of the side's colour: more turns dark bodies blue) sg.fillRect(0, 0, 256, 256);
  const bg = new THREE.CanvasTexture(sky);
  bg.colorSpace = THREE.SRGBColorSpace;
  scene.background = bg;
  scene.fog = new THREE.Fog(horizon, 35, 160); // (the ground fades into the sky at the horizon)
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
  if (staging.hills?.length) {
    const near = new THREE.PlaneGeometry(120, 120, 240, 240);
    near.rotateX(-Math.PI / 2);
    near.translate(mid.x, 0, mid.z);
    const pos = near.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
    near.computeVertexNormals();
    const hill = new THREE.Mesh(near, groundMat);
    hill.receiveShadow = hill.castShadow = true;
    scene.add(hill);
  }
  for (const w of staging.water ?? []) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(w.r, 48), new THREE.MeshStandardMaterial({ color: '#5d7c80', roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.88 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(w.at[0], height(w.at[0], w.at[1]) + 0.04, w.at[1]);
    pool.receiveShadow = true;
    scene.add(pool);
  }
  for (const p of staging.props ?? []) {
    const g = new THREE.Group();
    g.position.set(p.at[0], height(p.at[0], p.at[1]), p.at[1]);
    g.rotation.y = ((p.face ?? 0) * Math.PI) / 180;
    g.scale.setScalar(p.scale ?? 1);
    p.model(new Builder(team, g));
    scene.add(g);
  }
  for (const c of staging.cast) {
    const { f, team, opts } = sides[(c as { side?: number }).side ?? 0];
    const unit = f.units.find((u) => u.id === c.id) as (FactionSpec['units'][number] & { model?: UnitModel }) | undefined;
    const building = f.buildings?.find((b) => b.id === c.id) as { model?: BuildingModel } | undefined;
    const body = new THREE.Group();
    body.position.set(c.at[0], height(c.at[0], c.at[1]) + (c.lift ?? 0), c.at[1]);
    body.rotation.y = ((c.face ?? 0) * Math.PI) / 180 - Math.PI / 2; // (models face +x)
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
