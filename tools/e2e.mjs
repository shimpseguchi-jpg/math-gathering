// ブラウザで ロボットが 冒険を 最後まで あそぶ 通しテスト（Playwright）
//   npx http-server -p 8124 -c-1 . &  →  node mathtcg/tools/e2e.mjs
// 環境変数：URL、OUT（スクリーンショットの保存先）、STEPS
import { chromium } from 'playwright';
const url = process.env.URL || 'http://localhost:8124/mathtcg/';
const out = process.env.OUT || (await import('os')).tmpdir();
const STEPS = Number(process.env.STEPS || 3000);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
const shots = new Set();
const tag = process.env.START ? `s${process.env.START}${process.env.FLOOR3 || ''}_` : '';
const shot = async (name) => { if (shots.has(name)) return; shots.add(name); await page.screenshot({ path: `${out}/mtg_${tag}${name}.png` }); };
await shot('title');
// START=0〜4 で、その階から はじめる（7パックぶんの カードを 持った セーブを つくる）。FLOOR3=factory|slime
if (process.env.START) {
  await page.evaluate(async ([start, f3]) => {
    const { openPack } = await import('./js/engine/run.js');
    const pool = []; for (let i = 0; i < 7; i++) pool.push(...openPack(Math.random).map((d) => d.id));
    localStorage.setItem('mtg-adventure-v1', JSON.stringify({ diff: 'easy', grade: 2, pool, deck: null, floors: ['hydra', 'horde', f3, 'xenagos', 'erebos'], idx: start, continues: 9, toOpen: 0, opened: 7, asked: 0, ok: 0 }));
  }, [Number(process.env.START), process.env.FLOOR3 || 'factory']);
  await page.reload();
  await page.click('[data-go=cont]');
} else await page.click('[data-go=new]');
let ended = false, battles = 0;
for (let i = 0; i < STEPS && !ended; i++) {
  await page.waitForTimeout(30);
  if (await page.locator('#quiz:not([hidden]) [data-c=ok]').count()) {
    await shot('quiz');
    // 問題の答えは画面から計算できないので、正解・まちがいを まぜる
    if (Math.random() < 0.5) await page.click('#quiz [data-c=skip]'); else { await page.click('#quiz [data-n="3"]'); await page.click('#quiz [data-c=ok]'); }
    await page.waitForTimeout(1800);
    continue;
  }
  if (await page.locator('#sheet:not([hidden]) .sheet-actions button').count()) {
    const btns = page.locator('#sheet .sheet-actions button:not([disabled])');
    const n = await btns.count();
    if (n === 0) { await page.click('#sheet .sheet-back'); continue; }
    await shot(`sheet${battles}`);
    await btns.nth(Math.random() < 0.8 ? 0 : n - 1).click();
    continue;
  }
  if (await page.locator('.ending').count()) { await shot('ending'); ended = true; break; }
  if (await page.locator('.packs').count()) { await shot('packs'); const all = page.locator('[data-all]'); if (await all.count()) await all.click(); else await page.click('[data-next]'); continue; }
  if (await page.locator('.builder').count()) { await shot('builder'); await page.click('[data-a=ok]'); continue; }
  if (await page.locator('.tower').count()) { await shot('tower'); battles++; await page.click('[data-a=go]'); continue; }
  if (await page.locator('.battle').count()) {
    await shot(`battle${battles}`);
    if (await page.locator('[data-act=blockauto]').count()) { await page.click('[data-act=blockauto]'); await page.click('[data-act=blockdone]'); continue; }
    if (await page.locator('[data-act=auto]').count()) { await page.click('[data-act=auto]'); await page.click('[data-act=declare]'); continue; }
    if (await page.locator('[data-act=damage]').count()) { await page.click('[data-act=damage]'); continue; }
    // 手札を1まい ためす → 使えたら 使う、だめなら マナに
    const hand = page.locator('.hand-slot');
    if (await hand.count() && Math.random() < 0.7) { await hand.nth(Math.floor(Math.random() * await hand.count())).click(); continue; }
    if (await page.locator('[data-act=attack]').count()) { await page.click('[data-act=attack]'); continue; }
    if (await page.locator('[data-act=end]').count()) { await page.click('[data-act=end]'); continue; }
  }
}
await page.screenshot({ path: `${out}/mtg_last.png` });
console.log(await page.evaluate(() => document.querySelector('.banner')?.textContent + ' | ' + document.querySelector('.actions')?.textContent));
console.log(ended ? 'ending reached' : 'not finished', 'battles', battles);
console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join('\n')}` : 'no errors');
await browser.close();
