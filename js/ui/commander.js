// 統率者戦（とうそつしゃせん）の れんしゅう（docs/RAID.md 3.2）：陣営と 統率者を えらんで、ちがう 陣営の CPU と たたかう
// デッキは 統率者の 色だけで 自動で 組む（第1〜6弾の カードから 20まい）。統率者は 統率領域に いて、唱える たびに ＋2マナ
import { BY_ID, SETS } from '../data/cards.js';
import { pvp } from '../data/enemies.js';
import { colorsOf } from '../engine/game.js';
import { buildDeck } from '../engine/run.js';
import { startBattle } from './battle.js';
import { sheet, ruby, info, detail, fullCard, COLOR_NAME } from './view.js';

// ライフ：どちらも 30（長の なかまの カードを 足して、AI どうし 100戦で 龍族 47%：docs/SIMULATION.md）
export const FACTIONS = {
  dragon: { name: '龍族（りゅうぞく）', life: 30, ids: ['RG07', 'WG07', 'KR07', 'WU07', 'UK07'] },
  human: { name: '人間（にんげん）', life: 30, ids: ['AB02', 'JE02', 'SU02', 'MA02', 'TE02'] },
};
// 龍王と 氏族の 長の 5つの 対決（RAID.md 3.2）
export const RIVAL = { WG07: 'AB02', WU07: 'JE02', UK07: 'SU02', KR07: 'MA02', RG07: 'TE02' };
const colorText = (d) => colorsOf(d).map((c) => COLOR_NAME[c]).join('・');

// 統率者の 色だけの デッキ（統率者じしんと 旗は 入れない）
export function cmdDeck(def) {
  const pool = SETS.filter((st) => st.id <= 6).flatMap((st) => st.cards).filter((d) => !d.banner && d.id !== def.id && !(d.sub || []).includes('lesson'));
  const ids = colorsOf(def);
  // 3色の 統率者は、2色を 中心に 3色めを すこし（3色を そろえて 入れると よわい：docs/SIMULATION.md）
  if (ids.length >= 3) return buildDeck(pool.filter((d) => colorsOf(d).every((c) => ids.includes(c))), { splash: 4, banners: false }).deck;
  return buildDeck(pool, { pair: ids }).deck;
}

// 統率者を えらぶ：5まいの カードを ならべて、スワイプ（か ‹ ›）で めくる。□□▣□□ は いまの 位置
// o = { title, note(def) → 下に 出す 文, ok: 決定ボタンの 文 } → えらんだ ID（もどるは null）
export function pickCommander(ids, o = {}) {
  return new Promise((resolve) => {
    const el = document.getElementById('app');
    let i = 0;
    const draw = (dir = 0) => {
      const d = BY_ID[ids[i]];
      el.innerHTML = `<main class="cmd-pick">
        <p class="eyebrow">${ruby('統率者（とうそつしゃ）を えらぶ')}</p>
        <h2>${o.title || ''}</h2>
        <div class="cp-stage">
          <button type="button" class="cp-arrow" data-cp="-1" aria-label="まえの 統率者">‹</button>
          <div class="cp-card ${dir > 0 ? 'from-r' : dir < 0 ? 'from-l' : ''}">${fullCard(d)}</div>
          <button type="button" class="cp-arrow" data-cp="1" aria-label="つぎの 統率者">›</button>
        </div>
        <div class="cp-dots" role="tablist">${ids.map((x, k) => `<button type="button" class="${k === i ? 'on' : ''}" data-cpi="${k}" aria-label="${k + 1}まいめ" aria-selected="${k === i}"></button>`).join('')}</div>
        <p class="cp-info">${colorText(d)}・${d.cost}マナ${o.note ? `・${o.note(d)}` : ''}</p>
        <div class="row-btns"><button type="button" class="btn" data-cpgo="back">もどる</button><button type="button" class="btn primary" data-cpgo="ok">${o.ok || 'この 統率者に する'}</button></div>
      </main>`;
    };
    const go = (n) => { const dir = n; i = (i + n + ids.length) % ids.length; draw(dir); };
    const done = (v) => { el.onclick = null; el.onpointerdown = null; el.onpointerup = null; window.removeEventListener('keydown', key); resolve(v); };
    const key = (e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); };
    el.onclick = (e) => {
      const a = e.target.closest('[data-cp]'); if (a) return go(+a.dataset.cp);
      const t = e.target.closest('[data-cpi]'); if (t) { const k = +t.dataset.cpi; const dir = k - i; i = k; return draw(dir); }
      const b = e.target.closest('[data-cpgo]'); if (b) return done(b.dataset.cpgo === 'ok' ? ids[i] : null);
    };
    // スワイプ：よこに 40px いじょう うごかしたら めくる
    let x0 = null;
    el.onpointerdown = (e) => { if (e.target.closest('.cp-stage')) x0 = e.clientX; };
    el.onpointerup = (e) => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) >= 40) go(dx < 0 ? 1 : -1); };
    window.addEventListener('keydown', key);
    draw();
  });
}

