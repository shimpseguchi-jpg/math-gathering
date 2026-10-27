// ストーリーモード「せかいめぐり」（2026-10-26。docs/ROADMAP.md 9.2）
// ゲームの しくみを 1つずつ おぼえる チュートリアルの つづき。4章 × 3話。章ごとに プレインズウォーカーが 案内する
// 1話 ＝ 案内役の ことば → きまった デッキで 1戦（コーチの ことばが 出る。そうさは しぼらない）→ はじめて クリアで もんしょうポイント
import { BY_ID, BASICS } from '../data/cards.js';
import { pvp } from '../data/enemies.js';
import { colorsOf } from '../engine/game.js';
import { openPack, buildDeck, DECK_SIZE } from '../engine/run.js';
import { SAMPLE } from '../data/samples.js';
import { startBattle } from './battle.js';
import { tutorialDeck, tutorialSetup, TUTORIAL_DONE } from './tutorial.js';
import { cmdDeck, cmdSetup } from './commander.js';
import { addEmblemPoints } from './emblem.js';
import { awardMat, matName, CHAPTER_MAT } from './mats.js';
import { deckBuilder } from './app.js';
import { sheet, ruby, info, cardFace } from './view.js';

const KEY = 'mtg-story';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { done: {} }; } catch { return { done: {} }; } };
const save = (S) => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 保存できなくても あそべる */ } };
const app = () => document.getElementById('app');
const defs = (ids) => ids.map((id) => BY_ID[id]);

// デッキの 色の きほんカードで 20まいに する
function fill(ids) {
  const ds = defs(ids);
  const cols = [...new Set(ds.flatMap(colorsOf))];
  const order = cols.length ? cols : ['C'];
  for (let k = 0; ds.length < DECK_SIZE; k++) ds.push(BASICS[order[k % order.length]]);
  return ds;
}
// あいて（CPU）：よわい クリーチャーの デッキ。ライフは みじかめ
const foe = (name, ids, life, more = {}) => pvp({ deck: fill(ids), name, life, first: 'P', ...more });
// 手札・山札・マナゾーン・場を きめる（山札は 上から じゅんばん どおり）
const fixed = ({ hand, lib, mana = [], bf = [] }) => ({
  deck: defs([...hand, ...lib]),
  setup(s, E) {
    s.P.hand = hand.map((id) => E.card(BY_ID[id]));
    s.P.lib = lib.map((id) => E.card(BY_ID[id]));
    s.P.mana = mana.map((id) => ({ ...E.card(BY_ID[id]), tapped: false }));
    for (const id of bf) { const p = E.enter(s, 'P', BY_ID[id]); if (p) p.sick = false; }
  },
});
const turns = (n) => (s) => s.stats.playerTurns >= n;
const onField = (id) => (s) => s.P.bf.some((p) => p.def.id === id);
const inGy = (id) => (s) => s.P.gy.some((c) => c.def.id === id);

