// 键盘鼠标 + 触屏虚拟摇杆
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.pressedSet = new Set();
    this.held = { jump: false, sprint: false, attack: false };
    this.touchMove = { x: 0, y: 0 };
    this.lookDX = 0; this.lookDY = 0;
    this.locked = false;
    this.enabled = false;
    this._bindKeyboard();
    this._bindMouse();
    this._bindTouch();
  }
  press(name) { if (this.enabled) this.pressedSet.add(name); }
  consume(name) { const had = this.pressedSet.has(name); this.pressedSet.delete(name); return had; }
  clear() { this.pressedSet.clear(); this.lookDX = this.lookDY = 0; }

  get move() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.KeyW || k.ArrowUp) y += 1;
    if (k.KeyS || k.ArrowDown) y -= 1;
    if (k.KeyA) x -= 1;
    if (k.KeyD) x += 1;
    x += this.touchMove.x; y += this.touchMove.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  get jumpHeld() { return !!(this.keys.Space || this.held.jump); }
  get sprintHeld() { return !!(this.keys.ShiftLeft || this.keys.ShiftRight || this.held.sprint); }

  _bindKeyboard() {
    window.addEventListener('keydown', e => {
      if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
      this.keys[e.code] = true;
      switch (e.code) {
        case 'KeyJ': this.press('attack'); break;
        case 'KeyK': this.press('special'); break;
        case 'KeyL': case 'KeyQ': this.press('dodge'); break;
        case 'Space': this.press('jump'); e.preventDefault(); break;
        case 'KeyM': this.press('map'); break;
        case 'Escape': case 'KeyP': this.press('pause'); break;
        case 'Enter': this.press('confirm'); break;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.held.jump = this.held.sprint = false; });
  }

  _bindMouse() {
    const c = this.canvas;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('mousedown', e => {
      if (!this.enabled) return;
      if (!this.locked && this.wantLock) { this.requestLock(); return; }
      if (e.button === 0) this.press('attack');
      if (e.button === 2) this.press('special');
    });
    document.addEventListener('mousemove', e => {
      if (this.locked) { this.lookDX += e.movementX; this.lookDY += e.movementY; }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
      if (!this.locked && this.onUnlock) this.onUnlock();
    });
  }
  requestLock() {
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }

  _bindTouch() {
    const left = document.getElementById('zone-left');
    const right = document.getElementById('zone-right');
    const base = document.getElementById('joy-base');
    const knob = document.getElementById('joy-knob');
    if (!left) return;
    let joyId = null, ox = 0, oy = 0;
    const R = 55;
    left.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (joyId !== null) return;
      joyId = t.identifier; ox = t.clientX; oy = t.clientY;
      base.style.display = 'block';
      base.style.left = ox + 'px'; base.style.top = oy + 'px';
      knob.style.transform = 'translate(-50%,-50%)';
    }, { passive: false });
    const moveJoy = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        let dx = t.clientX - ox, dy = t.clientY - oy;
        const l = Math.hypot(dx, dy);
        if (l > R) { dx = dx / l * R; dy = dy / l * R; }
        this.touchMove.x = dx / R; this.touchMove.y = -dy / R;
        this.held.sprint = l > R * 1.6;
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }
    };
    const endJoy = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        joyId = null; this.touchMove.x = this.touchMove.y = 0; this.held.sprint = false;
        base.style.display = 'none';
      }
    };
    left.addEventListener('touchmove', e => { e.preventDefault(); moveJoy(e); }, { passive: false });
    left.addEventListener('touchend', endJoy); left.addEventListener('touchcancel', endJoy);

    let lookId = null, lx = 0, ly = 0;
    right.addEventListener('touchstart', e => {
      e.preventDefault();
      if (lookId !== null) return;
      const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY;
    }, { passive: false });
    right.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        this.lookDX += (t.clientX - lx) * 1.6; this.lookDY += (t.clientY - ly) * 1.6;
        lx = t.clientX; ly = t.clientY;
      }
    }, { passive: false });
    const endLook = e => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
    right.addEventListener('touchend', endLook); right.addEventListener('touchcancel', endLook);

    document.querySelectorAll('[data-btn]').forEach(b => {
      const name = b.dataset.btn;
      b.addEventListener('touchstart', e => {
        e.preventDefault(); e.stopPropagation();
        b.classList.add('down');
        this.press(name);
        if (name in this.held) this.held[name] = true;
      }, { passive: false });
      const up = e => { e.preventDefault(); b.classList.remove('down'); if (name in this.held) this.held[name] = false; };
      b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
      // 桌面上也能点
      b.addEventListener('mousedown', e => { e.stopPropagation(); this.press(name); });
    });
  }
}
