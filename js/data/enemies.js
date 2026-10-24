// 塔の敵（チャレンジ・デッキ）と各階のルール。文章は docs/ENEMIES.md
import { shuffle } from '../engine/rng.js';

const ecr = (name, pow, tou, sub, kw = [], x = {}) => ({ name, types: ['creature'], pow, tou, sub, kw, color: '', cost: 0, ...x });
const esp = (name, effect, x = {}) => ({ name, types: ['sorcery'], effect, color: '', cost: 0, danger: 2, ...x });
const eart = (name, x = {}) => ({ name, types: ['artifact'], color: '', cost: 0, ...x });

const pc = (s, E) => E.creatures(s, 'P');
const biggest = (s, E, f = () => true) => pc(s, E).filter(f).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
const weakest = (s, E) => pc(s, E).sort((a, b) => E.pt(s, a)[1] - E.pt(s, b)[1])[0];
const DIFF = (s, easy, normal, hard) => ({ easy, normal, hard })[s.diff];
const build = (list) => list.flatMap(([n, d]) => Array.from({ length: n }, () => d));
const toLib = (s, E, defs) => shuffle(s.rng, defs.map((d) => E.card(d)));
const attackers = (s, E, f) => s.E.bf.filter((p) => E.isCreature(p) && !p.tapped && (!p.sick || E.hasKw(s, p, 'haste')) && f(p));
const sumPow = (s, E, list) => list.reduce((t, p) => t + Math.max(0, E.power(s, p)), 0);

// ===== 1階：ハイドラとの対峙 =====
const HEAD = ecr('ハイドラの頭', 0, 2, ['head'], [], { head: true, headDmg: 1, noBlock: true, reward: (s, p, E) => E.gain(s, 2) });
const HYDRA_DECK = [
  [5, HEAD],
  [1, ecr('貪欲（どんよく）で粗暴（そぼう）な頭', 0, 4, ['head'], [], { head: true, headDmg: 2, noBlock: true, reward: (s, p, E) => E.drawCard(s) })],
  [1, ecr('野蛮（やばん）で活力（かつりょく）ある頭', 0, 3, ['head'], [], { head: true, headDmg: 2, noBlock: true, anthem: (s, q, p) => (p !== q && p.def.head ? [0, 1] : null), reward: (s, p, E) => E.gain(s, 3) })],
  [1, ecr('噛（か）み付（つ）く牙（きば）の頭', 0, 3, ['head'], [], { head: true, headDmg: 2, fang: true, noBlock: true, reward: (s, p, E) => E.drawCard(s) })],
  [1, ecr('金切（かなき）り声（ごえ）の巨大（きょだい）な頭', 0, 5, ['head'], [], { head: true, headDmg: 2, taunt: true, noBlock: true, reward: (s, p, E) => { E.gain(s, 3); E.drawCard(s); } })],
  [2, esp('一斉（いっせい）突進（とっしん）', (s) => { s.E.flags.turn.extra = (s.E.flags.turn.extra || 0) + 1; }, { danger: 3 })],
  [2, esp('有毒（ゆうどく）なハイドラの息（いき）', (s, E) => { for (const p of pc(s, E)) E.damage(s, p, 1, null); E.sba(s); }, { danger: 3 })],
  [2, esp('混乱（こんらん）する睨（にら）み', (s, E) => { const t = biggest(s, E); if (t) t.tapped = true; })],
  [2, esp('付（つ）け根（ね）から新生（しんせい）', (s, E) => { const i = s.E.gy.findIndex((c) => c.def.head); if (i >= 0) { const [c] = s.E.gy.splice(i, 1); E.enter(s, 'E', c.def); } }, { danger: 4 })],
  [1, esp('貫通不能（かんつうふのう）なハイドラの皮（かわ）', (s, E) => { for (const p of s.E.bf) if (p.def.head) p.flags.indTurns = 2; }, { danger: 3 })],
  [1, esp('英雄（えいゆう）への かみつき', (s, E) => { const t = biggest(s, E, (p) => p.tapped); if (t) E.destroy(s, t); E.sba(s); }, { danger: 4 })],
  [1, esp('頭二つの はさみうち', (s, E) => { const t = weakest(s, E); if (t) E.damage(s, t, 3, null); E.sba(s); }, { danger: 3 })],
  [1, esp('絡（から）みつく首（くび）', (s, E) => { const t = biggest(s, E); if (t) { t.tapped = true; t.frozen = true; } })],
  [3, esp('ハイドラ陽動（ようどう）作戦（さくせん）', (s) => { s.E.flags.turn.noDmg = true; }, { danger: 0 })],
  [1, esp('弱点（じゃくてん）への一撃（いちげき）', (s, E) => { const b = E.burnTarget(s, 3, { creatureOnly: true, mustHit: true }); if (b) E.damage(s, b.t, 3, null); E.sba(s); }, { danger: 0 })],
];

// 頭の階（1階・5階の段階1）で共通の部品
const headsFloor = {
  async headTurn(s, E, dmgBonus = 0) {
    if (s.over) return;
    const ds = [];
    for (const p of s.E.bf) if (p.def.head && !p.tapped) {
      ds.push(p.def.headDmg + dmgBonus + (s.E.flags.turn.extra || 0));
      if (p.def.fang) { const t = biggest(s, E); if (t) E.damage(s, t, 1, null); }
    }
    const total = s.E.flags.turn.noDmg ? 0 : ds.reduce((t, x) => t + x, 0);
    E.hurt(s, total);
    E.sba(s);
  },
  regrow(s, E, n) {
    for (let i = 0; i < n; i++) {
      const c = s.E.lib.shift(); if (!c) return;
      if (c.def.head) E.enter(s, 'E', c.def); else s.E.gy.push(c);
    }
  },
  priority(s, p) { return p.def.head ? p.def.headDmg * 3 + (p.def.taunt ? 2 : 0) + 1 : 1; },
  assign(s, atkers, E) {
    const heads = s.E.bf.filter((p) => p.def.head);
    const taunt = heads.filter((p) => p.def.taunt);
    const list = taunt.length ? taunt : heads;
    return E.assignKill(s, atkers, E.killTargets(s, list), null);
  },
};
const headIndestructible = (s, p) => (p.flags.indTurns > 0 ? ['indestructible'] : null);

export function hydra() {
  return {
    id: 'hydra', name: '1階 ハイドラ',
    goal: () => 'ハイドラの 頭を ぜんぶ たおす。頭が たおれると、新しい 頭が 出てくる ことが ある。',
    setup(s, E) {
      const n = DIFF(s, 2, 2, 3);
      const defs = build(HYDRA_DECK);
      for (let i = 0; i < n; i++) { defs.splice(defs.indexOf(HEAD), 1); E.enter(s, 'E', HEAD); }
      for (const p of s.E.bf) p.sick = false;
      s.E.lib = toLib(s, E, defs);
    },
    async enemyTurn(s, E) {
      for (const p of s.E.bf) if (p.flags.indTurns) p.flags.indTurns--;
      await E.reveal(s, 1);
      await headsFloor.headTurn(s, E);
    },
    onEnter(s, p) { if (p.def.head) p.def = { ...p.def, kwFn: headIndestructible }; },
    onLeave(s, p, E) { if (p.def.head) headsFloor.regrow(s, E, DIFF(s, 1, 1, 2)); },
    check(s, E, when) { if (when === 'end' && !s.E.bf.some((p) => p.def.head)) s.over = 'win'; },
    priority: headsFloor.priority,
    assign: headsFloor.assign,
    threat(s) { return { damage: s.E.bf.filter((p) => p.def.head).reduce((t, p) => t + p.def.headDmg, 0), attackers: 0 }; },
    anyTarget(s) { return s.E.bf.find((p) => p.def.head) || null; },
    castThreat(s, d) { return d.head ? 5 + d.headDmg : d.danger; },
  };
}