export async function commanderMenu(back) {
  const f = await sheet(`<p>${ruby('陣営（じんえい）を えらんで、その リーダーを 統率者（とうそつしゃ）に する。統率者は デッキとは べつの「とうそつりょういき」に いて、マナが あれば いつでも 唱（とな）えられる。唱える たびに ＋2マナ（とうそつしゃぜい）。ライフは 30。')}</p>`,
    [...Object.entries(FACTIONS).map(([k, v]) => ({ label: ruby(v.name), value: k, kind: 'primary', note: k === 'dragon' ? '龍王（2色）' : '氏族の 長（3色）' })), { label: 'もどる', value: null }],
    { title: '統率者戦（とうそつしゃせん）れんしゅう' });
  if (!f) return back();
  const id = await pickCommander(FACTIONS[f].ids, { title: `${ruby(FACTIONS[f].name)}の 統率者`, note: () => ruby('デッキは 統率者の 色で 自動で 組む') });
  if (!id) return commanderMenu(back);
  const me = BY_ID[id];
  const other = f === 'dragon' ? 'human' : 'dragon';
  // あいては 5つの 対決の あいて（たまに ほかの 統率者）
  const foeIds = FACTIONS[other].ids;
  const fid = Math.random() < 0.6 ? (RIVAL[id] || Object.keys(RIVAL).find((k) => RIVAL[k] === id)) : foeIds[Math.floor(Math.random() * foeIds.length)];
  const foe = BY_ID[fid];
  const go = await sheet(`${detail(me)}<p class="what">あいて：${ruby(FACTIONS[other].name)}の ${ruby(info(foe).name)}（${colorText(foe)}）</p>`,
    [{ label: 'たたかう', value: 1, kind: 'primary' }, { label: 'もどる', value: 0 }], { title: 'この 統率者で たたかう？' });
  if (!go) return commanderMenu(back);
  const name = `${info(foe).name.replace(/（[ぁ-ゖー]+）/g, '')}（CPU）`;
  startBattle({
    deck: cmdDeck(me), cmd: me, life: FACTIONS[f].life,
    floor: pvp({ deck: cmdDeck(foe), cmd: foe, life: FACTIONS[other].life, name, first: Math.random() < 0.5 ? 'P' : 'E' }), floorName: name, diff: 'normal',
    quit: { label: 'やめて もどる', note: 'れんしゅう なので まけには ならない。', go: () => end(null) },
    onEnd: (r) => end(r),
  });
  async function end(r) {
    if (r) {
      const res = r.draw ? 'draw' : r.win ? 'win' : 'lose';
      await sheet(`<p class="big-result ${res}">${{ win: 'かった！', lose: 'まけた…', draw: 'ひきわけ' }[res]}</p>`, [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: '統率者戦 れんしゅう', dismiss: false });
    }
    commanderMenu(back);
  }
}
