"""混音 + 合成成片：解说 + 游戏音效（离线合成）+ 程序生成背景音乐（人声时压低）。
用法: uv run --with numpy --with imageio-ffmpeg python promo/mix.py xhs|bili [--no-video]
"""
import json, sys, subprocess, wave
from pathlib import Path
import numpy as np
import imageio_ffmpeg

ROOT = Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100
rng = np.random.default_rng(7)


def read_wav(p):
    with wave.open(str(p)) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    return x


# ---------- 基础合成 ----------
def env_exp(n, dur):
    t = np.arange(n) / SR
    return np.exp(np.log(0.001) * t / dur)


def tone(kind, f0, f1, dur, vol=0.3, delay=0.0):
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = f0 * (f1 / f0) ** (t / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    if kind == 'sine': w = np.sin(ph)
    elif kind == 'square': w = np.sign(np.sin(ph)) * 0.6
    elif kind == 'saw': w = (2 * ((ph / (2 * np.pi)) % 1) - 1) * 0.6
    else: w = 2 * np.abs(2 * ((ph / (2 * np.pi)) % 1) - 1) - 1
    return np.concatenate([np.zeros(int(SR * delay)), w * env_exp(n, dur) * vol])


def filt(x, lo=None, hi=None):
    X = np.fft.rfft(x)
    fr = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.ones_like(fr)
    if lo: m *= 1 / (1 + (lo / np.maximum(fr, 1)) ** 4)
    if hi: m *= 1 / (1 + (fr / hi) ** 4)
    return np.fft.irfft(X * m, len(x))


def noise(dur, vol=0.3, freq=1200, q=1.0, delay=0.0, kind='band'):
    n = int(SR * dur)
    x = rng.uniform(-1, 1, n)
    if kind == 'band': x = filt(x, lo=freq / (1 + 1 / q), hi=freq * (1 + 1 / q)) * 2.5
    elif kind == 'low': x = filt(x, hi=freq) * 2
    elif kind == 'high': x = filt(x, lo=freq)
    return np.concatenate([np.zeros(int(SR * delay)), x * env_exp(n, dur) * vol])


def mixdown(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts: out[: len(p)] += p
    return out


SFX = {
    'swing': lambda: noise(0.14, 0.18, 2500, 2),
    'hit': lambda: mixdown(noise(0.16, 0.5, 700, 0.8), tone('square', 180, 60, 0.12, 0.15)),
    'heavy': lambda: mixdown(noise(0.35, 0.7, 300, 0.7), tone('saw', 120, 40, 0.35, 0.3), tone('sine', 90, 35, 0.4, 0.5)),
    'jump': lambda: tone('sine', 300, 700, 0.18, 0.2),
    'dodge': lambda: noise(0.2, 0.25, 1800, 1.5),
    'beam': lambda: mixdown(tone('saw', 220, 880, 0.25, 0.15), tone('square', 880, 440, 0.9, 0.08, 0.2), noise(1.0, 0.25, 3000, 0.5, 0.15), tone('sine', 110, 70, 1.0, 0.25, 0.2)),
    'slugger': lambda: mixdown(tone('tri', 600, 1400, 0.3, 0.15), noise(0.4, 0.12, 4000, 3)),
    'hurt': lambda: tone('square', 300, 90, 0.25, 0.2),
    'pickup': lambda: mixdown(*[tone('tri', f, f, 0.18, 0.12, i * 0.07) for i, f in enumerate([523, 659, 784, 1047])]),
    'shard': lambda: mixdown(*[tone('tri', f, f * 1.01, 0.6, 0.16, i * 0.09) for i, f in enumerate([392, 523, 659, 784, 1047, 1319])]),
    'chest': lambda: mixdown(*[tone('square', f, f, 0.15, 0.08, i * 0.1) for i, f in enumerate([659, 784, 988, 1319])]),
    'explode': lambda: mixdown(noise(1.1, 0.9, 220, 0, 0, 'low'), tone('saw', 90, 30, 0.9, 0.3), tone('sine', 60, 25, 1.0, 0.6)),
    'roar': lambda: mixdown(tone('saw', 170, 60, 1.4, 0.3), tone('saw', 173, 57, 1.4, 0.25), noise(1.3, 0.35, 400, 1), tone('sine', 80, 40, 1.4, 0.4)),
    'laugh': lambda: mixdown(*[tone('saw', 140, 110, 0.2, 0.22, d) for d in (0, 0.22, 0.44, 0.66)]),
    'warn': lambda: mixdown(tone('square', 880, 880, 0.08, 0.08), tone('square', 880, 880, 0.08, 0.08, 0.15)),
    'timer': lambda: tone('square', 1046, 1046, 0.06, 0.05),
    'win': lambda: mixdown(*[tone('tri', f, f, 0.45, 0.18, i * 0.13) for i, f in enumerate([523, 659, 784, 1047, 784, 1047, 1319])]),
}
GAIN = {'pickup': 0.5, 'swing': 0.8, 'roar': 0.8, 'win': 0.9}


# ---------- 背景音乐 ----------
def midi(n): return 440 * 2 ** ((n - 69) / 12)


def music(total):
    bpm = 138
    beat = 60 / bpm
    n = int(SR * (total + 1))
    drums, bass, lead, pad = (np.zeros(n) for _ in range(4))
    prog = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [48, 52, 55]), (55, [55, 59, 62])]  # Am F C G
    arp = [0, 1, 2, 1, 2, 0, 1, 2]

    def put(buf, x, t):
        i = int(t * SR)
        if i >= len(buf): return
        x = x[: len(buf) - i]
        buf[i: i + len(x)] += x

    kick = tone('sine', 150, 42, 0.28, 0.9)
    snare = mixdown(noise(0.18, 0.5, 1800, 0.7), tone('tri', 190, 150, 0.1, 0.25))
    hat = noise(0.04, 0.12, 8000, 0, 0, 'high')
    b = 0
    while b * beat < total + 0.5:
        t = b * beat
        bar = b // 4
        root, chord = prog[bar % 4]
        put(drums, kick, t)
        if b % 2 == 1: put(drums, snare, t)
        put(drums, hat, t); put(drums, hat * 0.6, t + beat / 2)
        for k in range(2): put(bass, tone('saw', midi(root - 24), midi(root - 24), beat / 2 * 0.95, 0.35), t + k * beat / 2)
        for k in range(2):
            note = chord[arp[(b * 2 + k) % 8]] + 12
            put(lead, tone('square', midi(note), midi(note), beat / 2 * 0.9, 0.07), t + k * beat / 2)
        if b % 4 == 0:
            for c in chord:
                d = beat * 4
                put(pad, tone('saw', midi(c), midi(c) * 1.003, d, 0.05) * np.minimum(1, np.arange(int(SR * d)) / (SR * 0.3)), t)
        b += 1
    bass = filt(bass, hi=500)
    pad = filt(pad, hi=1800)
    m = (drums * 0.7 + bass + lead + pad)[: int(SR * total)]
    fade = int(SR * 1.5)
    m[-fade:] *= np.linspace(1, 0, fade)
    return m / (np.abs(m).max() + 1e-9)


