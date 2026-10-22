// たたかいの画面。ルールは engine/game.js、プレイヤーの判断はタップで、敵のターン中の質問は await で待つ
import {
  api, newGame, beginPlayerTurn, endPlayerTurn, enemyTurn, combatStart, declareAttack, finishCombat, LOW_LIBRARY, reshuffleCost,
  isCreature, onBf, hasKw, pt, power, colorsOf, canBlock, sba, tapPerm, discard,
} from '../engine/game.js';
import { AI, plan, castCard, pay, readyAttackers, suspendCard, levelUp, manaCount } from '../engine/ai.js';
import { FLOORS, nyxLoss, PVP_TURNS } from '../data/enemies.js';
import { permFace, cardFace, detail, sheet, esc, ruby, noRuby, info, pickMany, divideSheet, numberSheet } from './view.js';
import { makeTutorial } from './tutorial.js';

let B = null; // いまのたたかい
const app = () => document.getElementById('app');
// カードの 名前：nm は ふりがなつきの HTML、nmText は「漢字（よみ）」の 文字（あとで ruby に とおす）
const nmText = (p) => info(p.def).name;
const nm = (p) => ruby(nmText(p));
const isSpell = (d) => d.types.includes('instant') || d.types.includes('sorcery');

export function startBattle(o) {
  const floor = o.floor || FLOORS[o.floorId]();
  B = { mode: 'main', phase: 1, combatDone: false, busy: false, onEnd: o.onEnd, quit: o.quit, floorName: o.floorName, sel: new Map(), atk: [], blocks: new Map(), blockMap: new Map(), seen: 0 };
  B.s = newGame({ deck: o.deck, floor, diff: o.diff, seed: Math.floor(Math.random() * 1e9), ai: humanAI(), log: true });
  if (o.tutorial) { B.tut = makeTutorial(); o.setup?.(B.s, api); }
  app().onclick = onClick;
  initSwipe();
  if (floor.first === 'E') enemyFirst(); else startTurn();
}

// オンラインバトルで あいてが 先に うごく とき
async function enemyFirst() {
  await sheet(`<p>${esc(B.floorName)}が 先に うごく。</p>`, [{ label: 'はじめる', value: 1, kind: 'primary' }], { title: 'あいての せんこう', dismiss: false });
  await enemyPhase();
}

// ---- 敵のターン中にプレイヤーに聞くこと ----
function humanAI() {
  return {
    // 待機が おわった 呪文：対象を えらんで ただで 唱える
    castSuspended: async (s, c) => {
      const d = c.def;
      render();
      await sheet(detail(d), [{ label: 'つかう', value: 1, kind: 'primary' }], { title: 'たいきが おわった！ ただで となえる', dismiss: false });
      let run = null;
      if (d.tgt && d.apply) {
        const picks = needsTargets(d.tgt, {}) ? await pickAll(d.tgt, {}) : null;
        if (picks) run = () => d.apply(s, api, picks, 0);
      } else { const r = d.play?.(s, api, { phase: 1, c, human: true, manaLeft: 0 }); if (r) run = r.run; }
      if (run) await castCard(s, c, null, { run, from: 'suspend' });
      else { s.P.gy.push(c); s.logs.push(`[${s.turn}P] たいき：${d.name} は こうかが なかった`); }
      render();
    },
    // 敵が めくった カードを 見せる（打ち消せるときは counter が 見せる）
    revealed: async (s, c) => {
      if (s.P.hand.some((h) => h.def.counter && (h.def.counter === 'any' || c.def.types.includes('creature')) && plan(s, h.def.cost, colorsOf(h.def), { req2: h.def.req2 }))) return;
      render();
      await sheet(`${detail(c.def, { enemy: true })}<p class="what">${esc(revealNote(c.def))}</p>`, [{ label: 'つづける', value: 1, kind: 'primary' }], { title: 'てきが カードを めくった', dismiss: false });
    },
    counter: async (s, c) => {
      const opts = s.P.hand.filter((h) => h.def.counter && (h.def.counter === 'any' || c.def.types.includes('creature')) && plan(s, h.def.cost, colorsOf(h.def), { req2: h.def.req2 }));
      if (!opts.length) return false;
      render();
      const v = await sheet(detail(c.def, { enemy: true }), [
        ...opts.map((h) => ({ label: `${nm(h)} で 打ち消す`, value: h, kind: 'primary' })),
        { label: '打ち消さない', value: null },
      ], { title: 'てきが じゅもんを となえた！', dismiss: false });
      if (!v) return false;
      castCard(s, v, plan(s, v.def.cost, colorsOf(v.def), { req2: v.def.req2 }), { run: () => {} });
      return true;
    },
    beforeBlocks: async (s, attackers) => {
      for (const c of [...s.P.hand]) {
        if (!c.def.flash || !c.def.types.includes('creature')) continue;
        const pl = plan(s, c.def.cost, colorsOf(c.def));
        if (!pl) continue;
        render();
        const v = await sheet(detail(c.def), [{ label: 'しゅんそくで 出す（ブロックに使える）', value: true, kind: 'primary' }, { label: '出さない', value: false }], { title: `てきが ${attackers.length}体で こうげきしてくる`, dismiss: false });
        if (v) castCard(s, c, pl, {});
      }
    },
    blocks: (s, attackers) => chooseBlocks(attackers),
    // 英雄譚の 章（自分の ターンの はじめ）：対象が いる 章は えらぶ、ない 章は 見せるだけ
    chapter: async (s, p, ch, roman) => {
      render();
      let picks;
      if (ch.tgt) {
        picks = needsTargets(ch.tgt, {}) ? await pickAll(ch.tgt, { note: `えいゆうたん「${noRuby(info(p.def).name)}」の ${roman}` }) : null;
        if (!picks) picks = ch.tgt.map(() => []);
      } else await sheet(detail(p.def), [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: `えいゆうたん：${roman} が おきる`, dismiss: false });
      ch.run(s, api, p, picks);
      render();
    },
    dice: (rolls) => sheet(`<p class="big-result dice">サイコロ：${rolls.join(' ＋ ')}${rolls.length > 1 ? ` ＝ ${rolls.reduce((a, b) => a + b, 0)}` : ''}</p>${rolls.length > 1 ? '<p>6が 出たので もう1回 ふった！</p>' : ''}`, [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: 'サイコロ', dismiss: false }),
    // 占術：上から1まいずつ「上に のこす／いちばん下へ」
    scry: async (s, n) => {
      const top = s.P.lib.splice(0, n);
      const keep = [], bottom = [];
      for (let i = 0; i < top.length; i++) {
        if (B) render();
        const v = await sheet(`<p>ライブラリーの 上から ${i + 1}まいめ。つぎに 引く カードに するなら「上に のこす」。</p>${detail(top[i].def)}`, [
          { label: '上に のこす', value: 'keep', kind: 'primary' }, { label: 'いちばん 下へ', value: 'bottom' },
        ], { title: `せんじゅつ${i + 1}/${top.length}`, dismiss: false });
        (v === 'bottom' ? bottom : keep).push(top[i]);
      }
      s.P.lib.unshift(...keep); s.P.lib.push(...bottom);
      s.logs.push(`[${s.turn}P] せんじゅつ：上に ${keep.length}まい、下に ${bottom.length}まい`);
      if (B) render();
    },
    duringBlocks: async (s, attackers, blocks) => {
      for (let guard = 0; guard < 5; guard++) {
        const opts = [];
        for (const c of s.P.hand) {
          if (!c.def.react) continue;
          const o = { convoke: c.def.kw?.includes('convoke') };
          const pl = plan(s, c.def.cost, colorsOf(c.def), o);
          if (!pl) continue;
          if (c.def.modes) { if (c.def.modes.some((m) => modeOk(m, { attackers }))) opts.push({ c, pl, modes: true }); continue; }
          if (c.def.strive) continue;
          if (c.def.tgt) { if (cands(c.def.tgt[0], { attackers }).length) opts.push({ c, pl, tgt: true }); continue; }
          const r = c.def.react(s, api, { attackers, blocks });
          if (r) opts.push({ c, pl, r });
        }
        if (!opts.length) return;
        render();
        const v = await sheet('<p>いま 使える インスタントが ある。</p>', [
          ...opts.map((x) => ({ label: `${nm(x.c)} を 使う`, value: x, kind: 'primary' })),
          { label: '使わない', value: null },
        ], { title: 'ブロックの あとで', dismiss: false });
        if (!v) return;
        if (v.modes) {
          const m = await chooseMode(v.c.def, { attackers });
          if (!m) continue;
          const pl = await payable(v.c.def.cost + m.extra, colorsOf(v.c.def), {});
          if (pl) castCard(s, v.c, pl, { run: m.run });
        } else if (v.tgt) {
          const picks = await pickAll(v.c.def.tgt, { attackers });
          if (!picks) continue;
          castCard(s, v.c, plan(s, v.c.def.cost, colorsOf(v.c.def), { convoke: v.c.def.kw?.includes('convoke') }) || v.pl, { run: () => v.c.def.apply(s, api, picks) });
        } else castCard(s, v.c, v.pl, { run: v.r.run });
      }
    },
  };
}

