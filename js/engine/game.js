// ルールエンジン（画面と分離。シミュレーションでも本番でも使う）
// プレイヤー（P）とチャレンジ・デッキの敵（E）の1戦ぶん。判断は s.ai（ai.js）、各階のルールは s.floor（data/enemies.js）
import { seeded, shuffle } from './rng.js';

let UID = 1;
export const COLORS = ['W', 'U', 'G', 'R'];
export const colorsOf = (d) => [...(d.color || '')].filter((c) => COLORS.includes(c));
export const is = (p, t) => (p.def.types || []).includes(t);
export const isCreature = (p) => is(p, 'creature');
export const onBf = (s, p) => s[p.side].bf.includes(p);
export const card = (def) => ({ uid: UID++, def });

// カードの効果・各階のルールから使う関数をまとめたもの（ai.js がAI用の関数を足す）
export const api = {};

export function newGame({ deck, floor, diff = 'normal', seed = 1, mathRate = 0.7, reshuffle = true, ai, log = false }) {
  const rng = seeded(seed);
  const s = {
    rng, diff, mathRate, reshuffle, ai, logOn: log, logs: [],
    turn: 0, active: 'P', over: null, floor, phase: 1, combat: null,
    P: { side: 'P', life: 20, lib: shuffle(rng, deck.map((d) => card(d))), hand: [], mana: [], bf: [], gy: [], exile: [], noLifeGain: false, flags: {} },
    E: { side: 'E', lib: [], bf: [], gy: [], exile: [], life: 0, key: 0, extraTurns: 0, flags: {} },
    stats: { asked: 0, ok: 0, playerTurns: 0, lifeLost: 0, reshuffled: 0 },
  };
  floor.setup(s, api);
  for (let i = 0; i < 5; i++) drawCard(s);
  return s;
}

export function L(s, msg) { if (s.logOn) s.logs.push(`[${s.turn}${s.active}] ${msg}`); }

// ---- 1戦の流れ ----
export function play(s, maxTurns = 40) {
  while (!s.over) {
    playerTurn(s);
    if (s.over) break;
    if (s.stats.playerTurns >= maxTurns) { s.over = 'timeout'; break; }
    if (s.E.extraTurns > 0) { s.E.extraTurns--; continue; }
    enemyTurn(s);
  }
  return s;
}

function playerTurn(s) {
  const P = s.P;
  s.turn++; s.active = 'P'; s.stats.playerTurns++;
  P.flags.enteredLastTurn = P.flags.enteredThisTurn; P.flags.enteredThisTurn = false;
  P.flags.cast = 0; P.flags.charged = false;
  for (const c of P.hand) c.locked = false;
  for (const p of P.bf) { if (p.frozen) p.frozen = false; else p.tapped = false; p.sick = false; p.flags.turn = {}; }
  for (const m of P.mana) m.tapped = false;
  s.floor.playerUpkeep?.(s, api);
  for (const p of [...P.bf]) if (onBf(s, p) && p.def.upkeep) p.def.upkeep(s, p, api);
  sba(s); if (s.over) return;
  if (s.stats.playerTurns > 1) drawCard(s);
  s.ai.main(s, 1); if (s.over) return;
  combatPlayer(s); if (s.over) return;
  s.ai.main(s, 2); if (s.over) return;
  for (const p of [...P.bf]) if (onBf(s, p) && p.def.endStep) p.def.endStep(s, p, api);
  endTurn(s);
}

function enemyTurn(s) {
  s.turn++; s.active = 'E';
  for (const p of s.E.bf) { if (p.frozen) p.frozen = false; else p.tapped = false; p.sick = false; }
  s.E.flags.turn = {};
  s.floor.enemyTurn(s, api);
  if (!s.over) endTurn(s);
}

function endTurn(s) {
  s.floor.endTurn?.(s, api);
  for (const side of ['P', 'E']) for (const p of s[side].bf) {
    p.dmg = 0; p.dt = false; p.mP = 0; p.mT = 0; p.kwT.clear(); p.base2 = false; p.flags.mustAttack = false;
  }
  sba(s);
  if (!s.over) s.floor.check?.(s, api, 'end');
}

