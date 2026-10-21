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

export function openPack(rng) {
  for (let tries = 0; ; tries++) {
    const cards = [];
    for (let i = 0; i < PACK.C; i++) cards.push(pick(rng, POOL.C));
    for (let i = 0; i < PACK.U; i++) cards.push(pick(rng, POOL.U));
    for (let i = 0; i < PACK.R; i++) cards.push(pick(rng, rng() < PACK.legendFromRare ? POOL.L : POOL.R));
    const surprise = rng() < PACK.legendFromCommon;
    if (surprise) cards[0] = pick(rng, POOL.L);
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
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const pair = [COLORS[i], COLORS[j]];
    const items = pool.filter((d) => colorsOf(d).every((c) => pair.includes(c)));
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
  // きほんカード：色の多いほうから交互に
  const cnt = Object.fromEntries(best.pair.map((c) => [c, deck.filter((d) => colorsOf(d).includes(c)).length]));
  const order = [...best.pair].sort((a, b) => cnt[b] - cnt[a]);
  for (let k = 0; deck.length < DECK_SIZE; k++) deck.push(BASICS[order[k % 2]]);
  return { deck, pair: best.pair.join(''), points: best.pick.reduce((t, d) => t + RARITY_PTS[d.rar], 0), real: best.pick.length };
}

export async function fight(deck, floorId, o = {}) {
  const s = newGame({ deck, floor: FLOORS[floorId](), diff: o.diff || 'normal', seed: o.seed || 1, mathRate: o.mathRate ?? 0.7, reshuffle: o.reshuffle ?? true, ai: AI, log: !!o.log });
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
      log.floors.push({ floor: floors[i], result: s.over, turns: s.stats.playerTurns, life: s.P.life, phase: s.stats.phase, asked: s.stats.asked, ok: s.stats.ok, reshuffled: s.stats.reshuffled });
      if (s.over === 'win') break;
      if (continues > 0) { continues--; continue; }
      log.lostAt = i + 1;
      return log;
    }
    if (i < 4) { pool.push(...openPack(rng)); b = buildDeck(pool, o); }
  }
  log.cleared = true;
  return log;
}
