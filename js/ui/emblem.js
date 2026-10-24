// もんしょう（REQUIREMENTS 12章）：しゅぎょう（ui/study.js）で ポイントを ためて、スキルツリーから えらぶ。えらんでから 12じかん つづく
// こうかは ぼうけんの たたかい だけ（app.js の fight → battle.js → game.js の newGame）
import { EMBLEMS, BRANCHES, EMBLEM_BY_ID, EMBLEM_HOURS, emblemEffects } from '../data/emblems.js';
import { CATS, pointsFor } from '../data/quiz.js';
import { sheet, esc } from './view.js';
import { studyScreen } from './study.js';

const KEY = 'mtg-emblem-v1';
const HOUR = 3600 * 1000;
// { pts：ためた ポイント, got：{ id: きれる とき（ミリびょう） }, cats：もんだいの しゅるい, log：しゅぎょうの きろく（あたらしい 20こ）,
//   stat：{ しゅるい: [とけた, せいかい] }, total：{ quiz, pass, pts }, ret：ふりなおしで もどった ポイント { pts, until } }
// ふりなおし：ついて いる もんしょうを はずして ポイントを もどす。もどった ポイントは、もとの もんしょうが きれる とき（until）まで つかえて、
// それで えらんだ もんしょうも その ときに きれる（ふりなおしで 12じかんが のびない ように）
function load() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && v.got) return v; } catch { /* こわれていたら はじめから */ }
  return { pts: 0, got: {}, cats: null, log: [], stat: {}, total: { quiz: 0, pass: 0, pts: 0 } };
}
let M = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(M)); } catch { /* 保存できなくても あそべる */ } };

export const activeIds = (now = Date.now()) => EMBLEMS.filter((e) => (M.got[e.id] || 0) > now).map((e) => e.id);
export const activeEffects = () => emblemEffects(activeIds());
const retPts = (now = Date.now()) => (M.ret && M.ret.until > now ? M.ret.pts : 0);
export const emblemPoints = () => M.pts + retPts();
const quizCats = () => (M.cats?.length ? M.cats.filter((c) => CATS[c]) : Object.keys(CATS));
const LV = (n) => `レベル${n}`; // 1ねんせいは ローマ数字を ならわないので すうじで
const branchOf = (e) => BRANCHES.find((b) => b.id === e.branch);
export const leftText = (ms) => { const m = Math.max(1, Math.ceil(ms / 60000)); const h = Math.floor(m / 60); return h ? `${h}じかん${m % 60 ? ` ${m % 60}ふん` : ''}` : `${m}ふん`; };

// しゅぎょうの けっかを のこして、もらった ポイントを かえす
function recordQuiz({ n, ok, stat }) {
  const gain = pointsFor(n, ok);
  M.pts += gain;
  M.total.quiz++; if (gain) { M.total.pass++; M.total.pts += gain; }
  M.log = [{ t: Date.now(), n, ok, gain }, ...M.log].slice(0, 20);
  for (const [c, [a, b]] of Object.entries(stat)) { const x = M.stat[c] || (M.stat[c] = [0, 0]); x[0] += a; x[1] += b; }
  save();
  return gain;
}

// えらべない わけ（なければ ''）
function why(e, now = Date.now()) {
  if ((M.got[e.id] || 0) > now) return 'ついて いる';
  if (e.need && !((M.got[e.need] || 0) > now)) return `さきに ${LV(EMBLEM_BY_ID[e.need].lv)}が いる`;
  const other = branchOf(e).one && EMBLEMS.find((x) => x.branch === e.branch && x !== e && (M.got[x.id] || 0) > now);
  if (other) return `ヴァンガードは 1つだけ（いまは ${other.name}。「ふりなおす」で かえられる）`;
  const have = M.pts + retPts(now);
  if (have < e.cost) return `ポイントが たりない（あと ${e.cost - have}）`;
  return '';
}

