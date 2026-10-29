// ルールエンジン（画面と分離。シミュレーションでも本番でも使う）
// プレイヤー（P）とチャレンジ・デッキの敵（E）の1戦ぶん。判断は s.ai（ai.js）、各階のルールは s.floor（data/enemies.js）
import { seeded, shuffle } from './rng.js';

let UID = 1;
let CUR = null; // いまの ゲーム（s を うけとらない pump から ゼンゼロの ブレイクを ためる ため）
export const COLORS = ['W', 'U', 'K', 'G', 'R'];
export const colorsOf = (d) => [...(d.color || '')].filter((c) => COLORS.includes(c));
export const is = (p, t) => (p.def.types || []).includes(t);
export const isCreature = (p) => is(p, 'creature');
// プレインズウォーカー：ちゅうせい（p.loy）が ある。ダメージで へって、0で 墓地へ（REQUIREMENTS 3.6）
export const isPW = (p) => is(p, 'planeswalker');
export const onBf = (s, p) => s[p.side].bf.includes(p);
export const card = (def) => ({ uid: UID++, def });
// 攻撃・ブロック できない（信心の 神は 数の 条件で かわる：関数）
export const cant = (s, p, k) => { const v = p.def[k]; return typeof v === 'function' ? !!v(s, p, api) : !!v; };

// カードの効果・各階のルールから使う関数をまとめたもの（ai.js がAI用の関数を足す）
export const api = {};

// emblem：もんしょう（data/emblems.js の emblemEffects。REQUIREMENTS 12章）。ぼうけんの たたかい だけ
// bless：むげんの とうの 祝福（data/blessings.js の blessFx）。buff：むげんの とうで てきの クリーチャーが ＋buff/＋buff
export function newGame({ deck, floor, diff = 'normal', seed = 1, reshuffle = true, ai, log = false, emblem = null, bless = null, buff = 0, cmd = null, cmdOpt = {}, life = null }) {
  const em = emblem || {};
  if (em.swap) deck = deck.map((d) => em.swap[d.id] || d);
  const rng = seeded(seed);
  const s = {
    rng, diff, reshuffle, ai, logOn: log, logs: [],
    turn: 0, active: 'P', over: null, floor, phase: 1, combat: null, lastCombat: [],
    P: { side: 'P', life: 20 + (em.life || 0) + (bless?.life || 0), bless, handSize: em.handSize || HAND_SIZE, lib: shuffle(rng, deck.map((d) => card(d))), cols: new Set(deck.flatMap(colorsOf)), hand: [], mana: [], bf: [], gy: [], exile: [], suspended: [], noLifeGain: false, flags: {}, emblem: em, srDeck: deck.some((d) => /^SR\d/.test(d.id || '')), zzDeck: deck.some((d) => /^ZZ\d/.test(d.id || '')) },
    E: { side: 'E', lib: [], bf: [], gy: [], exile: [], life: 0, key: 0, extraTurns: 0, flags: {}, buff },
    stats: { exact: 0, playerTurns: 0, lifeLost: 0, reshuffled: 0 },
  };
  if (cmd) setCommander(s.P, cmd, cmdOpt);
  if (life) s.P.life = life;
  if (!floor.shieldWrapped) { const fu = floor.untargetable; floor.untargetable = (s2, p, E) => !!fu?.(s2, p, E) || shielded(s2, p); floor.shieldWrapped = true; }
  floor.setup(s, api);
  for (let i = 0; i < s.P.handSize; i++) drawCard(s);
  // マリガン（もんしょう）：人は 画面で きめる（ai.manualMulligan）。AI は きほんカードと 3マナ いかの カードが なければ ひきなおす
  if (em.mulligan && !ai?.manualMulligan && wantMulligan(s)) mulligan(s);
  // はじまりの もんしょう：はじめの てふだに たいようの ゆびわ（6まいめ）・さいしょから マナゾーンに きほんカード
  for (const d of em.hand || []) { const c = card(d); c.emblem = true; s.P.hand.push(c); L(s, `もんしょう：${d.name} を てふだに`); }
  if (em.startMana) rampBasic(s, em.startMana);
  if (bless?.startMana) { rampBasic(s, bless.startMana); L(s, `しゅくふく：マナゾーンに きほんカード ${bless.startMana}まい`); }
  CUR = s;
  return s;
}

// 統率者戦（RAID.md 3.2）：統率者は 統率領域（cmd）に いて、いつでも 唱えられる。唱える たびに ＋2マナ（統率者税）
// o = { step: 統率者税の 段（ふつう 2）, less: 安く なる マナ（レイドの 人間の 長は 1） }
// ねらいかた（2026-10-27）：てきを ねらう こうかは レアリティで きまる。低学年なので 自分で えらぶ ところを しぼる
// コモン＝ランダム（'rand'）、アンコモン・きほん＝パワーが いちばん 大きい てき（'most'）、レア・レジェンド＝自分で えらぶ（null）
// ただし 自分で えらぶ ままの もの（PICK_FREE）：格闘・かみつき（ランダムだと つよい てきに あたって 自分が そんする）と、もともと よわい もの（1点・−1/−1 1こ・留置・1体を タップ）
export const PICK_FREE = new Set(['G08', 'G19', 'G27', 'G30', 'SR70', 'TE03', 'FG67', 'ZZ79', 'RV27', 'U14', 'B04', 'B06', 'ZZ60', 'ZZ62', 'ZZ33', 'FG54', 'SR27', 'U03', 'FG31', 'FG41']);
export const pickOf = (d) => (!d || d.token || !d.rar || PICK_FREE.has(d.id) ? null : d.rar === 'C' ? 'rand' : d.rar === 'U' || d.rar === 'B' ? 'most' : null);
const PICK_KEYS = ['play', 'apply', 'etb', 'onAttack', 'onAttacks', 'onDie', 'onCombatHit', 'onFaceHit', 'onKill', 'upkeep', 'onTapped', 'onExact', 'onDamageCreature', 'onMinus', 'onCounters', 'onDraw', 'onOtherEnter', 'onAllyHit', 'onAnyCast', 'onPWAttacked', 'onLeaveSelf', 'onOtherLeave', 'onHurt'];
// カードの こうかを 動かす あいだだけ s.pickMode を つける（ai.js の burnTarget が 見る）。play が かえす run も おなじ
// せりふ（docs/LORE.md の「とき」）：カードの 能力が うごいて なにか おきたら（ログが ふえたら）s.say(パーマネント, とき) を よぶ。画面が ふきだしを 出す
const SAY_WHEN = { onAttack: 'attack', onAttacks: 'attack', onCombatHit: 'hit', onFaceHit: 'hit', onDamageCreature: 'hit', onDie: 'die', onKill: 'kill', upkeep: 'turn', combatStart: 'combat', onOtherEnter: 'ally', onOtherLeave: 'ally', onCast: 'cast', onTargeted: 'targeted', pittari: 'break', onDraw: 'draw', onBlock: 'block', act: 'act' }; // とき（LORE.md）→ gen_texts.py の WHEN
const SAY_ONLY = ['pittari', 'combatStart', 'onCast', 'onTargeted', 'onBlock', 'onHostAttack', 'onEquip']; // ねらいかたとは かんけい ない きっかけ
const permOf = (args, d) => args.find((a) => a && typeof a === 'object' && a.uid && a.def?.id === d.id);
function said(s, args, d, key, f) {
  const w = SAY_WHEN[key], p = w && s.say && permOf(args, d);
  if (!p) return f();
  const sig = () => `${Object.entries(p).filter(([, v]) => typeof v === 'number').map(([k, v]) => k + v).join(',')}|${s.logs.length}|${s.P.life}|${s.E.life}|${s.P.bf.length}|${s.E.bf.length}|${s.P.hand.length}|${p.ctr}|${p.np}|${s.P.sp}|${s.P.bon}|${s.P.mana.length}|${s.P.gy.length}|${s.E.gy.length}|${[...s.P.bf, ...s.E.bf].reduce((a, q) => a + (q.ctr || 0) * 3 + (q.minus || 0) * 5 + q.dmg * 7 + (q.tapped ? 11 : 0), 0)}`;
  const n = sig(), r = f();
  if (sig() !== n) s.say(p, w); // なにか かわった（ログ・ライフ・カウンター など）
  return r;
}
// s.srcDef：いま うごいて いる こうかの カード（「2色の カードの 対象に ならない」などで 見る）
function wrapPick(fn, mode, d, key) {
  if (typeof fn !== 'function') return fn;
  if (fn.picked) { if (fn.owner === d) return fn; fn = fn.orig || fn; } // ほかの カードと おなじ 関数（宝具・増殖 など）：その カード用に つつみなおす
  const set = (s, f) => { const was = s.pickMode, wd = s.srcDef; if (!wd) s.tgtSeen = new Set(); s.pickMode = mode; s.srcDef = d; try { return f(); } finally { s.pickMode = was; s.srcDef = wd; } };
  const w = function (...args) {
    const s = args[0];
    if (!s || typeof s !== 'object' || !s.P) return fn.apply(this, args);
    return set(s, () => { const r = key === 'act' && args.length < 5 ? fn.apply(this, args) : said(s, args, d, key, () => fn.apply(this, args)); if (r && typeof r.run === 'function' && !r.run.picked) { const run = r.run; r.run = (...a) => set(s, () => (key === 'act' ? said(s, args, d, key, () => run(...a)) : run(...a))); r.run.picked = true; } return r; });
  };
  w.picked = true; w.orig = fn; w.owner = d;
  return w;
}
// レアの 戦闘中の 効果（def.trigTgt）：人が さきに えらんで おいた あいて（p.trigPick）を 1回だけ つかう
export function takePick(s, p) { const t = p.trigPick; p.trigPick = null; return t === 'face' || (t && onBf(s, t)) ? t : null; }
export function applyPick(d) {
  const mode = pickOf(d);
  for (const k of [...PICK_KEYS, ...SAY_ONLY]) if (d[k]) d[k] = wrapPick(d[k], mode, d, k);
  if (d.acts) d.acts = d.acts.map((a) => ({ ...a })); // ほかの カードと おなじ 能力の オブジェクト（宝具）を こわさない
  for (const a of d.acts || []) for (const k of ['play', 'apply']) if (a[k]) a[k] = wrapPick(a[k], mode, d, 'act');
  for (const a of d.modes || []) for (const k of ['play', 'apply']) if (a[k]) a[k] = wrapPick(a[k], mode, d);
  return d;
}

