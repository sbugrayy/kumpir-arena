/* Kumpir Arena - oyun motoru: koşu durumu, dalga simülasyonu, dükkan, seviye atlama */
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

  const listeners = {};

  const G = {
    state: 'menu', // menu | wave | between | shop | dead | victory
    paused: false,
    run: null,
    w: null,
    stats: null,
    lastConfig: null,
    lastSave: null,
    time: 0,
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
    return BR.settings || { shake: true, dmgNumbers: true };
  }

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
    critChance: (s, def) => U.clamp((def.crit || 0) + s.critChance / 100, 0, 1),
    weaponDamage(def, tier, s) {
      let base = def.dmg[tier - 1];
      for (const k in def.scale) base += def.scale[k] * (s[k] || 0);
      return Math.max(1, base * Calc.dmgMult(s));
    },
    burnDamage(def, tier, s) {
      if (!def.burn) return 0;
      const base = def.burn[tier - 1] + (def.burnScale || 0) * s.elementalDamage;
      return Math.max(1, base * Calc.dmgMult(s));
    },
    weaponCd: (def, tier, s) => Math.max(0.06, def.cd[tier - 1] / Calc.atkMult(s)),
    weaponRange(def, s) {
      if (def.type === 'melee') return Math.max(50, def.range + s.range / 2);
      return Math.max(80, def.range + s.range);
    },
    // Taretler yalnızca mühendislikle güçlenir (yüzde hasar etkilemez)
    turretDamage: (tier, s) => Math.max(1, D.TURRET.dmg[tier - 1] + s.engineering * D.TURRET.scale),
    regenInterval: (s) => (s.hpRegen >= 1 ? 5 / (1 + (s.hpRegen - 1) / 2.25) : Infinity),
  };
  G.Calc = Calc;

  /* ================= Koşu (run) ================= */
  function createRun(charId, weaponId, danger) {
    const run = {
      v: 1,
      charId,
      startWeapon: weaponId,
      danger,
      wave: 0, // son oynanan dalga (dükkanda: tamamlanan dalga)
      phase: 'start', // start | between | shop | wave
      weapons: [{ id: weaponId, tier: 1 }],
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
    };
    (D.CHAR_BY_ID[charId].startItems || []).forEach((id) => addItem(run, id));
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

  function computeStats(run) {
    const s = { pickupRange: 0 };
    D.STATS.forEach((st) => {
      s[st.key] = 0;
    });
    s.maxHp = 10;
    const add = (obj, m) => {
      if (!obj) return;
      for (const k in obj) s[k] = (s[k] || 0) + obj[k] * m;
    };
    add(D.CHAR_BY_ID[run.charId].stats, 1);
    add(run.upgrades, 1);
    add(run.bonus, 1);
    for (const id in run.items) add(D.ITEM_BY_ID[id].stats, run.items[id]);
    s.maxHp += run.level;
    const sc = setCounts(run.weapons);
    for (const c in sc) {
      const cls = D.CLASSES[c];
      const v = cls.per[Math.min(6, sc[c])];
      if (v) s[cls.stat] += v;
    }
    return s;
  }
  G.computeStats = computeStats;

  function addItem(run, id) {
    run.items[id] = (run.items[id] || 0) + 1;
  }

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

  function validRun(r) {
    try {
      if (!r || r.v !== 1 || !D.CHAR_BY_ID[r.charId]) return false;
      if (!Array.isArray(r.weapons) || r.weapons.length > D.MAX_WEAPONS) return false;
      if (!r.weapons.every((w) => D.WEAPON_BY_ID[w.id] && w.tier >= 1 && w.tier <= 4)) return false;
      if (typeof r.wave !== 'number' || r.wave < 0 || r.wave >= D.MAX_WAVE) return false;
      if (!r.items || typeof r.items !== 'object') return false;
      if (!Object.keys(r.items).every((id) => D.ITEM_BY_ID[id] && r.items[id] > 0)) return false;
      if (!D.DANGERS[r.danger]) return false;
      if (!Array.isArray(r.crates)) return false;
      const nums = ['level', 'xp', 'pendingLevels', 'materials', 'bag', 'kills', 'matsTotal', 'rerolls'];
      if (!nums.every((k) => typeof r[k] === 'number' && isFinite(r[k]))) return false;
      for (const obj of [r.upgrades, r.bonus]) {
        if (!obj || typeof obj !== 'object') return false;
        if (!Object.keys(obj).every((k) => D.STAT_BY_KEY[k] && typeof obj[k] === 'number')) return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function sanitizeRun(r) {
    if (!['start', 'between', 'shop'].includes(r.phase)) r.phase = r.wave === 0 ? 'start' : 'shop';
    if (r.wave === 0) r.phase = 'start';
    if (!Array.isArray(r.shop) || r.shop.length !== 4 || !r.shop.every(validOffer)) {
      r.shop = null;
      r.shopFor = -1;
    }
    if (r.upOffer && !(Array.isArray(r.upOffer) && r.upOffer.every((o) => D.UPGRADE_BY_STAT[o.stat] && o.tier >= 1 && o.tier <= 4))) r.upOffer = null;
    if (r.crateOffer && !D.ITEM_BY_ID[r.crateOffer.id]) r.crateOffer = null;
    if (typeof r.upRerolls !== 'number') r.upRerolls = 0;
    return r;
  }

  function validOffer(o) {
    if (o === null) return true;
    if (!o || typeof o !== 'object') return false;
    if (o.kind === 'weapon') return !!D.WEAPON_BY_ID[o.id] && o.tier >= 1 && o.tier <= 4;
    if (o.kind === 'item') return !!D.ITEM_BY_ID[o.id];
    return false;
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
  G.newRun = function (charId, weaponId, danger) {
    G.run = createRun(charId, weaponId, danger);
    G.lastConfig = { charId, weaponId, danger };
    G.stats = computeStats(G.run);
    saveRun();
    G.startNextWave();
  };

  // Kaydı yükler; UI'nin hangi ekranı göstereceğini döndürür
  G.continueRun = function () {
    const r = G.loadSave();
    if (!r) return null;
    G.run = r;
    G.lastConfig = { charId: r.charId, weaponId: r.startWeapon, danger: r.danger };
    G.stats = computeStats(r);
    G.w = null;
    if (r.phase === 'start') {
      G.startNextWave();
      return 'wave';
    }
    G.state = r.phase === 'shop' ? 'shop' : 'between';
    return r.phase;
  };

  G.startNextWave = function () {
    const run = G.run;
    run.wave += 1;
    run.phase = 'wave';
    run.upOffer = null;
    run.crateOffer = null;
    G.stats = computeStats(run);
    const s = G.stats;
    const w = {
      n: run.wave,
      t: 0,
      duration: D.waveDuration(run.wave),
      player: {
        x: AW / 2, y: AH / 2, r: PLAYER_R, hp: Calc.maxHp(s), invuln: 0.8, regenT: 0, lsT: 0,
        face: 1, moving: false, walkT: 0, dead: false, deathT: 0, mvx: 0, mvy: 0,
      },
      weapons: [],
      enemies: [],
      bullets: [],
      ebullets: [],
      pickups: [],
      turrets: [],
      particles: [],
      texts: [],
      markers: [],
      explosions: [],
      bosses: [],
      spawnT: 0.6,
      treeT: U.rand(4, 8),
      nextId: 1,
      ended: false,
      endT: 0,
      shake: 0,
      hurtFlash: 0,
      specialDone: false,
    };
    G.w = w;
    buildWeapons();
    buildTurrets();
    G.state = 'wave';
    G.paused = false;
    G.emit('waveStart', w);
    sfx('wave');
  };

  function buildWeapons() {
    const w = G.w;
    const n = G.run.weapons.length;
    w.weapons = G.run.weapons.map((wp, i) => {
      const a = n === 1 ? 0 : (U.TAU * i) / n - Math.PI / 2 + Math.PI / n;
      return {
        def: D.WEAPON_BY_ID[wp.id], tier: wp.tier, cd: U.rand(0.05, 0.4), slotA: a,
        x: w.player.x + Math.cos(a) * WEAPON_RING, y: w.player.y + Math.sin(a) * WEAPON_RING,
        ang: a, thrust: null, recoil: 0,
      };
    });
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
    tiers.forEach((tier, i) => {
      const a = (i / tiers.length) * U.TAU + U.rand(-0.3, 0.3);
      const d = U.rand(90, 170);
      w.turrets.push({
        x: U.clamp(w.player.x + Math.cos(a) * d, 40, AW - 40),
        y: U.clamp(w.player.y + Math.sin(a) * d, 40, AH - 40),
        tier, cd: U.rand(0.3, 1), ang: a, recoil: 0,
      });
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
    if (w.player.dead) {
      updateEffects(dt);
      compact();
      w.player.deathT -= dt;
      if (w.player.deathT <= 0) gameOver();
      return;
    }
    w.t += dt;
    updatePlayer(dt);
    updateSpawns(dt);
    updateWeapons(dt);
    updateTurrets(dt);
    updateBullets(dt);
    updateEnemies(dt);
    updateEnemyBullets(dt);
    updatePickups(dt);
    updateEffects(dt);
    compact();
    if (w.player.dead) return;
    if (w.n >= D.MAX_WAVE && w.specialDone && w.bosses.length > 0 && w.bosses.every((b) => b.dead)) {
      endWave();
      return;
    }
    if (w.t >= w.duration) endWave();
  };

  G.togglePause = function (force) {
    if (G.state !== 'wave') return G.paused;
    G.paused = typeof force === 'boolean' ? force : !G.paused;
    if (BR.Input) BR.Input.reset();
    return G.paused;
  };

  /* ---------- Oyuncu ---------- */
  function updatePlayer(dt) {
    const w = G.w;
    const p = w.player;
    const s = G.stats;
    const mv = BR.Input ? BR.Input.getMove() : { x: 0, y: 0 };
    const sp = PLAYER_SPEED * Calc.speedMult(s);
    p.x = U.clamp(p.x + mv.x * sp * dt, p.r, AW - p.r);
    p.y = U.clamp(p.y + mv.y * sp * dt, p.r, AH - p.r);
    p.moving = Math.abs(mv.x) > 0.05 || Math.abs(mv.y) > 0.05;
    if (mv.x > 0.1) p.face = 1;
    else if (mv.x < -0.1) p.face = -1;
    if (p.moving) p.walkT += dt;
    p.mvx = mv.x;
    p.mvy = mv.y;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.lsT > 0) p.lsT -= dt;
    const maxHp = Calc.maxHp(s);
    if (p.hp > maxHp) p.hp = maxHp;
    const iv = Calc.regenInterval(s);
    if (!w.ended && p.hp < maxHp && isFinite(iv)) {
      p.regenT += dt;
      if (p.regenT >= iv) {
        p.regenT -= iv;
        heal(1, true);
      }
    } else {
      p.regenT = 0;
    }
  }

  function heal(amount, quiet) {
    const p = G.w.player;
    const maxHp = Calc.maxHp(G.stats);
    if (p.dead || p.hp >= maxHp) return;
    const before = p.hp;
    p.hp = Math.min(maxHp, p.hp + amount);
    const got = p.hp - before;
    if (got > 0) {
      floatText(p.x, p.y - 34, '+' + Math.round(got), '#7fe07a', 18);
      if (!quiet) sfx('heal');
    }
  }

  function hurtPlayer(raw) {
    const w = G.w;
    const p = w.player;
    const s = G.stats;
    if (p.invuln > 0 || p.dead || w.ended) return false;
    if (Math.random() < Calc.dodge(s)) {
      p.invuln = 0.2;
      floatText(p.x, p.y - 34, 'KAÇIŞ', '#9fd7ff', 18);
      sfx('dodge');
      return true;
    }
    const dmg = Math.max(1, Math.round(raw * Calc.armorMult(s)));
    p.hp -= dmg;
    p.invuln = 0.5;
    w.shake = Math.max(w.shake, 9);
    w.hurtFlash = 0.25;
    floatText(p.x, p.y - 34, '-' + dmg, '#ff5d5d', 22);
    sfx('hurt');
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      p.deathT = 1.5;
      puff(p.x, p.y, '#c8955a', 34, 260);
      sfx('lose');
    }
    return true;
  }

  /* ---------- Doğma (spawn) ---------- */
  function aliveCount() {
    const w = G.w;
    let n = 0;
    for (const e of w.enemies) if (!e.dead) n++;
    for (const m of w.markers) if (!m.done) n++;
    return n;
  }

  function randomPoint(minDist) {
    const p = G.w.player;
    for (let i = 0; i < 30; i++) {
      const x = U.rand(70, AW - 70);
      const y = U.rand(70, AH - 70);
      if (U.dist2(x, y, p.x, p.y) >= minDist * minDist) return { x, y };
    }
    return { x: p.x < AW / 2 ? AW - 120 : 120, y: p.y < AH / 2 ? AH - 120 : 120 };
  }

  function addMarker(type, x, y, t) {
    G.w.markers.push({ type, x, y, t, max: t, done: false });
  }

  function spawnGroup() {
    const n = G.w.n;
    const type = U.weighted(D.spawnTable(n));
    let size = D.groupSize(n);
    if (type === 'chaser') size += n < 7 ? 1 : 2;
    if (type === 'bruiser' || type === 'charger') size = Math.max(1, Math.ceil(size / 2));
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
    const dz = D.DANGERS[G.run.danger];
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
      const slow = n >= D.MAX_WAVE ? 1.5 : 1;
      w.spawnT += (D.spawnInterval(n) * slow) / dz.rate;
      if (w.t < w.duration - 2 && aliveCount() < D.MAX_ALIVE) spawnGroup();
    }
    w.treeT -= dt;
    if (w.treeT <= 0) {
      w.treeT = U.rand(8, 12);
      let trees = 0;
      for (const e of w.enemies) if (!e.dead && e.type === 'tree') trees++;
      for (const m of w.markers) if (!m.done && m.type === 'tree') trees++;
      if (trees < 3 && w.t < w.duration - 3 && Math.random() < Math.min(0.9, 0.45 * Calc.luckMult(G.stats))) {
        const pt = randomPoint(250);
        addMarker('tree', pt.x, pt.y, 1);
      }
    }
    if (!w.specialDone && w.t >= 2) {
      w.specialDone = true;
      if (D.isEliteWave(n)) {
        const pt = randomPoint(450);
        addMarker('elite', pt.x, pt.y, 1.6);
        G.emit('banner', 'ELİT DÜŞMAN GELİYOR!');
        sfx('warn');
      } else if (n >= D.MAX_WAVE) {
        const pt = randomPoint(500);
        addMarker('boss', pt.x, pt.y, 1.8);
        G.emit('banner', 'KRALİÇE ZORG GELİYOR!');
        sfx('warn');
      }
    }
  }

  function spawnEnemy(type, x, y) {
    const w = G.w;
    const def = D.ENEMIES[type];
    const n = w.n;
    const dz = D.DANGERS[G.run.danger];
    const hp = (def.hp + def.hpW * (n - 1)) * dz.hp * (def.big ? 1 : D.hpWaveMult(n));
    const dmg = def.dmg > 0 ? Math.max(1, Math.round((def.dmg + def.dmgW * (n - 1)) * dz.dmg)) : 0;
    const e = {
      id: w.nextId++, type, def, x, y, r: def.r, hp, maxHp: hp, dmg,
      speed: U.rand(def.speed[0], def.speed[1]) * dz.spd, kx: 0, ky: 0, flash: 0, burn: null,
      state: 'move', st: 0, cd: U.rand(1.2, 2.8), wob: Math.random() * U.TAU, born: 0,
      dead: false, face: 1, atk: 0, dirx: 1, diry: 0, spin: 0, emit: 0, summon: 6, pending: null, phase: 0,
    };
    w.enemies.push(e);
    if (def.big) w.bosses.push(e);
    return e;
  }

  /* ---------- Silahlar ---------- */
  // preferUnburnt: yakan silahlar zaten yanan düşmana boşuna ateş etmesin
  function nearestEnemy(x, y, range, preferUnburnt) {
    let best = null;
    let bd = Infinity;
    let alt = null;
    let ad = Infinity;
    for (const e of G.w.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y) - e.r;
      if (d > range) continue;
      if (preferUnburnt && e.burn) {
        if (d < ad) {
          ad = d;
          alt = e;
        }
      } else if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best || alt;
  }

  function updateWeapons(dt) {
    const w = G.w;
    const p = w.player;
    const s = G.stats;
    for (const wp of w.weapons) {
      const sx = p.x + Math.cos(wp.slotA) * WEAPON_RING;
      const sy = p.y + Math.sin(wp.slotA) * WEAPON_RING;
      wp.cd -= dt;
      if (wp.recoil > 0) wp.recoil = Math.max(0, wp.recoil - dt * 6);
      if (wp.thrust) {
        updateThrust(wp, sx, sy, dt);
        continue;
      }
      wp.x = sx;
      wp.y = sy;
      const range = Calc.weaponRange(wp.def, s);
      const tgt = nearestEnemy(sx, sy, range, !!wp.def.burn);
      if (!tgt) continue;
      wp.ang = Math.atan2(tgt.y - sy, tgt.x - sx);
      if (wp.cd <= 0) {
        wp.cd = Calc.weaponCd(wp.def, wp.tier, s);
        if (wp.def.type === 'melee') startThrust(wp, tgt, sx, sy, range);
        else fireRanged(wp, wp.ang, range);
      }
    }
  }

  function startThrust(wp, tgt, sx, sy, range) {
    const d = Math.hypot(tgt.x - sx, tgt.y - sy);
    const reach = U.clamp(d + 6, 30, range);
    const cdEff = Calc.weaponCd(wp.def, wp.tier, G.stats);
    wp.thrust = { t: 0, dur: U.clamp(cdEff * 0.55, 0.14, 0.3), ang: wp.ang, reach, hit: [], px: sx, py: sy };
    sfx('swing');
  }

  function updateThrust(wp, sx, sy, dt) {
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
        meleeHit(wp, e, th.ang);
      }
    }
    th.px = tx;
    th.py = ty;
    wp.x = tx;
    wp.y = ty;
    if (ph >= 1) wp.thrust = null;
  }

  function meleeHit(wp, e, ang) {
    const s = G.stats;
    const def = wp.def;
    let dmg = Calc.weaponDamage(def, wp.tier, s);
    const crit = Math.random() < Calc.critChance(s, def);
    if (crit) dmg *= def.critMult || 2;
    damageEnemy(e, dmg, { crit, kb: def.kb[wp.tier - 1], kx: Math.cos(ang), ky: Math.sin(ang) });
  }

  function fireRanged(wp, ang, range) {
    const def = wp.def;
    const t = wp.tier;
    const s = G.stats;
    const base = Calc.weaponDamage(def, t, s);
    const count = def.proj ? def.proj[t - 1] : 1;
    const spread = def.spread || 0;
    const speed = def.speed;
    for (let k = 0; k < count; k++) {
      let a = ang;
      if (count > 1) a += (k / (count - 1) - 0.5) * spread + U.rand(-0.04, 0.04);
      else if (spread) a += U.rand(-spread / 2, spread / 2);
      const crit = Math.random() < Calc.critChance(s, def);
      G.w.bullets.push({
        x: wp.x + Math.cos(a) * 14, y: wp.y + Math.sin(a) * 14,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        r: def.projR || 5, dmg: crit ? base * (def.critMult || 2) : base, crit,
        pierce: def.pierce ? def.pierce[t - 1] : 0, hit: [], life: (range + 30) / speed,
        kb: def.kb ? def.kb[t - 1] : 0, burn: def.burn ? Calc.burnDamage(def, t, s) : 0,
        explode: def.explode ? def.explode[t - 1] : 0, kind: def.id, tier: t, noLS: false, dead: false,
      });
    }
    wp.recoil = 1;
    sfx('shoot');
  }

  function updateTurrets(dt) {
    const w = G.w;
    const s = G.stats;
    for (const t of w.turrets) {
      t.cd -= dt;
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 6);
      const tgt = nearestEnemy(t.x, t.y, D.TURRET.range);
      if (!tgt) continue;
      t.ang = Math.atan2(tgt.y - t.y, tgt.x - t.x);
      if (t.cd > 0) continue;
      t.cd = D.TURRET.cd[t.tier - 1];
      t.recoil = 1;
      const crit = Math.random() < U.clamp(s.critChance / 100, 0, 1);
      const dmg = Calc.turretDamage(t.tier, s) * (crit ? 2 : 1);
      const sp = D.TURRET.speed;
      w.bullets.push({
        x: t.x + Math.cos(t.ang) * 18, y: t.y + Math.sin(t.ang) * 18,
        vx: Math.cos(t.ang) * sp, vy: Math.sin(t.ang) * sp, r: 5, dmg, crit, pierce: 0, hit: [],
        life: (D.TURRET.range + 40) / sp, kb: 3, burn: 0, explode: 0, kind: 'turret', tier: t.tier,
        noLS: true, dead: false,
      });
      sfx('shoot');
    }
  }

  function updateBullets(dt) {
    const w = G.w;
    for (const b of w.bullets) {
      if (b.dead) continue;
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
          explode(b.x, b.y, b.explode, b.dmg, b.crit, b.noLS);
          b.dead = true;
          break;
        }
        const sp = Math.hypot(b.vx, b.vy) || 1;
        damageEnemy(e, b.dmg, { crit: b.crit, kb: b.kb, kx: b.vx / sp, ky: b.vy / sp, noLS: b.noLS });
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
        if (b.explode) explode(b.x, b.y, b.explode, b.dmg, b.crit, b.noLS);
        b.dead = true;
      }
    }
  }

  function explode(x, y, radius, dmg, crit, noLS) {
    const w = G.w;
    for (const e of w.enemies) {
      if (e.dead) continue;
      const rr = radius + e.r;
      const d2 = U.dist2(x, y, e.x, e.y);
      if (d2 <= rr * rr) {
        const d = Math.sqrt(d2) || 1;
        damageEnemy(e, dmg, { crit, kb: 12, kx: (e.x - x) / d, ky: (e.y - y) / d, noLS });
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

  function damageEnemy(e, raw, o) {
    if (e.dead) return;
    const w = G.w;
    const s = G.stats;
    const amt = Math.max(1, Math.round(raw));
    e.hp -= amt;
    e.flash = 0.12;
    if (settings().dmgNumbers) {
      floatText(e.x + U.rand(-8, 8), e.y - e.r, String(amt), o.burn ? '#ff9a3c' : o.crit ? '#ffd23f' : '#ffffff', o.crit ? 24 : 17);
    }
    const res = e.def.kbRes || 0;
    if (o.kb && res < 1) {
      const f = o.kb * 26 * (1 - res);
      e.kx += o.kx * f;
      e.ky += o.ky * f;
    }
    if (!o.noLS && s.lifeSteal > 0 && w.player.lsT <= 0 && Math.random() < s.lifeSteal / 100) {
      w.player.lsT = 0.1;
      heal(1, true);
    }
    if (e.hp <= 0) killEnemy(e);
    else sfx('hit');
  }

  function killEnemy(e) {
    const w = G.w;
    const run = G.run;
    const def = e.def;
    e.dead = true;
    e.hp = 0;
    e.burn = null;
    run.kills++;
    puff(e.x, e.y, def.color, def.big ? 36 : 10, def.big ? 280 : 170);
    for (let i = 0; i < def.mats; i++) spawnPickup('mat', e.x, e.y, 1);
    const L = Calc.luckMult(G.stats);
    if (e.type === 'tree') {
      if (Math.random() < Math.min(0.9, 0.3 * L)) spawnPickup('crate', e.x, e.y, 1);
      else spawnPickup('fruit', e.x, e.y, 1);
    } else if (e.type === 'elite') {
      spawnPickup('crate', e.x, e.y, 3);
    } else if (e.type !== 'boss' && Math.random() < 0.012 * L) {
      spawnPickup(Math.random() < 0.85 ? 'fruit' : 'crate', e.x, e.y, 1);
    }
    if (def.big) {
      w.shake = Math.max(w.shake, 14);
      sfx('bigdeath');
    } else {
      sfx('death');
    }
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

  function aiEnemy(e, dt, nx, ny, d) {
    const p = G.w.player;
    const ai = e.def.ai;
    let vx = 0;
    let vy = 0;
    if (ai === 'chase') {
      e.wob += dt * 3;
      const wob = Math.sin(e.wob) * 0.18;
      vx = (nx - ny * wob) * e.speed;
      vy = (ny + nx * wob) * e.speed;
    } else if (ai === 'ranged') {
      e.cd -= dt;
      if (e.state === 'aim') {
        e.st -= dt;
        if (e.st <= 0) {
          fireEnemyBullet(e, Math.atan2(p.y - e.y, p.x - e.x), 270);
          sfx('enemyShoot');
          e.state = 'move';
          e.cd = U.rand(2.2, 3.2);
        }
      } else {
        if (d > 340) {
          vx = nx * e.speed;
          vy = ny * e.speed;
        } else if (d < 220) {
          vx = -nx * e.speed * 0.8;
          vy = -ny * e.speed * 0.8;
        } else {
          const side = e.id % 2 ? 1 : -1;
          vx = -ny * e.speed * 0.45 * side;
          vy = nx * e.speed * 0.45 * side;
        }
        if (e.cd <= 0 && d < 560) {
          e.state = 'aim';
          e.st = 0.4;
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
      // 3. evrede ikinci halka gecikmeli atılır
      if (e.pending !== null) {
        e.pending -= dt;
        if (e.pending <= 0) {
          e.pending = null;
          ring(e, 26, 190, Math.random() * U.TAU);
        }
      }
    }
    return { vx, vy };
  }

  function updateEnemies(dt) {
    const w = G.w;
    const p = w.player;
    const list = w.enemies;
    const decay = Math.exp(-10 * dt);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      e.born += dt;
      if (e.flash > 0) e.flash -= dt;
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
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const v = aiEnemy(e, dt, dx / d, dy / d, d);
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
      const aFixed = a.def.ai === 'tree';
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
        const bFixed = b.def.ai === 'tree';
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
    for (const e of list) {
      if (e.dead) continue;
      e.x = U.clamp(e.x, e.r, AW - e.r);
      e.y = U.clamp(e.y, e.r, AH - e.r);
      if (e.dmg > 0 && !p.dead) {
        const rr = e.r + p.r - 6;
        if (U.dist2(e.x, e.y, p.x, p.y) < rr * rr) hurtPlayer(e.dmg);
      }
    }
  }

  function updateEnemyBullets(dt) {
    const w = G.w;
    const p = w.player;
    for (const b of w.ebullets) {
      if (b.dead) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -40 || b.x > AW + 40 || b.y < -40 || b.y > AH + 40) {
        b.dead = true;
        continue;
      }
      const rr = b.r + p.r - 4;
      if (!p.dead && U.dist2(b.x, b.y, p.x, p.y) < rr * rr) {
        hurtPlayer(b.dmg);
        b.dead = true;
      }
    }
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
      kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, value, magnet: false, t: 0, mt: 0,
      bob: Math.random() * U.TAU, dead: false,
    });
  }

  function updatePickups(dt) {
    const w = G.w;
    const p = w.player;
    const R = Calc.pickupR(G.stats);
    const fr = Math.exp(-6 * dt);
    for (const pk of w.pickups) {
      if (pk.dead) continue;
      pk.t += dt;
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const d = Math.hypot(dx, dy);
      if (pk.magnet) {
        pk.mt += dt;
        const sp = Math.min(1500, 380 + pk.mt * 1800) * dt;
        if (d <= sp + p.r * 0.5 || d < p.r + 8) {
          collect(pk);
          continue;
        }
        pk.x += (dx / d) * sp;
        pk.y += (dy / d) * sp;
      } else {
        pk.x = U.clamp(pk.x + pk.vx * dt, 12, AW - 12);
        pk.y = U.clamp(pk.y + pk.vy * dt, 12, AH - 12);
        pk.vx *= fr;
        pk.vy *= fr;
        if (pk.t > 0.25 && !p.dead && d < R) {
          pk.magnet = true;
          pk.mt = 0;
        }
      }
    }
  }

  function collect(pk) {
    const w = G.w;
    const run = G.run;
    pk.dead = true;
    if (pk.kind === 'mat') {
      const extra = Math.min(run.bag, pk.value);
      run.bag -= extra;
      const total = pk.value + extra;
      run.materials += total;
      run.matsTotal += total;
      addXp(total);
      sfx('pickup');
    } else if (pk.kind === 'fruit') {
      heal(3, false);
    } else if (pk.kind === 'crate') {
      run.crates.push(pk.value);
      floatText(w.player.x, w.player.y - 40, 'SANDIK!', '#ffcd4d', 20);
      sfx('crate');
    }
  }

  function addXp(v) {
    const run = G.run;
    run.xp += v;
    let leveled = 0;
    while (run.xp >= D.xpForLevel(run.level + 1)) {
      run.xp -= D.xpForLevel(run.level + 1);
      run.level++;
      run.pendingLevels++;
      leveled++;
    }
    if (leveled) {
      G.stats = computeStats(run);
      const w = G.w;
      if (w && !w.player.dead) {
        w.player.hp = Math.min(Calc.maxHp(G.stats), w.player.hp + leveled);
        floatText(w.player.x, w.player.y - 52, 'SEVİYE ATLADIN!', '#8fd14f', 22);
      }
      sfx('level');
    }
  }

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
    w.particles = w.particles.filter((p) => p.life > 0);
    w.texts = w.texts.filter((t) => t.life > 0);
    w.explosions = w.explosions.filter((e) => e.life > 0);
  }

  /* ---------- Dalga sonu ---------- */
  function endWave() {
    const w = G.w;
    const run = G.run;
    if (w.ended) return;
    w.ended = true;
    w.endT = 1.8;
    for (const e of w.enemies) if (!e.dead) puff(e.x, e.y, e.def.color, 6, 140);
    w.enemies = [];
    w.markers = [];
    w.ebullets = [];
    w.bullets = [];
    let left = 0;
    for (const pk of w.pickups) {
      if (pk.dead) continue;
      if (pk.kind === 'mat') left += pk.value;
      else if (pk.kind === 'crate') run.crates.push(pk.value);
    }
    w.pickups = [];
    if (left > 0) run.bag += left;
    w.weapons.forEach((wp) => {
      wp.thrust = null;
    });
    if (w.n < D.MAX_WAVE) {
      const h = Math.round(G.stats.harvesting);
      if (h > 0) {
        run.materials += h;
        run.matsTotal += h;
        addXp(h);
        floatText(w.player.x, w.player.y - 70, '+' + h + ' HASAT', '#8fd14f', 20);
        run.bonus.harvesting = (run.bonus.harvesting || 0) + Math.max(1, Math.round(h * 0.05));
      } else if (h < 0) {
        run.materials = Math.max(0, run.materials + h);
      }
      G.stats = computeStats(run);
    }
    w.player.invuln = 99;
    G.emit('waveEnd', w);
    G.emit('banner', w.n >= D.MAX_WAVE ? 'ZAFER!' : 'DALGA TAMAMLANDI!');
    sfx(w.n >= D.MAX_WAVE ? 'win' : 'wave');
  }

  function finishWave() {
    const run = G.run;
    if (G.w.n >= D.MAX_WAVE) {
      G.state = 'victory';
      clearSave();
      G.emit('victory');
      return;
    }
    G.state = 'between';
    run.phase = 'between';
    saveRun();
    G.emit('between');
  }

  function gameOver() {
    G.state = 'dead';
    clearSave();
    G.emit('gameOver');
  }

  /* ================= Nadirlik zarı ================= */
  function rollTier(wave, luck) {
    const L = Math.max(0, 1 + (luck || 0) / 100);
    const p4 = wave >= 8 ? Math.min(0.1, (wave - 7) * 0.012) * L : 0;
    const p3 = wave >= 4 ? Math.min(0.28, (wave - 3) * 0.028) * L : 0;
    const p2 = wave >= 2 ? Math.min(0.6, (wave - 1) * 0.07) * L : 0;
    const r = Math.random();
    if (r < p4) return 4;
    if (r < p4 + p3) return 3;
    if (r < p4 + p3 + p2) return 2;
    return 1;
  }
  G.rollTier = rollTier;

  function itemAllowed(run, it) {
    return !it.max || (run.items[it.id] || 0) < it.max;
  }
  G.itemAllowed = itemAllowed;

  // İstenen kademeden (yoksa bir alttakinden) sınırı dolmamış rastgele bir eşya
  function randomItemOfTier(run, tier) {
    for (let t = tier; t >= 1; t--) {
      const pool = D.ITEMS.filter((it) => it.tier === t && itemAllowed(run, it));
      if (pool.length) return U.pick(pool);
    }
    return U.pick(D.ITEMS.filter((it) => !it.max));
  }

  /* ================= Dükkan ================= */
  G.shopWave = function () {
    return G.run.wave + 1;
  };

  function rollOffer(run, s) {
    const ch = D.CHAR_BY_ID[run.charId];
    const tier = rollTier(G.shopWave(), s.luck);
    if (Math.random() < 0.35) {
      const pool = D.WEAPONS.filter((d) => (!ch.onlyType || d.type === ch.onlyType) && (d.minTier || 1) <= tier);
      if (pool.length) {
        const owned = pool.filter((d) => run.weapons.some((x) => x.id === d.id));
        const def = owned.length && Math.random() < 0.35 ? U.pick(owned) : U.pick(pool);
        return { kind: 'weapon', id: def.id, tier, locked: false };
      }
    }
    const it = randomItemOfTier(run, tier);
    return { kind: 'item', id: it.id, tier: it.tier, locked: false };
  }

  function genOffer(run, others) {
    const s = computeStats(run);
    let o = rollOffer(run, s);
    for (let i = 0; i < 6; i++) {
      const dup = others.some((x) => x && x.kind === o.kind && x.id === o.id && x.tier === o.tier);
      if (!dup) break;
      o = rollOffer(run, s);
    }
    return o;
  }

  function fillShop(run) {
    for (let i = 0; i < 4; i++) {
      if (!run.shop[i]) run.shop[i] = genOffer(run, run.shop);
    }
  }

  G.enterShop = function () {
    const run = G.run;
    G.state = 'shop';
    run.phase = 'shop';
    if (run.shopFor !== run.wave || !Array.isArray(run.shop)) {
      const old = Array.isArray(run.shop) ? run.shop : [];
      run.shop = [0, 1, 2, 3].map((i) => (old[i] && old[i].locked ? old[i] : null));
      fillShop(run);
      run.shopFor = run.wave;
      run.rerolls = 0;
    }
    G.stats = computeStats(run);
    saveRun();
  };

  G.offerPrice = function (o) {
    if (!o) return 0;
    const base = o.kind === 'weapon' ? D.WEAPON_BY_ID[o.id].price * D.WEAPON_TIER_MULT[o.tier - 1] : D.ITEM_BY_ID[o.id].price;
    return D.price(base, G.shopWave());
  };

  G.buyCheck = function (o) {
    const run = G.run;
    if (!o) return { ok: false, reason: '' };
    const price = G.offerPrice(o);
    if (o.kind === 'item' && !itemAllowed(run, D.ITEM_BY_ID[o.id])) {
      return { ok: false, reason: 'En fazla ' + D.ITEM_BY_ID[o.id].max + ' tane taşıyabilirsin', price, maxed: true };
    }
    if (run.materials < price) return { ok: false, reason: 'Yetersiz malzeme', price };
    if (o.kind === 'weapon' && run.weapons.length >= D.MAX_WEAPONS) {
      const m = run.weapons.findIndex((x) => x.id === o.id && x.tier === o.tier && x.tier < 4);
      if (m < 0) return { ok: false, reason: 'Silah yuvaları dolu', price };
      return { ok: true, price, merge: m };
    }
    return { ok: true, price };
  };

  G.buy = function (i) {
    const run = G.run;
    const o = run.shop && run.shop[i];
    const c = G.buyCheck(o);
    if (!c.ok) return c;
    run.materials -= c.price;
    if (o.kind === 'weapon') {
      if (c.merge !== undefined) run.weapons[c.merge].tier += 1;
      else run.weapons.push({ id: o.id, tier: o.tier });
    } else {
      addItem(run, o.id);
    }
    run.shop[i] = null;
    G.stats = computeStats(run);
    saveRun();
    return c;
  };

  G.rerollCost = function () {
    const sw = G.shopWave();
    return Math.max(1, Math.floor(sw * 0.5)) + G.run.rerolls * Math.max(1, Math.floor(sw * 0.35));
  };

  G.reroll = function () {
    const run = G.run;
    const cost = G.rerollCost();
    if (run.materials < cost) return false;
    run.materials -= cost;
    run.rerolls++;
    run.shop = run.shop.map((o) => (o && o.locked ? o : null));
    fillShop(run);
    saveRun();
    return true;
  };

  G.toggleLock = function (i) {
    const o = G.run.shop && G.run.shop[i];
    if (!o) return false;
    o.locked = !o.locked;
    saveRun();
    return o.locked;
  };

  G.weaponValue = function (wp) {
    return D.price(D.WEAPON_BY_ID[wp.id].price * D.WEAPON_TIER_MULT[wp.tier - 1], G.shopWave());
  };

  G.sellPrice = function (wp) {
    return Math.max(1, Math.floor(G.weaponValue(wp) * 0.25));
  };

  G.sellWeapon = function (i) {
    const run = G.run;
    const wp = run.weapons[i];
    if (!wp) return { ok: false, reason: '' };
    if (run.weapons.length <= 1) return { ok: false, reason: 'Son silahını satamazsın' };
    const price = G.sellPrice(wp);
    run.materials += price;
    run.weapons.splice(i, 1);
    G.stats = computeStats(run);
    saveRun();
    return { ok: true, price };
  };

  G.combineIndex = function (i) {
    const run = G.run;
    const wp = run.weapons[i];
    if (!wp || wp.tier >= 4) return -1;
    return run.weapons.findIndex((x, j) => j !== i && x.id === wp.id && x.tier === wp.tier);
  };

  G.combineWeapon = function (i) {
    const run = G.run;
    const j = G.combineIndex(i);
    if (j < 0) return false;
    run.weapons[i].tier += 1;
    run.weapons.splice(j, 1);
    G.stats = computeStats(run);
    saveRun();
    return true;
  };

  /* ================= Seviye atlama ================= */
  G.getUpgradeOffer = function () {
    const run = G.run;
    if (!run.upOffer) {
      const s = computeStats(run);
      run.upOffer = U.shuffle(D.UPGRADES.slice())
        .slice(0, 4)
        .map((u) => ({ stat: u.stat, tier: rollTier(G.shopWave(), s.luck) }));
    }
    return run.upOffer;
  };

  G.upgradeValue = function (o) {
    return D.UPGRADE_BY_STAT[o.stat].vals[o.tier - 1];
  };

  G.chooseUpgrade = function (i) {
    const run = G.run;
    const offer = G.getUpgradeOffer();
    const o = offer[i];
    if (!o || run.pendingLevels <= 0) return false;
    run.upgrades[o.stat] = (run.upgrades[o.stat] || 0) + G.upgradeValue(o);
    run.pendingLevels--;
    run.upOffer = null;
    run.upRerolls = 0;
    G.stats = computeStats(run);
    saveRun();
    sfx('buy');
    return true;
  };

  G.upgradeRerollCost = function () {
    const sw = G.shopWave();
    return Math.max(1, Math.floor(sw * 0.5)) + G.run.upRerolls * Math.max(1, Math.floor(sw * 0.35));
  };

  G.rerollUpgrades = function () {
    const run = G.run;
    const cost = G.upgradeRerollCost();
    if (run.materials < cost) return false;
    run.materials -= cost;
    run.upRerolls++;
    run.upOffer = null;
    G.getUpgradeOffer();
    saveRun();
    return true;
  };

  /* ================= Sandıklar ================= */
  G.getCrateOffer = function () {
    const run = G.run;
    if (!run.crates.length) return null;
    if (!run.crateOffer) {
      const s = computeStats(run);
      const tier = Math.max(run.crates[0] || 1, rollTier(G.shopWave(), s.luck));
      run.crateOffer = { id: randomItemOfTier(run, tier).id };
    }
    return run.crateOffer;
  };

  G.recyclePrice = function (id) {
    return Math.max(1, Math.floor(D.price(D.ITEM_BY_ID[id].price, G.shopWave()) * 0.35));
  };

  G.takeCrate = function (recycle) {
    const run = G.run;
    const o = G.getCrateOffer();
    if (!o) return false;
    if (recycle) run.materials += G.recyclePrice(o.id);
    else addItem(run, o.id);
    run.crates.shift();
    run.crateOffer = null;
    G.stats = computeStats(run);
    saveRun();
    return true;
  };

  /* ================= HUD verisi ================= */
  G.hud = function () {
    const w = G.w;
    const run = G.run;
    if (!w || !run) return null;
    let boss = null;
    for (const b of w.bosses) {
      if (!b.dead) {
        boss = { name: b.def.name, frac: Math.max(0, b.hp / b.maxHp) };
        break;
      }
    }
    return {
      hp: Math.max(0, Math.ceil(w.player.hp)),
      maxHp: Calc.maxHp(G.stats),
      level: run.level,
      xp: run.xp,
      xpNeed: D.xpForLevel(run.level + 1),
      materials: run.materials,
      bag: run.bag,
      wave: w.n,
      timeLeft: Math.max(0, Math.ceil(w.duration - w.t)),
      boss,
    };
  };

  BR.Game = G;
})((window.BR = window.BR || {}));
