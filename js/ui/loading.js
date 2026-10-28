// よみこみちゅうの しるし：＋ − × ÷ の カードが じゅんばんに はねる（フリーズでは ないと わかるように）
// CSS は index.html（ゲームの CSS より さきに 出すため）。transform だけ うごかすので かるく、JS が いそがしくても とまらない
export const loading = (text = 'よみこみちゅう') => `<div class="loading" role="status"><span class="ld-mark" aria-hidden="true"><span>＋</span><span>−</span><span>×</span><span>÷</span></span><span>${text}</span></div>`;

// サーバーと つうしん して いる あいだ、がめんの 上に 出す（すぐ おわる ときは 出さない）
let n = 0, timer = 0;
export function busy(on) {
  n = Math.max(0, n + (on ? 1 : -1));
  if (n && !timer && !document.getElementById('busy')) timer = setTimeout(show, 300);
  if (!n) { clearTimeout(timer); timer = 0; document.getElementById('busy')?.remove(); }
}
function show() {
  timer = 0;
  if (!n) return;
  const el = document.createElement('div');
  el.id = 'busy';
  el.innerHTML = loading();
  document.body.appendChild(el);
}
