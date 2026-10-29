/* ============ TELEGRAM MINI APP BRIDGE ============ */
(function (GD) {
  'use strict';
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  const TG = {
    available: !!tg,
    init() {
      if (!tg) { console.log('[TG] WebApp не обнаружен — работаем в браузере'); return; }
      try {
        tg.ready();
        tg.expand();
        if (tg.setHeaderColor) { try { tg.setHeaderColor('#05070c'); tg.setBackgroundColor('#05070c'); } catch (e) { } }
        if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
        if (tg.setFooterTextColor) { try { tg.setTextButton ? 0 : 0; } catch (e) { } }
        const bb = tg.BackButton;
        if (bb) bb.onClick(() => { document.dispatchEvent(new CustomEvent('dsh:back')); });
        const us = tg.initDataUnsafe || {};
        this.user = us.user || null;
        this.platform = tg.platform;
        this.color = (tg.themeParams && tg.themeParams.button_color) || null;
        console.log('[TG] готов, платформа:', tg.platform, this.user ? this.user.username : '');
      } catch (e) { console.warn('[TG] часть API недоступна', e); }
    },
    haptic(style) {
      if (GD.Settings && GD.Settings.haptic === false) return;
      if (!tg || !tg.HapticFeedback) return;
      try {
        if (style === 'heavy' || style === 'medium' || style === 'light') tg.HapticFeedback.impactOccurred(style);
        else if (style === 'notify' || style === 'success' || style === 'error' || style === 'warning') tg.HapticFeedback.notificationOccurred(style);
        else tg.HapticFeedback.selectionChanged();
      } catch (e) { }
    },
    /* ---------- сохранение: CloudStorage с фолбэком в localStorage ---------- */
    save(key, data) {
      const s = JSON.stringify(data);
      try { localStorage.setItem(key, s); } catch (e) { }
      if (tg && tg.CloudStorage) {
        try { tg.CloudStorage.setItem(key, s, ok => { if (!ok) console.warn('[TG] CloudStorage не сохранил'); }); } catch (e) { }
      }
    },
    load(key, cb) {
      const local = (() => { try { return localStorage.getItem(key); } catch (e) { return null; } })();
      const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
      if (tg && tg.CloudStorage) {
        try {
          tg.CloudStorage.getItem(key, (err, val) => {
            const remote = parse(val);
            const l = parse(local);
            cb(remote && (!l || (remote.level || 0) >= (l.level || 0)) ? remote : (l || remote));
          });
          return;
        } catch (e) { }
      }
      cb(parse(local));
    },
    /* вспышка в интерфейсе Telegram */
    hapticShot() { this.haptic('light'); }
  };

  GD.TG = TG;
})(window.GD);
