// もんしょう（REQUIREMENTS 12章）：しゅぎょう（ui/study.js）で ポイントを ためて、スキルツリーから えらぶ。えらんでから 12じかん つづく
// こうかは ぼうけんの たたかい だけ（app.js の fight → battle.js → game.js の newGame）
import { EMBLEMS, BRANCHES, EMBLEM_BY_ID, EMBLEM_HOURS, BANNERS, emblemEffects } from '../data/emblems.js';
import { CATS, pointsFor, passed } from '../data/quiz.js';
import { sheet, esc, ruby, info, noRuby, toast } from './view.js';
import { studyScreen } from './study.js';
import { DEV } from './settings.js';

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
export const activeEffects = () => emblemEffects(activeIds(), M.pick || {});
const retPts = (now = Date.now()) => (M.ret && M.ret.until > now ? M.ret.pts : 0);
export const emblemPoints = () => M.pts + retPts();
export const addEmblemPoints = (n) => { M.pts += n; save(); }; // ストーリーモードの ごほうび
const quizCats = () => (M.cats?.length ? M.cats.filter((c) => CATS[c]) : Object.keys(CATS));
const LV = (n) => `レベル${n}`; // 1ねんせいは ローマ数字を ならわないので すうじで
const branchOf = (e) => BRANCHES.find((b) => b.id === e.branch);
const named = (e) => branchOf(e).one || branchOf(e).named; // レベルでは なく 名前で よぶ もんしょう
const bannerName = () => { const d = BANNERS.find((x) => x.id === M.pick?.pBanner); return d ? info(d).name : ''; };
export const leftText = (ms) => { const m = Math.max(1, Math.ceil(ms / 60000)); const h = Math.floor(m / 60); return h ? `${h}じかん${m % 60 ? ` ${m % 60}ふん` : ''}` : `${m}ふん`; };

// しゅぎょうの けっかを のこして、もらった ポイントを かえす
// mode：'gate'＝ぼうけんの まえ（ごうかくで ＋1）、'bonus'＝ボーナス（ふつうの ポイント ＋2）
function recordQuiz(r, mode) {
  const { n, ok, stat } = r;
  const pass = passed(n, ok);
  const gain = mode === 'gate' ? (pass ? GATE_PTS : 0) : pointsFor(n, ok) + (mode === 'bonus' && pass ? BONUS_PTS : 0);
  if (mode === 'bonus' && pass) r.bonus = BONUS_PTS;
  M.pts += gain;
  M.total.quiz++; if (gain) { M.total.pass++; M.total.pts += gain; }
  M.log = [{ t: Date.now(), n, ok, gain }, ...M.log].slice(0, 20);
  for (const [c, [a, b]] of Object.entries(stat)) { const x = M.stat[c] || (M.stat[c] = [0, 0]); x[0] += a; x[1] += b; }
  save();
  return gain;
}

// ---- ぼうけんの まえと おわりの しゅぎょう（広告の ように 1かい はさむ。docs/EMBLEMS.md 8章） ----
export const GATE_PTS = 1, BONUS_PTS = 2;
const GATE_SAY = {
  theros: { who: 'テーロスの 神々', text: 'ちしきの ない ものは、かみに えっけんする ことは できない' },
  ravnica: { who: 'ジェイス', text: 'ぼくの とうに のぼりたいなら、さいていげんの ちえを みせてくれ' },
};
const MORE_SAY = {
  theros: { who: 'テーロスの 神々', text: 'もっと つよく なりたいか？' },
  ravnica: { who: 'ジェイス', text: 'もっと つよく なりたいかい？' },
};
// ぼうけんの まえ：しゅぎょう（ごうかくで ＋1）→ もんしょうを えらぶ（ここで もう いちど やると ボーナス ＋2）→ next（パックへ）
export function gateStudy(app, plane, next) {
  const toEmblems = () => emblemScreen(app, next, { bonus: true, goLabel: 'ぼうけんへ すすむ' });
  studyScreen(app, {
    cats: quizCats(), setCats: (c) => { M.cats = c; save(); }, record: (r) => recordQuiz(r, 'gate'), back: toEmblems,
    eyebrow: 'ぼうけんの まえに', say: GATE_SAY[plane] || GATE_SAY.theros, reward: `もんしょうポイント ＋${GATE_PTS}`, noBack: true, noAgain: true, doneLabel: 'もんしょうを えらぶ',
  });
}
// ぼうけんの おわり：「もっと つよく なりたいか？」→ ボーナスの しゅぎょう → もんしょうを えらぶ
export function moreStudy(app, plane, back) {
  studyScreen(app, {
    cats: quizCats(), setCats: (c) => { M.cats = c; save(); }, record: (r) => recordQuiz(r, 'bonus'), back: () => emblemScreen(app, back), quit: back,
    eyebrow: 'ぼうけんの おわりに', say: MORE_SAY[plane] || MORE_SAY.theros, reward: `もんしょうポイント ＋3 と ボーナス ＋${BONUS_PTS}`, backLabel: 'やめて タイトルへ', noAgain: true,
  });
}

