import { ARENA_R, BASE_R, COMBO_BONUS, COMBO_CAP, COMBO_WINDOW, ENEMIES, MODES, PAL, PERKS, UPGRADES, bearing, perimSlots } from './config.ts';
import { cost, emitting, lockReason, phase, phaseName, shownKind, visible, type Enemy, type State } from './sim.ts';

const $ = (id: string) => document.getElementById(id)!;
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
const pad3 = (n: number) => String(Math.round(n)).padStart(3, '0');
const tag = (e: Enemy) => `TN${pad3(e.id % 1000)} ${ENEMIES[shownKind(e)].code}`; // track number + type
const rgba = (c: number, a = 1) => `rgba(${c >> 16},${c >> 8 & 255},${c & 255},${a})`;
const BOOT = ['PATRIOT BATTERY X5 EMPLACED', 'EPP-III POWER ..... OK', 'AN/MPQ-65 RADIATING', 'ECS FIRE CONTROL .. OK', 'PAC-3 MSE ON THE RAIL', 'WEAPONS FREE'];
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

type Project = (x: number, z: number, y?: number) => readonly [number, number];
type Best = { time: number; kills: number; level: number; earned: number };
function loadBest(): Best {
  try { return JSON.parse(localStorage.getItem('x5-best')!) ?? { time: 0, kills: 0, level: 0, earned: 0 }; }
  catch { return { time: 0, kills: 0, level: 0, earned: 0 }; }
}

