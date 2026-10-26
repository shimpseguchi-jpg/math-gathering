// プレイヤー側のAI（シミュレーション用）。ルールは game.js、カードの使いどころは各カードの play / react
import {
  api, COLORS, colorsOf, isCreature, onBf, pt, power, need, hasKw, tapPerm, enter, sba, L, canBlock, blockFacts, card, levelRow, discard, leave, costOf, cant, cmdCost,
  zzBreak, useBreak, BREAK_AT, BREAK_ALL, ZZ_BLUE,
} from './game.js';

export const RARITY_PTS = { C: 1, U: 2, R: 3, L: 4 };
// デッキの 点数（旗は 4点）
export const ptsOf = (d) => d.pts ?? RARITY_PTS[d.rar] ?? 0;
const rarityV = (d) => RARITY_PTS[d.rar] || 0;
const isPermDef = (d) => !d.types.includes('instant') && !d.types.includes('sorcery');

// ---- マナの支払い ----
function sources(s, o = {}) {
  const out = [];
  // 統率者戦：マナゾーンの カードは どれも 統率者の 色の マナを 出せる（統率者の 加護）
  const idc = s.P.cmdId ? colorsOf(s.P.cmd[0]?.def || s.P.bf.find((p) => p.card?.id === s.P.cmdId)?.def || {}) : [];
  for (const m of s.P.mana) if (!m.tapped) { const c = [...new Set([...colorsOf(m.def), ...idc])]; out.push({ kind: 'mana', ref: m, colors: c.length ? c : ['C'], pri: 0 }); }
  for (const p of s.P.bf) {
    const m = manaOf(s, p);
    if (p.tapped || !m || p === o.exclude || p.attacking) continue;
    if (isCreature(p) && p.sick) continue;
    // 宝物は さいごに 使う（とっておける）
    for (let i = 0; i < m.n; i++) out.push({ kind: 'ability', ref: p, colors: m.colors === 'any' ? COLORS : m.colors, pri: p.def.treasure ? 4 : 1 });
  }
  if (o.convoke) for (const p of s.P.bf) {
    if (!isCreature(p) || p.tapped || p === o.exclude || out.some((x) => x.ref === p)) continue;
    const free = p.sick || hasKw(s, p, 'defender') || cant(s, p, 'cantAttack');
    if (o.sickOnly && !free) continue;
    const c = colorsOf(p.def);
    out.push({ kind: 'convoke', ref: p, colors: c.length ? c : ['C'], pri: free ? 2 : 3 });
  }
  return out.sort((a, b) => a.pri - b.pri);
}

// タップで 出せる マナ（Lvアップで ふえる ものも ある）
// 宝物：好きな 色 1つ（金づかいの ドラゴンが いれば 2つ）。フレイアリーズの 歌：クリーチャーが 好きな 色 1つ
function manaOf(s, p) {
  if (p.def.treasure) return { colors: 'any', n: s[p.side].bf.some((q) => q.def.richTreasure) ? 2 : 1 };
  const r = levelRow(p); const m = r?.mana ?? p.def.mana;
  if (m) return { colors: m, n: r?.manaN ?? (typeof p.def.manaN === 'function' ? p.def.manaN(p, s) : p.def.manaN) ?? 1 };
  // ニヴ＝ミゼット（UR06）：あなたの アーティファクトは 好きな 色の マナを 出す
  if ((p.def.types || []).includes('artifact') && !isCreature(p) && s[p.side].bf.some((q) => q.def.artifactMana)) return { colors: 'any', n: 1 };
  if (isCreature(p) && p.side === 'P' && (s.P.flags.anyManaUntil || 0) >= s.stats.playerTurns) return { colors: 'any', n: 1 };
  return null;
}

