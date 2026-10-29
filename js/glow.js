/* ============ GLOW: кэш спрайтов свечения ============
   createRadialGradient на каждый кадр — самое дорогое, что есть в canvas2d на
   телефонах. Здесь любой радиус-градиент собирается ОДИН раз в маленькую
   текстуру и дальше рисуется через drawImage (аппаратно, дёшево).
   Использование: GD.Glow.blit(ctx, 'soft'|'flame'|'eye'|'core', цвет, x, y, r, alpha) */
(function (GD) {
  'use strict';
  const SS = 64, HS = SS / 2;
  const rgba = (r, g, b, a) => 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + a + ')';

  /* профили свечения: массив [позиция, цвет] */
  const KINDS = {
    /* как gfx.glow: цветное ядро, мягкий спад */
    soft: (r, g, b, a) => [[0, rgba(r, g, b, a)], [.42, rgba(r, g, b, a * .45)], [1, rgba(r, g, b, 0)]],
    /* пламя: белое ядро → цвет → тёмный прозрачный край */
    flame: (r, g, b, a) => [[0, rgba(255, 253, 238, a)], [.34, rgba(r, g, b, a * .92)], [.72, rgba(r * .55 | 0, g * .3 | 0, b * .12 | 0, a * .35)], [1, rgba(r, g, b, 0)]],
    /* глаза роботов: яркая сердцевина, узкий нимб */
    eye: (r, g, b, a) => [[0, rgba(255, 255, 255, a * .95)], [.3, rgba(r, g, b, a * .6)], [1, rgba(r, g, b, 0)]],
    /* маленькая искра/точка: почти сплошное пятно с мягким краем */
    core: (r, g, b, a) => [[0, rgba(255, 255, 255, a)], [.35, rgba(r, g, b, a * .85)], [1, rgba(r, g, b, 0)]],
    /* тёплая lamp-лужа света на земле */
    lamp: (r, g, b, a) => [[0, rgba(r, g, b, a * .55)], [.5, rgba(r, g, b, a * .18)], [1, rgba(r, g, b, 0)]]
  };

  /* --- разбор любого CSS-цвета в rgb через 1x1 canvas (дёшево, один раз на цвет) --- */
  const probe = document.createElement('canvas');
  probe.width = probe.height = 2;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  const colCache = new Map();
  function rgbaOf(col) {
    let v = colCache.get(col);
    if (v) return v;
    pctx.fillStyle = '#000';
    pctx.clearRect(0, 0, 2, 2);
    pctx.fillStyle = col;
    pctx.fillRect(0, 0, 2, 2);
    const d = pctx.getImageData(0, 0, 1, 1).data;
    v = [d[0], d[1], d[2], d[3] / 255];
    if (colCache.size < 512) colCache.set(col, v);
    return v;
  }
  /* цвет с новой альфой (для статики и обводок) */
  function alpha(col, a) { const v = rgbaOf(col); return rgba(v[0], v[1], v[2], (v[3] * a).toFixed(3)); }
  /* смешать цвет с белым на t (для светящихся прожилок) */
  function lift(col, t) { const v = rgbaOf(col); return rgba(v[0] + (255 - v[0]) * t, v[1] + (255 - v[1]) * t, v[2] + (255 - v[2]) * t, v[3]); }

  const cache = new Map();
  function sprite(kind, col) {
    const key = kind + '|' + col;
    let s = cache.get(key);
    if (s) return s;
    if (cache.size > 96) cache.clear();
    const v = rgbaOf(col);
    const cv = document.createElement('canvas');
    cv.width = cv.height = SS;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(HS, HS, 0, HS, HS, HS);
    for (const st of (KINDS[kind] || KINDS.soft)(v[0], v[1], v[2], v[3])) g.addColorStop(st[0], st[1]);
    c.fillStyle = g; c.fillRect(0, 0, SS, SS);
    cache.set(key, cv);
    return cv;
  }

  /* нарисовать свечение радиуса r в (x,y) */
  function blit(ctx, kind, col, x, y, r, a) {
    if (!(r > .4) || !(x === x) || !(y === y)) return;
    const s = sprite(kind, col);
    if (a != null && a < .999) {
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * (a < 0 ? 0 : a);
      ctx.drawImage(s, x - r, y - r, r + r, r + r);
      ctx.globalAlpha = a0;
    } else {
      ctx.drawImage(s, x - r, y - r, r + r, r + r);
    }
  }
  /* сплюснутая «лужа» света на земле (эллипс) */
  function pool(ctx, kind, col, x, y, rx, ry, a) {
    if (!(rx > .4) || !(ry > .4)) return;
    const s = sprite(kind, col);
    const a0 = ctx.globalAlpha;
    if (a != null) ctx.globalAlpha = a0 * a;
    ctx.drawImage(s, x - rx, y - ry, rx + rx, ry + ry);
    ctx.globalAlpha = a0;
  }

  GD.Glow = { blit, pool, sprite, alpha, lift, rgbaOf, clear() { cache.clear(); colCache.clear(); gcache.clear(); } };

  /* ============ КЭШ ГРАДИЕНТОВ ============
     Координаты в локальной системе объектов (корпуса роботов, корпуса турелей)
     постоянны, поэтому градиент собираем один раз и переиспользуем. Ключи
     квантуем до 0.1px, чтобы не раздувать кэш. Привязка к canvas — по id. */
  let sid = 1;
  const gcache = new Map();
  function grad(c, key, build) {
    const cv = c.canvas;
    if (!cv.__gid) cv.__gid = sid++;
    const k = cv.__gid + '|' + key;
    let g = gcache.get(k);
    if (g === undefined) {
      g = build(c);
      if (gcache.size > 480) gcache.clear();
      gcache.set(k, g);
    }
    return g;
  }
  const f = v => (Math.round(v * 10) / 10), stkey = st => { let s = ''; for (let i = 0; i < st.length; i++) s += st[i][0] + ':' + st[i][1] + ';'; return s; };
  function lin(c, x0, y0, x1, y1, st) {
    return grad(c, 'l' + f(x0) + ',' + f(y0) + ',' + f(x1) + ',' + f(y1) + '|' + stkey(st),
      cc => { const g = cc.createLinearGradient(x0, y0, x1, y1); for (const s of st) g.addColorStop(s[0], s[1]); return g; });
  }
  function rad(c, x0, y0, r0, x1, y1, r1, st) {
    return grad(c, 'r' + f(x0) + ',' + f(y0) + ',' + f(r0) + ',' + f(x1) + ',' + f(y1) + ',' + f(r1) + '|' + stkey(st),
      cc => { const g = cc.createRadialGradient(x0, y0, r0, x1, y1, r1); for (const s of st) g.addColorStop(s[0], s[1]); return g; });
  }
  GD.lin = lin; GD.rad = rad;
})(window.GD);
