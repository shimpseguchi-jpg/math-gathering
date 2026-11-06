// 次元渡り（大人向けモード。docs/SPIRE.md）：数字・ふつうの敵・レリック・ポーション・イベント
// このモードの文字は大人向けのふつうの日本語（ふりがななし。tools/kanji.mjs の対象外）
import { FLOORS, KIT } from './enemies.js';
import { RAV_KIT } from './ravnica.js';
import './strixhaven.js'; // FLOORS に寮の階を足す
import { sp, burn, draw, hit, T } from './kit.js';
import { SUN_RING } from './cards.js';
import { shuffle } from '../engine/rng.js';

const { esp, pc, biggest, weakest, build, toLib, attackers, sumPow } = KIT;
const { att, wall, speak } = RAV_KIT;

// ---- 冒険の数字（シミュレーションで合わせる。docs/SPIRE.md 10章）----
export const SPIRE = {
  maxLife: 50, gold: 99, rows: 9, lanes: 4, paths: 4,
  restHeal: 0.3, potionSlots: 3, potionChance: 0.4,
  goldOf: { fight: [10, 20], elite: [25, 35], boss: [95, 105] },
  // カード報酬のレア度（R・U の確率。のこりは C。R のうち 1/8 はレジェンド）
  odds: { fight: { R: 0.03, U: 0.37 }, elite: { R: 0.1, U: 0.4 } },
  price: { C: 50, U: 75, R: 150, L: 200 }, relicPrice: { C: 150, U: 250, R: 300 }, potionPrice: { C: 50, U: 75, R: 100 },
  removeBase: 75, removeStep: 25,
  maxAsc: 10,
  eliteBuff: 1, // エリートの敵クリーチャーは ＋1/＋1（アセンション 3 でさらに ＋1）
  stall: 15, // このターンから「次元のゆらぎ」：毎ターン 1・2・3…点（墓地をまぜてもライフは失わない）
  // マスの重み（2章）
  weights: { fight: 45, event: 22, elite: 16, rest: 12, shop: 7 },
};

// ---- アセンション（7章）----
export const ASC = [
  '',
  'エリートが出やすい',
  'ふつうの敵のライフ ＋20%',
  'エリートの敵クリーチャー ＋1/＋1',
  'ボスの難しさが「むずかしい」',
  'ボスのあとの回復が 75%',
  'はじめのライフが最大の 90%',
  'ふつうの敵が山札を 1.25 枚ずつめくる',
  'エリートの難しさが「むずかしい」',
  '金貨 −25%',
  'はじめのデッキに呪い「後悔」',
];

// ---- ふつうの敵（ライフを持つ本体 ＋ 山札。山札がなくなると墓地をまぜてもどす）----
// hint：予告に出す呪文の説明
const sorc = (name, hint, effect, danger = 2) => esp(name, effect, { danger, hint });
const hitWeak = (n) => (s, E) => { const t = weakest(s, E); if (t) E.damage(s, t, n, null); else E.hurt(s, n); E.sba(s); };
const hitBig = (n) => (s, E) => { const t = biggest(s, E); if (t) E.damage(s, t, n, null); else E.hurt(s, n); E.sba(s); };
const sweep = (n) => (s, E) => { for (const p of pc(s, E)) E.damage(s, p, n, null); E.sba(s); };
const pumpAll = (a, b, kw = []) => (s, E) => { for (const p of E.creatures(s, 'E')) E.pump(p, a, b, kw); };
const ctrAll = (n) => (s, E) => { for (const p of E.creatures(s, 'E')) E.addCounters(s, p, n); };
const tapBig = (n) => (s, E) => { for (const t of pc(s, E).filter((p) => !p.tapped).sort((a, b) => E.power(s, b) - E.power(s, a)).slice(0, n)) t.tapped = true; };
const raise = (n) => (s, E) => { for (let i = 0; i < n; i++) { const k = s.E.gy.findIndex((c) => c.def.types.includes('creature')); if (k < 0) return; const [c] = s.E.gy.splice(k, 1); E.enter(s, 'E', c.def); } };
const drain = (n) => (s, E) => { E.hurt(s, n); s.E.life += n; E.L(s, `ライフを ${n} 吸われた（敵 ${s.E.life}）`); };
const lifeOnDeath = (n) => ({ onLeave(s, p, E, o) { if (p.side === 'E' && o?.died && E.isCreature(p)) { s.E.life += n; E.L(s, `敵のライフ ＋${n}（${s.E.life}）`); } } });
// 侵略者（次元渡りだけ）の わざ
const hurtN = (n) => (s, E) => E.hurt(s, n);
const spawn = (name, pow, tou, n = 1, kw = []) => (s, E) => E.token(s, 'E', att(name, pow, tou, kw), n);
const killBig = (n) => (s, E) => { for (let i = 0; i < n; i++) { const t = biggest(s, E); if (!t) break; E.L(s, `${t.def.name} を破壊`); E.destroy(s, t); E.sba(s); } };
// 墓地へ（生贄。破壊不能でも 墓地へ）。big：大きいほうから
const sac = (n, big = false) => (s, E) => { for (let i = 0; i < n; i++) { const t = big ? biggest(s, E) : weakest(s, E); if (!t) break; E.L(s, `${t.def.name} を墓地へ`); E.leave(s, t, 'gy', { died: true }); E.sba(s); } };
const minusWeak = (n) => (s, E) => { const t = weakest(s, E); if (t) E.addMinus(s, t, n, 'E'); E.sba(s); };
// 手札を ランダムに 捨てさせる（ポーション・もんしょうの カードは のこす）
const discardRand = (n) => (s, E) => { for (let i = 0; i < n; i++) { const h = s.P.hand.filter((c) => !c.def.potion && !c.emblem); if (!h.length) return; E.discard(s, [h[Math.floor(s.rng() * h.length)]]); } };
// 山札の 上から 追放（この 戦闘の あいだ もどらない）・墓地を ぜんぶ 追放
const exileTop = (n) => (s, E) => { const ex = s.P.lib.splice(0, n); s.P.exile.push(...ex); if (ex.length) E.L(s, `あなたの山札の上から ${ex.length}枚を追放：${ex.map((c) => c.def.name).join('、')}`); };
const exileGy = (s, E) => { const n = s.P.gy.length; s.P.exile.push(...s.P.gy.splice(0)); if (n) E.L(s, `あなたの墓地の ${n}枚を追放`); };
// n ターンごとの わざ（敵の ターンの はじめ）。left：つぎまで あと 何ターンか（1 なら つぎの 敵の ターン）
const every = (n, fx) => (s, E) => { s.E.flags.t = (s.E.flags.t || 0) + 1; if (s.E.flags.t % n === 0) fx(s, E); };
const left = (s, n) => n - ((s.E.flags.t || 0) % n);
const soon = (s, n, what) => (left(s, n) === 1 ? `つぎの敵のターンのはじめに、${what}` : `${left(s, n)}ターンごとに ${what}（あと ${left(s, n)}ターン）`);
// 3段階（ライフ 2/3・1/3 で かわる）
const phaseOf = (s) => (s.E.life > (s.E.lifeMax * 2) / 3 ? 1 : s.E.life > s.E.lifeMax / 3 ? 2 : 3);

