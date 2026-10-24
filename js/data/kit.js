// カードを 書く ための 道具（第1弾〜の cards.js と、第3弾から あとの set3.js などで つかう）

export const cr = (id, name, rar, color, cost, pow, tou, sub, kw = [], x = {}) => ({ id, name, rar, color, cost, types: ['creature'], pow, tou, sub, kw, ...x });
export const sp = (id, name, rar, color, cost, type, x = {}) => ({ id, name, rar, color, cost, types: [type], kw: [], ...x });
export const pm = (id, name, rar, color, cost, types, x = {}) => ({ id, name, rar, color, cost, types, kw: [], ...x });

// 対象が もう いなければ（ほかの能力で 倒れたなど）、そのときに ねらいなおす
export const hit = (s, E, t, n) => {
  if (t !== 'face' && !E.onBf(s, t)) { const b = E.burnTarget(s, n, { mustHit: true }); if (!b) return null; t = b.t; }
  if (t === 'face') E.hitTarget(s, 'face', n, null); else E.damage(s, t, n, null);
  E.sba(s);
  return t;
};
// 人が遊ぶとき（ctx.human）は、倒せなくても 敵に当てられる
export const burn = (n, o = {}) => (s, E, ctx = {}) => { const b = E.burnTarget(s, n, { ...o, mustHit: !!ctx.human || o.mustHit }); return b ? { score: 6 + b.score, run: () => hit(s, E, b.t, n) } : null; };
// X のダメージ呪文：いちばん小さい X で倒せる敵、なければ本体に最大の X（工場はちょうど鍵の数）
export const xBurn = (s, E, ctx, bonus, after) => {
  for (let x = 1; x <= ctx.xMax; x++) {
    const b = E.burnTarget(s, x + bonus, {});
    if (b && (b.t !== 'face' || x === ctx.xMax || b.score >= 100)) return { score: 4 + Math.min(b.score, 30), x, run: (xx) => { const t = hit(s, E, b.t, b.score >= 100 ? x + bonus : xx + bonus); if (t && after) after(t); } };
  }
  return null;
};
// 荒々しい一撃：獰猛なら ＋2/＋2 して 格闘。ぴったりで 倒したら ＋1/＋1カウンター
export const savagePunch = (s, E, me, t) => {
  E.target(s, me); if (ferocious(s, E)) E.pump(me, 2, 2);
  E.fight(s, me, t);
  if (t.exact && E.onBf(s, me)) E.addCounters(s, me, 1);
};
// 光の矢の雨：割り振って、ぴったりで 倒した 1体につき 兵士
export const arrowRain = (s, E, plan) => {
  for (const d of plan) E.damage(s, d.t, d.n, null);
  E.sba(s);
  E.token(s, 'P', T.soldier, plan.filter((d) => d.t.exact).length);
};
export const draw = (n, score) => (s, E, ctx) => ({ score: (score ?? 4 * n) - (ctx.phase === 1 ? 1 : 0), run: () => E.drawCard(s, n) });
export const mine = (s, E) => E.creatures(s, 'P');
export const theirs = (s, E) => E.creatures(s, 'E');
export const isSub = (p, t) => (p.def.sub || []).includes(t);
export const ferocious = (s, E) => mine(s, E).some((p) => E.power(s, p) >= 4);
export const battalion = (atk) => atk.length >= 3;
// 集団戦術：攻撃している クリーチャーの パワーの 合計が 6 いじょう
export const packTactics = (s, E, atk) => E.totalPower(s, atk.map((a) => a.p).filter((q) => E.onBf(s, q))) >= 6;
// 激励：対象を ふやせるだけ ふやす（2つめから 1つにつき n マナ）
export const strive = (list, n, ctx) => list.slice(0, Math.max(1, 1 + Math.floor((ctx.manaLeft ?? 0) / n)));
export const single = (p, t, more = {}) => ({ trick: { kind: 'single', p, t, ...more }, singleRun: (s, E, q) => E.pump(q, p, t, more.kw || []) });
export const mass = (p, t, filter) => ({ trick: { kind: 'mass', p, t }, massRun: (s, E) => { for (const q of mine(s, E)) if (!filter || filter(q)) E.pump(q, p, t); } });

