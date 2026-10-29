/* ============ CORE: RNG, math, draw helpers ============ */
window.GD = window.GD || {};
(function (GD) {
  'use strict';
  const TAU = Math.PI * 2;

  /* ---------- Seeded RNG (mulberry32) ---------- */
  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  class RNG {
    constructor(seed) { this.s = (typeof seed === 'string' ? hashStr(seed) : (seed >>> 0)) || 1; this.s0 = this.s; }
    next() { this.s = (this.s + 0x6D2B79F5) >>> 0; let t = this.s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    float(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return Math.floor(a + (b - a + 1) * this.next()); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    sign() { return this.next() < .5 ? -1 : 1; }
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    weighted(items, wf) { let t = 0; for (const it of items) t += wf(it); let r = this.next() * t; for (const it of items) { r -= wf(it); if (r <= 0) return it; } return items[items.length - 1]; }
    fork(salt) { return new RNG(hashStr(String(this.s0) + '|' + salt)); }
  }

  /* ---------- 1D value noise ---------- */
  function noiseFactory(rng) {
    const N = 256, tab = new Float32Array(N);
    for (let i = 0; i < N; i++) tab[i] = rng.next();
    return function (x) {
      const i = Math.floor(x), f = x - i, a = tab[i & 255], b = tab[(i + 1) & 255];
      const u = f * f * (3 - 2 * f);
      return a + (b - a) * u;
    };
  }
  function fbm(noise, x, oct, gain, lac) {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < (oct || 4); i++) { s += noise(x * f) * amp; norm += amp; amp *= (gain || .5); f *= (lac || 2); }
    return s / norm;
  }

  /* ---------- Math ---------- */
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };
  const dist = (x1, y1, x2, y2) => Math.sqrt(dist2(x1, y1, x2, y2));
  function angLerp(a, b, t) { let d = ((b - a + Math.PI * 3) % TAU) - Math.PI; return a + d * t; }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));

  /* ---------- Color ---------- */
  function hsl(h, s, l, a) { h = ((h % 360) + 360) % 360; return a === undefined ? `hsl(${h},${s}%,${l}%)` : `hsla(${h},${s}%,${l}%,${a})`; }
  function hshift(h, d) { return ((h % 360) + 360) % 360; }
  function mixHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
    const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
    const c = Math.round(lerp(pa & 255, pb & 255, t));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | c).toString(16).slice(1);
  }

  /* ---------- Canvas helpers ---------- */
  const gfx = {
    rr(c, x, y, w, h, r) {
      r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
      c.beginPath();
      c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
    },
    poly(c, pts) {
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.closePath();
    },
    /* irregular blob outline from radius table */
    blob(c, r0, n, jit, seedArr) {
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU - Math.PI / 2;
        const r = r0 * (1 + (seedArr ? seedArr[i % seedArr.length] : 0) * jit);
        const x = Math.cos(a) * r, y = Math.sin(a) * r * .92;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.closePath();
    },
    /* metallic vertical gradient body */
    metal(c, x0, y0, x1, y1, a, b) {
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, a); g.addColorStop(.45, b); g.addColorStop(1, a);
      return g;
    },
    radial(c, x, y, r, c0, c1) {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, c0); g.addColorStop(1, c1); return g;
    },
    /* glow orb */
    glow(c, x, y, r, col, alpha) {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col); g.addColorStop(.45, col.replace(/[\d.]+\)$/, (alpha || .5) * .45 + ')'));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    },
    /* simple bolt between two points */
    bolt(c, x1, y1, x2, y2, amp, seg, w, col) {
      c.strokeStyle = col || '#bfefff'; c.lineWidth = w || 2; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(x1, y1);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      for (let i = 1; i < seg; i++) {
        const t = i / seg, o = (Math.random() - .5) * amp * Math.sin(t * Math.PI);
        c.lineTo(x1 + dx * t + nx * o, y1 + dy * t + ny * o);
      }
      c.lineTo(x2, y2); c.stroke();
    },
    /* tread / track teeth */
    teeth(c, x, y, w, h, n, col, scroll) {
      c.fillStyle = col;
      const step = w / n;
      for (let i = 0; i < n; i++) {
        const px = x + ((i * step + (scroll || 0) * step) % w + w) % w;
        c.fillRect(px, y, Math.max(1, step * .42), h);
      }
    },
    text(c, s, x, y, size, col, weight, align, glowCol) {
      c.font = `${weight || 800} ${size}px "Segoe UI",system-ui,sans-serif`;
      c.textAlign = align || 'center'; c.textBaseline = 'middle';
      if (glowCol) { c.shadowColor = glowCol; c.shadowBlur = size * .9; }
      c.fillStyle = col || '#fff'; c.fillText(s, x, y); c.shadowBlur = 0;
    }
  };

  /* ---------- Object pool ---------- */
  class Pool {
    constructor(factory, reset) { this.f = factory; this.r = reset; this.free = []; this.live = []; }
    get() { const o = this.free.pop() || this.f(); this.live.push(o); return o; }
    sweep() { for (let i = this.live.length - 1; i >= 0; i--) { const o = this.live[i]; if (o.dead) { this.live.splice(i, 1); if (this.free.length < 400) { if (this.r) this.r(o); this.free.push(o); } } } }
  }

  /* ---------- Path geometry ---------- */
  function pathLength(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y); return L; }
  /* point at distance d along polyline (pts: [{x,y}]); writes into out */
  function pointAt(pts, cum, d, out) {
    if (d <= 0) { out.x = pts[0].x; out.y = pts[0].y; out.a = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x); return out; }
    const total = cum[cum.length - 1];
    if (d >= total) { const n = pts.length; out.x = pts[n - 1].x; out.y = pts[n - 1].y; out.a = Math.atan2(pts[n - 1].y - pts[n - 2].y, pts[n - 1].x - pts[n - 2].x); return out; }
    let i = 1; while (cum[i] < d) i++;
    const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1], t = seg > 0 ? (d - cum[i - 1]) / seg : 0;
    out.x = lerp(a.x, b.x, t); out.y = lerp(a.y, b.y, t);
    out.a = Math.atan2(b.y - a.y, b.x - a.x);
    return out;
  }

  Object.assign(GD, {
    TAU, RNG, hashStr, noiseFactory, fbm, clamp, lerp, smooth, dist, dist2, angLerp,
    rnd, rint, pick, fmt, hsl, hshift, mixHex, gfx, Pool, pathLength, pointAt
  });
})(window.GD);
