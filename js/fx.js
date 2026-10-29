/* ============ FX: частицы, взрывы, декали, тряска, тексты ============ */
(function (GD) {
  'use strict';
  const { rnd, TAU, clamp, fmt } = GD;

  const MAXP = 900;
  const P = [];
  const TXT = [];
  const WAV = [];
  const ARCS = [];

  let dpr = 1, VW = 400, VH = 700;
  let dec = null, dctx = null;
  let shakeMag = 0, shakeX = 0, shakeY = 0, shakeT = 0;
  let flashCol = null, flashA = 0;
  let quality = 1, decT = 0;

  function alloc(w, h, ratio) {
    dpr = ratio || 1; VW = w; VH = h;
    dec = document.createElement('canvas');
    dec.width = Math.max(2, Math.floor(w * dpr)); dec.height = Math.max(2, Math.floor(h * dpr));
    dctx = dec.getContext('2d');
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function clearDecals() { if (dctx) { dctx.save(); dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.clearRect(0, 0, dec.width, dec.height); dctx.restore(); } }

  function spawn(o) {
    /* потолок частиц зависит от качества: на слабых телефонах меньше, но не в ноль */
    const cap = quality >= 1 ? MAXP : Math.max(110, Math.round(MAXP * quality));
    if (P.length >= cap) {
      /* подменяем самую старую частицу вместо создания новой */
      if (P.length > cap * .98) return null;
    }
    /* защита от NaN — иначе канвас роняет весь цикл отрисовки */
    if (!(o.x === o.x && o.y === o.y && o.size === o.size) || !(o.vx === o.vx && o.vy === o.vy)) return null;
    P.push(o); return o;
  }

  const FX = {
    init: alloc,
    setQuality(q) { quality = q; },
    reset() { P.length = 0; TXT.length = 0; WAV.length = 0; ARCS.length = 0; shakeMag = 0; flashA = 0; clearDecals(); },

    get count() { return P.length; },

    /* --- базовая частица --- */
    p(x, y, vx, vy, life, size, col, opt) {
      opt = opt || {};
      return spawn({
        x, y, vx, vy, life, t: 0, size, col,
        shape: opt.shape || 'dot', grav: opt.grav || 0, drag: opt.drag == null ? .98 : opt.drag,
        rot: opt.rot || rnd(0, TAU), vr: opt.vr || rnd(-6, 6), grow: opt.grow || 0,
        flick: !!opt.flick, glow: !!opt.glow, alpha: opt.alpha == null ? 1 : opt.alpha,
        sway: opt.sway || 0, swayF: rnd(3, 8)
      });
    },

    /* --- всплеск искр --- */
    sparks(x, y, n, col, spd, ang, spread) {
      n = Math.round(n * quality);
      for (let i = 0; i < n; i++) {
        const a = (ang == null ? rnd(0, TAU) : ang + rnd(-(spread || .6), spread || .6));
        const s = spd * rnd(.35, 1.3);
        FX.p(x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(.18, .45), rnd(1, 2.4), col, { shape: 'spark', grav: 340, drag: .9, glow: true });
      }
    },
    smoke(x, y, n, col, spd, life) {
      n = Math.round(n * quality);
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), s = rnd(.15, 1) * (spd || 22);
        FX.p(x + rnd(-3, 3), y + rnd(-3, 3), Math.cos(a) * s, Math.sin(a) * s - 14, (life || .9) * rnd(.7, 1.4), rnd(5, 12), col || 'rgba(60,60,66,0.75)', { shape: 'smoke', drag: .93, grow: 26, grav: -22, alpha: .7 });
      }
    },
    flame(x, y, n, col, spd, ang) {
      n = Math.round(n * quality);
      for (let i = 0; i < n; i++) {
        const a = (ang == null ? rnd(-2.4, -0.7) : ang + rnd(-.45, .45));
        const s = (spd || 90) * rnd(.4, 1.2);
        FX.p(x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(.22, .5), rnd(3.5, 8), col || '#ff9a2e', { shape: 'flame', drag: .9, grow: 12, grav: -60, glow: true });
      }
    },
    /* --- осколки металла при смерти робота --- */
    shards(x, y, n, col, spd) {
      n = Math.round(n * quality);
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), s = (spd || 150) * rnd(.3, 1.2);
        FX.p(x, y, Math.cos(a) * s, Math.sin(a) * s - 40, rnd(.5, 1.1), rnd(1.8, 4.6), col, { shape: 'shard', grav: 620, drag: .99, rot: rnd(0, TAU), vr: rnd(-14, 14) });
      }
    },
    oil(x, y, r, col) {
      if (!dctx) return;
      const c = dctx;
      c.globalAlpha = .5;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col || 'rgba(10,8,6,0.85)'); g.addColorStop(.6, col ? col.replace(/[\d.]+\)$/, '0.32)') : 'rgba(20,14,8,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r, r * .68, rnd(0, TAU), 0, TAU); c.fill();
      c.globalAlpha = 1;
    },
    crater(x, y, r) {
      if (!dctx) return;
      const c = dctx;
      c.globalAlpha = .55;
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.ellipse(x, y, r, r * .66, 0, 0, TAU); c.fill();
      c.globalAlpha = .3; c.fillStyle = 'rgba(120,90,60,0.6)';
      c.beginPath(); c.ellipse(x, y - r * .12, r * .78, r * .5, 0, 0, TAU); c.fill();
      c.globalAlpha = 1;
    },

    /* --- взрыв --- */
    explode(x, y, r, col, col2) {
      WAV.push({ x, y, r: r * .2, max: r * 2.1, t: 0, life: .38, col: col2 || '#ffd9a0', w: 3.4 });
      FX.flame(x, y, Math.round(r * .7), col || '#ffb830', r * 5.2);
      FX.sparks(x, y, Math.round(r * .9), '#fff2c4', r * 4.6);
      FX.smoke(x, y, Math.round(r * .35), 'rgba(48,44,44,0.8)', r * 1.4, 1.3);
      FX.crater(x, y, r * .5);
    },
    explodeBig(x, y, r) {
      FX.explode(x, y, r, '#ff7a2e', '#fff0c0');
      FX.explode(x + rnd(-r, r), y + rnd(-r, r), r * .7, '#ffd24a');
      FX.shards(x, y, 14, '#9aa3ad', r * 7);
      FX.shake(r * .9);
    },
    /* --- ударная волна --- */
    ring(x, y, r, col, life) { WAV.push({ x, y, r: r * .1, max: r, t: 0, life: life || .34, col: col || '#8fe9ff', w: 2.6 }); },
    /* --- плоская волна по земле: пыль от шагов, прыжков, приземления --- */
    dust(x, y, r, col, life) { WAV.push({ x, y, r: r * .2, max: r, t: 0, life: life || .42, col: col || 'rgba(206,192,168,0.5)', w: 2.4, flat: 1 }); },
    /* --- удар пули: короткая вспышка + пыль/искры (дёшево, по количеству качества) --- */
    impact(x, y, col, s) {
      s = s || 1;
      FX.p(x, y, 0, 0, .1, 3.4 * s, col || '#fff3c8', { shape: 'flame' });
      if (quality > .5) FX.sparks(x, y, 2 * s, col || '#ffe9a8', 70 * s);
    },
    /* --- подпалина/воронка на земле с обугленными краями --- */
    scorch(x, y, r, col) {
      if (!dctx) return;
      const c = dctx;
      c.save();
      c.globalAlpha = .5;
      c.fillStyle = col || 'rgba(14,10,8,0.9)';
      c.beginPath(); c.ellipse(x, y, r, r * .6, rnd(0, TAU), 0, TAU); c.fill();
      c.globalAlpha = .22; c.fillStyle = 'rgba(0,0,0,0.9)';
      for (let i = 0; i < 5; i++) {
        const a = rnd(0, TAU), d = r * rnd(.7, 1.25);
        c.beginPath(); c.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * .6, r * rnd(.16, .38), r * rnd(.1, .24), a, 0, TAU); c.fill();
      }
      c.restore();
    },
    /* --- дуга молнии (визуал) --- */
    arc(x1, y1, x2, y2, col, life, amp, w) { ARCS.push({ x1, y1, x2, y2, col: col || '#bff4ff', t: 0, life: life || .16, amp: amp || 12, w: w || 2.4, seed: Math.random() }); },
    /* --- текстовый всплываш --- */
    text(x, y, s, col, size, vy) { TXT.push({ x, y, s: typeof s === 'number' ? fmt(s) : s, col: col || '#fff', size: size || 12, t: 0, life: .85, vy: vy == null ? -34 : vy, dead: false, vx: rnd(-8, 8) }); },
    shake(mag) { shakeMag = Math.min(26, shakeMag + mag); },
    get shakeX() { return shakeX; },
    get shakeY() { return shakeY; },
    flash(col, a) { flashCol = col; flashA = Math.max(flashA, a == null ? .5 : a); },

    /* =============== UPDATE =============== */
    update(dt) {
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i]; p.t += dt;
        if (p.t >= p.life) { P[i] = P[P.length - 1]; P.pop(); continue; }
        p.vy += p.grav * dt;
        const d = Math.pow(p.drag, dt * 60); p.vx *= d; p.vy *= d;
        if (p.sway) p.vx += Math.sin(p.t * p.swayF) * p.sway * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        if (p.grow) p.size += p.grow * dt;
      }
      for (let i = TXT.length - 1; i >= 0; i--) {
        const t = TXT[i]; t.t += dt; t.y += t.vy * dt; t.x += t.vx * dt; t.vy *= .94;
        if (t.t >= t.life) TXT.splice(i, 1);
      }
      for (let i = WAV.length - 1; i >= 0; i--) { const w = WAV[i]; w.t += dt; if (w.t >= w.life) WAV.splice(i, 1); }
      for (let i = ARCS.length - 1; i >= 0; i--) { const a = ARCS[i]; a.t += dt; if (a.t >= a.life) ARCS.splice(i, 1); }

      /* следы на земле медленно выцветают — карта не зарастает */
      if (dctx && (decT -= dt) <= 0) {
        decT = .3;
        dctx.save(); dctx.setTransform(1, 0, 0, 1, 0, 0);
        dctx.globalCompositeOperation = 'destination-out';
        dctx.fillStyle = 'rgba(0,0,0,0.045)'; dctx.fillRect(0, 0, dec.width, dec.height);
        dctx.restore();
      }

      if (shakeMag > .05) {
        shakeT += dt * 60;
        shakeX = rnd(-shakeMag, shakeMag); shakeY = rnd(-shakeMag, shakeMag);
        shakeMag *= Math.pow(.86, dt * 60);
      } else { shakeMag = 0; shakeX = shakeY = 0; }
      if (flashA > 0) flashA = Math.max(0, flashA - dt * 2.4);
    },

    /* =============== DRAW =============== */
    drawDecals(ctx) { if (dec) { ctx.save(); ctx.globalAlpha = .95; ctx.drawImage(dec, 0, 0, VW, VH); ctx.restore(); } },

    draw(ctx) {
      /* волны */
      for (const w of WAV) {
        const k = w.t / w.life, r = w.r + (w.max - w.r) * (1 - Math.pow(1 - k, 2.2));
        ctx.globalAlpha = (1 - k) * .85;
        ctx.strokeStyle = w.col; ctx.lineWidth = w.w * (1 - k * .7);
        ctx.beginPath();
        if (w.flat) ctx.ellipse(w.x, w.y, r, r * .42, 0, 0, TAU);
        else ctx.arc(w.x, w.y, r, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      /* молнии */
      for (const a of ARCS) {
        const k = 1 - a.t / a.life;
        ctx.globalAlpha = k;
        GD.gfx.bolt(ctx, a.x1, a.y1, a.x2, a.y2, a.amp * k, 6, a.w * k + .6, a.col);
        ctx.globalAlpha = k * .5;
        GD.gfx.bolt(ctx, a.x1, a.y1, a.x2, a.y2, a.amp * k * 1.6, 5, a.w * k * 2.2 + 1, 'rgba(180,240,255,0.5)');
      }
      ctx.globalAlpha = 1;

      /* частицы */
      ctx.save();
      for (let i = 0; i < P.length; i++) {
        const p = P[i], k = p.t / p.life, a = (1 - k) * p.alpha;
        if (a <= .01) continue;
        ctx.globalAlpha = a;
        switch (p.shape) {
          case 'spark': {
            const sp = Math.hypot(p.vx, p.vy) || 1, l = clamp(sp * .022, 2, 14);
            ctx.strokeStyle = p.col; ctx.lineWidth = p.size * .8;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx / sp * l, p.y - p.vy / sp * l); ctx.stroke();
            break;
          }
          case 'smoke': {
            ctx.fillStyle = p.col;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (.6 + k), 0, TAU); ctx.fill();
            break;
          }
          case 'flame': {
            /* спрайт вместо createRadialGradient на каждую частицу */
            GD.Glow.blit(ctx, 'flame', p.col, p.x, p.y, p.size * (1 - k * .55));
            break;
          }
          case 'shard': {
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.col;
            ctx.beginPath(); ctx.moveTo(-p.size, -p.size * .4); ctx.lineTo(p.size * .8, -p.size * .7); ctx.lineTo(p.size * .5, p.size * .6); ctx.closePath(); ctx.fill();
            ctx.restore(); break;
          }
          case 'square': {
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.col; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore(); break;
          }
          default: {
            if (p.glow) {
              GD.Glow.blit(ctx, 'soft', p.col, p.x, p.y, p.size * 3.4);
            }
            ctx.fillStyle = p.col;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
          }
        }
      }
      ctx.restore();

      /* тексты */
      for (const t of TXT) {
        const k = t.t / t.life;
        ctx.globalAlpha = k < .12 ? k / .12 : 1 - Math.pow((k - .12) / .88, 2);
        GD.gfx.text(ctx, t.s, t.x, t.y, t.size * (1 + (1 - Math.min(1, k * 6)) * .5), t.col, 900, 'center', null);
      }
      ctx.globalAlpha = 1;
    },

    get sx() { return shakeX; }, get sy() { return shakeY; },
    drawFlash(ctx) {
      if (flashA <= .001 || !flashCol) return;
      ctx.save(); ctx.globalAlpha = flashA; ctx.fillStyle = flashCol;
      ctx.fillRect(-40, -40, VW + 80, VH + 80); ctx.restore();
    }
  };

  GD.FX = FX;
})(window.GD);
