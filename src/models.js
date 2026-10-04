import * as THREE from 'three';

const matCache = new Map();
export function phong(color, extra = {}) {
  const key = 'p' + color + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshPhongMaterial({ color, shininess: 50, specular: 0x555555, ...extra }));
  return matCache.get(key);
}
export function glow(color, opacity = 1) {
  const key = 'g' + color + '_' + opacity;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity }));
  return matCache.get(key);
}
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }
const cap = (r, l, seg = 8) => new THREE.CapsuleGeometry(r, l, 3, seg);

// ---------- 通用人形（奥特曼 / 贝利亚 / 宇宙人） ----------
// 结构: root(脚底) → pivot(髋部高度) → hips/torso/head/arms, legs
export function buildHumanoid({ body, main, accent, chest, eye, eyeShape = 'ultra', crest = 'fin', timer = true, timerColor = 0x45c8ff, claws = false, spikes = false }) {
  const root = new THREE.Group();
  const pivot = new THREE.Group(); pivot.position.y = 1.55; root.add(pivot);
  const parts = { root, pivot };

  const torso = new THREE.Group(); torso.position.y = 0.12; pivot.add(torso); parts.torso = torso;
  const pelvis = mesh(cap(0.3, 0.2), phong(accent), 0, 0.02, 0); pelvis.scale.set(1.1, 1, 0.8); torso.add(pelvis);
  const belly = mesh(cap(0.33, 0.25), phong(accent), 0, 0.3, 0); belly.scale.set(1.05, 1, 0.78); torso.add(belly);
  const chestM = mesh(cap(0.42, 0.35), phong(main), 0, 0.62, 0); chestM.scale.set(1.15, 1, 0.78); torso.add(chestM);
  // 中线银色装饰
  const stripe = mesh(new THREE.BoxGeometry(0.16, 0.7, 0.1), phong(body), 0, 0.42, 0.27); torso.add(stripe);
  const prot = mesh(new THREE.CylinderGeometry(0.56, 0.44, 0.26, 14, 1, false), phong(chest, { shininess: 90 }), 0, 0.86, 0); prot.scale.z = 0.72; torso.add(prot);
  if (timer) {
    const t = mesh(new THREE.SphereGeometry(0.095, 12, 8), new THREE.MeshBasicMaterial({ color: timerColor }), 0, 0.68, 0.33);
    torso.add(t); parts.timer = t;
  }
  if (spikes) {
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const sp = mesh(new THREE.ConeGeometry(0.08, 0.45, 5), phong(0x111114), s * (0.42 + k * 0.08), 1.0 - k * 0.04, -0.05 + k * 0.03);
        sp.rotation.z = -s * (0.5 + k * 0.25); torso.add(sp);
      }
    }
  }

  // 头
  const head = new THREE.Group(); head.position.y = 1.18; torso.add(head); parts.head = head;
  const skull = mesh(new THREE.SphereGeometry(0.3, 16, 12), phong(body, { shininess: 80 })); skull.scale.set(0.88, 1.12, 0.98); head.add(skull);
  const neck = mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.25, 8), phong(body), 0, -0.3, 0); head.add(neck);
  const eyeMat = new THREE.MeshBasicMaterial({ color: eye });
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.1, 12, 8), eyeMat, s * 0.12, 0.05, 0.22);
    if (eyeShape === 'ultra') { e.scale.set(1.25, 0.75, 0.55); e.rotation.z = s * 0.3; }
    else if (eyeShape === 'sharp') { e.scale.set(1.6, 0.55, 0.55); e.rotation.z = s * 0.55; e.position.y = 0.07; }
    else if (eyeShape === 'robot') { e.scale.set(2.5, 0.35, 0.5); e.position.x = s * 0.06; }
    else if (eyeShape === 'bug') { e.scale.set(1.1, 1.3, 1.1); e.position.set(s * 0.25, 0.08, 0.1); }
    head.add(e);
  }
  parts.eyeMat = eyeMat;
  // 头冠
  if (crest === 'fin' || crest === 'tiga') {
    const fin = mesh(new THREE.BoxGeometry(0.06, 0.2, 0.5), phong(body), 0, 0.27, -0.02); head.add(fin);
    if (crest === 'tiga') {
      const sideL = mesh(new THREE.BoxGeometry(0.05, 0.12, 0.38), phong(chest), -0.12, 0.22, -0.02); sideL.rotation.z = 0.3; head.add(sideL);
      const sideR = sideL.clone(); sideR.position.x = 0.12; sideR.rotation.z = -0.3; head.add(sideR);
      head.add(mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0x5ff0ff }), 0, 0.18, 0.27));
    }
  } else if (crest === 'slugger') {
    const sl = mesh(new THREE.BoxGeometry(0.08, 0.2, 0.62), phong(0xd8dde6, { shininess: 100 }), 0, 0.29, -0.03); head.add(sl); parts.slugger = [sl];
    head.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0x4dff7a }), 0, 0.17, 0.27));
  } else if (crest === 'zero') {
    parts.slugger = [];
    for (const s of [-1, 1]) {
      const sl = mesh(new THREE.BoxGeometry(0.07, 0.22, 0.6), phong(0xd8dde6, { shininess: 100 }), s * 0.1, 0.28, -0.03); sl.rotation.z = -s * 0.28; head.add(sl); parts.slugger.push(sl);
    }
    head.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0x4dff7a }), 0, 0.17, 0.27));
  } else if (crest === 'geed') {
    for (const s of [-1, 1]) {
      const h = mesh(new THREE.BoxGeometry(0.05, 0.28, 0.14), phong(0x9aa0ad), s * 0.2, 0.08, 0.17); h.rotation.z = -s * 0.5; h.rotation.x = 0.3; head.add(h);
    }
    head.add(mesh(new THREE.BoxGeometry(0.06, 0.16, 0.46), phong(0x9aa0ad), 0, 0.27, 0));
  } else if (crest === 'belial') {
    for (const s of [-1, 1]) {
      const h = mesh(new THREE.ConeGeometry(0.06, 0.42, 5), phong(0x0d0d10), s * 0.17, 0.28, -0.02); h.rotation.z = -s * 0.6; h.rotation.x = -0.4; head.add(h);
    }
    // 伤疤
    const scar = mesh(new THREE.BoxGeometry(0.035, 0.32, 0.03), new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0.12, 0.06, 0.27); scar.rotation.z = 0.35; head.add(scar);
  } else if (crest === 'baltan') {
    const top = mesh(new THREE.ConeGeometry(0.22, 0.5, 6), phong(main), 0, 0.42, 0); head.add(top);
  } else if (crest === 'robot') {
    const fin = mesh(new THREE.BoxGeometry(0.08, 0.22, 0.42), phong(main), 0, 0.27, 0); head.add(fin);
  }

  // 手臂
  function arm(side) {
    const a = new THREE.Group(); a.position.set(side * 0.56, 0.84, 0); torso.add(a);
    const sh = mesh(new THREE.SphereGeometry(0.18, 10, 8), phong(main), 0, 0, 0); a.add(sh);
    const up = mesh(cap(0.13, 0.36), phong(main), 0, -0.3, 0); a.add(up);
    const fore = new THREE.Group(); fore.position.y = -0.58; a.add(fore);
    const fm = mesh(cap(0.12, 0.34), phong(body), 0, -0.24, 0); fore.add(fm);
    const band = mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.08, 10), phong(accent === body ? main : accent), 0, -0.12, 0); fore.add(band);
    const hand = mesh(new THREE.SphereGeometry(0.14, 10, 8), phong(body), 0, -0.52, 0); hand.scale.set(0.9, 1.1, 0.9); fore.add(hand);
    if (claws) {
      for (let k = -1; k <= 1; k++) {
        const c = mesh(new THREE.ConeGeometry(0.035, 0.32, 4), phong(0xb01010), k * 0.06, -0.72, 0.04); c.rotation.x = Math.PI; fore.add(c);
      }
    }
    return { a, fore };
  }
  const L = arm(1), Rr = arm(-1); // 模型朝 +z，+x 是左手
  parts.armL = L.a; parts.foreL = L.fore; parts.armR = Rr.a; parts.foreR = Rr.fore;

  // 腿
  function leg(side) {
    const l = new THREE.Group(); l.position.set(side * 0.22, -0.02, 0); pivot.add(l);
    const th = mesh(cap(0.18, 0.42), phong(accent), 0, -0.34, 0); l.add(th);
    const shin = new THREE.Group(); shin.position.y = -0.76; l.add(shin);
    const sm = mesh(cap(0.16, 0.4), phong(main), 0, -0.3, 0); shin.add(sm);
    const boot = mesh(new THREE.BoxGeometry(0.26, 0.16, 0.42), phong(body), 0, -0.71, 0.07); shin.add(boot);
    return { l, shin };
  }
  const LL = leg(1), LR = leg(-1);
  parts.legL = LL.l; parts.shinL = LL.shin; parts.legR = LR.l; parts.shinR = LR.shin;

  root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return { root, parts };
}

