// みならいの しけん（2026-10-30。docs/ROADMAP.md 10章）：ゲームを はじめた ときの 限定ルール
// テーロスと おなじ ように パックを 3つ あけて デッキを くみ、3階だての しけんの 塔を のぼる（階を クリアすると ごほうびパック）。
// パックの カードは 1年生の カードプール（data/pool1.js）。はじめは 単色（と 無色）だけで、課題 ①② の あとで 2色が 出て、③（神で とどめ）が ひらく。
// 課題 3つで マスマティックスウォーカーの 証 → テーロスの とうが ひらく（unlock.js）
import { BY_ID } from '../data/cards.js';
import { KIHON_NAME, KIHON_GUIDE, KIHON_FLOORS, KIHON_TASKS, GOD_THANKS, isGod2, kihonFloor, fillDeck } from '../data/kihon.js';
import { POOL1, POOL1_MONO, POOL1_MULTI } from '../data/pool1.js';
import { colorsOf } from '../engine/game.js';
import { openPack, buildDeck } from '../engine/run.js';
import { pick } from '../engine/rng.js';
import { startBattle } from './battle.js';
import { deckBuilder, letter } from './app.js';
import { gacha } from './gacha.js';
import { onPack } from './trophies.js';
import { zukanPack } from './zukan.js';
import { sheet, ruby, info, cardFace, COLOR_NAME } from './view.js';

const KEY = 'mtg-kihon';
const START_PACKS = 3;
// { run: { pool: [id…], deck: [id…] | null, floor: つぎの 階（0〜3。3 は のぼりきった） } | null,
//   tasks: { 課題の id: 1 }, multi: 2色が 出る, badge: 証を もらった, thanks: { 神の id: 1 }, cleared: { 階の id: 1 }（いちどでも クリア） }
const fresh = () => ({ run: null, tasks: {}, multi: 0, badge: false, thanks: {}, cleared: {} });
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) return { ...fresh(), ...v }; } catch { /* はじめから */ } return fresh(); };
let K = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(K)); } catch { /* 保存できなくても あそべる */ } };
const app = () => document.getElementById('app');

export const kihonBadge = () => !!load().badge;
const guide = () => info(BY_ID[KIHON_GUIDE]).name;
const talk = (who, lines) => `<div class="talk"><b class="talk-who">${ruby(who)}</b>${lines.map((l) => `<p>${ruby(l)}</p>`).join('')}</div>`;
// 2色が 出る（課題 ①② の あと）。③は それまで ひらかない
const MULTI_AFTER = ['deck', 'exact'];
const taskOpen = (t) => t.id !== 'god' || !!K.multi;
const runDone = () => !!K.run && K.run.floor >= KIHON_FLOORS.length;
const deckCols = () => [...new Set((K.run?.deck || []).map((id) => BY_ID[id]).filter(Boolean).flatMap(colorsOf))];
// パックに 入る カード：はじめは 単色だけ、課題 ①② の あとは 2色も
const packIds = () => (K.multi ? POOL1 : POOL1_MONO);
// ③が まだ なら、あたらしい しけんに 2色の パックが 1つ つく
const extraPacks = () => (K.multi && !K.tasks.god ? 1 : 0);
// 2色の パック：2色の 神 1まい（レアの わく）と 2色の アンコモン 1まい ＋ ふつうの 6まい
const GOD_BONUS = `<div class="bonus"><p class="bonus-title">${ruby('2色（しょく）の パック')}</p><span>${ruby('2色の 神（かみ）が かならず 1まい 入って いる')}</span></div>`;
function godPack() {
  const cards = openPack(Math.random, { ids: POOL1 });
  const multi = POOL1_MULTI.map((id) => BY_ID[id]);
  cards[7] = pick(Math.random, multi.filter((d) => isGod2(d.id)));
  cards[6] = pick(Math.random, multi.filter((d) => !isGod2(d.id)));
  return cards;
}

