// カード工房（こうぼう）の 画面（2026-11-11。docs/KOBO.md）：じぶんの クリーチャーを つくる → ためす（とうの てきと たたかう）
// つくった カードは この 端末に のこる（mtg-kobo）。ぼうけん・こうちく・オンラインには 出ない（ためす だけ）
import { BY_ID, BASICS } from '../data/cards.js';
import { SLOTS } from '../data/enemies.js';
import { POOL1 } from '../data/pool1.js';
import { colorsOf } from '../engine/game.js';
import { DECK_SIZE } from '../engine/run.js';
import {
  KOBO_MAX, COST_MAX, STAT_MAX, NAME_MAX, RAR_BONUS, RAR_PTS, KOBO_KW, KOBO_ETB, KW_PRICE,
  budgetOf, spentParts, spentOf, leftOf, cleanName, cleanSpec, specOk, makeCustom,
} from '../data/kobo.js';
import { startBattle } from './battle.js';
import { FLOOR_NAMES } from './app.js';
import { diffOpen } from './unlock.js';
import { cardFace, detail, sheet, ruby, esc, COLOR_NAME, RAR } from './view.js';

const KEY = 'mtg-kobo';
const load = () => { try { const o = JSON.parse(localStorage.getItem(KEY)) || {}; return { cards: (Array.isArray(o.cards) ? o.cards : []).slice(0, KOBO_MAX).map(cleanSpec), seq: Number(o.seq) || 0 }; } catch { return { cards: [], seq: 0 }; } };
const save = (S) => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 保存できなくても あそべる */ } };
let APP = null, BACK = null;
const app = () => APP();
// つくった カードを カードの 一覧（BY_ID）に 入れる（たたかいの 画面が ID で さがしても 見つかる ように）
const defOf = (spec) => (BY_ID[spec.id] = makeCustom(spec));
export const koboCount = () => load().cards.length;

const NAMES = ['ほのおの ドラゴン', 'かぜの たか', 'もりの くま', 'ひかりの きし', 'こおりの おおかみ', 'いなずま ねこ', 'つきの うさぎ', 'うみの かめ'];
const T = { test: [], diff: 'easy' }; // ためす：いっしょに つかう カード・むずかしさ（この あいだだけ）
const DIFFS = [['easy', 'かんたん'], ['normal', 'ふつう']];

export function koboMenu(appFn, back) { APP = appFn; BACK = back; menu(); }

function menu() {
  const S = load();
  app().innerHTML = `<main class="zukan kobo">
    <h2>${ruby('カード工房（こうぼう）')}</h2>
    <p class="zk-note">${ruby('「よさん」の 点の 中で、じぶんだけの クリーチャーを つくろう。つくった カードは「ためす」で とうの てきと たたかえる（ぼうけんや オンラインには 出ない）。')}</p>
    <p class="zk-total">つくった カード <b>${S.cards.length}</b> / ${KOBO_MAX}まい</p>
    <div class="kb-list">${S.cards.map((c) => `<button type="button" class="kb-card" data-kb="${c.id}">${cardFace(defOf(c))}<small>${RAR[c.rar]}・のこり ${leftOf(c)}点</small></button>`).join('')}
      ${S.cards.length < KOBO_MAX ? '<button type="button" class="kb-card kb-new" data-kbx="new"><b>＋</b><small>あたらしく つくる</small></button>' : ''}</div>
    <div class="row-btns">${S.cards.length ? '<button type="button" class="btn primary" data-kbx="test">ためす<small>つくった カードで たたかう</small></button>' : ''}<button type="button" class="btn" data-kbx="back">タイトルへ</button></div>
  </main>`;
  app().onclick = async (e) => {
    const x = e.target.closest('[data-kbx]')?.dataset.kbx;
    if (x === 'back') return BACK();
    if (x === 'new') return editor({ id: '', name: NAMES[Math.floor(Math.random() * NAMES.length)], color: 'R', rar: 'C', cost: 2, pow: 2, tou: 2, kw: [], etb: null }, true);
    if (x === 'test') return tester();
    const b = e.target.closest('[data-kb]'); if (!b) return;
    const c = S.cards.find((q) => q.id === b.dataset.kb); if (!c) return;
    const v = await sheet(`${detail(defOf(c))}<p class="zk-note">${ruby(`よさん ${budgetOf(c)}点・つかった ${spentOf(c)}点・デッキの 点数 ${RAR_PTS[c.rar]}点`)}</p>`,
      [{ label: 'なおす', value: 'edit', kind: 'primary' }, { label: 'ためす', value: 'test' }, { label: 'けす', value: 'del' }, { label: 'とじる', value: null }], { title: 'じぶんの カード' });
    if (v === 'edit') return editor({ ...c, kw: [...c.kw], etb: c.etb ? { ...c.etb } : null }, false);
    if (v === 'test') { T.test = [c.id]; return tester(); }
    if (v === 'del') {
      const ok = await sheet(`<p>${ruby(`「${esc(c.name)}」を けす？ もとには もどせない。`)}</p>`, [{ label: 'けす', value: 1, kind: 'primary' }, { label: 'やめる', value: 0 }], { title: 'カードを けす' });
      if (ok) { S.cards = S.cards.filter((q) => q.id !== c.id); save(S); }
      return menu();
    }
  };
}

