/* Kumpir Arena - menüler, dükkan, seviye atlama ve gösterge paneli */
(function (BR) {
  'use strict';

  const U = BR.U;
  const D = BR.DATA;
  const G = BR.Game;
  const R = BR.Render;
  const $ = (id) => document.getElementById(id);

  const SCREENS = ['menu', 'char', 'weapon', 'danger', 'levelup', 'crate', 'shop', 'pause', 'end', 'help', 'settings'];
  const MINUS = '−';

  const UI = {
    current: null,
    prev: 'menu',
    sel: { charId: null, weaponId: null },
    hud: {},
    shownAt: 0, // çift tıklamaların yanlışlıkla ikinci seçimi yapmasını önlemek için
    bannerTimer: 0,
    toastTimer: 0,
  };

  function sfx(name) {
    BR.Audio.play(name);
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    if (tag === 'button') e.type = 'button';
    return e;
  }

  function canvasEl(cls) {
    const c = document.createElement('canvas');
    c.className = cls || 'ico';
    c.setAttribute('aria-hidden', 'true');
    return c;
  }

  function matIcon() {
    const s = el('span', 'mat-ico');
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  function freshlyShown() {
    return performance.now() - UI.shownAt < 250;
  }

  function blurActive() {
    const a = document.activeElement;
    if (a && typeof a.blur === 'function') a.blur();
  }

  /* ---------- Ekran yönetimi ---------- */
  UI.show = function (name) {
    SCREENS.forEach((s) => {
      $('scr-' + s).hidden = s !== name;
    });
    $('screens').classList.toggle('active', !!name);
    UI.current = name;
    $('hud').hidden = G.state !== 'wave';
    closeModal();
    if (name) {
      const scr = $('scr-' + name);
      scr.scrollTop = 0;
    }
  };

  /* ---------- Biçimlendirme ---------- */
  function fmtStat(key, v, signed) {
    const st = D.STAT_BY_KEY[key];
    const n = U.round1(v);
    const abs = Math.abs(n);
    let sign = '';
    if (n < 0) sign = MINUS;
    else if (signed && n > 0) sign = '+';
    return sign + (st && st.pct ? '%' : '') + abs;
  }

  function statLines(stats) {
    const ul = el('ul', 'stat-lines');
    Object.keys(stats).forEach((k) => {
      const v = stats[k];
      const st = D.STAT_BY_KEY[k];
      if (!st) return;
      const li = el('li', v > 0 ? 'pos' : v < 0 ? 'neg' : '');
      li.append(el('b', null, fmtStat(k, v, true)), document.createTextNode(' ' + st.name));
      ul.append(li);
    });
    return ul;
  }

  function cardTop(icon, name, kind) {
    const top = el('div', 'card-top');
    const tt = el('div', 'card-titles');
    tt.append(el('div', 'card-name', name), el('div', 'card-kind', kind));
    top.append(icon, tt);
    return top;
  }

  function weaponLines(def, tier, s) {
    const C = G.Calc;
    const rows = [];
    const scaleTxt = Object.keys(def.scale)
      .map((k) => '%' + Math.round(def.scale[k] * 100) + ' ' + (D.STAT_BY_KEY[k].short || D.STAT_BY_KEY[k].name))
      .join(', ');
    rows.push(['Hasar', String(Math.round(C.weaponDamage(def, tier, s))), 'taban ' + def.dmg[tier - 1] + ' + ' + scaleTxt]);
    if (def.proj) rows.push(['Mermi', def.proj[tier - 1] + ' adet']);
    rows.push(['Kritik', '×' + def.critMult + ' · %' + Math.round(C.critChance(s, def) * 100)]);
    rows.push(['Bekleme', C.weaponCd(def, tier, s).toFixed(2) + ' sn']);
    rows.push(['Menzil', String(Math.round(C.weaponRange(def, s)))]);
    if (def.pierce && def.pierce[tier - 1]) rows.push(['Delme', def.pierce[tier - 1] + ' düşman']);
    if (def.burn) rows.push(['Yanma', Math.round(C.burnDamage(def, tier, s)) + ' × 5 tık']);
    if (def.explode) rows.push(['Patlama', def.explode[tier - 1] + ' yarıçap']);
    if (def.turret) rows.push(['Taret', 'Her dalga ' + U.ROMAN[tier] + '. kademe taret kurar']);
    const dl = el('dl', 'weapon-lines');
    rows.forEach((r) => {
      const row = el('div', 'wl-row');
      const dd = el('dd', null, r[1]);
      if (r[2]) dd.append(el('small', null, r[2]));
      row.append(el('dt', null, r[0]), dd);
      dl.append(row);
    });
    return dl;
  }

  function weaponCard(def, tier, s, tag) {
    const card = el(tag || 'div', 'card weapon-card tier-' + tier);
    const ic = canvasEl('ico');
    R.weaponIcon(ic, def.id, tier, 48);
    const kind = 'Silah · ' + (def.type === 'melee' ? 'Yakın dövüş' : 'Menzilli');
    card.append(cardTop(ic, def.name + ' ' + U.ROMAN[tier], kind));
    const tags = el('div', 'tags');
    def.cls.forEach((c) => tags.append(el('span', 'tag', D.CLASSES[c].name)));
    card.append(tags, weaponLines(def, tier, s));
    return card;
  }

  function itemCard(it) {
    const card = el('div', 'card item-card tier-' + it.tier);
    const ic = canvasEl('ico');
    R.itemIcon(ic, it, 48);
    card.append(cardTop(ic, it.name, 'Eşya · ' + D.TIERS[it.tier].name), statLines(it.stats));
    if (it.turret) card.append(el('p', 'card-note', 'Her dalga başında ' + U.ROMAN[it.turret] + '. kademe bir taret kurar.'));
    const owned = G.run && G.run.items[it.id];
    if (it.max) card.append(el('p', 'card-note muted', 'En fazla ' + it.max + ' tane' + (owned ? ' · sende ' + owned : '')));
    else if (owned) card.append(el('p', 'card-note muted', 'Sende ' + owned + ' tane var'));
    return card;
  }

  function renderStats(container) {
    const s = G.stats;
    container.innerHTML = '';
    const lvl = el('div', 'stat-level');
    lvl.append(el('span', null, 'Seviye'), el('b', null, String(G.run.level)));
    container.append(lvl);
    D.STATS.forEach((st) => {
      const v = s[st.key] || 0;
      const row = el('div', 'stat-row');
      if (st.key !== 'maxHp') row.classList.add(v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero');
      let tip = st.desc;
      if (st.key === 'armor') tip += ' Şu an alınan hasar: %' + Math.round(G.Calc.armorMult(s) * 100) + '.';
      if (st.key === 'dodge' && v > 60) tip += ' Etkin değer: %60.';
      row.title = tip;
      const ic = canvasEl('ico-sm');
      R.statIcon(ic, st.key, 18);
      row.append(ic, el('span', 'stat-name', st.name), el('span', 'stat-val', fmtStat(st.key, v, false)));
      container.append(row);
    });
    const pr = s.pickupRange || 0;
    if (pr) {
      const row = el('div', 'stat-row pos');
      const ic = canvasEl('ico-sm');
      R.statIcon(ic, 'pickupRange', 18);
      row.append(ic, el('span', 'stat-name', 'Toplama Menzili'), el('span', 'stat-val', fmtStat('pickupRange', pr, false)));
      container.append(row);
    }
  }

  function renderWeaponSlots(container, interactive) {
    container.innerHTML = '';
    const run = G.run;
    for (let i = 0; i < D.MAX_WEAPONS; i++) {
      const wp = run.weapons[i];
      if (!wp) {
        container.append(el('div', 'slot empty'));
        continue;
      }
      const def = D.WEAPON_BY_ID[wp.id];
      const b = el('button', 'slot tier-' + wp.tier);
      const ic = canvasEl('ico');
      R.weaponIcon(ic, wp.id, wp.tier, 44);
      b.append(ic);
      b.title = def.name + ' ' + U.ROMAN[wp.tier];
      b.setAttribute('aria-label', def.name + ' ' + U.ROMAN[wp.tier]);
      if (interactive && G.combineIndex(i) >= 0) {
        b.append(el('span', 'badge', '+'));
        b.title += ' (birleştirilebilir)';
      }
      b.addEventListener('click', () => openWeaponModal(i, interactive));
      container.append(b);
    }
  }

  function renderItems(container) {
    container.innerHTML = '';
    const ids = Object.keys(G.run.items).sort((a, b) => {
      const A = D.ITEM_BY_ID[a];
      const B = D.ITEM_BY_ID[b];
      return B.tier - A.tier || A.name.localeCompare(B.name, 'tr');
    });
    if (!ids.length) {
      container.append(el('p', 'muted empty-note', 'Henüz eşyan yok.'));
      return 0;
    }
    let total = 0;
    ids.forEach((id) => {
      const it = D.ITEM_BY_ID[id];
      const n = G.run.items[id];
      total += n;
      const b = el('button', 'item-slot tier-' + it.tier);
      const ic = canvasEl('ico');
      R.itemIcon(ic, it, 40);
      b.append(ic);
      if (n > 1) b.append(el('span', 'count', '×' + n));
      b.title = it.name;
      b.setAttribute('aria-label', it.name + (n > 1 ? ', ' + n + ' tane' : ''));
      b.addEventListener('click', () => openModal(itemCard(it), [{ label: 'Kapat' }]));
      container.append(b);
    });
    return total;
  }

  function renderSets(container) {
    container.innerHTML = '';
    const counts = G.setCounts(G.run.weapons);
    Object.keys(counts).forEach((c) => {
      const cls = D.CLASSES[c];
      const n = Math.min(6, counts[c]);
      const v = cls.per[n];
      const chip = el('span', 'set-chip' + (v ? ' active' : ''));
      if (v) chip.textContent = cls.name + ' (' + n + '): ' + fmtStat(cls.stat, v, true) + ' ' + D.STAT_BY_KEY[cls.stat].name;
      else chip.textContent = cls.name + ' (' + n + '): 2 farklı silahta ' + fmtStat(cls.stat, cls.per[2], true) + ' ' + D.STAT_BY_KEY[cls.stat].name;
      container.append(chip);
    });
  }

  /* ---------- Modal ve bildirim ---------- */
  function openModal(bodyEl, actions) {
    const body = $('modal-body');
    body.innerHTML = '';
    body.append(bodyEl);
    const titleEl = body.querySelector('.card-name, h3');
    if (titleEl) titleEl.id = 'modal-title';
    const box = $('modal-actions');
    box.innerHTML = '';
    let first = null;
    actions.forEach((a) => {
      const b = el('button', 'btn' + (a.cls ? ' ' + a.cls : ''), a.label);
      if (a.disabled) b.disabled = true;
      b.addEventListener('click', () => {
        if (a.fn) a.fn();
        else closeModal();
      });
      box.append(b);
      if (!first && !a.disabled) first = b;
    });
    $('modal').hidden = false;
    if (first) first.focus();
  }

  function closeModal() {
    $('modal').hidden = true;
  }

  function confirmBox(title, text, yes, fn) {
    const wrap = el('div', 'confirm');
    wrap.append(el('h3', null, title), el('p', null, text));
    openModal(wrap, [
      { label: yes, cls: 'btn-danger', fn: () => { closeModal(); fn(); } },
      { label: 'Vazgeç' },
    ]);
  }

  function toast(msg) {
    if (!msg) return;
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(UI.toastTimer);
    UI.toastTimer = setTimeout(() => {
      t.hidden = true;
    }, 1800);
  }

  function banner(text, dur) {
    const b = $('banner');
    b.textContent = text;
    b.hidden = false;
    b.classList.remove('pop');
    void b.offsetWidth; // animasyonu yeniden başlat
    b.classList.add('pop');
    clearTimeout(UI.bannerTimer);
    UI.bannerTimer = setTimeout(() => {
      b.hidden = true;
    }, (dur || 1.6) * 1000);
  }

  /* ---------- Ana menü ---------- */
  function showMenu() {
    G.state = 'menu';
    G.paused = false;
    G.w = null;
    BR.Input.reset();
    $('btn-continue').hidden = !G.loadSave();
    UI.show('menu');
    R.potatoIcon($('logo-potato'), 'allround', 96);
  }
  UI.showMenu = showMenu;

  function showChars() {
    const grid = $('char-grid');
    grid.innerHTML = '';
    D.CHARACTERS.forEach((ch) => {
      const card = el('button', 'card char-card');
      const ic = canvasEl('ico ico-lg');
      R.potatoIcon(ic, ch.id, 64);
      card.append(cardTop(ic, ch.name, ch.desc), statLines(ch.stats));
      if (ch.onlyType) card.append(el('p', 'card-note', 'Dükkanda sadece menzilli silahlar çıkar.'));
      card.addEventListener('click', () => {
        sfx('click');
        UI.sel.charId = ch.id;
        showWeapons();
      });
      grid.append(card);
    });
    UI.show('char');
  }

  function showWeapons() {
    const ch = D.CHAR_BY_ID[UI.sel.charId];
    const grid = $('weapon-grid');
    grid.innerHTML = '';
    const s = G.computeStats({ charId: ch.id, upgrades: {}, bonus: {}, items: {}, weapons: [], level: 0 });
    ch.starters.forEach((id) => {
      const def = D.WEAPON_BY_ID[id];
      const card = weaponCard(def, 1, s, 'button');
      card.addEventListener('click', () => {
        sfx('click');
        UI.sel.weaponId = id;
        showDangers();
      });
      grid.append(card);
    });
    UI.show('weapon');
  }

  function showDangers() {
    const grid = $('danger-grid');
    grid.innerHTML = '';
    D.DANGERS.forEach((dz, i) => {
      const card = el('button', 'card danger-card d' + i);
      const pips = el('div', 'pips');
      for (let k = 0; k < 4; k++) pips.append(el('span', k <= i ? 'on' : ''));
      card.append(el('div', 'card-name', dz.name), pips, el('p', 'card-desc', dz.desc));
      card.addEventListener('click', () => {
        BR.Audio.init();
        G.newRun(UI.sel.charId, UI.sel.weaponId, i);
      });
      grid.append(card);
    });
    UI.show('danger');
  }

  /* ---------- Dalga arası akış ---------- */
  function nextBetweenStep() {
    const run = G.run;
    if (run.pendingLevels > 0) showLevelUp();
    else if (run.crates.length > 0) showCrate();
    else {
      G.enterShop();
      showShop();
    }
  }

  function showLevelUp() {
    const run = G.run;
    const offer = G.getUpgradeOffer();
    $('lvl-sub').textContent = run.pendingLevels > 1 ? run.pendingLevels + ' seçim kaldı' : 'Son seçim';
    const grid = $('lvl-cards');
    grid.innerHTML = '';
    offer.forEach((o, i) => {
      const up = D.UPGRADE_BY_STAT[o.stat];
      const card = el('button', 'card upgrade-card tier-' + o.tier);
      const ic = canvasEl('ico');
      R.statIcon(ic, o.stat, 40);
      const st = {};
      st[o.stat] = G.upgradeValue(o);
      card.append(cardTop(ic, up.name + ' ' + U.ROMAN[o.tier], D.TIERS[o.tier].name), statLines(st), el('span', 'key-hint', String(i + 1)));
      card.addEventListener('click', () => chooseUpgrade(i));
      grid.append(card);
    });
    const cost = G.upgradeRerollCost();
    const rb = $('lvl-reroll');
    rb.textContent = 'Yenile · ' + cost;
    rb.disabled = run.materials < cost;
    $('lvl-mats').textContent = run.materials;
    renderStats($('lvl-stats'));
    if (UI.current !== 'levelup') UI.show('levelup');
    UI.shownAt = performance.now();
  }

  function chooseUpgrade(i) {
    if (UI.current !== 'levelup' || freshlyShown()) return;
    if (G.chooseUpgrade(i)) nextBetweenStep();
  }

  function showCrate() {
    const run = G.run;
    const o = G.getCrateOffer();
    const it = D.ITEM_BY_ID[o.id];
    $('crate-sub').textContent = run.crates.length > 1 ? run.crates.length + ' sandık açılacak' : 'Son sandık';
    const box = $('crate-card');
    box.innerHTML = '';
    box.append(itemCard(it));
    $('crate-recycle').textContent = 'Geri Dönüştür (+' + G.recyclePrice(o.id) + ')';
    UI.show('crate');
    UI.shownAt = performance.now();
    sfx('crate');
  }

  /* ---------- Dükkan ---------- */
  function showShop() {
    renderShop();
    UI.show('shop');
  }

  function offerCard(o, i) {
    const s = G.stats;
    const card = o.kind === 'weapon' ? weaponCard(D.WEAPON_BY_ID[o.id], o.tier, s, 'div') : itemCard(D.ITEM_BY_ID[o.id]);
    card.classList.add('offer');
    if (o.locked) card.classList.add('locked');
    const chk = G.buyCheck(o);
    if (chk.merge !== undefined) card.append(el('p', 'card-note good', 'Yuvalar dolu: elindeki aynı silahla birleşir.'));
    else if (!chk.ok && (chk.reason === 'Silah yuvaları dolu' || chk.maxed)) card.append(el('p', 'card-note bad', chk.reason + '.'));
    const actions = el('div', 'card-actions');
    const buy = el('button', 'btn btn-buy' + (G.run.materials < chk.price ? ' cant' : ''));
    buy.append(matIcon(), document.createTextNode(String(chk.price)));
    buy.setAttribute('aria-label', 'Satın al, ' + chk.price + ' malzeme');
    buy.disabled = !chk.ok;
    if (!chk.ok && chk.reason) buy.title = chk.reason;
    buy.addEventListener('click', () => {
      const r = G.buy(i);
      if (r.ok) {
        sfx('buy');
        renderShop();
      } else {
        sfx('error');
        toast(r.reason);
      }
    });
    const lock = el('button', 'btn btn-lock' + (o.locked ? ' on' : ''), o.locked ? 'Kilitli' : 'Kilitle');
    lock.setAttribute('aria-pressed', o.locked ? 'true' : 'false');
    lock.title = 'Kilitli teklif sonraki dükkanda da kalır';
    lock.addEventListener('click', () => {
      G.toggleLock(i);
      sfx('click');
      renderShop();
    });
    actions.append(buy, lock);
    card.append(actions);
    return card;
  }

  function renderShop() {
    const run = G.run;
    $('shop-wave').textContent = 'Sıradaki dalga: ' + (run.wave + 1) + ' / ' + D.MAX_WAVE;
    $('shop-mats').textContent = run.materials;
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
    renderWeaponSlots($('shop-weapons'), true);
    $('shop-wcount').textContent = run.weapons.length + ' / ' + D.MAX_WEAPONS;
    renderSets($('shop-sets'));
    const total = renderItems($('shop-items'));
    $('shop-icount').textContent = total ? total + ' tane' : '';
    $('shop-go').textContent = 'Başla: Dalga ' + (run.wave + 1);
    renderStats($('shop-stats'));
  }

  function openWeaponModal(i, interactive) {
    const run = G.run;
    const wp = run.weapons[i];
    if (!wp) return;
    const def = D.WEAPON_BY_ID[wp.id];
    const card = weaponCard(def, wp.tier, G.stats, 'div');
    const actions = [];
    if (interactive) {
      const ci = G.combineIndex(i);
      actions.push({
        label: wp.tier >= 4 ? 'En üst kademe' : 'Birleştir → ' + U.ROMAN[wp.tier + 1],
        cls: 'btn-primary',
        disabled: ci < 0,
        fn: () => {
          if (G.combineWeapon(i)) {
            sfx('buy');
            closeModal();
            renderShop();
          }
        },
      });
      actions.push({
        label: 'Sat (+' + G.sellPrice(wp) + ')',
        disabled: run.weapons.length <= 1,
        fn: () => {
          const r = G.sellWeapon(i);
          if (r.ok) {
            sfx('buy');
            closeModal();
            renderShop();
          } else {
            toast(r.reason);
          }
        },
      });
      if (ci < 0 && wp.tier < 4) card.append(el('p', 'card-note muted', 'Birleştirmek için aynı kademede ikinci bir ' + def.name + ' gerekir.'));
      if (run.weapons.length <= 1) card.append(el('p', 'card-note muted', 'Son silahını satamazsın.'));
    }
    actions.push({ label: 'Kapat' });
    openModal(card, actions);
  }

  /* ---------- Duraklatma ---------- */
  function pauseGame() {
    if (G.state !== 'wave' || G.paused || !G.w) return;
    G.togglePause(true);
    $('pause-sub').textContent = 'Dalga ' + G.w.n + ' · ' + D.CHAR_BY_ID[G.run.charId].name;
    renderWeaponSlots($('pause-weapons'), false);
    renderItems($('pause-items'));
    renderStats($('pause-stats'));
    UI.show('pause');
  }
  UI.pause = pauseGame;

  function resumeGame() {
    if (G.state !== 'wave') return;
    G.togglePause(false);
    UI.show(null);
    blurActive();
  }

  /* ---------- Oyun sonu ---------- */
  function showEnd(win) {
    const run = G.run;
    $('end-title').textContent = win ? 'Zafer!' : 'Öldün!';
    $('end-sub').textContent = win
      ? 'Kraliçe Zorg\'un ordusunu püskürttün. Patates efsanesi oldun.'
      : 'Dalga ' + run.wave + ' sırasında düştün. Bir sonraki koşu daha iyi geçecek.';
    $('scr-end').classList.toggle('win', !!win);
    const dl = $('end-stats');
    dl.innerHTML = '';
    const rows = [
      ['Karakter', D.CHAR_BY_ID[run.charId].name],
      ['Tehlike', String(run.danger)],
      ['Ulaşılan dalga', run.wave + ' / ' + D.MAX_WAVE],
      ['Seviye', String(run.level)],
      ['Öldürülen düşman', String(run.kills)],
      ['Toplanan malzeme', String(run.matsTotal)],
    ];
    rows.forEach((r) => {
      const row = el('div', 'end-row');
      row.append(el('dt', null, r[0]), el('dd', null, r[1]));
      dl.append(row);
    });
    R.potatoIcon($('end-potato'), run.charId, 96);
    UI.show('end');
  }

  /* ---------- Gösterge paneli ---------- */
  function updateHud() {
    const d = G.hud();
    if (!d) return;
    const c = UI.hud;
    const hpStr = d.hp + ' / ' + d.maxHp;
    if (c.hp !== hpStr) {
      c.hp = hpStr;
      $('hud-hp-text').textContent = hpStr;
      $('hud-hp-fill').style.transform = 'scaleX(' + U.clamp(d.hp / d.maxHp, 0, 1).toFixed(3) + ')';
    }
    const xpKey = d.level + ':' + d.xp;
    if (c.xp !== xpKey) {
      c.xp = xpKey;
      $('hud-xp-text').textContent = 'SV. ' + d.level;
      $('hud-xp-fill').style.transform = 'scaleX(' + U.clamp(d.xp / d.xpNeed, 0, 1).toFixed(3) + ')';
    }
    if (c.mats !== d.materials) {
      c.mats = d.materials;
      $('hud-mats').textContent = d.materials;
    }
    if (c.bag !== d.bag) {
      c.bag = d.bag;
      const bag = $('hud-bag');
      bag.hidden = d.bag <= 0;
      bag.textContent = '+' + d.bag;
      bag.title = 'Çanta: sonraki dalgada topladığın malzemeler ikiye katlanır';
    }
    if (c.wave !== d.wave) {
      c.wave = d.wave;
      $('hud-wave').textContent = 'DALGA ' + d.wave;
    }
    if (c.time !== d.timeLeft) {
      c.time = d.timeLeft;
      const t = $('hud-timer');
      t.textContent = d.timeLeft;
      t.classList.toggle('low', d.timeLeft <= 5);
    }
    const bb = $('boss-bar');
    if (d.boss) {
      if (bb.hidden) bb.hidden = false;
      if (c.bossName !== d.boss.name) {
        c.bossName = d.boss.name;
        $('boss-name').textContent = d.boss.name;
      }
      $('boss-fill').style.transform = 'scaleX(' + d.boss.frac.toFixed(3) + ')';
    } else if (!bb.hidden) {
      bb.hidden = true;
      c.bossName = null;
    }
  }

  UI.frame = function () {
    if (G.state === 'wave' && G.w) updateHud();
  };

  /* ---------- Ayarlar ---------- */
  function syncSettingsUI() {
    const st = BR.settings;
    $('set-volume').value = Math.round(st.volume * 100);
    $('set-volume-out').textContent = Math.round(st.volume * 100);
    $('set-shake').checked = !!st.shake;
    $('set-dmg').checked = !!st.dmgNumbers;
  }

  function openSub(name) {
    UI.prev = UI.current || 'menu';
    if (name === 'settings') syncSettingsUI();
    UI.show(name);
  }

  function goBack() {
    UI.show(UI.prev || 'menu');
  }

  /* ---------- Kurulum ---------- */
  UI.init = function (hot) {
    if (hot && hot.save) G.importSave(hot.save);

    $('btn-new').addEventListener('click', () => {
      BR.Audio.init();
      sfx('click');
      showChars();
    });
    $('btn-continue').addEventListener('click', () => {
      BR.Audio.init();
      sfx('click');
      const phase = G.continueRun();
      if (!phase) {
        toast('Kayıtlı oyun bulunamadı');
        showMenu();
        return;
      }
      if (phase === 'wave') return;
      if (phase === 'shop') {
        G.enterShop();
        showShop();
      } else {
        nextBetweenStep();
      }
    });
    $('btn-help').addEventListener('click', () => openSub('help'));
    $('btn-settings').addEventListener('click', () => openSub('settings'));
    $('char-back').addEventListener('click', () => UI.show('menu'));
    $('weapon-back').addEventListener('click', () => showChars());
    $('danger-back').addEventListener('click', () => showWeapons());
    $('help-back').addEventListener('click', goBack);
    $('settings-back').addEventListener('click', goBack);

    $('lvl-reroll').addEventListener('click', () => {
      if (G.rerollUpgrades()) {
        sfx('click');
        showLevelUp();
      } else {
        sfx('error');
        toast('Yetersiz malzeme');
      }
    });
    $('crate-take').addEventListener('click', () => {
      if (UI.current !== 'crate' || freshlyShown()) return;
      if (G.takeCrate(false)) sfx('buy');
      nextBetweenStep();
    });
    $('crate-recycle').addEventListener('click', () => {
      if (UI.current !== 'crate' || freshlyShown()) return;
      if (G.takeCrate(true)) sfx('buy');
      nextBetweenStep();
    });
    $('shop-reroll').addEventListener('click', () => {
      if (G.reroll()) {
        sfx('click');
        renderShop();
      } else {
        sfx('error');
        toast('Yetersiz malzeme');
      }
    });
    $('shop-go').addEventListener('click', () => {
      sfx('click');
      G.startNextWave();
    });

    $('btn-pause').addEventListener('click', pauseGame);
    $('pause-resume').addEventListener('click', resumeGame);
    $('pause-settings').addEventListener('click', () => openSub('settings'));
    $('pause-help').addEventListener('click', () => openSub('help'));
    $('pause-quit').addEventListener('click', () => {
      confirmBox('Ana menüye dönülsün mü?', 'Bu dalgadaki ilerleme kaybolur. Menüden "Devam Et" ile son dükkandan sürdürebilirsin.', 'Menüye dön', showMenu);
    });
    $('end-retry').addEventListener('click', () => {
      const c = G.lastConfig;
      if (c) G.newRun(c.charId, c.weaponId, c.danger);
      else showMenu();
    });
    $('end-menu').addEventListener('click', showMenu);

    $('modal').addEventListener('click', (e) => {
      if (e.target === $('modal')) closeModal();
    });

    $('set-volume').addEventListener('input', (e) => {
      const v = Number(e.target.value) / 100;
      BR.settings.volume = v;
      $('set-volume-out').textContent = Math.round(v * 100);
      BR.Audio.setVolume(v);
      BR.saveSettings();
    });
    $('set-volume').addEventListener('change', () => {
      BR.Audio.init();
      sfx('pickup');
    });
    $('set-shake').addEventListener('change', (e) => {
      BR.settings.shake = e.target.checked;
      BR.saveSettings();
    });
    $('set-dmg').addEventListener('change', (e) => {
      BR.settings.dmgNumbers = e.target.checked;
      BR.saveSettings();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (!$('modal').hidden) {
          closeModal();
          return;
        }
        if (G.state === 'wave') {
          if (!G.paused) pauseGame();
          else if (UI.current === 'pause') resumeGame();
          else if (UI.current === 'settings' || UI.current === 'help') goBack();
        } else if (UI.current === 'settings' || UI.current === 'help') {
          goBack();
        }
        return;
      }
      if (UI.current === 'levelup' && /^Digit[1-4]$/.test(e.code) && $('modal').hidden) {
        chooseUpgrade(Number(e.code.slice(5)) - 1);
      }
    });

    const unlock = () => BR.Audio.init();
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);

    G.on('waveStart', (w) => {
      UI.hud = {};
      UI.show(null);
      blurActive();
      banner('DALGA ' + w.n, 1.6);
    });
    G.on('banner', (text) => banner(text, 2));
    G.on('between', () => {
      $('hud').hidden = true;
      nextBetweenStep();
    });
    G.on('gameOver', () => showEnd(false));
    G.on('victory', () => showEnd(true));

    showMenu();
  };

  BR.UI = UI;
})((window.BR = window.BR || {}));
