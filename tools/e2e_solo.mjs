// 単体版「パック＆バトル だけの ゲーム」（packbattle-standalone.html）の 通しテスト（Playwright）
//   node tools/build_standalone.mjs  →  node tools/e2e_solo.mjs
//   できた 1つの ファイルを file:// で じかに ひらいて、ロボットが あそぶ（サーバーは いらない）
//   ① ひらくと すぐ パック＆バトルの ホーム ② ほかの モードへの 入口が ない ③ あく まえは ショップ・デッキに 入れない
//   ④ きそデッキで 1たい たおすと あく・よみこみなおしても あいた まま ⑤ もんだい → ポイント → ショップ → デッキ → バトル
//   アンティ（かつと カード 1まい）・せいちょう・まえの 形の セーブも。そとへの 通信が 1つも ない ことも しらべる
// 環境変数：FILE（しらべる HTML）、OUT（スクリーンショットの保存先）、TRIES（1たいめに いどむ 回数。ロボットは でたらめに あそぶ）、CHROME
import { chromium } from 'playwright';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const FILE = resolve(process.env.FILE || join(dirname(fileURLToPath(import.meta.url)), '..', 'packbattle-standalone.html'));
const url = pathToFileURL(FILE).href;
const out = process.env.OUT || (await import('os')).tmpdir();
const TRIES = Number(process.env.TRIES || 12);
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(CHROME) ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [], fails = [], outside = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('request', (r) => { if (!/^(file:|data:|blob:|about:)/.test(r.url()) || (r.url().startsWith('file:') && r.url() !== url)) outside.push(r.url()); });
const check = (name, ok, got = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${got !== '' ? `（${got}）` : ''}`); if (!ok) fails.push(name); };
const shot = (name) => page.screenshot({ path: `${out}/solo_${name}.png` });
const tap = (sel) => (typeof sel === 'string' ? page.locator(sel).first() : sel).click({ timeout: 3000 }).then(() => true, (e) => { if (e.name === 'TimeoutError') return false; throw e; });
const KEY = 'mtg-packbattle-solo-v1';
const state = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const nextStep = () => page.evaluate(() => document.querySelector('.pb-steps .st-ep.next')?.dataset.go || '');
const sheetTitle = () => page.evaluate(() => document.querySelector('#sheet:not([hidden]) .sheet-title')?.textContent || '');
const sheetClick = async (label) => { await page.locator(`#sheet:not([hidden]) button:has-text("${label}")`).first().click(); await page.waitForTimeout(150); };
const count = (st) => Object.values(st.cards).reduce((t, n) => t + n, 0);
const stockOk = (st) => { const used = {}; for (const d of st.decks) for (const id of d.cards) used[id] = (used[id] || 0) + 1; return Object.entries(used).every(([id, n]) => n <= (st.cards[id] || 0)); };
// ほかの モードへの 入口：タイトル・ぼうけん などの ことば、パック＆バトル いがいの data-go、タイトルの 画面
const OTHER = /タイトル|ぼうけん|こうちく|オンライン|ずかん|トロフィー|もんしょう|ストーリー|チュートリアル|つめマス|次元|レイド|工房|せってい/;
const seen = [];
async function noRoutes(where) {
  const r = await page.evaluate(() => ({
    text: `${document.getElementById('app').innerText} ${document.querySelector('#sheet:not([hidden])')?.innerText || ''}`,
    go: [...document.querySelectorAll('[data-go]')].map((b) => b.dataset.go),
    title: document.querySelectorAll('main.title .t-menu, .tile, [data-back="1"].btn.ghost[data-title]').length,
  }));
  const bad = [...(r.text.match(OTHER) || []), ...r.go.filter((g) => !['quiz', 'shop', 'deck', 'battle', 'grow', 'rt'].includes(g)), ...(r.title ? ['title'] : [])];
  seen.push(where);
  if (bad.length) { console.log(`FAIL ほかの モードへの 入口が ある：${where}（${bad.join('・')}）`); fails.push(`routes:${where}`); }
}

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();

// ---- ① ひらくと すぐ パック＆バトルの ホーム（タイトルを とおらない）・ドットの みため ----
await page.locator('.pb-steps').waitFor({ timeout: 10000 });
await shot('1_home');
let s = await state();
check('① ひらくと すぐ パック＆バトルの ホーム', await page.locator('main.pb .pb-steps').count() === 1 && await page.locator('main.title').count() === 0 && (await page.locator('main.pb h2').innerText()).includes('パック'));
check('みためは ドット', await page.evaluate(() => document.documentElement.dataset.theme) === 'gba' && await page.evaluate(() => document.fonts.check('16px DotGothic16')));
check('単体版の セーブ（本編とは べつの キー・solo の しるし）', !!s && s.solo === 1 && s.pts === 200 && await page.evaluate(() => localStorage.getItem('mtg-packbattle-v1')) === null, KEY);
check('「タイトルへ」の ボタンが ない（おとの きりかえは ある）', await page.locator('[data-back]').count() === 0 && await page.locator('[data-snd]').count() === 1);
await noRoutes('ホーム');

// ---- ③ あく まえ：ショップと デッキは おせない。もんだいと バトルは つかえる ----
check('③ はじめは「バトル」が つぎ', (await nextStep()) === 'battle');
const lockNote = await page.locator('.pb-steps [data-go=shop]').innerText();
check('③ あく まえ：ショップと デッキは おせない（わけが 出る）', await page.locator('.pb-steps [data-go=shop]:disabled').count() === 1 && await page.locator('.pb-steps [data-go=deck]:disabled').count() === 1 && /1たい たおすと あくよ/.test(lockNote), lockNote.replace(/\s+/g, ' '));
await page.locator('.pb-steps [data-go=shop]').click({ force: true }); await page.locator('.pb-steps [data-go=deck]').click({ force: true });
check('③ あく まえ：おしても ショップ・デッキに 入れない', await page.locator('.pb-steps').count() === 1 && await page.locator('.cs-sets, .cs-decks, .builder').count() === 0);

// ---- ⑤ もんだい：あく まえから つかえる。せいかいで ポイントが ふえる ----
await page.click('.pb-steps [data-go=quiz]');
await noRoutes('もんだいの はじめ');
for (const c of ['three', 'ten', 'clock', 'kanji', 'particle']) await page.click(`.qz-cat[data-cat=${c}]`);
await page.click('[data-start]');
const answer = async (right) => {
  await page.locator('.qz-mark[hidden]').waitFor({ state: 'attached', timeout: 5000 });
  const t = (await page.textContent('.qz-text')).replace(/\s/g, '');
  const m = t.match(/^(\d+)([＋−])(\d+)/);
  const v = (m[2] === '＋' ? +m[1] + +m[3] : +m[1] - +m[3]) + (right ? 0 : 1);
  for (const d of String(v)) await page.click(`.qz-pad [data-d="${d}"]`);
  await page.click('.qz-pad [data-ok]');
  await page.waitForTimeout(right ? 650 : 1400);
};
for (const r of [1, 1, 1, 1, 1, 0, 1]) await answer(!!r);
await shot('2_quiz');
check('⑤ もんだい：せいかいで ポイントが ふえる（5もん れんぞくの ボーナスも）', (await state()).pts === 200 + 70, `${(await state()).pts}P`);
await page.click('[data-quit]'); await noRoutes('もんだいを やめる まど'); await sheetClick('やめる');
check('もんだいを やめても ポイントは のこる・ホームに もどる', (await state()).pts === 270 && await page.locator('.pb-steps').count() === 1);

// ---- ④ バトル（1たいめ）：きそデッキで かつ → ショップと デッキが あく ----
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
      if (await hand.count() && Math.random() < 0.92) // 手札を たくさん つかってから こうげき（かちやすく）
        { await tap(hand.nth(Math.floor(Math.random() * await hand.count()))); continue; }
      if (await page.locator('[data-act=attack]').count()) { await tap('[data-act=attack]'); continue; }
    }
    if (await page.locator('[data-act=end]').count()) { await tap('[data-act=end]'); continue; }
  }
}

