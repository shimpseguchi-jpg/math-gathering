// 第7弾「ラヴニカ：ギルドの 都」のうごき（名前・コスト・P/T は skel.js、文は docs/SET7.md）
import { T, cr, hit, mine, theirs, isCr, chosen1, regrow, foeBest, shrink, killIt, exileIt, bolt, isSpellDef, battalion, gyCount, lowestKeep, spectacle } from './kit.js';

// 印鑑：出たとき 1まい 引く。タップで ギルドの 2色の どちらかの マナ
const signet = (cols) => ({ mana: [...cols], etb: (s, p, E) => { if (p.side === 'P') E.drawCard(s); } });
// 魔除け：1つ えらぶ。AI は いちばん 点の 高い モード（第6弾と 同じ）
const charm = (modes) => ({
  modes: modes.map((m) => ({ label: m.label, tgt: m.tgt, apply: m.apply })),
  play: (s, E, ctx) => modes.map((m) => m.ai?.(s, E, ctx)).filter((v) => v && v.score > 0).sort((a, b) => b.score - a.score)[0] || null,
});
const TK = {
  bird: cr('t_bird', '鳥（とり）', null, 'W', 0, 1, 1, ['bird'], ['flying']),
  knight: cr('t_knightV', '騎士（きし）', null, 'W', 0, 2, 2, ['knight'], ['vigilance']),
};
// 居住：あなたの トークンで いちばん つよい ものと 同じ トークンを 1体
export function populate(s, E, side = 'P') {
  const t = E.creatures(s, side).filter((p) => p.token).sort((a, b) => E.power(s, b) - E.power(s, a) || E.pt(s, b)[1] - E.pt(s, a)[1])[0];
  if (!t) return null;
  E.L(s, `きょじゅう：${t.def.name}`);
  return E.token(s, side, t.def)[0];
}
const hasToken = (s, E) => mine(s, E).some((p) => p.token);
// 留置：タップして、つぎの アンタップを しない（攻撃も ブロックも できない）
export function detain(s, E, t) {
  if (!t || !E.onBf(s, t)) return;
  t.tapped = true; t.frozen = true;
  E.L(s, `りゅうち：${t.def.name}`);
}
// 留置する てき：いちばん パワーの 大きい、まだ 留置されて いない もの
const detainTarget = (s, E) => theirs(s, E).filter((p) => !p.frozen && !s.floor.untargetable?.(s, p, E)).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
// 絢爛 N：この ターンに 敵が ダメージを うけて いれば N マナ 安い
// 暴動：人は 出す 前に 画面で えらぶ（chosen）。AI は じゃまな ブロッカーが いなければ 速攻
const riot = (x = {}) => ({
  riot: true, ...x,
  etb: (s, p, E, o) => {
    let c = chosen1(o);
    if (c == null) {
      const [, tou] = E.pt(s, p);
      const wall = theirs(s, E).some((q) => !q.tapped && E.power(s, q) >= tou);
      c = s.active === 'P' && p.side === 'P' && !wall ? 'haste' : 'ctr';
    }
    if (c === 'haste') { E.pump(p, 0, 0, ['haste']); E.L(s, `ぼうどう：${p.def.name} は そっこう`); } else { E.addCounters(s, p, 1); E.L(s, `ぼうどう：${p.def.name} に ＋1/＋1カウンター`); }
  },
});
const gyCr = (s) => gyCount(s, 'creature');
const drain = (s, E, n) => { E.hitEnemy(s, n, null); E.gain(s, n); };

