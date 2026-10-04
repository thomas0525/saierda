import * as THREE from 'three';

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Effects {
  constructor(scene, camera, mobile) {
    this.scene = scene; this.camera = camera;
    const N = mobile ? 500 : 1000;
    this.N = N;
    this.pPos = new Float32Array(N * 3); this.pCol = new Float32Array(N * 3);
    this.pVel = new Float32Array(N * 3); this.pLife = new Float32Array(N); this.pMax = new Float32Array(N); this.pBase = new Float32Array(N * 3); this.pGrav = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.9, map: dotTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.pi = 0;
    for (let i = 0; i < N; i++) this.pPos[i * 3 + 1] = -9999;
    this.items = [];
    this.texts = [];
    this.textLayer = document.getElementById('fx-text');
    this.shake = 0;
    this._c = new THREE.Color();
  }

  burst(pos, color, count = 12, speed = 8, life = 0.6, grav = 6) {
    const c = this._c.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.pi; this.pi = (this.pi + 1) % this.N;
      this.pPos[i * 3] = pos.x; this.pPos[i * 3 + 1] = pos.y; this.pPos[i * 3 + 2] = pos.z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1), s = speed * (0.4 + Math.random() * 0.6);
      this.pVel[i * 3] = Math.sin(ph) * Math.cos(th) * s; this.pVel[i * 3 + 1] = Math.abs(Math.cos(ph)) * s * 0.8 + s * 0.2; this.pVel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * s;
      this.pLife[i] = this.pMax[i] = life * (0.6 + Math.random() * 0.6);
      this.pBase[i * 3] = c.r; this.pBase[i * 3 + 1] = c.g; this.pBase[i * 3 + 2] = c.b;
      this.pGrav[i] = grav;
    }
  }

  // 光线：返回对象，可外部更新方向
  beam(from, dir, length, color, core, width, life = 0.7) {
    const g = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(width, width, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.45, width * 0.45, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({ color: core, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    const tipM = new THREE.Mesh(new THREE.SphereGeometry(width * 1.6, 12, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(outer, inner, tipM);
    g.position.copy(from);
    g.lookAt(from.clone().add(dir));
    this.scene.add(g);
    const it = { kind: 'beam', obj: g, outer, inner, tipM, t: 0, life, length, color };
    this.items.push(it);
    return it;
  }

  ring(pos, color, maxR = 8, life = 0.6, thick = 0.5) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, Math.min(0.2, thick * 1.5 / maxR), 6, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = Math.PI / 2; m.position.copy(pos);
    this.scene.add(m);
    this.items.push({ kind: 'ring', obj: m, t: 0, life, maxR, thick });
  }

  explosion(pos, color = 0xffaa40, size = 4, life = 0.6) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos);
    this.scene.add(m);
    this.items.push({ kind: 'boom', obj: m, t: 0, life, size });
    this.burst(pos, color, 26, size * 3, 0.9);
  }

  telegraphCircle(x, y, z, r, life, color = 0xff2020) {
    const g = new THREE.Group();
    const edge = new THREE.Mesh(new THREE.RingGeometry(r * 0.94, r, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false }));
    g.add(edge, fill); g.position.set(x, y + 0.25, z);
    fill.scale.setScalar(0.01);
    this.scene.add(g);
    const it = { kind: 'tele', obj: g, fill, t: 0, life };
    this.items.push(it);
    return it;
  }

  telegraphLine(from, dir, length, width, life, color = 0xff2020) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, 1).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }));
    m.position.copy(from); m.lookAt(from.clone().add(dir)); m.scale.z = length;
    this.scene.add(m);
    const it = { kind: 'teleLine', obj: m, t: 0, life };
    this.items.push(it);
    return it;
  }

  text(pos, str, color = '#fff', big = false) {
    const el = document.createElement('div');
    el.className = 'dmg' + (big ? ' big' : '');
    el.textContent = str; el.style.color = color;
    this.textLayer.appendChild(el);
    this.texts.push({ el, pos: pos.clone(), t: 0, life: 0.9 });
  }

  remove(it) { it.t = it.life + 1; }

  update(dt) {
    // 粒子
    for (let i = 0; i < this.N; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      const j = i * 3;
      if (this.pLife[i] <= 0) { this.pPos[j + 1] = -9999; this.pCol[j] = this.pCol[j + 1] = this.pCol[j + 2] = 0; continue; }
      this.pVel[j + 1] -= this.pGrav[i] * dt;
      this.pVel[j] *= 0.97; this.pVel[j + 2] *= 0.97;
      this.pPos[j] += this.pVel[j] * dt; this.pPos[j + 1] += this.pVel[j + 1] * dt; this.pPos[j + 2] += this.pVel[j + 2] * dt;
      const f = this.pLife[i] / this.pMax[i];
      this.pCol[j] = this.pBase[j] * f; this.pCol[j + 1] = this.pBase[j + 1] * f; this.pCol[j + 2] = this.pBase[j + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    for (let n = this.items.length - 1; n >= 0; n--) {
      const it = this.items[n];
      it.t += dt;
      const u = Math.min(1, it.t / it.life);
      if (it.kind === 'beam') {
        const grow = Math.min(1, it.t / 0.12);
        const L = it.length * grow;
        const fade = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
        const wob = 1 + Math.sin(it.t * 60) * 0.12;
        it.outer.scale.set(wob * fade, wob * fade, L); it.inner.scale.set(fade, fade, L);
        it.tipM.position.z = L; it.tipM.scale.setScalar(fade * wob);
        it.outer.material.opacity = 0.55 * fade;
      } else if (it.kind === 'ring') {
        const r = 0.5 + it.maxR * u;
        it.obj.scale.set(r, r, r);
        it.obj.material.opacity = 0.9 * (1 - u);
      } else if (it.kind === 'boom') {
        it.obj.scale.setScalar(it.size * (0.3 + u));
        it.obj.material.opacity = 0.9 * (1 - u);
      } else if (it.kind === 'tele') {
        it.fill.scale.setScalar(Math.max(0.01, u));
      } else if (it.kind === 'teleLine') {
        it.obj.material.opacity = 0.25 + 0.4 * Math.abs(Math.sin(it.t * 18));
      }
      if (it.t >= it.life) {
        this.scene.remove(it.obj);
        it.obj.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        this.items.splice(n, 1);
      }
    }

    // 伤害数字
    const v = new THREE.Vector3();
    const w = window.innerWidth, h = window.innerHeight;
    for (let n = this.texts.length - 1; n >= 0; n--) {
      const t = this.texts[n];
      t.t += dt;
      if (t.t >= t.life) { t.el.remove(); this.texts.splice(n, 1); continue; }
      v.copy(t.pos); v.y += t.t * 2.5;
      v.project(this.camera);
      if (v.z > 1) { t.el.style.display = 'none'; continue; }
      t.el.style.display = '';
      t.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%,-50%)`;
      t.el.style.opacity = String(1 - Math.max(0, (t.t - 0.5) / 0.4));
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }
}
