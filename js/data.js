/* Kumpir Arena - oyun verileri: istatistikler, silahlar, eşyalar, karakterler, düşmanlar */
(function (BR) {
  'use strict';

  const U = BR.U;
  const D = {};

  D.ARENA_W = 2000;
  D.ARENA_H = 1400;
  D.MAX_WAVE = 20;
  D.MAX_WEAPONS = 6;
  D.MAX_ALIVE = 150;

  /* ---------- İstatistikler ---------- */
  D.STATS = [
    { key: 'maxHp', name: 'Maks. Can', desc: 'Sahip olabileceğin en yüksek can.' },
    { key: 'hpRegen', name: 'Can Yenilenmesi', desc: 'Belirli aralıklarla 1 can yeniler. Değer arttıkça daha sık iyileşirsin.' },
    { key: 'lifeSteal', name: 'Can Çalma', pct: true, desc: 'Her vuruşta 1 can kazanma şansı (saniyede en fazla 10).' },
    { key: 'damage', name: 'Hasar', pct: true, desc: 'Tüm silahların hasarını yüzde olarak artırır (taretler hariç).' },
    { key: 'meleeDamage', name: 'Yakın Dövüş Hasarı', short: 'Yakın Dövüş', desc: 'Yakın dövüş silahlarına eklenen hasar.' },
    { key: 'rangedDamage', name: 'Menzilli Hasar', short: 'Menzilli', desc: 'Menzilli silahlara eklenen hasar.' },
    { key: 'elementalDamage', name: 'Elementel Hasar', short: 'Elementel', desc: 'Ateş asası ve yanma hasarına eklenir.' },
    { key: 'attackSpeed', name: 'Saldırı Hızı', pct: true, desc: 'Silahların daha sık saldırır.' },
    { key: 'critChance', name: 'Kritik Şansı', pct: true, desc: 'Kritik vuruş yapma şansı. Kritik vuruşlar silahın çarpanı kadar hasar verir.' },
    { key: 'engineering', name: 'Mühendislik', short: 'Mühendislik', desc: 'Taretlerin ve İngiliz anahtarının hasarını artırır.' },
    { key: 'range', name: 'Menzil', desc: 'Silah menzili. Yakın dövüş silahları bunun yarısını alır.' },
    { key: 'armor', name: 'Zırh', desc: 'Alınan hasarı azaltır.' },
    { key: 'dodge', name: 'Kaçınma', pct: true, desc: 'Saldırılardan tamamen kaçınma şansı (en fazla %60).' },
    { key: 'speed', name: 'Hız', pct: true, desc: 'Hareket hızı.' },
    { key: 'luck', name: 'Şans', desc: 'Dükkanda daha nadir eşyalar, daha çok meyve ve sandık.' },
    { key: 'harvesting', name: 'Hasat', desc: 'Her dalga sonunda bu kadar malzeme ve deneyim kazanırsın. Her dalga %5 büyür.' },
  ];
  D.EXTRA_STATS = [{ key: 'pickupRange', name: 'Toplama Menzili', pct: true, desc: 'Malzemeleri ne kadar uzaktan çektiğin.' }];
  D.STAT_BY_KEY = {};
  D.STATS.concat(D.EXTRA_STATS).forEach((s) => {
    D.STAT_BY_KEY[s.key] = s;
  });

  /* ---------- Nadirlik ---------- */
  D.TIERS = [
    null,
    { name: 'Sıradan', color: '#d8cfbd' },
    { name: 'Nadir', color: '#5aa9ff' },
    { name: 'Destansı', color: '#b77cff' },
    { name: 'Efsanevi', color: '#ff5d5d' },
  ];

  /* ---------- Silah sınıfları ve set bonusları ---------- */
  // per[n]: aynı sınıftan n farklı silah taşıyınca verilen bonus
  D.CLASSES = {
    unarmed: { name: 'Silahsız', stat: 'dodge', per: [0, 0, 2, 4, 6, 8, 10] },
    blade: { name: 'Kesici', stat: 'lifeSteal', per: [0, 0, 1, 2, 3, 4, 5] },
    precise: { name: 'Hassas', stat: 'critChance', per: [0, 0, 3, 6, 9, 12, 15] },
    heavy: { name: 'Ağır', stat: 'armor', per: [0, 0, 1, 2, 3, 4, 5] },
    tool: { name: 'Alet', stat: 'engineering', per: [0, 0, 1, 2, 3, 4, 5] },
    gun: { name: 'Ateşli', stat: 'range', per: [0, 0, 10, 20, 30, 40, 50] },
    elemental: { name: 'Elementel', stat: 'elementalDamage', per: [0, 0, 1, 2, 3, 4, 5] },
    explosive: { name: 'Patlayıcı', stat: 'damage', per: [0, 0, 5, 10, 15, 20, 25] },
  };

  /* ---------- Silahlar ---------- */
  // Kademe başına değişen alanlar 4 elemanlı dizidir (I, II, III, IV).
  D.WEAPONS = [
    {
      id: 'fist', name: 'Yumruk', type: 'melee', cls: ['unarmed'], price: 12,
      dmg: [8, 12, 17, 24], scale: { meleeDamage: 1 }, cd: [0.78, 0.74, 0.7, 0.64],
      range: 150, kb: [15, 16, 17, 18], crit: 0, critMult: 2, hitR: 14,
    },
    {
      id: 'knife', name: 'Bıçak', type: 'melee', cls: ['blade', 'precise'], price: 15,
      dmg: [7, 11, 17, 27], scale: { meleeDamage: 0.8 }, cd: [0.95, 0.9, 0.84, 0.75],
      range: 150, kb: [2, 2, 3, 3], crit: 0.25, critMult: 2.5, hitR: 12,
    },
    {
      id: 'spear', name: 'Mızrak', type: 'melee', cls: ['precise'], price: 18,
      dmg: [11, 18, 27, 42], scale: { meleeDamage: 1 }, cd: [1.35, 1.28, 1.2, 1.1],
      range: 250, kb: [10, 10, 12, 14], crit: 0.05, critMult: 2, hitR: 12,
    },
    {
      id: 'hammer', name: 'Çekiç', type: 'melee', cls: ['heavy'], price: 22,
      dmg: [22, 38, 60, 95], scale: { meleeDamage: 2 }, cd: [2.0, 1.9, 1.8, 1.65],
      range: 150, kb: [40, 45, 50, 60], crit: 0, critMult: 2, hitR: 22,
    },
    {
      id: 'sword', name: 'Kılıç', type: 'melee', cls: ['blade'], price: 24, minTier: 2,
      dmg: [14, 24, 36, 56], scale: { meleeDamage: 1.5 }, cd: [1.1, 1.05, 0.98, 0.9],
      range: 180, kb: [8, 8, 10, 12], crit: 0.08, critMult: 2, hitR: 16,
    },
    {
      id: 'wrench', name: 'İngiliz Anahtarı', type: 'melee', cls: ['tool'], price: 16,
      dmg: [10, 15, 22, 32], scale: { engineering: 1 }, cd: [1.1, 1.05, 1.0, 0.95],
      range: 140, kb: [10, 10, 12, 12], crit: 0, critMult: 2, hitR: 16, turret: true,
    },
    {
      id: 'pistol', name: 'Tabanca', type: 'ranged', cls: ['gun'], price: 15,
      dmg: [12, 20, 30, 50], scale: { rangedDamage: 1 }, cd: [1.2, 1.12, 1.03, 0.87],
      range: 400, kb: [5, 5, 6, 6], crit: 0, critMult: 2, pierce: [1, 1, 1, 1], speed: 950, projR: 5,
    },
    {
      id: 'smg', name: 'Makineli Tüfek', type: 'ranged', cls: ['gun'], price: 22,
      dmg: [3, 4, 5, 7], scale: { rangedDamage: 0.5 }, cd: [0.18, 0.17, 0.16, 0.15],
      range: 380, kb: [1, 1, 1, 1], crit: 0, critMult: 2, spread: 0.35, speed: 900, projR: 4,
    },
    {
      id: 'shotgun', name: 'Pompalı', type: 'ranged', cls: ['gun'], price: 22,
      dmg: [4, 7, 10, 15], scale: { rangedDamage: 0.75 }, cd: [1.35, 1.28, 1.18, 1.05],
      range: 330, kb: [8, 8, 9, 10], crit: 0, critMult: 2, proj: [4, 4, 5, 6], spread: 0.55,
      pierce: [1, 1, 2, 2], speed: 850, projR: 5,
    },
    {
      id: 'crossbow', name: 'Arbalet', type: 'ranged', cls: ['precise'], price: 20,
      dmg: [10, 17, 27, 42], scale: { rangedDamage: 1 }, cd: [1.25, 1.18, 1.1, 1.0],
      range: 450, kb: [6, 6, 7, 8], crit: 0.15, critMult: 2.5, pierce: [2, 2, 3, 3], speed: 1000, projR: 5,
    },
    {
      id: 'wand', name: 'Ateş Asası', type: 'ranged', cls: ['elemental'], price: 18,
      dmg: [5, 8, 12, 18], scale: { elementalDamage: 1 }, cd: [0.95, 0.9, 0.84, 0.76],
      range: 380, kb: [2, 2, 2, 2], crit: 0, critMult: 2, burn: [3, 5, 8, 12], burnScale: 1,
      pierce: [1, 1, 2, 2], speed: 650, projR: 7,
    },
    {
      id: 'rocket', name: 'Roketatar', type: 'ranged', cls: ['explosive', 'heavy'], price: 30, minTier: 2,
      dmg: [15, 22, 34, 55], scale: { rangedDamage: 1 }, cd: [1.7, 1.6, 1.5, 1.35],
      range: 450, kb: [15, 15, 16, 18], crit: 0, critMult: 2, explode: [70, 75, 80, 90], speed: 600, projR: 7,
    },
  ];
  D.WEAPON_TIER_MULT = [1, 1.9, 3.5, 6.5];

  // İngiliz anahtarı ve taret eşyalarının kurduğu taret
  D.TURRET = { dmg: [5, 9, 14, 22], scale: 1, cd: [0.9, 0.8, 0.7, 0.6], range: 450, speed: 900 };

  /* ---------- Eşyalar ---------- */
  D.ITEMS = [
    // Sıradan
    { id: 'helmet', name: 'Kask', tier: 1, price: 18, stats: { armor: 2, speed: -2 } },
    { id: 'scope', name: 'Dürbün', tier: 1, price: 15, stats: { range: 30, attackSpeed: -3 } },
    { id: 'coffee', name: 'Kahve', tier: 1, price: 18, stats: { attackSpeed: 8, hpRegen: -1 } },
    { id: 'sneakers', name: 'Spor Ayakkabı', tier: 1, price: 20, stats: { speed: 6 } },
    { id: 'bandaid', name: 'Yara Bandı', tier: 1, price: 15, stats: { hpRegen: 2 } },
    { id: 'coin', name: 'Şanslı Para', tier: 1, price: 15, stats: { luck: 8 } },
    { id: 'gloves', name: 'Bahçe Eldiveni', tier: 1, price: 18, stats: { harvesting: 6 } },
    { id: 'smallheart', name: 'Küçük Kalp', tier: 1, price: 18, stats: { maxHp: 3 } },
    { id: 'whetstone', name: 'Bileme Taşı', tier: 1, price: 15, stats: { meleeDamage: 2 } },
    { id: 'ammo', name: 'Mermi Kutusu', tier: 1, price: 18, stats: { rangedDamage: 2 } },
    { id: 'match', name: 'Kibrit', tier: 1, price: 15, stats: { elementalDamage: 2 } },
    { id: 'screwdriver', name: 'Tornavida', tier: 1, price: 15, stats: { engineering: 2 } },
    { id: 'feather', name: 'Tüy', tier: 1, price: 18, stats: { dodge: 3 } },
    { id: 'fang', name: 'Vampir Dişi', tier: 1, price: 18, stats: { lifeSteal: 2 } },
    { id: 'magnet', name: 'Mıknatıs', tier: 1, price: 12, stats: { pickupRange: 40 } },
    { id: 'juice', name: 'Elma Suyu', tier: 1, price: 20, stats: { maxHp: 2, hpRegen: 1 } },
    // Nadir
    { id: 'shield', name: 'Kalkan', tier: 2, price: 40, stats: { armor: 4, speed: -3 } },
    { id: 'energy', name: 'Enerji İçeceği', tier: 2, price: 35, stats: { attackSpeed: 12, maxHp: -2 } },
    { id: 'glasses', name: 'Gözlük', tier: 2, price: 35, stats: { critChance: 6, range: 20 } },
    { id: 'rabbit', name: 'Tavşan Ayağı', tier: 2, price: 40, stats: { luck: 15, dodge: 2 } },
    { id: 'protein', name: 'Protein Tozu', tier: 2, price: 45, stats: { damage: 8 } },
    { id: 'fertilizer', name: 'Gübre', tier: 2, price: 35, stats: { harvesting: 12, damage: -3 } },
    { id: 'medkit', name: 'İlk Yardım Çantası', tier: 2, price: 40, stats: { hpRegen: 3, armor: 1 } },
    { id: 'turret', name: 'Taret', tier: 2, price: 45, stats: { engineering: 1 }, turret: 1, max: 4 },
    { id: 'vest', name: 'Dikenli Yelek', tier: 2, price: 45, stats: { armor: 2, maxHp: 3 } },
    { id: 'drumstick', name: 'Tavuk But', tier: 2, price: 38, stats: { maxHp: 6, speed: -3 } },
    { id: 'holywater', name: 'Kutsal Su', tier: 2, price: 40, stats: { elementalDamage: 3, hpRegen: 1 } },
    { id: 'compass', name: 'Pusula', tier: 2, price: 38, stats: { range: 40, speed: 3 } },
    // Destansı
    { id: 'adrenaline', name: 'Adrenalin', tier: 3, price: 70, stats: { damage: 15, armor: -2 } },
    { id: 'robotarm', name: 'Robot Kol', tier: 3, price: 65, stats: { engineering: 5, attackSpeed: 5 } },
    { id: 'wings', name: 'Kanatlar', tier: 3, price: 75, stats: { speed: 10, dodge: 5 } },
    { id: 'cape', name: 'Vampir Pelerini', tier: 3, price: 70, stats: { lifeSteal: 5, damage: 5, hpRegen: -2 } },
    { id: 'giantheart', name: 'Dev Kalbi', tier: 3, price: 70, stats: { maxHp: 12, speed: -5 } },
    { id: 'lasersight', name: 'Lazer Nişangah', tier: 3, price: 70, stats: { critChance: 10, range: 50 } },
    { id: 'goldshovel', name: 'Altın Kürek', tier: 3, price: 65, stats: { harvesting: 20, luck: 10 } },
    { id: 'laserturret', name: 'Lazer Taret', tier: 3, price: 85, stats: { engineering: 2 }, turret: 3, max: 3 },
    { id: 'blackhole', name: 'Kara Delik', tier: 3, price: 55, stats: { pickupRange: 100, luck: 5 } },
    // Efsanevi
    { id: 'crown', name: 'Kozmik Taç', tier: 4, price: 120, stats: { damage: 15, attackSpeed: 15, maxHp: 5 } },
    { id: 'titan', name: 'Titan Zırhı', tier: 4, price: 110, stats: { armor: 10, maxHp: 10, speed: -8 } },
    { id: 'ghost', name: 'Hayalet Pelerin', tier: 4, price: 110, stats: { dodge: 15, speed: 10, maxHp: -5 } },
    { id: 'eye', name: 'Sonsuzluk Gözü', tier: 4, price: 125, stats: { critChance: 15, meleeDamage: 4, rangedDamage: 4, elementalDamage: 4 } },
    { id: 'goldheart', name: 'Altın Yürek', tier: 4, price: 120, stats: { maxHp: 15, hpRegen: 5, lifeSteal: 3 } },
    { id: 'robotarmy', name: 'Robot Ordusu', tier: 4, price: 130, stats: { engineering: 6 }, turret: 4, max: 2 },
  ];

  /* ---------- Seviye atlama geliştirmeleri ---------- */
  D.UPGRADES = [
    { stat: 'maxHp', name: 'Kalp', vals: [3, 6, 9, 12] },
    { stat: 'hpRegen', name: 'Kan', vals: [2, 3, 4, 5] },
    { stat: 'lifeSteal', name: 'Diş', vals: [1, 2, 3, 4] },
    { stat: 'damage', name: 'Kas', vals: [5, 8, 12, 16] },
    { stat: 'meleeDamage', name: 'Pazı', vals: [2, 3, 4, 5] },
    { stat: 'rangedDamage', name: 'Keskin Göz', vals: [1, 2, 3, 4] },
    { stat: 'elementalDamage', name: 'Kıvılcım', vals: [1, 2, 3, 4] },
    { stat: 'attackSpeed', name: 'Refleks', vals: [5, 10, 15, 20] },
    { stat: 'critChance', name: 'Nişan', vals: [3, 5, 7, 9] },
    { stat: 'engineering', name: 'Beyin', vals: [2, 3, 4, 5] },
    { stat: 'range', name: 'Kartal', vals: [15, 30, 45, 60] },
    { stat: 'armor', name: 'Kabuk', vals: [1, 2, 3, 4] },
    { stat: 'dodge', name: 'Çeviklik', vals: [3, 6, 9, 12] },
    { stat: 'speed', name: 'Ayak', vals: [3, 6, 9, 12] },
    { stat: 'luck', name: 'Yonca', vals: [5, 10, 15, 20] },
    { stat: 'harvesting', name: 'Tarla', vals: [5, 8, 10, 12] },
  ];

  /* ---------- Karakterler ---------- */
  const ALL_STARTERS = ['fist', 'knife', 'spear', 'hammer', 'wrench', 'pistol', 'smg', 'shotgun', 'crossbow', 'wand'];
  D.CHARACTERS = [
    {
      id: 'allround', name: 'Çok Yönlü', desc: 'Her işten biraz anlayan dengeli bir patates.',
      stats: { maxHp: 5, speed: 5, harvesting: 8 }, starters: ALL_STARTERS,
    },
    {
      id: 'brawler', name: 'Kavgacı', desc: 'Sorunları yumrukla çözer.',
      stats: { meleeDamage: 3, attackSpeed: 15, dodge: 5, rangedDamage: -4, range: -25 },
      starters: ['fist', 'knife', 'hammer', 'spear'],
    },
    {
      id: 'ranger', name: 'Avcı', desc: 'Uzaktan vurur. Yakın dövüş silahı kullanamaz.',
      stats: { range: 60, rangedDamage: 3, maxHp: -3 }, starters: ['pistol', 'smg', 'shotgun', 'crossbow'],
      onlyType: 'ranged',
    },
    {
      id: 'mage', name: 'Büyücü', desc: 'Düşmanlarını ağır ağır kızartır.',
      stats: { elementalDamage: 4, hpRegen: 2, meleeDamage: -2, rangedDamage: -2 },
      starters: ['wand', 'fist', 'pistol'],
    },
    {
      id: 'engineer', name: 'Mühendis', desc: 'Taretler onun yerine savaşır. Bir taretle başlar.',
      stats: { engineering: 4, attackSpeed: -5 }, starters: ['wrench', 'fist', 'pistol'], startItems: ['turret'],
    },
    {
      id: 'lucky', name: 'Şanslı', desc: 'Yonca tarlasında doğdu. Nadir eşyalar onu bulur.',
      stats: { luck: 60, harvesting: 5, damage: -8 }, starters: ALL_STARTERS,
    },
  ];

  /* ---------- Tehlike seviyeleri ---------- */
  D.DANGERS = [
    { name: 'Tehlike 0', desc: 'Normal düşmanlar. İlk koşu için ideal.', hp: 1.0, dmg: 1.0, rate: 1.0, spd: 1.0 },
    { name: 'Tehlike 1', desc: 'Düşmanlar %15 daha dayanıklı ve sert vurur.', hp: 1.15, dmg: 1.15, rate: 1.0, spd: 1.0 },
    { name: 'Tehlike 2', desc: 'Düşmanlar %30 daha güçlü ve %12 daha sık gelir.', hp: 1.3, dmg: 1.3, rate: 1.12, spd: 1.0 },
    { name: 'Tehlike 3', desc: 'Düşmanlar %45 daha güçlü, %5 daha hızlı ve %25 daha sık gelir.', hp: 1.45, dmg: 1.45, rate: 1.25, spd: 1.05 },
  ];

  /* ---------- Düşmanlar ---------- */
  D.ENEMIES = {
    baby: { name: 'Bebek Uzaylı', r: 18, hp: 3, hpW: 2.2, speed: [185, 215], dmg: 1, dmgW: 0.6, mats: 1, color: '#a98bd6', dark: '#4a3666', ai: 'chase' },
    chaser: { name: 'Fırlayan', r: 14, hp: 2, hpW: 1.1, speed: [295, 325], dmg: 1, dmgW: 0.5, mats: 1, color: '#e57aa0', dark: '#6b2b45', ai: 'chase' },
    spitter: { name: 'Tükürükçü', r: 19, hp: 8, hpW: 2.2, speed: [130, 150], dmg: 1, dmgW: 0.6, mats: 1, color: '#7cc46a', dark: '#2f5a26', ai: 'ranged' },
    charger: { name: 'Boğa', r: 22, hp: 14, hpW: 4, speed: [140, 155], dmg: 2, dmgW: 0.8, mats: 2, color: '#e8a050', dark: '#6b4219', ai: 'charger' },
    bruiser: { name: 'Kabadayı', r: 32, hp: 30, hpW: 12, speed: [125, 140], dmg: 3, dmgW: 1, mats: 3, color: '#6f86d9', dark: '#2c376b', ai: 'chase', kbRes: 0.75 },
    tree: { name: 'Ağaç', r: 28, hp: 12, hpW: 6, speed: [0, 0], dmg: 0, dmgW: 0, mats: 3, color: '#5c9a3d', dark: '#24401a', ai: 'tree', kbRes: 1 },
    elite: { name: 'Elit Muhafız', r: 52, hp: 600, hpW: 110, speed: [140, 140], dmg: 5, dmgW: 1, mats: 30, color: '#d0504d', dark: '#5a1a1a', ai: 'elite', kbRes: 1, bulletMult: 0.7, big: true },
    boss: { name: 'Kraliçe Zorg', r: 74, hp: 15000, hpW: 0, speed: [125, 125], dmg: 20, dmgW: 0, mats: 0, color: '#9b4fd1', dark: '#3b1352', ai: 'boss', kbRes: 1, bulletMult: 0.55, big: true },
  };

  /* ---------- Dalga ayarları ---------- */
  D.waveDuration = function (n) {
    if (n >= D.MAX_WAVE) return 90;
    return Math.min(60, 15 + 5 * n);
  };

  D.spawnInterval = function (n) {
    return Math.max(0.55, 1.4 - 0.05 * (n - 1));
  };

  D.groupSize = function (n) {
    const base = 1 + Math.floor((n + 1) / 4);
    return U.randInt(base, base + 1);
  };

  D.spawnTable = function (n) {
    const t = [{ v: 'baby', w: n < 10 ? 10 : 8 }];
    if (n >= 3) t.push({ v: 'chaser', w: 2 + n * 0.15 });
    if (n >= 4) t.push({ v: 'spitter', w: 2 + n * 0.1 });
    if (n >= 6) t.push({ v: 'charger', w: 2 + n * 0.08 });
    if (n >= 8) t.push({ v: 'bruiser', w: 1.2 + (n - 8) * 0.25 });
    return t;
  };

  // İleriki dalgalarda düşman canı ayrıca katlanarak artar
  D.hpWaveMult = function (n) {
    return 1 + Math.max(0, n - 4) * 0.12;
  };

  D.isEliteWave = function (n) {
    return n === 11 || n === 16;
  };

  // Seviye L'ye ulaşmak için gereken deneyim (bir önceki seviyeden itibaren)
  D.xpForLevel = function (L) {
    return (L + 3) * (L + 3);
  };

  D.price = function (base, wave) {
    return Math.max(1, Math.round(base * (1 + 0.15 * (wave - 1))));
  };

  /* ---------- Arama tabloları ---------- */
  D.WEAPON_BY_ID = {};
  D.WEAPONS.forEach((w) => {
    D.WEAPON_BY_ID[w.id] = w;
  });
  D.ITEM_BY_ID = {};
  D.ITEMS.forEach((it) => {
    D.ITEM_BY_ID[it.id] = it;
  });
  D.CHAR_BY_ID = {};
  D.CHARACTERS.forEach((c) => {
    D.CHAR_BY_ID[c.id] = c;
  });
  D.UPGRADE_BY_STAT = {};
  D.UPGRADES.forEach((u) => {
    D.UPGRADE_BY_STAT[u.stat] = u;
  });

  BR.DATA = D;
})((window.BR = window.BR || {}));
