// カード（第1弾 126種＋きほんカード5種＋トークン）。文章は docs/cards/*.md、ここはルールエンジン用のデータ
// cost は合計マナ。color は色（2色は 'WG' など）。play / react / trick は AI の使いどころ（シミュレーション用）

const cr = (id, name, rar, color, cost, pow, tou, sub, kw = [], x = {}) => ({ id, name, rar, color, cost, types: ['creature'], pow, tou, sub, kw, ...x });
const sp = (id, name, rar, color, cost, type, x = {}) => ({ id, name, rar, color, cost, types: [type], kw: [], ...x });
const pm = (id, name, rar, color, cost, types, x = {}) => ({ id, name, rar, color, cost, types, kw: [], ...x });

// 対象が もう いなければ（ほかの能力で 倒れたなど）、そのときに ねらいなおす
const hit = (s, E, t, n) => {
  if (t !== 'face' && !E.onBf(s, t)) { const b = E.burnTarget(s, n, { mustHit: true }); if (!b) return null; t = b.t; }
  if (t === 'face') E.hitTarget(s, 'face', n, null); else E.damage(s, t, n, null);
  E.sba(s);
  return t;
};
// 人が遊ぶとき（ctx.human）は、倒せなくても 敵に当てられる
const burn = (n, o = {}) => (s, E, ctx = {}) => { const b = E.burnTarget(s, n, { ...o, mustHit: !!ctx.human || o.mustHit }); return b ? { score: 6 + b.score, run: () => hit(s, E, b.t, n) } : null; };
// X のダメージ呪文：いちばん小さい X で倒せる敵、なければ本体に最大の X（工場はちょうど鍵の数）
const xBurn = (s, E, ctx, bonus, after) => {
  for (let x = 1; x <= ctx.xMax; x++) {
    const b = E.burnTarget(s, x + bonus, {});
    if (b && (b.t !== 'face' || x === ctx.xMax || b.score >= 100)) return { score: 4 + Math.min(b.score, 30), x, run: (xx) => { const t = hit(s, E, b.t, b.score >= 100 ? x + bonus : xx + bonus); if (t && after) after(t); } };
  }
  return null;
};
// 荒々しい一撃：獰猛なら ＋2/＋2 して 格闘。ぴったりで 倒したら ＋1/＋1カウンター
const savagePunch = (s, E, me, t) => {
  E.target(s, me); if (ferocious(s, E)) E.pump(me, 2, 2);
  E.fight(s, me, t);
  if (t.exact && E.onBf(s, me)) E.addCounters(s, me, 1);
};
// 光の矢の雨：割り振って、ぴったりで 倒した 1体につき 兵士
const arrowRain = (s, E, plan) => {
  for (const d of plan) E.damage(s, d.t, d.n, null);
  E.sba(s);
  E.token(s, 'P', T.soldier, plan.filter((d) => d.t.exact).length);
};
const draw = (n, score) => (s, E, ctx) => ({ score: (score ?? 4 * n) - (ctx.phase === 1 ? 1 : 0), run: () => E.drawCard(s, n) });
const mine = (s, E) => E.creatures(s, 'P');
const theirs = (s, E) => E.creatures(s, 'E');
const isSub = (p, t) => (p.def.sub || []).includes(t);
const ferocious = (s, E) => mine(s, E).some((p) => E.power(s, p) >= 4);
const battalion = (atk) => atk.length >= 3;
// 集団戦術：攻撃している クリーチャーの パワーの 合計が 6 いじょう
const packTactics = (s, E, atk) => E.totalPower(s, atk.map((a) => a.p).filter((q) => E.onBf(s, q))) >= 6;
// 激励：対象を ふやせるだけ ふやす（2つめから 1つにつき n マナ）
const strive = (list, n, ctx) => list.slice(0, Math.max(1, 1 + Math.floor((ctx.manaLeft ?? 0) / n)));
const single = (p, t, more = {}) => ({ trick: { kind: 'single', p, t, ...more }, singleRun: (s, E, q) => E.pump(q, p, t, more.kw || []) });
const mass = (p, t, filter) => ({ trick: { kind: 'mass', p, t }, massRun: (s, E) => { for (const q of mine(s, E)) if (!filter || filter(q)) E.pump(q, p, t); } });

// ---- トークン ----
export const T = {
  soldier: cr('t_soldier', '兵士', null, 'W', 0, 1, 1, ['soldier']),
  soldierLL: cr('t_soldierLL', '兵士', null, 'W', 0, 1, 1, ['soldier'], ['lifelink']),
  soldierHaste: cr('t_soldierH', '兵士', null, 'W', 0, 1, 1, ['soldier'], ['haste']),
  catSoldier: cr('t_cat', '猫・兵士', null, 'W', 0, 1, 1, ['cat', 'soldier'], ['vigilance']),
  spirit: cr('t_spirit', 'スピリット', null, 'W', 0, 1, 1, ['spirit'], ['flying']),
  cleric: cr('t_cleric', 'クレリック', null, 'W', 0, 2, 1, ['cleric']),
  saproling: cr('t_sap', '苗木', null, 'G', 0, 1, 1, ['saproling']),
  goblin: cr('t_goblin', 'ゴブリン', null, 'R', 0, 1, 1, ['goblin']),
  goblinHaste: cr('t_goblinH', 'ゴブリン', null, 'R', 0, 1, 1, ['goblin'], ['haste']),
  drake: cr('t_drake', 'ドレイク', null, 'U', 0, 2, 2, ['drake'], ['flying']),
  elemental: cr('t_elem', 'エレメンタル', null, 'R', 0, 1, 1, ['elemental']),
  myr: { ...cr('t_myr', 'マイア', null, '', 0, 1, 1, ['myr']), types: ['artifact', 'creature'] },
  wurmDT: { ...cr('t_wurmD', 'ワーム', null, '', 0, 3, 3, ['wurm'], ['deathtouch']), types: ['artifact', 'creature'] },
  wurmLL: { ...cr('t_wurmL', 'ワーム', null, '', 0, 3, 3, ['wurm'], ['lifelink']), types: ['artifact', 'creature'] },
};

