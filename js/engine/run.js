// 冒険1回ぶん：パック開封 → デッキ構築 → 塔の5階（シミュレーションでも本番でも使う）
import { seeded, shuffle, pick } from './rng.js';
import { newGame, play, colorsOf, COLORS } from './game.js';
import { AI, RARITY_PTS } from './ai.js';
import { ALL, BASICS, bindEngine } from '../data/cards.js';
import { FLOORS } from '../data/enemies.js';
import { api } from './game.js';

bindEngine(api);

export const DECK_SIZE = 20;
export const CAPACITY = 30;
export const PACK = { C: 4, U: 3, R: 1, legendFromRare: 1 / 8, legendFromCommon: 1 / 20 };

const byRar = (r) => ALL.filter((d) => d.rar === r);
const POOL = { C: byRar('C'), U: byRar('U'), R: byRar('R'), L: byRar('L') };

// ごほうびパック：クリアした階の数（cleared）だけ 上のレアリティが 少し出やすくなり、favor の色が 出やすくなる
export const REWARD = { cToU: 0.05, uToR: 0.04, rToL: 0.04, surprise: 0.01, favor: 2 };
export function packOdds(cleared = 0) {
  return {
    cToU: REWARD.cToU * cleared, uToR: REWARD.uToR * cleared,
    rToL: PACK.legendFromRare + REWARD.rToL * cleared, surprise: PACK.legendFromCommon + REWARD.surprise * cleared,
  };
}
// 1パックに レジェンドが 1まい以上 出る かくりつ
export const legendChance = (cleared = 0) => { const o = packOdds(cleared); return 1 - (1 - o.rToL) * (1 - o.surprise); };

// デッキで いちばん多く 使っている色（きほんカードは のぞく）
export function favorColor(deck) {
  const n = {};
  for (const d of deck) if (!d.basic) for (const c of colorsOf(d)) n[c] = (n[c] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function pickFavored(rng, list, favor) {
  if (!favor) return pick(rng, list);
  const w = list.map((d) => (colorsOf(d).includes(favor) ? REWARD.favor : 1));
  let r = rng() * w.reduce((t, x) => t + x, 0);
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r < 0) return list[i]; }
  return list[list.length - 1];
}

export function openPack(rng, o = {}) {
  const odds = packOdds(o.cleared || 0);
  const take = (r) => pickFavored(rng, POOL[r], o.favor);
  for (let tries = 0; ; tries++) {
    const cards = [];
    for (let i = 0; i < PACK.C; i++) cards.push(take(rng() < odds.cToU ? 'U' : 'C'));
    for (let i = 0; i < PACK.U; i++) cards.push(take(rng() < odds.uToR ? 'R' : 'U'));
    for (let i = 0; i < PACK.R; i++) cards.push(take(rng() < odds.rToL ? 'L' : 'R'));
    const surprise = rng() < odds.surprise;
    if (surprise) cards[0] = take('L');
    const cols = new Set(cards.flatMap(colorsOf));
    if (cols.size === 4 || tries >= 20) { cards.surprise = surprise; return cards; }
  }
}

// デッキ構築AI：2色を選び、キャパシティ内で価値の合計がいちばん大きくなるように選ぶ（ナップサック）
const VALUE = { C: 3, U: 4.5, R: 6, L: 8 };
export const cardValue = (d) => VALUE[d.rar] + (colorsOf(d).length === 2 ? 0.5 : 0);

export function buildDeck(pool, o = {}) {
  const cap = o.capacity ?? CAPACITY;
  let best = null;
  // o.colors：使える 色の 数（ふつうは 2。3色デッキの しらべで 3）
  const k = o.colors ?? 2;
  const combos = (from, n) => (n === 0 ? [[]] : from.flatMap((c, i) => combos(from.slice(i + 1), n - 1).map((rest) => [c, ...rest])));
  const inside = (pair) => pool.filter((d) => colorsOf(d).every((c) => pair.includes(c)));
  const tries = combos(COLORS, k).map((pair) => ({ pair, items: inside(pair) }));
  // o.splash：2色 ＋ 3色めは この まいすうまで（タッチ）
  if (o.splash) for (const two of combos(COLORS, 2)) for (const t of COLORS.filter((c) => !two.includes(c))) {
    const pair = [...two, t];
    const extra = inside(pair).filter((d) => colorsOf(d).includes(t)).sort((a, b) => cardValue(b) - cardValue(a)).slice(0, o.splash);
    tries.push({ pair, items: [...inside(two), ...extra] });
  }
  for (const { pair, items } of tries) {
    // dp[n][pts] = { v, pick }
    const dp = Array.from({ length: DECK_SIZE + 1 }, () => Array(cap + 1).fill(null));
    dp[0][0] = { v: 0, pick: [] };
    for (const d of items) {
      const w = RARITY_PTS[d.rar], v = cardValue(d);
      for (let n = DECK_SIZE - 1; n >= 0; n--) for (let p = cap - w; p >= 0; p--) {
        const cur = dp[n][p]; if (!cur) continue;
        const nx = dp[n + 1][p + w];
        if (!nx || nx.v < cur.v + v) dp[n + 1][p + w] = { v: cur.v + v, pick: [...cur.pick, d] };
      }
    }
    for (const row of dp) for (const c of row) if (c && (!best || c.v > best.v)) best = { ...c, pair };
  }
  const deck = [...best.pick];
  // きほんカード：色の多いほうから じゅんばんに
  const cnt = Object.fromEntries(best.pair.map((c) => [c, deck.filter((d) => colorsOf(d).includes(c)).length]));
  const order = [...best.pair].sort((a, b) => cnt[b] - cnt[a]);
  for (let n = 0; deck.length < DECK_SIZE; n++) deck.push(BASICS[order[n % order.length]]);
  return { deck, pair: best.pair.join(''), points: best.pick.reduce((t, d) => t + RARITY_PTS[d.rar], 0), real: best.pick.length };
}

export async function fight(deck, floorId, o = {}) {
  const s = newGame({ deck, floor: o.floor || FLOORS[floorId](), diff: o.diff || 'normal', seed: o.seed || 1, reshuffle: o.reshuffle ?? true, ai: AI, log: !!o.log });
  await play(s, o.maxTurns || 40);
  return s;
}

export async function runAdventure(o = {}) {
  const rng = seeded(o.seed || 1);
  const pool = [];
  for (let i = 0; i < 3; i++) pool.push(...openPack(rng));
  let b = buildDeck(pool, o);
  const floors = ['hydra', 'horde', rng() < 0.5 ? 'factory' : 'slime', 'xenagos', 'erebos'];
  let continues = o.continues ?? 1;
  const log = { floors: [], cleared: false, decks: [] };
  for (let i = 0; i < floors.length; i++) {
    log.decks.push({ pair: b.pair, real: b.real, points: b.points });
    for (;;) {
      const s = await fight(b.deck, floors[i], { ...o, seed: Math.floor(rng() * 1e9), log: o.logFloor === floors[i] });
      if (s.logOn) (log.fightLogs ||= []).push(s.logs.join('\n'));
      log.floors.push({ floor: floors[i], result: s.over, turns: s.stats.playerTurns, life: s.P.life, phase: s.stats.phase, exact: s.stats.exact, reshuffled: s.stats.reshuffled });
      if (s.over === 'win') break;
      if (continues > 0) { continues--; continue; }
      log.lostAt = i + 1;
      return log;
    }
    if (i < 4) { pool.push(...openPack(rng, o.flatPacks ? {} : { cleared: i + 1, favor: favorColor(b.deck) })); b = buildDeck(pool, o); }
  }
  log.cleared = true;
  return log;
}