export const MONSTERS = {
  // ===== 第1幕 テーロス =====
  sp_satyrs: { name: 'サテュロスの悪童たち', life: 11, deck: [[4, att('サテュロスの悪童', 1, 1, ['haste'])], [3, att('酔いどれサテュロス', 2, 1)], [2, sorc('はやし立て', '敵のクリーチャーすべて ＋1/＋0', pumpAll(1, 0), 3)], [1, sorc('投石', 'いちばん小さいクリーチャーに 1点', hitWeak(1))]] },
  sp_harpies: { name: 'ハーピーの群れ', life: 10, deck: [[5, att('ハーピー', 1, 1, ['flying'])], [1, att('ハーピーの長', 2, 2, ['flying'])], [2, sorc('急降下', 'あなたに 2点', (s, E) => E.hurt(s, 2), 3)], [2, sorc('金切り声', 'いちばん大きいクリーチャーをタップ', tapBig(1))]] },
  sp_minotaur: { name: '迷宮のミノタウロス', life: 13, deck: [[3, att('ミノタウロスの戦士', 3, 2)], [2, att('ミノタウロスの斧使い', 2, 3)], [2, wall('迷宮の壁', 0, 4)], [2, sorc('突進', '敵のクリーチャーすべて ＋1/＋0・トランプル', pumpAll(1, 0, ['trample']), 3)], [1, sorc('角で突く', 'いちばん大きいクリーチャーに 3点', hitBig(3), 3)]] },
  sp_centaurs: { name: 'ケンタウロスの射手隊', life: 16, deck: [[3, att('ケンタウロスの射手', 2, 2, ['reach'])], [3, att('ケンタウロスの戦士', 3, 3)], [2, sorc('一斉射撃', 'あなたのクリーチャーすべてに 1点', sweep(1), 3)], [1, sorc('蹄の突撃', '敵のクリーチャーすべて ＋1/＋1', pumpAll(1, 1), 3)], [1, sorc('狩りの角笛', '1/1 の猟犬を 2体', (s, E) => E.token(s, 'E', att('猟犬', 1, 1), 2), 2)]] },
  sp_cyclops: { name: 'サイクロプスの番人', life: 18, deck: [[2, att('サイクロプス', 5, 4)], [3, att('岩運び', 2, 2)], [2, wall('洞窟の番犬', 2, 3)], [2, sorc('岩投げ', 'いちばん大きいクリーチャーに 4点', hitBig(4), 4)], [1, sorc('地響き', 'クリーチャー 2体をタップ', tapBig(2), 3)]] },
  sp_nyx: { name: 'ニクスの獣たち', life: 15, deck: [[3, att('ニクスの獣', 3, 3)], [2, att('星屑の狐', 2, 1, ['flying'])], [2, wall('星の守り手', 1, 4)], [2, sorc('星の加護', '敵のクリーチャーすべてに ＋1/＋1カウンター', ctrAll(1), 3)], [1, sorc('夜の帳', 'いちばん大きいクリーチャーに −1/−1カウンター 2個', (s, E) => { const t = biggest(s, E); if (t) E.addMinus(s, t, 2, 'E'); E.sba(s); }, 3)]] },
  // ===== 第2幕 ラヴニカ =====
  sp_jesters: { name: 'ラクドスの道化団', life: 15, deck: [[4, att('道化師', 2, 1, ['haste'])], [2, att('火吹き芸人', 3, 2)], [2, sorc('客いじり', 'あなたに 2点', (s, E) => E.hurt(s, 2), 3)], [2, sorc('炎の輪', 'いちばん小さいクリーチャーに 2点', hitWeak(2), 3)]] },
  sp_rotters: { name: 'ゴルガリの腐れ者', life: 16, intent: () => '敵のクリーチャーが死ぬと敵のライフ ＋1', hooks: lifeOnDeath(1), deck: [[4, att('ゴルガリのゾンビ', 2, 2)], [3, att('腐肉の蛆', 1, 1)], [1, att('苔の巨人', 4, 5)], [2, sorc('墓から這い出る', '墓地のクリーチャーを 1体もどす', raise(1), 3)]] },
  sp_weirds: { name: 'イゼットの奇魔', life: 14, deck: [[3, wall('奇魔', 0, 3)], [3, att('稲妻の奇魔', 3, 1)], [2, sorc('電撃', 'いちばん大きいクリーチャーに 3点', hitBig(3), 3)], [2, sorc('過負荷', 'あなたのクリーチャーすべてに 1点・あなたに 1点', (s, E) => { sweep(1)(s, E); E.hurt(s, 1); }, 3)]] },
  sp_raiders: { name: 'グルールの略奪団', life: 22, deck: [[3, att('略奪者', 3, 2, ['haste'])], [2, att('グルールの猪', 4, 4, ['trample'])], [1, att('破壊者サイクロプス', 6, 5, ['trample'])], [1, sorc('血の渇き', '敵のクリーチャーすべて ＋2/＋0', pumpAll(2, 0), 4)], [2, sorc('踏み荒らし', 'いちばん小さいクリーチャーに 3点', hitWeak(3), 3)], [1, sorc('鬨の声', '1/1 の略奪者見習いを 2体', (s, E) => E.token(s, 'E', att('略奪者見習い', 1, 1), 2), 2)]] },
  sp_tithe: { name: 'オルゾフの徴税人', life: 20, deck: [[3, att('スラル', 1, 1)], [2, wall('聖堂の衛兵', 2, 4)], [2, att('オルゾフの騎士', 3, 3, ['flying'])], [3, sorc('徴税', 'あなたに 2点・敵のライフ ＋2', drain(2), 3)]] },
  sp_krasis: { name: 'シミックの実験体', life: 21, deck: [[3, att('実験体', 2, 2)], [2, att('クラーケンの子', 3, 4)], [2, att('うみへびの子', 2, 2, ['flying'])], [2, sorc('適応', 'いちばん大きい敵に ＋1/＋1カウンター 2個', (s, E) => { const t = E.creatures(s, 'E').sort((a, b) => E.power(s, b) - E.power(s, a))[0]; if (t) E.addCounters(s, t, 2); }, 3)], [1, sorc('急成長', '敵のクリーチャーすべてに ＋1/＋1カウンター', ctrAll(1), 3)]] },
  // ===== 第3幕 ストリクスヘイヴン =====
  sp_brooms: { name: '暴走する箒', life: 18, deck: [[5, att('魔法の箒', 2, 1, ['flying'])], [2, sorc('掃き出し', 'クリーチャー 2体をタップ', tapBig(2), 3)], [2, sorc('ほこりの嵐', 'あなたのクリーチャーすべてに 1点', sweep(1), 3)], [1, att('箒の主', 3, 3, ['flying'])]] },
  sp_pests: { name: 'ペストの群れ', life: 19, intent: () => '敵のクリーチャーが死ぬと敵のライフ ＋1', hooks: lifeOnDeath(1), deck: [[5, att('ペスト', 1, 1)], [2, att('沼の大ペスト', 3, 3)], [2, sorc('繁殖', '1/1 のペストを 2体', (s, E) => E.token(s, 'E', att('ペスト', 1, 1), 2), 2)], [1, sorc('吸精', 'あなたに 2点・敵のライフ ＋2', drain(2), 3)]] },
  sp_inklings: { name: '墨獣の群れ', life: 18, deck: [[4, att('墨獣', 2, 1, ['flying'])], [2, wall('インク溜まり', 0, 5)], [2, sorc('黒い染み', 'いちばん大きいクリーチャーに −1/−1カウンター', (s, E) => { const t = biggest(s, E); if (t) E.addMinus(s, t, 1, 'E'); E.sba(s); }, 3)], [2, sorc('呪文の抜き書き', 'あなたに 3点', (s, E) => E.hurt(s, 3), 3)]] },
  sp_fractals: { name: '暴れフラクタル', life: 26, intent: () => '敵のターンのはじめに、カウンターが 2倍（8まで）', deck: [[3, att('フラクタル', 2, 2)], [2, att('大フラクタル', 4, 4)], [2, wall('方程式の壁', 0, 6)], [2, sorc('倍化', '敵のクリーチャーすべてに ＋1/＋1カウンター', ctrAll(1), 3)], [1, sorc('無限級数', 'あなたに 3点', (s, E) => E.hurt(s, 3), 3)]],
    turnStart(s, E) { for (const p of E.creatures(s, 'E')) if (p.ctr > 0) E.addCounters(s, p, Math.min(8, p.ctr * 2) - p.ctr); } },
  sp_elementals: { name: 'プリズマリの精霊', life: 25, deck: [[3, att('炎の精霊', 4, 2, ['haste'])], [2, att('嵐の精霊', 3, 3, ['flying'])], [1, att('溶岩の巨像', 6, 6)], [2, sorc('芸術の爆発', 'あなたのクリーチャーすべてに 2点', sweep(2), 4)], [2, sorc('即興曲', 'あなたに 3点', (s, E) => E.hurt(s, 3), 3)]] },
  sp_spirits: { name: 'ロアホールドの霊', life: 27, deck: [[3, att('過去の霊', 2, 2, ['flying'])], [2, att('戦史の霊', 4, 4)], [2, wall('石の衛兵', 1, 5)], [2, sorc('呼び起こし', '墓地のクリーチャーを 2体もどす', raise(2), 4)], [1, sorc('歴史の再演', '敵のクリーチャーすべて ＋2/＋2', pumpAll(2, 2), 4)]] },

  // ===== 侵略者（次元渡りだけ。2026-11-05）：ファイレクシア（第1幕）・ニコル・ボーラス（第2幕）・エルドラージ（第3幕）=====
  // --- ファイレクシア：手下 ---
  sp_phyx_scouts: { name: 'ファイレクシアの先兵', life: 12, deck: [[4, att('ぎらつく油の斥候', 1, 1, ['haste'])], [2, att('ファイレクシアの歩兵', 2, 2)], [2, sorc('油の浸食', 'いちばん小さいクリーチャーに −1/−1カウンター', minusWeak(1), 3)], [2, wall('鉄の殻', 0, 3)]] },
  sp_phyx_host: { name: '完成化の軍勢', life: 17, deck: [[3, att('完成化した兵', 2, 3)], [2, att('ファイレクシアの巨獣', 4, 3)], [2, sorc('完成化', '敵のクリーチャーすべてに ＋1/＋1カウンター', ctrAll(1), 3)], [2, sorc('油の刃', 'いちばん大きいクリーチャーに 3点', hitBig(3), 3)], [1, wall('侵略の門', 0, 6)]] },
  sp_phyx_ship: { name: 'ファイレクシアの侵略艦', life: 18, intent: (s) => soon(s, 2, '1/1 のファイレクシアの幼体が出る'), turnStart: every(2, spawn('ファイレクシアの幼体', 1, 1)),
    deck: [[3, att('降下兵', 2, 2, ['flying'])], [2, att('ファイレクシアの処刑者', 4, 4)], [2, sorc('一斉降下', '1/1 の幼体を 2体', spawn('ファイレクシアの幼体', 1, 1, 2), 2)], [2, sorc('艦砲射撃', 'あなたのクリーチャーすべてに 1点', sweep(1), 3)]] },
  // --- ファイレクシアの 法務官（第1幕の ボス。5体から 1体）---
  sp_norn: { boss: true, name: '大修道士、エリシュ・ノーン', speaker: 'エリシュ・ノーン', life: 28, blurb: '敵のターンのはじめに、あなたのクリーチャーすべてに 1点',
    lines: { start: 'すべての肉は、完成されねばならない。', mid: '抗うほどに、痛みは増すだけだ。', low: 'なぜ……完成を拒む……', pinch: '跪け。それが救いだ。' },
    intent: () => '敵のターンのはじめに、あなたのクリーチャーすべてに 1点', turnStart: sweep(1),
    deck: [[3, att('ファイレクシアの聖戦士', 2, 2, ['vigilance'])], [2, att('白金の天使', 3, 3, ['flying'])], [2, wall('完成化の守り手', 1, 4)], [2, sorc('完成化の啓示', '敵のクリーチャーすべて ＋1/＋1', pumpAll(1, 1), 3)], [1, sorc('剥き出しの法', 'いちばん大きいクリーチャーを破壊', killBig(1), 4)]] },
  sp_jin: { boss: true, name: '核の占い師、ジン＝ギタクシアス', speaker: 'ジン＝ギタクシアス', life: 28, blurb: '敵のターンのはじめに、あなたの手札を 1枚捨てさせる',
    lines: { start: 'お前の知識は、我が研究の糧となる。', mid: '興味深い。だが無駄だ。', low: 'この誤差は……計算外だ……', pinch: '結論は出た。お前は失敗作だ。' },
    intent: () => '敵のターンのはじめに、あなたの手札を 1枚捨てさせる', turnStart: discardRand(1),
    deck: [[3, att('ファイレクシアの思考刈り', 2, 1, ['flying'])], [2, wall('嘲笑う詮索者', 1, 5)], [2, att('ギタクシアの探究者', 3, 3)], [2, sorc('知識の剥奪', 'あなたの手札を 1枚捨てさせる', discardRand(1), 3)], [1, sorc('思考の侵食', 'クリーチャー 2体をタップ', tapBig(2), 3)]] },
  sp_sheol: { boss: true, name: '囁くもの、シェオルドレッド', speaker: 'シェオルドレッド', life: 26, blurb: '2ターンごとに、あなたのいちばん小さいクリーチャーを墓地へ',
    lines: { start: '死は終わりではない。我が下僕となる始まりだ。', mid: '倒れた者は、すべて私のものだ。', low: 'まだ……死は私の味方……', pinch: 'さあ、こちらへおいで。' },
    intent: (s) => soon(s, 2, 'あなたのいちばん小さいクリーチャーを墓地へ'), turnStart: every(2, sac(1)),
    deck: [[3, att('ファイレクシアの屍術士', 2, 2)], [2, att('墓所の這い者', 3, 2)], [2, sorc('鉄の蘇生', '墓地のクリーチャーを 1体もどす', raise(1), 3)], [2, wall('骨の壁', 0, 4)], [1, sorc('死の囁き', 'あなたに 2点・敵のライフ ＋2', drain(2), 3)]] },
  sp_ura: { boss: true, name: '隠れしウラブラスク', speaker: 'ウラブラスク', life: 28, blurb: '敵のクリーチャーはすべて速攻。敵のターンのはじめに、あなたに 1点',
    lines: { start: '炉の火は、すべてを鍛え直す。', mid: 'いい火花だ。もっと燃えろ。', low: '炉が……冷えていく……', pinch: '燃え尽きるがいい。' },
    intent: () => '敵のターンのはじめに、あなたに 1点（敵のクリーチャーはすべて速攻）', turnStart: hurtN(1),
    deck: [[3, att('溶鉱炉の狂信者', 2, 1, ['haste'])], [2, att('ファイレクシアの溶鉄獣', 4, 2, ['haste'])], [2, sorc('溶けた鉄', 'いちばん大きいクリーチャーに 3点', hitBig(3), 3)], [2, sorc('煉獄の炎', 'あなたのクリーチャーすべてに 1点', sweep(1), 3)], [1, att('灼熱の巨人', 5, 4, ['haste', 'trample'])]] },
  sp_vori: { boss: true, name: '飢餓の声、ヴォリンクレックス', speaker: 'ヴォリンクレックス', life: 28, blurb: '2ターンごとに、敵のクリーチャーすべてに ＋1/＋1カウンター',
    lines: { start: '喰らい、育ち、すべてを覆い尽くせ。', mid: '肉が足りぬ。もっと寄越せ。', low: '飢えが……満たされぬ……', pinch: 'お前も我が群れの餌だ。' },
    intent: (s) => soon(s, 2, '敵のクリーチャーすべてに ＋1/＋1カウンター'), turnStart: every(2, ctrAll(1)),
    deck: [[3, att('ファイレクシアの捕食獣', 2, 2)], [2, att('寄生の大蛇', 3, 3, ['trample'])], [2, wall('鉄皮の巨体', 1, 5)], [2, sorc('増殖する肉', '1/1 のファイレクシアの幼体を 2体', spawn('ファイレクシアの幼体', 1, 1, 2), 2)], [1, sorc('飢えた咆哮', '敵のクリーチャーすべて ＋2/＋0・トランプル', pumpAll(2, 0, ['trample']), 4)]] },

  // --- ニコル・ボーラス：手下 ---
  sp_dread: { name: '戦慄衆の群れ', life: 14, deck: [[4, att('戦慄衆の歩兵', 2, 2)], [2, att('戦慄衆の射手', 1, 3, ['reach'])], [2, sorc('戦慄衆の復活', '墓地のクリーチャーを 1体もどす', raise(1), 3)], [2, sorc('灯の収穫', 'あなたに 2点・敵のライフ ＋2', drain(2), 3)]] },
  sp_eternal: { name: '永遠衆の軍団', life: 20, deck: [[3, att('永遠衆の兵', 3, 3)], [2, att('永遠衆の巨人', 5, 5)], [2, sorc('苦悶', 'あなたに 3点', hurtN(3), 3)], [2, sorc('進軍の号令', '敵のクリーチャーすべて ＋1/＋1', pumpAll(1, 1), 3)], [1, wall('龍神の霊廟', 0, 6)]] },
  sp_oketra: { name: '永遠神オケチラ', life: 20, intent: (s) => soon(s, 2, '2/2 の永遠衆の戦士が出る'), turnStart: every(2, spawn('永遠衆の戦士', 2, 2)),
    deck: [[3, att('オケチラの信徒', 2, 2, ['vigilance'])], [2, att('永遠衆の弓兵', 2, 3, ['reach'])], [2, sorc('神の加護', '敵のクリーチャーすべて ＋1/＋1', pumpAll(1, 1), 3)], [2, sorc('永遠化', '墓地のクリーチャーを 1体もどす', raise(1), 3)], [1, sorc('裁きの光', 'いちばん大きいクリーチャーをタップ', tapBig(1), 3)]] },
  // --- ニコル・ボーラス（第2幕の ボス）：3段階 ---
  sp_bolas: { boss: true, name: '龍神、ニコル・ボーラス', speaker: 'ニコル・ボーラス', life: 26, phases: true,
    blurb: '3段階：戦慄衆を呼ぶ → 手札を捨てさせる → いちばん大きいクリーチャーを破壊',
    lines: { start: '我は神。この多元宇宙で、私にひざまずかぬ者はいない。', p2: '小賢しい。その思考ごと砕いてやろう。', p3: '思い上がるな、定命の者よ！', low: 'ありえぬ……この私が……！', pinch: '終わりだ。灯ごと消えるがいい。' },
    intent: (s) => [soon(s, 2, '2/2 の戦慄衆が出る'), '敵のターンのはじめに、あなたの手札を 1枚捨てさせる', '敵のターンのはじめに、あなたのいちばん大きいクリーチャーを破壊'][phaseOf(s) - 1],
    turnStart(s, E) {
      const ph = phaseOf(s);
      if (ph === 1) every(2, spawn('戦慄衆の歩兵', 2, 2))(s, E);
      else if (ph === 2) discardRand(1)(s, E);
      else killBig(1)(s, E);
    },
    deck: [[3, att('戦慄衆の歩兵', 2, 2)], [2, att('永遠衆の戦士', 3, 2)], [1, att('ボーラスの龍', 4, 4, ['flying'])], [2, sorc('精神の掌握', 'いちばん大きいクリーチャーをタップ', tapBig(1), 3)], [2, wall('龍神の霊廟', 0, 5)], [1, sorc('龍神の業火', 'あなたのクリーチャーすべてに 1点', sweep(1), 3)]] },

  // --- エルドラージ：手下 ---
  sp_spawn: { name: 'エルドラージの落とし子の群れ', life: 16, deck: [[5, att('エルドラージの落とし子', 1, 1)], [2, att('エルドラージのドローン', 2, 2)], [2, sorc('産卵', '1/1 の落とし子を 2体', spawn('エルドラージの落とし子', 1, 1, 2), 2)], [1, sorc('嚥下', 'あなたの山札の上から 2枚を追放', exileTop(2), 2)]] },
  sp_scions: { name: 'ウラモグの末裔たち', life: 24, deck: [[3, att('ウラモグの末裔', 3, 3)], [2, att('嚥下するもの', 4, 4, ['trample'])], [2, sorc('無への回帰', 'あなたの墓地をすべて追放', exileGy, 2)], [2, sorc('虚無の触手', 'いちばん大きいクリーチャーに 4点', hitBig(4), 4)], [1, wall('空虚の繭', 0, 7)]] },
  sp_breaker: { name: 'ウラモグの破壊者', life: 16, intent: () => '敵のターンのはじめに、あなたの山札の上から 1枚を追放', turnStart: exileTop(1),
    deck: [[1, att('ウラモグの破壊者', 5, 5, ['trample'])], [2, att('エルドラージのドローン', 1, 1)], [4, wall('エルドラージの落とし子', 0, 1)], [2, sorc('殲滅', 'あなたのいちばん小さいクリーチャーを墓地へ', sac(1), 3)]] },
  // --- エルドラージの 巨神（第3幕の ボス。3体から 1体）---
  sp_emrakul: { boss: true, name: '引き裂かれし永劫、エムラクール', speaker: 'エムラクール', life: 26, blurb: '3ターンごとに「滅殺」：あなたのいちばん大きいクリーチャー 2体を墓地へ',
    lines: { start: '……（世界そのものが、ねじれていく）', mid: '……（月が、悲鳴を上げた）', low: '……（巨体が、次元の裂け目へ沈みかける）', pinch: '……（あなたの影が、引き裂かれていく）' },
    intent: (s) => { const left = 3 - ((s.E.flags.t || 0) % 3); return left === 1 ? 'つぎの敵のターンに「滅殺」：あなたのいちばん大きいクリーチャー 2体を墓地へ' : `「滅殺」まで あと ${left} ターン`; },
    turnStart(s, E) { s.E.flags.t = (s.E.flags.t || 0) + 1; if (s.E.flags.t % 3 === 0) { E.L(s, 'エムラクールの滅殺'); sac(2, true)(s, E); } },
    deck: [[4, wall('エルドラージの落とし子', 0, 1)], [3, att('エルドラージのドローン', 2, 2)], [2, att('穢すもの', 4, 4, ['flying'])], [1, sorc('引き裂く時', 'あなたに 4点', hurtN(4), 4)]] },
  sp_ulamog: { boss: true, name: '絶え間ない飢餓、ウラモグ', speaker: 'ウラモグ', life: 26, blurb: '敵のターンのはじめに、あなたの山札の上から 1枚を追放（この戦闘のあいだ もどらない）',
    lines: { start: '……（大地が、色を失っていく）', mid: '……（喰らった次元の数を、誰も知らない）', low: '……（飢えた巨体が、ゆらいだ）', pinch: '……（あなたのすべてが、喰われようとしている）' },
    intent: () => '敵のターンのはじめに、あなたの山札の上から 1枚を追放', turnStart: exileTop(1),
    deck: [[3, wall('エルドラージの落とし子', 0, 1)], [3, att('飢えた末裔', 2, 3)], [2, att('嚥下するもの', 3, 3, ['trample'])], [2, sorc('無への回帰', 'あなたの墓地をすべて追放', exileGy, 3)]] },
  sp_kozilek: { boss: true, name: '真実の解体者、コジレック', speaker: 'コジレック', life: 26, reveal: 1.5, blurb: 'あなたの呪文のコストは ＋1。敵は山札を多めにめくる',
    lines: { start: '……（見えているものが、真実とはかぎらない）', mid: '……（あなたの呪文が、ゆがんでいく）', low: '……（ゆがみが、ほどけはじめた）', pinch: '……（真実が、解体されていく）' },
    intent: () => 'あなたの呪文のコストは ＋1（基本カードは のぞく）',
    hooks: { costTax: (s, d) => (!d.basic && d.cost ? 1 : 0) },
    deck: [[4, wall('エルドラージの落とし子', 0, 1)], [3, att('ゆがみの末裔', 2, 2)], [2, att('真実をむさぼるもの', 4, 3)], [1, sorc('歪曲', 'あなたに 3点', hurtN(3), 3)]] },
};
// 侵略者の ボス（幕の はじめに、その幕の ボスと はんぶんずつ）
export const bossName = (key) => MONSTERS[key]?.name || ACTS.find((a) => a.boss === key)?.bossName || key;
export const bossBlurb = (key) => MONSTERS[key]?.blurb || '';

