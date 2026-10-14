/* Kumpir Arena test botu (tarayıcı içinde çalışır).
   Testler ve denge simülasyonları bu dosyayı sayfaya enjekte eder: window.__bot */
(function () {
  'use strict';

  const D = BR.DATA;
  const G = BR.Game;

  // Düşmanlardan, mermilerden, tehlikelerden ve duvarlardan kaçan basit hareket seçimi
  function chooseMove(p) {
    const w = G.w;
    const W = D.ARENA_W;
    const H = D.ARENA_H;
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
        if (L === 45 && BR.Arena.blocked && BR.Arena.blocked(w, qx, qy, p.r)) sc += 60;
        for (const e of w.enemies) {
          if (e.dead || e.dmg <= 0) continue;
          const d = Math.max(8, Math.hypot(e.x - qx, e.y - qy) - e.r - p.r);
          if (d < 260) sc += ((e.def && e.def.big) || e.boss ? 4 : 1) * 900 / (d * d);
        }
        for (const b of w.ebullets) {
          const d = Math.max(6, Math.hypot(b.x + b.vx * (L / 330) - qx, b.y + b.vy * (L / 330) - qy) - b.r - p.r);
          if (d < 120) sc += 1500 / (d * d);
        }
        const a = w.arena;
        if (a) {
          for (const b of a.burners) {
            if (b.state === 'idle' && b.t > 0.6) continue;
            const rr = b.r + p.r + 12;
            if (Math.hypot(b.x - qx, b.y - qy) < rr) sc += 300;
          }
          for (const pin of a.pins) {
            // oklavanın kısa süre sonraki konumu
            const t = L / 330 + 0.15;
            const pp = pin.p + pin.dir * 300 * Math.max(0, t - Math.max(0, pin.warn));
            const along = pin.horiz ? qy : qx;
            const across = pin.horiz ? qx : qy;
            if (Math.abs(along - pin.pos) < 130 + p.r + 10) {
              const ahead = (across - pp) * pin.dir;
              if (ahead > -40 && ahead < 260) sc += 220;
            }
          }
        }
        for (const m of w.markers) {
          const rr = (m.r || 60) + p.r;
          if (Math.hypot(m.x - qx, m.y - qy) < rr) sc += 40;
        }
      }
      if (sc < bs) {
        bs = sc;
        best = [dx, dy];
      }
    }
    return { x: best[0], y: best[1] };
  }

  function nearestEnemyDist(p) {
    let d = Infinity;
    for (const e of G.w.enemies) {
      if (e.dead || e.dmg <= 0) continue;
      d = Math.min(d, Math.hypot(e.x - p.x, e.y - p.y) - e.r - p.r);
    }
    return d;
  }

  const bot = {
    stats: { dashes: 0, abilities: 0, events: 0, rests: 0, stands: 0, served: 0, evolves: 0, seeds: 0, fills: 0, nodes: {}, mods: {} },

    move() {
      const w = G.w;
      w.players.forEach((p) => {
        if (p.dead) return;
        BR.Input.overrides[p.id] = chooseMove(p);
        const near = nearestEnemyDist(p);
        if (near < 40 && p.dashCd <= 0) {
          BR.Input.press(p.id, 'dash');
          bot.stats.dashes++;
        }
        if (near < 220 && p.abilCd <= 0) {
          BR.Input.press(p.id, 'ability');
          bot.stats.abilities++;
        }
      });
    },

    // Dalga arası her şeyi çözer; sıradaki dalga başladığında true döner
    between(opts) {
      const o = opts || {};
      const run = G.run;
      let guard = 0;
      while (G.state !== 'wave' && G.state !== 'dead' && G.state !== 'victory' && guard++ < 60) {
        while (run.pendingLevels > 0) {
          G.getUpgradeOffer();
          G.chooseUpgrade(0);
        }
        while (run.crates.length) G.takeCrate(false);
        if (G.standAvailable()) bot.stand();
        if (G.state === 'between' || G.state === 'shop') {
          G.enterShop();
          bot.shop(o);
          G.openMap();
        }
        if (G.state === 'map') {
          const opts2 = G.mapOptions();
          let pick = opts2[0];
          if (o.prefer) pick = opts2.find((n) => n.type === o.prefer) || pick;
          if (o.randomNodes) pick = opts2[Math.floor(Math.random() * opts2.length)];
          bot.stats.nodes[pick.type] = (bot.stats.nodes[pick.type] || 0) + 1;
          if (pick.mod) bot.stats.mods[pick.mod] = (bot.stats.mods[pick.mod] || 0) + 1;
          G.chooseNode(pick.id);
        }
        if (G.state === 'event') {
          const ch = G.eventChoices();
          let i = ch.findIndex((c) => c.enabled);
          if (o.randomNodes) {
            const en = ch.map((c, k) => (c.enabled ? k : -1)).filter((k) => k >= 0);
            i = en[Math.floor(Math.random() * en.length)];
          }
          G.chooseEvent(i);
          bot.stats.events++;
          G.startNextWave();
        }
        if (G.state === 'rest') {
          const ch = G.restChoices();
          G.chooseRest(o.randomNodes ? Math.floor(Math.random() * 4) === 1 && ch[1].enabled ? 1 : 0 : 0);
          bot.stats.rests++;
        }
      }
      return G.state === 'wave';
    },

    stand() {
      G.standStart();
      bot.stats.stands++;
      let cust;
      let guard = 0;
      while ((cust = G.standCurrent()) && guard++ < 20) {
        const need = {};
        cust.order.forEach((id) => {
          need[id] = (need[id] || 0) + 1;
        });
        const ok = Object.keys(need).every((id) => (G.run.pantry[id] || 0) >= need[id]);
        if (!ok) {
          G.standSkip();
          continue;
        }
        cust.order.forEach((id) => G.standAdd(id));
        const r = G.standServe();
        if (r.ok) bot.stats.served++;
        else G.standSkip();
      }
      G.standClose();
    },

    shop(o) {
      const run = G.run;
      // kumpir yuvalarını doldur
      while (run.filling.length < D.FILLING_SLOTS && G.pantryTotal() > 0) {
        const id = Object.keys(run.pantry).find((k) => run.pantry[k] > 0);
        if (!G.fillSlot(id)) break;
        bot.stats.fills++;
      }
      // hazır evrim varsa yap
      G.evoStatus().forEach((st) => {
        if (st.ready && G.evolve(st.id)) bot.stats.evolves++;
      });
      if (o.seeds && run.seeds.length < D.MAX_SEEDS && G.plantCheck(D.SEEDS[0].id).ok && run.materials > 80) {
        if (G.plantSeed(D.SEEDS[0].id).ok) bot.stats.seeds++;
      }
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

    // Bütün bir koşuyu manuel adımlarla oynar
    async play(cfg) {
      const c = Object.assign({ charId: 'allround', weaponId: 'pistol', danger: 0, god: false, maxWaves: 99, steps: 400000 }, cfg);
      BR.Main.manual = true;
      bot.stats = { dashes: 0, abilities: 0, events: 0, rests: 0, stands: 0, served: 0, evolves: 0, seeds: 0, fills: 0, nodes: {}, mods: {} };
      G.newRun({ charId: c.charId, weaponId: c.weaponId, danger: c.danger, coop: !!c.coop, easy: !!c.easy, daily: c.daily || null, seed: c.seed });
      BR.Input.setCoop(!!c.coop);
      let steps = 0;
      const seen = { boss: null, elites: 0, arenas: {}, enemies: {}, affixes: {}, maxEnemies: 0, minHp: Infinity };
      while (steps < c.steps) {
        if (G.state === 'wave') {
          const w = G.w;
          if (c.god) w.players.forEach((p) => (p.invuln = 5));
          if (steps % 3 === 0) bot.move();
          G.update(1 / 60);
          steps++;
          if (!G.w) continue;
          seen.arenas[w.arena.id] = true;
          if (w.bossType) seen.boss = w.bossType;
          if (w.elite) seen.eliteWave = true;
          if (steps % 30 === 0) {
            let alive = 0;
            for (const e of w.enemies) {
              if (e.dead) continue;
              alive++;
              seen.enemies[e.type] = true;
              if (e.affixes) e.affixes.forEach((a) => (seen.affixes[a] = true));
            }
            seen.maxEnemies = Math.max(seen.maxEnemies, alive);
            w.players.forEach((p) => {
              if (!p.dead) seen.minHp = Math.min(seen.minHp, p.hp);
            });
          }
          if (steps % 2000 === 0) await new Promise((r) => setTimeout(r, 0));
        } else if (G.state === 'dead' || G.state === 'victory') {
          break;
        } else {
          if (G.run.wave >= c.maxWaves) break;
          bot.between(c);
        }
      }
      BR.Main.manual = false;
      BR.Input.overrides = [null, null];
      const run = G.run;
      let death = null;
      if (G.state === 'dead' && G.w) {
        const w = G.w;
        const types = {};
        w.enemies.forEach((e) => {
          if (!e.dead) types[e.type] = (types[e.type] || 0) + 1;
        });
        death = {
          wave: w.n, t: Math.round(w.t), node: w.node.type, mod: w.modId, elite: w.elite, arena: w.arena.id,
          maxHp: G.Calc.maxHp(G.stats), armor: G.stats.armor, dodge: G.stats.dodge, enemies: types,
        };
      }
      return {
        state: G.state, wave: run.wave, level: run.level, kills: run.kills, mats: run.materials,
        weapons: run.weapons.map((wp) => wp.id + wp.tier), items: Object.keys(run.items).length,
        filling: run.filling.slice(), recipes: G.activeRecipes(run), evolved: run.evolved || 0,
        stats: bot.stats, seen, steps, errors: BR.Main.errors, death,
      };
    },
  };

  window.__bot = bot;
})();
