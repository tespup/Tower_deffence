/* ============ MAIN: запуск, цикл, ввод, масштабирование ============ */
(function (GD) {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const stage = document.getElementById('stage');
  const game = new GD.Game();
  game.attach(canvas, ctx);
  GD.game = game;

  /* ---------- размеры ---------- */
  let W = 0, H = 0, DPR = 1;
  function resize() {
    const r = stage.getBoundingClientRect();
    const w = Math.max(280, Math.round(r.width));
    const h = Math.max(420, Math.round(r.height));
    W = w; H = h;
    DPR = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
    if (window.innerWidth < 560 && window.innerHeight > 900) DPR = Math.min(DPR, 2);
    canvas.width = Math.round(w * DPR); canvas.height = Math.round(h * DPR);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    game.resize(w, h, DPR);
    document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
  }

  /* ---------- ввод ---------- */
  let downAt = null, downT = 0, moved = false;
  function toGame(ev) {
    const r = canvas.getBoundingClientRect();
    const p = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
    return { x: (p.clientX - r.left) * (W / r.width), y: (p.clientY - r.top) * (H / r.height) };
  }
  function onDown(ev) {
    if (ev.target !== canvas) return;
    /* ПКМ (button 2) — только отмена выбранной турели, но не установка */
    if (ev.button === 2) { downAt = null; cancelSelection(); return; }
    GD.Audio.unlock();
    const p = toGame(ev);
    downAt = p; downT = performance.now(); moved = false;
    game.move(p.x, p.y);
  }
  function onMove(ev) {
    if (!downAt) return;
    const p = toGame(ev);
    if (Math.abs(p.x - downAt.x) + Math.abs(p.y - downAt.y) > 14) moved = true;
    game.move(p.x, p.y);
  }
  function onUp(ev) {
    if (!downAt) return;
    const src = (ev.changedTouches && ev.changedTouches[0]) || ev;
    const p = (src && (src.clientX || src.clientY)) ? toGame(src) : downAt;
    const quick = performance.now() - downT < 600;
    if (!moved && quick) game.tap(p.x, p.y);
    if (!('ontouchstart' in window)) game.hoverX = p.x, game.hoverY = p.y;
    downAt = null;
  }
  function onCancel() { downAt = null; }
  /* отмена: прицел → режим установки → выбранная (осмотренная) турель */
  function cancelSelection() {
    if (game.armed) { game.disarm(); return; }
    if (game.placing) { game.clearPlacing(); return; }
    if (game.selected) { game.selected = null; GD.UI.inspect(null); }
  }
  /* не дублируем: pointer-события покрывают и мышь, и тач */
  if (window.PointerEvent) {
    canvas.addEventListener('pointerdown', onDown, { passive: true });
    canvas.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onCancel, { passive: true });
  } else {
    canvas.addEventListener('touchstart', onDown, { passive: true });
    canvas.addEventListener('touchmove', onMove, { passive: true });
    canvas.addEventListener('touchend', onUp, { passive: true });
    canvas.addEventListener('touchcancel', onCancel, { passive: true });
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); downAt = null; cancelSelection(); });

  window.addEventListener('resize', () => { resize(); GD.UI && GD.UI.hud(); });
  window.addEventListener('orientationchange', () => setTimeout(resize, 220));
  document.addEventListener('dsh:back', () => {
    if (game.menuOpen) { game.closeMenu(); return; }
    if (game.armed || game.placing || game.selected) { cancelSelection(); return; }
    game.togglePause();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (game.state === 'wave') { game.paused = true; document.getElementById('btnPause').classList.add('on'); } game.saveRun(); } });
  window.addEventListener('beforeunload', () => game.saveRun());
  window.addEventListener('keydown', e => {
    if (game.menuOpen) {
      /* в открытом меню ПРОБЕЛ и ESC закрывают его и снимают паузу */
      if (e.key === ' ' || e.key === 'Escape') { e.preventDefault(); game.closeMenu(); }
      return;
    }
    if (e.key === ' ') { e.preventDefault(); game.togglePause(); }
    if (e.key === 'Escape') { cancelSelection(); }
    if (e.key === 'Enter') { e.preventDefault(); game.confirmPlace(); }
    if (e.key >= '1' && e.key <= '9') { const id = GD.Turrets.ORDER[+e.key - 1]; if (id && !game.locked(id)) GD.UI.pick(id); }
  });

  /* ---------- цикл ---------- */
  let last = performance.now(), acc = 0, frames = 0, fpsT = 0, quality = 1, uiT = 0, errN = 0;
  /* единый уровень детализации: читают FX, погода и «живые» огни уровня */
  function setQ(q, fx) {
    quality = q; GD.q = q; GD.FX.setQuality(fx);
  }
  GD.q = 1;
  /* качество из настроек: 0 — авто, 1 — высокое, 2 — низкое */
  GD.setQuality = mode => {
    setQ(mode === 1 ? 1 : mode === 2 ? .25 : 1, mode === 1 ? 1 : mode === 2 ? .35 : 1);
  };
  function loop(now) {
    const dt = Math.min(.1, (now - last) / 1000);
    last = now;
    /* автокачество: ступени вниз быстрая, вверх — очень осторожная */
    frames++; fpsT += dt;
    if (fpsT > 1) {
      const fps = frames / fpsT; frames = 0; fpsT = 0;
      const q = GD.Settings.quality;
      if (q === 1) setQ(1, 1);
      else if (q === 2) setQ(.25, .35);
      else if (fps < 42 && quality > .7) setQ(.7, .7);
      else if (fps < 34 && quality > .4) setQ(.55, .6);
      else if (fps < 24 && quality > .1) setQ(.2, .35);
      else if (fps > 57 && quality < 1) setQ(1, 1);
    }
    try { game.update(dt); game.draw(); }
    catch (err) { if (errN++ < 4) console.error('[game]', err); }
    try { GD.Audio.tick(); } catch (e) { }
    uiT += dt;
    if (uiT > .22) { uiT = 0; GD.UI.refresh(); GD.UI.startLabel(); }
    requestAnimationFrame(loop);
  }

  /* ---------- старт ---------- */
  function boot() {
    GD.TG.init();
    GD.Settings.load();
    resize();
    GD.UI.init(game);
    GD.UI.selectCard(null);
    GD.Saves.load(() => game.load(() => {
      game.showMenu();
      GD.UI.hud();
      requestAnimationFrame(t => { last = t; loop(t); });
    }));
    /* первая вспышка звука по первому касанию */
    window.addEventListener('pointerdown', function once() { GD.Audio.unlock(); window.removeEventListener('pointerdown', once); }, { passive: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.GD);
