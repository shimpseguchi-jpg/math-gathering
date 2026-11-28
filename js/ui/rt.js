// リアルタイムたいせん：あいことば（4けたの すうじ）の へやで、ともだちと その場で かわりばんこに たたかう（docs/REALTIME_PVP.md）
// サーバーは GAS（gas/Code.gs の mtgRt…）だけ。WebSocket が ないので、たいせん中は 2秒ごと・まちあいは 3秒ごとに mtgRtSync を よぶ
// おくるのは「そうさの きろく（どこを タップして、まどで なにを えらんだか）＋ 通し番号」だけ。場の ようすは おくらない。
// ふたりの 画面が おなじ 乱数の たねと おなじ そうさで おなじ ルールを うごかすので、場は おなじに なる（battle.js の rtDo・rtApply）
// サーバーが ない とき（GitHub Pages など）は「GASばんで あそべる」と 出して、ゴーストたいせん（れんしゅう）へ あんないする
import { BY_ID } from '../data/cards.js';
import { SAMPLE, sampleIds } from '../data/samples.js';
import { pvp } from '../data/enemies.js';
import { colorsOf } from '../engine/game.js';
import { startBattle, rtCtl } from './battle.js';
import { sheet, esc, ruby, toast } from './view.js';
import { hasServer, call } from './server.js';
import { NAME_A, NAME_B, nameOf, POINTS, olState, olSave, deckTitle, pairName, addPoints, onlineMenu } from './online.js';
import { onBattle, onOnline } from './trophies.js';

export const RT = { POLL_PLAY: 2000, POLL_WAIT: 3000, FAILS: 5, AWAY_SHOW: 8000, AWAY_WIN: 45000, CALL_MS: 8000 };
const KEY = 'mtg-rt-v1'; // リアルタイムたいせんの かちまけ（あたらしい キー。mtg-online-v1 の 形は かえない）
const loadRec = () => { try { return { w: 0, l: 0, d: 0, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { w: 0, l: 0, d: 0 }; } };
const saveRec = (r) => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* 保存できなくても あそべる */ } };
const pairOf = (ids) => [...new Set(ids.flatMap((id) => (BY_ID[id] ? colorsOf(BY_ID[id]) : [])))].join('');
const mmss = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const errText = (e) => { const t = String(e?.message || e || '').replace(/^Error:\s*/, ''); return /mtgRt|not found|見つかりません/i.test(t) ? 'サーバー（Code.gs）が ふるい。先生（せんせい）に しらせてね' : t || 'つながらなかった'; };
const rpc = (fn, arg, quiet = true) => call(fn, arg, RT.CALL_MS, quiet);

let LIVE = null; // いまの まちあい・たいせん（画面を はなれたら とめる）
function stopLive() { if (LIVE) { LIVE.stop(); LIVE = null; } }
// ブラウザを とじる とき：できれば「こうさん」を おくる（とどかない ことも ある。そのときは あいてが 45秒 まって かちに なる）
let hooked = false;
function hookLeave() {
  if (hooked) return; hooked = true;
  window.addEventListener('pagehide', () => { if (LIVE?.room && !LIVE.over) { try { call('mtgRtEnd', { c: LIVE.room.c, k: LIVE.room.k, why: LIVE.playing ? 'resign' : 'cancel' }, 3000, true).catch(() => {}); } catch { /* もう おくれない */ } } });
}

// えらべる デッキ：ほかんした デッキ（ぼうけんで くんだ もの）と、スターターデッキ（だれでも すぐ つかえる）
function deckList(o) {
  return [
    ...o.decks.map((x) => ({ label: `${deckTitle(x)}　${x.s || 0}点`, sub: `ほかんした デッキ・${x.date}`, d: x.d, id: x.id || '', rec: x })),
    ...Object.keys(SAMPLE).map((k) => ({ label: `スターター：${pairName(k)}`, sub: 'だれでも つかえる デッキ（点は つかない）', d: sampleIds(k), id: '', rec: null })),
  ];
}

