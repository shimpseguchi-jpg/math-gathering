// 次元渡り（大人向けモード。docs/SPIRE.md）：冒険のロジック
// 画面（ui/spire.js）と AI のシミュレーション（tools/sim.mjs spire）で共通。画面とのやりとりは io：
//   io.pickNode(R, nodes) → node | null（やめる）、io.choose({ id, title, body, options }) → value、
//   io.pickCard(R, { id, title, filter }) → デッキの番号 | null、io.pickReward(R, ids, rw) → id | null、
//   io.shop(R, stock) → { k: 'card' | 'relic' | 'potion' | 'remove' | 'leave', i }、io.battle(R, set) → 結果 | null（やめる）、
//   io.save(R)、io.end(R)
// R（冒険の状態）は JSON にして保存する。とちゅうでやめても、マスのはじめからつづけられる
import { pick, shuffle } from './rng.js';
import { colorsOf } from './game.js';
import { packPool, cardValue } from './run.js';
import { BY_ID, BASICS, SETS, SET_OF, boostBasic, SUN_RING } from '../data/cards.js';
import { FLOORS } from '../data/enemies.js';
import { grown } from '../data/strixhaven.js';
import { SPIRE, ACTS, monsterFloor, withPeek, RELICS, RELIC_BY_ID, POTIONS, POTION_BY_ID, CURSE, EVENTS } from '../data/spire.js';

export const asc = (R, n) => (R.asc || 0) >= n;
const runVal = (R, k) => R.relics.reduce((t, id) => t + (RELIC_BY_ID[id]?.run?.[k] || 0), 0);
export const potionSlots = (R) => Math.max(0, SPIRE.potionSlots + runVal(R, 'potionSlot'));
export const restHeal = (R) => Math.round(R.maxLife * (SPIRE.restHeal + runVal(R, 'restPlus')));
export const canRest = (R) => !runVal(R, 'noRest');
export const removePrice = (R) => Math.round((SPIRE.removeBase + SPIRE.removeStep * (R.removes || 0)) * (1 - runVal(R, 'discount')));

// ---- カード ----
export const defOf = (id) => BY_ID[id] || POTION_BY_ID[id] || (id === CURSE.id ? CURSE : null);
export const cardDef = (e) => grown(defOf(e.id), e.up || 0);
export const deckDefs = (R) => R.deck.map(cardDef);
// 強化できるか（1枚に 1回。クリーチャーは ＋1/＋1、ほかはコスト −1 で色のマナより下にならない）
export function canUp(e) {
  if (e.up) return false;
  const d = defOf(e.id);
  if (!d || d.curse) return false;
  return d.types.includes('creature') ? typeof d.pow === 'number' : grown(d, 1).cost < d.cost;
}
// 報酬・お店に出るカード（統率者の色と無色。旗・基本・トークン・統率者じしんはのぞく）
// 弾は R.sets（統率者の弾 ＋ ランダムな 2つ）。むかしのセーブ（統率者なし）は R.pool の弾ぜんぶ
const POOLS = new Map();
// all：番外編（FGO・スターレイル・ゼンゼロ）も ふくむ（2026-10-31）。番外編の統率者なら、その番外編が 1つめの弾になる
export const POOL_SETS = { all: SETS.filter((x) => !x.raid).map((x) => x.id), released: SETS.filter((x) => x.released).map((x) => x.id) };
const okFor = (cols, not) => (d) => !d.token && !d.basic && !d.banner && !d.noPack && d.id !== not && colorsOf(d).every((c) => cols.includes(c));
export function cardPool(R) {
  const sets = R.sets || POOL_SETS[R.pool] || POOL_SETS.all;
  const key = `${R.cols}:${sets.join(',')}:${R.cmd || ''}`;
  if (!POOLS.has(key)) {
    const P = packPool(sets), ok = okFor(R.cols, R.cmd);
    POOLS.set(key, Object.fromEntries(['C', 'U', 'R', 'L'].map((r) => [r, (P[r] || []).filter(ok)])));
  }
  return POOLS.get(key);
}
// ---- 統率者（旅のはじめにランダムな 3枚から 1枚）----
const WUKRG = 'WUKRG';
export const colsOf = (d) => colorsOf(d).sort((a, b) => WUKRG.indexOf(a) - WUKRG.indexOf(b)).join('');
// 統率者になれる：伝説のクリーチャーで色がある（無色はデッキが組めない）
export const canCommand = (d) => d && d.rar === 'L' && (d.types || []).includes('creature') && !d.noPack && colorsOf(d).length > 0;
export function commanderOffers(rng, pool = 'all', n = 3) {
  const list = shuffle(rng, SETS.filter((st) => (POOL_SETS[pool] || POOL_SETS.all).includes(st.id)).flatMap((st) => st.cards).filter(canCommand));
  const out = [];
  for (const d of list) if (out.length < n && !out.some((o) => colsOf(o) === colsOf(d))) out.push(d); // 色がかさならないように
  for (const d of list) if (out.length < n && !out.includes(d)) out.push(d);
  return out.map((d) => d.id);
}
// 統率者の弾 ＋ ランダムな弾 2つ（統率者の色のカードが 12種いじょうある弾から）
const SETS_PICK = 2, SET_MIN = 12;
export function runSets(rng, cmd, pool = 'all') {
  const d = BY_ID[cmd], own = SET_OF[cmd], ok = okFor(colsOf(d), cmd);
  const cnt = (id) => SETS.find((st) => st.id === id).cards.filter(ok).length;
  const rest = shuffle(rng, (POOL_SETS[pool] || POOL_SETS.all).filter((id) => id !== own && cnt(id) >= SET_MIN));
  return [own, ...rest.slice(0, SETS_PICK)];
}

