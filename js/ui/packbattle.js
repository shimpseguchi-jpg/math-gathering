// パック＆バトル（2026-11-17。docs/PACKBATTLE.md）：もんだい → ショップ → デッキ → バトル を ぐるぐる まわす モード
// ① もんだい（しゅぎょうと おなじ 問題）で ポイントを ためる ② ショップで ポイントを つかって パックを あける
// ③ もって いる カードで デッキを くむ（こうちくモードの ノーマルと おなじ きまり）④ てきを 1体ずつ たおして いく（かつと ポイント）
// はじめに「きそデッキ」を 1つ もらう。デッキは いくつも のこせて、カードは デッキの あいだで わけあえない（ほんものの カードと おなじ）。
// バトルには「つかう デッキ」で 出る。この モードの 画面は ドット（GBA ふう）の みためが きまり（タイトルに もどると せっていの みために もどる）
// ぼうけん（mtg-adventure-v1）・こうちく（mtg-collection）・次元渡りとは べつの セーブ。カード・ポイントは ここだけの もの
import { BY_ID, BASICS } from '../data/cards.js';
import { CATS, QUIZ_SECONDS } from '../data/quiz.js';
import {
  PB, PB_NAME, PB_STAGES, PB_STARTER, PB_TREE, quizGain, battleGain, deckProblems,
  foesOf, foeFloor, towerFloor, guildFloor, topStage, endlessAt, PB_SIG, PB_PAL, SIG_COPIES, PB_MAIN, ghostDeck, antePick, capOf, deckMaxOf, packsFor, migrateProgress,
} from '../data/packbattle.js';
import { HARD_TIERS, hardSession } from '../data/quiz2.js';
import { PB_FACES } from '../data/pbfaces.js';
import { colorsOf } from '../engine/game.js';
import { ptsOf } from '../engine/ai.js';
import { openPack, DECK_SIZE } from '../engine/run.js';
import { startBattle } from './battle.js';
import { gacha } from './gacha.js';
import { deckBuilder, FLOOR_NAMES } from './app.js';
import { autoCards } from './construct.js';
import { MAX_COPY } from './collection.js';
import { studyScreen } from './study.js';
import { zukanPack } from './zukan.js';
import { applyTheme } from './settings.js';
import { isSolo } from './solo.js';
import { soundOn, setSound } from './sfx.js';
import { nextStep as titleStep, unlockSheet, NEWS_TEXT } from './unlock.js';
import { sheet, esc, ruby, info, fullCard, toast, COLOR_NAME } from './view.js';

// 単体版（パック＆バトル だけの ゲーム）は べつの セーブ（本編の パック＆バトルと まざらない）。セーブの 中にも solo の しるし
const SOLO = isSolo();
const KEY = SOLO ? 'mtg-packbattle-solo-v1' : 'mtg-packbattle-v1';
const FILTER_KEY = SOLO ? 'mtg-build-filter-pb-solo' : 'mtg-build-filter-pb'; // デッキの「こまかく」（ぼうけん・こうちくとは べつに のこす）
// { pts：ポイント, cards：{ id: もって いる まい数 }, decks：[{ id, name, cards: [id…] }], active：つかう デッキの id, wins：たおした てきの 数, seed：てきを きめる 数,
//   quiz：{ n：といた 数, ok：せいかい, sessions }, cats：もんだいの しゅるい, opened：あけた パック, earned：ためた ポイントの 合計, lost：さいごの たたかいで まけた,
//   starter：きそデッキを もらった, fresh：デッキに まだ 入れて いない あたらしい カードが ある,
//   open：ショップと デッキが あいた（きそデッキで てきを 1たい たおすと あく。いちど あいたら ずっと）,
//   beat：{ あいての key: かった 回数 }, stage：ひらいた いちばん 上の ステージ, endless：むげんの たたかいで かった 数,
//   gp：せいちょうポイント, tree：{ 枝の id: とった 数 } }
const count = (ids) => ids.reduce((m, id) => { m[id] = (m[id] || 0) + 1; return m; }, {});
const starterDeck = () => ({ id: 'd0', name: PB_STARTER.name, cards: [...PB_STARTER.cards] });
const fresh = () => ({ v: 6, beat: {}, stage: 0, endless: 0, gp: 0, tree: {}, pts: PB.start, cards: count(PB_STARTER.cards), decks: [starterDeck()], active: 'd0', wins: 0, seed: Math.floor(Math.random() * 1e9), quiz: { n: 0, ok: 0, sessions: 0 }, cats: null, opened: 0, earned: 0, lost: 0, starter: 1, fresh: 0, open: 0, ...(SOLO ? { solo: 1 } : {}) });
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
      delete s.dot; // みための きりかえは なくした（いつも ドット）
      if (s.wins >= 1) s.open = 1; // もう てきを たおして いる セーブは あいて いる
      // まえの 形（28たいを じゅんばんに。wins だけ）：とどいて いた ところまでの ステージ・かった 回数・せいちょうポイントに うつす
      if (!v.beat) Object.assign(s, migrateProgress(s.wins, s.seed), { tree: {} });
      // ステージの きまりが かわった（2026-11-18：2回 → 3回ずつ・ステージ 1 が 5人に）：まえの きまりで ひらいて いた ステージは ひらいた まま。かった 回数は そのまま
      else if ((v.v || 0) < 4) s.stage = Math.max(s.stage || 0, topStage(s.beat, s.seed, 0, 2));
      // ステージの 顔ぶれが かわった（2026-11-21：テーロスがわは きまった 5人ずつ・ステージ 6 は あたらしい 5人）：
      // まえの 顔ぶれで クリアして いた テーロスがわの ステージ（2・3・6。ひらいた ステージより まえ）は、あたらしい 顔ぶれでも ぜんいん クリア（PB.need 回）。かった 回数は へらさない
      if ((v.v || 0) < 5) {
        const done = Math.max(s.stage || 0, topStage(s.beat, s.seed, 0));
        s.beat = { ...s.beat };
        for (let si = 0; si < Math.min(done, PB_STAGES.length); si++) if (PB_STAGES[si].id.startsWith('th-')) for (const f of foesOf(si, s.seed)) s.beat[f.key] = Math.max(s.beat[f.key] || 0, PB.need);
        s.stage = done;
      }
      // ステージ 2 の ならびが かわった（2026-11-22：ドラゴンが ボスで さいご、工場が 4ばんめ）：かった 回数を あいてに ついて いかせる（v5 の セーブ だけ。その まえは ばしょで おぼえて いた）
      if (v.v === 5) { const a = s.beat['th-e:3'], b = s.beat['th-e:4']; s.beat = { ...s.beat }; delete s.beat['th-e:3']; delete s.beat['th-e:4']; if (b) s.beat['th-e:3'] = b; if (a) s.beat['th-e:4'] = a; }
      s.v = 6;
      return s;
    }
  } catch { /* こわれていたら はじめから */ }
  return fresh();
}
let S = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 保存できなくても あそべる */ } };

