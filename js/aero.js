/* ============================================================
   aero.js — J-8B 纵向气动 / 飞行性能仿真模型
   参数取自公开资料：机长 21.59 m，翼展 9.34 m，机翼面积 42.2 m²，
   空重 9820 kg，内油约 3500 kg，双发涡喷-13A（单台 43.0 kN / 加力 65.0 kN）
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- 标准大气 ISA (0 ~ 25 km) ---------------- */
  const G = 9.80665, R = 287.05287;
  const T0 = 288.15, P0 = 101325, RHO0 = 1.225;

  function isa(h) {
    h = Math.max(-500, Math.min(25000, h));
    let T, p;
    if (h <= 11000) {
      T = T0 - 0.0065 * h;
      p = P0 * Math.pow(T / T0, G / (0.0065 * R));
    } else {
      T = 216.65;
      const p11 = P0 * Math.pow(216.65 / T0, G / (0.0065 * R));
      p = p11 * Math.exp(-G * (h - 11000) / (R * T));
    }
    const rho = p / (R * T);
    return { T: T, p: p, rho: rho, a: Math.sqrt(1.4 * R * T), sigma: rho / RHO0 };
  }

  /* ---------------- 武器 / 外挂物数据库 ---------------- */
  // cd0：该挂载单独贡献的零升阻力（以全机参考面积为基准）
  const WEAPONS = {
    none:      { name: '— 空挂点 —',      short: '空',   mass: 0,   cd0: 0,      len: 0,    dia: 0,     kind: 'none' },
    pl2:       { name: 'PL-2 红外空空导弹', short: 'PL-2', mass: 82,  cd0: 0.0026, len: 3.00, dia: 0.127, kind: 'aam' },
    pl5:       { name: 'PL-5B 红外空空导弹', short: 'PL-5', mass: 85,  cd0: 0.0026, len: 3.13, dia: 0.127, kind: 'aam' },
    pl8:       { name: 'PL-8 红外空空导弹',  short: 'PL-8', mass: 120, cd0: 0.0032, len: 3.00, dia: 0.160, kind: 'aam' },
    pl11:      { name: 'PL-11 半主动雷达弹', short: 'PL-11', mass: 220, cd0: 0.0045, len: 3.70, dia: 0.203, kind: 'aam' },
    rocketpod: { name: '57-2 火箭巢 (12 发)', short: '火箭巢', mass: 220, cd0: 0.0056, len: 2.05, dia: 0.42, kind: 'pod' },
    bomb250:   { name: '250-3 航空炸弹',    short: '航弹', mass: 250, cd0: 0.0040, len: 1.85, dia: 0.30, kind: 'bomb' },
    tank:      { name: '480L 副油箱',       short: '副油箱', mass: 480, cd0: 0.0068, len: 3.55, dia: 0.52, kind: 'tank' }
  };

  const STATIONS = [
    { id: 'il', name: '左内翼', en: 'Sta.2L' },
    { id: 'ol', name: '左外翼', en: 'Sta.1L' },
    { id: 'tl', name: '左翼尖', en: 'Tip-L' },
    { id: 'ct', name: '机腹中线', en: 'Centerline' },
    { id: 'tr', name: '右翼尖', en: 'Tip-R' },
    { id: 'or', name: '右外翼', en: 'Sta.1R' },
    { id: 'ir', name: '右内翼', en: 'Sta.2R' }
  ];

  /* ---------------- 冻结的波阻增量表（马赫数 → ΔCD） ---------------- */
  const WAVE_M = [0.00, 0.70, 0.80, 0.87, 0.95, 1.05, 1.20, 1.40, 1.60, 1.80, 2.00, 2.20, 2.60];
  const WAVE_D = [0.0000, 0.0000, 0.0012, 0.0042, 0.0122, 0.0198, 0.0236, 0.0214, 0.0172, 0.0144, 0.0128, 0.0122, 0.0136];

  function tableLerp(xs, ys, x) {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    for (let i = 1; i < xs.length; i++) {
      if (x <= xs[i]) {
        const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
        return ys[i - 1] + (ys[i] - ys[i - 1]) * t;
      }
    }
    return ys[ys.length - 1];
  }

  // 超音速时升力线斜率折减（薄翼理论量级）
  const CLA_M = [0.0, 0.9, 1.0, 1.2, 1.5, 1.8, 2.2, 3.0];
  const CLA_F = [1.0, 1.0, 0.93, 0.85, 0.78, 0.74, 0.70, 0.64];

  /* ============================================================
     J8Aero — 仿真主体
     状态量：V(真空速 m/s)、gamma(航迹倾角 rad)、alpha(迎角 rad)、
             q(俯仰角速度)、h(高度 m)、fuel(燃油 kg)
     ============================================================ */
  function J8Aero() {
    this.S = 42.2;          // 机翼面积 m²
    this.b = 9.34;          // 翼展 m
    this.AR = (this.b * this.b) / this.S; // ≈ 2.07
    this.mEmpty = 9820;     // 空重 kg
    this.fuelMax = 3500;    // 内油 kg
    this.T_SL_DRY = 43000;  // 单台干推力 N
    this.T_SL_AB = 65000;   // 单台加力推力 N
    this.nEng = 2;
    this.CD0_CLEAN = 0.0146;
    this.kInduced = 0.148;  // 诱导阻力因子 1/(π·e·AR)

    this.loadout = { il: 'none', ol: 'none', ct: 'none', or: 'none', ir: 'none' };
    this.gearDown = true;
    this.flap = 0;          // 0~1 襟翼下偏比例
    this.brake = 0;         // 0~1 减速板张开比例

    this.reset();
  }

  J8Aero.prototype.reset = function (keepConfig) {
    this.V = 0;
    this.gamma = 0;
    this.alpha = 0;
    this.alphaT = 0;
    this.qPitch = 0;
    this.h = 0;
    this.fuel = this.fuelMax;
    this.onGround = true;
    this.crashed = false;
    this.time = 0;
    this.dist = 0;
    if (!keepConfig) { /* 配置由外部控制 */ }
  };

  /* ---- 挂载统计 ---- */
  J8Aero.prototype.storeStats = function () {
    let mass = 0, cd0 = 0, count = 0;
    for (const k in this.loadout) {
      const w = WEAPONS[this.loadout[k]];
      if (!w || w.kind === 'none') continue;
      mass += w.mass; cd0 += w.cd0; count++;
      cd0 += 0.0007 * (w.kind === 'tank' || w.kind === 'pod' ? 2 : 1); // 挂架干扰阻力
    }
    return { mass: mass, cd0: cd0, count: count };
  };

  J8Aero.prototype.mass = function () {
    return this.mEmpty + this.fuel + this.storeStats().mass;
  };

  /* ---- 零升阻力（含挂载 / 起落架 / 减速板 / 襟翼 / 波阻） ---- */
  J8Aero.prototype.cd0 = function (M) {
    let cd = this.CD0_CLEAN + tableLerp(WAVE_M, WAVE_D, M);
    cd += this.storeStats().cd0;
    if (this.gearDown) cd += 0.0205;                       // 起落架 + 舱门
    cd += 0.090 * this.brake * this.brake / (1 + 0.55 * M); // 减速板（高速效率下降）
    cd += 0.052 * this.flap * this.flap;                    // 襟翼下偏带来的阻力
    return cd;
  };

  /* ---- 升力系数 / 阻力系数 ---- */
  J8Aero.prototype.coeff = function (alphaDeg, M) {
    const f = tableLerp(CLA_M, CLA_F, M);
    const cla = 0.0555 * f;                       // 升力线斜率 °⁻¹
    const flapAdd = this.flap * 0.34;             // 襟翼增升（零迎角偏移等效量）
    const clMaxClean = 1.05 * (1 - 0.16 * Math.max(0, M - 1));
    const clMax = clMaxClean + this.flap * 0.52;
    const aMax = 17 + this.flap * 2.0;            // 失速迎角 °
    const a1 = 12;

    let CL;
    if (alphaDeg <= a1) {
      CL = cla * alphaDeg + flapAdd * Math.min(1, Math.max(0, alphaDeg + 4) / 8);
    } else if (alphaDeg <= aMax) {
      const base = cla * a1 + flapAdd;
      const t = (alphaDeg - a1) / (aMax - a1);
      CL = base + (clMax - base) * Math.pow(t, 0.65);   // 涡升力段
    } else {
      const t = (alphaDeg - aMax) / 12;
      CL = clMax * (1 - 0.55 * Math.min(1.6, t));       // 失速后衰减
    }
    if (alphaDeg < 0) CL = cla * alphaDeg - Math.min(0.28, -alphaDeg * 0.012);

    const stalled = alphaDeg > aMax;
    const deepStall = Math.max(0, alphaDeg - aMax);
    // 后失速阻力：分离导致阻力持续上升
    const CDstall = deepStall > 0 ? 0.016 * deepStall + 0.0009 * deepStall * deepStall : 0;
    const CD = this.cd0(M) + this.kInduced * CL * CL + CDstall;
    return { CL: CL, CD: CD, clMax: clMax, aMax: aMax, stalled: stalled, cla: cla, flapAdd: flapAdd };
  };

  /* ---- 大气与推力 ---- */
  J8Aero.prototype.atm = function () { return isa(this.h); };

  J8Aero.prototype.thrust = function (throttle, ab, M) {
    const atm = isa(this.h);
    // 涡轮喷气发动机：密度高度衰减 + 高速冲压恢复
    const ram = 1 + 0.32 * Math.min(M, 2.4) * Math.min(1, atm.sigma * 4);
    const lapse = Math.pow(Math.max(0.05, atm.sigma), 0.68);
    const dry = this.T_SL_DRY * this.nEng * lapse * ram;
    const abExtra = (this.T_SL_AB - this.T_SL_DRY) * this.nEng * lapse * ram;
    const T = throttle * dry + (ab ? abExtra : 0);
    return { T: T, dry: dry, abExtra: abExtra, atm: atm };
  };

  /* ---- 主积分步 ---- */
  J8Aero.prototype.step = function (dt, inp) {
    const sub = 4;                       // 子步长提高稳定性
    const h = dt / sub;
    for (let i = 0; i < sub; i++) this._sub(h, inp);
    return this.telemetry(inp);
  };

  J8Aero.prototype._sub = function (dt, inp) {
    this.time += dt;
    const m = this.mass();
    const atm = isa(this.h);
    const V = Math.max(0.5, this.V);
    const M = V / atm.a;
    const q = 0.5 * atm.rho * V * V;     // 动压 Pa

    // ---- 俯仰通道：平尾追随目标迎角（含阻尼与操纵效率折减）----
    const eff = Math.max(0.22, Math.min(1, q / 2200));
    const target = this.alphaT;
    const Kp = 26 * eff, Kd = 7.0 * eff;
    // 巡航自动驾驶：航迹倾角阻尼（抑制长周期浮沉），仅在 gammaHold 时生效
    const gDamp = this.gammaHold ? 0.62 * (0 - this.gamma) : 0;
    const aerr = (target - this.alpha) - this.qPitch * 0.16 + gDamp;
    this.qPitch += (Kp * aerr - Kd * this.qPitch) * dt;
    this.alpha += this.qPitch * dt * 0.55;
    this.alpha = Math.max(-0.20, Math.min(0.52, this.alpha)); // ±30° 限幅

    const alphaDeg = this.alpha * 180 / Math.PI;
    const c = this.coeff(alphaDeg, M);
    const thr = this.thrust(inp.throttle, inp.ab, M);
    this.lastCoeff = c;
    this.lastThr = thr;
    this.lastQ = q;
    this.lastM = M;

    const L = q * this.S * c.CL;
    const D = q * this.S * c.CD;
    const W = m * G;

    if (this.onGround) {
      // ---------- 地面滑跑 ----------
      this.gamma = 0;
      this.h = 0;
      this.alpha = Math.min(this.alpha, 0.21);
      const mu = inp.braking ? 0.32 : 0.032;          // 刹车 / 滚动摩擦
      const liftFrac = Math.max(0, L / W);
      const N = W * Math.max(0.05, 1 - liftFrac);      // 剩余正压力
      const acc = (thr.T * Math.cos(this.alpha) - D - mu * N - W * Math.sin(0)) / m;
      this.V = Math.max(0, this.V + acc * dt);
      this.dist += this.V * dt;
      // 升力大于重力 → 离地
      if (L * Math.cos(this.alpha) > W && !inp.braking && this.V > 45) {
        this.onGround = false;
        this.gamma = 0.02;
      }
      this._burnFuel(thr, dt);
      return;
    }

    // ---------- 空中 2 自由度纵向运动 ----------
    const alongAcc = (thr.T * Math.cos(this.alpha) - D - W * Math.sin(this.gamma) - m * this.gamma * 0) / m;
    this.V = Math.max(20, this.V + alongAcc * dt);

    const Vn = Math.max(25, this.V);
    const gammaDot = (L + thr.T * Math.sin(this.alpha) - W * Math.cos(this.gamma)) / (m * Vn);
    this.gamma += gammaDot * dt;
    this.gamma = Math.max(-1.45, Math.min(1.45, this.gamma));

    this.h += this.V * Math.sin(this.gamma) * dt;
    this.dist += this.V * Math.cos(this.gamma) * dt;

    if (this.h <= 0) {
      if (this.gearDown && this.gamma > -0.28 && Math.abs(this.theta()) < 0.30) {
        this.h = 0; this.gamma = 0; this.onGround = true;   // 接地
      } else {
        this.h = 0; this.gamma = 0; this.V *= 0.92;
        if (this.V < 40) { this.crashed = true; this.V = 0; this.onGround = true; }
      }
    }
    this._burnFuel(thr, dt);
  };

  J8Aero.prototype._burnFuel = function (thr, dt) {
    if (this.fuel <= 0) { this.fuel = 0; return; }
    const T = thr.T;
    const abFrac = thr.abExtra > 1 ? Math.min(1, Math.max(0, (T - thr.dry) / Math.max(1, thr.abExtra))) : 0;
    const dryPart = Math.min(T, thr.dry);
    // TSFC：干 0.85 kg/(kgf·h)，加力 1.95 kg/(kgf·h)
    const mdot = (dryPart / 9.80665) * (0.85 + 1.10 * abFrac) / 3600;
    this.fuel = Math.max(0, this.fuel - mdot * dt);
  };

  J8Aero.prototype.theta = function () { return this.gamma + this.alpha; };

  /* ---- 遥测输出 ---- */
  J8Aero.prototype.telemetry = function (inp) {
    const atm = isa(this.h);
    const V = this.V;
    const M = V / atm.a;
    const m = this.mass();
    const alphaDeg = this.alpha * 180 / Math.PI;
    const c = this.coeff(alphaDeg, M);
    const thr = this.thrust(inp.throttle, inp.ab, M);
    const q = 0.5 * atm.rho * V * V;
    const L = q * this.S * c.CL;
    const D = q * this.S * c.CD;
    const W = m * G;
    const n = this.onGround ? 1 : L / W;
    const excess = thr.T - D;
    const vs = this.onGround ? 0 : V * Math.sin(this.gamma);
    return {
      t: this.time, V: V, kmh: V * 3.6, M: M, h: this.h, alpha: alphaDeg,
      theta: this.theta() * 180 / Math.PI, gamma: this.gamma * 180 / Math.PI,
      CL: c.CL, CD: c.CD, LD: c.CD > 1e-6 ? c.CL / c.CD : 0,
      clMax: c.clMax, aMax: c.aMax, stalled: c.stalled,
      lift: L, drag: D, thrust: thr.T, weight: W, n: n, excess: excess,
      vs: vs, q: q, rho: atm.rho, onGround: this.onGround, fuel: this.fuel,
      mass: m, stores: this.storeStats(), crashed: this.crashed
    };
  };

  /* ---- 失速特性曲线采样（供绘图） ---- */
  J8Aero.prototype.curve = function (M) {
    const pts = [];
    for (let a = -8; a <= 28; a += 0.4) {
      const c = this.coeff(a, M);
      pts.push({ a: a, CL: c.CL, CD: c.CD });
    }
    return pts;
  };

  global.J8Aero = J8Aero;
  global.WEAPONS = WEAPONS;
  global.STATIONS = STATIONS;
  global.isa = isa;
})(window);