function chooseBlocks(attackers) {
  return new Promise((resolve) => {
    B.mode = 'block'; B.blockAttackers = attackers; B.blockMap = new Map(); B.blockDone = resolve;
    render();
  });
}

// ---- ターンの流れ ----
async function startTurn() {
  const s = B.s;
  B.mode = 'main'; B.phase = 1; B.combatDone = false; B.sel = new Map();
  B.busy = true;
  await beginPlayerTurn(s);
  B.busy = false;
  if (checkOver()) return;
  render();
}

async function endTurn() {
  const s = B.s;
  if (B.busy) return;
  B.busy = true;
  endPlayerTurn(s);
  if (checkOver()) return;
  if (s.E.extraTurns > 0) {
    s.E.extraTurns--;
    await sheet('<p>たいぐんが 来る前に、もう1ターン じゅんびできる。</p>', [{ label: 'つぎの ターン', value: 1, kind: 'primary' }], { title: 'ついかターン！' });
    B.busy = false;
    if (!B.s.over) startTurn();
  } else await enemyPhase();
}

async function enemyPhase() {
  const s = B.s;
  B.busy = true;
  B.mode = 'enemy'; render();
  const from = s.logs.length;
  await enemyTurn(s);
  const lines = s.logs.slice(from).map((l) => l.replace(/^\[\d+[PE]\] /, ''));
  if (!checkOver(lines)) await sheet(`<ol class="elog">${lines.map((l) => `<li>${ruby(l)}</li>`).join('') || '<li>なにも 起きなかった</li>'}</ol>`, [{ label: 'わたしの ターン', value: 1, kind: 'primary' }], { title: s.floor.id === 'pvp' ? 'あいての ターン' : 'てきの ターン' });
  B.busy = false;
  if (!B.s.over) startTurn();
}

function checkOver(lines) {
  const s = B.s;
  if (!s.over) return false;
  render();
  const win = s.over === 'win', draw = s.over === 'draw';
  sheet(`${lines ? `<ol class="elog">${lines.map((l) => `<li>${ruby(l)}</li>`).join('')}</ol>` : ''}<p class="big-result ${win ? 'win' : draw ? 'draw' : 'lose'}">${win ? 'かった！' : draw ? 'ひきわけ' : 'まけた…'}</p><p>${s.stats.playerTurns}ターン　ぴったり ${s.stats.exact}回</p>`,
    [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: B.floorName, dismiss: false })
    .then(() => B.onEnd({ win, draw, turns: s.stats.playerTurns, exact: s.stats.exact, phase: s.stats.phase }));
  return true;
}

// ---- 攻撃先 ----
function attackTargets() {
  const s = B.s, cr = s.E.bf.filter(isCreature);
  switch (s.floor.id) {
    case 'hydra': { const h = cr.filter((p) => p.def.head); const t = h.filter((p) => p.def.taunt); return t.length ? t : h; }
    case 'horde': return [...(s.E.lib.length ? ['face'] : []), ...s.E.bf.filter((p) => p.def.types.includes('artifact'))];
    case 'factory': { const f = s.E.bf.find((p) => p.def.factory); return cr.some((p) => p.def.guard) || !f ? cr : [f, ...cr]; }
    case 'xenagos': { const r = cr.filter((p) => p.def.reveler); return r.length ? r : cr.filter((p) => p.def.xenagos); }
    case 'pvp': return ['face'];
    case 'erebos':
      if (s.phase === 1) return cr.filter((p) => p.def.head);
      if (s.phase === 2) return cr.filter((p) => p.def.minion);
      return ['face', ...cr.filter((p) => !p.def.erebos)];
    default: return cr;
  }
}
const faceName = () => (B.s.floor.id === 'pvp' ? `${B.s.floor.name}（ライフ ${B.s.E.life}）` : null) || ({ horde: 'たいぐん（やまふだを けずる）', erebos: 'エレボス（ライフを へらす）', factory: `ゴーレム工場（かぎ ${B.s.E.key}：ちょうど 同じ数で こわれる）` })[B.s.floor.id] || 'てき';

// ---- 対象を えらぶ ----
function faceAvailable() {
  const s = B.s;
  return { horde: s.E.lib.length > 0, erebos: s.phase === 3, factory: true, pvp: true }[s.floor.id] || false;
}
function cands(spec, ctx = {}) {
  const s = B.s;
  let list = [];
  if (spec.side === 'atk') list = (ctx.attackers || []).filter((p) => onBf(s, p));
  else if (spec.side === 'mine') list = s.P.bf.filter((p) => isCreature(p) && (B.mode !== 'tricks' || p.attacking));
  else for (const sd of spec.side === 'any' ? ['P', 'E'] : [spec.side]) list.push(...s[sd].bf.filter((p) => (spec.perm ? !p.def.factory : isCreature(p)) && p !== ctx.src));
  list = list.filter((p) => !(s.floor.untargetable?.(s, p, api)) && (!spec.filter || spec.filter(s, api, p)));
  if (spec.face && faceAvailable()) list.unshift('face');
  return list;
}
const targetLabel = (t) => {
  if (t === 'face') return esc(faceName());
  const s = B.s;
  return `${t.side === 'E' ? 'てき：' : ''}${(nm(t))}${isCreature(t) ? `（${power(s, t)}/${pt(s, t)[1] - t.dmg}）` : ''}`;
};
// tgt の並びを 順に えらぶ。やめたら null
async function pickAll(tgt, ctx = {}) {
  const picks = [];
  for (const spec of tgt) {
    const list = cands(spec, ctx);
    const min = spec.min ?? 1, max = Math.min(spec.max ?? 1, list.length);
    if (list.length < min) return null;
    if (!list.length) { picks.push([]); continue; }
    render();
    let chosen = await pickMany(esc(spec.label), list.map((t) => ({ label: targetLabel(t), value: t })), { min, max: Math.max(max, 1), note: ctx.note });
    if (!chosen) return null;
    if (spec.divide && !chosen.length) { picks.push([]); continue; }
    if (spec.divide) {
      const n = spec.divide === 'x' ? ctx.x : spec.divide;
      const k = chosen.length;
      chosen = k === 1 ? [{ t: chosen[0], n }] : await divideSheet(`${n}を わりふる`, n, chosen.map((t) => ({ label: targetLabel(t), value: t })));
    }
    picks.push(chosen);
  }
  return picks;
}
const needsTargets = (tgt, ctx) => tgt.every((spec) => cands(spec, ctx).length >= (spec.min ?? 1));
const tName = (t) => (t === 'face' ? faceName() : nmText(t));

