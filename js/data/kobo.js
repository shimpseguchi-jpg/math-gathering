// カード工房（こうぼう）（2026-11-11。docs/KOBO.md）：じぶんで クリーチャーの カードを つくる
// コストと レアリティで きまる「よさん」（点）の 中で、パワー・タフネス・とくべつな 力・出たときの こうかを 買う（たし算・ひき算）
// spec ＝ { id, name, color, rar, cost, pow, tou, kw: [キーワード], etb: { k, n } | null } → makeCustom(spec) で カードの 定義（def）に なる
import { cr, hit, T } from './kit.js';
import { applyPick } from '../engine/game.js';

export const KOBO_MAX = 12; // つくって おける カードの 数
export const COST_MAX = 8, STAT_MAX = 12, NAME_MAX = 14;
// よさん：コスト × 2 ＋ 2 ＋ レアリティの ぶん。レアリティが 上がると よさんは ふえるが、デッキの 点数（キャパシティ）も 上がる（REQUIREMENTS 3.4）
export const RAR_BONUS = { C: 0, U: 1, R: 2, L: 4 };
export const RAR_PTS = { C: 1, U: 2, R: 3, L: 4 };
export const budgetOf = (spec) => spec.cost * 2 + 2 + RAR_BONUS[spec.rar];

// とくべつな 力（キーワード）：[キー, 名前（ふりがなつき）, 点, せつめい]
export const KOBO_KW = [
  ['flying', '飛行（ひこう）', 2, '飛行（ひこう）か 到達（とうたつ）の てきに しか ブロックされない'],
  ['reach', '到達（とうたつ）', 1, '飛行（ひこう）の てきを ブロックできる'],
  ['haste', '速攻（そっこう）', 1, '出した ターンに こうげき できる'],
  ['vigilance', '警戒（けいかい）', 1, 'こうげきしても タップしない'],
  ['trample', 'トランプル', 1, 'ブロックされても、あまった ダメージが 本体（ほんたい）に とどく'],
  ['lifelink', '絆魂（はんこん）', 2, 'あたえた ダメージの ぶん、ライフを 得（え）る'],
  ['first', '先制攻撃（せんせいこうげき）', 2, 'さきに ダメージを あたえる'],
  ['prowess', '果敢（かかん）', 2, 'クリーチャーで ない 呪文（じゅもん）を 唱（とな）えるたび ＋1/＋1'],
  ['deathtouch', '接死（せっし）', 3, '1点でも ダメージを あたえた クリーチャーを たおす'],
  ['double', '二段攻撃（にだんこうげき）', 5, 'ダメージを 2回 あたえる'],
  ['defender', '防衛（ぼうえい）', -2, 'こうげき できない（そのぶん 2点 もどる）'],
];
export const KW_PRICE = Object.fromEntries(KOBO_KW.map(([k, , p]) => [k, p]));
const KW_NAME = Object.fromEntries(KOBO_KW.map(([k, n]) => [k, n]));

// 出たときの こうか：k → { name, min, max, price(n), text(n, rar) }
const AIM = { // ダメージの あいて：レアリティで きまる（game.js の pickOf と おなじ）
  C: (n) => `ランダムな 敵（てき）の クリーチャー1体か 敵（てき）に ${n}点のダメージを与（あた）える。`,
  U: (n) => `たおせる なかで パワーが いちばん 大きい 敵（てき）の クリーチャー1体（いなければ 敵（てき））に ${n}点のダメージを与（あた）える。`,
  R: (n) => `クリーチャー1体か敵（てき）を対象（たいしょう）とする。それに ${n}点のダメージを与（あた）える。`,
};
const TAP_AIM = {
  C: 'ランダムな 敵（てき）の クリーチャー1体を タップする。',
  U: 'パワーが いちばん 大きい 敵（てき）の クリーチャー1体を タップする。',
  R: '敵（てき）の クリーチャー1体を対象（たいしょう）とする。それを タップする。',
};
export const KOBO_ETB = {
  life: { name: 'ライフを 得（え）る', min: 1, max: 6, price: (n) => Math.ceil(n / 2), text: (n) => `あなたは ${n}点のライフを得（え）る。` },
  dmg: { name: 'ダメージを 与（あた）える', min: 1, max: 5, price: (n) => n + 1, text: (n, rar) => (AIM[rar] || AIM.R)(n) },
  draw: { name: 'カードを 引く', min: 1, max: 2, price: (n) => n * 3, text: (n) => `カードを${n}枚（まい）引く。` },
  ctr: { name: '＋1/＋1カウンターを おく', min: 1, max: 3, price: (n) => n, text: (n) => `あなたの ほかの クリーチャー1体に ＋1/＋1カウンターを ${n}個（こ）置（お）く。` },
  token: { name: '兵士（へいし）を 出す', min: 1, max: 3, price: (n) => n * 2, text: (n) => `白の 1/1 の 兵士（へいし）・クリーチャー・トークンを ${n}体 出す。` },
  tap: { name: '敵（てき）を タップする', min: 1, max: 1, price: () => 2, text: (n, rar) => TAP_AIM[rar] || TAP_AIM.R },
};
export const etbPrice = (e) => (e && KOBO_ETB[e.k] ? KOBO_ETB[e.k].price(e.n) : 0);

