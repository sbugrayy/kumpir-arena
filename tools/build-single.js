#!/usr/bin/env node
/* Oyunu tek bir HTML dosyasına paketler (CSS ve JS satır içine alınır).
   Kullanım:
     node tools/build-single.js                 -> dist/kumpir-arena.html
     node tools/build-single.js --fragment yol  -> <html>/<head>/<body> etiketleri olmadan (gömme için) */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read('index.html');

html = html.replace(/<link rel="stylesheet" href="(css\/[\w.-]+\.css)">/g, (m, href) => '<style>\n' + read(href) + '\n</style>');
html = html.replace(/<script src="(js\/[\w.-]+\.js)"><\/script>/g, (m, src) => {
  const code = read(src);
  if (/<\/script/i.test(code)) throw new Error(src + ' içinde </script> geçiyor');
  return '<script>\n' + code + '\n</script>';
});

// Tek dosya sürümünde manifest, simgeler ve service worker yok
html = html.replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\s*/g, '');
html = html.replace('<script>\n', '<script>\nwindow.BR_NO_SW = true;\n');

if (/(href|src)="(css|js|icons)\//.test(html) || /manifest\.webmanifest/.test(html)) throw new Error('Satır içine alınmamış yerel dosya kaldı');

const args = process.argv.slice(2);
const fi = args.indexOf('--fragment');
let outPath;
let out;
if (fi >= 0) {
  outPath = path.resolve(args[fi + 1] || path.join(ROOT, 'dist', 'kumpir-arena.fragment.html'));
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta[^>]*>\s*/g, '');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  out = head.trim() + '\n' + body.trim() + '\n';
} else {
  outPath = path.join(ROOT, 'dist', 'kumpir-arena.html');
  out = html;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out);
console.log('Yazıldı: ' + outPath + ' (' + Math.round(out.length / 1024) + ' KB)');
