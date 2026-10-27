// カードの 自動テスト：第3弾から あとの カードを 1まいずつ しらべる
//   node mathtcg/tools/cardtest.mjs            … ぜんぶ
//   node mathtcg/tools/cardtest.mjs SR07 ZZ13  … えらんだ カードだけ（くわしく 出す）
//   SETS=3,4 node mathtcg/tools/cardtest.mjs   … えらんだ 弾だけ
// 1. 文と データ：キーワードだけの 文が kw に あるか・「出たとき」「攻撃するたび」などの 文に うごきが あるか・P/T
// 2. うごかす：マナ 10・場と 墓地に カードが ある 盤面で
//    a. AI が 唱える → 3ターン すすめる（エラーが 出ないか・唱えられたか）
//    b. 人と おなじ ように：対象を えらんで 唱える（apply）・起動型能力を つかう（acts）
//    c. てきの デッキに 入れて、てきが つかう（オンラインバトルと おなじ）
import { BY_ID, SETS, BASICS } from '../js/data/cards.js';
import { CARD_TEXT } from '../js/data/texts.js';
import { newGame, api, isCreature, onBf, beginPlayerTurn, endPlayerTurn, enemyTurn, combatStart, declareAttack, finishCombat, sba } from '../js/engine/game.js';
import { AI } from '../js/engine/ai.js';
import { pvp } from '../js/data/enemies.js';
import { SAMPLE } from '../js/data/samples.js';
import { LORE } from '../js/data/lore.js';

const only = process.argv.slice(2);
const setIds = process.env.SETS ? process.env.SETS.split(',').map(Number) : null;
const plain = (t) => (t || '').replace(/（[ぁ-ゖー]+）/g, '');
const KW = { 飛行: 'flying', 速攻: 'haste', 警戒: 'vigilance', 到達: 'reach', 接死: 'deathtouch', 絆魂: 'lifelink', トランプル: 'trample', 先制攻撃: 'first', 二段攻撃: 'double', 防衛: 'defender', 破壊不能: 'indestructible', 召集: 'convoke', 果敢: 'prowess' };
const fnKeys = (d) => Object.keys(d).filter((k) => typeof d[k] === 'function' || (Array.isArray(d[k]) && d[k].some((x) => x && typeof x === 'object')) || (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])));
// 文 → あるはずの うごき（どれか 1つ あれば よい）。見つからなければ「しらべる」に 出す
const HOOKS = [
  [/戦場に ?出たとき|戦場に ?出るたび|出たとき/, ['etb', 'onEnter', 'onOtherEnter', 'etbFoe', 'trigTgt', 'ninjutsu', 'bestow', 'adv', 'saga', 'chapters', 'acts', 'np', 'onCast']],
  [/攻撃するたび|攻撃したとき/, ['onAttack', 'onAttacks', 'trigTgt', 'np', 'onAnyAttack', 'onHostAttack']],
  [/死亡|墓地に置かれたとき|墓地に ?いったとき/, ['onDie', 'onAnyDie', 'onOtherDie', 'onLeave', 'onDies', 'onKill', 'onOtherLeave', 'onLeaveSelf', 'saveDeath', 'doubleDeath', 'dieToBottom', 'ownDeadToBottom', 'exileEnemyDead', 'play']],
  [/(?<!次の ?)ターンの ?はじめに(?! ?アンタップしない)|アップキープ/, ['upkeep', 'onUpkeep', 'onTurn', 'growUp']],
  [/ターンの おわりに|終了ステップ/, ['endStep', 'onEnd', 'endTurn']],
  [/唱えるたび/, ['onCast', 'onAnyCast', 'magecraft', 'onSpell', 'copyAll', 'extort']],
];
const out = { err: [], kw: [], hook: [], noCast: [], pt: [], num: [], lore: [] };
const fill = (ids) => ids.map((id) => BY_ID[id]);
const enemyDeck = () => SAMPLE.RG.split(' ').map((id) => BY_ID[id]);
const B = { W: BASICS.W, U: BASICS.U, G: BASICS.G, R: BASICS.R, K: BASICS.K };
const vanilla = (c) => Object.values(BY_ID).find((d) => d.types?.includes('creature') && d.rar === 'C' && d.color === c && !fnKeys(d).length && d.pow >= 2);
const GY = ['G01', 'U02', 'W06', 'R03', 'C09'].map((id) => BY_ID[id]).filter(Boolean);