// 呪文書・学習で 手に 入れた カード（c.conj）は、色の マナが なければ 1つにつき ライフ 2 で かわりに できる（マナの 数は そのまま）
// o.lifeKeep：はらった あとに のこす ライフ（人は 1、AI は 5）。0 なら ライフでは はらわない
export const LIFE_PIP = 2;
export function plan(s, cost, req = [], o = {}) {
  const src = sources(s, o);
  if (src.length < cost) return null;
  const chosen = new Set();
  let prism = null, life = 0;
  const nReq = cost === 0 || !req.length ? 0 : (o.req2 ? 2 : 1);
  for (let k = 0; k < nReq; k++) {
    let x = src.find((y) => !chosen.has(y) && y.colors.some((c) => req.includes(c)));
    if (!x) {
      const pr = s.P.bf.find((p) => p.def.prism && !p.tapped);
      if (pr && !prism) { prism = pr; x = src.find((y) => !chosen.has(y)); }
    }
    if (!x && o.lifeKeep && s.P.life - life - LIFE_PIP >= o.lifeKeep) { life += LIFE_PIP; x = src.find((y) => !chosen.has(y)); }
    if (!x) return null;
    chosen.add(x);
  }
  for (const x of src) { if (chosen.size >= cost) break; chosen.add(x); }
  if (chosen.size < cost) return null;
  return { srcs: [...chosen], prism, life };
}

export function pay(s, pl) {
  const convoked = [];
  for (const x of pl.srcs) {
    if (x.kind === 'mana') x.ref.tapped = true;
    else { tapPerm(s, x.ref); if (x.kind === 'convoke') convoked.push(x.ref); if (x.kind === 'ability' && x.ref.def.manaLife) api.hurt(s, x.ref.def.manaLife); }
    if (x.ref.def?.treasure && onBf(s, x.ref)) leave(s, x.ref, 'gy');
  }
  if (pl.prism) pl.prism.tapped = true;
  if (pl.life) { L(s, `${s.swapped ? 'てき：' : ''}色の マナの かわりに ライフを ${pl.life} はらう`); s.stats.lifePaid = (s.stats.lifePaid || 0) + pl.life; api.hurt(s, pl.life); }
  return [...new Set(convoked)];
}

export const manaCount = (s, o = {}) => sources(s, o).length;

