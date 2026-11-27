// パック＆バトル（2026-11-17。docs/PACKBATTLE.md）：もんだいで ポイントを ためる → ショップで パックを あける → デッキを くむ → てきを 1体ずつ たおす
// ぼうけん（とう）・こうちく・次元渡りとは べつの モード。エンジン・カード・てきは そのまま つかう。ここは 数字と てきの じゅんばん だけ（画面は ui/packbattle.js）
import { pvp, FLOORS, KIT } from './enemies.js';
import { RAV_SLOTS, RAV_KIT } from './ravnica.js';
import { PB_NEW, NEW_CHARS, NEW_SIG, NEW_PAL, PB_LINES, PB_LOW } from './pbfoes.js';
import { fillDeck } from './kihon.js';
import { POOL1 } from './pool1.js';
import { SETS } from './cards.js';
import { BY_ID } from './cards.js';
import { seeded } from '../engine/rng.js';

export const PB_NAME = 'パック＆バトル';

// ---- ポイント（この モードだけの おかね。P）----
// しゅぎょうの ごほうび（ごうかく 1回で パックけん 1まい ＝ パック 1つ）に あわせた：60びょうで 10もん せいかい ≒ 100P ＝ パック 1つ
export const PB = {
  start: 200, // はじめの ポイント：すぐ パックを 2つ あけられる
  quiz: 10, // もんだい 1もん せいかい
  streakEvery: 5, streakBonus: 10, // 5もん れんぞくで せいかいする ごとに ボーナス
  pack: 100, // パック 1つ（8まい：コモン 4・アンコモン 3・レア 1。レジェンドは ときどき）
  win: 50, // てきを たおした
  boss: 100, // 段（だん）の さいごの てき（ボス）を たおした
  exact: 10, exactMax: 5, // ぴったり 1回ごと（1回の たたかいで 5回ぶんまで）
  minCards: 6, // デッキに いる カード（きほんカードは のぞく）。パック 2つで かならず とどく 数（AI の おまかせで 6〜12まい）
  deckBase: 3, deckMax: 5, // のこせる デッキの 数：はじめは 3こ。せいちょうの「デッキの わく」で 5こまで
  cap: 30, capStep: 2, // デッキの 点：はじめは 30点。せいちょうの「キャパシティ」で ＋2ずつ（40点まで）
  need: 3, // （2026-11-18 に 2回から 3回に） つぎの ステージが ひらく：ステージの ぜんいんを この 回数ずつ たおす
  anteDupe: 20, // アンティ：もう 4まい もって いる カードは ポイントに かわる
  gpWin: 1, gpStage: 3, // せいちょうポイント：かつと ＋1、ステージを クリアすると ＋3
  quizTier: [10, 15, 20], // もんだい 1もんの ポイント：ふつう・むずかしい・とても むずかしい
};

// ---- きそデッキ：はじめに 1つ もらう（さいしょから バトルに 出られる）----
// 1年生の カードプール（pool1.js）の コモン だけ。チュートリアルと おなじ 白と 緑。14まい・14点 ＋ きほんカード 6まい
// ここの カードは もちものに 入る（ほかの カードと おなじ ように、デッキの あいだで わけあえない）
export const PB_STARTER = {
  name: 'きそデッキ',
  cards: [
    'W10', 'W10', // いやしの 鷹 1/1 飛行・絆魂
    'W02', 'W02', // おともの 騎士 2/2 先制攻撃・兵士 1体
    'W03', // ニクスの 毛皮の ひつじ 0/5 防衛
    'W31', // 天の 矢 4点（ぴったり）
    'W101', // カラメトラの 祝福 ＋2/＋2
    'G01', 'G01', // 森の ちいさな エルフ（マナ）
    'G09', // 巨大化 ＋4/＋4
    'G11', 'G11', // ふみならす 大鹿の むれ 5/5 圧倒
    'C18', 'C18', // わらの 魔女 3/1
  ],
};

// もんだい：1もんの こたえで もらえる ポイント。streak は この こたえを 入れた れんぞく せいかいの 数
export const quizGain = (right, streak, tier = 0) => (right ? (PB.quizTier[tier] ?? PB.quiz) + (streak > 0 && streak % PB.streakEvery === 0 ? PB.streakBonus : 0) : 0);
// たたかい：かった ときの ポイント { base, exact, total }。stage：あいて（boss なら ボスの ポイント）
export function battleGain(stage, exact = 0) {
  const base = stage.boss ? PB.boss : PB.win;
  const ex = Math.min(PB.exactMax, Math.max(0, exact)) * PB.exact;
  return { base, exact: ex, total: base + ex };
}

// ---- ショップの パック ----
// みならいパック（1年生の カードプール：かんたんな 64しゅるい）と、出て いる 弾。ids か sets を openPack に わたす
const setPack = (x) => ({ id: `s${x.id}`, name: x.name, note: '', set: x.id, ids: x.cards.filter((d) => !d.noPack).map((d) => d.id) });
export const PB_PACKS = [
  { id: 'p1', name: 'みならいパック', note: 'ルールが かんたんな カード', ids: POOL1 },
  ...SETS.filter((x) => x.released).map(setPack),
];
// せいちょうの「パック」の 枝で ふえる パック（じゅんばんに）：三つの 旗・アルケミー・ラヴニカ（サブセット）
// 2026-11-27 まで：第3弾・第4弾・ラヴニカ。第3弾・第4弾が 出た（released）ので、さいしょから ショップに ある（PB_PACKS）。枝の 1・2ばんめは サブセットに さしかえた
// セーブは 買った 数（tree.pack ＝ 0〜3）を おぼえて いる だけ なので そのまま：まえに 買った ぶんは、あたらしい パックが その 数だけ ひらく（第3弾・第4弾は みんなに ある ので、へる ものは ない。3つめの ラヴニカは おなじ）
export const PB_PACKS_MORE = [6, 7, 9].map((id) => { const x = SETS.find((y) => y.id === id); return { ...setPack(x), name: x.name.replace(/（デジタル[^）]*（[^）]*）[^）]*）$/, '') }; });
// とくべつな パック（番外編。さいしょから 買える・PB.pack と おなじ ねだん）。これからの 番外編は 本編と ここの 両方に 入れる（2026-11-23。ユーザーの きまり）
// 2026-11-27：番外編 7つ ぜんぶ（まえは「魔法使いの夜」だけ）。ならびは 作品ごと（第1弾 → 第2弾）
const SPECIAL = [
  [10, 'FGOパック', '番外編（ばんがいへん）「Fate/Grand Order」。サーヴァントが NP を ためて 宝具（ほうぐ）を うつ'],
  [14, 'FGO 異聞帯（いぶんたい）パック', '番外編（ばんがいへん）「Fate/Grand Order」第2弾（だん）。異聞帯（いぶんたい）の 王と サーヴァント'],
  [11, 'スターレイルパック', '番外編（ばんがいへん）「崩壊（ほうかい）：スターレイル」。せんぎポイントを ためて せんぎを つかう'],
  [15, 'スターレイル 火を 追（お）う 旅（たび）パック', '番外編（ばんがいへん）「崩壊（ほうかい）：スターレイル」第2弾（だん）。追加攻撃（ついかこうげき）と 記憶（きおく）の精霊（せいれい）'],
  [12, 'ゼンゼロパック', '番外編（ばんがいへん）「ゼンレスゾーンゼロ」。エージェントの こうげきで ブレイクを ためる'],
  [16, 'ゼンゼロ 第2弾（だん）パック', '番外編（ばんがいへん）「ゼンレスゾーンゼロ」第2弾（だん）。属性異常（ぞくせいいじょう）を かさねて 紊乱（びんらん）'],
  [17, 'まほよパック', '番外編（ばんがいへん）「魔法使（まほうつか）いの夜（よる）」。カウンターを ためて つかう'],
];
export const PB_PACKS_SPECIAL = SPECIAL.map(([id, name, note]) => ({ ...setPack(SETS.find((x) => x.id === id)), name, note, special: true }));
export const packsFor = (lv = 0) => [...PB_PACKS, ...PB_PACKS_SPECIAL, ...PB_PACKS_MORE.slice(0, lv)];

