// 案（まだ データに なって いない カード）の ふりがなの チェック
//   node mathtcg/tools/kanji_drafts.mjs   … docs/SET3〜6.md・ALCHEMY.md・PROMO.md の カード表の 名前・タイプ・テキストを しらべる
// きまりは kanji.mjs と おなじ（3年生までの 漢字 いがいは「漢字（よみ）」）
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bareHard } from './kanji.mjs';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const FILES = ['SET3.md', 'SET4.md', 'SET5.md', 'SET6.md', 'ALCHEMY.md', 'PROMO.md', 'PLANESWALKERS.md'];
let rows = 0, bad = 0;
for (const f of FILES) {
  const path = join(DOCS, f);
  if (!existsSync(path)) continue;
  let head = null;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.startsWith('|')) { head = null; continue; }
    const c = line.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    if (c[0] === 'ID' || c[0] === '名前') { head = c; continue; }
    if (!head || /^[-: ]+$/.test(c[0])) continue;
    if (head[0] === 'ID' && !/^[A-Z]{1,2}\d\d$/.test(c[0])) continue;
    rows++;
    // カードの 表：名前・タイプ・テキスト・算数（ゲームの せつめいに 出る）。トークンの 表：名前・能力
    const cols = head[0] === 'ID' ? ['名前', 'タイプ', 'テキスト', '算数'] : ['名前', '能力'];
    for (const k of cols) {
      const i = head.indexOf(k);
      if (i < 0) continue;
      const h = bareHard(c[i] || '');
      if (h.length) { bad++; console.log(`${f} ${c[0]} ${k}：${[...new Set(h)].join('')}`); }
    }
  }
}
console.log(bad ? `NG：${bad}か所（${rows}行）` : `OK：${rows}行`);
process.exit(bad ? 1 : 0);
