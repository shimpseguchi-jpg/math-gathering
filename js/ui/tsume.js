// つめマスの 画面（2026-11-11。docs/TSUME.md）：「この ターンで かて」。問題の 一覧 → たたかい → せいかい・ざんねん（ヒント・こたえ）
// 問題は js/data/tsume.js（tools/gen_tsume.mjs が つくって、ぜんぶ とける ことを たしかめた もの）
import { TSUME, TSUME_LEVELS } from '../data/tsume.js';
import { tsumeFloor, tsumeDeck, tsumeSetup } from '../engine/tsume.js';
import { startBattle } from './battle.js';
import { sheet, ruby } from './view.js';
import { addEmblemPoints } from './emblem.js';
import { unlockAll } from './settings.js';

const KEY = 'mtg-tsume';
// done：{ 問題の id: ほしの 数（1〜3） }、tries：{ id: しっぱいした 回数 }、daily：{ 日づけ: 1 }、lvPaid：{ レベル: 1 }、seen：あそびかたを 見た
const load = () => { try { return { done: {}, tries: {}, daily: {}, lvPaid: {}, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { done: {}, tries: {}, daily: {}, lvPaid: {} }; } };
const save = (S) => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 保存できなくても あそべる */ } };
const app = () => document.getElementById('app');

const LEVELS = Object.keys(TSUME_LEVELS).map(Number);
const ofLv = (lv) => TSUME.filter((p) => p.lv === lv);
export const LV_OPEN = 6; // まえの レベルを 6問 クリアすると つぎの レベルが ひらく
export const LV_REWARD = 2, DAILY_REWARD = 1; // もんしょうポイント：レベルを ぜんぶ クリア・きょうの 1問
const lvOpen = (S, lv) => lv === 1 || unlockAll() || ofLv(lv - 1).filter((p) => S.done[p.id]).length >= LV_OPEN;
export const tsumeCount = () => { const S = load(); return TSUME.filter((p) => S.done[p.id]).length; };
export const tsumeTotal = () => TSUME.length;

