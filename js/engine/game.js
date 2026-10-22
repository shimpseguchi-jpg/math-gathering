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

export function newGame({ deck, floor, diff = 'normal', seed = 1, reshuffle = true, ai, log = false }) {
  const rng = seeded(seed);
  const s = {
    rng, diff, reshuffle, ai, logOn: log, logs: [],
    turn: 0, active: 'P', over: null, floor, phase: 1, combat: null, lastCombat: [],
    P: { side: 'P', life: 20, lib: shuffle(rng, deck.map((d) => card(d))), hand: [], mana: [], bf: [], gy: [], exile: [], suspended: [], noLifeGain: false, flags: {} },
    E: { side: 'E', lib: [], bf: [], gy: [], exile: [], life: 0, key: 0, extraTurns: 0, flags: {} },
    stats: { exact: 0, playerTurns: 0, lifeLost: 0, reshuffled: 0 },
  };
  floor.setup(s, api);
  for (let i = 0; i < 5; i++) drawCard(s);
  return s;
}

export function L(s, msg) { if (s.logOn) s.logs.push(`[${s.turn}${s.active}] ${msg}`); }
// ログの「敵：」。オンラインバトルで 入れかわって いる（s.swapped）ときは 'P' が あいて
export const foe = (s, side) => ((side === 'E') !== !!s.swapped ? 'てき：' : '');

// ---- オンラインバトル：P と E を 入れかえる ----
// あいて（ゴースト）の ターンは、入れかえて プレイヤー用の AI と カードの 効果を そのまま 使う
export function swapSides(s) {
  [s.P, s.E] = [s.E, s.P];
  s.P.side = 'P'; s.E.side = 'E';
  for (const p of s.P.bf) p.side = 'P';
  for (const p of s.E.bf) p.side = 'E';
  [s.stats, s.foeStats] = [s.foeStats, s.stats];
  s.swapped = !s.swapped;
  if (s.over === 'win') s.over = 'lose'; else if (s.over === 'lose') s.over = 'win';
}

// ---- 1戦の流れ ----
// AI どうしの1戦（シミュレーション用）。人が遊ぶときは ui/ が beginPlayerTurn などを順に呼ぶ
export async function play(s, maxTurns = 40) {
  if (s.floor.first === 'E') await enemyTurn(s);
  while (!s.over) {
    playerTurnAI(s);
    if (s.over) break;
    if (s.stats.playerTurns >= maxTurns) { s.over = 'timeout'; break; }
    if (s.E.extraTurns > 0) { s.E.extraTurns--; continue; }
    await enemyTurn(s);
  }
  return s;
}

function playerTurnAI(s) {
  beginPlayerTurn(s); if (s.over) return;
  s.ai.main(s, 1); if (s.over) return;
  combatAI(s); if (s.over) return;
  s.ai.main(s, 2); if (s.over) return;
  endPlayerTurn(s);
}

export function beginPlayerTurn(s) {
  const P = s.P;
  s.turn++; s.active = 'P'; s.stats.playerTurns++;
  P.flags.enteredLastTurn = P.flags.enteredThisTurn; P.flags.enteredThisTurn = false;
  P.flags.cast = 0; P.flags.charged = false;
  for (const c of P.hand) c.locked = false;
  for (const p of P.bf) { untap(s, p); p.sick = false; p.flags.turn = {}; }
  for (const m of P.mana) m.tapped = false;
  s.floor.playerUpkeep?.(s, api);
  const waits = [];
  for (const p of [...P.bf]) if (onBf(s, p) && p.def.upkeep) { const r = p.def.upkeep(s, p, api); if (r && r.then) waits.push(r); }
  // 待機：時間カウンターを1個とって、0になったら コストを払わずに唱える
  const ready = [];
  for (const x of P.suspended) { x.n--; if (x.n <= 0) ready.push(x); }
  P.suspended = P.suspended.filter((x) => x.n > 0);
  const rest = () => { sba(s); if (s.over) return; refill(s); };
  const castReady = () => ready.reduce((w, x) => w.then(() => api.castSuspended(s, x.c)), Promise.resolve());
  // 占術（海の神タッサ）や 待機の 対象を 画面で聞くときは、答えを待ってから引く
  if (waits.length || (ready.length && s.ai.castSuspended)) return Promise.all(waits).then(castReady).then(rest);
  for (const x of ready) api.castSuspended(s, x.c);
  rest();
}

export function endPlayerTurn(s) {
  for (const p of [...s.P.bf]) if (onBf(s, p) && p.def.endStep) p.def.endStep(s, p, api);
  endTurn(s);
}

