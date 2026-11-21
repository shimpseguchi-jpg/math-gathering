// 番外編「魔法使いの夜」（第17弾）の しくみの テスト：node tools/mytest.mjs
// 魔力カウンター・キーワードカウンター・消失と 時間カウンター・看板の 3人・空蝉・予備の 体・増殖・パック＆バトルの まほよパック
import { BY_ID, SETS, BASICS } from '../js/data/cards.js';
import { newGame, api, beginPlayerTurn, onBf, hasKw, pt, sba, proliferate, isCreature, untap } from '../js/engine/game.js';
import { foods } from '../js/data/kit.js';
import { AI, castCard, plan } from '../js/engine/ai.js';
import { pvp } from '../js/data/enemies.js';
import { GREAT3, MY_T, ALICE_MAX } from '../js/data/set17.js';
import { packsFor, PB, PB_PACKS_SPECIAL } from '../js/data/packbattle.js';
import { CARD_TEXT } from '../js/data/texts.js';
import { EMBLEMS } from '../js/data/emblems.js';

let fails = 0, n = 0;
const check = (name, ok, note = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${note ? `（${note}）` : ''}`); };
const D = (id) => BY_ID[id];
const vanillaE = { id: 'x_e', name: 'てきA', types: ['creature'], pow: 2, tou: 2, sub: [], kw: [], color: 'R', cost: 2, attacks: true };
function board(seed = 3) {
  const s = newGame({ deck: Array(20).fill(BASICS.W), floor: pvp({ deck: Array(20).fill(BASICS.R), first: 'P', life: 20 }), ai: AI, seed, log: true });
  s.P.mana = []; for (const c of 'WUKRGWUKRGWUKRG') s.P.mana.push({ ...api.card(BASICS[c]), tapped: false });
  s.E.life = 20;
  return s;
}
const put = (s, id, side = 'P') => { const p = api.enter(s, side, typeof id === 'string' ? D(id) : id); p.sick = false; return p; };
const cast = (s, id, o = {}) => { const c = api.card(D(id)); s.P.hand.push(c); for (const m of s.P.mana) m.tapped = false; const r = o.run || D(id).play?.(s, api, { phase: 1, human: true, xMax: 0 })?.run; castCard(s, c, plan(s, D(id).cost, api.colorsOf(D(id))), { run: r }); sba(s); };

// ---- セット ----
const set = SETS.find((x) => x.id === 17);
check('第17弾：55種・番外編・ID は MY01〜MY55', set && set.extra && set.cards.length === 55 && set.cards.every((d, i) => d.id === `MY${String(i + 1).padStart(2, '0')}`));
check('文が ぜんぶ ある（名前・タイプ・テキスト）', set.cards.every((d) => CARD_TEXT[d.id]?.name && CARD_TEXT[d.id]?.type));
check('レアリティ：L 5・R 9・U 22・C 19', ['L', 'R', 'U', 'C'].map((r) => set.cards.filter((d) => d.rar === r).length).join() === '5,9,22,19');
check('グレートスリーは カードに ない（トークン だけ）', !set.cards.some((d) => /巨人|月の油|猟犬/.test(d.name.replace(/（[^）]*）/g, ''))) && Object.values(GREAT3).every((d) => d.great && !d.rar));
check('本編：もんしょう「番外編 魔法使いの夜」で パックに まざる', EMBLEMS.some((e) => e.id === 'pMY' && e.fx.packExtra === 17));
const shop = packsFor(0), my = shop.find((p) => p.set === 17);
check('パック＆バトル：まほよパックが さいしょから ショップに ある（100P・55種。青子人形 MY55 も 入る）', my && my.name === 'まほよパック' && my.special && my.ids.length === 55 && my.ids.includes('MY55') && PB.pack === 100 && PB_PACKS_SPECIAL.length === 1 && packsFor(3).includes(my));

// ---- キーワードカウンター ----
{
  const s = board(), p = put(s, 'MY27');
  const a = api.addKwCounter(s, p, 'deathtouch'), b = api.addKwCounter(s, p, 'deathtouch'); api.addKwCounter(s, p, 'hexproof');
  check('キーワードカウンター：置くと その キーワードを もつ（同じ ものは 1こ まで）', a && !b && hasKw(s, p, 'deathtouch') && hasKw(s, p, 'hexproof') && !hasKw(s, p, 'flying') && p.kwc.size === 2);
  api.bounce(s, p); const q = put(s, 'MY27');
  check('キーワードカウンター：戦場を はなれると なくなる', !hasKw(s, q, 'deathtouch'));
  const e = put(s, { ...vanillaE, pow: 5, tou: 5 }, 'E'), d = put(s, 'MY28'); api.addKwCounter(s, d, 'deathtouch');
  api.damage(s, e, 1, d); sba(s);
  check('接死カウンター：1点でも たおす', !onBf(s, e));
  cast(s, 'MY21', { run: () => D('MY21').apply(s, api, [[q]]) });
  check('ルーン「エイワズ」：＋1/＋1カウンターと 接死カウンター', q.ctr === 1 && hasKw(s, q, 'deathtouch'));
  cast(s, 'MY41', { run: () => D('MY41').apply(s, api, [[q]]) });
  check('工房の 結界：呪禁カウンター', hasKw(s, q, 'hexproof'));
  s.swapped = false; const sh = (() => { api.swapSides(s); const r = api.shielded(s, s.E.bf.find((x) => x.uid === q.uid)); api.swapSides(s); return r; })();
  check('呪禁カウンター：あいての 番（入れかえた とき）に ねらわれない', sh === true);
}
// ---- 青崎青子 ----
{
  const s = board(), a = put(s, 'MY01'), e1 = put(s, vanillaE, 'E'), e2 = put(s, { ...vanillaE, name: 'てきB', tou: 1, pow: 1 }, 'E');
  cast(s, 'MY27'); // クリーチャーの 呪文
  check('青子：クリーチャーの 呪文では うたない', a.mp === 0 && s.E.life === 20 && e1.dmg === 0 && onBf(s, e2));
  cast(s, 'MY39');
  check('青子：クリーチャーでない 呪文を 唱えると 1点（AI は たおせる あいて）→ 魔力カウンター 1こ', !onBf(s, e2) && a.mp === 1, `mp ${a.mp}`);
  cast(s, 'MY37'); cast(s, 'MY39');
  check('青子：ダメージを あたえるたび 1こ（3回で 3こ）', a.mp === 3, `mp ${a.mp} life ${s.E.life} dmg ${e1.dmg}`);
  const act = D('MY01').acts[0];
  check('マジックガンナー：カウンターが あれば つかえる', act.can(s, a) === true && act.tgt[0].divide(s, a) === 3);
  const life0 = s.E.life; e1.dmg = 0;
  act.apply(s, api, [[{ t: e1, n: 2 }, { t: 'face', n: 1 }]], 0, a); sba(s);
  check('マジックガンナー：ぜんぶ 取りのぞいて、その 数（3）を 割り振る（2 ＋ 1）。あたえた ダメージで また たまる（2こ）', !onBf(s, e1) && s.E.life === life0 - 1 && a.mp === 2 && act.can(s, a) === false, `mp ${a.mp} life ${s.E.life}`);
  // 人：あいてを えらぶ（aimQ）
  const s2 = board(), a2 = put(s2, 'MY01'); put(s2, vanillaE, 'E'); s2.ai = { ...s2.ai, aim: true };
  cast(s2, 'MY39');
  check('青子（人）：呪文の あと、あいてを えらぶ 順番まちに 入る（1つ）', s2.aimQ?.length === 1 && s2.aimQ[0].src === a2.uid && a2.mp === 0);
  s2.aimQ.shift().apply(s2, api, [['face']], a2);
  check('青子（人）：えらんだ あいて（敵）に 1点・魔力カウンター 1こ', s2.E.life === 19 && a2.mp === 1);
  cast(s2, 'MY39'); D('MY01').combatStart(s2, a2, api);
  check('青子（人）：えらぶ まえに 戦闘が はじまったら 自動で うつ', !s2.aimQ.length && a2.mp === 2);
  const s3 = board(), a3 = put(s3, 'MY01'); cast(s3, 'MY36');
  check('第五魔法『青』：青子が いると 3まい 引いて 魔力カウンター ＋3（呪文の 1点と あわせて 4こ）', a3.mp === 4, `mp ${a3.mp}`);
  const s4 = board(), a4 = put(s4, 'MY01'); a4.mp = 5; put(s4, vanillaE, 'E');
  const r = act.play(s4, a4, api, { phase: 1 }); r.run(); sba(s4);
  check('マジックガンナー（AI）：たおせる あいてを たおして、のこりは 敵へ', s4.E.bf.length === 0 && s4.E.life === 17 && a4.flags.turn.gun, `life ${s4.E.life}`);
}
// ---- 久遠寺有珠 ----
{
  const seen = new Set();
  for (let k = 0; k < 3; k++) {
    const s = board(), al = put(s, 'MY02'); s.rng = () => (k + 0.5) / 3;
    api.token(s, 'P', MY_T.bird, ALICE_MAX - 1);
    const before = al.mp;
    api.token(s, 'P', MY_T.bird, 1); sba(s);
    const g = s.P.bf.filter((p) => p.def.great);
    seen.add(g[0]?.def.id);
    if (k === 0) check('有珠：トークンが 出るたび 1こ（4体で 4こ）。5こめで ぜんぶ 取りのぞいて グレートスリー', before === 4 && g.length === 1 && g[0].def.id === 't_thames' && pt(s, g[0]).join('/') === '8/8' && hasKw(s, g[0], 'trample') && al.mp === 1, `mp ${al.mp}`);
    if (k === 1) { const b = s.P.bf.find((p) => p.def.id === 't_mukudori'); check('月の油：ほかの トークンは ＋2/＋2（椋鳥 1/1 → 3/3）で 警戒と 絆魂。じぶんは 2/2 で もたない。トークンで ない ものも もたない', g[0].def.id === 't_flat' && pt(s, b).join('/') === '3/3' && hasKw(s, b, 'vigilance') && hasKw(s, b, 'lifelink') && pt(s, g[0]).join('/') === '2/2' && !hasKw(s, g[0], 'vigilance') && !hasKw(s, g[0], 'lifelink') && !hasKw(s, al, 'lifelink') && /警戒.*絆魂/.test(g[0].def.textOver.replace(/（[^）]*）/g, ''))); }
    if (k === 2) check('薔薇の猟犬：3体 出る（3体 そろって 6/6・呪禁）。有珠は 墓地へ', g.length === 3 && g.every((p) => pt(s, p).join('/') === '6/6' && hasKw(s, p, 'hexproof')) && !onBf(s, al) && s.P.gy.some((c) => c.def.id === 'MY02'));
  }
  check('グレートスリーは 3しゅるいとも 出る（ランダム）', seen.size === 3);
  const s = board(), al = put(s, 'MY02'); api.token(s, 'E', MY_T.bird, 2); put(s, 'MY27');
  check('有珠：あいての トークン・トークンでない クリーチャーでは たまらない', al.mp === 0);
  put(s, 'MY10');
  check('シックス・スィング・チョコレイト：椋鳥 2体 → 有珠に 2こ', al.mp === 2 && s.P.bf.filter((p) => p.def.id === 't_mukudori_c').length === 2);
}
// ---- 静希草十郎（消失・時間カウンター）----
{
  const s = board(), p = put(s, 'MY03');
  check('草十郎：消失 3（時間カウンター 3こで 出る）', p.time === 3 && D('MY03').vanishing === 3);
  proliferate(s);
  check('増殖：時間カウンターも 1こ ふえる（3 → 4）', p.time === 4); p.time = 3;
  const picks = ['hexproof', 'ctr', 'deathtouch']; let asked = 0;
  s.ai = { ...s.ai, choose: async (ss, title, opts) => { asked++; return picks.shift(); } };
  await D('MY03').upkeep(s, p, api);
  check('草十郎（人）：取りのぞく たびに 3つから えらぶ（呪禁カウンター）', asked === 1 && p.time === 2 && hasKw(s, p, 'hexproof') && !hasKw(s, p, 'deathtouch') && p.ctr === 0);
  await D('MY03').upkeep(s, p, api);
  check('草十郎（人）：＋1/＋1カウンター', p.time === 1 && p.ctr === 1 && pt(s, p).join('/') === '4/4');
  await D('MY03').upkeep(s, p, api);
  check('草十郎：3こめを 取りのぞくと 墓地へ', asked === 3 && !onBf(s, p) && s.P.gy.some((c) => c.def.id === 'MY03'));
  const s2 = board(), q = put(s2, 'MY03');
  D('MY03').upkeep(s2, q, api); D('MY03').upkeep(s2, q, api);
  check('草十郎（AI）：接死 → 呪禁 の じゅん', hasKw(s2, q, 'deathtouch') && hasKw(s2, q, 'hexproof') && q.time === 1 && onBf(s2, q));
  const egg = put(s2, 'MY08'), e = put(s2, vanillaE, 'E');
  D('MY08').upkeep(s2, egg, api); const mid = onBf(s2, egg); D('MY08').upkeep(s2, egg, api); sba(s2);
  check('スクラッチ・ダンプティ：消失 2。0こで 落ちて、敵の クリーチャー ぜんぶに 2点', egg && mid && !onBf(s2, egg) && !onBf(s2, e));
}
// ---- 橙子・人形・空蝉 ----
{
  const s = board(), t = put(s, 'MY04');
  check('橙子：出たとき 人形 2体', s.P.bf.filter((p) => p.def.id === 't_ningyo').length === 2);
  D('MY04').upkeep(s, t, api);
  api.destroy(s, t); sba(s);
  const back = s.P.bf.find((p) => p.def.id === 'MY04');
  check('橙子：死亡したら 人形 1体を 墓地に 置いて もどる（人形は 3 − 1 ＝ 2体。もどった ときは ふえない）', !!back && back !== t && s.P.bf.filter((p) => p.def.id === 't_ningyo').length === 2 && !s.P.gy.some((c) => c.def.id === 'MY04'));
  for (const d of s.P.bf.filter((p) => p.def.id === 't_ningyo')) api.leave(s, d, 'gy'); api.destroy(s, back); sba(s);
  check('橙子：人形が いなければ もどらない', !s.P.bf.some((p) => p.def.id === 'MY04') && s.P.gy.some((c) => c.def.id === 'MY04'));
  const s2 = board(), r = put(s2, 'MY09'), m = put(s2, 'MY25'), b = api.token(s2, 'P', MY_T.bird, 1)[0];
  api.destroy(s2, b); sba(s2);
  check('空蝉：トークンの 身代わりには ならない', onBf(s2, r) && !onBf(s2, b));
  api.damage(s2, m, 9, null); sba(s2);
  check('空蝉：ほかの クリーチャーが 死亡するなら、かわりに ロビンが 墓地へ → 手札に もどる', onBf(s2, m) && m.dmg === 0 && !onBf(s2, r) && s2.P.hand.some((c) => c.def.id === 'MY09') && !s2.P.gy.some((c) => c.def.id === 'MY09'));
  const y = put(s2, 'MY17'); api.destroy(s2, y); sba(s2);
  check('予備の 人形：死亡したら 手札に もどる', s2.P.hand.some((c) => c.def.id === 'MY17'));
  const a = put(s2, 'MY18'); api.destroy(s2, a); sba(s2);
  check('自動人形：死亡したら 人形 2体', s2.P.bf.filter((p) => p.def.id === 't_ningyo').length === 2);
}
// ---- そのほか ----
{
  const s = board(), d = put(s, 'MY06'), sn = put(s, 'MY11'), h = put(s, 'MY27');
  check('夜の饗宴：ほかの プロイは ＋1/＋1（プロイで ない ものは そのまま）', pt(s, sn).join('/') === '2/2' && pt(s, h).join('/') === '2/2' && pt(s, d).join('/') === '2/3');
  put(s, 'MY52');
  check('久遠寺邸：プロイは さらに ＋1/＋1', pt(s, sn).join('/') === '3/3' && pt(s, d).join('/') === '3/4');
  const e = put(s, { ...vanillaE, pow: 3 }, 'E'); put(s, 'MY13');
  check('名無しの森：敵を ぜんぶ タップ（次も おきない）・敵は −1/−0', e.tapped && e.frozen && pt(s, e).join('/') === '2/2');
  const s2 = board(), a = put(s2, 'MY01'), al = put(s2, 'MY02'); a.mp = 2; put(s2, 'MY50'); D('MY50').upkeep(s2, s2.P.bf.find((p) => p.def.id === 'MY50'), api);
  check('魔術回路：魔力カウンターの ある クリーチャー だけ ＋1', a.mp === 3 && al.mp === 0);
  proliferate(s2);
  check('増殖：魔力カウンターも 1こ ふえる', a.mp === 4);
  const tw = [];
  for (const v of [0.1, 0.9]) { const s3 = board(); s3.rng = () => v; const e3 = put(s3, vanillaE, 'E'); const p = put(s3, 'MY07'); tw.push(v < 0.5 ? (p.ctr === 1 && e3.tapped && e3.frozen) : (hasKw(s3, p, 'flying') && s3.P.bf.some((q) => q.def.id === 't_mukudori'))); }
  check('おしゃべり双子：サイコロ 1〜3 は ブタ（＋1/＋1カウンター・敵を 止める）、4〜6 は 鳥（飛行カウンター・椋鳥）', tw.every(Boolean));
  const s4 = board(), x = put(s4, 'MY54'), at = put(s4, 'MY27'); D('MY54').onAttacks(s4, x, [{ p: at }], api);
  check('遊園地：攻撃すると 敵に 2点', s4.E.life === 18);
  const s5 = board(); const m0 = s5.P.mana.length; put(s5, 'MY53');
  check('三咲町：マナを 出せる（好きな 色）', D('MY53').mana === 'any' && !!plan(s5, m0 + 1, ['K']));
  const s6 = board(), lu = put(s6, 'MY05'), w = put(s6, vanillaE, 'E'), big = put(s6, { ...vanillaE, name: 'てきC', pow: 3, tou: 3 }, 'E');
  check('ルゥ・ベオウルフ：6/5 速攻・トランプル。パワー 2 いかには ブロックされない', pt(s6, lu).join('/') === '6/5' && hasKw(s6, lu, 'haste') && hasKw(s6, lu, 'trample') && !api.canBlock(s6, w, lu) && api.canBlock(s6, big, lu));
}
// ---- シックス・スィング・チョコレイトの 椋鳥は 食物でも ある ----
{
  const s = board(), c = put(s, 'MY10');
  const cb = s.P.bf.filter((p) => p.def.id === 't_mukudori_c');
  check('チョコレイトの 椋鳥：2体。椋鳥（1/1 飛行・プロイ）で、食物でも ある', cb.length === 2 && cb.every((p) => p.def.food && p.def.muku && p.token && pt(s, p).join('/') === '1/1' && hasKw(s, p, 'flying') && p.def.sub.includes('プロイ')) && foods(s).length === 2);
  put(s, 'MY14'); put(s, 'MY52'); D('MY52').upkeep(s, s.P.bf.find((p) => p.def.id === 'MY52'), api);
  const plainB = s.P.bf.filter((p) => p.def.id === 't_mukudori');
  check('ほかの カード（椋鳥の 群れ など）の 椋鳥は 食物では ない', plainB.length === 1 && !plainB[0].def.food && !plainB[0].def.acts && foods(s).length === 2);
  cb[0].sick = false; const fa = cb[0].def.acts[0], life0 = s.P.life;
  fa.play(s, cb[0], api, { human: true }).run(); sba(s);
  check('食物として つかう（2・タップ・墓地に 置く）：ライフ ＋3', fa.cost === 2 && fa.tap && fa.sac && !onBf(s, cb[0]) && s.P.life === life0 + 3);
  const a2 = D('MY10').acts[1];
  a2.play(s, c, api, { human: true }).run(); sba(s);
  check('MY10 の「椋鳥 1体を 墓地に 置く：ライフ ＋2」も つかえる（ふつうの 椋鳥から 先に）', s.P.life === life0 + 5 && s.P.bf.filter((p) => p.def.id === 't_mukudori').length === 0 && s.P.bf.filter((p) => p.def.id === 't_mukudori_c').length === 1);
  a2.play(s, c, api, { human: true }).run(); sba(s);
  check('チョコレイトの 椋鳥も その こうかで 墓地に 置ける（＋2）', s.P.life === life0 + 7 && !s.P.bf.some((p) => p.def.muku) && a2.can(s, c) === false);
  for (const m of s.P.mana) m.tapped = false; c.sick = false;
  D('MY10').acts[0].play(s, c, api, {}).run();
  check('MY10 の「2・タップ」で 出る 椋鳥も 食物', s.P.bf.filter((p) => p.def.id === 't_mukudori_c').length === 1 && foods(s).length === 1);
  const s2 = board(), sn = put(s2, 'MY06'); put(s2, 'MY10');
  check('チョコレイトの 椋鳥も プロイ（夜の饗宴で 2/2）', s2.P.bf.filter((p) => p.def.id === 't_mukudori_c').every((p) => pt(s2, p).join('/') === '2/2'));
}
// ---- 麻痺カウンター・青子人形（MY55）----
{
  const s = board(), e = put(s, { ...vanillaE, pow: 3, tou: 3 }, 'E'), me = put(s, 'MY27');
  api.addStun(s, e, 2);
  untap(s, e);
  check('麻痺カウンター：おきて いる クリーチャーは そのまま（カウンターは のこる）', e.stun === 2 && !e.tapped);
  e.tapped = true; untap(s, e); const a1 = [e.tapped, e.stun].join(); untap(s, e); const a2 = [e.tapped, e.stun].join(); untap(s, e);
  check('麻痺カウンター：アンタップする かわりに 1こ 取りのぞく（2こ → 2ターン おきない → 3ターンめに おきる）', a1 === 'true,1' && a2 === 'true,0' && !e.tapped && e.stun === 0, `${a1} ${a2}`);
  api.addStun(s, me, 1); proliferate(s);
  check('増殖：麻痺カウンターも 1こ ふえる', me.stun === 2);
  const d = D('MY55');
  check('青子人形：3マナ・青・アンコモン・2/2 警戒・アーティファクト・クリーチャー（人形）', d.cost === 3 && d.color === 'U' && d.rar === 'U' && d.pow === 2 && d.tou === 2 && d.kw.includes('vigilance') && d.types.join() === 'artifact,creature' && d.sub.includes('人形'));
  const s2 = board(), doll = put(s2, 'MY55'), big = put(s2, { ...vanillaE, name: '大', pow: 4, tou: 4 }, 'E'), small = put(s2, vanillaE, 'E');
  d.upkeep(s2, doll, api);
  check('青子人形：ターンの はじめに 敵 1体（AI は パワーが いちばん 大きい）と じぶんに 麻痺カウンター 1こずつ', doll.stun === 1 && big.stun === 1 && !small.stun);
  d.upkeep(s2, doll, api);
  check('青子人形（AI）：2回めは まだ 麻痺して いない 敵へ。じぶんは 2こ', doll.stun === 2 && big.stun === 1 && small.stun === 1);
  untap(s2, doll);
  check('青子人形：警戒で タップしない ので、じぶんの カウンターは へらない', doll.stun === 2 && !doll.tapped);
  const life0 = s2.E.life; d.upkeep(s2, doll, api); api.destroy(s2, doll); sba(s2);
  check('青子人形：死亡したとき、のって いた 麻痺カウンターの 数（3）の ダメージを 敵に', !onBf(s2, doll) && s2.E.life === life0 - 3, `life ${s2.E.life}`);
  const s3 = board(), doll3 = put(s3, 'MY55'), f3 = put(s3, vanillaE, 'E'); s3.ai = { ...s3.ai, aim: true };
  d.upkeep(s3, doll3, api);
  check('青子人形（人）：じぶんには すぐ 置き、敵は えらぶ 順番まちに 入る', doll3.stun === 1 && !f3.stun && s3.aimQ?.length === 1);
  s3.aimQ.shift().apply(s3, api, [[f3]], doll3);
  check('青子人形（人）：えらんだ 敵に 麻痺カウンター', f3.stun === 1);
  const s4 = board(), t4 = put(s4, 'MY04'), d4 = put(s4, 'MY55'); api.destroy(s4, t4); sba(s4);
  check('青子人形は 人形：橙子の 予備の 体に つかえる', s4.P.bf.some((p) => p.def.id === 'MY04'));
  const s5 = board(), doll5 = put(s5, 'MY55'); api.destroy(s5, doll5); sba(s5);
  check('青子人形：カウンターが 0こなら ダメージ なし', s5.E.life === 20);
}
// ---- 調整 2（2026-11-25）：スターマイン・文柄詠梨 ----
{
  const s = board(), e = put(s, { ...vanillaE, pow: 3, tou: 3 }, 'E'); cast(s, 'MY45');
  check('夜空の スターマイン：青子が いなければ 2点（3/3 は のこる）', onBf(s, e) && e.dmg === 2);
  const s2 = board(), a = put(s2, 'MY01'), e2 = put(s2, { ...vanillaE, pow: 3, tou: 3 }, 'E'), e3 = put(s2, { ...vanillaE, name: 'てきD', pow: 4, tou: 4 }, 'E'); cast(s2, 'MY45');
  check('夜空の スターマイン：青子が いれば 3点（3/3 は たおれる・4/4 に 3点 ＋ 魔弾 1点）', !onBf(s2, e2) && (!onBf(s2, e3) || e3.dmg >= 3), `dmg ${e3.dmg}`);
  const d = D('MY26');
  check('文柄詠梨：白・3マナ・2/4・アンコモン。まえの 能力（ターンの はじめの ライフ）は ない', d.color === 'W' && d.cost === 3 && d.pow === 2 && d.tou === 4 && d.rar === 'U' && !d.upkeep && !d.etb && !d.onCast);
  const s3 = board(), f = put(s3, 'MY26'), x1 = put(s3, vanillaE, 'E'), x2 = put(s3, { ...vanillaE, name: '大', pow: 5, tou: 5 }, 'E');
  d.onAttack(s3, f, api);
  check('文柄詠梨：この ターンに ライフを 回復して いなければ なにも おきない', s3.E.bf.length === 2 && d.trigTgt.when(s3, f, api) === false);
  api.gain(s3, 1); d.onAttack(s3, f, api);
  check('文柄詠梨：回復して いれば、攻撃するたび 敵の クリーチャー 1体を 追放（AI は いちばん ねらいたい 敵）', s3.E.bf.length === 1 && !onBf(s3, x2) && s3.E.exile.some((c) => c.def.name === '大') && d.trigTgt.when(s3, f, api) === true);
  const s4 = board(), f4 = put(s4, 'MY26'), y1 = put(s4, vanillaE, 'E'), y2 = put(s4, { ...vanillaE, name: '大', pow: 5, tou: 5 }, 'E');
  api.gain(s4, 2); f4.trigPick = y1; d.onAttack(s4, f4, api);
  check('文柄詠梨（人）：えらんだ 敵を 追放', !onBf(s4, y1) && onBf(s4, y2));
  s4.turn++; d.onAttack(s4, f4, api);
  check('文柄詠梨：つぎの ターンは 回復して いなければ 追放しない', onBf(s4, y2));
}
console.log(fails ? `FAILED: ${fails} / ${n}` : `ALL OK（${n}）`);
process.exit(fails ? 1 : 0);
