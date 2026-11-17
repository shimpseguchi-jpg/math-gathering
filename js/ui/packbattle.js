// パック＆バトル（2026-11-17。docs/PACKBATTLE.md）：もんだい → ショップ → デッキ → バトル を ぐるぐる まわす モード
// ① もんだい（しゅぎょうと おなじ 問題）で ポイントを ためる ② ショップで ポイントを つかって パックを あける
// ③ もって いる カードで デッキを くむ（こうちくモードの ノーマルと おなじ きまり）④ てきを 1体ずつ たおして いく（かつと ポイント）
// ぼうけん（mtg-adventure-v1）・こうちく（mtg-collection）・次元渡りとは べつの セーブ。カード・ポイントは ここだけの もの
import { BY_ID, BASICS } from '../data/cards.js';
import { CATS, QUIZ_SECONDS } from '../data/quiz.js';
import { kihonFloor } from '../data/kihon.js';
import { PB, PB_NAME, PB_PACKS, PB_TIERS, PB_TOTAL, quizGain, battleGain, stageAt, deckProblems } from '../data/packbattle.js';
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
import { sheet, esc, ruby, COLOR_NAME } from './view.js';

const KEY = 'mtg-packbattle-v1';
const FILTER_KEY = 'mtg-build-filter-pb'; // デッキの「こまかく」（ぼうけん・こうちくとは べつに のこす）
// { pts：ポイント, cards：{ id: まい数 }, deck：[id…] | null, wins：たおした てきの 数, seed：てきを きめる 数,
//   quiz：{ n：といた 数, ok：せいかい, sessions }, cats：もんだいの しゅるい, opened：あけた パック, earned：ためた ポイントの 合計, lost：さいごの たたかいで まけた }
const fresh = () => ({ v: 1, pts: PB.start, cards: {}, deck: null, wins: 0, seed: Math.floor(Math.random() * 1e9), quiz: { n: 0, ok: 0, sessions: 0 }, cats: null, opened: 0, earned: 0, lost: 0 });
function load() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && v.cards) return { ...fresh(), ...v, quiz: { ...fresh().quiz, ...v.quiz } }; } catch { /* こわれていたら はじめから */ }
  return fresh();
}
let S = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 保存できなくても あそべる */ } };

let APP = null, BACK = null;
const app = () => APP();

// ---- もちもの ----
const own = (id) => Math.min(MAX_COPY, S.cards[id] || 0); // デッキに つかえる まい数（4まいまで）
const kinds = () => Object.keys(S.cards).filter((id) => BY_ID[id] && S.cards[id] > 0);
const totalCards = () => kinds().reduce((t, id) => t + S.cards[id], 0);
const ownPool = () => kinds().flatMap((id) => Array(own(id)).fill(id)); // てに いれた じゅん
// いまの デッキ（もって いる カード だけ）と、その ようす
function deckInfo() {
  const left = {}, ds = []; let missing = 0;
  for (const id of S.deck || []) { if (!(id in left)) left[id] = own(id); if (left[id]-- > 0 && BY_ID[id]) ds.push(BY_ID[id]); else missing++; }
  const cols = [...new Set(ds.flatMap(colorsOf))];
  const st = { ds, cols, count: ds.length, points: ds.reduce((t, d) => t + ptsOf(d), 0), colors: cols.length, missing };
  return { ...st, problems: deckProblems(st, { size: DECK_SIZE, cap: CAPACITY }) };
}
// たたかう デッキ：たりない ぶんは よく つかう 色の きほんカード（こうちくモードと おなじ）
function playDeck() {
  const { ds, cols } = deckInfo();
  const deck = [...ds];
  const cnt = Object.fromEntries(cols.map((c) => [c, ds.filter((d) => colorsOf(d).includes(c)).length]));
  const order = cols.length ? [...cols].sort((a, b) => cnt[b] - cnt[a]) : ['C'];
  for (let k = 0; deck.length < DECK_SIZE; k++) deck.push(BASICS[order[k % order.length]]);
  return deck;
}
// いまの カードで デッキが くめるか（おまかせで きまりの 数に とどくか）
const canBuild = () => { const pool = ownPool(); return pool.length >= PB.minCards && autoCards(pool, 'normal', null).length >= PB.minCards; };

// タイトルの タイルに 出す ひとこと
export function pbSummary() { S = load(); return `${S.pts}P・てき ${S.wins}たい`; }

