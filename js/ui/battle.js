// たたかいの画面。ルールは engine/game.js、プレイヤーの判断はタップで、敵のターン中の質問は await で待つ
import {
  api, newGame, beginPlayerTurn, endPlayerTurn, enemyTurn, combatStart, declareAttack, finishCombat,
  isCreature, onBf, hasKw, pt, power, colorsOf, canBlock, sba, tapPerm,
} from '../engine/game.js';
import { AI, plan, castCard, pay, readyAttackers, suspendCard, levelUp, manaCount } from '../engine/ai.js';
import { FLOORS } from '../data/enemies.js';
import { permFace, cardFace, detail, sheet, esc, ruby, info, noRuby, pickMany, divideSheet, numberSheet } from './view.js';
import { makeTutorial } from './tutorial.js';

let B = null; // いまのたたかい
const app = () => document.getElementById('app');
const nm = (p) => noRuby(info(p.def).name);
const isSpell = (d) => d.types.includes('instant') || d.types.includes('sorcery');

export function startBattle(o) {
  const floor = FLOORS[o.floorId]();
  B = { mode: 'main', phase: 1, combatDone: false, busy: false, onEnd: o.onEnd, floorName: o.floorName, sel: new Map(), atk: [], blocks: new Map(), blockMap: new Map(), seen: 0 };
  B.s = newGame({ deck: o.deck, floor, diff: o.diff, seed: Math.floor(Math.random() * 1e9), ai: humanAI(), log: true });
  if (o.tutorial) { B.tut = makeTutorial(); o.setup?.(B.s, api); }
  app().onclick = onClick;
  initSwipe();
  startTurn();
}

// ---- 敵のターン中にプレイヤーに聞くこと ----
function humanAI() {
  return {
    // 待機が おわった 呪文：対象を えらんで ただで 唱える
    castSuspended: async (s, c) => {
      const d = c.def;
      render();
      await sheet(detail(d), [{ label: 'つかう', value: 1, kind: 'primary' }], { title: '待機（たいき）が おわった！ ただで 唱える', dismiss: false });
      let run = null;
      if (d.tgt && d.apply) {
        const picks = needsTargets(d.tgt, {}) ? await pickAll(d.tgt, {}) : null;
        if (picks) run = () => d.apply(s, api, picks, 0);
      } else { const r = d.play?.(s, api, { phase: 1, c, human: true, manaLeft: 0 }); if (r) run = r.run; }
      if (run) await castCard(s, c, null, { run, from: 'suspend' });
      else { s.P.gy.push(c); s.logs.push(`[${s.turn}P] 待機：${d.name} は こうかが なかった`); }
      render();
    },
    // 敵が めくった カードを 見せる（打ち消せるときは counter が 見せる）
    revealed: async (s, c) => {
      if (s.P.hand.some((h) => h.def.counter && (h.def.counter === 'any' || c.def.types.includes('creature')) && plan(s, h.def.cost, colorsOf(h.def), { req2: h.def.req2 }))) return;
      render();
      await sheet(`${detail(c.def, { enemy: true })}<p class="what">${esc(revealNote(c.def))}</p>`, [{ label: 'つづける', value: 1, kind: 'primary' }], { title: '敵が カードを めくった', dismiss: false });
    },
    counter: async (s, c) => {
      const opts = s.P.hand.filter((h) => h.def.counter && (h.def.counter === 'any' || c.def.types.includes('creature')) && plan(s, h.def.cost, colorsOf(h.def), { req2: h.def.req2 }));
      if (!opts.length) return false;
      render();
      const v = await sheet(detail(c.def, { enemy: true }), [
        ...opts.map((h) => ({ label: `${esc(nm(h))} で 打ち消す`, value: h, kind: 'primary' })),
        { label: '打ち消さない', value: null },
      ], { title: '敵が 呪文を 唱えた！', dismiss: false });
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
        const v = await sheet(detail(c.def), [{ label: '瞬速で 出す（ブロックに使える）', value: true, kind: 'primary' }, { label: '出さない', value: false }], { title: `敵が ${attackers.length}体で 攻撃してくる`, dismiss: false });
        if (v) castCard(s, c, pl, {});
      }
    },
    blocks: (s, attackers) => chooseBlocks(attackers),
    // 占術：上から1まいずつ「上に のこす／いちばん下へ」
    scry: async (s, n) => {
      const top = s.P.lib.splice(0, n);
      const keep = [], bottom = [];
      for (let i = 0; i < top.length; i++) {
        if (B) render();
        const v = await sheet(`<p>ライブラリーの 上から ${i + 1}まいめ。つぎに 引く カードに するなら「上に のこす」。</p>${detail(top[i].def)}`, [
          { label: '上に のこす', value: 'keep', kind: 'primary' }, { label: 'いちばん 下へ', value: 'bottom' },
        ], { title: `占術（せんじゅつ）${i + 1}/${top.length}`, dismiss: false });
        (v === 'bottom' ? bottom : keep).push(top[i]);
      }
      s.P.lib.unshift(...keep); s.P.lib.push(...bottom);
      s.logs.push(`[${s.turn}P] 占術：上に ${keep.length}まい、下に ${bottom.length}まい`);
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
          ...opts.map((x) => ({ label: `${esc(nm(x.c))} を 使う`, value: x, kind: 'primary' })),
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
    await sheet('<p>大群が 来る前に、もう1ターン 準備できる。</p>', [{ label: 'つぎの ターン', value: 1, kind: 'primary' }], { title: '追加ターン！' });
  } else {
    B.mode = 'enemy'; render();
    const from = s.logs.length;
    await enemyTurn(s);
    const lines = s.logs.slice(from).map((l) => l.replace(/^\[\d+[PE]\] /, ''));
    if (!checkOver(lines)) await sheet(`<ol class="elog">${lines.map((l) => `<li>${esc(l)}</li>`).join('') || '<li>なにも 起きなかった</li>'}</ol>`, [{ label: 'わたしの ターン', value: 1, kind: 'primary' }], { title: '敵の ターン' });
  }
  B.busy = false;
  if (!B.s.over) startTurn();
}

