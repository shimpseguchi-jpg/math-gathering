// ブラウザで ロボットが 冒険を 最後まで あそぶ 通しテスト（Playwright）
//   npx http-server -p 8124 -c-1 . &  →  node tools/e2e.mjs
// 環境変数：URL、OUT（スクリーンショットの保存先）、STEPS、SETS（開発モードで パックに 入れる 弾。例 SETS=3,4,5,6,7）、CHROME（つかう chromium の パス）
//   PLANE（せかい。例 PLANE=strixhaven SETS=1,2,5）、DIFF（むずかしさ。例 DIFF=easy）：タイトルで えらんでから はじめる
//   THEME（みため：classic・gba・clear。せっていの「みため」と おなじ）
//   SPIRE=1：次元渡り（大人向けモード。docs/SPIRE.md）を あそぶ。SPIRE_GOD=1 で ライフと 金貨を ふやして 最後まで
import { chromium } from 'playwright';
import { existsSync } from 'fs';
const url = process.env.URL || 'http://localhost:8124/';
const out = process.env.OUT || (await import('os')).tmpdir();
const STEPS = Number(process.env.STEPS || 3000);
// 決めうちの chromium が ない 環境では、playwright の ふつうの chromium を 使う
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(CHROME) ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
const SETS = process.env.SETS ? process.env.SETS.split(',').map(Number) : null;
await page.evaluate(([sets, theme]) => { localStorage.clear(); localStorage.setItem('mtg-unlock-all', '1'); if (sets) localStorage.setItem('mtg-sets', JSON.stringify(sets)); if (theme) localStorage.setItem('mtg-theme', theme); }, [SETS, process.env.THEME || '']); // ぜんぶ あそべる：ひらく じゅんばん（unlock.js）を とばす
await page.reload();
const shots = new Set();
async function swipe(from, to) {
  const a = await from.boundingBox(), b = await to.boundingBox();
  if (!a || !b) return;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + a.width / 2 + (b.x - a.x) * i / 8, a.y + a.height / 2 + (b.y + b.height / 2 - a.y - a.height / 2) * i / 8);
  await page.mouse.up(); await page.waitForTimeout(80);
}
// たたかいの ボタン・手札：しらべた あとに シートが 出ると おせない。30びょう またずに、つぎの まわりで やりなおす
const tap = (sel) => (typeof sel === 'string' ? page.locator(sel).first() : sel).click({ timeout: 3000 }).then(() => true, (e) => { if (e.name === 'TimeoutError') return false; throw e; });
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
} else if (process.env.SPIRE) {
  await page.click('[data-go=spire]');
  await shot('spire_menu');
  await page.click('[data-a=new]');
  // SPIRE_GOD=1：ライフと金貨を ふやした セーブで つづける（お店・休憩所・ボス・幕の かわりめまで 見る）
  if (process.env.SPIRE_GOD) {
    await page.evaluate(() => { const R = JSON.parse(localStorage.getItem('mtg-spire-v1')); R.maxLife = R.life = 999; R.gold = 999; localStorage.setItem('mtg-spire-v1', JSON.stringify(R)); });
    await page.reload(); await page.click('[data-go=spire]'); await page.click('[data-a=cont]');
  }
} else {
  if (process.env.PLANE) await page.locator(`label:has(#plane-${process.env.PLANE})`).click();
  if (process.env.DIFF) await page.locator(`label:has(#diff-${process.env.DIFF})`).click();
  await page.click('[data-go=new]');
}
let ended = false, battles = 0;
for (let i = 0; i < STEPS && !ended; i++) {
  await page.waitForTimeout(30);
  // 用語の せつめい（点線の ことばを 長おし・2回タップで 出る。画面 ぜんぶを おおう）：タップで とじる
  if (await page.locator('#term:not([hidden])').count()) { await shot('term'); await page.click('#term'); continue; }
  // ぼうけんの まえの しゅぎょう：はじめて すぐ やめる → もんしょうの 画面 →「ぼうけんへ すすむ」
  if (await page.locator('main.study [data-start]').count()) { await shot('gate'); await page.click('main.study [data-start]'); continue; }
  if (await page.locator('main.study.run [data-quit]').count() && !(await page.locator('#sheet:not([hidden])').count())) { await page.click('main.study.run [data-quit]'); await page.click('#sheet button:has-text("やめる")'); continue; }
  if (await page.locator('main.emblem [data-back]').count()) { await shot('gate_emblem'); await page.click('main.emblem [data-back]'); continue; }
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
  // 次元渡り：マップ・報酬・お店・カードを えらぶ 画面
  if (await page.locator('.sp-mapscreen').count()) { await shot(`spire_map${battles}`); battles++; const n = page.locator('.sp-node.can'); await n.nth(Math.floor(Math.random() * await n.count())).click(); continue; }
  if (await page.locator('.sp-reward').count()) { await shot('spire_reward'); if (Math.random() < 0.7) await page.locator('.sp-reward [data-pick]').first().click(); else await page.click('[data-a=skip]'); continue; }
  if (await page.locator('.sp-shop').count()) { await shot('spire_shop'); const b = page.locator('.sp-shop [data-buy]:not([disabled])'); if (await b.count() && Math.random() < 0.5) await b.nth(Math.floor(Math.random() * await b.count())).click(); else await page.click('[data-a=leave]'); continue; }
  if (await page.locator('.sp-pick').count()) { await shot('spire_pick'); await page.locator('.sp-pick [data-card]:not([disabled])').first().click(); continue; }
  if (await page.locator('.sp-menu').count() && shots.has('spire_menu') && battles > 0) { ended = true; break; }
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
      if (await me.count() && await at.count()) { await swipe(me.first(), at.first()); await shot(`block${battles}`); await page.waitForTimeout(400); } // スワイプの すぐあとの タップは むしされる
      // 「ブロック けってい」の あとも、こうげきの 演出（fx.lunge）が おわるまで ボタンが のこる。2どおし しないよう、きえるまで まつ
      if (await tap('[data-act=blockdone]')) await page.locator('[data-act=blockdone]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
      continue;
    }
    if (await page.locator('[data-act=auto]').count()) { if (await tap('[data-act=auto]')) await tap('[data-act=declare]'); continue; }
    // スワイプで 攻撃（自分の クリーチャー → 敵）
    const dr = page.locator('.zone.mine .perm.drag'), en = page.locator('.zone.enemy .perm');
    if (await dr.count() && await en.count() && Math.random() < 0.5) { await swipe(dr.first(), en.first()); continue; }
    // てきの ターンの インスタント（defend・eot の まど）：光っている カードが あれば ときどき 使う、なければ つぎへ
    if (await page.locator('[data-act=pass]').count()) { // てきの ターンの まど：光っている 手札か クリーチャーの 能力を 使う。なければ つぎへ
      const r = Math.random();
      if (r < 0.5 && await page.locator('.hand-slot.ok').count()) await tap('.hand-slot.ok');
      else if (r < 0.75 && await page.locator('.zone.mine .perm.ab, .zone.mine .perm.ab-big').count()) await tap('.zone.mine .perm.ab, .zone.mine .perm.ab-big');
      else await tap('[data-act=pass]');
      continue;
    }
    if (await page.locator('[data-act=damage]').count()) { await tap('[data-act=damage]'); continue; }
    // 手札を1まい ためす → 使えたら 使う、だめなら マナに
    const hand = page.locator('.hand-slot');
    if (await hand.count() && Math.random() < 0.7) { await tap(hand.nth(Math.floor(Math.random() * await hand.count()))); continue; }
    if (await page.locator('[data-act=attack]').count()) { await tap('[data-act=attack]'); continue; }
    if (await page.locator('[data-act=end]').count()) { await tap('[data-act=end]'); continue; }
  }
}
await page.screenshot({ path: `${out}/mtg_last.png` });
console.log(await page.evaluate(() => document.querySelector('.banner')?.textContent + ' | ' + document.querySelector('.actions')?.textContent));
console.log(ended ? 'ending reached' : 'not finished', 'battles', battles);
console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join('\n')}` : 'no errors');
await browser.close();
