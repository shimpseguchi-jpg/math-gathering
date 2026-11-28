// がくしゅう（合体版「さんすうオリパ」。docs/SANSU_ORIPA.md 2・6章）：たんげんを えらんで けいさん。せいかいで コイン
// もんだいづくりは data/learn.js（けいさんオリパの 出題エンジンの うつし）。ここは 画面と えんしゅつ。
// みためは パック＆バトルの ドットの わく。もんだいの 文と 数字は 大きく（ひらがな 中心）
// えんしゅつ（#lfx）は いつも いちばん 手前。まちがえた ときは 小さく やさしい 表示 だけ（大きい 字・ゆれ・かみふぶきは 出さない）
import { UNITS, UNIT_NAME, newQ, mult, cnt, opCh, SF_COMBO, TN, LEARN_COIN, LEARN_GP, CLEAR_OK, rnd, pick } from '../data/learn.js';
import { sfx, beep } from './sfx.js';
import { esc } from './view.js';

// がくしゅうの セーブ（パック＆バトルの セーブの learn）：
// { units：{ たんげん: { ok：せいかいした 数（あわせて）, clear：初クリアの ごほうびを もらった, tri：3つの かずの 初かいほうの ごほうびを もらった } },
//   combo：いまの れんぞく せいかい, best：れんぞくの さいこう, sf：スーパーフィーバー 初とつにゅうの ごほうび, s20：20もん れんぞくの ごほうび }
export const freshLearn = () => ({ units: Object.fromEntries(UNITS.map((u) => [u.id, { ok: 0, clear: 0, tri: 0 }])), combo: 0, best: 0, sf: 0, s20: 0 });
export function fixLearn(v) {
  const f = freshLearn(), n = (x) => Math.max(0, Math.min(999999, Math.floor(+x || 0)));
  if (!v || typeof v !== 'object') return f;
  for (const u of UNITS) { const x = v.units?.[u.id] || {}; f.units[u.id] = { ok: n(x.ok), clear: x.clear ? 1 : 0, tri: x.tri ? 1 : 0 }; }
  return { ...f, combo: Math.min(9999, n(v.combo)), best: Math.min(9999, n(v.best)), sf: v.sf ? 1 : 0, s20: v.s20 ? 1 : 0 };
}

let O = null; // { app, get：セーブ, save, back, unitOpen(id), unitCost(id), goGrow, name }
let st = null, Q = null, busy = false, sfAsked = false, lockUntil = 0, lastPres = '';
// もんだいの 出しかた（けいさんオリパと おなじ 4つ）：まいかい ランダム。同じ 出しかたは つづけない
const PRES = ['slot', 'gacha', 'card', 'dice'];
const FP = (/p(slot|gacha|card|dice)/.exec(location.hash) || [])[1] || ''; // どうさかくにん用：#pslot など で こてい
const S = () => O.get(), L = () => S().learn;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = () => O.app();

