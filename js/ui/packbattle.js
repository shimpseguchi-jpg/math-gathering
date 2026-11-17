// パック＆バトル（2026-11-17。docs/PACKBATTLE.md）：もんだい → ショップ → デッキ → バトル を ぐるぐる まわす モード
// ① もんだい（しゅぎょうと おなじ 問題）で ポイントを ためる ② ショップで ポイントを つかって パックを あける
// ③ もって いる カードで デッキを くむ（こうちくモードの ノーマルと おなじ きまり）④ てきを 1体ずつ たおして いく（かつと ポイント）
// はじめに「きそデッキ」を 1つ もらう。デッキは いくつも のこせて、カードは デッキの あいだで わけあえない（ほんものの カードと おなじ）。
// バトルには「つかう デッキ」で 出る。この モードの 画面は ドット（GBA ふう）の みためが きまり（タイトルに もどると せっていの みために もどる）
// ぼうけん（mtg-adventure-v1）・こうちく（mtg-collection）・次元渡りとは べつの セーブ。カード・ポイントは ここだけの もの
import { BY_ID, BASICS } from '../data/cards.js';
import { CATS, QUIZ_SECONDS } from '../data/quiz.js';
import { kihonFloor } from '../data/kihon.js';
import { PB, PB_NAME, PB_PACKS, PB_TIERS, PB_TOTAL, PB_STARTER, quizGain, battleGain, stageAt, deckProblems } from '../data/packbattle.js';
import { colorsOf } from '../engine/game.js';
import { ptsOf } from '../engine/ai.js';
import { openPack, DECK_SIZE, CAPACITY } from '../engine/run.js';
import { startBattle } from './battle.js';
import { gacha } from './gacha.js';
import { deckBuilder, FLOOR_NAMES } from './app.js';
import { autoCards } from './construct.js';
import { MAX_COPY } from './collection.js';
import { studyScreen } from './study.js';
import { onPack } from './trophies.js';
import { zukanPack } from './zukan.js';
import { applyTheme } from './settings.js';
import { sheet, esc, ruby, COLOR_NAME } from './view.js';

const KEY = 'mtg-packbattle-v1';
const FILTER_KEY = 'mtg-build-filter-pb'; // デッキの「こまかく」（ぼうけん・こうちくとは べつに のこす）
// { pts：ポイント, cards：{ id: もって いる まい数 }, decks：[{ id, name, cards: [id…] }], active：つかう デッキの id, wins：たおした てきの 数, seed：てきを きめる 数,
//   quiz：{ n：といた 数, ok：せいかい, sessions }, cats：もんだいの しゅるい, opened：あけた パック, earned：ためた ポイントの 合計, lost：さいごの たたかいで まけた,
//   starter：きそデッキを もらった, fresh：デッキに まだ 入れて いない あたらしい カードが ある, dot：0 なら せっていの みための まま }
const count = (ids) => ids.reduce((m, id) => { m[id] = (m[id] || 0) + 1; return m; }, {});
const starterDeck = () => ({ id: 'd0', name: PB_STARTER.name, cards: [...PB_STARTER.cards] });
const fresh = () => ({ v: 2, pts: PB.start, cards: count(PB_STARTER.cards), decks: [starterDeck()], active: 'd0', wins: 0, seed: Math.floor(Math.random() * 1e9), quiz: { n: 0, ok: 0, sessions: 0 }, cats: null, opened: 0, earned: 0, lost: 0, starter: 1, fresh: 0, dot: 1 });
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && v.cards) {
      const s = { ...fresh(), ...v, quiz: { ...fresh().quiz, ...v.quiz } };
      // まえの 形（デッキが 1つ・きそデッキ なし）：デッキを うつして、きそデッキと その カードを たす
      if (!Array.isArray(v.decks)) { s.decks = v.deck?.length ? [{ id: 'd1', name: 'デッキ 1', cards: v.deck }] : []; s.active = s.decks[0]?.id || null; }
      delete s.deck;
      if (!v.starter) {
        s.cards = { ...v.cards }; for (const id of PB_STARTER.cards) s.cards[id] = (s.cards[id] || 0) + 1;
        s.decks = [starterDeck(), ...s.decks]; s.active = s.active || 'd0'; s.starter = 1;
      }
      s.v = 2;
      return s;
    }
  } catch { /* こわれていたら はじめから */ }
  return fresh();
}
let S = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 保存できなくても あそべる */ } };

