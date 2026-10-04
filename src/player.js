import * as THREE from 'three';
import { buildHero, animateHumanoid } from './models.js';
import { groundHeight } from './terrain.js';
import { sfx } from './audio.js';
import { WORLD } from './data.js';

const GRAV = 34;

export class Player {
  constructor(game, def, upgrades) {
    this.game = game;
    this.def = def;
    this.model = buildHero(def);
    game.scene.add(this.model.root);
    this.pos = new THREE.Vector3(0, 6, 30);
    this.vel = new THREE.Vector3();
    this.kb = new THREE.Vector3();
    this.yaw = Math.PI;
    this.maxHp = def.stats.hp + (upgrades.hp || 0);
    this.hp = this.maxHp;
    this.atk = def.stats.atk + (upgrades.atk || 0);
    this.maxEnergy = 100; this.energy = 60;
    this.maxStamina = 100; this.stamina = 100;
    this.staminaDelay = 0;
    this.grounded = false; this.flying = false; this.airT = 0;
    this.action = null; this.actionT = 0; this.actionDur = 0;
    this.combo = 0; this.comboQueued = false; this.hitDone = false;
    this.invuln = 0;
    this.anim = { state: 'idle', time: 0, phase: 0, t01: 0, combo: 0, kind: def.special.kind };
    this.radius = 0.8; this.height = 3.2;
    this.timerBeep = 0;
    this.slugOut = 0;
    this.inWater = false;
    // 圆形阴影
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    game.scene.add(this.shadow);
  }

