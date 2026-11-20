// パック＆バトル（js/ui/packbattle.js）の 通しテスト（Playwright）：ロボットが ひとまわり あそぶ
//   npx http-server -p 8124 -c-1 . &  →  node tools/e2e_pb.mjs
//   あく まえ → きそデッキで かつ（アンティ・ショップと デッキが あく）→ 4まい もって いる カードは ポイントに → ステージが ひらく
//   → もんだい → ショップ → デッキ（2つに わけた 画面・在庫）→ せいちょう（キャパシティ・パック・もんだい・デッキの わく）
//   → まける → よみこみなおし → まえの 形の セーブ。ぼうけん・こうちくの セーブには さわらない
// 環境変数：URL、OUT（スクリーンショットの保存先）、THEME（classic・gba・clear）、CHROME（つかう chromium の パス）
import { chromium } from 'playwright';
import { existsSync } from 'fs';
const url = process.env.URL || 'http://localhost:8124/';
const out = process.env.OUT || (await import('os')).tmpdir();
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(CHROME) ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [], fails = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const check = (name, ok, got = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${got !== '' ? `（${got}）` : ''}`); if (!ok) fails.push(name); };
const shot = (name) => page.screenshot({ path: `${out}/pb_${name}.png` });
const tap = (sel) => (typeof sel === 'string' ? page.locator(sel).first() : sel).click({ timeout: 3000 }).then(() => true, (e) => { if (e.name === 'TimeoutError') return false; throw e; });
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mtg-packbattle-v1') || 'null'));
const nextStep = () => page.evaluate(() => document.querySelector('.pb-steps .st-ep.next')?.dataset.go || '');
const sheetTitle = () => page.evaluate(() => document.querySelector('#sheet:not([hidden]) .sheet-title')?.textContent || '');
const sheetClick = async (label) => { await page.locator(`#sheet:not([hidden]) button:has-text("${label}")`).first().click(); await page.waitForTimeout(150); };

await page.goto(url);
await page.evaluate((theme) => { localStorage.clear(); localStorage.setItem('mtg-unlock-all', '1'); if (theme) localStorage.setItem('mtg-theme', theme); }, process.env.THEME || '');
await page.reload();
const PB = await page.evaluate(async () => (await import('./js/data/packbattle.js')).PB);

const theme0 = process.env.THEME || 'classic';
const look = () => page.evaluate(() => document.documentElement.dataset.theme);
const count = (st) => Object.values(st.cards).reduce((t, n) => t + n, 0);
// 在庫：どの カードも、ぜんぶの デッキで つかって いる まい数が もって いる まい数を こえない
const stockOk = (st) => { const used = {}; for (const d of st.decks) for (const id of d.cards) used[id] = (used[id] || 0) + 1; return Object.entries(used).every(([id, n]) => n <= (st.cards[id] || 0)); };


const edit = async (fn, arg) => { await page.evaluate(([f, a]) => { const s = JSON.parse(localStorage.getItem('mtg-packbattle-v1')); new Function('s', 'a', f)(s, a); localStorage.setItem('mtg-packbattle-v1', JSON.stringify(s)); }, [fn, arg]); await page.reload(); await page.click('[data-go=pb]'); };
const stockLine = (st) => `${st.pts}P・${count(st)}まい・せいちょう ${st.gp}`;

// ---- ホーム：はじめは 200P・きそデッキ・ドット。ショップ・デッキ・せいちょうは まだ あかない ----
await page.click('[data-go=pb]');
await shot('01_home_first');
let s = await state();
check(`はじめの ポイントは ${PB.start}P`, (await page.textContent('#pb-pts')) === String(PB.start));
check('きそデッキを もって いる（カードは もちものに 入って いる）', s.decks.length === 1 && s.active === s.decks[0].id && count(s) === s.decks[0].cards.length && stockOk(s), `${s.decks[0].name}・${count(s)}まい`);
check('この モードは ドットの みため（きりかえの ボタンは ない）', (await look()) === 'gba' && await page.locator('[data-look]').count() === 0);
check('はじめは「バトル」が つぎ', (await nextStep()) === 'battle');
const lockNote = await page.locator('.pb-steps [data-go=shop]').innerText();
check('あく まえ：ショップ・デッキ・せいちょうは おせない（わけが 出る）', await page.locator('.pb-steps [data-go=shop]:disabled, .pb-steps [data-go=deck]:disabled, .pb-steps [data-go=grow]:disabled').count() === 3 && /1たい たおすと あくよ/.test(lockNote), lockNote.replace(/\s+/g, ' '));
await page.locator('.pb-steps [data-go=shop]').click({ force: true }); await page.locator('.pb-steps [data-go=deck]').click({ force: true });
check('あく まえ：おしても ショップ・デッキに 入れない', await page.locator('.pb-steps').count() === 1 && await page.locator('.cs-sets, .cs-decks, .builder').count() === 0);
check('あく まえ：もんだいは つかえる', await page.locator('.pb-steps [data-go=quiz]:not([disabled])').count() === 1);

// ---- ステージ：はじめは ステージ 1 だけ。あいてを えらべる ----
await page.click('.pb-steps [data-go=battle]');
await shot('02_arena_first');
const faces = await page.evaluate(() => [...document.querySelectorAll('[data-foe] img.pb-face')].map((i) => [i.complete && i.naturalWidth, i.naturalHeight, i.src.startsWith('data:image/png;base64,'), Math.round(i.src.length * 3 / 4)]));
check('ステージ 1 の 5人に 顔グラ（96×96 の ドット絵・1まい 15KB いか）', faces.length === 5 && faces.every((f) => f[0] === 96 && f[1] === 96 && f[2] && f[3] < 15000), faces.map((f) => `${f[3]}B`).join(' '));
check('ステージ 1 の キャラクターが 5人 ならぶ（かった 回数・ひとこと つき）。ステージ 2〜6 は まだ', await page.locator('[data-foe]:not([disabled])').count() === 5 && await page.locator('.pb-dot.lock').count() === 5 && /☆☆☆/.test(await page.locator('[data-foe]').first().innerText()) && await page.locator('.pb-char .pb-line').count() === 5 && /とつげき/.test(await page.locator('[data-foe]').first().innerText()) && await page.locator('[data-go=deck]').count() === 0, (await page.locator('[data-foe]').first().innerText()).replace(/\s+/g, ' '));

// ロボット：passive なら なにも せずに ターンを おわる（まける ため）
async function battle(passive) {
  for (let i = 0; i < 4000; i++) {
    await page.waitForTimeout(30);
    if (!(await page.locator('.battle').count())) return;
    if (await page.locator('#term:not([hidden])').count()) { await page.click('#term'); continue; }
    if (await page.locator('#sheet:not([hidden]) .pick-list').count()) {
      await page.locator('#sheet .pick').first().click();
      if (await page.locator('#sheet [data-ok]:not([disabled])').count()) await page.click('#sheet [data-ok]'); else await page.click('#sheet [data-no]');
      continue;
    }
    if (await page.locator('#sheet:not([hidden]) .num-row').count() || await page.locator('#sheet:not([hidden]) .div-list').count()) { await page.click('#sheet [data-ok]'); continue; }
    if (await page.locator('#sheet:not([hidden]) .sheet-actions button').count()) {
      const title = await sheetTitle();
      if (/かった！|まけて しまった|ひきわけ/.test(title) && !/たいめ/.test(title)) return; // パック＆バトルの けっかの まど
      const btns = page.locator('#sheet .sheet-actions button:not([disabled])');
      if (await btns.count()) await btns.first().click(); else await page.click('#sheet .sheet-back');
      continue;
    }
    if (await page.locator('[data-act=blockauto]').count()) {
      if (!passive) await tap('[data-act=blockauto]');
      if (await tap('[data-act=blockdone]')) await page.locator('[data-act=blockdone]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
      continue;
    }
    if (await page.locator('[data-act=pass]').count()) { await tap('[data-act=pass]'); continue; }
    if (await page.locator('[data-act=damage]').count()) { await tap('[data-act=damage]'); continue; }
    if (!passive) {
      if (await page.locator('[data-act=auto]').count()) { if (await tap('[data-act=auto]')) await tap('[data-act=declare]'); continue; }
      const hand = page.locator('.hand-slot');
      if (await hand.count() && Math.random() < 0.7) { await tap(hand.nth(Math.floor(Math.random() * await hand.count()))); continue; }
      if (await page.locator('[data-act=attack]').count()) { await tap('[data-act=attack]'); continue; }
    }
    if (await page.locator('[data-act=end]').count()) { await tap('[data-act=end]'); continue; }
  }
}

// かった あとの まど：かった！ → アンティ →（ステージが ひらいた）→（ショップと デッキが あいた）。まどの なまえと 中身を かえす
async function afterWin() {
  const seen = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(350);
    const t = await sheetTitle(); if (!t) break;
    seen.push({ title: t, text: (await page.locator('#sheet .sheet-body').innerText()).replace(/\s+/g, ' ') });
    await shot(`win_${seen.length}_${i}`);
    await page.locator('#sheet:not([hidden]) .sheet-actions button').first().click();
  }
  return seen;
}
// あいて k（0 から）に かつ：ライフを 1・デッキを きほんカードだけ に する（ロボットは でたらめに あそぶので、まけたら もう いちど）
async function winFoe(k) {
  await page.evaluate(async (i) => { const m = await import('./js/data/packbattle.js'); const f = m.foesOf(0, 1)[i].kihon; f.life = 1; f.ids = []; }, k);
  const w0 = (await state()).wins;
  for (let t = 0; t < 4 && (await state()).wins === w0; t++) {
    if (t) { await sheetClick('ホームへ'); await page.click('.pb-steps [data-go=battle]'); }
    await page.locator('[data-foe]').nth(k).click();
    await page.waitForTimeout(500);
    await battle(false);
  }
  return afterWin();
}

// ---- 1かちめ：ポイント・せいちょうポイント・アンティ（カード 1まい）。きそデッキで かったので ショップと デッキが あく ----
let before = await state();
let wins = await winFoe(0);
s = await state();
check('かつと ポイントが 入る', s.wins === 1 && s.pts >= before.pts + PB.win && s.pts <= before.pts + PB.win + PB.exact * PB.exactMax, `${before.pts}P → ${s.pts}P`);
check('かつと せいちょうポイント ＋1・あいての かった 回数 ＋1', s.gp === PB.gpWin && Object.values(s.beat).reduce((t, n) => t + n, 0) === 1, `せいちょう ${s.gp}`);
check('アンティ：かつと カードを 1まい もらう（「〇〇を てに いれた！」）', count(s) === count(before) + 1 && wins.some((w) => /アンティ/.test(w.title) && /を てに いれた！/.test(w.text)), wins.map((w) => w.title).join(' → '));
check('きそデッキで 1たい たおすと あく（おしらせが 出る・セーブに のこる）', s.open === 1 && wins.some((w) => /ショップと デッキが かいほう された/.test(w.title)));
check('あいた あと：ショップ・デッキ・せいちょうが おせる', await page.locator('.pb-steps [data-go=shop]:not([disabled]), .pb-steps [data-go=deck]:not([disabled]), .pb-steps [data-go=grow]:not([disabled])').count() === 3);
await shot('03_home_open');
await page.reload(); await page.click('[data-go=pb]');
check('よみこみなおしても あいた まま', (await state()).open === 1 && await page.locator('.pb-steps [data-go=shop]:not([disabled])').count() === 1);

// ---- アンティの 変換と ステージの 解放：のこり 1かちで ステージ 1 を クリア・ステージ 1 の カードは ぜんぶ 4まい に して かつ ----
const pool1 = await page.evaluate(async () => (await import('./js/data/pool1.js')).POOL1);
await edit("for (const id of a) s.cards[id] = 4; s.beat = { 'kihon:kh1': 2, 'kihon:pb2': 3, 'kihon:kh2': 3, 'kihon:pb1': 3, 'kihon:kh3': 3 }; s.wins = 14; s.gp = 14;", pool1);
before = await state();
await page.click('.pb-steps [data-go=battle]');
check(`${PB.need}回ずつ：2回 かった だけでは つぎの ステージは あかない（あと 1回と 出る）`, PB.need === 3 && before.stage === 0 && /あと 1回/.test(await page.locator('.st-ch h3').first().innerText()) && /★★☆/.test(await page.locator('[data-foe]').first().innerText()) && await page.locator('.pb-dot.lock').count() === 5);
wins = await winFoe(0);
s = await state();
const ante = wins.find((w) => /アンティ/.test(w.title));
check(`アンティ：もう 4まい もって いる カードは ＋${PB.anteDupe}P に かわる（カードは ふえない・わかる ように 出る）`, count(s) === count(before) && s.pts >= before.pts + PB.win + PB.anteDupe && /かわった/.test(ante?.text || ''), ante?.text.slice(0, 60));
check(`ステージの ぜんいんを ${PB.need}回ずつ たおすと つぎの ステージが ひらく（おしらせ・せいちょうポイント ＋${PB.gpStage}）`, s.stage === 1 && s.gp === before.gp + PB.gpWin + PB.gpStage && wins.some((w) => /ステージ 2.*かいほう された/.test(w.title)), wins.map((w) => w.title).join(' → '));
// 顔グラの ならび：その ページの ぜんぶの 行に 96×96 の 絵が 72px で 出て、行から はみ出さず、文字と かさならず、よこに スクロール しない
const faceRows = () => page.evaluate(() => { const vw = document.documentElement.clientWidth; return [...document.querySelectorAll('[data-foe]')].map((b) => { const i = b.querySelector('img.pb-face'), t = b.querySelector('.st-title'); if (!i) return { ok: false, why: 'ない' }; const r = b.getBoundingClientRect(), q = i.getBoundingClientRect(), u = t.getBoundingClientRect(); const ok = i.complete && i.naturalWidth === 96 && i.naturalHeight === 96 && Math.round(q.width) === 76 && Math.round(q.height) === 76 && q.left >= r.left && q.right <= r.right && q.top >= r.top && q.bottom <= r.bottom && u.left >= q.right && r.left >= 0 && r.right <= vw && getComputedStyle(i).imageRendering !== 'auto' && document.documentElement.scrollWidth <= vw; return { ok, why: `${Math.round(q.width)}x${Math.round(q.height)} ${Math.round(r.right)}/${vw}`, src: i.src.length }; }); });
let fr = await faceRows();
check('ステージ 2 の あいてにも 顔グラ（5人・行が くずれない）', fr.length === 5 && fr.every((x) => x.ok) && new Set(fr.map((x) => x.src)).size >= 4, fr.map((x) => x.why).join(' '));
check('ひらいた ステージ 2 が えらばれて いる（ステージ 1 にも もどれる）', (await page.locator('.pb-page b').innerText()).trim() === 'ステージ 2' && await page.locator('.pb-dot:not(.lock)').count() === 2 && await page.locator('[data-foe]:not([disabled])').count() === 5);
await shot('04_arena_stage2');
// ---- ステージを めくる：スワイプ・やじるし・下の 点。まだの ステージも 見えるが えらべない ----
const pageName = async () => (await page.locator('.pb-page b').innerText()).trim();
const swipe = async (dir) => { await page.mouse.move(195 + dir * 110, 300); await page.mouse.down(); for (let i = 1; i <= 6; i++) await page.mouse.move(195 + dir * 110 - dir * 220 * i / 6, 300 + i); await page.mouse.up(); await page.waitForTimeout(450); };
await swipe(1); // 右から 左へ：つぎの ステージ
check('左へ スワイプすると つぎの ステージ（まだ あかない ステージも 見える）', (await pageName()) === 'ステージ 3');
await shot('04b_arena_locked');
fr = await faceRows();
check('スワイプで めくった まだの ステージ（ロック中）でも 顔グラが 出て、行が くずれない', fr.length === 5 && fr.every((x) => x.ok), fr.map((x) => x.why).join(' '));
check(`まだの ステージ：えらべない。あく 条件（${PB.need}かいずつ たおすと あく）が 出る`, await page.locator('[data-foe]').count() === 5 && await page.locator('[data-foe]:not([disabled])').count() === 0 && new RegExp(`ステージ 2の ぜんいんを ${PB.need}かいずつ たおすと あく`).test(await page.locator('.pb-lock').innerText()));
await page.locator('[data-foe]').first().click({ force: true }); await page.waitForTimeout(300);
check('まだの ステージの あいてを おしても たたかいに ならない', await page.locator('.pb-arena').count() === 1 && await page.locator('.battle').count() === 0 && !(await sheetTitle()));
await swipe(-1); await swipe(-1); // 左から 右へ：まえの ステージ
check('右へ スワイプすると まえの ステージ', (await pageName()) === 'ステージ 1' && await page.locator('[data-step="-1"]:disabled').count() === 1);
await page.click('[data-step="1"]');
const viaArrow = await pageName();
await page.click('.pb-dot[data-stage="5"]');
check('やじるしと 下の 点でも めくれる（はしでは やじるしが おせない）', viaArrow === 'ステージ 2' && (await pageName()) === 'ステージ 6' && await page.locator('[data-step="1"]:disabled').count() === 1);
{ // ぜんぶの ステージ（ロック中も）の ぜんぶの 行に 顔グラ。ぜんぶで 26しゅるい（ステージ 1 の 5人 ＋ ステージ 2〜6 の 21人）
  const bad = [], kinds = new Set();
  for (let si = 0; si < 6; si++) { await page.click(`.pb-dot[data-stage="${si}"]`); await page.waitForTimeout(120); const rows = await faceRows(); if (!rows.length || !rows.every((x) => x.ok)) bad.push(`${si + 1}:${rows.map((x) => x.why).join(',')}`); (await page.evaluate(() => [...document.querySelectorAll('img.pb-face')].map((i) => i.src))).forEach((u) => kinds.add(u)); if (si === 5) await shot('04c_arena_stage6_faces'); }
  check('ぜんぶの ステージの ぜんぶの 行に 顔グラ（ロック中も・くずれない）', bad.length === 0 && kinds.size >= 5 + 10, bad.join(' ') || `${kinds.size}しゅるい`);
  const all = await page.evaluate(async () => { const m = await import('/js/data/pbfaces.js'), d = await import('/js/data/packbattle.js'); const ids = ['kh1', 'pb2', 'kh2', 'pb1', 'kh3', ...Object.keys(d.PB_CHARS)]; return { n: Object.keys(m.PB_FACES).length, miss: ids.filter((i) => !m.PB_FACES[i]), big: Object.values(m.PB_FACES).filter((u) => u.length * 3 / 4 > 15000).length }; });
  check('顔グラは 26人 ぜんいんぶん（1まい 15KB いか）', all.n === 26 && all.miss.length === 0 && all.big === 0, JSON.stringify(all));
}
await page.click('.pb-dot[data-stage="1"]');

await page.click('.pb-dot[data-stage="0"]');
check('クリアした ステージの あいてとも なんどでも たたかえる', await page.locator('[data-foe]:not([disabled])').count() === 5 && /クリア/.test(await page.locator('[data-foe]').first().innerText()));
await page.click('[data-back]');

// ---- ① もんだい：たしざん・ひきざん だけに して、5もん せいかい → 1もん まちがい → 1もん せいかい ----
const base = (await state()).pts;
await page.click('.pb-steps [data-go=quiz]');
for (const c of ['three', 'ten', 'clock', 'kanji', 'particle']) await page.click(`.qz-cat[data-cat=${c}]`);
await shot('05_quiz_intro');
await page.click('[data-start]');
// しき（□ も）を といて こたえる
const solve = (t) => {
  const m = t.match(/^(\d+|□)([＋−])(\d+|□)(?:([＋−])(\d+))?(?:＝(\d+))?/);
  if (!m) return null;
  const op = (a, o, b) => (o === '＋' ? a + b : a - b);
  if (!m[6]) { let r = op(+m[1], m[2], +m[3]); if (m[4]) r = op(r, m[4], +m[5]); return r; }
  for (let x = 0; x < 100; x++) if (op(m[1] === '□' ? x : +m[1], m[2], m[3] === '□' ? x : +m[3]) === +m[6]) return x;
  return null;
};
const answer = async (right) => {
  await page.locator('.qz-mark[hidden]').waitFor({ state: 'attached', timeout: 5000 });
  // こたえを 書く ところ（.qz-ans）を □ に して よむ
  const text = await page.evaluate(() => { const el = document.querySelector('.qz-text').cloneNode(true); const a = el.querySelector('.qz-ans'); if (a) a.textContent = '□'; return el.textContent.replace(/\s/g, ''); });
  const v = solve(text.replace(/＝□$/, '')) + (right ? 0 : 1);
  for (const d of String(v)) await page.click(`.qz-pad [data-d="${d}"]`);
  await page.click('.qz-pad [data-ok]');
  const note = await page.locator('.qz-mark:not([hidden])').innerText();
  await page.waitForTimeout(right ? 650 : 1400);
  return note.replace(/\s+/g, ' ');
};
const notes = [];
for (const r of [1, 1, 1, 1, 1, 0, 1]) notes.push(await answer(!!r));
const want = base + 6 * PB.quiz + PB.streakBonus;
check('もんだい：せいかいで ポイントが ふえる（5もん れんぞくの ボーナスも）', (await state()).pts === want, `${(await state()).pts}P／${notes[0]}／${notes[4]}`);
await page.locator('main.study.done').waitFor({ timeout: 70000 });
await shot('06_quiz_result');
check('もんだいの けっかに もらった ポイントが 出る', (await page.locator('.qz-gain').innerText()).includes(`＋${want - base}P`));
await page.click('[data-back]');

// ---- ② ショップ：パックを あける（「〇〇を てに いれた！」）----
const openPack = async (id) => {
  let got = '';
  await page.click(`[data-buy=${id}]`); await sheetClick('あける');
  for (let i = 0; i < 400 && await page.locator('.gacha').count(); i++) {
    if (!got && await page.locator('.gacha-hint.got').count()) got = (await page.locator('.gacha-hint.got').innerText()).replace(/\s+/g, ' ');
    for (const [sel, wait] of [['[data-open]', 650], ['[data-flip]', 1100], ['.stage.shown', 400], ['[data-done]', 100]]) {
      if (await page.locator(sel).count()) { await page.click(sel, { force: true }); await page.waitForTimeout(wait); break; }
    }
  }
  return got;
};
await page.click('.pb-steps [data-go=shop]');
await shot('07_shop');
check('ショップ：はじめは 4しゅるいの パック', await page.locator('[data-buy]').count() === 4);
s = await state();
const had = count(s), p0 = s.pts;
const gotLine = await openPack('s2');
s = await state();
check(`パックを あけると ${PB.pack}P へって カードが 8まい ふえる（めくると「〇〇を てに いれた！」）`, s.pts === p0 - PB.pack && count(s) === had + 8 && /を てに いれた！/.test(gotLine), `${s.pts}P・${count(s)}まい・${gotLine}`);
await openPack('s5');
while ((await state()).pts >= PB.pack) await openPack('s2'); // のこりの ポイントも つかう
check('ポイントが たりないと 買えない（もんだいへの あんないが 出る）', await page.locator('[data-buy]:not([disabled])').count() === 0 && await page.locator('.pb-need [data-go=quiz]').count() === 1);
await page.click('[data-back]');
check('あたらしい カードが 入ったら「デッキ」が つぎ', (await nextStep()) === 'deck');
const total = count(await state());

// ---- ③ デッキ：もう 1つ つくる。左に ならび・右（上）に えらんだ カード。カードは デッキの あいだで わけあえない ----
await page.click('.pb-steps [data-go=deck]');
check(`デッキの わくは はじめ ${PB.deckBase}こ`, (await page.locator('[data-new]').innerText()).includes(`1 / ${PB.deckBase}こ`));
await page.click('[data-new]');
await page.locator('.builder.two').waitFor();
await shot('08_builder');
check('デッキを くむ 画面：カードの ならび（なまえ・点・もち・ほか・あと）と えらんだ カードの せつめい', await page.locator('.bp-list .bp-row').count() > 5 && await page.locator('.bp-row .stk.used').count() > 0 && await page.locator('.bp-detail .detail').count() === 1 && /点/.test(await page.locator('.bp-row').first().innerText()));
// ぜんぶ ほかの デッキに 入って いる カード：青く なって、入れられない（わけが 出る）
const locked = page.locator('.bp-row.no').filter({ hasText: 'あと0' }).filter({ has: page.locator('.stk.used') }).first();
const n0 = (await state()).decks[1].cards.length;
await locked.click();
const why = await page.locator('.bp-no').innerText();
check('ほかの デッキで つかって いる カードは 入れられない（青い 行・わけ・ボタンが おせない）', /ほかの デッキで \d+まい つかって いる/.test(why) && await page.locator('.bp-detail [data-pin]:disabled').count() === 1 && await page.locator('.bp-row.no.sel').count() === 1 && (await state()).decks[1].cards.length === n0, why);
await shot('09_builder_locked');
// 入って いる カードを 1まい はずして、また 入れる
await page.locator('.bp-row.in').first().click();
await page.click('.bp-detail [data-pout]');
const n1 = (await state()).decks[1].cards.length;
await page.click('.bp-detail [data-pin]');
check('えらんだ カードを 1まい はずす・入れる', n1 === n0 - 1 && (await state()).decks[1].cards.length === n0);
await page.click('[data-a=ok]');
await page.waitForTimeout(200);
if (await page.locator('#sheet:not([hidden]) button:has-text("デッキの いちらんへ")').count()) await sheetClick('デッキの いちらんへ');
s = await state();
check('2つめの デッキが くめる（在庫を こえない）', s.decks.length === 2 && s.decks[1].cards.length > 0 && stockOk(s), `${s.decks[1].name}・${s.decks[1].cards.length}まい`);
await page.click(`[data-deck=${s.decks[1].id}]`); await sheetClick('この デッキを つかう');
check('つかう デッキを えらべる', (await state()).active === s.decks[1].id && await page.locator('.cs-deck.on').count() === 1);
await page.click(`[data-deck=${s.decks[0].id}]`); await sheetClick('この デッキを つかう');
await page.click(`[data-deck=${s.decks[1].id}]`); await sheetClick('けす'); await sheetClick('けす');
s = await state();
check('デッキを けすと カードは もちものに もどる', s.decks.length === 1 && count(s) === total);
await page.click(`[data-deck=${s.decks[0].id}]`); await sheetClick('けす');
check('つかう デッキを けす まえに「バトルに 出られなく なる」と 出る', /バトルに 出られなく なる/.test(await page.locator('#sheet .sheet-body').innerText()));
await sheetClick('やめる');
await page.click('[data-back]');

// ---- ⑤ せいちょう：せいちょうポイントで できる ことを ふやす（4つの えだ）----
await edit('s.gp = 40;');
await page.click('.pb-steps [data-go=grow]');
await shot('10_grow');
check('せいちょう：4つの えだ（キャパシティ 5・パック 3・もんだい 2・デッキの わく 2）', await page.locator('.em-branch').count() === 4 && await page.locator('.em-node').count() === 12 && (await page.textContent('#pb-gp')) === '40');
const take = async (b, i) => { await page.click(`.em-node[data-b=${b}][data-i="${i}"]`); await sheetClick('とる'); };
await page.click('.em-node[data-b=cap][data-i="1"]'); // じゅんばんを とばせない
check('せいちょう：左から じゅんばんに（とばして とれない）', await page.locator('#sheet:not([hidden]) .sheet-actions').count() === 0 && !(await state()).tree.cap);
await take('cap', 0); await take('pack', 0); await take('quiz', 0); await take('deck', 0);
s = await state();
check('せいちょう：とると せいちょうポイントが へる', s.gp === 40 - 2 - 3 - 4 - 3 && s.tree.cap === 1 && s.tree.pack === 1 && s.tree.quiz === 1 && s.tree.deck === 1, `のこり ${s.gp}`);
await page.click('[data-back]');
// キャパシティ：デッキの 点が 32点まで
await page.click('.pb-steps [data-go=deck]');
check(`デッキの わく：${PB.deckBase + 1}こまでに なる`, (await page.locator('[data-new]').innerText()).includes(`1 / ${PB.deckBase + 1}こ`));
await page.click(`[data-deck=${s.decks[0].id}]`); await sheetClick('なおす');
check(`キャパシティ：デッキの 点が ${PB.cap + PB.capStep}点までに なる`, (await page.locator('.builder .meter').first().innerText()).includes(`/${PB.cap + PB.capStep}点`), (await page.locator('.builder .meter').first().innerText()).replace(/\s+/g, ' '));
await page.click('[data-a=back]'); await page.click('[data-back]');
// パック：ショップに 第3弾
await page.click('.pb-steps [data-go=shop]');
check('パック：ショップに 第3弾が ふえる', await page.locator('[data-buy]').count() === 5 && await page.locator('[data-buy=s3]').count() === 1);
await page.click('[data-back]');
// もんだい：むずかしい（1もん 15P）
await page.click('.pb-steps [data-go=quiz]');
check('もんだい：むずかしさを えらぶ まどが 出る', /むずかしさ/.test(await sheetTitle()) && await page.locator('#sheet button:has-text("むずかしい")').count() === 1);
await sheetClick('むずかしい');
await page.click('[data-start]');
const hp = (await state()).pts;
const hardNote = await answer(true);
check(`もんだい：むずかしい もんだいは 1もん ${PB.quizTier[1]}P`, (await state()).pts === hp + PB.quizTier[1], `${hardNote}・${await page.textContent('.qz-cat-name').catch(() => '')}`);
await page.click('[data-quit]'); await sheetClick('やめる');
// とても むずかしい（文章題）
await edit('s.tree.quiz = 2;');
await page.click('.pb-steps [data-go=quiz]'); await sheetClick('とても むずかしい'); await page.click('[data-start]');
await page.waitForTimeout(300);
await shot('11_quiz_story');
check('もんだい：とても むずかしい は 文章題（こたえの たんい つき）', await page.locator('.qz-story').count() === 1 && /こたえ/.test(await page.locator('.qz-q').innerText()));
const vp = (await state()).pts;
for (const d of '99') await page.click(`.qz-pad [data-d="${d}"]`); // まちがい：ポイントは へらない
await page.click('.qz-pad [data-ok]'); await page.waitForTimeout(1400);
check('まちがえても ポイントは へらない', (await state()).pts === vp);
await page.click('[data-quit]'); await sheetClick('やめる');

// ---- まける：ステージ 1 の 2ばんめに なにも しないで まける → ホームへ。ポイントと カードは そのまま ----
await page.evaluate(async () => { const m = await import('./js/data/packbattle.js'); m.foesOf(0, 1)[1].kihon.life = 99; });
const keep = await state();
await page.click('.pb-steps [data-go=battle]'); await page.click('.pb-dot[data-stage="0"]');
await page.locator('[data-foe]').nth(1).click();
await page.waitForTimeout(600);
check('たたかいの 画面に 顔グラは 出ない', await page.locator('.battle').count() === 1 && await page.locator('img.pb-face').count() === 0);
await battle(true);
await shot('12_lose');
const title = await sheetTitle();
await sheetClick('ホームへ');
s = await state();
check('顔グラは ステージを えらぶ 画面 だけ（たたかいの あと・ホームには 出ない）', await page.locator('img.pb-face').count() === 0);
check('まけたら ホームへ。ポイント・カード・かった 回数は そのまま', /まけて|ひきわけ/.test(title) && await page.locator('.pb-steps').count() === 1 && s.pts === keep.pts && count(s) === count(keep) && s.wins === keep.wins && s.gp === keep.gp, `${title}・${stockLine(s)}`);

// ---- タイトルに もどると せっていの みために もどる。よみこみなおしても つづきから ----
await page.click('[data-back]');
check('タイトルに もどると せっていの みために もどる', (await look()) === theme0, await look());
await page.reload();
check('タイトルの タイルに ポイントと たおした てき', (await page.locator('[data-go=pb]').innerText()).includes(`${s.pts}P`));
await page.click('[data-go=pb]');
const again = await state();
check('よみこみなおしても つづきから', (await page.textContent('#pb-pts')) === String(s.pts) && again.wins === s.wins && count(again) === count(s) && again.stage === 1 && again.gp === s.gp && again.tree.cap === 1);
const other = await page.evaluate(() => [localStorage.getItem('mtg-adventure-v1'), JSON.parse(localStorage.getItem('mtg-collection') || 'null')]);
check('ぼうけん・こうちくの セーブは そのまま', other[0] === null && (!other[1] || (other[1].tickets === 0 && !Object.keys(other[1].cards).length)), JSON.stringify(other[1]));

// ---- まえの 形の セーブを うつす ----
const old = async (v) => { await page.evaluate((x) => localStorage.setItem('mtg-packbattle-v1', JSON.stringify(x)), v); await page.reload(); await page.click('[data-go=pb]'); return state(); };
// いちばん まえ（デッキが 1つ・きそデッキ なし）で 4たい たおして いた：ステージ 1 は クリア、ステージ 2 の 1たいめも クリア
let m = await old({ v: 1, pts: 30, cards: { U01: 2, U02: 2, R01: 3, C01: 1 }, deck: ['U01', 'U01', 'U02', 'U02', 'R01', 'R01', 'R01', 'C01'], wins: 4, seed: 7, quiz: { n: 9, ok: 8, sessions: 2 }, opened: 1, earned: 0, lost: 0 });
check('まえの セーブ（4たい たおした）：ステージ 2 が ひらいて いて、たおした あいては クリア・せいちょうポイントも もらう', m.open === 1 && m.pts === 30 && m.wins === 4 && m.stage === 1 && m.gp === 4 * PB.gpWin + PB.gpStage && Object.values(m.beat).filter((n) => n >= PB.need).length === 6 && m.decks.length === 2 && m.active === 'd1' && stockOk(m), `ステージ ${m.stage + 1}・せいちょう ${m.gp}・${Object.keys(m.beat).join(' ')}`);
await page.click('.pb-steps [data-go=battle]');
check('まえの セーブ：ステージ 2 の 画面に クリアが 1つ', await page.locator('.pb-dot:not(.lock)').count() === 2 && await page.locator('[data-foe].done').count() === 1);
// まだ 1たいも たおして いない：あいて いない。きそデッキで たたかう
m = await old({ v: 1, pts: 30, cards: { U01: 2, U02: 2, R01: 3, C01: 1 }, deck: ['U01', 'U01', 'U02', 'U02', 'R01', 'R01', 'R01', 'C01'], wins: 0, seed: 7, quiz: { n: 9, ok: 8, sessions: 2 }, opened: 1, earned: 0, lost: 0 });
check('まえの セーブ（まだ たおして いない）：あいて いない。きそデッキで たたかう（もとの デッキは のこる）', m.open !== 1 && m.active === 'd0' && m.decks.length === 2 && m.stage === 0 && m.gp === 0 && await page.locator('.pb-steps [data-go=shop]:disabled').count() === 1 && (await nextStep()) === 'battle');
// ひとつ まえ（デッキ 5こ・28たいを じゅんばんに）で 30たい たおして いた：ぜんぶ クリア・むげんの たたかい・デッキは とりあげない
const five = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, name: i ? `デッキ ${i + 1}` : 'きそデッキ', cards: i ? [] : ['W10', 'W10', 'W02', 'W02', 'W03', 'W31', 'W101', 'G01', 'G01', 'G09', 'G11', 'G11', 'C18', 'C18'] }));
m = await old({ v: 2, pts: 500, cards: { W10: 2, W02: 2, W03: 1, W31: 1, W101: 1, G01: 2, G09: 1, G11: 2, C18: 2 }, decks: five, active: 'd0', wins: 30, seed: 7, quiz: { n: 9, ok: 8, sessions: 2 }, opened: 3, earned: 0, lost: 0, starter: 1, open: 1 });
check('まえの セーブ（30たい たおした）：ステージは ぜんぶ クリア・むげんの たたかいの つづきから', m.stage === 6 && m.endless === 2 && m.gp === 30 * PB.gpWin + 6 * PB.gpStage && m.wins === 30, `せいちょう ${m.gp}・むげん ${m.endless}`);
await page.click('.pb-steps [data-go=battle]');
check('むげんの たたかいに いどめる', (await page.locator('.pb-page b').innerText()).trim() === 'むげんの たたかい' && await page.locator('[data-foe=endless]:not([disabled])').count() === 1);
await page.click('[data-back]'); await page.click('.pb-steps [data-go=deck]');
check(`デッキが 5こ ある まえの セーブ：とりあげない。わく（${PB.deckBase}こ）が おいつくまで あたらしく つくれない だけ`, (await state()).decks.length === 5 && await page.locator('.cs-deck').count() === 5 && await page.locator('[data-new]:disabled').count() === 1);

