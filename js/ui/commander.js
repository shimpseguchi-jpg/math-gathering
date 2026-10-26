// 統率者戦（とうそつしゃせん）の れんしゅう（docs/RAID.md 3.2）：陣営と 統率者を えらんで、ちがう 陣営の CPU と たたかう
// デッキは 統率者の 色だけで 自動で 組む（第1〜6弾の カードから 20まい）。統率者は 統率領域に いて、唱える たびに ＋2マナ
import { BY_ID, SETS, BASICS } from '../data/cards.js';
import { pvp } from '../data/enemies.js';
import { colorsOf } from '../engine/game.js';
import { cardValue, DECK_SIZE, CAPACITY } from '../engine/run.js';
import { ptsOf } from '../engine/ai.js';
import { CARD_TEXT } from '../data/texts.js';
import { startBattle } from './battle.js';
import { sheet, ruby, info, detail, fullCard, COLOR_NAME } from './view.js';

// ライフ：どちらも 30（長の なかまの カードを 足して、AI どうし 100戦で 龍族 47%：docs/SIMULATION.md）
export const FACTIONS = {
  dragon: { name: '龍族（りゅうぞく）', life: 30, ids: ['RG07', 'WG07', 'KR07', 'WU07', 'UK07'] },
  human: { name: '人間（にんげん）', life: 30, ids: ['AB02', 'JE02', 'SU02', 'MA02', 'TE02'] },
};
// 人間の 長は 統率者の とき（レイド・れんしゅう）だけ：コスト −1・統率者税は ＋1ずつ（1の だん）。ナーセットと シディシは 大きく
// （AI どうし 100戦で 龍族 71% → 54%：docs/SIMULATION.md。カードじしんは かえない ので パックの カードは そのまま）
export const HUMAN_CMD = { less: 1, step: 1 };
export const CMD_BUFF = { JE02: [4, 4], SU02: [4, 5] };
export const cmdSetup = (def) => ({
  cmd: CMD_BUFF[def.id] ? { ...def, pow: CMD_BUFF[def.id][0], tou: CMD_BUFF[def.id][1] } : def,
  cmdOpt: FACTIONS.human.ids.includes(def.id) ? HUMAN_CMD : {},
});
// 龍王と 氏族の 長の 5つの 対決（RAID.md 3.2）
export const RIVAL = { WG07: 'AB02', WU07: 'JE02', UK07: 'SU02', KR07: 'MA02', RG07: 'TE02' };
const colorText = (d) => colorsOf(d).map((c) => COLOR_NAME[c]).join('・');

