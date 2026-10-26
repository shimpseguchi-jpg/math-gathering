// 第6弾「三つの 旗」のうごき（名前・コスト・P/T は skel.js、文は docs/SET6.md）
import { T, cr, hit, mine, theirs, bestIn, lowestKeep, isCr, chosen1, regrow, foeBest, shrink, killIt, exileIt, isSpellDef, edict, delve, ferocious, isSub } from './kit.js';

// 旗：これが デッキに あれば その 3色の デッキに できる（4点）。タップで 3色の どれかの マナ
const banner = (cols, draw = false) => ({
  banner: cols, pts: 4, mana: [...cols],
  acts: draw ? [{
    cost: 3, req: [...cols], req3: true, tap: true, sac: true, when: [2], label: '3色の マナで、ぼちに おいて 1まい 引く',
    play: (s, p, E) => (s.P.mana.length >= 7 ? { score: 2, run: () => { E.leave(s, p, 'gy'); E.drawCard(s); } } : null),
  }] : undefined,
});
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
  // ---- 3色の 伝説 ----
  AB02: {
    exileEnemyDead: true,
    onAttack: (s, p, E) => { const t = mine(s, E).filter((q) => q !== p && q.tapped).sort((a, b) => E.power(s, b) - E.power(s, a))[0]; if (t) E.addCounters(s, t, 1); },
  },
  JE02: {
    onAttack: (s, p, E) => {
      // 上から 4まいを 見て、クリーチャーでない 呪文は タダで 唱える（墓地へ）。のこりは 一番下（2026-10-26：追放だと すぐ デッキが なくなる）
      const top = s.P.lib.splice(0, 4), rest = [];
      for (const c of top) {
        if (isCr(c.def)) { rest.push(c); continue; }
        if (isSpellDef(c.def)) {
          const r = c.def.play?.(s, E, { phase: 1, c, manaLeft: 0, free: true, xMax: 0 });
          if (r && !c.def.x) { E.castCard(s, c, null, { run: r.run, from: 'lib', free: true }); continue; }
          rest.push(c);
        } else E.enter(s, 'P', c.def, { card: c.def });
      }
      s.P.lib.push(...rest);
    },
  },
  SU02: {
    etb: (s, p, E) => { if (p.side === 'P') naga(s, E); },
    onAttack: (s, p, E) => naga(s, E),
  },
  MA02: { mustAttack: true, kwFn: (s) => (s.active === 'P' ? ['indestructible'] : []), onKill: (s, p, E) => E.addCounters(s, p, 1) },
  TE02: { grant: (s, q, p, E) => (p !== q && E.isCreature(p) ? ['trample'] : null) },
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
  // ---- 長の なかま（版図・収斂と 入れかえ。2026-10-26） ----
  W76: { acts: [outlast(1)], grant: (s, q, p, E) => (p.side === q.side && E.isCreature(p) && p.ctr > 0 ? ['lifelink'] : null) },
  W77: {
    play: (s, E, ctx) => { const t = ctx.phase === 1 && E.bestBuffTarget(s, null, { ready: true }); return t ? { score: 4, run: () => feat(s, E, t) } : null; },
    tgt: [{ side: 'P', label: '＋1/＋1カウンターを おく クリーチャー' }], apply: (s, E, [[t]]) => feat(s, E, t),
  },
  W78: { onCast: (s, p, d, E) => { if (p.side === 'P' && !isCr(d)) E.pump(p, 0, 0, ['lifelink']); } },
  U75: { onCombatHit: (s, p, E) => { if (p.side !== 'P') return; E.drawCard(s); E.discard(s, E.discardPick(s, 1)); } },
  K71: { play: (s, E, ctx) => (s.P.life > 6 && ctx.phase === 2 ? { score: 5, run: () => revelation(s, E) } : null) },
  K72: { play: (s, E) => (s.P.gy.some((c) => isCr(c.def)) ? { score: 3 + 3 * Math.min(2, s.P.gy.filter((c) => isCr(c.def)).length), run: () => { regrow(s, E, isCr); regrow(s, E, isCr); } } : null) },
  W79: { play: (s, E, ctx) => (ctx.phase === 1 && mine(s, E).filter((q) => !q.tapped && !q.sick).length >= 2 ? { score: 3 + 2 * mine(s, E).length, run: () => { for (const q of mine(s, E)) E.pump(q, 2, 1, isSub(q, 'warrior') ? ['lifelink'] : []); } } : null) },
  WK09: { anthem: (s, q, p, E) => (p !== q && p.side === q.side && E.isCreature(p) && isSub(p, 'warrior') ? [1, 0] : null) },
  WK10: { anthem: (s, q, p, E) => (p !== q && p.side === q.side && E.isCreature(p) && isSub(p, 'warrior') ? [0, 1] : null) },

  // ---- 龍王の 一族 ----
  RG08: { onAttack: (s, p, E) => { if (p.side !== 'P') return; for (const q of theirs(s, E)) if (!E.hasKw(s, q, 'flying')) E.damage(s, q, 1, p); E.sba(s); } },
  WG08: { etb: (s, p, E) => { if (p.side === 'P') E.bolster(s, 2); } },
  KR08: { onOtherEnter: (s, q, p, E) => { if (q.side !== 'P' || p.side !== 'P' || !E.isCreature(p)) return; const t = E.bestBuffTarget(s, null, { ready: true }) || q; E.pump(t, 2, 0); } },
  WU08: { onCast: (s, p, d, E) => { if (p.side === 'P' && !isCr(d) && p.tapped) { p.tapped = false; E.L(s, `${p.def.name} が アンタップ`); } } },
  UK08: { onCombatHit: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', T.zombie); } },
  R71: {
    play: (s, E) => { const b = foeBest(s, E, 3) || foeBest(s, E); return b ? { score: 5 + b.score + (dragonNear(s) ? 3 : 0), run: () => roar(s, E, b.t) } : null; },
    tgt: [{ side: 'E', label: '3点を あたえる クリーチャー' }], apply: (s, E, [[t]]) => roar(s, E, t),
  },
  G72: { etb: (s, p, E) => { if (p.side === 'P' && dragonNear(s)) { E.L(s, 'りゅうえいしょう'); E.addCounters(s, p, 1); } } },
  W71: { etb: (s, p, E) => { if (p.side === 'P' && dragonNear(s)) { E.L(s, 'りゅうえいしょう：1まい 引く'); E.drawCard(s); } } },
  K69: { play: (s, E) => (theirs(s, E).length ? { score: 6 + (dragonNear(s) ? 2 : 0), run: () => { edict(s, E); if (dragonNear(s)) { E.L(s, 'りゅうえいしょう：ライフ ＋4'); E.gain(s, 4); } } } : null) },
  R72: { costCut: (s, q, d) => ((d.sub || []).includes('dragon') ? 1 : 0) },

  // ---- 氏族の 戦士 ----
  W72: { acts: [outlast(2)], grant: (s, q, p, E) => (p.side === q.side && E.isCreature(p) && p.ctr > 0 ? ['first'] : null) },
  W73: { acts: [outlast(1)], grant: (s, q, p, E) => (p.side === q.side && E.isCreature(p) && p.ctr > 0 ? ['flying'] : null) },
  U72: { onDie: (s, p, E) => { if (p.side === 'P') E.drawCard(s); } },
  U73: { ...delve(), play: (s, E, ctx) => (ctx.phase === 2 || s.P.hand.length <= 2 ? { score: 9, run: () => E.drawCard(s, 3) } : null) },
  K70: {
    ...delve(),
    play: (s, E) => { const b = foeBest(s, E); return b ? { score: 6 + b.score, run: () => killIt(s, E, b.t) } : null; },
    tgt: [{ side: 'E', label: 'はかいする クリーチャー' }], apply: (s, E, [[t]]) => killIt(s, E, t),
  },
  R73: {
    tgt: [{ side: 'E', face: true, min: 0, label: 'きょうしゅう：2点を あたえる 相手' }],
    etb: (s, p, E, o) => { if (p.side !== 'P' || !s.P.flags.attacked) return; let t = chosen1(o); if (t === undefined) t = E.burnTarget(s, 2, { mustHit: true })?.t; if (t) { E.L(s, 'きょうしゅう：2点'); hit(s, E, t, 2); } },
  },
  W75: { etb: (s, p, E) => { if (p.side === 'P' && s.P.flags.attacked) { E.L(s, 'きょうしゅう：せんし'); E.token(s, 'P', TK.warrior); } } },
  G73: { onAttack: (s, p, E) => { if (p.side === 'P' && ferocious(s, E)) E.pump(p, 1, 1); } },
  U74: {
    play: (s, E, ctx) => {
      if (ctx.phase !== 1) return null;
      const ts = theirs(s, E).filter((q) => !q.tapped).sort((a, b) => E.power(s, b) - E.power(s, a)).slice(0, ctx.xMax);
      return ts.length >= 2 ? { score: 2 + 3 * ts.length, x: ts.length, run: (x) => blast(s, E, ts.slice(0, x)) } : null;
    },
    tgt: [{ side: 'E', max: 9, label: 'タップする クリーチャー（X体まで）' }], apply: (s, E, [ts], x) => blast(s, E, (ts || []).slice(0, x)),
  },
};