// ---- 章と 話 ----
export const CHAPTERS = [
  {
    id: 1, name: 'テーロス「はじめの いっぽ」', guide: 'PW06',
    eps: [
      { id: '1-1', title: 'くんれんじょう', learn: 'マナ・クリーチャー・こうげき・ブロック・ぴったり', kind: 'tutorial',
        intro: ['わたしは テフェリー。きみの たびの 案内役（あんないやく）だ。', 'まずは メレティスの くんれんじょうで、カードゲームの きほんを おぼえよう。'] },
      { id: '1-2', title: 'じゅもんで たたかう', learn: 'インスタント・ソーサリー・対象（たいしょう）・X', kind: 'battle',
        intro: ['クリーチャーの ほかに「じゅもん」が ある。', '使うと こうかが 出て、ぼちへ いく カードだ。てきの ゴブリンたちを じゅもんで たおそう。'],
        ...fixed({ hand: ['R04', 'R10', 'R09', 'B04', 'B04'], mana: ['B04', 'B04'], lib: ['R02', 'B04', 'R11', 'R09', 'B04', 'R12', 'B04', 'R04', 'B04', 'R02', 'B04', 'R10', 'B04', 'R12', 'B04'] }),
        floor: () => foe('ゴブリンの むれ', ['R01', 'R09', 'W17', 'R01', 'R09', 'W17', 'R02'], 14),
        coach: [
          { text: 'じゅもんは 2しゅるい。インスタントは てきの ターンでも 使える。ソーサリーは じぶんの ターンだけ。', next: true },
          { text: '「シヴの 炎（ほのお）」を タップして 使おう。てきの クリーチャーか てきを えらんで 2点！', done: inGy('R04') },
          { text: '「火炎（かえん）」は X点。X は じぶんで きめる（X ＋ 1マナ）。のこりの タフネスと ちょうど 同じに すると ぴったり！', done: inGy('R10') },
          { text: 'あとは じゆうに たたかおう。てきの ライフを 0に すれば かち！', next: true },
        ] },
      { id: '1-3', title: 'パックと デッキ', learn: 'パック・デッキ構築（こうちく）（キャパシティ 30点・2色まで）', kind: 'build',
        intro: ['ぼうけんでは パックを あけて、でた カードで デッキを くむ。', 'デッキは キャパシティ 30点まで、色は 2色まで。たりない ところは きほんカードが 入る。くんだら ハイドラと たたかおう。'],
        start: ['W02', 'W10', 'W11', 'W17', 'W01', 'W19', 'G01', 'G03', 'G10', 'G20', 'G04', 'G11'],
        floorId: 'hydra',
        coach: [{ text: 'ハイドラの かちかたは 右上の「かちかた」で 見られる。くんだ デッキで ためしてみよう！', next: true }] },
    ],
  },
  {
    id: 2, name: 'ラヴニカ「2つの 色」', guide: 'PW09',
    eps: [
      { id: '2-1', title: '2しょくの マナ', learn: '2色の カード・マナの 色', kind: 'battle',
        intro: ['おれは ラル・ザレック。ラヴニカの ギルドは 2つの 色で できて いる。', '2色の カードは、2つの 色の マナが いる。マナゾーンに おく 色を かんがえよう。'],
        ...fixed({ hand: ['RV17', 'R04', 'U01', 'B02', 'B04'], mana: ['B02', 'B04'], lib: ['RV18', 'U09', 'B02', 'R10', 'B04', 'RV17', 'U01', 'B02', 'R04', 'B04', 'RV18', 'B02', 'U09', 'B04', 'R10'] }),
        floor: () => foe('アゾリウスの 見習（みなら）い', ['W02', 'U18', 'W10', 'U01', 'W17', 'U18'], 14),
        coach: [
          { text: '「ちびドラゴノート」は 青と 赤の 2色。青の マナと 赤の マナが 1つずつ いる。', next: true },
          { text: 'マナの 色を そろえて、ちびドラゴノートを 出そう。', done: onField('RV17') },
          { text: 'じゅもんを 唱（とな）えると、ちびドラゴノートは ＋2/＋0。2つの 色を いっしょに 使うと つよく なる！', next: true },
        ] },
      { id: '2-2', title: 'プレインズウォーカー', learn: 'ちゅうせい・PWの のうりょく・PWを まもる', kind: 'battle',
        intro: ['わたしたち プレインズウォーカーも カードに なる。', 'ジェイスを 場に 出して おいた。ちゅうせい（数）を 使って のうりょくを 使おう。'],
        ...fixed({ hand: ['U01', 'U09', 'B02', 'B02', 'U20'], mana: ['B02', 'B02', 'B02'], bf: ['PW02'], lib: ['U02', 'B02', 'U12', 'B02', 'U01', 'U10', 'B02', 'U09', 'B02', 'U20', 'B02', 'U02', 'B02', 'U10', 'B02'] }),
        floor: () => foe('グルールの ならず者', ['G20', 'G10', 'R09', 'R02', 'G20', 'R09'], 16),
        coach: [
          { text: 'ジェイスは プレインズウォーカー。じぶんの ターンに 1回、のうりょくを 使える。', next: true },
          { text: 'ジェイスを タップして「＋1：カードを 1まい 引く」を 使おう。ちゅうせいが 1 ふえる。', done: (s) => s.P.bf.some((p) => p.def.id === 'PW02' && p.flags.turn.pw) },
          { text: 'てきは ジェイスも こうげきして くる。ちゅうせいが 0に なると いなく なる。クリーチャーで ブロックして まもろう！', next: true },
        ] },
      { id: '2-3', title: 'ボロスの 砦（とりで）', learn: 'ここまでの まとめ（2色の デッキ）', kind: 'battle',
        intro: ['ラヴニカの 塔（とう）の ギルドに いどもう。', 'デッキは 赤白。かちかたは たたかいの まえに 出る。'],
        deck: () => SAMPLE.RW.split(' ').map((id) => BY_ID[id]), floorId: 'boros',
        coach: [{ text: 'ここからは じぶんで かんがえよう。こまったら 右上の「かちかた」を 見てね。', next: true }] },
    ],
  },
  {
    id: 3, name: 'タルキール「3つの 色と 統率者（とうそつしゃ）」', guide: 'PW08',
    eps: [
      { id: '3-1', title: '旗（はた）と 3しょく', learn: '旗（はた）・3色の デッキ', kind: 'battle',
        intro: ['わしは サルカン。タルキールの 氏族（しぞく）は 3つの 色で たたかう。', 'デッキは ふつう 2色まで。でも 旗（はた）が あれば、その 3色に できる。'],
        ...fixed({ hand: ['TE01', 'G01', 'U01', 'B03', 'B04'], mana: ['B03', 'B02'], lib: ['TE04', 'R04', 'B03', 'G03', 'B02', 'U01', 'R10', 'B04', 'G10', 'B03', 'TE04', 'B02', 'R09', 'B03', 'G04'] }),
        floor: () => foe('アブザンの へいし', ['W17', 'W10', 'W02', 'W17', 'W10', 'W02'], 16),
        coach: [
          { text: '「ティムールの 旗（はた）」を 出そう。旗（はた）は 緑・青・赤の どれかの マナを 出す。', done: onField('TE01') },
          { text: '「雪角（ゆきづの）の 乗（の）り手」は 緑と 青と 赤の 3色。旗（はた）の マナも 使って 出そう！', done: onField('TE04') },
          { text: '3色の デッキは いろいろな カードが 使える。そのぶん マナの 色に 気を つけよう。', next: true },
        ] },
      { id: '3-2', title: '統率者（とうそつしゃ）', learn: 'とうそつりょういき・とうそつしゃぜい', kind: 'battle',
        intro: ['統率者（とうそつしゃ）は デッキとは べつの「とうそつりょういき」に いる。', 'マナが あれば いつでも 出せて、たおされても もどって くる。ティムールの 長（おさ）と いっしょに たたかおう。'],
        deck: () => cmdDeck(BY_ID.TE02), cmd: 'TE02',
        floor: () => foe('マルドゥの 見張（みは）り', ['W17', 'R09', 'W10', 'R02', 'W17', 'R09'], 18),
        coach: [
          { text: '右下の「とうそつしゃ」を タップすると、統率者（とうそつしゃ）を 出せる（マナが たりれば）。', done: (s) => (s.P.cmdCasts || 0) >= 1 },
          { text: '統率者（とうそつしゃ）が 出た！ たおされても とうそつりょういきに もどる。でも つぎは ＋2マナ（とうそつしゃぜい）。', next: true },
        ] },
      { id: '3-3', title: '龍王（りゅうおう）との たいけつ', learn: 'ここまでの まとめ（とうそつしゃせん）', kind: 'battle',
        intro: ['龍王（りゅうおう）も 統率者（とうそつしゃ）を つれて くる。', 'ジェスカイの 長と いっしょに、ここまで ならった ことを ぜんぶ 使おう！'],
        deck: () => cmdDeck(BY_ID.JE02), cmd: 'JE02', life: 20,
        floor: () => pvp({ deck: cmdDeck(BY_ID.WU07), ...cmdSetup(BY_ID.WU07), life: 20, name: '龍王（りゅうおう）オジュタイ（CPU）', first: 'P' }),
        coach: [{ text: 'あいても 統率者（とうそつしゃ）を 出して くる。ブロックと じゅもんで うまく まもろう。', next: true }] },
    ],
  },
  {
    id: 4, name: '番外編（ばんがいへん）「ためて 使う」', guide: 'PW10',
    eps: [
      { id: '4-1', title: '宝具（ほうぐ）', learn: 'NP を ためて 宝具（ほうぐ）・Fate/Grand Order', kind: 'battle',
        intro: ['わたしは カーン。べつの せかいの カードも ある。', 'サーヴァントは こうげきするたび NP が たまる。100 に なると 宝具（ほうぐ）が 使える。'],
        ...fixed({ hand: ['FG04', 'FG01', 'B04', 'B01', 'FG13'], mana: ['B04', 'B01', 'B04'], lib: ['R04', 'B01', 'FG04', 'B04', 'W02', 'B01', 'R10', 'FG13', 'B04', 'W19', 'B01', 'FG01', 'B04', 'R09', 'B01'] }),
        floor: () => foe('シャドウサーヴァント', ['G20', 'G10', 'G20', 'G10', 'G03', 'G20'], 18),
        coach: [
          { text: 'サーヴァントを 出して こうげきしよう。こうげきするたび NP が ふえる。', done: (s) => s.P.bf.some((p) => (p.np || 0) >= 100) },
          { text: 'NP が 100！ カードが 金色に 光って いる。タップして 宝具（ほうぐ）を 使おう！', next: true },
        ] },
      { id: '4-2', title: '戦技（せんぎ）', learn: 'せんぎポイント（崩壊（ほうかい）：スターレイル）', kind: 'battle',
        intro: ['スターレイルの キャラは「戦技（せんぎ）」を 使う。', 'せんぎポイントは みんなで 1つの 数。戦技（せんぎ）を 使うと 1 へり、こうげきすると 1 ふえる。'],
        ...fixed({ hand: ['SR02', 'SR28', 'SR25', 'B01', 'B04'], mana: ['B01', 'B04', 'B01'], lib: ['SR23', 'B01', 'SR28', 'B04', 'SR25', 'B01', 'SR02', 'B04', 'W02', 'B01', 'R09', 'B04', 'SR23', 'B01', 'R04'] }),
        floor: () => foe('反物質（はんぶっしつ）レギオン', ['R09', 'R02', 'R09', 'R02', 'R12'], 18),
        coach: [
          { text: '右下の「せんぎ」が せんぎポイント。キャラを タップして 戦技（せんぎ）を 使おう。', next: true },
          { text: 'ためるか 使うか。こうげきで ふやして、大事な ときに 使おう！', next: true },
        ] },
      { id: '4-3', title: 'ブレイク', learn: 'ブレイクの ゲージ・交代（ゼンレスゾーンゼロ）', kind: 'battle',
        intro: ['ゼンゼロの エージェントは、てきに ブレイクカウンターを ためる。', '10こ たまると ブレイク！ じぶんの ターンに 3つから えらんで 使える。', 'ただし ブレイクを 使えるのは、エージェント（ブレイクを もつ 伝説（でんせつ）の クリーチャー）が 場に いる とき だけ。'],
        ...fixed({ hand: ['ZZ01', 'ZZ08', 'ZZ29', 'B01', 'B03'], mana: ['B01', 'B03', 'B01'], lib: ['ZZ42', 'B03', 'ZZ14', 'B01', 'ZZ04', 'B03', 'ZZ20', 'B01', 'ZZ63', 'B03', 'ZZ19', 'B01', 'ZZ10', 'B03', 'ZZ67'] }),
        floor: () => foe('エーテリアスの むれ', ['R09', 'G20', 'R02', 'G10', 'R09', 'G20'], 22),
        coach: [
          { text: '右下の「ブレイク ○/10」が ゲージ。ブレイク N の エージェントが てきに ダメージを あたえると N こ たまる。', next: true },
          { text: '場に いる エージェントの 色でも たまる。白は ライフを えたとき、緑は ＋1/＋1カウンターを おいたとき。交代は 5こ！', done: (s) => (s.P.brkReady || 0) > 0 },
          { text: 'ブレイク OK！ ゲージを タップして、ぜんたい・たんたい・かいしゅう から えらぼう。', done: (s) => (s.stats.brk || 0) > 0 && !s.P.brkReady },
        ] },
    ],
  },
];
const ALL = CHAPTERS.flatMap((c) => c.eps.map((e) => ({ ...e, ch: c })));
const REWARD = 1, CHAPTER_REWARD = 2; // はじめて クリア：1話 ＋1、章の さいごの 話は ＋2

