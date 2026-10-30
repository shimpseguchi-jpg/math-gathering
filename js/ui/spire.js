// 次元渡り（大人向けモード。docs/SPIRE.md）：画面
// 冒険のすすめかたは engine/spire.js の runLoop。ここは io（マップ・報酬・お店・選択・戦闘）を画面で答える
// 文字は大人向けのふつうの日本語（ふりがななし。tools/kanji.mjs の対象外）
import { newRun, runLoop, cardDef, defOf, potionSlots, removePrice, scoreOf, BOSS_ROW } from '../engine/spire.js';
import { SPIRE, ACTS, ASC, RELIC_BY_ID, POTION_BY_ID } from '../data/spire.js';
import { grown } from '../data/strixhaven.js';
import { startBattle } from './battle.js';
import { cardFace, fullCard, detail, sheet, esc, COLOR_NAME, byColorCost } from './view.js';
import { sfx } from './sfx.js';

const KEY = 'mtg-spire-v1', REC = 'mtg-spire-rec';
let APP = null, BACK = null;
const app = () => APP();
const PAIRS = ['WU', 'UK', 'KR', 'RG', 'GW', 'WK', 'UR', 'KG', 'RW', 'GU'];
const PAIR_NAME = { WU: 'アゾリウス', UK: 'ディミーア', KR: 'ラクドス', RG: 'グルール', GW: 'セレズニア', WK: 'オルゾフ', UR: 'イゼット', KG: 'ゴルガリ', RW: 'ボロス', GU: 'シミック' };
const pips = (cols) => [...cols].map((c) => `<i class="pip m-${c}">${COLOR_NAME[c]}</i>`).join('');

// ---- 保存 ----
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const save = (R) => { try { localStorage.setItem(KEY, JSON.stringify(R)); } catch { /* 保存できなくても この あいだは つづく */ } };
const clear = () => { try { localStorage.removeItem(KEY); } catch { /* なにも しない */ } };
const rec = () => { try { return { maxAsc: 0, best: {}, wins: 0, runs: 0, ...JSON.parse(localStorage.getItem(REC) || '{}') }; } catch { return { maxAsc: 0, best: {}, wins: 0, runs: 0 }; } };
const saveRec = (r) => { try { localStorage.setItem(REC, JSON.stringify(r)); } catch { /* なにも しない */ } };