// 2回ずつで ひらいた ころの セーブ（ステージ 1 は 4人を 2回ずつ・ステージ 2 が ひらいて いる）：とじない。かった 回数は そのまま
const starterCards = ['W10', 'W10', 'W02', 'W02', 'W03', 'W31', 'W101', 'G01', 'G01', 'G09', 'G11', 'G11', 'C18', 'C18'];
m = await old({ v: 3, pts: 80, cards: { W10: 2, W02: 2, W03: 1, W31: 1, W101: 1, G01: 2, G09: 1, G11: 2, C18: 2 }, decks: [{ id: 'd0', name: 'きそデッキ', cards: starterCards }], active: 'd0', wins: 9, seed: 7,
  quiz: { n: 9, ok: 8, sessions: 2 }, opened: 1, earned: 0, lost: 0, starter: 1, open: 1, beat: { 'kihon:kh1': 2, 'kihon:kh2': 2, 'kihon:pb1': 2, 'kihon:kh3': 2, 'th-e:0': 1 }, stage: 1, endless: 0, gp: 12, tree: { cap: 1 } });
check('2回ずつで ひらいた セーブ：ステージ 2 は ひらいた まま（とじない）。かった 回数・せいちょうは そのまま', m.stage === 1 && m.beat['kihon:kh1'] === 2 && !m.beat['kihon:pb2'] && m.beat['th-e:0'] === 1 && m.gp === 12 && m.tree.cap === 1 && m.wins === 9, JSON.stringify(m.beat));
await page.click('.pb-steps [data-go=battle]');
check('2回ずつで ひらいた セーブ：ステージ 2 の あいてを えらべる', (await page.locator('.pb-page b').innerText()).trim() === 'ステージ 2' && await page.locator('[data-foe]:not([disabled])').count() === 5 && await page.locator('.pb-dot:not(.lock)').count() === 2);
await page.click('.pb-dot[data-stage="0"]');
check('2回ずつで ひらいた セーブ：ステージ 1 は クリアの まま、あたらしい なかま（メエ）とも たたかえる', /クリア！/.test(await page.locator('.st-ch h3').first().innerText()) && await page.locator('[data-foe]:not([disabled])').count() === 5 && /メエ/.test(await page.locator('.st-ch').innerText()));
// ひらいた しるし（stage）が ない ときも、2回ずつの きまりで ひらいて いた ぶんは ひらく
m = await old({ v: 3, pts: 80, cards: { W10: 2, W02: 2, W03: 1, W31: 1, W101: 1, G01: 2, G09: 1, G11: 2, C18: 2 }, decks: [{ id: 'd0', name: 'きそデッキ', cards: starterCards }], active: 'd0', wins: 10, seed: 7,
  quiz: { n: 9, ok: 8, sessions: 2 }, opened: 1, earned: 0, lost: 0, starter: 1, open: 1, beat: { 'kihon:kh1': 2, 'kihon:pb2': 2, 'kihon:kh2': 2, 'kihon:pb1': 2, 'kihon:kh3': 2 }, endless: 0, gp: 10, tree: {} });