// 統率者 ごとの カードプール（2026-10-26）：統率者の 色の カードの うち、その 統率者の とくいな ことに あう もの
// ＋ 三つの 旗の その 色の カード（龍王の 一族・氏族の 戦士・長の なかま）。POOL_SIZE まで（レアリティの 高い じゅん）
const txt = (d) => (CARD_TEXT[d.id]?.text || '').replace(/（[ぁ-ゖー]+）/g, '');
const kw = (d, k) => (d.kw || []).includes(k);
const sub = (d, k) => (d.sub || []).includes(k);
const isSp = (d) => (d.types || []).some((t) => t === 'instant' || t === 'sorcery');
const big = (d) => (d.types || []).includes('creature') && (d.pow || 0) >= 4;
export const THEMES = {
  AB02: { name: '＋1/＋1カウンター', f: (d) => /＋1\/＋1カウンター|増強|鼓舞/.test(txt(d)) },
  JE02: { name: 'クリーチャーでない 呪文（じゅもん）', f: (d) => isSp(d) || kw(d, 'prowess') },
  SU02: { name: '墓地（ぼち）', f: (d) => d.delve || /墓地/.test(txt(d)) },
  MA02: { name: '戦士（せんし）と 速攻（そっこう）', f: (d) => sub(d, 'warrior') || kw(d, 'haste') || /強襲|速攻/.test(txt(d)) },
  TE02: { name: '大きな クリーチャー', f: (d) => big(d) || kw(d, 'trample') || /獰猛/.test(txt(d)) },
  RG07: { name: 'ドラゴンと ダメージ', f: (d) => sub(d, 'dragon') || /割り振|ダメージを与/.test(txt(d)) },
  WG07: { name: '絆魂（はんこん）と かたい クリーチャー', f: (d) => kw(d, 'lifelink') || /ライフを得/.test(txt(d)) || ((d.types || []).includes('creature') && (d.tou || 0) >= 4) },
  KR07: { name: '速攻（そっこう）と はかい', f: (d) => kw(d, 'haste') || /破壊|墓地に置/.test(txt(d)) },
  WU07: { name: '飛行（ひこう）と カードを 引く', f: (d) => kw(d, 'flying') || /引く/.test(txt(d)) },
  UK07: { name: 'じゃまを する（はかい・てふだに もどす）', f: (d) => kw(d, 'deathtouch') || /破壊|手札に戻|−1\/−1|タップ/.test(txt(d)) },
};
// 3色の 長は 色が 多い ぶん プールも 大きく（40だと 2色ぶんの カードが たりず よわい）
export const POOL_SIZE = 40, POOL_SIZE3 = 60, THEME_MAX = 18;
// 土台は レイドの とき もう 出ている 弾（第1〜3弾・三つの 旗）。人間の 長には これから 出る 弾（第4弾いこう）の カードが 12まい（プールの 2わり。2026-10-26）
const BASE_SETS = [1, 2, 3, 6], FUTURE_SETS = [4, 5, 7, 8];
export const FUTURE_N = 12;
const inColors = (def) => { const ids = colorsOf(def); return (d) => colorsOf(d).every((c) => ids.includes(c)); };
const cardsOf = (ids, def) => { const ok = inColors(def); return SETS.filter((st) => ids.includes(st.id)).flatMap((st) => st.cards).filter((d) => ok(d) && !d.noPack && !d.banner && !d.basic && d.id !== def.id && !(d.sub || []).includes('lesson') && !Object.keys(THEMES).includes(d.id)); };
export const isHuman = (def) => FACTIONS.human.ids.includes(def.id);
// デッキが おもく なりがちな 長（AI どうしで よわかった）：プールは 4マナ いかを さきに（5マナ いじょうは 6まいまで）
const LIGHT = new Set(['JE02', 'SU02', 'TE02']);
// クリーチャーでない カードは とくいの わくの うち 6まいまで（呪文ばかりだと AI も 子どもも たたかいにくい）
const fewSpells = (list) => { let n = 0; return list.filter((d) => (d.types || []).includes('creature') || n++ < 6); };
const lighten = (def, list) => (LIGHT.has(def.id) ? [...list.filter((d) => d.cost <= 4), ...list.filter((d) => d.cost > 4).slice(0, 6)] : list);
export function cmdPool(def) {
  const all = cardsOf(BASE_SETS, def);
  // 点あたりの よさ（コモンほど 高い）で ならべる
  const eff = (a, b) => cardValue(b) / ptsOf(b) - cardValue(a) / ptsOf(a) || cardValue(b) - cardValue(a);
  // おなじ よさの カードは 色を じゅんばんに（カード表の じゅん だと 白・青ばかりに なる）
  const mix = (list) => { const by = colorsOf(def).map((c) => list.filter((d) => colorsOf(d)[0] === c)); const rest = list.filter((d) => !colorsOf(d).length || !colorsOf(def).includes(colorsOf(d)[0])); const out = []; for (let k = 0; by.some((g) => g[k]); k++) for (const g of by) if (g[k]) out.push(g[k]); return [...out, ...rest].sort(eff); };
  const theme = THEMES[def.id].f;
  // 三つの 旗の カード：龍王は 龍族の カード、長は 氏族の カード だけ
  const core = all.filter((d) => (isHuman(def) ? HUMAN_SIDE : DRAGON_SIDE).has(d.id));
  // 人間の 長：これから 出る 弾の カード 12まい（とくいに あう もの から。レアは 2まいまで）
  const fut = cardsOf(FUTURE_SETS, def);
  const futRares = fut.filter((d) => theme(d) && (d.rar === 'R' || d.rar === 'L')).sort((x, y) => cardValue(y) - cardValue(x)).slice(0, 2);
  const future = isHuman(def) ? [...futRares, ...lighten(def, [...mix(fut.filter((d) => !futRares.includes(d) && theme(d))), ...mix(fut.filter((d) => !theme(d) && (d.types || []).includes('creature')))])].slice(0, FUTURE_N) : [];
  // とくいに あう カードは THEME_MAX まで（レア・レジェンドは 4まいまで）。のこりは その 色の よい クリーチャー
  const th = all.filter((d) => !core.includes(d) && theme(d)).sort((a, b) => cardValue(b) - cardValue(a));
  const rares = th.filter((d) => d.rar === 'R' || d.rar === 'L').slice(0, 4);
  const pool = [...core, ...future, ...rares, ...fewSpells(lighten(def, mix(th.filter((d) => !rares.includes(d))))).slice(0, THEME_MAX - rares.length)];
  const crs = lighten(def, mix(all.filter((d) => !pool.includes(d) && (d.types || []).includes('creature'))));
  pool.push(...crs.slice(0, (colorsOf(def).length >= 3 ? POOL_SIZE3 : POOL_SIZE) - pool.length));
  return pool;
}
const DRAGON_SIDE = new Set(['RG08', 'WG08', 'KR08', 'WU08', 'UK08', 'R71', 'G72', 'W71', 'K69', 'R72']);
const HUMAN_SIDE = new Set([...SETS.find((st) => st.id === 6).cards.map((d) => d.id)].filter((id) => !DRAGON_SIDE.has(id)));

