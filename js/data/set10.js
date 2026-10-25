// 番外編「Fate/Grand Order」のうごき（名前・コスト・P/T は skel.js、文は docs/EXTRA.md 2章）
// 宝具：攻撃するたび NP が ふえて、100 いじょうで NP を 100 へらして 宝具の こうか（あいては 自動で えらぶ）
import { hit, mine, theirs, isSub, isCr, chosen1, foeBest, shrink, killIt, single, dig } from './kit.js';

const isServant = (p) => isSub(p, 'servant');
const servants = (s, E) => mine(s, E).filter(isServant);
// NP を ふやす。100 いじょうに なったら 宝具（2回ぶん たまって いれば 2回）
export function addNP(s, E, p, n) {
  if (!p || !E.onBf(s, p) || !p.def.npFx) return;
  p.np = (p.np || 0) + n;
  E.L(s, `${p.def.name}：NP ＋${n} ＝ ${p.np}`);
  while (p.np >= 100 && E.onBf(s, p) && !s.over) {
    p.np -= 100;
    E.L(s, `ほうぐ！ ${p.def.name}（NP のこり ${p.np}）`);
    p.def.npFx(s, E, p);
    E.sba(s);
  }
}
// 宝具まで あと なん回 攻撃するか（NP 40・1回 ＋40 → 40 ＋ 40 ＋ 40 ＝ 120 で あと 2回）
export const npLeft = (p) => { const g = p.def.np || 0, n = p.np || 0; return g ? Math.max(1, Math.ceil((100 - n) / g)) : null; };
export function npNote(p) {
  const g = p.def.np, n = p.np || 0, k = npLeft(p);
  return `NP ${n} ／ 100。こうげき 1回で ＋${g}。あと ${k}回 こうげき すると ほうぐ（${[n, ...Array(k).fill(g)].filter((x, i) => i || x).join(' ＋ ')} ＝ ${n + g * k}）。ほうぐは じどうで おきる`;
}
// 宝具の ある サーヴァント：npGain は 攻撃した ときに ふえる NP。npFx(s, E, p)
const np = (npGain, npFx, x = {}) => ({ np: npGain, npFx, ...x, onAttack: (s, p, E, atk, a) => { x.onAttack?.(s, p, E, atk, a); addNP(s, E, p, npGain); } });
// NP を いちばん ほしい サーヴァント（宝具に いちばん ちかい もの）
const bestServant = (s, E) => servants(s, E).filter((p) => p.def.npFx).sort((a, b) => (b.np || 0) - (a.np || 0) || E.power(s, b) - E.power(s, a))[0];
const detain = (s, E, t) => { if (t && E.onBf(s, t)) { t.tapped = true; t.frozen = true; E.L(s, `${t.def.name} を タップ（つぎも おきない）`); } };
const biggest = (s, E, f = () => true) => theirs(s, E).filter(f).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
const allFoes = (s, E, n) => { for (const t of [...theirs(s, E)]) E.damage(s, t, n, null); E.sba(s); };