// ===== 2階：大群との戦い =====
const mino = (name, pow, tou, x = {}) => ecr(name, pow, tou, ['minotaur'], ['haste'], { attacks: true, ...x });
const minos = (s) => s.E.bf.filter((p) => (p.def.sub || []).includes('minotaur'));
const HORDE_DECK = [
  [6, mino('ミノタウルスの 若角（わかづの）', 2, 1)],
  [3, mino('ミノタウルスの 獲物（えもの）探（さが）し', 3, 2)],
  [3, mino('フォベロスの 暴（あば）れ者（もの）', 2, 3, { onAttackE: (s, p, E) => E.pump(p, 1, 0) })],
  [2, mino('モーギスに 選（えら）ばれし者（もの）', 5, 4)],
  [1, mino('無謀（むぼう）なミノタウルス', 4, 3, { reckless: true })],
  [1, esp('有角神（ゆうかくしん）の接触（せっしょく）', (s) => { s.E.flags.turn.deathtouch = true; }, { danger: 3 })],
  [1, esp('抑（おさ）え難（がた）い憤怒（ふんぬ）', (s, E) => { for (const p of minos(s)) E.pump(p, 1, 0); }, { danger: 3 })],
  [1, esp('獲物（えもの）への襲撃（しゅうげき）', (s, E) => { for (const p of minos(s)) E.pump(p, 0, 0, ['first']); }, { danger: 3 })],
  [1, esp('破壊的（はかいてき）な激怒（げきど）', (s, E) => { const t = minos(s).sort((a, b) => E.power(s, b) - E.power(s, a))[0]; if (t) E.pump(t, 3, 0, ['trample']); }, { danger: 4 })],
  [1, esp('ケラノスの介入（かいにゅう）', (s, E) => { for (const p of [...pc(s, E), ...E.creatures(s, 'E')]) E.damage(s, p, 3, null); E.sba(s); }, { danger: 4 })],
  [1, eart('モーギスの 祭壇（さいだん）', { altar: true, prio: 8, reward: (s, p, E) => { for (const m of minos(s).slice(0, 2)) E.leave(s, m, 'gy'); } })],
  [1, eart('戦（いくさ）のトーテム像（ぞう）', { totem: true, prio: 4, reward: (s, p, E) => E.gain(s, 3) })],
  [1, eart('略奪（りゃくだつ）された像（ぞう）', { prio: 4, reward: (s, p, E) => E.drawCard(s) })],
  [1, eart('清々（すがすが）しい霊薬（れいやく）', { prio: 5, reward: (s, p, E) => E.gain(s, 5) })],
];

export function horde() {
  return {
    id: 'horde', name: '2階 たいぐん', faceUnit: 1,
    goal: () => 'たいぐんの やまふだを 0まいに して、ミノタウルスも ぜんぶ たおす。こうげきの ダメージ 1点で、やまふだが 1まい へる。',
    setup(s, E) {
      s.E.lib = toLib(s, E, build(HORDE_DECK));
      s.E.extraTurns = DIFF(s, 2, 1, 1);
    },
    async enemyTurn(s, E) {
      for (const p of s.E.bf) if (p.def.totem) { const t = weakest(s, E); if (t) { E.damage(s, t, 1, null); E.sba(s); } }
      s.E.flags.hordeTurn = (s.E.flags.hordeTurn || 0) + 1;
      const n = DIFF(s, 1, 1, 1 + (s.E.flags.hordeTurn % 2)) + s.E.bf.filter((p) => p.def.altar).length; // むずかしい：1枚と2枚を交互に
      await E.reveal(s, n);
      if (s.over) return;
      const atk = attackers(s, E, (p) => p.def.attacks);
      if (s.E.flags.turn.deathtouch) for (const p of atk) E.pump(p, 0, 0, ['deathtouch']);
      for (const p of atk) p.def.onAttackE?.(s, p, E);
      await E.enemyAttack(s, atk);
    },
    face(s, n, E) {
      for (let i = 0; i < n && s.E.lib.length; i++) {
        const c = s.E.lib.shift(); s.E.gy.push(c);
        if (c.def.reward && c.def.types.includes('artifact')) c.def.reward(s, null, E);
      }
      E.sba(s);
    },
    faceValue: (s, n) => (s.E.lib.length ? Math.min(n, s.E.lib.length) * 1.5 : 0),
    endTurn(s, E) { for (const p of [...s.E.bf]) if (p.def.reckless) E.leave(s, p, 'gy', { died: true }); },
    check(s, E) { if (!s.E.lib.length && !E.creatures(s, 'E').length) s.over = 'win'; },
    priority(s, p, E) { return p.def.prio ?? (E.power(s, p) * 2 + 1); },
    assign(s, atkers, E) {
      const arts = s.E.bf.filter((p) => p.def.types.includes('artifact')).sort((a, b) => b.def.prio - a.def.prio);
      const tg = arts.map((p) => ({ t: p, need: 1, v: p.def.prio }));
      const rest = s.E.lib.length ? 'face' : null;
      return E.assignKill(s, atkers, tg, rest);
    },
    threat(s, E) {
      const a = E.creatures(s, 'E');
      return { damage: sumPow(s, E, a) + DIFF(s, 2, 2, 5), attackers: a.length + DIFF(s, 1, 1, 2) };
    },
    anyTarget(s) { return s.E.lib.length ? 'face' : (s.E.bf.find((p) => p.def.types.includes('artifact')) || null); },
    castThreat(s, d) { return d.types.includes('creature') ? d.pow + 1 : (d.danger ?? 2); },
  };
}

// ===== 3階A：ゴーレムの工場 =====
const GOLEM = ecr('ゴーレム', 1, 1, ['golem'], [], { attacks: true, golem: 1, types: ['artifact', 'creature'], reward: (s) => { s.E.key = Math.max(2, s.E.key - 1); } });
const GOLEM2 = { ...GOLEM, pow: 2, tou: 2 }; // むずかしい の 工場の ゴーレム
const golemOf = (s) => (s.diff === 'hard' ? GOLEM2 : GOLEM);
const golem = (name, pow, tou, x = {}) => ({ ...ecr(name, pow, tou, ['golem'], [], { attacks: true, ...x }), types: ['artifact', 'creature'] });
const FACTORY = eart('ゴーレム工場', { factory: true });
const FACTORY_DECK = [
  [5, golem('鉄の ゴーレム', 3, 3, { reward: (s) => { s.E.key = Math.max(2, s.E.key - 1); } })],
  [1, golem('大ゴーレム', 5, 5, { reward: (s) => { s.E.key = Math.max(2, s.E.key - 2); } })],
  [1, golem('歯車の 番人', 0, 5, { attacks: false, guard: true, reward: (s, p, E) => E.gain(s, 2) })],
  [1, esp('修理（しゅうり）の 火花（ひばな）', (s) => { s.E.key = Math.min(9, s.E.key + 1); })],
  [2, esp('鍵（かぎ）の かけかえ', (s) => { s.E.key = 3 + 1 + Math.floor(s.rng() * 6); })],
  [2, esp('増産（ぞうさん）', (s, E) => E.token(s, 'E', golemOf(s)))],
  [1, esp('ゴーレムの 突撃（とつげき）', (s) => { s.E.flags.turn.golemPump = 1; })],
  [2, esp('稼働（かどう）停止（ていし）', (s) => { s.E.flags.turn.halt = true; }, { danger: 0 })],
  [1, esp('点検（てんけん）', (s) => { s.E.flags.inspect = true; }, { danger: 0 })],
];

