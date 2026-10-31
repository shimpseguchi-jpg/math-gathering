// たたかいの画面。ルールは engine/game.js、プレイヤーの判断はタップで、敵のターン中の質問は await で待つ
import {
  api, newGame, beginPlayerTurn, endPlayerTurn, enemyTurn, combatStart, declareAttack, finishCombat, LOW_LIBRARY, reshuffleCost,
  isCreature, onBf, hasKw, pt, power, colorsOf, canBlock, sba, tapPerm, discard, costOf, gyCast, mulligan, cmdTax, cmdCost, useBreak, canBreak, silenced, uncounterable, equipCost, BREAK_AT, BREAK_ALL, BREAK_ONE, BREAK_FACE, pickOf,
} from '../engine/game.js';
import { AI, plan, castCard, pay, readyAttackers, suspendCard, levelUp, manaCount, castAdventure, castBestow, LIFE_PIP, escapeMin, njCost, njPlan, njCards } from '../engine/ai.js';
import { fitsDeck } from '../data/kit.js';
import { FLOORS, nyxLoss, PVP_TURNS, STONE } from '../data/enemies.js';
import { npNote } from '../data/set10.js';
import { spOf, spMax } from '../data/set11.js';
// せんぎポイント ●●●○○（花火が いると 7こ）
const spDots = (s) => { const n = Math.min(spOf(s), spMax(s)); return `<b>${n}</b> ${'●'.repeat(n)}${'○'.repeat(spMax(s) - n)}`; };
import '../data/ravnica.js'; // ラヴニカの 塔の 階を FLOORS に 入れる
import '../data/strixhaven.js'; // ストリクスヘイヴンの 塔の 階も
import { permFace, cardFace, detail, loreHtml, speak, sheet, esc, ruby, noRuby, info, pickMany, divideSheet, numberSheet, byColorCost, toast, COLOR_NAME } from './view.js';
import { makeTutorial } from './tutorial.js';
import { LORE } from '../data/lore.js';
import * as fx from './fx.js';

let B = null; // いまのたたかい
const app = () => document.getElementById('app');
// カードの 名前：nm は ふりがなつきの HTML、nmText は「漢字（よみ）」の 文字（あとで ruby に とおす）
const nmText = (p) => info(p.def).name;
const nm = (p) => ruby(nmText(p));
const isSpell = (d) => d.types.includes('instant') || d.types.includes('sorcery');

export function startBattle(o) {
  const floor = o.floor || FLOORS[o.floorId]();
  B = { mode: 'main', phase: 1, combatDone: false, busy: false, onEnd: o.onEnd, quit: o.quit, floorName: o.floorName, sel: new Map(), atk: [], blocks: new Map(), blockMap: new Map(), seen: 0, lore: new Set() };
  B.s = newGame({ deck: o.deck, floor, diff: o.diff, seed: Math.floor(Math.random() * 1e9), ai: humanAI(), log: true, emblem: o.emblem, bless: o.bless, buff: o.buff, cmd: o.cmd, cmdOpt: o.cmdOpt, life: o.life });
  // チュートリアル（o.tutorial：ボタンを しぼる）・ストーリーの コーチ（o.coach：ことばだけ。どの そうさも できる）
  if (o.tutorial || o.coach) B.tut = makeTutorial(o.coach, { lock: !o.coach || !!o.coachLock }); // coachLock：ストーリーでも 光って いる ところ だけ（1-2）
  B.coachWho = o.coach?.[0]?.who || (o.tutorial ? 'コーチ' : '');
  o.setup?.(B.s, api);
  // せりふ：能力が うごいた とき（docs/LORE.md の「とき」）。1まいに つき 1ターンに 1回
  B.s.say = (p, when) => {
    const l = LORE[p.def.id], k = `${p.def.id}:say:${B.s.turn}`;
    if (!l || l.when !== when || B.lore.has(k) || B.tut?.lock) return;
    B.lore.add(k); speak(info(p.def).name, l.say, B.s.swapped ? p.side === 'P' : p.side === 'E');
  };
  app().onclick = onClick;
  initSwipe();
  const go = async () => { await askMulligan(); return floor.first === 'E' ? enemyFirst() : startTurn(); };
  if (!floor.goal || o.tutorial) return go();
  render();
  sheet(`<p class="goal">${ruby(floor.goal(B.s))}</p>${o.emblemNote ? `<p class="em-line">もんしょう：${esc(o.emblemNote)}</p>` : ''}${o.extraNote ? `<p class="em-line">${ruby(o.extraNote)}</p>` : ''}`, [{ label: 'はじめる', value: 1, kind: 'primary' }], { title: `${ruby(o.floorName)}：かちかた`, dismiss: false }).then(go);
}

// マリガン（もんしょう）：はじめの てふだを 見て、1かいだけ ひきなおせる
async function askMulligan() {
  const s = B.s;
  if (!s.P.emblem?.mulligan) return;
  render();
  const hand = s.P.hand.filter((c) => !c.emblem);
  const v = await sheet(`<p>はじめの てふだ。ひきなおすと、やまふだに もどして ${hand.length}まい ひく（1かいだけ）。</p><div class="mull-hand">${hand.map((c) => cardFace(c.def)).join('')}</div>`,
    [{ label: 'このまま はじめる', value: 0, kind: 'primary' }, { label: 'ひきなおす（マリガン）', value: 1 }], { title: 'マリガン', dismiss: false });
  if (v) { mulligan(s); render(); await sheet(`<p>あたらしい てふだ。</p><div class="mull-hand">${s.P.hand.filter((c) => !c.emblem).map((c) => cardFace(c.def)).join('')}</div>`, [{ label: 'はじめる', value: 0, kind: 'primary' }], { title: 'マリガン', dismiss: false }); }
}

// オンラインバトルで あいてが 先に うごく とき
async function enemyFirst() {
  await sheet(`<p>${ruby(B.floorName)}が 先に うごく。</p>`, [{ label: 'はじめる', value: 1, kind: 'primary' }], { title: 'あいての せんこう', dismiss: false });
  await enemyPhase();
}

// ---- 敵のターン中にプレイヤーに聞くこと ----
function humanAI() {
  return {
    manualMulligan: true, // マリガンは 画面で きく（askMulligan）
    // 待機が おわった 呪文：対象を えらんで ただで 唱える
    castSuspended: async (s, c) => {
      const d = c.def;
      render();
      await sheet(detail(d), [{ label: 'つかう', value: 1, kind: 'primary' }], { title: 'たいきが おわった！ ただで となえる', dismiss: false });
      let run = null;
      if (d.tgt && d.apply) {
        const picks = needsTargets(d.tgt, {}) ? await pickAll(d.tgt, { card: d }) : null;
        if (picks) run = () => d.apply(s, api, picks, 0);
      } else { const r = d.play?.(s, api, { phase: 1, c, human: true, manaLeft: 0 }); if (r) run = r.run; }
      if (run) await castCard(s, c, null, { run, from: 'suspend' });
      else { s.P.gy.push(c); s.logs.push(`[${s.turn}P] たいき：${d.name} は こうかが なかった`); }
      render();
    },
    // 敵が めくった カードを 見せる（打ち消せるときは counter が 見せる）
    revealed: async (s, c) => {
      if (!silenced(s) && !uncounterable(s, c.def, 'E') && s.P.hand.some((h) => h.def.counter && (h.def.counter === 'any' || c.def.types.includes('creature')) && plan(s, h.def.cost, colorsOf(h.def), { req2: h.def.req2 }))) return;
      render();
      await sheet(`${detail(c.def, { enemy: true })}<p class="what">${esc(revealNote(c.def))}</p>`, [{ label: 'つづける', value: 1, kind: 'primary' }], { title: 'てきが カードを めくった', dismiss: false });
    },
    counter: async (s, c) => {
      if (silenced(s) || uncounterable(s, c.def, 'E')) return false; // ドロモカ・打ち消されない
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
      if (silenced(s)) return;
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
        picks = needsTargets(ch.tgt, {}) ? await pickAll(ch.tgt, { note: `えいゆうたん「${noRuby(info(p.def).name)}」の ${roman}`, card: p.def }) : null;
        if (!picks) picks = ch.tgt.map(() => []);
      } else await sheet(detail(p.def), [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: `えいゆうたん：${roman} が おきる`, dismiss: false });
      ch.run(s, api, p, picks);
      render();
    },
    dice: (rolls) => sheet(`<p class="big-result dice">サイコロ：${rolls.join(' ＋ ')}${rolls.length > 1 ? ` ＝ ${rolls.reduce((a, b) => a + b, 0)}` : ''}</p>${rolls.length > 1 ? '<p>6が 出たので もう1回 ふった！</p>' : ''}`, [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: 'サイコロ', dismiss: false }),
    // 占術：上から1まいずつ「上に のこす／いちばん下へ」
    // 学習：「本」か「次の ページ」を えらぶ。本は 出た 学習呪文を 見せる。次の ページは すてる カードを えらぶ（やめたら えらびなおし）
    learn: async (s, { book, page }) => {
      for (;;) {
        if (B) render();
        const v = await sheet(`<p><b>${ruby('本（ほん）')}</b>：${ruby('学習呪文（がくしゅうじゅもん）を ランダムに 1まい、てふだに 入れる。')}</p><p><b>次の ページ</b>：てふだを 1まい すてて、1まい 引く。</p>`, [
          { label: '本から 1まい', value: 'book', kind: 'primary' },
          { label: '次の ページ', value: 'page', disabled: !s.P.hand.length, note: s.P.hand.length ? '' : 'てふだが ない' },
        ], { title: ruby('学習（がくしゅう）：どちらに する？'), dismiss: false });
        if (v === 'page') {
          const drop = await pickMany('すてる カードを 1まい えらぶ', s.P.hand.map((c) => ({ label: ruby(info(c.def).name), value: c })), { min: 1, max: 1, note: 'すてたら 1まい 引く' });
          if (!drop?.length) continue;
          page(drop[0]);
        } else {
          const c = book();
          if (c) await sheet(detail(c.def), [{ label: 'てふだに 入れた', value: 1, kind: 'primary' }], { title: ruby('本から 出た 学習呪文（がくしゅうじゅもん）'), dismiss: false });
        }
        setTimeout(() => { if (B && !checkOver()) render(); }, 0);
        return;
      }
    },
    // 呪文書：3まいから 1まいを えらぶ（色も 見える）。えらんだ あとで 手札に 入るので、すこし あとで 画面を かきなおす
    pickCard: async (s, defs, title) => {
      if (B) render();
      const off = (d) => (fitsDeck(s, api, d) ? 0 : LIFE_PIP * (d.req2 ? 2 : 1));
      const v = await sheet(`<p>${defs.length}まいから 1まいを えらんで、てふだに 入れる。${defs.some(off) ? `デッキに ない 色の カードも、色の マナの かわりに ライフを ${LIFE_PIP} はらえば 出せる。` : ''}</p><div class="pick3">${defs.map((d) => detail(d)).join('')}</div>`,
        defs.map((d) => ({ label: `${ruby(info(d).name)} を えらぶ`, value: d, kind: 'primary', note: off(d) ? `デッキに ない 色：出す とき ライフ −${off(d)}` : '' })), { title: ruby(title), dismiss: false });
      setTimeout(() => { if (B && !checkOver()) render(); }, 0);
      return v;
    },
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
    // 諜報：上から1まいずつ「上に のこす／ぼちへ」
    surveil: async (s, n) => {
      const top = s.P.lib.splice(0, n);
      const keep = [];
      for (let i = 0; i < top.length; i++) {
        if (B) render();
        const v = await sheet(`<p>ライブラリーの 上から ${i + 1}まいめ。つぎに 引く カードに するなら「上に のこす」。</p>${detail(top[i].def)}`, [
          { label: '上に のこす', value: 'keep', kind: 'primary' }, { label: 'ぼちへ', value: 'gy' },
        ], { title: `ちょうほう${i + 1}/${top.length}`, dismiss: false });
        (v === 'gy' ? s.P.gy : keep).push(top[i]);
      }
      s.P.lib.unshift(...keep);
      s.logs.push(`[${s.turn}P] ちょうほう：上に ${keep.length}まい、ぼちへ ${top.length - keep.length}まい`);
      if (B) render();
    },
    // てきの こうげき（ブロックの あと）：ゼンゼロの こうたいは まどで えらぶ。インスタントは 手札を タップして 使う（instantWindow 'defend'）
    duringBlocks: async (s, attackers, blocks) => {
      for (let guard = 0; guard < 5; guard++) {
        const opts = [];
        // 交代（ゼンゼロ）：ブロックしている クリーチャーと 手札の エージェントを いれかえる
        for (const c of njCards(s)) {
          if (!c.def.swapBlock || !njPlan(s, c)) continue;
          for (const [aUid, b] of blocks) if (onBf(s, b)) opts.push({ c, swap: aUid, b, a: attackers.find((x) => x.uid === aUid) });
        }
        if (!opts.length) break;
        render();
        const v = await sheet('<p>こうたい できる エージェントが いる。</p>', [
          ...opts.map((x) => ({ label: `こうたい：${nm(x.b)} → ${nm(x.c)}（${njLabel(s, x.c)}）`, value: x, kind: 'primary', note: x.a ? `${nm(x.a)}（${power(s, x.a)}/${pt(s, x.a)[1]}）を ブロック中` : '' })),
          { label: 'こうたいしない', value: null },
        ], { title: 'ブロックの あとで', dismiss: false });
        if (!v) break;
        api.swapBlocker(s, v.c, v.swap, blocks); render();
      }
      await instantWindow('defend', { attackers, blocks });
    },
    // てきの ターンの おわり：のこった マナで インスタント（instantWindow 'eot'）
    endOfTurn: (s) => instantWindow('eot', {}),
  };
}