export function buildHero(def) {
  const c = def.colors;
  return buildHumanoid({ body: c.body, main: c.main, accent: c.accent, chest: c.chest, eye: c.eye, crest: def.crest, eyeShape: def.id === 'geed' ? 'sharp' : 'ultra' });
}

export function buildBelial() {
  const h = buildHumanoid({ body: 0x18181d, main: 0x141418, accent: 0x7a0c12, chest: 0x22222a, eye: 0xff2a1a, crest: 'belial', eyeShape: 'sharp', timerColor: 0xb0102a, claws: true, spikes: true });
  // 红色纹路
  const red = new THREE.MeshBasicMaterial({ color: 0xc8141e });
  const torso = h.parts.torso;
  for (const s of [-1, 1]) {
    const line = mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), red, s * 0.24, 0.5, 0.3); line.rotation.z = s * 0.35; torso.add(line);
  }
  // 吉加战斗仪
  const staff = new THREE.Group();
  staff.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), phong(0x2a2a30), 0, 0, 0));
  const tip = mesh(new THREE.ConeGeometry(0.16, 0.6, 3), phong(0xc8a040, { shininess: 100 }), 0, 1.5, 0); staff.add(tip);
  for (const s of [-1, 1]) { const b = mesh(new THREE.ConeGeometry(0.08, 0.45, 3), phong(0xc8a040), s * 0.16, 1.2, 0); b.rotation.z = -s * 0.7; staff.add(b); }
  staff.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3030 }), 0, 1.05, 0));
  staff.position.set(0, -0.55, 0.05); staff.rotation.x = Math.PI / 2;
  h.parts.foreR.add(staff); h.parts.staff = staff;
  return h;
}

