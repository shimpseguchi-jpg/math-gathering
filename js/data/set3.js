// 第3弾「冥界の 門」のうごき（名前・コスト・P/T は skel.js、文は docs/SET3.md）
import {
  T, hit, mine, theirs, isSub, saga, bestIn, lowestKeep, isCr, chosen1, regrow, dig, foeBest, shrink, foe1, bolt, killIt, edict, fodder, devour,
  delve, godUnless, gyCount, cr, spectacle,
} from './kit.js';

const minus1 = (s, E, t, n = 1) => { if (t && E.onBf(s, t)) { E.addMinus(s, t, n); E.sba(s); } };
const drain = (s, E, n, src = null) => { E.hitEnemy(s, n, src); E.gain(s, n); };
// −1/−1カウンターを ばらまく ときに、あいての いちばん 小さい クリーチャー
const weakest = (s, E) => theirs(s, E).filter((p) => !s.floor.untargetable?.(s, p, E)).sort((a, b) => E.need(s, a) - E.need(s, b))[0];
const isBlack = (d) => (d.color || '').includes('K');
// 忍術：攻撃できる なかまが いる ときは 手札に のこして、攻撃の とちゅうで 入れかえる
const ninjutsu = (cost, req) => ({ ninjutsu: { cost, req }, permScore: (s, E, ctx) => (ctx.phase === 1 && E.readyAttackers(s).length ? null : 12) });
// X の 呪文：いちばん 小さい X で たおせる 敵
const smallestX = (s, E, ctx, f) => { for (let x = 1; x <= ctx.xMax; x++) { const r = f(x); if (r) return { ...r, x }; } return null; };
// 来世の かわりに 同じ 名前の 1/1（悪夢の 番人）
const shepherd = (s, q, E) => {
  const i = s.P.gy.findIndex((c) => c.uid === q.uid); if (i < 0) return;
  const [c] = s.P.gy.splice(i, 1); s.P.exile.push(c);
  E.token(s, 'P', { ...c.def, pow: 1, tou: 1, rar: null, levels: null });
};

// ---- 5色に する 追加（3.7） ----
// 降霊：墓地から うらの すがた（スピリット）で 唱えられる。うらの すがたは 墓地の かわりに 追放
const ghost = (id, name, rar, cost, pow, tou, kw, text, x = {}) => ({
  ...cr(`${id}D`, name, rar, 'W', cost, pow, tou, ['spirit'], kw), exileOnLeave: true, typeOver: 'クリーチャー — スピリット（降霊（こうれい））', textOver: text, ...x,
});
const disturb = (cost, back) => ({ disturb: { cost, req: ['W'], back } });
const gain1 = { onOtherEnter: (s, p, q, E) => { if (p.side === 'P' && q.side === 'P' && E.isCreature(q)) E.gain(s, 1); } };
const kindred = (s, E, side) => E.creatures(s, side).filter((q) => ['spirit', 'cleric', 'human'].some((t) => isSub(q, t))).length;
// 切削してもよい：やまふだが 少ない ときは しない（つくりなおすと ライフが へる）
const millMay = (s, E, n) => { if (s.P.lib.length >= n + 4) E.mill(s, n); };
const isSpellD = (d) => d.types.includes('instant') || d.types.includes('sorcery');
// 絢爛の 呪文：さきに 攻撃して ダメージを 入れてから（あとの メインで）唱える
const later = (s, E, ctx) => ctx.phase === 1 && !ctx.human && !E.dmgThisTurn(s);
const elemU = cr('t_elemU', 'エレメンタル', null, 'U', 0, 2, 1, ['elemental']);
const harpy = cr('t_harpy', 'ハーピー', null, 'K', 0, 1, 1, ['harpy'], ['flying']);
// 青銅の 血の プルフォロス：手札の 赤の クリーチャーを 出して、ターンの おわりに 墓地へ
const sneak = (s, p, E, c) => { s.P.hand.splice(s.P.hand.indexOf(c), 1); const q = E.enter(s, 'P', c.def, { card: c.def }); if (q) { q.sneakBy = p.uid; q.sneakT = s.turn; } };
const insectG = cr('t_insectG', '昆虫（こんちゅう）', null, 'G', 0, 1, 1, ['insect']);
const beast44 = cr('t_beast44', 'ビースト', null, 'G', 0, 4, 4, ['beast']);

