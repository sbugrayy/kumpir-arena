/* Kumpir Arena - çevrimdışı oynamak için service worker.
   Ağ önce: çevrimiçiyken her zaman güncel dosyalar gelir ve önbellek tazelenir;
   ağ yoksa önbellekteki sürüm açılır. Dosya listesi değişince CACHE adını artır. */
'use strict';

const CACHE = 'kumpir-arena-v4';
const FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/util.js',
  'js/data.js',
  'js/audio.js',
  'js/input.js',
  'js/game.js',
  'js/arena.js',
  'js/progress.js',
  'js/meta.js',
  'js/art.js',
  'js/render.js',
  'js/ui.js',
  'js/ui-run.js',
  'js/main.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!same && !font) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => {
          if (hit) return hit;
          if (req.mode === 'navigate') return caches.match('index.html');
          return Response.error();
        })
      )
  );
});
