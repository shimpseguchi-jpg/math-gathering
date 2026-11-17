// パック＆バトル（js/ui/packbattle.js）の 通しテスト（Playwright）：ロボットが ひとまわり あそぶ
//   npx http-server -p 8124 -c-1 . &  →  node tools/e2e_pb.mjs
//   あく まえは ショップ・デッキに 入れない → きそデッキで 1たい たおすと あく → もんだいで ポイントが ふえる → パックが 買える → カードが ふえる
//   → デッキを もう 1つ くむ（カードは デッキの あいだで わけあえない）→ つかう デッキを えらぶ → かって ポイントが 入る
//   → まけても ポイントと カードは そのまま → よみこみなおしても つづきから。ぼうけん・こうちくの セーブには さわらない
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

// ---- ホーム：はじめは 200P・きそデッキ・ドットの みため。ショップと デッキは まだ あかない（「バトル」が つぎ）----
await page.click('[data-go=pb]');
await shot('1_home_first');
let s = await state();
check(`はじめの ポイントは ${PB.start}P`, (await page.textContent('#pb-pts')) === String(PB.start));
check('きそデッキを もって いる（カードは もちものに 入って いる）', s.decks.length === 1 && s.active === s.decks[0].id && count(s) === s.decks[0].cards.length && stockOk(s), `${s.decks[0].name}・${count(s)}まい`);
check('この モードは ドットの みため（きりかえの ボタンは ない）', (await look()) === 'gba' && await page.locator('[data-look]').count() === 0);
check('はじめは「バトル」が つぎ', (await nextStep()) === 'battle');
const lockNote = await page.locator('.pb-steps [data-go=shop]').innerText();
check('あく まえ：ショップと デッキは おせない（わけが 出る）', await page.locator('.pb-steps [data-go=shop]:disabled').count() === 1 && await page.locator('.pb-steps [data-go=deck]:disabled').count() === 1 && /1たい たおすと あくよ/.test(lockNote) && /1たい たおすと あくよ/.test(await page.locator('.pb-steps [data-go=deck]').innerText()), lockNote.replace(/\s+/g, ' '));
await page.locator('.pb-steps [data-go=shop]').click({ force: true }); await page.locator('.pb-steps [data-go=deck]').click({ force: true });
check('あく まえ：おしても ショップ・デッキに 入れない', await page.locator('.pb-steps').count() === 1 && await page.locator('.cs-sets, .cs-decks, .builder').count() === 0);
check('あく まえ：もんだいは つかえる', await page.locator('.pb-steps [data-go=quiz]:not([disabled])').count() === 1);
await page.click('.pb-steps [data-go=battle]');
check('きそデッキで さいしょから「たたかう」が おせる（デッキは かえられない）', await page.locator('[data-go=fight]:not([disabled])').count() === 1 && await page.locator('[data-go=deck]').count() === 0);
await shot('2_arena_first');

// ---- バトル（1たいめ）：きそデッキで かつ → ショップと デッキが あく ----
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
// てきの ライフを 1・デッキを きほんカードだけ に して かつ（ロボットは でたらめに あそぶので、まけたら もう いちど）
await page.evaluate(async () => { const f = (await import('./js/data/kihon.js')).KIHON_FLOORS[0]; f.life = 1; f.ids = []; });
const before = (await state()).pts;
for (let t = 0; t < 4 && (await state()).wins === 0; t++) {
  if (t) { await sheetClick('ホームへ'); check('まけても まだ あかない', (await state()).open !== 1 && await page.locator('.pb-steps [data-go=shop]:disabled').count() === 1); await page.click('.pb-steps [data-go=battle]'); }
  await page.click('[data-go=fight]');
  await page.waitForTimeout(500);
  await shot('2b_battle');
  await battle(false);
}
await shot('2c_win');
s = await state();
check('かつと ポイントが 入る', s.wins === 1 && s.pts >= before + PB.win && s.pts <= before + PB.win + PB.exact * PB.exactMax, `${before}P → ${s.pts}P・たおした てき ${s.wins}`);
check('きそデッキで 1たい たおすと あく（セーブに のこる）', s.open === 1);
await sheetClick('つぎへ');
await page.waitForTimeout(400);
const news = await sheetTitle();
await shot('2d_unlock');
check('あいた ときに おしらせが 出る', /ショップと デッキが かいほう された/.test(news), news);
await sheetClick('やった！');
check('あいた あと：ショップと デッキが おせる・「もんだい」が つぎ', await page.locator('.pb-steps [data-go=shop]:not([disabled])').count() === 1 && await page.locator('.pb-steps [data-go=deck]:not([disabled])').count() === 1 && (await nextStep()) === 'quiz');
await shot('2e_home_open');
await page.reload(); await page.click('[data-go=pb]');
check('よみこみなおしても あいた まま', (await state()).open === 1 && await page.locator('.pb-steps [data-go=shop]:not([disabled])').count() === 1 && await page.locator('.pb-steps [data-go=deck]:not([disabled])').count() === 1);
const base = (await state()).pts;

