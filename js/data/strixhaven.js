// ストリクスヘイヴンの 塔（docs/STRIXHAVEN.md）：1〜5階は 5つの 寮の しけん（じゅんばんは ランダム）、6階は 卒業試験（オリークの エクタス）
// 入学式で 寮を えらぶ・ライフを ひきつぐ・休み時間・通知表 は 冒険の しくみ（ui/app.js・engine/run.js の runStrix）
import { FLOORS, KIT } from './enemies.js';
import { RAV_KIT } from './ravnica.js';
import { shuffle } from '../engine/rng.js';

const { esp, biggest, weakest, pc } = KIT;
const { lifeFloor, att, wall } = RAV_KIT;

// ---- 冒険の 数字（シミュレーションで あわせる。docs/STRIXHAVEN.md 6章）----
export const STRIX = {
  // むずかしさで かわる 数：[かんたん, ふつう, むずかしい]
  // はじめの ライフ（ひきつぐ ライフも これより ふえない）・保健室で ふえる ライフ・てきが めくる まいすう（1.25 は 4ターンに 1回 2まい）
  life: [40, 30, 22], heal: [15, 12, 10], reveal: [1, 1, 1.25],
  cont: 20, // コンティニュー（ライフは はじめの 数より ふえない）
  sets: [1, 5], // パック：ファウンデーションズ ＋ 第5弾（寮の 2色だけ）
  goodStars: 15, okStars: 10, // 通知表
};

// ---- 5つの 寮（入学式で えらぶ）。入学いわい（gift）は 寮の 誓約魔道士と 寮の 命令 ----
export const COLLEGES = {
  silverquill: { name: 'シルバークイル', cols: 'WK', subject: 'こくご', gift: ['WK08', 'WK07'], floor: 'sx_silverquill' },
  prismari: { name: 'プリズマリ', cols: 'UR', subject: 'ずこう', gift: ['UR08', 'UR07'], floor: 'sx_prismari' },
  witherbloom: { name: 'ウィザーブルーム', cols: 'KG', subject: 'りか', gift: ['KG08', 'KG07'], floor: 'sx_witherbloom' },
  lorehold: { name: 'ロアホールド', cols: 'RW', subject: 'しゃかい', gift: ['RW08', 'RW07'], floor: 'sx_lorehold' },
  quandrix: { name: 'クアンドリクス', cols: 'GU', subject: 'さんすう', gift: ['GU08', 'GU07'], floor: 'sx_quandrix' },
};
// 階 → 教科（通知表）
export const SUBJECT_OF = { ...Object.fromEntries(Object.values(COLLEGES).map((c) => [c.floor, c.subject])), sx_extus: 'そつぎょう しけん' };

// ---- 5つの 寮の きまり（6階の エクタスも 同じ ものを じゅんばんに 使う）----
const FRACTAL = wall('フラクタル', 0, 0, [], { sub: ['fractal'] });
const RULE = {
  // こくご：カウンターの ない てきの クリーチャー ぜんぶに ＋1/＋1カウンター
  silver(s, E, who) {
    const list = E.creatures(s, 'E').filter((p) => !p.ctr);
    for (const p of list) E.addCounters(s, p, 1);
    if (list.length) E.L(s, `${who}：${list.length}体に ＋1/＋1カウンター`);
  },
  // さんすう：0/0 の フラクタルに カウンター n こ
  quandrix(s, E, who, n) { E.token(s, 'E', FRACTAL, 1, { ctr: n }); E.L(s, `${who}：フラクタル（カウンター ${n}こ）`); },
  // りか：ライフが 10 より 少なければ ＋3（10 まで）
  wither(s, E, who) {
    if (s.E.life >= 10) return;
    const n = Math.min(3, 10 - s.E.life);
    s.E.life += n; E.L(s, `${who}：くすりで ライフ ＋${n}（${s.E.life}）`);
  },
  // しゃかい：墓地で いちばん パワーの 大きい クリーチャーが もどる
  lore(s, E, who) {
    const c = loreNext(s);
    if (!c) return;
    s.E.gy.splice(s.E.gy.indexOf(c), 1); E.enter(s, 'E', c.def);
    E.L(s, `${who}：${c.def.name}（パワー ${c.def.pow}）が もどった`);
  },
};
const loreNext = (s) => s.E.gy.filter((c) => c.def.types.includes('creature')).sort((a, b) => b.def.pow - a.def.pow)[0] || null;
// ずこう：めくった じゅもんが もう 1回 おきる（コピー）
function copySpell(s, d, E, who) {
  if (!d.types.includes('sorcery')) return;
  E.L(s, `${who}：${d.name} を コピー`);
  d.effect(s, E); E.sba(s);
}
const zap = (n) => (s, E) => { const t = weakest(s, E); if (t) E.damage(s, t, n, null); E.sba(s); };
const zapBig = (n) => (s, E) => { const t = biggest(s, E); if (t) E.damage(s, t, n, null); E.sba(s); };

