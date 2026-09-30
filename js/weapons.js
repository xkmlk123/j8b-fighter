/* ============================================================
   weapons.js — 外挂物建模（空空导弹 / 火箭巢 / 航弹 / 副油箱）+ 挂架
   所有构件：原点位于挂载中心，弹头指向 +Z，径向沿 X/Y
   弹体材质接入程序化 PBR 贴图（蒙皮分块 + 铆钉 + 老化）
   ============================================================ */
(function (global) {
  'use strict';
  const T = THREE;
  const TX = global.J8TEX;

  /* ---------------- 弹体贴图与材质 ---------------- */
  const SET = {
    white: TX.skinSet({
      size: 512, seed: 71, base: '#e7eaee', cols: 4, rows: 6, panels: 3,
      streaks: 16, wear: 0.55, mottle: 0.7, roughLo: 112, roughHi: 172
    }),
    grey: TX.skinSet({
      size: 512, seed: 83, base: '#b6bdc6', cols: 4, rows: 5, panels: 4,
      streaks: 22, wear: 1.0, mottle: 0.9, roughLo: 104, roughHi: 168
    }),
    olive: TX.skinSet({
      size: 512, seed: 97, base: '#59653f', cols: 4, rows: 5, panels: 5,
      streaks: 26, wear: 1.3, mottle: 1.1, roughLo: 118, roughHi: 178
    }),
    metal: TX.metalSet({ base: '#9aa2ab', seed: 101 })
  };

  function mk(setKey, o) {
    o = o || {};
    const set = SET[setKey];
    const u = o.u || 1, v = o.v || 1;
    const m = new T.MeshStandardMaterial({
      color: o.color === undefined ? 0xffffff : o.color,
      metalness: o.metalness === undefined ? 0.26 : o.metalness,
      roughness: o.roughness === undefined ? 0.52 : o.roughness,
      side: o.side || T.FrontSide
    });
    function cl(t) {
      const c = t.clone(); c.needsUpdate = true;
      c.wrapS = c.wrapT = T.RepeatWrapping;
      c.repeat.set(u, v); c.anisotropy = 8;
      return c;
    }
    m.map = cl(set.map); m.map.encoding = T.sRGBEncoding;
    if (set.normalMap) {
      m.normalMap = cl(set.normalMap);
      const s = o.bump === undefined ? 0.85 : o.bump;
      m.normalScale = new T.Vector2(s, s);
    }
    if (set.roughnessMap) m.roughnessMap = cl(set.roughnessMap);
    return m;
  }

  const MAT = {
    white: mk('white', { u: 2, v: 1 }),
    grey: mk('grey', { u: 2, v: 1 }),
    olive: mk('olive', { u: 2, v: 1 }),
    metal: mk('metal', { u: 1.5, v: 1.5, metalness: 0.85, roughness: 0.34 }),
    dark: new T.MeshStandardMaterial({ color: 0x24282e, metalness: 0.42, roughness: 0.58 }),
    seeker: new T.MeshStandardMaterial({ color: 0x14161a, metalness: 0.30, roughness: 0.18 }),
    glassDome: new T.MeshStandardMaterial({
      color: 0x3a4a52, metalness: 0.55, roughness: 0.06,
      transparent: true, opacity: 0.55
    }),
    red: new T.MeshStandardMaterial({ color: 0xb3121f, metalness: 0.28, roughness: 0.48 }),
    black: new T.MeshStandardMaterial({ color: 0x1c1f23, metalness: 0.35, roughness: 0.62 }),
    steel: new T.MeshStandardMaterial({ color: 0x8e959d, metalness: 0.78, roughness: 0.34 }),
    podGrn: mk('olive', { u: 1.4, v: 1, color: 0xd8d8d8 })
  };

  function cyl(r1, r2, len, mat, seg) {
    const g = new T.CylinderGeometry(r1, r2, len, seg || 20, 1, false);
    g.rotateX(Math.PI / 2);
    const m = new T.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  function band(r, w, z, mat) {
    const m = cyl(r * 1.008, r * 1.008, w, mat, 20);
    m.position.z = z;
    return m;
  }

  /* 梯形翼面：弦沿 x，展沿 y，厚沿 z */
  function finShape(cRoot, cTip, span, sweepFrac) {
    const s = new T.Shape();
    s.moveTo(0, 0);
    s.lineTo(cRoot, 0);
    s.lineTo(cRoot * sweepFrac + cTip, span);
    s.lineTo(cRoot * sweepFrac, span);
    s.closePath();
    return s;
  }

  function fin(cRoot, cTip, span, sweepFrac, thick, mat) {
    const g = new T.ExtrudeGeometry(finShape(cRoot, cTip, span, sweepFrac), {
      depth: thick, bevelEnabled: false, curveSegments: 1
    });
    g.translate(0, 0, -thick / 2);
    const m = new T.Mesh(g, mat);
    m.castShadow = true;
    return m;
  }

  /* X 形布置的舵面组 */
  function finSet(parent, cfg) {
    const az = cfg.azimuth || [45, 135, 225, 315];
    az.forEach(function (deg) {
      const g = new T.Group();
      g.position.z = cfg.z;
      g.rotation.z = deg * Math.PI / 180;
      const f = fin(cfg.cRoot, cfg.cTip, cfg.span, cfg.sweep === undefined ? 0.45 : cfg.sweep,
        cfg.thick || 0.014, cfg.mat);
      f.position.y = cfg.r;
      f.rotation.y = Math.PI / 2;
      g.add(f);
      parent.add(g);
    });
  }

  /* ---------------- 空空导弹 ---------------- */
  function buildAAM(o) {
    const g = new T.Group();
    const bodyMat = o.bodyMat || MAT.white;

    // 主弹体
    const body = cyl(o.r, o.r, o.len, bodyMat, 24);
    g.add(body);

    // 导引头天线罩（透波罩：深色 + 微透）
    const nose = new T.Mesh(new T.ConeGeometry(o.r, o.noseLen, 24, 1), MAT.seeker);
    nose.geometry.rotateX(Math.PI / 2);
    nose.position.z = o.len / 2 + o.noseLen / 2;
    nose.castShadow = true;
    g.add(nose);
    // 罩体分界环
    const ring = cyl(o.r * 1.03, o.r * 1.03, 0.03, MAT.dark, 24);
    ring.position.z = o.len / 2 + 0.012;
    g.add(ring);

    // 尾部收缩段 + 喷口
    const tail = cyl(o.r, o.r * 0.86, 0.14, bodyMat, 24);
    tail.position.z = -o.len / 2 - 0.06;
    g.add(tail);
    const noz = new T.Mesh(new T.CylinderGeometry(o.r * 0.60, o.r * 0.66, 0.06, 20, 1, true), MAT.steel);
    noz.geometry.rotateX(Math.PI / 2);
    noz.position.z = -o.len / 2 - 0.14;
    g.add(noz);

    // 弹翼与舵面
    finSet(g, {
      z: -o.len / 2 + o.finChord * 0.42, r: o.r * 0.97,
      cRoot: o.finChord, cTip: o.finChord * 0.42, span: o.finSpan,
      mat: bodyMat
    });
    if (o.canard) {
      finSet(g, {
        z: o.canardZ, r: o.r * 0.97,
        cRoot: o.canard, cTip: o.canard * 0.5, span: o.finSpan * 0.55,
        mat: bodyMat
      });
    }

    // 色带与标识
    g.add(band(o.r, o.bandW || 0.14, o.bandZ === undefined ? o.len * 0.18 : o.bandZ, o.bandMat || MAT.red));
    g.add(band(o.r, 0.05, -o.len / 2 + 0.10, MAT.dark));
    // 战斗部舱段环
    g.add(band(o.r, 0.028, o.len * 0.40, MAT.dark));

    // 吊挂凸耳 + 脐带整流罩
    [-0.30, 0.30].forEach(function (t) {
      const lug = new T.Mesh(new T.BoxGeometry(0.026, 0.05, 0.10), MAT.steel);
      lug.position.set(0, -o.r - 0.014, o.len * t);
      g.add(lug);
    });
    const umb = new T.Mesh(new T.BoxGeometry(0.05, 0.035, 0.22), MAT.dark);
    umb.position.set(0, -o.r + 0.004, o.len * 0.02);
    g.add(umb);
    return g;
  }

  /* ---------------- 火箭巢 ---------------- */
  function buildPod() {
    const g = new T.Group();
    const body = cyl(0.215, 0.215, 1.78, MAT.podGrn, 20);
    g.add(body);
    // 前后加强环
    [0.70, 0.30, -0.30, -0.70].forEach(function (z) {
      g.add(band(0.215, 0.045, z, MAT.dark));
    });
    const front = new T.Mesh(new T.CylinderGeometry(0.208, 0.238, 0.30, 20, 1, true), MAT.dark);
    front.geometry.rotateX(Math.PI / 2);
    front.position.z = 0.875 + 0.15;
    g.add(front);
    const cap = cyl(0.238, 0.238, 0.05, MAT.steel, 20);
    cap.position.z = 1.03;
    g.add(cap);
    // 发射管口（外圈 6 + 内圈 3）
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const tube = cyl(0.048, 0.048, 0.07, MAT.dark, 10);
      tube.position.set(Math.cos(a) * 0.128, Math.sin(a) * 0.128, 1.062);
      g.add(tube);
      const inner = new T.Mesh(new T.CircleGeometry(0.042, 10), MAT.black);
      inner.position.set(Math.cos(a) * 0.128, Math.sin(a) * 0.128, 1.072);
      g.add(inner);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.9;
      const tube = cyl(0.048, 0.048, 0.07, MAT.dark, 10);
      tube.position.set(Math.cos(a) * 0.062, Math.sin(a) * 0.062, 1.062);
      g.add(tube);
    }
    const tail = cyl(0.215, 0.205, 0.28, MAT.podGrn, 20);
    tail.position.z = -0.875 - 0.11;
    g.add(tail);
    // 吊挂
    [-0.28, 0.28].forEach(function (t) {
      const lug = new T.Mesh(new T.BoxGeometry(0.03, 0.055, 0.12), MAT.steel);
      lug.position.set(0, -0.215 - 0.016, 1.78 * t * 0.8);
      g.add(lug);
    });
    return g;
  }

  /* ---------------- 航空炸弹 ---------------- */
  function buildBomb() {
    const g = new T.Group();
    const body = cyl(0.152, 0.152, 1.05, MAT.olive, 20);
    g.add(body);
    const nose = new T.Mesh(new T.CylinderGeometry(0.152, 0.058, 0.44, 20, 1), MAT.olive);
    nose.geometry.rotateX(Math.PI / 2);
    nose.position.z = 0.525 + 0.22;
    g.add(nose);
    const tail = cyl(0.152, 0.152, 0.40, MAT.olive, 20);
    tail.position.z = -0.525 - 0.20;
    g.add(tail);
    finSet(g, {
      z: -0.90, r: 0.145, cRoot: 0.30, cTip: 0.16, span: 0.20,
      sweep: 0.35, thick: 0.012, mat: MAT.olive
    });
    // 保险/引信 + 弹道环
    const fuse = cyl(0.030, 0.030, 0.10, MAT.steel, 10);
    fuse.position.z = 1.185;
    g.add(fuse);
    g.add(band(0.152, 0.05, 0.42, MAT.dark));
    g.add(band(0.152, 0.035, -0.10, MAT.red));
    [-0.24, 0.24].forEach(function (t) {
      const lug = new T.Mesh(new T.BoxGeometry(0.028, 0.05, 0.11), MAT.steel);
      lug.position.set(0, -0.152 - 0.014, t);
      g.add(lug);
    });
    return g;
  }

  /* ---------------- 副油箱 ---------------- */
  function buildTank() {
    const g = new T.Group();
    const body = cyl(0.265, 0.265, 2.60, MAT.grey, 22);
    g.add(body);
    // 焊/铆接环
    [0.85, 0.30, -0.35, -0.95].forEach(function (z) {
      g.add(band(0.265, 0.035, z, MAT.grey));
    });
    const nose = new T.Mesh(new T.CylinderGeometry(0.265, 0.075, 0.55, 22, 1), MAT.grey);
    nose.geometry.rotateX(Math.PI / 2);
    nose.position.z = 1.30 + 0.275;
    g.add(nose);
    const tail = new T.Mesh(new T.CylinderGeometry(0.265, 0.095, 0.42, 22, 1), MAT.grey);
    tail.geometry.rotateX(Math.PI / 2);
    tail.position.z = -1.30 - 0.21;
    g.add(tail);
    finSet(g, {
      z: -1.56, r: 0.255, cRoot: 0.26, cTip: 0.12, span: 0.19,
      sweep: 0.4, thick: 0.012, mat: MAT.grey
    });
    const cap = cyl(0.085, 0.085, 0.05, MAT.steel, 14);
    cap.position.z = 1.60;
    g.add(cap);
    g.add(band(0.265, 0.08, 0.9, MAT.red));
    [-0.62, 0.62].forEach(function (t) {
      const lug = new T.Mesh(new T.BoxGeometry(0.032, 0.06, 0.14), MAT.steel);
      lug.position.set(0, -0.265 - 0.018, t);
      g.add(lug);
    });
    return g;
  }

  /* ---------------- 外挂物清单 ---------------- */
  const BUILDERS = {
    none: null,
    pl2: function () {
      return buildAAM({ len: 2.55, r: 0.064, noseLen: 0.42, finSpan: 0.30, finChord: 0.42, canard: 0.26, canardZ: 0.95, bandW: 0.10 });
    },
    pl5: function () {
      return buildAAM({ len: 2.68, r: 0.064, noseLen: 0.44, finSpan: 0.31, finChord: 0.44, canard: 0.28, canardZ: 0.98, bandW: 0.10 });
    },
    pl8: function () {
      const g = buildAAM({
        len: 2.55, r: 0.080, noseLen: 0.44, finSpan: 0.42, finChord: 0.52,
        canard: 0.34, canardZ: 0.92, bandW: 0.12, bandZ: 0.55
      });
      // PL-8 标志性的后掠大三角尾翼整流罩
      const fair = cyl(0.098, 0.086, 0.58, MAT.white, 18);
      fair.position.z = -1.02;
      g.add(fair);
      return g;
    },
    pl11: function () {
      return buildAAM({
        len: 3.10, r: 0.101, noseLen: 0.60, finSpan: 0.50, finChord: 0.56,
        canard: 0.42, canardZ: 1.05, bandW: 0.14, bandZ: 0.75,
        seekerMat: MAT.grey, bodyMat: MAT.white
      });
    },
    rocketpod: buildPod,
    bomb250: buildBomb,
    tank: buildTank
  };

  const CACHE = {};
  function build(kind) {
    const fn = BUILDERS[kind];
    if (!fn) return null;
    if (!CACHE[kind]) CACHE[kind] = fn();
    return CACHE[kind].clone(true);
  }

  /* ---------------- 挂架 ---------------- */
  function buildPylon(scale) {
    const s = scale || 1;
    const g = new T.Group();
    const h = 0.34 * s, w = 0.10, l = 0.86 * s;
    const shape = new T.Shape();
    shape.moveTo(-l / 2, 0);
    shape.lineTo(l / 2, 0);
    shape.lineTo(l / 2 * 0.82, -h);
    shape.lineTo(-l / 2 * 0.86, -h);
    shape.closePath();
    const geo = new T.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false, curveSegments: 1 });
    geo.translate(0, 0, -w / 2);
    geo.rotateY(Math.PI / 2);
    const m = new T.Mesh(geo, MAT.grey);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);

    // 内部支撑肋
    const brace = new T.Mesh(new T.BoxGeometry(0.06, 0.10, 0.5 * s), MAT.grey);
    brace.position.set(0, -h * 0.5, 0);
    brace.castShadow = true;
    g.add(brace);

    // 弹射挂钩
    [-0.22, 0.22].forEach(function (t) {
      const hook = new T.Mesh(new T.BoxGeometry(0.035, 0.055, 0.055), MAT.steel);
      hook.position.set(0, -h + 0.012, t * s);
      g.add(hook);
    });
    // 止动摇臂
    [-0.30, 0.30].forEach(function (t) {
      const sw = new T.Mesh(new T.CylinderGeometry(0.016, 0.016, 0.10, 8), MAT.steel);
      sw.rotation.x = Math.PI / 2;
      sw.position.set(0, -h + 0.03, t * s);
      g.add(sw);
    });
    // 与机翼连接的整流顶板
    const top = new T.Mesh(new T.BoxGeometry(0.13, 0.025, 0.92 * s), MAT.grey);
    top.position.set(0, -0.012, 0);
    g.add(top);
    return g;
  }

  /* ---------------- 翼尖导轨 ---------------- */
  function buildTipRail() {
    const g = new T.Group();
    // 导轨主体（细长条，沿弦向 z）
    const rail = new T.Mesh(new T.BoxGeometry(0.075, 0.075, 1.30), MAT.grey);
    rail.castShadow = true;
    g.add(rail);
    // 顶部连接板（贴翼尖端面）
    const top = new T.Mesh(new T.BoxGeometry(0.10, 0.030, 1.42), MAT.grey);
    top.position.y = 0.045;
    g.add(top);
    // 前后整流罩头
    const nose = new T.Mesh(new T.ConeGeometry(0.048, 0.16, 10), MAT.grey);
    nose.geometry.rotateX(-Math.PI / 2);
    nose.position.z = 0.73;
    g.add(nose);
    const tail = new T.Mesh(new T.ConeGeometry(0.048, 0.14, 10), MAT.grey);
    tail.geometry.rotateX(Math.PI / 2);
    tail.position.z = -0.72;
    g.add(tail);
    // 发射挂钩
    [-0.18, 0.18].forEach(function (t) {
      const hook = new T.Mesh(new T.BoxGeometry(0.030, 0.05, 0.05), MAT.steel);
      hook.position.set(0, -0.055, t);
      g.add(hook);
    });
    return g;
  }

  global.WeaponFactory = { build: build, buildPylon: buildPylon, buildTipRail: buildTipRail, MAT: MAT };
})(window);
