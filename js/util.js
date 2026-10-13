/* Kumpir Arena - yardımcı fonksiyonlar */
(function (BR) {
  'use strict';

  const U = {};

  U.TAU = Math.PI * 2;

  U.clamp = function (v, a, b) {
    return v < a ? a : v > b ? b : v;
  };

  U.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  U.rand = function (a, b) {
    return a + Math.random() * (b - a);
  };

  U.randInt = function (a, b) {
    return Math.floor(a + Math.random() * (b - a + 1));
  };

  U.pick = function (arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  };

  U.shuffle = function (arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  };

  // entries: [{ v: değer, w: ağırlık }]
  U.weighted = function (entries) {
    let total = 0;
    for (const e of entries) total += e.w;
    let r = Math.random() * total;
    for (const e of entries) {
      r -= e.w;
      if (r < 0) return e.v;
    }
    return entries[entries.length - 1].v;
  };

  U.dist2 = function (ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  };

  // (x1,y1)-(x2,y2) doğru parçası ile (cx,cy) merkezli r yarıçaplı daire kesişiyor mu?
  U.segCircle = function (x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) {
      t = ((cx - x1) * dx + (cy - y1) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
    }
    const px = x1 + dx * t - cx;
    const py = y1 + dy * t - cy;
    return px * px + py * py <= r * r;
  };

  U.ROMAN = ['', 'I', 'II', 'III', 'IV'];

  U.round1 = function (v) {
    return Math.round(v * 10) / 10;
  };

  // localStorage her zaman erişilebilir olmayabilir (gizli pencere vb.)
  U.store = {
    get(key, def) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw == null) return def;
        return JSON.parse(raw);
      } catch (e) {
        return def;
      }
    },
    set(key, val) {
      try {
        window.localStorage.setItem(key, JSON.stringify(val));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        /* yok say */
      }
    },
  };

  BR.U = U;
})((window.BR = window.BR || {}));
