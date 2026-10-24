// 第6弾「三つの 旗」のうごき（名前・コスト・P/T は skel.js、文は docs/SET6.md）
import { T, hit, mine, theirs, bestIn, lowestKeep, isCr, chosen1, regrow, foeBest, shrink, killIt, exileIt, isSpellDef } from './kit.js';

const drain = (s, E, n, src = null) => { E.hitEnemy(s, n, src); E.gain(s, n); };
// 旗：これが デッキに あれば その 3色の デッキに できる（4点）。タップで 3色の どれかの マナ
const banner = (cols, draw = false) => ({
  banner: cols, pts: 4, mana: [...cols],
  acts: draw ? [{
    cost: 3, req: [...cols], req3: true, tap: true, sac: true, when: [2], label: '3色の マナで、ぼちに おいて 1まい 引く',
    play: (s, p, E) => (s.P.mana.length >= 7 ? { score: 2, run: () => { E.leave(s, p, 'gy'); E.drawCard(s); } } : null),
  }] : undefined,
});
// 版図（マナゾーンの 色の 数）・収斂（はらった マナの 色の 数）
const dom = (s, E) => E.domain(s);
const conv = (s) => s.P.flags.converge || 0;
// 魔除け：1つ えらぶ。AI は いちばん 点の 高い モード
const charm = (modes) => ({
  modes: modes.map((m) => ({ label: m.label, tgt: m.tgt, apply: m.apply })),
  play: (s, E, ctx) => {
    const best = modes.map((m) => m.ai?.(s, E, ctx)).filter((v) => v && v.score > 0).sort((a, b) => b.score - a.score)[0];
    return best || null;
  },
});
const monoColor = (p) => [...(p.def.color || '')].length === 1;
const tuck = (s, E, t, top) => { if (!t || !E.onBf(s, t)) return; E.leave(s, t, top ? 'lib' : 'lib'); E.sba(s); };