function checkOver(lines) {
  const s = B.s;
  if (!s.over) return false;
  render();
  const win = s.over === 'win';
  sheet(`${lines ? `<ol class="elog">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>` : ''}<p class="big-result ${win ? 'win' : 'lose'}">${win ? 'かった！' : 'まけた…'}</p><p>${s.stats.playerTurns}ターン　ぴったり ${s.stats.exact}回</p>`,
    [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: B.floorName, dismiss: false })
    .then(() => B.onEnd({ win, turns: s.stats.playerTurns, exact: s.stats.exact, phase: s.stats.phase }));
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
    case 'erebos':
      if (s.phase === 1) return cr.filter((p) => p.def.head);
      if (s.phase === 2) return cr.filter((p) => p.def.minion);
      return ['face', ...cr.filter((p) => !p.def.erebos)];
    default: return cr;
  }
}
const faceName = () => ({ horde: '大群（山札を 削る）', erebos: 'エレボス（ライフを 減らす）', factory: `ゴーレム工場（鍵 ${B.s.E.key}：ちょうど 同じ数で こわれる）` })[B.s.floor.id] || '敵';

// ---- 対象を えらぶ ----
function faceAvailable() {
  const s = B.s;
  return { horde: s.E.lib.length > 0, erebos: s.phase === 3, factory: true }[s.floor.id] || false;
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
  return `${t.side === 'E' ? '敵：' : ''}${esc(nm(t))}${isCreature(t) ? `（${power(s, t)}/${pt(s, t)[1] - t.dmg}）` : ''}`;
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
    if (spec.divide) {
      const n = spec.divide === 'x' ? ctx.x : spec.divide;
      const k = chosen.length;
      chosen = k === 1 ? [{ t: chosen[0], n }] : await divideSheet(`${n}を 割り振る`, n, chosen.map((t) => ({ label: targetLabel(t), value: t })));
    }
    picks.push(chosen);
  }
  return picks;
}
const needsTargets = (tgt, ctx) => tgt.every((spec) => cands(spec, ctx).length >= (spec.min ?? 1));
const tName = (t) => (t === 'face' ? faceName() : nm(t));

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
      ms = await pickMany(`${esc(noRuby(info(d).name))}：モードを えらぶ`, ok.map((m) => ({ label: esc(m.label), value: m })), {
        min: 1, max: ok.length, note: `増呪（ぞうじゅ）：2つめから 1つ ふえるごとに ＋${d.escalate}マナ${manaNote()}`,
      });
    } else {
      const m = await sheet('<p>つぎの うち 1つを えらぶ。</p>', [
        ...d.modes.map((m) => ({ label: m.label, value: m, kind: 'primary', disabled: !modeOk(m, ctx), note: modeOk(m, ctx) ? '' : 'ねらえる 相手が いない' })),
        { label: 'やめる', value: null },
      ], { title: noRuby(info(d).name) });
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
  const cost = from === 'gy' ? d.flashback.cost : d.cost;
  const req = from === 'gy' ? d.flashback.req : colorsOf(d);
  const o = { convoke: d.kw?.includes('convoke'), req2: d.req2 };
  const perm = !isSpell(d);
  if (d.counter) return { why: '敵が 呪文を 唱えたときに 使う' };
  if (from === 'hand' && d.suspend && !plan(s, cost, req, o) && s.active === 'P' && B.mode === 'main') return { why: 'マナが たりない（待機なら 使える かも）' };
  if (d.react && !d.play) return { why: '敵が 攻撃してきたときに 使う' };
  if (!perm && !d.play && (d.trick || d.bloodrush)) return { why: '攻撃の とちゅう（ブロックの あと）に 使う' };
  if (s.active !== 'P' || !['main'].includes(B.mode)) return { why: 'いまは 使えない' };
  let x = 0;
  if (d.x) {
    while (plan(s, cost + x + 1, req, o)) x++;
    if (x < 1) return { why: 'マナが たりない' };
  }
  const pl = plan(s, cost + x, req, o);
  if (!pl) return { why: colorsOf(d).length && plan(s, cost + x, [], o) ? `${colorsOf(d).map((k) => ({ W: '白', U: '青', G: '緑', R: '赤' })[k]).join('か')}の マナが いる` : 'マナが たりない' };
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
  return { ok: true, pl: plan(s, cost + x, req, o), r, x };
}

