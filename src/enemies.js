import * as THREE from 'three';
import { buildBaltan, buildDarklops, buildBelial, buildKaiju, animateHumanoid, animateKaiju } from './models.js';
import { groundHeight } from './terrain.js';
import { sfx } from './audio.js';
import { WORLD } from './data.js';

const V = () => new THREE.Vector3();
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

// 每个敌人复制一份材质，用于受击闪白
function ownMaterials(root) {
  const map = new Map(), list = [];
  root.traverse(o => {
    if (!o.isMesh || !o.material || !o.material.emissive) return;
    if (!map.has(o.material)) { const c = o.material.clone(); map.set(o.material, c); list.push(c); }
    o.material = map.get(o.material);
  });
  return list;
}

export class Enemy {
  constructor(game, x, z, opt) {
    this.game = game;
    this.pos = new THREE.Vector3(x, groundHeight(x, z), z);
    this.home = this.pos.clone();
    this.kb = V();
    this.yaw = Math.random() * Math.PI * 2;
    Object.assign(this, { radius: 1, height: 3, hp: 40, atk: 8, speed: 7, name: '敌人', mass: 1, aggro: 32, superArmor: false }, opt);
    this.maxHp = this.hp;
    this.state = 'idle'; this.t = 0; this.cool = 1 + Math.random();
    this.anim = { state: 'idle', time: Math.random() * 10, phase: 0, t01: 0 };
    this.dead = false; this.remove = false;
    this.flash = 0; this.mats = [];
    this.wanderTarget = null;
    this.staggerAcc = 0;
    this.shadow = new THREE.Mesh(game.shadowGeo, game.shadowMat);
    game.scene.add(this.shadow);
  }
  attach(model) {
    this.model = model;
    this.mats = ownMaterials(model.root);
    this.game.scene.add(model.root);
  }
  get center() { return new THREE.Vector3(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z); }
  setState(s) { this.state = s; this.t = 0; }
  distToPlayer() { const p = this.game.player.pos; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }
  face(x, z, dt, rate = 8) {
    const target = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.yaw += angDiff(target, this.yaw) * (dt >= 1 ? 1 : 1 - Math.exp(-rate * dt));
  }
  facingPlayer(cone = 0.8) {
    const p = this.game.player.pos;
    const a = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    return Math.abs(angDiff(a, this.yaw)) < cone;
  }
  step(dir, speed, dt) {
    this.pos.x += Math.sin(dir) * speed * dt;
    this.pos.z += Math.cos(dir) * speed * dt;
    this.anim.phase += dt * speed * 0.7;
  }
  moveToward(x, z, speed, dt) {
    this.face(x, z, dt);
    this.step(this.yaw, speed, dt);
  }
  physics(dt) {
    this.kb.multiplyScalar(Math.exp(-6 * dt));
    this.pos.x += this.kb.x * dt; this.pos.z += this.kb.z * dt;
    this.game.resolveCollisions(this.pos, this.radius, false);
    const lim = WORLD.half - 35;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));
    if (!this.airborne) this.pos.y = this.game.floorAt(this.pos.x, this.pos.z);
  }
  takeDamage(dmg, from, knock = 4) {
    if (this.dead || this.invulnerable) return false;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.flash = 0.12;
    const d = new THREE.Vector3(this.pos.x - from.x, 0, this.pos.z - from.z);
    if (d.lengthSq() > 0.0001) { d.normalize(); this.kb.addScaledVector(d, knock / this.mass); }
    this.game.effects.text(this.center.add(new THREE.Vector3(0, this.height * 0.4, 0)), String(dmg), dmg >= 30 ? '#ffd23a' : '#ffffff', dmg >= 30);
    if (this.state === 'idle' || this.state === 'wander') this.onAggro?.();
    if (this.hp <= 0) { this.hp = 0; this.die(); return true; }
    this.staggerAcc += dmg;
    if (!this.superArmor || this.staggerAcc > (this.staggerAt || 999)) {
      this.staggerAcc = 0;
      if (this.state !== 'roar') this.setState('hurt');
    }
    return true;
  }
  die() {
    this.dead = true;
    this.setState('dead');
    this.game.onEnemyDead(this);
  }
  updateCommon(dt) {
    this.anim.time += dt;
    if (this.flash > 0) this.flash -= dt;
    const f = this.flash > 0 ? 0.8 : 0;
    for (const m of this.mats) m.emissive.setScalar(f);
    const r = this.model.root;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
    const g = Math.max(this.game.floorAt(this.pos.x, this.pos.z), WORLD.water);
    this.shadow.position.set(this.pos.x, g + 0.07, this.pos.z);
    this.shadow.scale.setScalar(this.radius * 1.2);
  }
  dispose() {
    this.game.scene.remove(this.model.root);
    this.game.scene.remove(this.shadow);
  }
  wander(dt) {
    if (!this.wanderTarget || this.t > 6) {
      const a = Math.random() * Math.PI * 2, d = 5 + Math.random() * 18;
      this.wanderTarget = { x: this.home.x + Math.cos(a) * d, z: this.home.z + Math.sin(a) * d, wait: Math.random() * 2 };
      this.t = 0;
    }
    const w = this.wanderTarget;
    const d = Math.hypot(w.x - this.pos.x, w.z - this.pos.z);
    if (d > 1.5 && this.t > w.wait) { this.moveToward(w.x, w.z, this.speed * 0.35, dt); return true; }
    return false;
  }
}