export function factory() {
  const exact = (s, n) => n === s.E.key;
  return {
    id: 'factory', name: '3階 ゴーレム工場',
    goal: (s) => `ゴーレム工場に、かぎの 数（いまは ${s.E.key}）と ちょうど 同じ ダメージを 1回で あたえて こわす。`,
    setup(s, E) {
      E.enter(s, 'E', FACTORY);
      s.E.key = DIFF(s, 5, 6, 8);
      s.E.lib = toLib(s, E, build(FACTORY_DECK));
    },
    async enemyTurn(s, E) {
      if (s.E.flags.inspect) s.E.flags.inspect = false;
      else if (s.E.bf.filter((p) => p.def.golem).length < DIFF(s, 2, 3, 3)) E.token(s, 'E', golemOf(s));
      await E.reveal(s, 1);
      if (s.over || s.E.flags.turn.halt) return;
      const atk = attackers(s, E, (p) => p.def.attacks);
      if (s.E.flags.turn.golemPump) for (const p of atk) E.pump(p, 1, 0);
      await E.enemyAttack(s, atk);
    },
    cantLeave: (s, p) => p.def.factory && !s.E.flags.broken,
    onDamaged(s, p, n) {
      if (!p.def.factory) return;
      if (s.combat) s.combat.factory += n;
      else if (exact(s, n)) { s.E.flags.broken = true; s.over = 'win'; }
    },
    afterCombat(s, E) {
      if (!s.combat.factory) return;
      E.L(s, `工場に ${s.combat.factory}点（かぎ ${s.combat.key}）`);
      if (s.combat.factory === s.combat.key) { s.E.flags.broken = true; s.over = 'win'; }
    },
    face(s, n) { if (exact(s, n)) { s.E.flags.broken = true; s.over = 'win'; } },
    faceValue: (s, n) => (exact(s, n) ? 100 : 0),
    priority(s, p, E) { return p.def.guard ? 9 : E.power(s, p) * 2 + 2; },
    assign(s, atkers, E) {
      const fac = s.E.bf.find((p) => p.def.factory);
      const kill = E.killTargets(s, E.creatures(s, 'E'));
      if (!fac || s.E.bf.some((p) => p.def.guard)) return E.assignKill(s, atkers, kill, null);
      const n = Math.min(atkers.length, 12);
      for (let mask = 1; mask < (1 << n); mask++) {
        const toF = atkers.filter((_, i) => (mask >> i) & 1);
        if (sumPow(s, E, toF) !== s.E.key) continue;
        const rest = atkers.filter((p) => !toF.includes(p));
        const plan = [...toF.map((p) => ({ p, t: fac })), ...E.assignKill(s, rest, kill, null)];
        const bl = E.enemyBlocks(s, plan);
        if (sumPow(s, E, toF.filter((p) => !bl.has(p.uid))) === s.E.key) return plan;
      }
      return E.assignKill(s, atkers, kill, null);
    },
    threat(s, E) { const a = E.creatures(s, 'E').filter((p) => p.def.attacks); return { damage: sumPow(s, E, a) + 2, attackers: a.length + 1 }; },
    anyTarget(s) { return s.E.bf.find((p) => p.def.golem || p.def.guard) || null; },
    castThreat(s, d) { return d.types.includes('creature') ? d.pow + 1 + (d.guard ? 4 : 0) : d.danger ?? 2; },
  };
}

// ===== 3階B：ふえるスライム =====
const slimeDefs = {};
const slimeDef = (P, T = P) => (slimeDefs[`${P}/${T}`] ||= ecr(`スライム ${P}/${T}`, P, T, ['ooze'], [], {
  slime: true, attacks: true,
  onDie: (s, p, E) => {
    const [a, b] = E.pt(s, p);
    if (a >= 2) E.token(s, 'E', slimeDef(Math.floor(a / 2), Math.max(1, Math.floor(b / 2))), 2);
    else E.gain(s, 1);
  },
}));
const SLIME_DECK = [
  [2, slimeDef(2)],
  [1, esp('スライムの 合体', (s, E) => {
    const sl = s.E.bf.filter((p) => p.def.slime).sort((a, b) => E.power(s, a) - E.power(s, b));
    if (sl.length < 2) return;
    const [a, b] = sl; const [ap, at] = E.pt(s, a); const [bp, bt] = E.pt(s, b);
    E.exile(s, a); E.exile(s, b); E.token(s, 'E', slimeDef(ap + bp, at + bt));
  }, { danger: 3 })],
  [3, esp('ねばねばの 床（ゆか）', (s, E) => { const t = biggest(s, E); if (t) t.tapped = true; })],
  [1, esp('酸（さん）の しぶき', (s, E) => { for (const p of pc(s, E)) E.damage(s, p, 1, null); E.sba(s); }, { danger: 3 })],
  [3, esp('日照（ひで）り', (s, E) => { for (const p of s.E.bf.filter((q) => q.def.slime)) E.damage(s, p, 1, null); E.sba(s); }, { danger: 0 })],
];

export function slime() {
  return {
    id: 'slime', name: '3階 ふえるスライム',
    goal: () => 'スライムを ぜんぶ たおす。スライムは たおれると、半分の 大きさの 2体に わかれる。',
    setup(s, E) {
      const n = DIFF(s, 4, 6, 7);
      E.enter(s, 'E', slimeDef(n)); // 最初のターンは攻撃しない
      s.E.lib = toLib(s, E, build(SLIME_DECK));
    },
    async enemyTurn(s, E) {
      await E.reveal(s, 1);
      if (s.over || !s.E.flags.started) { s.E.flags.started = true; return; } // 最初のターンは攻撃しない
      await E.enemyAttack(s, attackers(s, E, (p) => p.def.attacks));
    },
    check(s, E, when) { if (when === 'end' && !s.E.bf.some((p) => p.def.slime)) s.over = 'win'; },
    priority(s, p, E) { return Math.max(1, 12 - E.power(s, p) * 2); },
    assign(s, atkers, E) { return E.assignKill(s, atkers, E.killTargets(s, E.creatures(s, 'E')), null); },
    threat(s, E) { const a = E.creatures(s, 'E'); return { damage: sumPow(s, E, a), attackers: a.length }; },
    anyTarget(s) { return s.E.bf.find((p) => p.def.slime) || null; },
    castThreat(s, d) { return d.types.includes('creature') ? 4 : d.danger ?? 2; },
  };
}

// ===== 4階：神を討て =====
const XEN = ecr('覚醒（かくせい）したゼナゴス', 6, 5, ['god'], [], { xenagos: true, noBlock: true, noCopy: true });
const rev = (name, pow, tou, kw = [], x = {}) => ecr(name, pow, tou, ['satyr', 'reveler'], kw, { reveler: true, ...x });
const THRONG = rev('お祭（まつ）り騒（さわ）ぎの群（む）れ', 3, 3);
const revelers = (s) => s.E.bf.filter((p) => p.def.reveler);
const XEN_DECK = [
  [2, THRONG],
  [5, rev('高揚（こうよう）した笛吹（ふえふ）き', 2, 2, [], { etb: (s) => { const x = s.E.bf.find((p) => p.def.xenagos); if (x) x.flags.mustAttack = true; }, reward: (s, p, E) => E.gain(s, 2) })],
  [2, rev('フィーリーズ団（だん）の歓楽（かんらく）者', 3, 3, [], { etb: (s, p, E) => { const t = weakest(s, E); if (t) { E.damage(s, t, 1, null); } }, reward: (s, p, E) => E.drawCard(s) })],
  [1, rev('怒（いか）り狂（くる）えるオリアード', 3, 2, [], { attacks: true })],
  [1, rev('荒（あら）ぶるマエナード', 4, 4)],
  [1, rev('蛇（へび）の踊（おど）り手（て）', 2, 3, ['deathtouch'])],
  [3, esp('突発的（とっぱつてき）な突進（とっしん）', (s) => { for (const p of revelers(s)) p.flags.mustAttack = true; }, { danger: 3 })],
  [2, esp('ゼナゴスの一撃（いちげき）', (s, E) => E.hurt(s, 3), { danger: 3 })],
  [1, esp('突発（とっぱつ）的（てき）な復活（ふっかつ）', (s, E) => { const i = s.E.gy.findIndex((c) => c.def.reveler); if (i >= 0) { const [c] = s.E.gy.splice(i, 1); E.enter(s, 'E', c.def); } }, { danger: 4 })],
  [1, esp('力（ちから）まかせの 一撃（いちげき）', (s, E) => { const t = biggest(s, E); if (t) E.damage(s, t, 4, null); E.sba(s); }, { danger: 4 })],
  [1, esp('ゼナゴスの嘲笑（ちょうしょう）', (s) => { s.E.flags.scorn = true; })],
  [1, eart('恐慌（きょうこう）の踊（おど）り', { panic: true, types: ['enchantment'] })],
  [1, eart('炎（ほのお）の踊（おど）り', { types: ['enchantment'], onOtherLeave: (s, q, p, E, o) => { if (p.def.reveler && o.died) E.hurt(s, 1); } })],
];

