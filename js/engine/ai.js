// プレイヤー側のAI（シミュレーション用）。ルールは game.js、カードの使いどころは各カードの play / react
import {
  api, COLORS, colorsOf, isCreature, onBf, pt, power, need, hasKw, tapPerm, enter, sba, L, ask, canBlock, blockFacts, card,
} from './game.js';

export const RARITY_PTS = { C: 1, U: 2, R: 3, L: 4 };
const rarityV = (d) => RARITY_PTS[d.rar] || 0;
const isPermDef = (d) => !d.types.includes('instant') && !d.types.includes('sorcery');

// ---- マナの支払い ----
function sources(s, o = {}) {
  const out = [];
  for (const m of s.P.mana) if (!m.tapped) { const c = colorsOf(m.def); out.push({ kind: 'mana', ref: m, colors: c.length ? c : ['C'], pri: 0 }); }
  for (const p of s.P.bf) {
    if (p.tapped || !p.def.mana || p === o.exclude || p.attacking) continue;
    if (isCreature(p) && p.sick) continue;
    out.push({ kind: 'ability', ref: p, colors: p.def.mana === 'any' ? COLORS : p.def.mana, pri: 1 });
  }
  if (o.convoke) for (const p of s.P.bf) {
    if (!isCreature(p) || p.tapped || p === o.exclude || out.some((x) => x.ref === p)) continue;
    const free = p.sick || hasKw(s, p, 'defender') || p.def.cantAttack;
    if (o.sickOnly && !free) continue;
    const c = colorsOf(p.def);
    out.push({ kind: 'convoke', ref: p, colors: c.length ? c : ['C'], pri: free ? 2 : 3 });
  }
  return out.sort((a, b) => a.pri - b.pri);
}

export function plan(s, cost, req = [], o = {}) {
  const src = sources(s, o);
  if (src.length < cost) return null;
  const chosen = new Set();
  let prism = null;
  const nReq = cost === 0 || !req.length ? 0 : (o.req2 ? 2 : 1);
  for (let k = 0; k < nReq; k++) {
    let x = src.find((y) => !chosen.has(y) && y.colors.some((c) => req.includes(c)));
    if (!x) {
      const pr = s.P.bf.find((p) => p.def.prism && !p.tapped);
      if (pr && !prism) { prism = pr; x = src.find((y) => !chosen.has(y)); }
    }
    if (!x) return null;
    chosen.add(x);
  }
  for (const x of src) { if (chosen.size >= cost) break; chosen.add(x); }
  if (chosen.size < cost) return null;
  return { srcs: [...chosen], prism };
}

export function pay(s, pl) {
  const convoked = [];
  for (const x of pl.srcs) {
    if (x.kind === 'mana') x.ref.tapped = true;
    else { tapPerm(s, x.ref); if (x.kind === 'convoke') convoked.push(x.ref); }
  }
  if (pl.prism) pl.prism.tapped = true;
  // 召集のけいさんボーナス：正解でタップしたクリーチャー1体がアンタップ
  if (convoked.length && ask(s, convokeQuestion(pl))) convoked[0].tapped = false;
  return convoked;
}

const manaCount = (s, o = {}) => sources(s, o).length;

export function convokeQuestion(pl) {
  const n = pl.srcs.length, c = pl.srcs.filter((x) => x.kind === 'convoke').length;
  return { hint: '召集：マナの たりない ぶんを クリーチャーで はらう。なんたい タップする？', text: `コスト ${n} ＝ マナ ${n - c} ＋ なかま □`, answer: c, reward: 'タップした クリーチャー1体が アンタップ' };
}
export const xQuestion = (total, base) => ({ hint: 'X呪文：つかえる マナで X を きめる', text: `マナ ${total} ＝ X ＋ ${base}　X ＝ □`, answer: total - base, reward: 'X が ＋1' });