// ---- 緑 ----
const G = [
  cr('G01', '森の ちいさな エルフ', 'C', 'G', 1, 1, 1, ['elf'], [], { mana: ['G'] }),
  cr('G02', '旅する サテュロス', 'C', 'G', 2, 1, 2, ['satyr'], [], { mana: 'any' }),
  cr('G03', '生きている トーテム', 'C', 'G', 4, 2, 3, ['elemental'], ['convoke'], {
    etb: (s, p, E, o) => { const t = o.chosen ? o.chosen[0]?.[0] : E.bestBuffTarget(s, p); if (t) E.addCounters(s, t, E.formidable(s) ? 2 : 1); },
  }),
  sp('G04', '勇気の あつまり', 'C', 'G', 2, 'instant', { kw: ['convoke'], ...single(2, 2) }),
  cr('G05', '森の 大ワーム', 'C', 'G', 7, 5, 5, ['wurm'], ['convoke', 'trample']),
  sp('G06', '芽ばえの むれ', 'U', 'G', 2, 'instant', {
    kw: ['convoke'], backToHand: true,
    play: (s, E, ctx) => (ctx.phase === 2 ? { score: 3, run: () => E.token(s, 'P', T.saproling) } : null),
  }),
  sp('G07', 'みんなの いきおい', 'U', 'G', 7, 'sorcery', {
    kw: ['convoke'],
    play: (s, E, ctx) => {
      if (ctx.phase !== 1) return null;
      const n = E.readyAttackers(s).length;
      return n >= 2 ? { score: 4 * n, run: () => { for (const q of mine(s, E)) E.pump(q, 3, 3); } } : null;
    },
  }),
  // 緑赤
  sp('G08', '荒々しい 一撃', 'C', 'G', 1, 'sorcery', {
    play: (s, E) => {
      const me = E.bestBuffTarget(s, null); if (!me) return null;
      const bonus = ferocious(s, E) ? 2 : 0;
      const p = E.power(s, me) + bonus;
      const b = E.burnTarget(s, p, { creatureOnly: true }); if (!b) return null;
      return { score: 6 + b.score, run: () => savagePunch(s, E, me, b.t) };
    },
  }),
  sp('G09', '巨大化', 'C', 'G', 2, 'instant', single(4, 4)),
  cr('G10', '見習いの 射手', 'C', 'G', 2, 1, 4, ['human', 'archer'], ['reach', 'training']),
  cr('G11', 'ふみならす 大鹿の むれ', 'C', 'G', 5, 5, 5, ['elk'], [], {
    onAttack: (s, p, E) => { if (E.formidable(s)) for (const q of mine(s, E)) E.pump(q, 0, 0, ['trample']); },
  }),
  cr('G12', '野生の 後継者', 'U', 'G', 2, 2, 2, ['human', 'warrior'], ['deathtouch'], {
    onAttack: (s, p, E) => { if (ferocious(s, E)) E.pump(p, 1, 1); },
  }),
  cr('G13', 'ネシアンの アスプ', 'U', 'G', 5, 4, 5, ['snake'], ['reach'], {
    acts: [{ cost: 7, req: ['G'], monstrosity: true, when: [1], play: (s, p, E) => ({ score: 8, run: () => E.addCounters(s, p, 4) }) }],
  }),
  sp('G14', '竜鱗の 恵み', 'U', 'G', 4, 'instant', {
    play: (s, E, ctx) => {
      if (ctx.phase !== 2) return null;
      const t = E.bestBuffTarget(s, null); return t ? { score: 5, run: () => { E.target(s, t); E.addCounters(s, t, 2); t.tapped = false; } } : null;
    },
  }),
  cr('G15', 'ガラクの 群れ率い', 'R', 'G', 5, 4, 4, ['wolf'], [], {
    onOtherEnter: (s, p, q, E) => { if (q.side === 'P' && E.isCreature(q) && E.power(s, q) >= 3) E.drawCard(s); },
  }),
  cr('G16', '狩り呼びの スーラク', 'R', 'G', 4, 5, 4, ['human', 'warrior'], [], {
    combatStart: (s, p, E) => {
      if (!E.formidable(s)) return;
      const t = mine(s, E).filter((q) => q.sick && !q.tapped).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
      if (t) E.pump(t, 0, 0, ['haste']);
    },
  }),
  cr('G17', '世界を 喰らう者 ポルクラノス', 'L', 'G', 4, 5, 5, ['hydra'], [], {
    acts: [{
      cost: 1, req: ['G'], x: true, monstrosity: true, when: [1, 2],
      play: (s, p, E, ctx) => {
        if (ctx.xMax < 2) return null;
        const x = ctx.xMax;
        return { score: 4 + x * 2, x, run: (xx) => { E.addCounters(s, p, xx); for (const d of E.divide(s, xx, theirs(s, E).filter((q) => !s.floor.untargetable?.(s, q, E)))) E.damage(s, d.t, d.n, null); } };
      },
    }],
  }),
  // 青緑
  sp('G18', '豊かな 成長', 'C', 'G', 2, 'sorcery', { play: (s) => ({ score: s.P.mana.length < 6 ? 14 : 2, run: () => api_rampTop(s) }) }),
  sp('G19', '弱者の 選別', 'C', 'G', 4, 'sorcery', {
    play: (s, E) => {
      const me = E.bestBuffTarget(s, null); if (!me) return null;
      const b = E.burnTarget(s, E.power(s, me) + 1, { creatureOnly: true }); if (!b) return null;
      return { score: 6 + b.score, run: () => { E.target(s, me); E.addCounters(s, me, 1); E.fight(s, me, b.t); } };
    },
  }),
  cr('G20', '実験体 一号', 'C', 'G', 1, 1, 1, ['human', 'ooze'], ['evolve']),
  cr('G21', '蔦草通りの 住人', 'U', 'G', 3, 2, 3, ['elf', 'warrior'], [], {
    onOtherEnter: (s, p, q, E) => { if (q.side === 'P' && E.isCreature(q) && E.colorsOf(q.def).includes('G')) { const t = E.bestBuffTarget(s, null); if (t) { E.target(s, t); E.addCounters(s, t, 1); } } },
  }),
  sp('G22', '耕作', 'U', 'G', 3, 'sorcery', {
    play: (s, E) => ({ score: s.P.mana.length < 7 ? 13 : 4, run: () => { api_rampTop(s); E.drawCard(s); } }),
  }),
  cr('G23', '魔力喰らいの ハイドラ', 'R', 'G', 2, 1, 1, ['hydra'], ['trample'], {
    onAnyCast: (s, p, d, who, E) => E.addCounters(s, p, 1),
  }),
  pm('G24', '硬化した 鱗', 'R', 'G', 1, ['enchantment'], { scales: true }),
  cr('G25', 'ジョラーガの 木語り', 'R', 'G', 2, 1, 1, ['elf', 'druid'], [], {
    levels: [{ at: 1, pow: 1, tou: 2, mana: ['G'], manaN: 2 }, { at: 5, pow: 1, tou: 4, mana: 'any', manaN: 3 }], levelMax: 5,
    acts: [{ cost: 2, req: ['G'], levelUp: true, when: [1, 2], play: (s, p) => ({ score: p.level < 5 ? 6 : 0, run: () => {} }) }],
  }),
  cr('G26', '原初の ハイドラ', 'L', 'G', 1, 0, 0, ['hydra'], [], {
    x: true,
    play: (s, E, ctx) => (ctx.xMax >= 2 ? { score: 10 + ctx.xMax * 4, run: () => {} } : null),
    upkeep: (s, p, E) => E.addCounters(s, p, p.ctr),
    kwFn: (s, p) => (p.ctr >= 10 ? ['trample'] : null),
  }),
];

