// つめマス（2026-11-11。docs/TSUME.md）：「この ターンで かて」。つめ将棋の ように、きまった 盤面（ばんめん）から 1ターンで 勝つ 手じゅんを さがす
// ・たたかいは ほんものの エンジン（game.js・ai.js）と ほんものの カードで うごく
// ・問題は tools/gen_tsume.mjs が つくる。ここの solve（ぜんぶの 手を しらべる）で、とける こと・むずかしさを たしかめてから js/data/tsume.js に 出す
// ・人が 画面で できる こと（battle.js の tapHand・doCast・useTrick・こうげき）と おなじ 手だけを しらべる
import { newGame, api, colorsOf, isCreature, onBf, power, pt, hasKw, pickOf, autoTargets, combatStart, declareAttack, finishCombat, costOf } from './game.js';
import { plan, castCard, readyAttackers } from './ai.js';
import { BY_ID, BASICS } from '../data/cards.js';
import { T } from '../data/kit.js';

// ---- てきの クリーチャー（とくべつな 能力は なし。P/T と キーワードだけ） ----
const FOES = new Map();
// 名前は P/T と キーワードで きまる（おなじ 名前で 強さの ちがう てきが ならばない ように）
const FOE_NAMES = {
  '1/1': 'ゴブリン', '2/2': 'オーク', '2/3': 'リザードマン', '3/3': 'ミノタウロス', '3/2': 'おおかみ', '1/4': 'たての へいし', '4/4': 'オーガ', '2/5': 'いわの きょじん',
  '0/3defender': 'きの かべ', '0/4defender': 'いしの かべ',
  '1/1flying': 'コウモリ', '2/2flying': 'ハーピー', '3/3flying': 'グリフィン',
  '1/3reach': 'おおグモ', '2/4reach': 'もりの ゆみへい', '1/1deathtouch': 'どくへび', '2/2first': 'やりの きし',
};
const foeName = (p, t, kw) => {
  const n = FOE_NAMES[`${p}/${t}${kw.join('')}`]; if (n) return n;
  if (kw.includes('flying')) return 'ドラゴン';
  if (kw.includes('reach')) return 'おおグモ';
  if (kw.includes('deathtouch')) return 'どくへび';
  if (kw.includes('first')) return 'やりの きし';
  if (kw.includes('defender') || p === 0) return 'いしの かべ';
  return 'きょじん';
};
// f ＝ [パワー, タフネス, 'キーワード,キーワード', タップして いる（1）]
export function foeDef([p, t, kws = '']) {
  const kw = kws ? kws.split(',') : [];
  const id = `tm_${p}_${t}_${kw.join('_')}`;
  if (!FOES.has(id)) FOES.set(id, { id, name: foeName(p, t, kw), types: ['creature'], pow: p, tou: t, sub: [], kw, color: '', cost: 0, noCopy: true });
  return FOES.get(id);
}
// じぶんの 場の カード：'U01'（カード）・'t:soldier'（トークン。kit.js の T）
export const tsumeDef = (id) => (id.startsWith('t:') ? T[id.slice(2)] : BY_ID[id]);

export const TSUME_GOAL = 'この ターンの うちに、てきの ライフを 0に しよう。\nてきの クリーチャーは、本体（ほんたい）への こうげきを ブロックして くる（こうげきして きた クリーチャーを たおせるか、じぶんが たおされない ときだけ）。\nこうげき された てきの クリーチャーは、ほかの ブロックに 出られない。';

