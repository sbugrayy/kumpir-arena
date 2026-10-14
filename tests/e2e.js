#!/usr/bin/env node
/* Kumpir Arena uçtan uca testleri.
   Gerekenler: Node 18+ ve Playwright (npm i -D playwright) ya da global kurulu Playwright.
   Çalıştırma: node tests/e2e.js  (ekran görüntüleri test-results/ klasörüne kaydedilir) */
'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

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

// Sayfa içinde kullanılan basit kaçış botu
const BOT = function () {
  window.__bot = {
    move() {
      const G = BR.Game;
      const w = G.w;
      const p = w.player;
      const W = BR.DATA.ARENA_W;
      const H = BR.DATA.ARENA_H;
      let best = [0, 0];
      let bs = Infinity;
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const dx = i === 16 ? 0 : Math.cos(a);
        const dy = i === 16 ? 0 : Math.sin(a);
        let sc = 0;
        for (const L of [45, 110, 190]) {
          const qx = p.x + dx * L;
          const qy = p.y + dy * L;
          const wm = Math.min(qx, W - qx, qy, H - qy);
          if (wm < 30) sc += 400;
          else if (wm < 160) sc += Math.pow((160 - wm) / 160, 2) * 6;
          for (const e of w.enemies) {
            if (e.dmg <= 0) continue;
            const d = Math.max(8, Math.hypot(e.x - qx, e.y - qy) - e.r - p.r);
            if (d < 260) sc += (e.def.big ? 4 : 1) * 900 / (d * d);
          }
          for (const b of w.ebullets) {
            const d = Math.max(6, Math.hypot(b.x + b.vx * (L / 330) - qx, b.y + b.vy * (L / 330) - qy) - b.r - p.r);
            if (d < 120) sc += 1500 / (d * d);
          }
        }
        if (sc < bs) {
          bs = sc;
          best = [dx, dy];
        }
      }
      BR.Input.override = { x: best[0], y: best[1] };
    },
    shop() {
      const G = BR.Game;
      const run = G.run;
      while (run.pendingLevels > 0) {
        G.getUpgradeOffer();
        G.chooseUpgrade(0);
      }
      while (run.crates.length) G.takeCrate(false);
      G.enterShop();
      let bought = true;
      while (bought) {
        bought = false;
        for (let i = 0; i < 4; i++) {
          if (run.shop[i] && G.buyCheck(run.shop[i]).ok) {
            G.buy(i);
            bought = true;
          }
        }
      }
      for (let i = 0; i < run.weapons.length; i++) {
        if (G.combineIndex(i) >= 0) {
          G.combineWeapon(i);
          i = -1;
        }
      }
    },
  };
};