// ===== シルバークイル（こくご）=====
const silverquill = lifeFloor({
  id: 'sx_silverquill', name: 'シルバークイルの しけん（こくご）', leader: 'シャイル', life: [10, 13, 16], reveal: STRIX.reveal,
  intent: () => 'カウンターの ない てきの クリーチャーに ＋1/＋1カウンター',
  says: { mid: 'うつくしい 一手（いって）ですね', low: 'わたしの 詩（し）が……とぎれそう', win: 'すばらしい。あなたの ことばは ほんものです', lose: 'ことばを みがいて、また いらっしゃい' },
  line: 'ことばは ちから。わたしの ことばで、みんなが 1つずつ つよく なるのです',
  goal: 'シャイルの ライフを 0に する。てきの ターンの はじめに、カウンターの ない てきの クリーチャー ぜんぶに ＋1/＋1カウンターが 1こ のる。',
  deck: [[4, att('シルバークイルの 学生', 2, 1)], [3, att('インクリング', 1, 1, ['flying'])], [2, att('詩人（しじん）の 吸血鬼（きゅうけつき）', 2, 3)],
    [3, esp('ことばの 矢（や）', zap(2), { danger: 3 })], [2, esp('ほめことば', (s, E) => { for (const p of E.creatures(s, 'E')) E.addCounters(s, p, 1); }, { danger: 3 })]],
  turnStart(s, E) { RULE.silver(s, E, 'シャイル'); },
  extra: 1,
});

// ===== プリズマリ（ずこう）=====
const prismari = lifeFloor({
  id: 'sx_prismari', name: 'プリズマリの しけん（ずこう）', leader: 'ウヴィルダ', life: [11, 14, 18], reveal: STRIX.reveal,
  intent: () => 'てきの じゅもんは 2回 おきる',
  says: { mid: 'あら、いい センスね', low: 'さくひんが くずれて いく……！', win: 'あなたこそ さいこうの さくひんよ', lose: 'もっと 大きく えがきなさい' },
  line: 'げいじゅつは 1回では おわらない。わたしの じゅもんは 2回 かがやくの！',
  goal: 'ウヴィルダの ライフを 0に する。てきが めくった じゅもんは 2回 おきる（コピー）。',
  deck: [[4, att('プリズマリの 学生', 2, 1)], [2, att('ほのおの エレメンタル', 3, 3)], [2, att('氷（こおり）の 彫刻家（ちょうこくか）', 1, 4)],
    [3, esp('火（ひ）の 絵筆（えふで）', zap(2), { danger: 3 })], [2, esp('かがやく 色（いろ）', (s, E) => E.hurt(s, 1), { danger: 2 })],
    [2, esp('大きな 作品（さくひん）', (s, E) => E.token(s, 'E', att('作品の エレメンタル', 2, 2)), { danger: 3 })]],
  hooks: { onReveal(s, d, E) { copySpell(s, d, E, 'ウヴィルダ'); } },
  extra: 2,
});

// ===== ウィザーブルーム（りか）=====
const witherbloom = lifeFloor({
  id: 'sx_witherbloom', name: 'ウィザーブルームの しけん（りか）', leader: 'リゼット', life: [12, 15, 19], reveal: STRIX.reveal,
  intent: (s) => (s.E.life < 10 ? `リゼットの ライフが 10 より 少ない：くすりで ＋${Math.min(3, 10 - s.E.life)}` : 'リゼットの ライフが 10 より 少なく なると くすりで ＋3'),
  says: { mid: 'いたた。くすりを 用意（ようい）しなきゃ', low: 'くすりが まにあわない……！', win: 'よく そだったわね。ごうかくよ', lose: 'しっかり やすんで、また おいで' },
  line: 'くすりの じかんよ。ライフが 10 より へったら、すぐに なおすからね',
  goal: 'リゼットの ライフを 0に する。リゼットの ライフが 10 より 少ない とき、てきの ターンの はじめに くすりで ライフ ＋3（10 まで）。',
  deck: [[4, att('ウィザーブルームの 学生', 2, 2)], [4, att('ペスト', 1, 1)], [2, att('いばらの 獣（けもの）', 3, 3)],
    [2, esp('にがい くすり', (s) => { s.E.life += 2; }, { danger: 1 })], [2, esp('しおれる のろい', (s, E) => { const t = weakest(s, E); if (t) E.addMinus(s, t, 1, 'E'); E.sba(s); }, { danger: 2 })]],
  turnStart(s, E) { RULE.wither(s, E, 'リゼット'); },
});

