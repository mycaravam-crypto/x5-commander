// The scoreboard and accounts client: talks to /api (server/api.ts) and draws the leaderboard and the sign-in form.
// On a static host there's no API: every read resolves null and the board is left out.
import { MEDALS, RANKS, COLORS, EMBLEMS, SHAPES, EMPTY_CAREER, avatarFor, avatarSvg, insigniaSvg, medalsOf, rankOf, xpOf, MOTTO_MAX, type Avatar, type Career } from '../server/career.ts';

export type Row = { id: number; rank: number; name: string; verified: number; avatar: string; xp: number; time: number; kills: number; level: number; earned: number; seed: string; daily: string; at: string };
export type Board = { rows: Row[]; total: number };
export type Posted = { run: Row; total: number; best: boolean; daily: { run: Row; rank: number; total: number } | null; promoted: number | null; medals: string[] };
export type Run = { time: number; kills: number; level: number; earned: number; seed: string; daily: string };
export type Me = { name: string; avatar: string; motto: string; best: Row | null; runs: number; total: number; career: Career };
export type Recent = Run & { id: number; at: string };
export type Profile = { name: string; avatar: string; motto: string; joined: string; career: Career; best: Row | null; total: number; recent: Recent[] };

// VITE_SCORES_API at build time points a game hosted elsewhere (GitHub Pages) at a scoreboard server, read-only (the
// session cookie isn't sent cross-site); default: this origin's /api.
const env = import.meta.env ?? {}; // undefined outside Vite (the Node tests)
const SCORES = env.VITE_SCORES_API || `${env.BASE_URL ?? '/'}api/scores`;
const API = SCORES.replace(/scores$/, '');

