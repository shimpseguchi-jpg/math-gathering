// パック＆バトル（js/ui/packbattle.js）の 通しテスト（Playwright）：ロボットが ひとまわり あそぶ
//   npx http-server -p 8124 -c-1 . &  →  node tools/e2e_pb.mjs
//   もんだいで ポイントが ふえる → パックが 買える → カードが ふえる → デッキが くめる → バトルに 出られる → かって ポイントが 入る
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

// ---- ホーム：はじめは 200P・「もんだい」が つぎ ----
await page.click('[data-go=pb]');
await shot('1_home_first');
check(`はじめの ポイントは ${PB.start}P`, (await page.textContent('#pb-pts')) === String(PB.start));
check('はじめは「もんだい」が つぎ', (await nextStep()) === 'quiz');
// デッキが ないと バトルに 出られない（たりない ことが 出る）
await page.click('.pb-steps [data-go=battle]');
check('デッキが ないと「たたかう」は おせない', await page.locator('[data-go=fight]:disabled').count() === 1 && await page.locator('.pb-need .pb-list li').count() > 0, await page.locator('.pb-need').innerText().catch(() => ''));
await shot('2_arena_nodeck');
await page.click('[data-back]');

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
const want = PB.start + 6 * PB.quiz + PB.streakBonus;
check('もんだい：せいかいで ポイントが ふえる（5もん れんぞくの ボーナスも）', (await state()).pts === want, `${(await state()).pts}P／${notes[0]}／${notes[4]}`);
// じかんが おわるまで まつ → けっか
await page.locator('main.study.done').waitFor({ timeout: 70000 });
await shot('5_quiz_result');
check('もんだいの けっかに もらった ポイントが 出る', (await page.locator('.qz-gain').innerText()).includes(`＋${want - PB.start}P`), (await page.locator('.qz-gain').innerText()).replace(/\s+/g, ' '));
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
await openPack('p1');
let s = await state();
const count = (st) => Object.values(st.cards).reduce((t, n) => t + n, 0);
check(`パックを あけると ${PB.pack}P へって カードが 8まい ふえる`, s.pts === want - PB.pack && count(s) === 8, `${s.pts}P・${count(s)}まい`);
await openPack('s1');
s = await state();
check('2つめの パック', s.pts === want - 2 * PB.pack && count(s) === 16, `${s.pts}P・${count(s)}まい`);
check('ポイントが たりないと 買えない（もんだいへの あんないが 出る）', await page.locator('[data-buy]:not([disabled])').count() === 0 && await page.locator('.pb-need [data-go=quiz]').count() === 1);
await shot('7_shop_short');
await page.click('[data-back]');
check('カードが そろったら「デッキ」が つぎ', (await nextStep()) === 'deck');

// ---- ③ デッキ：おまかせで くんで けってい ----
await page.click('.pb-steps [data-go=deck]');
await page.locator('.builder').waitFor();
await shot('8_builder');
await page.click('[data-a=ok]');
s = await state();
check('デッキが くめる（もって いる カード だけ）', s.deck.length >= PB.minCards && s.deck.every((id) => s.cards[id] > 0), `${s.deck.length}まい`);
check('デッキが かんせい → 「バトル」が つぎ', await page.locator('.pb-stats li.ok').count() === 1 && (await nextStep()) === 'battle');
await shot('9_home_ready');

// ---- ④ バトル ----
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
// 1たいめ：てきの ライフを 1・デッキを きほんカードだけ に して かつ（ロボットは でたらめに あそぶので、まけたら もう いちど）
await page.evaluate(async () => { const f = (await import('./js/data/kihon.js')).KIHON_FLOORS[0]; f.life = 1; f.ids = []; });
await page.click('.pb-steps [data-go=battle]');
await shot('10_arena');
const before = (await state()).pts;
for (let t = 0; t < 4 && (await state()).wins === 0; t++) {
  if (t) { await sheetClick('ホームへ'); await page.click('.pb-steps [data-go=battle]'); }
  await page.click('[data-go=fight]');
  await page.waitForTimeout(500);
  await shot('11_battle');
  await battle(false);
}
await shot('12_win');
s = await state();
check('かつと ポイントが 入って つぎの てきへ', s.wins === 1 && s.pts >= before + PB.win && s.pts <= before + PB.win + PB.exact * PB.exactMax, `${before}P → ${s.pts}P・たおした てき ${s.wins}`);
await sheetClick('つぎの てきへ');
check('つぎの てきは 2たいめ', (await page.locator('.pb-foe b').innerText()).startsWith('2たいめ'));

// 2たいめ：なにも しないで まける → ホームに もどる。ポイントと カードは そのまま
await page.evaluate(async () => { const f = (await import('./js/data/kihon.js')).KIHON_FLOORS[1]; f.life = 99; });
const keep = await state();
await page.click('[data-go=fight]');
await battle(true);
await shot('13_lose');
const title = await sheetTitle();
await sheetClick('ホームへ');
s = await state();
check('まけたら ホームへ。ポイントと カードは そのまま', /まけて|ひきわけ/.test(title) && await page.locator('.pb-steps').count() === 1 && s.pts === keep.pts && count(s) === count(keep) && s.wins === 1, `${title}・${s.pts}P・${count(s)}まい`);
check('まけた あとは カードを ふやす あんない（ポイントが あれば「ショップ」、なければ「もんだい」）', (await nextStep()) === (s.pts >= PB.pack ? 'shop' : 'quiz'), await nextStep());
await shot('14_home_lost');

// ---- セーブ：よみこみなおしても つづきから。ほかの モードの セーブには さわらない ----
await page.reload();
check('タイトルの タイルに ポイントと たおした てき', (await page.locator('[data-go=pb]').innerText()).includes(`${s.pts}P`));
await shot('15_title');
await page.click('[data-go=pb]');
const again = await state();
check('よみこみなおしても つづきから', (await page.textContent('#pb-pts')) === String(s.pts) && again.wins === 1 && count(again) === count(s) && again.deck.length === s.deck.length);
const other = await page.evaluate(() => [localStorage.getItem('mtg-adventure-v1'), JSON.parse(localStorage.getItem('mtg-collection') || 'null')]);
check('ぼうけん・こうちくの セーブは そのまま', other[0] === null && (!other[1] || (other[1].tickets === 0 && !Object.keys(other[1].cards).length)));

console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join('\n')}` : 'no errors');
console.log(fails.length ? `FAILED: ${fails.length}` : 'ALL OK');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