let APP = null, BACK = null;
const app = () => APP();

// ---- みため：この モードは ドット（GBA ふう）が きまり。せっていの みためは かえない（タイトルに もどる ときに もどす） ----
// pb-on：この モードの あいだだけ（もんだいの 画面も ドットの わく・ボタンに する。css の :root.pb-on[data-theme="gba"]）
const look = () => { const r = document.documentElement; r.classList.add('pb-on'); if (S.dot !== 0) r.dataset.theme = 'gba'; else applyTheme(); };
const leave = () => { document.documentElement.classList.remove('pb-on'); applyTheme(); BACK(); };
// ドットの 絵（9×9 の ます）：X の ところを ぬる
const pix = (rows) => `<svg class="pb-ico" viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true">${rows.flatMap((r, y) => [...r].map((c, x) => (c === 'X' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ''))).join('')}</svg>`;
const ICON = {
  quiz: pix(['..XXXXX..', '.XX...XX.', '.XX...XX.', '.....XX..', '....XX...', '...XX....', '...XX....', '.........', '...XX....']),
  shop: pix(['.XXXXXXX.', '.X.X.X.X.', '.XXXXXXX.', '.X.....X.', '.X..X..X.', '.X.XXX.X.', '.X..X..X.', '.X.....X.', '.XXXXXXX.']),
  deck: pix(['..XXXXXX.', '..X....X.', 'XXXXXX.X.', 'X....X.X.', 'X....X.X.', 'X....XXX.', 'X....X...', 'X....X...', 'XXXXXX...']),
  battle: pix(['.......XX', '......XXX', '.....XXX.', '....XXX..', 'X..XXX...', '.XXXX....', '..XX.....', '.XXXX....', 'XX..X....']),
};

// ---- もちもの：カードは デッキの あいだで わけあえない ----
const own = (id) => S.cards[id] || 0; // もって いる まい数（在庫）
const kinds = () => Object.keys(S.cards).filter((id) => BY_ID[id] && S.cards[id] > 0);
const totalCards = () => kinds().reduce((t, id) => t + S.cards[id], 0);
const usedOther = (deck, id) => S.decks.reduce((t, d) => t + (d === deck ? 0 : d.cards.filter((x) => x === id).length), 0); // ほかの デッキで つかって いる まい数
const availFor = (deck, id) => Math.min(MAX_COPY, Math.max(0, own(id) - usedOther(deck, id))); // この デッキに 入れられる まい数（同じ カードは 4まいまで）
// デッキを くむ ときの カードの ならび（てに いれた じゅん。入れられる まい数 だけ）。
// ほかの デッキで つかって いる カードは、おわりに「入れられない 1まい」（phantom）を 足して、わけを 見せる（app.js の deckBuilder）
function poolFor(deck) {
  const pool = kinds().flatMap((id) => Array(availFor(deck, id)).fill(id));
  const real = pool.length, phantom = new Set();
  for (const id of kinds()) if (usedOther(deck, id) > 0) { phantom.add(pool.length); pool.push(id); }
  return { pool, real, phantom };
}
const activeDeck = () => S.decks.find((d) => d.id === S.active) || null;
// デッキの ようす（つかえる カード だけ かぞえる）
function deckInfo(deck = activeDeck()) {
  const left = {}, ds = []; let missing = 0;
  for (const id of deck?.cards || []) { if (!(id in left)) left[id] = availFor(deck, id); if (left[id]-- > 0 && BY_ID[id]) ds.push(BY_ID[id]); else missing++; }
  const cols = [...new Set(ds.flatMap(colorsOf))];
  const st = { ds, cols, count: ds.length, points: ds.reduce((t, d) => t + ptsOf(d), 0), colors: cols.length, missing };
  return { ...st, problems: deck ? deckProblems(st, { size: DECK_SIZE, cap: CAPACITY }) : ['つかう デッキが ない。「デッキ」で デッキを えらぼう'] };
}
const deckOk = (d) => !deckInfo(d).problems.length;
const deckLine = (D) => `${D.cols.map((c) => COLOR_NAME[c]).join('・') || 'むしょく'}　${D.count}まい ＋ きほん ${DECK_SIZE - D.count}まい・${D.points}点`;
// たたかう デッキ：たりない ぶんは よく つかう 色の きほんカード（こうちくモードと おなじ）
function playDeck() {
  const { ds, cols } = deckInfo();
  const deck = [...ds];
  const cnt = Object.fromEntries(cols.map((c) => [c, ds.filter((d) => colorsOf(d).includes(c)).length]));
  const order = cols.length ? [...cols].sort((a, b) => cnt[b] - cnt[a]) : ['C'];
  for (let k = 0; deck.length < DECK_SIZE; k++) deck.push(BASICS[order[k % order.length]]);
  return deck;
}
// つかう デッキが まだの とき：いまの カードで なおせるか（おまかせで きまりの 数に とどくか）
const canBuild = () => { const d = activeDeck(); const { pool, real } = poolFor(d); return real >= PB.minCards && autoCards(pool.slice(0, real), 'normal', null).length >= PB.minCards; };

