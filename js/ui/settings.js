// せってい画面（タイトルから）。WEB版は 開発モード：パックに 入る 弾（収録する 弾）を えらべる
import { SETS } from '../data/cards.js';
import { packPool } from '../engine/run.js';
import { soundOn, setSound } from './sfx.js';
import { ruby } from './view.js';

// WEB版は 開発モード。false に すると 開発用の 項目が かくれて、ぜんぶの 弾が パックに 入る
export const DEV = true;
const KEY = 'mtg-sets';
// まだ データに なって いない 弾（えらべない。作ったら cards.js の SETS に 入る）
const PLANNED = [
  [3, '第3弾（だん）「冥界（めいかい）の 門（もん）」', 81],
  [4, '第4弾（だん）「星（ほし）めぐりの 夜（よる）」', 74],
  [5, '第5弾（だん）「大きな 数の 塔（とう）」', 94],
  [6, '第6弾（だん）「三つの 旗（はた）」', 45],
  [7, 'アルケミー（デジタル 限定（げんてい））', 31],
].filter(([id]) => !SETS.some((x) => x.id === id));

// 番外編（extra）と サブセット（sub）は せっていでは えらばない。もんしょう（パックの もんしょう）で いまの 弾に まざる
const ALL_SETS = SETS.filter((x) => !x.extra && !x.sub && !x.raid).map((x) => x.id);
// 出ている 弾（released）。開発中の 弾は 開発モードで えらんだ ときだけ
const RELEASED = SETS.filter((x) => x.released).map((x) => x.id);
let sets = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    const ok = Array.isArray(v) ? v.filter((x) => ALL_SETS.includes(x)) : [];
    return ok.length ? ok : RELEASED;
  } catch { return RELEASED; }
})();

// パックに 入れる 弾（開発モードで ないときは 出ている 弾 ぜんぶ）
export const enabledSets = () => (DEV ? sets : RELEASED);
const setSets = (v) => {
  sets = v;
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* 保存できなくても この あいだは つかえる */ }
};
// みため（2026-10-26）：'classic'（いまの みため）か 'gba'（ドット。ゲームボーイアドバンスの ころの カードゲーム ふう）
const THEME_KEY = 'mtg-theme';
export const theme = () => { try { return localStorage.getItem(THEME_KEY) === 'gba' ? 'gba' : 'classic'; } catch { return 'classic'; } };
export const applyTheme = (t = theme()) => { document.documentElement.dataset.theme = t; };
const setTheme = (t) => { try { localStorage.setItem(THEME_KEY, t); } catch { /* 保存できなくても この あいだは かわる */ } applyTheme(t); };
// ぼうけんの まえと おわりの しゅぎょう（広告。docs/EMBLEMS.md 8章）。開発モードでは せっていで オフに できる
const AD_KEY = 'mtg-ads-off';
let adsOff = (() => { try { return localStorage.getItem(AD_KEY) === '1'; } catch { return false; } })();
export const adsOn = () => !(DEV && adsOff);
const setAdsOff = (v) => { adsOff = v; try { localStorage.setItem(AD_KEY, v ? '1' : '0'); } catch { /* この あいだだけ */ } };

// タイトルに 出す みじかい 説明（ぜんぶの ときは なし）
export const setsNote = () => (String(enabledSets()) === String(RELEASED) ? '' : SETS.filter((x) => sets.includes(x.id)).map((x) => x.name.replace(/「.*$/, '')).join('・'));

export function settingsScreen(app, back) {
  const draw = () => {
    const on = enabledSets();
    const pool = packPool(on);
    const n = (r) => pool[r].length;
    app().innerHTML = `<main class="settings">
      <h2>せってい</h2>
      <section class="st-sec">
        <h3>みため</h3>
        <div class="row-btns st-theme">${[['classic', 'いまの みため'], ['gba', 'ドット（GBA ふう）']].map(([k, l]) => `<button type="button" class="btn ${theme() === k ? 'primary' : ''}" data-look="${k}" aria-pressed="${theme() === k}">${l}</button>`).join('')}</div>
      </section>
      <section class="st-sec">
        <h3>おと</h3>
        <button type="button" class="btn" data-snd="1" aria-pressed="${soundOn()}">おと ${soundOn() ? 'あり' : 'なし'}</button>
      </section>
      ${DEV ? `<section class="st-sec">
        <h3><span class="dev-badge">開発モード</span>こうこく（しゅぎょう）</h3>
        <p class="st-note">ぼうけんの まえと おわりに 出る 60びょうの しゅぎょう。オフに すると すぐ パックに すすむ。</p>
        <button type="button" class="btn" data-ads="1" aria-pressed="${adsOn()}">こうこく ${adsOn() ? 'あり' : 'なし'}</button>
      </section>
      <section class="st-sec">
        <h3><span class="dev-badge">開発モード</span>${ruby('しゅうろくする 弾（だん）')}</h3>
        <p class="st-note">${ruby('パックから 出る カードを、弾（だん）ごとに えらぶ。つぎに あける パックから かわる（もう 持っている カードは そのまま）。1つは のこす。')}</p>
        <ul class="st-sets">
          ${SETS.filter((x) => !x.raid).map((x) => `<li><label><input type="checkbox" id="set-${x.id}" data-set="${x.id}" ${on.includes(x.id) ? 'checked' : ''} ${(on.length === 1 && on.includes(x.id)) || x.extra || x.sub ? 'disabled' : ''}><span><b>${ruby(x.name)}</b><small>${x.cards.filter((d) => !d.noPack).length}しゅるい${x.released ? '' : '・<em class="st-dev">開発中</em>'}${x.extra ? '・もんしょう「番外編（ばんがいへん）パック」で まざる' : ''}</small></span></label></li>`).join('')}
          ${PLANNED.map(([id, name, k]) => `<li class="planned"><label><input type="checkbox" id="plan-${id}" disabled><span><b>${ruby(name)}</b><small>じゅんびちゅう（あんは ${k}しゅるい）</small></span></label></li>`).join('')}
        </ul>
        <p class="st-pool">パックに 出る カード：<b>${n('C') + n('U') + n('R') + n('L')}しゅるい</b>（コモン ${n('C')}・アンコモン ${n('U')}・レア ${n('R')}・レジェンド ${n('L')}）</p>
      </section>` : ''}
      <button type="button" class="btn primary" data-back="1">タイトルへ もどる</button>
    </main>`;
  };
  draw();
  app().onclick = (e) => {
    if (e.target.closest('[data-back]')) { app().onchange = null; return back(); }
    if (e.target.closest('[data-snd]')) { setSound(!soundOn()); draw(); }
    const th = e.target.closest('[data-look]'); if (th) { setTheme(th.dataset.look); draw(); }
    if (e.target.closest('[data-ads]')) { setAdsOff(adsOn()); draw(); }
  };
  app().onchange = (e) => {
    const b = e.target.closest('[data-set]'); if (!b) return;
    const id = +b.dataset.set, on = enabledSets();
    const next = b.checked ? ALL_SETS.filter((x) => x === id || on.includes(x)) : on.filter((x) => x !== id);
    if (next.length) setSets(next);
    draw();
  };
}
