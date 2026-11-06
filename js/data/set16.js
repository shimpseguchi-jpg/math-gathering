// 番外編「ゼンレスゾーンゼロ 第2弾」のうごき（名前・コスト・P/T は skel.js、文は docs/EXTRA2_ZZ.md）
// 第1弾（set12.js）の しくみ（ブレイク・エネルギー・交代・終結スキル）に、新しい しくみ 2つ：
//   連携（れんけい）スキル：ブレイクを つかった あと（game.js の useBreak → def.chain）。この クリーチャー ＋ ほかの エージェント 1体の パワー ＝ 連携の 数（道具は set12.js）
//   属性異常 → 紊乱（びんらん）：敵の クリーチャーに 色の 異常（p.anom）。ちがう 色の あなたの クリーチャーが ダメージ → 2倍（game.js の damage）
import { mine, theirs, hit, foeBest, cr, foe1, killIt, exileIt, dig, food, aura, isCr, T } from './kit.js';
import { PICK_FREE } from '../engine/game.js';
import {
  bonOf, addBon, ninjutsu, canSwing, biggest, detain, isCre, hasSub, bonAct, etbBon, selfPump, etbFoe, left, pair, ULT, TK,
  ok, zap, faceHit, foeBy, byPow, dmgChain, lifeChain, tapChain, killChain, chainAll,
} from './set12.js';

PICK_FREE.add('ZZ149'); // 格闘（狸の 七変化）：コモンでも あいては じぶんで えらぶ（ランダムだと つよい てきに あたって そんする）
// 2026-11-06（docs/REMOVAL.md 4.1）：1点・−1/−1 1こ・留置・1体を タップ も じぶんで えらぶ。ふたまたの 火花（ZZ146）は 2点を じぶんで 割り振る（算数）
for (const id of ['ZZ109', 'ZZ114', 'ZZ115', 'ZZ120', 'ZZ124', 'ZZ139', 'ZZ146', 'ZZ148']) PICK_FREE.add(id);

const CJ = { W: '白', U: '青', K: '黒', R: '赤', G: '緑' };
const ANOM = { kw: ['anomaly'] }; // 属性異常（キーワード。gen_texts の KW に ない ので ここで つける）
const TK2 = {
  tiger: cr('t_tiger', '虎（とら）', null, 'R', 0, 2, 2, ['tiger']),
  bird: cr('t_birdU', '鳥（とり）', null, 'U', 0, 1, 1, ['bird'], ['flying'], { attacks: true }),
};
// 敵の クリーチャーを ライブラリーの 一番下へ（てふだの ない 敵。手札の ある あいて（オンライン）は 手札へ）
const tuck = (s, E, t) => { if (t && E.onBf(s, t)) E.leave(s, t, s[t.side].hand ? 'hand' : 'bottom'); };
// ねらう 道具（zap・foeBy など）と 連携スキル（chainSkill・dmgChain など。2026-11-04 から 第1弾の エージェントも もつ）は set12.js

// ---- 異常 ----
// 異常 c を つけると 紊乱（びんらん）を おこせる じぶんの クリーチャーが いるか（ちがう 色を もつ）
const canDisorder = (s, E, c) => mine(s, E).some((q) => E.colorsOf(q.def).some((x) => x !== c));
const anomPick = (c) => (s, E) => foeBest(s, E, 99, (t) => t.anom !== c)?.t || null;
// 出たとき 敵の クリーチャー1体に 色 c の 異常
const markFoe = (c, more = {}) => etbFoe(`${CJ[c]}の 異常（いじょう）を つける てきの クリーチャー`, (s, E, t) => { E.target(s, t); E.setAnom(s, t, c); }, anomPick(c), more);
// マーキュリー：どの 色に すると いちばん 紊乱を おこしやすいか（ちがう 色の じぶんの クリーチャーの パワーの 合計）
function bestColor(s, E) {
  let best = null, bv = -1;
  for (const c of ['W', 'U', 'K', 'R', 'G']) {
    const v = mine(s, E).filter((q) => E.colorsOf(q.def).some((x) => x !== c)).reduce((a, q) => a + Math.max(0, E.power(s, q)), 0) * 10 - mine(s, E).filter((q) => E.colorsOf(q.def).includes(c)).length;
    if (v > bv) { bv = v; best = c; }
  }
  return best;
}
// 「エネルギー n：敵の クリーチャー1体に 色 c の 異常」。AI は 紊乱を おこせる ときに 異常の ない 敵へ（want：その 色に したい とき だけ）
const anomAct = (n, c, label, want = () => true) => bonAct(n, {
  label,
  play: (s, p, E) => { if (!want(s, E) || !canDisorder(s, E, c)) return null; const t = foeBest(s, E, 99, (q) => !q.anom)?.t; return t ? { score: 2, run: () => { E.target(s, t); E.setAnom(s, t, c); } } : null; },
  tgt: [{ side: 'E', label: `${CJ[c]}の 異常（いじょう）を つける てきの クリーチャー` }], apply: (s, E, [[t]]) => { if (t) { E.target(s, t); E.setAnom(s, t, c); } },
});
// マーキュリー：5色の ボタン（人は 色と 相手を えらぶ。AI は bestColor の 色）
const mercury = (c) => anomAct(2, c, `エネルギー 2：てきに ${CJ[c]}の 異常（いじょう）`, (s, E) => bestColor(s, E) === c);
// 出たとき 敵の クリーチャー1体に（etbFoe と おなじ。f に この パーマネント p も わたす）
const etbFoeP = (label, f, pick) => ({
  tgt: [{ side: 'E', min: 0, label }],
  etb: (s, p, E, o) => { if (p.side !== 'P') return; const c = o?.chosen ? o.chosen[0]?.[0] : pick(s, E); if (c && E.onBf(s, c)) f(s, E, c, p); },
});

