// レイド「タルキール大戦」の 統率者カード（80種）のうごき（名前・コスト・P/T は skel.js、文は docs/RAID_CARDS.md）
// パックには 出ない。統率者 ごとの カードプール（js/ui/commander.js の cmdPool）に だけ 入る
import { T, hit, mine, theirs, foeBest, killIt, bolt, delve, ferocious, isSub, chosen1, regrow, shrink, single, isCr } from './kit.js';
import { detain } from './set9.js';

// 増強 n：n マナ（色 c）・タップで ＋1/＋1カウンター。戦闘の あと だけ（三つの 旗と 同じ）
const outlast = (n, c) => ({ cost: n, req: [c], tap: true, when: [2], label: `増強（ぞうきょう）：＋1/＋1カウンター（${n}マナ）`, play: (s, p, E) => ({ score: 2, run: () => E.addCounters(s, p, 1) }) });
// ＋1/＋1カウンターが 置かれた あなたの クリーチャーは k を 持つ
const ctrGrant = (k) => (s, q, p, E) => (p.side === q.side && E.isCreature(p) && p.ctr > 0 ? [k] : null);
const selfCtr = (s, p, E) => { if (p.side === 'P') E.addCounters(s, p, 1); };
const noncr = (d) => !(d.types || []).includes('creature');
const gyCr = (s) => s.P.gy.filter((c) => isCr(c.def)).length;
const ready = (s, E) => E.bestBuffTarget(s, null, { ready: true });
// 上から n まいを 見て、f に あう ものを 1まい 手札、のこりは 墓地
function lookToGy(s, E, n, f = () => true) {
  const top = s.P.lib.splice(0, n);
  const pick = top.filter((c) => f(c.def)).sort((a, b) => E.keepValue(s, b) - E.keepValue(s, a))[0];
  if (pick) s.P.hand.push(pick);
  s.P.gy.push(...top.filter((c) => c !== pick));
  E.L(s, `${n}まい 見て ${pick ? 1 : 0}まいを てふだ、${top.length - (pick ? 1 : 0)}まいを ぼちへ`);
}
// てきの クリーチャーを タップ（ブロック できなく する）
const tapFoe = (s, E) => { const t = theirs(s, E).filter((q) => !q.tapped).sort((a, b) => E.power(s, b) - E.power(s, a))[0]; if (t) { E.tapPerm(s, t); E.L(s, `${t.def.name} を タップ`); } };
// あなたの クリーチャー a で てきの b と 格闘（＋ま え に pump）
const fightWith = (s, E, a, b, pre) => { if (!a || !b || !E.onBf(s, a) || !E.onBf(s, b)) return; pre?.(a); E.fight(s, a, b); };
// 1体に ダメージ（クリーチャーか 敵）。強さ n は うごく
const burnN = (nOf, label) => ({
  play: (s, E, ctx = {}) => { const n = nOf(s, E); const b = E.burnTarget(s, n, { mustHit: !!ctx.human }); return b ? { score: 5 + b.score, run: () => hit(s, E, b.t, nOf(s, E)) } : null; },
  tgt: [{ side: 'E', face: true, label }], apply: (s, E, [[t]]) => hit(s, E, t, nOf(s, E)),
});
// 敵の クリーチャー 1体に（AI は ねらいたい もの）
const foeSpell = (score, f, label, filter) => ({
  play: (s, E) => { const b = foeBest(s, E, 99, filter && ((q) => filter(s, E, q))); return b ? { score: score + b.score, run: () => f(s, E, b.t) } : null; },
  tgt: [{ side: 'E', label, filter: filter && ((s, E, q) => filter(s, E, q)) }], apply: (s, E, [[t]]) => f(s, E, t),
});
const mineThenFoe = (labelA, labelB, f, score = 6) => ({
  play: (s, E) => { const a = mine(s, E).sort((x, y) => E.power(s, y) - E.power(s, x))[0]; const b = a && foeBest(s, E, E.power(s, a) + 1); return b ? { score: score + b.score, run: () => f(s, E, a, b.t) } : null; },
  tgt: [{ side: 'mine', label: labelA }, { side: 'E', label: labelB }], apply: (s, E, [[a], [b]]) => f(s, E, a, b),
});

