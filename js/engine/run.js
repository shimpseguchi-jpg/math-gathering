// 冒険1回ぶん：パック開封 → デッキ構築 → 塔の5階（シミュレーションでも本番でも使う）
import { seeded, shuffle, pick } from './rng.js';
import { newGame, play, colorsOf, COLORS } from './game.js';
import { AI, ptsOf } from './ai.js';
import { ALL, ALL_DEV, BASICS, SET_OF, SETS, BY_ID, bindEngine } from '../data/cards.js';
import { FLOORS, pickFloors } from '../data/enemies.js';
import { pickRavnica } from '../data/ravnica.js';
import { api } from './game.js';

bindEngine(api);

export const DECK_SIZE = 20;
export const CAPACITY = 30;
export const PACK = { C: 4, U: 3, R: 1, legendFromRare: 1 / 8, legendFromCommon: 1 / 20 };

const poolOf = (list) => Object.fromEntries(['C', 'U', 'R', 'L'].map((r) => [r, list.filter((d) => d.rar === r)]));
const POOL = poolOf(ALL);
// パックに 入る カード。sets は 収録する 弾（開発モードの せってい。なければ ぜんぶ）
const POOLS = new Map();
export function packPool(sets) {
  if (!sets) return POOL;
  const key = [...sets].sort().join(',');
  if (!POOLS.has(key)) POOLS.set(key, poolOf(ALL_DEV.filter((d) => sets.includes(SET_OF[d.id]))));
  return POOLS.get(key);
}

// ごほうびパック：クリアした階の数（cleared）だけ 上のレアリティが 少し出やすくなり、favor の色が 出やすくなる
export const REWARD = { cToU: 0.05, uToR: 0.04, rToL: 0.04, surprise: 0.01, favor: 4 };
// em：パックの もんしょう（emblems.js の pack）。leg：レジェンドが 出やすい（unc は openPack で アンコモンを 1まい 足す）
export function packOdds(cleared = 0, em = {}) {
  return {
    cToU: REWARD.cToU * cleared, uToR: REWARD.uToR * cleared,
    rToL: PACK.legendFromRare + REWARD.rToL * cleared + (em.leg || 0), surprise: PACK.legendFromCommon + REWARD.surprise * cleared + (em.leg || 0) / 4,
  };
}
// 1パックに レジェンドが 1まい以上 出る かくりつ
export const legendChance = (cleared = 0, em = {}) => { const o = packOdds(cleared, em); return 1 - (1 - o.rToL) * (1 - o.surprise); };

// 番外編パックの もんしょう：いまの 弾に 番外編を 足す（sets が なければ 出ている 弾）
export const withExtra = (sets, extra = []) => (extra.length ? [...new Set([...(sets || SETS.filter((x) => x.released).map((x) => x.id)), ...extra])] : sets);
// パックに 出る 色（黒は 第3弾から）
export const packColors = (sets) => { const pool = packPool(sets); return COLORS.filter((c) => Object.values(pool).some((l) => l.some((d) => colorsOf(d).includes(c)))); };

// デッキで いちばん多く 使っている色（きほんカードは のぞく）
export function favorColor(deck) {
  const n = {};
  for (const d of deck) if (!d.basic) for (const c of colorsOf(d)) n[c] = (n[c] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// いろの もんしょう：えらんだ 色 1つにつき 重み ＋2（1色 3ばい、2色とも ある カードは 5ばい）
export const EMBLEM_COLOR = 2;
// 番外編パックの もんしょう：番外編の カードは 3ばい 出やすい（1パックの はんぶん くらい。シナジーが できる ように）
export const EXTRA_WEIGHT = 3;
function pickFavored(rng, list, favor, colors = [], extra = []) {
  if (!favor && !colors.length && !extra.length) return pick(rng, list);
  const w = list.map((d) => { const cs = colorsOf(d); return (cs.includes(favor) ? REWARD.favor : 1) * (1 + EMBLEM_COLOR * colors.filter((c) => cs.includes(c)).length) * (extra.includes(SET_OF[d.id]) ? EXTRA_WEIGHT : 1); });
  let r = rng() * w.reduce((t, x) => t + x, 0);
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r < 0) return list[i]; }
  return list[list.length - 1];
}