// ---------- 杂兵：巴尔坦星人（近战）/ 暗黑洛普斯（远程） ----------
export class Minion extends Enemy {
  constructor(game, x, z, type, level = 1) {
    const isRobot = type === 'darklops';
    super(game, x, z, {
      type, radius: 0.9, height: 3.2,
      hp: Math.round((isRobot ? 45 : 40) * level), atk: Math.round((isRobot ? 7 : 9) * (0.8 + level * 0.2)),
      speed: isRobot ? 6.5 : 7.5, name: isRobot ? '暗黑洛普斯' : '巴尔坦星人',
    });
    this.attach(isRobot ? buildDarklops() : buildBaltan());
    this.model.root.scale.setScalar(isRobot ? 1.0 : 1.05);
    this.shootCD = 1 + Math.random() * 2;
    this.blinkCD = 4 + Math.random() * 4;
  }
  onAggro() { if (this.state === 'idle' || this.state === 'wander') this.setState('chase'); }
  update(dt) {
    this.t += dt;
    const g = this.game, P = g.player;
    if (this.dead) {
      this.anim.state = 'dead';
      if (this.t > 1.3) { this.pos.y -= dt * 3; }
      if (this.t > 2.2) this.remove = true;
      animateHumanoid(this.model, this.anim, dt);
      this.updateCommon(dt);
      return;
    }
    const d = this.distToPlayer();
    const pAlive = !P.dead && g.state === 'play';
    const yGap = P.pos.y - this.pos.y;
    this.cool -= dt; this.shootCD -= dt; this.blinkCD -= dt;
    const robot = this.type === 'darklops';
    let anim = 'idle';
    switch (this.state) {
      case 'idle': case 'wander':
        if (this.wander(dt)) anim = 'run';
        if (pAlive && d < this.aggro && yGap < 25) { this.setState('chase'); g.effects.text(this.center.add(V().set(0, 1.5, 0)), '!', '#ff4040', true); }
        break;
      case 'chase': {
        if (!pAlive || d > this.aggro * 2) { this.setState('wander'); break; }
        anim = 'run';
        if (robot) {
          if (d > 14) this.moveToward(P.pos.x, P.pos.z, this.speed, dt);
          else if (d < 7) { this.face(P.pos.x, P.pos.z, dt); this.step(this.yaw + Math.PI, this.speed * 0.6, dt); }
          else { this.face(P.pos.x, P.pos.z, dt); this.step(this.yaw + Math.PI / 2, this.speed * 0.4, dt); }
          if (this.shootCD <= 0 && d < 26) { this.setState('cast'); break; }
          if (d < 3 && this.cool <= 0 && yGap < 3) { this.setState('windup'); break; }
        } else {
          this.moveToward(P.pos.x, P.pos.z, this.speed, dt);
          if (d < 2.6 + this.radius && this.cool <= 0 && yGap < 3) { this.setState('windup'); break; }
          if (this.blinkCD <= 0 && d > 12 && d < 30) {
            // 巴尔坦瞬移
            g.effects.burst(this.center, 0x8080ff, 14, 6, 0.5);
            const a = P.yaw + Math.PI + (Math.random() - 0.5);
            this.pos.x = P.pos.x + Math.sin(a) * 4; this.pos.z = P.pos.z + Math.cos(a) * 4;
            g.effects.burst(this.center, 0x8080ff, 14, 6, 0.5);
            this.blinkCD = 7 + Math.random() * 4; this.cool = 0.6;
          }
        }
        break;
      }
      case 'windup':
        anim = 'windup'; this.face(P.pos.x, P.pos.z, dt, 10);
        if (this.t > 0.5) {
          this.setState('strike');
          if (d < 3.4 + this.radius && yGap < 3.5 && this.facingPlayer(1.2)) P.takeDamage(this.atk, this.pos, 10);
        }
        break;
      case 'strike': anim = 'claw'; this.anim.t01 = 0.7; if (this.t > 0.5) { this.cool = 1.2 + Math.random(); this.setState('chase'); } break;
      case 'cast':
        anim = 'raise'; this.face(P.pos.x, P.pos.z, dt, 10);
        if (this.t > 0.6) {
          const from = this.center.add(V().set(Math.sin(this.yaw), 0.8, Math.cos(this.yaw)));
          const to = P.center;
          const dir = to.sub(from).normalize();
          g.spawnProjectile({ pos: from, vel: dir.multiplyScalar(22), owner: 'enemy', dmg: this.atk, radius: 0.5, life: 2.5, color: 0xff3030, size: 0.35 });
          this.shootCD = 2.4 + Math.random() * 1.5;
          this.setState('chase');
        }
        break;
      case 'hurt': anim = 'hurt'; if (this.t > 0.3) this.setState('chase'); break;
    }
    this.physics(dt);
    this.anim.state = anim;
    this.anim.speed01 = 0.8;
    animateHumanoid(this.model, this.anim, dt);
    this.updateCommon(dt);
  }
}