async function doCast(c, from = 'hand') {
  const s = B.s, d = c.def;
  const ci = castInfo(c, from);
  if (!ci.ok) return;
  B.busy = true;
  const stop = () => { B.busy = false; render(); };
  const base = from === 'gy' ? d.flashback.cost : d.cost;
  const req = from === 'gy' ? d.flashback.req : colorsOf(d);
  const o = { convoke: d.kw?.includes('convoke'), req2: d.req2 };
  // X：いくつに するかは 自分で きめる
  let x = ci.x;
  if (d.x) { x = await numberSheet(`${esc(noRuby(info(d).name))}：X を きめる`, { min: 1, max: ci.x, value: 1, note: `コストは X ＋ ${base}${manaNote()}` }); if (x == null) return stop(); }
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
      picks = await pickAll(d.tgt, { x, note: d.strive ? `激励（げきれい）：2つめから 1つ ふえるごとに ＋${d.strive}マナ${manaNote()}` : '' });
      if (!picks) return stop();
      if (d.strive) extra += d.strive * (picks[0].length - 1);
    } else if (d.apply) return stop();
    else picks = d.tgt.map(() => []); // ねらえる相手が いない パーマネントは、出すだけ
  }
  const pl = (extra || x !== ci.x) ? await payable(base + x + extra, req, o) : plan(s, base + x, req, o);
  if (!pl) return stop();
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

