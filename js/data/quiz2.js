// パック＆バトルの「むずかしい」「とても むずかしい」もんだい（2026-11-17。docs/PACKBATTLE.md 11章）
// せいちょうの「もんだい」の 枝で ひらく。1年生の はんいの 発展（くりあがり・くりさがり、3つの 数、□に 入る 数、大きい 数、文章題）
// しゅぎょうの もんだい（quiz.js）と おなじ 形：{ cat, kind: 'num', text, answer }。文章題は story（お話）と unit（こたえの たんい）も もつ
import { GEN } from './quiz.js';

const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const pick = (rng, xs) => xs[Math.floor(rng() * xs.length)];

// ---- むずかしい（1もん 15P）----
// □に 入る 数：くりあがり・くりさがりの ぎゃく（8 ＋ □ ＝ 15・□ − 6 ＝ 7・14 − □ ＝ 8）
function fill(rng) {
  const a = ri(rng, 2, 9), b = ri(rng, 2, 9), s = a + b, k = ri(rng, 0, 3);
  if (k === 0) return { cat: 'fill', kind: 'num', text: `${a} ＋ □ ＝ ${s}`, answer: b };
  if (k === 1) return { cat: 'fill', kind: 'num', text: `□ ＋ ${b} ＝ ${s}`, answer: a };
  if (k === 2) return { cat: 'fill', kind: 'num', text: `□ − ${b} ＝ ${a}`, answer: s };
  return { cat: 'fill', kind: 'num', text: `${s} − □ ＝ ${a}`, answer: b };
}
// 大きい 数：2けた ± 1けた（くりあがり・くりさがり なし）と、何十 ± 何十
function big(rng) {
  if (rng() < 0.4) {
    const a = ri(rng, 1, 8) * 10, b = ri(rng, 1, 9 - a / 10) * 10;
    return rng() < 0.5 ? { cat: 'big', kind: 'num', text: `${a} ＋ ${b}`, answer: a + b } : { cat: 'big', kind: 'num', text: `${a + b} − ${b}`, answer: a };
  }
  const t = ri(rng, 2, 9) * 10, o = ri(rng, 1, 8), b = ri(rng, 1, 9 - o);
  return rng() < 0.5 ? { cat: 'big', kind: 'num', text: `${t + o} ＋ ${b}`, answer: t + o + b } : { cat: 'big', kind: 'num', text: `${t + o + b} − ${b}`, answer: t + o };
}
// 3つの 数：しゅぎょうと おなじ 作りかた
const three3 = (rng) => ({ ...GEN.three(rng), cat: 'three3' });

// ---- とても むずかしい（1もん 20P）：文章題 ----
const THINGS = [['りんご', 'こ'], ['あめ', 'こ'], ['どんぐり', 'こ'], ['カード', 'まい'], ['おりがみ', 'まい'], ['シール', 'まい']];
const KIDS = ['ゆうと', 'さくら', 'はると', 'ひまり', 'そうた', 'あおい'];
const q = (cat, story, answer, unit) => ({ cat, kind: 'num', story, text: 'こたえ', answer, unit });
// あわせて・ふえる・のこり・ちがい（こたえは 20まで。くりあがり・くりさがりが ある）
function story(rng) {
  const [x, u] = pick(rng, THINGS), who = pick(rng, KIDS), k = ri(rng, 0, 3);
  if (k <= 1) {
    let a, b; do { a = ri(rng, 3, 9); b = ri(rng, 3, 9); } while (a + b < 11);
    return k === 0
      ? q('story', `${who}さんは ${x}を ${a}${u} もって います。${b}${u} もらいました。ぜんぶで なん${u}？`, a + b, u)
      : q('story', `あかい ${x}が ${a}${u}、あおい ${x}が ${b}${u} あります。あわせて なん${u}？`, a + b, u);
  }
  let a, b; do { a = ri(rng, 11, 18); b = ri(rng, 3, 9); } while (a % 10 >= b);
  return k === 2
    ? q('story', `${x}が ${a}${u} あります。${b}${u} つかいました。のこりは なん${u}？`, a - b, u)
    : q('story', `あかい ${x}が ${a}${u}、あおい ${x}が ${b}${u} あります。あかい ${x}は なん${u} おおい？`, a - b, u);
}
// なんばんめ：ならんだ 人の 数
function order(rng) {
  const who = pick(rng, KIDS), a = ri(rng, 3, 9), b = ri(rng, 3, 9);
  return rng() < 0.5
    ? q('order', `${a + b}にん ならんで います。${who}さんは まえから ${a}ばんめ です。${who}さんの うしろに なんにん？`, b, 'にん')
    : q('order', `${who}さんの まえに ${a}にん、うしろに ${b}にん います。みんなで なんにん？`, a + b + 1, 'にん');
}
// 3つの 数の お話：ふえて へる・へって ふえる
function story3(rng) {
  for (;;) {
    const a = ri(rng, 5, 12), b = ri(rng, 2, 8), c = ri(rng, 2, 8), up = rng() < 0.5;
    const r1 = up ? a + b : a - b, r2 = up ? r1 - c : r1 + c;
    if (r1 < 1 || r1 > 20 || r2 < 0 || r2 > 20) continue;
    return up
      ? q('story3', `バスに ${a}にん のって います。${b}にん のって、${c}にん おりました。いま なんにん？`, r2, 'にん')
      : q('story3', `こうえんに ${a}にん います。${b}にん かえって、${c}にん きました。いま なんにん？`, r2, 'にん');
  }
}

// tier：1 ＝ むずかしい、2 ＝ とても むずかしい。defs は しゅぎょうの CATS と おなじ 形（なまえ・れい・出やすさ）
export const HARD_TIERS = {
  1: {
    name: 'むずかしい',
    defs: {
      fill: { name: '□に 入る かず', note: '8 ＋ □ ＝ 15 など', weight: 2 },
      big: { name: '大きい かずの けいさん', note: '23 ＋ 5・30 ＋ 40 など', weight: 2 },
      three3: { name: '3つの かずの けいさん', note: '14 − 6 ＋ 5 など', weight: 1 },
    },
    gen: { fill, big, three3 },
  },
  2: {
    name: 'とても むずかしい',
    defs: {
      story: { name: 'ぶんしょうだい', note: 'あわせて・のこり・ちがい', weight: 3 },
      order: { name: 'なんばんめ', note: 'ならんだ 人の かず', weight: 1 },
      story3: { name: '3つの かずの おはなし', note: 'のって おりて なんにん', weight: 2 },
    },
    gen: { story, order, story3 },
  },
};
// しゅぎょうの quizSession と おなじ つかいかた：つぎの もんだいを かえす 関数（同じ もんだいは つづけて 出さない）
export function hardSession(rng, tier, cats) {
  const T = HARD_TIERS[tier];
  const ks = (cats?.length ? cats : Object.keys(T.defs)).filter((k) => T.defs[k]);
  const bag = ks.flatMap((k) => Array(T.defs[k].weight).fill(k));
  let last = '';
  return () => {
    for (let i = 0; ; i++) {
      const x = T.gen[pick(rng, bag)](rng), key = x.story || x.text;
      if (key !== last || i > 20) { last = key; return x; }
    }
  };
}