// タイトルの タイルに 出す ひとこと
export function pbSummary() { S = load(); return `${S.pts}P・てき ${S.wins}たい`; }

// ---- つぎに する こと：はじめては もんだい → ショップ → デッキ → バトル ----
function nextStep() {
  if (!S.quiz.n && !S.opened) return 'quiz'; // はじめて
  const afford = S.pts >= PB.pack;
  if (S.lost) return afford ? 'shop' : 'quiz'; // まけた あと：カードを ふやして つよく する
  if (deckInfo().problems.length) return !activeDeck() || canBuild() || S.decks.some(deckOk) ? 'deck' : afford ? 'shop' : 'quiz';
  if (!S.opened && afford) return 'shop'; // もんだいの つぎは ショップ
  if (S.fresh) return 'deck'; // あたらしい カードを デッキに
  return 'battle';
}
const GUIDE = {
  quiz0: `まずは「もんだい」で ポイントを ためよう。はじめに ${PB.start}P と「${PB_STARTER.name}」を もって いるので、すぐに パックを あけても、バトルに 出ても いいよ。`,
  quiz: 'ポイントが たりない ときは「もんだい」へ。もんだいは なんどでも とけるよ。',
  shop: 'ポイントが たまった！「ショップ」で パックを あけて、カードを ふやそう。',
  deck: 'あたらしい カードが 入った。「デッキ」で たたかう カードを えらぼう。',
  deckFix: '「デッキ」で つかう デッキを なおそう。いまの ままだと バトルに 出られない。',
  battle: 'じゅんびが できた！「バトル」で つぎの てきに いどもう。',
  lostShop: 'まけても だいじょうぶ。「ショップ」で パックを あけて、デッキを つよく しよう。',
  lostQuiz: 'まけても だいじょうぶ。「もんだい」で ポイントを ためて、パックを あけよう。',
};
const guideText = (step) => (step === 'quiz' && !S.quiz.n && !S.opened ? GUIDE.quiz0 : S.lost ? (step === 'shop' ? GUIDE.lostShop : GUIDE.lostQuiz) : step === 'deck' && deckInfo().problems.length ? GUIDE.deckFix : GUIDE[step]);

// ---- てきの なまえ ----
const stageNow = () => stageAt(S.wins, S.seed);
const foeName = (st) => (st.kihon ? st.kihon.name : FLOOR_NAMES[st.floorId] || st.floorId).replace(/^\d階 /, '');
const stageLabel = (st) => `${st.n + 1}たいめ ${foeName(st)}`;
const rewardLine = (st) => `かつと ＋${battleGain(st).base}P${st.boss ? '（ボス）' : ''}。ぴったり 1回ごとに ＋${PB.exact}P（${PB.exactMax}回まで）`;