export const S6 = {
  // ---- 旗 ----
  AB01: banner('WKG', true), JE01: banner('URW', true), SU01: banner('KGU', true), MA01: banner('RWK', true), TE01: banner('GUR', true),
  BA01: banner('GWU'), ES01: banner('WUK'), GX01: banner('UKR'), JU01: banner('KRG'), NA01: banner('RGW'),
  // ---- 3色の 伝説 ----
  AB02: {
    exileEnemyDead: true,
    onAttack: (s, p, E) => { const t = mine(s, E).filter((q) => q !== p && q.tapped).sort((a, b) => E.power(s, b) - E.power(s, a))[0]; if (t) E.addCounters(s, t, 1); },
  },
  JE02: {
    onAttack: (s, p, E) => {
      const top = s.P.lib.splice(0, 4);
      for (const c of top) {
        if (isCr(c.def)) { s.P.exile.push(c); continue; }
        if (isSpellDef(c.def)) {
          const r = c.def.play?.(s, E, { phase: 1, c, manaLeft: 0, free: true, xMax: 0 });
          if (r && !c.def.x) { E.castCard(s, c, null, { run: r.run, from: 'lib', free: true }); continue; }
          s.P.exile.push(c);
        } else E.enter(s, 'P', c.def, { card: c.def });
      }
    },
  },
  SU02: {
    etb: (s, p, E) => { if (p.side === 'P') naga(s, E); },
    onAttack: (s, p, E) => naga(s, E),
  },
  MA02: { mustAttack: true, kwFn: (s) => (s.active === 'P' ? ['indestructible'] : []), onKill: (s, p, E) => E.addCounters(s, p, 1) },
  TE02: { grant: (s, q, p, E) => (p !== q && E.isCreature(p) ? ['trample'] : null) },
  BA02: {
    onAttacks: (s, q, atk, E) => { if (q.side !== 'P' || atk.length !== 1) return; const a = atk[0].p; E.pump(a, 1, 1, ['double']); E.L(s, `さんび：${a.def.name}`); },
  },
  ES02: { etb: (s, p, E) => { if (p.side !== 'P') return; const c = bestIn(s.P.gy, (x) => (x.def.types || []).includes('artifact')); if (c) { s.P.gy.splice(s.P.gy.indexOf(c), 1); E.enter(s, 'P', c.def, { card: c.def }); } } },
  GX02: { unearthAll: true, endStep: (s, p, E) => { for (const q of [...s.P.bf]) if (q.unearthed) E.exile(s, q); } },
  JU02: { onOtherLeave: (s, p, q, E, o) => { if (p.side === 'P' && o.died && E.isCreature(q) && q !== p && (q.diedP || 0) > 0) E.addCounters(s, p, q.diedP); } },
  NA02: {
    acts: [{
      cost: 6, req: ['R', 'G', 'W'], tap: true, when: [1], label: '5まい 見て パワー5いじょうを 戦場（せんじょう）に',
      play: (s, p, E) => ({ score: 7, run: () => { const top = s.P.lib.splice(0, 5); const c = top.filter((x) => isCr(x.def) && (x.def.pow ?? 0) >= 5).sort((a, b) => b.def.cost - a.def.cost)[0]; s.P.lib.push(...top.filter((x) => x !== c)); if (c) E.enter(s, 'P', c.def, { card: c.def }); } }),
    }],
  },
  // ---- 3色の 魔除け ----
  AB03: charm([
    { label: 'パワー3いじょうの クリーチャー1体を 追放', tgt: [{ side: 'any', label: '追放する クリーチャー', filter: (s, E, p) => E.power(s, p) >= 3 }], ai: (s, E) => { const b = foeBest(s, E, 99, (p) => E.power(s, p) >= 3); return b && { score: 6 + b.score, run: () => exileIt(s, E, b.t) }; }, apply: (s, E, [[t]]) => exileIt(s, E, t) },
    { label: '2まい 引いて 2点 うしなう', ai: (s, E, ctx) => (ctx.phase === 2 && s.P.life > 8 ? { score: 5, run: () => { E.drawCard(s, 2); E.hurt(s, 2); } } : null), apply: (s, E) => { E.drawCard(s, 2); E.hurt(s, 2); } },
    { label: '＋1/＋1カウンター 2こを 1体か 2体に わりふる', tgt: [{ side: 'P', max: 2, divide: 2, label: '＋1/＋1カウンターを おく クリーチャー' }], ai: (s, E) => { const t = E.bestBuffTarget(s, null); return t && { score: 4, run: () => E.addCounters(s, t, 2) }; }, apply: (s, E, [al]) => { for (const d of al) { E.target(s, d.t); E.addCounters(s, d.t, d.n); } } },
  ]),
  JE03: charm([
    { label: 'クリーチャー1体を やまふだの 一番上に', tgt: [{ side: 'E', label: 'やまふだの 上に もどす クリーチャー' }], ai: (s, E) => { const b = foeBest(s, E); return b && { score: 4 + b.score, run: () => tuck(s, E, b.t, true) }; }, apply: (s, E, [[t]]) => tuck(s, E, t, true) },
    { label: 'てきに 4点', ai: (s, E) => ({ score: 5, run: () => E.hitEnemy(s, 4) }), apply: (s, E) => E.hitEnemy(s, 4) },
    { label: '自分の クリーチャーに ＋1/＋1 と 絆魂（はんこん）', ai: (s, E, ctx) => (ctx.phase === 1 && mine(s, E).length >= 3 ? { score: 2 * mine(s, E).length, run: () => { for (const q of mine(s, E)) E.pump(q, 1, 1, ['lifelink']); } } : null), apply: (s, E) => { for (const q of mine(s, E)) E.pump(q, 1, 1, ['lifelink']); } },
  ]),
  SU03: charm([
    { label: '1色の クリーチャー1体を はかい', tgt: [{ side: 'any', label: 'はかいする クリーチャー', filter: (s, E, p) => monoColor(p) }], ai: (s, E) => { const b = foeBest(s, E); return b && { score: 6 + b.score, run: () => killIt(s, E, b.t) }; }, apply: (s, E, [[t]]) => killIt(s, E, t) },
    { label: 'アーティファクトか エンチャント1つを はかい', tgt: [{ side: 'E', perm: true, label: 'はかいする パーマネント', filter: (s, E, p) => !E.isCreature(p) && !s.floor.cantLeave?.(s, p, E) }], ai: () => null, apply: (s, E, [[t]]) => killIt(s, E, t) },
    { label: '2まい 引いて 1まい すてる', ai: (s, E, ctx) => (ctx.phase === 2 ? { score: 4, run: () => { E.drawCard(s, 2); const c = lowestKeep(s, E); if (c) E.discard(s, [c]); } } : null), apply: (s, E) => { E.drawCard(s, 2); const c = lowestKeep(s, E); if (c) E.discard(s, [c]); } },
  ]),
  MA03: charm([
    { label: 'クリーチャー1体に 4点', tgt: [{ side: 'any', label: '4点を あたえる クリーチャー' }], ai: (s, E) => { const b = foeBest(s, E, 4); return b && { score: 6 + b.score, run: () => hit(s, E, b.t, 4) }; }, apply: (s, E, [[t]]) => hit(s, E, t, 4) },
    { label: 'せんせいこうげきを もつ 白の 1/1 の 戦士（せんし）を 2体', ai: (s, E) => ({ score: 5, run: () => E.token(s, 'P', T.warriorFS, 2) }), apply: (s, E) => E.token(s, 'P', T.warriorFS, 2) },
    { label: 'てきの やまふだの 上 3まいを 見て 1まいを 一番下に', ai: () => null, apply: (s) => { if (s.E.lib.length) s.E.lib.push(s.E.lib.shift()); } },
  ]),
  TE03: charm([
    { label: '自分の クリーチャーに ＋1/＋1カウンター、その あと 格闘（かくとう）', tgt: [{ side: 'P', label: '＋1/＋1カウンターを おく クリーチャー' }, { side: 'E', label: '格闘（かくとう）する 相手' }], ai: (s, E) => { const me = E.bestBuffTarget(s, null); const b = me && foeBest(s, E, E.power(s, me) + 1); return b && { score: 5 + b.score, run: () => { E.target(s, me); E.addCounters(s, me, 1); E.fight(s, me, b.t); } }; }, apply: (s, E, [[me], [t]]) => { E.target(s, me); E.addCounters(s, me, 1); E.fight(s, me, t); } },
    { label: 'この ターン、パワー3いかの クリーチャーは ブロックできない', ai: (s, E, ctx) => (ctx.phase === 1 && E.readyAttackers(s).length >= 2 ? { score: 3 + E.readyAttackers(s).length, run: () => { s.cantBlock3 = s.turn; } } : null), apply: (s) => { s.cantBlock3 = s.turn; } },
  ]),
  BA03: charm([
    { label: 'アーティファクト1つを はかい', tgt: [{ side: 'E', perm: true, label: 'はかいする アーティファクト', filter: (s, E, p) => (p.def.types || []).includes('artifact') && !s.floor.cantLeave?.(s, p, E) }], ai: () => null, apply: (s, E, [[t]]) => killIt(s, E, t) },
    { label: 'クリーチャー1体を やまふだの 一番下に', tgt: [{ side: 'E', label: 'やまふだの 下に おく クリーチャー' }], ai: (s, E) => { const b = foeBest(s, E); return b && { score: 6 + b.score, run: () => bottom(s, E, b.t) }; }, apply: (s, E, [[t]]) => bottom(s, E, t) },
  ]),
  ES03: charm([
    { label: 'エンチャント1つを はかい', tgt: [{ side: 'E', perm: true, label: 'はかいする エンチャント', filter: (s, E, p) => (p.def.types || []).includes('enchantment') && !s.floor.cantLeave?.(s, p, E) }], ai: () => null, apply: (s, E, [[t]]) => killIt(s, E, t) },
    { label: 'カードを 2まい 引く', ai: (s, E, ctx) => (ctx.phase === 2 ? { score: 6, run: () => E.drawCard(s, 2) } : null), apply: (s, E) => E.drawCard(s, 2) },
    { label: 'てきの やまふだの 上 2まいを ぼちへ', ai: () => null, apply: (s) => { s.E.gy.push(...s.E.lib.splice(0, 2)); } },
  ]),
  GX03: charm([
    { label: 'パーマネント1つを もどす（てきは やまふだの 上へ）', tgt: [{ side: 'E', perm: true, label: 'もどす パーマネント', filter: (s, E, p) => !s.floor.cantLeave?.(s, p, E) }], ai: (s, E) => { const b = foeBest(s, E); return b && { score: 4 + b.score, run: () => { if (E.onBf(s, b.t)) E.bounce(s, b.t); E.sba(s); } }; }, apply: (s, E, [[t]]) => { if (E.onBf(s, t)) E.bounce(s, t); E.sba(s); } },
    { label: 'クリーチャー1体を −4/−4', tgt: [{ side: 'any', label: '−4/−4 する クリーチャー' }], ai: (s, E) => { const b = foeBest(s, E, 4); return b && { score: 6 + b.score, run: () => shrink(s, E, b.t, 4) }; }, apply: (s, E, [[t]]) => shrink(s, E, t, 4) },
    { label: '自分の クリーチャーに ＋2/＋0', ai: (s, E, ctx) => (ctx.phase === 1 && E.readyAttackers(s).length >= 3 ? { score: 2 * E.readyAttackers(s).length, run: () => { for (const q of mine(s, E)) E.pump(q, 2, 0); } } : null), apply: (s, E) => { for (const q of mine(s, E)) E.pump(q, 2, 0); } },
  ]),
  JU03: charm([
    { label: 'てきの ぼちを ぜんぶ 追放', ai: () => null, apply: (s) => { s.E.exile.push(...s.E.gy.splice(0)); } },
    { label: 'クリーチャー すべてに 2点', ai: (s, E) => { const k = theirs(s, E).filter((p) => E.need(s, p) <= 2).length, l = mine(s, E).filter((p) => E.need(s, p) <= 2).length; return k - l >= 2 ? { score: 3 + 4 * (k - l), run: () => { for (const p of [...s.E.bf, ...s.P.bf]) if (E.isCreature(p)) E.damage(s, p, 2, null); E.sba(s); } } : null; }, apply: (s, E) => { for (const p of [...s.E.bf, ...s.P.bf]) if (E.isCreature(p)) E.damage(s, p, 2, null); E.sba(s); } },
    { label: 'クリーチャー1体に ＋1/＋1カウンター 2こ', tgt: [{ side: 'P', label: '＋1/＋1カウンターを おく クリーチャー' }], ai: (s, E) => { const t = E.bestBuffTarget(s, null); return t && { score: 4, run: () => { E.target(s, t); E.addCounters(s, t, 2); } }; }, apply: (s, E, [[t]]) => { E.target(s, t); E.addCounters(s, t, 2); } },
  ]),
  NA03: charm([
    { label: 'クリーチャー1体に 3点', tgt: [{ side: 'any', label: '3点を あたえる クリーチャー' }], ai: (s, E) => { const b = foeBest(s, E, 3); return b && { score: 6 + b.score, run: () => hit(s, E, b.t, 3) }; }, apply: (s, E, [[t]]) => hit(s, E, t, 3) },
    { label: 'ぼちの カード1まいを てふだに', ai: (s, E) => (s.P.gy.some((c) => !c.def.basic) ? { score: 4, run: () => regrow(s, E) } : null), apply: (s, E) => regrow(s, E) },
    { label: 'てきの クリーチャーを ぜんぶ タップ', ai: (s, E, ctx) => (ctx.phase === 1 && theirs(s, E).filter((p) => !p.tapped).length >= 2 ? { score: 3 + theirs(s, E).length, run: () => { for (const p of theirs(s, E)) p.tapped = true; } } : null), apply: (s, E) => { for (const p of theirs(s, E)) p.tapped = true; } },
  ]),
  // ---- 龍王 ----
  RG07: { etb: (s, p, E) => { if (p.side !== 'P') return; for (const d of E.divide(s, 5, theirs(s, E).filter((q) => !s.floor.untargetable?.(s, q, E)))) E.damage(s, d.t, d.n, p); E.sba(s); } },
  KR07: { grant: (s, q, p, E) => (p !== q && E.isCreature(p) ? ['haste'] : null) },
  WU07: { onCombatHit: (s, p, E) => { if (p.side !== 'P') return; const top = s.P.lib.splice(0, 3).sort((a, b) => E.keepValue(s, b) - E.keepValue(s, a)); if (top[0]) s.P.hand.push(top.shift()); s.P.lib.push(...top); } },
  UK07: {
    tgt: [{ side: 'E', label: 'あなたの ものに する てきの クリーチャー', filter: (s, E, p) => E.stealable(s, p) }],
    etb: (s, p, E, o) => {
      if (p.side !== 'P') return;
      let t = chosen1(o);
      if (t === undefined) t = s.E.bf.filter((q) => E.stealable(s, q)).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
      if (t && E.onBf(s, t) && t.side === 'E') E.steal(s, t, p);
    },
    onLeaveSelf: (s, p, E) => E.unsteal(s, p),
  },
  // ---- 版図・収斂 ----
  W69: {
    play: (s, E, ctx) => { const t = E.bestBuffTarget(s, null, { ready: true }); return t && ctx.phase === 1 ? { score: 2 + dom(s, E), run: () => { E.target(s, t); E.pump(t, dom(s, E), dom(s, E)); } } : null; },
    tgt: [{ side: 'P', label: '＋X/＋X する クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.pump(t, dom(s, E), dom(s, E)); },
  },
  W70: { play: (s, E) => ({ score: 4 + 3 * dom(s, E), run: () => { E.token(s, 'P', T.soldier, conv(s)); E.gain(s, 2 * conv(s)); } }) },
  U70: { play: (s, E, ctx) => (ctx.phase === 2 ? { score: 3 * dom(s, E), run: () => E.drawCard(s, dom(s, E)) } : null) },
  U71: { play: (s, E, ctx) => (ctx.phase === 2 && dom(s, E) >= 3 ? { score: 2 * dom(s, E), run: () => { E.drawCard(s, conv(s)); E.discard(s, [...s.P.hand].sort((a, b) => E.keepValue(s, a) - E.keepValue(s, b)).slice(0, 2)); } } : null) },
  K67: { play: (s, E) => ({ score: 2 + 2 * dom(s, E), run: () => drain(s, E, dom(s, E)) }) },
  K68: { play: (s, E, ctx) => (ctx.phase === 2 && s.P.life > 8 ? { score: 2 * dom(s, E), run: () => { E.drawCard(s, conv(s)); E.hurt(s, conv(s)); } } : null) },
  R69: {
    play: (s, E) => { const b = E.burnTarget(s, dom(s, E)); return b ? { score: 4 + b.score, run: () => hit(s, E, b.t, dom(s, E)) } : null; },
    tgt: [{ side: 'E', face: true, label: 'X点を あたえる 相手' }], apply: (s, E, [[t]]) => hit(s, E, t, dom(s, E)),
  },
  R70: {
    play: (s, E) => { const x = dom(s, E); const k = theirs(s, E).filter((p) => E.need(s, p) <= x).length, l = mine(s, E).filter((p) => E.need(s, p) <= x).length; return k - l >= 2 ? { score: 3 + 4 * (k - l), run: () => { for (const p of [...s.E.bf, ...s.P.bf]) if (E.isCreature(p)) E.damage(s, p, conv(s), null); E.sba(s); } } : null; },
  },
  G70: {
    play: (s, E, ctx) => { const t = E.bestBuffTarget(s, null, { ready: true }); return t && ctx.phase === 1 ? { score: 2 + dom(s, E), run: () => { E.target(s, t); E.pump(t, dom(s, E), dom(s, E)); } } : null; },
    tgt: [{ side: 'P', label: '＋X/＋X する クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.pump(t, dom(s, E), dom(s, E)); },
  },
  G71: { etb: (s, p, E) => { if (p.side === 'P') E.addCounters(s, p, conv(s)); } },
};

function naga(s, E) {
  const m = E.mill(s, 3);
  if (m.some((c) => isCr(c.def))) E.token(s, 'P', T.zombie);
}
function bottom(s, E, t) {
  if (!t || !E.onBf(s, t)) return;
  const side = t.side, tok = t.token;
  if (E.leave(s, t, 'lib') && !tok) { const lib = s[side].lib; const c = lib.shift(); if (c) lib.push(c); }
  E.sba(s);
}