// たたかいの はじめ・とうの 画面に 出す：いま ついて いる もんしょう
export function emblemLine(now = Date.now()) {
  const on = new Set(activeIds(now));
  const top = (b) => EMBLEMS.filter((e) => e.branch === b && on.has(e.id)).sort((x, y) => y.lv - x.lv)[0];
  const out = [];
  const life = top('life'); if (life) out.push(`❤ はじめの ライフ ${20 + life.fx.life}`);
  const basic = top('basic'); if (basic) out.push(`🌱 きほんカード ＋${basic.fx.basic}${basic.fx.basicCharge ? '（マナでも）' : ''}`);
  if (on.has('start1')) out.push('☀ さいしょから マナ 1つ');
  if (on.has('start2')) out.push('☀ たいようの ゆびわ');
  const exact = top('exact'); if (exact) out.push(`✦ ぴったりで ライフ ＋${exact.fx.exactLife}`);
  if (on.has('mull')) out.push('☀ マリガン');
  const v = top('leader'); if (v) out.push(`♛ ${v.name}`);
  return out.join('・');
}

// ポイントを つかう（ふりなおしで もどった ポイントから さきに。つかったら その もんしょうは もとの きれる ときまで）
function buy(e) {
  const now = Date.now();
  let until = now + EMBLEM_HOURS * HOUR, cost = e.cost;
  const r = retPts(now);
  if (r) { const use = Math.min(r, cost); M.ret.pts -= use; cost -= use; until = M.ret.until; }
  M.pts -= cost;
  M.got[e.id] = until;
  save();
}
// ふりなおす：ついて いる もんしょうを ぜんぶ はずして ポイントを もどす
function respec() {
  const now = Date.now();
  const on = EMBLEMS.filter((e) => (M.got[e.id] || 0) > now);
  if (!on.length) return 0;
  const back = on.reduce((t, e) => t + e.cost, 0);
  const until = Math.max(...on.map((e) => M.got[e.id]), retPts(now) ? M.ret.until : 0);
  M.ret = { pts: retPts(now) + back, until };
  for (const e of on) delete M.got[e.id];
  save();
  return back;
}

