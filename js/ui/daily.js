// きょうの ぼうけんの 画面（2026-11-11。docs/DAILY.md）：みんな おなじ 条件（おなじ パック・おなじ てき・きょうの ルール）で 1日 1回。
// けっか（のぼった 階・ぴったり・ターン）を この 端末に のこし、サーバーが あれば クラスの みんなの けっかと くらべる（ぼうグラフ）
import { dailyOf, dateStr, dateLabel, DAILY_RULE } from '../data/daily.js';
import { hasServer, call } from './server.js';
import { nameOf } from './online.js';
import { ruby, esc } from './view.js';
import { addEmblemPoints } from './emblem.js';
import { unlockAll } from './settings.js';

const KEY = 'mtg-daily';
// hist：{ 日づけ: { f: のぼった 階, e: ぴったり, t: ターン, win, rule } }、gid：端末の 番号（サーバーで 1人 1回を かぞえる）
const load = () => { try { return { hist: {}, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { hist: {} }; } };
const save = (S) => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 保存できなくても あそべる */ } };
const hex12 = () => Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const gid = () => { const S = load(); if (!S.gid) { S.gid = hex12(); save(S); } return S.gid; };
const myName = () => { try { return JSON.parse(localStorage.getItem('mtg-online-v1') || 'null')?.name || [0, 0]; } catch { return [0, 0]; } };

export const DAILY_REWARD = 1; // さんかの ごほうび（もんしょうポイント）
export const dailyDone = (date = dateStr()) => !!load().hist[date];
const FLOORS = 5;
const floorText = (f) => (f >= FLOORS ? 'とうを のぼりきった' : f > 0 ? `${f}階まで クリア` : '1階で ちからつきた');

// みんなの けっか（ぼうグラフ）：上が 5階。じぶんの いる 段に しるし
function boardHtml(b, mine) {
  if (!b) return `<p class="st-note">${ruby(hasServer() ? 'みんなの けっかを よみこめなかった。' : 'ここでは みんなの けっかは 見られない（学校の ページで ひらくと くらべられる）。')}</p>`;
  if (!b.n) return '<p class="st-note">まだ だれも おわって いない。いちばんのり！</p>';
  const max = Math.max(1, ...b.hist);
  const rows = b.hist.map((c, f) => ({ c, f })).reverse().map(({ c, f }) => `<li class="${mine && mine.f === f ? 'me' : ''}"><span class="dy-l">${f >= FLOORS ? 'クリア' : `${f}階`}</span><span class="dy-bar"><i style="width:${Math.round((c / max) * 100)}%"></i></span><b>${c}<small>人</small></b></li>`).join('');
  const top = b.top.slice(0, 10).map((x, i) => `<li class="${x.me ? 'me' : ''}"><b>${i + 1}</b><span>${esc(nameOf(x.n))}${x.me ? '（じぶん）' : ''}</span><em>${x.f >= FLOORS ? 'クリア' : `${x.f}階`}・ぴったり ${x.e}・${x.t}ターン</em></li>`).join('');
  return `<p class="dy-count">${ruby(`おわった 人：${b.n}人${b.rank ? `　じぶんは ${b.rank}ばんめ` : ''}`)}</p>
    <p class="st-note">のぼった 階ごとの 人数（ぼうグラフ）</p>
    <ol class="dy-hist" aria-label="のぼった 階ごとの 人数">${rows}</ol>
    <p class="st-note">${ruby('じゅんばん：のぼった 階が 多い → ぴったりが 多い → ターンが 少ない')}</p>
    <ol class="dy-top">${top}</ol>`;
}
const fetchBoard = async (date) => { if (!hasServer()) return null; try { return await call('mtgDailyBoard', { d: date, g: gid() }, 15000, true); } catch { return null; } };

function histHtml(S, today) {
  const days = Object.keys(S.hist).filter((d) => d !== today).sort().reverse().slice(0, 7);
  if (!days.length) return '';
  return `<section class="st-ch"><h3><span class="st-cname">これまでの きろく</span></h3><ol class="dy-past">${days.map((d) => { const r = S.hist[d]; return `<li><b>${dateLabel(d)}</b><span>${ruby(DAILY_RULE[r.rule]?.name || '')}</span><em>${r.f >= FLOORS ? 'クリア' : `${r.f}階`}・ぴったり ${r.e}</em></li>`; }).join('')}</ol></section>`;
}
const resultCard = (r) => `<dl class="stats dy-stats"><div><dt>のぼった 階</dt><dd>${r.f}<small>/${FLOORS}</small></dd></div><div><dt>ぴったり</dt><dd>${r.e}<small>回</small></dd></div><div><dt>ターン</dt><dd>${r.t}</dd></div></dl>`;