// ---- 階（かい）：てきは なにも しない。ターンを おわると まけ ----
export function tsumeFloor(pz) {
  const check = (s) => { if (s.E.life <= 0) s.over = 'win'; };
  return {
    id: 'tsume', name: 'つめマス', rav: true, faceUnit: 1, faceLabel: 'てき',
    goal: () => TSUME_GOAL,
    setup(s, E) {
      s.E.life = pz.life; s.E.lifeMax = pz.life; s.E.lib = [];
      for (const f of pz.foe) { const p = E.enter(s, 'E', foeDef(f)); if (p) { p.sick = false; p.tapped = !!f[3]; } }
    },
    async enemyTurn(s) { if (!s.over) s.over = 'lose'; },
    endTurn(s) { if (s.active === 'P' && !s.over) s.over = 'lose'; }, // じぶんの ターンの おわり：かてなかった
    face(s, n) { s.E.life -= n; check(s); },
    faceValue: (s, n) => (n >= s.E.life ? 200 : n * 1.5),
    check,
    priority(s, p, E) { return E.power(s, p) * 2 + 1; },
    assign(s, atkers) { return atkers.map((p) => ({ p, t: 'face' })); },
    threat() { return { damage: 0, attackers: 0 }; },
    anyTarget() { return 'face'; },
    castThreat() { return 0; },
    status: (s) => `<span class="chip hot">てきの ライフ ${s.E.life}</span>`,
    intent: () => ['この ターンで かてないと、まけ'],
  };
}
// デッキ（newGame が つかう。なかみは setup で きめなおす）
export const tsumeDeck = (pz) => [...pz.hand.map((id) => BY_ID[id]), ...[...pz.mana].map((c) => BASICS[c])];
// 手札・マナゾーン・場を きめる（山札は なし。手札の 補充（ほじゅう）も なし）
export const tsumeSetup = (pz) => (s, E) => {
  const P = s.P;
  P.hand = pz.hand.map((id) => E.card(BY_ID[id]));
  P.lib = []; P.gy = []; P.handSize = Math.max(1, P.hand.length);
  P.mana = [...pz.mana].map((c) => ({ ...E.card(BASICS[c]), tapped: false }));
  for (const id of pz.bf) {
    const d = tsumeDef(id);
    const p = id.startsWith('t:') ? E.token(s, 'P', d)[0] : E.enter(s, 'P', d);
    if (p) p.sick = false;
  }
};

// ============ ここから 下は 問題を つくる・たしかめる ための 探索（たんさく）。画面は つかわない ============

const NO_AI = { main() {}, attack: () => [], tricks() {}, blocks: () => new Map(), beforeBlocks() {}, duringBlocks() {}, counter: () => null };
// w ＝ { s, stage: 'main1' | 'tricks' | 'main2', atk, blocks }
export function buildState(pz) {
  const floor = tsumeFloor(pz);
  const s = newGame({ deck: tsumeDeck(pz), floor, diff: 'normal', seed: 1, ai: NO_AI, log: false });
  tsumeSetup(pz)(s, api);
  // ターンの はじめ（beginPlayerTurn の うち、つめマスに かんけい する ところ）
  s.turn = 1; s.active = 'P'; s.stats.playerTurns = 1;
  s.P.flags.cast = 0; s.P.flags.charged = false; s.P.flags.attacked = false;
  for (const p of s.P.bf) { p.sick = false; p.flags.turn = {}; }
  return { s, stage: 'main1', atk: [], blocks: new Map() };
}

// 状態（じょうたい）の コピー：カードの 定義（def）・階・乱数は きょうゆう、それ いがいは ふかく コピー（おなじ もの は おなじ もの の まま）
const SHARED = new Set(['def', 'card', 'floor', 'rng', 'ai', 'emblem', 'bless', 'say']);
function cloneAny(x, seen) {
  if (x === null || typeof x !== 'object') return x;
  const hit = seen.get(x); if (hit) return hit;
  if (Array.isArray(x)) { const y = []; seen.set(x, y); for (const v of x) y.push(cloneAny(v, seen)); return y; }
  if (x instanceof Set) { const y = new Set(); seen.set(x, y); for (const v of x) y.add(cloneAny(v, seen)); return y; }
  if (x instanceof Map) { const y = new Map(); seen.set(x, y); for (const [k, v] of x) y.set(cloneAny(k, seen), cloneAny(v, seen)); return y; }
  if (Array.isArray(x.types) && x.uid === undefined) return x; // カードの 定義
  const y = {}; seen.set(x, y);
  for (const k of Object.keys(x)) y[k] = SHARED.has(k) ? x[k] : cloneAny(x[k], seen);
  return y;
}
export function cloneState(w) { const seen = new Map(); return { w: cloneAny(w, seen), seen }; }