export async function enemyTurn(s) {
  s.turn++; s.active = 'E';
  for (const p of s.E.bf) { untap(s, p); p.sick = false; }
  s.E.flags.turn = {};
  await s.floor.enemyTurn(s, api);
  if (!s.over) endTurn(s);
}

// ターンの はじめの アンタップ。こおり（つぎの 1回 起きない）と、氷の時代（それが 戦場に あるあいだ 起きない）
export function untap(s, p) {
  if (p.iceBy && onBf(s, p.iceBy)) return;
  if (p.frozen) p.frozen = false; else p.tapped = false;
}

function endTurn(s) {
  s.floor.endTurn?.(s, api);
  for (const side of ['P', 'E']) for (const p of s[side].bf) {
    p.dmg = 0; p.dt = false; p.dmgBy = []; p.mP = 0; p.mT = 0; p.kwT.clear(); p.base2 = false; p.setPT = null; p.flags.mustAttack = false;
  }
  sba(s);
  if (!s.over) s.floor.check?.(s, api, 'end');
}

// ---- ゾーン ----
export function drawCard(s, n = 1) {
  const P = s.P;
  for (let i = 0; i < n; i++) {
    if (!P.lib.length) {
      if (s.reshuffle && P.gy.length) {
        // 山札が なくなったら ぼちを まぜて もどす。そのたびに ライフを 2・4・6…（2の だん）失う
        P.lib = shuffle(s.rng, P.gy.splice(0)); P.reshuffles = (P.reshuffles || 0) + 1; s.stats.reshuffled++;
        const n = reshuffleCost(P);
        L(s, `${foe(s, 'P')}ぼちを まぜて やまふだに もどした（ライフ −${n}）`);
        hurt(s, n);
        if (s.over) return;
      } else if (!s.reshuffle) { s.over = 'lose'; s.stats.deckout = true; return; }
      else return;
    }
    P.hand.push(P.lib.shift());
    for (const q of [...P.bf]) if (q.def.onDraw && onBf(s, q)) q.def.onDraw(s, q, api);
  }
}

// 手札の 補充（遊戯王ラッシュデュエルと おなじ）：ターンの はじめに、手札が HAND_SIZE まいに なるまで 引く
export const HAND_SIZE = 5;
export const LOW_LIBRARY = 5; // 山札が これより 少ないと、画面で「もうすぐ なくなる」
// ぼちを まぜて もどす ときに 失う ライフ（1回め 2、2回め 4、3回め 6…）。next は つぎに まぜたときの 数
export const reshuffleCost = (P, next = false) => 2 * ((P.reshuffles || 0) + (next ? 1 : 0));
export function refill(s) {
  const size = s.P.flags.refill7 === s.stats.playerTurns ? 7 : HAND_SIZE;
  const n = size - s.P.hand.length;
  if (n <= 0) return;
  drawCard(s, n);
  L(s, `${foe(s, 'P')}てふだを ${size}まいに した（${n}まい 引いた）`);
}

// 手札を 捨てる（怪物化などの コスト）。捨てた カードは 墓地へ
export function discard(s, cards) {
  for (const c of cards) { const i = s.P.hand.indexOf(c); if (i >= 0) { s.P.hand.splice(i, 1); s.P.gy.push(c); } }
  if (cards.length) L(s, `${foe(s, 'P')}すてた：${cards.map((c) => c.def.name).join('、')}`);
}

export function rampTop(s) {
  if (!s.P.lib.length) return;
  const c = s.P.lib.shift();
  s.P.mana.push({ ...c, tapped: true });
}

export function charge(s, c, tapped = colorsOf(c.def).length > 1) {
  s.P.hand.splice(s.P.hand.indexOf(c), 1);
  s.P.mana.push({ ...c, tapped });
  L(s, `${foe(s, 'P')}マナ：${c.def.name}`);
}

// ---- パーマネント ----
function makePerm(side, def, o = {}) {
  return {
    uid: UID++, def, card: o.card || def, side, tapped: !!o.tapped, sick: true, ctr: o.ctr || 0, level: 0, dmg: 0, dt: false, dmgBy: [],
    mP: 0, mT: 0, kwT: new Set(), frozen: false, token: !!o.token, monstrous: false, attached: null, links: [], flags: { turn: {} },
  };
}

