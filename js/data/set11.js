// 番外編「崩壊：スターレイル」のうごき（名前・コスト・P/T は skel.js、文は docs/EXTRA.md 3章）
// 戦技ポイント：チーム みんなで 1つ（0〜5、はじめは 3）。この 弾の クリーチャーが 攻撃すると ＋1、戦技で −1
// 撃破：ぴったりで たおしたら（game.js の pittari）。必殺技：レジェンドの キャラだけ、エネルギー 3 で
// 光円錐：いまの カードの うごきを その まま 使う（copyOf。cards.js で 元の カードから うつす）
import { mine, theirs, hit, foeBest, shrink, T } from './kit.js';

export const SP_START = 3;
export const EN_MAX = 3;
export const spOf = (s) => s.P.sp ?? SP_START;
export const spMax = (s) => (s.P.bf.some((q) => q.def.spPlus) ? 7 : 5); // 花火が いると 7
export function addSP(s, E, n) {
  const was = spOf(s), now = Math.max(0, Math.min(spMax(s), was + n));
  s.P.sp = now;
  if (now !== was) E.L(s, `せんぎポイント ${was} ${n > 0 ? '＋' : '−'} ${Math.abs(n)} ＝ ${now}`);
}
// エネルギー（必殺技の ある キャラだけ。3 まで）
export function addEN(s, E, p, n) {
  if (!p?.def.ult || !E.onBf(s, p) || p.side !== 'P') return;
  const was = p.en || 0; p.en = Math.min(EN_MAX, was + n);
  if (p.en !== was) E.L(s, `${p.def.name}：エネルギー ${was} ＋ ${n} ＝ ${p.en}`);
}
const canSwing = (s, E, p) => !p.tapped && (!p.sick || E.hasKw(s, p, 'haste'));
const biggest = (s, E, f = () => true) => theirs(s, E).filter(f).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
const allFoes = (s, E, n) => { for (const t of [...theirs(s, E)]) E.damage(s, t, n, null); E.sba(s); };
const detain = (s, E, t) => { if (t && E.onBf(s, t)) { t.tapped = true; t.frozen = true; E.L(s, `${t.def.name} を タップ（つぎも おきない）`); } };
const foeThreat = (s, E) => theirs(s, E).some((t) => t.def.attacks !== false && E.power(s, t) >= 2);

