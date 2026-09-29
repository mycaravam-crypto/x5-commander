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
const GAP: Record<string, number> = { drop: 0.2, pickup: 0.05, gun: 0.07, shot: 0.05, beam: 0.06, hit: 0.04, kill: 0.04, detect: 0.25, missile: 0.08, baseHit: 0.1, arm: 0.5, tbm: 0.8, release: 0.3, ident: 0.1, acquire: 0.12, lost: 0.25 };

export function play(k: string, e: { n?: number; star?: boolean; drop?: string } = {}) {
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
    case 'dud': noise(0.12, 0.05, 600); break;
    case 'hit': tone(500, 0.03, 'triangle', 0.02, 300); break;
    case 'kill': noise(0.15, 0.06, 2500); tone(160, 0.1, 'square', 0.02, 50); break;
    case 'baseHit': tone(110, 0.3, 'sawtooth', 0.09, 35); noise(0.3, 0.12, 800); break;
    case 'ping': tone(1250, 0.6, 'sine', 0.018, 1180); break;
    case 'detect': tone(1760, 0.05, 'sine', 0.015); break;
    case 'lock': tone(880, 0.05, 'square', 0.03); tone(1320, 0.07, 'square', 0.03, 1320, 0.06); break;
    case 'buy': tone(660, 0.08, 'square', 0.03, 990); break;
    case 'upgrade': { // climbs a semitone with every level of the upgrade, so a run of buys sounds like progress
      const f = 520 * 2 ** (Math.min(e.n ?? 1, 24) / 12);
      tone(f, 0.07, 'square', 0.03, f * 1.5); tone(f * 1.5, 0.1, 'triangle', 0.025, f * 1.5, 0.05);
      if (e.star) [1, 1.26, 1.5, 2].forEach((m, i) => tone(f * m, 0.22, 'square', 0.035, f * m, 0.12 + i * 0.08)); // new rank: fanfare
      break;
    }
    case 'drop': tone(2093, 0.08, 'sine', 0.025); tone(2637, 0.12, 'sine', 0.02, 2637, 0.07); break; // something glints
    case 'pickup': (e.drop === 'tech' ? [523, 784, 1047, 1319, 1568] : [784, 1047, 1319]).forEach((f, i) => tone(f, 0.12, 'triangle', 0.045, f, i * 0.05)); break;
    case 'level': case 'trained': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.04, f, i * 0.09)); break;
    case 'warning': for (let i = 0; i < 3; i++) { tone(440, 0.2, 'sawtooth', 0.05, 440, i * 0.45); tone(330, 0.2, 'sawtooth', 0.05, 330, i * 0.45 + 0.22); } break;
    case 'arm': for (let i = 0; i < 5; i++) tone(2400, 0.045, 'square', 0.03, 2400, i * 0.08); break; // RWR launch warning
    case 'cruise': for (let i = 0; i < 3; i++) tone(1400, 0.09, 'sawtooth', 0.03, 900, i * 0.14); break; // cruise missile warning
    case 'release': tone(1600, 0.08, 'square', 0.025, 1100); break; // ATGM / glide bomb away
    case 'tbm': for (let i = 0; i < 4; i++) tone(i % 2 ? 660 : 990, 0.12, 'square', 0.04, i % 2 ? 660 : 990, i * 0.13); break; // ballistic warning
    case 'radarDown': noise(0.7, 0.15, 1500); tone(900, 0.9, 'sawtooth', 0.06, 50); break;
    case 'intercept': [1320, 1760, 1320, 1760].forEach((f, i) => tone(f, 0.07, 'square', 0.035, f, i * 0.07)); break;
    case 'discipline': tone(520, 0.06, 'square', 0.03, 780); break;
    case 'radarMode': tone(1000, 0.05, 'sine', 0.03, 1500); tone(1500, 0.05, 'sine', 0.03, 1000, 0.06); break;
    case 'killChain': tone(988, 0.06, 'square', 0.03); tone(1319, 0.08, 'square', 0.03, 1319, 0.06); break;
    case 'counterSead': tone(440, 0.15, 'triangle', 0.04, 880); break;
    case 'lastStand': [220, 277, 330].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.05, f, i * 0.12)); break;
    case 'acquire': tone(1480, 0.03, 'square', 0.012); break; // fire control has it
    case 'lost': tone(700, 0.12, 'triangle', 0.025, 350); break;
    case 'emcon': tone(700, 0.12, 'triangle', 0.04, 350); break;
    case 'jam': noise(0.8, 0.04, 6000); break;
    case 'ident': tone(1100, 0.06, 'triangle', 0.025, 700); break;
    case 'raid': for (let i = 0; i < 2; i++) { tone(587, 0.25, 'sawtooth', 0.05, 587, i * 0.5); tone(440, 0.25, 'sawtooth', 0.05, 440, i * 0.5 + 0.25); } break;
    case 'package': tone(494, 0.18, 'sawtooth', 0.04, 494); tone(392, 0.25, 'sawtooth', 0.04, 392, 0.2); break;
    case 'raidStart': tone(300, 0.9, 'sawtooth', 0.05, 900); tone(900, 0.9, 'sawtooth', 0.05, 300, 0.9); break; // air-raid siren
    case 'raidLeak': tone(330, 0.3, 'square', 0.05, 110); tone(220, 0.4, 'square', 0.05, 80, 0.3); break;
    case 'raidClear': [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.15, 'square', 0.04, f, i * 0.07)); break;
    case 'over': [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.06, f * 0.9, i * 0.22)); break;
  }
}