// ---- 白 ----
const W = [
  sp('W01', '警報の かね', 'C', 'W', 2, 'instant', { play: (s, E) => ({ score: 7, run: () => E.token(s, 'P', T.soldier, 2) }) }),
  cr('W02', 'おともの 騎士', 'C', 'W', 3, 2, 2, ['human', 'knight'], ['first'], { etb: (s, p, E) => E.token(s, 'P', T.soldier) }),
  cr('W03', 'ニクスの 毛皮の ひつじ', 'C', 'W', 2, 0, 5, ['sheep'], ['defender'], { upkeep: (s, p, E) => E.gain(s, 1) }),
  sp('W04', '三つの たましい', 'C', 'W', 6, 'sorcery', { kw: ['convoke'], play: (s, E) => ({ score: 15, run: () => E.token(s, 'P', T.spirit, 3) }) }),
  sp('W05', 'まばゆい 光', 'C', 'W', 3, 'instant', {
    kw: ['convoke'], reactive: true,
    react: (s, E, ctx) => {
      const t = ctx.attackers?.filter((p) => !ctx.blocks?.has(p.uid)).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
      return t && E.power(s, t) >= 3 ? { score: E.enemyThreatOf(s, t), run: () => { E.exile(s, t); E.bolster(s, 1); } } : null;
    },
  }),
  cr('W06', '群衆の 天使', 'U', 'W', 6, (s, p, E) => mine(s, E).length, (s, p, E) => mine(s, E).length, ['angel'], ['convoke', 'flying']),
  pm('W07', '議事会の さばき', 'U', 'W', 4, ['enchantment'], {
    kw: ['convoke'],
    need: (s, E) => !!E.burnTarget(s, 99, { creatureOnly: true, mustHit: true }),
    etb: (s, p, E, o) => { const t = o.chosen ? o.chosen[0]?.[0] : E.burnTarget(s, 99, { creatureOnly: true, mustHit: true })?.t; if (t) E.exileLinked(s, p, t); },
  }),
  cr('W08', 'あがめられた ロクソドン', 'R', 'W', 5, 4, 4, ['elephant', 'soldier'], ['convoke'], {
    etb: (s, p, E, o) => { for (const q of o.convoked || []) E.addCounters(s, q, 1); },
  }),
  cr('W09', '太陽の神 ヘリオッド', 'L', 'W', 3, 4, 5, ['god'], ['indestructible'], {
    grant: (s, q, p, E) => (p.side === 'P' && E.isCreature(p) ? ['vigilance'] : null),
    acts: [{ cost: 3, req: ['W'], when: [2], play: (s, p, E) => ({ score: 3, run: () => E.token(s, 'P', T.cleric) }) }],
  }),
  // 青白
  cr('W10', 'いやしの 鷹', 'C', 'W', 1, 1, 1, ['bird'], ['flying', 'lifelink']),
  cr('W11', '天馬の 乗り手', 'C', 'W', 3, 2, 2, ['human', 'soldier'], ['flying'], { heroic: (s, p, E) => E.addCounters(s, p, 1) }),
  sp('W12', '戦いの そなえ', 'C', 'W', 1, 'sorcery', {
    strive: 1,
    play: (s, E, ctx) => {
      const ts = strive(mine(s, E).filter((p) => !E.hasKw(s, p, 'defender')).sort((a, b) => E.power(s, b) - E.power(s, a)), 1, ctx);
      return ts.length ? { score: 3 + ts.length * 2, extra: ts.length - 1, run: () => { for (const t of ts) { E.target(s, t); E.addCounters(s, t, 1); } } } : null;
    },
  }),
  sp('W13', '光の 矢の 雨', 'C', 'W', 4, 'instant', {
    reactive: true,
    react: (s, E, ctx) => {
      const atk = ctx.attackers || [];
      if (!atk.length) return null;
      const plan = E.divide(s, 4, atk);
      const kills = plan.filter((d) => d.n >= E.need(s, d.t)).length;
      return kills ? { score: kills * 6, run: () => arrowRain(s, E, plan) } : null;
    },
  }),
  cr('W14', '空の 戦術家', 'U', 'W', 4, 3, 3, ['bird', 'soldier'], ['flying'], { etb: (s, p, E) => E.bolster(s, 2) }),
  sp('W15', '天の 風', 'U', 'W', 3, 'sorcery', {
    strive: 1,
    play: (s, E, ctx) => {
      if (ctx.phase !== 1) return null;
      const ts = strive(E.readyAttackers(s).sort((a, b) => E.power(s, b) - E.power(s, a)), 1, ctx);
      return ts.length ? { score: 2 + ts.length * 3, extra: ts.length - 1, run: () => { for (const t of ts) { E.target(s, t); E.pump(t, 2, 2, ['flying']); } } } : null;
    },
  }),
  cr('W16', 'アラシンの 見張り', 'R', 'W', 4,
    (s, p, E) => 3 + s.P.bf.filter((q) => q !== p && E.isCreature(q) && q.ctr > 0).length,
    (s, p, E) => 4 + s.P.bf.filter((q) => q !== p && E.isCreature(q) && q.ctr > 0).length,
    ['griffin'], ['flying'], {
      acts: [{
        cost: 3, req: ['W'], when: [2],
        play: (s, p, E) => {
          const ts = mine(s, E).filter((q) => q !== p && q.ctr === 0 && !E.hasKw(s, q, 'defender')).slice(0, 2);
          return { score: 4, run: () => { const list = ts.length ? ts : [p]; for (const t of list) { E.target(s, t); E.addCounters(s, t, list.length === 1 ? 2 : 1); } } };
        },
      }],
    }),
  // 赤白
  cr('W17', 'とりでの 精鋭', 'C', 'W', 1, 1, 1, ['human', 'soldier'], [], { onAttack: (s, p, E, atk) => { if (battalion(atk)) E.pump(p, 2, 2); } }),
  cr('W18', '勇敢な 空騎兵', 'C', 'W', 2, 3, 1, ['human', 'knight'], [], { onAttack: (s, p, E, atk) => { if (battalion(atk)) E.pump(p, 0, 0, ['flying']); } }),
  sp('W19', 'ふるい立つ 突撃', 'C', 'W', 4, 'instant', mass(2, 1)),
  cr('W20', '密集軍の 隊長', 'U', 'W', 2, 1, 1, ['human', 'soldier'], [], { heroic: (s, p, E) => { for (const q of mine(s, E)) E.addCounters(s, q, 1); } }),
  sp('W21', '民衆の 奮起', 'U', 'W', 3, 'instant', { ...mass(2, 0), flashback: { cost: 3, req: ['R'] } }),
  cr('W22', '退去の 僧侶', 'U', 'W', 3, 2, 2, ['human', 'cleric'], [], {
    etb: (s, p, E, o) => { const t = o.chosen ? o.chosen[0]?.[0] : E.burnTarget(s, 99, { creatureOnly: true, mustHit: true })?.t; if (t) E.exileLinked(s, p, t); },
  }),
  cr('W23', '管区の 隊長', 'R', 'W', 2, 2, 2, ['human', 'soldier'], ['first'], { onCombatHit: (s, p, E) => E.token(s, 'P', T.soldier) }),
  cr('W24', '見張りの 隊長', 'R', 'W', 6, 3, 3, ['human', 'soldier'], ['vigilance'], {
    anthem: (s, q, p) => (p !== q && p.side === 'P' && isSub(p, 'soldier') ? [1, 1] : null),
    grant: (s, q, p) => (p !== q && p.side === 'P' && isSub(p, 'soldier') ? ['vigilance'] : null),
    etb: (s, p, E) => E.token(s, 'P', T.soldier, 3),
  }),
  pm('W25', '軍団の 集結', 'R', 'W', 5, ['enchantment'], {
    upkeep: (s, p, E) => { p.flags.muster = (p.flags.muster || 0) + 1; E.token(s, 'P', T.soldierHaste, p.flags.muster); },
  }),
  cr('W26', 'オレスコスの 王 ブリマーズ', 'L', 'W', 3, 3, 4, ['cat', 'soldier'], ['vigilance'], {
    onAttack: (s, p, E, atk, a) => { const [t] = E.token(s, 'P', T.catSoldier); if (t) { t.attacking = true; atk.push({ p: t, t: a.t }); } },
  }),
];