// ---- メニュー ----
export function spireMenu(appFn, back) {
  APP = appFn; BACK = back;
  const old = load(), r = rec();
  let cols = PAIRS[0], asc = Math.min(r.maxAsc, r.lastAsc ?? 0), pool = r.pool || 'all', random = false;
  const draw = () => {
    app().innerHTML = `<main class="spire sp-menu">
      <header class="sp-top"><p class="eyebrow">大人向けモード</p><h2>次元渡り</h2>
        <p class="sp-lead">テーロス → ラヴニカ → ストリクスヘイヴン。分かれ道を選んで 3つの次元を渡り、それぞれのボスをたおす。ライフは引きつぎ、デッキは持っているカードすべて。敵がつぎにめくるカードは、いつも見えている。</p></header>
      ${old && !old.over ? `<button type="button" class="btn primary sp-cont" data-a="cont">つづきから<small>第${old.act + 1}幕 ${ACTS[old.act].name}・${old.floor}マス・ライフ ${old.life}/${old.maxLife}・アセンション ${old.asc}</small></button>` : ''}
      <section class="sp-box"><h3>色</h3>
        <div class="sp-pairs">${PAIRS.map((p) => `<button type="button" class="sp-pair ${!random && p === cols ? 'on' : ''}" data-pair="${p}"><span class="sp-pips">${pips(p)}</span><span>${PAIR_NAME[p]}</span></button>`).join('')}
          <button type="button" class="sp-pair ${random ? 'on' : ''}" data-pair="rand"><span>おまかせ</span><small>金貨 ＋50</small></button></div></section>
      <section class="sp-box"><h3>アセンション</h3>
        <div class="sp-asc">${Array.from({ length: SPIRE.maxAsc + 1 }, (_, k) => `<button type="button" class="sp-n ${k === asc ? 'on' : ''}" data-asc="${k}" ${k > r.maxAsc ? 'disabled' : ''}>${k}</button>`).join('')}</div>
        <p class="sp-note">${asc ? ASC.slice(1, asc + 1).map((t, k) => `${k + 1}. ${esc(t)}`).join('<br>') : 'きまりの追加なし。クリアすると次の段がひらく。'}</p></section>
      <section class="sp-box"><h3>カード</h3>
        <div class="sp-seg"><button type="button" class="${pool === 'all' ? 'on' : ''}" data-pool="all">すべての弾<small>開発中もふくむ</small></button><button type="button" class="${pool === 'released' ? 'on' : ''}" data-pool="released">公開中の弾<small>第1・2・5弾</small></button></div></section>
      <div class="row-btns"><button type="button" class="btn primary" data-a="new">旅に出る</button><button type="button" class="btn" data-a="back">タイトルへ</button></div>
      <p class="sp-note">きろく：${r.runs}回・クリア ${r.wins}回${Object.keys(r.best).length ? '・ベスト ' + Object.entries(r.best).map(([a, s]) => `A${a} ${s}点`).join('　') : ''}</p>
    </main>`;
  };
  draw();
  app().onclick = async (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.pair) { random = b.dataset.pair === 'rand'; if (!random) cols = b.dataset.pair; return draw(); }
    if (b.dataset.asc) { asc = +b.dataset.asc; return draw(); }
    if (b.dataset.pool) { pool = b.dataset.pool; return draw(); }
    const a = b.dataset.a;
    if (a === 'back') return BACK();
    if (a === 'cont') return play(old);
    if (a === 'new') {
      if (old && !old.over) {
        const v = await sheet('<p>つづきの旅は消える。新しく旅に出る？</p>', [{ label: '新しく旅に出る', value: 1, kind: 'primary' }, { label: 'やめる', value: 0 }], { title: '新しい旅' });
        if (!v) return;
      }
      const c = random ? PAIRS[Math.floor(Math.random() * PAIRS.length)] : cols;
      const R = newRun({ cols: c, asc, pool, rng: Math.random, random });
      const rr = rec(); rr.runs++; rr.lastAsc = asc; rr.pool = pool; saveRec(rr);
      save(R);
      sfx.tap?.();
      return play(R);
    }
  };
}

function play(R) {
  runLoop(R, IO, Math.random).then((done) => { if (!done) spireMenu(APP, BACK); });
}