await page.click('.pb-steps [data-go=battle]');
await noRoutes('バトルの 画面');
check('きそデッキで さいしょから ステージ 1 の キャラクター（5人・ひとこと つき）を えらべる（デッキは かえられない・ステージ 2〜 は まだ）', await page.locator('[data-foe]:not([disabled])').count() === 5 && await page.locator('.pb-char .pb-line').count() === 5 && await page.evaluate(() => [...document.querySelectorAll('[data-foe] img.pb-face')].filter((i) => i.complete && i.naturalWidth === 96).length) === 5 && await page.locator('[data-go=deck]').count() === 0 && await page.locator('.pb-dot.lock').count() === 6);
// ステージを めくる：スワイプと やじるし。まだの ステージは 見えるが えらべない
const pageName = async () => (await page.locator('.pb-page b').innerText()).trim();
const swipe = async (dir) => { await page.mouse.move(195 + dir * 110, 300); await page.mouse.down(); for (let i = 1; i <= 6; i++) await page.mouse.move(195 + dir * 110 - dir * 220 * i / 6, 300 + i); await page.mouse.up(); await page.waitForTimeout(450); };
await swipe(1);
await noRoutes('まだの ステージ');
await shot('3a_stage_locked');
check('左へ スワイプで つぎの ステージ：まだ あかない（えらべない・あく 条件が 出る）', (await pageName()) === 'ステージ 2' && await page.locator('[data-foe]:not([disabled])').count() === 0 && /ステージ 1の ぜんいんを 3かいずつ たおすと あく/.test(await page.locator('.pb-lock').innerText()) && await page.locator('.pb-char .pb-sig').count() === 5);
await page.click('[data-step="-1"]');
check('やじるしで もどれる', (await pageName()) === 'ステージ 1' && await page.locator('[data-foe]:not([disabled])').count() === 5);
// たたかいの メニュー：ホームへ もどる だけ
await page.locator('[data-foe]').first().click();
await page.waitForTimeout(400);
if (await page.locator('#sheet:not([hidden]) button:has-text("はじめる")').count()) await sheetClick('はじめる');
await page.locator('.battle').waitFor();
await page.waitForTimeout(1500);
await page.click('[data-act=menu]');
await noRoutes('たたかいの メニュー');
await shot('3_battle_menu');
await sheetClick('ホームへ もどる');
check('たたかいの メニューからは ホームへ もどる だけ', await page.locator('.pb-steps').count() === 1);
// ロボットは でたらめに あそぶので、かつまで なんどか いどむ
let tries = 0;
for (; tries < TRIES && (await state()).wins === 0; tries++) {
  if (tries) { await sheetClick('ホームへ'); if (tries === 1) check('まけても まだ あかない（ポイントと カードは そのまま）', (await state()).open !== 1 && (await state()).pts === 270 && await page.locator('.pb-steps [data-go=shop]:disabled').count() === 1); }
  await page.click('.pb-steps [data-go=battle]');
  await page.locator('[data-foe]').first().click();
  await page.waitForTimeout(500);
  await battle(false);
}
await shot('4_win');
s = await state();
check(`④ きそデッキで 1たい たおした（${tries}回め）：ポイントが 入って、ショップと デッキが あく`, s.wins === 1 && s.open === 1 && s.pts >= 270 + 50 && s.gp === 1, `${s.pts}P`);
await sheetClick('つぎへ');
await page.waitForTimeout(400);
const anteText = (await page.locator('#sheet .sheet-body').innerText()).replace(/\s+/g, ' ');
await shot('4b_ante');
check('アンティ：かつと カードを 1まい もらう（「〇〇を てに いれた！」）', /アンティ/.test(await sheetTitle()) && /を てに いれた！/.test(anteText) && count(s) === 15, anteText.slice(0, 50));
await noRoutes('アンティの まど');
await sheetClick('つぎへ');
await page.waitForTimeout(400);
const news = await sheetTitle();
await shot('5_unlock');
check('④ あいた ときに おしらせが 出る', /ショップと デッキが かいほう された/.test(news), news);
await noRoutes('あいた おしらせ');
await sheetClick('やった！');
check('④ あいた あと：ショップと デッキが おせる', await page.locator('.pb-steps [data-go=shop]:not([disabled])').count() === 1 && await page.locator('.pb-steps [data-go=deck]:not([disabled])').count() === 1);
await page.reload();
await page.locator('.pb-steps').waitFor();
check('④ よみこみなおしても あいた まま（すぐ ホーム）', (await state()).open === 1 && await page.locator('.pb-steps [data-go=shop]:not([disabled])').count() === 1 && await page.locator('main.title').count() === 0);

