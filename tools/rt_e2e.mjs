// リアルタイムたいせんの 通しテスト（Playwright）：2つの 画面（べつの ブラウザ コンテキスト）が、にせものの GAS（tools/rt_server.mjs）で あいことばの へやに 入り、ロボットが さいごまで たたかう
//   node tools/build_gas.mjs && node tools/rt_server.mjs &   →   node tools/rt_e2e.mjs
// DEBUG=40（40手ごとに ようすを 出す。ずれた ときは ふたりの 場の きろくを くらべ、すすまない・おせない ときは 中の ようすを 出す）、NODBG=1（DEBUG でも 場の きろくは とらない）
// 環境変数：STORED=1（ランダムな ほかんデッキで）、URL（http://localhost:8125/）、ONLY（full,turn,resign,net,left,expire,bad の どれか。カンマで いくつも）、GAMES（full を 何回）、OUT（スクリーンショットの 保存先）、DECKS（スターターの 番号 例 0,3）
import { chromium } from 'playwright';
const URL_ = process.env.URL || 'http://localhost:8125/';
const OUT = process.env.OUT || '';
// PB=1：パック＆バトルの ホームから 入る（つかう デッキ＝きそデッキ）。SOLO=1：1ファイル版（URL=…/packbattle-standalone.html。ひらくと すぐ パック＆バトルの ホーム）
// MYDECK=1：「魔法使いの夜」の カードの デッキ（青子・有珠）で たたかう（魔力カウンター・グレートスリーなどでも 画面が ずれないか）
const PB = !!process.env.PB, SOLO = !!process.env.SOLO, GO = PB ? '.pb-steps [data-go=rt]' : '[data-go=rt]';
const ONLY = (process.env.ONLY || 'full,turn,resign,net,left,expire,bad').split(',');
const browser = await chromium.launch();
let bad = 0;
const ok = (c, msg) => { if (!c) { bad++; console.log('NG', msg); } else console.log('OK', msg); };
const ctl = (o) => fetch(new URL('/ctl', URL_), { method: 'POST', body: JSON.stringify(o) }).then((r) => r.json());
const errors = [];
const DBG = {}; // DEBUG：そうさごとの 場の ようす（ふたりの 画面で くらべる）

