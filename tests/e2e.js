#!/usr/bin/env node
/* Kumpir Arena uçtan uca testleri.
   Gerekenler: Node 18+ ve Playwright (npm i -D playwright) ya da global kurulu Playwright.
   Çalıştırma: node tests/e2e.js  (ekran görüntüleri test-results/ klasörüne kaydedilir) */
'use strict';

const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  try {
    const globalRoot = require('child_process').execSync('npm root -g').toString().trim();
    ({ chromium } = require(path.join(globalRoot, 'playwright')));
  } catch (e2) {
    console.error('Playwright bulunamadı. Kurmak için: npm i -D playwright');
    process.exit(2);
  }
}

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test-results');
const PORT = 8000 + Math.floor(Math.random() * 900);
const URL = 'http://localhost:' + PORT + '/';
const BOT_SRC = fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8');

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + name);
  } else {
    failed++;
    console.log('  ✗ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : ''));
  }
}
function section(name) {
  console.log('\n' + name);
}

// Sayfa içi test yardımcıları
const HELPERS = `
window.__t = {
  // Manuel adımlı yeni koşu (gerçek zamanlı döngü durur)
  start(o) {
    const G = BR.Game;
    BR.Main.manual = true;
    BR.Input.reset();
    BR.Input.overrides = [null, null];
    G.newRun(Object.assign({ charId: 'allround', weaponId: 'pistol', danger: 0 }, o || {}));
    BR.Input.setCoop(!!(o && o.coop));
    return G.w;
  },
  // Sakin bir arena: doğma yok, düşman yok
  calm() {
    const w = BR.Game.w;
    w.enemies = [];
    w.markers = [];
    w.spawnQueue = [];
    w.ebullets = [];
    w.spawnT = 9999;
    w.treeT = 9999;
    w.specialDone = true;
    if (w.arena) {
      w.arena.burners = [];
      w.arena.pins = [];
      w.arena.pinT = 9999;
      w.arena.mud = [];
      w.arena.stalls = [];
    }
    return w;
  },
  step(n, god) {
    const G = BR.Game;
    for (let i = 0; i < n && G.state === 'wave'; i++) {
      if (god) G.w.players.forEach((p) => (p.invuln = 5));
      G.update(1 / 60);
    }
  },
  // kalkan, kaçınma ve dokunulmazlığı yok sayarak oyuncuyu öldürür
  kill(p) {
    const G = BR.Game;
    p.shield = false;
    p.invuln = 0;
    p.goldT = 0;
    G.stats.dodge = 0;
    G.X.hurtPlayer(p, 1e9);
  },
  spawn(type, x, y) {
    const e = BR.Game.X.spawnEnemy(type, x, y);
    return e;
  },
  stop() {
    BR.Main.manual = false;
    BR.Input.overrides = [null, null];
  },
};
`;

