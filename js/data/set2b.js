// 第2弾「英雄譚の 時代」の 追加 46種の うごき（名前・コスト・P/T は skel.js、文は docs/cards/set2_plus.md）
// もとの 74種は cards.js に ある
import { T, cr, mine, theirs, isSub, saga, vanish, hb, single, foeBest, bestFreeze, chosen1 } from './kit.js';

const tapIt = (s, E, t, freeze = false) => { if (t && E.onBf(s, t)) { t.tapped = true; if (freeze) t.frozen = true; } };
const bigFoe = (s, E) => theirs(s, E).filter((p) => !s.floor.untargetable?.(s, p, E)).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
const biggestMine = (s, E) => [...mine(s, E)].sort((a, b) => E.power(s, b) - E.power(s, a))[0];
// 適応 n：＋1/＋1カウンターが 1つも ない ときだけ n こ
const adapt = (cost, req, n) => ({ cost, req, adapt: n, when: [1, 2], play: (s, p, E) => (p.ctr === 0 ? { score: 3 + n, run: () => E.addCounters(s, p, n) } : null) });
// 湧血：手札から すてて、攻撃している クリーチャーを 強く する
const bloodrush = (cost, req, p, t, kw = []) => ({ bloodrush: { cost, req, p, t }, singleRun: (s, E, q) => E.pump(q, p, t, kw) });
// 集会：パワーが ちがう クリーチャーが 3体 いじょう
const covenStart = (f) => ({ combatStart: (s, p, E) => { if (p.side === 'P' && E.coven(s)) { E.L(s, `しゅうかい：${p.def.name}`); f(s, p, E); } } });
const tentacle = cr('t_tentacle', '触手（しょくしゅ）', null, 'U', 0, 1, 1, ['tentacle']);
const withCtr = (s, q, p, E) => E.isCreature(p) && p.ctr > 0;

