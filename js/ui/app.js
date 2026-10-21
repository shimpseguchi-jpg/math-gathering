// 冒険の流れ：タイトル → パック開封 → デッキ構築 → 塔 → たたかい → …
import { openPack, buildDeck, DECK_SIZE, CAPACITY } from '../engine/run.js';
import { BY_ID, BASICS } from '../data/cards.js';
import { colorsOf } from '../engine/game.js';
import { RARITY_PTS } from '../engine/ai.js';
import { startBattle } from './battle.js';
import { cardFace, detail, sheet, esc, ruby, noRuby, info, COLOR_NAME } from './view.js';

const SAVE = 'mtg-adventure-v1';
const FLOOR_NAMES = {
  hydra: '1階 ハイドラとの対峙', horde: '2階 大群との戦い', factory: '3階 ゴーレムの工場', slime: '3階 ふえるスライム',
  xenagos: '4階 神を討て', erebos: '5階 死者の神 エレボス',
};
const DIFFS = [['easy', 'かんたん'], ['normal', 'ふつう'], ['hard', 'むずかしい']];
const COLOR_ORDER = ['W', 'U', 'G', 'R'];

let A = null; // いまの冒険
const app = () => document.getElementById('app');
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch { return null; } };
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(A)); } catch { /* 保存できない環境でも遊べる */ } };
const clearSave = () => { try { localStorage.removeItem(SAVE); } catch { /* なし */ } };
const defs = (ids) => ids.map((id) => BY_ID[id]);
const nm = (d) => noRuby(info(d).name);