// Everything from the API is checked on the way in, before it's drawn: numbers become finite numbers, strings
// strings, dates YYYY-MM-DD[ HH:MM:SS], medal and rank ids ones this build knows. The templates below then only put
// numbers and escaped text into HTML (a stale or tampered server, or a bad row, can't inject markup or crash a draw).
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown, max = 200) => typeof v === 'string' ? v.slice(0, max) : '';
const date = (v: unknown) => { const s = str(v, 19); return /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(s) ? s : ''; };
const obj = (v: unknown) => (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
const cleanRun = (v: unknown) => { const o = obj(v); return { time: num(o.time), kills: num(o.kills), level: num(o.level), earned: num(o.earned), seed: str(o.seed, 40), daily: date(o.daily) }; };
const cleanRow = (v: unknown): Row => { const o = obj(v); return { ...cleanRun(o), id: num(o.id), rank: Math.max(1, num(o.rank)), name: str(o.name, 32), verified: num(o.verified) ? 1 : 0, avatar: str(o.avatar, 10), xp: num(o.xp), at: date(o.at) }; };
export const cleanBoard = (v: unknown): Board => { const o = obj(v); return { rows: Array.isArray(o.rows) ? o.rows.map(cleanRow) : [], total: num(o.total) }; };
const cleanCareer = (v: unknown): Career => { const o = obj(v); return Object.fromEntries(Object.keys(EMPTY_CAREER).map(k => [k, num(o[k])])) as Career; };
const cleanBest = (v: unknown) => v ? cleanRow(v) : null;
export const cleanMe = (v: unknown): Me | null => { if (!v) return null; const o = obj(v); return { name: str(o.name, 32), avatar: str(o.avatar, 10), motto: str(o.motto, MOTTO_MAX), best: cleanBest(o.best), runs: num(o.runs), total: num(o.total), career: cleanCareer(o.career) }; };
export const cleanProfile = (v: unknown): Profile => { const o = obj(v); return { name: str(o.name, 32), avatar: str(o.avatar, 10), motto: str(o.motto, MOTTO_MAX), joined: date(o.joined), career: cleanCareer(o.career), best: cleanBest(o.best), total: num(o.total),
  recent: Array.isArray(o.recent) ? o.recent.slice(0, 20).map(r => ({ ...cleanRun(r), id: num(obj(r).id), at: date(obj(r).at) })) : [] }; };
export const cleanPosted = (v: unknown): Posted => { const o = obj(v), d = o.daily ? obj(o.daily) : null, p = o.promoted;
  return { run: cleanRow(o.run), total: num(o.total), best: !!o.best, daily: d ? { run: cleanRow(d.run), rank: Math.max(1, num(d.rank)), total: num(d.total) } : null,
    promoted: p === null || p === undefined || !RANKS[num(p)] ? null : num(p), medals: Array.isArray(o.medals) ? o.medals.filter(id => MEDALS.some(m => m.id === id)) : [] }; };
const mapRes = <T, U>(r: Res<T>, f: (d: T) => U): Res<U> => r.ok ? { ok: true, data: f(r.data) } : r;

type Res<T> = { ok: true; data: T } | { ok: false; status: number; error: string };
async function call<T>(url: string, body?: unknown): Promise<Res<T>> {
  try {
    const r = await fetch(url, body === undefined ? { credentials: 'same-origin' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
    if (!json) return { ok: false, status: 0, error: 'offline' };
    return r.ok ? { ok: true, data: json as T } : { ok: false, status: r.status, error: str(String(json.error ?? r.status), 120).toUpperCase() };
  } catch { return { ok: false, status: 0, error: 'offline' }; }
}
const data = <T>(r: Res<T>) => r.ok ? r.data : null;

export const fetchBoard = async (daily = '', limit = 10) => { const b = data(await call<unknown>(`${SCORES}?limit=${limit}${daily ? `&daily=${daily}` : ''}`)); return b ? cleanBoard(b) : null; };
// The signed-in player, or null signed out; undefined when there's no API to ask.
export async function fetchMe(): Promise<Me | null | undefined> {
  const r = await call<{ user: unknown }>(`${API}me`);
  return r.ok ? cleanMe(r.data.user) : undefined;
}
export const signup = async (name: string, password: string) => mapRes(await call<{ user: unknown }>(`${API}signup`, { name, password }), d => ({ user: { name: str(obj(d.user).name, 32) } }));
export const login = async (name: string, password: string) => mapRes(await call<{ user: unknown }>(`${API}login`, { name, password }), d => ({ user: { name: str(obj(d.user).name, 32) } }));
export const logout = () => call<object>(`${API}logout`, {});
// Logs a run under the signed-in account: where it placed, or why it wasn't logged.
export const postRun = async (run: Run) => mapRes(await call<unknown>(SCORES, run), cleanPosted);
export const fetchProfile = async (name: string) => { const p = data(await call<{ profile: unknown }>(`${API}profile?name=${encodeURIComponent(name)}`))?.profile; return p ? cleanProfile(p) : null; };
export const saveProfile = async (p: { avatar?: string; motto?: string }) => mapRes(await call<{ profile: unknown }>(`${API}profile`, p), d => ({ profile: cleanProfile(d.profile) }));

// The callsign last typed into the sign-in form, to fill it in next time.
export const loadCallsign = () => { try { return localStorage.getItem('x5-callsign') ?? ''; } catch { return ''; } };
export const saveCallsign = (n: string) => { try { localStorage.setItem('x5-callsign', n); } catch { /* storage blocked: skip */ } };

const esc = (t: string) => t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
// Top three get a medal; the rest a chevron count by how high they sit.
const badge = (rank: number) => rank <= 3 ? ['', '★', '★', '★'][rank] : rank <= 10 ? '»' : '›';
const place = (rank: number) => rank <= 3 ? ` p${rank}` : '';

// A pilot's patch, and their rank insignia with its name as a tooltip.
const patch = (name: string, code: string, size = 20) => avatarSvg(avatarFor(name, code), size);
const insignia = (xp: number, size = 13) => { const r = rankOf(xp); return r.mark ? `<span class="rkmark" title="${r.name}">${insigniaSvg(r.mark, size)}</span>` : ''; };

// The board: each player's best run, ranked, with their patch and rank insignia; a pilot's name opens their profile.
// The signed-in player's row (`me`) is highlighted; if it's below the rows shown, it's added under a gap. Callsign
// runs from before accounts are dimmed, without a patch.
export function boardHtml(title: string, b: Board, me?: { name: string; row?: Row | null }) {
  const mine = (r: Row) => !!me && !!r.verified && r.name === me.name;
  const who = (r: Row) => r.verified
    ? `<button class="pilot" data-p="${esc(r.name)}">${patch(r.name, r.avatar)}<span>${esc(r.name)}</span>${insignia(r.xp)}</button>`
    : `<span class="pilot"><span class="nopatch"></span><span>${esc(r.name)}</span></span>`;
  const row = (r: Row) => `<tr class="${place(r.rank)}${mine(r) ? ' me' : ''}${r.verified ? '' : ' guest'}">
    <td class="rk"><i>${badge(r.rank)}</i>${String(r.rank).padStart(2, '0')}</td><td class="nm">${who(r)}</td>
    <td>${clock(r.time)}</td><td>${fmt(r.kills)}</td><td>${r.level}</td></tr>`;
  const extra = me?.row && !b.rows.some(mine) ? `<tr class="gap"><td colspan="5">⋮</td></tr>${row(me.row)}` : '';
  return `<div class="lb frame"><div class="lbhead"><small>${esc(title)}</small><small>${fmt(b.total)} PILOT${b.total === 1 ? '' : 'S'}</small></div>
    ${b.rows.length ? `<table><thead><tr><th>RANK</th><th class="nm">PILOT</th><th>SURVIVED</th><th>KILLS</th><th>LV</th></tr></thead><tbody>
    ${b.rows.map(row).join('')}${extra}</tbody></table>`
    : '<p class="dim">NO RUNS LOGGED YET · BE THE FIRST</p>'}</div>`;
}

const pct = (rank: number, total: number) => Math.max(1, Math.ceil(rank / total * 100));
const standing = (label: string, rank: number, total: number) => `${label} <b>#${rank}</b> OF ${fmt(total)}${total >= 10 ? ` · TOP ${pct(rank, total)}%` : ''}`;
const medal = (id: string, won = true, size = 26) => {
  const i = MEDALS.findIndex(m => m.id === id), m = MEDALS[i], [, , ink] = COLORS[i % COLORS.length];
  return `<span class="medal${won ? ' won' : ''}" title="${m.name} · ${m.desc}"><svg viewBox="0 0 24 32" width="${size * 0.75}" height="${size}" style="width:${size * 0.75}px;height:${size}px" aria-hidden="true">`
    + `<path d="M5 0 H11 L12 11 L13 0 H19 L15 14 H9 Z" fill="${won ? ink : 'none'}" stroke="currentColor" stroke-width="1"/>`
    + `<circle cx="12" cy="22" r="8" fill="${won ? ink : 'none'}" stroke="currentColor" stroke-width="1.5"/>`
    + `<text x="12" y="25.5" text-anchor="middle" font-size="9" font-weight="700" fill="${won ? '#000' : 'currentColor'}">${i + 1}</text></svg></span>`;
};
// XP toward the next rank, as a bar.
const xpBar = (xp: number) => {
  const r = rankOf(xp);
  return `<span class="xpbar" title="${fmt(xp)} XP${r.next ? ` · ${fmt(r.next.xp - xp)} TO ${r.next.name}` : ''}"><i style="width:${Math.round(r.progress * 100)}%"></i></span>`;
};

// Where a logged run left the player: a new personal best (and where it ranks), or their standing unchanged; and any
// promotion or medal it won.
export function placedHtml(p: Posted) {
  const head = p.best ? (p.run.rank === 1 ? 'NEW NUMBER ONE ★' : 'NEW PERSONAL BEST ★') : `RUN LOGGED · BEST STAYS ${clock(p.run.time)}`;
  const promo = p.promoted !== null ? `<p class="alert placed">PROMOTED · ${insigniaSvg(RANKS[p.promoted].mark, 16)} ${RANKS[p.promoted].name}</p>` : '';
  const won = p.medals.length ? `<p class="hot placed">MEDAL${p.medals.length > 1 ? 'S' : ''} AWARDED · ${p.medals.map(id => `${medal(id, true, 22)} ${MEDALS.find(m => m.id === id)!.name}`).join(' · ')}</p>` : '';
  return `<p class="${p.best && p.run.rank <= 3 ? 'alert' : 'hot'} placed">${head} · ${standing('ALL-TIME', p.run.rank, p.total)}${
    p.daily ? ` · ${standing('TODAY\'S OP', p.daily.rank, p.daily.total)}` : ''}</p>${promo}${won}`;
}

// The signed-in player's line (patch, callsign, rank and XP toward the next, best), or the sign-in form. `why` says
// what signing in is for here.
export function accountHtml(me: Me | null, why: string, msg = '') {
  if (me) {
    const xp = xpOf(me.career), r = rankOf(xp);
    return `<div class="acct"><button class="pilot big" data-p="${esc(me.name)}" title="YOUR PROFILE">${patch(me.name, me.avatar, 40)}</button>
      <div><p><b class="hot">${esc(me.name)}</b> ${insignia(xp, 15)} <span class="dim">${r.name}</span> ${xpBar(xp)}</p>
      <p class="dim">${me.best ? `BEST ${clock(me.best.time)} · ${standing('RANK', me.best.rank, me.total)}` : 'NO RUNS YET'}${
        me.runs ? ` · ${fmt(me.runs)} RUN${me.runs === 1 ? '' : 'S'}` : ''}${me.career.streak > 1 ? ` · ${me.career.streak}-DAY STREAK` : ''}
      <button class="link" data-p="${esc(me.name)}">PROFILE</button> <button class="link" data-a="logout">SIGN OUT</button></p></div></div>`;
  }
  return `<form class="auth" autocomplete="on"><p class="dim">${esc(why)}</p>
    <input name="name" type="text" maxlength="16" placeholder="CALLSIGN" spellcheck="false" autocomplete="username" autocapitalize="characters" value="${esc(loadCallsign())}">
    <input name="password" type="password" maxlength="200" placeholder="PASSWORD" autocomplete="current-password">
    <button class="btn hotbtn">SIGN IN [ENTER]</button> <button class="btn" data-a="signup" type="button">SIGN UP</button>
    <p class="msg alert">${esc(msg)}</p></form>`;
}

// A pilot's profile card: patch, rank and XP, motto, career numbers, medals (won lit, the rest dim with what they
// take), and their latest runs. `edit` (your own card): the patch picker and motto field, with the draft patch shown.
export function profileHtml(p: Profile, edit?: { draft: Avatar; motto: string; msg?: string }) {
  const c = p.career, xp = xpOf(c), r = rankOf(xp), won = medalsOf(c);
  const stat = (label: string, v: string) => `<div><small>${label}</small><b>${v}</b></div>`;
  const hours = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)}H ${Math.floor(s % 3600 / 60)}M` : `${Math.floor(s / 60)}M`;
  const picker = (k: string, label: string, names: string[], i: number) =>
    `<div class="pick"><small>${label}</small><button class="link" data-a="pf-${k}-1">◄</button><b>${names[i]}</b><button class="link" data-a="pf-${k}+1">►</button></div>`;
  const shown = edit ? edit.draft : avatarFor(p.name, p.avatar);
  return `<div class="card frame profile">
    <button class="link pfclose" data-a="pf-close">CLOSE ✕</button>
    <div class="pfhead">${avatarSvg(shown, 96, 'patch big')}
      <div><h2>${esc(p.name)}</h2>
        <p>${r.mark ? insigniaSvg(r.mark, 18) : ''} <b class="hot">${r.name}</b> · ${fmt(xp)} XP</p>
        <p>${xpBar(xp)} <small>${r.next ? `${fmt(r.next.xp - xp)} XP TO ${r.next.name}` : 'TOP RANK'}</small></p>
        ${p.motto ? `<p class="motto">“${esc(p.motto)}”</p>` : ''}
        <p class="dim">ENLISTED ${esc(p.joined.slice(0, 10))}${p.best ? ` · ${standing('RANK', p.best.rank, p.total)}` : ''}</p></div></div>
    ${edit ? `<div class="pfedit">${picker('shape', 'SHAPE', SHAPES, edit.draft.shape)}${picker('emblem', 'EMBLEM', EMBLEMS, edit.draft.emblem)}${picker('color', 'COLOURS', COLORS.map(c => c[0]), edit.draft.color)}
      <input name="motto" type="text" maxlength="${MOTTO_MAX}" placeholder="MOTTO (OPTIONAL)" value="${esc(edit.motto)}" spellcheck="false">
      <button class="btn hotbtn" data-a="pf-save">SAVE</button><p class="msg alert">${esc(edit.msg ?? '')}</p></div>` : ''}
    <div class="pfstats">${stat('RUNS', fmt(c.runs))}${stat('BEST SURVIVAL', clock(c.bestTime))}${stat('BEST KILLS', fmt(c.bestKills))}${stat('TOP BASE LV', String(c.maxLevel))}
      ${stat('TOTAL KILLS', fmt(c.kills))}${stat('TIME IN COMBAT', hours(c.time))}${stat('DAILY OPS', fmt(c.dailies))}${stat('STREAK', `${c.streak} · BEST ${c.longestStreak}`)}</div>
    <small>MEDALS · ${won.length} OF ${MEDALS.length}</small>
    <div class="medals">${MEDALS.map(m => `<div class="${won.includes(m.id) ? '' : 'dim'}">${medal(m.id, won.includes(m.id))}<b>${m.name}</b><small>${m.desc}</small></div>`).join('')}</div>
    ${p.recent.length ? `<small>LATEST RUNS</small><table class="pfruns"><tbody>${p.recent.map(x => `<tr><td>${esc(x.at.slice(0, 10))}</td><td>${x.daily ? 'DAILY OP' : 'RUN'}</td>
      <td>${clock(x.time)}</td><td>${fmt(x.kills)} KILLS</td><td>LV ${x.level}</td></tr>`).join('')}</tbody></table>` : '<p class="dim">NO RUNS YET</p>'}
  </div>`;
}