// 装備の コスト（マスター：1 少なく なる。何まい あっても かさならない）
export const equipCost = (s, p) => Math.max(0, (p.def.equip || 0) - (s[p.side].bf.some((q) => q.def.equipLess) ? 1 : 0));
export function setCommander(side, def, o = {}) { side.cmd = [card(def)]; side.cmdId = def.id; side.cmdCasts = 0; side.cmdStep = o.step ?? 2; side.cmdLess = o.less || 0; if (isZZ(def)) side.zzDeck = true; }
export const cmdTax = (s) => (s.P.cmdStep ?? 2) * (s.P.cmdCasts || 0);
// 統率領域から 唱える コスト ＝ コスト − 安く なる ぶん ＋ 統率者税（色の ぶんは のこる）
export const cmdCost = (s, d) => Math.max(colorsOf(d).length, costOf(s, d) - (s.P.cmdLess || 0) + cmdTax(s));
const wantMulligan = (s) => !s.P.hand.some((c) => c.def.basic) || !s.P.hand.some((c) => !c.def.basic && c.def.cost <= 3);
// はじめの てふだを やまふだに もどして、おなじ まいすう ひきなおす（もんしょうの カードは のこす）
export function mulligan(s) {
  const back = s.P.hand.filter((c) => !c.emblem);
  s.P.hand = s.P.hand.filter((c) => c.emblem);
  s.P.lib = shuffle(s.rng, [...s.P.lib, ...back]);
  drawCard(s, back.length);
  L(s, `マリガン：てふだを ${back.length}まい ひきなおした`);
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
  P.flags.cast = 0; P.flags.charged = false; P.flags.attacked = false;
  for (const c of P.hand) c.locked = false;
  for (const p of P.bf) { untap(s, p); p.sick = false; p.flags.turn = {}; }
  for (const m of P.mana) m.tapped = false;
  // ヴァンガード（もんしょう）：ターンの はじめに てきに 1点・こぶ1
  if (P.emblem?.turnPing) { L(s, `ヴァンガード：てきに ${P.emblem.turnPing}点`); hitEnemy(s, P.emblem.turnPing, null); }
  if (P.emblem?.turnBolster) bolster(s, P.emblem.turnBolster);
  // むげんの とうの 祝福：ターンの はじめ
  const bl = P.bless;
  if (bl?.ping) { L(s, `しゅくふく：てきに ${bl.ping}点`); hitEnemy(s, bl.ping, null); }
  if (bl?.bolster) { L(s, `しゅくふく：＋1/＋1カウンター ${bl.bolster}こ`); bolster(s, bl.bolster); }
  if (bl?.wither) { const t = s.E.bf.filter(isCreature).sort((a, b) => power(s, b) - power(s, a))[0]; if (t) { L(s, `しゅくふく：${t.def.name} に −1/−1カウンター ${bl.wither}こ`); addMinus(s, t, bl.wither); sba(s); } }
  if (P.emblem?.turnTap) for (const t of s.E.bf.filter((p) => isCreature(p) && !p.tapped).sort((a, b) => power(s, b) - power(s, a)).slice(0, P.emblem.turnTap)) { t.tapped = true; L(s, `ヴァンガード：${t.def.name} を タップ`); }
  s.floor.playerUpkeep?.(s, api);
  const waits = [];
  for (const p of [...P.bf]) if (onBf(s, p) && p.def.upkeep) { const r = p.def.upkeep(s, p, api); if (r && r.then) waits.push(r); }
  // 待機：時間カウンターを1個とって、0になったら コストを払わずに唱える
  const ready = [];
  for (const x of P.suspended) { x.n--; if (x.n <= 0) ready.push(x); }
  P.suspended = P.suspended.filter((x) => x.n > 0);
  const rest = () => {
    sba(s); if (s.over) return; refill(s);
    for (const p of [...P.bf]) if (onBf(s, p) && p.def.afterRefill) p.def.afterRefill(s, p, api); // 手札の 補充の あと（祠）
    sba(s);
  };
  const castReady = () => ready.reduce((w, x) => w.then(() => api.castSuspended(s, x.c)), Promise.resolve());
  // 占術（海の神タッサ）や 待機の 対象を 画面で聞くときは、答えを待ってから引く
  if (waits.length || (ready.length && s.ai.castSuspended)) return Promise.all(waits).then(castReady).then(rest);
  for (const x of ready) api.castSuspended(s, x.c);
  rest();
}

