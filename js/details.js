/* ============================================================
   details.js — 机体细节件（天线 / 传感器 / 灯具 / 座舱内部 /
                机炮 / 通风口 / 排气熏黑 / 翼面附件）
   依赖 airframe.js 提供的 J8B 原型与材质表
   ============================================================ */
(function (global) {
  'use strict';
  const T = THREE;
  const G = global.J8GEO, MAT = global.J8MAT;

  /* 机翼厚度分布（与 airframe.js 站位表一致） */
  const WTH = [
    [0.00, 0.40], [0.55, 0.36], [1.10, 0.31], [1.60, 0.265], [2.10, 0.22],
    [2.75, 0.175], [3.40, 0.14], [4.05, 0.100], [4.67, 0.062]
  ];
  function wingThick(x) {
    x = Math.max(0, Math.min(4.67, x));
    for (let i = 0; i < WTH.length - 1; i++) {
      if (x <= WTH[i + 1][0]) {
        const k = (x - WTH[i][0]) / (WTH[i + 1][0] - WTH[i][0]);
        return WTH[i][1] + (WTH[i + 1][1] - WTH[i][1]) * k;
      }
    }
    return WTH[WTH.length - 1][1];
  }

  /* 机身截面半宽（按截面幂次反解） */
  const FST = [
    [9.95, 0.235, 2.0], [8.80, 0.326, 2.05], [8.10, 0.398, 2.10],
    [7.40, 0.470, 2.15], [6.60, 0.540, 2.20], [5.60, 0.598, 2.30],
    [4.60, 0.640, 2.40], [3.40, 0.682, 2.50], [2.20, 0.710, 2.55],
    [1.00, 0.732, 2.60], [-0.20, 0.746, 2.62], [-1.60, 0.758, 2.62],
    [-3.00, 0.766, 2.62], [-4.20, 0.770, 2.60], [-6.20, 0.768, 2.56],
    [-8.60, 0.760, 2.52], [-10.30, 0.744, 2.50]
  ];
  function fuseProfile(z) {
    let a = FST[0], b = FST[FST.length - 1];
    for (let i = 0; i < FST.length - 1; i++) {
      if (z <= FST[i][0] && z >= FST[i + 1][0]) { a = FST[i]; b = FST[i + 1]; break; }
    }
    const k = (a[0] - z) / Math.max(1e-6, a[0] - b[0]);
    return { r: a[1] + (b[1] - a[1]) * k, p: a[2] + (b[2] - a[2]) * k };
  }
  // 给定 z 与高度 y，返回机身侧表面 x
  function fuseSideX(z, y) {
    const s = fuseProfile(z);
    const t = Math.min(0.999, Math.abs(y) / (s.r * 1.02));
    return s.r * Math.pow(Math.max(0, 1 - Math.pow(t, s.p)), 1 / s.p);
  }

  J8B_wingSurface();
  function J8B_wingSurface() {
    global.J8B.prototype.wingSurface = function (x, z, top) {
      const W = this._wing;
      const ze = W.le(x), zh = W.hinge(x), chord = ze - zh;
      const u = Math.min(1, Math.max(0, (ze - z) / chord));
      const f = Math.pow(Math.max(0, 1 - Math.pow(2 * u - 1, 2)), 0.6);
      const yc = -0.10 - (x / 4.67) * 0.08;
      return yc + (top ? 1 : -1) * (wingThick(x) / 2) * f;
    };
    global.J8B.prototype.fuseSideX = fuseSideX;
  }

  /* ============================================================
     细节件总装
     ============================================================ */
  global.J8B.prototype.buildDetails = function () {
    this.buildNoseSensors();
    this.buildGun();
    this.buildAntennas();
    this.buildVents();
    this.buildLights();
    this.buildCockpit();
    this.buildWingFittings();
    this.buildSootShell();
  };

  /* ---------------- 机头传感器组 ---------------- */
  global.J8B.prototype.buildNoseSensors = function () {
    const self = this;
    function add(m) { m.castShadow = true; self.root.add(m); return m; }

    // 主空速管（带两侧静压孔）
    const probe = new T.Mesh(new T.CylinderGeometry(0.024, 0.015, 1.05, 10), MAT.pitot);
    probe.geometry.rotateX(Math.PI / 2);
    probe.position.set(0, 0.075, 11.66);
    add(probe);
    const vane = new T.Mesh(new T.BoxGeometry(0.10, 0.010, 0.16), MAT.pitot);
    vane.position.set(0, 0.075, 11.20);
    add(vane);
    const pbase = new T.Mesh(new T.CylinderGeometry(0.055, 0.075, 0.16, 12), MAT.metal);
    pbase.geometry.rotateX(Math.PI / 2);
    pbase.position.set(0, 0.075, 11.06);
    add(pbase);

    // 两侧辅助空速管
    [1, -1].forEach(function (s) {
      const p = new T.Mesh(new T.CylinderGeometry(0.018, 0.012, 0.72, 8), MAT.pitot);
      p.geometry.rotateX(Math.PI / 2);
      p.position.set(s * 0.285, 0.10, 10.06);
      p.rotation.y = s * 0.10;
      add(p);
    });

    // 静压孔环（用极小圆柱模拟开孔）
    [1, -1].forEach(function (s) {
      for (let i = 0; i < 3; i++) {
        const h = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.014, 8), MAT.dark);
        h.rotation.z = Math.PI / 2;
        h.position.set(s * (0.208 - i * 0.004), 0.02, 10.02 - i * 0.20);
        self.root.add(h);
      }
    });

    // 迎角传感器（两侧风标叶片）
    [1, -1].forEach(function (s) {
      const b = new T.Mesh(new T.CylinderGeometry(0.032, 0.038, 0.075, 10), MAT.metal);
      b.rotation.z = Math.PI / 2;
      b.position.set(s * 0.245, 0.24, 9.62);
      add(b);
      const blade = new T.Mesh(new T.BoxGeometry(0.012, 0.115, 0.055), MAT.pitot);
      blade.position.set(s * 0.30, 0.26, 9.62);
      blade.rotation.x = 0.22;
      add(blade);
    });

    // 大气总温探头
    const tat = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 0.20, 8), MAT.pitot);
    tat.rotation.z = Math.PI / 2;
    tat.position.set(-0.42, 0.05, 9.72);
    add(tat);

    // 机头防撞灯
    const belt = new T.Mesh(new T.SphereGeometry(0.048, 12, 8), MAT.lampR);
    belt.scale.set(1, 0.7, 1.3);
    belt.position.set(0, -0.20, 10.42);
    this.root.add(belt);

    // 雷达罩防雷条（环向细带）
    [10.62, 10.88].forEach(function (z) {
      const r = z < 10.7 ? 0.181 : 0.142;
      const t = new T.Mesh(new T.TorusGeometry(r * 1.002, 0.006, 5, 24), MAT.metal);
      t.rotation.y = 0;
      t.position.z = z;
      self.root.add(t);
    });

    this.labelAnchors.push({ text: '空速管 / 迎角传感器', at: new T.Vector3(0, 0.30, 11.35) });
  };

  /* ---------------- 机炮 ---------------- */
  global.J8B.prototype.buildGun = function () {
    const self = this;
    // 23-3 双管机炮：前机身右下侧整流罩
    const x = 0.455, y = -0.235, z = 6.62;
    const fairing = new T.Mesh(new T.SphereGeometry(0.135, 14, 10), MAT.skinLight);
    fairing.scale.set(0.72, 0.62, 2.5);
    fairing.position.set(x, y, z);
    fairing.castShadow = true;
    self.root.add(fairing);

    [-0.038, 0.038].forEach(function (dx) {
      const bar = new T.Mesh(new T.CylinderGeometry(0.030, 0.030, 0.62, 10, 1, true), MAT.gun);
      bar.geometry.rotateX(Math.PI / 2);
      bar.position.set(x + dx * 0.75, y, z + 0.62);
      self.root.add(bar);
      const muz = new T.Mesh(new T.TorusGeometry(0.030, 0.007, 5, 10), MAT.steel);
      muz.position.set(x + dx * 0.75, y, z + 0.92);
      self.root.add(muz);
    });
    // 炮口焰口
    const port = new T.Mesh(new T.CircleGeometry(0.055, 12), MAT.dark);
    port.rotation.y = Math.PI;
    port.position.set(x, y, z + 0.30);
    self.root.add(port);
    this.gunPort = new T.Vector3(x, y, z + 0.94);
    void port;
  };

  /* ---------------- 天线组 ---------------- */
  global.J8B.prototype.buildAntennas = function () {
    const self = this;
    function blade(w, h, l, pos, rotZ) {
      const sh = new T.Shape();
      sh.moveTo(-l / 2, 0); sh.lineTo(l / 2, 0);
      sh.lineTo(l / 2 * 0.62, h); sh.lineTo(-l / 2 * 0.62, h);
      sh.closePath();
      const g = new T.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false, curveSegments: 1 });
      g.translate(0, 0, -w / 2);
      const m = new T.Mesh(g, MAT.frame);
      m.position.copy(pos);
      if (rotZ) m.rotation.z = rotZ;
      m.castShadow = true;
      self.root.add(m);
      return m;
    }
    // 背鳍上的刀形天线（UHF / 数据链）
    blade(0.022, 0.30, 0.52, new T.Vector3(0, 0.72, 3.95));
    blade(0.020, 0.22, 0.40, new T.Vector3(0, 0.68, 2.55));
    blade(0.018, 0.34, 0.34, new T.Vector3(0, 0.30, 5.62));
    // 腹部刀形天线
    blade(0.020, 0.26, 0.44, new T.Vector3(0, -0.66, -2.20), Math.PI);
    // 垂尾顶部的 IFF 天线
    blade(0.018, 0.26, 0.30, new T.Vector3(0, 3.20, -8.72));
    // 垂尾后缘放电刷
    for (let i = 0; i < 3; i++) {
      const p = new T.Mesh(new T.CylinderGeometry(0.006, 0.003, 0.22, 6), MAT.frame);
      p.position.set(0.02, 2.35 - i * 0.72, -9.05 - i * 0.10);
      p.rotation.x = -0.25;
      p.castShadow = true;
      self.root.add(p);
    }
    // 机身两侧放电刷
    [1, -1].forEach(function (s) {
      const p = new T.Mesh(new T.CylinderGeometry(0.006, 0.003, 0.20, 6), MAT.frame);
      p.position.set(s * 0.78, -0.28, -9.62);
      p.rotation.z = -s * 0.9;
      self.root.add(p);
    });
    this.labelAnchors.push({ text: '刀形天线 / 放电刷', at: new T.Vector3(0, 1.12, 3.95) });
  };

  /* ---------------- 通风与散热口 ---------------- */
  global.J8B.prototype.buildVents = function () {
    const self = this;
    // 机身背部 NACA 进气口（凹槽 + 唇口）
    [3.05, -1.10].forEach(function (z) {
      const r = fuseProfile(z).r;
      const box = new T.Mesh(new T.BoxGeometry(0.30, 0.09, 0.66), MAT.ductIn);
      box.position.set(0, r * 0.985, z);
      box.castShadow = true;
      self.root.add(box);
      const lip = new T.Mesh(new T.BoxGeometry(0.32, 0.045, 0.10), MAT.skinLight);
      lip.position.set(0, r * 0.995, z - 0.33);
      self.root.add(lip);
    });
    // 机身两侧散热百叶
    [1, -1].forEach(function (s) {
      for (let k = 0; k < 2; k++) {
        const z = -5.15 - k * 0.30;
        const x = fuseSideX(z, 0.34) + 0.004;
        for (let i = 0; i < 5; i++) {
          const lv = new T.Mesh(new T.BoxGeometry(0.014, 0.052, 0.16), MAT.steel);
          lv.position.set(s * x, 0.34 - i * 0.062, z);
          lv.rotation.x = -0.42;
          self.root.add(lv);
        }
        const fr = new T.Mesh(new T.BoxGeometry(0.012, 0.40, 0.24), MAT.frame);
        fr.position.set(s * (x - 0.006), 0.22, z);
        self.root.add(fr);
      }
    });
    // 机腹排水口
    [1, -1].forEach(function (s) {
      const d = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 0.05, 8), MAT.dark);
      d.position.set(s * 0.30, -0.735, -4.10);
      self.root.add(d);
    });
    this.labelAnchors.push({ text: '背部 NACA 进气口', at: new T.Vector3(0, 0.92, 3.05) });
    this.labelAnchors.push({ text: '散热百叶窗', at: new T.Vector3(1.15, 0.62, -5.30) });
  };

  /* ---------------- 航行灯 / 防撞灯 ---------------- */
  global.J8B.prototype.buildLights = function () {
    const self = this;
    function lamp(mat, r, pos, scale) {
      const m = new T.Mesh(new T.SphereGeometry(r, 12, 8), mat);
      if (scale) m.scale.copy(scale);
      m.position.copy(pos);
      self.root.add(m);
      return m;
    }
    // 翼尖：左红右绿
    lamp(MAT.lampR, 0.048, new T.Vector3(4.80, -0.10, -5.55), new T.Vector3(0.9, 0.7, 1.1));
    lamp(MAT.lampG, 0.048, new T.Vector3(-4.80, -0.10, -5.55), new T.Vector3(0.9, 0.7, 1.1));
    // 垂尾顶部防撞灯（白）
    lamp(MAT.lampW, 0.055, new T.Vector3(0, 3.28, -8.52), new T.Vector3(0.8, 0.8, 1.2));
    // 机腹防撞灯（红）
    lamp(MAT.lampR, 0.050, new T.Vector3(0, -0.70, -1.10), new T.Vector3(0.9, 0.6, 1.1));
    // 翼根前缘灯（白）
    lamp(MAT.lampW, 0.040, new T.Vector3(1.28, -0.10, 1.86), new T.Vector3(0.8, 0.7, 1.3));
    lamp(MAT.lampW, 0.040, new T.Vector3(-1.28, -0.10, 1.86), new T.Vector3(0.8, 0.7, 1.3));
    // 尾灯
    lamp(MAT.lampW, 0.040, new T.Vector3(0, 0.62, -10.12));
  };

  /* ---------------- 座舱内部 ---------------- */
  global.J8B.prototype.buildCockpit = function () {
    const self = this;
    const C = global.J8MAT;
    function box(w, h, l, mat, x, y, z, rx) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, l), mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      m.castShadow = true; m.receiveShadow = true;
      self.root.add(m);
      return m;
    }
    /* 座舱底部与侧壁内衬 */
    box(0.86, 0.03, 2.10, C.cockpit, 0, 0.40, 6.45);
    box(0.03, 0.30, 2.05, C.cockpit, 0.44, 0.58, 6.45);
    box(0.03, 0.30, 2.05, C.cockpit, -0.44, 0.58, 6.45);

    /* 仪表板 + 遮光罩 */
    box(0.74, 0.30, 0.14, C.cockpit, 0, 0.74, 7.13, -0.26);
    box(0.80, 0.035, 0.26, C.cockpit, 0, 0.88, 7.02, -0.18);
    // 仪表盘面（深色玻璃感）
    box(0.62, 0.22, 0.02, C.dark, 0, 0.735, 7.19, -0.26);
    // 侧操纵台
    box(0.15, 0.05, 0.55, C.cockpit, 0.42, 0.71, 6.85, -0.10);
    box(0.15, 0.05, 0.55, C.cockpit, -0.42, 0.71, 6.85, -0.10);

    /* HUD */
    const hudFrame = new T.Group();
    hudFrame.position.set(0, 0.78, 6.92);
    hudFrame.rotation.x = -0.22;
    self.root.add(hudFrame);
    const hg = new T.Mesh(new T.PlaneGeometry(0.30, 0.24), C.hudGlass);
    hudFrame.add(hg);
    const hb = new T.Mesh(new T.TorusGeometry(0.19, 0.014, 5, 16), C.frame);
    hb.scale.set(1.0, 0.82, 1);
    hudFrame.add(hb);
    const hcomb = new T.Mesh(new T.BoxGeometry(0.30, 0.012, 0.06), C.frame);
    hcomb.position.set(0, 0.14, -0.02);
    hudFrame.add(hcomb);

    /* 弹射座椅 */
    const seat = new T.Group();
    seat.position.set(0, -0.16, 6.30);
    self.root.add(seat);
    function sbox(w, h, l, x, y, z, rx, mat) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, l), mat || C.seat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      m.castShadow = true; seat.add(m);
      return m;
    }
    sbox(0.48, 0.10, 0.52, 0, 0.515, 0);                 // 坐垫
    sbox(0.46, 0.64, 0.12, 0, 0.83, -0.30, -0.16);       // 靠背
    sbox(0.30, 0.20, 0.16, 0, 1.02, -0.36, -0.16, C.dark); // 头枕
    sbox(0.10, 0.05, 0.05, 0.11, 0.66, 0.16);            // 中央操纵杆基座（安全带扣）
    sbox(0.46, 0.05, 0.06, 0, 0.90, -0.06, -0.16, C.dark);
    // 椅背导轨
    [-0.20, 0.20].forEach(function (x) {
      const r = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 0.86, 8), C.frame);
      r.position.set(x, 0.88, -0.40);
      r.rotation.x = -0.16;
      seat.add(r);
    });
    // 安全带
    [0.20, -0.20].forEach(function (x) {
      const b = new T.Mesh(new T.BoxGeometry(0.075, 0.52, 0.02), C.dark);
      b.position.set(x, 0.90, -0.20);
      b.rotation.x = -0.16;
      seat.add(b);
    });

    /* 飞行员（简化形体，增强舱内可读性） */
    const pilot = new T.Group();
    pilot.position.set(0, -0.30, 6.32);
    self.root.add(pilot);
    const suit = new T.MeshStandardMaterial({ color: 0x394a3a, metalness: 0.05, roughness: 0.9 });
    const helmet = new T.MeshStandardMaterial({ color: 0xd7dbe0, metalness: 0.2, roughness: 0.4 });
    const torso = new T.Mesh(T.CapsuleGeometry
      ? new T.CapsuleGeometry(0.20, 0.30, 6, 12)
      : new T.CylinderGeometry(0.20, 0.19, 0.52, 14), suit);
    torso.position.set(0, 0.80, 0.02);
    pilot.add(torso);
    const head = new T.Mesh(new T.SphereGeometry(0.135, 14, 12), helmet);
    head.scale.set(1, 1.05, 1.1);
    head.position.set(0, 1.14, 0.02);
    pilot.add(head);
    const mask = new T.Mesh(new T.BoxGeometry(0.14, 0.10, 0.10), C.dark);
    mask.position.set(0, 1.10, 0.14);
    pilot.add(mask);
    [-1, 1].forEach(function (s) {
      const arm = new T.Mesh(new T.CylinderGeometry(0.055, 0.048, 0.46, 8), suit);
      arm.position.set(s * 0.21, 0.80, 0.16);
      arm.rotation.x = -0.85;
      arm.rotation.z = s * 0.20;
      pilot.add(arm);
      const leg = new T.Mesh(new T.CylinderGeometry(0.075, 0.062, 0.52, 8), suit);
      leg.position.set(s * 0.11, 0.62, 0.36);
      leg.rotation.x = 1.35;
      pilot.add(leg);
    });

    /* 座舱盖后视镜 */
    const mir = new T.Mesh(new T.PlaneGeometry(0.075, 0.06), MAT.metal);
    mir.position.set(0.28, 0.86, 7.18);
    mir.rotation.set(-0.5, 0.4, 0);
    self.root.add(mir);
    const mir2 = mir.clone(); mir2.position.x = -0.30; mir2.rotation.y = -0.4;
    self.root.add(mir2);

    this.labelAnchors.push({ text: '弹射座椅 / 座舱仪表', at: new T.Vector3(0, 1.30, 6.30) });
  };

  /* ---------------- 翼面附件 ---------------- */
  global.J8B.prototype.buildWingFittings = function () {
    const self = this;
    const wy = function (x, z, top) { return self.wingSurface(x, z, top); };

    /* 襟翼 / 副翼滑轨整流罩 */
    [0.95, 1.75, 2.35, 3.30, 4.10].forEach(function (x) {
      const W = self._wing, hz = W.hinge(x);
      const top = wy(x, hz, true);
      [1, -1].forEach(function (s) {
        const fair = new T.Mesh(new T.SphereGeometry(0.085, 12, 8), MAT.skinLight);
        fair.scale.set(0.75, 0.55, 2.6);
        fair.position.set(s * x, top - 0.075, hz + 0.16);
        fair.castShadow = true;
        self.root.add(fair);
        // 作动筒
        const act = new T.Mesh(new T.CylinderGeometry(0.028, 0.028, 0.42, 8), MAT.steel);
        act.geometry.rotateX(Math.PI / 2);
        act.position.set(s * x, top - 0.10, hz + 0.10);
        self.root.add(act);
      });
    });

    /* 翼尖导弹发射梁 */
    [1, -1].forEach(function (s) {
      const rail = new T.Mesh(new T.BoxGeometry(0.06, 0.09, 1.10), MAT.skinLight);
      rail.position.set(s * 4.66, -0.235, -5.35);
      rail.castShadow = true;
      self.root.add(rail);
      const rr = new T.Mesh(new T.BoxGeometry(0.05, 0.035, 0.90), MAT.steel);
      rr.position.set(s * 4.66, -0.30, -5.35);
      self.root.add(rr);
    });

    /* 前缘襟翼分缝（细凹槽） */
    [2.20, 3.30, 4.20].forEach(function (x) {
      const W = self._wing, lez = W.le(x);
      [1, -1].forEach(function (s) {
        const seam = new T.Mesh(new T.BoxGeometry(0.02, 0.012, 0.42), MAT.dark);
        seam.position.set(s * x, wy(x, lez - 0.16, true) + 0.004, lez - 0.16);
        seam.rotation.z = s * 0.22;
        self.root.add(seam);
      });
    });

    /* 翼下挂点整流（内翼 / 外翼） */
    [[1.80, -2.20, 0.85], [3.55, -4.55, 0.72]].forEach(function (d) {
      [1, -1].forEach(function (s) {
        const top = wy(d[0], d[1], false);
        const fair = new T.Mesh(new T.SphereGeometry(0.11 * d[2], 12, 8), MAT.skinLight);
        fair.scale.set(0.62, 0.55, 3.0);
        fair.position.set(s * d[0], top + 0.01, d[1]);
        fair.castShadow = true;
        self.root.add(fair);
      });
    });

    this.labelAnchors.push({ text: '襟翼滑轨整流罩', at: new T.Vector3(2.35, -0.66, -4.75) });
    this.labelAnchors.push({ text: '翼尖发射梁', at: new T.Vector3(4.72, -0.46, -5.35) });
  };

  /* ---------------- 排气熏黑罩壳 ---------------- */
  global.J8B.prototype.buildSootShell = function () {
    const cv = document.createElement('canvas');
    cv.width = 8; cv.height = 256;
    const x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.00, '#000000');   // 尾端（v=1）最重
    g.addColorStop(0.34, '#5a5a5a');
    g.addColorStop(0.72, '#d8d8d8');
    g.addColorStop(1.00, '#ffffff');   // 前端（v=0）不显示
    x.fillStyle = g; x.fillRect(0, 0, 8, 256);
    const alphaTex = new T.CanvasTexture(cv);
    alphaTex.wrapS = alphaTex.wrapT = T.ClampToEdgeWrapping;

    const mat = new T.MeshStandardMaterial({
      color: 0x2c2c30, alphaMap: alphaTex, transparent: true,
      depthWrite: false, metalness: 0.15, roughness: 0.86
    });

    const src = [
      [-5.00, 0.770, 0.772], [-5.90, 0.769, 0.770], [-6.80, 0.768, 0.766],
      [-7.80, 0.765, 0.759], [-8.80, 0.759, 0.750], [-9.70, 0.752, 0.741],
      [-10.30, 0.744, 0.730]
    ];
    const secs = src.map(function (s, i) {
      const k = 1.006 + i * 0.0012;
      return G.ringOval(s[0], s[1] * k, s[2] * k, 0, 34, 2.55);
    });
    const shell = new T.Mesh(G.loft(secs, { uRep: 2.5, vRep: 1 }), mat);
    shell.castShadow = false;
    shell.renderOrder = 2;
    this.root.add(shell);
  };

  global.J8DET = { wingThick: wingThick, fuseSideX: fuseSideX, fuseProfile: fuseProfile };
})(window);
