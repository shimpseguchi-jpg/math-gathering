// オンラインバトル（非同期）：冒険を おえた デッキを「ゴースト」として あずけ、ほかの 人の ゴーストと たたかう
// GAS 版では google.script.run で サーバー（gas/Code.gs）に あずける。サーバーが ない とき（GitHub Pages など）は
// 見本デッキの「れんしゅう あいて」と たたかえる（トロフィーは この たんまつの きろく）
// じぶんが つかう デッキは、冒険で くんだ デッキを 3つまで 保管した ものだけ
import { BY_ID } from '../data/cards.js';
import { SAMPLE, sampleIds } from '../data/samples.js';
import { pvp } from '../data/enemies.js';
import { colorsOf } from '../engine/game.js';
import { startBattle } from './battle.js';
import { sheet, esc, ruby, COLOR_NAME } from './view.js';

const KEY = 'mtg-online-v1';
// ニックネームは 自由入力に しない。定型語を 2つ えらんで くみあわせる（サーバーも この ならびの 番号で うけとる）
// 1つめの ことばで 形が きまる：「〇〇な〇〇」（ゆうかんな ドラゴン）か「〇〇 〇〇」（ほのお ドラゴン）
export const NAME_A = [
  'ゆうかんな', 'げんきな', 'ふしぎな', 'しずかな', 'にぎやかな', 'ゆかいな', 'すてきな', 'まっすぐな', 'きまぐれな', 'おだやかな',
  'ほのお', 'こおり', 'かみなり', 'かぜ', 'ほし', 'つき', 'たいよう', 'うみ', 'もり', 'にじ',
];
export const NAME_B = [
  'ドラゴン', 'ペガサス', 'ハイドラ', 'スフィンクス', 'グリフィン', 'ゴブリン', 'エルフ', 'サテュロス', 'ミノタウルス', 'フェニックス',
  'ケンタウロス', 'ユニコーン', 'クラーケン', 'ゴーレム', 'ワーム', 'レオニン', 'トリトン', 'ニンフ', 'ナイト', 'まほうつかい',
];
const KEEP_DECKS = 3;
export const TIER_LABEL = ['', '1階まで', '2階まで', '3階まで', '4階まで', '5階まで', '塔を クリア'];
const RANKS = [[50, 'ニクス'], [25, 'ゴールド'], [10, 'シルバー'], [0, 'ブロンズ']];
const rankOf = (t) => RANKS.find(([n]) => t >= n)[1];

const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* 保存できなくても あそべる */ } };
function state() {
  const o = load() || {};
  if (!Array.isArray(o.name)) o.name = [Math.floor(Math.random() * NAME_A.length), Math.floor(Math.random() * NAME_B.length)];
  o.trophies ??= 0; o.wins ??= 0; o.losses ??= 0; o.decks ??= []; o.seen ??= {};
  o.decks = o.decks.slice(0, KEEP_DECKS);
  return o;
}
const nameOf = (n) => `${NAME_A[n[0]] || ''} ${NAME_B[n[1]] || ''}`.trim(); // 「ゆうかんな ドラゴン」「ほのお ドラゴン」
// 2色は アーキタイプの よびかた（赤白・青白…）に そろえる
const PAIR = { GW: '白緑', UW: '青白', RW: '赤白', RU: '赤青', GR: '緑赤', GU: '青緑' };
const pairName = (p) => { const k = [...(p || '')].sort().join(''); return PAIR[k] || [...k].map((c) => COLOR_NAME[c]).join('') || '無色'; };

// ---- サーバー ----
export const hasServer = () => !!(window.google && window.google.script && window.google.script.run);
function call(fn, arg) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('つながらなかった')), 20000);
    window.google.script.run
      .withSuccessHandler((r) => { clearTimeout(t); resolve(r); })
      .withFailureHandler((e) => { clearTimeout(t); reject(e); })[fn](arg);
  });
}

const deckTitle = (x) => `${pairName(x.p)}・${TIER_LABEL[x.t]}`;