export function buildDarklops() {
  const h = buildHumanoid({ body: 0x3a3d48, main: 0x23252d, accent: 0x2d3038, chest: 0x50545f, eye: 0xff2020, crest: 'robot', eyeShape: 'robot', timer: false });
  return h;
}
export function buildBaltan() {
  const h = buildHumanoid({ body: 0x4a4a6a, main: 0x3a3a58, accent: 0x2e2e48, chest: 0x5a5a7a, eye: 0xffe050, crest: 'baltan', eyeShape: 'bug', timer: false });
  // 巨钳
  for (const f of [h.parts.foreL, h.parts.foreR]) {
    const g = new THREE.Group(); g.position.y = -0.62;
    const a = mesh(new THREE.ConeGeometry(0.16, 0.6, 5), phong(0x6a6a8a), 0.08, -0.25, 0); a.rotation.z = 0.35; g.add(a);
    const b = mesh(new THREE.ConeGeometry(0.16, 0.6, 5), phong(0x6a6a8a), -0.08, -0.25, 0); b.rotation.z = -0.35; g.add(b);
    g.rotation.x = Math.PI; g.position.y = -0.4;
    f.add(g);
  }
  return h;
}

// ---------- 姿势动画 ----------
const tmp = {};
function setR(o, x, y, z, k) {
  o.rotation.x += (x - o.rotation.x) * k;
  o.rotation.y += (y - o.rotation.y) * k;
  o.rotation.z += (z - o.rotation.z) * k;
}
// a: { state, t (state time), phase (walk), speed01, combo, kind }
export function animateHumanoid(h, a, dt) {
  const p = h.parts;
  const k = 1 - Math.exp(-dt * 16);
  const t = a.time || 0;
  let piv = [0, 0, 0], pivY = 1.55, torso = [0, 0, 0], head = [0, 0, 0];
  let aL = [0, 0, 0.15], aR = [0, 0, -0.15], fL = [0, 0, 0], fR = [0, 0, 0], lL = [0, 0, 0], lR = [0, 0, 0], sL = [0, 0, 0], sR = [0, 0, 0];
  const st = a.state;
  if (st === 'idle') {
    const b = Math.sin(t * 2.2) * 0.03;
    pivY = 1.5 + b;
    aL = [-0.5, 0, 0.35]; aR = [-0.5, 0, -0.35]; fL = [-1.3, 0, 0]; fR = [-1.3, 0, 0];
    lL = [-0.12, 0, 0.08]; lR = [0.1, 0, -0.08]; sL = [0.2, 0, 0]; sR = [0.15, 0, 0];
    torso = [0.05, 0.15, 0];
  } else if (st === 'run' || st === 'walk') {
    const ph = a.phase, s = Math.min(1, a.speed01 ?? 1);
    const sw = Math.sin(ph) * 0.95 * s;
    lL = [sw, 0, 0]; lR = [-sw, 0, 0];
    sL = [Math.max(0, -Math.cos(ph)) * 1.3 * s + 0.1, 0, 0]; sR = [Math.max(0, Math.cos(ph)) * 1.3 * s + 0.1, 0, 0];
    aL = [-sw * 0.9, 0, 0.2]; aR = [sw * 0.9, 0, -0.2]; fL = [-0.9, 0, 0]; fR = [-0.9, 0, 0];
    torso = [0.25 * s, Math.sin(ph) * 0.12, 0];
    pivY = 1.52 + Math.abs(Math.cos(ph)) * 0.12 * s;
  } else if (st === 'air') {
    lL = [-0.6, 0, 0.1]; sL = [1.2, 0, 0]; lR = [0.1, 0, -0.1]; sR = [0.4, 0, 0];
    aL = [-0.4, 0, 0.9]; aR = [-0.4, 0, -0.9]; fL = [-0.5, 0, 0]; fR = [-0.5, 0, 0];
  } else if (st === 'fly') {
    piv = [1.35, 0, 0]; pivY = 1.6;
    aR = [-Math.PI, 0, 0]; fR = [0, 0, 0]; aL = [0.2, 0, 0.25]; fL = [-0.8, 0, 0];
    lL = [0.05, 0, 0.05]; lR = [0.15, 0, -0.05]; sL = [0.1, 0, 0]; sR = [0.5, 0, 0];
    head = [-0.9, 0, 0];
  } else if (st === 'attack') {
    const c = a.combo % 3; const u = a.t01;
    const ext = u < 0.45 ? u / 0.45 : 1 - (u - 0.45) / 0.55 * 0.6;
    lL = [-0.3, 0, 0.1]; lR = [0.3, 0, -0.1]; sL = [0.3, 0, 0]; sR = [0.3, 0, 0];
    if (c === 0) { aR = [-1.55 * ext - 0.3, 0, -0.1]; fR = [-0.2, 0, 0]; aL = [-0.6, 0, 0.3]; fL = [-1.5, 0, 0]; torso = [0.1, -0.5 * ext, 0]; }
    else if (c === 1) { aL = [-1.55 * ext - 0.3, 0, 0.1]; fL = [-0.2, 0, 0]; aR = [-0.6, 0, -0.3]; fR = [-1.5, 0, 0]; torso = [0.1, 0.5 * ext, 0]; }
    else { lR = [-1.6 * ext, 0, 0]; sR = [0.2 * (1 - ext), 0, 0]; lL = [0.3, 0, 0]; sL = [0.4, 0, 0]; torso = [-0.35 * ext, 0, 0]; aL = [-0.3, 0, 0.8]; aR = [-0.3, 0, -0.8]; fL = [-1, 0, 0]; fR = [-1, 0, 0]; }
  } else if (st === 'special' || st === 'beam') {
    const u = a.t01;
    if (a.kind === 'slugger') {
      if (u < 0.35) { aR = [-2.6, 0, -0.2]; fR = [-1.6, 0, 0]; } else { aR = [-1.4, 0, -0.1]; fR = [0, 0, 0]; }
      aL = [-0.4, 0, 0.4]; fL = [-1.2, 0, 0];
    } else if (u < 0.3) {
      aL = [-0.3, 0, 1.4]; aR = [-0.3, 0, -1.4]; fL = [0, 0, 0]; fR = [0, 0, 0];
    } else {
      // 十字架式
      aR = [-1.5, 0, 0.35]; fR = [-1.55, 0, 0]; aL = [-1.45, 0, -0.45]; fL = [-0.05, 0, -1.2];
    }
    lL = [-0.3, 0, 0.12]; lR = [0.35, 0, -0.12]; sL = [0.3, 0, 0]; sR = [0.4, 0, 0]; pivY = 1.45;
  } else if (st === 'claw') {
    const u = a.t01;
    if (u < 0.5) { aR = [-2.4, 0, -0.6]; fR = [-0.8, 0, 0]; torso = [-0.1, 0.5, 0]; }
    else { aR = [-0.8, 0, 0.4]; fR = [-0.2, 0, 0]; torso = [0.35, -0.6, 0]; }
    aL = [-0.4, 0, 0.6]; fL = [-1, 0, 0]; lL = [-0.4, 0, 0]; lR = [0.4, 0, 0]; sL = [0.3, 0, 0]; sR = [0.5, 0, 0];
  } else if (st === 'windup') {
    aL = [-2.6, 0, 0.4]; aR = [-2.6, 0, -0.4]; fL = [-0.6, 0, 0]; fR = [-0.6, 0, 0]; torso = [-0.25, 0, 0];
  } else if (st === 'raise') {
    aR = [-Math.PI, 0, -0.1]; fR = [0, 0, 0]; aL = [-0.4, 0, 0.6]; fL = [-1, 0, 0]; head = [-0.4, 0, 0]; torso = [-0.2, 0, 0];
  } else if (st === 'dodge') {
    piv = [a.t01 * Math.PI * 2, 0, 0]; pivY = 1.0;
    lL = [-1.6, 0, 0]; lR = [-1.6, 0, 0]; sL = [2, 0, 0]; sR = [2, 0, 0]; aL = [-1, 0, 0.3]; aR = [-1, 0, -0.3]; fL = [-1.5, 0, 0]; fR = [-1.5, 0, 0];
  } else if (st === 'hurt') {
    torso = [-0.45, 0, 0]; head = [-0.3, 0, 0]; aL = [0.3, 0, 0.6]; aR = [0.3, 0, -0.6];
  } else if (st === 'dead') {
    piv = [-Math.PI / 2, 0, 0]; pivY = 0.35; aL = [-0.2, 0, 1.2]; aR = [-0.2, 0, -1.2];
  } else if (st === 'victory') {
    aR = [-Math.PI + 0.2, 0, -0.2]; fR = [0, 0, 0]; aL = [0, 0, 0.3]; fL = [-1.2, 0, 0]; head = [-0.2, 0, 0];
  }
  if (st !== 'dodge' && p.pivot.rotation.x > Math.PI * 1.2) p.pivot.rotation.x -= Math.PI * 2;
  setR(p.pivot, piv[0], piv[1], piv[2], st === 'dodge' ? 1 : k);
  p.pivot.position.y += (pivY - p.pivot.position.y) * k;
  setR(p.torso, ...torso, k); setR(p.head, ...head, k);
  setR(p.armL, ...aL, k); setR(p.armR, ...aR, k); setR(p.foreL, ...fL, k); setR(p.foreR, ...fR, k);
  setR(p.legL, ...lL, k); setR(p.legR, ...lR, k); setR(p.shinL, ...sL, k); setR(p.shinR, ...sR, k);
}