let BACK = null;
export function kihonMenu(back) {
  BACK = back || BACK;
  K = load();
  const done = KIHON_TASKS.filter((t) => K.tasks[t.id]).length;
  const R = K.run, going = R && !runDone();
  const floorRow = (f, i) => {
    const st = !going ? (R && runDone() ? 'done' : 'lock') : R.floor > i ? 'done' : R.floor === i ? 'open' : 'lock';
    return `<li><button type="button" class="st-ep ${st}" data-floor="${i}" ${st === 'open' ? '' : 'disabled'}>
      <b>${i + 1}</b><span><i class="st-title">${ruby(f.name.replace(/^\d階 /, ''))}</i><small>${ruby(`${f.foe}・ライフ ${f.life}`)}</small></span><em>${st === 'done' ? 'クリア' : st === 'open' ? 'いどむ' : 'まだ'}</em></button></li>`;
  };
  app().innerHTML = `<main class="story kihon">
    <p class="eyebrow">はじめての ぼうけん　課題（かだい） ${done} / ${KIHON_TASKS.length}</p>
    <h2>${ruby(KIHON_NAME)}</h2>
    ${talk(guide(), K.badge
    ? ['マスマティックスウォーカーの 証（あかし）を もつ きみなら、テーロスの とうにも いどめる。しけんは なんど うけても いいよ。']
    : ['パックを あけて デッキを くみ、3階（かい）だての しけんの とうを のぼろう。', '課題（かだい）を 3つ クリアすると、マスマティックスウォーカーの 証（あかし）を わたそう。'])}
    <section class="st-ch">
      <h3><span class="st-cname">${ruby('課題（かだい）')}</span></h3>
      <ol>${KIHON_TASKS.map((t, i) => (taskOpen(t)
    ? `<li><div class="st-ep ${K.tasks[t.id] ? 'done' : 'open'}"><b>${i + 1}</b><span><i class="st-title">${ruby(t.text)}</i></span><em>${K.tasks[t.id] ? 'クリア' : 'まだ'}</em></div></li>`
    : `<li><div class="st-ep lock"><b>${i + 1}</b><span><i class="st-title">？？？</i><small>${ruby('課題（かだい）①と ②を クリアすると ひらく')}</small></span><em>まだ</em></div></li>`)).join('')}</ol>
    </section>
    <section class="st-ch">
      <h3><span class="st-cname">${ruby(going ? `しけん（${R.floor + 1}階（かい）から）` : 'しけん')}</span></h3>
      <ol>
        ${going ? `<li><button type="button" class="st-ep open" data-k="deck"><b>${deckCols().map((c) => COLOR_NAME[c]).join('') || '−'}</b><span><i class="st-title">デッキを なおす</i><small>${ruby(`あけた カード ${R.pool.length}まいから 20まい・30点・2色まで`)}</small></span><em>${R.deck ? `${R.deck.length}まい` : 'まだ'}</em></button></li>`
    : `<li><button type="button" class="st-ep open" data-k="start"><b>＋</b><span><i class="st-title">${R ? 'あたらしい しけんを うける' : 'しけんを はじめる'}</i><small>${ruby(`パックを ${START_PACKS + extraPacks()}つ あけて デッキを くむ${K.multi ? '' : '（いまは 1色の カードだけ）'}`)}</small></span><em>${R ? 'のぼりきった！' : ''}</em></button></li>`}
        ${KIHON_FLOORS.map(floorRow).join('')}
      </ol>
      ${going ? '<p class="st-note"><button type="button" class="fine" data-k="restart">しけんを はじめから やりなおす（あたらしい パック）</button></p>' : ''}
    </section>
    <div class="row-btns"><button type="button" class="btn" data-k="back">タイトルへ</button></div>
  </main>`;
  app().onclick = async (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.k === 'back') return BACK();
    if (b.dataset.k === 'deck') return build();
    if (b.dataset.k === 'start') return startRun();
    if (b.dataset.k === 'restart') {
      const v = await sheet(talk(guide(), ['いまの カードと デッキを すてて、あたらしい パックで はじめから やりなおす？']), [{ label: 'やりなおす', value: 1 }, { label: 'やめる', value: 0, kind: 'primary' }], { title: 'やりなおす' });
      return v ? startRun() : kihonMenu();
    }
    if (b.dataset.floor) {
      const f = KIHON_FLOORS[+b.dataset.floor];
      const v = await sheet(talk(guide(), [f.intro]), [{ label: 'はじめる', value: 1, kind: 'primary' }, { label: 'もどる', value: 0 }], { title: ruby(f.name) });
      if (v) fight(f);
    }
  };
}

// ---- パック（テーロスの 冒険と おなじ ガチャの 演出）----
// カードは もちものに 入れてから 見せる（とちゅうで とじても なくならない）
function openOne(cards, eyebrow, bonus = '') {
  const owned = new Set(K.run.pool);
  K.run.pool.push(...cards.map((d) => d.id)); save();
  zukanPack(cards);
  return new Promise((res) => gacha(app, cards, { eyebrow, owned, bonus, done: () => { onPack(cards); res(); } }));
}
async function startRun() {
  const n = START_PACKS + extraPacks();
  K.run = { pool: [], deck: null, floor: 0 }; save();
  for (let i = 0; i < START_PACKS; i++) await openOne(openPack(Math.random, { ids: packIds() }), `パック ${i + 1} / ${n}`);
  if (n > START_PACKS) await openOne(godPack(), `パック ${n} / ${n}`, GOD_BONUS);
  build();
}

// ---- デッキ：あけた カードから（テーロスの 冒険と おなじ）----
function build() {
  const R = K.run, pool = R.pool;
  const idx = (ids) => { const used = new Set(); return ids.map((id) => pool.findIndex((x, k) => x === id && !used.has(k) && used.add(k))).filter((k) => k >= 0); };
  const C = {
    pool, deck: R.deck ? idx(R.deck) : null, filterKey: 'mtg-build-filter-k',
    title: `${KIHON_NAME}の デッキ`,
    auto: () => idx(buildDeck(pool.map((id) => BY_ID[id])).deck.filter((d) => !d.basic).map((d) => d.id)),
    save: () => { R.deck = C.deck.map((k) => pool[k]); save(); },
    ok: async () => {
      const first = !K.tasks.deck;
      K.tasks.deck = 1; save();
      if (first) await doneSheet(['deck']);
      kihonMenu();
    },
    back: { label: 'もどる', go: () => kihonMenu() },
  };
  deckBuilder(C);
}