// ---- 唱える ----
export function castCard(s, c, pl, o = {}) {
  // 恩恵（アルケミー YW04）：つぎの クリーチャー呪文は 永久に ＋2/＋2
  if (s.P.flags.boonCreature && (c.def.types || []).includes('creature')) {
    const k = 2 * s.P.flags.boonCreature; s.P.flags.boonCreature = 0;
    const P0 = c.def.pow, T0 = c.def.tou;
    c.def = { ...c.def, perp: true, pow: typeof P0 === 'function' ? (a, b, e) => P0(a, b, e) + k : (P0 ?? 0) + k, tou: typeof T0 === 'function' ? (a, b, e) => T0(a, b, e) + k : (T0 ?? 0) + k };
    L(s, `おんけい：${c.def.name} は えいきゅうに ＋${k}/＋${k}`);
  }
  const P = s.P, def = c.def, from = o.from || 'hand';
  if (from === 'hand') P.hand.splice(P.hand.indexOf(c), 1);
  else if (from === 'gy' || from === 'escape' || from === 'madness') P.gy.splice(P.gy.indexOf(c), 1);
  else if (from === 'cmd') { P.cmd.splice(P.cmd.indexOf(c), 1); P.cmdCasts = (P.cmdCasts || 0) + 1; L(s, `${s.swapped ? 'てき：' : ''}とうそつりょういきから（つぎは ＋${(P.cmdStep ?? 2) * P.cmdCasts}マナ）`); }
  // 脱出：墓地の ほかの カードを N まい 追放する（古い ものから）
  if (from === 'escape') { const ex = P.gy.splice(0, o.escExile ?? Math.min(P.gy.length, def.escape.total - 1)); P.exile.push(...ex); L(s, `${s.swapped ? 'てき：' : ''}だっしゅつ：ぼちの ${ex.length}まいを ついほう`); }
  // 収斂：はらった マナの 色の 数
  P.flags.converge = pl ? Math.min(pl.srcs.length, new Set(pl.srcs.flatMap((x) => x.colors.filter((k) => k !== 'C'))).size) : 0;
  const convoked = pl ? pay(s, pl) : [];
  // 探査：はらわなかった ぶん、墓地の カードを 古い ものから 追放する
  if (def.delve && pl) {
    const ex = P.gy.splice(0, Math.max(0, def.cost + (o.x || 0) * (def.xMul || 1) - pl.srcs.length));
    P.exile.push(...ex);
    if (ex.length) L(s, `${s.swapped ? 'てき：' : ''}たんさ：ぼちの ${ex.length}まいを ついほう`);
  }
  P.flags.cast++;
  L(s, `${s.swapped ? 'てき：' : ''}となえた：${def.name}${o.x != null ? `（X=${o.x}）` : ''}${from === 'escape' ? '（だっしゅつ）' : ''}`);
  const noncreature = !def.types.includes('creature');
  for (const q of [...P.bf]) {
    if (!onBf(s, q)) continue;
    if (noncreature && hasKw(s, q, 'prowess')) api.pump(q, 1, 1);
    q.def.onCast?.(s, q, def, api, { x: o.x || 0, from });
    q.def.onAnyCast?.(s, q, def, 'P', api);
    // 強請：のこりの マナが あれば 1つ はらって、敵に 1点・自分は 1点 回復（自動）
    if (hasKw(s, q, 'extort')) {
      const ep = plan(s, 1, []);
      if (ep) { pay(s, ep); L(s, `ゆすり：${q.def.name}`); api.hitEnemy(s, 1, null); api.gain(s, 1); for (const r of [...P.bf]) r.def.onExtort?.(s, r, api); }
    }
  }
  if (isPermDef(def)) { enter(s, 'P', def, { ctr: (o.ctr || 0) + (from === 'escape' ? def.escape.ctr || 0 : 0), convoked, card: def, chosen: o.chosen, escaped: from === 'escape' }); sba(s); return; }
  const done = () => {
    if (from === 'escape' || from === 'madness') P.gy.push(c);
    else if (from === 'gy' || (o.free && from !== 'lib')) P.exile.push(c); // やまふだから タダで 唱えた ものは ふつうに 墓地へ
    else if (def.backToHand) { c.locked = true; P.hand.push(c); }
    else P.gy.push(c);
    sba(s);
  };
  // 効果が 画面の答えを待つ（占術など）ときだけ Promise を返す。シミュレーションでは そのまま進む
  // ミラーリの 予想（III）：この ターンは インスタント・ソーサリーを コピーする
  // 共鳴者（U66）：インスタント・ソーサリーを いつも コピーする
  const copy = P.flags.copySpells === s.turn || P.bf.some((q) => q.def.copyAll);
  // この 呪文の ダメージは「あなたの カード」の ダメージ（炎の 解放・トーブラン）
  s.resolving = s.swapped ? 'E' : 'P'; s.resolvingRed = colorsOf(def).includes('R');
  // 最後に 唱えた インスタント・ソーサリー（双つ術 R67 が コピーする）
  if (o.run) P.flags.lastSpell = { def, run: o.run, x: o.x, turn: s.turn };
  const r0 = o.run?.(o.x);
  const r = copy ? api.then(r0, () => copySpell(s, def, () => o.run?.(o.x))) : r0;
  const fin = () => { s.resolving = null; done(); };
  if (r && r.then) return r.then(fin);
  fin();
}

// 呪文の コピー（魔技も おきる）
export function copySpell(s, def, run) {
  L(s, `コピー：${def.name}`);
  const r = run();
  return api.then(r, () => { for (const q of [...s.P.bf]) if (onBf(s, q)) q.def.onCopy?.(s, q, def, api); });
}

// 出来事・授与は、ふつうに 唱える ほかに えらべる
function optionsFor(s, c, phase, from) {
  const out = optionsFor0(s, c, phase, from);
  if (from === 'hand' && c.def.adv && !c.advDone) out.push(...advOptions(s, c, phase));
  if (from === 'hand' && c.def.bestow) out.push(...bestowOptions(s, c, phase));
  return out;
}

