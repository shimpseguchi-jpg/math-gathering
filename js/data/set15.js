// 番外編「崩壊：スターレイル」第2弾「火を追う旅」のうごき（名前・コスト・P/T は skel.js、文は docs/EXTRA2_SR.md）
// 第1弾（set11.js）の しくみを そのまま つかう：戦技ポイント（チームで 1つ）・戦技・撃破（ぴったり）・必殺技（キャラが いると 安い）・光円錐・spCut
// あたらしい しくみ（docs/EXTRA2_SR.md 2章）
//   記憶の精霊：キャラ（と 一部の モブ）と つながった トークン（t.memoOf ＝ キャラの uid）。キャラが はなれると きえる。1キャラに 1体まで（もう いれば ＋1/＋1カウンター）
//   追加攻撃 N：def.followUp を game.js の resolveCombat が よぶ（みかたの 戦闘ダメージで のこった 敵の クリーチャーに N点。ぴったり → 撃破）
import { cr, T, mine, theirs, hit, foeBest, shrink, foe1, single, killIt, aura, regrow, isSub, gyCount, isSpellDef, bestIn, isCr } from './kit.js';
import { SP_START, spOf, addSP, trail, spend, foeSkill, selfPump, spCut, ult, biggest, foeTurn, foeThreat, canSwing, spPit, minusCtr } from './set11.js';
import { PICK_FREE } from '../engine/game.js';

// 自分で えらぶ ままの もの（game.js の PICK_FREE。格闘と、1・2・3点を どれに あてるか えらぶ のが 算数の もの）
PICK_FREE.add('SR145'); PICK_FREE.add('SR158');
// 2026-11-06（docs/REMOVAL.md 4.1）：1点・−1/−1 1こ・1体を タップ も じぶんで えらぶ
PICK_FREE.add('SR106'); PICK_FREE.add('SR109'); PICK_FREE.add('SR125'); PICK_FREE.add('SR126');

const isCrP = (q) => (q.def.types || []).includes('creature');
const isGolden = (q) => isSub(q, '黄金裔');
const spOn = (s, side) => s[side].sp ?? SP_START; // その がわの 戦技ポイント（オンラインバトルの あいても）
const leftOf = (s, E, t) => E.pt(s, t)[1] - t.dmg; // のこりの タフネス
const alive = (s, E) => theirs(s, E).filter((t) => leftOf(s, E, t) > 0 && !t.dt && !s.floor.untargetable?.(s, t, E));
const pickRand = (s, list) => (list.length ? list[Math.floor(s.rng() * list.length)] : null);
// 敵の 本体に あてられるか（本体の ない 階・本体に あてても いみの ない とき は いいえ）
const faceOK = (s, E, n) => typeof s.floor.face === 'function' && (!s.floor.faceValue || s.floor.faceValue(s, n, E) > 0);
// 「敵（本体）に n点」：本体が なければ AI が えらんだ 敵の パーマネント
const faceHit = (s, E, n, src = null) => { if (faceOK(s, E, n)) E.hitTarget(s, 'face', n, src); else E.hitEnemy(s, n, src); E.sba(s); };
// src が あたえる ダメージ（src の 撃破が おきる）
const zap = (s, E, t, n, src) => { if (!t || !E.onBf(s, t)) return; E.target(s, t); E.damage(s, t, n, src); E.sba(s); };
const allFoes = (s, E, n, src) => { for (const t of [...theirs(s, E)]) E.damage(s, t, n, src); E.sba(s); };

// ヘルタ（SR161）の トークン：おなじ 名前の「ヘルタ」（青の 1/1 の 構築物。伝説では ない ので 伝説の ルールに かからない）
const HERTA = cr('t_herta', 'ヘルタ', null, 'U', 0, 1, 1, ['construct']);
// ---- 戦技（set11.js の skillAct ＋ sk.can・sk.cantWhy。run の けっか（占術の Promise）を かえす） ----
const skill = (sk, max = 1) => ({
  cost: 0, spUse: true, when: [1, 2], label: `せんぎ：${sk.label}`,
  can: (s, p) => spOf(s) >= 1 && (p.flags.turn.skill || 0) < max && (!sk.can || sk.can(s, p)),
  cantWhy: sk.cantWhy || 'せんぎポイントが ない か、この ターンは もう つかった',
  play: (s, p, E, ctx) => { if (sk.can && !sk.can(s, p)) return null; const r = sk.play(s, p, E, ctx); return r && { score: r.score, run: (x) => { spend(s, E, p); return r.run(x); } }; },
  ...(sk.tgt ? { tgt: sk.tgt, apply: (s, E, picks, x, p) => { spend(s, E, p); return sk.apply(s, E, picks, p); } } : {}),
});
// この 弾の クリーチャー（攻撃で 戦技ポイント ＋1）。chara は 4マナ いじょうの レア・レジェンドの キャラ（戦技ポイント 2 で 2 安い）
const trail15 = ({ skill: sk, skillMax, ...rest } = {}) => trail({ ...rest, acts: [...(sk ? [skill(sk, skillMax)] : []), ...(rest.acts || [])] });
const chara = (x) => ({ ...trail15(x), ...spCut });

// ---- 追加攻撃 N（1ターンに max 回）。o.src：追加攻撃する クリーチャー（龍霊）。o.after：追加攻撃の あと（浮元） ----
// みかたが 攻撃して ダメージを あたえた のに たおれて いない 敵の クリーチャーに N点。のこりの タフネスが N と 同じ（ぴったり）を いちばんに ねらう
export const fu = (n, max = 1, o = {}) => ({
  fuN: n,
  followUp: (s, p, evs, E) => {
    if (p.side !== 'P') return;
    const src = o.src ? o.src(s, p, E) : p;
    if (!src || !E.onBf(s, src) || !isCrP(src) || src.dt || (leftOf(s, E, src) <= 0 && !E.hasKw(s, src, 'indestructible'))) return;
    for (let k = p.flags.turn.fu || 0; k < max && !s.over; k++) {
      const c = [...new Set(evs.filter((e) => e.src !== src && e.t && e.t !== 'face' && e.t.side === 'E').map((e) => e.t))]
        .filter((t) => E.onBf(s, t) && isCrP(t) && !t.dt && leftOf(s, E, t) > 0);
      if (!c.length) return;
      const t = c.find((x) => leftOf(s, E, x) === n) || c.filter((x) => leftOf(s, E, x) < n).sort((a, b) => E.power(s, b) - E.power(s, a))[0] || [...c].sort((a, b) => leftOf(s, E, a) - leftOf(s, E, b))[0];
      p.flags.turn.fu = k + 1;
      E.L(s, `ついかこうげき ${n}：${src.def.name} → ${t.def.name}（のこり ${leftOf(s, E, t)} − ${n}）`);
      E.damage(s, t, n, src);
      o.after?.(s, p, E, t);
      for (const q of [...s.P.bf]) if (E.onBf(s, q)) q.def.onFollowUp?.(s, q, E, src); // 黎明の ミハニ
    }
  },
});

