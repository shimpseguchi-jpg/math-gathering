// きほんセット（2026-10-30。docs/ROADMAP.md 10章）：ゲームを はじめた ときの 限定ルール
// カードプール（data/pool1.js）で デッキを くみ、3階だての 小さな 塔を のぼる。
// 課題 3つ（デッキを くむ・ぴったり・2色の 神で とどめ）で マスマティックスウォーカーの 証 → テーロスの とうが ひらく（unlock.js）
// はじめは 単色（と 無色）の カードだけ。課題 ①② の あとで 2色の カードが 出て、③（神で とどめ）が ひらく
import { BY_ID } from '../data/cards.js';
import { KIHON_NAME, KIHON_GUIDE, KIHON_FLOORS, KIHON_TASKS, GOD_THANKS, isGod2, kihonFloor, fillDeck } from '../data/kihon.js';
import { colorsOf } from '../engine/game.js';
import { buildDeck } from '../engine/run.js';
import { startBattle } from './battle.js';
import { deckBuilder, letter } from './app.js';
import { MAX_COPY } from './collection.js';
import { POOL1, POOL1_MONO, POOL1_MULTI } from '../data/pool1.js';
import { sheet, ruby, info, cardFace, COLOR_NAME } from './view.js';

const KEY = 'mtg-kihon';
// { deck: [id…] | null, cleared: { 階の id: 1 }, tasks: { 課題の id: 1 }, multi: 2色が 出た, badge: 証を もらった, thanks: { 神の id: 1 } }
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) return v; } catch { /* はじめから */ } return { deck: null, cleared: {}, tasks: {}, badge: false, thanks: {} }; };
let K = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(K)); } catch { /* 保存できなくても あそべる */ } };
const app = () => document.getElementById('app');

export const kihonBadge = () => !!load().badge;
const guide = () => info(BY_ID[KIHON_GUIDE]).name;
const talk = (who, lines) => `<div class="talk"><b class="talk-who">${ruby(who)}</b>${lines.map((l) => `<p>${ruby(l)}</p>`).join('')}</div>`;
const floorOpen = (i) => i === 0 || !!K.cleared[KIHON_FLOORS[i - 1].id];
// 2色が 出る（課題 ①② の あと）。③は それまで ひらかない
const MULTI_AFTER = ['deck', 'exact'];
const taskOpen = (t) => t.id !== 'god' || !!K.multi;
const deckCols = () => [...new Set((K.deck || []).map((id) => BY_ID[id]).filter(Boolean).flatMap(colorsOf))];

let BACK = null;
export function kihonMenu(back) {
  BACK = back || BACK;
  K = load();
  const done = KIHON_TASKS.filter((t) => K.tasks[t.id]).length;
  app().innerHTML = `<main class="story kihon">
    <p class="eyebrow">はじめての ぼうけん　課題（かだい） ${done} / ${KIHON_TASKS.length}</p>
    <h2>${ruby(KIHON_NAME)}</h2>
    ${talk(guide(), K.badge
    ? ['マスマティックスウォーカーの 証（あかし）を もつ きみなら、テーロスの とうにも いどめる。ここで デッキを ためしても いいよ。']
    : [`${KIHON_NAME}は、かんたんな カードだけで あそぶ ための ルールだ。`, '課題（かだい）を 3つ クリアすると、マスマティックスウォーカーの 証（あかし）を わたそう。'])}
    <section class="st-ch">
      <h3><span class="st-cname">${ruby('課題（かだい）')}</span></h3>
      <ol>${KIHON_TASKS.map((t, i) => (taskOpen(t)
    ? `<li><div class="st-ep ${K.tasks[t.id] ? 'done' : 'open'}"><b>${i + 1}</b><span><i class="st-title">${ruby(t.text)}</i></span><em>${K.tasks[t.id] ? 'クリア' : 'まだ'}</em></div></li>`
    : `<li><div class="st-ep lock"><b>${i + 1}</b><span><i class="st-title">？？？</i><small>${ruby('課題（かだい）①と ②を クリアすると ひらく')}</small></span><em>まだ</em></div></li>`)).join('')}</ol>
    </section>
    <section class="st-ch">
      <h3><span class="st-cname">デッキ</span></h3>
      <ol><li><button type="button" class="st-ep open" data-k="deck"><b>${K.deck ? deckCols().map((c) => COLOR_NAME[c]).join('') || 'むしょく' : '−'}</b><span><i class="st-title">${K.deck ? 'デッキを なおす' : 'デッキを くむ'}</i><small>${ruby(`${KIHON_NAME}の カード ${pool().length / MAX_COPY}しゅるいから 20まい・30点・2色まで${K.multi ? '' : '（いまは 1色の カードだけ）'}`)}</small></span><em>${K.deck ? `${K.deck.length}まい` : 'まだ'}</em></button></li></ol>
    </section>
    <section class="st-ch">
      <h3><span class="st-cname">${ruby('3階（かい）だての とう')}</span></h3>
      <ol>${KIHON_FLOORS.map((f, i) => { const open = floorOpen(i); return `<li><button type="button" class="st-ep ${K.cleared[f.id] ? 'done' : open ? 'open' : 'lock'}" data-floor="${i}" ${open ? '' : 'disabled'}>
        <b>${i + 1}</b><span><i class="st-title">${ruby(f.name.replace(/^\d階 /, ''))}</i><small>${ruby(`${f.foe}・ライフ ${f.life}`)}</small></span><em>${K.cleared[f.id] ? 'クリア' : open ? 'あそべる' : 'まだ'}</em></button></li>`; }).join('')}</ol>
    </section>
    <div class="row-btns"><button type="button" class="btn" data-k="back">タイトルへ</button></div>
  </main>`;
  app().onclick = async (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.k === 'back') return BACK();
    if (b.dataset.k === 'deck') return build();
    if (b.dataset.floor) {
      const f = KIHON_FLOORS[+b.dataset.floor];
      if (!K.deck) {
        const v = await sheet(talk(guide(), ['まずは デッキを くもう。']), [{ label: 'デッキを くむ', value: 1, kind: 'primary' }, { label: 'もどる', value: 0 }], { title: ruby(f.name) });
        return v ? build() : kihonMenu();
      }
      const v = await sheet(talk(guide(), [f.intro]), [{ label: 'はじめる', value: 1, kind: 'primary' }, { label: 'もどる', value: 0 }], { title: ruby(f.name) });
      if (v) fight(f);
    }
  };
}

