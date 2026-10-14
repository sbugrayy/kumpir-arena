#!/usr/bin/env node
/* Kumpir Arena denge simülasyonu: test botu farklı karakter ve tehlike seviyeleriyle oynar,
   her koşunun nerede bittiğini yazar (W = zafer, sayı = ölünen dalga).
   Çalıştırma: node tests/balance.js [tekrar sayısı]   (Playwright gerekir) */
'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  const globalRoot = require('child_process').execSync('npm root -g').toString().trim();
  ({ chromium } = require(path.join(globalRoot, 'playwright')));
}

const ROOT = path.join(__dirname, '..');
const PORT = 9000 + Math.floor(Math.random() * 900);
const REPS = Number(process.argv[2]) || 4;
const CONFIGS = [
  { charId: 'allround', weaponId: 'pistol', danger: 0 },
  { charId: 'brawler', weaponId: 'fist', danger: 0 },
  { charId: 'ranger', weaponId: 'smg', danger: 1 },
  { charId: 'mage', weaponId: 'wand', danger: 1 },
  { charId: 'allround', weaponId: 'pistol', danger: 2 },
  { charId: 'allround', weaponId: 'pistol', danger: 3 },
  { charId: 'boiled', weaponId: null, danger: 0 },
  { charId: 'allround', weaponId: 'pistol', danger: 1, coop: true },
];

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(PORT)], { stdio: 'pipe' });
  await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('localhost') && resolve()));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' });
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8') });
  let errors = 0;
  for (const c of CONFIGS) {
    const out = [];
    for (let k = 0; k < REPS; k++) {
      const r = await page.evaluate((c) => window.__bot.play(Object.assign({ randomNodes: true }, c)), c);
      out.push(r.state === 'victory' ? 'W' : String(r.wave));
      errors += r.errors;
    }
    const wins = out.filter((x) => x === 'W').length;
    console.log((c.charId + '/' + (c.weaponId || '-')).padEnd(18) + ' tehlike ' + c.danger + (c.coop ? ' co-op' : '      ') + '  ' + out.join(' ').padEnd(REPS * 3) + '  zafer ' + wins + '/' + REPS);
  }
  console.log(errors ? 'Hata sayısı: ' + errors : 'Hata yok.');
  await browser.close();
  server.kill();
  process.exit(errors ? 1 : 0);
})();
