"""生成解说语音：每句 edge-tts → 解码 → 裁掉首尾静音 → 记录时长。
用法: uv run --with numpy --with imageio-ffmpeg python promo/voice.py xhs|bili
"""
import json, subprocess, sys, hashlib, wave
from pathlib import Path
import numpy as np
import imageio_ffmpeg

ROOT = Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100


def decode(path):
    raw = subprocess.run([FF, '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def voiced(x, thresh_db=-42):
    win = int(SR * 0.01)
    n = len(x) // win
    rms = np.sqrt(np.mean(x[: n * win].reshape(n, win) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    idx = np.where(db > thresh_db)[0]
    s, e = idx[0] * win, min(len(x), (idx[-1] + 1) * win)
    return x[max(0, s - int(SR * 0.02)): e + int(SR * 0.04)]


def main(variant):
    cfg = json.loads((ROOT / 'script.json').read_text())
    out = ROOT / 'out' / variant
    out.mkdir(parents=True, exist_ok=True)
    timing = []
    for i, shot in enumerate(cfg['variants'][variant]['shots']):
        text = shot['line']
        key = hashlib.md5((cfg['voice'] + cfg['rate'] + text).encode()).hexdigest()[:10]
        mp3 = out / f'voice_{i:02d}_{key}.mp3'
        if not mp3.exists():
            subprocess.run(['uvx', 'edge-tts', '--voice', cfg['voice'], f"--rate={cfg['rate']}", '--text', text, '--write-media', str(mp3)], check=True, capture_output=True)
        x = voiced(decode(mp3))
        wav = out / f'voice_{i:02d}.wav'
        with wave.open(str(wav), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
        timing.append({'i': i, 'dur': round(len(x) / SR, 3), 'text': text})
        print(f'{i:02d} {len(x) / SR:5.2f}s  {text}')
    (out / 'timing.json').write_text(json.dumps(timing, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main(sys.argv[1])
