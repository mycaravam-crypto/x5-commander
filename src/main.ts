import { newGame, dailySeed, parseCode, parseResult, update, buy, collectDrop, takeSkill, undoSkills, openTree, closeTree, markAt, placePad, movePad, selectPad, upgradePad, buyMod, sellPad, skipBuild, building, toggleRelocate, cycleMode, cycleDiscipline, cycleRadarMode, aimFocus, emergencyIntercept, toggleEmcon, type State } from './sim.ts';
import { createRenderer } from './render.ts';
import { createHud, loadBest, boardAdd } from './hud.ts';
import { DOCTRINES, BUILD_SLOW, PERF } from './config.ts';
import * as sfx from './sfx.ts';

// Last doctrine picked, if it's still unlocked.
const savedDoctrine = () => { try { return localStorage.getItem('x5-doctrine') ?? ''; } catch { return ''; } };
const openDoc = (id: string) => DOCTRINES.find(d => d.id === id)?.unlock(loadBest()) ? id : 'standard';
let s: State = newGame(undefined, '', openDoc(savedDoctrine()));
// No WebGL 2 (or the GPU gave up): say so instead of leaving a blank page.
const fatal = (msg: string) => {
  const o = document.getElementById('overlay')!;
  o.innerHTML = `<div class="card"><h2>DISPLAY FAULT</h2><p>${msg}</p><button class="btn" onclick="location.reload()">RELOAD</button></div>`;
  o.classList.add('on');
};
let view: ReturnType<typeof createRenderer>, lost = false;
try { view = createRenderer(); } catch (err) {
  fatal('This browser could not start WebGL 2. Update the browser or turn on hardware acceleration.');
  throw err;
}
document.querySelector('canvas')!.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  lost = true;
  fatal('The graphics context was lost (the device ran short of GPU memory).');
});

const today = () => new Date().toISOString().slice(0, 10);
const start = (mode?: 'daily' | 'training' | 'ground' | 'horde') => {
  if (s.phase !== 'start') return;
  sfx.unlock();
  if (mode === 'daily') s = newGame(dailySeed(today()), today());
  if (mode === 'training') s = newGame(undefined, '', 'standard', true);
  if (mode === 'ground') s = newGame(s.seed, '', 'standard', false, true); // same map, walkers instead of aircraft
  if (mode === 'horde') s = newGame(s.seed, '', 'standard', false, true, true); // straight to THE TIDE
  s.phase = 'play';
  if (s.ground) view.lookAt(0, -14); // the line, not the base: everything comes from the north
};
const restart = () => {
  s = s.training ? newGame(undefined, '', 'standard', true) : s.daily ? newGame(dailySeed(s.daily), s.daily) : s.ground ? newGame(undefined, '', 'standard', false, true, s.horde) : newGame(undefined, '', s.doctrine);
  s.phase = 'play';
  if (s.ground) view.lookAt(0, -14);
};
// Back to the start screen: a fresh map, the last doctrine picked.
const menu = () => { if (s.phase === 'pause' || s.phase === 'over') s = newGame(undefined, '', openDoc(savedDoctrine())); };
const doctrine = (i: number) => {
  const d = DOCTRINES[i];
  if (s.phase !== 'start' || !d || openDoc(d.id) !== d.id) return;
  try { localStorage.setItem('x5-doctrine', d.id); } catch { /* storage blocked: skip */ }
  s = newGame(s.seed, '', d.id); // same map, new loadout
};
// Start screen: load a friend's seed code (or their whole result line) to fly the same map and raids. A daily op's
// result line also puts their time on that day's board, to beat.
function playCode() {
  if (s.phase !== 'start') return;
  const text = prompt('Paste a seed code (X5-…) or a friend\'s result line:');
  const c = text ? parseCode(text) : null;
  if (!c) { if (text) alert('No seed code found in that.'); return; }
  if (c.kind === 'run') { s = newGame(c.seed, '', openDoc(c.doctrine), false, c.ground, c.horde); return; } // a ground assault's code loads that mode
  const r = parseResult(text!);
  if (r) boardAdd(c.daily, { time: r.time, kills: r.kills, who: 'RIVAL' });
  s = newGame(dailySeed(c.daily), c.daily);
}
// Start screen: roll another map (and schedule) for a normal run.
const reroll = () => { if (s.phase === 'start') s = newGame(undefined, '', s.doctrine); };
const hud = createHud({
  buy: id => { if (buy(s, id)) hud.flash(id); },
  skill: id => takeSkill(s, id),
  undoSkills: () => undoSkills(s),
  closeTree: () => closeTree(s),
  pad: act => { if (act === 'upgrade') upgradePad(s); else if (act === 'move') toggleRelocate(s); else if (act.startsWith('mod:')) buyMod(s, act.slice(4)); else sellPad(s); },
  look: (x, z) => view.lookAt(x, z),
  resume: () => { if (s.phase === 'pause') s.phase = 'play'; },
  setting: (k, v) => { if (k === 'cov') setCov(v); else if (k === 'sfx' || k === 'music') sfx.setVolume(k, v); },
  settings: () => ({ ...sfx.volume, cov }),
  code: playCode,
  start, restart, menu, doctrine,
});
// Coverage overlay: off, faint (to leave on) or full; cycled with [O] and remembered between runs.
let cov = (() => { try { return +(localStorage.getItem('x5-cov') ?? 0) % 3 || 0; } catch { return 0; } })();
function setCov(m: number) {
  cov = m % 3; view.setCoverage(cov); hud.coverage(cov);
  try { localStorage.setItem('x5-cov', String(cov)); } catch { /* storage blocked: skip */ }
}
setCov(cov);