// ---- はじめ ----
export function newRun({ cmd, asc: a = 0, pool = 'all', rng }) {
  const R = {
    v: 2, asc: a, cmd, cols: colsOf(BY_ID[cmd]), pool, sets: runSets(rng, cmd, pool), maxLife: SPIRE.maxLife, life: SPIRE.maxLife, gold: SPIRE.gold,
    deck: [], relics: [], potions: [], potionChance: SPIRE.potionChance,
    act: 0, map: null, pos: null, at: null, pending: null, shop: null, enc: null,
    actFights: 0, seenElites: [], lastMonster: null, lastEvent: null, removes: 0, floor: 0,
    phase: 'neow', over: null, stats: { fights: 0, elites: 0, bosses: 0, exact: 0 }, started: Date.now(),
  };
  if (asc(R, 6)) R.life = Math.round(R.maxLife * 0.9);
  R.deck = starterDeck(R, rng);
  R.map = genMap(rng, R);
  return R;
}
// はじめのデッキ（11枚）：統率者 ＋ 基本カード 4枚（色でわける）＋ コモン 5枚（クリーチャー 3枚いじょう）＋ アンコモン 1枚（コスト 4 まで）
export const STARTER = { basics: 4, commons: 5, creatures: 3, uncommons: 1 };
function starterDeck(R, rng) {
  const P = cardPool(R), cheap = (d) => d.cost <= 4;
  const out = [{ id: R.cmd, up: 0 }];
  for (let i = 0; i < STARTER.basics; i++) out.push({ id: BASICS[R.cols[i % R.cols.length]].id, up: 0 });
  const crs = shuffle(rng, P.C.filter((d) => cheap(d) && d.types.includes('creature')));
  const oth = P.C.filter((d) => cheap(d) && !d.types.includes('creature'));
  const picks = [...crs.slice(0, STARTER.creatures), ...shuffle(rng, [...crs.slice(STARTER.creatures), ...oth]).slice(0, STARTER.commons - STARTER.creatures)];
  for (const d of picks) out.push({ id: d.id, up: 0 });
  for (const d of shuffle(rng, P.U.filter(cheap)).slice(0, STARTER.uncommons)) out.push({ id: d.id, up: 0 });
  if (asc(R, 10)) out.push({ id: CURSE.id, up: 0 });
  return out;
}
// 統率の冠をもっていれば、統率者は統率領域に（いつでも唱えられる。唱えるたびに ＋2）
export const cmdInZone = (R) => !!(R.cmd && runVal(R, 'cmdZone'));

// ---- マップ（2章）----
const SPECIAL = new Set(['elite', 'rest', 'shop']);
const crosses = (g, r, c, nc) => nc !== c && !!g[r][nc]?.next.includes(c);
export function genMap(rng, R) {
  const H = SPIRE.rows, W = SPIRE.lanes;
  const g = Array.from({ length: H }, () => Array(W).fill(null));
  const node = (r, c) => (g[r][c] ||= { r, c, t: null, next: [] });
  let first = -1;
  for (let p = 0; p < SPIRE.paths; p++) {
    let c = Math.floor(rng() * W);
    if (p === 0) first = c;
    if (p === 1) while (c === first) c = Math.floor(rng() * W);
    for (let r = 0; r < H; r++) {
      const n = node(r, c);
      if (r === H - 1) break;
      let nc = c;
      for (let k = 0; k < 8; k++) { nc = Math.min(W - 1, Math.max(0, c + Math.floor(rng() * 3) - 1)); if (!crosses(g, r, c, nc)) break; }
      if (crosses(g, r, c, nc)) nc = c;
      if (!n.next.includes(nc)) n.next.push(nc);
      c = nc;
    }
  }
  const w = { ...SPIRE.weights, elite: SPIRE.weights.elite * (asc(R, 1) ? 1.6 : 1) };
  for (let r = 0; r < H; r++) for (const n of g[r]) {
    if (!n) continue;
    if (r === 0) { n.t = 'fight'; continue; }
    if (r === 4) { n.t = 'treasure'; continue; }
    if (r === H - 1) { n.t = 'rest'; continue; }
    const parents = g[r - 1].filter((q) => q?.next.includes(n.c)).map((q) => q.t);
    const okT = Object.keys(w).filter((t) => !(SPECIAL.has(t) && parents.includes(t))
      && !(t === 'elite' && r < 5) && !(t === 'rest' && (r < 5 || r === H - 2)) && !(t === 'shop' && r < 2));
    let x = rng() * okT.reduce((s, t) => s + w[t], 0);
    n.t = okT.find((t) => (x -= w[t]) < 0) || 'fight';
  }
  // お店・エリートが 1つもなければ、まわりと かさならない 戦闘か ? を 1つかえる（お店は 3〜8段目、エリートは 6〜8段目）
  const around = (n) => [...g[n.r - 1].filter((q) => q?.next.includes(n.c)), ...n.next.map((c) => g[n.r + 1]?.[c])].filter(Boolean).map((q) => q.t);
  for (const [t, from] of [['shop', 2], ['elite', 5]]) {
    if (g.flat().some((n) => n?.t === t)) continue;
    const list = g.slice(from, H - 1).flat().filter((n) => n && (n.t === 'fight' || n.t === 'event') && !around(n).includes(t));
    if (list.length) pick(rng, list).t = t;
  }
  return g;
}
export const BOSS_ROW = SPIRE.rows;
export function nextNodes(R) {
  const g = R.map;
  if (!R.pos) return g[0].filter(Boolean);
  if (R.pos.r >= SPIRE.rows - 1) return [{ r: BOSS_ROW, c: 0, t: 'boss', next: [] }];
  return g[R.pos.r][R.pos.c].next.map((c) => g[R.pos.r + 1][c]);
}