// ---- 白緑・青白・赤白 ----
const GOLD1 = [
  cr('WG01', '協約の 魂 エマーラ', 'U', 'WG', 3, 2, 2, ['elf', 'cleric'], [], {
    onTapped: (s, p, E) => { if (p.flags.turn.emmara) return; p.flags.turn.emmara = 1; E.token(s, 'P', T.soldierLL); },
  }),
  cr('WG02', '収穫の神 カラメトラ', 'R', 'WG', 5, 5, 6, ['god'], ['indestructible'], {
    onCast: (s, p, d) => { if (d.types.includes('creature')) api_rampTop(s); },
  }),
  cr('WU01', '雷鳴の ワイバーン', 'U', 'WU', 4, 2, 3, ['drake'], ['flash', 'flying'], {
    flash: true,
    anthem: (s, q, p, E) => (p !== q && p.side === 'P' && E.hasKw(s, p, 'flying') ? [1, 1] : null),
  }),
  cr('WU02', 'ポリスの神 エファラ', 'R', 'WU', 6, 6, 5, ['god'], ['indestructible'], {
    upkeep: (s, p, E) => { if (s.P.flags.enteredLastTurn) E.drawCard(s); },
    acts: [{
      cost: 2, req: ['W', 'U'], when: [2],
      play: (s, p, E) => {
        const fl = mine(s, E).filter((q) => E.hasKw(s, q, 'flying')).sort((a, b) => E.power(s, b) - E.power(s, a)).slice(0, 3);
        return fl.length ? { score: 4, run: () => { let n = 3; for (let i = 0; n > 0; i = (i + 1) % fl.length, n--) { E.target(s, fl[i]); E.addCounters(s, fl[i], 1); } } } : null;
      },
    }],
  }),
  sp('RW01', 'ボロスの 魔除け', 'U', 'RW', 2, 'instant', {
    ...single(0, 0, { dbl: true }),
    singleRun: (s, E, q) => E.pump(q, 0, 0, ['double']),
    play: (s, E) => (s.floor.face ? { score: 4 * (s.floor.faceUnit ?? 1) + 2, run: () => E.hitEnemy(s, 4, null) } : burn(4, { creatureOnly: true })(s, E)),
    react: (s, E, ctx) => {
      const saved = mine(s, E).filter((p) => !E.hasKw(s, p, 'indestructible') && ctx.attackers.some((a) => ctx.blocks?.get(a.uid) === p && E.power(s, a) >= E.need(s, p)));
      return saved.length ? { score: saved.length * 5, run: () => { for (const p of s.P.bf) E.pump(p, 0, 0, ['indestructible']); } } : null;
    },
  }),
  cr('RW02', '勝利の神 イロアス', 'R', 'RW', 5, 7, 4, ['god'], ['indestructible'], { protectAttackers: true }),
];

// ---- 青 ----
const U = [
  cr('U01', '風の ドレイク', 'C', 'U', 3, 2, 2, ['drake'], ['flying']),
  cr('U02', '雲の 予言者', 'C', 'U', 4, 2, 1, ['elf', 'wizard'], ['flying'], { etb: (s, p, E) => E.drawCard(s) }),
  sp('U03', '氷の いき', 'C', 'U', 2, 'instant', {
    strive: 1,
    play: (s, E, ctx) => {
      const ts = strive(theirs(s, E).filter((p) => !p.tapped && (p.def.attacks || p.def.headDmg) && (p.def.headDmg || E.power(s, p)) >= 2).sort((a, b) => (b.def.headDmg || E.power(s, b)) - (a.def.headDmg || E.power(s, a))), 1, ctx);
      const v = ts.reduce((t, p) => t + (p.def.headDmg || E.power(s, p)), 0);
      return v >= 3 ? { score: v * 2 - ts.length, extra: ts.length - 1, run: () => { for (const t of ts) { t.tapped = true; t.frozen = true; } } } : null;
    },
  }),
  cr('U04', '対称の 賢者', 'C', 'U', 2, 0, 2, ['human', 'wizard'], ['flying'], {
    onCast: (s, p, d) => { if (d.types.includes('instant') || d.types.includes('sorcery')) p.base2 = true; },
  }),
  sp('U05', 'ゼロで わる', 'U', 'U', 3, 'instant', {
    play: (s, E) => {
      const b = E.burnTarget(s, 99, { creatureOnly: true, mustHit: true });
      return b ? { score: 7 + b.score, run: () => { E.bounce(s, b.t); E.drawCard(s); E.sba(s); } } : null;
    },
  }),
  sp('U06', '二つの 山', 'U', 'U', 4, 'instant', {
    play: (s, E, ctx) => ({
      score: ctx.phase === 2 ? 8 : 5,
      run: () => {
        const six = s.P.lib.splice(0, 6).sort((a, b) => E.keepValue(s, b) - E.keepValue(s, a));
        const half = Math.ceil(six.length / 2);
        s.P.hand.push(...six.slice(0, half)); s.P.gy.push(...six.slice(half));
      },
    }),
  }),
  cr('U07', '予言の スフィンクス', 'R', 'U', 5, 3, 5, ['sphinx'], ['flying'], { onAttack: (s, p, E) => E.scry(s, 3) }),
  cr('U08', '海の神 タッサ', 'L', 'U', 4, 5, 5, ['god'], ['indestructible'], {
    upkeep: (s, p, E) => E.scry(s, 1),
    acts: [{
      cost: 2, req: ['U'], when: [1],
      play: (s, p, E) => {
        if (!theirs(s, E).some((q) => !q.tapped && !q.def.noBlock)) return null;
        const t = E.readyAttackers(s).filter((q) => !q.flags.turn.unblockable && !E.hasKw(s, q, 'flying')).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
        return t && E.power(s, t) >= 3 ? { score: 3, run: () => { t.flags.turn.unblockable = true; } } : null;
      },
    }],
  }),
  // 赤青
  sp('U09', '選択', 'C', 'U', 1, 'instant', { play: (s, E, ctx) => (ctx.phase === 2 ? { score: 3, run: () => E.then(E.scry(s, 1), () => E.drawCard(s)) } : null) }),
  cr('U10', 'ジェスカイの 風斥候', 'C', 'U', 3, 2, 2, ['bird', 'scout'], ['flying', 'prowess']),
  sp('U11', '本質の 散乱', 'C', 'U', 2, 'instant', { counter: 'creature', reactive: true }),
  sp('U12', '二度 考える', 'C', 'U', 2, 'instant', { play: draw(1, 3), flashback: { cost: 3, req: ['U'] } }),
  sp('U13', 'なぞめいた 命令', 'U', 'U', 2, 'instant', {
    escalate: 1,
    // AI：ねうちの 大きい モードから、払える だけ
    play: (s, E, ctx) => {
      const ms = [];
      ms.push({ v: 4, run: () => E.drawCard(s) });
      const f = theirs(s, E).filter((p) => !p.tapped && (p.def.attacks || p.def.headDmg) && !s.floor.untargetable?.(s, p, E)).sort((a, b) => (b.def.headDmg || E.power(s, b)) - (a.def.headDmg || E.power(s, a)))[0];
      if (f && ctx.phase === 2) ms.push({ v: (f.def.headDmg || E.power(s, f)) * 2, run: () => { if (E.onBf(s, f)) { f.tapped = true; f.frozen = true; } } });
      const b = E.burnTarget(s, 99, { creatureOnly: true, mustHit: true });
      if (b && b.score >= 4) ms.push({ v: 5 + b.score, run: () => { if (E.onBf(s, b.t)) E.bounce(s, b.t); E.sba(s); } });
      ms.sort((a, b2) => b2.v - a.v);
      const use = ms.slice(0, 1 + Math.max(0, ctx.manaLeft ?? 0));
      return { score: use.reduce((t, m) => t + m.v, 0) - use.length, extra: use.length - 1, run: () => { for (const m of use) m.run(); } };
    },
  }),
  cr('U14', '放蕩の 魔術師', 'U', 'U', 3, 1, 1, ['human', 'wizard'], [], {
    acts: [{ cost: 0, tap: true, when: [2], play: (s, p, E) => { const b = E.burnTarget(s, 1, { mustHit: !!s.floor.face }); return b ? { score: 2 + b.score, run: () => hit(s, E, b.t, 1) } : null; } }],
  }),
  sp('U15', '対抗呪文', 'U', 'U', 2, 'instant', { counter: 'any', req2: true, reactive: true }),
  cr('U16', '空召喚士 ターランド', 'R', 'U', 4, 2, 2, ['merfolk', 'wizard'], [], {
    onCast: (s, p, d, E) => { if (d.types.includes('instant') || d.types.includes('sorcery')) E.token(s, 'P', T.drake); },
  }),
  { ...cr('U17', '激浪の 機械巨人', 'L', 'U', 6, 5, 6, ['construct'], ['flash'], {
    flash: true,
    etb: (s, p, E) => { const b = E.bestInstantInGy(s); if (b) E.castFree(s, b.c, b.r); },
  }), types: ['artifact', 'creature'] },
];