// ---- メニュー ----
// opt.pb：パック＆バトルから ひらいた とき（js/ui/packbattle.js。docs/REALTIME_PVP.md 8章）。
//   { deck: { label, sub, d: [カードID×20] }, problems: [デッキが くめて いない わけ…], solo: 1ファイル版か }
//   つかう デッキは パック＆バトルの「つかう デッキ」1つ だけ。ゴーストたいせんへの 入口は 出さない。点・トロフィーは つかない（かちまけの 数 だけ）
export function rtMenu(app, back, opt = {}) {
  stopLive(); hookLeave();
  const PBM = opt.pb || null;
  const o = olState();
  const decks = PBM ? [{ label: PBM.deck.label, sub: PBM.deck.sub, d: PBM.deck.d, id: '', rec: null, pb: true }] : deckList(o);
  let pick = 0, msg = '';
  const me = () => rtMenu(app, back, opt);
  if (PBM && !hasServer()) { // サーバーが ない（1ファイル版を そのまま ひらいた・WEBばん）：あそべない わけを 出す
    app().innerHTML = `<main class="online rt">
      <p class="eyebrow">${PBM.solo ? 'この ファイル だけでは つながらない' : 'GASばんで あそべる'}</p>
      <h2>リアルタイムたいせん</h2>
      <p class="ol-empty rt-offline" role="status">${ruby(`いまは サーバーに つながって いない ので、ともだちとは たいせん できない。${PBM.solo ? 'この ゲームを 先生（せんせい）の Google の ページ（GAS）に のせた ものを ひらくと、あいことばで たいせん できる。' : '学校（がっこう）の ページ（GASばん）で ひらくと、あいことばで たいせん できる。'}`)}</p>
      <p class="ol-help">${ruby('たいせんの しかた：ひとりが「へやを つくる」→ 4けたの あいことばを ともだちに 教（おし）える → ともだちが「あいことばで 入る」。つかうのは パック＆バトルの「つかう デッキ」。')}</p>
      <p class="ol-help">${ruby('先生（せんせい）へ：のせかたは docs/REALTIME_PVP.md の 8章（GAS の デプロイ）に あります。')}</p>
      <div class="row-btns"><button type="button" class="btn primary" data-r="back">もどる</button></div>
    </main>`;
    app().onchange = null;
    app().onclick = (e) => { if (e.target.closest('[data-r=back]')) back(); };
    return;
  }
  if (!hasServer()) {
    app().innerHTML = `<main class="online rt">
      <p class="eyebrow">GASばんで あそべる</p>
      <h2>リアルタイムたいせん</h2>
      <p class="ol-empty">${ruby('リアルタイムたいせんは、学校（がっこう）の ページ（GASばん）で あそべる。この ページ（WEBばん）には つながる サーバーが ないので、ともだちとは たいせん できない。')}</p>
      <p class="ol-help">${ruby('かわりに「ゴーストたいせん」で、見本（みほん）デッキの れんしゅう あいてと たたかえるよ。')}</p>
      <div class="row-btns"><button type="button" class="btn" data-r="back">もどる</button><button type="button" class="btn primary" data-r="ghost">ゴーストたいせんで れんしゅう</button></div>
    </main>`;
    app().onchange = null;
    app().onclick = (e) => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      if (b.dataset.r === 'back') return back();
      if (b.dataset.r === 'ghost') return onlineMenu(app, me);
    };
    return;
  }
  const rec = loadRec();
  const draw = () => {
    app().innerHTML = `<main class="online rt">
      <p class="eyebrow">ともだちと その場（ば）で たいせん</p>
      <h2>リアルタイムたいせん</h2>
      <div class="ol-me">
        <div class="ol-namebox"><span class="ol-name">${esc(nameOf(o.name))}</span>
          <div class="ol-selects">${[NAME_A, NAME_B].map((ws, k) => `<select data-n="${k}" aria-label="なまえの ${k + 1}つめの ことば">${ws.map((w, i) => `<option value="${i}" ${o.name[k] === i ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select>`).join('')}</div></div>
        <div class="ol-score"><b>${rec.w}<small>かち</small></b><span>${rec.l}まけ ${rec.d}ひきわけ</span></div>
      </div>
      <ol class="rt-steps">
        <li>${ruby(PBM ? 'つかうのは パック＆バトルの「つかう デッキ」（下に 出て いる）。かえる ときは もどって「デッキ」で。' : 'つかう デッキを 1つ えらぶ。')}</li>
        <li>${ruby('ひとりが「へやを つくる」を おす。4けたの あいことばが 出るので、ともだちに 教（おし）える。')}</li>
        <li>${ruby('もう ひとりは「あいことばで 入る」を おして、その すうじを 入れる。')}</li>
        <li>${ruby('ふたり そろうと はじまる。かわりばんこに うごかして、あいての ライフ 20を 0に すれば かち。')}</li>
      </ol>
      ${msg ? `<p class="ol-news" role="alert">${ruby(msg)}</p>` : ''}
      <h3 class="ol-h">つかう デッキ</h3>
      <div class="ol-decks">${decks.map((x, k) => `<button type="button" class="ol-deck ${k === pick ? 'on' : ''}" data-deck="${k}" aria-pressed="${k === pick}"><b>${esc(x.label)}</b><small>${esc(x.sub)}</small></button>`).join('')}</div>
      ${PBM?.problems?.length ? `<p class="ol-news rt-nodeck" role="alert">${ruby(`デッキが まだ くめて いない：${PBM.problems[0]}。もどって「デッキ」で なおそう。`)}</p>` : ''}
      <div class="row-btns rt-go"><button type="button" class="btn primary" data-r="make" ${PBM?.problems?.length ? 'disabled' : ''}>へやを つくる<small>あいことばを もらう</small></button><button type="button" class="btn primary" data-r="join" ${PBM?.problems?.length ? 'disabled' : ''}>あいことばで 入る<small>ともだちの へやへ</small></button></div>
      <p class="ol-help">${ruby('まもる がわの ブロックは じどう。あいての ばんには カードを つかえない。こうさんは 左上（ひだりうえ）の ≡ から。ほかんした デッキは、かち ＋2・ひきわけ ＋1・まけ −1 の 点が つく（0より 下には ならない）。')}</p>
      <div class="row-btns"><button type="button" class="btn" data-r="back">もどる</button>${PBM ? '' : '<button type="button" class="btn" data-r="ghost">ゴーストたいせん<small>ひとりで れんしゅう</small></button>'}</div>
    </main>`;
  };
  draw();
  app().onchange = (e) => {
    const sel = e.target.closest('select[data-n]'); if (!sel) return;
    o.name[+sel.dataset.n] = +sel.value; olSave(o);
    app().querySelector('.ol-name').textContent = nameOf(o.name);
  };
  app().onclick = async (e) => {
    const d = e.target.closest('[data-deck]');
    if (d) { pick = +d.dataset.deck; return draw(); }
    const b = e.target.closest('[data-r]'); if (!b) return;
    if (b.dataset.r === 'back') return back();
    if (b.dataset.r === 'ghost' && !PBM) return onlineMenu(app, me);
    const deck = decks[pick];
    if (PBM?.problems?.length) return;
    if (b.dataset.r === 'make') {
      try { const r = await rpc('mtgRtCreate', { d: deck.d, n: o.name, i: deck.id }, false); return waitRoom(app, back, o, deck, r, opt); }
      catch (err) { msg = `へやを つくれなかった：${errText(err)}`; return draw(); }
    }
    if (b.dataset.r === 'join') return joinRoom(app, back, o, deck, opt);
  };
}

// ---- へやを つくった：あいことばを 見せて、ともだちを まつ（3秒ごとに しらべる。10分で きえる）----
function waitRoom(app, back, o, deck, room, opt) {
  let left = 10 * 60 * 1000, at = Date.now(), fails = 0, done = false, timer = 0, clock = 0;
  const stop = () => { done = true; clearTimeout(timer); clearInterval(clock); };
  LIVE = { stop, room, playing: false, over: false };
  const leftNow = () => left - (Date.now() - at);
  app().onchange = null;
  app().innerHTML = `<main class="online rt">
    <p class="eyebrow">へやを つくった</p>
    <h2>あいことば</h2>
    <p class="rt-code" aria-label="あいことば ${room.c.split('').join(' ')}">${room.c.split('').map((x) => `<b>${x}</b>`).join('')}</p>
    <p class="ol-help">${ruby('この 4けたの すうじを ともだちに 教（おし）えよう。ともだちは「リアルタイムたいせん」→「あいことばで 入る」で、この すうじを 入れる。')}</p>
    <p class="rt-wait" role="status">ともだちを まって いる…<b id="rt-left">${mmss(left)}</b></p>
    <p class="ol-help">${ruby('10分（ぷん） だれも 来（こ）ないと、へやは きえる。この 画面（がめん）を ひらいた まま まってね。')}</p>
    <div class="row-btns"><button type="button" class="btn" data-r="cancel">やめる</button></div>
  </main>`;
  clock = setInterval(() => { const el = document.getElementById('rt-left'); if (el) el.textContent = mmss(leftNow()); }, 1000);
  const gone = (text) => { stop(); LIVE = null; return sheet(`<p>${ruby(text)}</p>`, [{ label: 'もどる', value: 1, kind: 'primary' }], { title: 'へやが きえた', dismiss: false }).then(() => rtMenu(app, back, opt)); };
  const poll = async () => {
    if (done) return;
    try {
      const r = await rpc('mtgRtSync', { c: room.c, k: room.k });
      if (done) return;
      fails = 0;
      if (r.st === 'play') { stop(); return found(app, back, o, deck, { ...room, ...r }, opt); }
      if (r.st !== 'wait') return gone('10分（ぷん） だれも 来（こ）なかったので、へやは きえた。もう いちど つくって みよう。');
      left = r.left; at = Date.now();
    } catch { if (++fails >= RT.FAILS) return gone('サーバーと つながらなく なった。インターネットを たしかめて、もう いちど ためして みよう。'); }
    timer = setTimeout(poll, RT.POLL_WAIT);
  };
  timer = setTimeout(poll, RT.POLL_WAIT);
  app().onclick = (e) => {
    if (!e.target.closest('[data-r=cancel]')) return;
    stop(); LIVE = null;
    rpc('mtgRtEnd', { c: room.c, k: room.k, why: 'cancel' }).catch(() => {});
    rtMenu(app, back, opt);
  };
}

// ---- あいことばで 入る：すうじの ボタンで 4けた（キーボードは つかわない）----
function joinRoom(app, back, o, deck, opt) {
  let code = '', msg = '', busy = false;
  app().onchange = null;
  const draw = () => {
    app().innerHTML = `<main class="online rt">
      <p class="eyebrow">ともだちの へやへ</p>
      <h2>あいことばを 入れる</h2>
      <p class="ol-help">${ruby('ともだちの 画面（がめん）に 出て いる 4けたの すうじを、下の ボタンで 入れよう。')}</p>
      <p class="rt-code" aria-label="入れた すうじ">${[0, 1, 2, 3].map((i) => `<b class="${code[i] ? '' : 'empty'}">${code[i] || '・'}</b>`).join('')}</p>
      ${msg ? `<p class="ol-news" role="alert">${ruby(msg)}</p>` : ''}
      <div class="rt-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" class="btn" data-k="${n}">${n}</button>`).join('')}<button type="button" class="btn" data-k="del" aria-label="1つ けす">けす</button><button type="button" class="btn" data-k="0">0</button><button type="button" class="btn primary" data-k="go" ${code.length === 4 && !busy ? '' : 'disabled'}>入る</button></div>
      <div class="row-btns"><button type="button" class="btn" data-k="back">もどる</button></div>
    </main>`;
  };
  draw();
  app().onclick = async (e) => {
    const b = e.target.closest('[data-k]'); if (!b || busy) return;
    const k = b.dataset.k;
    if (k === 'back') return rtMenu(app, back, opt);
    if (k === 'del') { code = code.slice(0, -1); msg = ''; return draw(); }
    if (k === 'go') {
      if (code.length !== 4) return;
      busy = true;
      try { const r = await rpc('mtgRtJoin', { c: code, d: deck.d, n: o.name, i: deck.id }, false); return found(app, back, o, deck, { c: code, ...r }, opt); }
      catch (err) { busy = false; msg = `入れなかった：${errText(err)}`; code = ''; return draw(); }
    }
    if (code.length < 4) { code += k; msg = ''; draw(); }
  };
}

