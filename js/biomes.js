/* ============ BIOMES: процедурные палитры и наполнение уровней ============ */
(function (GD) {
  'use strict';
  const { RNG, hsl, clamp } = GD;

  /* Каждая запись — «семейство» локаций. Итоговый биом уровня собирается
     из семейства + джиттера оттенков, поэтому уровни никогда не повторяются. */
  const FAMILY = [
    { id: 'rust', name: 'РЖАВЫЕ ПОЛЯ', g: [24, 62, 26], g2: [18, 48, 15], road: [220, 8, 12], acc: [32, 95, 58], acc2: [8, 90, 52], sky: [26, 55, 14], prop: 'ruins', weather: 'ash', style: 'cracks', bot: [16, 210] },
    { id: 'neon', name: 'НЕОНОВЫЕ РУИНЫ', g: [268, 34, 16], g2: [284, 40, 9], road: [258, 45, 10], acc: [186, 100, 60], acc2: [318, 96, 62], sky: [276, 60, 12], prop: 'city', weather: 'rain', style: 'tiles', bot: [300, 200] },
    { id: 'arctic', name: 'ЛЕДЯНОЙ ФРОНТ', g: [205, 26, 58], g2: [212, 30, 40], road: [210, 22, 28], acc: [190, 100, 66], acc2: [45, 100, 70], sky: [210, 45, 30], prop: 'ice', weather: 'snow', style: 'snow', bot: [200, 210] },
    { id: 'toxic', name: 'ТОКСИЧНЫЕ БОЛОТА', g: [92, 42, 20], g2: [78, 50, 12], road: [100, 30, 12], acc: [78, 100, 58], acc2: [150, 90, 52], sky: [96, 45, 10], prop: 'swamp', weather: 'spores', style: 'puddles', bot: [82, 150] },
    { id: 'molten', name: 'ПЕКЛО', g: [8, 62, 20], g2: [0, 70, 10], road: [10, 55, 13], acc: [24, 100, 58], acc2: [52, 100, 60], sky: [6, 70, 12], prop: 'volcan', weather: 'ember', style: 'lava', bot: [10, 35] },
    { id: 'desert', name: 'ПУСТЫНЯ К-19', g: [38, 48, 58], g2: [34, 42, 42], road: [36, 30, 32], acc: [44, 100, 64], acc2: [18, 90, 56], sky: [36, 60, 26], prop: 'dunes', weather: 'sand', style: 'sand', bot: [40, 200] },
    { id: 'factory', name: 'ЗАВОД «МОЛОТ»', g: [206, 16, 22], g2: [200, 20, 13], road: [210, 12, 15], acc: [176, 90, 55], acc2: [42, 95, 58], sky: [206, 30, 10], prop: 'industry', weather: 'spark', style: 'grating', bot: [190, 45] },
    { id: 'ash', name: 'ПЕПЕЛЬНЫЙ ЛЕС', g: [280, 10, 20], g2: [270, 12, 11], road: [280, 8, 13], acc: [350, 85, 62], acc2: [265, 70, 68], sky: [284, 22, 9], prop: 'forest', weather: 'ash', style: 'cracks', bot: [275, 350] },
    { id: 'crater', name: 'КРАСНЫЙ КРАТЕР', g: [356, 52, 26], g2: [350, 58, 14], road: [2, 44, 15], acc: [18, 100, 62], acc2: [200, 90, 60], sky: [354, 55, 12], prop: 'canyon', weather: 'dust', style: 'cracks', bot: [2, 200] },
    { id: 'lab', name: 'ЛАБОРАТОРИЯ SKYNET', g: [200, 18, 50], g2: [204, 22, 34], road: [205, 16, 24], acc: [188, 100, 52], acc2: [0, 0, 100], sky: [200, 30, 26], prop: 'lab', weather: 'scan', style: 'tiles', bot: [210, 190] },
    { id: 'storm', name: 'ГРОЗОВОЙ КУЛУАР', g: [228, 34, 20], g2: [232, 40, 11], road: [226, 30, 13], acc: [52, 100, 66], acc2: [200, 100, 62], sky: [230, 50, 10], prop: 'tower', weather: 'rain', style: 'wet', bot: [230, 50] },
    { id: 'deep', name: 'ПОДЗЕМЕЛЬЕ B-7', g: [216, 26, 15], g2: [220, 30, 8], road: [214, 22, 11], acc: [170, 95, 52], acc2: [30, 100, 58], sky: [218, 40, 6], prop: 'tunnel', weather: 'drip', style: 'grating', bot: [216, 30] }
  ];

  const PROP_SETS = {
    ruins: ['ruin', 'barrel', 'wreck', 'concrete', 'rebar', 'crate'],
    city: ['building', 'streetlight', 'holo', 'wreck', 'bin', 'rubble'],
    ice: ['icepike', 'rock', 'frozen', 'antenna', 'crate', 'barrel'],
    swamp: ['tree', 'mushroom', 'rock', 'wreck', 'puddlebig', 'barrel'],
    volcan: ['rock', 'vent', 'obsidian', 'wreck', 'chain', 'bone'],
    dunes: ['rock', 'palm', 'wreck', 'barrel', 'skull', 'crate'],
    industry: ['pipe', 'tank', 'container', 'barrel', 'machine', 'crate'],
    forest: ['tree', 'stump', 'rock', 'wreck', 'fence', 'bone'],
    canyon: ['rockbig', 'rock', 'bone', 'rubble', 'antenna', 'wreck'],
    lab: ['tanklab', 'screen', 'pillar', 'cable', 'crate', 'robot_arm'],
    tower: ['pylon', 'antenna', 'rubble', 'concrete', 'wreck', 'transformer'],
    tunnel: ['pipe', 'support', 'barrel', 'machine', 'crate', 'cable']
  };

  const PROP_LABEL = {
    ruin: 'Руины', wreck: 'Техника', barrel: 'Бочки', concrete: 'Бетон', rebar: 'Арматура', crate: 'Ящики',
    building: 'Небоскрёбы', streetlight: 'Фонари', holo: 'Голограммы', bin: 'Мусор', rubble: 'Обломки',
    icepike: 'Ледяные иглы', frozen: 'Заморозки', rock: 'Камни', antenna: 'Антенны',
    tree: 'Сухие деревья', mushroom: 'Грибы', puddlebig: 'Лужи', vent: 'Жерла', obsidian: 'Обсидиан',
    chain: 'Цепи', bone: 'Кости', palm: 'Пальмы', skull: 'Черепа', pipe: 'Трубы', tank: 'Резервуары',
    container: 'Контейнеры', machine: 'Станки', stump: 'Пни', fence: 'Забор', rockbig: 'Скалы',
    tanklab: 'Колбы', screen: 'Экраны', pillar: 'Колонны', cable: 'Кабели', robot_arm: 'Манипуляторы',
    pylon: 'ЛЭП', transformer: 'Трансформаторы', support: 'Опоры'
  };

  const PREFIX = ['СЕКТОР', 'РУБЕЖ', 'ЗОНА', 'ФРОНТ', 'КВАРТАЛ', 'РЕЙД', 'ТЕМП'];
  const SUFFIX = ['A-7', 'K-19', 'B-3', 'D-12', 'OMEGA', 'NULL', 'XI', 'R-9', 'ZERO', 'H-4'];

  /* ---- собрать конкретный биом уровня ---- */
  function makeBiome(level, rng) {
    const fam = FAMILY[(rng.int(0, FAMILY.length - 1) + level * 7) % FAMILY.length];
    const hueShift = rng.float(-16, 16);
    const satK = rng.float(.82, 1.2);
    const litK = rng.float(.88, 1.14);
    const F = (c, dl) => hsl(c[0] + hueShift, clamp(c[1] * satK, 8, 100), clamp((c[2] + (dl || 0)) * litK, 4, 92));

    const T = (c, dl) => hsl(c[0] + hueShift, clamp(c[1] * satK, 6, 54), clamp((c[2] + (dl || 0)) * litK, 4, 92));
    const L = 1 + Math.min(6, level * .12);
    const b = {
      id: fam.id,
      family: fam,
      name: fam.name,
      code: PREFIX[level % PREFIX.length] + ' ' + SUFFIX[(level * 3) % SUFFIX.length],
      /* окружение */
      ground: T(fam.g), groundDark: T(fam.g2), groundLite: T(fam.g, 14),
      road: T(fam.road, -2), roadEdge: T(fam.road, 12), roadLine: F(fam.acc, 6),
      roadGlow: hsl(fam.acc[0] + hueShift, 100, 58, .5),
      skyTop: F(fam.sky, -4), skyBot: F(fam.sky, 12),
      fog: hsl(fam.acc[0] + hueShift, 60, 30, .12),
      accent: F(fam.acc), accent2: F(fam.acc2),
      accentHue: fam.acc[0] + hueShift, accent2Hue: fam.acc2[0] + hueShift,
      groundHue: fam.g[0] + hueShift,
      /* роботы этого уровня */
      botMetal: F([fam.bot[0], 12, 46]),
      botDark: F([fam.bot[0], 18, 24]),
      botTrim: F([fam.bot[1], 70, 52]),
      eyeHue: fam.bot[1] + rng.float(-25, 25),
      eye: hsl(fam.bot[1] + rng.float(-25, 25), 100, 62),
      /* оформление */
      style: fam.style, weather: fam.weather, weatherCount: Math.round(rng.float(26, 52) * L),
      props: PROP_SETS[fam.prop] || PROP_SETS.ruins,
      propDensity: rng.float(.5, 1.0),
      laneStyle: rng.int(0, 3),
      gridAlpha: rng.float(.04, .12)
    };
    /* уникальная особенность уровня — визуально меняет всё поле */
    const quirks = ['neon_veins', 'crystal_growth', 'oil_stains', 'warning_stripes', 'overgrown', 'burnt', 'flooded', 'magnetic'];
    b.quirk = quirks[rng.int(0, quirks.length - 1)];
    b.seed = rng.s0;
    return b;
  }

  /* Модификатор роботов уровня — меняет их облик от уровня к уровню */
  const BOT_MUTATIONS = [
    { id: 'chrome', name: 'ХРОМ', desc: 'Зеркальные корпуса', metalS: -6, metalL: 26, trim: 'gold' },
    { id: 'rust', name: 'КОРРОЗИЯ', desc: 'Ржавая броня', metalS: 26, metalL: -10, trim: 'orange' },
    { id: 'prism', name: 'ПРИЗМА', desc: 'Радужная облицовка', metalS: 30, metalL: 6, trim: 'rainbow' },
    { id: 'stealth', name: 'СТЕЛС', desc: 'Матовый уголь', metalS: -8, metalL: -18, trim: 'cyan' },
    { id: 'plasma', name: 'ПЛАЗМА', desc: 'Открытые реакторы', metalS: 10, metalL: 4, trim: 'glow' },
    { id: 'warpaint', name: 'ВОЕННАЯ КРАСКА', desc: 'Полосатая камуфляж-броня', metalS: 14, metalL: -2, trim: 'stripe' },
    { id: 'copper', name: 'МЕДЬ', desc: 'Медные сервоприводы', metalS: 22, metalL: 8, trim: 'copper' },
    { id: 'bone', name: 'ОССУАРИЙ', desc: 'Костяные пластины', metalS: -14, metalL: 22, trim: 'bone' }
  ];
  function makeMutation(rng) { return BOT_MUTATIONS[rng.int(0, BOT_MUTATIONS.length - 1)]; }

  GD.Biomes = { FAMILY, makeBiome, makeMutation, BOT_MUTATIONS, PROP_LABEL };
})(window.GD);
