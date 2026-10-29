/* ---------------------------------------------------------------------------
   Бенч турелей для консоли браузера (открываем index.html, цепляем этот файл):
     var s = document.createElement('script'); s.src = 'tools/bench.js'; document.head.appendChild(s);
   затем:
     __sim([['mg',1]], 1)            — прогнать уровень 1 с одной турелью, поволюмная сводка
     __sim([['mg',1],['shotgun',1]]) — тот же прогон для комбинации
     __ladder('grunt', {})           — ДПС всех турелей по одиночной цели
     __ladder('tank', {level:4})     — по броне;  __ladder('drone', {level:2}) — по воздуху
     __ladder('grunt', {n:6})        — по «толпе» из 6 целей
     __dps('mg', 'grunt', {lv:4})    — ДПС одной турели
     __ttk('shotgun', 'grunt', {})   — время убийства одной живой цели
   Всё считается по фактическому урону (обёртка Enemy.prototype.damage), враг
   «припаркован» в радиусе, пауза снята вручную шагом g.step(1/60).
--------------------------------------------------------------------------- */
(function () {
  const g = GD.game, D = GD.Turrets.DEFS, EP = GD.Enemies.Enemy.prototype;
  if (!EP.__bench) { const od = EP.damage; EP.__bench = od; window.__dealt = 0;
    EP.damage = function (a, o) { const r = od.call(this, a, o); window.__dealt += r; return r; }; }
  const dt = 1 / 60;

  function cellsSorted() {
    const s = [];
    for (let r = 1; r < g.field.rows - 1; r++) for (let c = 1; c < g.field.cols - 1; c++) {
      if (!g.cellFree(c, r)) continue;
      const x = (c + .5) * g.cell, y = g.topPad + (r + .5) * g.cell;
      let nd = 1e9, cov = 0;
      for (let d = 0; d <= g.pathTotal; d += 6) { const p = g.pathAt(d, 0); nd = Math.min(nd, Math.hypot(p.x - x, p.y - y)); }
      for (let d = 0; d <= g.pathTotal; d += 8) { const p = g.pathAt(d, 0); if (Math.hypot(p.x - x, p.y - y) < g.cell * 2.4) cov++; }
      s.push({ c, r, nd, cov });
    }
    return s.sort((a, b) => a.nd - b.nd || b.cov - a.cov);
  }
  /* клетка с максимальным покрытием дороги — «лучшая» точка под турель */
  function bestCell() { const s = cellsSorted(); let b = s[0]; for (const x of s) if (x.cov > b.cov) b = x; return b; }
  function nearestPathD(x, y) { let nd = 0, bd = 1e9; for (let d = 0; d <= g.pathTotal; d += 6) { const p = g.pathAt(d, 0); const q = Math.hypot(p.x - x, p.y - y); if (q < bd) { bd = q; nd = d; } } return nd; }
  function mk(id, cl, o) {
    const t = new GD.Turrets.Turret((cl.c + .5) * g.cell, g.topPad + (cl.r + .5) * g.cell, cl.c, cl.r, id, g);
    t.plantT = 0; if (o && o.lv) t.lvl = o.lv; g.turrets.push(t); return t;
  }
  /* припарковать врага: бессмертный, скорость низкая, стоит на дороге */
  function park(arch, d, lane) {
    const e = g.spawnEnemy(arch, lane || 0, 0); if (!e) return null;
    e.maxHp = e.hp = 1e9; e.baseSpd = 5;
    e.d = d; const p = g.pathAt(e.d, e.lane); e.x = p.x; e.y = p.y; return e;
  }

  /* ДПС одной турели: n целей, T секунд */
  window.__dps = (id, arch, o) => {
    o = o || {};
    const L = o.level || 1, T = o.T || 14, n = o.n || 1;
    g.buildLevel(L); g.paused = true; g.baseHp = 1e6;
    const cl = bestCell(), t = mk(id, cl, o);
    const nd = nearestPathD(t.cx, t.cy), es = [];
    for (let i = 0; i < n; i++) { const e = park(arch, nd - 25 - i * 30); if (!e) break; es.push(e); }
    if (!es.length) return null;
    const arm = Math.round(es[0].armor * 10) / 10, hp = Math.round(es[0].maxHp / 1e9);
    window.__dealt = 0;
    for (let i = 0, k = Math.round(T / dt); i < k; i++) { g.step(dt); for (const e of es) if (!e.dead) e.baseSpd = 5; }
    return { id, cost: t.d.cost, lv: t.lvl, dps: +(window.__dealt / T).toFixed(1), per: +(window.__dealt / T / t.d.cost * 100).toFixed(1), arm, hp };
  };

  window.__ladder = (arch, o, runs) => {
    runs = runs || 3; const rows = [];
    for (const id of GD.Turrets.ORDER) {
      if (D[id].healTurret) continue;
      const a = [];
      for (let k = 0; k < runs; k++) { const r = __dps(id, arch, o); if (r) a.push(r); }
      if (!a.length) continue;
      rows.push({ id, cost: a[0].cost, lv: a[0].lv, dps: +(a.reduce((s, r) => s + r.dps, 0) / a.length).toFixed(1), per: +(a.reduce((s, r) => s + r.per, 0) / a.length).toFixed(1), arm: a[0].arm, hp: a[0].hp });
    }
    return rows.sort((x, y) => x.cost - y.cost);
  };
  window.__fmt = r => [r.id.padEnd(8), (r.cost + '$').padStart(4), 'ур' + r.lv, 'ДПС ' + String(r.dps).padStart(6), '/100$ ' + String(r.per).padStart(5), 'бр' + r.arm].join(' | ');

  /* время убийства одной живой цели */
  window.__ttk = (id, arch, o) => {
    o = o || {};
    g.buildLevel(o.level || 1); g.paused = true; g.baseHp = 1e6;
    const cl = bestCell(), t = mk(id, cl, o);
    const e = g.spawnEnemy(arch, 0, 0); if (!e) return null;
    const hp = Math.round(e.maxHp), arm = Math.round(e.armor * 10) / 10;
    const nd = nearestPathD(t.cx, t.cy);
    e.d = nd - 25; const p = g.pathAt(e.d, e.lane); e.x = p.x; e.y = p.y;
    let i = 0; const cap = 60 * 30;
    for (; i < cap; i++) { g.step(dt); if (e.dead) break; e.baseSpd = 5; e.x = p.x; e.y = p.y; }
    return [id.padEnd(8), 'ур' + t.lvl, (hp + '/' + arm).padStart(9), e.dead ? (i / 60).toFixed(1) + 'с' : '>30с'].join(' | ');
  };

  /* реалистичный прогон: план застройки, уровень, секunds; сводка по волнам */
  window.__sim = (plan, level, T) => {
    level = level || 1; T = T || 480;
    g.buildLevel(level); g.paused = true; g.baseHp = 100; g.scrap = 1e6;
    const cells = cellsSorted();
    plan.forEach(([id, n], k) => { for (let i = 0; i < n; i++) mk(id, cells[(k * 3 + i * 2) % cells.length], null); });
    let spawns = 0; const os = g.spawnEnemy.bind(g);
    g.spawnEnemy = function (a, b, c) { spawns++; return os(a, b, c); };
    g.startWave();
    let f = 0, w = g.waveNum, hp = g.baseHp, sp0 = 0, k0 = 0; const rows = [];
    while (f < 60 * T && g.baseHp > 0) {
      g.step(dt); f++;
      if (g.waveNum !== w) { rows.push('в' + (w + 1) + ':' + (g.kills - k0) + '/' + (spawns - sp0) + ' уб., -' + Math.round(hp - g.baseHp) + 'HP');
        w = g.waveNum; hp = g.baseHp; sp0 = spawns; k0 = g.kills; }
    }
    rows.push('в' + (w + 1) + ':' + (g.kills - k0) + '/' + (spawns - sp0) + ' уб., -' + Math.round(hp - g.baseHp) + 'HP');
    g.spawnEnemy = os;
    return plan.map(p => p[0] + 'x' + p[1]).join('+') + ' => ' + (g.baseHp <= 0 ? 'СЛИВ' : 'выжил') + ', в' + (g.waveNum + 1) + ', жизнь ' + Math.round(g.baseHp) + ' | ' + rows.slice(0, 10).join(' | ');
  };
  window.__bench = 1;
})();
