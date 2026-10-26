// プレインズウォーカー（開発中）のうごき（名前・コスト・ちゅうせいは skel.js、文は docs/PLANESWALKERS.md）
// ちゅうせいの のうりょくは kit.js の pwAbility（1ターンに 1かい・ちゅうせいの 計算）
import { T, cr, hit, mine, theirs, foeBest, killIt, exileIt, pwAbility, chosen1, dig } from './kit.js';
import { detain } from './set9.js';

const TK = {
  vampire: cr('t_vampireF', '吸血鬼（きゅうけつき）', null, 'K', 0, 2, 2, ['vampire'], ['flying']),
  dragon: cr('t_dragonF', 'ドラゴン', null, 'R', 0, 4, 4, ['dragon'], ['flying']),
  // カーン：アーティファクト 1つにつき ＋1/＋1（じぶんも 数える）
  construct: { ...cr('t_construct', '構築物（こうちくぶつ）', null, '', 0, 0, 0, ['construct']), types: ['artifact', 'creature'],
    anthem: (s, q, p) => (q === p ? ((n) => [n, n])(s[q.side].bf.filter((x) => (x.def.types || []).includes('artifact')).length) : null) },
};
// 敵の クリーチャーか プレインズウォーカー（妨害）
const crOrPW = (s, E, p) => E.isCreature(p) || E.isPW(p);
const hasPW = (s, E) => s.P.bf.some((q) => E.isPW(q));
const prolif = (s, p, E) => { if (p.side === 'P') { E.L(s, 'ぞうしょく'); E.proliferate(s); } };
// ライブラリーの 上から 3まいめへ（テフェリー）
const tuck3 = (s, E, t) => {
  if (!t || !E.onBf(s, t)) return;
  const lib = s[t.side].lib;
  E.leave(s, t, 'lib');
  if (lib && lib[0]?.uid === t.uid) lib.splice(Math.min(2, lib.length - 1), 0, lib.shift());
  E.sba(s);
};