// ---- input ----
const canvas = document.querySelector('canvas')!;
const tap = (cx: number, cy: number) => {
  const p = view.pick(cx, cy);
  if (!p || s.phase !== 'play') return;
  // Building: the click says where. A move order: where the picked unit goes. Else recover salvage, else pick a unit, else mark a contact.
  if (s.placing) { placePad(s, p.x, p.z); return; }
  if (s.relocating) { movePad(s, p.x, p.z); return; }
  if (collectDrop(s, p.x, p.z)) return; // salvage on the ground
  if (selectPad(s, p.x, p.z)) return;
  const c = view.pickContact(s, cx, cy) ?? p; // aircraft are drawn above their ground position
  markAt(s, c.x, c.z); aimFocus(s, p.x, p.z);
};
// Mouse: left click acts, right-drag rotates (a right click without a drag moves the picked unit), middle-drag pans.
let drag: { b: number; x: number; y: number; moved: number } | null = null;
canvas.addEventListener('mousedown', e => {
  if (e.button === 0) tap(e.clientX, e.clientY);
  else drag = { b: e.button, x: e.clientX, y: e.clientY, moved: 0 };
});
addEventListener('mousemove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
  if (drag.b === 2) view.rotate(dx * 0.008); else view.pan(dx, dy);
});
addEventListener('mouseup', e => {
  if (drag?.b === 2 && drag.moved < 5 && s.phase === 'play' && s.selected >= 0) { const p = view.pick(e.clientX, e.clientY); if (p) movePad(s, p.x, p.z); }
  drag = null;
});
canvas.addEventListener('mousemove', e => view.hover(e.clientX, e.clientY));
canvas.addEventListener('mouseleave', () => view.hover(null));

