import * as THREE from 'three';
import { HEROES, TOWERS, KAIJU, CASTLE, WORLD } from './data.js';
import { buildTerrain, buildDecor, buildSky, groundHeight, heightAt, regionWeights, renderMinimapBase, rng, smoothstep } from './terrain.js';
import { buildTower, buildCastle, buildChest, buildShard, buildTemple, buildHero, animateHumanoid } from './models.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Player } from './player.js';
import { Minion, Kaiju, Belial } from './enemies.js';
import { initAudio, sfx, playMusic, stopMusic, toggleMute, isMuted } from './audio.js';

const MOBILE = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const SAVE_KEY = 'ultra-legend-save-v1';
const $ = id => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function loadSave() {
  const d = { shards: [], chests: [], boss: false, up: { hp: 0, atk: 0 }, intro: false, hero: 'ultraman', checkpoint: null };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) return { ...d, ...s, up: { ...d.up, ...(s.up || {}) } }; } catch (e) { /* ignore */ }
  return d;
}

class Game {
  constructor() {
    this.mobile = MOBILE;
    if (MOBILE) document.body.classList.add('touch');
    const canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MOBILE ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = !MOBILE;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 1400);
    this.fogDay = new THREE.Color(0xcfe3f5); this.fogDark = new THREE.Color(0x2a0810);
    this.scene.fog = new THREE.Fog(this.fogDay.clone(), 160, 560);

    this.hemi = new THREE.HemisphereLight(0xdff0ff, 0x6a7a4a, 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
    this.sunDir = V(0.4, 0.6, -0.3).normalize();
    if (!MOBILE) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const c = this.sun.shadow.camera; c.left = c.bottom = -60; c.right = c.top = 60; c.near = 1; c.far = 300;
      this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.4;
    }
    this.scene.add(this.sun, this.sun.target);