export function xenagos() {
  return {
    id: 'xenagos', name: '4階 ゼナゴス',
    goal: () => 'かんらくしゃを ぜんぶ たおしてから、ゼナゴスを たおす。かんらくしゃが いる あいだ、ゼナゴスは たおれない。',
    setup(s, E) {
      E.enter(s, 'E', XEN);
      for (let i = 0; i < DIFF(s, 2, 2, 3); i++) E.enter(s, 'E', THRONG);
      for (const p of s.E.bf) p.sick = false;
      s.E.lib = toLib(s, E, build(XEN_DECK));
    },
    async enemyTurn(s, E) {
      await E.reveal(s, 1);
      if (s.over) return;
      const panic = s.E.bf.some((p) => p.def.panic) && revelers(s).length >= 5;
      const atk = s.E.bf.filter((p) => E.isCreature(p) && !p.tapped && (p.flags.mustAttack || p.def.attacks || (panic && p.def.reveler)) && (!p.sick || panic));
      await E.enemyAttack(s, atk);
    },
    cantLeave: (s, p) => p.def.xenagos && revelers(s).length > 0,
    onLeave(s, p) { if (p.def.xenagos) s.over = 'win'; },
    playerUpkeep(s, E) { if (!s.E.flags.scorn) return; s.E.flags.scorn = false; for (const p of pc(s, E)) E.pump(p, -1, 0); },
    priority(s, p, E) {
      if (p.def.xenagos) return revelers(s).length ? 0 : 30;
      return E.power(s, p) + (E.hasKw(s, p, 'deathtouch') ? 3 : 0) + 4;
    },
    assign(s, atkers, E) {
      const x = s.E.bf.find((p) => p.def.xenagos);
      const rv = revelers(s);
      if (rv.length) return E.assignKill(s, atkers, E.killTargets(s, rv), null);
      return x ? E.assignKill(s, atkers, [{ t: x, need: E.need(s, x), v: 30, creature: true }], x) : [];
    },
    threat(s, E) { const a = s.E.bf.filter((p) => p.def.attacks || p.flags.mustAttack); return { damage: sumPow(s, E, a) + 4, attackers: a.length + 1 }; },
    anyTarget(s) { return revelers(s)[0] || s.E.bf.find((p) => p.def.xenagos) || null; },
    castThreat(s, d) { return d.reveler ? 5 : d.danger ?? 2; },
  };
}

// ===== 5階：死者の神 エレボス =====
const CERB = ecr('番犬の頭', 0, 3, ['head'], [], { head: true, headDmg: 2, noBlock: true, reward: (s, p, E) => E.gain(s, 2) });
const P1_DECK = [
  [3, CERB],
  [2, esp('冥界（めいかい）の遠吠（とおぼ）え', (s) => { s.E.flags.turn.extra = (s.E.flags.turn.extra || 0) + 1; }, { danger: 3 })],
  [2, esp('冥界の炎（ほのお）の息（いき）', (s, E) => { const t = biggest(s, E); if (t) E.damage(s, t, 3, null); E.sba(s); }, { danger: 3 })],
  [1, esp('黄泉（よみ）の門（もん）', (s, E) => { const i = s.E.gy.findIndex((c) => c.def.head); if (i >= 0) { const [c] = s.E.gy.splice(i, 1); E.enter(s, 'E', c.def); } }, { danger: 4 })],
  [2, esp('眠（ねむ）りの歌', (s) => { s.E.flags.turn.noDmg = true; }, { danger: 0 })],
];
const EREBOS = ecr('死者の神 エレボス', 5, 7, ['god'], ['indestructible'], { erebos: true, noBlock: true, noCopy: true });
const minion = (name, pow, tou, x = {}) => ecr(name, pow, tou, ['zombie'], [], { minion: true, ...x });
const PHALANX = minion('帰還（きかん）したファランクス', 0, 4, { attacks: false });
const minions = (s) => s.E.bf.filter((p) => p.def.minion);
const P2_DECK = [
  [2, PHALANX],
  [2, minion('アスフォデルの 灰色（はいいろ）商人（しょうにん）', 2, 4, { etb: (s, p, E) => E.hurt(s, minions(s).length), reward: (s, p, E) => E.drawCard(s) })],
  [3, minion('冥界（めいかい）の 兵（へい）', 2, 2, { attacks: true, reward: (s, p, E) => E.gain(s, 2) })],
  [2, esp('死者（ししゃ）の招集（しょうしゅう）', (s, E) => { const i = s.E.gy.findIndex((c) => c.def.minion); if (i >= 0) { const [c] = s.E.gy.splice(i, 1); E.enter(s, 'E', c.def); } }, { danger: 4 })],
  [1, esp('冥界（めいかい）の霧（きり）', (s, E) => { for (const p of pc(s, E)) E.damage(s, p, 1, null); E.sba(s); }, { danger: 3 })],
  [1, esp('眠（ねむ）りの歌', (s) => { s.E.flags.turn.halt = true; }, { danger: 0 })],
];
const P3_DECK = [
  [3, ecr('冥界（めいかい）の 兵（へい）', 2, 2, ['zombie'], [], { attacks: true })],
  [1, ecr('エレボスの 巨人（きょじん）', 5, 5, ['giant'], [], { attacks: true })],
  [2, esp('エレボスの 裁（さば）き', (s, E) => { const t = biggest(s, E); if (t) E.destroy(s, t); E.sba(s); }, { danger: 5 })],
  [2, esp('命（いのち）の 代価（だいか）', (s, E) => E.hurt(s, 3), { danger: 3 })],
  [2, esp('墓地（ぼち）からの 呼（よ）び声（ごえ）', (s, E) => {
    const cs = s.P.gy.filter((c) => c.def.types.includes('creature') && typeof c.def.pow === 'number').sort((a, b) => b.def.pow - a.def.pow);
    if (!cs.length) return;
    s.P.gy.splice(s.P.gy.indexOf(cs[0]), 1);
    const d = cs[0].def;
    E.enter(s, 'E', { name: d.name, types: d.types, pow: d.pow, tou: d.tou, sub: d.sub, kw: d.kw, color: d.color, cost: d.cost, attacks: true });
  }, { danger: 4 })],
  [1, esp('夜明けの 光', (s, E) => { s.E.life -= 3; s.E.flags.erebosRest = true; }, { danger: 0 })],
];

export function erebos() {
  const toPhase = (s, E, ph) => {
    s.phase = ph; s.stats.phase = ph;
    E.gain(s, 3); E.drawCard(s);
    for (const p of [...s.E.bf]) if (!p.def.erebos) E.leave(s, p, 'gy');
    s.E.gy = [];
    if (ph === 2) {
      if (!s.E.bf.some((p) => p.def.erebos)) E.enter(s, 'E', EREBOS);
      for (let i = 0; i < DIFF(s, 1, 2, 3); i++) E.enter(s, 'E', PHALANX);
      s.E.lib = toLib(s, E, build(P2_DECK));
    } else {
      s.E.life = DIFF(s, 16, 24, 32);
      s.P.noLifeGain = true;
      s.E.lib = toLib(s, E, build(P3_DECK));
    }
    for (const p of s.E.bf) p.sick = false;
  };
  return {
    id: 'erebos', name: '5階 エレボス',
    goal: () => '3つの だんかいを こえて、死者の神 エレボスの ライフを 0に する。',
    get faceUnit() { return 1.5; },
    setup(s, E) {
      s.phase = 1; s.stats.phase = 1;
      const n = DIFF(s, 1, 1, 1);
      const defs = build(P1_DECK);
      for (let i = 0; i < n; i++) E.enter(s, 'E', CERB);
      for (const p of s.E.bf) p.sick = false;
      s.E.lib = toLib(s, E, defs);
    },
    async enemyTurn(s, E) {
      if (s.phase === 1) { await E.reveal(s, 1); await headsFloor.headTurn(s, E); return; }
      if (s.phase === 2) {
        await E.reveal(s, DIFF(s, 1, 2, 2));
        if (s.over || s.E.flags.turn.halt) return;
        await E.enemyAttack(s, attackers(s, E, (p) => p.def.attacks));
        return;
      }
      E.hurt(s, DIFF(s, 2, 2, 3)); // エレボス：死者の神のターンのはじめに ライフを失う
      if (s.over) return;
      await E.reveal(s, DIFF(s, 1, 2, 2));
      if (s.over) return;
      const rest = s.E.flags.erebosRest; s.E.flags.erebosRest = false;
      await E.enemyAttack(s, attackers(s, E, (p) => p.def.attacks || (p.def.erebos && !rest)));
    },
    onLeave(s, p, E) { if (s.phase === 1 && p.def.head) headsFloor.regrow(s, E, 1); },
    cantLeave: (s, p) => !!p.def.erebos,
    untargetable: (s, p) => p.def.erebos && s.phase !== 3,
    preventDamage(s, p, n) {
      if (!p.def.erebos) return false;
      if (s.phase === 3) { s.E.life -= n; if (s.E.life <= 0) s.over = 'win'; }
      return true;
    },
    face(s, n) { if (s.phase !== 3) return; s.E.life -= n; if (s.E.life <= 0) s.over = 'win'; },
    faceValue: (s, n) => (s.phase === 3 ? n * 2 : 0),
    check(s, E, when) {
      if (s.phase === 3 && s.E.life <= 0) s.over = 'win';
      if (when !== 'end' || s.over) return;
      if (s.phase === 1 && !s.E.bf.some((p) => p.def.head)) toPhase(s, E, 2);
      else if (s.phase === 2 && !minions(s).length) toPhase(s, E, 3);
    },
    priority(s, p, E) {
      if (s.phase === 1) return headsFloor.priority(s, p);
      if (s.phase === 2) return p.def.minion ? E.power(s, p) + 4 : 0;
      return p.def.erebos ? 0 : E.power(s, p) * 1.5 + 1;
    },
    assign(s, atkers, E) {
      if (s.phase === 1) return headsFloor.assign(s, atkers, E);
      if (s.phase === 2) return E.assignKill(s, atkers, E.killTargets(s, minions(s)), null);
      const big = E.creatures(s, 'E').filter((p) => !p.def.erebos && E.power(s, p) >= 3);
      return E.assignKill(s, atkers, E.killTargets(s, big), 'face');
    },
    threat(s, E) {
      if (s.phase === 1) return { damage: s.E.bf.filter((p) => p.def.head).reduce((t, p) => t + p.def.headDmg, 0), attackers: 0 };
      const a = s.E.bf.filter((p) => p.def.attacks || (s.phase === 3 && p.def.erebos));
      return { damage: sumPow(s, E, a) + 3, attackers: a.length + 1 };
    },
    anyTarget(s) {
      if (s.phase === 3) return 'face';
      return s.E.bf.find((p) => p.def.head || p.def.minion) || null;
    },
    castThreat(s, d) { return d.head ? 7 : d.minion ? 5 : d.types.includes('creature') ? d.pow : d.danger ?? 2; },
  };
}