// ---- ふたり そろった ----
async function found(app, back, o, deck, room, opt) {
  const foeName = nameOf(room.foe.n), mine = room.first === room.side;
  if (!room.foe.d.every((id) => BY_ID[id])) { // おなじ ページから あそべば おこらない
    rpc('mtgRtEnd', { c: room.c, k: room.k, why: 'desync' }).catch(() => {});
    await sheet(`<p>${ruby('あいての デッキに、この 画面（がめん）が 知（し）らない カードが ある。ふたりとも ページを ひらきなおして、もう いちど ためして みよう。')}</p>`, [{ label: 'もどる', value: 1, kind: 'primary' }], { title: 'はじめられなかった', dismiss: false });
    return rtMenu(app, back, opt);
  }
  const match = runMatch(app, back, o, deck, room, foeName, opt);
  await sheet(`<p class="ol-found">${esc(foeName)}</p><p>${esc(pairName(pairOf(room.foe.d)))}の デッキ</p>
    <p class="rt-first">${ruby(mine ? 'きみが 先（さき）に うごく' : `${foeName}が 先（さき）に うごく。きみは その あと`)}</p>
    <p class="ol-help">${ruby('先（さき）に うごく 人は サーバーが くじで きめた。あいての ばんの あいだは、カードを 見る ことは できるが うごかせない。')}</p>`,
    [{ label: 'はじめる', value: 1, kind: 'primary' }], { title: 'あいてが きまった！', dismiss: false });
  match.go();
}

