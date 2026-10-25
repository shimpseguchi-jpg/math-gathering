// 番外編「ゼンレスゾーンゼロ」のうごき（名前・コスト・P/T は skel.js、文は docs/EXTRA.md 4章）
// しくみは MTG の もの：ブレイク N（毒性。game.js の addBreak）・エネルギー（0〜10。s.P.bon）・交代（忍術）・終結スキル（召集）・増殖
// 音動機・終結スキルの こうかは MTG に あって この ゲームに まだ ない カード
import { mine, theirs, hit, foeBest, shrink, cr, foe1, bolt, killIt, exileIt, T } from './kit.js';

export const BON_MAX = 10;
export const bonOf = (s) => s.P.bon || 0;
export function addBon(s, E, n) {
  const was = bonOf(s), now = Math.max(0, Math.min(BON_MAX, was + n));
  s.P.bon = now;
  if (now !== was) E.L(s, `エネルギー ${was} ${n > 0 ? '＋' : '−'} ${Math.abs(n)} ＝ ${now}`);
}
const ninjutsu = (cost, req) => ({ ninjutsu: { cost, req }, permScore: (s, E, ctx) => (ctx.phase === 1 && E.readyAttackers(s).length ? null : 12) });
const canSwing = (s, E, p) => !p.tapped && (!p.sick || E.hasKw(s, p, 'haste'));
const biggest = (s, E, f = () => true) => theirs(s, E).filter(f).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
const detain = (s, E, t) => { if (t && E.onBf(s, t)) { t.tapped = true; t.frozen = true; E.L(s, `${t.def.name} を タップ（つぎも おきない）`); } };
const foeThreat = (s, E) => theirs(s, E).some((t) => t.def.attacks !== false && E.power(s, t) >= 2);
const isCre = (p) => (p.def.types || []).includes('creature');
const hasSub = (p, x) => (p.def.sub || []).includes(x);
const P_ = (side) => (s, p) => side === p.side;

// 「エネルギー n：〜」：エネルギーを n 使う 起動型能力（じぶんの メインフェイズ）。b = { label, play(s, p, E, ctx) → { score, run }, tgt?, apply?(s, E, picks, p) }
const bonAct = (n, b) => ({
  cost: 0, bonUse: n, when: [1, 2], label: b.label,
  can: (s) => bonOf(s) >= n, cantWhy: `エネルギーが ${n} に たりない`,
  play: (s, p, E, ctx) => { if (bonOf(s) < n) return null; const r = b.play(s, p, E, ctx); return r && { score: r.score, run: () => { addBon(s, E, -n); r.run(); E.sba(s); } }; },
  ...(b.tgt ? { tgt: b.tgt, apply: (s, E, picks, x, p) => { addBon(s, E, -n); b.apply(s, E, picks, p); E.sba(s); } } : {}),
});
const etbBon = (n, more) => (s, p, E, o) => { if (p.side !== 'P') return; addBon(s, E, n); more?.(s, p, E, o); };
const atkBon = (n) => (s, p, E) => { if (p.side === 'P') addBon(s, E, n); };
const selfPump = (label, a, b, kws = []) => ({ label, play: (s, p, E, ctx) => (ctx.phase === 1 && canSwing(s, E, p) ? { score: 3 + a, run: () => E.pump(p, a, b, kws) } : null) });
// 戦場に 出たとき 敵の クリーチャー1体に（人は えらぶ。えらばなければ AI と 同じ）
const etbFoe = (label, f, pick, more = {}) => ({
  ...more, tgt: [{ side: 'E', min: 0, label }],
  etb: (s, p, E, o) => { if (p.side !== 'P') return; more.etb?.(s, p, E, o); const c = o?.chosen ? o.chosen[0]?.[0] : pick(s, E); if (c && E.onBf(s, c)) f(s, E, c); },
});
const prolif = (s, p, E) => { if (p.side === 'P') { E.L(s, 'ぞうしょく'); E.proliferate(s); } };
// ほかの（しゅぞく）は ＋a/＋b
const lord = (sub, a, b) => (s, q, p) => (p !== q && p.side === q.side && isCre(p) && (!sub || hasSub(p, sub)) ? [a, b] : null);
// ぜんぶ ちいさく・ぜんぶ ダメージ の ねうち（てき − じぶん）
const wipeValue = (s, E, dies) => { const v = (q) => E.power(s, q) + q.def.cost; return theirs(s, E).filter((q) => dies(q)).reduce((a, q) => a + v(q), 0) - 1.2 * mine(s, E).filter((q) => dies(q)).reduce((a, q) => a + v(q), 0); };
const left = (s, E, q) => E.pt(s, q)[1] - q.dmg;
// 2体を えらぶ（じぶんの クリーチャー ＋ てきの クリーチャー）
const pair = (labelA, labelB) => [{ side: 'P', label: labelA }, { side: 'E', label: labelB }];

