/* ============================================================
   airframe.js — 歼-8B 机体结构建模（战争雷霆标准）
   坐标约定：机头朝 +Z，右翼 +X，上方 +Y，1 单位 = 1 米
   机身参考面 y=0，地面在 y=-2.42
   主要尺寸：机长 21.59 m / 翼展 9.34 m / 翼面积 42.2 m²
   ============================================================ */
(function (global) {
  'use strict';
  const T = THREE;
  const TX = global.J8TEX;
  const GROUND_Y = -2.42;

  /* ---------------- 通用几何工具 ---------------- */
  function loft(sections, opts) {
    opts = opts || {};
    const closed = opts.closed !== false;
    const flip = !!opts.flip;
    const uRep = opts.uRep || 1, vRep = opts.vRep || 1, vOff = opts.vOff || 0;
    const ns = sections.length, np = sections[0].length;
    const pos = [], uv = [], idx = [];
    for (let s = 0; s < ns; s++) {
      for (let i = 0; i < np; i++) {
        const p = sections[s][i];
        pos.push(p.x, p.y, p.z);
        uv.push((i / (np - 1)) * uRep, vOff + (s / (ns - 1)) * vRep);
      }
    }
    const lim = closed ? np : np - 1;
    for (let s = 0; s < ns - 1; s++) {
      for (let i = 0; i < lim; i++) {
        const i2 = (i + 1) % np;
        const A = s * np + i, B = (s + 1) * np + i, C = (s + 1) * np + i2, D = s * np + i2;
        if (flip) idx.push(A, D, B, B, D, C);
        else idx.push(A, B, D, B, C, D);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function ringOval(z, rx, ry, yc, np, power, xc) {
    const pts = [], p = power || 2, x0 = xc || 0;
    for (let i = 0; i < np; i++) {
      const t = (i / np) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      const x = x0 + rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
      const y = yc + ry * Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
      pts.push(new T.Vector3(x, y, z));
    }
    return pts;
  }

  function ringRect(z, w, h, r, yc, xc) {
    const pts = [], w2 = w / 2, h2 = h / 2, seg = 5;
    const corners = [
      [xc + w2 - r, yc + h2 - r, 0], [xc - w2 + r, yc + h2 - r, Math.PI / 2],
      [xc - w2 + r, yc - h2 + r, Math.PI], [xc + w2 - r, yc - h2 + r, Math.PI * 1.5]
    ];
    for (let c = 0; c < 4; c++) {
      const cc = corners[c];
      for (let i = 0; i <= seg; i++) {
        const a = cc[2] + (i / seg) * Math.PI / 2;
        pts.push(new T.Vector3(cc[0] + r * Math.cos(a), cc[1] + r * Math.sin(a), z));
      }
    }
    return pts;
  }

  function ringAirfoil(ze, chord, thick, yc, x, n) {
    const pts = [], nn = n || 9;
    const f = function (u) { return Math.pow(Math.max(0, 1 - Math.pow(2 * u - 1, 2)), 0.6); };
    for (let i = 0; i <= nn; i++) {
      const u = i / nn;
      pts.push(new T.Vector3(x, yc + (thick / 2) * f(u), ze - chord * u));
    }
    for (let i = nn - 1; i >= 1; i--) {
      const u = i / nn;
      pts.push(new T.Vector3(x, yc - (thick / 2) * f(u), ze - chord * u));
    }
    return pts;
  }

  function ringFin(ze, chord, thick, xc, y, n) {
    const pts = [], nn = n || 9;
    const f = function (u) { return Math.pow(Math.max(0, 1 - Math.pow(2 * u - 1, 2)), 0.55); };
    for (let i = 0; i <= nn; i++) {
      const u = i / nn;
      pts.push(new T.Vector3(xc - (thick / 2) * f(u), y, ze - chord * u));
    }
    for (let i = nn - 1; i >= 1; i--) {
      const u = i / nn;
      pts.push(new T.Vector3(xc + (thick / 2) * f(u), y, ze - chord * u));
    }
    return pts;
  }

  function mirrorX(geo) {
    const g = geo.clone();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    p.needsUpdate = true; g.index.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }

  function oriented(obj, origin, xDir, zDir) {
    const x = xDir.clone().normalize();
    const z = zDir.clone().sub(x.clone().multiplyScalar(zDir.dot(x))).normalize();
    const y = new T.Vector3().crossVectors(z, x);
    obj.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
    obj.position.copy(origin);
    return obj;
  }

  // 控制面薄板：铰链在局部 z=0，弦向 -z 延伸，局部 x 为展向
  function ctrlSurface(span, chordRoot, chordTip, thick) {
    const g = new T.BoxGeometry(span, thick, 1, 2, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + span / 2;
      const k = x / span;
      const chord = chordRoot + (chordTip - chordRoot) * k;
      p.setZ(i, -(p.getZ(i) + 0.5) * chord);
      p.setX(i, x);
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }

  /* ============================================================
     材质体系：全部基于程序化 PBR 贴图
     ============================================================ */
  const SET = {
    fuse: TX.skinSet({
      size: 1024, seed: 7, base: '#a8b3be',
      cols: 7, rows: 5, panels: 18, streaks: 54, wear: 1.0, mottle: 1.0
    }),
    wing: TX.skinSet({
      size: 1024, seed: 19, base: '#a4afba',
      cols: 6, rows: 6, panels: 11, streaks: 34, wear: 0.9, mottle: 0.9
    }),
    ctl: TX.skinSet({
      size: 512, seed: 31, base: '#b1bbc5',
      cols: 4, rows: 4, panels: 6, streaks: 18, wear: 0.8, mottle: 0.7
    }),
    fair: TX.skinSet({
      size: 512, seed: 43, base: '#b7c1cb',
      cols: 4, rows: 3, panels: 5, streaks: 14, wear: 0.7, mottle: 0.6,
      roughLo: 100, roughHi: 158
    }),
    grime: TX.skinSet({
      size: 512, seed: 57, base: '#8e98a3',
      cols: 5, rows: 4, panels: 6, streaks: 40, wear: 1.4, mottle: 1.2, soot: 0.72
    }),
    metal: TX.metalSet({ base: '#98a0a9', seed: 23, heat: true }),
    nozzle: TX.nozzleSet(),
    radome: TX.radomeSet(),
    tire: TX.tireSet()
  };

  const _matCache = {};
  function mkMat(set, o) {
    o = o || {};
    const m = new T.MeshStandardMaterial({
      color: o.color === undefined ? 0xffffff : o.color,
      metalness: o.metalness === undefined ? (set.metalness === undefined ? 0.34 : set.metalness) : o.metalness,
      roughness: o.roughness === undefined ? 0.56 : o.roughness,
      side: o.side || T.FrontSide
    });
    const u = o.uRep || 1, v = o.vRep || 1;
    function cloneMap(src) {
      const t = src.clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(u, v);
      t.anisotropy = 8;
      return t;
    }
    if (set.map) { m.map = cloneMap(set.map); m.map.encoding = T.sRGBEncoding; }
    if (set.normalMap) {
      m.normalMap = cloneMap(set.normalMap);
      const s = o.bumpS === undefined ? 1 : o.bumpS;
      m.normalScale = new T.Vector2(s, s);
    }
    if (set.roughnessMap) m.roughnessMap = cloneMap(set.roughnessMap);
    return m;
  }
  function cached(key, fn) {
    if (!_matCache[key]) _matCache[key] = fn();
    return _matCache[key];
  }

  const MAT = {
    skin: cached('skin', function () { return mkMat(SET.fuse, { uRep: 2.5, vRep: 10.2, bumpS: 1.5, roughness: 0.60 }); }),
    wing: cached('wing', function () { return mkMat(SET.wing, { uRep: 3.0, vRep: 2.3, bumpS: 1.3, roughness: 0.60 }); }),
    skinCtl: cached('skinCtl', function () { return mkMat(SET.ctl, { uRep: 1.6, vRep: 1.4, bumpS: 0.85 }); }),
    skinLight: cached('skinLight', function () { return mkMat(SET.fair, { uRep: 1.2, vRep: 1.2, bumpS: 0.8 }); }),
    grime: cached('grime', function () { return mkMat(SET.grime, { uRep: 2.0, vRep: 1.4, bumpS: 0.9 }); }),
    radome: cached('radome', function () { return mkMat(SET.radome, { uRep: 3, vRep: 3, bumpS: 0.8, metalness: 0.12, roughness: 0.74 }); }),
    metal: cached('metal', function () { return mkMat(SET.metal, { uRep: 2, vRep: 2, metalness: 0.86, roughness: 0.32 }); }),
    nozzle: cached('nozzle', function () { return mkMat(SET.nozzle, { uRep: 3.2, vRep: 1, metalness: 0.9, roughness: 0.44, side: T.DoubleSide }); }),
    tire: cached('tire', function () { return mkMat(SET.tire, { uRep: 4, vRep: 1, metalness: 0.03, roughness: 0.88 }); }),

    dark: new T.MeshStandardMaterial({ color: 0x2a2f36, metalness: 0.42, roughness: 0.62 }),
    steel: new T.MeshStandardMaterial({ color: 0x6d747d, metalness: 0.88, roughness: 0.30 }),
    nozzleIn: new T.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.55, roughness: 0.82, side: T.DoubleSide }),
    duct: cached('duct', function () { return mkMat(SET.fair, { uRep: 1.4, vRep: 2.2, color: 0xdfe6ee, bumpS: 0.9 }); }),
    ductIn: new T.MeshStandardMaterial({ color: 0x14161a, metalness: 0.30, roughness: 0.92, side: T.DoubleSide }),
    glass: new T.MeshStandardMaterial({
      color: 0x8fb6d6, metalness: 0.30, roughness: 0.05,
      transparent: true, opacity: 0.22, side: T.DoubleSide, depthWrite: false
    }),
    hudGlass: new T.MeshStandardMaterial({
      color: 0x7fd0b0, metalness: 0.1, roughness: 0.03,
      transparent: true, opacity: 0.26, side: T.DoubleSide, depthWrite: false
    }),
    frame: new T.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.52, roughness: 0.48 }),
    cockpit: new T.MeshStandardMaterial({ color: 0x24282e, metalness: 0.30, roughness: 0.78 }),
    seat: new T.MeshStandardMaterial({ color: 0x3f4a3c, metalness: 0.18, roughness: 0.80 }),
    hub: new T.MeshStandardMaterial({ color: 0x9ba3ac, metalness: 0.80, roughness: 0.34 }),
    pitot: new T.MeshStandardMaterial({ color: 0x2b3038, metalness: 0.82, roughness: 0.34 }),
    gun: new T.MeshStandardMaterial({ color: 0x35393f, metalness: 0.86, roughness: 0.42 }),

    lampR: new T.MeshStandardMaterial({ color: 0x8c1220, emissive: 0xc41a2c, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.25 }),
    lampG: new T.MeshStandardMaterial({ color: 0x0f5a2c, emissive: 0x18b352, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.25 }),
    lampW: new T.MeshStandardMaterial({ color: 0xd8dde4, emissive: 0xfff0d0, emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.25 }),

    insignia: new T.MeshStandardMaterial({
      map: TX.insigniaTex(false), transparent: true, alphaTest: 0.35,
      metalness: 0.18, roughness: 0.62,
      polygonOffset: true, polygonOffsetFactor: -4, side: T.DoubleSide
    }),
    insigniaLo: new T.MeshStandardMaterial({
      map: TX.insigniaTex(true), transparent: true, alphaTest: 0.35,
      metalness: 0.18, roughness: 0.62,
      polygonOffset: true, polygonOffsetFactor: -4, side: T.DoubleSide
    })
  };
  MAT.insignia.map.wrapS = MAT.insignia.map.wrapT = T.ClampToEdgeWrapping;
  MAT.insigniaLo.map.wrapS = MAT.insigniaLo.map.wrapT = T.ClampToEdgeWrapping;

  function decalMat(text, o) {
    return new T.MeshStandardMaterial({
      map: TX.textTex(text, o), transparent: true, alphaTest: 0.28,
      metalness: 0.1, roughness: 0.66,
      polygonOffset: true, polygonOffsetFactor: -4, side: T.DoubleSide
    });
  }

  /* ============================================================
     J8B 主类
     ============================================================ */
  function J8B() {
    this.root = new T.Group();
    this.root.position.y = -GROUND_Y;
    this.mech = {};
    this.stations = [];
    this.labelAnchors = [];
    this.target = { flap: 0, brake: 0, gear: 1, canopy: 0, stab: 0 };
    this.cur = { flap: 0, brake: 0, gear: 1, canopy: 0 };
    this.abGlow = 0;
    this.buildAirframe();
    if (this.buildDetails) this.buildDetails();
    if (this.buildMechanisms) this.buildMechanisms();
    if (this.buildStations) this.buildStations();
    if (this.buildLabels) this.buildLabels();
  }

  J8B.prototype.addPart = function (geo, mat, parent) {
    const m = new T.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    (parent || this.root).add(m);
    return m;
  };

  J8B.prototype.buildAirframe = function () {
    this.buildFuselage();
    this.buildCanopy();
    this.buildWing();
    this.buildIntakes();
    this.buildTails();
    this.buildEngine();
    this.buildDecals();
  };

  /* ---------------- 机身 ---------------- */
  J8B.prototype.buildFuselage = function () {
    const NP = 34;
    // [z, rx, ry, yc, 截面幂次] —— 幂次越大越接近圆角矩形，贴近真机中段
    const st = [
      [9.95, 0.235, 0.235, 0.00, 2.0], [9.40, 0.278, 0.278, 0.00, 2.0],
      [8.80, 0.326, 0.326, 0.00, 2.05], [8.10, 0.398, 0.400, 0.00, 2.10],
      [7.40, 0.470, 0.474, 0.00, 2.15], [6.60, 0.540, 0.548, 0.00, 2.20],
      [5.60, 0.598, 0.612, 0.00, 2.30], [4.60, 0.640, 0.658, 0.00, 2.40],
      [3.40, 0.682, 0.700, 0.00, 2.50], [2.20, 0.710, 0.726, 0.00, 2.55],
      [1.00, 0.732, 0.744, 0.00, 2.60], [-0.20, 0.746, 0.756, 0.00, 2.62],
      [-1.60, 0.758, 0.766, 0.00, 2.62], [-3.00, 0.766, 0.772, 0.00, 2.62],
      [-4.20, 0.770, 0.774, 0.00, 2.60], [-5.20, 0.770, 0.772, 0.00, 2.58],
      [-6.20, 0.768, 0.768, 0.00, 2.56], [-7.40, 0.766, 0.762, 0.00, 2.54],
      [-8.60, 0.760, 0.752, 0.00, 2.52], [-9.60, 0.752, 0.740, 0.00, 2.50],
      [-10.30, 0.744, 0.730, 0.00, 2.50]
    ];
    const secs = st.map(function (s) { return ringOval(s[0], s[1], s[2], s[3], NP, s[4]); });
    this.fuselage = this.addPart(loft(secs, { uRep: 2.5, vRep: 10.2 }), MAT.skin);

    /* 雷达罩：切尖卵形，长 1.23 m */
    const rn = [
      [9.95, 0.235], [10.28, 0.213], [10.60, 0.181], [10.86, 0.142],
      [11.03, 0.098], [11.12, 0.055], [11.18, 0.016]
    ];
    const rnSecs = rn.map(function (s) { return ringOval(s[0], s[1], s[1], 0, NP, 2.0); });
    this.radome = this.addPart(loft(rnSecs, { uRep: 2.5, vRep: 0.8 }), MAT.radome);

    /* 雷达罩与机身对接环（带分缝） */
    const rring = new T.Mesh(new T.CylinderGeometry(0.245, 0.245, 0.055, 34, 1, true), MAT.frame);
    rring.geometry.rotateX(Math.PI / 2);
    rring.position.z = 9.95; rring.castShadow = true;
    this.root.add(rring);
    const rnail = new T.Mesh(new T.TorusGeometry(0.238, 0.012, 6, 34), MAT.metal);
    rnail.position.z = 9.90;
    this.root.add(rnail);

    /* 尾端整流罩 */
    const cap = new T.Mesh(new T.CircleGeometry(0.735, 34), MAT.nozzleIn);
    cap.rotation.y = Math.PI; cap.position.z = -10.31;
    this.root.add(cap);

    /* 机身腹部龙骨 / 尾锥 */
    const keel = this.addPart(
      loft([
        ringOval(2.10, 0.20, 0.10, -0.74, 14, 2.4), ringOval(0.60, 0.235, 0.115, -0.79, 14, 2.4),
        ringOval(-1.60, 0.245, 0.12, -0.81, 14, 2.4), ringOval(-3.60, 0.22, 0.10, -0.80, 14, 2.4),
        ringOval(-5.40, 0.16, 0.075, -0.78, 14, 2.4)
      ], { uRep: 1, vRep: 2 }), MAT.skinLight);

    this.labelAnchors.push({ text: '雷达罩 / 机载雷达', at: new T.Vector3(0, 0.28, 10.5) });
    this.labelAnchors.push({ text: '空速管', at: new T.Vector3(0, 0.12, 12.0) });
  };

  /* ---------------- 座舱盖（外罩与框架） ---------------- */
  J8B.prototype.buildCanopy = function () {
    const NP = 22;
    // 加长水滴形舱盖：z 5.05~7.85，峰值顶 0.995
    const st = [
      [7.85, 0.26, 0.10, 0.575], [7.50, 0.42, 0.30, 0.56], [7.10, 0.51, 0.42, 0.545],
      [6.60, 0.55, 0.50, 0.535], [6.10, 0.54, 0.49, 0.535], [5.60, 0.48, 0.43, 0.545],
      [5.05, 0.36, 0.28, 0.555]
    ];
    const secs = st.map(function (s) {
      const ring = [], hw = s[1], h = s[2], y0 = s[3];
      for (let i = 0; i <= NP; i++) {
        const t = (i / NP) * Math.PI;
        ring.push(new T.Vector3(hw * Math.cos(t), y0 + h * Math.sin(t) * 0.92, s[0]));
      }
      for (let i = NP; i >= 0; i--) {
        const t = (i / NP) * Math.PI;
        ring.push(new T.Vector3(hw * Math.cos(t), y0 - 0.06, s[0]));
      }
      return ring;
    });
    this.mech.canopy = this.addPart(loft(secs, { uRep: 1, vRep: 1 }), MAT.glass);

    /* 弧形框架：按站位贴合舱盖轮廓（椭圆半环） */
    function ring(x, y, z, sx, sy, mat) {
      const g = new T.TorusGeometry(1, 0.026, 6, 20, Math.PI);
      const m = new T.Mesh(g, mat);
      m.scale.set(sx, sy, 1);
      m.position.set(x, y, z);
      m.castShadow = true;
      return m;
    }
    const fr = this.root;
    // 风挡前缘弧（略前倾）
    const fwd = ring(0, 0.575, 7.74, 0.32, 0.15, MAT.frame);
    fwd.rotation.x = 0.30; fr.add(fwd);
    [[7.10, 0.51, 0.386, 0.545], [6.60, 0.55, 0.460, 0.535],
     [6.00, 0.54, 0.451, 0.535], [5.45, 0.42, 0.320, 0.550]].forEach(function (s) {
      fr.add(ring(0, s[3], s[0], s[1], s[2], MAT.frame));
    });
    // 顶部纵向加强筋
    const f2 = new T.Mesh(new T.BoxGeometry(1.05, 0.05, 0.09), MAT.frame);
    f2.position.set(0, 0.975, 6.60); fr.add(f2);
    // 风挡根部横框
    const f1 = new T.Mesh(new T.BoxGeometry(0.72, 0.05, 0.10), MAT.frame);
    f1.position.set(0, 0.60, 7.70); fr.add(f1);

    /* 座舱后长背鳍：等高脊条自舱盖后缘延伸至垂尾根部整流罩 */
    const sp = [
      [5.30, 0.36, 0.32, 0.50], [3.80, 0.37, 0.34, 0.46], [2.20, 0.37, 0.35, 0.45],
      [0.60, 0.36, 0.36, 0.44], [-1.00, 0.34, 0.37, 0.44], [-2.40, 0.32, 0.38, 0.44],
      [-3.30, 0.30, 0.36, 0.46]
    ];
    const spSecs = sp.map(function (s) {
      const ring = [], n = 16;
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * Math.PI;
        ring.push(new T.Vector3(s[1] * Math.cos(t), s[3] + s[2] * Math.sin(t), s[0]));
      }
      for (let i = n; i >= 0; i--) {
        const t = (i / n) * Math.PI;
        ring.push(new T.Vector3(s[1] * Math.cos(t), s[3] - 0.05, s[0]));
      }
      return ring;
    });
    this.mech.spine = this.addPart(loft(spSecs, { uRep: 1, vRep: 2 }), MAT.skinLight);
    this.labelAnchors.push({ text: '座舱盖（可开启）', at: new T.Vector3(0, 1.08, 6.6) });
  };

  /* ---------------- 机翼 ---------------- */
  J8B.prototype.buildWing = function () {
    const hinge = function (x) {
      return x <= 2.10 ? -3.825 - x * (1.135 / 2.10) : -4.96 - (x - 2.10) * (1.55 / 2.57);
    };
    const le = function (x) {
      return x <= 2.10 ? 2.40 - x * 1.81 : -1.39 - (x - 2.10) * 1.60;
    };
    this._wing = { hinge: hinge, le: le, te: function (x) {
      return x <= 2.10 ? -5.90 - x * (0.25 / 2.10) : -6.15 - (x - 2.10) * (0.70 / 2.57);
    } };

    const stations = [
      { x: 0.00, yc: -0.10, th: 0.40 }, { x: 0.55, yc: -0.11, th: 0.36 },
      { x: 1.10, yc: -0.12, th: 0.31 }, { x: 1.60, yc: -0.13, th: 0.265 },
      { x: 2.10, yc: -0.14, th: 0.22 }, { x: 2.75, yc: -0.15, th: 0.175 },
      { x: 3.40, yc: -0.16, th: 0.14 }, { x: 4.05, yc: -0.17, th: 0.100 },
      { x: 4.67, yc: -0.18, th: 0.062 }
    ];
    const secs = stations.map(function (s) {
      const ze = le(s.x), zh = hinge(s.x);
      return ringAirfoil(ze, ze - zh, s.th, s.yc, s.x, 12);
    });
    const gR = loft(secs, { uRep: 3.0, vRep: 2.3 });
    this.mech.wingR = this.addPart(gR, MAT.wing);
    this.mech.wingL = this.addPart(mirrorX(gR), MAT.wing);

    /* 翼根前缘延伸（边条） */
    [1, -1].forEach(function (sign) {
      const sh = new T.Shape();
      sh.moveTo(0, 0); sh.lineTo(1.55, 0); sh.lineTo(1.35, 0.30); sh.lineTo(0, 0.16);
      sh.closePath();
      const g = new T.ExtrudeGeometry(sh, { depth: 0.055, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      const m = new T.Mesh(g, MAT.skinLight);
      m.rotation.z = sign * (Math.PI / 2);
      m.position.set(sign * 0.62, -0.075, 2.42);
      m.castShadow = true;
      this.root.add(m);
    }.bind(this));

    /* 翼根部整流（后缘延伸） */
    [1, -1].forEach(function (sign) {
      const fil = this.addPart(new T.BoxGeometry(0.30, 0.46, 6.4), MAT.skinLight);
      fil.position.set(sign * 0.58, -0.11, -1.7);
    }.bind(this));

    /* 翼尖 */
    [1, -1].forEach(function (sign) {
      const tip = new T.Mesh(new T.SphereGeometry(0.09, 14, 10), MAT.wing);
      tip.scale.set(0.6, 0.42, 3.6);
      tip.position.set(sign * 4.67, -0.18, -6.0);
      tip.castShadow = true; this.root.add(tip);
    }.bind(this));

    this.labelAnchors.push({ text: '三角机翼（面积 42.2 m²）', at: new T.Vector3(3.2, -0.42, -3.4) });
  };

  /* ---------------- 两侧进气道 ---------------- */
  J8B.prototype.buildIntakes = function () {
    const self = this;
    const zs = [4.30, 3.85, 2.90, 1.55, 0.55];
    function duct(sign) {
      const secs = zs.map(function (z, i) {
        const w = 0.31 + i * 0.014;
        return ringRect(z, w, 0.70 + i * 0.026, 0.062, 0.02, sign * (0.755 + w / 2));
      });
      return sign > 0 ? loft(secs, { uRep: 1.2, vRep: 2.2 }) : mirrorX(loft(secs, { uRep: 1.2, vRep: 2.2 }));
    }
    this.mech.ductR = this.addPart(duct(1), MAT.duct);
    this.mech.ductL = this.addPart(duct(-1), MAT.duct);

    [1, -1].forEach(function (sign) {
      const xc = sign * 0.91;
      // 进气道内腔
      const cav = new T.Mesh(new T.PlaneGeometry(0.31, 0.70), MAT.ductIn);
      cav.position.set(xc, 0.02, 2.95);
      cav.rotation.y = sign > 0 ? Math.PI : 0;
      self.root.add(cav);

      // 激波锥（三级可调）
      const cone = new T.Mesh(new T.ConeGeometry(0.105, 0.58, 16, 1), MAT.metal);
      cone.geometry.rotateX(-Math.PI / 2);
      cone.position.set(xc, 0.02, 4.02);
      cone.castShadow = true; self.root.add(cone);
      const coneBase = new T.Mesh(new T.CylinderGeometry(0.112, 0.112, 0.05, 16), MAT.frame);
      coneBase.geometry.rotateX(Math.PI / 2);
      coneBase.position.set(xc, 0.02, 3.71); self.root.add(coneBase);
      // 激波锥支撑臂
      [0, 2.1, 4.2].forEach(function (a) {
        const arm = new T.Mesh(new T.BoxGeometry(0.02, 0.20, 0.02), MAT.steel);
        arm.position.set(xc + Math.sin(a) * 0.09, 0.02 + Math.cos(a) * 0.09, 3.86);
        arm.rotation.z = -a;
        self.root.add(arm);
      });

      // 附面层隔道板
      const sp = new T.Mesh(new T.BoxGeometry(0.028, 0.78, 3.9), MAT.metal);
      sp.position.set(sign * 0.748, 0.02, 2.25);
      sp.castShadow = true; self.root.add(sp);

      // 唇口
      const lip = new T.Mesh(new T.TorusGeometry(0.255, 0.021, 6, 22), MAT.frame);
      lip.scale.set(0.87, 1.66, 1);
      lip.position.set(xc, 0.02, 4.30);
      self.root.add(lip);

      // 进气道放气门（百叶）
      for (let i = 0; i < 4; i++) {
        const lv = new T.Mesh(new T.BoxGeometry(0.26, 0.012, 0.055), MAT.steel);
        lv.position.set(sign * 0.97, 0.34, 1.30 - i * 0.16);
        lv.rotation.x = -0.55;
        self.root.add(lv);
      }
    });

    this.labelAnchors.push({ text: '两侧矩形进气道 + 激波锥', at: new T.Vector3(1.55, 0.66, 4.30) });
    this.labelAnchors.push({ text: '附面层隔道板', at: new T.Vector3(-1.24, 0.70, 1.90) });
  };

  /* ---------------- 尾翼组 ---------------- */
  J8B.prototype.buildTails = function () {
    const self = this;

    /* 垂尾 */
    const fs = [
      { y: 0.42, ze: -3.25, zh: -7.06, th: 0.34 },
      { y: 0.95, ze: -4.30, zh: -7.58, th: 0.30 },
      { y: 1.40, ze: -5.20, zh: -8.02, th: 0.26 },
      { y: 1.95, ze: -6.15, zh: -8.46, th: 0.215 },
      { y: 2.40, ze: -6.90, zh: -8.83, th: 0.17 },
      { y: 2.85, ze: -7.55, zh: -9.12, th: 0.125 },
      { y: 3.20, ze: -8.00, zh: -9.32, th: 0.09 }
    ].map(function (s) { return ringFin(s.ze, s.ze - s.zh, s.th, 0, s.y, 11); });
    this.mech.fin = this.addPart(loft(fs, { uRep: 1.4, vRep: 4 }), MAT.wing);

    /* 垂尾根部整流罩 */
    const fillet = this.addPart(new T.BoxGeometry(0.28, 0.46, 3.05), MAT.skinLight);
    fillet.position.set(0, 0.60, -4.6);

    /* 方向舵（带铰链整流罩） */
    const hingeRoot = new T.Vector3(0, 0.42, -7.06);
    const hDir = new T.Vector3(0, 3.20, -9.32).sub(hingeRoot);
    const rm = new T.Mesh(ctrlSurface(hDir.length(), 2.54, 0.88, 0.075), MAT.skinCtl);
    rm.castShadow = true;
    const pivot = new T.Group(), inner = new T.Group();
    inner.add(rm); pivot.add(inner);
    oriented(pivot, hingeRoot, hDir, new T.Vector3(0, 0, 1));
    this.root.add(pivot);
    this.mech.rudder = { pivot: pivot, inner: inner };
    // 铰链整流罩
    [0.28, 0.62, 0.92].forEach(function (t) {
      const p = hingeRoot.clone().lerp(new T.Vector3(0, 3.20, -9.32), t);
      const b = new T.Mesh(new T.CylinderGeometry(0.055, 0.055, 0.30, 10), MAT.frame);
      b.geometry.rotateZ(Math.PI / 2);
      b.position.copy(p);
      self.root.add(b);
    });

    /* 腹鳍：弦向布置（前缘后掠），左右各一、向外倾 8° */
    [1, -1].forEach(function (sign) {
      // 形状定义在 (z, y) 平面：绝对机身坐标
      const sh = new T.Shape();
      sh.moveTo(-6.95, -0.66);   // 根部前缘
      sh.lineTo(-8.55, -0.66);   // 根部后缘
      sh.lineTo(-8.55, -1.06);   // 翼尖后缘
      sh.lineTo(-7.70, -1.24);   // 翼尖前缘（后掠）
      sh.closePath();
      const g = new T.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false });
      g.translate(0, 0, -0.025);         // 挤出厚度（原 z 向）居中
      g.rotateY(-Math.PI / 2);           // (x,y,z)→(-z,y,x)：弦向 → 机体 z，厚度 → x
      const m = new T.Mesh(g, MAT.wing);
      m.position.set(sign * 0.30, -0.66, 0);
      m.rotation.z = sign * 0.14;        // 向外倾约 8°
      m.castShadow = true;
      self.root.add(m);
    });

    /* 减速伞舱 */
    const chute = this.addPart(new T.CylinderGeometry(0.16, 0.16, 0.58, 16), MAT.frame);
    chute.rotation.x = Math.PI / 2;
    chute.position.set(0, 0.72, -9.9);

    this.labelAnchors.push({ text: '全动式水平尾翼', at: new T.Vector3(2.30, -0.78, -8.6) });
    this.labelAnchors.push({ text: '垂直尾翼 / 方向舵', at: new T.Vector3(0, 3.45, -8.6) });
    this.labelAnchors.push({ text: '腹鳍', at: new T.Vector3(0.62, -1.16, -8.0) });
    this.labelAnchors.push({ text: '减速伞舱', at: new T.Vector3(0, 0.88, -10.1) });
  };

  /* ---------------- 动力装置 ---------------- */
  J8B.prototype.buildEngine = function () {
    const self = this;
    this.mech.flames = [];
    this.mech.nozzles = [];

    [1, -1].forEach(function (sign) {
      const x = sign * 0.40, z = -10.30;

      /* 收敛喷口：24 片可调叶片（轴向延伸、周向排布） */
      const petalG = new T.Group();
      const N = 24, R0 = 0.345, R1 = 0.298, LEN = 0.62;
      const conv = Math.atan2(R0 - R1, LEN);
      const sh = new T.Shape();
      sh.moveTo(0, -0.042); sh.lineTo(LEN, -0.033);
      sh.lineTo(LEN, 0.033); sh.lineTo(0, 0.042);
      sh.closePath();
      const pg0 = new T.ExtrudeGeometry(sh, { depth: 0.013, bevelEnabled: false, curveSegments: 1 });
      pg0.translate(0, 0, -0.0065);
      pg0.rotateY(Math.PI / 2);          // 轴向 → -Z，宽度 → 切向，厚度 → 径向
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const pg = new T.Group();
        pg.rotation.z = a;
        pg.position.set(x, 0, z - 0.02);
        const p = new T.Mesh(pg0, MAT.nozzle);
        p.position.x = R0;
        p.rotation.y = conv;             // 向轴线收敛
        p.castShadow = true;
        pg.add(p);
        petalG.add(pg);
      }
      self.root.add(petalG);
      self.mech.nozzles.push(petalG);

      /* 喷口内壁（收敛锥） */
      const inner = new T.Mesh(new T.CylinderGeometry(0.30, 0.215, 0.70, 24, 1, true), MAT.nozzleIn);
      inner.geometry.rotateX(Math.PI / 2);
      inner.position.set(x, 0, z - 0.36);
      self.root.add(inner);

      /* 喷口前的机身整流罩 */
      const cowl = new T.Mesh(new T.CylinderGeometry(0.375, 0.352, 0.30, 22, 1, true), MAT.metal);
      cowl.geometry.rotateX(Math.PI / 2);
      cowl.position.set(x, 0, z + 0.16);
      cowl.castShadow = true;
      self.root.add(cowl);

      /* 加力喷焰 */
      const fm = new T.MeshBasicMaterial({
        color: 0x7ac4ff, transparent: true, opacity: 0.0,
        side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false
      });
      const flame = new T.Mesh(new T.CylinderGeometry(0.215, 0.075, 2.9, 18, 1, true), fm);
      flame.geometry.rotateX(Math.PI / 2);
      flame.position.set(x, 0, z - 1.95);
      self.root.add(flame);
      self.mech.flames.push(flame);

      const core = new T.Mesh(new T.SphereGeometry(0.17, 14, 10), new T.MeshBasicMaterial({
        color: 0xfff0d0, transparent: true, opacity: 0.0, blending: T.AdditiveBlending, depthWrite: false
      }));
      core.position.set(x, 0, z - 0.30);
      self.root.add(core);
      self.mech.flames.push(core);
    });

    this.labelAnchors.push({ text: '双发 涡喷-13A 加力燃烧室', at: new T.Vector3(0.40, 0.62, -11.0) });
  };

  /* ---------------- 标识与标语 ---------------- */
  J8B.prototype.buildDecals = function () {
    const self = this;
    function decal(mat, w, h, pos, rot) {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
      m.position.copy(pos);
      m.rotation.set(rot[0], rot[1], rot[2]);
      self.root.add(m);
      return m;
    }
    const wy = function (x, z, top) { return self.wingSurface(x, z, top); };

    /* 机翼上表面八一军徽 */
    decal(MAT.insignia, 1.02, 1.02,
      new T.Vector3(2.85, wy(2.85, -3.35, true) + 0.012, -3.35), [-Math.PI / 2, 0, 0]);
    decal(MAT.insignia, 1.02, 1.02,
      new T.Vector3(-2.85, wy(2.85, -3.35, true) + 0.012, -3.35), [-Math.PI / 2, 0, 0]);
    /* 机翼下表面低可视度军徽 */
    decal(MAT.insigniaLo, 0.94, 0.94,
      new T.Vector3(2.60, wy(2.60, -3.55, false) - 0.012, -3.55), [Math.PI / 2, 0, 0]);
    decal(MAT.insigniaLo, 0.94, 0.94,
      new T.Vector3(-2.60, wy(2.60, -3.55, false) - 0.012, -3.55), [Math.PI / 2, 0, 0]);
    /* 垂尾两侧 */
    decal(MAT.insignia, 0.78, 0.78,
      new T.Vector3(0.120, 1.95, -8.35), [0, Math.PI / 2, 0]);
    decal(MAT.insignia, 0.78, 0.78,
      new T.Vector3(-0.120, 1.95, -8.35), [0, -Math.PI / 2, 0]);

    /* 后机身两侧编号 */
    const bort = decalMat('81096', { w: 512, h: 160, size: 118, font: 'DIN Alternate', color: '#eef3f9' });
    const bz = -5.05, by = 0.30, bx = self.fuseSideX(bz, by) + 0.008;
    decal(bort, 0.92, 0.29, new T.Vector3(bx, by, bz), [0, Math.PI / 2, 0]);
    decal(bort, 0.92, 0.29, new T.Vector3(-bx, by, bz), [0, -Math.PI / 2, 0]);

    /* 进气道外壁警示标语 */
    const warn = decalMat('DANGER  进气道  地面试车危险', { w: 512, h: 96, size: 44, color: '#e2e8ef' });
    [1, -1].forEach(function (s) {
      decal(warn, 1.42, 0.27, new T.Vector3(s * 1.198, 0.30, 2.00), [0, s * Math.PI / 2, 0]);
    });
    /* 翼面禁踩标识 */
    const noStep = decalMat('NO STEP', { w: 256, h: 96, size: 46, color: '#d2d9e1' });
    decal(noStep, 0.52, 0.20, new T.Vector3(2.35, wy(2.35, -5.15, true) + 0.012, -5.15), [-Math.PI / 2, 0, 0]);
    decal(noStep, 0.52, 0.20, new T.Vector3(-2.35, wy(2.35, -5.15, true) + 0.012, -5.15), [-Math.PI / 2, 0, 0]);

    /* 垂尾上的机号 */
    decal(bort, 0.60, 0.19, new T.Vector3(0.118, 2.62, -8.62), [0, Math.PI / 2, 0]);
    decal(bort, 0.60, 0.19, new T.Vector3(-0.118, 2.62, -8.62), [0, -Math.PI / 2, 0]);
  };

  global.J8B = J8B;
  global.J8MAT = MAT;
  global.J8TX = TX;
  global.J8GEO = {
    loft: loft, ringOval: ringOval, ringRect: ringRect, ringAirfoil: ringAirfoil,
    ringFin: ringFin, mirrorX: mirrorX, oriented: oriented, ctrlSurface: ctrlSurface,
    GROUND_Y: GROUND_Y
  };
})(window);