// ---- ホーム ----
export function pbMenu(appFn, back) {
  APP = appFn || APP; BACK = back || BACK;
  S = load(); save(); // まえの 形の セーブは ここで あたらしい 形に
  home();
}
function home() {
  look();
  const A = activeDeck(), D = deckInfo(), step = nextStep(), st = stageNow();
  const ok = !D.problems.length;
  const row = (go, no, name, sub, em) => `<li><button type="button" class="st-ep ${step === go ? 'next' : ''}" data-go="${go}"><b><i class="pb-num">${no}</i>${ICON[go]}</b><span><i class="st-title">${name}</i><small>${ruby(sub)}</small></span><em>${em}</em></button></li>`;
  app().innerHTML = `<main class="zukan construct pb">
    <p class="eyebrow">もんだいで ためて、パックを あけて、てきを たおそう</p>
    <h2>${PB_NAME}</h2>
    <ul class="pb-stats">
      <li><span>ポイント</span><b id="pb-pts">${S.pts}</b><small>P</small></li>
      <li><span>カード</span><b>${totalCards()}</b><small>まい（${kinds().length}しゅるい）</small></li>
      <li class="${ok ? 'ok' : 'ng'}"><span>つかう デッキ</span><b>${ok ? 'かんせい' : 'まだ'}</b><small>${A ? `${esc(A.name)}${D.count ? `・${D.count}まい` : ''}` : 'デッキを えらぼう'}</small></li>
      <li><span>たおした てき</span><b>${S.wins}</b><small>たい</small></li>
    </ul>
    <p class="pb-guide">${esc(guideText(step))}</p>
    <ol class="pb-steps">
      ${row('quiz', 1, 'もんだい', `1もん せいかいで ＋${PB.quiz}P。${PB.streakEvery}もん れんぞくで ボーナス ＋${PB.streakBonus}P`, 'ポイントを ためる')}
      ${row('shop', 2, 'ショップ', `パック 1つ ${PB.pack}P（カード 8まい）`, S.pts >= PB.pack ? `${Math.floor(S.pts / PB.pack)}つ あけられる` : `あと ${PB.pack - S.pts}P`)}
      ${row('deck', 3, 'デッキ', ok ? `${A.name}：${deckLine(D)}` : D.problems[0], `ぜんぶで ${S.decks.length}こ`)}
      ${row('battle', 4, 'バトル', `つぎの てき：${stageLabel(st)}　${st.tierName}`, ok ? 'いどめる' : 'デッキが まだ')}
    </ol>
    <p class="zk-note">ポイントが なくなっても、もんだいを とけば いつでも ためなおせる。たたかいに まけても、ポイントと カードは なくならない。</p>
    <p class="zk-note"><button type="button" class="fine" data-look="1">みため：${S.dot !== 0 ? 'ドット（この モードの きまり）' : 'せっていの みための まま'}　タップで かえる</button></p>
    <button type="button" class="btn ghost" data-back="1">タイトルへ もどる</button>
  </main>`;
  app().onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.back) return leave();
    if (b.dataset.look) { S.dot = S.dot !== 0 ? 0 : 1; save(); return home(); }
    if (b.dataset.go === 'quiz') return quiz();
    if (b.dataset.go === 'shop') return shop();
    if (b.dataset.go === 'deck') return deckList();
    if (b.dataset.go === 'battle') return arena();
  };
}

// ---- ① もんだい：しゅぎょうと おなじ 問題。せいかいの たびに ポイントが ふえて、すぐ のこる ----
function quiz() {
  let streak = 0, gain = 0, bonus = 0;
  studyScreen(APP, {
    cats: S.cats?.length ? S.cats.filter((c) => CATS[c]) : Object.keys(CATS), setCats: (c) => { S.cats = c; save(); },
    eyebrow: `${PB_NAME}　もんだい`,
    title: `${QUIZ_SECONDS}びょう もんだい`,
    lead: `${QUIZ_SECONDS}びょうで できるだけ たくさん とこう。<b>1もん せいかいで ＋${PB.quiz}P</b>。${PB.streakEvery}もん れんぞくで せいかいする たびに ボーナス ＋${PB.streakBonus}P。まちがえても ポイントは へらない。`,
    onAnswer: (right) => {
      streak = right ? streak + 1 : 0;
      const g = quizGain(right, streak);
      S.quiz.n++; if (right) S.quiz.ok++;
      S.pts += g; S.earned += g; gain += g; if (g > PB.quiz) bonus += g - PB.quiz;
      save();
      return !right ? '' : g > PB.quiz ? `${streak}もん れんぞく！ ＋${g}P` : `＋${g}P`;
    },
    record: (r) => {
      S.quiz.sessions++; save();
      const g = gain;
      r.gainNote = `いま ${S.pts}P${bonus ? `（れんぞく ボーナス ＋${bonus}P こみ）` : ''}`;
      streak = 0; gain = 0; bonus = 0; // 「もう いちど」は はじめから かぞえる
      return g;
    },
    gainLabel: 'ポイント', gainUnit: 'P', noPass: true, quitNote: 'やめても、ここまでの ポイントは もらえる。',
    back: home, backLabel: 'ホームへ', doneLabel: 'ホームへ',
  });
}