const TK = {
  boar: cr('t_boar', 'イノシシ', null, 'R', 0, 1, 1, ['boar']),
  ethereal: cr('t_ethereal', 'エーテリアス', null, 'K', 0, 1, 1, ['ethereal']),
  knight: cr('t_knight22', '騎士（きし）', null, 'W', 0, 2, 2, ['knight'], ['vigilance']),
};

export const S12 = {
  // ---- エージェント ----
  ZZ01: { brk: 1, onAttack: atkBon(1) },
  ZZ02: { etb: etbBon(2), acts: [bonAct(3, {
    label: 'エネルギー 3：てきの クリーチャーに −1/−1カウンター 2こ',
    play: (s, p, E) => { const b = foeBest(s, E, 2) || foeBest(s, E); return b ? { score: 4 + Math.min(3, E.power(s, b.t)), run: () => E.addMinus(s, b.t, 2) } : null; },
    tgt: [{ side: 'E', label: '−1/−1カウンターを 2こ おく クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.addMinus(s, t, 2); },
  })] },
  ZZ03: { onAttack: (s, p, E) => { if (p.side === 'P' && bonOf(s) >= 3) E.pump(p, 2, 0); } },
  ZZ04: { ...ninjutsu(1, ['G']), brk: 1 },
  ZZ05: { ...etbFoe('タップする てきの クリーチャー（つぎも おきない）', detain, (s, E) => biggest(s, E, (t) => !t.frozen)), ...ninjutsu(2, ['U']), brk: 1 },
  ZZ06: { onAttack: (s, p, E) => { if (p.side === 'P') detain(s, E, biggest(s, E, (t) => !t.frozen && t.def.attacks !== false)); } },
  ZZ07: { etb: etbBon(2), acts: [bonAct(2, {
    label: 'エネルギー 2：クリーチャー1体 ＋1/＋1',
    play: (s, p, E, ctx) => { if (ctx.phase !== 1) return null; const t = E.bestBuffTarget(s, null, { ready: true }); return t && canSwing(s, E, t) ? { score: 3, run: () => E.pump(t, 1, 1) } : null; },
    tgt: [{ side: 'P', label: '＋1/＋1 する クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.pump(t, 1, 1); },
  })] },
  ZZ08: { brk: 1 },
  ZZ09: { etb: etbBon(1), anthem: lord('白祇重工', 1, 0) },
  ZZ10: { etb: prolif },
  ZZ11: { onAttack: (s, p, E) => { if (p.side === 'P' && bonOf(s) >= 4) E.pump(p, 0, 0, ['double']); } },
  ZZ12: { allyDmgLess: 1 },
  ZZ13: { brk: 2, onAttack: (s, p, E) => { if (p.side !== 'P') return; const b = foeBest(s, E, 2) || foeBest(s, E); if (b) hit(s, E, b.t, 2); } },
  ZZ14: { ...ninjutsu(1, ['W']), brk: 1 },
  ZZ15: { brk: 2, etb: prolif },
  ZZ16: { anthem: lord(null, 1, 0) },
  ZZ17: { brk: 2, onAttack: (s, p, E) => { if (p.side !== 'P') return; const b = foeBest(s, E, 1) || foeBest(s, E); if (b) hit(s, E, b.t, 1); } },
  ZZ18: { onAttack: atkBon(1) },
  ZZ19: { ...ninjutsu(1, ['G']), brk: 2 },
  ZZ20: { etb: etbBon(2), acts: [bonAct(2, {
    label: 'エネルギー 2：つぎの てきの ターン、1体は ダメージを うけない',
    play: (s, p, E) => { const t = foeThreat(s, E) ? E.bestBuffTarget(s, null) : null; return t && t.shieldT !== s.turn + 1 ? { score: 2, run: () => { t.shieldT = s.turn + 1; } } : null; },
    tgt: [{ side: 'P', label: 'まもる クリーチャー' }], apply: (s, E, [[t]]) => { t.shieldT = s.turn + 1; E.L(s, `${t.def.name}：つぎの てきの ターン ダメージ 0`); },
  })] },
  ZZ21: { anthem: lord('カリュドーンの子', 1, 1) },
  ZZ22: { brk: 1, onAttack: (s, p, E) => { if (p.side !== 'P') return; for (const t of [...theirs(s, E)]) E.damage(s, t, 1, p); E.sba(s); } },
  ZZ23: { onAttack: atkBon(1) },
  ZZ24: { etb: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', TK.boar, 2); } },
  ZZ25: { brk: 1 },
  ZZ26: { ...ninjutsu(2, ['R']), brk: 2, onFaceHit: (s, p, E) => { const b = foeBest(s, E, 2) || foeBest(s, E); if (b) hit(s, E, b.t, 2); } },
  ZZ27: { etb: etbBon(2), acts: [bonAct(3, {
    label: 'エネルギー 3：みんな ＋1/＋1',
    play: (s, p, E, ctx) => (ctx.phase === 1 && mine(s, E).filter((q) => canSwing(s, E, q)).length >= 2 ? { score: 5, run: () => { for (const q of mine(s, E)) E.pump(q, 1, 1); } } : null),
  })] },
  ZZ28: { brk: 1 },
  // ---- モブ ----
  ZZ30: { etb: etbBon(1) },
  ZZ31: etbFoe('タップする てきの クリーチャー', (s, E, t) => { t.tapped = true; E.L(s, `${t.def.name} を タップ`); }, (s, E) => biggest(s, E, (t) => !t.tapped)),
  ZZ33: { brk: 1 },
  ZZ34: { etb: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', TK.ethereal, 1); } },
  ZZ35: { onDie: (s, p, E) => { if (p.side === 'P') E.addBreak(s, 1); } },
  ZZ36: { brk: 2 },
  ZZ37: { etb: etbBon(1) },
  ZZ39: { brk: 1 },
  ZZ41: { etb: (s, p, E) => { if (p.side === 'P') E.gain(s, 2); } },
  ZZ43: { acts: [bonAct(2, selfPump('エネルギー 2：＋2/＋0', 2, 0))] },
  ZZ44: { etb: prolif },
  // ---- ボンプ ----
  ZZ45: { etb: etbBon(2), acts: [bonAct(4, { label: 'エネルギー 4：てきに ブレイクカウンター 2こ', play: (s, p, E) => ({ score: s.floor.face ? 5 : 3, run: () => E.addBreak(s, 2) }) })] },
  ZZ46: { etb: etbBon(1), acts: [bonAct(2, selfPump('エネルギー 2：＋2/＋2', 2, 2))] },
  ZZ47: { onAttack: atkBon(1) },
  ZZ48: { etb: etbBon(1, (s, p, E) => { if (E.basicsInLib(s)) E.rampBasic(s, 1); }) },
  ZZ49: { acts: [bonAct(3, {
    label: 'エネルギー 3：てきの クリーチャーに 3点',
    play: (s, p, E) => { const b = foeBest(s, E, 3); return b ? { score: 3 + b.score, run: () => hit(s, E, b.t, 3) } : null; },
    tgt: [{ side: 'E', label: '3点を あたえる クリーチャー' }], apply: (s, E, [[t]]) => hit(s, E, t, 3),
  })] },
  ZZ50: { upkeep: (s, p, E) => { if (p.side === 'P') addBon(s, E, 1); } },
  // ---- 音動機（MTG の カードの こうか） ----
  ZZ51: { equip: 3, eqP: 2, grant: (s, q, p) => (p.uid === q.attached ? ['first', 'vigilance', 'trample', 'haste'] : null) }, // 復讐の剣
  ZZ52: { equip: 1, eqP: 3, eqT: 1 }, // 家宝の刃
  ZZ53: { equip: 1, eqP: 1, eqT: 1 }, // レオニンの円月刀
  ZZ54: { play: (s, E) => ({ score: 8, run: () => E.token(s, 'P', TK.knight, 2) }) }, // 騎兵隊の 呼び出し
  ZZ55: { play: (s, E) => ({ score: 8, run: () => E.token(s, 'P', T.goblin, 3) }) }, // ホードリングの 噴出
  ZZ56: { // 苗木の 移住（キッカーで 4体）
    kicker: 4,
    play: (s, E, ctx = {}) => { const k = (ctx.manaLeft ?? 0) >= 4; return { score: k ? 10 : 6, extra: k ? 4 : 0, run: () => E.token(s, 'P', T.saproling, k ? 4 : 2) }; },
    apply: (s, E, picks, x, o = {}) => E.token(s, 'P', T.saproling, o.kicked ? 4 : 2),
  },
  ZZ57: { play: (s, E) => ({ score: 8, run: () => E.token(s, 'P', T.spirit, 2) }), flashback: { cost: 2, req: ['K'] } }, // 未練ある魂
  ZZ58: foe1('−2/−2 する クリーチャー', (s, E, t) => { shrink(s, E, t, 2); E.gain(s, 2); }, { n: 2 }), // 渇望の 瞬間
  ZZ59: bolt(3, (s, E) => E.proliferate(s)), // 電圧の放出
  ZZ60: foe1('−1/−1カウンターを おく クリーチャー', (s, E, t) => { E.addMinus(s, t, 1); E.proliferate(s); E.sba(s); }, { n: 2 }), // 無情な苦悩
  ZZ61: foe1('はかいする クリーチャー', (s, E, t) => { killIt(s, E, t); E.proliferate(s); }), // 病の拡散
  ZZ62: { // 伝染病の留め金
    ...etbFoe('−1/−1カウンターを おく てきの クリーチャー', (s, E, t) => { E.addMinus(s, t, 1); E.sba(s); }, (s, E) => foeBest(s, E, 1)?.t || biggest(s, E)),
    acts: [{ cost: 4, tap: true, when: [1, 2], label: 'ぞうしょく', play: (s, p, E) => (s.P.bf.some((q) => q.ctr > 0) || s.E.bf.some((q) => q.mctr > 0) || bonOf(s) > 0 || s.E.brk > 0 ? { score: 3, run: () => E.proliferate(s) } : null) }],
  },
  ZZ63: { // 危機の中の勇気
    play: (s, E) => { const t = E.bestBuffTarget(s, null); return t ? { score: 5, run: () => { E.addCounters(s, t, 1); E.proliferate(s); } } : null; },
    tgt: [{ side: 'P', label: '＋1/＋1カウンターを おく クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.addCounters(s, t, 1); E.proliferate(s); },
  },
  ZZ64: bolt(3), // 火山の鎚
  ZZ65: { // 聖なる光
    play: (s, E, ctx) => { const nw = (q) => !E.colorsOf(q.def).includes('W'); const v = wipeValue(s, E, (q) => nw(q) && left(s, E, q) <= 1); return v > 2 || ctx.human ? { score: v, run: () => { for (const q of [...mine(s, E), ...theirs(s, E)]) if (nw(q)) E.pump(q, -1, -1); E.sba(s); } } : null; },
  },
  ZZ66: foe1('3点を あたえる 白でない クリーチャー', (s, E, t) => hit(s, E, t, 3), { n: 3, filter: (s, E, p) => !E.colorsOf(p.def).includes('W') }), // 太陽の槍
  ZZ67: { // 古きクローサの力：こうげきの とちゅうは ＋2/＋2、メインフェイズは ＋4/＋4
    trick: { kind: 'single', p: 2, t: 2 }, singleRun: (s, E, q) => E.pump(q, 2, 2),
    play: (s, E, ctx) => { if (ctx.phase !== 1) return null; const t = E.bestBuffTarget(s, null, { ready: true }); return t && canSwing(s, E, t) ? { score: 6, run: () => E.pump(t, 4, 4) } : null; },
    tgt: [{ side: 'P', label: '＋4/＋4 する クリーチャー（メインフェイズ）' }], apply: (s, E, [[t]]) => { E.target(s, t); E.pump(t, 4, 4); },
  },
  ZZ68: { // ハイドラの相：X は 緑の パーマネントの 数
    trick: { kind: 'single', p: 2, t: 2 }, singleRun: (s, E, q) => { const x = E.devotion(s, 'G'); E.L(s, `みどりの パーマネント ${x}`); E.pump(q, x, x); },
    play: (s, E, ctx) => { const x = E.devotion(s, 'G'); if (ctx.phase !== 1 || x < 2) return null; const t = E.bestBuffTarget(s, null, { ready: true }); return t && canSwing(s, E, t) ? { score: 2 + x, run: () => E.pump(t, x, x) } : null; },
    tgt: [{ side: 'P', label: '＋X/＋X する クリーチャー' }], apply: (s, E, [[t]]) => { const x = E.devotion(s, 'G'); E.target(s, t); E.pump(t, x, x); },
  },
  ZZ69: { // 大地の再誕（キッカーで 1まい 引く）
    kicker: 2,
    play: (s, E, ctx = {}) => { const b = E.burnTarget(s, 99, { creatureOnly: true, mustHit: true }); if (!b) return null; const k = (ctx.manaLeft ?? 0) >= 2; return { score: 3 + b.score * 0.5 + (k ? 1 : 0), extra: k ? 2 : 0, run: () => { E.bounce(s, b.t); if (k) E.drawCard(s); E.sba(s); } }; },
    tgt: [{ side: 'E', label: 'てふだに もどす（てきは やまふだの 上へ）クリーチャー' }], apply: (s, E, [[t]], x, o = {}) => { E.bounce(s, t); if (o.kicked) E.drawCard(s); E.sba(s); },
  },
  ZZ70: { // ゆがみの一撃
    play: (s, E, ctx) => { if (ctx.phase !== 1) return null; const t = E.bestBuffTarget(s, null, { ready: true }); return t && canSwing(s, E, t) ? { score: 4, run: () => { E.pump(t, 1, 0); t.flags.turn.unblockable = true; } } : null; },
    tgt: [{ side: 'P', label: '＋1/＋0 で ブロックされない クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.pump(t, 1, 0); t.flags.turn.unblockable = true; },
  },
  // ---- 終結スキル（召集） ----
  ZZ71: { ...(foe1('ついほうする タップした てきの クリーチャー', exileIt, { filter: (s, E, p) => p.tapped })), kw: ['convoke'] }, // 封じ込め
  ZZ72: { kw: ['convoke'], play: (s, E, ctx) => (ctx.phase === 1 && mine(s, E).filter((q) => canSwing(s, E, q)).length >= 2 ? { score: 6, run: () => { for (const q of mine(s, E)) E.pump(q, 1, 0, ['indestructible']); } } : null) }, // 抵抗の決意
  ZZ73: { kw: ['convoke'], // 凍える突風（X体を タップ・つぎも おきない）
    play: (s, E, ctx) => { const ts = theirs(s, E).filter((t) => !t.frozen).sort((a, b) => E.power(s, b) - E.power(s, a)); const x = Math.min(ctx.xMax || 0, ts.length); return x ? { score: 2 + x * 2, x, run: (xx) => { for (const t of ts.slice(0, xx)) detain(s, E, t); } } : null; },
    tgt: [{ side: 'E', max: 9, label: 'タップする クリーチャー（X体まで・つぎも おきない）' }], apply: (s, E, [ts], x) => { for (const t of ts.slice(0, x)) detain(s, E, t); },
  },
  ZZ74: { kw: ['convoke'], // 潮の波（ひこうの ない てきを 3体まで タップ）
    play: (s, E, ctx) => { const ts = theirs(s, E).filter((t) => !t.tapped && !E.hasKw(s, t, 'flying')).slice(0, 3); return ctx.phase === 1 && ts.length ? { score: 2 + ts.length * 2, run: () => { for (const t of ts) t.tapped = true; } } : null; },
    tgt: [{ side: 'E', max: 3, filter: (s, E, p) => !E.hasKw(s, p, 'flying'), label: 'タップする ひこうの ない クリーチャー（3体まで）' }], apply: (s, E, [ts]) => { for (const t of ts) t.tapped = true; },
  },
  ZZ75: { ...(foe1('ついほうする クリーチャー', (s, E, t) => { exileIt(s, E, t); E.gain(s, 2); })), kw: ['convoke'] }, // ヴラスカの侮辱
  ZZ76: { kw: ['convoke'], play: (s, E, ctx) => { const v = wipeValue(s, E, (q) => left(s, E, q) <= 4); return v > 4 || (ctx.human && theirs(s, E).length) ? { score: v, run: () => { for (const q of [...mine(s, E), ...theirs(s, E)]) E.pump(q, -4, -4); E.sba(s); } } : null; } }, // 衰滅
  ZZ77: { ...(bolt(4)), kw: ['convoke'] }, // 炎の稲妻
  ZZ78: { kw: ['convoke'], play: (s, E, ctx) => { const v = wipeValue(s, E, (q) => left(s, E, q) <= 2); return v > 3 || (ctx.human && theirs(s, E).length) ? { score: v, run: () => { for (const q of [...mine(s, E), ...theirs(s, E)]) E.damage(s, q, 2, null); E.sba(s); } } : null; } }, // 焦熱の砲撃
  ZZ79: { kw: ['convoke'], // 狂乱の噛みつき
    play: (s, E) => { const me = E.bestBuffTarget(s, null); if (!me) return null; const b = foeBest(s, E, E.power(s, me)); return b ? { score: 5 + b.score, run: () => { E.damage(s, b.t, E.power(s, me), me); E.sba(s); } } : null; },
    tgt: pair('ダメージを あたえる あなたの クリーチャー', 'ダメージを うける てきの クリーチャー'), apply: (s, E, [[a], [b]]) => { E.damage(s, b, E.power(s, a), a); E.sba(s); },
  },
  ZZ80: { kw: ['convoke'], // 原初の力（＋X/＋X して 格闘）
    play: (s, E, ctx) => { const me = E.bestBuffTarget(s, null); if (!me || !ctx.xMax) return null; const x = ctx.xMax; const b = foeBest(s, E, E.power(s, me) + x, (p) => E.power(s, p) < left(s, E, me) + x); return b ? { score: 5 + b.score, x, run: (xx) => { E.pump(me, xx, xx); E.fight(s, me, b.t); E.sba(s); } } : null; },
    tgt: pair('＋X/＋X して かくとうする あなたの クリーチャー', 'かくとうする てきの クリーチャー'), apply: (s, E, [[a], [b]], x) => { E.pump(a, x, x); E.fight(s, a, b); E.sba(s); },
  },
};