// ---- 戦闘（3章）----
const floorTitle = (f) => String(f.name || '').replace(/^\d+階\s*/, '').replace(/（[ぁ-んー]+）/g, '');
function pickMonster(R, rng) {
  const act = ACTS[R.act];
  const list = (R.actFights < 2 ? act.weak : act.strong).filter((k) => k !== R.lastMonster);
  const k = pick(rng, list); R.lastMonster = k; R.actFights++;
  return k;
}
function pickElite(R, rng) {
  const act = ACTS[R.act], left = act.elites.filter((e) => !R.seenElites.includes(e));
  const k = pick(rng, left.length ? left : act.elites); R.seenElites.push(k);
  return k;
}
// レリック・ポーション → もんしょう（emblem）と祝福（bless）の値（game.js の newGame）
export function relicFx(R) {
  const em = { life: 0, handSize: 5, mulligan: 0, turnPing: 0, turnBolster: 0, turnTap: 0, swap: null, hand: [], basicCharge: false, startMana: 0, exactLife: 0, hooks: [], freeShuffle: true, stall: SPIRE.stall };
  const bl = { life: 0, ping: 0, exactPing: 0, bolster: 0, wither: 0, startMana: 0 };
  let basic = 0;
  for (const id of R.relics) {
    const r = RELIC_BY_ID[id]; if (!r) continue;
    for (const [k, v] of Object.entries(r.em || {})) {
      if (k === 'handSize') em.handSize += v; else if (k === 'ring') em.hand.push(SUN_RING); else if (k === 'basic') basic += v; else em[k] += v;
    }
    for (const [k, v] of Object.entries(r.bl || {})) bl[k] += v;
    if (r.hooks) em.hooks.push(r.hooks);
  }
  if (basic) em.swap = Object.fromEntries(Object.values(BASICS).map((d) => [d.id, boostBasic(d, basic)]));
  em.hand.push(...R.potions.map((id) => POTION_BY_ID[id]).filter(Boolean));
  return { emblem: em, bless: Object.values(bl).some(Boolean) ? bl : null };
}
// ライフを持つ敵（ラヴニカのギルド・寮・ボス）：はじめのライフに倍率
function scaleLife(f, mul) {
  if (mul === 1) return f;
  const st = f.setup;
  f.setup = (s, E) => { st.call(f, s, E); if (s.E.life > 0) { s.E.life = Math.round(s.E.life * mul); s.E.lifeMax = s.E.life; } };
  return f;
}
export function battleSetup(R, kind, rng) {
  if (!R.enc || R.enc.kind !== kind) R.enc = { kind, key: kind === 'fight' ? pickMonster(R, rng) : kind === 'elite' ? pickElite(R, rng) : ACTS[R.act].boss };
  const { key } = R.enc;
  const act = ACTS[R.act];
  let floor, diff = 'normal', buff = act.buff || 0;
  if (kind === 'fight') floor = monsterFloor(key, { lifeMul: (act.lifeMul || 1) * (asc(R, 2) ? 1.2 : 1), reveal: asc(R, 7) ? 1.25 : 1 });
  else {
    floor = scaleLife(FLOORS[key](), act.lifeMul || 1);
    const up = (d) => (d === 'easy' ? 'normal' : 'hard');
    diff = kind === 'boss' ? (asc(R, 4) ? up(act.bossDiff || 'normal') : act.bossDiff || 'normal') : asc(R, 8) ? 'hard' : 'normal';
    if (kind === 'elite') buff += SPIRE.eliteBuff + (asc(R, 3) ? 1 : 0);
    if (kind === 'boss') buff += act.bossBuff || 0;
  }
  withPeek(floor);
  const fx = relicFx(R);
  return { kind, key, floor, floorName: kind === 'boss' ? ACTS[R.act].bossName : floorTitle(floor), diff, buff, life: R.life, deck: deckDefs(R), emblem: fx.emblem, bless: fx.bless, cmd: cmdInZone(R) ? BY_ID[R.cmd] : null };
}
function goldRoll(R, kind, rng) {
  const [a, b] = SPIRE.goldOf[kind] || [0, 0];
  let g = a + Math.floor(rng() * (b - a + 1));
  if (asc(R, 9)) g *= 0.75;
  return Math.round(g * (1 + runVal(R, 'goldMul')));
}
function rollRar(rng, kind) {
  if (kind === 'boss') return 'R';
  const o = SPIRE.odds[kind] || SPIRE.odds.fight, x = rng();
  return x < o.R ? 'R' : x < o.R + o.U ? 'U' : 'C';
}
export function cardOffer(R, rng, kind, n = 3 + runVal(R, 'rewardPlus')) {
  const P = cardPool(R), out = [];
  for (let i = 0; i < n; i++) {
    let r = rollRar(rng, kind);
    if (r === 'R' && P.L.length && rng() < 1 / 8) r = 'L';
    const list = (P[r].length ? P[r] : P.C).filter((d) => !out.includes(d.id));
    if (list.length) out.push(pick(rng, list).id);
  }
  return out;
}
const potionRoll = (rng) => { const x = rng(), r = x < 0.6 ? 'C' : x < 0.9 ? 'U' : 'R'; return pick(rng, POTIONS.filter((d) => d.prar === r)).id; };
export function randomRelic(R, rng, rar = null, not = []) {
  if (!rar) { const x = rng(); rar = x < 0.5 ? 'C' : x < 0.83 ? 'U' : 'R'; }
  const free = (r) => !R.relics.includes(r.id) && !not.includes(r.id);
  const list = RELICS.filter((r) => r.rar === rar && free(r));
  const any = list.length ? list : RELICS.filter((r) => ['C', 'U', 'R'].includes(r.rar) && free(r));
  return any.length ? pick(rng, any).id : null;
}
// ボスのレリック：統率の冠（統率者を統率領域へ）は もつまで いつも 1つめに出る
export function bossRelics(R, rng, n = 3) {
  const crown = R.cmd && !R.relics.includes(CROWN) ? [CROWN] : [];
  return [...crown, ...shuffle(rng, RELICS.filter((r) => r.rar === 'B' && r.id !== CROWN && !R.relics.includes(r.id))).slice(0, n - crown.length).map((r) => r.id)];
}
export const CROWN = 'RL35';
export function gainRelic(R, id) {
  if (!id || R.relics.includes(id)) return;
  R.relics.push(id);
  const ml = RELIC_BY_ID[id]?.run?.maxLife || 0;
  if (ml) { R.maxLife += ml; R.life = Math.max(1, Math.min(R.maxLife, R.life + Math.max(0, ml))); }
  R.potions = R.potions.slice(0, potionSlots(R));
  // 統率の冠：デッキの統率者を統率領域へ（デッキからはぬく）
  if (RELIC_BY_ID[id]?.run?.cmdZone && R.cmd) { const i = R.deck.findIndex((e) => e.id === R.cmd); if (i >= 0) R.deck.splice(i, 1); }
}
export function afterBattle(R, set, res, rng) {
  R.potions = (res.potions ?? R.potions).slice(0, potionSlots(R));
  R.stats.exact += res.exact || 0;
  R.enc = null;
  if (!res.win) { R.life = 0; R.over = 'lose'; R.lostTo = set.floorName; return null; }
  R.life = Math.min(R.maxLife, Math.max(1, res.life) + runVal(R, 'winHeal'));
  R.stats[{ fight: 'fights', elite: 'elites', boss: 'bosses' }[set.kind]]++;
  const rw = { kind: set.kind, gold: goldRoll(R, set.kind, rng), cards: cardOffer(R, rng, set.kind), potion: null, relic: null, boss: null };
  if (set.kind !== 'boss') {
    if (rng() < R.potionChance + runVal(R, 'potionPlus')) { rw.potion = potionRoll(rng); R.potionChance = Math.max(0, R.potionChance - 0.1); }
    else R.potionChance = Math.min(1, R.potionChance + 0.1);
  }
  if (set.kind === 'elite') rw.relic = randomRelic(R, rng);
  if (set.kind === 'boss') rw.boss = bossRelics(R, rng, 3);
  return rw;
}

