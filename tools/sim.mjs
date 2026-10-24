// バランス しらべ：AIが たたかいと冒険を なんども あそぶ
//   node mathtcg/tools/sim.mjs fights   … 見本デッキ6つ × 各階（N回ずつ）
//   node mathtcg/tools/sim.mjs runs     … パックからの冒険を N回
//   node mathtcg/tools/sim.mjs floors  … 各階を、その階でのパックの数（1階は3パック〜ボスは7パック）で組んだデッキで N回
//   node mathtcg/tools/sim.mjs log RG hydra … 1戦のログ
//   node mathtcg/tools/sim.mjs pvp     … オンラインバトル：見本デッキどうし（どちらも AI）
// 環境変数：N（回数）DIFF（easy/normal/hard）RESHUFFLE（0 で山札切れ負け）SEED SETS（パックに 入れる 弾。例 SETS=1 で 第1弾だけ）
//   EMBLEM（もんしょう。例 EMBLEM=life1,basic1、EMBLEM=all）
import { BY_ID } from '../js/data/cards.js';
import { SAMPLE } from '../js/data/samples.js';
import { pvp } from '../js/data/enemies.js';
import { fight, runAdventure, openPack, buildDeck } from '../js/engine/run.js';
import { seeded } from '../js/engine/rng.js';
import { EMBLEMS, emblemEffects } from '../js/data/emblems.js';
import { RAV_SLOTS } from '../js/data/ravnica.js';

const N = Number(process.env.N ?? 200);
const DIFF = process.env.DIFF ?? 'normal';
const RESHUFFLE = process.env.RESHUFFLE !== '0';
const SEED = Number(process.env.SEED ?? 1);
const SETS = process.env.SETS ? process.env.SETS.split(',').map(Number) : undefined;
// もんしょう（12章）：EMBLEM=life1,basic1 など。all で ぜんぶ
const EM = process.env.EMBLEM ? (process.env.EMBLEM === 'all' ? EMBLEMS.filter((e) => e.branch !== 'leader').map((e) => e.id) : process.env.EMBLEM.split(',')) : [];
// PLANE=ravnica で ラヴニカの 塔（docs/RAVNICA.md）
const PLANE = process.env.PLANE || 'theros';
const opts = { diff: DIFF, reshuffle: RESHUFFLE, sets: SETS, emblem: emblemEffects(EM), plane: PLANE };

const deckOf = (k) => SAMPLE[k].split(' ').map((id) => BY_ID[id]);
const FLOOR_IDS = PLANE === 'ravnica' ? RAV_SLOTS.flat() : ['hydra', 'clock', 'horde', 'dragon', 'factory', 'slime', 'twins', 'xenagos', 'gorgon', 'erebos'];
const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);
const avg = (a) => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : 0);

const mode = process.argv[2] || 'fights';

if (mode === 'fights') {
  console.log(`見本デッキ × 各階（${N}回ずつ・${DIFF}・山札切れは${RESHUFFLE ? '墓地をもどす' : '負け'}）`);
  console.log('勝率／平均ターン（勝ったとき）');
  console.log('      ' + FLOOR_IDS.map((f) => f.padEnd(12)).join(''));
  for (const k of Object.keys(SAMPLE)) {
    const row = [];
    for (const f of FLOOR_IDS) {
      let win = 0; const turns = []; let timeout = 0;
      for (let i = 0; i < N; i++) {
        const s = await fight(deckOf(k), f, { ...opts, seed: SEED * 100000 + i });
        if (s.over === 'win') { win++; turns.push(s.stats.playerTurns); }
        if (s.over === 'timeout') timeout++;
      }
      row.push(`${pct(win / N)} ${avg(turns).toFixed(1).padStart(4)}${timeout ? '*' : ' '}  `);
    }
    console.log(k.padEnd(6) + row.join(''));
  }
  console.log('（* は40ターンで決着がつかなかった戦いがあった）');
}