export function enter(s, side, def, o = {}) {
  const p = makePerm(side, def, o);
  s[side].bf.push(p);
  L(s, `${foe(s, side)}${def.name} が せんじょうに 出た`);
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

// Lvアップ：いまの レベルで 使う 段（なければ null）
export const levelRow = (p) => (p.def.levels ? [...p.def.levels].reverse().find((r) => p.level >= r.at) || null : null);

export function pt(s, p) {
  const d = levelRow(p) || p.def;
  let P = typeof d.pow === 'function' ? d.pow(s, p, api) : (d.pow ?? 0);
  let T = typeof d.tou === 'function' ? d.tou(s, p, api) : (d.tou ?? 0);
  if (p.base2) P = 2;
  if (p.setPT) [P, T] = p.setPT;
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
  if (p.def.kw?.includes(k) || p.kwT.has(k) || levelRow(p)?.kw?.includes(k)) return true;
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
  n += s[p.side].bf.filter((q) => q.def.scales).length;
  p.ctr += n;
  p.def.onCounters?.(s, p, api, n);
}

export function proliferate(s) {
  for (const p of s.P.bf) {
    if (p.ctr > 0) addCounters(s, p, 1);
    if (p.level > 0) p.level++;
    if (p.flags.muster) p.flags.muster++;
  }
}

export function pump(p, a, b, kws = []) { p.mP += a; p.mT += b; for (const k of kws) p.kwT.add(k); }

// 鼓舞 N：タフネスが いちばん小さい 自分の クリーチャー（同じなら 先に 出た ほう）に ＋1/＋1カウンターを N個
export function bolster(s, n) {
  const t = s.P.bf.filter(isCreature).sort((a, b) => pt(s, a)[1] - pt(s, b)[1])[0];
  if (!t) return null;
  L(s, `こぶ${n}：${t.def.name}（タフネス ${pt(s, t)[1]}）`);
  target(s, t);
  addCounters(s, t, n);
  return t;
}

// 圧倒：自分の クリーチャーの パワーの 合計が 8 いじょう
export const totalPower = (s, list) => list.reduce((t, p) => t + Math.max(0, power(s, p)), 0);
export const formidable = (s) => totalPower(s, s.P.bf.filter(isCreature)) >= 8;
// 集会：パワーが ちがう クリーチャーが 3体 いじょう（2・2・3 は 2しゅるい）
export const coven = (s, side = 'P') => new Set(s[side].bf.filter(isCreature).map((p) => power(s, p))).size >= 3;
// 暴勇：手札が 0まい
export const hellbent = (s, side = 'P') => (s[side].hand || []).length === 0;
// サイコロ（6面）
export function rollDie(s) { const n = 1 + Math.floor(s.rng() * 6); L(s, `サイコロ：${n}`); return n; }

// プレイヤーの呪文が自分のクリーチャーを対象にしたとき（勇壮）
export function target(s, p) { if (p.side === 'P' && onBf(s, p) && p.def.heroic) p.def.heroic(s, p, api); }

// ---- ダメージ・ライフ ----
// o.spell：呪文の ぴったり（{ pittari() }）
export function damage(s, p, n, src, o = {}) {
  if (n <= 0 || !onBf(s, p)) return 0;
  if (s.floor.preventDamage?.(s, p, n, src, api)) return 0;
  if (p.attacking && s[p.side].bf.some((q) => q.def.protectAttackers)) return 0;
  if (p.def.dmgToCounters) { const k = Math.min(n, p.ctr); p.ctr -= k; L(s, `${foe(s, p.side)}${p.def.name} の ＋1/＋1カウンターが ${k}こ へった`); }
  else if (isCreature(p)) { p.dmg += n; p.dmgBy.push(src || o.spell || null); if (src && hasKw(s, src, 'deathtouch')) p.dt = true; }
  if (s.combat && src?.side === 'P') s.combat.events.push({ src, t: p, n });
  L(s, `${src ? `${src.def.name} → ` : ''}${foe(s, p.side)}${p.def.name} に ${n}点`);
  s.floor.onDamaged?.(s, p, n, src, api);
  if (src && src.side === 'P' && hasKw(s, src, 'lifelink')) gainLife(s, n);
  return n;
}

export function hurt(s, n, src) {
  if (n <= 0 || s.over) return;
  s.P.life -= n; s.stats.lifeLost += n;
  L(s, `${s.swapped ? 'てき' : 'プレイヤー'}に ${n}点（のこり ${s.P.life}）`);
  if (s.P.life <= 0) s.over = dead(s);
}
// ライフが 0：オンラインバトルで あいても 0 なら ひきわけ
const dead = (s) => (s.floor.id === 'pvp' && s.E.life <= 0 ? 'draw' : 'lose');

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
  if (t === 'player') { if (src && hasKw(s, src, 'lifelink')) s[src.side].life += n; return hurt(s, n, src); }
  if (t === 'face') {
    if (s.combat && src?.side === 'P') s.combat.events.push({ src, t: 'face', n });
    L(s, `${src ? `${src.def.name} → ` : ''}${s.swapped ? 'プレイヤー' : (s.floor.faceLabel || 'てきの 本体')}に ${n}点`);
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
    if (s.P.life <= 0) s.over = dead(s);
    if (!s.over) s.floor.check?.(s, api, 'sba');
    if (!changed) break;
  }
}