// ---- ゾーン ----
export function drawCard(s, n = 1) {
  const P = s.P;
  for (let i = 0; i < n; i++) {
    if (!P.lib.length) {
      if (s.reshuffle && P.gy.length) { P.lib = shuffle(s.rng, P.gy.splice(0)); s.stats.reshuffled++; L(s, '墓地をライブラリーにもどした'); }
      else if (!s.reshuffle) { s.over = 'lose'; s.stats.deckout = true; return; }
      else return;
    }
    P.hand.push(P.lib.shift());
  }
}

export function rampTop(s) {
  if (!s.P.lib.length) return;
  const c = s.P.lib.shift();
  s.P.mana.push({ ...c, tapped: true });
}

export function charge(s, c, tapped = colorsOf(c.def).length > 1) {
  s.P.hand.splice(s.P.hand.indexOf(c), 1);
  s.P.mana.push({ ...c, tapped });
  L(s, `マナ：${c.def.name}`);
}

// ---- パーマネント ----
function makePerm(side, def, o = {}) {
  return {
    uid: UID++, def, card: o.card || def, side, tapped: !!o.tapped, sick: true, ctr: o.ctr || 0, dmg: 0, dt: false,
    mP: 0, mT: 0, kwT: new Set(), frozen: false, token: !!o.token, monstrous: false, attached: null, links: [], flags: { turn: {} },
  };
}

export function enter(s, side, def, o = {}) {
  const p = makePerm(side, def, o);
  s[side].bf.push(p);
  L(s, `${side === 'P' ? '' : '敵：'}${def.name} が戦場に出た`);
  if (def.etb) def.etb(s, p, api, o);
  if (!onBf(s, p)) return p;
  if (isCreature(p)) {
    if (side === 'P') s.P.flags.enteredThisTurn = true;
    const [a, b] = pt(s, p);
    for (const q of s[side].bf) if (q !== p && hasKw(s, q, 'evolve')) { const [c, d] = pt(s, q); if (a > c || b > d) addCounters(s, q, 1); }
  }
  for (const q of [...s[side].bf]) if (q !== p && onBf(s, q) && q.def.onOtherEnter) q.def.onOtherEnter(s, q, p, api);
  s.floor.onEnter?.(s, p, api);
  sba(s);
  return p;
}

// 戦場のクリーチャーは各陣営 MAX_CREATURES 体まで（画面に並べられる数）。こえるトークンは出ない
export const MAX_CREATURES = 30;
export function token(s, side, def, n = 1, o = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (s[side].bf.filter(isCreature).length >= MAX_CREATURES) break;
    out.push(enter(s, side, def, { ...o, token: true }));
  }
  return out;
}

export function pt(s, p) {
  const d = p.def;
  let P = typeof d.pow === 'function' ? d.pow(s, p, api) : (d.pow ?? 0);
  let T = typeof d.tou === 'function' ? d.tou(s, p, api) : (d.tou ?? 0);
  if (p.base2) P = 2;
  P += p.ctr + p.mP; T += p.ctr + p.mT;
  for (const q of s[p.side].bf) {
    if (q.def.anthem) { const r = q.def.anthem(s, q, p, api); if (r) { P += r[0]; T += r[1]; } }
    if (q.attached === p.uid) { P += q.def.eqP || 0; T += q.def.eqT || 0; }
  }
  return [P, T];
}
export const power = (s, p) => pt(s, p)[0];
export const need = (s, p) => (hasKw(s, p, 'indestructible') || s.floor.cantLeave?.(s, p)) ? Infinity : Math.max(0, pt(s, p)[1] - p.dmg);

export function hasKw(s, p, k) {
  if (p.def.kw?.includes(k) || p.kwT.has(k)) return true;
  if (p.def.kwFn?.(s, p, api)?.includes(k)) return true;
  for (const q of s[p.side].bf) if (q.def.grant) { const g = q.def.grant(s, q, p, api); if (g && g.includes(k)) return true; }
  return false;
}

export function tapPerm(s, p) {
  if (p.tapped) return;
  p.tapped = true;
  p.def.onTapped?.(s, p, api);
}

