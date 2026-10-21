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
  [1, ecr('貪欲で粗暴な頭', 0, 4, ['head'], [], { head: true, headDmg: 2, noBlock: true, reward: (s, p, E) => E.drawCard(s) })],
  [1, ecr('野蛮で活力ある頭', 0, 3, ['head'], [], { head: true, headDmg: 2, noBlock: true, anthem: (s, q, p) => (p !== q && p.def.head ? [0, 1] : null), reward: (s, p, E) => E.gain(s, 3) })],
  [1, ecr('噛み付く牙の頭', 0, 3, ['head'], [], { head: true, headDmg: 2, fang: true, noBlock: true, reward: (s, p, E) => E.drawCard(s) })],
  [1, ecr('金切り声の巨大な頭', 0, 5, ['head'], [], { head: true, headDmg: 2, taunt: true, noBlock: true, reward: (s, p, E) => { E.gain(s, 3); E.drawCard(s); } })],
  [2, esp('一斉突進', (s) => { s.E.flags.turn.extra = (s.E.flags.turn.extra || 0) + 1; }, { danger: 3 })],
  [2, esp('有毒なハイドラの息', (s, E) => { for (const p of pc(s, E)) E.damage(s, p, 1, null); E.sba(s); }, { danger: 3 })],
  [2, esp('混乱する睨み', (s, E) => { const t = biggest(s, E); if (t) t.tapped = true; })],
  [2, esp('付け根から新生', (s, E) => { const i = s.E.gy.findIndex((c) => c.def.head); if (i >= 0) { const [c] = s.E.gy.splice(i, 1); E.enter(s, 'E', c.def); } }, { danger: 4 })],
  [1, esp('貫通不能なハイドラの皮', (s, E) => { for (const p of s.E.bf) if (p.def.head) p.flags.indTurns = 2; }, { danger: 3 })],
  [1, esp('英雄への かみつき', (s, E) => { const t = biggest(s, E, (p) => p.tapped); if (t) E.destroy(s, t); E.sba(s); }, { danger: 4 })],
  [1, esp('頭二つの はさみうち', (s, E) => { const t = weakest(s, E); if (t) E.damage(s, t, 3, null); E.sba(s); }, { danger: 3 })],
  [1, esp('絡みつく首', (s, E) => { const t = biggest(s, E); if (t) { t.tapped = true; t.frozen = true; } })],
  [3, esp('ハイドラ陽動作戦', (s) => { s.E.flags.turn.noDmg = true; }, { danger: 0 })],
  [1, esp('弱点への一撃', (s, E) => { const b = E.burnTarget(s, 3, { creatureOnly: true, mustHit: true }); if (b) E.damage(s, b.t, 3, null); E.sba(s); }, { danger: 0 })],
];

