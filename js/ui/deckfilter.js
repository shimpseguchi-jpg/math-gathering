// デッキ構築の「こまかく」：ならべかえ（ソート）と しぼりこみ。せっていは この 端末に のこる
import { colorsOf } from '../engine/game.js';
import { ptsOf } from '../engine/ai.js';
import { info, ruby, esc, byColorCost, COLOR_NAME, RAR } from './view.js';

const KEY = 'mtg-build-filter';
const FRESH = () => ({ open: false, sort: 'color', desc: false, q: '', cost: [], colors: [], types: [], subs: [], rar: [], kws: [], deck: 'all' });
export function loadFilter() { try { return { ...FRESH(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return FRESH(); } }
export function saveFilter(F) { try { localStorage.setItem(KEY, JSON.stringify(F)); } catch { /* 保存できなくても つかえる */ } }

const plain = (s) => s.replace(/（[ぁ-ゖー]+）/g, '').trim();
// クリーチャーの しゅるい（表の「クリーチャー — 人間・兵士」の うしろ）。ふりがなつきで かえす
export const subsOf = (d) => ((d.types || []).includes('creature') ? (info(d).type.split('—')[1] || '').split(/[・ ]/).map((x) => x.trim()).filter(Boolean) : []);
const TYPES = [['creature', 'クリーチャー'], ['instant', 'インスタント'], ['sorcery', 'ソーサリー'], ['enchantment', 'エンチャント'], ['artifact', 'アーティファクト'], ['planeswalker', 'プレインズウォーカー'], ['legend', '伝説（でんせつ）']];
const TYPE_ORDER = ['creature', 'planeswalker', 'instant', 'sorcery', 'enchantment', 'artifact'];
const typeKey = (d) => { const i = TYPE_ORDER.findIndex((t) => (d.types || []).includes(t)); return i < 0 ? 9 : i; };
const COSTS = ['0', '1', '2', '3', '4', '5', '6+'];
const costBucket = (d) => (d.cost >= 6 ? '6+' : String(d.cost ?? 0));
const KWS = [['flying', '飛行（ひこう）'], ['haste', '速攻（そっこう）'], ['trample', 'トランプル'], ['vigilance', '警戒（けいかい）'], ['lifelink', '絆魂（はんこん）'], ['deathtouch', '接死（せっし）'], ['first', '先制攻撃（せんせいこうげき）'], ['reach', '到達（とうたつ）'], ['defender', '防衛（ぼうえい）']];
const RANK = { C: 1, U: 2, R: 3, L: 4 };
const SORTS = [
  ['color', 'いろ', byColorCost],
  ['cost', 'マナコスト', (a, b) => (a.cost ?? 0) - (b.cost ?? 0) || byColorCost(a, b)],
  ['type', 'しゅるい', (a, b) => typeKey(a) - typeKey(b) || byColorCost(a, b)],
  ['rar', 'レアリティ', (a, b) => (RANK[a.rar] || 0) - (RANK[b.rar] || 0) || byColorCost(a, b)],
  ['pow', 'パワー', (a, b) => (typeof a.pow === 'number' ? a.pow : -1) - (typeof b.pow === 'number' ? b.pow : -1) || byColorCost(a, b)],
  ['pts', 'てんすう', (a, b) => ptsOf(a) - ptsOf(b) || byColorCost(a, b)],
  ['new', 'てに いれた じゅん', () => 0],
];
const on = (list, v) => list.includes(v);
const flip = (list, v) => (on(list, v) ? list.filter((x) => x !== v) : [...list, v]);
export const filterCount = (F) => F.cost.length + F.colors.length + F.types.length + F.subs.length + F.rar.length + F.kws.length + (F.deck !== 'all' ? 1 : 0) + (F.q ? 1 : 0);

// items：{ i（プールの ばんごう）, d, inDeck, no（入れられない わけ）}。しぼりこんで ならべた i を かえす
export function applyFilter(F, items) {
  const q = plain(F.q || '');
  const keep = items.filter(({ d, inDeck, no }) => {
    const cs = colorsOf(d);
    if (F.cost.length && !on(F.cost, costBucket(d))) return false;
    if (F.colors.length && !F.colors.some((c) => (c === 'multi' ? cs.length >= 2 : c === 'none' ? !cs.length : cs.includes(c)))) return false;
    if (F.types.length && !F.types.some((t) => (t === 'legend' ? d.legend : (d.types || []).includes(t)))) return false;
    if (F.subs.length && !subsOf(d).some((x) => on(F.subs, plain(x)))) return false;
    if (F.rar.length && !on(F.rar, d.rar)) return false;
    if (F.kws.length && !F.kws.every((k) => (d.kw || []).includes(k))) return false;
    if (F.deck === 'in' && !inDeck) return false;
    if (F.deck === 'out' && inDeck) return false;
    if (F.deck === 'ok' && (inDeck || no)) return false;
    if (q && !plain(info(d).name).includes(q) && !info(d).name.replace(/[（）]/g, '').includes(q)) return false;
    return true;
  });
  const cmp = (SORTS.find((s) => s[0] === F.sort) || SORTS[0])[2];
  const sorted = F.sort === 'new' ? keep.sort((a, b) => a.i - b.i) : keep.sort((a, b) => cmp(a.d, b.d) || a.i - b.i);
  if (F.desc) sorted.reverse();
  return sorted.map((x) => x.i);
}

const chip = (attr, v, label, pressed, extra = '') => `<button type="button" class="chip-f ${extra}" data-${attr}="${esc(v)}" aria-pressed="${pressed}">${label}</button>`;
// こまかく の パネル。defs は プールの カード（しゅるいの こうほを つくる）
export function filterPanel(F, defs, shown, total) {
  if (!F.open) return '';
  const subs = [...new Map(defs.flatMap(subsOf).map((x) => [plain(x), x])).entries()].sort((a, b) => a[0].localeCompare(b[0], 'ja'));
  const n = filterCount(F);
  return `<section class="fpanel" aria-label="ならべかえと しぼりこみ">
    <div class="frow"><span class="flabel">ならべる</span><button type="button" class="chip-f dir" data-fdir="1" aria-label="じゅんばんを ぎゃくに">${F.desc ? '↓ 大きい じゅん' : '↑ 小さい じゅん'}</button>${SORTS.map(([k, l]) => chip('fsort', k, l, F.sort === k)).join('')}</div>
    <div class="frow"><span class="flabel">なまえ</span><input type="search" class="fq" data-fq="1" value="${esc(F.q)}" placeholder="なまえで さがす" aria-label="なまえで さがす"></div>
    <div class="frow"><span class="flabel">マナコスト</span>${COSTS.map((c) => chip('fcost', c, c, on(F.cost, c))).join('')}</div>
    <div class="frow"><span class="flabel">いろ</span>${Object.entries(COLOR_NAME).map(([c, l]) => chip('fcolor', c, `<i class="pip m-${c}">${l}</i>`, on(F.colors, c))).join('')}${chip('fcolor', 'multi', '2色いじょう', on(F.colors, 'multi'))}${chip('fcolor', 'none', 'むしょく', on(F.colors, 'none'))}</div>
    <div class="frow"><span class="flabel">しゅるい</span>${TYPES.map(([k, l]) => chip('ftype', k, ruby(l), on(F.types, k))).join('')}</div>
    ${subs.length ? `<div class="frow"><span class="flabel" title="クリーチャーの しゅるい">しゅぞく</span><div class="fscroll">${subs.map(([k, l]) => chip('fsub', k, ruby(l), on(F.subs, k))).join('')}</div></div>` : ''}
    <div class="frow"><span class="flabel">レアリティ</span>${['C', 'U', 'R', 'L'].map((r) => chip('frar', r, RAR[r], on(F.rar, r))).join('')}</div>
    <div class="frow"><span class="flabel">のうりょく</span>${KWS.map(([k, l]) => chip('fkw', k, ruby(l), on(F.kws, k))).join('')}</div>
    <div class="frow"><span class="flabel">デッキ</span>${[['all', 'ぜんぶ'], ['in', '入れた カード'], ['out', '入れて いない'], ['ok', 'いま 入れられる']].map(([k, l]) => chip('fdeck', k, l, F.deck === k)).join('')}</div>
    <div class="frow fsum"><span>${shown} / ${total}まい を 見せて いる${n ? `（しぼりこみ ${n}こ）` : ''}</span>${n ? '<button type="button" class="chip-f" data-freset="1">しぼりこみを けす</button>' : ''}</div>
  </section>`;
}

// パネルの ボタン。かわったら true
export function onFilterClick(F, b) {
  const d = b.dataset;
  if (d.fsort) { if (F.sort === d.fsort) F.desc = !F.desc; else { F.sort = d.fsort; F.desc = false; } }
  else if (d.fdir) F.desc = !F.desc;
  else if (d.fcost) F.cost = flip(F.cost, d.fcost);
  else if (d.fcolor) F.colors = flip(F.colors, d.fcolor);
  else if (d.ftype) F.types = flip(F.types, d.ftype);
  else if (d.fsub) F.subs = flip(F.subs, d.fsub);
  else if (d.frar) F.rar = flip(F.rar, d.frar);
  else if (d.fkw) F.kws = flip(F.kws, d.fkw);
  else if (d.fdeck) F.deck = d.fdeck;
  else if (d.freset) Object.assign(F, { ...FRESH(), open: true, sort: F.sort, desc: F.desc });
  else return false;
  saveFilter(F);
  return true;
}