// ---- 報酬を受け取る ----
async function claimReward(R, io, rng) {
  const rw = R.pending;
  if (rw.gold) { R.gold += rw.gold; rw.gotGold = rw.gold; rw.gold = 0; }
  if (rw.relic) { gainRelic(R, rw.relic); rw.gotRelic = rw.relic; rw.relic = null; }
  if (rw.potion) {
    if (R.potions.length < potionSlots(R)) { R.potions.push(rw.potion); rw.gotPotion = rw.potion; }
    else if (potionSlots(R)) {
      const v = await io.choose({ id: 'potionFull', title: 'ポーションの枠がいっぱい', body: `${POTION_BY_ID[rw.potion].name}を手に入れた。どれかを捨てて入れかえる？`,
        options: [...R.potions.map((id, i) => ({ label: `${POTION_BY_ID[id].name}を捨てる`, value: i })), { label: '新しい方をあきらめる', value: -1 }] });
      if (v >= 0) { R.potions[v] = rw.potion; rw.gotPotion = rw.potion; }
    }
    rw.potion = null;
  }
  io.save(R);
  if (rw.boss?.length) {
    const id = await io.choose({ id: 'bossRelic', title: 'ボスのレリック', body: '1つ選ぶ。', options: rw.boss.map((x) => ({ label: RELIC_BY_ID[x].name, note: RELIC_BY_ID[x].text, value: x })) });
    gainRelic(R, id); rw.boss = null; io.save(R);
  }
  const got = rw.cards.length ? await io.pickReward(R, rw.cards, rw) : null;
  if (got) R.deck.push({ id: got, up: 0 });
  R.pending = null;
  if (rw.kind === 'boss') {
    if (R.act >= ACTS.length - 1) R.over = 'win';
    else {
      R.act++; R.pos = null; R.trail = []; R.actFights = 0; R.lastMonster = null;
      R.life = asc(R, 5) ? Math.min(R.maxLife, R.life + Math.round((R.maxLife - R.life) * 0.75)) : R.maxLife;
      R.map = genMap(rng, R);
    }
  }
  io.save(R);
}