// Touch: tap acts, one-finger drag pans, two fingers pinch to zoom and twist to rotate.
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
  if (fingers.size === 1) { travel += Math.abs(e.clientX - f.x) + Math.abs(e.clientY - f.y); if (travel > 12) view.pan(e.clientX - f.x, e.clientY - f.y); }
  else {
    const [a, b] = [...fingers.values()], d0 = Math.hypot(a.x - b.x, a.y - b.y), a0 = Math.atan2(b.y - a.y, b.x - a.x);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    f.x = e.clientX; f.y = e.clientY;
    const d1 = Math.hypot(a.x - b.x, a.y - b.y), a1 = Math.atan2(b.y - a.y, b.x - a.x);
    if (d0 > 0) view.zoomBy(d1 / d0);
    view.rotate(((a1 - a0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    view.pan((a.x + b.x) / 2 - mx, (a.y + b.y) / 2 - my);
  }
  f.x = e.clientX; f.y = e.clientY;
});
const lift = (e: PointerEvent) => {
  if (fingers.delete(e.pointerId) && !fingers.size && travel < 12 && e.type === 'pointerup') tap(e.clientX, e.clientY);
};
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); view.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });

// Compact (phone) HUD: the minimap and the details list are toggled from #views, remembered across runs.
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
    case 'Enter': if (s.phase === 'over' && s.training) menu(); else if (s.phase === 'tree') closeTree(s); else start(); break;
    case 'KeyK': if (s.phase === 'tree') closeTree(s); else openTree(s); break;
    case 'KeyG': cycleDiscipline(s); break;
    case 'KeyU': upgradePad(s); break;
    case 'KeyN': if (s.phase === 'start') reroll(); else skipBuild(s); break;
    case 'KeyB': toggleRelocate(s); break;
    case 'Delete': case 'Backspace': sellPad(s); break;
    case 'KeyD': start('daily'); break;
    case 'KeyA': start('ground'); break; // start screen only (in play, A pans)
    case 'KeyH': start('horde'); break; // start screen only
    case 'KeyP': case 'Escape': if (s.phase === 'play') s.phase = 'pause'; else if (s.phase === 'pause') s.phase = 'play'; else if (s.phase === 'tree') closeTree(s); break;
    case 'KeyT': if (s.phase === 'start') start('training'); else cycleMode(s); break;
    case 'KeyF': toggleEmcon(s); break;
    case 'KeyV': cycleRadarMode(s); break;
    case 'KeyM': sfx.toggleMute(); break;
    case 'KeyS': playCode(); break; // start screen only (in play, S pans)
    case 'KeyR': if (s.phase === 'over') restart(); break;
    case 'KeyC': if (s.phase === 'over') hud.share(); break;
    case 'KeyX': speed = 3 - speed; break;
    case 'KeyO': setCov(cov + 1); break;
    case 'Tab': hud.toggleShop(); break;
    case 'UiMap': panel('map'); break;
    case 'UiInfo': panel('info'); break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': if (s.phase === 'start') doctrine(+code.slice(5) - 1); break;
  }
}
const held = new Set<string>();
addEventListener('keyup', e => held.delete(e.code));
addEventListener('keydown', e => {
  // Typing a callsign or password: the keys are letters, not commands (Enter submits the form).
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  held.add(e.code);
  if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (!e.repeat) key(e.code);
});
// On-screen buttons (touch screens) send the same codes as the keys.
const press = (e: MouseEvent) => { const k = (e.target as Element).closest<HTMLElement>('[data-k]')?.dataset.k; if (k) key(k); };
document.getElementById('touch')!.onclick = press;
document.getElementById('views')!.onclick = press;
document.getElementById('top')!.onclick = press; // BATTERY LV opens the command tree
document.getElementById('raidcard')!.onclick = press; // the level card's START NOW
addEventListener('blur', () => { if (s.phase === 'play') s.phase = 'pause'; });

// Dev builds only: poke the running game from the console, e.g. x5().nextRaid = x5().t + 12, or x5run(30) to play 30 s at once.
if (import.meta.env.DEV) Object.assign(window, { x5: () => s, x5run: (secs: number) => { for (let i = 0; i < secs * 60 && s.phase === 'play'; i++) { s.events.length = 0; update(s, 1 / 60); } } });

