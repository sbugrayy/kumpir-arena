/* Kumpir Arena - canvas çizimleri */
(function (BR) {
  'use strict';

  const U = BR.U;
  const D = BR.DATA;
  const AW = D.ARENA_W;
  const AH = D.ARENA_H;
  const TAU = U.TAU;
  const FONT = '"Paytone One", "Arial Black", Impact, sans-serif';

  const R = {
    canvas: null,
    ctx: null,
    w: 0,
    h: 0,
    dpr: 1,
    cam: { x: AW / 2, y: AH / 2, s: 1 },
    floor: null,
    t: 0,
  };

  /* ---------- Kurulum ---------- */
  R.init = function (canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d');
    R.floor = R.ctx.createPattern(makeFloorTile(), 'repeat');
    R.resize();
  };

  R.resize = function () {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    R.canvas.width = Math.round(w * dpr);
    R.canvas.height = Math.round(h * dpr);
    R.canvas.style.width = w + 'px';
    R.canvas.style.height = h + 'px';
    R.w = w;
    R.h = h;
    R.dpr = dpr;
  };

  function makeFloorTile() {
    const c = document.createElement('canvas');
    const S = 320;
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#5f564b';
    g.fillRect(0, 0, S, S);
    // sabit tohumlu basit rastgele, desen her açılışta aynı olsun
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 60; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(40,32,26,0.16)' : 'rgba(255,240,215,0.05)';
      const r = 2 + rnd() * 6;
      g.beginPath();
      g.ellipse(rnd() * S, rnd() * S, r, r * 0.7, rnd() * 3, 0, TAU);
      g.fill();
    }
    for (let i = 0; i < 4; i++) {
      // küçük çakıl taşları
      const x = rnd() * S;
      const y = rnd() * S;
      g.fillStyle = '#7a7064';
      g.beginPath();
      g.ellipse(x, y, 4 + rnd() * 3, 3 + rnd() * 2, rnd() * 3, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.beginPath();
      g.ellipse(x + 1, y + 2, 4, 2, 0, 0, TAU);
      g.fill();
    }
    for (let i = 0; i < 3; i++) {
      // kuru ot öbekleri
      const x = rnd() * S;
      const y = rnd() * S;
      g.strokeStyle = 'rgba(150,160,90,0.45)';
      g.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.moveTo(x + k * 2, y);
        g.lineTo(x + k * 2 + (rnd() - 0.5) * 6, y - 5 - rnd() * 5);
        g.stroke();
      }
    }
    return c;
  }

  /* ---------- Kamera ---------- */
  function viewScale() {
    return U.clamp(Math.sqrt((R.w * R.h) / (1250 * 820)), 0.42, 2.2);
  }

  /* ---------- Ana çizim ---------- */
  R.draw = function (G, dt) {
    const ctx = R.ctx;
    const dpr = R.dpr;
    R.t += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1a1511';
    ctx.fillRect(0, 0, R.w, R.h);

    const w = G.w;
    let tx;
    let ty;
    if (w && (G.state === 'wave' || G.state === 'dead' || G.state === 'victory')) {
      tx = w.player.x;
      ty = w.player.y;
    } else {
      tx = AW / 2 + Math.cos(R.t * 0.05) * 320;
      ty = AH / 2 + Math.sin(R.t * 0.07) * 220;
    }
    const s = viewScale();
    const vw = R.w / s;
    const vh = R.h / s;
    const margin = 90;
    const cx = vw >= AW + margin * 2 ? AW / 2 : U.clamp(tx, vw / 2 - margin, AW - vw / 2 + margin);
    const cy = vh >= AH + margin * 2 ? AH / 2 : U.clamp(ty, vh / 2 - margin, AH - vh / 2 + margin);
    let ox = 0;
    let oy = 0;
    const st = BR.settings || {};
    if (w && st.shake !== false && w.shake > 0.2 && !G.paused) {
      ox = U.rand(-1, 1) * w.shake;
      oy = U.rand(-1, 1) * w.shake;
    }
    R.cam.x = cx;
    R.cam.y = cy;
    R.cam.s = s;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (R.w / 2 - (cx + ox) * s), dpr * (R.h / 2 - (cy + oy) * s));
    drawArena(ctx);
    const showWorld = w && (G.state === 'wave' || G.state === 'dead' || G.state === 'victory');
    if (showWorld) drawWorld(ctx, w, G);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (showWorld && G.state === 'wave') drawScreenFx(ctx, w, G);
  };

  function drawArena(ctx) {
    ctx.fillStyle = R.floor || '#5f564b';
    ctx.fillRect(0, 0, AW, AH);
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#2a211a';
    ctx.strokeRect(-7, -7, AW + 14, AH + 14);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,230,190,0.12)';
    ctx.strokeRect(2, 2, AW - 4, AH - 4);
  }

  function drawWorld(ctx, w, G) {
    const t = R.t;
    // doğma işaretleri
    for (const m of w.markers) {
      const big = m.type === 'boss' || m.type === 'elite';
      const sz = big ? 34 : m.type === 'tree' ? 16 : 13;
      const blink = 0.45 + 0.55 * Math.abs(Math.sin(t * 10));
      ctx.globalAlpha = blink;
      ctx.strokeStyle = m.type === 'tree' ? '#7fd36a' : '#ff4a4a';
      ctx.lineWidth = big ? 8 : 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(m.x - sz, m.y - sz);
      ctx.lineTo(m.x + sz, m.y + sz);
      ctx.moveTo(m.x + sz, m.y - sz);
      ctx.lineTo(m.x - sz, m.y + sz);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.lineCap = 'butt';

    for (const pk of w.pickups) drawPickup(ctx, pk, t);
    for (const tu of w.turrets) drawTurret(ctx, tu);

    // gölgeler
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (const e of w.enemies) {
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.r * 0.85, e.r * 0.9, e.r * 0.32, 0, 0, TAU);
      ctx.fill();
    }
    const p = w.player;
    if (!p.dead) {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 22, 17, 6, 0, 0, TAU);
      ctx.fill();
    }

    // ağaçlar diğerlerinin altında kalsın
    for (const e of w.enemies) if (e.type === 'tree') drawEnemy(ctx, e, p, t);
    for (const e of w.enemies) if (e.type !== 'tree') drawEnemy(ctx, e, p, t);

    if (!p.dead) {
      const flick = p.invuln > 0 && p.invuln < 5 && Math.floor(t * 18) % 2 === 0;
      ctx.globalAlpha = flick ? 0.45 : 1;
      R.drawPotato(ctx, p.x, p.y, G.run ? G.run.charId : 'allround', {
        face: p.face, bob: p.moving ? Math.sin(p.walkT * 14) * 0.06 : Math.sin(t * 3) * 0.02,
        lookX: p.mvx, lookY: p.mvy,
      });
      ctx.globalAlpha = 1;
      for (const wp of w.weapons) drawHeldWeapon(ctx, wp);
    }

    for (const b of w.bullets) drawBullet(ctx, b);
    for (const b of w.ebullets) {
      ctx.fillStyle = b.big ? '#ff4d7a' : '#d04cff';
      ctx.strokeStyle = b.big ? '#5c0f25' : '#3f0b57';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.35, 0, TAU);
      ctx.fill();
    }

    for (const ex of w.explosions) {
      const k = 1 - ex.life / ex.max;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.r * (0.4 + 0.6 * k), 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#fff1c1';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const pt of w.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      const sz = pt.size * (0.5 + 0.5 * pt.life / pt.max);
      ctx.fillRect(pt.x - sz / 2, pt.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const tx of w.texts) {
      if (tx.life <= 0) continue;
      const k = tx.life / tx.max;
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.font = tx.size + 'px ' + FONT;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,14,10,0.9)';
      ctx.strokeText(tx.str, tx.x, tx.y);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.str, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawScreenFx(ctx, w, G) {
    const hud = G.hud();
    if (hud && hud.hp > 0 && hud.hp / hud.maxHp < 0.3) {
      const a = 0.18 + 0.12 * Math.sin(R.t * 6);
      const g = ctx.createRadialGradient(R.w / 2, R.h / 2, Math.min(R.w, R.h) * 0.35, R.w / 2, R.h / 2, Math.max(R.w, R.h) * 0.75);
      g.addColorStop(0, 'rgba(200,20,20,0)');
      g.addColorStop(1, 'rgba(200,20,20,' + a.toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, R.w, R.h);
    }
    if (w.hurtFlash > 0) {
      ctx.fillStyle = 'rgba(255,40,40,' + (w.hurtFlash * 0.6).toFixed(3) + ')';
      ctx.fillRect(0, 0, R.w, R.h);
    }
    const tc = BR.Input && BR.Input.touch;
    if (tc && tc.active) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#f6e9d2';
      ctx.beginPath();
      ctx.arc(tc.bx, tc.by, BR.Input.JOY_RADIUS, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.75;
      const dx = tc.x - tc.bx;
      const dy = tc.y - tc.by;
      const d = Math.hypot(dx, dy);
      const m = d > BR.Input.JOY_RADIUS ? BR.Input.JOY_RADIUS / d : 1;
      ctx.beginPath();
      ctx.arc(tc.bx + dx * m, tc.by + dy * m, 24, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- Patates (oyuncu) ---------- */
  R.drawPotato = function (ctx, x, y, charId, o) {
    o = o || {};
    const face = o.face || 1;
    const bob = o.bob || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face * (1 - bob * 0.5), 1 + bob);
    // gövde
    ctx.fillStyle = '#d29d5f';
    ctx.strokeStyle = '#5e3d1f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 19, 24, 0.08, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // lekeler
    ctx.fillStyle = '#b07e45';
    ctx.beginPath();
    ctx.ellipse(-9, 9, 3, 2, 0.4, 0, TAU);
    ctx.ellipse(6, 14, 2.4, 1.6, 0, 0, TAU);
    ctx.ellipse(-4, -15, 2, 1.4, 0, 0, TAU);
    ctx.fill();
    // gözler
    const lx = U.clamp(o.lookX || 0, -1, 1) * (face > 0 ? 1 : -1);
    const ly = U.clamp(o.lookY || 0, -1, 1);
    for (const ex of [-1, 7]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(ex, -5, 4.6, 5.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1b1410';
      ctx.beginPath();
      ctx.arc(ex + 1.2 + lx * 1.4, -4.5 + ly * 1.6, 2.4, 0, TAU);
      ctx.fill();
    }
    // ağız
    ctx.strokeStyle = '#4a2c14';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(4, 5, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();
    drawAccessory(ctx, charId);
    ctx.restore();
  };

  function drawAccessory(ctx, id) {
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#2a1a10';
    if (id === 'brawler') {
      ctx.fillStyle = '#e04848';
      ctx.beginPath();
      ctx.rect(-18, -16, 36, 6);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-17, -13);
      ctx.lineTo(-27, -9);
      ctx.lineTo(-24, -16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (id === 'ranger') {
      ctx.fillStyle = '#4f7d3a';
      ctx.beginPath();
      ctx.moveTo(-17, -14);
      ctx.quadraticCurveTo(0, -36, 17, -14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#e04848';
      ctx.beginPath();
      ctx.moveTo(8, -24);
      ctx.lineTo(18, -36);
      ctx.stroke();
    } else if (id === 'mage') {
      ctx.fillStyle = '#6a4bc4';
      ctx.beginPath();
      ctx.moveTo(-20, -15);
      ctx.lineTo(20, -15);
      ctx.lineTo(4, -48);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(1, -28, 3, 0, TAU);
      ctx.fill();
    } else if (id === 'engineer') {
      ctx.fillStyle = '#f2c230';
      ctx.beginPath();
      ctx.ellipse(0, -17, 18, 10, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(-22, -18, 44, 4);
      ctx.fill();
      ctx.stroke();
    } else if (id === 'lucky') {
      ctx.fillStyle = '#4fae4a';
      for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
        ctx.beginPath();
        ctx.arc(dx * 0.9, -30 + dy * 0.9, 4.2, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, -26);
      ctx.lineTo(0, -21);
      ctx.stroke();
    } else {
      // çok yönlü: tepesinde küçük bir filiz
      ctx.strokeStyle = '#3c7a2a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -23);
      ctx.lineTo(0, -31);
      ctx.stroke();
      ctx.fillStyle = '#6cbf4a';
      ctx.beginPath();
      ctx.ellipse(-5, -32, 5, 2.6, -0.5, 0, TAU);
      ctx.ellipse(5, -33, 5, 2.6, 0.5, 0, TAU);
      ctx.fill();
    }
  }

  /* ---------- Düşmanlar ---------- */
  function eyes(ctx, pts, r, lookX, lookY, color) {
    for (const [ex, ey] of pts) {
      ctx.fillStyle = color || '#fff';
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#140d18';
      ctx.beginPath();
      ctx.arc(ex + lookX * r * 0.4, ey + lookY * r * 0.4, r * 0.5, 0, TAU);
      ctx.fill();
    }
  }

  function blob(ctx, r, fill, stroke, sx, sy) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (sx || 1), r * (sy || 1), 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  function drawEnemy(ctx, e, p, t) {
    const def = e.def;
    const r = e.r;
    const grow = e.born < 0.25 ? 0.4 + 0.6 * (e.born / 0.25) : 1;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dd = Math.hypot(dx, dy) || 1;
    const lx = dx / dd;
    const ly = dy / dd;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.state === 'wind') ctx.translate(U.rand(-2.5, 2.5), U.rand(-2.5, 2.5));
    const sq = def.ai === 'tree' ? 0 : Math.sin(t * 9 + e.wob) * 0.05;
    let sc = grow;
    if (e.state === 'aim') sc *= 1.15;
    ctx.scale(sc * (1 + sq), sc * (1 - sq));
    const fill = e.state === 'wind' && Math.floor(t * 16) % 2 === 0 ? '#ff6a5a' : def.color;
    switch (e.type) {
      case 'baby':
        ctx.strokeStyle = def.dark;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-6, -r * 0.8);
        ctx.lineTo(-10, -r - 9);
        ctx.moveTo(6, -r * 0.8);
        ctx.lineTo(10, -r - 9);
        ctx.stroke();
        ctx.fillStyle = '#e7d0ff';
        ctx.beginPath();
        ctx.arc(-10, -r - 9, 3, 0, TAU);
        ctx.arc(10, -r - 9, 3, 0, TAU);
        ctx.fill();
        blob(ctx, r, fill, def.dark, 1, 0.92);
        eyes(ctx, [[-6, -3], [6, -3]], 5, lx, ly);
        break;
      case 'chaser':
        ctx.fillStyle = fill;
        ctx.strokeStyle = def.dark;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-r * 0.9, -r * 0.3);
        ctx.lineTo(-r * 0.6, -r * 1.5);
        ctx.lineTo(-r * 0.1, -r * 0.8);
        ctx.moveTo(r * 0.9, -r * 0.3);
        ctx.lineTo(r * 0.6, -r * 1.5);
        ctx.lineTo(r * 0.1, -r * 0.8);
        ctx.fill();
        ctx.stroke();
        blob(ctx, r, fill, def.dark);
        eyes(ctx, [[-5, -2], [5, -2]], 4, lx, ly, '#ffe8a8');
        ctx.strokeStyle = def.dark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-9, -8);
        ctx.lineTo(-2, -5);
        ctx.moveTo(9, -8);
        ctx.lineTo(2, -5);
        ctx.stroke();
        break;
      case 'spitter':
        blob(ctx, r, fill, def.dark, 1.05, 0.95);
        eyes(ctx, [[-6, -6], [6, -6]], 4.5, lx, ly);
        ctx.fillStyle = '#1e3317';
        ctx.beginPath();
        ctx.arc(lx * 6, 6 + ly * 3, e.state === 'aim' ? 7 : 5, 0, TAU);
        ctx.fill();
        break;
      case 'charger':
        ctx.fillStyle = '#f4ecd8';
        ctx.strokeStyle = def.dark;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, -r * 0.5);
        ctx.lineTo(-r * 1.2, -r * 1.2);
        ctx.lineTo(-r * 0.3, -r * 0.85);
        ctx.closePath();
        ctx.moveTo(r * 0.7, -r * 0.5);
        ctx.lineTo(r * 1.2, -r * 1.2);
        ctx.lineTo(r * 0.3, -r * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        blob(ctx, r, fill, def.dark, 1.1, 0.95);
        eyes(ctx, [[-7, -3], [7, -3]], 5, lx, ly);
        ctx.fillStyle = def.dark;
        ctx.beginPath();
        ctx.ellipse(0, 9, 7, 4, 0, 0, TAU);
        ctx.fill();
        break;
      case 'bruiser':
        blob(ctx, r, fill, def.dark, 1.08, 1);
        ctx.fillStyle = def.dark;
        ctx.fillRect(-r * 0.75, -r * 0.45, r * 1.5, 7);
        eyes(ctx, [[-9, -4], [9, -4]], 5, lx, ly);
        ctx.strokeStyle = def.dark;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-10, 14);
        ctx.lineTo(10, 14);
        ctx.stroke();
        break;
      case 'tree':
        ctx.fillStyle = '#6b4a2b';
        ctx.strokeStyle = '#2e1d10';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.rect(-7, -2, 14, r + 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = fill;
        ctx.strokeStyle = def.dark;
        ctx.beginPath();
        ctx.arc(-12, -10, 16, 0, TAU);
        ctx.arc(12, -10, 16, 0, TAU);
        ctx.arc(0, -24, 18, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-12, -10, 15, 0, TAU);
        ctx.arc(12, -10, 15, 0, TAU);
        ctx.arc(0, -24, 17, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#d9473f';
        ctx.beginPath();
        ctx.arc(-8, -18, 3.5, 0, TAU);
        ctx.arc(9, -8, 3.5, 0, TAU);
        ctx.arc(2, -30, 3.5, 0, TAU);
        ctx.fill();
        break;
      case 'elite':
        ctx.fillStyle = '#f2d16b';
        ctx.strokeStyle = def.dark;
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + t * 0.6;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - 0.18) * r * 0.9, Math.sin(a - 0.18) * r * 0.9);
          ctx.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3);
          ctx.lineTo(Math.cos(a + 0.18) * r * 0.9, Math.sin(a + 0.18) * r * 0.9);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        blob(ctx, r, fill, def.dark);
        eyes(ctx, [[-15, -8], [15, -8]], 10, lx, ly, '#ffe27a');
        ctx.fillStyle = def.dark;
        ctx.beginPath();
        ctx.ellipse(0, 18, 18, 8, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#f4ecd8';
        for (let i = -2; i <= 2; i++) ctx.fillRect(i * 6 - 2, 11, 4, 6);
        break;
      case 'boss': {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + Math.sin(t * 2 + i) * 0.15;
          ctx.fillStyle = def.color;
          ctx.strokeStyle = def.dark;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95 + 8, r * 0.32, 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
        blob(ctx, r, fill, def.dark, 1.05, 1);
        ctx.fillStyle = '#ffcd4d';
        ctx.strokeStyle = '#6b4a10';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-34, -r + 14);
        ctx.lineTo(-38, -r - 22);
        ctx.lineTo(-18, -r - 2);
        ctx.lineTo(0, -r - 30);
        ctx.lineTo(18, -r - 2);
        ctx.lineTo(38, -r - 22);
        ctx.lineTo(34, -r + 14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        eyes(ctx, [[-24, -10], [0, -18], [24, -10]], 11, lx, ly, '#fff4c2');
        ctx.fillStyle = def.dark;
        ctx.beginPath();
        ctx.arc(0, 22, e.state === 'spiral' ? 18 : 12, 0, Math.PI);
        ctx.fill();
        break;
      }
      default:
        blob(ctx, r, fill, def.dark);
        eyes(ctx, [[-6, -3], [6, -3]], 5, lx, ly);
    }
    if (e.flash > 0) {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, def.ai === 'tree' ? -10 : 0, r * 1.02, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (e.burn) {
      ctx.fillStyle = 'rgba(255,140,40,0.85)';
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + i * 2.1;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.6, -r * 0.4 + Math.sin(a * 1.3) * r * 0.4 - ((t * 40 + i * 10) % 16), 3.5, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    if (def.big && e.hp < e.maxHp) {
      const bw = r * 1.6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - bw / 2, e.y - r - 26, bw, 7);
      ctx.fillStyle = '#ff5d5d';
      ctx.fillRect(e.x - bw / 2 + 1, e.y - r - 25, (bw - 2) * Math.max(0, e.hp / e.maxHp), 5);
    }
  }

  /* ---------- Ganimetler, taretler, mermiler ---------- */
  function drawPickup(ctx, pk, t) {
    const bob = Math.sin(t * 5 + pk.bob) * 2;
    const x = pk.x;
    const y = pk.y + bob;
    if (pk.kind === 'mat') {
      const s = pk.value > 1 ? 1.35 : 1;
      ctx.fillStyle = '#8fd14f';
      ctx.strokeStyle = '#2c5e17';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 9 * s);
      ctx.lineTo(x + 7 * s, y);
      ctx.lineTo(x, y + 9 * s);
      ctx.lineTo(x - 7 * s, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.moveTo(x, y - 6 * s);
      ctx.lineTo(x + 3 * s, y - 1 * s);
      ctx.lineTo(x, y + 1 * s);
      ctx.closePath();
      ctx.fill();
    } else if (pk.kind === 'fruit') {
      ctx.fillStyle = '#e8473f';
      ctx.strokeStyle = '#5c1410';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#5fbf4a';
      ctx.beginPath();
      ctx.ellipse(x + 4, y - 10, 5, 2.5, -0.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(x - 3, y - 3, 2.5, 0, TAU);
      ctx.fill();
    } else {
      const s = pk.value >= 3 ? 1.25 : 1;
      ctx.fillStyle = pk.value >= 3 ? '#c9752f' : '#a8692f';
      ctx.strokeStyle = '#3a220f';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.rect(x - 12 * s, y - 10 * s, 24 * s, 20 * s);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = pk.value >= 3 ? '#ffcd4d' : '#6b4019';
      ctx.beginPath();
      ctx.moveTo(x - 12 * s, y - 2 * s);
      ctx.lineTo(x + 12 * s, y - 2 * s);
      ctx.moveTo(x, y - 10 * s);
      ctx.lineTo(x, y + 10 * s);
      ctx.stroke();
    }
  }

  function drawTurret(ctx, tu) {
    const col = D.TIERS[tu.tier].color;
    ctx.save();
    ctx.translate(tu.x, tu.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 18, 6, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#6e6a74';
    ctx.strokeStyle = '#26232b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-15, 14);
    ctx.lineTo(15, 14);
    ctx.lineTo(9, 0);
    ctx.lineTo(-9, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.rotate(tu.ang);
    ctx.translate(-tu.recoil * 4, 0);
    ctx.fillStyle = '#9a96a2';
    ctx.fillRect(0, -4, 22, 8);
    ctx.strokeRect(0, -4, 22, 8);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawBullet(ctx, b) {
    if (b.kind === 'rocket') {
      const a = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(a);
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.moveTo(-10, -4);
      ctx.lineTo(-20 - Math.random() * 6, 0);
      ctx.lineTo(-10, 4);
      ctx.fill();
      ctx.fillStyle = '#7d8f5a';
      ctx.strokeStyle = '#2b331d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-10, -5, 16, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d9473f';
      ctx.beginPath();
      ctx.moveTo(6, -5);
      ctx.lineTo(13, 0);
      ctx.lineTo(6, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (b.kind === 'wand') {
      ctx.fillStyle = 'rgba(255,140,40,0.35)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 1.9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffcf6b';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      return;
    }
    if (b.kind === 'crossbow') {
      const a = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(a);
      ctx.strokeStyle = '#3a2614';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();
      ctx.fillStyle = '#d8d8d8';
      ctx.beginPath();
      ctx.moveTo(8, -4);
      ctx.lineTo(14, 0);
      ctx.lineTo(8, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = b.kind === 'turret' ? '#8fe3ff' : b.crit ? '#fff2a8' : '#ffd95a';
    ctx.strokeStyle = b.kind === 'turret' ? '#1d4a5c' : '#6b4a0c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  /* ---------- Silahlar ---------- */
  function drawHeldWeapon(ctx, wp) {
    ctx.save();
    ctx.translate(wp.x, wp.y);
    ctx.rotate(wp.ang);
    if (Math.cos(wp.ang) < 0) ctx.scale(1, -1);
    ctx.translate(-wp.recoil * 6, 0);
    R.drawWeaponShape(ctx, wp.def.id, wp.tier);
    ctx.restore();
  }

  // Silah orijinde, +x yönüne bakacak şekilde çizilir (yaklaşık -14..+34 genişlik)
  R.drawWeaponShape = function (ctx, id, tier) {
    const out = tier > 1 ? D.TIERS[tier].color : '#1f1712';
    ctx.lineWidth = tier > 1 ? 3 : 2.5;
    ctx.strokeStyle = out;
    ctx.lineJoin = 'round';
    const shape = (fill, fn) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      fn();
      ctx.fill();
      ctx.stroke();
    };
    switch (id) {
      case 'fist':
        shape('#f0c08a', () => ctx.arc(4, 0, 10, 0, TAU));
        shape('#e2ad74', () => ctx.ellipse(6, -8, 5, 3.5, 0.3, 0, TAU));
        break;
      case 'knife':
        shape('#6b4a2b', () => ctx.rect(-10, -3.5, 12, 7));
        shape('#d9dde3', () => {
          ctx.moveTo(2, -5);
          ctx.lineTo(26, 0);
          ctx.lineTo(2, 5);
          ctx.closePath();
        });
        break;
      case 'spear':
        shape('#8a5f34', () => ctx.rect(-18, -2.5, 40, 5));
        shape('#d9dde3', () => {
          ctx.moveTo(22, -7);
          ctx.lineTo(38, 0);
          ctx.lineTo(22, 7);
          ctx.closePath();
        });
        break;
      case 'hammer':
        shape('#8a5f34', () => ctx.rect(-12, -3, 30, 6));
        shape('#8d8f99', () => ctx.rect(14, -12, 14, 24));
        break;
      case 'sword':
        shape('#6b4a2b', () => ctx.rect(-12, -3, 10, 6));
        shape('#c9a23a', () => ctx.rect(-3, -9, 5, 18));
        shape('#e4e8ee', () => {
          ctx.moveTo(2, -4);
          ctx.lineTo(32, -3);
          ctx.lineTo(38, 0);
          ctx.lineTo(32, 3);
          ctx.lineTo(2, 4);
          ctx.closePath();
        });
        break;
      case 'wrench':
        shape('#9aa0aa', () => ctx.rect(-12, -3.5, 30, 7));
        shape('#9aa0aa', () => {
          ctx.arc(22, 0, 9, 0.7, TAU - 0.7);
          ctx.lineTo(22, 0);
          ctx.closePath();
        });
        break;
      case 'pistol':
        shape('#5b5764', () => ctx.rect(-6, -5, 24, 9));
        shape('#57401f', () => ctx.rect(-6, 2, 8, 11));
        break;
      case 'smg':
        shape('#55515e', () => ctx.rect(-10, -5, 32, 9));
        shape('#55515e', () => ctx.rect(4, 3, 6, 12));
        shape('#57401f', () => ctx.rect(-10, 2, 7, 9));
        break;
      case 'shotgun':
        shape('#6b4a2b', () => ctx.rect(-14, -4, 16, 9));
        shape('#5b5764', () => ctx.rect(0, -5, 34, 7));
        break;
      case 'crossbow':
        shape('#7a5532', () => ctx.rect(-12, -3, 30, 6));
        ctx.strokeStyle = out;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(10, 0, 14, -1.25, 1.25);
        ctx.stroke();
        ctx.strokeStyle = '#e8e2d4';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(10 + Math.cos(-1.25) * 14, Math.sin(-1.25) * 14);
        ctx.lineTo(0, 0);
        ctx.lineTo(10 + Math.cos(1.25) * 14, Math.sin(1.25) * 14);
        ctx.stroke();
        break;
      case 'wand':
        shape('#7a5532', () => ctx.rect(-12, -2.5, 30, 5));
        shape(tier > 1 ? D.TIERS[tier].color : '#ff8a3c', () => ctx.arc(22, 0, 7, 0, TAU));
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(20, -2, 2.4, 0, TAU);
        ctx.fill();
        break;
      case 'rocket':
        shape('#6e8250', () => ctx.rect(-14, -7, 38, 13));
        shape('#5b5764', () => ctx.rect(-4, 5, 7, 9));
        shape('#d9473f', () => ctx.rect(22, -8, 5, 15));
        break;
      default:
        shape('#ccc', () => ctx.arc(0, 0, 8, 0, TAU));
    }
  };

  /* ---------- Arayüz ikonları ---------- */
  function prepIcon(canvas, size) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    return ctx;
  }

  R.weaponIcon = function (canvas, id, tier, size) {
    size = size || 48;
    const ctx = prepIcon(canvas, size);
    ctx.translate(size / 2 - size * 0.08, size / 2 + size * 0.05);
    ctx.rotate(-Math.PI / 4);
    const k = size / 50;
    ctx.scale(k, k);
    ctx.translate(-10, 0);
    R.drawWeaponShape(ctx, id, tier);
  };

  R.potatoIcon = function (canvas, charId, size) {
    size = size || 72;
    const ctx = prepIcon(canvas, size);
    const k = size / 80;
    ctx.translate(size / 2, size / 2 + 8 * k);
    ctx.scale(k * 1.25, k * 1.25);
    R.drawPotato(ctx, 0, 0, charId, { face: 1 });
  };

  R.statIcon = function (canvas, key, size) {
    size = size || 32;
    const ctx = prepIcon(canvas, size);
    ctx.translate(size / 2, size / 2);
    const k = size / 32;
    ctx.scale(k, k);
    R.drawGlyph(ctx, key);
  };

  R.itemIcon = function (canvas, item, size) {
    size = size || 44;
    const ctx = prepIcon(canvas, size);
    const col = D.TIERS[item.tier].color;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    roundRect(ctx, 1.5, 1.5, size - 3, size - 3, size * 0.22);
    ctx.fill();
    ctx.stroke();
    ctx.translate(size / 2, size / 2);
    const k = size / 36;
    ctx.scale(k, k);
    let key = item.turret ? 'turret' : null;
    if (!key) {
      for (const s in item.stats) {
        if (item.stats[s] > 0) {
          key = s;
          break;
        }
      }
    }
    R.drawGlyph(ctx, key || Object.keys(item.stats)[0]);
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // 32x32'lik bir kutuya, merkez (0,0) olacak şekilde istatistik sembolü
  R.drawGlyph = function (ctx, key) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1f1712';
    const fs = (fill) => {
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
    };
    switch (key) {
      case 'maxHp':
        ctx.beginPath();
        ctx.moveTo(0, 11);
        ctx.bezierCurveTo(-14, 1, -12, -12, 0, -5);
        ctx.bezierCurveTo(12, -12, 14, 1, 0, 11);
        fs('#e5484d');
        break;
      case 'hpRegen':
        ctx.beginPath();
        ctx.rect(-4, -11, 8, 22);
        ctx.rect(-11, -4, 22, 8);
        fs('#6fd36a');
        ctx.fillStyle = '#6fd36a';
        ctx.fillRect(-3, -3, 6, 6);
        break;
      case 'lifeSteal':
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.bezierCurveTo(9, 0, 9, 11, 0, 11);
        ctx.bezierCurveTo(-9, 11, -9, 0, 0, -12);
        fs('#c0263a');
        break;
      case 'damage':
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU - Math.PI / 2;
          const r = i % 2 ? 6 : 13;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        fs('#ff8c3a');
        break;
      case 'meleeDamage':
        ctx.save();
        ctx.rotate(-Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(-6, -3);
        ctx.lineTo(10, -2.5);
        ctx.lineTo(14, 0);
        ctx.lineTo(10, 2.5);
        ctx.lineTo(-6, 3);
        ctx.closePath();
        fs('#dfe3ea');
        ctx.beginPath();
        ctx.rect(-8, -7, 3, 14);
        fs('#c9a23a');
        ctx.beginPath();
        ctx.rect(-14, -2, 6, 4);
        fs('#6b4a2b');
        ctx.restore();
        break;
      case 'rangedDamage':
        ctx.save();
        ctx.rotate(-Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(-10, -5);
        ctx.lineTo(4, -5);
        ctx.quadraticCurveTo(13, 0, 4, 5);
        ctx.lineTo(-10, 5);
        ctx.closePath();
        fs('#e5b54a');
        ctx.beginPath();
        ctx.rect(-12, -5, 4, 10);
        fs('#b07e2a');
        ctx.restore();
        break;
      case 'elementalDamage':
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.bezierCurveTo(10, -3, 11, 4, 8, 8);
        ctx.quadraticCurveTo(0, 15, -8, 8);
        ctx.bezierCurveTo(-11, 3, -6, -2, -3, -6);
        ctx.quadraticCurveTo(-1, -1, 0, -13);
        fs('#ff7a2e');
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.quadraticCurveTo(6, 4, 3, 8);
        ctx.quadraticCurveTo(0, 11, -3, 8);
        ctx.quadraticCurveTo(-5, 4, 0, -2);
        ctx.fillStyle = '#ffd23f';
        ctx.fill();
        break;
      case 'attackSpeed':
        ctx.beginPath();
        ctx.moveTo(3, -13);
        ctx.lineTo(-8, 2);
        ctx.lineTo(-1, 2);
        ctx.lineTo(-4, 13);
        ctx.lineTo(8, -3);
        ctx.lineTo(1, -3);
        ctx.closePath();
        fs('#ffd23f');
        break;
      case 'critChance':
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, TAU);
        fs('#f6e9d2');
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, TAU);
        fs('#e5484d');
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(0, -8);
        ctx.moveTo(0, 14);
        ctx.lineTo(0, 8);
        ctx.moveTo(-14, 0);
        ctx.lineTo(-8, 0);
        ctx.moveTo(14, 0);
        ctx.lineTo(8, 0);
        ctx.stroke();
        break;
      case 'engineering':
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU;
          const r = i % 4 < 2 ? 13 : 9.5;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        fs('#9aa0aa');
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, TAU);
        fs('#3d3a42');
        break;
      case 'range':
        ctx.beginPath();
        ctx.moveTo(-12, 3);
        ctx.lineTo(4, 3);
        ctx.lineTo(4, 8);
        ctx.lineTo(13, 0);
        ctx.lineTo(4, -8);
        ctx.lineTo(4, -3);
        ctx.lineTo(-12, -3);
        ctx.closePath();
        fs('#5aa9ff');
        break;
      case 'armor':
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.lineTo(11, -8);
        ctx.quadraticCurveTo(11, 8, 0, 13);
        ctx.quadraticCurveTo(-11, 8, -11, -8);
        ctx.closePath();
        fs('#7d93b8');
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(0, 9);
        ctx.stroke();
        break;
      case 'dodge':
        ctx.beginPath();
        ctx.moveTo(-10, 12);
        ctx.quadraticCurveTo(-8, -6, 11, -12);
        ctx.quadraticCurveTo(6, 6, -10, 12);
        fs('#e8f2ff');
        ctx.beginPath();
        ctx.moveTo(-10, 12);
        ctx.lineTo(6, -6);
        ctx.stroke();
        break;
      case 'speed':
        ctx.beginPath();
        ctx.moveTo(-12, -9);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-12, 9);
        ctx.lineTo(-7, 9);
        ctx.lineTo(2, 0);
        ctx.lineTo(-7, -9);
        ctx.closePath();
        ctx.moveTo(0, -9);
        ctx.lineTo(9, 0);
        ctx.lineTo(0, 9);
        ctx.lineTo(5, 9);
        ctx.lineTo(14, 0);
        ctx.lineTo(5, -9);
        ctx.closePath();
        fs('#5fd1d6');
        break;
      case 'luck':
        for (const [dx, dy] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
          ctx.beginPath();
          ctx.arc(dx, dy, 6, 0, TAU);
          fs('#4fae4a');
        }
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, TAU);
        ctx.fillStyle = '#4fae4a';
        ctx.fill();
        break;
      case 'harvesting':
        ctx.beginPath();
        ctx.moveTo(0, 13);
        ctx.lineTo(0, -4);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(-6, -5, 7, 4, -0.6, 0, TAU);
        fs('#6cbf4a');
        ctx.beginPath();
        ctx.ellipse(6, -7, 7, 4, 0.6, 0, TAU);
        fs('#6cbf4a');
        ctx.beginPath();
        ctx.ellipse(0, 12, 9, 3, 0, 0, TAU);
        fs('#8a5f34');
        break;
      case 'pickupRange':
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#1f1712';
        ctx.beginPath();
        ctx.arc(0, -1, 8, Math.PI, 0, true);
        ctx.stroke();
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = '#e5484d';
        ctx.beginPath();
        ctx.arc(0, -1, 8, Math.PI, 0, true);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#1f1712';
        ctx.beginPath();
        ctx.rect(-11, -9, 6, 6);
        ctx.rect(5, -9, 6, 6);
        fs('#d9dde3');
        break;
      case 'turret':
        ctx.beginPath();
        ctx.moveTo(-11, 11);
        ctx.lineTo(11, 11);
        ctx.lineTo(6, 2);
        ctx.lineTo(-6, 2);
        ctx.closePath();
        fs('#6e6a74');
        ctx.beginPath();
        ctx.rect(0, -6, 14, 6);
        fs('#9a96a2');
        ctx.beginPath();
        ctx.arc(0, -3, 7, 0, TAU);
        fs('#8fe3ff');
        break;
      default:
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, TAU);
        fs('#d8cfbd');
    }
    ctx.lineCap = 'butt';
  };

  BR.Render = R;
})((window.BR = window.BR || {}));