async function action(a) {
  const s = B.s;
  if (a === 'end') return endTurn();
  if (a === 'tutnext') { B.tut?.next(); return render(); }
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
  if (a === 'mana') return sheet(`<div class="mana-list">${s.P.mana.map((m) => `<span class="mchip ${colorsOf(m.def)[0] ? `m-${colorsOf(m.def).join('')}` : 'm-C'} ${m.tapped ? 'used' : ''}">${esc(noRuby(info(m.def).name))}</span>`).join('')}</div>`, [{ label: 'とじる', value: 0 }], { title: `マナゾーン（${s.P.mana.filter((m) => !m.tapped).length}/${s.P.mana.length} 使える）` });
  if (a === 'log') return sheet(`<ol class="elog">${s.logs.slice(-40).map((l) => `<li>${esc(l)}</li>`).join('')}</ol>`, [{ label: 'とじる', value: 0 }], { title: 'これまでの できごと' });
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
    const name = t === 'face' ? faceName() : `敵：${nm(t)}`;
    const sum = ns.reduce((a, b) => a + b, 0);
    const tough = t !== 'face' && !onBf(s, t) && t.diedT ? `（タフネス ${t.diedT}）` : '';
    const res = t === 'face' ? '' : t.exact ? `<b class="exact">ぴったり！</b>${tough}` : !onBf(s, t) ? `<b>たおした</b>${tough}` : isCreature(t) ? `のこり ${pt(s, t)[1] - t.dmg}` : '';
    return `<li><span>${esc(name)}</span><span class="eq">${ns.length > 1 ? `${ns.join(' ＋ ')} ＝ ` : ''}${sum}点</span>${res}</li>`;
  });
  return sheet(`<ul class="cres">${rows.join('')}</ul>`, [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: '攻撃の けっか' });
}

