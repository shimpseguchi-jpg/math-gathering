// こうちくモード（docs/CONSTRUCTED.md）：パックけんで ショップの パックを あけて カードを あつめ、デッキを くむ
// 冒険（ローグライク）とは べつ。ここの カード・デッキは 冒険には もちこまない
// デッキの ルール：ノーマル（とうと 同じ 20まい・30点・2色）／エターナル（キャパシティと 色の 制限なし）と、
// それぞれの 統率者（統率者の 色だけ。統率者は とうそつりょういき）、みならい（1年生の カードプール だけ。もって いなくても つかえる）。
// どれも 同じ カードは 4まいまで
import { SETS, BY_ID, BASICS } from '../data/cards.js';
import { SLOTS } from '../data/enemies.js';
import { RAV_SLOTS } from '../data/ravnica.js';
import { colorsOf, COLORS } from '../engine/game.js';
import { ptsOf } from '../engine/ai.js';
import { openPack, buildDeck, cardValue, DECK_SIZE, CAPACITY } from '../engine/run.js';
import { startBattle } from './battle.js';
import { gacha } from './gacha.js';
import { deckBuilder, FLOOR_NAMES, CMD_BUFF_FROM } from './app.js';
import { pickLegend } from './commander.js';
import { onPack, syncTrophyTickets } from './trophies.js';
import { zukanPack } from './zukan.js';
import { loadFilter, filterPanel, applyFilter, onFilterClick, onFilterInput, filterCount, saveFilter } from './deckfilter.js';
import { hasServer, CONF } from './server.js';
import { cardFace, detail, sheet, esc, ruby, info, COLOR_NAME } from './view.js';
import {
  tickets, useTicket, studyLeft, STUDY_DAY_MAX, TROPHY_TICKETS, MAX_COPY, DECK_MAX, RULES, isCmdRule, isEternal, isFirst,
  realCount, realCards, ownCount, ownPool, useCount, rulePool, addCards, openAll, decks, saveDeck, dropDeck, nextDeckNo, missing,
} from './collection.js';
import { POOL1 } from '../data/pool1.js';
import { KIHON_RULE } from '../data/kihon.js';

let APP = null, BACK = null; // タイトルの app() と もどり先
const app = () => APP();
const PLANES = [['theros', 'テーロス', SLOTS], ['ravnica', 'ラヴニカ', RAV_SLOTS]];
const DIFFS = [['easy', 'かんたん'], ['normal', 'ふつう'], ['hard', 'むずかしい']];
const P = { deck: null, plane: 'theros', diff: 'normal' }; // れんしゅうの えらんだ もの（この あいだだけ）
const FILTER_KEY = 'mtg-build-filter-c'; // こうちくモードの「こまかく」（冒険とは べつに のこす）

const pips = (cols) => cols.map((c) => `<i class="pip m-${c}">${COLOR_NAME[c]}</i>`).join('') || '<i class="pip">むしょく</i>';
const sortCols = (cols) => [...cols].sort((a, b) => 'WUKRG'.indexOf(a) - 'WUKRG'.indexOf(b));
const identOf = (d) => (d.cmd && BY_ID[d.cmd] ? sortCols(colorsOf(BY_ID[d.cmd])) : null);
// デッキの 色：統率者の ルールは 統率者の 色、ほかは 入れた カードの 色
const deckCols = (d) => identOf(d) || sortCols([...new Set(d.cards.map((id) => BY_ID[id]).filter(Boolean).flatMap(colorsOf))]);
// なまえ（ふりがなつき。ruby に とおして 出す）
const deckName = (d) => `${RULES[d.rule]} ${deckCols(d).map((c) => COLOR_NAME[c]).join('') || 'むしょく'} ${d.n}`;
const deckPts = (d) => d.cards.reduce((t, id) => t + (BY_ID[id] ? ptsOf(BY_ID[id]) : 0), 0);
const shopSets = () => SETS.filter((x) => !x.raid && !(hasServer() && (CONF.ban || []).includes(x.id)));
const packCards = (x) => x.cards.filter((d) => !d.noPack);
const isLegendCreature = (d) => d.legend && (d.types || []).includes('creature');
const say = (html, title) => sheet(html, [{ label: 'とじる', value: 1, kind: 'primary' }], { title });

