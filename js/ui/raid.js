// レイド「タルキール大戦」（docs/RAID.md 3章）：龍族 か 人間の 陣営に ついて、統率者戦で たたかう
// 陣営の 点 ＝ みんなの（かった 数 × 10 ＋ といた 問題の 数 ＋ 統率者で とどめ × 5）。サーバー（GAS）で たし算する
// サーバーが ない とき（GitHub Pages など）は じぶんの 点だけ。あいては CPU
import { BY_ID } from '../data/cards.js';
import { pvp } from '../data/enemies.js';
import { colorsOf } from '../engine/game.js';
import { startBattle } from './battle.js';
import { sheet, esc, ruby, info, detail, COLOR_NAME } from './view.js';
import { hasServer, call, nameOf } from './online.js';
import { FACTIONS, RIVAL, cmdDeck } from './commander.js';
import { RAID, WIN_PTS, FINISH_PTS, DEF_PTS, loadRaid, saveRaid, raidOpen, raidFree, raidPoints, sendRaid } from './raidstore.js';

const plain = (t) => t.replace(/（[ぁ-ゖー]+）/g, '');
const cname = (id) => ruby(info(BY_ID[id]).name);
const colorText = (d) => colorsOf(d).map((c) => COLOR_NAME[c]).join('・');
const other = (f) => (f === 'dragon' ? 'human' : 'dragon');
const rivalOf = (id) => RIVAL[id] || Object.keys(RIVAL).find((k) => RIVAL[k] === id);
// ボーラスの セリフ（勝った 陣営で かわる）
const BOLAS = {
  human: '龍（りゅう）を たおして くれて、感謝（かんしゃ）しよう。おかげで 我（われ）の 力が より 強（つよ）まった。ははははは……',
  dragon: '龍（りゅう）を 育（そだ）てて くれて、感謝（かんしゃ）しよう。おかげで 我（われ）の 力が より 強（つよ）まった。ははははは……',
};
const myName = () => { try { return JSON.parse(localStorage.getItem('mtg-online-v1') || 'null')?.name || [0, 0]; } catch { return [0, 0]; } };

