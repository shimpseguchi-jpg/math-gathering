// 冒険の流れ：タイトル → パック開封 → デッキ構築 → 塔 → たたかい → …
import { openPack, buildDeck, DECK_SIZE, CAPACITY, favorColor, legendChance } from '../engine/run.js';
import { BY_ID, BASICS } from '../data/cards.js';
import { colorsOf } from '../engine/game.js';
import { RARITY_PTS } from '../engine/ai.js';
import { startBattle } from './battle.js';
import { tutorialDeck, tutorialSetup, TUTORIAL_DONE } from './tutorial.js';
import { onlineMenu, saveGhost, hasServer } from './online.js';
import { sfx, soundOn, setSound } from './sfx.js';
import { cardFace, fullCard, detail, sheet, esc, ruby, info, COLOR_NAME, initTerms, byColorCost, toast } from './view.js';

const SAVE = 'mtg-adventure-v1';
const TAP_MODE = 'mtg-build-tap'; // デッキ構築で タップしたとき：'detail'（せつめい）か 'quick'（すぐ 入れる・はずす）
const FLOOR_NAMES = {
  hydra: '1階 ハイドラとの たいじ', horde: '2階 たいぐんとの たたかい', factory: '3階 ゴーレムの工場', slime: '3階 ふえるスライム',
  xenagos: '4階 神を うて', erebos: '5階 死者の神 エレボス',
};
const DIFFS = [['easy', 'かんたん'], ['normal', 'ふつう'], ['hard', 'むずかしい']];

let A = null; // いまの冒険
const app = () => document.getElementById('app');
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch { return null; } };
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(A)); } catch { /* 保存できない環境でも遊べる */ } };
const clearSave = () => { try { localStorage.removeItem(SAVE); } catch { /* なし */ } };
const defs = (ids) => ids.map((id) => BY_ID[id]);
const nm = (d) => info(d).name; // ふりがなつきの 名前（ruby に とおして 出す）

// ---- タイトル ----
const tutorialDone = () => { try { return !!localStorage.getItem(TUTORIAL_DONE); } catch { return true; } };