export const S9 = {
  // ---- 印鑑 ----
  RV01: signet('RW'), RV06: signet('GW'), RV11: signet('GU'), RV16: signet('UR'), RV21: signet('KG'),
  RV26: signet('WU'), RV31: signet('KR'), RV36: signet('WK'), RV41: signet('RG'), RV46: signet('UK'),

  // ---- ボロス ----
  RV02: {}, // 空騎士の 軍団兵（飛行・速攻は skel の kw）
  RV03: { upkeep: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', T.goblinHaste); } },
  RV04: bolt(3, (s, E) => E.gain(s, 3)),
  RV05: {
    kw: ['vigilance', 'haste'],
    onAttack: (s, p, E, atk) => { if (!battalion(atk)) return; for (const q of mine(s, E)) E.pump(q, 1, 1); E.L(s, 'だいたい：オレリアで みんな ＋1/＋1'); },
  },

  // ---- セレズニア ----
  RV07: { play: (s, E) => ({ score: 7, run: () => { E.token(s, 'P', TK.bird); populate(s, E); } }) },
  RV08: { upkeep: (s, p, E) => { if (p.side === 'P') populate(s, E); }, permScore: (s, E) => (hasToken(s, E) ? 8 : 4) },
  RV09: charm([
    { label: 'パワー5いじょうの てきを 1体 ついほう', tgt: [{ side: 'E', label: 'ついほうする クリーチャー', filter: (s, E, p) => E.power(s, p) >= 5 }], ai: (s, E) => { const b = foeBest(s, E, 99, (p) => E.power(s, p) >= 5); return b && { score: 8 + b.score, run: () => exileIt(s, E, b.t) }; }, apply: (s, E, [[t]]) => exileIt(s, E, t) },
    { label: '2/2の 騎士（きし）を 1体', ai: () => ({ score: 5, run: () => undefined }), apply: (s, E) => E.token(s, 'P', TK.knight) },
    { label: 'じぶんの 1体に ＋2/＋2 と トランプル', tgt: [{ side: 'P', label: '＋2/＋2 する クリーチャー' }], ai: (s, E, ctx) => { const t = ctx.phase === 1 && E.bestBuffTarget(s, null, { ready: true }); return t && { score: 4, run: () => E.pump(t, 2, 2, ['trample']) }; }, apply: (s, E, [[t]]) => { E.target(s, t); E.pump(t, 2, 2, ['trample']); } },
  ]),
  RV10: {
    onOtherEnter: (s, p, q, E) => { if (p.side === 'P' && E.isCreature(q)) { const n = E.pt(s, q)[1]; if (n > 0) { E.gain(s, n); E.L(s, `トロスターニ：タフネス ${n} で ライフ ＋${n}`); } } },
    acts: [{ cost: 4, req: ['G', 'W'], tap: true, when: [1, 2], label: 'きょじゅう する', play: (s, p, E) => (hasToken(s, E) ? { score: 5, run: () => populate(s, E) } : null) }],
  },

  // ---- シミック ----
  RV12: { kw: ['evolve'] },
  RV13: { acts: [{ cost: 4, req: ['G', 'U'], adapt: 2, when: [1, 2], play: (s, p, E) => (p.ctr === 0 ? { score: 5, run: () => E.addCounters(s, p, 2) } : null) }] },
  RV14: charm([
    { label: 'じぶんの 1体に ＋3/＋3', tgt: [{ side: 'P', label: '＋3/＋3 する クリーチャー' }], ai: (s, E, ctx) => { const t = ctx.phase === 1 && E.bestBuffTarget(s, null, { ready: true }); return t && { score: 4, run: () => E.pump(t, 3, 3) }; }, apply: (s, E, [[t]]) => { E.target(s, t); E.pump(t, 3, 3); } },
    { label: 'てきの 1体を てふだに もどす', tgt: [{ side: 'E', label: 'もどす クリーチャー（てきは やまふだの 上へ）' }], ai: (s, E) => { const b = foeBest(s, E); return b && E.power(s, b.t) >= 3 && { score: 4 + b.score, run: () => { if (E.onBf(s, b.t)) E.bounce(s, b.t); E.sba(s); } }; }, apply: (s, E, [[t]]) => { if (t && E.onBf(s, t)) E.bounce(s, t); E.sba(s); } },
    { label: 'カードを 1まい 引く', ai: (s, E, ctx) => (ctx.phase === 2 ? { score: 3, run: () => E.drawCard(s) } : null), apply: (s, E) => E.drawCard(s) },
  ]),
  RV15: {
    acts: [{
      cost: 0, tap: true, when: [1, 2], label: '＋1/＋1カウンターを 2ばいに',
      play: (s, p, E) => { const t = mine(s, E).filter((q) => q.ctr > 0).sort((a, b) => b.ctr - a.ctr)[0]; return t ? { score: 3 + t.ctr * 2, run: () => { E.L(s, `ヴォレル：${t.ctr} × 2 ＝ ${t.ctr * 2}`); E.addCounters(s, t, t.ctr); } } : null; },
      tgt: [{ side: 'P', label: 'カウンターを 2ばいに する クリーチャー', filter: (s, E, q) => q.ctr > 0 }],
      apply: (s, E, [[t]]) => { if (t && E.onBf(s, t)) { E.L(s, `ヴォレル：${t.ctr} × 2 ＝ ${t.ctr * 2}`); E.addCounters(s, t, t.ctr); } },
    }],
  },

  // ---- イゼット ----
  RV17: { onCast: (s, p, d, E) => { if (p.side === 'P' && isSpellDef(d)) E.pump(p, 2, 0); } },
  RV18: { costCut: (s, q, d) => (isSpellDef(d) ? 1 : 0) },
  RV19: charm([
    { label: 'てきの 1体に 2点', tgt: [{ side: 'E', label: '2点を あたえる クリーチャー' }], ai: (s, E) => { const b = foeBest(s, E, 2); return b && { score: 6 + b.score, run: () => hit(s, E, b.t, 2) }; }, apply: (s, E, [[t]]) => hit(s, E, t, 2) },
    { label: 'てき（本体（ほんたい））に 2点', ai: (s, E) => { const b = E.burnTarget(s, 2); return b?.t === 'face' && { score: 5 + b.score, run: () => E.hitEnemy(s, 2, null) }; }, apply: (s, E) => E.hitEnemy(s, 2, null) },
    { label: '2まい 引いて 1まい すてる', ai: (s, E, ctx) => (ctx.phase === 2 ? { score: 4, run: () => loot(s, E) } : null), apply: (s, E) => loot(s, E) },
  ]),
  RV20: {
    onDraw: (s, p, E) => { if (p.side === 'P') E.hitEnemy(s, 1, p); },
    acts: [{ cost: 0, tap: true, when: [1, 2], label: 'カードを 1まい 引く', play: (s, p, E) => ({ score: 5, run: () => E.drawCard(s) }) }],
  },

  // ---- ゴルガリ ----
  RV22: { etb: (s, p, E) => { if (p.side !== 'P') return; const n = gyCr(s); if (n) { E.gain(s, n); E.L(s, `しゅっこん：ぼちの クリーチャー ${n}まいで ライフ ＋${n}`); } } },
  RV23: { etb: (s, p, E) => { if (p.side !== 'P') return; const n = gyCr(s); if (n) E.addCounters(s, p, n); } },
  RV24: charm([
    { label: 'てき ぜんぶ −1/−1', ai: (s, E) => { const n = theirs(s, E).filter((p) => E.pt(s, p)[1] - p.dmg <= 1).length; return n && { score: 4 + 4 * n, run: () => { for (const t of theirs(s, E)) E.pump(t, -1, -1); E.sba(s); } }; }, apply: (s, E) => { for (const t of theirs(s, E)) E.pump(t, -1, -1); E.sba(s); } },
    { label: 'ぼちの クリーチャーを 1まい てふだに', ai: (s, E) => (s.P.gy.some((c) => isCr(c.def)) ? { score: 4, run: () => regrow(s, E, isCr) } : null), apply: (s, E) => regrow(s, E, isCr) },
    { label: 'てきの 1体を −2/−2', tgt: [{ side: 'E', label: '−2/−2 する クリーチャー' }], ai: (s, E) => { const b = foeBest(s, E, 2); return b && { score: 6 + b.score, run: () => shrink(s, E, b.t, 2) }; }, apply: (s, E, [[t]]) => shrink(s, E, t, 2) },
  ]),
  RV25: { pow: (s, p) => 2 + (p.side === 'P' ? gyCr(s) : 0), tou: (s, p) => 2 + (p.side === 'P' ? gyCr(s) : 0) },

  // ---- アゾリウス ----
  RV27: {
    tgt: [{ side: 'E', label: 'りゅうち する クリーチャー' }],
    etb: (s, p, E, o) => { if (p.side !== 'P') return; const t = chosen1(o); detain(s, E, t === undefined ? detainTarget(s, E) : t); },
  },
  RV28: {
    play: (s, E, ctx) => { const x = Math.min(ctx.xMax ?? 0, 4); return x >= 1 && ctx.phase === 2 ? { score: 3 + 3 * x, x, run: (xx) => { E.gain(s, xx); E.drawCard(s, xx); } } : null; },
  },
  RV29: charm([
    { label: 'じぶんの クリーチャーに 絆魂（はんこん）', ai: () => null, apply: (s, E) => { for (const q of mine(s, E)) E.pump(q, 0, 0, ['lifelink']); } },
    { label: 'カードを 1まい 引く', ai: (s, E, ctx) => (ctx.phase === 2 ? { score: 3, run: () => E.drawCard(s) } : null), apply: (s, E) => E.drawCard(s) },
    { label: 'てきの 1体を りゅうち', tgt: [{ side: 'E', label: 'りゅうち する クリーチャー' }], ai: (s, E, ctx) => { const t = ctx.phase === 1 && detainTarget(s, E); return t && E.power(s, t) >= 2 && { score: 3 + E.power(s, t), run: () => detain(s, E, t) }; }, apply: (s, E, [[t]]) => detain(s, E, t) },
  ]),
  RV30: { etb: (s, p, E) => { if (p.side !== 'P') return; for (const t of theirs(s, E)) detain(s, E, t); } },

  // ---- ラクドス ----
  RV32: spectacle(2),
  RV33: { ...bolt(3), ...spectacle(2) },
  RV34: charm([
    { label: 'てきの 1体に 2点', tgt: [{ side: 'E', label: '2点を あたえる クリーチャー' }], ai: (s, E) => { const b = foeBest(s, E, 2); return b && { score: 6 + b.score, run: () => hit(s, E, b.t, 2) }; }, apply: (s, E, [[t]]) => hit(s, E, t, 2) },
    { label: 'てき（本体（ほんたい））に 2点', ai: (s, E) => { const b = E.burnTarget(s, 2); return b?.t === 'face' && { score: 5 + b.score, run: () => E.hitEnemy(s, 2, null) }; }, apply: (s, E) => E.hitEnemy(s, 2, null) },
    { label: 'じぶんの クリーチャー ぜんぶ ＋1/＋0', ai: () => null, apply: (s, E) => { for (const q of mine(s, E)) E.pump(q, 1, 0); } },
  ]),
  RV35: {
    etb: (s, p, E) => {
      if (p.side !== 'P') return;
      for (const t of [...theirs(s, E)]) {
        const n = E.rollDie(s);
        if (n % 2 === 1) { E.L(s, `${n} は きすう：${t.def.name} を はかい`); killIt(s, E, t); } else E.L(s, `${n} は ぐうすう：${t.def.name} は のこる`);
      }
    },
  },

  // ---- オルゾフ ----
  RV37: { kw: ['extort'] },
  RV38: { afterlife: 2 },
  RV39: charm([
    { label: 'パワー2いかの てきを 1体 はかい', tgt: [{ side: 'E', label: 'はかいする クリーチャー', filter: (s, E, p) => E.power(s, p) <= 2 }], ai: (s, E) => { const b = foeBest(s, E, 99, (p) => E.power(s, p) <= 2); return b && { score: 6 + b.score, run: () => killIt(s, E, b.t) }; }, apply: (s, E, [[t]]) => killIt(s, E, t) },
    { label: 'てきに 2点、ライフ ＋2', ai: (s, E) => (s.floor.faceValue ? { score: 4 + s.floor.faceValue(s, 2, E) / 2, run: () => drain(s, E, 2) } : null), apply: (s, E) => drain(s, E, 2) },
    { label: '1まい 引いて ライフ −1', ai: (s, E, ctx) => (ctx.phase === 2 && s.P.life > 6 ? { score: 3, run: () => { E.drawCard(s); E.hurt(s, 1); } } : null), apply: (s, E) => { E.drawCard(s); E.hurt(s, 1); } },
  ]),
  RV40: { onOtherLeave: (s, p, q, E, o) => { if (o?.died && q.side === p.side && q !== p && E.isCreature(q)) E.token(s, p.side, T.spirit); } },

  // ---- グルール ----
  RV42: riot(),
  RV43: riot({ kw: ['trample'] }),
  RV44: charm([
    { label: '飛行（ひこう）の てき ぜんぶに 3点', ai: (s, E) => { const n = theirs(s, E).filter((p) => E.hasKw(s, p, 'flying')).length; return n && { score: 4 + 4 * n, run: () => flyers3(s, E) }; }, apply: (s, E) => flyers3(s, E) },
    { label: 'じぶんの クリーチャー ぜんぶ ＋1/＋0 と トランプル', ai: () => null, apply: (s, E) => { for (const q of mine(s, E)) E.pump(q, 1, 0, ['trample']); } },
    { label: 'てきの 1体に 2点', tgt: [{ side: 'E', label: '2点を あたえる クリーチャー' }], ai: (s, E) => { const b = foeBest(s, E, 2); return b && { score: 6 + b.score, run: () => hit(s, E, b.t, 2) }; }, apply: (s, E, [[t]]) => hit(s, E, t, 2) },
  ]),
  RV45: {
    acts: [{
      cost: 0, when: [1, 2], label: 'きほんカードを すてて 3点',
      can: (s) => s.P.hand.some((c) => c.def.basic), cantWhy: 'てふだに きほんカードが ない',
      play: (s, p, E) => { if (!s.P.hand.some((c) => c.def.basic)) return null; const b = E.burnTarget(s, 3); return b ? { score: 4 + b.score, run: () => { dropBasic(s, E); hit(s, E, b.t, 3); } } : null; },
      tgt: [{ side: 'E', face: true, label: '3点を あたえる 相手' }],
      apply: (s, E, [[t]]) => { dropBasic(s, E); hit(s, E, t, 3); },
    }],
  },

  // ---- ディミーア ----
  RV47: { etb: (s, p, E) => (p.side === 'P' ? E.surveil(s, 2) : undefined) },
  RV48: { play: (s, E, ctx) => (s.P.life > 6 ? { score: 7 - (ctx.phase === 1 ? 1 : 0), run: () => E.then(E.surveil(s, 2), () => { E.drawCard(s, 2); E.hurt(s, 2); }) } : null) },
  RV49: charm([
    { label: 'パワー2いかの てきを 1体 はかい', tgt: [{ side: 'E', label: 'はかいする クリーチャー', filter: (s, E, p) => E.power(s, p) <= 2 }], ai: (s, E) => { const b = foeBest(s, E, 99, (p) => E.power(s, p) <= 2); return b && { score: 6 + b.score, run: () => killIt(s, E, b.t) }; }, apply: (s, E, [[t]]) => killIt(s, E, t) },
    { label: 'ちょうほう2 を して 1まい 引く', ai: (s, E, ctx) => (ctx.phase === 2 ? { score: 4, run: () => E.then(E.surveil(s, 2), () => E.drawCard(s)) } : null), apply: (s, E) => E.then(E.surveil(s, 2), () => E.drawCard(s)) },
    { label: 'てきの 1体を てふだに もどす', tgt: [{ side: 'E', label: 'もどす クリーチャー（てきは やまふだの 上へ）' }], ai: (s, E) => { const b = foeBest(s, E); return b && E.power(s, b.t) >= 3 && { score: 4 + b.score, run: () => { if (E.onBf(s, b.t)) E.bounce(s, b.t); E.sba(s); } }; }, apply: (s, E, [[t]]) => { if (t && E.onBf(s, t)) E.bounce(s, t); E.sba(s); } },
  ]),
  RV50: {
    etb: (s, p, E) => (p.side === 'P' ? E.surveil(s, 1) : undefined),
    acts: [{
      cost: 1, req: ['U', 'K'], when: [1, 2], label: 'ぼちの いちばん つよい クリーチャーの すがたに',
      play: (s, p, E) => { const c = bestGyCr(s); return c && (c.def.pow ?? 0) > E.power(s, p) ? { score: 2 + (c.def.pow - E.power(s, p)), run: () => lazav(s, p, E) } : null; },
    }],
  },
};

function loot(s, E) { E.drawCard(s, 2); const c = lowestKeep(s, E); if (c) E.discard(s, [c]); }
function flyers3(s, E) { for (const t of theirs(s, E).filter((p) => E.hasKw(s, p, 'flying'))) E.damage(s, t, 3, null); E.sba(s); }
function dropBasic(s, E) { const c = s.P.hand.find((h) => h.def.basic); if (c) E.discard(s, [c]); }
const bestGyCr = (s) => s.P.gy.filter((c) => isCr(c.def) && typeof c.def.pow === 'number').sort((a, b) => b.def.pow - a.def.pow)[0];
function lazav(s, p, E) { const c = bestGyCr(s); if (!c) return; p.setPT = [c.def.pow, c.def.tou]; E.L(s, `ラザーヴ：${c.def.name}（${c.def.pow}/${c.def.tou}）の すがたに`); }