export const S3 = {
  // ---- 黒 ----
  K03: { etb: (s, p, E) => { if (p.side === 'P') regrow(s, E, isCr); } },
  K04: foe1('−2/−2 する クリーチャー', (s, E, t) => shrink(s, E, t, 2), { n: 2 }),
  K05: foe1('−4/−4 する クリーチャー', (s, E, t) => shrink(s, E, t, 4), { n: 4 }),
  K06: { etb: (s, p, E) => { const n = E.devotion(s, 'K', p.side); if (p.side === 'P') drain(s, E, n, p); } },
  K07: {
    tgt: [{ side: 'P', min: 0, label: '−1/−1カウンターを 2こ おく 自分の クリーチャー（えらばなければ これに）' }],
    etb: (s, p, E, o) => { const t = chosen1(o) || p; minus1(s, E, t, 2); },
  },
  K08: { afterlife: 1 },
  K09: delve(),
  K10: { costLess: (s, E) => (E.delirium(s) ? 2 : 0) },
  K11: { ...bolt(3, (s, E) => E.gain(s, 3)), madness: { cost: 1, req: ['K'] } },
  K12: {
    play: (s, E) => {
      const f = fodder(s, E)[0], b = foeBest(s, E);
      return f && b && b.score >= 3 ? { score: 4 + b.score, run: () => { E.leave(s, f, 'gy', { died: true }); killIt(s, E, b.t); } } : null;
    },
    tgt: [{ side: 'P', label: 'ぼちに おく 自分の クリーチャー' }, { side: 'E', label: 'はかいする クリーチャー' }],
    apply: (s, E, [[f], [t]]) => { E.leave(s, f, 'gy', { died: true }); killIt(s, E, t); },
  },
  K13: foe1('はかいする クリーチャー', killIt),
  K14: { etb: (s, p, E) => { if (p.side === 'P') { E.hitEnemy(s, 1, p); E.hurt(s, 1); } } },
  K15: {
    kwSet: [], kwFn: (s, p) => (p.flags.turn.canAtk ? [] : ['defender']),
    acts: [{ cost: 3, req: ['K'], when: [1], label: 'この ターン こうげきできる', play: (s, p) => (!p.flags.turn.canAtk && !p.sick && !p.tapped ? { score: 4, run: () => { p.flags.turn.canAtk = true; } } : null) }],
  },
  K16: devour(1),
  K17: {
    play: (s, E) => ({ score: 8, run: () => E.token(s, 'P', T.zombie, 2) }),
    flashback: { cost: 6, req: ['K'] },
  },
  K19: { tgt: [{ side: 'E', label: 'はかいする クリーチャー' }], etb: (s, p, E, o) => { if (p.side !== 'P') return; const t = chosen1(o); killIt(s, E, t === undefined ? foeBest(s, E)?.t : t); } },
  K20: { onMinus: (s, p, E, t, n) => E.token(s, 'P', T.insect, n) },
  K21: { madness: { cost: 1, req: ['K'] } },
  K22: delve(),
  K23: { play: (s, E) => (theirs(s, E).length ? { score: 7, run: () => edict(s, E) } : null) },
  K24: { afterlife: 2 },
  K25: {
    play: (s, E) => {
      const ts = theirs(s, E); const k = ts.filter((p) => E.need(s, p) <= 1).length;
      return ts.length >= 2 || k ? { score: 3 + ts.length + 4 * k, run: () => { for (const t of theirs(s, E)) E.addMinus(s, t, 1); E.sba(s); } } : null;
    },
  },
  K26: { pow: (s, p, E) => 2 + (E.delirium(s) ? 2 : 0), tou: (s, p, E) => 1 + (E.delirium(s) ? 1 : 0) },
  K27: saga([
    { run: (s, E) => edict(s, E) },
    { run: (s, E) => { const g = bestIn(s.P.gy, (c) => !c.def.basic); const h = lowestKeep(s, E); if (g && h && E.keepValue(s, h) < E.keepValue(s, g)) { E.discard(s, [h]); regrow(s, E, () => true, h); } } },
    { run: (s, E) => { const c = bestIn([...s.P.gy, ...s.E.gy.filter((x) => x.def.rar && !x.def.factory)], (x) => isCr(x.def)); if (!c) return; const g = s.P.gy.includes(c) ? s.P.gy : s.E.gy; g.splice(g.indexOf(c), 1); E.enter(s, 'P', c.def, { card: c.def }); } }, // III：あなたか 敵の 墓地から
  ]),
  K28: { onKill: (s, p, E) => E.addCounters(s, p, 1) },
  K29: {
    play: (s, E, ctx) => {
      let best = null;
      for (let x = 1; x <= ctx.xMax; x++) {
        const gain = theirs(s, E).filter((p) => E.need(s, p) <= x).reduce((t, p) => t + 3 + (s.floor.priority(s, p, E) || 0), 0);
        const loss = mine(s, E).filter((p) => E.need(s, p) <= x).reduce((t, p) => t + 2 + E.power(s, p), 0);
        if (gain - loss > 4 && (!best || gain - loss > best.v)) best = { v: gain - loss, x };
      }
      return best && { score: best.v, x: best.x, run: (x) => { for (const p of [...s.E.bf, ...s.P.bf]) if (E.isCreature(p)) E.addMinus(s, p, x); E.sba(s); } };
    },
  },
  K30: { onDiscard: (s, p, E, n) => { for (let i = 0; i < n; i++) for (const t of theirs(s, E)) E.addMinus(s, t, 1); E.sba(s); } },
  K31: { onOtherLeave: (s, p, q, E, o) => { if (o.died && q.side === 'P' && p.side === 'P' && !q.token && E.isCreature(q)) shepherd(s, q, E); } },
  K32: {
    ...delve(),
    acts: [{
      cost: 0, when: [1, 2], label: 'ぼちの 2まいを 追放：−2/−2', can: (s) => s.P.gy.length >= 2, cantWhy: 'ぼちに 2まい いる',
      play: (s, p, E) => { const b = foeBest(s, E, 2); return b ? { score: 4 + b.score, run: () => { s.P.exile.push(...s.P.gy.splice(0, 2)); shrink(s, E, b.t, 2); } } : null; },
      tgt: [{ side: 'any', label: '−2/−2 する クリーチャー' }], apply: (s, E, [[t]]) => { s.P.exile.push(...s.P.gy.splice(0, 2)); shrink(s, E, t, 2); },
    }],
  },
  K33: saga([
    { run: (s, E) => { E.mill(s, 3); const c = bestIn(s.P.gy, (x) => isCr(x.def) || x.def.types.includes('enchantment')); if (c) { s.P.gy.splice(s.P.gy.indexOf(c), 1); s.P.exile.push(c); E.token(s, 'P', T.zombie); } } },
    { run: (s, E) => { E.mill(s, 3); const c = bestIn(s.P.gy, (x) => isCr(x.def) || x.def.types.includes('enchantment')); if (c) { s.P.gy.splice(s.P.gy.indexOf(c), 1); s.P.exile.push(c); E.token(s, 'P', T.zombie); } } },
    { run: (s, E) => { const x = mine(s, E).filter((q) => isSub(q, 'zombie')).length; E.gain(s, x); return x ? E.scry(s, x) : undefined; } },
  ]),
  K34: { kw: ['extort'], onExtort: (s, p, E) => E.hitEnemy(s, 1, p) },
  K35: {
    ...delve(),
    acts: [{ cost: 3, req: ['K'], when: [2], label: '2まい ぼちへ、1まい てふだへ', play: (s, p, E) => (!p.flags.turn.used ? { score: 3, run: () => { p.flags.turn.used = true; E.mill(s, 2); regrow(s, E); } } : null) }],
  },
  K36: {
    etb: (s, p, E) => { if (p.side === 'P') drain(s, E, 1, p); },
    onOtherEnter: (s, p, q, E) => { if (q.side === 'P' && p.side === 'P' && E.isCreature(q) && isBlack(q.def)) drain(s, E, 1, p); },
  },
  K37: {
    etb: (s, p, E) => { if (p.side !== 'P') return; for (const t of theirs(s, E)) E.pump(t, -2, -2); E.sba(s); },
    onOtherLeave: (s, p, q, E, o) => { if (p.side === 'P' && q.side === 'E' && o.died && E.isCreature(q)) E.hitEnemy(s, 2, p); },
  },
  // ---- 黒の 2色 ----
  WK01: { kw: ['extort'] },
  WK02: { afterlife: 1 },
  WK03: { doubleDeath: true, grant: (s, q, p) => (p.token ? ['vigilance', 'lifelink'] : null) },
  WK04: {
    onOtherLeave: (s, p, q, E, o) => {
      if (!o.died || q.side !== p.side || p.side !== 'P' || q.token || !E.isCreature(q) || p.flags.turn.used) return;
      const i = s.P.gy.findIndex((c) => c.uid === q.uid); if (i < 0) return;
      p.flags.turn.used = true; s.P.hand.push(...s.P.gy.splice(i, 1)); E.L(s, `てふだに もどした：${q.def.name}`);
    },
  },
  UK01: { ...ninjutsu(2, ['U', 'K']), onAllyHit: (s, p, src, E) => { if (isSub(src, 'ninja')) E.addCounters(s, src, 1); } },
  UK02: {
    etb: (s, p, E) => { if (p.side === 'P') E.mill(s, 2); },
    pow: (s, p, E) => 2 + (E.delirium(s) ? 2 : 0), tou: (s, p, E) => 2 + (E.delirium(s) ? 2 : 0), kwFn: (s, p, E) => (E.delirium(s) ? ['flying'] : []),
  },
  UK03: { ...ninjutsu(6, ['U', 'K']), trigTgt: { on: 'hit', label: 'はかいする てきの クリーチャー' }, onCombatHit: (s, p, E) => killIt(s, E, E.takePick(s, p) || foeBest(s, E)?.t) },
  UK04: { upkeep: (s, p, E) => { E.mill(s, 2); }, anthem: (s, q, p, E) => (E.delirium(s) && E.isCreature(p) ? [1, 0] : null) },
  KR01: devour(1, (s, p, E, k) => { if (k && p.side === 'P') E.hitEnemy(s, 2 * k, p); }),
  KR02: { onDiscard: (s, p, E, n) => E.pump(p, n, 0), madness: { cost: 2, req: ['K', 'R'] } },
  KR03: { need: (s, E) => E.dmgThisTurn(s) > 0, costCut: (s, q, d, E) => (isCr(d) ? E.dmgThisTurn(s) : 0) },
  KR04: { upkeep: (s, p, E) => { E.hitEnemy(s, 2, p); } },
  KG01: {
    etb: (s, p) => { p.mctr = 2; },
    acts: [{ cost: 2, req: ['G'], when: [1, 2], label: '−1/−1カウンターを 1こ とる', can: (s, p) => (p.mctr || 0) > 0, play: (s, p) => ((p.mctr || 0) > 0 ? { score: 5, run: () => { p.mctr--; } } : null) }],
  },
  KG02: { etb: (s, p, E) => { if (p.side === 'P') regrow(s, E, (d) => !d.types.includes('instant') && !d.types.includes('sorcery')); } },
  KG03: {
    trigTgt: { on: 'hit', label: '−1/−1カウンターを おく てきの クリーチャー' },
    onCombatHit: (s, p, E) => minus1(s, E, E.takePick(s, p) || weakest(s, E)),
    onMinus: (s, p, E) => { if (!p.flags.turn.snake) { p.flags.turn.snake = true; E.token(s, 'P', T.snake); } },
  },
  KG04: {
    acts: [{
      cost: 2, req: ['K'], when: [1, 2], label: 'ぼちの クリーチャー 1まいを 追放：ヘビ', can: (s) => gyCount(s, 'creature') > 0, cantWhy: 'ぼちに クリーチャーが いない',
      play: (s, p, E) => (gyCount(s, 'creature') ? { score: 4, run: () => { const c = s.P.gy.find((x) => isCr(x.def)); s.P.gy.splice(s.P.gy.indexOf(c), 1); s.P.exile.push(c); E.token(s, 'P', T.snake); } } : null),
    }],
  },
  // ---- 無色 ----
  C17: { acts: [{ cost: 0, tap: true, when: [2], label: '1まい ぼちへ', play: (s, p, E) => (s.P.lib.length > 5 ? { score: 1, run: () => E.mill(s, 1) } : null) }] },
  C19: { onDie: (s, p, E) => { if (p.side === 'P') regrow(s, E, (d) => d.types.includes('artifact') && d.id !== 'C19'); } },
  C20: { acts: [{ cost: 2, tap: true, when: [2], label: '1まい 引いて 1まい すてる', play: (s, p, E) => ({ score: 2, run: () => { E.drawCard(s); const c = lowestKeep(s, E); if (c) E.discard(s, [c]); } }) }] },
  C21: {
    tgt: [{ side: 'E', min: 0, filter: (s, E, p) => !p.token, label: '追放して パワーと タフネスを まねる てきの クリーチャー' }],
    pow: (s, p) => p.copyPT?.[0] ?? 2, tou: (s, p) => p.copyPT?.[1] ?? 4,
    etb: (s, p, E, o) => {
      if (p.side !== 'P') return;
      let t = chosen1(o);
      if (t === undefined) t = foeBest(s, E, 99, (q) => !q.token && E.power(s, q) >= 3)?.t;
      if (!t || !E.onBf(s, t)) return;
      const [a, b] = E.pt(s, t);
      if (E.exile(s, t)) { p.copyPT = [Math.max(0, a), Math.max(1, b)]; E.L(s, `${p.def.name} は ${a}/${b} に なった`); }
      E.sba(s);
    },
  },
  // ---- ほかの 色の 手助け ----
  W41: { afterlife: 1 },
  W42: { afterlife: 2 },
  U41: { ...ninjutsu(2, ['U']), onCombatHit: (s, p, E) => E.scry(s, 2) },
  U42: { ...delve(), play: (s, E, ctx) => (ctx.phase === 2 ? { score: 8, run: () => dig(s, E, 7, 2) } : null) },
  G41: { etb: (s, p) => { p.mctr = 3; }, mana: 'any', manaN: (p) => ((p.mctr || 0) > 0 ? 1 : 0), onTapped: (s, p) => { if (p.mctr > 0) p.mctr--; } },
  G42: { etb: (s, p, E) => { if (p.side === 'P') regrow(s, E); } },
  R41: { ...bolt(3), madness: { cost: 1, req: ['R'] } },
  R42: devour(3),
  // ---- サイクル ----
  // 信心の レジェンド（2026-10-28 に アモンケットの 門の 五神から かえた。五神は docs/RAID.md 2.4）
  W44: {
    ...godUnless((s, p, E) => E.devotion(s, 'W', p.side) >= 4),
    onGain: (s, p, E) => { if (p.side !== 'P' || (p.flags.turn.gains || 0) >= 3) return; p.flags.turn.gains = (p.flags.turn.gains || 0) + 1; const t = E.bestBuffTarget(s, null); if (t) E.addCounters(s, t, 1); },
    acts: [{
      cost: 2, req: ['W'], when: [1], label: 'ほかの クリーチャーに 絆魂（はんこん）',
      play: (s, p, E) => { const t = mine(s, E).filter((q) => q !== p && !q.sick && !E.hasKw(s, q, 'lifelink')).sort((a, b) => E.power(s, b) - E.power(s, a))[0]; return t && !p.flags.turn.used ? { score: 2 + E.power(s, t), run: () => { p.flags.turn.used = true; E.target(s, t); E.pump(t, 0, 0, ['lifelink']); } } : null; },
      tgt: [{ side: 'P', label: '絆魂（はんこん）を あたえる クリーチャー', filter: (s, E, q) => q.def.id !== 'W44' }], apply: (s, E, [[t]]) => { E.target(s, t); E.pump(t, 0, 0, ['lifelink']); },
    }],
  },
  U44: { etb: (s, p, E) => { if (p.side !== 'P') return; const n = E.devotion(s, 'U', 'P'); E.L(s, `青の 信心（しんじん） ${n}：エレメンタル ${n}体`); E.token(s, 'P', elemU, n); } },
  K40: {
    etb: (s, p, E) => { if (p.side !== 'P') return; const n = E.devotion(s, 'K', 'P'); E.L(s, `黒の 信心（しんじん） ${n}：ハーピー ${n}体`); E.token(s, 'P', harpy, n); },
    upkeep: (s, p, E) => {
      if (p.side !== 'P') return;
      const f = fodder(s, E, p)[0] || mine(s, E).filter((q) => q !== p).sort((a, b) => E.power(s, a) - E.power(s, b))[0];
      E.leave(s, f || p, 'gy', { died: true }); E.sba(s);
    },
  },
  R43: {
    ...godUnless((s, p, E) => E.devotion(s, 'R', p.side) >= 4),
    grant: (s, q, p, E) => (p !== q && E.isCreature(p) ? ['haste'] : null),
    acts: [{
      cost: 2, req: ['R'], when: [1], label: '赤の クリーチャーを てふだから 出す', can: (s) => s.P.hand.some((c) => isCr(c.def) && (c.def.color || '').includes('R')), cantWhy: '手札（てふだ）に 赤の クリーチャーが ない',
      play: (s, p, E) => {
        const c = [...s.P.hand].filter((x) => isCr(x.def) && (x.def.color || '').includes('R') && x.def.cost >= 4).sort((a, b) => b.def.cost - a.def.cost)[0];
        return c ? { score: 3 + c.def.cost, run: () => sneak(s, p, E, c) } : null;
      },
    }],
    endStep: (s, p, E) => { for (const q of [...s.P.bf]) if (q.sneakBy === p.uid && q.sneakT === s.turn) { E.L(s, `${q.def.name} は ぼちへ`); E.leave(s, q, 'gy', { died: true }); } },
  },
  G44: {
    ...godUnless((s, p, E) => E.devotion(s, 'G', p.side) >= 4),
    costCut: (s, q, d) => (isCr(d) ? 1 : 0),
    acts: [{
      cost: 2, req: ['G'], when: [2], label: 'やまふだの 一番上を 見る',
      play: (s, p, E) => (s.P.lib.length && !p.flags.turn.used ? { score: 2, run: () => { p.flags.turn.used = true; const c = s.P.lib[0]; E.L(s, `一番上：${c.def.name}`); if (isCr(c.def)) { s.P.lib.shift(); s.P.hand.push(c); } } } : null),
    }],
  },
  W43: {
    play: (s, E, ctx) => ({ score: 3 + 2 * ctx.xMax, x: ctx.xMax, run: (x) => E.token(s, 'P', T.soldier, x) }),
    modes: [
      { label: '白の 1/1 の 兵士（へいし）を X体 出す', apply: (s, E, picks, x) => E.token(s, 'P', T.soldier, x) },
      { label: 'X の 2ばいの ライフを える', apply: (s, E, picks, x) => E.gain(s, 2 * x) },
    ],
  },
  U43: {
    play: (s, E, ctx) => smallestX(s, E, ctx, (x) => { const b = foeBest(s, E, 99, (p) => E.power(s, p) <= 2 * x); return b && { score: 5 + b.score, run: () => { if (E.onBf(s, b.t)) E.bounce(s, b.t); E.sba(s); } }; })
      || (ctx.phase === 2 ? { score: 2 + ctx.xMax, x: ctx.xMax, run: (x) => dig(s, E, 2 * x, 2) } : null),
    modes: [
      { label: 'やまふだの 上から X の 2ばいの まいすうを 見て、2まいまで てふだに', apply: (s, E, picks, x) => dig(s, E, 2 * x, 2) },
      { label: 'パワーが X の 2ばい いかの てきの クリーチャーを もどす（やまふだの 上へ）', tgt: [{ side: 'E', label: 'もどす クリーチャー' }], apply: (s, E, [[t]], x) => { if (E.onBf(s, t) && E.power(s, t) <= 2 * x) E.bounce(s, t); E.sba(s); } },
    ],
  },
  K38: {
    play: (s, E, ctx) => smallestX(s, E, ctx, (x) => { const b = foeBest(s, E, x); return b && { score: 5 + b.score, run: (xx) => { shrink(s, E, b.t, xx); E.gain(s, xx); } }; })
      || (gyCount(s, 'creature') ? { score: 3, x: ctx.xMax, run: (x) => regrow(s, E, (d) => isCr(d) && d.cost <= 2 * x) } : null),
    modes: [
      { label: 'クリーチャー1体を −X/−X して、X点の ライフを える', tgt: [{ side: 'any', label: '−X/−X する クリーチャー' }], apply: (s, E, [[t]], x) => { shrink(s, E, t, x); E.gain(s, x); } },
      { label: 'ぼちから コストが X の 2ばい いかの クリーチャーを てふだに', apply: (s, E, picks, x) => regrow(s, E, (d) => isCr(d) && d.cost <= 2 * x) },
    ],
  },
  G43: {
    play: (s, E, ctx) => {
      const fl = theirs(s, E).filter((p) => E.hasKw(s, p, 'flying'));
      if (fl.length && ctx.phase === 1) return { score: 4 + 3 * fl.length, x: ctx.xMax, run: (x) => { for (const d of E.divide(s, 2 * x, theirs(s, E).filter((p) => E.hasKw(s, p, 'flying')))) E.damage(s, d.t, d.n, null); E.sba(s); } };
      const nb = E.basicsInLib(s);
      return ctx.phase === 1 && nb ? { score: 3 + 2 * Math.min(ctx.xMax, nb), x: Math.min(ctx.xMax, nb), run: (x) => E.rampBasic(s, x) } : null;
    },
    modes: [
      { label: 'やまふだから きほんカードを X まい さがして マナゾーンに（タップ）', apply: (s, E, picks, x) => E.rampBasic(s, x) },
      { label: 'X の 2ばいの ダメージを ひこうの ある てきに わりふる', apply: (s, E, picks, x) => { for (const d of E.divide(s, 2 * x, theirs(s, E).filter((p) => E.hasKw(s, p, 'flying')))) E.damage(s, d.t, d.n, null); E.sba(s); } },
    ],
  },
  U45: { pow: (s, p, E) => E.devotion(s, 'U', p.side), onOtherEnter: (s, p, q, E) => { if (q.side === 'P' && p.side === 'P' && (q.def.color || '').includes('U')) return E.scry(s, 1); } },
  K42: {
    pow: (s, p, E) => E.devotion(s, 'K', p.side),
    acts: [{
      cost: 2, req: ['K'], when: [2], label: 'ぼちの 2まいまで 追放', can: (s) => s.P.gy.length > 0,
      play: (s, p, E) => (gyCount(s, 'creature') && !p.flags.turn.used ? { score: 2, run: () => { p.flags.turn.used = true; const cs = s.P.gy.filter((c) => isCr(c.def)).slice(0, 2); for (const c of cs) s.P.gy.splice(s.P.gy.indexOf(c), 1); s.P.exile.push(...cs); E.gain(s, cs.length); } } : null),
    }],
  },
  R44: {
    pow: (s, p, E) => E.devotion(s, 'R', p.side),
    onOtherLeave: (s, p, q, E, o) => { if (o.died && p.side === 'P' && q.side === 'P' && !q.token && E.isCreature(q)) E.token(s, 'P', T.satyr, (q.diedP ?? q.def.pow ?? 0) >= 4 ? 2 : 1); },
  },
  G45: { pow: (s, p, E) => E.devotion(s, 'G', p.side), onOtherEnter: (s, p, q, E) => { if (q.side === p.side && E.isCreature(q)) E.addCounters(s, q, 1); } },
  K39: { acts: [{ cost: 0, when: [2], label: '2点の ライフを うしなう：せんじゅつ 2', play: (s, p, E) => (s.P.life > 12 && !p.flags.turn.used ? { score: 1, run: () => { p.flags.turn.used = true; E.hurt(s, 2); return E.scry(s, 2); } } : null) }] },
  K41: { onCombatHit: (s, p, E) => { for (const q of mine(s, E)) if (q.attacking) E.addCounters(s, q, 1); } },
};

