// GAS 版の サーバー（gas/Code.gs）と つなぐ ところ。サーバーが ない とき（GitHub Pages など）は 何も しない
// はじめに mtgConfig を よんで、先生の せってい（パックの 弾・つかわない 弾・レイドの 期間）と、ひらいた 人が 先生か どうかを もらう
export const hasServer = () => !!(window.google && window.google.script && window.google.script.run);
export function call(fn, arg, ms = 20000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('つながらなかった')), ms);
    window.google.script.run
      .withSuccessHandler((r) => { clearTimeout(t); resolve(r); })
      .withFailureHandler((e) => { clearTimeout(t); reject(e); })[fn](arg);
  });
}

// せってい：つながらない ときの ために この 端末にも おぼえて おく
const KEY = 'mtg-server-conf';
const EMPTY = { admin: false, login: false, sets: null, ban: [], raid: null, saved: null };
export let CONF = (() => { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...EMPTY }; } })();
export async function loadConf() {
  if (!hasServer()) return CONF;
  try {
    CONF = { ...EMPTY, ...(await call('mtgConfig', undefined, 10000)) };
    try { localStorage.setItem(KEY, JSON.stringify(CONF)); } catch { /* この あいだだけ */ }
  } catch { /* つながらない ときは まえの せってい */ }
  return CONF;
}
export const setSaved = (s) => { CONF = { ...CONF, saved: s }; };

// ひきつぎ：この 端末の セーブ（mtg- で はじまる もの）を まとめる。せっていの おぼえと デバッグの オン・オフは のぞく
const SKIP = new Set([KEY, 'mtg-debug']);
export function packSave() {
  const o = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('mtg-') && !SKIP.has(k)) o[k] = localStorage.getItem(k); } } catch { /* よめない */ }
  return JSON.stringify(o);
}
export function unpackSave(json) {
  const o = JSON.parse(json);
  const old = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('mtg-') && !SKIP.has(k)) old.push(k); }
  old.forEach((k) => localStorage.removeItem(k));
  for (const [k, v] of Object.entries(o)) if (k.startsWith('mtg-') && !SKIP.has(k) && typeof v === 'string') localStorage.setItem(k, v);
}
