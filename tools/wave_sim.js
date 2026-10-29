/* ---------------------------------------------------------------------------
   Авто-игрок для оценки кривой сложности (в браузере, после bench.js):
     var s=document.createElement('script'); s.src='tools/wave_sim.js';
     document.head.appendChild(s);
   затем:
     __auto(3)                 — уровень 3: авто-игрок докупает турели между
                                 волнами, сводка по волнам (урон/убийства/металл)
     __auto(3, 400, {buy:[…]}) — своя очередь закупки, свой лимит секунд
     __curve([1,2,3,4,5])      — одна строка на уровень
   Авто-игрок НЕ апгрейдит турели и НЕ чинит — это консервативная оценка:
   реальный игрок сильнее. Считает также вклад обстрела бункера в урон.
--------------------------------------------------------------------------- */
(function () {
  const g = GD.game, D = GD.Turrets.DEFS, dt = 1 / 60;
  if (!window.__sim) console.warn('сначала загрузи tools/bench.js (__sim)');

  /* образец дороги + покрытие свободных клеток (жадно: максимум НОВОЙ дороги) */
  let SAMP = [], CELLS = [];
  function prep() {
    SAMP = [];
    for (let d = 0; d <= g.pathTotal; d += 12) { const p = g.pathAt(d, 0); SAMP.push([p.x, p.y]); }
    CELLS = [];
    for (let r = 1; r < g.field.rows - 1; r++) for (let c = 1; c < g.field.cols - 1; c++) {
      if (!g.cellFree(c, r)) continue;
      const x = (c + .5) * g.cell, y = g.topPad + (r + .5) * g.cell, cov = [];
      for (let i = 0; i < SAMP.length; i++) {
        const q = Math.hypot(SAMP[i][0] - x, SAMP[i][1] - y);
        if (q < g.cell * 2.1) cov.push(i);
      }
      if (cov.length) CELLS.push({ c, r, cov });
    }
  }
  const COVERED = new Set();
  function takeCell() {
    let best = null, bn = -1;
    for (const cl of CELLS) {
      if (cl.taken) continue;
      let n = 0; for (const i of cl.cov) if (!COVERED.has(i)) n++;
      if (n > bn) { bn = n; best = cl; }
    }
    if (!best || bn <= 0) { /* всё перекрыто — берём любую с максимальным покрытием */
      for (const cl of CELLS) if (!cl.taken && cl.cov.length > bn) { bn = cl.cov.length; best = cl; }
    }
    if (!best) return null;
    best.taken = true; for (const i of best.cov) COVERED.add(i);
    return best;
  }
  function buy(id) {
    const cl = takeCell(); if (!cl) return false;
    g.scrap -= D[id].cost;
    const t = new GD.Turrets.Turret((cl.c + .5) * g.cell, g.topPad + (cl.r + .5) * g.cell, cl.c, cl.r, id, g);
    t.plantT = 0; g.turrets.push(t); g.occ[cl.r][cl.c] = 1;
    return true;
  }

  window.__auto = (level, T, o) => {
    o = o || {}; T = T || 420;
    const pool = (o.buy || ['mg', 'shotgun', 'tesla', 'mortar', 'flame', 'cryo', 'rail', 'missile', 'laser', 'flak', 'emp'])
      .filter(id => D[id] && D[id].unlock <= level);
    g.buildLevel(level); g.paused = true; g.baseHp = 100;
    COVERED.clear(); prep(); for (const cl of CELLS) cl.taken = false;
    let spent = 0, idx = 0;
    const up = () => {
      const t = g.turrets.filter(x => x.lvl < GD.Turrets.MAXLV).sort((a, b) => a.lvl - b.lvl)[0];
      if (!t) return false;
      const c = GD.Turrets.upgradeCost(t.d, t.lvl);
      if (g.scrap < c) return false;
      g.scrap -= c; t.invested += c; t.lvl++;
      t.maxHp = Math.round(t.maxHp * 1.35); t.hp = t.maxHp; spent += c; return true;
    };
    /* закупка как у думающего игрока: смотрим на следующую волну (доля воздуха
       и средняя броня) и берём то, что по ней бьёт, + апгрейды через раз */
    function threat() {
      const w = g.waves[g.waveNum]; const th = { air: 0, armor: 0 };
      if (!w) return th;
      let ehp = 0, aehp = 0, ar = 0;
      for (const gr of w.groups) {
        const a = GD.Enemies.ARCH[gr.arch], hp = a.hp * g.escale.hp * gr.count;
        ehp += hp; ar += hp * a.armor * g.escale.armor; if (a.air) aehp += hp;
      }
      th.air = ehp ? aehp / ehp : 0; th.armor = ehp ? ar / ehp : 0; return th;
    }
    function value(id, th) {
      const d = D[id];
      const per = d.dmg * (d.pellets || 1) * (d.chain ? 1.9 : 1) * (d.splash ? 1.5 : 1);
      const eff = d.pierce ? per : Math.max(per * .25, per - th.armor);
      const gnd = eff * d.rate;
      const air = (d.aa || 0) > 0 ? eff * Math.max(d.aa, .001) * d.rate : 0;
      return (gnd * (1 - th.air) + air * th.air) / d.cost;
    }
    const shop = () => { for (let k = 0; k < 40; k++) {
      if (!o.noup && k % 2 === 1 && up()) continue;
      /* мастерская: игрок её ставит, когда башни начинают «таять» от ответного огня */
      if (D.repair.unlock <= level && g.scrap >= D.repair.cost &&
          !g.turrets.some(t => t.d.healTurret) &&
          g.turrets.filter(t => t.hp < t.maxHp * .8).length >= 2) {
        if (buy('repair')) { spent += D.repair.cost; continue; }
      }
      const th = o.dumb ? { air: 0, armor: 0 } : threat();
      let id = null, bv = -1;
      for (const cand of pool) {
        if (g.scrap < D[cand].cost) continue;
        const v = o.dumb ? 1 / D[cand].cost : value(cand, th);
        if (v > bv) { bv = v; id = cand; }
      }
      if (!id) return;
      if (!buy(id)) return; spent += D[id].cost; } };
    if (o.pre !== 0) shop();
    let hp = 100, spawns = 0, k0 = 0, sh0 = 0;
    const os = g.spawnEnemy.bind(g); g.spawnEnemy = function (a, b, c) { spawns++; return os(a, b, c); };
    /* урон по бункеру от обстрела (не от протечек) */
    const P = Object.getPrototypeOf(g);
    const st = window.__shellStat = { dmg: 0, shots: 0, leak: 0 };
    if (!P.__hs) { P.__hs = 1;
      const ol = P.leak; P.leak = function (e) { window.__shellStat.leak += e.leak; return ol.call(this, e); };
      const oc = P.enemyShoot; P.enemyShoot = function (e) { const n = this.ebullets.length; const r = oc.call(this, e);
        if (r !== false && this.ebullets.length > n) { const b = this.ebullets[this.ebullets.length - 1]; if (b && !b.turret) { window.__shellStat.shots++; window.__shellStat.dmg += b.baseDmg; } } return r; }; }
    g.startWave();
    let w = g.waveNum, f = 0; const rows = [];
    while (f < 60 * T && g.baseHp > 0 && g.state !== 'over_level') {
      g.step(dt); f++;
      if (g.state === 'break' || g.state === 'prep') { shop(); if (g.state === 'break') { g.breakT = 0; } }
      if (g.waveNum !== w) {
        rows.push('в' + (w + 1) + ':' + (g.kills - k0) + '/' + (spawns) + 'уб., -' + Math.round(hp - g.baseHp) +
          'HP, башен ' + g.turrets.length + ', ' + Math.round(g.scrap) + '$');
        k0 = g.kills; spawns = 0; hp = g.baseHp; w = g.waveNum;
      }
    }
    rows.push('в' + (w + 1) + ':' + (g.kills - k0) + '/' + spawns + 'уб., -' + Math.round(hp - g.baseHp) + 'HP, башен ' + g.turrets.length);
    g.spawnEnemy = os;
    return 'ур' + level + ' => ' + (g.baseHp <= 0 ? 'СЛИВ' : g.state === 'over_level' ? 'ЗАЧИЩЕН' : 'тайм-аут') +
      ', жизнь ' + Math.round(g.baseHp) + ', потрачено ' + spent + '$, обстрел ' + Math.round(st.dmg) + 'HP(' + st.shots + '), протечки ' + Math.round(st.leak) +
      ' | ' + rows.join(' | ');
  };
  window.__curve = (levels, o) => levels.map(L => __auto(L, 420, o)).join('\n');
  window.__wsim = 1;
})();
