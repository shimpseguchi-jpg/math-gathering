// 次元渡り（大人向けモード。docs/SPIRE.md）：戦闘画面の子ども向けの文字を、大人向けの表記に置きかえる
// バトル画面（battle.js）・ログ・カードの文は子ども向け（わかち書き・ひらがな・ふりがな）のまま共通なので、
// 画面に出た文字を その場で変える：ふりがな（<rt>）を外す・わかち書きの空白を詰める・よく出るひらがなの言葉を漢字にする
// adultOn() で はじめ、adultOff() で やめる（次元渡りの戦闘のあいだだけ）

// まとまった言いまわし（さきに変える）
const PHRASES = [
  [/ターン\s*おわり/g, 'ターン終了'], [/（なにも\s*いない）/g, '（なし）'], [/てふだは\s*ない/g, '手札なし'],
  [/かった！/g, '勝利！'], [/まけた…/g, '敗北…'], [/わたしの\s*ターン/g, '自分のターン'], [/たたかい\s*スタート！/g, '戦闘開始'],
  [/(\d+)\s*まいめ/g, '$1枚目'], [/(\d+)\s*まい/g, '$1枚'], [/(\d+)\s*ターンめ/g, '$1ターン目'], [/(\d+)\s*かい/g, '$1回'],
  [/ひっぱって/g, 'ドラッグして'], [/ひっぱると/g, 'ドラッグすると'], [/ひっぱる/g, 'ドラッグする'],
];
// ことば（ことばの はじめに あるときだけ。長いものから）
const WORDS = Object.entries({
  とうそつりょういき: '統率領域', とうそつしゃぜい: '統率者税', とうそつしゃ: '統率者', とうそつ: '統率', えいゆうたん: '英雄譚', せんじゅつ: '占術', ちょうほう: '諜報',
  だっしゅつ: '脱出', ちゅうせい: '忠誠', ついほう: '追放', しゅんそく: '瞬速', にんじゅつ: '忍術', ぞうしょく: '増殖', おんけい: '恩恵', げきれい: '激励',
  そっこう: '速攻', ぼうどう: '暴動', ぞうじゅ: '増呪', しゅくふく: '祝福', もんしょう: '紋章', ほうぐ: '宝具', たいぐん: '大群', そうび: '装備',
  こうげき: '攻撃', やまふだ: '山札', てふだ: '手札', ぼち: '墓地', せんじょう: '戦場', じゅもん: '呪文', こうか: '効果', のうりょく: '能力',
  となえ: '唱え', えらぶ: '選ぶ', えらん: '選ん', えらべ: '選べ', えらば: '選ば', つかえ: '使え', つかう: '使う', つかっ: '使っ', つかわ: '使わ',
  のこり: '残り', のこす: '残す', のこっ: '残っ', のこし: '残し', あいて: '相手', じぶん: '自分', つぎ: '次', ほか: '他', てき: '敵',
  もどる: '戻る', もどっ: '戻っ', もどす: '戻す', もどし: '戻し', もどれ: '戻れ', すてる: '捨てる', すてた: '捨てた', すてて: '捨てて', すてら: '捨てら',
  とじる: '閉じる', たりない: '足りない', いまは: '今は', いまの: '今の', たいき: '待機', こうたい: '交代', ねらえ: '狙え', ねらう: '狙う', ねらい: '狙い',
  できごと: '出来事', おわり: '終わり', おわっ: '終わっ', けってい: '決定', かちかた: '勝利条件', はらう: '払う', はらっ: '払っ', はらえ: '払え', はらわ: '払わ',
  ただで: 'タダで', ひきなおす: '引き直す', ひきなおし: '引き直し', ひきわけ: '引き分け', ひく: '引く', ひい: '引い', ひける: '引ける',
  ごうけい: '合計', くらべ: '比べ', せつめい: '説明', まぜ: '混ぜ', あたえ: '与え', うけ: '受け', あらわれ: '現れ', わりふ: '割り振', きめる: '決める',
  はじめる: '始める', はじめの: '最初の', はじめに: '最初に', はじめから: '最初から', あたらしい: '新しい', うごく: '動く', せんこう: '先攻',
  たたかい: '戦い', たたかう: '戦う', わたしの: '自分の', なにも: '何も', ぜんぶ: 'すべて', こわれ: '壊れ', ふえ: '増え', へら: '減ら', へっ: '減っ', へる: '減る',
  きんか: '金貨', たから: '宝', ねている: '眠っている', もつ: '持つ', もって: '持って', おく: '置く', おいて: '置いて', みる: '見る', みよう: '見よう',
  つづける: '続ける', じゅんばん: '順番', ならべ: '並べ', たおす: '倒す', たおし: '倒し', たおれ: '倒れ', まって: '待って', ふつう: '普通', いちど: '一度',
  いじょう: '以上', いか: '以下', きほん: '基本', むしょく: '無色', よびごえ: '呼び声',
}).filter(([k, v]) => k !== v).sort((a, b) => b[0].length - a[0].length);
const START = '(^|[\\s　、。：！？「（・／→＝])';
const RE = new RegExp(`${START}(${WORDS.map(([k]) => k).join('|')})`, 'g');
const MAP = Object.fromEntries(WORDS);
const JA = '[ぁ-んァ-ヶー一-龠々、。！？」）\\]％]';
const JA_NEXT = '(?!ライフ|マナ)[ぁ-んァ-ヶー一-龠々「（]'; // 「名前 ライフ 13」の 空白は のこす
const SPACES = new RegExp(`(${JA})[ \\u00a0]+(?=${JA_NEXT})`, 'g');

