// チュートリアル：メレティスの 訓練場。白緑（召集＋圧倒）の きまった 手札で、1つずつ 案内する
// 計算の 問題は 出さない。「マナ 4 ＋ なかま □ ＝ 7」「パワーを たして 8 いじょう？」「ちょうど 10点」を 自分で 考える
import { BY_ID } from '../data/cards.js';

export const TUTORIAL_DONE = 'mtg-tutorial-done';

// 山札（デッキは 20まい。上から 引く じゅんばん どおり）
const HAND = ['B03', 'W01', 'G01', 'G05', 'G03'];
const LIB = ['B01', 'B03', 'B03', 'B01', 'B03', 'B01', 'B03', 'B01', 'B03', 'B01', 'B03', 'B01', 'B03', 'B01', 'B03'];
export const tutorialDeck = () => [...HAND, ...LIB].map((id) => BY_ID[id]);

// 場を つくる：マナゾーンに 2まい、手札は きまった 5まい
export function tutorialSetup(s, E) {
  s.P.hand = HAND.map((id) => E.card(BY_ID[id]));
  s.P.lib = LIB.map((id) => E.card(BY_ID[id]));
  s.P.mana = ['B01', 'B03'].map((id) => ({ ...E.card(BY_ID[id]), tapped: false }));
}

const mine = (s, id) => s.P.bf.filter((p) => p.def.id === id);
const hand = (id) => `.hand-slot[data-card="${id}"]`;
const perm = (id) => `.perm[data-card="${id}"]`;

// text：コーチの ことば。next：「つぎへ」で すすむ。hl：光らせる ところ
// hand：タップして よい 手札と えらべる ボタン。acts：おして よい ボタン。drag/perms：ひっぱる・タップして よい クリーチャー
// done(s, B)：つぎの ステップへ すすむ じょうけん
const STEPS = [
  {
    text: 'ようこそ、メレティスの くんれんじょうへ！ あいては「訓練（くんれん）の まと」。タフネスは 10。10点の ダメージを あたえれば かち！',
    hl: perm('tut_dummy'), next: true,
  },
  {
    text: 'まず マナを ふやそう。光っている「緑（みどり）の きほんカード」を タップして「マナゾーンに おく」。マナは 1ターンに 1まい おける。どの カードも マナに なるよ。',
    hl: hand('B03'), hand: { B03: ['charge'] }, done: (s) => s.P.mana.length >= 3,
  },
  {
    text: 'マナは 3つ。「警報（けいほう）の かね」は 2マナ。使うと へいしが 2体 出るよ。',
    hl: hand('W01'), hand: { W01: ['cast'] }, done: (s) => s.P.bf.filter((p) => p.token).length >= 2,
  },
  {
    text: 'マナは のこり 1つ。「森（もり）の ちいさな エルフ」は 1マナ。せんじょうに 出そう。',
    hl: hand('G01'), hand: { G01: ['cast'] }, done: (s) => mine(s, 'G01').length > 0,
  },
  {
    text: 'マナを ぜんぶ 使ったね。出たばかりの クリーチャーは、つぎの ターンから こうげきできる。「ターン おわり」を おそう。',
    hl: '[data-act=end]', acts: ['end'], done: (s) => s.stats.playerTurns >= 2,
  },
  {
    text: 'ターンの はじめに、てふだが 5まいに なるまで カードを 引ける。「白（しろ）の きほんカード」を マナゾーンに おこう。',
    hl: hand('B01'), hand: { B01: ['charge'] }, done: (s) => s.P.mana.length >= 4,
  },
  {
    text: '「森の 大（おお）ワーム」は コスト 7。でも マナは 4つ…。しょうしゅうが あれば、なかまの クリーチャーを タップして マナの かわりに できる。マナ 4 と なかまの 数で、7 に なるかな？',
    hl: hand('G05'), hand: { G05: ['cast'] }, done: (s) => mine(s, 'G05').length > 0,
  },
  {
    text: '大ワームが 出た！ 「わらの 兵士（へいし）」が「つぎに こうげき」して くるよ。「ターン おわり」を おそう。',
    hl: '[data-act=end]', acts: ['end'], done: (s, B) => B.mode === 'block' || s.stats.playerTurns >= 3,
  },
  {
    text: 'わらの へいしの パワーは 3。大ワームの タフネスは 5。5 は 3 より 大きいから、ブロックしても 大ワームは たおれない！ 大ワームを わらの へいしへ ひっぱって、「ブロック けってい」。',
    hl: perm('G05'), acts: ['blockdone'], drag: ['G05'], perms: ['G05'], done: (s) => s.stats.playerTurns >= 3,
  },
  {
    text: 'また てふだが 5まいに なった。きほんカードを マナゾーンに おこう（マナ 5）。',
    hl: hand('B03'), hand: { B03: ['charge'] }, done: (s) => s.P.mana.length >= 5,
  },
  {
    text: '「生（い）きている トーテム」は、ほかの クリーチャーに ＋1/＋1カウンターを 1こ おく。でも あっとうなら 2こ！ あっとうは、みんなの パワーを たして 8 いじょうの とき。いまの パワーは 5・1・1・1。とどくかな？ トーテムを 出そう。',
    hl: hand('G03'), hand: { G03: ['cast'] }, done: (s) => mine(s, 'G03').length > 0,
  },
  {
    text: 'さあ こうげき！ まとの タフネスは 10。クリーチャーを まとへ ひっぱって えらぼう。パワーを たして ちょうど 10 に なると「ぴったり！」。えらんだら「攻撃（こうげき）！」。',
    hl: perm('tut_dummy'), acts: ['attack', 'declare', 'cancel'], drag: true, perms: true, done: (s, B) => B.mode === 'tricks',
  },
  {
    text: 'ブロックは されなかった。「ダメージ！」を おそう。',
    hl: '[data-act=damage]', acts: ['damage'], done: (s, B) => B.mode === 'main' && B.combatDone,
  },
  {
    text: 'まとが のこった…。パワーが たりなかったみたい。つぎの ターンに また こうげきしよう！ ここからは 自由に あそべるよ。',
    next: true,
  },
];