// 出来事：カードの 下の 呪文だけ 使う。カードは 手札に のこり（補充では かぞえない）、あとで クリーチャーとして 唱えられる
function advOptions(s, c, phase) {
  const a = c.def.adv;
  if (!a.play || (a.kind === 'sorcery' && phase === 'react') || !plan(s, a.cost, a.req)) return [];
  const r = a.play(s, api, { phase, c, manaLeft: manaCount(s) - a.cost });
  if (!r || r.score <= 0) return [];
  return [{ score: r.score + 1, name: `${a.name}（できごと）`, exec: () => { const pl = plan(s, a.cost, a.req); if (pl) castAdventure(s, c, pl, r.run); } }];
}
export function castAdventure(s, c, pl, run) {
  const a = c.def.adv, P = s.P;
  pay(s, pl);
  P.flags.cast++;
  c.advDone = true;
  L(s, `${s.swapped ? 'てき：' : ''}できごと：${a.name}（${c.def.name}）`);
  const sp = { ...c.def, name: a.name, cost: a.cost, types: [a.kind] };
  for (const q of [...P.bf]) {
    if (!onBf(s, q)) continue;
    if (hasKw(s, q, 'prowess')) api.pump(q, 1, 1);
    q.def.onCast?.(s, q, sp, api, { x: 0, from: 'adventure' });
    q.def.onAnyCast?.(s, q, sp, 'P', api);
  }
  return api.then(run?.(), () => sba(s));
}

// 授与：オーラとして 唱えて クリーチャーに つける。つけた クリーチャーが いなくなったら クリーチャーに もどる
export const bestowDef = (d) => (d.bestowAura ||= {
  id: d.id, name: d.name, rar: d.rar, color: d.color, cost: d.bestow.cost, types: ['enchantment'], sub: ['aura'], kw: [], aura: true, bestowBase: d,
  eqP: d.bestow.p || 0, eqT: d.bestow.t || 0, eqPT: d.bestow.pt, steal: d.bestow.steal,
  grant: d.bestow.kw ? (s, q, p) => (p.uid === q.attached ? d.bestow.kw : null) : undefined,
  onLeaveSelf: d.bestow.steal ? (s, p, E) => E.unsteal(s, p) : undefined,
});
export function castBestow(s, c, pl, host) {
  const d = c.def, aura = bestowDef(d);
  c.def = aura;
  castCard(s, c, pl, {});
  c.def = d;
  const p = [...s.P.bf].reverse().find((q) => q.def === aura);
  if (!p) return;
  p.card = d;
  if (onBf(s, host)) api.attach(s, p, host);
  else { p.def = d; L(s, `${d.name} は クリーチャーとして 出た`); }
  sba(s);
}
const stealable = (s, p) => isCreature(p) && !p.def.noCopy && !s.floor.cantLeave?.(s, p, api) && !s.floor.untargetable?.(s, p, api);
function bestowOptions(s, c, phase) {
  const b = c.def.bestow;
  if (phase !== 1 || !plan(s, b.cost, b.req || colorsOf(c.def))) return [];
  const host = b.steal ? s.E.bf.filter((p) => stealable(s, p)).sort((x, y) => power(s, y) - power(s, x))[0] : api.bestBuffTarget(s, null, { ready: true });
  if (!host || (b.steal && power(s, host) < 2)) return [];
  return [{ score: 12 + b.cost * 3, name: `${c.def.name}（じゅよ）`, exec: () => { const pl = plan(s, b.cost, b.req || colorsOf(c.def)); if (pl) castBestow(s, c, pl, host); } }];
}

