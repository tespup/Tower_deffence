/* Диагностика: первый выстрел турели по инерционному углу (ствол не довёлся).
   node tools/turret_aim_test.js */
const fs = require('fs'), path = require('path'), vm = require('vm');

const noop = () => {};
const anyFn = () => new Proxy(noop, { get: () => anyFn(), apply: () => undefined, set: () => true });
const stub = () => new Proxy({}, { get: () => anyFn() });

const win = {};
win.window = win;
win.GD = {};
win.GD.Audio = { SFX: stub() };
win.GD.FX = stub();
win.GD.Glow = stub();

const ctx = vm.createContext(win);
for (const f of ['core.js', 'turrets.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const T = win.GD.Turrets;

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const DEG = 180 / Math.PI;

function run(id, cell) {
  const e = { x: cell * 1.4, y: 0, dead: false, air: false, size: 22, d: 10, baseSpd: 40, slowT: 0, slowK: 1, damage() { return 0; }, slow: noop, burn: noop, stun: noop };
  const game = { cell, enemies: [e], turrets: [], pathAt: () => ({ x: e.x, y: e.y }), spawnBullet() {} };
  const tr = new T.Turret(0, 0, 0, 0, id, game);
  const want = Math.atan2(e.y - tr.cy, e.x - tr.cx);
  /* перехватываем залп первого выстрела */
  let shot = null;
  game.spawnBullet = function (o) { if (!shot) shot = { dirs: [], x: o.x, y: o.y }; shot.dirs.push(Math.atan2(o.vy, o.vx)); };
  const origFire = T.Turret.prototype.fire;
  let first = null;
  T.Turret.prototype.fire = function (g2, tg) {
    if (!first) {
      const before = shot;
      origFire.call(this, g2, tg);
      if (shot !== before) { /* снарядный залп уже записан */ }
      first = { t: this.t, barrelErr: Math.abs(angDiff(this.angle, want)) * DEG };
    }
    return origFire.call(this, g2, tg);
  };
  const dt = 1 / 60;
  let t = 0;
  for (let i = 0; i < 180 && !first; i++) { tr.update(dt, game); t += dt; }
  T.Turret.prototype.fire = origFire;
  if (!first) return null;
  let err = first.barrelErr;
  if (shot && shot.dirs.length) {
    err = shot.dirs.reduce((s, a) => s + Math.abs(angDiff(a, want)), 0) / shot.dirs.length * DEG;
    first.n = shot.dirs.length;
    /* куда реально долетит первый залп на дистанции цели */
    const d0 = cell * 1.4;
    first.lateralMiss = (d0 * Math.tan(err / DEG)).toFixed(0);
  }
  first.t = t;
  return first;
}

const cell = 90;
for (const id of ['shotgun', 'mg', 'rail', 'cryo', 'flak']) {
  const rs = [];
  for (let i = 0; i < 60; i++) { const r = run(id, cell); if (r) rs.push(r); }
  if (!rs.length) { console.log(id.padEnd(8) + ' — выстрела не было'); continue; }
  const e = rs.map(r => r.barrelErr), t = rs.map(r => r.t);
  const worst = Math.max(...e), avg = e.reduce((a, b) => a + b, 0) / e.length;
  const miss = rs.map(r => r.lateralMiss).filter(v => v).map(Number);
  const extra = miss.length ? `  мимо цели на ${Math.max(...miss)}px` : '';
  console.log(`${id.padEnd(8)} n=${rs.length}  1-й выстрел через ${(t.reduce((a, b) => a + b, 0) / t.length).toFixed(2)}с  отклонение ствола: средн. ${avg.toFixed(0)}°, худш. ${worst.toFixed(0)}°${extra}`);
}