    this.save = loadSave();
    this.effects = new Effects(this.scene, this.camera, MOBILE);
    this.input = new Input(canvas);
    this.ui = new UI(this);
    this.shadowGeo = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.3, depthWrite: false });

    this.enemies = []; this.projectiles = []; this.beams = []; this.hazards = []; this.shocks = []; this.pickups = []; this.shardObjs = [];
    this.colliders = []; this.platforms = [];
    this.state = 'loading';
    this.camYaw = 0; this.camPitch = 0.32; this.camTarget = V(0, 8, 30);
    this.hitstop = 0; this.time = 0; this.playTime = 0;
    this.selectIndex = Math.max(0, HEROES.findIndex(h => h.id === this.save.hero));
    this.mmTimer = 0; this.objTimer = 0; this.spawnTimer = 0; this.barrierToast = 0;
    this.bossFight = false;
    this.timers = [];

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ---------- 世界构建 ----------
  buildWorld() {
    buildTerrain(this.scene, MOBILE);
    const decor = buildDecor(this.scene, MOBILE);
    this.lavas = decor.lavas;
    this.sky = buildSky(this.scene);
    this.sky.uniforms.sunDir.value.copy(this.sunDir);

    // 光之神殿
    const temple = buildTemple();
    const th = heightAt(0, 20);
    temple.group.position.set(0, th - 0.15, 20);
    this.scene.add(temple.group);
    this.temple = temple; this.templePos = V(0, th, 20);
    this.platforms.push({ x: 0, z: 20, r: 14.2, y: th + 0.55 }, { x: 0, z: 20, r: 10.2, y: th + 1.05 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; this.colliders.push({ x: Math.cos(a) * 12.5, z: 20 + Math.sin(a) * 12.5, r: 0.9, top: th + 9 }); }

    // 光之塔
    this.towers = TOWERS.map(t => {
      const m = buildTower();
      m.group.position.set(t.x, t.h, t.z);
      this.scene.add(m.group);
      this.platforms.push({ x: t.x, z: t.z, r: 10.5, y: t.h + 1.0 }, { x: t.x, z: t.z, r: 7.6, y: t.h + 1.7 });
      this.colliders.push({ x: t.x, z: t.z, r: 2.8, top: t.h + 26 });
      return { def: t, model: m, lit: false, kaiju: null };
    });

    // 暗黑城
    const castle = buildCastle();
    castle.group.position.set(CASTLE.x, CASTLE.h, CASTLE.z);
    this.scene.add(castle.group);
    this.castle = castle;
    const arenaLight = new THREE.PointLight(0xff6070, 600, 120, 1.6);
    arenaLight.position.set(CASTLE.x, CASTLE.h + 30, CASTLE.z);
    this.scene.add(arenaLight);
    for (const c of castle.colliders) this.colliders.push({ x: CASTLE.x + c.x, z: CASTLE.z + c.z, r: c.r, top: CASTLE.h + 40 });
    this.platforms.push({ x: CASTLE.x, z: CASTLE.z, r: 58.5, y: CASTLE.h + 0.4 });

    // 宝箱
    const R = rng(777);
    const spots = [[-200, 160], [250, -40], [320, 260], [-120, 300], [150, -260], [-420, -120], [470, 250], [-470, 300], [100, 470], [-60, -200], [-330, -420], [-180, -330]];
    this.chests = spots.map(([x, z], i) => {
      x += (R() - 0.5) * 30; z += (R() - 0.5) * 30;
      let h = groundHeight(x, z);
      if (h < 1) { x *= 0.9; z *= 0.9; h = Math.max(1, groundHeight(x, z)); }
      const m = buildChest();
      m.group.position.set(x, h, z);
      m.group.rotation.y = R() * Math.PI * 2;
      this.scene.add(m.group);
      const id = 'c' + i;
      const opened = this.save.chests.includes(id);
      if (opened) { m.lid.rotation.x = -1.9; m.shine.visible = false; }
      return { id, x, z, y: h, model: m, opened, reward: i % 2 === 0 ? 'hp' : 'atk' };
    });

    this.mapBase = renderMinimapBase(256);
    this.refreshWorldState();
  }

  floorAt(x, z) {
    let f = Math.max(groundHeight(x, z), WORLD.water - 1.1);
    for (const p of this.platforms) if ((x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r && p.y > f) f = p.y;
    return f;
  }

  refreshWorldState() {
    for (const t of this.towers) {
      t.lit = this.save.shards.includes(t.def.id);
      this.setTowerLit(t, t.lit, true);
    }
    const open = this.save.shards.length >= 4;
    this.castle.barrier.visible = !open;
    this.castle.barrierMat.opacity = 0.22;
  }
  setTowerLit(t, lit) {
    t.lit = lit;
    t.model.crystalMat.color.setHex(lit ? 0x9ff4ff : 0x556070);
    t.model.beamMat.opacity = lit ? 0.3 : 0;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 75 : 60;
    this.camera.updateProjectionMatrix();
  }

  // ---------- 菜单 ----------
  showTitle() {
    this.state = 'title';
    this.ui.hud(false);
    this.ui.screen('title');
    const hasProgress = this.save.shards.length > 0 || this.save.chests.length > 0 || this.save.boss;
    $('btn-new').classList.toggle('hidden', !hasProgress);
    $('btn-start').textContent = hasProgress ? '继续冒险' : '开始冒险';
    this.updateMuteButtons();
    this.clearPreview();
  }
  updateMuteButtons() {
    const t = isMuted() ? '🔇 声音：关' : '🔊 声音：开';
    $('btn-mute').textContent = t; $('btn-mute-title').textContent = t;
  }
  showSelect() {
    this.state = 'select';
    this.ui.screen('select');
    const cards = $('hero-cards');
    cards.innerHTML = '';
    HEROES.forEach((h, i) => {
      const c = document.createElement('div');
      c.className = 'card';
      const hex = n => '#' + n.toString(16).padStart(6, '0');
      c.innerHTML = `<div class="face" style="background:linear-gradient(160deg, ${hex(h.colors.body)} 0%, ${hex(h.colors.body)} 45%, ${hex(h.colors.main)} 46%, ${hex(h.colors.main)} 70%, ${hex(h.colors.accent)} 71%);--eye:${hex(h.colors.eye)}"></div><span>${h.name}</span>`;
      c.addEventListener('click', () => { this.selectHero(i); sfx.swing(); });
      cards.appendChild(c);
    });
    this.selectHero(this.selectIndex);
  }
  selectHero(i) {
    this.selectIndex = i;
    const h = HEROES[i];
    document.querySelectorAll('#hero-cards .card').forEach((c, k) => c.classList.toggle('on', k === i));
    const info = $('hero-info');
    info.querySelector('.n').textContent = h.name;
    info.querySelector('.t').textContent = h.title;
    info.querySelector('.d').textContent = h.desc + '  必杀技：' + h.special.name;
    const bar = (v, max) => `<b style="width:${Math.round(v / max * 60)}px"></b>`;
    info.querySelector('.stats').innerHTML = `<span>生命${bar(h.stats.hp, 125)}</span><span>攻击${bar(h.stats.atk, 13)}</span><span>速度${bar(h.stats.speed, 1.15)}</span>`;
    this.clearPreview();
    this.preview = buildHero(h);
    this.preview.root.position.set(0, this.templePos.y + 1.05, 20);
    this.preview.root.rotation.y = 0.4;
    this.scene.add(this.preview.root);
    this.previewAnim = { state: 'victory', time: 0, phase: 0 };
  }
  clearPreview() { if (this.preview) { this.scene.remove(this.preview.root); this.preview = null; } }

  // ---------- 开始游戏 ----------
  startGame() {
    initAudio();
    const def = HEROES[this.selectIndex];
    this.save.hero = def.id; this.persist();
    this.clearPreview();
    // 清理旧游戏
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    for (const s of this.shardObjs) this.scene.remove(s.model.group);
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.projectiles = []; this.beams = []; this.hazards = []; this.shocks = []; this.pickups = []; this.shardObjs = [];
    this.timers = []; this.fadeBarrier = 0;
    if (this.player) { this.scene.remove(this.player.model.root); this.scene.remove(this.player.shadow); }
    this.bossFight = false; this.castle.wall.visible = false;
    this.refreshWorldState();

    this.player = new Player(this, def, this.save.up);
    const cp = this.checkpointPos();
    this.player.pos.copy(cp);
    this.player.yaw = Math.PI;
    this.camYaw = 0; this.camPitch = 0.3;
    this.camTarget.copy(cp);

    // 守护怪兽
    for (const t of this.towers) {
      t.kaiju = null;
      if (!t.lit) { const k = new Kaiju(this, { ...t.def, h: t.def.h }, KAIJU[t.def.kaiju]); k.tower = t; t.kaiju = k; this.enemies.push(k); }
    }
    // 贝利亚
    this.belial = null;
    if (!this.save.boss) { this.belial = new Belial(this, { x: CASTLE.x, z: CASTLE.z, h: CASTLE.h + 0.4 }); this.enemies.push(this.belial); }
    // 杂兵
    for (let i = 0; i < (MOBILE ? 14 : 22); i++) this.spawnMinionNear(true);

    this.ui.setHero(def);
    this.ui.setShards(this.save.shards);
    this.ui.setBoss(null);
    this.ui.clearDialog();
    this.ui.screen(null);
    this.ui.hud(true);
    this.state = 'play';
    this.playTime = 0;
    this.input.enabled = true;
    this.input.clear();
    this.input.wantLock = !MOBILE;
    if (!MOBILE) { this.input.requestLock(); document.body.classList.toggle('need-lock', !this.input.locked); }
    playMusic('field');
    if (!this.save.intro) {
      this.save.intro = true; this.persist();
      const d = this.ui;
      d.dialog('奥特之父', `${def.name}，你终于来了。`, 2.5);
      d.dialog('奥特之父', '极恶贝利亚从宇宙监狱逃脱，在北方筑起了暗黑城，并用黑暗结界将它封印。', 4);
      d.dialog('奥特之父', '四座光之塔已被他操控的怪兽占据。击败守护怪兽，夺回 4 块光之碎片，结界就会消失！', 4.5);
      d.dialog('奥特之父', '在空中按住跳跃可以飞行，但会消耗体力。攻击敌人可积攒必杀技能量。去吧，愿光与你同在！', 4.5);
    } else {
      this.ui.toast(`${def.name}，出击！`, 2);
    }
  }

  checkpointPos() {
    const t = this.towers.find(t => t.def.id === this.save.checkpoint && t.lit);
    if (t) return V(t.def.x, t.def.h + 1.7, t.def.z + 16);
    return V(0, this.templePos.y + 1.05, 26);
  }

  later(sec, fn) { this.timers.push({ t: sec, fn }); }

  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* ignore */ } }

  // ---------- 敌人生成 ----------
  spawnMinionNear(initial = false) {
    const P = this.player.pos;
    for (let tries = 0; tries < 20; tries++) {
      let x, z;
      if (initial) { x = (Math.random() * 2 - 1) * 480; z = (Math.random() * 2 - 1) * 480; if (Math.hypot(x - P.x, z - P.z) > 260 && Math.random() < 0.6) { const a = Math.random() * 6.28, d = 70 + Math.random() * 180; x = P.x + Math.cos(a) * d; z = P.z + Math.sin(a) * d; } }
      else { const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 120; x = P.x + Math.cos(a) * d; z = P.z + Math.sin(a) * d; }
      if (Math.abs(x) > 500 || Math.abs(z) > 500) continue;
      if (Math.hypot(x - P.x, z - P.z) < 60) continue;
      if (Math.hypot(x, z - 20) < 70) continue;
      if (Math.hypot(x - CASTLE.x, z - CASTLE.z) < 100) continue;
      if (this.towers.some(t => Math.hypot(x - t.def.x, z - t.def.z) < 55)) continue;
      const h = groundHeight(x, z);
      if (h < 1 || h > 70) continue;
      const w = regionWeights(x, z);
      const level = 1 + Math.min(1, Math.hypot(x, z) / 450) * 0.8 + w.dark * 0.5;
      const type = Math.random() < 0.35 + w.dark * 0.5 ? 'darklops' : 'baltan';
      const pack = Math.random() < 0.4 ? 2 : 1;
      for (let k = 0; k < pack; k++) this.spawnMinionAt(x + k * 3, z + k * 2, type, level);
      return;
    }
  }
  spawnMinionAt(x, z, type, level = 1, arena = false) {
    const m = new Minion(this, x, z, type, level);
    m.arena = arena;
    if (arena) { m.aggro = 120; m.setState('chase'); this.effects.burst(m.center, 0xff2040, 20, 8, 0.6); }
    this.enemies.push(m);
    return m;
  }
  countArenaMinions() { return this.enemies.filter(e => e.arena && !e.dead).length; }

  findTarget(pos, range, yaw) {
    let best = null, bs = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'dormant' || !e.model.root.visible) continue;
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
      const d = Math.hypot(dx, dz) - e.radius;
      if (d > range) continue;
      const ang = Math.atan2(dx, dz);
      let diff = Math.abs(ang - yaw) % (Math.PI * 2); if (diff > Math.PI) diff = Math.PI * 2 - diff;
      const score = d + diff * 4;
      if (score < bs) { bs = score; best = e; }
    }
    return best;
  }

  // ---------- 战斗 ----------
  playerMelee(p, combo) {
    const f = p.forward();
    const range = combo === 2 ? 3.6 : 3.1;
    let hit = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const hd = Math.hypot(dx, dz);
      if (hd - e.radius > range) continue;
      const dy = p.pos.y - e.pos.y;
      if (dy > e.height + 0.5 || dy < -3.5) continue;
      const dot = (dx * f.x + dz * f.z) / Math.max(hd, 0.001);
      if (dot < 0.15 && hd > e.radius + 1) continue;
      const dmg = p.atk * (combo === 2 ? 1.8 : 1) * (0.9 + Math.random() * 0.2);
      if (e.takeDamage(dmg, p.pos, combo === 2 ? 16 : 5)) {
        hit++;
        const hp = e.center; hp.x -= dx / hd * e.radius * 0.8; hp.z -= dz / hd * e.radius * 0.8;
        this.effects.burst(hp, 0xffffff, 8, 9, 0.35);
        this.effects.burst(hp, p.def.special.color, 8, 6, 0.45);
        p.energy = Math.min(p.maxEnergy, p.energy + 5);
      }
    }
    if (hit) {
      combo === 2 ? sfx.heavy() : sfx.hit();
      this.hitstop = combo === 2 ? 0.09 : 0.05;
      this.effects.shake = Math.max(this.effects.shake, combo === 2 ? 0.35 : 0.15);
    }
  }

  playerSpecial(p) {
    const sp = p.def.special;
    const f = p.forward();
    const origin = V(p.pos.x + f.x * 0.9, p.pos.y + 2.3, p.pos.z + f.z * 0.9);
    const target = this.findTarget(p.pos, 55, p.yaw);
    let dir = f.clone();
    if (target) dir = target.center.sub(origin).normalize();
    else if (!p.grounded) dir.y = -0.25;
    dir.normalize();
    if (sp.kind === 'beam') {
      this.spawnBeam({ owner: 'player', origin, dir, length: sp.length, width: sp.width, dmg: sp.damage + p.atk * 1.5, life: 0.75, color: sp.color, core: sp.core });
      sfx.beam();
      this.effects.shake = 0.3;
      this.effects.burst(origin, sp.color, 20, 10, 0.5);
      if (sp.sluggers) for (const s of [-1, 1]) this.spawnSlugger(p, target, origin.clone().add(V(-f.z * s * 1.2, 1, f.x * s * 1.2)), s, sp.damage * 0.4);
    } else {
      this.spawnSlugger(p, target, origin, 0, sp.damage + p.atk);
      sfx.slugger();
    }
  }

  spawnSlugger(p, target, origin, side, dmg) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 1.4), new THREE.MeshBasicMaterial({ color: 0xeaf6ff }));
    const glowM = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 1.9), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.add(glowM);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    const f = p.forward();
    const dest = target ? null : origin.clone().add(V(f.x * 30 + -f.z * side * 6, 0, f.z * 30 + f.x * side * 6));
    p.slugOut++;
    this.projectiles.push({ kind: 'slugger', mesh, pos: origin.clone(), target, dest, out: true, t: 0, hit: new Set(), dmg, side, owner: 'player', life: 4 });
  }

  spawnBeam(o) {
    o.fx = this.effects.beam(o.origin, o.dir, o.length, o.color, o.core, o.width, o.life);
    o.t = 0; o.hit = new Set();
    this.beams.push(o);
  }

  spawnProjectile(o) {
    let mesh;
    if (o.rock) mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(o.size, 0), new THREE.MeshLambertMaterial({ color: o.color, flatShading: true }));
    else {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(o.size, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(o.size * 1.8, 10, 8), new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })));
    }
    mesh.position.copy(o.pos);
    this.scene.add(mesh);
    o.mesh = mesh; o.pos = o.pos.clone(); o.speed = o.vel.length();
    this.projectiles.push(o);
  }

  hazard({ x, z, r, delay, dmg, color }) {
    const y = this.floorAt(x, z);
    this.effects.telegraphCircle(x, y, z, r, delay, color);
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4060 }));
    m.add(new THREE.Mesh(new THREE.SphereGeometry(2, 10, 8), new THREE.MeshBasicMaterial({ color: 0x800020, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })));
    m.position.set(x + 20, y + 60, z - 10);
    this.scene.add(m);
    this.hazards.push({ x, y, z, r, delay, dmg, color, t: 0, mesh: m });
  }

  shockwave(center, maxR, dur, dmg, color) {
    const y = this.floorAt(center.x, center.z);
    this.effects.ring(V(center.x, y + 0.5, center.z), color, maxR, dur, 0.7);
    this.effects.burst(V(center.x, y + 0.5, center.z), color, 30, 14, 0.6);
    this.shocks.push({ x: center.x, z: center.z, y, maxR, dur, dmg, t: 0, hit: false });
  }

  segDist(p, o, d, L) {
    const t = Math.max(0, Math.min(L, (p.x - o.x) * d.x + (p.y - o.y) * d.y + (p.z - o.z) * d.z));
    return Math.hypot(p.x - (o.x + d.x * t), p.y - (o.y + d.y * t), p.z - (o.z + d.z * t));
  }

  resolveCollisions(pos, r, isPlayer) {
    for (const c of this.colliders) {
      if (pos.y > c.top) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 0.0001) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m; }
    }
    if (!isPlayer) return;
    // 暗黑结界
    if (this.castle.barrier.visible) {
      const dx = pos.x - CASTLE.x, dz = pos.z - CASTLE.z, dy = pos.y - CASTLE.h;
      const R = 73;
      if (dy < R && dx * dx + dz * dz + dy * dy < R * R) {
        const hr = Math.sqrt(Math.max(0, R * R - dy * dy)) + 0.1;
        const d = Math.hypot(dx, dz) || 1;
        pos.x = CASTLE.x + dx / d * hr; pos.z = CASTLE.z + dz / d * hr;
        if (this.barrierToast <= 0) {
          this.ui.toast(`暗黑结界阻挡了你！需要 4 块光之碎片（当前 ${this.save.shards.length}/4）`, 2.5);
          this.barrierToast = 3;
          this.effects.burst(V(pos.x, pos.y + 2, pos.z), 0xc040ff, 20, 8, 0.6);
        }
      }
    }
    // Boss 战红墙
    if (this.bossFight) {
      const dx = pos.x - CASTLE.x, dz = pos.z - CASTLE.z;
      const d = Math.hypot(dx, dz), R = 54;
      if (d > R) { pos.x = CASTLE.x + dx / d * R; pos.z = CASTLE.z + dz / d * R; }
      if (pos.y > CASTLE.h + 36) pos.y = CASTLE.h + 36;
    }
  }

  spawnPickup(pos, kind) {
    const color = kind === 'hp' ? 0x5aff7a : 0x6ad0ff;
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), new THREE.MeshBasicMaterial({ color }));
    m.add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })));
    m.position.copy(pos);
    this.scene.add(m);
    this.pickups.push({ mesh: m, pos: pos.clone(), vel: V((Math.random() - 0.5) * 6, 8, (Math.random() - 0.5) * 6), kind, t: 0 });
  }

  // ---------- 事件 ----------
  onEnemyDead(e) {
    this.effects.burst(e.center, 0xffd080, 20, 10, 0.7);
    if (e instanceof Minion) {
      sfx.explode();
      this.effects.explosion(e.center, 0xffa040, 2.2, 0.45);
      const n = Math.random() < 0.6 ? 1 : 2;
      for (let i = 0; i < n; i++) this.spawnPickup(e.center, Math.random() < 0.55 ? 'hp' : 'en');
    } else if (e instanceof Kaiju) {
      sfx.explode(); this.effects.shake = 1;
      this.disengageBoss(e);
      const t = e.tower;
      this.ui.dialog('系统', `击败了${e.name}！光之碎片出现在${t.def.name}下。`, 3);
      this.later(2.5, () => {
        const s = buildShard();
        s.group.position.set(t.def.x, t.def.h + 4, t.def.z + 9);
        this.scene.add(s.group);
        this.effects.burst(s.group.position, 0xbff4ff, 40, 12, 1);
        this.shardObjs.push({ model: s, tower: t, t: 0 });
      });
      for (let i = 0; i < 4; i++) this.spawnPickup(e.center, i % 2 ? 'hp' : 'en');
    }
  }

  collectShard(s) {
    this.scene.remove(s.model.group);
    this.shardObjs.splice(this.shardObjs.indexOf(s), 1);
    const t = s.tower;
    if (!this.save.shards.includes(t.def.id)) this.save.shards.push(t.def.id);
    this.save.checkpoint = t.def.id;
    this.persist();
    this.setTowerLit(t, true);
    this.ui.setShards(this.save.shards);
    sfx.shard();
    const n = this.save.shards.length;
    this.ui.callout(`光之碎片 ${n} / 4`);
    this.player.heal(this.player.maxHp);
    this.player.energy = this.player.maxEnergy;
    this.effects.ring(V(t.def.x, t.def.h + 2, t.def.z), 0x9ff4ff, 40, 1.2, 0.8);
    if (n >= 4) {
      this.later(1.5, () => {
        this.ui.dialog('奥特之父', '四块光之碎片都集齐了！北方的暗黑结界正在崩溃……', 3.5);
        this.ui.dialog('奥特之父', '前往暗黑城，打倒极恶贝利亚吧！', 3);
        this.fadeBarrier = 1;
      });
    } else {
      this.ui.dialog('系统', `${t.def.name} 的光芒恢复了！复活点已更新。还剩 ${4 - n} 座光之塔。`, 3.5);
    }
  }

  openChest(c) {
    c.opened = true;
    this.save.chests.push(c.id);
    let text;
    if (c.reward === 'hp') { this.save.up.hp += 10; text = '最大生命值 +10'; }
    else { this.save.up.atk += 1; text = '攻击力 +1'; }
    this.persist();
    this.player.setUpgrades(this.save.up);
    this.player.heal(this.player.maxHp);
    sfx.chest();
    this.ui.toast(`🎁 打开宝箱：${text}！`, 3);
    this.effects.burst(V(c.x, c.y + 1.5, c.z), 0xffe070, 30, 8, 0.8);
    c.model.shine.visible = false;
  }

  engageBoss(e) { this.ui.setBoss(e); playMusic('boss'); this.ui.toast(`⚠ ${e.name} 出现了！`, 2.5); }
  disengageBoss(e) { if (this.ui.boss === e) { this.ui.setBoss(null); if (!this.bossFight) playMusic('field'); } }

  startBossFight() {
    this.bossFight = true;
    this.castle.wall.visible = true;
    this.castle.wallMat.opacity = 0.0;
    this.belial.wake();
    this.ui.setBoss(this.belial);
    playMusic('boss');
    const def = this.player.def;
    const lines = {
      zero: '贝利亚！我已经不是当年的我了，今天就在这里了结一切！',
      geed: '……老爸。我不会再逃避了，我会用我的光阻止你！',
      seven: '贝利亚，宇宙的和平由我们来守护！',
      tiga: '我既是人，也是光。贝利亚，你的黑暗到此为止！',
      ultraman: '贝利亚，光之国的战士绝不会向黑暗屈服！',
    };
    this.ui.dialog('极恶贝利亚', '哼哼哼……光之国的小鬼，居然敢闯进我的城堡！', 3);
    this.ui.dialog(def.name, lines[def.id], 3);
  }

  onBossDefeated(b) {
    this.ui.setBoss(null);
    this.ui.clearDialog();
    this.save.boss = true; this.persist();
    sfx.roar();
    this.ui.dialog('极恶贝利亚', '不……不可能！我、我竟然会输给你……！', 3);
    for (const e of this.enemies) if (e.arena && !e.dead) e.takeDamage(9999, e.pos, 0);
    this.later(3.0, () => {
      sfx.explode(); this.effects.explosion(b.center, 0xffffff, 14, 1.2); this.effects.shake = 1.5;
    });
    this.later(5.2, () => {
      this.bossFight = false;
      this.castle.wall.visible = false;
      this.state = 'victory';
      this.input.enabled = false;
      if (document.pointerLockElement) document.exitPointerLock();
      playMusic('victory'); sfx.win();
      const m = Math.floor(this.playTime / 60), s = Math.floor(this.playTime % 60);
      $('victory-text').innerHTML = `${this.player.def.name} 击败了极恶贝利亚！<br>光之国与这片大地恢复了和平。<br><br>本次游玩：${m} 分 ${s} 秒 · 宝箱 ${this.save.chests.length} / ${this.chests.length}`;
      this.ui.screen('victory');
    });
  }

  onPlayerDead() {
    this.ui.callout('能量耗尽');
    this.later(2.4, () => {
      if (this.player.dead) {
        this.ui.screen('death');
        if (document.pointerLockElement) document.exitPointerLock();
      }
    });
  }

  revive() {
    if (this.bossFight) {
      this.bossFight = false; this.castle.wall.visible = false;
      this.belial.reset();
      for (const e of this.enemies) if (e.arena) { e.dead = true; e.remove = true; }
    }
    for (const e of this.enemies) if (e.isMini && e.engaged) { e.engaged = false; e.setState('wander'); }
    this.ui.setBoss(null);
    playMusic('field');
    this.player.respawn(this.checkpointPos());
    this.camYaw = 0;
    this.ui.screen(null);
    this.input.clear();
    if (!MOBILE) this.input.requestLock();
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.ui.screen('pause');
    this.updateMuteButtons();
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'play';
    this.ui.screen(this.player.dead ? 'death' : null);
    this.input.clear();
    if (!MOBILE) this.input.requestLock();
  }

  // ---------- 主循环 ----------
  update(dt) {
    this.time += dt;
    if (this.state === 'title' || this.state === 'select' || this.state === 'loading') { this.updateMenu(dt); return; }
    if (this.state === 'paused') return;
    if (this.input.consume('pause')) { this.pause(); return; }
    if (this.input.consume('map')) this.ui.toggleMap();
    if (this.state === 'play') this.playTime += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }

    // 视角
    const sens = MOBILE ? 0.0045 : 0.0024;
    this.camYaw -= this.input.lookDX * sens;
    this.camPitch += this.input.lookDY * sens;
    this.input.lookDX = this.input.lookDY = 0;
    if (this.input.keys.ArrowLeft) this.camYaw += dt * 2.2;
    if (this.input.keys.ArrowRight) this.camYaw -= dt * 2.2;
    this.camPitch = Math.max(-0.45, Math.min(1.25, this.camPitch));
    document.body.classList.toggle('need-lock', !MOBILE && !this.input.locked && this.state === 'play' && !this.player.dead);

    const P = this.player;
    P.update(dt, this.input, this.camYaw);

    // 敌人
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
      const far = d > 175 && !e.isBoss && !e.engaged;
      e.model.root.visible = !far && (e.model.root.visible || e.state !== 'vanish');
      e.shadow.visible = !far;
      if (!far) e.update(dt);
      if (e.remove || (!e.isMini && !e.isBoss && !e.arena && d > 280)) { e.dispose(); this.enemies.splice(i, 1); }
    }
    // 推挤
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz), m = P.radius + e.radius;
      if (d < m && d > 0.001 && Math.abs(P.pos.y - e.pos.y) < e.height) {
        const push = (m - d);
        P.pos.x += dx / d * push * 0.7; P.pos.z += dz / d * push * 0.7;
        e.pos.x -= dx / d * push * 0.3; e.pos.z -= dz / d * push * 0.3;
      }
    }

    this.updateProjectiles(dt);
    this.updateBeams(dt);
    this.updateHazards(dt);
    this.updatePickups(dt);
    this.updateWorld(dt);
    this.updateCamera(dt);
  }

  updateProjectiles(dt) {
    const P = this.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t = (p.t || 0) + dt;
      let dead = false;
      if (p.kind === 'slugger') {
        let dest;
        if (p.out) {
          dest = p.target && !p.target.dead ? p.target.center : p.dest || P.center;
          if (p.t > 0.9 || p.pos.distanceTo(dest) < 1.2) { p.out = false; p.hit.clear(); }
        } else dest = P.center.add(V(0, 1, 0));
        const dir = dest.clone().sub(p.pos);
        const l = dir.length();
        const sp = 40 * dt;
        if (!p.out && l < 1.5) dead = true;
        else p.pos.addScaledVector(dir.normalize(), Math.min(l, sp));
        p.mesh.position.copy(p.pos);
        p.mesh.rotation.y += dt * 25; p.mesh.rotation.z = 1.2;
        if (Math.random() < 0.6) this.effects.burst(p.pos, 0x9fe8ff, 1, 1, 0.3, 0);
        for (const e of this.enemies) {
          if (e.dead || p.hit.has(e)) continue;
          if (p.pos.distanceTo(e.center) < e.radius + Math.max(1.6, e.height * 0.45)) {
            p.hit.add(e);
            if (e.takeDamage(p.dmg, p.pos, 8)) { sfx.hit(); this.effects.burst(e.center, 0xffffff, 12, 9, 0.4); P.energy = Math.min(P.maxEnergy, P.energy + 2); }
          }
        }
        if (p.t > 4) dead = true;
        if (dead) P.slugOut = Math.max(0, P.slugOut - 1);
      } else {
        p.life -= dt;
        if (p.homing && !P.dead) {
          const desired = P.center.sub(p.pos).normalize().multiplyScalar(p.speed);
          p.vel.lerp(desired, Math.min(1, p.homing * dt));
        }
        if (p.gravity) p.vel.y -= p.gravity * dt;
        p.pos.addScaledVector(p.vel, dt);
        p.mesh.position.copy(p.pos);
        p.mesh.rotation.x += dt * 5; p.mesh.rotation.y += dt * 4;
        if (!p.rock && Math.random() < 0.5) this.effects.burst(p.pos, p.color, 1, 1, 0.3, 0);
        if (p.pos.distanceTo(P.center) < p.radius + 1.0) { P.takeDamage(p.dmg, p.pos, 10); dead = true; }
        const fl = this.floorAt(p.pos.x, p.pos.z);
        if (p.pos.y < fl) {
          dead = true;
          if (p.aoe && Math.hypot(P.pos.x - p.pos.x, P.pos.z - p.pos.z) < p.aoe && P.pos.y - fl < 2.5) P.takeDamage(p.dmg, p.pos, 12);
        }
        if (p.life <= 0) dead = true;
        if (dead) { this.effects.explosion(p.pos, p.rock ? 0xc8a46e : p.color, p.rock ? 3 : 1.5, 0.35); }
      }
      if (dead) { this.scene.remove(p.mesh); this.projectiles.splice(i, 1); }
    }
  }

  updateBeams(dt) {
    const P = this.player;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      if (b.t > 0.06 && b.t < b.life * 0.85) {
        const L = b.length * Math.min(1, b.t / 0.12);
        if (b.owner === 'player') {
          for (const e of this.enemies) {
            if (e.dead || b.hit.has(e)) continue;
            if (this.segDist(e.center, b.origin, b.dir, L) < b.width + e.radius * 0.9 + e.height * 0.25) {
              b.hit.add(e);
              if (e.takeDamage(b.dmg, b.origin, 12)) { this.effects.explosion(e.center, b.color, 2.5, 0.4); sfx.heavy(); this.hitstop = 0.06; this.effects.shake = 0.4; }
            }
          }
        } else if (!b.hit.has(P)) {
          if (this.segDist(P.center, b.origin, b.dir, L) < b.width + 1.0) { b.hit.add(P); P.takeDamage(b.dmg, b.origin, 16); }
        }
      }
      if (b.t >= b.life) this.beams.splice(i, 1);
    }
  }

  updateHazards(dt) {
    const P = this.player;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.t += dt;
      const u = Math.min(1, h.t / h.delay);
      h.mesh.position.set(h.x + 20 * (1 - u), h.y + 60 * (1 - u), h.z - 10 * (1 - u));
      if (h.t >= h.delay) {
        this.effects.explosion(V(h.x, h.y + 1, h.z), h.color, h.r * 0.9, 0.5);
        sfx.explode();
        if (Math.hypot(P.pos.x - h.x, P.pos.z - h.z) < h.r + 0.6 && P.pos.y - h.y < 3.5) P.takeDamage(h.dmg, V(h.x, h.y, h.z), 12);
        this.scene.remove(h.mesh);
        this.hazards.splice(i, 1);
      }
    }
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.t += dt;
      const r = 0.5 + s.maxR * Math.min(1, s.t / s.dur);
      const d = Math.hypot(P.pos.x - s.x, P.pos.z - s.z);
      if (!s.hit && Math.abs(d - r) < 1.8 && P.pos.y - this.floorAt(P.pos.x, P.pos.z) < 1.2) { s.hit = true; P.takeDamage(s.dmg, V(s.x, s.y, s.z), 14); }
      if (s.t >= s.dur) this.shocks.splice(i, 1);
    }
  }

  updatePickups(dt) {
    const P = this.player;
    const c = P.center;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      const d = p.pos.distanceTo(c);
      if (p.t > 0.5 && d < 8 && !P.dead) {
        p.pos.lerp(c, Math.min(1, dt * 8));
      } else {
        p.vel.y -= 25 * dt;
        p.pos.addScaledVector(p.vel, dt);
        const f = this.floorAt(p.pos.x, p.pos.z) + 0.8;
        if (p.pos.y < f) { p.pos.y = f; p.vel.set(0, 0, 0); }
      }
      p.mesh.position.copy(p.pos);
      p.mesh.position.y += Math.sin(p.t * 4) * 0.15;
      p.mesh.rotation.y += dt * 3;
      if (d < 1.8 && p.t > 0.4) {
        if (p.kind === 'hp') { P.heal(15); this.effects.text(c, '+15', '#7dff9a'); }
        else { P.energy = Math.min(P.maxEnergy, P.energy + 20); this.effects.text(c, '+能量', '#9fe8ff'); }
        sfx.pickup();
        this.scene.remove(p.mesh); this.pickups.splice(i, 1);
      } else if (p.t > 25) { this.scene.remove(p.mesh); this.pickups.splice(i, 1); }
    }
  }

  updateWorld(dt) {
    const P = this.player;
    this.barrierToast -= dt;
    // 光之碎片
    for (const s of [...this.shardObjs]) {
      s.t += dt;
      s.model.group.rotation.y += dt * 2;
      s.model.halo.rotation.x = Math.sin(s.t * 2) * 0.6;
      s.model.group.position.y = s.tower.def.h + 4 + Math.sin(s.t * 2.5) * 0.4;
      if (Math.random() < dt * 20) this.effects.burst(s.model.group.position, 0xbff4ff, 1, 3, 0.8, -2);
      if (!P.dead && s.model.group.position.distanceTo(P.center) < 3.5) this.collectShard(s);
    }
    // 塔光柱脉动
    for (const t of this.towers) {
      if (t.lit) t.model.beamMat.opacity = 0.25 + Math.sin(this.time * 2 + t.def.x) * 0.08;
      t.model.crystal.rotation.y += dt * (t.lit ? 1.5 : 0.3);
    }
    // 宝箱
    for (const c of this.chests) {
      if (c.opened) { c.model.lid.rotation.x += (-1.9 - c.model.lid.rotation.x) * Math.min(1, dt * 6); continue; }
      c.model.shine.rotation.y += dt * 3;
      c.model.shine.position.y = 2.2 + Math.sin(this.time * 3) * 0.2;
      if (!P.dead && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 2.8 && Math.abs(P.pos.y - c.y) < 3) this.openChest(c);
    }
    // 结界消散
    if (this.fadeBarrier) {
      this.fadeBarrier -= dt * 0.4;
      this.castle.barrierMat.opacity = 0.22 * Math.max(0, this.fadeBarrier);
      if (Math.random() < dt * 30) this.effects.burst(V(CASTLE.x + (Math.random() - 0.5) * 120, CASTLE.h + Math.random() * 60, CASTLE.z + (Math.random() - 0.5) * 120), 0xc040ff, 4, 6, 1);
      if (this.fadeBarrier <= 0) { this.fadeBarrier = 0; this.castle.barrier.visible = false; this.ui.toast('暗黑结界消失了！', 3); }
    }
    // Boss 战触发
    if (this.belial && !this.save.boss && !this.bossFight && !this.castle.barrier.visible && !P.dead && this.state === 'play') {
      if (Math.hypot(P.pos.x - CASTLE.x, P.pos.z - CASTLE.z) < 46) this.startBossFight();
    }
    if (this.bossFight) this.castle.wallMat.opacity = Math.min(0.18, this.castle.wallMat.opacity + dt * 0.2) * (0.8 + Math.sin(this.time * 4) * 0.2);
    // 岩浆
    if (P.grounded && !P.dead) for (const l of this.lavas) if (Math.hypot(P.pos.x - l.x, P.pos.z - l.z) < l.r && P.pos.y < l.y + 1.5) { P.takeDamage(6, V(l.x, l.y, l.z), 8); break; }

    // 刷怪
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.5;
      const n = this.enemies.filter(e => e instanceof Minion && !e.arena && !e.dead).length;
      if (n < (MOBILE ? 14 : 22)) this.spawnMinionNear(false);
    }

    // 黑暗氛围
    const dc = Math.hypot(P.pos.x - CASTLE.x, P.pos.z - CASTLE.z);
    let dk = 1 - smoothstep(110, 280, dc);
    if (this.save.boss) dk *= 0.25;
    this.dark = (this.dark ?? dk) + (dk - (this.dark ?? dk)) * Math.min(1, dt * 2);
    this.applyAtmosphere(this.dark);

    // 太阳跟随
    this.sun.position.copy(P.pos).addScaledVector(this.sunDir, 150);
    this.sun.target.position.copy(P.pos);

    // HUD
    this.mmTimer -= dt;
    if (this.mmTimer <= 0) { this.mmTimer = 0.12; this.ui.drawMinimap(this.mapBase); }
    this.objTimer -= dt;
    if (this.objTimer <= 0) { this.objTimer = 0.2; this.updateObjective(); }
  }

  applyAtmosphere(dk) {
    this.sky.uniforms.darkness.value = dk;
    this.scene.fog.color.copy(this.fogDay).lerp(this.fogDark, dk);
    this.scene.fog.near = 160 - dk * 90; this.scene.fog.far = 560 - dk * 260;
    this.hemi.color.setRGB(0.87 - dk * 0.4, 0.94 - dk * 0.7, 1 - dk * 0.7);
    this.hemi.intensity = 1.25 - dk * 0.25;
    this.sun.intensity = 2.2 - dk * 0.9;
    this.sun.color.setRGB(1, 0.94 - dk * 0.5, 0.85 - dk * 0.5);
  }

  updateObjective() {
    const P = this.player;
    let target, text;
    if (this.save.shards.length < 4) {
      let best = null, bd = Infinity;
      for (const t of this.towers) { if (t.lit) continue; const d = Math.hypot(t.def.x - P.pos.x, t.def.z - P.pos.z); if (d < bd) { bd = d; best = t; } }
      const pending = this.shardObjs[0];
      if (pending) { target = pending.tower.def; text = `拾取光之碎片！`; }
      else { target = best.def; text = `前往<b>${best.def.name}</b>（${best.def.biome}），击败守护怪兽 · 碎片 ${this.save.shards.length}/4`; }
    } else if (!this.save.boss) {
      target = CASTLE; text = this.bossFight ? '击败<b>极恶贝利亚</b>！' : '前往北方<b>暗黑城</b>，击败极恶贝利亚！';
    } else {
      const left = this.chests.filter(c => !c.opened);
      text = `★ 光之国恢复了和平！宝箱 ${this.chests.length - left.length}/${this.chests.length}`;
      if (left.length) { let b = left[0], bd = Infinity; for (const c of left) { const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z); if (d < bd) { bd = d; b = c; } } target = b; text += ' · 寻找剩下的宝箱'; }
    }
    if (target) {
      const a = Math.atan2(target.x - P.pos.x, target.z - P.pos.z);
      const rel = a - (this.camYaw + Math.PI);
      const deg = -rel * 180 / Math.PI;
      const dist = Math.round(Math.hypot(target.x - P.pos.x, target.z - P.pos.z));
      text = `<span class="arrow" style="transform:rotate(${deg}deg)">⬆</span>${text} <span style="opacity:.75">${dist}m</span>`;
    }
    this.ui.setObjective(text);
  }

  updateCamera(dt) {
    const P = this.player;
    const tgt = V(P.pos.x, P.pos.y + 2.5, P.pos.z);
    this.camTarget.lerp(tgt, 1 - Math.exp(-12 * dt));
    let dist = (MOBILE ? 11 : 10) + (this.bossFight || this.ui.boss ? 4 : 0) + (P.flying ? 3 : 0);
    this.camDist = (this.camDist ?? dist) + (dist - (this.camDist ?? dist)) * Math.min(1, dt * 3);
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const pos = V(this.camTarget.x + Math.sin(this.camYaw) * cp * this.camDist, this.camTarget.y + sp * this.camDist, this.camTarget.z + Math.cos(this.camYaw) * cp * this.camDist);
    const fl = this.floorAt(pos.x, pos.z) + 0.8;
    if (pos.y < fl) pos.y = fl;
    const s = this.effects.shake;
    if (s > 0) pos.add(V((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    this.camera.position.copy(pos);
    this.camera.lookAt(this.camTarget);
  }

  updateMenu(dt) {
    if (this.state === 'select' && this.preview) {
      const r = this.preview.root;
      r.rotation.y += dt * 0.5;
      this.previewAnim.time += dt;
      this.previewAnim.state = Math.floor(this.previewAnim.time / 3) % 2 ? 'idle' : 'victory';
      animateHumanoid(this.preview, this.previewAnim, dt);
      const tx = 0, ty = this.templePos.y + 2.6, tz = 20;
      const near = window.innerHeight < 500 ? 0.7 : 1;
      const cam = V(tx + 1.5 * near, ty + 0.6, tz + 7.5 * near);
      this.camera.position.lerp(cam, Math.min(1, dt * 3));
      this.camera.lookAt(tx, ty - 0.4 + (this.camera.aspect < 1 ? 0.6 : 0) - (window.innerHeight < 500 ? 1.1 : 0), tz);
    } else {
      const a = this.time * 0.06;
      const cx = Math.sin(a) * 70, cz = 20 + Math.cos(a) * 70;
      this.camera.position.set(cx, this.templePos.y + 26, cz);
      this.camera.lookAt(0, this.templePos.y + 10, 20);
    }
    this.temple.orb.rotation.y += dt;
    for (const t of this.towers) t.model.crystal.rotation.y += dt * 0.5;
    this.applyAtmosphere(0);
    this.sun.position.set(0, 0, 20).addScaledVector(this.sunDir, 150);
    this.sun.target.position.set(0, 0, 20);
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    let dt = Math.min(0.05, this.clock.getDelta());
    if (this.hitstop > 0) { this.hitstop -= dt; dt *= 0.08; }
    this.update(dt);
    this.temple.orb.rotation.y += dt;
    this.sky.sky.position.copy(this.camera.position);
    this.effects.update(dt);
    this.ui.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  run() {
    this.buildWorld();
    this.clock = new THREE.Clock();
    this.bindMenus();
    this.showTitle();
    this.loop();
  }

  bindMenus() {
    const click = (id, fn) => $(id).addEventListener('click', e => { e.stopPropagation(); initAudio(); fn(); });
    click('btn-start', () => { sfx.pickup(); this.showSelect(); });
    click('btn-new', () => {
      if (!confirm('确定要清除所有进度，重新开始吗？')) return;
      this.save = { shards: [], chests: [], boss: false, up: { hp: 0, atk: 0 }, intro: false, hero: this.save.hero, checkpoint: null };
      this.persist();
      for (const c of this.chests) { c.opened = false; c.model.lid.rotation.x = 0; c.model.shine.visible = true; }
      this.refreshWorldState();
      this.showSelect();
    });
    click('btn-go', () => { sfx.shard(); this.startGame(); });
    click('btn-resume', () => this.resume());
    click('btn-quit', () => { stopMusic(); this.state = 'title'; this.input.enabled = false; this.ui.setBoss(null); this.ui.clearDialog(); this.showTitle(); });
    click('btn-revive', () => this.revive());
    click('btn-continue', () => { this.state = 'play'; this.input.enabled = true; this.ui.screen(null); playMusic('field'); if (!MOBILE) this.input.requestLock(); });
    click('btn-title', () => { stopMusic(); this.input.enabled = false; this.showTitle(); });
    const mute = () => { toggleMute(); this.updateMuteButtons(); };
    click('btn-mute', mute); click('btn-mute-title', mute);
    $('pause-btn').addEventListener('click', e => { e.stopPropagation(); this.pause(); });
    $('pause-btn').addEventListener('touchstart', e => { e.stopPropagation(); e.preventDefault(); this.pause(); }, { passive: false });
    this.input.onUnlock = () => { if (this.state === 'play' && !this.player.dead) this.pause(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    window.addEventListener('keydown', e => {
      if (e.code === 'Enter' || e.code === 'Space') {
        if (this.state === 'title') { $('btn-start').click(); e.preventDefault(); }
        else if (this.state === 'select') { $('btn-go').click(); e.preventDefault(); }
      }
      if (this.state === 'select') {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.selectHero((this.selectIndex + HEROES.length - 1) % HEROES.length);
        if (e.code === 'ArrowRight' || e.code === 'KeyD') this.selectHero((this.selectIndex + 1) % HEROES.length);
      }
      if (this.state === 'play' && e.code === 'Enter') this.ui.skipDialog();
    });
  }
}

const game = new Game();
window.__game = game;
try {
  game.run();
  $('loading').classList.remove('show');
} catch (err) {
  console.error(err);
  $('loading').innerHTML = `<div style="padding:20px;text-align:center">加载失败：${err.message}<br>请使用支持 WebGL 的现代浏览器。</div>`;
}