// ---- モードを えらぶ 呪文（ボロスの 魔除け など）。増呪は いくつでも えらべて、2つめから 1つにつき マナが ふえる ----
// { run, extra }。やめたら null
const modeOk = (m, ctx) => !m.tgt || needsTargets(m.tgt, ctx);
const manaNote = () => `（いま つかえる マナ ${manaCount(B.s)}）`;
async function chooseMode(d, ctx = {}) {
  for (;;) {
    render();
    const ok = d.modes.filter((m) => modeOk(m, ctx));
    let ms;
    if (d.escalate) {
      ms = await pickMany(`${ruby(info(d).name)}：モードを えらぶ`, ok.map((m) => ({ label: esc(m.label), value: m })), {
        min: 1, max: ok.length, note: `ぞうじゅ：2つめから 1つ ふえるごとに ＋${d.escalate}マナ${manaNote()}`,
      });
    } else {
      const m = await sheet('<p>つぎの うち 1つを えらぶ。</p>', [
        ...d.modes.map((m) => ({ label: m.label, value: m, kind: 'primary', disabled: !modeOk(m, ctx), note: modeOk(m, ctx) ? '' : 'ねらえる 相手が いない' })),
        { label: 'やめる', value: null },
      ], { title: ruby(info(d).name) });
      ms = m && [m];
    }
    if (!ms) return null;
    const all = [];
    for (const m of ms) { const picks = m.tgt ? await pickAll(m.tgt, ctx) : []; if (!picks) break; all.push([m, picks]); }
    if (all.length < ms.length) continue;
    return { run: () => { for (const [m, picks] of all) m.apply(B.s, api, picks); }, extra: (d.escalate || 0) * (ms.length - 1) };
  }
}

// マナが たりるか。たりなければ しらせて null（コストの けいさんは 子どもが する）
async function payable(cost, req, o) {
  const pl = plan(B.s, cost, req, o);
  if (!pl) await sheet(`<p>マナが たりない！ ${manaNote()}</p>`, [{ label: 'もどる', value: 0 }], { title: 'マナが たりない' });
  return pl;
}

// ---- 呪文を唱えられるか ----
function castInfo(c, from = 'hand') {
  const s = B.s, d = c.def;
  const cost = from === 'gy' ? d.flashback.cost : from === 'escape' ? d.escape.cost : d.cost;
  const req = from === 'gy' ? d.flashback.req : from === 'escape' ? d.escape.req || colorsOf(d) : colorsOf(d);
  const o = { convoke: d.kw?.includes('convoke'), req2: d.req2 };
  const perm = !isSpell(d);
  const mul = d.xMul || 1;
  if (from === 'escape' && s.P.gy.length - 1 < d.escape.exile) return { why: `ぼちに ほかの カードが ${d.escape.exile}まい いる（いま ${s.P.gy.length - 1}まい）` };
  if (d.discardCost && from === 'hand' && s.P.hand.length - 1 < d.discardCost) return { why: `ほかに すてる てふだが ${d.discardCost}まい いる` };
  if (d.counter) return { why: 'てきが じゅもんを となえたときに 使う' };
  if (from === 'hand' && d.suspend && !plan(s, cost, req, o) && s.active === 'P' && B.mode === 'main') return { why: 'マナが たりない（たいきなら 使える かも）' };
  if (d.react && !d.play) return { why: 'てきが こうげきしてきたときに 使う' };
  if (!perm && !d.play && (d.trick || d.bloodrush)) return { why: 'こうげきの とちゅう（ブロックの あと）に 使う' };
  if (s.active !== 'P' || !['main'].includes(B.mode)) return { why: 'いまは 使えない' };
  let x = 0;
  if (d.x) {
    while (plan(s, cost + (x + 1) * mul, req, o)) x++;
    if (x < 1) return { why: 'マナが たりない' };
  }
  const pl = plan(s, cost + x * mul, req, o);
  if (!pl) return { why: colorsOf(d).length && plan(s, cost + x * mul, [], o) ? `${colorsOf(d).map((k) => ({ W: '白', U: '青', G: '緑', R: '赤' })[k]).join('か')}の マナが いる` : 'マナが たりない' };
  if (perm) {
    if (d.need && !d.need(s, api)) return { why: 'いまは 出しても こうかが ない' };
    return { ok: true, pl, x };
  }
  if (d.tgt && d.apply) return needsTargets(d.tgt, {}) ? { ok: true, pl, x } : { why: 'ねらえる 相手が いない' };
  if (d.modes) return d.modes.some((m) => modeOk(m, {})) ? { ok: true, pl, x } : { why: 'いまは こうかが ない' };
  const ctx = { phase: B.phase, c, xMax: x, human: true };
  const r = d.play(s, api, ctx) || d.play(s, api, { ...ctx, phase: 3 - B.phase });
  if (!r) return { why: 'いまは こうかが ない（ねらう 相手が いない など）' };
  if (d.x && r.x) x = Math.min(r.x, x);
  return { ok: true, pl: plan(s, cost + x * mul, req, o), r, x };
}

async function doCast(c, from = 'hand') {
  const s = B.s, d = c.def;
  const ci = castInfo(c, from);
  if (!ci.ok) return;
  B.busy = true;
  const stop = () => { B.busy = false; render(); };
  const base = from === 'gy' ? d.flashback.cost : from === 'escape' ? d.escape.cost : d.cost;
  const req = from === 'gy' ? d.flashback.req : from === 'escape' ? d.escape.req || colorsOf(d) : colorsOf(d);
  const o = { convoke: d.kw?.includes('convoke'), req2: d.req2 };
  const mul = d.xMul || 1;
  // X：いくつに するかは 自分で きめる
  let x = ci.x;
  if (d.x) { x = await numberSheet(`${ruby(info(d).name)}：X を きめる`, { min: 1, max: ci.x, value: 1, note: `コストは ${mul > 1 ? `X × ${mul}` : 'X'} ＋ ${base}${manaNote()}` }); if (x == null) return stop(); }
  // 脱出：墓地の ほかの カードを 追放する（古い ものから）
  if (from === 'escape') {
    const v = await sheet(`<p>ぼちの ほかの カード ${d.escape.exile}まいを ついほうして、${base}マナで となえる。ぼちは ${s.P.gy.length}まい − ${d.escape.exile + 1}まい ＝ のこり ${s.P.gy.length - d.escape.exile - 1}まい に なる。</p>`, [{ label: 'だっしゅつで となえる', value: 1, kind: 'primary' }, { label: 'やめる', value: 0 }], { title: 'だっしゅつ' });
    if (!v) return stop();
  }
  // 追加で 手札を 捨てる（稲妻の 斧）
  let drop = [];
  if (d.discardCost && from === 'hand') {
    drop = await pickMany(`すてる カードを ${d.discardCost}まい えらぶ`, s.P.hand.filter((h) => h !== c).map((h) => ({ label: ruby(info(h.def).name), value: h })), { min: d.discardCost, max: d.discardCost });
    if (!drop) return stop();
  }
  // キッカー：マナを 多く はらうと 強く なる
  let kicked = false;
  if (d.kicker && plan(s, base + d.kicker, req, o)) {
    const v = await sheet(detail(d), [{ label: `ふつうに 使う（${base}マナ）`, value: 'n', kind: 'primary' }, { label: `キッカーで 使う（${base}マナ ＋ ${d.kicker}マナ）`, value: 'k', kind: 'primary' }, { label: 'やめる', value: null }], { title: `キッカー${manaNote()}` });
    if (!v) return stop();
    kicked = v === 'k';
  }
  let picks, mode, extra = kicked ? d.kicker : 0;
  if (d.modes) { if (!(mode = await chooseMode(d))) return stop(); extra += mode.extra; }
  if (d.tgt) {
    if (needsTargets(d.tgt, {})) {
      picks = await pickAll(d.tgt, { x, note: d.strive ? `げきれい：2つめから 1つ ふえるごとに ＋${d.strive}マナ${manaNote()}` : '' });
      if (!picks) return stop();
      if (d.strive) extra += d.strive * (picks[0].length - 1);
    } else if (d.apply) return stop();
    else picks = d.tgt.map(() => []); // ねらえる相手が いない パーマネントは、出すだけ
  }
  const pl = (extra || x !== ci.x) ? await payable(base + x * mul + extra, req, o) : plan(s, base + x * mul, req, o);
  if (!pl) return stop();
  discard(s, drop);
  const run = mode ? mode.run : (d.apply && picks ? () => d.apply(s, api, picks, x, { kicked }) : ci.r ? () => ci.r.run(x) : undefined);
  await castCard(s, c, pl, { from, x: d.x ? x : undefined, ctr: d.x ? x : 0, run, chosen: picks || undefined });
  B.busy = false;
  if (!checkOver()) render();
}