// ---- ステージ（2026-11-17。まえは 28たいを じゅんばんに たおす 1本道）----
// 6つの ステージ。ステージの 中では あいてを えらべる。ぜんいんを PB.need 回ずつ たおすと つぎの ステージが ひらく
// AI の しらべ（パック 2〜32こ ぶんの カードで おまかせデッキ・100回ずつ）：みならい 81〜100%・テーロス かんたん 78〜100%・テーロス ふつう 43〜95%・
// ラヴニカ ふつう 66〜95%・ラヴニカ むずかしい 51〜91%・テーロス むずかしい 23〜85%（どれも さいごの ボスが いちばん ひくい）
// ---- キャラクター（2026-11-18）：あいては みんな、じぶんだけの デッキと たたかいかたを もつ ----
// who：なまえ、cols：色、theme：デッキの テーマ、style：たたかいかた（えらぶ 画面に 出す ことば）、line：ひとこと
// ステージ 1 の 5人：1年生の カードプールの デッキ（きほんカードで 20まいに する）。ai：こうげきの くせ（enemies.js の pvp の style。なければ いつもの AI）
// id は かった 回数を おぼえる 名前（kh1・kh2・kh3・pb1 は まえの セーブの まま）
const S1 = [
  { id: 'kh1', who: 'ゴブリンの ガブ', cols: 'R', theme: '小さい なかまを たくさん', style: 'どんどん せめる', ai: 'rush', life: 10,
    line: 'まって られない！ ぜんいん とつげきだ！', ids: ['R01', 'R01', 'R76', 'R76', 'R77', 'R77', 'C18', 'R21'] },
  { id: 'pb2', who: 'ひつじかいの メエ', cols: 'W', theme: 'まもりと かいふく', style: 'じっくり まもる', ai: 'guard', life: 12,
    line: 'あわてない、あわてない。ひつじと いっしょに まもるよ。', ids: ['W03', 'W03', 'W10', 'W10', 'C02', 'C02', 'W02', 'W101'] },
  { id: 'kh2', who: 'そらの ソラ', cols: 'U', theme: 'そらを とぶ なかま', style: 'うえから ねらう', ai: '', life: 12,
    line: 'そらの うえから しつれい！ とどくかな？', ids: ['U01', 'U01', 'U02', 'C01', 'C01', 'U14', 'U09', 'U82'] },
  { id: 'pb1', who: 'もりの モリー', cols: 'G', theme: '大きな なかま', style: '大きく そだててから', ai: 'guard', life: 12,
    line: 'ゆっくり 大きく なるよ。どーん！', ids: ['G01', 'G01', 'G11', 'G11', 'G05', 'G09', 'C18', 'C02'] },
  { id: 'kh3', who: 'テフェリーの でし ミラ', cols: 'WU', theme: 'まもって とんで、じゅもんも つかう', style: 'バランスよく', ai: '', life: 14,
    line: 'せんせいに ならった こと、ぜんぶ 見せるね。', ids: ['W02', 'U01', 'W03', 'U14', 'W19', 'U82', 'W22', 'U02', 'W02'] },
];
// ステージ 2〜6：とうの あいて（それぞれ きまった しくみで たたかう）。ラヴニカの 人は ステージ 4・5 の 2回 出て くる（5 の ほうが つよい）
// テーロスの 10人は ステージ 2・3 に 5人ずつ（1回 だけ）。ステージ 6 は あたらしい 5人（pbfoes.js）
export const PB_CHARS = {
  hydra: { who: 'ハイドラ', cols: 'G', theme: 'ふえる あたま', style: 'たおされても はえて くる', line: 'あたまを たおしても、また はえて くるぞ。' },
  clock: { who: 'からくり とけいとう', cols: '', theme: 'ちょうど 12', style: 'ぴったりを まつ', line: 'はりを ちょうど 12に とめて ごらん。' },
  horde: { who: 'ミノタウルスの たいぐん', cols: 'R', theme: 'かぞえきれない むれ', style: '数で おす', line: 'おれたちは やまほど いるぞ！' },
  dragon: { who: 'たからの 山の ドラゴン', cols: 'R', theme: 'たからを まもる', style: 'ねむって いて、足音で おきる', line: 'ぐう……だれだ、わしの きんかに さわるのは。' },
  factory: { who: 'ゴーレム工場', cols: '', theme: 'かぎの 数と ぴったり', style: 'ゴーレムを つくりつづける', line: 'かぎと 同じ 数で ないと、こわれないよ。' },
  slime: { who: 'ふえる スライム', cols: 'G', theme: 'わかれて ふえる', style: 'たおすと 半分ずつに なる', line: 'ぷるん。きっても きっても ふえるよ。' },
  twins: { who: 'ふたごの きょじん', cols: 'R', theme: 'いつも 2人 いっしょ', style: 'かたほうを つれもどす', line: 'ふたり いっしょで ないと、たおれないぞ。' },
  xenagos: { who: 'ゼナゴス', cols: 'RG', theme: 'おまつりの なかま', style: 'なかまに まもって もらう', line: 'さあ、うたげの はじまりだ！' },
  gorgon: { who: 'メドゥーサ', cols: 'KG', theme: '石の 庭', style: '大きい あいてを 石に する', line: 'つよい 子ほど、石に なるのよ。' },
  erebos: { who: '死者の神（かみ） エレボス', cols: 'K', theme: '3つの だんかい', style: 'だんだん ほんきに なる', line: 'ここまで 来るとは。ほんきを 見せよう。' },
  boros: { who: 'オレリア', cols: 'RW', theme: 'ボロスの 軍団（ぐんだん）', style: 'なかまを そろえて せめる', line: 'ぜんいん、すすめ！' },
  selesnya: { who: 'トロスターニ', cols: 'GW', theme: 'なえぎと かいふく', style: 'なえぎを ふやして ライフを もどす', line: '森は、ゆっくり そだつのです。' },
  simic: { who: 'ヴォレル', cols: 'GU', theme: 'そだつ 生きもの', style: 'カウンターで なかまを そだてる', line: 'じっけん かいし。もっと 大きく！' },
  izzet: { who: 'ニヴ＝ミゼット', cols: 'UR', theme: 'じゅもんの じっけん', style: 'じゅもんで じわじわ けずる', line: 'わしの ひらめきを 見るが よい。' },
  golgari: { who: 'ジャラド', cols: 'KG', theme: '地下（ちか）の むれ', style: 'なかまが たおれると 元気に なる', line: 'たおれても、土に かえる だけさ。' },
  azorius: { who: 'イスペリア', cols: 'WU', theme: 'きまりで しばる', style: 'まもりを かためて、きまりで しばる', line: 'きまりは きまりです。' },
  rakdos: { who: 'ラクドス', cols: 'KR', theme: 'はでな ショー', style: 'せめないと ブーイング', line: 'もっと はでに やれ！' },
  orzhov: { who: 'テイサ', cols: 'WK', theme: 'すいとる 聖堂（せいどう）', style: 'すこしずつ ライフを すいとる', line: 'おだいは、いただきますよ。' },
  gruul: { who: 'ボルボルグミ', cols: 'RG', theme: '大きな 1体', style: '1ターンで たおさないと もどる', line: 'ボルボル、つよい！' },
  dimir: { who: 'ラザーヴ', cols: 'UK', theme: 'まねっこ', style: 'きみの いちばん つよい 子を まねる', line: 'きみは……わたしかな？' },
  jace: { who: 'ジェイス', cols: 'U', theme: '10の ギルドの 力（ちから）', style: 'だんかいごとに ちがう 力', line: 'ギルドパクトの 名に おいて。' },
  ...NEW_CHARS,
  // 特別ステージ「番外編の 挑戦者たち」（2026-11-27）：番外編の カードの デッキで たたかう 8人（PB_EX。2026-11-27 に 6人 → 8人：星めぐりの 挑戦者 → 星・穹、ホロウの 挑戦者 → アキラ・リン）
  ex_touko: { who: '青崎橙子（あおざきとうこ）', cols: 'UK', theme: '人形（にんぎょう）を ならべる', style: 'たおれても 予備（よび）の 体で もどる', line: PB_LINES.ex_touko.start },
  ex_fgo: { who: 'カルデアの 挑戦者（ちょうせんしゃ）', cols: 'WU', theme: 'サーヴァントと 宝具（ほうぐ）', style: 'NP を ためて 宝具（ほうぐ）を うつ', line: PB_LINES.ex_fgo.start },
  ex_hoshi: { who: '星（ほし）', cols: 'UR', theme: 'せんぎポイントと 必殺技（ひっさつわざ）', style: 'なかまで せめて、せんぎを つかう', line: PB_LINES.ex_hoshi.start },
  ex_kyuu: { who: '穹（きゅう）', cols: 'WK', theme: '記憶（きおく）の精霊（せいれい）と 黄金裔（おうごんえい）', style: 'せんぎポイントで やすく 出し、精霊（せいれい）を つれて くる', line: PB_LINES.ex_kyuu.start },
  ex_akira: { who: 'アキラ', cols: 'WK', theme: 'エージェントと ブレイク', style: '数を ならべて いっきに せめる', line: PB_LINES.ex_akira.start },
  ex_rin: { who: 'リン', cols: 'UR', theme: '属性異常（ぞくせいいじょう）と 紊乱（びんらん）', style: '異常（いじょう）を つけて ダメージを かさねる', line: PB_LINES.ex_rin.start },
  ex_aoko: { who: '青崎青子（あおざきあおこ）', cols: 'UR', theme: '魔弾（まだん）と マジックガンナー', style: 'じゅもんを れんぱつして 魔力（まりょく）を ためる', line: PB_LINES.ex_aoko.start },
  ex_alice: { who: '久遠寺有珠（くおんじありす）', cols: 'KG', theme: 'プロイと グレートスリー', style: 'トークンを ならべて 魔力（まりょく）を 5こ ためる', line: PB_LINES.ex_alice.start },
};
// ---- きめわざ（2026-11-18）：ステージ 2〜6 の あいては、とうの デッキ（その あいて だけの チャレンジ・デッキと しくみ）に、
// キャラクターの 色・テーマの「きめわざ」の じゅもんを まぜて たたかう。しくみ（あたま・12・かぎ など）は そのまま：デッキに 足す だけ
// まい数：ふつうの あいて 2まい、ステージの ボス 3まい。こうかは 4しゅるい の くみあわせ（どの 階でも うごく もの だけ）
//   zap：きみに ダメージ／bite：きみの いちばん 小さい クリーチャーに ダメージ／bind：きみの いちばん 大きい クリーチャーを タップ（freeze なら つぎも おきない）／heal：あいての ライフが ふえる（ライフの ある あいて）
const sig = (name, fx, danger = 2) => KIT.esp(name, (s, E) => {
  if (fx.zap) E.hurt(s, fx.zap);
  if (fx.bite) { const t = KIT.weakest(s, E); if (t) E.damage(s, t, fx.bite, null); }
  if (fx.bind) { const t = KIT.biggest(s, E, (p) => !p.tapped) || KIT.biggest(s, E); if (t) { t.tapped = true; if (fx.bind > 1) t.frozen = true; } }
  if (fx.heal && typeof s.E.life === 'number') s.E.life += fx.heal;
  E.sba(s);
}, { danger, sig: true });
export const PB_SIG = {
  hydra: { text: 'きみに 1点', def: sig('ハイドラの おたけび', { zap: 1 }) },
  clock: { text: 'いちばん 大きい 子を タップ', def: sig('はりの いたずら', { bind: 1 }) },
  horde: { text: 'きみに 1点', def: sig('むれの どどう', { zap: 1 }) },
  dragon: { text: 'いちばん 小さい 子に 2点', def: sig('たからを まもる ほのお', { bite: 2 }) },
  factory: { text: 'いちばん 大きい 子を タップ', def: sig('ねじまき', { bind: 1 }) },
  slime: { text: 'いちばん 大きい 子を タップ（つぎも おきない）', def: sig('ぷるぷる がため', { bind: 2 }) },
  twins: { text: 'いちばん 小さい 子に 2点', def: sig('ふたごの じひびき', { bite: 2 }) },
  xenagos: { text: 'きみに 1点', def: sig('うたげの たいこ', { zap: 1 }) },
  gorgon: { text: 'いちばん 大きい 子を タップ（つぎも おきない）', def: sig('石の 庭の かぜ', { bind: 2 }) },
  erebos: { text: 'きみに 2点', def: sig('エレボスの むち', { zap: 2 }, 3) },
  boros: { text: 'いちばん 小さい 子に 2点', def: sig('オレリアの ごうれい', { bite: 2 }) },
  selesnya: { text: 'あいての ライフ ＋2', def: sig('森の めぐみ', { heal: 2 }) },
  simic: { text: 'いちばん 大きい 子を タップ', def: sig('のびる つた', { bind: 1 }) },
  izzet: { text: 'いちばん 小さい 子に 2点', def: sig('ひらめきの 火花', { bite: 2 }) },
  golgari: { text: 'いちばん 小さい 子に 1点・あいての ライフ ＋1', def: sig('くさった つち', { bite: 1, heal: 1 }) },
  azorius: { text: 'いちばん 大きい 子を タップ（つぎも おきない）', def: sig('きまりの くさり', { bind: 2 }) },
  rakdos: { text: 'きみに 1点', def: sig('ブーイングの あらし', { zap: 1 }) },
  orzhov: { text: 'きみに 1点・あいての ライフ ＋1', def: sig('さいそくの てがみ', { zap: 1, heal: 1 }) },
  gruul: { text: 'いちばん 小さい 子に 2点', def: sig('じならし', { bite: 2 }) },
  dimir: { text: 'いちばん 大きい 子を タップ', def: sig('かげの ささやき', { bind: 1 }) },
  jace: { text: 'いちばん 大きい 子を タップ・きみに 1点', def: sig('ジェイスの よみ', { bind: 1, zap: 1 }, 3) },
  ...NEW_SIG,
};
export const SIG_COPIES = { foe: 2, boss: 3 };
// ---- なかま（2026-11-20）：とうの しくみで たたかう 13人に、その キャラクター だけの あたらしい クリーチャーを 1しゅるい ----
// しくみの こま（あたま・ふたご・ドラゴン など）と もとの じゅもんは そのまま。まい数は きめわざと おなじ（2まい・ボス 3まい）
// swap：もとの デッキの ふつうの 手下（いちばん 小さい もの）と 入れかえる（デッキの まい数は そのまま）。なければ 足す
// role：true ＝ せめる、false ＝ まもる（きみに ブロックできる クリーチャーが いない ときだけ こうげき）
const pal = (name, pow, tou, kw, role, text, swap = false) => ({ text, swap, def: KIT.ecr(name, pow, tou, [], kw, { attacks: role, pal: true }) });
export const PB_PAL = {
  hydra: pal('ぬまの ちびハイドラ', 2, 2, [], true, '2/2・こうげきして くる'),
  clock: pal('ねじまき ふくろう', 1, 2, ['flying'], true, '1/2 飛行（ひこう）・こうげきして くる'),
  horde: pal('むれの たいこもち', 2, 2, ['haste'], true, '2/2 速攻（そっこう）・こうげきして くる', true),
  dragon: pal('たからの 番を する コボルド', 1, 3, [], false, '1/3・まもり役'),
  factory: pal('くみたて中の ゴーレム', 2, 4, [], false, '2/4・まもり役'),
  slime: pal('ちびスライム', 1, 1, [], true, '1/1・こうげきして くる'),
  twins: pal('きょじんの いわはこび', 3, 2, [], true, '3/2・こうげきして くる', true),
  xenagos: pal('おどる サテュロス', 2, 1, ['haste'], true, '2/1 速攻（そっこう）・こうげきして くる'),
  gorgon: pal('石に された 英雄（えいゆう）', 0, 5, [], false, '0/5・まもり役'),
  erebos: pal('冥界（めいかい）の 門番', 2, 4, [], false, '2/4・まもり役'),
  gruul: pal('あれ地の イノシシ', 3, 2, ['trample'], true, '3/2 トランプル・こうげきして くる', true),
  dimir: pal('かげの うつし身', 1, 3, [], false, '1/3・まもり役'),
  jace: pal('ジェイスの うつし絵', 2, 3, ['flying'], true, '2/3 飛行（ひこう）・こうげきして くる', true),
  ...NEW_PAL,
};
const PLAIN = new Set(['name', 'types', 'pow', 'tou', 'sub', 'kw', 'color', 'cost', 'attacks']);
const isPlain = (d) => d.types.includes('creature') && d.attacks === true && Object.keys(d).every((k) => PLAIN.has(k));
// ---- ギルドの リーダー 8人（2026-11-20）：ステージ 1 と おなじ つくり。じぶんの デッキ（ほんものの カード）を AI が 手札と マナで つかう ----
// ギルドの きまり（とうの ラヴニカの 階と おなじ もの）は そのまま 上に のせる。ids：ステージ 4 の デッキ、hard：ステージ 5 で 足す カード、life：[ステージ 4, ステージ 5]
// ai：こうげきの くせ（rush・guard・なし）。rule：えらぶ 画面と かちかたの まどに 出す きまり
const SAPLING = KIT.ecr('苗木（なえぎ）', 1, 1, ['sapling'], [], { sapling: true });
const spellHit = (who, heal) => (s, E, n) => { if (heal) s.E.life += n; E.L(s, `${who}：じゅもんで ${n}点`); E.hurt(s, n); };
export const PB_GUILD = {
  boros: { ai: '', life: [10, 11], ids: ['RV02', 'RV03', 'RV04', 'R01', 'R27', 'W18', 'R76', 'W17'], hard: ['RV05', 'RV02'],
    rule: '3体（たい） いじょうで こうげき すると、ぜんぶ パワー ＋1',
    beforeAttack(s, E, ps) { if (ps.length >= 3) { for (const p of ps) E.pump(p, 1, 0); E.L(s, `大隊（だいたい）：${ps.length}体で こうげき、ぜんぶ ＋1`); } } },
  selesnya: { ai: '', life: [8, 9], ids: ['RV07', 'RV09', 'G01', 'G01', 'W03', 'G11', 'W10', 'G21'], hard: ['RV08', 'G21'],
    rule: 'ターンの はじめに 苗木（なえぎ）が 1体 ふえる（2体まで）。ふえる たびに ライフ ＋1',
    turnStart(s, E) { const n = () => E.creatures(s, 'E').filter((p) => p.def.sapling).length; if (n() < 2) { E.token(s, 'E', SAPLING); s.E.life += 1; E.L(s, `トロスターニ：なえぎが ふえた（${n()}体）、ライフ ＋1（${s.E.life}）`); } } },
  simic: { ai: '', life: [8, 9], ids: ['RV12', 'RV12', 'RV13', 'RV13', 'RV14', 'G20', 'G20', 'U18', 'U18', 'U01'], hard: ['RV15', 'G14', 'U34'],
    rule: 'ターンの はじめに、あいての クリーチャーの ＋1/＋1カウンターが 2ばいに なる（なければ 1こ。4こまで）',
    turnStart(s, E) { for (const p of E.creatures(s, 'E')) { const k = Math.min(4, p.ctr ? p.ctr * 2 : 1); if (k > (p.ctr || 0)) E.addCounters(s, p, k - (p.ctr || 0)); } E.L(s, 'ヴォレル：カウンターが 2ばい'); } },
  izzet: { ai: '', life: [8, 9], ids: ['RV17', 'RV17', 'RV18', 'RV18', 'RV19', 'R10', 'U09', 'U82', 'R21', 'R14'], hard: ['RV20', 'R22', 'RV19'],
    rule: 'あいてが じゅもんを つかう たびに、きみに 1点', onSpells: spellHit('ニヴ＝ミゼット', false) },
  golgari: { ai: '', life: [13, 16], ids: ['RV22', 'RV22', 'RV23', 'RV23', 'RV24', 'RV25', 'K02', 'K02', 'K08', 'G12', 'K15', 'G01'], hard: ['RV25', 'K07', 'RV24', 'K18'],
    rule: 'あいての クリーチャーが たおれると、つぎの ターンの はじめに あいての ライフが その 数だけ ふえる',
    turnStart(s, E) { const n = s.E.gy.filter((c) => c.def.types.includes('creature')).length, d = n - (s.E.flags.pbDead || 0); s.E.flags.pbDead = n; if (d > 0) { s.E.life += d; E.L(s, `ジャラド：ライフ ＋${d}（${s.E.life}）`); } } },
  azorius: { ai: 'guard', life: [9, 10], ids: ['RV27', 'RV27', 'RV28', 'RV29', 'RV30', 'W11', 'W11', 'U01', 'U01', 'W03', 'U30'], hard: ['RV30', 'W14', 'U34'],
    rule: 'きみの カードは コストが 1 ふえる（きほんカードは そのまま）',
    hooks: { costTax: (s, d) => (s.swapped || d.basic || !d.cost ? 0 : 1) } },
  rakdos: { ai: '', life: [8, 9], ids: ['RV32', 'RV32', 'RV33', 'RV34', 'K21', 'K21', 'R28', 'R28', 'R02', 'K14'], hard: ['RV35', 'R33', 'RV33'],
    rule: '2ターンめから、きみの ターンに あいてへの ダメージが 3点より 少ないと、2点 うける（ブーイング）',
    turnStart(s, E) { const d = s.E.flags.pbShow ?? 3; if (d < 3 && s.stats.playerTurns >= 2) { E.L(s, `ラクドス：${d}点 だけ？ ブーイング！`); E.hurt(s, 2); } },
    hooks: { endTurn(s, E) { if (!s.swapped && s.active === 'P') s.E.flags.pbShow = E.dmgThisTurn(s); } } },
  orzhov: { ai: '', life: [8, 9], ids: ['RV37', 'RV37', 'RV38', 'RV39', 'RV40', 'K04', 'K05', 'W10', 'K01', 'K01'], hard: ['RV38', 'RV39', 'K13'],
    rule: 'あいてが じゅもんを つかう たびに、きみに 1点・あいての ライフ ＋1（ゆすり）', onSpells: spellHit('テイサ', true) },
};
// ---- 特別ステージ「番外編の 挑戦者たち」の 8人（2026-11-27）：ギルドの リーダーと おなじ つくり（じぶんの デッキを AI が 手札と マナで つかう）----
// ids：デッキ（20まいに たりない ぶんは きほんカード）、life：ライフ、sets：アンティで もらえる 弾、sig：きめわざの セリフを 言う きっかけ（ログ）
// あいての ターンの ログ（[3E] …）だけ 見る（きみの カードの 同じ ことばで しゃべらない ように）
const foeLine = (re) => (s, l) => /^\[\d+E\]/.test(l) && re.test(l);
export const PB_EX = {
  ex_touko: { ai: '', life: 28, sets: [17], sig: (s, l) => /予備（よび）の 体/.test(l) && s.E.bf.some((p) => p.def.id === 'MY04'), rule: '橙子（とうこ）が たおれても、人形（にんぎょう）が いれば 予備（よび）の 体で もどる。青子人形（あおこにんぎょう）は 麻痺（まひ）カウンターを 置（お）いて くる',
    ids: ['MY04', 'MY04', 'MY16', 'MY16', 'MY17', 'MY17', 'MY18', 'MY18', 'MY55', 'MY55', 'MY20', 'MY21', 'MY21', 'MY43', 'MY43', 'MY42', 'MY38', 'MY09', 'MY15', 'MY15'] },
  ex_fgo: { ai: '', life: 22, sets: [10, 14], sig: foeLine(/ほうぐ！/), rule: 'サーヴァントは こうげきで NP が たまり、100 で 宝具（ほうぐ）を つかう',
    ids: ['FG01', 'FG02', 'FG11', 'FG19', 'FG19', 'FG20', 'FG21', 'FG21', 'FG22', 'FG22', 'FG23', 'FG23', 'FG24', 'FG24', 'FG31', 'FG31', 'FG32', 'FG32', 'FG52', 'FG163'] },
  // 星：スターレイル 第1弾（まえの「星めぐりの 挑戦者」の デッキを ひきつぐ）
  ex_hoshi: { ai: '', life: 17, sets: [11], sig: foeLine(/せんぎポイント \d+ − /), rule: 'こうげきで せんぎポイントが たまり、せんぎで つかう',
    ids: ['SR03', 'SR03', 'SR07', 'SR14', 'SR15', 'SR19', 'SR38', 'SR38', 'SR42', 'SR42', 'SR43', 'SR43', 'SR44', 'SR44', 'SR49', 'SR49', 'SR50', 'SR50', 'SR51', 'SR51'] },
  // 穹：スターレイル 第2弾（記憶の精霊と 黄金裔。せんぎポイントで やすく 出す）
  ex_kyuu: { ai: '', life: 12, sets: [15], sig: foeLine(/きおくの せいれい：/), rule: 'せんぎポイントを つかって 黄金裔（おうごんえい）を やすく 出す。記憶（きおく）の精霊（せいれい）は つながった あいてと いっしょに たたかう',
    ids: ['SR81', 'SR82', 'SR93', 'SR94', 'SR98', 'SR92', 'SR101', 'SR101', 'SR119', 'SR119', 'SR122', 'SR122', 'SR121', 'SR121', 'SR126', 'SR126', 'SR128', 'SR114', 'SR141', 'SR118'] },
  // アキラ：ゼンゼロ 第1・2弾（白黒。まえの「ホロウの 挑戦者」の デッキを ひきつぐ）
  ex_akira: { ai: '', life: 30, sets: [12, 16], sig: foeLine(/ブレイク！|(月城柳|朱鳶|儀玄|ダイアリン|アンビー).*せんじょうに 出た/), rule: 'エージェントの こうげきで ブレイクカウンターが たまる',
    ids: ['ZZ07', 'ZZ15', 'ZZ17', 'ZZ29', 'ZZ29', 'ZZ30', 'ZZ30', 'ZZ33', 'ZZ33', 'ZZ34', 'ZZ34', 'ZZ35', 'ZZ35', 'ZZ36', 'ZZ36', 'ZZ44', 'ZZ44', 'ZZ82', 'ZZ90', 'ZZ102'] },
  // リン：ゼンゼロ 第2弾が 中心（青赤。属性異常と 紊乱）
  ex_rin: { ai: '', life: 21, sets: [12, 16], sig: foeLine(/異常（いじょう）|紊乱（びんらん）！/), rule: '属性異常（ぞくせいいじょう）の こうげきで 異常（いじょう）が つき、ちがう 色の 異常が かさなると 紊乱（びんらん）で ダメージ',
    ids: ['ZZ86', 'ZZ101', 'ZZ96', 'ZZ89', 'ZZ89', 'ZZ111', 'ZZ111', 'ZZ113', 'ZZ113', 'ZZ119', 'ZZ119', 'ZZ120', 'ZZ120', 'ZZ97', 'ZZ09', 'ZZ28', 'ZZ38', 'ZZ38', 'ZZ147', 'ZZ59'] },
  ex_aoko: { ai: '', life: 16, sets: [17], sig: foeLine(/マジックガンナー！/), rule: '青子（あおこ）は じゅもんを つかう たびに 1点。ダメージを あたえる たびに 魔力（まりょく）カウンターが たまり、マジックガンナーで まとめて うって くる',
    ids: ['MY01', 'MY01', 'MY19', 'MY19', 'MY19', 'MY20', 'MY20', 'MY35', 'MY35', 'MY45', 'MY45', 'MY46', 'MY46', 'MY36', 'MY36', 'MY41', 'MY30', 'MY30', 'MY31', 'MY31'] },
  ex_alice: { ai: '', life: 13, sets: [17], sig: (s, l) => /グレートスリー！/.test(l) && s.E.bf.some((p) => p.def.great), rule: '有珠（ありす）は トークンが 出る たびに 魔力（まりょく）カウンターが たまり、5こで グレートスリー（橋（はし）の巨人（きょじん）・月の油（あぶら）・薔薇（ばら）の猟犬（りょうけん））が 出る',
    ids: ['MY02', 'MY02', 'MY10', 'MY10', 'MY14', 'MY14', 'MY14', 'MY11', 'MY11', 'MY06', 'MY07', 'MY07', 'MY52', 'MY08', 'MY15', 'MY15', 'MY13', 'MY43', 'MY05', 'MY32'] },
};
// デッキで たたかう あいて（ギルドの リーダー・番外編の 挑戦者）の データ：{ ids（その むずかしさの デッキ）, life, ai, rule }
export function ghostDeck(f) {
  const g = PB_GUILD[f.floorId], x = PB_EX[f.floorId], hard = f.diff === 'hard';
  return g ? { ids: [...g.ids, ...(hard ? g.hard : [])], life: g.life[hard ? 1 : 0], ai: g.ai, rule: g.rule } : { ids: x.ids, life: x.life, ai: x.ai, rule: x.rule };
}
// ギルドの リーダー・番外編の 挑戦者の たたかう ばしょ。o.life・o.ids：しらべ用（ちょうせい）
export function guildFloor(f, o = {}) {
  const g = PB_GUILD[f.floorId] || PB_EX[f.floorId], c = PB_CHARS[f.floorId], D = ghostDeck(f), who = c.who.replace(/（[^）]*）/g, '');
  const life = o.life || D.life;
  const floor = pvp({ deck: fillDeck(o.ids || D.ids), name: who, life, first: 'P', style: g.ai,
    turnStart: g.turnStart, beforeAttack: g.beforeAttack, onSpells: g.onSpells, hooks: g.hooks,
    goal: () => `${c.who}「${c.line}」\n${c.who}の ライフを 0に する。${g.rule}。` });
  // 番外編の 挑戦者：セリフ 4つ（とうじょう・きめわざ・ピンチ・まけた とき）。テーロスがわと おなじ ふきだし
  const L = PB_EX[f.floorId] && PB_LINES[f.floorId];
  if (!L) return floor;
  const setup = floor.setup, check = floor.check;
  return { ...floor, speaker: who, lines: { win: L.win },
    setup(s, E) { setup(s, E); s.E.say = L.start; s.exLog = 0; },
    check(s, E, when) {
      check(s, E, when);
      if (s.over || s.swapped) return; // 入れかえて いる あいだ（あいての 番）は s.E が きみ なので 見ない
      for (; s.exLog < s.logs.length; s.exLog++) if (g.sig(s, s.logs[s.exLog])) RAV_KIT.speak(s, E, 'sig', L.sig);
      if (s.E.life > 0 && s.E.life <= life / 3) RAV_KIT.speak(s, E, 'low', L.low);
    } };
}
// ステージ 2〜6 の あいての たたかう ばしょ：とうの 階を つくって、デッキの すきな ところに きめわざを まぜる
export function towerFloor(f, o = {}) {
  const base = (PB_NEW[f.floorId] || FLOORS[f.floorId])(), g = PB_SIG[f.floorId];
  if (!g || o.plain) return base;
  const n = (f.boss ? SIG_COPIES.boss : SIG_COPIES.foe) + (f.plus || 0), q = PB_PAL[f.floorId];
  const put = (s, E, def) => s.E.lib.splice(Math.floor(s.rng() * (s.E.lib.length + 1)), 0, E.card(def));
  // セリフ（テーロスの 10人。ステージ 6 の 5人は じぶんの 階で しゃべる）：とうじょう・きめわざ・ピンチ・まけた とき。画面の ふきだしに 出る
  const L = base.pbForm ? null : PB_LINES[f.floorId], who = PB_CHARS[f.floorId].who.replace(/（[^）]*）/g, '');
  const sigDef = L ? { ...g.def, effect(s, E) { g.def.effect(s, E); RAV_KIT.speak(s, E, 'sig', L.sig); } } : g.def;
  const floor = { ...base, setup(s, E) {
    base.setup(s, E);
    if (L) { s.E.say = L.start; s.E.pbLife0 = s.E.life; }
    for (let i = 0; i < n; i++) put(s, E, sigDef);
    if (!q) return;
    // なかま：ふつうの 手下の 小さい ほうから 入れかえる（swap）。入れかえる ものが なければ 足す
    const plain = q.swap ? s.E.lib.filter((c) => isPlain(c.def)).sort((a, b) => a.def.pow + a.def.tou - b.def.pow - b.def.tou).slice(0, n) : [];
    for (const c of plain) s.E.lib[s.E.lib.indexOf(c)] = E.card(q.def);
    for (let i = plain.length; i < n; i++) put(s, E, q.def);
  } };
  // こうげきの ない 階（ハイドラ・エレボスの 1だんかいめ）：なかま だけ こうげきする
  if (q && (f.floorId === 'hydra' || f.floorId === 'erebos')) floor.enemyTurn = async (s, E) => {
    const noStep = f.floorId === 'hydra' || s.phase === 1;
    await base.enemyTurn(s, E);
    if (!s.over && noStep) await E.enemyAttack(s, KIT.attackers(s, E, (p) => p.def.pal && p.def.attacks));
  };
  if (L) {
    Object.assign(floor, { speaker: who, lines: { win: L.win }, goal: (s) => `${who}「${L.start}」\n${base.goal(s)}` });
    floor.check = (s, E, when) => {
      base.check?.(s, E, when);
      if (s.over) return;
      if (f.floorId === 'erebos' && s.phase === 3 && !s.E.pbLife3) s.E.pbLife3 = s.E.life;
      if (PB_LOW[f.floorId]?.(s, E)) RAV_KIT.speak(s, E, 'low', L.low);
    };
  }
  return floor;
}
// ステージ 1 の あいての たたかう ばしょ（てきも デッキで たたかう）
export const foeFloor = (f) => pvp({ deck: fillDeck(f.char.ids), name: f.char.who, life: f.char.life, first: 'P', style: f.char.ai });
// テーロスがわ（ステージ 2・3・6）は きまった 5人ずつ（2026-11-21。まえは 10人が 3つの ステージに くりかえし 出た）。ラヴニカ（4・5）は 2〜3人から セーブごとに えらぶ まま
// ステージ 2 の ボスは たからの 山の ドラゴン（2026-11-22。さいごに ならぶ）。noBoss：ボスの いない ステージ（いまは ない）。id は セーブの かった 回数の なまえに つかう ので かえない（th-h は いまは「しゅうまつの しま」）
// drop：アンティ（かつと もらう 1まい）の カード。w：コモン・アンコモン・レア・レジェンドの 出やすさ（boss：ステージの さいごの あいて）
export const PB_STAGES = [
  { id: 'kihon', name: 'みならいの みち', diff: 'easy', kihon: S1, drop: { ids: POOL1, w: [70, 25, 5, 0], boss: [40, 40, 18, 2] } },
  { id: 'th-e', name: 'テーロス（かんたん）', diff: 'easy', slots: [['hydra'], ['clock'], ['horde'], ['factory'], ['dragon']], drop: { sets: [1], w: [65, 28, 7, 0], boss: [35, 40, 22, 3] } },
  { id: 'th-n', name: 'テーロス（ふつう）', diff: 'normal', slots: [['slime'], ['twins'], ['xenagos'], ['gorgon'], ['erebos']], drop: { sets: [2], w: [55, 33, 11, 1], boss: [25, 40, 30, 5] } },
  { id: 'rv-n', name: 'ラヴニカ（ふつう）', diff: 'normal', slots: RAV_SLOTS, drop: { sets: [1, 2], w: [50, 35, 13, 2], boss: [20, 40, 33, 7] } },
  { id: 'rv-h', name: 'ラヴニカ（むずかしい）', diff: 'hard', slots: RAV_SLOTS, drop: { sets: [5], w: [45, 35, 17, 3], boss: [15, 35, 40, 10] } },
  { id: 'th-h', name: 'しゅうまつの しま（むずかしい）', diff: 'hard', slots: [['harisen'], ['kameron'], ['konkon'], ['rirara'], ['owaron']], drop: { sets: [1, 2, 5], w: [40, 35, 20, 5], boss: [10, 30, 45, 15] } },
  // 特別ステージ（special）：番外編の カードの デッキで たたかう 8人。アンティは その あいての 番外編（PB_EX の sets）。むげんの たたかいには 入らない
  { id: 'ex', name: '番外編（ばんがいへん）の 挑戦者（ちょうせんしゃ）たち', diff: 'hard', special: true, slots: [['ex_touko'], ['ex_fgo'], ['ex_hoshi'], ['ex_kyuu'], ['ex_akira'], ['ex_rin'], ['ex_aoko'], ['ex_alice']], drop: { sets: [17], w: [40, 35, 20, 5], boss: [10, 30, 45, 15] } },
];
// むげんの たたかいが ひらく ステージの 数（特別ステージは 入れない）：ステージ 1〜6 を クリア
export const PB_MAIN = PB_STAGES.filter((t) => !t.special).length;
const sizeOf = (t) => (t.kihon || t.slots).length;
export const PB_TOTAL = PB_STAGES.reduce((t, x) => t + sizeOf(x), 0);
// ステージ si の あいての ならび。seed：セーブごとの 数（2〜3しゅるいから えらぶ あいては、同じ セーブなら いつも 同じ）
// → [{ key（かった 回数を おぼえる 名前）, si, k, of, stageName, diff, boss, buff: 0, char：キャラクター, kihon：ステージ 1 の デッキの あいて | floorId }]
export function foesOf(si, seed = 1) {
  const t = PB_STAGES[si], n = sizeOf(t);
  return Array.from({ length: n }, (_, k) => {
    const f = { si, k, of: n, stageName: t.name, diff: t.diff, boss: !t.noBoss && k === n - 1, buff: 0, lap: 0 };
    if (t.kihon) return { ...f, key: `${t.id}:${t.kihon[k].id}`, kihon: t.kihon[k], char: t.kihon[k] };
    const ids = t.slots[k], floorId = ids[Math.floor(seeded((seed >>> 0) + (si * 10 + k) * 7919)() * ids.length)];
    return towerFoe(f, t, floorId);
  });
}
// ステージ 2〜6 の あいて 1人ぶん。むずかしさの ちょうせい（2026-11-18。ボスが その ステージで いちばん てごわく なる ように）：
//   ボス：ステージ 4〜6 は クリーチャーが ＋1/＋1（buff）。ステージ 2・3 の ボスは そのままで いちばん てごわい
//   とくに むずかしい あいて（PB_EASE）：きみの ライフを 少し 多く して はじめる（lifeBonus）
export const BOSS_BUFF_FROM = 3; // 0 から かぞえる：3 ＝ ステージ 4
//   かんたん すぎる あいて（PB_DIFF）：その あいて だけ、1つ 上の むずかしさで たたかう（ステージ 2 の ドラゴンと とけいとう。2026-11-21）
export const PB_EASE = { 'rv-h:gruul': 6 };
export const PB_DIFF = { 'th-e:dragon': 'normal', 'th-e:clock': 'normal' };
export const PB_PLUS = { 'th-e:clock': 2 }; // きめわざと なかまを その 数だけ 多く 入れる（ドラゴンは ステージ 2 の ボスに なった ので、ボスの 3まいずつ ＝ まえの 2 ＋ 1 と おなじ）
export function towerFoe(f, t, floorId) {
  const boss = f.boss ?? (!t.noBoss && f.k === t.slots.length - 1);
  return { ...f, boss, diff: PB_DIFF[`${t.id}:${floorId}`] || f.diff, key: `${t.id}:${f.k}`, floorId, char: PB_CHARS[floorId], ghost: !!(PB_GUILD[floorId] || PB_EX[floorId]), dropSets: PB_EX[floorId]?.sets || null, buff: boss && f.si >= BOSS_BUFF_FROM && !PB_EX[floorId] ? 1 : 0, plus: PB_PLUS[`${t.id}:${floorId}`] || 0, lifeBonus: PB_EASE[`${t.id}:${floorId}`] || 0 };
}
// ステージが クリアか（ぜんいんを PB.need 回ずつ）・いま ひらいて いる いちばん 上の ステージ（ぜんぶ クリアなら PB_STAGES.length ＝ むげんの たたかい）
export const stageCleared = (beat, si, seed, need = PB.need) => foesOf(si, seed).every((f) => (beat[f.key] || 0) >= need);
// floor：もう ひらいた ステージ（セーブの stage）。きまりが かわっても（2回 → 3回・あいてが ふえた）、ひらいた ステージは とじない
export function topStage(beat, seed, floor = 0, need = PB.need) { let si = Math.max(0, floor | 0); while (si < PB_STAGES.length && stageCleared(beat, si, seed, need)) si++; return si; }
// むげんの たたかい（ぜんぶ クリアした あとの おまけ）：「むずかしい」の 2つの ステージを じゅんばんに。1しゅう ごとに てきの クリーチャーが ＋1/＋1
const LOOP = PB_STAGES.map((t, si) => si).filter((si) => PB_STAGES[si].diff === 'hard' && !PB_STAGES[si].special);
export function endlessAt(n, seed = 1) {
  const all = LOOP.flatMap((si) => foesOf(si, seed)), lap = Math.floor(n / all.length) + 1;
  const f = all[n % all.length];
  return { ...f, key: 'endless', endless: n, lap, buff: lap + (f.buff || 0) };
}