// ---- 唱える ----
export function castCard(s, c, pl, o = {}) {
  const P = s.P, def = c.def, from = o.from || 'hand';
  if (from === 'hand') P.hand.splice(P.hand.indexOf(c), 1);
  else if (from === 'gy') P.gy.splice(P.gy.indexOf(c), 1);
  const convoked = pl ? pay(s, pl) : [];
  P.flags.cast++;
  L(s, `唱えた：${def.name}${o.x != null ? `（X=${o.x}）` : ''}`);
  const noncreature = !def.types.includes('creature');
  for (const q of [...P.bf]) {
    if (!onBf(s, q)) continue;
    if (noncreature && hasKw(s, q, 'prowess')) api.pump(q, 1, 1);
    q.def.onCast?.(s, q, def, api);
    q.def.onAnyCast?.(s, q, def, 'P', api);
  }
  if (isPermDef(def)) { enter(s, 'P', def, { ctr: o.ctr || 0, convoked, card: def }); sba(s); return; }
  const done = () => {
    if (from === 'gy' || o.free) P.exile.push(c);
    else if (def.backToHand) { c.locked = true; P.hand.push(c); }
    else P.gy.push(c);
    sba(s);
  };
  // 効果が 画面の答えを待つ（占術など）ときだけ Promise を返す。シミュレーションでは そのまま進む
  const r = o.run?.(o.x);
  if (r && r.then) return r.then(done);
  done();
}

function optionsFor(s, c, phase, from) {
  const def = c.def;
  const cost = from === 'gy' ? def.flashback.cost : def.cost;
  const req = from === 'gy' ? def.flashback.req : colorsOf(def);
  const o = { convoke: def.kw?.includes('convoke'), sickOnly: phase === 1, req2: def.req2 };
  if (def.x) {
    const xMax = manaCount(s, o) - cost;
    if (xMax < 1 || !plan(s, cost + 1, req, o)) return [];
    const r = def.play(s, api, { phase, xMax, c });
    if (!r || r.score <= 0) return [];
    const x = Math.min(r.x ?? xMax, xMax);
    return [{
      score: r.score, name: def.name, exec: () => {
        const pl = plan(s, cost + x, req, o); if (!pl) return;
        const xx = x + (ask(s, xQuestion(cost + x, cost)) ? 1 : 0); // X のけいさんボーナス
        castCard(s, c, pl, { x: xx, ctr: xx, run: () => r.run(xx), from });
      },
    }];
  }
  if (!plan(s, cost, req, o)) return [];
  if (isPermDef(def)) {
    const sc = def.permScore ? def.permScore(s, api, { phase }) : permScore(s, def, phase);
    if (sc == null || sc <= 0) return [];
    return [{ score: sc, name: def.name, exec: () => { const pl = plan(s, cost, req, o); if (pl) castCard(s, c, pl, { from }); } }];
  }
  if (!def.play || (def.reactive && phase !== 'react')) return [];
  if (def.types.includes('sorcery') && phase === 'react') return [];
  const r = def.play(s, api, { phase, c });
  if (!r || r.score <= 0) return [];
  return [{ score: r.score, name: def.name, exec: () => { const pl = plan(s, cost, req, o); if (pl) castCard(s, c, pl, { run: r.run, from }); } }];
}

function permScore(s, def, phase) {
  if (def.need && !def.need(s, api)) return null;
  if (def.flash && phase === 1 && s.P.hand.some((c) => c.def === def) && s.floor.threat(s, api).attackers > 0) return 1; // 瞬速はなるべく相手のターンに
  return 10 + def.cost * 3 + rarityV(def);
}

function actOptions(s, phase) {
  const out = [];
  for (const p of s.P.bf) for (const a of p.def.acts || []) {
    if (a.when && !a.when.includes(phase)) continue;
    if (a.tap && (p.tapped || (isCreature(p) && p.sick))) continue;
    if (a.monstrosity && p.monstrous) continue;
    const cost = typeof a.cost === 'function' ? a.cost(s, p, api) : a.cost;
    const o = { exclude: a.tap || a.sac ? p : null };
    let xMax = 0;
    if (a.x) { xMax = manaCount(s, o) - cost; if (xMax < 1) continue; }
    if (!plan(s, cost + (a.x ? 1 : 0), a.req || [], o)) continue;
    const r = a.play(s, p, api, { phase, xMax });
    if (!r || r.score <= 0) continue;
    const x = a.x ? Math.min(r.x ?? xMax, xMax) : 0;
    out.push({
      score: r.score, name: `${p.def.name}の能力`, exec: () => {
        const pl = plan(s, cost + x, a.req || [], o); if (!pl) return;
        pay(s, pl);
        if (a.tap) tapPerm(s, p);
        if (a.monstrosity) p.monstrous = true;
        r.run(x);
        sba(s);
      },
    });
  }
  // 装備
  for (const p of s.P.bf) {
    if (!p.def.equip || phase !== 1) continue;
    const host = s.P.bf.find((q) => q.uid === p.attached);
    if (host && onBf(s, host)) continue;
    const t = api.bestBuffTarget(s, null, { ready: true });
    if (!t || !plan(s, p.def.equip, [])) continue;
    out.push({ score: 4, name: `${p.def.name}の装備`, exec: () => { const pl = plan(s, p.def.equip, []); if (!pl) return; pay(s, pl); p.attached = t.uid; } });
  }
  return out;
}