// ---- タップしたとき ----
async function onClick(e) {
  if (B.swiped) { B.swiped = false; return; } // スワイプの おわりの タップは むし
  const b = e.target.closest('[data-act],[data-uid],[data-hand]');
  if (!b || (B.busy && B.mode !== 'block') || document.getElementById('sheet').hidden === false) return;
  const s = B.s;
  const t = B.tut;
  if (b.dataset.act) return t && !t.allowAct(b.dataset.act) ? toast(t.hint()) : action(b.dataset.act);
  if (b.dataset.hand != null) { const c = s.P.hand[+b.dataset.hand]; return t && !t.allowHand(c) ? toast(t.hint()) : tapHand(c); }
  const uid = +b.dataset.uid;
  const p = [...s.P.bf, ...s.E.bf].find((q) => q.uid === uid);
  if (p) return t && !t.allowPerm(p) ? toast(t.hint()) : tapPerm_(p);
}

// たたかいの とちゅうで メニューへ もどる（o.quit：{ label, note, go }。冒険は つづきが のこる、オンラインは こうさん）
async function menu() {
  const q = B.quit || { label: 'タイトルへ もどる', note: '', go: () => {} };
  const v = await sheet(`<p>${esc(q.note || 'たたかいを やめて もどる？')}</p>`,
    [{ label: 'たたかいを つづける', value: 0, kind: 'primary' }, { label: q.label, value: 1 }], { title: 'メニュー' });
  if (!v) return;
  B.left = true;
  q.go();
}

async function action(a) {
  const s = B.s;
  if (a === 'end') return endTurn();
  if (a === 'tutnext') { B.tut?.next(); return render(); }
  if (a === 'menu') return menu();
  if (a === 'attack') {
    combatStart(s); B.combatDone = true;
    if (checkOver()) return;
    B.mode = 'attack'; B.sel = new Map();
    for (const p of readyAttackers(s)) if (p.def.mustAttack) { const t = attackTargets()[0]; if (t) B.sel.set(p.uid, t); }
    return render();
  }
  if (a === 'auto') {
    const plan_ = s.floor.assign(s, readyAttackers(s), api);
    B.sel = new Map(plan_.filter((x) => x.t).map((x) => [x.p.uid, x.t]));
    return render();
  }
  if (a === 'cancel') { B.mode = 'main'; B.phase = 2; return render(); }
  if (a === 'declare') {
    const atk = [...B.sel].map(([uid, t]) => ({ p: s.P.bf.find((q) => q.uid === uid), t })).filter((x) => x.p);
    if (!atk.length) { B.mode = 'main'; B.phase = 2; return render(); }
    B.atk = atk;
    B.blocks = declareAttack(s, atk);
    B.mode = 'tricks';
    return render();
  }
  if (a === 'damage') {
    B.busy = true;
    finishCombat(s, B.atk, B.blocks);
    B.mode = 'main'; B.phase = 2; B.atk = [];
    render();
    await combatResult(s); // かった 攻撃も、けっかを 見せてから
    B.busy = false;
    if (!checkOver()) render();
    return;
  }
  if (a === 'blockdone') {
    const done = B.blockDone; B.blockDone = null; B.mode = 'enemy';
    render();
    return done(new Map(B.blockMap));
  }
  if (a === 'blockauto') { B.blockMap = AI.blocks(s, B.blockAttackers); return render(); }
  if (a === 'gy') return showGy();
  if (a === 'lib') return sheet(`<p>やまふだは のこり <b>${s.P.lib.length}まい</b>。ターンの はじめに、てふだが 5まいに なるまで ここから 引く。</p><p>なくなったら ぼちを まぜて もどす。そのとき ライフが へる（つぎは −${reshuffleCost(s.P, true)}。1回ごとに 2・4・6…）。</p>`, [{ label: 'とじる', value: 0 }], { title: 'やまふだ' });
  if (a === 'elib') return sheet(`<p>${esc(s.floor.id === 'pvp' ? 'あいて' : 'てき')}の やまふだは のこり <b>${s.E.lib.length}まい</b>。${s.floor.id === 'horde' ? 'たいぐんは やまふだが ライフの かわり。0まいに して、クリーチャーも いなくなれば かち。' : ''}</p>`, [{ label: 'とじる', value: 0 }], { title: 'てきの やまふだ' });
  if (a === 'egy') return sheet(`<div class="mini-list">${s.E.gy.map((c) => cardFace(c.def, { enemy: s.floor.id !== 'pvp' })).join('') || '<p>ぼちは からっぽ</p>'}</div>`, [{ label: 'とじる', value: 0 }], { title: `てきの ぼち（${s.E.gy.length}まい）` });
  if (a === 'mana') return sheet(`<div class="mana-list">${s.P.mana.map((m) => `<span class="mchip ${colorsOf(m.def)[0] ? `m-${colorsOf(m.def).join('')}` : 'm-C'} ${m.tapped ? 'used' : ''}">${ruby(info(m.def).name)}</span>`).join('')}</div>`, [{ label: 'とじる', value: 0 }], { title: `マナゾーン（${s.P.mana.filter((m) => !m.tapped).length}/${s.P.mana.length} 使える）` });
  if (a === 'log') return sheet(`<ol class="elog">${s.logs.slice(-40).map((l) => `<li>${ruby(l)}</li>`).join('')}</ol>`, [{ label: 'とじる', value: 0 }], { title: 'これまでの できごと' });
}

// 攻撃の けっか：あいてごとに「3 ＋ 2 ＝ 5点」。ちょうど 倒したら ぴったり！
function combatResult(s) {
  const by = new Map();
  for (const e of s.lastCombat) {
    const k = e.t === 'face' ? 'face' : e.t.uid;
    if (!by.has(k)) by.set(k, { t: e.t, ns: [] });
    by.get(k).ns.push(e.n);
  }
  if (!by.size) return;
  const rows = [...by.values()].map(({ t, ns }) => {
    const name = t === 'face' ? faceName() : `てき：${nmText(t)}`;
    const sum = ns.reduce((a, b) => a + b, 0);
    const tough = t !== 'face' && !onBf(s, t) && t.diedT ? `（タフネス ${t.diedT}）` : '';
    const res = t === 'face' ? '' : t.exact ? `<b class="exact">ぴったり！</b>${tough}` : !onBf(s, t) ? `<b>たおした</b>${tough}` : isCreature(t) ? `のこり ${pt(s, t)[1] - t.dmg}` : '';
    return `<li><span>${ruby(name)}</span><span class="eq">${ns.length > 1 ? `${ns.join(' ＋ ')} ＝ ` : ''}${sum}点</span>${res}</li>`;
  });
  return sheet(`<ul class="cres">${rows.join('')}</ul>`, [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: 'こうげきの けっか' });
}