// 5色に する 追加：白（降霊）・青（切削・フラッシュバック）・赤（絢爛）・緑（上陸）
Object.assign(S3, {
  W82: disturb(3, ghost('W82', 'やさしい 霊（れい）', 'C', 3, 1, 1, ['flying', 'vigilance'], '飛行（ひこう）。警戒（けいかい）。')),
  W83: disturb(4, ghost('W83', '朝（あさ）の まぼろし', 'C', 4, 2, 1, ['flying', 'vigilance'], '飛行（ひこう）。警戒（けいかい）。')),
  W84: disturb(2, ghost('W84', '先祖（せんぞ）の 守（まも）り', 'C', 2, 1, 1, ['flying', 'lifelink'], '飛行（ひこう）。絆魂（はんこん）。')),
  W85: { play: (s, E) => ({ score: 7, run: () => E.token(s, 'P', T.spirit, 2) }) },
  W86: { trick: { kind: 'single', p: 2, t: 2 }, singleRun: (s, E, q) => { const n = isSub(q, 'spirit') ? 3 : 2; E.pump(q, n, n); } },
  W87: disturb(3, ghost('W87', '二刀（にとう）の まもり霊（れい）', 'U', 3, 1, 1, ['flying', 'double'], '飛行（ひこう）。二段攻撃（にだんこうげき）。')),
  W88: { anthem: (s, q, p) => (p !== q && isSub(p, 'spirit') ? [1, 1] : null) },
  W89: disturb(3, ghost('W89', '礼拝堂（れいはいどう）の 守（まも）り霊（れい）', 'U', 3, 2, 1, ['flying', 'first'], '飛行（ひこう）。先制攻撃（せんせいこうげき）。')),
  W90: { ...gain1, ...disturb(2, ghost('W90', '光（ひかり）の まぼろし', 'R', 2, 1, 1, ['flying'], '飛行（ひこう）。ほかの クリーチャーが あなたの戦場（せんじょう）に出るたび、あなたは1点のライフを得（え）る。', gain1)) },
  W91: {
    pow: (s, p, E) => kindred(s, E, p.side), tou: (s, p, E) => kindred(s, E, p.side),
    ...disturb(4, ghost('W91', '守（まも）り手（て）の 夜明（よあ）け', 'L', 4, 2, 2, ['flying', 'lifelink'], '飛行（ひこう）。絆魂（はんこん）。ほかの あなたの スピリットは 絆魂（はんこん）を 持（も）つ。', {
      legend: true, grant: (s, q, p) => (p !== q && isSub(p, 'spirit') ? ['lifelink'] : null),
    })),
  },
  U76: { play: (s, E) => ({ score: 4, run: () => { E.mill(s, 2); E.drawCard(s); } }) },
  U77: { landfall: (s, p, E) => millMay(s, E, 2) },
  U78: { play: (s, E, ctx) => ({ score: 8 - (ctx.phase === 1 ? 1 : 0), run: () => E.drawCard(s, 2) }), flashback: { cost: 4, req: ['U'] } },
  U79: {
    play: (s, E, ctx) => (s.P.lib.length >= 4 && ctx.phase === 2 ? {
      score: 5,
      run: () => {
        const top = s.P.lib.splice(0, 4), pick = [...top].sort((a, b) => E.keepValue(s, b) - E.keepValue(s, a))[0];
        if (!pick) return; // コピーで もう一度 うごいて やまふだが ない とき
        s.P.hand.push(pick); s.P.gy.push(...top.filter((c) => c !== pick));
        E.L(s, `4まい 見て 1まいを てふだへ、3まいを ぼちへ（4 ＝ 1 ＋ 3）`);
      },
    } : null),
    flashback: { cost: 6, req: ['U'] },
  },
  U80: { pow: (s, p) => 1 + ((s[p.side].gy || []).length >= 8 ? 3 : 0), tou: (s, p) => 1 + ((s[p.side].gy || []).length >= 8 ? 3 : 0) },
  U81: {
    play: (s, E, ctx) => (s.P.lib.length >= 7 && ctx.phase === 2 ? { score: 2 + (s.P.gy.length + 3 >= 8 ? 4 : 0), run: () => { E.mill(s, 3); if (s.P.gy.length >= 8) E.drawCard(s); } } : null),
    flashback: { cost: 2, req: ['U'] },
  },
  U82: { ...foe1('てふだに もどす クリーチャー', (s, E, t) => { if (t && E.onBf(s, t)) E.bounce(s, t); E.sba(s); }), flashback: { cost: 5, req: ['U'] } },
  U83: { onOtherEnter: (s, p, q, E) => { if (p.side === 'P' && q.side === 'P' && E.isCreature(q) && (q.def.color || '').includes('U')) millMay(s, E, 2); } },
  U84: { etb: (s, p, E) => { if (p.side === 'P') regrow(s, E, isSpellD); } },
  U85: { allFlashback: true },
  R74: { ...spectacle(2), play: (s, E, ctx) => (later(s, E, ctx) ? null : { score: 7, run: () => E.drawCard(s, 2) }) },
  R75: {
    ...spectacle(2),
    etb: (s, p, E) => { if (p.side !== 'P') return; const c = lowestKeep(s, E); if (c) { E.discard(s, [c]); E.drawCard(s); } },
  },
  R76: { acts: [{ cost: 0, tap: true, when: [1, 2], label: 'てきに 1点', play: (s, p, E) => ({ score: 3, run: () => E.hitEnemy(s, 1, p) }) }] },
  R77: { etb: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', T.satyrR); } },
  R78: spectacle(2),
  R79: { ...spectacle(2), play: (s, E, ctx) => (later(s, E, ctx) ? null : { score: 9, run: () => E.token(s, 'P', T.satyrR, 4) }) },
  R80: { ...spectacle(2), etb: (s, p, E) => { if (p.side === 'P' && E.dmgThisTurn(s) > 0) E.hitEnemy(s, 2, p); } },
  R81: { ...spectacle(2), play: (s, E, ctx) => (later(s, E, ctx) ? null : { score: 5, run: () => E.hitEnemy(s, 3, null) }) },
  R82: spectacle(2),
  R83: {
    endStep: (s, p, E) => {
      const d = E.dmgThisTurn(s), n = Math.floor(d / 2);
      if (p.side !== 'P' || !n) return;
      E.L(s, `${p.def.name}：${d} ÷ 2 ＝ ${n}${d % 2 ? ' あまり 1' : ''}`);
      E.hitEnemy(s, n, p);
    },
  },
  G77: { landfall: (s, p, E) => E.pump(p, 2, 2) },
  G78: { landfall: (s, p, E) => E.gain(s, 2) },
  G79: { landfall: (s, p, E) => E.pump(p, 1, 1) },
  G80: { play: (s, E) => ({ score: 6, run: () => { const c = lowestKeep(s, E); if (c && s.P.mana.length < 10) E.charge(s, c, false); E.drawCard(s); } }) },
  G81: { trick: { kind: 'single', p: 2, t: 2 }, singleRun: (s, E, q) => { const n = E.landfallNow(s) ? 4 : 2; E.pump(q, n, n); } },
  G82: { landfall: (s, p, E) => E.token(s, 'P', T.shard) },
  G83: { landfall: (s, p, E) => E.token(s, 'P', insectG, E.creatures(s, 'P').length >= 6 ? 2 : 1) },
  G84: { landfall: (s, p, E) => E.token(s, 'P', T.treasure) },
  G85: { landfall: (s, p, E) => E.token(s, 'P', beast44) },
  G86: { pow: (s, p) => (s[p.side].mana || []).length, tou: (s, p) => (s[p.side].mana || []).length },
});

// 黒の きほんカード：−1/−1（ターン終了時まで）
export const B06 = { basic: true, ...foe1('−1/−1 する クリーチャー', (s, E, t) => shrink(s, E, t, 1), { n: 1, score: 1 }) };
