/* Расчёт экономики SKTD по формулам из js/levelgen.js, enemies.js, turrets.js */
'use strict';

const ARCH = {
  scout:  { hp: 26,  armor: 0,  bounty: 9,  leak: 1,  spd: 74, w: .82 },
  runner: { hp: 18,  armor: 0,  bounty: 8,  leak: 1,  spd: 92, w: .9 },
  grunt:  { hp: 52,  armor: 2,  bounty: 12, leak: 2,  spd: 52, w: 1.6 },
  spider: { hp: 74,  armor: 5,  bounty: 16, leak: 2,  spd: 60, w: 1.5 },
  drone:  { hp: 34,  armor: 1,  bounty: 13, leak: 2,  spd: 86, w: 1.3 },
  bomber: { hp: 64,  armor: 3,  bounty: 18, leak: 5,  spd: 66, w: 1.2 },
  hover:  { hp: 96,  armor: 4,  bounty: 22, leak: 2,  spd: 56, w: 1.8 },
  tank:   { hp: 190, armor: 14, bounty: 30, leak: 4,  spd: 34, w: 2.2 },
  shield: { hp: 240, armor: 10, bounty: 34, leak: 3,  spd: 40, w: 1.3 },
  fixer:  { hp: 70,  armor: 2,  bounty: 24, leak: 1,  spd: 48, w: 1.05 },
  hulkb:  { hp: 420, armor: 18, bounty: 52, leak: 6,  spd: 30, w: 1.7 },
};
const UNLOCK = { scout: 1, runner: 1, grunt: 1, spider: 2, drone: 2, bomber: 3, hover: 3, tank: 4, shield: 5, fixer: 6, hulkb: 6 };

function scale(L) {
  const l = L - 1;
  return {
    hp: 1 + .34 * l + .026 * Math.pow(l, 1.75),
    armor: 1 + .115 * l,
    bounty: 1 + .1 * l,
    leak: 1 + .08 * l,
  };
}

/* ожидаемый состав волны: равномерно по пулу, ожидаемый трата-баланс */
function waveExpect(level, w) {
  const budget0 = 15 + level * 5.2 + w * (6 + level);
  const pool = Object.keys(UNLOCK).filter(k => UNLOCK[k] <= level);
  // ожидаемое: усредняем отношения по пулу, считаем сколько «единиц бюджета» тратится
  let bountyPerBudget = 0, hpPerBudget = 0, armorSum = 0, leakPerBudget = 0;
  for (const k of pool) {
    const a = ARCH[k], c = a.w * 6;
    bountyPerBudget += a.bounty / c / pool.length;
    hpPerBudget += a.hp / c / pool.length;
    leakPerBudget += a.leak / c / pool.length;
    armorSum += a.armor * (a.hp / c) ; // вес по вкладу в HP
  }
  const hpW = pool.reduce((s, k) => s + ARCH[k].hp / (ARCH[k].w * 6), 0);
  armorSum /= hpW; // средняя броня по «доле урона»
  // потери бюджета из-за floor(): в среднем ~1 группа-остаток ≈ до 0.5*стоимой единицы
  const avgCost = pool.reduce((s, k) => s + ARCH[k].w * 6, 0) / pool.length;
  const spent = Math.max(0, budget0 - avgCost * .55);
  return { budget0, spent, bountyPerBudget, hpPerBudget, armorAvg: armorSum, leakPerBudget };
}

const rows = [];
const T_PATH = 14;   // секунд прохода пути (средний наземный юнит)
for (let level = 1; level <= 16; level++) {
  const n = 6 + Math.min(4, Math.floor(level / 2));
  const sc = scale(level);
  let incomeStart = Math.round(140 + level * 15);
  let rewardBase = 0, kills = 0, hpTotal = 0, armorTotal = 0, leakTotal = 0;
  let scrap = incomeStart; const interestSeries = [];
  let scrapWave = [];
  for (let w = 0; w < n; w++) {
    const E = waveExpect(level, w);
    const killInc = E.spent * E.bountyPerBudget * sc.bounty;
    kills += killInc;
    hpTotal += E.spent * E.hpPerBudget * sc.hp;
    armorTotal += E.armorAvg;
    leakTotal += E.spent * E.leakPerBudget * sc.leak;
    // бонус за волну: 40+12L+6w + 5% текущего скрапа (игрок тратит ~85% в неделю buildup)
    scrap -= scrap * .8;            // построился
    const bonus = 32 + level * 9 + w * 5 + Math.round(scrap * .03);
    rewardBase += 32 + level * 9 + w * 5;
    scrap += bonus + killInc;
    scrapWave.push(Math.round(scrap));
  }
  const income = incomeStart + rewardBase + kills + (scrap - incomeStart - rewardBase - kills);
  const hpAvgArmor = armorTotal / n;
  // сколько DPS нужно, чтобы убить волну в среднем по пути; и во сколько это в скрапе (МГ-микс ~0.45 DPS/скрап против низкой брони, 0.22 против высокой)
  const hpPerWave = hpTotal / n;
  const needDpsAvg = hpPerWave / T_PATH;
  const dpsPerScrap = hpAvgArmor < 6 ? .48 : .35;
  const needScrap = needDpsAvg / dpsPerScrap;
  const avgIncomePerWave = (incomeStart + rewardBase + kills) / n;
  rows.push({
    level, n,
    start: incomeStart,
    rewards: Math.round(rewardBase),
    kills: Math.round(kills),
    income: Math.round(incomeStart + rewardBase + kills),
    hpWaveAvg: Math.round(hpPerWave),
    hpArmor: Math.round(hpAvgArmor * 10) / 10,
    needScrap: Math.round(needScrap),
    payPerWave: Math.round(avgIncomePerWave),
    surplus: +(avgIncomePerWave / needScrap).toFixed(2),
    leakIfAllPass: Math.round(leakTotal),
    bountyPerBudget: +(ARCH.scout.bounty / (ARCH.scout.w * 6)).toFixed(2),
  });
}
console.log('Lvl | волн | старт | +волны | +килл | ИТОГО/ур | HP/волна(ср) | броня | нужно$ | доход/волна | ИЗБЫТОК | пропустит-база');
for (const r of rows) console.log(
  `${String(r.level).padStart(3)} | ${String(r.n).padStart(4)} | ${String(r.start).padStart(5)} | ${String(r.rewards).padStart(6)} | ${String(r.kills).padStart(5)} | ${String(r.income).padStart(8)} | ${String(r.hpWaveAvg).padStart(12)} | ${String(r.hpArmor).padStart(5)} | ${String(r.needScrap).padStart(6)} | ${String(r.payPerWave).padStart(11)} | ${String(r.surplus).padStart(7)} | -${r.leakIfAllPass}/100`);

/* помесячно по волнам L1 */
console.log('\n=== Уровень 1 по волнам ===');
const sc1 = scale(1);
let s = 155;
for (let w = 0; w < 6; w++) {
  const E = waveExpect(1, w);
  const k = E.spent * E.bountyPerBudget * sc1.bounty;
  const hp = E.spent * E.hpPerBudget;
  const mg = Math.round(hp / 36); // секунд обстрела одним пулемётом
  console.log(`волна ${w + 1}: бюджет ${E.budget0.toFixed(1)} → units≈${Math.round(E.spent / 7.5)}, HP≈${Math.round(hp)}, bounty≈${Math.round(k)}, награда ${32 + 9 + w * 5}, 1×МГ убивает пачку за ${mg}с`);
}
