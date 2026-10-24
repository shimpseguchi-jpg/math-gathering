// ブラウザで ロボットが 冒険を 最後まで あそぶ 通しテスト（Playwright）
//   npx http-server -p 8124 -c-1 . &  →  node mathtcg/tools/e2e.mjs
// 環境変数：URL、OUT（スクリーンショットの保存先）、STEPS、SETS（開発モードで パックに 入れる 弾。例 SETS=3,4,5,6,7）
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
const SETS = process.env.SETS ? process.env.SETS.split(',').map(Number) : null;
await page.evaluate((sets) => { localStorage.clear(); if (sets) localStorage.setItem('mtg-sets', JSON.stringify(sets)); }, SETS);
await page.reload();
const shots = new Set();
async function swipe(from, to) {
  const a = await from.boundingBox(), b = await to.boundingBox();
  if (!a || !b) return;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + a.width / 2 + (b.x - a.x) * i / 8, a.y + a.height / 2 + (b.y + b.height / 2 - a.y - a.height / 2) * i / 8);
  await page.mouse.up(); await page.waitForTimeout(80);
}
const tag = process.env.START ? `s${process.env.START}${process.env.FLOOR3 || ''}_` : '';
const shot = async (name) => { if (shots.has(name)) return; shots.add(name); await page.screenshot({ path: `${out}/mtg_${tag}${name}.png` }); };
await shot('title');
// START=0〜4 で、その階から はじめる（7パックぶんの カードを 持った セーブを つくる）。FLOOR3=factory|slime|twins
// FLOORS=clock,dragon,twins,gorgon,erebos のように 5つの 階を ぜんぶ きめても よい
if (process.env.START) {
  await page.evaluate(async ([start, f3, floors, sets]) => {
    const { openPack } = await import('./js/engine/run.js');
    const pool = []; for (let i = 0; i < 7; i++) pool.push(...openPack(Math.random, { sets: sets || undefined }).map((d) => d.id));
    localStorage.setItem('mtg-adventure-v1', JSON.stringify({ diff: 'easy', pool, deck: null, floors: floors ? floors.split(',') : ['hydra', 'horde', f3, 'xenagos', 'erebos'], idx: start, continues: 9, toOpen: 0, opened: 7, exact: 0 }));
  }, [Number(process.env.START), process.env.FLOOR3 || 'factory', process.env.FLOORS || '', SETS]);
  await page.reload();
  await page.click('[data-go=cont]');
} else await page.click('[data-go=new]');
let ended = false, battles = 0;
for (let i = 0; i < STEPS && !ended; i++) {
  await page.waitForTimeout(30);
  if (await page.locator('#sheet:not([hidden]) .pick-list').count()) {
    await shot(`pick${battles}`);
    const picks = page.locator('#sheet .pick');
    await picks.first().click();
    // 激励・増呪・割り振る：ときどき 2つ えらぶ（マナが たりなければ「マナが たりない」が 出る）
    if (await picks.count() > 1 && Math.random() < 0.3) await picks.nth(1).click();
    if (await page.locator('#sheet [data-ok]:not([disabled])').count()) await page.click('#sheet [data-ok]'); else await page.click('#sheet [data-no]');
    continue;
  }
  if (await page.locator('#sheet:not([hidden]) .num-row').count()) {
    await shot('number');
    if (Math.random() < 0.5 && await page.locator('#sheet .step[data-d="-1"]:not([disabled])').count()) await page.click('#sheet .step[data-d="-1"]');
    await page.click('#sheet [data-ok]');
    continue;
  }
  if (await page.locator('#sheet:not([hidden]) .div-list').count()) { await shot('divide'); await page.click('#sheet [data-ok]'); continue; }
  if (await page.locator('#sheet:not([hidden]) .sheet-actions button').count()) {
    const btns = page.locator('#sheet .sheet-actions button:not([disabled])');
    const n = await btns.count();
    if (n === 0) { await page.click('#sheet .sheet-back'); continue; }
    await shot(`sheet${battles}`);
    await btns.nth(Math.random() < 0.8 ? 0 : n - 1).click();
    continue;
  }
  if (await page.locator('.ending').count()) { await shot('ending'); ended = true; break; }
  if (await page.locator('.gacha').count()) {
    for (const [sel, name, wait] of [['[data-open]', 'pack', 650], ['[data-flip]', 'back', 1100], ['.stage.shown', 'reveal', 400], ['[data-done]', 'summary', 100]]) {
      if (await page.locator(sel).count()) { await shot(`${name}${shots.size}`.replace(/\d+$/, (n) => (+n < 14 ? n : ''))); await page.click(sel, { force: true }); await page.waitForTimeout(wait); break; }
    }
    continue;
  }
  if (await page.locator('.builder').count()) { await shot('builder'); await page.click('[data-a=ok]'); continue; }
  if (await page.locator('.tower').count()) { await shot('tower'); battles++; await page.click('[data-a=go]'); continue; }
  if (await page.locator('.battle').count()) {
    await shot(`battle${battles}`);
    if (await page.locator('[data-act=blockauto]').count()) {
      // スワイプで ブロック（自分の クリーチャー → 攻撃してくる 敵）
      const me = page.locator('.zone.mine .perm.drag'), at = page.locator('.zone.enemy .perm.attacking');
      if (await me.count() && await at.count()) { await swipe(me.first(), at.first()); await shot(`block${battles}`); }
      await page.click('[data-act=blockdone]'); continue;
    }
    if (await page.locator('[data-act=auto]').count()) { await page.click('[data-act=auto]'); await page.click('[data-act=declare]'); continue; }
    // スワイプで 攻撃（自分の クリーチャー → 敵）
    const dr = page.locator('.zone.mine .perm.drag'), en = page.locator('.zone.enemy .perm');
    if (await dr.count() && await en.count() && Math.random() < 0.5) { await swipe(dr.first(), en.first()); continue; }
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
