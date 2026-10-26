// 統率者戦（とうそつしゃせん）の れんしゅう（docs/RAID.md 3.2）：陣営と 統率者を えらんで、ちがう 陣営の CPU と たたかう
// デッキは 統率者の 色だけで 自動で 組む（第1〜6弾の カードから 20まい）。統率者は 統率領域に いて、唱える たびに ＋2マナ
import { BY_ID, SETS } from '../data/cards.js';
import { pvp } from '../data/enemies.js';
import { colorsOf } from '../engine/game.js';
import { buildDeck } from '../engine/run.js';
import { startBattle } from './battle.js';
import { sheet, ruby, info, detail, COLOR_NAME } from './view.js';

// ライフ：龍族 30・人間 40（人間は 数が 多い。AI どうし 100戦で 龍族 68% → 59%：docs/SIMULATION.md）
export const FACTIONS = {
  dragon: { name: '龍族（りゅうぞく）', life: 30, ids: ['RG07', 'WG07', 'KR07', 'WU07', 'UK07'] },
  human: { name: '人間（にんげん）', life: 40, ids: ['AB02', 'JE02', 'SU02', 'MA02', 'TE02'] },
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

export async function commanderMenu(back) {
  const f = await sheet(`<p>${ruby('陣営（じんえい）を えらんで、その リーダーを 統率者（とうそつしゃ）に する。統率者は デッキとは べつの「とうそつりょういき」に いて、マナが あれば いつでも 唱（とな）えられる。唱える たびに ＋2マナ（とうそつしゃぜい）。ライフは 龍族 30・人間 40。')}</p>`,
    [...Object.entries(FACTIONS).map(([k, v]) => ({ label: ruby(v.name), value: k, kind: 'primary', note: k === 'dragon' ? '龍王（2色）' : '氏族の 長（3色）' })), { label: 'もどる', value: null }],
    { title: '統率者戦（とうそつしゃせん）れんしゅう' });
  if (!f) return back();
  const id = await sheet(`<p>${ruby('デッキは 統率者の 色だけで 自動で 組む。')}</p>`,
    [...FACTIONS[f].ids.map((x) => ({ label: `${ruby(info(BY_ID[x]).name)}（${colorText(BY_ID[x])}・${BY_ID[x].cost}マナ）`, value: x, kind: 'primary' })), { label: 'もどる', value: null }],
    { title: `${ruby(FACTIONS[f].name)}の 統率者` });
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