if (mode === 'runs') {
  const res = [];
  for (let i = 0; i < N; i++) res.push(await runAdventure({ ...opts, seed: SEED * 100000 + i }));
  const cleared = res.filter((r) => r.cleared).length;
  console.log(`冒険 ${N}回（${DIFF}）：クリア ${pct(cleared / N)}`);
  const lost = [0, 0, 0, 0, 0, 0];
  for (const r of res) if (!r.cleared) lost[r.lostAt]++;
  console.log('どこで終わったか：' + [1, 2, 3, 4, 5].map((f) => `${f}階 ${lost[f]}`).join('、'));
  const byFloor = {};
  for (const r of res) for (const f of r.floors) {
    const b = (byFloor[f.floor] ||= { n: 0, win: 0, turns: [], life: [], phase: [], resh: 0 });
    b.n++; if (f.reshuffled) b.resh++; if (f.result === 'win') { b.win++; b.turns.push(f.turns); b.life.push(f.life); } else if (f.phase) b.phase.push(f.phase);
  }
  console.log('階ごと（コンティニューもふくむ）：勝率・勝ったときの平均ターン・残りライフ');
  for (const f of FLOOR_IDS) if (byFloor[f]) {
    const b = byFloor[f];
    console.log(`  ${f.padEnd(8)} ${pct(b.win / b.n)}（${b.n}戦） ${avg(b.turns).toFixed(1)}ターン ライフ${avg(b.life).toFixed(1)} 山札切れ${pct(b.resh / b.n)}${b.phase.length ? `  負けた段階の平均 ${avg(b.phase).toFixed(2)}` : ''}`);
  }
  const pairs = {};
  for (const r of res) { const p = r.decks[r.decks.length - 1].pair; (pairs[p] ||= { n: 0, c: 0 }).n++; if (r.cleared) pairs[p].c++; }
  console.log('最後のデッキの2色：' + Object.entries(pairs).sort((a, b) => b[1].n - a[1].n).map(([p, v]) => `${p} ${v.n}回（クリア${pct(v.c / v.n)}）`).join('、'));
  const real = res.map((r) => r.decks[0].real), real5 = res.filter((r) => r.decks.length === 5).map((r) => r.decks[4].real);
  console.log(`デッキのきほんカード以外の枚数：最初 ${avg(real).toFixed(1)}枚 → ボス前 ${avg(real5).toFixed(1)}枚`);
}

if (mode === 'log') {
  const k = process.argv[3] || 'RG', f = process.argv[4] || 'hydra';
  const s = await fight(deckOf(k), f, { ...opts, seed: SEED, log: true });
  console.log(s.logs.join('\n'));
  console.log(`結果：${s.over}（${s.stats.playerTurns}ターン、ライフ ${s.P.life}）`);
}

if (mode === 'floors') {
  const plan = [['hydra', 3], ['clock', 3], ['horde', 4], ['dragon', 4], ['factory', 5], ['slime', 5], ['twins', 5], ['xenagos', 6], ['gorgon', 6], ['erebos', 7]];
  console.log(`各階 × その階で組めるデッキ（${N}回ずつ・${DIFF}）：1回目で勝つ率・勝ったときの平均ターン・山札切れ`);
  for (const [f, packs] of plan) {
    if (process.env.FLOOR && !process.env.FLOOR.split(',').includes(f)) continue;
    let win = 0, resh = 0; const turns = []; const ph = [];
    for (let i = 0; i < N; i++) {
      const rng = seeded(SEED * 100000 + i);
      const pool = []; for (let k = 0; k < packs; k++) pool.push(...openPack(rng, { sets: SETS }));
      const s = await fight(buildDeck(pool).deck, f, { ...opts, seed: SEED * 7919 + i });
      if (s.over === 'win') { win++; turns.push(s.stats.playerTurns); } else if (s.stats.phase) ph.push(s.stats.phase);
      if (s.stats.reshuffled) resh++;
    }
    console.log(`  ${f.padEnd(8)}（${packs}パック） ${pct(win / N)}  ${avg(turns).toFixed(1)}ターン  山札切れ${pct(resh / N)}${ph.length ? `  負けた段階の平均 ${avg(ph).toFixed(2)}` : ''}`);
  }
}

if (mode === 'pvp') {
  const keys = Object.keys(SAMPLE);
  console.log(`オンラインバトル：見本デッキどうし（${N}回ずつ・先攻は交互）。行のデッキの勝率`);
  console.log('      ' + keys.map((k) => k.padEnd(6)).join(''));
  let turns = [], timeouts = 0, draws = 0;
  for (const a of keys) {
    const row = [];
    for (const b of keys) {
      let win = 0;
      for (let i = 0; i < N; i++) {
        const s = await fight(deckOf(a), 'pvp', { ...opts, seed: SEED * 100000 + i, floor: pvp({ deck: deckOf(b), first: i % 2 ? 'E' : 'P' }) });
        if (s.over === 'win') win++;
        if (s.over === 'timeout') timeouts++;
        if (s.over === 'draw') draws++;
        turns.push(s.stats.playerTurns);
      }
      row.push(pct(win / N).padEnd(6));
    }
    console.log(a.padEnd(6) + row.join(''));
  }
  console.log(`平均 ${avg(turns).toFixed(1)} ターン、ひきわけ ${draws}回、40ターンで決着なし ${timeouts}回`);
}