// ---- トークン ----
export const T = {
  soldier: cr('t_soldier', '兵士（へいし）', null, 'W', 0, 1, 1, ['soldier']),
  soldierLL: cr('t_soldierLL', '兵士（へいし）', null, 'W', 0, 1, 1, ['soldier'], ['lifelink']),
  soldierHaste: cr('t_soldierH', '兵士（へいし）', null, 'W', 0, 1, 1, ['soldier'], ['haste']),
  catSoldier: cr('t_cat', '猫（ねこ）・兵士（へいし）', null, 'W', 0, 1, 1, ['cat', 'soldier'], ['vigilance']),
  spirit: cr('t_spirit', 'スピリット', null, 'W', 0, 1, 1, ['spirit'], ['flying']),
  cleric: cr('t_cleric', 'クレリック', null, 'W', 0, 2, 1, ['cleric']),
  saproling: cr('t_sap', '苗木（なえぎ）', null, 'G', 0, 1, 1, ['saproling']),
  goblin: cr('t_goblin', 'ゴブリン', null, 'R', 0, 1, 1, ['goblin']),
  goblinHaste: cr('t_goblinH', 'ゴブリン', null, 'R', 0, 1, 1, ['goblin'], ['haste']),
  drake: cr('t_drake', 'ドレイク', null, 'U', 0, 2, 2, ['drake'], ['flying']),
  elemental: cr('t_elem', 'エレメンタル', null, 'R', 0, 1, 1, ['elemental']),
  myr: { ...cr('t_myr', 'マイア', null, '', 0, 1, 1, ['myr']), types: ['artifact', 'creature'] },
  wurmDT: { ...cr('t_wurmD', 'ワーム', null, '', 0, 3, 3, ['wurm'], ['deathtouch']), types: ['artifact', 'creature'] },
  wurmLL: { ...cr('t_wurmL', 'ワーム', null, '', 0, 3, 3, ['wurm'], ['lifelink']), types: ['artifact', 'creature'] },
  // 第2弾
  treasure: { ...pm('t_treasure', '宝物（たからもの）', null, '', 0, ['artifact']), treasure: true },
  wall: { ...cr('t_wall', '壁（かべ）', null, 'W', 0, 0, 4, ['wall'], ['defender']), types: ['artifact', 'creature'] },
  illusion: cr('t_illusion', 'イリュージョン', null, 'U', 0, 2, 2, ['illusion'], ['flying']),
  kraken: cr('t_kraken', 'クラーケン', null, 'U', 0, 8, 8, ['kraken']),
  satyr: cr('t_satyr', 'サテュロス', null, 'R', 0, 1, 1, ['satyr'], [], { cantBlock: true }),
  pegasus: cr('t_pegasus', 'ペガサス', null, 'W', 0, 2, 2, ['pegasus'], ['flying']),
  human: cr('t_human', '人間', null, 'W', 0, 1, 1, ['human']),
  shark: cr('t_shark', 'サメ', null, 'U', 0, 0, 0, ['shark'], ['flying']), // X/X は 出すときに きめる
  beast: cr('t_beast', 'ビースト', null, 'G', 0, 3, 3, ['beast']),
};
// プルフォロスの 介入：X/1 の エレメンタル（ターン終了時に 墓地へ）
export const elemX = (x) => ({ ...cr('t_elemX', 'エレメンタル', null, 'R', 0, x, 1, ['elemental'], ['trample', 'haste']), endStep: (s, p, E) => E.leave(s, p, 'gy') });