// ---- つぎに する こと：はじめては もんだい → ショップ → デッキ → バトル ----
function nextStep() {
  if (!S.quiz.n && !S.opened) return 'quiz'; // はじめて
  const afford = S.pts >= PB.pack;
  if (S.lost) return afford ? 'shop' : 'quiz'; // まけた あと：カードを ふやして つよく する
  if (!deckInfo().problems.length) return 'battle';
  if (canBuild()) return 'deck';
  return afford ? 'shop' : 'quiz';
}
const GUIDE = {
  quiz0: `まずは「もんだい」で ポイントを ためよう。はじめに ${PB.start}P もって いるので、すぐに「ショップ」で パックを あけても いいよ。`,
  quiz: 'ポイントが たりない ときは「もんだい」へ。もんだいは なんどでも とけるよ。',
  shop: 'ポイントが たまった！「ショップ」で パックを あけて、カードを ふやそう。',
  deck: 'カードが そろった。「デッキ」で たたかう カードを えらぼう。',
  battle: 'じゅんびが できた！「バトル」で つぎの てきに いどもう。',
  lostShop: 'まけても だいじょうぶ。「ショップ」で パックを あけて、デッキを つよく しよう。',
  lostQuiz: 'まけても だいじょうぶ。「もんだい」で ポイントを ためて、パックを あけよう。',
};
const guideText = (step) => (step === 'quiz' && !S.quiz.n && !S.opened ? GUIDE.quiz0 : S.lost ? (step === 'shop' ? GUIDE.lostShop : GUIDE.lostQuiz) : GUIDE[step]);

// ---- てきの なまえ ----
const stageNow = () => stageAt(S.wins, S.seed);
const foeName = (st) => (st.kihon ? st.kihon.name : FLOOR_NAMES[st.floorId] || st.floorId).replace(/^\d階 /, '');
const stageLabel = (st) => `${st.n + 1}たいめ ${foeName(st)}`;
const rewardLine = (st) => `かつと ＋${battleGain(st).base}P${st.boss ? '（ボス）' : ''}。ぴったり 1回ごとに ＋${PB.exact}P（${PB.exactMax}回まで）`;

// ---- ホーム ----
export function pbMenu(appFn, back) {
  APP = appFn || APP; BACK = back || BACK;
  S = load();
  home();
}
function home() {
  const D = deckInfo(), step = nextStep(), st = stageNow();
  const ok = !D.problems.length;
  const row = (go, no, name, sub, em) => `<li><button type="button" class="st-ep ${step === go ? 'next' : ''}" data-go="${go}"><b>${no}</b><span><i class="st-title">${name}</i><small>${ruby(sub)}</small></span><em>${em}</em></button></li>`;
  app().innerHTML = `<main class="zukan construct pb">
    <p class="eyebrow">もんだいで ためて、パックを あけて、てきを たおそう</p>
    <h2>${PB_NAME}</h2>
    <ul class="pb-stats">
      <li><span>ポイント</span><b id="pb-pts">${S.pts}</b><small>P</small></li>
      <li><span>カード</span><b>${totalCards()}</b><small>まい（${kinds().length}しゅるい）</small></li>
      <li class="${ok ? 'ok' : 'ng'}"><span>デッキ</span><b>${ok ? 'かんせい' : 'まだ'}</b><small>${D.count ? `${D.count}まい・${D.points}点` : 'カードを えらぼう'}</small></li>
      <li><span>たおした てき</span><b>${S.wins}</b><small>たい</small></li>
    </ul>
    <p class="pb-guide">${esc(guideText(step))}</p>
    <ol class="pb-steps">
      ${row('quiz', 1, 'もんだい', `1もん せいかいで ＋${PB.quiz}P。${PB.streakEvery}もん れんぞくで ボーナス ＋${PB.streakBonus}P`, 'ポイントを ためる')}
      ${row('shop', 2, 'ショップ', `パック 1つ ${PB.pack}P（カード 8まい）`, S.pts >= PB.pack ? `${Math.floor(S.pts / PB.pack)}つ あけられる` : `あと ${PB.pack - S.pts}P`)}
      ${row('deck', 3, 'デッキ', ok ? `${D.cols.map((c) => COLOR_NAME[c]).join('・') || 'むしょく'}　${D.count}まい ＋ きほん ${DECK_SIZE - D.count}まい・${D.points}点` : D.problems[0], ok ? 'かんせい' : 'まだ')}
      ${row('battle', 4, 'バトル', `つぎの てき：${stageLabel(st)}　${st.tierName}`, ok ? 'いどめる' : 'デッキが まだ')}
    </ol>
    <p class="zk-note">ポイントが なくなっても、もんだいを とけば いつでも ためなおせる。たたかいに まけても、ポイントと カードは なくならない。</p>
    <button type="button" class="btn ghost" data-back="1">タイトルへ もどる</button>
  </main>`;
  app().onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.back) return BACK();
    if (b.dataset.go === 'quiz') return quiz();
    if (b.dataset.go === 'shop') return shop();
    if (b.dataset.go === 'deck') return build();
    if (b.dataset.go === 'battle') return arena();
  };
}

