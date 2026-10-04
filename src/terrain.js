import * as THREE from 'three';
import { TOWERS, CASTLE, WORLD } from './data.js';

// ---------- 噪声 ----------
const SEED = 1337;
function hash(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + SEED;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}
export function fbm(x, z, oct = 5) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, z * f) * a; n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
function ridged(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += (1 - Math.abs(vnoise(x * f, z * f))) ** 2 * a; n += a; a *= 0.5; f *= 2.1; }
  return s / n;
}
export const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// 一个可复现的随机数
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- 地区权重 ----------
export const LAKE = { x: 40, z: 385, r: 150 };
export function regionWeights(x, z) {
  const desert = smoothstep(190, 290, x) * (1 - smoothstep(330, 420, -z));
  const forest = smoothstep(170, 270, -x) * (1 - smoothstep(170, 260, Math.abs(z)));
  const snow = smoothstep(140, 250, -z) * smoothstep(40, 170, -x);
  const dc = Math.hypot(x - CASTLE.x, z - CASTLE.z);
  const dark = 1 - smoothstep(120, 230, dc);
  return { desert, forest, snow, dark };
}

const PADS = [];
function baseHeight(x, z) {
  const w = regionWeights(x, z);
  let h = fbm(x * 0.0042 + 10, z * 0.0042 - 7) * 24 + fbm(x * 0.021, z * 0.021, 3) * 3;
  const dc = Math.hypot(x, z);
  h *= lerp(0.2, 1, smoothstep(50, 220, dc));
  h += 5;
  // 沙丘
  const dune = 7 + Math.sin(x * 0.045 + Math.sin(z * 0.02) * 3) * 2.5 + fbm(x * 0.01, z * 0.01) * 6;
  h = lerp(h, dune, w.desert);
  // 森林起伏
  h += w.forest * fbm(x * 0.012, z * 0.012, 3) * 6;
  // 雪山
  h += w.snow * (ridged(x * 0.006, z * 0.006) * 95 + 8);
  // 暗黑领域：嶙峋
  h += w.dark * (ridged(x * 0.012 + 3, z * 0.012) * 30 - 4);
  // 湖
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  h = lerp(h, -11, 1 - smoothstep(70, LAKE.r, dl));
  // 世界边缘的山脉
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const e = smoothstep(470, 590, edge);
  h += e * e * (130 + ridged(x * 0.01, z * 0.01) * 60);
  return h;
}

export function initPads() {
  PADS.length = 0;
  PADS.push({ x: 0, z: 20, r: 28, h: 5 }); // 光之神殿
  for (const t of TOWERS) {
    const h = t.id === 'lake' ? 3 : Math.max(3, baseHeight(t.x, t.z));
    PADS.push({ x: t.x, z: t.z, r: 34, h });
    t.h = h;
  }
  PADS.push({ x: CASTLE.x, z: CASTLE.z, r: CASTLE.r + 6, h: 20 });
  CASTLE.h = 20;
}

export function heightAt(x, z) {
  let h = baseHeight(x, z);
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    const t = 1 - smoothstep(p.r, p.r + 28, d);
    if (t > 0) h = lerp(h, p.h, t);
  }
  return h;
}

// ---------- 地形网格 + 精确的地面采样 ----------
const SIZE = WORLD.half * 2;
let SEG = 240;
let grid = null;

export function groundHeight(x, z) {
  if (!grid) return heightAt(x, z);
  const n = SEG + 1;
  const gx = (x + WORLD.half) / SIZE * SEG;
  const gz = (z + WORLD.half) / SIZE * SEG;
  if (gx < 0 || gz < 0 || gx >= SEG || gz >= SEG) return heightAt(x, z);
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz;
  const ha = grid[iz * n + ix], hb = grid[(iz + 1) * n + ix], hc = grid[(iz + 1) * n + ix + 1], hd = grid[iz * n + ix + 1];
  if (fx + fz <= 1) return ha + (hd - ha) * fx + (hb - ha) * fz;
  return hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
}

