// 纯 WebAudio 合成音效 + 简易背景音乐
let ctx = null, master = null, musicGain = null, sfxGain = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('ultra-muted') === '1'; } catch (e) { /* ignore */ }

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.7; sfxGain.connect(master);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.22; musicGain.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('ultra-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  if (master) master.gain.value = muted ? 0 : 0.8;
  return muted;
}

function tone(type, f0, f1, dur, vol = 0.3, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.3, freq = 1200, q = 1, delay = 0, type = 'bandpass') {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur + 0.02);
}

export const sfx = {
  swing() { noise(0.12, 0.15, 2500, 2); },
  hit() { noise(0.15, 0.45, 600, 0.8); tone('square', 180, 60, 0.12, 0.15); },
  heavy() { noise(0.3, 0.6, 300, 0.7); tone('sawtooth', 120, 40, 0.3, 0.2); },
  jump() { tone('sine', 300, 700, 0.18, 0.15); },
  dodge() { noise(0.2, 0.2, 1800, 1.5); },
  beam() { tone('sawtooth', 220, 880, 0.25, 0.12); tone('square', 880, 440, 0.8, 0.06, 0.2); noise(0.9, 0.18, 3000, 0.5, 0.15); },
  slugger() { tone('triangle', 600, 1400, 0.3, 0.12); noise(0.4, 0.1, 4000, 3); },
  hurt() { tone('square', 300, 90, 0.25, 0.2); },
  pickup() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.18, 0.15, i * 0.07)); },
  shard() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f * 1.01, 0.4, 0.15, i * 0.09)); },
  chest() { [659, 784, 988, 1319].forEach((f, i) => tone('square', f, f, 0.15, 0.08, i * 0.1)); },
  explode() { noise(0.9, 0.7, 200, 0.5, 0, 'lowpass'); tone('sawtooth', 90, 30, 0.8, 0.25); },
  roar() { tone('sawtooth', 160, 60, 1.2, 0.25); tone('sawtooth', 163, 58, 1.2, 0.2); noise(1.1, 0.25, 400, 1); },
  laugh() { [0, 0.22, 0.44, 0.66].forEach(d => tone('sawtooth', 140, 110, 0.18, 0.2, d)); },
  warn() { tone('square', 880, 880, 0.08, 0.08); tone('square', 880, 880, 0.08, 0.08, 0.15); },
  timer() { tone('square', 1046, 1046, 0.06, 0.05); },
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f, 0.3, 0.18, i * 0.14)); },
};

// ---------- 背景音乐（简单步进音序器） ----------
let musicTimer = null, step = 0, currentTrack = null;
const N = (s) => s === 0 ? 0 : 440 * Math.pow(2, (s - 69) / 12);
const TRACKS = {
  field: {
    bpm: 112,
    lead: [72, 0, 76, 79, 0, 76, 74, 0, 72, 0, 69, 72, 74, 0, 0, 0, 72, 0, 76, 79, 0, 81, 79, 0, 77, 76, 74, 0, 72, 0, 0, 0],
    bass: [48, 48, 55, 55, 45, 45, 52, 52, 41, 41, 48, 48, 43, 43, 50, 50],
    wave: 'triangle',
  },
  boss: {
    bpm: 150,
    lead: [62, 0, 62, 65, 0, 62, 68, 67, 0, 62, 0, 62, 65, 0, 70, 69, 62, 0, 62, 65, 0, 62, 68, 67, 0, 65, 0, 63, 62, 0, 0, 0],
    bass: [38, 38, 38, 41, 38, 38, 44, 43, 38, 38, 38, 41, 38, 46, 45, 44],
    wave: 'square',
  },
  victory: {
    bpm: 100,
    lead: [72, 76, 79, 84, 0, 79, 84, 0, 81, 0, 79, 0, 76, 0, 0, 0],
    bass: [48, 48, 43, 43, 45, 45, 41, 43],
    wave: 'triangle',
  },
};
export function playMusic(name) {
  if (!ctx || currentTrack === name) return;
  stopMusic();
  currentTrack = name;
  const tr = TRACKS[name];
  const dt = 60 / tr.bpm / 2;
  step = 0;
  let next = ctx.currentTime + 0.1;
  musicTimer = setInterval(() => {
    while (next < ctx.currentTime + 0.25) {
      const l = tr.lead[step % tr.lead.length];
      if (l) mnote(tr.wave, N(l), dt * 0.9, 0.12, next);
      if (step % 2 === 0) { const b = tr.bass[(step / 2) % tr.bass.length]; mnote('sine', N(b), dt * 1.8, 0.22, next); }
      if (name === 'boss' && step % 2 === 0) mnoise(next, step % 4 === 0 ? 0.25 : 0.08);
      next += dt; step++;
    }
  }, 60);
}
function mnote(type, f, dur, vol, t) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + 0.05);
}
function mnoise(t, vol) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 150;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  s.connect(f); f.connect(g); g.connect(musicGain); s.start(t); s.stop(t + 0.2);
}
export function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer = null; currentTrack = null; }
