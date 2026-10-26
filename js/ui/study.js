// しゅぎょう（REQUIREMENTS 12章）：60びょうで もんだいを とく。7わりより おおく せいかいで もんしょうポイント（ui/emblem.js）
// たたかいの なかでは もんだいを 出さない（5章）。ここは たたかいの そとの「しゅぎょうの へや」
import { CATS, QUIZ_SECONDS, PASS_MIN, quizSession, passed } from '../data/quiz.js';
import { esc, sheet } from './view.js';
import { addRaidQuiz } from './raidstore.js';

// とけい：みじかい はりが「じ」、ながい はりが「ふん」。めもりは 60こ
export function clockSvg(h, m) {
  const at = (deg, r) => { const a = ((deg - 90) * Math.PI) / 180; return [100 + r * Math.cos(a), 100 + r * Math.sin(a)].map((v) => v.toFixed(1)); };
  const ticks = Array.from({ length: 60 }, (_, i) => { const [x1, y1] = at(i * 6, i % 5 ? 86 : 80), [x2, y2] = at(i * 6, 92); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${i % 5 ? 'tk' : 'tk5'}"/>`; }).join('');
  const nums = Array.from({ length: 12 }, (_, i) => { const [x, y] = at((i + 1) * 30, 68); return `<text x="${x}" y="${y}">${i + 1}</text>`; }).join('');
  const hand = (deg, r, cls) => { const [x, y] = at(deg, r); return `<line x1="100" y1="100" x2="${x}" y2="${y}" class="${cls}"/>`; };
  return `<svg class="qz-clock" viewBox="0 0 200 200" role="img" aria-label="とけい"><circle cx="100" cy="100" r="95" class="face"/>${ticks}${nums}${hand(((h % 12) + m / 60) * 30, 46, 'hh')}${hand(m * 6, 74, 'mh')}<circle cx="100" cy="100" r="6" class="pin"/></svg>`;
}

const secs = (ms) => Math.ceil(ms / 1000); // のこりは「90びょう」の ように びょうで 出す（1ねんせいは ふんと びょうを まだ ならわない）
const pct = (n, ok) => (n ? Math.round((ok / n) * 100) : 0);
// もんだいの 文：［ ］は よむ ところ、□は あな
const marked = (t) => esc(t).replace(/［(.+?)］/g, '<b class="qz-target">$1</b>').replace(/□/g, '<b class="qz-blank">□</b>');

// o = { cats, setCats(cats), record({ n, ok, stat }) → もらった ポイント, back() }
//   ぼうけんの まえ・おわりの しゅぎょう（emblem.js）：say { who, text }（ふきだし）・eyebrow・reward（ポイントの せつめい）・backLabel・doneLabel・noBack（もどる ボタンなし）
export function studyScreen(app, o) {
  let cats = [...o.cats];
  // ---- はじめる まえ：もんだいの しゅるいを えらぶ（学校で ならった ものだけに できる） ----
  const intro = () => {
    app().innerHTML = `<main class="study">
      <p class="eyebrow">${esc(o.eyebrow || 'しゅぎょうの へや')}</p>
      ${o.say ? `<p class="say qz-say"><b>${esc(o.say.who)}</b><span>${esc(o.say.text)}</span></p>` : ''}
      <h2>${QUIZ_SECONDS}びょう しゅぎょう</h2>
      <p class="qz-lead">${QUIZ_SECONDS}びょうで できるだけ たくさん とこう。<b>7わりより おおく</b> せいかいすると ${o.reward || 'もんしょうポイント ＋3（ぜんぶ せいかいなら ＋4）'}。${PASS_MIN}もん いじょう とこう。</p>
      <h3 class="zk-h">もんだいの しゅるい</h3>
      <div class="qz-cats">${Object.entries(CATS).map(([k, c]) => `<button type="button" class="qz-cat ${cats.includes(k) ? 'on' : ''}" data-cat="${k}" aria-pressed="${cats.includes(k)}"><b>${esc(c.name)}</b><small>${esc(c.note)}</small></button>`).join('')}</div>
      <p class="zk-note">まだ ならって いない ものは タップして はずせる。</p>
      <div class="row-btns"><button type="button" class="btn primary" data-start="1" ${cats.length ? '' : 'disabled'}>はじめる</button>${o.noBack ? '' : `<button type="button" class="btn" data-back="1">${esc(o.backLabel || 'もどる')}</button>`}</div>
    </main>`;
    app().onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.back) return (o.quit || o.back)(); // quit：はじめる まえに やめた とき（なければ back）
      if (b.dataset.cat) { const k = b.dataset.cat; cats = cats.includes(k) ? cats.filter((x) => x !== k) : [...cats, k]; o.setCats(cats); return intro(); }
      if (b.dataset.start && cats.length) run();
    };
  };

  // ---- しゅぎょう ----
  const run = () => {
    const next = quizSession(Math.random, cats);
    const end = Date.now() + QUIZ_SECONDS * 1000;
    const stat = {}, miss = [];
    let n = 0, ok = 0, q = null, typed = '', wait = false, over = false;
    app().innerHTML = `<main class="study run">
      <div class="qz-top"><span class="qz-time" aria-live="off">のこり <b>${QUIZ_SECONDS}</b>びょう</span><span class="qz-score">せいかい <b>0</b> / 0</span><button type="button" class="btn ghost qz-quit" data-quit="1">やめる</button></div>
      <div class="qz-bar"><i></i></div>
      <section class="qz-q" aria-live="polite"></section>
      <div class="qz-in"></div>
    </main>`;
    const $ = (sel) => app().querySelector(sel);
    const show = () => {
      const cat = CATS[q.cat].name;
      let body = '';
      if (q.kind === 'num') body = q.text.includes('□') ? `<p class="qz-text">${marked(q.text).replace('<b class="qz-blank">□</b>', '<span class="qz-ans">　</span>')}</p>` : `<p class="qz-text">${esc(q.text)} ＝ <span class="qz-ans">　</span></p>`;
      else if (q.clock) body = `${clockSvg(...q.clock)}<p class="qz-ask">${esc(q.text)}</p>`;
      else body = `<p class="qz-text qz-sent">${marked(q.text)}</p><p class="qz-ask">${marked(q.ask)}</p>`;
      $('.qz-q').innerHTML = `<p class="qz-cat-name">${esc(cat)}</p>${body}<div class="qz-mark" hidden></div>`;
      $('.qz-in').innerHTML = q.kind === 'num'
        ? `<div class="qz-pad">${[7, 8, 9, 4, 5, 6, 1, 2, 3].map((d) => `<button type="button" data-d="${d}">${d}</button>`).join('')}<button type="button" data-del="1" class="sub">けす</button><button type="button" data-d="0">0</button><button type="button" data-ok="1" class="go">こたえる</button></div>`
        : `<div class="qz-choices ${q.choices.length === 2 ? 'two' : ''}">${q.choices.map((c, i) => `<button type="button" data-c="${i}">${esc(c)}</button>`).join('')}</div>`;
      typed = '';
    };
    const ask = () => { q = next(); show(); };
    const tick = () => {
      const left = Math.max(0, end - Date.now());
      const t = $('.qz-time b'); if (!t) return;
      t.textContent = secs(left);
      $('.qz-bar i').style.width = `${(left / (QUIZ_SECONDS * 1000)) * 100}%`;
      $('.qz-time').classList.toggle('low', left <= 10000);
      if (left <= 0 && !wait) finish();
    };
    const answer = (given) => {
      if (wait || over) return;
      const right = String(given) === String(q.answer);
      n++; if (right) ok++;
      const st = stat[q.cat] || (stat[q.cat] = [0, 0]); st[0]++; if (right) st[1]++;
      if (!right) miss.push({ q, given });
      $('.qz-score').innerHTML = `せいかい <b>${ok}</b> / ${n}`;
      const mk = $('.qz-mark');
      mk.hidden = false; mk.className = `qz-mark ${right ? 'good' : 'bad'}`;
      mk.innerHTML = right ? '<b>○</b>せいかい！' : `<b>×</b>こたえは <em>${esc(q.answer)}</em>`;
      wait = true;
      setTimeout(() => { wait = false; if (over) return; if (Date.now() >= end) finish(); else ask(); }, right ? 550 : 1300);
    };
    const typedShow = () => { const a = $('.qz-ans'); if (a) a.textContent = typed || '　'; };
    const key = (e) => {
      if (over || !q) return;
      if (q.kind === 'num') {
        if (/^\d$/.test(e.key) && typed.length < 2) { typed += e.key; typedShow(); }
        else if (e.key === 'Backspace') { typed = typed.slice(0, -1); typedShow(); }
        else if (e.key === 'Enter' && typed) answer(+typed);
      } else if (/^[1-4]$/.test(e.key) && q.choices[+e.key - 1]) answer(q.choices[+e.key - 1]);
    };
    const stop = () => { over = true; clearInterval(iv); document.removeEventListener('keydown', key); };
    const finish = () => { if (over) return; stop(); result({ n, ok, stat, miss }); };
    app().onclick = async (e) => {
      const b = e.target.closest('button'); if (!b || over) return;
      if (b.dataset.quit) {
        const v = await sheet('<p>やめると ポイントは もらえない。</p>', [{ label: 'つづける', value: 0, kind: 'primary' }, { label: 'やめる', value: 1 }], { title: 'しゅぎょうを やめる？' });
        if (v && !over) { stop(); o.back(); }
        return;
      }
      if (wait) return;
      if (b.dataset.d != null && typed.length < 2) { typed += b.dataset.d; typedShow(); }
      if (b.dataset.del) { typed = typed.slice(0, -1); typedShow(); }
      if (b.dataset.ok && typed) answer(+typed);
      if (b.dataset.c != null) answer(q.choices[+b.dataset.c]);
    };
    document.addEventListener('keydown', key);
    const iv = setInterval(tick, 250);
    ask();
  };

  // ---- けっか ----
  const result = (r) => {
    const gain = o.record(r);
    addRaidQuiz(r.ok); // レイドに 参加中なら、せいかいの 数が 陣営の 点に なる
    const pass = passed(r.n, r.ok);
    const need = Math.floor((7 * r.n) / 10) + 1; // 7わりより おおく
    app().innerHTML = `<main class="study done">
      <p class="eyebrow">しゅぎょう おしまい</p>
      <h2>${pass ? 'ごうかく！' : r.n < PASS_MIN ? 'もう すこし とこう' : 'あと すこし！'}</h2>
      <p class="qz-result"><b>${r.ok}</b> / ${r.n}もん せいかい<small>（${pct(r.n, r.ok)}%）</small></p>
      <p class="zk-note">ごうかく：${PASS_MIN}もん いじょう といて、7わりより おおく せいかい（${r.n}もんなら ${Math.max(need, PASS_MIN)}もん いじょう）</p>
      ${gain ? `<p class="qz-gain">もんしょうポイント <b>＋${gain}</b>${r.bonus ? `<small>ボーナス ＋${r.bonus} こみ</small>` : r.n === r.ok && gain > 3 ? '<small>ぜんぶ せいかい！</small>' : ''}</p>` : ''}
      <ul class="qz-break">${Object.entries(r.stat).map(([k, [a, b]]) => `<li><span>${esc(CATS[k].name)}</span><b>${b} / ${a}</b></li>`).join('')}</ul>
      ${r.miss.length ? `<h3 class="zk-h">まちがえた もんだい</h3><ul class="qz-miss">${r.miss.map(({ q, given }) => `<li>${q.clock ? `とけい（${esc(q.answer)}）` : q.kind === 'num' ? esc(q.text.includes('□') ? q.text.replace('□', `［${q.answer}］`) : `${q.text} ＝ ${q.answer}`) : marked(q.text.replace('□', `［${q.answer}］`))}<small>こたえ：${esc(q.answer)}・あなた：${esc(given)}</small></li>`).join('')}</ul>` : ''}
      <div class="row-btns"><button type="button" class="btn primary" data-back="1">${esc(o.doneLabel || (gain ? 'もんしょうを えらぶ' : 'もどる'))}</button>${o.noAgain ? '' : '<button type="button" class="btn" data-again="1">もう いちど</button>'}</div>
    </main>`;
    app().onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.back) return o.back();
      if (b.dataset.again) return run();
    };
  };

  intro();
}
