// 番外編「魔法使いの夜」のうごき（名前・コスト・P/T は skel.js、文は docs/EXTRA3_MY.md）
// カウンターが 主役（NP は つかわない）：
//   魔力カウンター（p.mp。game.js の addMP）：青子は ダメージを あたえるたび、有珠は トークンが 出るたび。ためて つかう
//   キーワードカウンター（p.kwc。game.js の addKwCounter）：接死・呪禁・飛行。戦場を はなれるまで その キーワードを もつ
//   消失・時間カウンター（kit.js の vanish）：草十郎は 取りのぞく たびに カウンターを 1つ えらぶ
import { cr, mine, theirs, hit, foeBest, T, foe1, bolt, single, draw, aura, vanish, isCr, chosen1 } from './kit.js';
import { detain, split, biggest } from './set11.js';
import { PICK_FREE } from '../engine/game.js';

// ---- トークン ----
const tok = (def, type, text) => ({ ...def, typeOver: type, textOver: text });
export const MY_T = {
  bird: tok(cr('t_mukudori', '椋鳥（むくどり）', null, 'K', 0, 1, 1, ['プロイ', 'bird'], ['flying'], { muku: true }), 'クリーチャー — プロイ・鳥', '飛行（ひこう）。'),
  doll: tok({ ...cr('t_ningyo', '人形（にんぎょう）', null, '', 0, 1, 1, ['人形']), types: ['artifact', 'creature'] }, 'アーティファクト・クリーチャー — 人形（にんぎょう）', ''),
};
const isPloy = (p) => (p.def.sub || []).includes('プロイ');
const isDoll = (p) => (p.def.sub || []).includes('人形');
const birds = (s, E, side, n = 1) => E.token(s, side, MY_T.bird, n);
const isBird = (q) => !!q.def.muku; // 椋鳥（ふつうの ものも チョコレイトの ものも）
// シックス・スィング・チョコレイトが 出す 椋鳥：食物でも ある（チョコレイトの 鳥。2・タップ・墓地に 置く：ライフ ＋3）。ほかの カードの 椋鳥は ふつうの 椋鳥
MY_T.choco = tok({ ...cr('t_mukudori_c', '椋鳥（むくどり）', null, 'K', 0, 1, 1, ['プロイ', 'bird', 'food'], ['flying'], { muku: true, food: true }), types: ['artifact', 'creature'],
  acts: [{ cost: 2, tap: true, sac: true, when: [1, 2], label: '2・タップ・墓地（ぼち）に置（お）く：3点の ライフを 得（え）る（食物（しょくもつ））', play: (s, p, E, ctx = {}) => (ctx.human || s.P.life <= 8 ? { score: 2, run: () => { E.leave(s, p, 'gy', { died: true }); E.gain(s, 3); E.sba(s); } } : null) }],
}, 'アーティファクト・クリーチャー — プロイ・鳥・食物（しょくもつ）', '飛行（ひこう）。食物（しょくもつ）でも ある。2、タップ、これを 墓地（ぼち）に置（お）く：あなたは 3点のライフを得（え）る。');
const chocoBirds = (s, E, side, n = 1) => E.token(s, side, MY_T.choco, n);
const dolls = (s, E, side, n = 1) => E.token(s, side, MY_T.doll, n);