export async function raidMenu(app, back) {
  let r = loadRaid();
  if (!r.f && raidOpen()) return join(app, back); // おわった あとは けっかだけ 見られる
  // 陣営の 点（サーバー）
  let st = null;
  if (hasServer()) { try { st = await call('mtgRaidState', { id: RAID.id, me: r.g, f: r.f }); } catch { st = null; } }
  // ぼうえい：じぶんの ゴーストが まもった 回数。ゴーストが 20人から おちて いたら 出しなおす
  let news = '';
  if (st?.mine) {
    r.def = st.mine.w;
    if (r.def > r.defSeen) news = `きみの ゴーストが ${r.def - r.defSeen}回 まもった！ ＋${DEF_PTS} × ${r.def - r.defSeen} ＝ ＋${DEF_PTS * (r.def - r.defSeen)}点`;
    r.defSeen = r.def;
    saveRaid(r);
    if (!st.mine.alive && raidOpen()) submitGhost(r);
  }
  const mine = raidPoints(r);
  const tot = st ? st.f : { dragon: r.f === 'dragon' ? mine : 0, human: r.f === 'human' ? mine : 0 };
  const sum = tot.dragon + tot.human;
  const lead = tot.dragon === tot.human ? 'おなじ 点' : `${tot.dragon > tot.human ? '龍族（りゅうぞく）' : '人間（にんげん）'}が ${Math.abs(tot.dragon - tot.human)}点 多い（${Math.max(tot.dragon, tot.human)} − ${Math.min(tot.dragon, tot.human)} ＝ ${Math.abs(tot.dragon - tot.human)}）`;
  const bar = (k) => `<div class="rd-bar ${k}"><span>${ruby(FACTIONS[k].name)}</span><i style="width:${sum ? Math.round((tot[k] / sum) * 100) : 50}%"></i><b>${tot[k]}<small>点</small></b></div>`;
  const formula = `${r.w} × ${WIN_PTS} ＋ ${r.q}${r.fin ? ` ＋ ${r.fin} × ${FINISH_PTS}` : ''}${r.def ? ` ＋ ${r.def} × ${DEF_PTS}` : ''} ＝ ${mine}点`;
  const cpts = st?.c || { [r.c]: mine };
  const duels = Object.entries(RIVAL).map(([d, h]) => `<li><span class="${r.c === d ? 'me' : ''}"><i>${cname(d)}</i><b>${cpts[d] || 0}</b></span><em>vs</em><span class="${r.c === h ? 'me' : ''}"><i>${cname(h)}</i><b>${cpts[h] || 0}</b></span></li>`).join('');
  const over = !raidOpen();
  const winner = tot.dragon === tot.human ? null : tot.dragon > tot.human ? 'dragon' : 'human';
  app().innerHTML = `<main class="online raid">
    <p class="eyebrow">レイド${raidFree() ? '（WEBばんの 仮（かり）モード：いつでも あそべる・じぶんの 点だけ）' : ''}</p>
    <h2>${ruby(RAID.name)}</h2>
    ${over ? `<p class="ol-news">${winner ? `${ruby(FACTIONS[winner].name)}の かち！` : 'ひきわけ！'}</p><p class="say"><b>ニコル・ボーラス</b><span>${ruby(BOLAS[winner || 'human'])}</span></p>` : ''}
    ${news ? `<p class="ol-news">${ruby(news)}</p>` : ''}
    <div class="rd-bars">${bar('dragon')}${bar('human')}</div>
    <p class="ol-help">${ruby(sum ? lead : 'まだ だれも 点を とって いない')}</p>
    ${r.f ? `<div class="ol-me">
      <div><span class="ol-name">${ruby(FACTIONS[r.f].name)}・${cname(r.c)}</span><small>${r.w}かち ${r.l}まけ${r.d ? ` ${r.d}ひきわけ` : ''}・といた 問題 ${r.q}もん</small></div>
      <div class="ol-score"><b>${mine}<small>点</small></b><span>${ruby(formula)}</span></div>
    </div>` : ''}
    ${over ? '' : `<p class="ol-help">${ruby(`かつと ＋${WIN_PTS}点、統率者（とうそつしゃ）で とどめを さすと さらに ＋${FINISH_PTS}点。しゅぎょうで せいかいした 問題も 1もん ＋1点。きみの デッキ（ゴースト）が ほかの 陣営の 人に かつと、ぼうえい点 ＋${DEF_PTS}点。`)}</p>`}
    ${RAID.ends && !over ? `<p class="ol-help">${ruby(`${raidFree() ? 'ほんばん（GASばん）は ' : ''}${new Date(RAID.ends).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric' })} まで`)}</p>` : ''}
    <div class="row-btns"><button type="button" class="btn" data-r="back">もどる</button><button type="button" class="btn primary" data-r="fight" ${over ? 'disabled' : ''}>たたかう</button></div>
    <h3 class="ol-h">5つの 対決（たいけつ）</h3>
    <ul class="rd-duels">${duels}</ul>
  </main>`;
  app().onclick = (e) => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    if (b.dataset.r === 'back') return back();
    if (b.dataset.r === 'fight') return fight(app, back, r);
  };
}

// 陣営と 統率者を えらぶ（期間中は かえられない）
async function join(app, back) {
  const f = await sheet(`<p>${ruby('龍族（りゅうぞく）か 人間（にんげん）の 陣営（じんえい）に ついて たたかう。陣営を えらぶ ときに、統率者（とうそつしゃ）を 1人 えらぶ。みんなの 点を あわせて、多い 陣営の かち。')}</p><p class="what">${ruby('陣営と 統率者は、レイドが おわるまで かえられない。')}</p>`,
    [...Object.entries(FACTIONS).map(([k, v]) => ({ label: ruby(v.name), value: k, kind: 'primary', note: k === 'dragon' ? '龍王（2色）' : '氏族の 長（3色）' })), { label: 'もどる', value: null }],
    { title: ruby(RAID.name) });
  if (!f) return back();
  const id = await sheet(`<p>${ruby('デッキは 統率者の 色だけで 自動で 組む。')}</p>`,
    [...FACTIONS[f].ids.map((x) => ({ label: `${cname(x)}（${colorText(BY_ID[x])}・${BY_ID[x].cost}マナ）`, value: x, kind: 'primary', note: `たいけつ：${plain(info(BY_ID[rivalOf(x)]).name)}` })), { label: 'もどる', value: null }],
    { title: `${ruby(FACTIONS[f].name)}の 統率者` });
  if (!id) return join(app, back);
  const ok = await sheet(`${detail(BY_ID[id])}<p class="what">${ruby(`${FACTIONS[f].name}・${info(BY_ID[id]).name} で さんかする？ レイドが おわるまで かえられない。`)}</p>`,
    [{ label: 'さんかする', value: 1, kind: 'primary' }, { label: 'えらびなおす', value: 0 }], { title: 'これで いい？' });
  if (!ok) return join(app, back);
  const r = { ...loadRaid(), f, c: id };
  saveRaid(r);
  await submitGhost(r);
  return raidMenu(app, back);
}