// Dev builds only: where the frame time goes. x5perf() gives the mean ms per frame of sim, render and HUD over the
// last second; x5perf(true) logs it every second, x5perf(false) stops.
const perf = { sim: 0, render: 0, hud: 0, frames: 0, since: 0, log: false, last: {} as Record<string, string> };
const clockMs = import.meta.env.DEV ? () => performance.now() : () => 0;
if (import.meta.env.DEV) Object.assign(window, { x5perf: (log?: boolean) => { if (log !== undefined) perf.log = log; return perf.last; } });
function perfFrame(now: number, sim: number, render: number, hud: number) {
  perf.sim += sim; perf.render += render; perf.hud += hud; perf.frames++;
  if (now - perf.since < 1000) return;
  const n = perf.frames || 1, ms = (v: number) => (v / n).toFixed(2);
  perf.last = { fps: (perf.frames * 1000 / (now - perf.since)).toFixed(0), sim: ms(perf.sim), render: ms(perf.render), hud: ms(perf.hud), enemies: String(s.enemies.length) };
  if (perf.log) console.log('x5perf', perf.last);
  perf.sim = perf.render = perf.hud = perf.frames = 0; perf.since = now;
}

// ---- loop ----
// The sim ticks at a fixed PERF.step whatever the refresh rate (as the tests and the balance bots run it), so a
// 30 fps phone and a 144 Hz monitor play the same game; the render draws the latest state once a frame.
let last = performance.now(), simAcc = 0;
function frame(now: number) {
  if (lost) return; // the loop stops; the fault card offers a reload
  const dt = Math.min(0.05, (now - last) / 1000); // a stalled tab doesn't dump seconds of sim into one frame
  last = now;
  if (held.has('KeyQ')) view.rotate(-dt * 1.5);
  if (held.has('KeyE')) view.rotate(dt * 1.5);
  if (s.phase === 'play' || s.phase === 'pause') { // WASD / arrows pan the camera over the ground
    const k = dt * 40, ax = +(held.has('KeyD') || held.has('ArrowRight')) - +(held.has('KeyA') || held.has('ArrowLeft'));
    const ay = +(held.has('KeyW') || held.has('ArrowUp')) - +(held.has('KeyS') || held.has('ArrowDown'));
    if (ax || ay) view.pan(ax * k, ay * k, false);
  }
  const sweep0 = s.sweepA, t0 = clockMs();
  // 2× speed banks twice the time; the build window runs slower, so there's time to place things.
  // A tick due within PERF.slack of a step runs now (the time is paid back next frame), so the usual jitter in
  // frame times at 60 Hz doesn't turn into frames with no tick and frames with two.
  simAcc = s.phase === 'play' ? Math.min(simAcc + dt * speed, PERF.step * PERF.maxSteps) : 0;
  while (simAcc >= PERF.step * (1 - PERF.slack)) { simAcc -= PERF.step; update(s, PERF.step * (building(s) ? BUILD_SLOW : 1)); }
  const t1 = clockMs();
  if (s.sweepA < sweep0) sfx.play('ping'); // sweep completed a revolution
  for (const e of s.events) sfx.play(e.k, e as Parameters<typeof sfx.play>[1]);
  // Music: calm in the build window, driving with a raid on.
  sfx.music(s.phase === 'play' || s.phase === 'pause' || s.phase === 'tree', building(s) ? 0 : s.raidLeft || s.raid ? 1 : 0.45);
  view.inset(...hud.insets());
  view.render(s, dt, s.phase === 'play' ? simAcc * (building(s) ? BUILD_SLOW : 1) : 0);
  const t2 = clockMs();
  hud.update(s, dt, view.cameraYaw(), view.project, speed, view.target());
  if (import.meta.env.DEV) perfFrame(now, t1 - t0, t2 - t1, clockMs() - t2);
  s.events.length = 0;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
