// The scoreboard client: talks to /api/scores (server/scores.ts) and draws the leaderboard.
// On a static host there's no API: every call resolves null and the board is left out.
export type Row = { id: number; rank: number; name: string; time: number; kills: number; level: number; earned: number; seed: string; daily: string; at: string };
export type Board = { rows: Row[]; total: number };
export type Posted = { run: Row; total: number; daily: { rank: number; total: number } | null };
export type Run = { name: string; time: number; kills: number; level: number; earned: number; seed: string; daily: string };

const API = `${import.meta.env.BASE_URL}api/scores`;
const call = async <T>(init?: RequestInit, q = ''): Promise<T | null> => {
  try {
    const r = await fetch(API + q, init);
    return r.ok && r.headers.get('content-type')?.includes('json') ? await r.json() as T : null;
  } catch { return null; }
};
export const fetchBoard = (daily = '', limit = 10) => call<Board>(undefined, `?limit=${limit}${daily ? `&daily=${daily}` : ''}`);
export const postRun = (run: Run) => call<Posted>({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(run) });

export const loadCallsign = () => { try { return localStorage.getItem('x5-callsign') ?? ''; } catch { return ''; } };
export const saveCallsign = (n: string) => { try { localStorage.setItem('x5-callsign', n); } catch { /* storage blocked: skip */ } };

const esc = (t: string) => t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
// Top three get a medal; the rest a chevron count by how high they sit.
const badge = (rank: number) => rank <= 3 ? ['', '★', '★', '★'][rank] : rank <= 10 ? '»' : '›';
const place = (rank: number) => rank <= 3 ? ` p${rank}` : '';

// The board, best first. `mine` (a run id) is highlighted; if it ranked below the rows shown, it's added under a gap.
export function boardHtml(title: string, b: Board, mine?: Row) {
  const row = (r: Row) => `<tr class="${place(r.rank)}${r.id === mine?.id ? ' me' : ''}">
    <td class="rk"><i>${badge(r.rank)}</i>${String(r.rank).padStart(2, '0')}</td><td class="nm">${esc(r.name)}</td>
    <td>${clock(r.time)}</td><td>${fmt(r.kills)}</td><td>${r.level}</td></tr>`;
  const shown = b.rows.some(r => r.id === mine?.id);
  return `<div class="lb frame"><div class="lbhead"><small>${title}</small><small>${fmt(b.total)} RUN${b.total === 1 ? '' : 'S'} LOGGED</small></div>
    ${b.rows.length ? `<table><thead><tr><th>RANK</th><th class="nm">CALLSIGN</th><th>SURVIVED</th><th>KILLS</th><th>LV</th></tr></thead><tbody>
    ${b.rows.map(row).join('')}${mine && !shown ? `<tr class="gap"><td colspan="5">⋮</td></tr>${row(mine)}` : ''}</tbody></table>`
    : '<p class="dim">NO RUNS LOGGED YET · BE THE FIRST</p>'}</div>`;
}

// One line on where a logged run landed: rank, and the top percent it's in.
export function placedHtml(p: Posted) {
  const pct = (rank: number, total: number) => Math.max(1, Math.ceil(rank / total * 100));
  const line = (label: string, rank: number, total: number) =>
    `${label} <b>#${rank}</b> OF ${fmt(total)}${total >= 10 ? ` · TOP ${pct(rank, total)}%` : ''}`;
  return `<p class="${p.run.rank <= 3 ? 'alert' : 'hot'} placed">${p.run.rank === 1 ? 'NEW NUMBER ONE ★ · ' : ''}${line('ALL-TIME', p.run.rank, p.total)}${
    p.daily ? ` · ${line('TODAY\'S OP', p.daily.rank, p.daily.total)}` : ''}</p>`;
}