export function addCounters(s, p, n) {
  if (!onBf(s, p) || n <= 0) return;
  if (p.side === 'P') n += s.P.bf.filter((q) => q.def.scales).length;
  p.ctr += n;
}

export function proliferate(s) {
  for (const p of s.P.bf) {
    if (p.ctr > 0) addCounters(s, p, 1);
    if (p.flags.muster) p.flags.muster++;
  }
}

export function pump(p, a, b, kws = []) { p.mP += a; p.mT += b; for (const k of kws) p.kwT.add(k); }

// プレイヤーの呪文が自分のクリーチャーを対象にしたとき（勇壮）
export function target(s, p) { if (p.side === 'P' && onBf(s, p) && p.def.heroic) p.def.heroic(s, p, api); }

// ---- ダメージ・ライフ ----
export function damage(s, p, n, src) {
  if (n <= 0 || !onBf(s, p)) return 0;
  if (s.floor.preventDamage?.(s, p, n, src, api)) return 0;
  if (p.side === 'P' && p.attacking && s.P.bf.some((q) => q.def.protectAttackers)) return 0;
  if (isCreature(p)) { p.dmg += n; if (src && hasKw(s, src, 'deathtouch')) p.dt = true; }
  s.floor.onDamaged?.(s, p, n, src, api);
  if (src && src.side === 'P' && hasKw(s, src, 'lifelink')) gainLife(s, n);
  return n;
}

export function hurt(s, n, src) {
  if (n <= 0 || s.over) return;
  if (s.combat?.reduce) { const r = Math.min(n, s.combat.reduce); n -= r; s.combat.reduce -= r; }
  s.P.life -= n; s.stats.lifeLost += n;
  L(s, `プレイヤーに ${n}点（のこり ${s.P.life}）`);
  if (s.P.life <= 0) s.over = 'lose';
}

export function gainLife(s, n) { if (!s.P.noLifeGain && n > 0) s.P.life += n; }

// 「敵に～点」（本体がある階は本体、ない階はAIが選んだ敵のパーマネント）
export function hitEnemy(s, n, src, o = {}) {
  if (n <= 0) return;
  const t = api.burnTarget(s, n, { ...o, mustHit: true })?.t;
  if (t) hitTarget(s, t, n, src);
  sba(s);
}

export function hitTarget(s, t, n, src, combat = false) {
  if (n <= 0) return;
  if (t === 'player') return hurt(s, n, src);
  if (t === 'face') {
    s.floor.face(s, n, api);
    if (src && src.side === 'P' && hasKw(s, src, 'lifelink')) gainLife(s, n);
  } else damage(s, t, n, src);
  if (combat && src?.side === 'P') src.def.onCombatHit?.(s, src, api);
}

export function fight(s, a, b) {
  const pa = power(s, a), pb = power(s, b);
  damage(s, b, pa, a); damage(s, a, pb, b);
  sba(s);
}

// ---- 戦場を離れる ----
export function sba(s) {
  for (let loop = 0; loop < 50 && !s.over; loop++) {
    let changed = false;
    for (const side of ['P', 'E']) for (const p of [...s[side].bf]) {
      if (!onBf(s, p) || !isCreature(p)) continue;
      const [, T] = pt(s, p);
      const lethal = T <= 0 || ((p.dmg >= T || p.dt) && !hasKw(s, p, 'indestructible'));
      if (lethal && leave(s, p, 'gy', { died: true })) changed = true;
    }
    if (s.P.life <= 0) s.over = 'lose';
    if (!s.over) s.floor.check?.(s, api, 'sba');
    if (!changed) break;
  }
}

export function leave(s, p, to = 'gy', o = {}) {
  if (!onBf(s, p)) return false;
  if (s.floor.cantLeave?.(s, p, api)) return false;
  const side = s[p.side];
  side.bf.splice(side.bf.indexOf(p), 1);
  for (const q of side.bf) if (q.attached === p.uid) q.attached = null;
  if (p.side === 'E' && (to === 'hand' || to === 'lib')) to = 'gy';
  if (!p.token) {
    const c = { uid: p.uid, def: p.card };
    if (to === 'hand') s.P.hand.push(c); else if (to === 'exile') side.exile.push(c); else side.gy.push(c);
  }
  L(s, `${p.side === 'P' ? '' : '敵：'}${p.def.name} が戦場を離れた（${to}）`);
  for (const l of p.links) returnLinked(s, l);
  if (o.died && p.def.onDie) p.def.onDie(s, p, api);
  if (p.def.reward) p.def.reward(s, p, api);
  for (const q of [...s.P.bf, ...s.E.bf]) if (q.def.onOtherLeave) q.def.onOtherLeave(s, q, p, api, o);
  s.floor.onLeave?.(s, p, api, o);
  return true;
}