// ---- アンティ：かつと、あいての ステージの カードを 1まい もらう ----
const RAR = ['C', 'U', 'R', 'L'];
const DROPS = new Map();
// sets：あいて だけの 弾（番外編の 挑戦者）。なければ ステージの 弾
function dropPool(si, sets) {
  const key = sets ? `s${sets.join()}` : si;
  if (!DROPS.has(key)) {
    const d = sets ? { sets } : PB_STAGES[si].drop;
    const ids = d.ids || SETS.filter((x) => d.sets.includes(x.id)).flatMap((x) => x.cards.filter((c) => !c.noPack).map((c) => c.id));
    DROPS.set(key, Object.fromEntries(RAR.map((r) => [r, ids.map((id) => BY_ID[id]).filter((c) => c && c.rar === r)])));
  }
  return DROPS.get(key);
}
// → もらう カード。rng は 0〜1 の 数を かえす 関数
export function antePick(foe, rng) {
  const d = PB_STAGES[foe.si].drop, pool = dropPool(foe.si, foe.dropSets);
  const w = (foe.boss ? d.boss : d.w).map((x, i) => (pool[RAR[i]].length ? x : 0));
  let r = rng() * w.reduce((t, x) => t + x, 0), k = 0;
  while (k < 3 && (r -= w[k]) >= 0) k++;
  const list = pool[RAR[k]];
  return list[Math.floor(rng() * list.length)];
}

