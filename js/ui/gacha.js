// パック開封（ソシャゲの ガチャ演出）。冒険の パック（app.js）と こうちくモードの ショップ（construct.js）で つかう
// ① 光る パックを タップして やぶる → ② 1まいずつ めくる（裏の光り方で レアリティが わかる）→ ③ まとめ
// o = { eyebrow：上の 小さい 文字, bonus：パックの 下の せつめい（html）, rare：レアパックの みため, owned：もって いた カードの Set（NEW の しるし）, done() }
import { BY_ID } from '../data/cards.js';
import { sfx, soundOn, setSound } from './sfx.js';
import { cardFace, fullCard, detail, sheet, esc, ruby, info } from './view.js';

const ORDER = [1, 2, 3, 0, 4, 5, 6, 7]; // コモン → アンコモン → レア の順。0 は「！？」の わく
const GLOW = { C: '', U: 'g-U', R: 'g-R', L: 'g-L' };
export const RAR_NAME = { C: 'コモン', U: 'アンコモン', R: 'レア', L: 'レジェンド' };
const nm = (d) => info(d).name; // ふりがなつきの 名前（ruby に とおして 出す）
function flash() {
  const f = document.createElement('div');
  f.className = 'flash';
  document.body.append(f);
  setTimeout(() => f.remove(), 900);
}

