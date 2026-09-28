// `npm test` — headless run of the sim. Throws on the first broken rule.
import { newGame, update, buy, cost, pickPerk, markAt, visible, type State } from './sim.ts';
import { baseLevel, UPGRADES } from './config.ts';

const ok = (c: unknown, msg: string) => { if (!c) throw new Error('FAIL: ' + msg); };
const run = (s: State, secs: number, each?: () => void) => {
  for (let i = 0; i < secs * 60; i++) { update(s, 1 / 60); each?.(); s.events.length = 0; }
};

// Level thresholds
ok([0, 2, 3, 8, 9, 18].map(baseLevel).join() === '1,1,2,2,3,4', 'baseLevel thresholds');

// Cost scaling + max level
let s = newGame();
ok(cost(s, 'gen') === 50, 'base cost');
s.lv.gen = 2; ok(cost(s, 'gen') === Math.round(50 * 1.45 ** 2), 'exp cost');
s.lv.armor = 7; ok(cost(s, 'armor') === Infinity, 'max level');

// Nothing happens before start
s = newGame(); run(s, 5); ok(s.t === 0, 'start phase frozen');

// Idle base: detects, shoots, earns — then eventually dies
s = newGame(); s.phase = 'play';
let sawVisible = false, invisibleShot = false;
run(s, 60, () => {
  for (const e of s.enemies) {
    if (visible(s, e)) sawVisible = true;
    if (e.locked && !visible(s, e)) invisibleShot = true;
  }
});
ok(s.enemies.length > 0 || s.kills > 0, 'enemies spawn');
ok(sawVisible, 'radar detects');
ok(!invisibleShot, 'locks only on visible');
ok(s.kills > 0 && s.credits > 120, `kills earn credits (kills=${s.kills})`);
run(s, 900);
ok((s.phase as string) === 'over', 'idle base eventually falls');

// Undetected enemy is never locked
s = newGame(); s.phase = 'play'; s.st.radarRange = 0;
run(s, 20);
ok(s.enemies.every(e => !e.locked), 'no radar, no locks');

// Upgrading bot survives longer than idle, triggers perk drafts, grows base
const bot = () => {
  const g = newGame(); g.phase = 'play';
  run(g, 1200, () => {
    if (g.phase === 'perk') pickPerk(g, 0);
    const cheapest = UPGRADES.map(u => u.id).sort((a, b) => cost(g, a) - cost(g, b))[0];
    buy(g, cheapest);
    if (g.phase === 'over') return;
  });
  return g;
};
const idle = newGame(); idle.phase = 'play'; run(idle, 1200);
const b = bot();
ok(b.t > idle.t, `upgrades help (${b.t.toFixed(0)}s vs ${idle.t.toFixed(0)}s)`);
ok(b.level >= 3 && b.perks.length === b.level - 1, `base grows + perks (lv ${b.level}, perks ${b.perks.length})`);

// Manual mark picks nearest visible enemy
s = newGame(); s.phase = 'play'; run(s, 20);
const v = s.enemies.find(e => visible(s, e));
if (v) { markAt(s, v.x, v.z); ok(s.marked === v.id, 'markAt'); }

console.log(`ok · idle ${idle.t.toFixed(0)}s/${idle.kills} kills · bot ${b.t.toFixed(0)}s/${b.kills} kills lv${b.level} [${b.perks.join(',')}]`);