export function storyDone() {
  const S = load();
  // チュートリアル（1-1）は タイトルの チュートリアルを クリアしていれば クリア
  try { if (localStorage.getItem(TUTORIAL_DONE)) S.done['1-1'] = true; } catch { /* なし */ }
  return S;
}
const isOpen = (S, i) => i === 0 || !!S.done[ALL[i - 1].id];

export function storyMenu(back) {
  const S = storyDone();
  const n = ALL.filter((e) => S.done[e.id]).length;
  app().innerHTML = `<main class="story">
    <p class="eyebrow">ストーリー　${n} / ${ALL.length}話</p>
    <h2>せかいめぐり</h2>
    <p class="st-note">${ruby('ゲームの しくみを 1つずつ おぼえよう。章（しょう）ごとに プレインズウォーカーが 案内（あんない）して くれる。はじめて クリアすると もんしょうポイント。')}</p>
    ${CHAPTERS.map((c) => `<section class="st-ch">
      <h3><span class="st-guide">${ruby(info(BY_ID[c.guide]).name)}</span><span class="st-cname">${ruby(`${c.id}章　${c.name}`)}</span></h3>
      <ol>${c.eps.map((e) => { const i = ALL.findIndex((x) => x.id === e.id); const open = isOpen(S, i); return `<li><button type="button" class="st-ep ${S.done[e.id] ? 'done' : open ? 'open' : 'lock'}" data-ep="${e.id}" ${open ? '' : 'disabled'}>
        <b>${e.id}</b><span><i class="st-title">${ruby(e.title)}</i><small>${ruby(`まなぶ こと：${e.learn}`)}</small></span><em>${S.done[e.id] ? 'クリア' : open ? 'あそべる' : 'まだ'}</em></button></li>`; }).join('')}</ol>
    </section>`).join('')}
    <div class="row-btns"><button type="button" class="btn" data-st="back">タイトルへ</button></div>
  </main>`;
  app().onclick = async (e) => {
    if (e.target.closest('[data-st="back"]')) return back();
    const b = e.target.closest('[data-ep]'); if (!b || b.disabled) return;
    const ep = ALL.find((x) => x.id === b.dataset.ep);
    const v = await sheet(`${talk(info(BY_ID[ep.ch.guide]).name, ep.intro)}<p class="what">${ruby(`まなぶ こと：${ep.learn}`)}</p>`,
      [{ label: 'はじめる', value: 1, kind: 'primary' }, { label: 'もどる', value: 0 }], { title: `${ep.id}　${ruby(ep.title)}` });
    if (v) play(ep, back);
  };
}