// ---- タイトル ----
export function title() {
  const old = load();
  const pref = old || { diff: 'normal', grade: 3 };
  app().innerHTML = `<main class="title">
    <div class="title-mark" aria-hidden="true"><span>＋</span><span>−</span><span>×</span><span>÷</span></div>
    <h1>マスマティック・<br>ザ・ギャザリング</h1>
    <p class="title-sub">算数の デッキ構築 ローグライク。パックを あけて デッキを くみ、5階だての 塔を のぼろう。</p>
    <fieldset class="seg"><legend>むずかしさ</legend>${DIFFS.map(([k, l]) => `<label><input type="radio" name="diff" id="diff-${k}" value="${k}" ${pref.diff === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>
    <fieldset class="seg"><legend>学年（抜き打ちテストの もんだい）</legend>${[1, 2, 3, 4, 5].map((g) => `<label><input type="radio" name="grade" id="grade-${g}" value="${g}" ${+pref.grade === g ? 'checked' : ''}><span>${g}年</span></label>`).join('')}</fieldset>
    <div class="title-btns">
      ${old && !old.over ? `<button type="button" class="btn primary" data-go="cont">つづきから（${old.idx + 1}階）</button>` : ''}
      <button type="button" class="btn ${old && !old.over ? '' : 'primary'}" data-go="new">あたらしい 冒険</button>
    </div>
    <p class="fine">試作版。カードの対象（ねらう相手）は いまは 自動で えらばれます。</p>
  </main>`;
  app().onclick = (e) => {
    const b = e.target.closest('[data-go]'); if (!b) return;
    if (b.dataset.go === 'cont') { A = old; return resume(); }
    const diff = app().querySelector('input[name=diff]:checked').value;
    const grade = +app().querySelector('input[name=grade]:checked').value;
    A = { diff, grade, pool: [], deck: null, floors: ['hydra', 'horde', Math.random() < 0.5 ? 'factory' : 'slime', 'xenagos', 'erebos'], idx: 0, continues: 1, toOpen: 3, opened: 0, asked: 0, ok: 0 };
    save();
    packs();
  };
}

function resume() { if (A.toOpen > 0) packs(); else if (!A.deck) deckBuilder(); else tower(); }

// ---- パック開封 ----
function packs() {
  const cards = openPack(Math.random);
  const surprise = cards.surprise;
  const ids = cards.map((d) => d.id);
  const shown = new Set();
  const draw = () => {
    app().innerHTML = `<main class="packs">
      <p class="eyebrow">パック ${A.opened + 1}${A.idx === 0 ? ' / 3' : ''}</p>
      <h2>${shown.size < 8 ? 'カードを タップして めくろう' : 'このパックの カード'}</h2>
      <div class="pack-grid">${ids.map((id, i) => shown.has(i)
        ? `<button type="button" class="flip open ${surprise && i === 0 ? 'surprise' : ''} ${BY_ID[id].rar === 'L' ? 'legend' : ''}" data-i="${i}">${cardFace(BY_ID[id])}${surprise && i === 0 ? '<span class="wow">！？</span>' : ''}</button>`
        : `<button type="button" class="flip back" data-i="${i}" aria-label="${i + 1}まいめを めくる"><span>${i < 4 ? 'C' : i < 7 ? 'U' : 'R'}</span></button>`).join('')}</div>
      <div class="row-btns">${shown.size < 8 ? '<button type="button" class="btn" data-all="1">ぜんぶ めくる</button>' : '<button type="button" class="btn primary" data-next="1">つぎへ</button>'}</div>
    </main>`;
  };
  draw();
  app().onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.all) { for (let i = 0; i < 8; i++) shown.add(i); return draw(); }
    if (b.dataset.next) {
      A.pool.push(...ids); A.toOpen--; A.opened++; save();
      return A.toOpen > 0 ? packs() : deckBuilder();
    }
    const i = +b.dataset.i;
    if (!shown.has(i)) { shown.add(i); return draw(); }
    await sheet(detail(BY_ID[ids[i]]), [{ label: 'とじる', value: 0 }]);
  };
}

// ---- デッキ構築 ----
function autoDeck() {
  const b = buildDeck(defs(A.pool));
  const used = new Set(), sel = [];
  for (const d of b.deck) {
    if (d.basic) continue;
    const i = A.pool.findIndex((id, k) => id === d.id && !used.has(k));
    if (i >= 0) { used.add(i); sel.push(i); }
  }
  return sel;
}

function deckStats(sel) {
  const ds = sel.map((i) => BY_ID[A.pool[i]]);
  const colors = [...new Set(ds.flatMap(colorsOf))];
  return { ds, colors, points: ds.reduce((t, d) => t + RARITY_PTS[d.rar], 0), count: ds.length };
}

export function finalDeck() {
  const { ds, colors } = deckStats(A.deck);
  const deck = [...ds];
  const cnt = Object.fromEntries(colors.map((c) => [c, ds.filter((d) => colorsOf(d).includes(c)).length]));
  const order = colors.length ? [...colors].sort((a, b) => cnt[b] - cnt[a]) : ['C'];
  for (let k = 0; deck.length < DECK_SIZE; k++) deck.push(BASICS[order[k % order.length]]);
  return deck;
}

function whyNot(sel, i) {
  const st = deckStats(sel);
  const d = BY_ID[A.pool[i]];
  const nc = [...new Set([...st.colors, ...colorsOf(d)])];
  if (nc.length > 2) return `色は 2色まで（いまは ${st.colors.map((c) => COLOR_NAME[c]).join('・')}）`;
  if (st.points + RARITY_PTS[d.rar] > CAPACITY) return `キャパシティを こえる（のこり ${CAPACITY - st.points}点、このカードは ${RARITY_PTS[d.rar]}点）`;
  if (st.count >= DECK_SIZE) return `デッキは ${DECK_SIZE}まいまで`;
  return '';
}

function deckBuilder() {
  if (!A.deck) { A.deck = autoDeck(); save(); }
  const order = A.pool.map((id, i) => i).sort((a, b) => {
    const da = BY_ID[A.pool[a]], db = BY_ID[A.pool[b]];
    const ka = colorKey(da), kb = colorKey(db);
    return ka - kb || da.cost - db.cost || da.id.localeCompare(db.id);
  });
  const draw = () => {
    const st = deckStats(A.deck);
    const left = CAPACITY - st.points;
    app().innerHTML = `<main class="builder">
      <header class="b-head">
        <h2>デッキを くむ</h2>
        <div class="meters">
          <div class="meter"><span>キャパシティ</span><b>${st.points}<small>/${CAPACITY}点</small></b><i style="--v:${st.points / CAPACITY}"></i><em>のこり ${left}点</em></div>
          <div class="meter"><span>カード</span><b>${st.count}<small>まい</small></b><i style="--v:${st.count / DECK_SIZE}"></i><em>きほんカード ${DECK_SIZE - st.count}まい</em></div>
          <div class="meter"><span>色（2色まで）</span><b class="cols">${st.colors.map((c) => `<i class="pip m-${c}">${COLOR_NAME[c]}</i>`).join('') || '−'}</b></div>
        </div>
        <p class="hint">タップで 入れる・はずす。点数は コモン1・アンコモン2・レア3・レジェンド4。</p>
      </header>
      <div class="pool">${order.map((i) => {
        const inDeck = A.deck.includes(i);
        const no = !inDeck && whyNot(A.deck, i);
        return `<button type="button" class="pool-item ${inDeck ? 'in' : ''} ${no ? 'no' : ''}" data-i="${i}">${cardFace(BY_ID[A.pool[i]])}<span class="pts">${RARITY_PTS[BY_ID[A.pool[i]].rar]}点</span></button>`;
      }).join('')}</div>
      <footer class="actions"><button type="button" class="btn" data-a="auto">おまかせ</button><button type="button" class="btn" data-a="clear">ぜんぶ はずす</button><button type="button" class="btn primary" data-a="ok">けってい</button></footer>
    </main>`;
  };
  draw();
  app().onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'auto') { A.deck = autoDeck(); save(); return draw(); }
    if (b.dataset.a === 'clear') { A.deck = []; save(); return draw(); }
    if (b.dataset.a === 'ok') {
      if (!A.deck.length) return sheet('<p>カードを 1まい 以上 入れよう。</p>', [{ label: 'とじる', value: 0 }]);
      save(); return tower();
    }
    const i = +b.dataset.i;
    const inDeck = A.deck.includes(i);
    const no = !inDeck && whyNot(A.deck, i);
    const v = await sheet(detail(BY_ID[A.pool[i]]), [
      inDeck ? { label: 'デッキから はずす', value: 'out', kind: 'primary' } : { label: 'デッキに 入れる', value: 'in', kind: 'primary', disabled: !!no, note: no || '' },
      { label: 'とじる', value: null },
    ]);
    if (v === 'out') A.deck = A.deck.filter((k) => k !== i);
    if (v === 'in') A.deck.push(i);
    save(); draw();
  };
}
const colorKey = (d) => { const c = colorsOf(d); return c.length === 0 ? 9 : c.length === 2 ? 5 + COLOR_ORDER.indexOf(c[0]) / 10 : COLOR_ORDER.indexOf(c[0]); };

// ---- 塔 ----
function tower() {
  const st = deckStats(A.deck);
  app().innerHTML = `<main class="tower">
    <p class="eyebrow">${DIFFS.find(([k]) => k === A.diff)[1]}　コンティニュー のこり ${A.continues}回</p>
    <h2>塔</h2>
    <ol class="floors">${A.floors.map((f, i) => `<li class="${i < A.idx ? 'done' : i === A.idx ? 'now' : ''}"><span>${esc(FLOOR_NAMES[f])}</span><em>${i < A.idx ? 'クリア' : i === A.idx ? 'いま ここ' : ''}</em></li>`).reverse().join('')}</ol>
    <p class="deckline">デッキ：${st.colors.map((c) => COLOR_NAME[c]).join('・') || '無色'}　${st.points}点　カード${st.count}まい＋きほん${DECK_SIZE - st.count}まい</p>
    <div class="row-btns"><button type="button" class="btn" data-a="deck">デッキを なおす</button><button type="button" class="btn primary" data-a="go">${esc(FLOOR_NAMES[A.floors[A.idx]])}へ</button></div>
    <button type="button" class="btn ghost" data-a="quit">タイトルへ（つづきは のこる）</button>
  </main>`;
  app().onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'deck') deckBuilder();
    if (a === 'quit') title();
    if (a === 'go') fight();
  };
}

function fight() {
  const f = A.floors[A.idx];
  startBattle({
    deck: finalDeck(), floorId: f, diff: A.diff, grade: A.grade, floorName: FLOOR_NAMES[f],
    onEnd: async (r) => {
      A.asked += r.asked; A.ok += r.ok;
      if (r.win) {
        A.idx++;
        if (A.idx >= A.floors.length) { A.over = 'clear'; save(); return ending(true); }
        A.toOpen = 1; save();
        await sheet('<p>パックを 1つ あけて、デッキを くみなおせる。</p>', [{ label: 'パックを あける', value: 1, kind: 'primary' }], { title: 'ごほうび', dismiss: false });
        return packs();
      }
      if (A.continues > 0) {
        const v = await sheet(`<p>コンティニューすると、${esc(FLOOR_NAMES[f])}の はじめから やりなおせる（ライフは 20 に もどる）。デッキを なおしてから いどんでも いい。</p>`,
          [{ label: 'コンティニュー（のこり1回）', value: 'c', kind: 'primary' }, { label: 'あきらめる', value: 'x' }], { title: 'まけてしまった', dismiss: false });
        if (v === 'c') { A.continues--; save(); return tower(); }
      }
      A.over = 'lose'; save(); return ending(false);
    },
  });
}

function ending(win) {
  const reached = win ? 5 : A.idx + 1;
  app().innerHTML = `<main class="ending ${win ? 'win' : 'lose'}">
    <p class="eyebrow">${win ? '塔を のぼりきった' : `${reached}階で ちからつきた`}</p>
    <h2>${win ? 'エレボスを たおした！' : 'ぼうけん おわり'}</h2>
    <dl class="stats">
      <div><dt>とどいた 階</dt><dd>${reached}<small>/5</small></dd></div>
      <div><dt>けいさんチャレンジ</dt><dd>${A.ok}<small>/${A.asked} せいかい</small></dd></div>
      <div><dt>あけた パック</dt><dd>${A.opened}</dd></div>
    </dl>
    <button type="button" class="btn primary" data-a="t">タイトルへ</button>
  </main>`;
  clearSave();
  app().onclick = (e) => { if (e.target.closest('[data-a]')) title(); };
}

title();