// ---- メイン・フェイズ ----
function main(s, phase) {
  if (phase === 1) chargeMana(s);
  for (let guard = 0; guard < 40 && !s.over; guard++) {
    const opts = [];
    for (const c of [...s.P.hand]) if (!c.locked) opts.push(...optionsFor(s, c, phase, 'hand'));
    for (const c of s.P.gy) if (c.def.flashback) opts.push(...optionsFor(s, c, phase, 'gy'));
    opts.push(...actOptions(s, phase));
    if (!opts.length) break;
    opts.sort((a, b) => b.score - a.score);
    const before = s.P.mana.filter((m) => !m.tapped).length + s.P.hand.length + s.P.bf.length;
    opts[0].exec();
    const after = s.P.mana.filter((m) => !m.tapped).length + s.P.hand.length + s.P.bf.length;
    if (before === after && opts[0].score < 1) break;
  }
}

export function keepValue(s, c) {
  const d = c.def;
  if (d.basic) return -10;
  const mana = s.P.mana.length;
  let v = rarityV(d) * 3 + 2;
  if (d.cost > mana + 3) v -= d.cost - mana - 3;
  if (d.cost <= mana + 1) v += 2;
  return v;
}

function chargeMana(s) {
  const P = s.P;
  if (!P.hand.length || P.flags.charged) return;
  const mana = P.mana.length;
  if (mana >= 7 && P.hand.length < 3) return;
  const have = new Set(P.mana.flatMap((m) => colorsOf(m.def)));
  let best = null, bv = Infinity;
  for (const c of P.hand) {
    let v = keepValue(s, c);
    if (colorsOf(c.def).some((col) => !have.has(col) && P.hand.some((h) => h !== c && colorsOf(h.def).includes(col)))) v -= 6;
    if (v < bv) { bv = v; best = c; }
  }
  if (!best) return;
  if (mana >= 6 && bv > 4) return;
  P.flags.charged = true;
  api.charge(s, best);
}

// ---- 攻撃 ----
export function readyAttackers(s) {
  return s.P.bf.filter((p) => isCreature(p) && !p.tapped && (!p.sick || hasKw(s, p, 'haste')) && !hasKw(s, p, 'defender') && !p.def.cantAttack && power(s, p) > 0);
}

function attack(s) {
  const ready = readyAttackers(s);
  const threat = s.floor.threat(s, api);
  const keep = new Set();
  if (threat.attackers && threat.damage >= s.P.life - 3) {
    const pool = ready.filter((p) => !hasKw(s, p, 'vigilance') && !p.def.mustAttack).sort((a, b) => pt(s, b)[1] - pt(s, a)[1]);
    for (const p of pool.slice(0, threat.attackers)) keep.add(p);
  }
  let atkers = ready.filter((p) => !keep.has(p));
  let out = s.floor.assign(s, atkers, api).filter((a) => a.t);
  // ブロックされて倒されるだけの攻撃はやめる（2回まで見なおす）
  for (let k = 0; k < 2; k++) {
    const bl = api.enemyBlocks(s, out);
    const bad = out.filter((a) => {
      const b = bl.get(a.p.uid); if (!b || a.p.def.mustAttack) return false;
      const f = blockFacts(s, a.p, b);
      return !f.survives && !f.kills;
    }).map((a) => a.p);
    if (!bad.length) break;
    atkers = atkers.filter((p) => !bad.includes(p));
    out = s.floor.assign(s, atkers, api).filter((a) => a.t);
  }
  for (const p of ready) if (p.def.mustAttack && !out.some((a) => a.p === p)) { const t = s.floor.anyTarget(s, api); if (t) out.push({ p, t }); }
  return out;
}