export const destroy = (s, p) => (!hasKw(s, p, 'indestructible') ? leave(s, p, 'gy', { died: true }) : false);
export const exile = (s, p) => leave(s, p, 'exile');
export const bounce = (s, p) => leave(s, p, 'hand');

// 「これが戦場を離れるまで追放する」
export function exileLinked(s, src, p) {
  const wasToken = p.token;
  if (!exile(s, p)) return false;
  if (!wasToken) src.links.push({ side: p.side, uid: p.uid });
  return true;
}
function returnLinked(s, l) {
  const z = s[l.side].exile; const i = z.findIndex((c) => c.uid === l.uid);
  if (i < 0) return;
  const [c] = z.splice(i, 1);
  enter(s, l.side, c.def);
}

// ---- 敵の呪文 ----
export function reveal(s, n) {
  for (let i = 0; i < n && !s.over; i++) {
    const c = s.E.lib.shift();
    if (!c) return;
    enemyCast(s, c);
  }
}

export function enemyCast(s, c) {
  L(s, `敵：${c.def.name} を公開した`);
  for (const q of [...s.P.bf]) if (q.def.onAnyCast) q.def.onAnyCast(s, q, c.def, 'E', api);
  if (s.ai.counter(s, c)) { s.E.gy.push(c); L(s, '打ち消した'); return; }
  if (c.def.types.includes('sorcery')) { c.def.effect(s, api); s.E.gy.push(c); }
  else enter(s, 'E', c.def, { card: c.def });
  sba(s);
}

// ---- 戦闘 ----
export function canBlock(s, b, a) {
  if (a.flags.turn?.unblockable) return false;
  if (hasKw(s, a, 'flying') && !hasKw(s, b, 'flying') && !hasKw(s, b, 'reach')) return false;
  return true;
}

function kills(s, x, y) { const px = power(s, x); return px > 0 && (hasKw(s, x, 'deathtouch') || px >= pt(s, y)[1] - y.dmg); }
function survives(s, x, y) { return hasKw(s, x, 'indestructible') || (!kills(s, y, x)); }
export const blockFacts = (s, b, a) => ({ kills: kills(s, b, a), survives: survives(s, b, a) });

// 敵のブロック：倒せるか、倒されないときだけブロックする（頭・神・ブロックしないクリーチャーはしない）
export function enemyBlocks(s, atk) {
  const blocks = new Map();
  const avail = s.E.bf.filter((b) => isCreature(b) && !b.tapped && !b.def.noBlock);
  const order = [...atk].sort((x, y) => power(s, y.p) - power(s, x.p));
  for (const a of order) {
    let best = null, bv = 0;
    for (const b of avail) {
      if (!canBlock(s, b, a.p)) continue;
      const f = blockFacts(s, b, a.p);
      const v = (f.kills ? 2 : 0) + (f.survives ? 1 : 0);
      if (v > bv) { bv = v; best = b; }
    }
    if (best) { blocks.set(a.p.uid, best); avail.splice(avail.indexOf(best), 1); }
  }
  return blocks;
}