// ---- 人が えらべる 対象（battle.js の cands と おなじ。つめマスは 本体も ねらえる） ----
function cands(s, spec, ctx = {}) {
  let list = [];
  if (spec.side === 'atk') list = (ctx.attackers || []).filter((p) => onBf(s, p));
  else if (spec.side === 'mine') list = s.P.bf.filter((p) => isCreature(p) && (!ctx.tricks || p.attacking));
  else for (const sd of spec.side === 'any' ? ['P', 'E'] : [spec.side]) list.push(...s[sd].bf.filter((p) => (spec.perm ? !p.def.factory : isCreature(p)) && p !== ctx.src));
  const wd = s.srcDef; s.srcDef = ctx.card || wd;
  list = list.filter((p) => !(s.floor.untargetable?.(s, p, api)) && (!spec.filter || spec.filter(s, api, p)));
  s.srcDef = wd;
  if (spec.face) list.unshift('face');
  return list;
}
// k こ えらぶ くみあわせ
function subsets(list, lo, hi) {
  const out = [];
  const go = (i, cur) => {
    if (cur.length >= lo && cur.length <= hi) out.push([...cur]);
    if (cur.length >= hi) return;
    for (let j = i; j < list.length; j++) { cur.push(list[j]); go(j + 1, cur); cur.pop(); }
  };
  go(0, []);
  return out;
}
// つめマスの 探索が あつかえる カードか（あつかえない 形の カードは 問題に 入れない）
export function tsumeCardOk(d) {
  if (!d) return false;
  if (d.basic) return true; // マナに おく・つかえる もの（赤・黒）は つかう
  if (d.types.includes('creature')) return !d.x && !d.tgt && !d.modes && !d.riot && !d.kicker && !(d.kw || []).includes('convoke');
  if (d.modes || d.discardCost || d.spCut || d.suspend || d.adv || d.bestow) return false;
  if (d.trick && !d.play) return d.trick.kind === 'single' || d.trick.kind === 'mass';
  if (!(d.tgt && d.apply)) return false;
  if (d.tgt.some((sp) => sp.divide || sp.side === 'any' || sp.side === 'atk')) return false;
  if (pickOf(d) === 'rand' && d.tgt.some((sp) => sp.side === 'E')) return false; // ランダムに ねらう カードは つめマスに ならない
  return true;
}