// Mobil düzen ölçümleri (sayfa içinde)
const MOB = `
window.__mob = {
  // ekran taşıyor mu, küçük ya da ekran dışında kalan dokunma hedefi var mı
  fits(id) {
    const s = id ? document.getElementById('scr-' + id) : null;
    if (s && s.hidden) return 'ekran gizli';
    if (document.documentElement.scrollWidth > window.innerWidth + 1) return 'sayfa yatay taşıyor';
    if (s && s.scrollWidth > s.clientWidth + 1) return 'ekran yatay taşıyor';
    const bad = Array.from((s || document).querySelectorAll('button, select'))
      .filter((b) => b.offsetParent !== null)
      .filter((b) => {
        const r = b.getBoundingClientRect();
        if (!r.width) return false;
        return r.height < 40 || r.width < 40 || r.right > window.innerWidth + 1 || r.left < -1;
      })
      .map((b) => (b.id || b.className) + ' ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height));
    return bad.length ? bad.join(', ') : 'ok';
  },
  overlaps(sels) {
    const rs = sels
      .map((s) => {
        const e = document.querySelector(s);
        if (!e || e.hidden || e.closest('[hidden]')) return null;
        const r = e.getBoundingClientRect();
        return r.width && r.height ? { s, r } : null;
      })
      .filter(Boolean);
    const out = [];
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i].r;
        const b = rs[j].r;
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(rs[i].s + ' × ' + rs[j].s);
      }
    return out;
  },
  inView(sel) {
    const r = document.querySelector(sel).getBoundingClientRect();
    return r.width > 0 && r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.right <= window.innerWidth + 1;
  },
  mapOverlaps() {
    const els = Array.from(document.querySelectorAll('#map-nodes .map-node, #map-nodes .node-mod')).map((e) => e.getBoundingClientRect());
    let n = 0;
    for (let i = 0; i < els.length; i++)
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i];
        const b = els[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) n++;
      }
    return n;
  },
};
`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(PORT)], { stdio: 'pipe' });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => {
      if (String(d).includes('localhost')) resolve();
    });
    server.on('exit', (c) => reject(new Error('sunucu kapandı: ' + c)));
    setTimeout(() => reject(new Error('sunucu başlamadı')), 5000);
  });

  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 } });
  const page = await ctx.newPage();
  const watch = (pg, tag) => {
    pg.on('pageerror', (e) => errors.push('pageerror' + tag + ': ' + e.message));
    pg.on('console', (m) => {
      if (m.type() !== 'error') return;
      const where = (m.location() && m.location().url) || '';
      if (/fonts\.(googleapis|gstatic)/.test(m.text() + where)) return;
      errors.push('console' + tag + ': ' + m.text() + ' @' + where);
    });
  };
  watch(page, '');
  const shot = (name) => page.screenshot({ path: path.join(OUT, name + '.png') });
  const visible = (sel) => page.isVisible(sel);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const loadHelpers = async () => {
    await page.addScriptTag({ content: HELPERS });
    await page.addScriptTag({ content: BOT_SRC });
  };

  try {
    /* ============================================================ */
    section('Menü ve ayarlar');
    await page.goto(URL, { waitUntil: 'load' });
    await ev(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await wait(300);
    await loadHelpers();
    check('ana menü görünüyor', await visible('#scr-menu'));
    check('kayıt yokken "Devam Et" gizli', !(await visible('#btn-continue')));
    check('menü müziği seçili', (await ev(() => BR.Audio.want)) === 'menu');
    await shot('01-menu');
    await page.click('#btn-help');
    check('nasıl oynanır ekranı açılıyor', await visible('#scr-help'));
    await page.click('#help-back');
    await page.click('#btn-settings');
    check('ayarlar açılıyor', await visible('#scr-settings'));
    check('yeni ayarlar mevcut (müzik, hız, kolay, renk körü, vuruş donması)', (await page.locator('#set-music, #set-speed, #set-easy, #set-cb, #set-hitstop').count()) === 5);
    await page.uncheck('#set-dmg');
    check('ayar kaydediliyor', await ev(() => JSON.parse(localStorage.getItem('kumpirArena.settings.v1')).dmgNumbers === false));
    await page.check('#set-dmg');
    await page.selectOption('#set-speed', '1.25');
    check('oyun hızı ayarı kaydedilir', await ev(() => BR.settings.speed === 1.25 && JSON.parse(localStorage.getItem('kumpirArena.settings.v1')).speed === 1.25));
    await page.selectOption('#set-speed', '1');
    await page.fill('#set-music', '20');
    await page.dispatchEvent('#set-music', 'input');
    check('müzik ses düzeyi ayarı', await ev(() => Math.abs(BR.settings.music - 0.2) < 0.001 && Math.abs(BR.Audio.musicVol - 0.2) < 0.001));
    await page.keyboard.press('Escape');
    check('Esc ile ayarlardan çıkılıyor', await visible('#scr-menu'));

    /* ============================================================ */
    section('Karakter seçimi, kilitler ve oyuncu sayısı');
    await page.click('#btn-new');
    check('karakter seçimi: 9 karakter', (await page.locator('#char-grid .card').count()) === 9);
    check('3 karakter başlangıçta kilitli', (await page.locator('#char-grid .card.locked').count()) === 3);
    await shot('02-characters');
    await page.click('#char-grid .card >> nth=6', { force: true }); // Haşlanmış (kilitli)
    check('kilitli karaktere tıklayınca ilerlemez', await visible('#scr-char'));
    check('kilit nedeni bildirilir', /Kilitli/.test(await page.textContent('#toast')));
    await page.click('#players-2');
    check('iki kişi seçilince kontrol notu görünür', await visible('#coop-note'));
    await page.click('#players-1');
    check('tek kişiye dönülebilir', !(await visible('#coop-note')));
    await page.click('#char-grid .card >> nth=4'); // Mühendis
    check('silah seçimi açılıyor', await visible('#scr-weapon'));
    await page.click('#weapon-back');
    await page.click('#char-grid .card >> nth=0'); // Çok Yönlü
    check('Çok Yönlü için 10 başlangıç silahı', (await page.locator('#weapon-grid .card').count()) === 10);
    await page.click('#weapon-grid .card >> nth=5'); // Tabanca
    check('tehlike seçimi açılıyor', await visible('#scr-danger'));
    await page.click('#danger-grid .card >> nth=0');
    await wait(250);
    check('dalga başladı ve HUD görünüyor', (await ev(() => BR.Game.state)) === 'wave' && (await visible('#hud')));
    check('karakter ve silah doğru', await ev(() => BR.Game.run.charId === 'allround' && BR.Game.run.weapons[0].id === 'pistol'));
    check('dalga müziği çalıyor', (await ev(() => BR.Audio.want)) === 'wave');
    check('arena etiketi gösteriliyor (Tarla)', (await page.textContent('#hud-arena')) === 'Tarla');

    /* ============================================================ */
    section('Hareket, atılma, yetenek');
    await ev(() => {
      BR.Game.w.players[0].invuln = 99;
    });
    const x0 = await ev(() => BR.Game.w.players[0].x);
    await page.keyboard.down('KeyD');
    await wait(700);
    await page.keyboard.up('KeyD');
    const moved = await ev(() => BR.Game.w.players[0].x);
    check('klavye ile hareket (D tuşu sağa götürür)', moved > x0 + 50, { x0, moved });
    await page.keyboard.press('Space');
    await wait(80);
    check('Boşluk ile atılma (bekleme süresi başladı)', await ev(() => BR.Game.w.players[0].dashCd > 0));
    const dashCd1 = await ev(() => BR.Game.w.players[0].dashCd);
    await page.keyboard.press('Space');
    await wait(50);
    check('bekleme sürerken ikinci atılma olmaz', (await ev(() => BR.Game.w.players[0].dashCd)) <= dashCd1);
    await ev(() => {
      BR.Game.w.players[0].abilCd = 0;
    });
    await page.keyboard.press('KeyE');
    await wait(80);
    check('E ile karakter yeteneği (Patates Yağmuru)', await ev(() => BR.Game.w.players[0].abilCd > 5 && BR.Game.w.bullets.some((b) => b.kind === 'spud')));
    check('yetenek düğmesinde ad ve bekleme gösteriliyor', (await page.textContent('#sk1-abil-name')) === 'Patates Yağmuru' && Number(await page.getAttribute('#sk1-abil', 'data-cd')) > 0);
    await wait(1500);
    await shot('03-wave');

    /* ============================================================ */
    section('Duraklatma ve hedef önceliği');
    await page.keyboard.press('Escape');
    check('Esc ile duraklatılıyor', (await ev(() => BR.Game.paused)) && (await visible('#scr-pause')));
    const tPaused = await ev(() => BR.Game.w.t);
    await wait(400);
    check('duraklatınca zaman durur', (await ev(() => BR.Game.w.t)) === tPaused);
    await page.click('#pause-weapons .slot >> nth=0');
    check('silah penceresinde hedef seçimi var', (await page.locator('#modal .target-seg .seg-btn').count()) === 3);
    await page.click('#modal .target-seg .seg-btn >> nth=1');
    check('hedef "en güçlü" olarak ayarlandı', await ev(() => BR.Game.run.weapons[0].target === 'strong' && BR.Game.w.players[0].weapons[0].target === 'strong'));
    await shot('04-target');
    await page.keyboard.press('Escape');
    check('silah yuvasında hedef rozeti', (await page.textContent('#pause-weapons .target-badge')) === 'G');
    await page.click('#pause-resume');
    check('devam düğmesi oyunu sürdürür', !(await ev(() => BR.Game.paused)));
    await page.click('#btn-pause');
    check('HUD duraklat düğmesi çalışır', await ev(() => BR.Game.paused));
    await page.keyboard.press('Escape');
    check('Esc ile devam', !(await ev(() => BR.Game.paused)));

    /* ============================================================ */
    section('Dalga arası: seviye, sandık, tezgah, dükkan sekmeleri');
    await ev(() => {
      const G = BR.Game;
      G.run.materials = 500;
      G.run.pendingLevels = 2;
      G.run.level += 2;
      G.run.crates.push(1);
      G.run.pantry = { kasar: 2, sosis: 2, misir: 2, tereyagi: 1 };
      G.w.t = G.w.duration;
    });
    await wait(2600);
    check('dalga sonu: seviye atlama ekranı', await visible('#scr-levelup'));
    check('4 geliştirme seçeneği', (await page.locator('#lvl-cards .card').count()) === 4);
    check('dükkan müziği', (await ev(() => BR.Audio.want)) === 'shop');
    await shot('05-levelup');
    const m0 = await ev(() => BR.Game.run.materials);
    await page.click('#lvl-reroll');
    check('geliştirme yenileme malzeme harcar', (await ev(() => BR.Game.run.materials)) < m0);
    await wait(300);
    const before = await ev(() => JSON.stringify(BR.Game.run.upgrades));
    await page.keyboard.press('Digit1');
    check('1 tuşu ile geliştirme seçilir', (await ev(() => JSON.stringify(BR.Game.run.upgrades))) !== before);
    await wait(300);
    const dbl = await ev(() => {
      const p0 = BR.Game.run.pendingLevels;
      document.getElementById('lvl-cards').firstChild.click();
      const p1 = BR.Game.run.pendingLevels;
      document.getElementById('lvl-cards').firstChild.click();
      return [p0, p1, BR.Game.run.pendingLevels];
    });
    check('çift tıklama yanlışlıkla ikinci seçimi yapmaz', dbl[1] === dbl[0] - 1, dbl);
    await wait(300);
    if (await visible('#scr-levelup')) await page.click('#lvl-cards .card >> nth=2');
    await wait(300);
    check('sandık ekranı geldi', await visible('#scr-crate'));
    await page.click('#crate-take');
    check('sandıktan eşya alındı', await ev(() => Object.keys(BR.Game.run.items).length >= 1));
    check('gece tezgahı açıldı (kilerde malzeme var)', await visible('#scr-stand'));
    await shot('06-stand');
    const served = await ev(() => {
      const G = BR.Game;
      const cust = G.standCurrent();
      const need = {};
      cust.order.forEach((id) => (need[id] = (need[id] || 0) + 1));
      G.run.pantry = Object.assign({}, G.run.pantry);
      Object.keys(need).forEach((id) => (G.run.pantry[id] = Math.max(G.run.pantry[id] || 0, need[id])));
      return cust.order.slice();
    });
    await ev(() => BR.UI.renderStand());
    for (const id of served) {
      await ev((id) => {
        const btns = Array.from(document.querySelectorAll('#stand-pantry .top-btn'));
        const name = BR.DATA.TOPPING_BY_ID[id].name;
        const b = btns.find((x) => x.textContent.startsWith(name));
        b.click();
      }, id);
    }
    check('tabağa sipariş kadar malzeme kondu', (await page.locator('#stand-plate .top-chip').count()) === served.length);
    const matsBeforeServe = await ev(() => BR.Game.run.materials);
    await page.click('#stand-serve');
    check('doğru sipariş servis edilince malzeme kazanılır', (await ev(() => BR.Game.run.materials)) > matsBeforeServe);
    await page.click('#stand-close');
    check('tezgah kapanınca dükkan açılır', await visible('#scr-shop'));
    check('dükkanda 4 teklif', (await page.locator('#shop-offers .card').count()) === 4);
    await shot('07-shop');

    // Kumpir sekmesi
    await ev(() => {
      BR.Game.run.pantry = { kasar: 1, tereyagi: 1, misir: 1, sosis: 1 };
      BR.Game.run.filling = [];
    });
    await page.click('#tab-kumpir');
    check('Kumpir sekmesi açılır', await visible('#pane-kumpir'));
    for (let i = 0; i < 4; i++) await page.click('#pane-kumpir .pantry .top-btn >> nth=0');
    check('4 malzeme kumpire kondu', (await ev(() => BR.Game.run.filling.length)) === 4);
    check('Klasik Kumpir tarifi etkin', await ev(() => BR.Game.activeRecipes(BR.Game.run).includes('klasik') && BR.Game.stats.damage >= 10));
    check('tarif kartı işaretli', (await page.locator('#pane-kumpir .recipe.on').count()) >= 1);
    await shot('08-kumpir');
    await page.click('#pane-kumpir .fill-slot >> nth=0');
    check('yuvadaki malzeme kilere geri döner', await ev(() => BR.Game.run.filling.length === 3 && BR.Game.pantryTotal() === 1));
    // Bahçe sekmesi
    await page.click('#tab-garden');
    await page.click('#pane-garden .seed-grid .btn-buy >> nth=0');
    check('Bahçe: tohum ekildi', await ev(() => BR.Game.run.seeds.length === 1 && BR.Game.run.seeds[0].id === 'sprout'));
    check('faiz bilgisi gösteriliyor', /Faiz/.test(await page.textContent('#pane-garden .interest')));
    // Evrim sekmesi
    await ev(() => {
      const G = BR.Game;
      G.run.weapons = [{ id: 'pistol', tier: 2, target: 'near' }, { id: 'smg', tier: 1, target: 'near' }];
      G.addItem(G.run, 'ammo');
      G.refresh();
    });
    await page.click('#tab-evo');
    check('Evrim sekmesinde 6 tarif', (await page.locator('#pane-evo .evo').count()) === 6);
    check('hazır evrim vurgulanıyor', (await page.locator('#pane-evo .evo.ready').count()) === 1);
    await shot('09-evo');
    await page.click('#pane-evo .evo.ready .btn-primary');
    check('Tabanca + Makineli Tüfek + Mermi Kutusu → Gatling', await ev(() => {
      const w = BR.Game.run.weapons;
      return w.length === 1 && w[0].id === 'gatling' && w[0].tier === 4 && BR.Game.run.items.ammo === 1 && BR.Meta.has('evolve');
    }));
    check('evrimden sonra envanter sekmesine dönülür', await visible('#pane-inv'));

    // Klasik dükkan işlemleri
    const lockOk = await ev(() => {
      document.querySelector('#shop-offers .btn-lock').click();
      return BR.Game.run.shop[0].locked === true;
    });
    check('kilitleme çalışır', lockOk);
    const kept = await ev(() => JSON.stringify(BR.Game.run.shop[0]));
    await page.click('#shop-reroll');
    check('yenileme sonrası kilitli teklif kalır', (await ev(() => JSON.stringify(BR.Game.run.shop[0]))) === kept);
    await ev(() => {
      const G = BR.Game;
      G.run.materials = 9999;
      G.run.shop[1] = { kind: 'item', id: 'helmet', tier: 1, locked: false };
      G.run.shop[2] = { kind: 'weapon', id: 'pistol', tier: 1, locked: false };
      BR.UI.renderShop();
    });
    const armorBefore = await ev(() => BR.Game.stats.armor);
    await page.click('#shop-offers .card >> nth=1 >> .btn-buy');
    check('eşya satın alma istatistiği değiştirir (Kask +2 zırh)', (await ev(() => BR.Game.stats.armor)) === armorBefore + 2);
    await page.click('#shop-offers .card >> nth=2 >> .btn-buy');
    check('silah satın alındı', (await ev(() => BR.Game.run.weapons.length)) === 2);
    await page.click('#shop-weapons .slot >> nth=1');
    check('silah detay penceresi', await visible('#modal'));
    await page.click('#modal-actions .btn >> nth=1'); // Sat
    check('silah satıldı', await ev(() => BR.Game.run.weapons.length === 1));
    check('kayıt oluştu', await ev(() => !!localStorage.getItem('kumpirArena.save.v1')));

    /* ============================================================ */
    section('Rota haritası, olay, dinlenme');
    await page.click('#shop-go');
    check('Haritaya Git → rota haritası', await visible('#scr-map'));
    const mapInfo = await ev(() => {
      const r = BR.Game.run;
      return {
        layers: Object.keys(r.map.layers).length,
        l20: r.map.layers[20].map((n) => n.type),
        l11: r.map.layers[11].map((n) => n.type),
        l16: r.map.layers[16].map((n) => n.type),
        picks: document.querySelectorAll('#map-nodes .map-node.pick').length,
        opts: BR.Game.mapOptions().length,
      };
    });
    check('harita 20 katman', mapInfo.layers >= 20, mapInfo);
    check('20. katman tek patron düğümü', mapInfo.l20.length === 1 && mapInfo.l20[0] === 'boss', mapInfo);
    check('11. ve 16. katmanlar elit', mapInfo.l11.every((t) => t === 'elite') && mapInfo.l16.every((t) => t === 'elite'), mapInfo);
    check('seçilebilir düğümler parlıyor', mapInfo.picks === mapInfo.opts && mapInfo.picks >= 1, mapInfo);
    check('haritada "Buradasın" işareti', (await page.locator('#map-nodes .node-here').count()) === 1);
    await shot('10-map');
    await page.click('#map-back');
    check('haritadan dükkana dönülebilir', await visible('#scr-shop'));
    await page.click('#shop-go');
    // Kayıt/devam: harita aşaması
    await page.reload({ waitUntil: 'load' });
    await wait(300);
    await loadHelpers();
    await page.click('#btn-continue');
    check('devam: harita aşamasına dönüldü', await visible('#scr-map'));
    // olay düğümünü zorla
    const evRes = await ev(() => {
      const G = BR.Game;
      const opt = G.mapOptions()[0];
      opt.type = 'event';
      opt.mod = null;
      return opt.id;
    });
    await wait(300);
    await ev((id) => {
      const b = Array.from(document.querySelectorAll('#map-info .map-opt'))[0];
      if (b) b.click();
      else BR.Game.chooseNode(id);
    }, evRes);
    check('olay düğümü seçilince olay ekranı', await visible('#scr-event'));
    check('olay seçenekleri listeleniyor', (await page.locator('#event-choices .choice').count()) >= 2);
    await shot('11-event');
    await page.reload({ waitUntil: 'load' });
    await wait(300);
    await loadHelpers();
    await page.click('#btn-continue');
    check('devam: olay aşamasına dönüldü', await visible('#scr-event'));
    await wait(300);
    await page.click('#event-choices .choice:not([disabled]) >> nth=-1');
    check('seçim sonrası sonuç ve "Dalgayı Başlat"', (await visible('#event-result')) && (await visible('#event-go')));
    await wait(300);
    await page.click('#event-go');
    await wait(200);
    check('olaydan sonra dalga 2 başladı', await ev(() => BR.Game.state === 'wave' && BR.Game.w.n === 2));
    // dinlenme
    await ev(() => {
      const G = BR.Game;
      G.w.players.forEach((p) => (p.invuln = 99));
      G.w.t = G.w.duration;
    });
    await wait(2300);
    await ev(() => {
      const G = BR.Game;
      while (G.run.pendingLevels > 0) {
        G.getUpgradeOffer();
        G.chooseUpgrade(0);
      }
      while (G.run.crates.length) G.takeCrate(true);
      if (G.run.stand || G.standAvailable()) {
        G.standStart();
        G.standClose();
      }
      BR.UI.nextBetweenStep();
      BR.UI.showMap();
      const opt = G.mapOptions()[0];
      opt.type = 'rest';
      opt.mod = null;
    });
    await wait(300);
    await page.click('#map-info .map-opt >> nth=0');
    check('dinlenme ekranı', await visible('#scr-rest'));
    check('4 dinlenme seçeneği', (await page.locator('#rest-choices .choice').count()) === 4);
    await shot('12-rest');
    const restBefore = await ev(() => ({ wave: BR.Game.run.wave, level: BR.Game.run.level }));
    await wait(300);
    await page.click('#rest-choices .choice >> nth=0'); // Kestir: +1 seviye
    const restAfter = await ev(() => ({ wave: BR.Game.run.wave, level: BR.Game.run.level, cur: BR.UI.current }));
    check('dinlenme bir katman sayılır ve ödül verir', restAfter.wave === restBefore.wave + 1 && restAfter.level === restBefore.level + 1, { restBefore, restAfter });
    check('dinlenmeden sonra seviye seçimi gelir', restAfter.cur === 'levelup', restAfter);
    await ev(() => BR.UI.showMenu());

    /* ============================================================ */
    section('Eski (v1) kayıt yükseltmesi');
    await ev(() => {
      localStorage.setItem('kumpirArena.save.v1', JSON.stringify({
        v: 1, charId: 'allround', weapons: [{ id: 'pistol', tier: 2 }], wave: 3, items: { helmet: 1 }, danger: 1, crates: [],
        level: 3, xp: 5, pendingLevels: 0, materials: 40, bag: 0, kills: 100, matsTotal: 200, rerolls: 0, upgrades: {}, bonus: {},
        phase: 'shop', shop: null, shopFor: -1,
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await wait(300);
    await loadHelpers();
    check('v1 kaydı için "Devam Et" görünür', await visible('#btn-continue'));
    await page.click('#btn-continue');
    check('v1 kaydı dükkanda açılır ve v2 alanları tamamlanır', (await visible('#scr-shop')) && (await ev(() => {
      const r = BR.Game.run;
      return r.v === 2 && BR.Game.validMap(r) && r.weapons[0].target === 'near' && Array.isArray(r.seeds) && typeof r.seed === 'number';
    })));
    await page.click('#shop-go');
    check('yükseltilmiş kayıtta harita çalışır (4. katman seçenekleri)', (await visible('#scr-map')) && (await ev(() => BR.Game.mapOptions().every((n) => n.layer === 4))));
    await ev(() => {
      localStorage.removeItem('kumpirArena.save.v1');
      BR.UI.showMenu();
    });

    /* ============================================================ */
    section('Tohumlu rastgelelik (aynı tohum = aynı koşu yapısı)');
    const seedRes = await ev(() => {
      const G = BR.Game;
      const snap = (extraLevels) => {
        __t.start({ seed: 424242 });
        const out = { map: JSON.stringify(G.run.map), boss: G.run.boss, mud: JSON.stringify(G.w.arena.mud) };
        G.run.level += extraLevels;
        G.run.pendingLevels += extraLevels;
        for (let i = 0; i < extraLevels; i++) {
          G.getUpgradeOffer();
          G.chooseUpgrade(0);
        }
        G.enterShop();
        out.shop = JSON.stringify(G.run.shop.map((o) => o.kind + o.id + o.tier));
        G.run.materials = 999;
        G.reroll();
        out.reroll = JSON.stringify(G.run.shop.map((o) => o.kind + o.id + o.tier));
        return out;
      };
      const a = snap(0);
      const b = snap(3);
      __t.start({ seed: 99 });
      const c = { map: JSON.stringify(G.run.map) };
      __t.stop();
      return { sameMap: a.map === b.map, sameBoss: a.boss === b.boss, sameArena: a.mud === b.mud, sameShop: a.shop === b.shop, sameReroll: a.reroll === b.reroll, diff: a.map !== c.map };
    });
    check('aynı tohum: aynı harita ve patron', seedRes.sameMap && seedRes.sameBoss, seedRes);
    check('aynı tohum: aynı arena yerleşimi', seedRes.sameArena, seedRes);
    check('farklı seviye sayısına rağmen aynı dükkan ve yenileme', seedRes.sameShop && seedRes.sameReroll, seedRes);
    check('farklı tohum: farklı harita', seedRes.diff, seedRes);

    /* ============================================================ */
    section('Karakter yetenekleri (9 karakter)');
    const abil = await ev(() => {
      const G = BR.Game;
      const D = BR.DATA;
      const out = {};
      D.CHARACTERS.forEach((ch) => {
        const w = __t.start({ charId: ch.id, weaponId: ch.starters[0] || null });
        __t.calm();
        const p = w.players[0];
        p.invuln = 99;
        p.hp = 1;
        const e = __t.spawn('bruiser', p.x + 80, p.y);
        e.speed = 0;
        const hp0 = e.hp;
        const mats0 = G.run.materials;
        p.abilCd = 0;
        const ok = G.useAbility(p);
        const cdOk = Math.abs(p.abilCd - D.ABILITIES[ch.ability].cd) < 1e-6;
        const again = G.useAbility(p);
        __t.step(40);
        let effect;
        switch (ch.ability) {
          case 'spudrain': effect = e.hp < hp0; break;
          case 'quake': case 'steam': case 'cleave': effect = e.hp < hp0; break;
          case 'focus': effect = p.focusT > 0; break;
          case 'firering': effect = e.hp < hp0 && (!!e.burn || e.hp < hp0 - 10); break;
          case 'deploy': effect = w.turrets.some((t) => t.temp > 0); break;
          case 'dice': effect = G.run.materials > mats0 || p.goldT > 0 || p.hp > 1; break;
          case 'cloud': effect = w.clouds.length === 1 && e.hp < hp0; break;
          default: effect = false;
        }
        out[ch.id] = ok && cdOk && !again && effect;
      });
      __t.stop();
      return out;
    });
    check('her karakterin yeteneği çalışır ve bekleme süresine girer', Object.values(abil).every(Boolean), abil);

    /* ============================================================ */
    section('Hedef önceliği');
    const targ = await ev(() => {
      const G = BR.Game;
      const res = {};
      ['near', 'strong', 'weak'].forEach((mode) => {
        const w = __t.start({ weaponId: 'pistol' });
        __t.calm();
        const p = w.players[0];
        p.invuln = 99;
        G.setTarget(0, mode);
        const near = __t.spawn('chaser', p.x - 140, p.y);
        const far = __t.spawn('bruiser', p.x + 300, p.y);
        near.speed = 0;
        far.speed = 0;
        if (mode === 'weak') far.hp = 1;
        const farHp = far.hp;
        // ilk vurulan düşman hangisi?
        let first = null;
        for (let i = 0; i < 120 && !first; i++) {
          __t.step(1);
          if (near.hp < near.maxHp) first = 'near';
          else if (far.hp < farHp || far.dead) first = 'far';
        }
        res[mode] = { near: first === 'near', far: first === 'far' };
      });
      __t.stop();
      return res;
    });
    check('en yakın: yakındaki düşmana ateş', targ.near.near && !targ.near.far, targ);
    check('en güçlü: uzaktaki iri düşmana ateş', targ.strong.far && !targ.strong.near, targ);
    check('en az canlı: canı az kalana ateş', targ.weak.far && !targ.weak.near, targ);

    /* ============================================================ */
    section('Tetiklenen (kural değiştiren) eşyalar');
    const fx = await ev(() => {
      const G = BR.Game;
      const D = BR.DATA;
      const out = {};
      const fxItems = D.ITEMS.filter((i) => i.fx);
      out.flags = fxItems.every((it) => {
        __t.start({});
        G.addItem(G.run, it.id);
        G.refresh();
        return G.fx[it.fx] === 1;
      });
      out.count = fxItems.length;
      // Kalkan üreteci: ilk darbeyi emer
      let w = __t.start({});
      G.addItem(G.run, 'shieldgen');
      G.refresh();
      G.run.wave = 1;
      G.startNextWave();
      w = __t.calm();
      let p = w.players[0];
      p.invuln = 0;
      const hp0 = p.hp;
      G.X.hurtPlayer(p, 5);
      out.shield = p.hp === hp0 && p.shield === false;
      // Dikenli zırh: hasar alınca çevreye hasar
      w = __t.start({});
      G.addItem(G.run, 'thornarmor');
      G.refresh();
      __t.calm();
      p = w.players[0];
      p.invuln = 0;
      let e = __t.spawn('bruiser', p.x + 60, p.y);
      G.X.hurtPlayer(p, 3);
      out.thorns = e.hp < e.maxHp;
      // Gölge pelerini: kaçınınca görünmezlik
      w = __t.start({});
      G.addItem(G.run, 'shadowcloak');
      G.refresh();
      __t.calm();
      p = w.players[0];
      p.invuln = 0;
      G.stats.dodge = 60;
      const rnd = Math.random;
      Math.random = () => 0;
      G.X.hurtPlayer(p, 3);
      Math.random = rnd;
      out.dodgeInvis = p.invisT > 0;
      // Öfke maskesi: canı azken hasar artar
      w = __t.start({});
      G.addItem(G.run, 'ragemask');
      G.refresh();
      p = w.players[0];
      const m1 = G.X.ownerMult(p);
      p.hp = 1;
      out.rage = G.X.ownerMult(p) > m1 * 1.4;
      // Bomba yeleği: 15 öldürmede bir patlama
      w = __t.start({});
      G.addItem(G.run, 'bombvest');
      G.refresh();
      __t.calm();
      p = w.players[0];
      const ex0 = w.explosions.length;
      for (let i = 0; i < 15; i++) {
        e = __t.spawn('baby', p.x + 300, p.y + 200);
        G.X.damageEnemy(e, 9999, {});
      }
      out.killBlast = w.explosions.length > ex0;
      // Zincir yıldırım: kritik vuruş yakındaki düşmana sıçrar
      w = __t.start({});
      G.addItem(G.run, 'chainlight');
      G.refresh();
      __t.calm();
      p = w.players[0];
      const a = __t.spawn('bruiser', p.x + 300, p.y);
      const b = __t.spawn('bruiser', p.x + 360, p.y);
      G.X.damageEnemy(a, 20, { crit: true, weapon: true, owner: p });
      out.chain = b.hp < b.maxHp;
      // Kumbara: faiz sınırı artar
      __t.start({});
      const cap0 = G.interestCap();
      G.addItem(G.run, 'piggybank');
      G.refresh();
      out.interest = G.interestCap() === cap0 + 10;
      // Sihirli fasulye: tohumlar 1 dalga erken olgunlaşır
      __t.start({});
      G.addItem(G.run, 'magicbean');
      G.refresh();
      G.run.materials = 999;
      G.plantSeed('rare');
      out.seedGrow = G.run.seeds[0].grow === D.SEED_BY_ID.rare.waves - 1;
      __t.stop();
      return out;
    });
    check(fx.count + ' tetiklenen eşyanın hepsi etkinleşir', fx.flags, fx);
    check('Kalkan Jeneratörü ilk darbeyi emer', fx.shield, fx);
    check('Diken Zırhı hasar alınca çevreye vurur', fx.thorns, fx);
    check('Gölge Pelerini kaçınınca görünmez yapar', fx.dodgeInvis, fx);
    check('Öfke Maskesi canın azken hasarı artırır', fx.rage, fx);
    check('Bomba Yeleği öldürme serisinde patlar', fx.killBlast, fx);
    check('Zincir Yıldırım kritikte sıçrar', fx.chain, fx);
    check('Kumbara faiz sınırını artırır', fx.interest, fx);
    check('Sihirli Fasulye tohumları hızlandırır', fx.seedGrow, fx);

    /* ============================================================ */
    section('Silah evrimi');
    const evo = await ev(() => {
      const G = BR.Game;
      const D = BR.DATA;
      const out = {};
      D.EVOLUTIONS.forEach((e) => {
        __t.start({ weaponId: e.a });
        G.run.weapons.push({ id: e.b, tier: 1, target: 'near' });
        const notReady = !G.evoStatus().find((x) => x.id === e.id).ready;
        G.addItem(G.run, e.item);
        G.refresh();
        const ready = G.evoStatus().find((x) => x.id === e.id).ready;
        const ok = G.evolve(e.id);
        const ws = G.run.weapons.map((x) => x.id);
        out[e.id] = notReady && ready && ok && ws.length === 1 && ws[0] === e.id && G.run.items[e.item] === 1;
        // evrim silahı dalgada sorunsuz çalışır (yakına bir düşman koy ki yakın dövüş silahı da vursun)
        G.run.wave = 4;
        G.startNextWave();
        const pl = G.w.players[0];
        __t.spawn('chaser', pl.x + 70, pl.y);
        __t.step(60 * 6, true);
        out[e.id] = out[e.id] && G.run.kills > 0;
      });
      const shopEvo = (() => {
        __t.start({});
        for (let i = 0; i < 200; i++) {
          G.run.shopFor = -1;
          G.run.wave = 1 + (i % 19);
          G.enterShop();
          if (G.run.shop.some((o) => o.kind === 'weapon' && D.WEAPON_BY_ID[o.id].evo)) return true;
        }
        return false;
      })();
      __t.stop();
      return { out, shopEvo };
    });
    check('6 evrim tarifinin hepsi çalışır ve evrim silahları savaşır', Object.values(evo.out).every(Boolean), evo);
    check('evrim silahları dükkanda çıkmaz', !evo.shopEvo, evo);

    /* ============================================================ */
    section('Yeni düşmanlar');
    const foes = await ev(() => {
      const G = BR.Game;
      const out = {};
      let w = __t.start({ weaponId: 'pistol' });
      G.run.weapons = [];
      G.refresh();
      G.run.wave = 6;
      G.startNextWave();
      w = __t.calm();
      w.players[0].weapons = [];
      const p = w.players[0];
      p.invuln = 99;
      // Pelte: ölünce ikiye bölünür
      const sl = __t.spawn('slime', p.x + 250, p.y);
      G.X.damageEnemy(sl, 9999, {});
      __t.step(1);
      out.slime = w.enemies.filter((e) => !e.dead && e.type === 'slimelet').length === 2;
      // Şifacı: yakındaki yaralı düşmanı iyileştirir
      w.enemies = [];
      const hl = __t.spawn('healer', 300, 300);
      const hurt = __t.spawn('bruiser', 360, 300);
      hl.speed = 0;
      hurt.speed = 0;
      hurt.hp = hurt.maxHp / 2;
      hl.healT = 0.05;
      __t.step(10);
      out.healer = hurt.hp > hurt.maxHp / 2;
      // Kalkanlı: önden gelen mermiyi durdurur
      w.enemies = [];
      G.run.weapons = [{ id: 'pistol', tier: 4, target: 'near' }];
      G.refresh();
      G.syncWeaponTargets();
      const before = w.players[0].weapons.length;
      w.players[0].weapons = [];
      G.run.wave = 6;
      G.startNextWave();
      w = __t.calm();
      const pp = w.players[0];
      pp.invuln = 99;
      const sh = __t.spawn('shielder', pp.x + 250, pp.y);
      sh.speed = 0;
      __t.step(120);
      out.shielder = sh.hp === sh.maxHp && w.players[0].weapons.length >= 1;
      out.shielderGuns = before;
      // Hırsız: yerdeki malzemeyi çalar, öldürülünce geri bırakır
      w.enemies = [];
      w.players[0].weapons = [];
      pp.x = 1800;
      pp.y = 1200;
      const th = __t.spawn('thief', 300, 300);
      w.pickups.push({ kind: 'mat', x: 340, y: 300, value: 1, vx: 0, vy: 0, t: 0, dead: false, magnet: false, born: 1 });
      __t.step(40);
      out.thiefStole = th.stolen > 0;
      const pk0 = w.pickups.filter((x) => !x.dead).length;
      G.X.damageEnemy(th, 9999, {});
      out.thiefDrop = w.pickups.filter((x) => !x.dead && x.kind === 'mat').length > pk0;
      // Her tür dalgada doğabilir
      out.table = ['thief', 'slime', 'healer', 'shielder'].every((t) => [5, 8, 10, 12, 15, 18].some((n) => BR.DATA.spawnTable(n).some((r) => r.v === t)));
      __t.stop();
      return out;
    });
    check('Pelte ölünce iki küçük pelteye bölünür', foes.slime, foes);
    check('Şifacı yaralı düşmanı iyileştirir', foes.healer, foes);
    check('Kalkanlı önden gelen mermileri durdurur', foes.shielder, foes);
    check('Hırsız malzeme çalar ve öldürülünce geri bırakır', foes.thiefStole && foes.thiefDrop, foes);
    check('yeni düşmanlar doğma tablosunda', foes.table, foes);

    /* ============================================================ */
    section('Elit özellikleri');
    const elite = await ev(() => {
      const G = BR.Game;
      const out = {};
      let w = __t.start({ danger: 0 });
      G.run.wave = 10;
      G.startNextWave();
      out.d0 = G.w.elite && G.w.eliteAffixes.length === 1;
      __t.start({ danger: 2 });
      G.run.wave = 10;
      G.startNextWave();
      out.d2 = G.w.eliteAffixes.length === 2;
      w = __t.calm();
      w.players[0].invuln = 99;
      w.eliteAffixes = ['armored'];
      let e = __t.spawn('elite', 400, 400);
      const h0 = e.hp;
      G.X.damageEnemy(e, 100, {});
      out.armored = Math.round(h0 - e.hp) === 60;
      w.eliteAffixes = ['regen'];
      e = __t.spawn('elite', 400, 400);
      e.hp = e.maxHp / 2;
      e.speed = 0;
      __t.step(60, true);
      out.regen = e.hp > e.maxHp / 2;
      w.eliteAffixes = ['explosive'];
      e = __t.spawn('elite', 400, 400);
      const eb0 = w.ebullets.length;
      G.X.damageEnemy(e, 1e9, {});
      out.explosive = w.ebullets.length >= eb0 + 20;
      w.eliteAffixes = ['fast'];
      e = __t.spawn('elite', 400, 400);
      const def = BR.DATA.ENEMIES.elite;
      out.fast = e.speed > def.speed[1] * 1.2;
      const crates0 = G.run.eliteKills;
      G.X.damageEnemy(e, 1e9, {});
      out.drop = G.run.eliteKills === crates0 + 1 && w.pickups.some((p) => p.kind === 'crate' && p.value === 3);
      __t.stop();
      return out;
    });
    check('elit dalgada tehlikeye göre 1 ya da 2 özellik', elite.d0 && elite.d2, elite);
    check('Zırhlı elit %40 az hasar alır', elite.armored, elite);
    check('Yenilenen elit can kazanır', elite.regen, elite);
    check('Patlayan elit ölünce mermi halkası saçar', elite.explosive, elite);
    check('Hızlı elit daha hızlıdır', elite.fast, elite);
    check('elit ölünce destansı sandık bırakır', elite.drop, elite);

    /* ============================================================ */
    section('Üç patron');
    const bosses = await ev(() => {
      const G = BR.Game;
      const out = {};
      BR.DATA.BOSSES.forEach((id) => {
        __t.start({ weaponId: 'smg' });
        G.run.boss = id;
        G.run.wave = 19;
        G.run.node = { type: 'boss', mod: null };
        G.startNextWave();
        const w = G.w;
        const typeOk = w.bossType === id && BR.Audio.want === 'boss';
        __t.step(60 * 5, true);
        const boss = w.bosses.find((b) => b.type === id);
        __t.step(60 * 12, true);
        const alive = !!boss && !boss.dead;
        if (boss) G.X.damageEnemy(boss, 1e12, {});
        __t.step(60 * 3, true);
        out[id] = { typeOk, spawned: !!boss, alive, victory: G.state === 'victory', endShown: !document.getElementById('scr-end').hidden, errors: BR.Main.errors };
      });
      // patron koşu başında rastgele seçilir
      const seen = {};
      for (let i = 0; i < 40; i++) {
        __t.start({});
        seen[G.run.boss] = true;
      }
      out.random = Object.keys(seen).length === 3;
      __t.stop();
      return out;
    });
    const BOSS_NAMES = { boss: 'Kraliçe Zorg', kroz: 'Gözcü Kroz', mother: 'Yumurta Ana' };
    for (const id of ['boss', 'kroz', 'mother']) {
      const b = bosses[id];
      check(BOSS_NAMES[id] + ': doğar, 12 sn savaşır, ölünce zafer ekranı', b && b.typeOk && b.spawned && b.alive && b.victory && b.endShown && b.errors === 0, b);
    }
    check('20. dalga patronu koşu başında rastgele seçilir (3 farklı)', bosses.random, bosses);
    await ev(() => BR.UI.showMenu());

    /* ============================================================ */
    section('Arenalar');
    const arenas = await ev(() => {
      const G = BR.Game;
      const A = BR.Arena;
      const out = {};
      const at = (n) => {
        __t.start({});
        G.run.wave = n - 1;
        G.startNextWave();
        return G.w;
      };
      let w = at(1);
      out.field = w.arena.id === 'field' && w.arena.mud.length >= 3;
      const m = w.arena.mud[0];
      out.mud = A.speedMult(w, m.x, m.y, true) < 1 && A.speedMult(w, m.x, m.y, false) < 1;
      w = at(8);
      out.kitchen = w.arena.id === 'kitchen' && w.arena.burners.length >= 3;
      const p = w.players[0];
      w.enemies = [];
      w.spawnT = 9999;
      const bn = w.arena.burners[0];
      bn.state = 'hot';
      bn.t = 2;
      p.x = bn.x;
      p.y = bn.y;
      p.invuln = 0;
      const hp0 = p.hp;
      G.stats.dodge = 0;
      __t.step(2);
      out.burner = p.hp < hp0;
      p.invuln = 99;
      w.arena.pinT = 0;
      __t.step(2);
      out.pin = w.arena.pins.length >= 1;
      w = at(15);
      out.market = w.arena.id === 'market' && w.arena.stalls.length >= 3;
      const st = w.arena.stalls[0];
      const q = w.players[0];
      q.x = st.x + st.w / 2;
      q.y = st.y + st.h / 2;
      A.collide(w, q);
      out.stall = !A.blocked(w, q.x, q.y, 0);
      // tezgah düşman mermisini durdurur
      w.enemies = [];
      w.spawnT = 9999;
      q.x = st.x - 200;
      q.y = st.y + st.h / 2;
      q.invuln = 99;
      w.ebullets.push({ x: st.x + st.w + 40, y: st.y + st.h / 2, vx: -400, vy: 0, r: 9, dmg: 1, life: 6, dead: false });
      __t.step(30);
      out.cover = w.ebullets.length === 0 || w.ebullets.every((b) => b.dead || b.x > st.x);
      out.cycle = [1, 7, 8, 14, 15, 20, 22].map((n) => BR.DATA.arenaFor(n)).join(',');
      __t.stop();
      return out;
    });
    check('Tarla: çamur birikintileri yavaşlatır', arenas.field && arenas.mud, arenas);
    check('Mutfak: ocak gözü yakar, oklava yuvarlanır', arenas.kitchen && arenas.burner && arenas.pin, arenas);
    check('Pazar Yeri: tezgahlar engel ve siper', arenas.market && arenas.stall && arenas.cover, arenas);
    check('arena sırası 7 dalgada bir değişir', arenas.cycle === 'field,field,kitchen,kitchen,market,market,field', arenas);

    /* ============================================================ */
    section('Dalga değiştiricileri');
    const mods = await ev(() => {
      const G = BR.Game;
      const D = BR.DATA;
      const out = {};
      const hpAt = (mod) => {
        __t.start({});
        G.run.wave = 4;
        G.run.node = { type: 'normal', mod };
        G.startNextWave();
        __t.calm();
        return __t.spawn('chaser', 300, 300).maxHp;
      };
      const base = hpAt(null);
      out.giants = Math.abs(hpAt('giants') / base - 1.6) < 0.01;
      out.calm = Math.abs(hpAt('calm') / base - 0.8) < 0.01;
      out.label = G.w.modId === 'calm' && G.hud().mod === D.MODIFIERS.calm.name;
      // Altın Yağmuru: düşman daha sert, malzeme iki kat
      __t.start({});
      G.run.wave = 4;
      G.run.node = { type: 'normal', mod: 'gold' };
      G.startNextWave();
      __t.calm();
      const e = __t.spawn('chaser', 300, 300);
      out.gold = G.w.mod.mats === 2 && e.dmg >= Math.round((D.ENEMIES.chaser.dmg + D.ENEMIES.chaser.dmgW * 4) * 1.4) - 1;
      // Kalabalık: dalga sonunda sandık
      __t.start({});
      G.run.wave = 4;
      G.run.node = { type: 'normal', mod: 'crowd' };
      G.startNextWave();
      __t.calm();
      G.w.players[0].invuln = 99;
      const c0 = G.run.crates.length;
      G.w.t = G.w.duration;
      __t.step(2);
      out.crowd = G.run.crates.length === c0 + 1;
      // haritadaki her düğüm türü ve değiştirici geçerli
      const r = G.run;
      out.mapValid = Object.keys(r.map.layers).every((L) => r.map.layers[L].every((n) => D.NODE_TYPES[n.type] && (n.mod === null || D.MODIFIERS[n.mod])));
      __t.stop();
      return out;
    });
    check('Dev Uzaylılar ve Sakin Gece düşman canını değiştirir', mods.giants && mods.calm, mods);
    check('değiştirici HUD etiketinde', mods.label, mods);
    check('Altın Yağmuru: iki kat malzeme, sert düşman', mods.gold, mods);
    check('Kalabalık: dalga sonunda sandık', mods.crowd, mods);
    check('harita düğümleri geçerli', mods.mapValid, mods);

    /* ============================================================ */
    section('Olaylar, tohumlar ve faiz');
    const evs = await ev(() => {
      const G = BR.Game;
      const D = BR.DATA;
      const out = { ok: true, fails: [] };
      Object.keys(D.EVENTS).forEach((id) => {
        __t.start({});
        const r0 = JSON.parse(JSON.stringify(G.run));
        r0.materials = 300;
        r0.event = { id, done: false, result: null };
        r0.phase = 'event';
        G.run = r0;
        G.state = 'event';
        const choices = G.eventChoices();
        if (choices.length < 2) {
          out.ok = false;
          out.fails.push(id + ':az seçenek');
        }
        choices.forEach((c, i) => {
          const r = JSON.parse(JSON.stringify(r0));
          G.run = r;
          G.refresh();
          if (!c.enabled) return;
          const text = G.chooseEvent(i);
          if (typeof text !== 'string' || !text.length || !r.event.done) {
            out.ok = false;
            out.fails.push(id + ':' + i);
          }
          if (G.chooseEvent(i) !== null) {
            out.ok = false;
            out.fails.push(id + ':iki kez');
          }
        });
      });
      // tohum: 2 dalga sonra sandık
      __t.start({});
      G.run.materials = 100;
      const pr = G.plantSeed('sprout');
      G.layerEnd();
      const mid = G.run.seeds.length === 1 && G.run.crates.length === 0;
      G.layerEnd();
      out.seed = pr.ok && mid && G.run.seeds.length === 0 && G.run.crates[0] === 2;
      out.seedMax = (() => {
        G.run.materials = 999;
        G.plantSeed('sprout');
        G.plantSeed('sprout');
        G.plantSeed('sprout');
        return !G.plantCheck('sprout').ok && G.run.seeds.length === D.MAX_SEEDS;
      })();
      // faiz: her 10 malzemeye 1, en fazla 10
      G.run.materials = 75;
      const i1 = G.layerEnd().interest;
      G.run.materials = 500;
      const i2 = G.layerEnd().interest;
      out.interest = i1 === 7 && i2 === 10;
      __t.stop();
      return out;
    });
    check('9 olayın her seçeneği hatasız sonuç verir ve bir kez seçilir', evs.ok, evs.fails);
    check('tohum ekilir, 2 katman sonra sandık verir', evs.seed, evs);
    check('bahçe en fazla 3 tohum alır', evs.seedMax, evs);
    check('faiz: her 10 malzemeye +1, en fazla 10', evs.interest, evs);

    /* ============================================================ */
    section('Kumpir malzemeleri, tarifler, tezgah');
    const kum = await ev(() => {
      const G = BR.Game;
      const D = BR.DATA;
      const out = {};
      __t.start({});
      // düşmanlardan malzeme düşer
      let drops = 0;
      const w = __t.calm();
      for (let i = 0; i < 300; i++) {
        const e = __t.spawn('chaser', 300, 300);
        G.X.damageEnemy(e, 1e9, {});
      }
      drops = w.pickups.filter((p) => p.kind === 'top').length;
      out.drops = drops > 0;
      // her tarif doğru malzemelerle etkinleşir
      out.recipes = D.RECIPES.every((rc) => {
        __t.start({});
        G.run.pantry = {};
        rc.needs.forEach((id) => (G.run.pantry[id] = (G.run.pantry[id] || 0) + 1));
        rc.needs.forEach((id) => G.fillSlot(id));
        return G.activeRecipes(G.run).includes(rc.id);
      });
      // Acılı Kumpir: vuruşlar tutuşturur (burnHit)
      __t.start({});
      G.run.pantry = { acisos: 1, tursu: 1, sosis: 1 };
      ['acisos', 'tursu', 'sosis'].forEach((id) => G.fillSlot(id));
      out.burnHit = G.fx.burnHit === 1;
      // tezgah
      __t.start({});
      G.run.pantry = { kasar: 4, sosis: 4, misir: 4, tursu: 4 };
      out.avail = G.standAvailable();
      G.standStart();
      const cust = G.standCurrent();
      const wrong = (() => {
        const other = D.TOPPINGS.map((t) => t.id).find((id) => !cust.order.includes(id) && G.run.pantry[id] > 0);
        if (!other) return true;
        G.standAdd(other);
        const r = G.standServe();
        G.standClear();
        return !r.ok;
      })();
      const m0 = G.run.materials;
      cust.order.forEach((id) => G.standAdd(id));
      const sv = G.standServe();
      out.serve = wrong && sv.ok && G.run.materials > m0 && G.run.standServed === 1;
      const left = G.standTick(999);
      out.patience = left === 'left' || left === 'done';
      const cl = G.standClose();
      out.close = cl.served === 1 && G.run.stand === null && !G.standAvailable();
      __t.stop();
      return out;
    });
    check('düşmanlardan kumpir malzemesi düşer', kum.drops, kum);
    check('6 tarifin hepsi doğru malzemelerle etkinleşir', kum.recipes, kum);
    check('Acılı Kumpir vuruşlara yanma ekler', kum.burnHit, kum);
    check('tezgah: yanlış sipariş reddedilir, doğrusu ödenir', kum.avail && kum.serve, kum);
    check('tezgah: müşterinin sabrı tükenir, tezgah kapanır', kum.patience && kum.close, kum);

    /* ============================================================ */
    section('Pişme evreleri, telaşlı yüz, "Püre oldun!"');
    const cook = await ev(() => {
      const A = BR.Art;
      const stages = [0, 4, 5, 9, 10, 14, 15, 30].map((l) => A.stageFor(l)).join(',');
      const c = document.createElement('canvas');
      const px = (o) => {
        A.potatoIcon(c, 'allround', 64, o);
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let h = 0;
        for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) | 0;
        return h;
      };
      const hs = [0, 1, 2, 3].map((s) => px({ stage: s }));
      const worried = px({ stage: 0, worried: true }) !== hs[0];
      return { stages, distinct: new Set(hs).size === 4, worried, names: A.STAGE_NAMES.join(',') };
    });
    check('seviyeye göre evre: çiğ → haşlanmış → fırın → kumpir', cook.stages === '0,0,1,1,2,2,3,3', cook);
    check('dört evre farklı çiziliyor', cook.distinct, cook);
    check('canı azalınca telaşlı yüz', cook.worried, cook);
    await ev(() => {
      __t.start({ charId: 'ranger', weaponId: 'smg' });
      __t.stop();
      __t.kill(BR.Game.w.players[0]);
    });
    await wait(2400);
    check('ölünce "Püre oldun!" ekranı', (await visible('#scr-end')) && (await page.textContent('#end-title')) === 'Püre oldun!');
    check('ölünce kayıt silinir', await ev(() => !localStorage.getItem('kumpirArena.save.v1')));
    await shot('13-gameover');
    await page.click('#end-retry');
    await wait(200);
    check('tekrar dene aynı ayarlarla yeni koşu başlatır', await ev(() => BR.Game.state === 'wave' && BR.Game.w.n === 1 && BR.Game.run.charId === 'ranger'));
    await page.keyboard.press('Escape');
    await page.click('#pause-quit');
    await page.click('#modal-actions .btn >> nth=0');
    check('ana menüye dönüldü', (await visible('#scr-menu')) && (await ev(() => BR.Game.state)) === 'menu');

    /* ============================================================ */
    section('Kural değiştiren karakterler');
    const rule = await ev(() => {
      const G = BR.Game;
      const out = {};
      // Haşlanmış: silahsız, temasla hasar
      let w = __t.start({ charId: 'boiled', weaponId: 'pistol' });
      out.boiledNoWeapons = G.run.weapons.length === 0 && w.players[0].weapons.length === 0;
      __t.calm();
      let p = w.players[0];
      p.invuln = 99;
      let e = __t.spawn('bruiser', p.x + 30, p.y);
      e.speed = 0;
      __t.step(5);
      out.boiledContact = e.hp < e.maxHp;
      G.enterShop();
      out.boiledShop = G.run.shop.every((o) => o.kind === 'item');
      // Kasap: kesici silahlar +%50, diğerleri −%25
      __t.start({ charId: 'butcher', weaponId: 'knife' });
      const C = G.Calc;
      out.butcher = Math.abs(C.classMult(BR.DATA.WEAPON_BY_ID.knife, G.stats) - 1.5) < 1e-9 && Math.abs(C.classMult(BR.DATA.WEAPON_BY_ID.pistol, G.stats) - 0.75) < 1e-9;
      // Çürük: zehir aurası, her dalga maks. can kaybı
      w = __t.start({ charId: 'rotten', weaponId: 'pistol' });
      __t.calm();
      w.players[0].weapons = [];
      p = w.players[0];
      p.invuln = 99;
      e = __t.spawn('bruiser', p.x + 80, p.y);
      e.speed = 0;
      __t.step(40);
      out.rottenAura = e.hp < e.maxHp;
      const hp1 = G.Calc.maxHp(G.stats);
      G.startNextWave();
      out.rottenDecay = G.Calc.maxHp(G.stats) === hp1 - 1;
      __t.stop();
      return out;
    });
    check('Haşlanmış silah taşımaz, dükkanda silah çıkmaz', rule.boiledNoWeapons && rule.boiledShop, rule);
    check('Haşlanmış dokunduğu düşmana hasar verir', rule.boiledContact, rule);
    check('Kasap: kesici +%50, diğer silahlar −%25', rule.butcher, rule);
    check('Çürük: zehir aurası ve her dalga −1 maks. can', rule.rottenAura && rule.rottenDecay, rule);

    /* ============================================================ */
    section('Başarımlar ve kilit açma');
    await ev(() => {
      localStorage.removeItem('kumpirArena.profile.v1');
      BR.Meta.load();
      BR.UI.showMenu();
    });
    await page.click('#btn-ach');
    check('başarımlar ekranı: 16 başarım, 0 açık', (await page.locator('#ach-grid .ach-card').count()) === 16 && (await page.locator('#ach-grid .ach-card.done').count()) === 0);
    await page.click('#ach-back');
    const achRun = await ev(async () => {
      const r = await __bot.play({ charId: 'allround', weaponId: 'knife', god: true, maxWaves: 10 });
      return { wave: r.wave, ach: Object.keys(BR.Meta.profile.ach), toasts: document.querySelectorAll('#ach-toasts .ach-toast').length };
    });
    check('5. dalga başarımı Haşlanmış\'ı açar', achRun.ach.includes('wave5') && achRun.ach.includes('wave1'), achRun);
    check('bıçakla 10. dalga Kasap\'ı açar', achRun.ach.includes('knife10'), achRun);
    check('başarım bildirimi gösterildi', achRun.toasts >= 1, achRun);
    await ev(() => BR.UI.showMenu());
    await page.click('#btn-new');
    const lockInfo = await ev(() => ({
      dom: document.querySelectorAll('#char-grid .card.locked').length,
      expected: BR.DATA.CHARACTERS.filter((c) => !BR.Meta.charUnlocked(c)).length,
      boiled: BR.Meta.charUnlocked(BR.DATA.CHAR_BY_ID.boiled),
      butcher: BR.Meta.charUnlocked(BR.DATA.CHAR_BY_ID.butcher),
    }));
    check('açılan karakterler artık seçilebilir', lockInfo.boiled && lockInfo.butcher && lockInfo.dom === lockInfo.expected && lockInfo.dom <= 1, lockInfo);
    await page.click('#char-back');
    await page.click('#btn-ach');
    check('başarımlar ekranında açılanlar işaretli', (await page.locator('#ach-grid .ach-card.done').count()) >= 3);
    await shot('14-achievements');
    await page.click('#ach-back');
    const allAch = await ev(() => {
      BR.DATA.ACHIEVEMENTS.forEach((a) => BR.Meta.unlock(a.id));
      return BR.Meta.count() === BR.DATA.ACHIEVEMENTS.length && BR.DATA.CHARACTERS.every((c) => BR.Meta.charUnlocked(c));
    });
    check('tüm başarımlar açılınca tüm karakterler açık', allAch);
    const persisted = await ev(() => JSON.parse(localStorage.getItem('kumpirArena.profile.v1')).ach.kills500 > 0);
    check('profil kalıcı olarak kaydedilir', persisted);

    /* ============================================================ */
    section('Günlük meydan okuma ve sonsuz mod');
    const zeroDaily = await ev(() => {
      BR.Meta.recordEnd({ daily: '2000-01-01', wave: 1, kills: 0, level: 0, endless: false }, false);
      return BR.Meta.dailyPlayed('2000-01-01') && BR.Meta.dailyBest('2000-01-01') === 0 && !BR.Meta.dailyPlayed('2000-01-02');
    });
    check('0 puanlı günlük koşu da oynanmış sayılır', zeroDaily);
    await page.click('#btn-daily');
    check('günlük ekranı açılır', await visible('#scr-daily'));
    const dailyCfg = await ev(() => {
      const d = BR.U.todayKey();
      const a = BR.Meta.dailyConfig(d);
      const b = BR.Meta.dailyConfig(d);
      return { a, same: JSON.stringify(a) === JSON.stringify(b), text: document.getElementById('daily-card').textContent };
    });
    check('günlük ayarlar o gün için sabit', dailyCfg.same, dailyCfg);
    await shot('15-daily');
    await page.click('#daily-start');
    await wait(200);
    const dailyRun = await ev(() => {
      const r = BR.Game.run;
      return { daily: r.daily, seed: r.seed, charId: r.charId, boss: BR.DATA.ENEMIES[r.boss].name, danger: r.danger };
    });
    check('günlük koşu doğru karakter, tohum ve tehlikeyle başlar', dailyRun.daily === dailyCfg.a.date && dailyRun.seed === dailyCfg.a.seed && dailyRun.charId === dailyCfg.a.charId && dailyRun.danger === 1, dailyRun);
    check('önizlenen patron koşudaki patronla aynı', dailyCfg.text.includes(dailyRun.boss), { text: dailyCfg.text, boss: dailyRun.boss });
    await ev(() => {
      BR.Game.run.kills = 7;
      __t.kill(BR.Game.w.players[0]);
    });
    await wait(2400);
    check('günlük sonunda puan gösterilir', (await visible('#end-daily')) && /Günlük puan/.test(await page.textContent('#end-daily')));
    check('günlük rekor kaydedilir', await ev(() => BR.Meta.dailyPlayed(BR.U.todayKey()) && BR.Meta.dailyBest(BR.U.todayKey()) > 0));
    check('paylaşım metni günlük puanı içerir', /Günlük .* puan/.test(await page.inputValue('#end-share-text')));
    // sonsuz mod
    const win = await ev(async () => {
      const r = await __bot.play({ charId: 'allround', weaponId: 'smg', god: true });
      return { state: r.state, wave: r.wave, seen: r.seen };
    });
    check('ölümsüz bot 20 dalgayı bitirir (zafer)', win.state === 'victory' && win.wave === 20, win);
    check('zaferden sonra "Sonsuz Moda Devam Et" görünür', await visible('#end-endless'));
    await shot('16-victory');
    const runs0 = await ev(() => BR.Meta.profile.stats.runs);
    await page.click('#end-endless');
    const endless = await ev(async () => {
      const G = BR.Game;
      BR.Main.manual = true;
      __bot.between({});
      // dinlenme düğümü seçilirse 21. katman savaşsız geçer, dalga 22 başlar
      const n21 = G.state === 'wave' && G.w.n >= 21 && G.w.n <= 22 && G.run.endless;
      for (let i = 0; i < 60 * 10 && G.state === 'wave'; i++) {
        G.w.players.forEach((p) => (p.invuln = 5));
        __bot.move();
        G.update(1 / 60);
      }
      // 30. dalga patron, 25. elit
      const flags = { boss30: BR.DATA.isBossWave(30), elite25: BR.DATA.isEliteWave(25), map: !!G.run.map.layers[25] };
      // ölüm: sonsuz modda kayıt
      G.w.players.forEach((p) => __t.kill(p));
      for (let i = 0; i < 200 && G.state === 'wave'; i++) G.update(1 / 60);
      __t.stop();
      return { n21, flags, state: G.state, best: BR.Meta.profile.stats.bestEndless, runs: BR.Meta.profile.stats.runs };
    });
    check('sonsuz mod 21. dalgadan sürer', endless.n21, endless);
    check('sonsuz modda her 10 dalgada patron, 5 dalgada elit, harita uzar', endless.flags.boss30 && endless.flags.elite25 && endless.flags.map, endless);
    check('sonsuz mod sonu kaydedilir (koşu iki kez sayılmaz)', endless.state === 'dead' && endless.best >= 21 && endless.runs === runs0, { endless, runs0 });
    await ev(() => BR.UI.showMenu());

    /* ============================================================ */
    section('İki kişilik co-op (aynı klavye)');
    await page.click('#btn-new');
    await page.click('#players-2');
    await page.click('#char-grid .card >> nth=0');
    await page.click('#weapon-grid .card >> nth=5');
    await page.click('#danger-grid .card >> nth=0');
    await wait(300);
    check('iki oyuncu doğdu', await ev(() => BR.Game.run.coop && BR.Game.w.players.length === 2));
    check('2. oyuncu can barı ve yetenek düğmeleri görünür', (await visible('#hud-hp2')) && (await visible('#hud-skills-2')));
    await ev(() => BR.Game.w.players.forEach((p) => (p.invuln = 99)));
    const c0 = await ev(() => BR.Game.w.players.map((p) => [p.x, p.y]));
    await page.keyboard.down('KeyD');
    await wait(500);
    await page.keyboard.up('KeyD');
    const c1 = await ev(() => BR.Game.w.players.map((p) => [p.x, p.y]));
    check('WASD yalnızca 1. oyuncuyu yürütür', c1[0][0] > c0[0][0] + 40 && Math.abs(c1[1][0] - c0[1][0]) < 5, { c0, c1 });
    await page.keyboard.down('ArrowLeft');
    await wait(500);
    await page.keyboard.up('ArrowLeft');
    const c2 = await ev(() => BR.Game.w.players.map((p) => [p.x, p.y]));
    check('ok tuşları yalnızca 2. oyuncuyu yürütür', c2[1][0] < c1[1][0] - 40 && Math.abs(c2[0][0] - c1[0][0]) < 5, { c1, c2 });
    await page.keyboard.press('Enter');
    await ev(() => {
      BR.Game.w.players[1].abilCd = 0;
    });
    await page.keyboard.press('ShiftRight');
    await wait(80);
    check('Enter ve Sağ Shift 2. oyuncunun atılma/yeteneği', await ev(() => BR.Game.w.players[1].dashCd > 0 && BR.Game.w.players[1].abilCd > 0 && BR.Game.w.players[0].dashCd <= 0));
    await shot('17-coop');
    const coopDeath = await ev(() => {
      const G = BR.Game;
      const [a, b] = G.w.players;
      b.invuln = 99;
      __t.kill(a);
      return { aDead: a.dead, bAlive: !b.dead, allDead: G.w.allDead };
    });
    check('bir oyuncu ölünce diğeri sürdürür', coopDeath.aDead && coopDeath.bAlive && !coopDeath.allDead, coopDeath);
    await ev(() => {
      BR.Game.w.players[1].invuln = 99;
      BR.Game.w.t = BR.Game.w.duration;
    });
    await wait(2300);
    check('dalga sonunda ölen oyuncu sonraki dalgada geri gelir', await ev(() => {
      const G = BR.Game;
      while (G.run.pendingLevels > 0) {
        G.getUpgradeOffer();
        G.chooseUpgrade(0);
      }
      G.run.crates = [];
      G.run.pantry = {};
      G.enterShop();
      G.openMap();
      G.chooseNode(G.mapOptions().find((n) => n.type !== 'event' && n.type !== 'rest').id);
      return G.state === 'wave' && G.w.players.length === 2 && G.w.players.every((p) => !p.dead);
    }));
    await page.keyboard.press('Escape');
    await page.click('#pause-quit');
    await page.click('#modal-actions .btn >> nth=0');

    /* ============================================================ */
    section('Gamepad');
    await ev(() => {
      const pad = { id: 'test pad', index: 0, connected: true, axes: [0, 0, 0, 0], buttons: [] };
      for (let i = 0; i < 17; i++) pad.buttons.push({ pressed: false, value: 0 });
      window.__pad = pad;
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__pad] });
      window.__btn = (i, on) => {
        pad.buttons[i] = { pressed: on, value: on ? 1 : 0 };
      };
    });
    await wait(100);
    check('gamepad algılanınca klavye ipuçları gizlenir', await ev(() => document.documentElement.classList.contains('has-pad')));
    await ev(() => {
      window.__pad.axes[1] = 1;
    });
    await wait(80);
    await ev(() => {
      window.__pad.axes[1] = 0;
    });
    const focused = await ev(() => document.activeElement && document.activeElement.id);
    check('menüde yön tuşu ile gezinme (odak)', focused === 'btn-new', focused);
    await ev(() => window.__btn(0, true));
    await wait(80);
    await ev(() => window.__btn(0, false));
    await wait(80);
    check('A tuşu odaktaki düğmeye basar', await visible('#scr-char'));
    await ev(() => window.__btn(1, true));
    await wait(80);
    await ev(() => window.__btn(1, false));
    await wait(80);
    check('B tuşu geri gider', await visible('#scr-menu'));
    await ev(() => BR.UI.startRun({ charId: 'allround', weaponId: 'pistol', danger: 0 }));
    await wait(200);
    await ev(() => {
      BR.Game.w.players[0].invuln = 99;
      window.__pad.axes[0] = 1;
    });
    const gx0 = await ev(() => BR.Game.w.players[0].x);
    await wait(500);
    await ev(() => {
      window.__pad.axes[0] = 0;
    });
    check('sol çubuk oyuncuyu yürütür', (await ev(() => BR.Game.w.players[0].x)) > gx0 + 40);
    await ev(() => window.__btn(0, true));
    await wait(60);
    await ev(() => window.__btn(0, false));
    check('A tuşu ile atılma', await ev(() => BR.Game.w.players[0].dashCd > 0));
    await ev(() => {
      BR.Game.w.players[0].abilCd = 0;
      window.__btn(2, true);
    });
    await wait(60);
    await ev(() => window.__btn(2, false));
    check('X tuşu ile yetenek', await ev(() => BR.Game.w.players[0].abilCd > 0));
    await ev(() => window.__btn(9, true));
    await wait(60);
    await ev(() => window.__btn(9, false));
    check('Start tuşu duraklatır', await ev(() => BR.Game.paused));
    await ev(() => {
      const mk = (i) => {
        const pad = { id: 'pad ' + i, index: i, connected: true, axes: [0, 0, 0, 0], buttons: [] };
        for (let k = 0; k < 17; k++) pad.buttons.push({ pressed: false, value: 0 });
        return pad;
      };
      window.__pads = [mk(0), mk(1)];
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__pads });
      BR.UI.startRun({ charId: 'allround', weaponId: 'pistol', danger: 0, coop: true });
      BR.Game.w.players.forEach((p) => (p.invuln = 99));
      window.__pads[1].axes[0] = -1;
    });
    const pads0 = await ev(() => BR.Game.w.players.map((p) => p.x));
    await wait(500);
    const pads1 = await ev(() => {
      window.__pads[1].axes[0] = 0;
      return BR.Game.w.players.map((p) => p.x);
    });
    check('iki gamepad ile co-op: 2. kol yalnızca 2. oyuncuyu yürütür', pads1[1] < pads0[1] - 40 && Math.abs(pads1[0] - pads0[0]) < 5, { pads0, pads1 });
    await ev(() => {
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
      BR.UI.showMenu();
    });

    /* ============================================================ */
    section('Erişilebilirlik: renk körü modu, oyun hızı, kolay mod');
    await page.click('#btn-settings');
    await page.check('#set-cb');
    const cb = await ev(() => ({ cls: document.documentElement.classList.contains('cb'), t2: BR.DATA.TIERS[2].color, css: getComputedStyle(document.documentElement).getPropertyValue('--tier2').trim() }));
    check('renk körü modu paleti değiştirir (oyun ve arayüz)', cb.cls && cb.t2 === '#56b4e9' && cb.css === '#56b4e9', cb);
    await page.uncheck('#set-cb');
    check('renk körü modu kapanınca palet geri gelir', await ev(() => BR.DATA.TIERS[2].color === '#5aa9ff'));
    await page.keyboard.press('Escape');
    const speed = await ev(async () => {
      const G = BR.Game;
      const measure = async (sp) => {
        BR.settings.speed = sp;
        BR.UI.startRun({ charId: 'allround', weaponId: 'pistol', danger: 0 });
        G.w.players[0].invuln = 999;
        await new Promise((r) => setTimeout(r, 200));
        const t0 = G.w.t;
        const s0 = performance.now();
        await new Promise((r) => setTimeout(r, 1500));
        return (G.w.t - t0) / ((performance.now() - s0) / 1000);
      };
      const a = await measure(1);
      const b = await measure(1.25);
      const c = await measure(0.75);
      BR.settings.speed = 1;
      return { a, b, c };
    });
    check('oyun hızı %125 ve %75 simülasyonu hızlandırır/yavaşlatır', speed.b / speed.a > 1.12 && speed.c / speed.a < 0.88, speed);
    const easy = await ev(() => {
      const G = BR.Game;
      const hit = (easyOn) => {
        const w = __t.start({ easy: easyOn });
        const p = w.players[0];
        p.invuln = 0;
        G.stats.dodge = 0;
        const h0 = p.hp;
        G.X.hurtPlayer(p, 10);
        return h0 - p.hp;
      };
      const r = { normal: hit(false), easy: hit(true) };
      __t.stop();
      return r;
    });
    check('kolay mod alınan hasarı yarıya indirir', easy.normal === 10 && easy.easy === 5, easy);
    await page.click('#btn-settings').catch(() => {});
    await ev(() => BR.UI.showMenu());
    await page.click('#btn-settings');
    await page.check('#set-easy');
    await page.click('#settings-back');
    await page.click('#btn-new');
    await page.click('#char-grid .card >> nth=0');
    await page.click('#weapon-grid .card >> nth=0');
    check('kolay mod notu tehlike ekranında', await visible('#easy-note'));
    await page.click('#danger-grid .card >> nth=0');
    check('kolay mod yeni koşuya uygulanır', await ev(() => BR.Game.run.easy === true));
    await page.keyboard.press('Escape');
    await page.click('#pause-settings');
    await page.uncheck('#set-easy');
    await page.click('#settings-back');
    await page.click('#pause-quit');
    await page.click('#modal-actions .btn >> nth=0');

    /* ============================================================ */
    section('Müzik ve vuruş donması');
    const music = await ev(() => {
      const A = BR.Audio;
      const out = {};
      BR.UI.showMenu();
      out.menu = A.want;
      BR.UI.startRun({ charId: 'allround', weaponId: 'pistol', danger: 0 });
      out.wave = A.want;
      BR.UI.pause();
      out.duck = A.ducked;
      document.getElementById('pause-resume').click();
      out.unduck = !A.ducked;
      out.tracks = ['menu', 'shop', 'wave', 'boss'].every((t) => {
        A.music(t);
        return A.want === t;
      });
      out.ctx = !!A.ctx;
      return out;
    });
    check('müzik ekranlara göre değişir (menü/dalga)', music.menu === 'menu' && music.wave === 'wave' && music.tracks, music);
    check('duraklatınca müzik kısılır, devamda açılır', music.duck && music.unduck, music);
    check('ses motoru çalışıyor', music.ctx, music);
    const tracks = await ev(async () => {
      const A = BR.Audio;
      const out = {};
      for (const name of ['menu', 'shop', 'wave', 'boss']) {
        const r = await A.renderTrack(name, 10, 0.5);
        out[name] = { rms: +r.rms.toFixed(4), peak: +r.peak.toFixed(3), errors: r.errors, name: A.TRACKS[name].name };
      }
      const w0 = await A.renderTrack('wave', 10, 0);
      const w1 = await A.renderTrack('wave', 10, 1);
      out.layer = +(w1.rms / w0.rms).toFixed(3);
      return out;
    });
    const names = ['menu', 'shop', 'wave', 'boss'].map((k) => tracks[k].name).join(', ');
    check('seçilen 4 parça (' + names + ') hatasız çalar, duyulur ve patlamaz', ['menu', 'shop', 'wave', 'boss'].every((k) => tracks[k].errors === 0 && tracks[k].rms > 0.02 && tracks[k].peak < 0.95), tracks);
    check('seçilen parçalar: Arcade Tema, Pazar Funk, Synthwave Aksiyon, Karanlık Synth', names === 'Arcade Tema, Pazar Funk, Synthwave Aksiyon, Karanlık Synth', names);
    check('dalga ilerledikçe müziğe katman eklenir', tracks.layer > 1.05, tracks);
    const live = await ev(async () => {
      const A = BR.Audio;
      const G = BR.Game;
      G.w.players[0].invuln = 999;
      BR.UI.updateMusic(); // önceki testin bıraktığı parçayı oyunun durumuna eşitle
      const s0 = A.step;
      await new Promise((r) => setTimeout(r, 400));
      const advancing = A.track === 'wave' && A.step !== s0 && !!A.nodes;
      BR.UI.pause();
      await new Promise((r) => setTimeout(r, 400));
      const muffled = A.musicFilt.frequency.value < 3000;
      document.getElementById('pause-resume').click();
      await new Promise((r) => setTimeout(r, 400));
      const clear = A.musicFilt.frequency.value > 10000;
      // patron: canı azaldıkça müzik sertleşir
      G.run.wave = 19;
      G.run.node = { type: 'boss', mod: null };
      G.startNextWave();
      G.w.players.forEach((p) => (p.invuln = 999));
      const boss = G.X.spawnEnemy('boss', G.w.players[0].x + 400, G.w.players[0].y);
      boss.hp = boss.maxHp * 0.3;
      await new Promise((r) => setTimeout(r, 300));
      const bossTrack = A.track;
      const bossInt = A.intensity;
      // hızlı parça değişimleri hata vermez
      ['menu', 'shop', 'wave', 'boss', 'shop'].forEach((t) => A.music(t));
      await new Promise((r) => setTimeout(r, 300));
      return { advancing, muffled, clear, bossTrack, bossInt, final: A.track, errors: A.errors || 0 };
    });
    check('dalga müziği canlı çalıyor', live.advancing, live);
    check('duraklatınca müzik boğuklaşır, devam edince açılır', live.muffled && live.clear, live);
    check('patron müziği patronun canı azaldıkça sertleşir', live.bossTrack === 'boss' && live.bossInt >= 0.69, live);
    check('parça geçişleri hatasız', live.final === 'shop' && live.errors === 0, live);
    await ev(() => BR.UI.showMenu());
    await ev(() => BR.UI.startRun({ charId: 'allround', weaponId: 'pistol', danger: 0 }));
    const hs = await ev(async () => {
      const G = BR.Game;
      G.w.players[0].invuln = 999;
      BR.settings.hitstop = true;
      await new Promise((r) => setTimeout(r, 100));
      G.addHitstop(0.4);
      const t0 = G.w.t;
      await new Promise((r) => setTimeout(r, 250));
      const frozen = G.w.t - t0;
      await new Promise((r) => setTimeout(r, 500));
      const resumed = G.w.t - t0;
      BR.settings.hitstop = false;
      G.hitstop = 0;
      G.addHitstop(0.4);
      const off = G.hitstop === 0;
      BR.settings.hitstop = true;
      return { frozen, resumed, off };
    });
    check('vuruş donması simülasyonu kısa süre durdurur', hs.frozen < 0.02 && hs.resumed > 0.2, hs);
    check('vuruş donması ayardan kapatılabilir', hs.off, hs);
    await page.keyboard.press('Escape');
    await page.click('#pause-quit');
    await page.click('#modal-actions .btn >> nth=0');

    /* ============================================================ */
    section('Tüm karakter / silah kombinasyonları');
    const combos = await ev(() => {
      const out = [];
      BR.DATA.CHARACTERS.forEach((c) => {
        if (c.noWeapons) out.push([c.id, null]);
        else c.starters.forEach((w) => out.push([c.id, w]));
      });
      return out;
    });
    const comboRes = await ev(async (combos) => {
      const G = BR.Game;
      let bad = [];
      for (const [c, w] of combos) {
        __t.start({ charId: c, weaponId: w, danger: 3 });
        G.run.wave = 7;
        G.startNextWave();
        for (let i = 0; i < 60 * 15 && G.state === 'wave'; i++) {
          G.w.players[0].invuln = 5;
          if (i % 120 === 0) {
            G.w.players[0].abilCd = 0;
            BR.Input.press(0, 'ability');
            BR.Input.press(0, 'dash');
          }
          G.update(1 / 60);
        }
        if (G.run.kills === 0) bad.push(c + '/' + w);
        await new Promise((r) => setTimeout(r, 0));
      }
      __t.stop();
      return { bad, errors: BR.Main.errors };
    }, combos);
    check(combos.length + ' kombinasyon hatasız çalışır ve düşman öldürür', comboRes.bad.length === 0 && comboRes.errors === 0, comboRes);

    /* ============================================================ */
    section('Tam koşu simülasyonları');
    const sims = await ev(async () => {
      const out = [];
      const cfgs = [
        { charId: 'boiled', weaponId: null, danger: 3, god: true, randomNodes: true },
        { charId: 'rotten', weaponId: 'wand', danger: 2, god: true, randomNodes: true, coop: true },
        { charId: 'engineer', weaponId: 'wrench', danger: 1, god: true, randomNodes: true, seeds: true },
        { charId: 'allround', weaponId: 'pistol', danger: 0, god: false, randomNodes: true },
      ];
      for (const c of cfgs) {
        const r = await __bot.play(c);
        out.push({ cfg: c.charId + '/d' + c.danger + (c.coop ? '/coop' : '') + (c.god ? '/god' : ''), state: r.state, wave: r.wave, errors: r.errors, boss: r.seen.boss, enemies: Object.keys(r.seen.enemies).length, nodes: r.stats.nodes });
      }
      return out;
    });
    sims.slice(0, 3).forEach((s) => check('ölümsüz tam koşu: ' + s.cfg + ' → ' + s.state + ', patron ' + s.boss, s.state === 'victory' && s.wave === 20 && s.errors === 0, s));
    const real = sims[3];
    check('gerçek koşu hatasız biter (' + real.state + ', dalga ' + real.wave + ')', real.errors === 0 && (real.state === 'victory' || real.state === 'dead'), real);
    await ev(() => BR.UI.showMenu());

    /* ============================================================ */
    section('PWA (çevrimdışı oynama)');
    const pwa = await ev(async () => {
      const res = await fetch('manifest.webmanifest');
      const man = await res.json();
      const icons = await Promise.all(man.icons.map((i) => fetch(i.src).then((r) => r.ok && r.headers.get('content-type') === 'image/png')));
      const swr = await fetch('sw.js');
      let active = false;
      try {
        const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
        active = !!(reg && reg.active);
      } catch (e) {
        active = false;
      }
      return { type: res.headers.get('content-type'), name: man.name, display: man.display, icons, sw: swr.ok, active, maskable: man.icons.some((i) => i.purpose === 'maskable') };
    });
    check('manifest doğru türde ve geçerli', /manifest\+json/.test(pwa.type) && pwa.name === 'Kumpir Arena' && pwa.display === 'fullscreen', pwa);
    check('simgeler (maskelenebilir dahil) yükleniyor', pwa.icons.every(Boolean) && pwa.maskable, pwa);
    check('service worker kayıtlı ve etkin', pwa.sw && pwa.active, pwa);
    await page.reload({ waitUntil: 'load' });
    await wait(500);
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load' }).catch(() => {});
    await wait(600);
    const offline = await ev(() => ({ menu: !!(window.BR && BR.UI && BR.UI.current === 'menu'), errors: BR.Main.errors })).catch((e) => ({ err: String(e) }));
    check('internet yokken oyun önbellekten açılır', offline.menu === true && offline.errors === 0, offline);
    await ctx.setOffline(false);
    await page.reload({ waitUntil: 'load' });
    await wait(300);
    await loadHelpers();

    /* ============================================================ */
    section('Tek dosya paket');
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-single.js')], { stdio: 'pipe' });
    const single = fs.readFileSync(path.join(ROOT, 'dist', 'kumpir-arena.html'), 'utf8');
    check('paket manifest ve service worker içermez', !/manifest\.webmanifest/.test(single) && /window\.BR_NO_SW = true/.test(single));
    const fp = await ctx.newPage();
    watch(fp, '(tek dosya)');
    await fp.goto('file://' + path.join(ROOT, 'dist', 'kumpir-arena.html'), { waitUntil: 'load' });
    await fp.waitForTimeout(500);
    const fpOk = await fp.evaluate(() => BR.UI.current === 'menu' && BR.Main.errors === 0);
    await fp.click('#btn-new');
    await fp.click('#char-grid .card >> nth=0');
    await fp.click('#weapon-grid .card >> nth=0');
    await fp.click('#danger-grid .card >> nth=0');
    await fp.waitForTimeout(800);
    const fpWave = await fp.evaluate(() => BR.Game.state === 'wave' && BR.Main.errors === 0);
    check('file:// ile açılan tek dosya sürümü oynanır', fpOk && fpWave);
    await fp.close();

    /* ============================================================ */
    section('Telefon görünümü');
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const pp = await phone.newPage();
    watch(pp, '(telefon)');
    await pp.goto(URL, { waitUntil: 'load' });
    await pp.waitForTimeout(300);
    await pp.addScriptTag({ content: HELPERS });
    const noH = (id) =>
      pp.evaluate((id) => {
        const s = document.getElementById(id);
        return document.documentElement.scrollWidth <= window.innerWidth && (!s || s.hidden || s.scrollWidth <= s.clientWidth + 1);
      }, id);
    check('telefonda menüde yatay kaydırma yok', await noH('scr-menu'));
    await pp.screenshot({ path: path.join(OUT, '18-phone-menu.png') });
    await pp.tap('#btn-new');
    check('telefonda karakter ekranı taşmıyor', await noH('scr-char'));
    await pp.tap('#char-grid .card >> nth=2');
    await pp.tap('#weapon-grid .card >> nth=0');
    await pp.tap('#danger-grid .card >> nth=0');
    await pp.waitForTimeout(300);
    await pp.evaluate(() => (BR.Game.w.players[0].invuln = 99));
    const cdp = await phone.newCDPSession(pp);
    const px0 = await pp.evaluate(() => BR.Game.w.players[0].x);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 500 }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200 - i * 8, y: 500 }] });
      await pp.waitForTimeout(40);
    }
    await pp.waitForTimeout(500);
    await pp.screenshot({ path: path.join(OUT, '19-phone-wave.png') });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const px1 = await pp.evaluate(() => BR.Game.w.players[0].x);
    check('dokunmatik joystick oyuncuyu hareket ettirir', px1 < px0 - 50, { px0, px1 });
    await pp.tap('#sk1-dash');
    await pp.waitForTimeout(60);
    check('dokunmatik atılma düğmesi', await pp.evaluate(() => BR.Game.w.players[0].dashCd > 0));
    await pp.evaluate(() => (BR.Game.w.players[0].abilCd = 0));
    await pp.tap('#sk1-abil');
    await pp.waitForTimeout(60);
    check('dokunmatik yetenek düğmesi', await pp.evaluate(() => BR.Game.w.players[0].abilCd > 0));
    await pp.evaluate(() => {
      const G = BR.Game;
      G.run.materials = 300;
      G.run.pantry = { kasar: 2, sosis: 2 };
      G.w.t = G.w.duration;
    });
    await pp.waitForTimeout(2300);
    await pp.evaluate(() => {
      const G = BR.Game;
      while (G.run.pendingLevels > 0) {
        G.getUpgradeOffer();
        G.chooseUpgrade(0);
      }
      G.run.crates = [];
      G.run.crateOffer = null;
      BR.UI.nextBetweenStep();
    });
    await pp.waitForTimeout(200);
    check('telefonda tezgah taşmıyor', await noH('scr-stand'));
    await pp.evaluate(() => document.getElementById('stand-close').click());
    await pp.waitForTimeout(200);
    check('telefonda dükkan taşmıyor', await noH('scr-shop'));
    await pp.screenshot({ path: path.join(OUT, '20-phone-shop.png') });
    for (const t of ['kumpir', 'garden', 'evo']) {
      await pp.evaluate((t) => document.getElementById('tab-' + t).click(), t);
      await pp.waitForTimeout(100);
    }
    check('telefonda dükkan sekmeleri taşmıyor', await noH('scr-shop'));
    await pp.evaluate(() => document.getElementById('shop-go').click());
    await pp.waitForTimeout(300);
    const overlap = await pp.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('#map-nodes .map-node')).map((n) => n.getBoundingClientRect());
      let hit = 0;
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          if (a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2) hit++;
        }
      return hit;
    });
    check('telefonda harita taşmıyor ve düğümler üst üste binmiyor', (await noH('scr-map')) && overlap === 0, overlap);
    await pp.screenshot({ path: path.join(OUT, '21-phone-map.png') });
    await phone.close();

    /* ============================================================ */
    section('Mobil uyum (telefon, yatay telefon, tablet)');
    const DEVICES = [
      { name: 'küçük telefon 320×568', w: 320, h: 568, phone: true },
      { name: 'telefon 375×667', w: 375, h: 667, phone: true },
      { name: 'yatay telefon 667×375', w: 667, h: 375, phone: true },
      { name: 'yatay telefon 915×412', w: 915, h: 412, phone: true },
      { name: 'tablet 768×1024', w: 768, h: 1024, phone: false },
    ];
    for (const d of DEVICES) {
      const mctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const mp = await mctx.newPage();
      watch(mp, '(' + d.name + ')');
      await mp.goto(URL, { waitUntil: 'load' });
      await mp.evaluate(() => localStorage.clear());
      await mp.reload({ waitUntil: 'load' });
      await mp.waitForTimeout(300);
      await mp.addScriptTag({ content: HELPERS + MOB });
      const portrait = d.h > d.w;
      const tag = d.name + ': ';
      const fit = (id) => mp.evaluate((id) => __mob.fits(id), id);
      const bad = {};
      const note = (k, v) => {
        if (v !== 'ok') bad[k] = v;
      };

      // Menü
      const menu = await mp.evaluate(() => ({
        touch: document.documentElement.classList.contains('touch'),
        touchHint: getComputedStyle(document.querySelector('.touch-hint')).display !== 'none',
        kbdHint: getComputedStyle(document.querySelector('.kbd-hint')).display !== 'none',
        rotate: getComputedStyle(document.querySelector('.rotate-hint')).display !== 'none',
        newIn: __mob.inView('#btn-new'),
        setIn: __mob.inView('#btn-settings'),
      }));
      check(tag + 'dokunmatik cihaz açılışta tanınır, dokunmatik ipuçları gösterilir', menu.touch && menu.touchHint && !menu.kbdHint, menu);
      check(tag + 'yan çevirme ipucu yalnızca dikey tutuşta', menu.rotate === portrait, menu);
      if (!portrait) check(tag + 'yatay menü kaydırmadan sığar', menu.newIn && menu.setIn, menu);
      note('menu', await fit('menu'));
      await mp.tap('#btn-new');
      note('char', await fit('char'));
      await mp.tap('#char-grid .card >> nth=0');
      await mp.waitForTimeout(260);
      note('weapon', await fit('weapon'));
      await mp.tap('#weapon-grid .card >> nth=5');
      await mp.waitForTimeout(260);
      note('danger', await fit('danger'));
      await mp.tap('#danger-grid .card >> nth=0');
      await mp.waitForTimeout(700);

      // Dalga: HUD, kamera, kontroller
      const wave = await mp.evaluate(() => {
        const G = BR.Game;
        const p = G.w.players[0];
        p.invuln = 999;
        const cv = document.getElementById('game');
        const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        cv.dispatchEvent(ev);
        return {
          hud: __mob.overlaps(['.hud-tl', '.hud-top', '#btn-pause', '#hud-skills-1', '#toast']),
          scale: BR.Render.cam.s,
          playerPx: 22 * BR.Render.cam.s,
          ctxMenuBlocked: ev.defaultPrevented,
          joyHintPending: BR.Input.sawTouch && !BR.Input.joyUsed,
        };
      });
      check(tag + 'HUD öğeleri ve bildirim birbirinin üstüne binmez', wave.hud.length === 0, wave.hud);
      if (d.phone) check(tag + 'kamera telefonda yeterince yakın (patates ≥ 12 px)', wave.playerPx >= 12 && wave.scale >= 0.55, wave);
      check(tag + 'uzun basma menüsü oyunu bölmez', wave.ctxMenuBlocked, wave);
      check(tag + 'joystick ipucu ilk dokunuşa kadar gösterilir', wave.joyHintPending, wave);
      const sk = await mp.evaluate(() => {
        const r = document.getElementById('sk1-dash').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await mp.touchscreen.tap(sk.x, sk.y);
      await mp.waitForTimeout(60);
      check(tag + 'atılma düğmesine dokununca atılır', await mp.evaluate(() => BR.Game.w.players[0].dashCd > 0));
      // ekran dışı düşman okları
      const arrows = await mp.evaluate(() => {
        const G = BR.Game;
        const w = G.w;
        w.enemies = [];
        w.spawnT = 9999;
        const p = w.players[0];
        const s = BR.Render.cam.s;
        const halfW = window.innerWidth / 2 / s;
        __t.spawn('chaser', Math.min(1990, p.x + halfW + 120), p.y);
        __t.spawn('chaser', p.x, p.y);
        const calls = { fill: 0 };
        const fake = new Proxy({}, {
          get: (o, k) => (k === 'fill' ? () => calls.fill++ : typeof k === 'string' && /^(save|restore|translate|rotate|beginPath|moveTo|lineTo|closePath|stroke)$/.test(k) ? () => {} : o[k]),
          set: (o, k, v) => ((o[k] = v), true),
        });
        BR.Render.drawOffscreen(fake, w);
        return calls.fill;
      });
      check(tag + 'ekran dışındaki yakın düşman için kenar oku çizilir (ekrandaki için çizilmez)', arrows === 1, arrows);
      // Patron barı
      const boss = await mp.evaluate(async () => {
        const G = BR.Game;
        const p = G.w.players[0];
        G.X.spawnEnemy('boss', Math.min(1900, p.x + 300), p.y);
        await new Promise((r) => setTimeout(r, 200));
        return __mob.overlaps(['#boss-bar', '#hud-skills-1', '.hud-tl', '#btn-pause', '#toast']);
      });
      check(tag + 'patron barı yetenek düğmeleri ve HUD ile çakışmaz', boss.length === 0, boss);
      // Duraklatma
      await mp.evaluate(() => BR.UI.pause());
      await mp.waitForTimeout(150);
      note('pause', await fit('pause'));
      const fs = await mp.evaluate(() => ({
        supported: !!(document.fullscreenEnabled || document.webkitFullscreenEnabled),
        hidden: document.getElementById('pause-fullscreen').hidden,
        touchText: /sağ alttaki düğmeler/.test(document.getElementById('pause-info').textContent),
      }));
      check(tag + 'tam ekran düğmesi yalnızca destekleniyorsa görünür', fs.hidden === !fs.supported, fs);
      check(tag + 'duraklatmada dokunmatik kontroller anlatılır', fs.touchText, fs);
      // Dalga arası ekranlar
      await mp.evaluate(() => {
        document.getElementById('pause-resume').click();
        const G = BR.Game;
        const r = G.run;
        G.w.enemies = [];
        G.w.bosses = [];
        r.pantry = { kasar: 3, sosis: 3, misir: 2, tursu: 2 };
        r.level += 2;
        r.pendingLevels = 2;
        r.crates.push(2);
        r.materials += 400;
        G.w.t = G.w.duration;
      });
      await mp.waitForTimeout(2500);
      note('levelup', await fit('levelup'));
      await mp.evaluate(() => {
        const G = BR.Game;
        while (G.run.pendingLevels > 0) {
          G.getUpgradeOffer();
          G.chooseUpgrade(0);
        }
        BR.UI.nextBetweenStep();
      });
      await mp.waitForTimeout(150);
      note('crate', await fit('crate'));
      await mp.evaluate(() => {
        BR.Game.takeCrate(false);
        BR.UI.nextBetweenStep();
      });
      await mp.waitForTimeout(150);
      note('stand', await fit('stand'));
      await mp.evaluate(() => document.getElementById('stand-close').click());
      await mp.waitForTimeout(200);
      note('shop', await fit('shop'));
      const goTop = await mp.evaluate(() => {
        document.getElementById('scr-shop').scrollTop = 0;
        return __mob.inView('#shop-go');
      });
      const goMid = await mp.evaluate(async () => {
        const s = document.getElementById('scr-shop');
        s.scrollTop = s.scrollHeight / 2;
        await new Promise((r) => setTimeout(r, 50));
        return __mob.inView('#shop-go');
      });
      check(tag + '"Haritaya Git" kaydırırken hep görünür', goTop && goMid, { goTop, goMid });
      for (const t of ['kumpir', 'garden', 'evo']) {
        await mp.evaluate((t) => document.getElementById('tab-' + t).click(), t);
        await mp.waitForTimeout(80);
        note('shop/' + t, await fit('shop'));
      }
      await mp.evaluate(() => document.getElementById('tab-inv').click());
      await mp.evaluate(() => document.getElementById('shop-go').click());
      await mp.waitForTimeout(250);
      note('map', await fit('map'));
      const mapHits = await mp.evaluate(() => __mob.mapOverlaps());
      check(tag + 'harita düğümleri ve etiketleri çakışmaz', mapHits === 0, mapHits);
      await mp.evaluate(() => {
        const G = BR.Game;
        const opt = G.mapOptions()[0];
        opt.type = 'event';
        G.chooseNode(opt.id);
        BR.UI.resumePhase('event');
      });
      await mp.waitForTimeout(150);
      note('event', await fit('event'));
      await mp.evaluate(() => {
        const G = BR.Game;
        G.run.phase = 'rest';
        G.state = 'rest';
        BR.UI.resumePhase('rest');
      });
      await mp.waitForTimeout(150);
      note('rest', await fit('rest'));
      // Menü alt ekranları
      await mp.evaluate(() => BR.UI.showMenu());
      for (const [btn, id] of [['#btn-settings', 'settings'], ['#btn-ach', 'ach'], ['#btn-help', 'help'], ['#btn-daily', 'daily']]) {
        await mp.tap(btn);
        await mp.waitForTimeout(120);
        note(id, await fit(id));
        await mp.evaluate(() => BR.UI.showMenu());
      }
      // Oyun sonu
      await mp.evaluate(() => {
        BR.UI.startRun({ charId: 'allround', weaponId: 'pistol', danger: 0 });
        __t.kill(BR.Game.w.players[0]);
      });
      await mp.waitForTimeout(2300);
      note('end', await fit('end'));
      check(tag + 'hiçbir ekran yatay taşmaz, tüm düğmeler parmakla basılacak boyutta', Object.keys(bad).length === 0, bad);
      await mp.screenshot({ path: path.join(OUT, '22-mobile-' + d.w + 'x' + d.h + '.png') });
      await mctx.close();
    }

    // Titreşim ve tam ekran (telefon)
    const vctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const vp = await vctx.newPage();
    watch(vp, '(titreşim)');
    await vp.addInitScript(() => {
      window.__vib = [];
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (ms) => (window.__vib.push(ms), true) });
    });
    await vp.goto(URL, { waitUntil: 'load' });
    await vp.waitForTimeout(300);
    await vp.addScriptTag({ content: HELPERS + MOB });
    await vp.tap('#btn-settings');
    check('titreşim ayarı dokunmatik cihazda görünür ve açık gelir', await vp.evaluate(() => !document.getElementById('set-vibrate-row').hidden && document.getElementById('set-vibrate').checked));
    const vib = await vp.evaluate(async () => {
      const G = BR.Game;
      const hit = () => {
        const w = __t.start({});
        const p = w.players[0];
        p.invuln = 0;
        G.stats.dodge = 0;
        G.X.hurtPlayer(p, 2);
      };
      window.__vib = [];
      hit();
      const on = window.__vib.length;
      await new Promise((r) => setTimeout(r, 150));
      BR.settings.vibrate = false;
      window.__vib = [];
      hit();
      const off = window.__vib.length;
      BR.settings.vibrate = true;
      __t.stop();
      return { on, off };
    });
    check('hasar alınca titrer, ayar kapalıyken titremez', vib.on === 1 && vib.off === 0, vib);
    await vp.evaluate(() => BR.UI.showMenu());
    const fsSup = await vp.evaluate(() => !!document.fullscreenEnabled);
    if (fsSup) {
      await vp.tap('#btn-fullscreen');
      await vp.waitForTimeout(300);
      const fsOn = await vp.evaluate(() => ({ el: !!document.fullscreenElement, text: document.getElementById('btn-fullscreen').textContent }));
      await vp.tap('#btn-fullscreen');
      await vp.waitForTimeout(300);
      const fsOff = await vp.evaluate(() => ({ el: !!document.fullscreenElement, text: document.getElementById('btn-fullscreen').textContent }));
      check('tam ekran düğmesi açar ve kapatır', fsOn.el && fsOn.text === 'Tam Ekrandan Çık' && !fsOff.el && fsOff.text === 'Tam Ekran', { fsOn, fsOff });
    } else {
      check('tam ekran desteklenmiyorsa düğme gizli', await vp.evaluate(() => document.getElementById('btn-fullscreen').hidden));
    }
    await vctx.close();

    // Masaüstünde dokunmatik arayüz devreye girmez
    const desk = await page.evaluate(() => ({
      touch: document.documentElement.classList.contains('touch'),
      kbd: getComputedStyle(document.querySelector('.kbd-hint')).display !== 'none',
    }));
    check('masaüstünde klavye ipuçları kalır, dokunmatik kipi açılmaz', !desk.touch && desk.kbd, desk);

    check('konsolda hata yok', errors.length === 0, errors.slice(0, 5));
  } catch (e) {
    failed++;
    console.error('Beklenmeyen hata:', e);
  } finally {
    await browser.close();
    server.kill();
  }
  console.log('\n' + passed + ' başarılı, ' + failed + ' başarısız');
  process.exit(failed ? 1 : 0);
}

main();