check('2回ずつ たおして いた ステージは、しるしが なくても ひらく', m.stage === 1);

// ---- ステージ 2〜6 の キャラクター：とうの しくみは そのまま、デッキに きめわざが まざる。ボスが いちばん てごわい ちょうせい ----
const sigCheck = await page.evaluate(async () => {
  const m = await import('./js/data/packbattle.js'), g = await import('./js/engine/game.js'), { AI } = await import('./js/engine/ai.js'), { fillDeck } = await import('./js/data/kihon.js'), { BY_ID } = await import('./js/data/cards.js');
  const deck = fillDeck(m.PB_STARTER.cards), bad = [], tower = new Set(), guild = new Set();
  for (let seed = 1; seed <= 12; seed++) for (let si = 1; si < m.PB_STAGES.length; si++) for (const f of m.foesOf(si, seed)) {
    if ((f.buff === 1) !== (f.boss && si >= 3)) bad.push(`buff ${f.key}`);
    if (f.ghost) {
      // ギルドの リーダー：ほんものの カードの デッキ（20まい）を 手札と マナで つかう・きまりが かちかたに 出る・ステージ 5 は カードが ふえる
      guild.add(f.floorId);
      const G = m.PB_GUILD[f.floorId], a = g.newGame({ deck, floor: m.guildFloor(f), diff: f.diff, seed: 5, ai: AI });
      const cards = [...a.E.lib, ...a.E.hand].map((c) => c.def), real = cards.filter((d) => !d.basic), want = G.ids.length + (f.diff === 'hard' ? G.hard.length : 0);
      if (a.floor.id !== 'pvp' || cards.length !== 20 || a.E.hand.length !== 5 || real.length !== want || !real.every((d) => BY_ID[d.id] === d) || a.E.life !== G.life[f.diff === 'hard' ? 1 : 0] || !a.floor.goal().includes(G.rule)) bad.push(`${f.key}:${f.floorId}`);
      continue;
    }
    // とうの しくみで たたかう あいて：しくみの こま・じゅもんは そのまま。きめわざと なかまが 2まいずつ（ボスは 3まいずつ）
    tower.add(f.floorId);
    const mk = (plain) => g.newGame({ deck, floor: m.towerFloor(f, { plain }), diff: f.diff, seed: 5, ai: AI });
    const a = mk(false), b = mk(true), want = f.boss ? m.SIG_COPIES.boss : m.SIG_COPIES.foe, Q = m.PB_PAL[f.floorId];
    const n = (x, k) => x.E.lib.filter((c) => c.def[k]).length;
    const core = (x) => [...x.E.lib.map((c) => c.def), ...x.E.bf.map((p) => p.def)].filter((d) => !d.sig && !d.pal && !(d.types.includes('creature') && d.attacks === true && Object.keys(d).length <= 9)).map((d) => d.name).sort().join('|');
    if (n(a, 'sig') !== want || n(a, 'pal') !== want || a.E.lib.length !== b.E.lib.length + want + (Q.swap ? 0 : want) || core(a) !== core(b) || a.floor.id !== b.floor.id) bad.push(`${f.key}:${f.floorId}`);
  }
  return { bad, tower: tower.size, guild: guild.size };
});
check('ステージ 2〜6：ギルドの リーダー 8人は ほんものの カードの デッキ ＋ ギルドの きまり。のこり 13人は とうの しくみの まま きめわざと なかまが まざる', !sigCheck.bad.length && sigCheck.guild === 8 && sigCheck.tower === 13, `ギルド ${sigCheck.guild}・とう ${sigCheck.tower} ${[...new Set(sigCheck.bad)].slice(0, 5).join(' ')}`);
// ギルドの きまりが うごく：ニヴ＝ミゼット（じゅもんで 1点）・トロスターニ（なえぎ）を AI どうしで 30回ずつ
const ruleCheck = await page.evaluate(async () => {
  const m = await import('./js/data/packbattle.js'), run = await import('./js/engine/run.js'), { fillDeck } = await import('./js/data/kihon.js');
  const deck = fillDeck(m.PB_STARTER.cards), t = m.PB_STAGES[3], out = {};
  for (const id of ['izzet', 'selesnya', 'golgari', 'boros']) {
    let hit = 0, over = 0;
    for (let i = 0; i < 30; i++) {
      const s = await run.fight(deck, null, { floor: m.guildFloor(m.towerFoe({ si: 3, k: 0, diff: t.diff, boss: false }, t, id)), diff: t.diff, seed: 11 + i, log: true });
      if (s.over) over++;
      if (s.logs.some((l) => /ニヴ＝ミゼット：じゅもんで|トロスターニ：なえぎが ふえた|ジャラド：ライフ ＋|大隊/.test(l))) hit++;
    }
    out[id] = [hit, over];
  }
  return out;
});
check('ギルドの きまりが たたかいの 中で うごく（30回ずつ・ぜんぶ さいごまで）', Object.values(ruleCheck).every(([hit, over]) => hit > 0 && over === 30), JSON.stringify(ruleCheck));
// ボルボルグミ（ステージ 5 の 4ばんめ）が 出る セーブ：てごわいので ライフ 26から
const gSeed = await page.evaluate(async () => { const m = await import('./js/data/packbattle.js'); for (let x = 1; x < 400; x++) if (m.foesOf(4, x)[3].floorId === 'gruul') return x; return 0; });
m = await old({ v: 4, pts: 80, cards: { W10: 2, W02: 2, W03: 1, W31: 1, W101: 1, G01: 2, G09: 1, G11: 2, C18: 2 }, decks: [{ id: 'd0', name: 'きそデッキ', cards: starterCards }], active: 'd0', wins: 70, seed: gSeed,
  quiz: { n: 9, ok: 8, sessions: 2 }, opened: 1, earned: 0, lost: 0, starter: 1, open: 1, beat: {}, stage: 4, endless: 0, gp: 0, tree: {} });