// 攻撃先の割り当て：倒せる敵から順に、ちょうど足りる攻撃クリーチャーを当てる。あまりは rest へ
export function assignKill(s, atkers, targets, rest = null) {
  const pool = [...atkers].sort((a, b) => power(s, b) - power(s, a));
  const out = [];
  for (const tg of targets) {
    if (!pool.length) break;
    const n = tg.need;
    if (n === Infinity) continue;
    const singles = pool.filter((p) => power(s, p) >= n || (hasKw(s, p, 'deathtouch') && tg.creature));
    if (singles.length) {
      const p = singles[singles.length - 1];
      out.push({ p, t: tg.t }); pool.splice(pool.indexOf(p), 1); continue;
    }
    let sum = 0; const grp = [];
    for (const p of pool) { grp.push(p); sum += power(s, p); if (sum >= n) break; }
    if (sum >= n) for (const p of grp) { out.push({ p, t: tg.t }); pool.splice(pool.indexOf(p), 1); }
  }
  for (const p of pool) { const t = typeof rest === 'function' ? rest(p) : rest; if (t) out.push({ p, t }); }
  return out;
}

export function killTargets(s, list) {
  return list.map((p) => ({ t: p, need: need(s, p), v: s.floor.priority(s, p, api), creature: true }))
    .filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
}

// ---- 戦闘のあとの呪文（ブロックが決まったあと） ----
function scoreAttack(s, atk, blocks, mod) {
  let v = 0, face = 0;
  const dmg = new Map();
  for (const a of atk) {
    if (!onBf(s, a.p)) continue;
    const m = mod(a.p) || {};
    const dbl = m.dbl || hasKw(s, a.p, 'double');
    const P = Math.max(0, power(s, a.p) + (m.p || 0)) * (dbl ? 2 : 1);
    const b = blocks.get(a.p.uid);
    let through = P;
    if (b && onBf(s, b)) {
      const left = Math.max(0, pt(s, b)[1] - b.dmg);
      if (P >= left || hasKw(s, a.p, 'deathtouch')) v += 4;
      if (power(s, b) < pt(s, a.p)[1] + (m.t || 0) - a.p.dmg) v += 3;
      through = (m.tr || hasKw(s, a.p, 'trample')) ? Math.max(0, P - left) : 0;
    }
    if (through > 0) {
      if (a.t === 'face') face += through;
      else dmg.set(a.t, (dmg.get(a.t) || 0) + through);
    }
  }
  for (const [t, d] of dmg) {
    if (t.def.factory) { if (d === s.E.key) v += 100; }
    else if (d >= need(s, t)) v += 10 + (s.floor.priority(s, t, api) || 0);
  }
  return v + face * (s.floor.faceUnit ?? 1);
}

function tricks(s, atk, blocks) {
  for (let guard = 0; guard < 8 && !s.over; guard++) {
    const base = scoreAttack(s, atk, blocks, () => null);
    let best = null;
    const live = atk.filter((a) => onBf(s, a.p));
    const consider = (gain, exec) => { if (gain >= 3 && (!best || gain > best.gain)) best = { gain, exec }; };
    for (const c of s.P.hand) {
      const d = c.def;
      const tr = d.trick || (d.bloodrush ? { kind: 'single', p: 4, t: 4, cost: d.bloodrush.cost, req: d.bloodrush.req, bloodrush: true } : null);
      if (!tr || c.locked) continue;
      const cost = tr.cost ?? d.cost, req = tr.req ?? colorsOf(d);
      const o = { convoke: d.kw?.includes('convoke') };
      if (!plan(s, cost, req, o)) continue;
      const fer = s.P.bf.some((q) => isCreature(q) && power(s, q) >= 4);
      if (tr.kind === 'mass') {
        const g = scoreAttack(s, atk, blocks, () => ({ p: tr.p, t: tr.t })) - base;
        consider(g, () => { const pl = plan(s, cost, req, o); if (!pl) return; castCard(s, c, pl, { run: () => d.massRun(s, api) }); });
      } else {
        for (const a of live) {
          const mod = (p) => (p === a.p ? { p: tr.p || 0, t: tr.t || 0, dbl: tr.dbl, tr: tr.trample && fer } : null);
          const g = scoreAttack(s, atk, blocks, mod) - base;
          consider(g, () => {
            const pl = plan(s, cost, req, o); if (!pl) return;
            const run = () => { api.target(s, a.p); d.singleRun(s, api, a.p); };
            if (tr.bloodrush) { s.P.hand.splice(s.P.hand.indexOf(c), 1); s.P.gy.push(c); pay(s, pl); run(); }
            else castCard(s, c, pl, { run });
          });
        }
      }
    }
    // 起動型の強化（ドラゴンの雛）
    for (const a of live) for (const act of a.p.def.acts || []) {
      if (!act.pumpP || !plan(s, act.cost, act.req || [])) continue;
      const g = scoreAttack(s, atk, blocks, (p) => (p === a.p ? { p: act.pumpP } : null)) - base;
      consider(g + 2, () => { const pl = plan(s, act.cost, act.req || []); if (!pl) return; pay(s, pl); api.pump(a.p, act.pumpP, 0); });
    }
    if (!best) break;
    best.exec();
  }
}