// o.em：パックの もんしょう { colors：出やすい 色, unc, leg }
export function openPack(rng, o = {}) {
  const em = o.em || {};
  const odds = packOdds(o.cleared || 0, em);
  const pool = packPool(o.sets);
  const take = (r) => pickFavored(rng, pool[r].length ? pool[r] : pool.C, o.favor, em.colors || [], em.extra || []);
  for (let tries = 0; ; tries++) {
    const cards = [];
    for (let i = 0; i < PACK.C; i++) cards.push(take(rng() < odds.cToU ? 'U' : 'C'));
    for (let i = 0; i < PACK.U; i++) cards.push(take(rng() < odds.uToR ? 'R' : 'U'));
    for (let i = 0; i < PACK.R; i++) cards.push(take(rng() < odds.rToL ? 'L' : 'R'));
    const surprise = rng() < odds.surprise;
    if (surprise) cards[0] = take('L');
    if (em.unc) cards.push(take(rng() < odds.uToR ? 'R' : 'U')); // アンコモンの もんしょう：9まいめ
    // 1パックに 4色 いじょう（5色の ときも 4色で よい）
    const cols = new Set(cards.flatMap(colorsOf));
    if (cols.size >= 4 || tries >= 20) { cards.surprise = surprise; return cards; }
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
  // 旗（第6弾）：その 3色の デッキに できる（旗は かならず 入れる）
  const banners = [...new Map(pool.filter((d) => d.banner).map((d) => [d.banner, d])).values()];
  if (o.banners !== false) for (const bn of banners) { const pair = [...bn.banner]; tries.push({ pair, items: inside(pair).filter((d) => d !== bn), forced: bn }); }
  for (const { pair, items, forced } of tries) {
    // dp[n][pts] = { v, pick }
    const dp = Array.from({ length: DECK_SIZE + 1 }, () => Array(cap + 1).fill(null));
    if (forced) dp[1][ptsOf(forced)] = { v: cardValue(forced), pick: [forced] };
    else dp[0][0] = { v: 0, pick: [] };
    for (const d of items) {
      const w = ptsOf(d), v = cardValue(d);
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
  return { deck, pair: best.pair.join(''), points: best.pick.reduce((t, d) => t + ptsOf(d), 0), real: best.pick.length };
}

export async function fight(deck, floorId, o = {}) {
  const s = newGame({ deck, floor: o.floor || FLOORS[floorId](), diff: o.diff || 'normal', seed: o.seed || 1, reshuffle: o.reshuffle ?? true, ai: AI, log: !!o.log, emblem: o.emblem });
  await play(s, o.maxTurns || 40);
  return s;
}

export async function runAdventure(o = {}) {
  const rng = seeded(o.seed || 1);
  const pool = [];
  // パックの もんしょう：きまぐれの 色は ぼうけんの はじめに きめる。はじめの 旗は さいしょから もつ
  const pk = o.emblem?.pack;
  o = { ...o, sets: withExtra(o.sets, pk?.extra) };
  const em = pk ? { ...pk, colors: [...pk.colors, ...(pk.rand ? [pick(rng, packColors(o.sets))] : [])] } : undefined;
  if (pk?.banner) pool.push(BY_ID[pk.banner]);
  for (let i = 0; i < 3; i++) pool.push(...openPack(rng, { sets: o.sets, em }));
  let b = buildDeck(pool, o);
  const floors = o.floors || (o.plane === 'ravnica' ? pickRavnica : pickFloors)(rng);
  let continues = o.continues ?? 1;
  const log = { floors: [], cleared: false, decks: [] };
  for (let i = 0; i < floors.length; i++) {
    log.decks.push({ pair: b.pair, real: b.real, points: b.points }); log.deckIds = b.deck.map((d) => d.id);
    for (;;) {
      const s = await fight(b.deck, floors[i], { ...o, seed: Math.floor(rng() * 1e9), log: o.logFloor === floors[i] });
      if (s.logOn) (log.fightLogs ||= []).push(s.logs.join('\n'));
      log.floors.push({ floor: floors[i], result: s.over, turns: s.stats.playerTurns, life: s.P.life, phase: s.stats.phase, exact: s.stats.exact, reshuffled: s.stats.reshuffled });
      if (s.over === 'win') break;
      if (continues > 0) { continues--; continue; }
      log.lostAt = i + 1;
      return log;
    }
    if (i < 4) { pool.push(...openPack(rng, o.flatPacks ? { sets: o.sets, em } : { cleared: i + 1, favor: favorColor(b.deck), sets: o.sets, em })); b = buildDeck(pool, o); }
  }
  log.cleared = true;
  return log;
}
