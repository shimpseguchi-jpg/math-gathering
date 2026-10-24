// 第5弾「大きな 数の 塔」のうごき（名前・コスト・P/T は skel.js、文は docs/SET5.md）
import {
  T, hit, mine, theirs, isSub, bestIn, lowestKeep, isCr, chosen1, regrow, dig, foeBest, shrink, foe1, bolt, killIt, exileIt, edict, fodder,
  aura, food, gyCount, isSpellDef, magecraft, fractal, learn, guard, powerSum, command, bestFreeze,
} from './kit.js';

const drain = (s, E, n, src = null) => { E.hitEnemy(s, n, src); E.gain(s, n); };
const tapFreeze = (s, E, t) => { if (t && E.onBf(s, t)) { t.tapped = true; t.frozen = true; } };
const spellsInGy = (s) => s.P.gy.filter((c) => isSpellDef(c.def)).length;
const bigPow = (s, E, side = 'P') => Math.max(0, ...E.creatures(s, side).map((q) => E.power(s, q)));
// タイタン：出たときと 攻撃するたび
const titan = (f) => ({ etb: (s, p, E) => { if (p.side === 'P') f(s, p, E); }, onAttack: (s, p, E) => f(s, p, E) });
const fb = (cost, req) => ({ flashback: { cost, req } });
const upTo = (n) => (s, E, ctx) => (ctx.from === 'gy' ? 2 * n : n);
const crCount = (s, E) => mine(s, E).length;
// 敵の パーマネントで いちばん ねらいたい もの（クリーチャー、なければ ほかの もの）
const foePerm = (s, E) => foeBest(s, E)?.t || s.E.bf.find((p) => !p.def.factory && !s.floor.cantLeave?.(s, p, E) && !s.floor.untargetable?.(s, p, E));
const exilePerm = { tgt: [{ side: 'E', perm: true, label: '追放する てきの パーマネント', filter: (s, E, p) => !s.floor.cantLeave?.(s, p, E) }] };