export function adultText(t) {
  if (!t || !/[ぁ-ん]|（/.test(t)) return t;
  let s = t.replace(/([一-龠々])（[ぁ-ゖー]+）/g, '$1'); // ふりがな「漢字（よみ）」
  for (const [re, to] of PHRASES) s = s.replace(re, to);
  for (let k = 0; k < 2; k++) s = s.replace(RE, (m, a, w) => a + MAP[w]); // 「てきの こうげき」のように ならんだ ことばも
  return s.replace(SPACES, '$1').replace(/([のをにがはでと])[ \u00a0]+(ライフ|マナ)/g, '$1$2');
}

const isJa = (c) => !!c && /[ぁ-んァ-ヶー一-龠々、。！？」）]/.test(c);
function fixText(n) {
  let v = adultText(n.nodeValue);
  // ふりがなを外したあとの 要素の さかいめの 空白（<ruby>敵</ruby> の）
  if (/^[  ]/.test(v) && isJa(n.previousSibling?.textContent?.slice(-1))) v = v.replace(/^[  ]+/, '');
  if (/[  ]$/.test(v) && isJa(n.nextSibling?.textContent?.[0])) v = v.replace(/[  ]+$/, '');
  if (v !== n.nodeValue) n.nodeValue = v;
}
function fix(node) {
  if (node.nodeType === 3) return fixText(node);
  if (node.nodeType !== 1 || node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
  if (node.tagName === 'RT') { node.remove(); return; }
  for (const rt of node.querySelectorAll('rt')) rt.remove();
  const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const list = [];
  while (w.nextNode()) list.push(w.currentNode);
  for (const t of list) fixText(t);
  for (const el of node.querySelectorAll('[aria-label]')) el.setAttribute('aria-label', adultText(el.getAttribute('aria-label')));
}

let OBS = null;
export function adultOn() {
  if (OBS) return;
  fix(document.body);
  OBS = new MutationObserver((ms) => { for (const m of ms) { for (const n of m.addedNodes) fix(n); if (m.type === 'characterData') fixText(m.target); } });
  OBS.observe(document.body, { childList: true, subtree: true });
}
export function adultOff() { OBS?.disconnect(); OBS = null; }
export const adultActive = () => !!OBS;
