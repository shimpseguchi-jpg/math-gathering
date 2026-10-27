// 第4弾「星めぐりの 夜」のうごき（名前・コスト・P/T は skel.js、文は docs/SET4.md）
import {
  T, hit, mine, theirs, isSub, lowestKeep, isCr, chosen1, regrow, foeBest, shrink, foe1, bolt, killIt, fodder, single,
  shrines, constellation, omen, adventure, aura, food, foods, knights, bestFreeze, gyCount,
} from './kit.js';

const bestow = (cost, req, x = {}) => ({ bestow: { cost, req, ...x } });
const drain = (s, E, n, src = null) => { E.hitEnemy(s, n, src); E.gain(s, n); };
const tapIt = (s, E, t, freeze = false) => { if (t && E.onBf(s, t)) { t.tapped = true; if (freeze) t.frozen = true; } };
// ねらいたい 敵（攻撃して くる もの・つよい もの）
const bigFoe = (s, E, f) => theirs(s, E).filter((p) => !s.floor.untargetable?.(s, p, E) && (!f || f(p))).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
const pump1 = (p, t, kw) => ({
  play: (s, E, ctx) => { if (ctx.phase !== 1) return null; const q = E.bestBuffTarget(s, null, { ready: true }); return q ? { score: 3 + p, run: () => { E.target(s, q); E.pump(q, p, t, kw || []); } } : null; },
  tgt: [{ side: 'P', label: `＋${p}/＋${t} する クリーチャー` }], apply: (s, E, [[q]]) => { E.target(s, q); E.pump(q, p, t, kw || []); },
});
const shrineCount = (s, E) => shrines(s);
const enchCount = (s) => s.P.bf.filter((q) => (q.def.types || []).includes('enchantment')).length;
const scry2 = (s, E) => E.scry(s, 2);