// ふつうの敵の階（o.lifeMul・o.reveal はアセンション）
// 侵略者の ボス（c.boss）：ライフは むずかしさで かわる（アセンション 4 で「むずかしい」）。c.lines：セリフ。c.phases：ライフ 2/3・1/3 で 3段階
// 勝っても カットインは「勝利……？」（エルドラージ・ボーラス・法務官は、いつか レイドの ボスで もどって くる かも。ユーザーが きめた 2026-11-05）
const BOSS_DIFF = { easy: 0.85, normal: 1, hard: 1.2 };
const INVADER_WIN = '勝利……？';
export function monsterFloor(key, o = {}) {
  const c = MONSTERS[key];
  const lifeOf = (s) => Math.round(c.life * (o.lifeMul || 1) * (c.boss ? BOSS_DIFF[s?.diff] ?? 1 : 1)), rv = (o.reveal || 1) * (c.reveal || 1);
  const revealN = (s) => Math.floor((s.E.flags.rv || 0) + rv);
  // セリフ：段階が かわる・ライフ はんぶん・のこり すこし・あなたの ライフが 5 いか
  const talk = (s, E) => {
    if (!c.lines || s.over) return;
    if (c.phases) { const ph = phaseOf(s); if (ph !== s.phase) { s.phase = ph; s.stats.phase = ph; speak(s, E, `p${ph}`, c.lines[`p${ph}`]); } }
    else if (s.E.life <= s.E.lifeMax / 2) speak(s, E, 'mid', c.lines.mid);
    if (s.E.life > 0 && s.E.life <= s.E.lifeMax / 5) speak(s, E, 'low', c.lines.low);
    if (s.P.life > 0 && s.P.life <= 5) speak(s, E, 'pinch', c.lines.pinch);
  };
  const check = (s, E) => { if (s.E.life <= 0) s.over = 'win'; else if (E) talk(s, E); };
  return {
    id: key, name: c.name, rav: true, spire: true, faceUnit: 1, faceLabel: c.name, speaker: c.speaker, lines: c.lines, winText: c.boss ? INVADER_WIN : undefined,
    goal: (s) => `${c.lines ? `${c.speaker}「${c.lines.start}」\n` : ''}${c.name}のライフ（${s?.E?.lifeMax || lifeOf(s)}）を 0 にする。${c.blurb ? `${c.blurb}。` : c.intent ? `${c.intent(s)}。` : ''}`,
    setup(s, E) {
      const life = lifeOf(s);
      s.E.life = life; s.E.lifeMax = life;
      if (c.lines) s.E.say = c.lines.start;
      if (c.phases) { s.phase = 1; s.stats.phase = 1; }
      for (const p of s.E.bf) p.sick = false;
      s.E.lib = toLib(s, E, build(c.deck));
    },
    async enemyTurn(s, E) {
      await c.turnStart?.(s, E);
      if (s.over) return;
      talk(s, E);
      const k = revealN(s);
      s.E.flags.rv = (s.E.flags.rv || 0) + rv - k;
      if (s.E.lib.length < k && s.E.gy.length) { s.E.lib.push(...shuffle(s.rng, s.E.gy.splice(0))); E.L(s, '敵は墓地をまぜて山札にもどした'); }
      await E.reveal(s, k);
      if (s.over) return;
      await E.enemyAttack(s, attackers(s, E, (p) => p.def.attacks));
      talk(s, E);
    },
    revealN,
    intent: (s, E) => (c.intent ? [c.intent(s, E)] : []),
    face(s, n, E) { s.E.life -= n; check(s, E); },
    faceValue: (s, n) => n * 1.5,
    check,
    priority(s, p, E) { return E.power(s, p) * 2 + 1; },
    assign(s, atkers, E) {
      if (sumPow(s, E, atkers) >= s.E.life) return atkers.map((p) => ({ p, t: 'face' }));
      const big = E.creatures(s, 'E').filter((p) => E.power(s, p) >= 3);
      return E.assignKill(s, atkers, E.killTargets(s, big), 'face');
    },
    threat(s, E) { const a = E.creatures(s, 'E').filter((p) => p.def.attacks); return { damage: sumPow(s, E, a) + 1, attackers: a.length }; },
    anyTarget() { return 'face'; },
    castThreat(s, d) { return d.types.includes('creature') ? d.pow + 1 : d.danger ?? 2; },
    status: (s) => `${c.phases ? `<span class="chip">段階 ${s.phase || 1}/3</span>` : ''}<span class="chip hot">${c.name} ライフ ${s.E.life}</span>`,
    ...c.hooks,
  };
}
for (const k of Object.keys(MONSTERS)) FLOORS[k] = () => monsterFloor(k);