// ---- てきの ターンの インスタント（2026-10-29。REQUIREMENTS 8.8）----
// ブロックの あと（'defend'：こうげきしてくる てきを ねらえる・ブロッカーを 強化できる）と、ターンの おわり（'eot'：のこった マナで）に、手札の インスタントを タップして 使える
// 使える カードが 1まいも なければ 止まらない。チュートリアル・ストーリーの コーチが いる たたかいと、インスタントが 使えない とき（ドロモカ）は 出さない
const WIN_MODES = ['defend', 'eot'];
const inWindow = () => WIN_MODES.includes(B.mode);
const winCtx = () => (B.mode === 'defend' && B.winCtx ? B.winCtx : {});
const blockersNow = () => [...new Set([...(B.winCtx?.blocks?.values?.() || [])])].filter((b) => b && onBf(B.s, b));
const isTrick = (d) => !!d.trick && !d.bloodrush && !d.trick.atk; // ブロックの あとに 使える コンバットトリック（1体を 強化・まとめて 強化）。ゆうけつと「こうげきしている クリーチャーだけ」の まとめて 強化（ラッパの 一吹き）は こうげきの ときだけ
const winPhase = () => (B.mode === 'defend' ? 1 : 2); // まどの 中で 能力の play に わたす フェイズ（ブロックの あと＝たたかいの まえ、ターンの おわり＝たたかいの あと）
const windowHasPlay = () => B.s.P.hand.some((c) => handMark(c)) || B.s.P.bf.some((p) => abilityMark(B.s, p)); // まどで 使える ものが ある？（手札の インスタント・クリーチャーの 能力）
function instantWindow(mode, ctx) {
  const s = B.s;
  if (B.tut || s.over || silenced(s)) return Promise.resolve();
  return new Promise((resolve) => {
    B.mode = mode; B.winCtx = ctx;
    B.winDone = () => { B.winDone = null; B.winCtx = null; B.mode = 'enemy'; B.busy = true; if (!s.over) render(); resolve(); };
    B.busy = false; // まどの あいだは プレイヤーが えらぶ ばん。カードを 使っている あいだだけ busy（そのあいだ「つぎへ」は おせない）
    if (!windowHasPlay()) return B.winDone();
    render();
  });
}
// まどの 中で カードを 使った あと：つづけて 使える ものが なければ まどを とじる
async function windowCast(fn) {
  B.busy = true; // 使っている あいだ（ねらいの アニメーション など）は「つぎへ」を おせない
  await fn();
  if (!inWindow()) return;
  B.busy = false;
  if (B.s.over || !windowHasPlay()) return B.winDone?.();
  render();
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
  fx.banner('あなたの ターン');
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
  fx.banner(s.floor.id === 'pvp' ? 'あいての ターン' : 'てきの ターン', true);
  const from = s.logs.length;
  await enemyTurn(s);
  const lines = s.logs.slice(from).map((l) => l.replace(/^\[\d+[PE]\] /, ''));
  if (!checkOver(lines)) await sheet(`<ol class="elog">${lines.map((l) => `<li>${ruby(l)}</li>`).join('') || '<li>なにも 起きなかった</li>'}</ol>`, [{ label: 'わたしの ターン', value: 1, kind: 'primary' }], { title: s.floor.id === 'pvp' ? 'あいての ターン' : 'てきの ターン' });
  B.busy = false;
  if (!B.s.over) startTurn();
}

// ラヴニカの 塔：リーダーの セリフ（ふきだし）
const sayBox = (text) => (text && B.s.floor.speaker ? `<p class="say"><b>${esc(B.s.floor.speaker)}</b><span>${ruby(text)}</span></p>` : '');

function checkOver(lines) {
  const s = B.s;
  if (!s.over) return false;
  render();
  const win = s.over === 'win', draw = s.over === 'draw';
  fx.result(win ? 'win' : draw ? 'draw' : 'lose').then(() => sheet(`${lines ? `<ol class="elog">${lines.map((l) => `<li>${ruby(l)}</li>`).join('')}</ol>` : ''}<p class="big-result ${win ? 'win' : draw ? 'draw' : 'lose'}">${win ? 'かった！' : draw ? 'ひきわけ' : 'まけた…'}</p><p>${s.stats.playerTurns}ターン　ぴったり ${s.stats.exact}回</p>${sayBox(s.floor.lines?.[s.over])}`,
    [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: B.floorName, dismiss: false })
    .then(() => B.onEnd({
      win, draw, turns: s.stats.playerTurns, exact: s.stats.exact, phase: s.stats.phase, cmdFinish: !!s.cmdFinish, finisher: s.finisher || null,
      // トロフィー用
      potions: s.P.hand.filter((c) => c.def.potion).map((c) => c.def.id), // 次元渡り：使わなかった ポーション
      life: s.P.life, floor: s.floor.id, exactTurnMax: s.stats.exactTurnMax || 0, bigHit: s.stats.bigHit || 0, maxPower: s.stats.maxPower || 0, maxCreatures: s.stats.maxCreatures || 0,
    })));
  return true;
}

// ---- 攻撃先 ----
function attackTargets() {
  const s = B.s, cr = s.E.bf.filter(isCreature);
  switch (s.floor.id) {
    case 'hydra': { const h = cr.filter((p) => p.def.head); const t = h.filter((p) => p.def.taunt); return t.length ? t : h; }
    case 'horde': return [...(s.E.lib.length ? ['face'] : []), ...s.E.bf.filter((p) => p.def.types.includes('artifact'))];
    case 'factory': { const f = s.E.bf.find((p) => p.def.factory); return cr.some((p) => p.def.guard) || !f ? cr : [f, ...cr]; }
    case 'clock': { const c = s.E.bf.find((p) => p.def.clock); return cr.some((p) => p.def.guard) || !c ? cr : [c, ...cr]; }
    case 'dragon': return ['face', ...cr.filter((p) => !p.def.dragon || s.E.flags.awake)];
    case 'xenagos': { const r = cr.filter((p) => p.def.reveler); return r.length ? r : cr.filter((p) => p.def.xenagos); }
    case 'pvp': return ['face'];
    case 'erebos':
      if (s.phase === 1) return cr.filter((p) => p.def.head);
      if (s.phase === 2) return cr.filter((p) => p.def.minion);
      return ['face', ...cr.filter((p) => !p.def.erebos)];
    default: return ravFace() ? ['face', ...cr] : cr;
  }
}
// ラヴニカの 塔：ライフを もった リーダー（ジェイスも）
const ravFace = () => !!(B.s.floor.rav && B.s.floor.faceLabel);
const faceName = () => (B.s.floor.id === 'pvp' || ravFace() ? `${B.s.floor.faceLabel || B.s.floor.name}（ライフ ${B.s.E.life}）` : null) || ({
  horde: 'たいぐん（やまふだを けずる）', erebos: 'エレボス（ライフを へらす）', factory: `ゴーレム工場（かぎ ${B.s.E.key}：ちょうど 同じ数で こわれる）`,
  clock: `からくり時計（はり ${B.s.E.hour}時：ちょうど 12で とまる）`, dragon: `たからの 山（きんか ${B.s.E.gold}/${B.s.E.goal}まい）`, gorgon: `メドゥーサ（ライフ ${B.s.E.life}）`,
})[B.s.floor.id] || 'てき';

