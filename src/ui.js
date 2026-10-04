import { TOWERS, CASTLE, WORLD } from './data.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.el = {
      hpFill: $('hp-fill'), hpText: $('hp-text'), enFill: $('en-fill'), enText: $('en-text'),
      stamina: $('stamina'), staminaArc: $('stamina-arc'), shards: $('shards'), objective: $('objective'),
      bossBar: $('boss-bar'), bossName: $('boss-name'), bossFill: $('boss-fill'), bossLag: $('boss-lag'),
      dialog: $('dialog'), dSpeaker: $('dialog-speaker'), dText: $('dialog-text'),
      toast: $('toast'), callout: $('callout'), hurt: $('hurt-flash'), minimap: $('minimap'), heroName: $('hero-name'),
      spBtn: $('btn-special'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.dialogQueue = []; this.dialogT = 0; this.dialogTyping = 0;
    this.toastT = 0; this.calloutT = 0;
    this.boss = null; this.bossLag = 1;
    this.mapBig = false;
    this.el.minimap.addEventListener('click', () => this.toggleMap());
    this.el.dialog.addEventListener('click', () => this.skipDialog());
  }

  screen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('show', s.id === id));
  }
  hud(on) { document.body.classList.toggle('playing', on); }

  toggleMap() { this.mapBig = !this.mapBig; this.el.minimap.classList.toggle('big', this.mapBig); }

  setShards(ids) {
    this.el.shards.innerHTML = TOWERS.map(t => `<span class="shard ${ids.includes(t.id) ? 'on' : ''}" title="${t.name}"></span>`).join('');
  }
  setHero(def) { this.el.heroName.textContent = def.name; this.el.spBtn.querySelector('small').textContent = def.special.name.slice(0, 5); }

  dialog(speaker, text, dur = 4) {
    this.dialogQueue.push({ speaker, text, dur });
    if (this.dialogQueue.length === 1) this._showDialog();
  }
  _showDialog() {
    const d = this.dialogQueue[0];
    if (!d) { this.el.dialog.classList.remove('show'); return; }
    this.el.dSpeaker.textContent = d.speaker;
    this.el.dText.textContent = '';
    this.el.dialog.classList.add('show');
    this.dialogT = d.dur; this.dialogTyping = 0;
  }
  skipDialog() {
    const d = this.dialogQueue[0]; if (!d) return;
    if (this.dialogTyping < d.text.length) this.dialogTyping = d.text.length;
    else { this.dialogQueue.shift(); this._showDialog(); }
  }
  clearDialog() { this.dialogQueue = []; this.el.dialog.classList.remove('show'); }

  toast(text, dur = 2.5) { this.el.toast.textContent = text; this.el.toast.classList.add('show'); this.toastT = dur; }
  callout(text) {
    const c = this.el.callout; c.textContent = text;
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
    this.calloutT = 1.4;
  }
  hurtFlash() { const h = this.el.hurt; h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); }

  setBoss(e) {
    this.boss = e;
    this.el.bossBar.classList.toggle('show', !!e);
    if (e) { this.el.bossName.textContent = e.name; this.bossLag = e.hp / e.maxHp; }
  }

  setObjective(t) { this.el.objective.innerHTML = t; }

  update(dt) {
    const p = this.game.player;
    if (p) {
      this.el.hpFill.style.width = (p.hp / p.maxHp * 100) + '%';
      this.el.hpFill.classList.toggle('low', p.hp / p.maxHp < 0.3);
      this.el.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
      this.el.enFill.style.width = (p.energy / p.maxEnergy * 100) + '%';
      this.el.enFill.classList.toggle('ready', p.energy >= p.def.special.cost);
      this.el.spBtn.classList.toggle('ready', p.energy >= p.def.special.cost);
      const s = p.stamina / p.maxStamina;
      this.el.stamina.classList.toggle('show', s < 0.999);
      this.el.stamina.classList.toggle('empty', s < 0.2);
      this.el.staminaArc.style.strokeDashoffset = String(113 * (1 - s));
    }
    // 对话打字机
    const d = this.dialogQueue[0];
    if (d) {
      if (this.dialogTyping < d.text.length) {
        this.dialogTyping += dt * 28;
        this.el.dText.textContent = d.text.slice(0, Math.floor(this.dialogTyping));
      } else {
        this.el.dText.textContent = d.text;
        this.dialogT -= dt;
        if (this.dialogT <= 0) { this.dialogQueue.shift(); this._showDialog(); }
      }
    }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('show'); }
    if (this.boss) {
      const f = Math.max(0, this.boss.hp / this.boss.maxHp);
      this.el.bossFill.style.width = f * 100 + '%';
      this.bossLag += (f - this.bossLag) * Math.min(1, dt * 2);
      if (this.bossLag < f) this.bossLag = f;
      this.el.bossLag.style.width = this.bossLag * 100 + '%';
      this.el.bossName.textContent = this.boss.name;
    }
  }

  drawMinimap(mapBase) {
    const g = this.game, ctx = this.mm, cv = this.el.minimap;
    const S = cv.width;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(mapBase, 0, 0, S, S);
    const toM = (x, z) => [(x + WORLD.half) / (WORLD.half * 2) * S, (z + WORLD.half) / (WORLD.half * 2) * S];
    const k = S / 160;
    // 塔
    for (const t of TOWERS) {
      const [x, y] = toM(t.x, t.z);
      const done = g.save.shards.includes(t.id);
      ctx.fillStyle = done ? '#7fe8ff' : '#ffb020';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y - 6 * k); ctx.lineTo(x + 4 * k, y); ctx.lineTo(x, y + 6 * k); ctx.lineTo(x - 4 * k, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // 城堡
    {
      const [x, y] = toM(CASTLE.x, CASTLE.z);
      ctx.fillStyle = g.save.boss ? '#9a9a9a' : '#d01030';
      ctx.font = `bold ${Math.round(12 * k)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.beginPath(); ctx.arc(x, y, 7 * k, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText('☠', x, y + 0.5);
    }
    // 宝箱
    for (const c of g.chests) {
      if (c.opened) continue;
      const [x, y] = toM(c.x, c.z);
      ctx.fillStyle = '#ffd84a'; ctx.fillRect(x - 2 * k, y - 1.5 * k, 4 * k, 3 * k);
    }
    // 敌人
    ctx.fillStyle = '#ff3a3a';
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z) > 120 && !e.isMini) continue;
      const [x, y] = toM(e.pos.x, e.pos.z);
      ctx.beginPath(); ctx.arc(x, y, (e.isMini || e.isBoss ? 3.5 : 1.8) * k, 0, Math.PI * 2); ctx.fill();
    }
    // 玩家
    const [px, py] = toM(g.player.pos.x, g.player.pos.z);
    ctx.translate(px, py);
    ctx.rotate(-g.player.yaw + Math.PI);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#d01020'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -7 * k); ctx.lineTo(5 * k, 5 * k); ctx.lineTo(0, 2.5 * k); ctx.lineTo(-5 * k, 5 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(11 * k)}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('N', S / 2, 12 * k);
  }
}
