// パック＆バトル（2026-11-17。docs/PACKBATTLE.md）：もんだいで ポイントを ためる → ショップで パックを あける → デッキを くむ → てきを 1体ずつ たおす
// ぼうけん（とう）・こうちく・次元渡りとは べつの モード。エンジン・カード・てきは そのまま つかう。ここは 数字と てきの じゅんばん だけ（画面は ui/packbattle.js）
import { SLOTS } from './enemies.js';
import { RAV_SLOTS } from './ravnica.js';
import { KIHON_FLOORS } from './kihon.js';
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
  need: 2, // つぎの ステージが ひらく：ステージの ぜんいんを この 回数ずつ たおす
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
// みならいの みちは 4たい：みならいの しけんの 3階 ＋ もりの なかま（てきも 1年生の カードプール）
const FOREST = { id: 'pb1', name: 'もりの なかま', foe: 'もりの なかま', life: 12, ids: ['G01', 'G11', 'C02', 'G09', 'G01', 'C18', 'G05', 'C01'] };
// drop：アンティ（かつと もらう 1まい）の カード。w：コモン・アンコモン・レア・レジェンドの 出やすさ（boss：ステージの さいごの あいて）
export const PB_STAGES = [
  { id: 'kihon', name: 'みならいの みち', diff: 'easy', kihon: [KIHON_FLOORS[0], KIHON_FLOORS[1], FOREST, KIHON_FLOORS[2]], drop: { ids: POOL1, w: [70, 25, 5, 0], boss: [40, 40, 18, 2] } },
  { id: 'th-e', name: 'テーロス（かんたん）', diff: 'easy', slots: SLOTS, drop: { sets: [1], w: [65, 28, 7, 0], boss: [35, 40, 22, 3] } },
  { id: 'th-n', name: 'テーロス（ふつう）', diff: 'normal', slots: SLOTS, drop: { sets: [2], w: [55, 33, 11, 1], boss: [25, 40, 30, 5] } },
  { id: 'rv-n', name: 'ラヴニカ（ふつう）', diff: 'normal', slots: RAV_SLOTS, drop: { sets: [1, 2], w: [50, 35, 13, 2], boss: [20, 40, 33, 7] } },
  { id: 'rv-h', name: 'ラヴニカ（むずかしい）', diff: 'hard', slots: RAV_SLOTS, drop: { sets: [5], w: [45, 35, 17, 3], boss: [15, 35, 40, 10] } },
  { id: 'th-h', name: 'テーロス（むずかしい）', diff: 'hard', slots: SLOTS, drop: { sets: [1, 2, 5], w: [40, 35, 20, 5], boss: [10, 30, 45, 15] } },
];
const sizeOf = (t) => (t.kihon || t.slots).length;
export const PB_TOTAL = PB_STAGES.reduce((t, x) => t + sizeOf(x), 0);
// ステージ si の あいての ならび。seed：セーブごとの 数（2〜3しゅるいから えらぶ あいては、同じ セーブなら いつも 同じ）
// → [{ key（かった 回数を おぼえる 名前）, si, k, of, stageName, diff, boss, buff: 0, kihon: 階 | floorId }]
export function foesOf(si, seed = 1) {
  const t = PB_STAGES[si], n = sizeOf(t);
  return Array.from({ length: n }, (_, k) => {
    const f = { si, k, of: n, stageName: t.name, diff: t.diff, boss: k === n - 1, buff: 0, lap: 0 };
    if (t.kihon) return { ...f, key: `${t.id}:${t.kihon[k].id}`, kihon: t.kihon[k] };
    const ids = t.slots[k];
    return { ...f, key: `${t.id}:${k}`, floorId: ids[Math.floor(seeded((seed >>> 0) + (si * 10 + k) * 7919)() * ids.length)] };
  });
}
// ステージが クリアか（ぜんいんを PB.need 回ずつ）・いま ひらいて いる いちばん 上の ステージ（ぜんぶ クリアなら PB_STAGES.length ＝ むげんの たたかい）
export const stageCleared = (beat, si, seed) => foesOf(si, seed).every((f) => (beat[f.key] || 0) >= PB.need);
export function topStage(beat, seed) { let si = 0; while (si < PB_STAGES.length && stageCleared(beat, si, seed)) si++; return si; }
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
  // みならいの みちは あいてが 1たい ふえた：まえの じゅんばん（ゴブリン・そら・テフェリー）で かぞえる
  const order = si === 0 ? foesOf(0, seed).filter((f) => f.kihon.id !== FOREST.id) : foesOf(si, seed);
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
