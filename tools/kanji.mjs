// 漢字の チェック：3年生までに 習う 漢字（学年別漢字配当表 1〜3年・440字）いがいは、
// 画面の ことばは ひらがな、カードの 文章（名前・タイプ・テキスト）は ふりがな「漢字（よみ）」に する
//   node mathtcg/tools/kanji.mjs   … 画面に 出る 文字列と カードの 文章を しらべて、ふりがなの ない 漢字を 出す
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mapRuby } from '../js/ui/ruby.js';

export const GRADE = {
  1: '一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六',
  2: '引羽雲園遠何科夏家歌画回会海絵外角楽活間丸岩顔汽記帰弓牛魚京強教近兄形計元言原戸古午後語工公広交光考行高黄合谷国黒今才細作算止市矢姉思紙寺自時室社弱首秋週春書少場色食心新親図数西声星晴切雪船線前組走多太体台地池知茶昼長鳥朝直通弟店点電刀冬当東答頭同道読内南肉馬売買麦半番父風分聞米歩母方北毎妹万明鳴毛門夜野友用曜来里理話',
  3: '悪安暗医委意育員院飲運泳駅央横屋温化荷界開階寒感漢館岸起期客究急級宮球去橋業曲局銀区苦具君係軽血決研県庫湖向幸港号根祭皿仕死使始指歯詩次事持式実写者主守取酒受州拾終習集住重宿所暑助昭消商章勝乗植申身神真深進世整昔全相送想息速族他打対待代第題炭短談着注柱丁帳調追定庭笛鉄転都度投豆島湯登等動童農波配倍箱畑発反坂板皮悲美鼻筆氷表秒病品負部服福物平返勉放味命面問役薬由油有遊予羊洋葉陽様落流旅両緑礼列練路和',
};
export const ALLOWED = new Set([...GRADE[1], ...GRADE[2], ...GRADE[3]]);
export const isKanji = (c) => /[㐀-鿿々]/.test(c);
// 習わない 漢字（々 は まえの 字と おなじ あつかい）
export const hard = (c) => isKanji(c) && c !== '々' && !ALLOWED.has(c);

// ふりがなの ついた ところ「漢字（よみ）」（js/ui/ruby.js。画面と おなじ 読みかた）を のぞいて、のこった 習わない 漢字を かえす
export const bareHard = (t) => [...mapRuby(String(t), () => '')].filter(hard);

// JS の 文字列（と テンプレートの 文字の ぶぶん）の 場所 [はじめ, おわり]。コメントと 正規表現は のぞく
export function lex(src) {
  const segs = []; let i = 0; const n = src.length;
  const KW = /^(return|typeof|case|of|in|else|do|void|delete|new|throw|yield|await|instanceof)$/;
  function code(stopBrace) {
    let last = ''; let depth = 0;
    const reOK = () => last === '' || /^[(,=:\[!&|?{};+\-*%<>~^]$/.test(last) || KW.test(last);
    while (i < n) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
      if (c === "'" || c === '"') { let j = i + 1; while (src[j] !== c) { if (src[j] === '\\') j++; j++; } segs.push([i + 1, j]); i = j + 1; last = 'a'; continue; }
      if (c === '`') { i++; tpl(); last = 'a'; continue; }
      if (c === '/' && reOK()) { let j = i + 1, cls = false; for (;;) { const ch = src[j]; if (ch === '\\') { j += 2; continue; } if (ch === '[') cls = true; else if (ch === ']') cls = false; else if (ch === '/' && !cls) break; j++; } j++; while (/[a-z]/.test(src[j])) j++; i = j; last = 'a'; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (/[A-Za-z_$0-9]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; last = src.slice(i, j); i = j; continue; }
      if (c === '{') depth++;
      if (c === '}') { if (stopBrace && depth === 0) { i++; return; } depth--; }
      last = c; i++;
    }
  }
  function tpl() {
    let s = i;
    while (i < n) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '`') { segs.push([s, i]); i++; return; }
      if (src[i] === '$' && src[i + 1] === '{') { segs.push([s, i]); i += 2; code(true); s = i; continue; }
      i++;
    }
  }
  code(false);
  return segs;
}

// 画面に 出る 文字列（js/）と カードの 文章（texts.js）で、ふりがなの ない 習わない 漢字を さがす
const UI_FILES = ['js/ui/app.js', 'js/ui/battle.js', 'js/ui/view.js', 'js/ui/online.js', 'js/ui/tutorial.js', 'js/ui/settings.js', 'js/engine/game.js', 'js/engine/ai.js', 'js/engine/run.js', 'js/data/cards.js', 'js/data/enemies.js', 'js/data/kit.js', 'js/data/set3.js', 'js/data/set4.js', 'js/data/set5.js', 'js/data/set6.js', 'js/data/alchemy.js'];
export async function check(root) {
  const bad = [];
  const { GLOSSARY } = await import(join(root, 'js/ui/glossary.js'));
  const terms = new Set(GLOSSARY.map((g) => g.key));
  for (const f of UI_FILES) {
    const src = readFileSync(join(root, f), 'utf8');
    for (const [a, b] of lex(src)) {
      const s = src.slice(a, b);
      if (terms.has(s) && src[a - 1] === "'") continue; // キーワードの 名前の 表（ui/view.js の KW。画面では ふりがなを つけて 出す）
      const k = bareHard(s);
      if (k.length) bad.push(`${f}:${src.slice(0, a).split('\n').length}  ${k.join('')}  「${s.slice(0, 40)}」`);
    }
  }
  // ことばの せつめい（glossary）は text だけ
  for (const g of GLOSSARY) { const k = bareHard(g.text); if (k.length) bad.push(`glossary ${g.key}  ${k.join('')}`); }
  const { CARD_TEXT, ENEMY_TEXT } = await import(join(root, 'js/data/texts.js'));
  for (const [id, c] of Object.entries(CARD_TEXT)) for (const key of ['name', 'type', 'text', 'math']) { const k = bareHard(c[key]); if (k.length) bad.push(`カード ${id} ${key}  ${k.join('')}`); }
  for (const [n, c] of Object.entries(ENEMY_TEXT)) for (const key of ['name', 'type', 'text', 'reward']) { const k = bareHard(c[key]); if (k.length) bad.push(`敵 ${n} ${key}  ${k.join('')}`); }
  return bad;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const bad = await check(ROOT);
  console.log(bad.length ? bad.join('\n') : 'OK：ふりがなの ない 習わない 漢字は ない');
  console.log(`（3年生までの 漢字 ${ALLOWED.size}字）`);
  if (bad.length) process.exitCode = 1;
}