// ---- グレートスリー（有珠の 大技 だけ。カードでは ない）----
const HOUND = tok(cr('t_wanders', '薔薇（ばら）の猟犬（りょうけん）（ワンダースナッチ）', null, 'KG', 0, 4, 4, ['プロイ', '猟犬'], ['hexproof'], {
  great: true,
  anthem: (s, q, p) => (p === q ? [s[q.side].bf.filter((x) => x !== q && x.def.id === 't_wanders').length, s[q.side].bf.filter((x) => x !== q && x.def.id === 't_wanders').length] : null),
}), 'クリーチャー — プロイ（グレートスリー）', '呪禁（じゅきん）（霧（きり）で ねらわれない）。あなたの ほかの 薔薇（ばら）の猟犬（りょうけん）1体に つき ＋1/＋1 の修整（しゅうせい）を受（う）ける。');
export const GREAT3 = {
  troll: tok(cr('t_thames', '橋（はし）の巨人（きょじん）（テムズトロル）', null, 'KG', 0, 8, 8, ['プロイ', 'giant'], ['trample'], { great: true }), 'クリーチャー — プロイ（グレートスリー）', 'トランプル。'),
  snark: tok(cr('t_flat', '月（つき）の油（あぶら）（フラットスナーク）', null, 'KG', 0, 2, 2, ['プロイ'], [], {
    great: true, anthem: (s, q, p) => (p !== q && p.side === q.side && p.token && isCr(p.def) ? [2, 2] : null),
    grant: (s, q, p) => (p !== q && p.side === q.side && p.token && isCr(p.def) ? ['vigilance', 'lifelink'] : null),
  }), 'クリーチャー — プロイ（グレートスリー）', 'あなたの ほかの トークンは ＋2/＋2 の修整（しゅうせい）を受（う）け、警戒（けいかい）と 絆魂（はんこん）を得（え）る。'),
  hound: HOUND,
};
export const ALICE_MAX = 5;
function greatThree(s, q, E) {
  const side = q.side, k = ['troll', 'snark', 'hound'][Math.floor(s.rng() * 3)];
  E.addMP(s, q, -q.mp);
  E.L(s, `${q.def.name}：グレートスリー！ ${GREAT3[k].name}`);
  if (k === 'hound') { E.leave(s, q, 'gy', { died: true }); E.token(s, side, HOUND, 3); } else E.token(s, side, GREAT3[k]);
  E.sba(s);
}

// ---- 青子：ダメージ（もとは 青子）----
const shoot = (s, E, p, t, n = 1) => {
  if (n <= 0) return;
  if (t === 'face') E.hitTarget(s, 'face', n, p); else if (t && E.onBf(s, t)) { E.target(s, t); E.damage(s, t, n, p); } else return;
  E.sba(s);
};
const autoShot = (s, E, p) => { const b = E.burnTarget(s, 1, { mustHit: true }); if (b) { E.L(s, `${p.def.name}：魔弾（まだん）`); shoot(s, E, p, b.t); } };
// 人が あそぶ とき：あいてを 画面で えらぶ（s.aimQ → ui/battle.js の drainAim）。えらぶ まえに 戦闘・ターンの おわりが 来たら AI の えらびかた
const AIM = {
  tgt: [{ side: 'E', face: true, label: '青子（あおこ）の 魔弾（まだん）：1点を あたえる 相手' }],
  apply: (s, E, [[t]], p) => { E.L(s, `${p.def.name}：魔弾（まだん）`); shoot(s, E, p, t); },
  auto: autoShot,
};
function flushAim(s, p, E) {
  if (!s.aimQ?.length) return;
  const mineQ = s.aimQ.filter((a) => a.src === p.uid);
  s.aimQ = s.aimQ.filter((a) => a.src !== p.uid);
  for (let i = 0; i < mineQ.length && E.onBf(s, p) && !s.over; i++) autoShot(s, E, p);
}
// マジックガンナー：魔力カウンターを ぜんぶ 取りのぞいて、その 数を 割り振る
const takeAll = (s, E, p) => { const n = p.mp || 0; if (n) E.addMP(s, p, -n); p.flags.turn.gun = true; return n; };
const GUNNER = {
  cost: 0, when: [1, 2], label: 'マジックガンナー（魔力（まりょく）カウンターを ぜんぶ つかう）',
  can: (s, p) => (p.mp || 0) > 0 && !p.flags.turn.gun, cantWhy: '魔力（まりょく）カウンターが ない か、この ターンは もう つかった',
  play: (s, p, E, ctx = {}) => {
    const n = p.mp || 0;
    if (!n || p.flags.turn.gun) return null;
    const faceKill = typeof s.E.life === 'number' && n >= s.E.life && s.floor.anyTarget?.(s, E) === 'face';
    const plan = faceKill ? [] : E.divide(s, n, theirs(s, E)).filter((d) => E.need(s, d.t) <= d.n);
    if (!ctx.human && !faceKill && n < 3 && !plan.length) return null; // AI：3こ たまるか、たおせる あいてが いる とき
    return { score: 5 + 2 * n, run: () => {
      let left = takeAll(s, E, p);
      E.L(s, `${p.def.name}：マジックガンナー！ ${left}点を わりふる`);
      for (const d of plan) { const k = Math.min(left, E.onBf(s, d.t) ? E.need(s, d.t) : 0); if (k > 0) { shoot(s, E, p, d.t, k); left -= k; } } // たおすのに いる ぶん だけ。のこりは 下で
      while (left > 0 && !s.over) { const b = E.burnTarget(s, left, { mustHit: true }); if (!b) break; shoot(s, E, p, b.t, left); left = 0; }
    } };
  },
  tgt: [{ side: 'E', face: true, max: 9, divide: (s, p) => p?.mp || 0, label: 'マジックガンナー：魔力（まりょく）カウンターの 数の ダメージを わりふる 相手' }],
  apply: (s, E, [al], x, p) => {
    let left = takeAll(s, E, p);
    E.L(s, `${p.def.name}：マジックガンナー！ ${left}点を わりふる`);
    for (const d of al || []) { const k = Math.min(left, typeof d.n === 'number' ? d.n : left); shoot(s, E, p, d.t, k); left -= k; }
  },
};

