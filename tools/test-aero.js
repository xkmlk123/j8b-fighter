/* 气动模型离线校验：验证推力/阻力/升力平衡与性能包线 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'aero.js'), 'utf8');
const sandbox = { window: {}, Math: Math, console: console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const { J8Aero, WEAPONS } = sandbox;

function run(h0, V0, throttle, ab, alphaDeg, loadout, seconds, label) {
  const a = new J8Aero();
  a.h = h0; a.V = V0; a.onGround = false; a.gamma = 0;
  a.alpha = a.alphaT = alphaDeg * Math.PI / 180;
  a.loadout = loadout;
  a.gearDown = false;
  const inp = { throttle: throttle, ab: ab, braking: false };
  const dt = 1 / 120;
  for (let i = 0; i < seconds / dt; i++) a.step(dt, inp);
  const t = a.telemetry(inp);
  console.log(
    label.padEnd(26),
    'M=' + t.M.toFixed(2),
    'V=' + Math.round(t.kmh) + 'km/h',
    'h=' + Math.round(t.h) + 'm',
    'a=' + t.alpha.toFixed(1) + '°',
    'CL=' + t.CL.toFixed(2),
    'L/D=' + t.LD.toFixed(1),
    'T=' + (t.thrust / 1000).toFixed(1) + 'kN',
    'D=' + (t.drag / 1000).toFixed(1) + 'kN',
    'n=' + t.n.toFixed(2)
  );
  return t;
}

console.log('=== 挂载重量/阻力 ===');
[{}, { il: 'pl8', ol: 'pl5', or: 'pl5', ir: 'pl8', ct: 'tank' }].forEach(function (lo) {
  const a = new J8Aero(); a.loadout = lo;
  const s = a.storeStats();
  console.log('  挂载件数', s.count, ' 重量', s.mass + 'kg', ' ΔCD0=' + s.cd0.toFixed(4), ' 全机重量', a.mass() + 'kg');
});

console.log('\n=== 25 s 后稳态性能 ===');
run(0, 60, 1, false, 2, {}, 25, '海平面 全加力');
run(0, 60, 1, true, 2, {}, 40, '海平面 全加力+加力');
run(8000, 240, 1, true, 2, {}, 60, '8000m 加力');
run(11000, 300, 1, true, 2, {}, 90, '11000m 加力');
run(15000, 420, 1, true, 2, {}, 120, '15000m 加力');
run(20000, 520, 1, true, 2, {}, 120, '20000m 加力');
run(5000, 240, 0.62, false, 2.6, {}, 40, '5000m 巡航油门');

console.log('\n=== 构型影响（5000m, 240 m/s, 62% 油门）===');
run(5000, 240, 0.62, false, 2.6, {}, 30, '干净构型');
run(5000, 240, 0.62, false, 2.6, { il: 'pl8', ol: 'pl5', or: 'pl5', ir: 'pl8', ct: 'tank' }, 30, '截击挂载');
run(5000, 240, 0.62, false, 2.6, { il: 'rocketpod', ol: 'bomb250', or: 'bomb250', ir: 'rocketpod' }, 30, '对地挂载');

console.log('\n=== 气动系数抽样 ===');
const a0 = new J8Aero();
[-4, 0, 4, 8, 12, 14, 16, 17, 18, 20, 24].forEach(function (al) {
  const c = a0.coeff(al, 0.3);
  console.log('  α=' + String(al).padStart(3) + '°  CL=' + c.CL.toFixed(3) +
    '  CD=' + c.CD.toFixed(4) + '  L/D=' + (c.CL / c.CD).toFixed(1) + (c.stalled ? '  [失速]' : ''));
});

console.log('\n=== 增升装置对 CD0 影响 (M=0.3) ===');
a0.gearDown = false;
a0.flap = 0; a0.brake = 0; console.log('  干净     ', a0.cd0(0.3).toFixed(4));
a0.flap = 1; console.log('  襟翼全放 ', a0.cd0(0.3).toFixed(4));
a0.flap = 0; a0.brake = 1; console.log('  减速板全开', a0.cd0(0.3).toFixed(4));
a0.brake = 0; a0.gearDown = true; console.log('  起落架放下', a0.cd0(0.3).toFixed(4));
a0.gearDown = false;
console.log('\n=== 升阻比（起落架收上, M=0.35）===');
[2, 4, 6, 8, 10, 12].forEach(function (al) {
  const c = a0.coeff(al, 0.35);
  console.log('  α=' + String(al).padStart(2) + '°  CL=' + c.CL.toFixed(3) + '  L/D=' + (c.CL / c.CD).toFixed(1));
});

console.log('\n=== 地面起飞滑跑（0 → 离地）===');
(function () {
  const a = new J8Aero();
  a.target = null;
  a.alphaT = 0; a.alpha = 0; a.gearDown = true; a.flap = 1;
  const inp = { throttle: 1, ab: true, braking: false };
  const dt = 1 / 120;
  let t = 0, lifted = 0;
  for (let i = 0; i < 120 / dt; i++) {
    a.step(dt, inp); t += dt;
    if (!a.onGround) { lifted = t; break; }
  }
  const tel = a.telemetry(inp);
  console.log('  离地速度 ' + Math.round(a.V * 3.6) + ' km/h, 滑跑距离 ' + Math.round(a.dist) + ' m, 耗时 ' + lifted.toFixed(1) + ' s');
})();

console.log('\n=== 高空最大马赫数（加力, 主动配平）===');
[[13000, 6], [16000, 7], [19000, 8]].forEach(function (c) {
  const a = new J8Aero();
  a.h = c[0]; a.V = 500; a.onGround = false;
  a.alphaT = a.alpha = c[1] * Math.PI / 180;
  a.gearDown = false;
  const inp = { throttle: 1, ab: true, braking: false };
  const dt = 1 / 120;
  let best = 0, bestH = 0;
  for (let i = 0; i < 180 / dt; i++) {
    a.step(dt, inp);
    const tel = a.telemetry(inp);
    if (tel.h > 11500 && tel.M > best) { best = tel.M; bestH = tel.h; }
  }
  console.log('  起始 ' + c[0] + 'm / α=' + c[1] + '°  →  最大 Ma ' + best.toFixed(2) + ' @ ' + Math.round(bestH) + ' m');
});
