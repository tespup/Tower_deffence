/* ============ ENEMIES: процедурные роботы Skynet ============ */
/* Все враги рисуются процедурно. Внешний вид каждого архетипа собирается
   из семян уровня: меняются корпус, число ног/глаз, броня, оружие, цвета. */
(function (GD) {
  'use strict';
  const { RNG, TAU, clamp, lerp, rnd, hsl, gfx } = GD;

  /* ---------- архетипы ----------
     atk — темп ответного огня, выстрелов в секунду (0 = враг не стреляет).
     Огонь ведётся по турелям в радиусе, а по бункеру — только когда враг уже
     у ворот (см. Game.enemyShoot), поэтому темп важный: завышенный темп
     превращает обстрел в мгновенный слив 100HP бункера. */
  const ARCH = {
    scout:   { name: 'РАЗВЕДЧИК',    body: 'biped', hp: 26,  spd: 74, armor: 0,   bounty: 9,  leak: 1,  size: 15, air: 0, atk: 0,    w: .82, hpK: .62, spdK: 1.55 },
    runner:  { name: 'БЕГУН',        body: 'biped', hp: 18,  spd: 92, armor: 0,   bounty: 8,  leak: 1,  size: 13, air: 0, atk: 0,    w: .9,  hpK: .45, spdK: 1.95 },
    grunt:   { name: 'ПЕХОТИНЕЦ T-6',body: 'biped', hp: 52,  spd: 52, armor: 2,   bounty: 12, leak: 2,  size: 17, air: 0, atk: 0,    w: 1.6, hpK: 1,   spdK: 1 },
    spider:  { name: 'ПАУК-ОХОТНИК', body: 'quad',  hp: 74,  spd: 60, armor: 5,   bounty: 16, leak: 2,  size: 19, air: 0, atk: 0,    w: 1.5, hpK: 1.2, spdK: 1.05 },
    tank:    { name: 'ТАНКЕТКА HK',  body: 'tread', hp: 190, spd: 34, armor: 14,  bounty: 30, leak: 4,  size: 24, air: 0, atk: .7,   w: 2.2, hpK: 2.6, spdK: .72 },
    hover:   { name: 'ХОВЕР-ДРОИД',  body: 'hover', hp: 96,  spd: 56, armor: 4,   bounty: 22, leak: 2,  size: 20, air: 0, atk: .55,  w: 1.8, hpK: 1.3, spdK: 1.0 },
    drone:   { name: 'ДРОН',         body: 'drone', hp: 34,  spd: 86, armor: 1,   bounty: 13, leak: 2,  size: 17, air: 1, atk: 0,    w: 1.3, hpK: .8,  spdK: 1.35 },
    bomber:  { name: 'БОМБЕР',       body: 'orb',   hp: 64,  spd: 66, armor: 3,   bounty: 18, leak: 5,  size: 18, air: 1, atk: 0,    w: 1.2, hpK: 1.0, spdK: 1.1, suicide: 1 },
    fixer:   { name: 'РЕМБОТ',       body: 'hover', hp: 70,  spd: 48, armor: 2,   bounty: 24, leak: 1,  size: 18, air: 0, atk: 0,    w: 1.05, hpK: 1.0, spdK: .92, heal: 1 },
    shield:  { name: 'ЩИТОНОСЕЦ',    body: 'quad',  hp: 240, spd: 40, armor: 10,  bounty: 34, leak: 3,  size: 23, air: 0, atk: 0,    w: 1.3, hpK: 2.4, spdK: .8, shieldA: .32 },
    hulkb:   { name: 'ШТУРМОВИК',    body: 'hulk',  hp: 420, spd: 30, armor: 18,  bounty: 52, leak: 6,  size: 28, air: 0, atk: .6,   w: 1.7, hpK: 4.6, spdK: .66 },
    titan:   { name: 'ТИТАН',        body: 'hulk',  hp: 2600,spd: 22, armor: 24,  bounty: 220,leak: 14, size: 40, air: 0, atk: .45,  w: 0,   hpK: 24,  spdK: .58, boss: 1 }
  };

  /* ---------- вариации облика на уровень ---------- */
  function makeChassis(rng, archId, mut, biome) {
    const a = ARCH[archId];
    const ch = {
      arch: archId, body: a.body,
      bodyIdx: rng.int(0, 2),
      head: rng.int(0, 4),
      eyes: rng.chance(.25) ? 3 : (rng.chance(.5) ? 1 : 2),
      eyeStyle: rng.int(0, 2),
      armorLv: rng.int(0, 3),
      spikes: rng.chance(.45),
      antenna: rng.int(0, 2),
      weapon: rng.pick(['gun', 'cannon', 'laser', 'missile', 'saw', 'plasma']),
      legs: a.body === 'quad' ? rng.int(4, 6) : 2,
      rotors: a.body === 'drone' ? (rng.chance(.5) ? 2 : 4) : 0,
      pipes: rng.int(0, 3),
      shoulder: rng.int(0, 2),
      tail: rng.chance(.35),
      plate: Array.from({ length: 10 }, () => rng.float(-.22, .22)),
      decal: rng.int(0, 3),
      hue: rng.float(-22, 22),
      sizeK: rng.float(.92, 1.12),
      wobble: rng.float(.6, 1.5),
      gait: rng.float(.85, 1.25)
    };
    /* палитра = биом + мутация уровня + личный сдвиг */
    const baseHue = biome.family.bot[0] + ch.hue + (mut.id === 'prism' ? rng.float(-90, 90) : 0);
    let sat = clamp(14 + mut.metalS + rng.float(-5, 5), 3, 55);
    let lit = clamp(40 + mut.metalL + rng.float(-7, 7), 12, 78);
    if (mut.id === 'stealth') { sat = 8; lit = 22; }
    if (mut.id === 'bone') { sat = 8; lit = 68; }
    if (mut.id === 'chrome') { sat = 6; lit = 62; }
    let trimHue = biome.accent2Hue + ch.hue * .5;
    if (mut.trim === 'gold') trimHue = 44;
    if (mut.trim === 'copper') trimHue = 22;
    if (mut.trim === 'cyan') trimHue = 188;
    if (mut.trim === 'orange') trimHue = 22;
    if (mut.trim === 'bone') trimHue = 40;
    const glow = mut.trim === 'glow';
    ch.col = {
      hi: hsl(baseHue, sat + 6, lit + 26), mid: hsl(baseHue, sat, lit),
      lo: hsl(baseHue, sat, lit - 14), dk: hsl(baseHue, sat * .8, Math.max(6, lit - 28)),
      out: hsl(baseHue, sat, Math.max(4, lit - 36)),
      trim: hsl(trimHue, 85, glow ? 62 : 55), trimDim: hsl(trimHue, 70, 32),
      eye: hsl(biome.eyeHue, 100, 62), eyeCore: '#fff',
      glowReactor: hsl(trimHue + 20, 100, 60),
      stripe: mut.trim === 'stripe'
    };
    ch.mut = mut;
    return ch;
  }

  function variantsForLevel(level, biome) {
    const out = {};
    for (const id in ARCH) {
      const rng = new RNG('chassis|' + level + '|' + id);
      const mut = GD.Biomes.makeMutation(rng);
      const n = 3;
      const list = [];
      for (let i = 0; i < n; i++) list.push(makeChassis(rng, id, mut, biome));
      out[id] = { list, mut };
    }
    return out;
  }

  /* ============ отрисовка ============ */
  const EYE = {
    draw(c, ch, x, y, r, t, n, style) {
      const col = ch.col.eye;
      const q = GD.q == null ? 1 : GD.q;
      for (let i = 0; i < n; i++) {
        const ox = n === 1 ? 0 : (i - (n - 1) / 2) * r * 2.5;
        const px = x + ox;
        const pulse = .78 + Math.sin(t * 4 + i) * .12;
        if (q > .35) {
          c.save(); c.globalCompositeOperation = 'lighter';
          GD.Glow.blit(c, 'eye', col, px, y, r * 4.2 * (q > .7 ? 1 : .8), .8 * pulse);
          c.restore();
        }
        c.fillStyle = ch.col.dk; c.beginPath(); c.arc(px, y, r * 1.18, 0, TAU); c.fill();
        c.fillStyle = col; c.beginPath(); c.arc(px, y, r, 0, TAU); c.fill();
        c.fillStyle = ch.col.eyeCore; c.globalAlpha = pulse;
        if (style === 1) c.fillRect(px - r * .9, y - r * .34, r * 1.8, r * .68);
        else if (style === 2) { c.beginPath(); c.arc(px, y, r * .42, 0, TAU); c.fill(); }
        else { c.beginPath(); c.arc(px - r * .25, y - r * .25, r * .35, 0, TAU); c.fill(); }
        c.globalAlpha = 1;
      }
    }
  };

  function shadow(c, w, k) {
    c.fillStyle = 'rgba(0,0,0,0.42)';
    c.beginPath(); c.ellipse(0, 0, w, w * .34, 0, 0, TAU); c.fill();
  }
  function leg(c, x1, y1, x2, y2, w, ch) {
    c.strokeStyle = ch.col.dk; c.lineWidth = w; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.strokeStyle = ch.col.lo; c.lineWidth = w * .5;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }
  function arm(c, x1, y1, x2, y2, w, ch) { leg(c, x1, y1, x2, y2, w, ch); /* гидравлика */
    c.strokeStyle = ch.col.trim; c.globalAlpha = .55; c.lineWidth = w * .22;
    c.beginPath(); c.moveTo(x1, y1 - w * .3); c.lineTo(x2, y2 - w * .3); c.stroke(); c.globalAlpha = 1;
  }
  function plateDraw(c, pts, ch, k) {
    gfx.poly(c, pts);
    const g = GD.lin(c, -14, -20, 14, 14, [[0, ch.col.hi], [.5, ch.col.mid], [1, ch.col.lo]]);
    c.fillStyle = g; c.fill();
    c.strokeStyle = ch.col.out; c.lineWidth = 1.1; c.stroke();
    if (k) { c.globalAlpha = .35; c.strokeStyle = '#fff'; c.lineWidth = .8; c.stroke(); c.globalAlpha = 1; }
  }
  function spikesDraw(c, x, y, w, h, n, ch) {
    c.fillStyle = ch.col.dk;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - .5;
      c.beginPath(); c.moveTo(x + t * w - 2, y); c.lineTo(x + t * w, y - h * (0.7 + Math.abs(t) * .5)); c.lineTo(x + t * w + 2, y); c.closePath(); c.fill();
    }
  }
  function weaponDraw(c, ch, x, y, s, t, dir) {
    const w = ch.weapon;
    c.save(); c.translate(x, y);
    const g = GD.lin(c, 0, -4, 0, 6, [[0, ch.col.lo], [1, ch.col.dk]]);
    c.fillStyle = g; c.strokeStyle = ch.col.out; c.lineWidth = .9;
    const muzzle = .5 + Math.sin(t * 6) * .18;
    switch (w) {
      case 'cannon':
        c.fillRect(-2.6, -s * .1, 5.2, s * .78); c.beginPath(); c.arc(0, s * .7, 3.4, 0, TAU); c.fill();
        c.fillStyle = ch.col.trim; c.globalAlpha = muzzle; c.beginPath(); c.arc(0, s * .74, 1.9, 0, TAU); c.fill(); c.globalAlpha = 1;
        break;
      case 'laser':
        c.fillRect(-1.6, 0, 3.2, s * .8); c.fillStyle = ch.col.trim;
        c.fillRect(-3.2, s * .2, 6.4, 2.2);
        c.globalAlpha = muzzle + .2; c.beginPath(); c.arc(0, s * .82, 2.2, 0, TAU); c.fill(); c.globalAlpha = 1;
        break;
      case 'missile':
        for (let i = -1; i <= 1; i += 2) { c.fillRect(i * 3 - 1.6, 0, 3.2, s * .6); c.fillStyle = ch.col.trim; c.beginPath(); c.arc(i * 3, s * .62, 1.5, 0, TAU); c.fill(); c.fillStyle = g; }
        break;
      case 'saw':
        c.save(); c.rotate(t * 9); c.fillStyle = ch.col.hi;
        for (let i = 0; i < 8; i++) { c.rotate(TAU / 8); c.beginPath(); c.moveTo(0, -s * .42); c.lineTo(2.6, -s * .2); c.lineTo(-2.6, -s * .2); c.fill(); }
        c.beginPath(); c.arc(0, 0, s * .2, 0, TAU); c.fillStyle = ch.col.dk; c.fill(); c.restore();
        break;
      case 'plasma':
        c.fillRect(-2.2, 0, 4.4, s * .55);
        c.fillStyle = ch.col.glowReactor; c.globalAlpha = .5 + muzzle * .5;
        c.beginPath(); c.arc(0, s * .62, 3 + muzzle * 1.6, 0, TAU); c.fill(); c.globalAlpha = 1;
        break;
      default:
        c.fillRect(-1.7, 0, 3.4, s * .62);
        c.fillStyle = ch.col.trimDim; c.fillRect(-2.6, s * .16, 5.2, 1.8);
    }
    c.restore();
  }

  /* ---- двуногий (экзоскелет, идёт на камеру) ---- */
  function drawBiped(c, ch, s, p, t, hp) {
    const col = ch.col, H = s * 1.42, W = s * .74;
    const gait = p * TAU;
    const l1 = Math.sin(gait), l2 = Math.sin(gait + Math.PI);
    const bob = Math.abs(Math.sin(gait)) * H * .045;
    c.save(); c.translate(0, -bob);
    /* ноги */
    const hipY = -H * .18, footY = 0;
    for (const [side, sw] of [[-1, l1], [1, l2]]) {
      const hx = side * W * .2, fx = side * W * (.34 + sw * .16);
      const kneeX = side * W * (.5 + sw * .12), kneeY = hipY + H * .3 - Math.max(0, sw) * H * .05;
      leg(c, hx, hipY, kneeX, kneeY, s * .19, ch);
      leg(c, kneeX, kneeY, fx, footY - Math.max(0, sw) * s * .16, s * .14, ch);
      c.fillStyle = col.dk; c.fillRect(fx - s * .19, footY - s * .1 + -Math.max(0, sw) * s * .14, s * .38, s * .13);
      c.fillStyle = col.trim; c.globalAlpha = .8; c.fillRect(kneeX - s * .06, kneeY - s * .06, s * .12, s * .12); c.globalAlpha = 1;
    }
    /* таз */
    plateDraw(c, [[-W * .3, hipY - s * .12], [W * .3, hipY - s * .12], [W * .22, hipY + s * .12], [-W * .22, hipY + s * .12]], ch);
    /* гидравлика по бокам корпуса */
    const torsoTop = -H * .74;
    for (const sd of [-1, 1]) {
      c.fillStyle = col.dk; c.fillRect(sd * W * .42 - s * .05, torsoTop + H * .1, s * .1, H * .34);
      c.fillStyle = col.trim; c.globalAlpha = .7; c.fillRect(sd * W * .42 - s * .02, torsoTop + H * .12, s * .04, H * .3); c.globalAlpha = 1;
    }
    /* корпус */
    plateDraw(c, [
      [-W * .44, torsoTop + H * .07], [W * .44, torsoTop + H * .07],
      [W * .34, hipY - s * .1], [-W * .34, hipY - s * .1]
    ], ch, true);
    /* рёбра-ламели */
    c.fillStyle = col.dk; c.globalAlpha = .55;
    for (let i = 0; i < 3; i++) c.fillRect(-W * .28, torsoTop + H * (.2 + i * .09), W * .56, s * .045);
    c.globalAlpha = 1;
    /* реактор в груди */
    if (ch.mut.trim === 'glow' || ch.bodyIdx === 1) {
      const cy = torsoTop + H * .3, r = s * .15;
      c.save(); c.globalCompositeOperation = 'lighter';
      GD.Glow.blit(c, 'core', col.glowReactor, 0, cy, r * 3, .7 + Math.sin(t * 5) * .2);
      c.restore();
    }
    /* броня/шипы */
    if (ch.armorLv >= 2) plateDraw(c, [[-W * .5, torsoTop + H * .06], [W * .5, torsoTop + H * .06], [W * .42, torsoTop + H * .19], [-W * .42, torsoTop + H * .19]], ch);
    if (ch.spikes) spikesDraw(c, 0, torsoTop + H * .07, W * .8, s * .3, 3, ch);
    /* плечи + руки + оружие */
    const shY = torsoTop + H * .1;
    const sway = Math.sin(gait) * s * .06;
    for (const sd of [-1, 1]) {
      c.fillStyle = col.lo;
      c.beginPath(); c.ellipse(sd * W * .48, shY, s * .17, s * .13, 0, 0, TAU); c.fill();
      arm(c, sd * W * .48, shY, sd * W * .3, shY + H * .24 + sway * sd, s * .13, ch);
    }
    /* голова */
    const hy = torsoTop - H * .02;
    c.fillStyle = col.dk; c.fillRect(-s * .06, torsoTop - s * .1, s * .12, s * .12);
    const hw = s * .3, hh = s * .34;
    if (ch.head === 0) { /* череп T-800 */
      c.fillStyle = col.mid; c.beginPath();
      c.moveTo(-hw, hy - hh * .2); c.quadraticCurveTo(-hw, hy - hh, 0, hy - hh);
      c.quadraticCurveTo(hw, hy - hh, hw, hy - hh * .2);
      c.lineTo(hw * .7, hy + hh * .55); c.lineTo(-hw * .7, hy + hh * .55); c.closePath(); c.fill();
      c.strokeStyle = col.out; c.lineWidth = 1; c.stroke();
      c.fillStyle = col.dk; c.fillRect(-hw * .74, hy - hh * .05, hw * 1.48, hh * .3);
      c.fillStyle = col.lo;
      for (let i = -1; i <= 1; i += 2) c.fillRect(i * hw * .3, hy + hh * .3, hw * .18, hh * .2);
    } else if (ch.head === 1) { /* купол */
      c.fillStyle = col.mid; c.beginPath(); c.arc(0, hy - hh * .1, hw, Math.PI, 0); c.lineTo(hw, hy + hh * .3); c.lineTo(-hw, hy + hh * .3); c.closePath(); c.fill();
      c.strokeStyle = col.out; c.lineWidth = 1; c.stroke();
    } else if (ch.head === 2) { /* угловатый */
      plateDraw(c, [[-hw, hy - hh * .7], [hw, hy - hh * .7], [hw * 1.15, hy + hh * .3], [0, hy + hh * .6], [-hw * 1.15, hy + hh * .3]], ch);
    } else if (ch.head === 3) { /* сенсорный барабан */
      c.fillStyle = col.lo; gfx.rr(c, -hw, hy - hh * .6, hw * 2, hh * 1.1, 3); c.fill();
      c.strokeStyle = col.out; c.stroke();
      c.fillStyle = col.dk; for (let i = 0; i < 3; i++) c.fillRect(-hw, hy - hh * .5 + i * hh * .35, hw * 2, 1.2);
    } else { /* снайперский визор */
      c.fillStyle = col.mid; gfx.rr(c, -hw * 1.1, hy - hh * .55, hw * 2.2, hh * .95, hh * .4); c.fill();
      c.strokeStyle = col.out; c.stroke();
    }
    EYE.draw(c, ch, 0, hy - hh * .12, s * .07, t, ch.eyes, ch.eyeStyle);
    /* антенна */
    if (ch.antenna) {
      c.strokeStyle = col.hi; c.lineWidth = 1;
      const ax = ch.antenna === 1 ? hw * .8 : 0, al = s * (.3 + ch.antenna * .12);
      c.beginPath(); c.moveTo(ax, hy - hh * .8); c.lineTo(ax + Math.sin(t * 3) * 2, hy - hh * .8 - al); c.stroke();
      c.fillStyle = col.trim; c.beginPath(); c.arc(ax + Math.sin(t * 3) * 2, hy - hh * .8 - al, 1.4 + Math.sin(t * 8) * .5, 0, TAU); c.fill();
    }
    weaponDraw(c, ch, 0, shY + H * .2, s * .9, t);
    c.restore();
  }

  /* ---- паук/многоножка ---- */
  function drawQuad(c, ch, s, p, t) {
    const col = ch.col, n = ch.legs, W = s * 1.05, H = s * .78;
    const gait = p * TAU;
    const bodyY = -s * .62;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, k = Math.floor(i / 2), f = n <= 4 ? k / 1 : k / 2;
      const a0 = -1.05 + f * 1.0 + (side > 0 ? 0 : 0);
      const sw = Math.sin(gait + i * (TAU / n) * 1.6) * .42;
      const cox = side * W * (.22 + f * .12), coy = bodyY + (f - .5) * H * .3;
      const kneeA = a0 * side + side * (.5 + sw);
      const kx = cox + Math.cos(kneeA) * side * s * .5 * Math.abs(side), ky = coy - Math.abs(Math.sin(kneeA)) * s * .34;
      const fx = cox + Math.cos(kneeA) * side * s * .82, fy = 0;
      leg(c, cox, coy, kx, ky, s * .13, ch);
      leg(c, kx, ky, fx, fy, s * .1, ch);
      c.fillStyle = col.dk; c.beginPath(); c.arc(fx, fy, s * .07, 0, TAU); c.fill();
    }
    /* тело */
    c.save(); c.translate(0, bodyY);
    const g = GD.lin(c, 0, -H * .6, 0, H * .6, [[0, col.hi], [.55, col.mid], [1, col.dk]]);
    c.fillStyle = g;
    c.beginPath(); c.ellipse(0, 0, W * .62, H * .52, 0, 0, TAU); c.fill();
    c.strokeStyle = col.out; c.lineWidth = 1.1; c.stroke();
    /* сегментированная спина */
    c.strokeStyle = col.dk; c.lineWidth = 1.4; c.globalAlpha = .7;
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.ellipse(0, 0, W * .62 * Math.abs(i / 3 + .001) * .9, H * .5, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
    c.globalAlpha = 1;
    if (ch.spikes) spikesDraw(c, 0, -H * .42, W * .7, s * .26, 4, ch);
    /* броневые щиты */
    if (ch.armorLv >= 2) { c.fillStyle = col.lo; gfx.rr(c, -W * .34, -H * .4, W * .68, H * .4, 3); c.fill(); c.strokeStyle = col.out; c.stroke(); }
    /* глаза вперёд (вниз по экрану) */
    c.save(); c.translate(0, H * .3);
    EYE.draw(c, ch, 0, 0, s * .075, t, Math.max(2, ch.eyes + 1), ch.eyeStyle);
    c.restore();
    /* жвалы */
    c.strokeStyle = col.trim; c.lineWidth = 2; c.lineCap = 'round';
    const fb = Math.sin(t * 7) * .25;
    for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * s * .16, H * .45); c.quadraticCurveTo(sd * s * .3, H * .7 + fb * s, sd * s * .1, H * .82); c.stroke(); }
    c.restore();
    weaponDraw(c, ch, 0, bodyY - H * .3, s * .8, t);
    if (ch.tail) { c.strokeStyle = col.dk; c.lineWidth = s * .08; c.beginPath(); c.moveTo(0, bodyY + H * .3); c.quadraticCurveTo(Math.sin(t * 4) * s * .4, bodyY + H * .9, Math.sin(t * 4) * s * .7, bodyY + H * 1.1); c.stroke(); }
  }

  /* ---- гусеничная техника (вид спереди) ---- */
  function drawTread(c, ch, s, p, t) {
    const col = ch.col, W = s * 1.5, H = s * 1.0, trackW = s * .34;
    const roll = p * 6;
    /* гусеницы */
    for (const sd of [-1, 1]) {
      const x = sd * W * .5 - trackW / 2;
      c.fillStyle = col.out; gfx.rr(c, x, -H * .42, trackW, H * .5, trackW * .45); c.fill();
      c.save(); gfx.rr(c, x, -H * .42, trackW, H * .5, trackW * .45); c.clip();
      gfx.teeth(c, x, -H * .42, trackW, H * .5, 5, col.lo, (roll * sd) % 1);
      c.restore();
      c.fillStyle = col.dk; c.beginPath(); c.arc(sd * W * .5, H * .06, trackW * .34, 0, TAU); c.fill();
      c.fillStyle = col.trim; c.globalAlpha = .6; c.beginPath(); c.arc(sd * W * .5, H * .06, trackW * .12, 0, TAU); c.fill(); c.globalAlpha = 1;
    }
    /* корпус */
    plateDraw(c, [[-W * .42, -H * .34], [W * .42, -H * .34], [W * .34, H * .04], [-W * .34, H * .04]], ch, true);
    /* наклонная верхняя плита */
    plateDraw(c, [[-W * .3, -H * .62], [W * .3, -H * .62], [W * .42, -H * .3], [-W * .42, -H * .3]], ch);
    if (ch.armorLv >= 2) { c.fillStyle = col.lo; for (let i = -1; i <= 1; i += 2) c.fillRect(i * W * .3 - 2.5, -H * .28, 5, H * .3); }
    if (ch.spikes) spikesDraw(c, 0, -H * .62, W * .6, s * .26, 5, ch);
    /* рубка */
    c.fillStyle = col.mid; gfx.rr(c, -W * .22, -H * .92, W * .44, H * .34, 3); c.fill();
    c.strokeStyle = col.out; c.stroke();
    /* дуло на камеру */
    const rec = Math.sin(t * 3) * 1.2;
    c.fillStyle = col.dk; c.beginPath(); c.arc(0, -H * .74 + rec * .2, s * .2, 0, TAU); c.fill();
    c.fillStyle = col.out; c.beginPath(); c.arc(0, -H * .74 + rec * .2, s * .12, 0, TAU); c.fill();
    c.fillStyle = col.trim; c.globalAlpha = .5 + Math.sin(t * 6) * .2; c.beginPath(); c.arc(0, -H * .74 + rec * .2, s * .06, 0, TAU); c.fill(); c.globalAlpha = 1;
    /* зенитный пулемёт / доп. оружие */
    if (ch.shoulder === 1) weaponDraw(c, ch, -W * .34, -H * .5, s * .7, t);
    if (ch.pipes) { c.fillStyle = col.dk; for (let i = 0; i < ch.pipes; i++) { c.fillRect(W * .24 + i * 4, -H * .92 - 6, 3, 8); c.fillStyle = 'rgba(150,150,160,0.35)'; c.beginPath(); c.arc(W * .25 + i * 4, -H * .98 - 6 - Math.sin(t * 3 + i) * 2, 2.6, 0, TAU); c.fill(); c.fillStyle = col.dk; } }
    EYE.draw(c, ch, 0, -H * .5, s * .07, t, ch.eyes, ch.eyeStyle);
  }

  /* ---- ховер-платформа ---- */
  function drawHover(c, ch, s, p, t) {
    const col = ch.col, W = s * 1.2, H = s * .82;
    const bob = Math.sin(t * 2.2 * ch.wobble) * s * .08;
    c.save(); c.translate(0, -s * .5 + bob);
    /* энергетические щупальца */
    c.strokeStyle = col.trim; c.globalAlpha = .35; c.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + t * 1.4;
      c.beginPath(); c.moveTo(Math.cos(a) * W * .3, H * .3);
      c.quadraticCurveTo(Math.cos(a) * W * .45, H * .55, Math.cos(a + 1) * W * .28, H * .78); c.stroke();
    }
    c.globalAlpha = 1;
    /* корпус-диск */
    const g = GD.lin(c, 0, -H * .6, 0, H * .5, [[0, col.hi], [.5, col.mid], [1, col.dk]]);
    c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, W * .55, H * .42, 0, 0, TAU); c.fill();
    c.strokeStyle = col.out; c.lineWidth = 1.1; c.stroke();
    /* верхний купол */
    c.fillStyle = col.lo; c.beginPath(); c.ellipse(0, -H * .22, W * .26, H * .3, 0, Math.PI, 0); c.fill();
    c.strokeStyle = col.out; c.stroke();
    /* силовые дуги снизу */
    const pl = .55 + Math.sin(t * 6) * .25;
    c.save(); c.globalCompositeOperation = 'lighter';
    GD.Glow.pool(c, 'soft', col.glowReactor, 0, H * .38, W * .6, H * .3, pl);
    c.restore();
    /* боковые пилоны */
    for (const sd of [-1, 1]) {
      c.fillStyle = col.dk; gfx.rr(c, sd * W * .5 - 3, -H * .1, 6, H * .42, 2); c.fill();
      if (ch.shoulder) { c.fillStyle = col.trim; c.globalAlpha = pl; c.beginPath(); c.arc(sd * W * .5, H * .34, 2.2, 0, TAU); c.fill(); c.globalAlpha = 1; }
    }
    if (ch.armorLv >= 2) { c.strokeStyle = col.hi; c.lineWidth = 1.6; c.beginPath(); c.ellipse(0, 0, W * .62, H * .48, 0, Math.PI * .05, Math.PI * .95); c.stroke(); }
    if (ch.antenna) { c.strokeStyle = col.hi; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -H * .5); c.lineTo(0, -H * .95); c.stroke(); c.fillStyle = col.trim; c.beginPath(); c.arc(0, -H, 1.6, 0, TAU); c.fill(); }
    EYE.draw(c, ch, 0, H * .02, s * .075, t, ch.eyes, ch.eyeStyle);
    c.restore();
    weaponDraw(c, ch, 0, -s * .5 + bob + H * .3, s * .7, t);
  }

  /* ---- дрон (воздушный) ---- */
  function drawDrone(c, ch, s, p, t) {
    const col = ch.col, W = s * 1.25, H = s * .8;
    const bob = Math.sin(t * 3.4 * ch.wobble) * s * .12;
    const tilt = Math.sin(p * TAU * .5) * .12;
    c.save(); c.translate(0, -s * .95 + bob); c.rotate(tilt);
    /* роторы */
    for (let i = 0; i < ch.rotors; i++) {
      const rx = (i - (ch.rotors - 1) / 2) * (ch.rotors === 2 ? W * .42 : W * .3);
      c.strokeStyle = 'rgba(200,230,255,0.4)'; c.lineWidth = 1;
      c.beginPath(); c.ellipse(rx, -H * .2, W * .22, H * .09, 0, 0, TAU); c.stroke();
      c.save(); c.translate(rx, -H * .2); c.rotate(t * 26 + i);
      c.fillStyle = 'rgba(190,215,240,0.65)';
      for (const a of [0, Math.PI]) { c.save(); c.rotate(a); c.beginPath(); c.ellipse(W * .1, 0, W * .11, H * .032, 0, 0, TAU); c.fill(); c.restore(); }
      c.restore();
      c.fillStyle = col.dk; c.beginPath(); c.arc(rx, -H * .2, 2.2, 0, TAU); c.fill();
    }
    /* крылья */
    c.fillStyle = col.lo;
    c.beginPath(); c.moveTo(-W * .5, 0); c.lineTo(-W * .18, -H * .12); c.lineTo(-W * .18, H * .12); c.lineTo(-W * .42, H * .2); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(W * .5, 0); c.lineTo(W * .18, -H * .12); c.lineTo(W * .18, H * .12); c.lineTo(W * .42, H * .2); c.closePath(); c.fill();
    c.strokeStyle = col.out; c.lineWidth = 1; c.stroke();
    /* фюзеляж */
    const g = GD.lin(c, 0, -H * .4, 0, H * .5, [[0, col.hi], [.6, col.mid], [1, col.dk]]);
    c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, W * .22, H * .44, 0, 0, TAU); c.fill();
    c.strokeStyle = col.out; c.stroke();
    /* подвесное вооружение */
    if (ch.weapon === 'missile') { c.fillStyle = col.dk; for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(sd * W * .26, H * .22, 3.2, H * .16, 0, 0, TAU); c.fill(); } }
    else { c.fillStyle = col.dk; c.fillRect(-2, H * .2, 4, H * .3); }
    /* гондола-камера */
    c.fillStyle = col.dk; c.beginPath(); c.arc(0, H * .3, s * .13, 0, TAU); c.fill();
    EYE.draw(c, ch, 0, H * .3, s * .06, t, 1, ch.eyeStyle);
    if (ch.spikes) spikesDraw(c, 0, -H * .42, W * .3, s * .2, 3, ch);
    c.restore();
  }

  /* ---- орб/бомбер ---- */
  function drawOrb(c, ch, s, p, t) {
    const col = ch.col, R = s * .62;
    const bob = Math.sin(t * 2.6 * ch.wobble) * s * .1;
    c.save(); c.translate(0, -s * .72 + bob);
    const spin = p * TAU * .6;
    /* ореол */
    const pl = .5 + Math.abs(Math.sin(t * 4)) * .5;
    c.save(); c.globalCompositeOperation = 'lighter';
    GD.Glow.blit(c, 'soft', 'rgba(255,140,40,0.75)', 0, 0, R * 2.1, pl * .8);
    c.restore();
    /* сегментированные пластины */
    for (let i = 0; i < 6; i++) {
      const a = spin + i / 6 * TAU;
      c.save(); c.rotate(a); c.translate(0, -R * .62);
      c.fillStyle = i % 2 ? col.mid : col.lo;
      gfx.rr(c, -R * .34, -R * .2, R * .68, R * .42, 2.4); c.fill();
      c.strokeStyle = col.out; c.lineWidth = .9; c.stroke();
      c.restore();
    }
    /* ядро */
    const g = GD.rad(c, -R * .2, -R * .2, 0, 0, 0, R * .8, [[0, col.hi], [1, col.dk]]);
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, R * .62, 0, TAU); c.fill();
    c.strokeStyle = col.out; c.lineWidth = 1.2; c.stroke();
    /* кольцо-индикатор */
    c.strokeStyle = col.trim; c.globalAlpha = pl; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, R * .82, spin, spin + 4.4); c.stroke(); c.globalAlpha = 1;
    EYE.draw(c, ch, 0, R * .18, s * .07, t, ch.eyes, 1);
    if (ch.antenna) { c.strokeStyle = col.hi; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -R * .9); c.lineTo(0, -R * 1.5); c.stroke(); }
    c.restore();
  }

  /* ---- ХАЛК / БОСС ---- */
  function drawHulk(c, ch, s, p, t, hp) {
    const col = ch.col, H = s * 1.5, W = s * 1.15;
    const gait = p * TAU, l1 = Math.sin(gait), l2 = Math.sin(gait + Math.PI);
    const bob = Math.abs(Math.sin(gait)) * H * .035;
    c.save(); c.translate(0, -bob);
    /* ноги */
    for (const [sd, sw] of [[-1, l1], [1, l2]]) {
      const hx = sd * W * .26, kneeX = sd * W * (.55 + sw * .1), kneeY = -H * .12;
      leg(c, hx, -H * .3, kneeX, kneeY, s * .27, ch);
      leg(c, kneeX, kneeY, sd * W * (.36 + sw * .12), 0 - Math.max(0, sw) * s * .1, s * .21, ch);
      c.fillStyle = col.dk; c.fillRect(sd * W * .36 - s * .24, -s * .12, s * .48, s * .14);
    }
    /* таз */
    plateDraw(c, [[-W * .38, -H * .36], [W * .38, -H * .36], [W * .3, -H * .16], [-W * .3, -H * .16]], ch);
    const torsoTop = -H * .92;
    /* корпус трапеция */
    plateDraw(c, [[-W * .62, torsoTop + H * .1], [W * .62, torsoTop + H * .1], [W * .4, -H * .32], [-W * .4, -H * .32]], ch, true);
    /* реактор */
    const cy = torsoTop + H * .34, pulse = .6 + Math.sin(t * 4) * .3;
    const gg = c.createRadialGradient(0, cy, 0, 0, cy, s * .55);
    gg.addColorStop(0, '#fff'); gg.addColorStop(.25, col.glowReactor); gg.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = pulse; c.fillStyle = gg; c.beginPath(); c.arc(0, cy, s * .55, 0, TAU); c.fill(); c.globalAlpha = 1;
    c.fillStyle = col.dk; c.beginPath(); c.arc(0, cy, s * .16, 0, TAU); c.fill();
    /* рёбра */
    c.fillStyle = col.dk; c.globalAlpha = .5;
    for (let i = 0; i < 4; i++) c.fillRect(-W * .4, torsoTop + H * (.16 + i * .07), W * .8, s * .05);
    c.globalAlpha = 1;
    /* наплечники с оружием */
    const shY = torsoTop + H * .13;
    for (const [sd, sw] of [[-1, l2], [1, l1]]) {
      c.save();
      c.fillStyle = col.mid; gfx.rr(c, sd * W * .52 - s * .24, shY - s * .2, s * .48, s * .4, 4); c.fill();
      c.strokeStyle = col.out; c.lineWidth = 1.1; c.stroke();
      if (ch.spikes) spikesDraw(c, sd * W * .52, shY - s * .2, s * .34, s * .3, 3, ch);
      weaponDraw(c, ch, sd * W * .52, shY + s * .16, s * 1.0, t);
      arm(c, sd * W * .5, shY + s * .18, sd * W * (.3 + sw * .04), shY + H * .3, s * .16, ch);
      c.restore();
    }
    /* труба/выхлоп */
    if (ch.pipes) for (let i = 0; i < ch.pipes; i++) {
      const px = (i - (ch.pipes - 1) / 2) * 7;
      c.fillStyle = col.dk; c.fillRect(px - 2, torsoTop - s * .28, 4, s * .3);
      c.fillStyle = 'rgba(170,170,180,0.3)';
      c.beginPath(); c.arc(px, torsoTop - s * .34 - (t * 20 % 12), 2.4 + (t * 6 % 4), 0, TAU); c.fill();
    }
    /* голова + сенсорная панель */
    const hy = torsoTop - s * .16, hw = s * .3;
    c.fillStyle = col.mid;
    gfx.rr(c, -hw, hy - s * .2, hw * 2, s * .42, 3); c.fill();
    c.strokeStyle = col.out; c.stroke();
    c.fillStyle = col.dk; c.fillRect(-hw * .9, hy + s * .1, hw * 1.8, s * .1);
    EYE.draw(c, ch, 0, hy, s * .075, t, Math.max(3, ch.eyes), 1);
    /* второй датчик-«головы» */
    if (ch.head === 4) { for (const sd of [-1, 1]) { c.fillStyle = col.lo; gfx.rr(c, sd * hw * 1.2 - 3, hy - 4, 6, 8, 2); c.fill(); c.fillStyle = col.eye; c.globalAlpha = .8; c.beginPath(); c.arc(sd * hw * 1.2, hy, 1.6, 0, TAU); c.fill(); c.globalAlpha = 1; } }
    c.restore();
  }

  const BODY = { biped: drawBiped, quad: drawQuad, tread: drawTread, hover: drawHover, drone: drawDrone, orb: drawOrb, hulk: drawHulk };

  /* =================== КЛАСС ВРАГА =================== */
  class Enemy {
    constructor() { this.dead = false; }
    init(def, chassis, game, scale, laneOff) {
      const a = ARCH[def];
      this.a = a; this.ch = chassis; this.game = game;
      this.maxHp = Math.round(a.hp * scale.hp);
      this.hp = this.maxHp;
      this.armor = a.armor * scale.armor;
      this.baseSpd = a.spd * scale.spd;
      this.size = a.size * (chassis.sizeK || 1) * (game ? game.scaleU : 1);
      this.bounty = Math.round(a.bounty * scale.bounty);
      this.leak = Math.round(a.leak * scale.leak);
      this.air = !!a.air; this.boss = !!a.boss; this.suicide = !!a.suicide;
      this.shieldA = a.shieldA || 0; this.healer = !!a.heal;
      this.atkCd = a.atk ? 1 / a.atk : 0; this.atkTimer = rnd(.6, 1.9);
      this.d = -rnd(0, 8); this.pose = rnd(0, 1); this.t = rnd(0, 10);
      this.lane = laneOff; this.x = 0; this.y = -40; this.prevY = -40; this.speedNow = 0;
      this.flash = 0; this.hitT = 0; this.slowT = 0; this.slowK = 1; this.burnT = 0; this.burnDps = 0;
      this.stunT = 0; this.dead = false; this.scalled = false; this.phase = 0; this.special = 0;
      this.hurtStack = 0;
      return this;
    }
    get ratio() { return this.hp / this.maxHp; }
    get shielded() { return this._shieldT > 0; }

    damage(amount, opts) {
      if (this.dead) return 0;
      opts = opts || {};
      let dmg = amount;
      if (!opts.pierce) dmg = Math.max(amount * .25, amount - this.armor);
      if (this._shieldT > 0 && !opts.emp) dmg *= (1 - (this._shieldSrc || this.shieldA || .3));
      if (opts.bonusVsAir && this.air) dmg *= 1.35;
      this.hp -= dmg;
      this.flash = 1; this.hurtStack = 1;
      if (!opts.silent) {
        GD.FX.text(this.x + rnd(-6, 6), this.y - this.size * .6, Math.round(dmg), opts.col || '#fff', opts.big ? 15 : 10.5);
        GD.Audio.SFX.hit(this.x);
      }
      if (this.hp <= 0) this.die(opts);
      return dmg;
    }
    heal(v) { if (this.dead) return; this.hp = Math.min(this.maxHp, this.hp + v); GD.FX.text(this.x, this.y - this.size * .7, '+' + Math.round(v), '#7dff9d', 9.5); }
    slow(k, t) { if (this.dead) return; this.slowK = Math.min(this.slowK, k); this.slowT = Math.max(this.slowT, t); }
    burn(dps, t) { if (this.dead) return; this.burnDps = Math.max(this.burnDps, dps); this.burnT = Math.max(this.burnT, t); }
    stun(t) { if (this.dead) return; this.stunT = Math.max(this.stunT, t); }

    die(opts) {
      if (this.dead) return;
      this.dead = true;
      const g = this.game, col = this.ch.col;
      const r = this.size * (this.boss ? 3.2 : this.suicide ? 2.2 : 1.15);
      GD.FX.explode(this.x, this.y - this.size * .4, r, col.glowReactor, '#fff0c8');
      GD.FX.shards(this.x, this.y - this.size * .5, this.boss ? 40 : Math.round(this.size * .8), col.mid, this.size * 9);
      GD.FX.smoke(this.x, this.y - this.size * .5, this.boss ? 26 : 8, 'rgba(50,46,44,.85)', this.size * 1.4, 1.5);
      /* след на земле: плоская ударная волна пыли + подпалина у крупных */
      if ((GD.q == null ? 1 : GD.q) > .4) {
        GD.FX.dust(this.x, this.y, this.size * (this.boss ? 6 : 2.5), 'rgba(216,204,184,0.42)', .5);
        if (this.boss || this.suicide || this.size > 17) GD.FX.scorch(this.x, this.y, this.size * (this.boss ? 2.4 : 1.15));
      }
      if (this.suicide) {
        GD.FX.ring(this.x, this.y, this.size * 4.5, '#ffb347', .5);
        GD.FX.flash('rgba(255,150,60,0.5)', .5); GD.FX.shake(9);
        GD.Audio.SFX.bigBoom(this.x);
        g.aoeDamage(this.x, this.y, this.size * 3.4, this.maxHp * .5, true);
      } else if (this.boss) {
        GD.FX.flash('rgba(255,120,40,0.55)', .7); GD.FX.shake(20); GD.Audio.SFX.bigBoom(this.x);
        for (let i = 0; i < 7; i++) setTimeout(() => { if (!g.over) GD.FX.explodeBig(this.x + rnd(-40, 40), this.y + rnd(-40, 40), rnd(14, 26)); }, i * 130);
      } else GD.Audio.SFX.boom(this.size / 18, this.x);
      g.onKill(this);
    }

    update(dt, g) {
      if (this.dead) return;
      this.t += dt;
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5.5);
      if (this.hurtStack > 0) this.hurtStack = Math.max(0, this.hurtStack - dt * 3);
      /* статусы */
      if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowK = 1; }
      if (this.burnT > 0) {
        this.burnT -= dt; this.hp -= this.burnDps * dt;
        if (Math.random() < dt * 22) GD.FX.flame(this.x + rnd(-this.size * .3, this.size * .3), this.y - this.size * .5, 1, '#ff7a1e', 26);
        if (this.hp <= 0) { this.die({}); return; }
      }
      if (this.stunT > 0) { this.stunT -= dt; this.speedNow = 0; this.pose += dt * .2; return; }
      /* лечение от ремботов / щиты от щитоносцев — считает игра */
      let spd = this.baseSpd * this.slowK;
      if (this.boss) {
        /* босс периодически останавливается и стреляет */
        this.special -= dt;
        if (this.special <= 0) { this.stunT = Math.max(this.stunT, .9); this.special = 3.4; if (g.state === 'wave') g.bossVolley(this); }
      }
      this.speedNow = spd;
      this.prevY = this.y;
      this.d += spd * dt;
      const pt = g.pathAt(this.d, this.lane);
      this.x = pt.x; this.y = pt.y;
      this.pose += dt * (spd / 34) * (this.ch.gait || 1);
      /* выстрел по турелям */
      if (this.a.atk && g.state === 'wave') {
        this.atkTimer -= dt;
        if (this.atkTimer <= 0) {
          /* выстрел состоялся — полная пауза; цели нет (далеко) — короткая выдержка */
          this.atkTimer = g.enemyShoot(this) ? 1 / this.a.atk : .45 + Math.random() * .5;
        }
      }
      /* рембот лечит */
      if (this.healer) {
        this.atkTimer -= dt;
        if (this.atkTimer <= 0) { this.atkTimer = 1.1; g.healNearby(this); }
      }
      /* достиг базы */
      if (this.d >= g.pathTotal) { g.leak(this); }
      /* дым при повреждениях */
      if (this.ratio < .45 && Math.random() < dt * 12) {
        GD.FX.smoke(this.x + rnd(-4, 4), this.y - this.size * .7, 1, 'rgba(40,40,44,.6)', 12, 1.1);
        if (this.ratio < .2 && Math.random() < dt * 6) GD.FX.flame(this.x, this.y - this.size * .6, 1, '#ff9a2e', 30);
      }
      /* пыль из-под ног — «приземляет» роботов на рельеф (только среднее+ качество) */
      const q = GD.q == null ? 1 : GD.q;
      if (q > .6 && spd > 6 && !this.air) {
        this.stepT = (this.stepT || 0) - spd * dt;
        if (this.stepT <= 0) {
          this.stepT = this.size * 1.5;
          const bh = g.biome ? g.biome.groundHue : 30;
          const dcol = hsl(bh, 24, 72, .3);
          GD.FX.dust(this.x + rnd(-2, 2), this.y + this.size * .06, this.size * .5, dcol, .38);
          if (Math.random() < .55) GD.FX.p(this.x + rnd(-3, 3), this.y, rnd(-10, 10), rnd(-16, -4), .4, 1.5, dcol, {});
        }
      } else if (q > .6 && this.air) {
        /* ховер: струя воздуха под корпусом */
        this.stepT = (this.stepT || 0) - dt;
        if (this.stepT <= 0) {
          this.stepT = .12;
          GD.FX.p(this.x + rnd(-this.size * .4, this.size * .4), this.y + this.size * .2, rnd(-14, 14), rnd(6, 18), .3, 1.8, 'rgba(200,225,255,0.35)', {});
        }
      }
    }

    draw(c, g) {
      const s = this.size, ch = this.ch, hp = this.ratio;
      c.save();
      c.translate(this.x, this.y);
      /* тень */
      c.save(); c.translate(0, 1); shadow(c, s * .62); c.restore();
      /* прицельная рамка для боссов */
      if (this.boss) {
        c.strokeStyle = 'rgba(255,60,40,0.75)'; c.lineWidth = 1.6;
        const rr = s * .95 + Math.sin(this.t * 3) * 2;
        for (let i = 0; i < 4; i++) {
          c.save(); c.rotate(i * Math.PI / 2 + Math.PI / 4);
          c.beginPath(); c.arc(0, 0, rr, -.4, .4); c.stroke(); c.restore();
        }
      }
      /* щит */
      if (this.shielded) {
        const a = .3 + Math.sin(this.t * 6) * .12;
        c.strokeStyle = ch.col.glowReactor; c.globalAlpha = a; c.lineWidth = 2;
        c.beginPath(); c.arc(0, -s * .55, s * .95, 0, TAU); c.stroke();
        c.globalAlpha = a * .28; c.fillStyle = ch.col.glowReactor;
        c.beginPath(); c.arc(0, -s * .55, s * .95, 0, TAU); c.fill(); c.globalAlpha = 1;
      }
      const bodyFn = BODY[ch.body] || drawBiped;
      c.save();
      if (this.slowT > 0 && this.slowK < .8) {
        c.shadowColor = '#6fd8ff'; c.shadowBlur = 8;
      }
      bodyFn(c, ch, s, this.pose % 1, this.t, hp);
      c.restore();
      /* подсветка замедления — иней */
      if (this.slowT > 0 && this.slowK < .8) {
        c.globalAlpha = .3; c.fillStyle = '#bff0ff';
        c.beginPath(); c.arc(0, -s * .5, s * .55, 0, TAU); c.fill(); c.globalAlpha = 1;
      }
      /* вспышка попадания */
      if (this.flash > 0) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = this.flash * .65;
        c.fillStyle = '#fff';
        c.beginPath(); c.ellipse(0, -s * .55, s * .48, s * .7, 0, 0, TAU); c.fill();
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      }
      /* полоска здоровья */
      if (!this.boss) {
        const w = Math.max(16, s * 1.15), y = -s * 1.28;
        if (hp < .999) {
          c.fillStyle = 'rgba(0,0,0,0.62)'; gfx.rr(c, -w / 2 - 1, y - 1, w + 2, 4.4, 2); c.fill();
          c.fillStyle = hp > .6 ? '#5cff9a' : hp > .3 ? '#ffd166' : '#ff5a4a';
          gfx.rr(c, -w / 2, y, w * hp, 2.6, 1.4); c.fill();
          if (this.armor > 6) { c.fillStyle = '#8fd0ff'; c.fillRect(-w / 2 - 4, y, 2, 3); }
        }
      }
      c.restore();
    }
  }

  GD.Enemies = { ARCH, Enemy, variantsForLevel, makeChassis, BODY };
})(window.GD);
