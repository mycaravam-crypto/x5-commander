import { ARENA_R, COMBO_BONUS, COMBO_CAP, COMBO_WINDOW, ENEMIES, MODES, PERKS, UPGRADES } from './config.ts';
import { cost, phaseName, visible, type State } from './sim.ts';

const $ = (id: string) => document.getElementById(id)!;
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

type Best = { time: number; kills: number; level: number; earned: number };
function loadBest(): Best {
  try { return JSON.parse(localStorage.getItem('x5-best')!) ?? { time: 0, kills: 0, level: 0, earned: 0 }; }
  catch { return { time: 0, kills: 0, level: 0, earned: 0 }; }
}

export function createHud(actions: { buy(id: string): void; perk(i: number): void; start(): void; restart(): void }) {
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
    if (s.phase === 'start') html = `<div class="card"><h1>X5 COMMANDER</h1>
      <p class="dim">SCAN · DETECT · LOCK · ENGAGE · EXPAND</p><br>
      <p>Your radar decides what exists. Undetected contacts can't be shot.</p>
      <p>Locked targets get fired on automatically. <b>Click</b> a contact to force priority.</p>
      <p>Spend credits on the right. Every few upgrades the base grows and you draft a <b style="color:var(--mag)">perk</b>.</p>
      <p>Power feeds radar, ammo and beams — run dry and the sweep slows.</p>
      ${best.time ? `<p class="dim">BEST · ${clock(best.time)} · ${fmt(best.kills)} kills · base lv ${best.level}</p>` : ''}
      <button class="btn" data-a="start">DEPLOY [SPACE]</button></div>`;
    else if (s.phase === 'pause') html = `<div class="card"><h2>PAUSED</h2><p class="dim">[P] resume</p></div>`;
    else if (s.phase === 'perk') html = `<div class="card"><h2>BASE LEVEL ${s.level} · CHOOSE A PERK</h2><div class="perks">${
      s.perkChoices.map((id, i) => { const p = PERKS.find(p => p.id === id)!; return `<button class="perk" data-a="perk${i}"><b>${p.name}</b><span>${p.desc}</span><kbd>[${i + 1}]</kbd></button>`; }).join('')
    }</div></div>`;
    else if (s.phase === 'over') {
      const now = { time: s.t, kills: s.kills, level: s.level, earned: s.earned };
      const rec = (k: keyof Best) => now[k] > best[k];
      const merged = Object.fromEntries(Object.keys(now).map(k => [k, Math.max(now[k as keyof Best], best[k as keyof Best])]));
      try { localStorage.setItem('x5-best', JSON.stringify(merged)); } catch { /* storage blocked: skip */ }
      const row = (label: string, k: keyof Best, f: (n: number) => string) =>
        `<small>${label}</small><b class="${rec(k) ? 'new' : ''}">${f(now[k])}${rec(k) ? ' ★' : ''}</b><span class="dim">best ${f(Math.max(now[k], best[k]))}</span>`;
      html = `<div class="card"><h1 style="color:var(--red);text-shadow:0 0 30px var(--red)">BASE LOST</h1>
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

  // ---- mini radar ----
  const cv = $('radar') as HTMLCanvasElement, g = cv.getContext('2d')!;
  const C = cv.width / 2, K = (C - 6) / (ARENA_R + 4);
  function drawRadar(s: State, yaw: number) {
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const px = (x: number, z: number) => C + (x * sy - z * cy) * K, py = (x: number, z: number) => C + (x * cy + z * sy) * K;
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#050b10'; g.beginPath(); g.arc(C, C, C - 2, 0, 7); g.fill();
    g.strokeStyle = '#123040'; g.lineWidth = 1;
    for (const r of [0.33, 0.66, 1]) { g.beginPath(); g.arc(C, C, (C - 6) * r, 0, 7); g.stroke(); }
    const rr = s.st.radarRange * K;
    g.strokeStyle = 'rgba(61,255,138,.5)'; g.beginPath(); g.arc(C, C, rr, 0, 7); g.stroke();
    const a = s.sweepA + Math.PI / 2 - yaw;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(61,255,138,${0.12 * (1 - i / 8)})`;
      g.beginPath(); g.moveTo(C, C); g.arc(C, C, rr, a - (i + 1) * 0.09, a - i * 0.09); g.fill();
    }
    g.strokeStyle = '#3dff8a'; g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(a) * rr, C + Math.sin(a) * rr); g.stroke();
    for (const e of s.enemies) {
      if (!visible(s, e)) continue;
      const x = px(e.x, e.z), y = py(e.x, e.z);
      g.globalAlpha = e.locked ? 1 : Math.max(0.25, Math.min(1, (e.seenUntil - s.t) / 1.5));
      g.fillStyle = '#' + ENEMIES[e.kind].color.toString(16).padStart(6, '0');
      const r = 1.5 + e.size;
      g.fillRect(x - r / 2, y - r / 2, r, r);
      if (e.locked) { g.strokeStyle = e.id === s.marked ? '#ff3dd8' : '#5ef2ff'; g.strokeRect(x - r, y - r, r * 2, r * 2); }
    }
    g.globalAlpha = 1;
    g.fillStyle = '#5ef2ff'; g.fillRect(C - 3, C - 3, 6, 6);
  }

  // ---- text (throttled) ----
  let acc = 1, lastPhase = '';
  const set = (id: string, v: string) => { const el = $(id); if (el.textContent !== v) el.textContent = v; };
  const bar = (id: string, r: number, crit = false) => { const el = $(id); el.style.width = `${Math.max(0, Math.min(1, r)) * 100}%`; el.classList.toggle('crit', crit); };

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
    $('info').innerHTML = [
      ['CONTACTS', contacts], ['LOCKS', `${locks} / ${st.slots}`], ['MODE [T]', MODES[s.mode]],
      ['RADAR', `${Math.round(st.radarRange)}m`], ['SWEEP', sweepPct < 100 ? `<span style="color:var(--red)">${sweepPct}% LOW PWR</span>` : '100%'],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    for (const [id, b] of rows) {
      const c = cost(s, id), lv = s.lv[id] ?? 0;
      b.children[1].textContent = lv ? `LV ${lv}` : '';
      b.children[2].textContent = c === Infinity ? 'MAX' : fmt(c);
      b.classList.toggle('can', s.credits >= c);
      b.classList.toggle('max', c === Infinity);
    }
  }

  return {
    update(s: State, dt: number, yaw: number, project: (x: number, z: number) => readonly [number, number]) {
      for (const e of s.events) {
        if (e.k === 'kill' && e.n) {
          const el = popups[nextPop = (nextPop + 1) % popups.length];
          const [x, y] = project(e.x, e.z);
          el.textContent = `+${e.n}`; el.style.left = `${x}px`; el.style.top = `${y}px`;
          el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
        } else if (e.k === 'warning') say('⚠ HEAVY CONTACT', 'warn');
        else if (e.k === 'buy') { acc = 1; }
      }
      const pn = phaseName(s);
      if (s.phase === 'play' && pn !== lastPhase) { if (lastPhase) say(`PHASE · ${pn}`, 'info'); lastPhase = pn; }
      if (s.phase === 'start') lastPhase = '';
      drawRadar(s, yaw);
      showOverlay(s);
      if ((acc += dt) >= 0.1) { acc = 0; text(s); }
    },
    flash(id: string) { const b = rows.get(id)!; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); },
    toggleShop: () => shop.classList.toggle('hidden'),
  };
}
