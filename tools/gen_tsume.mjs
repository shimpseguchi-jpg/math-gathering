// つめマスの 問題を つくる（docs/TSUME.md）
//   node tools/gen_tsume.mjs            … レベル 1〜5 を つくって js/data/tsume.js に 出す（レベルごとに 子プロセス）
//   node tools/gen_tsume.mjs --lv=3 --n=12 --seed=7 --json   … 1つの レベルだけ（JSON を 出す。親が あつめる）
//   node tools/gen_tsume.mjs --check    … いまの js/data/tsume.js を ぜんぶ ときなおして たしかめる
// ランダムに 盤面を つくる → ぜんぶの 手を しらべて「本体に あたえられる いちばん 大きい ダメージ」を 出す → てきの ライフを その 数に する（ちょうど 勝てる）
// → こたえの 手数・こたえの 数・でたらめに やって 勝てる わりあい で レベルに あうか きめる
import { writeFileSync } from 'fs';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import '../js/engine/run.js';
import { seeded } from '../js/engine/rng.js';
import { BY_ID } from '../js/data/cards.js';
import { solve, naiveWins, randomWinRate, tsumeCardOk, tsumeDef } from '../js/engine/tsume.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'js', 'data', 'tsume.js');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const strip = (t) => t.replace(/（[ぁ-ゖー]+）|《[^《》\n]*》|｜/g, '');

// ---- 材料（ざいりょう） ----
// じぶんの 場：[id, 重み]
const MINE_PLAIN = [['t:soldier', 3], ['t:cleric', 2], ['t:zombie', 3], ['t:beast', 3], ['t:golemE', 2], ['G60', 2], ['t:elemGU', 2]];
const MINE_FLY = [['W10', 1], ['U01', 2], ['t:drake', 2], ['t:pegasus', 1], ['U62', 1], ['t:spirit', 1]];
const MINE_KW = [['t:snake', 2], ['t:wurmDT', 1], ['t:warriorFS', 2], ['R106', 2], ['G05', 1], ['W27', 2], ['R27', 2], ['W102', 1], ['R09', 2], ['U10', 1], ['G10', 1], ['t:knightV', 1]];
// てき：[パワー, タフネス, キーワード]
const FOE_PLAIN = [[[1, 1, ''], 2], [[2, 2, ''], 3], [[2, 3, ''], 2], [[3, 3, ''], 3], [[0, 4, 'defender'], 2], [[1, 4, ''], 1], [[4, 4, ''], 1], [[3, 2, ''], 1], [[0, 3, 'defender'], 1], [[2, 5, ''], 1]];
const FOE_KW = [[[1, 1, 'flying'], 2], [[2, 2, 'flying'], 2], [[1, 3, 'reach'], 2], [[1, 1, 'deathtouch'], 2], [[2, 2, 'first'], 2], [[3, 3, 'flying'], 1], [[2, 4, 'reach'], 1]];
// 手札
const H_BURN = [['R16', 4], ['B04', 2], ['UR04', 1]];
const H_TRICK = [['R21', 3], ['W101', 2], ['G09', 2], ['W109', 1], ['R20', 1], ['R06', 1], ['W19', 1]];
const H_UTIL = [['U97', 2], ['U03', 1], ['G30', 2], ['G19', 1], ['G08', 1], ['R24', 1], ['W15', 1], ['W12', 1]];
const H_HASTE = [['R09', 2], ['R02', 2], ['R91', 1], ['UR01', 1]];
const H_FODDER = [['B01', 1], ['B02', 1], ['B03', 1], ['B05', 1], ['G60', 1], ['U01', 1]]; // マナに おく・まよわせる カード
for (const [id] of [...H_BURN, ...H_TRICK, ...H_UTIL, ...H_HASTE, ...H_FODDER]) if (!tsumeCardOk(BY_ID[id])) throw new Error(`つめマスで あつかえない カード：${id}`);
for (const [id] of [...MINE_PLAIN, ...MINE_FLY, ...MINE_KW]) if (!tsumeDef(id)) throw new Error(`ない カード：${id}`);

const COL = { W: 'W', U: 'U', K: 'K', R: 'R', G: 'G' };
const colsOf = (id) => [...(BY_ID[id]?.color || '')].filter((c) => COL[c]);