async function tapHand(c) {
  const s = B.s, d = c.def;
  const choices = [];
  if (B.mode === 'main') {
    const ci = castInfo(c);
    choices.push({ label: d.types.includes('creature') ? '戦場に 出す' : '使う', value: 'cast', kind: 'primary', disabled: !ci.ok, note: ci.ok ? '' : ci.why });
    if (d.suspend && s.active === 'P') { const ok = !!plan(s, d.suspend.cost, d.suspend.req || []); choices.push({ label: `待機する（${d.suspend.cost}マナ・${d.suspend.turns}ターン あとに ただで 使う）`, value: 'suspend', kind: 'primary', disabled: !ok, note: ok ? '' : 'マナが たりない' }); }
    if (!s.P.flags.charged) choices.push({ label: 'マナゾーンに 置く', value: 'charge', note: '1ターンに 1枚まで' });
  }
  if (B.mode === 'tricks') {
    const tr = d.trick || (d.bloodrush ? { kind: 'single' } : null);
    if (tr || d.modes) {
      const cost = d.bloodrush ? d.bloodrush.cost : d.cost, req = d.bloodrush ? d.bloodrush.req : colorsOf(d);
      const pl = plan(s, cost, req, { convoke: d.kw?.includes('convoke') });
      choices.push({ label: d.bloodrush ? '湧血で 使う' : '使う', value: 'trick', kind: 'primary', disabled: !pl, note: pl ? '' : 'マナが たりない' });
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
    target = await sheet('<p>どの クリーチャーに 使う？</p>', [...live.map((a) => ({ label: `${esc(nm(a.p))}（${power(s, a.p)}/${pt(s, a.p)[1]}）`, value: a.p })), { label: 'やめる', value: null }]);
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
    if (!readyAttackers(s).includes(p)) return sheet(detail(p.def), [{ label: 'このターンは 攻撃できない', value: 0 }]);
    if (B.sel.has(p.uid) && !p.def.mustAttack) { B.sel.delete(p.uid); return render(); }
    const ts = attackTargets();
    if (!ts.length) return sheet('<p>攻撃できる 相手が いない。</p>', [{ label: 'とじる', value: 0 }]);
    const t = ts.length === 1 ? ts[0] : await sheet(`<p>${esc(nm(p))}（パワー ${power(s, p)}）で どこを 攻撃する？</p>`, [
      ...ts.map((t) => ({ label: t === 'face' ? faceName() : `${esc(nm(t))}${isCreature(t) ? `（のこり ${pt(s, t)[1] - t.dmg}）` : t.def.factory ? `（鍵 ${s.E.key}）` : ''}`, value: t })),
      { label: 'やめる', value: null },
    ]);
    if (t) B.sel.set(p.uid, t);
    return render();
  }
  if (B.mode === 'block' && p.side === 'P') {
    if (!isCreature(p) || p.tapped) return;
    for (const [k, v] of B.blockMap) if (v === p) { B.blockMap.delete(k); return render(); }
    const ok = B.blockAttackers.filter((a) => onBf(s, a) && canBlock(s, p, a) && !B.blockMap.has(a.uid));
    if (!ok.length) return sheet('<p>この クリーチャーで ブロックできる 敵が いない（飛行は 飛行か 到達で しか ブロックできない）。</p>', [{ label: 'とじる', value: 0 }]);
    const a = await sheet(`<p>${esc(nm(p))}（${power(s, p)}/${pt(s, p)[1] - p.dmg}）で どれを ブロックする？</p>`, [
      ...ok.map((a) => ({ label: `${esc(nm(a))}（${power(s, a)}/${pt(s, a)[1] - a.dmg}）`, value: a })), { label: 'やめる', value: null },
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
      const blocked = (a.tap && (p.tapped || (isCreature(p) && p.sick))) ? 'タップできない' : (a.monstrosity && p.monstrous) ? 'もう 怪物' : (a.levelUp && p.level >= p.def.levelMax) ? 'もう いちばん上の レベル' : (!plan(s, cost + x, a.req || [], o) || (a.x && x < 1)) ? 'マナが たりない' : '';
      const r = blocked ? null : a.levelUp ? { run: () => {} } : a.tgt ? (needsTargets(a.tgt, { src: p }) ? { tgt: true } : null) : a.play(s, p, api, { phase: B.phase, xMax: x });
      const label = a.levelUp ? `Lvアップ（${cost}マナ）いま レベル ${p.level}` : `能力を 使う（${a.x ? `X+${cost}` : cost}マナ${a.tap ? '・タップ' : ''}）`;
      choices.push({ label, value: { a, cost, o, x: a.x ? (a.tgt ? x : Math.min(r?.x ?? x, x)) : 0, r }, kind: 'primary', disabled: !!blocked || !r, note: blocked || (r ? '' : 'いまは こうかが ない') });
    }
    if (p.def.equip) choices.push({ label: `装備する（${p.def.equip}マナ）`, value: 'equip', kind: 'primary', disabled: !plan(s, p.def.equip, []) });
  }
  if (p.side === 'P' && B.mode === 'tricks') for (const a of p.def.acts || []) if (a.pumpP) choices.push({ label: `パワー ＋${a.pumpP}（1マナ・赤）`, value: { a, pump: true }, kind: 'primary', disabled: !plan(s, a.cost, a.req || []) || !p.attacking });
  choices.push({ label: 'とじる', value: null });
  const v = await sheet(detail(p.def, { enemy: p.side === 'E' }), choices);
  if (!v) return;
  if (v === 'equip') {
    const t = await sheet('<p>どの クリーチャーに 装備する？</p>', [...s.P.bf.filter(isCreature).map((q) => ({ label: esc(nm(q)), value: q })), { label: 'やめる', value: null }]);
    if (!t) return;
    pay(s, plan(s, p.def.equip, [])); p.attached = t.uid; return render();
  }
  if (v.pump) { pay(s, plan(s, v.a.cost, v.a.req || [])); api.pump(p, v.a.pumpP, 0); return render(); }
  let picks;
  if (v.a.tgt) { picks = await pickAll(v.a.tgt, { src: p, x: v.x }); if (!picks) return render(); }
  const pl = plan(s, v.cost + v.x, v.a.req || [], v.o); if (!pl) return;
  pay(s, pl);
  if (v.a.tap) tapPerm(s, p);
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
    choices.push({ label: `${esc(noRuby(info(c.def).name))} を フラッシュバック`, value: c, kind: 'primary', disabled: !ci.ok, note: ci.ok ? '' : ci.why });
  }
  choices.push({ label: 'とじる', value: null });
  const v = await sheet(`<div class="mini-list">${s.P.gy.map((c) => cardFace(c.def)).join('') || '<p>墓地は からっぽ</p>'}</div>`, choices, { title: `墓地（${s.P.gy.length}まい）` });
  if (v) doCast(v, 'gy');
}

// ---- スワイプ：自分の クリーチャーから 敵へ ひっぱると 攻撃先・ブロックを きめる ----
// 本体（大群の山札・エレボスのライフ）を ねらえる 階は、敵の 戦場に「本体」の 札を 出す
const attackFace = () => ['horde', 'erebos'].includes(B.s.floor.id) && attackTargets().includes('face');
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
    if (!validDrop(d.p, t)) { if (t || dropAt(e.clientX, e.clientY) === null) toast(B.mode === 'block' ? 'その 敵は ブロック できない' : 'そこは 攻撃 できない'); return; }
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
  const lib = `<span class="chip">山札 ${s.E.lib.length}</span>`;
  switch (s.floor.id) {
    case 'hydra': return `<span class="chip hot">頭 ${cr.filter((p) => p.def.head).length}本</span>${lib}`;
    case 'horde': return `<span class="chip hot">大群の山札 のこり ${s.E.lib.length}まい</span>`;
    case 'factory': return `<span class="chip hot">工場の 鍵 ${s.E.key}</span>${lib}`;
    case 'slime': return `<span class="chip hot">スライム ${cr.filter((p) => p.def.slime).length}体</span>${lib}`;
    case 'xenagos': return `<span class="chip hot">歓楽者 ${cr.filter((p) => p.def.reveler).length}体</span>${lib}`;
    case 'tutorial': return '';
    case 'erebos': return `<span class="chip">段階 ${s.phase}/3</span>${s.phase === 3 ? `<span class="chip hot">エレボスの ライフ ${s.E.life}</span>` : ''}${lib}`;
    default: return lib;
  }
}

