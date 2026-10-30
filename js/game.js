/* ============ GAME: состояние, волны, бой, отрисовка ============ */
(function (GD) {
  'use strict';
  const { RNG, TAU, clamp, lerp, dist, dist2, rnd, gfx, pointAt, hsl } = GD;
  const S = GD.Audio.SFX;
  const LEVEL = GD.Level, TURRETS = GD.Turrets;

  const BASE_HP = 100;

  /* расстояние от точки C до отрезка AB (снаряд за кадр пролетает несколько пикселей) */
  function segHit(ax, ay, bx, by, cx, cy, r) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L ? ((cx - ax) * dx + (cy - ay) * dy) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t - cx, qy = ay + dy * t - cy;
    return qx * qx + qy * qy < r * r;
  }

  /* ---------- снаряды игрока ---------- */
  class Bullet {
    constructor(o) {
      Object.assign(this, o);
      this.t = 0; this.dead = false;
      this.x0 = o.x; this.y0 = o.y;
      this.speed = o.speed || (o.kind === 'pellet' ? 700 : 980);
      this.trailT = 0;
      /* снаряд без вектора (ракета) обязан стартовать в сторону цели:
         без этого vx = NaN и ракета улетает в небытие без урона */
      if (!o.arc && (o.vx == null || !isFinite(o.vx))) {
        const tg = (o.target && !o.target.dead) ? { x: o.target.x, y: o.target.y - o.target.size * .45 } : null;
        const dx = tg ? tg.x - o.x : 0, dy = tg ? tg.y - o.y : -1;
        const L = Math.hypot(dx, dy) || 1;
        this.vx = dx / L * this.speed; this.vy = dy / L * this.speed;
      }
      if (o.arc) {
        if (!isFinite(this.tx)) this.tx = o.x;
        if (!isFinite(this.ty)) this.ty = o.y;
        this.dur = clamp(dist(o.x, o.y, this.tx, this.ty) / 420, .45, 1.3);
        this.h = -clamp(dist(o.x, o.y, this.tx, this.ty) * .55, 60, 220);
      }
      if (o.fuse != null) this.fuse = o.fuse;
      if (o.life != null) this.life = o.life;   /* картечина живёт коротко — дробовик бьёт вблизи */
    }
    aimTarget() {
      const t = this.target;
      if (!t || t.dead) return null;
      return { x: t.x, y: t.y - t.size * (t.air ? .35 : .45) };
    }
    update(dt, g) {
      this.t += dt;
      if (this.life != null && this.t > this.life) { this.dead = true; return; }
      const k = this.kind;
      if (k === 'shell') {
        const p = this.t / this.dur;
        if (p >= 1) { this.burst(g, this.tx, this.ty); return; }
        this.x = lerp(this.x0, this.tx, p);
        this.y = lerp(this.y0, this.ty, p) + this.h * Math.sin(Math.PI * p);
        this.vy = -this.h * Math.PI * Math.cos(Math.PI * p) / this.dur;
        if (Math.random() < dt * 30) GD.FX.smoke(this.x, this.y, 1, 'rgba(180,180,180,.35)', 8, .35);
        return;
      }
      if (k === 'rocket') {
        const tg = this.aimTarget();
        if (tg) {
          const want = Math.atan2(tg.y - this.y, tg.x - this.x);
          let a = Math.atan2(this.vy, this.vx);
          a = GD.angLerp(a, want, Math.min(1, dt * 9));
          const sp = Math.min(520, this.speed + this.t * 260);
          this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
        }
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.trailT += dt;
        if (this.trailT > .012) {
          this.trailT = 0;
          GD.FX.p(this.x, this.y, rnd(-16, 16), rnd(-16, 16), .38, 3.4, '#ffd08a', { shape: 'flame', grav: -30 });
          GD.FX.smoke(this.x, this.y, 1, 'rgba(190,190,190,.3)', 10, .5);
        }
      } else {
        const tg = this.aimTarget();
        if (tg && this.target && this.target.a) {
          /* лёгкое самонаведение пули */
          const want = Math.atan2(tg.y - this.y, tg.x - this.x);
          let a = Math.atan2(this.vy, this.vx);
          a = GD.angLerp(a, want, Math.min(1, dt * 9));
          const sp = Math.hypot(this.vx, this.vy);
          this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
        }
        this.x += this.vx * dt; this.y += this.vy * dt;
      }
      if (this.fuse != null) { this.fuse -= dt; if (this.fuse <= 0) { this.burst(g, this.x, this.y); return; } }
      /* столкновение: проверяем ОТРЕЗОК перемещения — пуля за кадр проходит 12-16 px,
         «точечная» проверка давала промахи сквозь модель и 0 урона (особенно у пулемёта) */
      const px0 = this.x - this.vx * dt, py0 = this.y - this.vy * dt;
      if (this.kind === 'rocket' && this.splash && this.target && !this.target.dead) {
        /* взрыватель срабатывает на подлёте: на короткой дистанции ракета не успевает вписаться в цель */
        const tg = this.aimTarget();
        if (dist(this.x, this.y, tg.x, tg.y) < 18 + this.splash * .3) { this.burst(g, tg.x, tg.y, this.target); return; }
      }
      if (this.target && !this.target.dead) {
        const tg = this.aimTarget();
        const rr = this.target.size * (this.target.air ? .55 : .48) + 4;
        if (segHit(px0, py0, this.x, this.y, tg.x, tg.y, rr)) { this.burst(g, tg.x, tg.y, this.target); return; }
      } else if (this.kind === 'pellet' || this.kind === 'bullet' || this.kind === 'flak') {
        for (const e of g.enemies) {
          if (e.dead) continue;
          const rr = e.size * .5 + 3;
          if (segHit(px0, py0, this.x, this.y, e.x, e.y - e.size * .4, rr)) { this.burst(g, e.x, e.y - e.size * .4, e); return; }
        }
      }
      if (this.t > 2.2 || this.x < -40 || this.x > g.W + 40 || this.y < -60 || this.y > g.H + 40) this.dead = true;
    }
    burst(g, x, y, direct) {
      if (this.dead) return;
      this.dead = true;
      const owner = this.owner;
      const hit = direct || null;
      const apply = (e, mul) => {
        const d = this.dmg * (mul || 1) * (e.air ? (this.aaMul || (owner ? (owner.d.aa || 0) || 1 : 1)) : 1);
        e.damage(d, { col: this.col, bonusVsAir: true });
        if (owner) owner.dmgDone += d;
      };
      if (this.splash) {
        g.aoeDamage(x, y, this.splash, this.dmg * (this.aaMul || 1) * .55, false, this.col, apply);
        GD.FX.explode(x, y, this.splash * .8, this.col || '#ffb347', '#fff0c8');
        GD.FX.ring(x, y, this.splash * 1.3, this.col || '#ffd08a', .3);
        if (owner && this.kind === 'shell') GD.FX.crater(x, y, this.splash * .45), GD.FX.oil(x, y, this.splash * .5, 'rgba(20,14,10,0.5)');
        GD.FX.shake(this.kind === 'shell' ? 3.4 : 1.8);
        if (this.kind === 'shell') S.boom(1.1, x); else S.boom(.7, x);
      } else {
        if (hit) apply(hit);
        GD.FX.sparks(x, y, this.kind === 'pellet' ? 3 : 5, this.col || '#ffe9a8', 110);
        GD.FX.impact(x, y, this.col || '#ffe9a8', this.kind === 'pellet' ? .55 : 1);
        GD.FX.p(x, y, 0, 0, .12, 6, '#fff6d8', { shape: 'flame' });
        S.hit(x);
      }
      if (this.owner && this.owner.d && this.owner.d.burn && !this.splash) { /* форс отдельной пули */ }
    }
    draw(c) {
      const k = this.kind;
      c.save();
      c.globalCompositeOperation = 'lighter';
      if (k === 'shell') {
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#3c4038'; c.beginPath(); c.arc(this.x, this.y, 3.4, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,180,80,.8)'; c.beginPath(); c.arc(this.x, this.y - 2, 1.6, 0, TAU); c.fill();
      } else if (k === 'rocket' || k === 'flak') {
        const a = Math.atan2(this.vy, this.vx);
        c.translate(this.x, this.y); c.rotate(a);
        c.fillStyle = k === 'flak' ? '#c9c2a8' : '#d8dde2'; gfx.rr(c, -6, -1.8, 11, 3.6, 1.6); c.fill();
        c.fillStyle = k === 'flak' ? '#ffb347' : '#ff5a3a'; c.beginPath(); c.moveTo(5, -1.8); c.lineTo(9, 0); c.lineTo(5, 1.8); c.fill();
        c.globalCompositeOperation = 'lighter';
        GD.Glow.blit(c, 'flame', 'rgba(255,190,90,0.95)', -6, 0, 8, .95);
      } else {
        const a = Math.atan2(this.vy, this.vx), L = k === 'pellet' ? 7 : 13;
        c.strokeStyle = this.col || '#ffe9a8'; c.lineWidth = k === 'pellet' ? 1.6 : 2.2;
        c.beginPath(); c.moveTo(this.x, this.y); c.lineTo(this.x - Math.cos(a) * L, this.y - Math.sin(a) * L); c.stroke();
        c.fillStyle = '#fffbe8'; c.beginPath(); c.arc(this.x, this.y, k === 'pellet' ? 1.4 : 2, 0, TAU); c.fill();
      }
      c.restore();
    }
  }

  /* ---------- игра ---------- */
  class Game {
    constructor() {
      this.state = 'menu';
      this.level = 1; this.speed = 1; this.paused = false;
      this.menuOpen = false; this.pausedByMenu = false;
      this.kills = 0; this.totalKills = 0; this.best = 0; this.savedLevel = 1;
      this.enemies = []; this.turrets = []; this.bullets = []; this.ebullets = []; this.orbitals = [];
      this.selected = null; this.placing = null; this.boss = null;
      this.armed = null; this.armedAt = 0;
      this.hoverX = -999; this.hoverY = -999; this.hoverShow = false;
      this.time = 0; this.waveT = 0; this.waveNum = 0; this.queue = []; this.breakT = 0;
      this.runId = null; this.restoring = false;
      this.defs = TURRETS;
      this.baseFx = 0; this.baseShots = [];
      this.gateHit = 0; this.spawnFlash = 0;
    }

    /* ---------- настройка ---------- */
    attach(canvas, ctx) {
      this.canvas = canvas; this.ctx = ctx;
      return this;
    }
    resize(W, H, dpr) {
      const oldH = this.H, oldW = this.W;
      this.W = W; this.H = H; this.dpr = dpr;
      this.cell = W / LEVEL.COLS;
      this.scaleU = clamp(this.cell / 43, .72, 1.35);
      GD.Audio.setView(W);
      GD.FX.init(W, H, dpr);
      if (!this.field || Math.abs(H - oldH) > 90 || Math.abs(W - oldW) > 90) {
        if (this.state !== 'menu') this.buildLevel(this.level);
        else { this.topPad = 84; this.botPad = this.padBottom(); }
      }
    }
    /* сколько высоты снизу забирает нижний док (лавка + HUD + кнопка) — берём из DOM */
    padBottom() { return (GD.UI && GD.UI.dockPad) ? GD.UI.dockPad() : 152; }
    get pathTotal() { return this.field ? this.field.total : 1; }

    /* ---------- построение уровня ---------- */
    buildLevel(level) {
      this.level = level;
      this.runId = 'lv' + level;
      const seed = 'sktd-' + level;
      this.rng = new RNG(seed);
      this.biome = GD.Biomes.makeBiome(level, new RNG(seed + '|b'));
      this.mutation = GD.Biomes.makeMutation(new RNG(seed + '|m'));
      this.topPad = 84; this.botPad = this.padBottom();
      this.field = LEVEL.buildField(level, this.W, this.H, this.cell, this.topPad, this.botPad, new RNG(seed + '|f'));
      this.props = LEVEL.makeProps(this.field, this.biome, new RNG(seed + '|p'));
      /* «живые» огни уровня: только источники света, пульсация дешёвая (спрайт) */
      this.glowPts = [];
      for (const p of this.props) {
        if (!p.glow) continue;
        this.glowPts.push({
          x: p.x, y: p.y - p.s * (p.glow === 'lamp' ? 1.2 : .42), r: p.s * (p.glow === 'lamp' ? 2.1 : 1.7),
          col: p.glow === 'lamp' ? 'hsl(42,100%,66%)' : p.glow === 'soft' ? hsl(this.biome.accentHue, 100, 62) : 'rgba(255,150,60,0.95)',
          kind: p.glow === 'soft' ? 'soft' : p.glow === 'lamp' ? 'lamp' : 'flame',
          ph: Math.random() * 6.28, flick: p.glow === 'flame' ? 1 : .35
        });
      }
      if (this.glowPts.length > 16) this.glowPts.length = 16;
      this.variants = GD.Enemies.variantsForLevel(level, this.biome);
      this.vIndex = {};
      this.weather = new LEVEL.Weather(this.biome, this.W, this.H, new RNG(seed + '|w'));
      this.escale = LEVEL.enemyScale(level);
      this.waves = LEVEL.makeWaves(level, new RNG(seed + '|wv'));
      /* стартовая экономика */
      /* стартовая экономика: стартовый бюджет уровня растёт вместе с прочностью
         врагов — иначе к 6-7 уровню первая волна уже стоит дороже, чем весь
         оборонительный стартовый комплект, и её невозможно отбить в принципе */
      this.scrap = Math.round((150 + level * 15) * (.55 + .45 * this.escale.hp));
      this.baseMax = BASE_HP; this.baseHp = BASE_HP;
      this.shelled = false;
      this.enemies.length = 0; this.turrets.length = 0; this.bullets.length = 0;
      this.ebullets.length = 0; this.orbitals.length = 0;
      this.occ = []; for (let r = 0; r < this.field.rows; r++) this.occ.push(new Uint8Array(this.field.cols));
      this.state = 'prep'; this.waveNum = 0; this.waveT = 0; this.queue.length = 0;
      this.boss = null; this.selected = null; this.placing = null;
      this.armed = null; this.armedAt = 0;
      this.kills = 0; this.leaked = 0; this.baseShots.length = 0;
      GD.Audio.stopAll();
      GD.FX.reset();
      this.renderStatic();
      this.breakT = 0;
      GD.UI.hud(); GD.UI.refresh(); GD.UI.startLabel(); GD.UI.setBoss(null); GD.UI.inspect(null); GD.UI.selectCard(null);
      GD.UI.announce('УРОВЕНЬ ' + level, this.biome.name + ' · ' + this.mutation.name);
      GD.TG.haptic('success');
      if (!this.restoring) this.saveRun();
    }
    renderStatic() {
      const dpr = this.dpr;
      if (!this.statCv) this.statCv = document.createElement('canvas');
      const cv = this.statCv;
      if (cv.width !== Math.round(this.W * dpr)) { cv.width = Math.round(this.W * dpr); cv.height = Math.round(this.H * dpr); }
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const art = this.art = this.artOpts();
      GD.Level.renderStatic(g, this.field, this.biome, this.level, this.W, this.H);
      GD.Art.fieldDetail(g, art);
      for (const p of this.props) GD.Level.drawProp(g, p, this.biome, this.time);
      GD.Art.buildBehind(g, art);
      this.buildRamparts(art);
    }
    /* параметры для арт-модуля: где ворота, где пролом, какая палитра */
    artOpts() {
      const px = this.field.px;
      const o = {
        W: this.W, H: this.H, cell: this.cell, topPad: this.topPad, baseY: this.baseY,
        field: this.field, biome: this.biome, level: this.level,
        gateX: px[px.length - 1].x, northX: px[0].x
      };
      o.P = GD.Art.palette(this.biome);
      return o;
    }
    /* крепостные стены готовятся один уровень: картинка + анимированные огни */
    buildRamparts(art) {
      const dpr = this.dpr, W = this.W, H = this.H;
      /* --- юная стена с воротами --- */
      const top = Math.max(0, art.baseY - this.cell * 1.05), bot = Math.min(H, art.baseY + GD.Art.WALL_H + 32);
      const wcv = this.wallCv || (this.wallCv = document.createElement('canvas'));
      wcv.width = Math.round(W * dpr); wcv.height = Math.round(Math.max(2, bot - top) * dpr);
      const wg = wcv.getContext('2d');
      wg.setTransform(dpr, 0, 0, dpr, 0, -top * dpr);
      GD.Art.buildWall(wg, art);
      this.wallBand = { top, bot };
      /* --- северный пролом --- */
      const ntop = 0, nbot = Math.min(H, art.topPad + 18);
      const ncv = this.northCv || (this.northCv = document.createElement('canvas'));
      ncv.width = Math.round(W * dpr); ncv.height = Math.round(Math.max(2, nbot - ntop) * dpr);
      const ng = ncv.getContext('2d');
      ng.setTransform(dpr, 0, 0, dpr, 0, -ntop * dpr);
      GD.Art.buildNorth(ng, art);
      this.northBand = { top: ntop, bot: nbot };
    }
    blitBand(c, cv, band) {
      if (!cv || !band) return;
      const h = band.bot - band.top;
      c.drawImage(cv, 0, 0, cv.width, h * this.dpr, 0, band.top, this.W, h);
    }
    pathAt(d, lane) {
      const f = this.field;
      const out = pointAt(f.px, f.cum, d, this._pt || (this._pt = {}));
      if (lane) { const nx = Math.cos(out.a + Math.PI / 2), ny = Math.sin(out.a + Math.PI / 2); out.x += nx * lane; out.y += ny * lane; }
      return out;
    }
    cellAt(px, py) {
      const cc = Math.floor(px / this.cell), rr = Math.floor((py - this.topPad) / this.cell);
      return { cc, rr };
    }
    cellFree(cc, rr) {
      if (cc < 0 || rr < 0 || cc >= this.field.cols || rr >= this.field.rows) return false;
      return !this.field.blocked[rr][cc] && !this.occ[rr][cc];
    }
    locked(id) { return this.level < TURRETS.DEFS[id].unlock; }

    /* ---------- размещение: прицел → подтверждение ---------- */
    selectShop(id) {
      if (this.placing === id) { this.clearPlacing(); return; }
      this.placing = id; this.armed = null; this.selected = null;
      GD.UI.inspect(null); GD.UI.selectCard(id); GD.UI.placeConfirm(); GD.TG.haptic('select');
    }
    clearPlacing() {
      this.placing = null; this.armed = null;
      GD.UI.selectCard(null); GD.UI.placeConfirm();
    }
    disarm() {
      if (!this.armed) return;
      this.armed = null; GD.UI.placeConfirm(); GD.TG.haptic('select');
    }
    armCell(cc, rr) {
      this.armed = { cc, rr }; this.armedAt = performance.now();
      S.aim(); GD.TG.haptic('select'); GD.UI.placeConfirm();
    }
    /* тап в режиме установки: первый — прицел, второй по той же клетке — подтвердить */
    placingTap(px, py) {
      const d = TURRETS.DEFS[this.placing];
      if (!d) { this.clearPlacing(); return false; }
      const { cc, rr } = this.cellAt(px, py);
      const a = this.armed;
      if (a && a.cc === cc && a.rr === rr) {
        if (performance.now() - this.armedAt < 220) return false; /* проглотили случайный двойной тап */
        return this.placeAt(cc, rr);
      }
      const t = this.turretAt(px, py);
      if (t) { this.clearPlacing(); this.selected = t; GD.UI.inspect(t); GD.TG.haptic('select'); return false; }
      if (!this.cellFree(cc, rr)) { S.deny(); GD.UI.toast('Здесь строить нельзя'); return false; }
      if (this.scrap < d.cost) { S.deny(); GD.UI.toast('Нужно ' + d.cost + ' металла'); return false; }
      this.armCell(cc, rr);
      return false;
    }
    confirmPlace() { const a = this.armed; if (a) this.placeAt(a.cc, a.rr); }
    placeAt(cc, rr) {
      const id = this.placing; if (!id) return false;
      const d = TURRETS.DEFS[id];
      if (!d) { this.clearPlacing(); return false; }
      if (!this.cellFree(cc, rr)) { this.disarm(); S.deny(); GD.UI.toast('Здесь строить нельзя'); return false; }
      if (this.scrap < d.cost) { this.disarm(); S.deny(); GD.UI.toast('Нужно ' + d.cost + ' металла'); return false; }
      this.scrap -= d.cost;
      const t = new TURRETS.Turret((cc + .5) * this.cell, this.topPad + (rr + .5) * this.cell, cc, rr, id, this);
      this.turrets.push(t); this.occ[rr][cc] = 1;
      GD.FX.ring(t.cx, t.cy, this.cell * .9, '#8fe9ff', .4);
      GD.FX.sparks(t.cx, t.cy, 10, '#bfe9ff', 90);
      S.place(); GD.TG.haptic('light');
      this.armed = null;
      /* режим серии оставляем только если хватает на следующую турель */
      if (this.scrap < d.cost) this.clearPlacing(); else GD.UI.placeConfirm();
      GD.UI.hud(); GD.UI.refresh();
      this.saveRun();
      return true;
    }
    turretAt(px, py) {
      let best = null, bd = 1e9;
      for (const t of this.turrets) {
        const dd = dist2(px, py, t.cx, t.cy - this.cell * .15);
        if (dd < this.cell * this.cell * .42 && dd < bd) { bd = dd; best = t; }
      }
      return best;
    }
    upgradeSelected() {
      const t = this.selected; if (!t) return;
      if (t.lvl >= TURRETS.MAXLV) { S.deny(); return; }
      const c = TURRETS.upgradeCost(t.d, t.lvl);
      if (this.scrap < c) { S.deny(); GD.UI.toast('Не хватает ' + (c - Math.round(this.scrap)) + ' металла'); return; }
      this.scrap -= c; t.invested += c; t.lvl++;
      t.maxHp = Math.round(t.maxHp * 1.35); t.hp = t.maxHp;
      GD.FX.ring(t.cx, t.cy, this.cell, '#ffd166', .5);
      GD.FX.sparks(t.cx, t.cy - 8, 14, '#ffe9a8', 120);
      GD.FX.text(t.cx, t.cy - 26, 'УР.' + t.lvl, '#ffd166', 13);
      S.upgrade(); GD.TG.haptic('success');
      GD.UI.hud(); GD.UI.inspect(t); GD.UI.refresh();
      this.saveRun();
    }
    sellSelected() {
      const t = this.selected; if (!t) return;
      const v = TURRETS.sellValue(t);
      this.scrap += v; this.removeTurret(t);
      GD.FX.text(t.cx, t.cy - 14, '+' + v, '#ffd166', 13);
      GD.FX.smoke(t.cx, t.cy, 5, 'rgba(160,160,160,.6)', 30, .6);
      S.sell();
      this.selected = null; GD.UI.inspect(null); GD.UI.hud(); GD.UI.refresh();
      this.saveRun();
    }
    removeTurret(t) {
      const i = this.turrets.indexOf(t); if (i >= 0) this.turrets.splice(i, 1);
      if (this.occ[t.gy] && this.occ[t.gy][t.gx]) this.occ[t.gy][t.gx] = 0;
      if (this.selected === t) { this.selected = null; GD.UI.inspect(null); }
    }

    /* ---------- волны ---------- */
    startWave() {
      if (this.state !== 'prep' && this.state !== 'break') return;
      if (this.state === 'break') this.waveNum++;
      const w = this.waves[this.waveNum]; if (!w) return;
      this.state = 'wave'; this.waveT = 0; this.queue.length = 0;
      let t = 0;
      for (const gr of w.groups) {
        let tt = t + (gr.delay || 0);
        for (let i = 0; i < gr.count; i++) {
          this.queue.push({ arch: gr.arch, t: tt, lane: (gr.lane - .5) * this.cell * .3 + rnd(-this.cell * .16, this.cell * .16) });
          tt += gr.gap;
        }
        t = Math.max(t, tt);
      }
      if (w.boss) this.queue.push({ arch: w.boss, t: 2.6, lane: .5, boss: true });
      this.queue.sort((a, b) => a.t - b.t);
      this.waveTotal = this.queue.length;
      GD.UI.announce('ВОЛНА ' + (this.waveNum + 1) + '/' + this.waves.length, w.boss ? '⚠ ТИТАН В ПУТИ' : this.waveTotal + ' единиц техники');
      S.waveStart(); GD.TG.haptic('heavy');
      if (w.boss) S.boss();
      GD.UI.startLabel();
      this.saveRun();
    }
    spawnEnemy(arch, lane, backD) {
      const varr = this.variants[arch]; if (!varr) return null;
      this.vIndex[arch] = ((this.vIndex[arch] || 0) + 1) % varr.list.length;
      const chassis = varr.list[this.vIndex[arch]];
      const e = new GD.Enemies.Enemy().init(arch, chassis, this, this.escale, lane || 0);
      if (backD) e.d = -backD;
      const p = this.pathAt(e.d, e.lane); e.x = p.x; e.y = p.y;
      this.enemies.push(e);
      this.spawnFlash = Math.min(1.6, this.spawnFlash + .8);
      const sy = Math.max(e.y, this.topPad - this.cell * .22);
      GD.FX.ring(e.x, sy, e.size * 1.6, this.biome.accent, .3);
      GD.FX.sparks(e.x, sy - e.size * .4, 6, this.biome.accent2, 90, Math.PI / 2, 1.6);
      if (e.boss) { this.boss = e; GD.UI.setBoss(e); GD.FX.flash('rgba(255,60,40,0.22)', .4); GD.FX.shake(6); }
      else if (e.air) S.air(e.x);
      return e;
    }
    endWave() {
      const w = this.waves[this.waveNum];
      const bonus = w.reward + Math.round(this.scrap * .03);
      this.scrap += bonus;
      S.levelUp(); GD.TG.haptic('success');
      if (this.waveNum >= this.waves.length - 1) { this.levelComplete(); return; }
      /* аварийный ремонт бункера между волнами: без него «тысяча порезов»
         (осколки по 1 ОН за выстрел) превращает длинный уровень в гарантированный
         слив, даже если каждая отдельная волна отбита почти чисто */
      if (this.baseHp < this.baseMax) {
        const fix = Math.min(this.baseMax - this.baseHp, Math.max(3, Math.round(this.baseMax * .06)));
        this.baseHp += fix;
        GD.FX.text(this.W * .5, this.baseY - 40, '+' + fix + ' ОН', '#8dff9d', 13);
      }
      this.state = 'break'; this.breakT = 9;
      GD.UI.announce('ВОЛНА ОТБИТА  +' + bonus, 'Готовь оборону · ' + (this.waveNum + 2) + '-я волна через 9с');
      GD.UI.hud(); GD.UI.refresh(); GD.UI.startLabel();
      this.saveRun();
    }
    levelComplete() {
      this.state = 'over_level';
      this.armed = null; this.placing = null; GD.UI.placeConfirm();
      this.totalKills += this.kills;
      this.savedLevel = Math.max(this.savedLevel, this.level + 1);
      this.best = Math.max(this.best, this.score());
      this.save();
      GD.Saves.remove(this.runId);
      S.levelUp();
      GD.UI.overlay({
        kicker: 'УРОВЕНЬ ' + this.level + ' ЗАЧИЩЕН',
        title: this.biome.name,
        text: 'Роботы потеряли этот сектор. Следующий — <b>совсем другой</b>: новый ландшафт, новая погода, <b>новый облик дроидов</b>.<br><span style="opacity:.6">' + this.mutation.name + ': ' + this.mutation.desc + '</span>',
        stats: [['Уничтожено', this.kills], ['Металл', Math.round(this.scrap)], ['Бункер', Math.ceil(this.baseHp) + '/100'], ['Счёт', this.score()]],
        btn: 'СЛЕДУЮЩИЙ УРОВЕНЬ →',
        foot: 'Прогресс сохранён'
      });
      this.overlayAction = () => { this.hide(); this.buildLevel(this.level + 1); };
    }
    score() { return Math.round(this.totalKills * 10 + this.level * 250 + this.kills * 6); }

    gameOver() {
      if (this.state === 'over') return;
      this.state = 'over';
      this.armed = null; this.placing = null; GD.UI.placeConfirm();
      this.totalKills += this.kills;
      this.best = Math.max(this.best, this.score());
      this.savedLevel = Math.max(this.savedLevel, this.level);
      this.save();
      GD.Saves.remove(this.runId);
      GD.FX.flash('rgba(255,40,20,0.5)', .8); GD.FX.shake(14); S.bigBoom();
      GD.UI.setBoss(null);
      GD.UI.overlay({
        kicker: 'БУНКЕР ПАЛ',
        title: 'СЕКТОР ПОТЕРЯН',
        text: 'Машины прорвали последнюю линию обороны. Люди не сдаются — <b>контратака</b> доступна прямо сейчас.',
        stats: [['Уровень', this.level], ['Уничтожено', this.kills], ['Счёт', this.score()], ['Рекорд', this.best]],
        btn: 'ПОПРОБОВАТЬ СНОВА',
        foot: GD.TG.available ? '' : 'Совет: строй ПВО до того, как появится воздух'
      });
      this.overlayAction = () => { this.hide(); this.buildLevel(this.level); };
    }

    /* ---------- боевые коллбэки ---------- */
    onKill(e) {
      this.scrap += e.bounty; this.kills++;
      GD.FX.text(e.x, e.y - e.size * .8, '+' + e.bounty, '#ffd166', e.boss ? 18 : 11);
      if (e.boss) {
        this.boss = null; GD.UI.setBoss(null);
        GD.FX.flash('rgba(255,180,80,0.3)', .5); GD.FX.shake(9); S.bigBoom();
        GD.UI.announce('ТИТАН УНИЧТОЖЕН', '+' + (e.bounty * 3) + ' металла');
        this.scrap += e.bounty * 2;
      }
      GD.UI.hud();
    }
    leak(e) {
      if (e.dead) return;
      e.dead = true; e.leaked = true;
      this.baseHp -= e.leak; this.leaked++;
      this.baseFx = 1;
      this.gateImpact(e.x, e.size * 1.6);
      GD.FX.text(e.x, this.baseY - 24, '-' + e.leak, '#ff5a4a', 15);
      S.leak(); GD.TG.haptic('warning');
      GD.UI.hud();
      if (this.baseHp <= 0) this.gameOver();
    }
    /* удар в ворота: вспышка на створках, сноп искр, щит гаснет на миг */
    gateImpact(x, r) {
      const y = this.baseY;
      this.gateHit = 1;
      GD.FX.flash('rgba(255,40,30,0.28)', .5); GD.FX.shake(5 + Math.min(8, r * .8));
      GD.FX.explode(x, y - 6, r, '#ff6a3a', '#ffd08a');
      GD.FX.sparks(x, y + 2, 9, '#ffd9a0', 190, -Math.PI / 2, 1.6);
      GD.FX.ring(x, y + 2, r * 2.4, '#ffcf8a', .38);
      if (this.art && this.art.gateBox) {
        const G = this.art.gateBox;
        GD.FX.sparks(clamp(x, G.x0 + 3, G.x1 - 3), y + 12, 6, '#ffb45a', 130, -Math.PI / 2, 2.2);
      }
    }
    aoeDamage(x, y, r, dmg, toTurrets, col, applyFn) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dd = dist(x, y, e.x, e.y - e.size * .3);
        if (dd < r + e.size * .4) {
          const k = clamp(1 - (dd / (r + e.size * .4)) * .55, .45, 1);
          if (applyFn) applyFn(e, k); else e.damage(dmg * k, { col: col || '#ffb347', big: r > 40 });
        }
      }
      if (toTurrets) {
        for (const t of this.turrets) {
          if (dist(x, y, t.cx, t.cy) < r + this.cell * .4) t.damage(dmg * .8);
        }
      }
    }
    /* Ответный огонь роботов. Возвращает true, если выстрел состоялся.
       Честность: по бункеру враг бьёт только из «мёртвой зоны» у самих ворот,
       снаряд летит медленнее, а перед выстрелом подсвечивается и ствол, и точка
       падения. Иначе обстрел с любого конца карты нельзя ни отстрелять, ни
       пережить — 100HP бункера таяли за секунды. */
    enemyShoot(e) {
      /* выбор цели: ближайшая турель, иначе бункер */
      let best = null, bd = 1e9;
      const R = this.cell * (e.air ? 3.4 : 2.6);
      for (const t of this.turrets) {
        const dd = dist2(e.x, e.y, t.cx, t.cy);
        if (dd < R * R && dd < bd) { bd = dd; best = t; }
      }
      /* далеко от ворот и турелей рядом нет — держит огонь, мы идём к нему */
      if (!best && this.baseY - e.y > this.cell * 3.2) return false;
      const laser = e.ch.weapon === 'laser';
      /* HP врагов растёт с уровнем, а прочность турелей — нет, поэтому огонь по
         турелям масштабируется в ~2 раза медленнее их здоровья */
      const ts = 1 + (this.escale.hp - 1) * .4;
      const dmg = (6 + 2.6 * ts) * (.8 + (e.a.atk || 1) * .3);
      const tx = best ? best.cx : e.x, ty = best ? best.cy : this.baseY;
      /* зарядка: кольцо у ствола — видно, откуда полетит */
      GD.FX.ring(e.x, e.y - e.size * .5, e.size * 1.15, e.ch.col.glowReactor, .3);
      GD.FX.flame(e.x, e.y - e.size * .5, 3, e.ch.col.glowReactor, 90, Math.atan2(ty - e.y, tx - e.x));
      if (!best) GD.FX.ring(tx, this.baseY - 8, this.cell * .6, 'rgba(255,150,60,0.95)', .42);
      this.ebullets.push({
        x: e.x, y: e.y - e.size * .5, tx, ty, turret: best, dmg,
        /* по бункеру — «осыпающий» урон: досаждает, но бой не решает */
        baseDmg: best ? 0 : clamp(dmg * .07, .4, 1.6),
        spd: (laser ? 900 : 520) * (best ? 1 : .55),
        col: e.ch.col.glowReactor, t: 0, laser
      });
      if (Math.random() < .75) { S.enemyShot(e.ch.weapon, e.x); }
      return true;
    }
    healNearby(f) {
      let n = 0;
      const R = this.cell * 1.9;
      for (const e of this.enemies) {
        if (e.dead || e === f || e.hp >= e.maxHp) continue;
        if (dist(f.x, f.y, e.x, e.y) < R) { e.heal(e.maxHp * .07); n++; }
      }
      f.heal(f.maxHp * .03);
      GD.FX.ring(f.x, f.y - f.size * .4, R * .8, '#7dff9d', .35);
      if (n) GD.FX.text(f.x, f.y - f.size * .9, '+' + n, '#7dff9d', 10);
    }
    bossVolley(boss) {
      /* залп только когда «Титан» уже у ворот: издалека он по бункеру не бьёт */
      if (this.baseY - boss.y <= this.cell * 4.4) {
        const n = Math.min(6, 4 + Math.floor(this.level / 4));
        const bd = clamp(.5 * this.escale.leak, .3, 1.2);
        for (let i = 0; i < n; i++) {
          setTimeout(() => {
            if (boss.dead || this.state !== 'wave') return;
            const tx = rnd(this.cell, this.W - this.cell);
            this.ebullets.push({
              x: boss.x, y: boss.y - boss.size * .7,
              tx, ty: this.baseY, turret: null,
              dmg: 1.4 * this.escale.leak, baseDmg: bd, spd: 300, col: '#ff5a3a', t: 0
            });
            /* предупреждение о точке падения заранее — снаряд идёт ~0.6с */
            GD.FX.ring(tx, this.baseY - 8, this.cell * .75, 'rgba(255,90,60,0.95)', .5);
            GD.FX.flame(boss.x, boss.y - boss.size * .8, 4, '#ff8a3a', 130, -Math.PI / 2 + rnd(-.6, .6));
          }, i * 130);
        }
      } else {
        GD.FX.text(boss.x, boss.y - boss.size * 1.4, 'ДАЛЕКО ДО ВОРОТ', '#ff8a5a', 11);
      }
      /* вызов подкрепления */
      for (let i = 0; i < 3; i++) this.spawnEnemy(this.rng.chance(.5) ? 'scout' : 'runner', rnd(-this.cell * .2, this.cell * .2), 10 + i * 14);
      GD.FX.ring(boss.x, boss.y, boss.size * 4, '#ff5a3a', .5);
      S.boss();
    }
    callOrbital(turret, x, y, dmg, r) {
      this.orbitals.push({ x, y, t: 0, dur: 1.25, dmg, r, done: false, turret });
      GD.FX.text(x, y - 26, 'ЦЕЛЬ', '#b9f2ff', 12);
      GD.FX.ring(x, y, r, '#b9f2ff', .6);
    }

    /* ---------- ввод ---------- */
    tap(x, y) {
      if (this.state === 'menu' || this.menuOpen || this.state === 'over' || this.state === 'over_level') return;
      if (this.placing) { this.placingTap(x, y); return; }
      const t = this.turretAt(x, y);
      this.selected = t || null;
      GD.UI.inspect(t);
      if (t) GD.TG.haptic('select');
    }
    move(x, y) { this.hoverX = x; this.hoverY = y; this.hoverShow = true; }
    togglePause() {
      if (this.menuOpen) return;
      if (this.state === 'menu' || this.state === 'over' || this.state === 'over_level') return;
      this.paused = !this.paused;
      document.getElementById('btnPause').classList.toggle('on', this.paused);
      GD.UI.toast(this.paused ? 'ПАУЗА' : 'ПРОДОЛЖЕНИЕ');
      GD.TG.haptic('select');
    }
    setSpeed() {
      this.speed = this.speed === 1 ? 2 : (this.speed === 2 ? 3 : 1);
      const b = document.getElementById('btnSpeed');
      b.classList.toggle('on', this.speed > 1);
      b.textContent = this.speed + '×';
      GD.TG.haptic('select'); GD.UI.startLabel();
    }
    hide() { GD.UI.hideOverlay(); }

    /* ---------- обновление ---------- */
    update(dtRaw) {
      const dt = Math.min(.05, dtRaw);
      this.time += dt;
      if (this.state === 'menu') { GD.FX.update(dt); return; }
      if (this.paused) { GD.FX.update(dt * .3); return; }
      const steps = this.speed;
      for (let s = 0; s < steps; s++) this.step(dt);
      GD.FX.update(dt * steps);
      this.weather.update(dt * steps);
    }
    step(dt) {
      const g = this;
      /* волны */
      if (this.state === 'wave') {
        this.waveT += dt;
        while (this.queue.length && this.queue[0].t <= this.waveT) {
          const q = this.queue.shift();
          this.spawnEnemy(q.arch, q.lane, 0);
        }
        if (!this.queue.length && !this.enemies.length) this.endWave();
      } else if (this.state === 'break') {
        this.breakT -= dt;
        if (this.breakT <= 0) this.startWave();
      }
      /* враги */
      const es = this.enemies;
      for (let i = es.length - 1; i >= 0; i--) {
        const e = es[i];
        e.update(dt, g);
        if (e.dead) { if (e === this.boss) { this.boss = null; GD.UI.setBoss(null); } es.splice(i, 1); continue; }
      }
      /* аура щитоносцев */
      for (const e of es) {
        if (e._shieldT > 0) e._shieldT -= dt;
      }
      for (const s of es) {
        if (s.dead || !s.shieldA) continue;
        const R = this.cell * 1.7;
        for (const e of es) {
          if (e === s || e.dead) continue;
          if (dist2(s.x, s.y, e.x, e.y) < R * R) { e._shieldT = .12; e._shieldSrc = s.shieldA; }
        }
        s._shieldT = .2;
      }
      /* турели */
      for (let i = this.turrets.length - 1; i >= 0; i--) {
        const t = this.turrets[i];
        t.update(dt, g);
        if (t.dead) { this.removeTurret(t); GD.UI.hud(); }
      }
      /* снаряды игрока */
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        b.update(dt, g);
        if (b.dead) this.bullets.splice(i, 1);
      }
      /* снарядов роботов */
      for (let i = this.ebullets.length - 1; i >= 0; i--) {
        const b = this.ebullets[i];
        b.t += dt;
        if (b.turret && !this.turrets.includes(b.turret)) b.turret = null;
        const tx = b.turret ? b.turret.cx : b.tx, ty = b.turret ? b.turret.cy : b.ty;
        const a = Math.atan2(ty - b.y, tx - b.x);
        b.x += Math.cos(a) * b.spd * dt; b.y += Math.sin(a) * b.spd * dt;
        if (b.laser) GD.FX.p(b.x, b.y, 0, 0, .16, 3.4, b.col, { glow: true });
        else GD.FX.p(b.x, b.y, rnd(-14, 14), rnd(-14, 14), .2, 2.4, b.col, { glow: true });
        if (dist2(b.x, b.y, tx, ty) < 90 || b.t > 4) {
          if (b.turret) { b.turret.damage(b.dmg * 2.6); GD.FX.explode(b.x, b.y, 14, '#ff8a4a', '#ffe0a8'); S.clank(b.x); }
          else if (b.y >= this.baseY - 6) {
            this.baseFx = 1; this.baseHp -= (b.baseDmg || 0);
            this.gateImpact(b.x, 16); S.boom(.8, b.x);
            /* первый раз объясняем, что делать: обстрел ведут только те, кто у ворот */
            if (!this.shelled) {
              this.shelled = true;
              GD.UI.toast('ОБСТРЕЛ БУНКЕРА — бьёт тот, кто подошёл к воротам');
            }
            GD.UI.hud();
            if (this.baseHp <= 0) this.gameOver();
          }
          this.ebullets.splice(i, 1);
        }
      }
      /* космоудар */
      for (let i = this.orbitals.length - 1; i >= 0; i--) {
        const o = this.orbitals[i];
        o.t += dt;
        if (!o.done && o.t >= o.dur) {
          o.done = true;
          this.aoeDamage(o.x, o.y, o.r, o.dmg, false, '#b9f2ff');
          GD.FX.explodeBig(o.x, o.y, o.r * .6);
          GD.FX.ring(o.x, o.y, o.r * 1.6, '#e8ffff', .5);
          GD.FX.shake(9); GD.FX.flash('rgba(190,240,255,0.35)', .4);
          S.bigBoom(o.x);
          for (let k = 0; k < 24; k++) GD.FX.sparks(o.x + rnd(-o.r, o.r) * .5, o.y + rnd(-o.r, o.r) * .5, 3, '#d8fbff', 180);
        }
        if (o.t > o.dur + .8) this.orbitals.splice(i, 1);
      }
      /* обстрел бункера людьми */
      this.baseFx = Math.max(0, this.baseFx - dt * 1.6);
      this.gateHit = Math.max(0, this.gateHit - dt * 3.2);
      this.spawnFlash = Math.max(0, this.spawnFlash - dt * 2.4);
      if (this.state === 'wave' && this.enemies.length && Math.random() < dt * 3.4) {
        const sx = rnd(this.cell * .5, this.W - this.cell * .5);
        GD.FX.sparks(sx, this.baseY - 12, 3, '#ffe9a8', 200, -Math.PI / 2, 1.1);
        GD.FX.p(sx, this.baseY - 14, 0, -1, .06, 7, '#fff3c8', { shape: 'flame' });
      }
      /* босс-полоса */
      if (this.boss) GD.UI.bossHp(this.boss);
    }
    spawnBullet(o) { o.owner = o.owner || null; this.bullets.push(new Bullet(o)); }

    /* ---------- отрисовка ---------- */
    get baseY() { return this.topPad + this.field.rows * this.cell; }
    draw() {
      const c = this.ctx, W = this.W, H = this.H;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      if (!this.field) return;
      c.save();
      c.translate(GD.FX.shakeX, GD.FX.shakeY);
      /* фон */
      c.drawImage(this.statCv, 0, 0, W, H);
      GD.FX.drawDecals(c);
      /* эмбиент-огни: фонари, чаши, голографии */
      this.drawAmbient(c);
      /* прицел космоудара */
      for (const o of this.orbitals) this.drawOrbital(c, o);
      /* радиус выбранной турели */
      this.drawRanges(c);
      /* объекты сортировкой по Y */
      const list = [];
      for (const t of this.turrets) list.push(t);
      for (const e of this.enemies) list.push(e);
      const key = o => (o.y !== undefined ? o.y : o.cy);
      list.sort((a, b) => key(a) - key(b));
      for (const o of list) o.draw(c, this);
      for (const b of this.bullets) b.draw(c);
      for (const b of this.ebullets) this.drawEBullet(c, b);
      this.drawNorth(c);
      this.drawBase(c);
      GD.FX.draw(c);
      this.weather.draw(c, this.biome);
      c.restore();
      GD.FX.drawFlash(c);
      if (this.placing) this.drawGhost(c);
    }
    drawEBullet(c, b) {
      c.save(); c.globalCompositeOperation = 'lighter';
      const r = b.laser ? 12 : 8;
      GD.Glow.blit(c, 'core', b.col, b.x, b.y, r);
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.beginPath(); c.arc(b.x, b.y, r * .22, 0, TAU); c.fill();
      c.restore();
    }
    drawOrbital(c, o) {
      const p = o.t / o.dur;
      c.save();
      c.globalCompositeOperation = 'lighter';
      /* наведение */
      const k = Math.min(1, p);
      c.strokeStyle = 'rgba(185,242,255,' + (.4 + .5 * Math.sin(o.t * 14)) + ')';
      c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.arc(o.x, o.y, o.r * (1.6 - .6 * k), 0, TAU); c.stroke();
      c.setLineDash([]);
      c.beginPath(); c.moveTo(o.x - o.r, o.y); c.lineTo(o.x + o.r, o.y); c.moveTo(o.x, o.y - o.r); c.lineTo(o.x, o.y + o.r); c.stroke();
      /* луч */
      if (o.done) {
        const q = clamp(1 - (o.t - o.dur) / .8, 0, 1);
        const w = 34 * q + 6;
        const g = c.createLinearGradient(o.x - w, 0, o.x + w, 0);
        g.addColorStop(0, 'rgba(120,220,255,0)'); g.addColorStop(.5, 'rgba(240,255,255,' + (0.95 * q) + ')'); g.addColorStop(1, 'rgba(120,220,255,0)');
        c.fillStyle = g; c.fillRect(o.x - w, 0, w * 2, o.y);
        GD.Glow.blit(c, 'core', 'rgba(170,235,255,1)', o.x, o.y, o.r * 1.6 * q, .9 * q);
      }
      c.restore();
    }
    drawRanges(c) {
      const t = this.selected;
      if (!t) return;
      c.save();
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(t.cx, t.cy, t.range * .3, t.cx, t.cy, t.range);
      g.addColorStop(0, 'rgba(120,220,255,0)'); g.addColorStop(.75, 'rgba(120,220,255,0.05)'); g.addColorStop(1, 'rgba(120,220,255,0.16)');
      c.fillStyle = g; c.beginPath(); c.arc(t.cx, t.cy, t.range, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(140,230,255,0.5)'; c.lineWidth = 1.4; c.setLineDash([7, 6]);
      c.beginPath(); c.arc(t.cx, t.cy, t.range, 0, TAU); c.stroke(); c.setLineDash([]);
      c.restore();
    }
    drawGhost(c) {
      const d = TURRETS.DEFS[this.placing];
      if (!d) { this.clearPlacing(); return; }
      const armed = this.armed;
      let cc, rr;
      if (armed) { cc = armed.cc; rr = armed.rr; }
      else { const p = this.cellAt(this.hoverX, this.hoverY); cc = p.cc; rr = p.rr; }
      if (cc < 0 || rr < 0 || cc >= this.field.cols || rr >= this.field.rows) return;
      const x = (cc + .5) * this.cell, y = this.topPad + (rr + .5) * this.cell;
      const free = this.cellFree(cc, rr) && this.scrap >= d.cost;
      const R = d.range * this.cell;
      const pulse = armed ? .5 + .5 * Math.sin(this.time * 7) : 1;
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = free ? 'rgba(120,255,180,0.1)' : 'rgba(255,80,60,0.12)';
      c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill();
      c.strokeStyle = free ? 'rgba(120,255,180,' + (armed ? (.45 + .5 * pulse).toFixed(3) : '0.6') + ')' : 'rgba(255,80,60,0.6)';
      c.lineWidth = armed ? 2.4 : 1.6; c.setLineDash([8, 6]); c.beginPath(); c.arc(x, y, R, 0, TAU); c.stroke(); c.setLineDash([]);
      c.restore();
      c.save();
      c.globalAlpha = .75;
      const fake = { d, lvl: 1, flash: 0, angle: -1.05, spin: this.time * 2, recoil: 0, target: null, cx: x, cy: y, maxHp: 1, hp: 1, game: this };
      if (!free) c.filter = 'grayscale(1) brightness(0.7)';
      c.translate(x, y);
      TURRETS.Turret.prototype.drawBase.call(fake, c);
      try { (TURRETS.ART[d.art] || function () { })(c, fake, this.cell, this.time, 0); } catch (e) { }
      c.restore();
      /* рамка клетки */
      c.strokeStyle = free ? 'rgba(140,255,190,0.8)' : 'rgba(255,90,70,0.8)';
      c.lineWidth = 2; gfx.rr(c, cc * this.cell + 2, this.topPad + rr * this.cell + 2, this.cell - 4, this.cell - 4, 4); c.stroke();
      if (!armed) return;
      this.drawArmedMark(c, d, cc, rr, free, pulse);
      /* на ПК показываем, что прицел можно перенести */
      if (!('ontouchstart' in window)) {
        const h = this.cellAt(this.hoverX, this.hoverY);
        if ((h.cc !== cc || h.rr !== rr) && this.cellFree(h.cc, h.rr)) {
          c.save();
          c.strokeStyle = 'rgba(180,220,255,0.5)'; c.lineWidth = 1.5; c.setLineDash([5, 5]);
          gfx.rr(c, h.cc * this.cell + 2, this.topPad + h.rr * this.cell + 2, this.cell - 4, this.cell - 4, 4);
          c.stroke(); c.setLineDash([]); c.restore();
        }
      }
    }
    /* явные уголки + подпись «подтверди» на выбранной клетке */
    drawArmedMark(c, d, cc, rr, free, pulse) {
      const s = this.cell, bx = cc * s, by = this.topPad + rr * s, k = s * .34;
      const x = bx + s * .5;
      const panelAbove = by + s * .5 - s * .75 > 92; /* где встанет DOM-панель подтверждения */
      const ly = panelAbove ? by + s + 13 : by - 4;
      c.save();
      c.strokeStyle = free ? 'rgba(150,255,200,' + (.45 + .55 * pulse).toFixed(3) + ')' : 'rgba(255,110,90,0.9)';
      c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round';
      const corners = [[bx + 3, by + 3, 1, 1], [bx + s - 3, by + 3, -1, 1], [bx + 3, by + s - 3, 1, -1], [bx + s - 3, by + s - 3, -1, -1]];
      c.beginPath();
      for (const q of corners) { c.moveTo(q[0] + q[2] * k, q[1]); c.lineTo(q[0], q[1]); c.lineTo(q[0], q[1] + q[3] * k); }
      c.stroke();
      c.restore();
      const label = free ? 'ПОДТВЕРДИ · ' + d.cost : 'НЕДОСТУПНО';
      c.save();
      c.font = '900 ' + Math.round(11 * clamp(this.scaleU, .85, 1.3)) + 'px "Segoe UI",Roboto,sans-serif';
      const w = c.measureText(label).width + 14;
      const ty = clamp(ly, 12, this.H - 8);
      c.fillStyle = 'rgba(5,12,9,0.9)'; gfx.rr(c, x - w / 2, ty - 12, w, 17, 4); c.fill();
      c.strokeStyle = free ? 'rgba(150,255,200,0.75)' : 'rgba(255,110,90,0.75)';
      c.lineWidth = 1; gfx.rr(c, x - w / 2, ty - 12, w, 17, 4); c.stroke();
      c.fillStyle = free ? '#b4ffd6' : '#ffb0a4';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(label, x, ty - 3);
      c.restore();
    }
    drawBase(c) {
      const W = this.W, y = this.baseY, cell = this.cell;
      const hpK = clamp(this.baseHp / this.baseMax, 0, 1);
      c.save();
      /* ров */
      const g = c.createLinearGradient(0, y - cell * .5, 0, y + cell * .9);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.4, 'rgba(6,10,14,0.85)'); g.addColorStop(1, '#05080c');
      c.fillStyle = g; c.fillRect(0, y - cell * .5, W, H_of(this) - y + cell);
      /* силовое поле */
      const pulse = .25 + Math.sin(this.time * 3) * .08 + this.baseFx * .5;
      c.globalCompositeOperation = 'lighter';
      const pg = c.createLinearGradient(0, y - cell * .8, 0, y);
      pg.addColorStop(0, 'rgba(80,220,255,0)'); pg.addColorStop(1, hpK > .3 ? 'rgba(80,220,255,' + pulse * .5 + ')' : 'rgba(255,80,50,' + pulse * .6 + ')');
      c.fillStyle = pg; c.fillRect(0, y - cell * .8, W, cell * .8);
      /* гексы поля */
      c.strokeStyle = hpK > .3 ? 'rgba(120,225,255,' + (pulse * .3).toFixed(3) + ')' : 'rgba(255,110,70,' + (pulse * .34).toFixed(3) + ')';
      c.lineWidth = 1; c.beginPath();
      const hex = 15, hy = y - cell * .34;
      for (let r = 0; r < 2; r++) for (let x = -hex; x < W + hex; x += hex * 2) {
        const ox = x + (r % 2 ? hex : 0), yy = hy + r * 6;
        c.moveTo(ox + hex * .5, yy - hex * .42); c.lineTo(ox + hex, yy); c.lineTo(ox + hex * .5, yy + hex * .42);
        c.lineTo(ox, yy); c.closePath();
      }
      c.stroke();
      c.globalCompositeOperation = 'source-over';
      /* крепостная стена с закрытыми воротами — готовый кадр */
      this.blitBand(c, this.wallCv, this.wallBand);
      /* огни, маяки, свечение створок */
      if (this.art) GD.Art.baseLights(c, this.art, this.time, { hpK, hit: this.gateHit || 0 });
      /* повреждения: дым из-за стены */
      if (hpK < .75 && Math.random() < (1 - hpK) * .6) GD.FX.smoke(rnd(0, W), y + 2, 1, 'rgba(46,42,40,.55)', 14, 1.6);
      /* искры при разрушении */
      if (hpK < .4 && Math.random() < (1 - hpK) * .3) GD.FX.sparks(rnd(0, W), y + 4, 3, '#ffb060', 90, -Math.PI / 2, 1.2);
      /* мигание урона */
      if (this.baseFx > 0) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = 'rgba(255,60,40,' + (this.baseFx * .4) + ')';
        c.fillRect(0, 0, W, H_of(this));
      }
      c.restore();
    }
    /* «живые» огни уровня: один спрайт на источник, пульсация по синусу */
    drawAmbient(c) {
      const pts = this.glowPts;
      if (!pts || !pts.length) return;
      const q = GD.q == null ? 1 : GD.q;
      if (q < .3) return;
      const n = q > .7 ? pts.length : Math.ceil(pts.length * .55);
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const g = pts[i];
        const p = .78 + Math.sin(this.time * (2.6 + g.flick) + g.ph) * .14 * (1 + g.flick)
          + Math.sin(this.time * 9.3 + g.ph * 3.1) * .07 * g.flick;
        GD.Glow.pool(c, g.kind, g.col, g.x, g.y, g.r, g.r * (g.kind === 'lamp' ? .5 : .72), p * (g.kind === 'soft' ? .5 : .8));
      }
      c.restore();
    }
    /* северный пролом: рисуется поверх всего, роботы «вылезают» из-под стены */
    drawNorth(c) {
      if (!this.northCv) return;
      this.blitBand(c, this.northCv, this.northBand);
      if (this.art) GD.Art.northLights(c, this.art, this.time, { spawn: this.spawnFlash || 0 });
    }
    /* ---------- сохранение ---------- */
    save() {
      GD.TG.save('sktd_save_v1', { level: this.savedLevel, best: this.best, kills: this.totalKills, mute: GD.Audio.muted });
    }
    /* ---------- сейбы забега: чекпоинт текущего состояния игры ----------
       nw = сколько волн уже отбито (следующая — индекс nw);
       если выход случился в середине волны — восстановление отыграет её заново */
    saveRun() {
      if (this.state === 'menu' || this.state === 'over' || this.state === 'over_level') return;
      const nw = this.state === 'break' ? this.waveNum + 1 : this.waveNum;
      const ti = [];
      for (const t of this.turrets) ti.push([t.id, t.gx, t.gy, t.lvl, Math.round(t.hp), t.maxHp, t.invested]);
      GD.Saves.put({
        id: this.runId || ('lv' + this.level), lv: this.level, nw,
        bt: this.state === 'break' ? Math.round(this.breakT) : 0,
        scrap: Math.round(this.scrap), hp: Math.round(this.baseHp * 10) / 10,
        kills: this.kills | 0, leaked: this.leaked | 0, ti, ts: Date.now()
      });
    }
    lastRun() { return GD.Saves.last(); }
    continueRun() {
      const s = GD.Saves.last();
      this.hide();
      if (!s || !s.lv) { this.buildLevel(this.savedLevel || 1); return; }
      this.restoring = true;
      this.buildLevel(s.lv);
      this.restoring = false;
      this.applyRun(s);
    }
    applyRun(s) {
      this.scrap = s.scrap > 0 ? s.scrap : this.scrap;
      this.baseHp = clamp(s.hp > 0 ? s.hp : this.baseHp, 1, this.baseMax);
      this.kills = s.kills | 0; this.leaked = s.leaked | 0;
      for (const a of (s.ti || [])) {
        const id = a[0], cc = a[1] | 0, rr = a[2] | 0;
        if (!TURRETS.DEFS[id] || !this.cellFree(cc, rr)) continue;
        const t = new TURRETS.Turret((cc + .5) * this.cell, this.topPad + (rr + .5) * this.cell, cc, rr, id, this);
        t.lvl = clamp(a[3] | 0, 1, TURRETS.MAXLV);
        if (a[5] > 0) t.maxHp = a[5];
        t.hp = clamp(a[4] > 0 ? a[4] : t.maxHp, 1, t.maxHp);
        if (a[6] > 0) t.invested = a[6];
        t.plantT = 0;
        this.turrets.push(t); this.occ[rr][cc] = 1;
      }
      const nw = clamp(s.nw | 0, 0, this.waves.length - 1);
      if (nw === 0) { this.state = 'prep'; this.waveNum = 0; }
      else { this.state = 'break'; this.waveNum = nw - 1; this.breakT = s.bt > 0 ? clamp(s.bt, 2, 12) : 9; }
      this.selected = null; this.placing = null; this.armed = null;
      GD.UI.hud(); GD.UI.refresh(); GD.UI.startLabel(); GD.UI.inspect(null); GD.UI.selectCard(null);
      GD.UI.announce('УРОВЕНЬ ' + this.level, 'Продолжаем · волна ' + (nw + 1) + ' · турелей ' + this.turrets.length);
      this.saveRun();
    }
    load(cb) {
      GD.TG.load('sktd_save_v1', d => {
        if (d) { this.savedLevel = d.level || 1; this.best = d.best || 0; this.totalKills = d.kills || 0; }
        cb && cb();
      });
    }
    /* кнопка МЕНЮ в бою: игра ставится на паузу и открывается пауз-меню */
    openMenu() {
      if (this.menuOpen) return;
      if (this.state === 'menu' || this.state === 'over' || this.state === 'over_level') return;
      this.menuOpen = true;
      /* запоминаем, не стояла ли игра на паузе вручную, чтобы потом не снять её лишним */
      this.pausedByMenu = !this.paused;
      this.paused = true;
      const pbbm = document.getElementById('btnPause'); if (pbbm) pbbm.classList.add('on');
      this.placing = null; this.selected = null; this.armed = null;
      GD.UI.selectCard(null); GD.UI.inspect(null);
      this.savedLevel = Math.max(this.savedLevel, this.level);
      this.save();
      this.saveRun();
      S.aim(0);
      GD.TG.haptic('select');
      GD.UI.menu('pause');
    }
    /* ПРОДОЛЖИТЬ в пауз-меню: меню исчезает, игра снимается с паузы */
    closeMenu() {
      if (!this.menuOpen) return;
      this.menuOpen = false;
      if (this.pausedByMenu) this.paused = false;
      this.pausedByMenu = false;
      const pb = document.getElementById('btnPause'); if (pb) pb.classList.toggle('on', this.paused);
      this.hide();
      GD.UI.hud(); GD.UI.refresh(); GD.UI.startLabel();
      GD.TG.haptic('select');
    }
    /* выход в главное меню из паузы: прогресс уровня уже сохранён в openMenu */
    exitToMenu() {
      this.menuOpen = false;
      this.pausedByMenu = false;
      this.showMenu();
    }
    showMenu(screen) {
      this.state = 'menu';
      this.menuOpen = false;
      this.pausedByMenu = false;
      this.paused = false;
      const pb = document.getElementById('btnPause'); if (pb) pb.classList.remove('on');
      GD.UI.hud();
      GD.UI.menu(screen);
      this.overlayAction = () => { this.hide(); this.buildLevel(this.savedLevel || 1); };
    }
    resetProgress() {
      this.savedLevel = 1; this.best = 0; this.totalKills = 0; this.kills = 0;
      this.save();
      GD.Saves.clear();
      S.deny();
      this.showMenu('main');
      GD.UI.toast('ПРОГРЕСС СБРОШЕН');
    }
  }
  function H_of(g) { return g.H; }

  GD.Game = Game;
})(window.GD);