// ---- ① もんだい：たしざん・ひきざん だけに して、5もん せいかい → 1もん まちがい → 1もん せいかい ----
await page.click('.pb-steps [data-go=quiz]');
for (const c of ['three', 'ten', 'clock', 'kanji', 'particle']) await page.click(`.qz-cat[data-cat=${c}]`);
await shot('3_quiz_intro');
await page.click('[data-start]');
const answer = async (right) => {
  await page.locator('.qz-mark[hidden]').waitFor({ state: 'attached', timeout: 5000 });
  const t = (await page.textContent('.qz-text')).replace(/\s/g, '');
  const m = t.match(/^(\d+)([＋−])(\d+)/);
  const v = (m[2] === '＋' ? +m[1] + +m[3] : +m[1] - +m[3]) + (right ? 0 : 1);
  for (const d of String(v)) await page.click(`.qz-pad [data-d="${d}"]`);
  await page.click('.qz-pad [data-ok]');
  const note = await page.locator('.qz-mark:not([hidden])').innerText();
  await page.waitForTimeout(right ? 650 : 1400);
  return note.replace(/\s+/g, ' ');
};
const notes = [];
for (const r of [1, 1, 1, 1, 1, 0, 1]) notes.push(await answer(!!r));
await shot('4_quiz_run');
const want = base + 6 * PB.quiz + PB.streakBonus;
check('もんだい：せいかいで ポイントが ふえる（5もん れんぞくの ボーナスも）', (await state()).pts === want, `${(await state()).pts}P／${notes[0]}／${notes[4]}`);
// じかんが おわるまで まつ → けっか
await page.locator('main.study.done').waitFor({ timeout: 70000 });
await shot('5_quiz_result');
check('もんだいの けっかに もらった ポイントが 出る', (await page.locator('.qz-gain').innerText()).includes(`＋${want - base}P`), (await page.locator('.qz-gain').innerText()).replace(/\s+/g, ' '));
await page.click('[data-back]');
check('もんだいの あとは「ショップ」が つぎ', (await nextStep()) === 'shop');

// ---- ② ショップ：パックを 2つ あける ----
const openPack = async (id) => {
  await page.click(`[data-buy=${id}]`); await sheetClick('あける');
  for (let i = 0; i < 400 && await page.locator('.gacha').count(); i++) {
    for (const [sel, wait] of [['[data-open]', 650], ['[data-flip]', 1100], ['.stage.shown', 400], ['[data-done]', 100]]) {
      if (await page.locator(sel).count()) { await page.click(sel, { force: true }); await page.waitForTimeout(wait); break; }
    }
  }
};
await page.click('.pb-steps [data-go=shop]');
await shot('6_shop');
const had = count(s);
await openPack('p1');
s = await state();
check(`パックを あけると ${PB.pack}P へって カードが 8まい ふえる`, s.pts === want - PB.pack && count(s) === had + 8, `${s.pts}P・${count(s)}まい`);
await openPack('s1');
s = await state();
check('2つめの パック', s.pts === want - 2 * PB.pack && count(s) === had + 16, `${s.pts}P・${count(s)}まい`);
while ((await state()).pts >= PB.pack) await openPack('p1'); // のこりの ポイントも つかう
s = await state();
check('ポイントが たりないと 買えない（もんだいへの あんないが 出る）', await page.locator('[data-buy]:not([disabled])').count() === 0 && await page.locator('.pb-need [data-go=quiz]').count() === 1);
await shot('7_shop_short');
await page.click('[data-back]');
check('あたらしい カードが 入ったら「デッキ」が つぎ', (await nextStep()) === 'deck');