// ストーリーの 会話：RPG の テキストウィンドウの ように 大きく（低学年が 読みやすい ように）
const talk = (who, lines) => `<div class="talk"><b class="talk-who">${ruby(who)}</b>${lines.map((l) => `<p>${ruby(l)}</p>`).join('')}</div>`;

function play(ep, back) {
  const guide = info(BY_ID[ep.ch.guide]).name;
  const again = () => storyMenu(back);
  const quit = { label: 'ストーリーへ もどる', note: 'ストーリーへ もどる？ この 話は あとで また はじめから できるよ。', go: again };
  const coach = ep.coach?.map((st) => ({ who: guide, ...st }));
  const onEnd = async (r) => {
    if (!r.win) {
      await sheet(talk(guide, ['おしかった！ もう いちど やって みよう。']), [{ label: 'ストーリーへ', value: 1, kind: 'primary' }], { title: 'まけて しまった', dismiss: false });
      return again();
    }
    const S = storyDone();
    const first = !S.done[ep.id];
    S.done[ep.id] = true; save(S);
    const last = ep.ch.eps[ep.ch.eps.length - 1].id === ep.id;
    const pts = first ? REWARD + (last ? CHAPTER_REWARD : 0) : 0;
    if (pts) addEmblemPoints(pts);
    const mat = last && awardMat(CHAPTER_MAT[ep.ch.id]) ? CHAPTER_MAT[ep.ch.id] : null; // 章を クリア：プレイマット
    await sheet(`${talk(guide, [last ? `${ep.ch.id}章 クリア！ よく がんばったね。` : 'よく できた！ つぎの 話へ すすもう。'])}${pts ? `<p class="what">もんしょうポイント ＋${pts}</p>` : ''}${mat ? `<p class="what mat-get"><span class="mat-sw" data-m="${mat}"></span><span>${ruby(`プレイマット「${matName(mat)}」を 手に 入れた！（せっていで かえられる）`)}</span></p>` : ''}`,
      [{ label: 'ストーリーへ', value: 1, kind: 'primary' }], { title: `${ep.id}　クリア！`, dismiss: false });
    return again();
  };
  if (ep.kind === 'tutorial') {
    return startBattle({ deck: tutorialDeck(), floorId: 'tutorial', diff: 'easy', floorName: 'メレティスの くんれんじょう', tutorial: true, setup: tutorialSetup, quit,
      onEnd: (r) => { if (r.win) { try { localStorage.setItem(TUTORIAL_DONE, '1'); } catch { /* なし */ } } return onEnd(r); } });
  }
  if (ep.kind === 'build') return buildEp(ep, coach, quit, onEnd);
  const deck = ep.deck ? (typeof ep.deck === 'function' ? ep.deck() : ep.deck) : null;
  const cmd = ep.cmd ? BY_ID[ep.cmd] : null;
  startBattle({
    deck, floor: ep.floor?.(), floorId: ep.floorId, diff: 'easy', floorName: `${ep.id} ${ep.title}`, setup: ep.setup, coach, quit, onEnd,
    ...(cmd ? { cmd, ...cmdSetup(cmd) } : {}), ...(ep.life ? { life: ep.life } : {}),
  });
}

