/* Kumpir Arena - arenalar: Tarla (çamur), Mutfak (ocak gözü, oklava), Pazar Yeri (tezgah engelleri) */
(function (BR) {
  'use strict';

  const U = BR.U;
  const D = BR.DATA;
  const AW = D.ARENA_W;
  const AH = D.ARENA_H;
  const CX = AW / 2;
  const CY = AH / 2;
  const PIN_HALF = 130;
  const PIN_R = 17;
  const PIN_SPEED = 300;

  const A = {};

  function farFromCenter(x, y, d) {
    return U.dist2(x, y, CX, CY) > d * d;
  }

  // S: tohumlu rastgele yardımcıları (günlük meydan okumada herkes aynı arenayı görsün)
  A.setup = function (w, id, S) {
    const a = { id, mud: [], burners: [], pins: [], stalls: [], pinT: S.int(5, 8) };
    if (id === 'field') {
      for (let tries = 0; a.mud.length < 5 && tries < 80; tries++) {
        const m = { x: S.int(160, AW - 160), y: S.int(160, AH - 160), rx: S.int(80, 130), ry: S.int(60, 95) };
        if (!farFromCenter(m.x, m.y, 300)) continue;
        if (a.mud.some((o) => U.dist2(o.x, o.y, m.x, m.y) < 260 * 260)) continue;
        a.mud.push(m);
      }
    } else if (id === 'kitchen') {
      for (let tries = 0; a.burners.length < 6 && tries < 80; tries++) {
        const b = { x: S.int(180, AW - 180), y: S.int(180, AH - 180), r: 56, state: 'idle', t: S.int(3, 8), tick: 0 };
        if (!farFromCenter(b.x, b.y, 260)) continue;
        if (a.burners.some((o) => U.dist2(o.x, o.y, b.x, b.y) < 300 * 300)) continue;
        a.burners.push(b);
      }
    } else if (id === 'market') {
      for (let tries = 0; a.stalls.length < 6 && tries < 120; tries++) {
        const horiz = S.chance(0.5);
        const s = { w: horiz ? 160 : 64, h: horiz ? 64 : 160, x: 0, y: 0, color: S.int(0, 3) };
        s.x = S.int(130, AW - 130 - s.w);
        s.y = S.int(130, AH - 130 - s.h);
        const mx = s.x + s.w / 2;
        const my = s.y + s.h / 2;
        if (!farFromCenter(mx, my, 300)) continue;
        const clash = a.stalls.some((o) => s.x < o.x + o.w + 110 && s.x + s.w + 110 > o.x && s.y < o.y + o.h + 110 && s.y + s.h + 110 > o.y);
        if (clash) continue;
        a.stalls.push(s);
      }
    }
    w.arena = a;
  };

  /* ---------- Sorgular ---------- */
  A.speedMult = function (w, x, y, isPlayer) {
    const a = w.arena;
    if (!a || !a.mud.length) return 1;
    for (const m of a.mud) {
      const dx = (x - m.x) / m.rx;
      const dy = (y - m.y) / m.ry;
      if (dx * dx + dy * dy < 1) return isPlayer ? 0.6 : 0.75;
    }
    return 1;
  };

  A.blocked = function (w, x, y, pad) {
    const a = w.arena;
    if (!a || !a.stalls.length) return false;
    const p = pad || 0;
    for (const s of a.stalls) {
      if (x > s.x - p && x < s.x + s.w + p && y > s.y - p && y < s.y + s.h + p) return true;
    }
    return false;
  };

  // Daireyi tezgahların dışına iter
  A.collide = function (w, o, rOverride) {
    const a = w.arena;
    if (!a || !a.stalls.length) return;
    const r = rOverride || o.r || 10;
    for (const s of a.stalls) {
      const cx = U.clamp(o.x, s.x, s.x + s.w);
      const cy = U.clamp(o.y, s.y, s.y + s.h);
      const dx = o.x - cx;
      const dy = o.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        o.x = cx + (dx / d) * r;
        o.y = cy + (dy / d) * r;
      } else {
        // merkez dikdörtgenin içinde: en yakın kenardan dışarı
        const left = o.x - s.x;
        const right = s.x + s.w - o.x;
        const top = o.y - s.y;
        const bottom = s.y + s.h - o.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) o.x = s.x - r;
        else if (m === right) o.x = s.x + s.w + r;
        else if (m === top) o.y = s.y - r;
        else o.y = s.y + s.h + r;
      }
    }
  };

  // Düşmanların tezgahların etrafından dolaşması için hız düzeltmesi
  A.steer = function (w, e, vx, vy, tx, ty) {
    const a = w.arena;
    if (!a || !a.stalls.length) return { vx, vy };
    const sp = Math.hypot(vx, vy);
    if (sp < 1) return { vx, vy };
    const nx = e.x + vx * 0.15;
    const ny = e.y + vy * 0.15;
    const pad = e.r + 6;
    for (const s of a.stalls) {
      const x0 = s.x - pad;
      const x1 = s.x + s.w + pad;
      const y0 = s.y - pad;
      const y1 = s.y + s.h + pad;
      if (nx <= x0 || nx >= x1 || ny <= y0 || ny >= y1) continue;
      const midX = s.x + s.w / 2;
      const midY = s.y + s.h / 2;
      if (e.x <= x0 || e.x >= x1) {
        let dir = ty < midY ? -1 : 1;
        if (Math.abs(ty - midY) < 4) dir = e.y < midY ? -1 : 1;
        return { vx: 0, vy: dir * sp };
      }
      let dir = tx < midX ? -1 : 1;
      if (Math.abs(tx - midX) < 4) dir = e.x < midX ? -1 : 1;
      return { vx: dir * sp, vy: 0 };
    }
    return { vx, vy };
  };

  /* ---------- Güncelleme ---------- */
  A.update = function (w, dt) {
    const a = w.arena;
    if (!a) return;
    const X = BR.Game.X;
    if (a.burners.length) {
      for (const b of a.burners) {
        b.t -= dt;
        if (b.t <= 0) {
          if (b.state === 'idle') {
            b.state = 'warn';
            b.t = 1.2;
          } else if (b.state === 'warn') {
            b.state = 'hot';
            b.t = 2.2;
            b.tick = 0;
          } else {
            b.state = 'idle';
            b.t = U.rand(5, 9);
          }
        }
        if (b.state !== 'hot') continue;
        for (const p of w.players) {
          if (p.dead) continue;
          const rr = b.r + p.r * 0.5;
          if (U.dist2(p.x, p.y, b.x, b.y) < rr * rr) X.hurtPlayer(p, 3 + w.n * 0.6);
        }
        b.tick -= dt;
        if (b.tick <= 0) {
          b.tick = 0.5;
          for (const e of w.enemies) {
            if (e.dead || e.def.big) continue;
            const rr = b.r + e.r * 0.5;
            if (U.dist2(e.x, e.y, b.x, b.y) < rr * rr) X.applyBurn(e, 2 + w.n * 0.5);
          }
        }
      }
      // Oklava: bir kenardan uyarıyla girer, arenayı boydan boya yuvarlanır
      a.pinT -= dt;
      if (a.pinT <= 0 && w.t < w.duration - 3) {
        a.pinT = U.rand(9, 13);
        const horiz = Math.random() < 0.5;
        const dir = Math.random() < 0.5 ? 1 : -1;
        const span = horiz ? AH : AW;
        const pos = U.rand(span * 0.2, span * 0.8);
        const start = dir > 0 ? -PIN_R * 2 : (horiz ? AW : AH) + PIN_R * 2;
        a.pins.push({ horiz, dir, pos, p: start, warn: 1.1, hit: [], hitP: [], done: false });
        BR.Audio.play('warn');
      }
      for (const pin of a.pins) {
        if (pin.warn > 0) {
          pin.warn -= dt;
          continue;
        }
        pin.p += pin.dir * PIN_SPEED * dt;
        const limit = pin.horiz ? AW : AH;
        if ((pin.dir > 0 && pin.p > limit + PIN_R * 3) || (pin.dir < 0 && pin.p < -PIN_R * 3)) {
          pin.done = true;
          continue;
        }
        const seg = A.pinSegment(pin);
        for (const p of w.players) {
          if (p.dead || pin.hitP.includes(p.id)) continue;
          if (U.segCircle(seg.x1, seg.y1, seg.x2, seg.y2, p.x, p.y, PIN_R + p.r)) {
            pin.hitP.push(p.id);
            X.hurtPlayer(p, 4 + w.n * 0.7);
          }
        }
        for (const e of w.enemies) {
          if (e.dead || pin.hit.includes(e.id)) continue;
          if (U.segCircle(seg.x1, seg.y1, seg.x2, seg.y2, e.x, e.y, PIN_R + e.r)) {
            pin.hit.push(e.id);
            X.damageEnemy(e, 30 + w.n * 8, { kb: 30, kx: pin.horiz ? pin.dir : 0, ky: pin.horiz ? 0 : pin.dir, noLS: true });
          }
        }
      }
      a.pins = a.pins.filter((p) => !p.done);
    }
  };

  // Oklavanın (kapsül) eksen doğrusu
  A.pinSegment = function (pin) {
    if (pin.horiz) return { x1: pin.p, y1: pin.pos - PIN_HALF, x2: pin.p, y2: pin.pos + PIN_HALF };
    return { x1: pin.pos - PIN_HALF, y1: pin.p, x2: pin.pos + PIN_HALF, y2: pin.p };
  };
  A.PIN_R = PIN_R;

  BR.Arena = A;
})((window.BR = window.BR || {}));
