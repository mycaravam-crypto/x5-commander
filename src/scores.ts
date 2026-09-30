// The scoreboard and accounts client: talks to /api (server/api.ts) and draws the leaderboard and the sign-in form.
// On a static host there's no API: every read resolves null and the board is left out.
export type Row = { id: number; rank: number; name: string; verified: number; time: number; kills: number; level: number; earned: number; seed: string; daily: string; at: string };
export type Board = { rows: Row[]; total: number };
export type Posted = { run: Row; total: number; best: boolean; daily: { run: Row; rank: number; total: number } | null };
export type Run = { time: number; kills: number; level: number; earned: number; seed: string; daily: string };
export type Me = { name: string; best: Row | null; runs: number; total: number };

// VITE_SCORES_API at build time points a game hosted elsewhere (GitHub Pages) at a scoreboard server, read-only (the
// session cookie isn't sent cross-site); default: this origin's /api.
const SCORES = import.meta.env.VITE_SCORES_API || `${import.meta.env.BASE_URL}api/scores`;
const API = SCORES.replace(/scores$/, '');

type Res<T> = { ok: true; data: T } | { ok: false; status: number; error: string };
async function call<T>(url: string, body?: unknown): Promise<Res<T>> {
  try {
    const r = await fetch(url, body === undefined ? { credentials: 'same-origin' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
    if (!json) return { ok: false, status: 0, error: 'offline' };
    return r.ok ? { ok: true, data: json as T } : { ok: false, status: r.status, error: String(json.error ?? r.status).toUpperCase() };
  } catch { return { ok: false, status: 0, error: 'offline' }; }
}
const data = <T>(r: Res<T>) => r.ok ? r.data : null;

export const fetchBoard = async (daily = '', limit = 10) => data(await call<Board>(`${SCORES}?limit=${limit}${daily ? `&daily=${daily}` : ''}`));
// The signed-in player, or null signed out; undefined when there's no API to ask.
export async function fetchMe(): Promise<Me | null | undefined> {
  const r = await call<{ user: Me | null }>(`${API}me`);
  return r.ok ? r.data.user : undefined;
}
export const signup = (name: string, password: string) => call<{ user: { name: string } }>(`${API}signup`, { name, password });
export const login = (name: string, password: string) => call<{ user: { name: string } }>(`${API}login`, { name, password });
export const logout = () => call<object>(`${API}logout`, {});
// Logs a run under the signed-in account: where it placed, or why it wasn't logged.
export const postRun = (run: Run) => call<Posted>(SCORES, run);

// The callsign last typed into the sign-in form, to fill it in next time.
export const loadCallsign = () => { try { return localStorage.getItem('x5-callsign') ?? ''; } catch { return ''; } };
export const saveCallsign = (n: string) => { try { localStorage.setItem('x5-callsign', n); } catch { /* storage blocked: skip */ } };

const esc = (t: string) => t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
// Top three get a medal; the rest a chevron count by how high they sit.
const badge = (rank: number) => rank <= 3 ? ['', '★', '★', '★'][rank] : rank <= 10 ? '»' : '›';
const place = (rank: number) => rank <= 3 ? ` p${rank}` : '';

// The board: each player's best run, ranked. The signed-in player's row (`me`) is highlighted; if it's below the rows
// shown, it's added under a gap. Callsign runs from before accounts are dimmed.
export function boardHtml(title: string, b: Board, me?: { name: string; row?: Row | null }) {
  const mine = (r: Row) => !!me && !!r.verified && r.name === me.name;
  const row = (r: Row) => `<tr class="${place(r.rank)}${mine(r) ? ' me' : ''}${r.verified ? '' : ' guest'}">
    <td class="rk"><i>${badge(r.rank)}</i>${String(r.rank).padStart(2, '0')}</td><td class="nm">${esc(r.name)}</td>
    <td>${clock(r.time)}</td><td>${fmt(r.kills)}</td><td>${r.level}</td></tr>`;
  const extra = me?.row && !b.rows.some(mine) ? `<tr class="gap"><td colspan="5">⋮</td></tr>${row(me.row)}` : '';
  return `<div class="lb frame"><div class="lbhead"><small>${title}</small><small>${fmt(b.total)} PILOT${b.total === 1 ? '' : 'S'}</small></div>
    ${b.rows.length ? `<table><thead><tr><th>RANK</th><th class="nm">PILOT</th><th>SURVIVED</th><th>KILLS</th><th>LV</th></tr></thead><tbody>
    ${b.rows.map(row).join('')}${extra}</tbody></table>`
    : '<p class="dim">NO RUNS LOGGED YET · BE THE FIRST</p>'}</div>`;
}

const pct = (rank: number, total: number) => Math.max(1, Math.ceil(rank / total * 100));
const standing = (label: string, rank: number, total: number) => `${label} <b>#${rank}</b> OF ${fmt(total)}${total >= 10 ? ` · TOP ${pct(rank, total)}%` : ''}`;

// Where a logged run left the player: a new personal best (and where it ranks), or their standing unchanged.
export function placedHtml(p: Posted) {
  const head = p.best ? (p.run.rank === 1 ? 'NEW NUMBER ONE ★' : 'NEW PERSONAL BEST ★') : `RUN LOGGED · BEST STAYS ${clock(p.run.time)}`;
  return `<p class="${p.best && p.run.rank <= 3 ? 'alert' : 'hot'} placed">${head} · ${standing('ALL-TIME', p.run.rank, p.total)}${
    p.daily ? ` · ${standing('TODAY\'S OP', p.daily.rank, p.daily.total)}` : ''}</p>`;
}

// The signed-in player's line, or the sign-in form. `why` says what signing in is for here.
export function accountHtml(me: Me | null, why: string, msg = '') {
  if (me) return `<p class="acct">PILOT <b class="hot">${esc(me.name)}</b>${me.best ? ` · BEST ${clock(me.best.time)} · ${standing('RANK', me.best.rank, me.total)}` : ' · NO RUNS YET'}${
    me.runs ? ` · ${fmt(me.runs)} RUN${me.runs === 1 ? '' : 'S'}` : ''} <button class="link" data-a="logout">SIGN OUT</button></p>`;
  return `<form class="auth" autocomplete="on"><p class="dim">${why}</p>
    <input name="name" type="text" maxlength="16" placeholder="CALLSIGN" spellcheck="false" autocomplete="username" autocapitalize="characters" value="${esc(loadCallsign())}">
    <input name="password" type="password" maxlength="200" placeholder="PASSWORD" autocomplete="current-password">
    <button class="btn hotbtn">SIGN IN [ENTER]</button> <button class="btn" data-a="signup" type="button">SIGN UP</button>
    <p class="msg alert">${esc(msg)}</p></form>`;
}
