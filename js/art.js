/* ============ ART: оборонительная стена с воротами, северный пролом, детали поля ============
   Всё статичное рисуется один раз в offscreen (statCv / wallCv / northCv),
   в динамике остаются только огни, маяки и свечения. */
(function (GD) {
  'use strict';
  const { TAU, clamp, lerp, gfx, hsl, RNG, pointAt } = GD;

  /* ---------- палитра бетона/металла, подкрашенная под биом ---------- */
  function palette(b) {
    const h = b.groundHue;
    return {
      capTop: hsl(h, 10, 46), cap: hsl(h, 9, 38),
      f1: hsl(h, 9, 30), f2: hsl(h, 10, 22), f3: hsl(h, 12, 12),
      seam: 'rgba(0,0,0,0.45)', hi: 'rgba(255,255,255,0.10)',
      rustA: 'rgba(126,62,26,0.34)', rustB: 'rgba(90,44,20,0.0)',
      metalTop: '#8d959c', metalMid: '#4b535a', metalLo: '#1c2227',
      dark: '#0d1116',
      hazard: hsl(b.accent2Hue, 92, 54),
      acc: b.accent, accHue: b.accentHue, hue: h
    };
  }

  /* ---------- служебное ---------- */
  function chev(c, x, y, w, h, col, step) {
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.fillStyle = col;
    for (let i = -h; i < w + h; i += step * 2) {
      c.beginPath();
      c.moveTo(x + i, y + h); c.lineTo(x + i + step, y + h);
      c.lineTo(x + i + step + h, y); c.lineTo(x + i + h, y); c.closePath(); c.fill();
    }
    c.restore();
  }
  function bolts(c, x, y, w, step, col, r) {
    c.fillStyle = col;
    for (let i = x + step * .5; i < x + w; i += step) { c.beginPath(); c.arc(i, y, r || 1.3, 0, TAU); c.fill(); }
  }
  function vgrad(c, x0, y0, y1, stops) {
    const g = c.createLinearGradient(x0, y0, x0, y1);
    for (const s of stops) g.addColorStop(s[0], s[1]);
    c.fillStyle = g;
  }
  function streaks(c, x, y, w, h, rng, n, col) {
    for (let i = 0; i < n; i++) {
      const sx = x + rng.float(0, w), sw = rng.float(2, 7), sh = h * rng.float(.35, 1);
      const g = c.createLinearGradient(0, y, 0, y + sh);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(sx, y, sw, sh);
      c.fillStyle = col; c.fillRect(sx, y, sw * .6, 2);
    }
  }
  function noise(c, W, H, rng, n, cols, rmin, rmax) {
    for (let i = 0; i < n; i++) {
      const x = rng.float(0, W), y = rng.float(0, H), r = rng.float(rmin, rmax);
      c.fillStyle = cols[Math.floor(rng.next() * cols.length)];
      c.beginPath(); c.ellipse(x, y, r, r * rng.float(.5, 1), rng.float(0, 3), 0, TAU); c.fill();
    }
  }

  /* =======================================================================
     ЛИЦЕВАЯ СТЕНА (низ экрана) — статичная картинка в wallCv
     y0 = линия вера стены (baseY)
     ======================================================================= */
  const WALL_H = 34;          /* высота лица стены ниже y0 */
  const CAP_T = 6;            /* толщина крышки сверху */

  function buildWall(c, o) {
    const W = o.W, cell = o.cell, y0 = o.baseY, b = o.biome, P = o.P;
    const rng = new RNG('wall|' + o.level);
    const gx = o.gateX, gw = cell * .62;           /* полуширина проезда в воротах */
    const pw = cell * .21;                          /* ширина пилона */
    const top = y0 - CAP_T, face = y0 + 3, faceB = y0 + WALL_H;

    /* --- тень стены на землю (поле) --- */
    let g = c.createLinearGradient(0, y0 - cell * .8, 0, y0 + 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.55, 'rgba(0,0,0,0.34)'); g.addColorStop(1, 'rgba(0,0,0,0.62)');
    c.fillStyle = g; c.fillRect(0, y0 - cell * .8, W, cell * .8 + 2);

    /* --- берма перед стеной: утопленная полоса с грунтом --- */
    c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(0, y0 - 13, W, 13);
    for (let i = 0; i < Math.round(W / 5); i++) {
      const x = rng.float(0, W), y = y0 - rng.float(1, 12);
      c.fillStyle = rng.chance(.5) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.28)';
      c.beginPath(); c.ellipse(x, y, rng.float(1, 3.4), rng.float(.7, 1.6), rng.float(0, 3), 0, TAU); c.fill();
    }

    /* --- лицо стены --- */
    vgrad(c, 0, face, faceB, [[0, P.f1], [.16, P.cap], [.55, P.f2], [1, P.f3]]);
    c.fillRect(0, face, W, WALL_H);
    /* панели */
    const pwid = 54;
    for (let x = 0; x < W; x += pwid) {
      c.fillStyle = P.seam; c.fillRect(x, face, 1.6, WALL_H);
      c.fillStyle = P.hi; c.fillRect(x + 1.6, face, 1, WALL_H);
    }
    /* горизонтальный шов кладки */
    c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(0, face + WALL_H * .52, W, 1.4);
    c.fillStyle = P.hi; c.fillRect(0, face + WALL_H * .52 + 1.4, W, 1);
    /* потёки ржавчины и грязи */
    streaks(c, 0, face + 2, W, WALL_H - 2, rng, Math.round(W / 22), P.rustA);
    for (let i = 0; i < 14; i++) {
      const x = rng.float(0, W), y = face + rng.float(2, WALL_H - 4), r = rng.float(6, 22);
      const gg = c.createRadialGradient(x, y, 0, x, y, r);
      gg.addColorStop(0, 'rgba(0,0,0,0.26)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gg; c.beginPath(); c.ellipse(x, y, r, r * .6, 0, 0, TAU); c.fill();
    }
    /* трафаретная надпись сектора */
    (function () {
      const label = b.code || '';
      if (!label) return;
      const slots = [[0, gx - gw - pw - 26], [gx + gw + pw + 26, W]];
      for (const s of slots) {
        if (s[1] - s[0] < 74) continue;
        c.save();
        c.beginPath(); c.rect(s[0], face + 3, s[1] - s[0], WALL_H - 5); c.clip();
        c.font = '900 15px "Segoe UI",Roboto,sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = 'rgba(230,240,255,0.13)';
        c.fillText(label, (s[0] + s[1]) / 2, face + WALL_H * .52);
        c.restore();
      }
    })();
    /* предупреждающая полоса понизу */
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, faceB - 7, W, 7);
    chev(c, 0, faceB - 7, W, 7, hsl(P.accHue, 30, 60, .16), 11);
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, faceB - 8, W, 1.2);

    /* --- крышка стены --- */
    vgrad(c, 0, y0 - CAP_T, face, [[0, P.capTop], [.5, P.cap], [1, P.f1]]);
    c.fillRect(0, y0 - CAP_T, W, CAP_T + 3);
    c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(0, y0 - CAP_T, W, 1.4);
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, face + 2, W, 2);
    bolts(c, 0, y0 - CAP_T + 3, W, 27, 'rgba(0,0,0,0.4)', 1.5);
    bolts(c, 0, y0 - CAP_T + 2.2, W, 27, 'rgba(255,255,255,0.14)', 1.1);

    /* --- колючая проволока поверх стены --- */
    wire(c, W, y0 - CAP_T - 1, rng, P);

    /* --- Мебель стены: фонари, ящики, трубы --- */
    const lamps = [];
    const step = 132;
    for (let x = step * .5; x < W; x += step) {
      if (Math.abs(x - gx) < gw + pw + 18) { lamps.push({ x: x - 46, d: -1 }); continue; }
      lamps.push({ x, d: Math.sin(x) > 0 ? 1 : -1 });
    }
    for (const L of lamps) drawLamp(c, L.x, y0 - CAP_T, L.d, P, b);
    /* распределительные коробки и кабели */
    for (let x = 40; x < W; x += 197) {
      if (Math.abs(x - gx) < gw + pw + 30) continue;
      const bw = 16, bh = 13, bx = x, by = face + 6;
      vgrad(c, 0, by, by + bh, [[0, '#5c646b'], [1, '#22282d']]);
      gfx.rr(c, bx, by, bw, bh, 2); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 1; c.stroke();
      c.fillStyle = hsl(P.accHue, 90, 60, .8); c.fillRect(bx + 3, by + 3, 3, 2);
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(bx + bw, by + 4); c.lineTo(bx + bw + 8, by + 2); c.stroke();
    }

    /* --- мешки и расчёт у стены (вне ворот) --- */
    bagsAndCrew(c, W, y0, gx - gw - pw - 12, gx + gw + pw + 12, rng, P);

    /* --- ВОРОТА --- */
    drawGate(c, o, P, rng);

    /* --- юбка под стеной + осветление базы --- */
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, faceB, W, 4);
    vgrad(c, 0, faceB + 4, faceB + 26, [[0, 'rgba(10,14,18,0.95)'], [1, 'rgba(4,6,10,0.2)']]);
    c.fillRect(0, faceB + 4, W, 24);
    for (let i = 0; i < Math.round(W / 3); i++) {
      const x = rng.float(0, W), y = faceB + 4 + rng.float(0, 22);
      c.fillStyle = 'rgba(255,255,255,0.045)';
      c.beginPath(); c.arc(x, y, rng.float(.6, 1.8), 0, TAU); c.fill();
    }
    o.lamps = lamps;
  }

  function wire(c, W, y, rng, P) {
    c.save();
    c.strokeStyle = 'rgba(150,160,168,0.55)'; c.lineWidth = 1;
    /* стойки */
    for (let x = 12; x < W; x += 46) { c.fillStyle = 'rgba(90,98,104,0.9)'; c.fillRect(x, y - 7, 1.6, 7); }
    /* спирали */
    for (let row = 0; row < 2; row++) {
      const ry = y - 4 - row * 4;
      c.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const yy = ry + Math.sin(x * .5 + row * 2) * 2.4;
        x ? c.lineTo(x, yy) : c.moveTo(x, yy);
      }
      c.strokeStyle = row ? 'rgba(120,130,138,0.42)' : 'rgba(170,180,188,0.6)';
      c.stroke();
    }
    /* шипы */
    c.strokeStyle = 'rgba(190,200,206,0.5)'; c.lineWidth = .9;
    c.beginPath();
    for (let x = 6; x < W; x += 17) {
      const yy = y - 5 + Math.sin(x * .5) * 2.4;
      c.moveTo(x - 2, yy - 2); c.lineTo(x + 2, yy + 2); c.moveTo(x + 2, yy - 2); c.lineTo(x - 2, yy + 2);
    }
    c.stroke();
    c.restore();
  }

  function drawLamp(c, x, yTop, dir, P, b) {
    c.save();
    /* кронштейн */
    c.strokeStyle = '#464e55'; c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, yTop - 2); c.lineTo(x + dir * 10, yTop - 9); c.stroke();
    /* плафон */
    c.translate(x + dir * 12, yTop - 10); c.rotate(dir * .5);
    c.fillStyle = '#2b3238'; gfx.rr(c, -6, -3, 12, 7, 2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#ffe9b8'; c.fillRect(-4.4, 2.2, 8.8, 2.4);
    c.restore();
  }

  function bagsAndCrew(c, W, y0, xa, xb, rng, P) {
    xa = Math.max(6, xa); xb = Math.min(W - 6, xb);
    for (let bx = xa; bx < xb; bx += 46) {
      const stack = 2 + (Math.floor(bx / 46) % 2);
      for (let i = 0; i < stack; i++) {
        const oy = y0 - 9 + (i === 0 ? 0 : -7 * (i));
        const ox = bx + (i === 1 ? 0 : 0);
        const g = c.createLinearGradient(0, oy - 9, 0, oy + 3);
        g.addColorStop(0, '#8e8a5e'); g.addColorStop(1, '#4a4932');
        c.fillStyle = g; gfx.rr(c, ox - 13, oy - 9, 26, 11, 4); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1; c.stroke();
        c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(ox - 13, oy - 4, 26, 1.6);
        c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(ox - 11, oy - 8, 22, 1.4);
      }
      /* расчёт за бруствером */
      if (Math.floor(bx / 46) % 2 === 0) {
        const sy = y0 - 9 - (stack === 2 ? 7 : 14);
        c.fillStyle = '#3a4540'; gfx.rr(c, bx - 5, sy - 13, 10, 14, 3); c.fill();
        c.fillStyle = '#2c3a33'; gfx.rr(c, bx - 5, sy - 13, 10, 4, 2); c.fill();
        c.fillStyle = '#c08f62'; c.beginPath(); c.arc(bx, sy - 17, 3.6, 0, TAU); c.fill();
        c.fillStyle = '#39443c'; gfx.rr(c, bx - 4.4, sy - 21, 9, 5, 2); c.fill();
        c.strokeStyle = '#1c2024'; c.lineWidth = 2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(bx + 2, sy - 12); c.lineTo(bx + 13, sy - 22); c.stroke();
        c.fillStyle = 'rgba(255,60,50,.85)'; c.beginPath(); c.arc(bx + 13, sy - 22, 1.1, 0, TAU); c.fill();
      }
    }
  }

  /* ---------- ВОРОТА: створки, пилон, перемычка ---------- */
  function drawGate(c, o, P, rng) {
    const cell = o.cell, y0 = o.baseY, gx = o.gateX;
    const gw = cell * .62, pw = cell * .21;
    const face = y0 + 3, faceB = y0 + WALL_H;
    const tTop = y0 - cell * .66;              /* верх пилонов/перемычки */
    const beamB = y0 - 5;                       /* низ перемычки */

    /* --- ниша проезда (тёмная, под створками) --- */
    c.fillStyle = '#05070a'; c.fillRect(gx - gw, y0 - 6, gw * 2, WALL_H + 8);

    /* --- створки --- */
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? gx - gw : gx;
      const w = gw - 1;
      c.save();
      /* тень створки в нише */
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x0 - side * 1, y0 - 4, w, WALL_H + 6);
      /* полотно */
      vgrad(c, 0, y0 - 3, faceB, [[0, '#9aa3aa'], [.18, '#5d666d'], [.55, '#39424a'], [1, '#171d22']]);
      c.fillRect(x0, y0 - 3, w, WALL_H + 2);
      /* косая ребро-раскоса */
      c.save(); c.beginPath(); c.rect(x0, y0 - 3, w, WALL_H + 2); c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 5;
      c.beginPath(); c.moveTo(x0, faceB); c.lineTo(x0 + w, y0 - 3); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x0, faceB - 2); c.lineTo(x0 + w, y0 - 5); c.stroke();
      /* вертикальные рёбра */
      for (let i = 1; i < 3; i++) {
        const rx = x0 + (w * i) / 3;
        c.fillStyle = 'rgba(255,255,255,0.09)'; c.fillRect(rx, y0 - 3, 2, WALL_H + 2);
        c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(rx + 2, y0 - 3, 1.4, WALL_H + 2);
      }
      /* нижняя предупредительная полоса */
      c.fillStyle = 'rgba(8,10,12,0.9)'; c.fillRect(x0, faceB - 11, w, 10);
      chev(c, x0, faceB - 11, w, 10, '#f5c33b', 8);
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x0, faceB - 12, w, 1.2);
      c.restore();
      /*螺栓-петли по краю */
      c.fillStyle = '#232a30';
      for (const fy of [y0 + 2, y0 + 14, y0 + 26]) { gfx.rr(c, x0 + (side < 0 ? -3 : w - 1), fy - 3, 5, 7, 1.5); c.fill(); c.fillStyle = '#606a71'; c.beginPath(); c.arc(x0 + (side < 0 ? -.5 : w + 1.5), fy, 1.4, 0, TAU); c.fill(); c.fillStyle = '#232a30'; }
      /* шагрень/шаблоны на створке */
      c.save(); c.beginPath(); c.rect(x0, y0 - 3, w, WALL_H + 2); c.clip();
      c.font = '900 9px "Segoe UI",Roboto,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(230,240,255,0.16)';
      c.fillText(side < 0 ? 'ЗАКРЫТО' : 'ЗАКРЫТО', x0 + w / 2, y0 + 8);
      c.restore();
      c.restore();
    }
    /* центральный стык створок */
    c.fillStyle = '#04060a'; c.fillRect(gx - 1.5, y0 - 3, 3, WALL_H + 2);
    /* замок-шток */
    c.fillStyle = '#6d777e'; c.fillRect(gx - gw * .7, y0 + 12, gw * 1.4, 3.4);
    c.fillStyle = '#2b3237'; gfx.rr(c, gx - 5, y0 + 8, 10, 11, 2); c.fill();
    c.fillStyle = '#8f989e'; c.beginPath(); c.arc(gx, y0 + 13.5, 2, 0, TAU); c.fill();

    /* --- пилон с обеих сторон --- */
    for (const side of [-1, 1]) {
      const px0 = side < 0 ? gx - gw - pw : gx + gw;
      const pg2 = c.createLinearGradient(px0, tTop, px0 + pw, tTop);
      pg2.addColorStop(0, '#5b646b'); pg2.addColorStop(.35, '#39424a'); pg2.addColorStop(1, '#141a1f');
      c.fillStyle = pg2;
      c.fillRect(px0, tTop, pw, faceB - tTop);
      /* русты (кладка) */
      c.fillStyle = 'rgba(0,0,0,0.4)';
      for (let i = 0; i < 5; i++) c.fillRect(px0, tTop + (i + .6) * ((faceB - tTop) / 5.6), pw, 1.3);
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(px0, tTop, 1.6, faceB - tTop);
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(px0 + pw - 1.6, tTop, 1.6, faceB - tTop);
      /* капитель */
      vgrad(c, 0, tTop - 5, tTop + 2, [[0, '#7c858c'], [1, '#3a434a']]);
      gfx.rr(c, px0 - 3, tTop - 5, pw + 6, 8, 2); c.fill();
      c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(px0 - 3, tTop + 2.4, pw + 6, 1.4);
      /* сигнальная окантовка основания */
      chev(c, px0, faceB - 9, pw, 9, '#f5c33b', 7);
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(px0, faceB - 10, pw, 1.2);
      /* цепи на кольцах */
      c.strokeStyle = 'rgba(140,150,158,0.65)'; c.lineWidth = 1.4;
      const axx = px0 + (side < 0 ? pw - 1 : 1), ay = tTop + 8;
      c.beginPath();
      for (let i = 0; i <= 8; i++) {
        const tt = i / 8;
        const cxp = lerp(axx, gx + side * 6, tt), cyp = ay + Math.sin(tt * Math.PI) * 9 + tt * 4;
        i ? c.lineTo(cxp, cyp) : c.moveTo(cxp, cyp);
      }
      c.stroke();
      c.fillStyle = '#8d959c'; c.beginPath(); c.arc(axx, ay, 1.8, 0, TAU); c.fill();
      /* маячок на пилоне */
      c.fillStyle = '#2a3138'; gfx.rr(c, px0 + pw / 2 - 3.5, tTop - 11, 7, 6, 2); c.fill();
      c.fillStyle = '#ffb03a'; c.beginPath(); c.arc(px0 + pw / 2, tTop - 8, 2.4, 0, TAU); c.fill();
      o.beacons = o.beacons || [];
      o.beacons.push({ x: px0 + pw / 2, y: tTop - 8, ph: side > 0 ? 1.6 : 0 });
    }

    /* --- перемычка над проездом --- */
    vgrad(c, 0, tTop, beamB, [[0, '#6f787f'], [.3, '#474f56'], [1, '#20272c']]);
    c.fillRect(gx - gw - pw - 3, tTop, (gw + pw + 3) * 2, beamB - tTop);
    /* профиль двутавра */
    c.fillStyle = 'rgba(0,0,0,0.42)';
    c.fillRect(gx - gw - pw - 3, tTop + 3, (gw + pw + 3) * 2, 2.4);
    c.fillRect(gx - gw - pw - 3, beamB - 5, (gw + pw + 3) * 2, 2.4);
    c.fillStyle = 'rgba(255,255,255,0.13)'; c.fillRect(gx - gw - pw - 3, tTop, (gw + pw + 3) * 2, 1.6);
    bolts(c, gx - gw - pw, tTop + 9.5, (gw + pw) * 2, 15, 'rgba(0,0,0,0.45)', 1.6);
    /* шевроны на перемычке */
    chev(c, gx - gw + 2, beamB - 13, (gw - 2) * 2, 10, 'rgba(245,195,59,0.85)', 8);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(gx - gw + 2, beamB - 14, (gw - 2) * 2, 1.2);
    /* знак «высокое напряжение» по центру */
    (function () {
      const sx = gx, sy = tTop + (beamB - tTop) * .45, r = 7.5;
      c.fillStyle = '#14181c'; c.beginPath();
      c.moveTo(sx, sy - r); c.lineTo(sx + r * .92, sy + r * .72); c.lineTo(sx - r * .92, sy + r * .72); c.closePath(); c.fill();
      c.strokeStyle = '#ffcb3c'; c.lineWidth = 1.6; c.stroke();
      c.strokeStyle = '#ffdf6a'; c.lineWidth = 1.4; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(sx + 1.8, sy - 3.6); c.lineTo(sx - 2.2, sy + .6); c.lineTo(sx + .6, sy + .6); c.lineTo(sx - 1.4, sy + 4.6); c.stroke();
    })();
    /* прожектор над воротами */
    c.fillStyle = '#252c31'; gfx.rr(c, gx - 13, tTop - 4, 26, 5, 2); c.fill();
    c.fillStyle = '#fff0c8'; c.fillRect(gx - 10, tTop + .6, 20, 2.2);
    o.lampC = { x: gx, y: tTop + 2 };
    o.beacons.push({ x: gx - gw - pw + 4, y: tTop - 2, ph: .8, big: true });
    o.beacons.push({ x: gx + gw + pw - 4, y: tTop - 2, ph: 2.4, big: true });
    o.gateBox = { x0: gx - gw, x1: gx + gw, y0: y0 - 4, y1: faceB };
  }

  /* =======================================================================
     СЕВЕРНЫЙ ПРОЛОМ (верх экрана) — там, откуда лезут роботы
     ======================================================================= */
  function buildNorth(c, o) {
    const W = o.W, cell = o.cell, topPad = o.topPad, b = o.biome, P = o.P;
    const rng = new RNG('north|' + o.level);
    const bx = o.northX, bw = cell * .6;
    const yB = topPad - cell * .06;            /* нижняя кромка стены (обращена к полю) */
    const yT = -4;

    /* тело стены */
    vgrad(c, 0, yT, yB, [[0, '#0b0f13'], [.35, P.f2], [.78, P.f1], [1, P.capTop]]);
    c.fillRect(0, yT, W, yB - yT);
    /* кладка */
    const bh = 13, bwid = 40;
    for (let y = yT; y < yB - 2; y += bh) {
      c.fillStyle = 'rgba(0,0,0,0.30)'; c.fillRect(0, y, W, 1.3);
      c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(0, y + 1.3, W, 1);
      const off = ((y - yT) / bh) % 2 ? bwid * .5 : 0;
      for (let x = off; x < W; x += bwid) { c.fillStyle = 'rgba(0,0,0,0.26)'; c.fillRect(x, y, 1.3, bh); }
    }
    /* верхняя кромка (разрушенная) — силуэт поверх */
    c.fillStyle = 'rgba(6,9,12,0.9)';
    c.beginPath(); c.moveTo(0, yT);
    for (let x = 0; x <= W; x += 18) c.lineTo(x, 4 + Math.sin(x * .17) * 3 + rng.float(-2, 3));
    c.lineTo(W, yT); c.closePath(); c.fill();
    /* потёки, мох/пыль */
    streaks(c, 0, yT + 6, W, yB - yT - 8, rng, Math.round(W / 16), 'rgba(0,0,0,0.34)');
    /* обломки на уступе */
    for (let i = 0; i < Math.round(W / 46); i++) {
      const x = rng.float(0, W), s = rng.float(4, 10);
      c.fillStyle = hsl(b.groundHue, 8, rng.float(18, 32));
      c.beginPath();
      c.moveTo(x, yB - 1); c.lineTo(x + s * .3, yB - s * .8); c.lineTo(x + s * .8, yB - s * .5); c.lineTo(x + s, yB - 1);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, yB - 2, s, 2);
    }
    /* ПРОЛОМ */
    const holeTop = yT - 2;
    c.fillStyle = '#03050a'; c.fillRect(bx - bw, holeTop, bw * 2, yB - holeTop + 2);
    /* нутро туннеля: сходящиеся стенки */
    const tg = c.createLinearGradient(0, holeTop, 0, yB);
    tg.addColorStop(0, 'rgba(0,0,0,0.95)'); tg.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = tg; c.fillRect(bx - bw, holeTop, bw * 2, yB - holeTop);
    /* рёбра туннеля */
    c.strokeStyle = 'rgba(120,140,160,0.16)'; c.lineWidth = 2;
    for (let i = 1; i <= 4; i++) {
      const t = i / 5, hw = bw * (1 - t * .45), hy = lerp(holeTop + 6, yB, t);
      c.beginPath(); c.moveTo(bx - hw, hy - 5); c.lineTo(bx - hw, hy); c.lineTo(bx + hw, hy); c.lineTo(bx + hw, hy - 5); c.stroke();
    }
    /* рваные края пролома + арматура */
    for (const side of [-1, 1]) {
      const ex = bx + side * bw;
      c.fillStyle = P.f1;
      c.beginPath();
      c.moveTo(ex, yT - 2);
      for (let y = yT; y < yB; y += 9) c.lineTo(ex + side * (2 + Math.sin(y * .7) * 3.5 + rng.float(0, 2)), y);
      c.lineTo(ex + side * 10, yB); c.lineTo(ex + side * 10, yT - 2);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(ex - (side < 0 ? 0 : 3), yT, 3, yB - yT);
      /* арматура */
      c.strokeStyle = 'rgba(150,120,86,0.75)'; c.lineWidth = 1.6; c.lineCap = 'round';
      for (let k = 0; k < 4; k++) {
        const yy = yT + 10 + k * ((yB - yT - 12) / 4);
        c.beginPath(); c.moveTo(ex, yy); c.lineTo(ex - side * rng.float(6, 15), yy + rng.float(-6, 8)); c.stroke();
      }
      /* предупреждальные полосы на кромке */
      chev(c, ex - (side < 0 ? 9 : 0), yT, 9, yB - yT - 6, 'rgba(238,186,60,0.55)', 8);
    }
    /*тамбур: рама ворот слева/справа в проломе */
    for (const side of [-1, 1]) {
      const rx = bx + side * (bw - 3.5);
      c.fillStyle = '#232a30'; c.fillRect(rx - 1.8, holeTop, 3.6, yB - holeTop);
      c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(rx - 1.8, holeTop, 1, yB - holeTop);
    }
    /* световые точки на кромке */
    o.nLamps = [];
    for (const side of [-1, 1]) {
      const lx = bx + side * (bw + 8);
      c.fillStyle = '#1c2227'; gfx.rr(c, lx - 4, yB - 13, 8, 6, 2); c.fill();
      c.fillStyle = '#ff5540'; c.beginPath(); c.arc(lx, yB - 10, 2.3, 0, TAU); c.fill();
      o.nLamps.push({ x: lx, y: yB - 10, ph: side > 0 ? 1.9 : 0 });
    }
    o.northBox = { x0: bx - bw, x1: bx + bw, y0: yT, y1: yB };
    /* текст на стене */
    c.save();
    c.beginPath(); c.rect(0, yT, W, yB - yT - 4); c.clip();
    c.font = '900 12px "Segoe UI",Roboto,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(240,80,60,0.16)';
    const lbl = 'НЕ ПРОЙДЁШЬ';
    for (const lx of [bx - bw - 78, bx + bw + 78]) if (lx > 40 && lx < W - 40) c.fillText(lbl, lx, yB - 22);
    c.restore();
  }

  /* =======================================================================
     ТЫЛ БАЗЫ (за стеной) — рисуется в statCv
     ======================================================================= */
  function buildBehind(c, o) {
    const W = o.W, H = o.H, y0 = o.baseY, b = o.biome;
    const rng = new RNG('behind|' + o.level);
    const y1 = y0 + WALL_H + 30;
    const g = c.createLinearGradient(0, y0 + 14, 0, H);
    g.addColorStop(0, 'rgba(9,13,18,0.92)'); g.addColorStop(.5, 'rgba(6,9,13,0.96)'); g.addColorStop(1, '#03050a');
    c.fillStyle = g; c.fillRect(0, y0 + 14, W, H - y0 - 14);
    /* силуэты техники и лагеря */
    for (let i = 0; i < Math.ceil(W / 92); i++) {
      const x = 20 + i * 92, y = y1 + rng.float(2, 16);
      /* контейнер */
      c.fillStyle = 'rgba(28,36,42,0.95)'; gfx.rr(c, x, y, 42, 17, 3); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x, y, 42, 2);
      c.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = 1; k < 5; k++) c.fillRect(x + k * 8, y + 2, 1.4, 14);
      /* палатка */
      c.fillStyle = 'rgba(52,64,52,0.95)';
      c.beginPath(); c.moveTo(x + 50, y + 17); c.lineTo(x + 68, y - 6); c.lineTo(x + 86, y + 17); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,190,90,0.5)'; c.fillRect(x + 66, y + 3, 4, 8);
      /* мачта со светильником */
      if (i % 2 === 0) {
        c.strokeStyle = 'rgba(70,80,88,0.9)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x + 10, y - 4); c.lineTo(x + 10, y - 30); c.stroke();
        c.fillStyle = 'rgba(255,220,140,0.85)'; c.fillRect(x + 6, y - 33, 9, 3);
        const gg = c.createRadialGradient(x + 10, y - 31, 0, x + 10, y - 31, 30);
        gg.addColorStop(0, 'rgba(255,210,130,0.28)'); gg.addColorStop(1, 'rgba(255,190,90,0)');
        c.fillStyle = gg; c.beginPath(); c.arc(x + 10, y - 31, 30, 0, TAU); c.fill();
      }
    }
    /* тёплое зарево базы */
    const bg = c.createLinearGradient(0, y1 - 10, 0, H);
    bg.addColorStop(0, 'rgba(255,160,70,0.06)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = bg; c.fillRect(0, y1 - 10, W, H - y1 + 10);
  }

  /* =======================================================================
     ДЕТАЛИ ПОЛЯ: почва, дорога, следы
     ======================================================================= */
  function fieldDetail(c, o) {
    const { W, H, cell, field, biome: b } = o;
    const rng = new RNG('field|' + o.level);
    const { px, cum } = field;

    /* --- мелкий сор и камни по всему полю --- */
    const speck = [];
    for (let i = 0; i < 5; i++) speck.push(i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.10)');
    noise(c, W, H, rng, 260, speck, .7, 2.6);

    /* --- трещины в грунте --- */
    c.save();
    c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      let x = rng.float(0, W), y = rng.float(0, H);
      c.lineWidth = rng.float(.6, 1.6); c.beginPath(); c.moveTo(x, y);
      let a = rng.float(0, TAU);
      for (let k = 0; k < 5; k++) { a += rng.float(-.7, .7); const L = rng.float(cell * .2, cell * .6); x += Math.cos(a) * L; y += Math.sin(a) * L; c.lineTo(x, y); }
      c.stroke();
    }
    c.restore();

    /* --- тень от северной стены ложится на поле --- */
    const nsh = c.createLinearGradient(0, o.topPad - cell * .06, 0, o.topPad + cell * .38);
    nsh.addColorStop(0, 'rgba(0,0,0,0.52)'); nsh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = nsh; c.fillRect(0, o.topPad - cell * .06, W, cell * .44);

    /* --- дорога: изношенные колеи, заплатки, ямы, пыль по краям --- */
    const total = cum[cum.length - 1];
    const pt = { x: 0, y: 0, a: 0 };
    /* пыльный вал по обочинам */
    for (const side of [-1, 1]) {
      for (let d = 0; d < total; d += 7) {
        pointAt(px, cum, d, pt);
        const nx = Math.cos(pt.a + Math.PI / 2) * side, ny = Math.sin(pt.a + Math.PI / 2) * side;
        const rr = cell * (.47 + rng.float(0, .05));
        c.fillStyle = rng.chance(.5) ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.10)';
        c.beginPath(); c.ellipse(pt.x + nx * rr, pt.y + ny * rr, rng.float(2, 5.5), rng.float(1.2, 3), rng.float(0, 3), 0, TAU); c.fill();
      }
    }
    /* колеи */
    c.save();
    for (const side of [-1, 1]) {
      for (let d = 6; d < total; d += 5) {
        pointAt(px, cum, d, pt);
        const nx = Math.cos(pt.a + Math.PI / 2) * side, ny = Math.sin(pt.a + Math.PI / 2) * side;
        const rr = cell * .2;
        c.fillStyle = 'rgba(0,0,0,0.13)';
        c.beginPath(); c.ellipse(pt.x + nx * rr, pt.y + ny * rr, cell * .07, cell * .07, 0, 0, TAU); c.fill();
      }
    }
    c.restore();
    /* заплатки и ямы */
    for (let i = 0; i < 10; i++) {
      pointAt(px, cum, rng.float(cell * .5, total - cell * .5), pt);
      const ox = rng.float(-cell * .22, cell * .22), oy = rng.float(-cell * .1, cell * .1);
      const w = cell * rng.float(.24, .5), h = cell * rng.float(.14, .3);
      c.save(); c.translate(pt.x + ox, pt.y + oy); c.rotate(pt.a);
      c.fillStyle = 'rgba(255,255,255,0.05)'; gfx.rr(c, -w / 2, -h / 2, w, h, 3); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 1; c.stroke();
      c.restore();
    }
    for (let i = 0; i < 7; i++) {
      pointAt(px, cum, rng.float(cell * .5, total - cell * .5), pt);
      const r = cell * rng.float(.05, .12);
      const g2 = c.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 2);
      g2.addColorStop(0, 'rgba(0,0,0,0.5)'); g2.addColorStop(.6, 'rgba(0,0,0,0.22)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g2; c.beginPath(); c.ellipse(pt.x, pt.y, r * 2, r * 1.3, rng.float(0, 3), 0, TAU); c.fill();
    }
    /* следы юза на поворотах */
    c.save();
    c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = cell * .07; c.lineCap = 'round';
    for (let i = 1; i < px.length - 1; i++) {
      const a = px[i - 1], p = px[i], q = px[i + 1];
      const a1 = Math.atan2(p.y - a.y, p.x - a.x), a2 = Math.atan2(q.y - p.y, q.x - p.x);
      let d = ((a2 - a1 + Math.PI * 3) % TAU) - Math.PI;
      if (Math.abs(d) < .6) continue;
      const dirx = Math.cos((a1 + a2) / 2 + Math.PI), diry = Math.sin((a1 + a2) / 2 + Math.PI);
      for (const s of [-1, 1]) {
        const nx = Math.cos(a1 + Math.PI / 2) * s, ny = Math.sin(a1 + Math.PI / 2) * s;
        c.beginPath();
        c.moveTo(p.x + dirx * cell * .8 + nx * cell * .2, p.y + diry * cell * .8 + ny * cell * .2);
        c.quadraticCurveTo(p.x + nx * cell * .34, p.y + ny * cell * .34, p.x - dirx * cell * .1 + nx * cell * .2, p.y - diry * cell * .1 + ny * cell * .2);
        c.stroke();
      }
    }
    c.restore();
    /* стоп-линия и стрелы перед южными воротами */
    const gx = o.gateX, yEnd = px[px.length - 1].y;
    const markY = Math.min(o.baseY - cell * .62, yEnd - cell * .2);
    c.save();
    c.globalAlpha = .5;
    c.fillStyle = 'rgba(240,225,120,0.55)';
    c.fillRect(gx - cell * .34, markY, cell * .68, 3);
    for (let k = 0; k < 2; k++) {
      const ay = markY - cell * (.5 + k * .55);
      c.fillStyle = 'rgba(220,235,255,0.20)';
      c.beginPath();
      c.moveTo(gx, ay + cell * .3); c.lineTo(gx - cell * .17, ay + cell * .02); c.lineTo(gx - cell * .07, ay + cell * .02);
      c.lineTo(gx - cell * .07, ay - cell * .2); c.lineTo(gx + cell * .07, ay - cell * .2); c.lineTo(gx + cell * .07, ay + cell * .02);
      c.lineTo(gx + cell * .17, ay + cell * .02); c.closePath(); c.fill();
    }
    c.restore();
  }

  /* =======================================================================
     ДИНАМИКА: огни, маяки, повреждения
     ======================================================================= */
  function baseLights(c, o, t, st) {
    const cell = o.cell, y0 = o.baseY, b = o.biome, hpK = st.hpK;
    const accHue = b.accentHue;
    /* конусы прожекторов */
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const L of (o.lamps || [])) {
      const flick = .82 + .18 * Math.sin(t * 7.3 + L.x) * Math.sin(t * 2.1 + L.x * .3);
      const g = c.createLinearGradient(L.x, y0, L.x, y0 - cell * 1.25);
      g.addColorStop(0, 'rgba(255,222,150,' + (.11 * flick).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,222,150,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(L.x - 7, y0 - 10); c.lineTo(L.x + 7, y0 - 10);
      c.lineTo(L.x + 34, y0 - cell * 1.25); c.lineTo(L.x - 34, y0 - cell * 1.25);
      c.closePath(); c.fill();
      /* блик на грунте под стеной */
      GD.Glow.pool(c, 'lamp', 'rgba(255,220,150,1)', L.x, y0 + 4, 30, 12, .13 * flick);
    }
    if (o.lampC) {
      const g = c.createLinearGradient(o.lampC.x, o.lampC.y, o.lampC.x, o.lampC.y + cell * 1.5);
      g.addColorStop(0, 'rgba(255,240,200,0.20)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(o.lampC.x - 12, o.lampC.y); c.lineTo(o.lampC.x + 12, o.lampC.y);
      c.lineTo(o.lampC.x + cell * .7, y0 + 26); c.lineTo(o.lampC.x - cell * .7, y0 + 26);
      c.closePath(); c.fill();
    }
    /* маяки */
    for (const B2 of (o.beacons || [])) {
      const k = Math.pow(Math.max(0, Math.sin(t * 3.4 + B2.ph)), 6);
      if (k <= .02) continue;
      const r = (B2.big ? 16 : 11) * (.7 + k * .6);
      GD.Glow.blit(c, 'flame', 'rgba(255,150,50,1)', B2.x, B2.y, r, .85 * k);
    }
    /* силовой контур в стыке створок + свечение ворот */
    if (o.gateBox) {
      const G = o.gateBox;
      const pulse = .35 + .25 * Math.sin(t * 2.4);
      const col = hpK > .3 ? hsl(accHue, 100, 62, pulse * .55) : hsl(8, 100, 58, pulse * .7);
      c.strokeStyle = col; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo((G.x0 + G.x1) / 2, G.y0 + 2); c.lineTo((G.x0 + G.x1) / 2, G.y1 - 12); c.stroke();
      /* энергоячейки поперёк стыка */
      c.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const yy = lerp(G.y0 + 6, G.y1 - 14, i / 3);
        const w = 4 + 3 * Math.sin(t * 4 + i);
        c.strokeStyle = hsl(accHue, 100, 66, pulse * .35);
        c.beginPath(); c.moveTo((G.x0 + G.x1) / 2 - w, yy); c.lineTo((G.x0 + G.x1) / 2 + w, yy); c.stroke();
      }
      const g = c.createLinearGradient(0, G.y1, 0, G.y1 - cell * .9);
      g.addColorStop(0, hsl(accHue, 100, 60, .12)); g.addColorStop(1, hsl(accHue, 100, 60, 0));
      c.fillStyle = g; c.fillRect(G.x0, G.y1 - cell * .9, G.x1 - G.x0, cell * .9);
    }
    /* удар по воротам */
    if (st.hit > 0.01 && o.gateBox) {
      const G = o.gateBox, k = st.hit;
      GD.Glow.blit(c, 'flame', 'rgba(255,170,80,1)', (G.x0 + G.x1) / 2, y0 + 10, cell * 1.2 * k + 12, .85 * k);
      c.strokeStyle = 'rgba(255,230,180,' + (.7 * k) + ')'; c.lineWidth = 2;
      c.strokeRect(G.x0, G.y0, G.x1 - G.x0, G.y1 - G.y0);
    }
    /* аварийная раскраска стыков при разрушении */
    if (hpK < .7) {
      const k = (1 - hpK) / .7;
      const em = .5 + .5 * Math.sin(t * 5.5);
      c.fillStyle = 'rgba(255,70,40,' + (.10 * k * (.6 + .4 * em)).toFixed(3) + ')';
      c.fillRect(0, y0 - 6, o.W, WALL_H + 10);
    }
    c.restore();
  }

  function northLights(c, o, t, st) {
    const box = o.northBox; if (!box) return;
    const cx = (box.x0 + box.x1) / 2, yB = box.y1;
    c.save();
    c.globalCompositeOperation = 'lighter';
    /* красное зарево из пролома */
    const k = .5 + .22 * Math.sin(t * 2.1) + st.spawn * .9;
    const r = (box.x1 - box.x0) * (.9 + st.spawn * .5);
    GD.Glow.blit(c, 'soft', 'rgba(255,70,40,1)', cx, yB - 18, r, .34 * k);
    /* маячки на кромке */
    for (const L of (o.nLamps || [])) {
      const q = Math.pow(Math.max(0, Math.sin(t * 4 + L.ph)), 8);
      if (q <= .02) continue;
      GD.Glow.blit(c, 'flame', 'rgba(255,110,60,1)', L.x, L.y, 14 * (.6 + q), .85 * q);
    }
    c.restore();
  }

  GD.Art = {
    WALL_H, CAP_T, palette,
    buildWall, buildNorth, buildBehind, fieldDetail,
    baseLights, northLights
  };
})(window.GD);