export function title() {
  const old = load();
  const first = !tutorialDone() && !old;
  const pref = old || { diff: 'normal' };
  app().innerHTML = `<main class="title">
    <div class="title-mark" aria-hidden="true"><span>＋</span><span>−</span><span>×</span><span>÷</span></div>
    <h1>マスマティック・<br>ザ・ギャザリング</h1>
    <p class="title-sub">算数の デッキこうちく ローグライク。パックを あけて デッキを くみ、5階だての とうを のぼろう。</p>
    <fieldset class="seg"><legend>むずかしさ</legend>${DIFFS.map(([k, l]) => `<label><input type="radio" name="diff" id="diff-${k}" value="${k}" ${pref.diff === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>
    <div class="title-btns">
      ${first ? '<button type="button" class="btn primary" data-go="tut">チュートリアル（はじめての 人）</button>' : ''}
      ${old && !old.over ? `<button type="button" class="btn primary" data-go="cont">つづきから（${old.idx + 1}階）</button>` : ''}
      <button type="button" class="btn ${(old && !old.over) || first ? '' : 'primary'}" data-go="new">あたらしい ぼうけん</button>
      <button type="button" class="btn" data-go="online">オンライン バトル${hasServer() ? '' : '<small>（れんしゅう）</small>'}</button>
      ${first ? '' : '<button type="button" class="btn" data-go="tut">チュートリアル</button>'}
    </div>
    <p class="fine">しさくばん。てきを タフネスと ちょうど 同じ ダメージで たおすと「ぴったり！」。</p>
  </main>`;
  app().onclick = (e) => {
    const b = e.target.closest('[data-go]'); if (!b) return;
    if (b.dataset.go === 'cont') { A = old; return resume(); }
    if (b.dataset.go === 'tut') return tutorial();
    if (b.dataset.go === 'online') return onlineMenu(app, title);
    const diff = app().querySelector('input[name=diff]:checked').value;
    A = { diff, pool: [], deck: null, floors: ['hydra', 'horde', Math.random() < 0.5 ? 'factory' : 'slime', 'xenagos', 'erebos'], idx: 0, continues: 1, toOpen: 3, opened: 0, exact: 0 };
    save();
    packs();
  };
}

// ---- チュートリアル（メレティスの 訓練場）----
function tutorial() {
  startBattle({
    deck: tutorialDeck(), floorId: 'tutorial', diff: 'easy', floorName: 'メレティスの くんれんじょう', tutorial: true, setup: tutorialSetup,
    quit: { label: 'タイトルへ もどる', note: 'チュートリアルを やめて タイトルへ もどる？ あとで また はじめから できるよ。', go: title },
    onEnd: async (r) => {
      if (r.win) {
        try { localStorage.setItem(TUTORIAL_DONE, '1'); } catch { /* 保存できなくても よい */ }
        await sheet(`<p>${ruby(r.exact ? 'ぴったり 10点で まとを たおした！ マナの おきかた、しょうしゅう、ブロック、あっとう、ぴったり。これで とうに いどめるよ。' : 'まとを たおした！ つぎは ぴったりを ねらってみよう。これで とうに いどめるよ。')}</p>`,
          [{ label: 'タイトルへ', value: 1, kind: 'primary' }], { title: 'チュートリアル クリア！', dismiss: false });
      }
      title();
    },
  });
}

function resume() { if (A.toOpen > 0) packs(); else if (!A.deck) deckBuilder(); else tower(); }

// ---- パック開封（ソシャゲの ガチャ演出） ----
// ① 光る パックを タップして やぶる → ② 1まいずつ めくる（裏の光り方で レアリティが わかる）→ ③ まとめ
const ORDER = [1, 2, 3, 0, 4, 5, 6, 7]; // コモン → アンコモン → レア の順。0 は「！？」の わく
const GLOW = { C: '', U: 'g-U', R: 'g-R', L: 'g-L' };
function packs() {
  // ごほうびパック：登った階が 多いほど レア以上が 出やすく、デッキで いちばん使う色が 出やすい
  const cleared = A.idx;
  const favor = cleared > 0 && A.deck ? favorColor(deckStats(A.deck).ds) : null;
  const cards = openPack(Math.random, { cleared, favor });
  const surprise = !!cards.surprise;
  const ids = cards.map((d) => d.id);
  const owned = new Set(A.pool);
  const best = cards.some((d) => d.rar === 'L') ? 'L' : 'R';
  let stage = 'pack', k = 0, cracked = false, flipped = false;
  const st = { aura: best === 'L' ? 'aura-L' : 'aura-R' };
  const top = () => `<div class="pk-top"><p class="eyebrow">パック ${A.opened + 1}${A.idx === 0 ? ' / 3' : ''}</p>
    <button type="button" class="snd" data-snd="1" aria-pressed="${soundOn()}">おと ${soundOn() ? 'あり' : 'なし'}</button></div>`;
  const burst = (n = 22) => Array.from({ length: n }, (_, i) => `<i style="--a:${(360 / n) * i + Math.random() * 12}deg;--d:${70 + Math.random() * 90}px;--h:${Math.floor(Math.random() * 360)}"></i>`).join('');

  const draw = () => {
    if (stage === 'pack') {
      app().innerHTML = `<main class="gacha">${top()}
        <button type="button" class="foil ${st.aura}" data-open="1" aria-label="パックを あける">
          <span class="foil-shine"></span><span class="foil-title">MATHEMATIC<br>THE GATHERING</span><span class="foil-sub">8まい いり</span>
        </button>
        <p class="gacha-hint">${best === 'L' ? 'パックが にじいろに 光っている…！？' : 'タップして パックを やぶろう'}</p>
        ${cleared > 0 ? `<div class="bonus"><p class="bonus-title">${cleared}階 クリアの ごほうびパック</p>
          <span>レジェンドが 出る かくりつ <b>${Math.round(legendChance(cleared) * 100)}%</b><small>（さいしょは ${Math.round(legendChance(0) * 100)}%）</small></span>
          <span>上の 階ほど、レアや アンコモンに かわりやすい</span>
          ${favor ? `<span><i class="pip m-${favor}">${COLOR_NAME[favor]}</i> の カードが 出やすい（デッキで いちばん 使っている色）</span>` : ''}</div>` : ''}
      </main>`;
      return;
    }
    if (stage === 'reveal') {
      const i = ORDER[k], d = BY_ID[ids[i]];
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
        <ol class="dots">${ORDER.map((_, n) => `<li class="${n < k || (n === k && flipped) ? 'on' : ''} ${n === k ? 'now' : ''}"></li>`).join('')}</ol>
        <p class="tap-next">${flipped ? `カードを タップで ${k < 7 ? 'つぎへ' : 'まとめへ'}（点線の ことばは 長おしで せつめい）` : ''}</p>
        <div class="row-btns"><button type="button" class="btn ghost" data-skip="1">スキップ</button></div>
      </main>`;
      return;
    }
    app().innerHTML = `<main class="gacha">${top()}
      <h2 class="sum-title">このパックの カード</h2>
      <div class="pack-grid">${ids.map((id, i) => `<button type="button" class="sum-card ${GLOW[BY_ID[id].rar]}" data-i="${i}">${cardFace(BY_ID[id])}${!owned.has(id) ? '<span class="new">NEW</span>' : ''}</button>`).join('')}</div>
      <div class="row-btns"><button type="button" class="btn primary" data-done="1">つぎへ</button></div>
    </main>`;
  };
  draw();

  let flippedAt = 0;
  const next = () => { if (k < 7) { k++; flipped = false; cracked = false; } else stage = 'sum'; sfx.tap(); draw(); };
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
      const i = ORDER[k], d = BY_ID[ids[i]];
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
    if (b.dataset.done) {
      A.pool.push(...ids); A.toOpen--; A.opened++; save();
      return A.toOpen > 0 ? packs() : deckBuilder();
    }
    if (b.dataset.i != null) await sheet(detail(BY_ID[ids[+b.dataset.i]]), [{ label: 'とじる', value: 0 }]);
  };
}
const RAR_NAME = { C: 'コモン', U: 'アンコモン', R: 'レア', L: 'レジェンド' };
function flash() {
  const f = document.createElement('div');
  f.className = 'flash';
  document.body.append(f);
  setTimeout(() => f.remove(), 900);
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
  const order = A.pool.map((id, i) => i).sort((a, b) => byColorCost(BY_ID[A.pool[a]], BY_ID[A.pool[b]]));
  let mode = (() => { try { return localStorage.getItem(TAP_MODE) === 'quick' ? 'quick' : 'detail'; } catch { return 'detail'; } })();
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
        <div class="tapmode" role="group" aria-label="カードを タップしたとき">
          <span>タップで</span>
          <button type="button" data-mode="detail" aria-pressed="${mode === 'detail'}">せつめいを 見る</button>
          <button type="button" data-mode="quick" aria-pressed="${mode === 'quick'}">すぐ 入れる・はずす</button>
        </div>
        <p class="hint">${mode === 'quick' ? 'タップで 入れる ⇔ はずす。長おしで せつめい。' : 'タップで せつめい → 入れる・はずす。'}点数は コモン1・アンコモン2・レア3・レジェンド4。</p>
      </header>
      <div class="pool ${mode}">${order.map((i) => {
        const inDeck = A.deck.includes(i);
        const no = !inDeck && whyNot(A.deck, i);
        return `<button type="button" class="pool-item ${inDeck ? 'in' : ''} ${no ? 'no' : ''}" data-i="${i}">${cardFace(BY_ID[A.pool[i]])}<span class="pts">${RARITY_PTS[BY_ID[A.pool[i]].rar]}点</span></button>`;
      }).join('')}</div>
      <footer class="actions"><button type="button" class="btn" data-a="auto">おまかせ</button><button type="button" class="btn" data-a="clear">ぜんぶ はずす</button><button type="button" class="btn primary" data-a="ok">けってい</button></footer>
    </main>`;
  };
  draw();
  const showDetail = async (i) => {
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
  // すぐ 入れる・はずす モード：長おしで せつめい（点線の ことばの 長おしは ことばの せつめいに まかせる）
  let press = null, pressed = false;
  app().onpointerdown = (e) => {
    clearTimeout(press); pressed = false;
    const el = mode === 'quick' && e.target.closest('.pool-item');
    if (!el || e.target.closest('[data-term]')) return;
    press = setTimeout(() => { pressed = true; showDetail(+el.dataset.i); }, 450);
  };
  app().onpointerup = app().onpointercancel = () => clearTimeout(press);
  app().onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mode) { mode = b.dataset.mode; try { localStorage.setItem(TAP_MODE, mode); } catch { /* 保存できなくても 切りかえられる */ } return draw(); }
    if (b.dataset.a === 'auto') { A.deck = autoDeck(); save(); return draw(); }
    if (b.dataset.a === 'clear') { A.deck = []; save(); return draw(); }
    if (b.dataset.a === 'ok') {
      if (!A.deck.length) return sheet('<p>カードを 1まい いじょう 入れよう。</p>', [{ label: 'とじる', value: 0 }]);
      save(); return tower();
    }
    if (b.dataset.i == null) return;
    const i = +b.dataset.i;
    if (mode === 'detail') return showDetail(i);
    if (pressed) { pressed = false; return; } // 長おしで せつめいを 出した あとの タップ
    if (A.deck.includes(i)) A.deck = A.deck.filter((k) => k !== i);
    else {
      const no = whyNot(A.deck, i);
      if (no) { toast(`入れられない：${no}`); b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny'); return; }
      A.deck.push(i);
    }
    sfx.tap(); save(); draw();
  };
}

// ---- 塔 ----
function tower() {
  const st = deckStats(A.deck);
  app().innerHTML = `<main class="tower">
    <p class="eyebrow">${DIFFS.find(([k]) => k === A.diff)[1]}　コンティニュー のこり ${A.continues}回</p>
    <h2>とう</h2>
    <ol class="floors">${A.floors.map((f, i) => `<li class="${i < A.idx ? 'done' : i === A.idx ? 'now' : ''}"><span>${esc(FLOOR_NAMES[f])}</span><em>${i < A.idx ? 'クリア' : i === A.idx ? 'いま ここ' : ''}</em></li>`).reverse().join('')}</ol>
    <p class="deckline">デッキ：${st.colors.map((c) => COLOR_NAME[c]).join('・') || 'むしょく'}　${st.points}点　カード${st.count}まい＋きほん${DECK_SIZE - st.count}まい</p>
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
    deck: finalDeck(), floorId: f, diff: A.diff, floorName: FLOOR_NAMES[f],
    quit: { label: 'タイトルへ もどる', note: 'ぼうけんの つづきは のこる。この 階は「つづきから」で はじめから やりなおしに なるよ。', go: title },
    onEnd: async (r) => {
      A.exact = (A.exact || 0) + r.exact;
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
  // デッキを ゴーストに して あずける（オンライン バトルで ほかの 人と たたかえる）
  if (A.deck) saveGhost(finalDeck(), win ? 6 : reached);
  app().innerHTML = `<main class="ending ${win ? 'win' : 'lose'}">
    <p class="eyebrow">${win ? 'とうを のぼりきった' : `${reached}階で ちからつきた`}</p>
    <h2>${win ? 'エレボスを たおした！' : 'ぼうけん おわり'}</h2>
    <dl class="stats">
      <div><dt>とどいた 階</dt><dd>${reached}<small>/5</small></dd></div>
      <div><dt>ぴったり</dt><dd>${A.exact || 0}<small>回</small></dd></div>
      <div><dt>あけた パック</dt><dd>${A.opened}</dd></div>
    </dl>
    <p class="fine">この デッキは「ゴースト」に なった。タイトルの「オンライン バトル」で つかえるよ。</p>
    <button type="button" class="btn primary" data-a="t">タイトルへ</button>
  </main>`;
  clearSave();
  app().onclick = (e) => { if (e.target.closest('[data-a]')) title(); };
}

initTerms();
title();
