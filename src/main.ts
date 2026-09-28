import { newGame, dailySeed, update, buy, pickPerk, markAt, placePad, cycleMode, toggleEmcon, type State } from './sim.ts';
import { createRenderer } from './render.ts';
import { createHud } from './hud.ts';
import * as sfx from './sfx.ts';

let s: State = newGame();
const view = createRenderer();

const today = () => new Date().toISOString().slice(0, 10);
const start = (daily = false) => {
  if (s.phase !== 'start') return;
  sfx.unlock();
  if (daily) s = newGame(dailySeed(today()), today());
  s.phase = 'play';
};
const restart = () => { s = s.daily ? newGame(dailySeed(s.daily), s.daily) : newGame(); s.phase = 'play'; };
const hud = createHud({
  buy: id => { if (buy(s, id)) hud.flash(id); },
  perk: i => pickPerk(s, i),
  start, restart,
});

// ---- input ----
const canvas = document.querySelector('canvas')!;
let dragX: number | null = null;
canvas.addEventListener('mousedown', e => {
  if (e.button === 2) { dragX = e.clientX; return; }
  const p = view.pick(e.clientX, e.clientY);
  if (p && s.phase === 'play' && !placePad(s, p.x, p.z)) markAt(s, p.x, p.z);
});
addEventListener('mousemove', e => { if (dragX !== null) { view.rotate((e.clientX - dragX) * 0.008); dragX = e.clientX; } });
addEventListener('mouseup', () => { dragX = null; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); view.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });

const held = new Set<string>();
addEventListener('keyup', e => held.delete(e.code));
addEventListener('keydown', e => {
  held.add(e.code);
  if (e.repeat) return;
  switch (e.code) {
    case 'Space': case 'Enter': start(); break;
    case 'KeyD': start(true); break;
    case 'KeyP': case 'Escape': if (s.phase === 'play') s.phase = 'pause'; else if (s.phase === 'pause') s.phase = 'play'; break;
    case 'KeyT': cycleMode(s); break;
    case 'KeyF': toggleEmcon(s); break;
    case 'KeyM': sfx.toggleMute(); break;
    case 'KeyR': if (s.phase === 'over') restart(); break;
    case 'Tab': e.preventDefault(); hud.toggleShop(); break;
    case 'Digit1': case 'Digit2': case 'Digit3': pickPerk(s, +e.code.slice(5) - 1); break;
  }
});
addEventListener('blur', () => { if (s.phase === 'play') s.phase = 'pause'; });

// ---- loop ----
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (held.has('KeyQ')) view.rotate(-dt * 1.5);
  if (held.has('KeyE')) view.rotate(dt * 1.5);
  const sweep0 = s.sweepA;
  update(s, dt);
  if (s.sweepA < sweep0) sfx.play('ping'); // sweep completed a revolution
  for (const e of s.events) sfx.play(e.k);
  view.render(s, dt);
  hud.update(s, dt, view.cameraYaw(), view.project);
  s.events.length = 0;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