// 戦技：ポイント 1つ、メインフェイズ、1ターンに max 回。sk = { label, play(s, p, E, ctx) → { score, run } , tgt?, apply?(s, E, picks, p) }
function spend(s, E, p) { addSP(s, E, -1); p.flags.turn.skill = (p.flags.turn.skill || 0) + 1; addEN(s, E, p, 1); }
const skillAct = (sk, max = 1) => ({
  cost: 0, spUse: true, when: [1, 2], label: `せんぎ：${sk.label}`,
  can: (s, p) => spOf(s) >= 1 && (p.flags.turn.skill || 0) < max, cantWhy: 'せんぎポイントが ない か、この ターンは もう つかった',
  play: (s, p, E, ctx) => { const r = sk.play(s, p, E, ctx); return r && { score: r.score, run: (x) => { spend(s, E, p); r.run(x); } }; },
  ...(sk.tgt ? { tgt: sk.tgt, apply: (s, E, picks, x, p) => { spend(s, E, p); sk.apply(s, E, picks, p); } } : {}),
});
// 必殺技：エネルギー 3 − 3 ＝ 0。u = { label, fx(s, E, p, t?), play?(s, p, E, ctx) → score, tgt? }
const ultAct = (u) => ({
  cost: 0, ultUse: true, when: [1, 2], label: `ひっさつわざ：${u.label}`,
  can: (s, p) => (p.en || 0) >= EN_MAX, cantWhy: 'エネルギーが 3に たりない',
  play: (s, p, E, ctx) => {
    if ((p.en || 0) < EN_MAX) return null;
    const sc = u.play ? u.play(s, p, E, ctx) : 8; if (!sc) return null;
    return { score: sc, run: () => { fire(s, E, p, u); } };
  },
  ...(u.tgt ? { tgt: u.tgt, apply: (s, E, [[t]], x, p) => fire(s, E, p, u, t) } : {}),
});
function fire(s, E, p, u, t) {
  p.en = 0; E.L(s, `ひっさつわざ！ ${p.def.name}（エネルギー 3 − 3 ＝ 0）`);
  u.fx(s, E, p, t); E.sba(s);
}
// この 弾の クリーチャー：攻撃で せんぎポイント ＋1。必殺技の ある キャラは エネルギーが じぶんの ターンの はじめ・攻撃・ダメージを うける・戦技で ＋1
const trail = (x = {}) => {
  const { skill, skillMax, ult, ...rest } = x;
  return {
    ...rest, ult: !!ult,
    onAttack: (s, p, E, atk, a) => { rest.onAttack?.(s, p, E, atk, a); if (p.side === 'P') { addSP(s, E, 1); addEN(s, E, p, 1); } },
    onHurt: (s, p, n, src, E) => { rest.onHurt?.(s, p, n, src, E); addEN(s, E, p, 1); },
    ...(ult ? { upkeep: (s, p, E) => { addEN(s, E, p, 1); return rest.upkeep?.(s, p, E); } } : {}),
    acts: [...(skill ? [skillAct(skill, skillMax)] : []), ...(ult ? [ultAct(ult)] : []), ...(rest.acts || [])],
  };
};
// よく 使う 戦技
const foeSkill = (label, n, f, o = {}) => ({
  label,
  play: (s, p, E) => { const b = (o.pick ? o.pick(s, E) : foeBest(s, E, n)); return b ? { score: 3 + Math.min(4, E.power(s, b.t || b)), run: () => f(s, E, b.t || b) } : null; },
  tgt: [{ side: 'E', label }], apply: (s, E, [[t]]) => { E.target(s, t); f(s, E, t); },
});
const pumpOther = (label, a, b) => ({
  label,
  play: (s, p, E, ctx) => { if (ctx.phase !== 1) return null; const t = E.bestBuffTarget(s, p, { ready: true }); return t && canSwing(s, E, t) ? { score: 3 + a, run: () => E.pump(t, a, b) } : null; },
  tgt: [{ side: 'P', label: `${label}する クリーチャー` }], apply: (s, E, [[t]]) => { E.target(s, t); E.pump(t, a, b); },
});
const selfPump = (label, a, kws = []) => ({
  label, play: (s, p, E, ctx) => (ctx.phase === 1 && canSwing(s, E, p) ? { score: 3 + a, run: () => E.pump(p, a, 0, kws) } : null),
});
const shieldOne = {
  label: 'つぎの てきの ターン、1体は ダメージを うけない',
  play: (s, p, E) => { const t = foeThreat(s, E) ? E.bestBuffTarget(s, null) : null; return t && t.shieldT !== s.turn + 1 ? { score: 2, run: () => { t.shieldT = s.turn + 1; } } : null; },
  tgt: [{ side: 'P', label: 'まもる クリーチャー' }], apply: (s, E, [[t]]) => { t.shieldT = s.turn + 1; E.L(s, `${t.def.name}：つぎの てきの ターン ダメージ 0`); },
};
const spPit = (s, p, E) => addSP(s, E, 1);
const draw1 = (s, p, E) => E.drawCard(s);
// 戦場に 出たとき、敵の クリーチャー1体に（えらぶ。えらばなければ いちばん よい もの）
const etbFoe = (label, f, pick) => ({
  tgt: [{ side: 'E', min: 0, label }],
  etb: (s, p, E, o) => { if (p.side !== 'P') return; const c = o?.chosen ? o.chosen[0]?.[0] : pick(s, E); if (c) f(s, E, c); },
});