// ---- ブロック（プレイヤー） ----
function valueP(s, p) { return power(s, p) + pt(s, p)[1] / 2 + (p.token ? 0 : rarityV(p.def)); }

function blocks(s, attackers) {
  const map = new Map();
  const avail = s.P.bf.filter((p) => isCreature(p) && !p.tapped);
  let incoming = attackers.reduce((t, a) => t + Math.max(0, power(s, a)), 0);
  const order = [...attackers].sort((a, b) => power(s, b) - power(s, a));
  for (const a of order) {
    let best = null, bv = -Infinity;
    for (const b of avail) {
      if (!canBlock(s, b, a)) continue;
      const f = blockFacts(s, b, a);
      const v = (f.kills ? 4 : 0) + (f.survives ? 5 : 0) - valueP(s, b) * 0.1;
      if (v > bv) { bv = v; best = b; }
    }
    if (!best) continue;
    const f = blockFacts(s, best, a);
    const lethal = incoming >= s.P.life;
    const ok = f.survives || (f.kills && valueP(s, a) >= valueP(s, best)) || lethal || (incoming >= s.P.life - 4 && power(s, a) >= 3);
    if (!ok) continue;
    map.set(a.uid, best); avail.splice(avail.indexOf(best), 1);
    incoming -= hasKw(s, a, 'trample') ? Math.min(power(s, a), pt(s, best)[1]) : power(s, a);
  }
  return map;
}

// ---- 相手のターンに使う呪文 ----
function reactLoop(s, ctx) {
  for (let guard = 0; guard < 6 && !s.over; guard++) {
    const opts = [];
    for (const c of s.P.hand) {
      const d = c.def;
      if (!d.react || c.locked) continue;
      const o = { convoke: d.kw?.includes('convoke') };
      if (!plan(s, d.cost, colorsOf(d), o)) continue;
      const r = d.react(s, api, ctx);
      if (r && r.score > 0) opts.push({ score: r.score, exec: () => { const pl = plan(s, d.cost, colorsOf(d), o); if (pl) castCard(s, c, pl, { run: r.run }); } });
    }
    if (!opts.length) break;
    opts.sort((a, b) => b.score - a.score);
    opts[0].exec();
  }
}

function beforeBlocks(s, attackers) {
  // 瞬速のクリーチャーをブロックのために出す
  for (const c of [...s.P.hand]) {
    if (!c.def.flash || !c.def.types.includes('creature')) continue;
    const pl = plan(s, c.def.cost, colorsOf(c.def));
    if (pl) castCard(s, c, pl, {});
  }
  reactLoop(s, { attackers, blocks: new Map(), when: 'attack' });
}

function duringBlocks(s, attackers, bl) { reactLoop(s, { attackers, blocks: bl, when: 'blocks' }); }

function counter(s, c) {
  const threat = s.floor.castThreat?.(s, c.def, api) ?? (c.def.types.includes('creature') ? (c.def.pow || 0) + 1 : (c.def.danger ?? 2));
  if (threat < 4) return false;
  for (const h of s.P.hand) {
    const d = h.def;
    if (!d.counter || (d.counter === 'creature' && !c.def.types.includes('creature'))) continue;
    const pl = plan(s, d.cost, colorsOf(d), { req2: d.req2 });
    if (!pl) continue;
    castCard(s, h, pl, { run: () => {} });
    return true;
  }
  return false;
}

