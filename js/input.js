/* Kumpir Arena - giriş: klavye (tek ya da iki oyuncu), dokunmatik joystick, gamepad */
(function (BR) {
  'use strict';

  const JOY_RADIUS = 55;
  const DEAD = 0.22;

  // Hareket tuşları: kod -> [oyuncu (tek kişide hepsi 0), yön]
  const MOVE_WASD = { KeyW: 'u', KeyS: 'd', KeyA: 'l', KeyD: 'r' };
  const MOVE_ARROWS = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r' };
  const KEY_FALLBACK = { w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD', arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', ' ': 'Space', e: 'KeyE', q: 'KeyQ' };
  // Eylem tuşları
  const ACT_SOLO = { Space: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyE: 'ability', KeyQ: 'ability' };
  const ACT_P1 = { Space: 'dash', ShiftLeft: 'dash', KeyE: 'ability', KeyQ: 'ability' };
  const ACT_P2 = { Enter: 'dash', NumpadEnter: 'dash', Numpad0: 'dash', ShiftRight: 'ability', NumpadDecimal: 'ability', Slash: 'ability' };

  const I = {
    coop: false,
    keys: {}, // kod -> basılı mı
    touch: { active: false, id: null, bx: 0, by: 0, x: 0, y: 0 },
    override: null, // testler için oyuncu 1 hareketi
    overrides: [null, null],
    presses: [{}, {}],
    padMove: [null, null],
    padPrev: {},
    navRepeat: 0,
    navDir: null,
    onNav: null, // menü gezinme geri çağrısı
    onPause: null,
    sawTouch: false,
    sawPad: false,
    joyUsed: false, // dokunmatik joystick bu oturumda kullanıldı mı (ipucu için)
  };

  function codeOf(e) {
    if (e.code) return e.code;
    if (typeof e.key === 'string') return KEY_FALLBACK[e.key.toLowerCase()] || null;
    return null;
  }

  function inWave() {
    return BR.Game && BR.Game.state === 'wave' && !BR.Game.paused;
  }

  // Bir tuş hangi oyuncunun hangi eylemi?
  function actionFor(code) {
    if (!I.coop) return ACT_SOLO[code] ? { p: 0, a: ACT_SOLO[code] } : null;
    if (ACT_P1[code]) return { p: 0, a: ACT_P1[code] };
    if (ACT_P2[code]) return { p: 1, a: ACT_P2[code] };
    return null;
  }

  I.endTouch = function () {
    I.touch.active = false;
    I.touch.id = null;
  };

  I.init = function (canvas) {
    // Dokunmatik cihazı baştan tanı: menüler ve HUD buna göre uyarlanır
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) I.markTouch();
    } catch (e) {
      /* yok say */
    }
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch') I.markTouch();
      },
      true
    );
    // uzun basınca açılan bağlam menüsü oyunu bölmesin
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      const code = codeOf(e);
      if (!code) return;
      const isMove = MOVE_WASD[code] || MOVE_ARROWS[code];
      const act = actionFor(code);
      if (isMove) I.keys[code] = true;
      if (act && !e.repeat && inWave()) I.presses[act.p][act.a] = true;
      if ((isMove || act) && inWave()) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const code = codeOf(e);
      if (code) I.keys[code] = false;
    });
    window.addEventListener('blur', () => {
      I.keys = {};
      I.endTouch();
    });

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') I.markTouch();
      if (!inWave()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (I.touch.active) return;
      I.touch.active = true;
      I.joyUsed = true;
      I.touch.id = e.pointerId;
      I.touch.bx = I.touch.x = e.clientX;
      I.touch.by = I.touch.y = e.clientY;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        /* bazı tarayıcılar desteklemez */
      }
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!I.touch.active || e.pointerId !== I.touch.id) return;
      I.touch.x = e.clientX;
      I.touch.y = e.clientY;
      const dx = I.touch.x - I.touch.bx;
      const dy = I.touch.y - I.touch.by;
      const d = Math.hypot(dx, dy);
      if (d > JOY_RADIUS) {
        I.touch.bx = I.touch.x - (dx / d) * JOY_RADIUS;
        I.touch.by = I.touch.y - (dy / d) * JOY_RADIUS;
      }
    });
    const end = (e) => {
      if (e.pointerId === I.touch.id) I.endTouch();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    window.addEventListener('gamepadconnected', () => {
      I.sawPad = true;
      document.documentElement.classList.add('has-pad');
    });
  };

  I.markTouch = function () {
    if (!I.sawTouch) {
      I.sawTouch = true;
      document.documentElement.classList.add('touch');
    }
  };

  // Dokunmatik düğmeler ve testler için
  I.press = function (p, action) {
    if (inWave()) I.presses[p][action] = true;
  };

  I.consume = function (p, action) {
    const v = I.presses[p] && I.presses[p][action];
    if (v) I.presses[p][action] = false;
    return !!v;
  };

  I.reset = function () {
    I.keys = {};
    I.presses = [{}, {}];
    I.endTouch();
  };

  I.setCoop = function (on) {
    I.coop = !!on;
    I.reset();
  };

  function keyVec(map) {
    let x = 0;
    let y = 0;
    for (const code in map) {
      if (!I.keys[code]) continue;
      const d = map[code];
      if (d === 'l') x -= 1;
      else if (d === 'r') x += 1;
      else if (d === 'u') y -= 1;
      else y += 1;
    }
    return { x, y };
  }

  I.getMove = function (p) {
    const pid = p || 0;
    if (I.overrides[pid]) return I.overrides[pid];
    if (pid === 0 && I.override) return I.override;
    let v;
    if (!I.coop) {
      const a = keyVec(MOVE_WASD);
      const b = keyVec(MOVE_ARROWS);
      v = { x: a.x + b.x, y: a.y + b.y };
    } else {
      v = keyVec(pid === 0 ? MOVE_WASD : MOVE_ARROWS);
    }
    if (pid === 0 && I.touch.active) {
      const dx = I.touch.x - I.touch.bx;
      const dy = I.touch.y - I.touch.by;
      const d = Math.hypot(dx, dy);
      if (d > 8) {
        const m = Math.min(1, d / JOY_RADIUS);
        v = { x: (dx / d) * m, y: (dy / d) * m };
      }
    }
    const pm = I.padMove[pid];
    if (pm && (pm.x || pm.y)) v = { x: pm.x, y: pm.y };
    const len = Math.hypot(v.x, v.y);
    if (len > 1) {
      v.x /= len;
      v.y /= len;
    }
    return v;
  };

  /* ---------- Gamepad ---------- */
  function pads() {
    if (!navigator.getGamepads) return [];
    try {
      return Array.from(navigator.getGamepads()).filter((p) => p && p.connected !== false);
    } catch (e) {
      return [];
    }
  }

  function btn(pad, i) {
    const b = pad.buttons[i];
    return !!b && (b.pressed || b.value > 0.5);
  }

  // Her karede ana döngüden çağrılır
  I.pollPads = function (dt) {
    const list = pads();
    I.padMove = [null, null];
    if (!list.length) return;
    if (!I.sawPad) {
      I.sawPad = true;
      document.documentElement.classList.add('has-pad');
    }
    let navDir = null;
    list.slice(0, 2).forEach((pad, k) => {
      // tek kişide ilk kol oyuncu 1; iki kişide tek kol varsa oyuncu 2'yi yönetir
      let pid = 0;
      if (I.coop) pid = list.length === 1 ? 1 : k;
      let x = pad.axes[0] || 0;
      let y = pad.axes[1] || 0;
      if (Math.hypot(x, y) < DEAD) {
        x = 0;
        y = 0;
      }
      if (btn(pad, 14)) x = -1;
      if (btn(pad, 15)) x = 1;
      if (btn(pad, 12)) y = -1;
      if (btn(pad, 13)) y = 1;
      I.padMove[pid] = { x, y };
      const key = pad.index;
      const prev = I.padPrev[key] || {};
      const now = { a: btn(pad, 0), b: btn(pad, 1), x: btn(pad, 2), y: btn(pad, 3), start: btn(pad, 9), select: btn(pad, 8) };
      const edge = (n) => now[n] && !prev[n];
      if (inWave()) {
        if (edge('a')) I.presses[pid].dash = true;
        if (edge('x') || edge('b') || edge('y')) I.presses[pid].ability = true;
      } else if (k === 0 || !I.coop) {
        if (edge('a') && I.onNav) I.onNav('ok');
        if (edge('b') && I.onNav) I.onNav('back');
        if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) {
          navDir = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
        }
      }
      if ((edge('start') || edge('select')) && I.onPause) I.onPause();
      I.padPrev[key] = now;
    });
    // menüde basılı tutunca tekrarla
    if (navDir) {
      if (navDir !== I.navDir) {
        I.navDir = navDir;
        I.navRepeat = 0.35;
        if (I.onNav) I.onNav(navDir);
      } else {
        I.navRepeat -= dt;
        if (I.navRepeat <= 0) {
          I.navRepeat = 0.14;
          if (I.onNav) I.onNav(navDir);
        }
      }
    } else {
      I.navDir = null;
    }
  };

  I.JOY_RADIUS = JOY_RADIUS;
  BR.Input = I;
})((window.BR = window.BR || {}));