// ---- レベル ----
// mine・foes・hand・mana：[いちばん 少ない, いちばん 多い]。pools：えらぶ もと。ok(m)：できた 問題が レベルに あうか
const LV = {
  1: { name: 'たして ちょうど', mine: [2, 4], foes: [0, 1], foeTapped: 1, hand: [0, 1], mana: [1, 3],
    minePool: [...MINE_PLAIN, ...MINE_FLY], foePool: FOE_PLAIN, handPool: [...H_BURN.slice(0, 1), ...H_HASTE.slice(0, 2), ...H_TRICK.slice(0, 2)],
    ok: (m) => m.steps <= 3 && !m.tags.includes('pin') && !m.tags.includes('charge') && m.life >= 5 && m.life <= 14 },
  2: { name: 'じゃまな ブロッカー', mine: [3, 4], foes: [1, 2], hand: [0, 1], mana: [0, 2],
    minePool: [...MINE_PLAIN, ...MINE_FLY], foePool: FOE_PLAIN, handPool: [...H_BURN.slice(0, 2), ...H_TRICK.slice(0, 2)],
    ok: (m) => !m.naive && m.steps <= 4 && m.tags.includes('pin') && m.life >= 4 && m.rate <= 0.4 },
  3: { name: 'じゅもんと マナ', mine: [2, 3], foes: [1, 2], hand: [2, 3], mana: [1, 3],
    minePool: [...MINE_PLAIN, ...MINE_FLY], foePool: FOE_PLAIN, handPool: [...H_BURN, ...H_TRICK.slice(0, 4), ...H_UTIL.slice(0, 3), ...H_HASTE.slice(0, 2), ...H_FODDER],
    ok: (m) => !m.naive && m.steps >= 3 && m.steps <= 6 && m.spells >= 1 && m.rate <= 0.12 && m.life >= 6 && m.life <= 20 },
  4: { name: 'とくべつな 力', mine: [2, 4], foes: [1, 3], hand: [1, 3], mana: [1, 3],
    minePool: [...MINE_KW, ...MINE_KW, ...MINE_PLAIN, ...MINE_FLY], foePool: [...FOE_KW, ...FOE_KW, ...FOE_PLAIN], handPool: [...H_BURN, ...H_TRICK, ...H_UTIL, ...H_HASTE, ...H_FODDER],
    ok: (m) => !m.naive && m.steps >= 3 && m.steps <= 7 && m.kw >= 1 && m.rate <= 0.08 && m.life >= 6 && m.life <= 24 },
  5: { name: 'たつじん', mine: [2, 3], foes: [2, 3], hand: [3, 4], mana: [2, 4], nodes: 60000,
    minePool: [...MINE_KW, ...MINE_PLAIN, ...MINE_FLY], foePool: [...FOE_KW, ...FOE_PLAIN], handPool: [...H_BURN, ...H_TRICK, ...H_UTIL, ...H_HASTE, ...H_FODDER],
    ok: (m) => !m.naive && m.steps >= 4 && m.steps <= 9 && m.spells >= 2 && m.rate <= 0.02 && m.sols <= 8 && m.life >= 8 && m.life <= 30 },
};

const pickW = (rng, pool) => { let r = rng() * pool.reduce((t, x) => t + x[1], 0); for (const x of pool) { r -= x[1]; if (r < 0) return x[0]; } return pool[pool.length - 1][0]; };
const between = (rng, [lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));

function candidate(rng, lv) {
  const c = LV[lv];
  const bf = Array.from({ length: between(rng, c.mine) }, () => pickW(rng, c.minePool));
  const foe = Array.from({ length: between(rng, c.foes) }, () => { const f = [...pickW(rng, c.foePool)]; if (c.foeTapped && rng() < c.foeTapped) f[3] = 1; else if (rng() < 0.12) f[3] = 1; return f; });
  const hand = [];
  for (let i = between(rng, c.hand); i > 0; i--) { const id = pickW(rng, c.handPool); if (hand.filter((x) => x === id).length < 1 || BY_ID[id].basic) hand.push(id); }
  // マナ：手札の 色から（色が あわない マナも 少し）
  const cols = [...new Set(hand.flatMap(colsOf))];
  const base = cols.length ? cols : ['R', 'G', 'U', 'W'];
  const mana = Array.from({ length: between(rng, c.mana) }, () => (rng() < 0.85 ? base[Math.floor(rng() * base.length)] : 'RGUW'[Math.floor(rng() * 4)])).sort().join('');
  return { lv, life: 99, foe, bf, hand, mana: hand.length ? mana : '' };
}