// ---- メニュー ----
export function constructMenu(appFn, back) {
  APP = appFn; BACK = back;
  syncTrophyTickets(); // こうちくモードが できる まえに もらった トロフィーの ぶんも
  menu();
}
function menu() {
  const kinds = Object.keys(realCards()).filter((id) => BY_ID[id]).length;
  const total = Object.values(realCards()).reduce((t, n) => t + n, 0);
  app().innerHTML = `<main class="zukan construct">
    <h2>こうちく</h2>
    <p class="zk-total">パックけん <b>${tickets()}</b>まい</p>
    ${openAll() ? '<p class="fine"><span class="dev-badge">開発</span> カードを ぜんぶ 4まい もって いる ことに して いる（ほんとうの もちものは のこる）</p>' : ''}
    <div class="title-btns">
      <button type="button" class="btn primary" data-go="shop">ショップ<small>パックけん 1まいで パックを 1つ</small></button>
      <button type="button" class="btn" data-go="decks">デッキ<small>${ruby('ノーマル・エターナル・統率者（とうそつしゃ）')}（${decks().length} / ${DECK_MAX}）</small></button>
      <button type="button" class="btn" data-go="practice">れんしゅう<small>くんだ デッキで とうの てきと たたかう</small></button>
      <button type="button" class="btn" data-go="cards">もって いる カード<small>${kinds}しゅるい・${total}まい</small></button>
    </div>
    <section class="st-sec">
      <h3>パックけんの もらいかた</h3>
      <ul class="cs-how">
        <li>${ruby('とうの 階（かい）を クリア')}：1階で 1まい（とうの おわりに まとめて）。むげんの とうは 5階ごとに 1まい</li>
        <li>しゅぎょうに ごうかく：1まい（1日 ${STUDY_DAY_MAX}まいまで。きょうは あと ${studyLeft()}まい）</li>
        <li>トロフィー：ブロンズ ${TROPHY_TICKETS.B}・シルバー ${TROPHY_TICKETS.S}・ゴールド ${TROPHY_TICKETS.G}・プラチナ ${TROPHY_TICKETS.P}まい</li>
      </ul>
    </section>
    <button type="button" class="btn ghost" data-back="1">タイトルへ もどる</button>
  </main>`;
  app().onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.back) return BACK();
    if (b.dataset.go === 'shop') return shop();
    if (b.dataset.go === 'decks') return deckList();
    if (b.dataset.go === 'practice') return practice();
    if (b.dataset.go === 'cards') return cardList();
  };
}

// ---- ショップ：ぜんぶの 弾の パック。中身は あけるまで わからない。4まい もって いる カードは 出ない ----
function shop() {
  const rows = shopSets().map((x) => {
    const list = packCards(x);
    const have = list.filter((d) => realCount(d.id) > 0).length;
    const full = list.filter((d) => realCount(d.id) >= MAX_COPY).length;
    const done = full === list.length;
    return `<li class="cs-set ${done ? 'done' : ''}">
      <span class="cs-set-name">${x.released || x.sub || x.extra ? '' : '<small><em class="st-dev">開発中</em></small>'}<b>${ruby(x.name)}</b>
        <small>もって いる ${have} / ${list.length}しゅるい・4まい そろった ${full}</small></span>
      <button type="button" class="btn ${done ? '' : 'primary'}" data-buy="${x.id}" ${done || tickets() < 1 ? 'disabled' : ''}>${done ? 'コンプリート！' : 'あける'}<small>${done ? 'ぜんぶ 4まい' : 'パックけん 1まい'}</small></button>
    </li>`;
  }).join('');
  app().innerHTML = `<main class="zukan construct">
    <h2>ショップ</h2>
    <p class="zk-total">パックけん <b>${tickets()}</b>まい</p>
    <p class="zk-note">${ruby('すきな 弾（だん）の パックを あけられる。中の カードは あけるまで わからない。4まい もって いる カードは もう 出ない。')}</p>
    <ul class="cs-sets">${rows}</ul>
    <button type="button" class="btn ghost" data-back="1">もどる</button>
  </main>`;
  app().onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.back) return menu();
    if (b.dataset.buy) return buy(SETS.find((x) => x.id === +b.dataset.buy));
  };
}
async function buy(x) {
  const t = tickets();
  if (t < 1) return say('<p>パックけんが ない。とうを のぼるか、しゅぎょうで もらおう。</p>', 'ショップ');
  const ok = await sheet(`<p>${ruby(`${x.name}の パックを あける？`)}</p><p class="cs-math">パックけん ${t} − 1 ＝ <b>${t - 1}</b>まい</p>`,
    [{ label: 'あける', value: 1, kind: 'primary' }, { label: 'やめる', value: 0 }], { title: 'ショップ' });
  if (!ok) return shop();
  const before = { ...realCards() };
  const cards = openPack(Math.random, { sets: [x.id], have: before, max: MAX_COPY });
  if (!cards.length) return shop(); // コンプリート（ボタンは 出ないので ここには こない）
  useTicket();
  addCards(cards); zukanPack(cards); // さきに のこす（とちゅうで とじても カードは なくならない）
  gacha(APP, cards, {
    eyebrow: `ショップ　${ruby(x.name)}`, owned: new Set(Object.keys(before)), doneLabel: 'ショップへ',
    bonus: `<div class="bonus"><p class="bonus-title">${ruby(x.name)}</p><span>4まい もって いる カードは 出ない</span></div>`,
    done: () => { onPack(cards); shop(); }, // トロフィー（めくりおわってから）
  });
}