// ---- 赤 ----
const R = [
  // 赤白
  sp('R01', 'ゴブリンの 号令', 'C', 'R', 2, 'sorcery', { play: (s, E) => ({ score: 7, run: () => E.token(s, 'P', T.goblin, 2) }) }),
  cr('R02', '突進する 軍曹', 'C', 'R', 3, 3, 2, ['human', 'soldier'], ['haste', 'mentor']),
  cr('R03', 'ウォジェクの 槍兵', 'C', 'R', 3, 2, 2, ['human', 'soldier'], [], { onAttack: (s, p, E, atk) => { if (packTactics(s, E, atk)) E.pump(p, 1, 0, ['first']); } }),
  sp('R04', 'シヴの 炎', 'C', 'R', 1, 'instant', {
    kicker: 2, burnN: 2,
    play: (s, E, ctx = {}) => {
      const k = (ctx.manaLeft ?? 0) >= 2 ? burn(4)(s, E, ctx) : null;
      const n = burn(2)(s, E, ctx);
      if (k && (!n || k.score > n.score + 2)) return { ...k, score: k.score - 1, extra: 2 };
      return n;
    },
  }),
  cr('R05', 'ときの声の ゴブリン', 'U', 'R', 2, 2, 2, ['goblin'], [], {
    onAttack: (s, p, E, atk, a) => { if (!packTactics(s, E, atk)) return; const [t] = E.token(s, 'P', T.goblin, 1, { tapped: true }); if (t) { t.attacking = true; atk.push({ p: t, t: a.t }); } },
  }),
  sp('R06', 'ラッパの 一吹き', 'U', 'R', 3, 'instant', mass(2, 0, (q) => q.attacking)),
  cr('R07', 'ゴブリンの 大将', 'R', 'R', 3, 2, 2, ['goblin', 'warrior'], ['mentor'], {
    combatStart: (s, p, E) => E.token(s, 'P', T.goblinHaste),
    onAttack: (s, p, E, atk) => E.pump(p, atk.filter((a) => a.p !== p && isSub(a.p, 'goblin')).length, 0),
  }),
  cr('R08', '鍛冶の神 パーフォロス', 'L', 'R', 4, 6, 5, ['god'], ['indestructible'], {
    onOtherEnter: (s, p, q, E) => { if (q.side === 'P' && E.isCreature(q)) E.hitEnemy(s, 2, p); },
    acts: [{ cost: 3, req: ['R'], when: [1], play: (s, p, E) => (E.readyAttackers(s).length >= 3 ? { score: E.readyAttackers(s).length, run: () => { for (const q of mine(s, E)) E.pump(q, 1, 0); } } : null) }],
  }),
  // 赤青
  cr('R09', '僧院の 速槍', 'C', 'R', 1, 1, 2, ['human', 'monk'], ['haste', 'prowess']),
  sp('R10', '火炎', 'C', 'R', 1, 'sorcery', {
    x: true,
    play: (s, E, ctx) => xBurn(s, E, ctx, 0, (t) => { if (t.exact) E.drawCard(s); }),
  }),
  sp('R11', '裂け目の 稲妻', 'C', 'R', 3, 'sorcery', { play: burn(3), burnN: 3, suspend: { cost: 1, req: ['R'], turns: 1 }, suspendScore: 9 }),
  cr('R12', '火口の 射手', 'C', 'R', 2, 2, 2, ['human', 'archer'], [], {
    onCast: (s, p, d, E) => { if (!d.types.includes('creature')) E.hitEnemy(s, 1, p); },
  }),
  cr('R13', '窯の 悪鬼', 'U', 'R', 4, 3, 3, ['elemental', 'beast'], [], {
    onCast: (s, p, d, E) => { if (d.types.includes('instant') || d.types.includes('sorcery')) E.pump(p, 3, 0); },
  }),
  cr('R14', '若き 紅蓮術士', 'U', 'R', 2, 2, 2, ['human', 'shaman'], [], {
    onCast: (s, p, d, E) => { if (d.types.includes('instant') || d.types.includes('sorcery')) E.token(s, 'P', T.elemental); },
  }),
  sp('R15', 'マグマの 噴流', 'U', 'R', 2, 'instant', { play: (s, E) => { const r = burn(3)(s, E); return r ? { score: r.score + 1, run: () => { r.run(); return E.scry(s, 2); } } : null; }, burnN: 3 }),
  sp('R16', '火口の 爪', 'R', 'R', 1, 'sorcery', {
    x: true,
    play: (s, E, ctx) => xBurn(s, E, ctx, ferocious(s, E) ? 2 : 0),
  }),
  cr('R17', '路地裏の 火の子', 'R', 'R', 3, 2, 2, ['goblin', 'shaman'], [], {
    onCast: (s, p, d, E) => { if (d.types.includes('instant') || d.types.includes('sorcery')) E.hitEnemy(s, 2, p); },
  }),
  // 緑赤
  cr('R18', '山頂の 徘徊者', 'C', 'R', 4, 4, 3, ['troll'], [], { pittari: (s, p, E) => E.addCounters(s, p, 1) }),
  sp('R19', '引き倒し', 'C', 'R', 4, 'instant', {
    play: (s, E) => {
      const b = E.burnTarget(s, 5, { creatureOnly: true, filter: (p) => E.need(s, p) <= (p.ctr > 0 ? 5 : 3) });
      return b ? { score: 6 + b.score, run: () => hit(s, E, b.t, b.t.ctr > 0 ? 5 : 3) } : null;
    },
  }),
  sp('R20', 'ティムールの 激闘', 'C', 'R', 2, 'instant', { ...single(0, 0, { dbl: true, trample: true }), singleRun: (s, E, q) => E.pump(q, 0, 0, ferocious(s, E) ? ['double', 'trample'] : ['double']) }),
  sp('R21', '獣の 力', 'C', 'R', 1, 'instant', single(3, 3)),
  sp('R22', '焼き焦がし', 'U', 'R', 2, 'sorcery', { play: burn(5, { creatureOnly: true, filter: (p) => !p.def.kw?.includes('flying') }) }),
  cr('R23', 'ドラゴンの 雛', 'U', 'R', 2, 0, 1, ['dragon'], ['flying'], { acts: [{ cost: 1, req: ['R'], pumpP: 1, when: [], play: () => null }] }),
  sp('R24', 'どんどん 2ばい', 'R', 'R', 1, 'sorcery', {
    x: true,
    play: (s, E, ctx) => {
      if (ctx.phase !== 1) return null;
      const t = E.readyAttackers(s).filter((q) => E.hasKw(s, q, 'flying') || E.hasKw(s, q, 'trample') || !theirs(s, E).some((b) => !b.tapped && !b.def.noBlock)).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
      if (!t || E.power(s, t) < 2) return null;
      const x = Math.min(ctx.xMax, 3);
      return { score: E.power(s, t) * (2 ** x - 1), x, run: (xx) => { E.target(s, t); const p0 = E.power(s, t); E.pump(t, p0 * (2 ** Math.min(xx, 4) - 1), 0); } };
    },
  }),
  cr('R25', '炎跡の フェニックス', 'R', 'R', 3, 2, 2, ['phoenix'], ['flying', 'haste'], {
    mustAttack: true,
    gyCombatStart: (s, c, E) => {
      if (!ferocious(s, E)) return;
      const pl = E.plan(s, 1, ['R']); if (!pl) return;
      E.pay(s, pl); s.P.gy.splice(s.P.gy.indexOf(c), 1); E.enter(s, 'P', c.def);
    },
  }),
  cr('R26', '嵐息吹の ドラゴン', 'L', 'R', 5, 4, 4, ['dragon'], ['flying', 'haste'], {
    acts: [{ cost: 6, req: ['R'], monstrosity: true, when: [1, 2], play: (s, p, E) => ({ score: 6 + s.P.hand.length, run: () => { E.addCounters(s, p, 3); E.hitEnemy(s, s.P.hand.length, p); } }) }],
  }),
];

