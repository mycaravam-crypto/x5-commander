import { ARENA_R, BASE_R, FRONT, FRONT_ARC, VISUAL_R, RADAR_REQ, PLACE_TIME, GUNS, FANS, MG_TIERS, PAD_HP, MOVE_TIME, VETERANCY, vetRank, OBSERVER_EYES, AMMO_R, PERIM, baseLevelInfo, DOCTRINES, PACKAGES, OBJECTIVES, BUILD_LOST, DISCIPLINES, INTERCEPT, COMBO_BONUS, COMBO_CAP, COMBO_WINDOW, ENEMIES, MUNITIONS, MODES, PAL, PERKS, UPGRADES, bearing, perimSlots, flightAlt, buildR, DROPS, DROP_LIFE, MILESTONE, OVERDRIVE, rank } from './config.ts';
import { paintTerrain } from './terrainPaint.ts';
import { mapSeed } from './terrain.ts';
import type { Records } from './config.ts';
import { beltOf, stageInfo, cost, toRank, overdrive, emitting, flankArc, building, selectedPad, padStats, padName, padUpgradeCost, sellValue, covers, slots, backupSearching, focusBearing, radarMode, radarRange, radarSector, interceptActive, interceptBlock, lockReason, noAmmo, phase, phaseName, shownKind, visible, type Enemy, type State } from './sim.ts';

const $ = (id: string) => document.getElementById(id)!;
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
const pad3 = (n: number) => String(Math.round(n)).padStart(3, '0');
// What it's doing, for the threat board and the target card: ETA inbound, or what it's up to instead.
const doing = (e: Enemy, dp = 0) => e.kind === 'ew' ? (e.orbit ? 'JAMMING' : 'INBOUND')
  : e.act === 'egress' ? 'EGRESS' : e.act === 'hover' ? 'HOVER · ATGM' : e.act === 'loiter' ? 'LOITER'
  : `ETA ${Math.max(0, (Math.hypot(e.x, e.z) - BASE_R) / e.speed).toFixed(dp)}s${e.act === 'dive' ? ' DIVE' : ''}`;
const tag = (e: Enemy) => `TN${pad3(e.id % 1000)} ${ENEMIES[shownKind(e)].code}`; // track number + type
const rgba = (c: number, a = 1) => `rgba(${c >> 16},${c >> 8 & 255},${c & 255},${a})`;
const BOOT = ['COMMAND POST ....... OK', '12.7MM AA MG ... DUG IN', 'AN/MPQ-65 RADAR . NOT BUILT', 'PAC-3 MSE ....... NOT BUILT', 'EYES ON THE SKY', 'WEAPONS FREE'];
// The map's name on the start screen: its seed, as a grid reference.
const mapName = (seed: number) => `GRID ${String.fromCharCode(65 + (seed >>> 0) % 26)}${String.fromCharCode(65 + ((seed >>> 5) >>> 0) % 26)}-${String((seed >>> 10) % 10000).padStart(4, '0')}`;
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
  startMg: `You start with one 12.7mm AA machine gun and your own eyes: the gun fires by itself at whatever gets close enough to see. Buy more guns in the shop [Tab]. The search radar and the Patriot open up at base level ${RADAR_REQ}.`,
  radarOnline: 'Radar online: contacts far beyond sight, and fire control locks them for the Patriot. Click a contact to make it the priority target: engaged first, +25% damage, costs power while held.',
  pac3: 'Patriot online: PAC-3 interceptors fire at every lock. They use the interceptor stock, the only weapon that can hit a ballistic missile.',
  discipline: 'Fire discipline [G]: CONSERVE saves interceptors and fires late, MAXIMUM fires fast and overkills.',
  intercept: 'Emergency intercept: every weapon on one threat for a few seconds. Long cooldown, costs power.',
  raid: 'Raid inbound: you have a few seconds to prepare. Set radar, fire discipline and priority before it arrives. The raid ends the level. Hold the objective for the bonus and a full build window; lose it and the build window is short.',
  warning: 'Su-34s are tough and fire anti-radiation missiles at a radiating radar. Click one to focus fire on it.',
  cruise: 'Cruise missile: low and fast, it weaves in on your most valuable unit and knocks it out. Radar only sees it close in. Guns near that unit, a MANTIS or an IRIS-T SLM (base level 5) stop it.',
  arm: 'ARM launch: it homes on your radar. [F] EMCON before it gets close (you lose every lock), or [V] to LPI: ARMs only find you inside 15m.',
  radarMode: 'Radar mode [V]: ACTIVE all round · FOCUSED searches the bearing you click, further and faster, but draws ARMs · LPI is hard for ARMs to find but sees less.',
  tbm: 'Ballistic missile: only PAC-3 can hit it. Keep interceptors in stock and a lock slot free.',
  jam: 'Jammer on station: detection drops in the amber sector. The Mi-8 itself shows clearly, so click it and kill it.',
  dud: 'That "Shahed" was a Gerbera decoy: it hit the battery and did nothing. Decoys look like Shaheds until locked for a moment; don\'t waste missiles on them.',
  ident: 'Decoy classified and released. Decoys look like Shaheds until locked for a moment. GaN T/R Modules classify faster.',
  package: 'Attack package: several types covering each other. The log says which element to kill first; mark it.',
  placing: 'Click open ground inside the dashed build zone to build it (not on water, rock or woods): the green ghost shows its field of fire, the pulsing ring covers the most open sky. Guns shoot inside their field of fire (drawn on the ground), and a target inside two of them takes +20% crossfire damage. Ground matters: high ground by a rock outcrop reaches 20% further but draws drones and cruise missiles, the treeline hides a unit from both (-15% range), and MGs on a road reload fast. Click your units to upgrade, sell or move them [B]. O maps what your guns cover. WASD / arrows or middle-drag pan the camera.',
  padDown: 'FPVs and Lancets dive on units they fly close to, the forward line most of all. A unit that is down repairs to half before it fights again; the build window repairs everything.',
  drop: `Salvage: a kill left something behind. Click it within ${DROP_LIFE}s to recover it: credits, a refill, a repair, overdrive, or a free upgrade from the heavy kills.`,
  level: 'Base level up: every level builds something that changes what the battery can do, plus a launcher and 2 perimeter pads. Pads fire on their own, without lock slots.',
};
const seenTips = (() => { try { return new Set<string>(JSON.parse(localStorage.getItem('x5-tips') ?? '[]')); } catch { return new Set<string>(); } })();

// One line to paste in a chat.
export const resultLine = (s: State) => `X5 COMMANDER · ${s.daily ? `DAILY OP ${s.daily}` : `${DOCTRINES.find(d => d.id === s.doctrine)!.name} RUN`} · ${clock(s.t)} · ${fmt(s.kills)} kills · lv ${s.level} · ${s.stats.clean}/${s.stats.raids} clean raids`;