// ===== 新しい 階で 使う 部品 =====
// 攻撃する クリーチャーの えらびかたを ぜんぶ ためす（f が 何か かえしたら そこで おわり）。list は 10体まで
function eachSubset(list, f) {
  for (let m = 1; m < (1 << list.length); m++) {
    const r = f(list.filter((_, i) => (m >> i) & 1));
    if (r) return r;
  }
  return null;
}
// 数の 組み合わせで 作れる 合計（0 を ふくむ）
const sumsOf = (vals) => vals.reduce((set, v) => new Set([...set, ...[...set].map((x) => x + v)]), new Set([0]));
const strongest = (s, E, list, n = 10) => [...list].sort((a, b) => E.power(s, b) - E.power(s, a)).slice(0, n);

// ===== 1階B：からくり 時計塔 =====
// 時計の はり（s.E.hour：1〜12）。プレイヤーの ダメージで はりが ちょうど 12に とまれば かち。12を こえると かねが なる
const CLOCK = eart('からくり時計', { clock: true });
const cog = (name, pow, tou, x = {}) => ({ ...ecr(name, pow, tou, ['construct'], [], { attacks: true, cog: true, ...x }), types: ['artifact', 'creature'] });
const COG = cog('ぜんまい兵（へい）', 2, 2);
const SPRING = cog('ちびぜんまい', 1, 1); // かねが なると 出てくる トークン
function moveHand(s, E, n, byPlayer) {
  if (n <= 0 || s.over) return;
  const from = s.E.hour, to = from + n;
  s.E.hour = ((to - 1) % 12) + 1;
  s.E.flags.lastMove = { from, to: s.E.hour };
  E.L(s, `時計の はりが ${n} すすんだ（${from}時 → ${s.E.hour}時）`);
  if (byPlayer && to % 12 === 0) { s.E.flags.lastMove.stop = true; E.L(s, '12時で 時計が とまった！'); s.over = 'win'; return; }
  for (let i = Math.floor(from / 12); i < Math.floor(to / 12) && !s.over; i++) {
    E.L(s, 'ゴーン！ 12時の かねが なった');
    E.hurt(s, 2);
    E.token(s, 'E', SPRING);
  }
}
function rewind(s, E, n) {
  const from = s.E.hour;
  s.E.hour = ((((from - n - 1) % 12) + 12) % 12) + 1;
  E.L(s, `時計の はりが ${n} もどった（${from}時 → ${s.E.hour}時）`);
}
const CLOCK_DECK = [
  [4, COG],
  [2, ecr('はと時計の はと', 1, 1, ['bird'], ['flying'], { attacks: true, reward: (s, p, E) => E.drawCard(s) })],
  [1, cog('ふりこの 番人', 0, 4, { attacks: false, guard: true, reward: (s, p, E) => E.gain(s, 2) })],
  [1, cog('大（おお）時計の 番兵（ばんぺい）', 3, 3)],
  [2, esp('時計の くるい', (s, E) => moveHand(s, E, 2, false))],
  [1, esp('まきもどし', (s, E) => rewind(s, E, 3))],
  [1, esp('ねじまき', (s) => { s.E.flags.turn.cogPump = true; }, { danger: 3 })],
  [1, esp('かねの ひびき', (s, E) => { const t = biggest(s, E); if (t) t.tapped = true; })],
  [2, esp('油さし', (s) => { s.E.flags.turn.halt = true; }, { danger: 0 })],
  [1, esp('お昼休み', (s) => { s.E.flags.turn.noTick = true; }, { danger: 0 })],
];

export function clock() {
  const need = (s) => 12 - (s.E.hour % 12); // 12時の ときは 12
  return {
    id: 'clock', name: '1階 からくり時計塔（とう）', faceLabel: '時計',
    goal: () => '時計の はりを、ちょうど 12に とめる。ダメージの 数だけ はりが すすむ。12を こえて しまうと、かねが なる。',
    setup(s, E) {
      E.enter(s, 'E', CLOCK);
      s.E.hour = DIFF(s, 5, 4, 3);
      const defs = build(CLOCK_DECK);
      for (let i = 0; i < DIFF(s, 0, 1, 3); i++) { defs.splice(defs.indexOf(COG), 1); E.enter(s, 'E', COG); }
      E.token(s, 'E', SPRING, DIFF(s, 0, 1, 0));
      for (const p of s.E.bf) p.sick = false;
      s.E.lib = toLib(s, E, defs);
    },
    async enemyTurn(s, E) {
      await E.reveal(s, 1);
      if (s.over) return;
      if (!s.E.flags.turn.noTick) moveHand(s, E, 1, false); // チクタク
      if (s.over || s.E.flags.turn.halt) return;
      const atk = attackers(s, E, (p) => p.def.attacks);
      if (s.E.flags.turn.cogPump) for (const p of atk) if (p.def.cog) E.pump(p, 1, 0);
      await E.enemyAttack(s, atk);
    },
    cantLeave: (s, p) => !!p.def.clock,
    untargetable: (s, p) => !!p.def.clock,
    // 戦闘の ダメージは 合計して いっぺんに すすめる。呪文の ダメージは 1回ずつ
    onDamaged(s, p, n, src, E) {
      if (!p.def.clock) return;
      if (s.combat) s.combat.clock = (s.combat.clock || 0) + n;
      else moveHand(s, E, n, true);
    },
    afterCombat(s, E) { if (s.combat.clock) moveHand(s, E, s.combat.clock, true); },
    face(s, n, E) { moveHand(s, E, n, true); },
    faceValue: (s, n) => (n === need(s) ? 100 : 0),
    priority(s, p, E) { return p.def.guard ? 9 : E.power(s, p) * 2 + 2; },
    assign(s, atkers, E) {
      const clk = s.E.bf.find((p) => p.def.clock);
      const kill = E.killTargets(s, E.creatures(s, 'E'));
      if (!clk || s.E.bf.some((p) => p.def.guard)) return E.assignKill(s, atkers, kill, null);
      const n = need(s), list = strongest(s, E, atkers);
      const plan = (toC) => [...toC.map((p) => ({ p, t: clk })), ...E.assignKill(s, atkers.filter((p) => !toC.includes(p)), kill, null)];
      const through = (pl, toC) => { const bl = E.enemyBlocks(s, pl); return sumPow(s, E, toC.filter((p) => !bl.has(p.uid))); };
      const exact = eachSubset(list, (toC) => {
        if (sumPow(s, E, toC) !== n) return null;
        const pl = plan(toC);
        return through(pl, toC) === n ? pl : null;
      });
      if (exact) return exact;
      // とどかない ときは すすめておく：敵の ターンに 1 すすんだ あとの のこりが、いまの クリーチャーで 作れる 数に なるように（12は こえない）
      const can = sumsOf(E.creatures(s, 'P').filter((p) => !E.hasKw(s, p, 'defender') && !E.cant(s, p, 'cantAttack')).map((p) => Math.max(0, E.power(s, p))));
      let best = null;
      eachSubset(list, (toC) => {
        const a = sumPow(s, E, toC);
        if (a <= n - 2 && can.has(n - a - 1) && (!best || a > best.a)) best = { a, toC };
        return null;
      });
      if (best) { const pl = plan(best.toC); if (through(pl, best.toC) <= n - 2) return pl; }
      return E.assignKill(s, atkers, kill, null);
    },
    threat(s, E) { const a = E.creatures(s, 'E').filter((p) => p.def.attacks); return { damage: sumPow(s, E, a) + (s.E.hour === 11 ? 2 : 0), attackers: a.length }; },
    anyTarget(s, E) { return E.creatures(s, 'E')[0] || null; },
    castThreat(s, d) { return d.types.includes('creature') ? d.pow + 1 + (d.guard ? 4 : 0) : d.danger ?? 2; },
  };
}