// ---- ② ショップ：ポイントで パックを あける。4まい もって いる カードは 出ない（こうちくモードと おなじ） ----
const packCards = (p) => p.ids.filter((id) => BY_ID[id]);
function shop() {
  const afford = S.pts >= PB.pack;
  const rows = PB_PACKS.map((p) => {
    const list = packCards(p);
    const have = list.filter((id) => (S.cards[id] || 0) > 0).length;
    const full = list.filter((id) => (S.cards[id] || 0) >= MAX_COPY).length;
    const done = full === list.length;
    return `<li class="cs-set ${done ? 'done' : ''}">
      <span class="cs-set-name"><b>${ruby(p.name)}</b>
        <small>${p.note ? `${ruby(p.note)}・` : ''}もって いる ${have} / ${list.length}しゅるい</small></span>
      <button type="button" class="btn ${done ? '' : 'primary'}" data-buy="${p.id}" ${done || !afford ? 'disabled' : ''}>${done ? 'コンプリート！' : 'あける'}<small>${done ? 'ぜんぶ 4まい' : `${PB.pack}P`}</small></button>
    </li>`;
  }).join('');
  app().innerHTML = `<main class="zukan construct pb">
    <p class="eyebrow">${PB_NAME}</p>
    <h2>ショップ</h2>
    <p class="zk-total">ポイント <b>${S.pts}</b>P</p>
    <p class="zk-note">${ruby(`パック 1つ ${PB.pack}P。カードが 8まい 入って いる。中の カードは あけるまで わからない。同じ カードは ${MAX_COPY}まいまで（${MAX_COPY}まい もって いる カードは もう 出ない）。`)}</p>
    ${afford ? '' : `<div class="pb-need"><p>ポイントが あと <b>${PB.pack - S.pts}P</b> たりない。もんだいを といて ためよう。</p><button type="button" class="btn primary" data-go="quiz">もんだいへ<small>1もん せいかいで ＋${PB.quiz}P</small></button></div>`}
    <ul class="cs-sets">${rows}</ul>
    <button type="button" class="btn ghost" data-back="1">ホームへ</button>
  </main>`;
  app().onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.back) return home();
    if (b.dataset.go === 'quiz') return quiz();
    if (b.dataset.buy) return buy(PB_PACKS.find((p) => p.id === b.dataset.buy));
  };
}
async function buy(p) {
  if (!p || S.pts < PB.pack) return shop();
  const ok = await sheet(`<p>${ruby(`${p.name}を あける？`)}</p><p class="cs-math">${S.pts}P − ${PB.pack}P ＝ <b>${S.pts - PB.pack}</b>P</p>`,
    [{ label: 'あける', value: 1, kind: 'primary' }, { label: 'やめる', value: 0 }], { title: 'ショップ' });
  if (!ok) return shop();
  const before = { ...S.cards };
  const cards = openPack(Math.random, { ids: packCards(p), have: before, max: MAX_COPY });
  if (!cards.length) return shop(); // コンプリート（ボタンは おせないので ここには こない）
  // さきに のこす（とちゅうで とじても ポイントだけ へって カードが ない、に ならない）
  S.pts -= PB.pack; S.opened++; S.lost = 0; S.fresh = 1;
  for (const d of cards) S.cards[d.id] = (S.cards[d.id] || 0) + 1;
  save();
  zukanPack(cards);
  gacha(APP, cards, {
    eyebrow: `${PB_NAME}　${ruby(p.name)}`, owned: new Set(Object.keys(before)), doneLabel: 'ショップへ',
    bonus: `<div class="bonus"><p class="bonus-title">${ruby(p.name)}</p><span>のこり ${S.pts}P</span></div>`,
    done: () => { onPack(cards); shop(); }, // トロフィー（めくりおわってから）
  });
}

