// 3色デッキの しらべ（docs/THREE_COLOR.md の 表）
// つかいかた：N=1000 DIFF=normal V=two,tri,tri26,sp3 node mathtcg/tools/sim_colors.mjs
import { runAdventure, openPack, buildDeck } from '../js/engine/run.js';
import { AI, plan } from '../js/engine/ai.js';
import { colorsOf } from '../js/engine/game.js';
import { seeded } from '../js/engine/rng.js';
const N = Number(process.env.N || 1000), DIFF = process.env.DIFF || 'normal';
// 色事故：メイン1の あと、マナの 数は たりるのに 色が なくて 唱えられない カードが 手札に ある ターン
let turns = 0, blocked = 0;
const main0 = AI.main;
AI.main = (s, phase) => {
  const r = main0(s, phase);
  if (phase === 1 && !s.swapped && s.floor.id !== 'pvp') {
    turns++;
    if (s.P.hand.some((c) => !c.def.basic && !c.def.x && colorsOf(c.def).length && !plan(s, c.def.cost, colorsOf(c.def)) && plan(s, c.def.cost, []))) blocked++;
  }
  return r;
};
const ALLV = { two: ['2色（いま）', {}], tri: ['3色・30点', { colors: 3 }], tri27: ['3色・27点', { colors: 3, capacity: 27 }], tri25: ['3色・25点', { colors: 3, capacity: 25 }], sp3: ['2色＋タッチ3', { splash: 3 }], sp5: ['2色＋タッチ5', { splash: 5 }], tri26: ['3色・26点', { colors: 3, capacity: 26 }], sp3c28: ['タッチ3・28点', { splash: 3, capacity: 28 }] };
for (const [label, o] of (process.env.V || 'two,tri,tri27').split(',').map((v) => ALLV[v])) {
  turns = 0; blocked = 0;
  // ボス前（7パック）の デッキが 何色に なるか
  let three = 0;
  for (let i = 0; i < 1000; i++) { const rng = seeded(i + 1); const pool = []; for (let k = 0; k < 7; k++) pool.push(...openPack(rng)); const b = buildDeck(pool, o); if (new Set(b.deck.filter((d) => !d.basic).flatMap(colorsOf)).size >= 3) three++; }
  let clear = 0;
  for (let i = 0; i < N; i++) { const r = await runAdventure({ ...o, seed: 300000 + i, diff: DIFF }); if (r.cleared) clear++; }
  console.log(`${label.padEnd(8)} ${DIFF}：クリア ${Math.round(clear / N * 100)}%・色事故の ターン ${(blocked / turns * 100).toFixed(1)}%・ボス前の デッキが 本当に 3色 ${Math.round(three / 10)}%`);
}