// ===== 2階B：ドラゴンの 宝の 山 =====
// 宝の 山（本体）に あたえた ダメージ 1点で 金貨 1まいを とりかえす。宝の 山を 攻撃した クリーチャー 1体ごとに、ドラゴンの ねむけが 1 へる
const DRAGON = ecr('宝（たから）の 山の ドラゴン', 5, 5, ['dragon'], ['flying'], { dragon: true, noBlock: true, noCopy: true, reward: (s, p, E) => addGold(s, E, 5) });
const kobold = (name, pow, tou, x = {}) => ecr(name, pow, tou, ['kobold'], [], { attacks: true, kobold: true, ...x });
const SPEAR = kobold('コボルドの やり兵（へい）', 2, 1);
function addGold(s, E, n) {
  if (s.over || n <= 0) return;
  s.E.gold += n;
  E.L(s, `金貨（きんか） ＋${n}（${s.E.gold}/${s.E.goal}まい）`);
  if (s.E.gold >= s.E.goal) s.over = 'win';
}
function wake(s, E, n) {
  if (s.E.flags.awake || n <= 0) return;
  s.E.sleep = Math.max(0, s.E.sleep - n);
  E.L(s, `ドラゴンの ねむけ −${n}（のこり ${s.E.sleep}）`);
  if (!s.E.sleep) { s.E.flags.awake = true; E.L(s, 'ドラゴンが 目を さました！'); }
}
const DRAGON_DECK = [
  [5, SPEAR],
  [2, kobold('コボルドの 見はり', 1, 2, { attacks: false, etb: (s, p, E) => wake(s, E, 1), reward: (s, p, E) => E.drawCard(s) })],
  [1, kobold('コボルドの 親分', 3, 3)],
  [2, esp('ドラゴンの ねごと', (s, E) => { if (!s.E.flags.awake) return; for (const p of pc(s, E)) E.damage(s, p, 1, null); E.sba(s); })],
  [2, esp('金貨（きんか）の わな', (s, E) => { const t = biggest(s, E); if (t) t.tapped = true; })],
  [1, esp('コボルドの 号令（ごうれい）', (s) => { s.E.flags.turn.koboldPump = true; }, { danger: 3 })],
  [1, esp('ドラゴンの あくび', (s, E) => wake(s, E, 2), { danger: 3 })],
  [1, esp('ころがる 金貨（きんか）', (s, E) => addGold(s, E, 2), { danger: 0 })],
];

export function dragon() {
  const left = (s) => s.E.goal - s.E.gold;
  return {
    id: 'dragon', name: '2階 ドラゴンの 宝（たから）の 山', faceUnit: 1, faceLabel: '宝（たから）の 山',
    goal: (s) => `たからの 山から きんかを ${s.E.goal}まい とりかえす。たからの 山を こうげきする 足音で、ドラゴンが 目を さます。`,
    setup(s, E) {
      Object.assign(s.E, { gold: 0, goal: DIFF(s, 15, 20, 25), sleep: DIFF(s, 6, 4, 4) });
      const n = DIFF(s, 4, 5, 6);
      E.enter(s, 'E', { ...DRAGON, pow: n, tou: n });
      const defs = build(DRAGON_DECK);
      for (let i = 0; i < DIFF(s, 0, 1, 2); i++) { defs.splice(defs.indexOf(SPEAR), 1); E.enter(s, 'E', SPEAR); }
      for (const p of s.E.bf) p.sick = false;
      s.E.lib = toLib(s, E, defs);
    },
    async enemyTurn(s, E) {
      await E.reveal(s, 1);
      if (s.over) return;
      const atk = attackers(s, E, (p) => p.def.attacks || (p.def.dragon && s.E.flags.awake));
      if (s.E.flags.turn.koboldPump) for (const p of atk) if (p.def.kobold) E.pump(p, 1, 0);
      await E.enemyAttack(s, atk);
    },
    face(s, n, E) { addGold(s, E, n); },
    faceValue: (s, n) => (n >= left(s) ? 200 : n * 1.2),
    afterCombat(s, E) { wake(s, E, s.combat.atk.filter((a) => a.t === 'face').length); },
    untargetable: (s, p) => !!p.def.dragon && !s.E.flags.awake,
    preventDamage: (s, p) => !!p.def.dragon && !s.E.flags.awake, // ねている ドラゴンには とどかない
    check(s) { if (s.E.gold >= s.E.goal) s.over = 'win'; },
    priority(s, p, E) { return p.def.dragon ? (s.E.flags.awake ? 14 : 0) : E.power(s, p) * 2 + 1; },
    assign(s, atkers, E) {
      if (sumPow(s, E, atkers) >= left(s)) return atkers.map((p) => ({ p, t: 'face' }));
      const kill = E.killTargets(s, E.creatures(s, 'E'));
      if (s.E.flags.awake || s.E.sleep <= 1) return E.assignKill(s, atkers, kill, 'face');
      // ねている あいだは、足音が ねむけに とどかない 数だけ（パワーの 大きい じゅんに）宝の 山へ
      const list = strongest(s, E, atkers, atkers.length), k = s.E.sleep - 1;
      return [...list.slice(0, k).map((p) => ({ p, t: 'face' })), ...E.assignKill(s, list.slice(k), kill, null)];
    },
    threat(s, E) { const a = E.creatures(s, 'E').filter((p) => p.def.attacks || (p.def.dragon && s.E.flags.awake)); return { damage: sumPow(s, E, a), attackers: a.length }; },
    anyTarget() { return 'face'; },
    castThreat(s, d) { return d.types.includes('creature') ? d.pow + 1 : d.danger ?? 2; },
  };
}

// ===== 3階C：ふたごの 巨人 =====
// 兄と 弟を 同じ ターンに 2体とも たおせば かち。片方だけ たおれると、ターンの おわりに もう片方が つれもどす。巨人は こうたいで 攻撃する
const giant = (twin, name, pow, tou) => ecr(name, pow, tou, ['giant'], [], { twin, noBlock: true, noCopy: true });
const TWIN_DECK = [
  [3, ecr('山の オオカミ', 2, 2, ['wolf'], [], { attacks: true })],
  [1, ecr('巨人（きょじん）の 番犬', 3, 2, ['dog'], [], { attacks: true })],
  [1, ecr('岩の 番人', 0, 5, ['golem'], [], { attacks: false, reward: (s, p, E) => E.gain(s, 2) })],
  [2, esp('岩なげ', (s, E) => { const t = weakest(s, E); if (t) E.damage(s, t, 3, null); E.sba(s); }, { danger: 3 })],
  [1, esp('ふたごの 合図', (s) => { s.E.flags.turn.both = true; }, { danger: 3 })],
  [1, esp('ふたごの ちかい', (s, E) => { for (const p of s.E.bf.filter((q) => q.def.twin)) E.addCounters(s, p, 1); }, { danger: 3 })],
  [1, esp('地ひびき', (s, E) => { for (const p of pc(s, E)) E.damage(s, p, 1, null); E.sba(s); }, { danger: 3 })],
  [2, esp('星の ひかり', (s) => { s.E.flags.turn.halt = true; }, { danger: 0 })],
  [1, esp('ふたごの けんか', (s, E) => { s.E.flags.turn.halt = true; E.gain(s, 2); }, { danger: 0 })],
];
// 2体を 同じ ターンに たおす わけかた：兄へ 行く 組を ぜんぶ ためし、のこりから 弟に とどく 組を パワーの 大きい じゅんに 作る
function splitTwins(s, E, atkers, [a, b], kill) {
  const list = strongest(s, E, atkers);
  const na = E.need(s, a), nb = E.need(s, b);
  const dt = (p) => E.hasKw(s, p, 'deathtouch');
  const enough = (g, n) => g.some(dt) || sumPow(s, E, g) >= n;
  if (sumPow(s, E, list) < na + nb && !list.some(dt)) return null;
  let best = null;
  eachSubset(list, (ga) => {
    if (!enough(ga, na)) return null;
    const gb = [];
    for (const p of list) { if (enough(gb, nb)) break; if (!ga.includes(p)) gb.push(p); }
    if (!gb.length || !enough(gb, nb)) return null;
    const used = ga.length + gb.length;
    if (best && used >= best.used) return null;
    const rest = atkers.filter((p) => !ga.includes(p) && !gb.includes(p));
    const plan = [...ga.map((p) => ({ p, t: a })), ...gb.map((p) => ({ p, t: b })), ...E.assignKill(s, rest, kill, null)];
    const bl = E.enemyBlocks(s, plan);
    const thru = (g) => g.filter((p) => !bl.has(p.uid));
    if (enough(thru(ga), na) && enough(thru(gb), nb)) best = { used, plan };
    return null;
  });
  return best?.plan || null;
}

