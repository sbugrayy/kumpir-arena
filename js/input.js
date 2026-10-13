/* Kumpir Arena - klavye ve dokunmatik (sanal joystick) girişi */
(function (BR) {
  'use strict';

  const CODE_MAP = {
    KeyW: 'u', ArrowUp: 'u',
    KeyS: 'd', ArrowDown: 'd',
    KeyA: 'l', ArrowLeft: 'l',
    KeyD: 'r', ArrowRight: 'r',
  };
  const KEY_MAP = {
    w: 'u', arrowup: 'u',
    s: 'd', arrowdown: 'd',
    a: 'l', arrowleft: 'l',
    d: 'r', arrowright: 'r',
  };
  const JOY_RADIUS = 55;

  const I = {
    keys: {},
    touch: { active: false, id: null, bx: 0, by: 0, x: 0, y: 0 },
    override: null, // testler ve demo için: { x, y }
  };

  function dirOf(e) {
    if (e.code && CODE_MAP[e.code]) return CODE_MAP[e.code];
    if (typeof e.key === 'string') return KEY_MAP[e.key.toLowerCase()] || null;
    return null;
  }

  I.endTouch = function () {
    I.touch.active = false;
    I.touch.id = null;
  };

  I.init = function (canvas) {
    window.addEventListener('keydown', (e) => {
      const k = dirOf(e);
      if (!k) return;
      I.keys[k] = true;
      if (BR.Game && BR.Game.state === 'wave') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = dirOf(e);
      if (k) I.keys[k] = false;
    });
    window.addEventListener('blur', () => {
      I.keys = {};
      I.endTouch();
    });

    canvas.addEventListener('pointerdown', (e) => {
      if (!BR.Game || BR.Game.state !== 'wave' || BR.Game.paused) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (I.touch.active) return;
      I.touch.active = true;
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
      // joystick tabanı parmağı takip etsin ki yön değiştirmek kolay olsun
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
  };

  I.reset = function () {
    I.keys = {};
    I.endTouch();
  };

  I.getMove = function () {
    if (I.override) return I.override;
    let x = 0;
    let y = 0;
    if (I.keys.l) x -= 1;
    if (I.keys.r) x += 1;
    if (I.keys.u) y -= 1;
    if (I.keys.d) y += 1;
    if (I.touch.active) {
      const dx = I.touch.x - I.touch.bx;
      const dy = I.touch.y - I.touch.by;
      const d = Math.hypot(dx, dy);
      if (d > 8) {
        const m = Math.min(1, d / JOY_RADIUS);
        x = (dx / d) * m;
        y = (dy / d) * m;
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  };

  I.JOY_RADIUS = JOY_RADIUS;
  BR.Input = I;
})((window.BR = window.BR || {}));