// ---- 3つの幕 ----
// buff：その幕の敵クリーチャーは ＋buff/＋buff（bossBuff：ボスだけさらに）。lifeMul：ライフを持つ敵（ふつうの敵・ラヴニカのギルド・寮・ボス）のライフの倍率
// bossDiff：ボスの難しさ（アセンション 4 で 1段上がる）
export const ACTS = [
  // invaders：侵略者の ボス（幕の はじめに、boss と はんぶんずつ。侵略者の 中は ランダム）。手下は weak・strong・elites に まぜる
  { id: 'theros', name: 'テーロス', weak: ['sp_satyrs', 'sp_harpies', 'sp_minotaur', 'sp_phyx_scouts'], strong: ['sp_centaurs', 'sp_cyclops', 'sp_nyx', 'sp_phyx_host'],
    elites: ['hydra', 'clock', 'horde', 'dragon', 'factory', 'slime', 'twins', 'xenagos', 'gorgon', 'sp_phyx_ship'], boss: 'erebos', bossName: '死者の神エレボス', buff: 0, lifeMul: 1.2,
    invaders: ['sp_norn', 'sp_jin', 'sp_sheol', 'sp_ura', 'sp_vori'] },
  { id: 'ravnica', name: 'ラヴニカ', weak: ['sp_jesters', 'sp_rotters', 'sp_weirds', 'sp_dread'], strong: ['sp_raiders', 'sp_tithe', 'sp_krasis', 'sp_eternal'],
    elites: ['boros', 'selesnya', 'simic', 'izzet', 'golgari', 'azorius', 'rakdos', 'orzhov', 'gruul', 'dimir', 'sp_oketra'], boss: 'jace', bossName: 'ギルドパクトのジェイス', buff: 1, lifeMul: 1.7,
    invaders: ['sp_bolas'] },
  { id: 'strixhaven', name: 'ストリクスヘイヴン', weak: ['sp_brooms', 'sp_pests', 'sp_inklings', 'sp_spawn'], strong: ['sp_fractals', 'sp_elementals', 'sp_spirits', 'sp_scions'],
    elites: ['sx_silverquill', 'sx_prismari', 'sx_witherbloom', 'sx_lorehold', 'sx_quandrix', 'sp_breaker'], boss: 'sx_extus', bossName: '卒業試験（オリークのエクタス）', buff: 2, lifeMul: 2.4,
    invaders: ['sp_emrakul', 'sp_ulamog', 'sp_kozilek'] },
];