// じぶんの デッキを ゴーストに（ほかの 陣営の 人の あいてに なる。かつと ぼうえい点）
async function submitGhost(r) {
  if (!hasServer()) return;
  try {
    const x = await call('mtgRaidSubmit', { id: RAID.id, f: r.f, c: r.c, i: r.g || '', d: cmdDeck(BY_ID[r.c]).map((d) => d.id), n: myName() });
    if (x?.i) { r.g = x.i; saveRaid(r); }
  } catch { /* つながらなくても あそべる */ }
}

async function fight(app, back, r) {
  const me = BY_ID[r.c];
  // あいて：ちがう 陣営の 人の ゴースト。いなければ CPU（5つの 対決の あいて）
  let g = null;
  if (hasServer()) { try { g = await call('mtgRaidGhost', { id: RAID.id, f: r.f }); } catch { g = null; } }
  const foeId = g && BY_ID[g.c] ? g.c : rivalOf(r.c);
  const foe = BY_ID[foeId];
  const deck = g ? g.d.map((x) => BY_ID[x]).filter(Boolean) : cmdDeck(foe);
  const name = g ? `${nameOf(g.n)}（${plain(info(foe).name)}）` : `${plain(info(foe).name)}（CPU）`;
  const go = await sheet(`<p class="ol-found">${esc(name)}</p><p>${ruby(FACTIONS[other(r.f)].name)}・${colorText(foe)}</p>`,
    [{ label: 'たたかう', value: 1, kind: 'primary' }, { label: 'やめる', value: 0 }], { title: g ? 'あいてが みつかった！' : 'CPU と たたかう' });
  if (!go) return raidMenu(app, back);
  startBattle({
    deck: cmdDeck(me), cmd: me, life: FACTIONS[r.f].life,
    floor: pvp({ deck, cmd: foe, life: FACTIONS[other(r.f)].life, name, first: Math.random() < 0.5 ? 'P' : 'E' }), floorName: `レイド：${name}`, diff: 'normal',
    quit: { label: 'こうさんして もどる', note: 'とちゅうで やめると まけ に なるよ（点は へらない）。', go: () => end({ win: false }) },
    onEnd: (x) => end(x),
  });
  async function end(x) {
    const v = loadRaid();
    const res = x.draw ? 'd' : x.win ? 'w' : 'l';
    v[res]++;
    let add = 0, note = 'まけた ときは 点は へらない。';
    if (res === 'w') {
      add = WIN_PTS + (x.cmdFinish ? FINISH_PTS : 0);
      if (x.cmdFinish) v.fin++;
      note = `かった ＋${WIN_PTS}${x.cmdFinish ? `、統率者（とうそつしゃ）で とどめ ＋${FINISH_PTS}` : ''} ＝ ＋${add}点`;
    }
    // まけたら あいての ゴーストの ぼうえい点（あいての 陣営に ＋3）
    if (res === 'l' && g?.i) { call('mtgRaidDefend', { id: RAID.id, g: g.i }).catch(() => {}); note = `${note}あいての ゴーストが まもったので、あいての 陣営に ＋${DEF_PTS}点。`; }
    saveRaid(v);
    if (add) sendRaid(v, { w: 1, fin: x.cmdFinish ? 1 : 0 });
    await sheet(`<p class="big-result ${{ w: 'win', l: 'lose', d: 'draw' }[res]}">${{ w: 'かった！', l: 'まけた…', d: 'ひきわけ' }[res]}</p><p>${ruby(note)}</p>`, [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: ruby(RAID.name), dismiss: false });
    raidMenu(app, back);
  }
}