function board(d, side = 'P') {
  const s = newGame({ deck: [d, ...Array(19).fill(B.W)], floor: pvp({ deck: enemyDeck(), first: 'P', life: 20 }), ai: AI, seed: 7, log: true });
  const P = s.P;
  P.hand = [api.card(d), api.card(B.U), api.card(B.R)];
  P.lib = [...Array(15)].map((_, i) => api.card(Object.values(B)[i % 5]));
  P.mana = [];
  for (const c of 'WUKRGWUKRGWUKRG') P.mana.push({ ...api.card(B[c]), tapped: false });
  P.gy = GY.map((x) => api.card(x));
  for (const c of 'WG') { const v = vanilla(c); if (v) { const p = api.enter(s, 'P', v); if (p) p.sick = false; } }
  for (const c of 'RG') { const v = vanilla(c); if (v) api.enter(s, 'E', v); }
  s.E.life = 20;
  return s;
}
const where = (s, d) => (s.P.bf.some((p) => p.def.id === d.id) ? 'bf' : s.P.gy.some((c) => c.def.id === d.id) ? 'gy' : s.P.exile.some((c) => c.def.id === d.id) ? 'exile' : s.P.hand.some((c) => c.def.id === d.id) ? 'hand' : 'other');
const cands = (s, spec, src) => {
  let list = [];
  if (spec.side === 'mine' || spec.side === 'atk') list = s.P.bf.filter(isCreature);
  else for (const sd of spec.side === 'any' ? ['P', 'E'] : [spec.side || 'E']) list.push(...s[sd].bf.filter((p) => (spec.perm ? !p.def.factory : isCreature(p)) && p !== src));
  list = list.filter((p) => !spec.filter || spec.filter(s, api, p));
  if (spec.face) list.unshift('face');
  return list;
};
const picksFor = (s, tgt, src) => {
  const picks = [];
  for (const spec of tgt) {
    const l = cands(s, spec, src); if (!l.length && !(spec.min === 0)) return null;
    picks.push(spec.divide ? [{ t: l[0], n: spec.divide }] : l.slice(0, Math.max(1, spec.min ?? 1))); // わりふり：ぜんぶ 1つに
  }
  return picks;
};
const ran = {};
async function run(label, id, f) {
  ran[label] = (ran[label] || 0) + 1;
  try { await f(); } catch (e) { out.err.push(`${id} ${label}: ${e.message.split('\n')[0]} @ ${(e.stack.split('\n')[1] || '').trim().replace(/.*mathtcg\//, '').replace(/\)$/, '')}`); }
}
// ゲームの play() と おなじ じゅんばん（はじめの ターンは もう はじまって いる ことに する）
async function turns(s, n, enemyFirst = false) {
  if (enemyFirst) await enemyTurn(s);
  for (let i = 0; i < n && !s.over; i++) {
    beginPlayerTurn(s); if (s.over) return;
    AI.main(s, 1); if (s.over) return;
    combatStart(s); if (s.over) return;
    const atk = AI.attack(s);
    if (atk.length) { const bl = declareAttack(s, atk); AI.tricks(s, atk, bl); finishCombat(s, atk, bl); }
    if (s.over) return;
    AI.main(s, 2); if (s.over) return;
    endPlayerTurn(s); if (s.over) return;
    await enemyTurn(s);
  }
}

