/* Kumpir Arena - başlatma ve ana döngü */
(function (BR) {
  'use strict';

  const U = BR.U;
  const G = BR.Game;
  const STEP = 1 / 60;
  const SETTINGS_KEY = 'kumpirArena.settings.v1';

  const M = { manual: false, booted: false, last: 0, acc: 0, errors: 0 };

  BR.settings = { volume: 0.5, shake: true, dmgNumbers: true };

  function loadSettings() {
    const s = U.store.get(SETTINGS_KEY, null);
    if (s && typeof s === 'object') {
      if (typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1) BR.settings.volume = s.volume;
      if (typeof s.shake === 'boolean') BR.settings.shake = s.shake;
      if (typeof s.dmgNumbers === 'boolean') BR.settings.dmgNumbers = s.dmgNumbers;
    }
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches && !s) BR.settings.shake = false;
    } catch (e) {
      /* yok say */
    }
  }

  BR.saveSettings = function () {
    U.store.set(SETTINGS_KEY, BR.settings);
  };

  function loop(ts) {
    requestAnimationFrame(loop);
    if (!M.last) M.last = ts;
    let dt = (ts - M.last) / 1000;
    M.last = ts;
    if (!(dt >= 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    if (!M.manual && G.state === 'wave' && !G.paused) {
      M.acc += dt;
      let n = 0;
      try {
        while (M.acc >= STEP && n < 6) {
          G.update(STEP);
          M.acc -= STEP;
          n++;
        }
      } catch (e) {
        M.errors++;
        console.error(e);
      }
      if (n >= 6) M.acc = 0;
    } else {
      M.acc = 0;
    }
    try {
      BR.Render.draw(G, dt);
      BR.UI.frame();
    } catch (e) {
      M.errors++;
      console.error(e);
    }
  }

  function autoPause() {
    if (G.state === 'wave' && !G.paused && !M.manual) BR.UI.pause();
  }

  function boot(data) {
    if (M.booted) return;
    M.booted = true;
    loadSettings();
    BR.Audio.setVolume(BR.settings.volume);
    const canvas = document.getElementById('game');
    BR.Render.init(canvas);
    BR.Input.init(canvas);
    BR.UI.init(data || {});
    window.addEventListener('resize', () => BR.Render.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) autoPause();
    });
    window.addEventListener('blur', autoPause);
    requestAnimationFrame(loop);
  }

  BR.Main = M;

  // claude.ai içinde yayınlandığında yeniden yüklemelerde kaydı korumak için isteğe bağlı kanca
  let hot = null;
  try {
    hot = window.claude && window.claude.hot ? window.claude.hot : null;
  } catch (e) {
    hot = null;
  }
  if (hot && typeof hot.snapshot === 'function') {
    try {
      hot.snapshot(() => ({ save: G.snapshotSave() }));
    } catch (e) {
      /* yok say */
    }
  }
  if (hot && typeof hot.ready === 'function') {
    try {
      hot.ready(boot);
    } catch (e) {
      boot({});
    }
    // kanca hiç çağırmazsa yine de açılsın
    setTimeout(() => boot({}), 1500);
  } else {
    boot((hot && hot.data) || {});
  }
})((window.BR = window.BR || {}));
