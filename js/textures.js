/* ============================================================
   textures.js — 程序化 PBR 贴图工厂
   目标：用纯程序化手段复刻「战争雷霆」级别的蒙皮质感
     · 分块蒙皮线（高度图凹陷）+ 铆钉阵列（高度图凸起）
     · 检修口盖、紧固件、掉漆露金属
     · 油迹、气流污痕、排气熏黑、盐雾积污
     · 由高度图 Sobel 卷积自动生成切线空间法线贴图
   所有贴图均为确定性随机（同一 seed → 同一结果），并保证无缝平铺。
   ============================================================ */
(function (global) {
  'use strict';
  const T = THREE;

  /* ---------------- 基础工具 ---------------- */
  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = (h === undefined ? w : h);
    return c;
  }
  // 线性同余伪随机：保证每次刷新贴图一致
  function prng(seed) {
    let s = (seed === undefined ? 1 : seed) >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function mkTex(cv, opt) {
    opt = opt || {};
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = opt.aniso === undefined ? 8 : opt.aniso;
    if (opt.srgb) t.encoding = T.sRGBEncoding;
    t.needsUpdate = true;
    return t;
  }
  function roundRect(x, px, py, w, h, r) {
    x.beginPath();
    x.moveTo(px + r, py);
    x.lineTo(px + w - r, py); x.quadraticCurveTo(px + w, py, px + w, py + r);
    x.lineTo(px + w, py + h - r); x.quadraticCurveTo(px + w, py + h, px + w - r, py + h);
    x.lineTo(px + r, py + h); x.quadraticCurveTo(px, py + h, px, py + h - r);
    x.lineTo(px, py + r); x.quadraticCurveTo(px, py, px + r, py);
    x.closePath();
  }

  /* ---------------- 高度图 → 法线贴图 ---------------- */
  function heightToNormal(hCv, strength) {
    const w = hCv.width, h = hCv.height;
    const src = hCv.getContext('2d').getImageData(0, 0, w, h).data;
    const out = mkCanvas(w, h);
    const octx = out.getContext('2d');
    const img = octx.createImageData(w, h);
    const d = img.data, s = strength === undefined ? 2.4 : strength;
    const at = function (x, y) {
      x = (x + w) % w; y = (y + h) % h;
      return src[(y * w + x) * 4] / 255;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = at(x + 1, y) - at(x - 1, y);
        const dy = at(x, y + 1) - at(x, y - 1);
        let nx = -dx * s, ny = dy * s, nz = 1;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx /= l; ny /= l; nz /= l;
        const i = (y * w + x) * 4;
        d[i] = (nx * 0.5 + 0.5) * 255;
        d[i + 1] = (ny * 0.5 + 0.5) * 255;
        d[i + 2] = (nz * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return out;
  }

  /* ---------------- 蒙皮贴图组 ---------------- */
  /* o: {size, base, seed, cols, rows, panels, rivet, streaks, mottle,
          soot, wear, lineColor, gritty} */
  function skinSet(o) {
    o = o || {};
    const S = o.size || 1024;
    const R = prng(o.seed || 7);
    const A = mkCanvas(S), a = A.getContext('2d');
    const H = mkCanvas(S), h = H.getContext('2d');

    a.fillStyle = o.base || '#a7b2bd';
    a.fillRect(0, 0, S, S);
    h.fillStyle = '#8c8c8c';
    h.fillRect(0, 0, S, S);

    /* ---- 1. 喷漆不匀 / 老化色差 ---- */
    const mot = o.mottle === undefined ? 1 : o.mottle;
    for (let i = 0; i < Math.round(150 * mot); i++) {
      const x = R() * S, y = R() * S, rad = S * (0.02 + R() * 0.12);
      const dark = R() < 0.55;
      const al = (0.025 + R() * 0.055).toFixed(3);
      const g = a.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, dark ? 'rgba(56,66,78,' + al + ')' : 'rgba(248,251,255,' + al + ')');
      g.addColorStop(1, dark ? 'rgba(56,66,78,0)' : 'rgba(248,251,255,0)');
      a.fillStyle = g;
      a.beginPath(); a.arc(x, y, rad, 0, 6.2832); a.fill();
    }
    // 漆面细微颗粒
    (function () {
      const im = a.getImageData(0, 0, S, S), dd = im.data;
      for (let i = 0; i < dd.length; i += 4) {
        const n = (R() - 0.5) * (o.gritty === undefined ? 15 : o.gritty);
        dd[i] += n; dd[i + 1] += n; dd[i + 2] += n;
      }
      a.putImageData(im, 0, 0);
    })();

    /* ---- 2. 蒙皮分块线（凹陷）+ 铆钉（凸起） ---- */
    const cols = o.cols || 6, rows = o.rows || 7;
    const px = S / cols, py = S / rows;
    const lc = o.lineColor || 'rgba(46,56,68,0.60)';
    const RW = o.rivet === undefined ? 11 : o.rivet;

    function wrapPt(cx, cy, rad, fn) {
      for (let ix = -1; ix <= 1; ix++) {
        for (let iy = -1; iy <= 1; iy++) {
          const x = cx + ix * S, y = cy + iy * S;
          if (x < -rad || x > S + rad || y < -rad || y > S + rad) continue;
          fn(x, y);
        }
      }
    }
    function rivetAt(cx, cy) {
      wrapPt(cx, cy, 4, function (x, y) {
        a.fillStyle = 'rgba(66,76,90,0.30)';
        a.beginPath(); a.arc(x + 0.5, y + 0.7, 1.45, 0, 6.2832); a.fill();
        a.fillStyle = 'rgba(232,238,246,0.22)';
        a.beginPath(); a.arc(x - 0.4, y - 0.5, 0.95, 0, 6.2832); a.fill();
        const g = h.createRadialGradient(x, y, 0, x, y, 2.8);
        g.addColorStop(0, 'rgba(206,206,206,0.92)');
        g.addColorStop(0.55, 'rgba(168,168,168,0.45)');
        g.addColorStop(1, 'rgba(138,138,138,0)');
        h.fillStyle = g;
        h.beginPath(); h.arc(x, y, 2.8, 0, 6.2832); h.fill();
      });
    }
    // 铆钉行：沿轴向 v（纹理 Y）方向的长桁
    function rivetLineY(x, off) {
      const n = Math.round(S / RW);
      for (let i = 0; i <= n; i++) rivetAt(x + off, (i / n) * S);
    }
    // 沿周向 u（纹理 X）方向的框线
    function rivetLineX(y, off) {
      const n = Math.round(S / RW);
      for (let i = 0; i <= n; i++) rivetAt((i / n) * S, y + off);
    }
    for (let i = 0; i <= cols; i++) {
      const x = (i % cols === 0 && i > 0) ? (i === cols ? S : 0) : i * px + (R() - 0.5) * 3;
      const X = i === 0 ? 0 : (i === cols ? S : x);
      a.strokeStyle = lc; a.lineWidth = 1.6;
      a.beginPath(); a.moveTo(X, 0); a.lineTo(X, S); a.stroke();
      a.strokeStyle = 'rgba(255,255,255,0.16)'; a.lineWidth = 1;
      a.beginPath(); a.moveTo(X + 1.7, 0); a.lineTo(X + 1.7, S); a.stroke();
      h.strokeStyle = '#4a4a4a'; h.lineWidth = 5;
      h.beginPath(); h.moveTo(X, 0); h.lineTo(X, S); h.stroke();
      rivetLineY(X, 3.6);
      rivetLineY(X, -3.6);
    }
    for (let j = 0; j <= rows; j++) {
      const Y = j === 0 ? 0 : (j === rows ? S : j * py + (R() - 0.5) * 3);
      a.strokeStyle = lc; a.lineWidth = 1.6;
      a.beginPath(); a.moveTo(0, Y); a.lineTo(S, Y); a.stroke();
      a.strokeStyle = 'rgba(255,255,255,0.14)'; a.lineWidth = 1;
      a.beginPath(); a.moveTo(0, Y + 1.7); a.lineTo(S, Y + 1.7); a.stroke();
      h.strokeStyle = '#4a4a4a'; h.lineWidth = 5;
      h.beginPath(); h.moveTo(0, Y); h.lineTo(S, Y); h.stroke();
      rivetLineX(Y, 3.6);
      rivetLineX(Y, -3.6);
    }

    /* ---- 3. 检修口盖 / 加强板 ---- */
    const nPanel = o.panels === undefined ? 14 : o.panels;
    for (let i = 0; i < nPanel; i++) {
      const ci = Math.floor(R() * cols), cj = Math.floor(R() * rows);
      const cx = (ci + 0.5) * px, cy = (cj + 0.5) * py;
      const w = px * (0.30 + R() * 0.42), hh = py * (0.26 + R() * 0.42);
      const x0 = cx - w / 2, y0 = cy - hh / 2;
      roundRect(a, x0, y0, w, hh, 5);
      a.strokeStyle = 'rgba(44,54,66,0.50)'; a.lineWidth = 1.3; a.stroke();
      a.fillStyle = 'rgba(255,255,255,0.045)'; a.fill();
      roundRect(h, x0, y0, w, hh, 5);
      h.strokeStyle = '#565656'; h.lineWidth = 4; h.stroke();
      // 四角快卸紧固件
      [[x0 + 7, y0 + 7], [x0 + w - 7, y0 + 7], [x0 + 7, y0 + hh - 7], [x0 + w - 7, y0 + hh - 7]]
        .forEach(function (p) { rivetAt(p[0], p[1]); });
    }

    /* ---- 4. 掉漆露金属 ---- */
    const wear = o.wear === undefined ? 1 : o.wear;
    if (wear > 0) {
      for (let i = 0; i < Math.round(260 * wear); i++) {
        const x = R() * S, y = R() * S, rad = 0.7 + R() * 2.4;
        wrapPt(x, y, 4, function (cx, cy) {
          a.fillStyle = 'rgba(206,212,220,' + (0.25 + R() * 0.45).toFixed(3) + ')';
          a.beginPath(); a.arc(cx, cy, rad, 0, 6.2832); a.fill();
        });
      }
    }

    /* ---- 5. 气流污痕 / 油迹 ---- */
    const nStreak = o.streaks === undefined ? 46 : o.streaks;
    for (let i = 0; i < nStreak; i++) {
      const cx = R() * S, cy = R() * S;
      const len = S * (0.10 + R() * 0.34), wid = 3 + R() * 15;
      const dark = R() < 0.72;
      const al = 0.045 + R() * 0.09;
      const col = dark ? '38,42,48,' : '214,220,228,';
      wrapPt(cx, cy, len + wid, function (x, y) {
        const g = a.createLinearGradient(0, y, 0, y + len);
        g.addColorStop(0, 'rgba(' + col + al.toFixed(3) + ')');
        g.addColorStop(0.35, 'rgba(' + col + (al * 0.55).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + col + '0)');
        a.fillStyle = g;
        a.fillRect(x - wid / 2, y, wid, len);
      });
    }

    /* ---- 6. 排气熏黑（从某一侧边缘渐变） ---- */
    if (o.soot) {
      const gg = a.createLinearGradient(0, S, 0, S * (1 - o.soot));
      gg.addColorStop(0, 'rgba(22,22,24,0.66)');
      gg.addColorStop(0.40, 'rgba(34,34,38,0.32)');
      gg.addColorStop(1, 'rgba(40,40,44,0)');
      a.fillStyle = gg;
      a.fillRect(0, S * (1 - o.soot), S, S * o.soot);
    }
    /* ---- 7. 底部积污 ---- */
    if (o.grime) {
      const gg = a.createLinearGradient(0, 0, 0, S * o.grime);
      gg.addColorStop(0, 'rgba(52,50,46,0.34)');
      gg.addColorStop(1, 'rgba(52,50,46,0)');
      a.fillStyle = gg;
      a.fillRect(0, 0, S, S * o.grime);
    }

    /* ---- 8. 粗糙度贴图（由 albedo 亮度反推，脏处更粗糙） ---- */
    const RC = mkCanvas(S), rx = RC.getContext('2d');
    (function () {
      const src = a.getImageData(0, 0, S, S).data;
      const im = rx.createImageData(S, S), d = im.data;
      const lo = o.roughLo === undefined ? 96 : o.roughLo;
      const hi = o.roughHi === undefined ? 168 : o.roughHi;
      for (let i = 0; i < d.length; i += 4) {
        const lum = (src[i] * 0.30 + src[i + 1] * 0.59 + src[i + 2] * 0.11) / 255;
        const v = lo + (hi - lo) * (1 - lum);
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      rx.putImageData(im, 0, 0);
    })();

    return {
      map: mkTex(A, { srgb: true }),
      normalMap: mkTex(heightToNormal(H, o.bump === undefined ? 2.6 : o.bump)),
      roughnessMap: mkTex(RC),
      metalness: o.metalness === undefined ? 0.34 : o.metalness
    };
  }

  /* ---------------- 素色金属（拉丝 / 热处理） ---------------- */
  function metalSet(o) {
    o = o || {};
    const S = o.size || 512;
    const R = prng(o.seed || 21);
    const A = mkCanvas(S), a = A.getContext('2d');
    const H = mkCanvas(S), h = H.getContext('2d');
    a.fillStyle = o.base || '#9aa2ab'; a.fillRect(0, 0, S, S);
    h.fillStyle = '#8c8c8c'; h.fillRect(0, 0, S, S);
    // 拉丝
    for (let i = 0; i < S * 3; i++) {
      const y = R() * S, len = S * (0.2 + R() * 0.8), x = R() * S;
      a.strokeStyle = 'rgba(' + (150 + R() * 90 | 0) + ',' + (156 + R() * 90 | 0) + ',' +
        (164 + R() * 90 | 0) + ',' + (0.05 + R() * 0.09).toFixed(3) + ')';
      a.lineWidth = 0.6 + R() * 1.3;
      a.beginPath(); a.moveTo(x, y); a.lineTo(x + len, y); a.stroke();
    }
    // 热处理色斑
    if (o.heat) {
      for (let i = 0; i < 60; i++) {
        const x = R() * S, y = R() * S, rad = S * (0.03 + R() * 0.12);
        const g = a.createRadialGradient(x, y, 0, x, y, rad);
        const c = [[110, 92, 150], [172, 130, 70], [72, 108, 148], [96, 96, 104]][Math.floor(R() * 4)];
        g.addColorStop(0, 'rgba(' + c.join(',') + ',' + (0.10 + R() * 0.16).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + c.join(',') + ',0)');
        a.fillStyle = g; a.beginPath(); a.arc(x, y, rad, 0, 6.2832); a.fill();
      }
    }
    // 划痕
    for (let i = 0; i < 90; i++) {
      const x = R() * S, y = R() * S, len = S * (0.03 + R() * 0.2);
      const ang = R() * Math.PI;
      a.strokeStyle = 'rgba(226,232,240,' + (0.05 + R() * 0.12).toFixed(3) + ')';
      a.lineWidth = 0.7;
      a.beginPath(); a.moveTo(x, y);
      a.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); a.stroke();
      h.strokeStyle = 'rgba(150,150,150,0.5)'; h.lineWidth = 1.4;
      h.beginPath(); h.moveTo(x, y);
      h.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); h.stroke();
    }
    return {
      map: mkTex(A, { srgb: true }),
      normalMap: mkTex(heightToNormal(H, 1.4)),
      roughnessMap: null
    };
  }

  /* ---------------- 喷口：热变色分段 + 环向灼烧 ---------------- */
  function nozzleSet() {
    const S = 512;
    const R = prng(33);
    const A = mkCanvas(S), a = A.getContext('2d');
    const H = mkCanvas(S), h = H.getContext('2d');
    a.fillStyle = '#767b82'; a.fillRect(0, 0, S, S);
    h.fillStyle = '#8c8c8c'; h.fillRect(0, 0, S, S);
    // 纵向热色带（v 方向 = 喷流方向）
    const stops = [
      [0.00, 'rgba(96,100,108,0.9)'],
      [0.22, 'rgba(120,102,138,0.55)'],
      [0.44, 'rgba(134,104,74,0.55)'],
      [0.62, 'rgba(96,110,146,0.50)'],
      [0.82, 'rgba(64,68,76,0.75)'],
      [1.00, 'rgba(30,31,34,0.92)']
    ];
    const g = a.createLinearGradient(0, 0, 0, S);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    a.fillStyle = g; a.fillRect(0, 0, S, S);
    // 灼烧斑
    for (let i = 0; i < 220; i++) {
      const x = R() * S, y = R() * S, rad = 2 + R() * 26;
      const gg = a.createRadialGradient(x, y, 0, x, y, rad);
      const c = [[42,43,46], [128,96,60], [92,84,128], [58,62,68]][Math.floor(R() * 4)];
      gg.addColorStop(0, 'rgba(' + c.join(',') + ',' + (0.05 + R() * 0.16).toFixed(3) + ')');
      gg.addColorStop(1, 'rgba(' + c.join(',') + ',0)');
      a.fillStyle = gg; a.beginPath(); a.arc(x, y, rad, 0, 6.2832); a.fill();
    }
    // 环向加强筋（凹陷）
    for (let i = 0; i < 12; i++) {
      const y = 20 + i * 40;
      a.strokeStyle = 'rgba(38,40,44,0.45)'; a.lineWidth = 2;
      a.beginPath(); a.moveTo(0, y); a.lineTo(S, y); a.stroke();
      h.strokeStyle = '#4e4e4e'; h.lineWidth = 5;
      h.beginPath(); h.moveTo(0, y); h.lineTo(S, y); h.stroke();
    }
    return {
      map: mkTex(A, { srgb: true }),
      normalMap: mkTex(heightToNormal(H, 2.0))
    };
  }

  /* ---------------- 轮胎：胎面花纹 ---------------- */
  function tireSet() {
    const S = 512;
    const R = prng(51);
    const A = mkCanvas(S), a = A.getContext('2d');
    const H = mkCanvas(S), h = H.getContext('2d');
    a.fillStyle = '#1a1c1f'; a.fillRect(0, 0, S, S);
    h.fillStyle = '#8c8c8c'; h.fillRect(0, 0, S, S);
    for (let i = 0; i < 4200; i++) {
      a.fillStyle = 'rgba(' + (40 + R() * 30 | 0) + ',' + (42 + R() * 30 | 0) + ',' +
        (46 + R() * 30 | 0) + ',0.35)';
      a.fillRect(R() * S, R() * S, 1.6, 1.6);
    }
    // 纵向沟槽 + 横向花纹块（环绕方向为纹理 X）
    for (let k = 0; k < 3; k++) {
      const y = 110 + k * 145;
      a.strokeStyle = '#0a0b0d'; a.lineWidth = 16;
      a.beginPath(); a.moveTo(0, y); a.lineTo(S, y); a.stroke();
      h.strokeStyle = '#3c3c3c'; h.lineWidth = 16;
      h.beginPath(); h.moveTo(0, y); h.lineTo(S, y); h.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const x = i * (S / 26) + 6;
      a.strokeStyle = '#0c0d0f'; a.lineWidth = 13;
      a.beginPath(); a.moveTo(x, 20); a.lineTo(x, S - 20); a.stroke();
      h.strokeStyle = '#3a3a3a'; h.lineWidth = 13;
      h.beginPath(); h.moveTo(x, 20); h.lineTo(x, S - 20); h.stroke();
    }
    return {
      map: mkTex(A, { srgb: true }),
      normalMap: mkTex(heightToNormal(H, 2.2))
    };
  }

  /* ---------------- 雷达罩 ---------------- */
  function radomeSet() {
    const S = 512;
    const R = prng(63);
    const A = mkCanvas(S), a = A.getContext('2d');
    const H = mkCanvas(S), h = H.getContext('2d');
    a.fillStyle = '#33383e'; a.fillRect(0, 0, S, S);
    h.fillStyle = '#8c8c8c'; h.fillRect(0, 0, S, S);
    for (let i = 0; i < 700; i++) {
      const x = R() * S, y = R() * S, rad = 2 + R() * 22;
      const gg = a.createRadialGradient(x, y, 0, x, y, rad);
      const c = R() < 0.5 ? [24, 27, 31] : [62, 69, 78];
      gg.addColorStop(0, 'rgba(' + c.join(',') + ',' + (0.05 + R() * 0.12).toFixed(3) + ')');
      gg.addColorStop(1, 'rgba(' + c.join(',') + ',0)');
      a.fillStyle = gg; a.beginPath(); a.arc(x, y, rad, 0, 6.2832); a.fill();
    }
    // 环向防雷条
    for (let i = 0; i < 7; i++) {
      const y = 30 + i * 72;
      a.strokeStyle = 'rgba(120,128,140,0.30)'; a.lineWidth = 3;
      a.beginPath(); a.moveTo(0, y); a.lineTo(S, y); a.stroke();
      h.strokeStyle = '#626262'; h.lineWidth = 4;
      h.beginPath(); h.moveTo(0, y); h.lineTo(S, y); h.stroke();
    }
    return {
      map: mkTex(A, { srgb: true }),
      normalMap: mkTex(heightToNormal(H, 2.0))
    };
  }

  /* ---------------- 军徽 / 编号 / 标语 ---------------- */
  function insigniaTex(lowVis) {
    const S = 512;
    const cv = mkCanvas(S), x = cv.getContext('2d');
    const cx = S / 2, cy = S / 2, R = S * 0.44;
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 === 0 ? R : R * 0.405;
      const pxx = cx + rr * Math.cos(ang), py = cy + rr * Math.sin(ang);
      if (i) x.lineTo(pxx, py); else x.moveTo(pxx, py);
    }
    x.closePath();
    x.fillStyle = lowVis ? '#8d949d' : '#c8102e';
    x.fill();
    x.lineWidth = S * 0.035;
    x.strokeStyle = lowVis ? '#6c727a' : '#ffd400';
    x.stroke();
    x.fillStyle = lowVis ? '#5d636b' : '#ffd400';
    x.font = 'bold ' + Math.round(S * 0.29) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('八一', cx, cy + S * 0.012);
    const t = mkTex(cv, { srgb: true, aniso: 8 });
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
    return t;
  }

  function textTex(text, o) {
    o = o || {};
    const w = o.w || 512, hh = o.h || 128;
    const cv = mkCanvas(w, hh), x = cv.getContext('2d');
    x.clearRect(0, 0, w, hh);
    x.fillStyle = o.color || '#e9eef5';
    x.font = (o.bold === false ? '' : 'bold ') + Math.round(o.size || hh * 0.62) +
      'px "' + (o.font || 'Microsoft YaHei') + '",sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (o.arc) {
      // 沿圆弧排布
      const N = text.length, span = o.arcSpan || 1.5;
      for (let i = 0; i < N; i++) {
        const a2 = -span / 2 + (N === 1 ? 0 : i / (N - 1)) * span;
        x.save();
        x.translate(w / 2 + Math.sin(a2) * o.arc, hh / 2 + (1 - Math.cos(a2)) * o.arc * 0.35);
        x.rotate(a2 * (o.arcFlip ? -1 : 1));
        x.fillText(text[i], 0, 0);
        x.restore();
      }
    } else {
      x.fillText(text, w / 2, hh / 2 + 2);
    }
    const t = mkTex(cv, { srgb: true });
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
    return t;
  }

  /* ---------------- 地面 / 跑道 ---------------- */
  function concreteTex() {
    const S = 512, R = prng(89);
    const A = mkCanvas(S), a = A.getContext('2d');
    const H = mkCanvas(S), h = H.getContext('2d');
    a.fillStyle = '#767b81'; a.fillRect(0, 0, S, S);
    h.fillStyle = '#8c8c8c'; h.fillRect(0, 0, S, S);
    for (let i = 0; i < 5000; i++) {
      const g = 110 + R() * 80 | 0;
      a.fillStyle = 'rgba(' + g + ',' + (g + 3) + ',' + (g + 8) + ',' + (0.10 + R() * 0.3).toFixed(2) + ')';
      a.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 3);
    }
    for (let i = 0; i < 300; i++) {
      const x = R() * S, y = R() * S, rad = 3 + R() * 26;
      const gg = a.createRadialGradient(x, y, 0, x, y, rad);
      const c = R() < 0.5 ? [60, 62, 66] : [190, 194, 198];
      gg.addColorStop(0, 'rgba(' + c.join(',') + ',' + (0.04 + R() * 0.10).toFixed(3) + ')');
      gg.addColorStop(1, 'rgba(' + c.join(',') + ',0)');
      a.fillStyle = gg; a.beginPath(); a.arc(x, y, rad, 0, 6.2832); a.fill();
    }
    // 混凝土板缝
    for (let i = 0; i <= 4; i++) {
      const y = i * S / 4;
      a.strokeStyle = 'rgba(58,60,64,0.55)'; a.lineWidth = 2.4;
      a.beginPath(); a.moveTo(0, y); a.lineTo(S, y); a.stroke();
      h.strokeStyle = '#5c5c5c'; h.lineWidth = 5;
      h.beginPath(); h.moveTo(0, y); h.lineTo(S, y); h.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const x = i * S / 4;
      a.strokeStyle = 'rgba(58,60,64,0.45)'; a.lineWidth = 2.2;
      a.beginPath(); a.moveTo(x, 0); a.lineTo(x, S); a.stroke();
      h.strokeStyle = '#5c5c5c'; h.lineWidth = 5;
      h.beginPath(); h.moveTo(x, 0); h.lineTo(x, S); h.stroke();
    }
    return {
      map: mkTex(A, { srgb: true }),
      normalMap: mkTex(heightToNormal(H, 1.6))
    };
  }

  function runwayTex() {
    const w = 256, hh = 1024, R = prng(97);
    const A = mkCanvas(w, hh), a = A.getContext('2d');
    a.fillStyle = '#3d4147'; a.fillRect(0, 0, w, hh);
    for (let i = 0; i < 26000; i++) {
      const g = 60 + R() * 60 | 0;
      a.fillStyle = 'rgba(' + g + ',' + (g + 2) + ',' + (g + 6) + ',' + (0.10 + R() * 0.3).toFixed(2) + ')';
      a.fillRect(R() * w, R() * hh, 1 + R() * 2.6, 1 + R() * 2.6);
    }
    // 轮辙（两条深色带）
    [0.30, 0.70].forEach(function (f) {
      const g = a.createLinearGradient(w * f - 26, 0, w * f + 26, 0);
      g.addColorStop(0, 'rgba(30,32,36,0)');
      g.addColorStop(0.5, 'rgba(30,32,36,0.42)');
      g.addColorStop(1, 'rgba(30,32,36,0)');
      a.fillStyle = g; a.fillRect(w * f - 26, 0, 52, hh);
    });
    // 中线虚线
    a.fillStyle = '#eef2f7';
    for (let i = 0; i < 9; i++) a.fillRect(w / 2 - 3, i * (hh / 9) + 22, 6, hh / 9 - 66);
    // 边线
    a.fillStyle = '#e6ebf1';
    a.fillRect(9, 0, 5, hh); a.fillRect(w - 14, 0, 5, hh);
    // 胎痕
    for (let i = 0; i < 260; i++) {
      a.strokeStyle = 'rgba(24,24,26,' + (0.05 + R() * 0.18).toFixed(3) + ')';
      a.lineWidth = 1 + R() * 3;
      const x = w * 0.5 + (R() - 0.5) * w * 0.5;
      const y = R() * hh, L = 20 + R() * 140;
      a.beginPath(); a.moveTo(x, y);
      a.lineTo(x + (R() - 0.5) * 12, y + L); a.stroke();
    }
    const t = mkTex(A, { srgb: true, aniso: 16 });
    t.repeat.set(2, 12);
    return t;
  }

  global.J8TEX = {
    mkCanvas: mkCanvas, prng: prng, mkTex: mkTex, roundRect: roundRect,
    heightToNormal: heightToNormal,
    skinSet: skinSet, metalSet: metalSet, nozzleSet: nozzleSet, tireSet: tireSet,
    radomeSet: radomeSet, insigniaTex: insigniaTex, textTex: textTex,
    concreteTex: concreteTex, runwayTex: runwayTex
  };
})(window);