// ---------- 怪兽 ----------
export function buildKaiju(cfg) {
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 2.5; root.add(body);
  const parts = { root, body };
  const skin = phong(cfg.color, { shininess: 20 }), belly = phong(cfg.belly, { shininess: 15 }), horn = phong(cfg.horn, { shininess: 60 });
  const torso = mesh(cap(1.05, 1.5, 10), skin, 0, 1.0, 0); torso.rotation.x = 0.2; torso.scale.set(1, 1, 0.9); body.add(torso);
  const bel = mesh(cap(0.85, 1.2, 10), belly, 0, 0.9, 0.32); bel.rotation.x = 0.2; bel.scale.set(0.9, 1, 0.75); body.add(bel);
  // 头
  const headG = new THREE.Group(); headG.position.set(0, 2.55, 0.75); body.add(headG); parts.head = headG;
  if (cfg.horns === 'small') { // 雷德王：小头长脖子
    const neck = mesh(cap(0.42, 0.9), skin, 0, -0.35, -0.2); neck.rotation.x = 0.5; headG.add(neck);
    headG.position.set(0, 3.0, 0.9);
    const hd = mesh(new THREE.SphereGeometry(0.42, 10, 8), skin, 0, 0.25, 0.25); hd.scale.set(0.9, 0.9, 1.2); headG.add(hd);
    for (const s of [-1, 1]) headG.add(mesh(new THREE.SphereGeometry(0.08, 6, 6), glow(cfg.eye), s * 0.24, 0.37, 0.5));
  } else {
    const hd = mesh(new THREE.BoxGeometry(1.0, 0.8, 1.1), skin, 0, 0, 0.2); headG.add(hd);
    const snout = mesh(new THREE.BoxGeometry(0.8, 0.45, 0.6), skin, 0, -0.12, 0.85); headG.add(snout);
    const jaw = mesh(new THREE.BoxGeometry(0.75, 0.2, 0.9), belly, 0, -0.42, 0.55); headG.add(jaw); parts.jaw = jaw;
    for (const s of [-1, 1]) headG.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), glow(cfg.eye), s * 0.38, 0.18, 0.72));
    // 牙
    for (let i = 0; i < 4; i++) { const tth = mesh(new THREE.ConeGeometry(0.05, 0.16, 4), phong(0xffffff), -0.27 + i * 0.18, -0.38, 1.12); tth.rotation.x = Math.PI; headG.add(tth); }
  }
  if (cfg.horns === 'crescent') {
    const c = mesh(new THREE.TorusGeometry(0.45, 0.1, 6, 14, Math.PI * 1.2), horn, 0, 0.55, 0.9); c.rotation.set(0, Math.PI / 2, Math.PI * 0.4); headG.add(c);
    for (const s of [-1, 1]) { const h = mesh(new THREE.ConeGeometry(0.13, 0.8, 6), horn, s * 0.55, 0.45, 0.0); h.rotation.set(-0.6, 0, -s * 0.9); headG.add(h); }
  } else if (cfg.horns === 'antenna') {
    for (const s of [-1, 1]) {
      const h = mesh(new THREE.ConeGeometry(0.08, 1.3, 6), horn, s * 0.3, 0.9, 0.0); h.rotation.set(-0.3, 0, -s * 0.25); headG.add(h); parts['ant' + s] = h;
      for (let k = 0; k < 3; k++) { const r = mesh(new THREE.TorusGeometry(0.12 - k * 0.025, 0.025, 4, 10), phong(0x1a1a1a), s * (0.33 + k * 0.03), 0.6 + k * 0.28, 0); r.rotation.x = Math.PI / 2; headG.add(r); }
    }
  } else if (cfg.horns === 'zetton') {
    for (const s of [-1, 1]) { const h = mesh(new THREE.ConeGeometry(0.12, 1.4, 6), horn, s * 0.42, 0.85, -0.1); h.rotation.set(-0.2, 0, -s * 0.15); headG.add(h); }
    headG.add(mesh(new THREE.SphereGeometry(0.16, 10, 8), glow(cfg.lights), 0, 0.3, 0.75));
  }
  // 斑点 / 发光点
  if (cfg.spots) {
    const sm = phong(cfg.spots);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, y = 0.4 + (i % 4) * 0.45;
      const s = mesh(new THREE.SphereGeometry(0.22, 6, 5), sm, Math.cos(a) * 0.95, y, Math.sin(a) * 0.8);
      s.scale.set(1, 1, 0.3); s.lookAt(0, y, 0); body.add(s);
    }
  }
  if (cfg.lights) {
    const lm = glow(cfg.lights);
    for (const [x, y] of [[-0.35, 1.6], [0.35, 1.6], [-0.25, 1.1], [0.25, 1.1], [0, 0.7], [-0.4, 0.5], [0.4, 0.5]]) body.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), lm, x, y, 0.95));
  }
  // 背刺
  for (let i = 0; i < 6; i++) {
    const sp = mesh(new THREE.ConeGeometry(0.18 - i * 0.015, 0.6, 5), cfg.spots ? phong(0xdddddd) : horn, 0, 2.1 - i * 0.38, -0.85 + i * 0.05); sp.rotation.x = -0.7; body.add(sp);
  }
  // 手臂
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(s * 1.0, 1.75, 0.35); body.add(a);
    a.add(mesh(cap(0.27, 0.75), skin, 0, -0.45, 0));
    for (let k = -1; k <= 1; k++) { const c = mesh(new THREE.ConeGeometry(0.06, 0.28, 4), horn, k * 0.1, -1.05, 0.08); c.rotation.x = Math.PI; a.add(c); }
    a.rotation.x = -0.8;
    parts[s > 0 ? 'armL' : 'armR'] = a;
  }
  // 尾巴
  const tail = new THREE.Group(); tail.position.set(0, 0.1, -0.7); body.add(tail); parts.tail = tail;
  let prev = tail;
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Group(); seg.position.set(0, 0, i === 0 ? 0 : -0.62); prev.add(seg);
    const m = mesh(new THREE.ConeGeometry(0.62 - i * 0.11, 0.9, 7), skin, 0, 0, -0.3); m.rotation.x = -Math.PI / 2; seg.add(m);
    seg.rotation.x = 0.12;
    prev = seg; parts['tail' + i] = seg;
  }
  // 腿
  for (const s of [-1, 1]) {
    const l = new THREE.Group(); l.position.set(s * 0.65, 0.2, 0); body.add(l);
    l.add(mesh(cap(0.5, 0.7), skin, 0, -0.6, 0));
    const shin = new THREE.Group(); shin.position.y = -1.25; l.add(shin);
    shin.add(mesh(cap(0.38, 0.5), skin, 0, -0.35, 0));
    shin.add(mesh(new THREE.BoxGeometry(0.7, 0.3, 1.0), skin, 0, -0.95, 0.15));
    parts[s > 0 ? 'legL' : 'legR'] = l; parts[s > 0 ? 'shinL' : 'shinR'] = shin;
  }
  root.scale.setScalar(cfg.scale || 1);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, parts };
}