export function terrainColor(x, z, h, out) {
  const w = regionWeights(x, z);
  const n = fbm(x * 0.05, z * 0.05, 2);
  const grass = new THREE.Color().setHSL(0.27 + n * 0.03, 0.5, 0.42 + n * 0.06);
  const forest = new THREE.Color().setHSL(0.31, 0.5, 0.28 + n * 0.05);
  const sand = new THREE.Color().setHSL(0.11, 0.55, 0.66 + n * 0.05);
  const rock = new THREE.Color().setHSL(0.08, 0.08, 0.45 + n * 0.08);
  const snow = new THREE.Color(0xf2f5fa);
  const dark = new THREE.Color().setHSL(0.0, 0.25 + Math.max(0, n) * 0.4, 0.13 + n * 0.04);
  out.copy(grass);
  out.lerp(forest, w.forest);
  out.lerp(sand, w.desert);
  if (h > 38) out.lerp(rock, smoothstep(38, 55, h));
  if (w.snow > 0.2 || h > 75) out.lerp(snow, Math.max(smoothstep(30, 48, h) * smoothstep(0.2, 0.6, w.snow), smoothstep(75, 95, h)));
  if (h < 1.8) out.lerp(sand, smoothstep(1.8, 0.4, h));
  if (h < -1) out.lerp(new THREE.Color(0x8a8a6a), 0.6);
  out.lerp(dark, w.dark);
  return out;
}

export function buildTerrain(scene, mobile) {
  SEG = mobile ? 180 : 240;
  initPads();
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const n = SEG + 1;
  grid = new Float32Array(n * n);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    grid[i] = h;
    terrainColor(x, z, h, c);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // 水面
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE * 1.6, SIZE * 1.6, 1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: 0x2f86c8, transparent: true, opacity: 0.78, shininess: 90, specular: 0x88ccff })
  );
  water.position.y = WORLD.water;
  scene.add(water);
  return { mesh, water };
}

