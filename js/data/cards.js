// カード（第1弾 126種＋第2弾 74種＋きほんカード5種＋トークン）。文章は docs/cards/*.md、ここはルールエンジン用のデータ
// cost は合計マナ。color は色（2色は 'WG' など）。play / react / trick は AI の使いどころ（シミュレーション用）
import {
  cr, sp, pm, hit, burn, xBurn, savagePunch, arrowRain, draw, mine, theirs, isSub, ferocious, battalion, packTactics, strive, single, mass, T, elemX, ROMAN, saga, sagaStep, vanishUpkeep, vanish, hb, bestFreeze, bestIn, RANK, lowestKeep,
} from './kit.js';
export { T } from './kit.js';
import { SKEL, SET_IDS } from './skel.js';
import { S3, B06 } from './set3.js';
import { S4 } from './set4.js';
import { S5 } from './set5.js';
import { S6 } from './set6.js';
import { SY } from './alchemy.js';
import { S9 } from './set9.js';
import { SPW } from './pw.js';
import { LESSONS, REG, foe1, shrink } from './kit.js';

// ---- 緑 ----
const G = [
  cr('G01', '森の ちいさな エルフ', 'C', 'G', 1, 1, 1, ['elf'], [], { mana: ['G'] }),
  cr('G02', '旅する サテュロス', 'C', 'G', 2, 1, 2, ['satyr'], [], { mana: 'any' }),
  cr('G03', '生きている トーテム', 'C', 'G', 4, 2, 3, ['elemental'], ['convoke'], {
    etb: (s, p, E, o) => { const t = o.chosen ? o.chosen[0]?.[0] : E.bestBuffTarget(s, p); if (t) E.addCounters(s, t, E.formidable(s) ? 2 : 1); },
  }),
  sp('G04', '勇気（ゆうき）の あつまり', 'C', 'G', 2, 'instant', { kw: ['convoke'], ...single(2, 2) }),
  cr('G05', '森の 大ワーム', 'C', 'G', 7, 5, 5, ['wurm'], ['convoke', 'trample']),
  sp('G06', '芽（め）ばえの むれ', 'U', 'G', 2, 'instant', {
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
  sp('G08', '荒々（あらあら）しい 一撃（いちげき）', 'C', 'G', 1, 'sorcery', {
    play: (s, E) => {
      const me = E.bestBuffTarget(s, null); if (!me) return null;
      const bonus = ferocious(s, E) ? 2 : 0;
      const p = E.power(s, me) + bonus;
      const b = E.burnTarget(s, p, { creatureOnly: true }); if (!b) return null;
      return { score: 6 + b.score, run: () => savagePunch(s, E, me, b.t) };
    },
  }),
  sp('G09', '巨大化（きょだいか）', 'C', 'G', 2, 'instant', single(4, 4)),
  cr('G10', '見習（みなら）いの 射手（しゃしゅ）', 'C', 'G', 2, 1, 4, ['human', 'archer'], ['reach', 'training']),
  cr('G11', 'ふみならす 大鹿（おおじか）の むれ', 'C', 'G', 5, 5, 5, ['elk'], [], {
    onAttack: (s, p, E) => { if (E.formidable(s)) for (const q of mine(s, E)) E.pump(q, 0, 0, ['trample']); },
  }),
  cr('G12', '野生（やせい）の 後継者（こうけいしゃ）', 'U', 'G', 2, 2, 2, ['human', 'warrior'], ['deathtouch'], {
    onAttack: (s, p, E) => { if (ferocious(s, E)) E.pump(p, 1, 1); },
  }),
  cr('G13', 'ネシアンの アスプ', 'U', 'G', 5, 4, 5, ['snake'], ['reach'], {
    acts: [{ cost: 1, req: ['G'], discard: 2, monstrosity: true, when: [1], play: (s, p, E) => ({ score: 8, run: () => E.addCounters(s, p, 4) }) }],
  }),
  sp('G14', '竜鱗（りゅうりん）の 恵（めぐ）み', 'U', 'G', 4, 'instant', {
    play: (s, E, ctx) => {
      if (ctx.phase !== 2) return null;
      const t = E.bestBuffTarget(s, null); return t ? { score: 5, run: () => { E.target(s, t); E.addCounters(s, t, 2); t.tapped = false; } } : null;
    },
  }),
  cr('G15', 'ガラクの 群（む）れ率（ひき）い', 'R', 'G', 5, 4, 4, ['wolf'], [], {
    onOtherEnter: (s, p, q, E) => { if (q.side === p.side && E.isCreature(q) && E.power(s, q) >= 3) E.drawCard(s); },
  }),
  cr('G16', '狩（か）り呼（よ）びの スーラク', 'R', 'G', 4, 5, 4, ['human', 'warrior'], [], {
    combatStart: (s, p, E) => {
      if (!E.formidable(s)) return;
      const t = mine(s, E).filter((q) => q.sick && !q.tapped).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
      if (t) E.pump(t, 0, 0, ['haste']);
    },
  }),
  cr('G17', '世界（せかい）を 喰（く）らう者（もの） ポルクラノス', 'L', 'G', 4, 5, 5, ['hydra'], [], {
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
  sp('G18', '豊（ゆた）かな 成長（せいちょう）', 'C', 'G', 2, 'sorcery', { play: (s) => ({ score: s.P.mana.length < 6 && hasBasic(s) ? 14 : 2, run: () => api_ramp(s) }) }),
  sp('G19', '弱者（じゃくしゃ）の 選別（せんべつ）', 'C', 'G', 4, 'sorcery', {
    play: (s, E) => {
      const me = E.bestBuffTarget(s, null); if (!me) return null;
      const b = E.burnTarget(s, E.power(s, me) + 1, { creatureOnly: true }); if (!b) return null;
      return { score: 6 + b.score, run: () => { E.target(s, me); E.addCounters(s, me, 1); E.fight(s, me, b.t); } };
    },
  }),
  cr('G20', '実験体（じっけんたい） 一号（いちごう）', 'C', 'G', 1, 1, 1, ['human', 'ooze'], ['evolve']),
  cr('G21', '蔦草（つたくさ）通（どお）りの 住人（じゅうにん）', 'U', 'G', 3, 2, 3, ['elf', 'warrior'], [], {
    onOtherEnter: (s, p, q, E) => { if (q.side === p.side && E.isCreature(q) && E.colorsOf(q.def).includes('G')) { const t = E.bestBuffTarget(s, null); if (t) { E.target(s, t); E.addCounters(s, t, 1); } } },
  }),
  sp('G22', '耕作（こうさく）', 'U', 'G', 3, 'sorcery', {
    play: (s, E) => ({ score: s.P.mana.length < 7 ? 13 : 4, run: () => { api_ramp(s); E.drawCard(s); } }),
  }),
  cr('G23', '魔力喰（まりょくく）らいの ハイドラ', 'R', 'G', 2, 1, 1, ['hydra'], ['trample'], {
    onAnyCast: (s, p, d, who, E) => E.addCounters(s, p, 1),
  }),
  pm('G24', '硬化（こうか）した 鱗（うろこ）', 'R', 'G', 1, ['enchantment'], { scales: true }),
  cr('G25', 'ジョラーガの 木語り', 'R', 'G', 2, 1, 1, ['elf', 'druid'], [], {
    levels: [{ at: 1, pow: 1, tou: 2, mana: ['G'], manaN: 2 }, { at: 5, pow: 1, tou: 4, mana: 'any', manaN: 3 }], levelMax: 5,
    acts: [{ cost: 2, req: ['G'], levelUp: true, when: [1, 2], play: (s, p) => ({ score: p.level < 5 ? 6 : 0, run: () => {} }) }],
  }),
  cr('G26', '原初（げんしょ）の ハイドラ', 'L', 'G', 1, 0, 0, ['hydra'], [], {
    x: true,
    play: (s, E, ctx) => (ctx.xMax >= 2 ? { score: 10 + ctx.xMax * 4, run: () => {} } : null),
    upkeep: (s, p, E) => E.addCounters(s, p, p.ctr),
    kwFn: (s, p) => (p.ctr >= 10 ? ['trample'] : null),
  }),
];

// ---- 白 ----
const W = [
  sp('W01', '警報（けいほう）の かね', 'C', 'W', 2, 'instant', { play: (s, E) => ({ score: 7, run: () => E.token(s, 'P', T.soldier, 2) }) }),
  cr('W02', 'おともの 騎士（きし）', 'C', 'W', 3, 2, 2, ['human', 'knight'], ['first'], { etb: (s, p, E) => E.token(s, 'P', T.soldier) }),
  cr('W03', 'ニクスの 毛皮の ひつじ', 'C', 'W', 2, 0, 5, ['sheep'], ['defender'], { upkeep: (s, p, E) => E.gain(s, 1) }),
  sp('W04', '三つの たましい', 'C', 'W', 6, 'sorcery', { kw: ['convoke'], play: (s, E) => ({ score: 15, run: () => E.token(s, 'P', T.spirit, 3) }) }),
  sp('W05', 'まばゆい 光', 'C', 'W', 3, 'instant', {
    kw: ['convoke'], reactive: true,
    react: (s, E, ctx) => {
      const t = ctx.attackers?.filter((p) => !ctx.blocks?.has(p.uid)).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
      return t && E.power(s, t) >= 3 ? { score: E.enemyThreatOf(s, t), run: () => { E.exile(s, t); E.bolster(s, 1); } } : null;
    },
  }),
  cr('W06', '群衆（ぐんしゅう）の 天使（てんし）', 'U', 'W', 6, (s, p, E) => E.creatures(s, p.side).length, (s, p, E) => E.creatures(s, p.side).length, ['angel'], ['convoke', 'flying']),
  pm('W07', '議事会（ぎじかい）の さばき', 'U', 'W', 4, ['enchantment'], {
    kw: ['convoke'],
    need: (s, E) => !!E.burnTarget(s, 99, { creatureOnly: true, mustHit: true }),
    etb: (s, p, E, o) => { const t = o.chosen ? o.chosen[0]?.[0] : E.burnTarget(s, 99, { creatureOnly: true, mustHit: true })?.t; if (t) E.exileLinked(s, p, t); },
  }),
  cr('W08', 'あがめられた ロクソドン', 'R', 'W', 5, 4, 4, ['elephant', 'soldier'], ['convoke'], {
    etb: (s, p, E, o) => { for (const q of o.convoked || []) E.addCounters(s, q, 1); },
  }),
  cr('W09', '太陽の神 ヘリオッド', 'L', 'W', 3, 4, 5, ['god'], ['indestructible'], {
    grant: (s, q, p, E) => (p.side === q.side && E.isCreature(p) ? ['vigilance'] : null),
    acts: [{ cost: 3, req: ['W'], when: [2], play: (s, p, E) => ({ score: 3, run: () => E.token(s, 'P', T.cleric) }) }],
  }),
  // 青白
  cr('W10', 'いやしの 鷹（たか）', 'C', 'W', 1, 1, 1, ['bird'], ['flying', 'lifelink']),
  cr('W11', '天馬の 乗り手', 'C', 'W', 3, 2, 2, ['human', 'soldier'], ['flying'], { heroic: (s, p, E) => E.addCounters(s, p, 1) }),
  sp('W12', '戦（たたか）いの そなえ', 'C', 'W', 1, 'sorcery', {
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
  cr('W14', '空（そら）の 戦術家（せんじゅつか）', 'U', 'W', 4, 3, 3, ['bird', 'soldier'], ['flying'], { etb: (s, p, E) => E.bolster(s, 2) }),
  sp('W15', '天の 風', 'U', 'W', 3, 'sorcery', {
    strive: 1,
    play: (s, E, ctx) => {
      if (ctx.phase !== 1) return null;
      const ts = strive(E.readyAttackers(s).sort((a, b) => E.power(s, b) - E.power(s, a)), 1, ctx);
      return ts.length ? { score: 2 + ts.length * 3, extra: ts.length - 1, run: () => { for (const t of ts) { E.target(s, t); E.pump(t, 2, 2, ['flying']); } } } : null;
    },
  }),
  cr('W16', 'アラシンの 見張（みは）り', 'R', 'W', 4,
    (s, p, E) => 3 + s[p.side].bf.filter((q) => q !== p && E.isCreature(q) && q.ctr > 0).length,
    (s, p, E) => 4 + s[p.side].bf.filter((q) => q !== p && E.isCreature(q) && q.ctr > 0).length,
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
  cr('W17', 'とりでの 精鋭（せいえい）', 'C', 'W', 1, 1, 1, ['human', 'soldier'], [], { onAttack: (s, p, E, atk) => { if (battalion(atk)) E.pump(p, 2, 2); } }),
  cr('W18', '勇敢（ゆうかん）な 空騎兵（そらきへい）', 'C', 'W', 2, 3, 1, ['human', 'knight'], [], { onAttack: (s, p, E, atk) => { if (battalion(atk)) E.pump(p, 0, 0, ['flying']); } }),
  sp('W19', 'ふるい立（た）つ 突撃（とつげき）', 'C', 'W', 4, 'instant', mass(2, 1)),
  cr('W20', '密集軍（みっしゅうぐん）の 隊長（たいちょう）', 'U', 'W', 2, 1, 1, ['human', 'soldier'], [], { heroic: (s, p, E) => { for (const q of mine(s, E)) E.addCounters(s, q, 1); } }),
  sp('W21', '民衆（みんしゅう）の 奮起（ふんき）', 'U', 'W', 3, 'instant', { ...mass(2, 0), flashback: { cost: 3, req: ['R'] } }),
  cr('W22', '退去（たいきょ）の 僧侶（そうりょ）', 'U', 'W', 3, 2, 2, ['human', 'cleric'], [], {
    etb: (s, p, E, o) => { const t = o.chosen ? o.chosen[0]?.[0] : E.burnTarget(s, 99, { creatureOnly: true, mustHit: true })?.t; if (t) E.exileLinked(s, p, t); },
  }),
  cr('W23', '管区（かんく）の 隊長（たいちょう）', 'R', 'W', 2, 2, 2, ['human', 'soldier'], ['first'], { onCombatHit: (s, p, E) => E.token(s, 'P', T.soldier) }),
  cr('W24', '見張（みは）りの 隊長（たいちょう）', 'R', 'W', 6, 3, 3, ['human', 'soldier'], ['vigilance'], {
    anthem: (s, q, p) => (p !== q && p.side === q.side && isSub(p, 'soldier') ? [1, 1] : null),
    grant: (s, q, p) => (p !== q && p.side === q.side && isSub(p, 'soldier') ? ['vigilance'] : null),
    etb: (s, p, E) => E.token(s, 'P', T.soldier, 3),
  }),
  pm('W25', '軍団（ぐんだん）の 集結（しゅうけつ）', 'R', 'W', 5, ['enchantment'], {
    upkeep: (s, p, E) => { p.flags.muster = (p.flags.muster || 0) + 1; E.token(s, 'P', T.soldierHaste, p.flags.muster); },
  }),
  cr('W26', 'オレスコスの 王 ブリマーズ', 'L', 'W', 3, 3, 4, ['cat', 'soldier'], ['vigilance'], {
    onAttack: (s, p, E, atk, a) => { const [t] = E.token(s, 'P', T.catSoldier); if (t) { t.attacking = true; atk.push({ p: t, t: a.t }); } },
  }),
];

// ---- 白緑・青白・赤白 ----
const GOLD1 = [
  cr('WG01', '協約（きょうやく）の 魂（たましい） エマーラ', 'U', 'WG', 3, 2, 2, ['elf', 'cleric'], [], {
    onTapped: (s, p, E) => { if (p.flags.turn.emmara) return; p.flags.turn.emmara = 1; E.token(s, 'P', T.soldierLL); },
  }),
  cr('WG02', '収穫（しゅうかく）の神（かみ） カラメトラ', 'R', 'WG', 5, 5, 6, ['god'], ['indestructible'], {
    onCast: (s, p, d) => { if (d.types.includes('creature')) api_ramp(s); },
  }),
  cr('WU01', '雷鳴（らいめい）の ワイバーン', 'U', 'WU', 4, 2, 3, ['drake'], ['flash', 'flying'], {
    flash: true,
    anthem: (s, q, p, E) => (p !== q && p.side === q.side && E.hasKw(s, p, 'flying') ? [1, 1] : null),
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
  sp('RW01', 'ボロスの 魔除（まよ）け', 'U', 'RW', 2, 'instant', {
    ...single(0, 0, { dbl: true }),
    singleRun: (s, E, q) => E.pump(q, 0, 0, ['double']),
    play: (s, E) => (s.floor.face ? { score: 4 * (s.floor.faceUnit ?? 1) + 2, run: () => E.hitEnemy(s, 4, null) } : burn(4, { creatureOnly: true })(s, E)),
    react: (s, E, ctx) => {
      const saved = mine(s, E).filter((p) => !E.hasKw(s, p, 'indestructible') && ctx.attackers.some((a) => ctx.blocks?.get(a.uid) === p && E.power(s, a) >= E.need(s, p)));
      return saved.length ? { score: saved.length * 5, run: () => { for (const p of s.P.bf) E.pump(p, 0, 0, ['indestructible']); } } : null;
    },
  }),
  cr('RW02', '勝利（しょうり）の神（かみ） イロアス', 'R', 'RW', 5, 7, 4, ['god'], ['indestructible'], { protectAttackers: true }),
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
  cr('U04', '対称（たいしょう）の 賢者（けんじゃ）', 'C', 'U', 2, 0, 2, ['human', 'wizard'], ['flying'], {
    onCast: (s, p, d) => { if (d.types.includes('instant') || d.types.includes('sorcery')) p.base2 = true; },
  }),
  sp('U05', 'ゼロで わる', 'U', 'U', 3, 'instant', {
    play: (s, E) => {
      const b = E.burnTarget(s, 99, { creatureOnly: true, mustHit: true });
      return b ? { score: 4 + b.score * 0.5, run: () => { E.bounce(s, b.t); E.drawCard(s); E.sba(s); } } : null;
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
  sp('U09', '選択（せんたく）', 'C', 'U', 1, 'instant', { play: (s, E, ctx) => (ctx.phase === 2 ? { score: 3, run: () => E.then(E.scry(s, 1), () => E.drawCard(s)) } : null) }),
  cr('U10', 'ジェスカイの 風斥候（かぜせっこう）', 'C', 'U', 3, 2, 2, ['bird', 'scout'], ['flying', 'prowess']),
  sp('U11', '本質（ほんしつ）の 散乱（さんらん）', 'C', 'U', 2, 'instant', { counter: 'creature', reactive: true }),
  sp('U12', '二度 考える', 'C', 'U', 2, 'instant', { play: draw(1, 3), flashback: { cost: 3, req: ['U'] } }),
  sp('U13', 'なぞめいた 命令（めいれい）', 'U', 'U', 2, 'instant', {
    escalate: 1,
    // AI：ねうちの 大きい モードから、払える だけ
    play: (s, E, ctx) => {
      const ms = [];
      ms.push({ v: 4, run: () => E.drawCard(s) });
      const f = theirs(s, E).filter((p) => !p.tapped && (p.def.attacks || p.def.headDmg) && !s.floor.untargetable?.(s, p, E)).sort((a, b) => (b.def.headDmg || E.power(s, b)) - (a.def.headDmg || E.power(s, a)))[0];
      if (f && ctx.phase === 2) ms.push({ v: (f.def.headDmg || E.power(s, f)) * 2, run: () => { if (E.onBf(s, f)) { f.tapped = true; f.frozen = true; } } });
      const b = E.burnTarget(s, 99, { creatureOnly: true, mustHit: true });
      if (b && b.score >= 4) ms.push({ v: 3 + b.score * 0.5, run: () => { if (E.onBf(s, b.t)) E.bounce(s, b.t); E.sba(s); } });
      ms.sort((a, b2) => b2.v - a.v);
      const use = ms.slice(0, 1 + Math.max(0, ctx.manaLeft ?? 0));
      return { score: use.reduce((t, m) => t + m.v, 0) - use.length, extra: use.length - 1, run: () => { for (const m of use) m.run(); } };
    },
  }),
  cr('U14', '放蕩（ほうとう）の 魔術師（まじゅつし）', 'U', 'U', 3, 1, 1, ['human', 'wizard'], [], {
    acts: [{ cost: 0, tap: true, when: [2], play: (s, p, E) => { const b = E.burnTarget(s, 1, { mustHit: !!s.floor.face }); return b ? { score: 2 + b.score, run: () => hit(s, E, b.t, 1) } : null; } }],
  }),
  sp('U15', '対抗呪文（たいこうじゅもん）', 'U', 'U', 2, 'instant', { counter: 'any', req2: true, reactive: true }),
  cr('U16', '空召喚士（そらしょうかんし） ターランド', 'R', 'U', 4, 2, 2, ['merfolk', 'wizard'], [], {
    onCast: (s, p, d, E) => { if (d.types.includes('instant') || d.types.includes('sorcery')) E.token(s, 'P', T.drake); },
  }),
  { ...cr('U17', '激浪（げきろう）の 機械巨人（きかいきょじん）', 'L', 'U', 6, 5, 6, ['construct'], ['flash'], {
    flash: true,
    etb: (s, p, E) => { const b = E.bestInstantInGy(s); if (b) E.castFree(s, b.c, b.r); },
  }), types: ['artifact', 'creature'] },
];

// ---- 赤 ----
const R = [
  // 赤白
  sp('R01', 'ゴブリンの 号令（ごうれい）', 'C', 'R', 2, 'sorcery', { play: (s, E) => ({ score: 7, run: () => E.token(s, 'P', T.goblin, 2) }) }),
  cr('R02', '突進（とっしん）する 軍曹（ぐんそう）', 'C', 'R', 3, 3, 2, ['human', 'soldier'], ['haste', 'mentor']),
  cr('R03', 'ウォジェクの 槍兵（そうへい）', 'C', 'R', 3, 2, 2, ['human', 'soldier'], [], { onAttack: (s, p, E, atk) => { if (packTactics(s, E, atk)) E.pump(p, 1, 0, ['first']); } }),
  sp('R04', 'シヴの 炎（ほのお）', 'C', 'R', 1, 'instant', {
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
  sp('R06', 'ラッパの 一吹（ひとふ）き', 'U', 'R', 3, 'instant', mass(2, 0, (q) => q.attacking)),
  cr('R07', 'ゴブリンの 大将（たいしょう）', 'R', 'R', 3, 2, 2, ['goblin', 'warrior'], ['mentor'], {
    combatStart: (s, p, E) => E.token(s, 'P', T.goblinHaste),
    onAttack: (s, p, E, atk) => E.pump(p, atk.filter((a) => a.p !== p && isSub(a.p, 'goblin')).length, 0),
  }),
  cr('R08', '鍛冶（かじ）の神（かみ） パーフォロス', 'L', 'R', 4, 6, 5, ['god'], ['indestructible'], {
    onOtherEnter: (s, p, q, E) => { if (q.side === p.side && q.side === 'P' && E.isCreature(q)) E.hitEnemy(s, 2, p); },
    acts: [{ cost: 3, req: ['R'], when: [1], play: (s, p, E) => (E.readyAttackers(s).length >= 3 ? { score: E.readyAttackers(s).length, run: () => { for (const q of mine(s, E)) E.pump(q, 1, 0); } } : null) }],
  }),
  // 赤青
  cr('R09', '僧院（そういん）の 速槍（はややり）', 'C', 'R', 1, 1, 2, ['human', 'monk'], ['haste', 'prowess']),
  sp('R10', '火炎（かえん）', 'C', 'R', 1, 'sorcery', {
    x: true,
    play: (s, E, ctx) => xBurn(s, E, ctx, 0, (t) => { if (t.exact) E.drawCard(s); }),
  }),
  sp('R11', '裂（さ）け目（め）の 稲妻（いなずま）', 'C', 'R', 3, 'sorcery', { play: burn(3), burnN: 3, suspend: { cost: 1, req: ['R'], turns: 1 }, suspendScore: 9 }),
  cr('R12', '火口（かこう）の 射手（いて）', 'C', 'R', 2, 2, 2, ['human', 'archer'], [], {
    onCast: (s, p, d, E) => { if (!d.types.includes('creature')) E.hitEnemy(s, 1, p); },
  }),
  cr('R13', '窯（かま）の 悪鬼（あっき）', 'U', 'R', 4, 3, 3, ['elemental', 'beast'], [], {
    onCast: (s, p, d, E) => { if (d.types.includes('instant') || d.types.includes('sorcery')) E.pump(p, 3, 0); },
  }),
  cr('R14', '若（わか）き 紅蓮術士（ぐれんじゅつし）', 'U', 'R', 2, 2, 2, ['human', 'shaman'], [], {
    onCast: (s, p, d, E) => { if (d.types.includes('instant') || d.types.includes('sorcery')) E.token(s, 'P', T.elemental); },
  }),
  sp('R15', 'マグマの 噴流（ふんりゅう）', 'U', 'R', 2, 'instant', { play: (s, E) => { const r = burn(3)(s, E); return r ? { score: r.score + 1, run: () => { r.run(); return E.scry(s, 2); } } : null; }, burnN: 3 }),
  sp('R16', '火口（かこう）の 爪（つめ）', 'R', 'R', 1, 'sorcery', {
    x: true,
    play: (s, E, ctx) => xBurn(s, E, ctx, ferocious(s, E) ? 2 : 0),
  }),
  cr('R17', '路地裏（ろじうら）の 火（ひ）の子（こ）', 'R', 'R', 3, 2, 2, ['goblin', 'shaman'], [], {
    onCast: (s, p, d, E) => { if (d.types.includes('instant') || d.types.includes('sorcery')) E.hitEnemy(s, 2, p); },
  }),
  // 緑赤
  cr('R18', '山頂（さんちょう）の 徘徊者（はいかいしゃ）', 'C', 'R', 4, 4, 3, ['troll'], [], { pittari: (s, p, E) => E.addCounters(s, p, 1) }),
  sp('R19', '引（ひ）き倒（たお）し', 'C', 'R', 4, 'instant', {
    play: (s, E) => {
      const b = E.burnTarget(s, 5, { creatureOnly: true, filter: (p) => E.need(s, p) <= (p.ctr > 0 ? 5 : 3) });
      return b ? { score: 6 + b.score, run: () => hit(s, E, b.t, b.t.ctr > 0 ? 5 : 3) } : null;
    },
  }),
  sp('R20', 'ティムールの 激闘（げきとう）', 'C', 'R', 2, 'instant', { ...single(0, 0, { dbl: true, trample: true }), singleRun: (s, E, q) => E.pump(q, 0, 0, ferocious(s, E) ? ['double', 'trample'] : ['double']) }),
  sp('R21', '獣（けもの）の 力（ちから）', 'C', 'R', 1, 'instant', single(3, 3)),
  sp('R22', '焼（や）き焦（こ）がし', 'U', 'R', 2, 'sorcery', { play: burn(5, { creatureOnly: true, filter: (p) => !p.def.kw?.includes('flying') }) }),
  cr('R23', 'ドラゴンの 雛（ひな）', 'U', 'R', 2, 0, 1, ['dragon'], ['flying'], { acts: [{ cost: 1, req: ['R'], pumpP: 1, when: [], play: () => null }] }),
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
  cr('R25', '炎跡（えんせき）の フェニックス', 'R', 'R', 3, 2, 2, ['phoenix'], ['flying', 'haste'], {
    mustAttack: true,
    gyCombatStart: (s, c, E) => {
      if (!ferocious(s, E)) return;
      const pl = E.plan(s, 1, ['R']); if (!pl) return;
      E.pay(s, pl); s.P.gy.splice(s.P.gy.indexOf(c), 1); E.enter(s, 'P', c.def);
    },
  }),
  cr('R26', '嵐息吹（あらしいぶき）の ドラゴン', 'L', 'R', 5, 4, 4, ['dragon'], ['flying', 'haste'], {
    acts: [{ cost: 1, req: ['R'], discard: 2, monstrosity: true, when: [1, 2], play: (s, p, E) => ({ score: 4 + s.P.hand.length, run: () => { E.addCounters(s, p, 3); E.hitEnemy(s, s.P.hand.length, p); } }) }],
  }),
];

// ---- 青（青緑） ----
const U2 = [
  cr('U18', '雲（くも）ひれの 猛禽（もうきん）', 'C', 'U', 1, 1, 1, ['bird', 'mutant'], ['flying', 'evolve']),
  sp('U19', '未来（みらい）の ひらめき', 'C', 'U', 3, 'sorcery', { play: draw(2, 7), suspend: { cost: 1, req: ['U'], turns: 2 }, suspendScore: 6 }),
  cr('U20', '前兆語（ぜんちょうがた）り', 'C', 'U', 2, 1, 3, ['human', 'wizard'], [], { etb: (s, p, E) => E.scry(s, 2) }),
  cr('U21', '空見の 弟子', 'C', 'U', 1, 1, 1, ['human', 'wizard'], [], {
    levels: [{ at: 1, pow: 2, tou: 2, kw: ['flying'] }, { at: 3, pow: 4, tou: 2, kw: ['flying'] }], levelMax: 3,
    acts: [{ cost: 2, req: ['U'], levelUp: true, when: [1, 2], play: (s, p) => ({ score: p.level < 3 ? 7 : 0, run: () => {} }) }],
  }),
  cr('U22', '鳴り羽', 'U', 'U', 2, 1, 1, ['bird', 'horror'], ['flying'], { onCombatHit: (s, p, E) => E.proliferate(s) }),
  cr('U23', '翼竜（よくりゅう）の 学者（がくしゃ）', 'U', 'U', 2, 1, 1, ['lizard'], ['flying'], {
    acts: [{
      cost: (s) => Math.max(1, 7 - s.P.gy.filter((c) => c.def.types.includes('instant') || c.def.types.includes('sorcery')).length),
      req: ['U'], when: [1, 2],
      play: (s, p, E) => (p.ctr === 0 ? { score: 6, run: () => E.addCounters(s, p, 4) } : null),
    }],
  }),
  pm('U24', '容赦（ようしゃ）なき 潮流（ちょうりゅう）', 'R', 'U', 5, ['enchantment'], { onCast: (s, p, d, E) => E.proliferate(s) }),
  cr('U25', 'クローン', 'R', 'U', 4, 0, 0, ['shapeshifter'], [], {
    need: (s, E) => [...mine(s, E), ...theirs(s, E)].some((q) => E.power(s, q) >= 3 && !q.def.noCopy),
    etb: (s, p, E, o) => {
      const t = o.chosen ? o.chosen[0]?.[0] : [...mine(s, E), ...theirs(s, E)].filter((q) => q !== p && !q.def.noCopy).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
      if (t) { const d = t.card || t.def; p.def = { ...d, reward: undefined, noBlock: undefined, attacks: undefined }; }
    },
  }),
  sp('U26', '研究（けんきゅう）の 成果（せいか）', 'R', 'U', 4, 'sorcery', { play: (s, E) => ({ score: 8, run: () => { E.drawCard(s, 2); E.proliferate(s); } }) }),
];

// ---- 2色（赤青・緑赤・青緑） ----
const GOLD2 = [
  cr('UR01', '嵐追（あらしお）いの 魔道士（まどうし）', 'U', 'UR', 2, 1, 3, ['human', 'monk'], ['flying', 'haste', 'prowess']),
  cr('UR02', '嵐（あらし）の神（かみ） ケラノス', 'R', 'UR', 6, 6, 5, ['god'], ['indestructible'], {
    upkeep: (s, p, E) => {
      const c = s.P.lib.shift(); if (!c) return;
      const d = c.def;
      if (d.types.includes('instant') || d.types.includes('sorcery')) { E.hitEnemy(s, 3, p); s.P.hand.push(c); }
      else if (d.types.includes('creature') && s.P.mana.length < 7) s.P.mana.push({ ...c, tapped: false });
      else s.P.hand.push(c);
    },
  }),
  cr('RG01', 'ゴーア族（ぞく）の 暴（あば）れ者（もの）', 'U', 'RG', 4, 4, 4, ['beast'], ['trample'], {
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
  art(cr('C01', '羽（は）ばたき 飛行機械（ひこうきかい）', 'C', '', 0, 0, 2, ['thopter'], ['flying'], { permScore: () => 3 })),
  art(cr('C02', 'ボトルの ノーム', 'C', '', 3, 1, 3, ['gnome'], [], {
    acts: [{ cost: 0, when: [1, 2], play: (s, p, E) => (s.P.life <= 5 ? { score: 9, run: () => { E.leave(s, p, 'gy'); E.gain(s, 3); } } : null) }],
  })),
  pm('C03', '精神（せいしん）の 石（いし）', 'C', '', 2, ['artifact'], {
    mana: ['C'],
    acts: [{ cost: 1, tap: true, when: [2], play: (s, p, E) => (s.P.mana.length >= 6 && s.P.hand.length <= 1 ? { score: 3, run: () => { E.leave(s, p, 'gy'); E.drawCard(s); } } : null) }],
  }),
  pm('C04', 'みじかい 剣（けん）', 'C', '', 1, ['artifact'], { equip: 1, eqP: 1, eqT: 1 }),
  art(cr('C05', 'ジャガーノート', 'U', '', 4, 5, 3, ['juggernaut'], [], { mustAttack: true })),
  pm('C06', '予言の プリズム', 'U', '', 2, ['artifact'], { prism: true, etb: (s, p, E) => E.drawCard(s) }),
  pm('C07', '骨断（ほねた）ちの 剣（けん）', 'U', '', 1, ['artifact'], { equip: 1, eqP: 2, eqT: 0 }),
  art(cr('C08', 'マイアの 戦闘球（せんとうきゅう）', 'R', '', 7, 4, 7, ['construct'], [], { etb: (s, p, E) => E.token(s, 'P', T.myr, 4) })),
  art(cr('C09', '厳粛（げんしゅく）な 空身像（うつしみぞう）', 'R', '', 4, 2, 2, ['golem'], [], { etb: () => {}, etbRamp: true, onDie: (s, p, E) => E.drawCard(s) })),
  art(cr('C10', 'ワームとぐろ エンジン', 'L', '', 6, 6, 6, ['wurm'], ['deathtouch', 'lifelink'], {
    onDie: (s, p, E) => { E.token(s, 'P', T.wurmDT); E.token(s, 'P', T.wurmLL); },
  })),
];

// ======== 第2弾（62種）。文章は docs/cards/set2.md ========
const divineArrow = (s, E, t) => { const h = hit(s, E, t, 4); if (h && h.exact) E.token(s, 'P', T.soldier); };
const diceBolt = (s, E, t) => {
  const rolls = [E.rollDie(s)]; if (rolls[0] === 6) rolls.push(E.rollDie(s));
  hit(s, E, t, rolls.reduce((a, b) => a + b, 0));
  return s.ai.dice?.(rolls);
};
function treasureChest(s, p, E) {
  E.leave(s, p, 'gy');
  const n = E.rollDie(s);
  if (n >= 2 && n <= 3) E.token(s, 'P', T.treasure, 2);
  if (n >= 4) E.drawCard(s, 2);
  if (n === 6) E.token(s, 'P', T.treasure, 3);
  return s.ai.dice?.([n]);
}
function uroTrigger(s, p, E) {
  if (p.side !== 'P') return;
  E.gain(s, 3); E.drawCard(s);
  const c = lowestKeep(s, E);
  if (c && s.P.mana.length < 9) E.charge(s, c, false);
}
const ramThrough = (s, E, me, t) => {
  E.target(s, me);
  const n = E.power(s, me), left = E.need(s, t);
  E.damage(s, t, n, me);
  if (E.hasKw(s, me, 'trample') && n > left) E.hitEnemy(s, n - left, me);
  E.sba(s);
};
// 業火の タイタン：3点を 割り振る。ちょうど たおせる てきから じゅんに、のこりは てきへ
const titanSplit = (s, E, p) => {
  let n = 3;
  const foes = E.creatures(s, p.side === 'P' ? 'E' : 'P').filter((q) => !s.floor.untargetable?.(s, q, E)).sort((a, b) => E.need(s, a) - E.need(s, b));
  for (const q of foes) { const k = E.need(s, q); if (k > 0 && k <= n) { E.damage(s, q, k, p); n -= k; } }
  E.sba(s);
  if (n > 0) E.hitEnemy(s, n, p);
  E.sba(s);
};
// 唱えた 呪文の コスト（X は X × かける数 を たす）
const spellCost = (d, o) => d.cost + (o?.x || 0) * (d.xMul || 1);

const W2 = [
  cr('W27', 'アコーダーの 聖騎士（せいきし）', 'C', 'W', 2, 3, 1, ['human', 'knight'], ['battlecry']),
  cr('W28', '裂（さ）け目（め）見張（みは）りの エイヴン', 'C', 'W', 3, 2, 3, ['bird', 'soldier'], ['flying'], vanish(3, {
    etb: (s, p, E) => { if (p.side === 'P') E.gain(s, 2); },
    onLeaveSelf: (s, p, E) => { if (p.side === 'P') E.gain(s, 2); },
  })),
  cr('W29', 'ろうそく森（もり）の 魔女（まじょ）', 'C', 'W', 2, 2, 2, ['human', 'cleric'], [], {
    combatStart: (s, p, E) => { if (E.coven(s)) E.pump(p, 0, 0, ['flying']); },
  }),
  cr('W30', 'プライドの 英雄（えいゆう）', 'C', 'W', 3, 2, 3, ['human', 'soldier'], [], { heroic: (s, p, E) => { for (const q of mine(s, E)) E.pump(q, 1, 0); } }),
  sp('W31', '天（てん）の 矢（や）', 'C', 'W', 2, 'instant', {
    reactive: true,
    react: (s, E, ctx) => {
      const t = (ctx.attackers || []).filter((p) => E.onBf(s, p) && E.need(s, p) <= 4).sort((a, b) => E.enemyThreatOf(s, b) - E.enemyThreatOf(s, a))[0];
      return t ? { score: E.enemyThreatOf(s, t) + (E.need(s, t) === 4 ? 3 : 0), run: () => divineArrow(s, E, t) } : null;
    },
  }),
  pm('W32', 'メレティスの 誕生（たんじょう）', 'U', 'W', 2, ['enchantment'], { sub: ['saga'], ...saga([
    { run: (s, E) => {
      const i = s.P.lib.findIndex((c) => c.def.basic && E.colorsOf(c.def).includes('W'));
      if (i < 0) return E.drawCard(s);
      const [c] = s.P.lib.splice(i, 1); s.P.mana.push({ ...c, tapped: true }); E.L(s, `マナ：${c.def.name}`);
    } },
    { run: (s, E) => E.token(s, 'P', T.wall) },
    { run: (s, E) => E.gain(s, 3) },
  ]) }),
  cr('W33', '石（いし）の 皮（かわ）の けもの', 'U', 'W', 4, 5, 5, ['beast'], [], vanish(4)),
  cr('W34', '太陽（たいよう）に 祝福（しゅくふく）された ダクソス', 'U', 'W', 2, 2,
    (s, p, E) => s[p.side].bf.filter((q) => E.colorsOf(q.def).includes('W')).length, ['demigod'], [], {
      etb: (s, p, E) => { if (p.side === 'P') E.gain(s, 1); },
      onOtherEnter: (s, p, q, E) => { if (p.side === 'P' && q.side === 'P' && E.isCreature(q)) E.gain(s, 1); },
      onOtherLeave: (s, p, q, E, o) => { if (p.side === 'P' && q.side === 'P' && o?.died && E.isCreature(q)) E.gain(s, 1); },
    }),
  pm('W35', 'エルズペス、死（し）に 打（う）ち勝（か）つ', 'R', 'W', 5, ['enchantment'], { sub: ['saga'], ...saga([
    {
      tgt: [{ side: 'E', min: 0, filter: (s, E, p) => E.pt(s, p)[1] >= 3, label: 'ついほうする タフネス 3いじょうの てき' }],
      run: (s, E, p, picks) => {
        const t = picks ? picks[0]?.[0] : E.burnTarget(s, 99, { creatureOnly: true, mustHit: true, filter: (q) => E.pt(s, q)[1] >= 3 })?.t;
        if (t && t !== 'face' && E.onBf(s, t)) E.exile(s, t);
      },
    },
    { run: (s, E) => E.bolster(s, 2) },
    { run: (s, E) => { const c = bestIn(s.P.gy, (c) => c.def.types.includes('creature') && !c.def.x); if (c) { s.P.gy.splice(s.P.gy.indexOf(c), 1); E.enter(s, 'P', c.def); } } },
  ]) }),
  pm('W36', '栄光（えいこう）の 賛歌（さんか）', 'R', 'W', 3, ['enchantment'], {
    anthem: (s, q, p, E) => (p.side === q.side && E.isCreature(p) ? [1, 1] : null),
    need: (s, E) => mine(s, E).length >= 2,
  }),
  cr('W37', 'アクロスの 古強者（ふるつわもの） タラニカ', 'L', 'W', 3, 3, 3, ['human', 'soldier'], ['vigilance'], {
    onAttack: (s, p, E, atk) => {
      const gain = (q) => 4 - (typeof q.def.pow === 'number' ? q.def.pow : E.power(s, q) - q.ctr);
      const pool = atk.map((a) => a.p).filter((q) => q !== p && E.onBf(s, q) && E.isCreature(q));
      const t = (pool.length ? pool : mine(s, E).filter((q) => q !== p)).sort((a, b) => gain(b) - gain(a))[0];
      if (!t || gain(t) <= 0) return;
      t.tapped = false; t.setPT = [4, 4]; E.pump(t, 0, 0, ['indestructible']);
      E.L(s, `タラニカ：${t.def.name} は もとの パワーと タフネスが 4/4`);
    },
  }),
  // 第2弾の 追加（レア・レジェンド）
  { ...cr('W38', '太陽（たいよう）の めぐみの アルコン', 'R', 'W', 4, 3, 4, ['archon'], ['flying', 'lifelink'], {
    etb: (s, p, E) => E.token(s, p.side, T.pegasus),
    onOtherEnter: (s, p, q, E) => { if (q.side === p.side && q.def.types.includes('enchantment')) E.token(s, p.side, T.pegasus); },
  }), types: ['enchantment', 'creature'] },
  cr('W39', 'かがやく 聖戦士（せいせんし） エーデリン', 'R', 'W', 3, (s, p, E) => E.creatures(s, p.side).length, 4, ['human', 'knight'], ['vigilance'], {
    onAttack: (s, p, E, atk, a) => { const [t] = E.token(s, p.side, T.human, 1, { tapped: true }); if (t) { t.attacking = true; atk.push({ p: t, t: a.t }); } },
  }),
  cr('W40', 'フェリダーの 君主（くんしゅ）', 'L', 'W', 6, 4, 6, ['cat', 'beast'], ['vigilance', 'lifelink'], {
    upkeep: (s, p, E) => { if (p.side === 'P' && s.P.life >= 40) { E.L(s, `フェリダーの 君主：ライフ ${s.P.life}（40 いじょう）で かち！`); s.over = 'win'; } },
  }),
];

const U3 = [
  cr('U27', '潮（しお）だまりの 見習（みなら）い', 'C', 'U', 2, 1, 2, ['merfolk', 'wizard'], [], {
    etb: (s, p, E) => { if (p.side !== 'P' || s.P.mana.length >= 9) return; const c = lowestKeep(s, E); if (c) E.charge(s, c, true); },
  }),
  cr('U28', '深海（しんかい）の 生術師（せいじゅつし）', 'C', 'U', 1, 1, 1, ['human', 'wizard', 'mutant'], [], {
    acts: [{ cost: 3, req: ['U'], adapt: 1, when: [1, 2], play: (s, p, E) => (p.ctr === 0 ? { score: 5, run: () => E.addCounters(s, p, 1) } : null) }],
    onCounters: (s, p, E) => { if (p.side !== 'P') return; E.drawCard(s); E.discard(s, E.discardPick(s, 1)); },
  }),
  cr('U29', '占（うらな）いの ふくろう', 'C', 'U', 2, 1, 1, ['bird'], ['flying'], { etb: (s, p, E) => { if (p.side === 'P') return E.scry(s, 3); } }),
  cr('U30', 'いたずら キメラ', 'C', 'U', 3, 1, 3, ['chimera'], ['flying'], {
    onCast: (s, p, d, E, o) => { if (p.side !== 'P') return; if (spellCost(d, o) % 2) E.hitEnemy(s, 1, p); else E.scry(s, 1); },
  }),
  cr('U31', 'からっぽの 雲（くも）の 精（せい）', 'C', 'U', 3, (s, p) => 2 + (hb(s, p) ? 2 : 0), 2, ['elemental'], ['flying'], { hellbent: true }),
  pm('U32', '氷（こおり）の 時代（じだい）', 'U', 'U', 3, ['enchantment'], { sub: ['saga'], ...saga([
    ...[1, 2].map(() => ({
      tgt: [{ side: 'E', min: 0, filter: (s, E, p) => !p.iceBy, label: 'タップして 止める てきの クリーチャー' }],
      run: (s, E, p, picks) => {
        const t = picks ? picks[0]?.[0] : bestFreeze(s, E);
        if (!t || !E.onBf(s, t)) return;
        t.tapped = true; t.iceBy = p; (p.flags.iced ||= []).push(t);
        E.L(s, `こおりの じだい：${t.def.name} を とめた`);
      },
    })),
    { run: (s, E, p) => { for (const t of p.flags.iced || []) if (E.onBf(s, t) && t.iceBy === p) E.bounce(s, t); E.sba(s); } },
  ]) }),
  cr('U33', '潮（しお）を 歩（ある）く 者（もの）', 'U', 'U', 3, (s, p) => p.time || 0, (s, p) => p.time || 0, ['elemental'], [], {
    ...vanish((s, p, E) => s[p.side].mana.filter((m) => E.colorsOf(m.def).includes('U')).length),
    need: (s, E) => s.P.mana.filter((m) => E.colorsOf(m.def).includes('U')).length >= 3,
  }),
  cr('U34', '時（とき）を わたる クロノゾア', 'U', 'U', 4, 3, 3, ['illusion'], ['flying'], vanish(3, {
    onDie: (s, p, E) => { if (!p.time && p.side === 'P') E.token(s, 'P', T.illusion, 2); },
  })),
  pm('U35', 'ミラーリの 予想（よそう）', 'R', 'U', 3, ['enchantment'], { sub: ['saga'], ...saga([
    { run: (s, E) => { const c = bestIn(s.P.gy, (c) => c.def.types.includes('instant') && !c.def.basic); if (c) { s.P.gy.splice(s.P.gy.indexOf(c), 1); s.P.hand.push(c); E.L(s, `てふだへ：${c.def.name}`); } } },
    { run: (s, E) => { const c = bestIn(s.P.gy, (c) => c.def.types.includes('sorcery') && !c.def.basic); if (c) { s.P.gy.splice(s.P.gy.indexOf(c), 1); s.P.hand.push(c); E.L(s, `てふだへ：${c.def.name}`); } } },
    { run: (s) => { s.P.flags.copySpells = s.turn; } },
  ]) }),
  pm('U36', 'あやしい 海（うみ）', 'R', 'U', 2, ['enchantment'], {
    onDraw: (s, p, E) => { p.marks = (p.marks || 0) + 1; if (p.marks >= 8) { p.marks -= 8; E.token(s, p.side, T.kraken); } },
  }),
  pm('U37', 'キオラ、海（うみ）の神（かみ）を くだす', 'L', 'U', 7, ['enchantment'], { sub: ['saga'], ...saga([
    { run: (s, E) => E.token(s, 'P', T.kraken) },
    { run: (s, E) => { for (const q of theirs(s, E)) { q.tapped = true; q.frozen = true; } } },
    {
      tgt: [{ side: 'E', perm: true, min: 0, label: 'ついほうする てきの カード' }],
      run: (s, E, p, picks) => { const t = picks ? picks[0]?.[0] : E.burnTarget(s, 99, { creatureOnly: true, mustHit: true })?.t; if (t && t !== 'face' && E.onBf(s, t)) E.exile(s, t); },
    },
  ]) }),
  // 第2弾の 追加（レア・レジェンド）
  sp('U38', 'サメの 大（おお）あらし', 'R', 'U', 2, 'instant', {
    x: true,
    play: (s, E, ctx) => (ctx.xMax >= 2 || ctx.human ? { score: 5 + ctx.xMax * 3, x: ctx.xMax, run: (xx) => { E.token(s, 'P', { ...T.shark, pow: xx, tou: xx }); E.drawCard(s); } } : null),
  }),
  cr('U39', 'なぞかけの スフィンクス', 'R', 'U', 5, 4, 4, ['sphinx'], ['flying'], {
    etb: (s, p, E, o) => {
      const foes = E.creatures(s, p.side === 'P' ? 'E' : 'P').filter((q) => E.power(s, q) <= 4 && !s.floor.untargetable?.(s, q, E));
      const t = o.chosen ? o.chosen[0]?.[0] : foes.sort((a, b) => E.power(s, b) - E.power(s, a))[0];
      if (t && E.onBf(s, t)) { E.bounce(s, t); E.sba(s); }
    },
  }),
  cr('U40', '大（おお）だこの 王（おう） ロートス', 'L', 'U', 7, 8, 8, ['octopus'], [], {
    onAttack: (s, p, E) => {
      const ts = E.creatures(s, p.side === 'P' ? 'E' : 'P').sort((a, b) => E.power(s, b) - E.power(s, a)).slice(0, 8);
      for (const q of ts) { q.tapped = true; q.frozen = true; }
      if (ts.length) E.L(s, `ロートス：${ts.length}体を タップした（つぎの ターン 起きない）`);
    },
  }),
];

const G2 = [
  sp('G27', '力（ちから）くらべ', 'C', 'G', 1, 'instant', {
    play: (s, E) => {
      const me = E.bestBuffTarget(s, null); if (!me) return null;
      const b = E.burnTarget(s, E.power(s, me) + (E.coven(s) ? 1 : 0), { creatureOnly: true }); if (!b) return null;
      return { score: 6 + b.score, run: () => duel(s, E, me, b.t) };
    },
  }),
  cr('G28', 'くいしんぼうの テュポーン', 'C', 'G', 4, 4, 4, ['beast'], [], { escape: { cost: 6, req: ['G'], exile: 4, ctr: 3 } }),
  cr('G29', 'ほえる つのの けもの', 'C', 'G', 2, 3, 2, ['beast'], [], { bloodrush: { cost: 1, req: ['G'], p: 3, t: 2 }, singleRun: (s, E, q) => E.pump(q, 3, 2) }),
  sp('G30', '大地（だいち）の 突進（とっしん）', 'C', 'G', 2, 'instant', {
    play: (s, E) => {
      const me = E.bestBuffTarget(s, null); if (!me) return null;
      const b = E.burnTarget(s, E.power(s, me), { creatureOnly: true }); if (!b) return null;
      return { score: 6 + b.score, run: () => ramThrough(s, E, me, b.t) };
    },
  }),
  cr('G31', 'ネシアンの つのカブト', 'C', 'G', 2, 2, 2, ['insect'], [], {
    combatStart: (s, p, E) => { if (mine(s, E).some((q) => q !== p && E.power(s, q) >= 4)) E.addCounters(s, p, 1); },
  }),
  cr('G32', '育成（いくせい）の ドルイド', 'U', 'G', 2, 0, 2, ['elf', 'druid'], [], {
    mana: ['G'], manaN: (p) => (p.ctr > 0 ? 3 : 1),
    acts: [{ cost: 4, req: ['G'], adapt: 3, when: [1, 2], play: (s, p, E) => (p.ctr === 0 ? { score: 6, run: () => E.addCounters(s, p, 3) } : null) }],
  }),
  pm('G33', 'フレイアリーズの 歌（うた）', 'U', 'G', 3, ['enchantment'], { sub: ['saga'], ...saga([
    ...[1, 2].map(() => ({ run: (s) => { s.P.flags.anyManaUntil = s.stats.playerTurns; } })),
    { run: (s, E) => { for (const q of mine(s, E)) { E.addCounters(s, q, 1); E.pump(q, 0, 0, ['vigilance', 'trample']); } } },
  ]) }),
  cr('G34', '秋（あき）の 予言者（よげんしゃ）', 'U', 'G', 3, 2, 3, ['elf', 'druid'], [], {
    etb: (s, p, E, o) => {
      if (p.side !== 'P') return;
      if (!E.coven(s)) return E.scry(s, 2);
      if (o.chosen?.[0]?.length) { for (const d of o.chosen[0]) { E.target(s, d.t); E.addCounters(s, d.t, d.n); } return; }
      for (let i = 0; i < 2; i++) { const t = E.bestBuffTarget(s, null); if (t) { E.target(s, t); E.addCounters(s, t, 1); } }
    },
  }),
  sp('G35', '召集（しょうしゅう）の 和音（わおん）', 'R', 'G', 2, 'instant', {
    x: true, kw: ['convoke'],
    play: (s, E, ctx) => {
      const c = bestIn(s.P.lib, (c) => c.def.types.includes('creature') && !c.def.x && c.def.cost <= ctx.xMax);
      return c ? { score: 8 + c.def.cost * 2, x: c.def.cost, run: (xx) => chord(s, E, xx) } : null;
    },
  }),
  cr('G36', 'よくばりな ハイドラ', 'R', 'G', 1, 0, 1, ['hydra'], ['trample'], {
    x: true,
    play: (s, E, ctx) => (ctx.xMax >= 2 ? { score: 10 + ctx.xMax * 4, run: () => {} } : null),
    etb: (s, p, E, o) => {
      let t = o.chosen ? o.chosen[0]?.[0] : null;
      if (!o.chosen) { const b = E.burnTarget(s, E.power(s, p), { creatureOnly: true }); if (b && b.score >= 6 && E.power(s, b.t) < E.pt(s, p)[1]) t = b.t; }
      if (t && E.onBf(s, t)) E.fight(s, p, t); else E.addCounters(s, p, p.ctr);
    },
  }),
  cr('G37', '狩猟（しゅりょう）の神（かみ） ナイレア', 'L', 'G', 3, 5, 4, ['god'], ['indestructible'], {
    grant: (s, q, p, E) => (p !== q && p.side === q.side && E.isCreature(p) ? ['trample'] : null),
    acts: [{
      cost: 3, req: ['G'], when: [1],
      play: (s, p, E) => { const t = E.readyAttackers(s).sort((a, b) => E.power(s, b) - E.power(s, a))[0]; return t ? { score: 3, run: () => { E.target(s, t); E.pump(t, 2, 2); } } : null; },
    }],
  }),
  // 第2弾の 追加（レア・レジェンド）
  cr('G38', 'スラーグ牙（きば）', 'R', 'G', 5, 5, 3, ['beast'], [], {
    etb: (s, p, E) => { if (p.side === 'P') E.gain(s, 5); },
    onLeaveSelf: (s, p, E) => E.token(s, p.side, T.beast),
  }),
  cr('G39', 'はがね葉（ば）の チャンピオン', 'R', 'G', 3, 5, 4, ['elf', 'knight'], [], { minBlockPow: 3 }),
  cr('G40', '原初（げんしょ）の 飢（う）え ガルタ', 'L', 'G', 12, 12, 12, ['dinosaur'], ['trample'], {
    costLess: (s, E) => E.totalPower(s, E.creatures(s, 'P')), costMin: 2,
  }),
];

const R2 = [
  cr('R27', 'ゴブリンの たいこたたき', 'C', 'R', 2, 2, 2, ['goblin', 'warrior'], ['battlecry']),
  cr('R28', '冥界（めいかい）の 怒（いか）り犬（いぬ）', 'C', 'R', 2, 3, 1, ['elemental', 'dog'], [], { mustAttack: true, escape: { cost: 4, req: ['R'], exile: 3, ctr: 1 } }),
  sp('R29', 'サテュロスの いたずら', 'C', 'R', 1, 'sorcery', { play: (s, E) => ({ score: 4, run: () => E.token(s, 'P', T.satyr) }), escape: { cost: 3, req: ['R'], exile: 2 } }),
  sp('R30', '稲妻（いなずま）の 斧（おの）', 'C', 'R', 1, 'instant', { discardCost: 1, play: burn(5, { creatureOnly: true }) }),
  sp('R31', 'ほのおの サイコロ', 'C', 'R', 2, 'sorcery', {
    play: (s, E) => { const b = E.burnTarget(s, 3, { mustHit: true }); return b ? { score: 4 + b.score * 0.6, run: () => diceBolt(s, E, b.t) } : null; },
  }),
  pm('R32', 'ケルドの 炎（ほのお）', 'U', 'R', 2, ['enchantment'], { sub: ['saga'], ...saga([
    { run: (s, E) => E.discard(s, [...s.P.hand]) },
    { run: (s) => { s.P.flags.refill7 = s.stats.playerTurns; } },
    { run: (s, E) => { for (const q of mine(s, E)) if (E.colorsOf(q.def).includes('R')) E.pump(q, 2, 0); } },
  ]), permScore: (s) => (s.P.hand.length <= 2 ? 16 : 0) }),
  cr('R33', 'オキシド山（さん）の 英雄（えいゆう）', 'U', 'R', 4, 4, 2, ['human', 'warrior'], ['haste', 'battlecry'], {
    onAttack: (s) => { s.smallCantBlock = s.turn; },
  }),
  cr('R34', '灰（はい）の フェニックス', 'U', 'R', 3, 2, 2, ['phoenix'], ['flying', 'haste'], {
    acts: [{ cost: 3, req: ['R'], pumpP: 2, when: [], play: () => null }],
    escape: { cost: 4, req: ['R'], exile: 3, ctr: 2 },
  }),
  cr('R35', 'アゴナスの 雄牛（おうし）', 'R', 'R', 5, 4, 2, ['ox'], [], {
    etb: (s, p, E) => { if (p.side !== 'P') return; E.discard(s, [...s.P.hand]); E.drawCard(s, 3); },
    escape: { cost: 2, req: ['R'], exile: 8, ctr: 1 },
  }),
  cr('R36', 'ラクドスの 穴（あな）の ドラゴン', 'R', 'R', 4, 3, 3, ['dragon'], ['flying'], { hellbent: true, kwFn: (s, p) => (hb(s, p) ? ['double'] : null) }),
  cr('R37', '金（きん）づかいの ドラゴン', 'L', 'R', 5, 4, 4, ['dragon'], ['flying', 'haste'], {
    richTreasure: true,
    onAttack: (s, p, E) => E.token(s, p.side, T.treasure),
    heroic: (s, p, E) => E.token(s, p.side, T.treasure),
  }),
  // 第2弾の 追加（レア・レジェンド）
  sp('R38', 'プルフォロスの 介入（かいにゅう）', 'R', 'R', 1, 'sorcery', {
    x: true,
    // てきの クリーチャーを たおせる いちばん 小さい X（2X 点）。いなければ 攻撃の 前に X/1 を 出す
    play: (s, E, ctx) => {
      for (let x = 1; x <= ctx.xMax; x++) {
        const b = E.burnTarget(s, 2 * x, { creatureOnly: true });
        if (b && b.t !== 'face') return { score: 6 + b.score, x, run: (xx) => hit(s, E, b.t, 2 * xx) };
      }
      return ctx.phase === 1 && ctx.xMax >= 2 ? { score: 3 + ctx.xMax * 2, x: ctx.xMax, run: (xx) => E.token(s, 'P', elemX(xx)) } : null;
    },
  }),
  cr('R39', '業火（ごうか）の タイタン', 'R', 'R', 6, 6, 6, ['giant'], [], {
    acts: [{ cost: 1, req: ['R'], pumpP: 1, when: [], play: () => null }],
    etb: (s, p, E, o) => {
      const list = o.chosen?.[0];
      if (list?.length) { for (const d of list) if (E.onBf(s, d.t)) E.damage(s, d.t, d.n, p); E.sba(s); return; }
      titanSplit(s, E, p);
    },
    onAttack: (s, p, E) => titanSplit(s, E, p),
  }),
  cr('R40', 'ゴブリンの 親分（おやぶん） クレンコ', 'L', 'R', 4, 3, 3, ['goblin', 'warrior'], [], {
    acts: [{
      cost: 0, tap: true, when: [1], label: 'ゴブリンを ふやす',
      play: (s, p, E) => {
        const n = s[p.side].bf.filter((q) => isSub(q, 'goblin')).length;
        return { score: 3 + n * 2, run: () => { E.token(s, p.side, T.goblin, n); E.L(s, `クレンコ：ゴブリンが ${n}体 ふえた`); } };
      },
    }],
  }),
];

const GOLD3 = [
  cr('WG03', 'ブロンズ皮（がわ）の ライオン', 'U', 'WG', 3, 3, 3, ['cat'], ['convoke'], {
    onAttack: (s, p, E) => { if (E.coven(s)) E.pump(p, 0, 0, ['indestructible']); },
  }),
  cr('WG04', '秋（あき）の 君主（くんしゅ） レイノア', 'R', 'WG', 4, 3, 5, ['human', 'noble'], [], {
    endStep: (s, p, E) => { if (!E.coven(s)) return; E.token(s, 'P', T.saproling); const t = E.bestBuffTarget(s, null); if (t) E.addCounters(s, t, 1); },
  }),
  cr('WU03', '星（ほし）を よむ スフィンクス', 'U', 'WU', 3, 3, 3, ['sphinx'], ['flying'], vanish(3, { onTimeRemoved: (s, p, E) => { if (p.side === 'P') E.bolster(s, 1); } })),
  cr('WU04', '夢（ゆめ）さらい', 'R', 'WU', 5, 3, 5, ['sphinx'], ['flying', 'lifelink'], {
    onDraw: (s, p, E) => E.pump(p, 1, 0),
    onAttack: (s, p, E) => E.drawCard(s),
  }),
  cr('RW03', 'ニクス生（う）まれの 英雄（えいゆう）', 'U', 'RW', 2, 2, 3, ['human', 'soldier'], ['battlecry'], { heroic: (s, p, E) => E.token(s, 'P', T.soldier) }),
  cr('RW04', '正義（せいぎ）の 天使（てんし） オレリア', 'R', 'RW', 4, 2, 5, ['angel'], ['flying', 'mentor'], {
    combatStart: (s, p, E) => { const t = E.bestBuffTarget(s, null, { ready: true }); if (t) { E.target(s, t); E.pump(t, 2, 0, ['vigilance', 'trample']); } },
  }),
  cr('UR03', 'からっぽの 手（て）の 嵐使（あらしつか）い', 'U', 'UR', 2, (s, p) => 2 + (hb(s, p) ? 2 : 0), 3, ['human', 'wizard'], ['prowess'], {
    hellbent: true, kwFn: (s, p) => (hb(s, p) ? ['flying'] : null),
  }),
  sp('UR04', '爆発（ばくはつ）', 'R', 'UR', 3, 'sorcery', {
    x: true,
    play: (s, E, ctx) => {
      const k = s.P.hand.filter((c) => c !== ctx.c).length === 0 ? 2 : 1;
      for (let x = 1; x <= ctx.xMax; x++) {
        const b = E.burnTarget(s, x * k, {});
        if (b && (b.t !== 'face' || x === ctx.xMax || b.score >= 100)) return { score: 4 + Math.min(b.score, 30), x, run: (xx) => hit(s, E, b.t, xx * (E.hellbent(s) ? 2 : 1)) };
      }
      return null;
    },
  }),
  cr('RG03', 'がれきの 大男（おおおとこ）', 'U', 'RG', 5, (s, p) => s[p.side].mana.length, (s, p) => s[p.side].mana.length, ['elemental'], [], {
    bloodrush: { cost: 3, req: ['R', 'G'], p: (s) => s.P.mana.length, t: (s) => s.P.mana.length },
    singleRun: (s, E, q) => { const n = s.P.mana.length; E.pump(q, n, n); },
  }),
  cr('RG04', '解（と）き放（はな）たれた ポルクラノス', 'R', 'RG', 4, 0, 0, ['hydra'], [], {
    dmgToCounters: true,
    etb: (s, p, E, o) => E.addCounters(s, p, o.escaped ? 12 : 6),
    escape: { cost: 6, req: ['R', 'G'], exile: 6 },
    acts: [{
      cost: 3, req: ['R'], when: [1, 2],
      play: (s, p, E) => { const b = E.burnTarget(s, E.power(s, p), { creatureOnly: true }); return b && E.power(s, b.t) < p.ctr ? { score: 4 + b.score, run: () => E.fight(s, p, b.t) } : null; },
    }],
  }),
  cr('GU03', 'シャークトクラブ', 'U', 'GU', 4, 4, 4, ['fish', 'crab'], [], {
    acts: [{ cost: 3, req: ['U'], adapt: 1, when: [1, 2], play: (s, p, E) => (p.ctr === 0 ? { score: 5, run: () => E.addCounters(s, p, 1) } : null) }],
    onCounters: (s, p, E) => { if (p.side !== 'P') return; const t = bestFreeze(s, E); if (t) { t.tapped = true; t.frozen = true; } },
  }),
  cr('GU04', '自然（しぜん）の 怒（いか）りの タイタン ウーロ', 'R', 'GU', 3, 6, 6, ['elder', 'giant'], [], {
    etb: (s, p, E, o) => { uroTrigger(s, p, E); if (!o.escaped) E.leave(s, p, 'gy'); },
    onAttack: (s, p, E) => uroTrigger(s, p, E),
    escape: { cost: 5, req: ['G', 'U'], exile: 5 },
  }),
];

const C2 = [
  art(cr('C11', 'しょうがパンの 人形（にんぎょう）', 'C', '', 1, 1, 1, ['food', 'golem'], ['haste'], {
    acts: [{
      cost: 1, when: [1],
      play: (s, p, E) => (!p.flags.turn.hasteOnly && E.readyAttackers(s).includes(p) && theirs(s, E).some((b) => !b.tapped && !b.def.noBlock) ? { score: 2, run: () => { p.flags.turn.hasteOnly = true; } } : null),
    }],
  })),
  pm('C12', '金（きん）の たまご', 'C', '', 1, ['artifact'], {
    sub: ['food'], permScore: () => 6,
    etb: (s, p, E) => { if (p.side === 'P') E.drawCard(s); },
    acts: [{ cost: 2, tap: true, sac: true, when: [1, 2], play: (s, p, E) => (s.P.life <= 10 ? { score: 6, run: () => { E.leave(s, p, 'gy'); E.gain(s, 3); } } : null) }],
  }),
  pm('C13', '宝（たから）の 地図（ちず）', 'U', '', 2, ['artifact'], {
    acts: [{
      cost: 1, tap: true, when: [2],
      play: (s, p, E) => ({ score: 3, run: () => {
        p.marks = (p.marks || 0) + 1;
        if (p.marks >= 3) { E.token(s, 'P', T.treasure, 3); E.leave(s, p, 'gy'); }
        return E.scry(s, 1);
      } }),
    }],
  }),
  pm('C14', 'たからばこ', 'U', '', 3, ['artifact'], {
    acts: [{ cost: 4, tap: true, sac: true, when: [1, 2], play: (s, p, E) => ({ score: 7, run: () => treasureChest(s, p, E) }) }],
  }),
  art(cr('C15', '歩（ある）く バリスタ', 'R', '', 0, 0, 0, ['construct'], [], {
    x: true, xMul: 2,
    play: (s, E, ctx) => (ctx.xMax >= 1 ? { score: 6 + ctx.xMax * 5, run: () => {} } : null),
    acts: [
      { cost: 4, when: [1, 2], label: '＋1/＋1カウンターを 1こ おく', play: (s, p, E) => (E.manaCount(s) >= 8 ? { score: 3, run: () => E.addCounters(s, p, 1) } : null) },
      {
        cost: 0, when: [1, 2], label: 'カウンターを 1こ とって 1点',
        play: (s, p, E) => { if (p.ctr <= 0) return null; const b = E.burnTarget(s, 1, {}); return b && b.score >= 3 ? { score: 2 + b.score, run: () => { p.ctr--; hit(s, E, b.t, 1); } } : null; },
      },
    ],
  })),
  art(cr('C16', 'アクロスの 巨像（きょぞう）', 'L', '', 8, 10, 10, ['golem'], ['indestructible'], {
    kwFn: (s, p) => (p.monstrous ? null : ['defender']),
    acts: [{ cost: 2, discard: 3, monstrosity: true, when: [1], label: 'かいぶつか 10', play: (s, p, E) => ({ score: 12, run: () => E.addCounters(s, p, 10) }) }],
  })),
];
// 力くらべ：集会なら ＋1/＋1カウンター、そして 格闘
const duel = (s, E, me, t) => { E.target(s, me); if (E.coven(s)) E.addCounters(s, me, 1); E.fight(s, me, t); };
// 召集の 和音：コストが X いかの クリーチャーを ライブラリーから 出す（いちばん コストが 大きい もの）
const chord = (s, E, x) => {
  const c = bestIn(s.P.lib, (c) => c.def.types.includes('creature') && !c.def.x && c.def.cost <= x);
  if (c) { s.P.lib.splice(s.P.lib.indexOf(c), 1); E.enter(s, 'P', c.def); }
  E.shuffleLib(s);
};

// ---- きほんカード（0点） ----
export const BASICS = {
  W: sp('B01', '白の きほんカード', 'B', 'W', 1, 'sorcery', { basic: true, play: (s, E) => ({ score: 1, run: () => E.gain(s, 2) }) }),
  U: sp('B02', '青の きほんカード', 'B', 'U', 1, 'instant', { basic: true, play: (s, E, ctx) => (ctx.phase === 2 ? { score: 1, run: () => E.scry(s, 1) } : null) }),
  G: sp('B03', '緑の きほんカード', 'B', 'G', 1, 'sorcery', { basic: true, play: (s, E) => ({ score: 2, run: () => E.token(s, 'P', T.saproling) }) }),
  R: sp('B04', '赤の きほんカード', 'B', 'R', 1, 'instant', { basic: true, play: (s, E) => { const b = E.burnTarget(s, 1, { creatureOnly: true }); return b ? { score: 2 + b.score, run: () => hit(s, E, b.t, 1) } : null; } }),
  C: sp('B05', '無色（むしょく）の きほんカード', 'B', '', 2, 'sorcery', { basic: true, play: (s, E) => ({ score: 2, run: () => E.drawCard(s) }) }),
};

// ---- 第3弾から あと：土台（skel.js）に うごき（set3.js など）を かさねる ----
// kw は 足す（kwSet が あれば おきかえ）。探査は 色の ぶんは はらう
function build(id, b = {}) {
  const k = SKEL[id];
  const d = { ...k, ...b, kw: b.kwSet ?? [...new Set([...(k.kw || []), ...(b.kw || [])])] };
  delete d.kwSet;
  if (d.delve && d.costMin == null) d.costMin = [...d.color].length;
  if ([...d.color].length >= 3) d.req2 = true; // 3色の カードは、3色の うち 2つの マナが いる
  return d;
}
const BEH = { ...S3, ...S4, ...S5, ...S6, ...SY, ...SPW, ...S9 };
const setOf = (n) => SET_IDS[n].map((id) => build(id, BEH[id]));
BASICS.K = build('B06', B06);

// ライブラリーから きほんカードを さがして マナゾーンに（豊かな成長・耕作・カラメトラ・空身像。2026-10-24 に「一番上を」から かえた）
let api_ramp = () => 0;
const hasBasic = (s) => s.P.lib.some((c) => c.def.basic);
export function bindEngine(E) {
  api_ramp = (s, n = 1) => E.rampBasic(s, n);
  const solemn = ALL.find((d) => d.id === 'C09');
  solemn.etb = (s) => E.rampBasic(s, 1);
}

export const SET1 = [...W, ...U, ...U2, ...G, ...R, ...GOLD1, ...GOLD2, ...C];
export const SET2 = [...W2, ...U3, ...G2, ...R2, ...GOLD3, ...C2];
export const SET3 = setOf(3);
export const SET4 = setOf(4);
export const SET5 = setOf(5);
export const SET6 = setOf(6);
export const SET7 = setOf(7);
export const SET8 = setOf(8);
export const SET9 = setOf(9);
LESSONS.push(...SET5.filter((d) => isSub({ def: d }, 'lesson')));
// 弾（だん）：開発モードの せってい画面で、パックに 入れる 弾を えらぶ。released が ない 弾は 開発中（開発モードで えらんだ ときだけ パックに 入る）
export const SETS = [
  { id: 1, name: '第1弾（だん）', cards: SET1, released: true },
  { id: 2, name: '第2弾（だん）「英雄譚（えいゆうたん）の 時代（じだい）」', cards: SET2, released: true },
  { id: 3, name: '第3弾（だん）「冥界（めいかい）の 門（もん）」', cards: SET3 },
  { id: 4, name: '第4弾（だん）「星（ほし）めぐりの 夜（よる）」', cards: SET4 },
  { id: 5, name: '第5弾（だん）「大きな 数の 塔（とう）」', cards: SET5 },
  { id: 6, name: '第6弾（だん）「三つの 旗（はた）」', cards: SET6 },
  { id: 7, name: 'アルケミー（デジタル 限定（げんてい））', cards: SET7 },
  { id: 8, name: 'プレインズウォーカー', cards: SET8 },
  { id: 9, name: '第7弾（だん）「ラヴニカ：ギルドの 都（みやこ）」', cards: SET9 },
];
// ALL：出ている 弾（ふつうの パック）。ALL_DEV：開発中の 弾も ふくめた ぜんぶ（パックに 入らない レッスンなどは のぞく）
export const ALL = SETS.filter((x) => x.released).flatMap((x) => x.cards);
export const ALL_DEV = SETS.flatMap((x) => x.cards).filter((d) => !d.noPack);
export const BY_ID = Object.fromEntries([...SETS.flatMap((x) => x.cards), ...Object.values(BASICS)].map((d) => [d.id, d]));
export const SET_OF = Object.fromEntries(SETS.flatMap((x) => x.cards.map((d) => [d.id, x.id])));
REG.byId = BY_ID; REG.all = ALL_DEV;

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
  R16: { tgt: [{ side: 'E', face: true, label: 'X点を あたえる 相手（どうもうなら ＋2）' }], apply: (s, E, [[t]], x) => hit(s, E, t, x + (ferocious(s, E) ? 2 : 0)) },
  R19: { tgt: [{ side: 'E', label: '3点（カウンターが あれば 5点）を あたえる クリーチャー' }], apply: (s, E, [[t]]) => hit(s, E, t, t.ctr > 0 ? 5 : 3) },
  R22: { tgt: [{ side: 'E', filter: (s, E, p) => !E.hasKw(s, p, 'flying'), label: '5点を あたえる ひこうのない クリーチャー' }], apply: (s, E, [[t]]) => hit(s, E, t, 5) },
  // モードを 1つ えらぶ（ui/battle.js の chooseMode）。tgt の side 'mine' は 自分の クリーチャー（攻撃中なら 攻撃している もの）
  RW01: {
    escalate: 2,
    modes: [
      { label: 'てきに 4点の ダメージ', tgt: [{ side: 'E', face: true, label: '4点を あたえる 相手' }], apply: (s, E, [[t]]) => hit(s, E, t, 4) },
      { label: '自分の パーマネントは ターンの おわりまで はかいふのう', apply: (s, E) => { for (const p of s.P.bf) E.pump(p, 0, 0, ['indestructible']); } },
      { label: 'クリーチャー1体に 二だんこうげき', tgt: [{ side: 'mine', label: '二だんこうげきを あたえる クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.pump(t, 0, 0, ['double']); } },
    ],
  },
  U05: { tgt: [{ side: 'E', label: 'てふだに もどす（てきは やまふだの 上へ）クリーチャー' }], apply: (s, E, [[t]]) => { E.bounce(s, t); E.drawCard(s); E.sba(s); } },
  U03: { tgt: [{ side: 'E', max: 9, label: 'タップして 止める クリーチャー' }], apply: (s, E, [ts]) => { for (const t of ts) { t.tapped = true; t.frozen = true; } } },
  U13: {
    modes: [
      { label: 'カードを 1まい 引く', apply: (s, E) => E.drawCard(s) },
      { label: 'てきの クリーチャー1体を タップ（つぎの ターン 起きない）', tgt: [{ side: 'E', label: 'タップして 止める クリーチャー' }], apply: (s, E, [[t]]) => { if (E.onBf(s, t)) { t.tapped = true; t.frozen = true; } } },
      { label: 'クリーチャー1体を てふだに もどす（てきは やまふだの 上へ）', tgt: [{ side: 'any', label: 'もどす クリーチャー' }], apply: (s, E, [[t]]) => { if (E.onBf(s, t)) E.bounce(s, t); E.sba(s); } },
    ],
  },
  G08: {
    tgt: [{ side: 'P', label: 'たたかう 自分の クリーチャー' }, { side: 'E', label: 'たたかう 相手' }],
    apply: (s, E, [[me], [t]]) => savagePunch(s, E, me, t),
  },
  G19: {
    tgt: [{ side: 'P', label: '＋1/＋1カウンターを おいて たたかう クリーチャー' }, { side: 'E', label: 'たたかう 相手' }],
    apply: (s, E, [[me], [t]]) => { E.target(s, me); E.addCounters(s, me, 1); E.fight(s, me, t); },
  },
  G14: { tgt: [{ side: 'P', label: '＋1/＋1カウンターを 2こ おく クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.addCounters(s, t, 2); t.tapped = false; } },
  W12: { tgt: [{ side: 'P', max: 9, label: '＋1/＋1カウンターを おく クリーチャー' }], apply: (s, E, [ts]) => { for (const t of ts) { E.target(s, t); E.addCounters(s, t, 1); } } },
  W15: { tgt: [{ side: 'P', max: 9, label: '＋2/＋2 と ひこうを あたえる クリーチャー' }], apply: (s, E, [ts]) => { for (const t of ts) { E.target(s, t); E.pump(t, 2, 2, ['flying']); } } },
  R24: { tgt: [{ side: 'P', label: 'パワーを 2倍に する クリーチャー' }], apply: (s, E, [[t]], x) => { E.target(s, t); const p0 = E.power(s, t); E.pump(t, p0 * (2 ** Math.min(x, 4) - 1), 0); } },
  W22: { tgt: [{ side: 'E', label: '追放する クリーチャー' }] },
  W07: { tgt: [{ side: 'E', perm: true, filter: (s, E, p) => !p.def.factory, label: '追放する てきの カード' }] },
  G03: { tgt: [{ side: 'P', min: 0, label: '＋1/＋1カウンターを おく クリーチャー' }] },
  U25: { tgt: [{ side: 'any', filter: (s, E, p) => !p.def.noCopy, label: 'コピーする クリーチャー' }] },
  W05: { tgt: [{ side: 'atk', label: '追放する こうげき中の クリーチャー' }], apply: (s, E, [[t]]) => { E.exile(s, t); E.bolster(s, 1); } },
  W13: { tgt: [{ side: 'atk', max: 9, divide: 4, label: '4点を わりふる こうげき中の クリーチャー' }], apply: (s, E, [al]) => arrowRain(s, E, al) },
  // 第2弾
  W31: { tgt: [{ side: 'atk', label: '4点を あたえる こうげき中の クリーチャー' }], apply: (s, E, [[t]]) => divineArrow(s, E, t) },
  G27: { tgt: [{ side: 'P', label: 'たたかう 自分の クリーチャー' }, { side: 'E', label: 'たたかう 相手' }], apply: (s, E, [[me], [t]]) => duel(s, E, me, t) },
  G30: { tgt: [{ side: 'P', label: 'ダメージを あたえる 自分の クリーチャー' }, { side: 'E', label: 'ダメージを うける てきの クリーチャー' }], apply: (s, E, [[me], [t]]) => ramThrough(s, E, me, t) },
  G34: { tgt: [{ side: 'P', min: 0, max: 2, divide: 2, label: 'しゅうかいなら ＋1/＋1カウンター 2こを わりふる クリーチャー' }] },
  G36: { tgt: [{ side: 'E', min: 0, label: 'かくとうする てき（えらばなければ カウンターが 2ばい）' }] },
  R30: { tgt: [{ side: 'E', label: '5点を あたえる クリーチャー' }], apply: (s, E, [[t]]) => hit(s, E, t, 5) },
  R31: { tgt: [{ side: 'E', face: true, label: 'サイコロの 目の 点を あたえる 相手' }], apply: (s, E, [[t]]) => diceBolt(s, E, t) },
  UR04: { tgt: [{ side: 'E', face: true, label: 'X点（ぼうゆうなら 2ばい）を あたえる 相手' }], apply: (s, E, [[t]], x) => hit(s, E, t, x * (E.hellbent(s) ? 2 : 1)) },
  U39: { tgt: [{ side: 'E', min: 0, filter: (s, E, p) => E.power(s, p) <= 4, label: 'てふだに もどす パワー4いかの てきの クリーチャー（てきは やまふだの 上へ）' }] },
  R38: {
    modes: [
      { label: 'X/1 の エレメンタル（トランプル・そっこう）を 出す', apply: (s, E, picks, x) => E.token(s, 'P', elemX(x)) },
      { label: 'クリーチャー1体に X の 2ばいの ダメージ', tgt: [{ side: 'E', label: 'X の 2ばいの ダメージを あたえる クリーチャー' }], apply: (s, E, [[t]], x) => hit(s, E, t, 2 * x) },
    ],
  },
  R39: { tgt: [{ side: 'E', max: 3, divide: 3, label: '3点を わりふる てきの クリーチャー' }] },
};
// 起動型能力
const ACT_TARGETS = {
  U14: { tgt: [{ side: 'E', face: true, label: '1点を あたえる 相手' }], apply: (s, E, [[t]]) => hit(s, E, t, 1) },
  U08: { tgt: [{ side: 'P', label: 'このターン ブロックされない クリーチャー' }], apply: (s, E, [[t]]) => { t.flags.turn.unblockable = true; } },
  W16: { tgt: [{ side: 'P', max: 2, divide: 2, label: '＋1/＋1カウンター 2こを わりふる クリーチャー' }], apply: (s, E, [al]) => { for (const d of al) { E.target(s, d.t); E.addCounters(s, d.t, d.n); } } },
  WU02: { tgt: [{ side: 'P', max: 3, divide: 3, filter: (s, E, p) => E.hasKw(s, p, 'flying'), label: '＋1/＋1カウンター 3こを わりふる ひこうクリーチャー' }], apply: (s, E, [al]) => { for (const d of al) { E.target(s, d.t); E.addCounters(s, d.t, d.n); } } },
  G17: { tgt: [{ side: 'E', max: 9, divide: 'x', label: 'X点を わりふる てきの クリーチャー' }], apply: (s, E, [al], x, p) => { E.addCounters(s, p, x); for (const d of al) E.damage(s, d.t, d.n, null); E.sba(s); } },
  G37: { tgt: [{ side: 'P', label: '＋2/＋2 する クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.pump(t, 2, 2); } },
  RG04: { tgt: [{ side: 'E', label: 'かくとうする てき' }], apply: (s, E, [[t]], x, p) => E.fight(s, p, t) },
};
for (const [id, h] of Object.entries(TARGETS)) Object.assign(BY_ID[id], h);
for (const [id, h] of Object.entries(ACT_TARGETS)) Object.assign(BY_ID[id].acts[0], h);
// 歩く バリスタ：2つめの のうりょく（カウンターを とって 1点）
Object.assign(BY_ID.C15.acts[1], { tgt: [{ side: 'E', face: true, label: '1点を あたえる 相手' }], apply: (s, E, [[t]], x, p) => { p.ctr--; hit(s, E, t, 1); } });

// ---- もんしょう（REQUIREMENTS 12章・data/emblems.js） ----
// たいようの ゆびわ：はじまりの もんしょうで はじめの てふだに 入る（パックには 入らない）
export const SUN_RING = pm('MS01', '太陽（たいよう）の 指輪（ゆびわ）', 'R', '', 1, ['artifact'], {
  mana: ['C'], manaN: 2, noPack: true, permScore: () => 40,
  typeOver: 'アーティファクト', textOver: 'タップ：無色（むしょく）のマナを2つ出す。（もんしょうの カード）',
});
BY_ID.MS01 = SUN_RING;
// きほんの もんしょう：きほんカードが k だけ 強く なる（白 ライフ・青 占術・緑 苗木・赤 ダメージ・黒 −N/−N・無色 コストと 引く 数）
const sapling = (k) => ({ ...T.saproling, pow: k >= 2 ? 2 : 1, tou: 2 });
const mark = (k) => `（もんしょう ＋${k}）`;
export function boostBasic(d, k) {
  if (!k || !d.basic) return d;
  const n = { ...d, boost: k };
  if (d.id === 'B01') Object.assign(n, { play: (s, E) => ({ score: 1, run: () => E.gain(s, 2 + k) }), textOver: `あなたは${2 + k}点のライフを得（え）る。${mark(k)}` });
  if (d.id === 'B02') Object.assign(n, { play: (s, E, ctx) => (ctx.phase === 2 ? { score: 1, run: () => E.scry(s, 1 + k) } : null), textOver: `占術（せんじゅつ）${1 + k} を行う。${mark(k)}` });
  if (d.id === 'B03') {
    const t = sapling(k);
    Object.assign(n, { play: (s, E) => ({ score: 2, run: () => E.token(s, 'P', t) }), textOver: `緑の ${t.pow}/${t.tou} の苗木（なえぎ）・クリーチャー・トークンを1体出す。${mark(k)}` });
  }
  if (d.id === 'B04') {
    Object.assign(n, {
      play: (s, E) => { const b = E.burnTarget(s, 1 + k, { creatureOnly: true }); return b ? { score: 2 + b.score, run: () => hit(s, E, b.t, 1 + k) } : null; },
      tgt: [{ side: 'E', label: `${1 + k}点を あたえる クリーチャー` }], apply: (s, E, [[t]]) => hit(s, E, t, 1 + k),
      textOver: `クリーチャー1体を対象（たいしょう）とする。それに${1 + k}点のダメージを与（あた）える。${mark(k)}`,
    });
  }
  if (d.id === 'B05') Object.assign(n, { cost: 1, play: (s, E) => ({ score: 2, run: () => E.drawCard(s, k >= 2 ? 2 : 1) }), textOver: `カードを${k >= 2 ? 2 : 1}枚（まい）引く。${mark(k)}` });
  if (d.id === 'B06') {
    Object.assign(n, foe1(`−${1 + k}/−${1 + k} する クリーチャー`, (s, E, t) => shrink(s, E, t, 1 + k), { n: 1 + k, score: 1 }), {
      textOver: `クリーチャー1体を対象（たいしょう）とする。それはターン終了（しゅうりょう）時まで −${1 + k}/−${1 + k} の修整（しゅうせい）を受ける。${mark(k)}`,
    });
  }
  return n;
}