export const S4 = {
  // ---- 白 ----
  W45: adventure('妖精（ようせい）の おくりもの', 2, ['W'], 'sorcery', pump1(2, 1, ['flying'])),
  W46: bestow(4, ['W'], { p: 1, t: 1, kw: ['lifelink'] }),
  W47: omen('W', (s, p, E) => { E.token(s, 'P', T.soldier, 2); E.gain(s, 2); }),
  W48: { costLess: (s, E) => E.devotion(s, 'W') },
  W49: aura('E', 'こうげきも ブロックも できなく する てきの クリーチャー', { pacify: true, filter: (s, E, p) => !E.hasKw(s, p, 'flying') }),
  W50: {
    acts: [{
      cost: (s) => Math.max(0, 6 - shrines(s)), req: ['W'], when: [1], label: 'クリーチャーを タップ',
      play: (s, p, E) => { const t = bigFoe(s, E, (q) => !q.tapped); return t ? { score: 3, run: () => tapIt(s, E, t) } : null; },
      tgt: [{ side: 'E', label: 'タップする クリーチャー' }], apply: (s, E, [[t]]) => tapIt(s, E, t),
    }],
  },
  W51: adventure('目が まわる 急降下（きゅうこうか）', 2, ['W'], 'instant', {
    play: (s, E, ctx) => { const ts = theirs(s, E).filter((p) => !p.tapped).slice(0, 2); return ctx.phase === 1 && ts.length ? { score: 2 + ts.length, run: () => { for (const t of ts) tapIt(s, E, t); } } : null; },
    tgt: [{ side: 'E', max: 2, label: 'タップする クリーチャー（2体まで）' }], apply: (s, E, [ts]) => { for (const t of ts) tapIt(s, E, t); },
  }),
  W52: constellation((s, p, E) => { const t = E.bestBuffTarget(s, null); if (t) t.shieldT = s.turn; }),
  W53: {
    acts: [{
      cost: 2, req: ['W'], tap: true, when: [1], label: 'クリーチャーを タップ',
      play: (s, p, E) => { const t = bigFoe(s, E, (q) => !q.tapped); return t ? { score: 2, run: () => tapIt(s, E, t) } : null; },
      tgt: [{ side: 'E', label: 'タップする クリーチャー' }], apply: (s, E, [[t]]) => tapIt(s, E, t),
    }],
    ...adventure('ばっさり', 3, ['W'], 'instant', foe1('はかいする パワー4いじょうの クリーチャー', killIt, { filter: (s, E, p) => E.power(s, p) >= 4 })),
  },
  W54: {
    pow: (s, p) => s[p.side].bf.filter((q) => E_isCr(q) || q.def.aura).length, tou: (s, p) => s[p.side].bf.filter((q) => E_isCr(q) || q.def.aura).length,
    ...bestow(4, ['W'], { pt: (s, q) => { const n = s[q.side].bf.filter((r) => E_isCr(r) || r.def.aura).length; return [n, n]; } }),
  },
  W55: { anthem: (s, q, p) => (p !== q && isSub(p, 'angel') ? [1, 1] : null), grant: (s, q, p) => (p !== q && isSub(p, 'angel') ? ['lifelink'] : null) },
  W56: {
    costLess: (s) => knights(s), anthem: (s, q, p, E) => (E.isCreature(p) ? [1, 1] : null),
    acts: [{ cost: 4, req: ['W'], tap: true, when: [1, 2], label: '騎士（きし）を 出す', play: (s, p, E) => ({ score: 5, run: () => E.token(s, 'P', T.knightV) }) }],
  },
  // ---- 青 ----
  U46: {
    onDamageCreature: (s, p, t) => { t.tapped = true; t.frozen = true; },
    ...adventure('冬の いかり', 2, ['U'], 'sorcery', {
      play: (s, E, ctx) => { const t = bestFreeze(s, E); return t && ctx.phase === 1 ? { score: 4, run: () => tapIt(s, E, t, true) } : null; },
      tgt: [{ side: 'E', label: 'タップして つぎの ターン 起きない クリーチャー' }], apply: (s, E, [[t]]) => tapIt(s, E, t, true),
    }),
  },
  U47: bestow(5, ['U'], { p: 2, t: 2, kw: ['flying'] }),
  U48: {
    costLess: (s) => enchCount(s),
    tgt: [{ side: 'E', label: 'てふだに もどす クリーチャー（てきは やまふだの 上へ）' }],
    etb: (s, p, E, o) => { if (p.side !== 'P') return; let t = chosen1(o); if (t === undefined) t = foeBest(s, E)?.t; if (t && E.onBf(s, t)) E.bounce(s, t); E.sba(s); },
  },
  U49: omen('U', (s, p, E) => E.then(E.scry(s, 2), () => E.drawCard(s))),
  U50: aura('E', 'タップして 起きなく する てきの クリーチャー', { onAttach: (s, p, E, h) => { h.tapped = true; h.iceBy = p; } }),
  U51: { afterRefill: (s, p, E) => { if (p.side !== 'P') return; E.drawCard(s, shrines(s)); const c = lowestKeep(s, E); if (c) E.discard(s, [c]); } },
  U52: constellation((s, p, E) => { const t = E.bestBuffTarget(s, null, { ready: true }); if (t) t.flags.turn.unblockable = true; }),
  U53: constellation((s, p, E) => { const t = foeBest(s, E)?.t; if (t && E.onBf(s, t)) { E.bounce(s, t); E.sba(s); } }),
  U54: {
    blockOnlyFlyers: true,
    ...adventure('ちょっとした どろぼう', 2, ['U'], 'instant', {
      play: (s, E) => { const t = foeBest(s, E)?.t; return t ? { score: 5, run: () => { if (E.onBf(s, t)) E.bounce(s, t); E.sba(s); } } : null; },
      tgt: [{ side: 'E', perm: true, label: 'てふだに もどす てきの パーマネント（やまふだの 上へ）', filter: (s, E, p) => !s.floor.cantLeave?.(s, p, E) }],
      apply: (s, E, [[t]]) => { if (E.onBf(s, t)) E.bounce(s, t); E.sba(s); },
    }),
  },
  U55: bestow(7, ['U'], { p: 1, t: 1, kw: ['flying'], steal: true }),
  U56: {
    mana: ['U'],
    etb: (s, p) => { p.ctr = 0; p.time = 0; },
    upkeep: (s, p, E) => clockTick(s, p, E),
    onProliferate: (s, p, E) => { if (!(p.time > 0)) return; p.time--; clockTick(s, p, E); }, // 増殖で ふえた 1こを 数えなおして 12こ チェック
    acts: [{ cost: 3, req: ['U'], when: [2], label: '時（とき）カウンターを 1こ おく', play: (s, p, E) => ((p.time || 0) >= 8 ? { score: 2, run: () => clockTick(s, p, E) } : null) }],
  },
  U57: {
    costLess: (s) => s.P.gy.filter((c) => c.def.types.includes('instant') || c.def.types.includes('sorcery')).length,
    upkeep: (s, p, E) => { if (p.side !== 'P') return; p.know = (p.know || 0) + 1; E.drawCard(s, p.know); },
  },
  // ---- 黒 ----
  K43: { ...foe1('はかいする クリーチャー', (s, E, t) => { killIt(s, E, t); food(s, E); }) },
  K44: adventure('ごきげんとり', 1, ['K'], 'sorcery', { play: (s, E) => { const x = knights(s); return x ? { score: 2 + 2 * x, run: () => drain(s, E, knights(s)) } : null; } }),
  K45: {
    etb: (s, p, E) => { if (p.side === 'P') food(s, E); },
    acts: [{ cost: 2, tap: true, when: [1, 2], label: '食物（しょくもつ）を ぼちに おいて 3点', can: (s) => foods(s).length > 0, cantWhy: '食物（しょくもつ）が ない', play: (s, p, E) => (foods(s).length ? { score: 5, run: () => { E.leave(s, foods(s)[0], 'gy'); E.hitEnemy(s, 3, p); } } : null) }],
  },
  K46: constellation((s, p, E) => E.hitEnemy(s, 1, p)),
  K47: omen('K', (s, p, E) => { regrow(s, E, isCr); }),
  K48: { upkeep: (s, p, E) => { if (p.side === 'P') drain(s, E, shrines(s), p); } },
  K49: adventure('けがれた ひらめき', 3, ['K'], 'instant', { play: (s, E, ctx) => (ctx.phase === 2 && s.P.life > 6 ? { score: 4, run: () => { E.drawCard(s); E.hurt(s, 1); } } : null) }),
  K50: { cantBlock: true, ...adventure('運命（うんめい）を かえる', 2, ['K'], 'sorcery', { play: (s, E) => (gyCount(s, 'creature') ? { score: 4, run: () => regrow(s, E, isCr) } : null) }) },
  K51: { dieToBottom: true, ...adventure('すばやい おわり', 3, ['K'], 'instant', foe1('はかいする クリーチャー', (s, E, t) => { killIt(s, E, t); E.hurt(s, 2); }, { score: 4 })) },
  K52: {
    pow: (s) => crInGy(s), tou: (s) => crInGy(s),
    ...bestow(6, ['K'], { pt: (s) => [crInGy(s), crInGy(s)] }),
  },
  K53: constellation((s, p, E) => { for (const t of theirs(s, E)) E.pump(t, -1, -1); E.sba(s); }),
  K54: {
    costLess: (s) => 2 * gyCount(s, 'creature'), ownDeadToBottom: true,
    acts: [{
      cost: 3, req: ['K'], tap: true, when: [1], label: 'ぼちの クリーチャーを 戦場（せんじょう）に（2点 うしなう）', can: (s) => gyCount(s, 'creature') > 0,
      play: (s, p, E) => { const c = [...s.P.gy].filter((x) => isCr(x.def)).sort((a, b) => b.def.cost - a.def.cost)[0]; return c && s.P.life > 6 ? { score: 6 + c.def.cost, run: () => { E.hurt(s, 2); s.P.gy.splice(s.P.gy.indexOf(c), 1); E.enter(s, 'P', c.def, { card: c.def }); } } : null; },
    }],
  },
  // ---- 赤 ----
  R45: { cantBlock: true, ...adventure('岩（いわ）の 突進（とっしん）', 1, ['R'], 'instant', pump1(2, 0)) },
  R46: bestow(2, ['R'], { p: 1, t: 1 }),
  R47: foe1('3点を あたえる クリーチャー（しぼうするなら 追放）', (s, E, t) => { if (!t || !E.onBf(s, t)) return; t.exileT = s.turn; hit(s, E, t, 3); }, { n: 3 }),
  R48: omen('R', (s, p, E) => E.hitEnemy(s, 2, p)),
  R49: { equip: 1, eqP: 1, grant: (s, q, p) => (p.uid === q.attached ? ['haste'] : null) },
  R50: {
    acts: [{
      cost: 1, when: [1, 2], label: 'きほんか 祠（ほこら）を すてて、祠（ほこら）の 数の ダメージ', can: (s) => s.P.hand.some((c) => c.def.basic || isSub({ def: c.def }, 'shrine')), cantWhy: 'すてる きほんカードが ない',
      play: (s, p, E) => { const c = s.P.hand.find((x) => x.def.basic); const b = c && foeBest(s, E, shrines(s)); return b ? { score: 3 + b.score, run: () => { E.discard(s, [c]); hit(s, E, b.t, shrines(s)); } } : null; },
      tgt: [{ side: 'E', label: '祠（ほこら）の 数の ダメージを あたえる クリーチャー' }],
      apply: (s, E, [[t]]) => { const c = s.P.hand.find((x) => x.def.basic || isSub({ def: x.def }, 'shrine')); if (!c) return; E.discard(s, [c]); hit(s, E, t, shrines(s)); },
    }],
  },
  R51: constellation((s, p, E) => E.hitEnemy(s, 1, p)),
  R52: { acts: [{ cost: 1, req: ['R'], pumpP: 1, play: () => null }], ...bestow(3, ['R'], { p: 1, t: 1 }) },
  R53: { ...adventure('ふみつけ', 2, ['R'], 'instant', bolt(2)), onTargeted: (s, p, E) => { E.L(s, `${p.def.name}：ねらわれたので 2点 はねかえす`); E.hurt(s, 2); } },
  R54: {
    tgt: [{ side: 'E', face: true, label: 'ダメージを あたえる 相手' }],
    etb: (s, p, E, o) => {
      if (p.side !== 'P') return;
      const x = s.P.mana.filter((m) => m.def.basic && (m.def.color || '').includes('R')).length; if (!x) return;
      const t = chosen1(o);
      if (t) hit(s, E, t, x); else E.hitEnemy(s, x, p);
    },
  },
  R55: {
    grant: (s, q, p, E) => (E.isCreature(p) ? ['haste'] : null),
    acts: [{
      cost: 3, req: ['R'], tap: true, when: [1], label: 'マナゾーンの 1まいを ぼちへ：ゴーレム', can: (s) => s.P.mana.length > 0,
      play: (s, p, E) => (s.P.mana.length >= 7 ? { score: 4, run: () => { const m = s.P.mana.find((x) => x.tapped) || s.P.mana[0]; s.P.mana.splice(s.P.mana.indexOf(m), 1); s.P.gy.push({ uid: m.uid, def: m.def }); E.token(s, 'P', T.golemE); } } : null),
    }],
  },
  R56: {
    costLess: (s, E) => mine(s, E).filter((q) => q.attacking).length,
    eqP: 1, eqT: 1, equip: 3, grant: (s, q, p) => (p.uid === q.attached ? ['double', 'trample'] : null),
    etb: (s, p, E) => { const t = mine(s, E).filter((q) => q.attacking).sort((a, b) => E.power(s, b) - E.power(s, a))[0] || E.bestBuffTarget(s, null); if (t) p.attached = t.uid; }, // 攻撃中なら 攻撃している クリーチャーに
  },
  // ---- 緑 ----
  G46: adventure('盾（たて）の 力', 2, ['G'], 'instant', pump1(2, 2)),
  G47: bestow(4, ['G'], { p: 2, t: 2, kw: ['reach'] }),
  G48: omen('G', (s, p, E) => E.rampBasic(s, 1)),
  G49: { etb: (s, p, E) => { if (p.side === 'P') food(s, E); } },
  G51: { upkeep: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', T.shard, shrines(s)); } },
  G52: {
    pow: (s, p) => s[p.side].mana?.length ?? 5, tou: (s, p) => s[p.side].mana?.length ?? 5,
    ...adventure('実（みの）りの 足あと', 3, ['G'], 'sorcery', { play: (s, E, ctx) => (ctx.phase === 1 && E.basicsInLib(s) ? { score: 5, run: () => E.rampBasic(s, 1) } : null) }),
  },
  G53: aura('P', 'つける 自分の クリーチャー（つけたら てきと 格闘（かくとう））', {
    t: 2,
    onAttach: (s, p, E, h) => { if (h.side !== 'P') return; const b = foeBest(s, E, E.power(s, h)); if (b) { E.target(s, h); E.fight(s, h, b.t); } },
  }),
  G54: {
    cantAttack: (s, p, E) => !E.creatures(s, p.side).some((q) => E.pt(s, q)[0] === 1 && E.pt(s, q)[1] === 1),
    ...adventure('心の のぞみ', 1, ['G'], 'sorcery', { play: (s, E, ctx) => (ctx.phase === 1 ? { score: 3, run: () => E.token(s, 'P', T.human) } : null) }),
  },
  G55: constellation((s, p, E) => { E.addCounters(s, p, 1); E.drawCard(s); }, false),
  G56: {
    etb: (s, p) => { p.ctr = 4; },
    onOtherEnter: (s, p, q, E) => {
      if (q.side !== p.side || !E.isCreature(q) || !(q.def.color || '').includes('G')) return;
      E.addCounters(s, p, 1);
      if (E.power(s, q) > E.power(s, p)) E.addCounters(s, p, 1);
    },
  },
  G57: {
    costLess: (s, E) => Math.max(0, ...mine(s, E).map((q) => E.power(s, q))),
    mana: ['G'], manaN: 2, onTapped: (s, p, E) => E.gain(s, 2),
    onOtherEnter: (s, p, q, E) => { if (q.side === 'P' && p.side === 'P' && E.isCreature(q) && !q.token) { E.addCounters(s, q, 1); E.drawCard(s); } },
  },
  // ---- 2色 ----
  WG05: {
    etb: (s, p, E) => {
      if (p.side !== 'P') return;
      const top = s.P.lib.splice(0, 7); const a = top.find((c) => c.def.aura || c.def.bestow);
      if (a) { top.splice(top.indexOf(a), 1); s.P.hand.push(a); }
      s.P.lib.push(...top);
    },
    onAttach: (s, p, a, h, E) => E.token(s, 'P', T.soldier),
  },
  WU05: {
    ...aura('P', '＋1/＋1 と 絆魂（はんこん）を あたえる 自分の クリーチャー', { p: 1, t: 1, kw: ['lifelink'] }),
    onAllyHit: (s, q, src, E) => { if (src.uid === q.attached) E.drawCard(s); },
  },
  RW05: { anthem: (s, q, p) => (p !== q && isSub(p, 'knight') ? [1, 1] : null) },
  UR05: {
    onDraw: (s, p, E) => { p.flags.turn.draws = (p.flags.turn.draws || 0) + 1; if (p.flags.turn.draws === 2) E.token(s, 'P', T.faerie); },
    acts: [{ cost: 6, req: ['U', 'R'], when: [2], label: '1まい 引いて 1まい すてる', play: (s, p, E) => ({ score: 1, run: () => { E.drawCard(s); const c = lowestKeep(s, E); if (c) E.discard(s, [c]); } }) }],
  },
  RG05: { onOtherEnter: (s, p, q, E) => { if (q.side === p.side && E.isCreature(q) && !isSub(q, 'human')) E.addCounters(s, q, 1); } },
  GU05: constellation((s, p, E) => { const t = E.bestBuffTarget(s, null); if (t) { E.target(s, t); E.addCounters(s, t, 1); } }),
  WK05: {
    tou: (s, p) => knights(s, p.side),
    onAttack: (s, p, E) => { const t = mine(s, E).filter((q) => q !== p && isSub(q, 'knight')).sort((a, b) => E.power(s, b) - E.power(s, a))[0]; if (t) E.pump(t, 0, 0, ['indestructible']); },
  },
  UK05: {
    onCombatHit: (s, p, E) => E.drawCard(s),
    ...adventure('ぬすみの 計画（けいかく）', 2, ['U', 'K'], 'instant', {
      play: (s, E, ctx) => (ctx.phase === 2 ? { score: 4, run: () => { const t = bigFoe(s, E); if (t) E.pump(t, -2, 0); E.drawCard(s); } } : null),
      tgt: [{ side: 'any', label: '−2/−0 する クリーチャー' }], apply: (s, E, [[t]]) => { if (E.onBf(s, t)) E.pump(t, -2, 0); E.drawCard(s); },
    }),
  },
  KR05: {
    etb: (s, p, E) => { if (p.side === 'P') food(s, E); },
    onOtherLeave: (s, p, q, E) => { if (p.side === 'P' && q.side === 'P' && q.def.food) E.hitEnemy(s, 2, p); },
  },
  KG05: {
    onAttack: (s, p, E) => food(s, E), onBlock: (s, p, E) => food(s, E), // 攻撃するか ブロックするたび
    acts: [{ cost: 0, when: [2], label: '食物（しょくもつ） 2つを ぼちへ：1まい 引く', can: (s) => foods(s).length >= 2, cantWhy: '食物（しょくもつ）が 2つ いる', play: (s, p, E) => (foods(s).length >= 2 && s.P.life > 10 ? { score: 3, run: () => { for (const f of foods(s).slice(0, 2)) E.leave(s, f, 'gy'); E.drawCard(s); } } : null) }],
  },
  // ---- 無色 ----
  C22: { pow: (s, p) => s[p.side].bf.filter((q) => q !== p && ((q.def.types || []).includes('artifact') || (q.def.types || []).includes('enchantment'))).length },
  C23: { etb: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', T.rat, 2); } },
  C24: {
    acts: [{
      cost: 0, tap: true, when: [2], label: 'クリーチャーを ぼちに おいて 食物（しょくもつ）', can: (s, p, E) => mine(s, E).length > 0,
      play: (s, p, E) => { const f = fodder(s, E).filter((q) => q.token && !q.def.food)[0]; return f && s.P.life <= 10 ? { score: 2, run: () => { const big = E.pt(s, f)[1] >= 4; E.leave(s, f, 'gy', { died: true }); food(s, E, big ? 2 : 1); } } : null; },
      tgt: [{ side: 'P', label: 'ぼちに おく クリーチャー' }], apply: (s, E, [[f]]) => { const big = E.pt(s, f)[1] >= 4; E.leave(s, f, 'gy', { died: true }); food(s, E, big ? 2 : 1); },
    }],
  },
  // C25：2色の カードの 呪文・能力の 対象に ならない
  C25: { hexproof: (s, p, src) => [...(src?.color || '')].filter((k) => 'WUKRG'.includes(k)).length === 2, play: (s, E, ctx) => ({ score: 8 + 3 * ctx.xMax, x: ctx.xMax, run: () => {} }) },
};

const E_isCr = (q) => (q.def.types || []).includes('creature');
const crInGy = (s) => [...s.P.gy, ...s.E.gy].filter((c) => isCr(c.def)).length;
// 時の 金庫：時カウンターが 12こで、手札と 墓地を やまふだに まぜて 7まい 引く
function clockTick(s, p, E) {
  if (p.side !== 'P') return;
  p.time = (p.time || 0) + 1;
  E.L(s, `時（とき）カウンター ${p.time}`);
  if (p.time < 12) return;
  s.P.lib.push(...s.P.hand.splice(0), ...s.P.gy.splice(0));
  E.shuffleLib(s);
  E.drawCard(s, 7);
  E.exile(s, p);
}
