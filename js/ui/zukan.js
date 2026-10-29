// ずかん（REQUIREMENTS 8.1）：冒険を またいで のこる。カード・てき・アーキタイプ・きろく
// 集めた カードを 見る だけで、つぎの 冒険が 楽に なる ことは ない
import { SETS, BY_ID } from '../data/cards.js';
import { colorsOf } from '../engine/game.js';
import { cardFace, detail, sheet, esc, ruby, byColorCost, colorClass, COLOR_NAME } from './view.js';
import { DEV } from './settings.js';

const KEY = 'mtg-zukan';
// { cards: { id: { t: はじめて 出た 日時, n: 出た 回数, sp: サプライズで 出た } }, foes: { id: たおした 回数 }, pairs: { 色: クリア回数 }, clears: { diff: 回数 }, won: { 'せかい:diff': 回数 }, adventures, exactTotal, runs: [上位10] }
function load() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && v.cards) { if (!v.won) v.won = Object.fromEntries(Object.entries(v.clears || {}).map(([d, n]) => [`theros:${d}`, n])); return v; } } catch { /* こわれていたら はじめから */ } // won が ない ふるい きろくは テーロス（ラヴニカが できる まえ）
  return { cards: {}, foes: {}, pairs: {}, clears: {}, won: {}, adventures: 0, exactTotal: 0, runs: [] };
}
let Z = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(Z)); } catch { /* 保存できなくても あそべる */ } };

// スコア ＝ とどいた 階 × 100 ＋ ぴったり × 10（子どもが 自分で けいさん できる）
export const scoreOf = (reached, exact) => reached * 100 + exact * 10;

// ---- できごと ----
export function zukanPack(cards) {
  const now = Date.now();
  cards.forEach((d, i) => {
    const e = Z.cards[d.id] || (Z.cards[d.id] = { t: now, n: 0 });
    e.n++;
    if (cards.surprise && i === 0) e.sp = true; // 「！？」の わくから 出た レジェンド
  });
  save();
}
// たたかいの おわり（エレボスは だんかい ごと）
export function zukanBattle(r) {
  const add = (id) => { Z.foes[id] = (Z.foes[id] || 0) + 1; };
  if (r.floor === 'erebos') { const n = r.win ? 3 : Math.max(0, (r.phase || 1) - 1); for (let k = 1; k <= n; k++) add(`erebos${k}`); }
  else if (r.win && r.floor) add(r.floor);
  Z.exactTotal += r.exact || 0;
  save();
}
// 冒険の おわり
export function zukanRun({ diff, plane = 'theros', reached, exact, pair, win }) {
  Z.adventures++;
  if (win) { Z.clears[diff] = (Z.clears[diff] || 0) + 1; Z.won[`${plane}:${diff}`] = (Z.won[`${plane}:${diff}`] || 0) + 1; if (pair) Z.pairs[pair] = (Z.pairs[pair] || 0) + 1; }
  Z.runs.push({ t: Date.now(), diff, reached, exact, pair, win: !!win, score: scoreOf(reached, exact) });
  Z.runs = Z.runs.sort((a, b) => b.score - a.score || a.t - b.t).slice(0, 10);
  save();
}
// せかい・むずかしさ ごとの クリア回数と、ぼうけんの 回数（unlock.js の ひらく じゅんばん）
export const clearedCount = (plane, diff) => Z.won[`${plane}:${diff}`] || 0;
export const adventuresCount = () => Z.adventures || 0;
export const zukanCount = () => Object.keys(Z.cards).filter((id) => BY_ID[id] && !BY_ID[id].basic).length;

// ---- 画面 ----
const FOES = [
  ['hydra', '1階 ハイドラ'], ['clock', '1階 からくり 時計（とけい）とう'], ['horde', '2階 たいぐん'], ['dragon', '2階 ドラゴンの たからの 山'],
  ['factory', '3階 ゴーレムの 工場（こうじょう）'], ['slime', '3階 ふえる スライム'], ['twins', '3階 ふたごの きょじん'],
  ['xenagos', '4階 ゼナゴス'], ['gorgon', '4階 メドゥーサの 石の 庭（にわ）'],
  ['erebos1', '5階 エレボス（1だんかいめ）'], ['erebos2', '5階 エレボス（2だんかいめ）'], ['erebos3', '5階 エレボス（3だんかいめ）'],
  // ラヴニカの 塔（docs/RAVNICA.md）
  ['boros', '1階 ボロスの オレリア'], ['selesnya', '1階 セレズニアの トロスターニ'], ['simic', '1階 シミックの ヴォレル'],
  ['izzet', '2階 イゼットの ニヴ＝ミゼット'], ['golgari', '2階 ゴルガリの ジャラド'], ['azorius', '2階 アゾリウスの イスペリア'],
  ['rakdos', '3階 ラクドス'], ['orzhov', '3階 オルゾフの テイサ'], ['gruul', '4階 グルールの ボルボルグミ'], ['dimir', '4階 ディミーアの ラザーヴ'],
  ['jace', '5階 ギルドパクトの ジェイス'],
];
// 2色の アーキタイプ（REQUIREMENTS 4.2・SET3.md 1.1）。キーは W・U・K・R・G の じゅん
const ARCH = [
  ['WG', '白緑', '召集（しょうしゅう）'], ['WU', '青白', '飛行（ひこう）と わりふる'], ['WR', '赤白', '大隊（だいたい）'], ['UR', '赤青', 'X の 呪文（じゅもん）と 果敢（かかん）'],
  ['RG', '緑赤', '獰猛（どうもう）'], ['UG', '青緑', '＋1/＋1カウンターと マナ'], ['WK', '白黒', '強請（ゆすり）と 来世（らいせ）'], ['UK', '青黒', '昂揚（こうよう）と 忍術（にんじゅつ）'],
  ['KR', '黒赤', '貪食（どんしょく）と マッドネス'], ['KG', '黒緑', '−1/−1カウンター'],
];
const DIFF = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' };
const day = (t) => new Date(t).toLocaleDateString('ja-JP');