export function animateKaiju(h, a, dt) {
  const p = h.parts, k = 1 - Math.exp(-dt * 10);
  const t = a.time;
  let body = [0, 0, 0], head = [0, 0, 0], aL = -0.8, aR = -0.8, lL = 0, lR = 0, sL = 0, sR = 0, bodyY = 2.5;
  if (a.state === 'walk' || a.state === 'charge') {
    const sw = Math.sin(a.phase) * (a.state === 'charge' ? 0.8 : 0.5);
    lL = sw; lR = -sw; sL = Math.max(0, -Math.cos(a.phase)) * 0.6; sR = Math.max(0, Math.cos(a.phase)) * 0.6;
    body = [a.state === 'charge' ? 0.5 : 0.1, Math.sin(a.phase) * 0.08, Math.sin(a.phase) * 0.05];
    bodyY = 2.5 + Math.abs(Math.cos(a.phase)) * 0.15;
    head = [a.state === 'charge' ? 0.2 : 0, 0, 0];
  } else if (a.state === 'windup') { body = [-0.3, 0, 0]; aL = -2.4; aR = -2.4; head = [-0.4, 0, 0]; }
  else if (a.state === 'strike') { body = [0.45, 0, 0]; aL = -1.2; aR = -1.2; head = [0.3, 0, 0]; }
  else if (a.state === 'roar') { body = [-0.35, 0, 0]; head = [-0.7, 0, 0]; aL = -1.6; aR = -1.6; }
  else if (a.state === 'cast') { body = [-0.15, 0, 0]; head = [-0.25, 0, 0]; aL = -1.8; aR = -1.8; }
  else if (a.state === 'jump') { lL = -0.8; lR = -0.8; sL = 1.2; sR = 1.2; body = [0.2, 0, 0]; }
  else if (a.state === 'hurt') { body = [-0.4, 0, 0]; head = [-0.5, 0, 0]; }
  else if (a.state === 'dead') { body = [-1.4, 0, 0.2]; bodyY = 1.2; }
  else { body = [0.05 + Math.sin(t * 1.5) * 0.03, 0, 0]; }
  p.body.rotation.x += (body[0] - p.body.rotation.x) * k;
  p.body.rotation.y += (body[1] - p.body.rotation.y) * k;
  p.body.rotation.z += (body[2] - p.body.rotation.z) * k;
  p.body.position.y += (bodyY - p.body.position.y) * k;
  p.head.rotation.x += (head[0] - p.head.rotation.x) * k;
  if (p.jaw) p.jaw.rotation.x = a.state === 'roar' || a.state === 'cast' ? 0.5 : 0.05;
  p.armL.rotation.x += (aL - p.armL.rotation.x) * k; p.armR.rotation.x += (aR - p.armR.rotation.x) * k;
  p.legL.rotation.x += (lL - p.legL.rotation.x) * k; p.legR.rotation.x += (lR - p.legR.rotation.x) * k;
  p.shinL.rotation.x += (sL - p.shinL.rotation.x) * k; p.shinR.rotation.x += (sR - p.shinR.rotation.x) * k;
  for (let i = 0; i < 5; i++) p['tail' + i].rotation.y = Math.sin(t * 2.5 - i * 0.6) * 0.18;
}

