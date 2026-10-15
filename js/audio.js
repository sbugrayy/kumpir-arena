/* Kumpir Arena - WebAudio ile üretilen ses efektleri ve müzik (dosya gerektirmez) */
(function (BR) {
  'use strict';

  const A = {
    ctx: null, master: null, musicGain: null, noise: null,
    vol: 0.5, musicVol: 0.35, last: {},
    track: null, want: null, intensity: 0, ducked: false,
    step: 0, nextTime: 0, timer: 0, nodes: null, prevF: {}, errors: 0,
    musicFilt: null, musicRev: null,
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
    applyDuckFilter();
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

  /* ================= Müzik ================= */
  // Parçalar müzik seçim sayfasında seçildi: Menü "Arcade Tema", Dükkan "Pazar Funk",
  // Dalga "Synthwave Aksiyon", Patron "Karanlık Synth". Her biri 8 ölçü (A + B bölümü).
  // mix: çevrimdışı ölçümle ayarlandı; eski müziğin yaklaşık 1,3 katı yükseklik (efektleri bastırmasın).
  //
  // Nota dizgeleri: her belirteç bir adım (16'lık). Sayı = dizide derece (akor kökü
  // verilmişse köke göre), "-" = önceki notayı uzat, "." = sus, "x" = akorun tamamı.
  // Davul dizgeleri: her karakter bir adım; "x" vuruş, "o" hafif vuruş.
  // min: dalga/patron yoğunluğu bu değere ulaşınca katman girer. mask: hangi ölçülerde çalar.
  const SC = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    kurdi: [0, 1, 3, 5, 7, 8, 10],
  };
  const rests = (n) => Array(n).fill('.').join(' ');

  const MENU_CH = [0, 5, 3, 4, 3, 4, 0, 5];
  const SHOP_CH = [0, 0, 3, 3, 0, 0, 4, 4];
  const WAVE_CH = [0, 5, 2, 6, 5, 6, 0, 4];

  const TRACKS = {
    menu: {
      name: 'Arcade Tema', bpm: 118, key: 261.63, scale: 'major', mix: 0.27,
      parts: [
        { drum: 'kick', pat: 'x.......x.......' },
        { drum: 'snare', pat: '....x.......x...' },
        { drum: 'hat', pat: '..x...x...x...x.' },
        { drum: 'hat', pat: 'xxxxxxxxxxxxxxxx', gain: 0.35, mask: '....xxxx' },
        { inst: 'bass', chords: MENU_CH, oct: -2, notes: '0 . . 0 . . 0 . 0 . . 0 . . 4 .' },
        { inst: 'arp', chords: MENU_CH, oct: 0, gain: 0.8, notes: '0 2 4 7 4 2 0 2 4 7 4 2 0 2 4 2' },
        { inst: 'pad', chords: MENU_CH, tones: [0, 2, 4], oct: 0, gain: 0.8, notes: 'x - - - - - - - - - - - - - - -', mask: '....xxxx' },
        {
          inst: 'lead', oct: 1,
          notes: '4 - - 2 - - 4 - 5 - 4 - 2 - 0 - | 2 - - 0 - - 2 - 4 - - - . . . . | 3 - - 2 - - 3 - 5 - 4 - 3 - 2 - | 1 - - - 2 - 3 - 4 - - - . . . . | ' +
            '5 - - 4 - - 3 - 2 - 3 - 5 - - - | 4 - - 3 - - 4 - 6 - - - 4 - - - | 2 - - 1 - - 2 - 4 - 2 - 0 - - - | 0 - - - -1 - 0 - 2 - - - . . . .',
        },
      ],
    },
    shop: {
      name: 'Pazar Funk', bpm: 104, key: 110, scale: 'dorian', mix: 0.36,
      parts: [
        { drum: 'kick', pat: 'x..x..x...x..x..' },
        { drum: 'snare', pat: '....x..o.o..x...' },
        { drum: 'hat', pat: 'xxxxxxxxxxxxxxxx', gain: 0.45 },
        { inst: 'slap', chords: SHOP_CH, oct: 0, notes: '0 . 7 . . 0 . 6 . 0 0 . 4 . 3 .' },
        { inst: 'stab', chords: SHOP_CH, tones: [0, 2, 4, 6], oct: 1, notes: '. . x . . . x . . . x . . x . .' },
        { inst: 'saz', oct: 1, notes: rests(48) + ' . . . . . . . . 7 6 4 3 2 - 0 - ' + rests(48) + ' . . . . 4 - 3 4 6 - 4 3 2 1 0 -' },
      ],
    },
    wave: {
      name: 'Synthwave Aksiyon', bpm: 128, key: 220, scale: 'minor', mix: 0.31, filter: true, lift: 0.06,
      parts: [
        { drum: 'kick', pat: 'x...x...x...x...' },
        { drum: 'snare', pat: '....x.......x...' },
        { drum: 'hat', pat: '..x...x...x...x.' },
        { drum: 'hat', pat: 'xxxxxxxxxxxxxxxx', gain: 0.4, min: 0.85 },
        { drum: 'snare', pat: 'x...x...x...x...', gain: 0.45, min: 0.93 },
        { drum: 'crash', pat: 'x' + '.'.repeat(63), min: 0.6 },
        { inst: 'synthbass', chords: WAVE_CH, oct: -2, notes: '0 0 7 0 0 0 7 0 0 0 7 0 0 0 7 0' },
        { inst: 'arp', chords: WAVE_CH, oct: 0, gain: 0.8, notes: '0 2 4 7 0 2 4 7 0 2 4 7 4 2 0 2', min: 0.3 },
        { inst: 'pad', chords: WAVE_CH, tones: [0, 2, 4], oct: 0, notes: 'x - - - - - - - - - - - - - - -', min: 0.3 },
        {
          inst: 'lead', oct: 1, min: 0.6,
          notes: '7 - - 6 - - 4 - 2 - - - 4 - - - | 5 - - 4 - - 2 - 0 - - - 2 - - - | 4 - - 6 - - 7 - 9 - - - 7 - - - | 6 - - - 7 - 6 - 4 - - - - - - - | ' +
            '5 - - - 4 - 5 - 7 - - - 5 - 4 - | 6 - - - 5 - 6 - 8 - - - 6 - 5 - | 7 - - - - - 9 - 7 - - - 4 - - - | 4 - - - 6 - 4 - 1 - - - - - - -',
        },
      ],
    },
    boss: {
      name: 'Karanlık Synth', bpm: 150, key: 146.83, scale: 'kurdi', mix: 0.36, lift: 0.05,
      parts: [
        { drum: 'kick', pat: 'x..x..x.x..x..x.' },
        { drum: 'snare', pat: '....x.......x...' },
        { drum: 'hat', pat: 'xxxxxxxxxxxxxxxx', gain: 0.45 },
        { drum: 'crash', pat: 'x' + '.'.repeat(63), min: 0.5 },
        { inst: 'synthbass', oct: -1, notes: '0 0 0 0 1 1 0 0 0 0 0 0 -2 -2 -1 -1 | 0 0 0 0 1 1 0 0 0 0 0 0 3 3 1 1' },
        { inst: 'arp', oct: 1, gain: 0.8, notes: '0 3 4 7 4 3 1 3 0 3 4 7 8 7 4 3' },
        { inst: 'arp', oct: 2, gain: 0.4, notes: '0 3 4 7 4 3 1 3 0 3 4 7 8 7 4 3', min: 0.6 },
        {
          inst: 'lead', oct: 1, glide: true,
          notes: '7 - - - - - 8 - 7 - - - 4 - - - | 5 - - - 4 - 3 - 1 - - - 0 - - - | 7 - - - - - 8 - 9 - - - 10 - - - | 11 - 10 - 8 - 7 - - - - - - - - - | ' +
            '12 - - - 11 - 10 - 8 - - - 7 - - - | 8 - - - 7 - 5 - 4 - - - 3 - - - | 7 - - - - - 10 - 9 - - - 8 - - - | 7 - - - - - - - - - - - - - - -',
        },
      ],
    },
  };

  function parseNotes(str) {
    const toks = str.replace(/\|/g, ' ').trim().split(/\s+/);
    const at = {};
    let cur = null;
    toks.forEach((tk, i) => {
      if (tk === '-') {
        if (cur) cur.len++;
      } else if (tk === '.') {
        cur = null;
      } else {
        cur = { val: tk, len: 1 };
        at[i] = cur;
      }
    });
    return { len: toks.length, at };
  }
  Object.keys(TRACKS).forEach((k) => {
    TRACKS[k].parts.forEach((p, i) => {
      if (p.notes) p.seq = parseNotes(p.notes);
      p.key = k + i;
    });
  });
  A.TRACKS = TRACKS;

  /* ---------- Ses yapı taşları (m: hangi bağlamda çalındığı) ---------- */
  // m = { ctx, rev } ; çevrimdışı ölçümde başka bir bağlam verilebilir
  let M = null;
  function gainEnv(t, peak, attack, hold, release) {
    const g = M.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (hold > 0) g.gain.setValueAtTime(peak, t + attack + hold);
    const end = t + attack + Math.max(0, hold) + release;
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    return { g, end };
  }
  function perc(t, peak, decay) {
    return gainEnv(t, peak, 0.002, 0, decay);
  }
  function osc(type, f, t, end) {
    const o = M.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.start(t);
    o.stop(end + 0.05);
    return o;
  }
  function noiseSrc(t, end) {
    const s = M.ctx.createBufferSource();
    s.buffer = A.noise;
    s.loop = true;
    s.start(t, Math.random() * 0.4);
    s.stop(end + 0.05);
    return s;
  }
  function filt(type, freq, q) {
    const f = M.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    return f;
  }
  function chain() {
    for (let i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]);
    return arguments[arguments.length - 1];
  }
  function send(node, out, amt) {
    node.connect(out);
    if (amt && M.rev) {
      const s = M.ctx.createGain();
      s.gain.value = amt;
      node.connect(s);
      s.connect(M.rev);
    }
  }
  function vibrato(o, t, f, depth, rate, delay, end) {
    const l = M.ctx.createOscillator();
    const lg = M.ctx.createGain();
    l.frequency.value = rate;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * depth, t + delay + 0.12);
    l.connect(lg);
    lg.connect(o.frequency);
    l.start(t);
    l.stop(end + 0.05);
  }

  const DRUMS = {
    kick(t, v, out) {
      const e = perc(t, 0.9 * v, 0.32);
      const o = osc('sine', 150, t, e.end);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      chain(o, e.g, out);
    },
    snare(t, v, out) {
      const e = perc(t, 0.45 * v, 0.16);
      chain(noiseSrc(t, e.end), filt('bandpass', 1800, 0.8), e.g, out);
      const e2 = perc(t, 0.22 * v, 0.08);
      chain(osc('triangle', 185, t, e2.end), e2.g, out);
    },
    hat(t, v, out) {
      const e = perc(t, 0.16 * v, 0.035);
      chain(noiseSrc(t, e.end), filt('highpass', 7000), e.g, out);
    },
    crash(t, v, out) {
      const e = perc(t, 0.18 * v, 1.3);
      chain(noiseSrc(t, e.end), filt('highpass', 4500), e.g, out);
    },
  };

  const INST = {
    bass(t, f, dur, v, out) {
      const e = gainEnv(t, 0.42 * v, 0.006, dur * 0.85, 0.08);
      const lp = filt('lowpass', 800);
      chain(osc('triangle', f, t, e.end), lp);
      const sub = M.ctx.createGain();
      sub.gain.value = 0.6;
      chain(osc('sine', f / 2, t, e.end), sub, lp);
      chain(lp, e.g, out);
    },
    synthbass(t, f, dur, v, out) {
      const e = gainEnv(t, 0.3 * v, 0.004, dur * 0.6, 0.06);
      const lp = filt('lowpass', 1800, 4);
      lp.frequency.setValueAtTime(1800, t);
      lp.frequency.exponentialRampToValueAtTime(260, t + Math.max(0.08, dur));
      chain(osc('sawtooth', f, t, e.end), lp, e.g, out);
    },
    slap(t, f, dur, v, out) {
      const e = perc(t, 0.4 * v, 0.28);
      const lp = filt('lowpass', 3000, 3);
      lp.frequency.setValueAtTime(3200, t);
      lp.frequency.exponentialRampToValueAtTime(380, t + 0.16);
      chain(osc('sawtooth', f, t, e.end), lp);
      const hi = M.ctx.createGain();
      hi.gain.value = 0.3;
      chain(osc('square', f * 2, t, e.end), hi, lp);
      chain(lp, e.g, out);
    },
    arp(t, f, dur, v, out) {
      const e = perc(t, 0.11 * v, 0.22);
      const lp = filt('lowpass', 3200, 2);
      lp.frequency.setValueAtTime(3400, t);
      lp.frequency.exponentialRampToValueAtTime(700, t + 0.18);
      chain(osc('square', f, t, e.end), lp, e.g);
      send(e.g, out, 0.2);
    },
    lead(t, f, dur, v, out, part) {
      const e = gainEnv(t, 0.1 * v, 0.02, dur * 0.9, 0.14);
      const lp = filt('lowpass', 2600, 1);
      const prev = part && part.glide ? M.prevF[part.key] : 0;
      [0.997, 1.003].forEach((m) => {
        const o = osc('sawtooth', f * m, t, e.end);
        if (prev) {
          o.frequency.setValueAtTime(prev * m, t);
          o.frequency.exponentialRampToValueAtTime(f * m, t + 0.09);
        }
        vibrato(o, t, f, 0.006, 5.5, 0.15, e.end);
        o.connect(lp);
      });
      chain(lp, e.g);
      send(e.g, out, 0.3);
    },
    saz(t, f, dur, v, out) {
      const e = perc(t, 0.2 * v, Math.min(0.9, dur + 0.35));
      const lp = filt('lowpass', 5000, 1.5);
      lp.frequency.setValueAtTime(5200, t);
      lp.frequency.exponentialRampToValueAtTime(900, t + 0.3);
      const o = osc('sawtooth', f * 1.012, t, e.end);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
      o.connect(lp);
      const oct = M.ctx.createGain();
      oct.gain.value = 0.35;
      chain(osc('square', f * 2, t, e.end), oct, lp);
      chain(lp, e.g);
      send(e.g, out, 0.22);
    },
    pad(t, f, dur, v, out) {
      const e = gainEnv(t, 0.035 * v, 0.25, dur, 0.5);
      const lp = filt('lowpass', 1100);
      [0.995, 1.005].forEach((m) => osc('sawtooth', f * m, t, e.end).connect(lp));
      chain(lp, e.g);
      send(e.g, out, 0.35);
    },
    stab(t, f, dur, v, out) {
      const e = perc(t, 0.05 * v, 0.18);
      const lp = filt('lowpass', 2400, 2);
      lp.frequency.setValueAtTime(2600, t);
      lp.frequency.exponentialRampToValueAtTime(600, t + 0.12);
      osc('square', f, t, e.end).connect(lp);
      osc('sawtooth', f, t, e.end).connect(lp);
      chain(lp, e.g);
      send(e.g, out, 0.15);
    },
  };

  function degFreq(tr, deg, oct) {
    const sc = SC[tr.scale];
    const n = sc.length;
    const semi = Math.floor(deg / n) * 12 + sc[((deg % n) + n) % n];
    return tr.key * Math.pow(2, (oct || 0) + semi / 12);
  }

  // Bir 16'lık adımı çal; out: parçanın veri yolu
  function playStep(tr, g, t, out, intensity) {
    const stepDur = 60 / tr.bpm / 4;
    const barIdx = Math.floor(g / 16);
    tr.parts.forEach((p) => {
      if (p.min && intensity < p.min) return;
      if (p.mask && p.mask[barIdx % p.mask.length] !== 'x') return;
      const v = p.gain || 1;
      if (p.drum) {
        const ch = p.pat[g % p.pat.length];
        if (ch === '.') return;
        DRUMS[p.drum](t, v * (ch === 'o' ? 0.45 : 1), out);
        return;
      }
      const ev = p.seq.at[g % p.seq.len];
      if (!ev) return;
      const dur = ev.len * stepDur;
      const root = p.chords ? p.chords[barIdx % p.chords.length] : 0;
      if (ev.val === 'x') {
        (p.tones || [0, 2, 4]).forEach((tn) => INST[p.inst](t, degFreq(tr, root + tn, p.oct), dur, v, out, p));
        return;
      }
      const f = degFreq(tr, root + Number(ev.val), p.oct);
      INST[p.inst](t, f, dur, v, out, p);
      M.prevF[p.key] = f;
    });
  }

  function trackTempo(tr, intensity) {
    const lift = tr.lift ? 1 + (tr.lift * Math.max(0, intensity - 0.85)) / 0.15 : 1;
    return tr.bpm * lift;
  }

  function cutoffFor(tr, intensity) {
    return tr.filter ? 4000 + 16000 * Math.pow(intensity, 1.3) : 20000;
  }

  // Parça başına ses yolu: ses → bus (karışım) → filtre → dest; yankı gönderimi ayrı
  function makeBus(ctx, tr, dest, revDest) {
    const bus = ctx.createGain();
    bus.gain.value = tr.mix;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoffFor(tr, A.intensity);
    f.Q.value = 0.7;
    bus.connect(f);
    f.connect(dest);
    const rev = ctx.createGain();
    rev.gain.value = tr.mix;
    rev.connect(revDest);
    return { bus, filt: f, rev };
  }

  function makeReverb(ctx, dest) {
    const c = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    c.buffer = ir;
    const g = ctx.createGain();
    g.gain.value = 0.28;
    c.connect(g);
    g.connect(dest);
    return c;
  }

  // Oyun bağlamında müzik zinciri: parça → müzik filtresi (duraklatınca boğuk) → müzik sesi
  function ensureMusicChain() {
    if (A.musicFilt) return;
    const c = A.ctx;
    A.musicFilt = c.createBiquadFilter();
    A.musicFilt.type = 'lowpass';
    A.musicFilt.frequency.value = 20000;
    A.musicFilt.connect(A.musicGain);
    A.musicRev = makeReverb(c, A.musicFilt);
  }

  function fadeOut(nodes) {
    if (!nodes) return;
    const now = A.ctx.currentTime;
    [nodes.bus, nodes.rev].forEach((n) => {
      n.gain.cancelScheduledValues(now);
      n.gain.setValueAtTime(n.gain.value, now);
      n.gain.linearRampToValueAtTime(0.0001, now + 0.35);
    });
    setTimeout(() => {
      try {
        nodes.bus.disconnect();
        nodes.rev.disconnect();
      } catch (e) {
        /* yok say */
      }
    }, 600);
  }

  A.music = function (name) {
    A.want = name;
    if (!A.ctx) return;
    if (A.track === name) return;
    ensureMusicChain();
    fadeOut(A.nodes);
    A.nodes = null;
    A.track = name;
    A.step = 0;
    A.nextTime = A.ctx.currentTime + 0.12;
    A.prevF = {};
    const tr = TRACKS[name];
    if (!tr) return;
    A.nodes = makeBus(A.ctx, tr, A.musicFilt, A.musicRev);
    // yeni parça kısa bir yükselişle girer
    const now = A.ctx.currentTime;
    A.nodes.bus.gain.setValueAtTime(0.0001, now);
    A.nodes.bus.gain.linearRampToValueAtTime(tr.mix, now + 0.3);
  };

  A.setIntensity = function (v) {
    A.intensity = Math.max(0, Math.min(1, v));
  };

  function schedule() {
    if (!A.ctx || A.ctx.state !== 'running' || !A.track || !A.nodes || A.musicVol <= 0) return;
    const tr = TRACKS[A.track];
    if (!tr) return;
    const now = A.ctx.currentTime;
    if (A.nextTime < now - 0.2) A.nextTime = now + 0.05;
    const inten = A.track === 'wave' || A.track === 'boss' ? A.intensity : 0;
    const stepDur = 60 / trackTempo(tr, inten) / 4;
    M = { ctx: A.ctx, rev: A.nodes.rev, prevF: A.prevF };
    let guard = 0;
    while (A.nextTime < now + 0.15 && guard++ < 16) {
      try {
        playStep(tr, A.step, A.nextTime, A.nodes.bus, inten);
      } catch (e) {
        A.errors = (A.errors || 0) + 1;
      }
      A.nextTime += stepDur;
      A.step = (A.step + 1) % (16 * 64);
    }
    A.nodes.filt.frequency.setTargetAtTime(cutoffFor(tr, inten), now, 0.1);
  }

  // Duraklatınca müzik kısılır ve boğuklaşır
  function applyDuckFilter() {
    if (!A.musicFilt) return;
    A.musicFilt.frequency.setTargetAtTime(A.ducked ? 1000 : 20000, A.ctx.currentTime, 0.08);
  }

  /* ---------- Çevrimdışı ölçüm (testler ve ses dengesi için) ---------- */
  // Parçayı sessizce ayrı bir bağlamda çizer; RMS ve tepe değerini döndürür.
  A.renderTrack = function (name, seconds, intensity) {
    const tr = TRACKS[name];
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!tr || !OAC) return Promise.resolve(null);
    const sr = 22050;
    const off = new OAC(2, Math.ceil(sr * seconds), sr);
    if (!A.noise) {
      const len = Math.floor(sr * 0.5);
      A.noise = off.createBuffer(1, len, sr);
      const d = A.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const rev = makeReverb(off, off.destination);
    const inten = intensity || 0;
    const prevIntensity = A.intensity;
    A.intensity = inten;
    const nodes = makeBus(off, tr, off.destination, rev);
    A.intensity = prevIntensity;
    const saved = M;
    M = { ctx: off, rev: nodes.rev, prevF: {} };
    let errors = 0;
    const stepDur = 60 / trackTempo(tr, inten) / 4;
    for (let g = 0, t = 0.05; t < seconds - 0.05; g++, t += stepDur) {
      try {
        playStep(tr, g, t, nodes.bus, inten);
      } catch (e) {
        errors++;
      }
    }
    M = saved;
    return off.startRendering().then((buf) => {
      let sum = 0;
      let peak = 0;
      let n = 0;
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < d.length; i++) {
          const x = d[i];
          sum += x * x;
          if (Math.abs(x) > peak) peak = Math.abs(x);
          n++;
        }
      }
      return { rms: Math.sqrt(sum / n), peak, errors };
    });
  };

  BR.Audio = A;
})((window.BR = window.BR || {}));
