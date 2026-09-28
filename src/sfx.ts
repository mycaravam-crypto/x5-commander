// Tiny WebAudio synth. No files.
let ctx: AudioContext | null = null;
let master: GainNode;
export let muted = false;
export const toggleMute = () => { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.6; };

export function unlock() {
  if (!ctx) { ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ctx.destination); }
  ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.05, to = freq, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur);
}

let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, vol = 0.08, freq = 1200) {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(80, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t); src.stop(t + dur);
}

const last: Record<string, number> = {};
const GAP: Record<string, number> = { gun: 0.07, shot: 0.05, beam: 0.06, hit: 0.04, kill: 0.04, detect: 0.25, missile: 0.08, baseHit: 0.1, arm: 0.5, ident: 0.1 };

export function play(k: string) {
  if (!ctx || muted) return;
  const now = ctx.currentTime;
  if (now - (last[k] ?? -1) < (GAP[k] ?? 0)) return;
  last[k] = now;
  switch (k) {
    case 'shot': tone(220, 0.08, 'square', 0.025, 70); break;
    case 'missile': tone(200, 0.25, 'sawtooth', 0.02, 700); break;
    case 'gun': noise(0.04, 0.02, 3000); break;
    case 'beam': tone(1400, 0.06, 'sine', 0.025, 900); break;
    case 'rail': tone(90, 0.4, 'sawtooth', 0.08, 40); noise(0.3, 0.1, 4000); break;
    case 'hit': tone(500, 0.03, 'triangle', 0.02, 300); break;
    case 'kill': noise(0.15, 0.06, 2500); tone(160, 0.1, 'square', 0.02, 50); break;
    case 'baseHit': tone(110, 0.3, 'sawtooth', 0.09, 35); noise(0.3, 0.12, 800); break;
    case 'ping': tone(1250, 0.6, 'sine', 0.018, 1180); break;
    case 'detect': tone(1760, 0.05, 'sine', 0.015); break;
    case 'lock': tone(880, 0.05, 'square', 0.03); tone(1320, 0.07, 'square', 0.03, 1320, 0.06); break;
    case 'buy': tone(660, 0.08, 'square', 0.03, 990); break;
    case 'level': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.04, f, i * 0.09)); break;
    case 'warning': for (let i = 0; i < 3; i++) { tone(440, 0.2, 'sawtooth', 0.05, 440, i * 0.45); tone(330, 0.2, 'sawtooth', 0.05, 330, i * 0.45 + 0.22); } break;
    case 'arm': for (let i = 0; i < 5; i++) tone(2400, 0.045, 'square', 0.03, 2400, i * 0.08); break; // RWR launch warning
    case 'radarDown': noise(0.7, 0.15, 1500); tone(900, 0.9, 'sawtooth', 0.06, 50); break;
    case 'emcon': tone(700, 0.12, 'triangle', 0.04, 350); break;
    case 'jam': noise(0.8, 0.04, 6000); break;
    case 'ident': tone(1100, 0.06, 'triangle', 0.025, 700); break;
    case 'raid': for (let i = 0; i < 2; i++) { tone(587, 0.25, 'sawtooth', 0.05, 587, i * 0.5); tone(440, 0.25, 'sawtooth', 0.05, 440, i * 0.5 + 0.25); } break;
    case 'raidClear': [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.15, 'square', 0.04, f, i * 0.07)); break;
    case 'over': [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.06, f * 0.9, i * 0.22)); break;
  }
}