// ---- ⑤ ショップ：パックを あける ----
const openPack = async (id) => {
  await page.click(`[data-buy=${id}]`); await sheetClick('あける');
  for (let i = 0; i < 400 && await page.locator('.gacha').count(); i++) {
    if (i === 3) await noRoutes('パックを あける 画面');
    for (const [sel, wait] of [['[data-open]', 650], ['[data-flip]', 1100], ['.stage.shown', 400], ['[data-done]', 100]]) {
      if (await page.locator(sel).count()) { await page.click(sel, { force: true }); await page.waitForTimeout(wait); break; }
    }
  }
};
await page.click('.pb-steps [data-go=shop]');
await noRoutes('ショップ');
await shot('6_shop');
const had = count(s), pts0 = s.pts;
await openPack('p1'); await openPack('s1');
s = await state();
check('⑤ ショップ：パックを 2つ あけると 200P へって カードが 16まい ふえる', s.pts === pts0 - 200 && count(s) === had + 16, `${s.pts}P・${count(s)}まい`);
check('単体版：ずかん・トロフィー・ぼうけん・こうちくの セーブを つくらない', await page.evaluate(() => Object.keys(localStorage).filter((k) => /zukan|troph|adventure|collection|spire|kihon|emblem/.test(k)).length) === 0, await page.evaluate(() => Object.keys(localStorage).join(' ')));
await page.click('[data-back]');