// 脱出（2026-10-24）：合計の コスト ＝ マナ ＋ 墓地から 追放する ほかの カード。マナは 1つ いじょう。
// いちばん 少ない マナ（墓地を できるだけ 使う）。AI は いつも これで 唱える
export const escapeMin = (s, d) => Math.max(1, d.escape.total - (s.P.gy.length - 1));
function optionsFor0(s, c, phase, from) {
  const def = c.def;
  const cost = from === 'gy' ? def.flashback.cost : from === 'escape' ? escapeMin(s, def) : (from === 'cmd' ? cmdCost(s, def) : costOf(s, def));
  const req = from === 'gy' ? def.flashback.req : from === 'escape' ? def.escape.req || colorsOf(def) : colorsOf(def);
  const o = { convoke: def.kw?.includes('convoke'), sickOnly: phase === 1, req2: def.req2, lifeKeep: c.conj ? 5 : 0 };
  if (def.discardCost && from === 'hand' && s.P.hand.length - 1 < def.discardCost) return [];
  const mul = def.xMul || 1;
  if (def.x) {
    const xMax = Math.floor((manaCount(s, o) - cost) / mul);
    if (xMax < 1 || !plan(s, cost + mul, req, o)) return [];
    const r = def.play(s, api, { phase, xMax, c, from });
    if (!r || r.score <= 0) return [];
    const x = Math.min(r.x ?? xMax, xMax);
    return [{
      score: r.score, name: def.name, exec: () => {
        const pl = plan(s, cost + x * mul, req, o); if (!pl) return;
        castCard(s, c, pl, { x, ctr: x, run: () => r.run(x), from });
      },
    }];
  }
  const out = from === 'hand' ? suspendOption(s, c, phase) : [];
  if (!plan(s, cost, req, o)) return out;
  if (isPermDef(def)) {
    const sc = def.permScore ? def.permScore(s, api, { phase }) : permScore(s, def, phase);
    if (sc == null || sc <= 0) return out;
    return [...out, { score: sc + (from === 'escape' ? -2 : 0), name: def.name, exec: () => { const pl = plan(s, cost, req, o); if (pl) castCard(s, c, pl, { from }); } }];
  }
  if (!def.play || (def.reactive && phase !== 'react')) return out;
  if (def.types.includes('sorcery') && phase === 'react') return out;
  // r.extra：激励・キッカー・増呪で ふえる マナ（ctx.manaLeft を見て 払える ぶんだけ）
  const r = def.play(s, api, { phase, c, manaLeft: manaCount(s, o) - cost, from });
  if (!r || r.score <= 0) return out;
  const extra = r.extra || 0;
  if (extra && !plan(s, cost + extra, req, o)) return out;
  return [...out, { score: r.score, name: def.name, exec: () => {
    const pl = plan(s, cost + extra, req, o); if (!pl) return;
    if (def.discardCost && from === 'hand') discard(s, discardPick(s, def.discardCost, cost + extra, c));
    castCard(s, c, pl, { run: r.run, from });
  } }];
}

// 待機：いま 少しの マナで、時間カウンターが なくなったら ただで 唱える
function suspendOption(s, c, phase) {
  const sp = c.def.suspend;
  if (!sp || phase !== 1 || !plan(s, sp.cost, sp.req || [])) return [];
  const now = plan(s, c.def.cost, colorsOf(c.def));
  const score = (c.def.suspendScore ?? 6) - (now ? 3 : 0);
  return [{ score, name: `${c.def.name}（たいき）`, exec: () => { const pl = plan(s, sp.cost, sp.req || []); if (pl) suspendCard(s, c, pl); } }];
}

export function suspendCard(s, c, pl) {
  s.P.hand.splice(s.P.hand.indexOf(c), 1);
  pay(s, pl);
  s.P.suspended.push({ c, n: c.def.suspend.turns });
  L(s, `たいき：${c.def.name}（時間カウンター ${c.def.suspend.turns}）`);
}

// 待機が おわった 呪文を ただで 唱える（人が 遊ぶときは 画面で 対象を えらぶ）
function castSuspended(s, c) {
  if (s.ai.castSuspended) return s.ai.castSuspended(s, c);
  const r = c.def.play?.(s, api, { phase: 1, c, manaLeft: 0, free: true });
  if (r) castCard(s, c, null, { run: r.run, from: 'suspend' });
  else { s.P.gy.push(c); L(s, `たいき：${c.def.name} は こうかが なかった`); }
}

function permScore(s, def, phase) {
  if (def.need && !def.need(s, api)) return null;
  if (def.flash && phase === 1 && s.P.hand.some((c) => c.def === def) && s.floor.threat(s, api).attackers > 0) return 1; // 瞬速はなるべく相手のターンに
  return 10 + def.cost * 3 + rarityV(def);
}