let APP = null, BACK = null;
const app = () => APP();

// ---- みため：この モードは いつも ドット（GBA ふう）。せっていの みためは かえない（タイトルに もどる ときに もどす） ----
// pb-on：この モードの あいだだけ（もんだいの 画面も ドットの わく・ボタンに する。css の :root.pb-on[data-theme="gba"]）
const look = () => { const r = document.documentElement; r.classList.add('pb-on'); r.dataset.theme = 'gba'; };
const leave = () => { document.documentElement.classList.remove('pb-on'); applyTheme(); BACK(); };
// ドットの 絵（9×9 の ます）：X の ところを ぬる
const pix = (rows) => `<svg class="pb-ico" viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true">${rows.flatMap((r, y) => [...r].map((c, x) => (c === 'X' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ''))).join('')}</svg>`;
const ICON = {
  quiz: pix(['..XXXXX..', '.XX...XX.', '.XX...XX.', '.....XX..', '....XX...', '...XX....', '...XX....', '.........', '...XX....']),
  shop: pix(['.XXXXXXX.', '.X.X.X.X.', '.XXXXXXX.', '.X.....X.', '.X..X..X.', '.X.XXX.X.', '.X..X..X.', '.X.....X.', '.XXXXXXX.']),
  deck: pix(['..XXXXXX.', '..X....X.', 'XXXXXX.X.', 'X....X.X.', 'X....X.X.', 'X....XXX.', 'X....X...', 'X....X...', 'XXXXXX...']),
  grow: pix(['....X....', '...XXX...', '..XXXXX..', '.XXXXXXX.', '...XXX...', '...XXX...', '.X.XXX.X.', '.XXXXXXX.', '..XXXXX..']),
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
const capNow = () => capOf(S.tree), deckMax = () => deckMaxOf(S.tree);
const activeDeck = () => S.decks.find((d) => d.id === S.active) || null;
// デッキの ようす（つかえる カード だけ かぞえる）
function deckInfo(deck = activeDeck()) {
  const left = {}, ds = []; let missing = 0;
  for (const id of deck?.cards || []) { if (!(id in left)) left[id] = availFor(deck, id); if (left[id]-- > 0 && BY_ID[id]) ds.push(BY_ID[id]); else missing++; }
  const cols = [...new Set(ds.flatMap(colorsOf))];
  const st = { ds, cols, count: ds.length, points: ds.reduce((t, d) => t + ptsOf(d), 0), colors: cols.length, missing };
  return { ...st, problems: deck ? deckProblems(st, { size: DECK_SIZE, cap: capNow() }) : ['つかう デッキが ない。「デッキ」で デッキを えらぼう'] };
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
const canBuild = () => { const d = activeDeck(); const { pool, real } = poolFor(d); return real >= PB.minCards && autoCards(pool.slice(0, real), 'normal', null, capNow()).length >= PB.minCards; };

// タイトルの タイルに 出す ひとこと
export function pbSummary() { S = load(); return `${S.pts}P・てき ${S.wins}たい`; }

// ---- ショップと デッキは、チュートリアルを おえて、きそデッキで てきを 1たい たおすと あく（いちど あいたら ずっと） ----
const STARTER_ID = 'd0';
const starter = () => S.decks.find((d) => d.id === STARTER_ID) || null;
const tutorialOk = () => SOLO || titleStep() !== 'tutorial'; // タイトルの タイルが 出る ときと おなじ。単体版は チュートリアルが ない
const LOCK_NOTE = `${PB_STARTER.name}で てきを 1たい たおすと あくよ`;
// あく まえは きそデッキで たたかう。まえの セーブで きそデッキが ない・つかえない ときは つまらない ように あける
function checkOpen() {
  if (S.open) return;
  if (S.wins >= 1 || !starter() || !deckOk(starter())) S.open = 1; else S.active = STARTER_ID;
  save();
}

// ---- つぎに する こと：はじめは バトル（きそデッキで 1かち）→ ショップと デッキが あく → もんだい → ショップ → デッキ → バトル ----
function nextStep() {
  if (!S.open) return 'battle';
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
  locked: `まずは「バトル」で、${PB_STARTER.name}を つかって てきを 1たい たおそう。かつと ショップと デッキが あくよ。`,
  lockedLost: `まけても だいじょうぶ。もう いちど「バトル」に いどもう。${PB_STARTER.name}で 1たい たおすと、ショップと デッキが あくよ。`,
  lostShop: 'まけても だいじょうぶ。「ショップ」で パックを あけて、デッキを つよく しよう。',
  lostQuiz: 'まけても だいじょうぶ。「もんだい」で ポイントを ためて、パックを あけよう。',
};
const guideText = (step) => (!S.open ? (S.lost ? GUIDE.lockedLost : GUIDE.locked) : step === 'quiz' && !S.quiz.n && !S.opened ? GUIDE.quiz0 : S.lost ? (step === 'shop' ? GUIDE.lostShop : GUIDE.lostQuiz) : step === 'deck' && deckInfo().problems.length ? GUIDE.deckFix : GUIDE[step]);

// ---- ステージと あいて ----
const top = () => topStage(S.beat, S.seed, S.stage); // ひらいて いる いちばん 上（PB_STAGES.length ＝ ぜんぶ クリア：むげんの たたかい）
const foeName = (f) => f.char?.who || (FLOOR_NAMES[f.floorId] || f.floorId).replace(/^\d階 /, '');
const foePlace = (f) => (f.kihon ? '' : (FLOOR_NAMES[f.floorId] || '').replace(/^\d階 /, '')); // とうの あいての ばしょ（ハイドラとの たいじ など）
const beatOf = (f) => S.beat[f.key] || 0;
const stageLeft = (si) => (si < top() ? 0 : foesOf(si, S.seed).reduce((t, f) => t + Math.max(0, PB.need - beatOf(f)), 0)); // つぎが ひらくまでの かち数（もう ひらいて いれば 0）
const stageNote = () => { const t = top(); return t >= PB_STAGES.length ? 'むげんの たたかい' : `ステージ ${t + 1}：${PB_STAGES[t].name}`; };

// ---- ホーム ----
export function pbMenu(appFn, back) {
  APP = appFn || APP; BACK = back || BACK;
  S = load(); VIEW = null; checkOpen(); save(); // まえの 形の セーブは ここで あたらしい 形に
  home();
}
function home() {
  look();
  const A = activeDeck(), D = deckInfo(), step = nextStep();
  const ok = !D.problems.length;
  const lock = (go) => !S.open && (go === 'shop' || go === 'deck' || go === 'grow');
  const row = (go, no, name, sub, em) => `<li><button type="button" class="st-ep ${step === go ? 'next' : ''} ${lock(go) ? 'lock' : ''}" data-go="${go}" ${lock(go) ? 'disabled' : ''}><b><i class="pb-num">${no}</i>${ICON[go]}</b><span><i class="st-title">${name}</i><small>${lock(go) ? LOCK_NOTE : ruby(sub)}</small></span><em>${lock(go) ? 'まだ あかない' : em}</em></button></li>`;
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
      ${row('battle', 4, 'バトル', `${stageNote()}。あいてを えらんで たたかう`, ok ? 'いどめる' : 'デッキが まだ')}
      ${row('grow', 5, 'せいちょう', 'せいちょうポイントで、できる ことを ふやす', `${S.gp}ポイント`)}
    </ol>
    <p class="zk-note">ポイントが なくなっても、もんだいを とけば いつでも ためなおせる。たたかいに まけても、ポイントと カードは なくならない。</p>
    ${SOLO ? `<div class="row-btns pb-solo"><button type="button" class="btn" data-snd="1" aria-pressed="${soundOn()}">おと ${soundOn() ? 'あり' : 'なし'}</button><button type="button" class="btn ghost" data-reset="1">はじめから やりなおす</button></div>`
    : '<button type="button" class="btn ghost" data-back="1">タイトルへ もどる</button>'}
  </main>`;
  app().onclick = async (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.back) return leave();
    if (b.dataset.snd) { setSound(!soundOn()); return home(); }
    // 単体版（ためしに あそぶ 用）：つぎの 人の ために はじめから
    if (b.dataset.reset) {
      const v = await sheet('<p>ポイント・カード・デッキ・たおした てきの 数を ぜんぶ けして、はじめから やりなおす？ もとに もどせない。</p>', [{ label: 'やりなおす', value: 1 }, { label: 'やめる', value: 0, kind: 'primary' }], { title: 'はじめから やりなおす' });
      if (v) { S = fresh(); VIEW = null; save(); }
      return home();
    }
    if (b.dataset.go === 'quiz') return quiz();
    if (b.dataset.go === 'shop') return shop();
    if (b.dataset.go === 'deck') return deckList();
    if (b.dataset.go === 'battle') return arena();
    if (b.dataset.go === 'grow') return grow();
  };
}

// ---- ① もんだい：しゅぎょうと おなじ 問題。せいかいの たびに ポイントが ふえて、すぐ のこる ----
// むずかしさ：せいちょうの「もんだい」の 枝で ふえる。むずかしい ほど 1もんの ポイントが 多い
async function quiz() {
  const lv = S.tree.quiz || 0;
  if (!lv) return runQuiz(0);
  const v = await sheet('<p>むずかしい もんだいほど、もらえる ポイントが 多い。</p>',
    [...Array.from({ length: lv + 1 }, (_, t) => ({ label: `${t ? HARD_TIERS[t].name : 'ふつう'}（1もん ${PB.quizTier[t]}P）`, value: t, kind: t === (S.quizTier ?? 0) ? 'primary' : '' })), { label: 'やめる', value: null }], { title: 'もんだいの むずかしさ' });
  if (v == null) return home();
  S.quizTier = v; save();
  return runQuiz(v);
}
function runQuiz(tier) {
  let streak = 0, gain = 0, bonus = 0;
  const per = PB.quizTier[tier], T = tier ? HARD_TIERS[tier] : null, defs = T ? T.defs : CATS;
  const saved = (tier ? S.cats2?.[tier] : S.cats) || [];
  studyScreen(APP, {
    ...(T ? { defs, session: (rng, cats) => hardSession(rng, tier, cats) } : {}),
    cats: saved.filter((c) => defs[c]).length ? saved.filter((c) => defs[c]) : Object.keys(defs),
    setCats: (c) => { if (tier) S.cats2 = { ...S.cats2, [tier]: c }; else S.cats = c; save(); },
    eyebrow: `${PB_NAME}　もんだい${T ? `（${T.name}）` : ''}`,
    title: `${QUIZ_SECONDS}びょう もんだい`,
    lead: `${QUIZ_SECONDS}びょうで できるだけ たくさん とこう。<b>1もん せいかいで ＋${per}P</b>。${PB.streakEvery}もん れんぞくで せいかいする たびに ボーナス ＋${PB.streakBonus}P。まちがえても ポイントは へらない。`,
    onAnswer: (right) => {
      streak = right ? streak + 1 : 0;
      const g = quizGain(right, streak, tier);
      S.quiz.n++; if (right) S.quiz.ok++;
      S.pts += g; S.earned += g; gain += g; if (g > per) bonus += g - per;
      save();
      return !right ? '' : g > per ? `${streak}もん れんぞく！ ＋${g}P` : `＋${g}P`;
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
  if (!S.open) return home();
  const afford = S.pts >= PB.pack;
  const rows = packsFor(S.tree.pack).map((p) => {
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
    if (b.dataset.buy) return buy(packsFor(S.tree.pack).find((p) => p.id === b.dataset.buy));
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
  if (!SOLO) zukanPack(cards); // 単体版に ずかんは ない
  gacha(APP, cards, {
    got: true, // めくった カードの 下の まどに「〇〇を てに いれた！」
    eyebrow: `${PB_NAME}　${ruby(p.name)}`, owned: new Set(Object.keys(before)), doneLabel: 'ショップへ',
    bonus: `<div class="bonus"><p class="bonus-title">${ruby(p.name)}</p><span>のこり ${S.pts}P</span></div>`,
    done: shop, // トロフィーは つけない（トロフィーで こうちくの パックけんが ふえて しまう。この モードの ものは この モードの 中だけ）
  });
}

// ---- ③ デッキ：いくつも のこせる。カードは デッキの あいだで わけあえない。バトルには「つかう デッキ」で 出る ----
// きまりは こうちくモードの ノーマルと おなじ（20まい・30点・2色まで・同じ カードは 4まいまで）
const needList = (problems) => `<ul class="pb-list">${problems.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
const pips = (cols) => cols.map((c) => `<i class="pip m-${c}">${COLOR_NAME[c]}</i>`).join('') || '<i class="pip">むしょく</i>';
function deckList() {
  if (!S.open) return home();
  S.fresh = 0; save();
  const full = S.decks.length >= deckMax();
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
    <div class="row-btns"><button type="button" class="btn" data-new="1" ${full ? 'disabled' : ''}>あたらしい デッキを つくる<small>${full ? `デッキは ${deckMax()}こまで${deckMax() < PB.deckMax ? '（せいちょうで ふえる）' : ''}` : `${S.decks.length} / ${deckMax()}こ`}</small></button></div>
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
  if (S.decks.length >= deckMax()) return deckList();
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
    pane: true, // 左に カードの ならび、右に えらんだ カードの せつめい
    deck: deck.cards ? idx(deck.cards) : null, stack: true, filterKey: FILTER_KEY,
    title: `${PB_NAME}：${deck.name}`,
    cap: capNow(),
    auto: () => idx(autoCards(pool.slice(0, real), 'normal', null, capNow())), // おまかせ：のこって いる カードで いちばん つよい 2色
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

// ---- ④ バトル：ステージの 中の あいてを えらんで たたかう。ぜんいんを PB.need 回ずつ たおすと つぎの ステージが ひらく ----
let VIEW = null; // 見て いる ステージ（PB_STAGES.length ＝ むげんの たたかい）
let SWIPED = 0; // さいごに スワイプした とき（すぐ あとの タップを むしする）
const sigN = (f) => (f.boss ? SIG_COPIES.boss : SIG_COPIES.foe) + (f.plus || 0);
// デッキで たたかう あいての こうげきの くせ（enemies.js の pvp の style）
const AI_WORD = { rush: 'こうげきできる 子は ぜんぶ こうげき', guard: '数で かって いる ときだけ こうげき', '': 'ようすを 見て こうげき' };
// ステージを 左右に めくる（スワイプ・やじるし・下の 点）。まだの ステージも 見られるが、えらべない
function arena() {
  const t = top(), D = deckInfo(), ok = !D.problems.length, N = PB_STAGES.length;
  const pages = N + (t >= PB_MAIN ? 1 : 0); // ステージ 1〜6 を クリアすると むげんの たたかいの ページが ふえる（特別ステージ 7 と いっしょに ひらく）
  if (VIEW == null) VIEW = Math.min(t, pages - 1);
  VIEW = Math.max(0, Math.min(pages - 1, VIEW));
  const endless = VIEW >= N, locked = !endless && VIEW > t, done = !endless && VIEW < t;
  const stars = (n) => `${'★'.repeat(Math.min(n, PB.need))}${'☆'.repeat(Math.max(0, PB.need - n))}${n > PB.need ? `（${n}回）` : ''}`;
  const foeRow = (f) => {
    const n = beatOf(f), c = f.char, place = foePlace(f);
    const face = PB_FACES[f.kihon ? c.id : f.floorId]; // 顔グラ（この 画面 だけ。ない あいては いままで どおり ばんごう）
    return `<li><button type="button" class="st-ep pb-char ${locked ? 'lock' : n >= PB.need ? 'done' : 'open'}" data-foe="${esc(f.key)}" ${ok && !locked ? '' : 'disabled'}>
    <b>${face ? `<img class="pb-face" src="${face}" alt="" width="96" height="96">` : f.k + 1}</b><span><i class="st-title">${ruby(c.who)}${f.boss ? '<em class="pb-boss">ボス</em>' : ''}</i>
      <small class="pb-line">${ruby(`「${c.line}」`)}</small>
      <small class="pb-kind">${pips([...c.cols])}<span>${ruby(`${c.theme}・${c.style}${place ? `（${place}）` : ''}`)}</span></small>
      ${f.kihon ? '' : `<small class="pb-sig">${ruby(f.ghost
    ? `じぶんの デッキ（カード ${ghostDeck(f).ids.length}まい${ghostDeck(f).ids.length < 20 ? ' ＋ きほんカード' : ''}）で たたかう。${AI_WORD[ghostDeck(f).ai]}。きまり：${ghostDeck(f).rule}`
    : `きめわざ「${PB_SIG[f.floorId].def.name}」×${sigN(f)}：${PB_SIG[f.floorId].text}。なかま「${PB_PAL[f.floorId].def.name}」×${sigN(f)}：${PB_PAL[f.floorId].text}${f.buff ? '。ボスは 本気（ほんき）：クリーチャー ＋1/＋1' : ''}${f.lifeBonus ? `。てごわいので きみの ライフ ＋${f.lifeBonus}` : ''}`)}</small>`}
      <small>かった 回数 ${stars(n)}　＋${battleGain(f).base}P</small></span>
    <em>${locked ? 'まだ' : n >= PB.need ? 'クリア' : `あと ${PB.need - n}回`}</em></button></li>`;
  };
  const E = endless ? endlessAt(S.endless, S.seed) : null;
  const left = endless || locked ? 0 : stageLeft(VIEW);
  const dots = Array.from({ length: pages }, (_, si) => `<button type="button" class="pb-dot ${si === VIEW ? 'on' : ''} ${si < N && si > t ? 'lock' : ''}" data-stage="${si}" aria-label="${si >= N ? 'むげんの たたかい' : `ステージ ${si + 1}`}${si > t ? '（まだ）' : ''}">${si >= N ? '∞' : si + 1}</button>`).join('');
  app().innerHTML = `<main class="zukan construct pb pb-arena">
    <p class="eyebrow">${PB_NAME}　たおした てき ${S.wins}たい</p>
    <h2>バトル</h2>
    <div class="pb-pager" role="group" aria-label="ステージを えらぶ">
      <button type="button" class="btn pb-arrow" data-step="-1" ${VIEW <= 0 ? 'disabled' : ''} aria-label="まえの ステージ">◀</button>
      <p class="pb-page"><b>${endless ? 'むげんの たたかい' : `ステージ ${VIEW + 1}`}</b><span>${endless ? ruby(`${E.lap}しゅうめ`) : ruby(PB_STAGES[VIEW].name)}</span></p>
      <button type="button" class="btn pb-arrow" data-step="1" ${VIEW >= pages - 1 ? 'disabled' : ''} aria-label="つぎの ステージ">▶</button>
    </div>
    <div class="pb-dots">${dots}</div>
    <p class="zk-note pb-swipe-note">左右に スワイプ か ◀ ▶ で ステージを めくる。</p>
    <section class="st-ch ${locked ? 'pb-locked' : ''}">
      ${endless ? `<h3>むげんの たたかい<small class="st-guide">${ruby(`${E.lap}しゅうめ：てきの クリーチャーは ＋${E.buff}/＋${E.buff}。かった 数 ${S.endless}`)}</small></h3>
      <ol><li><button type="button" class="st-ep open pb-char" data-foe="endless" ${ok ? '' : 'disabled'}><b>∞</b><span><i class="st-title">${ruby(E.char.who)}</i><small class="pb-line">${ruby(`「${E.char.line}」`)}</small><small>${ruby(E.stageName)}　＋${battleGain(E).base}P</small></span><em>いどむ</em></button></li></ol>`
    : `<h3><span>ステージ ${VIEW + 1}　${ruby(PB_STAGES[VIEW].name)}</span><small class="st-guide">${locked ? `まだ あかない：ステージ ${VIEW}の ぜんいんを ${PB.need}かいずつ たおすと あく` : done ? 'クリア！ なんどでも たたかえる' : `ぜんいんを ${PB.need}かいずつ たおすと つぎが あく（あと ${left}回）`}</small></h3>
      ${locked ? `<p class="pb-lock">まだ あかない。ステージ ${VIEW}の ぜんいんを ${PB.need}かいずつ たおすと あくよ。</p>` : ''}
      <ol>${foesOf(VIEW, S.seed).map(foeRow).join('')}</ol>`}
      <p class="zk-note">すきな あいてから たたかえる。かつと ポイントと カード 1まい（アンティ）。ぴったり 1回ごとに ＋${PB.exact}P（${PB.exactMax}回まで）。まけても ポイントと カードは なくならない。</p>
    </section>
    ${ok ? `<p class="deckline">つかう デッキ：${esc(activeDeck().name)}　${deckLine(D)}</p>`
    : `<div class="pb-need"><p><b>つかう デッキが まだ できて いない</b>ので、バトルに 出られない。</p>${needList(D.problems)}</div>`}
    ${S.open ? `<div class="row-btns"><button type="button" class="btn" data-go="deck">${ok ? 'デッキを かえる' : 'デッキを なおす'}</button></div>` : `<p class="pb-guide">${esc(`${PB_STARTER.name}で あいてを 1たい たおすと、ショップと デッキが あくよ。`)}</p>`}
    <button type="button" class="btn ghost" data-back="1">ホームへ</button>
  </main>`;
  const step = (d) => { const v = VIEW + d; if (v < 0 || v >= pages) return; VIEW = v; arena(); };
  // スワイプ：よこに 40px いじょう（たてより よこが 大きい とき）。スワイプの すぐ あとの タップは あいてを えらばない
  const main = app().firstElementChild;
  let from = null;
  main.onpointerdown = (e) => { from = [e.clientX, e.clientY]; };
  main.onpointercancel = () => { from = null; };
  main.onpointerup = (e) => {
    if (!from) return;
    const dx = e.clientX - from[0], dy = e.clientY - from[1]; from = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    SWIPED = Date.now(); step(dx < 0 ? 1 : -1);
  };
  app().onclick = (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled || Date.now() - SWIPED < 350) return;
    if (b.dataset.back) return home();
    if (b.dataset.go === 'deck') return deckList();
    if (b.dataset.step) return step(+b.dataset.step);
    if (b.dataset.stage != null) { VIEW = +b.dataset.stage; return arena(); }
    if (b.dataset.foe) return fight(b.dataset.foe === 'endless' ? endlessAt(S.endless, S.seed) : foesOf(VIEW, S.seed).find((f) => f.key === b.dataset.foe));
  };
}
// アンティ：かって もらった カードを 大きく 見せる（くらい 画面の まんなかに カード、下の まどに「〇〇を てに いれた！」）
const anteShow = (d, dupe) => sheet(`<div class="ante-card ${d.rar === 'L' ? 'legend' : ''}">${fullCard(d)}</div>
  <p class="ante-msg">${ruby(`${info(d).name}を てに いれた！`)}</p>
  ${dupe ? `<p class="ante-dupe">もう ${MAX_COPY}まい もって いるので、<b>＋${PB.anteDupe}P</b> に かわった</p>` : `<p class="ante-have">もって いる ${own(d.id)}まい</p>`}`,
  [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: 'アンティ：かって もらった カード', cls: 'ante', dismiss: false });
function fight(f) {
  if (!f || deckInfo().problems.length) return arena();
  const label = f.endless != null ? `むげん ${f.endless + 1}：${foeName(f)}` : `ステージ ${f.si + 1}：${foeName(f)}`;
  startBattle({
    deck: playDeck(), floor: f.kihon ? foeFloor(f) : f.ghost ? guildFloor(f) : towerFloor(f), diff: f.diff, floorName: label, buff: f.buff,
    life: f.lifeBonus ? 20 + f.lifeBonus : null, // とくに むずかしい あいて：ライフを 多く して はじめる
    extraNote: [f.buff ? `${f.lap ? `${f.lap}しゅうめ：` : 'ボスは 本気（ほんき）：'}てきの クリーチャーは ＋${f.buff}/＋${f.buff}` : '', f.lifeBonus ? `てごわい あいて なので、きみの ライフは ${20 + f.lifeBonus}から` : '',
      PB_SIG[f.floorId] && !f.kihon && !f.ghost ? `きめわざ「${PB_SIG[f.floorId].def.name}」：${PB_SIG[f.floorId].text}` : '',
      PB_PAL[f.floorId] && !f.kihon && !f.ghost ? `なかま「${PB_PAL[f.floorId].def.name}」：${PB_PAL[f.floorId].text}` : ''].filter(Boolean).join('。'),
    quit: { label: 'ホームへ もどる', note: 'たたかいを やめて もどる？ ポイントと カードは そのまま。この てきには また いどめるよ。', go: home },
    onEnd: async (r) => {
      S = load();
      if (!r.win) {
        S.lost = 1; save();
        await sheet(`<p>まけて しまった。でも、ポイントと カードは そのまま。</p><p class="zk-note">${!S.open ? 'もう いちど いどもう。' : S.pts >= PB.pack ? 'ショップで パックを あけて、デッキを つよく しよう。' : 'もんだいで ポイントを ためて、パックを あけよう。'}</p>`,
          [{ label: 'ホームへ', value: 1, kind: 'primary' }], { title: r.draw ? 'ひきわけ' : 'まけて しまった', dismiss: false });
        return home();
      }
      // かち：さきに ぜんぶ のこす（まどを とじる まえに ブラウザを とじても なくならない）
      const g = battleGain(f, r.exact), before = S.pts, was = top();
      const opened = !S.open && tutorialOk() && S.active === STARTER_ID; // きそデッキで 1たい たおした：ショップと デッキが あく
      S.wins++; S.pts += g.total; S.earned += g.total; S.lost = 0; S.gp += PB.gpWin; if (opened) S.open = 1;
      if (f.endless != null) S.endless++; else S.beat[f.key] = beatOf(f) + 1;
      // アンティ：あいての ステージの カードを 1まい。もう 4まい もって いたら ポイントに
      const card = antePick(f, Math.random), dupe = own(card.id) >= MAX_COPY;
      if (dupe) { S.pts += PB.anteDupe; S.earned += PB.anteDupe; } else { S.cards[card.id] = own(card.id) + 1; S.fresh = 1; }
      // ステージを クリア：つぎの ステージ（さいごは むげんの たたかい）が ひらく
      const now = top(), cleared = now > was;
      if (cleared) { S.stage = now; S.gp += PB.gpStage * (now - was); VIEW = now; }
      save();
      if (!SOLO && !dupe) zukanPack([card]);
      await sheet(`<p><b>${ruby(foeName(f))}</b>を たおした！</p>
        <p class="what">${f.boss ? 'ボスを たおした' : 'かった'} ＋${g.base}P${g.exact ? `　ぴったり ${Math.min(PB.exactMax, r.exact)}回 ＋${g.exact}P` : ''}</p>
        <p class="cs-math">${before}P ＋ ${g.total}P ＝ <b>${before + g.total}</b>P</p>
        <p class="what">せいちょうポイント ＋${PB.gpWin}${cleared ? `　ステージ クリア ＋${PB.gpStage * (now - was)}` : ''}（いま ${S.gp}）</p>`,
        [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: 'かった！', dismiss: false });
      await anteShow(card, dupe);
      if (cleared) {
        const N = PB_STAGES.length;
        NEWS_TEXT.pbStage = now >= N
          ? { name: 'ぜんぶの ステージを クリア', text: `特別（とくべつ）ステージ「${PB_STAGES[N - 1].name}」も クリアした！ おめでとう。「むげんの たたかい」は まだまだ つづく。` }
          : now === PB_MAIN && was < PB_MAIN
          ? { name: `むげんの たたかい と ステージ ${now + 1}`, text: `ステージ 1〜${PB_MAIN} を ぜんぶ クリアした！ おまけの「むげんの たたかい」（てきは 1しゅう ごとに つよく なる）と、特別（とくべつ）ステージ ${now + 1}「${PB_STAGES[now].name}」が ひらいた。` }
          : { name: `ステージ ${now + 1}「${PB_STAGES[now].name}」`, text: `ステージ ${was + 1}「${PB_STAGES[was].name}」の ぜんいんを ${PB.need}かいずつ たおした！ つぎの あいてが まって いる。` };
        await unlockSheet('pbStage');
      }
      if (opened) { await unlockSheet('pbOpen'); return home(); } // 「あたらしく ショップと デッキが かいほう された！」
      return arena();
    },
  });
}

// ---- ⑤ せいちょう：かつと もらう せいちょうポイントで、できる ことを ふやす（カードは つよく しない） ----
function grow() {
  if (!S.open) return home();
  const node = (b, n, i) => {
    const lv = S.tree[b.id] || 0, st = i < lv ? 'on' : i === lv && S.gp >= n.cost ? 'can' : 'lock';
    return `<li><button type="button" class="em-node ${st}" data-b="${b.id}" data-i="${i}"><span class="em-lv">${b.mark}<b>${i + 1}</b></span><span class="em-text">${ruby(n.text)}</span><em>${i < lv ? 'とった' : `${n.cost}ポイント`}</em></button></li>`;
  };
  app().innerHTML = `<main class="zukan construct pb emblem">
    <p class="eyebrow">${PB_NAME}</p>
    <h2>せいちょう</h2>
    <p class="em-pts">せいちょうポイント <b id="pb-gp">${S.gp}</b><small>たたかいに かつと ＋${PB.gpWin}、ステージを クリアすると ＋${PB.gpStage}。もんだいの ポイント（P）とは べつ</small></p>
    <p class="zk-note">えだごとに、左から じゅんばんに とれる。カードは つよく ならない：できる ことが ふえる。</p>
    ${PB_TREE.map((b) => `<section class="em-branch"><h3>${b.mark} ${esc(b.name)}<small>${esc(b.note)}</small></h3><ol class="em-nodes">${b.nodes.map((n, i) => node(b, n, i)).join('')}</ol></section>`).join('')}
    <button type="button" class="btn ghost" data-back="1">ホームへ</button>
  </main>`;
  app().onclick = async (e) => {
    const el = e.target.closest('button'); if (!el) return;
    if (el.dataset.back) return home();
    const b = PB_TREE.find((x) => x.id === el.dataset.b); if (!b) return;
    const i = +el.dataset.i, lv = S.tree[b.id] || 0, n = b.nodes[i];
    if (i < lv) return toast('もう とって いる');
    if (i > lv) return toast('左の ものから じゅんばんに とろう');
    if (S.gp < n.cost) return toast(`せいちょうポイントが たりない（あと ${n.cost - S.gp}）`);
    const v = await sheet(`<p><b>${b.mark} ${esc(b.name)} ${i + 1}</b></p><p>${ruby(n.text)}</p><p class="cs-math">${S.gp} − ${n.cost} ＝ <b>${S.gp - n.cost}</b>ポイント</p>`,
      [{ label: 'とる', value: 1, kind: 'primary' }, { label: 'やめる', value: 0 }], { title: 'せいちょう' });
    if (v) { S.gp -= n.cost; S.tree = { ...S.tree, [b.id]: lv + 1 }; save(); }
    return grow();
  };
}
