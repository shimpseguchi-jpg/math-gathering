// オンラインバトル（非同期）：冒険を おえた デッキを「ゴースト」として あずけ、ほかの 人の ゴーストと たたかう
// GAS 版では google.script.run で サーバー（gas/Code.gs）に あずける。サーバーが ない とき（GitHub Pages など）は
// 見本デッキの「れんしゅう あいて」と たたかえる（れんしゅうでは 点は つかない）
// デッキの 点：かち ＋2・ひきわけ ＋1・まけ −1（0より 下には ならない）。上位20は ランキングに のる
// じぶんが つかう デッキは、冒険で くんだ デッキを 3つまで 保管した ものだけ
import { BY_ID } from '../data/cards.js';
import { SAMPLE, sampleIds } from '../data/samples.js';
import { pvp } from '../data/enemies.js';
import { colorsOf } from '../engine/game.js';
import { startBattle } from './battle.js';
import { sheet, esc, ruby, COLOR_NAME } from './view.js';
import { onBattle, onOnline } from './trophies.js';
import { commanderMenu } from './commander.js';

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
const RANK_SIZE = 20;
export const TIER_LABEL = ['', '1階まで', '2階まで', '3階まで', '4階まで', '5階まで', 'とうを クリア'];
export const POINTS = { w: 2, d: 1, l: -1 };
const RESULT = { w: 'かち', d: 'ひきわけ', l: 'まけ' };
const addPoints = (s, r) => Math.max(0, (s || 0) + POINTS[r]);

const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* 保存できなくても あそべる */ } };
function state() {
  const o = load() || {};
  if (!Array.isArray(o.name)) o.name = [Math.floor(Math.random() * NAME_A.length), Math.floor(Math.random() * NAME_B.length)];
  o.wins ??= 0; o.losses ??= 0; o.draws ??= 0; o.decks ??= []; o.seen ??= {};
  o.decks = o.decks.slice(0, KEEP_DECKS);
  return o;
}
export const nameOf = (n) => `${NAME_A[n[0]] || ''} ${NAME_B[n[1]] || ''}`.trim(); // 「ゆうかんな ドラゴン」「ほのお ドラゴン」
// 2色は アーキタイプの よびかた（赤白・青白…）に そろえる
const PAIR = { GW: '白緑', UW: '青白', RW: '赤白', RU: '赤青', GR: '緑赤', GU: '青緑', KW: '白黒', KU: '青黒', KR: '黒赤', GK: '黒緑' };
const pairName = (p) => { const k = [...(p || '')].sort().join(''); return PAIR[k] || [...k].map((c) => COLOR_NAME[c]).join('') || 'むしょく'; };

// ---- サーバー ----
export const hasServer = () => !!(window.google && window.google.script && window.google.script.run);
export function call(fn, arg) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('つながらなかった')), 20000);
    window.google.script.run
      .withSuccessHandler((r) => { clearTimeout(t); resolve(r); })
      .withFailureHandler((e) => { clearTimeout(t); reject(e); })[fn](arg);
  });
}