// つかった 点の うちわけ：[[名前, 点]…]（たし算の 式に 出す）
export function spentParts(spec) {
  const out = [['パワー', spec.pow], ['タフネス', spec.tou]];
  for (const k of spec.kw) out.push([KW_NAME[k], KW_PRICE[k]]);
  if (spec.etb) out.push([`出たとき：${KOBO_ETB[spec.etb.k].name}`, etbPrice(spec.etb)]);
  return out;
}
export const spentOf = (spec) => spentParts(spec).reduce((t, [, p]) => t + p, 0);
export const leftOf = (spec) => budgetOf(spec) - spentOf(spec);

// 名前：しるし（<>&"' と ふりがなの きごう）は とる。NAME_MAX 字まで
export const cleanName = (t) => String(t || '').replace(/[<>&"'`\\（）《》｜\n\r\t]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
// ほぞんする まえ・よみこんだ あとに、はんいに おさめる（こわれた データでも うごく ように）
export function cleanSpec(x) {
  const rar = RAR_BONUS[x?.rar] != null ? x.rar : 'C';
  const kw = [...new Set((Array.isArray(x?.kw) ? x.kw : []).filter((k) => KW_PRICE[k] != null))];
  const e = x?.etb && KOBO_ETB[x.etb.k] ? { k: x.etb.k, n: clamp(x.etb.n, KOBO_ETB[x.etb.k].min, KOBO_ETB[x.etb.k].max) } : null;
  const color = ['W', 'U', 'K', 'R', 'G'].includes(x?.color) ? x.color : '';
  return { id: /^MY\d{1,4}$/.test(x?.id) ? x.id : 'MY0', name: cleanName(x?.name) || 'なまえの ない カード', color, rar, cost: clamp(x?.cost, 1, COST_MAX), pow: clamp(x?.pow, 0, STAT_MAX), tou: clamp(x?.tou, 1, STAT_MAX), kw, etb: e };
}
export const specOk = (spec) => leftOf(spec) >= 0 && !(spec.kw.includes('defender') && spec.kw.includes('haste'));

// カードの 文（ふりがなつき）
export function koboText(spec) {
  const kws = spec.kw.map((k) => KW_NAME[k]).join('。');
  const e = spec.etb ? `これが 戦場（せんじょう）に出たとき、${KOBO_ETB[spec.etb.k].text(spec.etb.n, spec.rar === 'L' ? 'R' : spec.rar)}` : '';
  return [kws ? `${kws}。` : '', e].filter(Boolean).join('');
}

// カードの 定義。ねらいかたは レアリティで きまる（applyPick：コモン＝ランダム、アンコモン＝いちばん 大きい、レア・レジェンド＝じぶんで えらぶ）
export function makeCustom(raw) {
  const spec = cleanSpec(raw), e = spec.etb, n = e?.n || 0;
  const x = { custom: true, pts: RAR_PTS[spec.rar], textOver: koboText(spec), typeOver: `${spec.rar === 'L' ? '伝説（でんせつ）の ' : ''}クリーチャー — じぶんの カード` };
  if (spec.rar === 'L') x.legend = true;
  if (e?.k === 'life') x.etb = (s, p, E) => { if (p.side === 'P') E.gain(s, n); };
  if (e?.k === 'draw') x.etb = (s, p, E) => { if (p.side === 'P') E.drawCard(s, n); };
  if (e?.k === 'token') x.etb = (s, p, E) => { E.token(s, p.side, T.soldier, n); };
  if (e?.k === 'dmg') {
    x.tgt = [{ side: 'E', face: true, n, label: `${n}点を あたえる 相手` }];
    x.etb = (s, p, E, o) => { if (p.side !== 'P') return; const t = o.chosen ? o.chosen[0]?.[0] : E.burnTarget(s, n, { mustHit: true })?.t; if (t) hit(s, E, t, n); };
  }
  if (e?.k === 'ctr') {
    x.tgt = [{ side: 'P', label: `＋1/＋1カウンターを ${n}こ おく クリーチャー` }];
    x.etb = (s, p, E, o) => { if (p.side !== 'P') return; const t = o.chosen ? o.chosen[0]?.[0] : E.bestBuffTarget(s, p); if (t && t !== p && E.onBf(s, t)) { E.target(s, t); E.addCounters(s, t, n); } };
  }
  if (e?.k === 'tap') {
    x.tgt = [{ side: 'E', n: 99, label: 'タップする てきの クリーチャー' }];
    x.etb = (s, p, E, o) => { if (p.side !== 'P') return; const t = o.chosen ? o.chosen[0]?.[0] : E.burnTarget(s, 99, { creatureOnly: true, mustHit: true })?.t; if (t && t !== 'face' && E.onBf(s, t)) { E.target(s, t); E.tapPerm(s, t); E.L(s, `${t.def.name} を タップ`); E.sba(s); } };
  }
  return applyPick(cr(spec.id, spec.name, spec.rar, spec.color, spec.cost, spec.pow, spec.tou, ['じぶんの カード'], [...spec.kw], x));
}