export function twins() {
  let pair = [];
  const on = (s) => s.E.bf.filter((p) => p.def.twin);
  return {
    id: 'twins', name: '3階 ふたごの 巨人（きょじん）',
    goal: () => 'ふたごの きょじんを、同じ ターンに 2体とも たおす。1体だけ たおすと、ターンの おわりに もう1体が つれもどして しまう。',
    setup(s, E) {
      const [a, b] = DIFF(s, [[2, 4], [3, 2]], [[2, 5], [4, 3]], [[3, 6], [5, 4]]);
      pair = [giant('ani', '兄 カストル', ...a), giant('oto', '弟 ポルックス', ...b)];
      for (const d of pair) E.enter(s, 'E', d);
      for (const p of s.E.bf) p.sick = false;
      s.E.flags.nextTwin = 'ani';
      s.E.lib = toLib(s, E, build(TWIN_DECK));
    },
    async enemyTurn(s, E) {
      await E.reveal(s, 1);
      if (s.over) return;
      const who = s.E.flags.nextTwin;
      s.E.flags.nextTwin = who === 'ani' ? 'oto' : 'ani';
      if (s.E.flags.turn.halt) return;
      await E.enemyAttack(s, attackers(s, E, (p) => p.def.attacks || (p.def.twin && (s.E.flags.turn.both || p.def.twin === who))));
    },
    endTurn(s, E) {
      const live = on(s);
      if (live.length !== 1) return;
      const d = pair.find((x) => x.twin !== live[0].def.twin);
      for (const z of ['gy', 'lib', 'exile']) { const i = s.E[z].findIndex((c) => c.def.twin === d.twin); if (i >= 0) s.E[z].splice(i, 1); }
      E.L(s, `${live[0].def.name} が ${d.name} を つれもどした`);
      E.enter(s, 'E', d);
    },
    check(s) { if (!on(s).length) s.over = 'win'; },
    priority(s, p, E) { return p.def.twin ? (on(s).length === 1 ? 50 : 0) : E.power(s, p) * 2 + 2; },
    assign(s, atkers, E) {
      const tw = on(s);
      const kill = E.killTargets(s, E.creatures(s, 'E').filter((p) => !p.def.twin));
      if (tw.length === 1) return E.assignKill(s, atkers, [{ t: tw[0], need: E.need(s, tw[0]), v: 50, creature: true }, ...kill], null);
      return (tw.length === 2 && splitTwins(s, E, atkers, tw, kill)) || E.assignKill(s, atkers, kill, null);
    },
    threat(s, E) {
      const a = E.creatures(s, 'E').filter((p) => p.def.attacks || p.def.twin === s.E.flags.nextTwin);
      return { damage: sumPow(s, E, a) + 2, attackers: a.length + 1 };
    },
    anyTarget(s, E) { return E.creatures(s, 'E').find((p) => !p.def.twin) || null; },
    castThreat(s, d) { return d.types.includes('creature') ? d.pow + 1 : d.danger ?? 2; },
  };
}

// ===== 4階B：メドゥーサの 石の 庭 =====
// メドゥーサの ライフ（s.E.life）を 0に すれば かち。パワーが STONE いじょうの クリーチャーが メドゥーサを 攻撃すると、ダメージを あたえずに 石に なる
export const STONE = 4;
const MEDUSA = ecr('ゴルゴンの メドゥーサ', 0, 1, ['gorgon'], [], { medusa: true, noBlock: true, noCopy: true });
const SNAKE = ecr('へび', 1, 1, ['snake'], [], { attacks: true });
const VIPER = ecr('ゴルゴンの へび', 2, 1, ['snake'], [], { attacks: true });
// 石に なった クリーチャーは、メドゥーサが いる あいだ アンタップしない（氷の時代と おなじ しくみ）
function petrify(s, E, p) {
  const m = s.E.bf.find((q) => q.def.medusa);
  if (!m || !E.onBf(s, p) || p.stone) return;
  p.tapped = true; p.iceBy = m; p.stone = true;
  E.L(s, `${p.def.name} が 石に なった`);
}
function hitMedusa(s, E, n, src) {
  if (n <= 0 || s.over) return;
  s.E.life -= n;
  if (s.combat && src?.side === 'P') s.combat.events.push({ src, t: 'face', n });
  E.L(s, `メドゥーサに ${n}点（のこり ${Math.max(0, s.E.life)}）`);
  if (s.E.life <= 0) s.over = 'win';
}
const MEDUSA_DECK = [
  [4, VIPER],
  [2, ecr('石の 兵士（へいし）', 0, 4, ['soldier'], [], { attacks: false, reward: (s, p, E) => E.gain(s, 2) })],
  [2, ecr('コカトリス', 1, 2, ['cockatrice'], ['flying'], { attacks: true })],
  [1, ecr('バジリスク', 3, 3, ['basilisk'], [], { attacks: true })],
  [2, esp('石の まなざし', (s, E) => { const t = biggest(s, E, (p) => !p.stone && E.power(s, p) >= STONE); if (t) petrify(s, E, t); }, { danger: 4 })],
  [1, esp('へびの かみの毛', (s, E) => E.token(s, 'E', SNAKE, 2), { danger: 3 })],
  [2, esp('メドゥーサの いかり', (s, E) => E.hurt(s, 3), { danger: 3 })],
  [2, esp('かがみの たて', (s, E) => {
    const t = pc(s, E).filter((p) => p.stone).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
    if (!t) return hitMedusa(s, E, 3, null);
    t.stone = false; t.iceBy = null; t.tapped = false;
    E.L(s, `${t.def.name} が もとに もどった`);
  }, { danger: 0 })],
  [1, esp('ペガサスの 羽', (s, E) => { E.drawCard(s); E.gain(s, 2); }, { danger: 0 })],
];