// ---- デッキ ----
const RULE_NOTE = {
  normal: 'とうと 同じ（20まい・30点・2色まで）',
  eternal: '点と 色の せいげんが ない',
  normalCmd: '統率者（とうそつしゃ）の 色だけ・30点',
  eternalCmd: '統率者（とうそつしゃ）の 色だけ・点の せいげん なし',
  first: `かんたんな ${POOL1.length}しゅるいから・30点・2色。もって いなくても つかえる`,
};
function deckList() {
  const list = decks();
  const full = list.length >= DECK_MAX;
  app().innerHTML = `<main class="zukan construct">
    <h2>デッキ</h2>
    <p class="zk-note">${ruby(`ノーマル：とうと 同じ（20まい・30点・2色まで）。エターナル：点と 色の せいげんが ない。統率者（とうそつしゃ）：伝説（でんせつ）の クリーチャーを 統率者（とうそつしゃ）に して、その 色の カードだけ。${KIHON_RULE}：みならいの しけんの カード（ルールと 漢字の かんたんな ${POOL1.length}しゅるい）から えらぶ（ノーマルと 同じ 30点・2色。もって いなくても ${MAX_COPY}まいずつ つかえる）。どれも 同じ カードは ${MAX_COPY}まいまで（きほんカードは のぞく）。`)}</p>
    ${list.length ? `<ul class="cs-decks">${list.map((d) => { const miss = missing(d); return `<li><button type="button" class="cs-deck" data-deck="${esc(d.id)}">
      <span class="cs-rule r-${d.rule}">${ruby(RULES[d.rule])}</span><b>${ruby(deckName(d))}</b>
      ${d.cmd && BY_ID[d.cmd] ? `<span class="cs-cmd">${ruby(`統率者（とうそつしゃ）：${info(BY_ID[d.cmd]).name}`)}</span>` : ''}
      <span class="cs-meta">${pips(deckCols(d))}<small>${d.cards.length}まい ＋ きほん ${DECK_SIZE - d.cards.length}まい・${deckPts(d)}点</small>${miss ? `<em>もって いない カード ${miss}まい</em>` : ''}</span>
    </button></li>`; }).join('')}</ul>` : '<p class="zk-note">まだ デッキが ない。</p>'}
    <h3 class="zk-h">あたらしく つくる</h3>
    <div class="cs-new">${Object.entries(RULES).map(([k, l]) => `<button type="button" class="btn ${k === 'normal' ? 'primary' : ''}" data-new="${k}" ${full ? 'disabled' : ''}><span>${ruby(l)}</span><small>${ruby(RULE_NOTE[k])}</small></button>`).join('')}</div>
    ${full ? `<p class="zk-note">デッキは ${DECK_MAX}こまで。いらない デッキを けそう。</p>` : ''}
    <button type="button" class="btn ghost" data-back="1">もどる</button>
  </main>`;
  app().onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.back) return menu();
    if (b.dataset.new) return newDeck(b.dataset.new);
    const d = list.find((x) => x.id === b.dataset.deck); if (!d) return;
    const v = await sheet(`<p><b>${ruby(deckName(d))}</b></p>${d.cmd && BY_ID[d.cmd] ? `<p>${ruby(`統率者（とうそつしゃ）：${info(BY_ID[d.cmd]).name}`)}</p>` : ''}<p>${d.cards.length}まい ＋ きほん ${DECK_SIZE - d.cards.length}まい・${deckPts(d)}点</p>`,
      [{ label: 'なおす', value: 'edit', kind: 'primary' }, { label: 'れんしゅうで つかう', value: 'play' }, { label: 'けす', value: 'del' }, { label: 'とじる', value: null }], { title: 'デッキ' });
    if (v === 'edit') return build(d);
    if (v === 'play') { P.deck = d.id; return practice(); }
    if (v === 'del') {
      const sure = await sheet(`<p>${ruby(deckName(d))} を けす？ もとに もどせない。</p>`, [{ label: 'けす', value: 1 }, { label: 'やめる', value: 0, kind: 'primary' }], { title: 'デッキ' });
      if (sure) dropDeck(d.id);
    }
    return deckList();
  };
}
async function newDeck(rule) {
  if (!isFirst(rule) && !ownPool().length) {
    const v = await sheet('<p>まだ カードが ない。ショップで パックを あけよう。</p>', [{ label: 'ショップへ', value: 1, kind: 'primary' }, { label: 'とじる', value: 0 }], { title: 'デッキ' });
    return v ? shop() : deckList();
  }
  const deck = { id: `d${Date.now().toString(36)}`, rule, n: nextDeckNo(rule), cards: [], t: Date.now() };
  if (isCmdRule(rule)) {
    deck.cmd = await chooseCommander();
    if (!deck.cmd) return deckList();
  }
  return build(deck, true);
}
// 統率者：もって いる 伝説の クリーチャーから えらぶ
async function chooseCommander(cur) {
  if (!ownPool().some((id) => isLegendCreature(BY_ID[id]))) {
    await say(`<p>${ruby('伝説（でんせつ）の クリーチャーを もって いない。ショップで あつめよう。')}</p>`, ruby('統率者（とうそつしゃ）'));
    return null;
  }
  return pickLegend({ cur, only: (d) => ownCount(d.id) > 0, eyebrow: 'こうちく', back: cur ? 'かえない' : 'もどる' });
}
// くむ。冒険と 同じ 画面（同じ カードは まとめて「●●○○」）。fresh：あたらしい デッキ（さいしょは おまかせ）
// 統率者の ルールは、統率者に 1まい つかうので デッキに 入れられるのは のこりの まい数
function build(deck, fresh = false) {
  const pool = rulePool(deck.rule);
  if (deck.cmd) { const k = pool.indexOf(deck.cmd); if (k >= 0) pool.splice(k, 1); }
  const ident = identOf(deck);
  const idx = (ids) => { const used = new Set(); return ids.map((id) => pool.findIndex((x, k) => x === id && !used.has(k) && used.add(k))).filter((k) => k >= 0); };
  const C = {
    pool, deck: fresh ? null : idx(deck.cards), stack: true, noCap: isEternal(deck.rule), ident, filterKey: FILTER_KEY,
    colorNote: ident ? '色（統率者（とうそつしゃ）の 色）' : '',
    title: `${RULES[deck.rule]}の デッキ ${deck.n}`,
    auto: () => idx(autoCards(pool, deck.rule, ident)),
    save: () => { deck.cards = C.deck.map((k) => pool[k]); deck.t = Date.now(); saveDeck(deck); },
    ok: deckList, back: { label: 'もどる', go: deckList },
    // 統率者を かえる：色が あわない カードは はずす
    cmd: deck.cmd && BY_ID[deck.cmd] ? { label: `統率者（とうそつしゃ）：${info(BY_ID[deck.cmd]).name}`, change: async () => {
      const id = await chooseCommander(deck.cmd);
      if (id && id !== deck.cmd) {
        const ok = colorsOf(BY_ID[id]);
        deck.cmd = id;
        deck.cards = deck.cards.filter((x) => colorsOf(BY_ID[x]).every((c) => ok.includes(c)));
        saveDeck(deck);
      }
      build(deck);
    } } : null,
  };
  deckBuilder(C);
}
// おまかせ：ノーマルは 30点の 中で（冒険と 同じ buildDeck）、エターナルは ねうちの 高い じゅんに 20まい。
// 統率者の ルールは 統率者の 色で、ほかは いちばん つよい 2色で
function autoCards(pool, rule, ident) {
  const defs = pool.map((id) => BY_ID[id]);
  const inside = (pair) => defs.filter((d) => colorsOf(d).every((c) => pair.includes(c)));
  if (isEternal(rule)) {
    const pairs = ident ? [ident] : COLORS.flatMap((a, i) => COLORS.slice(i + 1).map((b) => [a, b]));
    let best = null;
    for (const pair of pairs) {
      const pick = inside(pair).sort((a, b) => cardValue(b) - cardValue(a)).slice(0, DECK_SIZE);
      const v = pick.reduce((t, d) => t + cardValue(d), 0);
      if (!best || v > best.v) best = { v, pick };
    }
    return (best?.pick || []).map((d) => d.id);
  }
  // 同じ 色・点・ねうちの カードは 入る 数まで に へらす（ぜんぶ 開放だと プールが 大きくて おそい）
  const seen = {};
  const few = defs.filter((d) => { const k = `${colorsOf(d).join('')}|${ptsOf(d)}|${cardValue(d)}|${d.banner || ''}`; seen[k] = (seen[k] || 0) + 1; return seen[k] <= Math.min(DECK_SIZE, Math.floor(CAPACITY / Math.max(1, ptsOf(d)))); });
  return buildDeck(few, ident ? { pair: ident } : {}).deck.filter((d) => !d.basic).map((d) => d.id);
}
// たたかう デッキ：もって いない カードは のぞいて、たりない ぶんは よく つかう 色（なければ 統率者の 色）の きほんカード
function playDeck(deck) {
  const left = {}, ds = [];
  if (deck.cmd) left[deck.cmd] = ownCount(deck.cmd) - 1; // 統率者に 1まい
  for (const id of deck.cards) { if (!(id in left)) left[id] = useCount(deck.rule, id); if (left[id]-- > 0 && BY_ID[id]) ds.push(BY_ID[id]); }
  const cols = [...new Set(ds.flatMap(colorsOf))];
  const cnt = Object.fromEntries(cols.map((c) => [c, ds.filter((d) => colorsOf(d).includes(c)).length]));
  const order = cols.length ? [...cols].sort((a, b) => cnt[b] - cnt[a]) : identOf(deck)?.length ? identOf(deck) : ['C'];
  for (let k = 0; ds.length < DECK_SIZE; k++) ds.push(BASICS[order[k % order.length]]);
  return ds;
}

