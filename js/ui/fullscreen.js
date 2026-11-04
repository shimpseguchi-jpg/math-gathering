// ぜんがめん（2026-11-04）：iPad の Safari で、URL の バーや タブを かくして 画面 いっぱいに する（Fullscreen API）
// ・ブラウザが ゆるす とき だけ うごく（iPhone や、GAS の iframe が ゆるさない とき などは なにも しない。せっていにも 出ない）
// ・「いつも」の とき：タップの たびに、ぜんがめんで なければ ぜんがめんに する（ユーザーの タップの 中でないと ゆるされない）。
//   上から 下へ スワイプ・左上の ×で もどっても、つぎの タップで また ぜんがめん。はじめは iPad だけ「いつも」
// ・ホーム画面に 追加した アプリ（standalone）は さいしょから URL の バーが ないので なにも しない
const KEY = 'mtg-fullscreen'; // 'on' | 'off'（なければ iPad だけ on）
const root = document.documentElement;
const standalone = () => navigator.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
// iPadOS の Safari は Mac と おなじ なまえで 名のる（タッチの 点が 2つ いじょう なら iPad）
const iPad = () => /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
let mode = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();

export const fullCan = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !standalone();
export const fullOn = () => fullCan() && (mode ? mode === 'on' : iPad());
function enter() {
  if (!fullCan() || isFull()) return;
  try { (root.requestFullscreen || root.webkitRequestFullscreen).call(root)?.catch?.(() => {}); } catch { /* ゆるされない */ }
}
function leave() {
  if (!isFull()) return;
  try { (document.exitFullscreen || document.webkitExitFullscreen).call(document)?.catch?.(() => {}); } catch { /* もう もどって いる */ }
}
// せっていの ボタン（タップの 中で よぶ）
export function setFull(v) {
  mode = v ? 'on' : 'off';
  try { localStorage.setItem(KEY, mode); } catch { /* この あいだだけ */ }
  if (v) enter(); else leave();
}
// どこを タップしても（シートの ボタンは とちゅうで とめるので、さきに うけとる）。せっていの ボタンは setFull に まかせる
document.addEventListener('click', (e) => { if (fullOn() && !e.target.closest?.('[data-full]')) enter(); }, true);