// hooks：{ running：とちゅうの ぼうけんが ある, start(d), resume() }（app.js）
export function dailyMenu(app, back, hooks) {
  const S = load(), d = dailyOf(), mine = S.hist[d.date];
  const again = unlockAll(); // デバッグ（ぜんぶ あそべる）：なんどでも
  app().innerHTML = `<main class="story daily">
    <p class="eyebrow">きょうの ぼうけん　${dateLabel(d.date)}</p>
    <h2>${ruby(d.rule.name)}</h2>
    <p class="dy-rule">${ruby(d.rule.text)}</p>
    <ul class="dy-cond">
      <li>${ruby('テーロスの とう（ふつう）を 1回だけ。コンティニューは なし')}</li>
      <li>${ruby('さいしょの パック 3つと、出て くる てきは みんな おなじ')}</li>
      <li>${ruby('もんしょうは つかわない（きょうの ルールだけ）')}</li>
    </ul>
    ${mine ? `<section class="st-ch"><h3><span class="st-cname">きょうの けっか：${floorText(mine.f)}</span></h3>${resultCard(mine)}<p class="st-note">また あした、あたらしい ルールで あそべる。</p></section>` : ''}
    <div class="row-btns">
      ${hooks.running ? '<button type="button" class="btn primary" data-dy="resume">つづきから</button>' : !mine || again ? `<button type="button" class="btn primary" data-dy="start">ちょうせんする${mine ? '（デバッグ）' : `<small>もんしょうポイント ＋${DAILY_REWARD}</small>`}</button>` : ''}
      <button type="button" class="btn" data-dy="back">タイトルへ</button>
    </div>
    <section class="st-ch"><h3><span class="st-cname">みんなの けっか</span></h3><div id="dy-board"><p class="st-note">${hasServer() ? 'よみこみちゅう…' : ruby('ここでは みんなの けっかは 見られない（学校の ページで ひらくと くらべられる）。')}</p></div></section>
    ${histHtml(S, d.date)}
  </main>`;
  app().onclick = (e) => {
    const b = e.target.closest('[data-dy]'); if (!b) return;
    if (b.dataset.dy === 'back') return back();
    if (b.dataset.dy === 'resume') return hooks.resume();
    if (b.dataset.dy === 'start') return hooks.start(d);
  };
  if (hasServer()) fetchBoard(d.date).then((b) => { const el = document.getElementById('dy-board'); if (el) el.innerHTML = boardHtml(b, mine); });
}

// ぼうけんの おわり（app.js の ending から）。res：{ date, rule, f, e, t, win }
export async function dailyResult(app, back, res, o = {}) {
  const S = load();
  const first = !S.hist[res.date];
  if (first) { S.hist[res.date] = { f: res.f, e: res.e, t: res.t, win: !!res.win, rule: res.rule }; save(S); addEmblemPoints(DAILY_REWARD); }
  const mine = S.hist[res.date];
  const rule = DAILY_RULE[res.rule];
  app().innerHTML = `<main class="ending ${res.win ? 'win' : 'lose'} daily">
    <p class="eyebrow">きょうの ぼうけん　${dateLabel(res.date)}　${ruby(rule?.name || '')}</p>
    <h2>${floorText(res.f)}</h2>
    ${resultCard({ f: res.f, e: res.e, t: res.t })}
    ${first ? `<p class="what">${ruby(`さんかの ごほうび：もんしょうポイント ＋${DAILY_REWARD}`)}</p>` : `<p class="what">${ruby('きょうの きろくは 1回め の もの が のこる。')}</p>`}
    ${o.tickets ? `<p class="what tk-get"><b>パックけん ＋${o.tickets}まい</b><span>タイトルの「こうちく」の ショップで パックと ひきかえられる</span></p>` : ''}
    <section class="st-ch"><h3><span class="st-cname">みんなの けっか</span></h3><div id="dy-board"><p class="st-note">${hasServer() ? 'おくって いる…' : ruby('ここでは みんなの けっかは 見られない（学校の ページで ひらくと くらべられる）。')}</p></div></section>
    <div class="row-btns"><button type="button" class="btn primary" data-dy="back">タイトルへ</button></div>
  </main>`;
  app().onclick = (e) => { if (e.target.closest('[data-dy="back"]')) back(); };
  if (!hasServer()) return;
  let b = null;
  try { b = first ? await call('mtgDailySubmit', { d: res.date, f: mine.f, e: mine.e, t: mine.t, n: myName(), g: gid() }, 15000, true) : await fetchBoard(res.date); } catch { b = null; }
  const el = document.getElementById('dy-board'); if (el) el.innerHTML = boardHtml(b, mine);
}
