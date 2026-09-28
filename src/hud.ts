import { ARENA_R, BASE_R, PLACE_TIME, baseLevelInfo, DOCTRINES, PACKAGES, OBJECTIVES, RAID_PRESS, DISCIPLINES, INTERCEPT, COMBO_BONUS, COMBO_CAP, COMBO_WINDOW, ENEMIES, MODES, PAL, PERKS, UPGRADES, bearing, perimSlots } from './config.ts';
import type { Records } from './config.ts';
import { cost, emitting, slots, backupSearching, focusBearing, radarMode, radarRange, radarSector, interceptActive, interceptBlock, lockReason, phase, phaseName, shownKind, visible, type Enemy, type State } from './sim.ts';

const $ = (id: string) => document.getElementById(id)!;
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
const pad3 = (n: number) => String(Math.round(n)).padStart(3, '0');
const tag = (e: Enemy) => `TN${pad3(e.id % 1000)} ${ENEMIES[shownKind(e)].code}`; // track number + type
const rgba = (c: number, a = 1) => `rgba(${c >> 16},${c >> 8 & 255},${c & 255},${a})`;
const BOOT = ['PATRIOT BATTERY X5 EMPLACED', 'EPP-III POWER ..... OK', 'AN/MPQ-65 RADIATING', 'ECS FIRE CONTROL .. OK', 'PAC-3 MSE ON THE RAIL', 'WEAPONS FREE'];
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

type Project = (x: number, z: number, y?: number) => readonly [number, number];
type Best = Records;
export function loadBest(): Best {
  try { return JSON.parse(localStorage.getItem('x5-best')!) ?? { time: 0, kills: 0, level: 0, earned: 0 }; }
  catch { return { time: 0, kills: 0, level: 0, earned: 0 }; }
}

type Daily = { date: string; time: number; kills: number };
function loadDaily(date: string): Daily {
  try { const d = JSON.parse(localStorage.getItem('x5-daily')!); if (d?.date === date) return d; } catch { /* storage blocked */ }
  return { date, time: 0, kills: 0 };
}

// One-time tips, shown the first time each thing happens (remembered across runs).
const TIPS: Record<string, string> = {
  start: 'Click a contact to make it the priority target: engaged first, +25% damage, costs power while held. Spend credits in the shop [Tab].',
  discipline: 'Fire discipline [G]: CONSERVE saves interceptors and fires late, MAXIMUM fires fast and overkills.',
  intercept: 'Emergency intercept: every weapon on one threat for a few seconds. Long cooldown, costs power.',
  raid: 'Raid inbound: you have a few seconds to prepare. Set radar, fire discipline and priority before it arrives. Hold the objective for the bonus and a recovery lull; lose it and the next raid comes sooner.',
  warning: 'Su-34s are tough and fire anti-radiation missiles at a radiating radar. Click one to focus fire on it.',
  arm: 'ARM launch: it homes on your radar. [F] EMCON before it gets close (you lose every lock), or [V] to LPI: ARMs only find you inside 15m.',
  radarMode: 'Radar mode [V]: ACTIVE all round · FOCUSED searches the bearing you click, further and faster, but draws ARMs · LPI is hard for ARMs to find but sees less.',
  tbm: 'Ballistic missile: only PAC-3 can hit it. Keep interceptors in stock and a lock slot free.',
  jam: 'Jammer on station: detection drops in the amber sector. The Mi-8 itself shows clearly, so click it and kill it.',
  ident: 'Decoy classified and released. Decoys look like Shaheds until locked for a moment. GaN T/R Modules classify faster.',
  package: 'Attack package: several types covering each other. The log says which element to kill first; mark it.',
  level: 'Base level up: every level builds something that changes what the battery can do, plus a launcher and 2 perimeter pads. Pads fire on their own, without lock slots.',
};
const seenTips = (() => { try { return new Set<string>(JSON.parse(localStorage.getItem('x5-tips') ?? '[]')); } catch { return new Set<string>(); } })();

// One line to paste in a chat.
export const resultLine = (s: State) => `X5 COMMANDER · ${s.daily ? `DAILY OP ${s.daily}` : `${DOCTRINES.find(d => d.id === s.doctrine)!.name} RUN`} · ${clock(s.t)} · ${fmt(s.kills)} kills · lv ${s.level} · ${s.stats.clean}/${s.stats.raids} clean raids`;

const docsHtml = (s: State, best: Best) => DOCTRINES.map((d, i) => {
  const open = d.unlock(best);
  return `<button class="perk frame${d.id === s.doctrine ? ' sel' : ''}${open ? '' : ' locked'}" data-a="doc${i}"><b>${d.name}</b><span>${open ? d.desc : `LOCKED · ${d.need}`}</span><kbd>[${i + 1}]</kbd></button>`;
}).join('');

function debrief(s: State) {
  const S = s.stats, total = Object.values(S.dmg).reduce((a, b) => a + b, 0) || 1;
  const kills = (Object.entries(S.kills) as [keyof typeof ENEMIES, number][]).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<dt>${ENEMIES[k].code}</dt><dd>${fmt(n)}</dd>`).join('');
  const dmg = Object.entries(S.dmg).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<dt>${k}</dt><dd>${Math.round(n / total * 100)}%</dd>`).join('');
  return `<div class="debrief"><div><small>KILLS</small><dl>${kills || '<dt>none</dt>'}</dl></div><div><small>DAMAGE</small><dl>${dmg || '<dt>none</dt>'}</dl></div>
    <div><small>OPS</small><dl><dt>RAIDS CLEAN</dt><dd>${S.clean} / ${S.raids}</dd><dt>ARMS EVADED</dt><dd>${S.armsEvaded}</dd><dt>RADAR HITS</dt><dd>${S.radarHits}</dd></dl></div></div>`;
}

