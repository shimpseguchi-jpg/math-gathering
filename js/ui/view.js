// 画面の部品：カードの見た目・ルビ・下から出るシート・けいさんの問題
import { CARD_TEXT, ENEMY_TEXT, plainName } from '../data/texts.js';
import { colorsOf, pt, hasKw, isCreature } from '../engine/game.js';

export const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// 「漢字（よみ）」をルビにする
export const ruby = (t) => esc(t).replace(/([一-龯々ヶ]+)（([ぁ-ゖー]+)）/g, '<ruby>$1<rt>$2</rt></ruby>').replace(/\n/g, '<br>');
export const noRuby = (t) => String(t ?? '').replace(/（[ぁ-ゖー]+）/g, '');

export const COLOR_NAME = { W: '白', U: '青', G: '緑', R: '赤' };
const KW = {
  flying: '飛行', reach: '到達', haste: '速攻', vigilance: '警戒', first: '先制攻撃', double: '二段攻撃', trample: 'トランプル',
  defender: '防衛', lifelink: '絆魂', deathtouch: '接死', flash: '瞬速', indestructible: '破壊不能', convoke: '召集', prowess: '果敢', evolve: '進化',
};
export const RAR = { C: 'コモン', U: 'アンコモン', R: 'レア', L: 'レジェンド', B: 'きほん' };

export function info(def) {
  const t = CARD_TEXT[def.id] || ENEMY_TEXT[plainName(def.name || '')];
  return {
    name: t?.name || def.name, type: t?.type || (def.types || []).join('・'), text: t?.text && t.text !== '−' ? t.text : '', motif: t?.motif || '',
    math: t?.math || '', reward: t?.reward || '',
  };
}

export function colorClass(def, enemy = false) {
  if (enemy) return 'c-E';
  const c = colorsOf(def);
  if (c.length === 2) return `c-gold c-${c[0]}${c[1]}`;
  return c.length ? `c-${c[0]}` : 'c-C';
}

const costLabel = (def) => (def.x ? `X+${def.cost}` : String(def.cost ?? 0));

