/* Kumpir Arena - WebAudio ile üretilen ses efektleri (dosya gerektirmez) */
(function (BR) {
  'use strict';

  const A = { ctx: null, master: null, noise: null, vol: 0.5, last: {} };

  A.init = function () {
    if (A.ctx) {
      if (A.ctx.state === 'suspended') {
        A.ctx.resume().catch(() => {});
      }
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.vol;
      A.master.connect(A.ctx.destination);
      const len = Math.floor(A.ctx.sampleRate * 0.5);
      A.noise = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
      const data = A.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      A.ctx = null;
    }
  };

  A.setVolume = function (v) {
    A.vol = v;
    if (A.master) A.master.gain.value = v;
  };

  function tone(t, type, f0, f1, dur, gain) {
    const c = A.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(A.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(t, dur, gain, freq, q, ftype) {
    const c = A.ctx;
    const src = c.createBufferSource();
    src.buffer = A.noise;
    const f = c.createBiquadFilter();
    f.type = ftype || 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(A.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const SFX = {
    shoot: { min: 0.045, fn: (t) => tone(t, 'square', 720, 320, 0.07, 0.05) },
    swing: { min: 0.05, fn: (t) => noise(t, 0.09, 0.12, 1800, 0.8) },
    hit: { min: 0.035, fn: (t) => noise(t, 0.05, 0.14, 900, 1.2) },
    death: { min: 0.03, fn: (t) => tone(t, 'sine', 380, 90, 0.12, 0.12) },
    bigdeath: { min: 0.2, fn: (t) => { tone(t, 'sawtooth', 220, 40, 0.6, 0.18); noise(t, 0.6, 0.25, 300, 0.7, 'lowpass'); } },
    pickup: { min: 0.03, fn: (t) => tone(t, 'sine', 900, 1500, 0.06, 0.05) },
    heal: { min: 0.1, fn: (t) => { tone(t, 'triangle', 520, 780, 0.1, 0.12); tone(t + 0.08, 'triangle', 780, 1040, 0.12, 0.1); } },
    level: { min: 0.2, fn: (t) => { tone(t, 'square', 523, 523, 0.1, 0.07); tone(t + 0.09, 'square', 659, 659, 0.1, 0.07); tone(t + 0.18, 'square', 784, 784, 0.18, 0.07); } },
    hurt: { min: 0.08, fn: (t) => { tone(t, 'sawtooth', 240, 70, 0.18, 0.16); noise(t, 0.12, 0.15, 500, 1); } },
    dodge: { min: 0.08, fn: (t) => tone(t, 'sine', 1300, 1800, 0.08, 0.08) },
    boom: { min: 0.06, fn: (t) => noise(t, 0.35, 0.3, 260, 0.6, 'lowpass') },
    buy: { min: 0.05, fn: (t) => { tone(t, 'triangle', 660, 660, 0.08, 0.12); tone(t + 0.07, 'triangle', 990, 990, 0.12, 0.12); } },
    error: { min: 0.1, fn: (t) => tone(t, 'square', 160, 120, 0.15, 0.08) },
    click: { min: 0.03, fn: (t) => tone(t, 'triangle', 880, 700, 0.04, 0.07) },
    wave: { min: 0.3, fn: (t) => { tone(t, 'square', 392, 392, 0.12, 0.06); tone(t + 0.12, 'square', 523, 523, 0.12, 0.06); tone(t + 0.24, 'square', 659, 659, 0.25, 0.06); } },
    lose: { min: 0.5, fn: (t) => { tone(t, 'triangle', 440, 220, 0.5, 0.15); tone(t + 0.35, 'triangle', 330, 110, 0.7, 0.15); } },
    win: { min: 0.5, fn: (t) => { [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.12, 'square', f, f, 0.2, 0.07)); } },
    enemyShoot: { min: 0.08, fn: (t) => tone(t, 'sine', 300, 180, 0.1, 0.06) },
    crate: { min: 0.1, fn: (t) => { tone(t, 'triangle', 440, 880, 0.15, 0.12); } },
    warn: { min: 0.5, fn: (t) => { tone(t, 'sawtooth', 110, 110, 0.35, 0.08); tone(t + 0.4, 'sawtooth', 110, 110, 0.35, 0.08); } },
  };

  A.play = function (name) {
    if (!A.ctx || A.vol <= 0 || A.ctx.state !== 'running') return;
    const def = SFX[name];
    if (!def) return;
    const now = A.ctx.currentTime;
    if (A.last[name] !== undefined && now - A.last[name] < def.min) return;
    A.last[name] = now;
    try {
      def.fn(now + 0.005);
    } catch (e) {
      /* ses hatası oyunu durdurmamalı */
    }
  };

  BR.Audio = A;
})((window.BR = window.BR || {}));