// ---- 敵の つぎの ターン ----
function willAttack(p) {
  const s = B.s;
  if (s.floor.id === 'tutorial') return !!p.def.straw && (s.E.flags.n || 0) >= 1;
  if (!isCreature(p) || p.def.head) return false;
  if (s.floor.id === 'slime' && !s.E.flags.started) return false;
  if (s.floor.id === 'erebos' && s.phase === 3 && p.def.erebos) return !s.E.flags.erebosRest;
  return !!(p.def.attacks || p.flags.mustAttack);
}
function intent() {
  const s = B.s, cr = s.E.bf.filter(isCreature);
  const out = [];
  const heads = cr.filter((p) => p.def.head);
  if (heads.length) {
    const live = heads.filter((p) => !p.frozen);
    if (live.length) out.push(`頭が ダメージ（${live.map((p) => p.def.headDmg).join('・')}）${live.length < heads.length ? '（こおった頭は なし）' : ''}`);
  }
  if (s.floor.id === 'erebos' && s.phase === 3) out.push(`はじめに ライフ −${{ easy: 2, normal: 2, hard: 3 }[s.diff]}`);
  if (s.floor.id === 'factory' && !s.E.flags.inspect && s.E.bf.filter((p) => p.def.golem).length < 2) out.push('ゴーレムを 1体 作る');
  const atk = cr.filter(willAttack).filter((p) => !p.frozen);
  if (atk.length) out.push(`${atk.length}体で 攻撃（パワー ${atk.map((p) => Math.max(0, power(s, p))).join('・')}）`);
  if (s.floor.id === 'slime' && !s.E.flags.started) out.push('さいしょの ターンは 攻撃しない');
  if (s.floor.id === 'xenagos') out.push('ゼナゴスは 笛吹きが 出たときだけ 攻撃');
  const n = { horde: { easy: 1, normal: 1, hard: 2 }, xenagos: 1 }[s.floor.id];
  const reveal = s.floor.id === 'horde' ? n[s.diff] + s.E.bf.filter((p) => p.def.altar).length : s.floor.id === 'erebos' && s.phase > 1 ? (s.diff === 'easy' ? 1 : 2) : 1;
  if (s.E.lib.length) out.push(`山札を ${Math.min(reveal, s.E.lib.length)}まい めくって 使う`);
  if (s.E.extraTurns > 0) out.push(`まだ 来ない（あと ${s.E.extraTurns}ターン）`);
  return out.length ? out : ['なにも しない'];
}
function revealNote(d) {
  if (d.types.includes('creature')) return 'このクリーチャーが 敵の 戦場に 出る。';
  if (d.types.includes('sorcery')) return 'この呪文の 効果が すぐに 起きる。';
  return 'このカードが 敵の 戦場に 出る。';
}

