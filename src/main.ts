import { newGame, dailySeed, update, buy, pickPerk, markAt, placePad, movePad, selectPad, upgradePad, sellPad, cycleMode, cycleDiscipline, cycleRadarMode, aimFocus, emergencyIntercept, toggleEmcon, type State } from './sim.ts';
import { createRenderer } from './render.ts';
import { createHud, loadBest } from './hud.ts';
import { DOCTRINES } from './config.ts';
import * as sfx from './sfx.ts';

// Last doctrine picked, if it's still unlocked.
const savedDoctrine = () => { try { return localStorage.getItem('x5-doctrine') ?? ''; } catch { return ''; } };
const openDoc = (id: string) => DOCTRINES.find(d => d.id === id)?.unlock(loadBest()) ? id : 'standard';
let s: State = newGame(undefined, '', openDoc(savedDoctrine()));
const view = createRenderer();

const today = () => new Date().toISOString().slice(0, 10);
const start = (daily = false) => {
  if (s.phase !== 'start') return;
  sfx.unlock();
  if (daily) s = newGame(dailySeed(today()), today());
  s.phase = 'play';
};
const restart = () => { s = s.daily ? newGame(dailySeed(s.daily), s.daily) : newGame(undefined, '', s.doctrine); s.phase = 'play'; };
const doctrine = (i: number) => {
  const d = DOCTRINES[i];
  if (s.phase !== 'start' || !d || openDoc(d.id) !== d.id) return;
  try { localStorage.setItem('x5-doctrine', d.id); } catch { /* storage blocked: skip */ }
  s = newGame(undefined, '', d.id);
};
const hud = createHud({
  buy: id => { if (buy(s, id)) hud.flash(id); },
  perk: i => pickPerk(s, i),
  pad: act => { if (act === 'upgrade') upgradePad(s); else sellPad(s); },
  start, restart, doctrine,
});

// ---- input ----
const canvas = document.querySelector('canvas')!;
let dragX: number | null = null;
const tap = (cx: number, cy: number) => {
  const p = view.pick(cx, cy);
  // Place a bought pad, else move the picked unit to a free slot, else pick a unit, else mark a contact.
  if (!p || s.phase !== 'play' || placePad(s, p.x, p.z) || movePad(s, p.x, p.z) || selectPad(s, p.x, p.z)) return;
  markAt(s, p.x, p.z); aimFocus(s, p.x, p.z);
};
canvas.addEventListener('mousedown', e => { if (e.button === 2) dragX = e.clientX; else tap(e.clientX, e.clientY); });

// Touch: tap marks / places, one-finger drag rotates, pinch zooms.
const fingers = new Map<number, { x: number; y: number }>();
let travel = 0;
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  e.preventDefault(); // no emulated mouse events on top
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  travel = fingers.size > 1 ? Infinity : 0;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  const f = fingers.get(e.pointerId);
  if (!f) return;
  if (fingers.size === 1) { travel += Math.abs(e.clientX - f.x) + Math.abs(e.clientY - f.y); view.rotate((e.clientX - f.x) * 0.008); }
  else {
    const [a, b] = [...fingers.values()], d0 = Math.hypot(a.x - b.x, a.y - b.y);
    f.x = e.clientX; f.y = e.clientY;
    const d1 = Math.hypot(a.x - b.x, a.y - b.y);
    if (d0 > 0) view.zoomBy(d1 / d0);
  }
  f.x = e.clientX; f.y = e.clientY;
});
const lift = (e: PointerEvent) => {
  if (fingers.delete(e.pointerId) && !fingers.size && travel < 12 && e.type === 'pointerup') tap(e.clientX, e.clientY);
};
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);
addEventListener('mousemove', e => { if (dragX !== null) { view.rotate((e.clientX - dragX) * 0.008); dragX = e.clientX; } });
addEventListener('mouseup', () => { dragX = null; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); view.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });

// Compact (phone) HUD: the mini radar and the details list are toggled from #views, remembered across runs.
const panel = (k: string, on = !document.body.classList.contains(`ui-${k}`)) => {
  document.body.classList.toggle(`ui-${k}`, on);
  try { localStorage.setItem(`x5-ui-${k}`, on ? '1' : ''); } catch { /* storage blocked: skip */ }
};
const saved = (k: string, dflt: boolean) => { try { const v = localStorage.getItem(`x5-ui-${k}`); return v === null ? dflt : !!v; } catch { return dflt; } };
panel('map', saved('map', true)); panel('info', saved('info', false));

let speed = 1; // 2 = fast-forward: two sim steps per frame
function key(code: string) {
  switch (code) {
    case 'Space': if (s.phase === 'start') start(); else emergencyIntercept(s); break;
    case 'Enter': start(); break;
    case 'KeyG': cycleDiscipline(s); break;
    case 'KeyU': upgradePad(s); break;
    case 'Delete': case 'Backspace': sellPad(s); break;
    case 'KeyD': start(true); break;
    case 'KeyP': case 'Escape': if (s.phase === 'play') s.phase = 'pause'; else if (s.phase === 'pause') s.phase = 'play'; break;
    case 'KeyT': cycleMode(s); break;
    case 'KeyF': toggleEmcon(s); break;
    case 'KeyV': cycleRadarMode(s); break;
    case 'KeyM': sfx.toggleMute(); break;
    case 'KeyR': if (s.phase === 'over') restart(); break;
    case 'KeyC': if (s.phase === 'over') hud.share(); break;
    case 'KeyX': speed = 3 - speed; break;
    case 'KeyO': hud.coverage(view.toggleCoverage()); break;
    case 'Tab': hud.toggleShop(); break;
    case 'UiMap': panel('map'); break;
    case 'UiInfo': panel('info'); break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': {
      const i = +code.slice(5) - 1;
      if (s.phase === 'start') doctrine(i); else pickPerk(s, i);
      break;
    }
  }
}
const held = new Set<string>();
addEventListener('keyup', e => held.delete(e.code));
addEventListener('keydown', e => {
  held.add(e.code);
  if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
  if (!e.repeat) key(e.code);
});
// On-screen buttons (touch screens) send the same codes as the keys.
const press = (e: MouseEvent) => { const k = (e.target as Element).closest<HTMLElement>('[data-k]')?.dataset.k; if (k) key(k); };
document.getElementById('touch')!.onclick = press;
document.getElementById('views')!.onclick = press;
addEventListener('blur', () => { if (s.phase === 'play') s.phase = 'pause'; });

// Dev builds only: poke the running game from the console, e.g. x5().nextRaid = x5().t + 12.
if (import.meta.env.DEV) Object.assign(window, { x5: () => s });

// ---- loop ----
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (held.has('KeyQ')) view.rotate(-dt * 1.5);
  if (held.has('KeyE')) view.rotate(dt * 1.5);
  const sweep0 = s.sweepA;
  for (let i = 0; i < speed; i++) update(s, dt);
  if (s.sweepA < sweep0) sfx.play('ping'); // sweep completed a revolution
  for (const e of s.events) sfx.play(e.k);
  view.inset(...hud.insets());
  view.render(s, dt);
  hud.update(s, dt, view.cameraYaw(), view.project, speed);
  s.events.length = 0;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
