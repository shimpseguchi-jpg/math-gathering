// もんしょう（REQUIREMENTS 12章・docs/EMBLEMS.md）：しゅぎょうで ためた ポイントで えらぶ。どれも えらんでから 12じかん
// こうかは ぼうけん（とうの たたかい）だけ。オンライン バトルと チュートリアルには つかない
import { BASICS, boostBasic, SUN_RING, ALL_DEV } from './cards.js';

export const EMBLEM_HOURS = 12;
export const BRANCHES = [
  { id: 'basic', name: 'きほんの もんしょう', mark: '🌱' },
  { id: 'life', name: 'いのちの もんしょう', mark: '❤' },
  { id: 'start', name: 'はじまりの もんしょう', mark: '☀' },
  { id: 'exact', name: 'ぴったりの もんしょう', mark: '✦' },
  { id: 'leader', name: 'ヴァンガード', mark: '♛', one: true }, // 1つだけ えらぶ（MTG の ヴァンガード：ライフと てふだの 数が かわる ＋ のうりょく）
  // パックと いろ（2026-10-24）：パックから 出る カードを かえる。2色の カードが ばらけて デッキが くみにくい ときに
  { id: 'pack', name: 'パックの もんしょう', mark: '🎴', named: true },
  { id: 'color', name: 'いろの もんしょう', mark: '◆', named: true, max: 2 }, // 2つまで（2色 ＝ ギルドや 2色の デッキ）
];
// 旗（第6弾）：「はじめの 旗」で えらべる 10まい
export const BANNERS = ALL_DEV.filter((d) => d.banner);
const COLOR_JA = { W: '白', U: '青', K: '黒', R: '赤', G: '緑' };
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
  // パック：ぼうけんの パック（はじめの 3つと ごほうび）が かわる
  { id: 'pRand', branch: 'pack', lv: 1, cost: 1, name: 'きまぐれな いろ', text: 'ぼうけんの はじめに 1色 きまり、その 色の カードが 3ばい 出やすい', fx: { packRand: true } },
  { id: 'pUnc', branch: 'pack', lv: 1, cost: 1, name: 'アンコモン', text: 'パックに アンコモンが 1まい ふえる（8まい ＋ 1まい ＝ 9まい）', detail: 'はじめの 3パックと ごほうびパックの どれも 9まい いりに なる', fx: { packUnc: 1 } },
  { id: 'pLeg', branch: 'pack', lv: 1, cost: 3, name: 'レジェンド', text: 'レジェンドが 出る かくりつが 3ばい', detail: 'レアの わくが レジェンドに かわる かくりつ 8まいに 1まい → 8まいに 3まい', fx: { packLeg: 0.25 } },
  { id: 'pBanner', branch: 'pack', lv: 1, cost: 2, name: 'はじめの 旗（はた）', text: 'えらんだ はたを 1まい もって ぼうけんを はじめる（その 3色の デッキが くめる）', detail: 'えらぶ ときに 10まいの はたから 1つ えらぶ。はたは 4点', fx: { banner: true } },
  // 番外編パック：番外編の カードが いまの パックに まざる（docs/EXTRA.md）
  // サブセット：小さい 弾が いまの パックに まざる（ふつうの 出やすさ）
  { id: 'pRav', branch: 'pack', lv: 1, cost: 1, name: 'サブセット ラヴニカ', text: 'パックに ラヴニカの カード（50しゅるい）が まざる', detail: '10の ギルドの 2色の カード。2色の デッキが くみやすく なる', fx: { packExtra: 9 } },
  { id: 'pFlag', branch: 'pack', lv: 1, cost: 1, name: 'サブセット 三つの 旗（はた）', text: 'パックに 三つの 旗（はた）の カード（50しゅるい）が まざる', detail: '旗（はた）が あれば 3色の デッキが くめる', fx: { packExtra: 6 } },
  { id: 'pAlc', branch: 'pack', lv: 1, cost: 1, name: 'サブセット アルケミー', text: 'パックに アルケミーの カード（31しゅるい）が まざる', detail: 'デジタルだけの カード（永久（えいきゅう）・創出（そうしゅつ）・ドラフト）', fx: { packExtra: 7 } },
  { id: 'pPW', branch: 'pack', lv: 1, cost: 1, name: 'サブセット プレインズウォーカー', text: 'パックに プレインズウォーカー（5しゅるい）が まざる', detail: 'ちゅうせいを つかう つよい カード。どれも レジェンド', fx: { packExtra: 8 } },
  { id: 'pFGO', branch: 'pack', lv: 1, cost: 1, name: '番外編（ばんがいへん） Fate/Grand Order', text: 'パックに FGO の カード（70しゅるい）が まざる', detail: 'いつもの パックに サーヴァント・令呪（れいじゅ）・概念礼装（がいねんれいそう）などが 出る。宝具（ほうぐ）は NP 100 で おきる', fx: { packExtra: 10 } },
  { id: 'pHSR', branch: 'pack', lv: 1, cost: 1, name: '番外編（ばんがいへん） 崩壊（ほうかい）：スターレイル', text: 'パックに スターレイルの カード（70しゅるい）が まざる', detail: 'キャラ（ピノコニーまで）・モブ・光円錐（こうえんすい）が 出る。せんぎポイントは みんなで 1つ（5まで）', fx: { packExtra: 11 } },
  { id: 'pZZZ', branch: 'pack', lv: 1, cost: 1, name: '番外編（ばんがいへん） ゼンレスゾーンゼロ', text: 'パックに ゼンゼロの カード（80しゅるい）が まざる', detail: 'エージェント（Ver.1まで）・モブ・ボンプ・音動機（おんどうき）・終結（しゅうけつ）スキルが 出る。ブレイクを 10 ためると てきの 本体に 10点。エネルギーは みんなで 1つ（10まで）', fx: { packExtra: 12 } },
  // いろ：えらんだ 色の カードが 出やすい（2つまで。2色とも ある カードは 5ばい）
  ...Object.entries(COLOR_JA).map(([c, ja]) => ({
    id: `c${c}`, branch: 'color', lv: 1, cost: 2, name: `${ja}の いろ`, color: c,
    text: `${ja}の カードが 3ばい 出やすい`, detail: 'いろの もんしょうは 2つまで。2つ えらぶと、その 2色の カード（ギルドの カードなど）は 5ばい 出やすい', fx: { packColor: c },
  })),
];
export const EMBLEM_BY_ID = Object.fromEntries(EMBLEMS.map((e) => [e.id, e]));

