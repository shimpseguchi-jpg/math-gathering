// もんしょう（REQUIREMENTS 12章・docs/EMBLEMS.md）：しゅぎょうで ためた ポイントで えらぶ。どれも えらんでから 12じかん
// こうかは ぼうけん（とうの たたかい）だけ。オンライン バトルと チュートリアルには つかない
import { BASICS, boostBasic, SUN_RING } from './cards.js';

export const EMBLEM_HOURS = 12;
export const BRANCHES = [
  { id: 'basic', name: 'きほんの もんしょう', mark: '🌱' },
  { id: 'life', name: 'いのちの もんしょう', mark: '❤' },
  { id: 'start', name: 'はじまりの もんしょう', mark: '☀' },
  { id: 'exact', name: 'ぴったりの もんしょう', mark: '✦' },
  { id: 'leader', name: 'ヴァンガード', mark: '♛', one: true }, // 1つだけ えらぶ（MTG の ヴァンガード：ライフと てふだの 数が かわる ＋ のうりょく）
];
// need：さきに もって いる ひつようが ある もんしょう（スキルツリー）。つよさは シミュレーションで きめた（docs/EMBLEMS.md 5章）
export const EMBLEMS = [
  { id: 'basic1', branch: 'basic', lv: 1, cost: 1, text: 'きほんカードが 1つ つよく なる', detail: '白 ライフ 2 → 3・青 うらない 1 → 2・黒 −1/−1 → −2/−2・赤 1てん → 2てん・緑 1/1 → 1/2', fx: { basic: 1 } },
  { id: 'basic2', branch: 'basic', lv: 2, cost: 2, need: 'basic1', text: 'きほんカードが 2つ つよく なり、マナに おいた ときも こうかが おきる', detail: '白 ライフ 4・青 うらない 3・黒 −3/−3・赤 3てん・緑 2/2。マナゾーンに おく たびに その こうか（あいては じどうで えらぶ）', fx: { basic: 2, basicCharge: true } },
  { id: 'life1', branch: 'life', lv: 1, cost: 1, text: 'はじめの ライフ 20 ＋ 2 ＝ 22', fx: { life: 2 } },
  { id: 'life2', branch: 'life', lv: 2, cost: 2, need: 'life1', text: 'はじめの ライフ 20 ＋ 4 ＝ 24', fx: { life: 4 } },
  { id: 'life3', branch: 'life', lv: 3, cost: 3, need: 'life2', text: 'はじめの ライフ 20 ＋ 6 ＝ 26', fx: { life: 6 } },
  { id: 'mull', branch: 'start', lv: 1, cost: 1, text: 'はじめの てふだを 1かい ひきなおせる（マリガン）', detail: 'たたかいの はじめに てふだを 見て、やまふだに もどして 5まい ひきなおせる', fx: { mulligan: 1 } },
  { id: 'start1', branch: 'start', lv: 2, cost: 1, need: 'mull', text: 'さいしょから マナゾーンに きほんカードが 1まい', detail: 'やまふだから きほんカードを 1まい さがして マナゾーンへ', fx: { startMana: 1 } },
  { id: 'start2', branch: 'start', lv: 3, cost: 3, need: 'start1', text: 'はじめの てふだに「たいようの ゆびわ」', detail: '1マナの アーティファクト。タップすると マナが 2つ 出る（てふだの 6まいめ）', fx: { ring: true } },
  { id: 'exact1', branch: 'exact', lv: 1, cost: 1, text: 'ぴったりで たおすと ライフ ＋1', fx: { exactLife: 1 } },
  { id: 'exact2', branch: 'exact', lv: 2, cost: 2, need: 'exact1', text: 'ぴったりで たおすと ライフ ＋2', fx: { exactLife: 2 } },
  // ヴァンガード：テーロスの 神。ライフと てふだの 数を たし算・ひき算で かえる ＋ ターンの はじめの のうりょく
  { id: 'vHeliod', branch: 'leader', lv: 1, cost: 2, name: 'たいようの ヘリオッド', text: 'ライフ 20 ＋ 3 ＝ 23、てふだ 5 − 1 ＝ 4まい', fx: { vLife: 3, vHand: -1 } },
  { id: 'vThassa', branch: 'leader', lv: 1, cost: 2, name: 'うみの タッサ', text: 'ターンの はじめに てきの いちばん つよい クリーチャーを タップ（ブロックできない）、ライフ 20 ＋ 2 ＝ 22', fx: { vLife: 2, turnTap: 1 } },
  { id: 'vPurphoros', branch: 'leader', lv: 1, cost: 2, name: 'かじやの パーフォロス', text: 'ターンの はじめに てきに 1てん、ライフ 20 − 2 ＝ 18', fx: { vLife: -2, turnPing: 1 } },
  { id: 'vNylea', branch: 'leader', lv: 1, cost: 2, name: 'かりの ナイレア', text: 'ターンの はじめに じぶんの クリーチャーに ＋1/＋1カウンター（こぶ1）、ライフ 20 − 2 ＝ 18', fx: { vLife: -2, turnBolster: 1 } },
];
export const EMBLEM_BY_ID = Object.fromEntries(EMBLEMS.map((e) => [e.id, e]));

// えらんで いる もんしょうの こうか → game.js の newGame（emblem）
//   life：はじめの ライフに たす。swap：デッキの カードを おきかえる（きほんカード）。hand：はじめの てふだに 足す カード
//   basicCharge：きほんカードを マナに おくと その こうかも。startMana：さいしょから マナゾーンに きほんカード。exactLife：ぴったりで たおした とき
//   handSize：てふだの まいすう（ヴァンガード）。mulligan：はじめの てふだを ひきなおせる かいすう。turnPing・turnBolster：ターンの はじめ
export function emblemEffects(ids) {
  const fx = {};
  for (const e of EMBLEMS) {
    if (!ids.includes(e.id)) continue;
    for (const [k, v] of Object.entries(e.fx)) fx[k] = typeof v === 'number' && k[0] !== 'v' ? Math.max(fx[k] || 0, v) : v;
  }
  if (!Object.keys(fx).length) return null;
  return {
    life: (fx.life || 0) + (fx.vLife || 0),
    handSize: 5 + (fx.vHand || 0),
    mulligan: fx.mulligan || 0,
    turnPing: fx.turnPing || 0,
    turnBolster: fx.turnBolster || 0,
    turnTap: fx.turnTap || 0,
    swap: fx.basic ? Object.fromEntries(Object.values(BASICS).map((d) => [d.id, boostBasic(d, fx.basic)])) : null,
    hand: fx.ring ? [SUN_RING] : [],
    basicCharge: !!fx.basicCharge,
    startMana: fx.startMana || 0,
    exactLife: fx.exactLife || 0,
  };
}