async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.text().startsWith('RTDBG ')) (DBG[name] ||= []).push(m.text().slice(6)); });
  page.on('console', (m) => { if (m.type() === 'error' && !/503|Failed to load resource|rt-desync/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  await page.goto(process.env.DEBUG && !process.env.NODBG ? `${URL_}?dbg` : URL_);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mtg-tutorial-done', '1'); if (location.search.includes('dbg')) localStorage.setItem('mtg-rt-debug', '1'); }); // チュートリアルを おえた 子（GASばんでは デバッグの「ぜんぶ あそべる」は 先生だけ）
  // STORED=1：ほかんした デッキ（いろいろな 弾の カードを ランダムに 12まい ＋ きほんカード 8まい。2色・40点まで）で たたかう（しくみの 多い カードでも 画面が ずれないか）
  if (process.env.STORED) await page.evaluate(async () => {
    const { BY_ID } = await import('./js/data/cards.js'); const { ptsOf } = await import('./js/engine/ai.js');
    const all = Object.values(BY_ID), cols = ['W', 'U', 'K', 'R', 'G'].sort(() => Math.random() - 0.5).slice(0, 2);
    const fits = (d) => [...(d.color || '')].every((c) => cols.includes(c));
    const basics = cols.map((c) => all.find((d) => d.basic && d.color === c).id);
    const pool = all.filter((d) => !d.basic && !d.token && !d.banner && d.rar && fits(d) && (d.cost ?? 9) <= 5 && !/^(B|MS|CM)\d/.test(d.id)).sort(() => Math.random() - 0.5);
    const d = []; let pts = 0;
    for (const c of pool) { if (d.length >= 12) break; if (pts + ptsOf(c) > 40) continue; d.push(c.id); pts += ptsOf(c); }
    while (d.length < 20) d.push(basics[d.length % 2]);
    localStorage.setItem('mtg-online-v1', JSON.stringify({ name: [Math.floor(Math.random() * 20), Math.floor(Math.random() * 20)], decks: [{ d, p: cols.join(''), t: 3, s: 0, date: '2026-11-27' }] }));
  });
  if (process.env.MYDECK) await page.evaluate(async (who) => {
    const { BY_ID } = await import('./js/data/cards.js'); const { ptsOf } = await import('./js/engine/ai.js');
    const want = who === 'A' ? ['MY01', 'MY19', 'MY19', 'MY20', 'MY35', 'MY45', 'MY46', 'MY36', 'MY41', 'MY30', 'MY30', 'MY31', 'MY31', 'MY55'] : ['MY02', 'MY10', 'MY10', 'MY14', 'MY14', 'MY11', 'MY11', 'MY06', 'MY07', 'MY08', 'MY15', 'MY43', 'MY03', 'MY09'];
    const cols = who === 'A' ? ['U', 'R'] : ['K', 'G'], d = []; let pts = 0;
    for (const id of want) { const c = BY_ID[id]; if (d.length >= 13 || pts + ptsOf(c) > 40 || ![...(c.color || '')].every((k) => [...cols, 'W'].includes(k) && (cols.includes(k)))) continue; d.push(id); pts += ptsOf(c); }
    const basics = cols.map((k) => Object.values(BY_ID).find((x) => x.basic && x.color === k).id);
    while (d.length < 20) d.push(basics[d.length % 2]);
    localStorage.setItem('mtg-online-v1', JSON.stringify({ name: [who === 'A' ? 1 : 2, 3], decks: [{ d, p: cols.join(''), t: 3, s: 0, date: '2026-11-27' }] }));
  }, name);
  await page.reload();
  if (PB && !SOLO) { await page.click('[data-go=pb]'); await page.waitForSelector('.pb-steps'); }
  if (PB && SOLO) await page.waitForSelector('.pb-steps');
  return page;
}
const sheetOpen = (p) => p.locator('#sheet:not([hidden])').count();
const sheetTitle = (p) => p.evaluate(() => document.querySelector('#sheet:not([hidden]) .sheet-title')?.textContent || '');
const tap = (p, sel) => p.locator(sel).first().click({ timeout: 2000 }).then(() => true, () => false);
// あいことばの へやを つくって（a）入る（b）。「あいてが きまった！」の まどが 出る ところまで
async function pair(a, b, da = 0, db = 1) {
  for (const p of [a, b]) { await p.click(GO); await p.waitForSelector('main.rt [data-r=make]'); }
  const nd = await a.locator('[data-deck]').count(), one = process.env.STORED || process.env.MYDECK || PB;
  await a.locator('[data-deck]').nth(one ? 0 : nd - 6 + da).click();
  await b.locator('[data-deck]').nth(one ? 0 : nd - 6 + db).click();
  await a.click('[data-r=make]');
  await a.waitForSelector('.rt-code b');
  const code = (await a.locator('.rt-code b').allTextContents()).join('');
  await b.click('[data-r=join]');
  for (const ch of code) await b.click(`.rt-pad [data-k="${ch}"]`);
  await b.click('.rt-pad [data-k=go]');
  for (const p of [a, b]) await p.waitForSelector('#sheet:not([hidden]) .ol-found', { timeout: 15000 });
  return code;
}
const begin = async (a, b) => { for (const p of [a, b]) await p.click('#sheet .sheet-actions button'); for (const p of [a, b]) await p.waitForSelector('.battle'); };
const isOver = async (p) => (await sheetOpen(p)) && /リアルタイムたいせんの けっか/.test(await sheetTitle(p));
const resultOf = (p) => p.locator('#sheet .big-result').first().textContent();
const SWIPES = { n: 0 };
async function swipe(p, from, to) {
  const a = await from.boundingBox().catch(() => null), b = await to.boundingBox().catch(() => null);
  if (!a || !b) return;
  const x0 = a.x + a.width / 2, y0 = a.y + a.height / 2, x1 = b.x + b.width / 2, y1 = b.y + b.height / 2;
  await p.mouse.move(x0, y0); await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8);
  await p.mouse.up(); await p.waitForTimeout(450); // スワイプの すぐあとの タップは むしされる
}
// ロボットの 1手（tools/e2e.mjs と おなじ かんがえ）。じぶんの ばんで なければ 何も しない
async function step(p) {
  // 用語の せつめい（点線の ことばを 2回タップ・長おしで 出る。画面 ぜんぶを おおう）：タップで とじる
  if (await p.locator('#term:not([hidden])').count()) { await p.click('#term', { timeout: 2000 }).catch(() => {}); return 'term'; }
  if (await p.locator('.foe-flash, .ff-who').count()) { await p.mouse.click(195, 300); return 'flash'; }
  if (await sheetOpen(p)) {
    if (await isOver(p)) return 'over';
    if (await p.locator('#sheet .pick-list').count()) {
      await p.locator('#sheet .pick').first().click().catch(() => {});
      if (await p.locator('#sheet [data-ok]:not([disabled])').count()) await tap(p, '#sheet [data-ok]'); else await tap(p, '#sheet [data-no]');
      return 'pick';
    }
    if (await p.locator('#sheet .num-row, #sheet .div-list').count()) { await tap(p, '#sheet [data-ok]'); return 'num'; }
    const btns = p.locator('#sheet .sheet-actions button:not([disabled])'), n = await btns.count();
    if (!n) { await p.locator('#sheet .sheet-back').click({ timeout: 1000 }).catch(() => {}); return 'sheet'; }
    await btns.nth(Math.random() < 0.85 ? 0 : n - 1).click({ timeout: 2000 }).catch(() => {});
    return 'sheet';
  }
  if (!(await p.locator('.battle').count())) return 'none';
  if (await p.locator('[data-act=auto]').count()) { if (await tap(p, '[data-act=auto]')) await tap(p, '[data-act=declare]'); return 'attack'; }
  if (await p.locator('[data-act=damage]').count()) { await tap(p, '[data-act=damage]'); return 'damage'; }
  if (!(await p.locator('[data-act=end]').count())) return 'wait';
  const r = Math.random();
  if (r < 0.6 && await p.locator('.hand-slot.ok').count()) { await tap(p, '.hand-slot.ok'); return 'card'; }
  if (r < 0.8 && await p.locator('.hand-slot').count()) { const h = p.locator('.hand-slot'); await h.nth(Math.floor(Math.random() * await h.count())).click({ timeout: 2000 }).catch(() => {}); return 'card'; }
  if (r < 0.9 && await p.locator('.zone.mine .perm.ab, .zone.mine .perm.ab-big').count()) { await tap(p, '.zone.mine .perm.ab, .zone.mine .perm.ab-big'); return 'ability'; }
  // こうげき：はんぶんは スワイプ（じぶんの クリーチャー → あいての 本体）、はんぶんは ボタン
  const dr = p.locator('.zone.mine .perm.drag:not(.att)'), face = p.locator('.zone.enemy [data-face]');
  if (await p.locator('[data-act=attack]').count() && await dr.count() && await face.count() && Math.random() < 0.5) { await swipe(p, dr.first(), face.first()); SWIPES.n++; return 'swipe'; }
  if (await p.locator('[data-act=attack]').count()) { await tap(p, '[data-act=attack]'); return 'attack'; }
  await tap(p, '[data-act=end]');
  return 'end';
}
async function playOut(a, b, max = 6000) {
  let wa = 0, stuckN = Date.now(), lastSig = '', slow = 0; const last = {};
  for (let i = 0; i < max; i++) {
    const guard = (name, p) => Promise.race([step(p), new Promise((ok) => setTimeout(() => ok('HANG'), 20000))]).then(async (r) => { if (r === 'HANG' && process.env.DEBUG) { console.log('HANG', name, 'さいごの 手', last[name]); await p.screenshot({ path: `${OUT || '.'}/rt_hang_${name}.png`, timeout: 5000 }).catch((e) => console.log('screenshot NG', e.message.slice(0, 80))); const live = await Promise.race([p.evaluate(() => 1), new Promise((ok) => setTimeout(() => ok(0), 3000))]); console.log('ページは うごいて いる？', live); process.exit(3); } last[name] = r; return r; });
    const t0 = Date.now();
    const sa = await guard('A', a), sb = await guard('B', b);
    // DEBUG：手が おそい（ボタンが おせない）のが つづいたら、その 画面を しらべる
    if (process.env.DEBUG) { slow = Date.now() - t0 > 1500 ? slow + 1 : 0; if (slow === 6) { for (const [n, p] of [['A', a], ['B', b]]) { await p.screenshot({ path: `${OUT || '.'}/rt_slow_${n}.png` }); console.log('SLOW', n, sa, sb, 'rAF', await Promise.race([p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => ok('うごく')))), new Promise((ok) => setTimeout(() => ok('うごかない（画面が 描かれて いない）'), 3000))]), 'visibility', await p.evaluate(() => `${document.visibilityState} focus=${document.hasFocus()}`), await p.evaluate(() => { const b = document.querySelector('#sheet .sheet-actions button'); const r = b?.getBoundingClientRect(); const top = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return JSON.stringify({ sheetHidden: document.getElementById('sheet').hidden, btn: b?.outerHTML.slice(0, 120), rect: r && [r.left, r.top, r.width, r.height], top: top && (top.outerHTML.slice(0, 160)), fx: document.getElementById('fx')?.innerHTML.slice(0, 300), sheet: document.getElementById('sheet').innerHTML.slice(0, 400) }); })); } return false; } }
    if (process.env.DEBUG && i % Number(process.env.DEBUG) === 0) console.log(i, Date.now() % 100000, sa, sb, await a.evaluate(() => `${document.querySelector('.bt-title .turn')?.textContent}｜${document.querySelector('.banner')?.textContent}｜${document.querySelector('#sheet:not([hidden]) .sheet-title')?.textContent || ''}`), '／', await b.evaluate(() => `${document.querySelector('.bt-title .turn')?.textContent}｜${document.querySelector('.banner')?.textContent}｜${document.querySelector('#sheet:not([hidden]) .sheet-title')?.textContent || ''}`));
    if (sa === 'over' && sb === 'over') return true;
    // すすまなく なった とき（DEBUG）：そうさの 数が 400手 かわらなければ、たたかいの 中の ようすを 出す
    if (process.env.DEBUG && i % 5 === 0) {
      const peek = (p) => p.evaluate(async () => { const m = await import('./js/ui/battle.js'); let o = null; try { m.debugBattle((B) => { o = { mode: B.mode, busy: B.busy, cur: B.rt?.cur && { e: B.rt.cur.e, a: B.rt.cur.a, pend: B.rt.cur.pend, fx: B.rt.cur.fx }, mine: B.rt?.mine, seq: B.rt?.seq, turn: B.s.turn, over: B.s.over, logs: B.s.logs.slice(-5), sheet: document.getElementById('sheet').hidden ? '' : document.getElementById('sheet').innerText.slice(0, 200), dom: `${document.querySelector('.banner')?.textContent}｜${document.querySelector('.actions')?.textContent}`, fx: document.getElementById('fx')?.innerHTML.slice(0, 200) }; throw new Error('peek'); /* 描きなおさない（debugBattle は そのあと 描く） */ }); } catch { /* peek */ } return o; }).catch(() => null);
      const [oa, ob] = [await peek(a), await peek(b)], sig = `${oa?.seq}|${ob?.seq}|${oa?.turn}|${oa?.over}`;
      if (sig !== lastSig) { lastSig = sig; stuckN = Date.now(); }
      if (Date.now() - stuckN > 60000) { console.log('STUCK A', JSON.stringify(oa)); console.log('STUCK B', JSON.stringify(ob)); await a.screenshot({ path: `${OUT || '.'}/rt_stuck_a.png` }); await b.screenshot({ path: `${OUT || '.'}/rt_stuck_b.png` }); return false; }
    }
    if (process.env.DEBUG && i % Number(process.env.DEBUG) === 0) console.log(i, Date.now() % 100000, sa, sb, await a.evaluate(() => `${document.querySelector('.bt-title .turn')?.textContent}｜${document.querySelector('.banner')?.textContent}｜${document.querySelector('#sheet:not([hidden]) .sheet-title')?.textContent || ''}`), '／', await b.evaluate(() => `${document.querySelector('.bt-title .turn')?.textContent}｜${document.querySelector('.banner')?.textContent}｜${document.querySelector('#sheet:not([hidden]) .sheet-title')?.textContent || ''}`));
    if (sa === 'over' && sb === 'over') return true;
    // すすまなく なった とき（DEBUG）：たたかいの 中の ようすを 出す
    if (process.env.DEBUG) { const sig = await a.evaluate(() => document.querySelector('#app').innerText.length + '|' + document.querySelector('.bt-title .turn')?.textContent) + sa + sb; stuckN = sig === lastSig ? stuckN + 1 : 0; lastSig = sig; if (stuckN === 150) { for (const p of [a, b]) console.log('STUCK', await p.evaluate(async () => { const m = await import('./js/ui/battle.js'); let o; m.debugBattle((B) => { o = { mode: B.mode, busy: B.busy, cur: B.rt.cur, mine: B.rt.mine, seq: B.rt.seq, over: B.s.over, logs: B.s.logs.slice(-6), sheet: !document.getElementById('sheet').hidden }; }); return JSON.stringify(o); })); return false; } }
    if (sa === 'wait' && sb === 'wait') { await a.waitForTimeout(150); if (++wa > 400) return false; } else wa = 0;
    if ((sa === 'over' || sb === 'over') || (sa === 'none' && sb === 'none')) await a.waitForTimeout(200);
  }
  return false;
}
const turnOwner = async (a, b) => { for (let i = 0; i < 100; i++) { if (await a.locator('[data-act=end]').count()) return [a, b]; if (await b.locator('[data-act=end]').count()) return [b, a]; for (const p of [a, b]) if (await sheetOpen(p)) await step(p); await a.waitForTimeout(100); } throw new Error('だれの ばんでも ない'); };