export function endPlayerTurn(s) {
  notePower(s);
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
    if (!P.lib.length) return; // ライフを 失って 引いた（ラクドス）あとで なくなる ことが ある
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
  const size = s.P.flags.refill7 === s.stats.playerTurns ? 7 : (s.P.handSize || HAND_SIZE); // ヴァンガードで 4〜6まい
  const n = size - s.P.hand.filter((c) => !c.advDone).length; // 出来事を つかった カードは かぞえない
  if (n <= 0) return;
  drawCard(s, n);
  L(s, `${foe(s, 'P')}てふだを ${size}まいに した（${n}まい 引いた）`);
}

// 手札を 捨てる（怪物化などの コスト）。捨てた カードは 墓地へ
export function discard(s, cards) {
  for (const c of cards) { const i = s.P.hand.indexOf(c); if (i >= 0) { s.P.hand.splice(i, 1); s.P.gy.push(c); } }
  if (cards.length) L(s, `${foe(s, 'P')}すてた：${cards.map((c) => c.def.name).join('、')}`);
  for (const q of [...s.P.bf]) if (q.def.onDiscard && onBf(s, q)) q.def.onDiscard(s, q, api, cards.length);
  for (const c of cards) if (c.def.madness && s.P.gy.includes(c)) api.madness?.(s, c); // マッドネス：すてたら 安く 唱えられる
}

export function rampTop(s) {
  if (!s.P.lib.length) return;
  const c = s.P.lib.shift();
  s.P.mana.push({ ...c, tapped: true });
  return manaIn(s, 1);
}

// やまふだから きほんカードを n まい さがして、タップ状態で マナゾーンに（MTG の「基本土地を さがす」。強い カードを マナに しない）
export function rampBasic(s, n = 1) {
  let k = 0;
  for (; k < n; k++) {
    const i = s.P.lib.findIndex((c) => c.def.basic);
    if (i < 0) break;
    const [c] = s.P.lib.splice(i, 1);
    s.P.mana.push({ ...c, tapped: true });
  }
  if (k) { s.P.lib = shuffle(s.rng, s.P.lib); L(s, `${foe(s, 'P')}きほんカードを ${k}まい さがして マナゾーンへ`); manaIn(s, k); }
  return k;
}
export const basicsInLib = (s) => s.P.lib.filter((c) => c.def.basic).length;

// 上陸（第3弾の 緑）：マナゾーンに カードが 置かれるたび（1まい ごとに 1回）
export function manaIn(s, n) {
  if (s.P.flags.manaInT !== s.turn) s.P.flags.manaInN = 0;
  s.P.flags.manaInT = s.turn; s.P.flags.manaInN += n; // この ターンに マナゾーンに 置いた 数（あらわれる 数列 G107）
  for (let i = 0; i < n; i++) for (const q of [...s.P.bf]) if (q.def.landfall && onBf(s, q)) { L(s, `じょうりく：${q.def.name}`); q.def.landfall(s, q, api); }
}
export const landfallNow = (s) => s.P.flags.manaInT === s.turn;
export const manaInNow = (s) => (s.P.flags.manaInT === s.turn ? s.P.flags.manaInN : 0);
export const gainedNow = (s) => (s.P.flags.gainedT === s.turn ? s.P.flags.gainedN : 0);

export function charge(s, c, tapped = colorsOf(c.def).length > 1) {
  s.P.hand.splice(s.P.hand.indexOf(c), 1);
  s.P.mana.push({ ...c, tapped });
  L(s, `${foe(s, 'P')}マナ：${c.def.name}`);
  manaIn(s, 1);
  // きほんの もんしょう レベル2：きほんカードを マナに おくと、その こうかも おきる（あいては じどうで えらぶ。占術は 人が えらぶ ので Promise を かえす）
  if (c.def.basic && s.P.emblem?.basicCharge) {
    const r = c.def.play?.(s, api, { phase: 2, c, charge: true });
    if (r) { L(s, `もんしょう：${c.def.name} の こうか`); return r.run(); }
  }
}

// ---- パーマネント ----
function makePerm(side, def, o = {}) {
  return {
    uid: UID++, def, card: o.card || def, side, tapped: !!o.tapped, sick: true, ctr: o.ctr || 0, level: 0, dmg: 0, dt: false, dmgBy: [],
    mP: 0, mT: 0, kwT: new Set(), frozen: false, token: !!o.token, monstrous: false, attached: null, links: [], flags: { turn: {} },
    loy: (def.types || []).includes('planeswalker') ? def.loyalty || 0 : 0,
  };
}