// デッキを くむ：プールの カードを 4まいずつ（こうちくモードの ルール「きほんセット」と おなじ。2色は 課題 ①② の あと）
const pool = () => (K.multi ? POOL1 : POOL1_MONO).filter((id) => BY_ID[id]).flatMap((id) => Array(MAX_COPY).fill(id));
function build() {
  const pool0 = pool();
  const idx = (ids) => { const used = new Set(); return ids.map((id) => pool0.findIndex((x, k) => x === id && !used.has(k) && used.add(k))).filter((k) => k >= 0); };
  const C = {
    pool: pool0, deck: K.deck ? idx(K.deck) : null, stack: true, filterKey: 'mtg-build-filter-k',
    title: `${KIHON_NAME}の デッキ`,
    auto: () => idx(buildDeck(pool0.map((id) => BY_ID[id])).deck.filter((d) => !d.basic).map((d) => d.id)),
    save: () => { K.deck = C.deck.map((k) => pool0[k]); save(); },
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
    deck: fillDeck(K.deck), floor: kihonFloor(f), diff: 'easy', floorName: f.name,
    quit: { label: `${KIHON_NAME}へ もどる`, note: 'たたかいを やめて もどる？', go: () => kihonMenu() },
    onEnd: async (r) => {
      K = load();
      const fresh = [];
      const mark = (id) => { if (!K.tasks[id]) { K.tasks[id] = 1; fresh.push(id); } };
      if (r.exact > 0) mark('exact');
      if (r.win) {
        K.cleared[f.id] = 1;
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
      if (fresh.length) await doneSheet(fresh);
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
    await sheet(`${talk(guide(), ['よく できた！ ここからは 2色の カードも つかえる。', '2色の 神（かみ）も いるよ。神（かみ）で とどめを さす 課題（かだい）③が ひらいた。デッキを なおして ためして みよう。'])}<div class="mini-list">${POOL1_MULTI.map((id) => cardFace(BY_ID[id])).join('')}</div>`,
      [{ label: 'わかった', value: 1, kind: 'primary' }], { title: ruby('2色の カードが 出た！'), dismiss: false });
  }
  if (K.badge || !KIHON_TASKS.every((t) => K.tasks[t.id])) return;
  K.badge = true; save();
  await sheet(letter({ mark: '数', from: `${guide()}より`, head: 'マスマティックスウォーカーの 証（あかし）',
    body: ['課題（かだい）を 3つ ぜんぶ クリアした きみを、マスマティックスウォーカーと みとめる。', '数の 力（ちから）で せかいを わたる 者 ―― それが マスマティックスウォーカーだ。', 'テーロスの とうが きみを まって いる。さらなる 大ぼうけんへ！'],
    sign: guide() }), [{ label: '証（あかし）を うけとる', value: 1, kind: 'primary' }], { cls: 'parchment', dismiss: false });
}