// こたえから わかる こと
const KW_IDS = new Set(MINE_KW.map((x) => x[0]));
function measure(pz) {
  const maxNodes = LV[pz.lv].nodes || 25000;
  const top = solve({ ...pz, life: 99 }, { maxNodes });
  if (top.timeout || top.maxDmg < 3) return null;
  const q = { ...pz, life: top.maxDmg };
  const r = solve(q, { maxNodes });
  if (!r.win || r.timeout) return null;
  const keys = r.best.map((b) => b.key);
  const tags = [];
  const atk = keys.find((k) => k.startsWith('A:')) || '';
  if (/>E/.test(atk)) tags.push('pin');
  if (keys.some((k) => k.startsWith('C:'))) tags.push('charge');
  if (keys.some((k) => k.startsWith('T:'))) tags.push('trick');
  if (keys.some((k) => /^S:(R16|UR04|R24):/.test(k))) tags.push('x');
  if (keys.some((k) => /^S:[^:]+:\d+:\d:.*E/.test(k) && /^S:(R16|UR04|B04)/.test(k))) tags.push('burnC');
  if (keys.some((k) => /^S:(U97|U03)/.test(k))) tags.push('tap');
  if (keys.some((k) => /^S:(G30|G19|G08)/.test(k))) tags.push('bite');
  if (keys.some((k) => /^S:(R09|R02|R91|UR01):/.test(k))) tags.push('haste');
  if (q.bf.some((id) => (tsumeDef(id).kw || []).includes('flying')) && q.foe.some((f) => !f[3])) tags.push('fly');
  const spells = keys.filter((k) => k.startsWith('S:') || k.startsWith('T:')).length;
  const used = new Set(keys.filter((k) => /^[SCT]:/.test(k)).map((k) => k.split(':')[1]));
  const kw = q.bf.filter((id) => KW_IDS.has(id)).length + q.foe.filter((f) => f[2] && f[2] !== 'defender' && !f[3]).length;
  const steps = keys.filter((k) => k !== 'D').length;
  return { pz: q, life: q.life, steps, sols: r.sols, tags, spells, kw, used, naive: naiveWins(q), rate: 0, best: r.best };
}

// にた 問題を へらす ための しるし
// レベル 1 は ライフと クリーチャーの 数で わける（こたえの 形は どれも「ぜんぶで こうげき」なので）
const shape = (m) => (m.pz.lv === 1 ? [...m.used].sort().join(',') : `${m.tags.join('+')}|${[...m.used].sort().join(',')}`);

function generate(lv, n, seed, ms) {
  const rng = seeded(seed * 1000 + lv), c = LV[lv];
  const out = [], shapes = new Map(), seenPz = new Set();
  const t0 = Date.now(), st = { tries: 0, solved: 0, dead: 0, level: 0, shape: 0 };
  for (; out.length < n && Date.now() - t0 < ms; st.tries++) {
    const pz = candidate(rng, lv);
    const key = JSON.stringify([pz.foe, [...pz.bf].sort(), [...pz.hand].sort(), pz.mana]);
    if (seenPz.has(key)) continue;
    seenPz.add(key);
    const m = measure(pz);
    if (!m) continue;
    st.solved++;
    // 手札の カードは、こたえで つかうか、マナに おけるか、まよわせる（つかえる）カード。ぜんぜん つかえない カードが 2まい いじょう なら やめる
    const dead = m.pz.hand.filter((id) => !m.used.has(id)).length;
    if (dead > 1 || (lv <= 2 && dead > 0)) { st.dead++; continue; }
    // レベルの 条件（でたらめの 勝ちやすさ は 高く つくので さいご）
    m.rate = 1;
    if (!c.ok({ ...m, rate: 0 })) { st.level++; if (process.env.TSUME_DEBUG) process.stderr.write(`  x steps ${m.steps} spells ${m.spells} sols ${m.sols} life ${m.life} naive ${m.naive} kw ${m.kw}\n`); continue; }
    m.rate = randomWinRate(m.pz, 300, rng);
    if (!c.ok(m)) { st.level++; if (process.env.TSUME_DEBUG) process.stderr.write(`  x rate ${m.rate.toFixed(3)} steps ${m.steps} sols ${m.sols}\n`); continue; }
    if (lv === 1 && out.some((x) => x.life === m.life && x.pz.bf.length === m.pz.bf.length)) { st.shape++; continue; } // レベル 1：ライフと クリーチャーの 数が おなじ 問題は 1つ
    const sh = shape(m);
    if ((shapes.get(sh) || 0) >= (lv === 1 ? (m.used.size ? 3 : 4) : 2)) { st.shape++; continue; } // レベル 1：カードなし 4問・おなじ カード 3問まで
    shapes.set(sh, (shapes.get(sh) || 0) + 1);
    out.push(m);
  }
  process.stderr.write(`レベル ${lv}：${out.length}問（${Math.round((Date.now() - t0) / 1000)}秒・ためした ${st.tries}・とけた ${st.solved}・つかわない 手札 ${st.dead}・レベルに あわない ${st.level}・にている ${st.shape}）\n`);
  // やさしい じゅんに（でたらめで 勝てる わりあいが 高い → 低い、手数が 少ない → 多い）
  out.sort((a, b) => a.steps - b.steps || b.rate - a.rate);
  return out.map((m, i) => ({ id: `${lv}-${String(i + 1).padStart(2, '0')}`, lv, life: m.life, foe: m.pz.foe, bf: m.pz.bf, hand: m.pz.hand, mana: m.pz.mana, tags: m.tags, sol: m.best.map((b) => b.text), steps: m.steps, sols: m.sols, rate: +m.rate.toFixed(3) }));
}