export const S11 = {
  SR01: trail({ skill: selfPump('＋2/＋0 と トランプル', 2, ['trample']) }),
  SR02: trail({ skill: shieldOne, pittari: spPit }),
  SR03: trail({ pittari: draw1 }),
  SR04: trail({ skill: foeSkill('2点を あたえる クリーチャー', 2, (s, E, t) => hit(s, E, t, 2)), pittari: (s, p, E) => allFoes(s, E, 1) }),
  SR05: trail({ skill: foeSkill('タップする クリーチャー（つぎも おきない）', 0, detain, { pick: (s, E) => biggest(s, E, (t) => !t.frozen && t.def.attacks !== false) }) }),
  // 神君：ターンの はじめに 1こ（10こまで）。攻撃するたび その 数だけ 敵に
  SR06: trail({
    upkeep: (s, p) => { if (p.side === 'P') p.shin = Math.min(10, (p.shin || 0) + 1); },
    onAttack: (s, p, E) => { if (p.side === 'P' && p.shin) { E.L(s, `しんくん：${p.shin}点`); E.hitEnemy(s, p.shin, p); } },
    ult: { label: 'しんくんカウンター ＋3', fx: (s, E, p) => { p.shin = Math.min(10, (p.shin || 0) + 3); }, play: (s, p) => ((p.shin || 0) <= 7 ? 7 : 0) },
  }),
  SR07: trail({ skill: selfPump('二だんこうげき', 0, ['double']), ult: { label: 'てきの クリーチャー すべてに 2点', fx: (s, E) => allFoes(s, E, 2), play: (s, p, E) => (theirs(s, E).length ? 8 : 0) } }),
  SR08: trail({ onAttack: (s, p, E) => { if (p.side !== 'P') return; E.hurt(s, 1, p); E.pump(p, 2, 0); } }),
  SR09: trail({
    skill: foeSkill('−1/−1カウンターを 2こ おく クリーチャー', 2, (s, E, t) => { E.addMinus(s, t, 2); E.sba(s); }),
    ult: { label: 'てきの クリーチャー すべてに −1/−1カウンター', fx: (s, E) => { for (const t of [...theirs(s, E)]) E.addMinus(s, t, 1); E.sba(s); }, play: (s, p, E) => (theirs(s, E).length ? 8 : 0) },
  }),
  SR10: trail({ skill: foeSkill('−2/−2 する クリーチャー', 2, (s, E, t) => shrink(s, E, t, 2)) }),
  SR11: trail({ skill: pumpOther('＋2/＋2', 2, 2) }),
  SR12: trail({ pittari: (s, p, E) => { if (E.onBf(s, p)) p.tapped = false; addSP(s, E, 1); } }),
  SR13: trail({ allyDmgLess: 1 }),
  SR14: trail({
    skillMax: 3, skill: selfPump('＋2/＋0', 2),
    ult: { label: '5点を あたえる', fx: (s, E, p, t) => { const b = t || foeBest(s, E, 5)?.t; if (b) hit(s, E, b, 5); }, play: (s, p, E) => (foeBest(s, E, 5) ? 8 : 0), tgt: [{ side: 'E', label: '5点を あたえる クリーチャー' }] },
  }),
  SR15: trail({ pittari: (s, p, E) => E.hitEnemy(s, 3, p), ult: { label: '＋3/＋0 と はかいふのう', fx: (s, E, p) => E.pump(p, 3, 0, ['indestructible']), play: (s, p, E, ctx) => (ctx.phase === 1 && canSwing(s, E, p) ? 8 : 0) } }),
  SR16: trail({ spPlus: true, etb: (s, p, E) => { if (p.side === 'P') addSP(s, E, 2); } }),
  SR17: trail({ upkeep: (s, p, E) => { if (p.side === 'P') E.gain(s, E.rollDie(s)); } }),
  SR19: { etb: (s, p, E) => { if (p.side === 'P') addSP(s, E, 3); }, upkeep: (s, p, E) => { if (p.side === 'P') addSP(s, E, 1); } },
  SR20: trail({ etb: (s, p, E) => { if (p.side === 'P') E.drawCard(s); } }),
  SR21: trail({
    skill: foeSkill('2点を あたえる クリーチャー', 2, (s, E, t) => hit(s, E, t, 2)), pittari: spPit,
    ult: { label: 'てきの クリーチャー すべてに 3点', fx: (s, E) => allFoes(s, E, 3), play: (s, p, E) => (theirs(s, E).length ? 8 : 0) },
  }),
  SR22: trail({
    anthem: (s, q, p) => (p !== q && p.side === q.side && E_isCr(p) ? [1, 0] : null),
    ult: { label: 'てきを ぜんぶ タップ（つぎも おきない）', fx: (s, E) => { for (const t of theirs(s, E)) detain(s, E, t); }, play: (s, p, E) => (foeThreat(s, E) ? 8 : 0) },
  }),
  SR23: trail({ skill: { label: 'つぎの てきの ターン、みんな ダメージを うけない', play: (s, p, E) => (foeThreat(s, E) && mine(s, E).some((q) => q.shieldT !== s.turn + 1) ? { score: 4, run: () => { for (const q of mine(s, E)) q.shieldT = s.turn + 1; } } : null) } }),
  SR24: trail({ skill: { label: 'ライフ ＋3', play: (s, p, E) => (s.P.life < 15 ? { score: 2, run: () => E.gain(s, 3) } : null) } }),
  SR25: trail({ skill: {
    label: '＋1/＋1カウンター', play: (s, p, E) => { const t = E.bestBuffTarget(s, null); return t ? { score: 3, run: () => E.addCounters(s, t, 1) } : null; },
    tgt: [{ side: 'P', label: '＋1/＋1カウンターを おく クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.addCounters(s, t, 1); },
  } }),
  // スヴァローグの はんげき：てきの クリーチャーから ダメージを うけるたび 2点
  SR26: trail({ onHurt: (s, p, n, src, E) => { if (src && src.side !== p.side && E.onBf(s, src) && E.isCreature(src)) { E.L(s, 'スヴァローグの はんげき！'); E.damage(s, src, 2, p); } } }),
  SR27: trail({ onAttack: (s, p, E) => { if (p.side !== 'P') return; const t = foeBest(s, E, 1)?.t || biggest(s, E); if (t) { E.addMinus(s, t, 1); E.sba(s); } } }),
  SR28: trail({ skill: pumpOther('＋3/＋0', 3, 0) }),
  SR29: trail({ pittari: spPit }),
  SR30: trail({ pittari: (s, p, E) => E.hitEnemy(s, 2, p) }),
  SR31: trail({ skill: { label: 'ライフ ＋2・エネルギー ＋1', play: (s, p, E) => {
    const t = mine(s, E).filter((q) => q.def.ult && (q.en || 0) < EN_MAX).sort((a, b) => (b.en || 0) - (a.en || 0))[0];
    return t || s.P.life < 15 ? { score: t ? 4 : 2, run: () => { E.gain(s, 2); if (t) addEN(s, E, t, 1); } } : null;
  } } }),
  SR32: trail({ skill: foeSkill('−1/−1カウンターを おく クリーチャー', 1, (s, E, t) => { E.addMinus(s, t, 1); E.sba(s); }) }),
  SR33: trail({
    skill: foeSkill('1点（タップして いれば 3点）を あたえる クリーチャー', 1, (s, E, t) => hit(s, E, t, t.tapped ? 3 : 1), { pick: (s, E) => foeBest(s, E, 3, (t) => t.tapped) || foeBest(s, E, 1) }),
    pittari: draw1,
  }),
  SR34: trail({
    etb: (s, p, E) => { if (p.side === 'P') addSP(s, E, 1); },
    skill: { label: 'みんな ＋1/＋0', play: (s, p, E, ctx) => (ctx.phase === 1 && mine(s, E).filter((q) => canSwing(s, E, q)).length >= 2 ? { score: 4, run: () => { for (const q of mine(s, E)) E.pump(q, 1, 0); } } : null) },
  }),
  // ---- モブ ----
  SR39: trail({ pittari: spPit }),
  SR40: trail(),
  SR41: trail({ etb: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', T.soldier, 1); } }),
  SR42: trail({ etb: (s, p, E) => { if (p.side === 'P') E.drawCard(s); } }),
  SR43: trail({ skill: { label: '1まい 引く', play: (s, p, E) => (s.P.lib.length ? { score: 3, run: () => E.drawCard(s) } : null) } }),
  SR44: trail(),
  SR45: trail({ pittari: (s, p, E) => { E.hitEnemy(s, 1, p); E.gain(s, 1); } }),
  SR46: trail(),
  SR47: trail({ onDie: (s, p, E) => { if (p.side === 'P') E.hitEnemy(s, 1, null); } }),
  SR48: trail(etbFoe('−1/−1 する クリーチャー', (s, E, t) => shrink(s, E, t, 1), (s, E) => foeBest(s, E, 1)?.t)),
  SR49: trail(),
  SR50: trail({ pittari: (s, p, E) => E.hitEnemy(s, 1, p) }),
  SR51: trail(),
  SR52: trail({ etb: (s, p, E) => { if (p.side === 'P') E.gain(s, 2); } }),
  SR53: trail({ etb: (s, p, E) => { if (p.side === 'P' && E.basicsInLib(s)) E.rampBasic(s, 1); } }),
  SR54: trail(),
  SR55: trail({ pittari: (s, p, E) => { if (E.onBf(s, p)) E.addCounters(s, p, 1); } }),
  // ---- 光円錐（元の カードの うごき） ----
  SR18: { copyOf: 'C07' }, SR35: { copyOf: 'R22' }, SR36: { copyOf: 'U05' }, SR37: { copyOf: 'G14' }, SR38: { copyOf: 'K25' },
  SR56: { copyOf: 'W01' }, SR57: { copyOf: 'W19' }, SR58: { copyOf: 'W12' }, SR59: { copyOf: 'U09' }, SR60: { copyOf: 'U12' },
  SR61: { copyOf: 'U03' }, SR62: { copyOf: 'K04' }, SR63: { copyOf: 'K13' }, SR64: { copyOf: 'K11' }, SR65: { copyOf: 'R04' },
  SR66: { copyOf: 'R21' }, SR67: { copyOf: 'R20' }, SR68: { copyOf: 'G09' }, SR69: { copyOf: 'G18' }, SR70: { copyOf: 'G04' },
};
function E_isCr(p) { return (p.def.types || []).includes('creature'); }