// ---- せいちょう：かつと もらう「せいちょうポイント」で、できる ことを ふやす（カードは つよく しない）----
// 枝ごとに 左から じゅんばんに。cost：せいちょうポイント
export const PB_TREE = [
  { id: 'cap', mark: '◆', name: 'キャパシティ', note: 'デッキに 入れられる 点が ふえる',
    nodes: [2, 3, 4, 5, 6].map((cost, i) => ({ cost, text: `デッキの 点が ${PB.cap + PB.capStep * (i + 1)}点までに` })) },
  { id: 'pack', mark: '■', name: 'パック', note: 'ショップの パックが ふえる',
    nodes: [3, 4, 5].map((cost, i) => ({ cost, text: `ショップに ${PB_PACKS_MORE[i].name}` })) },
  { id: 'quiz', mark: '？', name: 'もんだい', note: 'むずかしい もんだいが とける（もらえる ポイントが 多い）',
    nodes: [{ cost: 4, text: `むずかしい もんだい（1もん ${PB.quizTier[1]}P）` }, { cost: 6, text: `とても むずかしい もんだい（1もん ${PB.quizTier[2]}P）` }] },
  { id: 'deck', mark: '▲', name: 'デッキの わく', note: 'のこせる デッキの 数が ふえる',
    nodes: [{ cost: 3, text: `デッキを ${PB.deckBase + 1}こまで` }, { cost: 5, text: `デッキを ${PB.deckBase + 2}こまで` }] },
];
export const capOf = (tree = {}) => PB.cap + PB.capStep * (tree.cap || 0);
export const deckMaxOf = (tree = {}) => PB.deckBase + (tree.deck || 0);