// ---------- 场景建筑 ----------
export function buildTower(color = 0x9fe8ff) {
  const g = new THREE.Group();
  const stone = phong(0x8d8a99, { flatShading: true, shininess: 10 });
  const dark = phong(0x4a4858, { flatShading: true, shininess: 10 });
  g.add(mesh(new THREE.CylinderGeometry(9, 11, 1.4, 8), stone, 0, 0.3, 0));
  g.add(mesh(new THREE.CylinderGeometry(7, 8, 0.8, 8), dark, 0, 1.3, 0));
  const pillar = mesh(new THREE.CylinderGeometry(1.6, 2.6, 22, 6), stone, 0, 12, 0); g.add(pillar);
  for (let i = 0; i < 4; i++) { const r = mesh(new THREE.TorusGeometry(2.3 - i * 0.18, 0.18, 4, 6), dark, 0, 4 + i * 5, 0); r.rotation.x = Math.PI / 2; g.add(r); }
  const cap = mesh(new THREE.CylinderGeometry(3, 1.6, 2, 6), dark, 0, 24, 0); g.add(cap);
  const crystalMat = new THREE.MeshBasicMaterial({ color: 0x556070 });
  const crystal = mesh(new THREE.OctahedronGeometry(2, 0), crystalMat, 0, 28, 0); crystal.scale.y = 1.6; g.add(crystal);
  // 光柱
  const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = mesh(new THREE.CylinderGeometry(1.6, 1.6, 400, 12, 1, true), beamMat, 0, 228, 0); g.add(beam);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const ob = mesh(new THREE.BoxGeometry(1, 3 + (i % 2) * 2, 1), stone, Math.cos(a) * 8, 1.5, Math.sin(a) * 8); ob.rotation.y = -a; g.add(ob);
  }
  g.traverse(o => { if (o.isMesh && o !== beam) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, crystal, crystalMat, beam, beamMat, color };
}