// ---- 記憶の精霊 ----
const isMemo = (q) => !!q.def.memo;
const memoCount = (s, side) => s[side].bf.filter((q) => isMemo(q) && isCrP(q)).length;
export const memoOf = (s, p) => s[p.side].bf.find((q) => q.memoOf === p.uid);
// p と つながった 精霊を 出す。もう いれば ＋1/＋1カウンター
export function summonMemo(s, E, p, def) {
  if (!E.onBf(s, p)) return null;
  const m = memoOf(s, p);
  if (m) { E.L(s, `きおくの せいれい：${m.def.name} は もう いる → ＋1/＋1カウンター`); E.addCounters(s, m, 1); return m; }
  const [t] = E.token(s, p.side, def);
  if (t) { t.memoOf = p.uid; E.L(s, `きおくの せいれい：${def.name}（${p.def.name} と つながった）`); }
  return t || null;
}
// 精霊を 出す カードに かさねる：つながった キャラが はなれると 精霊も きえる
const memoLink = { onLeaveSelf: (s, p, E) => { for (const q of [...s[p.side].bf]) if (q.memoOf === p.uid) E.leave(s, q, 'exile'); } }; // ログ：「○○ が せんじょうを はなれた（きえた）」
// 精霊も この 弾の クリーチャー（攻撃で 戦技ポイント ＋1）
const spirit = (id, name, color, pow, tou, kw = []) => ({ ...cr(id, name, null, color, 0, pow, tou, ['記憶の精霊'], kw), memo: true, ...trail() });
const legends = (s, side) => s[side].bf.filter((q) => q.def.legend && isCrP(q)).length;
const T15 = {
  raftra: spirit('t_raftra', 'ラフトラ', 'W', (s, p) => spOn(s, p.side) + 1, 3, ['flying']), // X ＝ 戦技ポイント ＋ 1
  shiryu: spirit('t_shiryu', '死竜（しりゅう）', 'K', 5, 5, ['flying']),
  ikarun: spirit('t_ikarun', 'イカルン', 'G', 1, 1, ['flying']),
  myurion: spirit('t_myurion', 'ミュリオン', 'U', (s, p) => legends(s, p.side) + 1, (s, p) => legends(s, p.side) + 1), // X ＝ 伝説の クリーチャー ＋ 1
  nagayo: spirit('t_nagayo', '長夜（ながよ）', 'U', (s, p) => 2 * memoCount(s, p.side), (s, p) => 2 * memoCount(s, p.side), ['flying']), // X ＝ 精霊の 数 × 2
  memoW: spirit('t_memoW', '記憶（きおく）の精霊（せいれい）', 'W', 1, 1, ['flying']),
  memoG: spirit('t_memoG', '記憶（きおく）の精霊（せいれい）', 'G', 1, 1),
  trian: cr('t_trian', 'トリアン', null, 'R', 0, 1, 1, ['human']),
  trinon: cr('t_trinon', 'トリノン', null, 'R', 0, 1, 1, ['human']),
  kabu: cr('t_kabu', 'カブ', null, 'R', 0, 1, 1, ['カブ'], [], fu(2)),
  fugen: cr('t_fugen', '浮元（ふげん）', null, 'G', 0, 0, 3, ['浮元'], [], fu(1, 1, { after: (s, p, E) => E.gain(s, 1) })),
};