// ---- 対象を えらぶ ----
function faceAvailable() {
  const s = B.s;
  return { horde: s.E.lib.length > 0, erebos: s.phase === 3, factory: true, pvp: true, clock: true, dragon: true, gorgon: true }[s.floor.id] || ravFace();
}
function cands(spec, ctx = {}) {
  const s = B.s;
  let list = [];
  if (spec.side === 'atk') list = (ctx.attackers || []).filter((p) => onBf(s, p));
  else if (spec.side === 'mine') list = s.P.bf.filter((p) => isCreature(p) && (B.mode !== 'tricks' || p.attacking));
  else for (const sd of spec.side === 'any' ? ['P', 'E'] : [spec.side]) list.push(...s[sd].bf.filter((p) => (spec.perm ? !p.def.factory : isCreature(p)) && p !== ctx.src));
  const wd = s.srcDef; s.srcDef = ctx.card || wd; // 石まきの 大蛇：どの カードで ねらうかで かわる
  list = list.filter((p) => !(s.floor.untargetable?.(s, p, api)) && (!spec.filter || spec.filter(s, api, p)));
  s.srcDef = wd;
  if (spec.face && faceAvailable()) list.unshift('face');
  return list;
}
const targetLabel = (t) => {
  if (t === 'face') return esc(faceName());
  const s = B.s;
  return `${t.side === 'E' ? 'てき：' : ''}${(nm(t))}${isCreature(t) ? `（${power(s, t)}/${pt(s, t)[1] - t.dmg}）` : ''}`;
};
// tgt の並びを 順に えらぶ。やめたら null
// ねらいかたが きまって いる カード（コモン：ランダム、アンコモン：パワーが いちばん 大きい。game.js の pickOf）は、てきを ねらう ところを 自動で きめる
const HARM = /ダメージ|破壊|追放|手札に ?もど|持ち主の ?手札|タップ|−[0-9X０-９]|留置|格闘|ブロックできない|つける/;
const foeSlot = (spec, d) => spec.side === 'E' || (spec.side === 'any' && HARM.test(info(d).text.replace(/（[ぁ-ゖー]+）/g, '')));
async function autoPick(mode, spec, ctx, list) {
  const d = ctx.card;
  const k = spec.divide ? 1 : d.strive ? Math.max(spec.min ?? 1, 1) : Math.min(spec.max ?? 1, list.length);
  const order = mode === 'rand' ? [...list].sort(() => B.s.rng() - 0.5) : [...list].sort((a, b) => (b === 'face' ? -1 : a === 'face' ? 1 : power(B.s, b) - power(B.s, a)));
  const chosen = order.slice(0, k);
  // 見せる：ランダムは 候補を じゅんばんに 光らせてから とまる
  const el = (t) => (t === 'face' ? app().querySelector('[data-face]') : app().querySelector(`.perm[data-uid="${t.uid}"]`));
  render();
  if (mode === 'rand' && list.length > 1) for (let i = 0; i < 8; i++) { const e = el(order[i % order.length]); e?.classList.add('pick-roll'); await fx.pause(90); e?.classList.remove('pick-roll'); }
  for (const t of chosen) el(t)?.classList.add('pick-hit');
  toast(`${mode === 'rand' ? '🎲 ランダムで' : '👑 パワーが いちばん 大きい'} ${chosen.map(tName).join('・')} に きまった`);
  await fx.pause(650);
  return chosen;
}
// レアの 戦闘中の 効果（攻撃したとき・敵に 戦闘ダメージを あたえたとき。def.trigTgt）：その まえに あいてを えらんで おく（p.trigPick → game.js の takePick）
async function preTrig(on, list) {
  // 装備品（FGO の 宝具）：「攻撃するたび」に えらぶ もの。pay は マナを はらうか きく、spec は あいてを えらぶ
  if (on === 'attack') for (const p of list) for (const q of B.s.P.bf) {
    const h = q.attached === p.uid && q.def.hostTrig; if (!h) continue;
    const s = B.s, nmq = noRuby(info(q.def).name);
    if (h.pay) {
      if (!h.pick(s, api) || !plan(s, h.pay, h.req || [])) { q.trigPick = 'skip'; continue; }
      const v = await sheet(`<p>${ruby(`${nmq}：${h.label}`)}</p>`, [{ label: `${h.pay}マナ はらう`, value: 1, kind: 'primary' }, { label: 'はらわない', value: 0 }], { title: 'こうげきした ときの こうか' });
      if (!v) { q.trigPick = 'skip'; continue; }
      const picks = await pickAll([h.spec], { card: q.def }); const t = picks?.[0]?.[0];
      if (!t) { q.trigPick = 'skip'; continue; }
      pay(s, plan(s, h.pay, h.req || [])); q.trigPick = { t, paid: true };
    } else if (h.spec) {
      if (!needsTargets([h.spec], {})) continue;
      const picks = await pickAll([{ ...h.spec, label: `${nmq}：${h.spec.label}` }], { card: q.def, note: 'こうげきした ときの こうか' });
      if (picks?.[0]?.[0]) q.trigPick = { t: picks[0][0] };
    }
  }
  for (const p of list) {
    const tt = p.def.trigTgt;
    if (!tt || tt.on !== on || pickOf(p.def) || !onBf(B.s, p)) continue;
    const spec = { side: 'E', label: `${noRuby(info(p.def).name)}：${tt.label}` };
    if (!needsTargets([spec], {})) continue;
    const picks = await pickAll([spec], { note: on === 'attack' ? 'こうげきした ときの こうか' : 'てきに ダメージを あたえた ときの こうか' });
    if (picks?.[0]?.[0]) p.trigPick = picks[0][0];
  }
}
// とくべつな ルールの カード（data/lore.js）：せりふ と しくみを 見せる。1回の たたかいで 1まいに つき 1回（why ごと）
function tellLore(p, why) {
  const k = `${p.def.id}:${why}`;
  if (!LORE[p.def.id] || B.lore.has(k)) return null;
  B.lore.add(k);
  const head = why === 'appear' ? `<p class="what">${p.side === 'E' ? 'あいての ' : ''}${ruby(info(p.def).name)}が あらわれた！</p>` : `<p class="what">${ruby(info(p.def).name)}は ねらえない！</p>`;
  return sheet(`${head}${loreHtml(p.def)}`, [{ label: 'わかった', value: 1, kind: 'primary' }], { title: ruby(info(p.def).name), dismiss: false });
}
async function pickAll(tgt, ctx = {}) {
  // ねらえない てきの カードが いれば、なぜ ねらえないかを せつめい
  { const s = B.s, wd = s.srcDef; s.srcDef = ctx.card || wd; const sh = s.E.bf.filter((p) => LORE[p.def.id] && api.shielded(s, p)); s.srcDef = wd; for (const p of sh) await tellLore(p, 'shield'); }
  const picks = [];
  const mode = pickOf(ctx.card);
  for (const spec of tgt) {
    if (mode && foeSlot(spec, ctx.card)) {
      const list = cands(spec, ctx).filter((t) => t === 'face' || t.side === 'E');
      if (list.length < (spec.min ?? 1)) return null;
      if (!list.length) { picks.push([]); continue; }
      const chosen = await autoPick(mode, spec, ctx, list);
      picks.push(spec.divide ? [{ t: chosen[0], n: spec.divide === 'x' ? ctx.x : spec.divide }] : chosen);
      continue;
    }
    const list = cands(spec, ctx);
    const min = spec.min ?? 1, max = Math.min(spec.max ?? 1, list.length);
    if (list.length < min) return null;
    if (!list.length) { picks.push([]); continue; }
    render();
    let chosen = await pickMany(ruby(spec.label), list.map((t) => ({ label: targetLabel(t), value: t })), { min, max: Math.max(max, 1), note: ctx.note });
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
    if (d.choose) {
      ms = await pickMany(`${ruby(info(d).name)}：ちがう モードを ${d.choose}つ えらぶ`, ok.map((m) => ({ label: ruby(m.label), value: m })), { min: Math.min(d.choose, ok.length), max: d.choose });
    } else if (d.escalate) {
      ms = await pickMany(`${ruby(info(d).name)}：モードを えらぶ`, ok.map((m) => ({ label: ruby(m.label), value: m })), {
        min: 1, max: ok.length, note: `ぞうじゅ：2つめから 1つ ふえるごとに ＋${d.escalate}マナ${manaNote()}`,
      });
    } else {
      const m = await sheet('<p>つぎの うち 1つを えらぶ。</p>', [
        ...d.modes.map((m) => ({ label: ruby(m.label), value: m, kind: 'primary', disabled: !modeOk(m, ctx), note: modeOk(m, ctx) ? '' : 'ねらえる 相手が いない' })),
        { label: 'やめる', value: null },
      ], { title: ruby(info(d).name) });
      ms = m && [m];
    }
    if (!ms) return null;
    const all = [];
    for (const m of ms) { const picks = m.tgt ? await pickAll(m.tgt, { ...ctx, card: d }) : []; if (!picks) break; all.push([m, picks]); }
    if (all.length < ms.length) continue;
    return { run: (x) => { for (const [m, picks] of all) m.apply(B.s, api, picks, x); }, extra: (d.escalate || 0) * (ms.length - 1) + ms.reduce((n, m) => n + (m.extra || 0), 0) }; // m.extra：超過（なごり雪）など、その モードだけ 多く はらう
  }
}

// マナが たりるか。たりなければ しらせて null（コストの けいさんは 子どもが する）
async function payable(cost, req, o) {
  const pl = plan(B.s, cost, req, o);
  if (!pl) await sheet(`<p>マナが たりない！ ${manaNote()}</p>`, [{ label: 'もどる', value: 0 }], { title: 'マナが たりない' });
  return pl;
}

// 呪文書・学習の カード：色の マナが ない ぶんは ライフで はらえる（1つにつき 2。ライフは 1 のこる ときだけ）
const lifeNote = (d, n) => `${colorsOf(d).map((k) => COLOR_NAME[k]).join('か')}の マナの かわり（ライフ ${B.s.P.life} − ${n} ＝ ${B.s.P.life - n}）`;
// てふだの ♥：いまの マナゾーンに その 色が なくて、ライフで はらう ことに なる
function lifeNeed(s, c) {
  const cs = colorsOf(c.def);
  if (!c.conj || !cs.length) return 0;
  const have = s.P.mana.filter((m) => colorsOf(m.def).some((k) => cs.includes(k))).length;
  return LIFE_PIP * Math.max(0, (c.def.req2 ? 2 : 1) - have);
}

// ---- 呪文を唱えられるか ----
function castInfo(c, from = 'hand') {
  const s = B.s, gc = from === 'gy' && gyCast(s, c.def);
  if (c.def.curse) return { why: '使えない（呪（のろ）い）' }; // 次元渡り
  const d = gc?.kind === 'disturb' ? c.def.disturb.back : c.def; // 降霊：うらの すがた
  const cost = gc ? gc.cost : from === 'escape' ? escapeMin(s, d) : from === 'cmd' ? cmdCost(s, d) : costOf(s, d);
  const req = gc ? gc.req : from === 'escape' ? d.escape.req || colorsOf(d) : colorsOf(d);
  const o = { convoke: d.kw?.includes('convoke'), req2: d.req2, lifeKeep: c.conj ? 1 : 0 };
  const perm = !isSpell(d);
  const mul = d.xMul || 1;
  if (d.discardCost && from === 'hand' && s.P.hand.length - 1 < d.discardCost) return { why: `ほかに すてる てふだが ${d.discardCost}まい いる` };
  const win = from === 'hand' && inWindow(); // てきの ターンの まど：手札の インスタントだけ
  if (win && !d.types.includes('instant')) return { why: 'てきの ターンには インスタントだけ' };
  if (d.counter && !d.modes) return { why: 'てきが じゅもんを となえたときに 使う' };
  if (from === 'hand' && d.suspend && !plan(s, cost, req, o) && s.active === 'P' && B.mode === 'main') return { why: 'マナが たりない（たいきなら 使える かも）' };
  if (d.react && !d.play && B.mode !== 'defend') return { why: 'てきが こうげきしてきたときに 使う' };
  if (!perm && !d.play && (d.trick || d.bloodrush)) return { why: B.mode === 'defend' ? 'こうげきしている クリーチャーにだけ（こうげきの ときに 使う）' : B.mode === 'eot' ? 'たたかいの とちゅう（ブロックの あと）に 使う' : 'こうげきの とちゅう（ブロックの あと）に 使う' };
  if (!win && (s.active !== 'P' || !(B.mode === 'main' || (B.mode === 'tricks' && d.flash && !isSpell(d))))) return { why: 'いまは 使えない' }; // 瞬速の パーマネント（炎の 宝剣）は 攻撃の とちゅうにも
  let x = 0;
  if (d.x) {
    while (plan(s, cost + (x + 1) * mul, req, o)) x++;
    if (x < 1) return { why: 'マナが たりない' };
  }
  const pl = plan(s, cost + x * mul, req, o);
  if (!pl) return { why: colorsOf(d).length && plan(s, cost + x * mul, [], o) ? `${colorsOf(d).map((k) => COLOR_NAME[k]).join('か')}の マナが いる${c.conj ? '（ライフで はらうと 0に なるので はらえない）' : ''}` : 'マナが たりない' };
  if (perm) {
    if (d.need && !d.need(s, api)) return { why: 'いまは 出しても こうかが ない' };
    return { ok: true, pl, x };
  }
  const wc = winCtx(); // ブロックの あと：こうげきしてくる てき（attackers）も ねらえる
  if (d.tgt && d.apply) return needsTargets(d.tgt, wc) ? { ok: true, pl, x } : { why: 'ねらえる 相手が いない' };
  if (d.modes) return d.modes.some((m) => modeOk(m, wc)) ? { ok: true, pl, x } : { why: 'いまは こうかが ない' };
  if (d.react && !d.play) { const r = d.react(s, api, wc); return r ? { ok: true, pl, r, x } : { why: 'いまは こうかが ない' }; } // てきが こうげきしてきたときの カード
  const ctx = { phase: B.phase, c, xMax: x, human: true, from, ...wc, enemyTurn: win };
  const r = d.play(s, api, ctx) || d.play(s, api, { ...ctx, phase: 3 - B.phase });
  if (!r) return { why: 'いまは こうかが ない（ねらう 相手が いない など）' };
  if (d.x && r.x) x = Math.min(r.x, x);
  return { ok: true, pl: plan(s, cost + x * mul, req, o), r, x };
}

