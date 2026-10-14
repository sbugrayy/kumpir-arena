/* Kumpir Arena - başlatma ve ana döngü */
(function (BR) {
  'use strict';

  const U = BR.U;
  const G = BR.Game;
  const STEP = 1 / 60;
  const SETTINGS_KEY = 'kumpirArena.settings.v1';

  const M = { manual: false, booted: false, last: 0, acc: 0, errors: 0 };

  BR.settings = { volume: 0.5, music: 0.35, speed: 1, easy: false, colorblind: false, shake: true, hitstop: true, dmgNumbers: true };

  function loadSettings() {
    const s = U.store.get(SETTINGS_KEY, null);
    const st = BR.settings;
    if (s && typeof s === 'object') {
      if (typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1) st.volume = s.volume;
      if (typeof s.music === 'number' && s.music >= 0 && s.music <= 1) st.music = s.music;
      if ([0.75, 1, 1.25].includes(s.speed)) st.speed = s.speed;
      ['easy', 'colorblind', 'shake', 'hitstop', 'dmgNumbers'].forEach((k) => {
        if (typeof s[k] === 'boolean') st[k] = s[k];
      });
    }
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches && !s) {
        st.shake = false;
        st.hitstop = false;
      }
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
    try {
      BR.Input.pollPads(dt);
    } catch (e) {
      M.errors++;
      console.error(e);
    }
    if (!M.manual && G.state === 'wave' && !G.paused) {
      // vuruş donması: kısa bir an simülasyon durur, çizim sürer
      if (G.hitstop > 0) {
        G.hitstop = Math.max(0, G.hitstop - dt);
        M.acc = 0;
      } else {
        M.acc += dt * (BR.settings.speed || 1);
      }
      let n = 0;
      try {
        while (M.acc >= STEP && n < 6) {
          G.update(STEP);
          M.acc -= STEP;
          n++;
          if (G.hitstop > 0) {
            M.acc = 0;
            break;
          }
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
    BR.Meta.load();
    BR.Audio.setVolume(BR.settings.volume);
    BR.Audio.setMusicVolume(BR.settings.music);
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
    registerSW();
  }

  // Çevrimdışı oynamak için (yalnızca http/https altında, gömülü tek dosya sürümünde kapalı)
  function registerSW() {
    try {
      if (window.BR_NO_SW || !('serviceWorker' in navigator)) return;
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
      navigator.serviceWorker.register('sw.js').catch(() => {});
    } catch (e) {
      /* yok say */
    }
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