export function emblemScreen(app, back) {
  const draw = () => {
    const now = Date.now();
    const node = (e) => {
      const left = (M.got[e.id] || 0) - now;
      const st = left > 0 ? 'on' : why(e, now) ? 'lock' : 'can';
      return `<li><button type="button" class="em-node ${st}" data-id="${e.id}" aria-label="${esc(branchOf(e).name)} ${LV(e.lv)}">
        <span class="em-lv">${branchOf(e).mark}<b>${branchOf(e).one ? esc(e.name) : LV(e.lv)}</b></span>
        <span class="em-text">${esc(e.text)}</span>
        <em>${st === 'on' ? `のこり ${leftText(left)}` : `${e.cost}ポイント`}</em></button></li>`;
    };
    const tries = M.log.slice(0, 5);
    const stats = Object.entries(CATS).filter(([k]) => M.stat[k]);
    app().innerHTML = `<main class="emblem">
      <h2>もんしょう</h2>
      <p class="em-pts">もんしょうポイント <b>${emblemPoints()}</b>${retPts(now) ? `<small>（ふりなおした ${retPts(now)}ポイントは のこり ${leftText(M.ret.until - now)}で きえる）</small>` : ''}</p>
      <button type="button" class="btn primary em-study" data-study="1">しゅぎょうを する（60びょう）<small>7わりより おおく せいかいで ＋3ポイント</small></button>
      <p class="zk-note">ポイントで もんしょうを えらぶと、${EMBLEM_HOURS}じかん ぼうけんの たたかいで つよく なる（オンライン バトルでは つかえない）。レベル2・3 は まえの レベルが ついて いる ときに えらべる。</p>
      ${BRANCHES.map((b) => `<section class="em-branch ${b.one ? 'one' : ''}"><h3>${b.mark} ${esc(b.name)}${b.one ? '<small>（1つだけ えらぶ）</small>' : ''}</h3><ol class="em-nodes">${EMBLEMS.filter((e) => e.branch === b.id).map(node).join('')}</ol></section>`).join('')}
      ${tries.length ? `<h3 class="zk-h">しゅぎょうの きろく</h3><ol class="em-log">${tries.map((r) => `<li><span>${new Date(r.t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><b>${r.ok} / ${r.n}</b><em>${r.gain ? `＋${r.gain}ポイント` : '−'}</em></li>`).join('')}</ol>` : ''}
      ${stats.length ? `<h3 class="zk-h">しゅるいごとの せいかい</h3><ul class="qz-break">${stats.map(([k, c]) => `<li><span>${esc(c.name)}</span><b>${M.stat[k][1]} / ${M.stat[k][0]}</b></li>`).join('')}</ul>` : ''}
      ${activeIds(now).length ? '<button type="button" class="btn" data-respec="1">ポイントを ふりなおす<small>ついて いる もんしょうを はずして ポイントを もどす（のこり じかんは そのまま）</small></button>' : ''}
      <p class="zk-note">ぜんぶで しゅぎょう ${M.total.quiz}かい・ごうかく ${M.total.pass}かい・もらった ポイント ${M.total.pts}</p>
      <button type="button" class="btn" data-back="1">タイトルへ もどる</button>
    </main>`;
  };
  const again = () => emblemScreen(app, back);
  draw();
  // 12じかんが すぎたら 画面も かわる（1ぷん ごと）
  const iv = setInterval(() => { if (!document.querySelector('main.emblem')) clearInterval(iv); else if (!document.getElementById('sheet') || document.getElementById('sheet').hidden) draw(); }, 60000);
  app().onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.back) { clearInterval(iv); return back(); }
    if (b.dataset.respec) {
      const n = EMBLEMS.filter((x) => (M.got[x.id] || 0) > Date.now()).reduce((t, x) => t + x.cost, 0);
      const v = await sheet(`<p>ついて いる もんしょうを ぜんぶ はずして、${n}ポイント もどす。もどった ポイントで えらんだ もんしょうは、いまの もんしょうと おなじ ときに きれる。</p>`,
        [{ label: 'ふりなおす', value: 1, kind: 'primary' }, { label: 'やめる', value: 0 }], { title: 'ポイントを ふりなおす' });
      if (v) respec();
      return draw();
    }
    if (b.dataset.study) {
      clearInterval(iv);
      return studyScreen(app, { cats: quizCats(), setCats: (c) => { M.cats = c; save(); }, record: recordQuiz, back: again });
    }
    if (b.dataset.id) {
      const em = EMBLEM_BY_ID[b.dataset.id];
      const now = Date.now(), left = (M.got[em.id] || 0) - now, w = why(em, now);
      const head = `<p class="em-big">${branchOf(em).mark} ${esc(branchOf(em).name)} ${branchOf(em).one ? esc(em.name) : LV(em.lv)}</p><p>${esc(em.text)}</p>${em.detail ? `<p class="zk-note">${esc(em.detail)}</p>` : ''}`;
      if (left > 0) return sheet(`${head}<p>ついて いる。のこり ${leftText(left)}。</p>`, [{ label: 'とじる', value: 0 }]);
      if (w) return sheet(`${head}<p>${esc(w)}</p>`, [{ label: 'とじる', value: 0 }]);
      const have = emblemPoints();
      const v = await sheet(`${head}<p>ポイント ${have} − ${em.cost} ＝ ${have - em.cost} に なる。${retPts(now) ? `ふりなおした ポイントを つかうので、のこり ${leftText(M.ret.until - now)} つづく。` : `${EMBLEM_HOURS}じかん つづく。`}</p>`,
        [{ label: `${em.cost}ポイントで えらぶ`, value: 1, kind: 'primary' }, { label: 'やめる', value: 0 }], { title: 'もんしょうを えらぶ' });
      if (v && !why(em)) buy(em);
      draw();
    }
  };
}