// ---- つくる・なおす ----
const stepper = (k, v, lo, hi, label) => `<div class="kb-step"><span class="kb-l">${label}</span><button type="button" class="btn" data-ke="${k}:-1" ${v <= lo ? 'disabled' : ''} aria-label="${label}を 1 へらす">−</button><b>${v}</b><button type="button" class="btn" data-ke="${k}:1" ${v >= hi ? 'disabled' : ''} aria-label="${label}を 1 ふやす">＋</button></div>`;
const price = (p) => (p < 0 ? `＋${-p}点 もどる` : `${p}点`);
function budgetHtml(E) {
  const b = budgetOf(E), parts = spentParts(E), s = spentOf(E), left = b - s;
  const bonus = RAR_BONUS[E.rar];
  const sum = parts.map(([, p], i) => (i === 0 ? `${p}` : p < 0 ? ` − ${-p}` : ` ＋ ${p}`)).join('');
  return `<div class="kb-budget ${left < 0 ? 'over' : ''}" role="status">
    <p><span>よさん</span>${ruby(`コスト ${E.cost} × 2 ＋ 2${bonus ? ` ＋ ${bonus}（${RAR[E.rar]}）` : ''} ＝ `)}<b>${b}点</b></p>
    <p><span>つかった</span>${sum} ＝ <b>${s}点</b></p>
    <p class="kb-left"><span>のこり</span>${b} − ${s} ＝ <b>${left < 0 ? `−${-left}` : left}点</b>${left < 0 ? `　${-left}点 オーバー！ どれかを へらそう` : left === 0 ? '　ぴったり！' : ''}</p>
    <ul class="kb-parts">${parts.map(([n, p]) => `<li>${ruby(n)}：${price(p)}</li>`).join('')}</ul></div>`;
}
function editor(E, isNew) {
  const draw = () => {
    const def = makeCustom({ ...E, id: E.id || 'MY0' });
    const e = E.etb, eb = e ? KOBO_ETB[e.k] : null;
    app().innerHTML = `<main class="zukan kobo kb-edit">
      <h2>${ruby(isNew ? 'カードを つくる' : 'カードを なおす')}</h2>
      <div class="kb-top"><div class="kb-prev" id="kb-prev">${cardFace(def)}</div>${budgetHtml(E)}</div>
      <label class="kb-name"><span class="kb-l">なまえ</span><input type="text" id="kb-name" maxlength="${NAME_MAX}" value="${esc(E.name)}" autocomplete="off" enterkeyhint="done"></label>
      <h3 class="zk-h">色</h3>
      <div class="zk-sets">${[...'WUKRG', ''].map((c) => `<button type="button" class="chip ${E.color === c ? 'on' : ''}" data-ke="color:${c}">${c ? `<i class="pip m-${c}">${COLOR_NAME[c]}</i>${COLOR_NAME[c]}` : 'むしょく'}</button>`).join('')}</div>
      <h3 class="zk-h">レアリティ</h3>
      <div class="zk-sets">${Object.keys(RAR_BONUS).map((r) => `<button type="button" class="chip ${E.rar === r ? 'on' : ''}" data-ke="rar:${r}">${RAR[r]}<small>よさん ＋${RAR_BONUS[r]}・デッキ ${RAR_PTS[r]}点</small></button>`).join('')}</div>
      <p class="zk-note">${ruby('レアリティを 上げると よさんが ふえる。そのかわり デッキに 入れる ときの 点数も ふえる。ダメージや タップの あいては、コモンは ランダム、アンコモンは いちばん 大きい てき、レアからは じぶんで えらべる。レジェンドは 伝説（でんせつ）（場に 1まい だけ）。')}</p>
      <h3 class="zk-h">コストと 大きさ</h3>
      ${stepper('cost', E.cost, 1, COST_MAX, 'コスト（マナ）')}
      ${stepper('pow', E.pow, 0, STAT_MAX, 'パワー')}
      ${stepper('tou', E.tou, 1, STAT_MAX, 'タフネス')}
      <h3 class="zk-h">${ruby('とくべつな 力（ちから）')}</h3>
      <div class="kb-kws">${KOBO_KW.map(([k, n, p, t]) => `<button type="button" class="kb-kw ${E.kw.includes(k) ? 'on' : ''}" data-ke="kw:${k}" aria-pressed="${E.kw.includes(k)}"><b>${ruby(n)}</b><em>${price(p)}</em><small>${ruby(t)}</small></button>`).join('')}</div>
      <h3 class="zk-h">${ruby('場（ば）に 出たとき')}</h3>
      <div class="zk-sets"><button type="button" class="chip ${e ? '' : 'on'}" data-ke="etb:">なし</button>${Object.entries(KOBO_ETB).map(([k, v]) => `<button type="button" class="chip ${e?.k === k ? 'on' : ''}" data-ke="etb:${k}">${ruby(v.name)}</button>`).join('')}</div>
      ${e ? `${eb.max > eb.min ? stepper('etbn', e.n, eb.min, eb.max, '数') : ''}<p class="zk-note">${ruby(`${eb.text(e.n, E.rar === 'L' ? 'R' : E.rar)}（${eb.price(e.n)}点）`)}</p>` : ''}
      <div class="row-btns"><button type="button" class="btn primary" data-ke="save:" ${specOk(E) ? '' : 'disabled'}>${ruby('これで 完成（かんせい）')}</button><button type="button" class="btn" data-ke="cancel:">やめる</button></div>
      ${E.kw.includes('defender') && E.kw.includes('haste') ? `<p class="zk-note">${ruby('防衛（ぼうえい）と 速攻（そっこう）は いっしょに えらべない。')}</p>` : ''}
    </main>`;
    const input = document.getElementById('kb-name');
    input.oninput = () => { E.name = cleanName(input.value); const el = document.querySelector('#kb-prev .card-name'); if (el) el.textContent = E.name || '　'; };
  };
  draw();
  app().onclick = (ev) => {
    const b = ev.target.closest('[data-ke]'); if (!b || b.disabled) return;
    const [k, v] = b.dataset.ke.split(':');
    if (k === 'cancel') return menu();
    if (k === 'save') {
      if (!specOk(E)) return;
      const S = load();
      E.name = cleanName(E.name) || 'なまえの ない カード';
      if (isNew) { S.seq++; E.id = `MY${S.seq}`; S.cards.push(cleanSpec(E)); } else S.cards = S.cards.map((c) => (c.id === E.id ? cleanSpec(E) : c));
      save(S);
      return menu();
    }
    if (k === 'color') E.color = v;
    if (k === 'rar') E.rar = v;
    if (k === 'cost') E.cost = Math.max(1, Math.min(COST_MAX, E.cost + +v));
    if (k === 'pow') E.pow = Math.max(0, Math.min(STAT_MAX, E.pow + +v));
    if (k === 'tou') E.tou = Math.max(1, Math.min(STAT_MAX, E.tou + +v));
    if (k === 'kw') E.kw = E.kw.includes(v) ? E.kw.filter((x) => x !== v) : [...E.kw, v].sort((a, c) => Object.keys(KW_PRICE).indexOf(a) - Object.keys(KW_PRICE).indexOf(c));
    if (k === 'etb') E.etb = v ? { k: v, n: KOBO_ETB[v].min } : null;
    if (k === 'etbn' && E.etb) E.etb.n = Math.max(KOBO_ETB[E.etb.k].min, Math.min(KOBO_ETB[E.etb.k].max, E.etb.n + +v));
    const y = window.scrollY;
    draw();
    window.scrollTo(0, y);
  };
}