// 手札・プールのカード（def だけ）
export function cardFace(def, o = {}) {
  const i = info(def);
  const pts = def.types?.includes('creature') && typeof def.pow === 'number' ? `${def.pow}/${def.tou}` : (def.types?.includes('creature') ? '＊/＊' : '');
  const kws = (def.kw || []).map((k) => KW[k]).filter(Boolean);
  return `<div class="card ${colorClass(def, o.enemy)} ${o.cls || ''}" data-id="${esc(o.dataId ?? '')}">
    <div class="card-top"><span class="cost">${esc(costLabel(def))}</span><span class="rar r-${def.rar}">${def.rar && def.rar !== 'B' ? def.rar : ''}</span></div>
    <div class="card-name">${esc(noRuby(i.name))}</div>
    <div class="card-kw">${kws.slice(0, 3).map((k) => `<span>${esc(k)}</span>`).join('')}</div>
    ${pts ? `<div class="card-pt">${pts}</div>` : `<div class="card-type">${esc(typeShort(def))}</div>`}
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

// 戦場のパーマネント
export function permFace(s, p, o = {}) {
  const enemy = p.side === 'E';
  const i = info(p.def);
  let ptHtml = '';
  if (isCreature(p)) {
    const [P, T] = pt(s, p);
    const left = T - p.dmg;
    ptHtml = `<div class="card-pt ${p.dmg ? 'hurt' : ''}">${P}/${left}${p.dmg ? `<small>/${T}</small>` : ''}</div>`;
  } else if (p.def.factory) ptHtml = `<div class="card-pt key">鍵 ${s.E.key}</div>`;
  else ptHtml = `<div class="card-type">${esc(typeShort(p.def))}</div>`;
  const kws = Object.keys(KW).filter((k) => hasKw(s, p, k) && k !== 'convoke').map((k) => KW[k]);
  const head = p.def.headDmg ? `<span class="cost dmg">${p.def.headDmg}</span>` : (enemy ? '' : `<span class="cost">${esc(costLabel(p.def))}</span>`);
  const badges = [
    p.ctr ? `<span class="b ctr">+${p.ctr}</span>` : '',
    p.tapped ? '<span class="b tap">タップ</span>' : '',
    p.sick && !enemy && isCreature(p) && !hasKw(s, p, 'haste') ? '<span class="b zz">zz</span>' : '',
    p.frozen ? '<span class="b ice">こおり</span>' : '',
    p.token ? '<span class="b tok">トークン</span>' : '',
  ].join('');
  return `<button type="button" class="card perm ${colorClass(p.def, enemy)} ${p.tapped ? 'tapped' : ''} ${o.cls || ''}" data-uid="${p.uid}">
    <div class="card-top">${head}<span class="badges">${badges}</span></div>
    <div class="card-name">${esc(noRuby(i.name))}</div>
    <div class="card-kw">${kws.slice(0, 3).map((k) => `<span>${esc(k)}</span>`).join('')}</div>
    ${ptHtml}
    ${o.label ? `<div class="card-label">${esc(o.label)}</div>` : ''}
  </button>`;
}

// カードの説明（シートの中身）
export function detail(def, o = {}) {
  const i = info(def);
  const enemy = o.enemy;
  const pts = typeof def.pow === 'number' && def.types?.includes('creature') ? `<span class="pt-big">${def.pow}/${def.tou}</span>` : '';
  return `<div class="detail ${colorClass(def, enemy)}">
    <div class="detail-head">
      <h2>${ruby(i.name)}</h2>
      ${enemy ? '' : `<span class="cost big">${esc(costLabel(def))}</span>`}
    </div>
    <div class="detail-type">${ruby(i.type)} ${pts}</div>
    <p class="detail-text">${ruby(i.text) || '（とくべつな能力はない）'}</p>
    ${i.reward && i.reward !== '−' ? `<p class="detail-sub">英雄（えいゆう）の報酬（ほうしゅう）：${ruby(i.reward)}</p>` : ''}
    ${i.math && i.math !== '−' ? `<p class="detail-sub">算数：${ruby(i.math)}</p>` : ''}
    <p class="detail-meta">${def.rar ? esc(RAR[def.rar] || '') : ''}${i.motif && i.motif !== '−' ? `　元のカード：${esc(i.motif)}` : ''}</p>
  </div>`;
}

// ---- 下から出るシート（選択肢を待つ） ----
const root = () => document.getElementById('sheet');
// シートは1つずつ。開いている間に来たものは順番待ち
let queue = Promise.resolve();
export function sheet(html, choices = [], o = {}) {
  const p = queue.then(() => openSheet(html, choices, o));
  queue = p.catch(() => {});
  return p;
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
    const done = (v) => { el.hidden = true; el.innerHTML = ''; resolve(v); };
    el.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => done(choices[+b.dataset.k].value)));
    if (o.dismiss !== false) el.querySelector('.sheet-back').addEventListener('click', () => done(o.dismissValue ?? null));
  });
}

// ---- けいさんの問題（テンキー） ----
export function quiz(q) {
  return new Promise((resolve) => {
    const el = document.getElementById('quiz');
    let input = '';
    const parts = q.text.split('□');
    el.innerHTML = `<div class="quiz-body" role="dialog" aria-modal="true">
      <p class="quiz-tag">けいさんチャレンジ</p>
      <p class="quiz-hint">${ruby(q.hint || '')}</p>
      <p class="quiz-q">${esc(parts[0])}<span class="quiz-box" id="quizBox">？</span>${esc(parts[1] || '')}</p>
      <p class="quiz-reward">せいかいすると：${ruby(q.reward || 'いいことが ある')}</p>
      <div class="pad">${[7, 8, 9, 4, 5, 6, 1, 2, 3].map((n) => `<button type="button" data-n="${n}">${n}</button>`).join('')}
        <button type="button" data-c="del">けす</button><button type="button" data-n="0">0</button><button type="button" data-c="ok" class="ok">こたえる</button></div>
      <button type="button" class="btn ghost" data-c="skip">わからない</button>
      <p class="quiz-result" id="quizRes" aria-live="polite"></p>
    </div>`;
    el.hidden = false;
    const box = el.querySelector('#quizBox');
    let locked = false;
    const finish = (ok, msg) => {
      locked = true;
      el.querySelector('#quizRes').innerHTML = msg;
      el.querySelector('.quiz-body').classList.add(ok ? 'good' : 'bad');
      setTimeout(() => { el.hidden = true; el.innerHTML = ''; resolve(ok); }, ok ? 900 : 1700);
    };
    el.onclick = (e) => {
      const b = e.target.closest('button'); if (!b || locked) return;
      if (b.dataset.n != null) { if (input.length < 3) input += b.dataset.n; }
      else if (b.dataset.c === 'del') input = input.slice(0, -1);
      else if (b.dataset.c === 'skip') return finish(false, `こたえは <b>${q.answer}</b>`);
      else if (b.dataset.c === 'ok' && input) {
        const ok = Number(input) === q.answer;
        return finish(ok, ok ? 'せいかい！ ひらめき！' : `ざんねん。こたえは <b>${q.answer}</b>`);
      }
      box.textContent = input || '？';
    };
  });
}

// 学年べつの「抜き打ちテスト」
export function quizFor(grade) {
  const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  if (grade <= 1) { const a = r(2, 9), b = r(1, 9); return Math.random() < 0.5 || a < b ? { text: `${a} ＋ ${b} ＝ □`, answer: a + b } : { text: `${a} − ${b} ＝ □`, answer: a - b }; }
  if (grade === 2) { const a = r(2, 9), b = r(2, 9); return { text: `${a} × ${b} ＝ □`, answer: a * b }; }
  if (grade === 3) { const b = r(2, 9), a = b * r(2, 9); return { text: `${a} ÷ ${b} ＝ □`, answer: a / b }; }
  if (grade === 4) { const a = r(11, 49), b = r(2, 9); return { text: `${a} × ${b} ＝ □`, answer: a * b }; }
  const a = r(2, 12), b = r(2, 12); return { text: `${a} と ${b} の さいしょうこうばいすう ＝ □`, answer: lcm(a, b) };
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);