// ---- まえの セーブ（28たいを じゅんばんに。wins ＝ たおした 数）から うつす：そんを させない ----
// とどいて いた 段より まえの ステージは ぜんいん PB.need 回（ひらいた まま）。とどいて いた 段は、たおした あいてを PB.need 回。
// せいちょうポイントは、かった 数 ＋ クリアした ステージ × PB.gpStage
const OLD = [3, 5, 5, 5, 5, 5]; // まえの 段の あいての 数（みならいは 3たい だった）
export function migrateProgress(wins, seed = 1) {
  const beat = {};
  const all = (si) => { for (const f of foesOf(si, seed)) beat[f.key] = PB.need; };
  let left = Math.max(0, wins | 0), si = 0;
  while (si < OLD.length && left >= OLD[si]) { all(si); left -= OLD[si]; si++; }
  if (si >= OLD.length) return { beat, endless: left, stage: OLD.length, gp: wins * PB.gpWin + OLD.length * PB.gpStage }; // ステージ 1〜6 を クリア（特別ステージは これから）
  // みならいの みちは あいてが ふえた：まえの じゅんばん（ゴブリン・そら・テフェリー）で かぞえる
  const order = si === 0 ? ['kh1', 'kh2', 'kh3'].map((id) => foesOf(0, seed).find((f) => f.kihon.id === id)) : foesOf(si, seed);
  for (const f of order.slice(0, left)) beat[f.key] = PB.need;
  return { beat, endless: 0, stage: si, gp: wins * PB.gpWin + si * PB.gpStage };
}

// ---- デッキの きまり（こうちくモードの ノーマルと おなじ：20まい・30点・2色まで・同じ カードは 4まいまで）----
// → たりない ことの ならび（なければ デッキは かんせい）。count：カードの 数、points：点、colors：色の 数、missing：もって いない カードの 数
export function deckProblems({ count, points, colors, missing }, { size = 20, cap = 30 } = {}) {
  const out = [];
  if (!count) return ['デッキに カードが 入って いない。「デッキ」で カードを えらぼう'];
  if (count < PB.minCards) out.push(`カードが あと ${PB.minCards - count}まい たりない（${PB.minCards}まい いじょう 入れよう）`);
  if (count > size) out.push(`カードが ${count - size}まい 多い（${size}まいまで）`);
  if (points > cap) out.push(`点が ${points - cap}点 多い（${cap}点まで）`);
  if (colors > 2) out.push(`色が ${colors}色 ある（2色まで）`);
  if (missing > 0) out.push(`カードが ${missing}まい たりない（もって いる まい数より 多く 入って いる）`);
  return out;
}
