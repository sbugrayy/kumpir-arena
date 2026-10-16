/* Kumpir Arena - oyun verileri: istatistikler, silahlar, eşyalar, karakterler, düşmanlar,
   arenalar, harita, olaylar, kumpir malzemeleri ve başarımlar */
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
    { key: 'elementalDamage', name: 'Elementel Hasar', short: 'Elementel', desc: 'Ateş asası, yanma ve zehir hasarına eklenir.' },
    { key: 'attackSpeed', name: 'Saldırı Hızı', pct: true, desc: 'Silahların daha sık saldırır.' },
    { key: 'critChance', name: 'Kritik Şansı', pct: true, desc: 'Kritik vuruş yapma şansı. Kritik vuruşlar silahın çarpanı kadar hasar verir.' },
    { key: 'engineering', name: 'Mühendislik', short: 'Mühendislik', desc: 'Taretlerin ve İngiliz anahtarının hasarını artırır.' },
    { key: 'range', name: 'Menzil', desc: 'Silah menzili. Yakın dövüş silahları bunun yarısını alır.' },
    { key: 'armor', name: 'Zırh', desc: 'Alınan hasarı azaltır.' },
    { key: 'dodge', name: 'Kaçınma', pct: true, desc: 'Saldırılardan tamamen kaçınma şansı (en fazla %60).' },
    { key: 'speed', name: 'Hız', pct: true, desc: 'Hareket hızı.' },
    { key: 'luck', name: 'Şans', desc: 'Dükkanda daha nadir eşyalar, daha çok meyve, sandık ve kumpir malzemesi.' },
    { key: 'harvesting', name: 'Hasat', desc: 'Her dalga sonunda bu kadar malzeme ve deneyim kazanırsın. Her dalga %5 büyür.' },
  ];
  D.EXTRA_STATS = [{ key: 'pickupRange', name: 'Toplama Menzili', pct: true, desc: 'Malzemeleri ne kadar uzaktan çektiğin.' }];
  D.STAT_BY_KEY = {};
  D.STATS.concat(D.EXTRA_STATS).forEach((s) => {
    D.STAT_BY_KEY[s.key] = s;
  });

  /* ---------- Nadirlik (renk körü paleti ayarlardan seçilir) ---------- */
  D.TIER_PALETTES = {
    normal: ['', '#d8cfbd', '#5aa9ff', '#b77cff', '#ff5d5d'],
    colorblind: ['', '#d8cfbd', '#56b4e9', '#e69f00', '#cc79a7'],
  };
  D.TIERS = [
    null,
    { name: 'Sıradan', color: '#d8cfbd' },
    { name: 'Nadir', color: '#5aa9ff' },
    { name: 'Destansı', color: '#b77cff' },
    { name: 'Efsanevi', color: '#ff5d5d' },
  ];
  D.EVO_COLOR = '#ffcd4d';
  D.applyPalette = function (name) {
    const pal = D.TIER_PALETTES[name] || D.TIER_PALETTES.normal;
    for (let t = 1; t <= 4; t++) D.TIERS[t].color = pal[t];
  };

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
  // evo: true olanlar yalnızca evrimle elde edilir, dükkanda çıkmaz.
  const four = (v) => [v, v, v, v];
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
    // ---- Evrim silahları ----
    {
      id: 'flamer', name: 'Alev Püskürtücü', type: 'ranged', cls: ['elemental', 'gun'], price: 150, evo: true,
      dmg: four(6), scale: { elementalDamage: 1, rangedDamage: 0.5 }, cd: four(0.14),
      range: 270, kb: four(1), crit: 0, critMult: 2, proj: four(2), spread: 0.6, burn: four(10), burnScale: 1.5,
      pierce: four(2), speed: 520, projR: 9, desc: 'Kısa menzilde her şeyi tutuşturan alev seli.',
    },
    {
      id: 'gatling', name: 'Gatling', type: 'ranged', cls: ['gun'], price: 150, evo: true,
      dmg: four(9), scale: { rangedDamage: 0.8 }, cd: four(0.07),
      range: 430, kb: four(2), crit: 0.05, critMult: 2, spread: 0.2, pierce: four(1), speed: 1000, projR: 5,
      desc: 'Durmadan dönen namlular, delip geçen mermiler.',
    },
    {
      id: 'quakeglove', name: 'Deprem Eldiveni', type: 'melee', cls: ['unarmed', 'heavy'], price: 150, evo: true,
      dmg: four(40), scale: { meleeDamage: 2 }, cd: four(0.8),
      range: 160, kb: four(30), crit: 0.05, critMult: 2, hitR: 20, shock: 110,
      desc: 'Her vuruşta çevredeki düşmanlara da sarsıntı hasarı verir.',
    },
    {
      id: 'ballista', name: 'Balista', type: 'ranged', cls: ['precise'], price: 150, evo: true,
      dmg: four(90), scale: { rangedDamage: 2.5 }, cd: four(1.3),
      range: 650, kb: four(20), crit: 0.25, critMult: 3, pierce: four(99), speed: 1000, projR: 7,
      desc: 'Yolundaki her şeyi delip geçen dev ok.',
    },
    {
      id: 'missile', name: 'Güdümlü Füze', type: 'ranged', cls: ['explosive', 'tool'], price: 150, evo: true,
      dmg: four(45), scale: { rangedDamage: 1, engineering: 1 }, cd: four(0.9),
      range: 600, kb: four(15), crit: 0, critMult: 2, proj: four(2), spread: 0.5, explode: four(95),
      homing: true, speed: 520, projR: 7, desc: 'Hedefini kendisi bulan iki füze.',
    },
    {
      id: 'vampsword', name: 'Vampir Kılıcı', type: 'melee', cls: ['blade'], price: 150, evo: true,
      dmg: four(45), scale: { meleeDamage: 1.8 }, cd: four(0.75),
      range: 190, kb: four(10), crit: 0.15, critMult: 2.5, hitR: 18, lsHit: true,
      desc: 'Her vuruş 1 can çalar (saniyede en fazla 10).',
    },
  ];
  D.WEAPON_TIER_MULT = [1, 1.9, 3.5, 6.5];

  // İki farklı silah + katalizör eşya = evrim silahı (katalizör harcanmaz).
  // İki silahın da en az EVO_MIN_TIER kademede olması gerekir. IV şartında çoğu tarifte iki efsanevi
  // silah, çıkan evrim silahından toplamda daha güçlü olduğu için evrim kayba dönerdi; III dengeli.
  D.EVO_MIN_TIER = 3;
  D.EVOLUTIONS = [
    { id: 'flamer', a: 'wand', b: 'shotgun', item: 'match' },
    { id: 'gatling', a: 'pistol', b: 'smg', item: 'ammo' },
    { id: 'quakeglove', a: 'fist', b: 'hammer', item: 'whetstone' },
    { id: 'ballista', a: 'crossbow', b: 'spear', item: 'scope' },
    { id: 'missile', a: 'rocket', b: 'wrench', item: 'screwdriver' },
    { id: 'vampsword', a: 'knife', b: 'sword', item: 'fang' },
  ];

  // İngiliz anahtarı ve taret eşyalarının kurduğu taret
  D.TURRET = { dmg: [5, 9, 14, 22], scale: 1, cd: [0.9, 0.8, 0.7, 0.6], range: 450, speed: 900 };

  /* ---------- Eşyalar ---------- */
  // fx: kural değiştiren (tetiklenen) etki. desc oyuncuya gösterilir.
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
    { id: 'fruitbasket', name: 'Meyve Sepeti', tier: 1, price: 22, stats: {}, fx: 'fruitPower', max: 1, desc: 'Meyveler 2 kat iyileştirir, 2 saniye ölümsüzlük verir ve %50 daha sık düşer.' },
    { id: 'piggybank', name: 'Kumbara', tier: 1, price: 20, stats: {}, fx: 'interest', max: 2, desc: 'Faiz sınırını +10 artırır.' },
    { id: 'magglove', name: 'Mıknatıslı Eldiven', tier: 1, price: 18, stats: { pickupRange: 15 }, fx: 'doubleMat', max: 3, desc: 'Topladığın malzeme %6 şansla iki katına çıkar (her kopya +%6).' },
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
    { id: 'bombvest', name: 'Bomba Yeleği', tier: 2, price: 45, stats: {}, fx: 'killBlast', max: 3, desc: 'Her 15 öldürmede çevrende bir patlama olur (her kopya patlamayı sıklaştırır).' },
    { id: 'ragemask', name: 'Öfke Maskesi', tier: 2, price: 40, stats: { damage: 3 }, fx: 'rage', max: 1, desc: 'Canın %30\'un altındayken verdiğin hasar 1,5 katına çıkar.' },
    { id: 'vampnecklace', name: 'Vampir Kolyesi', tier: 2, price: 40, stats: {}, fx: 'killHeal', max: 3, desc: 'Her öldürmede %8 şansla 1 can kazanırsın (her kopya +%8).' },
    { id: 'thornarmor', name: 'Diken Zırhı', tier: 2, price: 45, stats: { armor: 1 }, fx: 'thorns', max: 3, desc: 'Hasar aldığında yakındaki düşmanlara 8 + 3×Zırh hasar verirsin.' },
    { id: 'frostcrystal', name: 'Buz Kristali', tier: 2, price: 40, stats: {}, fx: 'freeze', max: 3, desc: 'Vuruşların %8 şansla düşmanı 1,2 saniye yavaşlatır (her kopya +%8).' },
    { id: 'magicbean', name: 'Sihirli Fasulye', tier: 2, price: 35, stats: { harvesting: 3 }, fx: 'seedGrow', max: 1, desc: 'Ektiğin tohumlar bir dalga erken olgunlaşır.' },
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
    { id: 'shadowcloak', name: 'Gölge Pelerini', tier: 3, price: 70, stats: { dodge: 3 }, fx: 'dodgeInvis', max: 1, desc: 'Bir saldırıdan kaçınınca 1 saniye görünmez ve %30 daha hızlı olursun.' },
    { id: 'chainlight', name: 'Zincir Yıldırım', tier: 3, price: 75, stats: { critChance: 3 }, fx: 'chain', max: 3, desc: 'Kritik vuruşlar yakındaki 2 düşmana yarı hasarla sıçrar (her kopya +1 sıçrama).' },
    { id: 'shieldgen', name: 'Kalkan Jeneratörü', tier: 3, price: 80, stats: {}, fx: 'shield', max: 2, desc: 'Bir isabeti tamamen engelleyen kalkan; 10 saniyede bir yenilenir (2 kopya: 5 saniye).' },
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

  /* ---------- Aktif yetenekler ---------- */
  D.ABILITIES = {
    spudrain: { name: 'Patates Yağmuru', cd: 10, desc: 'Etrafına 16 patates fırlatır.' },
    quake: { name: 'Yer Sarsıntısı', cd: 9, desc: 'Yere vurur; yakındaki düşmanlara hasar verip onları savurur.' },
    focus: { name: 'Avcı Odağı', cd: 14, desc: '4 saniye boyunca saldırı hızı +%80, kritik şansı +%20.' },
    firering: { name: 'Ateş Halkası', cd: 10, desc: 'Çevrendeki bütün düşmanları tutuşturur.' },
    deploy: { name: 'Acil Taret', cd: 14, desc: 'Bulunduğun yere 12 saniyelik güçlü bir taret kurar.' },
    dice: { name: 'Şans Zarı', cd: 15, desc: 'Rastgele: malzeme, %50 iyileşme ya da 4 saniye altın kalkan ve çift hasar.' },
    steam: { name: 'Buhar Patlaması', cd: 8, desc: 'Kızgın buhar; çevreyi iter ve maks. canına göre hasar verir.' },
    cloud: { name: 'Zehir Bulutu', cd: 12, desc: '5 saniyelik büyük bir zehir bulutu bırakır.' },
    cleave: { name: 'Satır Fırtınası', cd: 9, desc: 'Dönerek çevresindeki her şeyi doğrar, vurduğu her düşmandan can çalar.' },
  };
  D.DASH = { cd: 1.4, time: 0.16, mult: 3.2 };

  /* ---------- Karakterler ---------- */
  const ALL_STARTERS = ['fist', 'knife', 'spear', 'hammer', 'wrench', 'pistol', 'smg', 'shotgun', 'crossbow', 'wand'];
  D.CHARACTERS = [
    {
      id: 'allround', name: 'Çok Yönlü', desc: 'Her işten biraz anlayan dengeli bir patates.',
      stats: { maxHp: 5, speed: 5, harvesting: 8 }, starters: ALL_STARTERS, ability: 'spudrain',
    },
    {
      id: 'brawler', name: 'Kavgacı', desc: 'Sorunları yumrukla çözer.',
      stats: { meleeDamage: 3, attackSpeed: 15, dodge: 5, rangedDamage: -4, range: -25 },
      starters: ['fist', 'knife', 'hammer', 'spear'], ability: 'quake',
    },
    {
      id: 'ranger', name: 'Avcı', desc: 'Uzaktan vurur. Yakın dövüş silahı kullanamaz.',
      stats: { range: 60, rangedDamage: 3, maxHp: -3 }, starters: ['pistol', 'smg', 'shotgun', 'crossbow'],
      onlyType: 'ranged', ability: 'focus',
    },
    {
      id: 'mage', name: 'Büyücü', desc: 'Düşmanlarını ağır ağır kızartır.',
      stats: { elementalDamage: 4, hpRegen: 2, meleeDamage: -2, rangedDamage: -2 },
      starters: ['wand', 'fist', 'pistol'], ability: 'firering',
    },
    {
      id: 'engineer', name: 'Mühendis', desc: 'Taretler onun yerine savaşır. Bir taretle başlar.',
      stats: { engineering: 4, attackSpeed: -5 }, starters: ['wrench', 'fist', 'pistol'], startItems: ['turret'],
      ability: 'deploy',
    },
    {
      id: 'lucky', name: 'Şanslı', desc: 'Yonca tarlasında doğdu. Nadir eşyalar onu bulur.',
      stats: { luck: 60, harvesting: 5, damage: -8 }, starters: ALL_STARTERS, ability: 'dice',
    },
    {
      id: 'boiled', name: 'Haşlanmış', desc: 'Silah taşıyamaz ama kızgın teniyle çarptığı düşmanı haşlar.',
      stats: { maxHp: 15, armor: 3, speed: 5 }, starters: [], noWeapons: true, ability: 'steam',
      unlock: 'wave5', rule: 'Silah taşıyamaz; dokunduğu düşmanlara sürekli hasar verir.',
    },
    {
      id: 'butcher', name: 'Kasap', desc: 'Satırını konuşturur. Kesici silahlarla ustadır.',
      stats: { meleeDamage: 2, lifeSteal: 3 }, starters: ['knife', 'fist'], ability: 'cleave',
      classDmg: { blade: 0.5, other: -0.25 }, unlock: 'knife10',
      rule: 'Kesici silahlar %50 daha fazla, diğerleri %25 daha az hasar verir.',
    },
    {
      id: 'rotten', name: 'Çürük', desc: 'Kokusu bile öldürür. Ama her dalga biraz daha çürür.',
      stats: { elementalDamage: 3, maxHp: 4 }, starters: ALL_STARTERS, ability: 'cloud', aura: true,
      unlock: 'kills500', rule: 'Yakınındaki düşmanlar zehirlenir; her dalga başında 1 maks. can kaybeder.',
    },
  ];

  /* ---------- Tehlike seviyeleri ---------- */
  D.DANGERS = [
    { name: 'Tehlike 0', desc: 'Normal düşmanlar. İlk koşu için ideal.', hp: 1.0, dmg: 1.0, rate: 1.0, spd: 1.0 },
    { name: 'Tehlike 1', desc: 'Düşmanlar %15 daha dayanıklı ve sert vurur.', hp: 1.15, dmg: 1.15, rate: 1.0, spd: 1.0 },
    { name: 'Tehlike 2', desc: 'Düşmanlar %40 daha dayanıklı, %35 daha sert ve %15 daha sık gelir. Elitler iki özellik taşır.', hp: 1.4, dmg: 1.35, rate: 1.15, spd: 1.0 },
    { name: 'Tehlike 3', desc: 'Düşmanlar %60 daha dayanıklı, %50 daha sert, %6 daha hızlı ve %28 daha sık gelir. Elitler iki özellik taşır.', hp: 1.6, dmg: 1.5, rate: 1.28, spd: 1.06 },
  ];

  /* ---------- Düşmanlar ---------- */
  D.ENEMIES = {
    baby: { name: 'Bebek Uzaylı', r: 18, hp: 3, hpW: 2.2, speed: [185, 215], dmg: 1, dmgW: 0.6, mats: 1, color: '#a98bd6', dark: '#4a3666', ai: 'chase' },
    chaser: { name: 'Fırlayan', r: 14, hp: 2, hpW: 1.1, speed: [295, 325], dmg: 1, dmgW: 0.5, mats: 1, color: '#e57aa0', dark: '#6b2b45', ai: 'chase' },
    spitter: { name: 'Tükürükçü', r: 19, hp: 8, hpW: 2.2, speed: [130, 150], dmg: 1, dmgW: 0.6, mats: 1, color: '#7cc46a', dark: '#2f5a26', ai: 'ranged' },
    charger: { name: 'Boğa', r: 22, hp: 14, hpW: 4, speed: [140, 155], dmg: 2, dmgW: 0.8, mats: 2, color: '#e8a050', dark: '#6b4219', ai: 'charger' },
    bruiser: { name: 'Kabadayı', r: 32, hp: 30, hpW: 12, speed: [125, 140], dmg: 3, dmgW: 1, mats: 3, color: '#6f86d9', dark: '#2c376b', ai: 'chase', kbRes: 0.75 },
    thief: { name: 'Hırsız', r: 16, hp: 4, hpW: 2, speed: [250, 280], dmg: 1, dmgW: 0.4, mats: 1, color: '#d6c35a', dark: '#5a4f1c', ai: 'thief' },
    slime: { name: 'Pelte', r: 24, hp: 10, hpW: 4, speed: [120, 140], dmg: 2, dmgW: 0.7, mats: 1, color: '#5ccfb8', dark: '#1e5c50', ai: 'chase', split: 'slimelet' },
    slimelet: { name: 'Pelte Yavrusu', r: 13, hp: 4, hpW: 1.5, speed: [170, 200], dmg: 1, dmgW: 0.5, mats: 1, color: '#7fe0cc', dark: '#1e5c50', ai: 'chase' },
    healer: { name: 'Şifacı', r: 18, hp: 10, hpW: 3, speed: [120, 140], dmg: 1, dmgW: 0.4, mats: 2, color: '#f0f0e0', dark: '#4b7a3a', ai: 'healer' },
    shielder: { name: 'Kalkanlı', r: 22, hp: 18, hpW: 5, speed: [120, 135], dmg: 2, dmgW: 0.8, mats: 2, color: '#9aa3ad', dark: '#3a4048', ai: 'chase', shield: true },
    tree: { name: 'Ağaç', r: 28, hp: 12, hpW: 6, speed: [0, 0], dmg: 0, dmgW: 0, mats: 3, color: '#5c9a3d', dark: '#24401a', ai: 'tree', kbRes: 1 },
    egg: { name: 'Uzaylı Yumurtası', r: 16, hp: 20, hpW: 5, speed: [0, 0], dmg: 0, dmgW: 0, mats: 1, color: '#e8e0f0', dark: '#6b5a80', ai: 'egg', kbRes: 1 },
    elite: { name: 'Elit Muhafız', r: 52, hp: 600, hpW: 110, speed: [140, 140], dmg: 5, dmgW: 1, mats: 30, color: '#d0504d', dark: '#5a1a1a', ai: 'elite', kbRes: 1, bulletMult: 0.7, big: true },
    boss: { name: 'Kraliçe Zorg', r: 74, hp: 15000, hpW: 0, speed: [125, 125], dmg: 20, dmgW: 0, mats: 0, color: '#9b4fd1', dark: '#3b1352', ai: 'boss', kbRes: 1, bulletMult: 0.55, big: true, isBoss: true },
    kroz: { name: 'Gözcü Kroz', r: 66, hp: 15000, hpW: 0, speed: [105, 105], dmg: 18, dmgW: 0, mats: 0, color: '#4fa3c7', dark: '#163b4d', ai: 'laserboss', kbRes: 1, bulletMult: 0.55, big: true, isBoss: true },
    mother: { name: 'Yumurta Ana', r: 80, hp: 17000, hpW: 0, speed: [80, 80], dmg: 20, dmgW: 0, mats: 0, color: '#c9a3e0', dark: '#4a2a5c', ai: 'eggboss', kbRes: 1, bulletMult: 0.55, big: true, isBoss: true },
  };
  D.BOSSES = ['boss', 'kroz', 'mother'];

  // Elit düşmanların rastgele özellikleri
  D.AFFIXES = {
    fast: { name: 'Hızlı', color: '#ffd23f' },
    explosive: { name: 'Patlayan', color: '#ff7a2e' },
    summoner: { name: 'Çağıran', color: '#b77cff' },
    armored: { name: 'Zırhlı', color: '#9aa3ad' },
    regen: { name: 'Yenilenen', color: '#7fe07a' },
  };

  /* ---------- Arenalar ---------- */
  D.ARENAS = {
    field: { name: 'Tarla', desc: 'Çamur birikintileri herkesi yavaşlatır.' },
    kitchen: { name: 'Mutfak', desc: 'Ocak gözleri kızarır, oklavalar yuvarlanır.' },
    market: { name: 'Pazar Yeri', desc: 'Tezgahlar düşman mermilerine siper olur.' },
  };
  D.arenaFor = function (n) {
    const k = Math.floor((n - 1) / 7) % 3;
    return ['field', 'kitchen', 'market'][k];
  };

  /* ---------- Dalga değiştiricileri ---------- */
  // hp/spd/dmg/rate/size: düşman çarpanları, mats: malzeme çarpanı
  D.MODIFIERS = {
    fog: { name: 'Sis', desc: 'Görüş daralır. Malzeme +%50.', mats: 1.5 },
    giants: { name: 'Dev Uzaylılar', desc: 'Daha az ama 1,6 kat dayanıklı ve iri düşmanlar. Malzeme +%40.', hp: 1.6, size: 1.2, rate: 0.7, mats: 1.4 },
    crowd: { name: 'Kalabalık', desc: 'Düşmanlar %40 daha sık gelir. Dalga sonunda bir sandık.', rate: 1.4, crate: 1 },
    rush: { name: 'Telaş', desc: 'Düşmanlar %20 daha hızlı. Malzeme +%30.', spd: 1.2, mats: 1.3 },
    gold: { name: 'Altın Yağmuru', desc: 'Malzeme 2 katı, ama düşmanlar %40 daha sert vurur.', dmg: 1.4, mats: 2 },
    orchard: { name: 'Meyve Bahçesi', desc: 'Ağaçlar ve meyveler bol. Düşman canı +%15.', hp: 1.15, trees: 3 },
    calm: { name: 'Sakin Gece', desc: 'Düşman canı -%20, malzeme -%30.', hp: 0.8, mats: 0.7 },
  };

  /* ---------- Rota haritası ---------- */
  D.NODE_TYPES = {
    normal: { name: 'Dalga', desc: 'Sıradan bir dalga.' },
    elite: { name: 'Elit Dalga', desc: 'Özellikli bir elit düşman gelir; düşerse destansı sandık bırakır.' },
    event: { name: 'Olay', desc: 'Dalgadan önce bir karşılaşma: seçimini yap.' },
    rest: { name: 'Dinlenme', desc: 'Bu dalgada savaş yok: bir ödül seç.' },
    boss: { name: 'Patron', desc: 'Son savaş.' },
  };

  /* ---------- Olaylar (mantığı progress.js'te) ---------- */
  D.EVENTS = {
    seller: { title: 'Gezgin Tohumcu', text: 'Sırtında çuvalla yaşlı bir tohumcu yanaşıyor: "Bu altın tohumu beş dalga sula, sana efsanevi bir şey verir."' },
    box: { title: 'Şüpheli Kutu', text: 'Yolun kenarında tıkırdayan bir kutu duruyor. İçinden tuhaf bir koku geliyor.' },
    chef: { title: 'Yaşlı Kumpirci', text: 'Tezgahını uzaylılar dağıtmış bir kumpirci yardım istiyor.' },
    blood: { title: 'Kan Bağışı', text: 'Gizemli bir doktor: "Biraz canını ver, karşılığında daha sert vurursun."' },
    smith: { title: 'Silah Ustası', text: 'Örsünün başındaki usta silahlarına göz atıyor: "Bunu bir kademe yükseltebilirim."' },
    fugitive: { title: 'Kaçak Uzaylı', text: 'Küçük bir uzaylı peşindeki sürüden kaçıyor ve senden saklanmak istiyor.' },
    gamble: { title: 'Kumarbaz Kertenkele', text: 'Bir kertenkele zarlarını sallıyor: "Yarısını yatır, ya ikiye katla ya kaybet."' },
    shrine: { title: 'Yonca Tapınağı', text: 'Dört yapraklı yoncalarla süslü küçük bir tapınak.' },
    well: { title: 'Dilek Kuyusu', text: 'Dibi görünmeyen bir kuyu. İçine malzeme atanların dilekleri gerçekleşirmiş.' },
  };

  /* ---------- Tohumlar ---------- */
  D.SEEDS = [
    { id: 'sprout', name: 'Fide', tier: 2, waves: 2, price: 20 },
    { id: 'rare', name: 'Değerli Tohum', tier: 3, waves: 3, price: 45 },
    { id: 'golden', name: 'Altın Tohum', tier: 4, waves: 5, price: 80 },
  ];
  D.MAX_SEEDS = 3;

  /* ---------- Kumpir malzemeleri ve tarifler ---------- */
  D.TOPPINGS = [
    { id: 'kasar', name: 'Kaşar', color: '#f2d45c', stats: { maxHp: 2 }, price: 6 },
    { id: 'tereyagi', name: 'Tereyağı', color: '#fff1a8', stats: { hpRegen: 1 }, price: 5 },
    { id: 'sosis', name: 'Sosis', color: '#c8553d', stats: { meleeDamage: 1 }, price: 7 },
    { id: 'misir', name: 'Mısır', color: '#f7c948', stats: { attackSpeed: 3 }, price: 5 },
    { id: 'tursu', name: 'Turşu', color: '#7cb342', stats: { critChance: 2 }, price: 6 },
    { id: 'acisos', name: 'Acı Sos', color: '#d32f2f', stats: { elementalDamage: 1 }, price: 7 },
    { id: 'zeytin', name: 'Zeytin', color: '#3e3b2f', stats: { dodge: 2 }, price: 6 },
    { id: 'rus', name: 'Rus Salatası', color: '#efe3cc', stats: { harvesting: 3 }, price: 8 },
  ];
  D.FILLING_SLOTS = 4;
  D.RECIPES = [
    { id: 'klasik', name: 'Klasik Kumpir', needs: ['kasar', 'tereyagi', 'misir', 'sosis'], stats: { damage: 10, maxHp: 5 } },
    { id: 'acili', name: 'Acılı Kumpir', needs: ['acisos', 'tursu', 'sosis'], stats: {}, fx: 'burnHit', desc: 'Vuruşların %20\'si düşmanı tutuşturur.' },
    { id: 'akdeniz', name: 'Akdeniz Kumpiri', needs: ['zeytin', 'tursu', 'kasar'], stats: { dodge: 6, range: 25 } },
    { id: 'bahce', name: 'Bahçe Kumpiri', needs: ['misir', 'rus', 'zeytin'], stats: { harvesting: 10, luck: 10 } },
    { id: 'kahvalti', name: 'Kahvaltılık', needs: ['kasar', 'tereyagi', 'zeytin'], stats: { hpRegen: 3, lifeSteal: 2 } },
    { id: 'ortakoy', name: 'Ortaköy Usulü', needs: ['rus', 'sosis', 'misir', 'kasar'], stats: { attackSpeed: 10, critChance: 5 } },
  ];

  /* ---------- Başarımlar ---------- */
  D.ACHIEVEMENTS = [
    { id: 'wave1', name: 'İlk Adım', desc: 'İlk dalgayı tamamla.' },
    { id: 'wave5', name: 'Fide', desc: 'Herhangi bir karakterle 5. dalgayı tamamla.', unlocks: 'boiled' },
    { id: 'knife10', name: 'Kasabın Çırağı', desc: 'Bıçakla başlayıp 10. dalgaya ulaş.', unlocks: 'butcher' },
    { id: 'kills500', name: 'Hasat Mevsimi', desc: 'Tek koşuda 500 düşman öldür.', unlocks: 'rotten' },
    { id: 'elite', name: 'Elit Avcı', desc: 'Bir elit düşmanı öldür.' },
    { id: 'boss', name: 'Kraliçe Avcısı', desc: 'Bir patronu öldür.' },
    { id: 'win', name: 'Patates Efsanesi', desc: '20. dalgayı geç.' },
    { id: 'win3', name: 'Korkusuz', desc: 'Tehlike 3\'te 20. dalgayı geç.' },
    { id: 'evolve', name: 'Evrim', desc: 'Bir silahı evrimleştir.' },
    { id: 'recipe', name: 'Usta Kumpirci', desc: 'Bir kumpir tarifini tamamla.' },
    { id: 'stand5', name: 'Ortaköy Esnafı', desc: 'Tek koşuda tezgahta 5 müşteriye servis yap.' },
    { id: 'rich', name: 'Kumbara', desc: 'Aynı anda 500 malzemeye sahip ol.' },
    { id: 'level20', name: 'Kıdemli Patates', desc: '20. seviyeye ulaş.' },
    { id: 'endless25', name: 'Sonsuzluk', desc: 'Sonsuz modda 25. dalgaya ulaş.' },
    { id: 'daily', name: 'Günün Patatesi', desc: 'Bir günlük meydan okumayı bitir.' },
    { id: 'coop5', name: 'İki Patates', desc: 'İki kişilik oyunda 5. dalgayı tamamla.' },
  ];

  /* ---------- Dalga ayarları ---------- */
  D.isBossWave = function (n) {
    return n === D.MAX_WAVE || (n > D.MAX_WAVE && n % 10 === 0);
  };

  D.isEliteWave = function (n) {
    if (n === 11 || n === 16) return true;
    return n > D.MAX_WAVE && n % 5 === 0 && n % 10 !== 0;
  };

  D.waveDuration = function (n) {
    if (D.isBossWave(n)) return 90;
    return Math.min(60, 15 + 5 * n);
  };

  D.spawnInterval = function (n) {
    return Math.max(n > D.MAX_WAVE ? 0.45 : 0.55, 1.4 - 0.05 * (n - 1));
  };

  D.groupSize = function (n) {
    const base = 1 + Math.floor((Math.min(n, 30) + 1) / 4);
    return U.randInt(base, base + 1);
  };

  D.spawnTable = function (n) {
    const t = [{ v: 'baby', w: n < 10 ? 10 : 8 }];
    if (n >= 3) t.push({ v: 'chaser', w: 2 + n * 0.15 });
    if (n >= 4) t.push({ v: 'spitter', w: 2 + n * 0.1 });
    if (n >= 5) t.push({ v: 'thief', w: 1.2 });
    if (n >= 6) t.push({ v: 'charger', w: 2 + n * 0.08 });
    if (n >= 7) t.push({ v: 'slime', w: 1.8 });
    if (n >= 8) t.push({ v: 'bruiser', w: 1.2 + (Math.min(n, 30) - 8) * 0.25 });
    if (n >= 9) t.push({ v: 'healer', w: 1 });
    if (n >= 10) t.push({ v: 'shielder', w: 1.6 });
    return t;
  };

  // İleriki dalgalarda düşman canı ayrıca katlanarak artar
  D.hpWaveMult = function (n) {
    const base = 1 + Math.max(0, n - 4) * 0.12;
    return n > D.MAX_WAVE ? base * Math.pow(1.06, n - D.MAX_WAVE) : base;
  };

  // Seviye L'ye ulaşmak için gereken deneyim (bir önceki seviyeden itibaren)
  D.xpForLevel = function (L) {
    return (L + 3) * (L + 3);
  };

  D.price = function (base, wave) {
    return Math.max(1, Math.round(base * (1 + 0.15 * (wave - 1))));
  };

  /* ---------- Arama tabloları ---------- */
  const index = (arr, key) => {
    const o = {};
    arr.forEach((x) => {
      o[x[key || 'id']] = x;
    });
    return o;
  };
  D.WEAPON_BY_ID = index(D.WEAPONS);
  D.ITEM_BY_ID = index(D.ITEMS);
  D.CHAR_BY_ID = index(D.CHARACTERS);
  D.UPGRADE_BY_STAT = index(D.UPGRADES, 'stat');
  D.TOPPING_BY_ID = index(D.TOPPINGS);
  D.RECIPE_BY_ID = index(D.RECIPES);
  D.SEED_BY_ID = index(D.SEEDS);
  D.EVO_BY_ID = index(D.EVOLUTIONS);
  D.ACH_BY_ID = index(D.ACHIEVEMENTS);

  BR.DATA = D;
})((window.BR = window.BR || {}));
