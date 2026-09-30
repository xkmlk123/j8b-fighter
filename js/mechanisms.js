/* ============================================================
   mechanisms.js — J-8B 可动机构、挂载点、动画更新
   含：后缘襟翼/副翼（带滑轨整流罩与作动筒）、两侧减速板、
       全动平尾、前/主起落架（扭力臂、液压管、刹车盘、胎纹）、
       座舱盖开启、喷口收敛叶片联动
   ============================================================ */
(function (global) {
  'use strict';
  const T = THREE;
  const G = global.J8GEO, MAT = global.J8MAT;
  const D2R = Math.PI / 180;
  const UP = new T.Vector3(0, 1, 0), XA = new T.Vector3(1, 0, 0);

  function frameGeo(geo, pivot) {
    const q = pivot.quaternion.clone().invert();
    geo.applyQuaternion(q);
    const t = pivot.position.clone().negate().applyQuaternion(q);
    geo.translate(t.x, t.y, t.z);
    return geo;
  }

  function mkPivot(origin, xDir, zDir, parent) {
    const p = new T.Group();
    G.oriented(p, origin, xDir, zDir || new T.Vector3(0, 0, 1));
    parent.add(p);
    return p;
  }

  function localYSign(pivot) { return new T.Vector3(0, 1, 0).applyQuaternion(pivot.quaternion); }

  function movable(geo, mat, pivot) {
    const mesh = new T.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const inner = new T.Group();
    inner.add(mesh);
    pivot.add(inner);
    return {
      pivot: pivot, inner: inner,
      ySign: localYSign(pivot).dot(UP) >= 0 ? 1 : -1,
      yWorld: localYSign(pivot)
    };
  }

  function mesh(geo, mat, parent) {
    const m = new T.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }

  /* ============================================================
     机构构建
     ============================================================ */
  global.J8B.prototype.buildMechanisms = function () {
    const self = this, W = this._wing;
    const hinge = W.hinge, te = W.te;
    const wy = function (x) { return -0.10 - (x / 4.67) * 0.08; };
    this.mech.ctrl = {};

    /* ---------- 后缘襟翼 / 副翼 ---------- */
    function surface(sign, x0, x1, thick, animate) {
      const h0 = hinge(x0), h1 = hinge(x1);
      const c0 = te(x0) - h0, c1 = te(x1) - h1;
      const span = Math.sqrt(Math.pow(x1 - x0, 2) + Math.pow(h1 - h0, 2));
      const geo = G.ctrlSurface(span, c0, c1, thick);
      const pivot = mkPivot(
        new T.Vector3(sign * x0, wy(x0) - 0.015, h0),
        new T.Vector3(sign * (x1 - x0), 0, h1 - h0),
        new T.Vector3(0, 0, 1), self.root);
      if (animate) return movable(geo, MAT.skinCtl, pivot);
      mesh(geo, MAT.skinCtl, pivot);
      return null;
    }

    this.mech.ctrl.flapR = surface(1, 0.35, 2.10, 0.085, true);
    this.mech.ctrl.flapL = surface(-1, 0.35, 2.10, 0.085, true);
    this.mech.ctrl.ailR = surface(1, 2.55, 4.35, 0.055, true);
    this.mech.ctrl.ailL = surface(-1, 2.55, 4.35, 0.055, true);
    [[1, 0.00, 0.35, 0.105], [-1, 0.00, 0.35, 0.105],
     [1, 2.10, 2.55, 0.075], [-1, 2.10, 2.55, 0.075],
     [1, 4.35, 4.67, 0.045], [-1, 4.35, 4.67, 0.045]].forEach(function (s) {
      surface(s[0], s[1], s[2], s[3], false);
    });

    /* ---------- 后机身两侧减速板 ---------- */
    this.mech.ctrl.brake = [];
    [1, -1].forEach(function (sign) {
      const pivot = mkPivot(
        new T.Vector3(sign * 0.738, 0.26, -6.05),
        new T.Vector3(0, -1, 0), new T.Vector3(0, 0, 1), self.root);
      const s = movable(G.ctrlSurface(0.62, 2.15, 2.15, 0.045), MAT.skinCtl, pivot);
      s.side = sign;
      s.dirSign = s.yWorld.dot(XA) * sign;
      // 铰链整流罩
      const fair = mesh(new T.BoxGeometry(0.045, 0.075, 2.22), MAT.frame, self.root);
      fair.position.set(sign * 0.742, 0.28, -7.12);
      // 收放作动筒
      const act = mesh(new T.CylinderGeometry(0.024, 0.024, 0.30, 8), MAT.steel, self.root);
      act.geometry.rotateZ(Math.PI / 2);
      act.position.set(sign * 0.80, 0.02, -6.30);
      self.mech.ctrl.brake.push(s);
    });

    /* ---------- 全动平尾（含铰链整流罩） ---------- */
    const hs = [
      { x: 0.42, yc: -0.41, th: 0.17, ze: -6.60, chord: 2.60 },
      { x: 0.95, yc: -0.44, th: 0.145, ze: -7.10, chord: 2.42 },
      { x: 1.40, yc: -0.47, th: 0.115, ze: -7.55, chord: 2.25 },
      { x: 1.95, yc: -0.50, th: 0.088, ze: -8.12, chord: 1.90 },
      { x: 2.55, yc: -0.53, th: 0.060, ze: -8.70, chord: 1.35 }
    ].map(function (s) { return G.ringAirfoil(s.ze, s.chord, s.th, s.yc, s.x, 10); });
    /* 先在世界坐标系下放样并镜像，再各自 frameGeo 到枢轴局部系。
       顺序不能反：mirrorX 若作用于已 frameGeo 的局部坐标，
       镜像含义会随枢轴旋转而错位（右半会被推入中机身）。 */
    const stabGeoR0 = G.loft(hs, { uRep: 1.6, vRep: 1.8 });
    const stabGeoL0 = G.mirrorX(stabGeoR0);

    const pr = mkPivot(new T.Vector3(0.42, -0.41, -7.38),
      new T.Vector3(2.13, -0.12, -1.80), new T.Vector3(0, 0, 1), this.root);
    const sr = movable(frameGeo(stabGeoR0, pr), MAT.wing, pr);

    const pl = mkPivot(new T.Vector3(-0.42, -0.41, -7.38),
      new T.Vector3(-2.13, -0.12, -1.80), new T.Vector3(0, 0, 1), this.root);
    const sl = movable(frameGeo(stabGeoL0, pl), MAT.wing, pl);

    this.mech.ctrl.stab = [sr, sl];
    // 平尾根部铰链整流
    [1, -1].forEach(function (sign) {
      const f = mesh(new T.CylinderGeometry(0.11, 0.11, 0.36, 12), MAT.skinLight, self.root);
      f.geometry.rotateZ(Math.PI / 2);
      f.position.set(sign * 0.52, -0.41, -7.38);
    });

    this.buildGear();

    /* ---------- 座舱盖开启 ---------- */
    const cg = this.mech.canopy;
    this.root.remove(cg);
    const cgPivot = mkPivot(new T.Vector3(0, 0.50, 5.05), new T.Vector3(1, 0, 0), new T.Vector3(0, 0, 1), this.root);
    frameGeo(cg.geometry, cgPivot);
    cg.position.set(0, 0, 0);
    const cgInner = new T.Group();
    cgInner.add(cg); cgPivot.add(cgInner);
    this.mech.canopyPivot = { pivot: cgPivot, inner: cgInner };

    this.labelAnchors.push({ text: '襟翼（下偏增升）', at: new T.Vector3(1.15, -0.70, -4.7) });
    this.labelAnchors.push({ text: '副翼（横滚操纵）', at: new T.Vector3(3.45, -0.70, -6.0) });
    this.labelAnchors.push({ text: '减速板（两侧张开）', at: new T.Vector3(1.60, 0.34, -7.10) });
  };

  /* ---------------- 起落架 ---------------- */
  global.J8B.prototype.buildGear = function () {
    const self = this;
    this.mech.gear = { main: [], nose: null, doors: [] };

    /* 高细节机轮：胎面花纹 + 轮毂辐条 + 刹车盘 */
    function wheel(r, w) {
      const g = new T.Group();
      const t = mesh(new T.CylinderGeometry(r, r, w, 30, 1), MAT.tire, g);
      t.geometry.rotateZ(Math.PI / 2);
      // 胎肩圆角
      [-1, 1].forEach(function (s) {
        const sh = mesh(new T.TorusGeometry(r * 0.965, r * 0.055, 6, 26), MAT.tire, g);
        sh.geometry.rotateY(Math.PI / 2);
        sh.position.x = s * w * 0.5;
      });
      // 轮毂
      const h = mesh(new T.CylinderGeometry(r * 0.52, r * 0.52, w * 1.02, 20, 1), MAT.hub, g);
      h.geometry.rotateZ(Math.PI / 2);
      // 轮毂辐板与螺栓
      [-1, 1].forEach(function (s) {
        const p = mesh(new T.CylinderGeometry(r * 0.50, r * 0.50, 0.012, 20, 1), MAT.steel, g);
        p.geometry.rotateZ(Math.PI / 2);
        p.position.x = s * w * 0.52;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const b = mesh(new T.CylinderGeometry(0.016, 0.016, 0.022, 6), MAT.metal, g);
          b.geometry.rotateZ(Math.PI / 2);
          b.position.set(s * w * 0.55, Math.cos(a) * r * 0.34, Math.sin(a) * r * 0.34);
        }
      });
      // 刹车盘
      const d = mesh(new T.CylinderGeometry(r * 0.60, r * 0.60, w * 1.30, 22, 1), MAT.steel, g);
      d.geometry.rotateZ(Math.PI / 2);
      return g;
    }

    function strut(len, r1, r2, mat) {
      const s = mesh(new T.CylinderGeometry(r1, r2, len, 14), mat || MAT.steel);
      s.position.y = -len / 2;
      return s;
    }
    // 扭力臂（两节）
    function torqueLink(parent, y0, y1, sign) {
      const a = mesh(new T.BoxGeometry(0.045, 0.34, 0.055), MAT.steel, parent);
      a.position.set(sign * 0.075, y0, 0);
      a.rotation.z = sign * 0.42;
      const b = mesh(new T.BoxGeometry(0.042, 0.32, 0.05), MAT.steel, parent);
      b.position.set(sign * 0.045, y1, 0);
      b.rotation.z = -sign * 0.30;
    }
    function hose(parent, y0, y1, x, z) {
      const h = mesh(new T.CylinderGeometry(0.012, 0.012, Math.abs(y1 - y0), 6), MAT.dark, parent);
      h.position.set(x, (y0 + y1) / 2, z);
    }

    /* ---------- 前起落架（前收） ---------- */
    const nPivot = new T.Group();
    nPivot.position.set(0, -0.55, 4.55);
    this.root.add(nPivot);
    const nInner = new T.Group();
    nPivot.add(nInner);

    nInner.add(strut(1.42, 0.080, 0.062));
    const nOleo = mesh(new T.CylinderGeometry(0.118, 0.100, 0.70, 14), MAT.metal, nInner);
    nOleo.position.y = -0.34;
    torqueLink(nInner, -0.62, -0.98, 1);
    hose(nInner, -0.10, -1.10, 0.10, -0.10);
    hose(nInner, -0.10, -1.10, -0.10, -0.10);
    // 前轮叉
    const nFork = mesh(new T.CylinderGeometry(0.055, 0.055, 0.50, 10), MAT.steel, nInner);
    nFork.position.y = -1.30;
    const nFork2 = mesh(new T.BoxGeometry(0.075, 0.40, 0.075), MAT.steel, nInner);
    nFork2.position.set(0, -1.45, -0.14);
    nFork2.rotation.x = 0.22;
    const nAxle = mesh(new T.CylinderGeometry(0.052, 0.052, 0.32, 12), MAT.steel, nInner);
    nAxle.geometry.rotateZ(Math.PI / 2);
    nAxle.position.y = -1.62;
    const nW = wheel(0.30, 0.16);
    nW.position.y = -1.62; nInner.add(nW);
    // 转向作动筒与防扭臂
    const nSteer = mesh(new T.CylinderGeometry(0.048, 0.048, 0.46, 8), MAT.metal, nInner);
    nSteer.rotation.z = Math.PI / 2.6;
    nSteer.position.set(0.02, -1.14, 0.26);
    const nScissor = mesh(new T.BoxGeometry(0.03, 0.30, 0.03), MAT.steel, nInner);
    nScissor.position.set(0, -1.30, 0.20);
    nScissor.rotation.x = -0.35;
    // 着陆灯
    const nLamp = mesh(new T.CylinderGeometry(0.062, 0.062, 0.05, 12), MAT.lampW, nInner);
    nLamp.geometry.rotateX(Math.PI / 2);
    nLamp.position.set(0, -0.30, 0.14);
    this.mech.gear.nose = { pivot: nPivot, inner: nInner, angle: -88, lamp: nLamp };

    /* ---------- 主起落架（内收） ---------- */
    [1, -1].forEach(function (sign) {
      const p = new T.Group();
      p.position.set(sign * 1.06, -0.72, -0.35);
      self.root.add(p);
      const inner = new T.Group();
      p.add(inner);

      inner.add(strut(1.08, 0.108, 0.086));
      const oleo = mesh(new T.CylinderGeometry(0.152, 0.128, 0.76, 14), MAT.metal, inner);
      oleo.position.y = -0.28;
      // 撑杆
      const brace = mesh(new T.BoxGeometry(0.085, 1.02, 0.085), MAT.metal, inner);
      brace.position.set(-sign * 0.15, -0.60, -0.36);
      brace.rotation.x = -0.30;
      const brace2 = mesh(new T.BoxGeometry(0.07, 0.78, 0.07), MAT.metal, inner);
      brace2.position.set(sign * 0.16, -0.42, 0.26);
      brace2.rotation.x = 0.34;
      // 扭力臂与液压管
      torqueLink(inner, -0.62, -0.96, sign);
      hose(inner, -0.08, -1.12, sign * 0.13, -0.10);
      hose(inner, -0.08, -1.12, sign * 0.11, 0.10);
      // 轮轴 + 机轮 + 刹车盘
      const axle = mesh(new T.CylinderGeometry(0.062, 0.062, 0.46, 12), MAT.steel, inner);
      axle.geometry.rotateZ(Math.PI / 2);
      axle.position.y = -1.14;
      const w = wheel(0.44, 0.22);
      w.position.y = -1.28; inner.add(w);
      const hubCap = mesh(new T.ConeGeometry(0.13, 0.10, 14), MAT.hub, inner);
      hubCap.geometry.rotateZ(-sign * Math.PI / 2);
      hubCap.position.set(sign * 0.16, -1.28, 0);

      /* 舱门（含作动筒） */
      const dp = new T.Group();
      dp.position.set(sign * 0.60, -0.70, -0.35);
      self.root.add(dp);
      const door = mesh(new T.BoxGeometry(0.42, 0.045, 0.96), MAT.skinLight, dp);
      door.position.set(sign * 0.22, 0, 0);
      const dRib = mesh(new T.BoxGeometry(0.06, 0.05, 0.90), MAT.frame, dp);
      dRib.position.set(sign * 0.36, 0.004, 0);
      // 舱门铰链
      [0.34, -0.34].forEach(function (z) {
        const hg = mesh(new T.CylinderGeometry(0.026, 0.026, 0.10, 8), MAT.steel, dp);
        hg.geometry.rotateX(Math.PI / 2);
        hg.position.set(0, 0, z);
      });
      const act = mesh(new T.CylinderGeometry(0.026, 0.026, 0.34, 8), MAT.steel, dp);
      act.position.set(sign * 0.20, 0.20, -0.30);
      act.rotation.z = -sign * 0.55;

      self.mech.gear.doors.push({ pivot: dp, sign: sign, angle: -sign * 1.30 });
      self.mech.gear.main.push({ pivot: p, inner: inner, sign: sign, angle: -sign * 1.62 });
      self.labelAnchors.push({
        text: (sign > 0 ? '右' : '左') + '主起落架（内收）',
        at: new T.Vector3(sign * 1.60, -1.70, -0.75)
      });
    });

    /* ---------- 前起落架舱门 ---------- */
    [1, -1].forEach(function (sign) {
      const dp = new T.Group();
      dp.position.set(sign * 0.33, -0.62, 4.55);
      self.root.add(dp);
      const door = mesh(new T.BoxGeometry(0.34, 0.04, 0.90), MAT.skinLight, dp);
      door.position.set(-sign * 0.17, 0, 0);
      const rib = mesh(new T.BoxGeometry(0.05, 0.045, 0.84), MAT.frame, dp);
      rib.position.set(-sign * 0.28, 0.004, 0);
      const act = mesh(new T.CylinderGeometry(0.022, 0.022, 0.30, 8), MAT.steel, dp);
      act.position.set(-sign * 0.14, 0.18, 0.28);
      act.rotation.z = sign * 0.6;
      self.mech.gear.doors.push({ pivot: dp, sign: sign, angle: sign * 1.40 });
    });

    this.labelAnchors.push({ text: '前起落架（前收）', at: new T.Vector3(0, -2.05, 5.15) });
  };

  /* ============================================================
     挂载点
     ============================================================ */
  global.J8B.prototype.buildStations = function () {
    const defs = {
      il: { x: 1.80, y: -0.72, z: -2.20, yTop: -0.252, ps: 0.85 },
      ol: { x: 3.55, y: -0.68, z: -4.55, yTop: -0.228, ps: 0.72 },
      tl: { x: 4.86, y: -0.36, z: -6.10, yTop: -0.215, ps: 0.40 },
      ct: { x: 0.00, y: -1.32, z: -0.40, yTop: -0.90, ps: 1.0 },
      tr: { x: -4.86, y: -0.36, z: -6.10, yTop: -0.215, ps: 0.40 },
      or: { x: -3.55, y: -0.68, z: -4.55, yTop: -0.228, ps: 0.72 },
      ir: { x: -1.80, y: -0.72, z: -2.20, yTop: -0.252, ps: 0.85 }
    };
    const self = this;
    this.stations = [];
    global.STATIONS.forEach(function (st) {
      const d = defs[st.id];
      const grp = new T.Group();
      self.root.add(grp);
      const pylon = (st.id === 'tl' || st.id === 'tr')
        ? global.WeaponFactory.buildTipRail()
        : global.WeaponFactory.buildPylon(d.ps);
      pylon.position.set(d.x, d.yTop, d.z);
      grp.add(pylon);
      const holder = new T.Group();
      holder.position.set(d.x, d.y, d.z);
      grp.add(holder);
      self.stations.push({
        id: st.id, name: st.name, en: st.en, holder: holder, group: grp,
        model: null, kind: 'none', pos: d
      });
      self.labelAnchors.push({
        text: st.name + '挂点', at: new T.Vector3(d.x, d.y - 0.62, d.z + 1.05)
      });
    });
  };

  global.J8B.prototype.setStore = function (stationId, kind) {
    const st = this.stations.filter(function (s) { return s.id === stationId; })[0];
    if (!st || st.kind === kind) return;
    if (st.model) { st.holder.remove(st.model); st.model = null; }
    st.kind = kind;
    const m = global.WeaponFactory.build(kind);
    if (m) { st.holder.add(m); st.model = m; }
  };

  global.J8B.prototype.setLoadout = function (obj) {
    const self = this;
    Object.keys(obj).forEach(function (k) { self.setStore(k, obj[k]); });
  };

  global.J8B.prototype.currentLoadout = function () {
    const o = {};
    this.stations.forEach(function (s) { o[s.id] = s.kind; });
    return o;
  };

  /* ============================================================
     动画更新
     ============================================================ */
  global.J8B.prototype.update = function (dt, aero) {
    const c = this.cur, t = this.target;
    const rate = { flap: 1.35, brake: 1.7, gear: 0.55, canopy: 1.2 };
    for (const k in c) {
      c[k] += (t[k] - c[k]) * Math.min(1, rate[k] * dt);
      if (Math.abs(t[k] - c[k]) < 0.0015) c[k] = t[k];
    }

    /* 襟翼 0~40°、副翼随动 */
    const flapAng = c.flap * 40 * D2R;
    const F = this.mech.ctrl;
    F.flapR.inner.rotation.x = -flapAng * F.flapR.ySign;
    F.flapL.inner.rotation.x = -flapAng * F.flapL.ySign;
    F.ailR.inner.rotation.x = -c.flap * 9 * D2R * F.ailR.ySign;
    F.ailL.inner.rotation.x = -c.flap * 9 * D2R * F.ailL.ySign;

    /* 减速板 0~58° 向外张开 */
    F.brake.forEach(function (b) {
      b.inner.rotation.x = c.brake * 58 * D2R * b.dirSign;
    });

    /* 全动平尾：由迎角配平需求反推偏度 */
    let stabDeg = t.stab || 0;
    if (aero) {
      const err = (aero.alphaT - aero.alpha) * 180 / Math.PI;
      const load = aero.onGround ? 0 : (aero.n - 1) * 1.4;
      stabDeg = Math.max(-25, Math.min(25, err * 2.4 + load));
    }
    this.stabAngle = stabDeg;
    F.stab.forEach(function (s) {
      s.inner.rotation.x = -stabDeg * D2R * s.ySign;
    });

    /* 起落架收放 */
    const gp = c.gear;
    const nose = this.mech.gear.nose;
    nose.pivot.rotation.x = nose.angle * D2R * (1 - gp);
    nose.pivot.position.y = -0.55 + (1 - gp) * 0.30;
    this.mech.gear.main.forEach(function (m) {
      m.pivot.rotation.z = m.angle * (1 - gp);
      m.pivot.position.y = -0.72 + (1 - gp) * 0.38;
    });
    const doorOpen = Math.max(0, Math.min(1, Math.min(gp, 1 - gp) * 6));
    this.mech.gear.doors.forEach(function (d) {
      d.pivot.rotation.z = d.angle * doorOpen;
    });
    this.gearProgress = gp; this.gearDoor = doorOpen;

    /* 座舱盖 */
    this.mech.canopyPivot.inner.rotation.x = -c.canopy * 42 * D2R;
    this.canopyAngle = c.canopy * 42;

    /* 加力喷焰 + 喷口收敛叶片 */
    const glowTarget = this.target.glow || 0;
    this.abGlow += (glowTarget - this.abGlow) * Math.min(1, dt * 4.5);
    this.mech.flames.forEach(function (f, i) {
      f.material.opacity = this.abGlow * (i % 2 === 0 ? 0.82 : 0.55);
      if (f.scale.z !== undefined && i % 2 === 0) f.scale.z = 0.7 + this.abGlow * 0.5;
      else if (i % 2 === 1) f.scale.setScalar(0.4 + this.abGlow * 0.8);
    }, this);
    const nz = 1 - this.abGlow * 0.055;
    this.mech.nozzles.forEach(function (g) {
      g.scale.set(nz, nz, 1 - this.abGlow * 0.04);
    }, this);
    return this;
  };
})(window);