const total = count(await state());
// ---- ③ デッキ：もう 1つ つくる。カードは デッキの あいだで わけあえない ----
await page.click('.pb-steps [data-go=deck]');
await shot('8_decks');
await page.click('[data-new]');
await page.locator('.builder').waitFor();
await shot('9_builder');
check('デッキを くむ 画面に 在庫が 出る（もち・ほか・あと）', await page.locator('.pool-item .stk.used').count() > 0, (await page.locator('.pool-item .stk.used').first().innerText()));
// ほかの デッキで ぜんぶ つかって いる カードは 入れられない（わけが 出る）
await page.click('[data-mode=quick]');
const lockedTile = page.locator('.pool-item.no:has(.stk.used)').filter({ hasText: 'あと0' }).first(); // ぜんぶ ほかの デッキに 入って いる カード
const before2 = (await state()).decks[1].cards.length;
await lockedTile.click();
await page.waitForTimeout(200);
const toastText = await page.evaluate(() => [...document.querySelectorAll('.toast, #toast, [class*=toast]')].map((e) => e.textContent).join(' '));
check('ほかの デッキで つかって いる カードは 入れられない', (await state()).decks[1].cards.length === before2 && /ほかの デッキで/.test(toastText), toastText.trim());
await page.click('[data-mode=detail]');
await page.click('[data-a=ok]');
await page.waitForTimeout(200);
if (await page.locator('#sheet:not([hidden]) button:has-text("デッキの いちらんへ")').count()) await sheetClick('デッキの いちらんへ');
s = await state();
check('2つめの デッキが くめる（在庫を こえない）', s.decks.length === 2 && s.decks[1].cards.length > 0 && stockOk(s), `${s.decks[1].name}・${s.decks[1].cards.length}まい`);
// つかう デッキを えらぶ → もどす
await page.click(`[data-deck=${s.decks[1].id}]`); await sheetClick('この デッキを つかう');
check('つかう デッキを えらべる', (await state()).active === s.decks[1].id && await page.locator('.cs-deck.on').count() === 1);
await page.click(`[data-deck=${s.decks[0].id}]`); await sheetClick('この デッキを つかう');
await shot('10_decks_two');
// きそデッキ（つかう デッキ）を けそうと すると、バトルに 出られなく なる ことが 出る（2つめを さきに けして から）
await page.click(`[data-deck=${s.decks[1].id}]`); await sheetClick('けす'); await sheetClick('けす');
s = await state();
check('デッキを けすと カードは もちものに もどる', s.decks.length === 1 && count(s) === total);
await page.click(`[data-deck=${s.decks[0].id}]`); await sheetClick('けす');
const warn = await page.locator('#sheet .sheet-body').innerText();
await shot('11_drop_warn');
check('つかう デッキを けす まえに「バトルに 出られなく なる」と 出る', /バトルに 出られなく なる/.test(warn));
await sheetClick('やめる');
await page.click('[data-back]');
check('デッキが かんせい → 「バトル」が つぎ', await page.locator('.pb-stats li.ok').count() === 1 && (await nextStep()) === 'battle');
await shot('12_home_ready');