// むげんの とうの 休けい所：しゅぎょうに ごうかくすると 祝福（docs/ENDLESS.md）。done(ごうかく したか)
const BLESS_SAY = {
  theros: { who: 'テーロスの 神々', text: 'ちえを しめせば、しゅくふくを さずけよう' },
  ravnica: { who: 'ジェイス', text: 'ここまで きたのか。ちえを みせて くれたら、しゅくふくを あげよう' },
};
export function blessStudy(app, plane, done) {
  let pass = false;
  studyScreen(app, {
    cats: quizCats(), setCats: (c) => { M.cats = c; save(); }, record: (r) => { pass = passed(r.n, r.ok); return recordQuiz(r, 'bless'); },
    back: () => done(pass), quit: () => done(false),
    eyebrow: 'むげんの とう 休けい所', say: BLESS_SAY[plane] || BLESS_SAY.theros, reward: 'しゅくふくを 1つ（もんしょうポイントも もらえる）', backLabel: 'しゅぎょうしないで すすむ', doneLabel: 'つぎへ', noAgain: true,
  });
}

// えらべない わけ（なければ ''）
function why(e, now = Date.now()) {
  if ((M.got[e.id] || 0) > now) return 'ついて いる';
  if (e.need && !((M.got[e.need] || 0) > now)) return `さきに ${LV(EMBLEM_BY_ID[e.need].lv)}が いる`;
  const other = branchOf(e).one && EMBLEMS.find((x) => x.branch === e.branch && x !== e && (M.got[x.id] || 0) > now);
  if (other) return `ヴァンガードは 1つだけ（いまは ${other.name}。「ふりなおす」で かえられる）`;
  const max = branchOf(e).max;
  if (max && EMBLEMS.filter((x) => x.branch === e.branch && (M.got[x.id] || 0) > now).length >= max) return `${branchOf(e).name}は ${max}つまで（「ふりなおす」で かえられる）`;
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
  const cols = EMBLEMS.filter((e) => e.branch === 'color' && on.has(e.id)); if (cols.length) out.push(`◆ ${cols.map((e) => e.name).join('と ')}`);
  for (const e of EMBLEMS.filter((x) => x.branch === 'pack' && on.has(x.id))) out.push(`🎴 ${e.id === 'pBanner' && bannerName() ? `はじめの はた：${noRuby(bannerName())}` : noRuby(e.name)}`);
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

// o.bonus：つぎの しゅぎょう 1かいだけ ボーナス ＋2（ぼうけんの まえ）。o.goLabel：もどる ボタンの ことば
export function emblemScreen(app, back, o = {}) {
  const draw = () => {
    const now = Date.now();
    const node = (e) => {
      const left = (M.got[e.id] || 0) - now;
      const st = left > 0 ? 'on' : why(e, now) ? 'lock' : 'can';
      return `<li><button type="button" class="em-node ${st}" data-id="${e.id}" aria-label="${esc(branchOf(e).name)} ${LV(e.lv)}">
        <span class="em-lv">${branchOf(e).mark}<b>${named(e) ? ruby(e.name) : LV(e.lv)}</b></span>
        <span class="em-text">${esc(e.text)}${e.id === 'pBanner' && left > 0 && bannerName() ? `（${ruby(bannerName())}）` : ''}</span>
        <em>${st === 'on' ? `のこり ${leftText(left)}` : `${e.cost}ポイント`}</em></button></li>`;
    };
    const tries = M.log.slice(0, 5);
    const stats = Object.entries(CATS).filter(([k]) => M.stat[k]);
    app().innerHTML = `<main class="emblem">
      <h2${DEV ? ' data-admin="1"' : ''}>もんしょう</h2>
      <p class="em-pts">もんしょうポイント <b>${emblemPoints()}</b>${retPts(now) ? `<small>（ふりなおした ${retPts(now)}ポイントは のこり ${leftText(M.ret.until - now)}で きえる）</small>` : ''}</p>
      <button type="button" class="btn primary em-study ${o.bonus ? 'em-bonus' : ''}" data-study="1">${o.bonus ? `いま やると ＋${BONUS_PTS}ポイント ボーナス！` : 'しゅぎょうを する（60びょう）'}<small>7わりより おおく せいかいで ＋3ポイント${o.bonus ? `、さらに ＋${BONUS_PTS}` : ''}</small></button>
      <p class="zk-note">ポイントで もんしょうを えらぶと、${EMBLEM_HOURS}じかん ぼうけんの たたかいで つよく なる（オンライン バトルでは つかえない）。レベル2・3 は まえの レベルが ついて いる ときに えらべる。</p>
      ${BRANCHES.map((b) => `<section class="em-branch ${b.one || b.named ? 'one' : ''}"><h3>${b.mark} ${esc(b.name)}${b.one ? '<small>（1つだけ えらぶ）</small>' : b.max ? `<small>（${b.max}つまで）</small>` : ''}</h3><ol class="em-nodes">${EMBLEMS.filter((e) => e.branch === b.id).map(node).join('')}</ol></section>`).join('')}
      ${tries.length ? `<h3 class="zk-h">しゅぎょうの きろく</h3><ol class="em-log">${tries.map((r) => `<li><span>${new Date(r.t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><b>${r.ok} / ${r.n}</b><em>${r.gain ? `＋${r.gain}ポイント` : '−'}</em></li>`).join('')}</ol>` : ''}
      ${stats.length ? `<h3 class="zk-h">しゅるいごとの せいかい</h3><ul class="qz-break">${stats.map(([k, c]) => `<li><span>${esc(c.name)}</span><b>${M.stat[k][1]} / ${M.stat[k][0]}</b></li>`).join('')}</ul>` : ''}
      ${activeIds(now).length ? '<button type="button" class="btn" data-respec="1">ポイントを ふりなおす<small>ついて いる もんしょうを はずして ポイントを もどす（のこり じかんは そのまま）</small></button>' : ''}
      <p class="zk-note">ぜんぶで しゅぎょう ${M.total.quiz}かい・ごうかく ${M.total.pass}かい・もらった ポイント ${M.total.pts}</p>
      <button type="button" class="btn ${o.goLabel ? 'primary' : ''}" data-back="1">${esc(o.goLabel || 'タイトルへ もどる')}</button>
    </main>`;
  };
  const again = () => emblemScreen(app, back, { ...o, bonus: false }); // ボーナスは 1かいだけ
  draw();
  // 12じかんが すぎたら 画面も かわる（1ぷん ごと）
  const iv = setInterval(() => { if (!document.querySelector('main.emblem')) clearInterval(iv); else if (!document.getElementById('sheet') || document.getElementById('sheet').hidden) draw(); }, 60000);
  // 管理者の けんしょう用（開発モードだけ）：上の「もんしょう」を 10かい つづけて おすと ポイント ＋999
  let taps = 0, tapAt = 0;
  app().onclick = async (e) => {
    if (DEV && e.target.closest('[data-admin]')) {
      const now = Date.now();
      taps = now - tapAt < 1500 ? taps + 1 : 1; tapAt = now;
      if (taps >= 10) { taps = 0; M.pts += 999; save(); draw(); toast('かんりしゃ：もんしょうポイント ＋999'); }
      return;
    }
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
      return studyScreen(app, { cats: quizCats(), setCats: (c) => { M.cats = c; save(); }, record: (r) => recordQuiz(r, o.bonus ? 'bonus' : ''), back: again, ...(o.bonus ? { reward: `もんしょうポイント ＋3 と ボーナス ＋${BONUS_PTS}`, eyebrow: 'ボーナスの しゅぎょう' } : {}) });
    }
    if (b.dataset.id) {
      const em = EMBLEM_BY_ID[b.dataset.id];
      const now = Date.now(), left = (M.got[em.id] || 0) - now, w = why(em, now);
      const head = `<p class="em-big">${branchOf(em).mark} ${esc(branchOf(em).name)} ${named(em) ? ruby(em.name) : LV(em.lv)}</p><p>${esc(em.text)}</p>${em.detail ? `<p class="zk-note">${esc(em.detail)}</p>` : ''}`;
      if (left > 0) return sheet(`${head}<p>ついて いる。のこり ${leftText(left)}。</p>`, [{ label: 'とじる', value: 0 }]);
      if (w) return sheet(`${head}<p>${esc(w)}</p>`, [{ label: 'とじる', value: 0 }]);
      const have = emblemPoints();
      const v = await sheet(`${head}<p>ポイント ${have} − ${em.cost} ＝ ${have - em.cost} に なる。${retPts(now) ? `ふりなおした ポイントを つかうので、のこり ${leftText(M.ret.until - now)} つづく。` : `${EMBLEM_HOURS}じかん つづく。`}</p>`,
        [{ label: `${em.cost}ポイントで えらぶ`, value: 1, kind: 'primary' }, { label: 'やめる', value: 0 }], { title: 'もんしょうを えらぶ' });
      if (!v || why(em)) return draw();
      // はじめの 旗：10まいから 1つ えらぶ
      if (em.id === 'pBanner') {
        const pickB = await sheet('<p>ぼうけんの はじめから もつ はたを えらぶ。はたが あると、その 3色の デッキが くめる（はたは 4点）。</p>',
          [...BANNERS.map((d) => ({ label: ruby(info(d).name), value: d.id, kind: 'primary', note: d.banner.split('').map((c) => ({ W: '白', U: '青', K: '黒', R: '赤', G: '緑' })[c]).join('・') })), { label: 'やめる', value: null }],
          { title: 'はじめの はたを えらぶ' });
        if (!pickB) return draw();
        M.pick = { ...(M.pick || {}), pBanner: pickB };
      }
      buy(em);
      draw();
    }
  };
}
