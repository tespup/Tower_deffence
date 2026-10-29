/* ============ TELEGRAM MINI APP BRIDGE ============ */
(function (GD) {
'use strict';

const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

/* ---------- Технологии: фуллскрин + портретная ориентация ---------- */

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const PORTRAIT_OVERLAY_ID = 'portrait-rotate-overlay';
let lastPortraitState = null;

/* Функция прямой отправки команд в клиент Telegram */
function sendTgEvent(eventType, eventData) {
  const dataStr = eventData ? JSON.stringify(eventData) : '';
  try {
    if (window.TelegramWebviewProxy && window.TelegramWebviewProxy.postEvent) {
      window.TelegramWebviewProxy.postEvent(eventType, dataStr);
    } else if (window.external && window.external.invoke) {
      window.external.invoke(JSON.stringify({ eventType: eventType, eventData: eventData }));
    } else if (window.parent !== window) {
      window.parent.postMessage(JSON.stringify({ eventType: eventType, eventData: eventData }), '*');
    }
  } catch (e) {}
}

function isPortraitViewport() {
  return window.innerHeight >= window.innerWidth;
}

/*
  Инвертированная технология ориентации: игра требует ПОРТРЕТНЫЙ режим.
  Ландшафт → показываем оверлей «поверни вертикально» и разблокируем
  ориентацию, чтобы пользователь мог повернуть устройство.
  Портрет → скрываем оверлей и фиксируем ориентацию.
*/
function enforcePortrait(force) {
  try { document.documentElement.classList.add('orientation-guard-ready'); } catch (e) {}
  if (!isMobile) return;
  const overlay = document.getElementById(PORTRAIT_OVERLAY_ID);
  const portrait = isPortraitViewport();
  if (overlay) overlay.classList.toggle('visible', !portrait);
  if (force || portrait !== lastPortraitState) {
    try {
      const orientation = window.screen && window.screen.orientation;
      if (orientation && typeof orientation.lock === 'function') {
        orientation.lock('portrait').catch(function () {});
      }
    } catch (e) {}
    sendTgEvent('web_app_toggle_orientation_lock', { locked: !!portrait });
    lastPortraitState = portrait;
  }
}

/*
  Запрос полного экрана. Вызывается ТОЛЬКО по клику пользователя,
  ТОЛЬКО на мобильных и ТОЛЬКО в портретной ориентации.
  Пересчёт геометрии после перехода делает main.js (syncSize в игровом
  цикле) — он не зависит от того, пришлёт Telegram события или нет.
*/
function requestFS() {
  if (!isMobile) return;
  enforcePortrait(true);
  if (!isPortraitViewport()) return;
  sendTgEvent('web_app_expand');
  sendTgEvent('web_app_request_fullscreen');
  if (tg && tg.isVersionAtLeast && tg.isVersionAtLeast('8.0') && tg.requestFullscreen) {
    if (!tg.isFullscreen) {
      try { tg.requestFullscreen(); } catch (e) {}
    }
  }
}

const TG = {
  available: !!tg,
  isMobile: isMobile,
  enforcePortrait: enforcePortrait,
  requestFS: requestFS,

  init() {
    /* Защита портрета: немедленный вызов + слушатели поворота */
    enforcePortrait(true);
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { enforcePortrait(true); }, 50);
      setTimeout(function () { enforcePortrait(true); }, 250);
    });

    /* 1. ЕСЛИ ЭТО ПК — безусловно и сразу выкидываем окно из кривого Fullscreen
       (НЕ проверяем здесь typeof Telegram, так как на ПК без скрипта он undefined!) */
    if (!isMobile) {
      sendTgEvent('web_app_ready');
      sendTgEvent('web_app_exit_fullscreen');
      setTimeout(function () { sendTgEvent('web_app_exit_fullscreen'); }, 150);
      setTimeout(function () { sendTgEvent('web_app_exit_fullscreen'); }, 500);
    }

    /* 2. Если объект Telegram доступен */
    if (!tg) { console.log('[TG] WebApp не обнаружен — работаем в браузере'); return; }
    try {
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) {
        try { tg.setHeaderColor('#05070c'); tg.setBackgroundColor('#05070c'); } catch (e) {}
      }
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      if (!isMobile) {
        try { if (tg.exitFullscreen) tg.exitFullscreen(); } catch (e) {}
      }

      const bb = tg.BackButton;
      if (bb) bb.onClick(function () { document.dispatchEvent(new CustomEvent('dsh:back')); });
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
    } catch (e) {}
  },

  /* ---------- сохранение: CloudStorage с фолбэком в localStorage ---------- */
  save(key, data) {
    const s = JSON.stringify(data);
    try { localStorage.setItem(key, s); } catch (e) {}
    if (tg && tg.CloudStorage) {
      try {
        tg.CloudStorage.setItem(key, s, function (ok) { if (!ok) console.warn('[TG] CloudStorage не сохранил'); });
      } catch (e) {}
    }
  },

  load(key, cb) {
    const local = (function () { try { return localStorage.getItem(key); } catch (e) { return null; } })();
    const parse = function (s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
    if (tg && tg.CloudStorage) {
      try {
        tg.CloudStorage.getItem(key, function (err, val) {
          const remote = parse(val);
          const l = parse(local);
          cb(remote && (!l || (remote.level || 0) >= (l.level || 0)) ? remote : (l || remote));
        });
        return;
      } catch (e) {}
    }
    cb(parse(local));
  },

  /* вспышка в интерфейсе Telegram */
  hapticShot() { this.haptic('light'); }
};

GD.TG = TG;

/* Максимально ранний вызов: скрипт в конце <body>, DOM уже готов */
enforcePortrait(true);

})(window.GD);