// きょうの 1問：日づけで きまる（みんな おなじ）。ひらいて いる レベルの 中から
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hash = (str) => { let h = 2166136261; for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function dailyPuzzle(S) {
  const pool = TSUME.filter((p) => lvOpen(S, p.lv));
  return pool[hash(`tsume:${today()}`) % pool.length];
}
export const tsumeDailyDone = () => !!load().daily[today()];

// ヒント：こたえの 考えかた（tags）から
const HINTS = {
  pin: 'てきの クリーチャーを こうげきすると、その てきは ほかの ブロックに 出られない。小さい クリーチャーで じゃまな てきを おさえよう。',
  charge: 'てふだの カードを 1まい マナゾーンに おくと、マナが 1つ ふえる（1ターンに 1まい）。どの カードを マナに するかが だいじ。',
  trick: '「ダメージ！」の まえ、ブロックが きまった あとに 使える カードが ある。ブロックされなかった クリーチャーを 強く しよう。',
  x: 'X の カードは、はらう マナで 数が きまる。ほかの カードに つかう マナと あわせて 考えよう。',
  burnC: 'じゅもんで てきの クリーチャーを たおすと、ブロックされなく なる。',
  tap: 'タップした てきは ブロック できない。',
  bite: 'じぶんの クリーチャーの 力で、てきの クリーチャーを たおせる カードが ある。',
  haste: '速攻（そっこう）の クリーチャーは、出した ターンに すぐ こうげき できる。',
  fly: '飛行（ひこう）の クリーチャーは、飛行（ひこう）か 到達（とうたつ）の てきに しか ブロックされない。',
};
const BASE_HINT = 'こうげきが 本体（ほんたい）に とどく クリーチャーの パワーと、じゅもんの ダメージを たして、てきの ライフと くらべよう。';
const hintOf = (pz, k) => [...pz.tags.map((t) => HINTS[t]).filter(Boolean), BASE_HINT][Math.min(k, pz.tags.length)];

const stars = (n) => `<span class="tm-stars" aria-label="ほし ${n}こ">${'★'.repeat(n)}${'☆'.repeat(3 - n)}</span>`;
const RULES = [
  'つめマスは、きまった 場と てふだで「この ターンの うちに かつ」パズル。',
  'てきの ライフを ちょうど 0に できる 手じゅんが かならず ある。',
  'てきの クリーチャーは、本体（ほんたい）への こうげきを ブロックして くる（こうげきして きた クリーチャーを たおせるか、じぶんが たおされない ときだけ）。',
  'てきの クリーチャーを こうげきすると、その てきは ほかの ブロックに 出られない。',
  'ターンを おわると まけ。なんどでも やりなおせる。',
];
const rulesSheet = () => sheet(`<ol class="tm-rules">${RULES.map((r) => `<li>${ruby(r)}</li>`).join('')}</ol>`, [{ label: 'わかった', value: 1, kind: 'primary' }], { title: 'つめマスの あそびかた' });

export async function tsumeMenu(back) {
  const S = load();
  const n = TSUME.filter((p) => S.done[p.id]).length;
  const dp = dailyPuzzle(S), dd = !!S.daily[today()];
  app().innerHTML = `<main class="story tsume">
    <p class="eyebrow">つめマス　${n} / ${TSUME.length}問</p>
    <h2>つめマス</h2>
    <p class="st-note">${ruby('この ターンの うちに、てきの ライフを 0に しよう。たし算・ひき算で「ちょうど」を さがす パズル。')}</p>
    <button type="button" class="tm-daily ${dd ? 'done' : ''}" data-tm="${dp.id}" data-daily="1"><b>きょうの 1問</b><span>${ruby(`レベル ${dp.lv}「${TSUME_LEVELS[dp.lv]}」`)}</span><em>${dd ? 'クリア ずみ' : `もんしょうポイント ＋${DAILY_REWARD}`}</em></button>
    ${LEVELS.map((lv) => { const ps = ofLv(lv), open = lvOpen(S, lv), c = ps.filter((p) => S.done[p.id]).length; return `<section class="st-ch tm-lv ${open ? '' : 'lock'}">
      <h3><span class="st-guide">レベル ${lv}</span><span class="st-cname">${ruby(TSUME_LEVELS[lv])}　${c} / ${ps.length}${c === ps.length ? '　ぜんぶ クリア！' : ''}</span></h3>
      ${open ? `<div class="tm-grid">${ps.map((p, i) => `<button type="button" class="tm-pz ${S.done[p.id] ? 'done' : ''}" data-tm="${p.id}" aria-label="${lv}の ${i + 1}${S.done[p.id] ? '（クリア）' : ''}"><b>${i + 1}</b>${S.done[p.id] ? stars(S.done[p.id]) : '<span class="tm-stars">　</span>'}</button>`).join('')}</div>`
        : `<p class="st-note">${ruby(`レベル ${lv - 1} を ${LV_OPEN}問 クリアすると ひらく。`)}</p>`}
    </section>`; }).join('')}
    <div class="row-btns"><button type="button" class="btn" data-tmx="rules">あそびかた</button><button type="button" class="btn" data-tmx="back">タイトルへ</button></div>
  </main>`;
  app().onclick = (e) => {
    const x = e.target.closest('[data-tmx]');
    if (x?.dataset.tmx === 'back') return back();
    if (x?.dataset.tmx === 'rules') return rulesSheet();
    const b = e.target.closest('[data-tm]'); if (!b) return;
    play(TSUME.find((p) => p.id === b.dataset.tm), back, { daily: !!b.dataset.daily });
  };
  if (!S.seen) { S.seen = 1; save(S); await rulesSheet(); }
}

// 1問 あそぶ。o.daily：きょうの 1問、o.retry：やりなおし（かちかたの まどは 出さない）、o.help：ヒント・こたえを 見た（ほしが へる）
function play(pz, back, o = {}) {
  const again = () => tsumeMenu(back);
  const floor = tsumeFloor(pz);
  const left = { n: pz.life };
  const endTurn0 = floor.endTurn;
  floor.endTurn = (s, E) => { left.n = s.E.life; endTurn0(s, E); }; // まけた とき、のこった ライフを 見せる
  const name = `つめマス ${pz.id}`;
  startBattle({
    deck: tsumeDeck(pz), floor, setup: tsumeSetup(pz), diff: 'normal', floorName: name, skipGoal: !!o.retry,
    quit: { label: 'つめマスへ もどる', note: 'この 問題を やめて、つめマスの 一覧（いちらん）へ もどる？', go: again },
    onEnd: (r) => (r.win ? won(pz, back, o) : lost(pz, back, o, left.n)),
  });
}

async function won(pz, back, o) {
  const S = load();
  const fails = S.tries[pz.id] || 0;
  const st = o.help === 'ans' ? 1 : o.help || fails >= 3 ? 2 : 3; // こたえを 見た：★、ヒントを 見た・3回 いじょう しっぱい：★★
  const first = !S.done[pz.id];
  S.done[pz.id] = Math.max(S.done[pz.id] || 0, st);
  let pts = 0;
  const notes = [];
  if (o.daily && !S.daily[today()]) { S.daily[today()] = 1; pts += DAILY_REWARD; notes.push(`きょうの 1問 クリア！ もんしょうポイント ＋${DAILY_REWARD}`); }
  if (first && !S.lvPaid[pz.lv] && ofLv(pz.lv).every((p) => S.done[p.id])) { S.lvPaid[pz.lv] = 1; pts += LV_REWARD; notes.push(`レベル ${pz.lv} を ぜんぶ クリア！ もんしょうポイント ＋${LV_REWARD}`); }
  const opened = first && pz.lv < LEVELS[LEVELS.length - 1] && ofLv(pz.lv).filter((p) => S.done[p.id]).length === LV_OPEN && !unlockAll();
  if (opened) notes.push(`レベル ${pz.lv + 1}「${TSUME_LEVELS[pz.lv + 1]}」が ひらいた！`);
  save(S);
  if (pts) addEmblemPoints(pts);
  const list = ofLv(pz.lv), next = list[list.findIndex((p) => p.id === pz.id) + 1] || (lvOpen(S, pz.lv + 1) ? ofLv(pz.lv + 1)[0] : null);
  const v = await sheet(`<p class="big-result win">せいかい！</p><p class="tm-result">${stars(st)}</p>
    <p class="what">${ruby(`てきの ライフ ${pz.life} を ちょうど 0に した。`)}</p>${notes.map((t) => `<p class="what">${ruby(t)}</p>`).join('')}`,
    [...(next ? [{ label: 'つぎの 問題へ', value: 'next', kind: 'primary' }] : []), { label: 'もう いちど', value: 'again' }, { label: 'つめマスへ', value: 'menu', kind: next ? '' : 'primary' }], { title: `つめマス ${pz.id}`, dismiss: false });
  if (v === 'next') return play(next, back);
  if (v === 'again') return play(pz, back, { retry: true });
  return tsumeMenu(back);
}

async function lost(pz, back, o, leftLife) {
  const S = load();
  S.tries[pz.id] = (S.tries[pz.id] || 0) + 1;
  save(S);
  const fails = S.tries[pz.id];
  let help = o.help || null, hintN = o.hintN || 0;
  for (;;) {
    const v = await sheet(`<p class="big-result lose">ざんねん…</p>
      <p class="what">${ruby(leftLife > 0 ? `てきの ライフが ${leftLife} のこった（${pz.life} − ${pz.life - leftLife} ＝ ${leftLife}）。あと ${leftLife}点！` : 'この ターンで かてなかった。')}</p>`,
      [{ label: 'もう いちど', value: 'again', kind: 'primary' }, { label: hintN ? 'つぎの ヒント' : 'ヒントを 見る', value: 'hint' },
        ...(fails >= 2 ? [{ label: 'こたえを 見る', value: 'ans', note: 'ほしは 1こに なる' }] : []), { label: 'つめマスへ', value: 'menu' }], { title: `つめマス ${pz.id}`, dismiss: false });
    if (v === 'hint') {
      await sheet(`<p class="goal">${ruby(hintOf(pz, hintN))}</p>`, [{ label: 'わかった', value: 1, kind: 'primary' }], { title: `ヒント ${hintN + 1}` });
      hintN++; help = help || 'hint';
      continue;
    }
    if (v === 'ans') {
      await sheet(`<ol class="tm-ans">${pz.sol.map((t) => `<li>${ruby(t)}</li>`).join('')}</ol><p class="what">${ruby('この とおりに やって みよう。ほかの やりかたで かてる ことも ある。')}</p>`,
        [{ label: 'やって みる', value: 1, kind: 'primary' }], { title: 'こたえ（いちばん みじかい 手じゅん）' });
      help = 'ans';
      continue;
    }
    if (v === 'again') return play(pz, back, { ...o, retry: true, help, hintN });
    return tsumeMenu(back);
  }
}
