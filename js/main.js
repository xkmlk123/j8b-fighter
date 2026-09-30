/* ============================================================
   main.js — 场景装配 / 交互控制 / 仿真主循环
   ============================================================ */
(function () {
  'use strict';
  const T = THREE;
  const D2R = Math.PI / 180;

  /* ---------------- 渲染器与场景 ---------------- */
  const viewport = document.getElementById('viewport');
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.80;
  renderer.shadowMap.autoUpdate = true;
  viewport.appendChild(renderer.domElement);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 4000);
  camera.position.set(15, 6.2, 20.5);

  const controls = new T.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.7, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 6;
  controls.maxDistance = 220;
  controls.maxPolarAngle = Math.PI * 0.495;

  /* ---------------- 环境贴图（程序化） ---------------- */
  function skyCanvas() {
    const w = 1024, h = 512, c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.00, '#16528f');
    g.addColorStop(0.20, '#3d7cbb');
    g.addColorStop(0.36, '#82b2dc');
    g.addColorStop(0.45, '#c3dcf0');
    g.addColorStop(0.492, '#e6eef6');
    g.addColorStop(0.508, '#c9d1d8');
    g.addColorStop(0.60, '#9aa4ad');
    g.addColorStop(0.80, '#7d858d');
    g.addColorStop(1.00, '#63696f');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // 太阳 + 大气辉光
    const sx = w * 0.18, sy = h * 0.15;
    const sg = x.createRadialGradient(sx, sy, 1, sx, sy, 150);
    sg.addColorStop(0, 'rgba(255,255,250,1)');
    sg.addColorStop(0.05, 'rgba(255,252,236,0.95)');
    sg.addColorStop(0.22, 'rgba(255,246,214,0.42)');
    sg.addColorStop(1, 'rgba(255,242,206,0)');
    x.fillStyle = sg; x.beginPath(); x.arc(sx, sy, 150, 0, 6.28); x.fill();
    // 卷云
    for (let i = 0; i < 90; i++) {
      const cx = Math.random() * w, cy = h * (0.24 + Math.random() * 0.20);
      const r = 20 + Math.random() * 90;
      const cg = x.createRadialGradient(cx, cy, 1, cx, cy, r);
      cg.addColorStop(0, 'rgba(255,255,255,' + (0.24 + Math.random() * 0.5).toFixed(2) + ')');
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = cg; x.beginPath(); x.arc(cx, cy, r, 0, 6.28); x.fill();
    }
    // 地平线雾带
    const hz = x.createLinearGradient(0, h * 0.40, 0, h * 0.56);
    hz.addColorStop(0, 'rgba(228,238,248,0)');
    hz.addColorStop(0.6, 'rgba(228,238,248,0.55)');
    hz.addColorStop(1, 'rgba(214,222,230,0)');
    x.fillStyle = hz; x.fillRect(0, h * 0.40, w, h * 0.16);
    return c;
  }
  const skyTex = new T.CanvasTexture(skyCanvas());
  skyTex.mapping = T.EquirectangularReflectionMapping;
  skyTex.encoding = T.sRGBEncoding;
  const pmrem = new T.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  scene.environment = pmrem.fromEquirectangular(skyTex).texture;
  scene.background = skyTex;
  scene.fog = new T.Fog(0xc7d6e4, 200, 1250);

  /* ---------------- 光照（三点式 + 环境） ---------------- */
  const hemi = new T.HemisphereLight(0xd4e6fa, 0x59626b, 0.30);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff3e0, 1.68);
  sun.position.set(26, 34, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 170;
  sun.shadow.camera.left = -34; sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34; sun.shadow.camera.bottom = -34;
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.028;
  scene.add(sun);
  const fill = new T.DirectionalLight(0xb8d2f0, 0.22);
  fill.position.set(-22, 12, -18);
  scene.add(fill);
  const rim = new T.DirectionalLight(0xffe9cc, 0.20);
  rim.position.set(-8, 6, -30);
  scene.add(rim);

  /* ---------------- 地面与跑道 ---------------- */
  const concrete = J8TEX.concreteTex();
  const cMap = concrete.map, cNrm = concrete.normalMap;
  cMap.repeat.set(160, 160);
  cNrm.repeat.set(160, 160);
  const groundMat = new T.MeshStandardMaterial({
    map: cMap, normalMap: cNrm, color: 0xd6dade,
    roughness: 0.96, metalness: 0.0,
    normalScale: new T.Vector2(0.6, 0.6)
  });
  const ground = new T.Mesh(new T.PlaneGeometry(1600, 1600), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.position.y = -0.02;
  scene.add(ground);

  const runway = new T.Mesh(new T.PlaneGeometry(34, 900),
    new T.MeshStandardMaterial({ map: J8TEX.runwayTex(), roughness: 0.88, metalness: 0.03 }));
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(0, 0.01, -120);
  runway.receiveShadow = true;
  scene.add(runway);

  /* 停机坪 */
  const apron = new T.Mesh(new T.PlaneGeometry(46, 40), groundMat.clone());
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, 0.005, 4);
  apron.receiveShadow = true;
  scene.add(apron);

  // 标线
  const lineMat = new T.MeshBasicMaterial({ color: 0xf2f5f8, transparent: true, opacity: 0.80 });
  for (let i = 0; i < 14; i++) {
    const m = new T.Mesh(new T.PlaneGeometry(0.9, 12), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(-16.5, 0.02, 240 - i * 40);
    scene.add(m);
    const m2 = m.clone(); m2.position.x = 16.5; scene.add(m2);
  }
  const gridHelper = new T.GridHelper(600, 120, 0x9fb0bd, 0xc4ced6);
  gridHelper.position.y = 0.006;
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.35;
  scene.add(gridHelper);

  /* ---------------- 模型 ---------------- */
  const model = new J8B();
  scene.add(model.root);

  /* 统一环境反射强度：漆面略压低，裸金属保留高反射 */
  model.root.traverse(function (o) {
    if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial) return;
    const m = o.material;
    if (m.envMapIntensity === undefined || m.envMapIntensity === 1) {
      m.envMapIntensity = (m.metalness > 0.7) ? 0.95 : 0.50;
    }
  });
  // 地面/跑道降低环境反射，避免发灰
  groundMat.envMapIntensity = 0.45;
  runway.material.envMapIntensity = 0.45;

  /* ---------------- 气动模型 ---------------- */
  const aero = new J8Aero();
  aero.gearDown = true;

  /* ---------------- 力矢量 ---------------- */
  const forces = new T.Group();
  scene.add(forces);
  function arrow(color) {
    return new T.ArrowHelper(new T.Vector3(0, 1, 0), new T.Vector3(), 1, color, 0.55, 0.28);
  }
  const AR = {
    lift: arrow(0x2f86e0), drag: arrow(0xe08a1e),
    thrust: arrow(0x12a06a), weight: arrow(0xd1343c)
  };
  Object.keys(AR).forEach(function (k) { forces.add(AR[k]); });

  /* ---------------- 流线 ---------------- */
  const FLOW_N = 90;
  const flowGeo = new T.BufferGeometry();
  const flowPos = new Float32Array(FLOW_N * 6);
  const flowSeed = [];
  for (let i = 0; i < FLOW_N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.6 + Math.pow(Math.random(), 0.6) * 7.5;
    flowSeed.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.75 + 0.1, z: 30 - Math.random() * 90, sp: 0.85 + Math.random() * 0.35 });
  }
  flowGeo.setAttribute('position', new T.BufferAttribute(flowPos, 3));
  const flow = new T.LineSegments(flowGeo, new T.LineBasicMaterial({
    color: 0x2f86e0, transparent: true, opacity: 0.42, blending: T.AdditiveBlending, depthWrite: false
  }));
  flow.frustumCulled = false;
  scene.add(flow);

  /* ---------------- 标注 ---------------- */
  const labelLayer = document.getElementById('labels') || (function () {
    const d = document.createElement('div');
    d.id = 'labels';
    d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:12;';
    document.body.appendChild(d);
    return d;
  })();
  const labelEls = model.labelAnchors.map(function (a) {
    const d = document.createElement('div');
    d.className = 'lbl';
    d.textContent = a.text;
    labelLayer.appendChild(d);
    return { el: d, at: a.at };
  });

  /* ---------------- UI ---------------- */
  const $ = function (id) { return document.getElementById(id); };
  const ui = {
    flap: $('flap'), brake: $('brake'), stab: $('stab'),
    throttle: $('throttle'), ab: $('ab'), aoaT: $('aoa-t'),
    optForces: $('opt-forces'), optStream: $('opt-stream'), optGrid: $('opt-grid'),
    optLabels: $('opt-labels'), optShadow: $('opt-shadow'), optAuto: $('opt-auto'),
    optFollow: $('opt-follow')
  };
  let simRun = false;

  function paintRange(el) {
    const p = (el.value - el.min) / (el.max - el.min) * 100;
    el.style.setProperty('--p', p + '%');
  }

  ui.flap.addEventListener('input', function () {
    model.target.flap = this.value / 100;
    $('flap-out').textContent = Math.round(this.value * 0.4) + '°';
    paintRange(this);
  });
  ui.brake.addEventListener('input', function () {
    model.target.brake = this.value / 100;
    $('brake-out').textContent = (this.value > 0 ? '张开 ' : '收 ') + Math.round(this.value * 0.58) + '°';
    paintRange(this);
  });
  ui.stab.addEventListener('input', function () {
    model.target.stab = +this.value;
    $('stab-out').textContent = (+this.value).toFixed(0) + '°';
    paintRange(this);
  });
  ui.throttle.addEventListener('input', function () {
    $('thr-out').textContent = this.value + '%';
    paintRange(this);
  });
  ui.ab.addEventListener('change', function () {
    $('ab-out').textContent = this.checked ? '接通' : '断开';
  });
  ui.aoaT.addEventListener('input', function () {
    aero.alphaT = (+this.value) * D2R;
    if (!simRun) aero.alpha = aero.alphaT;
    $('aoa-out').textContent = (+this.value).toFixed(1) + '°';
    paintRange(this);
  });

  function seg(id, cb) {
    const box = $(id);
    box.addEventListener('click', function (e) {
      const b = e.target.closest('button');
      if (!b) return;
      Array.prototype.forEach.call(box.children, function (c) { c.classList.toggle('active', c === b); });
      cb(b.dataset.v);
    });
  }
  seg('gear', function (v) {
    model.target.gear = +v;
    aero.gearDown = +v === 1;
    $('gear-out').textContent = +v ? '放下中…' : '收上中…';
  });
  seg('canopy', function (v) {
    model.target.canopy = +v;
    $('canopy-out').textContent = +v ? '开启中…' : '关闭中…';
  });
  seg('sim-mode', function (v) {
    if (v === 'run') { simRun = true; }
    else if (v === 'idle') { simRun = false; }
    else { resetSim(); }
  });
  let camTarget = null;
  seg('view', function (v) {
    const D = 28;
    const map = {
      iso: [15, 6.2, 20.5], front: [0, 2.6, D], side: [D, 2.6, 0],
      top: [0.01, D + 3, 0.01], rear: [0, 2.8, -D]
    };
    camTarget = new T.Vector3().fromArray(map[v] || map.iso);
  });

  // 显示选项
  ui.optForces.addEventListener('change', function () { forces.visible = this.checked; });
  ui.optStream.addEventListener('change', function () { flow.visible = this.checked; });
  ui.optGrid.addEventListener('change', function () {
    gridHelper.visible = this.checked;
    runway.visible = this.checked;
    apron.visible = this.checked;
  });
  ui.optLabels.addEventListener('change', function () {
    labelLayer.style.display = this.checked ? '' : 'none';
  });
  ui.optShadow.addEventListener('change', function () {
    renderer.shadowMap.enabled = this.checked;
    scene.traverse(function (o) { if (o.material) o.material.needsUpdate = true; });
  });
  ui.optAuto.addEventListener('change', function () { controls.autoRotate = this.checked; });
  ui.optFollow.addEventListener('change', function () { followCam = this.checked; });
  let followCam = true;
  controls.autoRotateSpeed = 0.9;

  /* ---------------- 挂载面板 ---------------- */
  const stBox = $('stations');
  const stSel = {};
  STATIONS.forEach(function (st) {
    const row = document.createElement('div');
    row.className = 'station';
    row.innerHTML = '<div class="st-name">' + st.name + '<em>' + st.en + '</em></div>';
    const sel = document.createElement('select');
    Object.keys(WEAPONS).forEach(function (k) {
      const o = document.createElement('option');
      o.value = k; o.textContent = WEAPONS[k].name;
      sel.appendChild(o);
    });
    row.appendChild(sel);
    stBox.appendChild(row);
    stSel[st.id] = sel;
    sel.addEventListener('change', function () {
      model.setStore(st.id, sel.value);
      row.classList.toggle('has', sel.value !== 'none');
      refreshLoadout();
    });
  });

  function refreshLoadout() {
    const lo = model.currentLoadout();
    aero.loadout = lo;
    const s = aero.storeStats();
    $('lo-count').textContent = s.count;
    $('lo-weight').textContent = s.mass + ' kg';
    $('lo-drag').textContent = s.cd0.toFixed(4);
  }

  const PRESETS = {
    empty: { il: 'none', ol: 'none', tl: 'none', ct: 'none', tr: 'none', or: 'none', ir: 'none' },
    intercept: { il: 'pl8', ol: 'pl5', tl: 'pl2', ct: 'tank', tr: 'pl2', or: 'pl5', ir: 'pl8' },
    cas: { il: 'rocketpod', ol: 'bomb250', tl: 'none', ct: 'none', tr: 'none', or: 'bomb250', ir: 'rocketpod' },
    ferry: { il: 'tank', ol: 'none', tl: 'none', ct: 'tank', tr: 'none', or: 'none', ir: 'tank' }
  };
  document.querySelectorAll('[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () {
      const p = PRESETS[b.dataset.preset];
      Object.keys(p).forEach(function (k) {
        stSel[k].value = p[k];
        stSel[k].closest('.station').classList.toggle('has', p[k] !== 'none');
      });
      model.setLoadout(p);
      refreshLoadout();
    });
  });
  refreshLoadout();

  /* ---------------- 状态复位 ---------------- */
  function resetSim() {
    aero.reset();
    aero.alphaT = (+ui.aoaT.value) * D2R;
    aero.alpha = aero.alphaT;
    model.target.gear = 1; aero.gearDown = true;
    model.target.flap = 0; model.target.brake = 0;
    model.target.canopy = 0; model.target.stab = 0;
    aero.gammaHold = false;
    ui.flap.value = 0; ui.brake.value = 0; ui.stab.value = 0; ui.throttle.value = 0;
    $('flap-out').textContent = '0°'; $('brake-out').textContent = '收 0°';
    $('stab-out').textContent = '0°'; $('thr-out').textContent = '0%';
    paintRange(ui.flap); paintRange(ui.brake); paintRange(ui.stab); paintRange(ui.throttle);
    document.querySelectorAll('#gear button').forEach(function (b) { b.classList.toggle('active', b.dataset.v === '1'); });
    $('gear-out').textContent = '放下';
    showToast('已恢复到地面停机状态');
  }
  function cruiseState() {
    simRun = true;
    document.querySelectorAll('#sim-mode button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.v === 'run');
    });
    aero.reset();
    aero.onGround = false;
    aero.h = 5000; aero.V = 265; aero.gamma = 0;
    aero.gammaHold = true;
    aero.alphaT = 2.5 * D2R; aero.alpha = 2.5 * D2R;
    ui.aoaT.value = 2.5; $('aoa-out').textContent = '2.5°'; paintRange(ui.aoaT);
    ui.throttle.value = 62; $('thr-out').textContent = '62%'; paintRange(ui.throttle);
    ui.ab.checked = false; $('ab-out').textContent = '断开';
    model.target.gear = 0; aero.gearDown = false;
    document.querySelectorAll('#gear button').forEach(function (b) { b.classList.toggle('active', b.dataset.v === '0'); });
    $('gear-out').textContent = '收上';
    model.target.flap = 0; model.target.brake = 0;
    ui.flap.value = 0; ui.brake.value = 0;
    paintRange(ui.flap); paintRange(ui.brake);
    $('flap-out').textContent = '0°'; $('brake-out').textContent = '收 0°';
    showToast('已切入 5000 m / 265 m·s⁻¹ 巡航状态');
  }
  $('btn-reset').addEventListener('click', function () {
    resetSim();
    camera.position.set(15, 6.2, 20.5);
    controls.target.set(0, 1.7, 0);
  });
  $('btn-cruise').addEventListener('click', cruiseState);
  $('btn-help').addEventListener('click', function () { $('help').classList.remove('hidden'); });
  $('help-close').addEventListener('click', function () { $('help').classList.add('hidden'); });

  let toastEl = null, toastT = 0;
  function showToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:52px;transform:translateX(-50%);' +
        'background:rgba(24,38,58,.92);color:#e8f1fb;padding:9px 20px;border-radius:9px;' +
        'font-size:12.5px;z-index:70;transition:opacity .4s;pointer-events:none;letter-spacing:.3px;';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    toastT = 2.2;
  }

  /* ---------------- 键盘 ---------------- */
  addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' && e.target.type === 'range') return;
    const k = e.key.toLowerCase();
    if (k === 'g') {
      const on = model.target.gear > 0.5;
      model.target.gear = on ? 0 : 1; aero.gearDown = !on;
      document.querySelectorAll('#gear button').forEach(function (b) {
        b.classList.toggle('active', b.dataset.v === (on ? '0' : '1'));
      });
      $('gear-out').textContent = on ? '收上中…' : '放下中…';
    } else if (k === 'f') {
      const v = model.target.flap > 0.5 ? 0 : 1;
      model.target.flap = v; ui.flap.value = v * 100;
      $('flap-out').textContent = Math.round(v * 40) + '°'; paintRange(ui.flap);
    } else if (k === 'b') {
      const v = model.target.brake > 0.5 ? 0 : 1;
      model.target.brake = v; ui.brake.value = v * 100;
      $('brake-out').textContent = (v ? '张开 ' : '收 ') + Math.round(v * 58) + '°'; paintRange(ui.brake);
    } else if (k === 'l') {
      ui.optLabels.checked = !ui.optLabels.checked;
      labelLayer.style.display = ui.optLabels.checked ? '' : 'none';
      showToast(ui.optLabels.checked ? '部件标注：开' : '部件标注：关');
    } else if (k === ' ') {
      e.preventDefault();
      ui.ab.checked = !ui.ab.checked;
      ui.throttle.value = ui.ab.checked ? 100 : ui.throttle.value;
      $('ab-out').textContent = ui.ab.checked ? '接通' : '断开';
      $('thr-out').textContent = ui.throttle.value + '%';
      paintRange(ui.throttle);
    }
  });

  /* ---------------- 气动特性曲线 ---------------- */
  const chart = $('chart');
  const cx = chart.getContext('2d');
  const cw = chart.width, ch = chart.height;
  function drawChart(tel) {
    const pts = aero.curve(tel ? Math.max(0.05, tel.M) : 0.3);
    cx.clearRect(0, 0, cw, ch);
    cx.fillStyle = '#f7f9fc'; cx.fillRect(0, 0, cw, ch);
    const L = 30, R = cw - 26, Tp = 12, B = ch - 20;
    const aMin = -8, aMax = 28;
    const xOf = function (a) { return L + (a - aMin) / (aMax - aMin) * (R - L); };
    const yCL = function (v) { return B - (v / 1.6) * (B - Tp); };
    const yCD = function (v) { return B - (v / 0.32) * (B - Tp); };
    // 网格
    cx.strokeStyle = '#e3e9f1'; cx.lineWidth = 1;
    for (let a = aMin; a <= aMax; a += 4) {
      cx.beginPath(); cx.moveTo(xOf(a), Tp); cx.lineTo(xOf(a), B); cx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const y = Tp + i * (B - Tp) / 4;
      cx.beginPath(); cx.moveTo(L, y); cx.lineTo(R, y); cx.stroke();
    }
    // 坐标轴
    cx.strokeStyle = '#b9c4d2';
    cx.beginPath(); cx.moveTo(L, Tp); cx.lineTo(L, B); cx.lineTo(R, B); cx.stroke();
    cx.fillStyle = '#8b98ab'; cx.font = '9px monospace';
    for (let a = aMin; a <= aMax; a += 8) cx.fillText(a + '°', xOf(a) - 8, B + 13);
    cx.fillText('C_L', 3, Tp + 8);
    cx.fillText('C_D', R + 2, Tp + 8);
    // 失速迎角
    if (tel) {
      cx.strokeStyle = 'rgba(209,52,60,.5)'; cx.setLineDash([3, 3]);
      cx.beginPath(); cx.moveTo(xOf(tel.aMax), Tp); cx.lineTo(xOf(tel.aMax), B); cx.stroke();
      cx.setLineDash([]);
    }
    // CL 曲线
    cx.strokeStyle = '#0f6fd6'; cx.lineWidth = 2; cx.beginPath();
    pts.forEach(function (p, i) { i ? cx.lineTo(xOf(p.a), yCL(p.CL)) : cx.moveTo(xOf(p.a), yCL(p.CL)); });
    cx.stroke();
    // CD 曲线
    cx.strokeStyle = '#e08a1e'; cx.lineWidth = 2; cx.beginPath();
    pts.forEach(function (p, i) { i ? cx.lineTo(xOf(p.a), yCD(p.CD)) : cx.moveTo(xOf(p.a), yCD(p.CD)); });
    cx.stroke();
    // 当前工作点
    if (tel) {
      const a = Math.max(aMin, Math.min(aMax, tel.alpha));
      cx.fillStyle = '#d1343c';
      cx.beginPath(); cx.arc(xOf(a), yCL(tel.CL), 4, 0, 6.28); cx.fill();
      cx.beginPath(); cx.arc(xOf(a), yCD(tel.CD), 4, 0, 6.28); cx.fill();
      cx.strokeStyle = 'rgba(209,52,60,.55)'; cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(xOf(a), Tp); cx.lineTo(xOf(a), B); cx.stroke();
    }
  }

  /* ---------------- HUD 刷新 ---------------- */
  const hud = {
    mach: $('t-mach'), v: $('t-v'), alt: $('t-alt'), aoa: $('t-aoa'), pitch: $('t-pitch'),
    vs: $('t-vs'), g: $('t-g'), climb: $('t-climb'), cl: $('t-cl'), cd: $('t-cd'),
    ld: $('t-ld'), lift: $('t-lift'), drag: $('t-drag'), thrust: $('t-thrust'),
    weight: $('t-weight'), excess: $('t-excess'), bar: $('bar-speed'), env: $('env-text'),
    stall: $('warn-stall')
  };
  let hudT = 0;
  function pushHUD(t) {
    hud.mach.textContent = t.M.toFixed(2);
    hud.v.textContent = Math.round(t.kmh);
    hud.alt.textContent = Math.round(t.h) + ' m';
    hud.aoa.textContent = t.alpha.toFixed(1) + '°';
    hud.pitch.textContent = t.theta.toFixed(1) + '°';
    hud.vs.textContent = (t.vs >= 0 ? '+' : '') + t.vs.toFixed(1) + ' m/s';
    hud.g.textContent = t.n.toFixed(2) + ' G';
    hud.climb.textContent = t.onGround ? '地面滑跑' : (t.vs > 3 ? '爬升' : (t.vs < -3 ? '下降' : '平飞'));
    hud.cl.textContent = t.CL.toFixed(3);
    hud.cd.textContent = t.CD.toFixed(4);
    hud.ld.textContent = t.LD.toFixed(2);
    hud.lift.textContent = (t.lift / 1000).toFixed(1) + ' kN';
    hud.drag.textContent = (t.drag / 1000).toFixed(1) + ' kN';
    hud.thrust.textContent = (t.thrust / 1000).toFixed(1) + ' kN';
    hud.weight.textContent = (t.weight / 1000).toFixed(1) + ' kN';
    hud.excess.textContent = (t.excess / 1000).toFixed(1) + ' kN';
    const pct = Math.max(0, Math.min(100, t.M / 2.35 * 100));
    hud.bar.style.width = pct + '%';
    hud.env.textContent = 'Ma ' + t.M.toFixed(2) + (t.M > 2.2 ? ' 上限' : '');
    hud.stall.classList.toggle('on', t.stalled && !t.onGround);
  }

  /* ---------------- 力矢量刷新 ---------------- */
  const CG = new T.Vector3();
  function pushForces(t) {
    if (!forces.visible) return;
    const g = t.gamma * D2R;
    const pf = function (v) { return v; };
    CG.set(0, model.root.position.y + 0.1, 0);
    const vel = new T.Vector3(0, Math.sin(g), Math.cos(g));
    const liftDir = new T.Vector3(0, Math.cos(g), -Math.sin(g));
    const bodyFwd = new T.Vector3(0, Math.sin(g + t.alpha * D2R), Math.cos(g + t.alpha * D2R));
    const k = 1 / 26000;
    const L = Math.min(9, t.lift * k), D = Math.min(9, t.drag * k);
    const Th = Math.min(9, t.thrust * k), W = Math.min(9, t.weight * k);
    AR.lift.position.copy(CG); AR.lift.setDirection(liftDir.normalize()); AR.lift.setLength(Math.max(0.3, L), 0.62, 0.3);
    AR.drag.position.copy(CG); AR.drag.setDirection(vel.clone().negate()); AR.drag.setLength(Math.max(0.3, D), 0.62, 0.3);
    AR.thrust.position.copy(CG); AR.thrust.setDirection(bodyFwd); AR.thrust.setLength(Math.max(0.3, Th), 0.62, 0.3);
    AR.weight.position.copy(CG); AR.weight.setDirection(new T.Vector3(0, -1, 0)); AR.weight.setLength(Math.max(0.3, W), 0.62, 0.3);
  }

  /* ---------------- 主循环 ---------------- */
  let last = performance.now(), acc = 0;
  const FIXED = 1 / 120;
  let dispTel = null;
  let prevLift = 0;
  const _followV = new T.Vector3();

  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;

    const inp = {
      throttle: ui.throttle.value / 100,
      ab: ui.ab.checked,
      braking: false
    };

    if (simRun) {
      acc += dt;
      let guard = 0;
      while (acc >= FIXED && guard < 400) { aero.step(FIXED, inp); acc -= FIXED; guard++; }
      dispTel = aero.telemetry(inp);
    } else {
      aero.alpha = aero.alphaT;
      aero.alphaT = aero.alphaT;
      dispTel = aero.telemetry(inp);
      acc = 0;
    }

    // 加力喷焰强度
    model.target.glow = (inp.ab && inp.throttle > 0.3) ? 1 : 0;
    model.update(dt, simRun ? aero : { alphaT: aero.alphaT, alpha: aero.alpha, onGround: true, n: 1 });

    // 机体姿态：高度可视化抬升 + 航迹倾角俯仰
    const altLift = Math.min(dispTel.h * 0.012, 11);
    model.root.position.y = -J8GEO.GROUND_Y + altLift;
    model.root.rotation.x = -dispTel.gamma * D2R * (simRun ? 1 : 0);
    // 跟随模式下相机随高度整体平移，避免仰视角突变
    if (followCam && !camTarget) {
      camera.position.y += altLift - prevLift;
      controls.target.y += altLift - prevLift;
    }
    prevLift = altLift;

    // 流线
    if (flow.visible) {
      const spd = dispTel.V;
      const arr = flowGeo.attributes.position.array;
      for (let i = 0; i < FLOW_N; i++) {
        const s = flowSeed[i];
        s.z -= spd * s.sp * dt * 0.55;
        if (s.z < -34) { s.z = 34 + Math.random() * 12; s.x = (Math.random() - 0.5) * 15; s.y = (Math.random() - 0.5) * 9 + 0.4; }
        const r = Math.hypot(s.x, s.y);
        const push = 1.35 * Math.exp(-r * r / 3.2);
        const f = (r > 0.001) ? (r + push) / r : 1;
        const px = s.x * f, py = s.y * f, pz = s.z;
        const L = Math.min(6, 0.7 + spd * 0.014);
        arr[i * 6] = px; arr[i * 6 + 1] = py; arr[i * 6 + 2] = pz;
        arr[i * 6 + 3] = px; arr[i * 6 + 4] = py; arr[i * 6 + 5] = pz - L;
      }
      flowGeo.attributes.position.needsUpdate = true;
      flow.material.opacity = Math.min(0.5, 0.06 + dispTel.V / 900);
    }

    pushForces(dispTel);

    // 相机预设过渡 / 镜头跟随
    if (camTarget) {
      camera.position.lerp(camTarget, Math.min(1, dt * 3.4));
      if (camera.position.distanceTo(camTarget) < 0.15) camTarget = null;
    }
    if (followCam && !camTarget) {
      _followV.set(0, model.root.position.y + 0.9, 0);
      controls.target.lerp(_followV, Math.min(1, dt * 1.2));
    }
    controls.update();

    // 标注投影
    if (ui.optLabels.checked) {
      const v = new T.Vector3();
      const w = innerWidth, h = innerHeight;
      model.root.updateMatrixWorld();
      labelEls.forEach(function (L) {
        v.copy(L.at).applyMatrix4(model.root.matrixWorld);
        v.project(camera);
        const inFront = v.z < 1;
        const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
        L.el.style.transform = 'translate(-50%,-50%) translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px)';
        L.el.style.left = '0'; L.el.style.top = '0';
        L.el.style.display = inFront ? '' : 'none';
      });
    }

    // HUD（限频）
    hudT += dt;
    if (hudT > 0.08) { hudT = 0; pushHUD(dispTel); drawChart(dispTel); }
    if (toastEl && toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.style.opacity = '0'; }

    renderer.render(scene, camera);
  }

  addEventListener('resize', function () {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // 初始状态
  paintRange(ui.flap); paintRange(ui.brake); paintRange(ui.stab);
  paintRange(ui.throttle); paintRange(ui.aoaT);
  model.setLoadout(PRESETS.empty);
  refreshLoadout();
  drawChart(null);

  /* —— 截图/演示用 URL 参数 —— */
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('nolabel')) { labelLayer.style.display = 'none'; ui.optLabels.checked = false; }
    if (q.has('bare')) {
      document.querySelectorAll('.panel').forEach(function (p) { p.style.display = 'none'; });
      const st = document.createElement('style');
      st.textContent = '#panel-left,#panel-right{display:none!important}';
      document.head.appendChild(st);
    }
    const VIEWS = { iso: [15, 6.2, 20.5], front: [0, 2.6, 28], side: [28, 2.6, 0], top: [0.01, 31, 0.01], rear: [0, 2.8, -28] };
    if (q.has('view')) camera.position.fromArray(VIEWS[q.get('view')] || VIEWS.iso);
    if (q.has('cam')) camera.position.fromArray(q.get('cam').split(',').map(Number));
    if (q.has('look')) controls.target.fromArray(q.get('look').split(',').map(Number));
    if (q.has('zoom')) camera.position.multiplyScalar(+q.get('zoom'));
    if (q.has('load')) {
      const p = PRESETS[q.get('load')];
      if (p) {
        Object.keys(p).forEach(function (k) {
          stSel[k].value = p[k];
          stSel[k].closest('.station').classList.toggle('has', p[k] !== 'none');
        });
        model.setLoadout(p); refreshLoadout();
      }
    }
    if (q.has('flap')) model.target.flap = Math.min(1, +q.get('flap'));
    if (q.has('brake')) model.target.brake = Math.min(1, +q.get('brake'));
    if (q.has('gear')) { model.target.gear = +q.get('gear'); aero.gearDown = +q.get('gear') === 1; }
    if (q.has('canopy')) model.target.canopy = Math.min(1, +q.get('canopy'));
    if (q.has('stab')) {
      const sv = Math.max(-25, Math.min(25, +q.get('stab')));
      model.target.stab = sv; ui.stab.value = sv;
      $('stab-out').textContent = sv + '°'; paintRange(ui.stab);
    }
    if (q.has('cruise')) cruiseState();
    if (q.has('settle')) { for (let i = 0; i < 900; i++) model.update(1 / 60, null); }
    if (q.has('debug')) {
      const d = document.createElement('div');
      d.id = 'debug-info';
      const n = model.mech.gear.nose;
      d.textContent = JSON.stringify({
        target: model.target, cur: model.cur,
        aero: {
          h: Math.round(aero.h), V: Math.round(aero.V), M: +(aero.V / aero.atm().a).toFixed(3),
          alpha: +(aero.alpha * 180 / Math.PI).toFixed(2), gamma: +(aero.gamma * 180 / Math.PI).toFixed(2),
          onGround: aero.onGround, crashed: aero.crashed, fuel: Math.round(aero.fuel),
          hold: !!aero.gammaHold, time: +aero.time.toFixed(1)
        },
        noseRot: n ? n.pivot.rotation.x.toFixed(3) : 'none',
        noseY: n ? n.pivot.position.y.toFixed(3) : 'none',
        mainRot: model.mech.gear.main.map(function (m) { return m.pivot.rotation.z.toFixed(3); }),
        modelY: model.root.position.y.toFixed(2),
        cam: camera.position.toArray().map(function (v) { return v.toFixed(1); }),
        tgt: controls.target.toArray().map(function (v) { return v.toFixed(1); })
      });
      document.body.appendChild(d);
    }
  } catch (e) { console.warn(e); }

  /* 首帧前先输出一次遥测，避免 HUD 显示初始零值 */
  try {
    dispTel = aero.telemetry({ throttle: ui.throttle.value / 100, ab: ui.ab.checked, braking: false });
    pushHUD(dispTel);
    drawChart(dispTel);
    prevLift = Math.min(dispTel.h * 0.012, 11);
    model.root.position.y = -J8GEO.GROUND_Y + prevLift;
    if (followCam) { camera.position.y += prevLift; controls.target.y += prevLift; }
  } catch (e) { console.warn(e); }

  loop(performance.now());
  setTimeout(function () { showToast('拖动左侧滑块可调节襟翼 / 减速板 / 起落架 / 挂载'); }, 900);
})();