export const S2B = {
  // ---- 白 ----
  W99: { etb: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', T.human); }, ...covenStart((s, p, E) => E.addCounters(s, p, 1)) },
  W100: vanish(2),
  W101: single(2, 2),
  W102: { kw: ['battlecry'] },
  W103: {
    onAttack: (s, p, E, atk) => {
      const t = atk.map((a) => a.p).filter((q) => q !== p && E.onBf(s, q) && !E.hasKw(s, q, 'flying')).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
      if (t) { E.target(s, t); E.pump(t, 0, 0, ['flying']); }
    },
  },
  W104: saga([
    { run: (s, E) => { const t = biggestMine(s, E); if (t) E.addCounters(s, t, 1); } },
    { run: (s, E) => { const t = biggestMine(s, E); if (t) E.addCounters(s, t, 1); } },
    { run: (s, E) => { const t = biggestMine(s, E); if (t) E.pump(t, 0, 0, ['flying', 'first', 'lifelink']); } },
  ]),
  W105: vanish(3, { onTimeRemoved: (s, p, E) => { if (p.side === 'P') E.gain(s, 2); } }),
  W106: saga([
    { run: (s, E) => E.token(s, 'P', T.knightV) },
    { run: (s, E) => E.token(s, 'P', T.knightV) },
    { run: (s, E) => { for (const q of mine(s, E)) if (isSub(q, 'knight')) E.pump(q, 2, 1); } },
  ]),
  W107: {
    kw: ['battlecry'],
    onAttack: (s, p, E, atk, a) => { for (const t of E.token(s, p.side, T.soldier, 2, { tapped: true })) { t.attacking = true; atk.push({ p: t, t: a.t }); } },
  },
  // ---- 青 ----
  U93: { acts: [adapt(6, ['U'], 2)], grant: (s, q, p, E) => (withCtr(s, q, p, E) ? ['flying'] : null) },
  U94: saga([
    { run: (s, E) => E.scry(s, 2) },
    { run: (s, E) => E.drawCard(s) },
    { run: (s, E) => E.then(E.scry(s, 2), () => E.drawCard(s)) },
  ]),
  U95: vanish(3, {
    aura: true, tgt: [{ side: 'E', label: 'つける てきの クリーチャー（しょうしつが おわると はかい）' }],
    need: (s, E) => theirs(s, E).length > 0,
    etb: (s, p, E, o) => {
      let h = chosen1(o); if (h === undefined) h = bigFoe(s, E);
      if (!h || !E.onBf(s, h)) { E.leave(s, p, 'gy'); return; }
      E.attach(s, p, h);
    },
    onLeaveSelf: (s, p, E) => { const h = s.E.bf.find((q) => q.uid === p.attached) || s.P.bf.find((q) => q.uid === p.attached); if (h) { E.L(s, `${p.def.name}：${h.def.name} を はかい`); E.destroy(s, h); } },
  }),
  U96: {
    play: (s, E) => (theirs(s, E).length ? {
      score: 4 + (s.P.hand.length <= 1 ? 3 : 0),
      run: () => { const n = s.P.hand.length === 0 ? 2 : 1; if (n === 2) E.L(s, 'ぼうゆう：2体まで'); for (const t of theirs(s, E).sort((a, b) => E.power(s, b) - E.power(s, a)).slice(0, n)) { E.bounce(s, t); } E.sba(s); },
    } : null),
  },
  U97: {
    play: (s, E, ctx) => { const t = bestFreeze(s, E); return t && ctx.phase === 1 ? { score: 4, run: () => { E.target(s, t); tapIt(s, E, t, true); } } : null; },
    escape: { total: 5, req: ['U'] },
  },
  U98: { acts: [adapt(3, ['U'], 2)], onCounters: (s, p, E) => { if (p.side !== 'P') return; const t = bigFoe(s, E); if (t) tapIt(s, E, t); } },
  U99: { onAttack: (s, p, E) => { if (p.side !== 'P' || !hb(s, p)) return; const t = bestFreeze(s, E); if (t) { E.L(s, `ぼうゆう：${t.def.name} を タップ`); tapIt(s, E, t, true); } } },
  U100: { onDraw: (s, p, E) => { if (p.side !== 'P' || p.flags.turn.drew) return; p.flags.turn.drew = true; E.addCounters(s, p, 1); E.token(s, 'P', tentacle); } },
  U101: {
    endStep: (s, p, E) => {
      if (p.side !== 'P') return;
      const q = mine(s, E).filter((x) => x !== p && !x.token && x.def.etb).sort((a, b) => b.def.cost - a.def.cost)[0];
      if (!q) return;
      const card = q.card;
      E.L(s, `${p.def.name}：${q.def.name} を いちど 追放（ついほう）して もどす`);
      if (!E.exile(s, q)) return;
      const i = s.P.exile.findIndex((c) => c.uid === q.uid); if (i >= 0) s.P.exile.splice(i, 1);
      E.enter(s, 'P', card, { card });
    },
    acts: [{ cost: 4, req: ['U'], when: [1], label: 'クリーチャーを タップ', play: (s, p, E) => { const t = theirs(s, E).filter((q) => !q.tapped).sort((a, b) => E.power(s, b) - E.power(s, a))[0]; return t ? { score: 3, run: () => tapIt(s, E, t) } : null; } }],
  },
  // ---- 緑 ----
  G94: { acts: [adapt(4, ['G'], 4)] },
  G95: covenStart((s, p, E) => E.pump(p, 2, 2, ['trample'])),
  G96: bloodrush(1, ['G'], 1, 2, ['deathtouch']),
  G97: { acts: [adapt(5, ['G'], 3)] },
  G98: { trick: { kind: 'single', p: 2, t: 2 }, singleRun: (s, E, q) => { E.addCounters(s, q, 1); E.pump(q, 1, 1); } },
  G99: saga([
    { run: (s, E) => E.rampBasic(s, 1) },
    { run: (s, E) => E.token(s, 'P', T.saproling, 2) },
    { run: (s, E) => { const t = E.bestBuffTarget(s, null); if (t) E.addCounters(s, t, 2); } },
  ]),
  G100: { acts: [adapt(4, ['G'], 2)], grant: (s, q, p, E) => (withCtr(s, q, p, E) ? ['trample'] : null) },
  G101: {
    onOtherEnter: (s, p, q, E) => { if (q.side === p.side && E.isCreature(q) && E.power(s, q) > E.power(s, p)) { E.L(s, `${q.def.name}（${E.power(s, q)}）＞ ${p.def.name}（${E.power(s, p)}）`); E.addCounters(s, p, 1); } },
    kwFn: (s, p) => (p.ctr >= 3 ? ['trample'] : []),
  },
  G102: {
    tgt: [{ side: 'E', min: 0, label: '格闘（かくとう）する てきの クリーチャー' }],
    etb: (s, p, E, o) => {
      if (p.side !== 'P') return;
      let t = chosen1(o); if (t === undefined) t = foeBest(s, E, E.power(s, p))?.t;
      if (t && E.onBf(s, t)) { E.target(s, t); E.fight(s, p, t); }
    },
  },
  // ---- 赤 ----
  R91: { kw: ['battlecry'] },
  R92: {
    aura: true, tgt: [{ side: 'P', label: '＋1/＋0 と 速攻（そっこう）を あたえる 自分の クリーチャー' }],
    eqP: 1, grant: (s, q, p) => (p.uid === q.attached ? ['haste'] : null),
    need: (s, E) => mine(s, E).length > 0,
    etb: (s, p, E, o) => { let h = chosen1(o); if (h === undefined) h = E.bestBuffTarget(s, null); if (!h || !E.onBf(s, h)) { E.leave(s, p, 'gy'); return; } E.attach(s, p, h); },
    escape: { total: 4, req: ['R'] },
  },
  R93: bloodrush(1, ['R'], 3, 3),
  R94: {
    aura: true, tgt: [{ side: 'P', label: '＋2/＋0（ぼうゆうなら ＋4/＋0）を あたえる 自分の クリーチャー' }],
    eqPT: (s, q) => [hb(s, q) ? 4 : 2, 0],
    need: (s, E) => mine(s, E).length > 0,
    etb: (s, p, E, o) => { let h = chosen1(o); if (h === undefined) h = E.bestBuffTarget(s, null, { ready: true }); if (!h || !E.onBf(s, h)) { E.leave(s, p, 'gy'); return; } E.attach(s, p, h); },
  },
  R95: { etb: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', T.treasure); } },
  R96: saga([
    { run: (s) => { s.groundCantBlock = s.turn; } },
    { run: (s, E) => E.token(s, 'P', T.shard, 2) },
    { run: (s, E) => { for (const t of theirs(s, E)) E.damage(s, t, 2, null); E.sba(s); } },
  ]),
  R97: {
    onAttack: (s, p, E) => {
      if (p.side !== 'P') return;
      const n = E.rollDie(s);
      if (n >= 4) E.token(s, 'P', T.treasure, n === 6 ? 2 : 1);
    },
  },
  R98: { onAttacks: (s, q, atk, E) => { if (q.side !== 'P') return; E.L(s, `${q.def.name}：${atk.length}体 × 1点`); for (let i = 0; i < atk.length; i++) E.hitEnemy(s, 1, q); } },
  R99: {
    onAttack: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', T.treasure); },
    onOtherLeave: (s, p, q, E) => { if (q.side === p.side && q.def.treasure && E.onBf(s, p)) E.pump(p, 1, 0); },
  },
  // ---- 2色 ----
  WG10: covenStart((s, p, E) => { for (const q of mine(s, E)) E.pump(q, 1, 1); }),
  WU10: vanish(4, { onTimeRemoved: (s, p, E) => { if (p.side !== 'P') return; const t = bigFoe(s, E); if (t) tapIt(s, E, t); } }),
  RW10: { kw: ['battlecry'] },
  UR10: { onAttack: (s, p, E) => { if (p.side === 'P' && hb(s, p)) { E.L(s, 'ぼうゆう：てきに 2点'); E.hitEnemy(s, 2, p); } } },
  RG10: bloodrush(3, ['R', 'G'], 5, 4),
  GU10: { acts: [adapt(4, ['G', 'U'], 2)] },
  // ---- 無色 ----
  C31: vanish(3, { mana: 'any' }),
  C32: { acts: [adapt(4, [], 2)] },
  C33: {
    acts: [{
      cost: 2, tap: true, when: [1, 2], label: 'サイコロを ふる',
      play: (s, p, E) => ({ score: 3, run: () => { const n = E.rollDie(s); if (n % 2 === 0) { E.L(s, `${n} は 偶数（ぐうすう）：てきに 2点`); E.hitEnemy(s, 2, p); } else { E.L(s, `${n} は 奇数（きすう）：ライフ ＋2`); E.gain(s, 2); } } }),
    }],
  },
  C34: { escape: { total: 5, req: [], ctr: 1 } },
};
