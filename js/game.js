/* Kumpir Arena - oyun motoru: koşu durumu, kayıt, dalga simülasyonu, oyuncular, silahlar, düşmanlar */
(function (BR) {
  'use strict';

  const U = BR.U;
  const D = BR.DATA;
  const AW = D.ARENA_W;
  const AH = D.ARENA_H;
  const PLAYER_SPEED = 330;
  const PLAYER_R = 22;
  const WEAPON_RING = 44;
  const SAVE_KEY = 'kumpirArena.save.v1';
  const MAX_PARTICLES = 500;
  const MAX_TEXTS = 90;
  const MAX_PICKUPS = 260;
  const TARGET_MODES = ['near', 'strong', 'weak'];
  const PHASES = ['start', 'between', 'shop', 'map', 'event', 'rest'];

  const listeners = {};

  const G = {
    state: 'menu', // menu | wave | between | shop | map | event | rest | dead | victory
    paused: false,
    run: null,
    w: null,
    stats: null,
    fx: {},
    lastConfig: null,
    lastSave: null,
    time: 0,
    hitstop: 0,
    lastCritStop: -1,
    TARGET_MODES,
  };

  G.on = function (ev, fn) {
    (listeners[ev] = listeners[ev] || []).push(fn);
  };
  G.emit = function (ev, arg) {
    (listeners[ev] || []).forEach((fn) => fn(arg));
  };

  function sfx(name) {
    if (BR.Audio) BR.Audio.play(name);
  }
  function settings() {
    return BR.settings || { shake: true, dmgNumbers: true, hitstop: true };
  }
  function achieve(id) {
    if (BR.Meta) BR.Meta.unlock(id);
  }
  G.achieve = achieve;

  /* ================= Tohumlu rastgelelik ================= */
  // Koşunun yapısı (dükkan, harita, olaylar, patron) bu kaynaktan gelir; durumu kayıtta saklanır.
  G.srand = function () {
    const run = G.run;
    if (!run) return Math.random();
    const r = U.rngStep(run.rng | 0);
    run.rng = r.state;
    return r.value;
  };
  G.S = U.withRng(() => G.srand());
  // Alt sisteme özgü akış: aynı tohum + aynı etiket her zaman aynı sırayı verir.
  // Böylece seviye sayısı ya da yenileme farkı başka sistemlerin (dükkan, arena, olay) sırasını kaydırmaz.
  G.reseed = function (tag) {
    const run = G.run;
    if (!run) return;
    const parts = Array.prototype.slice.call(arguments, 1);
    run.rng = U.hashStr(run.seed + '|' + tag + '|' + parts.join(','));
  };

  /* ================= Hesaplamalar ================= */
  const Calc = {
    maxHp: (s) => Math.max(1, Math.round(s.maxHp)),
    speedMult: (s) => Math.max(0.3, 1 + s.speed / 100),
    dodge: (s) => U.clamp(s.dodge, 0, 60) / 100,
    armorMult: (s) => (s.armor >= 0 ? 15 / (15 + s.armor) : (15 - s.armor) / 15),
    atkMult: (s) => (s.attackSpeed >= 0 ? 1 + s.attackSpeed / 100 : 1 / (1 - s.attackSpeed / 100)),
    dmgMult: (s) => Math.max(0.05, 1 + s.damage / 100),
    luckMult: (s) => Math.max(0, 1 + s.luck / 100),
    pickupR: (s) => 120 * Math.max(0.5, 1 + (s.pickupRange || 0) / 100),
    critChance: (s, def, p) => U.clamp((def.crit || 0) + s.critChance / 100 + (p && p.focusT > 0 ? 0.2 : 0), 0, 1),
    classMult(def, s) {
      const cd = s.classDmg;
      if (!cd) return 1;
      for (const k in cd) if (k !== 'other' && def.cls.includes(k)) return 1 + cd[k];
      return 1 + (cd.other || 0);
    },
    weaponDamage(def, tier, s) {
      let base = def.dmg[tier - 1];
      for (const k in def.scale) base += def.scale[k] * (s[k] || 0);
      return Math.max(1, base * Calc.dmgMult(s) * Calc.classMult(def, s));
    },
    burnDamage(def, tier, s) {
      if (!def.burn) return 0;
      const base = def.burn[tier - 1] + (def.burnScale || 0) * s.elementalDamage;
      return Math.max(1, base * Calc.dmgMult(s));
    },
    weaponCd(def, tier, s, p) {
      let m = Calc.atkMult(s);
      if (p && p.focusT > 0) m *= 1.8;
      return Math.max(0.05, def.cd[tier - 1] / m);
    },
    weaponRange(def, s) {
      if (def.type === 'melee') return Math.max(50, def.range + s.range / 2);
      return Math.max(80, def.range + s.range);
    },
    // Taretler yalnızca mühendislikle güçlenir (yüzde hasar etkilemez)
    turretDamage: (tier, s) => Math.max(1, D.TURRET.dmg[tier - 1] + s.engineering * D.TURRET.scale),
    regenInterval: (s) => (s.hpRegen >= 1 ? 5 / (1 + (s.hpRegen - 1) / 2.25) : Infinity),
    contactDamage: (s, run) => Math.max(1, (6 + s.meleeDamage * 1.2 + run.level * 1.5 + s.maxHp * 0.2) * Calc.dmgMult(s)),
    auraDamage: (s, run) => Math.max(1, (2 + s.elementalDamage * 0.6 + run.level * 0.4) * Calc.dmgMult(s)),
  };
  G.Calc = Calc;

  /* ================= Koşu (run) ================= */
  function createRun(o) {
    const ch = D.CHAR_BY_ID[o.charId];
    const seed = typeof o.seed === 'number' ? o.seed | 0 : (Math.random() * 4294967296) | 0;
    const run = {
      v: 2,
      charId: o.charId,
      startWeapon: ch.noWeapons ? null : o.weaponId,
      danger: o.danger,
      coop: !!o.coop,
      easy: !!o.easy,
      daily: o.daily || null,
      seed,
      rng: seed,
      wave: 0, // son tamamlanan katman (dükkanda: tamamlanan dalga)
      phase: 'start',
      weapons: ch.noWeapons || !o.weaponId ? [] : [{ id: o.weaponId, tier: 1, target: 'near' }],
      items: {},
      upgrades: {},
      bonus: {},
      level: 0,
      xp: 0,
      pendingLevels: 0,
      materials: 0,
      bag: 0,
      crates: [],
      kills: 0,
      matsTotal: 0,
      shop: null,
      shopFor: -1,
      rerolls: 0,
      upOffer: null,
      upRerolls: 0,
      crateOffer: null,
      boss: 'boss',
      map: null,
      pos: null,
      node: null,
      event: null,
      seenEvents: [],
      waveBonus: null,
      discount: 0,
      pantry: {},
      filling: [],
      seeds: [],
      stand: null,
      standFor: -1,
      standServed: 0,
      endless: false,
      evolved: 0,
      eliteKills: 0,
      bossKills: 0,
    };
    (ch.startItems || []).forEach((id) => addItem(run, id));
    return run;
  }

  function setCounts(weapons) {
    const ids = {};
    weapons.forEach((w) => {
      ids[w.id] = true;
    });
    const counts = {};
    Object.keys(ids).forEach((id) => {
      D.WEAPON_BY_ID[id].cls.forEach((c) => {
        counts[c] = (counts[c] || 0) + 1;
      });
    });
    return counts;
  }
  G.setCounts = setCounts;

  // Dolgudaki malzemelerle tamamlanan tarifler
  function activeRecipes(run) {
    const have = {};
    (run.filling || []).forEach((id) => {
      have[id] = true;
    });
    return D.RECIPES.filter((r) => r.needs.every((id) => have[id])).map((r) => r.id);
  }
  G.activeRecipes = activeRecipes;

  function computeStats(run) {
    const ch = D.CHAR_BY_ID[run.charId];
    const s = { pickupRange: 0 };
    D.STATS.forEach((st) => {
      s[st.key] = 0;
    });
    s.maxHp = 10;
    const add = (obj, m) => {
      if (!obj) return;
      for (const k in obj) s[k] = (s[k] || 0) + obj[k] * m;
    };
    add(ch.stats, 1);
    add(run.upgrades, 1);
    add(run.bonus, 1);
    for (const id in run.items) add(D.ITEM_BY_ID[id].stats, run.items[id]);
    (run.filling || []).forEach((id) => add(D.TOPPING_BY_ID[id].stats, 1));
    activeRecipes(run).forEach((id) => add(D.RECIPE_BY_ID[id].stats, 1));
    s.maxHp += run.level;
    const sc = setCounts(run.weapons);
    for (const c in sc) {
      const cls = D.CLASSES[c];
      const v = cls.per[Math.min(6, sc[c])];
      if (v) s[cls.stat] += v;
    }
    s.classDmg = ch.classDmg || null;
    return s;
  }
  G.computeStats = computeStats;

  function computeFx(run) {
    const fx = {};
    for (const id in run.items) {
      const it = D.ITEM_BY_ID[id];
      if (it.fx) fx[it.fx] = (fx[it.fx] || 0) + run.items[id];
    }
    activeRecipes(run).forEach((id) => {
      const r = D.RECIPE_BY_ID[id];
      if (r.fx) fx[r.fx] = (fx[r.fx] || 0) + 1;
    });
    return fx;
  }
  G.computeFx = computeFx;

  function refresh() {
    G.stats = computeStats(G.run);
    G.fx = computeFx(G.run);
  }
  G.refresh = refresh;

  function addItem(run, id) {
    run.items[id] = (run.items[id] || 0) + 1;
  }
  G.addItem = addItem;

  /* ================= Kayıt ================= */
  function saveRun() {
    if (!G.run) return;
    G.lastSave = JSON.parse(JSON.stringify(G.run));
    U.store.set(SAVE_KEY, G.lastSave);
  }
  G.saveRun = saveRun;

  function clearSave() {
    G.lastSave = null;
    U.store.remove(SAVE_KEY);
  }
  G.clearSave = clearSave;

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  function validRun(r) {
    try {
      if (!isObj(r) || (r.v !== 1 && r.v !== 2) || !D.CHAR_BY_ID[r.charId]) return false;
      if (!Array.isArray(r.weapons) || r.weapons.length > D.MAX_WEAPONS) return false;
      if (!r.weapons.every((w) => isObj(w) && D.WEAPON_BY_ID[w.id] && w.tier >= 1 && w.tier <= 4)) return false;
      if (!isNum(r.wave) || r.wave < 0) return false;
      if (r.wave >= D.MAX_WAVE && !r.endless) return false;
      if (!isObj(r.items) || !Object.keys(r.items).every((id) => D.ITEM_BY_ID[id] && isNum(r.items[id]) && r.items[id] > 0)) return false;
      if (!D.DANGERS[r.danger]) return false;
      if (!Array.isArray(r.crates) || !r.crates.every(isNum)) return false;
      const nums = ['level', 'xp', 'pendingLevels', 'materials', 'bag', 'kills', 'matsTotal', 'rerolls'];
      if (!nums.every((k) => isNum(r[k]))) return false;
      for (const obj of [r.upgrades, r.bonus]) {
        if (!isObj(obj)) return false;
        if (!Object.keys(obj).every((k) => D.STAT_BY_KEY[k] && isNum(obj[k]))) return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function validOffer(o) {
    if (o === null) return true;
    if (!isObj(o)) return false;
    if (o.kind === 'weapon') return !!D.WEAPON_BY_ID[o.id] && !D.WEAPON_BY_ID[o.id].evo && o.tier >= 1 && o.tier <= 4;
    if (o.kind === 'item') return !!D.ITEM_BY_ID[o.id];
    return false;
  }

  // Eski (v1) kayıtları yükseltir, eksik ya da bozuk alanları güvenli değerlere çeker
  function sanitizeRun(r) {
    r.v = 2;
    if (!isNum(r.seed)) r.seed = (Math.random() * 4294967296) | 0;
    if (!isNum(r.rng)) r.rng = r.seed;
    r.coop = !!r.coop;
    r.easy = !!r.easy;
    r.endless = !!r.endless;
    if (typeof r.daily !== 'string') r.daily = null;
    if (!D.BOSSES.includes(r.boss)) r.boss = 'boss';
    if (D.CHAR_BY_ID[r.charId].noWeapons) r.weapons = [];
    r.weapons.forEach((w) => {
      if (!TARGET_MODES.includes(w.target)) w.target = 'near';
    });
    if (!PHASES.includes(r.phase)) r.phase = r.wave === 0 ? 'start' : 'shop';
    if (r.wave === 0) r.phase = 'start';
    if (!Array.isArray(r.shop) || r.shop.length !== 4 || !r.shop.every(validOffer)) {
      r.shop = null;
      r.shopFor = -1;
    }
    if (r.upOffer && !(Array.isArray(r.upOffer) && r.upOffer.every((o) => isObj(o) && D.UPGRADE_BY_STAT[o.stat] && o.tier >= 1 && o.tier <= 4))) r.upOffer = null;
    if (r.crateOffer && !(isObj(r.crateOffer) && D.ITEM_BY_ID[r.crateOffer.id])) r.crateOffer = null;
    if (!isNum(r.upRerolls)) r.upRerolls = 0;
    if (!isNum(r.shopFor)) r.shopFor = -1;
    if (!isObj(r.pantry)) r.pantry = {};
    Object.keys(r.pantry).forEach((k) => {
      if (!D.TOPPING_BY_ID[k] || !isNum(r.pantry[k]) || r.pantry[k] <= 0) delete r.pantry[k];
    });
    if (!Array.isArray(r.filling)) r.filling = [];
    r.filling = r.filling.filter((id) => D.TOPPING_BY_ID[id]).slice(0, D.FILLING_SLOTS);
    if (!Array.isArray(r.seeds)) r.seeds = [];
    r.seeds = r.seeds.filter((sd) => isObj(sd) && isNum(sd.tier) && sd.tier >= 1 && sd.tier <= 4 && isNum(sd.grow)).slice(0, D.MAX_SEEDS);
    if (!Array.isArray(r.seenEvents)) r.seenEvents = [];
    r.seenEvents = r.seenEvents.filter((id) => D.EVENTS[id]);
    if (r.event && !(isObj(r.event) && D.EVENTS[r.event.id])) r.event = null;
    if (r.phase === 'event' && !r.event) r.phase = 'map';
    if (!isNum(r.discount) || r.discount < 0 || r.discount > 0.9) r.discount = 0;
    if (r.waveBonus && !isObj(r.waveBonus)) r.waveBonus = null;
    if (!isNum(r.standFor)) r.standFor = -1;
    if (!isNum(r.standServed)) r.standServed = 0;
    if (r.stand && !(isObj(r.stand) && Array.isArray(r.stand.queue) && Array.isArray(r.stand.plate))) r.stand = null;
    ['evolved', 'eliteKills', 'bossKills'].forEach((k) => {
      if (!isNum(r[k])) r[k] = 0;
    });
    if (!G.validMap || !G.validMap(r)) {
      const prev = G.run;
      G.run = r;
      G.genMap(r, 1, Math.max(D.MAX_WAVE, r.wave + 10));
      const layer = r.map.layers[r.wave] || r.map.layers[1];
      r.pos = layer[0].id;
      G.run = prev;
    }
    if (!isObj(r.node)) r.node = { type: 'normal', mod: null };
    return r;
  }

  G.loadSave = function () {
    let r = U.store.get(SAVE_KEY, null);
    if (!validRun(r) && G.lastSave) r = JSON.parse(JSON.stringify(G.lastSave));
    return validRun(r) ? sanitizeRun(r) : null;
  };

  G.importSave = function (r) {
    if (validRun(r)) {
      G.lastSave = JSON.parse(JSON.stringify(r));
      if (!validRun(U.store.get(SAVE_KEY, null))) U.store.set(SAVE_KEY, G.lastSave);
    }
  };

  G.snapshotSave = function () {
    return G.lastSave ? JSON.parse(JSON.stringify(G.lastSave)) : null;
  };

  /* ================= Koşuyu başlatma / sürdürme ================= */
  // o: { charId, weaponId, danger, coop, easy, daily, seed }
  G.newRun = function (o) {
    G.run = createRun(o);
    const run = G.run;
    run.boss = G.S.pick(D.BOSSES);
    G.genMap(run, 1, D.MAX_WAVE);
    run.pos = run.map.layers[1][0].id;
    run.node = { type: 'normal', mod: null };
    G.lastConfig = Object.assign({}, o);
    refresh();
    saveRun();
    G.startNextWave();
  };

  // Kaydı yükler; UI'nin hangi ekranı göstereceğini döndürür
  G.continueRun = function () {
    const r = G.loadSave();
    if (!r) return null;
    G.run = r;
    G.lastConfig = { charId: r.charId, weaponId: r.startWeapon, danger: r.danger, coop: r.coop, easy: r.easy, daily: r.daily, seed: r.daily ? r.seed : undefined };
    refresh();
    G.w = null;
    if (r.phase === 'start') {
      G.startNextWave();
      return 'wave';
    }
    G.state = r.phase === 'between' ? 'between' : r.phase;
    return r.phase;
  };

  function makePlayer(i, count) {
    const s = G.stats;
    return {
      id: i,
      x: AW / 2 + (count > 1 ? (i === 0 ? -55 : 55) : 0),
      y: AH / 2,
      r: PLAYER_R,
      hp: Calc.maxHp(s),
      invuln: 0.8,
      regenT: 0,
      lsT: 0,
      face: i === 1 ? -1 : 1,
      moving: false,
      walkT: 0,
      dead: false,
      deadT: 0,
      mvx: 0,
      mvy: 0,
      dashT: 0,
      dashCd: 0,
      dashDx: 1,
      dashDy: 0,
      abilCd: 2,
      focusT: 0,
      goldT: 0,
      invisT: 0,
      speedT: 0,
      shield: (G.fx.shield || 0) > 0,
      shieldT: 0,
      auraT: 0.5,
      weapons: [],
    };
  }

  G.startNextWave = function () {
    const run = G.run;
    run.wave += 1;
    run.phase = 'wave';
    run.upOffer = null;
    run.crateOffer = null;
    run.discount = 0;
    run.event = null;
    if (D.CHAR_BY_ID[run.charId].aura && run.wave > 1) run.bonus.maxHp = (run.bonus.maxHp || 0) - 1;
    refresh();
    const node = run.node || { type: 'normal', mod: null };
    const bonus = run.waveBonus || null;
    run.waveBonus = null;
    const w = {
      n: run.wave,
      t: 0,
      duration: D.waveDuration(run.wave),
      node,
      modId: node.mod || null,
      mod: node.mod && D.MODIFIERS[node.mod] ? D.MODIFIERS[node.mod] : {},
      bonus: bonus || {},
      players: [],
      enemies: [],
      bullets: [],
      ebullets: [],
      pickups: [],
      turrets: [],
      particles: [],
      texts: [],
      markers: [],
      explosions: [],
      rings: [],
      zaps: [],
      clouds: [],
      spawnQueue: [],
      bosses: [],
      spawnT: 0.6,
      treeT: U.rand(4, 8),
      nextId: 1,
      ended: false,
      endT: 0,
      allDead: false,
      deadT: 0,
      shake: 0,
      hurtFlash: 0,
      specialDone: false,
      blastCount: 0,
      bossType: null,
      elite: false,
      eliteAffixes: [],
    };
    G.w = w;
    G.reseed('wave', w.n);
    BR.Arena.setup(w, D.arenaFor(w.n), G.S);
    const count = run.coop ? 2 : 1;
    for (let i = 0; i < count; i++) w.players.push(makePlayer(i, count));
    w.player = w.players[0];
    if (D.isBossWave(w.n)) w.bossType = w.n === D.MAX_WAVE ? run.boss : G.S.pick(D.BOSSES);
    if (node.type === 'elite' || D.isEliteWave(w.n)) {
      w.elite = true;
      const nAff = run.danger >= 2 || w.n >= 16 ? 2 : 1;
      w.eliteAffixes = G.S.shuffle(Object.keys(D.AFFIXES)).slice(0, nAff);
    }
    buildWeapons();
    buildTurrets();
    G.state = 'wave';
    G.paused = false;
    if (w.n >= 10 && run.startWeapon === 'knife') achieve('knife10');
    if (run.endless && w.n >= 25) achieve('endless25');
    G.emit('waveStart', w);
    sfx('wave');
  };

  function slotAngle(i, n) {
    return n === 1 ? 0 : (U.TAU * i) / n - Math.PI / 2 + Math.PI / n;
  }

  function buildWeapons() {
    const w = G.w;
    const list = G.run.weapons;
    for (const p of w.players) {
      p.weapons = list.map((wp, i) => {
        const a = slotAngle(i, list.length);
        return {
          idx: i, def: D.WEAPON_BY_ID[wp.id], tier: wp.tier, target: wp.target || 'near',
          cd: U.rand(0.05, 0.4), slotA: a,
          x: p.x + Math.cos(a) * WEAPON_RING, y: p.y + Math.sin(a) * WEAPON_RING,
          ang: a, thrust: null, recoil: 0,
        };
      });
    }
  }

  // Duraklatma menüsünden hedef modu değişince çalışan silahlara da uygula
  G.syncWeaponTargets = function () {
    if (!G.w) return;
    for (const p of G.w.players) {
      for (const wp of p.weapons) {
        const src = G.run.weapons[wp.idx];
        if (src) wp.target = src.target || 'near';
      }
    }
  };

  function freeSpot(cx, cy, minD, maxD) {
    const w = G.w;
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * U.TAU;
      const d = U.rand(minD, maxD);
      const x = U.clamp(cx + Math.cos(a) * d, 40, AW - 40);
      const y = U.clamp(cy + Math.sin(a) * d, 40, AH - 40);
      if (!BR.Arena.blocked(w, x, y, 26)) return { x, y };
    }
    return { x: cx, y: cy };
  }

  function buildTurrets() {
    const w = G.w;
    const run = G.run;
    const tiers = [];
    run.weapons.forEach((wp) => {
      if (D.WEAPON_BY_ID[wp.id].turret) tiers.push(wp.tier);
    });
    for (const id in run.items) {
      const it = D.ITEM_BY_ID[id];
      if (it.turret) for (let i = 0; i < run.items[id]; i++) tiers.push(it.turret);
    }
    const p = w.players[0];
    tiers.forEach((tier) => {
      const pt = freeSpot(p.x, p.y, 90, 170);
      w.turrets.push({ x: pt.x, y: pt.y, tier, cd: U.rand(0.3, 1), ang: 0, recoil: 0, temp: 0, dead: false });
    });
  }

  /* ================= Ana güncelleme ================= */
  G.update = function (dt) {
    const w = G.w;
    if (!w || G.state !== 'wave' || G.paused) return;
    G.time += dt;
    if (w.ended) {
      updateEffects(dt);
      compact();
      w.endT -= dt;
      if (w.endT <= 0) finishWave();
      return;
    }
    if (w.allDead) {
      for (const p of w.players) p.deadT += dt;
      updateEffects(dt);
      compact();
      w.deadT -= dt;
      if (w.deadT <= 0) gameOver();
      return;
    }
    w.t += dt;
    for (const p of w.players) updatePlayer(p, dt);
    updateSpawns(dt);
    for (const p of w.players) if (!p.dead) updateWeapons(p, dt);
    updateTurrets(dt);
    updateBullets(dt);
    updateEnemies(dt);
    updateEnemyBullets(dt);
    BR.Arena.update(w, dt);
    updateClouds(dt);
    updatePickups(dt);
    updateEffects(dt);
    flushSpawns();
    compact();
    if (w.allDead) return;
    if (w.bossType && w.specialDone) {
      const bosses = w.bosses.filter((b) => b.def.isBoss);
      if (bosses.length && bosses.every((b) => b.dead)) {
        endWave();
        return;
      }
    }
    if (w.t >= w.duration) endWave();
  };

  G.togglePause = function (force) {
    if (G.state !== 'wave') return G.paused;
    G.paused = typeof force === 'boolean' ? force : !G.paused;
    if (BR.Input) BR.Input.reset();
    return G.paused;
  };

  G.addHitstop = function (t, isCrit) {
    if (settings().hitstop === false) return;
    if (isCrit) {
      if (G.time - G.lastCritStop < 0.3) return;
      G.lastCritStop = G.time;
    }
    G.hitstop = Math.max(G.hitstop, t);
  };

  /* ---------- Oyuncular ---------- */
  function alivePlayers() {
    return G.w.players.filter((p) => !p.dead);
  }

  // Görünür (görünmez olmayan) en yakın canlı oyuncu
  function nearestPlayer(x, y, visibleOnly) {
    let best = null;
    let bd = Infinity;
    for (const p of G.w.players) {
      if (p.dead || (visibleOnly && p.invisT > 0)) continue;
      const d = U.dist2(x, y, p.x, p.y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  function ownerMult(p) {
    if (!p) return 1;
    let m = 1;
    if (G.fx.rage && p.hp < Calc.maxHp(G.stats) * 0.3) m *= 1.5;
    if (p.goldT > 0) m *= 2;
    return m;
  }

  function updatePlayer(p, dt) {
    const w = G.w;
    if (p.dead) {
      p.deadT += dt;
      return;
    }
    const s = G.stats;
    const In = BR.Input;
    const mv = In ? In.getMove(p.id) : { x: 0, y: 0 };
    if (In && In.consume(p.id, 'dash')) tryDash(p, mv);
    if (In && In.consume(p.id, 'ability')) G.useAbility(p);
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.abilCd > 0) p.abilCd -= dt;
    if (p.focusT > 0) p.focusT -= dt;
    if (p.goldT > 0) p.goldT -= dt;
    if (p.invisT > 0) p.invisT -= dt;
    if (p.speedT > 0) p.speedT -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.lsT > 0) p.lsT -= dt;
    if ((G.fx.shield || 0) > 0 && !p.shield) {
      p.shieldT -= dt;
      if (p.shieldT <= 0) p.shield = true;
    }
    let vx;
    let vy;
    if (p.dashT > 0) {
      p.dashT -= dt;
      const sp = PLAYER_SPEED * Calc.speedMult(s) * D.DASH.mult;
      vx = p.dashDx * sp;
      vy = p.dashDy * sp;
      if (w.particles.length < MAX_PARTICLES) {
        w.particles.push({ x: p.x, y: p.y + 8, vx: 0, vy: 0, life: 0.25, max: 0.25, color: 'rgba(246,233,210,0.6)', size: 10 });
      }
    } else {
      const sp = PLAYER_SPEED * Calc.speedMult(s) * (p.speedT > 0 ? 1.3 : 1) * BR.Arena.speedMult(w, p.x, p.y, true);
      vx = mv.x * sp;
      vy = mv.y * sp;
    }
    p.x = U.clamp(p.x + vx * dt, p.r, AW - p.r);
    p.y = U.clamp(p.y + vy * dt, p.r, AH - p.r);
    BR.Arena.collide(w, p);
    p.moving = Math.abs(vx) > 5 || Math.abs(vy) > 5;
    if (vx > 5) p.face = 1;
    else if (vx < -5) p.face = -1;
    if (p.moving) p.walkT += dt;
    p.mvx = mv.x;
    p.mvy = mv.y;
    const maxHp = Calc.maxHp(s);
    if (p.hp > maxHp) p.hp = maxHp;
    const iv = Calc.regenInterval(s);
    if (p.hp < maxHp && isFinite(iv)) {
      p.regenT += dt;
      if (p.regenT >= iv) {
        p.regenT -= iv;
        heal(p, 1, true);
      }
    } else {
      p.regenT = 0;
    }
    // Çürük: zehir aurası
    if (D.CHAR_BY_ID[G.run.charId].aura) {
      p.auraT -= dt;
      if (p.auraT <= 0) {
        p.auraT += 0.5;
        const dmg = Calc.auraDamage(s, G.run) * ownerMult(p);
        for (const e of w.enemies) {
          if (e.dead) continue;
          const rr = 110 + e.r;
          if (U.dist2(e.x, e.y, p.x, p.y) < rr * rr) damageEnemy(e, dmg, { poison: true, noLS: true, owner: p });
        }
      }
    }
  }

  function tryDash(p, mv) {
    if (p.dashCd > 0 || p.dashT > 0) return false;
    let dx = mv.x;
    let dy = mv.y;
    const l = Math.hypot(dx, dy);
    if (l < 0.1) {
      dx = p.face;
      dy = 0;
    } else {
      dx /= l;
      dy /= l;
    }
    p.dashDx = dx;
    p.dashDy = dy;
    p.dashT = D.DASH.time;
    p.dashCd = D.DASH.cd;
    p.invuln = Math.max(p.invuln, D.DASH.time + 0.1);
    sfx('dash');
    return true;
  }
  G.tryDash = tryDash;

  function heal(p, amount, quiet) {
    const maxHp = Calc.maxHp(G.stats);
    if (!p || p.dead || p.hp >= maxHp) return;
    const before = p.hp;
    p.hp = Math.min(maxHp, p.hp + amount);
    const got = p.hp - before;
    if (got > 0) {
      floatText(p.x, p.y - 34, '+' + Math.round(got), '#7fe07a', 18);
      if (!quiet) sfx('heal');
    }
  }

  function hurtPlayer(p, raw) {
    const w = G.w;
    const s = G.stats;
    if (!p || p.invuln > 0 || p.dead || w.ended || p.goldT > 0) return false;
    if (p.shield) {
      p.shield = false;
      p.shieldT = 10 / Math.max(1, G.fx.shield || 1);
      p.invuln = 0.3;
      floatText(p.x, p.y - 34, 'KALKAN', '#8fe3ff', 18);
      sfx('dodge');
      return true;
    }
    if (Math.random() < Calc.dodge(s)) {
      p.invuln = 0.2;
      floatText(p.x, p.y - 34, 'KAÇIŞ', '#9fd7ff', 18);
      if (G.fx.dodgeInvis) {
        p.invisT = 1;
        p.speedT = 1;
        p.invuln = Math.max(p.invuln, 1);
      }
      sfx('dodge');
      return true;
    }
    const dmg = Math.max(1, Math.round(raw * Calc.armorMult(s) * (G.run.easy ? 0.5 : 1)));
    p.hp -= dmg;
    p.invuln = 0.5;
    w.shake = Math.max(w.shake, 9);
    w.hurtFlash = 0.25;
    floatText(p.x, p.y - 34, '-' + dmg, '#ff5d5d', 22);
    sfx('hurt');
    G.addHitstop(0.05);
    if (G.fx.thorns) aoe(p.x, p.y, 150, (8 + 3 * Math.max(0, s.armor)) * G.fx.thorns, 8, p, '#c9a26b', true);
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      p.deadT = 0;
      puff(p.x, p.y, '#e8c87a', 30, 220);
      if (!alivePlayers().length) {
        w.allDead = true;
        w.deadT = 1.6;
        sfx('lose');
      } else {
        floatText(p.x, p.y - 40, 'PÜRE OLDU!', '#ffcd4d', 22);
      }
    }
    return true;
  }

  /* ---------- Aktif yetenekler ---------- */
  function addRing(x, y, r, color) {
    G.w.rings.push({ x, y, r, color, life: 0.45, max: 0.45 });
  }

  // Alan hasarı: yarıçap içindeki tüm düşmanlar
  function aoe(x, y, radius, dmg, kb, owner, color, noLS) {
    const w = G.w;
    let hits = 0;
    for (const e of w.enemies) {
      if (e.dead) continue;
      const rr = radius + e.r;
      const d2 = U.dist2(x, y, e.x, e.y);
      if (d2 > rr * rr) continue;
      const d = Math.sqrt(d2) || 1;
      damageEnemy(e, dmg, { kb, kx: (e.x - x) / d, ky: (e.y - y) / d, owner, noLS: !!noLS });
      hits++;
    }
    if (color) addRing(x, y, radius, color);
    return hits;
  }

  G.useAbility = function (p) {
    const w = G.w;
    const run = G.run;
    if (!w || !p || p.dead || p.abilCd > 0 || w.ended) return false;
    const id = D.CHAR_BY_ID[run.charId].ability;
    const s = G.stats;
    const dm = Calc.dmgMult(s) * ownerMult(p);
    const lvl = run.level;
    if (id === 'spudrain') {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * U.TAU;
        w.bullets.push(makeBullet(p.x, p.y, a, 700, 7, (8 + 2 * lvl) * dm, 1, 420, 'spud', p));
      }
    } else if (id === 'quake') {
      aoe(p.x, p.y, 170, (15 + s.meleeDamage * 3 + lvl * 2) * dm, 40, p, '#e8c27a');
      w.shake = Math.max(w.shake, 10);
    } else if (id === 'focus') {
      p.focusT = 4;
      floatText(p.x, p.y - 46, 'ODAK!', '#ffd23f', 22);
    } else if (id === 'firering') {
      for (const e of w.enemies) {
        if (e.dead) continue;
        const rr = 230 + e.r;
        if (U.dist2(e.x, e.y, p.x, p.y) > rr * rr) continue;
        applyBurn(e, (4 + s.elementalDamage * 2) * dm);
        damageEnemy(e, 10 * dm, { owner: p });
      }
      addRing(p.x, p.y, 230, '#ff8a3c');
    } else if (id === 'deploy') {
      const temps = w.turrets.filter((t) => t.temp > 0 && !t.dead);
      if (temps.length >= 2) temps[0].dead = true;
      w.turrets.push({ x: p.x, y: p.y, tier: 3, cd: 0, ang: 0, recoil: 0, temp: 12, dead: false });
    } else if (id === 'dice') {
      const r = Math.random();
      if (r < 0.34) {
        const m = 5 + w.n * 2;
        run.materials += m;
        run.matsTotal += m;
        floatText(p.x, p.y - 46, '+' + m + ' MALZEME', '#8fd14f', 22);
      } else if (r < 0.67) {
        heal(p, Math.ceil(Calc.maxHp(s) * 0.5), false);
      } else {
        p.goldT = 4;
        floatText(p.x, p.y - 46, 'ALTIN!', '#ffcd4d', 22);
      }
    } else if (id === 'steam') {
      aoe(p.x, p.y, 200, (10 + s.maxHp * 0.5) * dm, 60, p, '#e8f4ff');
    } else if (id === 'cloud') {
      w.clouds.push({ x: p.x, y: p.y, r: 160, t: 5, max: 5, tick: 0, dmg: (3 + s.elementalDamage + lvl * 0.5) * dm, owner: p });
    } else if (id === 'cleave') {
      const mult = Calc.classMult({ cls: ['blade'] }, s);
      const hits = aoe(p.x, p.y, 140, (20 + s.meleeDamage * 2 + lvl * 2) * dm * mult, 20, p, '#ff5d5d');
      if (hits) heal(p, Math.min(5, hits), false);
    }
    p.abilCd = D.ABILITIES[id].cd;
    sfx('ability');
    G.emit('ability', { player: p.id, id });
    return true;
  };

  /* ---------- Doğma (spawn) ---------- */
  function aliveCount() {
    const w = G.w;
    let n = w.spawnQueue.length;
    for (const e of w.enemies) if (!e.dead) n++;
    for (const m of w.markers) if (!m.done) n++;
    return n;
  }

  function randomPoint(minDist) {
    const w = G.w;
    const ps = alivePlayers();
    for (let i = 0; i < 40; i++) {
      const x = U.rand(70, AW - 70);
      const y = U.rand(70, AH - 70);
      if (BR.Arena.blocked(w, x, y, 40)) continue;
      if (ps.every((p) => U.dist2(x, y, p.x, p.y) >= minDist * minDist)) return { x, y };
    }
    const p = ps[0] || w.players[0];
    return { x: p.x < AW / 2 ? AW - 120 : 120, y: p.y < AH / 2 ? AH - 120 : 120 };
  }

  function addMarker(type, x, y, t) {
    G.w.markers.push({ type, x, y, t, max: t, done: false });
  }

  function queueSpawn(type, x, y, opts) {
    G.w.spawnQueue.push({ type, x: U.clamp(x, 30, AW - 30), y: U.clamp(y, 30, AH - 30), opts: opts || null });
  }

  function flushSpawns() {
    const w = G.w;
    if (!w.spawnQueue.length) return;
    const q = w.spawnQueue;
    w.spawnQueue = [];
    for (const s of q) spawnEnemy(s.type, s.x, s.y, s.opts);
  }

  function spawnGroup() {
    const n = G.w.n;
    const type = U.weighted(D.spawnTable(n));
    let size = D.groupSize(n);
    if (type === 'chaser') size += n < 7 ? 1 : 2;
    if (type === 'bruiser' || type === 'charger' || type === 'shielder') size = Math.max(1, Math.ceil(size / 2));
    if (type === 'thief' || type === 'healer') size = Math.min(size, type === 'healer' ? 1 : 2);
    const c = randomPoint(n < 5 ? 300 : 240);
    for (let i = 0; i < size; i++) {
      const a = Math.random() * U.TAU;
      const d = Math.random() * 75;
      addMarker(type, U.clamp(c.x + Math.cos(a) * d, 40, AW - 40), U.clamp(c.y + Math.sin(a) * d, 40, AH - 40), U.rand(0.9, 1.05));
    }
  }

  function updateSpawns(dt) {
    const w = G.w;
    const n = w.n;
    const run = G.run;
    const dz = D.DANGERS[run.danger];
    for (const m of w.markers) {
      if (m.done) continue;
      m.t -= dt;
      if (m.t <= 0) {
        m.done = true;
        spawnEnemy(m.type, m.x, m.y);
      }
    }
    w.spawnT -= dt;
    if (w.spawnT <= 0) {
      const rate = dz.rate * (w.mod.rate || 1) * (w.bonus.rate || 1) * (run.coop ? 1.25 : 1);
      const slow = w.bossType ? 1.5 : 1;
      w.spawnT += (D.spawnInterval(n) * slow) / rate;
      if (w.t < w.duration - 2 && aliveCount() < D.MAX_ALIVE) spawnGroup();
    }
    w.treeT -= dt;
    if (w.treeT <= 0) {
      const tm = w.mod.trees || 1;
      w.treeT = U.rand(8, 12) / tm;
      let trees = 0;
      for (const e of w.enemies) if (!e.dead && e.type === 'tree') trees++;
      for (const m of w.markers) if (!m.done && m.type === 'tree') trees++;
      if (trees < 3 * tm && w.t < w.duration - 3 && Math.random() < Math.min(0.95, 0.45 * tm * Calc.luckMult(G.stats))) {
        const pt = randomPoint(250);
        addMarker('tree', pt.x, pt.y, 1);
      }
    }
    if (!w.specialDone && w.t >= 2) {
      w.specialDone = true;
      if (w.elite) {
        const pt = randomPoint(450);
        addMarker('elite', pt.x, pt.y, 1.6);
        G.emit('banner', 'ELİT DÜŞMAN GELİYOR!');
        sfx('warn');
      }
      if (w.bossType) {
        const pt = randomPoint(500);
        addMarker(w.bossType, pt.x, pt.y, 1.8);
        G.emit('banner', D.ENEMIES[w.bossType].name.toLocaleUpperCase('tr-TR') + ' GELİYOR!');
        sfx('warn');
      }
    }
  }

  function spawnEnemy(type, x, y, opts) {
    const w = G.w;
    const run = G.run;
    const def = D.ENEMIES[type];
    const n = w.n;
    const dz = D.DANGERS[run.danger];
    const mod = w.mod;
    let hp = (def.hp + def.hpW * (n - 1)) * dz.hp * (def.big ? 1 : D.hpWaveMult(n)) * (mod.hp || 1) * (run.coop ? 1.5 : 1);
    let dmg = def.dmg > 0 ? (def.dmg + def.dmgW * (n - 1)) * dz.dmg * (mod.dmg || 1) : 0;
    if (def.isBoss && n > D.MAX_WAVE) {
      hp *= 1 + (n - D.MAX_WAVE) * 0.15;
      dmg *= 1 + (n - D.MAX_WAVE) * 0.05;
    }
    dmg = dmg > 0 ? Math.max(1, Math.round(dmg)) : 0;
    const e = {
      id: w.nextId++, type, def, x, y, r: def.r * (def.big ? 1 : mod.size || 1), hp, maxHp: hp, dmg,
      speed: U.rand(def.speed[0], def.speed[1]) * dz.spd * (mod.spd || 1), kx: 0, ky: 0, flash: 0, burn: null,
      state: 'move', st: 0, cd: U.rand(1.2, 2.8), wob: Math.random() * U.TAU, born: 0,
      dead: false, face: 1, atk: 0, dirx: 1, diry: 0, spin: 0, emit: 0, summon: 6, pending: null, phase: 0,
      affixes: [], slowT: 0, touchCd: 0, stolen: 0, goal: null, goalT: 0, healT: U.rand(1.5, 3), shieldAng: 0,
      hatch: 4, layT: 3, beams: null, beamOn: false, spinDir: 1, shots: 0, summonT: 6, escaped: false,
    };
    if (type === 'elite') {
      e.affixes = w.eliteAffixes.slice();
      if (e.affixes.includes('fast')) e.speed *= 1.4;
    }
    if (opts && opts.hp) e.hp = e.maxHp = opts.hp;
    w.enemies.push(e);
    if (def.big) w.bosses.push(e);
    return e;
  }

  /* ---------- Silahlar ---------- */
  // mode: near (en yakın), strong (en yüksek maks. can), weak (en az kalan can)
  // preferUnburnt: yakan silahlar zaten yanan düşmana boşuna ateş etmesin
  function pickTarget(x, y, range, mode, preferUnburnt) {
    let best = null;
    let bs = Infinity;
    let alt = null;
    let as = Infinity;
    for (const e of G.w.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y) - e.r;
      if (d > range) continue;
      const passive = e.type === 'tree' || e.type === 'egg';
      let score;
      if (mode === 'strong') score = (passive ? 1e9 : 0) - e.maxHp + d * 0.001;
      else if (mode === 'weak') score = (e.type === 'tree' ? 1e9 : 0) + e.hp + d * 0.001;
      else score = d;
      if (preferUnburnt && e.burn) {
        if (score < as) {
          as = score;
          alt = e;
        }
      } else if (score < bs) {
        bs = score;
        best = e;
      }
    }
    return best || alt;
  }

  function updateWeapons(p, dt) {
    const s = G.stats;
    for (const wp of p.weapons) {
      const sx = p.x + Math.cos(wp.slotA) * WEAPON_RING;
      const sy = p.y + Math.sin(wp.slotA) * WEAPON_RING;
      wp.cd -= dt;
      if (wp.recoil > 0) wp.recoil = Math.max(0, wp.recoil - dt * 6);
      if (wp.thrust) {
        updateThrust(wp, sx, sy, dt, p);
        continue;
      }
      wp.x = sx;
      wp.y = sy;
      const range = Calc.weaponRange(wp.def, s);
      const tgt = pickTarget(sx, sy, range, wp.target, !!wp.def.burn);
      if (!tgt) continue;
      wp.ang = Math.atan2(tgt.y - sy, tgt.x - sx);
      if (wp.cd <= 0) {
        wp.cd = Calc.weaponCd(wp.def, wp.tier, s, p);
        if (wp.def.type === 'melee') startThrust(wp, tgt, sx, sy, range, p);
        else fireRanged(wp, wp.ang, range, p);
      }
    }
  }

  function startThrust(wp, tgt, sx, sy, range, p) {
    const d = Math.hypot(tgt.x - sx, tgt.y - sy);
    const reach = U.clamp(d + 6, 30, range);
    const cdEff = Calc.weaponCd(wp.def, wp.tier, G.stats, p);
    wp.thrust = { t: 0, dur: U.clamp(cdEff * 0.55, 0.14, 0.3), ang: wp.ang, reach, hit: [], px: sx, py: sy };
    sfx('swing');
  }

  function updateThrust(wp, sx, sy, dt, p) {
    const th = wp.thrust;
    th.t += dt;
    const ph = Math.min(1, th.t / th.dur);
    const ext = Math.sin(ph * Math.PI);
    const tx = sx + Math.cos(th.ang) * th.reach * ext;
    const ty = sy + Math.sin(th.ang) * th.reach * ext;
    const hr = wp.def.hitR || 14;
    for (const e of G.w.enemies) {
      if (e.dead || th.hit.includes(e.id)) continue;
      if (U.segCircle(th.px, th.py, tx, ty, e.x, e.y, e.r + hr)) {
        th.hit.push(e.id);
        meleeHit(wp, e, th.ang, p);
      }
    }
    th.px = tx;
    th.py = ty;
    wp.x = tx;
    wp.y = ty;
    if (ph >= 1) wp.thrust = null;
  }

  function meleeHit(wp, e, ang, p) {
    const s = G.stats;
    const def = wp.def;
    let dmg = Calc.weaponDamage(def, wp.tier, s) * ownerMult(p);
    const crit = Math.random() < Calc.critChance(s, def, p);
    if (crit) dmg *= def.critMult || 2;
    const ex = e.x;
    const ey = e.y;
    damageEnemy(e, dmg, { crit, kb: def.kb[wp.tier - 1], kx: Math.cos(ang), ky: Math.sin(ang), owner: p, weapon: true });
    if (def.lsHit && p.lsT <= 0) {
      p.lsT = 0.1;
      heal(p, 1, true);
    }
    if (def.shock) {
      for (const o of G.w.enemies) {
        if (o.dead || o === e) continue;
        const rr = def.shock + o.r;
        if (U.dist2(ex, ey, o.x, o.y) < rr * rr) damageEnemy(o, dmg * 0.6, { owner: p, noLS: true, noChain: true });
      }
      addRing(ex, ey, def.shock, '#e8c27a');
    }
  }

  function makeBullet(x, y, a, speed, r, dmg, pierce, range, kind, owner) {
    return {
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r, dmg, crit: false, pierce, hit: [],
      life: (range + 30) / speed, kb: 4, burn: 0, explode: 0, kind, tier: 1, noLS: true, owner: owner || null,
      homing: false, weapon: false, dead: false,
    };
  }

  function fireRanged(wp, ang, range, p) {
    const def = wp.def;
    const t = wp.tier;
    const s = G.stats;
    const base = Calc.weaponDamage(def, t, s) * ownerMult(p);
    const count = def.proj ? def.proj[t - 1] : 1;
    const spread = def.spread || 0;
    const speed = def.speed;
    for (let k = 0; k < count; k++) {
      let a = ang;
      if (count > 1) a += (k / (count - 1) - 0.5) * spread + U.rand(-0.04, 0.04);
      else if (spread) a += U.rand(-spread / 2, spread / 2);
      const crit = Math.random() < Calc.critChance(s, def, p);
      G.w.bullets.push({
        x: wp.x + Math.cos(a) * 14, y: wp.y + Math.sin(a) * 14,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        r: def.projR || 5, dmg: crit ? base * (def.critMult || 2) : base, crit,
        pierce: def.pierce ? def.pierce[t - 1] : 0, hit: [], life: ((range + 30) / speed) * (def.homing ? 1.6 : 1),
        kb: def.kb ? def.kb[t - 1] : 0, burn: def.burn ? Calc.burnDamage(def, t, s) : 0,
        explode: def.explode ? def.explode[t - 1] : 0, kind: def.id, tier: t, noLS: false, owner: p,
        homing: !!def.homing, weapon: true, dead: false,
      });
    }
    wp.recoil = 1;
    sfx('shoot');
  }

  function updateTurrets(dt) {
    const w = G.w;
    const s = G.stats;
    for (const t of w.turrets) {
      if (t.dead) continue;
      if (t.temp > 0) {
        t.temp -= dt;
        if (t.temp <= 0) {
          t.dead = true;
          puff(t.x, t.y, '#9a96a2', 10, 120);
          continue;
        }
      }
      t.cd -= dt;
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 6);
      const tgt = pickTarget(t.x, t.y, D.TURRET.range, 'near', false);
      if (!tgt) continue;
      t.ang = Math.atan2(tgt.y - t.y, tgt.x - t.x);
      if (t.cd > 0) continue;
      t.cd = D.TURRET.cd[t.tier - 1];
      t.recoil = 1;
      const crit = Math.random() < U.clamp(s.critChance / 100, 0, 1);
      const dmg = Calc.turretDamage(t.tier, s) * (crit ? 2 : 1);
      const b = makeBullet(t.x + Math.cos(t.ang) * 18, t.y + Math.sin(t.ang) * 18, t.ang, D.TURRET.speed, 5, dmg, 0, D.TURRET.range + 10, 'turret', null);
      b.crit = crit;
      b.kb = 3;
      w.bullets.push(b);
      sfx('shoot');
    }
  }

  function shieldBlocks(e, bx, by) {
    if (!e.def.shield) return false;
    const a = Math.atan2(by - e.y, bx - e.x);
    let diff = Math.abs(a - e.shieldAng);
    if (diff > Math.PI) diff = U.TAU - diff;
    return diff < 1.15;
  }

  function updateBullets(dt) {
    const w = G.w;
    for (const b of w.bullets) {
      if (b.dead) continue;
      if (b.homing) {
        const tgt = pickTarget(b.x, b.y, 350, 'near', false);
        if (tgt) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const cur = Math.atan2(b.vy, b.vx);
          const want = Math.atan2(tgt.y - b.y, tgt.x - b.x);
          let diff = want - cur;
          while (diff > Math.PI) diff -= U.TAU;
          while (diff < -Math.PI) diff += U.TAU;
          const na = cur + U.clamp(diff, -5 * dt, 5 * dt);
          b.vx = Math.cos(na) * sp;
          b.vy = Math.sin(na) * sp;
        }
      }
      const px = b.x;
      const py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      for (const e of w.enemies) {
        if (e.dead || b.hit.includes(e.id)) continue;
        const rr = e.r + b.r;
        if (Math.abs(e.x - b.x) > rr + 40 || Math.abs(e.y - b.y) > rr + 40) continue;
        if (!U.segCircle(px, py, b.x, b.y, e.x, e.y, rr)) continue;
        if (b.explode) {
          explode(b.x, b.y, b.explode, b.dmg, b.crit, b.noLS, b.owner);
          b.dead = true;
          break;
        }
        if (shieldBlocks(e, px, py)) {
          b.dead = true;
          floatText(e.x, e.y - e.r - 6, 'BLOK', '#cfd6de', 15);
          sfx('block');
          break;
        }
        const sp = Math.hypot(b.vx, b.vy) || 1;
        damageEnemy(e, b.dmg, { crit: b.crit, kb: b.kb, kx: b.vx / sp, ky: b.vy / sp, noLS: b.noLS, owner: b.owner, weapon: b.weapon });
        if (b.burn && !e.dead) applyBurn(e, b.burn);
        b.hit.push(e.id);
        if (b.pierce > 0) {
          b.pierce--;
          b.dmg *= 0.75;
        } else {
          b.dead = true;
          break;
        }
      }
      if (!b.dead && (b.life <= 0 || b.x < -50 || b.x > AW + 50 || b.y < -50 || b.y > AH + 50)) {
        if (b.explode) explode(b.x, b.y, b.explode, b.dmg, b.crit, b.noLS, b.owner);
        b.dead = true;
      }
    }
  }

  function explode(x, y, radius, dmg, crit, noLS, owner) {
    const w = G.w;
    for (const e of w.enemies) {
      if (e.dead) continue;
      const rr = radius + e.r;
      const d2 = U.dist2(x, y, e.x, e.y);
      if (d2 <= rr * rr) {
        const d = Math.sqrt(d2) || 1;
        damageEnemy(e, dmg, { crit, kb: 12, kx: (e.x - x) / d, ky: (e.y - y) / d, noLS, owner, noChain: true });
      }
    }
    w.explosions.push({ x, y, r: radius, life: 0.35, max: 0.35 });
    w.shake = Math.max(w.shake, 5);
    sfx('boom');
  }

  function applyBurn(e, dmg) {
    if (!e.burn || e.burn.dmg <= dmg) e.burn = { dmg, ticks: 5, t: 0.5 };
    else e.burn.ticks = 5;
  }

  function chainLightning(src, amt, owner) {
    const w = G.w;
    const jumps = 1 + (G.fx.chain || 0);
    const cands = [];
    for (const e of w.enemies) {
      if (e.dead || e === src) continue;
      const d2 = U.dist2(src.x, src.y, e.x, e.y);
      if (d2 < 160 * 160) cands.push({ e, d2 });
    }
    cands.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < Math.min(jumps, cands.length); i++) {
      const t = cands[i].e;
      w.zaps.push({ x1: src.x, y1: src.y, x2: t.x, y2: t.y, life: 0.18, max: 0.18 });
      damageEnemy(t, amt * 0.5, { owner, noLS: true, noChain: true });
    }
  }

  function damageEnemy(e, raw, o) {
    if (e.dead) return;
    const s = G.stats;
    let amt = raw;
    if (e.affixes.length && e.affixes.includes('armored') && !o.burn && !o.poison) amt *= 0.6;
    amt = Math.max(1, Math.round(amt));
    e.hp -= amt;
    e.flash = 0.12;
    if (settings().dmgNumbers) {
      const col = o.poison ? '#9be36b' : o.burn ? '#ff9a3c' : o.crit ? '#ffd23f' : '#ffffff';
      floatText(e.x + U.rand(-8, 8), e.y - e.r, String(amt), col, o.crit ? 24 : 17);
    }
    const res = e.def.kbRes || 0;
    if (o.kb && res < 1) {
      const f = o.kb * 26 * (1 - res);
      e.kx += o.kx * f;
      e.ky += o.ky * f;
    }
    const owner = o.owner || null;
    if (owner && !o.noLS && s.lifeSteal > 0 && owner.lsT <= 0 && Math.random() < s.lifeSteal / 100) {
      owner.lsT = 0.1;
      heal(owner, 1, true);
    }
    if (o.weapon && e.hp > 0) {
      if (G.fx.freeze && Math.random() < Math.min(0.3, 0.08 * G.fx.freeze)) e.slowT = 1.2;
      if (G.fx.burnHit && Math.random() < 0.2) applyBurn(e, (4 + s.elementalDamage * 1.5) * Calc.dmgMult(s));
    }
    if (o.crit && o.weapon && !o.noChain && G.fx.chain) chainLightning(e, amt, owner);
    if (o.crit) G.addHitstop(0.03, true);
    if (e.hp <= 0) killEnemy(e, o);
    else sfx('hit');
  }

  function killEnemy(e) {
    const w = G.w;
    const r = G.run;
    const def = e.def;
    const s = G.stats;
    e.dead = true;
    e.hp = 0;
    e.burn = null;
    r.kills++;
    if (r.kills >= 500) achieve('kills500');
    puff(e.x, e.y, def.color, def.big ? 36 : 10, def.big ? 280 : 170);
    const mm = def.mats * (w.mod.mats || 1);
    let whole = Math.floor(mm);
    if (Math.random() < mm - whole) whole++;
    for (let i = 0; i < whole; i++) spawnPickup('mat', e.x, e.y, 1);
    if (e.stolen > 0) spawnPickup('mat', e.x, e.y, e.stolen);
    const L = Calc.luckMult(s);
    const fruitMult = (G.fx.fruitPower ? 1.5 : 1) * (w.mod.trees ? 2 : 1);
    if (e.type === 'tree') {
      if (Math.random() < Math.min(0.9, 0.3 * L)) spawnPickup('crate', e.x, e.y, 1);
      else spawnPickup('fruit', e.x, e.y, 1);
      if (Math.random() < Math.min(0.9, 0.4 * L)) spawnPickup('top', e.x, e.y, randomTopping());
    } else if (e.type === 'elite') {
      spawnPickup('crate', e.x, e.y, 3);
      for (let i = 0; i < 3; i++) spawnPickup('top', e.x, e.y, randomTopping());
      r.eliteKills++;
      achieve('elite');
    } else if (def.isBoss) {
      r.bossKills++;
      achieve('boss');
    } else if (e.type !== 'egg') {
      if (Math.random() < 0.012 * L * fruitMult) spawnPickup(Math.random() < 0.85 ? 'fruit' : 'crate', e.x, e.y, 1);
      if (Math.random() < Math.min(0.5, 0.03 * L)) spawnPickup('top', e.x, e.y, randomTopping());
    }
    if (def.split) {
      const childHp = (D.ENEMIES[def.split].hp + D.ENEMIES[def.split].hpW * (w.n - 1)) * D.hpWaveMult(w.n) * (w.mod.hp || 1);
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * U.TAU;
        queueSpawn(def.split, e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14, { hp: childHp });
      }
    }
    if (e.affixes.includes('explosive')) {
      ring(e, 20, 240, Math.random() * U.TAU);
      w.explosions.push({ x: e.x, y: e.y, r: 150, life: 0.4, max: 0.4 });
      for (const p of w.players) {
        const rr = 150 + p.r;
        if (!p.dead && U.dist2(p.x, p.y, e.x, e.y) < rr * rr) hurtPlayer(p, e.dmg);
      }
    }
    if (G.fx.killBlast) {
      w.blastCount++;
      const need = [0, 15, 10, 7][Math.min(3, G.fx.killBlast)];
      if (w.blastCount >= need) {
        w.blastCount = 0;
        const p = nearestPlayer(e.x, e.y, false);
        if (p) explode(p.x, p.y, 130, (10 + w.n * 3) * Calc.dmgMult(s), false, true, p);
      }
    }
    if (G.fx.killHeal && Math.random() < 0.08 * G.fx.killHeal) heal(nearestPlayer(e.x, e.y, false), 1, true);
    if (def.big) {
      w.shake = Math.max(w.shake, 14);
      G.addHitstop(0.12);
      sfx('bigdeath');
    } else {
      sfx('death');
    }
  }

  function randomTopping() {
    return U.pick(D.TOPPINGS).id;
  }

  /* ---------- Düşmanlar ---------- */
  function fireEnemyBullet(e, ang, speed) {
    const mult = e.def.bulletMult || 1;
    G.w.ebullets.push({
      x: e.x + Math.cos(ang) * e.r * 0.8, y: e.y + Math.sin(ang) * e.r * 0.8,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: e.def.big ? 10 : 9,
      dmg: Math.max(1, Math.round(e.dmg * mult)), life: 6, dead: false, big: !!e.def.big,
    });
  }

  function ring(e, count, speed, offset) {
    for (let i = 0; i < count; i++) fireEnemyBullet(e, offset + (i / count) * U.TAU, speed);
    sfx('enemyShoot');
  }

  function summonAround(e, type, count) {
    for (let i = 0; i < count; i++) {
      if (aliveCount() >= D.MAX_ALIVE) return;
      const a = (i / count) * U.TAU + Math.random();
      addMarker(type, U.clamp(e.x + Math.cos(a) * (e.r + 50), 40, AW - 40), U.clamp(e.y + Math.sin(a) * (e.r + 50), 40, AH - 40), 0.8);
    }
  }

  // Lazer ışını oyuncuya değiyor mu?
  function beamHits(e, ang, p) {
    const len = 1500;
    return U.segCircle(e.x, e.y, e.x + Math.cos(ang) * len, e.y + Math.sin(ang) * len, p.x, p.y, p.r + 16);
  }

  function aiEnemy(e, dt, nx, ny, d, tx, ty) {
    const w = G.w;
    const ai = e.def.ai;
    let vx = 0;
    let vy = 0;
    if (ai === 'chase') {
      e.wob += dt * 3;
      const wob = Math.sin(e.wob) * 0.18;
      vx = (nx - ny * wob) * e.speed;
      vy = (ny + nx * wob) * e.speed;
      if (e.def.shield) e.shieldAng = Math.atan2(ny, nx);
    } else if (ai === 'ranged' || ai === 'healer') {
      const healer = ai === 'healer';
      if (healer) {
        e.healT -= dt;
        if (e.healT <= 0) {
          e.healT = 3;
          for (const o of w.enemies) {
            if (o.dead || o === e) continue;
            const rr = 220 + o.r;
            if (U.dist2(o.x, o.y, e.x, e.y) > rr * rr || o.hp >= o.maxHp) continue;
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * (o.def.big ? 0.03 : 0.25));
          }
          addRing(e.x, e.y, 220, '#7fe07a');
        }
      } else {
        e.cd -= dt;
      }
      if (e.state === 'aim') {
        e.st -= dt;
        if (e.st <= 0) {
          fireEnemyBullet(e, Math.atan2(ty - e.y, tx - e.x), 270);
          sfx('enemyShoot');
          e.state = 'move';
          e.cd = U.rand(2.2, 3.2);
        }
      } else {
        const far = healer ? 420 : 340;
        const near = healer ? 300 : 220;
        if (d > far) {
          vx = nx * e.speed;
          vy = ny * e.speed;
        } else if (d < near) {
          vx = -nx * e.speed * 0.8;
          vy = -ny * e.speed * 0.8;
        } else {
          const side = e.id % 2 ? 1 : -1;
          vx = -ny * e.speed * 0.45 * side;
          vy = nx * e.speed * 0.45 * side;
        }
        if (!healer && e.cd <= 0 && d < 560) {
          e.state = 'aim';
          e.st = 0.4;
        }
      }
    } else if (ai === 'thief') {
      e.goalT -= dt;
      let goal = null;
      if (e.stolen < 4) {
        if (e.goal && !e.goal.dead && !e.goal.magnet && e.goalT > 0) goal = e.goal;
        else {
          let bd = Infinity;
          for (const pk of w.pickups) {
            if (pk.dead || pk.magnet || pk.kind !== 'mat') continue;
            const dd = U.dist2(pk.x, pk.y, e.x, e.y);
            if (dd < bd) {
              bd = dd;
              goal = pk;
            }
          }
          e.goal = goal;
          e.goalT = 0.5;
        }
      }
      if (goal) {
        const gx = goal.x - e.x;
        const gy = goal.y - e.y;
        const gd = Math.hypot(gx, gy) || 1;
        vx = (gx / gd) * e.speed;
        vy = (gy / gd) * e.speed;
        if (gd < e.r + 10) {
          goal.dead = true;
          e.stolen += goal.value;
          e.goal = null;
          floatText(e.x, e.y - e.r - 6, 'ÇALDI!', '#d6c35a', 15);
        }
      } else if (e.stolen > 0) {
        // kaç: kenara ulaşırsa malzemeyle birlikte kaybolur
        vx = -nx * e.speed;
        vy = -ny * e.speed;
        if (Math.min(e.x, AW - e.x, e.y, AH - e.y) < e.r + 12) {
          e.dead = true;
          e.escaped = true;
          floatText(e.x, e.y - 20, 'KAÇTI!', '#d6c35a', 18);
          puff(e.x, e.y, e.def.color, 8, 120);
        }
      } else {
        vx = nx * e.speed * 0.7;
        vy = ny * e.speed * 0.7;
      }
    } else if (ai === 'egg') {
      e.hatch -= dt;
      if (e.hatch <= 0) {
        e.dead = true;
        e.escaped = true;
        puff(e.x, e.y, e.def.color, 10, 140);
        const kind = w.n >= 15 ? 'chaser' : 'baby';
        for (let i = 0; i < 3; i++) {
          if (aliveCount() >= D.MAX_ALIVE) break;
          const a = (i / 3) * U.TAU;
          queueSpawn(kind, e.x + Math.cos(a) * 22, e.y + Math.sin(a) * 22);
        }
      }
    } else if (ai === 'charger') {
      if (e.state === 'move') {
        vx = nx * e.speed;
        vy = ny * e.speed;
        e.cd -= dt;
        if (e.cd <= 0 && d < 430) {
          e.state = 'wind';
          e.st = 0.6;
        }
      } else if (e.state === 'wind') {
        e.st -= dt;
        e.dirx = nx;
        e.diry = ny;
        if (e.st <= 0) {
          e.state = 'dash';
          e.st = 0.6;
        }
      } else if (e.state === 'dash') {
        vx = e.dirx * e.speed * 3.6;
        vy = e.diry * e.speed * 3.6;
        e.st -= dt;
        if (e.st <= 0) {
          e.state = 'rest';
          e.st = 0.45;
        }
      } else {
        vx = nx * e.speed * 0.3;
        vy = ny * e.speed * 0.3;
        e.st -= dt;
        if (e.st <= 0) {
          e.state = 'move';
          e.cd = U.rand(2.4, 3.6);
        }
      }
    } else if (ai === 'elite') {
      if (e.affixes.includes('summoner')) {
        e.summonT -= dt;
        if (e.summonT <= 0) {
          e.summonT = 6;
          summonAround(e, 'baby', 3);
        }
      }
      if (e.state === 'move') {
        vx = nx * e.speed;
        vy = ny * e.speed;
        e.cd -= dt;
        if (e.cd <= 0) {
          e.atk = (e.atk + 1) % 2;
          e.state = 'wind';
          e.st = 0.7;
        }
      } else if (e.state === 'wind') {
        e.st -= dt;
        e.dirx = nx;
        e.diry = ny;
        if (e.st <= 0) {
          if (e.atk === 0) {
            ring(e, 16, 230, Math.random() * U.TAU);
            e.state = 'move';
            e.cd = U.rand(2.5, 3.5);
          } else {
            e.state = 'dash';
            e.st = 0.7;
          }
        }
      } else {
        vx = e.dirx * e.speed * 3.4;
        vy = e.diry * e.speed * 3.4;
        e.st -= dt;
        if (e.st <= 0) {
          e.state = 'move';
          e.cd = U.rand(2.5, 3.5);
        }
      }
    } else if (ai === 'boss') {
      const f = e.hp / e.maxHp;
      const phase = f > 0.66 ? 0 : f > 0.33 ? 1 : 2;
      e.phase = phase;
      if (phase >= 1) {
        e.summon -= dt;
        if (e.summon <= 0) {
          e.summon = phase === 2 ? 6 : 8;
          summonAround(e, phase === 2 ? 'chaser' : 'baby', 4);
        }
      }
      if (e.state === 'move') {
        const m = phase === 2 ? 1.35 : 1;
        vx = nx * e.speed * m;
        vy = ny * e.speed * m;
        e.cd -= dt;
        if (e.cd <= 0) {
          e.atk = (e.atk + 1) % 3;
          e.state = 'wind';
          e.st = phase === 2 ? 0.45 : 0.6;
        }
      } else if (e.state === 'wind') {
        e.st -= dt;
        e.dirx = nx;
        e.diry = ny;
        if (e.st <= 0) {
          const kind = phase === 0 ? 0 : e.atk;
          if (kind === 0) {
            ring(e, 18 + phase * 4, 220, Math.random() * U.TAU);
            if (phase === 2) e.pending = 0.35;
            e.state = 'move';
            e.cd = phase === 0 ? 2.4 : 2;
          } else if (kind === 1) {
            e.state = 'spiral';
            e.st = 2.2;
            e.emit = 0;
          } else {
            e.state = 'dash';
            e.st = 0.8;
          }
        }
      } else if (e.state === 'spiral') {
        vx = nx * e.speed * 0.3;
        vy = ny * e.speed * 0.3;
        e.st -= dt;
        e.emit -= dt;
        while (e.emit <= 0) {
          e.emit += 0.1;
          for (let k = 0; k < 3; k++) fireEnemyBullet(e, e.spin + (k * U.TAU) / 3, 210);
          e.spin += 0.24;
          sfx('enemyShoot');
        }
        if (e.st <= 0) {
          e.state = 'move';
          e.cd = 1.8;
        }
      } else {
        vx = e.dirx * e.speed * 3.6;
        vy = e.diry * e.speed * 3.6;
        e.st -= dt;
        if (e.st <= 0) {
          e.state = 'move';
          e.cd = 1.6;
        }
      }
      if (e.pending !== null) {
        e.pending -= dt;
        if (e.pending <= 0) {
          e.pending = null;
          ring(e, 26, 190, Math.random() * U.TAU);
        }
      }
    } else if (ai === 'laserboss') {
      const phase = e.hp / e.maxHp > 0.5 ? 0 : 1;
      e.phase = phase;
      if (phase === 1) {
        e.summon -= dt;
        if (e.summon <= 0) {
          e.summon = 9;
          summonAround(e, 'spitter', 2);
        }
      }
      if (e.state === 'move') {
        vx = nx * e.speed;
        vy = ny * e.speed;
        e.cd -= dt;
        if (e.cd <= 0) {
          e.atk = (e.atk + 1) % 2;
          if (e.atk === 1) {
            const a = Math.atan2(ny, nx);
            e.beams = phase ? [a, a + Math.PI] : [a];
            e.beamOn = false;
            e.spinDir = Math.random() < 0.5 ? -1 : 1;
            e.state = 'tele';
            e.st = 0.9;
            sfx('warn');
          } else {
            e.state = 'volley';
            e.shots = 3;
            e.emit = 0;
          }
        }
      } else if (e.state === 'tele') {
        e.st -= dt;
        if (e.st <= 0) {
          e.state = 'beam';
          e.beamOn = true;
          e.st = 1.6;
          sfx('laser');
        }
      } else if (e.state === 'beam') {
        e.st -= dt;
        for (let i = 0; i < e.beams.length; i++) e.beams[i] += e.spinDir * 0.9 * dt;
        for (const p of w.players) {
          if (p.dead) continue;
          for (const a of e.beams) {
            if (beamHits(e, a, p)) {
              hurtPlayer(p, e.dmg * 0.8);
              break;
            }
          }
        }
        if (e.st <= 0) {
          e.beams = null;
          e.beamOn = false;
          e.state = 'move';
          e.cd = phase ? 1.6 : 2.4;
        }
      } else if (e.state === 'volley') {
        vx = nx * e.speed * 0.4;
        vy = ny * e.speed * 0.4;
        e.emit -= dt;
        if (e.emit <= 0) {
          if (e.shots > 0) {
            const a = Math.atan2(ty - e.y, tx - e.x);
            for (let k = -2; k <= 2; k++) fireEnemyBullet(e, a + k * 0.22, 260);
            sfx('enemyShoot');
            e.shots--;
            e.emit = 0.35;
          } else {
            e.state = 'move';
            e.cd = 2;
          }
        }
      }
    } else if (ai === 'eggboss') {
      const phase = e.hp / e.maxHp > 0.5 ? 0 : 1;
      e.phase = phase;
      e.layT -= dt;
      if (e.layT <= 0) {
        e.layT = phase ? 2 : 3;
        let eggs = 0;
        for (const o of w.enemies) if (!o.dead && o.type === 'egg') eggs++;
        for (const q of w.spawnQueue) if (q.type === 'egg') eggs++;
        if (eggs < 8 && aliveCount() < D.MAX_ALIVE) {
          const a = Math.random() * U.TAU;
          queueSpawn('egg', e.x + Math.cos(a) * (e.r + 40), e.y + Math.sin(a) * (e.r + 40));
        }
      }
      if (e.state === 'move') {
        vx = nx * e.speed;
        vy = ny * e.speed;
        e.cd -= dt;
        if (e.cd <= 0) {
          e.state = 'wind';
          e.st = 0.8;
        }
      } else if (e.state === 'wind') {
        e.st -= dt;
        e.dirx = nx;
        e.diry = ny;
        if (e.st <= 0) {
          e.state = 'dash';
          e.st = 0.9;
        }
      } else {
        vx = e.dirx * e.speed * 3.2;
        vy = e.diry * e.speed * 3.2;
        e.st -= dt;
        if (e.st <= 0) {
          if (phase) ring(e, 16, 220, Math.random() * U.TAU);
          e.state = 'move';
          e.cd = phase ? 4 : 5;
        }
      }
    }
    if (e.slowT > 0) {
      vx *= 0.3;
      vy *= 0.3;
    }
    return { vx, vy };
  }

  function updateEnemies(dt) {
    const w = G.w;
    const list = w.enemies;
    const decay = Math.exp(-10 * dt);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      e.born += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.slowT > 0) e.slowT -= dt;
      if (e.touchCd > 0) e.touchCd -= dt;
      if (e.affixes.length && e.affixes.includes('regen') && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.015 * dt);
      if (e.burn) {
        e.burn.t -= dt;
        if (e.burn.t <= 0) {
          const bd = e.burn.dmg;
          e.burn.t += 0.5;
          e.burn.ticks--;
          if (e.burn.ticks <= 0) e.burn = null;
          damageEnemy(e, bd, { burn: true, noLS: true });
          if (e.dead) continue;
        }
      }
      if (e.def.ai === 'tree') continue;
      const tp = nearestPlayer(e.x, e.y, true);
      let tx;
      let ty;
      if (tp) {
        tx = tp.x;
        ty = tp.y;
        e.lastTX = tx;
        e.lastTY = ty;
      } else {
        tx = e.lastTX !== undefined ? e.lastTX : AW / 2;
        ty = e.lastTY !== undefined ? e.lastTY : AH / 2;
      }
      const dx = tx - e.x;
      const dy = ty - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let v = aiEnemy(e, dt, dx / d, dy / d, d, tx, ty);
      if (e.dead) continue;
      const mudMult = BR.Arena.speedMult(w, e.x, e.y, false);
      v = BR.Arena.steer(w, e, v.vx * mudMult, v.vy * mudMult, tx, ty);
      e.x += (v.vx + e.kx) * dt;
      e.y += (v.vy + e.ky) * dt;
      e.kx *= decay;
      e.ky *= decay;
      if (v.vx > 1) e.face = 1;
      else if (v.vx < -1) e.face = -1;
    }
    // birbirinin içine girmesinler
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      if (a.dead) continue;
      const aFixed = a.def.ai === 'tree' || a.def.ai === 'egg';
      for (let j = i + 1; j < n; j++) {
        const b = list[j];
        if (b.dead) continue;
        const rr = (a.r + b.r) * 0.85;
        const dx = b.x - a.x;
        if (dx > rr || dx < -rr) continue;
        const dy = b.y - a.y;
        if (dy > rr || dy < -rr) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const bFixed = b.def.ai === 'tree' || b.def.ai === 'egg';
        if (aFixed && bFixed) continue;
        let d = Math.sqrt(d2);
        let ux;
        let uy;
        if (d < 0.001) {
          const ang = Math.random() * U.TAU;
          ux = Math.cos(ang);
          uy = Math.sin(ang);
          d = 0;
        } else {
          ux = dx / d;
          uy = dy / d;
        }
        const push = (rr - d) * 0.5;
        const ma = a.r * a.r;
        const mb = b.r * b.r;
        const wa = aFixed ? 0 : bFixed ? 1 : mb / (ma + mb);
        const wb = bFixed ? 0 : aFixed ? 1 : ma / (ma + mb);
        a.x -= ux * push * wa;
        a.y -= uy * push * wa;
        b.x += ux * push * wb;
        b.y += uy * push * wb;
      }
    }
    const boiled = !!D.CHAR_BY_ID[G.run.charId].noWeapons;
    const s = G.stats;
    for (const e of list) {
      if (e.dead) continue;
      e.x = U.clamp(e.x, e.r, AW - e.r);
      e.y = U.clamp(e.y, e.r, AH - e.r);
      BR.Arena.collide(w, e);
      for (const p of w.players) {
        if (p.dead) continue;
        const d2 = U.dist2(e.x, e.y, p.x, p.y);
        if (boiled && e.touchCd <= 0) {
          const rc = e.r + p.r + 4;
          if (d2 < rc * rc) {
            e.touchCd = 0.35;
            const d = Math.sqrt(d2) || 1;
            const crit = Math.random() < U.clamp(s.critChance / 100, 0, 1);
            damageEnemy(e, Calc.contactDamage(s, G.run) * ownerMult(p) * (crit ? 2 : 1), { crit, kb: 14, kx: (e.x - p.x) / d, ky: (e.y - p.y) / d, owner: p, weapon: true });
            if (e.dead) break;
          }
        }
        if (e.dmg > 0) {
          const rr = e.r + p.r - 6;
          if (d2 < rr * rr) hurtPlayer(p, e.dmg);
        }
      }
    }
  }

  function updateEnemyBullets(dt) {
    const w = G.w;
    for (const b of w.ebullets) {
      if (b.dead) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -40 || b.x > AW + 40 || b.y < -40 || b.y > AH + 40 || BR.Arena.blocked(w, b.x, b.y, 0)) {
        b.dead = true;
        continue;
      }
      for (const p of w.players) {
        if (p.dead) continue;
        const rr = b.r + p.r - 4;
        if (U.dist2(b.x, b.y, p.x, p.y) < rr * rr) {
          hurtPlayer(p, b.dmg);
          b.dead = true;
          break;
        }
      }
    }
  }

  function updateClouds(dt) {
    const w = G.w;
    for (const c of w.clouds) {
      c.t -= dt;
      c.tick -= dt;
      if (c.tick <= 0) {
        c.tick += 0.5;
        for (const e of w.enemies) {
          if (e.dead) continue;
          const rr = c.r + e.r;
          if (U.dist2(c.x, c.y, e.x, e.y) < rr * rr) damageEnemy(e, c.dmg, { poison: true, noLS: true, owner: c.owner });
        }
      }
    }
    w.clouds = w.clouds.filter((c) => c.t > 0);
  }

  /* ---------- Ganimetler ---------- */
  function spawnPickup(kind, x, y, value) {
    const w = G.w;
    if (kind === 'mat' && w.pickups.length > MAX_PICKUPS) {
      const t = w.pickups[Math.floor(Math.random() * w.pickups.length)];
      if (t.kind === 'mat' && !t.dead) {
        t.value += value;
        return;
      }
    }
    const a = Math.random() * U.TAU;
    const sp = U.rand(60, 190);
    w.pickups.push({
      kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, value, magnet: false, to: null, t: 0, mt: 0,
      bob: Math.random() * U.TAU, dead: false,
    });
  }

  function updatePickups(dt) {
    const w = G.w;
    const R = Calc.pickupR(G.stats);
    const fr = Math.exp(-6 * dt);
    for (const pk of w.pickups) {
      if (pk.dead) continue;
      pk.t += dt;
      if (pk.magnet) {
        const p = pk.to && !pk.to.dead ? pk.to : nearestPlayer(pk.x, pk.y, false);
        if (!p) {
          pk.magnet = false;
          continue;
        }
        pk.to = p;
        const dx = p.x - pk.x;
        const dy = p.y - pk.y;
        const d = Math.hypot(dx, dy);
        pk.mt += dt;
        const sp = Math.min(1500, 380 + pk.mt * 1800) * dt;
        if (d <= sp + p.r * 0.5 || d < p.r + 8) {
          collect(pk, p);
          continue;
        }
        pk.x += (dx / d) * sp;
        pk.y += (dy / d) * sp;
      } else {
        pk.x = U.clamp(pk.x + pk.vx * dt, 12, AW - 12);
        pk.y = U.clamp(pk.y + pk.vy * dt, 12, AH - 12);
        pk.vx *= fr;
        pk.vy *= fr;
        BR.Arena.collide(w, pk, 10);
        if (pk.t > 0.25) {
          const p = nearestPlayer(pk.x, pk.y, false);
          if (p && U.dist2(p.x, p.y, pk.x, pk.y) < R * R) {
            pk.magnet = true;
            pk.to = p;
            pk.mt = 0;
          }
        }
      }
    }
  }

  function collect(pk, p) {
    const r = G.run;
    pk.dead = true;
    if (pk.kind === 'mat') {
      let v = pk.value;
      if (G.fx.doubleMat && Math.random() < 0.06 * G.fx.doubleMat) v *= 2;
      const extra = Math.min(r.bag, v);
      r.bag -= extra;
      const total = v + extra;
      r.materials += total;
      r.matsTotal += total;
      addXp(total);
      sfx('pickup');
    } else if (pk.kind === 'fruit') {
      heal(p, G.fx.fruitPower ? 6 : 3, false);
      if (G.fx.fruitPower) p.invuln = Math.max(p.invuln, 2);
    } else if (pk.kind === 'crate') {
      r.crates.push(pk.value);
      floatText(p.x, p.y - 40, 'SANDIK!', '#ffcd4d', 20);
      sfx('crate');
    } else if (pk.kind === 'top') {
      const t = D.TOPPING_BY_ID[pk.value];
      if (t) {
        r.pantry[t.id] = (r.pantry[t.id] || 0) + 1;
        floatText(p.x, p.y - 40, t.name.toLocaleUpperCase('tr-TR'), t.color, 17);
        sfx('topping');
      }
    }
  }

  function addXp(v) {
    const r = G.run;
    r.xp += v;
    let leveled = 0;
    while (r.xp >= D.xpForLevel(r.level + 1)) {
      r.xp -= D.xpForLevel(r.level + 1);
      r.level++;
      r.pendingLevels++;
      leveled++;
    }
    if (leveled) {
      refresh();
      const w = G.w;
      if (w && G.state === 'wave') {
        for (const p of w.players) {
          if (p.dead) continue;
          p.hp = Math.min(Calc.maxHp(G.stats), p.hp + leveled);
          floatText(p.x, p.y - 52, 'SEVİYE ATLADIN!', '#8fd14f', 22);
        }
      }
      if (r.level >= 20) achieve('level20');
      sfx('level');
    }
  }
  G.addXp = addXp;

  /* ---------- Efektler ---------- */
  function puff(x, y, color, n, speed) {
    const w = G.w;
    for (let i = 0; i < n; i++) {
      if (w.particles.length >= MAX_PARTICLES) w.particles.shift();
      const a = Math.random() * U.TAU;
      const sp = U.rand(speed * 0.3, speed);
      const life = U.rand(0.3, 0.6);
      w.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, color, size: U.rand(3, 7) });
    }
  }

  function floatText(x, y, str, color, size) {
    const w = G.w;
    if (!w) return;
    if (w.texts.length >= MAX_TEXTS) w.texts.shift();
    w.texts.push({ x, y, str, color, size, life: 0.85, max: 0.85 });
  }

  function updateEffects(dt) {
    const w = G.w;
    const fr = Math.exp(-5 * dt);
    for (const pt of w.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= fr;
      pt.vy *= fr;
      pt.life -= dt;
    }
    for (const t of w.texts) {
      t.y -= 55 * dt;
      t.life -= dt;
    }
    for (const ex of w.explosions) ex.life -= dt;
    for (const rg of w.rings) rg.life -= dt;
    for (const z of w.zaps) z.life -= dt;
    w.shake *= Math.exp(-9 * dt);
    if (w.shake < 0.2) w.shake = 0;
    if (w.hurtFlash > 0) w.hurtFlash -= dt;
  }

  function compact() {
    const w = G.w;
    w.enemies = w.enemies.filter((e) => !e.dead);
    w.bullets = w.bullets.filter((b) => !b.dead);
    w.ebullets = w.ebullets.filter((b) => !b.dead);
    w.pickups = w.pickups.filter((p) => !p.dead);
    w.markers = w.markers.filter((m) => !m.done);
    w.turrets = w.turrets.filter((t) => !t.dead);
    w.particles = w.particles.filter((p) => p.life > 0);
    w.texts = w.texts.filter((t) => t.life > 0);
    w.explosions = w.explosions.filter((e) => e.life > 0);
    w.rings = w.rings.filter((e) => e.life > 0);
    w.zaps = w.zaps.filter((e) => e.life > 0);
  }

  /* ---------- Dalga sonu ---------- */
  function finalWave(n) {
    return n === D.MAX_WAVE && !G.run.endless;
  }

  function endWave() {
    const w = G.w;
    const r = G.run;
    if (w.ended) return;
    w.ended = true;
    w.endT = 1.8;
    for (const e of w.enemies) if (!e.dead) puff(e.x, e.y, e.def.color, 6, 140);
    w.enemies = [];
    w.markers = [];
    w.ebullets = [];
    w.bullets = [];
    w.clouds = [];
    w.spawnQueue = [];
    let left = 0;
    for (const pk of w.pickups) {
      if (pk.dead) continue;
      if (pk.kind === 'mat') left += pk.value;
      else if (pk.kind === 'crate') r.crates.push(pk.value);
      else if (pk.kind === 'top' && D.TOPPING_BY_ID[pk.value]) r.pantry[pk.value] = (r.pantry[pk.value] || 0) + 1;
    }
    w.pickups = [];
    if (left > 0) r.bag += left;
    for (const p of w.players) {
      p.weapons.forEach((wp) => {
        wp.thrust = null;
      });
      p.invuln = 99;
    }
    const lead = w.players.find((p) => !p.dead) || w.players[0];
    if (!finalWave(w.n)) {
      const h = Math.round(G.stats.harvesting);
      if (h > 0) {
        r.materials += h;
        r.matsTotal += h;
        addXp(h);
        floatText(lead.x, lead.y - 70, '+' + h + ' HASAT', '#8fd14f', 20);
        r.bonus.harvesting = (r.bonus.harvesting || 0) + Math.max(1, Math.round(h * 0.05));
      } else if (h < 0) {
        r.materials = Math.max(0, r.materials + h);
      }
      if (w.mod.crate) for (let i = 0; i < w.mod.crate; i++) r.crates.push(1);
      if (w.bonus.crates) for (let i = 0; i < w.bonus.crates; i++) r.crates.push(1);
      const res = G.layerEnd();
      if (res.interest > 0) floatText(lead.x, lead.y - 92, '+' + res.interest + ' FAİZ', '#ffcd4d', 18);
      if (res.harvested > 0) floatText(lead.x, lead.y - 114, 'TOHUM HASADI!', '#8fd14f', 18);
      refresh();
    }
    if (r.materials >= 500) achieve('rich');
    G.emit('waveEnd', w);
    G.emit('banner', finalWave(w.n) ? 'ZAFER!' : 'DALGA TAMAMLANDI!');
    sfx(finalWave(w.n) ? 'win' : 'wave');
  }

  function finishWave() {
    const r = G.run;
    const n = G.w.n;
    if (n >= 1) achieve('wave1');
    if (n >= 5) achieve('wave5');
    if (n >= 5 && r.coop) achieve('coop5');
    if (finalWave(n)) {
      G.state = 'victory';
      r.phase = 'victory';
      achieve('win');
      if (r.danger >= 3) achieve('win3');
      if (r.daily) achieve('daily');
      if (BR.Meta) G.lastResult = BR.Meta.recordEnd(r, true);
      clearSave();
      G.emit('victory');
      return;
    }
    G.state = 'between';
    r.phase = 'between';
    saveRun();
    G.emit('between');
  }

  function gameOver() {
    const r = G.run;
    G.state = 'dead';
    r.phase = 'dead';
    if (r.daily) achieve('daily');
    if (BR.Meta) G.lastResult = BR.Meta.recordEnd(r, false);
    clearSave();
    G.emit('gameOver');
  }

  // Zaferden sonra sonsuz moda geç
  G.continueEndless = function () {
    const r = G.run;
    if (!r || G.state !== 'victory') return false;
    r.endless = true;
    G.state = 'between';
    r.phase = 'between';
    saveRun();
    return true;
  };

  /* ================= Paylaşılan iç fonksiyonlar ================= */
  G.X = {
    damageEnemy, hurtPlayer, heal, floatText, puff, explode, aoe, addRing, applyBurn,
    spawnEnemy, queueSpawn, nearestPlayer, alivePlayers, ownerMult,
  };

  /* ================= HUD verisi ================= */
  G.hud = function () {
    const w = G.w;
    const r = G.run;
    if (!w || !r) return null;
    let boss = null;
    for (const b of w.bosses) {
      if (!b.dead) {
        boss = { name: b.def.name, frac: Math.max(0, b.hp / b.maxHp), affixes: b.affixes.map((a) => D.AFFIXES[a].name) };
        break;
      }
    }
    const maxHp = Calc.maxHp(G.stats);
    const abil = D.ABILITIES[D.CHAR_BY_ID[r.charId].ability];
    return {
      players: w.players.map((p) => ({
        hp: Math.max(0, Math.ceil(p.hp)),
        maxHp,
        dead: p.dead,
        dash: U.clamp(p.dashCd / D.DASH.cd, 0, 1),
        abil: U.clamp(p.abilCd / abil.cd, 0, 1),
        shield: p.shield,
      })),
      abilityName: abil.name,
      level: r.level,
      xp: r.xp,
      xpNeed: D.xpForLevel(r.level + 1),
      materials: r.materials,
      bag: r.bag,
      wave: w.n,
      timeLeft: Math.max(0, Math.ceil(w.duration - w.t)),
      boss,
      mod: w.modId ? D.MODIFIERS[w.modId].name : null,
      arena: w.arena ? D.ARENAS[w.arena.id].name : '',
    };
  };

  BR.Game = G;
})((window.BR = window.BR || {}));