// 1-3：きまった 12まい ＋ パック 1つ → デッキ構築 → ハイドラ
async function buildEp(ep, coach, quit, onEnd) {
  const pack = openPack(Math.random, { sets: [1] });
  await sheet(`<p>${ruby('パックから 出た カード（8まい）。さいしょの 12まいと あわせて デッキを くもう。')}</p><div class="mini-list">${pack.map((d) => cardFace(d)).join('')}</div>`,
    [{ label: 'デッキを くむ', value: 1, kind: 'primary' }], { title: 'パックを あけた！', dismiss: false });
  const pool = [...ep.start, ...pack.map((d) => d.id)];
  const auto = () => { const b = buildDeck(defs(pool)); const used = new Set(), sel = []; for (const d of b.deck) { if (d.basic) continue; const i = pool.findIndex((id, k) => id === d.id && !used.has(k)); if (i >= 0) { used.add(i); sel.push(i); } } return sel; };
  const C = {
    pool, deck: null, save: () => {}, auto, title: 'ストーリー：デッキを くむ', free: false,
    ok: () => startBattle({ deck: fill(C.deck.map((i) => pool[i])), floorId: ep.floorId, diff: 'easy', floorName: `${ep.id} ${ep.title}`, coach, quit, onEnd }),
  };
  await sheet(`<p>${ruby('タップで カードの せつめい → 入れる・はずす。上の メーターで キャパシティ（30点まで）と 色（2色まで）を 見よう。まよったら「おまかせ」。')}</p>`,
    [{ label: 'わかった', value: 1, kind: 'primary' }], { title: 'デッキの くみかた' });
  deckBuilder(C);
}

export const storyCount = () => ALL.filter((e) => storyDone().done[e.id]).length;
export const STORY_TOTAL = ALL.length;