// ---- ③ デッキ：いくつも のこせる。カードは デッキの あいだで わけあえない。バトルには「つかう デッキ」で 出る ----
// きまりは こうちくモードの ノーマルと おなじ（20まい・30点・2色まで・同じ カードは 4まいまで）
const needList = (problems) => `<ul class="pb-list">${problems.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
const pips = (cols) => cols.map((c) => `<i class="pip m-${c}">${COLOR_NAME[c]}</i>`).join('') || '<i class="pip">むしょく</i>';
function deckList() {
  S.fresh = 0; save();
  const full = S.decks.length >= PB.deckMax;
  const rows = S.decks.map((d) => {
    const D = deckInfo(d), on = d.id === S.active;
    return `<li><button type="button" class="cs-deck ${on ? 'on' : ''}" data-deck="${esc(d.id)}">
      ${on ? '<span class="cs-rule pb-use">つかう デッキ</span>' : ''}<b>${esc(d.name)}</b>
      <span class="cs-meta">${pips(D.cols)}<small>${D.count}まい ＋ きほん ${DECK_SIZE - D.count}まい・${D.points}点</small>${D.problems.length ? `<em>バトルに 出られない：${esc(D.problems[0])}</em>` : ''}</span>
    </button></li>`;
  }).join('');
  app().innerHTML = `<main class="zukan construct pb">
    <p class="eyebrow">${PB_NAME}</p>
    <h2>デッキ</h2>
    <p class="zk-note">カードは デッキの あいだで わけあえない。1つの デッキに 入れた カードは、ほかの デッキでは のこりの まい数しか つかえない（4まい もって いて、デッキに 3まい 入れたら、ほかの デッキには あと 1まい）。バトルには「つかう デッキ」で 出る。</p>
    ${S.decks.length ? `<ul class="cs-decks">${rows}</ul>` : '<p class="zk-note">デッキが 1つも ない。あたらしく つくろう。</p>'}
    ${activeDeck() && !deckInfo().problems.length ? '' : `<div class="pb-need"><p><b>バトルに 出られない</b>：${activeDeck() ? 'つかう デッキが まだ できて いない。' : 'つかう デッキが ない。'}</p>${activeDeck() ? needList(deckInfo().problems) : ''}</div>`}
    <div class="row-btns"><button type="button" class="btn" data-new="1" ${full ? 'disabled' : ''}>あたらしい デッキを つくる<small>${full ? `デッキは ${PB.deckMax}こまで` : `${S.decks.length} / ${PB.deckMax}こ`}</small></button></div>
    <button type="button" class="btn ghost" data-back="1">ホームへ</button>
  </main>`;
  app().onclick = async (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.back) return home();
    if (b.dataset.new) return newDeck();
    const d = S.decks.find((x) => x.id === b.dataset.deck); if (!d) return;
    const D = deckInfo(d), on = d.id === S.active;
    const v = await sheet(`<p><b>${esc(d.name)}</b>${on ? '（つかう デッキ）' : ''}</p><p>${deckLine(D)}</p>${D.problems.length ? `<p class="zk-note">この デッキでは まだ バトルに 出られない。</p>${needList(D.problems)}` : ''}`,
      [...(on ? [] : [{ label: 'この デッキを つかう', value: 'use', kind: 'primary' }]), { label: 'なおす', value: 'edit', kind: on ? 'primary' : '' }, { label: 'けす（カードは もちものに もどる）', value: 'del' }, { label: 'とじる', value: null }], { title: 'デッキ' });
    if (v === 'use') { S.active = d.id; save(); }
    if (v === 'edit') return build(d);
    if (v === 'del') return dropDeck(d);
    return deckList();
  };
}
// けす：カードは なくならない（もちものに もどって、ほかの デッキに 入れられる）。つかう デッキを けす ときは、バトルに 出られるかを つたえる
async function dropDeck(d) {
  const on = d.id === S.active;
  const next = on ? S.decks.find((x) => x !== d && deckOk(x)) || null : null;
  const warn = !on ? '' : next
    ? `<p class="what">いま つかって いる デッキ。けすと、「${esc(next.name)}」が つかう デッキに なる。</p>`
    : '<div class="pb-need"><p><b>いま つかって いる デッキ。</b>ほかに かんせいした デッキが ないので、けすと <b>バトルに 出られなく なる</b>（あたらしく デッキを つくれば また 出られる）。</p></div>';
  const sure = await sheet(`<p>「${esc(d.name)}」を けす？</p><p class="zk-note">入れて いた カード ${d.cards.length}まいは もちものに もどる（なくならない）。</p>${warn}`,
    [{ label: 'けす', value: 1 }, { label: 'やめる', value: 0, kind: 'primary' }], { title: 'デッキを けす' });
  if (sure) {
    S.decks = S.decks.filter((x) => x !== d);
    if (on) S.active = (next || S.decks[0])?.id || null;
    save();
  }
  return deckList();
}
async function newDeck() {
  if (S.decks.length >= PB.deckMax) return deckList();
  const n = Math.max(0, ...S.decks.map((d) => +(/^デッキ (\d+)$/.exec(d.name)?.[1] || 0))) + 1;
  const deck = { id: `d${Date.now().toString(36)}`, name: `デッキ ${Math.max(n, 2)}`, cards: null };
  if (!poolFor(deck).real) {
    const v = await sheet(`<p>つかえる カードが のこって いない。もって いる カードは、ぜんぶ ほかの デッキに 入って いる。</p><p class="zk-note">ショップで パックを あけるか、ほかの デッキから カードを はずそう。</p>`,
      [S.pts >= PB.pack ? { label: 'ショップへ', value: 'shop', kind: 'primary' } : { label: 'もんだいへ', value: 'quiz', kind: 'primary' }, { label: 'とじる', value: 0 }], { title: 'あたらしい デッキ' });
    return v === 'shop' ? shop() : v === 'quiz' ? quiz() : deckList();
  }
  S.decks.push(deck);
  return build(deck);
}
// くむ：ぼうけん・こうちくと おなじ 画面。カードの 下に「もち（もって いる）・ほか（ほかの デッキで つかって いる）・あと（入れられる）」
function build(deck) {
  const { pool, real, phantom } = poolFor(deck);
  const idx = (ids) => { const used = new Set(); return ids.map((id) => pool.findIndex((x, k) => k < real && x === id && !used.has(k) && used.add(k))).filter((k) => k >= 0); };
  const C = {
    pool, phantom, stock: (id) => ({ own: own(id), other: usedOther(deck, id) }),
    deck: deck.cards ? idx(deck.cards) : null, stack: true, filterKey: FILTER_KEY,
    title: `${PB_NAME}：${deck.name}`,
    auto: () => idx(autoCards(pool.slice(0, real), 'normal', null)), // おまかせ：のこって いる カードで いちばん つよい 2色
    save: () => { deck.cards = C.deck.map((k) => pool[k]); save(); },
    ok: async () => {
      const D = deckInfo(deck);
      if (!D.problems.length) { if (!activeDeck() || !deckOk(activeDeck())) { S.active = deck.id; save(); } return deckList(); }
      const v = await sheet(`<p>「${esc(deck.name)}」では まだ バトルに 出られない。</p>${needList(D.problems)}<p class="zk-note">カードが たりない ときは、ショップで パックを あけるか、ほかの デッキから カードを はずそう。</p>`,
        [{ label: 'デッキを なおす', value: 'deck', kind: 'primary' }, { label: 'デッキの いちらんへ', value: 0 }], { title: 'デッキ：まだ' });
      return v === 'deck' ? build(deck) : deckList();
    },
    back: { label: 'いちらんへ', go: deckList },
  };
  deckBuilder(C);
}

// ---- ④ バトル：てきを 1体ずつ じゅんばんに たおす。すすむほど つよい ----
function arena() {
  const st = stageNow(), D = deckInfo(), ok = !D.problems.length;
  const tierRow = (t, i) => {
    const state = st.lap || i < st.tier ? 'done' : i === st.tier ? 'open' : 'lock';
    const k = state === 'done' ? t.n : state === 'open' ? st.i : 0;
    return `<li><div class="st-ep ${state}"><b>${i + 1}</b><span><i class="st-title">${ruby(t.name)}</i><small>${'●'.repeat(k)}${'○'.repeat(t.n - k)}</small></span><em>${state === 'done' ? 'クリア' : state === 'open' ? 'いま ここ' : 'まだ'}</em></div></li>`;
  };
  app().innerHTML = `<main class="zukan construct pb">
    <p class="eyebrow">${PB_NAME}　たおした てき ${S.wins}たい</p>
    <h2>バトル</h2>
    <section class="st-ch">
      <h3>つぎの てき</h3>
      <p class="pb-foe"><b>${st.n + 1}たいめ</b><span>${ruby(foeName(st))}</span><small>${ruby(st.tierName)}　${st.i + 1} / ${st.of}${st.boss ? '・ボス' : ''}${st.buff ? ruby(`・${st.lap}しゅうめ（てきの クリーチャーは ＋${st.buff}/＋${st.buff}）`) : ''}</small></p>
      <p class="zk-note">${rewardLine(st)}。まけても ポイントと カードは なくならない。</p>
    </section>
    ${ok ? `<p class="deckline">つかう デッキ：${esc(activeDeck().name)}　${deckLine(D)}</p>`
    : `<div class="pb-need"><p><b>つかう デッキが まだ できて いない</b>ので、バトルに 出られない。</p>${needList(D.problems)}</div>`}
    <div class="row-btns"><button type="button" class="btn primary" data-go="fight" ${ok ? '' : 'disabled'}>たたかう</button><button type="button" class="btn" data-go="deck">${ok ? 'デッキを かえる' : 'デッキを なおす'}</button></div>
    <section class="st-ch">
      <h3>てきの じゅんばん<small class="st-guide">ぜんぶで ${PB_TOTAL}たい。すすむほど つよく なる</small></h3>
      <ol>${PB_TIERS.map(tierRow).join('')}${st.lap ? `<li><div class="st-ep open"><b>∞</b><span><i class="st-title">むげんの たたかい</i><small>${ruby(`${st.lap}しゅうめ：てきの クリーチャーは ＋${st.buff}/＋${st.buff}`)}</small></span><em>いま ここ</em></div></li>` : ''}</ol>
    </section>
    <button type="button" class="btn ghost" data-back="1">ホームへ</button>
  </main>`;
  app().onclick = (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.back) return home();
    if (b.dataset.go === 'deck') return deckList();
    if (b.dataset.go === 'fight') return fight(st);
  };
}
function fight(st) {
  if (deckInfo().problems.length) return arena();
  startBattle({
    deck: playDeck(), ...(st.kihon ? { floor: kihonFloor(st.kihon) } : { floorId: st.floorId }), diff: st.diff, floorName: stageLabel(st), buff: st.buff,
    extraNote: st.buff ? `${st.lap}しゅうめ：てきの クリーチャーは ＋${st.buff}/＋${st.buff}` : '',
    quit: { label: 'ホームへ もどる', note: 'たたかいを やめて もどる？ ポイントと カードは そのまま。この てきには また いどめるよ。', go: home },
    onEnd: async (r) => {
      S = load();
      if (!r.win) {
        S.lost = 1; save();
        await sheet(`<p>まけて しまった。でも、ポイントと カードは そのまま。</p><p class="zk-note">${S.pts >= PB.pack ? 'ショップで パックを あけて、デッキを つよく しよう。' : 'もんだいで ポイントを ためて、パックを あけよう。'}</p>`,
          [{ label: 'ホームへ', value: 1, kind: 'primary' }], { title: r.draw ? 'ひきわけ' : 'まけて しまった', dismiss: false });
        return home();
      }
      // かち：さきに のこす（まどを とじる まえに ブラウザを とじても なくならない）
      const g = battleGain(st, r.exact), before = S.pts;
      S.wins = Math.max(S.wins, st.n + 1); S.pts += g.total; S.earned += g.total; S.lost = 0; save();
      const all = st.n + 1 === PB_TOTAL;
      const v = await sheet(`<p><b>${ruby(stageLabel(st))}</b>を たおした！</p>
        <p class="what">${st.boss ? 'ボスを たおした' : 'かった'} ＋${g.base}P${g.exact ? `　ぴったり ${Math.min(PB.exactMax, r.exact)}回 ＋${g.exact}P` : ''}</p>
        <p class="cs-math">${before}P ＋ ${g.total}P ＝ <b>${S.pts}</b>P</p>
        ${st.boss && !st.lap ? `<p class="what">${ruby(all ? `${PB_TOTAL}たい ぜんぶ たおした！ ここからは「むげんの たたかい」。てきは 1しゅう ごとに つよく なる。` : `「${st.tierName}」を クリア！ つぎは「${stageNow().tierName}」。`)}</p>` : ''}`,
        [{ label: 'つぎの てきへ', value: 'next', kind: 'primary' }, { label: 'ホームへ', value: 0 }], { title: 'かった！', dismiss: false });
      return v === 'next' ? arena() : home();
    },
  });
}