async function tapHand(c) {
  const s = B.s, d = c.def;
  const choices = [];
  if (B.mode === 'main') {
    const ci = castInfo(c);
    choices.push({ label: d.types.includes('creature') ? 'せんじょうに 出す' : '使う', value: 'cast', kind: 'primary', disabled: !ci.ok, note: ci.ok ? '' : ci.why });
    if (d.suspend && s.active === 'P') { const ok = !!plan(s, d.suspend.cost, d.suspend.req || []); choices.push({ label: `たいきする（${d.suspend.cost}マナ・${d.suspend.turns}ターン あとに ただで 使う）`, value: 'suspend', kind: 'primary', disabled: !ok, note: ok ? '' : 'マナが たりない' }); }
    if (!s.P.flags.charged) choices.push({ label: 'マナゾーンに おく', value: 'charge', note: '1ターンに 1まいまで' });
  }
  if (B.mode === 'tricks') {
    const tr = d.trick || (d.bloodrush ? { kind: 'single' } : null);
    if (tr || d.modes) {
      const cost = d.bloodrush ? d.bloodrush.cost : d.cost, req = d.bloodrush ? d.bloodrush.req : colorsOf(d);
      const pl = plan(s, cost, req, { convoke: d.kw?.includes('convoke') });
      choices.push({ label: d.bloodrush ? 'ゆうけつで 使う' : '使う', value: 'trick', kind: 'primary', disabled: !pl, note: pl ? '' : 'マナが たりない' });
    }
  }
  choices.push({ label: 'とじる', value: null });
  const v = await sheet(detail(d), B.tut ? B.tut.filterChoices(c, choices) : choices);
  if (v === 'cast') return doCast(c);
  if (v === 'charge') { api.charge(s, c); s.P.flags.charged = true; return render(); }
  if (v === 'suspend') { const pl = plan(s, d.suspend.cost, d.suspend.req || []); if (pl) suspendCard(s, c, pl); return render(); }
  if (v === 'trick') return useTrick(c);
}

async function useTrick(c) {
  const s = B.s, d = c.def;
  const tr = d.trick || { kind: 'single' };
  const cost = d.bloodrush ? d.bloodrush.cost : d.cost, req = d.bloodrush ? d.bloodrush.req : colorsOf(d);
  let target = null, mode = null;
  if (d.modes) { if (!(mode = await chooseMode(d))) return; }
  else if (tr.kind !== 'mass') {
    const live = B.atk.filter((a) => onBf(s, a.p));
    target = await sheet('<p>どの クリーチャーに 使う？</p>', [...live.map((a) => ({ label: `${(nm(a.p))}（${power(s, a.p)}/${pt(s, a.p)[1]}）`, value: a.p })), { label: 'やめる', value: null }]);
    if (!target) return;
  }
  const pl = await payable(cost + (mode?.extra || 0), req, { convoke: d.kw?.includes('convoke') });
  if (!pl) return;
  B.busy = true;
  const run = mode ? mode.run : (target ? () => { api.target(s, target); d.singleRun(s, api, target); } : () => d.massRun(s, api));
  if (d.bloodrush) { s.P.hand.splice(s.P.hand.indexOf(c), 1); s.P.gy.push(c); pay(s, pl); run(); }
  else castCard(s, c, pl, { run });
  B.busy = false;
  render();
}

async function tapPerm_(p) {
  const s = B.s;
  if (B.mode === 'attack' && p.side === 'P') {
    if (!readyAttackers(s).includes(p)) return sheet(detail(p.def), [{ label: 'このターンは こうげきできない', value: 0 }]);
    if (B.sel.has(p.uid) && !p.def.mustAttack) { B.sel.delete(p.uid); return render(); }
    const ts = attackTargets();
    if (!ts.length) return sheet('<p>こうげきできる 相手が いない。</p>', [{ label: 'とじる', value: 0 }]);
    const t = ts.length === 1 ? ts[0] : await sheet(`<p>${(nm(p))}（パワー ${power(s, p)}）で どこを こうげきする？</p>`, [
      ...ts.map((t) => ({ label: t === 'face' ? faceName() : `${(nm(t))}${isCreature(t) ? `（のこり ${pt(s, t)[1] - t.dmg}）` : t.def.factory ? `（かぎ ${s.E.key}）` : ''}`, value: t })),
      { label: 'やめる', value: null },
    ]);
    if (t) B.sel.set(p.uid, t);
    return render();
  }
  if (B.mode === 'block' && p.side === 'P') {
    if (!isCreature(p) || p.tapped) return;
    for (const [k, v] of B.blockMap) if (v === p) { B.blockMap.delete(k); return render(); }
    const ok = B.blockAttackers.filter((a) => onBf(s, a) && canBlock(s, p, a) && !B.blockMap.has(a.uid));
    if (!ok.length) return sheet('<p>この クリーチャーで ブロックできる てきが いない（ひこうは ひこうか とうたつで しか ブロックできない）。</p>', [{ label: 'とじる', value: 0 }]);
    const a = await sheet(`<p>${(nm(p))}（${power(s, p)}/${pt(s, p)[1] - p.dmg}）で どれを ブロックする？</p>`, [
      ...ok.map((a) => ({ label: `${(nm(a))}（${power(s, a)}/${pt(s, a)[1] - a.dmg}）`, value: a })), { label: 'やめる', value: null },
    ]);
    if (a) B.blockMap.set(a.uid, p);
    return render();
  }
  // 説明と、起動型能力
  const choices = [];
  if (p.side === 'P' && B.mode === 'main' && s.active === 'P') {
    for (const a of p.def.acts || []) {
      if (a.pumpP) continue;
      const cost = typeof a.cost === 'function' ? a.cost(s, p, api) : a.cost;
      const o = { exclude: a.tap || a.sac ? p : null };
      let x = 0; if (a.x) while (plan(s, cost + x + 1, a.req || [], o)) x++;
      const blocked = (a.tap && (p.tapped || (isCreature(p) && p.sick))) ? 'タップできない' : (a.monstrosity && p.monstrous) ? 'もう かいぶつ' : (a.discard && s.P.hand.length < a.discard) ? `てふだが たりない（${a.discard}まい いる）` : (a.levelUp && p.level >= p.def.levelMax) ? 'もう いちばん上の レベル' : (!plan(s, cost + x, a.req || [], o) || (a.x && x < 1)) ? 'マナが たりない' : '';
      const r = blocked ? null : a.levelUp ? { run: () => {} } : a.tgt ? (needsTargets(a.tgt, { src: p }) ? { tgt: true } : null) : a.play(s, p, api, { phase: B.phase, xMax: x });
      const label = a.levelUp ? `Lvアップ（${cost}マナ）いま レベル ${p.level}` : `${a.label || (a.adapt ? `てきおう ${a.adapt}` : 'のうりょくを 使う')}（${a.x ? `X+${cost}` : cost}マナ${a.discard ? `・てふだを ${a.discard}まい すてる` : ''}${a.tap ? '・タップ' : ''}）`;
      choices.push({ label, value: { a, cost, o, x: a.x ? (a.tgt ? x : Math.min(r?.x ?? x, x)) : 0, r }, kind: 'primary', disabled: !!blocked || !r, note: blocked || (r ? '' : 'いまは こうかが ない') });
    }
    if (p.def.equip) choices.push({ label: `そうびする（${p.def.equip}マナ）`, value: 'equip', kind: 'primary', disabled: !plan(s, p.def.equip, []) });
  }
  if (p.side === 'P' && B.mode === 'tricks') for (const a of p.def.acts || []) if (a.pumpP) choices.push({ label: `パワー ＋${a.pumpP}（${a.cost}マナ・赤）`, value: { a, pump: true }, kind: 'primary', disabled: !plan(s, a.cost, a.req || []) || !p.attacking });
  choices.push({ label: 'とじる', value: null });
  const v = await sheet(detail(p.def, { enemy: p.side === 'E' }), choices);
  if (!v) return;
  if (v === 'equip') {
    const t = await sheet('<p>どの クリーチャーに そうびする？</p>', [...s.P.bf.filter(isCreature).map((q) => ({ label: (nm(q)), value: q })), { label: 'やめる', value: null }]);
    if (!t) return;
    pay(s, plan(s, p.def.equip, [])); p.attached = t.uid; return render();
  }
  if (v.pump) { pay(s, plan(s, v.a.cost, v.a.req || [])); api.pump(p, v.a.pumpP, 0); return render(); }
  let picks;
  if (v.a.tgt) { picks = await pickAll(v.a.tgt, { src: p, x: v.x }); if (!picks) return render(); }
  let drop = [];
  if (v.a.discard) {
    drop = await pickMany(`すてる カードを ${v.a.discard}まい えらぶ`, s.P.hand.map((c) => ({ label: ruby(info(c.def).name), value: c })), { min: v.a.discard, max: v.a.discard, note: `てふだ ${s.P.hand.length}まい − ${v.a.discard}まい ＝ のこり ${s.P.hand.length - v.a.discard}まい` });
    if (!drop) return render();
  }
  const pl = plan(s, v.cost + v.x, v.a.req || [], v.o); if (!pl) return;
  pay(s, pl);
  if (v.a.tap) tapPerm(s, p);
  discard(s, drop);
  if (v.a.monstrosity) p.monstrous = true;
  if (v.a.levelUp) levelUp(s, p);
  if (picks) v.a.apply(s, api, picks, v.x, p); else v.r.run(v.x);
  sba(s);
  if (!checkOver()) render();
}

