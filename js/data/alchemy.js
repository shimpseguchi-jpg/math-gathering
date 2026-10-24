// デジタル弾「アルケミー：テーロス」のうごき（名前・コスト・P/T は skel.js、文は docs/ALCHEMY.md）
// 永久に・探す・創出・呪文書・強度・恩恵・二体掛りは kit.js
import {
  hit, mine, theirs, isCr, foeBest, shrink, bolt, isSpellDef, REG, perp, perpPT, perpKw, perpCost, perpPerm, seek, conjure, draft, intensity, addIntensity, doubleTeam,
} from './kit.js';

const crIn = (s) => s.P.hand.filter((c) => isCr(c.def));

export const SY = {
  YW01: { etb: (s, p, E) => { if (p.side !== 'P') return; const c = crIn(s).filter((x) => !(x.def.kw || []).includes('lifelink')).sort((a, b) => b.def.cost - a.def.cost)[0]; if (c) { perpKw(c, 'lifelink'); E.L(s, `えいきゅうに はんこん：${c.def.name}`); } } },
  YW02: { etb: (s, p, E) => { if (p.side === 'P') conjure(s, E, REG.byId.YT01); }, onAttack: (s, p, E) => conjure(s, E, REG.byId.YT01) },
  YW03: { play: (s, E) => (s.P.lib.some((c) => isCr(c.def) && c.def.cost === 3) ? { score: 5, run: () => seek(s, E, (d) => isCr(d) && d.cost === 3) } : null) },
  YW04: { play: (s, E, ctx) => (ctx.phase === 1 && crIn(s).length ? { score: 6, run: () => { s.P.flags.boonCreature = (s.P.flags.boonCreature || 0) + 1; E.drawCard(s); } } : null) },
  // YW05：冒険の あいだ ずっと ＋1/＋1（app.js の finalDeck が クリアした 階の 数だけ 足す）
  YU01: { play: (s, E) => (s.P.lib.some((c) => isSpellDef(c.def) && c.def.cost % 2 === 0) ? { score: 4, run: () => seek(s, E, (d) => isSpellDef(d) && d.cost % 2 === 0) } : null) },
  YU02: { etb: (s, p, E) => { if (p.side === 'P') draft(s, E, 'tashizan'); } },
  YU03: {
    play: (s, E, ctx) => { const t = mine(s, E).filter((q) => !q.token).sort((a, b) => b.def.cost - a.def.cost)[0]; return t && ctx.phase === 2 ? { score: 3 + t.def.cost, run: () => conjure(s, E, t.card) } : null; },
    tgt: [{ side: 'P', label: '複写（ふくしゃ）を てふだに 作る クリーチャー', filter: (s, E, p) => !p.token }], apply: (s, E, [[t]]) => conjure(s, E, t.card),
  },
  YU04: { intensity: 2, play: (s, E, ctx) => (ctx.phase === 2 ? { score: 3 * intensity(s, REG.byId.YU04), run: () => { E.drawCard(s, intensity(s, REG.byId.YU04)); addIntensity(s, REG.byId.YU04, 1); } } : null) },
  YU05: {
    onDraw: (s, p, E) => {
      if (p.side !== 'P' || p.flags.turn.cut) return;
      const c = [...s.P.hand].sort((a, b) => b.def.cost - a.def.cost)[0];
      if (c && c.def.cost > [...(c.def.color || '')].length) { p.flags.turn.cut = true; perpCost(c, 1); E.L(s, `えいきゅうに コスト −1：${c.def.name}`); }
    },
  },
  YK01: {
    play: (s, E) => { const b = foeBest(s, E, 1); return b ? { score: 5 + b.score, run: () => weaken(s, E, b.t) } : null; },
    tgt: [{ side: 'any', label: 'えいきゅうに −1/−1 する クリーチャー' }], apply: (s, E, [[t]]) => weaken(s, E, t),
  },
  YK02: { play: (s, E) => (s.P.lib.some((c) => isCr(c.def) && (c.def.pow ?? 0) <= 3) ? { score: 6, run: () => { for (let i = 0; i < 2; i++) seek(s, E, (d) => isCr(d) && typeof d.pow === 'number' && d.pow <= 3); } } : null) },
  YK03: doubleTeam,
  YK04: {
    intensity: 1,
    tgt: [{ side: 'E', label: '−X/−X する てきの クリーチャー（X は 強度（きょうど））' }],
    etb: (s, p, E, o) => {
      if (p.side !== 'P') return;
      const x = intensity(s, REG.byId.YK04);
      const t = o.chosen ? o.chosen[0]?.[0] : foeBest(s, E, x)?.t;
      shrink(s, E, t, x);
    },
    onOtherLeave: (s, p, q, E, o) => { if (p.side === 'P' && q.side === 'P' && o.died && E.isCreature(q)) addIntensity(s, REG.byId.YK04, 1); },
  },
  YK05: { upkeep: (s, p, E) => { if (p.side !== 'P') return; draft(s, E, 'meikai'); E.hurt(s, 1); } },
  YR01: {
    intensity: 3,
    play: (s, E, ctx = {}) => { const n = intensity(s, REG.byId.YR01); const b = E.burnTarget(s, n, { mustHit: !!ctx.human }); return b ? { score: 6 + b.score, run: () => { hit(s, E, b.t, n); addIntensity(s, REG.byId.YR01, 1); } } : null; },
    tgt: [{ side: 'E', face: true, label: '強度（きょうど）の 点を あたえる 相手' }], apply: (s, E, [[t]]) => { hit(s, E, t, intensity(s, REG.byId.YR01)); addIntensity(s, REG.byId.YR01, 1); },
  },
  YR02: doubleTeam,
  YR03: {
    intensity: 1,
    tgt: [{ side: 'E', face: true, label: '強度（きょうど）の 点を あたえる 相手' }],
    etb: (s, p, E, o) => { if (p.side !== 'P') return; const n = intensity(s, REG.byId.YR03); const t = o.chosen ? o.chosen[0]?.[0] : null; if (t) hit(s, E, t, n); else E.hitEnemy(s, n, p); },
    onAttack: (s, p) => { if (p.side === 'P') addIntensity(s, REG.byId.YR03, 1); },
  },
  YR04: { play: (s, E, ctx) => (ctx.phase === 1 ? { score: 4, run: () => { s.P.flags.boonDmg = (s.P.flags.boonDmg || 0) + 1; E.drawCard(s); } } : null) },
  YR05: { onDie: (s, p, E) => { if (p.side === 'P') draft(s, E, 'dragon', (c) => perpCost(c, 2)); } },
  YG01: { play: (s, E) => (s.P.lib.some((c) => isCr(c.def) && (c.def.pow ?? 0) >= 4) ? { score: 5, run: () => seek(s, E, (d) => isCr(d) && typeof d.pow === 'number' && d.pow >= 4) } : null) },
  YG02: { play: (s, E, ctx) => (crIn(s).length >= 2 ? { score: 2 + 2 * crIn(s).length, run: () => { for (const c of crIn(s)) perpPT(c, 1, 1); } } : null) },
  YG03: doubleTeam,
  YG04: {
    intensity: 2,
    etb: (s, p, E) => E.addCounters(s, p, intensity(s, REG.byId.YG04)),
    onDie: (s, p) => { if (p.side === 'P') addIntensity(s, REG.byId.YG04, 2); },
  },
  YG05: {
    intensity: 1,
    etb: (s, p, E) => { if (p.side !== 'P') return; const t = E.bestBuffTarget(s, null); if (t) E.addCounters(s, t, p.def.grow ?? 1); },
  },
  YM01: { acts: [{ cost: 3, tap: true, when: [1, 2], label: '九九（くく）の 呪文書（じゅもんしょ）から ドラフト', play: (s, p, E) => ({ score: 4, run: () => draft(s, E, 'kuku') }) }] },
  YM02: doubleTeam,
  YM03: {
    onExact: (s, p, E, t) => { if (p.side !== 'P') return; const n = t.diedT ?? 0; seek(s, E, (d) => isCr(d) && d.pow === n); },
  },
  YC01: { acts: [{ cost: 3, tap: true, when: [1, 2], label: '無限（むげん）の 秘本（ひほん）から 創出（そうしゅつ）', play: (s, p, E) => ({ score: 4, run: () => draft(s, E, 'all') }) }] },
  YC02: {
    intensity: 1,
    acts: [{
      cost: 0, tap: true, when: [1, 2], label: '強度（きょうど）と 同じ コストの カードを 探（さが）す',
      play: (s, p, E) => ({ score: 3, run: () => { const n = intensity(s, REG.byId.YC02); seek(s, E, (d) => d.cost === n); addIntensity(s, REG.byId.YC02, 1, 6); } }),
    }],
  },
  YT01: { noPack: true },
};

// 永久に −1/−1（てきの パーマネントも この たたかいの あいだ）
function weaken(s, E, t) {
  if (!t || !E.onBf(s, t)) return;
  perpPerm(t, (d) => { d.pow = typeof d.pow === 'function' ? ((f) => (a, b, c) => f(a, b, c) - 1)(d.pow) : (d.pow ?? 0) - 1; d.tou = typeof d.tou === 'function' ? ((f) => (a, b, c) => f(a, b, c) - 1)(d.tou) : (d.tou ?? 0) - 1; });
  E.L(s, `えいきゅうに −1/−1：${t.def.name}`);
  E.sba(s);
}
export { perp };