async function doCast(c, from = 'hand') {
  const s = B.s, gc = from === 'gy' && gyCast(s, c.def);
  const d = gc?.kind === 'disturb' ? c.def.disturb.back : c.def;
  const ci = castInfo(c, from);
  if (!ci.ok) return;
  B.busy = true;
  const stop = () => { B.busy = false; render(); };
  const req = gc ? gc.req : from === 'escape' ? d.escape.req || colorsOf(d) : colorsOf(d);
  const o = { convoke: d.kw?.includes('convoke'), req2: d.req2, lifeKeep: c.conj ? 1 : 0 };
  let base = gc ? gc.cost : from === 'cmd' ? cmdCost(s, d) : costOf(s, d);
  const mul = d.xMul || 1;
  // X：いくつに するかは 自分で きめる
  let x = ci.x;
  if (d.x) { x = await numberSheet(`${ruby(info(d).name)}：X を きめる`, { min: 1, max: ci.x, value: 1, note: `コストは ${mul > 1 ? `X × ${mul}` : 'X'} ＋ ${base}${manaNote()}` }); if (x == null) return stop(); }
  // 脱出：合計の コストを マナと 墓地の ほかの カードに わける（追放は 古い ものから）。5 ＝ マナ 2 ＋ ぼち 3
  let escExile;
  if (from === 'escape') {
    const tot = d.escape.total, others = s.P.gy.length - 1;
    const hi = Math.min(others, tot - 1), lo = Math.max(0, tot - manaCount(s, o));
    escExile = lo >= hi ? hi : await numberSheet(`${ruby(info(d).name)}：ぼちから ついほうする まいすう`, { min: lo, max: hi, value: hi, note: `だっしゅつの コストは ごうけい ${tot}。${tot} ＝ マナ ＋ ぼちの ほかの カード（マナは 1つ いじょう）。ぼちの ほかの カードは ${others}まい${manaNote()}` });
    if (escExile == null) return stop();
    const v = await sheet(`<p>${tot} ＝ マナ ${tot - escExile} ＋ ぼち ${escExile}まい。ぼちの ほかの カード ${escExile}まいを ついほうして、${tot - escExile}マナで となえる。</p>`, [{ label: 'だっしゅつで となえる', value: 1, kind: 'primary' }, { label: 'やめる', value: 0 }], { title: 'だっしゅつ' });
    if (!v) return stop();
    base = tot - escExile;
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
    const v = await sheet(detail(d), [{ label: `ふつうに 使う（${base}マナ）`, value: 'n', kind: 'primary' }, { label: `${d.kickName || 'キッカー'}で 使う（${base}マナ ＋ ${d.kicker}マナ ＝ ${base + d.kicker}マナ）`, value: 'k', kind: 'primary' }, { label: 'やめる', value: null }], { title: `キッカー${manaNote()}` });
    if (!v) return stop();
    kicked = v === 'k';
  }
  let picks, mode, extra = kicked ? d.kicker : 0;
  if (d.modes) { if (!(mode = await chooseMode(d, winCtx()))) return stop(); extra += mode.extra; }
  if (d.tgt) {
    if (needsTargets(d.tgt, winCtx())) {
      picks = await pickAll(d.tgt, { ...winCtx(), card: d, x, note: d.strive ? `げきれい：2つめから 1つ ふえるごとに ＋${d.strive}マナ${manaNote()}` : '' });
      if (!picks) return stop();
      if (d.strive) extra += d.strive * (picks[0].length - 1);
    } else if (d.apply) return stop();
    else picks = d.tgt.map(() => []); // ねらえる相手が いない パーマネントは、出すだけ
  }
  // 暴動（第7弾）：出す 前に えらぶ
  if (d.riot) {
    const v = await sheet(detail(d), [{ label: 'そっこう（この ターンから こうげき）', value: 'haste', kind: 'primary' }, { label: '＋1/＋1カウンターを 1こ', value: 'ctr', kind: 'primary' }, { label: 'やめる', value: null }], { title: 'ぼうどう：どちらに する？' });
    if (!v) return stop();
    picks = [[v]];
  }
  const pl = (extra || x !== ci.x) ? await payable(base + x * mul + extra, req, o) : plan(s, base + x * mul, req, o);
  if (!pl) return stop();
  discard(s, drop);
  const run = mode ? mode.run : (d.apply && (picks || !d.tgt) ? () => d.apply(s, api, picks || [], x, { kicked }) : ci.r ? () => ci.r.run(x) : undefined); // 対象の ない キッカーの 呪文（苗木の 移住）も apply で キッカーを うけとる
  if (from === 'hand') { const perm = !(d.types || []).some((t) => t === 'instant' || t === 'sorcery'); await fx.flyCard(app().querySelector(`[data-hand="${s.P.hand.indexOf(c)}"]`), app().querySelector(perm ? '.zone.mine' : '.battle'), !perm); }
  await castCard(s, c, pl, { from, x: d.x ? x : undefined, ctr: d.x ? x : 0, run, chosen: picks || undefined, escExile, kicked });
  B.busy = false;
  if (!checkOver()) render();
}

// ---- タップしたとき ----
async function onClick(e) {
  if (B.swiped) { B.swiped = false; return; } // スワイプの おわりの タップは むし
  const b = e.target.closest('[data-act],[data-uid],[data-hand]');
  if (b?.dataset.act === 'goal' && document.getElementById('sheet').hidden) return showGoal(); // てきの ターン中も 見られる
  if (!b || (B.busy && B.mode !== 'block') || document.getElementById('sheet').hidden === false) return;
  const s = B.s;
  const t = B.tut;
  if (B.hint && b.dataset.act !== 'hintx') B.hint = null; // なにか したら ヒントは けす
  if (b.dataset.act) return t && !t.allowAct(b.dataset.act) ? toast(t.hint()) : action(b.dataset.act);
  if (b.dataset.hand != null) { const c = s.P.hand[+b.dataset.hand]; return t && !t.allowHand(c) ? toast(t.hint()) : tapHand(c); }
  const uid = +b.dataset.uid;
  const p = [...s.P.bf, ...s.E.bf].find((q) => q.uid === uid);
  if (p) return t && !t.allowPerm(p) ? toast(t.hint()) : tapPerm_(p);
}

// たたかいの とちゅうで メニューへ もどる（o.quit：{ label, note, go }。冒険は つづきが のこる、オンラインは こうさん）
// かちかた（ボスの たおしかた）を いつでも 見られる
const showGoal = () => sheet(`<p class="goal">${ruby(B.s.floor.goal(B.s))}</p>`, [{ label: 'とじる', value: 0, kind: 'primary' }], { title: `${ruby(B.floorName)}：かちかた` });

async function menu() {
  const q = B.quit || { label: 'タイトルへ もどる', note: '', go: () => {} };
  const goal = B.s.floor.goal && !B.tut?.lock;
  const v = await sheet(`<p>${esc(q.note || 'たたかいを やめて もどる？')}</p>`,
    [{ label: 'たたかいを つづける', value: 0, kind: 'primary' }, ...(goal ? [{ label: 'かちかたを 見る', value: 'goal' }] : []), { label: q.label, value: 1 }], { title: 'メニュー' });
  // かちかた：たたかいの とちゅうでも ボスの たおしかたを 見られる
  if (v === 'goal') return showGoal();
  if (!v) return;
  B.left = true;
  q.go();
}

async function action(a) {
  const s = B.s;
  if (a === 'end') return endTurn();
  if (a === 'tutnext') { B.tut?.next(); return render(); }
  if (a === 'tutread') { B.tut?.read(); return render(); }
  if (a === 'hintx') { B.hint = null; return render(); }
  if (a === 'menu') return menu();
  if (a === 'goal') return showGoal();
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
    await preTrig('attack', atk.map((x) => x.p));
    B.blocks = declareAttack(s, atk);
    B.mode = 'tricks';
    return render();
  }
  if (a === 'damage') {
    await preTrig('hit', B.atk.filter(({ p, t }) => t === 'face' && !B.blocks?.get?.(p.uid)).map((x) => x.p));
    B.busy = true;
    await fx.lunge(B.atk.map(({ p, t }) => { const bl = B.blocks?.get?.(p.uid); return { from: permEl(p.uid), to: bl ? permEl(bl.uid) : t === 'face' ? app().querySelector('[data-face]') || app().querySelector('.zone.enemy') : t?.uid ? permEl(t.uid) : app().querySelector('.zone.enemy') }; }));
    finishCombat(s, B.atk, B.blocks);
    B.mode = 'main'; B.phase = 2; B.atk = [];
    render();
    await fx.pause(s.lastCombat.length ? 700 : 0); // ダメージの 数字・ぴったり！を 見せてから
    await combatResult(s); // かった 攻撃も、けっかを 見せてから
    B.busy = false;
    if (!checkOver()) render();
    return;
  }
  if (a === 'pass') { B.winDone?.(); return; } // てきの ターンの まど：使わない
  if (a === 'blockdone') {
    const done = B.blockDone; if (!done) return; // 演出の あいだの 2どおし
    B.blockDone = null;
    await fx.lunge(B.blockAttackers.map((p) => { const bl = B.blockMap.get(p.uid); return { from: permEl(p.uid), to: bl ? permEl(bl.uid) : app().querySelector('.me-bar .life') }; }));
    B.mode = 'enemy';
    render();
    return done(new Map(B.blockMap));
  }
  if (a === 'blockauto') { B.blockMap = AI.blocks(s, B.blockAttackers); return render(); }
  if (a === 'gy') return showGy();
  if (a === 'cmd') return showCmd();
  if (a === 'brk') return showBreak();
  if (a === 'ecmd') return sheet(cmdNote(s.E, true), [{ label: 'とじる', value: 0 }], { title: 'あいての 統率者（とうそつしゃ）' });
  if (a === 'lib') return sheet(`<p class="pile-note">じゅんばんは ひみつ（色・コストの じゅんに ならべて いる）。なくなったら ぼちを まぜて もどす${reshuffleCost(s.P, true) ? `（ライフ −${reshuffleCost(s.P, true)}）` : ''}。</p>${pileList(s.P.lib)}`, [{ label: 'とじる', value: 0 }], { title: `やまふだ（のこり ${s.P.lib.length}まい）` });
  if (a === 'elib') return sheet(`<p>${esc(s.floor.id === 'pvp' ? 'あいて' : 'てき')}の やまふだは のこり <b>${s.E.lib.length}まい</b>。${s.floor.id === 'horde' ? 'たいぐんは やまふだが ライフの かわり。0まいに して、クリーチャーも いなくなれば かち。' : ''}</p>`, [{ label: 'とじる', value: 0 }], { title: 'てきの やまふだ' });
  if (a === 'egy') return sheet(pileList(s.E.gy, s.floor.id !== 'pvp'), [{ label: 'とじる', value: 0 }], { title: `${s.floor.id === 'pvp' ? 'あいて' : 'てき'}の ぼち（${s.E.gy.length}まい）` });
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
    const mv = t !== 'face' && t.def.clock && s.E.flags.lastMove;
    const res = mv ? (mv.stop ? '<b class="exact">12時で とまった！</b>' : `はり ${mv.from}時 → ${mv.to}時`) : t === 'face' ? '' : t.exact ? `<b class="exact">ぴったり！</b>${tough}` : !onBf(s, t) ? `<b>たおした</b>${tough}` : isCreature(t) ? `のこり ${pt(s, t)[1] - t.dmg}` : '';
    return `<li><span>${ruby(name)}</span><span class="eq">${ns.length > 1 ? `${ns.join(' ＋ ')} ＝ ` : ''}${sum}点</span>${res}</li>`;
  });
  return sheet(`<ul class="cres">${rows.join('')}</ul>`, [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: 'こうげきの けっか' });
}

