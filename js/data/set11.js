// 番外編「崩壊：スターレイル」のうごき（名前・コスト・P/T は skel.js、文は docs/EXTRA.md 3章）
// 戦技ポイント：チーム みんなで 1つ（0〜5、はじめは 3）。この 弾の クリーチャーが 攻撃すると ＋1、戦技で −1
// 撃破：ぴったりで たおしたら（game.js の pittari）
// 光円錐・必殺技：MTG に あって この ゲームに まだ ない カードの こうか。必殺技は その キャラが 戦場に いると 安い
import { mine, theirs, hit, foeBest, shrink, T, foe1, bolt, single, killIt, exileIt, xBurn, regrow, aura } from './kit.js';

export const SP_START = 3;
export const spOf = (s) => s.P.sp ?? SP_START;
export const spMax = (s) => (s.P.bf.some((q) => q.def.spPlus) ? 7 : 5); // 花火が いると 7
export function addSP(s, E, n) {
  const was = spOf(s), now = Math.max(0, Math.min(spMax(s), was + n));
  s.P.sp = now;
  if (now !== was) E.L(s, `せんぎポイント ${was} ${n > 0 ? '＋' : '−'} ${Math.abs(n)} ＝ ${now}`);
}
const canSwing = (s, E, p) => !p.tapped && (!p.sick || E.hasKw(s, p, 'haste'));
const biggest = (s, E, f = () => true) => theirs(s, E).filter(f).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
const allFoes = (s, E, n) => { for (const t of [...theirs(s, E)]) E.damage(s, t, n, null); E.sba(s); };
const detain = (s, E, t) => { if (t && E.onBf(s, t)) { t.tapped = true; t.frozen = true; E.L(s, `${t.def.name} を タップ（つぎも おきない）`); } };
const foeThreat = (s, E) => theirs(s, E).some((t) => t.def.attacks !== false && E.power(s, t) >= 2);