// ---- ためす：つくった カード（3しゅるいまで・4まいずつ）＋ おなじ 色の かんたんな カード ＋ きほんカードで 20まい ----
export function testDeck(specs) {
  const mine = specs.slice(0, 3).map(defOf);
  const cols = [...new Set(mine.flatMap(colorsOf))];
  const deck = mine.flatMap((d) => Array(4).fill(d));
  const helpers = POOL1.map((id) => BY_ID[id]).filter((d) => d && !d.legend && (d.cost ?? 0) <= 5 && d.cost >= 1 && (colorsOf(d).length === 0 || (colorsOf(d).length === 1 && cols.includes(colorsOf(d)[0]))))
    .sort((a, b) => colorsOf(b).length - colorsOf(a).length || a.cost - b.cost);
  for (const d of helpers) { if (deck.length >= 14) break; deck.push(d); }
  const order = cols.length ? cols : ['C'];
  for (let k = 0; deck.length < DECK_SIZE; k++) deck.push(BASICS[order[k % order.length]]);
  return deck;
}
function tester() {
  const S = load();
  T.test = T.test.filter((id) => S.cards.some((c) => c.id === id)).slice(0, 3);
  if (!T.test.length && S.cards.length) T.test = [S.cards[0].id];
  if (!DIFFS.some(([k]) => k === T.diff && diffOpen(k))) T.diff = 'easy';
  const picked = T.test.map((id) => S.cards.find((c) => c.id === id));
  const deck = picked.length ? testDeck(picked) : [];
  const count = (d) => deck.filter((x) => x === d).length;
  app().innerHTML = `<main class="zukan kobo">
    <h2>ためす</h2>
    <p class="zk-note">${ruby('つくった カードを 3しゅるいまで えらぶ（4まいずつ 入る）。のこりは おなじ 色の かんたんな カードと きほんカード。パックけん・トロフィー・ずかんの きろくは ふえない。')}</p>
    <h3 class="zk-h">つかう カード（${T.test.length} / 3）</h3>
    <div class="kb-list">${S.cards.map((c) => `<button type="button" class="kb-card ${T.test.includes(c.id) ? 'on' : ''}" data-kt="${c.id}" aria-pressed="${T.test.includes(c.id)}">${cardFace(defOf(c))}</button>`).join('')}</div>
    ${deck.length ? `<h3 class="zk-h">デッキ（${DECK_SIZE}まい）</h3><p class="zk-note">${[...new Set(deck)].map((d) => `${ruby(d.name)} ×${count(d)}`).join('、')}</p>` : ''}
    <h3 class="zk-h">むずかしさ</h3>
    <div class="zk-sets">${DIFFS.filter(([k]) => diffOpen(k)).map(([k, l]) => `<button type="button" class="chip ${k === T.diff ? 'on' : ''}" data-kd="${k}">${l}</button>`).join('')}</div>
    <h3 class="zk-h">てき</h3>
    <ul class="cs-floors">${SLOTS.flat().map((f) => `<li><button type="button" class="btn" data-kf="${f}" ${deck.length ? '' : 'disabled'}><span>${ruby(FLOOR_NAMES[f] || f)}</span></button></li>`).join('')}</ul>
    <button type="button" class="btn ghost" data-kbx="back">もどる</button>
  </main>`;
  app().onclick = (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.kbx === 'back') return menu();
    if (b.dataset.kt) { const id = b.dataset.kt; T.test = T.test.includes(id) ? T.test.filter((x) => x !== id) : T.test.length < 3 ? [...T.test, id] : T.test; return tester(); }
    if (b.dataset.kd) { T.diff = b.dataset.kd; return tester(); }
    if (b.dataset.kf) {
      const f = b.dataset.kf;
      return startBattle({
        deck: testDeck(picked), floorId: f, diff: T.diff, floorName: FLOOR_NAMES[f] || f,
        quit: { label: 'ためすのを やめる', note: 'たたかいを やめて、カード工房（こうぼう）へ もどる？', go: tester },
        onEnd: async (r) => {
          await sheet(`<p>${ruby(r.win ? 'かった！ つくった カードは うまく はたらいたかな？' : 'まけて しまった。カードを なおして、また ためそう。')}</p>`, [{ label: 'もどる', value: 1, kind: 'primary' }], { title: r.win ? 'ためす：かち' : 'ためす：まけ', dismiss: false });
          tester();
        },
      });
    }
  };
}