def smooth(x, win):
    c = np.cumsum(np.insert(x, 0, 0))
    y = (c[win:] - c[:-win]) / win
    return np.concatenate([y, np.full(win - 1, y[-1])])


def main(variant, video=True):
    out = ROOT / 'out' / variant
    d = json.loads((out / 'cues.json').read_text())
    total = d['duration']
    N = int(SR * total)
    voice = np.zeros(N); sfx = np.zeros(N)
    last = {}
    for c in d['cues']:
        if c['type'] == 'voice':
            x = read_wav(out / f"voice_{c['i']:02d}.wav")
            i = int(c['at'] * SR); voice[i: i + len(x)] += x[: N - i]
        else:
            nm = c['name']
            if nm not in SFX or c['t'] - last.get(nm, -9) < 0.07: continue
            last[nm] = c['t']
            x = SFX[nm]() * GAIN.get(nm, 1)
            i = int(c['t'] * SR); sfx[i: i + len(x)] += x[: N - i]
    env = smooth(np.abs(voice), int(SR * 0.05))
    env = np.clip(smooth(env, int(SR * 0.25)) / 0.04, 0, 1)
    bgm = music(total)[:N]
    mix = voice * 1.0 + sfx * 0.55 * (1 - 0.35 * env) + bgm * 0.32 * (1 - 0.6 * env)
    mix /= max(1, np.abs(mix).max() / 0.95)
    st = np.stack([mix, mix], 1)
    wav = out / 'mix.wav'
    with wave.open(str(wav), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())
    print('mix written', wav, f'{total:.2f}s')
    if not video: return
    mp4 = ROOT / 'out' / f'{variant}.mp4'
    subprocess.run([FF, '-v', 'error', '-y', '-framerate', '30', '-i', str(out / 'frames' / 'f%05d.jpg'), '-i', str(wav),
                    '-vf', 'scale=out_range=tv,format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-color_range', 'tv', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
                    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', str(mp4)], check=True)
    print('video written', mp4)


if __name__ == '__main__':
    main(sys.argv[1], '--no-video' not in sys.argv)