function combatPlayer(s) {
  for (const p of [...s.P.bf]) if (onBf(s, p) && p.def.combatStart) p.def.combatStart(s, p, api);
  for (const c of [...s.P.gy]) if (c.def.gyCombatStart) c.def.gyCombatStart(s, c, api);
  sba(s); if (s.over) return;
  const atk = s.ai.attack(s);
  if (!atk.length) return;
  for (const a of atk) { a.p.attacking = true; if (!hasKw(s, a.p, 'vigilance')) tapPerm(s, a.p); }
  L(s, `攻撃：${atk.map((a) => `${a.p.def.name}→${a.t === 'face' ? '本体' : a.t.def?.name}`).join('、')}`);
  for (const a of [...atk]) if (onBf(s, a.p) && a.p.def.onAttack) a.p.def.onAttack(s, a.p, api, atk, a);
  const blocks = enemyBlocks(s, atk);
  s.ai.tricks(s, atk, blocks);
  if (atk.length >= 3 && ask(s)) {
    const u = atk.filter((a) => !blocks.has(a.p.uid) && onBf(s, a.p) && !a.t?.def?.factory);
    if (u.length) u[0].p.mP += 1;
  }
  resolveCombat(s, atk, blocks);
}

export function enemyAttack(s, attackers) {
  attackers = attackers.filter((p) => onBf(s, p) && isCreature(p));
  if (!attackers.length) return;
  for (const p of attackers) { p.attacking = true; if (!hasKw(s, p, 'vigilance')) p.tapped = true; }
  L(s, `敵の攻撃：${attackers.map((p) => p.def.name).join('、')}`);
  s.ai.beforeBlocks(s, attackers);
  attackers = attackers.filter((p) => onBf(s, p));
  const blocks = s.ai.blocks(s, attackers);
  s.ai.duringBlocks(s, attackers, blocks);
  attackers = attackers.filter((p) => onBf(s, p));
  const unblocked = attackers.filter((p) => !blocks.has(p.uid)).reduce((t, p) => t + Math.max(0, power(s, p)), 0);
  const reduce = unblocked > 0 && ask(s) ? 1 : 0;
  resolveCombat(s, attackers.map((p) => ({ p, t: 'player' })), blocks, reduce);
}

export function resolveCombat(s, atk, blocks, reduce = 0) {
  s.combat = { atk, blocks, factory: 0, reduce, key: s.E.key };
  for (const step of ['first', 'normal']) {
    const strikes = (x) => {
      const fs = hasKw(s, x, 'first') || hasKw(s, x, 'double');
      return step === 'first' ? fs : (!fs || hasKw(s, x, 'double'));
    };
    for (const a of atk) {
      const p = a.p;
      if (!onBf(s, p) || !strikes(p)) continue;
      let P = power(s, p); if (P <= 0) continue;
      const b = blocks.get(p.uid);
      const trample = hasKw(s, p, 'trample');
      if (b) {
        if (onBf(s, b)) {
          const left = hasKw(s, p, 'deathtouch') ? 1 : Math.max(0, pt(s, b)[1] - b.dmg);
          const toB = trample ? Math.min(P, left) : P;
          damage(s, b, toB, p); P -= toB;
          if (P > 0 && trample) hitTarget(s, a.t, P, p, true);
        } else if (trample) hitTarget(s, a.t, P, p, true);
      } else if (a.t === 'face' || a.t === 'player' || onBf(s, a.t)) hitTarget(s, a.t, P, p, true);
    }
    for (const a of atk) {
      const b = blocks.get(a.p.uid);
      if (!b || !onBf(s, b) || !onBf(s, a.p) || !strikes(b)) continue;
      damage(s, a.p, power(s, b), b);
    }
    sba(s);
    if (s.over) break;
  }
  if (!s.over) s.floor.afterCombat?.(s, api);
  for (const a of atk) a.p.attacking = false;
  s.combat = null;
  sba(s);
}

// ---- けいさんボーナス ----
export function ask(s) {
  s.stats.asked++;
  const ok = s.rng() < s.mathRate;
  if (ok) s.stats.ok++;
  return ok;
}

Object.assign(api, {
  L, drawCard, rampTop, charge, enter, token, pt, power, need, hasKw, tapPerm, addCounters, proliferate, pump, target,
  damage, hurt, gainLife, hitEnemy, hitTarget, fight, sba, leave, destroy, exile, bounce, exileLinked, reveal, enemyCast,
  enemyAttack, enemyBlocks, canBlock, blockFacts, ask, is, isCreature, onBf, colorsOf, card,
  creatures: (s, side) => s[side].bf.filter(isCreature),
  gain: (s, n) => gainLife(s, n),
});