// ---- こまった ときの ヒント（チュートリアル・ストーリー。2026-10-27）----
// 答えは 言わず「見る ところ」だけ。何も しないで 20びょう、か 同じ まちがいを 2回 したら 案内役が 一言
const IDLE_MS = 20000;
const MISS_HINT = [
  [/の マナが いる/, 'カードの 色の まると、マナの 色を くらべて みよう。同じ 色の マナが いるよ。'],
  [/マナが たりない/, 'カードの 左上の 数（コスト）と、いまの マナの 数を くらべて みよう。マナゾーンに カードを おくと 1 ふえるよ。'],
  [/ねらえる/, 'この カードは あいてを えらんで 使う。いまは ねらえる ものが いないみたい。'],
  [/こうげきの とちゅう|こうげきしてきた/, 'この カードは 使う タイミングが きまって いる。せつめいを よく 見て みよう。'],
];
function noteMiss(why) {
  if (!B.tut) return;
  B.miss = B.miss || {};
  B.miss[why] = (B.miss[why] || 0) + 1;
  if (B.miss[why] < 2) return;
  B.miss[why] = 0;
  showHint((MISS_HINT.find(([re]) => re.test(why)) || [0, 'カードの せつめいを よく 見て みよう。どんな ときに 使えるか 書いて あるよ。'])[1]);
}
function idleHint() {
  const s = B?.s;
  if (!s || s.over || B.left || !B.tut || B.mode !== 'main' || s.active !== 'P' || B.busy || !document.getElementById('sheet').hidden || B.idleTurn === s.turn) return;
  B.idleTurn = s.turn; // アイドルの ヒントは 1ターンに 1回
  const ready = readyAttackers(s).length && B.phase === 1 && !B.combatDone;
  const text = B.tut.lock ? '光（ひか）って いる ところを タップして みよう。'
    : !s.P.flags.charged && s.P.hand.length ? 'まず 手札（てふだ）の カードを 1まい マナゾーンに おいて みよう。マナが ふえるよ。'
    : s.P.hand.some((c) => castInfo(c).ok) ? '使える カードが あるよ。手札（てふだ）の カードを タップして、「出す」「使う」が おせるか 見て みよう。'
    : ready ? 'こうげきできる クリーチャーが いるよ。てきへ ひっぱって みよう。'
    : 'できる ことが なければ「ターン おわり」を おそう。';
  showHint(text);
}
function showHint(text) { B.hint = text; render(); }
const hintHtml = () => (B.hint ? `<div class="hint-pop" role="status"><b>${ruby(B.coachWho || 'ヒント')}</b><p>${ruby(B.hint)}</p><button type="button" class="hp-x" data-act="hintx" aria-label="とじる">×</button></div>` : '');

async function tapHand(c) {
  const s = B.s, d = c.def;
  const choices = [];
  if (inWindow()) { // てきの ターンの まど：インスタントを 使う（ブロックの あとは ブロッカーの 強化も）
    if (B.mode === 'defend' && isTrick(d)) { // コンバットトリック：1体なら ブロッカーを えらぶ、まとめて 強化は そのまま
      const ok = blockersNow().length > 0, pl = ok && plan(s, d.cost, colorsOf(d), { convoke: d.kw?.includes('convoke'), lifeKeep: c.conj ? 1 : 0 });
      choices.push({ label: d.trick.kind === 'mass' ? '使う（じぶんの クリーチャー みんな）' : 'ブロックしている クリーチャーに 使う', value: 'trick', kind: 'primary', disabled: !pl, note: !ok ? 'ブロックしている クリーチャーが いない' : !pl ? 'マナが たりない' : pl.life ? lifeNote(d, pl.life) : '' });
    } else {
      const ci = castInfo(c);
      if (!ci.ok && ci.why) noteMiss(ci.why);
      choices.push({ label: ci.ok && ci.pl?.life ? `ライフを ${ci.pl.life} はらって 使う` : '使う', value: 'cast', kind: 'primary', disabled: !ci.ok, note: !ci.ok ? ci.why : ci.pl?.life ? lifeNote(d, ci.pl.life) : '' });
    }
  }
  if (B.mode === 'main') {
    const ci = castInfo(c);
    if (!ci.ok && ci.why) noteMiss(ci.why);
    const verb = d.types.includes('creature') ? 'せんじょうに 出す' : '使う', lf = ci.ok && ci.pl?.life;
    // 必殺技（番外編 スターレイル）：キャラが いて 安く なった ときは ひき算を 見せる
    const less = !d.x ? Math.max(0, d.cost - costOf(s, d)) : 0; // スターレイルの 必殺技・ゼンゼロの 終結スキル・マスター・せんぎポイント など
    choices.push({ label: lf ? `ライフを ${lf} はらって ${verb}` : less ? `${verb}（${d.cost} − ${less} ＝ ${d.cost - less}マナ）` : verb, value: 'cast', kind: 'primary', disabled: !ci.ok, note: !ci.ok ? ci.why : lf ? lifeNote(d, lf) : '' });
    if (d.suspend && s.active === 'P') { const ok = !!plan(s, d.suspend.cost, d.suspend.req || []); choices.push({ label: `たいきする（${d.suspend.cost}マナ・${d.suspend.turns}ターン あとに ただで 使う）`, value: 'suspend', kind: 'primary', disabled: !ok, note: ok ? '' : 'マナが たりない' }); }
    // 出来事（カードの 下の 呪文）・授与（オーラとして つける）
    if (d.adv && !c.advDone) { const ok = !!plan(s, d.adv.cost, d.adv.req); choices.push({ label: `できごと「${ruby(d.adv.name)}」を 使う（${d.adv.cost}マナ）`, value: 'adv', kind: 'primary', disabled: !ok, note: ok ? 'あとで クリーチャーとしても 出せる' : 'マナが たりない' }); }
    if (d.bestow) { const ok = !!plan(s, d.bestow.cost, d.bestow.req || colorsOf(d)); choices.push({ label: `じゅよで クリーチャーに つける（${d.bestow.cost}マナ）`, value: 'bestow', kind: 'primary', disabled: !ok, note: ok ? '' : 'マナが たりない' }); }
    if (!s.P.flags.charged && !d.potion && !d.noCharge) choices.push({ label: 'マナゾーンに おく', value: 'charge', note: '1ターンに 1まいまで' });
  }
  if (B.mode === 'tricks') {
    const tr = d.trick || (d.bloodrush ? { kind: 'single' } : null);
    if (d.ninjutsu) choices.push(njChoice(c));
    if (d.flash && !isSpell(d) && !d.types.includes('creature')) { // 炎の 宝剣：攻撃している クリーチャー 1体に つき 1 やすい
      const ci = castInfo(c), less = Math.max(0, d.cost - costOf(s, d));
      choices.push({ label: `しゅんそくで 出す（${less ? `${d.cost} − ${less} ＝ ${d.cost - less}` : d.cost}マナ）`, value: 'cast', kind: 'primary', disabled: !ci.ok, note: ci.ok ? '' : ci.why });
    }
    if (tr || (d.modes && d.types.includes('instant'))) { // モードの ある ソーサリー（プルフォロスの 介入）は たたかいの とちゅうには 使えない
      const cost = d.bloodrush ? d.bloodrush.cost : d.cost, req = d.bloodrush ? d.bloodrush.req : colorsOf(d);
      const pl = plan(s, cost, req, { convoke: d.kw?.includes('convoke'), lifeKeep: c.conj ? 1 : 0 });
      const verb = d.bloodrush ? 'ゆうけつで 使う' : '使う';
      choices.push({ label: pl?.life ? `ライフを ${pl.life} はらって ${verb}` : verb, value: 'trick', kind: 'primary', disabled: !pl, note: !pl ? 'マナが たりない' : pl.life ? lifeNote(d, pl.life) : '' });
    }
  }
  choices.push({ label: 'とじる', value: null });
  const v = await sheet(detail(d), B.tut ? B.tut.filterChoices(c, choices) : choices);
  if (v === 'cast') return inWindow() ? windowCast(() => doCast(c)) : doCast(c);
  if (v === 'charge') { s.P.flags.charged = true; B.busy = true; await api.charge(s, c); B.busy = false; return checkOver() || render(); }
  if (v === 'suspend') { const pl = plan(s, d.suspend.cost, d.suspend.req || []); if (pl) suspendCard(s, c, pl); return render(); }
  if (v === 'trick') return inWindow() ? windowCast(() => useTrick(c)) : useTrick(c);
  if (v === 'adv') return doAdventure(c);
  if (v === 'bestow') return doBestow(c);
  if (v === 'ninja') return doNinjutsu(c);
}

async function doAdventure(c) {
  const s = B.s, a = c.def.adv;
  let run;
  if (a.tgt && a.apply) {
    if (!needsTargets(a.tgt, {})) return sheet('<p>ねらえる 相手が いない。</p>', [{ label: 'とじる', value: 0 }]);
    const picks = await pickAll(a.tgt, { card: c.def }); if (!picks) return render();
    run = () => a.apply(s, api, picks, 0);
  } else {
    const ctx = { phase: B.phase, c, human: true };
    const r = a.play?.(s, api, ctx) || a.play?.(s, api, { ...ctx, phase: 3 - B.phase });
    if (!r) return sheet('<p>いまは こうかが ない。</p>', [{ label: 'とじる', value: 0 }]);
    run = r.run;
  }
  const pl = await payable(a.cost, a.req, {}); if (!pl) return render();
  B.busy = true;
  await castAdventure(s, c, pl, run);
  B.busy = false;
  if (!checkOver()) render();
}

async function doBestow(c) {
  const s = B.s, d = c.def, b = d.bestow;
  const list = b.steal ? s.E.bf.filter((p) => api.stealable(s, p)) : s.P.bf.filter(isCreature);
  if (!list.length) return sheet(`<p>つけられる クリーチャーが いない。</p>`, [{ label: 'とじる', value: 0 }]);
  const host = await sheet(`<p>どの クリーチャーに つける？</p>`, [...list.map((p) => ({ label: targetLabel(p), value: p })), { label: 'やめる', value: null }]);
  if (!host) return render();
  const pl = await payable(b.cost, b.req || colorsOf(d), {}); if (!pl) return render();
  castBestow(s, c, pl, host);
  if (!checkOver()) render();
}

// 交代・忍術の コスト（統率領域から なら 統率者税 こみ：2 ＋ 2 ＝ 4マナ）
function njLabel(s, c) { const n = c.def.ninjutsu.cost, k = njCost(s, c); return k > n ? `${n} ＋ ${k - n} ＝ ${k}マナ` : `${n}マナ`; }
function njChoice(c) {
  const s = B.s, d = c.def, ok = !!njPlan(s, c);
  const free = B.atk.some((a) => onBf(s, a.p) && !B.blocks.get(a.p.uid) && !a.p.token);
  const less = d.cost - d.ninjutsu.cost;
  return { label: `${/^ZZ/.test(d.id) ? 'こうたい' : 'にんじゅつ'}（${njLabel(s, c)}）`, value: 'ninja', kind: 'primary', disabled: !ok || !free, note: !ok ? 'マナが たりない' : free ? `ブロックされなかった クリーチャーと 入れかえる${less > 0 ? `（ふつうに 出すより ${d.cost} − ${d.ninjutsu.cost} ＝ ${less}マナ やすい）` : ''}` : 'ブロックされなかった クリーチャーが いない' };
}
async function doNinjutsu(c) {
  const s = B.s;
  const free = B.atk.filter((a) => onBf(s, a.p) && !B.blocks.get(a.p.uid) && !a.p.token);
  const a = free.length === 1 ? free[0] : await sheet('<p>どの クリーチャーと 入れかえる？（その クリーチャーは てふだに もどる）</p>', [...free.map((x) => ({ label: targetLabel(x.p), value: x })), { label: 'やめる', value: null }]);
  if (!a) return render();
  api.ninjutsu(s, c, a);
  render();
}

async function useTrick(c) {
  const s = B.s, d = c.def;
  const tr = d.trick || { kind: 'single' };
  const cost = d.bloodrush ? d.bloodrush.cost : d.cost, req = d.bloodrush ? d.bloodrush.req : colorsOf(d);
  let target = null, mode = null;
  if (d.modes) { if (!(mode = await chooseMode(d, winCtx()))) return; }
  else if (tr.kind !== 'mass') {
    const live = B.mode === 'defend' ? blockersNow().map((p) => ({ p })) : B.atk.filter((a) => onBf(s, a.p)); // ブロックの あとは ブロッカーに
    target = await sheet('<p>どの クリーチャーに 使う？</p>', [...live.map((a) => ({ label: `${(nm(a.p))}（${power(s, a.p)}/${pt(s, a.p)[1]}）`, value: a.p })), { label: 'やめる', value: null }]);
    if (!target) return;
  }
  const pl = await payable(cost + (mode?.extra || 0), req, { convoke: d.kw?.includes('convoke'), lifeKeep: c.conj ? 1 : 0 });
  if (!pl) return;
  B.busy = true;
  const run = mode ? mode.run : (target ? () => { api.target(s, target); d.singleRun(s, api, target); } : () => d.massRun(s, api));
  if (d.bloodrush) { s.P.hand.splice(s.P.hand.indexOf(c), 1); s.P.gy.push(c); pay(s, pl); run(); }
  else castCard(s, c, pl, { run });
  B.busy = false;
  render();
}

