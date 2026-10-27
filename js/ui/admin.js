// 開発モード（先生だけ・GAS 版）：みんなに きく せっていを かえる 管理画面。中身は スプレッドシートと おなじ（どちらで かえても よい）
// ・この 端末の デバッグモード（弾・こうこく・プレイマットを 自由に かえる。この 端末だけ）
// ・パックの 弾、つかわない サブセット・番外編、レイドの ID と おわり、ランキングの 時刻、ゴーストの 数
// ・かんりしゃ（先生）の メールアドレス、あいことば（docs/PROMO.md 2.2）
// 先生むけ なので 漢字を ふつうに つかう（子どもには 出ない）
import { SETS, BY_ID } from '../data/cards.js';
import { esc, ruby, sheet, info } from './view.js';
import { call, loadConf } from './server.js';
import { applyConf, setDebug, debugOn } from './settings.js';
import { applyRaid } from './raidstore.js';
import { NAME_A, NAME_B } from './online.js';

export const CODE_C = ['いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう', 'じゅう']; // あいことばの 3つめ（gas_Code.gs の CODE_C）
const MAIN = SETS.filter((x) => !x.extra && !x.sub && !x.raid);
const EXTRA = SETS.filter((x) => x.extra || x.sub);
const ids = (v) => String(v || '').split(/[,、\s]+/).map(Number).filter((x) => x > 0);
// 「2026/11/01 20:00」⇔ <input type="datetime-local"> の「2026-11-01T20:00」
const toLocal = (s) => { const m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})(?:\D+(\d{1,2}):(\d{2}))?/.exec(String(s || '')); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T${(m[4] || '0').padStart(2, '0')}:${m[5] || '00'}` : ''; };
const fromLocal = (s) => (s ? s.replace('T', ' ').replace(/-/g, '/') : '');
const opt = (list, v) => list.map((w, i) => `<option value="${i}" ${+v === i ? 'selected' : ''}>${esc(w)}</option>`).join('');
const RELEASED = MAIN.filter((x) => x.released).map((x) => x.id);
const packOn = (c) => (ids(c['パックの弾']).length ? ids(c['パックの弾']) : RELEASED); // 空 ＝ 出ている 弾 ぜんぶ
const cardName = (id) => (BY_ID[id] ? info(BY_ID[id]).name.replace(/（[^）]*）/g, '') : '');

export async function adminScreen(app, back) {
  app().innerHTML = '<main class="settings"><h2>開発モード</h2><p class="st-note">よみこみ中…</p></main>';
  let D;
  try { D = await call('mtgAdminGet'); } catch (err) {
    app().innerHTML = `<main class="settings"><h2>開発モード</h2><p class="st-note">ひらけませんでした（${esc(err?.message || err)}）</p><button type="button" class="btn primary" data-back="1">タイトルへ</button></main>`;
    app().onclick = (e) => { if (e.target.closest('[data-back]')) back(); };
    return;
  }
  let dirty = false;
  const draw = () => {
    const c = D.conf, on = packOn(c), ban = ids(c['つかわない弾']);
    app().innerHTML = `<main class="settings admin">
      <h2><span class="dev-badge">先生</span>開発モード</h2>
      <p class="st-note">${esc(D.me)} でひらいています。ここでの変更は保存するとすぐ全員にききます（スプレッドシートを直接書きかえても同じです）。<a href="${esc(D.url)}" target="_blank" rel="noopener">スプレッドシートをひらく</a></p>
      <section class="st-sec">
        <h3>デバッグモード（この端末だけ）</h3>
        <p class="st-note">オンにすると、せってい画面で弾・こうこく・プレイマットを自由にかえられます。子どもの端末ではオンにしないでください。</p>
        <button type="button" class="btn ${debugOn() ? 'primary' : ''}" data-debug="1" aria-pressed="${debugOn()}">デバッグモード ${debugOn() ? 'オン' : 'オフ'}</button>
      </section>
      <section class="st-sec">
        <h3>パックに入れる弾</h3>
        <p class="st-note">チェックした弾のカードがパックから出ます（はじめは出ている弾ぜんぶ）。1つはのこしてください。</p>
        <ul class="st-sets">${MAIN.map((x) => `<li><label><input type="checkbox" data-set="${x.id}" ${on.includes(x.id) ? 'checked' : ''}><span><b>${ruby(x.name)}</b><small>${x.released ? '出ている' : '<em class="st-dev">開発中</em>'}</small></span></label></li>`).join('')}</ul>
      </section>
      <section class="st-sec">
        <h3>つかわないサブセット・番外編</h3>
        <p class="st-note">チェックしたものは、子どもがもんしょうで解放してもパックにまざりません（番外編は他社の作品です）。</p>
        <ul class="st-sets">${EXTRA.map((x) => `<li><label><input type="checkbox" data-ban="${x.id}" ${ban.includes(x.id) ? 'checked' : ''}><span><b>${ruby(x.name)}</b></span></label></li>`).join('')}</ul>
      </section>
      <section class="st-sec">
        <h3>レイド</h3>
        <label class="ad-row">レイドID <input type="text" data-conf="レイドID" value="${esc(c['レイドID'])}" placeholder="tarkir-1"></label>
        <label class="ad-row">おわる日時 <input type="datetime-local" data-conf="レイドのおわり" value="${toLocal(c['レイドのおわり'])}"></label>
        <p class="st-note">おわる日時を空にするとレイドなし。IDを変える（tarkir-2 など）と点とゴーストが0から始まります。</p>
      </section>
      <section class="st-sec">
        <h3>オンライン バトル</h3>
        <label class="ad-row">ランキングの更新時刻 <input type="text" data-conf="ランキングの時刻" value="${esc(c['ランキングの時刻'])}" placeholder="7,17"></label>
        <label class="ad-row">階ごとのゴーストの数 <input type="number" min="1" max="200" data-conf="ゴーストの数" value="${esc(c['ゴーストの数'])}"></label>
        <label class="ad-row">陣営ごとのレイドゴーストの数 <input type="number" min="1" max="100" data-conf="レイドゴーストの数" value="${esc(c['レイドゴーストの数'])}"></label>
        <p class="st-note">いまの数：ゴースト ${D.count.ghost}・デッキの点 ${D.count.deck}・ひきつぎ ${D.count.save}人・あいことばを使った回数 ${D.count.used}</p>
      </section>
      <section class="st-sec">
        <h3>かんりしゃ（先生）</h3>
        <p class="st-note">ここに書いた学校アカウントの人は、開発モードとデバッグモードを使えます。デプロイした人（${esc(D.owner)}）はいつも使えます。</p>
        <table class="ad-table"><tbody>${D.admins.map((a, i) => `<tr><td><input type="email" data-adm="${i}" data-k="0" value="${esc(a[0])}" placeholder="sensei@…"></td><td><input type="text" data-adm="${i}" data-k="1" value="${esc(a[1])}" placeholder="メモ"></td><td><button type="button" class="btn" data-adm-del="${i}">けす</button></td></tr>`).join('')}</tbody></table>
        <button type="button" class="btn" data-adm-add="1">＋ 先生をふやす</button>
      </section>
      <section class="st-sec">
        <h3>あいことば</h3>
        <p class="st-note">子どもはプルダウンで3つのことばをえらびます。1人1回。のこり回数を空にすると何回でも。</p>
        <table class="ad-table"><thead><tr><th>ことば</th><th>カードID</th><th>はじまり</th><th>おわり</th><th>のこり</th><th>メモ</th><th></th></tr></thead><tbody>${D.codes.map((r, i) => { const w = r[0].split('-'); return `<tr>
          <td class="ad-words"><select data-code="${i}" data-w="0">${opt(NAME_A, w[0])}</select><select data-code="${i}" data-w="1">${opt(NAME_B, w[1])}</select><select data-code="${i}" data-w="2">${opt(CODE_C, w[2])}</select></td>
          <td><input type="text" data-code="${i}" data-k="1" value="${esc(r[1])}" size="6"><small data-cname="${i}">${esc(cardName(r[1]) || '？')}</small></td>
          <td><input type="datetime-local" data-code="${i}" data-k="2" value="${toLocal(r[2])}"></td>
          <td><input type="datetime-local" data-code="${i}" data-k="3" value="${toLocal(r[3])}"></td>
          <td><input type="number" min="0" data-code="${i}" data-k="4" value="${esc(r[4])}" style="width:4em"></td>
          <td><input type="text" data-code="${i}" data-k="5" value="${esc(r[5])}"></td>
          <td><button type="button" class="btn" data-code-del="${i}">けす</button></td></tr>`; }).join('')}</tbody></table>
        <button type="button" class="btn" data-code-add="1">＋ あいことばをふやす</button>
      </section>
      <div class="row-btns"><button type="button" class="btn primary" data-save="1" ${dirty ? '' : 'disabled'}>保存する</button><button type="button" class="btn" data-back="1">タイトルへ</button></div>
    </main>`;
  };
  draw();
  const touch = () => { dirty = true; const b = app().querySelector('[data-save]'); if (b) b.disabled = false; };
  app().onchange = (e) => {
    const t = e.target, c = D.conf;
    if (t.dataset.set) { const s = new Set(packOn(c)); if (t.checked) s.add(+t.dataset.set); else s.delete(+t.dataset.set); if (!s.size) { t.checked = true; return; } c['パックの弾'] = [...s].sort((a, b) => a - b).join(','); }
    else if (t.dataset.ban) { const s = new Set(ids(c['つかわない弾'])); if (t.checked) s.add(+t.dataset.ban); else s.delete(+t.dataset.ban); c['つかわない弾'] = [...s].sort((a, b) => a - b).join(','); }
    else if (t.dataset.conf) c[t.dataset.conf] = t.type === 'datetime-local' ? fromLocal(t.value) : t.value.trim();
    else if (t.dataset.adm) D.admins[+t.dataset.adm][+t.dataset.k] = t.value.trim();
    else if (t.dataset.code && t.dataset.w) { const r = D.codes[+t.dataset.code], w = r[0].split('-'); w[+t.dataset.w] = t.value; r[0] = w.join('-'); }
    else if (t.dataset.code) { D.codes[+t.dataset.code][+t.dataset.k] = t.type === 'datetime-local' ? fromLocal(t.value) : t.value.trim(); if (+t.dataset.k === 1) { const n = app().querySelector(`[data-cname="${t.dataset.code}"]`); if (n) n.textContent = cardName(t.value.trim()) || '？'; } }
    else return;
    touch();
  };
  app().onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.back) {
      if (dirty && !(await sheet('<p>保存していない変更があります。すてて戻りますか？</p>', [{ label: 'すてて戻る', value: 1 }, { label: 'やめる', value: 0, kind: 'primary' }], { title: '開発モード' }))) return;
      app().onchange = null; return back();
    }
    if (t.dataset.debug) { setDebug(!debugOn()); return draw(); }
    if (t.dataset.admAdd) { D.admins.push(['', '']); touch(); return draw(); }
    if (t.dataset.admDel) { D.admins.splice(+t.dataset.admDel, 1); touch(); return draw(); }
    if (t.dataset.codeAdd) { D.codes.push(['0-0-0', '', '', '', '', '']); touch(); return draw(); }
    if (t.dataset.codeDel) { D.codes.splice(+t.dataset.codeDel, 1); touch(); return draw(); }
    if (t.dataset.save) {
      const keys = D.codes.map((r) => r[0]);
      if (new Set(keys).size !== keys.length) return sheet('<p>おなじ あいことばが 2つ あります。</p>', [{ label: 'とじる', value: 1, kind: 'primary' }], { title: '開発モード' });
      const badCard = D.codes.find((r) => !BY_ID[r[1]]);
      if (badCard) return sheet(`<p>カードID「${esc(badCard[1])}」が ありません（例：P05、W01）。</p>`, [{ label: 'とじる', value: 1, kind: 'primary' }], { title: '開発モード' });
      t.disabled = true;
      try {
        D = await call('mtgAdminSave', { conf: D.conf, admins: D.admins.filter((a) => a[0]), codes: D.codes }, 30000);
        dirty = false;
        await loadConf(); applyConf(); applyRaid();
        draw();
        await sheet('<p>保存しました。</p>', [{ label: 'とじる', value: 1, kind: 'primary' }], { title: '開発モード' });
      } catch (err) { t.disabled = false; await sheet(`<p>保存できませんでした（${esc(err?.message || err)}）</p>`, [{ label: 'とじる', value: 1, kind: 'primary' }], { title: '開発モード' }); }
    }
  };
}