// ---- ④ バトル（2たいめ）----
await page.click('.pb-steps [data-go=battle]');
check('つぎの てきは 2たいめ', (await page.locator('.pb-foe b').innerText()).startsWith('2たいめ'));
// 2たいめ：なにも しないで まける → ホームに もどる。ポイントと カードは そのまま
await page.evaluate(async () => { const f = (await import('./js/data/kihon.js')).KIHON_FLOORS[1]; f.life = 99; });
const keep = await state();
await page.click('[data-go=fight]');
await battle(true);
await shot('16_lose');
const title = await sheetTitle();
await sheetClick('ホームへ');
s = await state();
check('まけたら ホームへ。ポイントと カードは そのまま', /まけて|ひきわけ/.test(title) && await page.locator('.pb-steps').count() === 1 && s.pts === keep.pts && count(s) === count(keep) && s.wins === 1, `${title}・${s.pts}P・${count(s)}まい`);
check('まけた あとは カードを ふやす あんない（ポイントが あれば「ショップ」、なければ「もんだい」）', (await nextStep()) === (s.pts >= PB.pack ? 'shop' : 'quiz'), await nextStep());
await shot('17_home_lost');

// ---- タイトルに もどると せっていの みために もどる ----
await page.click('[data-back]');
check('タイトルに もどると せっていの みために もどる', (await look()) === theme0, await look());

// ---- セーブ：よみこみなおしても つづきから。ほかの モードの セーブには さわらない ----
await page.reload();
check('タイトルの タイルに ポイントと たおした てき', (await page.locator('[data-go=pb]').innerText()).includes(`${s.pts}P`));
await shot('18_title');
await page.click('[data-go=pb]');
const again = await state();
check('よみこみなおしても つづきから', (await page.textContent('#pb-pts')) === String(s.pts) && again.wins === 1 && count(again) === count(s) && again.decks.length === s.decks.length && again.active === s.active);
const other = await page.evaluate(() => [localStorage.getItem('mtg-adventure-v1'), JSON.parse(localStorage.getItem('mtg-collection') || 'null')]);
check('ぼうけん・こうちくの セーブは そのまま', other[0] === null && (!other[1] || (other[1].tickets === 0 && !Object.keys(other[1].cards).length)), JSON.stringify(other[1]));

// ---- まえの 形の セーブ（デッキが 1つ・きそデッキ なし）：デッキは のこって、きそデッキと その カードが ふえる ----
await page.evaluate(() => localStorage.setItem('mtg-packbattle-v1', JSON.stringify({ v: 1, pts: 30, cards: { U01: 2, U02: 2, R01: 3, C01: 1 }, deck: ['U01', 'U01', 'U02', 'U02', 'R01', 'R01', 'R01', 'C01'], wins: 4, seed: 7, quiz: { n: 9, ok: 8, sessions: 2 }, opened: 1, earned: 0, lost: 0 })));
await page.reload(); await page.click('[data-go=pb]');
const mig = await state();
check('まえの 形の セーブを ひきつぐ（もう 1たい たおして いれば あいて いる）', mig.open === 1 && await page.locator('.pb-steps [data-go=shop]:not([disabled])').count() === 1 && mig.pts === 30 && mig.wins === 4 && mig.decks.length === 2 && mig.active === 'd1' && mig.decks[1].cards.length === 8 && stockOk(mig) && await page.locator('.pb-stats li.ok').count() === 1, mig.decks.map((d) => d.name).join('・'));

// まえの 形の セーブで まだ 1たいも たおして いない：あいて いない。きそデッキで たたかう
await page.evaluate(() => localStorage.setItem('mtg-packbattle-v1', JSON.stringify({ v: 1, pts: 30, cards: { U01: 2, U02: 2, R01: 3, C01: 1 }, deck: ['U01', 'U01', 'U02', 'U02', 'R01', 'R01', 'R01', 'C01'], wins: 0, seed: 7, quiz: { n: 9, ok: 8, sessions: 2 }, opened: 1, earned: 0, lost: 0 })));
await page.reload(); await page.click('[data-go=pb]');
const mig0 = await state();
check('まだ たおして いない まえの セーブは あいて いない（きそデッキで たたかう。もとの デッキは のこる）', mig0.open !== 1 && mig0.active === 'd0' && mig0.decks.length === 2 && await page.locator('.pb-steps [data-go=shop]:disabled').count() === 1 && await page.locator('.pb-stats li.ok').count() === 1 && (await nextStep()) === 'battle');

console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join('\n')}` : 'no errors');
console.log(fails.length ? `FAILED: ${fails.length}` : 'ALL OK');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