export function createHud(actions: { buy(id: string): void; perk(i: number): void; start(): void; restart(): void }) {
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

  // ---- overlay ----
  const overlay = $('overlay');
  overlay.onclick = e => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'start') actions.start();
    else if (a === 'restart') actions.restart();
    else if (a?.startsWith('perk')) actions.perk(+a.slice(4));
  };
  let shownPhase = '';
  function showOverlay(s: State) {
    const key = s.phase + s.perkChoices.join();
    if (key === shownPhase) return;
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
      <button class="btn" data-a="start">DEPLOY [SPACE]</button></div></div>`;
    else if (s.phase === 'pause') html = `<div class="card"><h2>PAUSED</h2><p class="dim">[P] resume</p></div>`;
    else if (s.phase === 'perk') html = `<div class="card"><h2>BATTERY LEVEL ${s.level} · CHOOSE A PERK</h2><div class="perks">${
      s.perkChoices.map((id, i) => { const p = PERKS.find(p => p.id === id)!; return `<button class="perk frame${p.rule ? ' rule' : ''}" data-a="perk${i}">${p.rule ? '<i>★ NEW RULE</i>' : ''}<b>${p.name}</b><span>${p.desc}</span><kbd>[${i + 1}]</kbd></button>`; }).join('')
    }</div></div>`;
    else if (s.phase === 'over') {
      const now = { time: s.t, kills: s.kills, level: s.level, earned: s.earned };
      const rec = (k: keyof Best) => now[k] > best[k];
      const merged = Object.fromEntries(Object.keys(now).map(k => [k, Math.max(now[k as keyof Best], best[k as keyof Best])]));
      try { localStorage.setItem('x5-best', JSON.stringify(merged)); } catch { /* storage blocked: skip */ }
      const row = (label: string, k: keyof Best, f: (n: number) => string) =>
        `<small>${label}</small><b class="${rec(k) ? 'new' : ''}">${f(now[k])}${rec(k) ? ' ★' : ''}</b><span class="dim">best ${f(Math.max(now[k], best[k]))}</span>`;
      html = `<div class="card"><h1 class="alert">BATTERY LOST</h1>
        <div class="score">${row('SURVIVED', 'time', clock)}${row('KILLS', 'kills', fmt)}${row('BASE LEVEL', 'level', String)}${row('CREDITS EARNED', 'earned', fmt)}</div>
        <p class="dim">perks: ${s.perks.map(id => PERKS.find(p => p.id === id)!.name).join(' · ') || 'none'}</p>
        <button class="btn" data-a="restart">REDEPLOY [R]</button></div>`;
    }
    overlay.innerHTML = html;
    overlay.classList.toggle('on', !!html);
  }

  // ---- banner + popups ----
  const banner = $('banner');
  const say = (text: string, cls: string) => {
    banner.textContent = text; banner.className = cls;
    void banner.offsetWidth; banner.classList.add('go');
  };
  const popups = Array.from({ length: 32 }, () => $('popups').appendChild(document.createElement('div')));
  let nextPop = 0;

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
    const rr = s.st.radarRange * K, a = s.sweepA + Math.PI / 2 - yaw;
    g.strokeStyle = rgba(PAL.mid, 0.8); g.beginPath(); g.arc(C, C, rr, 0, 7); g.stroke();
    // Unlocked contacts are painted only as the sweep passes them, so they jump like real radar returns.
    const TAU = Math.PI * 2, a0 = lastSweep, swept = ((s.sweepA - a0) % TAU + TAU) % TAU;
    lastSweep = s.sweepA;
    const on = emitting(s);
    if (on && swept < 1) { g.fillStyle = rgba(PAL.bright, 0.35); g.beginPath(); g.moveTo(C, C); g.arc(C, C, rr, a - swept, a); g.fill(); }
    if (on) { g.strokeStyle = rgba(PAL.hot); g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(a) * rr, C + Math.sin(a) * rr); g.stroke(); }
    for (const e of s.enemies) if (e.kind === 'ew' && e.orbit) { // jam strobe: bearing only, no range
      const d = Math.hypot(e.x, e.z) || 1, R = ARENA_R + 4;
      g.strokeStyle = rgba(PAL.alert, 0.2 + Math.random() * 0.4); g.lineWidth = 2;
      g.beginPath(); g.moveTo(C, C); g.lineTo(px(e.x / d * R, e.z / d * R), py(e.x / d * R, e.z / d * R)); g.stroke(); g.lineWidth = 1;
    }
    for (const e of s.enemies) {
      if (!visible(s, e)) continue;
      const rel = ((Math.atan2(e.z, e.x) - a0) % TAU + TAU) % TAU;
      if (!e.locked && !(swept < 1 && rel <= swept)) continue;
      const x = px(e.x, e.z), y = py(e.x, e.z), r = 1.5 + e.size;
      g.fillStyle = e.kind === 'arm' ? rgba(PAL.alert) : rgba(e.locked ? PAL.hot : PAL.bright, Math.min(1, ENEMIES[shownKind(e)].glow) * (e.ided ? 0.35 : 1));
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
    g.fillStyle = rgba(on ? PAL.hot : PAL.alert); g.fillRect(C - 3, C - 3, 6, 6);
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
  let acc = 1, lastPhase = '', armSaid = -99;
  const set = (id: string, v: string) => { const el = $(id); if (el.textContent !== v) el.textContent = v; };
  const bar = (id: string, r: number, crit = false) => { const el = $(id); el.style.setProperty('--r', String(Math.round(Math.max(0, Math.min(1, r)) * 20) / 20)); el.classList.toggle('crit', crit); };

  function text(s: State) {
    const st = s.st;
    set('credits', fmt(s.credits)); set('phase', phaseName(s)); set('time', clock(s.t));
    set('kills', fmt(s.kills)); set('level', String(s.level));
    const comboOn = s.combo >= 3 && s.t - s.lastKill < COMBO_WINDOW;
    set('combo', comboOn ? `COMBO x${s.combo}  +${Math.round(Math.min(s.combo, COMBO_CAP) * COMBO_BONUS * 100)}%` : '');
    bar('hpBar', s.hp / st.maxHp, s.hp / st.maxHp < 0.3); set('hpTxt', `${fmt(s.hp)} / ${fmt(st.maxHp)}`);
    bar('pwBar', s.power / st.powerCap, s.power < st.powerCap * 0.1); set('pwTxt', `${fmt(s.power)} / ${fmt(st.powerCap)}`);
    bar('amBar', s.ammo / st.ammoCap, s.ammo < 3); set('amTxt', `${fmt(s.ammo)} / ${fmt(st.ammoCap)}`);
    let contacts = 0, locks = 0;
    for (const e of s.enemies) { if (visible(s, e)) contacts++; if (e.locked) locks++; }
    const sweepPct = Math.round(s.sweepSpeed / st.sweep * 100);
    const radar = s.t < s.radarDownUntil ? `<span class="alert">DOWN ${(s.radarDownUntil - s.t).toFixed(1)}s</span>`
      : s.emcon ? '<span class="alert">EMCON · SILENT</span>'
      : sweepPct < 100 ? `<span class="alert">${sweepPct}% LOW PWR</span>` : 'RADIATING';
    $('info').innerHTML = [
      ['TRACKS', contacts], ['ENGAGED', `${locks} / ${st.slots}`], ['MODE [T]', MODES[s.mode]],
      ['RANGE', `${Math.round(st.radarRange)}m`], ['PERIMETER', `${s.perim.length} / ${perimSlots(s.level)} pads`], ['RADAR [F]', radar],
      ...s.raid ? [['RAID', `<span class="alert">BRG ${pad3(bearing(Math.cos(s.raid.a), Math.sin(s.raid.a)))} · T-${Math.max(0, s.raid.at - s.t).toFixed(0)}s</span>`]]
        : s.raidLeft ? [['RAID', `${s.raidLeft} left${s.raidClean ? ' · CLEAN' : ''}`]] : [],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    document.body.classList.toggle('crit', s.phase === 'play' && s.hp / st.maxHp < 0.3);
    const m = s.marked ? s.enemies.find(e => e.id === s.marked) : undefined;
    const d = m ? Math.hypot(m.x, m.z) : 0;
    $('target').innerHTML = m ? `<b>${tag(m)}</b><br>${ENEMIES[shownKind(m)].name}<br>BRG ${pad3(bearing(m.x, m.z))} · RNG ${pad3(d)}m · ETA ${Math.max(0, (d - BASE_R) / m.speed).toFixed(1)}s<br>HP ${fmt(Math.max(0, m.hp))} / ${fmt(m.maxHp)}<b class="seg" style="--r:${Math.max(0, m.hp / m.maxHp)}"></b>` : '';
    for (const [id, b] of rows) {
      const c = cost(s, id), lv = s.lv[id] ?? 0;
      b.children[1].textContent = lv ? `LV ${lv}` : '';
      const why = lockReason(s, id);
      b.children[2].textContent = why || (c === Infinity ? 'MAX' : fmt(c));
      b.classList.toggle('can', s.credits >= c);
      b.classList.toggle('max', c === Infinity && !why);
      b.classList.toggle('locked', !!why);
    }
  }

  return {
    update(s: State, dt: number, yaw: number, project: Project) {
      for (const e of s.events) {
        if (e.k === 'kill' && e.n) {
          const el = popups[nextPop = (nextPop + 1) % popups.length];
          const [x, y] = project(e.x, e.z);
          el.textContent = `+${e.n}`; el.style.left = `${x}px`; el.style.top = `${y}px`;
          el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
        } else if (e.k === 'warning') { say('⚠ STRIKE AIRCRAFT', 'warn'); log('SU-34 PACKAGE INBOUND', 'alert'); }
        else if (e.k === 'baseHit') log(`IMPACT · ${ENEMIES[e.kind!].code}`, 'alert');
        else if (e.k === 'arm') {
          log(`ARM LAUNCH BRG ${pad3(bearing(e.x, e.z))}`, 'alert');
          if (s.t - armSaid > 3 && !s.emcon) { armSaid = s.t; say('⚠ ARM INBOUND · [F] EMCON', 'warn'); }
        }
        else if (e.k === 'radarDown') { say('⚠ RADAR HIT', 'warn'); log(`MPQ-65 HIT · OFFLINE ${(s.radarDownUntil - s.t).toFixed(0)}s`, 'alert'); }
        else if (e.k === 'emcon') log(s.emcon ? 'EMCON · RADAR SILENT' : 'RADIATING', s.emcon ? 'alert' : '');
        else if (e.k === 'jam') log(`JAMMING BRG ${pad3(bearing(e.x, e.z))}`, 'alert');
        else if (e.k === 'ident') log('DECOY CLASSIFIED · TRACK RELEASED');
        else if (e.k === 'raid') { say(`⚠ ${e.name} · BRG ${pad3(bearing(e.x, e.z))}`, 'warn'); log(`${e.name} · BRG ${pad3(bearing(e.x, e.z))}`, 'alert'); }
        else if (e.k === 'raidClear') { say(`RAID DEFEATED · +${fmt(e.n)}`, 'info'); log(`RAID CLEAN · +${fmt(e.n)}`); }
        else if (e.k === 'raidLeak') log('RAID LEAKED · NO BONUS', 'alert');
        else if (e.k === 'level') log(`BATTERY LV ${s.level} · LAUNCHER EMPLACED · ${perimSlots(s.level)} PERIMETER PADS`);
        else if (e.k === 'buy') { acc = 1; }
      }
      const pn = phaseName(s);
      if (s.phase === 'play' && pn !== lastPhase) {
        const { mod } = phase(s);
        if (lastPhase) { say(`PHASE · ${pn}`, mod.name ? 'warn' : 'info'); if (mod.desc) log(mod.desc.toUpperCase(), 'alert'); }
        lastPhase = pn;
      }
      if (s.phase === 'start') { lastPhase = ''; armSaid = -99; }
      drawRadar(s, yaw, dt);
      placeLabels(s, project);
      if (s.phase === 'play' && (logAcc += dt) >= 0.3) { logAcc = 0; scanLog(s); }
      showOverlay(s);
      if ((acc += dt) >= 0.1) { acc = 0; text(s); }
    },
    flash(id: string) { const b = rows.get(id)!; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); },
    toggleShop: () => shop.classList.toggle('hidden'),
  };
}