// ---- 命破（めいは）：ライフを n 点 うしなって ＋a/＋b（1ターンに k 回まで）。AI は ライフが 10 より 多くて 攻撃 できる とき だけ ----
const lifeAct = (n, a, b, k = 1) => ({
  cost: 0, when: [1], label: `ライフを ${n}点 うしなう：＋${a}/＋${b}${k > 1 ? `（1ターンに ${k}回まで）` : ''}`,
  can: (s, p) => (p.flags.turn.life || 0) < k && s.P.life > n, cantWhy: k > 1 ? `この ターンは もう ${k}回 つかった` : 'この ターンは もう つかった',
  play: (s, p, E, ctx) => ((ctx.human || (ctx.phase === 1 && canSwing(s, E, p) && s.P.life > 10 + n)) ? { score: 2 + a, run: () => { p.flags.turn.life = (p.flags.turn.life || 0) + 1; E.hurt(s, n); E.pump(p, a, b); } } : null),
});
// ほかの エージェントは ＋a/＋b
const agentLord = (a, b) => (s, q, p) => (p !== q && p.side === q.side && isCre(p) && p.def.legend ? [a, b] : null);
// 攻撃するたび、敵の クリーチャー1体に n 点（レアは 人が さきに えらぶ）。f で えらべる 相手を しぼる
const atkZap = (n, label, f = () => true, pay = null) => ({
  trigTgt: { on: 'attack', label },
  onAttack: (s, p, E) => {
    if (p.side !== 'P') return;
    const t = foeBy(s, E, p, (q) => f(s, E, q), (list) => foeBest(s, E, n, (q) => list.includes(q))?.t || byPow(s, E)(list), n);
    if (!t || (pay && !pay.can(s))) return;
    pay?.run(s, E);
    zap(s, E, p, t, n);
  },
});
const tappedOrAtk = (p) => p.attacking || p.tapped;
// 攻撃しているか（AI が 敵の 攻撃に こたえる ときの 相手）
const atkList = (s, E, ctx) => (ctx.attackers || []).filter((q) => E.onBf(s, q) && !s.floor.untargetable?.(s, q, E));
const spread = (s, E, x, list) => { // x 点：たおせる ものから じゅんに、のこりは 本体
  const out = []; let r = x;
  for (const t of [...list].sort((a, b) => E.need(s, a) - E.need(s, b) || E.power(s, b) - E.power(s, a))) { const k = E.need(s, t); if (k <= r) { out.push({ t, n: k }); r -= k; } }
  if (r > 0) { if (s.floor.face) out.push({ t: 'face', n: r }); else if (out.length) out[out.length - 1].n += r; else if (list.length) out.push({ t: list[0], n: r }); }
  return out;
};