const docsHtml = (s: State, best: Best) => DOCTRINES.map((d, i) => {
  const open = d.unlock(best);
  return `<button class="perk frame${d.id === s.doctrine ? ' sel' : ''}${open ? '' : ' locked'}" data-a="doc${i}"><b>${d.name}</b><span>${open ? d.desc : `LOCKED · ${d.need}`}</span><kbd>[${i + 1}]</kbd></button>`;
}).join('');

// After the run: what to do next time about the threat that did the most damage.
const LESSONS: Record<keyof typeof ENEMIES, string> = {
  scout: 'Lancets hunt your units: keep guns covering each other, and an observer post to see them early.',
  drone: 'more guns across the front, and crossfire where their fields of fire overlap.',
  swarm: 'FPVs come in packs: MANTIS and crossfire shred them.',
  tank: 'Mi-28s hover and fire: mark them as the priority target and kill them on station.',
  elite: 'kill Su-34s before they release: mark them, and have Stingers or the Patriot up by SEAD.',
  decoy: 'decoys do no damage.',
  arm: 'go silent with [F] EMCON as ARMs close, or try LPI radar mode.',
  ew: 'jammers do no damage themselves.',
  tbm: 'only the Patriot stops Iskanders: keep interceptors stocked.',
  cruise: 'IRIS-T SLM takes on missiles first, and the radar needs range to see them low.',
  atgm: 'kill the Mi-28 while it hovers: its missiles come 4 s apart, and guns can shoot them down.',
  kab: 'glide bombs are slow but heavy: kill the Su-34 first, or keep guns on the front to shoot the bombs.',
};
const PERIM_NAMES = { mg: 'AA MG', mantis: 'MANTIS', stinger: 'STINGER', iris: 'IRIS-T SLM', jammer: 'JAMMER', observer: 'OBSERVER', ammo: 'AMMO' };
function debrief(s: State) {
  const S = s.stats, total = Object.values(S.dmg).reduce((a, b) => a + b, 0) || 1;
  const kills = (Object.entries(S.kills) as [keyof typeof ENEMIES, number][]).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<dt>${ENEMIES[k].code}</dt><dd>${fmt(n)}</dd>`).join('');
  const dmg = Object.entries(S.dmg).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<dt>${k}</dt><dd>${Math.round(n / total * 100)}%</dd>`).join('');
  const perim = (Object.entries(S.perim) as [keyof typeof PERIM_NAMES, number][]).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<dt>${PERIM_NAMES[k]}</dt><dd>${fmt(n)}</dd>`).join('');
  // What hurt the battery, and a line on the worst of it.
  const hurt = (Object.entries(S.taken) as [keyof typeof ENEMIES, number][]).sort((a, b) => b[1] - a[1]);
  const taken = hurt.slice(0, 6).map(([k, n]) => `<dt>${ENEMIES[k].code}</dt><dd>${fmt(Math.round(n))}</dd>`).join('');
  const lesson = hurt.length ? `<p class="lesson"><span class="alert">MOST DAMAGE · ${ENEMIES[hurt[0][0]].code}</span> · ${LESSONS[hurt[0][0]]}</p>` : '';
  return `${lesson}<div class="debrief"><div><small>KILLS</small><dl>${kills || '<dt>none</dt>'}</dl></div>${perim ? `<div><small>PERIMETER KILLS</small><dl>${perim}</dl></div>` : ''}<div><small>DAMAGE DEALT</small><dl>${dmg || '<dt>none</dt>'}</dl></div>
    <div><small>HP LOST TO</small><dl>${taken || '<dt>nothing</dt>'}</dl></div>
    <div><small>OPS</small><dl><dt>RAIDS CLEAN</dt><dd>${S.clean} / ${S.raids}</dd><dt>ARMS EVADED</dt><dd>${S.armsEvaded}</dd><dt>RADAR HITS</dt><dd>${S.radarHits}</dd><dt>SALVAGE</dt><dd>${S.recovered} / ${S.drops}</dd></dl></div></div>`;
}

export function createHud(actions: { buy(id: string): void; perk(i: number): void; pad(act: string): void; start(daily?: boolean): void; restart(): void; doctrine(i: number): void; look(x: number, z: number): void }) {
  for (const [k, v] of Object.entries(PAL)) document.documentElement.style.setProperty(`--${k}`, rgba(v));

  // ---- shop (built once) ----
  // One section per group. Before the radar the PERIMETER section comes first: guns are what the battery has.
  // Rows waiting on something you don't own yet (NEEDS RADAR / PATRIOT) fold away; a section with nothing
  // else left shows only its header and what it's waiting for.
  const shop = $('shop'), rows = new Map<string, HTMLButtonElement>(), groups = new Map<string, HTMLElement>();
  for (const u of UPGRADES) {
    let sec = groups.get(u.group);
    if (!sec) {
      sec = document.createElement('section'); sec.innerHTML = `<h4>${u.group}<i></i></h4>`;
      shop.append(sec); groups.set(u.group, sec);
    }
    const b = document.createElement('button');
    const ranks = u.max === Infinity && u.group !== 'PERIMETER';
    b.innerHTML = `<span>${u.name}</span><span class="lv"></span><span class="c"></span><span class="d">${u.desc}${ranks ? ` · every ${MILESTONE}th level: rank up, +1 free level` : ''}</span>`;
    b.onclick = () => actions.buy(u.id);
    sec.append(b); rows.set(u.id, b);
  }
  let gunsFirst: boolean | null = null;
  function arrangeShop(s: State) {
    const first = !s.st.radar;
    if (first !== gunsFirst) {
      gunsFirst = first;
      const perim = groups.get('PERIMETER')!;
      if (first) shop.prepend(perim); else shop.append(perim);
    }
    for (const sec of groups.values()) {
      let open = 0, need = '';
      sec.querySelectorAll('button').forEach(b => { if (b.classList.contains('needs')) need ||= b.children[2].textContent ?? ''; else open++; });
      sec.classList.toggle('shut', !open);
      const i = sec.querySelector('h4 i')!, t = open ? '' : ` · ${need}`;
      if (i.textContent !== t) i.textContent = t;
    }
  }

  if (matchMedia('(pointer: coarse)').matches) shop.classList.add('hidden'); // phones: map first, shop on demand
  document.body.classList.toggle('shop-open', !shop.classList.contains('hidden'));
  const portrait = matchMedia('(orientation: portrait) and (max-width: 760px)'); // keep in step with style.css

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
  let shownPhase = '', shownDoc = '', shownSeed = NaN;
  function showOverlay(s: State) {
    const key = s.phase + s.perkChoices.join();
    // Doctrine picks only redraw their row, so the boot text doesn't replay.
    if (key === shownPhase && s.phase === 'start' && s.doctrine !== shownDoc) { shownDoc = s.doctrine; overlay.querySelector('.docs')!.innerHTML = docsHtml(s, loadBest()); }
    if (s.phase === 'start' && s.seed !== shownSeed) { shownSeed = s.seed; const m = overlay.querySelector('.mapline'); if (m) m.textContent = `MAP ${mapName(s.seed)} · [N] NEW MAP`; }
    if (key === shownPhase) return;
    shownDoc = s.doctrine;
    shownPhase = key;
    const best = loadBest();
    let html = '';
    const D = 0.35; // s per boot line
    if (s.phase === 'start') html = `<div class="card"><h1 class="logo"><b>X5</b> COMMANDER</h1><p class="byline">by CDS</p>
      <div class="boot">${BOOT.map((l, i) => `<p style="--n:${l.length + 2};--d:${i * D}s">&gt; ${l}</p>`).join('')}</div>
      <div class="later" style="--d:${BOOT.length * D}s"><p class="dim">SCAN · DETECT · LOCK · ENGAGE · EXPAND</p><br>
      <p>You start with <b>one machine gun</b> and your eyes. Guns fire by themselves at whatever they can see.</p>
      <p><b class="hot">Build more guns</b> from the PERIMETER shop on the right, then <b>click open ground</b> to place them. Cover the <span class="alert">front</span> first.</p>
      <p>Every few purchases the battery levels up: a bigger build zone, new units and a <b class="hot">perk</b>.</p>
      <p>From battery level 3, build the <b>radar</b> to see further and lock targets, then the <b>Patriot</b>.</p>
      <p>Anti-radiation missiles <span class="alert">home on your radar</span>. <b>[F] EMCON</b> goes silent so they miss, but you lose every lock.</p>
      <p class="dim mapline"></p>
      ${best.time ? `<p class="dim">BEST · ${clock(best.time)} · ${fmt(best.kills)} kills · base lv ${best.level}</p>` : ''}
      <p class="dim">DOCTRINE · starting loadout, unlocked by your records</p><div class="perks docs">${docsHtml(s, best)}</div>
      <button class="btn" data-a="start">DEPLOY [SPACE]</button> <button class="btn" data-a="daily">DAILY OP [D]</button>
      <p class="dim">Daily op: same raid for everyone today. ${(d => d.time ? `Your best today · ${clock(d.time)} · ${fmt(d.kills)} kills` : 'Not flown yet today.')(loadDaily(new Date().toISOString().slice(0, 10)))}</p></div></div>`;
    else if (s.phase === 'pause') html = `<div class="card"><h2>PAUSED</h2><p class="dim">[P] resume</p></div>`;
    else if (s.phase === 'perk') html = `<div class="card"><h2>BATTERY LEVEL ${s.level} · ${baseLevelInfo(s.level).name}</h2><p class="hot">${baseLevelInfo(s.level).desc}</p>${s.level > 1 ? `<p class="dim">${s.st.weapons.cannon ? '+1 M903 LAUNCHER · ' : ''}${perimSlots(s.level)} PERIMETER PADS</p>` : ''}<h2>CHOOSE A PERK</h2><div class="perks">${
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
    if (s.phase === 'start') { shownSeed = NaN; showOverlay(s); }
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

  const popAt = (px: number, py: number, text: string, cls: string) => {
    const el = popups[nextPop = (nextPop + 1) % popups.length];
    el.textContent = text; el.style.left = `${px}px`; el.style.top = `${py}px`;
    el.className = cls; void el.offsetWidth; el.classList.add('go');
  };
  // What a purchase did, floating up off its shop row (or the battery, with the shop closed).
  function upgradePop(project: Project, id: string, n: number, star: boolean) {
    const u = UPGRADES.find(u => u.id === id)!, r = rows.get(id)!.getBoundingClientRect();
    const text = star ? `★ RANK ${rank(n)} · +1 FREE LV` : u.max === 1 ? 'ONLINE' : u.group === 'PERIMETER' ? `+1 ${u.name.toUpperCase()}` : `LV ${n} · ${u.desc.split(' · ')[0].split(',')[0]}`;
    if (r.width) popAt(r.left + r.width / 2, r.top + r.height / 2, text, star ? 'up star' : 'up');
    else pop(project, 0, 0, text, star ? 'up star' : 'up');
  }
  const LOOT = (e: { drop: keyof typeof DROPS; n: number; id: string }) => ({
    cache: `+${fmt(e.n)} CR`, ammo: 'INTERCEPTORS FULL', power: 'POWER FULL', repair: 'REPAIRED', overdrive: `OVERDRIVE ${OVERDRIVE.time}s`,
    tech: e.id ? `+1 ${UPGRADES.find(u => u.id === e.id)!.name.toUpperCase()}` : `+${fmt(e.n)} CR`,
  })[e.drop];

  // ---- minimap: the terrain from above, turned with the camera: build zone, your units, contacts, the radar.
  // Click it to look there. ----
  const cv = $('radar') as HTMLCanvasElement, g = cv.getContext('2d')!;
  const MAP_R = ARENA_R + 6, C = cv.width / 2, K = C / MAP_R, IMG_R = MAP_R * 1.45;
  let map: HTMLCanvasElement, mapKey = NaN;
  const paintMap = () => { // repainted for each new map; phosphor tint: the terrain keeps its light and shade, in scope green
    mapKey = mapSeed; map = paintTerrain(320, IMG_R);
    const t = map.getContext('2d')!;
    t.globalCompositeOperation = 'color'; t.fillStyle = rgba(PAL.mid); t.fillRect(0, 0, map.width, map.height);
    t.globalCompositeOperation = 'source-over';
  };
  paintMap();
  let lastSweep = 0, mapYaw = Math.PI / 2;
  const launches: { a: number; until: number }[] = []; // recent missile launches, flashed at the rim
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), dx = ((e.clientX - r.left) / r.width * cv.width - C) / K, dy = ((e.clientY - r.top) / r.height * cv.height - C) / K;
    const sy = Math.sin(mapYaw), cy = Math.cos(mapYaw);
    actions.look(dx * sy + dy * cy, -dx * cy + dy * sy);
    e.stopPropagation();
  });
  function drawRadar(s: State, yaw: number, look: { x: number; z: number }) {
    mapYaw = yaw;
    if (mapSeed !== mapKey) paintMap();
    const sy = Math.sin(yaw), cy = Math.cos(yaw), TAU = Math.PI * 2;
    const px = (x: number, z: number) => C + (x * sy - z * cy) * K, py = (x: number, z: number) => C + (x * cy + z * sy) * K;
    const ring = (x: number, z: number, r: number, col: string, lw = 1, dash: number[] = []) => {
      g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(dash); g.beginPath(); g.arc(px(x, z), py(x, z), r * K, 0, TAU); g.stroke(); g.setLineDash([]); g.lineWidth = 1;
    };
    const rimArc = (w: number, col: string, lw: number) => {
      const m = Math.atan2(py(Math.cos(FRONT), Math.sin(FRONT)) - C, px(Math.cos(FRONT), Math.sin(FRONT)) - C);
      g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.arc(C, C, ARENA_R * K, m - w, m + w); g.stroke(); g.lineWidth = 1;
    };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#020a05'; g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(sy * K, cy * K, -cy * K, sy * K, C, C);
    g.globalAlpha = 0.6; g.drawImage(map, -IMG_R, -IMG_R, 2 * IMG_R, 2 * IMG_R); g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    for (let r = 20; r <= ARENA_R; r += 20) ring(0, 0, r, rgba(PAL.bright, 0.18)); // range rings
    const play = s.phase === 'play' || s.phase === 'pause';
    // The front, and the wider arc long-range drones and missiles can come from right now.
    if (flankArc(s.stage) > FRONT_ARC) rimArc(Math.min(Math.PI, flankArc(s.stage)), rgba(PAL.alert, 0.6), 2);
    rimArc(FRONT_ARC, 'rgba(255,90,68,0.95)', 3);
    ring(0, 0, buildR(s.level), s.placing || s.relocating ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)', 1, [3, 3]);
    // Gaps: bearings in the threat arc that no working gun covers, 22m out, as amber ticks on the rim.
    if (play) {
      const guns = s.perim.filter(p => GUNS.includes(p.k) && !p.down).map(p => ({ p, r: padStats(s, p).range }));
      const arc = Math.min(Math.PI, Math.max(FRONT_ARC, flankArc(s.stage))), R = ARENA_R + 1;
      g.strokeStyle = rgba(PAL.alert, 0.95); g.lineWidth = 2; g.beginPath();
      for (let i = 0; i <= 36; i++) {
        const a = FRONT + (i / 18 - 1) * arc, c = Math.cos(a), sn = Math.sin(a);
        if (guns.some(({ p, r }) => covers(p, c * 22, sn * 22, r))) continue;
        g.moveTo(px(c * R, sn * R), py(c * R, sn * R)); g.lineTo(px(c * (R + 4), sn * (R + 4)), py(c * (R + 4), sn * (R + 4)));
      }
      g.stroke(); g.lineWidth = 1;
    }
    const rr = s.st.radar ? radarRange(s) : VISUAL_R, a = s.sweepA + Math.PI / 2 - yaw, sector = radarSector(s), on = emitting(s);
    ring(0, 0, rr, s.st.radar ? rgba(PAL.hot, on ? 0.8 : 0.3) : 'rgba(255,255,255,0.5)');
    lastSweep = s.sweepA;
    if (on && sector) { // FOCUSED: the searched arc
      const f = focusBearing(s), sa = Math.atan2(py(Math.cos(f), Math.sin(f)) - C, px(Math.cos(f), Math.sin(f)) - C);
      g.fillStyle = rgba(PAL.hot, 0.15); g.beginPath(); g.moveTo(C, C); g.arc(C, C, rr * K, sa - sector / 2, sa + sector / 2); g.closePath(); g.fill();
    }
    if (on && !s.st.aesa && !sector) { g.strokeStyle = rgba(PAL.hot, 0.9); g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(a) * rr * K, C + Math.sin(a) * rr * K); g.stroke(); }
    for (const e of s.enemies) if (e.kind === 'ew' && e.orbit) { // jam strobe: bearing only, no range
      const d = Math.hypot(e.x, e.z) || 1, R = ARENA_R + 4;
      g.strokeStyle = rgba(PAL.alert, 0.2 + Math.random() * 0.4); g.lineWidth = 2;
      g.beginPath(); g.moveTo(C, C); g.lineTo(px(e.x / d * R, e.z / d * R), py(e.x / d * R, e.z / d * R)); g.stroke(); g.lineWidth = 1;
    }
    // Yours: the battery and every unit (grey while down, outlined when picked).
    g.fillStyle = rgba(PAL.hot); g.fillRect(C - 4, C - 4, 8, 8);
    for (const p of s.perim) {
      const x = px(p.x, p.z), y = py(p.x, p.z);
      g.fillStyle = p.down ? '#888' : rgba(PAL.hot); g.fillRect(x - 2.5, y - 2.5, 5, 5);
      if (p.slot === s.selected) { g.strokeStyle = '#fff'; g.strokeRect(x - 4.5, y - 4.5, 9, 9); }
    }
    // Salvage on the ground: gold diamonds.
    g.fillStyle = '#ffd966';
    for (const d of s.drops) { const x = px(d.x, d.z), y = py(d.x, d.z); g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 4, y); g.lineTo(x, y + 4); g.lineTo(x - 4, y); g.fill(); }
    // Contacts: red, missiles amber, a classified decoy grey; locked ones boxed.
    for (const e of s.enemies) {
      if (!visible(s, e)) continue;
      const x = px(e.x, e.z), y = py(e.x, e.z), r = 2 + e.size;
      g.fillStyle = e.ided ? '#999' : MUNITIONS.includes(e.kind) ? rgba(PAL.alert) : '#ff4d3a';
      g.beginPath(); g.arc(x, y, r / 2, 0, TAU); g.fill();
      if (e.locked) { g.strokeStyle = e.id === s.marked ? '#fff' : rgba(PAL.hot); g.strokeRect(x - r, y - r, r * 2, r * 2); }
    }
    for (const w of launches) if (s.t < w.until && Math.sin(s.t * 16) > 0) { // missile launches: blinking tick at their bearing
      const R = ARENA_R - 2, c = Math.cos(w.a), sn = Math.sin(w.a);
      g.strokeStyle = rgba(PAL.alert); g.lineWidth = 3; g.beginPath();
      g.moveTo(px(c * R, sn * R), py(c * R, sn * R)); g.lineTo(px(c * (R + 5), sn * (R + 5)), py(c * (R + 5), sn * (R + 5))); g.stroke(); g.lineWidth = 1;
    }
    if (s.raid && Math.sin(s.t * 12) > 0) { // incoming raid: blinking chevron at the rim
      const R = ARENA_R - 2, c = Math.cos(s.raid.a), sn = Math.sin(s.raid.a), tx = -sn * 4, tz = c * 4;
      g.strokeStyle = rgba(PAL.alert); g.lineWidth = 2; g.beginPath();
      g.moveTo(px(c * (R + 4) + tx, sn * (R + 4) + tz), py(c * (R + 4) + tx, sn * (R + 4) + tz));
      g.lineTo(px(c * R, sn * R), py(c * R, sn * R));
      g.lineTo(px(c * (R + 4) - tx, sn * (R + 4) - tz), py(c * (R + 4) - tx, sn * (R + 4) - tz));
      g.stroke(); g.lineWidth = 1;
    }
    // Where the camera looks.
    { const x = px(look.x, look.z), y = py(look.x, look.z); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.strokeRect(x - 7, y - 5, 14, 10); }
    if (s.t < s.radarDownUntil && s.phase === 'play') { // knocked out: static, and say so
      for (let i = 0; i < 60; i++) { g.fillStyle = rgba(PAL.crit, Math.random() * 0.5); g.fillRect(Math.random() * cv.width, Math.random() * cv.height, 2, 1 + Math.random() * 2); }
      g.fillStyle = rgba(PAL.crit); g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.fillText('NO RADAR', C, C - 12);
    }
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
      const el = labels[n++], [x, y] = project(e.x, e.z, flightAlt(e) + e.size * 1.6 * 0.6);
      const t = `${tag(e)} · ${pad3(Math.hypot(e.x, e.z))}m`;
      if (el.textContent !== t) el.textContent = t;
      el.style.transform = `translate(${Math.round(x + 12 + e.size * 10)}px, ${Math.round(y - 14)}px)`;
      el.className = e.id === s.marked ? 'on mk' : 'on';
    }
    for (let i = n; i < labels.length; i++) if (labels[i].className) labels[i].className = '';
    // Guns the interceptor pool can't feed right now.
    let m = 0;
    if (s.phase === 'play') for (const p of s.perim) {
      if (!noAmmo(s, p) || m >= padLabels.length) continue;
      const el = padLabels[m++], [x, y] = project(p.x, p.z, 3);
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
      el.className = 'on na';
    }
    for (let i = m; i < padLabels.length; i++) if (padLabels[i].className) padLabels[i].className = '';
  }
  const padLabels = Array.from({ length: 16 }, () => { const el = $('labels').appendChild(document.createElement('div')); el.textContent = 'NO AMMO'; return el; });

  // ---- text (throttled) ----
  let ffSpeed = 1, acc = 1, lastPhase = '', armSaid = -99, tbmSaid = -99, cruiseSaid = -99, shopForBuild = false;
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

  const shopBtn = document.querySelector<HTMLElement>('#touch [data-k=Tab]')!;
  let buyable = 0; // shop rows you can afford right now: counted on the SHOP button so the shop can stay closed
  const flow = { t: 0, p: 0, a: 0, dp: 0, da: 0 };
  const infoEl = $('info');
  let infoHtml = '';

  // ---- threat board: what's attacking, and the few that matter most right now ----
  const threatEl = $('threats');
  let threatHtml = '';
  // Urgency: damage it would do over the time it needs to get here. Jammers and ARMs rank by what they do instead.
  const urgency = (e: Enemy) => {
    const k = shownKind(e), d = Math.hypot(e.x, e.z), eta = Math.max(0.5, (d - BASE_R) / e.speed);
    return e.act === 'egress' ? 0.1 : k === 'ew' ? (e.orbit ? 4 : 1) : k === 'arm' ? 30 / eta : e.act === 'hover' ? ENEMIES[k].dmg / 4 : ENEMIES[k].dmg / eta;
  };
  function threatBoard(s: State) {
    const seen = s.enemies.filter(e => visible(s, e) && !e.ided);
    const count: Partial<Record<string, number>> = {};
    for (const e of seen) { const c = ENEMIES[shownKind(e)].code; count[c] = (count[c] ?? 0) + 1; }
    const top = seen.map(e => [urgency(e), e] as const).sort((a, b) => b[0] - a[0]).slice(0, 4);
    const worst = top[0]?.[0] ?? 0;
    const h = !seen.length ? '' : `<small>THREATS · ${seen.length}</small> ${Object.entries(count).sort((a, b) => b[1]! - a[1]!).map(([c, n]) => `${n} ${c}`).join(' · ')}` +
      top.map(([u, e]) => { const d = Math.hypot(e.x, e.z), k = shownKind(e);
        return `<div class="${u >= worst * 0.6 && u > 2 || MUNITIONS.includes(k) ? 'alert' : ''}${e.id === s.marked ? ' mk' : ''}">${e.locked ? '◆' : '◇'} ${ENEMIES[k].code} ${pad3(bearing(e.x, e.z))}° ${pad3(d)}m ${doing(e)}</div>`; }).join('');
    if (h !== threatHtml) { threatHtml = h; threatEl.innerHTML = h; }
  }

  // ---- what to buy: the one shop row that fixes today's bottleneck ----
  const cheaper = (s: State, a: string, b: string) => cost(s, a) <= cost(s, b) ? a : b;
  const GUN_IDS = ['mg', 'mantis', 'stinger', 'iris'];
  function suggest(s: State) {
    const st = s.st;
    if (s.phase !== 'play') return '';
    for (const id of ['radar', 'pac3']) if (!s.lv[id] && !lockReason(s, id)) return id; // the milestones, once open
    // A free unit slot is the best buy there is before the radar, and still a good one after.
    const gun = s.perim.length < perimSlots(s.level) && !s.placing ? GUN_IDS.filter(id => !lockReason(s, id)).reduce<string>((a, b) => !a || cost(s, b) < cost(s, a) ? b : a, '') : '';
    if (!st.radar) return s.hp < st.maxHp * 0.5 ? cheaper(s, 'hp', 'repair') : gun || cheaper(s, 'dmg', 'rate');
    if (s.ammo < st.ammoCap * 0.25) return cheaper(s, 'aprod', 'acap');
    if (s.power < st.powerCap * 0.25 || s.sweepSpeed < st.sweep * 0.99 && emitting(s)) return 'gen';
    if (s.hp < st.maxHp * 0.5) return cheaper(s, 'hp', 'repair');
    let locks = 0, waiting = 0;
    for (const e of s.enemies) { if (e.locked) locks++; else if (visible(s, e) && !e.ided && e.x * e.x + e.z * e.z <= st.trackRange ** 2) waiting++; }
    if (locks >= slots(s) && waiting >= 2) return 'slots';
    return gun || cheaper(s, 'dmg', 'range');
  }
  function text(s: State) {
    const st = s.st;
    set('credits', fmt(s.credits)); set('phase', phaseName(s)); set('time', clock(s.t));
    set('kills', fmt(s.kills)); set('level', String(s.level));
    { // progress to the next base level: 1.5*(L-1)*L purchases reach level L (config.baseLevel)
      const lo = 1.5 * (s.level - 1) * s.level, hi = 1.5 * s.level * (s.level + 1), r = String(Math.round(Math.max(0, s.bought - lo) / (hi - lo) * 20) / 20);
      const el = $('level').parentElement!; if (el.style.getPropertyValue('--r') !== r) el.style.setProperty('--r', r); }
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
    const noRadar = '<span class="dim">NONE</span>';
    const M = radarMode(s), scan = !st.radar ? 'VISUAL' : s.radarMode === 0 ? M.name : `<span class="hot">${M.name}${radarSector(s) ? ` ${pad3(bearing(Math.cos(focusBearing(s)), Math.sin(focusBearing(s))))}°` : ''}</span>`;
    // Grouped by what you're deciding: what the radar sees, what fire control does, the battery's state.
    const lockBar = `<b class="seg lk" style="--r:${slots(s) ? Math.min(1, locks / slots(s)) : 0}"></b>`;
    const html = [
      ['// SENSORS', ''],
      ['SCAN <kbd>[V]</kbd>', scan], ['RADAR <kbd>[F]</kbd>', st.radar ? radar : noRadar], ['RANGE', `${Math.round(st.radar ? radarRange(s) : VISUAL_R)}m`], ['TRACKS', contacts],
      ['// FIRE CONTROL', ''],
      ['ENGAGED', !st.radar ? '<span class="dim">NO FIRE CONTROL</span>' : `${locks} / ${slots(s)}${s.t < s.chainUntil ? ' <span class="hot">+CHAIN</span>' : ''}${lockBar}`],
      ['FIRE <kbd>[G]</kbd>', s.discipline === 1 ? DISCIPLINES[1].name : `<span class="hot">${DISCIPLINES[s.discipline].name}</span>`],
      ['MODE <kbd>[T]</kbd>', MODES[s.mode]],
      ['INTERCEPT <kbd>[SPC]</kbd>', interceptActive(s) ? '<span class="hot">ENGAGING</span>' : (w => w ? `<span class="${w.endsWith('s') ? 'dim' : 'alert'}">${w}</span>` : '<span class="hot">READY</span>')(interceptBlock(s))],
      ['// BATTERY', ''],
      ['PERIMETER', `${s.perim.length} / ${perimSlots(s.level)} pads`],
      ...overdrive(s) ? [['OVERDRIVE', `<span class="hot">+${Math.round((OVERDRIVE.rate - 1) * 100)}% RATE ${Math.ceil(s.overdriveUntil - s.t)}s</span>`]] : [],
      ...ffSpeed > 1 ? [['SPEED <kbd>[X]</kbd>', `<span class="hot">${ffSpeed}×</span>`]] : [],
      ...s.placing ? [['PAD', `<span class="hot">CLICK GROUND · ${Math.max(0, PLACE_TIME - (s.t - s.placing.since)).toFixed(0)}s</span>`]] : [],
      ...s.raid ? [['RAID', `<span class="alert">${pad3(bearing(Math.cos(s.raid.a), Math.sin(s.raid.a)))}° T-${Math.max(0, s.raid.at - s.t).toFixed(0)}s</span>`]]
        : s.raidLeft ? [['RAID', `<span class="alert">${s.raidLeft}</span> · ${s.raidClean ? 'HELD' : '<span class="alert">LOST</span>'}`]]
        : building(s) ? [['BUILD', `<span class="hot">${Math.ceil(s.buildUntil - s.t)}s</span>`]] : [],
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
    const open = !shop.classList.contains('hidden');
    touch('Tab', open ? 'CLOSE' : buyable ? `SHOP ·${buyable}` : 'SHOP', open);
    shopBtn.classList.toggle('buy', !open && buyable > 0);
    touch('KeyX', '', ffSpeed > 1); touch('KeyP', '', s.phase === 'pause');
    raidCard(s);
    padCard(s);
    const live = s.phase === 'play' || s.phase === 'pause', down = live && s.t < s.radarDownUntil, silent = live && !down && s.emcon;
    document.body.classList.toggle('blind', down);
    document.body.classList.toggle('silent', silent);
    const bl = down ? `<b>RADAR DOWN ${(s.radarDownUntil - s.t).toFixed(1)}s</b><small>NO FIRE CONTROL · ${backupSearching(s) ? `TRML-4D SEARCHING ${Math.round(st.radarRange * 0.5)}m` : 'BLIND'}</small>`
      : silent ? '<b>EMCON · SILENT</b><small>NO LOCKS · TRACKS COASTING · [F] RADIATE</small>' : '';
    if (blindEl.innerHTML !== bl) blindEl.innerHTML = bl;
    const m = s.marked ? s.enemies.find(e => e.id === s.marked) : undefined;
    const d = m ? Math.hypot(m.x, m.z) : 0;
    $('target').innerHTML = m ? `<b>${tag(m)}</b><br>${ENEMIES[shownKind(m)].name}<br>BRG ${pad3(bearing(m.x, m.z))} · RNG ${pad3(d)}m · ${doing(m, 1)}<br>HP ${fmt(Math.max(0, m.hp))} / ${fmt(m.maxHp)}<b class="seg" style="--r:${Math.max(0, m.hp / m.maxHp)}"></b>` : '';
    const hint = suggest(s);
    buyable = 0;
    for (const [id, b] of rows) {
      const c = cost(s, id), lv = s.lv[id] ?? 0;
      b.classList.toggle('hint', id === hint);
      const why = lockReason(s, id), tr = toRank(s, id), lvT = lv ? `LV ${lv}${tr && rank(lv) ? ` ★${rank(lv)}` : ''}` : '', cT = why || (c === Infinity ? 'MAX' : fmt(c));
      const ms = tr ? String((MILESTONE - tr) / MILESTONE) : '0'; // progress to the next rank, as a bar under the row
      if (b.style.getPropertyValue('--ms') !== ms) b.style.setProperty('--ms', ms);
      b.classList.toggle('rank', tr === 1 && !why);
      if (b.children[1].textContent !== lvT) b.children[1].textContent = lvT; // write only on change: no DOM churn at 10 Hz
      if (b.children[2].textContent !== cT) b.children[2].textContent = cT;
      b.classList.toggle('can', s.credits >= c);
      if (s.credits >= c && !why) buyable++;
      b.classList.toggle('max', c === Infinity && !why);
      b.classList.toggle('locked', !!why);
      b.classList.toggle('needs', why.startsWith('NEEDS'));
    }
    arrangeShop(s);
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

  // ---- the unit you picked: what it does, upgrade / sell buttons, how to move it ----
  const pc = $('padcard');
  let pcHtml = '';
  pc.addEventListener('click', e => { const b = (e.target as HTMLElement).closest('button'); if (b?.dataset.act) actions.pad(b.dataset.act); });
  const BELTS = { fwd: 'FORWARD LINE', main: 'MAIN LINE', inner: 'INNER RING' };
  const SITES: Record<string, string> = { high: 'HIGH GROUND: +20% RANGE, EXPOSED', treeline: 'TREELINE: HIDDEN, -15% RANGE', road: 'ROAD: QUICK RELOADS' };
  const SUPPORT: Record<string, string> = { observer: `SEES ${OBSERVER_EYES}m ROUND ITSELF`, ammo: `GUNS WITHIN ${AMMO_R}m: +25% RATE, 2× RELOAD`, jammer: `SLOWS CONTACTS WITHIN ${PERIM.jammer.range}m` };
  // Kills and veterancy rank, with the kills to the next one.
  const vetLine = (kills: number) => {
    const r = vetRank(kills), next = VETERANCY[r + 1];
    return `KILLS ${fmt(kills)} · ${r ? `<span class="hot">★ ${VETERANCY[r].name}</span>` : VETERANCY[r].name}${next ? ` <small class="dim">${next.kills - kills} TO ${next.name}</small>` : ''}<br>`;
  };
  function padCard(s: State) {
    const p = selectedPad(s);
    let h = '';
    if (p && (s.phase === 'play' || s.phase === 'pause')) {
      const w = padStats(s, p), up = padUpgradeCost(p), fan = FANS[p.k] >= Math.PI ? 360 : Math.round(FANS[p.k] * 360 / Math.PI);
      h = `<b>${padName(p)}</b> · ${BELTS[beltOf(p)]}${p.site ? ` · <span class="hot">${SITES[p.site]}</span>` : ''}<br>`
        + (GUNS.includes(p.k) ? `${Math.round(w.range)}m · ${(w.dmg * w.rate).toFixed(1)} DMG/s · ${fan}° FIELD OF FIRE<br>` : `${SUPPORT[p.k]}<br>`)
        + (GUNS.includes(p.k) ? vetLine(p.kills) : '') + `HP ${Math.ceil(p.hp)} / ${PAD_HP}${p.down ? ' <span class="alert">DOWN</span>' : ''}<b class="seg" style="--r:${p.hp / PAD_HP}"></b>`
        + (up < Infinity ? `<button data-act="upgrade"${s.credits < up ? ' disabled' : ''}>[U] ${MG_TIERS[p.tier + 1].name} ${up}CR</button>` : '')
        + `<button data-act="move"${s.relocating ? ' class="on"' : ''}>[B] MOVE</button><button data-act="sell">[DEL] SELL +${fmt(sellValue(s, p))}</button><br>`
        + `<small class="dim">${s.relocating ? 'CLICK OPEN GROUND TO MOVE IT' : 'B OR RIGHT-CLICK GROUND: MOVE'}${building(s) ? ' · FREE NOW' : ` · ${MOVE_TIME}s OFFLINE`}</small>`;
    }
    if (h !== pcHtml) { pcHtml = h; pc.innerHTML = h; }
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
    } else if (on && building(s)) { // level card: how it went, what's next, and how long to build
      const next = stageInfo(s.stage + 1), arc = flankArc(s.stage + 1), wider = arc > flankArc(s.stage);
      h = `<small>LEVEL ${s.stage + 1} COMPLETE · OBJECTIVE ${s.raidClean ? '<span class="obj">HELD</span>' : 'LOST'}</small><b>BUILD · ${Math.ceil(s.buildUntil - s.t)}s</b>`
        + `NEXT: L${s.stage + 2} ${next.name} · ${next.desc.toUpperCase()}`
        + (wider ? `<br><span class="obj">DRONES + MISSILES FROM ${arc >= Math.PI ? 'ANY DIRECTION' : `FRONT ±${Math.round(arc * 180 / Math.PI)}°`}</span>` : '')
        + `<br><button data-k="KeyN">[N] START NOW</button>`;
      cls = 'on build';
    }
    if (h !== rcHtml) { rcHtml = h; rc.innerHTML = h; }
    if (rc.className !== cls) rc.className = cls;
    document.body.classList.toggle('raid', !!cls && !cls.includes('build')); // amber frames for raids, not the level card
  }

  return {
    update(s: State, dt: number, yaw: number, project: Project, speed = 1, look = { x: 0, z: 0 }) {
      lastState = s; ffSpeed = speed;
      if (s.phase === 'play' && s.t > 2) tip('startMg', s.t);
      for (const e of s.events) tip(e.k, s.t);
      if (tipEl.classList.contains('on') && (s.t > tipUntil || s.t < tipUntil - 9 || s.phase === 'start')) tipEl.classList.remove('on');
      for (const e of s.events) {
        if (e.k === 'kill') {
          if (e.n) pop(project, e.x, e.z, `+${e.n}`, '');
          if (MUNITIONS.includes(e.kind!) && e.kind !== 'atgm') log(`${ENEMIES[e.kind!].code} INTERCEPTED BRG ${pad3(bearing(e.x, e.z))}`);
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
        if (e.k === 'cruise' || e.k === 'tbm' || e.k === 'arm') { launches.push({ a: Math.atan2(e.z, e.x), until: s.t + 4 }); if (launches.length > 12) launches.shift(); }
        if (e.k === 'build' && shop.classList.contains('hidden')) { shop.classList.remove('hidden'); document.body.classList.add('shop-open'); shopForBuild = true; } // open the shop to build
        if (e.k === 'stage' && shopForBuild) { shop.classList.add('hidden'); document.body.classList.remove('shop-open'); shopForBuild = false; }
        if (e.k === 'cruise') {
          const u = s.perim.find(p => p.slot === e.n);
          log(`CRUISE MISSILE BRG ${pad3(bearing(e.x, e.z))} · TARGET ${u ? `${padName(u)} ${pad3(bearing(u.x, u.z))}°` : 'BATTERY'}`, 'alert');
          if (s.t - cruiseSaid > 4) { cruiseSaid = s.t; say('⚠ CRUISE MISSILE · IT GOES FOR YOUR UNITS', 'warn'); }
        }
        else if (e.k === 'release') log(e.kind === 'kab' ? `SU-34 GLIDE BOMB RELEASE BRG ${pad3(bearing(e.x, e.z))}` : `MI-28 ATGM LAUNCH BRG ${pad3(bearing(e.x, e.z))}`, 'alert');
        else if (e.k === 'egress') log(`${ENEMIES[e.kind!].code} EGRESSING BRG ${pad3(bearing(e.x, e.z))}`);
        else if (e.k === 'tbm') { log(`BALLISTIC LAUNCH BRG ${pad3(bearing(e.x, e.z))}`, 'alert'); if (s.t - tbmSaid > 4) { tbmSaid = s.t; say('⚠ BALLISTIC MISSILE · PAC-3 ONLY', 'warn'); } }
        else if (e.k === 'radarDown') { say('⚠ RADAR HIT', 'warn'); log(`MPQ-65 HIT · OFFLINE ${(s.radarDownUntil - s.t).toFixed(0)}s`, 'alert'); }
        else if (e.k === 'radarMode') { acc = 1; const M = radarMode(s); log(`RADAR ${M.name} · RNG ${Math.round(radarRange(s))}m${M.lpi ? ' · ARMS BLIND >15m' : M.sector ? ' · ARM EXPOSURE HIGH' : ''}`, M.sector ? 'alert' : ''); }
        else if (e.k === 'killChain') log('KILL CHAIN · +1 LOCK SLOT 8s');
        else if (e.k === 'counterSead') log('ARM DOWN · COUNTER-SEAD · POWER RESTORED');
        else if (e.k === 'lastStand') { say('LAST STAND', 'warn'); log('LAST STAND · FIRE RATE UP · POWER DOWN', 'alert'); }
        else if (e.k === 'emcon') log(s.emcon ? 'EMCON · RADAR SILENT' : 'RADIATING', s.emcon ? 'alert' : '');
        else if (e.k === 'jam') log(`JAMMING BRG ${pad3(bearing(e.x, e.z))}`, 'alert');
        else if (e.k === 'ident') log('DECOY CLASSIFIED · TRACK RELEASED');
        else if (e.k === 'dud') log('DECOY IMPACT · NO DAMAGE');
        else if (e.k === 'placing') { if (s.placing) say(`BUILD ${s.placing.k.toUpperCase()}: CLICK OPEN GROUND`, 'info'); }
        else if (e.k === 'raid') { say(`⚠ ${e.name} · BRG ${pad3(bearing(e.x, e.z))}`, 'warn'); log(`${e.name} · BRG ${pad3(bearing(e.x, e.z))}`, 'alert'); }
        else if (e.k === 'package') {
          const p = PACKAGES.find(p => p.name === e.name)!;
          say(`${e.name} · BRG ${pad3(bearing(e.x, e.z))}`, 'warn');
          log(`${e.name} BRG ${pad3(bearing(e.x, e.z))} · KILL ${ENEMIES[p.first].code} FIRST`, 'alert');
          log(p.why.toUpperCase());
        }
        else if (e.k === 'raidStart') { say(`${e.name} · ENGAGE`, 'warn'); log(`RAID IN · ${e.name} · ${OBJECTIVES[s.raidObj]}`, 'alert'); }
        else if (e.k === 'raidClear') { say(`OBJECTIVE HELD · +${fmt(e.n)}`, 'info'); log(`RAID DEFEATED · +${fmt(e.n)} CR`); }
        else if (e.k === 'raidLeak') { say('OBJECTIVE LOST', 'warn'); log(`OBJECTIVE LOST · BUILD WINDOW CUT TO ${BUILD_LOST}s`, 'alert'); }
        else if (e.k === 'raidEnd') log('RAID OVER · NO BONUS', 'alert');
        else if (e.k === 'build') { say(`LEVEL ${s.stage + 1} COMPLETE · BUILD ${e.n}s`, 'info'); log(`LEVEL ${s.stage + 1} COMPLETE · BUILD WINDOW ${e.n}s · NO NEW CONTACTS`); }
        else if (e.k === 'padDown') { say('⚠ EMPLACEMENT DOWN', 'warn'); log(`${e.kind.toUpperCase()} DOWN BRG ${pad3(bearing(e.x, e.z))} · REPAIRING`, 'alert'); }
        else if (e.k === 'padUp') { if (e.n) { const n = MG_TIERS[e.n].name; say(n, 'info'); log(`UPGRADED · ${n}`); } else log(`${e.kind.toUpperCase()} BACK IN ACTION BRG ${pad3(bearing(e.x, e.z))}`); }
        else if (e.k === 'padRank') { const v = VETERANCY[e.n]; pop(project, e.x, e.z, `★ ${v.name}`, 'up star'); log(`${e.kind.toUpperCase()} BRG ${pad3(bearing(e.x, e.z))} · ${v.name} · +${Math.round((v.dmg - 1) * 100)}% DMG`); }
        else if (e.k === 'padSold') log(`${e.kind.toUpperCase()} SOLD · +${fmt(e.n)} CR`);
        else if (e.k === 'padMoved') log(`${e.kind.toUpperCase()} MOVED${e.n ? ` · OFFLINE ${e.n}s` : ''}`);
        else if (e.k === 'radarOnline') { say('RADAR ONLINE', 'info'); log('AN/MPQ-65 ONLINE · SEARCH + FIRE CONTROL'); }
        else if (e.k === 'pac3') { say('PATRIOT ONLINE', 'info'); log('PAC-3 MSE ONLINE · ENGAGING LOCKS'); }
        else if (e.k === 'aesa') { say('LTAMDS ONLINE · 360° STARE', 'info'); log('AESA ONLINE · SWEEP RETIRED'); }
        else if (e.k === 'level') { const b = baseLevelInfo(s.level); say(`LV ${s.level} · ${b.name}`, 'info'); log(`BATTERY LV ${s.level} · ${b.name} · ${b.desc}`); }
        else if (e.k === 'upgrade') {
          acc = 1; upgradePop(project, e.id, e.n, e.star);
          if (e.star) { const u = UPGRADES.find(u => u.id === e.id)!; say(`★ ${u.name.toUpperCase()} · RANK ${rank(e.n)}`, 'info'); log(`${u.name.toUpperCase()} RANK ${rank(e.n)} · +1 FREE LEVEL`); }
        }
        else if (e.k === 'drop') { pop(project, e.x, e.z, `▼ ${DROPS[e.drop].name}`, 'loot'); log(`SALVAGE · ${DROPS[e.drop].name} BRG ${pad3(bearing(e.x, e.z))} · CLICK TO RECOVER`); }
        else if (e.k === 'pickup') {
          const t = LOOT(e);
          pop(project, e.x, e.z, t, e.drop === 'tech' ? 'loot star' : 'loot');
          log(`RECOVERED ${DROPS[e.drop].name} · ${t}`);
          if (e.drop === 'tech' || e.drop === 'overdrive') say(`${DROPS[e.drop].name} · ${t}`, 'info');
        }
        else if (e.k === 'buy' || e.k === 'discipline') { acc = 1; if (e.k === 'discipline') log(`FIRE DISCIPLINE · ${DISCIPLINES[s.discipline].name}`); }
        else if (e.k === 'intercept') { say('EMERGENCY INTERCEPT', 'info'); log(`INTERCEPT ${pad3(bearing(e.x, e.z))} · ALL WEAPONS · ${INTERCEPT.time}s`, 'alert'); acc = 1; }
      }
      const pn = phaseName(s);
      if (s.phase === 'play' && pn !== lastPhase) {
        const { mod } = phase(s);
        if (lastPhase) { say(`LEVEL ${s.stage + 1} · ${phase(s).name}`, mod.name ? 'warn' : 'info'); if (mod.desc) log(mod.desc.toUpperCase(), 'alert');
          const arc = flankArc(s.stage);
          if (s.stage && arc > flankArc(s.stage - 1)) log(`DRONES + MISSILES NOW FROM ${arc >= Math.PI ? 'ANY DIRECTION' : `FRONT ±${Math.round(arc * 180 / Math.PI)}°`}`, 'alert'); }
        lastPhase = pn;
      }
      if (s.phase === 'start') { lastPhase = ''; armSaid = tbmSaid = cruiseSaid = -99; launches.length = 0; shopForBuild = false; }
      drawRadar(s, yaw, look);
      placeLabels(s, project);
      raidArrow(s, project);
      if (s.phase === 'play' && (logAcc += dt) >= 0.3) { logAcc = 0; scanLog(s); }
      showOverlay(s);
      if ((acc += dt) >= 0.1) { acc = 0; text(s); }
    },
    flash(id: string) { const b = rows.get(id)!; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); },
    toggleShop: () => document.body.classList.toggle('shop-open', !shop.classList.toggle('hidden')),
    coverage: (on: boolean) => document.body.classList.toggle('cov', on),
    // Phone portrait: px of screen the HUD covers at the top and bottom, so the view can centre the base in what's left.
    insets(): [number, number] {
      if (!portrait.matches) return [0, 0];
      const bottom = (shop.classList.contains('hidden') ? $('touch') : shop).getBoundingClientRect().top;
      return [$('left').getBoundingClientRect().bottom, innerHeight - bottom];
    },
    share,
  };
}