export function gorgon() {
  return {
    id: 'gorgon', name: '4階 メドゥーサの 石の 庭', faceLabel: 'メドゥーサ',
    goal: (s) => `メドゥーサの ライフ ${s.E.life}を 0に する。パワー ${STONE} いじょうの クリーチャーで メドゥーサを こうげきすると、石に なって うごけなくなる。`,
    setup(s, E) {
      s.E.life = DIFF(s, 14, 18, 20);
      E.enter(s, 'E', MEDUSA);
      const defs = build(MEDUSA_DECK);
      for (let i = 0; i < DIFF(s, 1, 2, 2); i++) { defs.splice(defs.indexOf(VIPER), 1); E.enter(s, 'E', VIPER); }
      for (const p of s.E.bf) p.sick = false;
      s.E.lib = toLib(s, E, defs);
    },
    async enemyTurn(s, E) {
      await E.reveal(s, 1);
      if (s.over) return;
      await E.enemyAttack(s, attackers(s, E, (p) => p.def.attacks));
    },
    cantLeave: (s, p) => !!p.def.medusa,
    untargetable: (s, p) => !!p.def.medusa, // 呪文は「メドゥーサ（ライフ）」を ねらう
    preventDamage(s, p, n, src, E) {
      if (!p.def.medusa) return false;
      if (src?.side === 'P' && src.attacking && E.power(s, src) >= STONE) petrify(s, E, src);
      else hitMedusa(s, E, n, src?.def ? src : null);
      return true;
    },
    face(s, n, E) { hitMedusa(s, E, n, null); },
    faceValue: (s, n) => (n >= s.E.life ? 200 : n * 2),
    check(s) { if (s.E.life <= 0) s.over = 'win'; },
    priority(s, p, E) { return p.def.medusa ? 0 : E.power(s, p) * 2 + 2; },
    assign(s, atkers, E) {
      const m = s.E.bf.find((p) => p.def.medusa);
      const kill = E.killTargets(s, E.creatures(s, 'E').filter((p) => !p.def.medusa));
      const big = atkers.filter((p) => E.power(s, p) >= STONE);
      return [...E.assignKill(s, big, kill, null), ...atkers.filter((p) => !big.includes(p)).map((p) => ({ p, t: m }))];
    },
    threat(s, E) { const a = E.creatures(s, 'E').filter((p) => p.def.attacks); return { damage: sumPow(s, E, a) + 2, attackers: a.length }; },
    anyTarget(s, E) { return E.creatures(s, 'E').find((p) => !p.def.medusa) || null; },
    castThreat(s, d) { return d.types.includes('creature') ? d.pow + 1 : d.danger ?? 2; },
  };
}

// ===== チュートリアル：メレティスの 訓練場 =====
// 「訓練の まと」（タフネス 10）を たおせば かち。わらの 兵士は 2回めの 敵の ターンから 攻撃する
const DUMMY = ecr('訓練（くんれん）の まと', 0, 10, ['wall'], [], { id: 'tut_dummy', dummy: true, noBlock: true, noCopy: true });
const STRAW = ecr('わらの 兵士（へいし）', 3, 3, ['scarecrow'], [], { id: 'tut_straw', straw: true, noBlock: true });

export function tutorial() {
  return {
    id: 'tutorial', name: 'チュートリアル',
    setup(s, E) {
      E.enter(s, 'E', DUMMY); E.enter(s, 'E', STRAW);
      for (const p of s.E.bf) p.sick = false;
      s.E.lib = [];
    },
    async enemyTurn(s, E) {
      s.E.flags.n = (s.E.flags.n || 0) + 1;
      if (s.E.flags.n < 2) return;
      await E.enemyAttack(s, s.E.bf.filter((p) => p.def.straw && !p.tapped));
    },
    check(s) { if (!s.E.bf.some((p) => p.def.dummy)) s.over = 'win'; },
    priority(s, p) { return p.def.dummy ? 10 : 2; },
    assign(s, atkers, E) { const d = s.E.bf.find((p) => p.def.dummy); return d ? atkers.map((p) => ({ p, t: d })) : []; },
    threat(s, E) { const a = s.E.bf.filter((p) => p.def.straw); return { damage: a.length * 3, attackers: a.length }; },
    anyTarget(s) { return s.E.bf.find((p) => p.def.dummy) || null; },
    castThreat() { return 0; },
  };
}

// ===== オンラインバトル：ほかの 人の デッキ（ゴースト）と 1対1 =====
// g = { deck: [def…], name, first: 'P' | 'E' }。どちらも ライフ 20。攻撃は あいて（プレイヤー）に する（MTG と おなじ）
// あいての ターンは P と E を 入れかえて、プレイヤー用の AI（ai.js）と カードの 効果を そのまま 使う
export function pvp(g) {
  return {
    id: 'pvp', name: g.name || 'あいて', faceUnit: 1, faceLabel: 'あいて', first: g.first || 'P',
    setup(s, E) {
      Object.assign(s.E, { lib: shuffle(s.rng, g.deck.map((d) => E.card(d))), hand: [], mana: [], suspended: [], life: 20, noLifeGain: false, flags: {} });
      for (let i = 0; i < 5; i++) s.E.hand.push(s.E.lib.shift());
      s.foeStats = { exact: 0, playerTurns: 0, lifeLost: 0, reshuffled: 0 };
    },
    async enemyTurn(s, E) {
      const human = s.ai, AI = E.AI;
      const mine = () => { E.swapSides(s); s.ai = AI; };
      const back = () => { E.swapSides(s); s.ai = human; };
      mine();
      ghostBegin(s, E);
      let atk = [];
      if (!s.over) AI.main(s, 1);
      if (!s.over) E.combatStart(s);
      if (!s.over) {
        atk = AI.attack(s).filter((a) => a.t);
        if (atk.length) { E.L(s, `てきの こうげき：${atk.map((a) => a.p.def.name).join('、')}`); E.attackTriggers(s, atk); }
      }
      back();
      if (!s.over && atk.length) await E.enemyAttack(s, atk.map((a) => a.p));
      if (s.over) return;
      mine();
      AI.main(s, 2);
      for (const p of [...s.P.bf]) if (E.onBf(s, p) && p.def.endStep) p.def.endStep(s, p, E);
      back();
    },
    // ニクスの 嵐：じぶんの 10ターンめから、ターンの はじめに ライフを 1・2・3…と 失う（長びかない ように）
    playerUpkeep(s, E) { nyxStorm(s, E); },
    face(s, n) { s.E.life -= n; if (s.E.life <= 0) s.over = s.P.life <= 0 ? 'draw' : 'win'; },
    faceValue: (s, n) => (n >= s.E.life ? 200 : n * 1.5),
    check(s) { if (s.E.life <= 0) s.over = s.P.life <= 0 ? 'draw' : 'win'; },
    priority(s, p, E) { return E.power(s, p) * 2 + (E.hasKw(s, p, 'flying') ? 2 : 0) + 1; },
    assign(s, atkers) { return atkers.map((p) => ({ p, t: 'face' })); },
    threat(s, E) { const a = s.E.bf.filter((q) => E.isCreature(q) && !E.hasKw(s, q, 'defender') && !q.def.cantAttack); return { damage: sumPow(s, E, a), attackers: a.length }; },
    anyTarget() { return 'face'; },
    castThreat(s, d) { return d.types.includes('creature') ? (d.pow || 0) + 1 : 2; },
  };
}

export const NYX_FROM = 10;
export const PVP_TURNS = 15; // おたがい 15ターンで 決着が つかなければ ひきわけ
export const nyxLoss = (turns) => Math.max(0, turns - NYX_FROM + 1);
function nyxStorm(s, E) {
  if (s.stats.playerTurns > PVP_TURNS) { E.L(s, `${PVP_TURNS}ターンで 決着が つかなかった`); s.over = 'draw'; return; }
  const n = nyxLoss(s.stats.playerTurns);
  if (!n) return;
  E.L(s, `ニクスの あらし：${s.swapped ? 'てきの ' : ''}ライフ −${n}`);
  E.hurt(s, n);
}

// ゴーストの ターンの はじめ（入れかえた あと。アンタップは enemyTurn が すませている）
function ghostBegin(s, E) {
  const P = s.P;
  s.stats.playerTurns++;
  P.flags.enteredLastTurn = P.flags.enteredThisTurn; P.flags.enteredThisTurn = false;
  P.flags.cast = 0; P.flags.charged = false;
  for (const c of P.hand) c.locked = false;
  for (const p of P.bf) { p.sick = false; p.flags.turn = {}; }
  for (const m of P.mana) m.tapped = false;
  nyxStorm(s, E);
  if (s.over) return;
  for (const p of [...P.bf]) if (E.onBf(s, p) && p.def.upkeep) p.def.upkeep(s, p, E);
  const ready = [];
  for (const x of P.suspended) { x.n--; if (x.n <= 0) ready.push(x); }
  P.suspended = P.suspended.filter((x) => x.n > 0);
  for (const x of ready) E.castSuspended(s, x.c);
  E.sba(s);
  if (!s.over) E.refill(s);
}

export const FLOORS = { hydra, horde, factory, slime, xenagos, erebos, clock, dragon, twins, gorgon, tutorial };
// 冒険の 5つの 階：それぞれ この 中から ランダムに 1つ
export const SLOTS = [['hydra', 'clock'], ['horde', 'dragon'], ['factory', 'slime', 'twins'], ['xenagos', 'gorgon'], ['erebos']];
export const pickFloors = (rng) => SLOTS.map((ids) => ids[Math.floor(rng() * ids.length)]);