async function showGy() {
  const s = B.s;
  const choices = [];
  for (const c of s.P.gy) if (c.def.flashback && B.mode === 'main') {
    const ci = castInfo(c, 'gy');
    choices.push({ label: `${ruby(info(c.def).name)} を フラッシュバック`, value: { c, from: 'gy' }, kind: 'primary', disabled: !ci.ok, note: ci.ok ? '' : ci.why });
  }
  const seen = new Set();
  for (const c of s.P.gy) if (c.def.escape && B.mode === 'main' && !seen.has(c.def.id)) {
    seen.add(c.def.id);
    const ci = castInfo(c, 'escape');
    choices.push({ label: `${ruby(info(c.def).name)} を だっしゅつで となえる（${c.def.escape.cost}マナ・ほかの ぼち ${c.def.escape.exile}まい）`, value: { c, from: 'escape' }, kind: 'primary', disabled: !ci.ok, note: ci.ok ? '' : ci.why });
  }
  choices.push({ label: 'とじる', value: null });
  const v = await sheet(`<div class="mini-list">${s.P.gy.map((c) => cardFace(c.def)).join('') || '<p>ぼちは からっぽ</p>'}</div>`, choices, { title: `ぼち（${s.P.gy.length}まい）` });
  if (v) doCast(v.c, v.from);
}