// ---- いま できる 手を ぜんぶ ならべる ----
// 手 ＝ { k: 'charge' | 'cast' | 'attack' | 'trick' | 'damage', c（手札の カード）, picks, x, kicked, atk, t }
export function actions(w) {
  const { s, stage } = w, P = s.P, out = [];
  if (s.over) return out;
  if (stage === 'tricks') {
    const seen = new Set();
    for (const c of P.hand) {
      const d = c.def;
      if (seen.has(d.id) || !(d.trick && !d.play)) continue;
      seen.add(d.id);
      const pl = plan(s, d.cost, colorsOf(d), { convoke: d.kw?.includes('convoke') });
      if (!pl) continue;
      if (d.trick.kind === 'mass') out.push({ k: 'trick', c });
      else for (const a of w.atk) if (onBf(s, a.p)) out.push({ k: 'trick', c, t: a.p });
    }
    out.push({ k: 'damage' });
    return out;
  }
  // メインフェイズ（こうげきの まえ・あと）
  const seen = new Set();
  for (const c of P.hand) {
    const d = c.def;
    if (seen.has(d.id)) continue; // おなじ カードは 1まいぶん だけ しらべる
    seen.add(d.id);
    if (!P.flags.charged && !d.noCharge) out.push({ k: 'charge', c });
    const base = costOf(s, d), req = colorsOf(d), o = { convoke: d.kw?.includes('convoke'), req2: d.req2 };
    if (d.types.includes('creature')) { if (tsumeCardOk(d) && plan(s, base, req, o)) out.push({ k: 'cast', c }); continue; }
    if (!(d.tgt && d.apply) || (d.trick && !d.play) || !tsumeCardOk(d)) continue;
    const mul = d.xMul || 1;
    let xMax = 0;
    if (d.x) { while (plan(s, base + (xMax + 1) * mul, req, o)) xMax++; if (xMax < 1) continue; }
    else if (!plan(s, base, req, o)) continue;
    for (let x = d.x ? 1 : 0; x <= xMax; x++) {
      for (const kicked of d.kicker ? [false, true] : [false]) {
        const cost0 = base + x * mul + (kicked ? d.kicker : 0);
        if (!plan(s, cost0, req, o)) continue;
        const ctx = { card: d, x };
        const mode = pickOf(d);
        // 対象の くみあわせ
        let combos = [[]];
        let ok = true;
        for (const spec of d.tgt) {
          const list = cands(s, spec, ctx);
          const min = spec.min ?? 1;
          if (list.length < min) { ok = false; break; }
          let choices;
          if (mode && spec.side === 'E') {
            const foes = list.filter((t) => t === 'face' || t.side === 'E');
            const r = autoTargets(s, mode, spec, ctx, foes, api);
            if (r.random) { ok = false; break; } // ランダムで きまる：つめマスでは あつかわない
            choices = [r.chosen];
          } else choices = subsets(list, Math.max(min, 1), Math.min(spec.max ?? 1, list.length));
          combos = combos.flatMap((pre) => choices.map((ch) => [...pre, ch]));
        }
        if (!ok) continue;
        for (const picks of combos) {
          const extra = d.strive ? d.strive * (picks[0].length - 1) : 0;
          if (extra && !plan(s, cost0 + extra, req, o)) continue;
          out.push({ k: 'cast', c, picks, x, kicked, cost: cost0 + extra });
        }
      }
    }
  }
  if (stage === 'main1') {
    // こうげき：じゅんびの できた クリーチャー それぞれに「こうげきしない・本体・てきの クリーチャー」
    const ready = readyAttackers(s);
    const targets = ['face', ...s.E.bf.filter(isCreature)];
    // おなじ てきを 2体で こうげきする くみあわせは しらべない（1体で ブロックを とめられる。もう 1体は 本体を こうげきした ほうが よい）
    const go = (i, cur) => {
      if (i === ready.length) { if (cur.length) out.push({ k: 'attack', atk: cur.map((a) => ({ ...a })) }); return; }
      go(i + 1, cur);
      for (const t of targets) { if (t !== 'face' && cur.some((a) => a.t === t)) continue; cur.push({ p: ready[i], t }); go(i + 1, cur); cur.pop(); }
    };
    go(0, []);
  }
  return out;
}

// ---- 手を うごかす（画面の doCast・useTrick・こうげき と おなじ よびかた） ----
export function applyAction(w, a) {
  const { s } = w, P = s.P;
  if (a.k === 'charge') { P.flags.charged = true; api.charge(s, a.c); api.sba(s); return; }
  if (a.k === 'cast') {
    const d = a.c.def, req = colorsOf(d), o = { convoke: d.kw?.includes('convoke'), req2: d.req2 };
    if (d.types.includes('creature')) { castCard(s, a.c, plan(s, costOf(s, d), req, o), { from: 'hand' }); return; }
    const pl = plan(s, a.cost, req, o);
    const run = () => d.apply(s, api, a.picks, a.x, { kicked: a.kicked });
    castCard(s, a.c, pl, { from: 'hand', x: d.x ? a.x : undefined, ctr: d.x ? a.x : 0, run, chosen: a.picks, kicked: a.kicked });
    return;
  }
  if (a.k === 'attack') {
    combatStart(s);
    if (s.over) return;
    w.atk = a.atk;
    w.blocks = declareAttack(s, w.atk);
    w.stage = 'tricks';
    return;
  }
  if (a.k === 'trick') {
    const d = a.c.def;
    const pl = plan(s, d.cost, colorsOf(d), { convoke: d.kw?.includes('convoke') });
    const run = a.t ? () => { api.target(s, a.t); d.singleRun(s, api, a.t); } : () => d.massRun(s, api);
    castCard(s, a.c, pl, { run });
    return;
  }
  if (a.k === 'damage') { finishCombat(s, w.atk, w.blocks); w.atk = []; w.blocks = new Map(); w.stage = 'main2'; }
}
// 手を コピーした 状態の ものに うつす
const mapAction = (a, seen) => {
  const m = (x) => (x && typeof x === 'object' ? seen.get(x) || x : x);
  return { ...a, c: m(a.c), t: m(a.t), picks: a.picks?.map((ps) => ps.map(m)), atk: a.atk?.map((x) => ({ p: m(x.p), t: m(x.t) })) };
};