// 頭の階（1階・5階の段階1）で共通の部品
const headsFloor = {
  headTurn(s, E, dmgBonus = 0) {
    if (s.over) return;
    let total = 0;
    for (const p of s.E.bf) if (p.def.head && !p.tapped) {
      total += p.def.headDmg + dmgBonus + (s.E.flags.turn.extra || 0);
      if (p.def.fang) { const t = biggest(s, E); if (t) E.damage(s, t, 1, null); }
    }
    if (s.E.flags.turn.noDmg) total = 0;
    if (total > 0 && E.ask(s)) total -= 1; // 「つぎに うける ダメージは？」
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
    setup(s, E) {
      const n = DIFF(s, 1, 2, 2);
      const defs = build(HYDRA_DECK);
      for (let i = 0; i < n; i++) { defs.splice(defs.indexOf(HEAD), 1); E.enter(s, 'E', HEAD); }
      for (const p of s.E.bf) p.sick = false;
      s.E.lib = toLib(s, E, defs);
    },
    enemyTurn(s, E) {
      for (const p of s.E.bf) if (p.flags.indTurns) p.flags.indTurns--;
      E.reveal(s, 1);
      headsFloor.headTurn(s, E);
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
  [6, mino('ミノタウルスの 若角', 2, 1)],
  [3, mino('ミノタウルスの 獲物探し', 3, 2)],
  [3, mino('フォベロスの 暴れ者', 2, 3, { onAttackE: (s, p, E) => E.pump(p, 1, 0) })],
  [2, mino('モーギスに 選ばれし者', 5, 4)],
  [1, mino('無謀なミノタウルス', 4, 3, { reckless: true })],
  [1, esp('有角神の接触', (s) => { s.E.flags.turn.deathtouch = true; }, { danger: 3 })],
  [1, esp('抑え難い憤怒', (s, E) => { for (const p of minos(s)) E.pump(p, 1, 0); }, { danger: 3 })],
  [1, esp('獲物への襲撃', (s, E) => { for (const p of minos(s)) E.pump(p, 0, 0, ['first']); }, { danger: 3 })],
  [1, esp('破壊的な激怒', (s, E) => { const t = minos(s).sort((a, b) => E.power(s, b) - E.power(s, a))[0]; if (t) E.pump(t, 3, 0, ['trample']); }, { danger: 4 })],
  [1, esp('ケラノスの介入', (s, E) => { for (const p of [...pc(s, E), ...E.creatures(s, 'E')]) E.damage(s, p, 3, null); E.sba(s); }, { danger: 4 })],
  [1, eart('モーギスの 祭壇', { altar: true, prio: 8, reward: (s, p, E) => { for (const m of minos(s).slice(0, 2)) E.leave(s, m, 'gy'); } })],
  [1, eart('戦のトーテム像', { totem: true, prio: 4, reward: (s, p, E) => E.gain(s, 3) })],
  [1, eart('略奪された像', { prio: 4, reward: (s, p, E) => E.drawCard(s) })],
  [1, eart('清々しい霊薬', { prio: 5, reward: (s, p, E) => E.gain(s, 5) })],
];

export function horde() {
  return {
    id: 'horde', name: '2階 大群', faceUnit: 1,
    setup(s, E) {
      s.E.lib = toLib(s, E, build(HORDE_DECK));
      s.E.extraTurns = DIFF(s, 2, 2, 2);
    },
    enemyTurn(s, E) {
      for (const p of s.E.bf) if (p.def.totem) { const t = weakest(s, E); if (t) { E.damage(s, t, 1, null); E.sba(s); } }
      s.E.flags.hordeTurn = (s.E.flags.hordeTurn || 0) + 1;
      const n = DIFF(s, 1, 1, 1 + (s.E.flags.hordeTurn % 2)) + s.E.bf.filter((p) => p.def.altar).length; // むずかしい：1枚と2枚を交互に
      E.reveal(s, n);
      if (s.over) return;
      const atk = attackers(s, E, (p) => p.def.attacks);
      if (s.E.flags.turn.deathtouch) for (const p of atk) E.pump(p, 0, 0, ['deathtouch']);
      for (const p of atk) p.def.onAttackE?.(s, p, E);
      E.enemyAttack(s, atk);
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
const golem = (name, pow, tou, x = {}) => ({ ...ecr(name, pow, tou, ['golem'], [], { attacks: true, ...x }), types: ['artifact', 'creature'] });
const FACTORY = eart('ゴーレム工場', { factory: true });
const FACTORY_DECK = [
  [5, golem('鉄の ゴーレム', 3, 3, { reward: (s) => { s.E.key = Math.max(2, s.E.key - 1); } })],
  [1, golem('大ゴーレム', 5, 5, { reward: (s) => { s.E.key = Math.max(2, s.E.key - 2); } })],
  [1, golem('歯車の 番人', 0, 5, { attacks: false, guard: true, reward: (s, p, E) => E.gain(s, 2) })],
  [1, esp('修理の 火花', (s) => { s.E.key = Math.min(9, s.E.key + 1); })],
  [2, esp('鍵の かけかえ', (s) => { s.E.key = 3 + 1 + Math.floor(s.rng() * 6); })],
  [2, esp('増産', (s, E) => E.token(s, 'E', GOLEM))],
  [1, esp('ゴーレムの 突撃', (s) => { s.E.flags.turn.golemPump = 1; })],
  [2, esp('稼働停止', (s) => { s.E.flags.turn.halt = true; }, { danger: 0 })],
  [1, esp('点検', (s) => { s.E.flags.inspect = true; }, { danger: 0 })],
];

export function factory() {
  const exact = (s, n) => n === s.E.key;
  return {
    id: 'factory', name: '3階 ゴーレム工場',
    setup(s, E) {
      E.enter(s, 'E', FACTORY);
      s.E.key = DIFF(s, 4, 6, 7);
      s.E.lib = toLib(s, E, build(FACTORY_DECK));
    },
    enemyTurn(s, E) {
      if (s.E.flags.inspect) s.E.flags.inspect = false;
      else if (s.E.bf.filter((p) => p.def.golem).length < 2) E.token(s, 'E', GOLEM);
      E.reveal(s, 1);
      if (s.over || s.E.flags.turn.halt) return;
      const atk = attackers(s, E, (p) => p.def.attacks);
      if (s.E.flags.turn.golemPump) for (const p of atk) E.pump(p, 1, 0);
      E.enemyAttack(s, atk);
    },
    cantLeave: (s, p) => p.def.factory && !s.E.flags.broken,
    onDamaged(s, p, n) {
      if (!p.def.factory) return;
      if (s.combat) s.combat.factory += n;
      else if (exact(s, n)) { s.E.flags.broken = true; s.over = 'win'; }
    },
    afterCombat(s, E) {
      if (!s.combat.factory) return;
      E.L(s, `工場に ${s.combat.factory}点（鍵 ${s.combat.key}）`);
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
  [3, esp('ねばねばの 床', (s, E) => { const t = biggest(s, E); if (t) t.tapped = true; })],
  [1, esp('酸の しぶき', (s, E) => { for (const p of pc(s, E)) E.damage(s, p, 1, null); E.sba(s); }, { danger: 3 })],
  [3, esp('日照り', (s, E) => { for (const p of s.E.bf.filter((q) => q.def.slime)) E.damage(s, p, 1, null); E.sba(s); }, { danger: 0 })],
];

export function slime() {
  return {
    id: 'slime', name: '3階 ふえるスライム',
    setup(s, E) {
      const n = DIFF(s, 3, 4, 5);
      E.enter(s, 'E', slimeDef(n)); // 最初のターンは攻撃しない
      s.E.lib = toLib(s, E, build(SLIME_DECK));
    },
    enemyTurn(s, E) {
      E.reveal(s, 1);
      if (s.over || !s.E.flags.started) { s.E.flags.started = true; return; } // 最初のターンは攻撃しない
      E.enemyAttack(s, attackers(s, E, (p) => p.def.attacks));
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
const XEN = ecr('覚醒したゼナゴス', 6, 5, ['god'], [], { xenagos: true, noBlock: true, noCopy: true });
const rev = (name, pow, tou, kw = [], x = {}) => ecr(name, pow, tou, ['satyr', 'reveler'], kw, { reveler: true, ...x });
const THRONG = rev('お祭り騒ぎの群れ', 3, 3);
const revelers = (s) => s.E.bf.filter((p) => p.def.reveler);
const XEN_DECK = [
  [2, THRONG],
  [5, rev('高揚した笛吹き', 2, 2, [], { etb: (s) => { const x = s.E.bf.find((p) => p.def.xenagos); if (x) x.flags.mustAttack = true; }, reward: (s, p, E) => E.gain(s, 2) })],
  [2, rev('フィーリーズ団の歓楽者', 3, 3, [], { etb: (s, p, E) => { const t = weakest(s, E); if (t) { E.damage(s, t, 1, null); } }, reward: (s, p, E) => E.drawCard(s) })],
  [1, rev('怒り狂えるオリアード', 3, 2, [], { attacks: true })],
  [1, rev('荒ぶるマエナード', 4, 4)],
  [1, rev('蛇の踊り手', 2, 3, ['deathtouch'])],
  [3, esp('突発的な突進', (s) => { for (const p of revelers(s)) p.flags.mustAttack = true; }, { danger: 3 })],
  [2, esp('ゼナゴスの一撃', (s, E) => E.hurt(s, 3), { danger: 3 })],
  [1, esp('突発的な復活', (s, E) => { const i = s.E.gy.findIndex((c) => c.def.reveler); if (i >= 0) { const [c] = s.E.gy.splice(i, 1); E.enter(s, 'E', c.def); } }, { danger: 4 })],
  [1, esp('力まかせの 一撃', (s, E) => { const t = biggest(s, E); if (t) E.damage(s, t, 4, null); E.sba(s); }, { danger: 4 })],
  [1, esp('ゼナゴスの嘲笑', (s) => { s.E.flags.scorn = true; })],
  [1, eart('恐慌の踊り', { panic: true, types: ['enchantment'] })],
  [1, eart('炎の踊り', { types: ['enchantment'], onOtherLeave: (s, q, p, E, o) => { if (p.def.reveler && o.died) E.hurt(s, 1); } })],
];

export function xenagos() {
  return {
    id: 'xenagos', name: '4階 ゼナゴス',
    setup(s, E) {
      E.enter(s, 'E', XEN);
      for (let i = 0; i < DIFF(s, 1, 2, 3); i++) E.enter(s, 'E', THRONG);
      for (const p of s.E.bf) p.sick = false;
      s.E.lib = toLib(s, E, build(XEN_DECK));
    },
    enemyTurn(s, E) {
      E.reveal(s, 1);
      if (s.over) return;
      const panic = s.E.bf.some((p) => p.def.panic) && revelers(s).length >= 5;
      const atk = s.E.bf.filter((p) => E.isCreature(p) && !p.tapped && (p.flags.mustAttack || p.def.attacks || (panic && p.def.reveler)) && (!p.sick || panic));
      E.enemyAttack(s, atk);
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
  [2, esp('冥界の遠吠え', (s) => { s.E.flags.turn.extra = (s.E.flags.turn.extra || 0) + 1; }, { danger: 3 })],
  [2, esp('冥界の炎の息', (s, E) => { const t = biggest(s, E); if (t) E.damage(s, t, 3, null); E.sba(s); }, { danger: 3 })],
  [1, esp('黄泉の門', (s, E) => { const i = s.E.gy.findIndex((c) => c.def.head); if (i >= 0) { const [c] = s.E.gy.splice(i, 1); E.enter(s, 'E', c.def); } }, { danger: 4 })],
  [2, esp('眠りの歌', (s) => { s.E.flags.turn.noDmg = true; }, { danger: 0 })],
];
const EREBOS = ecr('死者の神 エレボス', 5, 7, ['god'], ['indestructible'], { erebos: true, noBlock: true, noCopy: true });
const minion = (name, pow, tou, x = {}) => ecr(name, pow, tou, ['zombie'], [], { minion: true, ...x });
const PHALANX = minion('帰還したファランクス', 0, 4, { attacks: false });
const minions = (s) => s.E.bf.filter((p) => p.def.minion);
const P2_DECK = [
  [2, PHALANX],
  [2, minion('アスフォデルの 灰色商人', 2, 4, { etb: (s, p, E) => E.hurt(s, minions(s).length), reward: (s, p, E) => E.drawCard(s) })],
  [3, minion('冥界の 兵', 2, 2, { attacks: true, reward: (s, p, E) => E.gain(s, 2) })],
  [2, esp('死者の招集', (s, E) => { const i = s.E.gy.findIndex((c) => c.def.minion); if (i >= 0) { const [c] = s.E.gy.splice(i, 1); E.enter(s, 'E', c.def); } }, { danger: 4 })],
  [1, esp('冥界の霧', (s, E) => { for (const p of pc(s, E)) E.damage(s, p, 1, null); E.sba(s); }, { danger: 3 })],
  [1, esp('眠りの歌', (s) => { s.E.flags.turn.halt = true; }, { danger: 0 })],
];
const P3_DECK = [
  [3, ecr('冥界の 兵', 2, 2, ['zombie'], [], { attacks: true })],
  [1, ecr('エレボスの 巨人', 5, 5, ['giant'], [], { attacks: true })],
  [2, esp('エレボスの 裁き', (s, E) => { const t = biggest(s, E); if (t) E.destroy(s, t); E.sba(s); }, { danger: 5 })],
  [2, esp('命の 代価', (s, E) => E.hurt(s, 3), { danger: 3 })],
  [2, esp('墓地からの 呼び声', (s, E) => {
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
      s.E.life = DIFF(s, 15, 30, 35);
      s.P.noLifeGain = true;
      s.E.lib = toLib(s, E, build(P3_DECK));
    }
    for (const p of s.E.bf) p.sick = false;
  };
  return {
    id: 'erebos', name: '5階 エレボス',
    get faceUnit() { return 1.5; },
    setup(s, E) {
      s.phase = 1; s.stats.phase = 1;
      const n = DIFF(s, 1, 1, 1);
      const defs = build(P1_DECK);
      for (let i = 0; i < n; i++) E.enter(s, 'E', CERB);
      for (const p of s.E.bf) p.sick = false;
      s.E.lib = toLib(s, E, defs);
    },
    enemyTurn(s, E) {
      if (s.phase === 1) { E.reveal(s, 1); headsFloor.headTurn(s, E); return; }
      if (s.phase === 2) {
        E.reveal(s, DIFF(s, 1, 2, 2));
        if (s.over || s.E.flags.turn.halt) return;
        E.enemyAttack(s, attackers(s, E, (p) => p.def.attacks));
        return;
      }
      E.hurt(s, DIFF(s, 2, 3, 3)); // エレボス：死者の神のターンのはじめに ライフを失う
      if (s.over) return;
      E.reveal(s, DIFF(s, 1, 2, 2));
      if (s.over) return;
      const rest = s.E.flags.erebosRest; s.E.flags.erebosRest = false;
      E.enemyAttack(s, attackers(s, E, (p) => p.def.attacks || (p.def.erebos && !rest)));
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

export const FLOORS = { hydra, horde, factory, slime, xenagos, erebos };