export const S16 = {
  // ---- エージェント（白） ----
  ZZ82: { brk: 3, ...atkZap(1, '1点を あたえる てきの クリーチャー'), ...dmgChain() }, // 0号・アンビー
  ZZ83: { brk: 4, ...tapChain }, // トリガー
  ZZ84: { brk: 2, onAttack: (s, p, E, atk) => { if (p.side === 'P' && atk.some((a) => a.p !== p && isCre(a.p) && a.p.def.legend)) { E.pump(p, 2, 0); E.L(s, `${p.def.name}：なかまの エージェントと こうげき ＋2/＋0`); } } }, // シード
  ZZ85: { brk: 2, minBlockPow: 3, onFaceHit: (s, p, E) => { if (p.side === 'P') addBon(s, E, 1); } }, // シーシィア
  // ---- 青 ----
  ZZ86: { // ヒューゴ：攻撃するたび 2点（タップ状態なら かわりに 4点）
    brk: 3, trigTgt: { on: 'attack', label: '2点（タップ状態（じょうたい）なら 4点）を あたえる てきの クリーチャー' },
    onAttack: (s, p, E) => { if (p.side !== 'P') return; const t = foeBy(s, E, p, () => true, (list) => foeBest(s, E, 4, (q) => q.tapped && list.includes(q))?.t || foeBest(s, E, 2, (q) => list.includes(q))?.t || byPow(s, E)(list)); if (t) zap(s, E, p, t, t.tapped ? 4 : 2); },
  },
  ZZ87: { brk: 2, anthem: agentLord(1, 0), ...lifeChain }, // 照
  ZZ88: { brk: 3, acts: [lifeAct(2, 3, 0)] }, // イドリー
  ZZ89: { brk: 2, ...ANOM, ...markFoe('U') }, // プロメイア
  // ---- 黒 ----
  ZZ90: { brk: 3, ...killChain }, // 儀玄
  ZZ91: { // ビビアン
    brk: 3, trigTgt: { on: 'attack', label: '黒の 異常（いじょう）を つける てきの クリーチャー' },
    onAttack: (s, p, E) => { if (p.side !== 'P') return; const t = foeBy(s, E, p, (q) => q.anom !== 'K', byPow(s, E)); if (t) { E.target(s, t); E.setAnom(s, t, 'K'); } },
    onDisorder: (s, p, E) => { E.L(s, `${p.def.name}：紊乱（びんらん）で てき ぜんぶに 1点`); for (const t of [...theirs(s, E)]) E.damage(s, t, 1, null); },
  },
  ZZ92: { brk: 2, etb: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', TK.ethereal, 2); }, anthem: (s, q, p) => (p !== q && p.side === q.side && isCre(p) && (hasSub(p, 'ethereal') || hasSub(p, 'エーテリアス')) ? [1, 0] : null) }, // リュシア
  ZZ93: { brk: 2, ...ANOM, etb: etbBon(2), acts: [anomAct(2, 'K', 'エネルギー 2：てきに 黒の 異常（いじょう）')] }, // アリア
  ZZ94: { brk: 4 }, // 南宮羽
  // ---- 赤 ----
  ZZ95: { brk: 4, etb: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', TK2.tiger, 1); }, ...dmgChain() }, // 橘福福
  ZZ96: { brk: 3, etb: etbBon(2), ...atkZap(3, '3点を あたえる てきの クリーチャー（エネルギー 2 を つかう）', () => true, { can: (s) => bonOf(s) >= 2, run: (s, E) => addBon(s, E, -2) }) }, // オルペウス＆「鬼火」
  ZZ97: { brk: 2, acts: [lifeAct(1, 1, 0, 3)] }, // 狛野真斗
  ZZ98: { brk: 3, onBlock: (s, p, E) => { if (p.side !== 'P') return; const t = foeBest(s, E, 2, (q) => q.attacking)?.t || foeBest(s, E, 2)?.t || biggest(s, E, (q) => q.attacking) || biggest(s, E); if (t) zap(s, E, p, t, 2); } }, // 盤岳
  // ---- 緑 ----
  // 葉瞬光（目玉の レジェンド。4マナ 6/5 速攻・トランプル）：出たとき ブレイクカウンター 5こ（交代で 出れば 5 ＋ 5 ＝ 10 で すぐ ブレイク）。連携の あまりは 本体へ
  ZZ99: { brk: 4, etb: (s, p, E) => { if (p.side !== 'P') return; E.L(s, `${p.def.name}：てきに ブレイクカウンター 5こ`); E.addBreak(s, 5); }, ...dmgChain(true) },
  ZZ100: { brk: 2, ...markFoe('G'), onDisorder: (s, p, E, src) => { if (src && E.onBf(s, src) && E.isCreature(src)) { E.L(s, `${p.def.name}：紊乱（びんらん）した ${src.def.name} に ＋1/＋1カウンター`); E.addCounters(s, src, 1); } } }, // 浮波柚葉
  ZZ101: { brk: 2, ...ANOM, ...atkZap(1, '1点を あたえる 異常（いじょう）の ついた てきの クリーチャー', (s, E, q) => !!q.anom) }, // アリス
  ZZ102: { brk: 4, costCut: (s, q, d) => (d.tapLess ? 1 : 0) }, // ダイアリン：終結スキルが 1 安い
  ZZ103: { brk: 3, ...dmgChain() }, // プルクラ
  ZZ104: { brk: 2, etb: (s, p, E) => { if (p.side === 'P') food(s, E, 2); } }, // 潘引壺
  ZZ105: { brk: 2, etb: etbBon(1), acts: [bonAct(2, { // 千夏
    label: 'エネルギー 2：クリーチャー1体に ＋1/＋1カウンター',
    play: (s, p, E) => { const t = E.bestBuffTarget(s, null); return t ? { score: 3, run: () => { E.target(s, t); E.addCounters(s, t, 1); } } : null; },
    tgt: [{ side: 'P', label: '＋1/＋1カウンターを おく クリーチャー' }], apply: (s, E, [[t]]) => { if (t) { E.target(s, t); E.addCounters(s, t, 1); } },
  })] },
  ZZ106: { brk: 2, acts: [lifeAct(2, 2, 2)] }, // スターライト・ビリー
  // パエトーン：出たとき エネルギー ＋2・エージェントが 出るたび ＋1（2まいめは かさならない）。エネルギー 5：ブレイクカウンター 5こ（2回で 10）
  ZZ107: {
    etb: etbBon(2),
    onOtherEnter: (s, q, p, E) => { if (q.side === 'P' && p.side === 'P' && isCre(p) && p.def.legend && s.P.bf.find((x) => x.def.id === q.def.id) === q) addBon(s, E, 1); },
    acts: [bonAct(5, { label: 'エネルギー 5：てきに ブレイクカウンター 5こ', play: (s, p, E) => ({ score: 6, run: () => E.addBreak(s, 5) }) })],
  },
  // ---- モブ ----
  ZZ108: { ...lifeChain }, // 防衛軍の 兵士
  ZZ109: etbFoe('タップする てきの クリーチャー', (s, E, t) => { E.tapPerm(s, t); E.L(s, `${t.def.name} を タップ`); }, (s, E) => foeBest(s, E, 99, (t) => !t.tapped)?.t), // 都市秩序部の 捜査官
  ZZ110: { etb: (s, p, E) => { if (p.side === 'P') E.gain(s, 2); } }, // 澄輝坪の 住民
  ZZ111: { ...ANOM, brk: 2 }, // 氷の エーテリアス（エーテリアスの モブは ブレイク 2）
  ZZ112: { onDisorder: (s, p, E) => addBon(s, E, 2) }, // 怪啖屋の 読者
  ZZ113: markFoe('U'), // ラマニアンホロウの 調査員
  ZZ114: { brk: 2, ...etbFoe('タップする てきの クリーチャー（つぎも おきない）', detain, (s, E) => foeBest(s, E, 99, (t) => !t.frozen)?.t) }, // ミアズマの 霧の 獣
  ZZ115: etbFoe('−1/−1カウンターを おく てきの クリーチャー', (s, E, t) => { E.addMinus(s, t, 1); E.sba(s); }, (s, E) => foeBest(s, E, 1)?.t || biggest(s, E), { etb: (s, p, E) => E.hurt(s, 1) }), // 讃頌会の 信者
  ZZ116: { ...ANOM, ...markFoe('K') }, // 夢縋り
  ZZ117: { ...ANOM, brk: 2, etb: (s, p, E) => { if (p.side !== 'P') return; for (const t of theirs(s, E)) E.setAnom(s, t, 'K'); } }, // サクリファイス
  ZZ118: { acts: [bonAct(2, selfPump('エネルギー 2：＋2/＋0', 2, 0))] }, // 輝磁工場の 作業員
  ZZ119: { ...ANOM, brk: 2 }, // 炎の ミアズマ獣
  ZZ120: etbFoeP('1点を あたえる てきの クリーチャー', (s, E, t, p) => zap(s, E, p, t, 1), (s, E) => foeBest(s, E, 1)?.t || biggest(s, E)), // 飲茶仙の 料理人
  ZZ121: { onBlock: (s, p, E) => E.pump(p, 2, 0) }, // ポーセルメックスの 警備ロボ
  ZZ122: { ...dmgChain() }, // 雲嶽山の 門下生
  ZZ123: { ...ANOM, brk: 2 }, // ラマニアンホロウの 大エーテリアス
  // ---- ボンプ ----
  ZZ124: { etb: etbBon(1), acts: [bonAct(3, { // オシシ
    label: 'エネルギー 3：てきの クリーチャー 2体までに 1点ずつ',
    play: (s, p, E) => { const ts = theirs(s, E).filter((t) => ok(s, E, t) && E.need(s, t) <= 1).slice(0, 2); return ts.length ? { score: 3 + ts.length * 3, run: () => { for (const t of ts) zap(s, E, p, t, 1); } } : null; },
    tgt: [{ side: 'E', max: 2, label: '1点を あたえる てきの クリーチャー（2体まで）' }], apply: (s, E, [ts], p) => { for (const t of ts || []) if (E.onBf(s, t)) zap(s, E, p, t, 1); },
  })] },
  ZZ125: { etb: etbBon(2), onDisorder: (s, p, E) => E.gain(s, 2) }, // ミス・エスメ
  ZZ126: { etb: etbBon(1), acts: ['W', 'U', 'K', 'R', 'G'].map(mercury) }, // マーキュリー：5色の ボタン
  ZZ127: { etb: etbBon(1, (s, p, E) => dig(s, E, 4, 1, (d) => d.legend && isCr(d))) }, // 配達型
  ZZ128: { etb: etbBon(1) }, // サビザン
  ZZ129: { etb: etbBon(1), acts: [bonAct(2, { // セイケン
    label: 'エネルギー 2：先制攻撃（せんせいこうげき）',
    play: (s, p, E, ctx) => (ctx.phase === 1 && canSwing(s, E, p) && theirs(s, E).some((t) => !t.tapped && E.power(s, t) >= E.pt(s, p)[1] - p.dmg) && !E.hasKw(s, p, 'first') ? { score: 3, run: () => E.pump(p, 0, 0, ['first']) } : null),
  })] },
  // ---- 音動機（MTG の カードの こうか） ----
  ZZ130: { equip: 2, eqP: 2, eqT: 1 }, // Trusty Machete
  ZZ131: { equip: 2, grant: (s, q, p) => (p.uid === q.attached ? ['flying', 'first'] : null) }, // Bladed Pinions
  ZZ132: { equip: 1, eqP: 1, grant: (s, q, p) => (p.uid === q.attached ? ['anomaly'] : null) }, // Bone Saw ＋ 属性異常
  ZZ133: { // Gideon's Reproach（攻撃しているか タップ状態の クリーチャーに 4点）
    play: (s, E, ctx = {}) => { const b = foeBest(s, E, 4, tappedOrAtk) || (ctx.human ? foeBest(s, E, 99, tappedOrAtk) : null); return b ? { score: 6 + b.score, run: () => hit(s, E, b.t, 4) } : null; },
    react: (s, E, ctx) => { const t = atkList(s, E, ctx).filter((q) => E.need(s, q) <= 4).sort((a, b) => E.power(s, b) - E.power(s, a))[0]; return t && E.power(s, t) >= 2 ? { score: E.enemyThreatOf(s, t), run: () => hit(s, E, t, 4) } : null; },
    tgt: [{ side: 'E', label: '4点を あたえる こうげき中か タップ状態（じょうたい）の クリーチャー', filter: (s, E, p) => tappedOrAtk(p) }], apply: (s, E, [[t]]) => hit(s, E, t, 4),
  },
  ZZ134: { // Glorious Charge（攻撃の とちゅうでも メインフェイズでも）
    trick: { kind: 'mass', p: 1, t: 1 }, massRun: (s, E) => { for (const q of mine(s, E)) E.pump(q, 1, 1); },
    play: (s, E, ctx = {}) => { const n = mine(s, E).filter((q) => canSwing(s, E, q)).length; return mine(s, E).length && (ctx.human || (ctx.phase === 1 && n >= 3)) ? { score: 2 + n, run: () => { for (const q of mine(s, E)) E.pump(q, 1, 1); } } : null; },
  },
  ZZ135: { // Unbreakable Formation
    play: (s, E, ctx = {}) => {
      if (!mine(s, E).length) return null;
      if (ctx.enemyTurn) return { score: 2, run: () => { for (const q of mine(s, E)) E.pump(q, 0, 0, ['indestructible']); } };
      const n = mine(s, E).filter((q) => canSwing(s, E, q)).length;
      return (ctx.phase === 1 && n >= 2) || ctx.human ? { score: 4 + n * 2, run: () => { for (const q of mine(s, E)) { E.pump(q, 0, 0, ['indestructible', 'vigilance']); E.addCounters(s, q, 1); } } } : null;
    },
    react: (s, E, ctx) => { const saved = mine(s, E).filter((q) => !E.hasKw(s, q, 'indestructible') && atkList(s, E, ctx).some((a) => ctx.blocks?.get(a.uid) === q && E.power(s, a) >= E.need(s, q))); return saved.length ? { score: saved.length * 5, run: () => { for (const q of mine(s, E)) E.pump(q, 0, 0, ['indestructible']); } } : null; },
  },
  ZZ136: { // Take Up the Shield
    play: (s, E, ctx = {}) => { const t = E.bestBuffTarget(s, null, { ready: true }); return t && (ctx.human || (ctx.phase === 1 && canSwing(s, E, t))) ? { score: 4, run: () => { E.target(s, t); E.addCounters(s, t, 1); E.pump(t, 0, 0, ['lifelink', 'indestructible']); } } : null; },
    react: (s, E, ctx) => { const t = mine(s, E).find((q) => !E.hasKw(s, q, 'indestructible') && atkList(s, E, ctx).some((a) => ctx.blocks?.get(a.uid) === q && E.power(s, a) >= E.need(s, q))); return t ? { score: 5, run: () => { E.addCounters(s, t, 1); E.pump(t, 0, 0, ['lifelink', 'indestructible']); } } : null; },
    tgt: [{ side: 'P', label: '＋1/＋1カウンターを おく クリーチャー' }], apply: (s, E, [[t]]) => { if (!t) return; E.target(s, t); E.addCounters(s, t, 1); E.pump(t, 0, 0, ['lifelink', 'indestructible']); },
  },
  ZZ137: { // Dauntless Onslaught：攻撃の とちゅうは えらんだ 1体 ＋ いちばん つよい 攻撃中の 1体。メインフェイズは 2体を えらぶ
    trick: { kind: 'single', p: 2, t: 2 },
    singleRun: (s, E, q) => { E.pump(q, 2, 2); const o = mine(s, E).filter((x) => x !== q && x.attacking).sort((a, b) => E.power(s, b) - E.power(s, a))[0]; if (o) E.pump(o, 2, 2); },
    play: (s, E, ctx = {}) => { const ts = mine(s, E).filter((q) => canSwing(s, E, q)).sort((a, b) => E.power(s, b) - E.power(s, a)).slice(0, 2); return ts.length && (ctx.human || (ctx.phase === 1 && ts.length === 2)) ? { score: 5, run: () => { for (const t of ts) { E.target(s, t); E.pump(t, 2, 2); } } } : null; },
    tgt: [{ side: 'P', max: 2, label: '＋2/＋2 する クリーチャー（2体まで）' }], apply: (s, E, [ts]) => { for (const t of ts || []) { E.target(s, t); E.pump(t, 2, 2); } },
  },
  ZZ138: aura('E', 'つける てきの クリーチャー（タップして おきない）', { pacify: true, onAttach: (s, p, E, h) => { h.tapped = true; h.iceBy = p; E.L(s, `${h.def.name} は タップして おきない`); } }), // Claustrophobia
  ZZ139: { // Pressure Point
    play: (s, E, ctx = {}) => { const t = foeBest(s, E, 99, (q) => !q.frozen)?.t; return t && (ctx.human || ((ctx.phase === 1 && E.readyAttackers(s).length) || (ctx.phase === 2 && E.power(s, t) >= 2))) ? { score: 3, run: () => { E.target(s, t); detain(s, E, t); E.drawCard(s); } } : null; },
    tgt: [{ side: 'E', label: 'タップする クリーチャー（つぎも おきない）' }], apply: (s, E, [[t]]) => { if (t) { E.target(s, t); detain(s, E, t); } E.drawCard(s); },
  },
  ZZ140: { // Polymorphist's Jest（能力は なくならない）
    play: (s, E, ctx = {}) => { const big = theirs(s, E).filter((t) => !t.tapped).reduce((a, t) => a + Math.max(0, E.power(s, t) - 1), 0); return theirs(s, E).length && (ctx.human || (ctx.phase === 1 && E.readyAttackers(s).length >= 2 && big >= 4)) ? { score: 2 + big, run: () => { for (const t of theirs(s, E)) t.setPT = [1, 1]; E.L(s, 'てきの クリーチャーは みんな 1/1'); E.sba(s); } } : null; },
    react: (s, E, ctx) => { const v = atkList(s, E, ctx).reduce((a, t) => a + Math.max(0, E.power(s, t) - 1), 0); return ctx.when === 'attack' && v >= 4 ? { score: v, run: () => { for (const t of theirs(s, E)) t.setPT = [1, 1]; E.L(s, 'てきの クリーチャーは みんな 1/1'); E.sba(s); } } : null; },
  },
  ZZ141: foe1('はかいする 伝説（でんせつ）でない クリーチャー', killIt, { filter: (s, E, p) => !p.def.legend }), // Cast Down
  ZZ142: { // Vicious Offering（キッカーは マナ）
    kicker: 3,
    play: (s, E, ctx = {}) => {
      const k = (ctx.manaLeft ?? 0) >= 3, b2 = foeBest(s, E, 2, (t) => left(s, E, t) <= 2), b5 = k ? foeBest(s, E, 5, (t) => left(s, E, t) <= 5) : null;
      const b = b2 && (!b5 || E.power(s, b2.t) >= E.power(s, b5.t)) ? b2 : b5;
      if (!b) return null; const kk = b !== b2;
      return { score: 6 + b.score, extra: kk ? 3 : 0, run: () => { E.target(s, b.t); E.addMinus(s, b.t, kk ? 5 : 2); E.sba(s); } };
    },
    tgt: [{ side: 'E', label: '−1/−1カウンターを 2こ（キッカーで 5こ）おく クリーチャー' }], apply: (s, E, [[t]], x, o = {}) => { if (!t) return; const n = o.kicked ? 5 : 2; E.target(s, t); E.addMinus(s, t, n); E.sba(s); },
  },
  ZZ143: foe1('はかいする タップ状態（じょうたい）の クリーチャー', killIt, { filter: (s, E, p) => p.tapped }), // Assassinate
  ZZ144: { // Infernal Grasp
    play: (s, E) => { const b = s.P.life > 6 && foeBest(s, E, 99); return b && E.power(s, b.t) >= 2 ? { score: 4 + b.score, run: () => { E.target(s, b.t); killIt(s, E, b.t); E.hurt(s, 2); } } : null; },
    tgt: [{ side: 'E', label: 'はかいする クリーチャー' }], apply: (s, E, [[t]]) => { if (t) { E.target(s, t); killIt(s, E, t); } E.hurt(s, 2); },
  },
  ZZ145: { // Burst Lightning
    kicker: 4,
    play: (s, E, ctx = {}) => {
      const k = (ctx.manaLeft ?? 0) >= 4, b = E.burnTarget(s, k ? 4 : 2, { mustHit: !!ctx.human });
      if (!b) return null; const kk = k && (b.t === 'face' || E.need(s, b.t) > 2);
      return { score: 6 + b.score, extra: kk ? 4 : 0, run: () => hit(s, E, b.t, kk ? 4 : 2) };
    },
    tgt: [{ side: 'E', face: true, label: '2点（キッカーで 4点）を あたえる 相手' }], apply: (s, E, [[t]], x, o = {}) => hit(s, E, t, o.kicked ? 4 : 2),
  },
  ZZ146: { // Forked Bolt
    play: (s, E, ctx = {}) => {
      const ones = theirs(s, E).filter((t) => ok(s, E, t) && E.need(s, t) <= 1).slice(0, 2);
      if (ones.length === 2) return { score: 10, run: () => { for (const t of ones) hit(s, E, t, 1); } };
      const b = E.burnTarget(s, 2, { mustHit: !!ctx.human });
      return b ? { score: 6 + b.score, run: () => hit(s, E, b.t, 2) } : null;
    },
    tgt: [{ side: 'E', face: true, max: 2, divide: 2, label: '2点を わりふる 相手（1つか 2つ）' }], apply: (s, E, [list]) => { for (const d of list || []) hit(s, E, d.t, typeof d.n === 'number' ? d.n : 1); },
  },
  ZZ147: { // Chandra's Outrage
    play: (s, E, ctx = {}) => { const b = foeBest(s, E, 4) || (ctx.human ? foeBest(s, E) : null); return b ? { score: 8 + b.score, run: () => { hit(s, E, b.t, 4); faceHit(s, E, 2); } } : null; },
    tgt: [{ side: 'E', label: '4点を あたえる クリーチャー' }], apply: (s, E, [[t]]) => { hit(s, E, t, 4); faceHit(s, E, 2); },
  },
  ZZ148: { // Electrickery（超過）
    play: (s, E, ctx = {}) => {
      const ones = theirs(s, E).filter((t) => E.need(s, t) <= 1);
      if ((ctx.manaLeft ?? 0) >= 2 && ones.length >= 2) return { score: 4 + ones.length * 4, extra: 2, run: () => { for (const t of [...theirs(s, E)]) E.damage(s, t, 1, null); E.sba(s); } };
      const b = foeBest(s, E, 1); return b ? { score: 5 + b.score, run: () => hit(s, E, b.t, 1) } : null;
    },
    modes: [
      { label: 'てきの クリーチャー1体に 1点', tgt: [{ side: 'E', label: '1点を あたえる クリーチャー' }], apply: (s, E, [[t]]) => hit(s, E, t, 1) },
      { label: 'ちょうか（＋2マナ）：てきの クリーチャー ぜんぶに 1点', extra: 2, apply: (s, E) => { for (const t of [...theirs(s, E)]) E.damage(s, t, 1, null); E.sba(s); } },
    ],
  },
  ZZ149: { // Pounce（格闘）
    play: (s, E) => { const me = E.bestBuffTarget(s, null); if (!me) return null; const b = foeBest(s, E, E.power(s, me), (p) => E.power(s, p) < left(s, E, me)); return b ? { score: 5 + b.score, run: () => { E.target(s, me); E.fight(s, me, b.t); } } : null; },
    tgt: pair('かくとうする あなたの クリーチャー', 'かくとうする てきの クリーチャー'), apply: (s, E, [[a], [b]]) => { if (a && b) { E.target(s, a); E.fight(s, a, b); } },
  },
  ZZ150: { // Wildsize
    trick: { kind: 'single', p: 2, t: 2, trample: true }, singleRun: (s, E, q) => { E.pump(q, 2, 2, ['trample']); E.drawCard(s); },
    play: (s, E, ctx = {}) => { const t = E.bestBuffTarget(s, null, { ready: true }); return t && (ctx.human || (ctx.phase === 1 && canSwing(s, E, t))) ? { score: 3, run: () => { E.target(s, t); E.pump(t, 2, 2, ['trample']); E.drawCard(s); } } : null; },
    tgt: [{ side: 'P', label: '＋2/＋2 と トランプルの クリーチャー' }], apply: (s, E, [[t]]) => { if (t) { E.target(s, t); E.pump(t, 2, 2, ['trample']); } E.drawCard(s); },
  },
  // ---- 終結スキル（召集 ＋ タップした 敵で 安く） ----
  ZZ151: { ...ULT, // Divine Verdict（攻撃しているか タップ状態の クリーチャーを 破壊）
    play: (s, E, ctx = {}) => { const b = foeBest(s, E, 99, tappedOrAtk); return b && (ctx.human || E.power(s, b.t) >= 2) ? { score: 6 + b.score, run: () => { E.target(s, b.t); killIt(s, E, b.t); } } : null; },
    react: (s, E, ctx) => { const t = atkList(s, E, ctx).sort((a, b) => E.power(s, b) - E.power(s, a))[0]; return t && E.power(s, t) >= 2 ? { score: E.enemyThreatOf(s, t) + 2, run: () => { E.target(s, t); killIt(s, E, t); } } : null; },
    tgt: [{ side: 'E', label: 'はかいする こうげき中か タップ状態（じょうたい）の クリーチャー', filter: (s, E, p) => tappedOrAtk(p) }], apply: (s, E, [[t]]) => { if (t) { E.target(s, t); killIt(s, E, t); } },
  },
  ZZ152: { ...ULT, // Secure the Wastes
    play: (s, E, ctx = {}) => { const x = ctx.xMax || 0; return x >= 2 || (ctx.human && x) ? { score: 2 + x * 2, x, run: (xx) => E.token(s, 'P', T.soldier, xx) } : null; },
    apply: (s, E, picks, x) => E.token(s, 'P', T.soldier, x || 1),
  },
  ZZ153: { ...ULT, // Aetherize
    reactive: true,
    react: (s, E, ctx) => { const atk = atkList(s, E, ctx), v = atk.reduce((a, t) => a + Math.max(0, E.power(s, t)), 0); return atk.length && v >= 3 ? { score: v + atk.length * 2, run: () => { for (const t of atk) if (E.onBf(s, t)) tuck(s, E, t); E.sba(s); } } : null; },
  },
  ZZ154: { ...ULT, // Repulse
    play: (s, E, ctx = {}) => { const b = foeBest(s, E, 99)?.t; return b && (ctx.human || E.power(s, b) >= 2) ? { score: 5 + E.power(s, b), run: () => { E.target(s, b); tuck(s, E, b); E.drawCard(s); E.sba(s); } } : null; },
    react: (s, E, ctx) => { const t = atkList(s, E, ctx).filter((q) => !ctx.blocks?.has(q.uid)).sort((a, b) => E.power(s, b) - E.power(s, a))[0]; return t && E.power(s, t) >= 3 ? { score: E.power(s, t) + 1, run: () => { tuck(s, E, t); E.drawCard(s); E.sba(s); } } : null; },
    tgt: [{ side: 'E', label: 'もどす クリーチャー（てきは やまふだの 一番下へ）' }], apply: (s, E, [[t]]) => { if (t) { E.target(s, t); tuck(s, E, t); } E.drawCard(s); E.sba(s); },
  },
  ZZ155: { ...ULT, // Ravenform：追放して、てきに 1/1 の 鳥（飛行）
    play: (s, E) => { const b = foeBest(s, E, 99, (q) => E.power(s, q) >= 2 || E.pt(s, q)[1] >= 3)?.t; return b ? { score: 4 + E.power(s, b), run: () => { E.target(s, b); exileIt(s, E, b); E.token(s, 'E', TK2.bird, 1); } } : null; },
    tgt: [{ side: 'E', label: 'ついほうする てきの クリーチャー（てきに 1/1 の 鳥）' }], apply: (s, E, [[t]]) => { if (t) { E.target(s, t); exileIt(s, E, t); } E.token(s, 'E', TK2.bird, 1); },
  },
  ZZ156: { ...ULT, // 墨の 一筆（Lethal Scheme）：破壊して、タップ状態の じぶんの クリーチャーに ＋1/＋1カウンター
    play: (s, E, ctx = {}) => { const b = foeBest(s, E, 99); if (!b) return null; const tp = mine(s, E).filter((q) => q.tapped).length; if (!ctx.human && ctx.phase === 1 && E.power(s, b.t) < 3) return null; return { score: 6 + b.score + tp, run: () => { E.target(s, b.t); killIt(s, E, b.t); for (const q of mine(s, E)) if (q.tapped) E.addCounters(s, q, 1); } }; },
    tgt: [{ side: 'E', label: 'はかいする クリーチャー' }], apply: (s, E, [[t]]) => { if (t) { E.target(s, t); killIt(s, E, t); } for (const q of mine(s, E)) if (q.tapped) E.addCounters(s, q, 1); },
  },
  ZZ157: { ...ULT, ...foe1('−1/−1カウンターを 2こ おく クリーチャー（おなじ 名前の てきも）', (s, E, t) => { // Echoing Decay（2026-11-05：−1/−1カウンターに）
    if (!t || !E.onBf(s, t)) return;
    const all = [t, ...theirs(s, E).filter((q) => q !== t && q.def.name === t.def.name)];
    for (const q of all) E.addMinus(s, q, 2);
    E.sba(s);
  }, { n: 2 }) },
  ZZ158: { ...ULT, // Rolling Thunder（X を わりふる）
    play: (s, E, ctx = {}) => {
      const x = ctx.xMax || 0; if (x < 1) return null;
      const pl = spread(s, E, x, theirs(s, E).filter((t) => ok(s, E, t))), kills = pl.filter((d) => d.t !== 'face' && d.n >= E.need(s, d.t)).length;
      if (!kills && !(s.floor.face && x >= 3)) return null;
      return { score: 4 + kills * 4 + x, x, run: (xx) => { for (const d of spread(s, E, xx, theirs(s, E).filter((t) => ok(s, E, t)))) hit(s, E, d.t, d.n); } };
    },
    tgt: [{ side: 'E', face: true, max: 9, divide: 'x', label: 'X点を わりふる 相手' }], apply: (s, E, [list], x) => { for (const d of list || []) hit(s, E, d.t, typeof d.n === 'number' ? d.n : x); },
  },
  ZZ159: { ...ULT, ...foe1('4点を あたえる クリーチャー（この ターンに 死亡（しぼう）したら 追放（ついほう））', (s, E, t) => { if (t && E.onBf(s, t)) t.exileT = s.turn; hit(s, E, t, 4); }, { n: 4 }) }, // Lava Coil
  ZZ160: { ...ULT, // Clear Shot：＋1/＋1 して、その パワーの ダメージ（あなたの クリーチャーが あたえる ので 紊乱も おきる）
    play: (s, E) => { const me = E.bestBuffTarget(s, null); if (!me) return null; const b = foeBest(s, E, E.power(s, me) + 1); return b ? { score: 5 + b.score, run: () => { E.target(s, me); E.pump(me, 1, 1); zap(s, E, me, b.t, E.power(s, me)); } } : null; },
    // 人：てきは たおせる なかで パワーが いちばん 大きい（じぶんの クリーチャーの パワー ＋1 で。battle.js の ctx.prev）
    tgt: (() => { const [a, b] = pair('＋1/＋1 する あなたの クリーチャー', 'ダメージを うける てきの クリーチャー'); return [a, { ...b, n: (s, E, ctx) => { const me = ctx?.prev?.[0]?.[0]; return me && me !== 'face' ? E.power(s, me) + 1 : undefined; } }]; })(),
    apply: (s, E, [[a], [b]]) => { if (!a) return; E.target(s, a); E.pump(a, 1, 1); if (b) zap(s, E, a, b, E.power(s, a)); },
  },
  ZZ161: { ...ULT, // Overwhelming Stampede
    play: (s, E, ctx = {}) => {
      const rdy = mine(s, E).filter((q) => canSwing(s, E, q)).length;
      if (!mine(s, E).length || (!ctx.human && (ctx.phase !== 1 || rdy < 2))) return null;
      return { score: 4 + rdy * 3, run: () => { const x = Math.max(0, ...mine(s, E).map((q) => E.power(s, q))); E.L(s, `いちばん 大きい パワー ${x}：みんな ＋${x}/＋${x}`); for (const q of mine(s, E)) E.pump(q, x, x, ['trample']); } };
    },
  },
};
// レア・レジェンドの エージェントは みんな 交代を もつ（コスト − 2。2 より 下には しない。柚葉だけ 1）
const SWAP = { ZZ82: [2, 'W'], ZZ83: [2, 'W'], ZZ84: [2, 'W'], ZZ86: [2, 'U'], ZZ87: [2, 'U'], ZZ88: [2, 'U'], ZZ90: [3, 'K'], ZZ91: [2, 'K'], ZZ92: [2, 'K'], ZZ95: [2, 'R'], ZZ96: [2, 'R'], ZZ98: [3, 'R'], ZZ99: [2, 'G'], ZZ100: [1, 'G'], ZZ101: [2, 'G'], ZZ102: [2, 'G'] };
for (const [id, [n, k]] of Object.entries(SWAP)) { const { permScore, ...nj } = ninjutsu(n, [k]); S16[id] = { ...nj, ...S16[id] }; }
// エージェントは みんな 連携スキルを もつ（2026-11-04。もとから ある 9まい（アンビー・トリガー・照・儀玄・橘福福・葉瞬光・プルクラ・防衛軍・門下生）いがいは 色の かた。set12.js の CHAIN）
chainAll(S16, {
  W: ['ZZ84', 'ZZ85'],
  U: ['ZZ86', 'ZZ88', 'ZZ89'],
  Kc: ['ZZ91', 'ZZ92', 'ZZ93', 'ZZ94'], // 黒は −1/−1カウンター（2026-11-05）
  R: ['ZZ96', 'ZZ97', 'ZZ98'],
  G: ['ZZ100', 'ZZ101', 'ZZ102', 'ZZ104', 'ZZ105', 'ZZ106'],
});