// ---- 青（青緑） ----
const U2 = [
  cr('U18', '雲ひれの 猛禽', 'C', 'U', 1, 1, 1, ['bird', 'mutant'], ['flying', 'evolve']),
  sp('U19', '未来の ひらめき', 'C', 'U', 3, 'sorcery', { play: draw(2, 7), suspend: { cost: 1, req: ['U'], turns: 2 }, suspendScore: 6 }),
  cr('U20', '前兆語り', 'C', 'U', 2, 1, 3, ['human', 'wizard'], [], { etb: (s, p, E) => E.scry(s, 2) }),
  cr('U21', '空見の 弟子', 'C', 'U', 1, 1, 1, ['human', 'wizard'], [], {
    levels: [{ at: 1, pow: 2, tou: 2, kw: ['flying'] }, { at: 3, pow: 4, tou: 2, kw: ['flying'] }], levelMax: 3,
    acts: [{ cost: 2, req: ['U'], levelUp: true, when: [1, 2], play: (s, p) => ({ score: p.level < 3 ? 7 : 0, run: () => {} }) }],
  }),
  cr('U22', '鳴り羽', 'U', 'U', 2, 1, 1, ['bird', 'horror'], ['flying'], { onCombatHit: (s, p, E) => E.proliferate(s) }),
  cr('U23', '翼竜の 学者', 'U', 'U', 2, 1, 1, ['lizard'], ['flying'], {
    acts: [{
      cost: (s) => Math.max(1, 7 - s.P.gy.filter((c) => c.def.types.includes('instant') || c.def.types.includes('sorcery')).length),
      req: ['U'], when: [1, 2],
      play: (s, p, E) => (p.ctr === 0 ? { score: 6, run: () => E.addCounters(s, p, 4) } : null),
    }],
  }),
  pm('U24', '容赦なき 潮流', 'R', 'U', 5, ['enchantment'], { onCast: (s, p, d, E) => E.proliferate(s) }),
  cr('U25', 'クローン', 'R', 'U', 4, 0, 0, ['shapeshifter'], [], {
    need: (s, E) => [...mine(s, E), ...theirs(s, E)].some((q) => E.power(s, q) >= 3 && !q.def.noCopy),
    etb: (s, p, E, o) => {
      const t = o.chosen ? o.chosen[0]?.[0] : [...mine(s, E), ...theirs(s, E)].filter((q) => q !== p && !q.def.noCopy).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
      if (t) { const d = t.card || t.def; p.def = { ...d, reward: undefined, noBlock: undefined, attacks: undefined }; }
    },
  }),
  sp('U26', '研究の 成果', 'R', 'U', 4, 'sorcery', { play: (s, E) => ({ score: 8, run: () => { E.drawCard(s, 2); E.proliferate(s); } }) }),
];