// ---- お店 ----
export function shopStock(R, rng) {
  const P = cardPool(R), disc = runVal(R, 'discount');
  const price = (base) => Math.round(base * (0.9 + rng() * 0.2) * (1 - disc));
  const cards = [];
  for (const r of ['C', 'C', 'U', 'U', 'R']) {
    const list = P[r].filter((d) => !cards.some((c) => c.id === d.id));
    if (list.length) cards.push({ id: pick(rng, list).id, price: price(SPIRE.price[r]) });
  }
  if (cards.length) { const k = Math.floor(rng() * cards.length); cards[k].price = Math.round(cards[k].price / 2); cards[k].sale = true; }
  const relics = [];
  for (const r of ['C', 'U', 'R']) { const id = randomRelic(R, rng, r, relics.map((x) => x.id)); if (id) relics.push({ id, price: price(SPIRE.relicPrice[RELIC_BY_ID[id].rar] || 200) }); }
  const potions = shuffle(rng, [...POTIONS]).slice(0, 3).map((d) => ({ id: d.id, price: price(SPIRE.potionPrice[d.prar]) }));
  return { cards, relics, potions, removed: false };
}
async function doShop(R, io, rng) {
  if (!R.shop) { R.shop = shopStock(R, rng); io.save(R); }
  for (;;) {
    const S = R.shop, a = await io.shop(R, S);
    if (!a || a.k === 'leave') break;
    const it = S[{ card: 'cards', relic: 'relics', potion: 'potions' }[a.k]]?.[a.i];
    if (a.k === 'card' && it && !it.sold && R.gold >= it.price) { R.gold -= it.price; it.sold = true; R.deck.push({ id: it.id, up: 0 }); }
    if (a.k === 'relic' && it && !it.sold && R.gold >= it.price) { R.gold -= it.price; it.sold = true; gainRelic(R, it.id); }
    if (a.k === 'potion' && it && !it.sold && R.gold >= it.price && R.potions.length < potionSlots(R)) { R.gold -= it.price; it.sold = true; R.potions.push(it.id); }
    if (a.k === 'remove' && !S.removed && R.gold >= removePrice(R)) {
      const i = await io.pickCard(R, { id: 'remove', title: '取り除くカード' });
      if (i != null && R.deck[i]) { R.gold -= removePrice(R); R.removes++; S.removed = true; R.deck.splice(i, 1); }
    }
    io.save(R);
  }
  R.shop = null;
}

// ---- 休憩所 ----
async function doRest(R, io) {
  const heal = Math.min(restHeal(R), R.maxLife - R.life), ups = R.deck.some(canUp);
  for (;;) {
    const v = await io.choose({ id: 'rest', title: '休憩所', body: `ライフ ${R.life} / ${R.maxLife}`, options: [
      { label: `休む（ライフ ＋${heal}）`, value: 'rest', disabled: !canRest(R), note: canRest(R) ? `最大ライフの ${Math.round((SPIRE.restHeal + runVal(R, 'restPlus')) * 100)}%` : '黒き契約で休めない' },
      { label: '鍛える（カード 1枚を強化）', value: 'smith', disabled: !ups, note: 'クリーチャーは ＋1/＋1、ほかはコスト −1' },
    ] });
    if (v === 'rest') { R.life += heal; return; }
    if (v === 'smith') { const i = await io.pickCard(R, { id: 'upgrade', title: '強化するカード', filter: canUp }); if (i != null) { R.deck[i].up = 1; return; } continue; }
    return;
  }
}

// ---- 旅立ちの祝福（はじめ）----
const NEOW = [
  { k: 'life', label: '最大ライフ ＋8' }, { k: 'rare', label: 'レア 3枚から 1枚を加える' }, { k: 'remove', label: 'カードを 2枚取り除く' },
  { k: 'gold', label: '金貨 ＋100' }, { k: 'relic', label: 'ランダムなレリック（コモン）' }, { k: 'up', label: 'ランダムなカード 2枚を強化' },
];
async function doNeow(R, io, rng) {
  const opts = shuffle(rng, [...NEOW]).slice(0, 4);
  const v = await io.choose({ id: 'neow', title: '旅立ちの祝福', body: '次元を渡る旅のはじめに、1つ授かる。', options: opts.map((o) => ({ label: o.label, value: o.k })) });
  if (v === 'life') { R.maxLife += 8; R.life += 8; }
  if (v === 'gold') R.gold += 100;
  if (v === 'relic') gainRelic(R, randomRelic(R, rng, 'C'));
  if (v === 'rare') { const ids = cardOffer(R, rng, 'boss'); const id = await io.pickReward(R, ids, { kind: 'neow' }); if (id) R.deck.push({ id, up: 0 }); }
  if (v === 'remove') for (let k = 0; k < 2; k++) { const i = await io.pickCard(R, { id: 'remove', title: `取り除くカード（${k + 1} / 2）` }); if (i != null) R.deck.splice(i, 1); }
  if (v === 'up') for (const e of shuffle(rng, R.deck.filter(canUp)).slice(0, 2)) e.up = 1;
}