// ---- 上の帯：幕・ライフ・金貨・ポーション・レリック・デッキ ----
function hud(R) {
  const slots = potionSlots(R);
  return `<header class="sp-hud">
    <div class="sp-hud-row"><b class="sp-act">第${R.act + 1}幕 ${ACTS[R.act].name}</b><span class="sp-asc-chip">A${R.asc}</span>
      <span class="sp-life ${R.life <= R.maxLife * 0.3 ? 'low' : ''}">ライフ <b>${R.life}</b>/${R.maxLife}</span><span class="sp-gold">金貨 <b>${R.gold}</b></span></div>
    <div class="sp-hud-row">
      <button type="button" class="sp-chip" data-hud="deck">デッキ ${R.deck.length}</button>
      <button type="button" class="sp-chip" data-hud="relics">レリック ${R.relics.length}</button>
      <span class="sp-pots">${Array.from({ length: slots }, (_, i) => R.potions[i] ? `<button type="button" class="sp-pot" data-pot="${i}">${esc(POTION_BY_ID[R.potions[i]].name)}</button>` : '<span class="sp-pot empty">空き</span>').join('')}</span>
    </div></header>`;
}
async function hudClick(e, R) {
  const h = e.target.closest('[data-hud],[data-pot]');
  if (!h) return false;
  if (h.dataset.hud === 'deck') await sheet(deckList(R), [{ label: '閉じる', value: 0 }], { title: `デッキ（${R.deck.length}枚）` });
  if (h.dataset.hud === 'relics') await sheet(relicList(R), [{ label: '閉じる', value: 0 }], { title: 'レリック' });
  if (h.dataset.pot) { const d = POTION_BY_ID[R.potions[+h.dataset.pot]]; await sheet(`<p>${esc(d.textOver)}</p><p class="sp-note">戦闘のはじめに手札に入る（コスト 0・手札の枚数に数えない）。</p>`, [{ label: '閉じる', value: 0 }], { title: esc(d.name) }); }
  return true;
}
const upMark = (e) => (e.up ? '<b class="sp-up">＋</b>' : '');
function deckList(R, f = null) {
  const items = R.deck.map((e, i) => ({ e, i, d: cardDef(e) })).sort((a, b) => byColorCost(a.d, b.d));
  return `<div class="sp-deck">${items.map(({ e, i, d }) => `<button type="button" class="sp-dcard ${f && !f(e) ? 'off' : ''}" data-card="${i}" ${f && !f(e) ? 'disabled' : ''}>${cardFace(d)}${upMark(e)}</button>`).join('')}</div>`;
}
const relicList = (R) => (R.relics.length ? `<ul class="sp-relics">${R.relics.map((id) => `<li><b>${esc(RELIC_BY_ID[id].name)}</b><span>${esc(RELIC_BY_ID[id].text)}</span></li>`).join('')}</ul>` : '<p>まだない。</p>');

