/* Kumpir Arena - WebAudio ile üretilen ses efektleri ve müzik (dosya gerektirmez) */
(function (BR) {
  'use strict';

  const A = {
    ctx: null, master: null, musicGain: null, noise: null,
    vol: 0.5, musicVol: 0.35, last: {},
    track: null, want: null, intensity: 0, ducked: false,
    step: 0, nextTime: 0, timer: 0,
  };

  A.init = function () {
    if (A.ctx) {
      if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.vol;
      A.master.connect(A.ctx.destination);
      A.musicGain = A.ctx.createGain();
      A.musicGain.gain.value = A.musicVol;
      A.musicGain.connect(A.ctx.destination);
      const len = Math.floor(A.ctx.sampleRate * 0.5);
      A.noise = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
      const data = A.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      A.timer = setInterval(schedule, 30);
      if (A.want) A.music(A.want);
    } catch (e) {
      A.ctx = null;
    }
  };

  A.setVolume = function (v) {
    A.vol = v;
    if (A.master) A.master.gain.value = v;
  };

  A.setMusicVolume = function (v) {
    A.musicVol = v;
    applyMusicGain();
  };

  function applyMusicGain() {
    if (!A.musicGain) return;
    A.musicGain.gain.value = A.musicVol * (A.ducked ? 0.35 : 1);
  }

  A.duck = function (on) {
    A.ducked = !!on;
    applyMusicGain();
  };

  function tone(t, type, f0, f1, dur, gain, dest) {
    const c = A.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || A.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(t, dur, gain, freq, q, ftype, dest) {
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
    g.connect(dest || A.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const SFX = {
    shoot: { min: 0.045, fn: (t) => tone(t, 'square', 720, 320, 0.07, 0.05) },
    swing: { min: 0.05, fn: (t) => noise(t, 0.09, 0.12, 1800, 0.8) },
    hit: { min: 0.035, fn: (t) => noise(t, 0.05, 0.14, 900, 1.2) },
    block: { min: 0.06, fn: (t) => tone(t, 'square', 1400, 900, 0.05, 0.06) },
    death: { min: 0.03, fn: (t) => tone(t, 'sine', 380, 90, 0.12, 0.12) },
    bigdeath: { min: 0.2, fn: (t) => { tone(t, 'sawtooth', 220, 40, 0.6, 0.18); noise(t, 0.6, 0.25, 300, 0.7, 'lowpass'); } },
    pickup: { min: 0.03, fn: (t) => tone(t, 'sine', 900, 1500, 0.06, 0.05) },
    topping: { min: 0.05, fn: (t) => { tone(t, 'triangle', 700, 1100, 0.08, 0.09); tone(t + 0.06, 'triangle', 1100, 1400, 0.08, 0.07); } },
    heal: { min: 0.1, fn: (t) => { tone(t, 'triangle', 520, 780, 0.1, 0.12); tone(t + 0.08, 'triangle', 780, 1040, 0.12, 0.1); } },
    level: { min: 0.2, fn: (t) => { tone(t, 'square', 523, 523, 0.1, 0.07); tone(t + 0.09, 'square', 659, 659, 0.1, 0.07); tone(t + 0.18, 'square', 784, 784, 0.18, 0.07); } },
    hurt: { min: 0.08, fn: (t) => { tone(t, 'sawtooth', 240, 70, 0.18, 0.16); noise(t, 0.12, 0.15, 500, 1); } },
    dodge: { min: 0.08, fn: (t) => tone(t, 'sine', 1300, 1800, 0.08, 0.08) },
    dash: { min: 0.08, fn: (t) => noise(t, 0.16, 0.16, 2400, 0.6, 'highpass') },
    ability: { min: 0.15, fn: (t) => { tone(t, 'sawtooth', 200, 600, 0.25, 0.09); noise(t, 0.25, 0.12, 1200, 0.8); } },
    boom: { min: 0.06, fn: (t) => noise(t, 0.35, 0.3, 260, 0.6, 'lowpass') },
    laser: { min: 0.3, fn: (t) => tone(t, 'sawtooth', 900, 300, 0.9, 0.08) },
    buy: { min: 0.05, fn: (t) => { tone(t, 'triangle', 660, 660, 0.08, 0.12); tone(t + 0.07, 'triangle', 990, 990, 0.12, 0.12); } },
    coin: { min: 0.05, fn: (t) => { tone(t, 'square', 988, 988, 0.06, 0.07); tone(t + 0.06, 'square', 1319, 1319, 0.14, 0.07); } },
    error: { min: 0.1, fn: (t) => tone(t, 'square', 160, 120, 0.15, 0.08) },
    click: { min: 0.03, fn: (t) => tone(t, 'triangle', 880, 700, 0.04, 0.07) },
    wave: { min: 0.3, fn: (t) => { tone(t, 'square', 392, 392, 0.12, 0.06); tone(t + 0.12, 'square', 523, 523, 0.12, 0.06); tone(t + 0.24, 'square', 659, 659, 0.25, 0.06); } },
    lose: { min: 0.5, fn: (t) => { tone(t, 'triangle', 440, 220, 0.5, 0.15); tone(t + 0.35, 'triangle', 330, 110, 0.7, 0.15); } },
    win: { min: 0.5, fn: (t) => { [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.12, 'square', f, f, 0.2, 0.07)); } },
    achieve: { min: 0.3, fn: (t) => { [784, 988, 1175, 1568].forEach((f, i) => tone(t + i * 0.08, 'triangle', f, f, 0.16, 0.09)); } },
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

  /* ---------- Müzik ---------- */
  // 16'lık adımlar; bas ve arpej dereceleri minör pentatonik dizi üzerinde
  const SCALE = [0, 3, 5, 7, 10, 12, 15, 17];
  const TRACKS = {
    menu: { bpm: 88, root: 110, prog: [0, -4, -2, -5], bass: [0, -1, -1, -1, 2, -1, -1, -1, 0, -1, -1, -1, 3, -1, 2, -1], kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], snare: [], hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], arp: [4, -1, 5, -1, 6, -1, 5, -1, 4, -1, 3, -1, 2, -1, 3, -1], arpGain: 0.025 },
    shop: { bpm: 100, root: 130.8, prog: [0, 5, 3, 7], bass: [0, -1, 2, -1, 0, -1, 3, -1, 0, -1, 2, -1, 4, -1, 3, -1], kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1], arp: [5, -1, 4, -1, 2, -1, 4, -1, 5, -1, 6, -1, 5, -1, 4, -1], arpGain: 0.02 },
    wave: { bpm: 122, root: 110, prog: [0, 0, -2, -4], bass: [0, 0, -1, 0, 0, -1, 2, -1, 0, 0, -1, 0, 3, -1, 2, -1], kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1], arp: [5, 4, 2, 4, 5, 4, 2, 4, 6, 5, 4, 2, 5, 4, 2, 0], arpGain: 0.022 },
    boss: { bpm: 138, root: 98, prog: [0, 1, 0, -2], bass: [0, 0, 0, -1, 0, 0, 3, -1, 0, 0, 0, -1, 4, -1, 3, -1], kick: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], arp: [7, 6, 5, 4, 7, 6, 5, 4, 6, 5, 4, 3, 6, 5, 4, 2], arpGain: 0.024 },
  };

  A.music = function (name) {
    A.want = name;
    if (!A.ctx) return;
    if (A.track === name) return;
    A.track = name;
    A.step = 0;
    A.nextTime = A.ctx.currentTime + 0.08;
  };

  A.setIntensity = function (v) {
    A.intensity = Math.max(0, Math.min(1, v));
  };

  function freq(root, semi) {
    return root * Math.pow(2, semi / 12);
  }

  function playStep(tr, step, t) {
    const i = step % 16;
    const bar = Math.floor(step / 16) % tr.prog.length;
    const off = tr.prog[bar];
    const intense = A.track === 'wave' ? A.intensity : 0.7;
    const g = A.musicGain;
    if (tr.bass[i] >= 0) tone(t, 'triangle', freq(tr.root, SCALE[tr.bass[i]] + off), freq(tr.root, SCALE[tr.bass[i]] + off), 0.2, 0.16, g);
    if (tr.kick[i]) tone(t, 'sine', 150, 45, 0.16, 0.32, g);
    if (tr.snare[i]) noise(t, 0.12, 0.1, 1800, 0.9, 'bandpass', g);
    if (tr.hat[i] && (A.track !== 'wave' || intense > 0.25)) noise(t, 0.035, 0.05, 7500, 0.7, 'highpass', g);
    if (tr.arp[i] >= 0 && (A.track !== 'wave' || intense > 0.55)) {
      const f = freq(tr.root * 2, SCALE[tr.arp[i]] + off);
      tone(t, 'square', f, f, 0.11, tr.arpGain, g);
    }
  }

  function schedule() {
    if (!A.ctx || A.ctx.state !== 'running' || !A.track || A.musicVol <= 0) return;
    const tr = TRACKS[A.track];
    if (!tr) return;
    const now = A.ctx.currentTime;
    if (A.nextTime < now - 0.2) A.nextTime = now + 0.05;
    const tempo = tr.bpm * (A.track === 'wave' ? 1 + 0.12 * Math.max(0, A.intensity - 0.8) / 0.2 : 1);
    const stepDur = 60 / tempo / 4;
    let guard = 0;
    while (A.nextTime < now + 0.15 && guard++ < 16) {
      try {
        playStep(tr, A.step, A.nextTime);
      } catch (e) {
        /* yok say */
      }
      A.nextTime += stepDur;
      A.step = (A.step + 1) % (16 * tr.prog.length);
    }
  }

  BR.Audio = A;
})((window.BR = window.BR || {}));