export function gacha(app, cards, o = {}) {
  // めくる じゅんばん：アンコモンの もんしょうで ふえた 9まいめ（アンコモン）は レアの まえ。8まいより すくない（ショップの のこりが すくない 弾）は その じゅん
  const order = cards.length > 8 ? [1, 2, 3, 0, 4, 5, 6, 8, 7] : cards.length === 8 ? ORDER : cards.map((_, i) => i);
  const surprise = !!cards.surprise;
  const ids = cards.map((d) => d.id);
  const owned = o.owned || new Set();
  const best = cards.some((d) => d.rar === 'L') ? 'L' : 'R';
  let stage = 'pack', k = 0, cracked = false, flipped = false;
  const st = { aura: best === 'L' ? 'aura-L' : 'aura-R' };
  const top = () => `<div class="pk-top"><p class="eyebrow">${o.eyebrow || 'パック'}</p>
    <button type="button" class="snd" data-snd="1" aria-pressed="${soundOn()}">おと ${soundOn() ? 'あり' : 'なし'}</button></div>`;
  const burst = (n = 22) => Array.from({ length: n }, (_, i) => `<i style="--a:${(360 / n) * i + Math.random() * 12}deg;--d:${70 + Math.random() * 90}px;--h:${Math.floor(Math.random() * 360)}"></i>`).join('');

  const draw = () => {
    if (stage === 'pack') {
      app().innerHTML = `<main class="gacha">${top()}
        <button type="button" class="foil ${st.aura} ${o.rare ? 'rare-pack' : ''}" data-open="1" aria-label="パックを あける">
          <span class="foil-shine"></span><span class="foil-title">MATHEMATIC<br>THE GATHERING</span><span class="foil-sub">${ids.length}まい いり</span>
        </button>
        <p class="gacha-hint">${best === 'L' ? 'パックが にじいろに 光っている…！？' : 'タップして パックを やぶろう'}</p>
        ${o.bonus || ''}
      </main>`;
      return;
    }
    if (stage === 'reveal') {
      const i = order[k], d = BY_ID[ids[i]];
      const isSurprise = surprise && i === 0;
      const rar = isSurprise && !cracked ? 'C' : d.rar;
      const isNew = !owned.has(ids[i]);
      app().innerHTML = `<main class="gacha">${top()}
        <div class="stage ${flipped ? `shown s-${d.rar}` : ''}">
          ${flipped ? `<div class="big-card ${d.rar === 'L' ? 'legend' : ''}">${fullCard(d)}${isNew ? '<span class="new">NEW</span>' : ''}${isSurprise ? '<span class="wow">！？</span>' : ''}</div>`
            : `<button type="button" class="big-back ${GLOW[rar]} ${isSurprise && cracked ? 'crack' : ''}" data-flip="1" aria-label="めくる"><span>${isSurprise && cracked ? '！？' : '?'}</span></button>`}
          ${flipped && (d.rar === 'R' || d.rar === 'L') ? `<div class="burst ${d.rar === 'L' ? 'b-L' : ''}" aria-hidden="true">${burst(d.rar === 'L' ? 36 : 20)}</div>` : ''}
          ${flipped && d.rar === 'L' ? `<p class="legend-call">${isSurprise ? '<small>しょうかく！</small>' : ''}LEGEND!!</p>` : ''}
        </div>
        <p class="gacha-hint">${flipped ? `${esc(RAR_NAME[d.rar])}「${ruby(nm(d))}」` : rar === 'L' ? 'にじいろ…！' : rar === 'R' ? 'きんいろに 光っている！' : rar === 'U' ? 'ぎんいろに 光っている' : 'タップして めくろう'}</p>
        <ol class="dots">${order.map((_, n) => `<li class="${n < k || (n === k && flipped) ? 'on' : ''} ${n === k ? 'now' : ''}"></li>`).join('')}</ol>
        <p class="tap-next">${flipped ? `カードを タップで ${k < order.length - 1 ? 'つぎへ' : 'まとめへ'}（点線の ことばは 長おしで せつめい）` : ''}</p>
        <div class="row-btns"><button type="button" class="btn ghost" data-skip="1">スキップ</button></div>
      </main>`;
      return;
    }
    app().innerHTML = `<main class="gacha">${top()}
      <h2 class="sum-title">このパックの カード</h2>
      <div class="pack-grid">${ids.map((id, i) => `<button type="button" class="sum-card ${GLOW[BY_ID[id].rar]}" data-i="${i}">${cardFace(BY_ID[id])}${!owned.has(id) ? '<span class="new">NEW</span>' : ''}</button>`).join('')}</div>
      <div class="row-btns"><button type="button" class="btn primary" data-done="1">${esc(o.doneLabel || 'つぎへ')}</button></div>
    </main>`;
  };
  draw();

  let flippedAt = 0;
  const next = () => { if (k < order.length - 1) { k++; flipped = false; cracked = false; } else stage = 'sum'; sfx.tap(); draw(); };
  app().onclick = async (e) => {
    // めくった あとは、音・スキップ 以外の どこを タップしても つぎへ（点線の ことばの 長おしは せつめいが 出て、つぎへは いかない）
    if (stage === 'reveal' && flipped && !e.target.closest('[data-snd], [data-skip]')) {
      if (Date.now() - flippedAt > 350) next();
      return;
    }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.snd) { setSound(!soundOn()); return draw(); }
    if (b.dataset.open) {
      sfx.tear();
      b.classList.add('torn');
      setTimeout(() => { stage = 'reveal'; draw(); }, 520);
      return;
    }
    if (b.dataset.skip) { stage = 'sum'; sfx.flip(); return draw(); }
    if (b.dataset.flip) {
      const i = order[k], d = BY_ID[ids[i]];
      if (surprise && i === 0 && !cracked) { cracked = true; sfx.surprise(); return draw(); } // コモンの はずが…！？
      if ((d.rar === 'R' || d.rar === 'L') && !b.classList.contains('charging')) {
        b.classList.add('charging'); sfx.charge();
        setTimeout(() => { flipped = true; flippedAt = Date.now(); (d.rar === 'L' ? sfx.legend : sfx.rare)(); draw(); if (d.rar === 'L') flash(); }, 900);
        return;
      }
      flipped = true; flippedAt = Date.now();
      (d.rar === 'U' ? sfx.uncommon : sfx.flip)();
      return draw();
    }
    if (b.dataset.done) return o.done?.();
    if (b.dataset.i != null) await sheet(detail(BY_ID[ids[+b.dataset.i]]), [{ label: 'とじる', value: 0 }]);
  };
}
