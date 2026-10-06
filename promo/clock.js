// 页面加载前注入：虚拟时钟 + 可复现随机数 + 禁用真实音频
(() => {
  const real = {
    now: performance.now.bind(performance), dateNow: Date.now, raf: window.requestAnimationFrame.bind(window),
    caf: window.cancelAnimationFrame.bind(window), st: window.setTimeout.bind(window), ct: window.clearTimeout.bind(window),
    si: window.setInterval.bind(window), ci: window.clearInterval.bind(window),
  };
  const P = window.__promo = { virtual: false, vt: 0, f: 0, cues: [], rafQ: [], timers: [], tid: 1e6 };
  performance.now = () => (P.virtual ? P.vt : real.now());
  Date.now = () => (P.virtual ? 1.75e12 + P.vt : real.dateNow());
  window.requestAnimationFrame = cb => { if (!P.virtual) return real.raf(cb); P.rafQ.push(cb); return P.rafQ.length; };
  window.cancelAnimationFrame = id => { if (!P.virtual) real.caf(id); };
  window.setTimeout = (fn, ms = 0, ...a) => { if (!P.virtual) return real.st(fn, ms, ...a); const id = ++P.tid; P.timers.push({ id, at: P.vt + ms, fn, a }); return id; };
  window.clearTimeout = id => { P.timers = P.timers.filter(t => t.id !== id); real.ct(id); };
  window.setInterval = (fn, ms, ...a) => { if (!P.virtual) return real.si(fn, ms, ...a); const id = ++P.tid; P.timers.push({ id, at: P.vt + ms, every: ms, fn, a }); return id; };
  window.clearInterval = id => { P.timers = P.timers.filter(t => t.id !== id); real.ci(id); };
  // 种子随机数，保证预览与正片一致
  let s = 20261006;
  Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // 不出真实声音，音效由 cues 离线合成
  window.AudioContext = undefined; window.webkitAudioContext = undefined;
  try { localStorage.clear(); } catch (e) { /* ignore */ }

  P.goVirtual = () => { P.vt = real.now(); P.virtual = true; };
  P.advance = ms => {
    P.vt += ms;
    for (const t of [...P.timers]) {
      if (t.at > P.vt) continue;
      if (t.every) t.at += t.every; else P.timers = P.timers.filter(x => x !== t);
      try { t.fn(...t.a); } catch (e) { console.error(e); }
    }
    for (const a of document.getAnimations()) {
      if (!a.__pv) { a.pause(); a.__pv = true; }
      a.currentTime = (a.currentTime || 0) + ms;
    }
    const q = P.rafQ.splice(0);
    for (const cb of q) cb(P.vt);
  };
})();