  get center() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.7, this.pos.z); }
  get dead() { return this.action === 'dead'; }
  forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  setUpgrades(up) {
    const ratio = this.hp / this.maxHp;
    this.maxHp = this.def.stats.hp + (up.hp || 0);
    this.hp = Math.min(this.maxHp, Math.max(1, Math.round(this.maxHp * ratio)));
    this.atk = this.def.stats.atk + (up.atk || 0);
  }

  respawn(p) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.kb.set(0, 0, 0);
    this.hp = this.maxHp; this.energy = 60; this.stamina = this.maxStamina;
    this.action = null; this.invuln = 2; this.flying = false;
    this.model.root.visible = true;
  }

  startAction(name, dur) { this.action = name; this.actionT = 0; this.actionDur = dur; }

  faceTarget(range) {
    const t = this.game.findTarget(this.pos, range, this.yaw);
    if (t) this.yaw = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
    return t;
  }

  startAttack(c) {
    this.combo = c; this.comboQueued = false; this.hitDone = false;
    this.startAction('attack', c === 2 ? 0.46 : 0.3);
    this.faceTarget(9);
    sfx.swing();
  }

  takeDamage(dmg, from, knock = 10) {
    if (this.dead || this.invuln > 0 || this.action === 'dodge' || this.game.state !== 'play') return false;
    dmg = Math.round(dmg);
    this.hp -= dmg;
    this.invuln = 0.75;
    const d = new THREE.Vector3(this.pos.x - from.x, 0, this.pos.z - from.z);
    if (d.lengthSq() < 0.001) d.set(0, 0, 1);
    d.normalize().multiplyScalar(knock);
    this.kb.copy(d);
    this.game.effects.text(this.center, '-' + dmg, '#ff5a5a');
    this.game.effects.burst(this.center, 0xff6040, 10, 7, 0.5);
    this.game.effects.shake = Math.max(this.game.effects.shake, Math.min(0.9, dmg / 25));
    this.game.ui.hurtFlash();
    sfx.hurt();
    if (this.hp <= 0) {
      this.hp = 0;
      this.startAction('dead', 3);
      this.game.onPlayerDead();
    } else if (dmg >= 8 && this.action !== 'special') {
      this.startAction('hurt', 0.35);
      if (!this.grounded) this.vel.y = Math.min(this.vel.y, 2);
    }
    return true;
  }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  update(dt, input, camYaw) {
    const g = this.game;
    this.anim.time += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.action) this.actionT += dt;

    // 能量 & 体力恢复
    this.energy = Math.min(this.maxEnergy, this.energy + dt * 3);
    this.staminaDelay -= dt;

    const canAct = !this.action || this.action === 'attack';
    const mv = input.move;
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let dx = rx * mv.x + fx * mv.y, dz = rz * mv.x + fz * mv.y;
    const mag = Math.min(1, Math.hypot(dx, dz));
    if (mag > 0.01) { const l = Math.hypot(dx, dz); dx /= l; dz /= l; }

    // ---- 输入 ----
    if (!this.dead && g.state === 'play') {
      if (input.consume('attack')) {
        if (this.action === 'attack') { if (this.actionT > this.actionDur * 0.3) this.comboQueued = true; }
        else if (!this.action) this.startAttack(0);
      }
      if (input.consume('special')) this.trySpecial();
      if (input.consume('dodge') && (canAct || this.action === 'hurt') && this.stamina >= 12) {
        this.startAction('dodge', 0.42);
        let ddx = dx, ddz = dz;
        if (mag < 0.1) { ddx = -Math.sin(this.yaw); ddz = -Math.cos(this.yaw); }
        else this.yaw = Math.atan2(ddx, ddz);
        this.vel.x = ddx * 26; this.vel.z = ddz * 26;
        this.stamina -= 15; this.staminaDelay = 0.6;
        this.invuln = Math.max(this.invuln, 0.42);
        sfx.dodge();
      }
      if (input.consume('jump') && (!this.action || this.action === 'attack')) {
        if (this.grounded) {
          this.vel.y = 15; this.grounded = false; this.airT = 0; this.action = null;
          sfx.jump();
        } else if (!this.flying && this.stamina > 5) {
          this.flying = true; this.vel.y = Math.max(this.vel.y, 4);
        }
      }
    } else {
      input.consume('attack'); input.consume('special'); input.consume('dodge'); input.consume('jump');
    }

    // ---- 行动状态 ----
    let speedMul = 1, lockMove = false;
    if (this.action === 'attack') {
      const u = this.actionT / this.actionDur;
      speedMul = 0;
      if (u < 0.45) { const f = this.forward(); this.vel.x = f.x * 7; this.vel.z = f.z * 7; } else { this.vel.x *= 0.8; this.vel.z *= 0.8; }
      lockMove = true;
      if (!this.hitDone && u >= 0.42) { this.hitDone = true; g.playerMelee(this, this.combo); }
      if (u >= 1) {
        if (this.comboQueued) this.startAttack((this.combo + 1) % 3);
        else this.action = null;
      }
    } else if (this.action === 'special') {
      lockMove = true; this.vel.x *= 0.85; this.vel.z *= 0.85;
      if (!this.flying && !this.grounded) this.vel.y = Math.max(this.vel.y, -2);
      if (this.flying) this.vel.y *= 0.8;
      if (!this.fired && this.actionT >= (this.def.special.kind === 'slugger' ? 0.22 : 0.38)) {
        this.fired = true;
        g.playerSpecial(this);
      }
      if (this.actionT >= this.actionDur) this.action = null;
    } else if (this.action === 'dodge') {
      lockMove = true;
      if (this.actionT >= this.actionDur) { this.action = null; this.vel.x *= 0.3; this.vel.z *= 0.3; }
    } else if (this.action === 'hurt') {
      lockMove = true; this.vel.x *= 0.85; this.vel.z *= 0.85;
      if (this.actionT >= this.actionDur) this.action = null;
    } else if (this.action === 'dead') {
      lockMove = true; this.vel.x = this.vel.z = 0;
    }

    // ---- 移动 ----
    const ground = groundHeight(this.pos.x, this.pos.z);
    this.inWater = ground < WORLD.water - 0.4 && this.pos.y < 1;
    let sprinting = false;
    if (!lockMove) {
      let speed = 11 * this.def.stats.speed;
      if (this.flying) speed *= 2.3;
      else if (input.sprintHeld && this.stamina > 0 && mag > 0.1) {
        sprinting = true; speed *= 1.7;
        this.stamina -= 20 * dt; this.staminaDelay = 0.6;
      }
      if (this.inWater) speed *= 0.6;
      const tx = dx * speed * mag * speedMul, tz = dz * speed * mag * speedMul;
      const acc = this.grounded ? 14 : (this.flying ? 4 : 3);
      const k = 1 - Math.exp(-acc * dt);
      this.vel.x += (tx - this.vel.x) * k;
      this.vel.z += (tz - this.vel.z) * k;
      if (mag > 0.1) {
        const target = Math.atan2(dx, dz);
        let diff = target - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * (1 - Math.exp(-14 * dt));
      }
    }

    // 飞行
    if (!this.grounded) {
      this.airT += dt;
      if (input.jumpHeld && this.airT > 0.25 && this.stamina > 0 && !this.dead && this.action !== 'hurt') this.flying = true;
      if (this.flying) {
        if (this.stamina <= 0 || this.dead) this.flying = false;
      }
    }
    if (this.flying && this.action !== 'special') {
      if (input.jumpHeld) { this.vel.y += (11 - this.vel.y) * (1 - Math.exp(-4 * dt)); this.stamina -= 13 * dt; }
      else { this.vel.y += (-5 - this.vel.y) * (1 - Math.exp(-3 * dt)); this.stamina -= 5 * dt; }
      this.staminaDelay = 0.6;
      if (this.pos.y > ground + 70 || this.pos.y > 175) this.vel.y = Math.min(this.vel.y, 0);
    } else if (!this.grounded && this.action !== 'special') {
      this.vel.y -= GRAV * dt;
    }
    if (!this.flying && !sprinting && this.staminaDelay <= 0) this.stamina = Math.min(this.maxStamina, this.stamina + 32 * dt);
    this.stamina = Math.max(0, this.stamina);

    // 击退
    this.kb.multiplyScalar(Math.exp(-6 * dt));
    this.pos.x += (this.vel.x + this.kb.x) * dt;
    this.pos.z += (this.vel.z + this.kb.z) * dt;
    this.pos.y += this.vel.y * dt;

    g.resolveCollisions(this.pos, this.radius, true);

    const lim = WORLD.half - 30;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));
    const nfloor = g.floorAt(this.pos.x, this.pos.z);
    const ng = Math.max(nfloor, WORLD.water);
    if (this.pos.y <= nfloor) {
      if (!this.grounded && this.vel.y < -22) { g.effects.ring(new THREE.Vector3(this.pos.x, nfloor + 0.2, this.pos.z), 0xffffff, 4, 0.4, 0.2); g.effects.shake = 0.3; }
      this.pos.y = nfloor; this.vel.y = 0;
      if (!this.grounded) { this.grounded = true; this.flying = false; }
    } else if (this.pos.y > nfloor + 0.35 || this.vel.y > 0) {
      this.grounded = false;
    } else {
      this.pos.y = nfloor; // 贴地走下坡
    }
    if (this.inWater && Math.random() < Math.hypot(this.vel.x, this.vel.z) * dt * 0.8) g.effects.burst(new THREE.Vector3(this.pos.x, 0.2, this.pos.z), 0xbfe6ff, 4, 4, 0.5, 10);

    // 彩色计时器
    const low = this.hp / this.maxHp < 0.3 && !this.dead;
    const timer = this.model.parts.timer;
    if (timer) {
      if (low) {
        const on = Math.floor(this.anim.time * 4) % 2 === 0;
        timer.material.color.setHex(on ? 0xff2020 : 0x550000);
        this.timerBeep -= dt;
        if (this.timerBeep <= 0) { sfx.timer(); this.timerBeep = 0.5; }
      } else timer.material.color.setHex(0x45c8ff);
    }

    // ---- 动画 ----
    const a = this.anim;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.action === 'attack') { a.state = 'attack'; a.t01 = this.actionT / this.actionDur; a.combo = this.combo; }
    else if (this.action === 'special') { a.state = 'special'; a.t01 = this.actionT / this.actionDur; }
    else if (this.action) { a.state = this.action; a.t01 = Math.min(1, this.actionT / this.actionDur); }
    else if (!this.grounded) a.state = this.flying ? 'fly' : 'air';
    else if (hs > 1) { a.state = 'run'; a.phase += dt * (4 + hs * 0.45); a.speed01 = Math.min(1, hs / 11); }
    else a.state = 'idle';
    if (g.state === 'victory') a.state = 'victory';
    animateHumanoid(this.model, a, dt);
    const r = this.model.root;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
    r.visible = !(this.invuln > 0 && this.action !== 'dodge' && !this.dead && Math.floor(this.invuln * 14) % 2 === 0);
    if (this.model.parts.slugger) for (const s of this.model.parts.slugger) s.visible = this.slugOut <= 0;

    const sh = this.shadow;
    sh.position.set(this.pos.x, ng + 0.08, this.pos.z);
    const hgt = this.pos.y - ng;
    sh.scale.setScalar(Math.max(0.3, 1.1 - hgt * 0.02));
    sh.material.opacity = Math.max(0.08, 0.35 - hgt * 0.006);
  }

  trySpecial() {
    const sp = this.def.special;
    if (this.action && this.action !== 'attack') return;
    if (this.energy < sp.cost) { this.game.ui.toast('能量不足！攻击敌人可以积攒能量', 1.2); return; }
    if (sp.kind === 'slugger' && this.slugOut > 0) return;
    this.energy -= sp.cost;
    this.fired = false;
    this.startAction('special', sp.kind === 'slugger' ? 0.6 : 1.2);
    this.faceTarget(45);
    this.game.ui.callout(sp.name);
  }
}
