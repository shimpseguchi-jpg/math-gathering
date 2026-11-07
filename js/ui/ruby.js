// ふりがな「漢字（よみ）」を 見つける。画面（view.js の ruby）と 漢字の チェック（tools/kanji.mjs）で つかう
// よみの まえの ことばは、うしろから 漢字と ひらがなを たどって、ひらがな（おくりがな）が よみに じゅんばんに
// ふくまれる いちばん 長い ところ（「割り振って（わりふって）」は ぜんぶ、「突発的な復活（ふっかつ）」は 復活 だけ）
const KANJI = /[一-龯々ヶ]/, HIRA = /[ぁ-ゖ]/;
const inOrder = (kana, yomi) => { let k = 0; for (const c of yomi) if (c === kana[k]) k++; return k === kana.length; };

// 名前 ぜんたいに つける よみ（2026-11-07。宝具の カタカナの よみ）：青空文庫と おなじ「｜約束された勝利の剣《エクスカリバー》」。
// ｜から《 までが ルビの かかる ところ（ひらがなや 読点（、）が まざっても よい）
export const WHOLE_RE = /｜([^｜《》\n]+)《([^《》\n]+)》/g;
// ふりがなを とった 文字（「漢字（よみ）」の（よみ）と、｜《よみ》の しるし）
export const stripRuby = (t) => String(t ?? '').replace(/（[ぁ-ゖー]+）/g, '').replace(/《[^《》\n]*》/g, '').replace(/｜/g, '');

// [{ i: はじめ, base, yomi, end: （よみ）の おわり }]
export function rubyParts(t) {
  const out = [];
  t = String(t);
  const whole = [...t.matchAll(WHOLE_RE)].map((m) => ({ i: m.index, base: m[1], yomi: m[2], end: m.index + m[0].length }));
  const inWhole = (k) => whole.some((w) => k >= w.i && k < w.end);
  for (const m of t.matchAll(/（([ぁ-ゖー]+)）/g)) {
    if (inWhole(m.index)) continue;
    const yomi = m[1];
    let best = -1;
    for (let j = m.index - 1; j >= 0 && (KANJI.test(t[j]) || HIRA.test(t[j])); j--) {
      if (!KANJI.test(t[j])) continue;
      const base = t.slice(j, m.index);
      const kana = [...base].filter((c) => HIRA.test(c));
      const tail = base.match(/[ぁ-ゖ]*$/)[0];
      if (inOrder(kana, yomi) && yomi.endsWith(tail)) best = j; else if (kana.length) break;
    }
    if (best >= 0 && (!out.length || best >= out[out.length - 1].end)) out.push({ i: best, base: t.slice(best, m.index), yomi, end: m.index + m[0].length });
  }
  if (!whole.length) return out;
  // ｜《》の すぐ あとの 「漢字（よみ）」が ｜の 中まで さかのぼらない ように
  return [...whole, ...out.filter((p) => !whole.some((w) => p.i < w.end && p.end > w.i))].sort((a, b) => a.i - b.i);
}

// ふりがなの ところを f(base, yomi) で、ほかを g(文字) で おきかえる
export function mapRuby(t, f, g = (x) => x) {
  let s = '', last = 0;
  for (const p of rubyParts(t)) { s += g(t.slice(last, p.i)) + f(p.base, p.yomi); last = p.end; }
  return s + g(String(t).slice(last));
}