if (flag('check')) {
  const { TSUME } = await import('../js/data/tsume.js');
  let bad = 0;
  for (const pz of TSUME) {
    const r = solve(pz), top = solve({ ...pz, life: 99 });
    const ok = r.win && !r.timeout && top.maxDmg === pz.life;
    if (!ok) { bad++; console.log(`NG ${pz.id}：win=${r.win} maxDmg=${top.maxDmg} life=${pz.life}`); }
  }
  console.log(`つめマス ${TSUME.length}問：${bad ? `${bad}問 だめ` : 'ぜんぶ とける（ライフ ＝ いちばん 大きい ダメージ）'}`);
  process.exit(bad ? 1 : 0);
} else if (flag('json')) {
  const lv = +arg('lv', 1);
  process.stdout.write(JSON.stringify(generate(lv, +arg('n', 12), +arg('seed', 1), +arg('ms', 150000))));
} else {
  const n = +arg('n', 12), seed = +arg('seed', 1), ms = +arg('ms', 150000);
  const run = (lv) => new Promise((res, rej) => execFile(process.execPath, [fileURLToPath(import.meta.url), `--lv=${lv}`, `--n=${n}`, `--seed=${seed}`, `--ms=${ms}`, '--json'], { maxBuffer: 1 << 26 }, (e, out, err) => { process.stderr.write(err); return e ? rej(e) : res(JSON.parse(out)); }));
  const all = (await Promise.all([1, 2, 3, 4, 5].map(run))).flat();
  for (const lv of [1, 2, 3, 4, 5]) {
    const ps = all.filter((p) => p.lv === lv);
    console.log(`レベル ${lv}「${LV[lv].name}」：${ps.length}問  手数 ${Math.min(...ps.map((p) => p.steps))}〜${Math.max(...ps.map((p) => p.steps))}  でたらめで 勝てる ${ps.map((p) => Math.round(p.rate * 100)).join('・')}%`);
  }
  const body = all.map((p) => `  ${JSON.stringify(p)},`).join('\n');
  writeFileSync(OUT, `// 自動生成：node tools/gen_tsume.mjs（手で 直さない。docs/TSUME.md）
// つめマスの 問題。life：てきの ライフ、foe：てきの クリーチャー [パワー, タフネス, キーワード, タップ]、bf：じぶんの 場、hand：手札、mana：マナゾーンの 色
// sol：こたえ（いちばん みじかい 手じゅん）、tags：こたえの 考えかた（ヒントに つかう）、steps：手数、sols：こたえの 数、rate：でたらめに やって 勝てる わりあい
export const TSUME_LEVELS = ${JSON.stringify(Object.fromEntries(Object.entries(LV).map(([k, v]) => [k, v.name])))};
export const TSUME = [
${body}
];
`);
  console.log(`${OUT}：${all.length}問`);
  if (flag('show')) for (const p of all) console.log(`\n[${p.id}] ライフ ${p.life} ／ てき ${p.foe.map((f) => `${f[0]}/${f[1]}${f[2] ? `(${f[2]})` : ''}${f[3] ? 'T' : ''}`).join(' ')} ／ 場 ${p.bf.map((id) => strip(tsumeDef(id).name)).join('・')} ／ 手札 ${p.hand.map((id) => strip(BY_ID[id].name)).join('・')} ／ マナ ${p.mana}\n  ${p.sol.map(strip).join('\n  ')}`);
}