// ---- スワイプ：自分の クリーチャーから 敵へ ひっぱると 攻撃先・ブロックを きめる ----
// 本体（大群の山札・エレボスのライフ）を ねらえる 階は、敵の 戦場に「本体」の 札を 出す
const attackFace = () => ['horde', 'erebos', 'pvp'].includes(B.s.floor.id) && attackTargets().includes('face');
function canDrag(p) {
  const s = B.s;
  if (!isCreature(p) || (B.tut && !B.tut.allowDrag(p))) return false;
  if (B.mode === 'block') return !p.tapped;
  if (B.mode === 'attack' || (B.mode === 'main' && B.phase === 1 && !B.combatDone && s.active === 'P')) return readyAttackers(s).includes(p);
  return false;
}
function dropAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (el.closest('[data-face]')) return 'face';
  const pe = el.closest('.perm[data-uid]');
  if (pe) return B.s.E.bf.find((q) => q.uid === +pe.dataset.uid) || null;
  return null;
}
function validDrop(p, t) {
  const s = B.s;
  if (!t) return false;
  if (B.mode === 'block') return t !== 'face' && B.blockAttackers.includes(t) && canBlock(s, p, t) && (!B.blockMap.has(t.uid) || B.blockMap.get(t.uid) === p);
  return attackTargets().includes(t);
}
let drag = null;
function arrow(x0, y0, x1, y1, ok) {
  let svg = document.getElementById('arrow');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'arrow';
    svg.innerHTML = '<defs><marker id="ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs><line marker-end="url(#ah)"/>';
    document.body.append(svg);
  }
  svg.style.display = 'block'; // SVG は hidden が きかない
  const l = svg.querySelector('line');
  l.setAttribute('x1', x0); l.setAttribute('y1', y0); l.setAttribute('x2', x1); l.setAttribute('y2', y1);
  svg.classList.toggle('ok', ok); svg.classList.toggle('block', B.mode === 'block');
}
function clearDrag() {
  const svg = document.getElementById('arrow'); if (svg) svg.style.display = 'none';
  document.querySelectorAll('.drop-ok').forEach((x) => x.classList.remove('drop-ok'));
}
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 1600);
}
let swipeReady = false;
function initSwipe() {
  if (swipeReady) return;
  swipeReady = true;
  document.addEventListener('pointerdown', (e) => {
    if (!B || !document.getElementById('sheet').hidden || (B.busy && B.mode !== 'block')) return;
    const el = e.target.closest?.('.zone.mine .perm[data-uid]'); if (!el) return;
    const p = B.s.P.bf.find((q) => q.uid === +el.dataset.uid);
    if (p && canDrag(p)) drag = { p, id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 14) return;
    drag.moved = true;
    const t = dropAt(e.clientX, e.clientY);
    const ok = validDrop(drag.p, t);
    document.querySelectorAll('.drop-ok').forEach((x) => x.classList.remove('drop-ok'));
    if (ok) document.querySelector(t === 'face' ? '[data-face]' : `.zone.enemy [data-uid="${t.uid}"]`)?.classList.add('drop-ok');
    arrow(drag.x0, drag.y0, e.clientX, e.clientY, ok);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null; clearDrag();
    if (!d.moved || e.type === 'pointercancel') return;
    B.swiped = true; setTimeout(() => { B.swiped = false; }, 400);
    const t = dropAt(e.clientX, e.clientY);
    if (!validDrop(d.p, t)) { if (t || dropAt(e.clientX, e.clientY) === null) toast(B.mode === 'block' ? 'その てきは ブロック できない' : 'そこは こうげき できない'); return; }
    if (B.mode === 'block') {
      for (const [k, v] of B.blockMap) if (v === d.p) B.blockMap.delete(k);
      B.blockMap.set(t.uid, d.p);
      return render();
    }
    if (B.mode === 'main') { // 攻撃モードに 入る
      combatStart(B.s); B.combatDone = true;
      if (checkOver()) return;
      B.mode = 'attack'; B.sel = new Map();
      for (const q of readyAttackers(B.s)) if (q.def.mustAttack) { const f = attackTargets()[0]; if (f) B.sel.set(q.uid, f); }
      if (!onBf(B.s, d.p) || !validDrop(d.p, t)) return render();
    }
    B.sel.set(d.p.uid, t);
    render();
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
}

// ---- 描く ----
function enemyStatus() {
  const s = B.s, cr = s.E.bf.filter(isCreature);
  const lib = ''; // てきの やまふだの 数は、右の カードの 山に 出る
  switch (s.floor.id) {
    case 'hydra': return `<span class="chip hot">頭 ${cr.filter((p) => p.def.head).length}本</span>${lib}`;
    case 'horde': return `<span class="chip hot">たいぐんの やまふだ のこり ${s.E.lib.length}まい</span>`;
    case 'factory': return `<span class="chip hot">工場の かぎ ${s.E.key}</span>${lib}`;
    case 'slime': return `<span class="chip hot">スライム ${cr.filter((p) => p.def.slime).length}体</span>${lib}`;
    case 'xenagos': return `<span class="chip hot">かんらくしゃ ${cr.filter((p) => p.def.reveler).length}体</span>${lib}`;
    case 'tutorial': return '';
    case 'pvp': return `<span class="chip hot">あいての ライフ ${s.E.life}</span><span class="chip">てふだ ${s.E.hand.length}</span><span class="chip">マナ ${s.E.mana.length}</span>${lib}`;
    case 'erebos': return `<span class="chip">だんかい ${s.phase}/3</span>${s.phase === 3 ? `<span class="chip hot">エレボスの ライフ ${s.E.life}</span>` : ''}${lib}`;
    default: return lib;
  }
}

// ---- 敵の つぎの ターン ----
function willAttack(p) {
  const s = B.s;
  if (s.floor.id === 'tutorial') return !!p.def.straw && (s.E.flags.n || 0) >= 1;
  if (s.floor.id === 'pvp') return false;
  if (!isCreature(p) || p.def.head) return false;
  if (s.floor.id === 'slime' && !s.E.flags.started) return false;
  if (s.floor.id === 'erebos' && s.phase === 3 && p.def.erebos) return !s.E.flags.erebosRest;
  return !!(p.def.attacks || p.flags.mustAttack);
}
function intent() {
  const s = B.s, cr = s.E.bf.filter(isCreature);
  const out = [];
  if (s.floor.id === 'pvp') {
    const can = cr.filter((p) => !hasKw(s, p, 'defender') && !p.def.cantAttack && power(s, p) > 0);
    if (can.length) out.push(`こうげきして くる かも（パワー ${can.map((p) => power(s, p)).join('・')}）`);
    const n = nyxLoss(s.stats.playerTurns + 1), m = nyxLoss(s.foeStats.playerTurns + 1);
    if (n || m) out.push(`ニクスの あらし：つぎの ターン じぶん −${n}・あいて −${m}`);
    return out.length ? out : ['まだ こうげきできる クリーチャーが いない'];
  }
  const heads = cr.filter((p) => p.def.head);
  if (heads.length) {
    const live = heads.filter((p) => !p.frozen);
    if (live.length) out.push(`頭が ダメージ（${live.map((p) => p.def.headDmg).join('・')}）${live.length < heads.length ? '（こおった頭は なし）' : ''}`);
  }
  if (s.floor.id === 'erebos' && s.phase === 3) out.push(`はじめに ライフ −${{ easy: 2, normal: 2, hard: 3 }[s.diff]}`);
  if (s.floor.id === 'factory' && !s.E.flags.inspect && s.E.bf.filter((p) => p.def.golem).length < 2) out.push('ゴーレムを 1体 作る');
  const atk = cr.filter(willAttack).filter((p) => !p.frozen);
  if (atk.length) out.push(`${atk.length}体で こうげき（パワー ${atk.map((p) => Math.max(0, power(s, p))).join('・')}）`);
  if (s.floor.id === 'slime' && !s.E.flags.started) out.push('さいしょの ターンは こうげきしない');
  if (s.floor.id === 'xenagos') out.push('ゼナゴスは ふえふききが 出たときだけ こうげき');
  const n = { horde: { easy: 1, normal: 1, hard: 2 }, xenagos: 1 }[s.floor.id];
  const reveal = s.floor.id === 'horde' ? n[s.diff] + s.E.bf.filter((p) => p.def.altar).length : s.floor.id === 'erebos' && s.phase > 1 ? (s.diff === 'easy' ? 1 : 2) : 1;
  if (s.E.lib.length) out.push(`やまふだを ${Math.min(reveal, s.E.lib.length)}まい めくって 使う`);
  if (s.E.extraTurns > 0) out.push(`まだ 来ない（あと ${s.E.extraTurns}ターン）`);
  return out.length ? out : ['なにも しない'];
}
function revealNote(d) {
  if (d.types.includes('creature')) return 'このクリーチャーが てきの せんじょうに 出る。';
  if (d.types.includes('sorcery')) return 'このじゅもんの こうかが すぐに 起きる。';
  return 'このカードが てきの せんじょうに 出る。';
}

function banner() {
  switch (B.mode) {
    case 'attack': return 'こうげきする クリーチャーを てきへ ひっぱる（タップでも えらべる）';
    case 'tricks': return B.blocks.size ? 'ブロックされた！ 強化の じゅもんを 使うなら いま' : 'ブロックされなかった。強化の じゅもんを 使うなら いま';
    case 'block': return 'てきの こうげき！ 自分の クリーチャーを こうげきしてくる てきへ ひっぱって ブロック';
    case 'enemy': return B.s.floor.id === 'pvp' ? 'あいての ターン…' : 'てきの ターン…';
    default: return B.phase === 1 ? (B.combatDone ? 'カードを 使うか、マナゾーンに おこう' : 'カードを 使おう。クリーチャーを てきへ ひっぱると こうげき') : 'こうげきは おわり。カードを 使って、ターンを おわろう';
  }
}

function permLabel(p) {
  const s = B.s;
  if (B.mode === 'attack' && B.sel.has(p.uid)) return `→ ${tName(B.sel.get(p.uid))}`;
  if (B.mode === 'main' && p.side === 'E' && willAttack(p) && !p.frozen) return '!つぎに こうげき';
  if (B.mode === 'tricks') {
    const a = B.atk.find((x) => x.p === p);
    if (a) { const bl = B.blocks.get(p.uid); return bl ? `ブロック：${nmText(bl)}` : `→ ${tName(a.t)}`; }
    for (const [k, v] of B.blocks) if (v === p) return 'ブロック中';
  }
  if (B.mode === 'block') {
    if (p.side === 'E' && B.blockAttackers.includes(p)) { const bl = B.blockMap.get(p.uid); return bl ? `← ${nmText(bl)}` : 'こうげき中'; }
    for (const [k, v] of B.blockMap) if (v === p) return 'ブロック';
  }
  return '';
}

// ---- 卓の 部品（デュエプレ・マスターデュエルの ように、やまふだ・ぼち・マナゾーンを カードの 山で 見せる）----
// 色の 帯（2色の カードは 左右で 2色）
const band = (d) => { const c = colorsOf(d); const a = c[0] || 'C'; return `b1-${a} b2-${c[1] || a}`; };
// やまふだ：カードの 裏の 山。のこりが 多いほど あつく 見える
function deckPile(side) {
  const s = B.s, n = s[side].lib.length;
  const th = n >= 15 ? 4 : n >= 8 ? 3 : n >= 3 ? 2 : n ? 1 : 0;
  const low = side === 'P' && n < LOW_LIBRARY;
  return `<button type="button" class="pile2 deck ${side === 'E' ? 'foe' : ''} ${low ? 'low' : ''}" data-act="${side === 'P' ? 'lib' : 'elib'}" aria-label="${side === 'P' ? '' : 'てきの '}やまふだ ${n}まい">
    <span class="cb th${th} ${n ? '' : 'none'}"><b>${n}</b></span>
    <small>${low ? `まぜると −${reshuffleCost(s.P, true)}` : 'やまふだ'}</small></button>`;
}
// ぼち：いちばん 上の カードが 見える 山
function gravePile(side) {
  const s = B.s, gy = s[side].gy, top = gy[gy.length - 1];
  const esc2 = side === 'P' && gy.some((c) => c.def.escape);
  return `<button type="button" class="pile2 grave ${side === 'E' ? 'foe' : ''}" data-act="${side === 'P' ? 'gy' : 'egy'}" aria-label="${side === 'P' ? '' : 'てきの '}ぼち ${gy.length}まい">
    <span class="gyc ${top ? (side === 'E' && s.floor.id !== 'pvp' ? 'b1-E b2-E' : band(top.def)) : 'none'} ${gy.length > 1 ? 'stack' : ''}">${top ? `<i>${ruby(info(top.def).name)}</i>` : ''}<b>${gy.length}</b></span>
    <small>${esc2 ? 'だっしゅつ' : 'ぼち'}</small></button>`;
}
// マナゾーン：小さい カードを ならべる（タップした ものは よこむき）
function manaZone() {
  const s = B.s, ms = s.P.mana, untapped = ms.filter((m) => !m.tapped).length;
  const tr = s.P.bf.filter((p) => p.def.treasure).length;
  return `<button type="button" class="manazone ${ms.length > 7 ? 'tight' : ''}" data-act="mana" aria-label="マナ ${untapped} / ${ms.length}">
    <span class="mz-cards">${ms.map((m) => `<i class="mz ${band(m.def)} ${m.tapped ? 't' : ''}"></i>`).join('') || '<em>マナゾーン</em>'}</span>
    <span class="mz-num"><b>${untapped}</b>/${ms.length}${tr ? `<small>＋たからもの ${tr}</small>` : ''}</span>
  </button>`;
}

function render() {
  if (B.left) return; // メニューへ もどった あと
  const s = B.s;
  if (!drag) clearDrag();
  B.tut?.update(s, B);
  const ready = B.mode === 'attack' ? readyAttackers(s) : [];
  const isNewPerm = (p) => B.prev?.perms && !B.prev.perms.has(p.uid);
  const perms = (side) => s[side].bf.map((p) => permFace(s, p, {
    label: permLabel(p),
    cls: [isNewPerm(p) ? 'enter' : '', B.mode === 'attack' && ready.includes(p) ? 'can' : '', B.sel.has(p.uid) && B.mode === 'attack' ? 'sel' : '', B.mode === 'block' && side === 'E' && B.blockAttackers.includes(p) ? 'attacking' : '', side === 'P' && canDrag(p) ? 'drag' : ''].join(' '),
  })).join('') || '<p class="empty">（なにも いない）</p>';
  const face = attackFace() ? `<div class="perm face-tile" data-face="1"><span>${esc(s.floor.id === 'pvp' ? s.floor.name : faceName())}</span><b>${s.floor.id === 'horde' ? `やまふだ ${s.E.lib.length}` : `ライフ ${s.E.life}`}</b></div>` : '';
  const last = s.logs.slice(-2).map((l) => l.replace(/^\[\d+[PE]\] /, ''));
  // まえに 描いた ときから ふえた カード・かわった ライフに 印を つけて うごかす
  const pv = B.prev || { perms: null, hand: null, life: s.P.life, elife: s.E.life, gy: s.P.gy.length };
  const isNew = (set, uid) => set && !set.has(uid);
  let btns = '';
  if (B.mode === 'main') btns = `${B.phase === 1 && !B.combatDone ? '<button type="button" class="btn primary" data-act="attack">こうげきする</button>' : ''}<button type="button" class="btn" data-act="end">ターン おわり</button>`;
  if (B.mode === 'attack') btns = `<button type="button" class="btn" data-act="cancel">こうげきしない</button><button type="button" class="btn" data-act="auto">おまかせ</button><button type="button" class="btn primary" data-act="declare">こうげき！（${B.sel.size}体）</button>`;
  if (B.mode === 'tricks') btns = '<button type="button" class="btn primary" data-act="damage">ダメージ！</button>';
  if (B.mode === 'block') btns = '<button type="button" class="btn" data-act="blockauto">おまかせ</button><button type="button" class="btn primary" data-act="blockdone">ブロック けってい</button>';
  if (B.mode === 'enemy') btns = `<span class="wait">${s.floor.id === 'pvp' ? 'あいて' : 'てき'}の ターン…</span>`;
  app().innerHTML = `<div class="battle">
    <header class="bt-head">
      <button type="button" class="menu-btn" data-act="menu" ${B.mode === 'enemy' ? 'disabled' : ''} aria-label="メニュー"><span aria-hidden="true">≡</span></button>
      <div class="bt-title"><span class="floor">${esc(B.floorName)}</span><span class="turn">ターン ${s.stats.playerTurns}${s.floor.id === 'pvp' ? `/${PVP_TURNS}` : ''}</span></div>
      <div class="chips">${enemyStatus()}</div>
    </header>
    <p class="intent">${B.mode === 'main' || B.mode === 'attack' ? `<b>${s.floor.id === 'pvp' ? 'あいての よてい' : 'つぎの てき'}</b>${intent().map((t) => `<span>${esc(t)}</span>`).join('')}` : ''}</p>
    <div class="erow">
      <section class="zone enemy" aria-label="てきの せんじょう">${face}${perms('E')}</section>
      <div class="piles foe">${deckPile('E')}${gravePile('E')}</div>
    </div>
    <button type="button" class="logline" data-act="log">${last.map((l) => `<span>${ruby(l)}</span>`).join('') || '<span>たたかい スタート！</span>'}</button>
    ${B.tut?.active ? B.tut.html(ruby) : `<p class="banner">${esc(banner())}</p>`}
    <section class="zone mine" aria-label="わたしの せんじょう">${perms('P')}</section>
    <div class="me-bar">
      <span class="life ${s.P.life <= 5 ? 'low' : ''} ${s.P.life < pv.life ? 'hit' : s.P.life > pv.life ? 'heal' : ''}" role="status"><small>ライフ</small><b>${s.P.life}</b></span>
      ${manaZone()}
      <div class="piles">${deckPile('P')}${gravePile('P')}</div>
    </div>
    ${s.P.suspended.length ? `<div class="susp">${s.P.suspended.map((x) => `<span class="chip">たいき：${ruby(info(x.c.def).name)}　あと ${x.n}</span>`).join('')}</div>` : ''}
    <div class="hand" aria-label="てふだ ${s.P.hand.length}まい">${s.P.hand.map((c, i) => `<button type="button" class="hand-slot ${isNew(pv.hand, c.uid) ? 'drawn' : ''}" style="--i:${i}" data-hand="${i}" data-card="${esc(c.def.id)}">${cardFace(c.def)}</button>`).join('') || '<p class="empty">てふだは ない</p>'}</div>
    <footer class="actions">${btns}</footer>
  </div>`;
  B.tut?.highlight(app());
  B.prev = { perms: new Set([...s.P.bf, ...s.E.bf].map((p) => p.uid)), hand: new Set(s.P.hand.map((c) => c.uid)), life: s.P.life, elife: s.E.life, gy: s.P.gy.length };
}

// テスト用：いまの たたかいを さわってから 描きなおす（ブラウザの しらべで 場を つくる）
export function debugBattle(fn) { if (B) { fn(B, api); render(); } }
