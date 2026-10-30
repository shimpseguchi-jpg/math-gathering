// みならいの しけん（2026-10-30。docs/ROADMAP.md 10章）：ゲームを はじめた ときの 限定ルール
// パックを あけて（カードは data/pool1.js）デッキを くみ、3階だての 小さな 塔を のぼる。課題 3つで マスマティックスウォーカーの 証
// はじめは 単色だけ。課題 ①② の あとで 2色の カードが 出て、③（3階の テフェリーの しけんに かつ）が ひらく
// ひらく じゅんばん：チュートリアル → ストーリー 1章 → みならいの しけん → テーロス → ラヴニカ（ui/unlock.js）
import { pvp } from './enemies.js';
import { BY_ID, BASICS } from './cards.js';
import { colorsOf } from '../engine/game.js';

// なまえ（ここ だけに 書く）。はじめは 仮に「きほんセット」、2026-10-30 に きまった。KIHON_RULE は こうちくモードの デッキの ルールの なまえ
export const KIHON_NAME = 'みならいの しけん';
export const KIHON_RULE = 'みならい';
export const KIHON_GUIDE = 'PW06'; // 案内役：時を 見る テフェリー（ストーリー 1章と おなじ）

// ---- 3階：てきも プールの カードを つかう（ストーリーと おなじ ゴースト。ライフは みじかめ）----
// ids：てきの デッキ（きほんカードで 20まいに する）。てきも 黒は つかわない
export const KIHON_FLOORS = [
  { id: 'kh1', name: '1階 ゴブリンの むら', foe: 'ゴブリンの むれ', life: 10, ids: ['R01', 'R76', 'R77', 'C18', 'R01', 'R76', 'R21', 'R77'],
    intro: 'ゴブリンたちが むらで あばれて いる。小さな ゴブリンを ぴったりで たおして いこう。' },
  { id: 'kh2', name: '2階 そらの 見はり', foe: 'そらの 見はり', life: 12, ids: ['W10', 'U01', 'C01', 'W01', 'U02', 'W10', 'U09', 'C01'],
    intro: 'そらを とぶ 見はりが いる。飛行（ひこう）を もつ クリーチャーは、飛行（ひこう）か 到達（とうたつ）で ないと ブロックできないよ。' },
  { id: 'kh3', name: '3階 テフェリーの しけん', foe: 'テフェリーの 弟子（でし）', life: 14, ids: ['W02', 'U01', 'W03', 'U14', 'W19', 'U82', 'W22', 'U02', 'W02'],
    intro: 'さいごは わたしの 弟子（でし）との しけんだ。ここまで おぼえた ことを ぜんぶ つかって ごらん。' },
];
// カードの ならびを デッキの 色の きほんカードで 20まいに する
export function fillDeck(ids, size = 20) {
  const ds = ids.map((id) => BY_ID[id]).filter(Boolean);
  const cols = [...new Set(ds.flatMap(colorsOf))];
  const order = cols.length ? cols : ['C'];
  for (let k = 0; ds.length < size; k++) ds.push(BASICS[order[k % order.length]]);
  return ds;
}
export const kihonFloor = (f) => pvp({ deck: fillDeck(f.ids), name: f.foe, life: f.life, first: 'P' });

// ---- 課題（3つ）----
export const KIHON_TASKS = [
  { id: 'deck', text: 'パックを あけて デッキを くむ' },
  { id: 'exact', text: 'てきの クリーチャーを ぴったりで たおす' },
  { id: 'top', text: '3階（かい）の テフェリーの しけんに かつ' }, // 2026-10-30：「2色の 神で とどめ」から かえた（むずかしい）
];

// ---- 2色の 神（プールに ある 6柱）：とどめを さした 神からの ことば（課題では ない おまけ）----
export const GOD_THANKS = {
  WG02: 'ありがとう、わかき マスマティックスウォーカー。きみの おかげで 畑の みのりが まもられた。きみの 力（ちから）は、数を そだてる 力（ちから）だよ。',
  WU02: 'ポリスの まちを まもって くれて ありがとう。数を ただしく かぞえる 人が いれば、まちは いつまでも へいわです。',
  RW02: 'みごとな とどめだ！ 勝利（しょうり）は きみの ものだ。ありがとう、わかき マスマティックスウォーカーよ。',
  UR02: 'わたしの かみなりを みごとに つかったな。ありがとう。ひらめきは、よく 考える 者に おちて くる。',
  RG02: '運命の 糸は きみを えらんだ。ありがとう。これからの 旅も、きみの 計算が 道を ひらくだろう。',
  GU02: '地平（ちへい）の むこうまで 見とおす 目を もって いるね。ありがとう。数の せかいは、まだまだ ひろいよ。',
};
export const isGod2 = (id) => !!GOD_THANKS[id];