// ---- マップ ----
const NODE = { fight: ['戦', '戦闘'], elite: ['強', 'エリート'], rest: ['休', '休憩所'], shop: ['店', 'お店'], event: ['？', 'イベント'], treasure: ['宝', '宝箱'], boss: ['ボス', 'ボス'] };
function mapHtml(R, can) {
  const W = SPIRE.lanes, H = SPIRE.rows, g = R.map;
  const x = (c) => ((c + 0.5) / W) * 100, y = (r) => ((H - r) / (H + 1)) * 100 + 100 / (H + 1) / 2; // 上がボス
  const trail = new Set((R.trail || []).map((p) => `${p.r}:${p.c}`));
  const lines = [];
  for (const row of g) for (const n of row) if (n) for (const c of n.next) {
    const used = trail.has(`${n.r}:${n.c}`) && trail.has(`${n.r + 1}:${c}`);
    lines.push(`<line x1="${x(n.c)}" y1="${y(n.r)}" x2="${x(c)}" y2="${y(n.r + 1)}" class="${used ? 'used' : ''}"/>`);
  }
  for (const n of g[H - 1]) if (n) lines.push(`<line x1="${x(n.c)}" y1="${y(H - 1)}" x2="50" y2="${y(H)}"/>`);
  const btn = (n, r, c, t, xx) => {
    const k = `${r}:${c}`, ok = can.some((m) => m.r === r && m.c === c), here = R.pos && R.pos.r === r && R.pos.c === c;
    return `<button type="button" class="sp-node t-${t} ${ok ? 'can' : ''} ${trail.has(k) ? 'done' : ''} ${here ? 'here' : ''}" style="left:${xx}%;top:${y(r)}%" ${ok ? `data-node="${k}"` : 'disabled'} aria-label="${NODE[t][1]}${ok ? '（進める）' : ''}"><span>${NODE[t][0]}</span></button>`;
  };
  const nodes = [];
  for (const row of g) for (const n of row) if (n) nodes.push(btn(n, n.r, n.c, n.t, x(n.c)));
  nodes.push(btn(null, BOSS_ROW, 0, 'boss', 50));
  return `<div class="sp-map" style="--rows:${H + 1}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>${nodes.join('')}</div>`;
}
function pickNode(R, nodes) {
  return new Promise((resolve) => {
    app().innerHTML = `<main class="spire sp-mapscreen">${hud(R)}
      <p class="sp-boss">ボス：${esc(ACTS[R.act].bossName)}</p>
      ${mapHtml(R, nodes)}
      <p class="sp-legend">${Object.entries(NODE).map(([t, [k, n]]) => `<span class="t-${t}"><i>${k}</i>${n}</span>`).join('')}</p>
      <div class="row-btns"><button type="button" class="btn ghost" data-a="quit">メニューへ（つづきは残る）</button></div>
    </main>`;
    requestAnimationFrame(() => app().querySelector('.sp-node.can')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    app().onclick = async (e) => {
      if (await hudClick(e, R)) return;
      if (e.target.closest('[data-a="quit"]')) return resolve(null);
      const b = e.target.closest('[data-node]'); if (!b) return;
      const [r, c] = b.dataset.node.split(':').map(Number);
      sfx.tap?.();
      resolve(nodes.find((n) => n.r === r && n.c === c));
    };
  });
}

// ---- えらぶ（イベント・休憩所・祝福など）----
const para = (t) => esc(t).replace(/\n/g, '<br>');
function choose({ title, body, options }) {
  return sheet(`<p class="sp-body">${para(body || '')}</p>`, options.map((o, k) => ({ label: esc(o.label), value: o.value, kind: k === 0 ? 'primary' : '', disabled: o.disabled, note: o.note ? esc(o.note) : '' })), { title: esc(title), dismiss: false });
}

// ---- デッキからカードを 1枚えらぶ（取り除く・強化・ふやす・変える）----
function pickCard(R, { id, title, filter }) {
  const f = filter || (() => true);
  return new Promise((resolve) => {
    app().innerHTML = `<main class="spire sp-pick">${hud(R)}<h2 class="sp-h">${esc(title)}</h2>${deckList(R, f)}
      <div class="row-btns"><button type="button" class="btn" data-a="cancel">やめる</button></div></main>`;
    app().onclick = async (e) => {
      if (await hudClick(e, R)) return;
      if (e.target.closest('[data-a="cancel"]')) return resolve(null);
      const b = e.target.closest('[data-card]'); if (!b || b.disabled) return;
      const i = +b.dataset.card, ent = R.deck[i], d = cardDef(ent);
      const after = id === 'upgrade' ? `<p class="sp-note">強化すると：</p><div class="sp-after">${cardFace(grown(defOf(ent.id), 1))}</div>` : '';
      const v = await sheet(`${detail(d)}${after}`, [{ label: 'これにする', value: 1, kind: 'primary' }, { label: 'もどる', value: 0 }], { title: esc(title) });
      if (v) resolve(i);
    };
  });
}

// ---- 報酬（カードを 1枚えらぶ）----
function pickReward(R, ids, rw) {
  return new Promise((resolve) => {
    const got = [
      rw.gotGold ? `<span>金貨 ＋${rw.gotGold}</span>` : '',
      rw.gotRelic ? `<span>レリック「${esc(RELIC_BY_ID[rw.gotRelic].name)}」：${esc(RELIC_BY_ID[rw.gotRelic].text)}</span>` : '',
      rw.gotPotion ? `<span>ポーション「${esc(POTION_BY_ID[rw.gotPotion].name)}」</span>` : '',
    ].join('');
    const title = rw.kind === 'neow' ? '旅立ちの祝福：レアを 1枚' : rw.kind === 'event' ? 'カードを 1枚' : '報酬';
    app().innerHTML = `<main class="spire sp-reward">${hud(R)}<h2 class="sp-h">${title}</h2>
      ${got ? `<div class="bonus">${got}</div>` : ''}
      <p class="sp-note">カードを 1枚えらんでデッキに加える（取らなくてもよい）。</p>
      <div class="draft-row">${ids.map((id) => `<button type="button" class="draft-card" data-pick="${id}">${fullCard(defOf(id))}</button>`).join('')}</div>
      <div class="row-btns"><button type="button" class="btn" data-a="skip">取らない</button></div></main>`;
    app().onclick = async (e) => {
      if (await hudClick(e, R)) return;
      if (e.target.closest('[data-a="skip"]')) return resolve(null);
      const b = e.target.closest('[data-pick]'); if (!b) return;
      const v = await sheet(detail(defOf(b.dataset.pick)), [{ label: 'デッキに加える', value: 1, kind: 'primary' }, { label: 'もどる', value: 0 }]);
      if (v) { sfx.tap?.(); resolve(b.dataset.pick); }
    };
  });
}

// ---- お店 ----
function shop(R, S) {
  return new Promise((resolve) => {
    const can = (x) => !x.sold && R.gold >= x.price;
    const potFull = R.potions.length >= potionSlots(R);
    app().innerHTML = `<main class="spire sp-shop">${hud(R)}<h2 class="sp-h">お店</h2>
      <section><h3>カード</h3><div class="sp-shelf">${S.cards.map((x, i) => `<button type="button" class="sp-item ${x.sold ? 'sold' : ''}" data-buy="card:${i}" ${can(x) ? '' : 'disabled'}>${cardFace(defOf(x.id))}<b class="sp-price ${x.sale ? 'sale' : ''}">${x.sold ? '売り切れ' : `${x.price}`}</b></button>`).join('')}</div></section>
      <section><h3>レリック</h3><div class="sp-list">${S.relics.map((x, i) => `<button type="button" class="sp-row ${x.sold ? 'sold' : ''}" data-buy="relic:${i}" ${can(x) ? '' : 'disabled'}><b>${esc(RELIC_BY_ID[x.id].name)}</b><span>${esc(RELIC_BY_ID[x.id].text)}</span><i class="sp-price">${x.sold ? '売り切れ' : x.price}</i></button>`).join('')}</div></section>
      <section><h3>ポーション${potFull ? '（枠がいっぱい）' : ''}</h3><div class="sp-list">${S.potions.map((x, i) => `<button type="button" class="sp-row ${x.sold ? 'sold' : ''}" data-buy="potion:${i}" ${can(x) && !potFull ? '' : 'disabled'}><b>${esc(POTION_BY_ID[x.id].name)}</b><span>${esc(POTION_BY_ID[x.id].textOver)}</span><i class="sp-price">${x.sold ? '売り切れ' : x.price}</i></button>`).join('')}</div></section>
      <section><h3>サービス</h3><div class="sp-list"><button type="button" class="sp-row" data-buy="remove:0" ${!S.removed && R.gold >= removePrice(R) ? '' : 'disabled'}><b>カードを取り除く</b><span>デッキから 1枚えらんで取り除く（1つのお店で 1回）。</span><i class="sp-price">${S.removed ? '済み' : removePrice(R)}</i></button></div></section>
      <div class="row-btns"><button type="button" class="btn primary" data-a="leave">店を出る</button></div></main>`;
    app().onclick = async (e) => {
      if (await hudClick(e, R)) return;
      if (e.target.closest('[data-a="leave"]')) return resolve({ k: 'leave' });
      const b = e.target.closest('[data-buy]'); if (!b || b.disabled) return;
      const [k, i] = b.dataset.buy.split(':');
      if (k === 'remove') return resolve({ k, i: 0 });
      const x = S[{ card: 'cards', relic: 'relics', potion: 'potions' }[k]][+i];
      const body = k === 'card' ? detail(defOf(x.id)) : `<p>${esc(k === 'relic' ? RELIC_BY_ID[x.id].text : POTION_BY_ID[x.id].textOver)}</p>`;
      const v = await sheet(body, [{ label: `買う（金貨 ${x.price}）`, value: 1, kind: 'primary' }, { label: 'もどる', value: 0 }], { title: k === 'card' ? '' : esc((k === 'relic' ? RELIC_BY_ID : POTION_BY_ID)[x.id].name) });
      if (v) { sfx.tap?.(); resolve({ k, i: +i }); }
    };
  });
}

// ---- 戦闘 ----
const KIND = { fight: '戦闘', elite: 'エリート', boss: 'ボス' };
function battle(R, set) {
  return new Promise((resolve) => startBattle({
    deck: set.deck, floor: set.floor, diff: set.diff, floorName: `${KIND[set.kind]}：${set.floorName}`, emblem: set.emblem, bless: set.bless, buff: set.buff, life: set.life,
    extraNote: `次元渡り：ライフ ${set.life} / ${R.maxLife} からはじまる。敵がつぎにめくるカードは「つぎの てき」に出る。${set.buff ? `この幕の敵クリーチャーは ＋${set.buff}/＋${set.buff}。` : ''}${R.potions.length ? 'ポーションは手札に入っている（コスト 0）。' : ''}`,
    quit: { label: '次元渡りのメニューへ', note: 'この戦闘ははじめからやりなおしになる（旅のつづきは残る）。', go: () => spireMenu(APP, BACK) },
    onEnd: (r) => resolve(r),
  }));
}

// ---- おわり ----
async function end(R) {
  const r = rec(), score = scoreOf(R);
  const best = !r.best[R.asc] || score > r.best[R.asc];
  if (best) r.best[R.asc] = score;
  let unlocked = false;
  if (R.over === 'win') { r.wins++; if (R.asc >= r.maxAsc && R.asc < SPIRE.maxAsc) { r.maxAsc = R.asc + 1; unlocked = true; } }
  saveRec(r); clear();
  app().innerHTML = `<main class="spire ending ${R.over === 'win' ? 'win' : 'lose'}">
    <p class="eyebrow">${R.over === 'win' ? '3つの次元を渡りきった' : `第${R.act + 1}幕 ${ACTS[R.act].name}で力つきた`}</p>
    <h2>${R.over === 'win' ? '次元渡り、達成' : esc(R.lostTo ? `${R.lostTo}に敗れた` : '旅のおわり')}</h2>
    <dl class="stats">
      <div><dt>のぼったマス</dt><dd>${R.floor}</dd></div>
      <div><dt>エリート</dt><dd>${R.stats.elites}</dd></div>
      <div><dt>ボス</dt><dd>${R.stats.bosses}</dd></div>
      <div><dt>ぴったり</dt><dd>${R.stats.exact}</dd></div>
      <div><dt>デッキ</dt><dd>${R.deck.length}<small>枚</small></dd></div>
      <div><dt>スコア</dt><dd>${score}</dd></div>
    </dl>
    ${best ? `<p class="what"><b>アセンション ${R.asc} のベスト更新</b></p>` : ''}
    ${unlocked ? `<p class="what"><b>アセンション ${R.asc + 1} がひらいた</b>：${esc(ASC[R.asc + 1])}</p>` : ''}
    <p class="sp-note">レリック：${R.relics.map((id) => esc(RELIC_BY_ID[id].name)).join('・') || 'なし'}</p>
    <div class="row-btns"><button type="button" class="btn primary" data-a="menu">次元渡りのメニューへ</button></div>
  </main>`;
  await new Promise((resolve) => { app().onclick = (e) => { if (e.target.closest('[data-a="menu"]')) resolve(); }; });
  spireMenu(APP, BACK);
}

const IO = { pickNode, choose, pickCard, pickReward, shop, battle, save, end };
// タイトルのタイル（名前・しらせ）。大人向けの文字なので app.js ではなく ここに書く（tools/kanji.mjs の対象外）
export const spireTile = () => { const o = load(); return ['次元渡り（大人向け）', o && !o.over ? `つづきから：第${o.act + 1}幕・${o.floor}マス` : 'Slay the Spire 型のローグライク']; };