// 英雄譚：出たときと、自分の ターンの はじめ（手札の 補充の 前）に 伝承カウンターを 1こ 足して、その 章を 起こす。さいごの 章の あと 墓地へ
// 章 ch = { run(s, E, p, picks), tgt }。picks は 人が えらんだ 対象（ないときは AI が えらぶ）。1章の tgt は 唱える ときに えらぶ
export const ROMAN = ['', 'I', 'II', 'III'];
export const saga = (chs) => ({
  saga: chs, tgt: chs[0].tgt,
  etb: (s, p, E, o) => sagaStep(s, p, E, o.chosen),
  upkeep: (s, p, E) => sagaStep(s, p, E, undefined, true),
});
export function sagaStep(s, p, E, chosen, upkeep = false) {
  p.lore = (p.lore || 0) + 1;
  const ch = p.def.saga[p.lore - 1];
  E.L(s, `えいゆうたん：${p.def.name} ${ROMAN[p.lore]}`);
  const finish = () => { if (p.lore >= p.def.saga.length && E.onBf(s, p)) E.leave(s, p, 'gy'); };
  if (upkeep && s.ai.chapter && p.side === 'P') return Promise.resolve(s.ai.chapter(s, p, ch, ROMAN[p.lore])).then(finish);
  ch.run(s, E, p, chosen);
  finish();
}
// 消失：時間カウンター n こで 出る。自分の ターンの はじめに 1こ へる。0に なったら 墓地へ
export function vanishUpkeep(s, p, E) {
  if (!p.time) return;
  p.time--;
  E.L(s, `しょうしつ：${p.def.name}（のこり ${p.time}）`);
  p.def.onTimeRemoved?.(s, p, E);
  if (p.time <= 0 && E.onBf(s, p)) E.leave(s, p, 'gy', { died: E.isCreature(p) });
}
export const vanish = (n, x = {}) => ({ vanishing: n, ...x, etb: (s, p, E, o) => { p.time = typeof n === 'function' ? n(s, p, E) : n; x.etb?.(s, p, E, o); }, upkeep: vanishUpkeep });
export const hb = (s, p) => (s[p.side].hand || [1]).length === 0; // 暴勇（手札が 0まい）
// 敵の クリーチャーで 止めたい もの（攻撃してくる もの・頭）
export const bestFreeze = (s, E) => theirs(s, E).filter((p) => !p.iceBy && !s.floor.untargetable?.(s, p, E) && (p.def.attacks || p.def.headDmg || s.floor.id === 'pvp'))
  .sort((a, b) => (b.def.headDmg || E.power(s, b)) - (a.def.headDmg || E.power(s, a)))[0];
export const bestIn = (list, f) => list.filter(f).sort((a, b) => b.def.cost - a.def.cost || (RANK[b.def.rar] || 0) - (RANK[a.def.rar] || 0))[0];
export const RANK = { C: 1, U: 2, R: 3, L: 4 };
export const lowestKeep = (s, E) => [...s.P.hand].sort((a, b) => E.keepValue(s, a) - E.keepValue(s, b))[0];