// ---- れんしゅう：くんだ デッキで とうの てきと 1回 たたかう（パックけん・トロフィー・ずかんの きろくは なし） ----
function practice() {
  const list = decks().filter((d) => d.cards.length || d.cmd);
  if (!list.find((d) => d.id === P.deck)) P.deck = list[0]?.id || null;
  const slots = PLANES.find(([k]) => k === P.plane)[2];
  app().innerHTML = `<main class="zukan construct">
    <h2>れんしゅう</h2>
    <p class="zk-note">${ruby('くんだ デッキで とうの てきと 1回 たたかう。パックけん・トロフィー・ずかんの きろくは ふえない。統率者（とうそつしゃ）の デッキは、3階から 上の てきが ＋1/＋1（ぼうけんと 同じ）。')}</p>
    ${list.length ? `<h3 class="zk-h">デッキ</h3>
    <div class="zk-sets">${list.map((d) => `<button type="button" class="chip ${d.id === P.deck ? 'on' : ''}" data-pdeck="${esc(d.id)}">${ruby(deckName(d))}</button>`).join('')}</div>
    <h3 class="zk-h">せかい</h3>
    <div class="zk-sets">${PLANES.map(([k, l]) => `<button type="button" class="chip ${k === P.plane ? 'on' : ''}" data-plane="${k}">${l}</button>`).join('')}</div>
    <h3 class="zk-h">むずかしさ</h3>
    <div class="zk-sets">${DIFFS.map(([k, l]) => `<button type="button" class="chip ${k === P.diff ? 'on' : ''}" data-diff="${k}">${l}</button>`).join('')}</div>
    <h3 class="zk-h">てき</h3>
    <ul class="cs-floors">${slots.map((ids) => ids.map((f) => `<li><button type="button" class="btn" data-floor="${f}"><span>${ruby(FLOOR_NAMES[f] || f)}</span></button></li>`).join('')).join('')}</ul>`
    : '<p class="zk-note">さきに デッキを くもう（カードを 1まい いじょう 入れた デッキ）。</p>'}
    <button type="button" class="btn ghost" data-back="1">もどる</button>
  </main>`;
  app().onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.back) return menu();
    if (b.dataset.pdeck) { P.deck = b.dataset.pdeck; return practice(); }
    if (b.dataset.plane) { P.plane = b.dataset.plane; return practice(); }
    if (b.dataset.diff) { P.diff = b.dataset.diff; return practice(); }
    if (b.dataset.floor) return fight(decks().find((d) => d.id === P.deck), b.dataset.floor, slots.findIndex((ids) => ids.includes(b.dataset.floor)));
  };
}
async function fight(deck, f, floorIdx) {
  if (!deck) return practice();
  const cmd = deck.cmd && ownCount(deck.cmd) > 0 ? BY_ID[deck.cmd] : null;
  if (deck.cmd && !cmd) { await say(`<p>${ruby('統率者（とうそつしゃ）の カードを もって いない。デッキを なおそう。')}</p>`, 'れんしゅう'); return practice(); }
  const buff = cmd && floorIdx >= CMD_BUFF_FROM ? 1 : 0;
  startBattle({
    deck: playDeck(deck), floorId: f, diff: P.diff, floorName: FLOOR_NAMES[f] || f, cmd, buff,
    extraNote: buff ? '統率者（とうそつしゃ）が いるので、てきも 本気（ほんき）！ てきの クリーチャーは ＋1/＋1' : '',
    quit: { label: 'れんしゅうを やめる', note: 'れんしゅうを やめて もどる？', go: practice },
    onEnd: async (r) => {
      await sheet(`<p>${r.win ? 'かった！' : 'まけてしまった。デッキを なおして また ためそう。'}</p><p class="zk-note">${ruby(deckName(deck))}・${ruby(FLOOR_NAMES[f] || f)}</p>`,
        [{ label: 'もどる', value: 1, kind: 'primary' }], { title: r.win ? 'れんしゅう：かち' : 'れんしゅう：まけ', dismiss: false });
      practice();
    },
  });
}