function banner() {
  switch (B.mode) {
    case 'attack': return '攻撃する クリーチャーを 敵へ ひっぱる（タップでも えらべる）';
    case 'tricks': return B.blocks.size ? 'ブロックされた！ 強化の 呪文を 使うなら いま' : 'ブロックされなかった。強化の 呪文を 使うなら いま';
    case 'block': return '敵の 攻撃！ 自分の クリーチャーを 攻撃してくる 敵へ ひっぱって ブロック';
    case 'enemy': return '敵の ターン…';
    default: return B.phase === 1 ? (B.combatDone ? 'カードを 使うか、マナゾーンに 置こう' : 'カードを 使おう。クリーチャーを 敵へ ひっぱると 攻撃') : '攻撃は おわり。カードを 使って、ターンを おわろう';
  }
}

function permLabel(p) {
  const s = B.s;
  if (B.mode === 'attack' && B.sel.has(p.uid)) return `→ ${tName(B.sel.get(p.uid))}`;
  if (B.mode === 'main' && p.side === 'E' && willAttack(p) && !p.frozen) return '!つぎに 攻撃';
  if (B.mode === 'tricks') {
    const a = B.atk.find((x) => x.p === p);
    if (a) { const bl = B.blocks.get(p.uid); return bl ? `ブロック：${nm(bl)}` : `→ ${tName(a.t)}`; }
    for (const [k, v] of B.blocks) if (v === p) return 'ブロック中';
  }
  if (B.mode === 'block') {
    if (p.side === 'E' && B.blockAttackers.includes(p)) { const bl = B.blockMap.get(p.uid); return bl ? `← ${nm(bl)}` : '攻撃中'; }
    for (const [k, v] of B.blockMap) if (v === p) return 'ブロック';
  }
  return '';
}