// ---- 1. さいごまで たたかう（かちまけが ふたりで そろう・画面が ずれない）----
if (ONLY.includes('full')) for (let g = 0; g < Number(process.env.GAMES || 2); g++) {
  const a = await open('A'), b = await open('B');
  const ds = process.env.DECKS ? process.env.DECKS.split(',').map(Number) : [g % 6, (g * 2 + 1) % 6];
  const code = await pair(a, b, ds[0], ds[1]);
  ok(/^\d{4}$/.test(code), `あいことば ${code} で ふたりが そろう（デッキ ${ds}）`);
  if (OUT && !g) { await a.screenshot({ path: `${OUT}/rt_found.png` }); }
  await begin(a, b);
  const t0 = Date.now(), done = await playOut(a, b);
  if (OUT && !g) { await a.screenshot({ path: `${OUT}/rt_result_a.png` }); await b.screenshot({ path: `${OUT}/rt_result_b.png` }); }
  const ra = done && await resultOf(a), rb = done && await resultOf(b);
  ok(done && ((ra === 'かった！' && rb === 'まけた…') || (ra === 'まけた…' && rb === 'かった！') || (ra === 'ひきわけ' && rb === 'ひきわけ')), `さいごまで たたかって けっかが そろう：A ${ra}／B ${rb}（${Math.round((Date.now() - t0) / 1000)}びょう）`);
  if (process.env.DEBUG && !(done && ra !== 'しょうぶなし')) { // ずれた ところ：ふたりの きろくを くらべる
    const key = (l) => l.split(' ')[0], A = DBG.A || [], B_ = DBG.B || [];
    for (const src of [[A, B_, 'A→B'], [B_, A, 'B→A']]) for (const l of src[0]) { const o = src[1].find((x) => key(x) === key(l) && x.split(' ')[1] === l.split(' ')[1]); if (o && o !== l) { console.log('DIFF', src[2], '\n ', l, '\n ', o); break; } }
    console.log('LAST A', A.slice(-3).join('\n  ')); console.log('LAST B', B_.slice(-3).join('\n  '));
  }
  DBG.A = []; DBG.B = [];
  console.log(`  （スワイプの こうげき ${SWIPES.n}回）`);
  if (!done) { await a.screenshot({ path: `${OUT || '.'}/rt_stuck_a.png` }); await b.screenshot({ path: `${OUT || '.'}/rt_stuck_b.png` }); }
  await a.context().close(); await b.context().close();
}