// ===== ロアホールド（しゃかい）=====
const lorehold = lifeFloor({
  id: 'sx_lorehold', name: 'ロアホールドの しけん（しゃかい）', leader: 'アウグスタ', life: [11, 14, 18], reveal: STRIX.reveal,
  intent: (s) => { const c = loreNext(s); return (s.E.flags.lh || 0) % 2 ? 'こんどは もどらない' : c ? `つぎに もどる：${c.def.name}（パワー ${c.def.pow}）` : 'ぼちに クリーチャーが いない'; },
  says: { mid: 'ふむ、れきしに のこる 一撃（いちげき）だ', low: 'これも また れきし か……', win: 'きみの なまえは れきしに のこるだろう', lose: 'れきしを まなびなおして きなさい' },
  line: 'れきしは くりかえす。たおれた ものは、いちばん つよい ものから もどって くるぞ',
  goal: 'アウグスタの ライフを 0に する。2ターンに 1回、てきの ターンの はじめに、てきの 墓地（ぼち）で いちばん パワーの 大きい クリーチャーが もどる。',
  deck: [[4, att('ロアホールドの 学生', 2, 2)], [3, att('むかしの 英雄（えいゆう）の 霊（れい）', 3, 2)], [2, att('れきしの ゴーレム', 4, 4)],
    [2, esp('はっくつ', (s, E) => RULE.lore(s, E, 'はっくつ'), { danger: 3 })], [3, esp('火（ひ）と きまり', zapBig(3), { danger: 3 })]],
  turnStart(s, E) { const k = s.E.flags.lh || 0; s.E.flags.lh = k + 1; if (k % 2 === 0) RULE.lore(s, E, 'アウグスタ'); },
  extra: 1,
});

// ===== クアンドリクス（さんすう）=====
const quandrixN = (s) => 2 * (((s.E.flags.qn || 0) % 4) + 1); // 2・4・6・8・2・4…
const quandrix = lifeFloor({
  id: 'sx_quandrix', name: 'クアンドリクスの しけん（さんすう）', leader: 'キアン', life: [10, 13, 16], reveal: STRIX.reveal,
  intent: (s) => ((s.E.flags.qt || 0) % 2 ? 'こんどは フラクタルが 出ない' : `フラクタルが 出る（カウンター ${quandrixN(s)}こ）`),
  says: { mid: 'いい 計算（けいさん）だ', low: 'わたしの 式（しき）が とかれて しまう！', win: 'せいかい！ みごとな 計算だった', lose: 'もう いちど 計算しなおそう' },
  line: 'すうがくの しけんだ。フラクタルは 2、4、6、8 と ふえて いくよ',
  goal: 'キアンの ライフを 0に する。2ターンに 1回、てきの ターンの はじめに 0/0 の フラクタル（こうげき しない）が 出る。カウンターは 2・4・6・8（8の つぎは 2）。',
  deck: [[4, att('クアンドリクスの 学生', 2, 2)], [3, att('数（かず）の 研究者（けんきゅうしゃ）', 1, 3)], [2, att('くりかえす ドレイク', 2, 2, ['flying'])],
    [3, esp('ふえる まほう', (s, E) => { for (const p of E.creatures(s, 'E')) E.addCounters(s, p, 1); }, { danger: 3 })],
    [2, esp('もどる 計算（けいさん）', (s, E) => { const t = biggest(s, E); if (t) E.bounce(s, t); }, { danger: 3 })]],
  // 2ターンに 1回（まいターンだと フラクタルの かべで たたかいが 長く なりすぎた：勝率 58%・山札切れ 60%）
  turnStart(s, E) { const k = s.E.flags.qt || 0; s.E.flags.qt = k + 1; if (k % 2) return; RULE.quandrix(s, E, 'キアン', quandrixN(s)); s.E.flags.qn = (s.E.flags.qn || 0) + 1; },
  hooks: { priority(s, p, E) { return p.def.sub?.includes('fractal') ? 1 : E.power(s, p) * 2 + 1; } },
});