// ---- ⑤ デッキ：もう 1つ くんで、つかう デッキに する ----
await page.click('.pb-steps [data-go=deck]');
await noRoutes('デッキの いちらん');
await page.click('[data-new]');
await page.locator('.builder').waitFor();
await noRoutes('デッキを くむ 画面');
await shot('7_builder');
check('⑤ デッキ：カードの ならびに 在庫が 出る（もち・ほか・あと）・えらんだ カードの せつめい', await page.locator('.bp-row .stk.used').count() > 0 && await page.locator('.bp-detail .detail').count() === 1);
await page.click('[data-a=ok]');
await page.waitForTimeout(200);
if (await page.locator('#sheet:not([hidden]) button:has-text("デッキの いちらんへ")').count()) await sheetClick('デッキの いちらんへ');
s = await state();
check('⑤ デッキ：2つめの デッキが くめる（在庫を こえない）', s.decks.length === 2 && s.decks[1].cards.length >= 6 && stockOk(s), `${s.decks[1].name}・${s.decks[1].cards.length}まい`);
await page.click(`[data-deck=${s.decks[1].id}]`); await noRoutes('デッキの まど'); await sheetClick('この デッキを つかう');
check('⑤ デッキ：つかう デッキを えらべる', (await state()).active === s.decks[1].id);
await page.click('[data-back]');

// ---- ⑤ バトル：くんだ デッキで 2たいめに 出られる ----
await page.click('.pb-steps [data-go=battle]');
check('⑤ バトル：くんだ デッキで あいてを えらべる（1たいめには かった 回数が つく）', await page.locator('[data-foe]:not([disabled])').count() === 5 && /★☆☆/.test(await page.locator('[data-foe]').first().innerText()) && (await page.locator('.deckline').innerText()).includes(s.decks[1].name));
await page.locator('[data-foe]').nth(1).click();
await page.waitForTimeout(400);
if (await page.locator('#sheet:not([hidden]) button:has-text("はじめる")').count()) await sheetClick('はじめる');
await page.locator('.battle').waitFor();
await shot('8_battle2');
check('⑤ バトル：たたかいが はじまる', await page.locator('.battle .hand-slot').count() > 0);
await page.waitForTimeout(1500);
await page.click('[data-act=menu]'); await sheetClick('ホームへ もどる');

