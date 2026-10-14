#!/usr/bin/env node
/* Uygulama simgelerini oyunun kendi çizim koduyla üretir (icons/ klasörüne PNG yazar).
   Gerekenler: Playwright. Çalıştırma: node tools/make-icons.js */
'use strict';

const path = require('path');
const fs = require('fs');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  const globalRoot = require('child_process').execSync('npm root -g').toString().trim();
  ({ chromium } = require(path.join(globalRoot, 'playwright')));
}

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'icons');
const ICONS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.BR && BR.Art && BR.Art.drawPotato);
  for (const ic of ICONS) {
    const dataUrl = await page.evaluate(({ size, maskable }) => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      // arka plan: maskelenebilir simgede tam dolu, diğerinde yuvarlak köşeli kare
      ctx.fillStyle = '#2a211b';
      if (maskable) ctx.fillRect(0, 0, size, size);
      else {
        BR.Art.roundRect(ctx, 0, 0, size, size, size * 0.22);
        ctx.fill();
      }
      const g = ctx.createRadialGradient(size / 2, size * 0.55, size * 0.05, size / 2, size * 0.55, size * 0.5);
      g.addColorStop(0, 'rgba(234,169,78,0.45)');
      g.addColorStop(1, 'rgba(234,169,78,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      // patates: maskelenebilir simgede güvenli alanın (orta %80) içinde kalsın
      const k = (size / 80) * (maskable ? 0.95 : 1.05);
      ctx.save();
      ctx.translate(size / 2, size / 2 + 6 * k);
      ctx.scale(k, k);
      BR.Art.drawPotato(ctx, 0, 0, 'allround', { face: 1, stage: 3, toppings: ['kasar', 'misir', 'sosis', 'tursu'] });
      ctx.restore();
      return c.toDataURL('image/png');
    }, ic);
    fs.writeFileSync(path.join(OUT, ic.file), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('Yazıldı: icons/' + ic.file);
  }
  await browser.close();
})();