// ゼンゼロの ブレイク：ゲージを タップ → せつめい。つかえる ときは 3つから えらぶ
async function showBreak() {
  const s = B.s, leg = canBreak(s), ok = s.P.brkReady > 0 && leg && B.mode === 'main' && s.active === 'P';
  const cr = s.E.bf.filter(isCreature);
  const v = await sheet(`<p>${ruby('ブレイクカウンターが 10こ たまると ブレイクが 1回 つかえる。じぶんの ターンに 3つから えらぶ。')}</p>
    <p class="what">${ruby(leg ? 'ブレイクを もつ 伝説（でんせつ）の クリーチャーが いるので つかえる。' : 'つかうには、ブレイクを もつ 伝説（でんせつ）の クリーチャーが じぶんの 場に いる ひつようが ある（たまるのは いつでも）。')}</p>
    <p class="pile-note">${ruby('たまる とき：ブレイク N の クリーチャーが てきに ダメージ（N こ）・交代（5こ）・場に いる ゼンゼロの クリーチャーの 色の きっかけ（2こ。白 ライフを えた（1ターンに 1回）・青 てきに マイナスの 修整（しゅうせい）・黒 てきに −1/−1カウンター・赤 呪文（じゅもん）や 能力（のうりょく）で ダメージ・緑 ＋1/＋1カウンター）')}</p>`, [
    { label: `ぜんたい：てきの クリーチャー ぜんぶに ${BREAK_ALL}点`, value: 'all', kind: 'primary', disabled: !ok || !cr.length },
    { label: `たんたい：てきの クリーチャー 1体に ${BREAK_ONE}点（本体なら ${BREAK_FACE}点）`, value: 'one', kind: 'primary', disabled: !ok || (!s.floor.face && !cr.length) },
    { label: 'かいしゅう：マナゾーンの カード 1まいを てふだに', value: 'mana', kind: 'primary', disabled: !ok || !s.P.mana.length },
    { label: 'とじる', value: null },
  ], { title: `ブレイク（${s.E.brk || 0}/${BREAK_AT}・つかえる ${s.P.brkReady || 0}回）` });
  if (!v) return;
  if (v === 'one') {
    const t = await sheet(`<p>どれに あてる？（クリーチャーに ${BREAK_ONE}点・本体に ${BREAK_FACE}点）</p>`, [...(s.floor.face ? [{ label: `${faceName()}（${BREAK_FACE}点）`, value: 'face' }] : []), ...cr.map((p) => ({ label: `${nm(p)}（のこり ${pt(s, p)[1] - p.dmg}）`, value: p })), { label: 'やめる', value: null }]);
    if (!t) return;
    useBreak(s, 'one', t);
  } else if (v === 'mana') {
    const c = await sheet('<p>どの カードを てふだに もどす？</p>', [...s.P.mana.map((m) => ({ label: `${ruby(info(m.def).name)}${m.tapped ? '（タップずみ）' : ''}`, value: m })), { label: 'やめる', value: null }]);
    if (!c) return;
    useBreak(s, 'mana', c);
  } else useBreak(s, 'all');
  if (!checkOver()) render();
}