const feat = (s, E, t) => { if (!t || !E.onBf(s, t)) return; E.target(s, t); E.addCounters(s, t, 1); E.pump(t, 0, 0, ['indestructible']); };
// 苦い 天啓：上から 4まい 見て 1まいを 手札、のこりは 墓地。ライフ −2
function revelation(s, E) {
  const top = s.P.lib.splice(0, 4);
  const pick = [...top].sort((a, b) => E.keepValue(s, b) - E.keepValue(s, a))[0];
  if (pick) s.P.hand.push(pick);
  s.P.gy.push(...top.filter((c) => c !== pick));
  E.L(s, `4まい 見て 1まいを てふだ、${top.length - (pick ? 1 : 0)}まいを ぼちへ`);
  E.hurt(s, 2);
}
// 龍詠唱：あなたの 手札か 戦場に ドラゴン
const dragonNear = (s) => s.P.bf.some((q) => isSub(q, 'dragon')) || s.P.hand.some((c) => (c.def.sub || []).includes('dragon'));
const roar = (s, E, t) => { if (t) hit(s, E, t, 3); if (dragonNear(s)) { E.L(s, 'りゅうえいしょう：てきに 3点'); E.hitEnemy(s, 3, null); } };
// 増強 n：n マナ（白）・タップで ＋1/＋1カウンター。戦闘の あと だけ
function outlast(n) {
  return { cost: n, req: ['W'], tap: true, when: [2], label: `増強（ぞうきょう）：＋1/＋1カウンター（${n}マナ）`, play: (s, p, E) => ({ score: 2, run: () => E.addCounters(s, p, 1) }) };
}
const TK = { warrior: cr('t_warriorW', '戦士（せんし）', null, 'W', 0, 1, 1, ['warrior']) };
function blast(s, E, ts) {
  const fz = ferocious(s, E);
  for (const t of ts) { if (!E.onBf(s, t)) continue; t.tapped = true; if (fz) t.frozen = true; }
  E.L(s, `こごえる とっぷう：${ts.length}体を タップ${fz ? '（どうもう：つぎも アンタップしない）' : ''}`);
}

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