// ---- 第3弾から あと ----
// トークン（第3弾〜）
Object.assign(T, {
  zombie: cr('t_zombie', 'ゾンビ', null, 'K', 0, 2, 2, ['zombie']),
  insect: cr('t_insect', '昆虫（こんちゅう）', null, 'K', 0, 1, 1, ['insect']),
  snake: cr('t_snake', 'ヘビ', null, 'G', 0, 1, 1, ['snake'], ['deathtouch']),
  warriorV: cr('t_warriorV', '戦士（せんし）', null, 'W', 0, 1, 1, ['warrior'], ['vigilance']),
});
export const isCr = (d) => (d.types || []).includes('creature');
const pips = (d) => [...(d.color || '')].length;
// 人が えらんだ 対象（AI の ときは undefined、えらばなかったら null）
export const chosen1 = (o, i = 0) => (o?.chosen ? (o.chosen[i]?.[0] ?? null) : undefined);
// 墓地から 手札へ（いちばん 強い もの）
export function regrow(s, E, f = () => true, except = null) {
  const c = bestIn(s.P.gy, (x) => x !== except && f(x.def));
  if (!c) return null;
  s.P.gy.splice(s.P.gy.indexOf(c), 1); s.P.hand.push(c);
  E.L(s, `ぼちから てふだへ：${c.def.name}`);
  return c;
}
// ライブラリーの 上から n まいを 見て、k まいを 手札に、のこりは 一番下へ
export function dig(s, E, n, k, f = () => true) {
  const top = s.P.lib.splice(0, n);
  const pick = [...top].filter((c) => f(c.def)).sort((a, b) => E.keepValue(s, b) - E.keepValue(s, a)).slice(0, k);
  s.P.hand.push(...pick);
  s.P.lib.push(...top.filter((c) => !pick.includes(c)));
  E.L(s, `${n}まい 見て ${pick.length}まいを てふだへ`);
}
// てきの クリーチャーで いちばん ねらいたい もの（n 点で たおせる もの）
export const foeBest = (s, E, n = 99, filter) => { const b = E.burnTarget(s, n, { creatureOnly: true, filter }); return b && b.t !== 'face' ? b : null; };
// −a/−b（ターン終了時まで）
export const shrink = (s, E, t, a, b = a) => { if (!t || !E.onBf(s, t)) return; E.pump(t, -a, -b); E.sba(s); };
// 敵の クリーチャー 1体を ねらう（AI は play、人は tgt で えらぶ）。o.n は たおせる 大きさ
export const foe1 = (label, f, o = {}) => ({
  play: (s, E, ctx) => {
    const b = foeBest(s, E, typeof o.n === 'function' ? o.n(s, E, ctx) : (o.n ?? 99), o.filter && ((p) => o.filter(s, E, p)));
    return b ? { score: (o.score ?? 6) + b.score, run: () => f(s, E, b.t) } : null;
  },
  tgt: [{ side: o.side || 'E', label, filter: o.filter }], apply: (s, E, [[t]], x) => f(s, E, t, x),
});
// N点（クリーチャーか 敵）
export const bolt = (n, more) => ({
  play: (s, E, ctx = {}) => { const b = E.burnTarget(s, n, { mustHit: !!ctx.human }); return b ? { score: 6 + b.score, run: () => { hit(s, E, b.t, n); more?.(s, E); } } : null; },
  tgt: [{ side: 'E', face: true, label: `${n}点を あたえる 相手` }], apply: (s, E, [[t]]) => { hit(s, E, t, n); more?.(s, E); },
});
export const killIt = (s, E, t) => { if (t && E.onBf(s, t)) { E.destroy(s, t); E.sba(s); } };
export const exileIt = (s, E, t) => { if (t && E.onBf(s, t)) { E.exile(s, t); E.sba(s); } };
// 敵は パワーが いちばん 小さい クリーチャーを 墓地に 置く
export function edict(s, E) {
  const t = theirs(s, E).filter((p) => !s.floor.cantLeave?.(s, p, E)).sort((a, b) => E.power(s, a) - E.power(s, b))[0];
  if (t) { E.leave(s, t, 'gy', { died: true }); E.sba(s); }
  return t;
}
// 自分の クリーチャーで 墓地に 置いても よい もの（トークン・パワー 1 いか）
export const fodder = (s, E, except) => mine(s, E).filter((q) => q !== except && (q.token || (E.power(s, q) <= 1 && !q.def.mana && !q.def.legend)))
  .sort((a, b) => (b.token - a.token) || E.power(s, a) - E.power(s, b));