// ---- イベント（6章）----
// 24 をつくる式：4つの数と、正しい式 1つ・ちがう式 2つ
const OPS = ['＋', '−', '×', '÷'];
const ap = (a, o, b) => (o === 0 ? a + b : o === 1 ? a - b : o === 2 ? a * b : b === 0 ? NaN : a / b);
const FORMS = [
  (n, o) => [ap(ap(ap(n[0], o[0], n[1]), o[1], n[2]), o[2], n[3]), `((${n[0]} ${OPS[o[0]]} ${n[1]}) ${OPS[o[1]]} ${n[2]}) ${OPS[o[2]]} ${n[3]}`],
  (n, o) => [ap(ap(n[0], o[0], n[1]), o[1], ap(n[2], o[2], n[3])), `(${n[0]} ${OPS[o[0]]} ${n[1]}) ${OPS[o[1]]} (${n[2]} ${OPS[o[2]]} ${n[3]})`],
  (n, o) => [ap(n[0], o[0], ap(n[1], o[1], ap(n[2], o[2], n[3]))), `${n[0]} ${OPS[o[0]]} (${n[1]} ${OPS[o[1]]} (${n[2]} ${OPS[o[2]]} ${n[3]}))`],
];
const near24 = (v) => Math.abs(v - 24) < 1e-9;
export function puzzle24(rng) {
  for (let t = 0; t < 400; t++) {
    const n = [0, 0, 0, 0].map(() => 1 + Math.floor(rng() * 9));
    const sols = [];
    for (let f = 0; f < FORMS.length; f++) for (let i = 0; i < 64; i++) { const o = [i & 3, (i >> 2) & 3, (i >> 4) & 3]; const [v, txt] = FORMS[f](n, o); if (near24(v)) sols.push({ f, o, txt }); }
    if (!sols.length) continue;
    const ok = pick(rng, sols), wrong = [];
    for (let k = 0; k < 20 && wrong.length < 2; k++) {
      const o = [...ok.o]; o[Math.floor(rng() * 3)] = Math.floor(rng() * 4);
      const [v, txt] = FORMS[ok.f](n, o);
      if (Number.isFinite(v) && !near24(v) && !wrong.includes(txt)) wrong.push(txt);
    }
    if (wrong.length < 2) continue;
    return { nums: n, answer: ok.txt, options: shuffle(rng, [ok.txt, ...wrong]) };
  }
  return { nums: [1, 2, 3, 4], answer: '((1 ＋ 2) ＋ 3) × 4', options: ['((1 ＋ 2) ＋ 3) × 4', '((1 × 2) ＋ 3) × 4', '((1 ＋ 2) × 3) × 4'] };
}
const leave = { label: '立ち去る', value: 'leave' };
async function doEvent(R, io, rng, id) {
  const ev = EVENTS.find((e) => e.id === id);
  const ask = (options, body = ev.text) => io.choose({ id: `ev:${id}`, title: ev.name, body, options });
  if (id === 'pot') {
    const bag = shuffle(rng, [1, 1, 1, 1, 2, 2, 2, 3, 3]);
    let sum = 0;
    for (;;) {
      const rest = [1, 2, 3].map((k) => `${k} が ${bag.filter((x) => x === k).length}個`).join('・');
      const v = await ask([{ label: '石を引く', value: 'draw', disabled: !bag.length }, { label: `やめる（金貨 ＋${sum * 10}${sum === 7 ? '・ぴったりの おまけ ＋30' : ''}）`, value: 'stop' }],
        `${ev.text}\n\nいまの合計：${sum}　鍋の中：${rest}`);
      if (v === 'draw') {
        sum += bag.pop();
        if (sum > 7) { R.life = Math.max(1, R.life - 6); await ask([{ label: 'つづける', value: 'ok' }], `合計 ${sum}。鍋が爆発した！ ライフ −6、金貨はなし。`); return; }
        continue;
      }
      R.gold += sum * 10 + (sum === 7 ? 30 : 0); return;
    }
  }
  if (id === 'sphinx') {
    const P = puzzle24(rng);
    const v = await ask([...P.options.map((t) => ({ label: t, value: t })), leave], `${ev.text}\n\n数：${P.nums.join('・')}`);
    if (v === 'leave') return;
    if (v === P.answer) { const r = randomRelic(R, rng, 'U'); gainRelic(R, r); await ask([{ label: 'つづける', value: 'ok' }], `正解。スフィンクスはレリック「${RELIC_BY_ID[r]?.name || '−'}」を授けた。`); }
    else { R.life = Math.max(1, R.life - 6); await ask([{ label: 'つづける', value: 'ok' }], `ちがう。正しい式は ${P.answer}。スフィンクスの爪がかすめた（ライフ −6）。`); }
    return;
  }
  if (id === 'blood') {
    const v = await ask([{ label: 'ライフ −8：レア 3枚から 1枚', value: 'deal', disabled: R.life <= 8 }, leave]);
    if (v !== 'deal') return;
    R.life -= 8;
    const got = await io.pickReward(R, cardOffer(R, rng, 'boss'), { kind: 'event' });
    if (got) R.deck.push({ id: got, up: 0 });
    return;
  }
  if (id === 'spring') {
    const v = await ask([{ label: 'カードを 1枚沈める（取り除く）', value: 'rm' }, leave]);
    if (v !== 'rm') return;
    const i = await io.pickCard(R, { id: 'remove', title: '取り除くカード' });
    if (i != null) R.deck.splice(i, 1);
    return;
  }
  if (id === 'forge') {
    const v = await ask([{ label: 'カードを 1枚鍛える', value: 'one', disabled: !R.deck.some(canUp) }, { label: '炉に手を入れる：ランダムに 2枚強化・ライフ −5', value: 'two', disabled: !R.deck.some(canUp) || R.life <= 5 }, leave]);
    if (v === 'one') { const i = await io.pickCard(R, { id: 'upgrade', title: '強化するカード', filter: canUp }); if (i != null) R.deck[i].up = 1; }
    if (v === 'two') { R.life -= 5; for (const e of shuffle(rng, R.deck.filter(canUp)).slice(0, 2)) e.up = 1; }
    return;
  }
  if (id === 'merchant') {
    const v = await ask([{ label: '金貨 80：ランダムなレリック', value: 'buy', disabled: R.gold < 80 }, leave]);
    if (v === 'buy') { R.gold -= 80; gainRelic(R, randomRelic(R, rng, rng() < 0.6 ? 'C' : 'U')); }
    return;
  }
  if (id === 'mirror') {
    const v = await ask([{ label: 'カードを 1枚ふやす', value: 'dup' }, leave]);
    if (v !== 'dup') return;
    const i = await io.pickCard(R, { id: 'dup', title: 'ふやすカード', filter: (e) => !defOf(e.id)?.curse });
    if (i != null) R.deck.push({ ...R.deck[i] });
    return;
  }
  if (id === 'stars') {
    const v = await ask([{ label: 'カードを 1枚変える（同じレア度のランダムなカード）', value: 'tr' }, leave]);
    if (v !== 'tr') return;
    const i = await io.pickCard(R, { id: 'transform', title: '変えるカード' });
    if (i == null) return;
    const d = defOf(R.deck[i].id), P = cardPool(R), list = (P[d.rar] || P.C).filter((x) => x.id !== d.id);
    R.deck[i] = { id: pick(rng, list.length ? list : P.C).id, up: 0 };
    return;
  }
  if (id === 'map') {
    const v = await ask([{ label: '近い方：金貨 ＋50', value: 'near' }, { label: '奥の方：金貨 ＋120・ライフ −10', value: 'far', disabled: R.life <= 10 }]);
    if (v === 'near') R.gold += 50;
    if (v === 'far') { R.gold += 120; R.life -= 10; }
    return;
  }
  if (id === 'shrine') {
    const v = await ask([{ label: '最大ライフ ＋5', value: 'max' }, { label: `ライフ ＋15`, value: 'heal' }, { label: 'ポーションを 1つ', value: 'pot', disabled: R.potions.length >= potionSlots(R) }]);
    if (v === 'max') { R.maxLife += 5; R.life += 5; }
    if (v === 'heal') R.life = Math.min(R.maxLife, R.life + 15);
    if (v === 'pot') R.potions.push(potionRoll(rng));
  }
}