// えらんで いる もんしょうの こうか → game.js の newGame（emblem）
//   life：はじめの ライフに たす。swap：デッキの カードを おきかえる（きほんカード）。hand：はじめの てふだに 足す カード
//   basicCharge：きほんカードを マナに おくと その こうかも。startMana：さいしょから マナゾーンに きほんカード。exactLife：ぴったりで たおした とき
//   handSize：てふだの まいすう（ヴァンガード）。mulligan：はじめの てふだを ひきなおせる かいすう。turnPing・turnBolster：ターンの はじめ
//   pack：パックの もんしょう（run.js の openPack）{ colors, extra：まぜる 番外編の 弾, rand, unc, leg, banner：旗の ID }
//   picks：えらんだ もの（{ pBanner: 'AB01' }）
export function emblemEffects(ids, picks = {}) {
  const fx = {}, colors = [], extra = [];
  for (const e of EMBLEMS) {
    if (!ids.includes(e.id)) continue;
    if (e.fx.packColor) { colors.push(e.fx.packColor); continue; }
    if (e.fx.packExtra) { extra.push(e.fx.packExtra); continue; }
    for (const [k, v] of Object.entries(e.fx)) fx[k] = typeof v === 'number' && k[0] !== 'v' ? Math.max(fx[k] || 0, v) : v;
  }
  const banner = fx.banner ? picks.pBanner || BANNERS[0]?.id : null;
  const pack = colors.length || extra.length || fx.packRand || fx.packUnc || fx.packLeg || banner ? { colors, extra, rand: !!fx.packRand, unc: fx.packUnc || 0, leg: fx.packLeg || 0, banner } : null;
  if (!Object.keys(fx).length && !pack) return null;
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
    pack,
  };
}