// ---------- 植被、岩石、房屋 ----------
export function buildDecor(scene, mobile) {
  const R = rng(4242);
  const N = mobile ? 1600 : 3200;
  const lists = { tree: [], pine: [], cactus: [], rock: [], deadTree: [] };
  const avoid = [{ x: 0, z: 20, r: 40 }, ...TOWERS.map(t => ({ x: t.x, z: t.z, r: 42 })), { x: CASTLE.x, z: CASTLE.z, r: CASTLE.r + 20 }];
  for (let i = 0; i < N * 3 && (lists.tree.length + lists.pine.length + lists.cactus.length + lists.rock.length) < N; i++) {
    const x = (R() * 2 - 1) * 560, z = (R() * 2 - 1) * 560;
    const h = heightAt(x, z);
    if (h < 1.5) continue;
    if (avoid.some(a => Math.hypot(x - a.x, z - a.z) < a.r)) continue;
    const w = regionWeights(x, z);
    const dens = fbm(x * 0.01 + 50, z * 0.01, 3);
    const r = R();
    if (w.dark > 0.5) { if (r < 0.25) lists.rock.push([x, h, z]); else if (r < 0.4) lists.deadTree.push([x, h, z]); continue; }
    if (w.desert > 0.6) { if (r < 0.12) lists.cactus.push([x, h, z]); else if (r < 0.2) lists.rock.push([x, h, z]); continue; }
    if (h > 34 || w.snow > 0.5) { if (r < 0.35 && h < 80) lists.pine.push([x, h, z]); else if (r < 0.5) lists.rock.push([x, h, z]); continue; }
    const forestBias = w.forest * 0.6 + Math.max(0, dens) * 0.9;
    if (r < 0.12 + forestBias) { (R() < 0.3 + w.forest * 0.3 ? lists.pine : lists.tree).push([x, h, z]); }
    else if (r < 0.2 + forestBias) lists.rock.push([x, h, z]);
  }

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  function instanced(geo, mat, items, fn) {
    if (!items.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((p, i) => { col.set(0xffffff); fn(dummy, p, i, col); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, col); });
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = !mobile;
    scene.add(im);
    return im;
  }
  const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...extra });

  // 圆树
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 5).translate(0, 0.5, 0);
  const leafGeo = new THREE.IcosahedronGeometry(1, 0).translate(0, 1.6, 0);
  const allTrunks = [...lists.tree, ...lists.pine];
  instanced(trunkGeo, lam(0x6b4a2b), allTrunks, (d, p, i) => {
    const s = 0.9 + hash(i, 7) * 0.8;
    d.position.set(p[0], p[1] - 0.1, p[2]); d.scale.set(s, s * 1.2, s); d.rotation.set(0, 0, 0);
  });
  instanced(leafGeo, lam(0xffffff), lists.tree, (d, p, i, c) => {
    const s = 0.9 + hash(i, 7) * 0.8;
    d.position.set(p[0], p[1] - 0.1, p[2]); d.scale.set(s * 0.9, s * 0.95, s * 0.9); d.rotation.set(0, hash(i, 3) * 6, 0);
    c.setHSL(0.26 + hash(i, 9) * 0.08, 0.55, 0.35 + hash(i, 11) * 0.12);
  });
  const pineGeo = new THREE.ConeGeometry(0.9, 2.6, 6).translate(0, 2.1, 0);
  instanced(pineGeo, lam(0xffffff), lists.pine, (d, p, i, c) => {
    const s = 0.9 + hash(i + lists.tree.length, 7) * 0.8;
    d.position.set(p[0], p[1] - 0.1, p[2]); d.scale.set(s, s * 1.2, s); d.rotation.set(0, 0, 0);
    const snowy = p[1] > 40 || regionWeights(p[0], p[2]).snow > 0.5;
    if (snowy) c.setHSL(0.45, 0.15, 0.75); else c.setHSL(0.33, 0.45, 0.25 + hash(i, 5) * 0.08);
  });
  // 仙人掌
  const cactusGeo = new THREE.CapsuleGeometry(0.28, 1.6, 2, 6).translate(0, 1, 0);
  instanced(cactusGeo, lam(0x4f8a3a), lists.cactus, (d, p, i) => {
    const s = 0.8 + hash(i, 13) * 0.6;
    d.position.set(p[0], p[1] - 0.2, p[2]); d.scale.set(s, s, s); d.rotation.set(0, 0, 0);
  });
  // 枯树
  const deadGeo = new THREE.ConeGeometry(0.25, 3.2, 4).translate(0, 1.5, 0);
  instanced(deadGeo, lam(0x2a1c1c), lists.deadTree, (d, p, i) => {
    d.position.set(p[0], p[1] - 0.1, p[2]); d.scale.set(1, 0.8 + hash(i, 2), 1); d.rotation.set((hash(i, 4) - 0.5) * 0.4, 0, (hash(i, 6) - 0.5) * 0.4);
  });
  // 岩石
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  instanced(rockGeo, lam(0xffffff), lists.rock, (d, p, i, c) => {
    const s = 0.5 + hash(i, 21) * 1.6;
    d.position.set(p[0], p[1] + s * 0.2, p[2]); d.scale.set(s, s * (0.6 + hash(i, 1) * 0.5), s); d.rotation.set(hash(i, 2) * 3, hash(i, 3) * 3, 0);
    const w = regionWeights(p[0], p[2]);
    if (w.dark > 0.5) c.setHSL(0.0, 0.2, 0.12); else if (w.desert > 0.5) c.setHSL(0.08, 0.35, 0.55); else c.setHSL(0.08, 0.05, 0.45 + hash(i, 8) * 0.15);
  });

  // 小镇（奥特曼眼中的人类小房子）
  const houses = [];
  const towns = [[60, -60], [-70, 110], [150, 160], [-150, -90], [230, -120]];
  for (const [tx, tz] of towns) {
    for (let k = 0; k < 9; k++) {
      const x = tx + (R() - 0.5) * 34, z = tz + (R() - 0.5) * 34;
      const h = heightAt(x, z);
      if (h < 1.5) continue;
      houses.push([x, h, z, R() * Math.PI, 0.7 + R() * 0.5]);
    }
  }
  const wallGeo = new THREE.BoxGeometry(1.2, 0.9, 1.0).translate(0, 0.45, 0);
  const roofGeo = new THREE.ConeGeometry(0.95, 0.7, 4).rotateY(Math.PI / 4).translate(0, 1.25, 0);
  instanced(wallGeo, lam(0xf1ebde), houses, (d, p) => { d.position.set(p[0], p[1] - 0.05, p[2]); d.rotation.set(0, p[3], 0); d.scale.setScalar(p[4]); });
  instanced(roofGeo, lam(0xffffff), houses, (d, p, i, c) => {
    d.position.set(p[0], p[1] - 0.05, p[2]); d.rotation.set(0, p[3], 0); d.scale.set(p[4] * 1.15, p[4], p[4] * 1.0);
    c.setHSL([0.0, 0.58, 0.08, 0.33][i % 4], 0.55, 0.45);
  });

  // 云
  const cloudGeo = new THREE.IcosahedronGeometry(1, 0);
  const puffs = [];
  for (let i = 0; i < (mobile ? 30 : 55); i++) {
    const cx = (R() * 2 - 1) * 650, cz = (R() * 2 - 1) * 650, cy = 170 + R() * 60;
    for (let k = 0; k < 5; k++) puffs.push([cx + (R() - 0.5) * 22, cy + (R() - 0.5) * 4, cz + (R() - 0.5) * 12, 4 + R() * 5]);
  }
  const clouds = instanced(cloudGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x666677 }), puffs, (d, p) => {
    d.position.set(p[0], p[1], p[2]); d.scale.set(p[3] * 1.4, p[3] * 0.6, p[3]); d.rotation.set(0, 0, 0);
  });
  if (clouds) clouds.castShadow = false;

  // 暗黑领域的岩浆池
  const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff4a10 });
  const lavas = [];
  for (let i = 0; i < 14; i++) {
    const a = R() * Math.PI * 2, d = CASTLE.r + 40 + R() * 90;
    const x = CASTLE.x + Math.cos(a) * d, z = CASTLE.z + Math.sin(a) * d * 0.8 + 40;
    const h = heightAt(x, z);
    const r = 4 + R() * 6;
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 10).rotateX(-Math.PI / 2), lavaMat);
    m.position.set(x, h + 0.35, z);
    scene.add(m);
    lavas.push({ x, z, r, y: h });
  }
  return { lavas, houses };
}

