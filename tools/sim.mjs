// バランス しらべ：AIが たたかいと冒険を なんども あそぶ
//   node mathtcg/tools/sim.mjs fights   … 見本デッキ6つ × 各階（N回ずつ）
//   node mathtcg/tools/sim.mjs runs     … パックからの冒険を N回
//   node mathtcg/tools/sim.mjs floors  … 各階を、その階でのパックの数（1階は3パック〜ボスは7パック）で組んだデッキで N回
//   node mathtcg/tools/sim.mjs log RG hydra … 1戦のログ
// 環境変数：N（回数）DIFF（easy/normal/hard）MATH（けいさんの正解率 0〜1）RESHUFFLE（0 で山札切れ負け）SEED
import { BY_ID } from '../js/data/cards.js';
import { fight, runAdventure, openPack, buildDeck } from '../js/engine/run.js';
import { seeded } from '../js/engine/rng.js';

const N = Number(process.env.N ?? 200);
const DIFF = process.env.DIFF ?? 'normal';
const MATH = Number(process.env.MATH ?? 0.7);
const RESHUFFLE = process.env.RESHUFFLE !== '0';
const SEED = Number(process.env.SEED ?? 1);
const opts = { diff: DIFF, mathRate: MATH, reshuffle: RESHUFFLE };

// docs/cards/*.md の見本デッキ（20枚・30点）
const SAMPLE = {
  WG: 'W09 W08 WG02 W06 W07 G07 WG01 G01 G01 W01 W01 G03 G05 G04 W04 W05 W02 W03 G02 B03',
  UW: 'U08 W16 U07 WU02 W14 WU01 U06 W10 W10 U01 U01 U02 U02 W11 W12 W13 U03 U04 B01 B02',
  RW: 'W26 R07 W24 RW02 W20 RW01 R06 R05 W17 W17 R01 R01 W18 R03 W19 R04 R02 B04 B01 B04',
  UR: 'U17 U16 R17 UR02 UR01 R13 R14 U13 R09 R09 U09 U09 R11 R10 U10 R12 U11 B04 B02 B04',
  RG: 'G17 R26 R24 RG02 RG01 R22 G12 G13 G10 G10 R18 R18 G09 R20 G08 G11 B03 B04 B03 B04',
  UG: 'G26 G23 G24 GU02 GU01 G21 U22 G22 G20 G20 U18 U18 G18 G19 U19 U20 U21 B03 B02 B03',
};
const deckOf = (k) => SAMPLE[k].split(' ').map((id) => BY_ID[id]);
const FLOOR_IDS = ['hydra', 'horde', 'factory', 'slime', 'xenagos', 'erebos'];
const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);
const avg = (a) => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : 0);

const mode = process.argv[2] || 'fights';

if (mode === 'fights') {
  console.log(`見本デッキ × 各階（${N}回ずつ・${DIFF}・けいさん正解率 ${MATH}・山札切れは${RESHUFFLE ? '墓地をもどす' : '負け'}）`);
  console.log('勝率／平均ターン（勝ったとき）');
  console.log('      ' + FLOOR_IDS.map((f) => f.padEnd(12)).join(''));
  for (const k of Object.keys(SAMPLE)) {
    const row = [];
    for (const f of FLOOR_IDS) {
      let win = 0; const turns = []; let timeout = 0;
      for (let i = 0; i < N; i++) {
        const s = fight(deckOf(k), f, { ...opts, seed: SEED * 100000 + i });
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
  for (let i = 0; i < N; i++) res.push(runAdventure({ ...opts, seed: SEED * 100000 + i }));
  const cleared = res.filter((r) => r.cleared).length;
  console.log(`冒険 ${N}回（${DIFF}・けいさん正解率 ${MATH}）：クリア ${pct(cleared / N)}`);
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
  const s = fight(deckOf(k), f, { ...opts, seed: SEED, log: true });
  console.log(s.logs.join('\n'));
  console.log(`結果：${s.over}（${s.stats.playerTurns}ターン、ライフ ${s.P.life}）`);
}

if (mode === 'floors') {
  const plan = [['hydra', 3], ['horde', 4], ['factory', 5], ['slime', 5], ['xenagos', 6], ['erebos', 7]];
  console.log(`各階 × その階で組めるデッキ（${N}回ずつ・${DIFF}・けいさん正解率 ${MATH}）：1回目で勝つ率・勝ったときの平均ターン・山札切れ`);
  for (const [f, packs] of plan) {
    if (process.env.FLOOR && !process.env.FLOOR.split(',').includes(f)) continue;
    let win = 0, resh = 0; const turns = []; const ph = [];
    for (let i = 0; i < N; i++) {
      const rng = seeded(SEED * 100000 + i);
      const pool = []; for (let k = 0; k < packs; k++) pool.push(...openPack(rng));
      const s = fight(buildDeck(pool).deck, f, { ...opts, seed: SEED * 7919 + i });
      if (s.over === 'win') { win++; turns.push(s.stats.playerTurns); } else if (s.stats.phase) ph.push(s.stats.phase);
      if (s.stats.reshuffled) resh++;
    }
    console.log(`  ${f.padEnd(8)}（${packs}パック） ${pct(win / N)}  ${avg(turns).toFixed(1)}ターン  山札切れ${pct(resh / N)}${ph.length ? `  負けた段階の平均 ${avg(ph).toFixed(2)}` : ''}`);
  }
}