// 貪食 n：出るとき、ほかの 自分の クリーチャーを 墓地に 置いて、1体に つき ＋1/＋1カウンター n こ
export const devour = (n, after) => ({
  devour: n,
  tgt: [{ side: 'P', min: 0, max: 9, label: `どんしょく：ぼちに おく クリーチャー（1体に つき ＋1/＋1カウンター ${n}こ）` }],
  etb: (s, p, E, o) => {
    const eat = o.chosen ? (o.chosen[0] || []) : fodder(s, E, p);
    let k = 0;
    for (const q of eat) if (q !== p && E.onBf(s, q) && E.leave(s, q, 'gy', { died: true })) k++;
    p.devoured = k;
    if (k) { E.L(s, `どんしょく ${n}：${k}体 × ${n}`); E.addCounters(s, p, k * n); }
    E.sba(s);
    after?.(s, p, E, k);
  },
});
// 探査：墓地の カード 1まいで 1マナ ぶん（色の ぶんは はらう）
export const delve = (x = {}) => ({ delve: true, costLess: (s) => s.P.gy.length, ...x });
export const delveOf = (d) => ({ ...delve(), costMin: pips(d) });
// 門の 五神：数の 条件が そろわないと 攻撃も ブロックも できない
export const godUnless = (f) => ({ cantAttack: (s, p, E) => !f(s, p, E), cantBlock: (s, p, E) => !f(s, p, E) });
// 墓地の その 種類の カードの 数
export const gyCount = (s, t) => s.P.gy.filter((c) => (c.def.types || []).includes(t)).length;
Object.assign(T, {
  food: {
    ...pm('t_food', '食物（しょくもつ）', null, '', 0, ['artifact']), food: true,
    acts: [{ cost: 2, tap: true, sac: true, when: [1, 2], label: '2・タップ・ぼちに おく：3点の ライフを える', play: (s, p, E) => (s.P.life <= 14 ? { score: 3, run: () => { E.leave(s, p, 'gy'); E.gain(s, 3); } } : null) }],
  },
  knightV: cr('t_knightV', '騎士（きし）', null, 'W', 0, 2, 2, ['knight'], ['vigilance']),
  rat: cr('t_rat', 'ネズミ', null, 'W', 0, 1, 1, ['rat']),
  faerie: cr('t_faerie', 'フェアリー', null, 'U', 0, 1, 1, ['faerie'], ['flying']),
  golemE: { ...cr('t_golemE', 'ゴーレム', null, '', 0, 3, 3, ['golem']), types: ['artifact', 'enchantment', 'creature'] },
  // そのターン だけの マナ（祠）：宝物と 同じく 使うと きえる。ターンの おわりにも きえる
  shard: { ...pm('t_shard', 'マナの かけら', null, '', 0, ['artifact']), treasure: true, endStep: (s, p, E) => E.leave(s, p, 'gy') },
});
// 祠の 数
export const shrines = (s, side = 'P') => s[side].bf.filter((q) => (q.def.sub || []).includes('shrine')).length;
// 星座：これか ほかの エンチャントが あなたの 戦場に 出るたび（self が false なら ほかの だけ）
export const constellation = (f, self = true) => ({
  etb: self ? (s, p, E) => { if (p.side === 'P') f(s, p, E); } : undefined,
  onOtherEnter: (s, p, q, E) => { if (p.side === 'P' && q.side === 'P' && (q.def.types || []).includes('enchantment')) f(s, p, E, q); },
});
// 前兆：瞬速の エンチャント。出たときの 効果と「3（色）、これを 墓地に 置く：占術 2」
export const omen = (c, etb) => ({
  flash: true, etb: (s, p, E, o) => { if (p.side === 'P') return etb(s, p, E, o); },
  acts: [{ cost: 3, req: [c], when: [2], label: 'ぼちに おいて 占術（せんじゅつ） 2', play: (s, p, E) => (s.P.hand.length <= 2 ? { score: 1, run: () => { E.leave(s, p, 'gy'); return E.scry(s, 2); } } : null) }],
});
// 出来事：kind は 'sorcery' か 'instant'。play は AI、tgt/apply は 人が えらぶ
export const adventure = (name, cost, req, kind, spell) => ({ adv: { name, cost, req, kind, ...spell } });
// オーラ：side の クリーチャーに つける（AI は いちばん よい 相手）
export const auraHost = (s, E, side, filter) => (side === 'E'
  ? foeBest(s, E, 99, filter && ((p) => filter(s, E, p)))?.t
  : E.bestBuffTarget(s, null, { ready: true }));