// ---------- 天空 ----------
export function buildSky(scene) {
  const uniforms = {
    top: { value: new THREE.Color(0x3a8ee6) },
    bottom: { value: new THREE.Color(0xcfe8ff) },
    sunDir: { value: new THREE.Vector3(0.4, 0.6, -0.3).normalize() },
    darkness: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform float darkness; varying vec3 vDir;
      void main(){
        float t = clamp(vDir.y*1.4+0.15,0.0,1.0);
        vec3 c = mix(bottom, top, t);
        float s = max(dot(normalize(vDir), sunDir),0.0);
        c += vec3(1.0,0.9,0.7)*pow(s,350.0)*1.5*(1.0-darkness) + vec3(1.0,0.8,0.5)*pow(s,8.0)*0.25*(1.0-darkness);
        vec3 evil = mix(vec3(0.25,0.02,0.04), vec3(0.06,0.0,0.05), t);
        c = mix(c, evil, darkness);
        gl_FragColor = vec4(c,1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), mat);
  sky.renderOrder = -1;
  scene.add(sky);
  return { sky, uniforms };
}

// 预渲染小地图
export function renderMinimapBase(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const c = new THREE.Color();
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i / size) * SIZE - WORLD.half, z = (j / size) * SIZE - WORLD.half;
    const h = groundHeight(x, z);
    if (h < WORLD.water) c.setRGB(0.2, 0.5, 0.8); else terrainColor(x, z, h, c);
    const shade = 0.75 + Math.min(0.35, h / 160);
    const k = (j * size + i) * 4;
    img.data[k] = Math.min(255, c.r * 255 * shade); img.data[k + 1] = Math.min(255, c.g * 255 * shade); img.data[k + 2] = Math.min(255, c.b * 255 * shade); img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
