// プレインズウォーカー（開発中）のうごき（名前・コスト・ちゅうせいは skel.js、文は docs/PLANESWALKERS.md）
// ちゅうせいの のうりょくは kit.js の pwAbility（1ターンに 1かい・ちゅうせいの 計算）
import { T, hit, theirs, foeBest, killIt, pwAbility } from './kit.js';

export const SPW = {
  PW01: {
    acts: [
      pwAbility(1, '白の 1/1 の 兵士を 2体', { play: () => ({ score: 5, run: () => undefined }) }),
      pwAbility(-3, 'パワー 4 いじょうの てきを ぜんぶ はかい', {
        play: (s, p, E, ctx) => { const n = theirs(s, E).filter((q) => E.power(s, q) >= 4).length; return n && (n >= 2 || p.loy > 3 || ctx?.human) ? { score: 6 + 5 * n, run: () => undefined } : null; },
      }),
    ],
  },
  PW02: {
    acts: [
      pwAbility(1, 'カードを 1まい 引く', { play: () => ({ score: 4, run: () => undefined }) }),
      pwAbility(-2, 'てきの クリーチャーを てふだに もどす', {
        play: (s, p, E) => { const b = foeBest(s, E); return b && p.loy > 2 && E.power(s, b.t) >= 3 ? { score: 4 + E.power(s, b.t), run: () => undefined, t: b.t } : null; },
        tgt: [{ side: 'E', label: 'てふだに もどす クリーチャー（てきは やまふだの 上へ）' }], apply: () => undefined,
      }),
    ],
  },
  PW03: {
    acts: [
      pwAbility(1, 'てきの クリーチャーに −1/−1カウンター', {
        play: (s, p, E) => { const b = foeBest(s, E, 1) || foeBest(s, E); return b ? { score: 5, run: () => undefined, t: b.t } : null; },
        tgt: [{ side: 'E', label: '−1/−1カウンターを おく クリーチャー' }], apply: () => undefined,
      }),
      pwAbility(-3, 'てきの クリーチャーを はかい', {
        play: (s, p, E) => { const b = foeBest(s, E); return b && E.power(s, b.t) >= 3 ? { score: 6 + E.power(s, b.t), run: () => undefined, t: b.t } : null; },
        tgt: [{ side: 'E', label: 'はかいする クリーチャー' }], apply: () => undefined,
      }),
    ],
  },
  PW04: {
    acts: [
      pwAbility(1, 'てきに 2てん', {
        play: (s, p, E) => { const b = E.burnTarget(s, 2, { mustHit: true }); return b ? { score: 5 + (b.score || 0), run: () => undefined, t: b.t } : null; },
        tgt: [{ side: 'E', face: true, label: '2点を あたえる 相手' }], apply: () => undefined,
      }),
      pwAbility(-4, 'てきの クリーチャー ぜんぶに 3てん', {
        play: (s, p, E, ctx) => { const n = theirs(s, E).filter((q) => E.need(s, q) <= 3).length; return n >= 2 || (ctx?.human && theirs(s, E).length) ? { score: 6 + 5 * n, run: () => undefined } : null; },
      }),
    ],
  },
  PW05: {
    acts: [
      pwAbility(1, 'マナゾーンの カードを 2まい アンタップ', { play: (s, p, E, ctx) => (s.P.mana.filter((m) => m.tapped).length >= 2 || ctx?.human ? { score: 4, run: () => undefined } : null) }),
      pwAbility(-1, '3/3 の ビーストを 1体', { play: (s, p, E, ctx) => (p.loy > 1 || ctx?.human ? { score: 6, run: () => undefined } : null) }),
    ],
  },
};

// こうか（AI の play と 人の apply で おなじ ものを つかう）
const FX = {
  PW01: [(s, E) => E.token(s, 'P', T.soldier, 2), (s, E) => { for (const q of theirs(s, E).filter((x) => E.power(s, x) >= 4)) E.destroy(s, q); E.sba(s); }],
  PW02: [(s, E) => E.drawCard(s), (s, E, t) => { if (t && E.onBf(s, t)) { E.bounce(s, t); E.sba(s); } }],
  PW03: [(s, E, t) => { if (t && E.onBf(s, t)) { E.addMinus(s, t, 1); E.sba(s); } }, (s, E, t) => killIt(s, E, t)],
  PW04: [(s, E, t) => { if (t) hit(s, E, t, 2); }, (s, E) => { for (const q of theirs(s, E)) E.damage(s, q, 3, null); E.sba(s); }],
  PW05: [(s) => { let k = 0; for (const m of s.P.mana) if (m.tapped && k < 2) { m.tapped = false; k++; } }, (s, E) => E.token(s, 'P', T.beast)],
};
for (const [id, fx] of Object.entries(FX)) {
  SPW[id].acts.forEach((a, i) => {
    const play = a.play;
    a.play = (s, p, E, ctx) => { const r = play(s, p, E, ctx); return r && { ...r, run: (x) => { r.run(x); return fx[i](s, E, r.t); } }; };
    if (a.apply) { const apply = a.apply; a.apply = (s, E, picks, x, p) => { apply(s, E, picks, x, p); return fx[i](s, E, picks[0]?.[0]); }; }
  });
}
export const PW_IDS = Object.keys(SPW);
