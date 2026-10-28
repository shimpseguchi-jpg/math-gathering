// 第4弾「星めぐりの 夜」のうごき（名前・コスト・P/T は skel.js、文は docs/SET4.md）
import {
  T, hit, mine, theirs, isSub, lowestKeep, isCr, chosen1, regrow, foeBest, shrink, foe1, bolt, killIt, fodder, single,
  shrines, constellation, omen, adventure, aura, food, foods, knights, bestFreeze, gyCount, cr, dig, bestIn, riot,
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
  W55: { anthem: (s, q, p) => (p !== q && isSub(p, 'archon') ? [1, 1] : null), grant: (s, q, p) => (p !== q && isSub(p, 'archon') ? ['lifelink'] : null) },
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

// ---- 120種に する 追加（4.9） ----
const isEnch = (d) => (d.types || []).includes('enchantment');
const ratK = cr('t_ratK', 'ネズミ', null, 'K', 0, 1, 1, ['rat']);
const boar = cr('t_boar', 'イノシシ', null, 'G', 0, 1, 1, ['boar'], [], { onDie: (s, p, E) => { if (p.side === 'P') food(s, E); } });
const giant77 = cr('t_giant77', '巨人（きょじん）', null, 'G', 0, 7, 7, ['giant']);
const rats = (s, E) => mine(s, E).filter((q) => isSub(q, 'rat'));
// 1ターンに 1回の「自分を 強く する」起動型能力
const selfPump = (cost, req, label, f) => ({ cost, req, when: [1], label, play: (s, p, E) => (!p.flags.turn.used && !p.sick && !p.tapped ? { score: 2, run: () => { p.flags.turn.used = true; f(s, p, E); } } : null) });
// 手札の いちばん いらない 1まいを すてて 1まい 引く（すてたく なければ しない）
const loot = (s, E) => { const c = lowestKeep(s, E); if (c && E.keepValue(s, c) < 4) { E.discard(s, [c]); E.drawCard(s); } };
// あなたの クリーチャーか 食物を 1つ 墓地へ（食物から）
const feed = (s, E, p) => foods(s)[0] || fodder(s, E, p).filter((q) => q.token)[0];
const feedPay = (s, E, f) => E.leave(s, f, 'gy', { died: E.isCreature(f) });

Object.assign(S4, {
  W92: bestow(6, ['W'], { p: 3, t: 3, kw: ['vigilance'] }),
  W93: adventure('助（たす）けを まつ 騎士（きし）', 3, ['W'], 'sorcery', { play: (s, E) => ({ score: 5, run: () => E.token(s, 'P', T.knightV) }) }),
  W94: {
    etb: (s, p, E) => {
      if (p.side !== 'P') return;
      const c = s.P.lib.find((x) => x.def.aura || x.def.bestow);
      if (!c) { E.L(s, 'オーラが なかった'); return; }
      s.P.lib.splice(s.P.lib.indexOf(c), 1); s.P.hand.push(c); E.L(s, `さがした：${c.def.name}`);
    },
  },
  W95: aura('P', '＋1/＋1 と 警戒（けいかい）を あたえる 自分の クリーチャー', { p: 1, t: 1, kw: ['vigilance'] }),
  W96: { etb: (s, p, E) => { if (p.side === 'P') regrow(s, E, isEnch); } },
  W97: {
    onDie: (s, p, E) => {
      if (p.side !== 'P') return;
      const c = bestIn(s.P.gy, (x) => isEnch(x.def) && x.uid !== p.uid); if (!c) return;
      s.P.gy.splice(s.P.gy.indexOf(c), 1); E.enter(s, 'P', c.def, { card: c.def });
    },
  },
  W98: { onAttacks: (s, q, atk, E) => { if (q.side !== 'P') return; const n = atk.filter((a) => (a.p.def.color || '').includes('W')).length; if (n) E.gain(s, n); } },
  U86: bestow(6, ['U'], { p: 3, t: 3 }),
  U87: adventure('ふかく すすむ', 1, ['U'], 'sorcery', { play: (s, E, ctx) => (s.P.lib.length >= 8 && (ctx.phase === 2 || ctx.human) ? { score: 3, run: () => E.mill(s, 4) } : null) }),
  U89: {
    etb: (s, p, E) => { if (p.side === 'P') return E.scry(s, 2); },
    acts: [{ cost: 4, req: ['U'], when: [2], label: 'ぼちに おいて 2まい 引く', play: (s, p, E) => ({ score: 4, run: () => { E.leave(s, p, 'gy'); E.drawCard(s, 2); } }) }],
  },
  U90: {
    ...aura('E', '1/1 に する てきの クリーチャー', { onAttach: (s, p, E, h) => { h.auraPT = [1, 1]; E.L(s, `${h.def.name} は 1/1 の カエルに なった`); } }),
    onLeaveSelf: (s, p) => { const h = [...s.P.bf, ...s.E.bf].find((q) => q.uid === p.attached); if (h) delete h.auraPT; },
  },
  U91: {
    costCut: (s, q, d) => (isEnch(d) ? 1 : 0),
    onOtherLeave: (s, p, q, E) => { if (p.side === 'P' && q.side === 'P' && isEnch(q.def) && s.P.gy.some((c) => c.uid === q.uid)) E.addCounters(s, p, 1); },
  },
  U92: {
    etb: (s, p, E) => { if (p.side === 'P') E.drawCard(s, 2); },
    onCast: (s, p, d, E) => { if (p.side !== 'P' || !(d.color || '').includes('U')) return; const t = bigFoe(s, E, (q) => !q.tapped); if (t) { E.L(s, `${p.def.name}：${t.def.name} を タップ`); tapIt(s, E, t); } },
  },
  K73: bestow(6, ['K'], { p: 3, t: 3, kw: ['deathtouch'] }),
  K74: aura('E', '−3/−3 する てきの クリーチャー', { p: -3, t: -3 }),
  K75: {
    acts: [{
      cost: 1, when: [1, 2], label: 'ほかの クリーチャーを ぼちに おいて てきに 1点', can: (s, p, E) => mine(s, E).some((q) => q !== p), cantWhy: 'ほかの クリーチャーが いない',
      play: (s, p, E) => { const f = fodder(s, E, p).filter((q) => q.token)[0]; return f ? { score: 3, run: () => { E.leave(s, f, 'gy', { died: true }); drain(s, E, 1, p); } } : null; },
      tgt: [{ side: 'P', label: 'ぼちに おく クリーチャー', filter: (s, E, q) => q.def.id !== 'K75' }],
      apply: (s, E, [[f]], x, p) => { E.leave(s, f, 'gy', { died: true }); drain(s, E, 1, p); },
    }],
  },
  K76: { play: (s, E) => (s.P.life > 6 ? { score: 5, run: () => { E.drawCard(s, 2); E.hurt(s, 2); food(s, E); } } : null) },
  K77: {
    etb: (s, p, E) => {
      if (p.side !== 'P' || !foods(s).length) return;
      const b = foeBest(s, E, 2); if (!b) return;
      E.leave(s, foods(s)[0], 'gy'); E.target(s, b.t); shrink(s, E, b.t, 2);
    },
    ...adventure('パン屋（や） おそい', 1, ['K'], 'instant', { play: (s, E) => ({ score: 3, run: () => food(s, E) }) }),
  },
  K78: { play: (s, E) => (gyCount(s, 'creature') ? { score: 3 + 3 * Math.min(2, gyCount(s, 'creature')), run: () => { regrow(s, E, isCr); regrow(s, E, isCr); } } : null) },
  K79: {
    acts: [
      { cost: 2, req: ['K'], tap: true, when: [1, 2], label: 'ネズミを 出す', play: (s, p, E) => ({ score: 3, run: () => E.token(s, 'P', ratK) }) },
      {
        cost: 0, when: [1, 2], label: 'ネズミ 3体を ぼちに おいて はかい', can: (s, p, E) => rats(s, E).length >= 3, cantWhy: 'ネズミが 3体 いる',
        play: (s, p, E) => { const b = foeBest(s, E); return rats(s, E).length >= 3 && b && b.score >= 3 ? { score: 4 + b.score, run: () => { for (const r of rats(s, E).slice(0, 3)) E.leave(s, r, 'gy', { died: true }); killIt(s, E, b.t); } } : null; },
        tgt: [{ side: 'E', label: 'はかいする クリーチャー' }],
        apply: (s, E, [[t]]) => { if (rats(s, E).length < 3) return; for (const r of rats(s, E).slice(0, 3)) E.leave(s, r, 'gy', { died: true }); killIt(s, E, t); },
      },
    ],
  },
  R84: bestow(6, ['R'], { p: 3, t: 3, kw: ['haste'] }),
  R86: aura('P', '＋1/＋1 する 自分の クリーチャー', { p: 1, t: 1, onAttach: (s, p, E) => { if (p.side !== 'P') return; const b = E.burnTarget(s, 1, {}); if (b) hit(s, E, b.t, 1); } }),
  R87: { discardCost: 1, play: (s, E, ctx) => ({ score: 5 - (ctx.phase === 1 ? 1 : 0), run: () => E.drawCard(s, 2) }) },
  R88: foe1('5点を あたえる クリーチャー', (s, E, t) => hit(s, E, t, 5), { n: 5 }),
  R89: { onAttack: (s, p, E, atk) => { const t = atk.map((a) => a.p).find((q) => q !== p && isSub(q, 'knight') && E.onBf(s, q)); if (t) { E.target(s, t); E.pump(t, 2, 0); } } },
  R90: { giantDouble: true },
  G87: bestow(6, ['G'], { p: 3, t: 3, kw: ['trample'] }),
  G88: adventure('かしの 木（き）の めぐみ', 4, ['G'], 'sorcery', {
    play: (s, E, ctx) => { const q = E.bestBuffTarget(s, null); return q && ctx.phase === 1 ? { score: 5, run: () => { E.target(s, q); E.addCounters(s, q, 2); } } : null; },
    tgt: [{ side: 'P', label: '＋1/＋1カウンターを 2こ おく クリーチャー' }], apply: (s, E, [[q]]) => { E.target(s, q); E.addCounters(s, q, 2); },
  }),
  G89: { play: (s, E) => ({ score: 7, run: () => E.token(s, 'P', boar, 3) }) },
  G90: aura('P', '＋3/＋3 と 到達（とうたつ）を あたえる 自分の クリーチャー', { p: 3, t: 3, kw: ['reach'] }),
  G91: constellation((s, p, E) => { const x = gyCount(s, 'creature'); const t = E.bestBuffTarget(s, null, { ready: true }); if (t && x) { E.L(s, `ぼちの クリーチャー ${x}まい：＋${x}/＋${x}`); E.target(s, t); E.pump(t, x, x); } }),
  G92: {
    play: (s, E) => (foods(s).length >= 2
      ? { score: 9, run: () => { for (const f of foods(s).slice(0, 2)) E.leave(s, f, 'gy'); E.token(s, 'P', giant77); } }
      : { score: 5, run: () => food(s, E, 3) }),
  },
  G93: {
    onDie: (s, p, E) => {
      if (p.side !== 'P' || foods(s).length < 3) return;
      const i = s.P.gy.findIndex((c) => c.uid === p.uid); if (i < 0) return;
      for (const f of foods(s).slice(0, 3)) E.leave(s, f, 'gy');
      const [c] = s.P.gy.splice(i, 1); E.L(s, `食物（しょくもつ） 3つで もどった：${c.def.name}`); E.enter(s, 'P', c.def, { card: c.def });
    },
  },
  WG09: {
    acts: [{
      cost: 0, tap: true, when: [1], label: 'みんな ＋1/＋1',
      play: (s, p, E) => { const n = mine(s, E).filter((q) => q !== p && !q.tapped && !q.sick).length; return n >= 2 ? { score: 2 + n, run: () => { for (const q of mine(s, E)) E.pump(q, 1, 1); } } : null; },
    }],
    ...adventure('連（つ）れて かえる', 4, ['W', 'G'], 'sorcery', { play: (s, E) => ({ score: 5, run: () => E.token(s, 'P', T.human, 2) }) }),
  },
  WU09: { etb: (s, p, E) => { if (p.side === 'P') dig(s, E, 4, 1, (d) => (d.types || []).includes('artifact') || isEnch(d)); } },
  RW09: { acts: [selfPump(4, ['R'], '＋1/＋1', (s, p, E) => E.pump(p, 1, 1))] },
  UR09: { etb: (s, p, E) => { if (p.side === 'P') loot(s, E); }, onAttack: (s, p, E) => { if (p.side === 'P') loot(s, E); } },
  RG09: riot(),
  GU09: constellation((s, p, E) => { const t = E.bestBuffTarget(s, null, { ready: true }); if (t) { E.target(s, t); E.addCounters(s, t, 1); E.pump(t, 0, 0, ['flying']); } }),
  WK11: { acts: [selfPump(2, ['W'], '絆魂（はんこん）', (s, p, E) => E.pump(p, 0, 0, ['lifelink']))] },
  UK09: foe1('はかいする クリーチャー（コストが ぼちの まいすう いか）', killIt, { filter: (s, E, p) => (p.def.cost ?? E.power(s, p)) <= s.P.gy.length }),
  KR09: {
    acts: [{
      cost: 3, when: [1, 2], label: 'クリーチャーか 食物（しょくもつ）を ぼちに おいて 2点', can: (s, p, E) => !!feed(s, E, p), cantWhy: 'ぼちに おく ものが ない',
      play: (s, p, E) => { const f = feed(s, E, p), b = foeBest(s, E, 2); return f && b ? { score: 3 + b.score, run: () => { feedPay(s, E, f); hit(s, E, b.t, 2); } } : null; },
      tgt: [{ side: 'E', label: '2点を あたえる クリーチャー' }],
      apply: (s, E, [[t]], x, p) => { const f = feed(s, E, p); if (!f) return; feedPay(s, E, f); hit(s, E, t, 2); },
    }],
  },
  KG09: { backOnGain: true },
  C30: { acts: [selfPump(3, [], '＋1/＋0', (s, p, E) => E.pump(p, 1, 0))] },
});
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
