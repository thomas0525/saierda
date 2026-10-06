// 逐帧录制：node promo/record.mjs xhs|bili [--preview] [--cover]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const variant = process.argv[2];
const PREVIEW = process.argv.includes('--preview');
const COVER = process.argv.includes('--cover');
const FPS = 30;
const URL = process.env.URL || 'http://localhost:8765/';
const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'script.json'), 'utf8'));
const V = script.variants[variant];
const OUT = path.join(ROOT, 'out', variant);
const timing = JSON.parse(fs.readFileSync(path.join(OUT, 'timing.json'), 'utf8'));

// 按解说时长排时间线
let t = 0;
const shots = V.shots.map((s, i) => {
  const voice = timing[i].dur;
  const dur = Math.max(s.min, voice + 0.5);
  const o = { ...s, start: +t.toFixed(3), dur: +dur.toFixed(3), voiceAt: +(t + 0.15).toFixed(3), voiceDur: voice };
  t += dur;
  return o;
});
const total = t;

const COVERS = {
  xhs: { w: 540, h: 720, html: `
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,8,20,.55) 0%,rgba(0,0,0,0) 38%,rgba(0,0,0,0) 62%,rgba(4,8,20,.8) 100%)"></div>
    <div style="position:absolute;left:0;right:0;top:5%;text-align:center;font-weight:900;line-height:1.02">
      <div style="font-size:112px;color:#ffd23a;text-shadow:0 5px 0 #7a3a00,0 0 36px rgba(255,180,0,.85)">一句话</div>
      <div style="font-size:44px;color:#fff;margin:8px 0;text-shadow:0 3px 0 #0a2a60,0 0 20px rgba(69,200,255,.9)">让 AI 做了个</div>
      <div style="font-size:66px;background:linear-gradient(180deg,#fff,#cfefff 45%,#45c8ff 70%,#1a6ad0);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 0 #0a1a40) drop-shadow(0 0 18px rgba(69,200,255,.8))">奥特曼版塞尔达</div>
    </div>
    <div style="position:absolute;left:0;right:0;bottom:6%;display:flex;justify-content:center;gap:10px;font-weight:900;font-size:22px">
      <span style="background:#ffd23a;color:#111;border-radius:24px;padding:6px 16px">3D开放世界</span><span style="background:rgba(255,255,255,.92);color:#111;border-radius:24px;padding:6px 16px">网页即玩</span><span style="background:#e0283a;color:#fff;border-radius:24px;padding:6px 16px">决战贝利亚</span>
    </div>` },
  bili: { w: 960, h: 540, html: `
    <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(4,8,20,.8) 0%,rgba(4,8,20,.35) 45%,rgba(0,0,0,0) 70%)"></div>
    <div style="position:absolute;left:5%;top:12%;font-weight:900;line-height:1.02">
      <div style="font-size:120px;color:#ffd23a;text-shadow:0 5px 0 #7a3a00,0 0 36px rgba(255,180,0,.85)">一句话</div>
      <div style="font-size:46px;color:#fff;margin:10px 0 6px;text-shadow:0 3px 0 #0a2a60,0 0 20px rgba(69,200,255,.9)">让 AI 做出一个</div>
      <div style="font-size:72px;background:linear-gradient(180deg,#fff,#cfefff 45%,#45c8ff 70%,#1a6ad0);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 0 #0a1a40) drop-shadow(0 0 18px rgba(69,200,255,.8))">奥特曼版塞尔达</div>
      <div style="display:flex;gap:10px;margin-top:22px;font-size:24px">
        <span style="background:#ffd23a;color:#111;border-radius:24px;padding:6px 16px">3D开放世界</span><span style="background:rgba(255,255,255,.92);color:#111;border-radius:24px;padding:6px 16px">电脑手机都能玩</span><span style="background:#e0283a;color:#fff;border-radius:24px;padding:6px 16px">不到1小时</span>
      </div>
    </div>` },
};

const vw = COVER ? COVERS[variant].w : V.w, vh = COVER ? COVERS[variant].h : V.h;
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message + '\n' + e.stack));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript({ path: path.join(ROOT, 'clock.js') });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__game && window.__game.state === 'title');
const COVER_CAM = { xhs: [1.5, 0.8, 8.5, 3.8, 0.05], bili: [7, 2, 8, 3, 0.5] };
const cfg = { variant, w: vw, h: vh, fps: FPS, coverCam: JSON.parse(process.env.CAM || 'null') || COVER_CAM[variant], shots: COVER ? [{ shot: 'cover', cap: '', start: 0, dur: 9 }] : shots };
await page.evaluate(async cfg => {
  const P = window.__promo;
  P.cfg = cfg;
  P.mods = { audio: await import('/src/audio.js'), data: await import('/src/data.js'), terrain: await import('/src/terrain.js') };
}, cfg);
await page.addScriptTag({ path: path.join(ROOT, 'director.js') });
await page.evaluate(() => window.__promo.goVirtual());
const cdp = await ctx.newCDPSession(page);
const shoot = async (file, quality = 92) => {
  const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality, clip: { x: 0, y: 0, width: vw, height: vh, scale: 2 } });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
};

if (COVER) {
  const at = Math.round(+(process.env.AT || 0.72) * FPS);
  for (let f = 0; f < at; f++) await page.evaluate(() => window.__promo.frame());
  await page.evaluate(html => window.__promo.cover(html), COVERS[variant].html);
  await page.evaluate(() => window.__promo.advance(0));
  await shoot(path.join(ROOT, 'out', `cover_${variant}.jpg`), 95);
  console.log('cover saved', `cover_${variant}.jpg`);
} else {
  const dir = path.join(OUT, PREVIEW ? 'preview' : 'frames');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const N = Math.ceil(total * FPS);
  const t0 = Date.now();
  for (let f = 0; f < N; f++) {
    await page.evaluate(() => window.__promo.frame());
    if (PREVIEW) { if (f % 15 === 7) await shoot(path.join(dir, `p${String(f / 15 | 0).padStart(3, '0')}.jpg`), 70); }
    else await shoot(path.join(dir, `f${String(f).padStart(5, '0')}.jpg`));
    if (f % 150 === 0) console.log(`frame ${f}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  const cues = await page.evaluate(() => window.__promo.cues);
  fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify({ duration: total, fps: FPS, shots, cues }, null, 1));
  console.log(`done: ${N} frames, ${total.toFixed(2)}s, ${cues.length} cues`);
}
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no page errors');
await browser.close();