// ---- 状態の しるし（おなじ 状態を 2回 しらべない） ----
const one = (p) => `${p.def.id}:${p.tapped ? 1 : 0}${p.sick ? 1 : 0}${p.frozen ? 1 : 0}${p.attacking ? 1 : 0}:${p.dmg}:${p.mP}:${p.mT}:${p.ctr}:${p.mctr || 0}:${[...p.kwT].sort().join('')}:${p.dt ? 1 : 0}`;
export function sig(w) {
  const { s } = w;
  const bf = (side) => s[side].bf.map(one).sort().join(',');
  const atk = w.stage === 'tricks' ? w.atk.map((a) => `${one(a.p)}>${a.t === 'face' ? 'F' : one(a.t)}/${w.blocks.get(a.p.uid) ? one(w.blocks.get(a.p.uid)) : '-'}`).sort().join(';') : '';
  return [w.stage, s.over || '', s.E.life, s.P.flags.charged ? 1 : 0, s.P.flags.cast, bf('E'), bf('P'),
    s.P.hand.map((c) => c.def.id).sort().join(','), s.P.mana.map((m) => `${m.def.id}${m.tapped ? 1 : 0}`).sort().join(','), atk].join('|');
}

// ---- 手の なまえ（こたえ・ヒントに 出す。カードの 名前は ふりがな つきの まま → 画面で ruby() に とおす） ----
const nm = (d) => d.name || '';
const tn = (s, t) => (t === 'face' ? 'てきの 本体' : `${t.side === 'E' ? 'てきの ' : ''}${nm(t.def)}（${power(s, t)}/${pt(s, t)[1] - t.dmg}）`);
export function describe(w, a) {
  const { s } = w;
  if (a.k === 'charge') return `「${nm(a.c.def)}」を マナゾーンに おく`;
  if (a.k === 'cast') {
    if (a.c.def.types.includes('creature')) return `「${nm(a.c.def)}」を 出す`;
    const ts = (a.picks || []).flat().map((t) => tn(s, t)).join('・');
    return `「${nm(a.c.def)}」${a.c.def.x ? `（X＝${a.x}）` : ''}${a.kicked ? '（キッカー）' : ''}を ${ts} に 使う`;
  }
  if (a.k === 'attack') return `こうげき：${a.atk.map((x) => `${nm(x.p.def)}（${power(s, x.p)}）→ ${x.t === 'face' ? '本体' : `てきの ${nm(x.t.def)}（${power(s, x.t)}/${pt(s, x.t)[1] - x.t.dmg}）`}`).join('、')}`;
  if (a.k === 'trick') return `「${nm(a.c.def)}」を ${a.t ? `${nm(a.t.def)}に` : 'みんなに'} 使う`;
  return '「ダメージ！」を おす';
}
// 手の しるし（じゅんばんを かえただけの こたえを 1つに まとめる）
const akey = (w, a) => {
  const { s } = w;
  const t = (x) => (x === 'face' ? 'F' : `${x.side}${x.def.id}/${power(s, x)}/${pt(s, x)[1] - x.dmg}`);
  if (a.k === 'charge') return `C:${a.c.def.id}`;
  if (a.k === 'cast') return `S:${a.c.def.id}:${a.x || 0}:${a.kicked ? 1 : 0}:${(a.picks || []).flat().map(t).sort().join('+')}`;
  if (a.k === 'attack') return `A:${a.atk.map((x) => `${x.p.def.id}/${power(s, x.p)}>${t(x.t)}`).sort().join('+')}`;
  if (a.k === 'trick') return `T:${a.c.def.id}:${a.t ? t(a.t) : ''}`;
  return 'D';
};

