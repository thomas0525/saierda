// 分镜导演：在游戏页面内运行，按时间线摆位、放技能、叠字幕，并记录声音事件
(() => {
  const P = window.__promo, g = window.__game, M = P.mods;
  const Vec = g.camera.position.constructor;
  const v3 = (x = 0, y = 0, z = 0) => new Vec(x, y, z);
  const { CASTLE, TOWERS } = M.data;
  const gh = M.terrain.groundHeight;
  const HID = { ultraman: 0, seven: 1, tiga: 2, zero: 3, geed: 4 };
  const ALL = ['forest', 'desert', 'lake', 'snow'];
  const ease = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
  const lerp = (a, b, u) => a + (b - a) * u;
  const VERT = P.cfg.h > P.cfg.w;
  const $ = id => document.getElementById(id);

  // ---------- 声音事件 ----------
  P.time = 0;
  P.cue = (type, name, extra = {}) => P.cues.push({ t: +P.time.toFixed(3), type, name, ...extra });
  for (const k of Object.keys(M.audio.sfx)) M.audio.sfx[k] = () => P.cue('sfx', k);

  // ---------- 叠加层 ----------
  const css = document.createElement('style');
  css.textContent = `
  #keys-hint, #lock-hint, #dialog, #toast, #pause-btn, #boss-bar, #rotate-hint, #select h2 { display: none !important; }
  body.pv-clean #status, body.pv-clean #minimap, body.pv-clean #stamina { display: none !important; }
  #pv { position: fixed; inset: 0; z-index: 100; pointer-events: none; font-family: "PingFang SC", "Noto Sans SC", sans-serif; color: #fff; }
  #pv .cap { position: absolute; left: 5%; right: 5%; text-align: center; font-weight: 900; letter-spacing: .02em; line-height: 1.3; opacity: 0;
    text-shadow: 0 0 2px #000, 0 2px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 0 -2px 0 #000, 0 4px 14px rgba(0,0,0,.7); }
  #pv.v .cap { font-size: 30px; top: 63%; } #pv.h .cap { font-size: 30px; bottom: 7%; }
  #pv.v .cap.top { top: 11%; } #pv.h .cap.top { top: 6%; bottom: auto; }
  #pv .cap em { font-style: normal; color: #ffd23a; }
  #pv .title { position: absolute; left: 0; right: 0; text-align: center; font-weight: 900; opacity: 0; line-height: 1.05; }
  #pv.v .title { top: 8%; } #pv.h .title { top: 8%; }
  #pv .title .a { color: #ffd23a; text-shadow: 0 4px 0 #7a3a00, 0 0 30px rgba(255,180,0,.8); }
  #pv .title .b { color: #fff; text-shadow: 0 3px 0 #0a2a60, 0 0 20px rgba(69,200,255,.9); }
  #pv .title .c { background: linear-gradient(180deg,#fff 0%,#cfefff 45%,#45c8ff 70%,#1a6ad0 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 4px 0 #0a1a40) drop-shadow(0 0 18px rgba(69,200,255,.8)); }
  #pv.v .title .a { font-size: 96px; } #pv.v .title .b { font-size: 40px; margin: 10px 0 6px; } #pv.v .title .c { font-size: 60px; }
  #pv.h .title .a { font-size: 84px; } #pv.h .title .b { font-size: 34px; margin: 6px 0 2px; } #pv.h .title .c { font-size: 58px; }
  #pv .tag { position: absolute; left: 0; right: 0; text-align: center; font-weight: 900; letter-spacing: .25em; opacity: 0; color: #ffe0e0;
    text-shadow: 0 0 12px #f00, 0 0 24px #f00, 0 3px 0 #300; }
  #pv.v .tag { top: 18%; font-size: 32px; } #pv.h .tag { top: 9%; font-size: 34px; }
  #pv .dim { position: absolute; inset: 0; background: rgba(4,8,20,.55); opacity: 0; }
  #pv .term { position: absolute; left: 50%; transform: translateX(-50%); background: rgba(14,16,24,.94); border: 1px solid rgba(255,255,255,.18); border-radius: 14px;
    box-shadow: 0 20px 60px rgba(0,0,0,.6), 0 0 0 1px rgba(0,0,0,.4); font-family: "SF Mono", Menlo, "PingFang SC", monospace; opacity: 0; overflow: hidden; }
  #pv.v .term { top: 20%; width: 92%; font-size: 19px; } #pv.h .term { top: 13%; width: 78%; font-size: 20px; }
  #pv .term .bar { display: flex; align-items: center; gap: 7px; padding: 10px 14px; background: rgba(255,255,255,.06); font-size: 13px; color: #9aa; }
  #pv .term .bar i { width: 11px; height: 11px; border-radius: 50%; background: #ff5f57; } #pv .term .bar i:nth-child(2) { background: #febc2e; } #pv .term .bar i:nth-child(3) { background: #28c840; }
  #pv .term .bar span { margin-left: 8px; }
  #pv .term .body { padding: 14px 18px 18px; line-height: 1.65; color: #e8ecf4; }
  #pv .term .ln b { color: #d97757; margin-right: 6px; }
  #pv .term .hl { color: #ffd23a; }
  #pv .term .cur { display: inline-block; width: .55em; background: #e8ecf4; color: transparent; margin-left: 2px; }
  #pv .term .row { display: flex; justify-content: space-between; gap: 12px; opacity: 0; }
  #pv .term .row .ok { color: #3ddc84; margin-right: 8px; } #pv .term .row .f { color: #7a8aa8; }
  #pv .chips { position: absolute; left: 0; right: 0; display: flex; justify-content: center; gap: 14px; opacity: 0; }
  #pv.v .chips { top: 50%; flex-wrap: wrap; padding: 0 20px; } #pv.h .chips { top: 66%; }
  #pv .chip { background: rgba(255,210,58,.14); border: 2px solid #ffd23a; color: #fff; border-radius: 30px; padding: 8px 18px; font-weight: 900; font-size: 22px; text-shadow: 0 2px 0 #000; }
  #pv .chip b { color: #ffd23a; font-size: 30px; margin-right: 6px; }
  #pv .grid { position: absolute; display: grid; gap: 10px; }
  #pv.h .grid { left: 4%; top: 13%; width: 58%; grid-template-columns: repeat(3, 1fr); } #pv.v .grid { left: 5%; right: 5%; top: 14%; grid-template-columns: repeat(2, 1fr); }
  #pv .grid img { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: 8px; border: 2px solid rgba(255,255,255,.85); box-shadow: 0 8px 24px rgba(0,0,0,.6); opacity: 0; }
  #pv .checks { position: absolute; font-size: 21px; font-weight: 800; line-height: 1.9; text-shadow: 0 2px 0 #000; }
  #pv.h .checks { left: 66%; top: 16%; } #pv.v .checks { left: 10%; top: 50%; }
  #pv .checks div { opacity: 0; } #pv .checks .ok { color: #3ddc84; margin-right: 8px; }
  #pv .label { position: absolute; font-weight: 900; font-size: 22px; color: #ffd23a; text-shadow: 0 2px 0 #000; }
  #pv.h .label { left: 4%; top: 5%; } #pv.v .label { left: 5%; top: 9%; }
  #pv .end { position: absolute; left: 0; right: 0; text-align: center; opacity: 0; }
  #pv.v .end { top: 10%; } #pv.h .end { top: 9%; }
  #pv .end .k1 { font-size: 34px; font-weight: 900; text-shadow: 0 3px 0 #0a2a60, 0 0 18px rgba(69,200,255,.9); }
  #pv .end .k2 { font-weight: 900; color: #ffd23a; text-shadow: 0 4px 0 #7a3a00, 0 0 30px rgba(255,180,0,.8); }
  #pv.v .end .k2 { font-size: 76px; } #pv.h .end .k2 { font-size: 80px; }
  #pv .end .chips { position: static; opacity: 1; margin-top: 18px; }
  #pv .end .chip { font-size: 18px; padding: 6px 14px; } #pv .end .chip b { font-size: 24px; }
  #pv .foot { position: absolute; left: 0; right: 0; bottom: 2.5%; text-align: center; font-size: 13px; color: rgba(255,255,255,.75); text-shadow: 0 1px 2px #000; opacity: 0; }
  #pv .flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
  #pv .cover { position: absolute; inset: 0; display: none; }
  `;
  document.head.appendChild(css);
  const root = document.createElement('div');
  root.id = 'pv'; root.className = VERT ? 'v' : 'h';
  root.innerHTML = `<div class="dim"></div><div class="grid"></div><div class="checks"></div><div class="label"></div><div class="term"></div><div class="chips"></div>
    <div class="title"></div><div class="tag"></div><div class="end"></div><div class="cap"></div><div class="foot">同人作品，与官方无关</div><div class="flash"></div>`;
  document.body.appendChild(root);
  const el = n => root.querySelector('.' + n);
  const fmt = s => s.replace(/\*\*(.+?)\*\*/g, '<em>$1</em>');
  const show = (n, o) => { el(n).style.opacity = String(o); };

  // ---------- 工具 ----------
  function start(hero, save = {}) {
    g.save = Object.assign({ shards: [], chests: [], boss: false, up: { hp: 0, atk: 0 }, intro: true, hero, checkpoint: null }, save);
    g.selectIndex = HID[hero];
    g.startGame();
    g.ui.clearDialog();
    g.player.takeDamage = () => false;
    g.input.enabled = true;
    return g.player;
  }
  const origCam = g.updateCamera.bind(g);
  g.updateCamera = dt => {
    if (!P.cam) return origCam(dt);
    P.cam(dt);
    const s = g.effects.shake;
    if (s > 0) g.camera.position.add(v3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
  };
  const look = (pos, tgt) => { g.camera.position.copy(pos); g.camera.lookAt(tgt); };
  const arena = () => v3(CASTLE.x, CASTLE.h + 0.4, CASTLE.z);
  const tower = id => g.towers.find(t => t.def.id === id);
  const faceTo = (o, x, z) => { o.yaw = Math.atan2(x - o.pos.x, z - o.pos.z); };
  const press = n => g.input.press(n);
  function keepFlying(alt = 20) {
    const p = g.player;
    p.flying = true; p.grounded = false; p.stamina = 100; p.vel.y = 0; p.airT = 1;
    const f = v3(-Math.sin(g.camYaw), 0, -Math.cos(g.camYaw));
    let gmax = -1;
    for (const d of [0, 20, 45]) gmax = Math.max(gmax, gh(p.pos.x + f.x * d, p.pos.z + f.z * d), 0);
    p.pos.y += (gmax + alt - p.pos.y) * 0.06;
  }
  function bossFight(hero, pz = 5, bz = -9) {
    const p = start(hero, { shards: ALL.slice() });
    const C = arena(), b = g.belial;
    p.pos.set(C.x, C.y, C.z + pz); p.yaw = Math.PI;
    b.pos.set(C.x, C.y, C.z + bz); b.yaw = 0;
    g.startBossFight(); g.ui.clearDialog();
    b.setState('chase'); b.cool = 99;
    g.camYaw = 0; g.camPitch = 0.2;
    return { p, b, C };
  }
  function awaken(b) { b.hp = Math.round(b.maxHp * 0.45); b.setState('transform'); b.invulnerable = true; b.t = 2.58; }

  // ---------- 镜头库 ----------
  const S = {};

  S.hook = {
    clean: true,
    setup() { const { b } = this.ctx = bossFight('zero'); awaken(b); },
    at: [
      [0.12, function () { const b = this.ctx.b; b.setState('deathshoot'); b.fired = false; b.locked = false; b.cool = 99; }],
      [0.5, () => { g.player.energy = 100; press('special'); }],
      [2.3, function () { const b = this.ctx.b; b.setState('slam'); b.fired = false; }],
      [2.6, () => press('jump')],
    ],
    cam(t) {
      const { p, b } = this.ctx;
      if (VERT) {
        const u = ease(t / 3.5);
        look(v3(p.pos.x + 2.4 - u, p.pos.y + 2.6 + u * 1.2, p.pos.z + 6.5 + u * 2), b.center.add(v3(0, 1, 0)));
      } else {
        const M2 = p.pos.clone().lerp(b.pos, 0.45).add(v3(0, 3, 0));
        const u = ease(t / 4);
        look(v3(M2.x + 9.5 - 2 * u, M2.y + 1.2 + u, M2.z + 5.5 - 1.5 * u), M2);
      }
    },
    title: VERT ? '<div class="a">一句话</div><div class="b">让 AI 做了个</div><div class="c">奥特曼版塞尔达</div>'
      : '<div class="a">一句话</div><div class="b">让 AI 做出一个</div><div class="c">奥特曼版塞尔达传说</div>',
  };

  // 封面：光线刚射出、尚未命中的一瞬间
  S.cover = {
    clean: true,
    setup() { const { b } = this.ctx = bossFight('zero', 4, -6); awaken(b); },
    at: [[0.25, function () { this.ctx.b.setState('meteor'); this.ctx.b.fired = true; }], [0.3, () => { g.player.energy = 100; press('special'); }]],
    cam() {
      // c = [dx, dy, dz, 看向高度, 偏航角]：以两人中点为参照，偏航让主体让出文字区域
      const { p, b } = this.ctx, c = P.cfg.coverCam;
      const Mid = p.pos.clone().lerp(b.pos, 0.5);
      const pos = v3(Mid.x + c[0], Mid.y + c[1], Mid.z + c[2]);
      const dir = v3(Mid.x, Mid.y + c[3], Mid.z).sub(pos).applyAxisAngle(v3(0, 1, 0), c[4]);
      look(pos, pos.clone().add(dir));
    },
  };

  const PROMPT = '帮我做一个<span class="hl">奥特曼版本的塞尔达传说</span>，3D，开放世界的，电脑和手机都可以玩的（浏览器），开始时可以选择不同的奥特曼，大boss 是<span class="hl">极恶贝利亚</span>，提交到 github，部署到 gh page 让我玩';
  S.prompt = {
    clean: true,
    setup() {
      const p = start('ultraman');
      p.pos.set(20, 30, 320); g.camYaw = 0.15; g.camPitch = 0.3;
      el('term').innerHTML = `<div class="bar"><i></i><i></i><i></i><span>claude — ~/saierda</span></div><div class="body"><div class="ln"><b>›</b><span class="typed"></span><span class="cur">▌</span></div><div class="out"></div></div>`;
    },
    frame(t, dur) {
      g.input.touchMove.y = 1; keepFlying(26);
      show('dim', Math.min(1, t * 4)); show('term', Math.min(1, t * 5));
      const plain = PROMPT.replace(/<[^>]+>/g, '');
      const n = Math.floor(plain.length * Math.min(1, t / (dur * 0.72)));
      // 逐字显示但保留高亮标签
      let out = '', count = 0;
      for (const part of PROMPT.split(/(<[^>]+>)/)) {
        if (part.startsWith('<')) { out += part; continue; }
        const take = Math.max(0, Math.min(part.length, n - count)); out += part.slice(0, take); count += part.length;
      }
      el('term').querySelector('.typed').innerHTML = out;
      el('term').querySelector('.cur').style.opacity = Math.floor(t * 3) % 2 ? '0' : '1';
      if (t > dur * 0.8 && !this.sent) { this.sent = true; el('term').querySelector('.out').innerHTML = '<div style="color:#3ddc84;margin-top:6px">● 好的，开始构建……</div>'; }
    },
  };

  const BUILD = [
    ['开放世界地形：草原 / 森林 / 沙漠 / 雪山 / 湖泊', 'terrain.js'],
    ['5 位奥特曼：建模 + 动作 + 必杀技', 'models.js'],
    ['四大怪兽 AI：冲撞 / 跳砸 / 电击 / 火球', 'enemies.js'],
    ['极恶贝利亚：两阶段 Boss 战', 'enemies.js'],
    ['键鼠操作 + 触屏虚拟摇杆', 'input.js'],
    ['WebAudio 实时合成音效与音乐', 'audio.js'],
  ];
  S.build = {
    clean: true,
    setup() {
      const p = start('tiga', { shards: ALL.slice() });
      g.state = 'victory';
      el('term').innerHTML = `<div class="bar"><i></i><i></i><i></i><span>claude — ~/saierda</span></div><div class="body">${BUILD.map(([a, f]) => `<div class="row"><span><span class="ok">✓</span>${a}</span><span class="f">${f}</span></div>`).join('')}<div class="row" style="margin-top:6px"><span><span class="ok">✓</span>代码 <span class="loc" style="color:#ffd23a">0</span> 行</span><span class="f">11 个文件</span></div></div>`;
      el('chips').innerHTML = `<div class="chip"><b>3654</b>行代码</div><div class="chip"><b>0</b>张图片素材</div><div class="chip"><b>100%</b>程序生成</div>`;
      this.p = p;
    },
    frame(t, dur) {
      show('dim', 1); show('term', Math.min(1, t * 5));
      const rows = el('term').querySelectorAll('.row');
      rows.forEach((r, i) => { r.style.opacity = t > 0.3 + i * (dur * 0.62 / rows.length) ? '1' : '0'; });
      el('term').querySelector('.loc').textContent = String(Math.round(3654 * ease((t - 0.3) / (dur * 0.65))));
      show('chips', t > dur * 0.72 ? 1 : 0);
    },
    cam(t) { const a = 0.6 + t * 0.08, c = g.templePos; look(v3(Math.sin(a) * 34, c.y + 16, 20 + Math.cos(a) * 34), v3(0, c.y + 4, 20)); },
  };

  const SHOTS_IMG = ['01-title.png', '03-select-zero.png', '06-kaiju.png', '12-fly.png', '06-kaiju-m.png', '10-boss2-m.png'];
  const CHECKS = ['无头浏览器截图验收', '自动通关测试：四大怪兽 ✓', '自动通关测试：极恶贝利亚 ✓', '运行报错：0', '部署到 GitHub Pages'];
  S.tests = {
    clean: true,
    setup() {
      start('seven', { shards: ALL.slice() }); g.state = 'victory';
      el('grid').innerHTML = SHOTS_IMG.map(s => `<img src="/promo/assets/${s}">`).join('');
      el('checks').innerHTML = CHECKS.map(c => `<div><span class="ok">✓</span>${c}</div>`).join('');
      el('label').textContent = 'AI 自己截图检查 ↓';
    },
    frame(t, dur) {
      show('dim', 1); show('label', 1); show('grid', 1); show('checks', 1);
      el('grid').querySelectorAll('img').forEach((im, i) => { const u = ease((t - i * 0.25) / 0.3); im.style.opacity = String(u); im.style.transform = `scale(${0.85 + 0.15 * u}) rotate(${(i % 2 ? 1 : -1) * 1.5}deg)`; });
      el('checks').querySelectorAll('div').forEach((d, i) => { d.style.opacity = t > 1.2 + i * (dur - 1.8) / CHECKS.length ? '1' : '0'; });
    },
    cam(t) { const a = 2.2 + t * 0.06, c = g.templePos; look(v3(Math.sin(a) * 40, c.y + 20, 20 + Math.cos(a) * 40), v3(0, c.y + 6, 20)); },
  };

  S.select = {
    setup(dur) {
      start('ultraman'); g.ui.hud(false); g.selectIndex = 0; g.showSelect();
      g.updateMenu(1);
      this.step = dur / 5;
    },
    frame(t) {
      const i = Math.min(4, Math.floor(t / this.step));
      if (i !== this.i) { this.i = i; g.selectHero(i); if (i) P.cue('sfx', 'swing'); }
    },
  };

  S.fly = {
    setup() {
      const p = start('ultraman');
      p.pos.set(-30, 40, 300); g.camYaw = 0.35; g.camPitch = 0.22;
    },
    frame(t) {
      g.input.touchMove.y = 1; keepFlying(18);
      g.camYaw = 0.35 - t * 0.06; g.camPitch = 0.22 + Math.sin(t * 0.6) * 0.04;
    },
  };

  S.kaiju4 = {
    clean: true,
    setup(dur) { start('tiga'); this.step = dur / 4; this.i = -1; },
    frame(t) {
      const i = Math.min(3, Math.floor(t / this.step));
      const tw = g.towers[[0, 1, 2, 3][i]];
      const k = tw.kaiju;
      if (i !== this.i) {
        this.i = i;
        const p = g.player;
        const dir = Math.atan2(-tw.def.x, -tw.def.z) * 0 + (i % 2 ? 0.5 : -0.4);
        this.dir = dir;
        k.pos.set(tw.def.x + 4, 0, tw.def.z + 16); k.pos.y = g.floorAt(k.pos.x, k.pos.z);
        p.pos.set(k.pos.x + Math.sin(dir) * 16, 0, k.pos.z + Math.cos(dir) * 16); p.pos.y = g.floorAt(p.pos.x, p.pos.z);
        faceTo(k, p.pos.x, p.pos.z);
        k.engaged = true; k.setState('roar');
        el('tag').textContent = k.name;
        this.t0 = t;
        root.querySelector('.flash').style.opacity = '0.5';
      }
      root.querySelector('.flash').style.opacity = String(Math.max(0, 0.5 - (t - this.t0) * 4));
      show('tag', Math.min(1, (t - this.t0) * 5));
      const u = (t - this.t0) / this.step;
      const K = k.pos, d = this.dir + 0.35;
      const r = (VERT ? 12 : 10) - u * 2.2;
      this.camPos = v3(K.x + Math.sin(d) * r, K.y + 1.4 + u * 0.5, K.z + Math.cos(d) * r);
      this.camTgt = v3(K.x, K.y + 4.2 * k.cfg.scale, K.z);
    },
    cam() { look(this.camPos, this.camTgt); },
  };

  S.fight = {
    setup() {
      const p = start('tiga');
      const tw = tower('desert'), k = tw.kaiju;
      k.pos.set(tw.def.x + 2, 0, tw.def.z + 20); k.pos.y = g.floorAt(k.pos.x, k.pos.z);
      p.pos.set(k.pos.x - 1, 0, k.pos.z + 6.2); p.pos.y = g.floorAt(p.pos.x, p.pos.z);
      faceTo(p, k.pos.x, k.pos.z); faceTo(k, p.pos.x, p.pos.z);
      k.engaged = true; k.setState('chase'); k.cool = 0.5;
      g.camYaw = 0; this.ctx = { p, k, tw };
    },
    at: [
      [0.05, () => press('attack')], [0.3, () => press('attack')], [0.62, () => press('attack')],
      [1.15, () => press('attack')], [1.4, () => press('attack')], [1.7, () => press('attack')],
      [2.15, function () { this.ctx.k.hp = 30; g.player.energy = 100; press('special'); }],
      [2.9, () => { for (const tm of g.timers) tm.t = Math.min(tm.t, 0.35); }],
      [3.5, function () { const s = g.shardObjs[0]; if (s) { const q = s.model.group.position; g.player.pos.set(q.x, g.floorAt(q.x, q.z + 2), q.z + 2); } }],
    ],
    cam(t) {
      const { p, k, tw } = this.ctx;
      if (t < 3.45) {
        const Mid = p.pos.clone().lerp(k.pos, 0.5);
        const r = VERT ? 13 : 11;
        look(v3(Mid.x + r * 0.95, Mid.y + 3.2, Mid.z + r * 0.35), Mid.clone().add(v3(0, 2.6, 0)));
      } else {
        const u = ease((t - 3.45) / 1.6);
        const T = v3(tw.def.x, tw.def.h, tw.def.z);
        look(v3(T.x + 12 + u * 8, T.y + 5 + u * 9, T.z + 24 + u * 12), v3(T.x, T.y + 8 + u * 22, T.z));
      }
    },
  };

  S.barrier = {
    clean: true,
    setup() {
      const p = start('seven', { shards: ['forest', 'desert', 'lake'] });
      p.pos.set(4, CASTLE.h + 30, -335); p.yaw = Math.PI;
      g.camYaw = 0;
    },
    at: [[0.45, () => { g.save.shards.push('snow'); g.setTowerLit(tower('snow'), true); g.fadeBarrier = 1; P.cue('sfx', 'shard'); }]],
    frame() { const p = g.player; p.flying = true; p.grounded = false; p.vel.set(0, 0, 0); p.stamina = 100; },
    cam(t) {
      const u = ease(t / 3.4), p = g.player;
      look(v3(p.pos.x + 7 - u * 2, p.pos.y + 5 - u, p.pos.z + 12 - u * 4), v3(CASTLE.x, CASTLE.h + 18, CASTLE.z));
    },
  };

  S.belial = {
    clean: true,
    setup() { this.ctx = bossFight('zero', 4, -5); el('tag').textContent = '极恶贝利亚'; },
    at: [
      [0.15, function () { const b = this.ctx.b; b.hp = Math.round(b.maxHp * 0.5) + 5; b.takeDamage(20, g.player.pos, 0); }],
      [2.9, function () { el('tag').textContent = '极恶贝利亚 · 觉醒'; }],
      [3.0, function () { const b = this.ctx.b; b.setState('meteor'); b.fired = false; }],
    ],
    frame(t) { show('tag', Math.min(1, t * 4)); },
    cam(t) {
      const { p, b } = this.ctx;
      const u = ease(t / 4);
      const T = b.center.add(v3(0, b.height * 0.15, 0));
      look(v3(p.pos.x + 3.2 - u * 1.5, p.pos.y + 1.6, p.pos.z + 4.5 + u * 3), T);
    },
  };

  S.touch = {
    setup() {
      const p = start('geed');
      p.pos.set(30, 0, 120); p.pos.y = g.floorAt(30, 120); p.yaw = Math.PI;
      g.camYaw = 0; g.camPitch = 0.28;
      for (let i = 0; i < 3; i++) { const m = g.spawnMinionAt(26 + i * 4, 106 - (i % 2) * 3, i === 1 ? 'darklops' : 'baltan', 1); m.setState('chase'); m.hp = 18; }
      document.body.classList.add('touch');
      const base = $('joy-base'); base.style.display = 'block'; base.style.left = '150px'; base.style.top = '400px';
    },
    at: [[1.0, () => press('attack')], [1.3, () => press('attack')], [1.6, () => press('attack')], [2.0, () => { g.player.energy = 100; press('special'); }]],
    frame(t) {
      const run = t < 0.9;
      g.input.touchMove.y = run ? 1 : 0;
      $('joy-knob').style.transform = run ? 'translate(calc(-50% + 6px), calc(-50% - 44px))' : 'translate(-50%,-50%)';
      const down = (id, on) => $(id).classList.toggle('down', on);
      down('btn-attack', [1.0, 1.3, 1.6].some(x => t >= x && t < x + 0.15));
      down('btn-special', t >= 2.0 && t < 2.2);
    },
    leave() { document.body.classList.remove('touch'); $('joy-base').style.display = 'none'; },
  };

  S.end = {
    clean: true, noCap: true,
    setup() {
      const p = start('zero', { shards: ALL.slice(), boss: true });
      p.pos.copy(g.templePos).add(v3(0, 1.05, 0)); p.yaw = 0.2;
      g.state = 'victory'; g.temple.orb.visible = false;
      el('end').innerHTML = `<div class="k1">从一句话到上线</div><div class="k2">不到 1 小时</div><div class="chips"><div class="chip"><b>3654</b>行代码</div><div class="chip"><b>5</b>位奥特曼</div><div class="chip">浏览器即玩</div></div>`;
    },
    leave() { g.temple.orb.visible = true; },
    at: [[0.1, () => P.cue('sfx', 'win')]],
    frame(t) { show('end', Math.min(1, t * 3)); show('foot', Math.min(1, t * 3)); },
    cam(t) {
      const p = g.player, a = 0.55 - t * 0.08;
      const r = VERT ? 6.2 : 5.2;
      look(v3(p.pos.x + Math.sin(a) * r, p.pos.y + 1.1, p.pos.z + Math.cos(a) * r), v3(p.pos.x, p.pos.y + (VERT ? 3.4 : 2.6), p.pos.z));
    },
  };

  // ---------- 时间线 ----------
  let cur = -1, shot = null, shotStart = 0;
  function enter(i) {
    if (shot && shot.leave) shot.leave.call(shot);
    const s = P.cfg.shots[i];
    shot = Object.assign(Object.create(S[s.shot]), { cfg: s, done: new Set() });
    shotStart = s.start;
    for (const n of ['dim', 'term', 'chips', 'grid', 'checks', 'label', 'title', 'tag', 'end', 'cap', 'foot']) { show(n, 0); }
    el('grid').innerHTML = ''; el('checks').innerHTML = ''; el('label').textContent = '';
    P.cam = null;
    g.input.touchMove.x = g.input.touchMove.y = 0; g.input.held.jump = g.input.held.sprint = false;
    shot.setup.call(shot, s.dur);
    document.body.classList.toggle('pv-clean', !!shot.clean);
    if (shot.cam) P.cam = dt => shot.cam.call(shot, P.time - shotStart, dt);
    $('callout').classList.remove('show');
    const cap = el('cap');
    cap.className = 'cap' + (s.capPos === 'top' ? ' top' : '');
    cap.innerHTML = shot.title || shot.noCap ? '' : fmt(s.cap || '');
    el('title').innerHTML = shot.title || '';
    if (s.line) P.cue('voice', 'v', { i, at: s.voiceAt });
  }
  P.frame = () => {
    const t = P.f / P.cfg.fps;
    P.time = t;
    let i = cur;
    while (i + 1 < P.cfg.shots.length && t >= P.cfg.shots[i + 1].start) i++;
    if (i !== cur) { cur = i; enter(i); }
    const lt = t - shotStart;
    for (const [at, fn] of shot.at || []) if (lt >= at && !shot.done.has(at)) { shot.done.add(at); fn.call(shot); }
    if (shot.frame) shot.frame.call(shot, lt, shot.cfg.dur);
    const fade = Math.min(1, lt * 6);
    if (shot.title) show('title', Math.min(1, lt * 4)); else show('cap', fade);
    P.advance(1000 / P.cfg.fps);
    P.f++;
  };

  // ---------- 封面 ----------
  P.cover = html => {
    $('fx-text').style.display = 'none'; $('callout').style.display = 'none';
    for (const pr of g.projectiles) pr.mesh.visible = false;
    for (const e of g.enemies) e.flash = -1;
    for (const n of ['cap', 'title', 'tag', 'dim', 'term', 'chips']) show(n, 0);
    const c = document.createElement('div');
    c.className = 'cover'; c.style.display = 'block'; c.innerHTML = html;
    root.appendChild(c);
  };
})();