// ---------- 光之塔守护怪兽 ----------
export class Kaiju extends Enemy {
  constructor(game, tower, cfg) {
    super(game, tower.x + 6, tower.z + 14, {
      radius: 2.0 * cfg.scale, height: 5.6 * cfg.scale, hp: cfg.hp, atk: cfg.atk, speed: cfg.speed,
      name: cfg.name, mass: 4, superArmor: true, staggerAt: 70, aggro: 42,
    });
    this.cfg = cfg; this.tower = tower; this.isMini = true;
    this.home.set(tower.x, tower.h, tower.z);
    this.attach(buildKaiju(cfg));
    this.engaged = false;
    this.cool = 1.5;
    this.blinkCD = 6;
  }
  onAggro() { if (!this.engaged) { this.engaged = true; this.setState('roar'); this.game.engageBoss(this); } }
  update(dt) {
    this.t += dt;
    const g = this.game, P = g.player, cfg = this.cfg;
    const a = this.anim;
    if (this.dead) {
      a.state = 'dead';
      if (this.t < 2.2 && Math.random() < dt * 6) g.effects.explosion(this.center.add(V().set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4)), 0xffa040, 2.5, 0.5);
      if (this.t > 2.4) { this.pos.y -= dt * 4; }
      if (this.t > 3.5) this.remove = true;
      animateKaiju(this.model, a, dt); this.updateCommon(dt); return;
    }
    if (this.state !== 'jump') this.airborne = false;
    const d = this.distToPlayer();
    const dHome = Math.hypot(P.pos.x - this.home.x, P.pos.z - this.home.z);
    const pAlive = !P.dead && g.state === 'play';
    const yGap = P.pos.y - this.pos.y;
    this.cool -= dt; this.blinkCD -= dt;
    let anim = 'idle';
    if (this.engaged && (!pAlive || dHome > 90)) { this.engaged = false; this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.5); this.setState('wander'); g.disengageBoss(this); }
    switch (this.state) {
      case 'idle': case 'wander':
        if (this.wander(dt)) anim = 'walk';
        if (pAlive && d < this.aggro && dHome < 70) this.onAggro();
        break;
      case 'roar':
        anim = 'roar'; this.face(P.pos.x, P.pos.z, dt, 4);
        if (this.t < 0.05) { sfx.roar(); g.effects.shake = 0.6; }
        if (this.t > 1.4) this.setState('chase');
        break;
      case 'chase': {
        anim = 'walk';
        const homeD = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
        if (homeD < 65 || Math.hypot(P.pos.x - this.home.x, P.pos.z - this.home.z) < homeD) this.moveToward(P.pos.x, P.pos.z, this.speed, dt);
        else this.face(P.pos.x, P.pos.z, dt);
        if (this.cool <= 0) this.chooseAttack(d, yGap);
        break;
      }
      case 'windup':
        anim = 'windup'; this.face(P.pos.x, P.pos.z, dt, 6);
        if (this.t > 0.65) {
          this.setState('strike');
          sfx.heavy();
          const reach = 4.6 * cfg.scale;
          if (d < reach + 0.8 && yGap < 5 && this.facingPlayer(1.1)) P.takeDamage(this.atk, this.pos, 16);
          g.effects.burst(this.center.add(V().set(Math.sin(this.yaw) * 3, -1.5, Math.cos(this.yaw) * 3)), 0xffe0a0, 12, 8, 0.5);
        }
        break;
      case 'strike': anim = 'strike'; if (this.t > 0.6) { this.cool = 1.0 + Math.random(); this.setState('chase'); } break;
      case 'chargeWind':
        anim = 'roar'; this.face(P.pos.x, P.pos.z, dt, 5);
        if (this.t > 0.8) { this.setState('charge'); this.chargeHit = false; }
        break;
      case 'charge':
        anim = 'charge';
        this.step(this.yaw, 24, dt);
        if (Math.random() < dt * 20) g.effects.burst(V().set(this.pos.x, this.pos.y + 0.3, this.pos.z), 0xc8a46e, 2, 4, 0.5);
        if (!this.chargeHit && d < this.radius + 1.6 && yGap < 4) { this.chargeHit = true; P.takeDamage(this.atk * 1.3, this.pos, 26); }
        if (this.t > 1.2) { this.cool = 1.6; this.setState('chase'); }
        break;
      case 'jump': {
        anim = 'jump';
        this.airborne = true;
        const u = Math.min(1, this.t / 0.9);
        this.pos.x = this.jumpFrom.x + (this.jumpTo.x - this.jumpFrom.x) * u;
        this.pos.z = this.jumpFrom.z + (this.jumpTo.z - this.jumpFrom.z) * u;
        const gy = groundHeight(this.pos.x, this.pos.z);
        this.pos.y = gy + Math.sin(u * Math.PI) * 12;
        if (u >= 1) {
          this.airborne = false;
          this.setState('strike');
          g.shockwave(V().set(this.pos.x, gy, this.pos.z), 13, 0.7, this.atk, 0xffc080);
          sfx.heavy(); g.effects.shake = 0.8;
        }
        break;
      }
      case 'cast':
        anim = 'cast'; this.face(P.pos.x, P.pos.z, dt, 6);
        this.castUpdate(dt, d);
        break;
      case 'hurt': anim = 'walk'; this.anim.state = 'hurt'; anim = 'hurt'; if (this.t > 0.5) this.setState('chase'); break;
    }
    this.physics(dt);
    a.state = anim;
    animateKaiju(this.model, a, dt);
    this.updateCommon(dt);
  }
  chooseAttack(d, yGap) {
    const cfg = this.cfg, P = this.game.player;
    const r = Math.random();
    if (cfg.teleport && this.blinkCD <= 0 && d > 10) {
      const g = this.game;
      g.effects.burst(this.center, 0xffe23a, 20, 8, 0.6);
      const a = P.yaw + Math.PI;
      this.pos.x = P.pos.x + Math.sin(a) * 7; this.pos.z = P.pos.z + Math.cos(a) * 7;
      g.effects.burst(this.center, 0xffe23a, 20, 8, 0.6);
      this.blinkCD = 7; this.cool = 0.4;
      return;
    }
    if (d < 5.5 * cfg.scale && yGap < 5) { this.setState('windup'); return; }
    if (cfg.charge && d > 8 && d < 40 && r < 0.6) { this.setState('chargeWind'); sfx.roar(); return; }
    if (cfg.slam && d > 6 && d < 30 && r < 0.4) {
      this.setState('jump'); this.jumpFrom = this.pos.clone(); this.jumpTo = P.pos.clone();
      this.game.effects.telegraphCircle(P.pos.x, groundHeight(P.pos.x, P.pos.z), P.pos.z, 13, 0.9, 0xff8040);
      return;
    }
    if (cfg.ranged && d > 6 && d < 45) { this.setState('cast'); this.castStage = 0; return; }
    if (d < 10) { this.setState('windup'); return; }
    this.cool = 0.4;
  }
  castUpdate(dt, d) {
    const g = this.game, P = g.player, cfg = this.cfg;
    const mouth = () => this.center.add(V().set(Math.sin(this.yaw) * 2, this.height * 0.35, Math.cos(this.yaw) * 2));
    if (cfg.ranged === 'rock') {
      if (this.t > 0.8 && this.castStage === 0) {
        this.castStage = 1;
        // 抛出岩石：落点预警
        for (let i = 0; i < 3; i++) {
          const tx = P.pos.x + (i === 0 ? 0 : (Math.random() - 0.5) * 12), tz = P.pos.z + (i === 0 ? 0 : (Math.random() - 0.5) * 12);
          const ty = groundHeight(tx, tz);
          const from = mouth();
          const T = 1.1 + i * 0.15;
          const vel = V().set((tx - from.x) / T, (ty - from.y) / T + 0.5 * 30 * T, (tz - from.z) / T);
          g.effects.telegraphCircle(tx, ty, tz, 3.5, T, 0xff8040);
          g.spawnProjectile({ pos: from, vel, owner: 'enemy', dmg: this.atk, radius: 1.2, life: T + 0.3, color: 0x8a6a4a, size: 1.0, gravity: 30, rock: true, aoe: 3.5, solid: true });
        }
      }
      if (this.t > 1.3) { this.cool = 1.6; this.setState('chase'); }
    } else if (cfg.ranged === 'electric') {
      if (this.castStage === 0) {
        this.castStage = 1;
        this.beamDir = P.center.sub(mouth()).normalize();
        this.tele = g.effects.telegraphLine(V().set(this.pos.x, this.pos.y + 0.3, this.pos.z), V().set(this.beamDir.x, 0, this.beamDir.z).normalize(), 34, 2.4, 0.9, 0xffe040);
      }
      if (this.t > 0.9 && this.castStage === 1) {
        this.castStage = 2;
        g.spawnBeam({ owner: 'enemy', origin: mouth(), dir: this.beamDir, length: 34, width: 1.2, dmg: this.atk * 1.2, life: 0.5, color: 0xfff060, core: 0xffffff });
        sfx.beam();
      }
      if (this.t > 1.5) { this.cool = 1.8; this.setState('chase'); }
    } else if (cfg.ranged === 'fireball') {
      if (this.t > 0.7 && this.castStage === 0) {
        this.castStage = 1;
        const from = mouth();
        for (let i = -1; i <= 1; i++) {
          const dir = P.center.sub(from).normalize();
          dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.25);
          g.spawnProjectile({ pos: from.clone(), vel: dir.multiplyScalar(17), owner: 'enemy', dmg: this.atk, radius: 1.0, life: 3, color: 0xff7a20, size: 0.8, homing: 1.2 });
        }
        sfx.beam();
      }
      if (this.t > 1.2) { this.cool = 1.5; this.setState('chase'); }
    } else { this.setState('chase'); }
  }
}