export function buildCastle() {
  const g = new THREE.Group();
  const black = phong(0x1a1520, { flatShading: true, shininess: 30 });
  const purple = phong(0x5a4468, { flatShading: true, shininess: 30 });
  const redGlow = glow(0xff2a2a);
  // 竞技场地面
  const floor = mesh(new THREE.CylinderGeometry(58, 60, 2, 24), purple, 0, -0.6, 0); g.add(floor);
  const ring = mesh(new THREE.TorusGeometry(46, 0.4, 4, 48), redGlow, 0, 0.45, 0); ring.rotation.x = Math.PI / 2; g.add(ring);
  const star = mesh(new THREE.RingGeometry(18, 19, 5), redGlow, 0, 0.46, 0); star.rotation.x = -Math.PI / 2; g.add(star);
  const colliders = [];
  // 尖塔
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 + 0.31;
    if (i === 2) continue; // 正门朝南（+z）
    const x = Math.cos(a) * 62, z = Math.sin(a) * 62;
    const hgt = 20 + (i % 3) * 9;
    const t = mesh(new THREE.CylinderGeometry(2.5, 4.5, hgt, 6), black, x, hgt / 2, z); g.add(t);
    const sp = mesh(new THREE.ConeGeometry(3.4, 10, 6), purple, x, hgt + 5, z); g.add(sp);
    for (let w = 0; w < 3; w++) g.add(mesh(new THREE.BoxGeometry(0.6, 1.4, 0.3), redGlow, x * 0.94, 6 + w * 6, z * 0.94));
    colliders.push({ x, z, r: 4.6 });
  }
  // 后方王座
  const throne = new THREE.Group(); throne.position.set(0, 0, -50);
  throne.add(mesh(new THREE.BoxGeometry(14, 4, 8), black, 0, 2, 0));
  throne.add(mesh(new THREE.BoxGeometry(10, 26, 3), black, 0, 13, -3));
  for (const s of [-1, 1]) { const sp = mesh(new THREE.ConeGeometry(2, 16, 4), purple, s * 6, 22, -3); sp.rotation.z = -s * 0.3; throne.add(sp); }
  throne.add(mesh(new THREE.OctahedronGeometry(2.2), redGlow, 0, 22, -1.2));
  g.add(throne);
  colliders.push({ x: 0, z: -50, r: 8 });
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // 结界
  const barrierMat = new THREE.MeshBasicMaterial({ color: 0xa020ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, wireframe: false });
  const barrier = mesh(new THREE.SphereGeometry(72, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), barrierMat, 0, 0, 0);
  const wire = mesh(new THREE.SphereGeometry(72.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff40ff, wireframe: true, transparent: true, opacity: 0.25 }));
  barrier.add(wire);
  g.add(barrier);
  // 战斗时的红墙
  const wallMat = new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const wall = mesh(new THREE.CylinderGeometry(56, 56, 40, 40, 1, true), wallMat, 0, 20, 0);
  wall.visible = false; g.add(wall);
  return { group: g, barrier, barrierMat, wall, wallMat, colliders };
}

