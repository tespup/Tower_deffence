/* ============ UI: DOM-интерфейс ============ */
(function (GD) {
  'use strict';
  const $ = s => document.querySelector(s);
  const D = Math.max(1, window.devicePixelRatio || 1);

  const ICON_T = 2.4, ICON_REC = .08, ICON_ANG = -1.05;

  function drawIcon(canvas, id) {
    const def = GD.Turrets.DEFS[id];
    const S = 46;
    canvas.width = S * D; canvas.height = S * D;
    const c = canvas.getContext('2d');
    c.setTransform(D, 0, 0, D, 0, 0);
    c.clearRect(0, 0, S, S);
    /* подложка */
    const g = c.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    /* прицельная сетка */
    c.strokeStyle = 'rgba(120,220,255,0.14)'; c.lineWidth = 1;
    c.beginPath(); c.arc(S / 2, S * .56, S * .4, 0, Math.PI * 2); c.stroke();

    const tr = { angle: ICON_ANG, spin: 1.1, recoil: ICON_REC, target: null, cx: 1e6, cy: 1e6, lvl: 1, t: ICON_T, d: def };
    /* изолируем побочные эффекты частиц */
    const fp = GD.FX.p, fa = GD.FX.arc, fs = GD.FX.sparks;
    GD.FX.p = GD.FX.arc = GD.FX.sparks = function () { };
    c.save();
    c.translate(S / 2, S * .74);
    c.scale(1.5, 1.5);
    c.fillStyle = 'rgba(120,220,255,0.07)'; c.beginPath(); c.arc(0, -S * .12, S * .34, 0, Math.PI * 2); c.fill();
    try {
      GD.Turrets.Turret.prototype.drawBase.call({ d: def, game: { cell: 21 }, lvl: 1, flash: 0 }, c);
      (GD.Turrets.ART[def.art] || function () { })(c, tr, 38, ICON_T, ICON_REC);
    } catch (e) { }
    c.restore();
    GD.FX.p = fp; GD.FX.arc = fa; GD.FX.sparks = fs;
  };

  const UI = {
    init(game) {
      this.g = game;
      this.shopTrack = $('#shopTrack');
      this.cards = {};
      const { DEFS, ORDER } = GD.Turrets;
      for (const id of ORDER) {
        const d = DEFS[id];
        const el = document.createElement('div');
        el.className = 'card';
        const cv = document.createElement('canvas');
        el.appendChild(cv);
        const nm = document.createElement('div'); nm.className = 'cn'; nm.textContent = d.short; el.appendChild(nm);
        const cc = document.createElement('div'); cc.className = 'cc'; cc.textContent = d.cost; el.appendChild(cc);
        if (d.aa >= 1.5) { const tg = document.createElement('div'); tg.className = 'tag aa'; tg.textContent = 'ПВО'; el.appendChild(tg); }
        else if (d.aa > 0) { const tg = document.createElement('div'); tg.className = 'tag'; tg.textContent = 'ВОЗД'; el.appendChild(tg); }
        else if (d.healTurret) { const tg = document.createElement('div'); tg.className = 'tag'; tg.textContent = 'РЕМОНТ'; el.appendChild(tg); }
        el.addEventListener('click', e => {
          e.stopPropagation();
          if (this.suppress && Date.now() - this.suppress < 200) return; /* это был drag-прокрутка */
          this.pick(id);
        });
        this.shopTrack.appendChild(el);
        this.cards[id] = { el, cv, costEl: cc };
        drawIcon(cv, id);
      }

      /* прокрутка лавки на ПК: колесо/тачпад и перетаскивание мышью */
      const track = this.shopTrack;
      track.addEventListener('wheel', e => {
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (!d) return;
        e.preventDefault();
        track.scrollLeft += d * (e.deltaMode === 1 ? 24 : e.deltaMode === 2 ? track.clientWidth * .8 : 1);
      }, { passive: false });
      let drag = null;
      track.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch') return;   /* на таче — нативный скролл */
        drag = { x: e.clientX, l: track.scrollLeft, moved: 0 };
      });
      window.addEventListener('pointermove', e => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        if (drag.moved || Math.abs(dx) > 4) { drag.moved = 1; track.scrollLeft = drag.l - dx; }
      });
      window.addEventListener('pointerup', () => { if (drag && drag.moved) this.suppress = Date.now(); drag = null; });
      window.addEventListener('pointercancel', () => { drag = null; });
      track.addEventListener('dragstart', e => e.preventDefault());

      /* кнопки */
      $('#btnMenu').addEventListener('click', e => { e.stopPropagation(); game.openMenu(); });
      $('#btnSpeed').addEventListener('click', e => { e.stopPropagation(); game.setSpeed(); });
      $('#btnPause').addEventListener('click', e => { e.stopPropagation(); game.togglePause(); });
      $('#btnSound').addEventListener('click', e => { e.stopPropagation(); this.toggleSound(); });
      $('#btnStart').addEventListener('click', e => { e.stopPropagation(); game.startWave(); });
      $('#ovBtn').addEventListener('click', e => { e.stopPropagation(); game.overlayAction && game.overlayAction(); });
      $('#insUp').addEventListener('click', e => { e.stopPropagation(); game.upgradeSelected(); });
      $('#insSellBtn').addEventListener('click', e => { e.stopPropagation(); game.sellSelected(); });
      $('#btnConfirmPlace').addEventListener('click', e => { e.stopPropagation(); game.confirmPlace(); });
      $('#btnCancelPlace').addEventListener('click', e => { e.stopPropagation(); game.disarm(); });
      this.el = {
        hpVal: $('#hpVal'), hpBar: $('#hpBar'), scrapVal: $('#scrapVal'), waveTxt: $('#waveTxt'),
        lvlName: $('#lvlName'), lvlSub: $('#lvlSub'), btnStart: $('#btnStart'), overlay: $('#overlay'),
        ovKicker: $('#ovKicker'), ovTitle: $('#ovTitle'), ovText: $('#ovText'), ovStats: $('#ovStats'),
        ovMenu: $('#ovMenu'),
        ovBtn: $('#ovBtn'), ovFoot: $('#ovFoot'), inspect: $('#inspect'), placeHint: $('#placeHint'),
        placeName: $('#placeName'), placeMode: $('#placeMode'), bossBar: $('#bossBar'), bossFill: $('#bossFill'),
        bossName: $('#bossName'), announce: $('#announce'), anTitle: $('#anTitle'), anSub: $('#anSub'),
        btnPause: $('#btnPause'), confirmBar: $('#confirmBar'), confirmCost: $('#confirmCost'),
        btnConfirmPlace: $('#btnConfirmPlace')
      };
    },
    pick(id) {
      const g = this.g;
      if (g.locked(id)) { GD.Audio.SFX.deny(); GD.FX.text(0, 0, '', '#000', 1); this.toast('Откроется на ' + g.defs.DEFS[id].unlock + ' уровне'); return; }
      g.selectShop(id);
    },
    toast(msg) {
      const a = this.el.announce;
      this.el.anTitle.textContent = '';
      this.el.anSub.textContent = msg;
      a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
      setTimeout(() => { this.el.anSub.textContent = ''; }, 1400);
    },
    selectCard(id) {
      for (const k in this.cards) this.cards[k].el.classList.toggle('sel', k === id);
      if (id) {
        this.el.placeHint.classList.add('show');
        this.el.placeName.textContent = this.g.defs.DEFS[id].name;
        this.el.placeMode.textContent = 'Тап по клетке — прицел';
      } else {
        this.el.placeHint.classList.remove('show');
        if (this.el.confirmBar) this.el.confirmBar.classList.add('hide');
      }
    },
    /* панель подтверждения установки над прицельной клеткой */
    placeConfirm() {
      const e = this.el, g = this.g;
      if (!e || !e.confirmBar) return;
      const a = g.armed;
      if (!g.placing || !a) { e.confirmBar.classList.add('hide'); return; }
      const d = g.defs.DEFS[g.placing];
      const ok = g.cellFree(a.cc, a.rr) && g.scrap >= d.cost;
      const x = (a.cc + .5) * g.cell, y = g.topPad + (a.rr + .5) * g.cell;
      e.confirmCost.textContent = d.cost;
      e.btnConfirmPlace.disabled = !ok;
      e.placeMode.textContent = ok ? 'Клетка выбрана — подтверди' : 'Здесь поставить нельзя';
      const bar = e.confirmBar;
      bar.classList.remove('hide');
      const bw = bar.offsetWidth || 150, bh = bar.offsetHeight || 46;
      const above = y - g.cell * .75 > 92;
      bar.classList.toggle('below', !above);
      bar.style.left = clamp(x, bw / 2 + 8, Math.max(bw / 2 + 8, g.W - bw / 2 - 8)) + 'px';
      bar.style.top = clamp(above ? y - g.cell * .7 : y + g.cell * .7, bh + 66, Math.max(bh + 66, g.H - 200)) + 'px';
    },
    refresh() {
      const g = this.g;
      for (const id in this.cards) {
        const c = this.cards[id], d = g.defs.DEFS[id];
        const lock = g.locked(id);
        c.el.classList.toggle('lock', lock);
        c.el.classList.toggle('poor', !lock && g.scrap < d.cost);
        if (lock) c.costEl.textContent = 'УР.' + d.unlock;
      }
      if (g.placing && g.armed) this.placeConfirm();
      if (g.selected) this.inspectState();
    },
    hud() {
      const g = this.g, e = this.el;
      if (!g || !g.field) return;
      e.hpVal.textContent = Math.max(0, Math.ceil(g.baseHp));
      e.scrapVal.textContent = Math.round(g.scrap);
      const k = clamp(g.baseHp / g.baseMax, 0, 1);
      e.hpBar.style.width = (k * 100).toFixed(1) + '%';
      e.hpBar.style.background = k > .5 ? 'linear-gradient(90deg,#00ff9d,#7dff4d)' : k > .25 ? 'linear-gradient(90deg,#ffd166,#ff9d3d)' : 'linear-gradient(90deg,#ff5a4a,#ff2d2d)';
      e.hpVal.parentElement.classList.toggle('low', k < .3);
      e.waveTxt.textContent = g.waveNum + '/' + g.waves.length;
      e.lvlName.textContent = g.biome.name;
      e.lvlSub.textContent = 'УРОВЕНЬ ' + g.level + ' · ' + g.biome.code;
    },
    startLabel() {
      const g = this.g, b = this.el.btnStart;
      if (g.state === 'prep' || g.state === 'break') {
        b.classList.remove('hide'); b.textContent = g.state === 'prep' ? 'НАЧАТЬ ВОЛНУ 1' : 'ВОЛНА ' + (g.waveNum + 1);
        b.classList.add('ready');
      } else if (g.state === 'wave') {
        b.classList.remove('hide'); b.classList.remove('ready');
        b.textContent = g.speed > 1 ? g.speed + '× УСКОРЕНА' : 'ВОЛНА ИДЁТ';
      } else b.classList.add('hide');
    },
    setBoss(e) {
      if (!e) { this.el.bossBar.classList.remove('show'); return; }
      this.boss = e;
      this.el.bossBar.classList.add('show');
      this.el.bossName.textContent = (e.ch.mut.name + ' · ' + e.a.name);
    },
    bossHp(e) { if (e) this.el.bossFill.style.width = clamp(e.ratio * 100, 0, 100) + '%'; },
    announce(title, sub) {
      const a = this.el.announce;
      this.el.anTitle.textContent = title;
      this.el.anSub.textContent = sub || '';
      a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
    },
    overlay(cfg) {
      const e = this.el;
      e.ovKicker.textContent = cfg.kicker || '';
      e.ovTitle.innerHTML = cfg.title || '';
      e.ovText.innerHTML = cfg.text || '';
      e.ovStats.innerHTML = (cfg.stats || []).map(s => `<div class="st"><i>${s[0]}</i><b>${s[1]}</b></div>`).join('');
      e.ovFoot.textContent = cfg.foot || '';
      e.ovBtn.textContent = cfg.btn || 'ДАЛЕЕ';
      const rows = cfg.rows || [], box = e.ovMenu;
      e.ovBtn.style.display = rows.length ? 'none' : '';
      box.innerHTML = '';
      if (cfg.grid) {
        const gr = document.createElement('div'); gr.className = 'mgrid';
        for (let i = 1; i <= cfg.grid.count; i++) {
          const b = document.createElement('button');
          b.className = 'mlvl' + (i > cfg.grid.max ? ' lock' : '');
          b.textContent = i; b.disabled = i > cfg.grid.max;
          if (!b.disabled) b.addEventListener('click', ev => {
            ev.stopPropagation(); GD.TG.haptic('select'); cfg.grid.act(i);
          });
          gr.appendChild(b);
        }
        box.appendChild(gr);
      }
      for (const r of rows) {
        const b = document.createElement('button');
        b.className = 'mrow' + (r.cls ? ' ' + r.cls : '');
        b.innerHTML = '<span>' + r.label + '</span>' + (r.val ? '<b>' + r.val + '</b>' : '');
        b.addEventListener('click', ev => {
          ev.stopPropagation(); if (!r.act) return;
          GD.TG.haptic('select'); r.act();
        });
        box.appendChild(b);
      }
      box.classList.toggle('show', !!rows.length || !!cfg.grid);
      e.overlay.classList.add('show');
    },
    hideOverlay() { this.el.overlay.classList.remove('show'); },
    /* ---------- главное меню ---------- */
    menu(screen) {
      const g = this.g, S = GD.Settings, sc = screen || 'main';
      this.mScreen = sc;
      const saved = Math.max(1, g.savedLevel | 0);
      const go = lv => { this.hideOverlay(); g.buildLevel(lv); };
      const run = g.lastRun ? g.lastRun() : null;
      /* корневой экран: главное меню или пауз-меню — по нему работает «НАЗАД» */
      if (sc === 'main' || sc === 'pause') this.mRoot = sc;
      const root = this.mRoot || 'main';
      const back = { label: '← НАЗАД', cls: 'back', act: () => this.menu(root) };
      const head = t => '<span class="mhead">' + t + '</span>';
      const onoff = v => v ? 'ВКЛ' : 'ВЫКЛ';
      const cfg = { kicker: 'TERMINATOR PROTOCOL · MINI APP', title: 'СТАЛЬНОЙ<br>РУБЕЖ', foot: 'Прогресс сохраняется автоматически' };
      const R = [];
      if (sc === 'main') {
        if (run) {
          R.push({ label: 'ПРОДОЛЖИТЬ', val: 'УР. ' + run.lv + ' · ВОЛНА ' + ((run.nw | 0) + 1) + (run.ti ? ' · ' + run.ti.length + ' ТУРЕЛЕЙ' : ''), cls: 'go', act: () => g.continueRun() });
          if (saved > 1) R.push({ label: 'ВЫБОР УРОВНЯ', val: 'ОТКРЫТО ' + saved, act: () => this.menu('levels') });
          R.push({ label: 'НОВАЯ ИГРА', val: 'УР. 1', act: () => go(1) });
        } else {
          R.push({ label: saved > 1 ? 'ПРОДОЛЖИТЬ' : 'НАЧАТЬ ОБОРОНУ', val: 'УР. ' + saved, cls: 'go', act: () => go(saved) });
          if (saved > 1) R.push({ label: 'НОВАЯ ИГРА', val: 'УР. 1', act: () => go(1) });
          if (saved > 1) R.push({ label: 'ВЫБОР УРОВНЯ', val: 'ОТКРЫТО ' + saved, act: () => this.menu('levels') });
        }
        R.push({ label: 'НАСТРОЙКИ', act: () => this.menu('settings') });
        R.push({ label: 'КАК ИГРАТЬ', act: () => this.menu('help') });
        R.push({ label: 'РЕКОРДЫ', val: g.best ? String(g.best) : '—', act: () => this.menu('stats') });
        if (saved > 1) R.push({ label: 'СБРОС ПРОГРЕССА', cls: 'danger', act: () => this.menu('reset') });
      } else if (sc === 'pause') {
        cfg.kicker = 'ПАУЗА'; cfg.title = head('ИГРА ОСТАНОВЛЕНА');
        cfg.text = 'Оборона ждёт. Волна продолжится с того же момента.';
        R.push({ label: 'ПРОДОЛЖИТЬ', val: 'УР. ' + g.level + ' · ВОЛНА ' + (g.waveNum + 1), cls: 'go', act: () => g.closeMenu() });
        R.push({ label: 'НАСТРОЙКИ', act: () => this.menu('settings') });
        R.push({ label: 'КАК ИГРАТЬ', act: () => this.menu('help') });
        R.push({ label: 'ГЛАВНОЕ МЕНЮ', cls: 'danger', act: () => g.exitToMenu() });
        cfg.foot = 'Прогресс уровня сохранён';
      } else if (sc === 'levels') {
        cfg.kicker = 'ГЛАВНОЕ МЕНЮ'; cfg.title = head('ВЫБОР УРОВНЯ');
        cfg.text = 'Карта, погода и состав машин каждый раз новые.';
        cfg.grid = { count: saved, max: saved, act: lv => go(lv) };
        cfg.foot = 'Открыты все уровни до достигнутого включительно';
        R.push(back);
      } else if (sc === 'settings') {
        cfg.kicker = 'ГЛАВНОЕ МЕНЮ'; cfg.title = head('НАСТРОЙКИ');
        R.push({ label: 'ЗВУК', val: onoff(S.sound), act: () => { S.cycle('sound'); this.menu('settings'); } });
        R.push({ label: 'ГРОМКОСТЬ', val: S.VOL_NAMES[S.vol], act: () => { S.cycle('vol'); this.menu('settings'); } });
        R.push({ label: 'КАЧЕСТВО КАРТИНКИ', val: S.Q_NAMES[S.quality], act: () => { S.cycle('quality'); this.menu('settings'); } });
        if (GD.TG.available) R.push({ label: 'ВИБРООТДАЧА', val: onoff(S.haptic), act: () => { S.cycle('haptic'); this.menu('settings'); } });
        cfg.foot = '«АВТО» само снижает эффекты, если телефон тормозит';
        R.push(back);
      } else if (sc === 'help') {
        cfg.kicker = 'ГЛАВНОЕ МЕНЮ'; cfg.title = head('КАК ИГРАТЬ');
        cfg.text = '<b>ЦЕЛЬ.</b> Не пропускать дроидов к бункеру. Каждый прорвавшийся забирает броню — на нуле оборона пробита.<br><br>' +
          '<b>СТРОЙКА.</b> Выбери турель в лавке, тапни свободную клетку — включится прицел, и тапни её ещё раз (или нажми «СТАВИТЬ»), чтобы подтвердить. Случайный тап ничего не построит. Нажми на свою турель — апгрейд или продажа.<br><br>' +
          '<b>РАССТАНОВКА.</b> Дорога одна, но изгибистая: держи турели вплотную к тропе, дальнобойные ставь на поворотах.<br><br>' +
          '<b>БОЙ.</b> Волну можно начать раньше — за это дают лом. Между волнами чини и улучшай оборону.<br><br>' +
          '<b>УПРАВЛЕНИЕ НА ПК.</b> Колесо мыши или перетаскивание крутят лавку, правая кнопка отменяет выбор, ПРОБЕЛ — пауза, ESC — отмена, ENTER — подтвердить установку, 1-9 — быстрая покупка.';
        cfg.foot = 'Лом падает с подбитых машин — трать его до того, как бункер сдаст';
        R.push(back);
      } else if (sc === 'stats') {
        cfg.kicker = 'ГЛАВНОЕ МЕНЮ'; cfg.title = head('РЕКОРДЫ');
        cfg.stats = [
          ['РЕКОРД', g.best || 0],
          ['УНИЧТОЖЕНО', g.totalKills || 0],
          ['ДОСТИГНУТО', 'УР. ' + saved],
          ['ТУРЕЛЕЙ В АРСЕНАЛЕ', Object.keys(g.defs.DEFS).filter(k => !(g.defs.DEFS[k].unlock > saved)).length + '/' + Object.keys(g.defs.DEFS).length]
        ];
        R.push(back);
      } else if (sc === 'reset') {
        cfg.kicker = 'ОПАСНО'; cfg.title = head('СБРОС ПРОГРЕССА');
        cfg.text = 'Уровень, рекорд и счётчик уничтоженных машин обнулятся. Отменить будет нельзя.';
        R.push({ label: 'ДА, СБРОСИТЬ ВСЁ', cls: 'danger', act: () => g.resetProgress() });
        R.push(back);
      }
      cfg.rows = R;
      this.overlay(cfg);
    },
    inspect(t) {
      const e = this.el, g = this.g;
      this.insT = t;
      if (!t) { e.inspect.classList.add('hide'); return; }
      e.inspect.classList.remove('hide');
      const D = g.defs;
      $('#insName').textContent = t.d.name;
      $('#insLvl').textContent = 'УР.' + t.lvl + (t.lvl >= D.MAXLV ? ' (МАКС)' : '');
      $('#insDmg').textContent = t.d.healTurret ? 'РЕМОНТ' : Math.round(t.dmg * (t.d.rate > 6 || t.d.beam ? 1 : t.d.rate * .18) * 10) / 10 || '—';
      /* у лучевой турели rate не используется — честнее показать «непрерывно»,
         иначе панель обещала 40 × 12/с = 480 урона вместо реальных 40/с */
      $('#insRate').textContent = t.d.beam ? 'непрерывно' : (t.rate).toFixed(1) + '/с';
      $('#insRange').textContent = (t.range / g.cell).toFixed(1);
      const up = $('#insUp');
      if (t.lvl >= D.MAXLV) { up.disabled = true; up.firstChild.textContent = 'МАКСИМУМ'; }
      else {
        const c = D.upgradeCost(t.d, t.lvl);
        up.disabled = g.scrap < c;
        up.firstChild.textContent = 'АПГРЕЙД · ';
        $('#insUpCost').textContent = c;
      }
      $('#insSellCost').textContent = D.sellValue(t);
    },
    /* дешёвая перепроверка «можно ли апгрейд» — панель висит открытой, а металл
       между волнами капает; без этого кнопка оставалась серой до нового выделения */
    inspectState() {
      const g = this.g, t = this.insT;
      if (!t || t !== g.selected) return;
      const up = this._up || (this._up = document.querySelector('#insUp'));
      if (t.lvl >= g.defs.MAXLV) { up.disabled = true; return; }
      up.disabled = g.scrap < g.defs.upgradeCost(t.d, t.lvl);
    },
    toggleSound() {
      const S = GD.Settings;
      S.cycle('sound');
      this.toast(S.sound ? 'ЗВУК ВКЛЮЧЁН' : 'ЗВУК ВЫКЛЮЧЕН');
    }
  };
  const clamp = GD.clamp;
  GD.UI = UI;
})(window.GD);