async function simulate(page, charId, weaponId, danger, god) {
  return page.evaluate(
    async ({ charId, weaponId, danger, god }) => {
      const G = BR.Game;
      BR.Main.manual = true;
      G.newRun(charId, weaponId, danger);
      let steps = 0;
      let bossSeen = false;
      let eliteSeen = 0;
      while (steps < 200000) {
        if (G.state === 'wave') {
          if (god) G.w.player.invuln = 5;
          if (steps % 3 === 0) __bot.move();
          G.update(1 / 60);
          if (G.w && G.w.bosses.some((b) => b.type === 'boss')) bossSeen = true;
          if (G.w && G.w.bosses.some((b) => b.type === 'elite')) eliteSeen = Math.max(eliteSeen, G.w.n);
          steps++;
          if (steps % 4000 === 0) await new Promise((r) => setTimeout(r, 0));
        } else if (G.state === 'between' || G.state === 'shop') {
          __bot.shop();
          G.startNextWave();
        } else break;
      }
      BR.Input.override = null;
      BR.Main.manual = false;
      return { state: G.state, wave: G.run.wave, kills: G.run.kills, bossSeen, eliteSeen, errors: BR.Main.errors };
    },
    { charId, weaponId, danger, god }
  );
}

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
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push('console: ' + m.text());
  });
  const shot = (name) => page.screenshot({ path: path.join(OUT, name + '.png') });
  const visible = (sel) => page.isVisible(sel);

  try {
    console.log('Arayüz akışı');
    await page.goto(URL, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(300);
    check('ana menü görünüyor', await visible('#scr-menu'));
    check('kayıt yokken "Devam Et" gizli', !(await visible('#btn-continue')));
    await shot('01-menu');

    await page.click('#btn-help');
    check('nasıl oynanır ekranı açılıyor', await visible('#scr-help'));
    await page.click('#help-back');
    await page.click('#btn-settings');
    check('ayarlar açılıyor', await visible('#scr-settings'));
    await page.uncheck('#set-dmg');
    check('ayar kaydediliyor', await page.evaluate(() => JSON.parse(localStorage.getItem('kumpirArena.settings.v1')).dmgNumbers === false));
    await page.check('#set-dmg');
    await page.keyboard.press('Escape');
    check('Esc ile ayarlardan çıkılıyor', await visible('#scr-menu'));

    await page.click('#btn-new');
    check('karakter seçimi: 6 karakter', (await page.locator('#char-grid .card').count()) === 6);
    await shot('02-characters');
    await page.click('#char-grid .card >> nth=4'); // Mühendis
    check('silah seçimi açılıyor', await visible('#scr-weapon'));
    await page.click('#weapon-back');
    check('geri tuşu karakter ekranına döner', await visible('#scr-char'));
    await page.click('#char-grid .card >> nth=0'); // Çok Yönlü
    check('Çok Yönlü için 10 başlangıç silahı', (await page.locator('#weapon-grid .card').count()) === 10);
    await page.click('#weapon-grid .card >> nth=5'); // Tabanca
    check('tehlike seçimi açılıyor', await visible('#scr-danger'));
    await page.click('#danger-grid .card >> nth=0');
    await page.waitForTimeout(200);
    check('dalga başladı ve HUD görünüyor', (await page.evaluate(() => BR.Game.state)) === 'wave' && (await visible('#hud')));
    check('karakter ve silah doğru', await page.evaluate(() => BR.Game.run.charId === 'allround' && BR.Game.run.weapons[0].id === 'pistol'));

    await page.keyboard.down('KeyD');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyD');
    const moved = await page.evaluate(() => BR.Game.w.player.x);
    check('klavye ile hareket (D tuşu sağa götürür)', moved > 1000 + 50, moved);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowUp');
    check('ok tuşları ile hareket', await page.evaluate(() => BR.Game.w.player.y < 700));
    await page.waitForTimeout(2500);
    await shot('03-wave');

    await page.keyboard.press('Escape');
    check('Esc ile duraklatılıyor', (await page.evaluate(() => BR.Game.paused)) && (await visible('#scr-pause')));
    const tPaused = await page.evaluate(() => BR.Game.w.t);
    await page.waitForTimeout(500);
    check('duraklatınca zaman durur', (await page.evaluate(() => BR.Game.w.t)) === tPaused);
    await shot('04-pause');
    await page.click('#pause-resume');
    check('devam düğmesi oyunu sürdürür', !(await page.evaluate(() => BR.Game.paused)));
    await page.click('#btn-pause');
    check('HUD duraklat düğmesi çalışır', await page.evaluate(() => BR.Game.paused));
    await page.keyboard.press('Escape');
    check('Esc ile devam', !(await page.evaluate(() => BR.Game.paused)));

    // Dalgayı hızlıca bitir: yeterli malzeme ve seviye ver
    await page.evaluate(() => {
      const G = BR.Game;
      G.run.materials = 500;
      G.run.pendingLevels = 2;
      G.run.crates.push(1);
      G.w.t = G.w.duration;
    });
    await page.waitForTimeout(2600);
    check('dalga sonu: seviye atlama ekranı', await visible('#scr-levelup'));
    check('4 geliştirme seçeneği', (await page.locator('#lvl-cards .card').count()) === 4);
    await shot('05-levelup');
    const m0 = await page.evaluate(() => BR.Game.run.materials);
    await page.click('#lvl-reroll');
    check('geliştirme yenileme malzeme harcar', (await page.evaluate(() => BR.Game.run.materials)) < m0);
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => JSON.stringify(BR.Game.run.upgrades));
    await page.keyboard.press('Digit1');
    check('1 tuşu ile geliştirme seçilir', (await page.evaluate(() => JSON.stringify(BR.Game.run.upgrades))) !== before);
    await page.waitForTimeout(300);
    const dbl = await page.evaluate(() => {
      // art arda iki tıklama: ilki seçer, hemen gelen ikincisi yok sayılmalı
      BR.Game.run.pendingLevels += 1;
      const p0 = BR.Game.run.pendingLevels;
      document.getElementById('lvl-cards').firstChild.click();
      const p1 = BR.Game.run.pendingLevels;
      document.getElementById('lvl-cards').firstChild.click();
      return [p0, p1, BR.Game.run.pendingLevels];
    });
    check('çift tıklama yanlışlıkla ikinci seçimi yapmaz', dbl[1] === dbl[0] - 1 && dbl[2] === dbl[1], dbl);
    await page.waitForTimeout(300);
    await page.click('#lvl-cards .card >> nth=2');
    check('sandık ekranı geldi', await visible('#scr-crate'));
    await shot('06-crate');
    await page.waitForTimeout(300);
    await page.click('#crate-take');
    check('sandıktan eşya alındı', await page.evaluate(() => Object.keys(BR.Game.run.items).length >= 1));
    check('dükkan açıldı', await visible('#scr-shop'));
    check('dükkanda 4 teklif', (await page.locator('#shop-offers .card').count()) === 4);
    await shot('07-shop');

    // Dükkan işlemleri
    const lockOk = await page.evaluate(() => {
      document.querySelector('#shop-offers .btn-lock').click();
      return BR.Game.run.shop[0].locked === true;
    });
    check('kilitleme çalışır', lockOk);
    const kept = await page.evaluate(() => JSON.stringify(BR.Game.run.shop[0]));
    await page.click('#shop-reroll');
    check('yenileme sonrası kilitli teklif kalır', (await page.evaluate(() => JSON.stringify(BR.Game.run.shop[0]))) === kept);
    // Bilinen teklifler koy, dükkanı yeniden çizdir (kilidi iki kez değiştirerek) ve tıklayarak satın al
    await page.evaluate(() => {
      const G = BR.Game;
      G.run.materials = 9999;
      G.run.shop[1] = { kind: 'weapon', id: 'pistol', tier: 1, locked: false };
      G.run.shop[2] = { kind: 'item', id: 'helmet', tier: 1, locked: false };
      G.run.shop[3] = { kind: 'weapon', id: 'smg', tier: 2, locked: false };
      document.querySelector('#shop-offers .btn-lock').click();
      document.querySelector('#shop-offers .btn-lock').click();
    });
    const armorBefore = await page.evaluate(() => BR.Game.stats.armor);
    await page.click('#shop-offers .card >> nth=2 >> .btn-buy');
    check('eşya satın alma istatistiği değiştirir (Kask +2 zırh)', (await page.evaluate(() => BR.Game.stats.armor)) === armorBefore + 2);
    await page.click('#shop-offers .card >> nth=1 >> .btn-buy');
    check('silah satın alındı (2 silah)', (await page.evaluate(() => BR.Game.run.weapons.length)) === 2);
    check('birleştirilebilir rozet görünüyor', (await page.locator('#shop-weapons .badge').count()) >= 1);
    await page.click('#shop-weapons .slot >> nth=0');
    check('silah detay penceresi', await visible('#modal'));
    await shot('08-weapon-modal');
    await page.click('#modal-actions .btn >> nth=0'); // Birleştir
    check('birleştirme: Tabanca II', await page.evaluate(() => BR.Game.run.weapons.length === 1 && BR.Game.run.weapons[0].tier === 2));
    await page.click('#shop-offers .card >> nth=3 >> .btn-buy');
    check('ikinci silah satın alındı', (await page.evaluate(() => BR.Game.run.weapons.length)) === 2);
    const matsBeforeSell = await page.evaluate(() => BR.Game.run.materials);
    await page.click('#shop-weapons .slot >> nth=1');
    await page.click('#modal-actions .btn >> nth=1'); // Sat
    check('silah satıldı ve malzeme geldi', await page.evaluate((m) => BR.Game.run.weapons.length === 1 && BR.Game.run.materials > m, matsBeforeSell));
    await page.click('#shop-weapons .slot >> nth=0');
    check('son silah satılamaz', await page.evaluate(() => document.querySelector('#modal-actions .btn:nth-child(2)').disabled));
    await page.keyboard.press('Escape');
    check('Esc ile pencere kapanır', !(await visible('#modal')));
    check('kayıt oluştu', await page.evaluate(() => !!localStorage.getItem('kumpirArena.save.v1')));

    // Devam Et: sayfayı yenile, kayıttan dükkana dön
    const savedWave = await page.evaluate(() => BR.Game.run.wave);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(300);
    check('yenilemeden sonra "Devam Et" görünür', await visible('#btn-continue'));
    await page.click('#btn-continue');
    check('devam: dükkana dönüldü', (await visible('#scr-shop')) && (await page.evaluate(() => BR.Game.run.wave)) === savedWave);
    await page.click('#shop-go');
    await page.waitForTimeout(300);
    check('sonraki dalga başladı (dalga 2)', await page.evaluate(() => BR.Game.state === 'wave' && BR.Game.w.n === 2));

    // Ölüm
    await page.evaluate(() => {
      BR.Game.w.player.invuln = 0;
      BR.Game.w.player.hp = 1;
      BR.Game.stats.dodge = 0;
      BR.Game.stats.armor = 0;
      const e = BR.Game.w.enemies.find((x) => x.dmg > 0);
      if (e) {
        e.x = BR.Game.w.player.x;
        e.y = BR.Game.w.player.y;
      }
    });
    await page.evaluate(() => {
      if (!BR.Game.w.enemies.some((x) => x.dmg > 0)) {
        BR.Game.w.player.hp = 0;
        BR.Game.w.player.dead = true;
        BR.Game.w.player.deathT = 0.2;
      }
    });
    await page.waitForTimeout(2200);
    check('ölünce oyun sonu ekranı', await visible('#scr-end'));
    check('ölünce kayıt silinir', await page.evaluate(() => !localStorage.getItem('kumpirArena.save.v1')));
    await shot('09-gameover');
    await page.click('#end-retry');
    await page.waitForTimeout(200);
    check('tekrar dene aynı ayarlarla yeni koşu başlatır', await page.evaluate(() => BR.Game.state === 'wave' && BR.Game.w.n === 1 && BR.Game.run.charId === 'allround'));
    await page.keyboard.press('Escape');
    await page.click('#pause-quit');
    check('çıkış onayı soruluyor', await visible('#modal'));
    await page.click('#modal-actions .btn >> nth=0');
    check('ana menüye dönüldü', (await visible('#scr-menu')) && (await page.evaluate(() => BR.Game.state)) === 'menu');

    console.log('Tüm karakterler / silahlar ile kısa oynanış');
    const combos = await page.evaluate(() => {
      const out = [];
      BR.DATA.CHARACTERS.forEach((c) => c.starters.forEach((w) => out.push([c.id, w])));
      return out;
    });
    let comboErr = 0;
    for (const [c, w] of combos) {
      const r = await page.evaluate(
        ({ c, w }) => {
          const G = BR.Game;
          BR.Main.manual = true;
          G.newRun(c, w, 3);
          for (let i = 0; i < 60 * 25 && G.state === 'wave'; i++) {
            G.w.player.invuln = 5;
            G.update(1 / 60);
          }
          BR.Main.manual = false;
          return { kills: G.run.kills, errors: BR.Main.errors };
        },
        { c, w }
      );
      if (r.errors) comboErr++;
    }
    check(combos.length + ' karakter/silah kombinasyonu hatasız çalışır', comboErr === 0 && errors.length === 0, errors.slice(0, 3));

    console.log('Tam koşu simülasyonları');
    await page.evaluate(BOT);
    const god = await simulate(page, 'allround', 'smg', 0, true);
    check('ölümsüz modda 20 dalga tamamlanır ve zafer ekranı gelir', god.state === 'victory' && god.wave === 20 && (await visible('#scr-end')), god);
    check('11. ve 16. dalgada elit, 20. dalgada patron çıkar', god.eliteSeen === 16 && god.bossSeen, god);
    await shot('10-victory');
    const real = await simulate(page, 'allround', 'pistol', 0, false);
    check('gerçek koşu hatasız biter (' + real.state + ', dalga ' + real.wave + ')', real.errors === 0 && (real.state === 'victory' || real.state === 'dead'), real);

    console.log('Telefon görünümü');
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const pp = await phone.newPage();
    pp.on('pageerror', (e) => errors.push('pageerror(phone): ' + e.message));
    await pp.goto(URL, { waitUntil: 'load' });
    await pp.waitForTimeout(300);
    const noHScroll = await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    check('telefonda yatay kaydırma yok', noHScroll);
    await pp.screenshot({ path: path.join(OUT, '11-phone-menu.png') });
    await pp.tap('#btn-new');
    await pp.tap('#char-grid .card >> nth=2');
    await pp.tap('#weapon-grid .card >> nth=0');
    await pp.tap('#danger-grid .card >> nth=0');
    await pp.waitForTimeout(300);
    // sanal joystick: dokun ve sürükle
    const cdp = await phone.newCDPSession(pp);
    const x0 = await pp.evaluate(() => BR.Game.w.player.x);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 500 }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200 - i * 8, y: 500 }] });
      await pp.waitForTimeout(40);
    }
    await pp.waitForTimeout(500);
    await pp.screenshot({ path: path.join(OUT, '12-phone-wave.png') });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const x1 = await pp.evaluate(() => BR.Game.w.player.x);
    check('dokunmatik joystick oyuncuyu hareket ettirir', x1 < x0 - 50, { x0, x1 });
    await pp.evaluate(() => {
      const G = BR.Game;
      G.run.materials = 300;
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
      G.enterShop();
    });
    await pp.evaluate(() => document.getElementById('shop-reroll').click());
    await pp.waitForTimeout(200);
    check('telefonda dükkan yatay taşmıyor', await pp.evaluate(() => {
      const s = document.getElementById('scr-shop');
      return !s.hidden && s.scrollWidth <= s.clientWidth + 1;
    }));
    await pp.screenshot({ path: path.join(OUT, '13-phone-shop.png'), fullPage: false });
    await phone.close();

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