export const S13 = {
  // ---- アナフェンザ（＋1/＋1カウンター） ----
  CM01: { acts: [outlast(2, 'W')] },
  CM02: { etb: selfCtr },
  CM03: {
    etb: (s, p, E) => { if (p.side === 'P') E.bolster(s, 2); },
    onAttacks: (s, q, atk, E) => { if (q.side === 'P' && atk.some((a) => a.p.ctr > 0)) tapFoe(s, E); },
  },
  CM04: { acts: [outlast(1, 'K')], grant: ctrGrant('deathtouch') },
  CM05: { acts: [outlast(2, 'G')], grant: ctrGrant('reach') },
  CM06: { acts: [outlast(1, 'G')], grant: ctrGrant('trample') },
  CM07: { etb: selfCtr },
  CM08: {
    etb: (s, p, E) => { if (p.side === 'P') for (const q of mine(s, E)) E.addCounters(s, q, 1); },
    onOtherLeave: (s, p, q, E, o) => { if (p.side === 'P' && q.side === 'P' && o.died && E.isCreature(q) && !q.token) E.token(s, 'P', T.spirit); },
    permScore: (s, E) => 3 + 2 * mine(s, E).length,
  },

  // ---- ナーセット（クリーチャーでない 呪文） ----
  CM09: { onCast: (s, p, d, E) => { if (p.side === 'P' && noncr(d)) E.pump(p, 1, 0); } },
  CM10: { onCast: (s, p, d, E) => { if (p.side === 'P' && noncr(d)) E.pump(p, 0, 0, ['flying']); } },
  CM13: {
    play: (s, E, ctx) => { const t = ctx.phase === 1 && ready(s, E); return { score: 4, run: () => { if (t) E.pump(t, 1, 0); E.drawCard(s); } }; },
    tgt: [{ side: 'P', min: 0, label: '＋1/＋0 する クリーチャー' }], apply: (s, E, [[t]]) => { if (t) E.pump(t, 1, 0); E.drawCard(s); },
  },
  CM14: foeSpell(4, (s, E, t) => { detain(s, E, t); E.drawCard(s); }, 'タップして 止める クリーチャー'),
  CM15: {
    play: (s, E) => { const plan = E.divide(s, 2, theirs(s, E)); return { score: 4 + 3 * plan.length, run: () => { if (plan.length) { for (const d of plan) E.damage(s, d.t, d.n, null); E.sba(s); } else E.hitEnemy(s, 2, null); } }; },
    tgt: [{ side: 'E', face: true, max: 2, divide: 2, label: '2点を わりふる 相手' }],
    apply: (s, E, [al]) => { for (const d of al || []) hit(s, E, d.t, d.n); E.sba(s); },
  },

  // ---- シディシ（墓地） ----
  CM17: { ...delve(), kw: ['trample'] },
  CM18: { etb: (s, p, E) => { if (p.side === 'P') E.mill(s, 3); } },
  CM19: { etb: (s, p, E) => { if (p.side === 'P' && gyCr(s) >= 3) E.token(s, 'P', T.zombie, 2); } },
  CM20: { etb: (s, p, E) => { if (p.side === 'P') lookToGy(s, E, 4); } },
  CM21: { upkeep: (s, p, E) => { if (p.side === 'P' && gyCr(s) >= 3) regrow(s, E, isCr); } },
  CM22: { play: (s, E, ctx) => (ctx.phase === 2 || s.P.hand.length <= 2 ? { score: 4, run: () => lookToGy(s, E, 5, isCr) } : null) },
  CM23: foeSpell(5, (s, E, t) => shrink(s, E, t, 4), '−4/−4 する クリーチャー'),
  CM24: { onAttack: (s, p) => { p.flags.turn.unblockable = true; } },

  // ---- ズルゴ（戦士と 速攻） ----
  CM26: { etb: (s, p, E) => { if (p.side === 'P' && s.P.flags.attacked) { E.L(s, 'きょうしゅう'); E.addCounters(s, p, 1); } } },
  CM27: burnN((s) => (s.P.flags.attacked ? 5 : 4), '4点（きょうしゅうで 5点）を あたえる 相手'),
  CM28: { onAttack: (s, p, E) => { if (p.side === 'P') tapFoe(s, E); } },
  CM29: { etb: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', T.goblin, 3); } },
  CM30: {
    anthem: (s, q, p, E) => (p.side === q.side && E.isCreature(p) ? [1, 0] : null),
    onAllyHit: (s, q, src, E) => { if (q.side === 'P' && isSub(src, 'warrior') && s.P.life > 4) { E.drawCard(s); E.hurt(s, 1); } },
  },
  CM31: { onAttack: (s, p, E) => { if (p.side === 'P') E.hitEnemy(s, 1, p); } },
  CM32: { kwFn: (s, p) => (s[p.side].bf.some((q) => q !== p && isSub(q, 'warrior')) ? ['haste', 'lifelink'] : []) },

  // ---- スーラク（大きな クリーチャー） ----
  CM37: { ...delve(), ...single(6, 6) },
  CM38: single(3, 3, { kw: ['trample'] }),
  CM39: burnN((s, E) => (ferocious(s, E) ? 4 : 2), '2点（どうもうで 4点）を あたえる 相手'),
  CM40: { acts: [{ cost: 2, when: [1, 2], label: '＋1/＋1（この ターン）', play: (s, p, E, ctx) => (ctx?.phase === 1 && !p.sick ? { score: 1, run: () => E.pump(p, 1, 1) } : null) }] },

  // ---- アタルカ（ドラゴンと ダメージ） ----
  CM42: {
    tgt: [{ side: 'E', face: true, min: 0, label: '1点を あたえる 相手' }],
    etb: (s, p, E, o) => { if (p.side !== 'P') return; let t = chosen1(o); if (t === undefined) t = E.burnTarget(s, 1, { mustHit: true })?.t; if (t) hit(s, E, t, 1); },
  },
  CM43: mineThenFoe('ダメージを あたえる あなたの クリーチャー', 'ダメージを うける てき', (s, E, a, b) => { if (a && b && E.onBf(s, a) && E.onBf(s, b)) { E.damage(s, b, E.power(s, a), a); E.sba(s); } }),
  CM44: bolt(5),
  CM46: mineThenFoe('＋1/＋2 して 格闘する クリーチャー', '格闘する てき', (s, E, a, b) => fightWith(s, E, a, b, (x) => E.pump(x, 1, 2))),
  CM47: { grant: (s, q, p, E) => (p.side === q.side && E.isCreature(p) && (p.def.kw || []).includes('flying') ? ['haste'] : null) },
  CM48: { etb: selfCtr },

  // ---- ドロモカ（絆魂と かたい クリーチャー） ----
  CM49: { etb: (s, p, E) => { if (p.side === 'P') E.bolster(s, 1); } },
  CM51: { etb: selfCtr },
  CM52: { etb: (s, p, E) => { if (p.side === 'P') E.gain(s, 3); } },
  CM54: single(2, 2, { kw: ['trample'] }),
  CM55: { etb: selfCtr },
  CM56: mineThenFoe('＋1/＋1カウンターを おいて 格闘する クリーチャー', '格闘する てき', (s, E, a, b) => { fightWith(s, E, a, b, (x) => E.addCounters(s, x, 1)); E.gain(s, 2); }, 7),

  // ---- コラガン（速攻と はかい） ----
  CM57: { mustAttack: true },
  CM58: { acts: [{ cost: 1, req: ['R'], when: [1, 2], label: '＋1/＋0（この ターン）', play: (s, p, E, ctx) => (ctx?.phase === 1 && !p.tapped ? { score: 1, run: () => E.pump(p, 1, 0) } : null) }] },
  CM59: { etb: (s, p, E) => { if (p.side === 'P') for (const q of mine(s, E)) E.pump(q, 0, 0, ['haste']); } },
  CM60: foeSpell(6, (s, E, t) => killIt(s, E, t), 'はかいする クリーチャー'),
  CM61: foeSpell(5, (s, E, t) => hit(s, E, t, 4), '4点を あたえる クリーチャー'),
  CM62: single(1, 2, { kw: ['deathtouch'] }),
  CM63: { onDie: (s, p, E) => { if (p.side === 'P') E.hitEnemy(s, 1, null); } },
  CM64: {
    play: (s, E, ctx = {}) => { const b = E.burnTarget(s, 2, { mustHit: !!ctx.human }); return b ? { score: 6 + b.score, run: () => { hit(s, E, b.t, 2); regrow(s, E, isCr); } } : null; },
    tgt: [{ side: 'E', face: true, label: '2点を あたえる 相手' }], apply: (s, E, [[t]]) => { hit(s, E, t, 2); regrow(s, E, isCr); },
  },

  // ---- オジュタイ（飛行と カードを 引く） ----
  CM68: {
    tgt: [{ side: 'E', min: 0, label: '手札に もどす クリーチャー（てきは やまふだの 上へ）' }],
    etb: (s, p, E, o) => { if (p.side !== 'P') return; let t = chosen1(o); if (t === undefined) t = foeBest(s, E)?.t; if (t && E.onBf(s, t)) { E.bounce(s, t); E.sba(s); } },
  },
  CM69: { etb: (s, p, E) => { if (p.side === 'P') E.drawCard(s); } },
  CM70: { etb: (s, p, E) => { if (p.side === 'P') E.gain(s, 3); } },
  CM71: { play: (s, E, ctx) => (ctx.phase === 2 || s.P.hand.length <= 1 ? { score: 12, run: () => E.drawCard(s, 4) } : null) },
  CM72: { onCast: (s, p, d, E) => { if (p.side === 'P' && noncr(d)) tapFoe(s, E); } },

  // ---- シルムガル（じゃまを する） ----
  CM74: {
    tgt: [{ side: 'E', min: 0, label: '−1/−1カウンターを 2こ おく クリーチャー' }],
    etb: (s, p, E, o) => { if (p.side !== 'P') return; let t = chosen1(o); if (t === undefined) t = (foeBest(s, E, 2) || foeBest(s, E))?.t; if (t && E.onBf(s, t)) { E.addMinus(s, t, 2); E.sba(s); } },
  },
  CM75: { etb: (s, p, E) => { if (p.side === 'P') { E.drawCard(s); E.hurt(s, 1); } } },
  CM77: foeSpell(6, (s, E, t) => killIt(s, E, t), 'はかいする 1色の クリーチャー', (s, E, q) => E.colorsOf(q.def).length === 1),
  CM78: foeSpell(4, (s, E, t) => { hit(s, E, t, 2); E.gain(s, 2); }, '2点を あたえる クリーチャー'),
  CM79: { etb: (s, p, E) => { if (p.side !== 'P') return; for (const q of theirs(s, E).filter((x) => E.pt(s, x)[1] <= 2)) if (E.onBf(s, q)) E.bounce(s, q); E.sba(s); } },
  CM80: {
    tgt: [{ side: 'E', min: 0, filter: (s, E, q) => E.power(s, q) <= 3, label: 'はかいする パワー3 いかの クリーチャー' }],
    etb: (s, p, E, o) => { if (p.side !== 'P') return; let t = chosen1(o); if (t === undefined) t = foeBest(s, E, 99, (q) => E.power(s, q) <= 3)?.t; killIt(s, E, t); },
  },
};