export const aura = (side, label, x = {}) => ({
  aura: true,
  tgt: [{ side, label, filter: x.filter }],
  need: (s, E) => !!auraHost(s, E, side, x.filter),
  eqP: x.p || 0, eqT: x.t || 0, eqPT: x.pt,
  grant: x.kw ? (s, q, p) => (p.uid === q.attached ? x.kw : null) : undefined,
  pacify: x.pacify,
  etb: (s, p, E, o) => {
    let h = chosen1(o);
    if (h === undefined) h = auraHost(s, E, side, x.filter);
    if (!h || !E.onBf(s, h)) { E.leave(s, p, 'gy'); return; }
    E.attach(s, p, h);
    x.onAttach?.(s, p, E, h);
  },
});
export const food = (s, E, n = 1) => E.token(s, 'P', T.food, n);
export const foods = (s) => s.P.bf.filter((q) => q.def.food);
export const knights = (s, side = 'P') => s[side].bf.filter((q) => (q.def.sub || []).includes('knight')).length;
Object.assign(T, {
  fractal: cr('t_fractal', 'フラクタル', null, 'GU', 0, 0, 0, ['fractal']),
  pest: cr('t_pest', 'ペスト', null, 'KG', 0, 1, 1, ['pest'], [], { onDie: (s, p, E) => { if (p.side === 'P') E.gain(s, 1); } }),
  inkling: cr('t_inkling', 'インクリング', null, 'WK', 0, 2, 1, ['inkling'], ['flying']),
  spiritRW: cr('t_spiritRW', 'スピリット', null, 'RW', 0, 3, 2, ['spirit']),
  elemGU: cr('t_elemGU', 'エレメンタル', null, 'GU', 0, 4, 4, ['elemental']),
  spirit32: cr('t_spirit32', 'スピリット', null, '', 0, 3, 2, ['spirit']),
  warriorFS: cr('t_warriorFS', '戦士（せんし）', null, 'W', 0, 1, 1, ['warrior'], ['first']),
});
export const isSpellDef = (d) => (d.types || []).includes('instant') || (d.types || []).includes('sorcery');
// 魔技：インスタントか ソーサリーを 唱えるか コピーするたび
export const magecraft = (f) => ({
  onCast: (s, p, d, E) => { if (p.side === 'P' && isSpellDef(d)) f(s, p, E, d); },
  onCopy: (s, p, d, E) => { if (p.side === 'P' && isSpellDef(d)) f(s, p, E, d); },
});
// フラクタル（0/0 に ＋1/＋1カウンター X こ）
export const fractal = (s, E, x) => (x > 0 ? E.token(s, 'P', T.fractal, 1, { ctr: x }) : []);
// 学習：レッスンの 3まいから 1まいを えらんで 手札に（人が 遊ぶ ときも AI が えらぶ）
export const LESSONS = [];
export function learn(s, E) {
  if (!LESSONS.length) return;
  const three = [];
  for (let i = 0; i < 3; i++) three.push(LESSONS[Math.floor(s.rng() * LESSONS.length)]);
  const mana = s.P.mana.length;
  const d = three.sort((a, b) => (b.cost <= mana + 1) - (a.cost <= mana + 1) || (RANK[b.rar] || 0) - (RANK[a.rar] || 0) || b.cost - a.cost)[0];
  s.P.hand.push(E.card(d));
  E.L(s, `がくしゅう：${three.map((x) => x.name).join('・')} から ${d.name}`);
}
// 再帰（さいき）を ふせぐ（パワーの 合計で 強く なる カードどうし）
export function guard(s, k, f, dflt) {
  if (s[k]) return dflt;
  s[k] = true;
  try { return f(); } finally { s[k] = false; }
}
// 自分の クリーチャーの パワーの 合計（それ じしんを のぞく ときは except）
export const powerSum = (s, E, side, except) => guard(s, '_psum', () => E.creatures(s, side).filter((q) => q !== except).reduce((t, q) => t + Math.max(0, E.power(s, q)), 0), 0);
// 2つの モードを えらぶ（命令）：AI は 点の 高い 2つ
export const command = (modes) => ({
  choose: 2,
  modes: modes.map((m) => ({ label: m.label, tgt: m.tgt, apply: m.apply })),
  play: (s, E, ctx) => {
    const sc = modes.map((m) => ({ m, v: m.ai?.(s, E, ctx) })).filter((x) => x.v && x.v.score > 0).sort((a, b) => b.v.score - a.v.score).slice(0, 2);
    if (sc.length < 2) return null;
    return { score: sc[0].v.score + sc[1].v.score, run: () => { for (const x of sc) x.v.run(); } };
  },
});