// ---------- 大Boss：极恶贝利亚 ----------
export class Belial extends Enemy {
  constructor(game, arena) {
    super(game, arena.x, arena.z - 25, {
      radius: 1.6, height: 4.3, hp: 1400, atk: 18, speed: 9, name: '极恶贝利亚', mass: 6, superArmor: true, staggerAt: 140, aggro: 0,
    });
    this.arena = arena;
    this.isBoss = true;
    this.attach(buildBelial());
    this.scale = 1.35;
    this.model.root.scale.setScalar(this.scale);
    this.yaw = 0;
    this.phase = 1;
    this.setState('dormant');
    this.combo = 0;
    this.summonCD = 10;
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x8a0020, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    game.scene.add(this.aura);
  }
  dispose() { super.dispose(); this.game.scene.remove(this.aura); }
  get reach() { return 2.4 * this.scale; }
  reset() {
    this.hp = this.maxHp; this.phase = 1; this.scale = 1.35; this.model.root.scale.setScalar(this.scale);
    this.radius = 1.6; this.height = 4.3; this.name = '极恶贝利亚';
    this.pos.set(this.arena.x, this.arena.h, this.arena.z - 25); this.yaw = 0;
    this.dead = false; this.remove = false; this.invulnerable = false;
    this.aura.material.opacity = 0;
    this.setState('dormant');
  }
  wake() { this.setState('intro'); }
  takeDamage(dmg, from, knock) {
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'transform') return false;
    const r = super.takeDamage(dmg, from, knock * 0.5);
    if (!this.dead && this.phase === 1 && this.hp < this.maxHp * 0.5) { this.setState('transform'); this.invulnerable = true; }
    return r;
  }
  die() {
    this.dead = true; this.setState('dead');
    this.game.onBossDefeated(this);
  }
  update(dt) {
    this.t += dt;
    const g = this.game, P = g.player, a = this.anim;
    const d = this.distToPlayer();
    const yGap = P.pos.y - this.pos.y;
    let anim = 'idle';
    this.cool -= dt; this.summonCD -= dt;
    const auraOn = this.phase === 2 ? 0.07 + Math.sin(this.anim.time * 6) * 0.03 : 0;
    this.aura.material.opacity += (auraOn - this.aura.material.opacity) * 0.1;
    this.aura.position.copy(this.center);
    this.aura.scale.setScalar(this.height * 0.62);
    if (this.phase === 2 && Math.random() < dt * 12) g.effects.burst(this.center.add(V().set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3)), 0xff1040, 1, 3, 0.8, -3);

    switch (this.state) {
      case 'dormant': anim = 'idle'; break;
      case 'intro':
        anim = this.t < 2.2 ? 'raise' : 'idle';
        this.face(P.pos.x, P.pos.z, dt, 4);
        if (this.t < 0.05) sfx.laugh();
        if (this.t > 3.2) { this.setState('chase'); this.cool = 0.8; }
        break;
      case 'chase': {
        if (P.dead || g.state !== 'play') { anim = 'idle'; break; }
        anim = 'run';
        if (d > this.reach + 1.5) this.moveToward(P.pos.x, P.pos.z, this.speed * (this.phase === 2 ? 1.25 : 1), dt);
        else this.face(P.pos.x, P.pos.z, dt);
        if (this.cool <= 0) this.choose(d, yGap);
        break;
      }
      case 'windup':
        anim = 'claw'; a.t01 = 0.2; this.face(P.pos.x, P.pos.z, dt, 12);
        if (this.t > (this.phase === 2 ? 0.28 : 0.38)) {
          this.setState('slash');
          sfx.swing();
          this.step(this.yaw, 0, dt);
          const reach = this.reach + 1.4;
          if (d < reach + 0.8 && Math.abs(yGap) < 4 && this.facingPlayer(1.2)) P.takeDamage(this.atk, this.pos, 14);
          g.effects.burst(this.center.add(V().set(Math.sin(this.yaw) * 2.5, 0, Math.cos(this.yaw) * 2.5)), 0xff2040, 14, 9, 0.4);
        }
        break;
      case 'slash':
        anim = 'claw'; a.t01 = 0.8;
        if (this.t < 0.15) this.step(this.yaw, 16, dt);
        if (this.t > 0.32) {
          this.combo--;
          if (this.combo > 0) this.setState('windup');
          else { this.cool = this.phase === 2 ? 0.5 : 0.9; this.setState('chase'); }
        }
        break;
      case 'vanish':
        anim = 'idle';
        this.model.root.visible = false;
        if (this.t > 0.45) {
          const ang = P.yaw + Math.PI + (Math.random() - 0.5) * 0.8;
          this.pos.x = P.pos.x + Math.sin(ang) * 4; this.pos.z = P.pos.z + Math.cos(ang) * 4;
          this.clampArena();
          this.yaw = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
          this.model.root.visible = true;
          g.effects.burst(this.center, 0xb01040, 30, 9, 0.6);
          this.combo = 1; this.setState('windup'); this.t = -0.15;
        }
        break;
      case 'deathshoot': {
        anim = 'special'; a.kind = 'beam'; a.t01 = Math.min(1, 0.35 + this.t / 1.6);
        const lockAt = this.phase === 2 ? 0.5 : 0.65;
        if (this.t < lockAt) { this.face(P.pos.x, P.pos.z, dt, 10); }
        else if (!this.locked) {
          this.locked = true;
          const from = this.beamOrigin();
          this.beamDir = P.center.sub(from).normalize();
          g.effects.telegraphLine(V().set(this.pos.x, this.pos.y + 0.4, this.pos.z), V().set(this.beamDir.x, 0, this.beamDir.z).normalize(), 70, 3.2, 0.45, 0xff0030);
          sfx.warn();
        }
        if (this.t > lockAt + 0.45 && !this.fired) {
          this.fired = true;
          g.spawnBeam({ owner: 'enemy', origin: this.beamOrigin(), dir: this.beamDir, length: 70, width: 1.5, dmg: this.atk * 1.3, life: 0.6, color: 0xff1030, core: 0xffd0d0 });
          sfx.beam(); g.effects.shake = 0.5;
        }
        if (this.t > lockAt + 1.2) { this.cool = 0.8; this.setState('chase'); }
        break;
      }
      case 'slam':
        anim = this.t < 0.6 ? 'windup' : 'strike';
        if (this.t > 0.6 && !this.fired) {
          this.fired = true;
          g.shockwave(V().set(this.pos.x, this.pos.y, this.pos.z), this.phase === 2 ? 30 : 22, 1.3, this.atk, 0xff2050);
          if (this.phase === 2) g.later(0.65, () => { if (!this.dead && g.bossFight) g.shockwave(V().set(this.pos.x, this.pos.y, this.pos.z), 30, 1.3, this.atk, 0xff2050); });
          sfx.heavy(); g.effects.shake = 0.9;
        }
        if (this.t > 1.2) { this.cool = 0.7; this.setState('chase'); }
        break;
      case 'meteor':
        anim = 'raise';
        if (this.t > 0.5 && !this.fired) {
          this.fired = true;
          sfx.laugh();
          for (let i = 0; i < 9; i++) {
            const delay = 0.9 + i * 0.18;
            const ang = Math.random() * Math.PI * 2, rr = i === 0 ? 0 : 3 + Math.random() * 12;
            const lead = i < 3 ? 0 : 1;
            const x = P.pos.x + Math.cos(ang) * rr + P.vel.x * 0.4 * lead, z = P.pos.z + Math.sin(ang) * rr + P.vel.z * 0.4 * lead;
            g.hazard({ x, z, r: 4, delay, dmg: this.atk * 0.9, color: 0xff2040 });
          }
        }
        if (this.t > 1.6) { this.cool = 1.0; this.setState('chase'); }
        break;
      case 'summon':
        anim = 'raise';
        if (this.t > 0.6 && !this.fired) {
          this.fired = true;
          for (let i = 0; i < 3; i++) {
            const ang = i / 3 * Math.PI * 2;
            g.spawnMinionAt(this.arena.x + Math.cos(ang) * 30, this.arena.z + Math.sin(ang) * 30, 'darklops', 1.4, true);
          }
          g.ui.toast('贝利亚召唤了暗黑洛普斯军团！', 2);
        }
        if (this.t > 1.3) { this.cool = 0.5; this.setState('chase'); }
        break;
      case 'transform':
        anim = 'raise';
        if (this.t < 0.05) {
          sfx.roar(); g.effects.shake = 1.2;
          g.ui.dialog('极恶贝利亚', '哈哈哈哈！有意思……就让你见识一下我真正的力量吧！', 3.2);
        }
        this.scale = 1.35 + Math.min(1, this.t / 2) * 0.75;
        this.model.root.scale.setScalar(this.scale);
        this.radius = 1.6 * this.scale / 1.35; this.height = 4.3 * this.scale / 1.35;
        if (Math.random() < dt * 6) g.effects.explosion(this.center.add(V().set((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6)), 0xff1040, 1.6, 0.4);
        if (this.t > 2.6) {
          this.phase = 2; this.invulnerable = false; this.name = '极恶贝利亚 · 觉醒';
          this.speed = 10; this.atk = 22;
          g.shockwave(this.pos.clone(), 26, 0.9, 10, 0xff0030);
          g.ui.setBoss(this);
          this.setState('chase'); this.cool = 0.5;
        }
        break;
      case 'hurt': anim = 'hurt'; if (this.t > 0.55) { this.setState('chase'); this.cool = Math.min(this.cool, 0.2); } break;
      case 'dead':
        anim = 'dead';
        if (this.t < 3 && Math.random() < dt * 10) g.effects.explosion(this.center.add(V().set((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6)), Math.random() < 0.5 ? 0xff2040 : 0xffb040, 3, 0.6);
        if (this.t > 3.2) { this.model.root.visible = false; this.aura.visible = false; }
        break;
    }
    if (this.state !== 'vanish' && this.state !== 'dead') this.model.root.visible = true;
    this.physics(dt);
    this.clampArena();
    a.state = anim; a.speed01 = 1;
    if (anim === 'run') a.phase += dt * 4;
    animateHumanoid(this.model, a, dt);
    this.updateCommon(dt);
  }
  clampArena() {
    const dx = this.pos.x - this.arena.x, dz = this.pos.z - this.arena.z;
    const l = Math.hypot(dx, dz), R = 50;
    if (l > R) { this.pos.x = this.arena.x + dx / l * R; this.pos.z = this.arena.z + dz / l * R; }
  }
  beamOrigin() { return this.center.add(V().set(Math.sin(this.yaw) * 1.2 * this.scale, this.height * 0.12, Math.cos(this.yaw) * 1.2 * this.scale)); }
  choose(d, yGap) {
    this.fired = false; this.locked = false;
    const r = Math.random();
    const p2 = this.phase === 2;
    if (p2 && this.summonCD <= 0 && this.game.countArenaMinions() < 2) { this.summonCD = 22; this.setState('summon'); return; }
    if (yGap > 6) { this.setState('deathshoot'); return; } // 玩家飞在空中就用光线打
    if (d < this.reach + 2.5) {
      if (r < 0.55) { this.combo = p2 ? 4 : 3; this.setState('windup'); }
      else if (r < 0.8) this.setState('slam');
      else { this.setState('vanish'); this.game.effects.burst(this.center, 0xb01040, 30, 9, 0.6); }
      return;
    }
    if (d < 18) {
      if (r < 0.35) { this.setState('vanish'); this.game.effects.burst(this.center, 0xb01040, 30, 9, 0.6); }
      else if (r < 0.6) this.setState('deathshoot');
      else if (p2 && r < 0.8) this.setState('meteor');
      else { this.cool = 0.3; }
      return;
    }
    if (r < 0.45) this.setState('deathshoot');
    else if (p2 && r < 0.75) this.setState('meteor');
    else { this.setState('vanish'); this.game.effects.burst(this.center, 0xb01040, 30, 9, 0.6); }
  }
}