export function createHud(actions: { buy(id: string): void; perk(i: number): void; start(daily?: boolean): void; restart(): void; doctrine(i: number): void }) {
  for (const [k, v] of Object.entries(PAL)) document.documentElement.style.setProperty(`--${k}`, rgba(v));

  // ---- shop (built once) ----
  const shop = $('shop'), rows = new Map<string, HTMLButtonElement>();
  let group = '';
  for (const u of UPGRADES) {
    if (u.group !== group) shop.insertAdjacentHTML('beforeend', `<h4>${group = u.group}</h4>`);
    const b = document.createElement('button');
    b.innerHTML = `<span>${u.name}</span><span class="lv"></span><span class="c"></span><span class="d">${u.desc}</span>`;
    b.onclick = () => actions.buy(u.id);
    shop.append(b); rows.set(u.id, b);
  }

  if (matchMedia('(pointer: coarse)').matches) shop.classList.add('hidden'); // phones: map first, shop on demand

  // ---- overlay ----
  const overlay = $('overlay');
  overlay.onclick = e => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'start') actions.start();
    else if (a === 'daily') actions.start(true);
    else if (a?.startsWith('doc')) actions.doctrine(+a.slice(3));
    else if (a === 'restart') actions.restart();
    else if (a === 'share') share();
    else if (a?.startsWith('perk')) actions.perk(+a.slice(4));
  };
  let shownPhase = '', shownDoc = '';
  function showOverlay(s: State) {
    const key = s.phase + s.perkChoices.join();
    // Doctrine picks only redraw their row, so the boot text doesn't replay.
    if (key === shownPhase && s.phase === 'start' && s.doctrine !== shownDoc) { shownDoc = s.doctrine; overlay.querySelector('.docs')!.innerHTML = docsHtml(s, loadBest()); }
    if (key === shownPhase) return;
    shownDoc = s.doctrine;
    shownPhase = key;
    const best = loadBest();
    let html = '';
    const D = 0.35; // s per boot line
    if (s.phase === 'start') html = `<div class="card"><h1>X5 COMMANDER</h1>
      <div class="boot">${BOOT.map((l, i) => `<p style="--n:${l.length + 2};--d:${i * D}s">&gt; ${l}</p>`).join('')}</div>
      <div class="later" style="--d:${BOOT.length * D}s"><p class="dim">SCAN · DETECT · LOCK · ENGAGE · EXPAND</p><br>
      <p>Your radar decides what exists. Undetected tracks can't be engaged.</p>
      <p>Locked targets get fired on automatically. <b>Click</b> a contact to force priority.</p>
      <p>Spend credits on the right. Every few upgrades the battery gets another launcher and you draft a <b class="hot">perk</b>.</p>
      <p>Power feeds radar, reloads, laser and HPM — run dry and the sweep slows.</p>
      <p>Anti-radiation missiles <span class="alert">home on your radar</span>. <b>[F] EMCON</b> goes silent so they miss, but you lose every lock.</p>
      ${best.time ? `<p class="dim">BEST · ${clock(best.time)} · ${fmt(best.kills)} kills · base lv ${best.level}</p>` : ''}
      <p class="dim">DOCTRINE · starting loadout, unlocked by your records</p><div class="perks docs">${docsHtml(s, best)}</div>
      <button class="btn" data-a="start">DEPLOY [SPACE]</button> <button class="btn" data-a="daily">DAILY OP [D]</button>
      <p class="dim">Daily op: same raid for everyone today. ${(d => d.time ? `Your best today · ${clock(d.time)} · ${fmt(d.kills)} kills` : 'Not flown yet today.')(loadDaily(new Date().toISOString().slice(0, 10)))}</p></div></div>`;
    else if (s.phase === 'pause') html = `<div class="card"><h2>PAUSED</h2><p class="dim">[P] resume</p></div>`;
    else if (s.phase === 'perk') html = `<div class="card"><h2>BATTERY LEVEL ${s.level} · ${baseLevelInfo(s.level).name}</h2><p class="hot">${baseLevelInfo(s.level).desc}</p>${s.level > 1 ? `<p class="dim">+1 M903 LAUNCHER · ${perimSlots(s.level)} PERIMETER PADS</p>` : ''}<h2>CHOOSE A PERK</h2><div class="perks">${
      s.perkChoices.map((id, i) => { const p = PERKS.find(p => p.id === id)!; return `<button class="perk frame${p.rule ? ' rule' : ''}" data-a="perk${i}">${p.rule ? '<i>★ NEW RULE</i>' : ''}<b>${p.name}</b><span>${p.desc}</span><kbd>[${i + 1}]</kbd></button>`; }).join('')
    }</div></div>`;
    else if (s.phase === 'over') {
      const now = { time: s.t, kills: s.kills, level: s.level, earned: s.earned };
      const rec = (k: keyof Best) => now[k] > best[k];
      const merged = Object.fromEntries(Object.keys(now).map(k => [k, Math.max(now[k as keyof Best], best[k as keyof Best])]));
      try { localStorage.setItem('x5-best', JSON.stringify(merged)); } catch { /* storage blocked: skip */ }
      const row = (label: string, k: keyof Best, f: (n: number) => string) =>
        `<small>${label}</small><b class="${rec(k) ? 'new' : ''}">${f(now[k])}${rec(k) ? ' ★' : ''}</b><span class="dim">best ${f(Math.max(now[k], best[k]))}</span>`;
      let daily = '';
      if (s.daily) {
        const d = loadDaily(s.daily), rec = s.t > d.time;
        if (rec) try { localStorage.setItem('x5-daily', JSON.stringify({ date: s.daily, time: s.t, kills: s.kills })); } catch { /* storage blocked: skip */ }
        daily = `<p class="${rec ? 'hot' : 'dim'}">DAILY OP ${s.daily} · ${rec ? 'NEW BEST TODAY ★' : `today's best ${clock(d.time)}`}</p>`;
      }
      const unlocked = DOCTRINES.filter(d => !d.unlock(best) && d.unlock(merged as Best)).map(d => `<p class="hot">DOCTRINE UNLOCKED · ${d.name}</p>`).join('');
      html = `<div class="card"><h1 class="alert">BATTERY LOST</h1>${daily}${unlocked}
        <div class="score">${row('SURVIVED', 'time', clock)}${row('KILLS', 'kills', fmt)}${row('BASE LEVEL', 'level', String)}${row('CREDITS EARNED', 'earned', fmt)}</div>
        ${debrief(s)}
        <p class="dim">perks: ${s.perks.map(id => PERKS.find(p => p.id === id)!.name).join(' · ') || 'none'}</p>
        <button class="btn" data-a="restart">REDEPLOY [R]</button> <button class="btn" data-a="share">COPY RESULT [C]</button></div>`;
    }
    overlay.innerHTML = html;
    overlay.classList.toggle('on', !!html);
  }

  let lastState: State | null = null;
  function share() {
    if (!lastState) return;
    const text = resultLine(lastState), btn = overlay.querySelector<HTMLElement>('[data-a=share]');
    navigator.clipboard.writeText(text).then(() => { if (btn) btn.textContent = 'COPIED ✓'; }, () => prompt('Copy your result:', text));
  }

  // ---- tips ----
  const tipEl = $('tip');
  let tipUntil = 0;
  function tip(k: string, t: number) {
    if (!TIPS[k] || seenTips.has(k)) return;
    seenTips.add(k);
    try { localStorage.setItem('x5-tips', JSON.stringify([...seenTips])); } catch { /* storage blocked: skip */ }
    tipEl.textContent = TIPS[k]; tipEl.classList.add('on'); tipUntil = t + 9;
  }

  // ---- banner + popups ----
  const banner = $('banner');
  const say = (text: string, cls: string) => {
    banner.textContent = text; banner.className = cls;
    void banner.offsetWidth; banner.classList.add('go');
  };
  const popups = Array.from({ length: 32 }, () => $('popups').appendChild(document.createElement('div')));
  let nextPop = 0;
  const pop = (project: Project, x: number, z: number, text: string, cls: string) => {
    const el = popups[nextPop = (nextPop + 1) % popups.length], [px, py] = project(x, z);
    el.textContent = text; el.style.left = `${px}px`; el.style.top = `${py}px`;
    el.className = cls; void el.offsetWidth; el.classList.add('go');
  };

  // ---- mini radar: same look as the main view. Afterglow comes from fading the last frame instead of clearing it. ----
  const cv = $('radar') as HTMLCanvasElement, g = cv.getContext('2d')!;
  const C = cv.width / 2, K = (C - 6) / (ARENA_R + 4);
  g.beginPath(); g.arc(C, C, C - 2, 0, 7); g.clip();
  let lastSweep = 0;
  function drawRadar(s: State, yaw: number, dt: number) {
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const px = (x: number, z: number) => C + (x * sy - z * cy) * K, py = (x: number, z: number) => C + (x * cy + z * sy) * K;
    g.fillStyle = `rgba(0,4,1,${s.phase === 'play' ? 1 - Math.exp(-dt * 1.8) : 0})`; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = rgba(PAL.dim); g.lineWidth = 1;
    for (const r of [0.33, 0.66, 1]) { g.beginPath(); g.arc(C, C, (C - 6) * r, 0, 7); g.stroke(); }
    const rr = radarRange(s) * K, a = s.sweepA + Math.PI / 2 - yaw, sector = radarSector(s);
    g.strokeStyle = rgba(PAL.mid, 0.8); g.beginPath(); g.arc(C, C, rr, 0, 7); g.stroke();
    // Unlocked contacts are painted only as the sweep passes them, so they jump like real radar returns.
    const TAU = Math.PI * 2, a0 = lastSweep, swept = ((s.sweepA - a0) % TAU + TAU) % TAU;
    lastSweep = s.sweepA;
    const on = emitting(s);
    const aesa = s.st.aesa || sector > 0; // no sweep line to wait for: paint contacts as they are
    if (on && sector) { // FOCUSED: the searched arc
      const f = focusBearing(s), sa = Math.atan2(py(Math.cos(f), Math.sin(f)) - C, px(Math.cos(f), Math.sin(f)) - C);
      g.fillStyle = rgba(PAL.bright, 0.004 + 0.004 * Math.random()); g.strokeStyle = rgba(PAL.mid, 0.8); // the afterglow adds these up
      g.beginPath(); g.moveTo(C, C); g.arc(C, C, rr, sa - sector / 2, sa + sector / 2); g.closePath(); g.fill(); g.stroke();
    }
    if (on && !aesa && swept < 1) { g.fillStyle = rgba(PAL.bright, 0.35); g.beginPath(); g.moveTo(C, C); g.arc(C, C, rr, a - swept, a); g.fill(); }
    if (on && !aesa) { g.strokeStyle = rgba(PAL.hot); g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(a) * rr, C + Math.sin(a) * rr); g.stroke(); }
    for (const e of s.enemies) if (e.kind === 'ew' && e.orbit) { // jam strobe: bearing only, no range
      const d = Math.hypot(e.x, e.z) || 1, R = ARENA_R + 4;
      g.strokeStyle = rgba(PAL.alert, 0.2 + Math.random() * 0.4); g.lineWidth = 2;
      g.beginPath(); g.moveTo(C, C); g.lineTo(px(e.x / d * R, e.z / d * R), py(e.x / d * R, e.z / d * R)); g.stroke(); g.lineWidth = 1;
    }
    for (const e of s.enemies) {
      if (!visible(s, e)) continue;
      const rel = ((Math.atan2(e.z, e.x) - a0) % TAU + TAU) % TAU;
      if (!e.locked && !aesa && !(swept < 1 && rel <= swept)) continue;
      const x = px(e.x, e.z), y = py(e.x, e.z), r = 1.5 + e.size;
      g.fillStyle = e.kind === 'arm' || e.kind === 'tbm' ? rgba(PAL.alert) : rgba(e.locked ? PAL.hot : PAL.bright, Math.min(1, ENEMIES[shownKind(e)].glow) * (e.ided ? 0.35 : 1));
      g.fillRect(x - r / 2, y - r / 2, r, r);
      if (e.locked) { g.strokeStyle = rgba(e.id === s.marked ? PAL.hot : PAL.mid); g.strokeRect(x - r, y - r, r * 2, r * 2); }
    }
    if (s.raid && Math.sin(s.t * 12) > 0) { // incoming raid: blinking chevron at the rim
      const R = ARENA_R + 2, c = Math.cos(s.raid.a), sn = Math.sin(s.raid.a), tx = -sn * 4, tz = c * 4;
      g.strokeStyle = rgba(PAL.alert); g.lineWidth = 2; g.beginPath();
      g.moveTo(px(c * (R + 4) + tx, sn * (R + 4) + tz), py(c * (R + 4) + tx, sn * (R + 4) + tz));
      g.lineTo(px(c * R, sn * R), py(c * R, sn * R));
      g.lineTo(px(c * (R + 4) - tx, sn * (R + 4) - tz), py(c * (R + 4) - tx, sn * (R + 4) - tz));
      g.stroke(); g.lineWidth = 1;
    }
    if (s.t < s.radarDownUntil && s.phase === 'play') { // knocked out: static, and say so
      for (let i = 0; i < 60; i++) { g.fillStyle = rgba(PAL.crit, Math.random() * 0.5); g.fillRect(Math.random() * cv.width, Math.random() * cv.height, 2, 1 + Math.random() * 2); }
      g.fillStyle = rgba(PAL.crit); g.font = 'bold 16px monospace'; g.textAlign = 'center'; g.fillText('NO RADAR', C, C - 12);
    }
    g.fillStyle = rgba(on ? PAL.hot : s.t < s.radarDownUntil ? PAL.crit : PAL.alert); g.fillRect(C - 3, C - 3, 6, 6);
  }

  // ---- system log + lock labels ----
  const logEl = $('log'), lines: string[] = [];
  const log = (t: string, cls = '') => { lines.push(`<div class="${cls}">&gt; ${t}</div>`); if (lines.length > 5) lines.shift(); logDirty = true; };
  let logDirty = true, logAcc = 0, lowPwr = false;
  const known = new WeakSet<Enemy>();
  let locked = new Set<number>();
  function scanLog(s: State) {
    const fresh = s.enemies.filter(e => visible(s, e) && !known.has(e));
    for (const e of fresh) known.add(e);
    if (fresh.length) { const e = fresh[0]; log(`TRACK${fresh.length > 1 ? ` x${fresh.length}` : ''} BRG ${pad3(bearing(e.x, e.z))} RNG ${Math.round(Math.hypot(e.x, e.z))}`); }
    const now = new Set<number>();
    for (const e of s.enemies) if (e.locked) { now.add(e.id); if (!locked.has(e.id)) log(`ENGAGE ${tag(e)}`); }
    locked = now;
    const pct = Math.round(s.sweepSpeed / s.st.sweep * 100);
    if (emitting(s) && pct < 100 !== lowPwr) { lowPwr = pct < 100; log(lowPwr ? `PWR LOW – SWEEP ${pct}%` : 'PWR NOMINAL', lowPwr ? 'alert' : ''); }
    if (logDirty) { logDirty = false; logEl.innerHTML = lines.join(''); }
  }
  const labels = Array.from({ length: 24 }, () => $('labels').appendChild(document.createElement('div')));
  function placeLabels(s: State, project: Project) {
    let n = 0;
    for (const e of s.enemies) {
      if (!e.locked || n >= labels.length) continue;
      const el = labels[n++], [x, y] = project(e.x, e.z, e.size * 1.6 * 1.2);
      const t = `${tag(e)} · ${pad3(Math.hypot(e.x, e.z))}m`;
      if (el.textContent !== t) el.textContent = t;
      el.style.transform = `translate(${Math.round(x + 12 + e.size * 10)}px, ${Math.round(y - 14)}px)`;
      el.className = e.id === s.marked ? 'on mk' : 'on';
    }
    for (let i = n; i < labels.length; i++) if (labels[i].className) labels[i].className = '';
  }

  // ---- text (throttled) ----
  let ffSpeed = 1, acc = 1, lastPhase = '', armSaid = -99, tbmSaid = -99;
  const set = (id: string, v: string) => { const el = $(id); if (el.textContent !== v) el.textContent = v; };
  const bar = (id: string, r: number, crit = false) => { const el = $(id); el.style.setProperty('--r', String(Math.round(Math.max(0, Math.min(1, r)) * 20) / 20)); el.classList.toggle('crit', crit); };

  const touchBtns = Array.from(document.querySelectorAll<HTMLElement>('#touch [data-k], #views [data-k]'));
  const touch = (k: string, label: string, on = false) => {
    for (const el of touchBtns) if (el.dataset.k === k) {
      el.classList.toggle('on', on);
      const sp = el.querySelector('span');
      if (sp && sp.textContent !== label) sp.textContent = label;
    }
  };

  const flow = { t: 0, p: 0, a: 0, dp: 0, da: 0 };
  const infoEl = $('info');
  let infoHtml = '';

  // ---- threat board: what's attacking, and the few that matter most right now ----
  const threatEl = $('threats');
  let threatHtml = '';
  // Urgency: damage it would do over the time it needs to get here. Jammers and ARMs rank by what they do instead.
  const urgency = (e: Enemy) => {
    const k = shownKind(e), d = Math.hypot(e.x, e.z), eta = Math.max(0.5, (d - BASE_R) / e.speed);
    return k === 'ew' ? (e.orbit ? 4 : 1) : k === 'arm' ? 30 / eta : ENEMIES[k].dmg / eta;
  };
  function threatBoard(s: State) {
    const seen = s.enemies.filter(e => visible(s, e) && !e.ided);
    const count: Partial<Record<string, number>> = {};
    for (const e of seen) { const c = ENEMIES[shownKind(e)].code; count[c] = (count[c] ?? 0) + 1; }
    const top = seen.map(e => [urgency(e), e] as const).sort((a, b) => b[0] - a[0]).slice(0, 4);
    const worst = top[0]?.[0] ?? 0;
    const h = !seen.length ? '' : `<small>THREATS · ${seen.length}</small> ${Object.entries(count).sort((a, b) => b[1]! - a[1]!).map(([c, n]) => `${n} ${c}`).join(' · ')}` +
      top.map(([u, e]) => { const d = Math.hypot(e.x, e.z), k = shownKind(e);
        return `<div class="${u >= worst * 0.6 && u > 2 || k === 'arm' || k === 'tbm' ? 'alert' : ''}${e.id === s.marked ? ' mk' : ''}">${e.locked ? '◆' : '◇'} ${ENEMIES[k].code} ${pad3(bearing(e.x, e.z))}° ${pad3(d)}m${k === 'ew' ? (e.orbit ? ' JAMMING' : '') : ` ETA ${Math.max(0, (d - BASE_R) / e.speed).toFixed(0)}s`}</div>`; }).join('');
    if (h !== threatHtml) { threatHtml = h; threatEl.innerHTML = h; }
  }

  // ---- what to buy: the one shop row that fixes today's bottleneck ----
  const cheaper = (s: State, a: string, b: string) => cost(s, a) <= cost(s, b) ? a : b;
  function suggest(s: State) {
    const st = s.st;
    if (s.phase !== 'play') return '';
    if (s.ammo < st.ammoCap * 0.25) return cheaper(s, 'aprod', 'acap');
    if (s.power < st.powerCap * 0.25 || s.sweepSpeed < st.sweep * 0.99 && emitting(s)) return 'gen';
    if (s.hp < st.maxHp * 0.5) return cheaper(s, 'hp', 'repair');
    let locks = 0, waiting = 0;
    for (const e of s.enemies) { if (e.locked) locks++; else if (visible(s, e) && !e.ided && e.x * e.x + e.z * e.z <= st.trackRange ** 2) waiting++; }
    if (locks >= slots(s) && waiting >= 2) return 'slots';
    return cheaper(s, 'dmg', 'range');
  }
  function text(s: State) {
    const st = s.st;
    set('credits', fmt(s.credits)); set('phase', phaseName(s)); set('time', clock(s.t));
    set('kills', fmt(s.kills)); set('level', String(s.level));
    const comboOn = s.combo >= 3 && s.t - s.lastKill < COMBO_WINDOW;
    set('combo', comboOn ? `COMBO x${s.combo}  +${Math.round(Math.min(s.combo, COMBO_CAP) * COMBO_BONUS * 100)}%` : '');
    bar('hpBar', s.hp / st.maxHp, s.hp / st.maxHp < 0.3); set('hpTxt', `${fmt(s.hp)} / ${fmt(st.maxHp)}`);
    // Net flow over the last second or so: what's actually happening to the budget.
    if (s.t - flow.t >= 0.5 || s.t < flow.t) {
      const k = s.t > flow.t ? 1 / (s.t - flow.t) : 0;
      flow.dp = flow.dp * 0.5 + (s.power - flow.p) * k * 0.5; flow.da = flow.da * 0.5 + (s.ammo - flow.a) * k * 0.5;
      flow.t = s.t; flow.p = s.power; flow.a = s.ammo;
    }
    const rate = (v: number, full: boolean) => full ? '' : Math.abs(v) < 0.05 ? ' ±0/s' : ` ${v > 0 ? '+' : ''}${v.toFixed(1)}/s`;
    bar('pwBar', s.power / st.powerCap, s.power < st.powerCap * 0.1);
    set('pwTxt', `${fmt(s.power)} / ${fmt(st.powerCap)}${rate(flow.dp, s.power >= st.powerCap - 0.5)}`);
    bar('amBar', s.ammo / st.ammoCap, s.ammo < 3);
    set('amTxt', `${fmt(s.ammo)} / ${fmt(st.ammoCap)}${rate(flow.da, s.ammo >= st.ammoCap - 0.5)}`);
    let contacts = 0, locks = 0;
    for (const e of s.enemies) { if (visible(s, e)) contacts++; if (e.locked) locks++; }
    const sweepPct = Math.round(s.sweepSpeed / st.sweep * 100);
    const radar = s.t < s.radarDownUntil ? `<span class="red">DOWN ${(s.radarDownUntil - s.t).toFixed(1)}s${st.backupRadar && !s.emcon ? ' · TRML' : ''}</span>`
      : s.emcon ? '<span class="alert">EMCON · SILENT</span>'
      : sweepPct < 100 ? `<span class="alert">${sweepPct}% LOW PWR</span>` : 'RADIATING';
    const M = radarMode(s), scan = s.radarMode === 0 ? M.name : `<span class="hot">${M.name}${radarSector(s) ? ` ${pad3(bearing(Math.cos(focusBearing(s)), Math.sin(focusBearing(s))))}°` : ''}</span>`;
    // Grouped by what you're deciding: what the radar sees, what fire control does, the battery's state.
    const lockBar = `<b class="seg lk" style="--r:${slots(s) ? Math.min(1, locks / slots(s)) : 0}"></b>`;
    const html = [
      ['// SENSORS', ''],
      ['SCAN <kbd>[V]</kbd>', scan], ['RADAR <kbd>[F]</kbd>', radar], ['RANGE', `${Math.round(radarRange(s))}m`], ['TRACKS', contacts],
      ['// FIRE CONTROL', ''],
      ['ENGAGED', `${locks} / ${slots(s)}${s.t < s.chainUntil ? ' <span class="hot">+CHAIN</span>' : ''}${lockBar}`],
      ['FIRE <kbd>[G]</kbd>', s.discipline === 1 ? DISCIPLINES[1].name : `<span class="hot">${DISCIPLINES[s.discipline].name}</span>`],
      ['MODE <kbd>[T]</kbd>', MODES[s.mode]],
      ['INTERCEPT <kbd>[SPC]</kbd>', interceptActive(s) ? '<span class="hot">ENGAGING</span>' : (w => w ? `<span class="${w.endsWith('s') ? 'dim' : 'alert'}">${w}</span>` : '<span class="hot">READY</span>')(interceptBlock(s))],
      ['// BATTERY', ''],
      ['PERIMETER', `${s.perim.length} / ${perimSlots(s.level)} pads`],
      ...ffSpeed > 1 ? [['SPEED <kbd>[X]</kbd>', `<span class="hot">${ffSpeed}×</span>`]] : [],
      ...s.placing ? [['PAD', `<span class="hot">CLICK MAP · ${Math.max(0, PLACE_TIME - (s.t - s.placing.since)).toFixed(0)}s</span>`]] : [],
      ...s.raid ? [['RAID', `<span class="alert">${pad3(bearing(Math.cos(s.raid.a), Math.sin(s.raid.a)))}° T-${Math.max(0, s.raid.at - s.t).toFixed(0)}s</span>`]]
        : s.raidLeft ? [['RAID', `<span class="alert">${s.raidLeft}</span> · ${s.raidClean ? 'HELD' : '<span class="alert">LOST</span>'}`]]
        : s.t < s.calmUntil ? [['RECOVERY', `${Math.ceil(s.calmUntil - s.t)}s`]] : [],
    ].map(([k, v]) => v === '' ? `<dt class="grp">${k}</dt>` : `<dt>${k}</dt><dd>${v}</dd>`).join('');
    if (html !== infoHtml) { infoHtml = html; infoEl.innerHTML = html; } // no DOM churn when nothing changed
    threatBoard(s);
    document.body.classList.toggle('crit', s.phase === 'play' && s.hp / st.maxHp < 0.3);
    // Touch buttons: live value under the icon, lit while the thing is on.
    const ib = interceptBlock(s);
    touch('Space', interceptActive(s) ? 'FIRING' : ib || 'READY', interceptActive(s) || !ib);
    touch('KeyG', DISCIPLINES[s.discipline].name, s.discipline !== 1);
    touch('KeyV', M.name, s.radarMode !== 0);
    touch('KeyF', s.emcon ? 'SILENT' : 'EMCON', s.emcon);
    touch('KeyT', MODES[s.mode]);
    touch('Tab', 'SHOP', !shop.classList.contains('hidden'));
    touch('KeyX', '', ffSpeed > 1); touch('KeyP', '', s.phase === 'pause');
    raidCard(s);
    const live = s.phase === 'play' || s.phase === 'pause', down = live && s.t < s.radarDownUntil, silent = live && !down && s.emcon;
    document.body.classList.toggle('blind', down);
    document.body.classList.toggle('silent', silent);
    const bl = down ? `<b>RADAR DOWN ${(s.radarDownUntil - s.t).toFixed(1)}s</b><small>NO FIRE CONTROL · ${backupSearching(s) ? `TRML-4D SEARCHING ${Math.round(st.radarRange * 0.5)}m` : 'BLIND'}</small>`
      : silent ? '<b>EMCON · SILENT</b><small>NO LOCKS · TRACKS COASTING · [F] RADIATE</small>' : '';
    if (blindEl.innerHTML !== bl) blindEl.innerHTML = bl;
    const m = s.marked ? s.enemies.find(e => e.id === s.marked) : undefined;
    const d = m ? Math.hypot(m.x, m.z) : 0;
    $('target').innerHTML = m ? `<b>${tag(m)}</b><br>${ENEMIES[shownKind(m)].name}<br>BRG ${pad3(bearing(m.x, m.z))} · RNG ${pad3(d)}m · ETA ${Math.max(0, (d - BASE_R) / m.speed).toFixed(1)}s<br>HP ${fmt(Math.max(0, m.hp))} / ${fmt(m.maxHp)}<b class="seg" style="--r:${Math.max(0, m.hp / m.maxHp)}"></b>` : '';
    const hint = suggest(s);
    for (const [id, b] of rows) {
      const c = cost(s, id), lv = s.lv[id] ?? 0;
      b.classList.toggle('hint', id === hint);
      const why = lockReason(s, id), lvT = lv ? `LV ${lv}` : '', cT = why || (c === Infinity ? 'MAX' : fmt(c));
      if (b.children[1].textContent !== lvT) b.children[1].textContent = lvT; // write only on change: no DOM churn at 10 Hz
      if (b.children[2].textContent !== cT) b.children[2].textContent = cT;
      b.classList.toggle('can', s.credits >= c);
      b.classList.toggle('max', c === Infinity && !why);
      b.classList.toggle('locked', !!why);
    }
  }

  const blindEl = $('blind');
  // Raid bearing arrow on the screen edge, when the rim point is off screen.
  const arrow = $('raidarrow');
  function raidArrow(s: State, project: Project) {
    const a = s.raid ? s.raid.a : s.raidLeft ? s.raidA : NaN;
    if (Number.isNaN(a) || s.phase !== 'play') { arrow.className = ''; return; }
    const [x, y] = project(Math.cos(a) * ARENA_R, Math.sin(a) * ARENA_R, 0), [cx, cy] = project(0, 0, 0);
    const m = 40, W = innerWidth, H = innerHeight;
    if (x > m && x < W - m && y > m && y < H - m) { arrow.className = ''; return; }
    const dx = x - cx, dy = y - cy, k = Math.min(Math.abs((W / 2 - m) / (dx || 1e-6)), Math.abs((H / 2 - m) / (dy || 1e-6)));
    arrow.className = 'on';
    arrow.style.transform = `translate(${W / 2 + dx * k - 11}px, ${H / 2 + dy * k - 12}px) rotate(${Math.atan2(dy, dx)}rad)`;
  }

  // ---- raid card: full briefing during the preparation window, a status line during the attack ----
  const rc = $('raidcard');
  let rcHtml = '';
  function raidCard(s: State) {
    let h = '', cls = '';
    const on = s.phase === 'play' || s.phase === 'pause';
    if (on && s.raid) {
      const r = s.raid, comp = (Object.entries(r.n) as [keyof typeof ENEMIES, number][]).map(([k, n]) => `${n} × ${ENEMIES[k].code}`).join(' &nbsp; ');
      h = `<small>INCOMING RAID · SECTOR ${pad3(bearing(Math.cos(r.a), Math.sin(r.a)))}° · T-${Math.max(0, r.at - s.t).toFixed(0)}s</small><b>${r.name}</b>${comp}<br>
        <small>OBJECTIVE</small> <span class="obj">${OBJECTIVES[r.obj]}</span> &nbsp; <small>BONUS</small> <span class="obj">+${fmt(r.bonus * s.st.credits)} CR</span>`;
      cls = 'on brief';
    } else if (on && s.raidLeft) {
      h = `<small>${s.raidName} · ${s.raidLeft} LEFT · ${OBJECTIVES[s.raidObj]}</small> ${s.raidClean ? '<span class="obj">HELD</span>' : 'LOST'}`;
      cls = 'on';
    }
    if (h !== rcHtml) { rcHtml = h; rc.innerHTML = h; }
    if (rc.className !== cls) rc.className = cls;
    document.body.classList.toggle('raid', !!cls);
  }

  return {
    update(s: State, dt: number, yaw: number, project: Project, speed = 1) {
      lastState = s; ffSpeed = speed;
      if (s.phase === 'play' && s.t > 2) tip('start', s.t);
      for (const e of s.events) tip(e.k, s.t);
      if (tipEl.classList.contains('on') && (s.t > tipUntil || s.t < tipUntil - 9 || s.phase === 'start')) tipEl.classList.remove('on');
      for (const e of s.events) {
        if (e.k === 'kill') {
          if (e.n) pop(project, e.x, e.z, `+${e.n}`, '');
          if (e.kind === 'arm' || e.kind === 'tbm') log(`${ENEMIES[e.kind].code} INTERCEPTED BRG ${pad3(bearing(e.x, e.z))}`);
          else if (e.kind === 'ew') { say('JAMMER DOWN', 'info'); log(`JAMMER DOWN BRG ${pad3(bearing(e.x, e.z))} · SECTOR CLEAR`); }
          else if (e.kind === 'elite') log('SU-34 SPLASHED');
        }
        else if (e.k === 'lost' && s.phase === 'play' && emitting(s)) log(`LOCK LOST${e.n! > 1 ? ` x${e.n}` : ''} BRG ${pad3(bearing(e.x, e.z))}`, 'alert');
        else if (e.k === 'lost' && e.n! > 0 && !emitting(s)) log(`${e.n} LOCK${e.n! > 1 ? 'S' : ''} DROPPED · RADAR DARK`, 'alert'); else if (e.k === 'warning') { say('⚠ STRIKE AIRCRAFT', 'warn'); log('SU-34 PACKAGE INBOUND', 'alert'); }
        else if (e.k === 'baseHit') { log(`IMPACT · ${ENEMIES[e.kind!].code} · -${Math.ceil(e.n!)} HP`, 'alert'); pop(project, 0, 0, `-${Math.ceil(e.n!)}`, 'dmg'); }
        else if (e.k === 'arm') {
          log(`ARM LAUNCH BRG ${pad3(bearing(e.x, e.z))}`, 'alert');
          if (s.t - armSaid > 3 && !s.emcon) { armSaid = s.t; say('⚠ ARM INBOUND · [F] EMCON', 'warn'); }
        }
        else if (e.k === 'tbm') { log(`BALLISTIC LAUNCH BRG ${pad3(bearing(e.x, e.z))}`, 'alert'); if (s.t - tbmSaid > 4) { tbmSaid = s.t; say('⚠ BALLISTIC MISSILE · PAC-3 ONLY', 'warn'); } }
        else if (e.k === 'radarDown') { say('⚠ RADAR HIT', 'warn'); log(`MPQ-65 HIT · OFFLINE ${(s.radarDownUntil - s.t).toFixed(0)}s`, 'alert'); }
        else if (e.k === 'radarMode') { acc = 1; const M = radarMode(s); log(`RADAR ${M.name} · RNG ${Math.round(radarRange(s))}m${M.lpi ? ' · ARMS BLIND >15m' : M.sector ? ' · ARM EXPOSURE HIGH' : ''}`, M.sector ? 'alert' : ''); }
        else if (e.k === 'killChain') log('KILL CHAIN · +1 LOCK SLOT 8s');
        else if (e.k === 'counterSead') log('ARM DOWN · COUNTER-SEAD · POWER RESTORED');
        else if (e.k === 'lastStand') { say('LAST STAND', 'warn'); log('LAST STAND · FIRE RATE UP · POWER DOWN', 'alert'); }
        else if (e.k === 'emcon') log(s.emcon ? 'EMCON · RADAR SILENT' : 'RADIATING', s.emcon ? 'alert' : '');
        else if (e.k === 'jam') log(`JAMMING BRG ${pad3(bearing(e.x, e.z))}`, 'alert');
        else if (e.k === 'ident') log('DECOY CLASSIFIED · TRACK RELEASED');
        else if (e.k === 'placing') say(`CLICK THE MAP TO PLACE ${s.placing!.k.toUpperCase()}`, 'info');
        else if (e.k === 'raid') { say(`⚠ ${e.name} · BRG ${pad3(bearing(e.x, e.z))}`, 'warn'); log(`${e.name} · BRG ${pad3(bearing(e.x, e.z))}`, 'alert'); }
        else if (e.k === 'package') {
          const p = PACKAGES.find(p => p.name === e.name)!;
          say(`${e.name} · BRG ${pad3(bearing(e.x, e.z))}`, 'warn');
          log(`${e.name} BRG ${pad3(bearing(e.x, e.z))} · KILL ${ENEMIES[p.first].code} FIRST`, 'alert');
          log(p.why.toUpperCase());
        }
        else if (e.k === 'raidStart') { say(`${e.name} · ENGAGE`, 'warn'); log(`RAID IN · ${e.name} · ${OBJECTIVES[s.raidObj]}`, 'alert'); }
        else if (e.k === 'raidClear') { say(`OBJECTIVE HELD · +${fmt(e.n)}`, 'info'); log(`RAID DEFEATED · +${fmt(e.n)} CR · RECOVERY`); }
        else if (e.k === 'raidLeak') { say('OBJECTIVE LOST', 'warn'); log(`OBJECTIVE LOST · NEXT RAID ${RAID_PRESS}s SOONER`, 'alert'); }
        else if (e.k === 'raidEnd') log('RAID OVER · NO BONUS · NO RECOVERY', 'alert');
        else if (e.k === 'aesa') { say('LTAMDS ONLINE · 360° STARE', 'info'); log('AESA ONLINE · SWEEP RETIRED'); }
        else if (e.k === 'level') { const b = baseLevelInfo(s.level); say(`LV ${s.level} · ${b.name}`, 'info'); log(`BATTERY LV ${s.level} · ${b.name} · ${b.desc}`); }
        else if (e.k === 'buy' || e.k === 'discipline') { acc = 1; if (e.k === 'discipline') log(`FIRE DISCIPLINE · ${DISCIPLINES[s.discipline].name}`); }
        else if (e.k === 'intercept') { say('EMERGENCY INTERCEPT', 'info'); log(`INTERCEPT ${pad3(bearing(e.x, e.z))} · ALL WEAPONS · ${INTERCEPT.time}s`, 'alert'); acc = 1; }
      }
      const pn = phaseName(s);
      if (s.phase === 'play' && pn !== lastPhase) {
        const { mod } = phase(s);
        if (lastPhase) { say(`PHASE · ${pn}`, mod.name ? 'warn' : 'info'); if (mod.desc) log(mod.desc.toUpperCase(), 'alert'); }
        lastPhase = pn;
      }
      if (s.phase === 'start') { lastPhase = ''; armSaid = tbmSaid = -99; }
      drawRadar(s, yaw, dt);
      placeLabels(s, project);
      raidArrow(s, project);
      if (s.phase === 'play' && (logAcc += dt) >= 0.3) { logAcc = 0; scanLog(s); }
      showOverlay(s);
      if ((acc += dt) >= 0.1) { acc = 0; text(s); }
    },
    flash(id: string) { const b = rows.get(id)!; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); },
    toggleShop: () => shop.classList.toggle('hidden'),
    share,
  };
}