// 起動型能力が いま 使えるか（能力の シートと、場の カードの わくの しるしで おなじ 判定を 使う）
function actCheck(s, p, a) {
  const cost = typeof a.cost === 'function' ? a.cost(s, p, api) : a.cost;
  const o = { exclude: a.tap || a.sac ? p : null };
  let x = 0; if (a.x) while (plan(s, cost + x + 1, a.req || [], o)) x++;
  const blocked = (a.tap && (p.tapped || (isCreature(p) && p.sick))) ? 'タップできない' : (a.monstrosity && p.monstrous) ? 'もう かいぶつ' : (a.discard && s.P.hand.length < a.discard) ? `てふだが たりない（${a.discard}まい いる）` : (a.levelUp && p.level >= p.def.levelMax) ? 'もう いちばん上の レベル' : (a.can && !a.can(s, p, api)) ? ruby(a.cantWhy || 'いまは 使えない') : (!plan(s, cost + x, a.req || [], o) || (a.x && x < 1)) ? 'マナが たりない' : '';
  const r = blocked ? null : a.levelUp ? { run: () => {} } : a.tgt ? (needsTargets(a.tgt, { src: p }) ? { tgt: true } : null) : a.play(s, p, api, inWindow() ? { phase: winPhase(), xMax: x, human: true, enemyTurn: true, ...winCtx() } : { phase: B.phase, xMax: x, human: true });
  return { cost, o, x, blocked, r };
}
// つよい 能力（宝具・戦技・エネルギー・PW の 忠誠度）は 金色、ふつうの 能力（タップ など）は 水色の わく
const bigAct = (a) => !!(a.npUse || a.spUse || a.bonUse || a.loyalty != null);
// 手札で いま 使える カード（2026-10-29）：金色の わくと「つかえる」で しらせる。tapHand で えらべる ものと おなじ 判定（castInfo は 見るだけで なにも かえない）
// チュートリアルは じぶんの 光らせかた（tut-hl）が あるので 出さない
function handMark(c) {
  const s = B.s, d = c.def;
  if (B.tut) return '';
  if (inWindow()) { // てきの ターンの まど
    if (B.busy) return '';
    if (B.mode === 'defend' && isTrick(d)) return blockersNow().length && plan(s, d.cost, colorsOf(d), { convoke: d.kw?.includes('convoke'), lifeKeep: c.conj ? 1 : 0 }) ? 'ok' : '';
    return castInfo(c).ok ? 'ok' : '';
  }
  if (B.busy || s.active !== 'P') return '';
  if (B.mode === 'main') {
    if (castInfo(c).ok) return 'ok';
    if (d.suspend && plan(s, d.suspend.cost, d.suspend.req || [])) return 'ok';
    if (d.adv && !c.advDone && plan(s, d.adv.cost, d.adv.req)) return 'ok';
    if (d.bestow && plan(s, d.bestow.cost, d.bestow.req || colorsOf(d))) return 'ok';
    return '';
  }
  if (B.mode === 'tricks') {
    if (d.ninjutsu && njPlan(s, c) && B.atk.some((a) => onBf(s, a.p) && !B.blocks.get(a.p.uid) && !a.p.token)) return 'ok';
    if (d.flash && !isSpell(d) && !d.types.includes('creature') && castInfo(c).ok) return 'ok';
    const tr = d.trick || (d.bloodrush ? { kind: 'single' } : null);
    if (tr || (d.modes && d.types.includes('instant'))) {
      const cost = d.bloodrush ? d.bloodrush.cost : d.cost, req = d.bloodrush ? d.bloodrush.req : colorsOf(d);
      if (plan(s, cost, req, { convoke: d.kw?.includes('convoke'), lifeKeep: c.conj ? 1 : 0 })) return 'ok';
    }
  }
  return '';
}
// ぼちで いま となえられる カード（フラッシュバック・降霊・だっしゅつ）の カード番号。showGy の えらべる ものと おなじ 判定
function gyUsable() {
  const s = B.s, ids = new Set();
  if (B.tut || B.busy || s.active !== 'P' || B.mode !== 'main') return ids;
  for (const c of s.P.gy) {
    if (ids.has(c.def.id)) continue;
    if ((gyCast(s, c.def) && castInfo(c, 'gy').ok) || (c.def.escape && castInfo(c, 'escape').ok)) ids.add(c.def.id);
  }
  return ids;
}
function abilityMark(s, p) {
  if (inWindow()) { // てきの ターンの まど：ブロッカーの パワー ＋N と、クリーチャーの 能力（戦技 など）
    if (B.busy || p.side !== 'P') return '';
    if (B.mode === 'defend' && blockersNow().includes(p) && (p.def.acts || []).some((a) => a.pumpP && plan(s, a.cost, a.req || []))) return 'ab';
    return actsMark(s, p);
  }
  if (s.active !== 'P') return '';
  if (B.mode === 'tricks') return p.attacking && (p.def.acts || []).some((a) => a.pumpP && plan(s, a.cost, a.req || [])) ? 'ab' : '';
  if (B.mode !== 'main') return '';
  return actsMark(s, p) || (p.def.equip && !p.attached && plan(s, equipCost(s, p), []) ? 'ab' : '');
}
// いま 使える 起動型能力が ある？（パワー ＋N は べつ）。つよい 能力なら 'ab-big'
function actsMark(s, p) {
  let m = '';
  for (const a of p.def.acts || []) {
    if (a.pumpP) continue;
    const c = actCheck(s, p, a);
    if (c.blocked || !c.r) continue;
    if (bigAct(a)) return 'ab-big';
    m = 'ab';
  }
  return m;
}
async function tapPerm_(p) {
  const s = B.s;
  if (B.mode === 'attack' && p.side === 'P') {
    if (!readyAttackers(s).includes(p)) return sheet(detail(p.def), [{ label: 'このターンは こうげきできない', value: 0 }]);
    if (B.sel.has(p.uid) && !p.def.mustAttack) { B.sel.delete(p.uid); return render(); }
    const ts = attackTargets();
    if (!ts.length) return sheet('<p>こうげきできる 相手が いない。</p>', [{ label: 'とじる', value: 0 }]);
    const fixed = { factory: '工場', clock: '時計' }[s.floor.id];
    const why = fixed && s.E.bf.some((q) => q.def.guard) ? `<p class="pile-note">番人が いる あいだは、${fixed}を こうげきできない。</p>` : '';
    const t = ts.length === 1 ? ts[0] : await sheet(`<p>${(nm(p))}（パワー ${power(s, p)}）で どこを こうげきする？</p>${why}`, [
      ...ts.map((t) => ({ label: t === 'face' ? faceName() : `${(nm(t))}${t.def.medusa ? `（ライフ ${s.E.life}・パワー ${STONE} いじょうは 石に なる）` : isCreature(t) ? `（のこり ${pt(s, t)[1] - t.dmg}）` : t.def.factory ? `（かぎ ${s.E.key}）` : t.def.clock ? `（はり ${s.E.hour}時）` : ''}`, value: t })),
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
  const win = inWindow() && p.side === 'P'; // てきの ターンの まど：クリーチャーの 能力も 使える（そうびは 自分の ターンだけ）
  if (p.side === 'P' && ((B.mode === 'main' && s.active === 'P') || win)) {
    for (const a of p.def.acts || []) {
      if (a.pumpP) continue;
      const { cost, o, x, blocked, r } = actCheck(s, p, a);
      const label = a.bonUse ? `${ruby(a.label)}（エネルギー ${s.P.bon || 0} − ${a.bonUse} ＝ ${(s.P.bon || 0) - a.bonUse}）` : a.spUse ? `${ruby(a.label)}（せんぎポイント ${spOf(s)} − 1 ＝ ${spOf(s) - 1}）` : a.npUse ? ((p.np || 0) >= 100 ? `ほうぐ（NP ${p.np} − 100 ＝ ${p.np - 100}）` : `ほうぐ（NP ${p.np || 0}。100 から つかえる）`) : a.loyalty != null ? ((ln) => `${ruby(a.label)}（ちゅうせい ${p.loy} ${ln >= 0 ? '＋' : '−'} ${Math.abs(ln)} ＝ ${p.loy + ln}）`)(a.loyalty - (p.flags.turn.pw ? 1 : 0)) : a.levelUp ? `Lvアップ（${cost}マナ）いま レベル ${p.level}` : `${a.label ? ruby(a.label) : (a.adapt ? `てきおう ${a.adapt}` : 'のうりょくを 使う')}（${a.x ? `X+${cost}` : cost}マナ${a.discard ? `・てふだを ${a.discard}まい すてる` : ''}${a.tap ? '・タップ' : ''}）`;
      choices.push({ label, value: { a, cost, o, x: a.x ? (a.tgt ? x : Math.min(r?.x ?? x, x)) : 0, r }, kind: 'primary', disabled: !!blocked || !r, note: blocked || (r ? '' : 'いまは こうかが ない') });
    }
    if (p.def.equip && !win) { const ec = equipCost(s, p); choices.push({ label: `そうびする（${ec < p.def.equip ? `${p.def.equip} − ${p.def.equip - ec} ＝ ` : ''}${ec}マナ）`, value: 'equip', kind: 'primary', disabled: !plan(s, ec, []) }); }
  }
  if (p.side === 'P' && (B.mode === 'tricks' || B.mode === 'defend')) for (const a of p.def.acts || []) if (a.pumpP) choices.push({ label: `パワー ＋${a.pumpP}（${a.cost}マナ・赤）`, value: { a, pump: true }, kind: 'primary', disabled: !plan(s, a.cost, a.req || []) || !(B.mode === 'defend' ? blockersNow().includes(p) : p.attacking) }); // こうげき中 か ブロック中の クリーチャーだけ
  choices.push({ label: 'とじる', value: null });
  const v = await sheet(`${detail(p.def, { enemy: p.side === 'E' })}${p.def.npFx && p.def.np ? `<p class="what">${esc(npNote(p))}</p>` : ''}`, choices);
  if (!v) return;
  if (win) return windowCast(() => runAct(p, v)); // まどの 中：使い終わったら つづきが あるか 見る
  return runAct(p, v);
}
// 起動型能力・そうび・パワー ＋N を 使う（tapPerm_ の シートで えらんだ あと）
async function runAct(p, v) {
  const s = B.s;
  if (v === 'equip') {
    const t = await sheet('<p>どの クリーチャーに そうびする？</p>', [...s.P.bf.filter(isCreature).map((q) => ({ label: (nm(q)), value: q })), { label: 'やめる', value: null }]);
    if (!t) return;
    pay(s, plan(s, equipCost(s, p), [])); p.attached = t.uid; p.def.onEquip?.(s, p, t, api); return render();
  }
  if (v.pump) { pay(s, plan(s, v.a.cost, v.a.req || [])); api.pump(p, v.a.pumpP, 0); return render(); }
  let picks;
  if (v.a.tgt) { picks = await pickAll(v.a.tgt, { src: p, x: v.x, card: p.def }); if (!picks) return render(); }
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
  for (const c of s.P.gy) if (gyCast(s, c.def) && B.mode === 'main') {
    const ci = castInfo(c, 'gy');
    const dis = gyCast(s, c.def).kind === 'disturb';
    choices.push({ label: dis ? `${ruby(info(c.def).name)} を 降霊（こうれい）で となえる（${ruby(c.def.disturb.back.name)}）` : `${ruby(info(c.def).name)} を フラッシュバック`, value: { c, from: 'gy' }, kind: 'primary', disabled: !ci.ok, note: ci.ok ? '' : ci.why });
  }
  const seen = new Set();
  for (const c of s.P.gy) if (c.def.escape && B.mode === 'main' && !seen.has(c.def.id)) {
    seen.add(c.def.id);
    const ci = castInfo(c, 'escape');
    choices.push({ label: `${ruby(info(c.def).name)} を だっしゅつで となえる（ごうけい ${c.def.escape.total} ＝ マナ ＋ ほかの ぼち）`, value: { c, from: 'escape' }, kind: 'primary', disabled: !ci.ok, note: ci.ok ? '' : ci.why });
  }
  choices.push({ label: 'とじる', value: null });
  const v = await sheet(pileList(s.P.gy, false, gyUsable()), choices, { title: `ぼち（${s.P.gy.length}まい）` });
  if (v) doCast(v.c, v.from);
}

// ---- スワイプ：自分の クリーチャーから 敵へ ひっぱると 攻撃先・ブロックを きめる ----
// 本体（大群の山札・エレボスのライフ）を ねらえる 階は、敵の 戦場に「本体」の 札を 出す
const attackFace = () => (['horde', 'erebos', 'pvp', 'dragon'].includes(B.s.floor.id) || ravFace()) && attackTargets().includes('face');
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
    case 'clock': return `<span class="chip hot">時計の はり ${s.E.hour}時</span>`;
    case 'dragon': return `<span class="chip hot">きんか ${s.E.gold}/${s.E.goal}まい</span><span class="chip">${s.E.flags.awake ? 'ドラゴンが おきている！' : `ドラゴンの ねむけ ${s.E.sleep}`}</span>`;
    case 'twins': return `<span class="chip hot">きょじん ${cr.filter((p) => p.def.twin).length}体</span>`;
    case 'gorgon': return `<span class="chip hot">メドゥーサの ライフ ${s.E.life}</span>`;
    default: return s.floor.status ? s.floor.status(s, api) : lib;
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
  if (p.def.dragon) return !!s.E.flags.awake;
  if (p.def.twin) return p.def.twin === s.E.flags.nextTwin;
  return !!(p.def.attacks || p.flags.mustAttack);
}
function intent() {
  const s = B.s, cr = s.E.bf.filter(isCreature);
  const out = [];
  if (s.floor.id === 'pvp') {
    const can = cr.filter((p) => !hasKw(s, p, 'defender') && !api.cant(s, p, 'cantAttack') && power(s, p) > 0);
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
  if (s.floor.id === 'clock') out.push(`チクタク：はりが 1 すすむ（いま ${s.E.hour}時）`);
  if (s.floor.id === 'dragon' && !s.E.flags.awake) out.push(`ドラゴンは ねている（ねむけ ${s.E.sleep}）`);
  if (s.floor.intent) out.push(...s.floor.intent(s, api)); // ラヴニカの 塔：階の ルール
  const atk = cr.filter(willAttack).filter((p) => !p.frozen);
  if (atk.length) out.push(`${atk.length}体で こうげき（パワー ${atk.map((p) => Math.max(0, power(s, p))).join('・')}）`);
  if (s.floor.id === 'slime' && !s.E.flags.started) out.push('さいしょの ターンは こうげきしない');
  if (s.floor.id === 'xenagos') out.push('ゼナゴスは ふえふききが 出たときだけ こうげき');
  const n = { horde: { easy: 1, normal: 1, hard: 2 }, xenagos: 1 }[s.floor.id];
  const reveal = s.floor.revealN ? s.floor.revealN(s) : s.floor.id === 'horde' ? n[s.diff] + s.E.bf.filter((p) => p.def.altar).length : s.floor.id === 'erebos' && s.phase > 1 ? (s.diff === 'easy' ? 1 : 2) : 1;
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
    case 'defend': return 'ブロックの あと：光っている インスタントや クリーチャーの 能力を 使える';
    case 'eot': return 'てきの ターンの おわり：のこった マナで 光っている インスタントや 能力（のうりょく）を 使える';
    case 'enemy': return B.s.floor.id === 'pvp' ? 'あいての ターン…' : 'てきの ターン…';
    default: return B.phase === 1 ? (B.combatDone ? 'カードを 使うか、マナゾーンに おこう' : 'カードを 使おう。クリーチャーを てきへ ひっぱると こうげき') : 'こうげきは おわり。カードを 使って、ターンを おわろう';
  }
}

function permLabel(p) {
  const s = B.s;
  if (B.mode === 'attack' && B.sel.has(p.uid)) return B.sel.get(p.uid).def?.medusa && power(s, p) >= STONE ? '!石に なる！' : `→ ${tName(B.sel.get(p.uid))}`;
  if (B.mode === 'main' && p.side === 'E' && willAttack(p) && !p.frozen) return '!つぎに こうげき';
  if (B.mode === 'tricks') {
    const a = B.atk.find((x) => x.p === p);
    if (a) { const bl = B.blocks.get(p.uid); return bl ? `ブロック：${nmText(bl)}` : `→ ${tName(a.t)}`; }
    for (const [k, v] of B.blocks) if (v === p) return 'ブロック中';
  }
  if (B.mode === 'defend' && B.winCtx) {
    const { attackers, blocks } = B.winCtx;
    if (p.side === 'E' && attackers.includes(p)) { const bl = blocks.get(p.uid); return bl ? `← ${nmText(bl)}` : 'こうげき中'; }
    for (const [, v] of blocks) if (v === p) return 'ブロック中';
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
    <small>${low && reshuffleCost(s.P, true) ? `まぜると −${reshuffleCost(s.P, true)}` : 'やまふだ'}</small></button>`;
}
// ぼち：いちばん 上の カードが 見える 山
function gravePile(side) {
  const s = B.s, gy = s[side].gy, top = gy[gy.length - 1];
  const esc2 = side === 'P' && gy.some((c) => c.def.escape);
  const ok = side === 'P' && gyUsable().size > 0; // いま ぼちから となえられる カードが ある：光らせる
  return `<button type="button" class="pile2 grave ${side === 'E' ? 'foe' : ''} ${ok ? 'ok' : ''}" data-act="${side === 'P' ? 'gy' : 'egy'}" aria-label="${side === 'P' ? '' : 'てきの '}ぼち ${gy.length}まい${ok ? '（つかえる カードが ある）' : ''}">
    <span class="gyc ${top ? (side === 'E' && s.floor.id !== 'pvp' ? 'b1-E b2-E' : band(top.def)) : 'none'} ${gy.length > 1 ? 'stack' : ''}">${top ? `<i>${ruby(info(top.def).name)}</i>` : ''}<b>${gy.length}</b></span>
    <small>${esc2 ? 'だっしゅつ' : 'ぼち'}</small></button>`;
}
// 統率者（統率者戦）：統率領域に いれば 名前と コスト（統率者税 こみ）
function cmdPile(side) {
  const S = B.s[side];
  if (!S.cmdId) return '';
  const c = S.cmd[0], def = c?.def || cmdOnBf(S)?.def;
  if (!def) return '';
  const ok = side === 'P' && !!c && !B.tut && !B.busy && B.s.active === 'P' && B.mode === 'main' && !!castInfo(c, 'cmd').ok; // いま 出せる：光らせる（showCmd と おなじ 判定）
  return `<button type="button" class="pile2 grave cmdz ${side === 'E' ? 'foe' : ''} ${ok ? 'ok' : ''}" data-act="${side === 'P' ? 'cmd' : 'ecmd'}" aria-label="${side === 'P' ? '' : 'あいての '}とうそつしゃ${ok ? '（いま 出せる）' : ''}">
    <span class="gyc ${c ? band(def) : 'none'}">${c ? `<i>${ruby(info(def).name)}</i><b>${Math.max(def.cost - (S.cmdLess || 0) + (S.cmdStep ?? 2) * (S.cmdCasts || 0), 1)}</b>` : '<b>出</b>'}</span>
    <small>${c ? 'とうそつ' : 'せんじょう'}</small></button>`;
}
const cmdOnBf = (S) => S.bf.find((p) => p.card?.id === S.cmdId);
// 統率者の せつめい：コスト ＋ 統率者税（2 × 唱えた 回数）
function cmdNote(S, enemy = false) {
  const def = S.cmd[0]?.def || cmdOnBf(S)?.def, n = S.cmdCasts || 0;
  return `${detail(def, { enemy })}<p class="what">${S.cmd.length ? `とうそつりょういきに いる。コスト ${def.cost}${S.cmdLess ? ` − ${S.cmdLess}` : ''} ＋ とうそつしゃぜい ${S.cmdStep ?? 2} × ${n} ＝ <b>${Math.max(def.cost - (S.cmdLess || 0) + (S.cmdStep ?? 2) * n, 1)}マナ</b>` : 'せんじょうに いる。墓地（ぼち）などに いく ときは、かわりに とうそつりょういきに もどる'}</p>`;
}
async function showCmd() {
  const s = B.s, c = s.P.cmd[0];
  const ci = c && B.mode === 'main' ? castInfo(c, 'cmd') : { why: c ? 'いまは 使えない' : 'せんじょうに いる' };
  const nj = c?.def.ninjutsu && B.mode === 'tricks' ? [njChoice(c)] : [];
  const v = await sheet(cmdNote(s.P), [...nj, ...(c && !nj.length ? [{ label: `となえる（${c.def.cost}${s.P.cmdLess ? ` − ${s.P.cmdLess}` : ''} ＋ ${cmdTax(s)} ＝ ${cmdCost(s, c.def)}マナ）`, value: 1, kind: 'primary', disabled: !ci.ok, note: ci.ok ? '' : ci.why }] : []), { label: 'とじる', value: 0 }], { title: '統率者（とうそつしゃ）' });
  if (v === 'ninja') return doNinjutsu(c);
  if (v) doCast(c, 'cmd');
}
// やまふだ・ぼちの 中身：おなじ カードは まとめて「×2」。じゅんばんは デッキ構築と おなじ（色 → コスト）
function pileList(cards, enemy = false, ok = new Set()) { // ok：いま となえられる カード番号（金色の わく）
  const groups = new Map();
  for (const c of cards) { const g = groups.get(c.def.id ?? c.def.name); if (g) g.n++; else groups.set(c.def.id ?? c.def.name, { def: c.def, n: 1 }); }
  const list = [...groups.values()].sort((a, b) => byColorCost(a.def, b.def));
  if (!list.length) return '<p>からっぽ</p>';
  return `<div class="mini-list">${list.map(({ def, n }) => `<div class="ml-item ${ok.has(def.id) ? 'ok' : ''}">${cardFace(def, { enemy })}${n > 1 ? `<b class="ml-n">×${n}</b>` : ''}</div>`).join('')}</div>`;
}

function render() {
  if (B.left) return; // メニューへ もどった あと
  const s = B.s;
  // キャラクターが 場に 出た：とくべつな ルールの てきは ポップアップ。「とき」が「出た」の キャラは ふきだし
  for (const p of [...s.P.bf, ...s.E.bf]) {
    const l = LORE[p.def.id];
    if (!l || B.tut?.lock) continue; // さいしょの チュートリアルでは 出さない
    if (l.rule && p.side === 'E' && !B.lore.has(`${p.def.id}:appear`)) tellLore(p, 'appear');
    else if (l.when === 'enter' && !B.lore.has(`${p.def.id}:enter`)) { B.lore.add(`${p.def.id}:enter`); speak(info(p.def).name, l.say, p.side === 'E'); }
  }
  if (!drag) clearDrag();
  B.tut?.update(s, B);
  const ready = B.mode === 'attack' ? readyAttackers(s) : [];
  const isNewPerm = (p) => B.prev?.perms && !B.prev.perms.has(p.uid);
  const perms = (side) => s[side].bf.map((p) => permFace(s, p, {
    label: permLabel(p),
    cls: [isNewPerm(p) ? 'enter' : '', B.mode === 'attack' && ready.includes(p) ? 'can' : '', B.sel.has(p.uid) && B.mode === 'attack' ? 'sel' : '', (B.mode === 'block' && side === 'E' && B.blockAttackers.includes(p)) || (B.mode === 'defend' && side === 'E' && B.winCtx?.attackers.includes(p)) ? 'attacking' : '', side === 'P' && canDrag(p) ? 'drag' : '', side === 'P' ? abilityMark(s, p) : ''].join(' '),
  })).join('') || '<p class="empty">（なにも いない）</p>';
  const face = attackFace() ? `<div class="perm face-tile" data-face="1"><span>${esc(s.floor.id === 'pvp' ? s.floor.name : ravFace() ? s.floor.faceLabel : s.floor.id === 'dragon' ? 'たからの 山' : faceName())}</span><b>${s.floor.id === 'horde' ? `やまふだ ${s.E.lib.length}` : s.floor.id === 'dragon' ? `きんか ${s.E.gold}/${s.E.goal}` : `ライフ ${s.E.life}`}</b></div>` : '';
  const untapped = s.P.mana.filter((m) => !m.tapped).length;
  const colors = { W: 0, U: 0, G: 0, R: 0, C: 0 };
  for (const m of s.P.mana) if (!m.tapped) { const c = colorsOf(m.def); if (!c.length) colors.C++; else for (const k of c) colors[k]++; }
  const last = s.logs.slice(-2).map((l) => l.replace(/^\[\d+[PE]\] /, ''));
  const typed = B.logN !== s.logs.length; B.logN = s.logs.length; // あたらしい メッセージだけ 1文字ずつ 出す（ドットの みため）
  // まえに 描いた ときから ふえた カード・かわった ライフに 印を つけて うごかす
  const pv = B.prev || { perms: null, hand: null, life: s.P.life, elife: s.E.life, gy: s.P.gy.length };
  const isNew = (set, uid) => set && !set.has(uid);
  let btns = '';
  if (B.mode === 'main') btns = `${B.phase === 1 && !B.combatDone ? '<button type="button" class="btn primary" data-act="attack">こうげきする</button>' : ''}<button type="button" class="btn" data-act="end">ターン おわり</button>`;
  if (B.mode === 'attack') btns = `<button type="button" class="btn" data-act="cancel">こうげきしない</button><button type="button" class="btn" data-act="auto">おまかせ</button><button type="button" class="btn primary" data-act="declare">こうげき！（${B.sel.size}体）</button>`;
  if (B.mode === 'tricks') btns = '<button type="button" class="btn primary" data-act="damage">ダメージ！</button>';
  if (B.mode === 'block') btns = '<button type="button" class="btn" data-act="blockauto">おまかせ</button><button type="button" class="btn primary" data-act="blockdone">ブロック けってい</button>';
  if (B.mode === 'enemy') btns = `<span class="wait">${s.floor.id === 'pvp' ? 'あいて' : 'てき'}の ターン…</span>`;
  if (inWindow()) btns = `<button type="button" class="btn primary" data-act="pass">つぎへ<small>なにも 使わない</small></button>`;
  const snap = fx.capture(app());
  app().innerHTML = `<div class="battle">
    <header class="bt-head">
      <button type="button" class="menu-btn" data-act="menu" ${B.mode === 'enemy' ? 'disabled' : ''} aria-label="メニュー"><span aria-hidden="true">≡</span></button>
      <div class="bt-title"><span class="floor">${ruby(B.floorName)}</span><span class="turn">ターン ${s.stats.playerTurns}${s.floor.id === 'pvp' ? `/${PVP_TURNS}` : ''}</span></div>
      <div class="chips">${s.floor.goal && !B.tut?.lock ? '<button type="button" class="chip goal-btn" data-act="goal">かちかた</button>' : ''}${enemyStatus()}</div>
    </header>
    ${s.over ? '' : sayBox(s.E.say)}
    <p class="intent">${B.mode === 'main' || B.mode === 'attack' ? `<b>${s.floor.id === 'pvp' ? 'あいての よてい' : 'つぎの てき'}</b>${intent().map((t) => `<span>${esc(t)}</span>`).join('')}` : ''}</p>
    <div class="erow">
      <section class="zone enemy" aria-label="てきの せんじょう">${face}${perms('E')}</section>
      <div class="piles foe">${deckPile('E')}${gravePile('E')}${cmdPile('E')}</div>
    </div>
    <button type="button" class="logline ${typed ? 'typed' : ''}" data-act="log">${last.map((l) => `<span>${ruby(l)}</span>`).join('') || '<span>たたかい スタート！</span>'}</button>
    ${B.tut?.active ? B.tut.html(ruby) : `<p class="banner">${esc(banner())}</p>`}${hintHtml()}
    <section class="zone mine" aria-label="わたしの せんじょう">${perms('P')}</section>
    <div class="me-bar">
      <span class="life ${s.P.life <= 5 ? 'low' : ''} ${s.P.life < pv.life ? 'hit' : s.P.life > pv.life ? 'heal' : ''}" role="status"><small>ライフ</small><b>${s.P.life}</b></span>
      <div class="me-mana">
        <button type="button" class="mana" data-act="mana">マナ <b>${untapped}</b>/${s.P.mana.length}${Object.entries(colors).filter(([, n]) => n).map(([k, n]) => `<i class="pip m-${k}">${n}</i>`).join('')}</button>
        ${s.P.srDeck ? `<span class="pile sp" title="せんぎポイント（みんなで 1つ）">せんぎ ${spDots(B.s)}</span>` : ''}
        ${s.P.zzDeck ? `<span class="pile sp bon" title="エネルギー（みんなで 1つ。10まで）">エネルギー <b>${s.P.bon || 0}</b>/10</span><button type="button" class="pile sp brk ${s.P.brkReady && canBreak(s) ? 'ready' : ''}" data-act="brk">${s.P.brkReady ? `ブレイク${canBreak(s) ? ' OK！' : ' まち'}${s.P.brkReady > 1 ? `×${s.P.brkReady}` : ''}` : 'ブレイク'} <b>${s.E.brk || 0}</b>/10</button>` : ''}
        ${s.P.bf.some((p) => p.def.treasure) ? `<span class="pile" title="タップして ぼちに おくと すきな 色の マナ">たからもの ${s.P.bf.filter((p) => p.def.treasure).length}</span>` : ''}
      </div>
      <div class="piles">${deckPile('P')}${gravePile('P')}${cmdPile('P')}</div>
    </div>
    ${s.P.suspended.length ? `<div class="susp">${s.P.suspended.map((x) => `<span class="chip">たいき：${ruby(info(x.c.def).name)}　あと ${x.n}</span>`).join('')}</div>` : ''}
    <div class="hand" style="--n:${s.P.hand.length}" aria-label="てふだ ${s.P.hand.length}まい">${s.P.hand.map((c, i) => `<button type="button" class="hand-slot ${isNew(pv.hand, c.uid) ? 'drawn' : ''} ${handMark(c)}" style="--i:${i};--o:${i - (s.P.hand.length - 1) / 2};--oy:${Math.abs(i - (s.P.hand.length - 1) / 2)}" data-hand="${i}" data-card="${esc(c.def.id)}">${cardFace(c.def)}${c.advDone ? '<span class="adv-done">できごと ずみ</span>' : ''}${lifeNeed(s, c) ? `<span class="life-cost" aria-label="ライフ ${lifeNeed(s, c)}で 色を はらう">♥${lifeNeed(s, c)}</span>` : ''}</button>`).join('') || '<p class="empty">てふだは ない</p>'}</div>
    <footer class="actions">${btns}</footer>
  </div>`;
  B.tut?.highlight(app());
  if (B.tut) { clearTimeout(B.idleT); B.idleT = setTimeout(idleHint, IDLE_MS); }
  // 演出：まえに 描いた ときと くらべる（ダメージの 数字・たおれた カード・ライフ）
  const now = fxState(s);
  fx.play(app(), snap, B.fxPrev, now);
  B.fxPrev = now;
  B.prev = { perms: new Set([...s.P.bf, ...s.E.bf].map((p) => p.uid)), hand: new Set(s.P.hand.map((c) => c.uid)), life: s.P.life, elife: s.E.life, gy: s.P.gy.length };
}

// 演出の ための いまの ようす：場の カードの のこりの タフネス（プレインズウォーカーは ちゅうせい）・ライフ・墓地に いった カード
function fxState(s) {
  const hp = new Map(), objs = new Map();
  for (const p of [...s.P.bf, ...s.E.bf]) {
    if (isCreature(p)) hp.set(p.uid, pt(s, p)[1] - p.dmg); else if (p.def.types?.includes('planeswalker')) hp.set(p.uid, p.loy); else continue;
    objs.set(p.uid, p);
  }
  return { hp, objs, life: s.P.life, elife: s.E.life ?? 0, gy: new Set([...s.P.gy, ...s.E.gy].map((c) => c.uid)) };
}
// 要素：場の カード（uid）
const permEl = (uid) => app().querySelector(`.perm[data-uid="${uid}"]`);

// テスト用：いまの たたかいを さわってから 描きなおす（ブラウザの しらべで 場を つくる）
export function debugBattle(fn) { if (B) { fn(B, api); render(); } }
