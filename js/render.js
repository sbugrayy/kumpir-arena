/* Kumpir Arena - dünya çizimi: kamera, arenalar, varlıklar, efektler */
(function (BR) {
  'use strict';

  const U = BR.U;
  const D = BR.DATA;
  const Art = BR.Art;
  const AW = D.ARENA_W;
  const AH = D.ARENA_H;
  const TAU = U.TAU;
  const FONT = '"Paytone One", "Arial Black", Impact, sans-serif';
  const P2_TINT = '#5aa9ff';

  const R = {
    canvas: null,
    ctx: null,
    w: 0,
    h: 0,
    dpr: 1,
    cam: { x: AW / 2, y: AH / 2, s: 1 },
    floors: {},
    fog: null,
    t: 0,
  };

  /* ---------- Kurulum ---------- */
  R.init = function (canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d');
    R.floors.field = R.ctx.createPattern(fieldTile(), 'repeat');
    R.floors.kitchen = R.ctx.createPattern(kitchenTile(), 'repeat');
    R.floors.market = R.ctx.createPattern(marketTile(), 'repeat');
    R.fog = document.createElement('canvas');
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
    if (R.fog) {
      R.fog.width = Math.max(1, Math.round(w / 2));
      R.fog.height = Math.max(1, Math.round(h / 2));
    }
  };

  function seeded(seed) {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
  }

  function fieldTile() {
    const c = document.createElement('canvas');
    const S = 320;
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#5f564b';
    g.fillRect(0, 0, S, S);
    const rnd = seeded(7);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(40,32,26,0.16)' : 'rgba(255,240,215,0.05)';
      const r = 2 + rnd() * 6;
      g.beginPath();
      g.ellipse(rnd() * S, rnd() * S, r, r * 0.7, rnd() * 3, 0, TAU);
      g.fill();
    }
    for (let i = 0; i < 4; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      g.fillStyle = '#7a7064';
      g.beginPath();
      g.ellipse(x, y, 4 + rnd() * 3, 3 + rnd() * 2, rnd() * 3, 0, TAU);
      g.fill();
    }
    for (let i = 0; i < 3; i++) {
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

  function kitchenTile() {
    const c = document.createElement('canvas');
    const S = 160;
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        g.fillStyle = (x + y) % 2 ? '#8f8270' : '#9c8f7b';
        g.fillRect(x * 80, y * 80, 80, 80);
      }
    }
    g.strokeStyle = 'rgba(60,48,36,0.45)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 80, 80);
    g.strokeRect(80, 80, 80, 80);
    g.strokeRect(80, 0, 80, 80);
    g.strokeRect(0, 80, 80, 80);
    const rnd = seeded(11);
    for (let i = 0; i < 25; i++) {
      g.fillStyle = 'rgba(255,250,235,0.05)';
      g.fillRect(rnd() * S, rnd() * S, 3, 3);
    }
    return c;
  }

  function marketTile() {
    const c = document.createElement('canvas');
    const S = 200;
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#4d463f';
    g.fillRect(0, 0, S, S);
    const rnd = seeded(23);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const x = col * 40 + (row % 2 ? 20 : 0) + rnd() * 4;
        const y = row * 40 + rnd() * 4;
        const shade = 92 + Math.floor(rnd() * 22);
        g.fillStyle = 'rgb(' + shade + ',' + (shade - 8) + ',' + (shade - 18) + ')';
        g.beginPath();
        g.ellipse(x % S, y, 17, 16, rnd(), 0, TAU);
        g.fill();
      }
    }
    return c;
  }

  /* ---------- Kamera ---------- */
  function baseScale() {
    return U.clamp(Math.sqrt((R.w * R.h) / (1250 * 820)), 0.42, 2.2);
  }

  function playing(G) {
    return G.w && (G.state === 'wave' || G.state === 'dead' || G.state === 'victory');
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
    const show = playing(G);
    let tx = AW / 2 + Math.cos(R.t * 0.05) * 320;
    let ty = AH / 2 + Math.sin(R.t * 0.07) * 220;
    let s = baseScale();
    if (show) {
      const ps = w.players.filter((p) => !p.dead);
      const list = ps.length ? ps : w.players;
      tx = list.reduce((a, p) => a + p.x, 0) / list.length;
      ty = list.reduce((a, p) => a + p.y, 0) / list.length;
      if (list.length > 1) {
        const dx = Math.abs(list[0].x - list[1].x) / 2 + 260;
        const dy = Math.abs(list[0].y - list[1].y) / 2 + 200;
        s = Math.max(0.33, Math.min(s, R.w / (2 * dx), R.h / (2 * dy)));
      }
    }
    const vw = R.w / s;
    const vh = R.h / s;
    const margin = 90;
    const cx = vw >= AW + margin * 2 ? AW / 2 : U.clamp(tx, vw / 2 - margin, AW - vw / 2 + margin);
    const cy = vh >= AH + margin * 2 ? AH / 2 : U.clamp(ty, vh / 2 - margin, AH - vh / 2 + margin);
    let ox = 0;
    let oy = 0;
    const st = BR.settings || {};
    if (show && st.shake !== false && w.shake > 0.2 && !G.paused) {
      ox = U.rand(-1, 1) * w.shake;
      oy = U.rand(-1, 1) * w.shake;
    }
    R.cam.x = cx;
    R.cam.y = cy;
    R.cam.s = s;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (R.w / 2 - (cx + ox) * s), dpr * (R.h / 2 - (cy + oy) * s));
    const arenaId = show && w.arena ? w.arena.id : 'field';
    drawArena(ctx, arenaId);
    if (show) drawWorld(ctx, w, G);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (show && G.state === 'wave') drawScreenFx(ctx, w, G);
  };

  // dünya koordinatından ekran koordinatına
  function toScreen(x, y) {
    return { x: R.w / 2 + (x - R.cam.x) * R.cam.s, y: R.h / 2 + (y - R.cam.y) * R.cam.s };
  }

  function drawArena(ctx, id) {
    ctx.fillStyle = R.floors[id] || '#5f564b';
    ctx.fillRect(0, 0, AW, AH);
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#2a211a';
    ctx.strokeRect(-7, -7, AW + 14, AH + 14);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,230,190,0.12)';
    ctx.strokeRect(2, 2, AW - 4, AH - 4);
  }

  /* ---------- Arena tehlikeleri ---------- */
  function drawGroundHazards(ctx, a, t) {
    for (const m of a.mud) {
      ctx.fillStyle = '#3f3226';
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, m.rx, m.ry, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#4b3c2d';
      ctx.beginPath();
      ctx.ellipse(m.x - m.rx * 0.1, m.y - m.ry * 0.1, m.rx * 0.8, m.ry * 0.75, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,210,0.12)';
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.6 + i * 0.33) % 1;
        ctx.beginPath();
        ctx.arc(m.x + Math.cos(i * 2.1) * m.rx * 0.45, m.y + Math.sin(i * 2.1) * m.ry * 0.45, 3 + ph * 4, 0, TAU);
        ctx.fill();
      }
    }
    for (const b of a.burners) {
      ctx.fillStyle = '#2b2622';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 8, 0, TAU);
      ctx.fill();
      let glow = 0;
      if (b.state === 'warn') glow = 0.35 + 0.35 * Math.abs(Math.sin(t * 9));
      else if (b.state === 'hot') glow = 0.95;
      ctx.fillStyle = glow ? 'rgba(255,' + Math.round(120 - glow * 60) + ',40,' + glow.toFixed(2) + ')' : '#3d3631';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#151210';
      ctx.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(ang) * b.r, b.y + Math.sin(ang) * b.r);
        ctx.lineTo(b.x - Math.cos(ang) * b.r, b.y - Math.sin(ang) * b.r);
        ctx.stroke();
      }
      if (b.state === 'hot') {
        ctx.fillStyle = 'rgba(255,200,80,0.85)';
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * TAU + t * 2;
          const fx = b.x + Math.cos(ang) * b.r * 0.6;
          const fy = b.y + Math.sin(ang) * b.r * 0.6;
          const h = 10 + Math.sin(t * 20 + i) * 5;
          ctx.beginPath();
          ctx.moveTo(fx - 5, fy);
          ctx.lineTo(fx, fy - h);
          ctx.lineTo(fx + 5, fy);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  const AWNING = ['#c0392b', '#2e86c1', '#27ae60', '#d4ac0d'];
  function drawStalls(ctx, a) {
    for (const s of a.stalls) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(s.x + 6, s.y + 8, s.w, s.h);
      ctx.fillStyle = '#8a5f34';
      ctx.strokeStyle = '#2e1d10';
      ctx.lineWidth = 4;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeRect(s.x, s.y, s.w, s.h);
      // tente şeritleri
      const col = AWNING[s.color % AWNING.length];
      const horiz = s.w > s.h;
      const n = 5;
      for (let i = 0; i < n; i++) {
        if (i % 2) continue;
        ctx.fillStyle = col;
        if (horiz) ctx.fillRect(s.x + (i * s.w) / n, s.y, s.w / n, s.h * 0.45);
        else ctx.fillRect(s.x, s.y + (i * s.h) / n, s.w * 0.45, s.h / n);
      }
      // kasalarda sebze meyve
      const fruits = ['#e8473f', '#f7c948', '#7cb342', '#ff8a3c'];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = fruits[(i + s.color) % 4];
        const fx = horiz ? s.x + 20 + i * ((s.w - 40) / 3) : s.x + s.w * 0.72;
        const fy = horiz ? s.y + s.h * 0.72 : s.y + 20 + i * ((s.h - 40) / 3);
        ctx.beginPath();
        ctx.arc(fx, fy, 7, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawPins(ctx, a, t) {
    for (const pin of a.pins) {
      const seg = BR.Arena.pinSegment(pin);
      if (pin.warn > 0) {
        // giriş kenarında uyarı oku ve yol çizgisi
        const blink = 0.35 + 0.5 * Math.abs(Math.sin(t * 10));
        ctx.globalAlpha = blink;
        ctx.strokeStyle = '#ff5d5d';
        ctx.lineWidth = 6;
        ctx.setLineDash([24, 18]);
        ctx.beginPath();
        if (pin.horiz) {
          ctx.moveTo(0, pin.pos);
          ctx.lineTo(AW, pin.pos);
        } else {
          ctx.moveTo(pin.pos, 0);
          ctx.lineTo(pin.pos, AH);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2e1d10';
      ctx.lineWidth = BR.Arena.PIN_R * 2 + 6;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
      ctx.strokeStyle = '#d9a86c';
      ctx.lineWidth = BR.Arena.PIN_R * 2;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
      ctx.strokeStyle = '#8a5f34';
      ctx.lineWidth = 9;
      const ex = (seg.x2 - seg.x1) * 0.12;
      const ey = (seg.y2 - seg.y1) * 0.12;
      ctx.beginPath();
      ctx.moveTo(seg.x1 - ex, seg.y1 - ey);
      ctx.lineTo(seg.x1, seg.y1);
      ctx.moveTo(seg.x2, seg.y2);
      ctx.lineTo(seg.x2 + ex, seg.y2 + ey);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
  }

  /* ---------- Dünya ---------- */
  function drawWorld(ctx, w, G) {
    const t = R.t;
    const a = w.arena;
    if (a) drawGroundHazards(ctx, a, t);

    for (const m of w.markers) {
      const big = D.ENEMIES[m.type] && D.ENEMIES[m.type].big;
      const sz = big ? 34 : m.type === 'tree' ? 16 : 13;
      ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(t * 10));
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

    for (const c of w.clouds) {
      const k = Math.min(1, c.t, (c.max - c.t) * 4);
      ctx.globalAlpha = 0.28 * k;
      ctx.fillStyle = '#7fbf3a';
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * TAU + t * 0.4;
        ctx.beginPath();
        ctx.arc(c.x + Math.cos(ang) * c.r * 0.4, c.y + Math.sin(ang) * c.r * 0.4, c.r * 0.6, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    for (const pk of w.pickups) drawPickup(ctx, pk, t);
    for (const tu of w.turrets) drawTurret(ctx, tu);
    if (a) drawStalls(ctx, a);

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (const e of w.enemies) {
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.r * 0.85, e.r * 0.9, e.r * 0.32, 0, 0, TAU);
      ctx.fill();
    }
    for (const p of w.players) {
      if (p.dead) continue;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 22, 17, 6, 0, 0, TAU);
      ctx.fill();
    }

    const look = w.players.find((p) => !p.dead) || w.players[0];
    for (const e of w.enemies) if (e.type === 'tree' || e.type === 'egg') drawEnemy(ctx, e, look, t);
    for (const e of w.enemies) if (e.type !== 'tree' && e.type !== 'egg') drawEnemy(ctx, e, look, t);
    for (const e of w.enemies) if (e.beams) drawBeams(ctx, e, t);

    const run = G.run;
    const stage = run ? Art.stageFor(run.level) : 0;
    const maxHp = G.stats ? G.Calc.maxHp(G.stats) : 10;
    for (const p of w.players) drawPlayer(ctx, p, w, run, stage, maxHp, t);

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
    if (a) drawPins(ctx, a, t);

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
    for (const rg of w.rings) {
      const k = 1 - rg.life / rg.max;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = rg.color;
      ctx.lineWidth = 8 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rg.r * (0.3 + 0.7 * k), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const z of w.zaps) {
      ctx.globalAlpha = Math.max(0, z.life / z.max);
      ctx.strokeStyle = '#bfe8ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(z.x1, z.y1);
      const mx = (z.x1 + z.x2) / 2 + U.rand(-12, 12);
      const my = (z.y1 + z.y2) / 2 + U.rand(-12, 12);
      ctx.lineTo(mx, my);
      ctx.lineTo(z.x2, z.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const pt of w.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      const sz = pt.size * (0.5 + (0.5 * pt.life) / pt.max);
      ctx.fillRect(pt.x - sz / 2, pt.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const tx of w.texts) {
      if (tx.life <= 0) continue;
      ctx.globalAlpha = Math.min(1, (tx.life / tx.max) * 2.5);
      ctx.font = tx.size + 'px ' + FONT;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,14,10,0.9)';
      ctx.strokeText(tx.str, tx.x, tx.y);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.str, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer(ctx, p, w, run, stage, maxHp, t) {
    if (p.dead) {
      Art.drawPuree(ctx, p.x, p.y, p.deadT);
      return;
    }
    const coop = w.players.length > 1;
    if (p.goldT > 0) {
      ctx.fillStyle = 'rgba(255,205,77,0.35)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 34 + Math.sin(t * 10) * 3, 0, TAU);
      ctx.fill();
    }
    if (p.focusT > 0) {
      ctx.strokeStyle = 'rgba(255,210,63,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 30, t * 4, t * 4 + Math.PI * 1.2);
      ctx.stroke();
    }
    let alpha = 1;
    if (p.invisT > 0) alpha = 0.35;
    else if (p.invuln > 0 && p.invuln < 5 && p.dashT <= 0 && Math.floor(t * 18) % 2 === 0) alpha = 0.45;
    ctx.globalAlpha = alpha;
    Art.drawPotato(ctx, p.x, p.y, run ? run.charId : 'allround', {
      face: p.face,
      bob: p.moving ? Math.sin(p.walkT * 14) * 0.06 : Math.sin(t * 3) * 0.02,
      lookX: p.mvx,
      lookY: p.mvy,
      stage,
      toppings: run ? run.filling : [],
      worried: p.hp < maxHp * 0.3,
      tint: p.id === 1 ? P2_TINT : null,
      t,
    });
    ctx.globalAlpha = 1;
    if (p.shield) {
      ctx.strokeStyle = 'rgba(143,227,255,0.8)';
      ctx.fillStyle = 'rgba(143,227,255,0.12)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 31, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    for (const wp of p.weapons) drawHeldWeapon(ctx, wp);
    if (coop) {
      ctx.font = '14px ' + FONT;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,14,10,0.9)';
      ctx.fillStyle = p.id === 1 ? P2_TINT : '#ffcd4d';
      const label = p.id === 1 ? '2P' : '1P';
      ctx.strokeText(label, p.x, p.y - 44);
      ctx.fillText(label, p.x, p.y - 44);
    }
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
    if (e.affixes.length) {
      // elit özelliklerinin renkli halesi
      e.affixes.forEach((af, i) => {
        ctx.strokeStyle = D.AFFIXES[af].color;
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r * 1.45 + i * 8 + Math.sin(t * 4 + i) * 3, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.state === 'wind' || e.state === 'tele') ctx.translate(U.rand(-2.5, 2.5), U.rand(-2.5, 2.5));
    const sq = def.ai === 'tree' || def.ai === 'egg' ? 0 : Math.sin(t * 9 + e.wob) * 0.05;
    let sc = grow;
    if (e.state === 'aim') sc *= 1.15;
    ctx.scale(sc * (1 + sq), sc * (1 - sq));
    const fill = e.state === 'wind' && Math.floor(t * 16) % 2 === 0 ? '#ff6a5a' : e.slowT > 0 ? '#bfe8ff' : def.color;
    Art.drawEnemyBody(ctx, e, lx, ly, t, fill);
    if (def.shield) {
      ctx.rotate(e.shieldAng);
      ctx.strokeStyle = '#3a4048';
      ctx.fillStyle = '#cfd6de';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r + 9, -1.1, 1.1);
      ctx.arc(0, 0, r + 3, 1.1, -1.1, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.rotate(-e.shieldAng);
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
        const ang = t * 6 + i * 2.1;
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * r * 0.6, -r * 0.4 + Math.sin(ang * 1.3) * r * 0.4 - ((t * 40 + i * 10) % 16), 3.5, 0, TAU);
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

  function drawBeams(ctx, e, t) {
    const len = 1500;
    for (const ang of e.beams) {
      const x2 = e.x + Math.cos(ang) * len;
      const y2 = e.y + Math.sin(ang) * len;
      ctx.lineCap = 'round';
      if (!e.beamOn) {
        ctx.globalAlpha = 0.4 + 0.4 * Math.abs(Math.sin(t * 14));
        ctx.strokeStyle = '#ff3b3b';
        ctx.lineWidth = 4;
        ctx.setLineDash([18, 12]);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = '#ff3b3b';
        ctx.lineWidth = 34;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.strokeStyle = '#fff1f1';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
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
    } else if (pk.kind === 'top') {
      const tp = D.TOPPING_BY_ID[pk.value];
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, TAU);
      ctx.fill();
      ctx.scale(0.75, 0.75);
      Art.drawTopping(ctx, pk.value, tp ? tp.color : '#ccc');
      ctx.restore();
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
    ctx.fillStyle = tu.temp > 0 ? '#8a7f5a' : '#6e6a74';
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
    if (tu.temp > 0) {
      ctx.strokeStyle = '#ffcd4d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 20, -Math.PI / 2, -Math.PI / 2 + (tu.temp / 12) * TAU);
      ctx.stroke();
    }
    ctx.rotate(tu.ang);
    ctx.translate(-tu.recoil * 4, 0);
    ctx.fillStyle = '#9a96a2';
    ctx.strokeStyle = '#26232b';
    ctx.fillRect(0, -4, 22, 8);
    ctx.strokeRect(0, -4, 22, 8);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawRocket(ctx, b, scale, body) {
    const a = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(-10, -4);
    ctx.lineTo(-20 - Math.random() * 6, 0);
    ctx.lineTo(-10, 4);
    ctx.fill();
    ctx.fillStyle = body;
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
  }

  function drawBolt(ctx, b, scale) {
    const a = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    ctx.scale(scale, scale);
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
  }

  function drawBullet(ctx, b) {
    switch (b.kind) {
      case 'rocket':
        drawRocket(ctx, b, 1, '#7d8f5a');
        return;
      case 'missile':
        drawRocket(ctx, b, 1.1, '#4f6b8a');
        return;
      case 'crossbow':
        drawBolt(ctx, b, 1);
        return;
      case 'ballista':
        drawBolt(ctx, b, 1.8);
        return;
      case 'wand':
      case 'flamer': {
        const big = b.kind === 'flamer';
        ctx.fillStyle = big ? 'rgba(255,110,30,0.35)' : 'rgba(255,140,40,0.35)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * (big ? 2.2 : 1.9), 0, TAU);
        ctx.fill();
        ctx.fillStyle = big ? '#ffb347' : '#ffcf6b';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
        return;
      }
      case 'spud':
        ctx.fillStyle = '#d29d5f';
        ctx.strokeStyle = '#5e3d1f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.r, b.r * 0.8, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        return;
      default:
        ctx.fillStyle = b.kind === 'turret' ? '#8fe3ff' : b.crit ? '#fff2a8' : '#ffd95a';
        ctx.strokeStyle = b.kind === 'turret' ? '#1d4a5c' : '#6b4a0c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
        ctx.stroke();
    }
  }

  function drawHeldWeapon(ctx, wp) {
    ctx.save();
    ctx.translate(wp.x, wp.y);
    ctx.rotate(wp.ang);
    if (Math.cos(wp.ang) < 0) ctx.scale(1, -1);
    ctx.translate(-wp.recoil * 6, 0);
    Art.drawWeaponShape(ctx, wp.def.id, wp.tier);
    ctx.restore();
  }

  /* ---------- Ekran efektleri ---------- */
  function drawScreenFx(ctx, w, G) {
    if (w.modId === 'fog') drawFog(ctx, w);
    const maxHp = G.Calc.maxHp(G.stats);
    const low = w.players.some((p) => !p.dead && p.hp / maxHp < 0.3);
    if (low) {
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

  // Sis: yalnızca oyuncuların çevresi görünür
  function drawFog(ctx, w) {
    const f = R.fog;
    const g = f.getContext('2d');
    const k = f.width / R.w;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, f.width, f.height);
    g.fillStyle = 'rgba(16,12,9,0.88)';
    g.fillRect(0, 0, f.width, f.height);
    g.globalCompositeOperation = 'destination-out';
    for (const p of w.players) {
      if (p.dead) continue;
      const sp = toScreen(p.x, p.y);
      const rad = 340 * R.cam.s * k;
      const grad = g.createRadialGradient(sp.x * k, sp.y * k, rad * 0.35, sp.x * k, sp.y * k, rad);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, f.width, f.height);
    }
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(f, 0, 0, R.w, R.h);
  }

  /* ---------- Arayüz ikonları (UI bunları kullanır) ---------- */
  R.weaponIcon = Art.weaponIcon;
  R.potatoIcon = Art.potatoIcon;
  R.statIcon = Art.statIcon;
  R.itemIcon = Art.itemIcon;
  R.toppingIcon = Art.toppingIcon;
  R.nodeIcon = Art.nodeIcon;
  R.drawPotato = Art.drawPotato;

  BR.Render = R;
})((window.BR = window.BR || {}));