// まだの カード：色（帯と まる）と レアリティだけ
const unknown = (d) => `<div class="card ${colorClass(d)} zk-unknown"><div class="card-top"><span class="cost">？</span><span class="zk-dots">${colorsOf(d).map((c) => `<i class="m-${c}"></i>`).join('')}</span><span class="rar r-${d.rar}">${esc(d.rar || '')}</span></div><div class="zk-q">？</div></div>`;

export function zukanScreen(app, back) {
  let tab = 'cards';
  const sets = SETS.filter((x) => (x.released || DEV) && !x.raid);
  let setId = sets[0].id;
  const draw = () => {
    const total = SETS.filter((x) => x.released).reduce((t, x) => t + x.cards.length, 0);
    const got = SETS.filter((x) => x.released).reduce((t, x) => t + x.cards.filter((d) => Z.cards[d.id]).length, 0);
    let body = '';
    if (tab === 'cards') {
      const x = sets.find((y) => y.id === setId);
      const list = [...x.cards].filter((d) => !d.noPack).sort(byColorCost);
      const n = list.filter((d) => Z.cards[d.id]).length;
      body = `<div class="zk-sets">${sets.map((y) => `<button type="button" class="chip ${y.id === setId ? 'on' : ''}" data-set="${y.id}">${ruby(y.name.replace(/「.*$/, ''))}${y.released ? '' : '<small>開発中</small>'}</button>`).join('')}</div>
        <p class="zk-count">${ruby(x.name)}：<b>${n}</b> / ${list.length}しゅるい</p>
        <div class="zk-grid">${list.map((d) => (Z.cards[d.id] ? `<button type="button" class="zk-card" data-id="${esc(d.id)}">${cardFace(d)}${Z.cards[d.id].sp ? '<span class="zk-sp">！？</span>' : ''}</button>` : `<div class="zk-card">${unknown(d)}</div>`)).join('')}</div>`;
    } else if (tab === 'foes') {
      body = `<ul class="zk-list">${FOES.map(([id, name]) => `<li class="${Z.foes[id] ? 'got' : ''}"><b>${Z.foes[id] ? ruby(name) : '？？？'}</b><em>${Z.foes[id] ? `${Z.foes[id]}回 たおした` : 'まだ'}</em></li>`).join('')}</ul>`;
    } else if (tab === 'arch') {
      body = `<p class="zk-note">その 2色の デッキで とうを のぼりきると しるしが つく。</p><ul class="zk-list">${ARCH.map(([k, name, theme]) => `<li class="${Z.pairs[k] ? 'got' : ''}"><span class="zk-pips">${[...k].map((c) => `<i class="m-${c}"></i>`).join('')}</span><b>${esc(name)}<small>${ruby(theme)}</small></b><em>${Z.pairs[k] ? `★ ${Z.pairs[k]}回 クリア` : 'まだ'}</em></li>`).join('')}</ul>`;
    } else {
      const clears = Object.values(Z.clears).reduce((t, v) => t + v, 0);
      body = `<dl class="zk-stats">
          <div><dt>ぼうけん</dt><dd>${Z.adventures}<small>回</small></dd></div>
          <div><dt>クリア</dt><dd>${clears}<small>回</small></dd></div>
          <div><dt>ぴったり ぜんぶで</dt><dd>${Z.exactTotal}<small>回</small></dd></div>
        </dl>
        <p class="zk-note">クリア：${Object.entries(DIFF).map(([k, v]) => `${v} ${Z.clears[k] || 0}回`).join('・')}</p>
        <h3 class="zk-h">さいこう スコア</h3>
        <p class="zk-note">スコア ＝ とどいた 階 × 100 ＋ ぴったり × 10</p>
        ${Z.runs.length ? `<ol class="zk-runs">${Z.runs.map((r) => `<li><b>${r.score}</b><span>${DIFF[r.diff] || ''}・${r.win ? 'クリア' : `${r.reached}階まで`}・ぴったり ${r.exact}回${r.pair ? `・${[...r.pair].map((c) => COLOR_NAME[c]).join('')}` : ''}</span><em>${day(r.t)}</em></li>`).join('')}</ol>` : '<p class="zk-note">まだ ない。ぼうけんを おえると のこる。</p>'}`;
    }
    app().innerHTML = `<main class="zukan">
      <h2>ずかん</h2>
      <p class="zk-total">あつめた カード <b>${got}</b> / ${total}しゅるい</p>
      <div class="zk-tabs" role="tablist">${[['cards', 'カード'], ['foes', 'てき'], ['arch', 'アーキタイプ'], ['rec', 'きろく']].map(([k, l]) => `<button type="button" role="tab" class="chip ${tab === k ? 'on' : ''}" aria-selected="${tab === k}" data-tab="${k}">${l}</button>`).join('')}</div>
      ${body}
      <button type="button" class="btn primary" data-back="1">タイトルへ もどる</button>
    </main>`;
  };
  draw();
  app().onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.back) return back();
    if (b.dataset.tab) { tab = b.dataset.tab; return draw(); }
    if (b.dataset.set) { setId = +b.dataset.set; return draw(); }
    if (b.dataset.id) {
      const z = Z.cards[b.dataset.id];
      await sheet(`${detail(BY_ID[b.dataset.id])}<p class="zk-note">はじめて 出た 日：${day(z.t)}・${z.n}まい 出た${z.sp ? '・サプライズで 出た' : ''}</p>`, [{ label: 'とじる', value: 0 }]);
    }
  };
}