// ---- 予告：つぎにめくる山札のカード（すべての敵）----
const KW_JA = { flying: '飛行', haste: '速攻', trample: 'トランプル', reach: '到達', deathtouch: '接死', first: '先制攻撃', vigilance: '警戒', indestructible: '破壊不能', lifelink: '絆魂' };
const plainName = (n) => String(n || '').replace(/（[ぁ-んー]+）/g, '').replace(/\s+/g, '');
export function peekName(d) {
  if (d.types?.includes('creature')) {
    const kw = (d.kw || []).map((k) => KW_JA[k]).filter(Boolean);
    return `${plainName(d.name)} ${d.pow}/${d.tou}${kw.length ? `（${kw.join('・')}）` : ''}`;
  }
  return `${plainName(d.name)}${d.hint ? `（${d.hint}）` : d.types?.includes('sorcery') ? '（呪文）' : ''}`;
}
export function withPeek(f) {
  const orig = f.intent;
  f.intent = (s, E) => {
    const out = orig ? [...orig(s, E)] : [];
    const n = Math.max(1, f.revealN ? f.revealN(s) : 1);
    const next = s.E.lib.slice(0, n);
    const st = s.P.emblem?.stall, k = s.stats.playerTurns + 2 - (st || 0);
    if (st && k > 0) out.push(`次元のゆらぎ：つぎのターンのはじめにライフ −${k}`);
    if (next.length) out.push(`つぎにめくる：${next.map((c) => peekName(c.def)).join('、')}`);
    else if (f.spire && s.E.gy.length) out.push('つぎにめくる：（墓地をまぜて山札にもどす）');
    return out;
  };
  return f;
}

