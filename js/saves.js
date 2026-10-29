/* ============ SAVES: слоты забегов (локально + облако Telegram) ============ */
(function (GD) {
  'use strict';
  const KEY = 'sktd_saves_v1';
  const MAX = 12;
  let list = [];       /* in-memory кэш слотов, сортировка по ts (свежие впереди) */
  let cloudT = null;

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { }
    /* облако Telegram — с дебаунсом, чтобы не спамить на каждое действие */
    if (cloudT) clearTimeout(cloudT);
    cloudT = setTimeout(() => {
      cloudT = null;
      const tgv = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (tgv && tgv.CloudStorage) {
        try { tgv.CloudStorage.setItem(KEY, JSON.stringify(list), () => { }); } catch (e) { }
      }
    }, 700);
  }

  const parse = s => { try { const v = s ? JSON.parse(s) : null; return Array.isArray(v) ? v.filter(x => x && x.id) : null; } catch (e) { return null; } };
  const sortTrim = () => { list.sort((a, b) => (b.ts || 0) - (a.ts || 0)); if (list.length > MAX) list.length = MAX; };

  const Saves = {
    /* загрузка при старте: локальная копия мгновенно, облако — поверх (по свежести ts) */
    load(cb) {
      let local = null;
      try { local = parse(localStorage.getItem(KEY)); } catch (e) { }
      list = local || [];
      const done = remote => {
        if (remote) {
          const byId = {};
          for (const s of list) byId[s.id] = s;
          for (const s of remote) {
            const cur = byId[s.id];
            if (!cur || (s.ts || 0) > (cur.ts || 0)) byId[s.id] = s;
          }
          list = Object.keys(byId).map(k => byId[k]);
          sortTrim();
        }
        cb && cb();
      };
      const tgv = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (tgv && tgv.CloudStorage) {
        try { tgv.CloudStorage.getItem(KEY, (err, val) => done(err ? null : parse(val))); return; } catch (e) { }
      }
      done(null);
    },
    /* запись/замена слота — вызывается синхронно в моменты чекпоинтов */
    put(snap) {
      list = list.filter(s => s && s.id !== snap.id);
      list.push(snap);
      sortTrim();
      persist();
    },
    remove(id) {
      const n = list.length;
      list = list.filter(s => s.id !== id);
      if (list.length !== n) persist();
    },
    /* самый свежий слот = последняя игра игрока */
    last() { return list.length ? list.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))[0] : null; },
    clear() { list = []; persist(); }
  };
  GD.Saves = Saves;
})(window.GD);