export function enter(s, side, def, o = {}) {
  const p = makePerm(side, def, o);
  s[side].bf.push(p);
  L(s, `${foe(s, side)}${def.name} が せんじょうに 出た`);
  if (def.etb) def.etb(s, p, api, o);
  if (!onBf(s, p)) return p;
  if (isCreature(p)) {
    if (side === 'P') { s.P.flags.enteredThisTurn = true; s.stats.maxCreatures = Math.max(s.stats.maxCreatures || 0, s.P.bf.filter(isCreature).length); }
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
  for (const q of s[side].bf) if (q.def.tokenMult) n *= q.def.tokenMult; // 倍化（トークンが 2倍）
  for (let i = 0; i < n; i++) {
    if (s[side].bf.filter(isCreature).length >= MAX_CREATURES) break;
    out.push(enter(s, side, def, { ...o, token: true }));
  }
  return out;
}

// Lvアップ：いまの レベルで 使う 段（なければ null）
export const levelRow = (p) => (p.def.levels ? [...p.def.levels].reverse().find((r) => p.level >= r.at) || null : null);

// もとの パワー・タフネス（カウンター・修整・装備・オーラの まえ）。画面で 上がった・下がったを 色に する
export function basePT(s, p) {
  const d = levelRow(p) || p.def;
  const P = p.setPT ? p.setPT[0] : p.base2 ? 2 : typeof d.pow === 'function' ? d.pow(s, p, api) : (d.pow ?? 0);
  const T = p.setPT ? p.setPT[1] : typeof d.tou === 'function' ? d.tou(s, p, api) : (d.tou ?? 0);
  return p.auraPT && !p.setPT ? [...p.auraPT] : [P, T];
}
export function pt(s, p) {
  const d = levelRow(p) || p.def;
  let P = typeof d.pow === 'function' ? d.pow(s, p, api) : (d.pow ?? 0);
  let T = typeof d.tou === 'function' ? d.tou(s, p, api) : (d.tou ?? 0);
  if (p.base2) P = 2;
  if (p.setPT) [P, T] = p.setPT;
  if (p.auraPT) [P, T] = p.auraPT; // オーラで もとの P/T が かわる（カエルに なれ U90）。ターンを こえても のこる
  P += p.ctr - (p.mctr || 0) + p.mP; T += p.ctr - (p.mctr || 0) + p.mT;
  if (p.side === 'E' && s.E.buff && isCreature(p)) { P += s.E.buff; T += s.E.buff; } // むげんの とう：しゅうかいごとに つよく なる
  for (const q of s[p.side].bf) if (q.def.anthem) { const r = q.def.anthem(s, q, p, api); if (r) { P += r[0]; T += r[1]; } }
  // 装備品・オーラ（あいての オーラも）
  for (const q of [...s.P.bf, ...s.E.bf]) if (q.attached === p.uid) {
    P += q.def.eqP || 0; T += q.def.eqT || 0;
    if (q.def.eqPT) { const r = q.def.eqPT(s, q, p, api); P += r[0]; T += r[1]; }
  }
  return [P, T];
}
export const power = (s, p) => pt(s, p)[0];
export const need = (s, p) => (hasKw(s, p, 'indestructible') || s.floor.cantLeave?.(s, p)) ? Infinity : Math.max(0, pt(s, p)[1] - p.dmg);

export function hasKw(s, p, k) {
  if (p.def.kw?.includes(k) || p.kwT.has(k) || levelRow(p)?.kw?.includes(k)) return true;
  if (p.def.kwFn?.(s, p, api)?.includes(k)) return true;
  for (const q of s[p.side].bf) if (q.def.grant) { const g = q.def.grant(s, q, p, api); if (g && g.includes(k)) return true; }
  for (const q of s[p.side === 'P' ? 'E' : 'P'].bf) if (q.attached === p.uid && q.def.grant) { const g = q.def.grant(s, q, p, api); if (g && g.includes(k)) return true; }
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
  for (const q of s[p.side].bf) if (q.def.counterMult) n *= q.def.counterMult; // 重ねる 季節（カウンターが 2倍）
  p.ctr += n;
  p.def.onCounters?.(s, p, api, n);
  if (p.side === 'P') zzBreak(s, 'G', '緑：＋1/＋1カウンター');
}

export function proliferate(s) {
  for (const p of s.P.bf) {
    if (p.ctr > 0) addCounters(s, p, 1);
    if (isPW(p) && p.loy > 0) { p.loy++; L(s, `ぞうしょく：${p.def.name} の ちゅうせい ${p.loy}`); }
    if (p.level > 0) p.level++;
    if (p.flags.muster) p.flags.muster++;
    // ほかの しゅるいの カウンターも 1こ ふえる（盾・時間・試練・令呪・しるし）。伝承カウンターは 英雄譚の 章を 起こす（onProliferate）
    if (p.shieldCtr > 0) p.shieldCtr++;
    if (p.time > 0) p.time++;
    if (p.trial > 0) p.trial++;
    if (p.seals > 0) p.seals++;
    if (p.marks > 0) p.marks++;
  }
  for (const p of [...s.P.bf]) if (onBf(s, p)) p.def.onProliferate?.(s, p, api);
  // ゼンゼロ：敵の −1/−1カウンター・ブレイクカウンター・エネルギーも 1つ ふえる
  for (const p of [...s.E.bf]) if (p.mctr > 0 && onBf(s, p)) addMinus(s, p, 1);
  if (s.P.bon > 0 && s.P.bon < BON_MAX) { s.P.bon++; L(s, `ぞうしょく：エネルギー ${s.P.bon}`); }
  if (s.E.brk > 0) addBreak(s, 1);
  sba(s);
}

// ゼンゼロ：エネルギー（みんなで 1つの 数。0〜10）
export const BON_MAX = 10;
// ゼンゼロ：ブレイクカウンター（MTG の 毒カウンター）。10 たまると 10こ とって「ブレイク」が 1回 つかえる（s.P.brkReady）
// ブレイクは じぶんの ターンに えらんで つかう（useBreak）：ぜんたい（てきの クリーチャー ぜんぶに 3点）・たんたい（てきの クリーチャー 1体に 6点・本体に 5点。てき 1つに 10点）・マナから かいしゅう
// 2026-10-27：つよすぎたので 威力を 下げた（たんたい 10 → 6点・本体へは 5点、ぜんたい 5 → 3点）。たまる 数は 10 の まま
export const BREAK_AT = 10, BREAK_ALL = 3, BREAK_ONE = 6, BREAK_FACE = 5;
export const breakDmg = (t) => (t === 'face' ? BREAK_FACE : BREAK_ONE);
// 属性ブレイク（2026-10-26）：ゼンゼロの クリーチャーが 場に いると、その クリーチャーの 色の きっかけで 2こ。交代は 5こ
// 白：ライフを えた　青：敵に マイナスの 修整　黒：敵に −1/−1カウンター　赤：呪文・能力で 敵に ダメージ　緑：＋1/＋1カウンター
// 統率者が ゼンゼロの クリーチャーなら、場に いなくても その 色の きっかけが つかえる（1色 2こ・多色 1こ）。1色の 統率者が 場に いれば 3こ
export const ZZ_BREAK = { field: 2, mono: 3, cmdMono: 2, cmdMulti: 1, swap: 5 };
// 青の きっかけ：'minus'（てきを よわく した）か 'scry'（占術）。どちらが よいか シミュレーションで くらべる ため きりかえられる
export const ZZ_BLUE = { mode: 'minus' };
const isZZ = (d) => /^ZZ/.test(d?.id || '');
function zzAmount(s, k) {
  if (k === 'swap') return ZZ_BREAK.swap;
  let a = 0;
  for (const q of s.P.bf) if (isZZ(q.def) && isCreature(q) && colorsOf(q.def).includes(k)) a = Math.max(a, q.card?.id === s.P.cmdId && colorsOf(q.def).length === 1 ? ZZ_BREAK.mono : ZZ_BREAK.field);
  const c = s.P.cmd?.[0]?.def; // とうそつりょういきに いる 統率者
  if (isZZ(c) && colorsOf(c).includes(k)) a = Math.max(a, colorsOf(c).length === 1 ? ZZ_BREAK.cmdMono : ZZ_BREAK.cmdMulti);
  return a;
}
export function zzBreak(s, k, why) {
  if (!s?.P.zzDeck || s.over || s.inBreak) return;
  const n = zzAmount(s, k); if (!n) return;
  if (k === 'W') { const tk = `${s.turn}${s.active}`; if (s.zzWTurn === tk) return; s.zzWTurn = tk; } // 白は 1ターンに 1回まで（ライフを える 効果は 回数が 多い）
  s.stats.zz = s.stats.zz || {}; s.stats.zz[k] = (s.stats.zz[k] || 0) + n;
  L(s, `ブレイク ＋${n}（${why}）`);
  addBreak(s, n);
}
export function addBreak(s, n) {
  if (n <= 0 || s.over) return;
  const was = s.E.brk || 0;
  s.E.brk = was + n;
  L(s, `ブレイクカウンター ${was} ＋ ${n} ＝ ${s.E.brk}`);
  while (s.E.brk >= BREAK_AT) {
    s.E.brk -= BREAK_AT;
    s.P.brkReady = (s.P.brkReady || 0) + 1;
    s.stats.brk = (s.stats.brk || 0) + 1;
    L(s, 'ブレイク じゅんび OK！（じぶんの ターンに えらんで つかえる）');
  }
}
// mode：'all' てきの クリーチャー ぜんぶに 5点／'one' t（'face' か てきの パーマネント）に 10点／'mana' マナゾーンの カード t を 手札に
// ブレイクを つかえるのは、ブレイクを もつ 伝説の クリーチャーが じぶんの 場に いる とき だけ（たまるのは いつでも）
export const canBreak = (s) => s.P.bf.some((q) => isCreature(q) && q.def.legend && q.def.brk);
export function useBreak(s, mode, t) {
  if (!s.P.brkReady || s.over || !canBreak(s)) return false;
  s.P.brkReady--; s.inBreak = true;
  if (mode === 'all') { L(s, `ブレイク！ てきの クリーチャー ぜんぶに ${BREAK_ALL}点`); for (const p of s.E.bf.filter(isCreature)) damage(s, p, BREAK_ALL, null); }
  else if (mode === 'one') { L(s, `ブレイク！ ${t === 'face' ? (s.floor.faceLabel || 'てきの 本体') : t.def.name}に ${breakDmg(t)}点`); hitTarget(s, t, breakDmg(t), null); }
  else { const i = s.P.mana.indexOf(t); if (i >= 0) { s.P.mana.splice(i, 1); t.tapped = false; s.P.hand.push(t); L(s, `ブレイク！ マナゾーンの ${t.def.name} を てふだに`); } }
  s.inBreak = false;
  sba(s);
  return true;
}

export function pump(p, a, b, kws = []) { p.mP += a; p.mT += b; for (const k of kws) p.kwT.add(k); if ((a < 0 || b < 0) && p.side === 'E' && CUR?.E.bf.includes(p)) if (ZZ_BLUE.mode === 'minus') zzBreak(CUR, 'U', '青：てきを よわく した'); }

// 来世の スピリット（白黒 1/1 飛行）
const AFTERLIFE = { id: 't_spiritWK', name: 'スピリット', rar: null, color: 'WK', cost: 0, types: ['creature'], pow: 1, tou: 1, sub: ['spirit'], kw: ['flying'] };
// −1/−1カウンター（＋1/＋1カウンターが あれば うちけしあう）。by が 'P' なら「あなたが 置いた」
export function addMinus(s, p, n, by = 'P') {
  if (!onBf(s, p) || n <= 0) return;
  const k = Math.min(n, p.ctr); p.ctr -= k;
  p.mctr = (p.mctr || 0) + (n - k);
  L(s, `${foe(s, p.side)}${p.def.name} に −1/−1カウンター ${n}こ`);
  if (p.side === 'E') zzBreak(s, 'K', '黒：てきに −1/−1カウンター'); // 黒（2026-10-26）：たおした とき だと 戦闘だけで たまりすぎた
  if (by === 'P') for (const q of [...s.P.bf]) if (q.def.onMinus && onBf(s, q)) q.def.onMinus(s, q, api, p, n);
}
// 信心：あなたの 戦場の その 色の パーマネントの 数
export const devotion = (s, c, side = 'P') => s[side].bf.filter((p) => colorsOf(p.def).includes(c)).length;
// 版図：マナゾーンの カードの 色の 数
export const domain = (s) => new Set(s.P.mana.flatMap((m) => colorsOf(m.def))).size;
// 昂揚：墓地の カードの 種類（クリーチャー・インスタント・ソーサリー・エンチャント・アーティファクト）が 4つ いじょう
export const delirium = (s) => new Set(s.P.gy.flatMap((c) => c.def.types || []).filter((t) => ['creature', 'instant', 'sorcery', 'enchantment', 'artifact'].includes(t))).size >= 4;

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
// 唱える コスト（ガルタ：あなたの クリーチャーの パワーの 合計だけ 安く なる。costMin より 下には ならない）
export function costOf(s, d) {
  let c = d.cost, cut = 0;
  if (d.costLess) c -= d.costLess(s, api);
  for (const q of s.P.bf) if (q.def.costCut) cut += q.def.costCut(s, q, d, api) || 0; // ほかの カードで 安く なる（色の ぶんは のこる）
  if (cut) c = Math.max(Math.min(c, colorsOf(d).length), c - cut);
  c += s.floor.costTax?.(s, d) || 0; // アゾリウスの 法（ラヴニカの 塔）：コスト ＋1
  return Math.max(d.costMin ?? 0, c);
}
// この ターンに 敵が うけた ダメージ（本体と クリーチャー）
export const dmgThisTurn = (s) => (s.E.flags.dmgT === s.turn ? s.E.flags.dmgTaken : 0);
const noteDmg = (s, n) => { if (s.E.flags.dmgT !== s.turn) { s.E.flags.dmgT = s.turn; s.E.flags.dmgTaken = 0; } s.E.flags.dmgTaken += n; };
// 墓地から 唱えられる とき：フラッシュバック・降霊（うらの すがた）・リエール（インスタントと ソーサリーは みな フラッシュバック）
export function gyCast(s, d) {
  if (d.flashback) return { ...d.flashback, kind: 'flashback' };
  if (d.disturb) return { cost: d.disturb.cost, req: d.disturb.req, kind: 'disturb' };
  if ((d.types.includes('instant') || d.types.includes('sorcery')) && s.P.bf.some((q) => q.def.allFlashback)) return { cost: d.cost, req: colorsOf(d), kind: 'flashback' };
  return null;
}
// ライブラリーの 上から N まいを 墓地へ（切削）
export function mill(s, n) {
  const c = s.P.lib.splice(0, n); s.P.gy.push(...c);
  if (c.length) L(s, `${foe(s, 'P')}やまふだの 上から ${c.length}まいを ぼちへ`);
  return c;
}
export const totalPower = (s, list) => list.reduce((t, p) => t + Math.max(0, power(s, p)), 0);
export const formidable = (s) => totalPower(s, s.P.bf.filter(isCreature)) >= 8;
// 集会：パワーが ちがう クリーチャーが 3体 いじょう（2・2・3 は 2しゅるい）
export const coven = (s, side = 'P') => new Set(s[side].bf.filter(isCreature).map((p) => power(s, p))).size >= 3;
// 暴勇：手札が 0まい
export const hellbent = (s, side = 'P') => (s[side].hand || []).length === 0;
// サイコロ（6面）
export function rollDie(s) { const n = 1 + Math.floor(s.rng() * 6); L(s, `サイコロ：${n}`); return n; }

// プレイヤーの呪文が自分のクリーチャーを対象にしたとき（勇壮）
export function target(s, p) {
  if (p.side === 'P' && onBf(s, p) && p.def.heroic) p.def.heroic(s, p, api);
  if (p.side === 'E' && onBf(s, p) && p.def.onTargeted && !s.tgtSeen?.has(p)) { s.tgtSeen?.add(p); p.def.onTargeted(s, p, api); } // 骨くだきの 巨人：敵に ねらわれたら（1つの こうかで 1回）
}
// 対象に ならない（オジュタイ・石まきの 大蛇 など。def.hexproof(s, p, 効果の カード)）。
// カードの こうかは いつも P が つかう（てきの ターンは swapSides）ので、ねらわれる がわは E
// 龍王ドロモカ（silenceFoe）：もち主の ターンの あいだ、相手は 呪文を 唱えられない。相手の ターンに 呪文を 唱える ところ（打ち消し・瞬速・インスタント）で 見る
export const silenced = (s) => s[s.active === 'P' ? 'P' : 'E'].bf.some((p) => p.def.silenceFoe);
// 打ち消されない（ドロモカ・ティムール の 龍王の 化身 など）。side は 唱えた がわ
export const uncounterable = (s, d, side) => !!d.uncounterable || ((d.types || []).includes('creature') && s[side].bf.some((p) => p.def.creaturesUncounterable));
export function shielded(s, p) { return p.side === 'E' && (!!p.def.hexproof?.(s, p, s.srcDef) || (isCreature(p) && hasKw(s, p, 'hexproof'))); } // 呪禁：キーワード（宝具で つく）も

// ---- ダメージ・ライフ ----
// o.spell：呪文の ぴったり（{ pittari() }）
// あなたの カードが あたえる ダメージ（炎の 解放は 3倍、トーブランは 赤なら ＋2）
export function boostDmg(s, n, src, enemy) {
  const mine = src ? src.side === 'P' : s.resolving === 'P';
  if (!mine || n <= 0 || s.swapped) return n;
  if (!src && s.P.flags.boonDmg) { s.P.flags.boonDmg--; n += 2; L(s, 'おんけい：＋2'); } // 恩恵（YR04）：つぎの 呪文の ダメージ ＋2
  for (const q of s.P.bf) {
    if (q.def.redPlus && enemy && (src ? colorsOf(src.def).includes('R') : s.resolvingRed)) n += q.def.redPlus;
    if (q.def.dmgMult) n *= q.def.dmgMult;
    if (q.def.giantDouble && src && (src.def.sub || []).includes('giant')) n *= 2; // わざわいを まねく 巨人（R90）：巨人の ダメージは 2倍
  }
  return n;
}

export function damage(s, p, n, src, o = {}) {
  if (n <= 0 || !onBf(s, p)) return 0;
  n = boostDmg(s, n, src, p.side === 'E');
  if (s.floor.preventDamage?.(s, p, n, src, api)) return 0;
  if (p.shieldT === s.turn) return 0; // ダメージは 0 に なる（ニンフの 犬）
  if (!isPW(p) && isCreature(p) && useShield(s, p)) return 0;
  // 妄想心音（FGO）：ダメージの かわりに −1/−1カウンター（破壊不能でも タフネスが へる）
  if (src && isCreature(p) && hasKw(s, src, 'wither')) { L(s, `${src.def.name} → ${foe(s, p.side)}${p.def.name} に −1/−1カウンター ${n}こ`); addMinus(s, p, n, src.side); return n; }
  if (p.attacking && s[p.side].bf.some((q) => q.def.protectAttackers)) return 0;
  if (isPW(p)) { p.loy = Math.max(0, p.loy - n); L(s, `${src ? `${src.def.name} → ` : ''}${foe(s, p.side)}${p.def.name} の ちゅうせいが ${n} へった（のこり ${p.loy}）`); return n; }
  if (p.def.dmgToCounters) { const k = Math.min(n, p.ctr); p.ctr -= k; L(s, `${foe(s, p.side)}${p.def.name} の ＋1/＋1カウンターが ${k}こ へった`); }
  else if (isCreature(p)) {
    // 符玄（番外編 スターレイル）：ほかの クリーチャーが うける ダメージを へらす
    for (const q of s[p.side].bf) if (q !== p && q.def.allyDmgLess) n = Math.max(0, n - q.def.allyDmgLess);
    if (n <= 0) return 0;
    p.dmg += n; p.dmgBy.push(src || o.spell || null); if (src && hasKw(s, src, 'deathtouch')) p.dt = true;
  }
  if (p.side === 'E' && !s.swapped) noteDmg(s, n);
  if (s.combat && src?.side === 'P') s.combat.events.push({ src, t: p, n });
  if (s.combat && src && isCreature(p)) src.def.onDamageCreature?.(s, src, p, api);
  if (isCreature(p) && !p.def.dmgToCounters) p.def.onHurt?.(s, p, n, src, api); // ダメージを うけたとき（スターレイルの エネルギー・クラーラ）
  L(s, `${src ? `${src.def.name} → ` : ''}${foe(s, p.side)}${p.def.name} に ${n}点`);
  s.floor.onDamaged?.(s, p, n, src, api);
  if (src && src.side === 'P' && hasKw(s, src, 'lifelink')) gainLife(s, n);
  // 赤の 属性ブレイク：戦闘 いがいの ダメージ（呪文・能力。攻撃したときの 能力も）
  if (p.side === 'E' && !s.combatHit && (!src || src.side === 'P')) zzBreak(s, 'R', '赤：呪文（じゅもん）・能力（のうりょく）で ダメージ');
  // ゼンゼロ：ブレイク N は 敵の クリーチャー・PW に ダメージを あたえても たまる（2026-10-26。本体だけ では ほとんど たまらなかった）
  if (src?.side === 'P' && p.side === 'E' && src.def.brk && !s.over) addBreak(s, src.def.brk);
  return n;
}

export function hurt(s, n, src) {
  if (n <= 0 || s.over) return;
  s.P.life -= n; s.stats.lifeLost += n;
  s.P.flags.lostThisTurn = (s.P.flags.lostThisTurn || 0) + n;
  if (s.P.life > 0) for (const q of [...s.P.bf]) if (q.def.onLifeLoss && onBf(s, q)) q.def.onLifeLoss(s, q, api, n);
  L(s, `${s.swapped ? 'てき' : 'プレイヤー'}に ${n}点（のこり ${s.P.life}）`);
  if (s.P.life <= 0) s.over = dead(s);
}
// ライフが 0：オンラインバトルで あいても 0 なら ひきわけ
const dead = (s) => (s.floor.id === 'pvp' && s.E.life <= 0 ? 'draw' : 'lose');

export function gainLife(s, n) {
  if (s.P.noLifeGain || n <= 0) return;
  s.P.life += n; zzBreak(s, 'W', '白：ライフを えた');
  if (s.P.flags.gainedT !== s.turn) { s.P.flags.gainedT = s.turn; s.P.flags.gainedN = 0; }
  s.P.flags.gainedN += n; // この ターンに えた ライフ（腕ききの 錬金術師 G108）
  for (const q of [...s.P.bf]) if (q.def.onGain && onBf(s, q)) q.def.onGain(s, q, api, n); // ライフを えるたび（太陽の 冠の ヘリオッド W44）
  // 死なずの 騎士（KG09）：その ターン はじめて ライフを えたとき、墓地から 手札へ
  if (s.P.flags.gainT === s.turn) return;
  s.P.flags.gainT = s.turn;
  for (const c of s.P.gy.filter((x) => x.def.backOnGain)) { s.P.gy.splice(s.P.gy.indexOf(c), 1); s.P.hand.push(c); L(s, `${foe(s, 'P')}ぼちから てふだへ：${c.def.name}`); }
}

// 「敵に～点」（本体がある階は本体、ない階はAIが選んだ敵のパーマネント）
export function hitEnemy(s, n, src, o = {}) {
  if (n <= 0) return;
  const t = api.burnTarget(s, n, { ...o, mustHit: true })?.t;
  if (t) hitTarget(s, t, n, src);
  sba(s);
}

export function hitTarget(s, t, n, src, combat = false) {
  if (n <= 0) return;
  if (!combat && t === 'face' && (!src || src.side === 'P')) zzBreak(s, 'R', '赤：呪文（じゅもん）・能力（のうりょく）で ダメージ');
  if (t === 'player') { if (src && hasKw(s, src, 'lifelink')) s[src.side].life += n; return hurt(s, n, src); }
  if (t === 'face') {
    n = boostDmg(s, n, src, true);
    noteDmg(s, n);
    if (s.combat && src?.side === 'P') s.combat.events.push({ src, t: 'face', n });
    L(s, `${src ? `${src.def.name} → ` : ''}${s.swapped ? 'プレイヤー' : (s.floor.faceLabel || 'てきの 本体')}に ${n}点`);
    s.floor.face(s, n, api);
    // 統率者戦：統率者で とどめ（レイドの 点 ＋5）
    if (s.over === 'win' && !s.swapped && src && s.P.cmdId && src.card?.id === s.P.cmdId) s.cmdFinish = true;
    if (src && src.side === 'P' && hasKw(s, src, 'lifelink')) gainLife(s, n);
    // ゼンゼロ：ブレイク N（本体に ダメージを あたえるたび ブレイクカウンター）
    if (src?.side === 'P' && src.def.brk && !s.over) addBreak(s, src.def.brk);
    if (src?.side === 'P' && !s.over) src.def.onFaceHit?.(s, src, api);
  } else { s.combatHit = combat; damage(s, t, n, src); s.combatHit = false; }
  if (combat && src?.side === 'P') {
    src.def.onCombatHit?.(s, src, api);
    for (const q of [...s.P.bf]) if (q.def.onAllyHit && onBf(s, src)) q.def.onAllyHit(s, q, src, api); // あなたの 忍者が…（ヨリオン）
  }
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
      if (onBf(s, p) && isPW(p) && p.loy <= 0 && leave(s, p, 'gy')) { changed = true; continue; }
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
  if (o.died && p.def.saveDeath?.(s, p, api)) return false; // 死亡の かわりに（ヘラクレスの 十二の試練）
  // 死亡の かわりに：アナフェンザ（てきは 追放）・墓の タイタン など（ライブラリーの 一番下）
  if (o.died && to === 'gy' && !p.token) {
    if ((p.side === 'E' && s.P.bf.some((q) => q.def.exileEnemyDead)) || p.exileT === s.turn) to = 'exile';
    else if (p.side === 'P' && (p.def.dieToBottom || s.P.bf.some((q) => q.def.ownDeadToBottom))) to = 'bottom';
  }
  const exact = o.died && isExact(s, p);
  if (isCreature(p)) [p.diedP, p.diedT] = pt(s, p); // 画面の「攻撃の けっか」で 見せる
  const side = s[p.side];
  side.bf.splice(side.bf.indexOf(p), 1);
  // 手札に もどす：手札の ない 塔の 敵は、かわりに やまふだの 一番上へ（つぎの ターンに また めくられて 出てくる）。トークンは きえる
  if ((to === 'hand' && !side.hand) || to === 'lib') to = 'lib';
  if (to === 'gy' && p.def.exileOnLeave) to = 'exile'; // 降霊で 出た うらの すがたは 墓地の かわりに 追放
  if (!p.token) {
    const c = { uid: p.uid, def: p.card };
    // 統率者は 墓地・追放・手札・やまふだの かわりに 統率領域へ もどる
    if (side.cmdId && p.card?.id === side.cmdId) { side.cmd.push(c); L(s, `${foe(s, p.side)}${p.def.name} は とうそつりょういきに もどった`); to = 'cmd'; }
    else if (to === 'hand') side.hand.push(c); else if (to === 'lib') side.lib.unshift(c); else if (to === 'bottom') side.lib.push(c); else if (to === 'exile') side.exile.push(c); else side.gy.push(c);
  }
  // ついていた オーラ・装備品：授与は クリーチャーに もどる、オーラは 墓地へ、装備品は はずれる
  for (const q of [...s.P.bf, ...s.E.bf]) {
    if (q.attached !== p.uid) continue;
    q.attached = null;
    if (q.def.bestowBase) { q.def = q.def.bestowBase; q.card = q.def; L(s, `${q.def.name} が クリーチャーに もどった`); }
    else if (q.def.aura) leave(s, q, 'gy');
  }
  L(s, `${foe(s, p.side)}${p.def.name} が せんじょうを はなれた（${p.token && to !== 'gy' ? 'きえた' : { gy: 'ぼちへ', exile: 'ついほう', hand: 'てふだへ', lib: 'やまふだの 上へ', cmd: 'とうそつりょういきへ' }[to] || to}）`);
  if (exact) {
    s.stats.exact++; p.exact = true;
    if (s.stats.exactTurn !== s.turn) { s.stats.exactTurn = s.turn; s.stats.exactNow = 0; }
    s.stats.exactNow++; s.stats.exactTurnMax = Math.max(s.stats.exactTurnMax || 0, s.stats.exactNow); // 1ターンの ぴったり（トロフィー）
    L(s, `ぴったり！ ${p.def.name}（タフネス ${p.dmg}）`);
    for (const by of new Set(p.dmgBy)) {
      if (by?.pittari) by.pittari(s, api, p);
      else if (by?.def?.pittari && onBf(s, by)) by.def.pittari(s, by, api, p);
    }
    for (const q of [...s.P.bf]) if (q.def.onExact && onBf(s, q)) q.def.onExact(s, q, api, p); // ぴったりで たおすたび（YM03）
    // ぴったりの もんしょう：ライフ ＋1（レベル2 は ＋2）。カードを 引く 案は 山札が 早く へって 弱く なった（docs/EMBLEMS.md）
    const em = s.P.emblem;
    if (em?.exactLife) { gainLife(s, em.exactLife); L(s, `もんしょう：ぴったりで ライフ ＋${em.exactLife}`); }
    if (s.P.bless?.exactPing) { L(s, `しゅくふく：ぴったりで てきに ${s.P.bless.exactPing}点`); hitEnemy(s, s.P.bless.exactPing, null); }
  }
  for (const l of p.links) returnLinked(s, l);
  const twice = o.died && s[p.side].bf.some((q) => q.def.doubleDeath) ? 2 : 1; // テイサ：死亡したときの 能力が 2回
  for (let i = 0; i < twice; i++) {
    if (o.died && p.def.onDie) p.def.onDie(s, p, api);
    if (o.died && p.def.afterlife) token(s, p.side, AFTERLIFE, p.def.afterlife); // 来世
  }
  // このターンに ダメージを あたえた クリーチャーが 死んだら（マラキールの 血・ズルゴ）
  if (o.died && isCreature(p)) for (const by of new Set(p.dmgBy)) if (by?.def?.onKill && onBf(s, by)) by.def.onKill(s, by, api, p);
  p.def.onLeaveSelf?.(s, p, api);
  if (p.def.reward) p.def.reward(s, p, api);
  for (const q of [...s.P.bf, ...s.E.bf]) if (q.def.onOtherLeave) q.def.onOtherLeave(s, q, p, api, o);
  s.floor.onLeave?.(s, p, api, o);
  return true;
}

// 盾（たて）カウンター（FGO：ナイチンゲールの 宝具）：ダメージか 破壊を 1回 ふせいで なくなる
function useShield(s, p) { if (!p.shieldCtr) return false; p.shieldCtr--; L(s, `${foe(s, p.side)}${p.def.name} の 盾（たて）カウンターが ふせいだ`); return true; }
export const destroy = (s, p) => (hasKw(s, p, 'indestructible') || useShield(s, p) ? false : leave(s, p, 'gy', { died: true }));
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

// ---- オーラ ----
// p に ついている オーラ・装備品で、その 性質を もつ ものが あるか（平和な 心：攻撃も ブロックも できない）
export const auraFlag = (s, p, k) => [...s.P.bf, ...s.E.bf].some((q) => q.attached === p.uid && q.def[k]);
// オーラを つける（あなたの オーラが あなたの クリーチャーに つくたび：WG05）
export function attach(s, aura, host) {
  if (!onBf(s, host)) return;
  aura.attached = host.uid;
  L(s, `${aura.def.name} を ${host.def.name} に つけた`);
  if (aura.def.steal && host.side === 'E') steal(s, host, aura);
  if (aura.side === 'P' && host.side === 'P') for (const q of [...s.P.bf]) q.def.onAttach?.(s, q, aura, host, api);
}
// 敵の クリーチャーを あなたの ものに する（オーラが はなれたら もどる）
export function steal(s, p, by) {
  s.E.bf.splice(s.E.bf.indexOf(p), 1);
  p.side = 'P'; p.sick = true; p.attacking = false; p.stolenBy = by.uid;
  s.P.bf.push(p);
  L(s, `${p.def.name} が あなたの ものに なった`);
}
export function unsteal(s, aura) {
  const p = s.P.bf.find((q) => q.stolenBy === aura.uid);
  if (!p) return;
  s.P.bf.splice(s.P.bf.indexOf(p), 1);
  p.side = 'E'; p.stolenBy = null; p.attacking = false;
  s.E.bf.push(p);
  L(s, `${p.def.name} が てきに もどった`);
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
  s.floor.onReveal?.(s, c.def, api); // めくった ときの 階の ルール（ラヴニカの 塔）
  sba(s);
}

// ---- 戦闘 ----
export function canBlock(s, b, a) {
  if (a.flags.turn?.unblockable) return false;
  if (cant(s, b, 'cantBlock') || auraFlag(s, b, 'pacify')) return false;
  if (b.def.blockOnlyFlyers && !hasKw(s, a, 'flying')) return false;
  if (a.flags.turn?.hasteOnly && !hasKw(s, b, 'haste')) return false;
  if (s.smallCantBlock === s.turn && power(s, b) <= 1) return false;
  if (s.groundCantBlock === s.turn && !hasKw(s, b, 'flying')) return false;
  if (b.noBlockT === s.turn) return false; // この ターン ブロックできない（ろうかの 見はり R101） // 最初の 噴火（R96 の 英雄譚 I）：ひこうの ない クリーチャーは ブロックできない
  if (s.cantBlock3 === s.turn && power(s, b) <= 3) return false;
  if (a.def.minBlockPow && power(s, b) < a.def.minBlockPow) return false; // はがね葉の チャンピオン：パワー 2 いかには ブロックされない
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
  if (atk.length) s.P.flags.attacked = true; // 強襲
  for (const a of [...atk]) if (onBf(s, a.p) && a.p.def.onAttack) a.p.def.onAttack(s, a.p, api, atk, a);
  // 装備品（FGO の 宝具）：装備している クリーチャーが 攻撃するたび（def.onHostAttack(s, 装備品, クリーチャー, api, a)）
  for (const a of [...atk]) for (const q of [...s.P.bf]) if (q.attached === a.p.uid && onBf(s, a.p) && onBf(s, q) && q.def.onHostAttack) q.def.onHostAttack(s, q, a.p, api, a);
  for (const q of [...s.P.bf]) if (onBf(s, q) && q.def.onAttacks) q.def.onAttacks(s, q, atk, api); // 讃美（1体だけで 攻撃）
  battleCry(s, atk);
  attackCounters(s, atk);
  notePower(s);
}
// トロフィー用：自分の クリーチャーの パワーの 合計の いちばん 大きい とき
function notePower(s) { s.stats.maxPower = Math.max(s.stats.maxPower || 0, totalPower(s, s.P.bf.filter(isCreature))); }

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
  attackers = attackers.filter((p) => onBf(s, p) && isCreature(p) && !auraFlag(s, p, 'pacify'));
  if (!attackers.length) return;
  for (const p of attackers) { p.attacking = true; if (!hasKw(s, p, 'vigilance')) p.tapped = true; }
  L(s, `てきの こうげき：${attackers.map((p) => p.def.name).join('、')}`);
  await s.ai.beforeBlocks(s, attackers);
  attackers = attackers.filter((p) => onBf(s, p));
  const blocks = await s.ai.blocks(s, attackers);
  await s.ai.duringBlocks(s, attackers, blocks);
  for (const b of new Set(blocks.values())) if (b && onBf(s, b)) b.def.onBlock?.(s, b, api); // ブロックするたび（ゼンゼロ：セス）
  attackers = attackers.filter((p) => onBf(s, p));
  resolveCombat(s, pwTargets(s, attackers, blocks), blocks);
}
// てきの こうげき先：ブロックされなかった ものは、たおせる プレインズウォーカーが あれば そちらへ（ちゅうせいの 大きい ものから）、なければ プレイヤーへ
function pwTargets(s, attackers, blocks) {
  const left = new Map(s.P.bf.filter((p) => isPW(p) && onBf(s, p)).map((p) => [p, p.loy]));
  return attackers.map((p) => {
    if (blocks.get(p.uid) || hasKw(s, p, 'trample')) return { p, t: 'player' };
    const P = power(s, p);
    const w = [...left].filter(([, l]) => l > 0 && P >= l).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!w) return { p, t: 'player' };
    left.set(w, 0);
    L(s, `${p.def.name} は ${w.def.name} を こうげき`);
    for (const q of [...s.P.bf]) q.def.onPWAttacked?.(s, q, p, api); // ケイヤの 誓い
    return { p, t: w };
  });
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
          s.combatHit = true; damage(s, b, toB, p); s.combatHit = false; P -= toB;
          if (P > 0 && trample) hitTarget(s, a.t, P, p, true);
        } else if (trample) hitTarget(s, a.t, P, p, true);
      } else if (a.t === 'face' || a.t === 'player' || onBf(s, a.t)) hitTarget(s, a.t, P, p, true);
    }
    for (const a of atk) {
      const b = blocks.get(a.p.uid);
      if (!b || !onBf(s, b) || !onBf(s, a.p) || !strikes(b)) continue;
      s.combatHit = true; damage(s, a.p, power(s, b), b); s.combatHit = false;
    }
    sba(s);
    if (s.over) break;
  }
  if (!s.over) s.floor.afterCombat?.(s, api);
  for (const a of atk) a.p.attacking = false;
  s.lastCombat = s.combat.events;
  // トロフィー用：1回の こうげきで 敵の 本体に あたえた ダメージ
  s.stats.bigHit = Math.max(s.stats.bigHit || 0, s.combat.events.filter((e) => e.t === 'face').reduce((t, e) => t + e.n, 0));
  s.combat = null;
  sba(s);
}

Object.assign(api, {
  L, drawCard, rampTop, rampBasic, basicsInLib, charge, enter, token, pt, power, need, hasKw, tapPerm, addCounters, proliferate, pump, target,
  setCommander, cmdTax, cmdCost, useBreak, canBreak, takePick, shielded, silenced, uncounterable, equipCost,
  damage, hurt, gainLife, hitEnemy, hitTarget, fight, sba, leave, destroy, exile, bounce, exileLinked, reveal, enemyCast,
  refill, discard, untap, coven, hellbent, rollDie, enemyAttack,
  shuffleLib: (s) => { s.P.lib = shuffle(s.rng, s.P.lib); }, enemyBlocks, canBlock, blockFacts, is, isCreature, isPW, onBf, colorsOf, card, bolster, formidable, totalPower, levelRow,
  swapSides, attackTriggers, combatStart,
  creatures: (s, side) => s[side].bf.filter(isCreature),
  gain: (s, n) => gainLife(s, n),
  addMinus, addBreak, devotion, domain, delirium, boostDmg, cant, costOf, dmgThisTurn, mill, gyCast, landfallNow, manaIn, manaInNow, gainedNow, attach, steal, unsteal, auraFlag,
});