// ---- アルケミー（デジタル 限定） ----
// cards.js が うめる（BY_ID・パックに 入る カード）。set ファイルから cards.js を import すると 輪に なるので ここを 通す
export const REG = { byId: {}, all: [] };
const pipsOf = (d) => [...(d.color || '')].length;
// 永久に：カードの 中身を かきかえる（手札・やまふだ・墓地に もどっても のこる）
export function perp(c, f) { const d = { ...c.def, perp: true }; f(d); c.def = d; if (c.card) c.card = d; return d; }
const addTo = (v, n) => (typeof v === 'function' ? (s, p, E) => v(s, p, E) + n : (v ?? 0) + n);
export const perpPT = (c, a, b) => perp(c, (d) => { d.pow = addTo(d.pow, a); d.tou = addTo(d.tou, b); });
export const perpKw = (c, k) => perp(c, (d) => { d.kw = [...new Set([...(d.kw || []), k])]; });
export const perpCost = (c, n) => perp(c, (d) => { d.cost = Math.max(pipsOf(d), d.cost - n); });
// 戦場の パーマネントを 永久に（p.def と p.card の 両方）
export function perpPerm(p, f) { const d = { ...p.def, perp: true }; f(d); p.def = d; if (!p.token) p.card = d; }
// 探す：やまふだから 条件に あう カードを ランダムに 1まい 手札へ
export function seek(s, E, f) {
  const list = s.P.lib.filter((c) => f(c.def));
  if (!list.length) { E.L(s, 'さがす：あう カードが なかった'); return null; }
  const c = list[Math.floor(s.rng() * list.length)];
  s.P.lib.splice(s.P.lib.indexOf(c), 1); s.P.hand.push(c);
  E.L(s, `さがした：${c.def.name}`);
  return c;
}
// 創出：カードを 手札に 作る
export function conjure(s, E, d) { if (!d) return null; const c = E.card(d); s.P.hand.push(c); E.L(s, `そうしゅつ：${d.name}`); return c; }
// 呪文書：本から 3まい 出して 1まい えらぶ（AI が えらぶ）
export const BOOKS = {
  tashizan: ['W12', 'W13', 'W15', 'W31', 'U03', 'U13', 'G04', 'G09', 'G18', 'G30', 'R04', 'R10', 'R21', 'R30', 'RW01'],
  kuku: ['W01', 'W04', 'W19', 'W21', 'U06', 'U38', 'G07', 'G35', 'R01', 'R06', 'R20', 'R24', 'R38', 'RW01', 'UR04'],
  pittari: ['W05', 'W13', 'W31', 'U06', 'G08', 'G19', 'G27', 'G30', 'R04', 'R10', 'R11', 'R15', 'R22', 'R30', 'R31'],
  dragon: ['R23', 'R26', 'R36', 'R37', 'WU04', 'RW04', 'UR03', 'KR01', 'R54', 'R63', 'WK06', 'UR06', 'KG06', 'RW06', 'GU06'],
  meikai: ['K03', 'K04', 'K05', 'K06', 'K11', 'K12', 'K13', 'K14', 'K17', 'K19', 'K21', 'K23', 'K24', 'K25', 'K38'],
};
export function draft(s, E, book, after) {
  const ids = book === 'all' ? REG.all.map((d) => d.id) : BOOKS[book];
  const three = [];
  for (let i = 0; i < 3; i++) three.push(REG.byId[ids[Math.floor(s.rng() * ids.length)]]);
  const mana = s.P.mana.length;
  const d = three.filter(Boolean).sort((a, b) => (b.cost <= mana + 1) - (a.cost <= mana + 1) || (RANK[b.rar] || 0) - (RANK[a.rar] || 0) || b.cost - a.cost)[0];
  if (!d) return null;
  E.L(s, `ドラフト：${three.map((x) => x?.name).join('・')} から ${d.name}`);
  const c = conjure(s, E, d);
  after?.(c);
  return c;
}
// 強度：同じ 名前の カードで いっしょ（たたかいの あいだ）
export const intensity = (s, d) => s.P.flags.int?.[d.id] ?? d.intensity ?? 0;
export function addIntensity(s, d, n, wrap) {
  s.P.flags.int ||= {};
  let v = intensity(s, d) + n;
  if (wrap && v > wrap) v = 1;
  s.P.flags.int[d.id] = v;
}
// 二体掛り：攻撃したとき トークンで ないなら、同じ カードを 手札に 創出。その あと どちらも 二体掛りを なくす
export const doubleTeam = {
  doubleTeam: true,
  onAttack: (s, p, E) => {
    if (p.token || p.side !== 'P' || !p.def.doubleTeam) return;
    perpPerm(p, (d) => { d.doubleTeam = false; });
    const c = conjure(s, E, p.card);
    if (c) perp(c, (d) => { d.doubleTeam = false; });
  },
};
