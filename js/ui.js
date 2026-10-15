/* Kumpir Arena - arayüz çekirdeği: ekran yönetimi, menüler, HUD, duraklatma, oyun sonu,
   başarımlar, günlük meydan okuma, ayarlar ve gamepad ile gezinme */
(function (BR) {
  'use strict';

  const U = BR.U;
  const D = BR.DATA;
  const G = BR.Game;
  const R = BR.Render;
  const $ = (id) => document.getElementById(id);

  const SCREENS = ['menu', 'char', 'weapon', 'danger', 'levelup', 'crate', 'stand', 'shop', 'map', 'event', 'rest', 'pause', 'end', 'ach', 'daily', 'help', 'settings'];
  const BETWEEN = ['levelup', 'crate', 'stand', 'shop', 'map', 'event', 'rest'];
  const MINUS = '−';
  const TARGET_NAMES = { near: 'En yakın', strong: 'En güçlü', weak: 'En az canlı' };

  const UI = {
    current: null,
    prev: 'menu',
    sel: { charId: null, weaponId: null, players: 1 },
    hud: {},
    shownAt: 0,
    bannerTimer: 0,
    toastTimer: 0,
    runAch: [],
    TARGET_NAMES,
  };

  /* ================= Yardımcılar ================= */
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

  function blurActive() {
    const a = document.activeElement;
    if (a && typeof a.blur === 'function') a.blur();
  }

  function freshlyShown() {
    return performance.now() - UI.shownAt < 250;
  }

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

  // Kademe noktaları: rengi ayırt edemeyenler için kademeyi şekille de göster
  function tierPips(tier, evo) {
    const box = el('span', 'tier-pips');
    box.setAttribute('aria-hidden', 'true');
    if (evo) {
      box.textContent = 'EVRİM';
      box.classList.add('evo');
      return box;
    }
    for (let i = 0; i < tier; i++) box.append(el('i'));
    return box;
  }

  function tierClass(def, tier) {
    return def && def.evo ? 'tier-evo' : 'tier-' + tier;
  }

  function weaponName(def, tier) {
    return def.evo ? def.name : def.name + ' ' + U.ROMAN[tier];
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
    if (def.pierce && def.pierce[tier - 1]) rows.push(['Delme', def.pierce[tier - 1] >= 99 ? 'Hepsini' : def.pierce[tier - 1] + ' düşman']);
    if (def.burn) rows.push(['Yanma', Math.round(C.burnDamage(def, tier, s)) + ' × 5 tık']);
    if (def.explode) rows.push(['Patlama', def.explode[tier - 1] + ' yarıçap']);
    if (def.turret) rows.push(['Taret', 'Her dalga ' + U.ROMAN[tier] + '. kademe taret kurar']);
    if (def.shock) rows.push(['Sarsıntı', def.shock + ' yarıçapta %60 hasar']);
    if (def.homing) rows.push(['Güdümlü', 'Hedefini takip eder']);
    if (def.lsHit) rows.push(['Can çalma', 'Her vuruşta 1 can']);
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
    const card = el(tag || 'div', 'card weapon-card ' + tierClass(def, tier));
    const ic = canvasEl('ico');
    R.weaponIcon(ic, def.id, tier, 48);
    const kind = 'Silah · ' + (def.type === 'melee' ? 'Yakın dövüş' : 'Menzilli');
    const top = cardTop(ic, weaponName(def, tier), kind);
    top.append(tierPips(tier, def.evo));
    card.append(top);
    const tags = el('div', 'tags');
    def.cls.forEach((c) => tags.append(el('span', 'tag', D.CLASSES[c].name)));
    card.append(tags);
    if (def.desc) card.append(el('p', 'card-note', def.desc));
    card.append(weaponLines(def, tier, s));
    return card;
  }

  function itemCard(it) {
    const card = el('div', 'card item-card tier-' + it.tier);
    const ic = canvasEl('ico');
    R.itemIcon(ic, it, 48);
    const top = cardTop(ic, it.name, 'Eşya · ' + D.TIERS[it.tier].name + (it.fx ? ' · Kural değiştirir' : ''));
    top.append(tierPips(it.tier));
    card.append(top, statLines(it.stats));
    if (it.desc) card.append(el('p', 'card-note fx', it.desc));
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
    const stage = BR.Art.STAGE_NAMES[BR.Art.stageFor(G.run.level)];
    lvl.append(el('span', null, 'Seviye · ' + stage), el('b', null, String(G.run.level)));
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

  function renderWeaponSlots(container, mode) {
    container.innerHTML = '';
    const run = G.run;
    if (D.CHAR_BY_ID[run.charId].noWeapons) {
      container.append(el('p', 'muted empty-note', 'Haşlanmış silah taşıyamaz; dokunduğu düşmanı haşlar.'));
      return;
    }
    for (let i = 0; i < D.MAX_WEAPONS; i++) {
      const wp = run.weapons[i];
      if (!wp) {
        container.append(el('div', 'slot empty'));
        continue;
      }
      const def = D.WEAPON_BY_ID[wp.id];
      const b = el('button', 'slot ' + tierClass(def, wp.tier));
      const ic = canvasEl('ico');
      R.weaponIcon(ic, wp.id, wp.tier, 44);
      b.append(ic);
      const label = weaponName(def, wp.tier) + ' · hedef: ' + TARGET_NAMES[wp.target || 'near'];
      b.title = label;
      b.setAttribute('aria-label', label);
      if (wp.target && wp.target !== 'near') b.append(el('span', 'target-badge', wp.target === 'strong' ? 'G' : 'Z'));
      if (mode === 'shop' && G.combineIndex(i) >= 0) {
        b.append(el('span', 'badge', '+'));
        b.title += ' (birleştirilebilir)';
      }
      b.addEventListener('click', () => UI.openWeaponModal(i, mode));
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

  /* ---------- Silah penceresi (dükkan ve duraklatma) ---------- */
  UI.openWeaponModal = function (i, mode) {
    const run = G.run;
    const wp = run.weapons[i];
    if (!wp) return;
    const def = D.WEAPON_BY_ID[wp.id];
    const card = weaponCard(def, wp.tier, G.stats, 'div');
    const seg = el('div', 'seg target-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Hedef önceliği');
    seg.append(el('span', 'seg-label', 'Hedef'));
    G.TARGET_MODES.forEach((m) => {
      const b = el('button', 'seg-btn', TARGET_NAMES[m]);
      b.setAttribute('aria-pressed', (wp.target || 'near') === m ? 'true' : 'false');
      b.addEventListener('click', () => {
        G.setTarget(i, m);
        sfx('click');
        UI.openWeaponModal(i, mode);
        refreshAfterWeapon(mode);
      });
      seg.append(b);
    });
    card.append(seg);
    const actions = [];
    if (mode === 'shop') {
      const ci = G.combineIndex(i);
      actions.push({
        label: wp.tier >= 4 || def.evo ? 'En üst kademe' : 'Birleştir → ' + U.ROMAN[wp.tier + 1],
        cls: 'btn-primary',
        disabled: ci < 0,
        fn: () => {
          if (G.combineWeapon(i)) {
            sfx('buy');
            closeModal();
            refreshAfterWeapon(mode);
          }
        },
      });
      actions.push({
        label: 'Sat (+' + G.sellPrice(wp) + ')',
        disabled: run.weapons.length <= 1,
        fn: () => {
          const r = G.sellWeapon(i);
          if (r.ok) {
            sfx('coin');
            closeModal();
            refreshAfterWeapon(mode);
          } else {
            toast(r.reason);
          }
        },
      });
      if (ci < 0 && wp.tier < 4 && !def.evo) card.append(el('p', 'card-note muted', 'Birleştirmek için aynı kademede ikinci bir ' + def.name + ' gerekir.'));
      if (run.weapons.length <= 1) card.append(el('p', 'card-note muted', 'Son silahını satamazsın.'));
    }
    actions.push({ label: 'Kapat' });
    openModal(card, actions);
  };

  function refreshAfterWeapon(mode) {
    if (mode === 'shop' && UI.renderShop) UI.renderShop();
    else if (mode === 'pause') renderWeaponSlots($('pause-weapons'), 'pause');
  }

  /* ---------- Modal ve bildirimler ---------- */
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
    }, 2400);
  }

  function banner(text, dur) {
    const b = $('banner');
    b.textContent = text;
    b.hidden = false;
    b.classList.remove('pop');
    void b.offsetWidth;
    b.classList.add('pop');
    clearTimeout(UI.bannerTimer);
    UI.bannerTimer = setTimeout(() => {
      b.hidden = true;
    }, (dur || 1.6) * 1000);
  }

  function achToast(def) {
    const box = $('ach-toasts');
    const t = el('div', 'ach-toast');
    t.append(el('b', null, 'Başarım: ' + def.name), el('span', null, def.desc));
    if (def.unlocks) t.append(el('span', 'unlock', 'Yeni karakter açıldı: ' + D.CHAR_BY_ID[def.unlocks].name));
    box.append(t);
    setTimeout(() => t.remove(), 4200);
    sfx('achieve');
  }

  UI.h = {
    el, canvasEl, matIcon, sfx, blurActive, freshlyShown, fmtStat, statLines, cardTop, tierPips, tierClass,
    weaponName, weaponCard, itemCard, renderStats, renderWeaponSlots, renderItems, renderSets,
    openModal, closeModal, confirmBox, toast, banner,
  };

  /* ================= Ekran yönetimi ================= */
  UI.show = function (name) {
    SCREENS.forEach((s) => {
      $('scr-' + s).hidden = s !== name;
    });
    $('screens').classList.toggle('active', !!name);
    UI.current = name;
    $('hud').hidden = G.state !== 'wave';
    if (G.state !== 'wave') {
      $('boss-bar').hidden = true;
      document.documentElement.classList.remove('boss-on');
    }
    closeModal();
    if (name) {
      $('scr-' + name).scrollTop = 0;
      UI.shownAt = performance.now();
    }
    UI.updateMusic();
  };

  UI.updateMusic = function () {
    const A = BR.Audio;
    A.duck(G.state === 'wave' && G.paused);
    if (G.state === 'wave' && G.w) A.music(G.w.bossType ? 'boss' : 'wave');
    else if (BETWEEN.includes(UI.current)) A.music('shop');
    else A.music('menu');
  };

  /* ================= Ana menü ve koşu kurulumu ================= */
  function showMenu() {
    G.state = 'menu';
    G.paused = false;
    G.w = null;
    BR.Input.reset();
    $('btn-continue').hidden = !G.loadSave();
    UI.show('menu');
    R.potatoIcon($('logo-potato'), 'allround', 96, { stage: 3, toppings: ['kasar', 'misir', 'sosis', 'tursu'] });
  }
  UI.showMenu = showMenu;

  function setPlayers(n) {
    UI.sel.players = n;
    $('players-1').setAttribute('aria-pressed', n === 1 ? 'true' : 'false');
    $('players-2').setAttribute('aria-pressed', n === 2 ? 'true' : 'false');
    $('coop-note').hidden = n !== 2;
  }

  function showChars() {
    const grid = $('char-grid');
    grid.innerHTML = '';
    setPlayers(UI.sel.players);
    D.CHARACTERS.forEach((ch) => {
      const unlocked = BR.Meta.charUnlocked(ch);
      const card = el('button', 'card char-card' + (unlocked ? '' : ' locked'));
      const ic = canvasEl('ico ico-lg');
      R.potatoIcon(ic, ch.id, 64);
      card.append(cardTop(ic, ch.name, ch.desc), statLines(ch.stats));
      if (ch.rule) card.append(el('p', 'card-note fx', ch.rule));
      if (ch.onlyType) card.append(el('p', 'card-note', 'Dükkanda sadece menzilli silahlar çıkar.'));
      const ab = D.ABILITIES[ch.ability];
      card.append(el('p', 'card-note muted', 'Yetenek: ' + ab.name + ' · ' + ab.desc));
      if (!unlocked) {
        card.setAttribute('aria-disabled', 'true');
        card.append(el('p', 'lock-note', 'Kilitli · ' + BR.Meta.unlockText(ch)));
      }
      card.addEventListener('click', () => {
        if (!unlocked) {
          sfx('error');
          toast('Kilitli: ' + BR.Meta.unlockText(ch));
          return;
        }
        sfx('click');
        UI.sel.charId = ch.id;
        if (ch.noWeapons) {
          UI.sel.weaponId = null;
          showDangers();
        } else showWeapons();
      });
      grid.append(card);
    });
    UI.show('char');
  }

  function showWeapons() {
    const ch = D.CHAR_BY_ID[UI.sel.charId];
    const grid = $('weapon-grid');
    grid.innerHTML = '';
    const s = G.computeStats({ charId: ch.id, upgrades: {}, bonus: {}, items: {}, weapons: [], level: 0, filling: [] });
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
    $('easy-note').hidden = !BR.settings.easy;
    D.DANGERS.forEach((dz, i) => {
      const card = el('button', 'card danger-card d' + i);
      const pips = el('div', 'pips');
      for (let k = 0; k < 4; k++) pips.append(el('span', k <= i ? 'on' : ''));
      card.append(el('div', 'card-name', dz.name), pips, el('p', 'card-desc', dz.desc));
      card.addEventListener('click', () => {
        startRun({
          charId: UI.sel.charId, weaponId: UI.sel.weaponId, danger: i,
          coop: UI.sel.players === 2, easy: !!BR.settings.easy,
        });
      });
      grid.append(card);
    });
    UI.show('danger');
  }

  function startRun(opts) {
    BR.Audio.init();
    BR.Input.setCoop(!!opts.coop);
    UI.runAch = [];
    G.newRun(opts);
  }
  UI.startRun = startRun;

  /* ================= Duraklatma ================= */
  function pauseGame() {
    if (G.state !== 'wave' || G.paused || !G.w) return;
    G.togglePause(true);
    const ch = D.CHAR_BY_ID[G.run.charId];
    $('pause-sub').textContent = 'Dalga ' + G.w.n + ' · ' + ch.name + (G.run.coop ? ' · iki kişi' : '');
    const ab = D.ABILITIES[ch.ability];
    const keys = BR.Input.sawTouch && !G.run.coop ? ' · Atılma ve yetenek: sağ alttaki düğmeler' : ' · Atılma: Boşluk/Shift · Yetenek: E/Q';
    $('pause-info').textContent = 'Yetenek: ' + ab.name + ' (' + ab.desc + ')' + keys + (G.run.coop ? ' · 2. oyuncu: Enter ve Sağ Shift' : '');
    syncFullscreen();
    renderWeaponSlots($('pause-weapons'), 'pause');
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

  /* ================= Oyun sonu ================= */
  function showEnd(win) {
    const run = G.run;
    const res = G.lastResult || { completed: 0, daily: null };
    $('end-title').textContent = win ? 'Zafer!' : 'Püre oldun!';
    const bossName = D.ENEMIES[run.boss] ? D.ENEMIES[run.boss].name : '';
    $('end-sub').textContent = win
      ? bossName + ' ve ordusu püskürtüldü. Patates efsanesi oldun!'
      : (run.endless ? 'Sonsuz modda ' : '') + 'Dalga ' + run.wave + ' sırasında ezildin. Bir sonraki koşu daha iyi geçecek.';
    $('scr-end').classList.toggle('win', !!win);
    const dl = $('end-stats');
    dl.innerHTML = '';
    const rows = [
      ['Karakter', D.CHAR_BY_ID[run.charId].name + (run.coop ? ' (iki kişi)' : '')],
      ['Tehlike', String(run.danger) + (run.easy ? ' · kolay mod' : '')],
      ['Tamamlanan dalga', String(res.completed)],
      ['Seviye', run.level + ' · ' + BR.Art.STAGE_NAMES[BR.Art.stageFor(run.level)]],
      ['Öldürülen düşman', String(run.kills)],
      ['Toplanan malzeme', String(run.matsTotal)],
    ];
    if (run.evolved) rows.push(['Evrimleşen silah', String(run.evolved)]);
    if (run.standServed) rows.push(['Tezgahta servis', String(run.standServed)]);
    rows.forEach((r) => {
      const row = el('div', 'end-row');
      row.append(el('dt', null, r[0]), el('dd', null, r[1]));
      dl.append(row);
    });
    const dbox = $('end-daily');
    dbox.innerHTML = '';
    dbox.hidden = !res.daily;
    if (res.daily) {
      dbox.append(el('b', null, 'Günlük puan: ' + res.daily.score), el('span', null, res.daily.isBest ? 'Bugünün yeni rekoru!' : 'Bugünkü en iyin: ' + res.daily.best));
    }
    const abox = $('end-ach');
    abox.innerHTML = '';
    abox.hidden = !UI.runAch.length;
    if (UI.runAch.length) {
      abox.append(el('h3', null, 'Bu koşuda açılan başarımlar'));
      const ul = el('ul');
      UI.runAch.forEach((a) => ul.append(el('li', null, a.name + (a.unlocks ? ' · yeni karakter: ' + D.CHAR_BY_ID[a.unlocks].name : ''))));
      abox.append(ul);
    }
    $('end-share-text').value = BR.Meta.shareText(run, res);
    $('end-endless').hidden = !win;
    R.potatoIcon($('end-potato'), run.charId, 96, { stage: BR.Art.stageFor(run.level), toppings: run.filling, worried: !win });
    UI.show('end');
  }

  /* ================= Başarımlar ================= */
  function showAch() {
    const M = BR.Meta;
    const st = M.profile.stats;
    $('ach-sub').textContent = M.count() + ' / ' + D.ACHIEVEMENTS.length;
    const dl = $('ach-stats');
    dl.innerHTML = '';
    [['Koşu', st.runs], ['Zafer', st.wins], ['Toplam öldürme', st.kills], ['En iyi dalga', st.bestWave], ['Sonsuz modda en iyi', st.bestEndless]].forEach((r) => {
      const row = el('div', 'pstat');
      row.append(el('dt', null, r[0]), el('dd', null, String(r[1])));
      dl.append(row);
    });
    const grid = $('ach-grid');
    grid.innerHTML = '';
    D.ACHIEVEMENTS.forEach((a) => {
      const done = M.has(a.id);
      const card = el('div', 'ach-card' + (done ? ' done' : ''));
      card.append(el('b', null, (done ? '✓ ' : '') + a.name), el('span', null, a.desc));
      if (a.unlocks) card.append(el('span', 'unlock', (done ? 'Açıldı: ' : 'Açar: ') + D.CHAR_BY_ID[a.unlocks].name));
      grid.append(card);
    });
    openSub('ach');
  }

  /* ================= Günlük meydan okuma ================= */
  function dailyBoss(seed) {
    return D.BOSSES[Math.floor(U.rngStep(seed).value * D.BOSSES.length)];
  }

  function showDaily() {
    const date = U.todayKey();
    const cfg = BR.Meta.dailyConfig(date);
    $('daily-date').textContent = date;
    const card = $('daily-card');
    card.innerHTML = '';
    const ch = D.CHAR_BY_ID[cfg.charId];
    const pic = canvasEl('ico ico-lg');
    R.potatoIcon(pic, ch.id, 72);
    const info = el('div', 'daily-info');
    info.append(el('div', 'card-name', ch.name), el('div', 'card-kind', ch.desc));
    const ul = el('ul', 'daily-list');
    if (cfg.weaponId) ul.append(el('li', null, 'Başlangıç silahı: ' + D.WEAPON_BY_ID[cfg.weaponId].name));
    ul.append(el('li', null, 'Tehlike: ' + cfg.danger));
    ul.append(el('li', null, '20. dalganın patronu: ' + D.ENEMIES[dailyBoss(cfg.seed)].name));
    info.append(ul);
    card.append(pic, info);
    const best = BR.Meta.dailyBest(date);
    $('daily-best').textContent = BR.Meta.dailyPlayed(date) ? 'Bugünkü en iyi puanın: ' + best : 'Bugün henüz oynamadın.';
    $('daily-start').onclick = () => {
      startRun({ charId: cfg.charId, weaponId: cfg.weaponId, danger: cfg.danger, daily: date, seed: cfg.seed, coop: false, easy: !!BR.settings.easy });
    };
    openSub('daily');
  }

  /* ================= Gösterge paneli ================= */
  function setBar(fillId, textId, cur, max, key) {
    const c = UI.hud;
    const str = cur + ' / ' + max;
    if (c[key] === str) return;
    c[key] = str;
    $(textId).textContent = (key === 'hp2' ? '2P · ' : '') + str;
    $(fillId).style.transform = 'scaleX(' + U.clamp(cur / max, 0, 1).toFixed(3) + ')';
  }

  function setSkill(id, frac) {
    const b = $(id);
    const v = frac.toFixed(2);
    if (b.dataset.cd !== v) {
      b.dataset.cd = v;
      b.style.setProperty('--cd', v);
      b.classList.toggle('ready', frac <= 0);
    }
  }

  function updateHud() {
    const d = G.hud();
    if (!d) return;
    const c = UI.hud;
    const p1 = d.players[0];
    setBar('hud-hp-fill', 'hud-hp-text', p1.hp, p1.maxHp, 'hp');
    const p2 = d.players[1];
    if (p2) setBar('hud-hp2-fill', 'hud-hp2-text', p2.hp, p2.maxHp, 'hp2');
    if (c.coop !== !!p2) {
      c.coop = !!p2;
      $('hud-hp2').hidden = !p2;
      $('hud-skills-2').hidden = !p2;
      $('hud').classList.toggle('coop', !!p2);
    }
    setSkill('sk1-dash', p1.dash);
    setSkill('sk1-abil', p1.abil);
    if (p2) {
      setSkill('sk2-dash', p2.dash);
      setSkill('sk2-abil', p2.abil);
    }
    if (c.abilName !== d.abilityName) {
      c.abilName = d.abilityName;
      $('sk1-abil-name').textContent = d.abilityName;
      $('sk2-abil-name').textContent = d.abilityName;
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
    if (c.arena !== d.arena) {
      c.arena = d.arena;
      $('hud-arena').textContent = d.arena;
    }
    if (c.mod !== d.mod) {
      c.mod = d.mod;
      $('hud-mod').hidden = !d.mod;
      $('hud-mod').textContent = d.mod || '';
    }
    const bb = $('boss-bar');
    if (d.boss) {
      if (bb.hidden) {
        bb.hidden = false;
        document.documentElement.classList.add('boss-on');
      }
      const name = d.boss.name + (d.boss.affixes.length ? ' · ' + d.boss.affixes.join(' · ') : '');
      if (c.bossName !== name) {
        c.bossName = name;
        $('boss-name').textContent = name;
      }
      $('boss-fill').style.transform = 'scaleX(' + d.boss.frac.toFixed(3) + ')';
    } else if (!bb.hidden) {
      bb.hidden = true;
      document.documentElement.classList.remove('boss-on');
      c.bossName = null;
    }
    // müzik yoğunluğu: dalga ilerledikçe artar; patron savaşında patronun kaybettiği canla da yükselir
    if (G.w) {
      let inten = G.w.t / G.w.duration;
      if (d.boss) inten = Math.max(inten, 1 - d.boss.frac);
      BR.Audio.setIntensity(inten);
    }
  }

  UI.frame = function () {
    if (G.state === 'wave' && G.w) updateHud();
  };

  /* ================= Ayarlar ================= */
  function syncSettingsUI() {
    const st = BR.settings;
    $('set-volume').value = Math.round(st.volume * 100);
    $('set-volume-out').textContent = Math.round(st.volume * 100);
    $('set-music').value = Math.round(st.music * 100);
    $('set-music-out').textContent = Math.round(st.music * 100);
    $('set-speed').value = String(st.speed);
    $('set-easy').checked = !!st.easy;
    $('set-cb').checked = !!st.colorblind;
    $('set-shake').checked = !!st.shake;
    $('set-hitstop').checked = !!st.hitstop;
    $('set-dmg').checked = !!st.dmgNumbers;
    $('set-vibrate').checked = !!st.vibrate;
    $('set-vibrate-row').hidden = !canVibrate();
  }

  function canVibrate() {
    return typeof navigator.vibrate === 'function' && !!BR.Input.sawTouch;
  }

  /* ================= Tam ekran ================= */
  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function fsSupported() {
    const el = document.documentElement;
    return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(el.requestFullscreen || el.webkitRequestFullscreen);
  }

  function syncFullscreen() {
    const sup = fsSupported();
    const on = !!fsElement();
    ['btn-fullscreen', 'pause-fullscreen'].forEach((id) => {
      const b = $(id);
      b.hidden = !sup;
      b.textContent = on ? 'Tam Ekrandan Çık' : 'Tam Ekran';
    });
  }
  UI.syncFullscreen = syncFullscreen;

  function toggleFullscreen() {
    const fail = () => toast('Bu tarayıcı tam ekrana izin vermedi');
    try {
      if (fsElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        const r = exit.call(document);
        if (r && r.catch) r.catch(() => {});
      } else {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        const r = req.call(el, { navigationUI: 'hide' });
        if (r && r.catch) r.catch(fail);
      }
    } catch (e) {
      fail();
    }
  }

  UI.applyColorblind = function () {
    const on = !!BR.settings.colorblind;
    D.applyPalette(on ? 'colorblind' : 'normal');
    document.documentElement.classList.toggle('cb', on);
  };

  function openSub(name) {
    UI.prev = UI.current || 'menu';
    if (name === 'settings') syncSettingsUI();
    UI.show(name);
  }

  function goBack() {
    UI.show(UI.prev || 'menu');
  }

  // Esc ve gamepad B: bulunulan ekrana göre geri git
  function handleBack() {
    if (!$('modal').hidden) {
      closeModal();
      return;
    }
    if (G.state === 'wave') {
      if (!G.paused) pauseGame();
      else if (UI.current === 'pause') resumeGame();
      else if (UI.current === 'settings' || UI.current === 'help') goBack();
      return;
    }
    const cur = UI.current;
    if (cur === 'settings' || cur === 'help' || cur === 'ach' || cur === 'daily') goBack();
    else if (cur === 'char') UI.show('menu');
    else if (cur === 'weapon') showChars();
    else if (cur === 'danger') {
      if (D.CHAR_BY_ID[UI.sel.charId].noWeapons) showChars();
      else showWeapons();
    } else if (cur === 'map' && UI.backToShop) UI.backToShop();
  }
  UI.handleBack = handleBack;

  /* ================= Gamepad ile gezinme ================= */
  UI.navigate = function (dir) {
    if (G.state === 'wave' && !G.paused) return;
    if (dir === 'back') {
      handleBack();
      return;
    }
    const root = !$('modal').hidden ? $('modal') : UI.current ? $('scr-' + UI.current) : null;
    if (!root) return;
    const items = Array.from(root.querySelectorAll('button, input, select')).filter((e) => !e.disabled && e.offsetParent !== null);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    if (dir === 'ok') {
      if (i >= 0) items[i].click();
      else items[0].focus();
      return;
    }
    let j = i < 0 ? 0 : dir === 'up' || dir === 'left' ? i - 1 : i + 1;
    j = (j + items.length) % items.length;
    items[j].focus();
    if (items[j].scrollIntoView) items[j].scrollIntoView({ block: 'nearest' });
  };

  /* ================= Kurulum ================= */
  UI.init = function (hot) {
    if (hot && hot.save) G.importSave(hot.save);
    UI.applyColorblind();

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
      BR.Input.setCoop(G.run.coop);
      UI.runAch = [];
      if (phase !== 'wave') UI.resumePhase(phase);
    });
    $('btn-daily').addEventListener('click', () => {
      BR.Audio.init();
      sfx('click');
      showDaily();
    });
    $('btn-ach').addEventListener('click', () => {
      sfx('click');
      showAch();
    });
    $('btn-help').addEventListener('click', () => openSub('help'));
    $('btn-settings').addEventListener('click', () => openSub('settings'));
    $('char-back').addEventListener('click', () => UI.show('menu'));
    $('weapon-back').addEventListener('click', () => showChars());
    $('danger-back').addEventListener('click', () => handleBack());
    $('help-back').addEventListener('click', goBack);
    $('settings-back').addEventListener('click', goBack);
    $('ach-back').addEventListener('click', goBack);
    $('daily-back').addEventListener('click', goBack);
    $('players-1').addEventListener('click', () => setPlayers(1));
    $('players-2').addEventListener('click', () => setPlayers(2));

    $('btn-pause').addEventListener('click', pauseGame);
    $('pause-resume').addEventListener('click', resumeGame);
    $('pause-settings').addEventListener('click', () => openSub('settings'));
    $('pause-help').addEventListener('click', () => openSub('help'));
    $('pause-quit').addEventListener('click', () => {
      confirmBox('Ana menüye dönülsün mü?', 'Bu dalgadaki ilerleme kaybolur. Menüden "Devam Et" ile son duraktan sürdürebilirsin.', 'Menüye dön', showMenu);
    });
    $('end-retry').addEventListener('click', () => {
      const c = G.lastConfig;
      if (c) startRun(c);
      else showMenu();
    });
    $('end-menu').addEventListener('click', showMenu);
    $('end-endless').addEventListener('click', () => {
      if (G.continueEndless()) {
        sfx('wave');
        toast('Sonsuz mod: dalgalar zorlaşarak sürüyor. Her 10 dalgada bir patron!');
        UI.nextBetweenStep();
      }
    });
    $('end-share').addEventListener('click', () => {
      const input = $('end-share-text');
      const text = input.value;
      const done = () => toast('Sonuç kopyalandı');
      const fallback = () => {
        input.focus();
        input.select();
        toast('Metni seçtim; kopyalamak için Ctrl+C');
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
        else fallback();
      } catch (e) {
        fallback();
      }
    });

    // dokunmatik ve tıklanabilir yetenek düğmeleri
    const bindSkill = (id, p, action) => {
      $(id).addEventListener('pointerdown', (e) => {
        e.preventDefault();
        BR.Input.press(p, action);
      });
    };
    bindSkill('sk1-dash', 0, 'dash');
    bindSkill('sk1-abil', 0, 'ability');
    bindSkill('sk2-dash', 1, 'dash');
    bindSkill('sk2-abil', 1, 'ability');

    $('modal').addEventListener('click', (e) => {
      if (e.target === $('modal')) closeModal();
    });

    const save = () => BR.saveSettings();
    $('set-volume').addEventListener('input', (e) => {
      const v = Number(e.target.value) / 100;
      BR.settings.volume = v;
      $('set-volume-out').textContent = Math.round(v * 100);
      BR.Audio.setVolume(v);
      save();
    });
    $('set-volume').addEventListener('change', () => {
      BR.Audio.init();
      sfx('pickup');
    });
    $('set-music').addEventListener('input', (e) => {
      const v = Number(e.target.value) / 100;
      BR.settings.music = v;
      $('set-music-out').textContent = Math.round(v * 100);
      BR.Audio.init();
      BR.Audio.setMusicVolume(v);
      save();
    });
    $('set-speed').addEventListener('change', (e) => {
      const v = Number(e.target.value);
      BR.settings.speed = [0.75, 1, 1.25].includes(v) ? v : 1;
      save();
    });
    $('set-easy').addEventListener('change', (e) => {
      BR.settings.easy = e.target.checked;
      save();
    });
    $('set-cb').addEventListener('change', (e) => {
      BR.settings.colorblind = e.target.checked;
      UI.applyColorblind();
      save();
    });
    $('set-shake').addEventListener('change', (e) => {
      BR.settings.shake = e.target.checked;
      save();
    });
    $('set-hitstop').addEventListener('change', (e) => {
      BR.settings.hitstop = e.target.checked;
      save();
    });
    $('set-dmg').addEventListener('change', (e) => {
      BR.settings.dmgNumbers = e.target.checked;
      save();
    });
    $('set-vibrate').addEventListener('change', (e) => {
      BR.settings.vibrate = e.target.checked;
      save();
      if (e.target.checked) BR.haptic(40);
    });
    $('btn-fullscreen').addEventListener('click', toggleFullscreen);
    $('pause-fullscreen').addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    syncFullscreen();

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || (e.code === 'KeyP' && G.state === 'wave')) {
        handleBack();
        return;
      }
      if (UI.current === 'levelup' && /^Digit[1-4]$/.test(e.code) && $('modal').hidden && UI.chooseUpgrade) {
        UI.chooseUpgrade(Number(e.code.slice(5)) - 1);
      }
    });

    const unlock = () => {
      BR.Audio.init();
      UI.updateMusic();
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);

    BR.Input.onNav = UI.navigate;
    BR.Input.onPause = () => {
      if (G.state === 'wave') handleBack();
    };

    G.on('waveStart', (w) => {
      UI.hud = {};
      UI.show(null);
      blurActive();
      const arena = D.ARENAS[w.arena.id].name;
      banner('DALGA ' + w.n + (w.modId ? ' · ' + D.MODIFIERS[w.modId].name.toLocaleUpperCase('tr-TR') : ''), 1.8);
      if (w.n === 1 || D.arenaFor(w.n - 1) !== w.arena.id) toast(arena + ': ' + D.ARENAS[w.arena.id].desc);
      UI.updateMusic();
    });
    G.on('banner', (text) => banner(text, 2));
    G.on('between', () => {
      $('hud').hidden = true;
      UI.nextBetweenStep();
    });
    G.on('gameOver', () => showEnd(false));
    G.on('victory', () => showEnd(true));
    G.on('achievement', (def) => {
      UI.runAch.push(def);
      achToast(def);
    });

    showMenu();
  };

  BR.UI = UI;
})((window.BR = window.BR || {}));