const cards = SETS.filter((x) => x.id >= 3 && (!setIds || setIds.includes(x.id))).flatMap((x) => x.cards).filter((d) => !only.length || only.includes(d.id));
for (const d of cards) {
  const t = plain(CARD_TEXT[d.id]?.text).replace(/「[^」]*」/g, ''); // 「」の 中は トークンの せつめい
  // 1. 文と データ
  for (const sent of t.split(/[。\n]/)) {
    const ks = sent.split(/[、・]/).map((x) => x.trim()).filter(Boolean);
    if (ks.length && ks.every((k) => KW[k]) && !d.kwFn) for (const k of ks) if (!(d.kw || []).includes(KW[k])) out.kw.push(`${d.id} ${k}`);
  }
  const have = new Set([...Object.keys(d), ...(d.kw || [])]);
  for (const [re, keys] of HOOKS) if (re.test(t) && !keys.some((k) => have.has(k))) out.hook.push(`${d.id} 「${t.match(re)[0]}」 keys=${fnKeys(d).join(',') || '-'}`);
  if (d.types?.includes('creature') && (d.pow == null || d.tou == null)) out.pt.push(d.id);
  // 2a. AI が 唱える
  await run('AI', d.id, async () => {
    const s = board(d);
    await turns(s, 3);
    if (!s.logs.some((l) => l.includes(`となえた：${d.name}`)) && !d.react && !d.counter && !d.trick && !d.ninjutsu) out.noCast.push(d.id);
    if (only.length) console.log(d.id, 'AI:', (process.env.ALL ? s.logs : s.logs.filter((l) => l.includes(d.name.split('（')[0]) || /ブレイク|せんぎ|NP/.test(l))).slice(0, 40).join('\n  '));
  });
  // 2d. 数の チェック：唱えた（出た）とき すぐの こうかで、文の 数（ダメージ・ライフ・引く）が でて いるか
  const instantFx = d.types.some((k) => k === 'instant' || k === 'sorcery') || /戦場に ?出たとき/.test(t);
  // 条件・きっかけ・起動型（「なら」「たび」「：」「―」）の 文は のぞく
  const sure = t.split(/[。\n]/).filter((x) => !/X|なら|かわりに|かぎり|たび|：|―|ランダム|好きな|わりふ|割り振/.test(x) || /^これが ?戦場に ?出たとき、[^：―]*$/.test(x) && !/X|なら|かわりに|ランダム|割り振/.test(x)).join('。');
  const want = instantFx && !/選ぶ|かわりに/.test(t) ? {
    dmg: +(sure.match(/(\d+)点の ?ダメージ/)?.[1] || 0), life: +(sure.match(/(\d+)点の ?ライフを ?得/)?.[1] || 0), draw: +(sure.match(/カードを ?(\d+)枚 ?引/)?.[1] || 0),
  } : null;
  if (want && (want.dmg || want.life || want.draw)) await run('num', d.id, () => {
    const s = board(d); s.P.hand = [api.card(d)];
    const life0 = s.P.life, lib0 = s.P.lib.length, n0 = s.logs.length;
    AI.main(s, 1);
    const i = s.logs.findIndex((l, k) => k >= n0 && l.includes(`となえた：${d.name}`)); if (i < 0) return;
    const j = s.logs.findIndex((l, k) => k > i && l.includes('となえた：')), seg = s.logs.slice(i, j < 0 ? undefined : j);
    const bad = [];
    if (want.dmg && !seg.some((l) => new RegExp(`に ${want.dmg}点`).test(l))) bad.push(`ダメージ ${want.dmg}点 が ない（${seg.filter((l) => /点/.test(l)).map((l) => l.replace(/^\[\w+\] /, '')).join('／') || 'ダメージ なし'}）`);
    if (want.life && s.P.life - life0 < want.life) bad.push(`ライフ ＋${want.life} の はず が ＋${s.P.life - life0}`);
    const drew = lib0 - s.P.lib.length; // やまふだが へった 数（引いた 数）
    if (want.draw && drew < want.draw) bad.push(`${want.draw}まい 引く はず が ${drew}まい`);
    if (bad.length) out.num.push(`${d.id} ${bad.join('、')}`);
  });
  // 2b. 人：対象を えらんで apply・起動型能力
  if (d.tgt && d.apply) await run('apply', d.id, () => { const s = board(d); const pk = picksFor(s, d.tgt); if (pk) d.apply(s, api, pk, 2); sba(s); });
  if (d.modes?.length) await run('modes', d.id, () => {
    for (const m of d.modes) { const s = board(d); const pk = m.tgt ? picksFor(s, m.tgt) : []; if (!pk) continue; if (m.apply) m.apply(s, api, pk, 2); else m.play?.(s, api, { phase: 1, human: true })?.run?.(2); sba(s); }
  });
  if (d.acts?.length) await run('acts', d.id, () => {
    const s = board(d); const p = api.enter(s, 'P', d); if (!p || !onBf(s, p)) return; p.sick = false;
    s.P.sp = 5; p.np = 200; s.P.bon = 10;
    for (const a of d.acts) {
      if (!onBf(s, p)) break;
      if (a.tgt && a.apply) { const pk = picksFor(s, a.tgt, p); if (pk) a.apply(s, api, pk, 2, p); }
      else if (a.play) { const r = a.play(s, p, api, { phase: 1, human: true }); r?.run?.(2); }
      sba(s);
    }
  });
  // 2c. てきが つかう（オンラインバトル）
  await run('enemy', d.id, async () => {
    const s = newGame({ deck: [...Array(20).fill(B.W)], floor: pvp({ deck: [...Array(6).fill(d), ...enemyDeck().slice(0, 14)], first: 'E', life: 20 }), ai: AI, seed: 3 });
    await turns(s, 4, true);
  });
}
// 3. せりふ（docs/LORE.md）：「とき」の 能力が うごいた とき ほんとうに しゃべるか（第1弾から ぜんぶ。AI で 4ターン ＋ 起動型能力）
for (const [id, l] of Object.entries(LORE)) {
  if (only.length && !only.includes(id)) continue;
  if (['enter', 'shield'].includes(l.when)) continue; // 出た：画面が 出す。ねらえない：画面の ポップアップ
  const d = BY_ID[id]; const heard = new Set();
  await run('lore', id, async () => {
    for (const seed of [7, 8, 9]) {
      const s = board(d); s.say = (p, w) => { if (p.def.id === id) heard.add(w); };
      const p = api.enter(s, 'P', d); if (p) { p.sick = false; p.np = 200; } s.P.sp = 5; s.P.bon = 10; s.rng = (() => { let x = seed; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); })();
      if (l.when === 'targeted') { const e = api.enter(s, 'E', d); BY_ID.R11?.play?.(s, api, { phase: 1 })?.run?.(); }
      if (l.when === 'act' && p) for (const a of d.acts || []) { if (!onBf(s, p)) break; if (a.tgt && a.apply) { const pk = picksFor(s, a.tgt, p); if (pk) a.apply(s, api, pk, 2, p); } else a.play?.(s, p, api, { phase: 1, human: true })?.run?.(2); }
      await turns(s, 4);
      if (heard.has(l.when)) break;
    }
  });
  if (!heard.has(l.when)) out.lore.push(`${id} 「${l.when}」で しゃべらなかった（きこえた：${[...heard].join('・') || 'なし'}）`);
}
const show = (k, title) => { if (out[k].length) console.log(`\n## ${title}（${out[k].length}）\n` + out[k].map((x) => `- ${x}`).join('\n')); };
console.log(`しらべた カード：${cards.length}（うごかした 回数：${Object.entries(ran).map(([k, v]) => `${k} ${v}`).join('・')}）`);
show('err', 'エラー');
show('kw', 'キーワードが kw に ない');
show('pt', 'P/T が ない クリーチャー');
show('hook', '文に ある きっかけの うごきが 見つからない（しらべる）');
show('num', '文の 数と うごきが あわない（しらべる）');
show('lore', 'せりふが「とき」に しゃべらなかった（しらべる）');
show('noCast', 'AI が 3ターンで 唱えなかった（しらべる）');