function render() {
  const s = B.s;
  if (!drag) clearDrag();
  B.tut?.update(s, B);
  const ready = B.mode === 'attack' ? readyAttackers(s) : [];
  const perms = (side) => s[side].bf.map((p) => permFace(s, p, {
    label: permLabel(p),
    cls: [B.mode === 'attack' && ready.includes(p) ? 'can' : '', B.sel.has(p.uid) && B.mode === 'attack' ? 'sel' : '', B.mode === 'block' && side === 'E' && B.blockAttackers.includes(p) ? 'attacking' : '', side === 'P' && canDrag(p) ? 'drag' : ''].join(' '),
  })).join('') || '<p class="empty">（なにも いない）</p>';
  const face = attackFace() ? `<div class="perm face-tile" data-face="1"><span>${esc(faceName())}</span><b>${s.floor.id === 'horde' ? `山札 ${s.E.lib.length}` : `ライフ ${s.E.life}`}</b></div>` : '';
  const untapped = s.P.mana.filter((m) => !m.tapped).length;
  const colors = { W: 0, U: 0, G: 0, R: 0, C: 0 };
  for (const m of s.P.mana) if (!m.tapped) { const c = colorsOf(m.def); if (!c.length) colors.C++; else for (const k of c) colors[k]++; }
  const last = s.logs.slice(-2).map((l) => l.replace(/^\[\d+[PE]\] /, ''));
  let btns = '';
  if (B.mode === 'main') btns = `${B.phase === 1 && !B.combatDone ? '<button type="button" class="btn primary" data-act="attack">攻撃する</button>' : ''}<button type="button" class="btn" data-act="end">ターン おわり</button>`;
  if (B.mode === 'attack') btns = `<button type="button" class="btn" data-act="cancel">攻撃しない</button><button type="button" class="btn" data-act="auto">おまかせ</button><button type="button" class="btn primary" data-act="declare">攻撃！（${B.sel.size}体）</button>`;
  if (B.mode === 'tricks') btns = '<button type="button" class="btn primary" data-act="damage">ダメージ！</button>';
  if (B.mode === 'block') btns = '<button type="button" class="btn" data-act="blockauto">おまかせ</button><button type="button" class="btn primary" data-act="blockdone">ブロック けってい</button>';
  if (B.mode === 'enemy') btns = '<span class="wait">敵の ターン…</span>';
  app().innerHTML = `<div class="battle">
    <header class="bt-head">
      <div><span class="floor">${esc(B.floorName)}</span><span class="turn">ターン ${s.stats.playerTurns}</span></div>
      <div class="chips">${enemyStatus()}</div>
    </header>
    <p class="intent">${B.mode === 'main' || B.mode === 'attack' ? `<b>つぎの 敵</b>${intent().map((t) => `<span>${esc(t)}</span>`).join('')}` : ''}</p>
    <section class="zone enemy" aria-label="敵の 戦場">${face}${perms('E')}</section>
    <button type="button" class="logline" data-act="log">${last.map((l) => `<span>${esc(l)}</span>`).join('') || '<span>たたかい スタート！</span>'}</button>
    ${B.tut?.active ? B.tut.html(ruby) : `<p class="banner">${esc(banner())}</p>`}
    <section class="zone mine" aria-label="わたしの 戦場">${perms('P')}</section>
    <div class="me-bar">
      <span class="life ${s.P.life <= 5 ? 'low' : ''}">ライフ <b>${s.P.life}</b></span>
      <button type="button" class="mana" data-act="mana">マナ <b>${untapped}</b>/${s.P.mana.length}${Object.entries(colors).filter(([, n]) => n).map(([k, n]) => `<i class="pip m-${k}">${n}</i>`).join('')}</button>
      <span class="pile">山札 ${s.P.lib.length}</span>
      <button type="button" class="pile" data-act="gy">墓地 ${s.P.gy.length}</button>
    </div>
    ${s.P.suspended.length ? `<div class="susp">${s.P.suspended.map((x) => `<span class="chip">待機：${esc(noRuby(info(x.c.def).name))}　あと ${x.n}</span>`).join('')}</div>` : ''}
    <div class="hand" aria-label="手札">${s.P.hand.map((c, i) => `<button type="button" class="hand-slot" data-hand="${i}" data-card="${esc(c.def.id)}">${cardFace(c.def)}</button>`).join('') || '<p class="empty">手札は ない</p>'}</div>
    <footer class="actions">${btns}</footer>
  </div>`;
  B.tut?.highlight(app());
}

// テスト用：いまの たたかいを さわってから 描きなおす（ブラウザの しらべで 場を つくる）
export function debugBattle(fn) { if (B) { fn(B, api); render(); } }
