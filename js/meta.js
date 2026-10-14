/* Kumpir Arena - kalıcı profil: başarımlar, kilit açma, istatistikler, günlük meydan okuma */
(function (BR) {
  'use strict';

  const U = BR.U;
  const D = BR.DATA;
  const KEY = 'kumpirArena.profile.v1';

  const M = { profile: null };

  function blank() {
    return { v: 1, ach: {}, stats: { runs: 0, wins: 0, kills: 0, bestWave: 0, bestEndless: 0 }, daily: {} };
  }

  function valid(p) {
    return !!p && typeof p === 'object' && p.v === 1 && p.ach && typeof p.ach === 'object' && p.stats && typeof p.stats === 'object' && p.daily && typeof p.daily === 'object';
  }

  M.load = function () {
    const p = U.store.get(KEY, null);
    M.profile = valid(p) ? p : blank();
    const st = M.profile.stats;
    ['runs', 'wins', 'kills', 'bestWave', 'bestEndless'].forEach((k) => {
      if (typeof st[k] !== 'number' || !isFinite(st[k])) st[k] = 0;
    });
  };

  M.save = function () {
    U.store.set(KEY, M.profile);
  };

  M.has = function (id) {
    return !!(M.profile && M.profile.ach[id]);
  };

  M.unlock = function (id) {
    if (!M.profile) M.load();
    const def = D.ACH_BY_ID[id];
    if (!def || M.has(id)) return false;
    M.profile.ach[id] = Date.now();
    M.save();
    if (BR.Game) BR.Game.emit('achievement', def);
    return true;
  };

  M.count = function () {
    return D.ACHIEVEMENTS.filter((a) => M.has(a.id)).length;
  };

  M.charUnlocked = function (ch) {
    return !ch.unlock || M.has(ch.unlock);
  };

  M.unlockText = function (ch) {
    const a = D.ACH_BY_ID[ch.unlock];
    return a ? a.desc : '';
  };

  /* ---------- Günlük meydan okuma ---------- */
  // Herkes aynı gün aynı karakter, silah, harita ve dükkan tohumuyla oynar
  M.dailyConfig = function (date) {
    const seed = U.hashStr('kumpir-arena-' + date);
    let st = seed;
    const R = U.withRng(() => {
      const r = U.rngStep(st);
      st = r.state;
      return r.value;
    });
    const chars = D.CHARACTERS.filter((c) => !c.unlock);
    const ch = R.pick(chars);
    const weaponId = ch.starters.length ? R.pick(ch.starters) : null;
    return { date, seed, charId: ch.id, weaponId, danger: 1 };
  };

  M.completedWaves = function (run, win) {
    return win ? run.wave : Math.max(0, run.wave - 1);
  };

  M.score = function (run, win) {
    return M.completedWaves(run, win) * 1000 + (win ? 5000 : 0) + run.kills + run.level * 20;
  };

  M.dailyBest = function (date) {
    return (M.profile && M.profile.daily[date]) || 0;
  };

  M.dailyPlayed = function (date) {
    return !!M.profile && Object.prototype.hasOwnProperty.call(M.profile.daily, date);
  };

  M.recordEnd = function (run, win) {
    if (!M.profile) M.load();
    const st = M.profile.stats;
    const completed = M.completedWaves(run, win);
    // zaferden sonra sonsuz moda devam eden koşu ikinci kez sayılmasın
    if (!run.recorded) st.runs++;
    if (win && !run.recorded) st.wins++;
    st.kills += Math.max(0, run.kills - (run.killsRecorded || 0));
    run.recorded = true;
    run.killsRecorded = run.kills;
    if (run.endless) st.bestEndless = Math.max(st.bestEndless, run.wave);
    else st.bestWave = Math.max(st.bestWave, completed);
    let daily = null;
    if (run.daily) {
      const score = M.score(run, win);
      const first = !M.dailyPlayed(run.daily);
      const prev = M.dailyBest(run.daily);
      if (first || score > prev) M.profile.daily[run.daily] = score;
      daily = { date: run.daily, score, best: Math.max(score, prev), isBest: first || score > prev };
    }
    M.save();
    return { completed, daily, win: !!win };
  };

  M.shareText = function (run, res) {
    const ch = D.CHAR_BY_ID[run.charId];
    let t = 'Kumpir Arena';
    if (res.daily) t += ' · Günlük ' + res.daily.date + ' · ' + res.daily.score + ' puan';
    t += ' · ' + ch.name + (run.coop ? ' (iki kişi)' : '') + ' · ' + (res.win ? 'Zafer! · ' : '') + res.completed + ' dalga · ' + run.kills + ' düşman';
    if (run.easy) t += ' (kolay mod)';
    return t;
  };

  BR.Meta = M;
})((window.BR = window.BR || {}));