const deckTitle = (x) => `${pairName(x.p)}・${TIER_LABEL[x.t]}`;
const deckName = (n, p) => `${nameOf(n)}の ${pairName(p)}デッキ`; // ランキングに 出る なまえ
const when = (ms) => new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// 冒険が おわったら よぶ：デッキを 保管する（3つまで。いっぱいなら どれと 入れかえるか きく）。
// サーバーが あれば ゴーストとして あずける（保管しなくても、ほかの 人の あいてには なる）
export async function saveGhost(deckDefs, tier) {
  const o = state();
  const d = deckDefs.map((x) => x.id);
  const pair = [...new Set(deckDefs.flatMap(colorsOf))].sort((a, b) => 'WUKRG'.indexOf(a) - 'WUKRG'.indexOf(b)).join('');
  const rec = { d, p: pair, t: tier, s: 0, date: new Date().toISOString().slice(0, 10) };
  const upload = hasServer() ? call('mtgSubmitGhost', { d, t: tier, n: o.name }).then((r) => r.i, () => null) : Promise.resolve(null);
  let keep = true, drop = -1;
  if (o.decks.length >= KEEP_DECKS) {
    const v = await sheet(`<p>${esc(deckTitle(rec))} の デッキを ほかんする？ ほかんできるのは ${KEEP_DECKS}つまで。どれと 入れかえる？</p>`, [
      ...o.decks.map((x, i) => ({ label: `${esc(deckTitle(x))} と 入れかえる<small>${esc(x.date)}</small>`, value: i + 1, kind: 'primary' })),
      { label: 'ほかんしない', value: 0 },
    ], { title: 'デッキの ほかん', dismiss: false });
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
  // 自分の ゴーストの きろく（あたらしく 勝った 数）・デッキの 点と、ランキング
  const ids = o.decks.map((x) => x.id).filter(Boolean);
  const [rs, rank] = hasServer()
    ? await Promise.all([ids.length ? call('mtgMyGhosts', ids).catch(() => null) : null, call('mtgRanking').catch(() => null)])
    : [null, null];
  if (rs) {
    let gain = 0;
    for (const r of rs) {
      const x = o.decks.find((k) => k.id === r.i); if (!x) continue;
      if (r.w != null) { gain += Math.max(0, r.w - (o.seen[r.i] || 0)); o.seen[r.i] = r.w; x.w = r.w; x.l = r.l; }
      if (r.s != null) x.s = r.s;
    }
    if (gain) news = `きみの ゴーストが ${gain}回 かったよ！`;
    save(o);
  }
  const mine = new Set(ids);
  const ranking = () => {
    if (!hasServer()) return `<p class="ol-empty">${ruby('ランキングは GASばんで みられる。')}</p>`;
    if (!rank) return `<p class="ol-empty">${ruby('ランキングを よみこめなかった。')}</p>`;
    const head = `<p class="ol-help">${esc(`${when(rank.at)} こうしん（つぎは ${when(rank.next)}）`)}</p>`;
    if (!rank.l.length) return `${head}<p class="ol-empty">${ruby('まだ だれも のって いない。たたかって 点を とろう！')}</p>`;
    let place = 0;
    return `${head}<ol class="ol-rank">${rank.l.map(([sc, a, b, p, id], i) => {
      if (i === 0 || rank.l[i - 1][0] !== sc) place = i + 1; // 同じ 点は 同じ じゅんい
      return `<li class="${mine.has(id) ? 'me' : ''}"><span class="ol-place">${place}</span><span class="ol-dname">${esc(deckName([a, b], p))}${mine.has(id) ? '<small>きみの デッキ</small>' : ''}</span><b>${sc}<small>点</small></b></li>`;
    }).join('')}</ol>`;
  };
  const draw = () => {
    const deckBtns = o.decks.map((x, i) => [i, `${deckTitle(x)}　${x.s || 0}点`, `${x.date}${x.id ? `　ゴースト ${x.w || 0}かち ${x.l || 0}まけ` : hasServer() ? '　（あずけて いない）' : ''}`]);
    const cur = o.decks[pick];
    app().innerHTML = `<main class="online">
      <p class="eyebrow">${hasServer() ? 'オンライン' : 'れんしゅう（オンラインは GASばんで）'}</p>
      <h2>オンライン バトル</h2>
      <div class="ol-me">
        <div class="ol-namebox"><span class="ol-name">${esc(nameOf(o.name))}</span>
          <div class="ol-selects">${[NAME_A, NAME_B].map((ws, k) => `<select data-n="${k}" aria-label="なまえの ${k + 1}つめの ことば">${ws.map((w, i) => `<option value="${i}" ${o.name[k] === i ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select>`).join('')}</div></div>
        <div class="ol-score"><b>${cur ? cur.s || 0 : '-'}<small>点</small></b><span>えらんだ デッキの 点</span><small>${o.wins}かち ${o.losses}まけ ${o.draws}ひきわけ</small></div>
      </div>
      ${news ? `<p class="ol-news">${esc(news)}</p>` : ''}
      <p class="ol-help">${ruby('ぼうけんで くんだ デッキで、ほかの 人の デッキ（ゴースト）と たたかう。どちらも ライフ 20。あいてに こうげきして ライフを 0に すれば かち。デッキに 点が つく：かち ＋2、ひきわけ ＋1、まけ −1（0より 下には ならない）。')}</p>
      <h3 class="ol-h">つかう デッキ（ほかん ${o.decks.length}/${KEEP_DECKS}）</h3>
      ${deckBtns.length ? `<div class="ol-decks">${deckBtns.map(([k, a, b]) => `<button type="button" class="ol-deck ${k === pick ? 'on' : ''}" data-deck="${k}" aria-pressed="${k === pick}"><b>${esc(a)}</b><small>${esc(b)}</small></button>`).join('')}</div>`
        : `<p class="ol-empty">${ruby('まだ デッキが ない。ぼうけんを おえると、その デッキを 3つまで ほかんできる。')}</p>`}
      <div class="row-btns"><button type="button" class="btn" data-o="back">もどる</button><button type="button" class="btn primary" data-o="find" ${deckBtns.length ? '' : 'disabled'}>あいてを さがす</button></div>
      <div class="row-btns"><button type="button" class="btn" data-o="cmdr">${ruby('統率者戦（とうそつしゃせん） れんしゅう')}</button></div>
      <h3 class="ol-h">ランキング（デッキの 点・ベスト${RANK_SIZE}）</h3>
      ${ranking()}
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
    if (b.dataset.o === 'cmdr') return commanderMenu(() => onlineMenu(app, back));
    if (b.dataset.o === 'find' && o.decks[pick]) return findOpponent(app, back, o, o.decks[pick]);
  };
}

async function findOpponent(app, back, o, mine) {
  // あいては ランダム：サーバーに あずけられた ゴーストから 1人。いなければ（つながらない ときも）見本デッキの れんしゅう あいて
  let g = null;
  if (hasServer()) { try { g = await call('mtgRandomGhost', { x: o.decks.map((x) => x.id).filter(Boolean) }); } catch { g = null; } }
  let v;
  if (g) v = { id: g.i, name: nameOf(g.n), d: g.d, p: pairOf(g.d), t: g.t, rec: `${g.w}かち ${g.l}まけ` };
  else { const k = Object.keys(SAMPLE)[Math.floor(Math.random() * Object.keys(SAMPLE).length)]; v = { name: `れんしゅう あいて（${pairName(k)}）`, d: sampleIds(k), p: k, t: 3, rec: 'CPU' }; }
  const go = await sheet(`<p class="ol-found">${esc(v.name)}</p><p>${esc(pairName(v.p))}・${esc(v.id ? TIER_LABEL[v.t] : 'れんしゅう用の デッキ')}・${esc(v.rec)}</p>${v.id ? '' : `<p class="ol-help">${esc(hasServer() ? 'まだ ほかの 人の ゴーストが いないので、れんしゅう あいてが 出てきた。' : 'GASばんでは ほかの 人の ゴーストと たたかえる。')}</p>`}`,
    [{ label: 'たたかう', value: 1, kind: 'primary' }, { label: 'やめる', value: 0 }], { title: v.id ? 'あいてが みつかった！' : 'れんしゅう あいて' });
  if (!go) return onlineMenu(app, back);
  const first = Math.random() < 0.5 ? 'P' : 'E';
  startBattle({
    deck: mine.d.map((id) => BY_ID[id]), floor: pvp({ deck: v.d.map((id) => BY_ID[id]).filter(Boolean), name: v.name, first }), floorName: v.name, diff: 'normal',
    quit: { label: 'こうさんして もどる', note: `とちゅうで やめると「こうさん」に なって、まけ${v.id ? '（デッキの 点 −1）' : ''}に なるよ。`, go: () => end({ win: false }) },
    onEnd: (r) => end(r),
  });
  async function end(r) {
    const res = r.draw ? 'd' : r.win ? 'w' : 'l';
    onOnline(r); if (r.turns != null) onBattle(r, { online: true }); // トロフィー（こうさんの ときは たたかいの きろくは なし）
    if (res === 'w') o.wins++; else if (res === 'l') o.losses++; else o.draws++;
    // 点が つくのは ほかの 人の ゴーストと たたかった とき（れんしゅう あいては 点なし）
    const deck = o.decks.find((x) => x === mine);
    let note = 'れんしゅう なので 点は つかない';
    if (v.id && deck) {
      const before = deck.s || 0;
      deck.s = addPoints(before, res);
      if (hasServer()) {
        try { const x = await call('mtgResult', { g: v.id, i: deck.id || '', r: res, n: o.name, p: deck.p }); if (x && x.s != null) deck.s = x.s; } catch { /* つながらなくても この たんまつの 点は のこる */ }
      }
      note = `デッキの 点 ${before} → <b>${deck.s}</b>（${POINTS[res] > 0 ? '＋' : '−'}${Math.abs(POINTS[res])}${res === 'l' && before === 0 ? '。0より 下には ならない' : ''}）`;
    } else if (v.id && hasServer()) call('mtgResult', { g: v.id, r: res }).catch(() => {});
    save(o);
    const cls = res === 'w' ? 'win' : res === 'l' ? 'lose' : 'draw';
    await sheet(`<p class="big-result ${cls}">${{ w: 'かった！', l: 'まけた…', d: 'ひきわけ' }[res]}</p><p>${note}</p>`, [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: `オンライン バトル：${RESULT[res]}`, dismiss: false });
    onlineMenu(app, back);
  }
}
const pairOf = (ids) => [...new Set(ids.flatMap((id) => (BY_ID[id] ? colorsOf(BY_ID[id]) : [])))].join('');
