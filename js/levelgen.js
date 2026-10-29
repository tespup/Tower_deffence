/* ============ LEVEL GEN: путь, сетка, декорации, волны ============ */
(function (GD) {
  'use strict';
  const { RNG, TAU, clamp, lerp, gfx, pathLength, hsl, pointAt } = GD;
  const COLS = 9;

  /* ---------- волны ---------- */
  const UNLOCK = { scout: 1, runner: 1, grunt: 1, spider: 2, drone: 2, bomber: 3, hover: 3, tank: 4, shield: 5, fixer: 6, hulkb: 6 };

  function enemyScale(level) {
    const L = level - 1;
    return {
      hp: 1 + .22 * L + .015 * Math.pow(L, 1.75),
      armor: 1 + .115 * L,
      spd: Math.min(1.45, 1 + .018 * L),
      bounty: 1 + .1 * L,
      leak: 1 + .08 * L
    };
  }

  /* Цена архетипа в бюджете волны. Раньше учитывался только «вес» a.w, из-за
     чего волна из 8 бомберов (прорыв 5 ОН) стоила генератору как 8 пехотинцев
     и на 3-м уровне 4-я волна сносила половину бункера. Теперь цена растёт за
     реальную прочность (hpK) и за вред от прорыва (leak). */
  function unitCost(a) {
    return 6 * Math.max(a.w, (a.hpK || a.w) * .8) * (.62 + .13 * a.leak);
  }
  const HEAVY = { hover: 1, tank: 1, shield: 1, hulkb: 1 };

  function makeWaves(level, rng) {
    const n = 6 + Math.min(4, Math.floor(level / 2));
    const waves = [];
    const pool = Object.keys(UNLOCK).filter(k => UNLOCK[k] <= level && k !== 'titan');
    for (let w = 0; w < n; w++) {
      const last = w === n - 1;
      /* первые две волны — без тяжёлой техники: игрок ещё не успел
         отстроиться, а тяжёлые юниты стоят полволны по времени жизни.
         Архетип, открытый ровно на этом уровне, дебютирует в последних двух
         волнах: «танк на 3-й волне» при 2 башнях не читается, это рулетка. */
      let pool2 = pool.filter(k => !(w < 2 && HEAVY[k]) &&
        !(w < n - 2 && HEAVY[k] && UNLOCK[k] === level));
      if (!pool2.length) pool2 = pool;
      let budget = 15 + level * 5.2 + w * (6 + level * 1);
      const groups = [];
      const used = {};
      let guard = 0;
      while (budget > 0 && guard++ < 14) {
        const arch = rng.pick(pool2);
        const a = GD.Enemies.ARCH[arch];
        const big = a.boss || a.suicide || a.heal || a.leak >= 4 || (a.hpK || 1) >= 1.3;
        /* лимит на волну, а не на группу: иначе генератор выкатывал по 3
           группы «опасных» архетипов и волна становилась непроходимой */
        const cap = arch === 'hulkb' ? 3 : a.heal ? 2 : big ? (w < n / 2 ? 4 : 6) : 9;
        const avail = cap - (used[arch] || 0);
        if (avail <= 0) { budget -= 4; continue; }
        const cnt = clamp(Math.floor(budget / unitCost(a)), 1, avail);
        if (cnt < 1) break;
        budget -= unitCost(a) * cnt;
        used[arch] = (used[arch] || 0) + cnt;
        groups.push({ arch, count: cnt, gap: clamp(1.15 - level * .03, .32, 1.15), delay: groups.length ? rng.float(.2, 1.1) : 0, lane: rng.float(0, 1) });
      }
      if (!groups.length) groups.push({ arch: 'scout', count: 6, gap: .7, delay: 0, lane: .5 });
      let boss = null;
      if (last && level % 3 === 0) { boss = 'titan'; groups.push({ arch: 'scout', count: 6 + level, gap: .5, delay: 2.5, lane: .5 }); }
      else if (last && level > 2) { groups.push({ arch: 'hulkb', count: 1 + Math.min(2, Math.floor(level / 5)), gap: 2.4, delay: 1, lane: .5 }); }
      waves.push({ groups, boss, reward: 36 + level * 10.5 + w * 5 });
    }
    return waves;
  }

  /* ---------- путь и сетка ---------- */
  function buildField(level, W, H, cell, topPad, botPad, rng) {
    const rows = Math.max(9, Math.floor((H - topPad - botPad) / cell));
    const pathH = (rows * cell + cell);
    const cols = COLS;
    let c = rng.int(1, cols - 2), r = -1.4;
    const pts = [{ c, r }];
    const maxR = rows - 1.6;
    let guard = 0;
    const wiggle = clamp(.55 + level * .04, .5, 1);
    while (r < maxR && guard++ < 40) {
      const dr = rng.int(1, 3) * (rng.chance(.15 * wiggle) ? 1 : 1);
      r = Math.min(maxR, r + dr);
      pts.push({ c, r });
      if (r >= maxR) break;
      let dir = c <= 0 ? 1 : c >= cols - 1 ? -1 : rng.sign();
      const dc = rng.int(1, 3);
      const nc = clamp(c + dir * dc, 0, cols - 1);
      if (nc === c) { r = Math.min(maxR, r + 1); pts.push({ c, r }); continue; }
      c = nc;
      pts.push({ c, r });
    }
    const cx = Math.floor(cols / 2);
    if (Math.abs(c - cx) > 0) { pts.push({ c, r: maxR }); pts.push({ c: cx, r: maxR }); c = cx; }
    pts.push({ c: cx, r: rows + .6 });

    /* px-точки + кумулятивные длины */
    const px = pts.map(p => ({ x: (p.c + .5) * cell, y: topPad + (p.r + .5) * cell }));
    const cum = [0];
    for (let i = 1; i < px.length; i++) cum.push(cum[i - 1] + Math.hypot(px[i].x - px[i - 1].x, px[i].y - px[i - 1].y));

    /* карта занятости */
    const blocked = [];
    for (let i = 0; i < rows; i++) blocked.push(new Uint8Array(cols));
    const mark = (x, y, rad, val) => {
      const c0 = Math.floor(x / cell), r0 = Math.floor((y - topPad) / cell);
      for (let rr = r0 - 2; rr <= r0 + 2; rr++) for (let cc = c0 - 2; cc <= c0 + 2; cc++) {
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
        const px2 = (cc + .5) * cell, py2 = topPad + (rr + .5) * cell;
        if (Math.hypot(px2 - x, py2 - y) < rad) blocked[rr][cc] = Math.max(blocked[rr][cc], val);
      }
    };
    for (let i = 1; i < px.length; i++) {
      const a = px[i - 1], b = px[i], L = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(2, Math.ceil(L / (cell * .3)));
      for (let s = 0; s <= steps; s++) mark(lerp(a.x, b.x, s / steps), lerp(a.y, b.y, s / steps), cell * .82, 1);
    }
    return { rows, cols, px, cum, blocked, topPad, cell, total: cum[cum.length - 1], W, H };
  }

  /* ---------- декорации ---------- */
  const ROAD_KIT = ['cone', 'barrier', 'tirestack', 'signpost', 'brazier', 'lantern'];
  function makeProps(field, biome, rng) {
    const { rows, cols, blocked, cell, topPad } = field;
    const out = [];
    const density = biome.propDensity;
    const list = [];
    for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) if (!blocked[rr][cc]) list.push([cc, rr]);
    rng.shuffle(list);
    const n = Math.round(list.length * .24 * density);
    let lastT = '', lastT2 = '';
    const pickT = () => rng.chance(.24) ? rng.pick(ROAD_KIT) : rng.pick(biome.props);
    for (let i = 0; i < n && i < list.length; i++) {
      const [cc, rr] = list[i];
      let type = pickT(), guard = 0;
      while ((type === lastT || type === lastT2) && guard++ < 6) type = pickT();
      lastT2 = lastT; lastT = type;
      const p = {
        type, x: (cc + .5) * cell + rng.float(-cell * .18, cell * .18),
        y: topPad + (rr + .5) * cell + rng.float(-cell * .16, cell * .16),
        s: cell * rng.float(.4, .74), rot: rng.float(-.25, .25), seed: rng.next(),
        hue: rng.float(-14, 14), flip: rng.chance(.5) ? 1 : -1
      };
      /* источники «живого» света: игра подсветит их динамически, стабильно дёшево */
      if (type === 'brazier') p.glow = 'flame';
      else if (type === 'lantern') p.glow = 'lamp';
      else if (type === 'holo' || type === 'screen') p.glow = 'soft';
      out.push(p);
      blocked[rr][cc] = 2;
    }
    /* минимум «живого» света на уровень: иначе сцена выглядит мёртвой */
    let lights = 0;
    for (const p of out) if (p.glow) lights++;
    for (let i = 0; lights < 3 && i < out.length; i++) {
      const p = out[i];
      if (p.glow) continue;
      const t = rng.chance(.5) ? 'lantern' : 'brazier';
      p.type = t; p.glow = t === 'lantern' ? 'lamp' : 'flame';
      p.s = cell * rng.float(.54, .72); p.rot = 0; p.flip = 1;
      lights++;
    }
    return out;
  }

  /* ---------- рисование статичного фона (в offscreen) ---------- */
  function renderStatic(ctx, field, biome, level, W, H) {
    const { cell, rows, topPad, cols, px } = field;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, biome.skyTop); g.addColorStop(.32, biome.groundDark); g.addColorStop(1, biome.ground);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    /* мягкие пятна почвы */
    const rn = new RNG('soil|' + level);
    for (let i = 0; i < 34; i++) {
      const x = rn.float(0, W), y = rn.float(0, H), r = rn.float(cell * .7, cell * 2.6);
      const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
      const light = rn.chance(.5);
      gg.addColorStop(0, light ? hsl(biome.groundHue, 30, 40, .16) : 'rgba(0,0,0,0.16)');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    /* фактура стиля */
    ctx.save();
    if (biome.style === 'cracks' || biome.style === 'lava') {
      ctx.strokeStyle = biome.style === 'lava' ? hsl(biome.accentHue, 100, 55, .35) : 'rgba(0,0,0,0.28)';
      for (let i = 0; i < 26; i++) {
        let x = rn.float(0, W), y = rn.float(0, H);
        ctx.lineWidth = rn.float(.7, 2.2); ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) { x += rn.float(-cell, cell); y += rn.float(-cell, cell); ctx.lineTo(x, y); }
        ctx.stroke();
      }
    } else if (biome.style === 'tiles' || biome.style === 'grating') {
      ctx.strokeStyle = 'rgba(255,255,255,' + biome.gridAlpha + ')'; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += cell) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = topPad % cell; y < H; y += cell) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      if (biome.style === 'grating') {
        ctx.strokeStyle = 'rgba(0,0,0,0.16)';
        for (let x = 0; x < W; x += cell / 3) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 8, H); ctx.stroke(); }
      }
    } else if (biome.style === 'snow' || biome.style === 'sand') {
      for (let i = 0; i < 90; i++) {
        const x = rn.float(0, W), y = rn.float(0, H);
        ctx.fillStyle = rn.chance(.6) ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
        ctx.beginPath(); ctx.ellipse(x, y, rn.float(6, 26), rn.float(2, 7), rn.float(0, 3), 0, TAU); ctx.fill();
      }
    } else if (biome.style === 'puddles' || biome.style === 'wet' || biome.style === 'flooded') {
      for (let i = 0; i < 20; i++) {
        const x = rn.float(0, W), y = rn.float(0, H), r = rn.float(cell * .4, cell * 1.3);
        const gg = ctx.createRadialGradient(x, y - r * .3, 0, x, y, r);
        gg.addColorStop(0, hsl(biome.accentHue, 70, 60, .22)); gg.addColorStop(1, 'rgba(0,0,0,0.18)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(x, y, r, r * .5, 0, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();

    /* patches: пятна иного грунта/покрытия — уровень читается как место, а не текстура */
    groundPatches(ctx, field, biome, level, W, H);

    /* кривизна «перспективы» — затемнение сверху */
    const sky = ctx.createLinearGradient(0, 0, 0, topPad + cell * 2);
    sky.addColorStop(0, biome.skyTop); sky.addColorStop(.6, biome.fog); sky.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, topPad + cell * 2);

    /* === ДОРОГА === */
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const trace = () => { ctx.beginPath(); ctx.moveTo(px[0].x, px[0].y); for (let i = 1; i < px.length; i++) ctx.lineTo(px[i].x, px[i].y); };
    /* внешняя обводка */
    trace(); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = cell * 1.06; ctx.stroke();
    trace(); ctx.strokeStyle = biome.roadEdge; ctx.lineWidth = cell * .96; ctx.stroke();
    trace(); ctx.strokeStyle = biome.road; ctx.lineWidth = cell * .82; ctx.stroke();
    /* текстура полотна */
    ctx.save(); trace(); ctx.lineWidth = cell * .82; ctx.lineWidth = cell * .8;
    ctx.setLineDash([]);
    const rg = ctx.createLinearGradient(0, 0, 0, H);
    rg.addColorStop(0, 'rgba(255,255,255,0.06)'); rg.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.strokeStyle = rg; ctx.lineWidth = cell * .78; ctx.stroke();
    ctx.restore();
    /* разметка в зависимости от стиля */
    if (biome.laneStyle === 0) {
      trace(); ctx.setLineDash([cell * .34, cell * .32]); ctx.strokeStyle = hsl(50, 90, 62, .5); ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
    } else if (biome.laneStyle === 1) {
      trace(); ctx.setLineDash([cell * .1, cell * .16]); ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = cell * .7; ctx.stroke(); ctx.setLineDash([]);
    } else if (biome.laneStyle === 2) {
      trace(); ctx.strokeStyle = biome.roadGlow; ctx.lineWidth = 2; ctx.stroke();
      trace(); ctx.setLineDash([4, cell * .5]); ctx.strokeStyle = hsl(biome.accentHue, 100, 70, .8); ctx.lineWidth = cell * .16; ctx.stroke(); ctx.setLineDash([]);
    } else {
      trace(); ctx.strokeStyle = hsl(biome.accentHue, 60, 30, .55); ctx.lineWidth = cell * .3; ctx.stroke();
    }
    /* светящиеся жилы (особенность уровня) */
    if (biome.quirk === 'neon_veins' || biome.quirk === 'magnetic') {
      trace(); ctx.strokeStyle = hsl(biome.accentHue, 100, 60, .28); ctx.lineWidth = cell * 1.12;
      ctx.setLineDash([cell * .12, cell * .5]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (biome.quirk === 'warning_stripes') {
      ctx.save(); trace(); ctx.lineWidth = cell * .92; ctx.clip();
      for (let y = -H; y < H * 2; y += 26) {
        ctx.fillStyle = y % 52 ? 'rgba(255,196,0,0.09)' : 'rgba(0,0,0,0.12)';
        ctx.save(); ctx.translate(0, y); ctx.rotate(-.6); ctx.fillRect(-W, 0, W * 3, 13); ctx.restore();
      }
      ctx.restore();
    }
    if (biome.quirk === 'oil_stains' || biome.quirk === 'burnt') {
      for (let i = 0; i < 24; i++) {
        const t = rn.next(); let idx = 1; let acc = 0; const tot = field.cum[field.cum.length - 1] * t;
        while (field.cum[idx] < tot) idx++;
        const k = (tot - field.cum[idx - 1]) / (field.cum[idx] - field.cum[idx - 1] || 1);
        const x = lerp(px[idx - 1].x, px[idx].x, k), y = lerp(px[idx - 1].y, px[idx].y, k);
        const r = rn.float(cell * .3, cell * .7);
        const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
        gg.addColorStop(0, 'rgba(0,0,0,0.42)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();

    /* декор особенности уровня (кристаллы, заросли, подтопление, магнитные рельсы) */
    quirkDecor(ctx, field, biome, level, W, H);
    /* обочины: отбойники, столбики, знаки поворота, стрелки, полосы торможения */
    roadsideKit(ctx, field, biome, level, W, H);

    /* сетка строительства */
    ctx.save();
    ctx.strokeStyle = 'rgba(140,220,255,0.055)'; ctx.lineWidth = 1;
    for (let cc = 1; cc < cols; cc++) { ctx.beginPath(); ctx.moveTo(cc * cell, topPad); ctx.lineTo(cc * cell, topPad + rows * cell); ctx.stroke(); }
    for (let rr = 1; rr < rows; rr++) { ctx.beginPath(); ctx.moveTo(0, topPad + rr * cell); ctx.lineTo(W, topPad + rr * cell); ctx.stroke(); }
    /* доступные клетки — plate + угловые скобы: сразу видно, где можно строить */
    for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) if (!field.blocked[rr][cc]) {
      const x = cc * cell + 2, y = topPad + rr * cell + 2, w = cell - 4, h = cell - 4;
      ctx.fillStyle = 'rgba(120,220,255,0.028)';
      gfx.rr(ctx, x, y, w, h, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(150,225,255,0.14)'; ctx.lineWidth = 1.4;
      const L = Math.min(9, cell * .18);
      ctx.beginPath();
      ctx.moveTo(x + 1, y + L); ctx.lineTo(x + 1, y + 1); ctx.lineTo(x + L, y + 1);
      ctx.moveTo(x + w - L, y + h - 1); ctx.lineTo(x + w - 1, y + h - 1); ctx.lineTo(x + w - 1, y + h - L);
      ctx.stroke();
    }
    ctx.restore();

    /* ЛИНИЯ БАЗЫ (низ) */
    const by = topPad + rows * cell;
    ctx.save();
    const bg = ctx.createLinearGradient(0, by - cell * 1.6, 0, by + cell * .4);
    bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(6,10,16,0.95)');
    ctx.fillStyle = bg; ctx.fillRect(0, by - cell * 1.8, W, H - by + cell * 2);
    ctx.restore();

    /* === СВЕТОВОЙ БАЛАНС: тёмные биома приподнимаем «отражённым» светом,
       иначе на телефоне поле тонет и маршрут не читается === */
    const lumOf = s => { const m = /hsla?\([^,]+,[^,]+,\s*([\d.]+)%/.exec(s); return m ? parseFloat(m[1]) : 40; };
    const lift = clamp((32 - lumOf(biome.ground)) / 32, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    trace(); ctx.strokeStyle = hsl(biome.accentHue, 100, 60, .07 + lift * .06); ctx.lineWidth = cell * .9; ctx.stroke();
    if (lift > .02) {
      const lg = ctx.createRadialGradient(W * .5, H * .52, W * .05, W * .5, H * .52, W * 1.02);
      lg.addColorStop(0, hsl(biome.accentHue, 44, 44, .17 * lift));
      lg.addColorStop(.62, hsl(biome.accentHue, 40, 34, .07 * lift));
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    /* === КОНТРАСТ: виньетка + лёгкое затемнение, чтобы яркие биома не «выцветали» === */
    ctx.save();
    ctx.fillStyle = 'rgba(4,7,12,' + (0.15 - lift * .08) + ')'; ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W * .5, H * .42, W * .18, W * .5, H * .42, W * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(.62, 'rgba(0,0,0,0.1)');
    vg.addColorStop(1, 'rgba(2,4,8,' + (0.62 - lift * .18) + ')');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* ---------- пятна иного грунта: уровень читается как место, а не как текстура ---------- */
  function groundPatches(ctx, field, biome, level, W, H) {
    const rng = new RNG('patch|' + level);
    const cell = field.cell;
    const cols = [
      hsl(biome.groundHue, 24, 30, .16),
      'rgba(0,0,0,0.13)',
      hsl(biome.accent2Hue, 42, 44, .10),
      hsl(biome.groundHue + 18, 22, 62, .085)
    ];
    const jit = [];
    for (let i = 0; i < 14; i++) jit.push(rng.float(-.3, .3));
    for (let i = 0; i < 9; i++) {
      const x = rng.float(0, W), y = rng.float(field.topPad * .5, H), r = cell * rng.float(.9, 2.6);
      ctx.save(); ctx.translate(x, y); ctx.rotate(rng.float(0, TAU)); ctx.scale(1, rng.float(.5, .86));
      ctx.fillStyle = cols[i % cols.length];
      gfx.blob(ctx, r, 13, 1, jit); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
    }
    /* галька и трещины россыпью */
    for (let i = 0; i < 64; i++) {
      const x = rng.float(0, W), y = rng.float(field.topPad, H), r = rng.float(1, 3.4);
      ctx.fillStyle = rng.chance(.5) ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * .7, rng.float(0, 3), 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      let x = rng.float(0, W), y = rng.float(field.topPad, H);
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += rng.float(-26, 26); y += rng.float(4, 20); ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }

  /* ---------- декор особенности уровня ---------- */
  function quirkDecor(ctx, field, biome, level, W, H) {
    const q = biome.quirk;
    if (!q || q === 'neon_veins' || q === 'warning_stripes' || q === 'oil_stains') return;
    const rng = new RNG('quirk|' + level);
    const cell = field.cell, px = field.px, cum = field.cum;
    const total = cum[cum.length - 1];
    const pt = { x: 0, y: 0, a: 0 };
    /* точка в offset-пикселях от оси дороги (со знаком по нормали) */
    const at = (d, off) => {
      GD.pointAt(px, cum, clamp(d, 0, total), pt);
      return { x: pt.x + Math.cos(pt.a + Math.PI / 2) * off, y: pt.y + Math.sin(pt.a + Math.PI / 2) * off, a: pt.a };
    };
    if (q === 'crystal_growth') {
      /* кластеры кристаллов по обе стороны от дороги + подсветка земли */
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        const p = at(rng.float(0, total), rng.sign() * rng.float(cell * .6, cell * 1.7));
        const hue = biome.accent2Hue, s = cell * rng.float(.16, .34);
        GD.Glow.blit(ctx, 'soft', hsl(hue, 100, 60, .5), p.x, p.y - s * .4, s * 3.2);
        for (let k = 0; k < 5; k++) {
          const a = rng.float(-1.1, 1.1), h = s * rng.float(.7, 1.9), w = s * rng.float(.16, .3);
          const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y - h);
          g.addColorStop(0, hsl(hue, 60, 22, .95)); g.addColorStop(1, hsl(hue, 100, 78, .95));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(p.x - w + k * 3, p.y); ctx.lineTo(p.x + k * 3 + Math.sin(a) * h * .5, p.y - h); ctx.lineTo(p.x + w + k * 3, p.y);
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    } else if (q === 'overgrown') {
      /* мох по обочинам, лозы поперёк полотна, листовая подстилка */
      for (let i = 0; i < 26; i++) {
        const p = at(rng.float(0, total), rng.sign() * rng.float(cell * .5, cell * 1.9));
        const r = cell * rng.float(.25, .7);
        ctx.fillStyle = hsl(96 + rng.float(-14, 20), 42, rng.float(16, 26), .5);
        gfx.blob(ctx, r, 11, .35, null); ctx.fill();
      }
      ctx.lineCap = 'round';
      for (let i = 0; i < 18; i++) {
        const p = at(rng.float(0, total), 0), hue = 88 + rng.float(-10, 30);
        ctx.strokeStyle = hsl(hue, 52, rng.float(26, 40), .75); ctx.lineWidth = rng.float(2, 4.2);
        ctx.beginPath();
        let x = p.x - Math.cos(p.a + Math.PI / 2) * cell * .6, y = p.y - Math.sin(p.a + Math.PI / 2) * cell * .6;
        ctx.moveTo(x, y);
        for (let k = 1; k <= 4; k++) {
          const t = k / 4, off = cell * 1.2 * t;
          x = p.x - Math.cos(p.a + Math.PI / 2) * cell * .6 + Math.cos(p.a + Math.PI / 2) * off + rng.float(-6, 6);
          y = p.y - Math.sin(p.a + Math.PI / 2) * cell * .6 + Math.sin(p.a + Math.PI / 2) * off + rng.float(-4, 4);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        /* листья на лозе */
        ctx.fillStyle = hsl(hue + 8, 56, 34, .8);
        for (let k = 0; k < 4; k++) {
          ctx.beginPath(); ctx.ellipse(p.x + rng.float(-cell * .5, cell * .5), p.y + rng.float(-cell * .35, cell * .35), 3.4, 2, rng.float(0, 3), 0, TAU); ctx.fill();
        }
      }
    } else if (q === 'flooded') {
      /* зеркала стоячей воды с рябью и камышом */
      for (let i = 0; i < 11; i++) {
        const p = at(rng.float(0, total), rng.sign() * rng.float(0, cell * 1.5));
        const r = cell * rng.float(.6, 1.5);
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, .55);
        ctx.fillStyle = hsl(biome.accentHue + 190, 46, 22, .5);
        gfx.blob(ctx, r, 13, .22, null); ctx.fill();
        ctx.strokeStyle = 'rgba(220,245,255,0.22)'; ctx.lineWidth = 1.2;
        for (let k = 0; k < 4; k++) {
          const yy = rng.float(-r * .7, r * .7);
          ctx.beginPath(); ctx.moveTo(rng.float(-r * .6, -r * .1), yy); ctx.quadraticCurveTo(0, yy - 3, rng.float(r * .1, r * .6), yy); ctx.stroke();
        }
        ctx.restore();
        /* камыш по кромке */
        ctx.strokeStyle = hsl(70, 30, 32, .8); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        for (let k = 0; k < 5; k++) {
          const x = p.x + rng.float(-r * .5, r * .5), y = p.y + rng.float(-r * .2, r * .3), h = rng.float(8, 18);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + rng.float(-3, 3), y - h * .6, x + rng.float(-6, 6), y - h); ctx.stroke();
        }
      }
    } else if (q === 'magnetic') {
      /* рельсы-шини вдоль дороги, траверсы и катушки-электромагниты */
      const trace = (off, w, col) => {
        ctx.beginPath();
        for (let d = 0; d <= total; d += 14) {
          GD.pointAt(px, cum, d, pt);
          const nx = Math.cos(pt.a + Math.PI / 2) * off, ny = Math.sin(pt.a + Math.PI / 2) * off;
          if (d === 0) ctx.moveTo(pt.x + nx, pt.y + ny); else ctx.lineTo(pt.x + nx, pt.y + ny);
        }
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
      };
      ctx.save(); ctx.lineCap = 'round';
      trace(-cell * .3, 3, hsl(biome.accentHue, 20, 62, .75));
      trace(cell * .3, 3, hsl(biome.accentHue, 20, 62, .75));
      for (let d = cell * .3; d < total; d += cell * .34) {
        GD.pointAt(px, cum, d, pt);
        const nx = Math.cos(pt.a + Math.PI / 2) * cell * .34, ny = Math.sin(pt.a + Math.PI / 2) * cell * .34;
        ctx.strokeStyle = 'rgba(30,30,34,0.6)'; ctx.lineWidth = 4.5;
        ctx.beginPath(); ctx.moveTo(pt.x - nx, pt.y - ny); ctx.lineTo(pt.x + nx, pt.y + ny); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let d = cell; d < total; d += cell * 2.2) {
        const p = at(d, rng.sign() * cell * .58);
        GD.Glow.blit(ctx, 'soft', hsl(biome.accentHue, 100, 66, .5), p.x, p.y, cell * .5);
      }
      ctx.restore();
    } else if (q === 'burnt') {
      /* выжженные круги, сажа, обугленные пни */
      for (let i = 0; i < 7; i++) {
        const p = at(rng.float(0, total), rng.sign() * rng.float(0, cell * 1.6));
        const r = cell * rng.float(.7, 1.5);
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, .55);
        ctx.fillStyle = 'rgba(12,9,8,0.5)';
        gfx.blob(ctx, r, 13, .3, null); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (let k = 0; k < 7; k++) {
          const a = rng.float(0, TAU), L = r * rng.float(.9, 1.7);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * L, p.y + Math.sin(a) * L * .5); ctx.stroke();
        }
        /* пень */
        const x = p.x + rng.float(-r, r), y = p.y + rng.float(-r * .4, r * .4);
        ctx.fillStyle = '#1d1613';
        ctx.beginPath(); ctx.ellipse(x, y, 6, 4.4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2c2320';
        ctx.fillRect(x - 3.4, y - 9, 6.8, 9);
      }
    }
  }

  /* ---------- дорожный набор: обочины, столбики, отбойники, знаки, стрелки ---------- */
  function roadsideKit(ctx, field, biome, level, W, H) {
    const px = field.px, cum = field.cum, cell = field.cell;
    const total = cum[cum.length - 1];
    const rng = new RNG('road|' + level);
    const pt = { x: 0, y: 0, a: 0 };
    const half = cell * .47;
    const reflect = hsl(biome.accent2Hue, 100, 62);
    const at = (d, off) => {
      GD.pointAt(px, cum, clamp(d, 2, total - 2), pt);
      return { x: pt.x + Math.cos(pt.a + Math.PI / 2) * off, y: pt.y + Math.sin(pt.a + Math.PI / 2) * off, a: pt.a };
    };
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    /* 1) гравийная обочина — зернистая кромка по обеим сторонам полотна */
    for (let d = 0; d < total; d += 5) {
      for (const sgn of [-1, 1]) {
        const p = at(d, sgn * (half + rng.float(1, 9)));
        ctx.fillStyle = rng.chance(.5) ? 'rgba(0,0,0,0.16)' : 'rgba(255,250,235,0.05)';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, rng.float(1.4, 3), rng.float(1, 2.2), rng.float(0, 3), 0, TAU); ctx.fill();
      }
    }
    /* 2) бордюрный камень — короткие светлые плитки */
    for (let d = 0; d < total; d += 13) {
      for (const sgn of [-1, 1]) {
        const p = at(d, sgn * half);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.fillStyle = 'rgba(226,222,210,0.14)';
        ctx.fillRect(-6, -2.2, 10, 4.4);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(-6, 1.4, 10, 1.4);
        ctx.restore();
      }
    }
    /* 3) сигнальные столбики с отражателями (вразнобой по сторонам) */
    for (let d = cell * .8; d < total - cell * .3; d += cell * 1.25) {
      const sgn = (Math.round(d / cell) % 2 ? 1 : -1);
      const p = at(d, sgn * (half + 6));
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(p.x + 1.5, p.y + 2, 4, 1.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d9d6cd';
      ctx.fillRect(p.x - 1.5, p.y - 11, 3, 12);
      ctx.fillStyle = hsl(biome.accentHue, 60, 26);
      ctx.fillRect(p.x - 1.5, p.y - 11, 3, 3.4);
      ctx.fillStyle = reflect;
      ctx.fillRect(p.x - 1.1, p.y - 7.4, 2.2, 2.2);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(p.x - 1.1, p.y - 7.4, 1, 1);
    }
    /* 4) углы: тормозные полосы, отбойник снаружи, «ёлка» поворота */
    for (let i = 2; i < px.length - 2; i++) {
      const a1 = Math.atan2(px[i].y - px[i - 2].y, px[i].x - px[i - 2].x);
      const a2 = Math.atan2(px[i + 2].y - px[i].y, px[i + 2].x - px[i].x);
      let da = a2 - a1;
      while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      if (Math.abs(da) < .5) continue;
      const d = cum[i], out = Math.sign(da) * -1;
      /* следы торможения перед поворотом */
      for (const sgn of [-1, 1]) {
        ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = cell * .09;
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) {
          const dd = d - cell * (1.5 - k * .24), p = at(dd, sgn * cell * .18 + out * cell * .06);
          if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      /* отбойник по внешней стороне дуги */
      for (let k = -3; k <= 3; k++) {
        const p = at(d + k * 12, out * (half + 5));
        const q = at(d + (k + 1) * 12, out * (half + 5));
        ctx.strokeStyle = '#b9bcc0'; ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 1.2); ctx.lineTo(q.x, q.y - 1.2); ctx.stroke();
        if (k % 2 === 0) {
          ctx.strokeStyle = 'rgba(20,20,22,0.7)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + 5); ctx.stroke();
        }
      }
      /* знак поворота: щит с шевронами, повёрнутый по биссектрисе */
      const p = at(d, out * (half + cell * .34));
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a + Math.PI / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(1.5, 12, 8, 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b2b30'; ctx.fillRect(-1.2, 0, 2.4, 12);
      gfx.rr(ctx, -10, -14, 20, 15, 2.5); ctx.fill();
      ctx.fillStyle = hsl(48, 92, 55); ctx.fillRect(-8.6, -12.6, 17.2, 12.2);
      ctx.fillStyle = '#1c1c20';
      for (let k = 0; k < 3; k++) {
        const y = -10.6 + k * 3.9;
        ctx.beginPath(); ctx.moveTo(-6, y); ctx.lineTo(0, y + 1.7); ctx.lineTo(6, y); ctx.lineTo(6, y + 1.9); ctx.lineTo(0, y + 3.6); ctx.lineTo(-6, y + 1.9);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    /* 5) стрелки направления движения на полотне — читаемость маршрута */
    for (let d = cell * 1.1; d < total - cell * .4; d += cell * 1.5) {
      const p = at(d, 0);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a + Math.PI / 2);
      ctx.fillStyle = biome.laneStyle === 2 ? hsl(biome.accentHue, 100, 70, .3) : 'rgba(255,255,255,0.17)';
      ctx.beginPath();
      ctx.moveTo(0, 9); ctx.lineTo(-7, -1); ctx.lineTo(-2.6, -1); ctx.lineTo(-2.6, -9); ctx.lineTo(2.6, -9); ctx.lineTo(2.6, -1); ctx.lineTo(7, -1);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    /* 6) решётки ливнёвки и люки */
    for (let i = 0; i < 3; i++) {
      const p = at(rng.float(0, total), rng.sign() * cell * .28);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = 'rgba(18,18,20,0.62)';
      gfx.rr(ctx, -9, -6, 18, 12, 2); ctx.fill();
      ctx.strokeStyle = 'rgba(200,200,205,0.22)'; ctx.lineWidth = 1.1;
      for (let k = -6; k <= 6; k += 3) { ctx.beginPath(); ctx.moveTo(k, -5); ctx.lineTo(k, 5); ctx.stroke(); }
      ctx.restore();
    }
    /* 7) километровые столбики у обочины */
    for (let d = cell * 2; d < total - cell; d += cell * 3.2) {
      const p = at(d, -(half + 12));
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(p.x + 1, p.y + 1.5, 3.6, 1.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#efece2'; ctx.fillRect(p.x - 2, p.y - 12, 4, 13);
      ctx.fillStyle = hsl(biome.accentHue, 55, 22); ctx.fillRect(p.x - 2, p.y - 12, 4, 4);
    }
    /* 8) трафарет с кодом уровня на асфальте */
    const code = typeof biome.code === 'string' ? biome.code : '';
    if (code) {
      const p = at(total * rng.float(.35, .6), 0);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a + Math.PI / 2);
      ctx.font = 'bold ' + Math.round(cell * .3) + 'px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillText(code, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------- пропсы (статичные объекты) ---------- */
  function drawProp(c, p, biome, t) {
    const s = p.s, col = biome.accentHue;
    c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.scale(p.flip, 1);
    const dark = 'rgba(0,0,0,0.35)';
    c.fillStyle = dark; c.beginPath(); c.ellipse(0, s * .16, s * .92, s * .3, 0, 0, TAU); c.fill();
    const M = (a, b, k) => { const g = c.createLinearGradient(-s, -s, s, s); g.addColorStop(0, a); g.addColorStop(1, b); c.fillStyle = g; };
    switch (p.type) {
      case 'ruin': case 'concrete': case 'rubble':
        M('#6a6660', '#312f2c'); c.beginPath();
        c.moveTo(-s * .8, s * .1); c.lineTo(-s * .55, -s * .9); c.lineTo(-s * .1, -s * .6); c.lineTo(s * .3, -s * .95); c.lineTo(s * .7, s * .05); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1.2; c.stroke();
        c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(-s * .4, -s * .5, s * .18, s * .3); c.fillRect(0, -s * .35, s * .16, s * .25);
        if (p.type === 'ruin') { c.strokeStyle = '#8a6a3a'; c.lineWidth = 1.4; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-s * .4 + i * s * .3, -s * .8); c.lineTo(-s * .35 + i * s * .3, -s * 1.3); c.stroke(); } }
        break;
      case 'barrel':
        for (let i = 0; i < 2 + (p.seed > .6 ? 1 : 0); i++) {
          const ox = (i - .5) * s * .6, oy = -Math.abs(Math.sin(i * 3 + p.seed * 9)) * s * .1;
          M('#8a5a2a', '#3d2a12'); gfx.rr(c, ox - s * .22, oy - s * .62, s * .44, s * .78, s * .1); c.fill();
          c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.stroke();
          c.fillStyle = 'rgba(255,190,60,.55)'; c.fillRect(ox - s * .22, oy - s * .34, s * .44, 2);
        }
        break;
      case 'wreck':
        M('#5c5f62', '#26292b'); gfx.rr(c, -s * .85, -s * .5, s * 1.7, s * .62, s * .12); c.fill();
        c.fillStyle = '#2f3234'; gfx.rr(c, -s * .35, -s * .9, s * .8, s * .5, s * .1); c.fill();
        c.fillStyle = '#15171a'; for (const ox of [-s * .5, s * .5]) { c.beginPath(); c.ellipse(ox, s * .12, s * .22, s * .13, 0, 0, TAU); c.fill(); }
        c.fillStyle = 'rgba(255,120,40,.35)'; c.beginPath(); c.arc(s * .7, -s * .55, s * .2, 0, TAU); c.fill();
        break;
      case 'rebar':
        c.strokeStyle = '#7a6a52'; c.lineWidth = 2;
        for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-s * .5 + i * s * .25, s * .1); c.quadraticCurveTo(-s * .5 + i * s * .3, -s * .7, -s * .3 + i * s * .32, -s * 1.1); c.stroke(); }
        break;
      case 'crate':
        M('#7a6338', '#3c3018'); c.fillRect(-s * .5, -s * .8, s, s * .9);
        c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1.4; c.strokeRect(-s * .5, -s * .8, s, s * .9);
        c.beginPath(); c.moveTo(-s * .5, -s * .8); c.lineTo(s * .5, s * .1); c.moveTo(s * .5, -s * .8); c.lineTo(-s * .5, s * .1); c.stroke();
        c.fillStyle = hsl(col, 90, 60, .8); c.fillRect(-s * .18, -s * .62, s * .36, s * .12);
        break;
      case 'building':
        M('#3f4658', '#171b26'); c.fillRect(-s * .6, -s * 2.1, s * 1.2, s * 2.2);
        c.fillStyle = 'rgba(0,0,0,.4)'; for (let y = 0; y < 7; y++) for (let x = 0; x < 3; x++) {
          c.fillStyle = ((x * 7 + y * 13 + p.seed * 100) % 9 < 3) ? hsl(col, 90, 62, .75) : 'rgba(0,0,0,.45)';
          c.fillRect(-s * .48 + x * s * .36, -s * 1.95 + y * s * .27, s * .22, s * .16);
        }
        break;
      case 'streetlight': case 'pylon': case 'antenna':
        c.strokeStyle = '#5a6169'; c.lineWidth = s * .09;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -s * 1.7); c.stroke();
        c.strokeStyle = hsl(col, 40, 45, .8); c.lineWidth = s * .05;
        c.beginPath(); c.moveTo(0, -s * 1.65); c.lineTo(s * .55, -s * 1.5); c.stroke();
        c.fillStyle = hsl(col, 100, 70, .9); c.beginPath(); c.arc(s * .55, -s * 1.48, s * .1, 0, TAU); c.fill();
        c.fillStyle = hsl(col, 100, 65, .1); c.beginPath(); c.arc(s * .55, -s * 1.32, s * .34, 0, TAU); c.fill();
        if (p.type !== 'streetlight') { c.strokeStyle = '#6a7078'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-s * .4, -s * 1.2); c.lineTo(s * .4, -s * 1.2); c.stroke(); }
        break;
      case 'holo':
        c.fillStyle = hsl(col, 100, 60, .12); c.fillRect(-s * .5, -s * 1.5, s, s * 1.5);
        c.strokeStyle = hsl(col, 100, 70, .7); c.lineWidth = 1; c.strokeRect(-s * .5, -s * 1.5, s, s * 1.5);
        for (let i = 0; i < 4; i++) { c.fillStyle = hsl(col, 100, 70, .35); c.fillRect(-s * .4, -s * 1.35 + i * s * .3, s * (.3 + (i % 3) * .2), s * .08); }
        break;
      case 'bin': case 'transformer':
        M('#4d5a4a', '#232a22'); gfx.rr(c, -s * .4, -s * .8, s * .8, s * .9, s * .1); c.fill();
        c.fillStyle = 'rgba(255,220,60,.5)'; c.fillRect(-s * .3, -s * .7, s * .6, s * .08);
        break;
      case 'icepike': case 'rockbig': case 'rock':
        M('#cfe4f2', '#5d7488'); c.globalAlpha = p.type === 'icepike' ? .85 : 1;
        c.beginPath(); c.moveTo(-s * .6, s * .1);
        for (let i = 0; i < 4; i++) { const a = -Math.PI + i / 3 * Math.PI; c.lineTo(Math.cos(a) * s * (.5 + p.seed * .2), -Math.abs(Math.sin(a)) * s * (p.type === 'icepike' ? 1.7 : .8) - s * .05); }
        c.lineTo(s * .6, s * .1); c.closePath(); c.fill();
        c.globalAlpha = 1; c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; c.stroke();
        break;
      case 'frozen': case 'skull': case 'bone':
        c.fillStyle = '#d9d3c4'; c.beginPath(); c.ellipse(0, -s * .3, s * .3, s * .35, 0, 0, TAU); c.fill();
        c.fillStyle = '#22201d'; c.beginPath(); c.arc(-s * .1, -s * .34, s * .07, 0, TAU); c.arc(s * .1, -s * .34, s * .07, 0, TAU); c.fill();
        c.fillStyle = '#d9d3c4'; c.fillRect(-s * .12, -s * .06, s * .24, s * .1);
        break;
      case 'tree': case 'stump': case 'palm':
        c.strokeStyle = '#3f3428'; c.lineWidth = s * .13;
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(s * .12, -s * .7, -s * .05, -s * 1.35); c.stroke();
        c.lineWidth = s * .05;
        for (let i = 0; i < 4; i++) { const a = -2.4 + i * .55; c.beginPath(); c.moveTo(-s * .02, -s * (0.8 + i * .14)); c.lineTo(Math.cos(a) * s * .7, -s * (1.05 + i * .16) + Math.sin(a) * s * .2); c.stroke(); }
        break;
      case 'mushroom':
        c.fillStyle = '#c9c2b0'; c.fillRect(-s * .07, -s * .7, s * .14, s * .75);
        const mg = c.createRadialGradient(0, -s * .8, 0, 0, -s * .8, s * .5);
        mg.addColorStop(0, hsl(col + 40, 90, 70, .95)); mg.addColorStop(1, hsl(col, 70, 32, .9));
        c.fillStyle = mg; c.beginPath(); c.ellipse(0, -s * .78, s * .42, s * .3, 0, Math.PI, TAU); c.fill();
        break;
      case 'tank': /* цилистерны */
        for (let i = 0; i < 2; i++) {
          const ox = (i - .5) * s * .78;
          M('#767f88', '#262c31'); gfx.rr(c, ox - s * .32, -s * 1.15, s * .64, s * 1.2, s * .3); c.fill();
          c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1.1; c.stroke();
          c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(ox - s * .32, -s * .82, s * .64, 2); c.fillRect(ox - s * .32, -s * .35, s * .64, 2);
          c.fillStyle = hsl(col, 90, 60, .7); c.beginPath(); c.arc(ox, -s * 1.16, s * .1, 0, TAU); c.fill();
        }
        break;
      case 'container':
        M('#5d6b6a', '#1f2626'); c.fillRect(-s * .9, -s * .92, s * 1.8, s * .98);
        c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1.2; c.strokeRect(-s * .9, -s * .92, s * 1.8, s * .98);
        c.fillStyle = 'rgba(0,0,0,.22)';
        for (let i = 0; i < 8; i++) c.fillRect(-s * .84 + i * s * .22, -s * .88, s * .07, s * .9);
        c.fillStyle = hsl(col, 85, 58, .8); c.fillRect(-s * .86, -s * .95, s * 1.72, s * .09);
        c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(-s * .9, -s * .92, s * 1.8, s * .12);
        break;
      case 'machine':
        M('#5a6068', '#22262b'); gfx.rr(c, -s * .6, -s * 1.0, s * 1.2, s * 1.06, s * .08); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1.2; c.stroke();
        c.strokeStyle = '#7d868f'; c.lineWidth = s * .1; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-s * .6, -s * .78); c.lineTo(-s * 1.0, -s * .78); c.lineTo(-s * 1.0, -s * .2); c.stroke();
        c.fillStyle = '#2b3035'; c.beginPath(); c.arc(s * .18, -s * .5, s * .27, 0, TAU); c.fill();
        c.fillStyle = '#79838c';
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + p.seed; c.fillRect(s * .18 + Math.cos(a) * s * .22 - s * .04, -s * .5 + Math.sin(a) * s * .22 - s * .04, s * .08, s * .08); }
        c.fillStyle = hsl(col, 95, 62, .9); c.beginPath(); c.arc(-s * .34, -s * .88, s * .07, 0, TAU); c.fill();
        break;
      case 'vent':
        M('#4a5158', '#1c2126'); gfx.rr(c, -s * .48, -s * .92, s * .96, s * .96, s * .1); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 1.2; c.stroke();
        c.fillStyle = '#12171b'; c.beginPath(); c.arc(0, -s * .45, s * .34, 0, TAU); c.fill();
        c.fillStyle = '#6d777f';
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + p.seed; c.save(); c.translate(0, -s * .45); c.rotate(a); c.fillRect(0, -s * .05, s * .3, s * .1); c.restore(); }
        c.fillStyle = hsl(col, 90, 62, .6); c.beginPath(); c.arc(0, -s * .45, s * .08, 0, TAU); c.fill();
        break;
      case 'tanklab': /* колба с реагентом */
        c.fillStyle = '#2a3138'; gfx.rr(c, -s * .34, -s * .16, s * .68, s * .2, s * .06); c.fill();
        const lg = c.createLinearGradient(0, -s * 1.5, 0, 0);
        lg.addColorStop(0, hsl(col + 120, 90, 62, .28)); lg.addColorStop(1, hsl(col + 120, 95, 46, .8));
        c.fillStyle = lg; gfx.rr(c, -s * .3, -s * 1.45, s * .6, s * 1.4, s * .28); c.fill();
        c.strokeStyle = 'rgba(230,250,255,.5)'; c.lineWidth = 1.4; c.stroke();
        c.fillStyle = 'rgba(255,255,255,.5)';
        for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(-s * .12 + (i % 2) * s * .2, -s * (0.3 + i * .3), s * .05, 0, TAU); c.fill(); }
        c.fillStyle = '#3b444c'; gfx.rr(c, -s * .36, -s * 1.56, s * .72, s * .16, s * .06); c.fill();
        c.fillStyle = hsl(col + 120, 100, 70, .16); c.beginPath(); c.arc(0, -s * .8, s * .72, 0, TAU); c.fill();
        break;
      case 'screen':
        c.fillStyle = '#22282e'; c.fillRect(-s * .07, -s * .6, s * .14, s * .66);
        M('#3a424a', '#141a1f'); gfx.rr(c, -s * .56, -s * 1.5, s * 1.12, s * .95, s * .08); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1.2; c.stroke();
        c.fillStyle = hsl(col, 95, 55, .85); gfx.rr(c, -s * .46, -s * 1.4, s * .92, s * .76, s * .04); c.fill();
        c.fillStyle = 'rgba(0,0,0,.35)';
        for (let i = 0; i < 6; i++) c.fillRect(-s * .46, -s * 1.4 + i * s * .13, s * .92, s * .05);
        c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(-s * .4, -s * 1.32, s * .5, s * .06);
        c.fillStyle = hsl(col, 100, 65, .14); c.beginPath(); c.arc(0, -s * 1.0, s * .9, 0, TAU); c.fill();
        break;
      case 'pillar':
        M('#6e767e', '#2a3036'); gfx.rr(c, -s * .26, -s * 1.7, s * .52, s * 1.75, s * .06); c.fill();
        c.fillStyle = '#3d444a'; gfx.rr(c, -s * .38, -s * 1.84, s * .76, s * .18, s * .05); c.fill();
        gfx.rr(c, -s * .34, -s * .12, s * .68, s * .18, s * .05); c.fill();
        c.fillStyle = hsl(col, 90, 62, .5); c.fillRect(-s * .26, -s * 1.2, s * .52, s * .07);
        break;
      case 'support':
        c.strokeStyle = '#5d666e'; c.lineWidth = s * .12; c.lineCap = 'square';
        c.beginPath(); c.moveTo(-s * .34, s * .05); c.lineTo(-s * .2, -s * 1.5); c.lineTo(s * .2, -s * 1.5); c.lineTo(s * .34, s * .05); c.stroke();
        c.lineWidth = s * .06;
        c.beginPath(); c.moveTo(-s * .3, -s * .4); c.lineTo(s * .3, -s * .4); c.moveTo(-s * .26, -s * 1.0); c.lineTo(s * .26, -s * 1.0);
        c.moveTo(-s * .3, -s * .4); c.lineTo(s * .26, -s * 1.0); c.moveTo(s * .3, -s * .4); c.lineTo(-s * .26, -s * 1.0); c.stroke();
        c.fillStyle = hsl(col, 95, 62, .85); c.beginPath(); c.arc(0, -s * 1.56, s * .09, 0, TAU); c.fill();
        break;
      case 'robot_arm':
        c.fillStyle = '#2f363c'; c.beginPath(); c.ellipse(0, 0, s * .3, s * .14, 0, 0, TAU); c.fill();
        c.strokeStyle = '#6d767e'; c.lineWidth = s * .16; c.lineCap = 'round';
        c.beginPath(); c.moveTo(0, -s * .05); c.lineTo(s * .3, -s * .9); c.lineTo(-s * .1, -s * 1.5); c.stroke();
        c.strokeStyle = hsl(col, 80, 55, .6); c.lineWidth = s * .05;
        c.beginPath(); c.moveTo(0, -s * .05); c.lineTo(s * .3, -s * .9); c.lineTo(-s * .1, -s * 1.5); c.stroke();
        c.fillStyle = '#8d959c'; gfx.rr(c, -s * .28, -s * 1.68, s * .36, s * .22, s * .05); c.fill();
        break;
      case 'pipe':
        c.fillStyle = '#454d56'; c.fillRect(-s * 1.0, -s * .16, s * .18, s * .2); c.fillRect(s * .82, -s * .16, s * .18, s * .2);
        c.strokeStyle = '#39414a'; c.lineWidth = s * .3; c.lineCap = 'butt';
        c.beginPath(); c.moveTo(-s * .95, -s * .14); c.quadraticCurveTo(0, -s * .82, s * .95, -s * .14); c.stroke();
        c.strokeStyle = '#6b747e'; c.lineWidth = s * .18;
        c.beginPath(); c.moveTo(-s * .95, -s * .16); c.quadraticCurveTo(0, -s * .84, s * .95, -s * .16); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.2)'; c.lineWidth = s * .045;
        c.beginPath(); c.moveTo(-s * .9, -s * .26); c.quadraticCurveTo(0, -s * .94, s * .9, -s * .26); c.stroke();
        c.fillStyle = 'rgba(0,0,0,.4)';
        for (let i = -1; i <= 1; i++) { const ox = i * s * .45, oy = -s * (.14 + .62 * (1 - (i * i) * .5)); c.fillRect(ox - s * .035, oy - s * .02, s * .07, s * .2); }
        break;
      case 'cable':
        c.strokeStyle = '#5c646c'; c.lineWidth = s * .07;
        c.beginPath(); c.moveTo(-s * .8, s * .04); c.lineTo(-s * .8, -s * 1.1); c.moveTo(s * .8, s * .04); c.lineTo(s * .8, -s * 1.1); c.stroke();
        c.strokeStyle = '#2f353b'; c.lineWidth = s * .06;
        c.beginPath(); c.moveTo(-s * .8, -s * 1.05); c.quadraticCurveTo(0, -s * .42, s * .8, -s * 1.05); c.stroke();
        c.fillStyle = hsl(col, 95, 62, .8); c.beginPath(); c.arc(-s * .8, -s * 1.14, s * .07, 0, TAU); c.arc(s * .8, -s * 1.14, s * .07, 0, TAU); c.fill();
        break;
      case 'chain':
        c.strokeStyle = '#6a6f76'; c.lineWidth = s * .08;
        for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(0, -i * s * .28, s * .12, s * .18, 0, 0, TAU); c.stroke(); }
        break;
      case 'fence':
        c.strokeStyle = '#5f6650'; c.lineWidth = s * .07;
        for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * s * .3, s * .05); c.lineTo(i * s * .3, -s * .75); c.stroke(); }
        c.beginPath(); c.moveTo(-s * .7, -s * .5); c.lineTo(s * .7, -s * .55); c.stroke();
        break;
      case 'obsidian':
        M('#2c2024', '#0f0b0d');
        c.beginPath(); c.moveTo(-s * .5, s * .1); c.lineTo(-s * .25, -s * 1.2); c.lineTo(s * .1, -s * 1.45); c.lineTo(s * .4, s * .05); c.closePath(); c.fill();
        c.strokeStyle = hsl(20, 100, 50, .45); c.lineWidth = 1; c.stroke();
        break;
      case 'cone':
        c.fillStyle = 'rgba(20,18,16,0.5)';
        c.beginPath(); c.ellipse(0, s * .06, s * .5, s * .17, 0, 0, TAU); c.fill();
        M('#ff9433', '#b8480d');
        c.beginPath(); c.moveTo(-s * .34, 0); c.lineTo(0, -s * .98); c.lineTo(s * .34, 0); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(-s * .23, -s * .52, s * .46, s * .15);
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(s * .1, -s * .6, s * .07, s * .58);
        break;
      case 'barrier':
        M('#cbc7bd', '#77746d');
        gfx.rr(c, -s * .74, -s * .36, s * 1.48, s * .66, s * .08); c.fill();
        c.save();
        c.beginPath(); gfx.rr(c, -s * .74, -s * .36, s * 1.48, s * .3, s * .08); c.clip();
        for (let i = -4; i < 5; i++) {
          c.fillStyle = (i & 1) ? '#1e1e22' : '#e8c341';
          c.save(); c.translate(i * s * .3, 0); c.rotate(-.52); c.fillRect(-s * .11, -s * .6, s * .22, s * 1.4); c.restore();
        }
        c.restore();
        c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1; c.stroke();
        break;
      case 'tirestack':
        for (let i = 0; i < 3; i++) {
          const yy = -i * s * .3, w = s * (.52 - i * .05);
          c.fillStyle = i % 2 ? '#232326' : '#191a1d';
          c.beginPath(); c.ellipse(0, yy, w, s * .18, 0, 0, TAU); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.07)';
          c.beginPath(); c.ellipse(0, yy - s * .05, w * .96, s * .07, 0, 0, TAU); c.fill();
        }
        c.fillStyle = 'rgba(0,0,0,0.5)';
        c.beginPath(); c.ellipse(0, -s * .62, s * .2, s * .07, 0, 0, TAU); c.fill();
        break;
      case 'signpost':
        c.fillStyle = 'rgba(0,0,0,0.4)';
        c.beginPath(); c.ellipse(1, 2, s * .3, s * .11, 0, 0, TAU); c.fill();
        c.fillStyle = '#8b8f95'; c.fillRect(-s * .05, -s * .8, s * .1, s * .82);
        c.save(); c.translate(0, -s * 1.02);
        c.fillStyle = '#e8e4d8';
        c.beginPath(); c.moveTo(0, -s * .46); c.lineTo(s * .42, s * .28); c.lineTo(-s * .42, s * .28); c.closePath(); c.fill();
        c.strokeStyle = '#c8202a'; c.lineWidth = s * .09; c.stroke();
        c.fillStyle = '#26262a';
        c.beginPath(); c.arc(0, s * .02, s * .11, 0, TAU); c.fill();
        c.fillRect(-s * .03, -s * .3, s * .06, s * .18);
        c.restore();
        break;
      case 'brazier':
        c.fillStyle = '#3a3630';
        c.beginPath(); c.moveTo(-s * .3, -s * .2); c.lineTo(s * .3, -s * .2); c.lineTo(s * .18, s * .28); c.lineTo(-s * .18, s * .28); c.closePath(); c.fill();
        c.fillStyle = '#232019'; c.fillRect(-s * .07, s * .2, s * .14, s * .34);
        c.fillStyle = '#59534a'; c.fillRect(-s * .34, -s * .28, s * .68, s * .12);
        c.save(); c.globalCompositeOperation = 'lighter';
        GD.Glow.blit(c, 'flame', 'rgba(255,140,40,0.9)', 0, -s * .42, s * .5);
        c.fillStyle = 'rgba(255,230,160,0.9)';
        c.beginPath(); c.ellipse(0, -s * .4, s * .12, s * .22, 0, 0, TAU); c.fill();
        c.restore();
        break;
      case 'lantern':
        c.fillStyle = 'rgba(0,0,0,0.4)';
        c.beginPath(); c.ellipse(1.5, 2, s * .22, s * .08, 0, 0, TAU); c.fill();
        c.fillStyle = '#4a4d52'; c.fillRect(-s * .055, -s * 1.15, s * .11, s * 1.18);
        c.fillStyle = '#5d6167'; c.fillRect(-s * .055, -s * 1.15, s * .04, s * 1.18);
        c.fillStyle = '#33363b';
        gfx.rr(c, -s * .2, -s * 1.34, s * .4, s * .22, s * .05); c.fill();
        c.save(); c.globalCompositeOperation = 'lighter';
        GD.Glow.blit(c, 'soft', hsl(42, 100, 66, .95), 0, -s * 1.2, s * .55);
        c.restore();
        break;
      default:
        M('#5a5f66', '#2a2e33'); c.beginPath(); c.arc(0, -s * .35, s * .42, 0, TAU); c.fill();
    }
    c.restore();
  }

  /* ---------- погода ---------- */
  class Weather {
    constructor(biome, W, H, rng) {
      this.type = biome.weather; this.W = W; this.H = H;
      this.n = biome.weatherCount;
      this.items = [];
      for (let i = 0; i < this.n; i++) this.items.push(this.mk(rng, true));
      this.rng = rng; this.t = 0;
    }
    mk(rng, any) {
      const T = this.type, W = this.W, H = this.H;
      const o = { x: rng.float(0, W), y: any ? rng.float(0, H) : -10, vy: 0, vx: 0, s: 1, a: 1, ph: rng.float(0, 10) };
      switch (T) {
        case 'rain': o.vy = rng.float(760, 1150); o.vx = rng.float(-90, -40); o.len = rng.float(9, 20); break;
        case 'snow': o.vy = rng.float(24, 60); o.vx = rng.float(-14, 14); o.s = rng.float(1.2, 3.2); break;
        case 'ash': o.vy = rng.float(22, 54); o.vx = rng.float(-18, 8); o.s = rng.float(.9, 2.4); break;
        case 'ember': o.vy = -rng.float(28, 74); o.vx = rng.float(-22, 22); o.s = rng.float(.9, 2.4); o.y = any ? rng.float(0, H) : H + 8; break;
        case 'spores': o.vy = -rng.float(12, 30); o.vx = rng.float(-16, 16); o.s = rng.float(1.2, 3); o.y = any ? rng.float(0, H) : H + 8; break;
        case 'sand': o.vy = rng.float(20, 46); o.vx = rng.float(120, 260); o.s = rng.float(4, 14); break;
        case 'spark': o.vy = rng.float(60, 160); o.vx = rng.float(-40, 40); o.s = rng.float(.8, 1.8); break;
        case 'drip': o.vy = rng.float(300, 620); o.s = rng.float(3, 8); break;
        case 'dust': o.vy = rng.float(8, 22); o.vx = rng.float(-24, 24); o.s = rng.float(1, 3); break;
        case 'scan': o.s = rng.float(.4, 1.2); break;
      }
      return o;
    }
    update(dt) {
      this.t += dt;
      const T = this.type;
      /* количество осадков зависит от детализации — на телефоне меньше заполнителей */
      const n = Math.max(6, Math.round(this.items.length * (GD.q == null ? 1 : clamp(GD.q * 1.15, .3, 1))));
      this.n = n;
      for (let i = 0; i < n; i++) {
        const o = this.items[i];
        o.x += o.vx * dt; o.y += o.vy * dt; o.ph += dt;
        if (T === 'snow' || T === 'ash' || T === 'dust' || T === 'spores') o.x += Math.sin(o.ph * 1.6) * 12 * dt;
        if (o.y > this.H + 12 || o.y < -12 || o.x < -20 || o.x > this.W + 20) Object.assign(o, this.mk(this.rng, false));
      }
      /* редкая молния под дождём — только на высоком качестве */
      if ((T === 'rain' || T === 'spark') && (GD.q || 1) > .8) {
        this.bolt = (this.bolt || 0) - dt;
        if (this.bolt <= 0) {
          this.bolt = this.rng.float(7, 19);
          if (this.rng.chance(.6)) { GD.FX.flash('rgba(190,215,255,0.22)', .16); if (GD.Audio && GD.Audio.SFX) GD.Audio.SFX.thunder && GD.Audio.SFX.thunder(0); }
        }
      }
    }
    draw(c, biome) {
      const T = this.type;
      const n = this.n || this.items.length;
      c.save();
      if (T === 'rain') {
        c.strokeStyle = 'rgba(180,215,255,0.42)'; c.lineWidth = 1.1;
        c.beginPath(); for (let i = 0; i < n; i++) { const o = this.items[i]; c.moveTo(o.x, o.y); c.lineTo(o.x + o.vx * .012, o.y - o.len); } c.stroke();
        /* блики мокрых пятен там, где капли «приземляются» */
        if ((GD.q || 1) > .6) {
          c.strokeStyle = 'rgba(200,225,255,0.14)'; c.lineWidth = 1;
          c.beginPath();
          for (let i = 0; i < n; i += 5) { const o = this.items[i]; const k = (o.ph * 2.4) % 1; c.moveTo(o.x - 3 * k, o.y + 6); c.lineTo(o.x + 3 * k, o.y + 6); }
          c.stroke();
        }
      } else if (T === 'snow') {
        for (let i = 0; i < n; i++) {
          const o = this.items[i];
          c.globalAlpha = .4 + (o.s - 1.2) * .22;
          c.fillStyle = i % 3 ? 'rgba(255,255,255,0.85)' : 'rgba(205,228,255,0.8)';
          c.beginPath(); c.arc(o.x, o.y, o.s, 0, TAU); c.fill();
        }
      } else if (T === 'ash' || T === 'dust') {
        c.fillStyle = T === 'ash' ? 'rgba(190,180,170,0.55)' : 'rgba(220,190,150,0.4)';
        for (let i = 0; i < n; i++) { const o = this.items[i]; c.beginPath(); c.arc(o.x, o.y, o.s, 0, TAU); c.fill(); }
      } else if (T === 'ember') {
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < n; i++) {
          const o = this.items[i];
          GD.Glow.blit(c, 'flame', 'rgba(255,150,60,0.85)', o.x, o.y, o.s * 4, .9);
        }
      } else if (T === 'spores') {
        c.globalCompositeOperation = 'lighter';
        const col = hsl(biome.accentHue + 30, 100, 70, .5);
        for (let i = 0; i < n; i++) {
          const o = this.items[i];
          if (i % 3 === 0 && (GD.q || 1) > .6) GD.Glow.blit(c, 'soft', col, o.x, o.y, o.s * 4.5, .55);
          else { c.globalAlpha = .55; c.fillStyle = col; c.beginPath(); c.arc(o.x, o.y, o.s, 0, TAU); c.fill(); }
        }
      } else if (T === 'sand') {
        c.fillStyle = 'rgba(230,200,150,0.16)';
        for (let i = 0; i < n; i++) { const o = this.items[i]; c.beginPath(); c.ellipse(o.x, o.y, o.s * 2.4, o.s * .5, 0, 0, TAU); c.fill(); }
      } else if (T === 'spark') {
        c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(255,220,120,0.7)'; c.lineWidth = 1.2;
        c.beginPath(); for (let i = 0; i < n; i++) { const o = this.items[i]; c.moveTo(o.x, o.y); c.lineTo(o.x - o.vx * .02, o.y - o.vy * .02); } c.stroke();
      } else if (T === 'drip') {
        c.strokeStyle = 'rgba(150,200,255,0.5)'; c.lineWidth = 1.4;
        c.beginPath(); for (let i = 0; i < n; i++) { const o = this.items[i]; c.moveTo(o.x, o.y); c.lineTo(o.x, o.y - o.s); } c.stroke();
      } else if (T === 'scan') {
        c.globalCompositeOperation = 'lighter';
        const y = (this.t * 90) % (this.H + 200) - 100;
        const g = c.createLinearGradient(0, y - 60, 0, y + 60);
        g.addColorStop(0, 'rgba(80,255,200,0)'); g.addColorStop(.5, 'rgba(80,255,200,0.09)'); g.addColorStop(1, 'rgba(80,255,200,0)');
        c.fillStyle = g; c.fillRect(0, y - 60, this.W, 120);
        c.fillStyle = 'rgba(140,255,220,0.25)'; c.fillRect(0, y, this.W, 1.2);
      }
      c.restore();
    }
  }

  GD.Level = { COLS, buildField, makeProps, renderStatic, drawProp, Weather, makeWaves, enemyScale, UNLOCK };
})(window.GD);