// 冒険が おわったら よぶ：デッキを 保管する（3つまで。いっぱいなら どれと 入れかえるか きく）。
// サーバーが あれば ゴーストとして あずける（保管しなくても、ほかの 人の あいてには なる）
export async function saveGhost(deckDefs, tier) {
  const o = state();
  const d = deckDefs.map((x) => x.id);
  const pair = [...new Set(deckDefs.flatMap(colorsOf))].sort((a, b) => 'WUGR'.indexOf(a) - 'WUGR'.indexOf(b)).join('');
  const rec = { d, p: pair, t: tier, date: new Date().toISOString().slice(0, 10) };
  const upload = hasServer() ? call('mtgSubmitGhost', { d, t: tier, n: o.name }).then((r) => r.i, () => null) : Promise.resolve(null);
  let keep = true, drop = -1;
  if (o.decks.length >= KEEP_DECKS) {
    const v = await sheet(`<p>${esc(deckTitle(rec))} の デッキを 保管する？ 保管できるのは ${KEEP_DECKS}つまで。どれと 入れかえる？</p>`, [
      ...o.decks.map((x, i) => ({ label: `${esc(deckTitle(x))} と 入れかえる<small>${esc(x.date)}</small>`, value: i + 1, kind: 'primary' })),
      { label: '保管しない', value: 0 },
    ], { title: 'デッキの 保管', dismiss: false });
    if (v) drop = v - 1; else keep = false;
  }
  rec.id = await upload || undefined;
  const cur = state(); // 待っている あいだに なまえ などが かわっても いいように 読みなおす
  if (keep) cur.decks = [rec, ...cur.decks.filter((x, i) => i !== drop)].slice(0, KEEP_DECKS);
  save(cur);
  return keep ? rec : null;
}

