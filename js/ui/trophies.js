// トロフィー：あそんで できた ことを あつめる（ブロンズ・シルバー・ゴールド・プラチナ）。ブラウザに のこる
import { sfx } from './sfx.js';
import { ruby, esc } from './view.js';
import { trophyTickets } from './collection.js';

const KEY = 'mtg-trophies';
export const GRADES = { B: 'ブロンズ', S: 'シルバー', G: 'ゴールド', P: 'プラチナ' };
// 1〜5階の 敵（10しゅるい）
export const FOES = ['hydra', 'clock', 'horde', 'dragon', 'factory', 'slime', 'twins', 'xenagos', 'gorgon', 'erebos'];

// how は「どう すれば もらえるか」（画面に 出す。漢字は ふりがなつき）
export const TROPHIES = [
  { id: 'tutorial', g: 'B', name: 'はじめの いっぽ', how: 'チュートリアルを クリアする' },
  { id: 'floor1', g: 'B', name: 'とうに いどむ', how: 'ぼうけんで 1階を クリアする' },
  { id: 'exact1', g: 'B', name: 'はじめての ぴったり', how: 'てきの クリーチャーを ぴったりで たおす' },
  { id: 'clock12', g: 'B', name: 'ちょうど 12時', how: 'からくり 時計（とけい）とうに かつ' },
  { id: 'crowd10', g: 'B', name: 'なかまが いっぱい', how: '自分の クリーチャーを 10体 いじょう ならべる' },
  { id: 'fullDeck', g: 'B', name: 'ちょうど 30点', how: 'デッキの 点数を ちょうど 30点に して たたかう' },
  { id: 'legend', g: 'B', name: 'レジェンドを 引いた', how: 'パックから レジェンドを 引く' },
  { id: 'clearEasy', g: 'B', name: 'とうの てっぺん', how: '「かんたん」で 5階まで のぼりきる' },
  { id: 'online1', g: 'B', name: 'はじめての オンライン', how: 'オンライン バトルで たたかう' },
  { id: 'exact10', g: 'S', name: 'ぴったり 名人（めいじん）', how: '1回の ぼうけんで ぴったり 10回' },
  { id: 'exactTurn3', g: 'S', name: 'ぴったり 3れんぱつ', how: '1ターンに ぴったり 3回' },
  { id: 'life1', g: 'S', name: 'ぎりぎり セーフ', how: 'ライフが ちょうど 1 で たたかいに かつ' },
  { id: 'bigHit', g: 'S', name: '大（おお）こうげき', how: '1回の こうげきで てきの 本体に 20点 いじょう' },
  { id: 'power30', g: 'S', name: 'パワーの 山', how: '自分の クリーチャーの パワーの 合計（ごうけい）を 30 いじょうに する' },
  { id: 'surprise', g: 'S', name: '！？ サプライズ', how: 'サプライズ・レジェンド（「！？」の わく）を 引く' },
  { id: 'clearNormal', g: 'S', name: 'とうの 名人（めいじん）', how: '「ふつう」で 5階まで のぼりきる' },
  { id: 'pairs3', g: 'S', name: '色（いろ）いろ マスター', how: 'ちがう 色の くみあわせ 3つで とうを のぼりきる' },
  { id: 'onlineWin', g: 'S', name: 'オンラインで かった', how: 'オンライン バトルで かつ' },
  { id: 'exact100', g: 'G', name: 'ぴったり 100', how: 'ぴったりを ぜんぶで 100回（なんかいの ぼうけんでも よい）' },
  { id: 'allFoes', g: 'G', name: '10の てきを たおした', how: '1〜5階の 10しゅるいの てきに ぜんぶ かつ' },
  { id: 'noContinue', g: 'G', name: '一度（いちど）も まけない', how: 'コンティニューを つかわずに 5階まで のぼりきる' },
  { id: 'clearHard', g: 'G', name: 'とうの 王さま', how: '「むずかしい」で 5階まで のぼりきる' },
  { id: 'platinum', g: 'P', name: 'マスマティック・マスター', how: 'ほかの トロフィーを ぜんぶ あつめる' },
];
const BY = Object.fromEntries(TROPHIES.map((t) => [t.id, t]));

// { got: { id: 日時 }, exactTotal, beaten: [敵], pairs: [色の くみあわせ] }
function load() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && v.got) return v; } catch { /* こわれていたら はじめから */ }
  return { got: {}, exactTotal: 0, beaten: [], pairs: [] };
}
let T = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(T)); } catch { /* 保存できなくても あそべる */ } };

export const hasTrophy = (id) => !!T.got[id];
export const trophyCount = () => TROPHIES.filter((t) => T.got[t.id]).length;

