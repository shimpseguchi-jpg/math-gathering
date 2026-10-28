// こうちくモードの もちもの（docs/CONSTRUCTED.md）：パックけん・もって いる カード・デッキ。ブラウザに のこる
// パックけんは とうの 階の クリア・しゅぎょう・トロフィーで もらい、ショップで パックと ひきかえる
import { SETS, BY_ID } from '../data/cards.js';
import { toast } from './view.js';
import { hasServer, CONF } from './server.js';
import { DEV } from './settings.js';

const KEY = 'mtg-collection';
export const MAX_COPY = 4; // 同じ カードは 4まいまで（きほんカードは のぞく）。4まい もって いる カードは ショップで もう 出ない
export const STUDY_DAY_MAX = 5; // しゅぎょうで もらえる パックけんは 1日 5まいまで
export const TROPHY_TICKETS = { B: 1, S: 2, G: 3, P: 5 };
export const ENDLESS_PER = 5; // むげんの とうは 5階 のぼるごとに 1まい
export const DECK_MAX = 10;
// デッキの ルール（4つ）：ノーマル（30点・2色）／エターナル（点と 色の せいげん なし）と、それぞれの 統率者（統率者の 色だけ）
export const RULES = { normal: 'ノーマル', eternal: 'エターナル', normalCmd: 'ノーマル（統率者（とうそつしゃ））', eternalCmd: 'エターナル（統率者（とうそつしゃ））' };
export const isCmdRule = (rule) => rule === 'normalCmd' || rule === 'eternalCmd';
export const isEternal = (rule) => rule === 'eternal' || rule === 'eternalCmd';

// { tickets, cards: { id: まい数 }, decks: [{ id, rule, n, cmd: 統率者の id（統率者の ルール）, cards: [id…], t }], study: { day, n }, tro: { トロフィーid: 1 }, got: もらった パックけんの 合計 }
function load() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && v.cards) return v; } catch { /* こわれていたら はじめから */ }
  return { tickets: 0, cards: {}, decks: [], study: { day: '', n: 0 }, tro: {}, got: 0 };
}
let C = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(C)); } catch { /* 保存できなくても あそべる */ } };

// ---- パックけん ----
export const tickets = () => C.tickets;
export function addTickets(n, why = '', quiet = false) {
  if (!(n > 0)) return 0;
  C.tickets += n; C.got += n; save();
  if (!quiet && typeof document !== 'undefined') toast(`パックけん ＋${n}まい${why ? `（${why}）` : ''}`);
  return n;
}
export function useTicket() {
  if (C.tickets < 1) return false;
  C.tickets--; save();
  return true;
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
// しゅぎょうに ごうかく：1まい（1日 STUDY_DAY_MAX まいまで）。もらえた まい数を かえす
export function studyTicket() {
  if (C.study.day !== today()) C.study = { day: today(), n: 0 };
  if (C.study.n >= STUDY_DAY_MAX) return 0;
  C.study.n++; save();
  return addTickets(1, 'しゅぎょう', true); // しゅぎょうの けっかの 画面に 出す
}
export const studyLeft = () => (C.study.day === today() ? Math.max(0, STUDY_DAY_MAX - C.study.n) : STUDY_DAY_MAX);
// トロフィー（list：もって いる トロフィー { id, g }）。まだ パックけんに して いない ぶんを まとめて もらう
export function trophyTickets(list) {
  const fresh = list.filter((t) => !C.tro[t.id]);
  if (!fresh.length) return 0;
  for (const t of fresh) C.tro[t.id] = 1;
  return addTickets(fresh.reduce((s, t) => s + (TROPHY_TICKETS[t.g] || 0), 0), 'トロフィー');
}

// ---- もって いる カード ----
// 先生（開発モード）と WEB版の デバッグモードは、カードを ぜんぶ 4まい もって いる ことに できる（ほんとうの もちものは のこる）
const ALL_KEY = 'mtg-cards-all';
export const canOpenAll = () => DEV || (hasServer() && CONF.admin);
export const openAllSaved = () => { try { return localStorage.getItem(ALL_KEY) === '1'; } catch { return false; } };
export const openAll = () => canOpenAll() && openAllSaved();
export const setOpenAll = (v) => { try { localStorage.setItem(ALL_KEY, v ? '1' : '0'); } catch { /* この あいだだけ */ } };
const PACK_CARDS = SETS.filter((x) => !x.raid).flatMap((x) => x.cards).filter((d) => !d.noPack);

// ほんとうに もって いる まい数（ショップの「4まい そろった」は こちら）
export const realCount = (id) => C.cards[id] || 0;
export const realCards = () => C.cards;
// デッキに つかえる まい数（4まいまで。ぜんぶ 開放なら 4まい）
export const ownCount = (id) => (openAll() && BY_ID[id] && !BY_ID[id].noPack ? MAX_COPY : Math.min(MAX_COPY, C.cards[id] || 0));
// デッキに つかえる カードの ならび（同じ カードは まい数ぶん。てに いれた じゅん）
export function ownPool() {
  const ids = openAll() ? PACK_CARDS.map((d) => d.id) : Object.keys(C.cards).filter((id) => BY_ID[id]);
  return ids.flatMap((id) => Array(ownCount(id)).fill(id));
}
export function addCards(cards) {
  for (const d of cards) C.cards[d.id] = (C.cards[d.id] || 0) + 1;
  save();
}

// ---- デッキ ----
export const decks = () => C.decks;
export function saveDeck(deck) {
  const i = C.decks.findIndex((x) => x.id === deck.id);
  if (i >= 0) C.decks[i] = deck; else C.decks.push(deck);
  save();
}
export function dropDeck(id) { C.decks = C.decks.filter((x) => x.id !== id); save(); }
// あたらしい デッキの ばんごう（ルールごとに 1・2・3…）
export const nextDeckNo = (rule) => Math.max(0, ...C.decks.filter((x) => x.rule === rule).map((x) => x.n || 0)) + 1;
// もって いない カード（ぜんぶ 開放を やめた あとなど）。統率者も 1まい つかう
export function missing(deck) {
  const need = {};
  if (deck.cmd) need[deck.cmd] = 1;
  for (const id of deck.cards) need[id] = (need[id] || 0) + 1;
  return Object.entries(need).reduce((t, [id, n]) => t + Math.max(0, n - ownCount(id)), 0);
}