// ---- たいせん：通信と すすめかた ----
function runMatch(app, back, o, deck, room, foeName, opt = {}) {
  const { c, k, side } = room;
  const st = { out: [], acked: 0, from: 0, queue: [], draining: false, fails: 0, inflight: false, over: false, timer: 0, clock: 0, lastFoe: Date.now(), away: 0, awayAt: Date.now(), claiming: false, started: false, reported: null, settling: null };
  const stop = () => { st.over = true; clearTimeout(st.timer); clearInterval(st.clock); };
  LIVE = { stop, room, playing: true, get over() { return st.over; } };
  const awayNow = () => st.away + (Date.now() - st.awayAt);
  const rt = {
    flip: side === 'g', first: room.first === side,
    send(op) { st.out.push(op); st.lastFoe = Date.now(); if (rtCtl.state()?.over) settle(); else soon(100); },
    ready() { /* 「はじめる」を おしたら go() */ },
    // あいての ばん：まちじかん（あいてが さいごに うごいて からの 時間）。つうしんが とぎれて いる ときは それも
    waitText() {
      const a = awayNow();
      return `あいての ばん　まちじかん ${mmss(Date.now() - st.lastFoe)}${a >= RT.AWAY_SHOW ? `（あいての つうしんが とぎれて いる… ${Math.floor(a / 1000)}びょう。${Math.ceil(RT.AWAY_WIN / 1000)}びょうで きみの かち）` : ''}`;
    },
  };
  const soon = (ms) => { if (st.over) return; clearTimeout(st.timer); st.timer = setTimeout(tick, ms); };

  // 2秒ごと：じぶんの そうさを おくり、あいての そうさを もらう。5回 つづけて しっぱいしたら おわる
  async function tick() {
    if (st.over) return;
    if (st.inflight) return soon(300);
    st.inflight = true;
    try {
      const r = await rpc('mtgRtSync', { c, k, ops: st.out.slice(st.acked, st.acked + 30), from: st.from });
      st.fails = 0;
      if (!st.over) onSync(r);
    } catch { if (++st.fails >= RT.FAILS && !st.over) finish({ w: 'x', why: 'net' }); }
    st.inflight = false;
    soon(!st.fails && st.out.length > st.acked ? 150 : RT.POLL_PLAY); // しっぱいの あとは いそがない（5回で 10秒 いじょう）
  }
  function onSync(r) {
    if (r.st === 'gone') return finish({ w: 'x', why: 'gone' });
    if (r.n != null) st.acked = Math.max(st.acked, r.n);
    for (const op of r.ops || []) if (op.n === st.from) { st.queue.push(op); st.from++; st.lastFoe = Date.now(); }
    if (r.away != null) { st.away = r.away; st.awayAt = Date.now(); }
    if (r.st === 'over') return finish(r.res, r.pts);
    drain();
    // あいてが 45秒 しずか：いなく なった（ブラウザを とじた・つうしんが きれた）→ きみの かち
    if (st.away >= RT.AWAY_WIN && !st.claiming && !st.reported) {
      st.claiming = true;
      rpc('mtgRtEnd', { c, k, why: 'left' }).then((x) => { if (x.st === 'over') finish(x.res, x.pts); else if (x.st === 'gone') finish({ w: 'x', why: 'gone' }); }, () => {}).finally(() => { st.claiming = false; });
    }
  }
  // あいての そうさを じゅんばんに さいせい
  async function drain() {
    if (st.draining) return;
    st.draining = true;
    while (st.queue.length && !st.over && st.started) {
      const res = await rtCtl.apply(st.queue.shift());
      if (res.over) settle();
      if (res.bad && !st.over) { // ふたりの 場が ずれた：しょうぶなしで おわる
        try { const x = await rpc('mtgRtEnd', { c, k, why: 'desync' }); finish(x.res || { w: 'x', why: 'desync' }, x.pts); } catch { finish({ w: 'x', why: 'desync' }); }
      }
    }
    st.draining = false;
  }
  // たたかいが おわった：のこりの そうさを おくって、じぶんから 見た けっかを サーバーに つたえる。ふたりの けっかが そろうと きまる
  // （けっかの まどを とじるのを またずに すぐ つたえる。あいてを またせない）
  function settle() {
    const ov = rtCtl.state()?.over;
    if (!ov || st.over || st.settling) return st.settling;
    const mine = ov === 'draw' ? 'd' : ov === 'win' ? 'w' : 'l';
    st.reported = mine;
    return (st.settling = (async () => {
      for (let i = 0; i < 25 && !st.over; i++) {
        try {
          if (st.out.length > st.acked) { const s = await rpc('mtgRtSync', { c, k, ops: st.out.slice(st.acked, st.acked + 30), from: st.from }); if (s.n != null) st.acked = Math.max(st.acked, s.n); if (s.st === 'over') return finish(s.res, s.pts); if (s.st === 'gone') break; continue; }
          const x = await rpc('mtgRtEnd', { c, k, why: 'play', r: mine });
          if (x.st === 'over') return finish(x.res, x.pts);
          if (x.st === 'gone') break;
        } catch { /* もう いちど */ }
        await new Promise((ok) => setTimeout(ok, RT.POLL_PLAY));
      }
      if (!st.over) finish({ w: mine === 'd' ? 'd' : mine === 'w' ? side : 'other', why: 'local' });
    })());
  }
  // battle.js の けっかの まどを とじた あと
  function report(r) {
    if (!opt.pb) { onOnline(r); if (r.turns != null) onBattle(r, { online: true }); } // トロフィー（ゴーストたいせんと おなじ）。パック＆バトルからは つけない（こうちくの パックけんに つながる ため）
    if (st.over) return;
    app().innerHTML = `<main class="online rt"><p class="rt-wait" role="status">${ruby('けっかを サーバーに つたえて いる…')}</p></main>`;
    settle();
  }
  async function resign() {
    if (st.over) return;
    stop(); rtCtl.stop();
    let x = null;
    for (let i = 0; i < 3 && !x; i++) { try { x = await rpc('mtgRtEnd', { c, k, why: 'resign' }, false); } catch { /* もう いちど */ } }
    st.over = false;
    finish(x?.res || { w: 'other', why: 'resign' }, x?.pts);
  }
  // おわり：けっかを 見せて、この 端末の きろく（かちまけ・デッキの 点）を かえる
  async function finish(res, pts) {
    if (st.over) return;
    stop(); rtCtl.stop(); LIVE = null;
    const r = res.w === 'd' ? 'd' : res.w === 'x' ? '' : res.w === side ? 'w' : 'l';
    let note = '';
    if (r) {
      const rec = loadRec(); rec[r]++; saveRec(rec);
      const cur = olState();
      if (r === 'w') cur.wins++; else if (r === 'l') cur.losses++; else cur.draws++;
      const d = deck.rec && cur.decks.find((x) => x.d.join() === deck.rec.d.join() && x.date === deck.rec.date);
      if (d) {
        const before = d.s || 0;
        d.s = pts != null ? pts : addPoints(before, r);
        note = `デッキの 点 ${before} → <b>${d.s}</b>（${POINTS[r] > 0 ? '＋' : '−'}${Math.abs(POINTS[r])}${r === 'l' && before === 0 ? '。0より 下には ならない' : ''}）`;
      } else note = deck.pb ? 'パック＆バトルの デッキ なので 点は つかない（ポイント・カードも そのまま）' : 'スターターデッキ なので 点は つかない';
      olSave(cur);
    }
    const mineLeft = res.why === 'left' && r === 'l';
    const WHY = {
      resign: r === 'w' ? `${foeName}が こうさん した。` : 'こうさん した。',
      left: mineLeft ? '45びょう つうしんが とぎれた ので、まけに なった。' : `${foeName}が いなく なった（ブラウザを とじたか、つうしんが きれた）ので、きみの かち。`,
      desync: 'ふたりの 画面（がめん）が ずれて しまった ので、しょうぶなし（点は かわらない）。',
      mismatch: 'ふたりの けっかが くいちがった ので、しょうぶなし（点は かわらない）。',
      net: `サーバーと ${RT.FAILS}回 つづけて つながらなかった ので、たいせんを おわった。この 端末（たんまつ）の きろくは かわらない（${Math.ceil(RT.AWAY_WIN / 1000)}びょう もどれないと、サーバーでは あいての かちに なる）。`,
      gone: 'へやが なくなった ので、たいせんを おわった（きろくは かわらない）。',
      local: 'サーバーに けっかを つたえられなかった。この 端末（たんまつ）の きろく だけ かえた。',
    }[res.why] || '';
    const cls = r === 'w' ? 'win' : r === 'l' ? 'lose' : 'draw';
    await sheet(`<p class="big-result ${cls}">${{ w: 'かった！', l: 'まけた…', d: 'ひきわけ', '': 'しょうぶなし' }[r]}</p>${WHY ? `<p class="rt-why">${ruby(WHY)}</p>` : ''}${note ? `<p>${note}</p>` : ''}`,
      [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: 'リアルタイムたいせんの けっか', dismiss: false });
    rtMenu(app, back, opt);
  }

  const hostIds = side === 'h' ? deck.d : room.foe.d, guestIds = side === 'h' ? room.foe.d : deck.d;
  startBattle({
    deck: hostIds.map((id) => BY_ID[id]), floor: pvp({ deck: guestIds.map((id) => BY_ID[id]), name: foeName, first: 'P' }), floorName: `${foeName}と たいせん`, diff: 'normal',
    seed: room.seed, rt,
    quit: { label: 'こうさんする（まけに なる）', note: 'こうさんすると、この たいせんは まけに なるよ。ほんとうに やめる？', go: resign },
    onEnd: (r) => report(r),
  });
  // まちじかんの 時計（1秒ごとに 文字だけ かえる）
  st.clock = setInterval(() => {
    if (!rtCtl.live()) return;
    const el = document.querySelector('.banner.rt-wait'), my = document.querySelector('.banner.rt-mine'), a = awayNow();
    if (el) el.textContent = rt.waitText();
    if (my) my.dataset.away = a >= RT.AWAY_SHOW ? `あいての つうしんが とぎれて いる… ${Math.floor(a / 1000)}びょう` : '';
  }, 1000);
  soon(RT.POLL_PLAY);
  return {
    go() {
      if (st.over) return;
      st.started = true; st.lastFoe = Date.now();
      if (rt.first) rtCtl.begin(); else toast(`${foeName}の ばんから はじまる`);
      drain();
    },
  };
}