// もらう（はじめての ときだけ お知らせ）。ほかが ぜんぶ そろったら プラチナ
export function award(id) {
  if (!BY[id] || T.got[id]) return false;
  T.got[id] = Date.now();
  pop(BY[id]);
  if (TROPHIES.every((t) => t.id === 'platinum' || T.got[t.id]) && !T.got.platinum) { T.got.platinum = Date.now(); pop(BY.platinum); }
  save();
  syncTrophyTickets();
  return true;
}
// こうちくモードの パックけん（ブロンズ 1・シルバー 2・ゴールド 3・プラチナ 5）。まえに もらった トロフィーの ぶんも ここで まとめて
export const syncTrophyTickets = () => trophyTickets(TROPHIES.filter((t) => T.got[t.id]));

// ---- できごと ごとに しらべる ----
// たたかいの おわり。r は battle.js の onEnd（life・floor・exactTurnMax・bigHit・maxPower・maxCreatures）
export function onBattle(r, o = {}) {
  if (r.exact > 0) award('exact1');
  if (r.exactTurnMax >= 3) award('exactTurn3');
  if (r.bigHit >= 20) award('bigHit');
  if (r.maxPower >= 30) award('power30');
  if (r.maxCreatures >= 10) award('crowd10');
  if (o.points === 30) award('fullDeck');
  if (o.online) return;
  T.exactTotal = (T.exactTotal || 0) + (r.exact || 0);
  if (T.exactTotal >= 100) award('exact100');
  if (o.advExact >= 10) award('exact10');
  if (r.win) {
    if (r.life === 1) award('life1');
    if (r.floor === 'clock') award('clock12');
    if (o.floorIdx === 0) award('floor1');
    if (r.floor && !T.beaten.includes(r.floor)) T.beaten.push(r.floor);
    if (FOES.every((f) => T.beaten.includes(f))) award('allFoes');
  }
  save();
}
// ぼうけんの おわり（のぼりきった とき）
export function onClear({ diff, continued, pair }) {
  award({ easy: 'clearEasy', normal: 'clearNormal', hard: 'clearHard' }[diff]);
  if (!continued) award('noContinue');
  if (pair && !T.pairs.includes(pair)) T.pairs.push(pair);
  if (T.pairs.length >= 3) award('pairs3');
  save();
}
export function onPack(cards) {
  if (cards.some((d) => d.rar === 'L')) award('legend');
  if (cards.surprise) award('surprise');
}
export function onOnline(r) {
  award('online1');
  if (r.win) award('onlineWin');
}

// ---- お知らせ（上から 出て、じゅんばんに きえる） ----
const queue = [];
function pop(t) {
  queue.push(t);
  if (queue.length === 1) next();
}
function next() {
  const t = queue[0]; if (!t) return;
  if (typeof document === 'undefined') { queue.shift(); return next(); }
  const el = document.createElement('div');
  el.className = `trophy-pop tg-${t.g}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `${cup(t.g)}<span><small>トロフィー かくとく！（${GRADES[t.g]}）</small><b>${ruby(t.name)}</b></span>`;
  document.body.append(el);
  try { sfx.trophy?.(); } catch { /* おとが でなくても よい */ }
  setTimeout(() => { el.classList.add('out'); }, 2300);
  setTimeout(() => { el.remove(); queue.shift(); next(); }, 2700);
}

// トロフィーの カップの え
export const cup = (g) => `<svg class="cup tg-${g}" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V17h3v2H8v-2h3v-2.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3zm0 4H6v1a2 2 0 0 0 1 1.7V7zm10 0v2.7A2 2 0 0 0 18 8V7h-1z"/><rect x="7" y="20" width="10" height="2" rx="1"/></svg>`;

// ---- トロフィーの 画面（タイトルから） ----
export function trophyScreen(app, back) {
  const n = trophyCount();
  const row = (t) => {
    const got = T.got[t.id];
    return `<li class="tro ${got ? 'got' : ''} tg-${t.g}">${cup(got ? t.g : 'X')}<span><b>${ruby(t.name)}</b><small>${ruby(t.how)}</small></span><em>${got ? new Date(got).toLocaleDateString('ja-JP') : 'まだ'}</em></li>`;
  };
  const progress = [
    ['ぴったり ぜんぶで', `${T.exactTotal || 0}回`],
    ['たおした てき（テーロス）', `${T.beaten.filter((f) => FOES.includes(f)).length} / ${FOES.length}しゅるい`],
    ['のぼりきった 色の くみあわせ', `${T.pairs.length}つ`],
  ];
  app().innerHTML = `<main class="trophies">
    <h2>トロフィー</h2>
    <p class="tro-count"><b>${n}</b> / ${TROPHIES.length}こ</p>
    <dl class="tro-prog">${progress.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${['P', 'G', 'S', 'B'].map((g) => `<section class="tro-sec"><h3>${cup(g)}${GRADES[g]}</h3><ul class="tro-list">${TROPHIES.filter((t) => t.g === g).map(row).join('')}</ul></section>`).join('')}
    <button type="button" class="btn primary" data-back="1">タイトルへ もどる</button>
  </main>`;
  app().onclick = (e) => { if (e.target.closest('[data-back]')) back(); };
}
