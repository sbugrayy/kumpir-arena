/* Kumpir Arena - dalga arası sistemler: dükkan, seviye, sandık, rota haritası, olaylar, dinlenme,
   tohumlar, faiz, kumpir dolgusu ve tarifler, gece tezgahı, silah evrimi */
(function (BR) {
  'use strict';

  const U = BR.U;
  const D = BR.DATA;
  const G = BR.Game;
  const S = G.S;

  function run() {
    return G.run;
  }
  function save() {
    G.saveRun();
  }
  function sw() {
    return G.run.wave + 1;
  }

  /* ================= Nadirlik zarı ================= */
  function rollTier(wave, luck) {
    const L = Math.max(0, 1 + (luck || 0) / 100);
    const p4 = wave >= 8 ? Math.min(0.1, (wave - 7) * 0.012) * L : 0;
    const p3 = wave >= 4 ? Math.min(0.28, (wave - 3) * 0.028) * L : 0;
    const p2 = wave >= 2 ? Math.min(0.6, (wave - 1) * 0.07) * L : 0;
    const r = G.srand();
    if (r < p4) return 4;
    if (r < p4 + p3) return 3;
    if (r < p4 + p3 + p2) return 2;
    return 1;
  }
  G.rollTier = rollTier;

  function itemAllowed(r, it) {
    return !it.max || (r.items[it.id] || 0) < it.max;
  }
  G.itemAllowed = itemAllowed;

  // İstenen kademeden (yoksa bir alttakinden) sınırı dolmamış rastgele bir eşya
  function randomItemOfTier(r, tier) {
    for (let t = tier; t >= 1; t--) {
      const pool = D.ITEMS.filter((it) => it.tier === t && itemAllowed(r, it));
      if (pool.length) return S.pick(pool);
    }
    return S.pick(D.ITEMS.filter((it) => !it.max));
  }
  G.randomItemOfTier = randomItemOfTier;

  /* ================= Dükkan ================= */
  G.shopWave = sw;

  function rollOffer(r, s) {
    const ch = D.CHAR_BY_ID[r.charId];
    const tier = rollTier(sw(), s.luck);
    if (!ch.noWeapons && G.srand() < 0.35) {
      const pool = D.WEAPONS.filter((d) => !d.evo && (!ch.onlyType || d.type === ch.onlyType) && (d.minTier || 1) <= tier);
      if (pool.length) {
        const owned = pool.filter((d) => r.weapons.some((x) => x.id === d.id));
        const def = owned.length && G.srand() < 0.35 ? S.pick(owned) : S.pick(pool);
        return { kind: 'weapon', id: def.id, tier, locked: false };
      }
    }
    const it = randomItemOfTier(r, tier);
    return { kind: 'item', id: it.id, tier: it.tier, locked: false };
  }

  function genOffer(r, others) {
    const s = G.computeStats(r);
    let o = rollOffer(r, s);
    for (let i = 0; i < 6; i++) {
      const dup = others.some((x) => x && x.kind === o.kind && x.id === o.id && x.tier === o.tier);
      if (!dup) break;
      o = rollOffer(r, s);
    }
    return o;
  }

  // Akıllı dükkan: katalizörler 19 sıradan eşyadan biri olduğu için oyun ortasında neredeyse hiç
  // görünmüyordu. Evrim silahlarından birine (ya da ikisine) sahip oyuncuya eksik katalizörü öner.
  const CATALYST_CHANCE = { 1: 0.25, 2: 0.7 };

  function wantedCatalyst(r) {
    if (D.CHAR_BY_ID[r.charId].noWeapons) return null;
    let bestN = 0;
    let cands = [];
    D.EVOLUTIONS.forEach((ev) => {
      const item = D.ITEM_BY_ID[ev.item];
      if ((r.items[ev.item] || 0) > 0 || !itemAllowed(r, item)) return;
      const n = (r.weapons.some((w) => w.id === ev.a) ? 1 : 0) + (r.weapons.some((w) => w.id === ev.b) ? 1 : 0);
      if (!n || n < bestN) return;
      if (n > bestN) {
        bestN = n;
        cands = [];
      }
      cands.push(ev.item);
    });
    return cands.length ? { id: S.pick(cands), n: bestN } : null;
  }
  G.wantedCatalyst = wantedCatalyst;

  function offerCatalyst(r) {
    const want = wantedCatalyst(r);
    if (!want || r.shop.some((o) => o && o.kind === 'item' && o.id === want.id)) return;
    if (G.srand() >= CATALYST_CHANCE[want.n]) return;
    // kilitli olmayan bir teklifin yerine koy; önce eşya tekliflerinden birini seç
    const free = r.shop.map((o, i) => (o && !o.locked ? i : -1)).filter((i) => i >= 0);
    if (!free.length) return;
    const items = free.filter((i) => r.shop[i].kind === 'item');
    const idx = S.pick(items.length ? items : free);
    r.shop[idx] = { kind: 'item', id: want.id, tier: D.ITEM_BY_ID[want.id].tier, locked: false };
  }

  function fillShop(r) {
    for (let i = 0; i < 4; i++) {
      if (!r.shop[i]) r.shop[i] = genOffer(r, r.shop);
    }
    offerCatalyst(r);
  }

  G.enterShop = function () {
    const r = run();
    G.state = 'shop';
    r.phase = 'shop';
    if (r.shopFor !== r.wave || !Array.isArray(r.shop)) {
      const old = Array.isArray(r.shop) ? r.shop : [];
      r.shop = [0, 1, 2, 3].map((i) => (old[i] && old[i].locked ? old[i] : null));
      G.reseed('shop', r.wave);
      fillShop(r);
      r.shopFor = r.wave;
      r.rerolls = 0;
      r.discount = r.discountNext || 0;
      r.discountNext = 0;
    }
    G.refresh();
    save();
  };

  function discounted(price) {
    const d = run().discount || 0;
    return d > 0 ? Math.max(1, Math.round(price * (1 - d))) : price;
  }

  G.offerPrice = function (o) {
    if (!o) return 0;
    const base = o.kind === 'weapon' ? D.WEAPON_BY_ID[o.id].price * D.WEAPON_TIER_MULT[o.tier - 1] : D.ITEM_BY_ID[o.id].price;
    return discounted(D.price(base, sw()));
  };

  G.buyCheck = function (o) {
    const r = run();
    if (!o) return { ok: false, reason: '' };
    const price = G.offerPrice(o);
    if (o.kind === 'item' && !itemAllowed(r, D.ITEM_BY_ID[o.id])) {
      return { ok: false, reason: 'En fazla ' + D.ITEM_BY_ID[o.id].max + ' tane taşıyabilirsin', price, maxed: true };
    }
    if (r.materials < price) return { ok: false, reason: 'Yetersiz malzeme', price };
    if (o.kind === 'weapon' && r.weapons.length >= D.MAX_WEAPONS) {
      const m = r.weapons.findIndex((x) => x.id === o.id && x.tier === o.tier && x.tier < 4);
      if (m < 0) return { ok: false, reason: 'Silah yuvaları dolu', price };
      return { ok: true, price, merge: m };
    }
    return { ok: true, price };
  };

  G.buy = function (i) {
    const r = run();
    const o = r.shop && r.shop[i];
    const c = G.buyCheck(o);
    if (!c.ok) return c;
    r.materials -= c.price;
    if (o.kind === 'weapon') {
      if (c.merge !== undefined) r.weapons[c.merge].tier += 1;
      else r.weapons.push({ id: o.id, tier: o.tier, target: 'near' });
    } else {
      G.addItem(r, o.id);
    }
    r.shop[i] = null;
    G.refresh();
    if (r.materials >= 500) G.achieve('rich');
    save();
    return c;
  };

  G.rerollCost = function () {
    const n = sw();
    return Math.max(1, Math.floor(n * 0.5)) + run().rerolls * Math.max(1, Math.floor(n * 0.35));
  };

  G.reroll = function () {
    const r = run();
    const cost = G.rerollCost();
    if (r.materials < cost) return false;
    r.materials -= cost;
    r.rerolls++;
    r.shop = r.shop.map((o) => (o && o.locked ? o : null));
    G.reseed('reroll', r.wave, r.rerolls);
    fillShop(r);
    save();
    return true;
  };

  G.toggleLock = function (i) {
    const o = run().shop && run().shop[i];
    if (!o) return false;
    o.locked = !o.locked;
    save();
    return o.locked;
  };

  G.weaponValue = function (wp) {
    const def = D.WEAPON_BY_ID[wp.id];
    const base = def.evo ? def.price * 2 : def.price * D.WEAPON_TIER_MULT[wp.tier - 1];
    return D.price(base, sw());
  };

  G.sellPrice = function (wp) {
    return Math.max(1, Math.floor(G.weaponValue(wp) * 0.25));
  };

  G.sellWeapon = function (i) {
    const r = run();
    const wp = r.weapons[i];
    if (!wp) return { ok: false, reason: '' };
    if (r.weapons.length <= 1) return { ok: false, reason: 'Son silahını satamazsın' };
    const price = G.sellPrice(wp);
    r.materials += price;
    r.weapons.splice(i, 1);
    G.refresh();
    save();
    return { ok: true, price };
  };

  G.combineIndex = function (i) {
    const r = run();
    const wp = r.weapons[i];
    if (!wp || wp.tier >= 4 || D.WEAPON_BY_ID[wp.id].evo) return -1;
    return r.weapons.findIndex((x, j) => j !== i && x.id === wp.id && x.tier === wp.tier);
  };

  G.combineWeapon = function (i) {
    const r = run();
    const j = G.combineIndex(i);
    if (j < 0) return false;
    r.weapons[i].tier += 1;
    r.weapons.splice(j, 1);
    G.refresh();
    save();
    return true;
  };

  G.setTarget = function (i, mode) {
    const wp = run().weapons[i];
    if (!wp || !G.TARGET_MODES.includes(mode)) return false;
    wp.target = mode;
    G.syncWeaponTargets();
    if (G.state !== 'wave') save();
    return true;
  };

  /* ================= Silah evrimi ================= */
  // Her tarif için durum: tierA/tierB sendeki en yüksek kademe (0 = yok); have* şart sağlandı mı
  G.evoStatus = function () {
    const r = run();
    if (D.CHAR_BY_ID[r.charId].noWeapons) return [];
    const best = (id) => r.weapons.reduce((m, w) => (w.id === id ? Math.max(m, w.tier) : m), 0);
    return D.EVOLUTIONS.map((ev) => {
      const tierA = best(ev.a);
      const tierB = best(ev.b);
      const haveA = tierA >= D.EVO_MIN_TIER;
      const haveB = tierB >= D.EVO_MIN_TIER;
      const haveItem = (r.items[ev.item] || 0) > 0;
      return { id: ev.id, ev, tierA, tierB, haveA, haveB, haveItem, ready: haveA && haveB && haveItem };
    });
  };

  function takeBest(r, id) {
    let best = -1;
    r.weapons.forEach((w, i) => {
      if (w.id === id && (best < 0 || w.tier > r.weapons[best].tier)) best = i;
    });
    if (best >= 0) r.weapons.splice(best, 1);
  }

  G.evolve = function (id) {
    const r = run();
    const st = G.evoStatus().find((x) => x.id === id);
    if (!st || !st.ready) return false;
    takeBest(r, st.ev.a);
    takeBest(r, st.ev.b);
    r.weapons.push({ id, tier: 4, target: 'near' });
    r.evolved++;
    G.achieve('evolve');
    G.refresh();
    save();
    return true;
  };

  /* ================= Seviye atlama ================= */
  G.getUpgradeOffer = function () {
    const r = run();
    if (!r.upOffer) {
      const s = G.computeStats(r);
      G.reseed('level', r.level - r.pendingLevels, r.upRerolls);
      r.upOffer = S.shuffle(D.UPGRADES.slice())
        .slice(0, 4)
        .map((u) => ({ stat: u.stat, tier: rollTier(sw(), s.luck) }));
    }
    return r.upOffer;
  };

  G.upgradeValue = function (o) {
    return D.UPGRADE_BY_STAT[o.stat].vals[o.tier - 1];
  };

  G.chooseUpgrade = function (i) {
    const r = run();
    const offer = G.getUpgradeOffer();
    const o = offer[i];
    if (!o || r.pendingLevels <= 0) return false;
    r.upgrades[o.stat] = (r.upgrades[o.stat] || 0) + G.upgradeValue(o);
    r.pendingLevels--;
    r.upOffer = null;
    r.upRerolls = 0;
    G.refresh();
    save();
    BR.Audio.play('buy');
    return true;
  };

  G.upgradeRerollCost = function () {
    const n = sw();
    return Math.max(1, Math.floor(n * 0.5)) + run().upRerolls * Math.max(1, Math.floor(n * 0.35));
  };

  G.rerollUpgrades = function () {
    const r = run();
    const cost = G.upgradeRerollCost();
    if (r.materials < cost) return false;
    r.materials -= cost;
    r.upRerolls++;
    r.upOffer = null;
    G.getUpgradeOffer();
    save();
    return true;
  };

  /* ================= Sandıklar ================= */
  G.getCrateOffer = function () {
    const r = run();
    if (!r.crates.length) return null;
    if (!r.crateOffer) {
      const s = G.computeStats(r);
      G.reseed('crate', r.wave, r.crates.length);
      const tier = Math.max(r.crates[0] || 1, rollTier(sw(), s.luck));
      r.crateOffer = { id: randomItemOfTier(r, Math.min(4, tier)).id };
    }
    return r.crateOffer;
  };

  G.recyclePrice = function (id) {
    return Math.max(1, Math.floor(D.price(D.ITEM_BY_ID[id].price, sw()) * 0.35));
  };

  G.takeCrate = function (recycle) {
    const r = run();
    const o = G.getCrateOffer();
    if (!o) return false;
    if (recycle || !itemAllowed(r, D.ITEM_BY_ID[o.id])) r.materials += G.recyclePrice(o.id);
    else G.addItem(r, o.id);
    r.crates.shift();
    r.crateOffer = null;
    G.refresh();
    save();
    return true;
  };

  /* ================= Tohumlar ve faiz ================= */
  G.seedPrice = function (id) {
    return discounted(D.price(D.SEED_BY_ID[id].price, sw()));
  };

  G.plantCheck = function (id) {
    const r = run();
    const sd = D.SEED_BY_ID[id];
    if (!sd) return { ok: false, reason: '' };
    if (r.seeds.length >= D.MAX_SEEDS) return { ok: false, reason: 'Bahçen dolu' };
    const price = G.seedPrice(id);
    if (r.materials < price) return { ok: false, reason: 'Yetersiz malzeme', price };
    return { ok: true, price };
  };

  function plant(r, id) {
    const sd = D.SEED_BY_ID[id];
    const grow = Math.max(1, sd.waves - (G.fx.seedGrow ? 1 : 0));
    r.seeds.push({ id, tier: sd.tier, grow, max: grow });
  }

  G.plantSeed = function (id) {
    const r = run();
    const c = G.plantCheck(id);
    if (!c.ok) return c;
    r.materials -= c.price;
    plant(r, id);
    save();
    return c;
  };

  G.interestCap = function () {
    return 10 + 10 * (G.fx.interest || 0);
  };

  // Her katmanın (dalga ya da dinlenme) sonunda: tohumlar büyür, birikime faiz işler
  G.layerEnd = function () {
    const r = run();
    let harvested = 0;
    r.seeds.forEach((sd) => {
      sd.grow -= 1;
    });
    r.seeds.forEach((sd) => {
      if (sd.grow <= 0) {
        r.crates.push(sd.tier);
        harvested++;
      }
    });
    r.seeds = r.seeds.filter((sd) => sd.grow > 0);
    const interest = Math.min(G.interestCap(), Math.floor(r.materials / 10));
    r.materials += interest;
    r.matsTotal += interest;
    return { interest, harvested };
  };

  /* ================= Rota haritası ================= */
  G.genMap = function (r, from, to) {
    if (!r.map || from === 1) r.map = { layers: {}, edges: {}, max: 0 };
    const map = r.map;
    for (let L = from; L <= to; L++) {
      const nodes = [];
      let count;
      let fixed = null;
      if (L === 1) {
        count = 1;
        fixed = 'normal';
      } else if (D.isBossWave(L)) {
        count = 1;
        fixed = 'boss';
      } else if (D.isEliteWave(L)) {
        count = 2;
        fixed = 'elite';
      } else {
        count = S.int(2, 3);
      }
      for (let i = 0; i < count; i++) {
        let type = fixed;
        if (!type) {
          const opts = [{ v: 'normal', w: 55 }, { v: 'event', w: 22 }];
          if (L >= 4) opts.push({ v: 'elite', w: 12 }, { v: 'rest', w: 11 });
          type = S.weighted(opts);
        }
        let mod = null;
        if (type !== 'rest' && type !== 'boss' && L >= 3 && S.chance(0.45)) mod = S.pick(Object.keys(D.MODIFIERS));
        nodes.push({ id: 'n' + L + '_' + i, layer: L, idx: i, type, mod });
      }
      if (nodes.every((n) => n.type === 'rest')) nodes[0].type = 'normal';
      map.layers[L] = nodes;
    }
    for (let L = Math.max(1, from - 1); L < to; L++) {
      const A = map.layers[L];
      const B = map.layers[L + 1];
      if (!A || !B) continue;
      const a = A.length;
      const b = B.length;
      A.forEach((n, i) => {
        const targets = [];
        if (a === 1) B.forEach((m, j) => targets.push(j));
        else {
          const j0 = Math.round((i * (b - 1)) / (a - 1));
          targets.push(j0);
          if (S.chance(0.45)) {
            const j1 = j0 + (S.chance(0.5) ? 1 : -1);
            if (j1 >= 0 && j1 < b) targets.push(j1);
          }
        }
        targets.sort((x, y) => x - y);
        map.edges[n.id] = targets.map((j) => B[j].id);
      });
      B.forEach((m, j) => {
        if (!A.some((n) => map.edges[n.id].includes(m.id))) {
          const i = a === 1 ? 0 : Math.round((j * (a - 1)) / Math.max(1, b - 1));
          map.edges[A[i].id].push(m.id);
        }
      });
    }
    map.max = Math.max(map.max || 0, to);
  };

  G.mapNode = function (id, r) {
    const rr = r || run();
    const m = /^n(\d+)_(\d+)$/.exec(String(id));
    if (!m || !rr.map || !rr.map.layers[m[1]]) return null;
    return rr.map.layers[m[1]][Number(m[2])] || null;
  };

  G.validMap = function (r) {
    try {
      const map = r.map;
      if (!map || typeof map !== 'object' || !map.layers || !map.edges) return false;
      for (let L = 1; L <= Math.max(D.MAX_WAVE, r.wave); L++) {
        const nodes = map.layers[L];
        if (!Array.isArray(nodes) || !nodes.length) return false;
        if (!nodes.every((n) => n && D.NODE_TYPES[n.type] && (n.mod === null || D.MODIFIERS[n.mod]))) return false;
      }
      return !!G.mapNode(r.pos, r);
    } catch (e) {
      return false;
    }
  };

  // Bir sonraki katmanda seçilebilecek düğümler
  G.mapOptions = function () {
    const r = run();
    const nextL = r.wave + 1;
    if (!r.map.layers[nextL]) {
      G.reseed('map', nextL);
      G.genMap(r, nextL, nextL + 9);
    }
    const cur = G.mapNode(r.pos);
    let opts = [];
    if (cur && cur.layer === r.wave) opts = (r.map.edges[cur.id] || []).map((id) => G.mapNode(id)).filter((n) => n && n.layer === nextL);
    if (!opts.length) opts = r.map.layers[nextL] || [];
    return opts;
  };

  G.openMap = function () {
    const r = run();
    G.state = 'map';
    r.phase = 'map';
    G.mapOptions();
    save();
  };

  function pickEvent(r) {
    let pool = Object.keys(D.EVENTS).filter((id) => !r.seenEvents.includes(id));
    if (!pool.length) {
      r.seenEvents = [];
      pool = Object.keys(D.EVENTS);
    }
    const id = S.pick(pool);
    r.seenEvents.push(id);
    return id;
  }

  // Düğüm seçimi: 'wave' | 'event' | 'rest' döndürür
  G.chooseNode = function (id) {
    const r = run();
    const node = G.mapOptions().find((n) => n.id === id);
    if (!node) return null;
    r.pos = node.id;
    r.node = { type: node.type, mod: node.mod };
    if (node.type === 'event') {
      G.reseed('event', node.layer);
      r.event = { id: pickEvent(r), done: false, result: null };
      r.phase = 'event';
      G.state = 'event';
      save();
      return 'event';
    }
    if (node.type === 'rest') {
      r.phase = 'rest';
      G.state = 'rest';
      save();
      return 'rest';
    }
    G.startNextWave();
    return 'wave';
  };

  /* ================= Olaylar ================= */
  function randTopping() {
    return S.pick(D.TOPPINGS).id;
  }
  function addTopping(r, id, n) {
    r.pantry[id] = (r.pantry[id] || 0) + (n || 1);
  }

  function eventChoices(r) {
    const n = sw();
    const id = r.event && r.event.id;
    const skip = (text) => ({ label: 'Geç', desc: 'Yoluna devam et.', enabled: true, apply: () => text });
    if (id === 'seller') {
      const price = D.price(55, n);
      const full = r.seeds.length >= D.MAX_SEEDS;
      return [
        {
          label: 'Altın tohumu al', desc: price + ' malzeme · 5 dalga sonra efsanevi eşya', enabled: r.materials >= price && !full,
          why: full ? 'Bahçen dolu' : 'Yetersiz malzeme',
          apply() {
            r.materials -= price;
            plant(r, 'golden');
            return 'Altın tohumu bahçene ektin. Dükkandaki Bahçe sekmesinden izleyebilirsin.';
          },
        },
        skip('Tohumcu el sallayarak uzaklaştı.'),
      ];
    }
    if (id === 'box') {
      return [
        {
          label: 'Kutuyu aç', desc: '%50 efsanevi eşya, %50 kalıcı −3 maks. can', enabled: true,
          apply() {
            if (S.chance(0.5)) {
              const it = randomItemOfTier(r, 4);
              G.addItem(r, it.id);
              return 'Kutudan ' + it.name + ' çıktı!';
            }
            r.bonus.maxHp = (r.bonus.maxHp || 0) - 3;
            return 'Kutudan zehirli gaz çıktı: kalıcı −3 maks. can.';
          },
        },
        skip('Kutuyu olduğu yerde bıraktın.'),
      ];
    }
    if (id === 'chef') {
      const cost = 10 + 2 * n;
      return [
        {
          label: 'Ona yardım et', desc: cost + ' malzeme · 5 kumpir malzemesi', enabled: r.materials >= cost, why: 'Yetersiz malzeme',
          apply() {
            r.materials -= cost;
            for (let i = 0; i < 5; i++) addTopping(r, randTopping());
            return 'Kumpirci sana 5 malzeme verdi. Dükkandaki Kumpir sekmesinden doldurabilirsin.';
          },
        },
        {
          label: 'Sadece sohbet et', desc: '1 kumpir malzemesi', enabled: true,
          apply() {
            addTopping(r, randTopping());
            return 'Kumpirci sohbetin hatırına sana bir malzeme verdi.';
          },
        },
      ];
    }
    if (id === 'blood') {
      return [
        {
          label: 'Bağış yap', desc: 'Kalıcı −4 maks. can, kalıcı +%12 hasar', enabled: true,
          apply() {
            r.bonus.maxHp = (r.bonus.maxHp || 0) - 4;
            r.bonus.damage = (r.bonus.damage || 0) + 12;
            return 'Biraz solgunsun ama vuruşların sertleşti.';
          },
        },
        skip('Doktoru geri çevirdin.'),
      ];
    }
    if (id === 'smith') {
      let target = -1;
      r.weapons.forEach((w, i) => {
        if (w.tier < 4 && !D.WEAPON_BY_ID[w.id].evo && (target < 0 || w.tier < r.weapons[target].tier)) target = i;
      });
      const cost = target >= 0 ? Math.max(5, Math.round(G.weaponValue(r.weapons[target]) * 0.6)) : 0;
      const name = target >= 0 ? D.WEAPON_BY_ID[r.weapons[target].id].name : '';
      return [
        {
          label: target >= 0 ? name + ' silahını geliştir' : 'Silahını geliştir',
          desc: target >= 0 ? cost + ' malzeme · bir kademe yükselir' : 'Geliştirilecek silah yok',
          enabled: target >= 0 && r.materials >= cost, why: target < 0 ? 'Uygun silah yok' : 'Yetersiz malzeme',
          apply() {
            r.materials -= cost;
            r.weapons[target].tier += 1;
            return name + ' artık ' + U.ROMAN[r.weapons[target].tier] + '. kademede.';
          },
        },
        skip('Usta omuz silkip örsüne döndü.'),
      ];
    }
    if (id === 'fugitive') {
      const reward = 10 + 3 * n;
      return [
        {
          label: 'Onu sakla', desc: 'Bu dalgada düşmanlar %40 daha sık gelir; sonunda 2 sandık', enabled: true,
          apply() {
            r.waveBonus = { rate: 1.4, crates: 2 };
            return 'Kaçağı sakladın. Peşindekiler gelmek üzere!';
          },
        },
        {
          label: 'İhbar et', desc: '+' + reward + ' malzeme ödül', enabled: true,
          apply() {
            r.materials += reward;
            return 'Ödülü aldın: +' + reward + ' malzeme.';
          },
        },
      ];
    }
    if (id === 'gamble') {
      const bet = Math.floor(r.materials / 2);
      return [
        {
          label: 'Yarısını yatır', desc: bet + ' malzeme · %50 ikiye katla, %50 kaybet', enabled: bet >= 1, why: 'Yatıracak malzemen yok',
          apply() {
            if (S.chance(0.5)) {
              r.materials += bet;
              return 'Kazandın! +' + bet + ' malzeme.';
            }
            r.materials -= bet;
            return 'Kaybettin: −' + bet + ' malzeme.';
          },
        },
        skip('Kertenkele hayal kırıklığıyla zarlarını topladı.'),
      ];
    }
    if (id === 'shrine') {
      const cost = 20;
      return [
        {
          label: 'Dua et', desc: 'Kalıcı +10 şans', enabled: true,
          apply() {
            r.bonus.luck = (r.bonus.luck || 0) + 10;
            return 'İçin rahatladı: +10 şans.';
          },
        },
        {
          label: 'Adak bırak', desc: cost + ' malzeme · dalga sonunda destansı sandık', enabled: r.materials >= cost, why: 'Yetersiz malzeme',
          apply() {
            r.materials -= cost;
            r.crates.push(3);
            return 'Adağın kabul edildi; dalga sonunda bir sandık seni bekliyor.';
          },
        },
      ];
    }
    if (id === 'well') {
      const cost = 15;
      return [
        {
          label: 'Malzeme at', desc: cost + ' malzeme · sonraki dükkanda her şey %20 indirimli', enabled: r.materials >= cost, why: 'Yetersiz malzeme',
          apply() {
            r.materials -= cost;
            r.discountNext = 0.2;
            return 'Dileğin tuttu: sonraki dükkan %20 indirimli.';
          },
        },
        skip('Kuyunun başından uzaklaştın.'),
      ];
    }
    return [skip('')];
  }

  G.eventChoices = function () {
    const r = run();
    return eventChoices(r).map((c) => ({ label: c.label, desc: c.desc, enabled: !!c.enabled, why: c.enabled ? '' : c.why || '' }));
  };

  G.chooseEvent = function (i) {
    const r = run();
    if (!r.event || r.event.done) return null;
    const c = eventChoices(r)[i];
    if (!c || !c.enabled) return null;
    const text = c.apply();
    r.event.done = true;
    r.event.result = text;
    G.refresh();
    if (r.materials >= 500) G.achieve('rich');
    save();
    BR.Audio.play('buy');
    return text;
  };

  /* ================= Dinlenme ================= */
  function restChoices(r) {
    const food = 15 + 4 * sw();
    return [
      {
        label: 'Kestir', desc: '+1 seviye (bir geliştirme seçersin)', enabled: true,
        apply() {
          r.level += 1;
          r.pendingLevels += 1;
          return 'Dinlendin: +1 seviye.';
        },
      },
      {
        label: 'Tohumları sula', desc: 'Bahçendeki tohumlar 1 dalga daha hızlı büyür', enabled: r.seeds.length > 0, why: 'Ekili tohum yok',
        apply() {
          r.seeds.forEach((sd) => {
            sd.grow -= 1;
          });
          return 'Tohumlarını suladın.';
        },
      },
      {
        label: 'Kileri doldur', desc: '4 rastgele kumpir malzemesi', enabled: true,
        apply() {
          for (let i = 0; i < 4; i++) addTopping(r, randTopping());
          return 'Kilere 4 malzeme ekledin.';
        },
      },
      {
        label: 'Erzak topla', desc: '+' + food + ' malzeme', enabled: true,
        apply() {
          r.materials += food;
          r.matsTotal += food;
          return '+' + food + ' malzeme topladın.';
        },
      },
    ];
  }

  G.restChoices = function () {
    return restChoices(run()).map((c) => ({ label: c.label, desc: c.desc, enabled: !!c.enabled, why: c.enabled ? '' : c.why || '' }));
  };

  // Dinlenme katmanı bir dalganın yerini tutar: ödül, sonra katman sonu (tohum, faiz)
  G.chooseRest = function (i) {
    const r = run();
    if (r.phase !== 'rest') return null;
    const c = restChoices(r)[i];
    if (!c || !c.enabled) return null;
    G.reseed('rest', r.wave);
    const text = c.apply();
    r.wave += 1;
    const res = G.layerEnd();
    G.refresh();
    G.state = 'between';
    r.phase = 'between';
    save();
    BR.Audio.play('buy');
    return { text, interest: res.interest, harvested: res.harvested };
  };

  /* ================= Kumpir dolgusu ================= */
  G.pantryTotal = function () {
    const p = run().pantry;
    let n = 0;
    for (const k in p) n += p[k];
    return n;
  };

  G.fillSlot = function (id) {
    const r = run();
    if (r.filling.length >= D.FILLING_SLOTS || !(r.pantry[id] > 0)) return false;
    r.pantry[id]--;
    if (!r.pantry[id]) delete r.pantry[id];
    r.filling.push(id);
    G.refresh();
    if (G.activeRecipes(r).length) G.achieve('recipe');
    save();
    return true;
  };

  G.unfillSlot = function (i) {
    const r = run();
    const id = r.filling[i];
    if (!id) return false;
    r.filling.splice(i, 1);
    addTopping(r, id);
    G.refresh();
    save();
    return true;
  };

  /* ================= Gece tezgahı ================= */
  G.standAvailable = function () {
    const r = run();
    return !!r.stand || (r.standFor !== r.wave && G.pantryTotal() >= 2);
  };

  G.standStart = function () {
    const r = run();
    if (r.stand) return r.stand;
    G.reseed('stand', r.wave);
    const count = Math.min(5, 2 + Math.floor(r.wave / 4));
    const pool = Object.assign({}, r.pantry);
    const queue = [];
    for (let k = 0; k < count; k++) {
      const size = S.int(2, Math.min(4, 2 + Math.floor(r.wave / 6)));
      const order = [];
      for (let j = 0; j < size; j++) {
        const avail = Object.keys(pool).filter((id) => pool[id] > 0);
        let id;
        if (avail.length && !S.chance(0.2)) {
          id = S.pick(avail);
          pool[id]--;
        } else {
          id = randTopping();
        }
        order.push(id);
      }
      const pat = 12 + size * 3;
      queue.push({ order, patience: pat, max: pat });
    }
    r.stand = { queue, idx: 0, plate: [], served: 0, earned: 0 };
    save();
    return r.stand;
  };

  G.standCurrent = function () {
    const st = run().stand;
    return st && st.idx < st.queue.length ? st.queue[st.idx] : null;
  };

  G.standAdd = function (id) {
    const r = run();
    const st = r.stand;
    if (!st || !(r.pantry[id] > 0) || st.plate.length >= 6 || !G.standCurrent()) return false;
    r.pantry[id]--;
    if (!r.pantry[id]) delete r.pantry[id];
    st.plate.push(id);
    return true;
  };

  G.standUndo = function () {
    const r = run();
    const st = r.stand;
    if (!st || !st.plate.length) return false;
    addTopping(r, st.plate.pop());
    return true;
  };

  G.standClear = function () {
    const r = run();
    const st = r.stand;
    if (!st) return;
    st.plate.forEach((id) => addTopping(r, id));
    st.plate = [];
  };

  G.toppingPrice = function (id) {
    return Math.round(D.TOPPING_BY_ID[id].price * (1 + 0.1 * run().wave));
  };

  G.standServe = function () {
    const r = run();
    const st = r.stand;
    const cust = G.standCurrent();
    if (!st || !cust) return { ok: false, reason: 'Müşteri yok' };
    const a = st.plate.slice().sort().join(',');
    const b = cust.order.slice().sort().join(',');
    if (a !== b) return { ok: false, reason: 'Sipariş tutmuyor' };
    let pay = 0;
    cust.order.forEach((id) => {
      pay += G.toppingPrice(id);
    });
    const tip = Math.ceil(Math.max(0, cust.patience) * 0.5);
    pay += tip;
    r.materials += pay;
    r.matsTotal += pay;
    st.earned += pay;
    st.served++;
    r.standServed++;
    st.plate = [];
    st.idx++;
    if (r.standServed >= 5) G.achieve('stand5');
    if (r.materials >= 500) G.achieve('rich');
    save();
    return { ok: true, pay, tip };
  };

  G.standSkip = function () {
    const st = run().stand;
    if (!st || !G.standCurrent()) return false;
    st.idx++;
    return true;
  };

  // Sabır süresi; müşteri giderse 'left' döner
  G.standTick = function (dt) {
    const cust = G.standCurrent();
    if (!cust) return 'done';
    cust.patience -= dt;
    if (cust.patience <= 0) {
      run().stand.idx++;
      return 'left';
    }
    return null;
  };

  G.standClose = function () {
    const r = run();
    G.standClear();
    const st = r.stand;
    r.stand = null;
    r.standFor = r.wave;
    save();
    return st ? { served: st.served, earned: st.earned } : { served: 0, earned: 0 };
  };
})((window.BR = window.BR || {}));