// ---- カードごとの 道具 ----
// キャストリス：新蕾 5こで 死竜（ライフ 1点で 1こ）
export const BUD = 5;
// ファイノン：ターンの はじめに 火種 ＋3（12こまで）。6こで カスライナ
export const FIRE = 3;
// ケリュドラ：軍功（＋1/＋1カウンター）。3こ いじょうで 爵位（二段攻撃）
const medal = (s, E, t) => {
  if (!t || !E.onBf(s, t)) return;
  E.target(s, t); E.addCounters(s, t, 1);
  if (t.ctr >= 3) { E.pump(t, 0, 0, ['double']); E.L(s, `しゃくい：${t.def.name}（カウンター ${t.ctr}こ）は 二だんこうげき`); }
};
// 丹恒・騰荒：龍霊（1つだけ）
const dragonOf = (s, p) => s[p.side].bf.find((q) => q.uid === p.dragonOn && q !== p) || null;
const setDragon = (s, E, p, t) => { if (!t || !E.onBf(s, t) || t === p) return; E.target(s, t); p.dragonOn = t.uid; E.L(s, `りゅうれい：${t.def.name} に ついた（＋1/＋0・ついかこうげき 1）`); };
// サンデー：その クリーチャーと つながった 精霊も
const sunday = (s, E, t) => { if (!t || !E.onBf(s, t)) return; E.target(s, t); E.pump(t, 2, 0); const m = memoOf(s, t); if (m) E.pump(m, 2, 0); };
// アナイクス：ランダムな 敵（クリーチャーか 本体）に 1点
const pingRandom = (s, E, n, src) => {
  const t = pickRand(s, [...alive(s, E), ...(faceOK(s, E, n) ? ['face'] : [])]);
  if (!t) return;
  if (t === 'face') E.hitTarget(s, 'face', n, src); else E.damage(s, t, n, src);
  E.sba(s);
};
// 天才たちの「挨拶」・魔法だって言ったでしょ：もとの P/T が 1/1（ターン終了時まで）
const frog = (s, E, t) => { if (!t || !E.onBf(s, t)) return; E.target(s, t); t.setPT = [1, 1]; E.L(s, `${t.def.name} は 1/1 に なった`); };
// 物語を めくって：上から 6まい、コスト 3 いかの クリーチャーを 2まいまで 戦場に
function storyFlip(s, E) {
  const top = s.P.lib.splice(0, 6);
  const pick = top.filter((c) => isCr(c.def) && !c.def.x && c.def.cost <= 3).sort((a, b) => b.def.cost - a.def.cost || E.keepValue(s, b) - E.keepValue(s, a)).slice(0, 2);
  s.P.lib.push(...top.filter((c) => !pick.includes(c)));
  E.L(s, `6まい 見て ${pick.length}まいを せんじょうへ`);
  for (const c of pick) E.enter(s, 'P', c.def, { card: c.def });
}
// 永訣よ美しくあれ：はかいして、その タフネスの ぶん ライフを 失う
const vendetta = (s, E, t) => { if (!t || !E.onBf(s, t)) return; E.target(s, t); const n = Math.max(0, E.pt(s, t)[1]); killIt(s, E, t); E.hurt(s, n); };
// 烈火の彼方：3点（墓地に インスタント・ソーサリーが 2まい いじょうで 4点。Fiery Impulse は 2・3点。docs 6.1）
const fiery = (s) => (s.P.gy.filter((c) => isSpellDef(c.def)).length >= 2 ? 4 : 3);
// 流すなら涙より汗：パワーが 2 なら ＋2/＋2、そして 格闘
const swipe = (s, E, a, b) => { if (!a || !b || !E.onBf(s, a) || !E.onBf(s, b)) return; E.target(s, a); if (E.power(s, a) === 2) E.pump(a, 2, 2); E.fight(s, a, b); E.sba(s); };
// ファイノンの 必殺技：パワーを 2ばいに
const fury = (s, E, t) => { if (!t || !E.onBf(s, t)) return; E.target(s, t); const x = Math.max(0, E.power(s, t)); E.pump(t, x, 0); E.L(s, `${t.def.name}：パワー ${x} ＋ ${x} ＝ ${2 * x}`); };
// 乱破の 必殺技：1点・2点・3点を ちがう 敵の クリーチャーに（たりなければ 本体）
const NINPO = [1, 2, 3];
function ninpoPlan(s, E) {
  const cs = alive(s, E).sort((a, b) => (s.floor.priority(s, b, E) || 0) - (s.floor.priority(s, a, E) || 0)).slice(0, 7);
  const k = Math.min(3, cs.length);
  const val = (t, a) => { if (t === 'face') return faceOK(s, E, a) ? Math.max(0, s.floor.faceValue?.(s, a, E) ?? a) : 0; const nd = E.need(s, t); return nd <= a ? (s.floor.priority(s, t, E) || 1) + 2 + (nd === a ? 3 : 0) : a * 0.2; };
  let best = null, bv = -1;
  const rec = (i, used, plan, v) => {
    if (i === 3) { if (used.size === k && v > bv) { bv = v; best = [...plan]; } return; }
    for (const t of cs) if (!used.has(t)) { used.add(t); plan.push(t); rec(i + 1, used, plan, v + val(t, NINPO[i])); plan.pop(); used.delete(t); }
    if (3 - i > k - used.size) { plan.push('face'); rec(i + 1, used, plan, v + val('face', NINPO[i])); plan.pop(); }
  };
  rec(0, new Set(), [], 0);
  return { plan: best || ['face', 'face', 'face'], v: bv };
}
function ninpo(s, E, plan) {
  const used = new Set();
  plan.forEach((t, i) => {
    const n = NINPO[i];
    if (t && t !== 'face' && E.onBf(s, t) && !used.has(t)) { used.add(t); E.target(s, t); E.damage(s, t, n, null); } else faceHit(s, E, n);
  });
  E.sba(s);
}
const tribbieOn = (s) => s.P.bf.some((q) => q.def.id === 'SR86');