// 戦技：ポイント 1つ、メインフェイズ、1ターンに max 回。sk = { label, play(s, p, E, ctx) → { score, run } , tgt?, apply?(s, E, picks, p) }
function spend(s, E, p) { addSP(s, E, -1); p.flags.turn.skill = (p.flags.turn.skill || 0) + 1; }
const skillAct = (sk, max = 1) => ({
  cost: 0, spUse: true, when: [1, 2], label: `せんぎ：${sk.label}`,
  can: (s, p) => spOf(s) >= 1 && (p.flags.turn.skill || 0) < max, cantWhy: 'せんぎポイントが ない か、この ターンは もう つかった',
  play: (s, p, E, ctx) => { const r = sk.play(s, p, E, ctx); return r && { score: r.score, run: (x) => { spend(s, E, p); r.run(x); } }; },
  ...(sk.tgt ? { tgt: sk.tgt, apply: (s, E, picks, x, p) => { spend(s, E, p); sk.apply(s, E, picks, p); } } : {}),
});
// この 弾の クリーチャー：攻撃で せんぎポイント ＋1
const trail = (x = {}) => {
  const { skill, skillMax, ...rest } = x;
  return {
    ...rest,
    onAttack: (s, p, E, atk, a) => { rest.onAttack?.(s, p, E, atk, a); if (p.side === 'P') addSP(s, E, 1); },
    acts: [...(skill ? [skillAct(skill, skillMax)] : []), ...(rest.acts || [])],
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

// レア・レジェンドの クリーチャー：せんぎポイントが 2 いじょう あれば、2 つかって 2マナ やすく 唱える（じどう）
const spCut = { spCut: 2, costLess: (s) => (spOf(s) >= 2 ? 2 : 0), onPay: (s, E) => { if (spOf(s) >= 2) { E.L(s, 'せんぎポイントで 2マナ やすく した'); addSP(s, E, -2); } } };
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
  }),
  SR07: trail({ skill: selfPump('二だんこうげき', 0, ['double']), pittari: (s, p, E) => { const b = foeBest(s, E, 2) || foeBest(s, E); if (b) hit(s, E, b.t, 2); } }),
  SR08: trail({ onAttack: (s, p, E) => { if (p.side !== 'P') return; E.hurt(s, 1, p); E.pump(p, 2, 0); } }),
  SR09: trail({
    skill: foeSkill('−1/−1カウンターを 2こ おく クリーチャー', 2, (s, E, t) => { E.addMinus(s, t, 2); E.sba(s); }),
    pittari: spPit,
  }),
  SR10: trail({ skill: foeSkill('−2/−2 する クリーチャー', 2, (s, E, t) => shrink(s, E, t, 2)) }),
  SR11: trail({ skill: pumpOther('＋2/＋2', 2, 2) }),
  SR12: trail({ pittari: (s, p, E) => { if (E.onBf(s, p)) p.tapped = false; addSP(s, E, 1); } }),
  SR13: trail({ allyDmgLess: 1 }),
  SR14: trail({
    skillMax: 3, skill: selfPump('＋2/＋0', 2),
  }),
  SR15: trail({ pittari: (s, p, E) => E.hitEnemy(s, 3, p) }),
  SR16: trail({ spPlus: true, etb: (s, p, E) => { if (p.side === 'P') addSP(s, E, 2); } }),
  SR17: trail({ upkeep: (s, p, E) => { if (p.side === 'P') E.gain(s, E.rollDie(s)); } }),
  SR19: { etb: (s, p, E) => { if (p.side === 'P') addSP(s, E, 3); }, upkeep: (s, p, E) => { if (p.side === 'P') addSP(s, E, 1); } },
  SR20: trail({ etb: (s, p, E) => { if (p.side === 'P') E.drawCard(s); } }),
  SR21: trail({
    skill: foeSkill('2点を あたえる クリーチャー', 2, (s, E, t) => hit(s, E, t, 2)), pittari: spPit,
  }),
  SR22: trail({
    anthem: (s, q, p) => (p !== q && p.side === q.side && E_isCr(p) ? [1, 0] : null),
    skill: foeSkill('タップする クリーチャー（つぎも おきない）', 0, detain, { pick: (s, E) => biggest(s, E, (t) => !t.frozen && t.def.attacks !== false) }),
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
  // フォフォ：ぼちの 必殺技を 手札に もどす
  SR31: trail({ skill: { label: 'ライフ ＋2・ぼちの 必殺技を てふだに', play: (s, p, E) => {
    const has = s.P.gy.some((c) => c.def.ultOf);
    return has || s.P.life < 15 ? { score: has ? 5 : 2, run: () => { E.gain(s, 2); regrow(s, E, (d) => !!d.ultOf); } } : null;
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
  // ---- 光円錐（MTG の カードの こうか。「元のカード」は docs/EXTRA.md 3.2） ----
  SR18: { equip: 3, eqP: 3, grant: (s, q, p) => (p.uid === q.attached ? ['trample', 'lifelink'] : null) }, // ロクソドンの戦槌
  SR35: { play: (s, E, ctx) => xBurn(s, E, ctx, 0), tgt: [{ side: 'E', face: true, label: 'X点を あたえる 相手' }], apply: (s, E, [[t]], x) => hit(s, E, t, x) }, // 火の玉
  SR36: { play: (s, E, ctx) => { const v = wipeValue(s, E, () => true); return v > 4 || (ctx.human && v > -99) ? { score: v, run: () => wipe(s, E) } : null; } }, // 審判の日
  SR37: { play: (s, E, ctx) => { const n = mine(s, E).filter((q) => canSwing(s, E, q)).length; return ctx.phase === 1 && n >= 2 ? { score: 3 * n, run: () => { for (const q of mine(s, E)) E.pump(q, 3, 3, ['trample']); } } : null; } }, // 踏み荒らし
  SR38: { ...split(2, (s, E) => E.drawCard(s)) }, // 電解
  SR56: single(2, 2, { kw: ['lifelink'] }), // 英雄の 瞬間
  SR57: foe1('ついほうする クリーチャー', exileIt), // 剣を鍬に
  SR58: aura('E', 'こうげきも ブロックも できなく する てきの クリーチャー', { pacify: true }), // 平和な心
  SR59: { equip: 2, eqP: 2, eqT: 2 }, // ヴァルショクの明けの星
  SR60: foe1('てふだに もどす（てきは やまふだの 上へ）クリーチャー', (s, E, t) => { E.bounce(s, t); E.sba(s); }, { score: 1 }), // 送還
  SR61: (() => { const b = bolt(4, (s, E) => E.hurt(s, 2, null)); return { ...b, play: (s, E, ctx) => (s.P.life > 6 || ctx.human ? b.play(s, E, ctx) : null) }; })(), // 精神の 爆発（じぶんに 2点）
  SR62: foe1('−3/−3 する クリーチャー', (s, E, t) => shrink(s, E, t, 3), { n: 3 }), // 最後の 喘ぎ
  SR63: foe1('はかいする 黒でない クリーチャー', killIt, { filter: (s, E, p) => !E.colorsOf(p.def).includes('K') }), // 破滅の刃
  SR64: aura('P', '＋2/＋1 する あなたの クリーチャー', { p: 2, t: 1 }), // 不浄の 力
  SR65: bolt(3), // 稲妻
  SR66: bolt(2), // ショック
  SR67: { equip: 2, grant: (s, q, p) => (p.uid === q.attached ? ['deathtouch', 'lifelink'] : null) }, // バジリスクの首輪
  SR68: single(3, 3), // 巨大化
  SR69: foe1('はかいする ひこうの クリーチャー', killIt, { filter: (s, E, p) => E.hasKw(s, p, 'flying') }), // 急落
  SR70: { // 捕食
    play: (s, E) => {
      const me = E.bestBuffTarget(s, null); if (!me) return null;
      const b = foeBest(s, E, E.power(s, me), (p) => E.power(s, p) < E.pt(s, me)[1] - me.dmg);
      return b ? { score: 5 + b.score, run: () => { E.fight(s, me, b.t); E.sba(s); } } : null;
    },
    tgt: [{ side: 'P', label: 'かくとうする あなたの クリーチャー' }, { side: 'E', label: 'かくとうする てきの クリーチャー' }],
    apply: (s, E, [[a], [b]]) => { E.fight(s, a, b); E.sba(s); },
  },
  // ---- 必殺技（その キャラが いると コストが 少なくなる） ----
  SR71: ult('SR01', 2, foe1('はかいする パワー4いじょうの クリーチャー', killIt, { filter: (s, E, p) => E.power(s, p) >= 4 })), // 巨怪 退治
  SR72: ult('SR06', 2, { play: (s, E) => ({ score: 7, run: () => E.token(s, 'P', T.soldier, 3) }) }), // 隊長の 号令
  SR73: ult('SR07', 2, { play: (s, E, ctx) => { const n = theirs(s, E).filter((t) => !t.frozen).length; return n || ctx.human ? { score: 2 + n * 2, run: () => { for (const t of theirs(s, E)) detain(s, E, t); } } : null; } }), // 眠り
  // 岸の 飲み込み：タフネスが 青の マナの 数 いかの クリーチャーを ぜんぶ もどす（じぶんの ものも）。2026-10-25 に サイクロンの裂け目から かえた（ゼンゼロの 星見雅「なごり雪」と かぶる ため）
  SR74: ult('SR14', 2, { play: (s, E, ctx) => { const n = blueMana(s, E); const hit = (q) => E.pt(s, q)[1] <= n; const v = (q) => E.power(s, q) + q.def.cost; const val = theirs(s, E).filter(hit).reduce((a, q) => a + v(q), 0) - 1.2 * mine(s, E).filter(hit).reduce((a, q) => a + v(q), 0); return val >= 4 || (ctx.human && theirs(s, E).some(hit)) ? { score: val, run: () => { E.L(s, `あおの マナ ${n}：タフネス ${n} いかを もどす`); for (const q of [...theirs(s, E), ...mine(s, E)].filter(hit)) E.bounce(s, q); E.sba(s); } } : null; } }),
  SR75: ult('SR09', 1, { play: (s, E, ctx) => { const v = wipeValue(s, E, (s2, q) => E.pt(s, q)[1] - q.dmg <= 2); return v > 3 || ctx.human ? { score: v, run: () => { for (const q of [...mine(s, E), ...theirs(s, E)]) E.pump(q, -2, -2); E.sba(s); } } : null; } }), // 蔓延
  SR76: ult('SR21', 1, foe1('はかいする クリーチャー', killIt)), // 英雄の 破滅
  SR77: ult('SR08', 2, { play: (s, E) => ({ score: 7, run: () => { E.hitEnemy(s, 4, null); E.gain(s, 4); } }) }), // 魂の 饗宴
  SR78: ult('SR04', 2, split(3)), // 弧状の 稲妻
  SR79: ult('SR15', 2, foe1('5点を あたえる クリーチャー', (s, E, t) => hit(s, E, t, 5), { n: 5 })), // 炎で 戦う
  SR80: ult('SR22', 2, { play: (s, E) => (E.basicsInLib(s) ? { score: 9, run: () => E.rampBasic(s, 2) } : null) }), // 爆発的 植生
};
for (const id of ['SR04', 'SR05', 'SR06', 'SR07', 'SR09', 'SR11', 'SR13', 'SR14', 'SR15', 'SR17', 'SR21', 'SR22', 'SR33', 'SR34']) S11[id] = { ...S11[id], ...spCut }; // 4マナ いじょうの レア・レジェンド
// あなたの マナゾーンの 青の カードの 数（岸の 飲み込み）
function blueMana(s, E) { return s.P.mana.filter((m) => E.colorsOf(m.def).includes('U')).length; }
function E_isCr(p) { return (p.def.types || []).includes('creature'); }
// 必殺技：その キャラ（who）が あなたの 戦場に いれば コスト − n（色の 1つぶんは のこる）
function ult(who, n, beh) { return { ...beh, ultOf: who, costMin: 1, costLess: (s) => (s.P.bf.some((q) => q.def.id === who) ? n : 0) }; }
// n点を わりふる（クリーチャーか 敵）。more は あとの こうか
function split(n, more) {
  return {
    play: (s, E) => ({ score: 6, run: () => { const pl = E.divide(s, n, theirs(s, E)); let left = n; for (const d of pl) { hit(s, E, d.t, d.n); left -= d.n; } if (left > 0) E.hitEnemy(s, left, null); more?.(s, E); } }),
    tgt: [{ side: 'E', face: true, max: n, divide: n, label: `${n}点を わりふる 相手` }],
    apply: (s, E, [al]) => { for (const d of al) hit(s, E, d.t, d.n); more?.(s, E); },
  };
}
// ぜんぶ はかい／ぜんぶ ちいさく：てきの ねうち − じぶんの ねうち（f に あう クリーチャー だけ）
function wipeValue(s, E, f) { const v = (q) => E.power(s, q) + q.def.cost; return theirs(s, E).filter((q) => f(s, q)).reduce((a, q) => a + v(q), 0) - 1.2 * mine(s, E).filter((q) => f(s, q)).reduce((a, q) => a + v(q), 0); }
function wipe(s, E) { for (const q of [...mine(s, E), ...theirs(s, E)]) E.destroy(s, q); E.sba(s); }
