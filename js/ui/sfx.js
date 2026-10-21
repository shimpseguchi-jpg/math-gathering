// 効果音（WebAudio でその場で合成。音声ファイルなし）。タップのあとでないと鳴らない
const KEY = 'mtg-sound';
let ctx = null;
let on = (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })();

export const soundOn = () => on;
export function setSound(v) {
  on = v;
  try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* 保存できなくても鳴らせる */ }
}

function ac() {
  if (!on) return null;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { return null; }
  return ctx;
}

function tone(freq, at, dur, { type = 'sine', gain = 0.12, to = null } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(at, dur, gain = 0.2) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 1800;
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

export const sfx = {
  tap: () => tone(660, 0, 0.06, { type: 'triangle', gain: 0.06 }),
  tear: () => { noise(0, 0.35, 0.25); tone(500, 0.05, 0.3, { type: 'sawtooth', gain: 0.04, to: 180 }); },
  flip: () => tone(1100, 0, 0.08, { type: 'triangle', gain: 0.08, to: 700 }),
  uncommon: () => { tone(NOTE(79), 0, 0.18, { gain: 0.08 }); tone(NOTE(84), 0.08, 0.25, { gain: 0.08 }); },
  rare: () => [72, 76, 79, 84].forEach((n, i) => tone(NOTE(n), i * 0.08, 0.35, { type: 'triangle', gain: 0.1 })),
  charge: () => tone(220, 0, 0.9, { type: 'sawtooth', gain: 0.05, to: 880 }),
  legend: () => {
    [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone(NOTE(n), i * 0.07, 0.5, { type: 'triangle', gain: 0.09 }));
    [72, 76, 79].forEach((n) => tone(NOTE(n), 0.55, 1.2, { type: 'sine', gain: 0.07 }));
    for (let i = 0; i < 8; i++) tone(NOTE(96 + (i % 4) * 2), 0.6 + i * 0.06, 0.12, { gain: 0.03 });
  },
  surprise: () => { tone(300, 0, 0.5, { type: 'square', gain: 0.04, to: 1200 }); noise(0.45, 0.15, 0.15); },
};