// ---- 2. じぶんの ばんで ない とき：うごかせない・あいての 手札は 見えない ----
if (ONLY.includes('turn')) {
  const a = await open('A'), b = await open('B');
  await pair(a, b); await begin(a, b);
  const [me, foe] = await turnOwner(a, b);
  ok(await foe.locator('[data-act=end], [data-act=attack], [data-act=declare], [data-act=damage]').count() === 0, 'ばんで ない がわには「こうげきする」「ターン おわり」の ボタンが ない');
  ok(/あいての ばん/.test(await foe.locator('.banner').textContent()) && /まちじかん/.test(await foe.locator('.banner').textContent()), `ばんで ない がわに「あいての ばん」と まちじかんが 出る：${await foe.locator('.banner').textContent()}`);
  ok(/あいての ばん/.test(await foe.locator('.actions').textContent()), 'ボタンの ところにも「あいての ばん」');
  // 手札を タップしても「とじる」だけ
  const before = await foe.evaluate(() => document.querySelector('.me-bar .mana').textContent + '|' + document.querySelectorAll('.hand-slot').length);
  await foe.locator('.hand-slot').first().click();
  const labels = await foe.locator('#sheet .sheet-actions button').allTextContents();
  ok(labels.length === 1 && /とじる/.test(labels[0]), `ばんで ない ときに 手札を タップ：えらべるのは「とじる」だけ（${labels.join('／')}）`);
  await foe.click('#sheet .sheet-actions button');
  // ばんの がわが マナを おく → あいての 画面に とどく
  const hn = await me.locator('.hand-slot').count();
  await me.locator('.hand-slot').first().click();
  await me.locator('#sheet .sheet-actions button', { hasText: 'マナゾーンに おく' }).click();
  await foe.waitForFunction(() => /マナ 1/.test(document.querySelector('.bt-head .chips')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  const chips = await foe.locator('.bt-head .chips').textContent();
  ok(/マナ 1/.test(chips) && new RegExp(`てふだ ${hn - 1}`).test(chips), `あいての そうさが とどく・あいての 手札は まいすう だけ：${chips}`);
  ok(before === await foe.evaluate(() => document.querySelector('.me-bar .mana').textContent + '|' + document.querySelectorAll('.hand-slot').length), 'ばんで ない がわの 手札・マナは かわらない');
  ok(await foe.locator('.erow .hand-slot, .zone.enemy [data-hand]').count() === 0 && await foe.locator('.hand-slot').count() === 5, 'あいての 手札の カードは 画面に 出ない（じぶんの 5まい だけ）');
  if (OUT) { await me.screenshot({ path: `${OUT}/rt_myturn.png` }); await foe.screenshot({ path: `${OUT}/rt_wait.png` }); }
  await a.context().close(); await b.context().close();
}

// ---- 3. こうさん ----
if (ONLY.includes('resign')) {
  const a = await open('A'), b = await open('B');
  await pair(a, b); await begin(a, b);
  const [, foe] = await turnOwner(a, b); // ばんで ない がわからも こうさん できる
  await foe.click('[data-act=menu]');
  await foe.locator('#sheet .sheet-actions button', { hasText: 'こうさん' }).click();
  const other = foe === a ? b : a;
  for (const p of [foe, other]) await p.waitForFunction(() => /けっか/.test(document.querySelector('#sheet:not([hidden]) .sheet-title')?.textContent || ''), null, { timeout: 15000 });
  ok(await resultOf(foe) === 'まけた…' && /こうさん/.test(await foe.locator('#sheet .rt-why').textContent()), 'こうさんした がわは まけ');
  ok(await resultOf(other) === 'かった！' && /こうさん/.test(await other.locator('#sheet .rt-why').textContent()), `あいては かち：${await other.locator('#sheet .rt-why').textContent()}`);
  await a.context().close(); await b.context().close();
}

// ---- 4. サーバーと つながらない：5回 つづけて しっぱいで おわる ----
if (ONLY.includes('net')) {
  const a = await open('A'), b = await open('B');
  await pair(a, b); await begin(a, b);
  await turnOwner(a, b);
  await ctl({ down: true });
  const t0 = Date.now();
  await a.waitForFunction(() => /けっか/.test(document.querySelector('#sheet:not([hidden]) .sheet-title')?.textContent || ''), null, { timeout: 40000 }).catch(() => {});
  ok(await resultOf(a).catch(() => '') === 'しょうぶなし' && /5回 つづけて/.test(await a.locator('#sheet .rt-why').textContent().catch(() => '')), `5回 つづけて つながらないと おわって、りゆうが 出る（${Math.round((Date.now() - t0) / 1000)}びょう）`);
  if (OUT) await a.screenshot({ path: `${OUT}/rt_net.png` });
  await ctl({ down: false });
  await a.context().close(); await b.context().close();
}

// ---- 5. あいてが いなく なる（ブラウザを とじた・つうしんが きれた）：45秒で のこった がわの かち ----
if (ONLY.includes('left')) {
  const a = await open('A'), b = await open('B');
  await pair(a, b); await begin(a, b);
  await turnOwner(a, b);
  await b.route('**/rpc', (r) => r.abort()); // こうさんの しらせも とどかない とじかた
  await b.context().close();
  await a.waitForTimeout(3000);
  await ctl({ skew: 50000 }); // サーバーの 時計を 50秒 すすめる（ほんとうは 45秒 まつ）
  await a.waitForFunction(() => /けっか/.test(document.querySelector('#sheet:not([hidden]) .sheet-title')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
  ok(await resultOf(a).catch(() => '') === 'かった！' && /いなく なった/.test(await a.locator('#sheet .rt-why').textContent().catch(() => '')), 'あいてが いなく なると、のこった がわの かち（りゆうが 出る）');
  if (OUT) await a.screenshot({ path: `${OUT}/rt_left.png` });
  await ctl({ skew: 0 });
  await a.context().close();
}

// ---- 6. まちあい：10分で へやが きえる ----
if (ONLY.includes('expire')) {
  const a = await open('A'), b = await open('B');
  for (const p of [a, b]) { await p.click(GO); await p.waitForSelector('main.rt [data-r=make]'); }
  await a.click('[data-r=make]'); await a.waitForSelector('.rt-code b');
  const code = (await a.locator('.rt-code b').allTextContents()).join('');
  ok(/^\d{1,2}:\d\d$/.test(await a.locator('#rt-left').textContent()), 'まちあいに のこり時間が 出る');
  await ctl({ skew: 11 * 60 * 1000 });
  await a.waitForFunction(() => /へやが きえた/.test(document.querySelector('#sheet:not([hidden]) .sheet-title')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  ok(/へやが きえた/.test(await sheetTitle(a)), '10分 たつと へやが きえて、つくった 人に しらせる');
  await b.click('[data-r=join]');
  for (const ch of code) await b.click(`.rt-pad [data-k="${ch}"]`);
  await b.click('.rt-pad [data-k=go]');
  await b.waitForSelector('.ol-news');
  ok(/へやは ない/.test(await b.locator('.ol-news').textContent()), `きえた へやには 入れない：${await b.locator('.ol-news').textContent()}`);
  await ctl({ skew: 0 });
  await a.context().close(); await b.context().close();
}

// ---- 7. 画面が ずれた とき：しょうぶなしで おわる（わざと 片方の 場を かえる）----
// 1ファイル版（SOLO）では しらべない：場を わざと ずらすのに js/ui/battle.js を 読みこむが、1ファイル版の 中の battle.js とは べつの ものに なる ため
if (ONLY.includes('bad') && SOLO) console.log('（とばした）ふたりの 場が ずれたら しょうぶなし：1ファイル版では わざと ずらせない');
if (ONLY.includes('bad') && !SOLO) {
  const a = await open('A'), b = await open('B');
  await pair(a, b); await begin(a, b);
  const [me, foe] = await turnOwner(a, b);
  await foe.evaluate(async () => { const m = await import('./js/ui/battle.js'); m.debugBattle((B) => { B.s.E.life = 7; }); });
  await me.locator('.hand-slot').first().click();
  await me.locator('#sheet .sheet-actions button', { hasText: 'マナゾーンに おく' }).click();
  for (const p of [foe, me]) await p.waitForFunction(() => /けっか/.test(document.querySelector('#sheet:not([hidden]) .sheet-title')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
  ok(await resultOf(foe).catch(() => '') === 'しょうぶなし' && await resultOf(me).catch(() => '') === 'しょうぶなし', 'ふたりの 場が ずれたら、ふたりとも「しょうぶなし」で おわる');
  await a.context().close(); await b.context().close();
}

console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join('\n')}` : 'no errors');
if (errors.length) bad++;
console.log(bad ? `\n${bad}こ NG` : '\nぜんぶ OK');
await browser.close();
process.exit(bad ? 1 : 0);