export function buildChest() {
  const g = new THREE.Group();
  const wood = phong(0x7a4a22, { flatShading: true }), gold = phong(0xf0c040, { shininess: 100 });
  g.add(mesh(new THREE.BoxGeometry(1.4, 0.8, 0.9), wood, 0, 0.4, 0));
  g.add(mesh(new THREE.BoxGeometry(1.45, 0.12, 0.95), gold, 0, 0.78, 0));
  const lid = new THREE.Group(); lid.position.set(0, 0.84, -0.45); g.add(lid);
  lid.add(mesh(new THREE.BoxGeometry(1.4, 0.35, 0.9), wood, 0, 0.17, 0.45));
  lid.add(mesh(new THREE.BoxGeometry(0.2, 0.25, 0.1), gold, 0, 0.05, 0.92));
  const shine = mesh(new THREE.OctahedronGeometry(0.25), glow(0xfff3a0), 0, 2.2, 0); g.add(shine);
  return { group: g, lid, shine };
}

export function buildShard() {
  const g = new THREE.Group();
  const m = mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: 0xbff4ff }));
  m.scale.y = 1.6; g.add(m);
  const halo = mesh(new THREE.TorusGeometry(1.5, 0.08, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  g.add(halo);
  return { group: g, gem: m, halo };
}

export function buildTemple() {
  const g = new THREE.Group();
  const white = phong(0xe8e6ee, { flatShading: true, shininess: 30 });
  const blue = phong(0x5aa0e8, { flatShading: true, shininess: 60 });
  g.add(mesh(new THREE.CylinderGeometry(14, 15, 1, 12), white, 0, 0.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(10, 10.5, 0.6, 12), blue, 0, 0.9, 0));
  const colliders = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const x = Math.cos(a) * 12.5, z = Math.sin(a) * 12.5;
    g.add(mesh(new THREE.CylinderGeometry(0.7, 0.8, 8, 8), white, x, 4.5, z));
    g.add(mesh(new THREE.BoxGeometry(1.8, 0.6, 1.8), white, x, 8.7, z));
  }
  const orb = mesh(new THREE.IcosahedronGeometry(1.4, 1), new THREE.MeshBasicMaterial({ color: 0x9fe8ff }), 0, 12, 0);
  g.add(orb);
  // 光之国的奥特之父（雕像式 NPC）
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, orb, colliders };
}