// ---- えんしゅつの そう（いちばん 手前）----
function fx() {
  let e = document.getElementById('lfx');
  if (!e) { e = document.createElement('div'); e.id = 'lfx'; e.setAttribute('aria-hidden', 'true'); e.innerHTML = '<i class="lfx-dark"></i><i class="lfx-glow"></i><i class="lfx-flash"></i>'; document.body.appendChild(e); }
  return e;
}
const layer = (c) => fx().querySelector(c);
function clearFx() { for (const e of [...fx().querySelectorAll('.lfx-pop,.lfx-cf,.lfx-star,.lfx-beams')]) e.remove(); }
function pop(html, cls, ms) { const p = document.createElement('div'); p.className = `lfx-pop ${cls}`; p.innerHTML = html; p.style.animationDuration = `${ms}ms`; fx().appendChild(p); setTimeout(() => p.remove(), ms); return p; }
function confetti(n) {
  const cols = ['#ff5d5d', '#ffb13d', '#fff35c', '#5dff8f', '#5dc8ff', '#b56bff', '#ff5dd0', '#fff'];
  for (let i = 0; i < n; i++) {
    const e = document.createElement('i'); e.className = 'lfx-cf'; e.style.left = `${rnd(0, 100)}%`; e.style.background = pick(cols); fx().appendChild(e);
    e.animate([{ transform: 'translateY(0) rotate(0)' }, { transform: `translate(${rnd(-80, 80)}px,110vh) rotate(${rnd(360, 1080)}deg)` }], { duration: rnd(1400, 2400), delay: rnd(0, 400), easing: 'ease-in' }).onfinish = () => e.remove();
  }
}
function stars(n) {
  for (let i = 0; i < n; i++) {
    const e = document.createElement('i'); e.className = 'lfx-star'; e.textContent = pick(['★', '☆', '＋', '✦']); fx().appendChild(e);
    const a = i / n * 6.283 + Math.random() * 0.4, d = rnd(120, 320);
    e.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(1.4) rotate(${rnd(-200, 200)}deg)`, opacity: 0 }], { duration: rnd(600, 950), easing: 'cubic-bezier(.1,.7,.3,1)' }).onfinish = () => e.remove();
  }
}
function beams(ms, col) {
  const e = document.createElement('i'); e.className = 'lfx-beams'; if (col) e.style.setProperty('--bc', col); fx().appendChild(e);
  e.animate([{ opacity: 0, transform: 'translate(-50%,-50%) rotate(0) scale(.6)' }, { opacity: 0.75, transform: 'translate(-50%,-50%) rotate(25deg) scale(1)', offset: 0.25 }, { opacity: 0, transform: 'translate(-50%,-50%) rotate(70deg) scale(1.1)' }], { duration: ms }).onfinish = () => e.remove();
}
const flash = (a) => layer('.lfx-flash').animate([{ opacity: a }, { opacity: 0 }], { duration: 450 });
// ゆれ：さいだい 3ピクセル・0.25びょう
function quake() { const m = app().querySelector('main'); if (!m) return; m.classList.remove('lq-quake'); void m.offsetWidth; m.classList.add('lq-quake'); }

// せいかいの えんしゅつ：れんぞく せいかい（コンボ）で だんだん はでに。[だんかい, もじ]
//   0：1〜2れんぞく … 小さく「できた！」だけ／1：3〜4 … まんなかに 大きい 字（0.85びょう）＋ 小さな ゆれ
//   2：5〜7（フィーバー）… 大きい 字 ＋ ほし・かみふぶき・ひかりの すじ／3：8〜・スーパーフィーバー中 … とくだいの にじいろの 字 ＋ 画面 ぜんたいの ひかり
function cheer(c) {
  const sf = st.hell && !Q.word, t = c >= 8 || (sf && c >= 5) ? 3 : c >= 5 ? 2 : c >= 3 ? 1 : 0;
  if (!t) return [0, 'できた！'];
  const w = t === 1 ? (c === 3 ? 'ナイス！' : 'いいね！') : t === 2 ? (c === 5 ? 'フィーバー！！' : 'すごい！！') : (c >= 20 ? 'でんせつ！！！！！' : c >= 12 ? 'さいこう！！！！' : 'すごすぎる！！！');
  quake();
  if (t >= 2) { stars(t === 3 ? 26 : 16); confetti(t === 3 ? 70 : 36); beams(900); }
  if (t === 3) { layer('.lfx-glow').animate([{ opacity: 0.5 }, { opacity: 0 }], { duration: 800 }); flash(0.45); }
  return [t, `${c}コンボ<br>${t === 3 ? `<b>${w}</b>` : w}`];
}
const oops = () => pop('<span>おしい！ もういちど かんがえよう</span>', 'mini', 1000); // まちがい：小さく やさしく

// ---- せいちょうポイントの ごほうび（それぞれ 1回 だけ）----
function gp(n, why) { S().gp += n; O.save(); pop(`<span>せいちょうポイント ＋${n}<small>${esc(why)}</small></span>`, 'gp', 2200); sfx.unlock(); }
function reward() {
  const l = L(), u = l.units[st.mode];
  if (!u.clear && u.ok >= CLEAR_OK) { u.clear = 1; gp(LEARN_GP.clear, `${UNIT_NAME[st.mode]}を ${CLEAR_OK}もん せいかい`); }
  if (!l.s20 && st.combo >= 20) { l.s20 = 1; gp(LEARN_GP.s20, '20もん れんぞく せいかい'); }
  if (st.combo > l.best) l.best = st.combo;
}

// ---- たんげんを えらぶ ----
export function learnMenu(o) {
  O = o || O; Q = null; st = null; busy = false; clearFx();
  const s = S(), l = L();
  const row = (u, i) => {
    const open = O.unitOpen(u.id), x = l.units[u.id];
    return `<li><button type="button" class="st-ep lq-unit ${open ? 'open' : 'lock'}" data-unit="${u.id}" ${open ? '' : 'data-locked="1"'}><b><i class="pb-num">${i + 1}</i><i class="lq-mark">${u.mark}</i></b>
      <span><i class="st-title">${u.name}</i><small>${open ? `${u.sub}・せいかい ${x.ok}もん${x.clear ? '（クリア）' : ''}` : `ロック：「せいちょう」で かいほうできる（せいちょうポイント ${O.unitCost(u.id)}）`}</small></span>
      <em>${open ? 'はじめる' : 'ロック'}</em></button></li>`;
  };
  app().innerHTML = `<main class="zukan construct pb lq-menu">
    <p class="eyebrow">${esc(O.name)}</p>
    <div class="oripa-head"><h2>がくしゅう</h2>${O.fullBtn ? O.fullBtn() : ''}</div>
    <ul class="pb-stats">
      <li><span>コイン</span><b id="lq-coin">${s.pts}</b><small>コイン</small></li>
      <li><span>せいちょうポイント</span><b>${s.gp}</b><small>ポイント</small></li>
      <li><span>れんぞく せいかい</span><b>${l.combo}</b><small>もん（さいこう ${l.best}）</small></li>
    </ul>
    <p class="pb-guide">${l.combo >= 5 ? `フィーバー中！ コイン ${l.combo >= 10 ? 3 : 2}ばい。まちがえなければ つづくよ。` : 'たんげんを えらんで けいさん しよう。1もん せいかいで 10コイン。5もん れんぞくで フィーバー（コイン 2ばい）、10もんで 3ばい！'}</p>
    <ol class="pb-steps">${UNITS.map(row).join('')}</ol>
    <button type="button" class="btn ghost" data-back="1">ホームへ</button>
  </main>`;
  app().onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.back) return O.back();
    if (b.dataset.full) return O.fullTap().then(() => learnMenu());
    if (b.dataset.locked) return O.goGrow();
    if (b.dataset.unit) { sfx.tap(); return start(b.dataset.unit); }
  };
}
function start(mode) {
  st = { mode, qSeen: 0, okSeen: 0, combo: L().combo, hell: false, prev: null }; sfAsked = false;
  next(); render();
}
// つぎの もんだい。3つの かずが はじめて まざる ように なったら ごほうび
function next() {
  Q = newQ(st); lockUntil = 0;
  // 出しかた：式の もんだいは えんしゅつが おわるまで 入力を うけない（spin）。文しょう題は 文が 1文ずつ あらわれる（intro）
  Q.spin = !Q.word; Q.intro = Q.word; Q.spinning = false;
  if (!Q.word) { Q.pres = FP || pick(PRES.filter((x) => x !== lastPres)); lastPres = Q.pres; }
  const u = L().units[st.mode];
  if (Q.open3 && !u.tri) { u.tri = 1; gp(LEARN_GP.tri, `${UNIT_NAME[st.mode]}で 3つの かずの もんだいが 出る ように なった`); }
}

// ---- もんだいの 画面 ----
const os = (o) => `<span class="lq-op ${o === '-' ? 'mi' : o === '×' ? 'mu' : ''}">${opCh(o)}</span>`;
const ansBox = () => `<span class="lq-ans ${Q.done ? 'ok' : ''}" id="lq-ans">${Q.input || '？'}</span>`;
function eqHTML(small) {
  const unit = small ? `<span class="lq-u">${cnt(Q.ans, Q.u).slice(String(Q.ans).length)}</span>` : '';
  const is = '<span class="lq-is">＝</span>';
  if (Q.tri) { // 3つの かず：式 ぜんたいを 1ぎょうで。出る ときは 左から 1つずつ
    const parts = [Q.a, os(Q.o1), Q.b, os(Q.o2), Q.c];
    if (small) return `<div class="lq-eq t3 s" id="lq-eq">${parts.join('')}${is}${ansBox()}${unit}</div>`;
    return `<div class="lq-eq t3" id="lq-eq">${parts.map((x, i) => `<span${Q.spin ? ` class="tin3" style="animation-delay:${i * 170}ms"` : ''}>${x}</span>`).join('')}${is}${ansBox()}</div>`;
  }
  if (Q.tier && !small) return `<div class="lq-eq tq d${String(Q.a).length} ${Q.spin ? 'hin' : ''}" id="lq-eq">${Q.a}${os(Q.op)}${Q.b}${is}${ansBox()}</div>`;
  if (small) return `<div class="lq-eq s" id="lq-eq">${Q.a}${os(Q.op)}${Q.b}${is}${ansBox()}${unit}</div>`;
  // 2つの かず：3つの ます（#lq-r0 かず・#lq-r1 ＋−・#lq-r2 かず）。スロットは リール、ほかは ガチャだま・カード・サイコロ
  const sp = Q.spin ? ' spin' : '', slot = Q.pres === 'slot', kind = slot ? 'slotq' : `pq ${{ gacha: 'gq', card: 'cq', dice: 'dq' }[Q.pres]}`;
  return `<div class="lq-eq ${kind}" id="lq-eq"><span class="lq-reel w${sp}" id="lq-r0"><span>${Q.a}</span></span><span class="lq-reel${!slot || Q.mode === 'mix' ? sp : ''}" id="lq-r1">${os(Q.op)}</span><span class="lq-reel${sp}" id="lq-r2"><span>${Q.b}</span></span>${is}${ansBox()}</div>`;
}
// ---- もんだいの 出しかた（けいさんオリパの えんしゅつ。きまりと 数は かえない：見せかた だけ）----
const alive = (q) => Q === q && !!document.getElementById('lq-board');
const el = (id) => document.getElementById(id);
// スロット：左から じゅんに リールが とまる。3つめは すこし 長く まわる（1コマ 70ms・やく 1.5びょう）
function spinQ(q) {
  let tick = 0; const stop = [7, 12, 21], zc = q.op === '+' && q.a >= 6; // zc：ゾロめに なるかも
  const iv = setInterval(() => {
    if (!alive(q)) return clearInterval(iv);
    tick++;
    [0, 1, 2].forEach((i) => {
      const e = el(`lq-r${i}`), f = e.firstChild;
      if (tick === stop[i]) {
        if (i === 1) { f.textContent = opCh(q.op); f.className = `lq-op ${q.op === '-' ? 'mi' : ''}`; } else f.textContent = i ? q.b : q.a;
        e.classList.remove('spin', 'slow'); e.classList.add('hit'); beep(170, 0.12, 0, 'square', 0.1);
      } else if (e.classList.contains('spin')) {
        if (i === 1) { const pl = tick % 2; f.textContent = pl ? '＋' : '−'; f.className = `lq-op ${pl ? '' : 'mi'}`; }
        else if (tick <= 17 || tick % 2) f.textContent = i === 0 && q.op === '-' ? rnd(11, 18) : rnd(2, 9);
      }
    });
    if (tick === 18) { el('lq-r2').classList.add('slow'); if (zc) el('lq-eq').classList.add('zg'); } // ため。ゾロめの かのうせいが あれば 金色
    if (tick % 2) beep(tick > 17 ? 700 + tick * 20 : 500 + (tick % 3) * 90, 0.03, 0, 'triangle', 0.03);
    if (tick >= stop[2]) { clearInterval(iv); el('lq-eq').classList.remove('zg'); finish(q); }
  }, 70);
}
// ガチャだま・カードめくり・サイコロ：3つの ますが きまった じゅんに ひらく（1コマ 70ms・やく 1.2びょう）
const REV = { gacha: [9, 13, 17], card: [7, 11, 16], dice: [8, 11, 17] };
function presentQ(q) {
  if (q.pres === 'slot') return spinQ(q);
  let tick = 0; const rev = REV[q.pres], zc = q.op === '+' && q.a >= 6, kind = q.pres;
  const iv = setInterval(() => {
    if (!alive(q)) return clearInterval(iv);
    tick++;
    [0, 1, 2].forEach((i) => {
      const e = el(`lq-r${i}`), f = e.firstChild;
      if (kind === 'card' && tick === rev[i] - 2) { e.classList.add('turn'); sfx.flip(); }
      if (tick === rev[i]) {
        if (i !== 1) f.textContent = i ? q.b : q.a;
        e.classList.remove('spin', 'turn'); e.classList.add('hit');
        if (kind === 'gacha') { beep(880, 0.07, 0, 'square', 0.07); beep(1319, 0.12, 0.06, 'square', 0.06); }
        else if (kind === 'dice' && i === 1) beep(660, 0.1, 0, 'triangle', 0.08);
        else beep(170, 0.12, 0, 'square', 0.1);
        if (i === 0 && zc) el('lq-eq').classList.add('zg'); // ゾロめに なるかも：さいしょの かずを 金色に
      } else if (kind === 'dice' && i !== 1 && e.classList.contains('spin') && tick % 2) {
        f.textContent = i === 0 && q.op === '-' ? rnd(11, 18) : rnd(2, 9); // ころがって いる あいだ 目が かわる
      }
    });
    if (kind === 'gacha' && (tick === 2 || tick === 4 || tick === 6)) beep(150, 0.1, 0, 'triangle', 0.09); // カプセルが おちる 音
    if (kind === 'dice' && tick % 2) beep(380 + (tick % 3) * 70, 0.03, 0, 'triangle', 0.03);
    if (tick >= rev[2]) { clearInterval(iv); setTimeout(() => { if (alive(q)) { el('lq-eq').classList.remove('zg'); finish(q); } }, 70); }
  }, 70);
}
// 出しおわり：入力できる。ラッキーなら ここで しらせる（ひかり・音・かみふぶき ＋ しるし）
function finish(q) {
  q.spin = false;
  if (q.lucky) { flash(0.6); sfx.rare(); confetti(30); render(); }
}
// 3つの かず：数と きごうが 左から 1つずつ 出る（やく 1.15びょう）
function triIn(q) {
  for (let i = 0; i < 5; i++) beep(i % 2 ? 660 : 440 + i * 60, 0.08, i * 0.17, 'triangle', 0.07);
  setTimeout(() => { if (!alive(q)) return; for (const e of [...document.querySelectorAll('.tin3')]) e.classList.remove('tin3'); finish(q); }, 1150);
}
// はんいの そとの もんだい：式が とびだして くる（0.55びょう）
function hellIn(q) {
  beep(196, 0.12, 0, 'triangle', 0.08); beep(294, 0.18, 0.1, 'triangle', 0.08);
  setTimeout(() => { if (alive(q)) q.spin = false; }, 550);
}
function hintHTML() {
  if (Q.tri) return `ひだりから じゅんに けいさんしよう。<br><b>${Q.a}</b>${opCh(Q.o1)}<b>${Q.b}</b>＝<b>${Q.mid}</b>。　<b>${Q.mid}</b>${opCh(Q.o2)}<b>${Q.c}</b>で …？`;
  const a = Q.a, b = Q.b;
  if (Q.op === '+') { const n = 10 - a; return `<b>${a}</b>は あと <b>${n}</b>で 10。　<b>${b}</b>を <b>${n}</b>と <b>${b - n}</b>に わけよう。<br>10と <b>${b - n}</b>で …？`; }
  return `<b>${a}</b>を 10と <b>${a - 10}</b>に わけよう。　10−${b}＝<b>${10 - b}</b>。<br><b>${10 - b}</b>と <b>${a - 10}</b>で …？`;
}
function tierHint() {
  if (Q.op === '×') return `<b>${Q.a}</b>×<b>${Q.b}</b> は 「<b>${Q.a}</b>が <b>${Q.b}</b>こ」の こと。<br><span class="lq-sm">${Array(Q.b + 1).join(`＋${Q.a}`).slice(1)}</span>`;
  return `いちの くらいから じゅんに けいさんしよう。<br>${Q.op === '+' ? 'くりあがった <b>1</b>を たすのを わすれずに！' : 'ひけない ときは となりの くらいから <b>10</b> かりよう！'}`;
}
const padHTML = () => `<div class="lq-pad">${[7, 8, 9, 4, 5, 6, 1, 2, 3, 0].map((n) => `<button type="button" class="lq-key" data-key="${n}">${n}</button>`).join('')}<button type="button" class="lq-key del" data-del="1">けす</button><button type="button" class="lq-key go" data-ent="1">こたえる</button></div>`;
function render() {
  const c = st.combo, sf = st.hell && !Q.word, m = mult(Q, c);
  const cb = c >= 2 ? `<span class="lq-combo ${c >= 10 ? 'c10' : c >= 5 ? 'c5' : ''}" id="lq-combo">${c >= 5 && !Q.tier ? `フィーバー×${c >= 10 ? 3 : 2}　` : ''}${c}れんぞく！</span>` : '<span class="lq-combo" id="lq-combo"></span>';
  let h = `<main class="zukan construct pb lq ${sf || Q.tier ? 'hell' : ''} ${c >= 10 ? 'fv10' : c >= 5 ? 'fv' : ''}" data-unit="${st.mode}">
    <div class="lq-top"><button type="button" class="btn ghost" data-menu="1">◀ もどる</button><h2>${sf ? 'スーパーフィーバー！' : UNIT_NAME[st.mode]}</h2><span class="lq-coin">コイン <b id="lq-coin">${S().pts}</b></span></div>
    <div class="lq-bar">${cb}${sf ? '<button type="button" class="btn" data-unhell="1">ふつうに もどる</button>' : ''}</div>
    <div class="lq-board ${c >= 10 ? 'c10' : c >= 5 ? 'c5' : c >= 2 ? `c${c}` : ''} ${Q.tier ? `tier t${Q.tier}` : Q.lucky && !Q.spin ? 'lucky' : ''}" id="lq-board">`;
  if (Q.tier) h += `<p class="lq-tag t${Q.tier}" id="lq-tag">スーパー：${TN[Q.tier]}　コイン ${m}ばい</p>`;
  else if (Q.lucky && !Q.spin) h += `<p class="lq-tag">★ ${Q.zoro ? 'ゾロめ ボーナス' : 'ラッキーもんだい'}！ コイン 3ばい ★</p>`;
  let side;
  if (!Q.word) {
    h += eqHTML() + (Q.miss ? `<div class="lq-hint" id="lq-hint">${Q.tier ? tierHint() : hintHTML()}</div>` : '') + (Q.tier && Q.miss >= 2 ? '<button type="button" class="btn lq-skip" data-skip="1">パスして つぎの もんだいへ</button>' : '');
    side = padHTML();
  } else {
    const s = Q.step;
    h += `<div class="lq-steps"><span class="${s === 0 ? 'on' : 'done'}">① ことばを みつける</span><span class="${s === 1 ? 'on' : s > 1 ? 'done' : ''}">② たす？ ひく？</span><span class="${s === 2 ? 'on' : ''}">③ けいさん</span></div>`;
    let sn = 0; // はじめ だけ、ばめん → とい の じゅんに 1文ずつ あらわれる
    h += `<div class="lq-story ${s === 0 ? 'pick' : ''}" id="lq-story">${Q.toks.map((t, i) => {
      const dl = Q.intro ? ` style="animation-delay:${sn * 350}ms"` : '';
      if (/。$/.test(t.t)) sn++;
      const shown = t.k && (s > 1 || (Q.tri && s === 1 && t.ki < Q.opi)); // たす／ひくが きまった ことばは 色を かえる（ひきざんは 青）
      const cls = `lq-tok${Q.intro ? ' tin' : ''}${t.k && s > 0 ? ` found${shown && t.o === '-' ? ' mi' : ''}` : ''}${t.k && ((s === 0 && Q.bad >= 2) || (s === 1 && Q.bad >= 1 && (!Q.tri || t.ki === Q.opi))) ? ' pulse' : ''}`;
      return `<button type="button" class="${cls}" data-tok="${i}"${dl}>${t.k ? `<span class="kw">${t.k}</span>` : ''}${t.t}</button>`;
    }).join(' ')}</div>`;
    if (Q.intro) { Q.intro = false; for (let k = 0; k < sn; k++) beep(520 + k * 130, 0.09, k * 0.35, 'triangle', 0.06); }
    if (Q.tri && s === 1) h += `<div class="lq-eq s t3">${Q.a}${Q.opi ? os(Q.o1) : '<span class="lq-ans q">？</span>'}${Q.b}<span class="lq-ans q">？</span>${Q.c}</div>`;
    const note = Q.tri && Q.o1 !== Q.o2 ? `「${Q.kw[0]}」は ${Q.o1 === '+' ? 'たしざん' : 'ひきざん'}、「${Q.kw[1]}」は ${Q.o2 === '+' ? 'たしざん' : 'ひきざん'}！`
      : `「${Q.kw.filter((x, i, a) => a.indexOf(x) === i).join('」「')}」は ${Q.op === '+' ? 'たしざん' : 'ひきざん'}の ことば！`;
    if (s === 2) h += `<p class="lq-note">${note}</p>${eqHTML(true)}${Q.miss ? `<div class="lq-hint" id="lq-hint">${hintHTML()}</div>` : ''}`;
    if (s === 0) side = '<p class="lq-guide">たしざんか ひきざんかが わかる<br>「だいじな ことば」を おそう！</p>';
    else if (s === 1) side = `<p class="lq-guide">${Q.tri ? `ことばを じゅんに みて…<br><b>${Q.opi + 1}つめ</b>は どっちの けいさん？` : 'きいろの ことばを よく みて…<br>どっちの けいさん？'}</p>
      <div class="lq-ops"><button type="button" class="lq-opb add" data-op="+"><span>＋</span>たしざん</button><button type="button" class="lq-opb sub" data-op="-"><span>−</span>ひきざん</button></div>`;
    else side = padHTML();
  }
  const flames = sf || Q.tier ? `<div class="lq-flames" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="animation-delay:-${(i * 137) % 500}ms"></i>`).join('')}</div>` : '';
  app().innerHTML = `${h}</div><div class="lq-side">${side}</div>${flames}</main>`;
  app().onclick = click;
  if (Q.spin && !Q.spinning) { Q.spinning = true; if (Q.tier) hellIn(Q); else if (Q.tri) triIn(Q); else presentQ(Q); }
}
const setAns = () => { const e = document.getElementById('lq-ans'); if (e) e.textContent = Q.input || '？'; };
function click(e) {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (busy) return;
  const d = b.dataset;
  if (d.menu) { sfx.tap(); return learnMenu(); }
  if (Date.now() < lockUntil) return;
  if (d.key != null) { if (Q.done || Q.spin) return; if (Q.input.length < (Q.tier ? 3 : 2)) Q.input = String(+(Q.input + d.key)); sfx.tap(); return setAns(); }
  if (d.del) { if (Q.spin) return; Q.input = ''; sfx.tap(); return setAns(); }
  if (d.ent) return answer();
  if (d.unhell) { st.hell = false; sfAsked = true; sfx.tap(); next(); return render(); } // じぶんで やめる：この フィーバーの あいだは もう きかない
  if (d.skip) { st.combo = 0; keep(); sfx.tap(); next(); return render(); } // パス：れんぞくは きれる
  if (d.tok != null) {
    if (!Q.word || Q.step !== 0) return;
    if (Q.toks[+d.tok].k) { Q.step = 1; sfx.uncommon(); render(); return gainSmall('みつけた！'); }
    Q.bad++; st.combo = 0; keep();
    if (Q.bad === 2) render(); else { b.classList.add('ng'); setTimeout(() => b.classList.remove('ng'), 400); }
    return oops();
  }
  if (d.op) {
    if (Q.step !== 1) return;
    if (Q.tri && !Q.opi) { // 3つの かず：1つめの けいさんを えらぶ（コインは 2つめまで えらんだ ときに もらえる）
      if (d.op === Q.o1) { Q.opi = 1; sfx.uncommon(); return render(); }
      Q.bad++; st.combo = 0; keep(); render(); return oops();
    }
    if (d.op === (Q.tri ? Q.o2 : Q.op)) { Q.step = 2; sfx.uncommon(); render(); return gainSmall(Q.tri ? 'しきが できた！' : Q.op === '+' ? 'たしざん！' : 'ひきざん！'); }
    Q.bad++; st.combo = 0; keep(); render(); return oops();
  }
}
// れんぞく せいかいを セーブに のこす
function keep() { L().combo = st.combo; O.save(); }
const coinUp = () => { const c = document.getElementById('lq-coin'); if (c) c.textContent = S().pts; };
// 文しょう題の とちゅうの ステップ：いつも 10コイン（ばいりつは かけない）。小さく 出す
function gainSmall(label) { S().pts += LEARN_COIN; S().earned = (S().earned || 0) + LEARN_COIN; O.save(); pop(`<span>${label}<small>コイン ＋${LEARN_COIN}</small></span>`, 'p0', 900); coinUp(); }
function gain(base) {
  const m = mult(Q, st.combo), g = base * m;
  S().pts += g; S().earned = (S().earned || 0) + g;
  const ch = cheer(st.combo);
  const body = `${ch[1]}<small>コイン ＋${g}${m > 1 ? `（${m}ばい！）` : ''}</small>`;
  pop(ch[0] ? body : `<span>${body}</span>`, `p${ch[0]}`, [900, 850, 950, 1000][ch[0]]);
  coinUp();
}
function answer() {
  if (busy || Q.done || Q.spin || !Q.input) return;
  if (+Q.input === Q.ans) {
    Q.done = true; busy = true; st.okSeen++;
    st.combo = Q.miss || Q.bad ? 0 : st.combo + 1;
    if (st.combo < SF_COMBO) sfAsked = false; // フィーバーが きれたら、つぎの フィーバーで また きいて よい
    L().units[st.mode].ok++; L().combo = st.combo;
    (st.combo >= 5 ? sfx.rare : sfx.uncommon)(); document.getElementById('lq-ans')?.classList.add('ok');
    const mode = st.mode, q = Q;
    gain(LEARN_COIN); reward(); O.save();
    setTimeout(async () => {
      if (Q !== q || !st || st.mode !== mode) { busy = false; return; }
      // フィーバーに なったら 1回 だけ きく（式の もんだい だけ。「はいらない」なら この フィーバーの あいだは もう きかない）
      if (!Q.word && !st.hell && !sfAsked && st.combo >= SF_COMBO) { sfAsked = true; if (await askHell()) await enterHell(); }
      busy = false; next(); render();
    }, 1300);
  } else {
    Q.miss++; Q.input = ''; st.combo = 0; keep(); render();
    document.getElementById('lq-ans')?.classList.add('soft'); oops();
  }
}
// フィーバーに なった とき：スーパーフィーバーに 入るか じぶんで えらぶ（おちついた 画面。うごく えんしゅつは 出さない）
function askHell() {
  return new Promise((res) => {
    clearFx();
    const ov = document.createElement('div'); ov.id = 'lq-ask'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = `<div class="lq-ask-in"><h3>スーパーフィーバーモード はいる？</h3>
      <p>ときどき <b>むずかしい もんだい</b>（おおきい かず・かけざん）が でるよ。<br>せいかいすると コインが <b>4ばい いじょう</b>！ まちがえると おわるよ。</p>
      <div class="lq-ask-btns"><button type="button" class="btn primary" data-v="1">はいる</button><button type="button" class="btn" data-v="0">はいらない</button></div></div>`;
    document.body.appendChild(ov);
    ov.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; sfx.tap(); ov.remove(); res(b.dataset.v === '1'); };
  });
}
// 「はいる」の すぐ あと：あんてん → まんなかから ひかりの すじ → とくだいの 字（やく 1.5びょう）
async function enterHell() {
  st.hell = true;
  const l = L(), first = !l.sf; if (first) { l.sf = 1; S().gp += LEARN_GP.sf; O.save(); }
  const dark = layer('.lfx-dark');
  dark.style.opacity = 1; await sleep(300); dark.style.opacity = 0;
  dark.animate([{ opacity: 0.85 }, { opacity: 0.6, offset: 0.6 }, { opacity: 0 }], { duration: 1500 });
  beams(1500, '#ffb000'); flash(0.5); quake();
  pop('<b>スーパーフィーバー！</b>', 'p3 sf', 1500);
  setTimeout(() => { stars(28); confetti(110); }, 250);
  sfx.legend();
  await sleep(1500);
  if (first) { sfx.unlock(); pop(`<span>せいちょうポイント ＋${LEARN_GP.sf}<small>はじめての スーパーフィーバー</small></span>`, 'gp', 2200); }
}
// テスト用（tools/e2e_oripa.mjs）：いまの もんだいと ようす
export const learnPeek = () => (Q ? { mode: st.mode, a: Q.a, b: Q.b, c: Q.c, op: Q.op, o1: Q.o1, o2: Q.o2, ans: Q.ans, tri: !!Q.tri, tier: Q.tier || 0, lucky: !!Q.lucky, word: !!Q.word, step: Q.step, spin: !!Q.spin, pres: Q.pres || '', kw: Q.toks ? Q.toks.map((t, i) => (t.k ? i : -1)).filter((i) => i >= 0) : [], opi: Q.opi, combo: st.combo, hell: st.hell, qSeen: st.qSeen, okSeen: st.okSeen, busy } : null);
export const learnPoke = (o) => { if (st) Object.assign(st, o); }; // テスト用：れんぞく などを きめる