// 青子人形の 麻痺カウンターを 置く あいて
const DOLL_AIM = {
  tgt: [{ side: 'E', label: '青子人形（あおこにんぎょう）：麻痺（まひ）カウンターを 置（お）く 敵（てき）の クリーチャー' }],
  apply: (s, E, [[t]]) => { if (t && E.onBf(s, t)) { E.target(s, t); E.addStun(s, t, 1); } },
  auto: (s, E) => { const t = biggest(s, E, (q) => !q.stun) || biggest(s, E); if (t) E.addStun(s, t, 1); },
};
// ---- 草十郎：時間カウンターを 取りのぞく たびに 1つ えらぶ ----
const SOJU_OPTS = (p) => [
  { label: '接死（せっし）カウンター', value: 'deathtouch', disabled: !!p.kwc?.has('deathtouch'), note: p.kwc?.has('deathtouch') ? 'もう ある' : 'ダメージを あたえた クリーチャーを たおす' },
  { label: '呪禁（じゅきん）カウンター', value: 'hexproof', disabled: !!p.kwc?.has('hexproof'), note: p.kwc?.has('hexproof') ? 'もう ある' : 'あいての 呪文（じゅもん）や 能力（のうりょく）で ねらわれない' },
  { label: '＋1/＋1カウンター', value: 'ctr', note: 'パワーと タフネスが 1ずつ ふえる' },
];
const sojuGive = (s, p, E, k) => { if (!E.onBf(s, p)) return; if (k === 'ctr' || !E.addKwCounter(s, p, k)) E.addCounters(s, p, 1); };
function sojuUpkeep(s, p, E) {
  if (!p.time) return;
  p.time--;
  E.L(s, `しょうしつ：${p.def.name}（のこり ${p.time}）`);
  const fin = () => { if (p.time <= 0 && E.onBf(s, p)) { E.leave(s, p, 'gy', { died: true }); E.sba(s); } };
  if (s.ai?.choose && s.ai.aim && !s.swapped && p.side === 'P') { // リアルタイムたいせん（s.ai.aim が false）では AI と おなじ じゅん
    return Promise.resolve(s.ai.choose(s, `${p.def.name}：時間（じかん）カウンターを 取（と）りのぞいた（のこり ${p.time}）`, SOJU_OPTS(p), '<p>カウンターを 1つ えらぶ。</p>')).then((k) => { sojuGive(s, p, E, k); fin(); });
  }
  sojuGive(s, p, E, !p.kwc?.has('deathtouch') ? 'deathtouch' : !p.kwc?.has('hexproof') ? 'hexproof' : 'ctr');
  fin();
}