// ---- 画面 ----
export async function onlineMenu(app, back) {
  const o = state();
  let pick = 0;
  let news = '';
  // 自分の ゴーストの きろく（あたらしく 勝った 数）
  const ids = o.decks.map((x) => x.id).filter(Boolean);
  if (hasServer() && ids.length) {
    try {
      const rs = await call('mtgMyGhosts', ids);
      let gain = 0;
      for (const r of rs || []) {
        const x = o.decks.find((k) => k.id === r.i); if (!x) continue;
        gain += Math.max(0, r.w - (o.seen[r.i] || 0)); o.seen[r.i] = r.w; x.w = r.w; x.l = r.l;
      }
      if (gain) news = `きみの ゴーストが ${gain}回 かったよ！`;
      save(o);
    } catch { /* きろくは あとで */ }
  }
  const draw = () => {
    const deckBtns = o.decks.map((x, i) => [i, deckTitle(x), `${x.date}${x.id ? `　ゴースト ${x.w || 0}勝 ${x.l || 0}敗` : hasServer() ? '　（あずけて いない）' : ''}`]);
    app().innerHTML = `<main class="online">
      <p class="eyebrow">${hasServer() ? 'オンライン' : 'れんしゅう（オンラインは GAS版で）'}</p>
      <h2>オンライン バトル</h2>
      <div class="ol-me">
        <div class="ol-namebox"><span class="ol-name">${esc(nameOf(o.name))}</span>
          <div class="ol-selects">${[NAME_A, NAME_B].map((ws, k) => `<select data-n="${k}" aria-label="なまえの ${k + 1}つめの ことば">${ws.map((w, i) => `<option value="${i}" ${o.name[k] === i ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select>`).join('')}</div></div>
        <div class="ol-trophy"><b>${o.trophies}</b><span>トロフィー・${rankOf(o.trophies)}</span><small>${o.wins}勝 ${o.losses}敗</small></div>
      </div>
      ${news ? `<p class="ol-news">${esc(news)}</p>` : ''}
      <p class="ol-help">${ruby('冒険（ぼうけん）で くんだ デッキで、ほかの 人の デッキ（ゴースト）と たたかう。どちらも ライフ 20。あいてに 攻撃して ライフを 0に すれば かち。')}</p>
      <h3 class="ol-h">つかう デッキ（保管 ${o.decks.length}/${KEEP_DECKS}）</h3>
      ${deckBtns.length ? `<div class="ol-decks">${deckBtns.map(([k, a, b]) => `<button type="button" class="ol-deck ${k === pick ? 'on' : ''}" data-deck="${k}" aria-pressed="${k === pick}"><b>${esc(a)}</b><small>${esc(b)}</small></button>`).join('')}</div>`
        : `<p class="ol-empty">${ruby('まだ デッキが ない。冒険（ぼうけん）を おえると、その デッキを 3つまで 保管（ほかん）できる。')}</p>`}
      <div class="row-btns"><button type="button" class="btn" data-o="back">もどる</button><button type="button" class="btn primary" data-o="find" ${deckBtns.length ? '' : 'disabled'}>あいてを さがす</button></div>
    </main>`;
  };
  draw();
  // なまえ：プルダウン 2つから えらぶ（えらんだら すぐ 保存）
  app().onchange = (e) => {
    const sel = e.target.closest('select[data-n]'); if (!sel) return;
    o.name[+sel.dataset.n] = +sel.value;
    save(o);
    app().querySelector('.ol-name').textContent = nameOf(o.name);
  };
  app().onclick = async (e) => {
    const d = e.target.closest('[data-deck]');
    if (d) { pick = +d.dataset.deck; return draw(); }
    const b = e.target.closest('[data-o]'); if (!b) return;
    if (b.dataset.o === 'back') return back();
    if (b.dataset.o === 'find' && o.decks[pick]) return findOpponent(app, back, o, o.decks[pick]);
  };
}

async function findOpponent(app, back, o, mine) {
  let list = [];
  if (hasServer()) {
    try { list = (await call('mtgFindGhosts', { t: mine.t, x: o.decks.map((x) => x.id).filter(Boolean) })) || []; } catch { list = []; }
  }
  const opps = list.map((g) => ({ id: g.i, name: nameOf(g.n), d: g.d, p: pairOf(g.d), t: g.t, rec: `${g.w}勝 ${g.l}敗` }));
  // サーバーに だれも いない とき・つながらない ときは 見本デッキ
  if (opps.length < 3) for (const k of Object.keys(SAMPLE).sort(() => Math.random() - 0.5).slice(0, 3 - opps.length)) opps.push({ name: `れんしゅう あいて（${pairName(k)}）`, d: sampleIds(k), p: k, t: 3, rec: 'CPU' });
  const v = await sheet('<p>たたかう あいてを えらぶ。</p>', [
    ...opps.map((g) => ({ label: `${esc(g.name)}<small>${esc(pairName(g.p))}・${esc(TIER_LABEL[g.t] || '')}・${esc(g.rec)}</small>`, value: g, kind: 'primary' })),
    { label: 'やめる', value: null },
  ], { title: 'あいて' });
  if (!v) return onlineMenu(app, back);
  const first = Math.random() < 0.5 ? 'P' : 'E';
  startBattle({
    deck: mine.d.map((id) => BY_ID[id]), floor: pvp({ deck: v.d.map((id) => BY_ID[id]).filter(Boolean), name: v.name, first }), floorName: v.name, diff: 'normal',
    onEnd: async (r) => {
      const win = !!r.win;
      if (win) { o.trophies += 3; o.wins++; } else { o.trophies = Math.max(0, o.trophies - 1); o.losses++; }
      save(o);
      if (v.id && hasServer()) call('mtgReport', { i: v.id, w: !win }).catch(() => {});
      await sheet(`<p class="big-result ${win ? 'win' : 'lose'}">${win ? 'かった！ トロフィー ＋3' : 'まけた… トロフィー −1'}</p><p>トロフィー ${o.trophies}（${rankOf(o.trophies)}）</p>`, [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: 'オンライン バトル', dismiss: false });
      onlineMenu(app, back);
    },
  });
}
const pairOf = (ids) => [...new Set(ids.flatMap((id) => (BY_ID[id] ? colorsOf(BY_ID[id]) : [])))].join('');
