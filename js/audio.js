/* ============ AUDIO: процедурный WebAudio SFX ============
   Движок построен на слоях: каждый выстрел = треск + корпус + отдача + механика.
   Плотность огня дуется автоматически (density ducking), чтобы рой турелей
   не превращался в кашу, но каждый отдельный выстрел оставался слышен.
   Дополнительно: стерео-панорама по позиции на поле, «комната» (convolver),
   лимитер на шине и непрерывные голоса для луча и струи огнемёта. */
(function (GD) {
  'use strict';

  let ac = null, master = null, comp = null, post = null, conv = null, wet = null;
  let drive = null, shaper = null;
  let muted = false, noiseBuf = null, brownBuf = null, viewW = 800;
  const gain = .37;
  const SHOT = 2.25;  /* выстрелы заметнее: ×2.25 ко всем слоям стрельбы
                         (взрывы, попадания и UI остаются как были) */
  let scale = 1;

  const perf = () => performance.now();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const hz = f => clamp(f || 440, 24, 17000);
  function level() { return clamp(gain * scale, 0, 3); }

  /* ---------- шумовые буферы ---------- */
  function makeNoise(sec, brown) {
    const rate = ac.sampleRate, n = Math.floor(rate * sec);
    const b = ac.createBuffer(1, n, rate), d = b.getChannelData(0);
    if (!brown) { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; }
    /* «коричневый» шум — натуральная низкочастотная масса взрывов и рёва */
    let last = 0, mx = 1e-6;
    for (let i = 0; i < n; i++) { last = (last + .022 * (Math.random() * 2 - 1)) / 1.018; d[i] = last; if (Math.abs(last) > mx) mx = Math.abs(last); }
    for (let i = 0; i < n; i++) d[i] = d[i] / mx * .92;
    return b;
  }
  /* импульсный отклик помещения: ранние отражения + затухающий хвост */
  function makeIR(sec, decay) {
    const rate = ac.sampleRate, n = Math.floor(rate * sec);
    const b = ac.createBuffer(2, n, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        const k = i / n;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, decay);
      }
      /* сглаживание = потеря высоких на длинной дистанции */
      for (let i = n - 1; i > 0; i--) d[i] = (d[i] + d[i - 1] * .65) / 1.65;
      for (let i = 0; i < 6; i++) d[Math.floor(rate * (.009 + i * .011) + ch * 3)] += (i % 2 ? -.4 : .5) * (1 - i / 6);
    }
    return b;
  }

  function init() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ac = new AC({ latencyHint: 'interactive' }); } catch (e) { ac = new AC(); }
    master = ac.createGain(); master.gain.value = muted ? 0 : level();
    try {
      /* шина мастеринга как в играх: мягкий «клей» → makeup-усиление →
         мягкий лимитер на кривой tanh. Потолок асимптотический, поэтому
         клиппинга нет даже в плотном бою, а слышимость заметно выше. */
      comp = ac.createDynamicsCompressor();
      comp.threshold.value = -3; comp.knee.value = 6; comp.ratio.value = 8;
      comp.attack.value = .003; comp.release.value = .18;
      /* подъём «присутствия»: на динамиках ноутбука треск выстрелов иначе пропадает */
      const pres = ac.createBiquadFilter();
      pres.type = 'peaking'; pres.frequency.value = 2600; pres.Q.value = .9; pres.gain.value = 4.5;
      drive = ac.createGain(); drive.gain.value = 1.15;
      shaper = ac.createWaveShaper();
      const n = 1024, curve = new Float32Array(n), k = 1.6, norm = Math.tanh(k);
      for (let i = 0; i < n; i++) curve[i] = Math.tanh(k * (i / (n - 1) * 2 - 1)) / norm;
      shaper.curve = curve; shaper.oversample = '2x';
      post = ac.createGain(); post.gain.value = 1;
      master.connect(comp); comp.connect(pres); pres.connect(drive);
      drive.connect(shaper); shaper.connect(post); post.connect(ac.destination);
    } catch (e) { master.connect(ac.destination); }
    noiseBuf = makeNoise(1.1, false);
    brownBuf = makeNoise(1.8, true);
    try {
      conv = ac.createConvolver(); conv.normalize = false; conv.buffer = makeIR(.55, 3.4);
      /* возврат «комнаты» — ДОСЛЕДНИМ звеном до master, иначе хвосты
         реверба не подчинялись бы мьюту и громкости */
      wet = ac.createGain(); wet.gain.value = .55; conv.connect(wet); wet.connect(master);
    } catch (e) { conv = null; }
    return ac;
  }
  function now() { return ac.currentTime; }

  /* шина голоса: панорама + посыл в «комнату».
     ref — необязательный контейнер: в ref.p кладётся паннер, чтобы
     непрерывные голоса могли двигать источник по стерео. */
  function out(pan, send, ref) {
    const head = ac.createGain(); head.gain.value = 1;
    let tail = head;
    if ((pan || ref) && ac.createStereoPanner) {
      const p = ac.createStereoPanner(); p.pan.value = clamp(pan || 0, -1, 1);
      head.connect(p); tail = p;
      if (ref) ref.p = p;
    }
    tail.connect(master);
    if (send && conv) { const s = ac.createGain(); s.gain.value = send; tail.connect(s); s.connect(conv); }
    return head;
  }

  /* ---------- примитивы ---------- */
  /* шумовой всплеск: t — задержка в секундах */
  function nb(t, o) {
    if (!ac || muted || !noiseBuf) return null;
    const st = now() + t + rnd(0, .0015);
    const at = o.at == null ? .004 : o.at;
    const hold = o.hold || 0;
    const d = Math.max(o.d, at + hold + .02);
    const s = ac.createBufferSource();
    s.buffer = o.brown ? brownBuf : noiseBuf;
    s.playbackRate.value = o.rate || 1;
    const f = ac.createBiquadFilter();
    f.type = o.type || 'lowpass'; f.Q.value = o.q == null ? 1 : o.q;
    f.frequency.setValueAtTime(hz(o.f0), st);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(hz(o.f1), st + (o.fd || d));
    const g = ac.createGain();
    const pk = o.v == null ? .3 : o.v;
    g.gain.setValueAtTime(0, st);
    g.gain.linearRampToValueAtTime(pk, st + at);
    if (hold) g.gain.setValueAtTime(pk, st + at + hold);
    g.gain.exponentialRampToValueAtTime(Math.max(.0006, pk * .004), st + d);
    s.connect(f); f.connect(g); g.connect(out(o.pan, o.send));
    const room = Math.max(0, s.buffer.duration - d - .06);
    s.start(st, Math.random() * room, d + .05);
    s.stop(st + d + .06);
    return g;
  }
  /* тон с огибающей и свипом частоты */
  function oc(t, o) {
    if (!ac || muted) return null;
    const st = now() + t;
    const os = ac.createOscillator();
    os.type = o.type || 'sine';
    os.frequency.setValueAtTime(hz(o.f0), st);
    if (o.f1 != null) {
      if (o.lin) os.frequency.linearRampToValueAtTime(Math.max(1, o.f1), st + (o.fd || o.d));
      else os.frequency.exponentialRampToValueAtTime(hz(o.f1), st + (o.fd || o.d));
    }
    if (o.vib) {
      const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = o.vib;
      const la = ac.createGain(); la.gain.value = o.vibD == null ? 40 : o.vibD;
      lfo.connect(la); la.connect(os.detune); lfo.start(st); lfo.stop(st + o.d + .06);
    }
    const g = ac.createGain();
    const pk = o.v == null ? .2 : o.v;
    const at = o.at == null ? .005 : o.at;
    const hold = o.hold || 0;
    const d = Math.max(o.d, at + hold + .02);
    g.gain.setValueAtTime(0, st);
    g.gain.linearRampToValueAtTime(pk, st + at);
    if (hold) g.gain.setValueAtTime(pk, st + at + hold);
    g.gain.exponentialRampToValueAtTime(Math.max(.0006, pk * .004), st + d);
    let node = g;
    if (o.filter) {
      const f = ac.createBiquadFilter(); f.type = o.ftype || 'lowpass';
      f.frequency.value = hz(o.filter); f.Q.value = o.fq || 1;
      g.connect(f); node = f;
    }
    node.connect(out(o.pan, o.send));
    os.connect(g); os.start(st); os.stop(st + d + .05);
    return g;
  }

  /* ---------- контроль плотности ----------
     Два раздельных механизма:
     1) perFrame — сколько голосов типа допускается в ОДИН кадр. Залп
        двенадцати турелей пришёлся на один кадр: он должен звучать как
        двенадцать выстрелов, а не как один, поэтому лимит щедрый.
     2) density duck — множитель громкости 0.34..1 от средней скорости
        огня за последние полсекунды: затяжной шквал не превращается в кашу. */
  const dens = {};
  let globT = 0, globN = 0;
  function allow(k, minMs, base, perFrame) {
    if (!ac || muted) return 0;
    const t = perf();
    if (t - globT > 24) { globT = t; globN = 0; }
    if (++globN > 90) return 0;
    let s = dens[k]; if (!s) s = dens[k] = { last: -1e9, rate: 0, cnt: 0, accT: 0 };
    if (t - s.last < (minMs || 0)) return 0;
    s.last = t;
    if (t - s.accT >= 16) {
      s.rate = s.rate * Math.exp(-(t - s.accT) / 520) + Math.min(s.cnt, 4);
      s.cnt = 0; s.accT = t;
    }
    if (s.cnt >= (perFrame || 9)) return 0;
    s.cnt++;
    const b = base || 12;
    return clamp(Math.sqrt(b / Math.max(b, s.rate)), .34, 1);
  }
  function panOf(x) { return x == null ? 0 : clamp((x / viewW - .5) * 1.7, -.85, .85); }

  /* ---------- электрическая дуга ---------- */
  /* Серия случайных микроразрядов + щелчок + гул катушки: так и трещит молния */
  function zap(t, v, pan, span, n) {
    const sp = span || .13, cnt = n || 8;
    nb(t, { f0: rnd(6000, 7800), f1: 2400, d: .022, v: .13 * v, type: 'highpass', q: .7, pan: pan });
    for (let i = 0; i < cnt; i++) {
      const tt = t + (i / cnt) * sp * .8 + Math.random() * sp * .25;
      nb(tt, {
        f0: rnd(1600, 6200), f1: rnd(500, 1700), d: rnd(.01, .04),
        v: (i === 0 ? rnd(.09, .15) : rnd(.03, .085)) * v,
        type: 'bandpass', q: rnd(3, 14), pan: pan + rnd(-.12, .12), send: .22
      });
    }
    oc(t, { f0: rnd(1500, 1950), f1: rnd(480, 720), d: .1, v: .055 * v, type: 'square', pan: pan });
    oc(t, { f0: rnd(108, 122), f1: 58, d: .17, v: .05 * v, type: 'sawtooth', filter: 1500, pan: pan });
  }

  /* ---------- непрерывные голоса (луч лазера, струя огнемёта) ---------- */
  const jets = new Map();
  function jetTouch(key, kind, x) {
    if (!ac || muted) return;
    const t = perf();
    let j = jets.get(key);
    if (x == null) { if (j) { j.stop(); jets.delete(key); } return; }
    if (j && j.kind !== kind) { j.stop(); jets.delete(key); j = null; }
    if (!j) {
      if (jets.size > 12) return;
      j = mkJet(kind, key, panOf(x)); if (!j) return; jets.set(key, j);
    }
    j.pan = panOf(x); j.until = t + 240;
    if (j.ref && j.ref.p) j.ref.p.pan.value = clamp(j.pan, -1, 1);
  }
  function mkJet(kind, key, pan) {
    const t = now();
    const j = { kind, key, pan, ref: {}, until: perf() + 240, nextGrain: 0, gap: kind === 'flame' ? 190 : 110, parts: [], g: null };
    try {
      j.g = ac.createGain();
      j.g.gain.setValueAtTime(.0001, t);
      j.g.gain.linearRampToValueAtTime(kind === 'flame' ? .68 : .74, t + .05);
      j.g.connect(out(pan, kind === 'flame' ? .18 : .1, j.ref));
      if (kind === 'beam') {
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2900; lp.Q.value = 1.3;
        lp.connect(j.g);
        [[545, 'sawtooth', .042], [818, 'sawtooth', .024], [1640, 'square', .01]].forEach(function (c) {
          const o1 = ac.createOscillator(); o1.type = c[1];
          o1.frequency.value = c[0] * rnd(.99, 1.01);
          const og = ac.createGain(); og.gain.value = c[2];
          o1.connect(og); og.connect(lp); o1.start(t);
          j.parts.push(o1);
        });
        const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = rnd(6.5, 9.5);
        const la = ac.createGain(); la.gain.value = 55;
        lfo.connect(la); la.connect(j.parts[0].detune); lfo.start(t); j.parts.push(lfo);
      } else if (kind === 'flame') {
        /* низкочастотный пульс струи — «двигатель» огня */
        const o1 = ac.createOscillator(); o1.type = 'sine'; o1.frequency.value = rnd(52, 74);
        const og = ac.createGain(); og.gain.value = .05;
        const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = rnd(2.6, 4.4);
        const la = ac.createGain(); la.gain.value = .035;
        lfo.connect(la); la.connect(og.gain);
        o1.connect(og); og.connect(j.g); o1.start(t); lfo.start(t);
        j.parts.push(o1, lfo);
      }
    } catch (e) { return null; }
    j.stop = function () {
      try {
        const tt = now();
        j.g.gain.cancelScheduledValues(tt);
        j.g.gain.setValueAtTime(Math.max(.0002, j.g.gain.value), tt);
        j.g.gain.linearRampToValueAtTime(0, tt + .1);
        j.parts.forEach(function (p) { try { p.stop(tt + .16); } catch (e) { } });
      } catch (e) { }
    };
    return j;
  }
  function jetGrain(j) {
    if (j.kind === 'flame') {
      if (!allow('jfl', 55, 26)) return;
      nb(0, { f0: rnd(500, 760), f1: rnd(170, 300), d: .44, at: .07, hold: .1, v: .09, type: 'lowpass', q: .9, pan: j.pan, brown: true, send: .14 });
      nb(.01, { f0: rnd(1400, 2500), f1: rnd(650, 1100), d: .34, at: .1, v: .03, type: 'bandpass', q: .8, pan: j.pan });
    } else if (j.kind === 'beam') {
      if (!allow('jbe', 70, 26)) return;
      nb(0, { f0: rnd(2600, 4400), f1: 1300, d: .1, at: .012, v: .032, type: 'highpass', pan: j.pan });
    }
  }
  function tick() {
    if (!ac) return;
    const t = perf();
    jets.forEach(function (j, k) {
      if (t > j.until) { j.stop(); jets.delete(k); return; }
      if (t >= j.nextGrain) { j.nextGrain = t + j.gap; jetGrain(j); }
    });
  }
  function stopAll() { jets.forEach(function (j) { j.stop(); }); jets.clear(); }

  /* =======================================================================
     SFX. Необязательный аргумент x — пиксельная координата выстрела:
     даёт стерео-позиционирование на поле.
     ======================================================================= */
  const SFX = {
    /* непрерывный голос турели: jet(key, 'beam'|'flame', x); x = null — выключить */
    jet: jetTouch,
    /* --- пулемёт: каждый выстрел = треск + корпус + отдача + лязг затвора --- */
    shootMG(x) {
      const m = allow('mg', 0, 12, 10) * SHOT; if (!m) return;
      const p = panOf(x) + rnd(-.04, .04), f = rnd(.93, 1.08), v = m;
      nb(0, { f0: 3400 * f, f1: 950 * f, d: .026, v: .2 * v, type: 'highpass', q: .8, pan: p });
      nb(.001, { f0: 1450 * f, f1: 360, d: .06, v: .15 * v, type: 'bandpass', q: .9, pan: p, send: .16 });
      oc(.001, { f0: 195 * f, f1: 74, d: .055, v: .11 * v, type: 'sine', pan: p });
      nb(.021, { f0: 5200, f1: 3100, d: .016, v: .035 * v, type: 'bandpass', q: 9, pan: p });
    },
    /* --- дробовик KS-23: мощный хлоп + гулый хвост --- */
    shootShell(x) {
      const m = allow('sh', 0, 10, 6) * SHOT; if (!m) return;
      const p = panOf(x);
      nb(0, { f0: 2500, f1: 720, d: .03, v: .21 * m, type: 'highpass', pan: p });
      nb(.002, { f0: 900, f1: 130, d: .19, v: .2 * m, q: .9, pan: p, brown: true, send: .3 });
      oc(.002, { f0: 152, f1: 42, d: .16, v: .16 * m, type: 'sine', pan: p });
      nb(.035, { f0: 2300, f1: 850, d: .1, v: .04 * m, type: 'bandpass', q: 3, pan: p, send: .45 });
    },
    /* --- катушка Теслы: цепная молния трещит и гудит --- */
    shootTesla(x) {
      const m = allow('ts', 0, 16, 4) * SHOT; if (!m) return;
      zap(0, m, panOf(x), .14, 9);
    },
    /* --- ЭМИ: низкий гулкой удар + остаточное потрескивание --- */
    shootEmp(x) {
      const m = allow('em', 0, 30, 4) * SHOT; if (!m) return;
      const p = panOf(x);
      oc(0, { f0: 300, f1: 32, d: .5, v: .22 * m, type: 'sine', pan: p, send: .25 });
      oc(.002, { f0: 1500, f1: 170, d: .24, v: .075 * m, type: 'sawtooth', filter: 2600, pan: p });
      nb(0, { f0: 950, f1: 110, d: .42, v: .12 * m, brown: true, pan: p, send: .35 });
      for (let i = 0; i < 3; i++) nb(rnd(.04, .3), { f0: rnd(2400, 5400), f1: 1200, d: .02, v: .035 * m, type: 'bandpass', q: 8, pan: p + rnd(-.2, .2) });
    },
    /* --- рельсотрон: разряд по шинам, треск, звон рельсов --- */
    shootRail(x) {
      const m = allow('rl', 0, 26, 4) * SHOT; if (!m) return;
      const p = panOf(x);
      oc(0, { f0: 2600, f1: 540, d: .1, v: .08 * m, type: 'square', filter: 6000, pan: p });
      nb(0, { f0: 7000, f1: 1900, d: .035, v: .17 * m, type: 'highpass', pan: p });
      nb(.002, { f0: 1600, f1: 190, d: .3, v: .15 * m, type: 'bandpass', q: .8, brown: true, pan: p, send: .4 });
      oc(.001, { f0: 132, f1: 34, d: .36, v: .2 * m, type: 'sine', pan: p });
      oc(.012, { f0: rnd(1650, 2150), d: .5, v: .03 * m, type: 'sine', pan: p, send: .55 });
    },
    /* --- космический удар: нарастающий свист наведения --- */
    orbital(x) {
      const m = allow('ob', 400, 60) * SHOT; if (!m) return;
      const p = panOf(x);
      oc(0, { f0: 220, f1: 2400, d: 1.05, v: .07 * m, type: 'sawtooth', filter: 5000, pan: p, at: .35, send: .4 });
      oc(.05, { f0: 440, f1: 3600, d: .95, v: .03 * m, type: 'sine', pan: p, at: .4 });
      nb(.1, { f0: 900, f1: 4200, d: .9, v: .035 * m, type: 'bandpass', q: 2.5, pan: p, at: .45, send: .4 });
      oc(.0, { f0: 96, f1: 60, d: 1.1, v: .06 * m, type: 'sine', pan: p, at: .5 });
    },
    /* --- лазер: короткий росчерк (для вражеских выстрелов и отблесков) --- */
    shootLaser(x) {
      const m = allow('ls', 0, 20, 6) * SHOT; if (!m) return;
      const p = panOf(x);
      oc(0, { f0: 1750, f1: 430, d: .15, v: .085 * m, type: 'sawtooth', filter: 4200, pan: p });
      oc(0, { f0: 3450, f1: 2500, d: .06, v: .035 * m, type: 'square', pan: p });
      nb(0, { f0: 4200, f1: 1400, d: .05, v: .055 * m, type: 'highpass', pan: p });
    },
    /* --- дроиды: у каждого своего ствола свой голос --- */
    enemyShot(kind, x) {
      const m = allow('es', 0, 16, 6) * SHOT; if (!m) return;
      const p = panOf(x);
      switch (kind) {
        case 'cannon':
          nb(0, { f0: 1500, f1: 380, d: .05, v: .1 * m, pan: p });
          oc(0, { f0: 190, f1: 54, d: .13, v: .1 * m, type: 'triangle', pan: p });
          nb(.01, { f0: 460, f1: 110, d: .16, v: .06 * m, brown: true, pan: p, send: .25 });
          break;
        case 'plasma':
          oc(0, { f0: 900, f1: 190, d: .2, v: .07 * m, type: 'sine', pan: p, vib: 17, vibD: 260, send: .3 });
          nb(0, { f0: 1600, f1: 480, d: .14, v: .045 * m, type: 'bandpass', q: 3, pan: p });
          break;
        case 'missile':
          nb(0, { f0: 620, f1: 1500, d: .26, v: .06 * m, type: 'bandpass', q: .8, pan: p, at: .05, send: .2 });
          oc(0, { f0: 150, f1: 70, d: .1, v: .05 * m, type: 'triangle', pan: p });
          break;
        case 'saw':
          oc(0, { f0: rnd(150, 190), f1: rnd(120, 150), d: .18, v: .05 * m, type: 'sawtooth', filter: 2600, pan: p, vib: 38, vibD: 400 });
          nb(0, { f0: 3200, f1: 1500, d: .12, v: .035 * m, type: 'bandpass', q: 5, pan: p });
          break;
        case 'laser':
          oc(0, { f0: 2100, f1: 520, d: .12, v: .07 * m, type: 'sawtooth', filter: 4600, pan: p });
          nb(0, { f0: 4600, f1: 1600, d: .045, v: .045 * m, type: 'highpass', pan: p });
          break;
        default: /* gun */
          nb(0, { f0: 2900, f1: 900, d: .03, v: .09 * m, type: 'highpass', pan: p });
          oc(0, { f0: 210, f1: 86, d: .05, v: .05 * m, type: 'sine', pan: p });
      }
    },
    /* --- ПЗРК: бряк затвора + растущая струя --- */
    shootRocket(x) {
      const m = allow('rk', 0, 20, 5) * SHOT; if (!m) return;
      const p = panOf(x);
      nb(0, { f0: 700, f1: 240, d: .05, v: .14 * m, pan: p });
      oc(0, { f0: 165, f1: 58, d: .09, v: .11 * m, type: 'triangle', pan: p });
      nb(.02, { f0: 520, f1: 1900, d: .34, v: .085 * m, type: 'bandpass', q: .7, pan: p, at: .09, hold: .08, send: .2 });
      nb(.02, { f0: 130, f1: 70, d: .3, v: .075 * m, brown: true, pan: p, at: .06 });
    },
    /* --- огнемёт: короткий сгусток пламени (струя собирается в tick) --- */
    shootFlame(x) {
      const m = allow('fl', 40, 30, 6) * SHOT; if (!m) return;
      const p = panOf(x);
      nb(0, { f0: rnd(560, 780), f1: 200, d: .3, v: .07 * m, type: 'lowpass', q: .9, pan: p, at: .05, hold: .06, brown: true });
      nb(.01, { f0: rnd(1500, 2400), f1: 800, d: .2, v: .025 * m, type: 'bandpass', q: .8, pan: p });
    },
    /* --- миномёт: хлопок в стволе + гул трубы + шипение старта --- */
    shootMortar(x) {
      const m = allow('mt', 0, 24, 5) * SHOT; if (!m) return;
      const p = panOf(x);
      nb(0, { f0: 1200, f1: 300, d: .04, v: .12 * m, pan: p });
      oc(0, { f0: 245, f1: 50, d: .2, v: .17 * m, type: 'triangle', pan: p, send: .2 });
      nb(.012, { f0: 420, f1: 88, d: .24, v: .13 * m, brown: true, pan: p, send: .3 });
      nb(.03, { f0: 2600, f1: 1150, d: .16, v: .04 * m, type: 'bandpass', q: 1.6, pan: p, at: .02 });
    },
    /* --- крио: холодный шипение + стеклянное позвякивание инея --- */
    shootCryo(x) {
      const m = allow('cr', 0, 24, 5) * SHOT; if (!m) return;
      const p = panOf(x);
      nb(0, { f0: 5200, f1: 1500, d: .36, v: .05 * m, type: 'highpass', q: .7, pan: p, at: .05, hold: .09, send: .28 });
      nb(.01, { f0: 320, f1: 130, d: .3, v: .04 * m, brown: true, pan: p, at: .04 });
      for (let i = 0; i < 3; i++) oc(rnd(0, .16), { f0: rnd(2300, 4300), d: .09, v: .014 * m, type: 'triangle', pan: p + rnd(-.2, .2), send: .5 });
    },
    /* --- зенитка: резкий автоматический хлопок, крупнее пулемёта --- */
    shootFlak(x) {
      const m = allow('fk', 0, 14, 6) * SHOT; if (!m) return;
      const p = panOf(x);
      nb(0, { f0: 4200, f1: 1150, d: .022, v: .16 * m, type: 'highpass', pan: p });
      nb(.001, { f0: 1900, f1: 420, d: .09, v: .12 * m, type: 'bandpass', q: .9, pan: p, send: .25 });
      oc(.001, { f0: 212, f1: 64, d: .07, v: .1 * m, type: 'sine', pan: p });
      nb(.04, { f0: 6200, f1: 2700, d: .018, v: .03 * m, type: 'bandpass', q: 10, pan: p });
    },
    /* --- взрывы --- */
    boom(r, x) {
      r = r || 1;
      const m = allow('bm', 0, 44, 6); if (!m) return;
      const p = panOf(x), v = m * clamp(r * .85, .45, 1.35);
      nb(0, { f0: 1400 * r, f1: 150, d: .3 * r, v: .17 * v, type: 'lowpass', q: 1.1, pan: p, brown: true, send: .32 });
      nb(0, { f0: 3600, f1: 900, d: .05, v: .11 * v, type: 'highpass', pan: p });
      oc(0, { f0: 122 * r, f1: 30, d: .34 * r, v: .19 * v, type: 'sine', pan: p });
      for (let i = 0; i < 3; i++) nb(rnd(.05, .3) * r, { f0: rnd(1200, 3600), f1: 700, d: .04, v: .025 * v, type: 'bandpass', q: 5, pan: p + rnd(-.3, .3) });
    },
    bigBoom(x) {
      const m = allow('bb', 0, 90, 5); if (!m) return;
      const p = panOf(x);
      nb(0, { f0: 3000, f1: 1200, d: .06, v: .16 * m, type: 'highpass', pan: p });
      nb(.004, { f0: 1800, f1: 42, d: .82, v: .26 * m, type: 'lowpass', q: 1.1, brown: true, pan: p, send: .4 });
      oc(.002, { f0: 96, f1: 22, d: .9, v: .26 * m, type: 'sine', pan: p });
      oc(.01, { f0: 210, f1: 40, d: .5, v: .09 * m, type: 'triangle', pan: p, send: .3 });
      for (let i = 0; i < 6; i++) nb(rnd(.08, .75), { f0: rnd(900, 3200), f1: rnd(400, 900), d: .06, v: .035 * m, type: 'bandpass', q: 4, pan: p + rnd(-.5, .5), send: .3 });
    },
    /* --- попадания --- */
    hit(x) {
      const m = allow('ht', 0, 20, 8); if (!m) return;
      const p = panOf(x);
      nb(0, { f0: rnd(2600, 5200), f1: rnd(900, 1800), d: .035, v: .045 * m, type: 'bandpass', q: rnd(2, 6), pan: p });
      oc(0, { f0: rnd(700, 1250), f1: rnd(180, 330), d: .04, v: .028 * m, type: 'triangle', pan: p });
    },
    /* бронебойный удар по корпусу турели: звон жести */
    clank(x) {
      const m = allow('cl', 0, 30, 6); if (!m) return;
      const p = panOf(x), base = rnd(420, 520);
      nb(0, { f0: 3000, f1: 1200, d: .05, v: .08 * m, type: 'bandpass', q: 6, pan: p });
      [1, 1.51, 2.37].forEach(function (k, i) { oc(0, { f0: base * k, d: .24 - i * .05, v: .026 * m / (i + 1), type: 'sine', pan: p, send: .4 }); });
    },
    /* --- полёт над головой: проносит шум по стерео с допплером --- */
    air(x) {
      const m = allow('air', 260, 80); if (!m) return;
      const c = x == null ? 0 : panOf(x);
      try {
        const st = now(), dur = .72;
        const g = ac.createGain();
        g.gain.setValueAtTime(0, st);
        g.gain.linearRampToValueAtTime(.075 * m, st + dur * .34);
        g.gain.exponentialRampToValueAtTime(.0008, st + dur);
        let sink = g;
        if (ac.createStereoPanner) {
          const p = ac.createStereoPanner();
          p.pan.setValueAtTime(clamp(c - .8, -1, 1), st);
          p.pan.linearRampToValueAtTime(clamp(c + .8, -1, 1), st + dur);
          g.connect(p); sink = p;
        }
        sink.connect(master);
        const s = ac.createBufferSource(); s.buffer = brownBuf; s.playbackRate.value = rnd(.9, 1.1);
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.4;
        f.frequency.setValueAtTime(1150, st); f.frequency.exponentialRampToValueAtTime(330, st + dur);
        s.connect(f); f.connect(g);
        s.start(st, Math.random() * .8, dur + .05); s.stop(st + dur + .06);
      } catch (e) { }
      oc(.02, { f0: 152, f1: 86, d: .66, v: .035 * m, type: 'sine', at: .24 });
    },
    /* --- интерфейсные: механика, а не «писк» --- */
    place() {
      nb(0, { f0: 2300, f1: 900, d: .04, v: .09, type: 'bandpass', q: 3, send: .3 });
      oc(0, { f0: 300, f1: 620, d: .09, v: .09, type: 'square', filter: 3000 });
      oc(.055, { f0: 620, f1: 175, d: .13, v: .11, type: 'sine' });
      nb(.02, { f0: 900, f1: 300, d: .14, v: .05, brown: true, send: .3 });
    },
    aim(x) {
      const m = allow('aim', 55); if (!m) return;
      const p = panOf(x);
      nb(0, { f0: 1900, f1: 2600, d: .03, v: .04 * m, type: 'bandpass', q: 6, pan: p });
      oc(0, { f0: 700, f1: 1050, d: .05, v: .04 * m, type: 'square', filter: 3400, pan: p });
    },
    upgrade() {
      oc(0, { f0: 420, f1: 1150, d: .16, v: .1, type: 'square', filter: 4000 });
      oc(.08, { f0: 700, f1: 1500, d: .14, v: .08, type: 'square', filter: 4500 });
      nb(.02, { f0: 2600, f1: 1400, d: .06, v: .06, type: 'bandpass', q: 4, send: .35 });
      nb(.12, { f0: 3200, f1: 1800, d: .05, v: .05, type: 'bandpass', q: 5, send: .35 });
      oc(.14, { f0: 240, f1: 90, d: .16, v: .1, type: 'sine' });
    },
    /* мастерская чинит: короткий серво-цикл с гаечным лязгом */
    repair() {
      const m = allow('rp', 120, 40); if (!m) return;
      nb(0, { f0: 2400, f1: 1600, d: .03, v: .045 * m, type: 'bandpass', q: 7 });
      oc(0, { f0: 520, f1: 760, d: .09, v: .05 * m, type: 'triangle', filter: 3000 });
      oc(.06, { f0: 300, f1: 430, d: .08, v: .035 * m, type: 'sine' });
    },
    sell() {
      oc(0, { f0: 880, f1: 260, d: .16, v: .1, type: 'triangle' });
      nb(.01, { f0: 1600, f1: 500, d: .1, v: .05, type: 'bandpass', q: 2, send: .3 });
      oc(.06, { f0: 200, f1: 110, d: .1, v: .06, type: 'sine' });
    },
    deny() {
      oc(0, { f0: 190, f1: 175, d: .09, v: .12, type: 'sawtooth', filter: 1100 });
      oc(.11, { f0: 150, f1: 132, d: .12, v: .12, type: 'sawtooth', filter: 900 });
      nb(.005, { f0: 700, f1: 300, d: .07, v: .04, type: 'lowpass' });
    },
    /* тревога: двухтональный сиренный рёв + удар в основание */
    leak() {
      oc(0, { f0: 660, f1: 470, d: .34, v: .12, type: 'sawtooth', filter: 2000, at: .02, send: .3 });
      oc(.3, { f0: 520, f1: 330, d: .36, v: .11, type: 'sawtooth', filter: 1700, at: .02, send: .3 });
      oc(.02, { f0: 120, f1: 44, d: .5, v: .14, type: 'sine' });
      nb(.01, { f0: 500, f1: 90, d: .45, v: .08, type: 'lowpass', brown: true, send: .35 });
    },
    waveStart() {
      /* нарастающая сирена + лязг створок ангара */
      oc(0, { f0: 150, f1: 470, d: .85, v: .11, type: 'sawtooth', filter: 1500, at: .3, vib: .35, vibD: 700, send: .4 });
      oc(.05, { f0: 226, f1: 706, d: .8, v: .05, type: 'square', filter: 2400, at: .35 });
      nb(.02, { f0: 300, f1: 1400, d: .9, v: .05, type: 'bandpass', q: 1.6, at: .4, send: .4 });
      nb(0, { f0: 1400, f1: 400, d: .1, v: .09, type: 'bandpass', q: 2, send: .4 });
      oc(.0, { f0: 90, f1: 40, d: .6, v: .12, type: 'sine', at: .05 });
    },
    levelUp() {
      /* мажорное трезвучие с квинтой — металл + стекло */
      const seq = [523, 659, 784, 1046];
      seq.forEach(function (f, i) {
        const t = i * .1;
        oc(t, { f0: f, d: .34, v: .075, type: 'triangle', at: .008, send: .45 });
        oc(t, { f0: f * 2, d: .18, v: .025, type: 'sine', at: .006 });
        nb(t + .004, { f0: f * 4, f1: f * 3, d: .05, v: .016, type: 'bandpass', q: 6, send: .5 });
      });
      oc(.02, { f0: 130, f1: 96, d: .4, v: .08, type: 'sine' });
    },
    boss() {
      /* угрожающий рёв: расстроенные пилы + скрежет + подземный гул */
      [63, 64.6, 95].forEach(function (f, i) {
        oc(0, { f0: f, f1: f * .78, d: 1.5, v: .13 - i * .03, type: 'sawtooth', filter: 620, at: .12, vib: 5.5, vibD: 30, send: .35 });
      });
      nb(.08, { f0: 320, f1: 70, d: 1.3, v: .1, type: 'lowpass', q: 1.4, at: .2, brown: true, send: .35 });
      nb(.15, { f0: 2400, f1: 600, d: .8, v: .035, type: 'bandpass', q: 3.5, at: .25, send: .5 });
      oc(.05, { f0: 34, f1: 24, d: 1.5, v: .16, type: 'sine', at: .2 });
    }
  };

  GD.Audio = {
    init, SFX, tick, stopAll, jet: jetTouch,
    get ready() { return !!ac; },
    unlock() { const c = init(); if (c && c.state === 'suspended') c.resume(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : level(); if (m) stopAll(); },
    setVolume(s) { scale = s == null ? 1 : s; if (master && !muted) master.gain.value = level(); },
    setView(w) { viewW = w || 800; },
    get volume() { return scale; },
    get muted() { return muted; }
  };
})(window.GD);
