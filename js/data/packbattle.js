// パック＆バトル（2026-11-17。docs/PACKBATTLE.md）：もんだいで ポイントを ためる → ショップで パックを あける → デッキを くむ → てきを 1体ずつ たおす
// ぼうけん（とう）・こうちく・次元渡りとは べつの モード。エンジン・カード・てきは そのまま つかう。ここは 数字と てきの じゅんばん だけ（画面は ui/packbattle.js）
import { SLOTS } from './enemies.js';
import { RAV_SLOTS } from './ravnica.js';
import { KIHON_FLOORS } from './kihon.js';
import { POOL1 } from './pool1.js';
import { SETS } from './cards.js';
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
};

// もんだい：1もんの こたえで もらえる ポイント。streak は この こたえを 入れた れんぞく せいかいの 数
export const quizGain = (right, streak) => (right ? PB.quiz + (streak > 0 && streak % PB.streakEvery === 0 ? PB.streakBonus : 0) : 0);
// たたかい：かった ときの ポイント { base, exact, total }
export function battleGain(stage, exact = 0) {
  const base = stage.boss ? PB.boss : PB.win;
  const ex = Math.min(PB.exactMax, Math.max(0, exact)) * PB.exact;
  return { base, exact: ex, total: base + ex };
}

// ---- ショップの パック ----
// みならいパック（1年生の カードプール：かんたんな 64しゅるい）と、出て いる 弾。ids か sets を openPack に わたす
export const PB_PACKS = [
  { id: 'p1', name: 'みならいパック', note: 'ルールが かんたんな カード', ids: POOL1 },
  ...SETS.filter((x) => x.released).map((x) => ({ id: `s${x.id}`, name: x.name, note: '', set: x.id, ids: x.cards.filter((d) => !d.noPack).map((d) => d.id) })),
];

// ---- てきの じゅんばん：6つの 段。すすむほど つよい ----
// AI の しらべ（パック 2〜32こ ぶんの カードで おまかせデッキ・100回ずつ）：みならい 81〜100%・テーロス かんたん 78〜100%・テーロス ふつう 43〜95%・
// ラヴニカ ふつう 66〜95%・ラヴニカ むずかしい 51〜91%・テーロス むずかしい 23〜85%（どれも さいごの ボスが いちばん ひくい）
export const PB_TIERS = [
  { id: 'kihon', name: 'みならいの みち', diff: 'easy', kihon: true, n: KIHON_FLOORS.length },
  { id: 'th-e', name: 'テーロス（かんたん）', diff: 'easy', slots: SLOTS, n: SLOTS.length },
  { id: 'th-n', name: 'テーロス（ふつう）', diff: 'normal', slots: SLOTS, n: SLOTS.length },
  { id: 'rv-n', name: 'ラヴニカ（ふつう）', diff: 'normal', slots: RAV_SLOTS, n: RAV_SLOTS.length },
  { id: 'rv-h', name: 'ラヴニカ（むずかしい）', diff: 'hard', slots: RAV_SLOTS, n: RAV_SLOTS.length },
  { id: 'th-h', name: 'テーロス（むずかしい）', diff: 'hard', slots: SLOTS, n: SLOTS.length },
];
export const PB_TOTAL = PB_TIERS.reduce((t, x) => t + x.n, 0);
// ぜんぶ たおした あと：「むずかしい」の 2つの 段を くりかえす。1しゅう ごとに てきの クリーチャーが ＋1/＋1（むげんの とうと おなじ かんがえ）
const LOOP = PB_TIERS.filter((x) => x.diff === 'hard');
const LOOP_N = LOOP.reduce((t, x) => t + x.n, 0);

// n たいめ（0 から）の てき。seed：セーブごとの 数（同じ セーブなら なんど いどんでも 同じ てき）
// → { n, tier（段の ばんごう）, tierName, i（段の 中の ばんごう）, of（段の てきの 数）, diff, boss, buff, lap, kihon: KIHON_FLOORS の 1つ | floorId }
export function stageAt(n, seed = 1) {
  let k = n, lap = 0, tiers = PB_TIERS;
  if (n >= PB_TOTAL) { lap = Math.floor((n - PB_TOTAL) / LOOP_N) + 1; k = (n - PB_TOTAL) % LOOP_N; tiers = LOOP; }
  let ti = 0;
  while (k >= tiers[ti].n) { k -= tiers[ti].n; ti++; }
  const t = tiers[ti];
  const st = { n, tier: PB_TIERS.indexOf(t), tierName: t.name, i: k, of: t.n, diff: t.diff, boss: k === t.n - 1, buff: lap, lap };
  if (t.kihon) return { ...st, kihon: KIHON_FLOORS[k] };
  const ids = t.slots[k];
  return { ...st, floorId: ids[Math.floor(seeded((seed >>> 0) + n * 7919)() * ids.length)] };
}

// ---- デッキの きまり（こうちくモードの ノーマルと おなじ：20まい・30点・2色まで・同じ カードは 4まいまで）----
// → たりない ことの ならび（なければ デッキは かんせい）。count：カードの 数、points：点、colors：色の 数、missing：もって いない カードの 数
export function deckProblems({ count, points, colors, missing }, { size = 20, cap = 30 } = {}) {
  const out = [];
  if (!count) return ['デッキが まだ ない。「デッキ」で カードを えらぼう'];
  if (count < PB.minCards) out.push(`カードが あと ${PB.minCards - count}まい たりない（${PB.minCards}まい いじょう 入れよう）`);
  if (count > size) out.push(`カードが ${count - size}まい 多い（${size}まいまで）`);
  if (points > cap) out.push(`点が ${points - cap}点 多い（${cap}点まで）`);
  if (colors > 2) out.push(`色が ${colors}色 ある（2色まで）`);
  if (missing > 0) out.push(`もって いない カードが ${missing}まい 入って いる`);
  return out;
}