// ---- もって いる カード：ならべかえ・しぼりこみ（デッキ構築と 同じ「こまかく」。弾でも しぼれる）、まい数つき ----
function cardList() {
  const F = loadFilter(FILTER_KEY);
  const ids = [...new Set(ownPool())]; // てに いれた じゅん
  const items = ids.map((id, i) => ({ i, d: BY_ID[id], inDeck: false, no: '' }));
  const tiles = (list) => (list.length ? list.map((i) => `<button type="button" class="zk-card" data-id="${esc(ids[i])}">${cardFace(BY_ID[ids[i]])}<span class="cs-n">×${ownCount(ids[i])}</span></button>`).join('') : '<p class="pool-empty">あてはまる カードが ない。しぼりこみを へらそう。</p>');
  const draw = () => {
    const shown = applyFilter(F, items);
    app().innerHTML = `<main class="zukan construct">
      <h2>もって いる カード</h2>
      <p class="zk-total"><b>${ids.length}</b>しゅるい・${ids.reduce((t, id) => t + ownCount(id), 0)}まい</p>
      ${ids.length ? `<div class="tapmode"><button type="button" class="fine" data-fine="1" aria-pressed="${F.open}" aria-expanded="${F.open}">こまかく（ならべかえ・しぼりこみ）${filterCount(F) ? `<b>${filterCount(F)}</b>` : ''}</button></div>
      ${filterPanel(F, items.map((x) => x.d), shown.length, ids.length, 'しゅるい', { noDeck: true })}
      <div class="zk-grid cs-grid">${tiles(shown)}</div>`
    : '<p class="zk-note">まだ カードが ない。ショップで パックを あけよう。</p>'}
      <button type="button" class="btn ghost" data-back="1">もどる</button>
    </main>`;
  };
  draw();
  // なまえ・テキストで さがす：入力ちゅうは カードの ならびだけ かきかえる（入力欄が きえない ように）
  app().oninput = (e) => {
    if (!onFilterInput(F, e.target)) return;
    const shown = applyFilter(F, items);
    app().querySelector('.cs-grid').innerHTML = tiles(shown);
    const sum = app().querySelector('.fsum span'); if (sum) sum.textContent = `${shown.length} / ${ids.length}しゅるい を 見せて いる`;
  };
  app().onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.back) { app().oninput = null; return menu(); }
    if (b.dataset.fine) { F.open = !F.open; saveFilter(F); return draw(); }
    if (onFilterClick(F, b)) return draw();
    if (b.dataset.id) {
      const n = realCount(b.dataset.id);
      await sheet(`${detail(BY_ID[b.dataset.id])}<p class="zk-note">もって いる ${openAll() ? `${MAX_COPY}まい（ぜんぶ 開放ちゅう。ほんとうは ${n}まい）` : `${n}まい`}・デッキに 入れられるのは ${MAX_COPY}まいまで</p>`, [{ label: 'とじる', value: 0 }]);
    }
  };
}
