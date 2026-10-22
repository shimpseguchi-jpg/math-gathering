// ふりがな「漢字（よみ）」を 見つける。画面（view.js の ruby）と 漢字の チェック（tools/kanji.mjs）で つかう
// よみの まえの ことばは、うしろから 漢字と ひらがなを たどって、ひらがな（おくりがな）が よみに じゅんばんに
// ふくまれる いちばん 長い ところ（「割り振って（わりふって）」は ぜんぶ、「突発的な復活（ふっかつ）」は 復活 だけ）
const KANJI = /[一-龯々ヶ]/, HIRA = /[ぁ-ゖ]/;
const inOrder = (kana, yomi) => { let k = 0; for (const c of yomi) if (c === kana[k]) k++; return k === kana.length; };

// [{ i: はじめ, base, yomi, end: （よみ）の おわり }]
export function rubyParts(t) {
  const out = [];
  for (const m of String(t).matchAll(/（([ぁ-ゖー]+)）/g)) {
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
  return out;
}

// ふりがなの ところを f(base, yomi) で、ほかを g(文字) で おきかえる
export function mapRuby(t, f, g = (x) => x) {
  let s = '', last = 0;
  for (const p of rubyParts(t)) { s += g(t.slice(last, p.i)) + f(p.base, p.yomi); last = p.end; }
  return s + g(String(t).slice(last));
}