// ---- 2色（赤青・緑赤・青緑） ----
const GOLD2 = [
  cr('UR01', '嵐追いの 魔道士', 'U', 'UR', 2, 1, 3, ['human', 'monk'], ['flying', 'haste', 'prowess']),
  cr('UR02', '嵐の神 ケラノス', 'R', 'UR', 6, 6, 5, ['god'], ['indestructible'], {
    upkeep: (s, p, E) => {
      const c = s.P.lib.shift(); if (!c) return;
      const d = c.def;
      if (d.types.includes('instant') || d.types.includes('sorcery')) { E.hitEnemy(s, 3, p); s.P.hand.push(c); }
      else if (d.types.includes('creature') && s.P.mana.length < 7) s.P.mana.push({ ...c, tapped: false });
      else s.P.hand.push(c);
    },
  }),
  cr('RG01', 'ゴーア族の 暴れ者', 'U', 'RG', 4, 4, 4, ['beast'], ['trample'], {
    bloodrush: { cost: 2, req: ['R', 'G'] }, singleRun: (s, E, q) => E.pump(q, 4, 4),
  }),
  cr('RG02', '運命の神 クローティス', 'R', 'RG', 3, 4, 5, ['god'], ['indestructible'], {
    combatStart: (s, p, E) => { if (ferocious(s, E)) { E.hitEnemy(s, 2, p); E.gain(s, 2); } },
  }),
  cr('GU01', 'クアンドリクスの 天才 ジモーネ', 'U', 'GU', 3, 2, 4, ['human', 'wizard'], [], {
    acts: [{
      cost: 1, tap: true, when: [1, 2],
      play: (s, p, E) => {
        const c = [...s.P.hand].sort((a, b) => E.keepValue(s, a) - E.keepValue(s, b))[0];
        if (!c || (s.P.mana.length >= 8 && E.keepValue(s, c) > 3)) return null;
        return { score: 5, run: () => { E.charge(s, c, false); if (s.P.mana.length >= 8) E.drawCard(s); } };
      },
    }],
  }),
  cr('GU02', '地平の神 クルフィックス', 'R', 'GU', 5, 4, 7, ['god'], ['indestructible'], {
    endStep: (s, p, E) => {
      const n = Math.floor(s.P.mana.filter((m) => !m.tapped).length / 2);
      for (let i = 0; i < n; i++) { const t = E.bestBuffTarget(s, null); if (t) E.addCounters(s, t, 1); }
    },
  }),
];

// ---- 無色 ----
const art = (x) => ({ ...x, types: ['artifact', ...(x.types.includes('creature') ? ['creature'] : [])] });
const C = [
  art(cr('C01', '羽ばたき 飛行機械', 'C', '', 0, 0, 2, ['thopter'], ['flying'], { permScore: () => 3 })),
  art(cr('C02', 'ボトルの ノーム', 'C', '', 3, 1, 3, ['gnome'], [], {
    acts: [{ cost: 0, when: [1, 2], play: (s, p, E) => (s.P.life <= 5 ? { score: 9, run: () => { E.leave(s, p, 'gy'); E.gain(s, 3); } } : null) }],
  })),
  pm('C03', '精神の 石', 'C', '', 2, ['artifact'], {
    mana: ['C'],
    acts: [{ cost: 1, tap: true, when: [2], play: (s, p, E) => (s.P.mana.length >= 6 && s.P.hand.length <= 1 ? { score: 3, run: () => { E.leave(s, p, 'gy'); E.drawCard(s); } } : null) }],
  }),
  pm('C04', 'みじかい 剣', 'C', '', 1, ['artifact'], { equip: 1, eqP: 1, eqT: 1 }),
  art(cr('C05', 'ジャガーノート', 'U', '', 4, 5, 3, ['juggernaut'], [], { mustAttack: true })),
  pm('C06', '予言の プリズム', 'U', '', 2, ['artifact'], { prism: true, etb: (s, p, E) => E.drawCard(s) }),
  pm('C07', '骨断ちの 剣', 'U', '', 1, ['artifact'], { equip: 1, eqP: 2, eqT: 0 }),
  art(cr('C08', 'マイアの 戦闘球', 'R', '', 7, 4, 7, ['construct'], [], { etb: (s, p, E) => E.token(s, 'P', T.myr, 4) })),
  art(cr('C09', '厳粛な 空身像', 'R', '', 4, 2, 2, ['golem'], [], { etb: () => {}, etbRamp: true, onDie: (s, p, E) => E.drawCard(s) })),
  art(cr('C10', 'ワームとぐろ エンジン', 'L', '', 6, 6, 6, ['wurm'], ['deathtouch', 'lifelink'], {
    onDie: (s, p, E) => { E.token(s, 'P', T.wurmDT); E.token(s, 'P', T.wurmLL); },
  })),
];

// ---- きほんカード（0点） ----
export const BASICS = {
  W: sp('B01', '白の きほんカード', 'B', 'W', 1, 'sorcery', { basic: true, play: (s, E) => ({ score: 1, run: () => E.gain(s, 2) }) }),
  U: sp('B02', '青の きほんカード', 'B', 'U', 1, 'instant', { basic: true, play: (s, E, ctx) => (ctx.phase === 2 ? { score: 1, run: () => E.scry(s, 1) } : null) }),
  G: sp('B03', '緑の きほんカード', 'B', 'G', 1, 'sorcery', { basic: true, play: (s, E) => ({ score: 2, run: () => E.token(s, 'P', T.saproling) }) }),
  R: sp('B04', '赤の きほんカード', 'B', 'R', 1, 'instant', { basic: true, play: (s, E) => { const b = E.burnTarget(s, 1, { creatureOnly: true }); return b ? { score: 2 + b.score, run: () => hit(s, E, b.t, 1) } : null; } }),
  C: sp('B05', '無色の きほんカード', 'B', '', 2, 'sorcery', { basic: true, play: (s, E) => ({ score: 2, run: () => E.drawCard(s) }) }),
};

// ライブラリーの一番上をマナゾーンに（豊かな成長・カラメトラ・空身像）
let api_rampTop = () => {};
export function bindEngine(E) {
  api_rampTop = (s) => E.rampTop(s);
  const solemn = ALL.find((d) => d.id === 'C09');
  solemn.etb = (s) => E.rampTop(s);
}

export const ALL = [...W, ...U, ...U2, ...G, ...R, ...GOLD1, ...GOLD2, ...C];
export const BY_ID = Object.fromEntries([...ALL, ...Object.values(BASICS)].map((d) => [d.id, d]));