// ---- ぜんぶ しらべる ----
// かえす もの：{ win, sols（じゅんばん ちがいを まとめた こたえの 数）, best（いちばん みじかい こたえ：[{ text, key }]）, maxDmg（てきの 本体に あたえられる いちばん 大きい ダメージ）, nodes }
// o.maxNodes：しらべる 上限（こえたら timeout: true）
export function solve(pz, o = {}) {
  const maxNodes = o.maxNodes || 200000;
  const root = buildState(pz);
  const life0 = root.s.E.life;
  const memo = new Map(); // しるし → { minLife, wins: Set(こたえの しるし), best }
  let nodes = 0, timeout = false;
  const merge = (r, sub, key, text) => {
    r.minLife = Math.min(r.minLife, sub.minLife);
    for (const ws of sub.wins) { if (r.wins.size < 400) r.wins.add([key, ...ws.split('\n').filter(Boolean)].sort().join('\n')); }
    if (sub.best && (!r.best || sub.best.length + 1 < r.best.length)) r.best = [{ key, text }, ...sub.best];
  };
  const go = (w, depth) => {
    const k = sig(w);
    const hit = memo.get(k); if (hit) return hit;
    const r = { minLife: w.s.E.life, wins: new Set(), best: null };
    memo.set(k, r);
    if (w.s.over === 'win') { r.wins.add(''); r.best = []; return r; }
    if (w.s.over || depth > 14) return r;
    for (const a of actions(w)) {
      if (++nodes > maxNodes) { timeout = true; break; }
      const key = akey(w, a), text = describe(w, a);
      const { w: w2, seen } = cloneState(w);
      applyAction(w2, mapAction(a, seen));
      merge(r, go(w2, depth + 1), key, text);
    }
    return r;
  };
  const r = go(root, 0);
  return { win: r.wins.size > 0, sols: r.wins.size, best: r.best, maxDmg: life0 - r.minLife, nodes, timeout };
}

// ランダムに 手を えらんで 勝てる わりあい（むずかしさの めやす）。こうげきは 1回、じゅもんは 出せる だけ
export function randomWinRate(pz, n = 200, rng = Math.random) {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    let w = buildState(pz);
    for (let step = 0; step < 16 && !w.s.over; step++) {
      const as = actions(w);
      if (!as.length) break;
      // メインフェイズ 2 では、できる ことが なくなったら おわり（マナに おく だけ は えらばない）
      const pool = w.stage === 'main2' ? as.filter((a) => a.k !== 'charge' || as.some((b) => b.k === 'cast')) : as;
      if (!pool.length) break;
      applyAction(w, pool[Math.floor(rng() * pool.length)]);
    }
    if (w.s.over === 'win') wins++;
  }
  return wins / n;
}

// 「ぜんぶで 本体を こうげき → のこった じゅもんを 本体へ」だけで 勝てるか（かんたんな 問題か どうか）
export function naiveWins(pz) {
  const w = buildState(pz);
  const ready = readyAttackers(w.s);
  if (ready.length) { applyAction(w, { k: 'attack', atk: ready.map((p) => ({ p, t: 'face' })) }); if (!w.s.over) applyAction(w, { k: 'damage' }); }
  for (let step = 0; step < 8 && !w.s.over; step++) {
    const a = actions(w).filter((x) => x.k === 'cast' && (x.picks || []).flat().includes('face')).sort((x, y) => (y.x || 0) - (x.x || 0))[0];
    if (!a) break;
    applyAction(w, a);
  }
  return w.s.over === 'win';
}