export const S15 = {
  // ---- キャラ（レジェンド） ----
  SR81: chara({ ...memoLink, etb: (s, p, E) => { summonMemo(s, E, p, T15.raftra); } }), // アグライア：ラフトラ（X/3。X ＝ 戦技ポイント ＋ 1）
  SR82: chara({ // キャストリス：新蕾と 死竜
    ...memoLink,
    onLifeLoss: (s, p, E, n) => {
      if (p.side !== 'P' || !E.onBf(s, p)) return;
      const was = p.bud || 0; p.bud = was + n;
      E.L(s, `しんらい ${was} ＋ ${n} ＝ ${p.bud}`);
      while (p.bud >= BUD && E.onBf(s, p) && !s.over) { p.bud -= BUD; E.L(s, `しんらい ${BUD}こ → しりゅう（のこり ${p.bud}）`); summonMemo(s, E, p, T15.shiryu); }
    },
    skill: { label: '2点の ライフを うしなう（しんらい ＋2）', play: (s, p, E, ctx) => { const b = (p.bud || 0) % BUD; return ctx.human || (s.P.life >= 8 && (b + 2 >= BUD || s.P.life >= 15)) ? { score: b + 2 >= BUD ? 4 : 1, run: () => E.hurt(s, 2) } : null; } },
  }),
  SR83: chara({ // 長夜月：長夜（X/X。X ＝ 精霊の 数 × 2）
    ...memoLink,
    etb: (s, p, E) => { summonMemo(s, E, p, T15.nagayo); },
    skill: { label: 'ながよを 出す（いれば ＋1/＋1カウンター）', play: (s, p, E) => ({ score: 3, run: () => summonMemo(s, E, p, T15.nagayo) }) },
  }),
  SR84: chara({ ...fu(2, 2), pittari: spPit }), // 飛霄：追加攻撃 2（2回まで）
  SR85: chara({ // ファイノン：火種 6こで カスライナ
    upkeep: (s, p, E) => { if (p.side !== 'P') return; const was = p.fire || 0; p.fire = Math.min(12, was + FIRE); E.L(s, `ひだね ${was} ＋ ${FIRE} ＝ ${p.fire}`); },
    skill: {
      label: 'ひだね 6こで ＋6/＋6 と トランプル（カスライナ）', can: (s, p) => (p.fire || 0) >= 6, cantWhy: 'せんぎポイントが ない か、ひだねが 6こ ない',
      play: (s, p, E, ctx) => ((p.fire || 0) >= 6 && (ctx.human || (ctx.phase === 1 && canSwing(s, E, p))) ? { score: 9, run: () => { p.fire -= 6; E.L(s, `ひだね ${p.fire + 6} − 6 ＝ ${p.fire}：カスライナ！`); E.pump(p, 6, 6, ['trample']); } } : null),
    },
  }),
  SR86: chara({ // トリビー：トリアン・トリノン。必殺技で 敵 みんなに 1点
    etb: (s, p, E) => { E.token(s, p.side, T15.trian); E.token(s, p.side, T15.trinon); },
    onCast: (s, p, d, E) => { if (p.side === 'P' && d.ultOf && theirs(s, E).length) { E.L(s, 'トリビーの ついかこうげき：てきの クリーチャー みんなに 1点'); allFoes(s, E, 1, p); } },
  }),
  SR87: chara({ // キュレネ
    anthem: (s, q, x) => (x !== q && x.side === q.side && isCrP(x) && (isGolden(x) || isMemo(x)) ? [1, 1] : null),
    skill: { label: 'おうごんえいと せいれいの 数だけ ライフ', play: (s, p, E, ctx) => { const n = s[p.side].bf.filter((q) => isCrP(q) && (isGolden(q) || isMemo(q))).length; return ctx.human || s.P.life <= 16 ? { score: s.P.life <= 12 ? 3 : 1, run: () => { E.L(s, `おうごんえいと せいれい ${n}`); E.gain(s, n); } } : null; } },
  }),
  // ---- キャラ（レア） ----
  SR88: chara({ // モーディス（2026-11-07：R → L。4/5・戦技で 格闘）
    onHurt: (s, p, n, src, E) => { if (E.onBf(s, p)) { E.L(s, `ふしの おうじ：${p.def.name} に ＋1/＋1カウンター`); E.addCounters(s, p, 1); } },
    skill: {
      label: '格闘（かくとう）する てきの クリーチャー',
      play: (s, p, E) => { const P = E.power(s, p); const t = theirs(s, E).filter((q) => !s.floor.untargetable?.(s, q, E) && E.need(s, q) <= P).sort((a, b) => E.power(s, b) - E.power(s, a))[0]; return t ? { score: 4 + Math.min(4, E.power(s, t)), run: () => { E.target(s, t); E.fight(s, p, t); E.sba(s); } } : null; },
      tgt: [{ side: 'E', label: '格闘（かくとう）する てきの クリーチャー' }],
      apply: (s, E, [[t]], p) => { if (t && E.onBf(s, t) && E.onBf(s, p)) { E.target(s, t); E.fight(s, p, t); E.sba(s); } },
    },
  }),
  SR89: chara({ // アナイクス
    pittari: spPit,
    skill: { label: 'ランダムな てきに 1点を 3回', play: (s, p, E) => (alive(s, E).length || faceOK(s, E, 1) ? { score: 4, run: () => { for (let i = 0; i < 3 && !s.over; i++) pingRandom(s, E, 1, p); } } : null) },
  }),
  SR90: chara({ skill: { // マダム・ヘルタ：のこりの 戦技ポイントの 点数
    label: 'のこりの せんぎポイントと 同じ 点数を あたえる クリーチャー',
    play: (s, p, E) => {
      const n = spOf(s) - 1; if (n < 1) return null;
      const ex = alive(s, E).filter((t) => E.need(s, t) === n).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
      const t = ex || foeBest(s, E, n)?.t;
      return t ? { score: 3 + Math.min(4, E.power(s, t)), run: () => hit(s, E, t, spOf(s)) } : null;
    },
    tgt: [{ side: 'E', label: 'のこりの せんぎポイントと 同じ 点数を あたえる クリーチャー' }],
    apply: (s, E, [[t]]) => { if (t) hit(s, E, t, spOf(s)); },
  } }),
  SR91: trail15({ // ヒアンシー：イカルン
    ...memoLink,
    etb: (s, p, E) => { summonMemo(s, E, p, T15.ikarun); },
    onGain: (s, p, E) => { const m = p.side === 'P' && memoOf(s, p); if (m) { E.L(s, `${m.def.name} に ＋1/＋1カウンター`); E.addCounters(s, m, 1); } },
    skill: { label: 'ライフ ＋2', play: (s, p, E) => ({ score: memoOf(s, p) ? 3 : 2, run: () => E.gain(s, 2) }) },
  }),
  SR92: trail15({ ...fu(1), pittari: spPit }), // サフェル
  SR93: chara({ skill: { // ケリュドラ：軍功と 爵位
    label: '＋1/＋1カウンター（3こ いじょうで 二だんこうげき）',
    play: (s, p, E, ctx) => {
      const ready = mine(s, E).filter((q) => q !== p && canSwing(s, E, q) && !q.def.memo);
      const t = (ctx.phase === 1 ? ready.find((q) => q.ctr === 2) : null) || E.bestBuffTarget(s, p);
      return t ? { score: 3 + (t.ctr === 2 && canSwing(s, E, t) ? 3 : 0), run: () => medal(s, E, t) } : null;
    },
    tgt: [{ side: 'P', label: 'ぐんこう：＋1/＋1カウンターを おく クリーチャー' }],
    apply: (s, E, [[t]], p) => { if (t !== p) medal(s, E, t); },
  } }),
  SR94: chara({ // 丹恒・騰荒：龍霊
    ...fu(1, 1, { src: dragonOf }),
    anthem: (s, q, x) => (x.uid === q.dragonOn && x !== q && x.side === q.side ? [1, 0] : null),
    skill: {
      label: 'りゅうれいを つける（＋1/＋0・ついかこうげき 1）',
      play: (s, p, E) => { if (dragonOf(s, p)) return null; const t = E.bestBuffTarget(s, p); return t ? { score: 3, run: () => setDragon(s, E, p, t) } : null; },
      tgt: [{ side: 'P', label: 'りゅうれいを つける クリーチャー' }],
      apply: (s, E, [[t]], p) => setDragon(s, E, p, t),
    },
  }),
  SR95: trail15({ // 雲璃：見切り（つぎの 敵の ターン）
    anthem: (s, q, x) => (x === q && s.turn === q.parryT ? [2, 0] : null),
    kwFn: (s, p) => (s.turn === p.parryT ? ['first'] : null),
    skill: { label: 'つぎの てきの ターン ＋2/＋0 と 先制（せんせい）こうげき', play: (s, p, E, ctx) => (p.parryT !== foeTurn(s) && (ctx.human || foeThreat(s, E)) ? { score: 2, run: () => { p.parryT = foeTurn(s); E.L(s, `みきり：${p.def.name}`); } } : null) },
  }),
  SR96: chara({ // 乱破：忍法 れんさ
    skill: selfPump('＋1/＋0 と トランプル', 1, ['trample']),
    pittari: (s, p, E, dead) => {
      const n = dead.diedT ?? dead.dmg, t = pickRand(s, alive(s, E));
      if (!t || n <= 0) return;
      E.L(s, `にんぽう れんさ：${dead.def.name}（タフネス ${n}）→ ${t.def.name} に ${n}点`);
      E.damage(s, t, n, p); E.sba(s);
    },
  }),
  SR97: chara({ etb: (s, p, E) => { E.token(s, p.side, T15.kabu); }, pittari: (s, p, E) => { E.L(s, 'あかじを くろじに！'); E.token(s, 'P', T.treasure); } }), // トパーズ＆カブ
  SR98: chara({ // ジェイド：債権回収
    ...fu(1),
    onAttacks: (s, q, atk, E) => {
      if (q.side !== 'P') return;
      for (const a of atk) {
        if (a.p === q || (q.flags.turn.jade || 0) >= 2 || !E.onBf(s, q) || s.over) continue;
        q.flags.turn.jade = (q.flags.turn.jade || 0) + 1;
        E.L(s, `さいけん かいしゅう：${a.p.def.name}`); E.hurt(s, 1); E.addCounters(s, q, 1);
      }
    },
  }),
  SR99: chara({ // 霊砂：浮元
    etb: (s, p, E) => { E.token(s, p.side, T15.fugen); },
    skill: { label: 'ライフ ＋2', play: (s, p, E, ctx) => (ctx.human || s.P.life < 18 ? { score: 2, run: () => E.gain(s, 2) } : null) },
  }),
  // ---- キャラ（アンコモン） ----
  SR100: trail15({ ...memoLink, etb: (s, p, E) => { summonMemo(s, E, p, T15.myurion); } }), // 開拓者・記憶：ミュリオン
  SR101: trail15({ skill: { // サンデー
    label: '＋2/＋0（つながった せいれいも）',
    play: (s, p, E, ctx) => {
      if (ctx.phase !== 1) return null;
      const ok = mine(s, E).filter((q) => q !== p && canSwing(s, E, q));
      const t = ok.filter((q) => { const m = memoOf(s, q); return m && canSwing(s, E, m); }).sort((a, b) => E.power(s, b) - E.power(s, a))[0] || ok.sort((a, b) => E.power(s, b) - E.power(s, a))[0];
      return t ? { score: 3 + (memoOf(s, t) ? 2 : 0), run: () => sunday(s, E, t) } : null;
    },
    tgt: [{ side: 'P', label: '＋2/＋0 する クリーチャー（つながった せいれいも）' }],
    apply: (s, E, [[t]], p) => { if (t !== p) sunday(s, E, t); },
  } }),
  SR102: trail15({ onAttack: (s, p, E) => { if (p.side !== 'P') return; const n = Math.min(3, theirs(s, E).length); if (n) { E.pump(p, n, 0); E.L(s, `えいたつ：${p.def.name} ＋${n}/＋0`); } } }), // アルジェンティ
  SR103: trail15({ ...fu(1), pittari: spPit }), // 素裳
  SR104: trail15({ skill: { // 青雀：サイコロ。さきに ふって、その 目で たおせる なかで パワーが いちばん 大きい 敵（2026-11-06）
    label: 'サイコロの 目の 点数を あたえる クリーチャー',
    play: (s, p, E) => (alive(s, E).length ? { score: 3, run: () => {
      const n = E.rollDie(s), t = E.mostOrder(s, alive(s, E).filter((q) => !s.floor.untargetable?.(s, q, E)), n).order[0];
      if (!t) return;
      if (n === leftOf(s, E, t)) E.L(s, 'アガリ！（ぴったり）');
      zap(s, E, t, n, p);
    } } : null),
  } }),
  SR105: trail15({ skill: { label: 'てきの クリーチャー みんなに 1点', play: (s, p, E) => { const ts = theirs(s, E); const k = ts.filter((t) => E.need(s, t) <= 1).length; return ts.length ? { score: 1 + ts.length / 2 + 3 * k, run: () => allFoes(s, E, 1, p) } : null; } } }), // セイレンス
  SR106: trail15({ skill: foeSkill('−1/−1カウンターと 1点を あたえる クリーチャー', 2, (s, E, t) => { if (!t || !E.onBf(s, t)) return; E.addMinus(s, t, 1); E.damage(s, t, 1, null); E.sba(s); }) }), // 椒丘
  SR107: trail15({ ...fu(2), cantAttack: true }), // モゼ（攻撃できない。ブロックは できる）
  SR108: trail15({ skill: foeSkill('−0/−2 する クリーチャー', 2, (s, E, t) => shrink(s, E, t, 0, 2)) }), // ペラ
  SR109: trail15({ // アスター
    etb: (s, p, E) => { if (p.side === 'P') addSP(s, E, 1); },
    pittari: spPit,
    skill: {
      label: '1点を あたえる クリーチャー',
      play: (s, p, E) => { const b = foeBest(s, E, 1); return b ? { score: 3, run: () => zap(s, E, b.t, 1, p) } : null; },
      tgt: [{ side: 'E', label: '1点を あたえる クリーチャー' }],
      apply: (s, E, [[t]], p) => zap(s, E, t, 1, p),
    },
  }),
  SR110: trail15({ skill: { // ギャラガー
    label: 'ライフ ＋2・てきの クリーチャー −1/−0',
    play: (s, p, E, ctx) => (ctx.human || s.P.life < 18 ? { score: 2, run: () => { E.gain(s, 2); const b = foeBest(s, E); if (b) { E.target(s, b.t); E.pump(b.t, -1, 0); } } } : null),
    tgt: [{ side: 'E', min: 0, label: '−1/−0 する クリーチャー' }],
    apply: (s, E, [[t]]) => { E.gain(s, 2); if (t && E.onBf(s, t)) { E.target(s, t); E.pump(t, -1, 0); } },
  } }),
  SR111: trail15({ upkeep: (s, p, E) => { if (p.side === 'P' && s.P.life <= 10) { E.L(s, `けっかい：ライフ ${s.P.life} は 10 いか → ＋4`); E.gain(s, 4); } } }), // 羅刹
  SR112: trail15({ skill: { // リンクス
    label: '＋0/＋3',
    play: (s, p, E, ctx) => {
      if (ctx.phase !== 1) return null;
      const big = Math.max(0, ...theirs(s, E).filter((t) => !t.tapped).map((t) => E.power(s, t)));
      const t = mine(s, E).filter((q) => canSwing(s, E, q) && leftOf(s, E, q) <= big && leftOf(s, E, q) + 3 > big).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
      return t ? { score: 2, run: () => { E.target(s, t); E.pump(t, 0, 3); } } : null;
    },
    tgt: [{ side: 'P', label: '＋0/＋3 する クリーチャー' }],
    apply: (s, E, [[t]]) => { if (t && E.onBf(s, t)) { E.target(s, t); E.pump(t, 0, 3); } },
  } }),
  // ---- 伝説の アーティファクト ----
  SR113: { // 黎明の ミハニ
    etb: (s, p, E) => { if (p.side === 'P') addSP(s, E, 2); },
    anthem: (s, q, x) => (x.side === q.side && isMemo(x) ? [1, 1] : null),
    onFollowUp: (s, q, E) => { if (q.side !== 'P' || (q.flags.turn.mihani || 0) >= 2) return; q.flags.turn.mihani = (q.flags.turn.mihani || 0) + 1; addSP(s, E, 1); },
  },
  // ---- 光円錐（MTG の カードの こうか） ----
  SR114: { // 愛はいま永遠に（Intangible Virtue）
    anthem: (s, q, x) => (x.side === q.side && x.token && isCrP(x) ? [1, 1] : null),
    grant: (s, q, x) => (x.side === q.side && x.token && isCrP(x) ? ['vigilance'] : null),
    permScore: (s, E) => 4 + 3 * mine(s, E).filter((q) => q.token).length,
  },
  SR115: { // 天才たちの「挨拶」（Turn to Frog）
    play: (s, E, ctx) => { const b = foeBest(s, E); if (!b) return null; const P = E.power(s, b.t); return ctx.human || (ctx.phase === 1 && P >= 3 && E.readyAttackers(s).length) ? { score: 1 + P, run: () => frog(s, E, b.t) } : null; },
    react: (s, E) => { const t = biggest(s, E); return t && t.attacking && E.power(s, t) >= 3 ? { score: E.power(s, t), run: () => frog(s, E, t) } : null; },
    tgt: [{ side: 'E', label: '1/1 に する クリーチャー' }], apply: (s, E, [[t]]) => frog(s, E, t),
  },
  SR116: { play: (s, E, ctx) => { const lib = s.P.lib; if (!lib.length) return null; const ok = lib.filter((c) => isCr(c.def) && !c.def.x && c.def.cost <= 3).length; const exp = Math.min(2, (ok / lib.length) * 6); return exp >= 0.8 || ctx.human ? { score: 3 + 4 * exp, run: () => storyFlip(s, E) } : null; } }, // 物語を めくって（Collected Company）
  SR117: foe1('はかいする クリーチャー', killIt), // 燃え盛る黎明のように（Terminate）
  SR118: foe1('−1/−1カウンターを 5こ おく クリーチャー（しぼうするなら ついほう）', (s, E, t) => { if (!t || !E.onBf(s, t)) return; t.exileT = s.turn; minusCtr(s, E, t, 5); }, { n: 5 }), // 何が真か（2026-11-05：−5/−5 → −1/−1カウンター。コスト 4 → 5）
  // ---- モブ ----
  SR119: trail15({ ...memoLink, etb: (s, p, E) => { summonMemo(s, E, p, T15.memoW); } }),
  SR120: trail15(fu(1)),
  SR121: trail15({ pittari: (s, p, E) => E.gain(s, 2) }),
  SR122: trail15({ etb: (s, p, E) => { if (p.side === 'P') addSP(s, E, 1); } }),
  SR123: trail15({ skill: { label: 'せんじゅつ 2', play: (s, p, E, ctx) => (ctx.human || spOf(s) >= 3 ? { score: 1, run: () => E.scry(s, 2) } : null) } }),
  SR124: trail15(fu(1)),
  SR125: trail15({ // 敵の クリーチャー1体を タップ（じぶんで えらぶ：PICK_FREE。2026-11-06 まで ランダム）
    tgt: [{ side: 'E', min: 0, label: 'タップする クリーチャー', filter: (s, E, t) => !t.tapped }],
    etb: (s, p, E, o) => { if (p.side !== 'P') return; const t = o?.chosen ? o.chosen[0]?.[0] : foeBest(s, E, 99, (x) => !x.tapped)?.t; if (t && E.onBf(s, t)) { E.target(s, t); t.tapped = true; E.L(s, `${t.def.name} を タップ`); } },
  }),
  SR126: trail15({ onDie: (s, p, E) => { if (p.side !== 'P') return; const t = (foeBest(s, E, 1) || foeBest(s, E))?.t; if (t) { E.addMinus(s, t, 1); E.sba(s); } } }), // じぶんで えらぶ（AI が いちばん よい あいて）
  SR127: trail15(fu(1)),
  SR128: trail15({ onAttack: (s, p, E) => { if (p.side === 'P') E.hurt(s, 1); } }),
  SR129: trail15(fu(1)),
  SR130: trail15({ pittari: (s, p, E) => E.hitEnemy(s, 1, p) }),
  SR131: trail15(),
  SR132: trail15(),
  SR133: trail15({
    tgt: [{ side: 'P', min: 0, label: '＋1/＋1カウンターを おく クリーチャー' }],
    etb: (s, p, E, o) => { if (p.side !== 'P') return; const t = (o?.chosen && o.chosen[0]?.[0]) || E.bestBuffTarget(s, null); if (t && E.onBf(s, t)) { E.target(s, t); E.addCounters(s, t, 1); } },
  }),
  SR134: trail15({ ...memoLink, etb: (s, p, E) => { summonMemo(s, E, p, T15.memoG); } }),
  SR135: trail15({ etb: (s, p, E) => { if (p.side === 'P') E.gain(s, 2); } }),
  // ---- 光円錐（コモン） ----
  SR136: single(2, 2, { kw: ['flying'] }), // 空の虹が消えぬように（Mighty Leap）
  SR137: { // 我が征く巡狩の道（Divine Verdict）：攻撃して きた ランダムな 1体
    reactive: true,
    react: (s, E, ctx) => {
      const list = (ctx.attackers || []).filter((t) => E.onBf(s, t) && isCrP(t) && t.side === 'E' && !s.floor.untargetable?.(s, t, E));
      if (!list.length) return null;
      const avg = list.reduce((a, t) => a + E.enemyThreatOf(s, t), 0) / list.length;
      return avg >= 4 ? { score: avg, run: () => { const t = pickRand(s, list.filter((x) => E.onBf(s, x))); if (t) { E.L(s, `ランダム：${t.def.name}`); E.target(s, t); killIt(s, E, t); } } } : null;
    },
  },
  SR138: single(0, 3), // 瞬刻の勝機（Dive Down）
  SR139: aura('E', 'タップして おきなく する てきの クリーチャー', { onAttach: (s, p, E, h) => { h.tapped = true; h.iceBy = p; } }), // 長き夜に輝く星へ（Claustrophobia）
  SR140: { // 永訣よ美しくあれ（Vendetta）
    play: (s, E, ctx) => { const b = foeBest(s, E, 99, (t) => !E.colorsOf(t.def).includes('K')); if (!b) return null; const n = E.pt(s, b.t)[1]; return ctx.human || s.P.life - n >= 8 ? { score: 6 + b.score - n / 2, run: () => vendetta(s, E, b.t) } : null; },
    tgt: [{ side: 'E', label: 'はかいする 黒でない クリーチャー', filter: (s, E, t) => !E.colorsOf(t.def).includes('K') }], apply: (s, E, [[t]]) => vendetta(s, E, t),
  },
  SR141: aura('E', '−2/−2 する てきの クリーチャー', { p: -2, t: -2 }), // 幾度目かの春（Weakness は −2/−1）
  SR142: foe1('−1/−1カウンターを 2こずつ おく クリーチャー（同じ 名前の てきも）', (s, E, t) => { if (!t || !E.onBf(s, t)) return; const nm = t.def.name; for (const q of theirs(s, E).filter((q) => q.def.name === nm)) E.addMinus(s, q, 2); E.sba(s); }, { n: 2 }), // 辿る記憶（Bile Blight。2026-11-05：−3/−3 → −1/−1カウンター 2こずつ）
  SR143: { // 燃ゆる影（Chandra's Outrage）
    play: (s, E, ctx) => { const b = foeBest(s, E, 4); return b || ctx.human || faceOK(s, E, 2) ? { score: 5 + (b?.score || 0), run: () => { if (b) hit(s, E, b.t, 4); faceHit(s, E, 2); } } : null; },
    tgt: [{ side: 'E', min: 0, label: '4点を あたえる クリーチャー' }], apply: (s, E, [[t]]) => { if (t) hit(s, E, t, 4); faceHit(s, E, 2); },
  },
  SR144: foe1('3点（ぼちに じゅもんが 2まい いじょうなら 4点）を あたえる クリーチャー', (s, E, t) => hit(s, E, t, fiery(s)), { n: (s) => fiery(s) }), // 烈火の彼方（Fiery Impulse）
  SR145: { // 流すなら涙より汗（Savage Swipe）。じぶんで えらぶ（PICK_FREE）
    play: (s, E) => {
      let best = null;
      for (const a of mine(s, E)) {
        const bonus = E.power(s, a) === 2 ? 2 : 0, P = E.power(s, a) + bonus, left = leftOf(s, E, a) + bonus;
        const b = foeBest(s, E, P, (t) => E.power(s, t) < left);
        if (b && (!best || b.score + bonus > best.v)) best = { a, t: b.t, v: b.score + bonus };
      }
      return best ? { score: 5 + best.v, run: () => swipe(s, E, best.a, best.t) } : null;
    },
    tgt: [{ side: 'P', label: 'かくとうする あなたの クリーチャー' }, { side: 'E', label: 'かくとうする てきの クリーチャー' }],
    apply: (s, E, [[a], [b]]) => swipe(s, E, a, b),
  },
  SR146: { trick: { kind: 'single', p: 2, t: 2, trample: true }, singleRun: (s, E, q) => { E.pump(q, 2, 2, ['trample']); E.drawCard(s); } }, // 大地より天を目指して（Wildsize）
  SR147: { play: (s, E, ctx) => { const n = gyCount(s, 'creature'); return n && (ctx.human || n >= 2 || s.P.life <= 14) ? { score: 1 + n, run: () => { E.L(s, `ぼちの クリーチャー ${n}まい × 2`); E.gain(s, 2 * n); } } : null; } }, // 花は忘れない（Gnaw to the Bone）
  SR148: { equip: 2, eqP: 2, eqT: 1 }, // 最後の勝者（Trusty Machete）
  SR149: { equip: 2, grant: (s, q, p) => (p.uid === q.attached ? ['double'] : null) }, // 光陰を織り黄金と成す（Fireshrieker）
  SR150: { equip: 2, eqP: 1, grant: (s, q, p) => (p.uid === q.attached ? ['flying'] : null) }, // 青空の下で（Kitesail）
  // ---- 必殺技（その キャラが いると コストが 少なくなる） ----
  SR151: ult('SR81', 2, { // 共に舞え、運命のラフトラ（Dauntless Onslaught）
    play: (s, E, ctx) => { const ts = mine(s, E).filter((q) => canSwing(s, E, q)).sort((a, b) => E.power(s, b) - E.power(s, a)).slice(0, 2); return ts.length && (ctx.phase === 1 || ctx.human) ? { score: 2 + 3 * ts.length, run: () => { for (const t of ts) if (E.onBf(s, t)) { E.target(s, t); E.pump(t, 2, 2); } } } : null; },
    tgt: [{ side: 'P', min: 1, max: 2, label: '＋2/＋2 する クリーチャー（2体まで）' }],
    apply: (s, E, [ts]) => { for (const t of ts || []) if (E.onBf(s, t)) { E.target(s, t); E.pump(t, 2, 2); } },
  }),
  SR152: ult('SR94', 2, { play: (s, E, ctx) => { const n = mine(s, E).length; return n >= 2 || (ctx.human && n) ? { score: 2 + 2 * n, run: () => { for (const q of mine(s, E)) E.addCounters(s, q, 1); } } : null; } }), // 悔い無き亢竜（Inspiring Roar）
  SR153: ult('SR83', 2, { // 眠れぬ世界に永き眠りを（Aetherize）
    reactive: true,
    react: (s, E, ctx) => {
      const list = (ctx.attackers || []).filter((t) => E.onBf(s, t) && t.side === 'E');
      const pw = list.reduce((a, t) => a + Math.max(0, E.power(s, t)), 0);
      return list.length >= 2 || pw >= 4 ? { score: 2 + pw, run: () => { for (const t of list) if (E.onBf(s, t)) E.bounce(s, t); E.sba(s); } } : null;
    },
  }),
  SR154: ult('SR90', 1, { // 魔法だって言ったでしょ（Polymorphist's Jest）：てき みんな 1/1
    play: (s, E, ctx) => {
      const ts = theirs(s, E); if (!ts.length) return null;
      const trib = tribbieOn(s); // トリビーが いれば 必殺技で 1点 → 1/1 で たおれる
      const die = ts.filter((t) => (t.dmg >= 1 || trib) && !E.hasKw(s, t, 'indestructible')).length;
      const big = ctx.phase === 1 && E.readyAttackers(s).length ? ts.filter((t) => E.power(s, t) >= 3).length : 0;
      const v = die * 5 + big * 2;
      return v >= 4 || ctx.human ? { score: v, run: () => { for (const t of [...theirs(s, E)]) frog(s, E, t); E.sba(s); } } : null;
    },
    react: (s, E, ctx) => { const pw = (ctx.attackers || []).filter((t) => E.onBf(s, t)).reduce((a, t) => a + Math.max(0, E.power(s, t) - 1), 0); return pw >= 5 ? { score: pw, run: () => { for (const t of [...theirs(s, E)]) frog(s, E, t); E.sba(s); } } : null; },
  }),
  SR155: ult('SR82', 2, { play: (s, E) => { const c = bestIn(s.P.gy, (x) => isCr(x.def) && !x.def.x); return c ? { score: 6 + c.def.cost, run: () => { if (!s.P.gy.includes(c)) return; s.P.gy.splice(s.P.gy.indexOf(c), 1); E.L(s, `ぼちから せんじょうへ：${c.def.name}`); E.enter(s, 'P', c.def, { card: c.def }); } } : null; } }), // 亡者の怒哮、蘇生の鐘（Zombify）
  SR156: ult('SR105', 2, { play: (s, E, ctx) => { const ts = theirs(s, E); const k = ts.filter((t) => E.need(s, t) <= 1).length; const v = k * 4 + ts.length; return ts.length && (v >= 2 || ctx.human) ? { score: v, run: () => { for (const t of [...theirs(s, E)]) E.addMinus(s, t, 1); E.sba(s); } } : null; } }), // 絶海の渦潮、呑魂の舞曲（Cower in Fear。2026-11-05：−1/−1 → −1/−1カウンター。コスト 3 → 5。のこる ので メイン2でも）
  SR157: ult('SR85', 2, { // 永劫の焼世、背負うべき未来（Unleash Fury）
    play: (s, E, ctx) => { if (ctx.phase !== 1 && !ctx.human) return null; const t = E.bestBuffTarget(s, null, { ready: true }); return t && (ctx.human || (canSwing(s, E, t) && E.power(s, t) >= 3)) ? { score: 2 + E.power(s, t), run: () => fury(s, E, t) } : null; },
    tgt: [{ side: 'P', label: 'パワーを 2ばいに する クリーチャー' }], apply: (s, E, [[t]]) => fury(s, E, t),
    trick: { kind: 'single', p: 3, t: 0 }, singleRun: (s, E, q) => fury(s, E, q),
  }),
  SR158: ult('SR96', 2, { // 忍道・極・愛死天流（Cone of Flame）。じぶんで えらぶ（PICK_FREE）
    play: (s, E, ctx) => { const { plan, v } = ninpoPlan(s, E); return v >= 6 || ctx.human ? { score: v, run: () => ninpo(s, E, plan) } : null; },
    tgt: NINPO.map((n) => ({ side: 'E', face: true, label: `${n}点を あたえる 相手（ほかと ちがう クリーチャー）` })),
    apply: (s, E, picks) => ninpo(s, E, picks.map((p) => p?.[0] ?? 'face')),
  }),
  SR159: ult('SR99', 1, { // 彩雲の如く巡る霞（Heroic Intervention）
    play: (s, E, ctx) => { if (ctx.human) return { score: 1, run: () => saveAll(s, E) }; if (ctx.phase !== 1) return null; const n = E.readyAttackers(s).length; const bl = theirs(s, E).filter((t) => !t.tapped && E.power(s, t) > 0).length; return n >= 2 && bl >= 2 ? { score: 2 + n, run: () => saveAll(s, E) } : null; },
    react: (s, E, ctx) => { let n = 0; for (const a of ctx.attackers || []) { const b = ctx.blocks?.get(a.uid); if (b && E.onBf(s, b) && E.onBf(s, a) && E.power(s, a) >= leftOf(s, E, b)) n++; } return n ? { score: 2 + 3 * n, run: () => saveAll(s, E) } : null; },
  }),
  SR161: trail15({ // ヘルタ（2026-11-07 追加。青の アンコモン）：出たときと 戦技で、伝説で ない 同じ 名前の トークン「ヘルタ」
    etb: (s, p, E) => { E.token(s, p.side, HERTA); },
    skill: { label: 'ヘルタ トークンを 出す', play: (s, p, E) => ({ score: 4, run: () => { E.token(s, p.side, HERTA); } }) },
  }),
  SR160: ult('SR91', 2, { play: (s, E, ctx) => { const has = s.P.gy.some((c) => isCr(c.def)); return has || ctx.human || s.P.life <= 14 ? { score: 2 + (has ? 4 : 0) + (s.P.life <= 14 ? 3 : 0), run: () => { regrow(s, E, isCr); E.gain(s, 6); } } : null; } }), // 晨昏に飛び込むわたしたち（Pulse of Murasa）
};
function saveAll(s, E) { for (const q of mine(s, E)) E.pump(q, 0, 0, ['indestructible']); E.L(s, 'あなたの クリーチャーは みんな はかいされない'); }