// 捨てる カードを えらぶ：きほんカード、つぎに いま 唱えられない 重い カードから
export function discardPick(s, n, spend = 0, exclude = null) {
  const left = manaCount(s) - spend;
  const key = (c) => (c.def.rar === 'B' ? 0 : c.def.cost > left ? 100 - c.def.cost : 200 - c.def.cost);
  return s.P.hand.filter((c) => c !== exclude).sort((a, b) => key(a) - key(b)).slice(0, n);
}

function actOptions(s, phase) {
  const out = [];
  for (const p of s.P.bf) for (const a of p.def.acts || []) {
    if (a.when && !a.when.includes(phase)) continue;
    if (a.tap && (p.tapped || (isCreature(p) && p.sick))) continue;
    if (a.monstrosity && p.monstrous) continue;
    if (a.discard && s.P.hand.length < a.discard) continue;
    if (a.levelUp && p.def.levelMax && p.level >= p.def.levelMax) continue;
    if (a.can && !a.can(s, p, api)) continue;
    const cost = typeof a.cost === 'function' ? a.cost(s, p, api) : a.cost;
    const o = { exclude: a.tap || a.sac ? p : null };
    let xMax = 0;
    if (a.x) { xMax = manaCount(s, o) - cost; if (xMax < 1) continue; }
    if (!plan(s, cost + (a.x ? 1 : 0), a.req || [], o)) continue;
    const r = a.play(s, p, api, { phase, xMax });
    if (!r || r.score <= 0) continue;
    const x = a.x ? Math.min(r.x ?? xMax, xMax) : 0;
    out.push({
      score: r.score, name: `${p.def.name} の のうりょく`, exec: () => {
        const pl = plan(s, cost + x, a.req || [], o); if (!pl) return;
        pay(s, pl);
        if (a.tap) tapPerm(s, p);
        if (a.discard) discard(s, discardPick(s, a.discard, cost + x));
        if (a.monstrosity) p.monstrous = true;
        if (a.levelUp) levelUp(s, p);
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
    out.push({ score: 4, name: `${p.def.name} の そうび`, exec: () => { const pl = plan(s, p.def.equip, []); if (!pl) return; pay(s, pl); p.attached = t.uid; p.def.onEquip?.(s, p, t, api); } });
  }
  return out;
}

// 蘇生（イゼットの ゾンビ GX02）：3（黒）で 墓地の クリーチャーを 戦場に。速攻、ターンの おわりに 追放
const isCrDef = (d) => (d.types || []).includes('creature');
function unearthOption(s, c) {
  if (!plan(s, 3, ['K']) || (c.def.pow ?? 0) < 3) return [];
  return [{ score: 6 + (c.def.pow ?? 0), name: `${c.def.name}（そせい）`, exec: () => unearth(s, c, plan(s, 3, ['K'])) }];
}
export function unearth(s, c, pl) {
  if (!pl) return;
  pay(s, pl);
  s.P.gy.splice(s.P.gy.indexOf(c), 1);
  const p = enter(s, 'P', c.def, { card: c.def });
  p.unearthed = true; p.kwT.add('haste');
  L(s, `そせい：${c.def.name}`);
  sba(s);
}

export function levelUp(s, p) { p.level++; L(s, `Lvアップ：${p.def.name}（レベル ${p.level}）`); }

// ---- メイン・フェイズ ----
function main(s, phase) {
  if (phase === 1) chargeMana(s);
  while (s.P.brkReady > 0 && !s.over) aiBreak(s);
  for (let guard = 0; guard < 40 && !s.over; guard++) {
    const opts = [];
    for (const c of [...s.P.hand]) if (!c.locked) opts.push(...optionsFor(s, c, phase, 'hand'));
    for (const c of s.P.gy) if (c.def.flashback) opts.push(...optionsFor(s, c, phase, 'gy'));
    for (const c of s.P.cmd || []) opts.push(...optionsFor(s, c, phase, 'cmd'));
    for (const c of s.P.gy) if (c.def.escape) opts.push(...optionsFor(s, c, phase, 'escape'));
    if (phase === 1 && s.P.bf.some((q) => q.def.unearthAll)) for (const c of s.P.gy) if (isCrDef(c.def)) opts.push(...unearthOption(s, c));
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
  return s.P.bf.filter((p) => isCreature(p) && !p.tapped && (!p.sick || hasKw(s, p, 'haste')) && !hasKw(s, p, 'defender') && !cant(s, p, 'cantAttack') && power(s, p) > 0);
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
      const br = d.bloodrush, bv = (v) => (typeof v === 'function' ? v(s, api) : v);
      const tr = d.trick || (br ? { kind: 'single', p: bv(br.p) ?? 4, t: bv(br.t) ?? 4, cost: br.cost, req: br.req, bloodrush: true } : null);
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
    // 忍術：ブロックされなかった 攻撃クリーチャーを 手札に もどして、忍者を 攻撃している 状態で 出す
    for (const c of s.P.hand) {
      const nj = c.def.ninjutsu; if (!nj || c.locked || !plan(s, nj.cost, nj.req, { req2: nj.req.length > 1 })) continue;
      for (const a of live) {
        if (blocks.get(a.p.uid) || a.p.token || a.p.def.ninjutsu) continue;
        consider(3 + c.def.pow - power(s, a.p), () => ninjutsu(s, c, a));
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

// 忍術（人が 遊ぶ ときも つかう）。a は 攻撃の { p, t }。a.p を 忍者に 入れかえる
export function ninjutsu(s, c, a) {
  const nj = c.def.ninjutsu;
  const pl = plan(s, nj.cost, nj.req, { req2: nj.req.length > 1 }); if (!pl) return false;
  pay(s, pl);
  s.P.hand.splice(s.P.hand.indexOf(c), 1);
  const old = a.p;
  old.attacking = false;
  leave(s, old, 'hand');
  const n = enter(s, 'P', c.def, { card: c.def, tapped: true });
  n.attacking = true;
  a.p = n;
  L(s, `にんじゅつ：${old.def.name} → ${c.def.name}`);
  if (/^ZZ/.test(c.def.id)) zzBreak(s, 'swap', '交代');
  return true;
}

// ゼンゼロの ブレイク：本体で かてる → 本体。たおせる てきが 2体 いじょう → ぜんたい。つよい てきを たおせる → それ。あとは 本体（なければ マナから かいしゅう）
function aiBreak(s) {
  const cr = s.E.bf.filter(isCreature);
  const left = (p) => pt(s, p)[1] - p.dmg;
  if (s.floor.face && s.E.life <= BREAK_AT) return useBreak(s, 'one', 'face');
  if (cr.filter((p) => left(p) <= BREAK_ALL).length >= 2) return useBreak(s, 'all');
  const big = cr.filter((p) => left(p) <= BREAK_AT).sort((a, b) => power(s, b) - power(s, a))[0];
  if (big && power(s, big) >= 3) return useBreak(s, 'one', big);
  if (s.floor.face) return useBreak(s, 'one', 'face');
  if (big) return useBreak(s, 'one', big);
  const m = [...s.P.mana].sort((a, b) => (b.def.cost || 0) - (a.def.cost || 0))[0];
  return m ? useBreak(s, 'mana', m) : useBreak(s, 'all');
}

// 交代（ゼンゼロ。swapBlock の ある カード）：ブロックしている じぶんの クリーチャー（blocks の aUid の もの）を 手札に もどして、c を かわりに ブロックさせる
export function swapBlocker(s, c, aUid, blocks) {
  const nj = c.def.ninjutsu;
  const pl = plan(s, nj.cost, nj.req, { req2: nj.req.length > 1 }); if (!pl) return false;
  const old = blocks.get(aUid); if (!old || !onBf(s, old)) return false;
  pay(s, pl);
  s.P.hand.splice(s.P.hand.indexOf(c), 1);
  leave(s, old, 'hand');
  const n = enter(s, 'P', c.def, { card: c.def });
  blocks.set(aUid, n);
  L(s, `こうたい（ブロック）：${old.def.name} → ${c.def.name}`);
  zzBreak(s, 'swap', '交代');
  return true;
}
// AI：ブロックした クリーチャーが たおれて しまう とき、たおれない か あいてを たおせる エージェントと 交代
function swapBlocks(s, attackers, bl) {
  for (const a of attackers) {
    const b = bl.get(a.uid); if (!b || !onBf(s, b) || !onBf(s, a)) continue;
    if (blockFacts(s, b, a).survives) continue; // ブロックした ものが たおれない なら そのまま
    const P = power(s, a), T = pt(s, a)[1] - a.dmg;
    const c = s.P.hand.filter((x) => x.def.swapBlock && plan(s, x.def.ninjutsu.cost, x.def.ninjutsu.req, { req2: x.def.ninjutsu.req.length > 1 }) && ((x.def.tou ?? 0) > P || (x.def.pow ?? 0) >= T))
      .sort((x, y) => (y.def.pow ?? 0) + (y.def.tou ?? 0) - (x.def.pow ?? 0) - (x.def.tou ?? 0))[0];
    if (c) swapBlocker(s, c, a.uid, bl);
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
      const r = d.react(s, api, { ...ctx, manaLeft: manaCount(s, o) - d.cost });
      if (r && r.score > 0) opts.push({ score: r.score, exec: () => { const pl = plan(s, d.cost + (r.extra || 0), colorsOf(d), o); if (pl) castCard(s, c, pl, { run: r.run }); } });
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

function duringBlocks(s, attackers, bl) { swapBlocks(s, attackers, bl); reactLoop(s, { attackers, blocks: bl, when: 'blocks' }); }

function counter(s, c) {
  const threat = s.floor.castThreat?.(s, c.def, api) ?? (c.def.types.includes('creature') ? (typeof c.def.pow === 'number' ? c.def.pow : 3) + 1 : (c.def.danger ?? 2));
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
  plan, pay, castCard, assignKill, killTargets, burnTarget, bestBuffTarget, divide, readyAttackers, enemyThreatOf, keepValue, discardPick,
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
  // マッドネス：捨てた カードを、マッドネスの コストで すぐ 唱える（はらえて、こうかが あるとき。人が 遊ぶ ときも 自動）
  madness: (s, c) => {
    const d = c.def, m = d.madness;
    const pl = plan(s, m.cost, m.req || colorsOf(d)); if (!pl) return;
    if (isPermDef(d)) { L(s, `マッドネス：${d.name}`); castCard(s, c, pl, { from: 'madness' }); return; }
    const r = d.play?.(s, api, { phase: 1, c, manaLeft: 0, human: !!s.ai.scry });
    if (!r || r.score <= 0) return;
    L(s, `マッドネス：${d.name}`);
    castCard(s, c, pl, { from: 'madness', run: r.run });
  },
  ninjutsu, swapBlocker, castAdventure, castBestow, stealable, copySpell, unearth,
  castSuspended,
  // 諜報（第7弾）：占術と 同じ きじゅんで、のこさない カードは ぼちへ。人は s.ai.surveil が 画面で 聞く
  surveil: (s, n) => {
    L(s, `ちょうほう ${n}`);
    if (s.ai.surveil) return s.ai.surveil(s, n);
    const top = s.P.lib.splice(0, n);
    const keepL = [];
    for (const c of top) (scryKeep(s, c) ? keepL : s.P.gy).push(c);
    s.P.lib.unshift(...keepL);
  },
  // 占術：人が遊ぶときは s.ai.scry が画面で聞く（Promise を返す）
  scry: (s, n) => {
    if (ZZ_BLUE.mode === 'scry' && n > 0) zzBreak(s, 'U', '青：占術');
    L(s, `せんじゅつ ${n}`);
    if (s.ai.scry) return s.ai.scry(s, n);
    const top = s.P.lib.splice(0, n);
    const keepL = [], bottom = [];
    for (const c of top) (scryKeep(s, c) ? keepL : bottom).push(c);
    s.P.lib.unshift(...keepL); s.P.lib.push(...bottom);
  },
});

export const AI = { main, attack, tricks, blocks, beforeBlocks, duringBlocks, counter };
api.AI = AI;