// ---- ① もんだい：しゅぎょうと おなじ 問題。せいかいの たびに ポイントが ふえて、すぐ のこる ----
function quiz() {
  let streak = 0, gain = 0, bonus = 0;
  studyScreen(APP, {
    cats: S.cats?.length ? S.cats.filter((c) => CATS[c]) : Object.keys(CATS), setCats: (c) => { S.cats = c; save(); },
    eyebrow: `${PB_NAME}　もんだい`,
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
  S.pts -= PB.pack; S.opened++; S.lost = 0;
  for (const d of cards) S.cards[d.id] = (S.cards[d.id] || 0) + 1;
  save();
  zukanPack(cards);
  gacha(APP, cards, {
    eyebrow: `${PB_NAME}　${ruby(p.name)}`, owned: new Set(Object.keys(before)), doneLabel: 'ショップへ',
    bonus: `<div class="bonus"><p class="bonus-title">${ruby(p.name)}</p><span>のこり ${S.pts}P</span></div>`,
    done: () => { onPack(cards); shop(); }, // トロフィー（めくりおわってから）
  });
}

// ---- ③ デッキ：もって いる カードから。ぼうけん・こうちくと おなじ 画面（ノーマル：20まい・30点・2色まで・同じ カードは 4まいまで） ----
const needList = (problems) => `<ul class="pb-list">${problems.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
async function build() {
  const pool = ownPool();
  if (!pool.length) {
    const v = await sheet(`<p>まだ カードが ない。ショップで パックを あけよう。</p>${S.pts < PB.pack ? `<p class="zk-note">ポイントが たりない ときは、もんだいで ためよう。</p>` : ''}`,
      [S.pts >= PB.pack ? { label: 'ショップへ', value: 'shop', kind: 'primary' } : { label: 'もんだいへ', value: 'quiz', kind: 'primary' }, { label: 'とじる', value: 0 }], { title: 'デッキ' });
    return v === 'shop' ? shop() : v === 'quiz' ? quiz() : home();
  }
  const idx = (ids) => { const used = new Set(); return ids.map((id) => pool.findIndex((x, k) => x === id && !used.has(k) && used.add(k))).filter((k) => k >= 0); };
  const C = {
    pool, deck: S.deck ? idx(S.deck) : null, stack: true, filterKey: FILTER_KEY,
    title: `${PB_NAME}の デッキ`,
    auto: () => idx(autoCards(pool, 'normal', null)), // はじめは おまかせ（いちばん つよい 2色）
    save: () => { S.deck = C.deck.map((k) => pool[k]); save(); },
    ok: async () => {
      const D = deckInfo();
      if (!D.problems.length) return home();
      const v = await sheet(`<p>この デッキでは まだ バトルに 出られない。</p>${needList(D.problems)}<p class="zk-note">カードが たりない ときは、ショップで パックを あけよう。</p>`,
        [{ label: 'デッキを なおす', value: 'deck', kind: 'primary' }, { label: 'ホームへ', value: 0 }], { title: 'デッキ：まだ' });
      return v === 'deck' ? build() : home();
    },
    back: { label: 'ホームへ', go: home },
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
    ${ok ? `<p class="deckline">デッキ：${D.cols.map((c) => COLOR_NAME[c]).join('・') || 'むしょく'}　${D.points}点 / ${CAPACITY}点　カード${D.count}まい＋きほん${DECK_SIZE - D.count}まい</p>`
    : `<div class="pb-need"><p><b>デッキが まだ できて いない</b>ので、バトルに 出られない。</p>${needList(D.problems)}</div>`}
    <div class="row-btns"><button type="button" class="btn primary" data-go="fight" ${ok ? '' : 'disabled'}>たたかう</button><button type="button" class="btn" data-go="deck">${ok ? 'デッキを なおす' : 'デッキを くむ'}</button></div>
    <section class="st-ch">
      <h3>てきの じゅんばん<small class="st-guide">ぜんぶで ${PB_TOTAL}たい。すすむほど つよく なる</small></h3>
      <ol>${PB_TIERS.map(tierRow).join('')}${st.lap ? `<li><div class="st-ep open"><b>∞</b><span><i class="st-title">むげんの たたかい</i><small>${ruby(`${st.lap}しゅうめ：てきの クリーチャーは ＋${st.buff}/＋${st.buff}`)}</small></span><em>いま ここ</em></div></li>` : ''}</ol>
    </section>
    <button type="button" class="btn ghost" data-back="1">ホームへ</button>
  </main>`;
  app().onclick = (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.back) return home();
    if (b.dataset.go === 'deck') return build();
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