export const S5 = {
  // ---- 白 ----
  W57: {
    etb: (s, p, E) => E.addCounters(s, p, 1),
    onDie: (s, p, E) => { const t = E.bestBuffTarget(s, p); if (t && p.ctr > 0) E.addCounters(s, t, p.ctr); },
  },
  W58: {
    pow: (s, p, E) => 2 + (powerSum(s, E, p.side, p) + 2 >= 10 ? 2 : 0), tou: (s, p, E) => 3 + (powerSum(s, E, p.side, p) + 2 >= 10 ? 2 : 0),
    kwFn: (s, p, E) => (powerSum(s, E, p.side, p) + 2 >= 10 ? ['vigilance'] : []),
  },
  W59: magecraft((s, p, E) => E.pump(p, 2, 2)),
  W60: magecraft((s, p, E) => { const t = E.bestBuffTarget(s, null, { ready: true }); if (t) E.pump(t, 1, 0); }),
  W61: foe1('追放する タップしている クリーチャー', exileIt, { filter: (s, E, p) => p.tapped }),
  W62: {
    tgt: [{ side: 'P', min: 0, label: '＋1/＋1カウンターを おく クリーチャー（えらばなければ これに）' }],
    etb: (s, p, E, o) => { const t = chosen1(o) || E.bestBuffTarget(s, null) || p; E.target(s, t); E.addCounters(s, t, 1); },
    acts: [{ cost: 5, req: ['W'], when: [1, 2], label: 'カウンターの ある クリーチャー みんなに ＋1/＋1カウンター', play: (s, p, E) => { const n = mine(s, E).filter((q) => q.ctr > 0).length; return n >= 2 ? { score: 2 + 2 * n, run: () => { for (const q of mine(s, E)) if (q.ctr > 0) E.addCounters(s, q, 1); } } : null; } }],
  },
  W63: { play: (s, E) => { const d = theirs(s, E).length - mine(s, E).length; return d > 0 ? { score: 3 + 3 * d, run: () => E.token(s, 'P', T.soldier, Math.max(0, theirs(s, E).length - mine(s, E).length)) } : null; } },
  W64: { etb: (s, p, E) => { if (p.side === 'P') learn(s, E); } },
  W65: { tokenMult: 2 },
  W66: titan((s, p, E) => { const c = bestIn(s.P.gy, (x) => !isSpellDef(x.def) && x.def.cost <= 3); if (c) { s.P.gy.splice(s.P.gy.indexOf(c), 1); E.enter(s, 'P', c.def, { card: c.def }); } }),
  W67: { play: (s, E, ctx) => ({ score: 10, run: () => E.token(s, 'P', T.human, upTo(5)(s, E, ctx)) }), ...fb(9, ['W']) },
  W68: {
    play: (s, E, ctx) => ({ score: 8 + 3 * ctx.xMax, x: ctx.xMax, run: () => {} }),
    acts: [
      { cost: 0, tap: true, when: [2], label: 'これに ＋1/＋1カウンター', play: (s, p, E) => (mine(s, E).length <= 1 ? { score: 2, run: () => E.addCounters(s, p, 1) } : null) },
      { cost: 0, tap: true, when: [1], label: 'カウンターを 1こ とって、ほかの みんなに ＋1/＋1カウンター', play: (s, p, E) => { const n = mine(s, E).length - 1; return p.ctr > 1 && n >= 2 ? { score: 2 + 2 * n, run: () => { p.ctr--; for (const q of mine(s, E)) if (q !== p) E.addCounters(s, q, 1); } } : null; } },
    ],
  },
  // ---- 青 ----
  U58: { play: (s, E, ctx) => (ctx.phase === 2 ? { score: 6, run: () => { E.drawCard(s); learn(s, E); } } : null) },
  U59: {
    tgt: [{ side: 'E', label: 'タップして つぎの ターン 起きない クリーチャー' }],
    etb: (s, p, E, o) => { if (p.side !== 'P') return; let t = chosen1(o); if (t === undefined) t = bestFreeze(s, E) || foeBest(s, E)?.t; tapFreeze(s, E, t); },
  },
  U60: { play: (s, E) => { const x = spellsInGy(s); return x >= 2 ? { score: 3 + 2 * x, run: () => fractal(s, E, spellsInGy(s)) } : null; } },
  U61: foe1('パワーと タフネスを 半分に する クリーチャー', (s, E, t) => { if (!E.onBf(s, t)) return; const [a, b] = E.pt(s, t); E.pump(t, -(a - Math.floor(a / 2)), -(b - Math.floor(b / 2))); E.sba(s); }, { n: 0, score: 2 }),
  U63: magecraft((s, p, E) => E.drawCard(s)),
  U64: { etb: (s, p, E) => { if (p.side === 'P') learn(s, E); } },
  U65: { etb: (s, p, E) => { if (p.side === 'P') regrow(s, E, isSpellDef); } },
  U66: { copyAll: true },
  U67: titan((s, p, E) => tapFreeze(s, E, bestFreeze(s, E) || foeBest(s, E)?.t)),
  U68: { play: (s, E, ctx) => (ctx.phase === 2 ? { score: 3 * ctx.xMax, x: ctx.xMax, run: (x) => E.drawCard(s, ctx.from === 'gy' ? 2 * x : x) } : null), ...fb(2, ['U']) },
  U69: {
    costCut: (s, q, d) => (isSub({ def: d }, 'sphinx') ? 2 : 0),
    etb: (s, p, E) => sphinx(s, p, E),
    onOtherEnter: (s, p, q, E) => { if (q.side === 'P' && p.side === 'P' && isSub(q, 'sphinx')) sphinx(s, p, E); },
  },
  // ---- 黒 ----
  K55: { onDie: (s, p, E) => { if (p.side === 'P') learn(s, E); } },
  K56: { play: (s, E) => ({ score: 6, run: () => { E.token(s, 'P', T.pest); learn(s, E); } }) },
  K57: { onAttack: (s, p, E) => { if (s.P.life > 10 && !E.hasKw(s, p, 'flying')) { E.hurt(s, 2); E.pump(p, 0, 0, ['flying']); } } },
  K58: { onAnyCast: (s, p, d, side, E) => { if (side === 'E' && p.side === 'P' && isSpellDef(d)) E.hitEnemy(s, 1, p); } },
  K59: aura('E', '−2/−2 する てきの クリーチャー', { p: -2, t: -2 }),
  K60: { onOtherLeave: (s, p, q, E, o) => { if (p.side === 'P' && o.died && E.isCreature(q)) drain(s, E, 1, p); } },
  K61: foe1('はかいする クリーチャー（タフネスが ぼちの まいすう いか）', killIt, { filter: (s, E, p) => E.pt(s, p)[1] <= s.P.gy.length }),
  K62: {
    play: (s, E, ctx) => {
      if (ctx.phase !== 2) return null;
      const fs = fodder(s, E).filter((q) => q.token).slice(0, 3);
      return { score: 3 + 3 * fs.length, run: () => { for (const f of fs) E.leave(s, f, 'gy', { died: true }); for (let i = 0; i <= fs.length; i++) { E.drawCard(s); E.hurt(s, 1); } } };
    },
  },
  K63: { endStep: (s, p, E) => { if (p.side === 'P') E.hitEnemy(s, E.dmgThisTurn(s), p); } },
  K64: titan((s, p, E) => E.token(s, 'P', T.zombie, 2)),
  K65: {
    play: (s, E, ctx) => ({ score: 7, run: () => { for (let i = 0; i < upTo(1)(s, E, ctx); i++) tutor(s, E); } }),
    ...fb(8, ['K']),
  },
  K66: {
    onLifeLoss: (s, p, E, n) => { if (p.side === 'P') E.drawCard(s, n); },
    acts: [{
      cost: 1, req: ['K'], when: [1, 2], label: '2点 うしなって −1/−1',
      play: (s, p, E) => { const b = foeBest(s, E, 1); return b && s.P.life > 8 ? { score: 3 + b.score, run: () => { E.hurt(s, 2); shrink(s, E, b.t, 1); } } : null; },
      tgt: [{ side: 'any', label: '−1/−1 する クリーチャー' }], apply: (s, E, [[t]]) => { E.hurt(s, 2); shrink(s, E, t, 1); },
    }],
  },
  // ---- 赤 ----
  R57: foe1('4点を あたえる クリーチャー', (s, E, t) => hit(s, E, t, 4), { n: 4 }),
  R58: bolt(3, (s, E) => learn(s, E)),
  R59: magecraft((s, p, E) => E.addCounters(s, p, 1)),
  R60: {
    play: (s, E) => { const n = 2 * (s.P.flags.cast + 1); const b = E.burnTarget(s, n); return b ? { score: 4 + b.score, run: () => hit(s, E, b.t, 2 * s.P.flags.cast) } : null; },
    tgt: [{ side: 'E', face: true, label: 'ダメージを あたえる 相手' }], apply: (s, E, [[t]]) => hit(s, E, t, 2 * s.P.flags.cast),
  },
  R61: {
    acts: [{ cost: 2, tap: true, when: [2], label: 'ぼちの じゅもんを 追放：＋1/＋1カウンター', can: (s) => spellsInGy(s) > 0, play: (s, p, E) => (spellsInGy(s) ? { score: 2, run: () => { const c = s.P.gy.find((x) => isSpellDef(x.def)); s.P.gy.splice(s.P.gy.indexOf(c), 1); s.P.exile.push(c); E.addCounters(s, p, 1); } } : null) }],
  },
  R62: {
    ...magecraft((s, p) => { p.tapped = false; }),
    acts: [{ cost: 0, tap: true, when: [1, 2], label: 'てきに 1点', play: (s, p, E) => ({ score: 3, run: () => E.hitEnemy(s, 1, p) }) }],
  },
  R63: { etb: (s, p, E) => { if (p.side === 'P') learn(s, E); } },
  R64: {
    play: (s, E) => { const ts = theirs(s, E); return ts.length >= 2 ? { score: 3 + 3 * ts.length, run: () => { theirs(s, E).sort((a, b) => E.power(s, a) - E.power(s, b)).forEach((t, i) => E.damage(s, t, i + 1, null)); E.sba(s); } } : null; },
  },
  R65: { dmgMult: 3 },
  R66: {
    play: (s, E, ctx) => {
      const x = ctx.xMax; if (x < 1) return null;
      return { score: 6 + 4 * x, x, run: (xx) => { for (let i = 0; i < xx; i++) E.hitEnemy(s, 5 * xx, null); } };
    },
  },
  R67: {
    play: (s, E, ctx) => {
      const l = s.P.flags.lastSpell;
      if (!l || l.turn !== s.turn || l.def.id === 'R67') return null;
      return { score: 6, run: () => { const n = ctx.from === 'gy' ? 2 : 1; let r; for (let i = 0; i < n; i++) r = E.then(r, () => E.copySpell(s, l.def, () => l.run(l.x))); return r; } };
    },
    ...fb(5, ['R']),
  },
  R68: { redPlus: 2 },
  // ---- 緑 ----
  G58: { play: (s, E) => ({ score: 4 + 2 * s.P.mana.length, run: () => fractal(s, E, s.P.mana.length) }) },
  G59: { etb: (s, p, E) => { if (p.side === 'P') { E.gain(s, 4); E.drawCard(s); } } },
  G61: {
    play: (s, E) => { const t = mine(s, E).filter((q) => q.ctr > 0).sort((a, b) => b.ctr - a.ctr)[0]; return t && t.ctr >= 2 ? { score: 3 + 2 * t.ctr, run: () => { E.target(s, t); E.addCounters(s, t, t.ctr); } } : null; },
    tgt: [{ side: 'P', label: '＋1/＋1カウンターを 2ばいに する クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.addCounters(s, t, t.ctr); },
  },
  G62: { onDie: (s, p, E) => { if (p.side === 'P') learn(s, E); } },
  G63: { etb: (s, p, E) => { if (p.side === 'P') learn(s, E); } },
  G64: {
    ...aura('P', '＋2/＋0 と トランプルを あたえる 自分の クリーチャー', { p: 2, kw: ['trample'] }),
    onLeaveSelf: (s, p, E) => { const i = s.P.gy.findIndex((c) => c.uid === p.uid); if (i >= 0) s.P.hand.push(...s.P.gy.splice(i, 1)); },
  },
  G65: { upkeep: (s, p, E) => { if (p.side !== 'P') return; const t = E.bestBuffTarget(s, null); if (t) E.addCounters(s, t, crCount(s, E)); } },
  G66: { tokenMult: 2, counterMult: 2 },
  G67: titan((s, p, E) => { E.rampTop(s); E.rampTop(s); }),
  G68: {
    play: (s, E, ctx) => { const t = E.bestBuffTarget(s, null); return t ? { score: 10, run: () => { E.target(s, t); E.addCounters(s, t, upTo(5)(s, E, ctx)); } } : null; },
    ...fb(7, ['G']),
  },
  G69: {
    onOtherEnter: (s, p, q, E) => { if (q.side === 'P' && p.side === 'P' && E.isCreature(q) && mine(s, E).every((r) => r === q || E.power(s, r) < E.power(s, q))) E.drawCard(s); },
    mana: ['G'], manaN: (p, s) => (s ? Math.max(1, ...s[p.side].bf.filter((q) => (q.def.types || []).includes('creature')).map((q) => (q.def.pow ?? 0) + q.ctr)) : 1),
  },
  // ---- 長老ドラゴン ----
  WK06: {
    combatStart: (s, p, E) => { E.token(s, 'P', T.inkling); for (const q of mine(s, E)) E.addCounters(s, q, 1); },
  },
  UR06: { etb: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', T.treasure); }, artifactMana: true },
  KG06: {
    upkeep: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', T.pest); },
    acts: [{ cost: 0, when: [1, 2], label: '10点 うしなって マナゾーンを アンタップ', can: (s, p) => s.P.life > 10 && !p.flags.turn.used, play: (s, p) => (s.P.life >= 25 && !p.flags.turn.used && s.P.mana.every((m) => m.tapped) ? { score: 2, run: () => { p.flags.turn.used = true; s.P.life -= 10; for (const m of s.P.mana) m.tapped = false; } } : null) }],
  },
  RW06: {
    onAttack: (s, p, E) => {
      const top = s.P.lib.splice(0, 7);
      const c = top.filter((x) => isSpellDef(x.def) && x.def.cost <= E.power(s, p) && x.def.play && !x.def.counter && !x.def.x).sort((a, b) => b.def.cost - a.def.cost)[0];
      s.P.lib.push(...top.filter((x) => x !== c));
      if (!c) return;
      const r = c.def.play(s, E, { phase: 1, c, manaLeft: 0, free: true });
      if (r) E.castCard(s, c, null, { run: r.run, from: 'lib', free: true }); else s.P.lib.push(c);
    },
  },
  GU06: {
    etb: (s, p, E) => { if (p.side !== 'P') return; const t = mine(s, E).filter((q) => q.ctr > 0).sort((a, b) => b.ctr - a.ctr)[0]; if (t) E.addCounters(s, t, t.ctr); },
    onAttack: (s, p, E) => { for (const q of mine(s, E)) if (q !== p && (q.def.pow ?? 0) < 4) q.setPT = [4, 4]; },
  },
  // ---- 命令（2つ えらぶ） ----
  WK07: command([
    { label: 'ぼちの コスト2いかの クリーチャーを 戦場（せんじょう）に', ai: (s, E) => { const c = bestIn(s.P.gy, (x) => isCr(x.def) && x.def.cost <= 2); return c && { score: 5, run: () => reanimate(s, E, (d) => isCr(d) && d.cost <= 2) }; }, apply: (s, E) => reanimate(s, E, (d) => isCr(d) && d.cost <= 2) },
    { label: 'クリーチャー1体を −3/−3', tgt: [{ side: 'any', label: '−3/−3 する クリーチャー' }], ai: (s, E) => { const b = foeBest(s, E, 3); return b && { score: 5 + b.score, run: () => shrink(s, E, b.t, 3) }; }, apply: (s, E, [[t]]) => shrink(s, E, t, 3) },
    { label: '自分の クリーチャー みんなに ＋1/＋1カウンター', ai: (s, E) => mine(s, E).length && { score: 2 * mine(s, E).length, run: () => { for (const q of mine(s, E)) E.addCounters(s, q, 1); } }, apply: (s, E) => { for (const q of mine(s, E)) E.addCounters(s, q, 1); } },
    { label: 'カードを 1まい 引く', ai: (s, E) => ({ score: 3, run: () => E.drawCard(s) }), apply: (s, E) => E.drawCard(s) },
  ]),
  UR07: command([
    { label: 'クリーチャー1体か てきに 2点', tgt: [{ side: 'E', face: true, label: '2点を あたえる 相手' }], ai: (s, E) => { const b = E.burnTarget(s, 2); return b && { score: 4 + b.score, run: () => hit(s, E, b.t, 2) }; }, apply: (s, E, [[t]]) => hit(s, E, t, 2) },
    { label: '2まい 引いて 2まい すてる', ai: (s, E) => ({ score: 2, run: () => { E.drawCard(s, 2); E.discard(s, [...s.P.hand].sort((a, b) => E.keepValue(s, a) - E.keepValue(s, b)).slice(0, 2)); } }), apply: (s, E) => { E.drawCard(s, 2); E.discard(s, [...s.P.hand].sort((a, b) => E.keepValue(s, a) - E.keepValue(s, b)).slice(0, 2)); } },
    { label: '宝物（たからもの）を 1つ 出す', ai: (s, E) => ({ score: 3, run: () => E.token(s, 'P', T.treasure) }), apply: (s, E) => E.token(s, 'P', T.treasure) },
    { label: 'てきの アーティファクト1つを はかい', ai: () => null, apply: () => {} },
  ]),
  KG07: command([
    { label: '3まい ぼちへ、1まい てふだへ', ai: (s, E) => ({ score: 3, run: () => { E.mill(s, 3); regrow(s, E); } }), apply: (s, E) => { E.mill(s, 3); regrow(s, E); } },
    { label: 'クリーチャー1体を −3/−1', tgt: [{ side: 'any', label: '−3/−1 する クリーチャー' }], ai: (s, E) => { const b = foeBest(s, E, 1); return b && { score: 4 + b.score, run: () => shrink(s, E, b.t, 3, 1) }; }, apply: (s, E, [[t]]) => shrink(s, E, t, 3, 1) },
    { label: 'てきの コスト2いかの エンチャントを はかい', ai: () => null, apply: () => {} },
    { label: 'てきに 2点、2点 かいふく', ai: (s, E) => ({ score: 4, run: () => drain(s, E, 2) }), apply: (s, E) => drain(s, E, 2) },
  ]),
  RW07: command([
    { label: '赤白の 3/2 の スピリットを 出す', ai: (s, E) => ({ score: 5, run: () => E.token(s, 'P', T.spiritRW) }), apply: (s, E) => E.token(s, 'P', T.spiritRW) },
    { label: '自分の クリーチャーに ＋1/＋0・はかいふのう・そっこう', ai: (s, E, ctx) => (ctx.phase === 1 && mine(s, E).length >= 2 ? { score: 2 * mine(s, E).length, run: () => { for (const q of mine(s, E)) E.pump(q, 1, 0, ['indestructible', 'haste']); } } : null), apply: (s, E) => { for (const q of mine(s, E)) E.pump(q, 1, 0, ['indestructible', 'haste']); } },
    { label: 'クリーチャー1体か てきに 3点、3点 かいふく', tgt: [{ side: 'E', face: true, label: '3点を あたえる 相手' }], ai: (s, E) => { const b = E.burnTarget(s, 3); return b && { score: 5 + b.score, run: () => { hit(s, E, b.t, 3); E.gain(s, 3); } }; }, apply: (s, E, [[t]]) => { hit(s, E, t, 3); E.gain(s, 3); } },
    { label: '自分の パーマネント1つを ぼちに おいて 2まい 引く', ai: (s, E) => { const f = fodder(s, E).filter((q) => q.token)[0]; return f && { score: 4, run: () => { E.leave(s, f, 'gy', { died: true }); E.drawCard(s, 2); } }; }, tgt: [{ side: 'P', perm: true, label: 'ぼちに おく 自分の パーマネント' }], apply: (s, E, [[f]]) => { E.leave(s, f, 'gy', { died: E.isCreature(f) }); E.drawCard(s, 2); } },
  ]),
  GU07: command([
    { label: 'クリーチャー1体を もどす（てきは やまふだの 上へ）', tgt: [{ side: 'any', label: 'もどす クリーチャー' }], ai: (s, E) => { const b = foeBest(s, E); return b && { score: 4 + b.score, run: () => { if (E.onBf(s, b.t)) E.bounce(s, b.t); E.sba(s); } }; }, apply: (s, E, [[t]]) => { if (E.onBf(s, t)) E.bounce(s, t); E.sba(s); } },
    { label: 'クリーチャー1体に ＋1/＋1カウンター 2こ', tgt: [{ side: 'P', label: '＋1/＋1カウンターを おく クリーチャー' }], ai: (s, E) => { const t = E.bestBuffTarget(s, null); return t && { score: 5, run: () => { E.target(s, t); E.addCounters(s, t, 2); } }; }, apply: (s, E, [[t]]) => { E.target(s, t); E.addCounters(s, t, 2); } },
    { label: 'てきの アーティファクトか エンチャントを 追放', ai: () => null, apply: () => {} },
    { label: 'ぼちの 3まいまでを やまふだに もどす', ai: (s, E) => (s.P.gy.length >= 3 ? { score: 1, run: () => { s.P.lib.push(...s.P.gy.splice(0, 3)); E.shuffleLib(s); } } : null), apply: (s, E) => { s.P.lib.push(...s.P.gy.splice(0, 3)); E.shuffleLib(s); } },
  ]),
  // ---- 2色 ----
  WK08: magecraft((s, p, E) => E.pump(p, 0, 0, [p.attacking ? 'first' : 'lifelink'])),
  UR08: { kwSet: [], kwFn: (s, p) => (p.flags.turn.mage ? ['trample', 'haste'] : ['defender']), ...magecraft((s, p) => { p.flags.turn.mage = true; }) },
  KG08: { mana: ['G', 'K'], manaLife: 1 },
  RW08: {
    acts: [{ cost: 3, req: ['R', 'W'], when: [1], label: 'ぼちの 1まいを 追放：＋1/＋1', can: (s) => s.P.gy.length > 0, play: (s, p, E) => (p.attacking || p.sick || p.flags.turn.used || !s.P.gy.length ? null : { score: 1, run: () => { p.flags.turn.used = true; s.P.exile.push(s.P.gy.shift()); E.pump(p, 1, 1); } }) }],
  },
  GU08: magecraft((s, p, E) => E.addCounters(s, p, 1)),
  WU06: {
    etb: (s, p, E) => { if (p.side === 'P') learn(s, E); },
    onCast: (s, p, d, E) => { if (p.side === 'P' && isSub({ def: d }, 'lesson')) { const t = E.bestBuffTarget(s, null); if (t) E.addCounters(s, t, 1); } },
  },
  UK06: { etb: (s, p, E) => { if (p.side === 'P') { learn(s, E); learn(s, E); } } },
  KR06: magecraft((s, p, E) => drain(s, E, 1, p)),
  RG06: { kwFn: (s, p, E) => (powerSum(s, E, p.side, p) + 5 >= 10 ? ['double'] : []) },
  WG06: { upkeep: (s, p, E) => { if (p.side !== 'P') return; if (mine(s, E).length >= 10) E.drawCard(s, 2); else E.token(s, 'P', T.saproling); } },
  // ---- 無色 ----
  C26: {
    mana: ['C'], onTapped: (s, p, E) => scoreUp(s, p, E),
    onAllyHit: (s, p, src, E) => scoreUp(s, p, E),
    onLifeLoss: (s, p) => { if (p.ctr > 0 && s.active === 'E') p.ctr--; },
  },
  C27: { etb: (s, p, E) => { if (p.side !== 'P') return; const c = bestIn(s.P.gy, (x) => isSpellDef(x.def)); if (c) { s.P.gy.splice(s.P.gy.indexOf(c), 1); s.P.lib.unshift(c); } } },
  C28: {
    mana: 'any',
    acts: [{ cost: 3, tap: true, sac: true, when: [2], label: 'ぼちに おいて 1まい 引く', play: (s, p, E) => (s.P.mana.length >= 8 ? { score: 2, run: () => { E.leave(s, p, 'gy'); E.drawCard(s); } } : null) }],
  },
  C29: { acts: [{ cost: 0, tap: true, when: [1, 2], label: 'パワーの 合計が 10 いじょうなら 1まい 引く', can: (s, p, E) => powerSum(s, E, 'P') >= 10, cantWhy: 'パワーの 合計が 10 より 小さい', play: (s, p, E) => (powerSum(s, E, 'P') >= 10 ? { score: 4, run: () => E.drawCard(s) } : null) }] },
  // ---- レッスン（パックには 入らない。学習で 手札に くる） ----
  LS01: { noPack: true, play: (s, E) => { const t = foePerm(s, E); return t ? { score: 6, run: () => exileIt(s, E, t) } : null; }, ...exilePerm, apply: (s, E, [[t]]) => exileIt(s, E, t) },
  LS02: { noPack: true, play: (s, E) => ({ score: 4, run: () => E.then(E.scry(s, 2), () => E.drawCard(s)) }) },
  LS03: { noPack: true, play: (s, E) => ({ score: 5, run: () => E.token(s, 'P', T.pest, 2) }) },
  LS04: { noPack: true, play: (s, E, ctx) => ({ score: 4 + 2 * ctx.xMax, x: ctx.xMax, run: (x) => fractal(s, E, x) }) },
  LS05: { noPack: true, play: (s, E) => ({ score: 4, run: () => { E.rampTop(s); E.gain(s, 2); } }) },
  LS06: {
    noPack: true, play: (s, E) => { const t = E.bestBuffTarget(s, null); return t ? { score: 5, run: () => { E.target(s, t); E.addCounters(s, t, 2); E.pump(t, 0, 0, ['vigilance']); } } : null; },
    tgt: [{ side: 'P', label: '＋1/＋1カウンターを 2こ おく クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.addCounters(s, t, 2); E.pump(t, 0, 0, ['vigilance']); },
  },
  LS07: { noPack: true, play: (s, E) => ({ score: 7, run: () => E.drawCard(s, 2) }) },
  LS08: {
    noPack: true, play: (s, E) => { const t = foePerm(s, E); return t ? { score: 5, run: () => { exileIt(s, E, t); E.token(s, 'E', T.spirit32); } } : null; },
    ...exilePerm, apply: (s, E, [[t]]) => { exileIt(s, E, t); E.token(s, 'E', T.spirit32); },
  },
  LS09: {
    noPack: true,
    play: (s, E) => { const f = fodder(s, E)[0], b = foeBest(s, E); return f && b && b.score >= 3 ? { score: 4 + b.score, run: () => { E.leave(s, f, 'gy', { died: true }); exileIt(s, E, b.t); } } : null; },
    tgt: [{ side: 'P', label: 'ぼちに おく 自分の クリーチャー' }, { side: 'E', label: '追放する クリーチャー' }],
    apply: (s, E, [[f], [t]]) => { E.leave(s, f, 'gy', { died: true }); exileIt(s, E, t); },
  },
  LS10: { noPack: true, play: (s, E) => ({ score: 12, run: () => { E.token(s, 'P', T.inkling); E.token(s, 'P', T.spiritRW); E.token(s, 'P', T.elemGU); } }) },
};

// スフィンクス：4まい 見て 2まいを 手札に、のこりは 墓地へ（あいてが えらぶ ぶんは 弱い ほう）
function sphinx(s, p, E) {
  if (p.side !== 'P') return;
  const top = s.P.lib.splice(0, 4).sort((a, b) => E.keepValue(s, b) - E.keepValue(s, a));
  s.P.hand.push(...top.slice(0, 2)); s.P.gy.push(...top.slice(2));
}
// 宝の 地図（C26）：点カウンターが 10こで かち
function scoreUp(s, p, E) {
  if (p.side !== 'P') return;
  p.ctr++;
  E.L(s, `点カウンター ${p.ctr}`);
  if (p.ctr >= 10 && !s.over) { E.L(s, '点カウンターが 10こ！ かち'); s.over = 'win'; }
}
function tutor(s, E) {
  const c = [...s.P.lib].sort((a, b) => E.keepValue(s, b) - E.keepValue(s, a))[0];
  if (!c) return;
  s.P.lib.splice(s.P.lib.indexOf(c), 1); s.P.hand.push(c); E.shuffleLib(s);
  E.L(s, `さがした：${c.def.name}`);
}
function reanimate(s, E, f) {
  const c = bestIn(s.P.gy, (x) => f(x.def));
  if (c) { s.P.gy.splice(s.P.gy.indexOf(c), 1); E.enter(s, 'P', c.def, { card: c.def }); }
}