function scryKeep(s, c) {
  const mana = s.P.mana.length;
  if (c.def.basic) return mana < 5;
  return c.def.cost <= mana + 2 || rarityV(c.def) >= 3;
}

// ---- カードの効果から使う判断 ----
function burnTarget(s, n, o = {}) {
  let best = null, bs = 0;
  const list = (o.list || s.E.bf.filter(isCreature)).filter((p) => (!o.filter || o.filter(p)) && !(s.floor.untargetable?.(s, p, api)));
  for (const p of list) {
    if (need(s, p) > n && !o.mustHit) continue;
    const v = (s.floor.priority(s, p, api) || 0) * (need(s, p) <= n ? 1 : 0.2);
    if (v > bs) { bs = v; best = p; }
  }
  if (!o.creatureOnly && s.floor.faceValue) {
    const fv = s.floor.faceValue(s, n, api);
    if (fv > bs) { bs = fv; best = 'face'; }
  }
  return best ? { t: best, score: bs } : null;
}

function bestBuffTarget(s, exclude, o = {}) {
  let best = null, bv = -1;
  for (const p of s.P.bf) {
    if (!isCreature(p) || p === exclude) continue;
    let v = power(s, p) + (hasKw(s, p, 'flying') ? 2 : 0) + (hasKw(s, p, 'trample') ? 1 : 0);
    if (o.ready && (p.sick && !hasKw(s, p, 'haste'))) v -= 3;
    if (hasKw(s, p, 'defender')) v -= 5;
    if (v > bv) { bv = v; best = p; }
  }
  return best;
}

// 割り振り：倒せる敵から順に必要なぶんだけ。あまりは最後の候補に
function divide(s, n, cands) {
  const list = cands.map((p) => ({ p, need: need(s, p), v: s.floor.priority(s, p, api) || 0.1 }))
    .filter((x) => x.need !== Infinity).sort((a, b) => (a.need - b.need) || (b.v - a.v));
  const out = [];
  let left = n;
  const k = Math.max(1, Math.min(list.length, n));
  if (left > 1 && ask(s, { hint: '割り振る：おなじ数ずつ わけると？（あまりは きりすて）', text: `${n} ÷ ${k} ＝ □`, answer: Math.floor(n / k), reward: '割り振る数が ＋1' })) left++; // 割り振るのけいさんボーナス
  for (const x of list) { if (x.need <= left) { out.push({ t: x.p, n: x.need }); left -= x.need; } }
  if (left > 0 && (out.length || list.length)) {
    const tgt = out.length ? out[out.length - 1] : { t: list[0].p, n: 0 };
    if (!out.includes(tgt)) out.push(tgt);
    tgt.n += left;
  }
  return out;
}

function enemyThreatOf(s, p) { return power(s, p) * 2 + (s.floor.priority(s, p, api) || 0); }

Object.assign(api, {
  then: (r, f) => (r && r.then ? r.then(f) : f()),
  plan, pay, castCard, assignKill, killTargets, burnTarget, bestBuffTarget, divide, readyAttackers, enemyThreatOf, keepValue,
  attackersReady: readyAttackers,
  manaCount: (s) => manaCount(s, {}),
  // 自分の墓地のインスタントで、いちばん価値が高いもの（機械巨人）
  bestInstantInGy: (s) => {
    let best = null, bv = 0;
    for (const c of s.P.gy) {
      if (!c.def.types.includes('instant') || !c.def.play || c.def.counter) continue;
      const r = c.def.play(s, api, { phase: 1, c, xMax: 3 });
      if (r && r.score > bv) { bv = r.score; best = { c, r }; }
    }
    return best;
  },
  castFree: (s, c, r) => { castCard(s, c, null, { run: r.run, from: 'gy', free: true, x: r.x }); },
  // 占術：人が遊ぶときは s.ai.scry が画面で聞く（Promise を返す）
  scry: (s, n) => {
    L(s, `占術 ${n}`);
    if (s.ai.scry) return s.ai.scry(s, n);
    const top = s.P.lib.splice(0, n);
    const keepL = [], bottom = [];
    for (const c of top) (scryKeep(s, c) ? keepL : bottom).push(c);
    s.P.lib.unshift(...keepL); s.P.lib.push(...bottom);
  },
});

export const AI = { main, attack, tricks, blocks, beforeBlocks, duringBlocks, counter };