// ぴったり：敵の クリーチャーが、タフネスと ちょうど 同じ ダメージで 倒れた（あまりが 0）
const isExact = (s, p) => p.side === 'E' && isCreature(p) && !p.dt && p.dmg > 0 && p.dmg === pt(s, p)[1];

export function leave(s, p, to = 'gy', o = {}) {
  if (!onBf(s, p)) return false;
  if (s.floor.cantLeave?.(s, p, api)) return false;
  const exact = o.died && isExact(s, p);
  if (isCreature(p)) p.diedT = pt(s, p)[1]; // 画面の「攻撃の けっか」で 見せる
  const side = s[p.side];
  side.bf.splice(side.bf.indexOf(p), 1);
  for (const q of side.bf) if (q.attached === p.uid) q.attached = null;
  // 手札に もどす：手札の ない 塔の 敵は、かわりに やまふだの 一番上へ（つぎの ターンに また めくられて 出てくる）。トークンは きえる
  if ((to === 'hand' && !side.hand) || to === 'lib') to = 'lib';
  if (!p.token) {
    const c = { uid: p.uid, def: p.card };
    if (to === 'hand') side.hand.push(c); else if (to === 'lib') side.lib.unshift(c); else if (to === 'exile') side.exile.push(c); else side.gy.push(c);
  }
  L(s, `${foe(s, p.side)}${p.def.name} が せんじょうを はなれた（${p.token && to !== 'gy' ? 'きえた' : { gy: 'ぼちへ', exile: 'ついほう', hand: 'てふだへ', lib: 'やまふだの 上へ' }[to] || to}）`);
  if (exact) {
    s.stats.exact++; p.exact = true;
    L(s, `ぴったり！ ${p.def.name}（タフネス ${p.dmg}）`);
    for (const by of new Set(p.dmgBy)) {
      if (by?.pittari) by.pittari(s, api, p);
      else if (by?.def?.pittari && onBf(s, by)) by.def.pittari(s, by, api, p);
    }
  }
  for (const l of p.links) returnLinked(s, l);
  if (o.died && p.def.onDie) p.def.onDie(s, p, api);
  p.def.onLeaveSelf?.(s, p, api);
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
export async function reveal(s, n) {
  for (let i = 0; i < n && !s.over; i++) {
    const c = s.E.lib.shift();
    if (!c) return;
    await enemyCast(s, c);
  }
}

export async function enemyCast(s, c) {
  L(s, `てき：${c.def.name} を 公開した`);
  for (const q of [...s.P.bf]) if (q.def.onAnyCast) q.def.onAnyCast(s, q, c.def, 'E', api);
  await s.ai.revealed?.(s, c);
  if (await s.ai.counter(s, c)) { s.E.gy.push(c); L(s, '打ち消した'); return; }
  if (c.def.types.includes('sorcery')) { c.def.effect(s, api); s.E.gy.push(c); }
  else enter(s, 'E', c.def, { card: c.def });
  sba(s);
}

// ---- 戦闘 ----
export function canBlock(s, b, a) {
  if (a.flags.turn?.unblockable) return false;
  if (b.def.cantBlock) return false;
  if (a.flags.turn?.hasteOnly && !hasKw(s, b, 'haste')) return false;
  if (s.smallCantBlock === s.turn && power(s, b) <= 1) return false;
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

function combatAI(s) {
  combatStart(s); if (s.over) return;
  const atk = s.ai.attack(s);
  if (!atk.length) return;
  const blocks = declareAttack(s, atk);
  s.ai.tricks(s, atk, blocks);
  finishCombat(s, atk, blocks);
}

// 戦闘のはじめ（ゴブリンの大将・スーラク など）
export function combatStart(s) {
  for (const p of [...s.P.bf]) if (onBf(s, p) && p.def.combatStart) p.def.combatStart(s, p, api);
  for (const c of [...s.P.gy]) if (c.def.gyCombatStart) c.def.gyCombatStart(s, c, api);
  sba(s);
}

// 攻撃を宣言して、敵のブロックを返す。atk = [{ p, t }]（t は敵のパーマネント・'face'）
export function declareAttack(s, atk) {
  for (const a of atk) { a.p.attacking = true; if (!hasKw(s, a.p, 'vigilance')) tapPerm(s, a.p); }
  L(s, `こうげき：${atk.map((a) => `${a.p.def.name}→${a.t === 'face' ? '本体' : a.t.def?.name}`).join('、')}`);
  attackTriggers(s, atk);
  return enemyBlocks(s, atk);
}

// 攻撃したときの 能力（ブリマーズ・大隊・集団戦術・訓練・教導 など）
export function attackTriggers(s, atk) {
  for (const a of [...atk]) if (onBf(s, a.p) && a.p.def.onAttack) a.p.def.onAttack(s, a.p, api, atk, a);
  battleCry(s, atk);
  attackCounters(s, atk);
}

// 喊声：これが 攻撃するたび、ほかの 攻撃している クリーチャーは みんな ＋1/＋0
function battleCry(s, atk) {
  for (const a of atk) {
    if (!onBf(s, a.p) || !hasKw(s, a.p, 'battlecry')) continue;
    const others = atk.filter((b) => b.p !== a.p && onBf(s, b.p));
    for (const b of others) pump(b.p, 1, 0);
    if (others.length) L(s, `かんせい：${a.p.def.name}（ほかの ${others.length}体が ＋1）`);
  }
}

// 訓練：自分より パワーが 大きい クリーチャーと 攻撃すると ＋1/＋1カウンター
// 教導：自分より パワーが 小さい 攻撃クリーチャー1体（いちばん大きいもの）に ＋1/＋1カウンター
function attackCounters(s, atk) {
  const live = () => atk.map((a) => a.p).filter((q) => onBf(s, q));
  for (const p of live()) {
    if (hasKw(s, p, 'training') && live().some((q) => q !== p && power(s, q) > power(s, p))) { addCounters(s, p, 1); L(s, `くんれん：${p.def.name}`); }
  }
  for (const p of live()) {
    if (!hasKw(s, p, 'mentor')) continue;
    const t = live().filter((q) => q !== p && power(s, q) < power(s, p)).sort((a, b) => power(s, b) - power(s, a))[0];
    if (t) { addCounters(s, t, 1); L(s, `きょうどう：${p.def.name} → ${t.def.name}`); }
  }
}

export function finishCombat(s, atk, blocks) {
  resolveCombat(s, atk, blocks);
  for (const a of atk) a.p.attacking = false;
}

export async function enemyAttack(s, attackers) {
  attackers = attackers.filter((p) => onBf(s, p) && isCreature(p));
  if (!attackers.length) return;
  for (const p of attackers) { p.attacking = true; if (!hasKw(s, p, 'vigilance')) p.tapped = true; }
  L(s, `てきの こうげき：${attackers.map((p) => p.def.name).join('、')}`);
  await s.ai.beforeBlocks(s, attackers);
  attackers = attackers.filter((p) => onBf(s, p));
  const blocks = await s.ai.blocks(s, attackers);
  await s.ai.duringBlocks(s, attackers, blocks);
  attackers = attackers.filter((p) => onBf(s, p));
  resolveCombat(s, attackers.map((p) => ({ p, t: 'player' })), blocks);
}

export function resolveCombat(s, atk, blocks) {
  s.combat = { atk, blocks, factory: 0, key: s.E.key, events: [] };
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
  s.lastCombat = s.combat.events;
  s.combat = null;
  sba(s);
}

Object.assign(api, {
  L, drawCard, rampTop, charge, enter, token, pt, power, need, hasKw, tapPerm, addCounters, proliferate, pump, target,
  damage, hurt, gainLife, hitEnemy, hitTarget, fight, sba, leave, destroy, exile, bounce, exileLinked, reveal, enemyCast,
  refill, discard, untap, coven, hellbent, rollDie, enemyAttack,
  shuffleLib: (s) => { s.P.lib = shuffle(s.rng, s.P.lib); }, enemyBlocks, canBlock, blockFacts, is, isCreature, onBf, colorsOf, card, bolster, formidable, totalPower, levelRow,
  swapSides, attackTriggers, combatStart,
  creatures: (s, side) => s[side].bf.filter(isCreature),
  gain: (s, n) => gainLife(s, n),
});