// ===== 6階 卒業試験：オリークの エクタス（5教科を じゅんばんに）=====
const EXAM = [
  { name: 'こくご', text: 'カウンターの ない てきの クリーチャーに ＋1/＋1カウンター', run: (s, E) => RULE.silver(s, E, 'エクタス') },
  { name: 'さんすう', text: 'フラクタル（カウンター 4こ）', run: (s, E) => RULE.quandrix(s, E, 'エクタス', 4) },
  { name: 'りか', text: 'エクタスの ライフが 10 より 少なければ くすりで ＋3', run: (s, E) => RULE.wither(s, E, 'エクタス') },
  { name: 'しゃかい', text: 'ぼちで いちばん パワーの 大きい クリーチャーが もどる', run: (s, E) => RULE.lore(s, E, 'エクタス') },
  { name: 'ずこう', text: 'この ターンの じゅもんは 2回 おきる', run: (s) => { s.E.flags.turn.copy = true; } },
];
const examNow = (s) => EXAM[(s.E.flags.exam || 0) % EXAM.length];
const extus = lifeFloor({
  id: 'sx_extus', name: 'そつぎょう しけん：オリークの エクタス', leader: 'エクタス', life: [16, 22, 28], reveal: STRIX.reveal,
  intent: (s) => `つぎの 教科：${examNow(s).name}（${examNow(s).text}）`,
  says: { mid: 'ほう、5教科を こなすか', low: 'ばかな……オリークの 仮面（かめん）が……！', win: 'みとめよう……きみは ほんものの まほうつかいだ', lose: 'そつぎょうは とりけしだ！' },
  line: 'そつぎょう？ させるものか。5つの 寮（りょう）の まほうは すべて わたしの ものだ',
  goal: 'エクタスの ライフを 0に する。てきの ターンの はじめに、5つの 寮（りょう）の きまりを 1つずつ じゅんばんに つかう（こくご → さんすう → りか → しゃかい → ずこう）。',
  deck: [[4, att('オリークの 仮面（かめん）の 生徒（せいと）', 2, 2)], [3, att('オリークの 魔道士（まどうし）', 3, 2)], [1, att('血（ち）の 化身（けしん）', 5, 5, ['trample'])],
    [2, esp('ぬすんだ まほう', zapBig(3), { danger: 3 })], [2, esp('かげの 授業（じゅぎょう）', (s, E) => E.hurt(s, 2), { danger: 2 })], [2, esp('仮面（かめん）の むれ', (s, E) => E.token(s, 'E', att('オリークの 仮面（かめん）の 生徒（せいと）', 2, 2), 2), { danger: 3 })]],
  turnStart(s, E) { const x = examNow(s); E.L(s, `エクタス：${x.name}`); x.run(s, E); s.E.flags.exam = (s.E.flags.exam || 0) + 1; },
  hooks: {
    onReveal(s, d, E) { if (s.E.flags.turn.copy) copySpell(s, d, E, 'エクタス'); },
    priority(s, p, E) { return p.def.sub?.includes('fractal') ? 1 : E.power(s, p) * 2 + 1; },
  },
  extra: 2,
});

export const STRIXHAVEN = { sx_silverquill: silverquill, sx_prismari: prismari, sx_witherbloom: witherbloom, sx_lorehold: lorehold, sx_quandrix: quandrix, sx_extus: extus };
Object.assign(FLOORS, STRIXHAVEN);
// 1〜5階：5つの 寮（ランダムな じゅんばん）、6階：エクタス
// むずかしさの 数を とる
export const byDiff = (arr, diff) => arr[{ easy: 0, normal: 1, hard: 2 }[diff] ?? 1];
export const pickStrix = (rng) => [...shuffle(rng, Object.values(COLLEGES).map((c) => c.floor)), 'sx_extus'];
export const STRIX_NAMES = Object.fromEntries(Object.entries(STRIXHAVEN).map(([k, f]) => [k, f().name]));

// ---- 授業：カードを ずっと 強く する（n 回ぶん）。クリーチャーは ＋n/＋n、ほかは コスト −n（色の マナより 下には ならない）----
const pipsOf = (d) => [...(d.color || '')].length;
export function grown(d, n) {
  if (!n) return d;
  if (d.types?.includes('creature') && typeof d.pow === 'number') return { ...d, pow: d.pow + n, tou: d.tou + n, grown: n };
  return { ...d, cost: Math.max(pipsOf(d), d.cost - n), grown: n };
}
export const growText = (d) => (d.types?.includes('creature') ? '＋1/＋1' : 'コスト −1');

// ---- 通知表：階ごとに ★ 3つまで（かった・ぴったり・へった ライフが 4 いか）----
export const starsOf = (r) => (r.win && !r.continued ? 1 : 0) + (r.win && r.exact > 0 ? 1 : 0) + (r.win && r.lost <= 4 ? 1 : 0);
export const gradeOf = (stars) => (stars >= STRIX.goodStars ? 'たいへん よく できました' : stars >= STRIX.okStars ? 'よく できました' : 'がんばりました');
