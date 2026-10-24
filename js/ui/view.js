// 画面の部品：カードの見た目・ルビ・下から出るシート
import { CARD_TEXT, ENEMY_TEXT, plainName } from '../data/texts.js';
import { colorsOf, pt, hasKw, isCreature } from '../engine/game.js';
import { TERM, TERM_RE, termAt, KW_TERM } from './glossary.js';
import { mapRuby } from './ruby.js';

export const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// 「漢字（よみ）」をルビにする
// 送りがなを はさむ ことば（割り振って（わりふって））も まとめて ルビに
export const ruby = (t) => mapRuby(String(t ?? ''), (b, y) => `<ruby>${esc(b)}<rt>${esc(y)}</rt></ruby>`, esc).replace(/\n/g, '<br>');
export const noRuby = (t) => String(t ?? '').replace(/（[ぁ-ゖー]+）/g, '');

// 文章の中の ことば（キーワード・用語）に 点線を つける。長おし・2回タップで せつめい（それぞれ 最初の1つだけ）
export function richText(raw) {
  const t = String(raw ?? '');
  const used = new Set();
  let out = '', last = 0;
  for (const m of t.matchAll(TERM_RE)) {
    const g = termAt(m.slice(1));
    if (!g || used.has(g.key)) continue;
    used.add(g.key);
    out += ruby(t.slice(last, m.index)) + `<span class="term" data-term="${esc(g.key)}">${ruby(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  // *…* は フレーバー（ななめの 小さい 文）
  return (out + ruby(t.slice(last))).replace(/\*([^*]+)\*/g, '<em class="flavor">$1</em>');
}

export function showTerm(key) {
  const g = TERM[key]; if (!g) return;
  let el = document.getElementById('term');
  if (!el) { el = document.createElement('div'); el.id = 'term'; document.body.append(el); }
  el.innerHTML = `<div class="term-pop" role="dialog" aria-modal="true">
    <p class="term-name">${esc(g.key)}${g.yomi ? `<small>${esc(g.yomi)}</small>` : ''}</p>
    <p class="term-text">${ruby(g.text)}</p>
    <p class="term-hint">タップで とじる</p></div>`;
  el.hidden = false;
  setTimeout(() => {
    const close = (e) => { e.stopPropagation(); e.preventDefault(); el.hidden = true; document.removeEventListener('click', close, true); };
    document.addEventListener('click', close, true);
  }, 60);
}

// 長おし（0.45びょう）か 2回タップで せつめいを 出す
export function initTerms() {
  let timer = null, fired = false, last = { k: null, t: 0 };
  document.addEventListener('pointerdown', (e) => {
    clearTimeout(timer); fired = false;
    const t = e.target.closest?.('[data-term]'); if (!t) return;
    timer = setTimeout(() => { fired = true; showTerm(t.dataset.term); }, 450);
  }, true);
  for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, () => clearTimeout(timer), true);
  document.addEventListener('click', (e) => {
    // 長おしを はなした タップは、ほかの ボタンにも せつめいを とじる 処理にも わたさない
    if (fired) { fired = false; e.stopImmediatePropagation(); e.preventDefault(); return; }
    const t = e.target.closest?.('[data-term]'); if (!t) return;
    const now = Date.now();
    if (last.k === t.dataset.term && now - last.t < 400) { e.stopImmediatePropagation(); e.preventDefault(); last = { k: null, t: 0 }; showTerm(t.dataset.term); return; }
    last = { k: t.dataset.term, t: now };
  }, true);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest?.('[data-term]')) e.preventDefault(); });
}
// キーワードの 札：習わない 漢字には ふりがな（カードの 文章と おなじ）
const kwChip = (k) => {
  const yomi = TERM[KW_TERM[k]]?.yomi;
  return `<span ${KW_TERM[k] ? `data-term="${esc(KW_TERM[k])}"` : ''}>${yomi && /[一-龯]/.test(k) ? ruby(`${k}（${yomi}）`) : esc(k)}</span>`;
};

export const COLOR_NAME = { W: '白', U: '青', K: '黒', G: '緑', R: '赤' };
const KW = {
  flying: '飛行', reach: '到達', haste: '速攻', vigilance: '警戒', first: '先制攻撃', double: '二段攻撃', trample: 'トランプル',
  defender: '防衛', lifelink: '絆魂', deathtouch: '接死', flash: '瞬速', indestructible: '破壊不能', convoke: '召集', prowess: '果敢', evolve: '進化',
  mentor: '教導', training: '訓練', battlecry: '喊声',
};
export const RAR = { C: 'コモン', U: 'アンコモン', R: 'レア', L: 'レジェンド', B: 'きほん' };

export function info(def) {
  const t = CARD_TEXT[def.id] || ENEMY_TEXT[plainName(def.name || '')];
  // textOver・typeOver：もんしょうで かわった きほんカード・もんしょうの カード（data/cards.js の boostBasic・SUN_RING）
  return {
    name: t?.name || def.name, type: def.typeOver || t?.type || (def.types || []).join('・'), text: def.textOver || (t?.text && t.text !== '−' ? t.text : ''), motif: t?.motif || '',
    math: t?.math || '', reward: t?.reward || '',
  };
}

export function colorClass(def, enemy = false) {
  if (enemy) return 'c-E';
  const c = colorsOf(def);
  if (c.length === 3) return `c-gold c-tri ca-${c[0]} cb-${c[1]} cc-${c[2]}`;
  if (c.length === 2) return `c-gold c-${c[0]}${c[1]} ca-${c[0]} cb-${c[1]}`;
  return c.length ? `c-${c[0]}` : 'c-C';
}

// カードの ならべかた（デッキ構築・やまふだ・ぼち）：色（白・青・緑・赤・2色・無色）→ コスト → ID。きほんカードは さいご
const COLOR_ORDER = ['W', 'U', 'K', 'R', 'G'];
const colorKey = (d) => { const c = colorsOf(d); return c.length === 0 ? 9 : c.length >= 2 ? 5 + c.length + COLOR_ORDER.indexOf(c[0]) / 10 : COLOR_ORDER.indexOf(c[0]); };
export const byColorCost = (a, b) => !!a.basic - !!b.basic || colorKey(a) - colorKey(b) || (a.cost ?? 0) - (b.cost ?? 0) || String(a.id ?? a.name).localeCompare(String(b.id ?? b.name));

// もとの P/T。数で ない もの（ダクソスの タフネス＝白の パーマネントの 数 など）は ＊
const basePT = (def) => [def.pow, def.tou].map((v) => (typeof v === 'number' ? v : '＊')).join('/');

const costLabel = (def) => (def.x ? `${def.xMul > 1 ? def.xMul : ''}X+${def.cost}` : String(def.cost ?? 0));

// 手札・プールのカード（def だけ）
export function cardFace(def, o = {}) {
  const i = info(def);
  const pts = def.types?.includes('creature') ? basePT(def) : '';
  const kws = (def.kw || []).map((k) => KW[k]).filter(Boolean);
  return `<div class="card ${colorClass(def, o.enemy)} ${o.cls || ''}" data-id="${esc(o.dataId ?? '')}">
    <div class="card-top"><span class="cost">${esc(costLabel(def))}</span>${pipsOf(def)}<span class="rar r-${def.rar}">${def.rar && def.rar !== 'B' ? def.rar : ''}</span></div>
    <div class="card-name">${ruby(i.name)}</div>
    <div class="card-kw">${kws.slice(0, 3).map(kwChip).join('')}</div>
    ${pts ? `<div class="card-pt">${pts}</div>` : def.loyalty ? `<div class="card-pt loy" title="ちゅうせい">◆${def.loyalty}</div>` : `<div class="card-type">${esc(typeShort(def))}</div>`}
  </div>`;
}

// 色の マーク（MTG の マナ記号の ように）：白＝太陽・青＝しずく・黒＝月・緑＝木・赤＝ほのお・無色＝ひし形
const EMBLEM = {
  W: '<circle cx="12" cy="12" r="5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  U: '<path d="M12 2.5C9 7 6 10.5 6 14.5a6 6 0 0 0 12 0C18 10.5 15 7 12 2.5z"/>',
  K: '<path d="M15.5 2.5a9.5 9.5 0 1 0 6 16.8A8 8 0 0 1 15.5 2.5z"/>',
  G: '<path d="M12 2a6 6 0 0 0-5.6 8.2A5 5 0 0 0 9 19.5h2V22h2v-2.5h2a5 5 0 0 0 2.6-9.3A6 6 0 0 0 12 2z"/>',
  R: '<path d="M13 2c.5 3.5-2 5-3.5 7S7 12.5 7 15a5 5 0 0 0 10 0c0-2-1-3.5-2-4.5.2 1.6-.4 2.7-1.4 3.2.6-3.4-.2-7.6-.6-11.7z"/>',
  C: '<path d="M12 2l8 10-8 10-8-10z"/>',
};
const emblem = (c) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${EMBLEM[c]}</svg>`;
// 2色・3色の カードは、色の まるを ならべて 何色か わかるように する（旗は その 3色）
const pipsOf = (def) => { const cs = def.banner ? [...def.banner] : colorsOf(def); return cs.length > 1 ? `<span class="card-pips" aria-label="${cs.map((c) => COLOR_NAME[c]).join('・')}">${cs.map((c) => `<i class="m-${c}"></i>`).join('')}</span>` : ''; };

// 本物の カードの ような 大きい 表（パックを あけた とき）：名前・コスト・絵の わく・タイプ・文・算数・P/T
// 文が 長い カードは 字を 小さく する（それでも 入らなければ 文の ところだけ スクロール）
export function fullCard(def) {
  const i = info(def);
  const cs = colorsOf(def);
  const len = noRuby(i.text).replace(/\*/g, '').length;
  const size = len > 105 ? 'xs' : len > 70 ? 's' : len > 40 ? 'm' : 'l';
  const pts = def.types?.includes('creature') ? basePT(def) : '';
  return `<div class="fcard ${colorClass(def)}">
    <div class="fc-head"><span class="fc-name">${ruby(i.name)}</span><span class="cost">${esc(costLabel(def))}</span></div>
    <div class="fc-art">${cs.length > 1 ? cs.map((c) => `<span class="emb m-${c}">${emblem(c)}</span>`).join('') : (cs.length ? cs : ['C']).map(emblem).join('')}</div>
    <div class="fc-type"><span>${ruby(i.type)}</span><span class="fc-rar r-${def.rar}">${esc(def.rar || '')}</span></div>
    <div class="fc-text ${size}">
      <p>${richText(i.text) || '（とくべつな のうりょくは ない）'}</p>
      ${i.reward && i.reward !== '−' ? `<p>${richText('えいゆうのほうしゅう')}：${richText(i.reward)}</p>` : ''}
      ${i.math && i.math !== '−' ? `<p class="fc-math">算数：${ruby(i.math.replace(/\*\*/g, ''))}</p>` : ''}
    </div>
    <div class="fc-foot"><small>${esc(RAR[def.rar] || '')}${i.motif && i.motif !== '−' ? ` ・ ${esc(i.motif)}` : ''}</small>${pts ? `<b class="fc-pt">${pts}</b>` : ''}</div>
  </div>`;
}

const typeShort = (def) => {
  const t = def.types || [];
  if (t.includes('instant')) return 'インスタント';
  if (t.includes('sorcery')) return 'ソーサリー';
  if (t.includes('enchantment')) return 'エンチャント';
  if (t.includes('artifact')) return 'アーティファクト';
  return '';
};

// からくり時計の 文字盤（はりは 時の 数）
const clockFace = (h) => {
  const at = (n, r) => [Math.sin((n * Math.PI) / 6) * r, -Math.cos((n * Math.PI) / 6) * r].map((v) => v.toFixed(2));
  const ticks = Array.from({ length: 12 }, (_, i) => { const [x1, y1] = at(i + 1, 7.2), [x2, y2] = at(i + 1, 8.6); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${i === 11 ? ' class="top"' : ''}/>`; }).join('');
  const [hx, hy] = at(h, 5.6);
  return `<svg class="clock-face" viewBox="-10 -10 20 20" aria-hidden="true"><circle r="9.3"/>${ticks}<text y="-3.4">12</text><line class="hand" x1="0" y1="0" x2="${hx}" y2="${hy}"/><circle class="pin" r="0.9"/></svg>`;
};

// 戦場のパーマネント
export function permFace(s, p, o = {}) {
  const enemy = p.side === 'E';
  const i = info(p.def);
  let ptHtml = '';
  if (isCreature(p)) {
    const [P, T] = pt(s, p);
    const left = T - p.dmg;
    ptHtml = `<div class="card-pt ${p.dmg ? 'hurt' : ''}">${P}/${left}${p.dmg ? `<small>/${T}</small>` : ''}</div>`;
  } else if (p.def.loyalty) ptHtml = `<div class="card-pt loy" title="ちゅうせい">◆${p.loy}</div>`; // プレインズウォーカーの ちゅうせい
  else if (p.def.factory) ptHtml = `<div class="card-pt key">かぎ ${s.E.key}</div>`;
  else if (p.def.clock) ptHtml = `${clockFace(s.E.hour)}<div class="card-pt key">${s.E.hour}時</div>`;
  else ptHtml = `<div class="card-type">${esc(typeShort(p.def))}</div>`;
  if (p.def.medusa) ptHtml = `<div class="card-pt key">ライフ ${s.E.life}</div>`;
  const kws = Object.keys(KW).filter((k) => hasKw(s, p, k) && k !== 'convoke').map((k) => KW[k]);
  const head = p.def.headDmg ? `<span class="cost dmg">${p.def.headDmg}</span>` : (enemy ? '' : `<span class="cost">${esc(costLabel(p.def))}</span>`);
  const badges = [
    p.ctr ? `<span class="b ctr">+${p.ctr}</span>` : '',
    p.def.levels ? `<span class="b lv">Lv${p.level}</span>` : '',
    p.def.saga ? `<span class="b lore">${['', 'I', 'II', 'III'][p.lore] || ''}/${['', 'I', 'II', 'III'][p.def.saga.length]}</span>` : '',
    p.def.vanishing ? `<span class="b time">じかん ${p.time || 0}</span>` : '',
    p.marks ? `<span class="b mark">しるし ${p.marks}</span>` : '',
    p.def.hellbent && !(s[p.side].hand || [1]).length ? '<span class="b hell">ぼうゆう</span>' : '',
    p.tapped ? '<span class="b tap">タップ</span>' : '',
    p.sick && !enemy && isCreature(p) && !hasKw(s, p, 'haste') ? '<span class="b zz">zz</span>' : '',
    p.frozen ? '<span class="b ice">こおり</span>' : '',
    p.stone ? '<span class="b stone">石</span>' : '',
    p.def.dragon && !s.E.flags.awake ? '<span class="b zz">ねている</span>' : '',
    p.token ? '<span class="b tok">トークン</span>' : '',
  ].join('');
  return `<button type="button" class="card perm ${colorClass(p.def, enemy)} ${p.tapped ? 'tapped' : ''} ${o.cls || ''}" data-uid="${p.uid}" data-card="${esc(p.def.id || '')}">
    <div class="card-top">${head}<span class="badges">${badges}</span></div>
    <div class="card-name">${ruby(i.name)}</div>
    <div class="card-kw">${kws.slice(0, 3).map(kwChip).join('')}</div>
    ${ptHtml}
    ${o.label ? `<div class="card-label ${o.label[0] === '!' ? 'warn' : ''}">${ruby(o.label.replace(/^!/, ''))}</div>` : ''}
  </button>`;
}

// カードの説明（シートの中身）
// せつめいの 色：色の まると 名前（むしょく・旗の 3色も）
function colorRow(def) {
  const cs = colorsOf(def);
  const chip = (c, name) => `<span class="dc"><i class="m-${c}"></i>${name}</span>`;
  const chips = cs.length ? cs.map((c) => chip(c, COLOR_NAME[c])).join('') : chip('C', 'むしょく');
  const flag = def.banner ? `<span class="dc-note">はたが あれば ${[...def.banner].map((c) => COLOR_NAME[c]).join('・')}の 3色デッキに できる</span>` : '';
  return `<p class="detail-colors"><span class="dc-label">色</span>${chips}${flag}</p>`;
}

export function detail(def, o = {}) {
  const i = info(def);
  const enemy = o.enemy;
  const pts = def.types?.includes('creature') ? `<span class="pt-big">${basePT(def)}</span>` : '';
  return `<div class="detail ${colorClass(def, enemy)}">
    <div class="detail-head">
      <h2>${ruby(i.name)}</h2>
      ${enemy ? '' : `<span class="cost big">${esc(costLabel(def))}</span>`}
    </div>
    ${enemy ? '' : colorRow(def)}
    <div class="detail-type">${richText(i.type)} ${pts}</div>
    <p class="detail-text">${richText(i.text) || '（とくべつなのうりょくはない）'}</p>
    ${i.reward && i.reward !== '−' ? `<p class="detail-sub">${richText('えいゆうのほうしゅう')}：${richText(i.reward)}</p>` : ''}
    ${i.math && i.math !== '−' ? `<p class="detail-sub">算数：${ruby(i.math)}</p>` : ''}
    <p class="detail-meta">${def.rar ? esc(RAR[def.rar] || '') : ''}${i.motif && i.motif !== '−' ? `　元のカード：${esc(i.motif)}` : ''}</p>
    <p class="detail-hint">点線の ことばは 長おし か 2回タップで せつめいが 出るよ</p>
  </div>`;
}

// 画面の 下に 少しだけ 出る おしらせ
export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 1600);
}

// ---- 下から出るシート（選択肢を待つ） ----
const root = () => document.getElementById('sheet');
// シートは1つずつ。開いている間に来たものは順番待ち
let queue = Promise.resolve();
function enqueue(fn) {
  const p = queue.then(fn);
  queue = p.catch(() => {});
  return p;
}
export const sheet = (html, choices = [], o = {}) => enqueue(() => openSheet(html, choices, o));

// いくつか えらぶ（min〜max）。items = [{ label, value }]。やめたら null
export function pickMany(title, items, { min = 1, max = 1, note = '' } = {}) {
  return enqueue(() => new Promise((resolve) => {
    const el = root();
    const sel = new Set();
    const draw = () => {
      const ok = sel.size >= min && sel.size <= max;
      el.innerHTML = `<div class="sheet-back"></div><div class="sheet-body ${el.innerHTML ? 'still' : ''}" role="dialog" aria-modal="true">
        <h3 class="sheet-title">${title}</h3>
        <p class="pick-note">${note || (max > 1 ? `${max}つまで えらべる` : '')}</p>
        <div class="pick-list">${items.map((it, k) => `<button type="button" class="pick ${sel.has(k) ? 'on' : ''}" data-k="${k}" aria-pressed="${sel.has(k)}">${it.label}</button>`).join('')}</div>
        <div class="sheet-actions"><button type="button" class="btn primary" data-ok="1" ${ok ? '' : 'disabled'}>けってい（${sel.size}）</button><button type="button" class="btn" data-no="1">やめる</button></div>
      </div>`;
    };
    draw();
    el.hidden = false;
    const done = (v) => { el.hidden = true; el.innerHTML = ''; el.onclick = null; resolve(v); };
    el.onclick = (e) => {
      // 前のシートを とじた タップが ここまで 届いても むしする
      if (!el.contains(e.target)) return;
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.no) return done(null);
      if (b.dataset.ok) return done([...sel].map((k) => items[k].value));
      const k = +b.dataset.k;
      if (sel.has(k)) sel.delete(k);
      else if (max === 1) { sel.clear(); sel.add(k); }
      else if (sel.size < max) sel.add(k);
      draw();
    };
  }));
}

// 割り振る：n を えらんだ相手に（それぞれ1以上）
export function divideSheet(title, n, items) {
  return enqueue(() => new Promise((resolve) => {
    const el = root();
    const v = items.map(() => Math.floor(n / items.length));
    for (let i = 0; i < n % items.length; i++) v[i]++;
    const draw = () => {
      const left = n - v.reduce((t, x) => t + x, 0);
      el.innerHTML = `<div class="sheet-back"></div><div class="sheet-body ${el.innerHTML ? 'still' : ''}" role="dialog" aria-modal="true">
        <h3 class="sheet-title">${title}</h3>
        <p class="div-sum">${v.join(' ＋ ')} ＝ ${n - left}<span>（のこり ${left}）</span></p>
        <div class="div-list">${items.map((it, k) => `<div class="div-row"><span>${it.label}</span>
          <button type="button" class="step" data-k="${k}" data-d="-1" ${v[k] <= 1 ? 'disabled' : ''} aria-label="へらす">−</button><b>${v[k]}</b>
          <button type="button" class="step" data-k="${k}" data-d="1" ${left <= 0 ? 'disabled' : ''} aria-label="ふやす">＋</button></div>`).join('')}</div>
        <div class="sheet-actions"><button type="button" class="btn primary" data-ok="1" ${left === 0 ? '' : 'disabled'}>けってい</button></div>
      </div>`;
    };
    draw();
    el.hidden = false;
    el.onclick = (e) => {
      if (!el.contains(e.target)) return;
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.ok) { el.hidden = true; el.innerHTML = ''; el.onclick = null; return resolve(items.map((it, k) => ({ t: it.value, n: v[k] }))); }
      v[+b.dataset.k] += +b.dataset.d; draw();
    };
  }));
}
function openSheet(html, choices, o) {
  return new Promise((resolve) => {
    const el = root();
    el.innerHTML = `<div class="sheet-back"></div><div class="sheet-body" role="dialog" aria-modal="true">
      ${o.title ? `<h3 class="sheet-title">${o.title}</h3>` : ''}
      <div class="sheet-content">${html}</div>
      <div class="sheet-actions">${choices.map((c, k) => `<button type="button" class="btn ${c.kind || ''}" data-k="${k}" ${c.disabled ? 'disabled' : ''}>${c.label}${c.note ? `<small>${c.note}</small>` : ''}</button>`).join('')}</div>
    </div>`;
    el.hidden = false;
    el.onclick = null;
    const done = (v) => { el.hidden = true; el.innerHTML = ''; resolve(v); };
    el.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); done(choices[+b.dataset.k].value); }));
    if (o.dismiss !== false) el.querySelector('.sheet-back').addEventListener('click', () => done(o.dismissValue ?? null));
  });
}

// ---- 数を えらぶ（X など）：−／＋で きめる。やめたら null ----
export function numberSheet(title, { min = 0, max = 9, value = min, note = '' } = {}) {
  return enqueue(() => new Promise((resolve) => {
    const el = root();
    let v = value;
    const draw = () => {
      el.innerHTML = `<div class="sheet-back"></div><div class="sheet-body ${el.innerHTML ? 'still' : ''}" role="dialog" aria-modal="true">
        <h3 class="sheet-title">${title}</h3>
        <p class="pick-note">${ruby(note)}</p>
        <div class="num-row"><button type="button" class="step" data-d="-1" ${v <= min ? 'disabled' : ''} aria-label="へらす">−</button><b class="num-val">${v}</b>
          <button type="button" class="step" data-d="1" ${v >= max ? 'disabled' : ''} aria-label="ふやす">＋</button></div>
        <div class="sheet-actions"><button type="button" class="btn primary" data-ok="1">けってい</button><button type="button" class="btn" data-no="1">やめる</button></div>
      </div>`;
    };
    draw();
    el.hidden = false;
    const done = (r) => { el.hidden = true; el.innerHTML = ''; el.onclick = null; resolve(r); };
    el.onclick = (e) => {
      if (!el.contains(e.target)) return;
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.ok) return done(v);
      if (b.dataset.no) return done(null);
      v = Math.max(min, Math.min(max, v + +b.dataset.d)); draw();
    };
  }));
}