await page.click('.pb-steps [data-go=battle]');
await shot('20_arena_stage5');
const rows5 = (await page.locator('.st-ch ol').innerText()).replace(/\s+/g, ' ');
check('えらぶ 画面に きめわざ・ボスの 本気・てごわい あいての ライフが 出る', (await page.locator('.pb-page b').innerText()).trim() === 'ステージ 5' && await page.locator('.pb-char .pb-sig').count() === 5 && /きめわざ「じならし」×2/.test(rows5) && /なかま「あれ地の イノシシ」×2/.test(rows5) && /きみの ライフ ＋6/.test(rows5) && /きめわざ「ジェイスの よみ」×3/.test(rows5) && /じぶんの デッキ（カード \d+まい ＋ きほんカード）で たたかう/.test(rows5) && /きまり：/.test(rows5) && /＋1\/＋1/.test(rows5), rows5.slice(0, 80));
await page.locator('[data-foe]').nth(3).click();
await page.waitForTimeout(500);
const goalText = (await page.locator('#sheet .sheet-body').innerText()).replace(/\s+/g, ' ');
await sheetClick('はじめる');
await page.locator('.battle').waitFor();
check('ボルボルグミ：もとの かちかた（しくみ）の まま、きみの ライフは 26から', /ボルボルグミを たおす/.test(goalText) && /ライフは 26から/.test(goalText) && /きめわざ「じならし」/.test(goalText) && (await page.locator('.me-bar .life b, .life b').first().innerText()).trim() === '26', goalText.slice(0, 70));
await page.waitForTimeout(1500);
await page.click('[data-act=menu]'); await sheetClick('ホームへ もどる');
// ギルドの リーダーとの たたかい：かちかたの まどに きまりが 出て、あいては 手札を もって はじまる
await page.click('.pb-steps [data-go=battle]');
await page.locator('[data-foe]').first().click();
await page.waitForTimeout(500);
const gGoal = (await page.locator('#sheet .sheet-body').innerText()).replace(/\s+/g, ' ');
await sheetClick('はじめる');
await page.locator('.battle').waitFor();
const gTop = (await page.locator('.battle').innerText()).replace(/\s+/g, ' ');
check('ギルドの リーダー：かちかたに ライフと きまり・あいての 手札（てふだ 5）と ライフが 出る', /の ライフを 0に する/.test(gGoal) && /てふだ 5/.test(gTop) && /あいての ライフ/.test(gTop), gGoal.slice(0, 90));
await page.waitForTimeout(1500);
await page.click('[data-act=menu]'); await sheetClick('ホームへ もどる');

console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join('\n')}` : 'no errors');
console.log(fails.length ? `FAILED: ${fails.length}` : 'ALL OK');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