// ---- せいちょう：せいちょうポイントで デッキの わくを ふやす ----
const edit = async (v) => { await page.evaluate(([k, x]) => { const st = typeof x === 'string' ? Object.assign(JSON.parse(localStorage.getItem(k)), JSON.parse(x)) : x; localStorage.setItem(k, JSON.stringify(st)); }, [KEY, v]); await page.reload(); await page.locator('.pb-steps').waitFor(); return state(); };
await edit('{"gp":10}');
await page.click('.pb-steps [data-go=grow]');
await noRoutes('せいちょう');
await shot('9_grow');
await page.click('.em-node[data-b=deck][data-i="0"]'); await noRoutes('せいちょうの まど'); await sheetClick('とる');
s = await state();
check('せいちょう：せいちょうポイントで できる ことが ふえる（デッキの わく 3 → 4）', s.gp === 7 && s.tree.deck === 1);
await page.click('[data-back]'); await page.click('.pb-steps [data-go=deck]');
check('デッキの わくが 4こに なって いる', (await page.locator('[data-new]').innerText()).includes('2 / 4こ'));
await page.click('[data-back]');

// ---- まえの 形の セーブ（単体版・28たいを じゅんばんに）：3たい たおして いた → ステージ 2 が ひらいて いる ----
const keepSave = await state();
let m = await edit({ v: 2, solo: 1, pts: 120, cards: { W10: 2, W02: 2, W03: 1, W31: 1, W101: 1, G01: 2, G09: 1, G11: 2, C18: 2 }, decks: [{ id: 'd0', name: 'きそデッキ', cards: ['W10', 'W10', 'W02', 'W02', 'W03', 'W31', 'W101', 'G01', 'G01', 'G09', 'G11', 'G11', 'C18', 'C18'] }], active: 'd0', wins: 3, seed: 9, quiz: { n: 4, ok: 4, sessions: 1 }, opened: 0, earned: 0, lost: 0, starter: 1, open: 1 });
check('まえの 形の セーブを うつす：ステージ 2 が ひらいて いる・せいちょうポイントも もらう', m.stage === 1 && m.gp === 3 + 3 && m.pts === 120 && m.wins === 3 && Object.values(m.beat).filter((n) => n >= 3).length === 5 && m.open === 1, `ステージ ${m.stage + 1}・せいちょう ${m.gp}`);
await page.click('.pb-steps [data-go=battle]');
check('まえの セーブ：ステージ 2 の あいてを えらべる', (await page.locator('.pb-page b').innerText()).trim() === 'ステージ 2' && await page.locator('[data-foe]:not([disabled])').count() === 5);
await page.click('[data-back]');
await edit(keepSave);

// ---- リアルタイムたいせんの 入口：この ファイル だけでは つながらない ことが 出る（サーバー＝GAS に のせると あそべる。tools/rt_e2e.mjs）----
await page.click('.pb-steps [data-go=rt]');
await page.waitForSelector('main.rt');
await noRoutes('リアルタイムたいせん（つながって いない）');
const rtOff = (await page.locator('main.rt').innerText()).replace(/\s+/g, ' ');
await shot('rt_offline');
check('リアルタイムたいせんの 入口が ある：サーバーに つながって いない ことと、あそぶには GAS に のせる ことが 出る（へやは つくれない）', /つながって いない/.test(rtOff) && /GAS/.test(rtOff) && /あいことば/.test(rtOff) && await page.locator('[data-r=make], [data-r=join]').count() === 0, rtOff.slice(0, 80));
await page.click('[data-r=back]');
check('リアルタイムたいせんから ホームへ もどれる（セーブは かわらない）', await page.locator('.pb-steps').count() === 1);

// ---- はじめから やりなおす（ためしに あそぶ 用）----
await page.click('[data-reset]'); await noRoutes('やりなおす まど'); await sheetClick('やりなおす');
s = await state();
check('はじめから やりなおす：はじめの じょうたいに もどる', s.pts === 200 && s.wins === 0 && s.open !== 1 && s.decks.length === 1 && s.gp === 0 && !Object.keys(s.beat).length && !Object.keys(s.tree).length && await page.locator('.pb-steps [data-go=shop]:disabled').count() === 1);

check(`② ほかの モードへの 入口が ない（${seen.length}の 画面：${seen.join('・')}）`, !fails.some((f) => f.startsWith('routes:')));
check('そとへの 通信が ない（この ファイル 1つだけ）', outside.length === 0, outside.slice(0, 3).join(' '));
console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join('\n')}` : 'no errors');
console.log(fails.length ? `FAILED: ${fails.length}` : 'ALL OK');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