// ---- 人が遊ぶとき：対象を自分で選ぶカード（ui/battle.js が使う） ----
// tgt：選ぶものの並び。side は E（敵）・P（自分）・any（両方）・atk（攻撃してきた敵）。face は敵の本体も選べる。
// divide は割り振る数（'x' は X）。apply(s, E, picks, x) の picks は tgt ごとの配列（divide は { t, n } の配列）
const kill1 = (n) => ({ tgt: [{ side: 'E', face: true, label: `${n}点を あたえる 相手` }], apply: (s, E, [[t]]) => hit(s, E, t, n) });
const TARGETS = {
  R04: { tgt: [{ side: 'E', face: true, label: 'ダメージを あたえる 相手' }], apply: (s, E, [[t]], x, o = {}) => hit(s, E, t, o.kicked ? 4 : 2) },
  R11: kill1(3),
  R15: { tgt: [{ side: 'E', face: true, label: '3点を あたえる 相手' }], apply: (s, E, [[t]]) => { hit(s, E, t, 3); return E.scry(s, 2); } },
  B04: { tgt: [{ side: 'E', label: '1点を あたえる クリーチャー' }], apply: (s, E, [[t]]) => hit(s, E, t, 1) },
  R10: { tgt: [{ side: 'E', face: true, label: 'X点を あたえる 相手' }], apply: (s, E, [[t]], x) => { const h = hit(s, E, t, x); if (h?.exact) E.drawCard(s); } },
  R16: { tgt: [{ side: 'E', face: true, label: 'X点を あたえる 相手（獰猛なら ＋2）' }], apply: (s, E, [[t]], x) => hit(s, E, t, x + (ferocious(s, E) ? 2 : 0)) },
  R19: { tgt: [{ side: 'E', label: '3点（カウンターが あれば 5点）を あたえる クリーチャー' }], apply: (s, E, [[t]]) => hit(s, E, t, t.ctr > 0 ? 5 : 3) },
  R22: { tgt: [{ side: 'E', filter: (s, E, p) => !E.hasKw(s, p, 'flying'), label: '5点を あたえる 飛行のない クリーチャー' }], apply: (s, E, [[t]]) => hit(s, E, t, 5) },
  // モードを 1つ えらぶ（ui/battle.js の chooseMode）。tgt の side 'mine' は 自分の クリーチャー（攻撃中なら 攻撃している もの）
  RW01: {
    escalate: 2,
    modes: [
      { label: '敵に 4点の ダメージ', tgt: [{ side: 'E', face: true, label: '4点を あたえる 相手' }], apply: (s, E, [[t]]) => hit(s, E, t, 4) },
      { label: '自分の パーマネントは ターン終了時まで 破壊不能', apply: (s, E) => { for (const p of s.P.bf) E.pump(p, 0, 0, ['indestructible']); } },
      { label: 'クリーチャー1体に 二段攻撃', tgt: [{ side: 'mine', label: '二段攻撃を あたえる クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.pump(t, 0, 0, ['double']); } },
    ],
  },
  U05: { tgt: [{ side: 'E', label: '手札に もどす（敵は 墓地へ）クリーチャー' }], apply: (s, E, [[t]]) => { E.bounce(s, t); E.drawCard(s); E.sba(s); } },
  U03: { tgt: [{ side: 'E', max: 9, label: 'タップして 止める クリーチャー' }], apply: (s, E, [ts]) => { for (const t of ts) { t.tapped = true; t.frozen = true; } } },
  U13: {
    modes: [
      { label: 'カードを 1枚 引く', apply: (s, E) => E.drawCard(s) },
      { label: '敵の クリーチャー1体を タップ（つぎの ターン 起きない）', tgt: [{ side: 'E', label: 'タップして 止める クリーチャー' }], apply: (s, E, [[t]]) => { if (E.onBf(s, t)) { t.tapped = true; t.frozen = true; } } },
      { label: 'クリーチャー1体を 手札に もどす（敵は 墓地へ）', tgt: [{ side: 'any', label: 'もどす クリーチャー' }], apply: (s, E, [[t]]) => { if (E.onBf(s, t)) E.bounce(s, t); E.sba(s); } },
    ],
  },
  G08: {
    tgt: [{ side: 'P', label: 'たたかう 自分の クリーチャー' }, { side: 'E', label: 'たたかう 相手' }],
    apply: (s, E, [[me], [t]]) => savagePunch(s, E, me, t),
  },
  G19: {
    tgt: [{ side: 'P', label: '＋1/＋1カウンターを 置いて たたかう クリーチャー' }, { side: 'E', label: 'たたかう 相手' }],
    apply: (s, E, [[me], [t]]) => { E.target(s, me); E.addCounters(s, me, 1); E.fight(s, me, t); },
  },
  G14: { tgt: [{ side: 'P', label: '＋1/＋1カウンターを 2個 置く クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.addCounters(s, t, 2); t.tapped = false; } },
  W12: { tgt: [{ side: 'P', max: 9, label: '＋1/＋1カウンターを 置く クリーチャー' }], apply: (s, E, [ts]) => { for (const t of ts) { E.target(s, t); E.addCounters(s, t, 1); } } },
  W15: { tgt: [{ side: 'P', max: 9, label: '＋2/＋2 と 飛行を あたえる クリーチャー' }], apply: (s, E, [ts]) => { for (const t of ts) { E.target(s, t); E.pump(t, 2, 2, ['flying']); } } },
  R24: { tgt: [{ side: 'P', label: 'パワーを 2倍に する クリーチャー' }], apply: (s, E, [[t]], x) => { E.target(s, t); const p0 = E.power(s, t); E.pump(t, p0 * (2 ** Math.min(x, 4) - 1), 0); } },
  W22: { tgt: [{ side: 'E', label: '追放する クリーチャー' }] },
  W07: { tgt: [{ side: 'E', perm: true, filter: (s, E, p) => !p.def.factory, label: '追放する 敵の カード' }] },
  G03: { tgt: [{ side: 'P', min: 0, label: '＋1/＋1カウンターを 置く クリーチャー' }] },
  U25: { tgt: [{ side: 'any', filter: (s, E, p) => !p.def.noCopy, label: 'コピーする クリーチャー' }] },
  W05: { tgt: [{ side: 'atk', label: '追放する 攻撃中の クリーチャー' }], apply: (s, E, [[t]]) => { E.exile(s, t); E.bolster(s, 1); } },
  W13: { tgt: [{ side: 'atk', max: 9, divide: 4, label: '4点を 割り振る 攻撃中の クリーチャー' }], apply: (s, E, [al]) => arrowRain(s, E, al) },
};
// 起動型能力
const ACT_TARGETS = {
  U14: { tgt: [{ side: 'E', face: true, label: '1点を あたえる 相手' }], apply: (s, E, [[t]]) => hit(s, E, t, 1) },
  U08: { tgt: [{ side: 'P', label: 'このターン ブロックされない クリーチャー' }], apply: (s, E, [[t]]) => { t.flags.turn.unblockable = true; } },
  W16: { tgt: [{ side: 'P', max: 2, divide: 2, label: '＋1/＋1カウンター 2個を 割り振る クリーチャー' }], apply: (s, E, [al]) => { for (const d of al) { E.target(s, d.t); E.addCounters(s, d.t, d.n); } } },
  WU02: { tgt: [{ side: 'P', max: 3, divide: 3, filter: (s, E, p) => E.hasKw(s, p, 'flying'), label: '＋1/＋1カウンター 3個を 割り振る 飛行クリーチャー' }], apply: (s, E, [al]) => { for (const d of al) { E.target(s, d.t); E.addCounters(s, d.t, d.n); } } },
  G17: { tgt: [{ side: 'E', max: 9, divide: 'x', label: 'X点を 割り振る 敵の クリーチャー' }], apply: (s, E, [al], x, p) => { E.addCounters(s, p, x); for (const d of al) E.damage(s, d.t, d.n, null); E.sba(s); } },
};
for (const [id, h] of Object.entries(TARGETS)) Object.assign(BY_ID[id], h);
for (const [id, h] of Object.entries(ACT_TARGETS)) Object.assign(BY_ID[id].acts[0], h);
