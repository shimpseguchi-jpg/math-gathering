// パック＆バトル（2026-11-17。docs/PACKBATTLE.md）：もんだいで ポイントを ためる → ショップで パックを あける → デッキを くむ → てきを 1体ずつ たおす
// ぼうけん（とう）・こうちく・次元渡りとは べつの モード。エンジン・カード・てきは そのまま つかう。ここは 数字と てきの じゅんばん だけ（画面は ui/packbattle.js）
import { SLOTS, pvp } from './enemies.js';
import { RAV_SLOTS } from './ravnica.js';
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
// せいちょうの「パック」の 枝で ふえる パック（じゅんばんに）：第3弾・第4弾・ラヴニカ
export const PB_PACKS_MORE = [3, 4, 9].map((id) => setPack(SETS.find((x) => x.id === id)));
export const packsFor = (lv = 0) => [...PB_PACKS, ...PB_PACKS_MORE.slice(0, lv)];

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
// ステージ 2〜6：とうの あいて（それぞれ きまった しくみで たたかう）。同じ あいてが、ステージが すすむと つよく なって 出て くる
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
  boros: { who: 'オレリア', cols: 'RW', theme: 'ボロスの 軍団（ぐんだん）', style: '3人 いじょうで いっせいに', line: 'ぜんいん、すすめ！' },
  selesnya: { who: 'トロスターニ', cols: 'GW', theme: 'なえぎと かいふく', style: 'なえぎを ふやして ライフを もどす', line: '森は、ゆっくり そだつのです。' },
  simic: { who: 'ヴォレル', cols: 'GU', theme: 'そだつ 生きもの', style: 'カウンターを 2ばいに する', line: 'じっけん かいし。もっと 大きく！' },
  izzet: { who: 'ニヴ＝ミゼット', cols: 'UR', theme: 'じゅもんの じっけん', style: 'じゅもんで じわじわ けずる', line: 'わしの ひらめきを 見るが よい。' },
  golgari: { who: 'ジャラド', cols: 'KG', theme: '地下（ちか）の むれ', style: 'なかまが たおれると 元気に なる', line: 'たおれても、土に かえる だけさ。' },
  azorius: { who: 'イスペリア', cols: 'WU', theme: 'きまりで しばる', style: 'カードの コストを ふやす', line: 'きまりは きまりです。' },
  rakdos: { who: 'ラクドス', cols: 'KR', theme: 'はでな ショー', style: 'せめないと ブーイング', line: 'もっと はでに やれ！' },
  orzhov: { who: 'テイサ', cols: 'WK', theme: 'すいとる 聖堂（せいどう）', style: 'すこしずつ ライフを すいとる', line: 'おだいは、いただきますよ。' },
  gruul: { who: 'ボルボルグミ', cols: 'RG', theme: '大きな 1体', style: '1ターンで たおさないと もどる', line: 'ボルボル、つよい！' },
  dimir: { who: 'ラザーヴ', cols: 'UK', theme: 'まねっこ', style: 'きみの いちばん つよい 子を まねる', line: 'きみは……わたしかな？' },
  jace: { who: 'ジェイス', cols: 'U', theme: '10の ギルドの 力（ちから）', style: 'だんかいごとに ちがう 力', line: 'ギルドパクトの 名に おいて。' },
};
// ステージ 1 の あいての たたかう ばしょ（てきも デッキで たたかう）
export const foeFloor = (f) => pvp({ deck: fillDeck(f.char.ids), name: f.char.who, life: f.char.life, first: 'P', style: f.char.ai });
// drop：アンティ（かつと もらう 1まい）の カード。w：コモン・アンコモン・レア・レジェンドの 出やすさ（boss：ステージの さいごの あいて）
export const PB_STAGES = [
  { id: 'kihon', name: 'みならいの みち', diff: 'easy', kihon: S1, drop: { ids: POOL1, w: [70, 25, 5, 0], boss: [40, 40, 18, 2] } },
  { id: 'th-e', name: 'テーロス（かんたん）', diff: 'easy', slots: SLOTS, drop: { sets: [1], w: [65, 28, 7, 0], boss: [35, 40, 22, 3] } },
  { id: 'th-n', name: 'テーロス（ふつう）', diff: 'normal', slots: SLOTS, drop: { sets: [2], w: [55, 33, 11, 1], boss: [25, 40, 30, 5] } },
  { id: 'rv-n', name: 'ラヴニカ（ふつう）', diff: 'normal', slots: RAV_SLOTS, drop: { sets: [1, 2], w: [50, 35, 13, 2], boss: [20, 40, 33, 7] } },
  { id: 'rv-h', name: 'ラヴニカ（むずかしい）', diff: 'hard', slots: RAV_SLOTS, drop: { sets: [5], w: [45, 35, 17, 3], boss: [15, 35, 40, 10] } },
  { id: 'th-h', name: 'テーロス（むずかしい）', diff: 'hard', slots: SLOTS, drop: { sets: [1, 2, 5], w: [40, 35, 20, 5], boss: [10, 30, 45, 15] } },
];
const sizeOf = (t) => (t.kihon || t.slots).length;
export const PB_TOTAL = PB_STAGES.reduce((t, x) => t + sizeOf(x), 0);
// ステージ si の あいての ならび。seed：セーブごとの 数（2〜3しゅるいから えらぶ あいては、同じ セーブなら いつも 同じ）
// → [{ key（かった 回数を おぼえる 名前）, si, k, of, stageName, diff, boss, buff: 0, char：キャラクター, kihon：ステージ 1 の デッキの あいて | floorId }]
export function foesOf(si, seed = 1) {
  const t = PB_STAGES[si], n = sizeOf(t);
  return Array.from({ length: n }, (_, k) => {
    const f = { si, k, of: n, stageName: t.name, diff: t.diff, boss: k === n - 1, buff: 0, lap: 0 };
    if (t.kihon) return { ...f, key: `${t.id}:${t.kihon[k].id}`, kihon: t.kihon[k], char: t.kihon[k] };
    const ids = t.slots[k], floorId = ids[Math.floor(seeded((seed >>> 0) + (si * 10 + k) * 7919)() * ids.length)];
    return { ...f, key: `${t.id}:${k}`, floorId, char: PB_CHARS[floorId] };
  });
}
// ステージが クリアか（ぜんいんを PB.need 回ずつ）・いま ひらいて いる いちばん 上の ステージ（ぜんぶ クリアなら PB_STAGES.length ＝ むげんの たたかい）
export const stageCleared = (beat, si, seed, need = PB.need) => foesOf(si, seed).every((f) => (beat[f.key] || 0) >= need);
// floor：もう ひらいた ステージ（セーブの stage）。きまりが かわっても（2回 → 3回・あいてが ふえた）、ひらいた ステージは とじない
export function topStage(beat, seed, floor = 0, need = PB.need) { let si = Math.max(0, floor | 0); while (si < PB_STAGES.length && stageCleared(beat, si, seed, need)) si++; return si; }
// むげんの たたかい（ぜんぶ クリアした あとの おまけ）：「むずかしい」の 2つの ステージを じゅんばんに。1しゅう ごとに てきの クリーチャーが ＋1/＋1
const LOOP = PB_STAGES.map((t, si) => si).filter((si) => PB_STAGES[si].diff === 'hard');
export function endlessAt(n, seed = 1) {
  const all = LOOP.flatMap((si) => foesOf(si, seed)), lap = Math.floor(n / all.length) + 1;
  return { ...all[n % all.length], key: 'endless', endless: n, lap, buff: lap };
}

// ---- アンティ：かつと、あいての ステージの カードを 1まい もらう ----
const RAR = ['C', 'U', 'R', 'L'];
const DROPS = new Map();
function dropPool(si) {
  if (!DROPS.has(si)) {
    const d = PB_STAGES[si].drop;
    const ids = d.ids || SETS.filter((x) => d.sets.includes(x.id)).flatMap((x) => x.cards.filter((c) => !c.noPack).map((c) => c.id));
    DROPS.set(si, Object.fromEntries(RAR.map((r) => [r, ids.map((id) => BY_ID[id]).filter((c) => c && c.rar === r)])));
  }
  return DROPS.get(si);
}
// → もらう カード。rng は 0〜1 の 数を かえす 関数
export function antePick(foe, rng) {
  const d = PB_STAGES[foe.si].drop, pool = dropPool(foe.si);
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
  if (si >= OLD.length) return { beat, endless: left, stage: PB_STAGES.length, gp: wins * PB.gpWin + PB_STAGES.length * PB.gpStage };
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