// ---- 1マスすすめる。画面とシミュレーションで共通 ----
async function playNode(R, io, rng) {
  const at = R.at;
  if (at.t === 'event' && !at.ev) {
    const x = rng();
    at.ev = x < 0.1 ? 'fight' : x < 0.13 ? 'shop' : x < 0.15 ? 'treasure' : pick(rng, EVENTS.filter((e) => e.id !== R.lastEvent)).id;
    if (EVENTS.some((e) => e.id === at.ev)) R.lastEvent = at.ev;
    io.save(R);
  }
  const kind = at.t === 'event' && ['fight', 'shop', 'treasure'].includes(at.ev) ? at.ev : at.t;
  const done = () => { if (at.r < SPIRE.rows) { R.pos = { r: at.r, c: at.c }; (R.trail ||= []).push(R.pos); } R.at = null; R.floor++; };
  if (kind === 'fight' || kind === 'elite' || kind === 'boss') {
    const set = battleSetup(R, kind, rng);
    io.save(R);
    const res = await io.battle(R, set);
    if (!res) return false; // とちゅうでやめた：マスのはじめから
    const rw = afterBattle(R, set, res, rng);
    done();
    if (rw) R.pending = rw;
    io.save(R);
    return true;
  }
  if (kind === 'shop') await doShop(R, io, rng);
  else if (kind === 'rest') await doRest(R, io);
  else if (kind === 'treasure') {
    const id = at.relic || (at.relic = randomRelic(R, rng));
    io.save(R);
    await io.choose({ id: 'treasure', title: '宝箱', body: id ? `レリック「${RELIC_BY_ID[id].name}」：${RELIC_BY_ID[id].text}` : '空っぽだった。', options: [{ label: '受け取る', value: 1 }] });
    gainRelic(R, id);
  } else await doEvent(R, io, rng, at.ev);
  done();
  io.save(R);
  return true;
}
// 冒険をすすめる（つづきからも、ここから）。io.pickNode が null（やめる）なら もどる
export async function runLoop(R, io, rng) {
  if (R.phase === 'neow') { await doNeow(R, io, rng); R.phase = 'map'; io.save(R); }
  while (!R.over) {
    if (R.pending) { await claimReward(R, io, rng); continue; }
    if (!R.at) {
      const node = await io.pickNode(R, nextNodes(R));
      if (!node) return false;
      R.at = { r: node.r, c: node.c, t: node.t };
      io.save(R);
    }
    if (!(await playNode(R, io, rng))) return false;
  }
  await io.end(R);
  return true;
}
// スコア：のぼったマス ×5 ＋ エリート ×10 ＋ ボス ×50 ＋ ぴったり（ボスをぜんぶたおすと ＋100）
export const scoreOf = (R) => R.floor * 5 + R.stats.elites * 10 + R.stats.bosses * 50 + R.stats.exact + (R.over === 'win' ? 100 : 0) + R.asc * 20;

