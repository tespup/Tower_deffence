/* Диагностика лазера «Стрела-2»: урон луча во времени + куда реально рисуется луч.
   node tools/laser_beam_test.js */
const fs = require('fs'), path = require('path'), vm = require('vm');

const noop = () => {};
const anyFn = () => new Proxy(noop, { get: () => anyFn(), apply: () => undefined, set: () => true });
const stub = () => new Proxy({}, { get: () => anyFn() });

const win = {};
win.window = win; win.GD = {};
win.GD.Audio = { SFX: stub() };
win.GD.FX = stub();
win.GD.Glow = stub();
win.GD.lin = () => ({ addColorStop: noop });
win.GD.rad = () => ({ addColorStop: noop });

const ctxVm = vm.createContext(win);
for (const f of ['core.js', 'turrets.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctxVm, { filename: f });
const T = win.GD.Turrets;
const DEG = 180 / Math.PI;
const cell = 90;

/* ---------- A. урон луча ---------- */
function dmgRun(lvl, secs) {
  const e = {
    x: cell * 1.4, y: 0, dead: false, air: false, size: 22, d: 10, baseSpd: 40,
    slowT: 0, slowK: 1, armor: 0, hp: 1e9, maxHp: 1e9,
    damage(a) { ticks.push({ t, a: a }); return a; }, slow: noop, burn: noop, stun: noop
  };
  const ticks = [];
  let t = 0;
  const game = { cell, enemies: [e], turrets: [], pathAt: () => ({ x: e.x, y: e.y }), spawnBullet: noop, level: 1 };
  const tr = new T.Turret(0, 0, 0, 0, 'laser', game);
  tr.lvl = lvl;
  const dt = 1 / 60;
  const T0 = .6, T1 = 3.6;              /* считаем установившийся режим */
  let inWin = 0;
  for (let i = 0; i < T1 * 60; i++) {
    const wasOn = t >= T0;
    tr.update(dt, game); t += dt;
    if (wasOn) inWin++;
  }
  const total = ticks.filter(x => x.t >= T0).reduce((s, x) => s + x.a, 0);
  return { total, dps: total / (inWin * dt), ticks: ticks.length, per: ticks.map(x => x.a), dpsGetter: tr.dmg, beamT: tr.beamT, cool: tr.cool };
}
console.log('=== A. Урон луча (ожидаем фактический dps == getter dps) ===');
for (const lvl of [1, 2, 3, 4]) {
  const r = dmgRun(lvl, 3);
  const gap = r.ticks > 1 ? r.ticks[r.ticks.length - 1] : 0;
  console.log(`ур.${lvl}: dps getter ${r.dpsGetter.toFixed(1)} | фактический ${(r.dps).toFixed(1)}/с` +
    ` | тиков за 3с: ${r.ticks} | урон за тик ${r.per[0] ? r.per[0].toFixed(2) : '—'} | cool=${r.cool.toFixed(1)}`);
}

/* ---------- B. геометрия луча ---------- */
/* пишущий ctx: помнит точки moveTo/lineTo в мировых координатах */
function makeCtx() {
  const o = {
    m: [1, 0, 0, 1, 0, 0], stack: [], lines: [],
    _t(fn) { o.stack.push(o.m.slice()); fn(); },
    save() { o.stack.push(o.m.slice()); },
    restore() { o.m = o.stack.pop() || [1, 0, 0, 1, 0, 0]; },
    translate(x, y) { const m = o.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; },
    scale(x, y) { const m = o.m; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; },
    rotate(a) {
      const m = o.m, ca = Math.cos(a), sa = Math.sin(a);
      o.m = [m[0] * ca + m[2] * sa, m[1] * ca + m[3] * sa,
             m[0] * -sa + m[2] * ca, m[1] * -sa + m[3] * ca, m[4], m[5]];
    },
    setTransform() {}, beginPath() { o._p = []; }, closePath() {},
    moveTo(x, y) { const m = o.m; o._last = [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
    lineTo(x, y) {
      const m = o.m, p = o._last || [0, 0];
      o.lines.push({ from: [p[0], p[1]], to: [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] });
      o._last = [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    },
    quadraticCurveTo(a, b, x, y) { const m = o.m; o._last = [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
    stroke() {}, fill() {}, arc() {}, ellipse() {}, rect() {}, fillRect() {}, strokeRect() {},
    createLinearGradient() { return { addColorStop: noop }; },
    createRadialGradient() { return { addColorStop: noop }; },
    clip() {}, setLineDash() {}, drawImage() {}, clearRect() {}
  };
  return new Proxy(o, {
    get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[a-z]/.test(k) ? noop : undefined)),
    set: () => true
  });
}

console.log('\n=== B. Куда рисуется луч (трансформации ART.laser) ===');
for (const ang of [0, 0.5, -1.2, 2.6]) {
  const game = { cell, enemies: [], turrets: [] };
  const tr = new T.Turret(0, 0, 0, 0, 'laser', game);
  const L = cell * 1.6;
  const tx = Math.cos(ang) * L, ty = Math.sin(ang) * L;
  tr.angle = ang; tr.recoil = 0; tr.beamT = .5;
  tr.target = { x: tx, y: ty, size: 20, dead: false };
  const c = makeCtx();
  c.save = (() => { const s = c.save; return () => s(); })();
  const rec = makeCtx();
  rec.translate(tr.cx, tr.cy);          /* как в Turret.draw */
  T.ART.laser(rec, tr, cell, 1.2, 0);
  /* ожидаемый конец луча — в точку цели */
  const wantLen = Math.hypot(tx, ty - tr.target.size * .35);
  const rows = rec.lines.filter(l => Math.hypot(l.to[0] - l.from[0], l.to[1] - l.from[1]) > 40).map(l => {
    const dx = l.to[0] - l.from[0], dy = l.to[1] - l.from[1];
    const a = Math.atan2(dy, dx);
    let err = ((a - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const miss = Math.hypot(l.to[0] - tx, l.to[1] - (ty - tr.target.size * .35));
    return `длина ${Math.hypot(dx, dy).toFixed(0).padStart(4)}px  напр. ${(a * DEG).toFixed(0).padStart(4)}°  ошибка ${(err * DEG).toFixed(1)}°  промах конца ${miss.toFixed(0)}px`;
  });
  console.log(`angle=${(ang * DEG).toFixed(0).padStart(4)}°  цель на ${wantLen.toFixed(0)}px`);
  rows.forEach(r => console.log('   отрезок: ' + r));
  if (!rows.length) console.log('   (отрезков нет)');
}