// 統率者の おまかせ デッキ（プールから。統率者じしんと 旗は 入れない）
// 2026-10-26：点（レアリティ）だけで えらぶと、呪文ばかり・おもい カードばかりの デッキに なる ので、きまりを 足した
//   クリーチャー MIN_CR まい いじょう・5マナ いじょうは HEAVY_MAX まで・2マナ いかは すこし ゆうせん。20まい・30点まで
export const MIN_CR = 12, HEAVY_MAX = 5;
const cache = new Map();
export function cmdDeck(def, pool = cmdPool(def)) {
  const key = `${def.id}:${pool.map((d) => d.id).join(',')}`;
  if (!cache.has(key)) cache.set(key, buildCmdDeck(def, pool));
  return cache.get(key);
}
function buildCmdDeck(def, pool) {
  const ids = colorsOf(def);
  const inside = (cs) => pool.filter((d) => colorsOf(d).every((c) => cs.includes(c)));
  // 3色の 統率者は、2色を 中心に 3色めを 4まいまで（3色を そろえて 入れると よわい：docs/SIMULATION.md）か、3色 ぜんぶ
  const tries = ids.length >= 3
    ? [...[[0, 1], [0, 2], [1, 2]].map(([a, b]) => { const two = [ids[a], ids[b]]; const t = ids.find((c) => !two.includes(c)); return [...inside(two), ...inside(ids).filter((d) => colorsOf(d).includes(t)).sort((x, y) => cardValue(y) - cardValue(x)).slice(0, 4)]; }), inside(ids)]
    : [inside(ids)];
  let best = null;
  for (const items of tries) { const r = pickDeck(items); if (r && (!best || r.v > best.v)) best = r; }
  const deck = [...(best?.pick || [])];
  const cnt = Object.fromEntries(ids.map((c) => [c, deck.filter((d) => colorsOf(d).includes(c)).length]));
  const order = [...ids].sort((a, b) => cnt[b] - cnt[a]);
  for (let n = 0; deck.length < DECK_SIZE; n++) deck.push(BASICS[order[n % order.length]]);
  return deck;
}
// dp[まい数][点][クリーチャー（MIN_CR で とめる）][おもい カード] ＝ いちばん よい 組み合わせ
function pickDeck(items) {
  const score = (d) => cardValue(d) + (d.cost <= 2 ? 0.4 : 0) - (d.cost >= 6 ? 1 : 0);
  const key = (n, p, c, h) => ((n * (CAPACITY + 1) + p) * (MIN_CR + 1) + c) * (HEAVY_MAX + 1) + h;
  let dp = new Map([[key(0, 0, 0, 0), { v: 0, pick: [], n: 0, p: 0, c: 0, h: 0 }]]);
  for (const d of items) {
    const w = ptsOf(d), cr = (d.types || []).includes('creature') ? 1 : 0, hv = d.cost >= 5 ? 1 : 0, sv = score(d);
    const next = new Map(dp);
    for (const st of dp.values()) {
      const n = st.n + 1, p = st.p + w, h = st.h + hv;
      if (n > DECK_SIZE || p > CAPACITY || h > HEAVY_MAX) continue;
      const c = Math.min(MIN_CR, st.c + cr), k = key(n, p, c, h), cur = next.get(k);
      if (!cur || cur.v < st.v + sv) next.set(k, { v: st.v + sv, pick: [...st.pick, d], n, p, c, h });
    }
    dp = next;
  }
  // クリーチャーが MIN_CR まい いじょうの なかで いちばん よい もの（たりない ときは クリーチャーが 多い もの）
  const all = [...dp.values()];
  const ok = all.filter((x) => x.c >= MIN_CR);
  return (ok.length ? ok : all).sort((a, b) => (ok.length ? 0 : b.c - a.c) || b.v - a.v)[0];
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
  const id = await pickCommander(FACTIONS[f].ids, { title: `${ruby(FACTIONS[f].name)}の 統率者`, note: (d) => ruby(`とくい：${THEMES[d.id].name}`) });
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
    deck: cmdDeck(me), ...cmdSetup(me), life: FACTIONS[f].life,
    floor: pvp({ deck: cmdDeck(foe), ...cmdSetup(foe), life: FACTIONS[other].life, name, first: Math.random() < 0.5 ? 'P' : 'E' }), floorName: name, diff: 'normal',
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