// ---- AI（シミュレーション）----
const valueOf = (id) => { const d = defOf(id); return d ? cardValue(d) + (d.types.includes('creature') ? 0.5 : 0) : 0; };
const worstCard = (R, filter = () => true) => {
  let bi = null, bv = Infinity;
  R.deck.forEach((e, i) => { if (!filter(e)) return; const d = defOf(e.id); const v = d.curse ? -10 : d.basic ? 1 : valueOf(e.id) + (e.up ? 1 : 0); if (v < bv) { bv = v; bi = i; } });
  return bi;
};
const bestCard = (R, filter = () => true) => {
  let bi = null, bv = -Infinity;
  R.deck.forEach((e, i) => { if (!filter(e)) return; const v = valueOf(e.id) + (defOf(e.id).types.includes('creature') ? 1 : 0); if (v > bv) { bv = v; bi = i; } });
  return bi;
};
export function aiIO(rng, fightFn) {
  const io = {
    R: null, // シミュレーションの冒険（choose で ライフを見る）
    save() {}, end() {},
    pickNode(R, nodes) {
      const lowLife = R.life < R.maxLife * 0.5;
      const score = (n) => ({ rest: lowLife ? 5 : 1, elite: R.life > R.maxLife * 0.7 ? 3 : 0, shop: R.gold >= 150 ? 3 : 1, fight: 2, event: 2, treasure: 4, boss: 9 }[n.t] ?? 1) + rng();
      return [...nodes].sort((a, b) => score(b) - score(a))[0];
    },
    choose({ id, body, options }) {
      const ok = options.filter((o) => !o.disabled);
      const by = (v) => ok.find((o) => o.value === v)?.value;
      const R = io.R;
      if (id === 'rest') return R && R.life < R.maxLife * 0.6 ? by('rest') ?? by('smith') : by('smith') ?? by('rest');
      if (id === 'neow') return by('remove') ?? by('rare') ?? by('relic') ?? ok[0].value;
      if (id === 'ev:pot') { const sum = Number((/いまの合計：(\d+)/.exec(body || '') || [])[1] || 0); return sum <= 4 && by('draw') ? 'draw' : by('stop') ?? ok[0].value; }
      if (id === 'ev:sphinx') return ok[0].value; // AI は式を読まない
      if (id === 'ev:blood') return by('leave');
      if (id === 'ev:map') return by('near');
      if (id === 'ev:shrine') return by('max');
      if (id === 'potionFull') return -1;
      return ok[0]?.value;
    },
    pickCard(R, { id, filter }) {
      if (id === 'remove' || id === 'transform') return worstCard(R, filter);
      return bestCard(R, filter || (() => true));
    },
    pickReward(R, ids) {
      const best = [...ids].sort((a, b) => valueOf(b) - valueOf(a))[0];
      return R.deck.length < 22 || valueOf(best) >= 4.5 ? best : null;
    },
    shop(R, S) {
      if (!S.removed && R.gold >= removePrice(R) && R.deck.some((e) => defOf(e.id).basic || defOf(e.id).curse)) return { k: 'remove' };
      const r = S.relics.findIndex((x) => !x.sold && R.gold >= x.price);
      if (r >= 0) return { k: 'relic', i: r };
      const c = S.cards.map((x, i) => [x, i]).filter(([x]) => !x.sold && R.gold >= x.price && valueOf(x.id) >= 4.5).sort((a, b) => valueOf(b[0].id) - valueOf(a[0].id))[0];
      if (c) return { k: 'card', i: c[1] };
      return { k: 'leave' };
    },
    battle: fightFn,
  };
  return io;
}
