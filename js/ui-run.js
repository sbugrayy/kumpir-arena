/* Kumpir Arena - dalga arası ekranları: seviye, sandık, gece tezgahı, dükkan (sekmeler),
   rota haritası, olay ve dinlenme */
(function (BR) {
  'use strict';

  const U = BR.U;
  const D = BR.DATA;
  const G = BR.Game;
  const R = BR.Render;
  const UI = BR.UI;
  const h = UI.h;
  const el = h.el;
  const $ = (id) => document.getElementById(id);

  /* ================= Akış ================= */
  UI.nextBetweenStep = function () {
    const run = G.run;
    if (run.pendingLevels > 0) showLevelUp();
    else if (run.crates.length > 0) showCrate();
    else if (G.standAvailable()) showStand();
    else {
      G.enterShop();
      showShop();
    }
  };

  UI.resumePhase = function (phase) {
    if (phase === 'shop') {
      G.enterShop();
      showShop();
    } else if (phase === 'map') showMap();
    else if (phase === 'event') showEvent();
    else if (phase === 'rest') showRest();
    else UI.nextBetweenStep();
  };

  /* ================= Seviye atlama ================= */
  function showLevelUp() {
    const run = G.run;
    const offer = G.getUpgradeOffer();
    $('lvl-sub').textContent = run.pendingLevels > 1 ? run.pendingLevels + ' seçim kaldı' : 'Son seçim';
    const grid = $('lvl-cards');
    grid.innerHTML = '';
    offer.forEach((o, i) => {
      const up = D.UPGRADE_BY_STAT[o.stat];
      const card = el('button', 'card upgrade-card tier-' + o.tier);
      const ic = h.canvasEl('ico');
      R.statIcon(ic, o.stat, 40);
      const st = {};
      st[o.stat] = G.upgradeValue(o);
      const top = h.cardTop(ic, up.name + ' ' + U.ROMAN[o.tier], D.TIERS[o.tier].name);
      top.append(h.tierPips(o.tier));
      card.append(top, h.statLines(st), el('span', 'key-hint', String(i + 1)));
      card.addEventListener('click', () => UI.chooseUpgrade(i));
      grid.append(card);
    });
    const cost = G.upgradeRerollCost();
    const rb = $('lvl-reroll');
    rb.textContent = 'Yenile · ' + cost;
    rb.disabled = run.materials < cost;
    $('lvl-mats').textContent = run.materials;
    h.renderStats($('lvl-stats'));
    if (UI.current !== 'levelup') UI.show('levelup');
    UI.shownAt = performance.now();
  }

  UI.chooseUpgrade = function (i) {
    if (UI.current !== 'levelup' || h.freshlyShown()) return;
    if (G.chooseUpgrade(i)) UI.nextBetweenStep();
  };

  /* ================= Sandık ================= */
  function showCrate() {
    const run = G.run;
    const o = G.getCrateOffer();
    const it = D.ITEM_BY_ID[o.id];
    $('crate-sub').textContent = run.crates.length > 1 ? run.crates.length + ' sandık açılacak' : 'Son sandık';
    const box = $('crate-card');
    box.innerHTML = '';
    box.append(h.itemCard(it));
    const allowed = G.itemAllowed(run, it);
    $('crate-take').disabled = !allowed;
    $('crate-take').textContent = allowed ? 'Al' : 'Sınır dolu';
    $('crate-recycle').textContent = 'Geri Dönüştür (+' + G.recyclePrice(o.id) + ')';
    UI.show('crate');
    h.sfx('crate');
  }

  /* ================= Gece tezgahı ================= */
  let standTimer = 0;
  let standLast = 0;

  function toppingChip(id, extra) {
    const tp = D.TOPPING_BY_ID[id];
    const chip = el('span', 'top-chip');
    const ic = h.canvasEl('ico-top');
    R.toppingIcon(ic, id, 24);
    chip.append(ic, el('span', null, tp.name + (extra || '')));
    return chip;
  }

  function showStand() {
    G.standStart();
    renderStand();
    UI.show('stand');
    clearInterval(standTimer);
    standLast = performance.now();
    standTimer = setInterval(() => {
      if (UI.current !== 'stand' || !G.run || !G.run.stand) {
        clearInterval(standTimer);
        return;
      }
      const now = performance.now();
      const dt = Math.min(0.5, (now - standLast) / 1000);
      standLast = now;
      const r = G.standTick(dt);
      if (r === 'left') {
        h.toast('Müşteri sabredemeyip gitti');
        h.sfx('error');
        renderStand();
      } else if (!r) {
        updatePatience();
      }
    }, 100);
  }

  function updatePatience() {
    const cust = G.standCurrent();
    const bar = $('stand-patience');
    if (cust && bar) bar.style.transform = 'scaleX(' + U.clamp(cust.patience / cust.max, 0, 1).toFixed(3) + ')';
  }

  function renderStand() {
    const run = G.run;
    const st = run.stand;
    if (!st) return;
    const cust = G.standCurrent();
    $('stand-sub').textContent = 'Müşteri ' + Math.min(st.idx + 1, st.queue.length) + ' / ' + st.queue.length;
    const cbox = $('stand-customer');
    cbox.innerHTML = '';
    if (cust) {
      const head = el('div', 'cust-head');
      const pic = h.canvasEl('ico');
      R.potatoIcon(pic, D.CHARACTERS[(st.idx * 3 + 1) % 6].id, 48);
      head.append(pic, el('b', null, 'Sipariş: ' + cust.order.length + ' malzemeli kumpir'));
      const order = el('div', 'order');
      cust.order.forEach((id) => order.append(toppingChip(id)));
      const pat = el('div', 'bar bar-patience');
      const fill = el('div', 'bar-fill');
      fill.id = 'stand-patience';
      pat.append(fill, el('span', 'bar-text', 'Sabır'));
      cbox.append(head, order, pat);
    } else {
      cbox.append(el('p', 'stand-done', 'Bu gecelik müşteri kalmadı. Tezgahı kapatıp dükkana geçebilirsin.'));
    }
    updatePatience();
    const plate = $('stand-plate');
    plate.innerHTML = '';
    if (!st.plate.length) plate.append(el('span', 'muted', 'Boş. Kilerden malzemeye tıklayıp tabağa koy.'));
    st.plate.forEach((id) => plate.append(toppingChip(id)));
    $('stand-serve').disabled = !cust || !st.plate.length;
    $('stand-undo').disabled = !st.plate.length;
    $('stand-clear').disabled = !st.plate.length;
    $('stand-skip').disabled = !cust;
    const pantry = $('stand-pantry');
    pantry.innerHTML = '';
    const ids = D.TOPPINGS.map((t) => t.id).filter((id) => run.pantry[id] > 0);
    if (!ids.length) pantry.append(el('p', 'muted empty-note', 'Kilerin boş.'));
    ids.forEach((id) => {
      const b = el('button', 'top-btn');
      b.append(toppingChip(id, ' ×' + run.pantry[id]));
      b.title = 'Tabağa koy · satış değeri ' + G.toppingPrice(id);
      b.disabled = !cust;
      b.addEventListener('click', () => {
        if (G.standAdd(id)) h.sfx('click');
        renderStand();
      });
      pantry.append(b);
    });
    $('stand-earned').textContent = 'Bu gece: ' + st.served + ' servis · +' + st.earned + ' malzeme';
  }
  UI.renderStand = renderStand;

  /* ================= Dükkan ================= */
  UI.shopTab = 'inv';

  function showShop() {
    UI.renderShop();
    UI.show('shop');
  }

  function offerCard(o, i) {
    const s = G.stats;
    const card = o.kind === 'weapon' ? h.weaponCard(D.WEAPON_BY_ID[o.id], o.tier, s, 'div') : h.itemCard(D.ITEM_BY_ID[o.id]);
    card.classList.add('offer');
    if (o.locked) card.classList.add('locked');
    const chk = G.buyCheck(o);
    if (chk.merge !== undefined) card.append(el('p', 'card-note good', 'Yuvalar dolu: elindeki aynı silahla birleşir.'));
    else if (!chk.ok && (chk.reason === 'Silah yuvaları dolu' || chk.maxed)) card.append(el('p', 'card-note bad', chk.reason + '.'));
    const actions = el('div', 'card-actions');
    const buy = el('button', 'btn btn-buy' + (G.run.materials < chk.price ? ' cant' : ''));
    buy.append(h.matIcon(), document.createTextNode(String(chk.price)));
    buy.setAttribute('aria-label', 'Satın al, ' + chk.price + ' malzeme');
    buy.disabled = !chk.ok;
    if (!chk.ok && chk.reason) buy.title = chk.reason;
    buy.addEventListener('click', () => {
      const r = G.buy(i);
      if (r.ok) {
        h.sfx('buy');
        UI.renderShop();
      } else {
        h.sfx('error');
        h.toast(r.reason);
      }
    });
    const lock = el('button', 'btn btn-lock' + (o.locked ? ' on' : ''), o.locked ? 'Kilitli' : 'Kilitle');
    lock.setAttribute('aria-pressed', o.locked ? 'true' : 'false');
    lock.title = 'Kilitli teklif sonraki dükkanda da kalır';
    lock.addEventListener('click', () => {
      G.toggleLock(i);
      h.sfx('click');
      UI.renderShop();
    });
    actions.append(buy, lock);
    card.append(actions);
    return card;
  }

  UI.renderShop = function () {
    const run = G.run;
    $('shop-wave').textContent = 'Sıradaki dalga: ' + (run.wave + 1) + (run.endless ? ' · sonsuz mod' : ' / ' + D.MAX_WAVE);
    $('shop-mats').textContent = run.materials;
    const disc = $('shop-discount');
    disc.hidden = !(run.discount > 0);
    disc.textContent = '%' + Math.round(run.discount * 100) + ' indirim';
    const rc = G.rerollCost();
    const rb = $('shop-reroll');
    rb.textContent = 'Yenile · ' + rc;
    rb.disabled = run.materials < rc;
    const grid = $('shop-offers');
    grid.innerHTML = '';
    run.shop.forEach((o, i) => {
      if (o) grid.append(offerCard(o, i));
      else {
        const sold = el('div', 'card sold');
        sold.append(el('span', null, 'Satın alındı'));
        grid.append(sold);
      }
    });
    ['inv', 'kumpir', 'garden', 'evo'].forEach((t) => {
      $('tab-' + t).setAttribute('aria-selected', UI.shopTab === t ? 'true' : 'false');
      $('pane-' + t).hidden = UI.shopTab !== t;
    });
    const evoReady = G.evoStatus().some((e) => e.ready);
    $('tab-evo').classList.toggle('dot', evoReady);
    $('tab-kumpir').classList.toggle('dot', G.pantryTotal() > 0 && run.filling.length < D.FILLING_SLOTS);
    if (UI.shopTab === 'inv') renderInventory();
    else if (UI.shopTab === 'kumpir') renderKumpir();
    else if (UI.shopTab === 'garden') renderGarden();
    else renderEvo();
    $('shop-go').textContent = 'Haritaya Git';
    h.renderStats($('shop-stats'));
  };

  function renderInventory() {
    const run = G.run;
    h.renderWeaponSlots($('shop-weapons'), 'shop');
    $('shop-wcount').textContent = D.CHAR_BY_ID[run.charId].noWeapons ? '' : run.weapons.length + ' / ' + D.MAX_WEAPONS;
    h.renderSets($('shop-sets'));
    const total = h.renderItems($('shop-items'));
    $('shop-icount').textContent = total ? total + ' tane' : '';
  }

  function recipeBonus(r) {
    if (r.desc) return r.desc;
    return Object.keys(r.stats).map((k) => h.fmtStat(k, r.stats[k], true) + ' ' + D.STAT_BY_KEY[k].name).join(', ');
  }

  function renderKumpir() {
    const run = G.run;
    const pane = $('pane-kumpir');
    pane.innerHTML = '';
    const head = el('div', 'kumpir-head');
    const pic = h.canvasEl('ico ico-lg');
    R.potatoIcon(pic, run.charId, 72, { stage: 3, toppings: run.filling });
    const txt = el('div');
    txt.append(el('h3', null, 'Kumpirin'), el('p', 'note', 'Kilerdeki malzemeleri 4 yuvaya koy. Her malzeme küçük bir bonus verir; doğru karışımlar tarif bonusunu açar. Yuvadaki malzemeye tıklarsan kilere geri döner.'));
    head.append(pic, txt);
    pane.append(head);
    const slots = el('div', 'fill-slots');
    for (let i = 0; i < D.FILLING_SLOTS; i++) {
      const id = run.filling[i];
      if (!id) {
        slots.append(el('div', 'fill-slot empty', 'Boş yuva'));
        continue;
      }
      const tp = D.TOPPING_BY_ID[id];
      const b = el('button', 'fill-slot');
      b.append(toppingChip(id), h.statLines(tp.stats));
      b.title = 'Kilere geri koy';
      b.addEventListener('click', () => {
        G.unfillSlot(i);
        h.sfx('click');
        UI.renderShop();
      });
      slots.append(b);
    }
    pane.append(slots);
    pane.append(el('div', 'inv-head', null));
    pane.lastChild.append(el('h3', null, 'Kiler'), el('span', 'muted', G.pantryTotal() + ' malzeme'));
    const pantry = el('div', 'pantry');
    const ids = D.TOPPINGS.map((t) => t.id).filter((id) => run.pantry[id] > 0);
    if (!ids.length) pantry.append(el('p', 'muted empty-note', 'Kilerin boş. Düşmanlardan ve ağaçlardan kumpir malzemesi düşer.'));
    ids.forEach((id) => {
      const tp = D.TOPPING_BY_ID[id];
      const b = el('button', 'top-btn');
      b.append(toppingChip(id, ' ×' + run.pantry[id]));
      const k = Object.keys(tp.stats)[0];
      b.title = tp.name + ': ' + h.fmtStat(k, tp.stats[k], true) + ' ' + D.STAT_BY_KEY[k].name;
      b.disabled = run.filling.length >= D.FILLING_SLOTS;
      b.addEventListener('click', () => {
        if (G.fillSlot(id)) h.sfx('topping');
        UI.renderShop();
      });
      pantry.append(b);
    });
    pane.append(pantry);
    pane.append(el('h3', null, 'Tarifler'));
    const active = G.activeRecipes(run);
    const list = el('div', 'recipes');
    D.RECIPES.forEach((r) => {
      const on = active.includes(r.id);
      const card = el('div', 'recipe' + (on ? ' on' : ''));
      card.append(el('b', null, (on ? '✓ ' : '') + r.name));
      const needs = el('div', 'needs');
      r.needs.forEach((id) => {
        const chip = toppingChip(id);
        if (run.filling.includes(id)) chip.classList.add('have');
        needs.append(chip);
      });
      card.append(needs, el('span', 'recipe-bonus', recipeBonus(r)));
      list.append(card);
    });
    pane.append(list);
  }

  function renderGarden() {
    const run = G.run;
    const pane = $('pane-garden');
    pane.innerHTML = '';
    pane.append(el('h3', null, 'Bahçe'));
    pane.append(el('p', 'note', 'Tohum ek; birkaç dalga sonra olgunlaşır ve bedava eşya sandığı verir. Aynı anda en fazla ' + D.MAX_SEEDS + ' tohum.'));
    const planted = el('div', 'seeds');
    if (!run.seeds.length) planted.append(el('p', 'muted empty-note', 'Bahçende tohum yok.'));
    run.seeds.forEach((sd) => {
      const def = D.SEED_BY_ID[sd.id] || D.SEEDS[0];
      const card = el('div', 'seed tier-' + sd.tier);
      const prog = el('div', 'bar bar-seed');
      const fill = el('div', 'bar-fill');
      const max = sd.max || def.waves;
      fill.style.transform = 'scaleX(' + U.clamp(1 - sd.grow / max, 0.05, 1).toFixed(3) + ')';
      prog.append(fill, el('span', 'bar-text', sd.grow + ' dalga kaldı'));
      card.append(el('b', null, def.name), el('span', 'muted', D.TIERS[sd.tier].name + ' sandık verecek'), prog);
      planted.append(card);
    });
    pane.append(planted);
    const shop = el('div', 'card-grid seed-grid');
    D.SEEDS.forEach((sd) => {
      const chk = G.plantCheck(sd.id);
      const card = el('div', 'card tier-' + sd.tier);
      card.append(el('div', 'card-name', sd.name), el('p', 'card-desc', Math.max(1, sd.waves - (G.fx.seedGrow ? 1 : 0)) + ' dalga sonra ' + D.TIERS[sd.tier].name.toLocaleLowerCase('tr-TR') + ' ya da daha iyi bir eşya'));
      const b = el('button', 'btn btn-buy' + (run.materials < G.seedPrice(sd.id) ? ' cant' : ''));
      b.append(h.matIcon(), document.createTextNode(String(G.seedPrice(sd.id))));
      b.setAttribute('aria-label', sd.name + ' ek, ' + G.seedPrice(sd.id) + ' malzeme');
      b.disabled = !chk.ok;
      if (!chk.ok) b.title = chk.reason;
      b.addEventListener('click', () => {
        const r = G.plantSeed(sd.id);
        if (r.ok) {
          h.sfx('buy');
          h.toast(sd.name + ' ekildi');
        } else {
          h.sfx('error');
          h.toast(r.reason);
        }
        UI.renderShop();
      });
      const act = el('div', 'card-actions');
      act.append(b);
      card.append(act);
      shop.append(card);
    });
    pane.append(shop);
    const cap = G.interestCap();
    const now = Math.min(cap, Math.floor(run.materials / 10));
    pane.append(el('p', 'note interest', 'Faiz: dalga sonunda elinde kalan her 10 malzeme için +1 (en fazla ' + cap + '). Şu anki birikimle: +' + now + '.'));
  }

  function renderEvo() {
    const run = G.run;
    const pane = $('pane-evo');
    pane.innerHTML = '';
    pane.append(el('h3', null, 'Silah Evrimi'));
    const list = G.evoStatus();
    if (!list.length) {
      pane.append(el('p', 'muted empty-note', 'Bu karakter silah taşımadığı için evrim yapamaz.'));
      return;
    }
    pane.append(el('p', 'note', 'Aşağıdaki iki silah ve katalizör eşya sende olunca evrimleştirebilirsin. İki silah tek bir efsanevi silaha dönüşür; eşya sende kalır.'));
    const grid = el('div', 'card-grid evo-grid');
    list.forEach((st) => {
      const def = D.WEAPON_BY_ID[st.id];
      const card = el('div', 'card tier-evo evo' + (st.ready ? ' ready' : ''));
      const ic = h.canvasEl('ico');
      R.weaponIcon(ic, def.id, 4, 48);
      card.append(h.cardTop(ic, def.name, 'Evrim silahı'));
      card.append(el('p', 'card-note', def.desc));
      const needs = el('ul', 'evo-needs');
      const need = (ok, text) => needs.append(el('li', ok ? 'have' : 'miss', (ok ? '✓ ' : '✗ ') + text));
      need(st.haveA, D.WEAPON_BY_ID[st.ev.a].name);
      need(st.haveB, D.WEAPON_BY_ID[st.ev.b].name);
      need(st.haveItem, D.ITEM_BY_ID[st.ev.item].name + ' (eşya)');
      card.append(needs);
      const b = el('button', 'btn btn-primary', 'Evrimleştir');
      b.disabled = !st.ready;
      b.addEventListener('click', () => {
        if (G.evolve(st.id)) {
          h.sfx('achieve');
          h.toast(def.name + ' hazır!');
          UI.shopTab = 'inv';
          UI.renderShop();
        }
      });
      const act = el('div', 'card-actions');
      act.append(b);
      card.append(act);
      grid.append(card);
    });
    pane.append(grid);
    if (!run.weapons.length) pane.append(el('p', 'muted', 'Silahın yok.'));
  }

  /* ================= Rota haritası ================= */
  const ROW = 86;

  function showMap() {
    G.openMap();
    UI.show('map');
    renderMap();
  }
  UI.showMap = showMap;

  UI.backToShop = function () {
    G.enterShop();
    showShop();
  };

  function nodeLabel(n) {
    const t = D.NODE_TYPES[n.type].name;
    return n.mod ? t + ' · ' + D.MODIFIERS[n.mod].name : t;
  }

  function renderMap() {
    const run = G.run;
    const opts = G.mapOptions();
    const optIds = opts.map((n) => n.id);
    const from = Math.max(1, run.wave);
    const to = Math.min(run.map.max, run.wave + 6);
    const layers = [];
    for (let L = from; L <= to; L++) layers.push(L);
    // genişlik kutuya göre (dar ekranda düğümler üst üste binmesin), satır yüksekliği sabit
    const MAP_W = U.clamp($('map-box').clientWidth || 600, 260, 600);
    const H = layers.length * ROW + 30;
    const pos = (n) => {
      const count = run.map.layers[n.layer].length;
      return { x: ((n.idx + 1) / (count + 1)) * MAP_W, y: (to - n.layer) * ROW + 50 };
    };
    $('map-sub').textContent = 'Sıradaki: ' + (run.wave + 1) + (run.endless ? '' : ' / ' + D.MAX_WAVE);
    const cv = $('map-canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(MAP_W * dpr);
    cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, MAP_W, H);
    ctx.font = '13px "Nunito", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    // katman numaraları
    layers.forEach((L) => {
      ctx.fillStyle = 'rgba(185,166,143,0.75)';
      ctx.fillText(String(L), 8, (to - L) * ROW + 50);
    });
    // kenarlar
    layers.forEach((L) => {
      if (L >= to) return;
      run.map.layers[L].forEach((n) => {
        (run.map.edges[n.id] || []).forEach((tid) => {
          const m = G.mapNode(tid);
          if (!m) return;
          const a = pos(n);
          const b = pos(m);
          const live = n.id === run.pos && optIds.includes(m.id);
          ctx.strokeStyle = live ? '#eaa94e' : 'rgba(185,166,143,0.35)';
          ctx.lineWidth = live ? 4 : 2;
          ctx.setLineDash(live ? [] : [6, 6]);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        });
      });
    });
    ctx.setLineDash([]);
    const box = $('map-nodes');
    box.innerHTML = '';
    layers.forEach((L) => {
      run.map.layers[L].forEach((n) => {
        const p = pos(n);
        const selectable = optIds.includes(n.id);
        const current = n.id === run.pos;
        const node = el(selectable ? 'button' : 'div', 'map-node' + (selectable ? ' pick' : '') + (current ? ' here' : '') + (L <= run.wave && !current ? ' past' : ''));
        node.style.left = ((p.x / MAP_W) * 100).toFixed(2) + '%';
        node.style.top = ((p.y / H) * 100).toFixed(2) + '%';
        const ic = h.canvasEl('node-ico');
        R.nodeIcon(ic, n.type, 38);
        node.append(ic);
        if (n.mod) node.append(el('span', 'node-mod', D.MODIFIERS[n.mod].name));
        if (current) node.append(el('span', 'node-here', 'Buradasın'));
        const label = 'Dalga ' + n.layer + ': ' + nodeLabel(n);
        node.title = label;
        node.setAttribute('aria-label', label);
        if (selectable) node.addEventListener('click', () => chooseNode(n.id));
        box.append(node);
      });
    });
    $('map-box').style.height = H + 'px';
    const info = $('map-info');
    info.innerHTML = '';
    opts.forEach((n) => {
      const card = el('button', 'map-opt');
      card.append(el('b', null, 'Dalga ' + n.layer + ' · ' + D.NODE_TYPES[n.type].name), el('span', null, D.NODE_TYPES[n.type].desc));
      if (n.mod) card.append(el('span', 'mod-desc', D.MODIFIERS[n.mod].name + ': ' + D.MODIFIERS[n.mod].desc));
      card.addEventListener('click', () => chooseNode(n.id));
      info.append(card);
    });
  }

  function chooseNode(id) {
    if (h.freshlyShown()) return;
    const res = G.chooseNode(id);
    h.sfx('click');
    if (res === 'event') showEvent();
    else if (res === 'rest') showRest();
  }

  /* ================= Olay ================= */
  function showEvent() {
    const run = G.run;
    const ev = D.EVENTS[run.event.id];
    $('event-title').textContent = ev.title;
    $('event-sub').textContent = 'Dalga ' + (run.wave + 1) + ' öncesi';
    $('event-text').textContent = ev.text;
    const box = $('event-choices');
    box.innerHTML = '';
    const done = !!run.event.done;
    if (!done) {
      G.eventChoices().forEach((c, i) => {
        const b = el('button', 'choice');
        b.append(el('b', null, c.label), el('span', null, c.desc));
        if (!c.enabled) {
          b.disabled = true;
          if (c.why) b.append(el('span', 'why', c.why));
        }
        b.addEventListener('click', () => {
          if (h.freshlyShown()) return;
          const text = G.chooseEvent(i);
          if (text !== null) showEvent();
        });
        box.append(b);
      });
    }
    box.hidden = done;
    $('event-result').hidden = !done;
    $('event-result').textContent = done ? run.event.result || '' : '';
    $('event-go').hidden = !done;
    if (UI.current !== 'event') UI.show('event');
    UI.shownAt = performance.now();
  }

  /* ================= Dinlenme ================= */
  function showRest() {
    const run = G.run;
    $('rest-sub').textContent = 'Dalga ' + (run.wave + 1);
    const box = $('rest-choices');
    box.innerHTML = '';
    G.restChoices().forEach((c, i) => {
      const b = el('button', 'choice');
      b.append(el('b', null, c.label), el('span', null, c.desc));
      if (!c.enabled) {
        b.disabled = true;
        if (c.why) b.append(el('span', 'why', c.why));
      }
      b.addEventListener('click', () => {
        if (h.freshlyShown()) return;
        const r = G.chooseRest(i);
        if (!r) return;
        let msg = r.text;
        if (r.interest) msg += ' · +' + r.interest + ' faiz';
        if (r.harvested) msg += ' · tohum hasadı!';
        h.toast(msg);
        UI.nextBetweenStep();
      });
      box.append(b);
    });
    UI.show('rest');
  }

  /* ================= Bağlantılar ================= */
  $('lvl-reroll').addEventListener('click', () => {
    if (G.rerollUpgrades()) {
      h.sfx('click');
      showLevelUp();
    } else {
      h.sfx('error');
      h.toast('Yetersiz malzeme');
    }
  });
  $('crate-take').addEventListener('click', () => {
    if (UI.current !== 'crate' || h.freshlyShown()) return;
    if (G.takeCrate(false)) h.sfx('buy');
    UI.nextBetweenStep();
  });
  $('crate-recycle').addEventListener('click', () => {
    if (UI.current !== 'crate' || h.freshlyShown()) return;
    if (G.takeCrate(true)) h.sfx('coin');
    UI.nextBetweenStep();
  });
  $('stand-serve').addEventListener('click', () => {
    const r = G.standServe();
    if (r.ok) {
      h.sfx('coin');
      h.toast('+' + r.pay + ' malzeme' + (r.tip ? ' (bahşiş ' + r.tip + ')' : ''));
    } else {
      h.sfx('error');
      h.toast(r.reason);
    }
    renderStand();
  });
  $('stand-undo').addEventListener('click', () => {
    G.standUndo();
    renderStand();
  });
  $('stand-clear').addEventListener('click', () => {
    G.standClear();
    renderStand();
  });
  $('stand-skip').addEventListener('click', () => {
    G.standSkip();
    renderStand();
  });
  $('stand-close').addEventListener('click', () => {
    clearInterval(standTimer);
    const r = G.standClose();
    if (r.served) h.toast('Tezgah kapandı: ' + r.served + ' servis, +' + r.earned + ' malzeme');
    UI.nextBetweenStep();
  });
  $('shop-reroll').addEventListener('click', () => {
    if (G.reroll()) {
      h.sfx('click');
      UI.renderShop();
    } else {
      h.sfx('error');
      h.toast('Yetersiz malzeme');
    }
  });
  ['inv', 'kumpir', 'garden', 'evo'].forEach((t) => {
    $('tab-' + t).addEventListener('click', () => {
      UI.shopTab = t;
      h.sfx('click');
      UI.renderShop();
    });
  });
  $('shop-go').addEventListener('click', () => {
    h.sfx('click');
    showMap();
  });
  $('map-back').addEventListener('click', () => UI.backToShop());
  window.addEventListener('resize', () => {
    if (UI.current === 'map' && G.state === 'map') renderMap();
  });
  $('event-go').addEventListener('click', () => {
    if (G.state !== 'event' || h.freshlyShown()) return;
    h.sfx('click');
    G.startNextWave();
  });
})((window.BR = window.BR || {}));
