/* ============ TURRETS: защитные механизмы человека ============ */
(function (GD) {
  'use strict';
  const { TAU, clamp, lerp, rnd, gfx, dist } = GD;
  const S = GD.Audio.SFX;

  const DMG_MUL = [1, 1.6, 2.45, 3.6];
  let UID = 1;
  const RATE_MUL = [1, 1.14, 1.3, 1.5];
  const RANGE_MUL = [1, 1.07, 1.14, 1.22];
  const MAXLV = 4;
  /* допуск наводки ствола (рад) и страховка по времени: без них турель
     стреляет по инерционному углу — первый выстрел уходит мимо цели */
  const AIM_TOL = .06, AIM_MAX = .45;

  /* ---------- определения ---------- */
  const DEFS = {
    mg: {
      name: 'Пулемёт', short: 'ПУЛЕМЁТ', cost: 60, dmg: 3.2, rate: 4, range: 2.05, hp: 110, aa: .55,
      col: '#8ea387', col2: '#4a5a48', glow: '#ffe08a', unlock: 1, art: 'mg',
      desc: 'Скорострельный, дешёвый. Слабо по броне.'
    },
    shotgun: {
      name: 'Дробовик KS-23', short: 'ДРОБОВИК', cost: 95, dmg: 6, rate: 1.05, range: 2.2, hp: 130, aa: 0, pellets: 6,
      col: '#b98b54', col2: '#5c3f22', glow: '#ffb45a', unlock: 1, art: 'shotgun',
      desc: 'Веер картечи вблизи, дробит пехоту.'
    },
    tesla: {
      name: 'Катушка Теслы', short: 'ТЕСЛА', cost: 150, dmg: 15, rate: 1.35, range: 2.35, hp: 115, aa: 1, chain: 3,
      col: '#6fa8c9', col2: '#2a4a5e', glow: '#9df0ff', unlock: 1, art: 'tesla',
      desc: 'Цепная молния по 3 целям, по воздуху x1.35.'
    },
    mortar: {
      name: 'Миномёт «Тюльпан»', short: 'МИНОМЁТ', cost: 130, dmg: 36, rate: .54, range: 3.5, hp: 140, aa: 0, splash: 25, lead: .6,
      col: '#7d8b6c', col2: '#3d4634', glow: '#ff9d3d', unlock: 1, art: 'mortar',
      desc: 'Навесной взрыв по площади. Не видит воздух.'
    },
    flame: {
      name: 'Огнемёт «Гейзер»', short: 'ОГНЕМЁТ', cost: 115, dmg: 3.6, rate: 13, range: 1.65, hp: 120, aa: 0, burn: 6,
      col: '#c46a3a', col2: '#5a2c16', glow: '#ff7a1e', unlock: 2, art: 'flame',
      desc: 'Зажигательная струя, поджигает и плавит броню.'
    },
    rail: {
      name: 'Рельсотрон', short: 'РЕЛЬСА', cost: 195, dmg: 88, rate: .5, range: 4.3, hp: 120, aa: 1, pierce: true,
      col: '#9a86c9', col2: '#3b3060', glow: '#d9c2ff', unlock: 3, art: 'rail',
      desc: 'Пробивает колонну насквозь, игнорирует броню.'
    },
    missile: {
      name: 'ПЗРК «Игла-С»', short: 'РАКЕТЫ', cost: 175, dmg: 30, rate: .72, range: 3.4, hp: 125, aa: 1.6, splash: 26, homing: 1,
      col: '#8d9aa8', col2: '#3b444e', glow: '#ff6a3d', unlock: 3, art: 'missile',
      desc: 'Самонаводящиеся ракеты, +60% по воздуху.'
    },
    laser: {
      name: 'Лазер «Стрела-2»', short: 'ЛАЗЕР', cost: 215, dmg: 40, rate: 12, range: 3.1, hp: 118, aa: 1, beam: true, pierce: true,
      col: '#68b0a0', col2: '#234840', glow: '#6dffb0', unlock: 4, art: 'laser',
      desc: 'Непрерывный луч, прожигает броню, не промахивается.'
    },
    cryo: {
      name: 'Крио-излучатель', short: 'КРИО', cost: 135, dmg: 4, rate: 1.2, range: 2.35, hp: 125, aa: 1, slow: .58, slowT: 1.7,
      col: '#79c3e8', col2: '#24506b', glow: '#cdf4ff', unlock: 2, art: 'cryo',
      desc: 'Замораживает шасси дроидов, -58% скорости.'
    },
    flak: {
      name: 'Зенитка «Шилка»', short: 'ЗИТ', cost: 160, dmg: 7, rate: 2.2, range: 2.9, hp: 130, aa: 1.4, pellets: 3, splash: 20,
      col: '#8a9b6a', col2: '#414b32', glow: '#ffd76b', unlock: 4, art: 'flak',
      desc: 'Шрапнель с_airburst. Ужас воздушного десанта.'
    },
    emp: {
      name: 'ЭМИ-пушка', short: 'ЭМИ', cost: 185, dmg: 4, rate: .48, range: 2.6, hp: 125, aa: 1, emp: true, stunT: 1.5, stunR: 42,
      col: '#5f7fd0', col2: '#243363', glow: '#a8c4ff', unlock: 6, art: 'emp',
      desc: 'Импульс оглушает дроидов в радиусе.'
    },
    repair: {
      name: 'Полевая мастерская', short: 'РЕМОНТ', cost: 150, dmg: 0, rate: .8, range: 2.4, hp: 200, aa: 0, healTurret: true,
      col: '#c9b06a', col2: '#5f5230', glow: '#8dff9d', unlock: 5, art: 'repair',
      desc: 'Чинит турели вокруг и латает бункер (+2 ОН/сек).'
    },
    orbital: {
      name: 'Космоудар «Возмездие»', short: 'КОСМОУДАР', cost: 330, dmg: 165, rate: .24, range: 9, hp: 130, aa: 1, orbital: true, splash: 62,
      col: '#a0aec0', col2: '#2b3543', glow: '#b9f2ff', unlock: 7, art: 'orbital',
      desc: 'Наводит орбитальный лазер на самый плотный скопление.'
    }
  };
  const ORDER = ['mg', 'shotgun', 'tesla', 'mortar', 'flame', 'cryo', 'rail', 'missile', 'laser', 'flak', 'emp', 'repair', 'orbital'];

  function stat(tr, base, mul, lvl) { return base * mul[Math.min(lvl, MAXLV) - 1]; }
  function upgradeCost(def, lvl) { return Math.round(def.cost * [.82, 1.25, 1.95][lvl - 1] || 0); }
  function sellValue(tr) { return Math.round(tr.invested * .6); }

  /* ============ ТУРЕЛЬ ============ */
  class Turret {
    constructor(cx, cy, gx, gy, id, game) {
      const d = DEFS[id];
      this.id = id; this.d = d; this.game = game; this.uid = UID++;
      this.cx = cx; this.cy = cy; this.gx = gx; this.gy = gy;
      this.lvl = 1; this.invested = d.cost;
      this.angle = Math.PI / 2; this.want = Math.PI / 2;
      this.cool = rnd(0, .25); this.recoil = 0; this.t = rnd(0, 10);
      /* бронепластины по уровню: ответный огонь врагов растёт с уровнем, а
         прочность турелей без скейла означала «волна танкеток сносит гарнизон
         целиком» — на 6+ уровнях турели гибли быстрее, чем успевали стрелять */
      const plate = 1 + .3 * Math.max(0, (game && game.level ? game.level - 1 : 0));
      this.maxHp = Math.round(d.hp * plate); this.hp = this.maxHp;
      this.target = null; this.beamT = 0; this.charge = 0; this.spin = 0;
      this.kills = 0; this.dmgDone = 0; this.flash = 0; this.plantT = .22;
      this.aimed = false; this.aimT = 0;
    }
    get dmg() { return stat(0, this.d.dmg, DMG_MUL, this.lvl); }
    get rate() { return stat(0, this.d.rate, RATE_MUL, this.lvl); }
    get range() { return stat(0, this.d.range, RANGE_MUL, this.lvl) * this.game.cell; }
    get dead() { return this.hp <= 0; }

    findTarget(g) {
      const R = this.range, R2 = R * R;
      let best = null, bestD = -1, airCount = 0;
      for (const e of g.enemies) {
        if (e.dead) continue;
        const air = e.air;
        const canAir = (this.d.aa || 0) > 0;
        if (air && !canAir && !this.d.orbital) continue;
        const dd = GD.dist2(this.cx, this.cy, e.x, e.y);
        if (dd > R2) continue;
        /* приоритет: дальше всех прошёл по маршруту */
        if (e.d > bestD) { bestD = e.d; best = e; }
        if (air) airCount++;
      }
      return best;
    }

    update(dt, g) {
      this.t += dt;
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
      if (this.plantT > 0) { this.plantT -= dt; return; }
      /* ремонтник */
      if (this.d.healTurret) {
        this.cool -= dt;
        if (this.cool <= 0) {
          this.cool = 1 / this.rate;
          let did = false;
          for (const t2 of g.turrets) {
            if (t2 === this || t2.hp >= t2.maxHp) continue;
            if (dist(this.cx, this.cy, t2.cx, t2.cy) <= this.range) {
              t2.hp = Math.min(t2.maxHp, t2.hp + t2.maxHp * .06 * this.lvl);
              did = true; GD.FX.p(t2.cx + rnd(-8, 8), t2.cy - 10, rnd(-12, 12), -34, .7, 2.2, '#8dff9d', { grav: -20, glow: true });
            }
          }
          g.enemies.forEach(e => { if (!e.dead && dist(this.cx, this.cy, e.x, e.y) <= this.range) e.damage(this.dmg || 0, { silent: true }); });
          if (g.baseHp < g.baseMax && g.level >= 1) { g.baseHp = Math.min(g.baseMax, g.baseHp + .35 * this.lvl * .3); }
          if (did) S.repair(this.cx);
          this.spin += 1;
        }
        this.spin += dt * 2.2;
        return;
      }
      /* обычный бой */
      this.cool -= dt;
      const prev = this.target;
      const tg = this.target && !this.target.dead && dist(this.cx, this.cy, this.target.x, this.target.y) <= this.range * 1.05 ? this.target : this.findTarget(g);
      this.target = tg;
      if (tg) {
        if (tg !== prev) { this.aimT = 0; this.aimed = false; }   /* цель сменилась — ствол наводится заново */
        this.want = Math.atan2(tg.y - this.cy, tg.x - this.cx);
        this.aimT += dt;
      } else { this.aimT = 0; this.aimed = false; }
      const turn = this.d.art === 'rail' ? 4.5 : 8;
      this.angle = GD.angLerp(this.angle, this.want, Math.min(1, dt * turn));
      if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 6);
      this.spin += dt * (this.d.art === 'tesla' || this.d.art === 'repair' ? 3 : 1.2);

      /* непрерывный луч */
      if (this.d.beam) {
        if (tg && this.cool <= 0) {
          const dps = this.dmg;
          /* броня должна снимать 1 раз за тик, а не за кадр: копить и бить раз в 0.3 с */
          this.beamAcc = (this.beamAcc || 0) + dps * dt;
          this.beamTick = (this.beamTick || 0) + dt;
          if (this.beamTick >= .3) {
            const tick = this.beamAcc; this.beamAcc = 0; this.beamTick = 0;
            const dealt = tg.damage(tick, { silent: true, col: this.d.glow, bonusVsAir: (this.d.aa || 0) > 1, pierce: !!this.d.pierce });
            this.dmgDone += dealt || 0;
          }
          this.beamT += dt;
          if (Math.random() < dt * 26) {
            GD.FX.sparks(tg.x, tg.y - tg.size * .4, 2, this.d.glow, 70);
            GD.FX.flame(tg.x, tg.y - tg.size * .5, 1, '#ff8a4a', 40);
          }
          /* непрерывный гул луча: голос живёт, пока горит луч */
          S.jet('be' + this.uid, 'beam', this.cx);
        } else { this.beamT = Math.max(0, this.beamT - dt * 3); S.jet('be' + this.uid, 'beam', null); }
        return;
      }

      if (this.cool > 0 || !tg) return;
      /* НАВОДКА: ствол догоняет цель с ограниченной скоростью, поэтому
         первый выстрел после установки/смены цели уходил по инерционному
         углу (при появлении — это π/2, вниз). Дробь, огонь, конус крио и
         рельса не самонаводятся — весь залп пролетал мимо. Ждём сходимость,
         но не дольше AIM_MAX, иначе турель зависнет на цели, идущей по дуге. */
      if (!this.aimed) {
        const da = Math.abs(((this.want - this.angle + Math.PI * 3) % TAU) - Math.PI);
        if (da > AIM_TOL && this.aimT < AIM_MAX * 8 / turn) return;
        this.aimed = true;
      }
      this.cool = 1 / this.rate;
      this.recoil = 1;
      this.fire(g, tg);
    }

    fire(g, tg) {
      const d = this.d, dmg = this.dmg;
      const mx = this.cx + Math.cos(this.angle) * this.game.cell * .3;
      const my = this.cy + Math.sin(this.angle) * this.game.cell * .3 - this.game.cell * .22;
      switch (d.art) {
        case 'mg': {
          const spread = .05;
          const a = this.angle + rnd(-spread, spread);
          g.spawnBullet({ x: mx, y: my, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, dmg, col: d.glow, target: tg, kind: 'bullet', owner: this });
          GD.FX.sparks(mx, my, 3, '#ffe9a8', 120, this.angle, .5);
          GD.FX.smoke(mx, my, 1, 'rgba(90,90,90,.5)', 18, .4);
          S.shootMG(mx); break;
        }
        case 'shotgun': {
          const n = d.pellets + Math.floor(this.lvl / 2);
          /* осыпь сходится к дистанции цели: вблизи — смертельно, на пределе — мажет */
          const spread = clamp(17 / Math.max(30, dist(this.cx, this.cy, tg.x, tg.y)), .075, .3);
          for (let i = 0; i < n; i++) {
            const a = this.angle + rnd(-spread, spread);
            const sp = rnd(560, 760);
            g.spawnBullet({ x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg, col: '#ffd08a', kind: 'pellet', life: .26, owner: this });
          }
          GD.FX.flame(mx, my, 5, '#ffbb55', 150, this.angle);
          GD.FX.smoke(mx, my, 3, 'rgba(110,110,110,.6)', 40, .5);
          GD.FX.shake(1.2); S.shootShell(mx); break;
        }
        case 'tesla': {
          let cur = tg, prevX = mx, prevY = my, hit = [];
          const chains = d.chain + (this.lvl >= 3 ? 1 : 0) + (this.lvl >= 4 ? 1 : 0);
          for (let i = 0; i < chains && cur; i++) {
            GD.FX.arc(prevX, prevY, cur.x, cur.y - cur.size * .4, d.glow, .18, 14, 2.4);
            cur.damage(dmg * (1 - i * .12), { col: d.glow, bonusVsAir: true });
            this.dmgDone += dmg;
            hit.push(cur);
            prevX = cur.x; prevY = cur.y - cur.size * .4;
            let next = null, nd = 1e9;
            const rr = g.cell * 1.7;
            for (const e of g.enemies) {
              if (e.dead || hit.indexOf(e) >= 0) continue;
              const dd = GD.dist2(prevX, prevY, e.x, e.y);
              if (dd < rr * rr && dd < nd) { nd = dd; next = e; }
            }
            cur = next;
          }
          GD.FX.ring(mx, my, 16, d.glow, .25);
          S.shootTesla(mx); break;
        }
        case 'mortar': {
          const spd = (tg.baseSpd || 40) * (tg.slowT > 0 ? tg.slowK : 1);
          const pl = g.pathAt(tg.d + spd * (d.lead || .6), tg.lane);
          /* страховка от NaN: иначе снаряд навсегда повиснет без взрыва */
          const tx = isFinite(pl.x) ? pl.x : tg.x, ty = isFinite(pl.y) ? pl.y : tg.y;
          g.spawnBullet({ x: mx, y: my, target: tg, tx, ty, dmg, kind: 'shell', arc: true, splash: d.splash * (1 + this.lvl * .08), col: d.glow, owner: this });
          GD.FX.flame(mx, my, 6, '#ffce6a', 120, -Math.PI / 2);
          GD.FX.smoke(mx, my, 4, 'rgba(120,120,120,.6)', 40, .8);
          GD.FX.shake(2); S.shootMortar(mx); break;
        }
        case 'flame': {
          const nrg = this.range;
          for (const e of g.enemies) {
            if (e.dead || e.air) continue;
            const dd = dist(this.cx, this.cy, e.x, e.y);
            if (dd > nrg) continue;
            const a = Math.atan2(e.y - this.cy, e.x - this.cx);
            let da = Math.abs(((a - this.angle + Math.PI * 3) % TAU) - Math.PI);
            if (da < .55) { e.damage(dmg, { silent: true }); e.burn(d.burn * DMG_MUL[this.lvl - 1] * .8, 1.6); this.dmgDone += dmg; }
          }
          for (let i = 0; i < 7; i++) {
            const a = this.angle + rnd(-.3, .3), sp = rnd(.5, 1) * nrg * 3.4;
            GD.FX.p(mx, my, Math.cos(a) * sp, Math.sin(a) * sp, rnd(.2, .38), rnd(4, 9), '#ff8a2a', { shape: 'flame', drag: .9, grav: -40 });
          }
          /* рёв струи: непрерывный голос, живёт, пока льётся огонь */
          S.jet('fl' + this.uid, 'flame', mx);
          S.shootFlame(mx); break;
        }
        case 'cryo': {
          /* конус холода: слабый урон, но вешает заморозку на всех в секторе */
          const nrg = this.range;
          for (const e of g.enemies) {
            if (e.dead) continue;
            if (dist(this.cx, this.cy, e.x, e.y) > nrg) continue;
            const a = Math.atan2(e.y - this.cy, e.x - this.cx);
            const da = Math.abs(((a - this.angle + Math.PI * 3) % TAU) - Math.PI);
            if (da < .6) {
              e.damage(dmg, { silent: true, col: d.glow });
              e.slow(1 - d.slow, d.slowT + this.lvl * .12);
              this.dmgDone += dmg;
              if (Math.random() < .6) GD.FX.p(e.x + rnd(-6, 6), e.y - e.size * .4, rnd(-22, 22), rnd(-30, -6), .5, 2.4, '#cdf4ff', { grav: 26 });
            }
          }
          for (let i = 0; i < 5; i++) {
            const a = this.angle + rnd(-.34, .34), sp = rnd(.4, 1) * nrg * 2.6;
            GD.FX.p(mx, my, Math.cos(a) * sp, Math.sin(a) * sp, rnd(.25, .5), rnd(3, 6), '#cdf4ff', { drag: .92, grav: 8 });
          }
          S.shootCryo(mx); break;
        }
        case 'rail': {
          const a = this.angle, len = this.range * 1.4;
          const x2 = this.cx + Math.cos(a) * len, y2 = this.cy + Math.sin(a) * len;
          for (const e of g.enemies) {
            if (e.dead) continue;
            const t = GD.clamp(((e.x - this.cx) * Math.cos(a) + (e.y - this.cy) * Math.sin(a)), 0, len);
            const px = this.cx + Math.cos(a) * t, py = this.cy + Math.sin(a) * t;
            if (dist(px, py, e.x, e.y) < e.size * .8 + 6) {
              e.damage(dmg, { pierce: true, col: d.glow, big: true, bonusVsAir: true });
              this.dmgDone += dmg;
              GD.FX.sparks(e.x, e.y - e.size * .4, 8, '#e6ccff', 180);
            }
          }
          GD.FX.arc(this.cx, this.cy - 8, x2, y2, '#e2cfff', .22, 6, 3.4);
          GD.FX.ring(mx, my, 22, '#d9c2ff', .3);
          GD.FX.flash('rgba(200,160,255,0.16)', .2); GD.FX.shake(3.2);
          S.shootRail(mx); break;
        }
        case 'missile': {
          g.spawnBullet({ x: mx, y: my, target: tg, dmg, kind: 'rocket', splash: d.splash, col: d.glow, owner: this, speed: 300, aaMul: d.aa });
          GD.FX.smoke(mx, my, 3, 'rgba(160,160,160,.6)', 26, .6);
          S.shootRocket(mx); break;
        }
        case 'flak': {
          const n = d.pellets;
          for (let i = 0; i < n; i++) {
            const a = this.angle + rnd(-.12, .12);
            g.spawnBullet({ x: mx, y: my, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, dmg, kind: 'flak', fuse: .34 + i * .06, splash: d.splash, col: d.glow, owner: this, target: tg, aaMul: d.aa });
          }
          GD.FX.flame(mx, my, 4, '#ffe08a', 130, this.angle);
          GD.FX.shake(1.6); S.shootFlak(mx); break;
        }
        case 'emp': {
          const R = d.stunR + this.lvl * 8;
          GD.FX.ring(this.cx, this.cy, R * 1.5, d.glow, .45);
          GD.FX.ring(this.cx, this.cy, R, '#ffffff', .3);
          GD.FX.flash('rgba(140,180,255,0.18)', .22);
          for (const e of g.enemies) {
            if (e.dead) continue;
            if (dist(this.cx, this.cy, e.x, e.y) < R + e.size * .4) {
              e.damage(dmg, { silent: true }); e.stun(d.stunT + this.lvl * .18);
              GD.FX.sparks(e.x, e.y - e.size * .4, 5, '#cfe0ff', 100);
            }
          }
          S.shootEmp(mx); break;
        }
        case 'orbital': {
          /* выбрать самую плотную точку скопления врагов */
          let bx = 0, by = 0, best = 0, found = false;
          for (const e of g.enemies) {
            if (e.dead) continue;
            let n = 0;
            for (const e2 of g.enemies) if (!e2.dead && GD.dist2(e.x, e.y, e2.x, e2.y) < 5000) n += e2.air ? 1 : 1;
            if (n > best) { best = n; bx = e.x; by = e.y; found = true; }
          }
          if (!found) { this.cool = .3; return; }
          g.callOrbital(this, bx, by, dmg, d.splash * (1 + this.lvl * .12));
          S.orbital(mx); break;
        }
      }
    }

    damage(v) {
      if (this.d.healTurret) v *= 1.4;
      this.hp -= v; this.flash = 1;
      if (this.hp <= 0) {
        S.jet('be' + this.uid, 'beam', null);
        S.jet('fl' + this.uid, 'flame', null);
        GD.FX.explodeBig(this.cx, this.cy, 16);
        GD.Audio.SFX.boom(1.4, this.cx);
        GD.FX.text(this.cx, this.cy - 18, 'РАЗРУШЕНА', '#ff7a5a', 12);
      }
    }

    /* ---------- отрисовка ---------- */
    drawBase(c) {
      const cell = this.game.cell, s = cell * .4;
      const d = this.d, flash = this.flash;
      /* бетонная площадка */
      c.fillStyle = 'rgba(0,0,0,0.34)'; c.beginPath(); c.ellipse(0, s * .16, s * 1.02, s * .48, 0, 0, TAU); c.fill();
      const g = c.createLinearGradient(0, -s * .5, 0, s * .5);
      g.addColorStop(0, '#565c63'); g.addColorStop(1, '#2b3035');
      c.fillStyle = g; gfx.rr(c, -s * .88, -s * .42, s * 1.76, s * .92, s * .18); c.fill();
      c.strokeStyle = '#1b1f22'; c.lineWidth = 1.2; c.stroke();
      /* цветная подсветка корпуса — турели читаются по цвету */
      c.globalCompositeOperation = 'lighter';
      const hg = c.createRadialGradient(0, -s * .1, 0, 0, -s * .1, s * 1.1);
      hg.addColorStop(0, d.glow + '2e'); hg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = hg; c.beginPath(); c.ellipse(0, -s * .1, s * 1.02, s * .78, 0, 0, TAU); c.fill();
      c.globalCompositeOperation = 'source-over';
      /* мешки с песком */
      for (let i = -1; i <= 1; i += 2) {
        c.fillStyle = '#6f6c46'; gfx.rr(c, i * s * .8 - s * .19, -s * .1, s * .4, s * .28, s * .1); c.fill();
        c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(i * s * .8 - s * .19, -s * .02, s * .4, 2);
      }
      /* полоска уровня */
      for (let i = 0; i < MAXLV; i++) {
        c.fillStyle = i < this.lvl ? d.glow : 'rgba(255,255,255,0.14)';
        c.fillRect(-s * .5 + i * s * .3, s * .48, s * .2, 2.4);
      }
      if (flash > 0) { c.globalAlpha = flash * .5; c.fillStyle = '#fff'; gfx.rr(c, -s * .88, -s * .42, s * 1.76, s * .92, s * .18); c.fill(); c.globalAlpha = 1; }
    }
    draw(c, g) {
      const cell = this.game.cell;
      c.save(); c.translate(this.cx, this.cy);
      const grow = Math.max(0, Math.min(1, (0.22 - this.plantT) / 0.22));
      /* тень-подложка: турели не сливаются в рядах */
      c.globalAlpha = .5 * grow; c.fillStyle = '#04070a';
      c.beginPath(); c.ellipse(0, cell * .2, cell * .38, cell * .19, 0, 0, TAU); c.fill();
      c.globalAlpha = 1;
      c.save(); c.scale(.96, .96);
      if (grow < 1) { c.scale(grow * 1.1, grow * 1.1); c.globalAlpha = grow; }
      this.drawBase(c);
      c.save();
      const art = ART[this.d.art] || ART.mg;
      art(c, this, cell, this.t, this.recoil, this.angle);
      c.restore();
      c.restore();
      /* HP бар если повреждена */
      if (this.hp < this.maxHp) {
        const w = cell * .6;
        c.fillStyle = 'rgba(0,0,0,.66)'; gfx.rr(c, -w / 2 - 1, -cell * .62, w + 2, 3.6, 1.8); c.fill();
        const k = clamp(this.hp / this.maxHp, 0, 1);
        c.fillStyle = k > .5 ? '#6dff9a' : k > .25 ? '#ffd166' : '#ff5a4a';
        gfx.rr(c, -w / 2, -cell * .62 + .6, w * k, 2.4, 1.2); c.fill();
      }
      c.globalAlpha = 1;
      c.restore();
    }
  }

  /* ---------- рисовка корпусов ---------- */
  function pad(c, r, col) { c.fillStyle = col; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); }
  function steel(c, x0, y0, x1, y1) { return GD.lin(c, x0, y0, x1, y1, [[0, '#9aa4ac'], [.5, '#5c666e'], [1, '#2f353a']]); }
  function muzzle(c, rec, col, size) {
    if (rec <= .05) return;
    const k = rec;
    c.save(); c.globalCompositeOperation = 'lighter';
    GD.Glow.blit(c, 'core', col, 0, 0, size * 3.2 * k, .95 * k);
    c.fillStyle = '#fff'; c.beginPath();
    for (let i = 0; i < 4; i++) { c.rotate(TAU / 4); c.moveTo(0, 0); c.lineTo(size * 2.6 * k, size * .5 * k); c.lineTo(size * 2.6 * k, -size * .5 * k); }
    c.fill(); c.restore();
  }
  function turretRot(c, tr, rec, fn) {
    const off = rec * 3;
    c.save(); c.rotate(tr.angle + Math.PI / 2);
    c.translate(0, off);
    c.save(); c.rotate(-Math.PI / 2 - tr.angle + tr.angle);
    fn(c, tr);
    c.restore(); c.restore();
  }

  const ART = {
    mg(c, tr, cell, t, rec) {
      const s = cell * .34;
      c.rotate(tr.angle);
      /* турельная установка */
      pad(c, s * .5, '#4a5248');
      c.fillStyle = steel(c, -s, -s, s, s); gfx.rr(c, -s * .5, -s * .38, s * 1.0, s * .76, s * .2); c.fill();
      /* ствол */
      c.fillStyle = '#2b2f33'; c.fillRect(s * .1 - rec * 4, -s * .1, s * 1.25, s * .2);
      c.fillStyle = '#5a5f63'; c.fillRect(s * .1 - rec * 4, -s * .1, s * .3, s * .2);
      /* коробка + патронная лента */
      c.fillStyle = '#59605a'; gfx.rr(c, -s * .55, -s * .5, s * .8, s * .5, 2); c.fill();
      c.strokeStyle = '#c9a44a'; c.lineWidth = 1.6; c.beginPath();
      c.moveTo(-s * .5, s * .1); c.quadraticCurveTo(-s * 1.1, s * .3 + Math.sin(t * 8) * 2, -s * .8, s * .6); c.stroke();
      c.save(); c.translate(s * 1.35 - rec * 4, 0); muzzle(c, rec, '#ffd98a', s * .5); c.restore();
      /* оператор-человек */
      humanFigure(c, s * .02, s * .1, s * .5, tr.angle, '#3d4a5c', '#c98b5f');
    },
    shotgun(c, tr, cell, t, rec) {
      const s = cell * .34;
      c.rotate(tr.angle);
      pad(c, s * .5, '#544534');
      c.fillStyle = steel(c, 0, -s, 0, s); gfx.rr(c, -s * .5, -s * .42, s, s * .84, s * .22); c.fill();
      c.fillStyle = '#3a2b1c'; gfx.rr(c, -s * .7, -s * .28, s * .6, s * .56, 2); c.fill();
      c.fillStyle = '#25292c';
      c.fillRect(s * .1 - rec * 5, -s * .22, s * 1.15, s * .17);
      c.fillRect(s * .1 - rec * 5, s * .05, s * 1.15, s * .17);
      c.save(); c.translate(s * 1.3 - rec * 5, -s * .08); muzzle(c, rec, '#ffb45a', s * .8); c.restore();
      humanFigure(c, -s * .05, s * .05, s * .5, tr.angle, '#4b3a2a', '#c98b5f');
    },
    tesla(c, tr, cell, t, rec) {
      const s = cell * .36;
      pad(c, s * .5, '#22404f');
      /* катушка */
      for (let i = 3; i >= 1; i--) {
        c.fillStyle = i % 2 ? '#7a5a2a' : '#b5893f';
        c.beginPath(); c.ellipse(0, -i * s * .16, s * (.44 - i * .07), s * .12, 0, 0, TAU); c.fill();
      }
      c.strokeStyle = '#3a2c14'; c.lineWidth = 1;
      c.beginPath(); c.ellipse(0, -s * .34, s * .22, s * .07, 0, 0, TAU); c.stroke();
      /* шар-разрядник */
      const pulse = .5 + Math.sin(t * 6) * .3;
      const g = c.createRadialGradient(0, -s * .62, 0, 0, -s * .62, s * .5);
      g.addColorStop(0, '#fff'); g.addColorStop(.35, '#9df0ff'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.globalAlpha = pulse; c.beginPath(); c.arc(0, -s * .62, s * .5, 0, TAU); c.fill(); c.globalAlpha = 1;
      c.fillStyle = '#cfe9ff'; c.beginPath(); c.arc(0, -s * .62, s * .16, 0, TAU); c.fill();
      /* мелкие дуги */
      if (Math.random() < .5) {
        const a = rnd(0, TAU);
        GD.FX.arc(0, -s * .62, Math.cos(a) * s * .4, -s * .62 + Math.sin(a) * s * .4, '#bff4ff', .09, 5, 1.2);
      }
      for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + t * 2; c.fillStyle = '#5f7f8f'; c.fillRect(Math.cos(a) * s * .42 - 1, Math.sin(a) * s * .28 - 1, 2, 2); }
    },
    mortar(c, tr, cell, t, rec) {
      const s = cell * .38;
      c.rotate(tr.angle);
      pad(c, s * .5, '#3c4432');
      c.fillStyle = steel(c, 0, -s, 0, s); gfx.rr(c, -s * .5, -s * .35, s, s * .7, s * .2); c.fill();
      /* ствол под углом */
      c.save(); c.rotate(-.35);
      c.fillStyle = '#4a5148'; c.fillRect(-s * .16, -s * 1.15, s * .32, s * 1.2);
      c.fillStyle = '#2e332c'; c.beginPath(); c.ellipse(0, -s * 1.15, s * .16, s * .07, 0, 0, TAU); c.fill();
      c.restore();
      c.save(); c.translate(0, -s * 1.1); muzzle(c, rec, '#ff9d3d', s * .8); c.restore();
      /* сошки */
      c.strokeStyle = '#33382f'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-s * .4, s * .3); c.lineTo(0, 0); c.lineTo(s * .4, s * .3); c.stroke();
      humanFigure(c, -s * .45, s * .1, s * .45, tr.angle, '#3b4630', '#c98b5f');
    },
    flame(c, tr, cell, t, rec) {
      const s = cell * .36;
      c.rotate(tr.angle);
      pad(c, s * .48, '#5a3016');
      c.fillStyle = '#6e6a5f'; c.beginPath(); c.arc(0, 0, s * .42, 0, TAU); c.fill();
      /* баллоны */
      for (const sd of [-1, 1]) {
        c.fillStyle = '#b3521f'; gfx.rr(c, -s * .1, sd * s * .3 - s * .12, s * .5, s * .24, s * .12); c.fill();
        c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(-s * .06, sd * s * .3 - s * .09, s * .4, 1.6);
      }
      c.fillStyle = '#2c2c2c'; c.fillRect(s * .2 - rec * 3, -s * .1, s * .9, s * .2);
      c.fillStyle = '#d8d8d8'; c.fillRect(s * 1.02 - rec * 3, -s * .13, s * .12, s * .26);
      const pulse = .6 + Math.sin(t * 12) * .25;
      c.save(); c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(s * 1.2, 0, 0, s * 1.2, 0, s * .8 * pulse);
      g.addColorStop(0, 'rgba(255,240,190,0.9)'); g.addColorStop(1, 'rgba(255,90,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(s * 1.2, 0, s * .8 * pulse, 0, TAU); c.fill(); c.restore();
      humanFigure(c, -s * .5, s * .05, s * .45, tr.angle, '#5c3320', '#c98b5f');
    },
    rail(c, tr, cell, t, rec) {
      const s = cell * .4;
      c.rotate(tr.angle);
      pad(c, s * .5, '#2c2447');
      /* рельсовые шины */
      c.fillStyle = '#6e6480';
      c.fillRect(-s * .2, -s * .3, s * 1.5, s * .1);
      c.fillRect(-s * .2, s * .2, s * 1.5, s * .1);
      c.fillStyle = steel(c, 0, 0, s, 0); c.fillRect(-s * .55, -s * .14, s * 1.1, s * .28);
      /* поперечные стяжки */
      for (let i = 0; i < 4; i++) { c.fillStyle = '#3c3552'; c.fillRect(s * .1 + i * s * .3, -s * .3, s * .07, s * .6); }
      const ch = tr.recoil;
      const g = c.createRadialGradient(s * 1.2, 0, 0, s * 1.2, 0, s * .7);
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = .35 + ch * .6;
      c.fillStyle = g; c.beginPath(); c.arc(s * 1.2, 0, s * .5 + ch * s * .4, 0, TAU); c.fill();
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      /* кольца накопителя */
      for (let i = 0; i < 3; i++) {
        c.strokeStyle = `rgba(190,150,255,${.35 + Math.sin(t * 5 + i) * .3})`; c.lineWidth = 1.4;
        c.beginPath(); c.ellipse(-s * .1 - i * s * .2, 0, s * .1, s * .3, 0, 0, TAU); c.stroke();
      }
    },
    missile(c, tr, cell, t, rec) {
      const s = cell * .38;
      c.rotate(tr.angle);
      pad(c, s * .5, '#333a42');
      c.fillStyle = steel(c, 0, -s, 0, s); gfx.rr(c, -s * .55, -s * .3, s * .9, s * .6, 3); c.fill();
      /* пакет направляющих */
      for (let i = 0; i < 4; i++) {
        const x = -s * .1 + (i % 2) * s * .38, y = -s * .5 + Math.floor(i / 2) * s * .26;
        c.fillStyle = '#8d9aa8'; c.beginPath(); c.ellipse(x + s * .5, y, s * .3, s * .1, 0, 0, TAU); c.fill();
        c.fillStyle = '#c0402a'; c.beginPath(); c.arc(x + s * .82, y, s * .07, 0, TAU); c.fill();
      }
      c.save(); c.globalCompositeOperation = 'lighter';
      if (rec > .1) { const g = c.createRadialGradient(s * .9, 0, 0, s * .9, 0, s * .9); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,90,0,0)'); c.fillStyle = g; c.globalAlpha = rec; c.beginPath(); c.arc(s * .9, 0, s * .9 * rec, 0, TAU); c.fill(); }
      c.restore();
      humanFigure(c, -s * .5, s * .35, s * .4, tr.angle, '#3b434d', '#c98b5f');
    },
    laser(c, tr, cell, t, rec) {
      const s = cell * .38;
      c.rotate(tr.angle);
      pad(c, s * .5, '#1f3d36');
      c.fillStyle = steel(c, 0, -s, 0, s); gfx.rr(c, -s * .5, -s * .35, s, s * .7, 4); c.fill();
      /* радиатор */
      c.fillStyle = '#2f5a50';
      for (let i = 0; i < 5; i++) c.fillRect(-s * .45 + i * s * .18, -s * .5, s * .07, s * .2);
      c.fillStyle = '#1c2b26'; c.fillRect(s * .3 - rec * 3, -s * .1, s * .85, s * .2);
      const pulse = .5 + Math.sin(t * 8) * .3;
      c.save(); c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(s * 1.12, 0, 0, s * 1.12, 0, s * .45);
      g.addColorStop(0, '#eafff4'); g.addColorStop(.4, '#6dffb0'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = pulse; c.fillStyle = g; c.beginPath(); c.arc(s * 1.12, 0, s * .45, 0, TAU); c.fill(); c.restore();
      if (tr.target && !tr.target.dead && tr.beamT > 0) {
        /* ЛУЧ: контекст здесь уже повёрнут на tr.angle, поэтому прежний код
           с дополнительным c.rotate(tr.angle) рисовал луч под 2×angle (а
           подсветка — вообще под 3×angle): луч смотрел в другую сторону и
           не совпадал с тем, куда реально жрёт цель. Рисуем в системе
           координат «поворот на цель», начало — на срезе ствола. */
        const dx = tr.target.x - tr.cx, dy = (tr.target.y - tr.target.size * .35) - tr.cy;
        const L = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        const bx = Math.cos(tr.angle - a) * s * 1.1, by = Math.sin(tr.angle - a) * s * 1.1;
        c.save(); c.rotate(a - tr.angle); c.globalCompositeOperation = 'lighter';
        const lg = c.createLinearGradient(0, 0, L, 0);
        lg.addColorStop(0, 'rgba(109,255,176,0.05)'); lg.addColorStop(.5, 'rgba(140,255,200,0.85)'); lg.addColorStop(1, 'rgba(255,255,255,0.95)');
        c.beginPath(); c.moveTo(bx, by); c.lineTo(L, 0);
        c.strokeStyle = lg; c.lineWidth = 2.6 + Math.sin(t * 30) * .9; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 6; c.globalAlpha = .35; c.stroke();
        c.restore();
      }
    },
    cryo(c, tr, cell, t, rec) {
      const s = cell * .37;
      c.rotate(tr.angle);
      pad(c, s * .5, '#1e3d52');
      c.fillStyle = steel(c, 0, -s, 0, s); gfx.rr(c, -s * .5, -s * .34, s, s * .68, 4); c.fill();
      /* резервуар с азотом */
      c.fillStyle = '#2d6f95'; c.beginPath(); c.arc(-s * .35, 0, s * .28, 0, TAU); c.fill();
      c.strokeStyle = '#a9e8ff'; c.lineWidth = 1; c.stroke();
      /* сопло */
      c.fillStyle = '#1d3b4c'; c.beginPath();
      c.moveTo(s * .3, -s * .26); c.lineTo(s * 1.0, -s * .38); c.lineTo(s * 1.0, s * .38); c.lineTo(s * .3, s * .26); c.closePath(); c.fill();
      c.strokeStyle = '#a9e8ff'; c.stroke();
      const pulse = .4 + Math.sin(t * 5) * .2;
      c.save(); c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(s * 1.0, 0, 0, s * 1.0, 0, s * .7);
      g.addColorStop(0, 'rgba(230,250,255,0.9)'); g.addColorStop(1, 'rgba(80,190,255,0)');
      c.globalAlpha = pulse; c.fillStyle = g; c.beginPath(); c.arc(s, 0, s * .7, 0, TAU); c.fill(); c.restore();
      /* изморозь */
      c.fillStyle = 'rgba(200,245,255,.5)';
      for (let i = 0; i < 5; i++) { const a = t * 2 + i; c.fillRect(Math.cos(a) * s * .6, Math.sin(a) * s * .4, 1.6, 1.6); }
      if (Math.random() < .3) GD.FX.p(tr.cx + rnd(-6, 6), tr.cy + rnd(-6, 6), rnd(-12, 12), rnd(-16, 4), .7, 1.6, '#d8f6ff', { grav: -8 });
    },
    flak(c, tr, cell, t, rec) {
      const s = cell * .4;
      c.rotate(tr.angle);
      pad(c, s * .52, '#43492f');
      /* башня */
      c.fillStyle = steel(c, 0, -s, 0, s); gfx.rr(c, -s * .6, -s * .42, s * 1.2, s * .84, s * .2); c.fill();
      for (let i = 0; i < 4; i++) {
        const oy = (i < 2 ? -1 : 1) * s * .22, oxx = (i % 2 ? 1 : -1) * s * .06;
        c.fillStyle = '#2f3328';
        c.fillRect(s * .2 + oxx - rec * 4, oy - s * .055, s * 1.15, s * .11);
      }
      c.fillStyle = '#5b6152'; c.fillRect(-s * .75, -s * .18, s * .35, s * .36);
      c.save(); c.translate(s * 1.35 - rec * 4, 0); muzzle(c, rec, '#ffd76b', s * .45); c.restore();
      /* радар */
      c.save(); c.rotate(tr.spin); c.strokeStyle = '#9fb08a'; c.lineWidth = 1.4;
      c.beginPath(); c.arc(-s * .55, 0, s * .3, -1, 1); c.stroke(); c.restore();
      humanFigure(c, -s * .3, s * .5, s * .38, tr.angle, '#454b2c', '#c98b5f');
    },
    emp(c, tr, cell, t, rec) {
      const s = cell * .38;
      pad(c, s * .5, '#232f52');
      c.fillStyle = steel(c, 0, -s, 0, s); gfx.rr(c, -s * .45, -s * .3, s * .9, s * .6, 4); c.fill();
      /* тарелка */
      c.save(); c.translate(0, -s * .3);
      const g = c.createLinearGradient(0, -s * .5, 0, s * .2); g.addColorStop(0, '#a8c4ff'); g.addColorStop(1, '#39497f');
      c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, s * .5, s * .22, 0, 0, TAU); c.fill();
      c.strokeStyle = '#cfe0ff'; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#eaf2ff'; c.beginPath(); c.arc(0, 0, s * .08, 0, TAU); c.fill();
      const pl = .4 + Math.sin(t * 4) * .3;
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = pl * .7;
      c.strokeStyle = '#a8c4ff';
      for (let i = 1; i <= 3; i++) { c.beginPath(); c.ellipse(0, -i * s * .1, s * (.2 + i * .18), s * (.08 + i * .07), 0, 0, TAU); c.stroke(); }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      c.restore();
      /* разряды к земле */
      if (Math.random() < .25) GD.FX.arc(0, -s * .3, rnd(-s * .5, s * .5), s * .2, '#cfe0ff', .1, 6, 1.2);
    },
    repair(c, tr, cell, t, rec) {
      const s = cell * .4;
      pad(c, s * .52, '#4a4128');
      /* ящик-генератор */
      c.fillStyle = steel(c, 0, -s, 0, s); gfx.rr(c, -s * .55, -s * .4, s * 1.1, s * .8, 3); c.fill();
      c.fillStyle = '#c9b06a'; c.fillRect(-s * .45, -s * .3, s * .9, s * .16);
      /* крест-символ медпомощи */
      c.fillStyle = '#ff5a4a'; c.fillRect(-s * .07, -s * .16, s * .14, s * .42); c.fillRect(-s * .22, -s * .02, s * .44, s * .14);
      /* манипулятор-кран */
      c.save(); c.rotate(tr.spin * .6);
      c.strokeStyle = '#8a7a45'; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(s * .9, -s * .5); c.stroke();
      c.strokeStyle = '#ffd166'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(s * .9, -s * .5); c.lineTo(s * .9, s * .1); c.stroke();
      c.fillStyle = '#ffd166'; c.beginPath(); c.arc(s * .9, s * .16, 2.4, 0, TAU); c.fill();
      c.restore();
      /* искры сварки */
      if (Math.random() < .3) GD.FX.sparks(tr.cx + rnd(-14, 14), tr.cy + rnd(-6, 6), 2, '#9dff9d', 60);
    },
    orbital(c, tr, cell, t, rec) {
      const s = cell * .42;
      pad(c, s * .55, '#2c3543');
      /*_base_антенна */
      c.fillStyle = steel(c, 0, -s, 0, s);
      c.beginPath(); c.moveTo(-s * .5, s * .3); c.lineTo(-s * .2, -s * .5); c.lineTo(s * .2, -s * .5); c.lineTo(s * .5, s * .3); c.closePath(); c.fill();
      /* тарелка к небу */
      c.save(); c.translate(0, -s * .55);
      const tilt = Math.sin(t * .7) * .25;
      c.rotate(tilt);
      const g = c.createLinearGradient(-s * .6, 0, s * .6, 0);
      g.addColorStop(0, '#dfe9f5'); g.addColorStop(.5, '#9fb0c4'); g.addColorStop(1, '#4b5766');
      c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, s * .62, s * .3, 0, Math.PI, TAU); c.fill();
      c.strokeStyle = '#e7f4ff'; c.lineWidth = 1.2; c.stroke();
      c.strokeStyle = '#b9f2ff'; c.globalAlpha = .5 + Math.sin(t * 4) * .3;
      c.beginPath(); c.ellipse(0, 0, s * .4, s * .19, 0, Math.PI, TAU); c.stroke(); c.globalAlpha = 1;
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -s * .1, 2.2, 0, TAU); c.fill();
      c.restore();
      /* свечение наведение */
      c.save(); c.globalCompositeOperation = 'lighter';
      const gg = c.createRadialGradient(0, -s * .9, 0, 0, -s * .9, s * 1.2);
      gg.addColorStop(0, 'rgba(185,242,255,0.5)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = .3 + Math.abs(Math.sin(t * 1.6)) * .4; c.fillStyle = gg;
      c.beginPath(); c.arc(0, -s * .9, s * 1.2, 0, TAU); c.fill(); c.restore();
    }
  };

  /* маленькая фигура оператора-человека */
  function humanFigure(c, x, y, s, ang, cloth, skin) {
    c.save(); c.translate(x, y); c.rotate(0);
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(0, s * .5, s * .3, s * .12, 0, 0, TAU); c.fill();
    c.fillStyle = cloth; gfx.rr(c, -s * .26, -s * .2, s * .52, s * .58, s * .12); c.fill();
    c.fillStyle = skin; c.beginPath(); c.arc(0, -s * .34, s * .2, 0, TAU); c.fill();
    c.fillStyle = '#2f3a2a'; gfx.rr(c, -s * .24, -s * .52, s * .48, s * .22, s * .08); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = .8;
    c.beginPath(); c.moveTo(0, -s * .12); c.lineTo(0, s * .3); c.stroke();
    c.restore();
  }

  GD.Turrets = { DEFS, ORDER, Turret, ART, MAXLV, upgradeCost, sellValue, DMG_MUL, RATE_MUL, RANGE_MUL };
})(window.GD);