// ---- ポーション（戦闘のはじめに手札に入る。コスト 0・使うと追放・手札の枚数に数えない）----
const potion = (id, name, prar, text, x) => sp(id, name, 'R', '', 0, 'instant', { potion: true, noPack: true, prar, typeOver: 'ポーション', textOver: text, ...x });
export const POTIONS = [
  potion('PO01', '炎の薬', 'C', '敵 1体か敵の本体に 5点。', { play: burn(5), tgt: [{ side: 'E', face: true, label: '5点を与える相手' }], apply: (s, E, [[t]]) => hit(s, E, t, 5) }),
  potion('PO02', '癒しの薬', 'C', 'ライフを 10 得る（最大ライフは戦闘のあとでこえた分を切る）。', { play: (s, E) => ({ score: s.P.life < 20 ? 6 : 2, run: () => E.gain(s, 10) }) }),
  potion('PO03', '知恵の薬', 'C', 'カードを 2枚引く。', { play: draw(2) }),
  potion('PO04', '巨人の薬', 'U', 'あなたのクリーチャー 1体はターン終了まで ＋4/＋4。', {
    play: (s, E) => { const t = E.bestBuffTarget(s, null); return t ? { score: 5, run: () => E.pump(t, 4, 4) } : null; },
    tgt: [{ side: 'P', label: '＋4/＋4 するクリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.pump(t, 4, 4); },
  }),
  potion('PO05', 'マナの薬', 'U', '山札から基本カードを 2枚、マナゾーンに置く（タップ状態）。', { play: (s, E) => ({ score: 4, run: () => E.rampBasic(s, 2) }) }),
  potion('PO06', '炎嵐の薬', 'U', '敵のクリーチャーすべてに 2点。', { play: (s, E) => (E.creatures(s, 'E').length ? { score: 3 * E.creatures(s, 'E').length, run: () => { for (const p of E.creatures(s, 'E')) E.damage(s, p, 2, null); E.sba(s); } } : null) }),
  potion('PO07', '恐怖の薬', 'R', '敵のクリーチャー 1体を破壊する。', {
    play: (s, E) => { const t = E.creatures(s, 'E').sort((a, b) => E.power(s, b) - E.power(s, a))[0]; return t ? { score: 4 + E.power(s, t) * 2, run: () => { E.destroy(s, t); E.sba(s); } } : null; },
    tgt: [{ side: 'E', label: '破壊する敵のクリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.destroy(s, t); E.sba(s); },
  }),
  potion('PO08', '星の薬', 'R', 'あなたのクリーチャーすべてに ＋1/＋1カウンターを 2個。', { play: (s, E) => { const m = E.creatures(s, 'P'); return m.length ? { score: 3 * m.length, run: () => { for (const p of m) E.addCounters(s, p, 2); } } : null; } }),
];
export const POTION_BY_ID = Object.fromEntries(POTIONS.map((d) => [d.id, d]));

// ---- 呪い（アセンション 10）----
export const CURSE = sp('CU01', '後悔', 'B', '', 0, 'sorcery', { curse: true, noCharge: true, noPack: true, typeOver: '呪い', textOver: '使えない。マナゾーンにも置けない。' });

// ---- レリック（5章）----
// em：もんしょうと同じ値（game.js の newGame）。bl：祝福と同じ値。hooks：start・turn・cast・exact。run：冒険で効くもの
const relic = (id, name, rar, text, x = {}) => ({ id, name, rar, text, ...x });
const castCount = (s) => (s.P.flags.spireCasts = (s.P.flags.spireCasts || 0) + 1);
export const RELICS = [
  // ---- コモン ----
  relic('RL01', '旅人の指輪', 'C', '最大ライフ ＋7。', { run: { maxLife: 7 } }),
  relic('RL02', '火打石', 'C', 'あなたのターンのはじめに、敵に 1点。', { em: { turnPing: 1 } }),
  relic('RL03', '計算尺', 'C', 'ぴったりで倒すたび、ライフを 2 得る。', { em: { exactLife: 2 } }),
  relic('RL04', '狩人の印', 'C', 'ぴったりで倒すたび、敵に 2点。', { bl: { exactPing: 2 } }),
  relic('RL05', '目利きの眼鏡', 'C', 'カード報酬の選択肢が 1枚ふえる。', { run: { rewardPlus: 1 } }),
  relic('RL06', '修行者の帯', 'C', '休憩所で休むと、回復が最大ライフの 15% ふえる。', { run: { restPlus: 0.15 } }),
  relic('RL07', '燃える血', 'C', '戦闘に勝つたび、ライフを 5 得る。', { run: { winHeal: 5 } }),
  relic('RL08', '砂時計', 'C', '戦闘のはじめに、手札を 1回引きなおせる。', { em: { mulligan: 1 } }),
  relic('RL09', '先駆けの角笛', 'C', '戦闘のはじめに、1/1 の兵士を 1体出す。', { hooks: { start: (s, E) => { E.token(s, 'P', T.soldier, 1); E.L(s, '先駆けの角笛：兵士を 1体'); } } }),
  relic('RL10', '基本の書', 'C', '基本カードが強くなる（＋1）。', { em: { basic: 1 } }),
  // ---- アンコモン ----
  relic('RL11', '若木の冠', 'U', '戦闘のはじめに、山札から基本カードを 1枚マナゾーンに置く。', { em: { startMana: 1 } }),
  relic('RL12', '豊穣の角', 'U', 'あなたのターンのはじめに、いちばん小さいクリーチャーに ＋1/＋1カウンター。', { em: { turnBolster: 1 } }),
  relic('RL13', '太陽の指輪', 'U', '戦闘のはじめに、手札に「太陽の指輪」（無色のマナを 2つ出す）。', { em: { ring: 1 } }),
  relic('RL14', '偶数の指輪', 'U', '偶数のコストの呪文を唱えるたび、いちばん小さいクリーチャーに ＋1/＋1カウンター。', {
    hooks: { cast: (s, E, d) => { if (d.cost > 0 && d.cost % 2 === 0 && E.creatures(s, 'P').length) { E.L(s, '偶数の指輪'); E.bolster(s, 1); } } } }),
  relic('RL15', '天秤', 'U', 'あなたのターンのはじめに、あなたと敵のクリーチャーの数が同じなら、カードを 1枚引く。', {
    hooks: { turn: (s, E) => { if (E.creatures(s, 'P').length === E.creatures(s, 'E').length) { E.L(s, '天秤：数が同じ。1枚引く'); E.drawCard(s, 1); } } } }),
  relic('RL16', '錬金術師の鞄', 'U', '戦闘のはじめに、カードを 1枚引く。', { hooks: { start: (s, E) => E.drawCard(s, 1) } }),
  relic('RL17', '黄金の偶像', 'U', '手に入る金貨 ＋25%。', { run: { goldMul: 0.25 } }),
  relic('RL18', '薬師の鞄', 'U', 'ポーションの枠 ＋1。ポーションが出やすい（＋10%）。', { run: { potionSlot: 1, potionPlus: 0.1 } }),
  relic('RL19', '会員証', 'U', 'お店の値段 −20%。', { run: { discount: 0.2 } }),
  // ---- レア ----
  relic('RL20', '九九の札', 'R', 'この戦闘で唱えた呪文が 3の倍数枚目になるたび、敵に 3点。', {
    hooks: { cast: (s, E) => { const n = castCount(s); if (n % 3 === 0) { E.L(s, `九九の札：${n}枚目。敵に 3点`); E.hitEnemy(s, 3, null); } } } }),
  relic('RL21', '凍てつく瞳', 'R', 'あなたのターンのはじめに、敵のいちばん大きいクリーチャーをタップ。', { em: { turnTap: 1 } }),
  relic('RL22', '虚無の刃', 'R', 'あなたのターンのはじめに、敵のいちばん大きいクリーチャーに −1/−1カウンター。', { bl: { wither: 1 } }),
  relic('RL23', '十の束', 'R', 'マナゾーンが 10枚になったターンから、あなたのターンのはじめに敵に 3点。', {
    hooks: { turn: (s, E) => { if (s.P.mana.length >= 10) { E.L(s, '十の束：敵に 3点'); E.hitEnemy(s, 3, null); } } } }),
  // ---- ボス ----
  relic('RL30', '賢者の冠', 'B', '手札の上限 ＋1（6枚まで補充）。', { em: { handSize: 1 } }),
  relic('RL31', '次元の羅針盤', 'B', '戦闘のはじめに、山札から基本カードを 2枚マナゾーンに置く。', { em: { startMana: 2 } }),
  relic('RL32', '黒き契約', 'B', 'あなたのターンのはじめに、敵に 2点。休憩所で休めなくなる。', { em: { turnPing: 2 }, run: { noRest: 1 } }),
  relic('RL33', '星の王冠', 'B', 'あなたのターンのはじめに、＋1/＋1カウンターを 2個。最大ライフ −5。', { em: { turnBolster: 2 }, run: { maxLife: -5 } }),
  relic('RL35', '統率の冠', 'B', '統率者を統率領域に置く（デッキからぬける）。統率者はいつでも唱えられ、唱えるたびにコスト ＋2（統率者税）。', { run: { cmdZone: 1 } }),
  relic('RL34', '賢者の砂時計', 'B', '戦闘のはじめにカードを 2枚引く。ポーションの枠 −1。', { hooks: { start: (s, E) => E.drawCard(s, 2) }, run: { potionSlot: -1 } }),
];
export const RELIC_BY_ID = Object.fromEntries(RELICS.map((r) => [r.id, r]));
export const STARTER_HAND = { ring: SUN_RING };

// ---- イベント（6章）。choices(R, h) の h は engine/spire.js の道具 ----
// run(R, h) は Promise。ai：シミュレーションでえらぶ番号
export const EVENTS = [
  { id: 'pot', name: 'やめどきの鍋', text: '魔女の鍋に、数の書かれた石が入っている（1・2・3）。引くたびに合計がふえ、合計 ×10 の金貨がもらえる。ただし合計が 7 をこえると鍋が爆発する。' },
  { id: 'sphinx', name: 'スフィンクスの問い', text: 'スフィンクスが 4つの数を示した。「この数をすべて使って 24 をつくる式はどれか」' },
  { id: 'blood', name: '血の取引', text: '道化の悪魔がにやりと笑う。「血を少しくれれば、いいカードをやろう」' },
  { id: 'spring', name: '忘却の泉', text: '澄んだ泉。ここに沈めたものは、二度ともどらない。' },
  { id: 'forge', name: '鍛冶神の炉', text: 'まだ火の残る炉がある。カードを鍛えられそうだ。' },
  { id: 'merchant', name: '迷子の商人', text: '道に迷った商人が、ふしぎな品を売りたがっている。' },
  { id: 'mirror', name: '双子の鏡', text: 'のぞきこむと、手にしたカードがもう 1枚うつっている。' },
  { id: 'stars', name: 'ニクスの星図', text: '星図をなぞると、カードの姿が別のものに変わっていく。' },
  { id: 'map', name: '宝の地図', text: '古い地図に、宝のありかが 2つ書かれている。近い方と、危ない場所の奥。' },
  { id: 'shrine', name: '神々の祠', text: '小さな祠。祈れば何かを授けてくれそうだ。' },
];
export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