// ---- よく つかう 形 ----
const toHand = (s, p, E) => { // 死亡したとき 手札に もどる（トークンは きえる。手札の ない 塔の 敵は 墓地の まま）
  const side = s[p.side], i = side.gy.findIndex((c) => c.uid === p.uid);
  if (i < 0 || !side.hand) return;
  side.hand.push(side.gy.splice(i, 1)[0]);
  E.L(s, `${p.def.name} は てふだに もどった`);
};
// あなたの クリーチャー 1体に（AI は いちばん よい 相手）
const own1 = (label, f, score = 4) => ({
  play: (s, E) => { const t = E.bestBuffTarget(s, null); return t ? { score, run: () => { E.target(s, t); f(s, E, t); } } : null; },
  tgt: [{ side: 'P', label }], apply: (s, E, [[t]]) => { if (!t) return; E.target(s, t); f(s, E, t); },
});
const etbP = (f) => ({ etb: (s, p, E, o) => { if (p.side === 'P') return f(s, p, E, o); } });
const aokoOn = (s) => s.P.bf.find((q) => q.def.id === 'MY01');

export const S17 = {
  // ---- 看板の 3人 ----
  MY01: {
    onCast: (s, p, d, E) => {
      if (p.side !== 'P' || isCr(d)) return;
      if (s.ai?.aim && !s.swapped) (s.aimQ ||= []).push({ src: p.uid, ...AIM }); else autoShot(s, E, p);
    },
    onDealt: (s, p, n, t, E) => { if (E.onBf(s, p)) E.addMP(s, p, 1); },
    combatStart: (s, p, E) => flushAim(s, p, E),
    endStep: (s, p, E) => flushAim(s, p, E),
    acts: [GUNNER],
  },
  MY02: {
    onOtherEnter: (s, q, p, E) => { if (p.token && p.side === q.side && E.onBf(s, q)) E.addMP(s, q, 1); },
    onMP: (s, q, E) => { if (q.mp >= ALICE_MAX && E.onBf(s, q)) greatThree(s, q, E); },
  },
  MY03: { vanishing: 3, etb: (s, p) => { p.time = 3; }, upkeep: sojuUpkeep },
  MY04: {
    etb: (s, p, E, o) => { if (!o?.back) dolls(s, E, p.side, 2); }, // 予備の 体で もどった ときは 出さない
    upkeep: (s, p, E) => { dolls(s, E, p.side, 1); },
    // 予備の 体：人形 1体を 墓地に 置いて、戦場に もどる（AI・人とも いつも もどる）
    onDie: (s, p, E) => {
      const side = s[p.side], d = side.bf.find((q) => isDoll(q) && q.token) || side.bf.find(isDoll);
      const i = side.gy.findIndex((c) => c.uid === p.uid);
      if (!d || i < 0) return;
      E.L(s, `${p.def.name}：予備（よび）の 体。${d.def.name}を 墓地（ぼち）に 置（お）いて もどる`);
      E.leave(s, d, 'gy', { died: true });
      const [c] = side.gy.splice(side.gy.findIndex((x) => x.uid === p.uid), 1);
      E.enter(s, p.side, c.def, { card: c.def, back: true });
    },
  },
  MY05: { minBlockPow: 3 },
  // ---- プロイ ----
  MY06: {
    anthem: (s, q, p) => (p !== q && p.side === q.side && isCr(p.def) && isPloy(p) ? [1, 1] : null),
    onAttack: (s, p, E) => { if (p.side === 'P') birds(s, E, 'P', 1); },
  },
  MY07: etbP((s, p, E) => {
    const n = E.rollDie(s);
    if (n <= 3) {
      E.L(s, `${p.def.name}：ブタの すがた`);
      E.addCounters(s, p, 1);
      const t = biggest(s, E, (q) => !q.frozen);
      if (t) detain(s, E, t);
    } else {
      E.L(s, `${p.def.name}：鳥（とり）の すがた`);
      E.addKwCounter(s, p, 'flying');
      birds(s, E, 'P', 1);
    }
    return s.ai?.dice?.([n]);
  }),
  MY08: vanish(2, { onDie: (s, p, E) => { E.L(s, `${p.def.name}：おちて ばくはつ！`); for (const t of [...E.creatures(s, p.side === 'P' ? 'E' : 'P')]) E.damage(s, t, 2, null); E.sba(s); } }),
  // 空蝉：game.js の leave（def.standIn）。トークンでない ほかの クリーチャーの かわりに 墓地へ
  MY09: { standIn: (s, q, p, E) => !p.token && E.isCreature(p), onDie: toHand },
  MY10: {
    etb: (s, p, E) => { chocoBirds(s, E, p.side, 2); },
    acts: [
      { cost: 2, tap: true, when: [1, 2], label: '2・タップ：椋鳥（むくどり）トークン（食物（しょくもつ）でも ある）を 1体 出す', play: (s, p, E) => ({ score: 3, run: () => chocoBirds(s, E, 'P', 1) }) },
      {
        cost: 0, when: [1, 2], label: '椋鳥（むくどり）1体を 墓地（ぼち）に置（お）く：ライフ ＋2',
        can: (s, p) => s[p.side].bf.some(isBird), cantWhy: '椋鳥（むくどり）が いない',
        play: (s, p, E, ctx = {}) => { const b = s.P.bf.find((q) => isBird(q) && !q.def.food) || s.P.bf.find(isBird); return b && (ctx.human || s.P.life <= 6) ? { score: 2, run: () => { E.leave(s, b, 'gy', { died: true }); E.gain(s, 2); E.sba(s); } } : null; },
      },
    ],
  },
  MY11: { onDie: (s, p, E) => { birds(s, E, p.side, 1); } },
  MY12: {
    tgt: [{ side: 'P', min: 0, label: '呪禁（じゅきん）カウンターを 置（お）く あなたの クリーチャー' }],
    etb: (s, p, E, o) => { if (p.side !== 'P') return; let t = chosen1(o); if (t === undefined) t = E.bestBuffTarget(s, null); if (t && E.onBf(s, t)) { E.target(s, t); E.addKwCounter(s, t, 'hexproof'); } },
    onOtherEnter: (s, q, p, E) => { if (q.side === 'P' && p.side === 'P' && isPloy(p)) E.gain(s, 1); },
  },
  MY13: {
    etb: (s, p, E) => { if (p.side !== 'P') return; for (const t of theirs(s, E)) detain(s, E, t); },
    foeAnthem: () => [-1, 0],
  },
  MY14: { etb: (s, p, E) => { birds(s, E, p.side, 1); } },
  // ---- 橙子の 人形・ルーン ----
  MY16: { onDie: (s, p, E) => { dolls(s, E, p.side, 1); } },
  MY17: { onDie: toHand },
  MY18: { onDie: (s, p, E) => { dolls(s, E, p.side, 2); } },
  MY19: bolt(2),
  MY20: foe1('タップする クリーチャー（次（つぎ）も おきない）', (s, E, t) => detain(s, E, t), { score: 2 }),
  MY21: own1('＋1/＋1カウンターと 接死（せっし）カウンターを 置（お）く クリーチャー', (s, E, t) => { E.addCounters(s, t, 1); E.addKwCounter(s, t, 'deathtouch'); }, 5),
  // ---- 三咲の 面々 ----
  MY22: etbP((s, p, E) => { E.token(s, 'P', T.treasure, 1); }),
  MY24: etbP((s, p, E) => { E.gain(s, 3); }),
  // 文柄詠梨：攻撃するたび、この ターンに ライフを 回復して いたら 敵の クリーチャー 1体を 追放（人は 攻撃の まえに えらぶ。AI は いちばん ねらいたい 敵）
  MY26: {
    trigTgt: { on: 'attack', label: '追放（ついほう）する 敵（てき）の クリーチャー', when: (s, p, E) => E.gainedNow(s) > 0 },
    onAttack: (s, p, E) => {
      if (p.side !== 'P') return;
      const pick = E.takePick(s, p);
      if (!(E.gainedNow(s) > 0)) return;
      const t = pick && pick !== 'face' ? pick : foeBest(s, E)?.t;
      if (t && E.onBf(s, t)) { E.L(s, `${p.def.name}：この ターンに ライフを 回復（かいふく）した → ${t.def.name}を 追放（ついほう）`); E.target(s, t); E.exile(s, t); E.sba(s); }
    },
  },
  MY28: etbP((s, p, E) => { E.gain(s, 2); }),
  MY31: etbP((s, p, E) => { E.hitEnemy(s, 1, p); }),
  // ---- 呪文 ----
  MY35: split(3),
  MY36: { play: (s, E) => ({ score: aokoOn(s) ? 14 : 8, run: () => { E.drawCard(s, 2); const a = aokoOn(s); if (a) { E.drawCard(s, 1); E.addMP(s, a, 3); } } }) },
  MY37: { play: (s, E, ctx) => ({ score: (s.P.life <= 12 ? 6 : 3) - (ctx.phase === 1 ? 1 : 0), run: () => { E.gain(s, 4); E.drawCard(s); } }) },
  MY38: { ...aura('E', 'コントロールを える パワー 3 いかの てきの クリーチャー', { filter: (s, E, p) => E.power(s, p) <= 3 && (!E.stealable || E.stealable(s, p)) }), steal: true },
  // 星が瞬くこんな夜に：青子か 有珠が いるかぎり、手札の カードの コストは 0（game.js の freeCast）。1・タップ：増殖
  MY39: {
    castFree: (s, q) => s[q.side].bf.some((x) => x.def.id === 'MY01' || x.def.id === 'MY02'),
    acts: [{
      cost: 1, tap: true, when: [1, 2], label: '1・タップ：増殖（ぞうしょく）する',
      play: (s, p, E, ctx = {}) => { const n = s.P.bf.filter((q) => q.ctr > 0 || q.mp > 0 || q.time > 0 || q.loy > 0).length + theirs(s, E).filter((t) => t.mctr > 0 || t.stun > 0).length; return n || ctx.human ? { score: 2 + 2 * n, run: () => E.proliferate(s) } : null; },
    }],
  },
  MY40: single(2, 2),
  MY41: own1('呪禁（じゅきん）カウンターを 置（お）く クリーチャー', (s, E, t) => { E.addKwCounter(s, t, 'hexproof'); E.drawCard(s); }, 4),
  MY42: foe1('てふだに もどす（てきは やまふだの 上へ）クリーチャー', (s, E, t) => { E.bounce(s, t); E.sba(s); }, { score: 1 }),
  MY43: foe1('−1/−1カウンターを 2こ 置（お）く クリーチャー', (s, E, t) => { if (t && E.onBf(s, t)) { E.addMinus(s, t, 2); E.sba(s); } }, { n: 2 }),
  MY44: single(2, 0, { kw: ['first'] }),
  MY45: { play: (s, E, ctx) => { const n = theirs(s, E).length; return n || ctx.human ? { score: 2 + 3 * n, run: () => { const k = aokoOn(s) ? 3 : 2; for (const t of [...theirs(s, E)]) E.damage(s, t, k, null); E.sba(s); } } : null; } }, // 青子が いれば 3点
  MY46: foe1('4点を あたえる クリーチャー', (s, E, t) => hit(s, E, t, 4), { n: 4 }),
  MY47: { play: (s, E) => ({ score: 5, run: () => E.token(s, 'P', T.human, 2) }) },
  MY48: own1('＋1/＋1カウンターを 2こ 置（お）く クリーチャー', (s, E, t) => E.addCounters(s, t, 2), 5),
  MY49: own1('接死（せっし）カウンターを 置（お）く クリーチャー', (s, E, t) => { E.addKwCounter(s, t, 'deathtouch'); E.pump(t, 1, 1); }, 3),
  // ---- 魔力カウンターの 道具 ----
  MY50: { upkeep: (s, p, E) => { if (p.side !== 'P') return; for (const q of [...mine(s, E)]) if (q.mp > 0 && E.onBf(s, q)) E.addMP(s, q, 1); } },
  MY51: { acts: [{
    cost: 0, tap: true, when: [1, 2], label: 'タップ：魔力（まりょく）カウンターを 1個（こ）置（お）く',
    play: (s, p, E) => { const t = mine(s, E).find((q) => q.def.onMP || q.def.id === 'MY01') || (mine(s, E).some((q) => q.mp > 0) ? mine(s, E).find((q) => q.mp > 0) : null); return t ? { score: 3, run: () => E.addMP(s, t, 1) } : null; },
    tgt: [{ side: 'P', label: '魔力（まりょく）カウンターを 置（お）く あなたの クリーチャー' }], apply: (s, E, [[t]]) => { if (t) E.addMP(s, t, 1); },
  }] },
  // 青子人形：ターンの はじめに 敵の クリーチャー 1体と じぶんに 麻痺カウンター。死亡したとき、のって いた 数の ダメージ
  // 人は 画面で あいてを えらぶ（s.aimQ）。AI は まだ 麻痺して いない、パワーが いちばん 大きい 敵
  MY55: {
    upkeep: (s, p, E) => {
      if (p.side !== 'P') return;
      E.addStun(s, p, 1);
      if (!theirs(s, E).length) return;
      if (s.ai?.aim && !s.swapped) (s.aimQ ||= []).push({ src: p.uid, ...DOLL_AIM }); else DOLL_AIM.auto(s, E, p);
    },
    onDie: (s, p, E) => {
      const n = p.stun || 0; if (!n) return;
      E.L(s, `${p.def.name}：麻痺（まひ）カウンター ${n}こ → ${n}点`);
      // 敵（本体）へ。本体の ない 階（ハイドラ など）は、いつもの「敵に N点」（AI が えらぶ）
      if (p.side !== 'P') E.hurt(s, n); else if (s.floor.faceValue && s.floor.faceValue(s, n, E) > 0) E.hitTarget(s, 'face', n, null); else E.hitEnemy(s, n, null);
      E.sba(s);
    },
  },
  // ---- 舞台 ----
  MY52: {
    anthem: (s, q, p) => (p.side === q.side && isCr(p.def) && isPloy(p) ? [1, 1] : null),
    upkeep: (s, p, E) => { if (p.side === 'P' && !s.P.bf.some((q) => q.token)) birds(s, E, 'P', 1); },
  },
  MY53: { mana: 'any' },
  MY54: { onAttacks: (s, q, atk, E) => { if (q.side !== 'P' || !atk.length) return; E.L(s, `${q.def.name}：花火（はなび）！`); E.hitEnemy(s, 2, null); } },
};
// 1体を タップ（ルーン「イサ」）は コモンでも じぶんで えらぶ（docs/REMOVAL.md 4.1 と おなじ）
PICK_FREE.add('MY20');
PICK_FREE.add('MY55');
PICK_FREE.add('MY26'); // 追放する あいても じぶんで えらぶ（じょうけんつき） // 麻痺カウンターを 置く あいても じぶんで えらぶ