// たたかいの 画面（battle.js）から 使う
export function makeTutorial() {
  let k = 0, free = false;
  const step = () => (free ? null : STEPS[k]);
  const ALWAYS = ['gy', 'mana', 'log', 'tutnext', 'menu', 'lib', 'elib', 'egy'];
  return {
    get active() { return !free; },
    // done を 見て すすめる（描く まえに よぶ）
    update(s, B) { if (s.over) { free = true; return; } while (!free && STEPS[k].done && STEPS[k].done(s, B)) { k++; if (k >= STEPS.length) free = true; } },
    next() { if (free || !STEPS[k].next) return; k++; if (k >= STEPS.length) free = true; },
    allowAct(a) { const st = step(); return !st || ALWAYS.includes(a) || (st.acts || []).includes(a); },
    allowHand(c) { const st = step(); return !st || !!st.hand?.[c.def.id]; },
    filterChoices(c, choices) {
      const st = step(); if (!st) return choices;
      const ok = st.hand?.[c.def.id] || [];
      return choices.map((ch) => (ch.value == null || ok.includes(ch.value) ? ch : { ...ch, disabled: true, note: 'いまは ほかの ことを しよう' }));
    },
    allowPerm(p) { const st = step(); if (!st) return true; if (p.side === 'E') return true; return st.perms === true || (st.perms || []).includes(p.def.id); },
    allowDrag(p) { const st = step(); return !st || st.drag === true || (st.drag || []).includes(p.def.id); },
    hint() { return step() ? '光っている ところを タップしよう' : ''; },
    html(ruby) {
      const st = step(); if (!st) return '';
      return `<div class="coach" role="status"><p>${ruby(st.text)}</p>${st.next ? '<button type="button" class="btn primary" data-act="tutnext">つぎへ</button>' : ''}</div>`;
    },
    highlight(root) { const st = step(); if (st?.hl) root.querySelectorAll(st.hl).forEach((el) => el.classList.add('tut-hl')); },
  };
}
