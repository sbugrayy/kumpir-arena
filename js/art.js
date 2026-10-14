/* Kumpir Arena - şekiller: patates, düşmanlar, silahlar, semboller ve arayüz ikonları */
(function (BR) {
  'use strict';

  const U = BR.U;
  const D = BR.DATA;
  const TAU = U.TAU;

  const Art = {};

  /* ================= Patates ================= */
  // Pişme evresi: seviyeye göre 0 çiğ, 1 haşlanmış, 2 fırın, 3 kumpir
  Art.stageFor = function (level) {
    return level >= 15 ? 3 : level >= 10 ? 2 : level >= 5 ? 1 : 0;
  };
  Art.STAGE_NAMES = ['Çiğ', 'Haşlanmış', 'Fırınlanmış', 'Kumpir'];

  const SKIN = ['#c99158', '#e6c27d', '#cf8f45', '#cf8f45'];

  // o: { face, bob, lookX, lookY, stage, toppings, worried, tint, t }
  Art.drawPotato = function (ctx, x, y, charId, o) {
    o = o || {};
    const face = o.face || 1;
    const bob = o.bob || 0;
    const stage = o.stage || 0;
    const t = o.t || 0;
    let skin = SKIN[stage];
    let spot = stage === 1 ? '#c9a160' : '#a87842';
    if (charId === 'boiled') {
      skin = '#efd9a6';
      spot = '#d8bd85';
    } else if (charId === 'rotten') {
      skin = '#a59a58';
      spot = '#5f6b2c';
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face * (1 - bob * 0.5), 1 + bob);
    // buhar (haşlanmış evre ve Haşlanmış karakter)
    if (stage === 1 || charId === 'boiled') {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 2; i++) {
        const ph = (t * 1.5 + i * 0.5) % 1;
        ctx.globalAlpha = (1 - ph) * 0.8;
        ctx.beginPath();
        const bx = -6 + i * 12;
        ctx.moveTo(bx, -26 - ph * 14);
        ctx.quadraticCurveTo(bx + 5, -32 - ph * 14, bx, -38 - ph * 14);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // gövde
    ctx.fillStyle = skin;
    ctx.strokeStyle = '#5e3d1f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 19, 24, 0.08, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.ellipse(-9, 9, 3, 2, 0.4, 0, TAU);
    ctx.ellipse(6, 14, 2.4, 1.6, 0, 0, TAU);
    ctx.ellipse(-4, -15, 2, 1.4, 0, 0, TAU);
    ctx.fill();
    // fırın ve kumpir evresi: alt yarı alüminyum folyo
    if (stage >= 2) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, 19, 24, 0.08, 0, TAU);
      ctx.clip();
      ctx.fillStyle = '#c9ced6';
      ctx.fillRect(-22, 8, 44, 20);
      ctx.strokeStyle = '#9aa0aa';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = -20; i < 22; i += 6) {
        ctx.moveTo(i, 8);
        ctx.lineTo(i + 3, 12);
        ctx.lineTo(i + 6, 8);
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#5e3d1f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 19, 24, 0.08, 0, TAU);
      ctx.stroke();
    }
    // kumpir evresi: açılmış tepe ve içi
    const tops = o.toppings || [];
    if (stage === 3) {
      ctx.fillStyle = '#ffe9a0';
      ctx.strokeStyle = '#8a6a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -17, 14, 7, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      tops.forEach((id, i) => {
        const tp = D.TOPPING_BY_ID[id];
        if (!tp) return;
        ctx.fillStyle = tp.color;
        ctx.beginPath();
        ctx.arc(-8 + i * 5.3, -18 + (i % 2) * 3, 3.2, 0, TAU);
        ctx.fill();
      });
    } else if (tops.length) {
      tops.forEach((id, i) => {
        const tp = D.TOPPING_BY_ID[id];
        if (!tp) return;
        ctx.fillStyle = tp.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(-9 + i * 6, -20 + (i % 2) * 2, 2.6, 0, TAU);
        ctx.fill();
        ctx.stroke();
      });
    }
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
    ctx.strokeStyle = '#4a2c14';
    ctx.lineWidth = 2;
    if (o.worried) {
      // telaşlı kaşlar, titrek ağız ve ter damlası
      ctx.beginPath();
      ctx.moveTo(-5, -12);
      ctx.lineTo(2, -14);
      ctx.moveTo(4, -14);
      ctx.lineTo(11, -12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-1, 8);
      ctx.quadraticCurveTo(2, 5, 5, 8);
      ctx.quadraticCurveTo(8, 11, 10, 8);
      ctx.stroke();
      ctx.fillStyle = '#9fd7ff';
      ctx.strokeStyle = '#2d6a8f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(15, -13);
      ctx.quadraticCurveTo(19, -6, 15, -4);
      ctx.quadraticCurveTo(11, -6, 15, -13);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(4, 5, 4, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    if (stage < 3) drawAccessory(ctx, charId, t);
    if (o.tint) {
      // ikinci oyuncu: mavi atkı
      ctx.fillStyle = o.tint;
      ctx.strokeStyle = '#1f1712';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 5, 18, 4, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  };

  function drawAccessory(ctx, id, t) {
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
    } else if (id === 'boiled') {
      // başında havlu
      ctx.fillStyle = '#f2f2ea';
      ctx.beginPath();
      ctx.ellipse(0, -19, 16, 7, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#7fb3d6';
      ctx.beginPath();
      ctx.moveTo(-12, -21);
      ctx.lineTo(12, -21);
      ctx.stroke();
    } else if (id === 'butcher') {
      // kasap: beyaz bone ve kırmızı bant
      ctx.fillStyle = '#f2f2ea';
      ctx.beginPath();
      ctx.ellipse(0, -21, 15, 9, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c0263a';
      ctx.fillRect(-15, -22, 30, 4);
    } else if (id === 'rotten') {
      // vızıldayan sinek
      const fx = 18 + Math.cos(t * 7) * 6;
      const fy = -26 + Math.sin(t * 9) * 4;
      ctx.fillStyle = '#1f1712';
      ctx.beginPath();
      ctx.arc(fx, fy, 2.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(fx - 2, fy - 3, 2, 1.2, -0.5, 0, TAU);
      ctx.ellipse(fx + 2, fy - 3, 2, 1.2, 0.5, 0, TAU);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#3c7a2a';
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

  // Ölen patates: yere yayılan püre (k: 0..1 ezilme ilerlemesi)
  Art.drawPuree = function (ctx, x, y, k) {
    const s = Math.min(1, k * 2.5);
    ctx.save();
    ctx.translate(x, y + 12 * s);
    ctx.fillStyle = '#f3dc93';
    ctx.strokeStyle = '#8a6a2a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 19 + 14 * s, 24 - 15 * s, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffe9a0';
    ctx.beginPath();
    ctx.ellipse(-6, -2, 6 + 4 * s, 3, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#4a2c14';
    ctx.lineWidth = 2;
    for (const ex of [-6, 6]) {
      ctx.beginPath();
      ctx.moveTo(ex - 3, -5 * (1 - s) - 2);
      ctx.lineTo(ex + 3, -5 * (1 - s) + 2);
      ctx.moveTo(ex + 3, -5 * (1 - s) - 2);
      ctx.lineTo(ex - 3, -5 * (1 - s) + 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* ================= Düşmanlar ================= */
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

  // Düşman gövdesi; orijin düşmanın merkezi. lx, ly: bakış yönü
  Art.drawEnemyBody = function (ctx, e, lx, ly, t, fill) {
    const def = e.def;
    const r = e.r;
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
      case 'thief':
        blob(ctx, r, fill, def.dark);
        // hırsız maskesi
        ctx.fillStyle = '#1f1712';
        ctx.fillRect(-r, -7, r * 2, 8);
        eyes(ctx, [[-5, -3], [5, -3]], 3.5, lx, ly);
        if (e.stolen > 0) {
          ctx.fillStyle = '#8fd14f';
          ctx.strokeStyle = '#2c5e17';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(r * 0.9, r * 0.5, 6 + Math.min(4, e.stolen), 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
        break;
      case 'slime':
      case 'slimelet': {
        const wob = Math.sin(t * 6 + e.wob) * 0.08;
        ctx.globalAlpha = 0.85;
        blob(ctx, r, fill, def.dark, 1 + wob, 0.85 - wob);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.35, -r * 0.35, r * 0.25, r * 0.15, -0.6, 0, TAU);
        ctx.fill();
        eyes(ctx, [[-r * 0.25, -2], [r * 0.25, -2]], r * 0.2, lx, ly);
        break;
      }
      case 'healer':
        blob(ctx, r, fill, def.dark, 1, 1.05);
        ctx.fillStyle = '#4fae4a';
        ctx.fillRect(-3, -14, 6, 14);
        ctx.fillRect(-7, -10, 14, 6);
        eyes(ctx, [[-6, 4], [6, 4]], 3.5, lx, ly);
        break;
      case 'shielder': {
        blob(ctx, r, fill, def.dark);
        eyes(ctx, [[-6, -3], [6, -3]], 4, lx, ly);
        break;
      }
      case 'egg': {
        const shake = e.hatch < 1.2 ? Math.sin(t * 40) * 2 : 0;
        ctx.translate(shake, 0);
        blob(ctx, r, fill, def.dark, 0.85, 1.1);
        ctx.fillStyle = '#b79bd1';
        ctx.beginPath();
        ctx.arc(-4, -5, 3, 0, TAU);
        ctx.arc(5, 4, 2.5, 0, TAU);
        ctx.arc(-3, 8, 2, 0, TAU);
        ctx.fill();
        if (e.hatch < 1.6) {
          ctx.strokeStyle = def.dark;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-8, -2);
          ctx.lineTo(-3, 2);
          ctx.lineTo(2, -3);
          ctx.lineTo(7, 1);
          ctx.stroke();
        }
        break;
      }
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
        crown(ctx, r);
        eyes(ctx, [[-24, -10], [0, -18], [24, -10]], 11, lx, ly, '#fff4c2');
        ctx.fillStyle = def.dark;
        ctx.beginPath();
        ctx.arc(0, 22, e.state === 'spiral' ? 18 : 12, 0, Math.PI);
        ctx.fill();
        break;
      }
      case 'kroz': {
        // tek dev göz, etrafında dönen halkalar
        ctx.strokeStyle = def.dark;
        ctx.lineWidth = 4;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(0, 0, r * 1.15, r * 0.35, t * 0.8 + (i * Math.PI) / 3, 0, TAU);
          ctx.stroke();
        }
        blob(ctx, r, fill, def.dark);
        ctx.fillStyle = '#f4f8ff';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.6, 0, TAU);
        ctx.fill();
        ctx.fillStyle = e.state === 'tele' || e.state === 'beam' ? '#ff3b3b' : '#163b4d';
        ctx.beginPath();
        ctx.arc(lx * r * 0.22, ly * r * 0.22, r * 0.28, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(lx * r * 0.25, ly * r * 0.25, r * 0.12, 0, TAU);
        ctx.fill();
        break;
      }
      case 'mother': {
        blob(ctx, r, fill, def.dark, 1.1, 0.95);
        // sırtında yumurta kesesi
        ctx.fillStyle = '#e8e0f0';
        ctx.strokeStyle = def.dark;
        ctx.lineWidth = 3;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.ellipse(-30 + i * 15, -r * 0.55 + Math.sin(t * 3 + i) * 2, 9, 12, 0, 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
        eyes(ctx, [[-20, 6], [0, 2], [20, 6]], 9, lx, ly, '#fff4c2');
        ctx.fillStyle = def.dark;
        ctx.beginPath();
        ctx.ellipse(0, 30, 22, e.state === 'dash' ? 12 : 7, 0, 0, TAU);
        ctx.fill();
        break;
      }
      default:
        blob(ctx, r, fill, def.dark);
        eyes(ctx, [[-6, -3], [6, -3]], 5, lx, ly);
    }
  };

  function crown(ctx, r) {
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
  }

  /* ================= Silahlar ================= */
  // Silah orijinde, +x yönüne bakacak şekilde çizilir (yaklaşık -14..+38 genişlik)
  Art.drawWeaponShape = function (ctx, id, tier) {
    const def = D.WEAPON_BY_ID[id];
    const evo = def && def.evo;
    const out = evo ? D.EVO_COLOR : tier > 1 ? D.TIERS[tier].color : '#1f1712';
    ctx.lineWidth = evo || tier > 1 ? 3 : 2.5;
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
      case 'flamer':
        shape('#c0392b', () => ctx.ellipse(-6, 0, 9, 11, 0, 0, TAU));
        shape('#5b5764', () => ctx.rect(0, -4, 30, 8));
        shape('#ff8a3c', () => {
          ctx.moveTo(30, -6);
          ctx.lineTo(42, 0);
          ctx.lineTo(30, 6);
          ctx.closePath();
        });
        break;
      case 'gatling':
        shape('#5b5764', () => ctx.rect(-12, -8, 18, 16));
        for (const dy of [-5, 0, 5]) shape('#8d8f99', () => ctx.rect(4, dy - 2, 32, 4));
        shape('#57401f', () => ctx.rect(-12, 6, 8, 9));
        break;
      case 'quakeglove':
        shape('#c9a23a', () => ctx.arc(6, 0, 13, 0, TAU));
        shape('#8d8f99', () => ctx.rect(-8, -6, 8, 12));
        ctx.strokeStyle = '#ffcd4d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(14, -12);
        ctx.lineTo(20, -18);
        ctx.moveTo(18, 0);
        ctx.lineTo(26, 0);
        ctx.moveTo(14, 12);
        ctx.lineTo(20, 18);
        ctx.stroke();
        break;
      case 'ballista':
        shape('#6b4a2b', () => ctx.rect(-16, -4, 46, 8));
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.arc(14, 0, 20, -1.3, 1.3);
        ctx.stroke();
        shape('#d9dde3', () => {
          ctx.moveTo(30, -6);
          ctx.lineTo(42, 0);
          ctx.lineTo(30, 6);
          ctx.closePath();
        });
        break;
      case 'missile':
        shape('#4f6b8a', () => ctx.rect(-14, -9, 36, 18));
        shape('#d9473f', () => ctx.arc(22, -4, 4, 0, TAU));
        shape('#d9473f', () => ctx.arc(22, 5, 4, 0, TAU));
        shape('#9aa0aa', () => ctx.rect(-8, 8, 6, 8));
        break;
      case 'vampsword':
        shape('#3a1520', () => ctx.rect(-12, -3, 10, 6));
        shape('#c0263a', () => ctx.rect(-3, -10, 5, 20));
        shape('#e8c9cf', () => {
          ctx.moveTo(2, -5);
          ctx.lineTo(34, -2);
          ctx.lineTo(42, 0);
          ctx.lineTo(34, 2);
          ctx.lineTo(2, 5);
          ctx.closePath();
        });
        ctx.strokeStyle = '#c0263a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(32, 0);
        ctx.stroke();
        break;
      default:
        shape('#ccc', () => ctx.arc(0, 0, 8, 0, TAU));
    }
  };

  /* ================= Semboller ================= */
  // 32x32'lik bir kutuya, merkez (0,0) olacak şekilde sembol
  Art.drawGlyph = function (ctx, key) {
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
      case 'fruit':
        ctx.beginPath();
        ctx.arc(0, 2, 10, 0, TAU);
        fs('#e8473f');
        ctx.beginPath();
        ctx.ellipse(5, -9, 6, 3, -0.5, 0, TAU);
        fs('#5fbf4a');
        break;
      case 'coin':
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, TAU);
        fs('#ffcd4d');
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, TAU);
        ctx.stroke();
        break;
      case 'bomb':
        ctx.beginPath();
        ctx.arc(-1, 3, 10, 0, TAU);
        fs('#3d3a42');
        ctx.beginPath();
        ctx.moveTo(5, -5);
        ctx.quadraticCurveTo(10, -12, 13, -9);
        ctx.stroke();
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.arc(13, -10, 3, 0, TAU);
        ctx.fill();
        break;
      case 'rage':
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, TAU);
        fs('#e5484d');
        ctx.beginPath();
        ctx.moveTo(-8, -6);
        ctx.lineTo(-2, -3);
        ctx.moveTo(8, -6);
        ctx.lineTo(2, -3);
        ctx.moveTo(-6, 6);
        ctx.lineTo(6, 6);
        ctx.stroke();
        break;
      case 'freeze':
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#8fe3ff';
        for (let i = 0; i < 3; i++) {
          ctx.save();
          ctx.rotate((i * Math.PI) / 3);
          ctx.beginPath();
          ctx.moveTo(0, -13);
          ctx.lineTo(0, 13);
          ctx.moveTo(-4, -9);
          ctx.lineTo(0, -5);
          ctx.lineTo(4, -9);
          ctx.moveTo(-4, 9);
          ctx.lineTo(0, 5);
          ctx.lineTo(4, 9);
          ctx.stroke();
          ctx.restore();
        }
        break;
      case 'shield':
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, TAU);
        ctx.fillStyle = 'rgba(143,227,255,0.5)';
        ctx.fill();
        ctx.strokeStyle = '#8fe3ff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(-4, -4, 3, 0, TAU);
        ctx.fill();
        break;
      default:
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, TAU);
        fs('#d8cfbd');
    }
    ctx.lineCap = 'butt';
  };

  const FX_GLYPH = {
    fruitPower: 'fruit', interest: 'coin', doubleMat: 'pickupRange', killBlast: 'bomb', rage: 'rage',
    killHeal: 'lifeSteal', thorns: 'armor', freeze: 'freeze', seedGrow: 'harvesting', dodgeInvis: 'dodge',
    chain: 'attackSpeed', shield: 'shield',
  };

  /* ================= Arayüz ikonları ================= */
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
  Art.roundRect = roundRect;

  Art.weaponIcon = function (canvas, id, tier, size) {
    size = size || 48;
    const ctx = prepIcon(canvas, size);
    ctx.translate(size / 2 - size * 0.08, size / 2 + size * 0.05);
    ctx.rotate(-Math.PI / 4);
    const k = size / 54;
    ctx.scale(k, k);
    ctx.translate(-10, 0);
    Art.drawWeaponShape(ctx, id, tier);
  };

  Art.potatoIcon = function (canvas, charId, size, o) {
    size = size || 72;
    const ctx = prepIcon(canvas, size);
    const k = size / 80;
    ctx.translate(size / 2, size / 2 + 8 * k);
    ctx.scale(k * 1.25, k * 1.25);
    Art.drawPotato(ctx, 0, 0, charId, Object.assign({ face: 1 }, o || {}));
  };

  Art.statIcon = function (canvas, key, size) {
    size = size || 32;
    const ctx = prepIcon(canvas, size);
    ctx.translate(size / 2, size / 2);
    const k = size / 32;
    ctx.scale(k, k);
    Art.drawGlyph(ctx, key);
  };

  Art.itemIcon = function (canvas, item, size) {
    size = size || 44;
    const ctx = prepIcon(canvas, size);
    const col = D.TIERS[item.tier].color;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    roundRect(ctx, 1.5, 1.5, size - 3, size - 3, size * 0.22);
    ctx.fill();
    ctx.stroke();
    if (item.fx) {
      // kural değiştiren eşyalara köşe işareti
      ctx.fillStyle = '#ffcd4d';
      ctx.beginPath();
      ctx.moveTo(size - 2, 2);
      ctx.lineTo(size - 2, size * 0.32);
      ctx.lineTo(size - size * 0.3, 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.translate(size / 2, size / 2);
    const k = size / 36;
    ctx.scale(k, k);
    let key = item.fx ? FX_GLYPH[item.fx] : item.turret ? 'turret' : null;
    if (!key) {
      for (const s in item.stats) {
        if (item.stats[s] > 0) {
          key = s;
          break;
        }
      }
    }
    Art.drawGlyph(ctx, key || Object.keys(item.stats)[0]);
  };

  Art.toppingIcon = function (canvas, id, size) {
    size = size || 34;
    const ctx = prepIcon(canvas, size);
    const tp = D.TOPPING_BY_ID[id];
    ctx.translate(size / 2, size / 2);
    const k = size / 34;
    ctx.scale(k, k);
    Art.drawTopping(ctx, id, tp ? tp.color : '#ccc');
  };

  // Malzemeye özgü küçük çizim
  Art.drawTopping = function (ctx, id, col) {
    ctx.strokeStyle = '#1f1712';
    ctx.lineWidth = 2;
    ctx.fillStyle = col;
    ctx.beginPath();
    if (id === 'sosis') {
      ctx.ellipse(0, 0, 13, 6, -0.4, 0, TAU);
    } else if (id === 'misir') {
      for (const [dx, dy] of [[-6, -4], [0, -6], [6, -4], [-4, 3], [3, 3], [0, 9]]) {
        ctx.moveTo(dx + 4, dy);
        ctx.arc(dx, dy, 4, 0, TAU);
      }
    } else if (id === 'zeytin') {
      ctx.ellipse(-5, 0, 6, 8, 0, 0, TAU);
      ctx.moveTo(13, 0);
      ctx.ellipse(7, 0, 6, 8, 0, 0, TAU);
    } else if (id === 'tursu') {
      ctx.ellipse(0, 0, 6, 13, 0.4, 0, TAU);
    } else if (id === 'acisos') {
      ctx.moveTo(-5, -10);
      ctx.lineTo(5, -10);
      ctx.lineTo(7, 12);
      ctx.lineTo(-7, 12);
      ctx.closePath();
    } else if (id === 'kasar') {
      ctx.moveTo(-12, 8);
      ctx.lineTo(12, 8);
      ctx.lineTo(12, -2);
      ctx.lineTo(-12, -9);
      ctx.closePath();
    } else if (id === 'tereyagi') {
      ctx.rect(-11, -6, 22, 12);
    } else {
      ctx.ellipse(0, 2, 12, 9, 0, 0, TAU);
    }
    ctx.fill();
    ctx.stroke();
    if (id === 'kasar') {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.arc(-4, 2, 2, 0, TAU);
      ctx.arc(5, 3, 1.6, 0, TAU);
      ctx.fill();
    } else if (id === 'rus') {
      ctx.fillStyle = '#e8473f';
      ctx.fillRect(-5, -2, 3, 3);
      ctx.fillStyle = '#6cbf4a';
      ctx.fillRect(2, 2, 3, 3);
      ctx.fillStyle = '#f7c948';
      ctx.fillRect(-1, 4, 3, 3);
    }
  };

  // Harita düğümleri
  Art.nodeIcon = function (canvas, type, size) {
    size = size || 40;
    const ctx = prepIcon(canvas, size);
    ctx.translate(size / 2, size / 2);
    const k = size / 40;
    ctx.scale(k, k);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1f1712';
    ctx.lineWidth = 2.5;
    if (type === 'normal') {
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.rotate((s * Math.PI) / 4);
        ctx.fillStyle = '#dfe3ea';
        ctx.beginPath();
        ctx.rect(-2.5, -15, 5, 22);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#c9a23a';
        ctx.beginPath();
        ctx.rect(-7, 6, 14, 4);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    } else if (type === 'elite' || type === 'boss') {
      ctx.fillStyle = type === 'boss' ? '#9b4fd1' : '#d0504d';
      ctx.beginPath();
      ctx.arc(0, 2, 13, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath();
      ctx.arc(-5, 0, 3.5, 0, TAU);
      ctx.arc(5, 0, 3.5, 0, TAU);
      ctx.fill();
      if (type === 'boss') {
        ctx.fillStyle = '#ffcd4d';
        ctx.beginPath();
        ctx.moveTo(-10, -9);
        ctx.lineTo(-12, -18);
        ctx.lineTo(-4, -12);
        ctx.lineTo(0, -19);
        ctx.lineTo(4, -12);
        ctx.lineTo(12, -18);
        ctx.lineTo(10, -9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (type === 'event') {
      ctx.fillStyle = '#5aa9ff';
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f6e9d2';
      ctx.font = 'bold 20px "Paytone One", "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, 1);
    } else if (type === 'rest') {
      ctx.fillStyle = '#6b4a2b';
      ctx.beginPath();
      ctx.rect(-12, 8, 24, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff8a3c';
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.bezierCurveTo(10, -4, 9, 6, 0, 8);
      ctx.bezierCurveTo(-9, 6, -10, -4, 0, -14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(0, 2, 4, 0, TAU);
      ctx.fill();
    }
  };

  BR.Art = Art;
})((window.BR = window.BR || {}));