export const S10 = {
  FG01: np(40, (s, E) => { for (const q of mine(s, E)) q.shieldT = s.turn; E.L(s, 'いまは 遥（はる）か 理想（りそう）の 城（しろ）：ダメージ 0'); }),
  FG02: np(50, (s, E) => allFoes(s, E, 4)),
  FG03: np(30, (s, E) => { E.gain(s, 5); for (const q of mine(s, E)) E.pump(q, 0, 0, ['indestructible']); }),
  FG04: np(40, (s, E) => { const b = foeBest(s, E, 4) || foeBest(s, E); if (b) hit(s, E, b.t, 4); }),
  FG05: np(30, (s, E) => { E.hitEnemy(s, 3, null); allFoes(s, E, 3); }, { upkeep: (s, p, E) => { if (p.side === 'P') addNP(s, E, p, 20); } }),
  FG06: np(40, (s, E) => { for (const d of E.divide(s, 6, theirs(s, E))) hit(s, E, d.t, d.n); }),
  FG07: np(50, (s, E) => { const b = foeBest(s, E); if (b) killIt(s, E, b.t); }, {
    // 戦闘続行：ゲームで 1回だけ もどる
    onDie: (s, p, E) => {
      const k = `guts_${p.def.id}`;
      if (p.side !== 'P' || s.P.flags[k]) return;
      const i = s.P.gy.findIndex((c) => c.def.id === p.def.id); if (i < 0) return;
      s.P.flags[k] = true;
      const [c] = s.P.gy.splice(i, 1);
      E.L(s, `せんとうぞっこう：${p.def.name} が もどった`);
      E.enter(s, 'P', c.def, { card: c.def });
    },
  }),
  FG08: np(40, (s, E) => { const b = foeBest(s, E); if (b) killIt(s, E, b.t); E.drawCard(s); }),
  FG09: np(50, (s, E) => detain(s, E, biggest(s, E, (p) => !p.frozen))),
  FG10: np(20, (s, E) => E.drawCard(s, 2), { onCast: (s, p, d, E) => { if (p.side === 'P' && ['instant', 'sorcery'].some((t) => d.types.includes(t))) addNP(s, E, p, 20); } }),
  FG11: np(20, (s, E) => { E.gain(s, 3); for (const q of mine(s, E)) E.addCounters(s, q, 1); }, { upkeep: (s, p, E) => { if (p.side === 'P') for (const q of servants(s, E)) addNP(s, E, q, 20); } }),
  // 十二の試練：試練カウンター 3こ。死亡する かわりに 1こ とって ダメージを 0 に
  FG12: {
    etb: (s, p) => { p.trial = 3; },
    saveDeath: (s, p, E) => { if (!(p.trial > 0)) return false; p.trial--; p.dmg = 0; p.dt = false; E.L(s, `じゅうにの しれん：${p.def.name} は たおれない（のこり ${p.trial}）`); return true; },
  },
  FG13: np(50, (s, E, p) => { E.pump(p, 0, 0, ['double']); E.L(s, `${p.def.name}：にだんこうげき`); }),
  FG14: np(40, (s, E) => { for (const t of [...theirs(s, E)]) E.pump(t, -2, -2); E.sba(s); }),
  FG15: np(40, (s, E) => { for (const q of servants(s, E)) if (q.def.id !== 'FG15') addNP(s, E, q, 50); }),
  // 令呪：3画。1画 つかうと サーヴァント1体の NP ＋100（すぐ 宝具）
  FG16: {
    etb: (s, p) => { p.seals = 3; },
    acts: [{
      cost: 0, when: [1, 2], label: 'れいじゅを 1画 つかう：NP ＋100',
      can: (s, p) => p.seals > 0, cantWhy: 'れいじゅが のこって いない',
      play: (s, p, E, ctx) => { const t = bestServant(s, E); return t && (ctx.phase === 1 || ctx.human) && theirs(s, E).length ? { score: 7, run: () => { p.seals--; addNP(s, E, t, 100); } } : null; },
      tgt: [{ side: 'P', label: 'NP ＋100 する サーヴァント', filter: (s, E, q) => isServant(q) && !!q.def.npFx }],
      apply: (s, E, [[t]], x, p) => { p.seals--; addNP(s, E, t, 100); },
    }],
  },
  // カレイドスコープ：つけた とき NP ＋80
  FG17: { equip: 2, onEquip: (s, p, host, E) => addNP(s, E, host, 80) },
  FG18: {
    play: (s, E) => { const t = E.bestBuffTarget(s, null); return t ? { score: 5, run: () => E.addCounters(s, t, 2) } : null; },
    tgt: [{ side: 'P', label: '＋1/＋1カウンターを 2こ おく クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.addCounters(s, t, 2); },
  },
  FG19: { play: (s, E) => (s.P.lib.length ? { score: 4, run: () => dig(s, E, 5, 1, (d) => isCr(d) && (d.sub || []).includes('servant')) } : null) },
  FG20: {
    acts: [{
      cost: 0, tap: true, when: [1, 2], label: 'サーヴァントに ＋1/＋1カウンター と NP ＋10',
      play: (s, p, E) => { const t = bestServant(s, E) || servants(s, E)[0]; return t ? { score: 4, run: () => { E.addCounters(s, t, 1); addNP(s, E, t, 10); } } : null; },
      tgt: [{ side: 'P', label: 'サーヴァント', filter: (s, E, q) => isServant(q) }],
      apply: (s, E, [[t]]) => { E.addCounters(s, t, 1); addNP(s, E, t, 10); },
    }],
  },
  FG21: {
    tgt: [{ side: 'P', min: 0, label: 'NP ＋30 する サーヴァント', filter: (s, E, q) => isServant(q) && !!q.def.npFx }],
    etb: (s, p, E, o) => { if (p.side !== 'P') return; const t = chosen1(o); addNP(s, E, t === undefined ? bestServant(s, E) : t, 30); },
  },
  FG22: np(50, (s, E) => E.gain(s, 4)),
  FG23: np(50, (s, E) => E.drawCard(s)),
  FG24: np(40, (s, E) => { const t = biggest(s, E, (p) => E.power(s, p) >= 2); if (t) { E.bounce(s, t); E.sba(s); } }),
  FG25: np(50, (s, E) => { const b = foeBest(s, E, 2) || foeBest(s, E); if (b) shrink(s, E, b.t, 2); }),
  FG26: np(40, (s, E) => { const b = foeBest(s, E, 99, (p) => E.power(s, p) <= 3); if (b) killIt(s, E, b.t); }),
  FG27: np(40, (s, E) => allFoes(s, E, 1)),
  FG28: np(40, (s, E) => E.hitEnemy(s, 3, null)),
  FG29: { onAttack: (s, p, E) => E.pump(p, 1, 0) },
  FG30: np(50, (s, E) => { const t = E.bestBuffTarget(s, null); if (t) E.addCounters(s, t, 2); }),
  FG31: {
    play: (s, E, ctx) => { const t = ctx.phase === 1 || ctx.human ? biggest(s, E, (p) => !p.frozen && p.def.attacks !== false) : null; return t && E.power(s, t) >= 2 ? { score: 3 + E.power(s, t), run: () => detain(s, E, t) } : null; },
    tgt: [{ side: 'E', label: 'タップする クリーチャー（つぎも おきない）' }], apply: (s, E, [[t]]) => detain(s, E, t),
  },
  FG32: single(0, 0, { kw: ['indestructible'] }),
  FG33: single(3, 0),
  FG34: {
    play: (s, E) => { const t = bestServant(s, E); return t ? { score: 5, run: () => { E.addCounters(s, t, 1); addNP(s, E, t, 30); } } : null; },
    tgt: [{ side: 'P', label: 'サーヴァント', filter: (s, E, q) => isServant(q) }], apply: (s, E, [[t]]) => { E.target(s, t); E.addCounters(s, t, 1); addNP(s, E, t, 30); },
  },
  FG35: np(40, (s, E) => { const b = foeBest(s, E, 3) || foeBest(s, E); if (b) hit(s, E, b.t, 3); E.gain(s, 3); }),
  FG36: np(30, (s, E) => { for (const t of theirs(s, E)) t.tapped = true; E.L(s, 'てきの クリーチャーを ぜんぶ タップ'); }, { upkeep: (s, p, E) => { if (p.side === 'P') for (const q of servants(s, E)) addNP(s, E, q, 10); } }),
  FG38: np(40, (s, E) => allFoes(s, E, 3)),
  FG39: np(30, (s, E) => E.drawCard(s, 2), { etb: (s, p, E) => { if (p.side === 'P') E.drawCard(s); } }),
  FG40: { acts: [{ cost: 0, sac: true, when: [1, 2], label: 'ぼちに おいて 1まい 引く', play: (s, p, E) => (s.P.hand.length <= 2 ? { score: 3, run: () => { E.leave(s, p, 'gy'); E.drawCard(s); } } : null) }] },
};