export const SPW = {
  PW01: {
    acts: [
      pwAbility(1, '白の 1/1 の へいしを 2体', { play: () => ({ score: 5, run: () => undefined }) }),
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
  PW06: {
    acts: [
      pwAbility(1, '1まい 引いて、マナを 2まい アンタップ', { play: () => ({ score: 5, run: () => undefined }) }),
      pwAbility(-3, 'てきを ライブラリーの 上から 3まいめに', {
        play: (s, p, E) => { const b = foeBest(s, E); return b && p.loy > 3 && E.power(s, b.t) >= 3 ? { score: 5 + E.power(s, b.t), run: () => undefined, t: b.t } : null; },
        tgt: [{ side: 'E', perm: true, filter: crOrPW, label: 'ライブラリーに 入れる てき' }], apply: () => undefined,
      }),
    ],
  },
  PW07: {
    acts: [
      pwAbility(1, 'みんな ＋1/＋0 と 絆魂（はんこん）', { play: (s, p, E, ctx) => (mine(s, E).length || ctx?.human ? { score: 3 + mine(s, E).length, run: () => undefined } : null) }),
      pwAbility(-2, '2/2 の 飛行（ひこう）の 吸血鬼（きゅうけつき）を 1体', { play: (s, p, E, ctx) => (p.loy > 2 || ctx?.human ? { score: 6, run: () => undefined } : null) }),
    ],
  },
  PW08: {
    acts: [
      pwAbility(1, '1体に ＋2/＋0 と 飛行（ひこう）', {
        play: (s, p, E) => { const t = E.bestBuffTarget(s, null, { ready: true }); return t ? { score: 4, run: () => undefined, t } : null; },
        tgt: [{ side: 'P', label: '＋2/＋0 と 飛行（ひこう）を つける クリーチャー' }], apply: () => undefined,
      }),
      pwAbility(-3, '4/4 の 飛行（ひこう）の ドラゴンを 1体', { play: (s, p, E, ctx) => (p.loy >= 3 || ctx?.human ? { score: 9, run: () => undefined } : null) }),
    ],
  },
  PW09: {
    acts: [
      pwAbility(1, 'てきを 1体 留置（りゅうち）', {
        play: (s, p, E) => { const t = theirs(s, E).filter((q) => !q.frozen).sort((a, b) => E.power(s, b) - E.power(s, a))[0]; return t ? { score: 3 + E.power(s, t), run: () => undefined, t } : null; },
        tgt: [{ side: 'E', label: '留置（りゅうち）する クリーチャー' }], apply: () => undefined,
      }),
      pwAbility(-2, '3てん', {
        play: (s, p, E) => { const b = E.burnTarget(s, 3, { mustHit: true }); return b && p.loy > 2 ? { score: 5 + (b.score || 0), run: () => undefined, t: b.t } : null; },
        tgt: [{ side: 'E', face: true, label: '3点を あたえる 相手' }], apply: () => undefined,
      }),
    ],
  },
  PW10: {
    acts: [
      pwAbility(1, 'カードを 1まい 引く', { play: () => ({ score: 4, run: () => undefined }) }),
      pwAbility(-2, 'アーティファクトの 数の 構築物（こうちくぶつ）', { play: (s, p, E, ctx) => (p.loy > 2 || ctx?.human ? { score: 5 + s.P.bf.filter((x) => (x.def.types || []).includes('artifact')).length, run: () => undefined } : null) }),
    ],
  },

  // ---- サポート ----
  PW11: {
    etb: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', T.soldier, 2); },
    onOtherEnter: (s, q, p, E) => { if (q.side === p.side && E.isPW(p)) { p.loy++; E.L(s, `ギデオンの ちかい：${p.def.name} の ちゅうせい ${p.loy - 1} ＋ 1 ＝ ${p.loy}`); } },
  },
  PW12: { etb: (s, p, E) => { if (p.side !== 'P') return; E.drawCard(s, 3); E.discard(s, E.discardPick(s, 2)); } },
  PW13: {
    tgt: [{ side: 'E', min: 0, label: '3点を あたえる クリーチャー' }],
    etb: (s, p, E, o) => { if (p.side !== 'P') return; let t = chosen1(o); if (t === undefined) t = foeBest(s, E, 3)?.t || foeBest(s, E)?.t; if (t) hit(s, E, t, 3); },
    onOtherEnter: (s, q, p, E) => { if (q.side === p.side && E.isPW(p)) q.flags.turn.pwIn = true; },
    endStep: (s, p, E) => { if (p.side === 'P' && p.flags.turn.pwIn) { p.flags.turn.pwIn = false; E.L(s, 'チャンドラの ちかい：てきに 2点'); E.hitEnemy(s, 2, p); } },
  },
  PW14: { etb: (s, p, E) => { if (p.side === 'P') dig(s, E, 3, 1, (d) => (d.types || []).some((t) => t === 'creature' || t === 'planeswalker')); } },
  PW15: {
    etb: (s, p, E) => { if (p.side !== 'P') return; E.hitEnemy(s, 3, p); E.gain(s, 3); },
    onPWAttacked: (s, q, a, E) => { E.L(s, 'ケイヤの ちかい：てきに 2点・ライフ ＋2'); E.hitEnemy(s, 2, q); E.gain(s, 2); },
  },
  PW16: { pwTwice: true, need: (s, E) => hasPW(s, E) || s.P.hand.some((c) => (c.def.types || []).includes('planeswalker')) },
  PW17: { onCombatHit: (s, p, E) => prolif(s, p, E) },
  PW18: { onCast: (s, p, d, E) => { if (!(d.types || []).includes('creature')) prolif(s, p, E); } },
  PW19: { play: (s, E) => ({ score: 4 + s.P.bf.filter((q) => q.ctr > 0 || E.isPW(q)).length * 2, run: () => { E.proliferate(s); E.drawCard(s); } }) },
  PW20: {
    etb: (s, p, E) => {
      if (p.side !== 'P') return;
      for (const q of [...s.P.bf]) {
        if (q.ctr > 0) { E.L(s, `しんえんの かくせい：${q.def.name} ${q.ctr} × 2 ＝ ${q.ctr * 2}`); E.addCounters(s, q, q.ctr); }
        if (E.isPW(q) && q.loy > 0) { E.L(s, `しんえんの かくせい：${q.def.name} の ちゅうせい ${q.loy} × 2 ＝ ${q.loy * 2}`); q.loy *= 2; }
      }
    },
  },
  PW21: {
    play: (s, E) => { const b = foeBest(s, E, 2) || foeBest(s, E); return b ? { score: 4 + b.score, run: () => { hit(s, E, b.t, 2); E.gain(s, 2); } } : null; },
    tgt: [{ side: 'E', label: '2点を あたえる クリーチャー' }], apply: (s, E, [[t]]) => { hit(s, E, t, 2); E.gain(s, 2); },
  },
  PW22: {
    play: (s, E, ctx = {}) => { const n = hasPW(s, E) ? 5 : 3; const b = E.burnTarget(s, n, { mustHit: !!ctx.human }); return b ? { score: 6 + b.score, run: () => hit(s, E, b.t, n) } : null; },
    tgt: [{ side: 'E', face: true, perm: true, filter: crOrPW, label: '3点（プレインズウォーカーが いれば 5点）を あたえる 相手' }],
    apply: (s, E, [[t]]) => hit(s, E, t, hasPW(s, E) ? 5 : 3),
  },
  PW23: { etb: (s, p, E) => prolif(s, p, E) },
  PW24: {
    tgt: [{ side: 'P', min: 0, label: '＋1/＋1カウンターを おく クリーチャー' }],
    etb: (s, p, E, o) => {
      if (p.side !== 'P') return;
      let t = chosen1(o); if (t === undefined) t = E.bestBuffTarget(s, null, {}) || p;
      if (t && E.onBf(s, t)) E.addCounters(s, t, 1);
      prolif(s, p, E);
    },
  },
  PW25: { etb: (s, p, E) => prolif(s, p, E) },

  // ---- 妨害（てきの クリーチャーか プレインズウォーカー） ----
  PW26: {
    tgt: [{ side: 'E', perm: true, min: 0, filter: crOrPW, label: 'ついほうする てき' }],
    etb: (s, p, E, o) => { if (p.side !== 'P') return; let t = chosen1(o); if (t === undefined) t = foeBest(s, E)?.t; exileIt(s, E, t); },
    permScore: (s, E) => (theirs(s, E).length ? 9 : 1),
  },
  PW27: {
    play: (s, E) => { const b = foeBest(s, E); return b && E.power(s, b.t) >= 3 ? { score: 5 + b.score, run: () => { E.leave(s, b.t, 'lib'); E.sba(s); } } : null; },
    tgt: [{ side: 'E', perm: true, filter: crOrPW, label: 'ライブラリーの 一番上に おく てき' }], apply: (s, E, [[t]]) => { if (t && E.onBf(s, t)) { E.leave(s, t, 'lib'); E.sba(s); } },
  },
  PW28: {
    play: (s, E) => { const b = foeBest(s, E); return b ? { score: 6 + b.score, run: () => killIt(s, E, b.t) } : null; },
    tgt: [{ side: 'E', perm: true, filter: crOrPW, label: 'はかいする てき' }], apply: (s, E, [[t]]) => killIt(s, E, t),
  },
  PW29: {
    need: (s, E) => s.P.bf.some((q) => q.def.legend),
    play: (s, E, ctx) => {
      const x = ctx.xMax;
      const ts = theirs(s, E).filter((q) => E.need(s, q) <= x).sort((a, b) => E.power(s, b) - E.power(s, a)).slice(0, 3);
      const face = E.burnTarget(s, x, { mustHit: true })?.t === 'face' || !theirs(s, E).length;
      if (ts.length < 3 && face) ts.push('face');
      return ts.length ? { score: 3 + 4 * ts.length + x, x, run: (n) => { for (const t of ts) hit(s, E, t, n); E.sba(s); } } : null;
    },
    tgt: [{ side: 'E', face: true, perm: true, max: 3, filter: crOrPW, label: 'X点を あたえる 相手（3つまで）' }],
    apply: (s, E, [ts], x) => { for (const t of ts || []) hit(s, E, t, x); E.sba(s); },
  },
  PW30: {
    play: (s, E) => {
      const a = mine(s, E).sort((p, q) => E.power(s, q) - E.power(s, p))[0];
      const b = a && foeBest(s, E, E.power(s, a));
      return b ? { score: 5 + b.score, run: () => { E.damage(s, b.t, E.power(s, a), a); E.sba(s); } } : null;
    },
    tgt: [{ side: 'mine', label: 'ダメージを あたえる あなたの クリーチャー' }, { side: 'E', perm: true, filter: crOrPW, label: 'ダメージを うける てき' }],
    apply: (s, E, [[a], [b]]) => { if (a && b && E.onBf(s, a) && E.onBf(s, b)) { E.L(s, `${a.def.name}：パワー ${E.power(s, a)} の ダメージ`); E.damage(s, b, E.power(s, a), a); E.sba(s); } },
  },
};

const untap2 = (s) => { let k = 0; for (const m of s.P.mana) if (m.tapped && k < 2) { m.tapped = false; k++; } };
// こうか（AI の play と 人の apply で おなじ ものを つかう）
const FX = {
  PW01: [(s, E) => E.token(s, 'P', T.soldier, 2), (s, E) => { for (const q of theirs(s, E).filter((x) => E.power(s, x) >= 4)) E.destroy(s, q); E.sba(s); }],
  PW02: [(s, E) => E.drawCard(s), (s, E, t) => { if (t && E.onBf(s, t)) { E.bounce(s, t); E.sba(s); } }],
  PW03: [(s, E, t) => { if (t && E.onBf(s, t)) { E.addMinus(s, t, 1); E.sba(s); } }, (s, E, t) => killIt(s, E, t)],
  PW04: [(s, E, t) => { if (t) hit(s, E, t, 2); }, (s, E) => { for (const q of theirs(s, E)) E.damage(s, q, 3, null); E.sba(s); }],
  PW05: [(s) => untap2(s), (s, E) => E.token(s, 'P', T.beast)],
  PW06: [(s, E) => { E.drawCard(s); untap2(s); }, (s, E, t) => tuck3(s, E, t)],
  PW07: [(s, E) => { for (const q of mine(s, E)) E.pump(q, 1, 0, ['lifelink']); }, (s, E) => E.token(s, 'P', TK.vampire)],
  PW08: [(s, E, t) => { if (t && E.onBf(s, t)) E.pump(t, 2, 0, ['flying']); }, (s, E) => E.token(s, 'P', TK.dragon)],
  PW09: [(s, E, t) => detain(s, E, t), (s, E, t) => { if (t) hit(s, E, t, 3); }],
  PW10: [(s, E) => E.drawCard(s), (s, E) => E.token(s, 'P', TK.construct)],
};
for (const [id, fx] of Object.entries(FX)) {
  SPW[id].acts.forEach((a, i) => {
    const play = a.play;
    a.play = (s, p, E, ctx) => { const r = play(s, p, E, ctx); return r && { ...r, run: (x) => { r.run(x); return fx[i](s, E, r.t); } }; };
    if (a.apply) { const apply = a.apply; a.apply = (s, E, picks, x, p) => { apply(s, E, picks, x, p); return fx[i](s, E, picks[0]?.[0]); }; }
  });
}
export const PW_IDS = Object.keys(SPW);