function fight(f) {
  startBattle({
    deck: fillDeck(K.run.deck || []), floor: kihonFloor(f), diff: 'easy', floorName: f.name,
    quit: { label: `${KIHON_NAME}へ もどる`, note: 'たたかいを やめて もどる？ この 階（かい）から また いどめるよ。', go: () => kihonMenu() },
    onEnd: async (r) => {
      K = load();
      const got = [];
      const mark = (id) => { if (!K.tasks[id]) { K.tasks[id] = 1; got.push(id); } };
      if (r.exact > 0) mark('exact');
      if (r.win) {
        K.cleared[f.id] = 1;
        K.run.floor = Math.max(K.run.floor, KIHON_FLOORS.indexOf(f) + 1);
        if (K.multi && isGod2(r.finisher)) mark('god');
      }
      save();
      // とどめを さした 神からの ことば
      if (r.win && isGod2(r.finisher)) {
        const g = BY_ID[r.finisher];
        K.thanks[g.id] = 1; save();
        await sheet(`<div class="mini-list">${cardFace(g)}</div>${talk(info(g).name, [GOD_THANKS[g.id]])}`, [{ label: 'ありがとう！', value: 1, kind: 'primary' }], { title: ruby('神（かみ）からの ことば'), dismiss: false });
      }
      if (!r.win) await sheet(talk(guide(), ['おしかった！ デッキを なおして、もう いちど やって みよう。']), [{ label: 'もどる', value: 1, kind: 'primary' }], { title: 'まけて しまった', dismiss: false });
      if (got.length) await doneSheet(got);
      if (r.win && runDone()) {
        await sheet(talk(guide(), ['3階（かい）まで のぼりきった！ よく がんばったね。', K.badge ? 'しけんは なんど うけても いいよ。' : '課題（かだい）が のこって いたら、あたらしい しけんで ためして みよう。']), [{ label: 'もどる', value: 1, kind: 'primary' }], { title: ruby('しけん クリア！'), dismiss: false });
      } else if (r.win) {
        // ごほうびパック（テーロスの とうと おなじ）→ デッキを なおして つぎの 階へ
        await openOne(openPack(Math.random, { ids: packIds(), cleared: K.run.floor }), 'ごほうびパック', `<div class="bonus"><p class="bonus-title">${ruby(`${K.run.floor}階（かい） クリアの ごほうびパック`)}</p><span>${ruby('デッキを なおしてから つぎの 階（かい）へ')}</span></div>`);
        return build();
      }
      kihonMenu();
    },
  });
}

// 課題が できた。①② で 2色の カード、3つ そろったら 証
async function doneSheet(ids) {
  K = load();
  await sheet(`${ids.map((id) => `<p class="what">${ruby(`課題（かだい）クリア：${KIHON_TASKS.find((t) => t.id === id).text}`)}</p>`).join('')}<p>${ruby(`のこり ${KIHON_TASKS.filter((t) => !K.tasks[t.id]).length}こ`)}</p>`,
    [{ label: 'やった！', value: 1, kind: 'primary' }], { title: ruby('課題（かだい） クリア！'), dismiss: false });
  if (!K.multi && MULTI_AFTER.every((id) => K.tasks[id])) {
    K.multi = 1; save();
    const now = !!K.run && !runDone();
    await sheet(`${talk(guide(), ['よく できた！ ここからは パックから 2色の カードも 出るよ。', `2色の 神（かみ）も いる。神（かみ）で とどめを さす 課題（かだい）③が ひらいた。${now ? '2色の パックを 1つ あげよう。' : 'つぎの しけんで 2色の パックを あげよう。'}`])}<div class="mini-list">${POOL1_MULTI.map((id) => cardFace(BY_ID[id])).join('')}</div>`,
      [{ label: now ? 'パックを あける' : 'わかった', value: 1, kind: 'primary' }], { title: ruby('2色の カードが 出る！'), dismiss: false });
    if (now) await openOne(godPack(), '2色の パック', GOD_BONUS);
  }
  if (K.badge || !KIHON_TASKS.every((t) => K.tasks[t.id])) return;
  K.badge = true; save();
  await sheet(letter({ mark: '数', from: `${guide()}より`, head: 'マスマティックスウォーカーの 証（あかし）',
    body: ['課題（かだい）を 3つ ぜんぶ クリアした きみを、マスマティックスウォーカーと みとめる。', '数の 力（ちから）で せかいを わたる 者 ―― それが マスマティックスウォーカーだ。', 'テーロスの とうが きみを まって いる。さらなる 大ぼうけんへ！'],
    sign: guide() }), [{ label: '証（あかし）を うけとる', value: 1, kind: 'primary' }], { cls: 'parchment', dismiss: false });
}
