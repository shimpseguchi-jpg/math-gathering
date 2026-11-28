// 合体版「Mathematics of the Gathering〜さんすうオリパ〜」（sansu-oripa.html）の 通しテスト（Playwright）
// つかいかた：node tools/build_oripa.mjs && node tools/e2e_oripa.mjs   （FILE=… OUT=… TRIES=…）
//   がくしゅう → コイン → せいちょう（たんげん・パックを ひらく）→ ショップ（100コイン）→ かいふう → デッキ → バトル の ひとまわり、
//   たんげんの ロック、がくしゅうの せいちょうポイント（1回 だけ）、えんしゅつの だんかい、セーブの キー、そとへの 通信が ない こと
import { chromium } from 'playwright';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const FILE = resolve(process.env.FILE || join(dirname(fileURLToPath(import.meta.url)), '..', 'sansu-oripa.html'));
const base = pathToFileURL(FILE).href, url = `${base}#dbg`;
const out = process.env.OUT || (await import('os')).tmpdir();
const TRIES = Number(process.env.TRIES || 12);
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(CHROME) ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [], fails = [], outside = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('request', (r) => { if (!/^(file:|data:|blob:|about:)/.test(r.url()) || (r.url().startsWith('file:') && r.url().split('#')[0] !== base)) outside.push(r.url()); });
const check = (name, ok, got = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${got !== '' ? `（${got}）` : ''}`); if (!ok) fails.push(name); };
const shot = (name) => page.screenshot({ path: `${out}/oripa_${name}.png` });
const tap = (sel) => (typeof sel === 'string' ? page.locator(sel).first() : sel).click({ timeout: 3000 }).then(() => true, (e) => { if (e.name === 'TimeoutError') return false; throw e; });
const KEY = 'motg-sansu-oripa-v1';
const state = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const sheetTitle = () => page.evaluate(() => document.querySelector('#sheet:not([hidden]) .sheet-title')?.textContent || '');
const sheetClick = async (label) => { await page.locator(`#sheet:not([hidden]) button:has-text("${label}")`).first().click(); await page.waitForTimeout(150); };
const count = (st) => Object.values(st.cards).reduce((t, n) => t + n, 0);
const peek = () => page.evaluate(() => window.__oripaTest.peek());
const poke = (o) => page.evaluate((x) => window.__oripaTest.poke(x), o);
const text = async (sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ');
const TM = [1, 4, 6, 10, 10];
const multOf = (q, combo) => Math.max(q.lucky ? 3 : 1, combo >= 10 ? 3 : combo >= 5 ? 2 : 1, TM[q.tier || 0]);
const keys = async (v) => { for (const d of String(v)) await page.click(`[data-key="${d}"]`); await page.click('[data-ent]'); };
// いまの もんだいを 出るまで まつ（入力を うけない 0.35びょうと、せいかいの あとの 1.3びょう）
// いまの もんだいが 出おわる（出しかたの えんしゅつ・せいかいの あとの 1.3びょう）まで まつ
const ready = async () => { for (let i = 0; i < 120; i++) { const q = await peek(); if (q && !q.busy && !q.spin && !(await page.locator('#lq-ask').count())) break; await page.waitForTimeout(60); } await page.waitForTimeout(60); return peek(); };
// せいかいする。もらえる はずの コインを かえす。ask：スーパーフィーバーを きかれたら どう こたえるか（null：きかれない はず）
let asked = 0;
async function solve({ ask = 0 } = {}) {
  const q = await ready(); let coin = 0;
  if (q.word) {
    await page.click(`[data-tok="${q.kw[0]}"]`); coin += 10; await page.waitForTimeout(120);
    if (q.tri) { await page.click(`[data-op="${q.o1}"]`); await page.waitForTimeout(120); await page.click(`[data-op="${q.o2}"]`); } else await page.click(`[data-op="${q.op}"]`);
    coin += 10; await page.waitForTimeout(120);
  }
  await keys(q.ans);
  const combo = q.combo + 1; coin += 10 * multOf(q, combo);
  await page.waitForTimeout(200);
  const pops = await page.evaluate(() => [...document.querySelectorAll('#lfx .lfx-pop:not(.gp):not(.mini)')].map((p) => ({ c: p.className, t: p.innerText.replace(/\s+/g, ' '), z: getComputedStyle(document.getElementById('lfx')).zIndex })));
  // スーパーフィーバーの しつもん（1.3びょう あと）
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(100); if (await page.locator('#lq-ask').count()) { asked++; await page.click(`#lq-ask [data-v="${ask}"]`); await page.waitForTimeout(ask ? 2000 : 100); break; } const p = await peek(); if (p && !p.busy) break; }
  return { q, coin, combo, pops };
}

await page.goto(url);
await page.evaluate(() => localStorage.clear());
// まえの アプリの セーブ（さわらない ことを しらべる ための しるし）。合体版は キーの あたまに motg-sansu-oripa: を つける ので、ほんものの キーは じかに 書く
await page.evaluate(() => { const set = Object.getPrototypeOf(Storage.prototype.setItem) && Storage.prototype.setItem; });
await page.reload();
await page.locator('.pb-steps').waitFor();

// ---- ① タイトルと ホーム ----
const home0 = await text('main.pb');
await shot('01_home');
check('① アプリの なまえ（タイトル・ホーム）', (await page.title()) === 'Mathematics of the Gathering〜さんすうオリパ〜' && /Mathematics of the Gathering/.test(home0) && /さんすうオリパ/.test(home0));
check('① ホームに「がくしゅう」の 入口。コインと せいちょうポイントが 見える（200コイン・0）', await page.locator('.pb-steps [data-go=learn]').count() === 1 && (await text('#pb-pts')) === '200' && (await text('#pb-gp-home')) === '0' && /コイン/.test(await text('.pb-stats')) && /せいちょうポイント/.test(await text('.pb-stats')));
check('① まえからの 入口（もんだい・ショップ・デッキ・バトル・せいちょう）が ある。はじめから おせる。リアルタイムたいせんは ない', (await page.locator('.pb-steps [data-go]').evaluateAll((xs) => xs.map((x) => `${x.dataset.go}${x.disabled ? '×' : ''}`).join())) === 'learn,grow,shop,deck,battle,quiz');
check('① はじめは「がくしゅう」が つぎ。ことばは「コイン」（「P」「ポイント」と 言わない。せいちょうポイントは べつ）', (await page.evaluate(() => document.querySelector('.pb-steps .st-ep.next')?.dataset.go)) === 'learn' && !/\dP\b/.test(home0) && !/(?<!せいちょう)ポイント/.test(home0.replace(/\d+ポイント|せいちょうポイント ?\d* ?ポイント/g, '')), home0.slice(0, 60));
let s = await state();
check('① セーブ：この アプリ だけの キー。がくしゅうの すすみ・コイン・せいちょうポイント・カード・デッキ', s && s.oripa === 1 && s.pts === 200 && s.gp === 0 && s.open === 1 && s.learn && Object.keys(s.learn.units).join() === 'add,sub,mix,word' && count(s) === 14 && s.decks.length === 1);

// ---- ② がくしゅう：たんげんの ロック ----
await page.click('.pb-steps [data-go=learn]');
await shot('02_learn_menu');
check('② たんげんは 4つ。はじめは たしざん・ひきざん だけ えらべる（まぜまぜ・ぶんしょうもんだいは ロック）', (await page.locator('[data-unit]').evaluateAll((xs) => xs.map((x) => `${x.dataset.unit}${x.dataset.locked ? '×' : ''}`).join())) === 'add,sub,mix×,word×' && /せいちょうポイント 3/.test(await text('[data-unit=mix]')) && /せいちょうポイント 5/.test(await text('[data-unit=word]')));
await page.click('[data-unit=mix]');
check('② ロックの たんげんを おすと もんだいは 出ない（せいちょうの ページへ）', await page.locator('.lq-board').count() === 0 && /せいちょう/.test(await text('main.pb h2')) && (await peek()) === null);
check('② せいちょう：「がくしゅう」の 枝（まぜまぜ 3・ぶんしょうもんだい 5）が「パック」の 枝とは べつに ある。まえからの 枝も そのまま', (await page.locator('.em-branch').evaluateAll((xs) => xs.map((x) => x.dataset.branch).join())) === 'learn,cap,pack,quiz,deck' && /まぜまぜ/.test(await text('.em-node[data-b=learn][data-i="0"]')) && /3ポイント/.test(await text('.em-node[data-b=learn][data-i="0"]')) && /5ポイント/.test(await text('.em-node[data-b=learn][data-i="1"]')) && await page.locator('.em-branch[data-branch=pack] .em-node').count() === 13 && await page.locator('.em-node').count() === 24);
await page.click('[data-back]'); await page.click('.pb-steps [data-go=learn]');

// ---- ③ たしざん：まちがい → ヒント。せいかい → コイン ----
await page.click('[data-unit=add]');
// もんだいの 出しかた（けいさんオリパの えんしゅつ）：出て いる あいだは 入力を うけない
await page.waitForTimeout(150);
const sp = await page.evaluate(() => { const q = window.__oripaTest.peek(), e = document.getElementById('lq-eq'); return { spin: q.spin, pres: q.pres, cls: e.className, reels: document.querySelectorAll('#lq-eq .lq-reel').length, spinning: document.querySelectorAll('#lq-eq .lq-reel.spin').length, ans: q.ans }; });
await page.click('[data-key="1"]'); await page.click('[data-ent]');
const spIn = await page.evaluate(() => ({ t: document.getElementById('lq-ans').innerText.trim(), miss: document.querySelectorAll('#lq-hint').length }));
check('③ もんだいの 出しかた：スロット・ガチャだま・カードめくり・サイコロの どれかで 出る（3つの ます）。出て いる あいだは 入力できない', sp.spin === true && ['slot', 'gacha', 'card', 'dice'].includes(sp.pres) && sp.reels === 3 && sp.spinning >= 2 && new RegExp({ slot: 'slotq', gacha: 'gq', card: 'cq', dice: 'dq' }[sp.pres]).test(sp.cls) && spIn.t === '？' && spIn.miss === 0, JSON.stringify(sp));
let q = await ready();
const spEnd = await page.evaluate(() => ({ spinning: document.querySelectorAll('#lq-eq .lq-reel.spin').length, hit: document.querySelectorAll('#lq-eq .lq-reel.hit').length, t: document.getElementById('lq-eq').innerText.replace(/\s/g, '') }));
check('③ 出しおわると ますが とまって、式が そろう（数は もんだいと おなじ）', spEnd.spinning === 0 && spEnd.hit === 3 && spEnd.t === `${q.a}＋${q.b}＝？`, JSON.stringify(spEnd));
await shot('03_quiz');
const eqBox = await page.evaluate(() => { const e = document.getElementById('lq-eq'), b = document.getElementById('lq-board'); return { fs: parseFloat(getComputedStyle(e).fontSize), fit: e.scrollWidth <= b.clientWidth && document.documentElement.scrollWidth <= document.documentElement.clientWidth, t: e.innerText.replace(/\s/g, '') }; });
check('③ もんだい：式が 大きい 字で 出て、画面に おさまる（くりあがりの たしざん）', eqBox.fs >= 34 && eqBox.fit && q.op === '+' && !q.tri && q.ans >= 11 && q.ans <= 18 && eqBox.t === `${q.a}＋${q.b}＝？`, JSON.stringify(eqBox));
await keys(q.ans === 11 ? 12 : 11); await page.waitForTimeout(250);
const wrong = await page.evaluate(() => ({ pops: [...document.querySelectorAll('#lfx .lfx-pop')].map((p) => p.className + '|' + p.innerText.trim()), cf: document.querySelectorAll('#lfx .lfx-cf, #lfx .lfx-star, #lfx .lfx-beams').length, quake: !!document.querySelector('.lq-quake'), hint: document.getElementById('lq-hint')?.innerText.replace(/\s+/g, ' ') || '', skip: document.querySelectorAll('[data-skip]').length, fs: parseFloat(getComputedStyle(document.querySelector('#lfx .lfx-pop')).fontSize) }));
await shot('04_wrong');
check('③ まちがい：小さく やさしい 表示 だけ（大きい 字・ゆれ・かみふぶき なし）。コインは そのまま', wrong.pops.length === 1 && /mini/.test(wrong.pops[0]) && /おしい/.test(wrong.pops[0]) && wrong.cf === 0 && !wrong.quake && wrong.fs <= 20 && (await state()).pts === 200, JSON.stringify(wrong).slice(0, 200));
check('③ 1回 まちがえると ヒントが 出る（10の まとまり）。ふつうの もんだいに パスは ない', /あと/.test(wrong.hint) && /10/.test(wrong.hint) && wrong.skip === 0, wrong.hint);
await keys(q.ans === 11 ? 12 : 11); await page.waitForTimeout(250);
check('③ 2回 まちがえても ふつうの もんだいに パスは 出ない（けいさんオリパと おなじ）', await page.locator('[data-skip]').count() === 0);
let pts = 200, r = await solve();
pts += 10 * (r.q.lucky ? 3 : 1); // まちがえた あとの せいかい：れんぞくは 0 の まま
s = await state();
check('③ せいかい：10コイン（ラッキー・ゾロめは 3ばい）。まちがえた もんだい なので れんぞくは 0', s.pts === pts && s.learn.combo === 0 && s.learn.units.add.ok === 1 && /p0/.test(r.pops[0]?.c) && /できた/.test(r.pops[0]?.t) && /コイン ＋/.test(r.pops[0]?.t), `${s.pts} / ${pts}・${JSON.stringify(r.pops[0])}`);

// ---- ④ れんぞく せいかい：えんしゅつの だんかい・フィーバー・3つの かず・せいちょうポイント ----
const seen = [];
for (let i = 0; i < 9; i++) { // 2〜10もんめ。スーパーフィーバーは「はいらない」
  r = await solve({ ask: 0 }); pts += r.coin; seen.push(r);
}
s = await state();
const byCombo = (c) => seen.find((x) => x.combo === c);
check('④ コイン：1もん 10 × ばいりつ（5れんぞく から 2ばい。ラッキーは 3ばい。かさねない）で ぴったり ふえる', s.pts === pts && s.learn.combo === 9, `${s.pts} / ${pts}`);
check('④ えんしゅつ：1〜2れんぞくは 小さい 表示', /p0/.test(byCombo(1).pops[0].c) && /p0/.test(byCombo(2).pops[0].c));
check('④ えんしゅつ：3〜4れんぞくは まんなかに 大きい 字（ナイス！・いいね！）', /p1/.test(byCombo(3).pops[0].c) && /3コンボ.*ナイス/.test(byCombo(3).pops[0].t) && /いいね/.test(byCombo(4).pops[0].t));
check('④ えんしゅつ：5〜7れんぞくは フィーバー（大きい 字）、8れんぞく からは とくだい。ことばが だんかいで かわる', /p2/.test(byCombo(5).pops[0].c) && /フィーバー/.test(byCombo(5).pops[0].t) && /すごい/.test(byCombo(6).pops[0].t) && /p3/.test(byCombo(8).pops[0].c) && /すごすぎる/.test(byCombo(8).pops[0].t));
check('④ えんしゅつの そうは いちばん 手前', Number(seen[0].pops[0].z) >= 2147480000);
check('④ スーパーフィーバーは 5もん れんぞくで 1回 だけ きかれる（「はいらない」の あと、同じ フィーバーでは もう きかれない）', asked === 1 && (await peek()).hell === false);
check('④ 3つの かずは 4もんめ から（1〜3もんめには 出ない）', [r, ...seen].every((x) => !x.q.tri || x.q.qSeen >= 4) && (await peek()).qSeen >= 11);
check('④ 出しかたは まいかい かわる（同じ 出しかたが つづかない）。4つの うち いくつも 出る', seen.every((x, i) => !i || x.q.pres !== seen[i - 1].q.pres) && new Set(seen.map((x) => x.q.pres)).size >= 3, seen.map((x) => (x.q.tri ? 'tri' : x.q.pres)).join(' '));
check('④ せいちょうポイント：3つの かずの 初かいほう ＋2・たしざんの 初クリア（10もん せいかい）＋3', s.gp === 5 && s.learn.units.add.tri === 1 && s.learn.units.add.clear === 1 && s.learn.units.add.ok === 10, `gp ${s.gp}`);
await shot('05_fever');
// まちがえる → フィーバーが きれる → また 5れんぞくで もう いちど きかれる → はいる
q = await ready(); await keys(q.ans + 1 > 18 ? 1 : q.ans + 1); await page.waitForTimeout(200);
check('④ まちがえると れんぞくが 0 に（セーブにも）', (await state()).learn.combo === 0 && (await peek()).combo === 0);
r = await solve(); pts = (await state()).pts;
const g0 = (await state()).gp;
let entered = null;
for (let i = 0; i < 5; i++) { r = await solve({ ask: 1 }); if (asked === 2 && !entered) entered = r; }
s = await state();
await shot('06_super');
check('④ フィーバーが きれた あとは また きかれる。「はいる」で スーパーフィーバー（タイトル・「ふつうに もどる」）', asked === 2 && (await peek()).hell === true && /スーパーフィーバー/.test(await text('.lq-top h2')) && await page.locator('[data-unhell]').count() === 1);
check('④ せいちょうポイント：スーパーフィーバー 初とつにゅう ＋2', s.gp === g0 + 2 && s.learn.sf === 1, `gp ${g0} → ${s.gp}`);
// スーパーフィーバー中：はんいの そとが まざる（20れんぞく より 少ない うちは 3けたが 出ない）・ばいりつ・2回 まちがえると パス
let tiers = [], pass = null, p0 = (await state()).pts, exp = 0;
for (let i = 0; i < 26 && tiers.filter(Boolean).length < 5; i++) {
  q = await ready(); if (q.combo >= 19) await poke({ combo: 12 });
  q = await peek(); tiers.push(q.tier);
  if (q.tier && !pass) { // はんいの そとで 2回 まちがえる → パス
    await keys(q.ans === 1 ? 2 : 1); await page.waitForTimeout(150); const one = await page.locator('[data-skip]').count();
    await keys(q.ans === 1 ? 2 : 1); await page.waitForTimeout(150);
    pass = { one, two: await page.locator('[data-skip]').count(), hint: await text('#lq-hint'), tag: await text('#lq-tag') };
    await shot('07_tier');
    await page.click('[data-skip]'); await page.waitForTimeout(100);
    pass.after = await peek(); pass.pts = (await state()).pts;
    break;
  }
  r = await solve(); exp += r.coin;
}
check('④ スーパーフィーバー中：はんいの そとの もんだいが 出る。出た ときの ばいりつ 4ばい いじょうの しるし', !!pass && /スーパー/.test(pass.tag) && /コイン (4|6|10)ばい/.test(pass.tag), JSON.stringify(pass || tiers));
check('④ はんいの そとの もんだい：1回 まちがいで ヒント、2回 まちがいで パス。パスすると れんぞくが 0・コインは ふえない・スーパーフィーバーは おわる', !!pass && pass.one === 0 && pass.two === 1 && pass.hint.length > 5 && pass.after.combo === 0 && pass.after.hell === false && pass.pts === p0 + exp, JSON.stringify(pass || {}).slice(0, 200));
// 「ふつうに もどる」
for (let i = 0; i < 5; i++) await solve({ ask: 1 });
const inSf = (await peek()).hell;
await ready(); await page.click('[data-unhell]'); await page.waitForTimeout(100);
check('④ 「ふつうに もどる」で スーパーフィーバーが おわる（れんぞくは のこる・この フィーバーでは もう きかれない）', inSf && (await peek()).hell === false && (await peek()).combo >= 5);
const a3 = asked; for (let i = 0; i < 3; i++) await solve({ ask: 1 });
check('④ もどった あとは きかれない', asked === a3 && (await peek()).hell === false);
// 20もん れんぞく（はじめて）＋3
await poke({ combo: 19 }); const g1 = (await state()).gp; await solve();
s = await state();
check('④ せいちょうポイント：20もん れんぞくの 初たっせい ＋3。さいこう きろくが のこる', s.gp === g1 + 3 && s.learn.s20 === 1 && s.learn.best >= 20, `gp ${g1} → ${s.gp}`);
// ごほうびは 1回 だけ：たしざんに 入りなおして 12もん
await page.click('[data-menu]');
check('がくしゅうの メニュー：コイン・せいちょうポイント・れんぞく・たしざんの せいかい数（クリア）', /クリア/.test(await text('[data-unit=add]')) && (await text('#lq-coin')) === String(s.pts) && new RegExp(`せいちょうポイント ${s.gp}`).test(await text('.pb-stats')));
await page.click('[data-unit=add]'); await poke({ combo: 0 });
for (let i = 0; i < 6; i++) await solve({ ask: 0 });
await poke({ combo: 19 }); await solve({ ask: 0 }); await poke({ combo: 0 });
check('せいちょうポイントの ごほうびは 1回 だけ（もう いちど やっても ふえない）', (await state()).gp === s.gp, `gp ${s.gp} → ${(await state()).gp}`);
// ひきざん：くりさがり。ここでも 3つの かず ＋2・初クリア ＋3（たんげんごと）
await page.click('[data-menu]'); await page.click('[data-unit=sub]'); await poke({ combo: 0 });
const gs = (await state()).gp, sb = [];
for (let i = 0; i < 10; i++) { r = await solve({ ask: 0 }); sb.push(r.q); }
check('ひきざん：くりさがり（11〜18 − ひとけた）。3つの かずは ひく・ひく だけ。たんげんごとに せいちょうポイント ＋2・＋3', sb.every((x) => (x.tri ? x.o1 === '-' && x.o2 === '-' && x.ans >= 0 : x.op === '-' && x.a >= 11 && x.a <= 18 && x.ans >= 2 && x.ans <= 9)) && (await state()).gp === gs + 5, `gp ${gs} → ${(await state()).gp}`);
await page.click('[data-menu]'); await page.click('[data-back]');

// ---- ⑤ せいちょう：たんげんを ひらく ----
s = await state();
check('ホーム：がくしゅうの コインと せいちょうポイントが おなじ 数で 見える', (await text('#pb-pts')) === String(s.pts) && (await text('#pb-gp-home')) === String(s.gp));
await page.click('.pb-steps [data-go=grow]');
await page.click('.em-node[data-b=learn][data-i="1"]'); await page.waitForTimeout(200);
check('⑤ がくしゅうの 枝は 左から じゅんばん（ぶんしょうもんだいを さきには とれない）', await page.locator('#sheet:not([hidden]) .sheet-actions').count() === 0 && !(await state()).tree.learn);
await page.click('.em-node[data-b=learn][data-i="0"]'); await sheetClick('とる');
await page.click('.em-node[data-b=learn][data-i="1"]'); await sheetClick('とる');
await shot('08_grow');
const s2 = await state();
check('⑤ せいちょうポイントで まぜまぜ（3）と ぶんしょうもんだい（5）を ひらく', s2.gp === s.gp - 8 && s2.tree.learn === 2 && await page.locator('.em-node.on[data-b=learn]').count() === 2, `gp ${s.gp} → ${s2.gp}`);
// パックの 枝：第3弾を せいちょうポイントで ひらく
await page.click('.em-node[data-pack=s3]'); await page.waitForTimeout(200); await sheetClick('ポイントで ひらく');
check('⑤ パックの 枝：第3弾を 3ポイントで ひらく（ねだんは そのまま）', (await state()).gp === s2.gp - 3 && (await state()).packs.s3 === 1);
await page.click('[data-back]'); await page.click('.pb-steps [data-go=learn]');
check('⑤ ひらくと まぜまぜ・ぶんしょうもんだいが えらべる', (await page.locator('[data-unit]').evaluateAll((xs) => xs.map((x) => `${x.dataset.unit}${x.dataset.locked ? '×' : ''}`).join())) === 'add,sub,mix,word');

// ---- ⑥ ぶんしょうもんだい：ことば → たす？ひく？ → けいさん ----
await page.click('[data-unit=word]'); await poke({ combo: 0 });
q = await ready();
await shot('09_word');
const story = await page.evaluate(() => ({ fs: parseFloat(getComputedStyle(document.getElementById('lq-story')).fontSize), t: document.getElementById('lq-story').innerText.replace(/\s+/g, ' '), steps: document.querySelector('.lq-steps').innerText.replace(/\s+/g, ' '), pad: document.querySelectorAll('.lq-pad').length, fit: document.documentElement.scrollWidth <= document.documentElement.clientWidth }));
check('⑥ 文しょう題：文が 大きい 字（ひらがな）で 出る。3つの ステップ。はじめは ことばを えらぶ（数字の ボタンは まだ）', story.fs >= 20 && story.fit && !/[一-龥]/.test(story.t) && /① ことばを みつける.*② たす？ ひく？.*③ けいさん/.test(story.steps) && story.pad === 0 && q.step === 0 && !q.tri, JSON.stringify(story).slice(0, 160));
let w0 = (await state()).pts;
const notKw = await page.evaluate((kw) => [...document.querySelectorAll('[data-tok]')].map((x) => +x.dataset.tok).find((i) => !kw.includes(i)), q.kw);
await page.click(`[data-tok="${notKw}"]`); await page.waitForTimeout(150);
check('⑥ ちがう ことばを おすと「おしい」（小さい 表示）。コインは ふえない', (await state()).pts === w0 && /mini/.test(await page.evaluate(() => document.querySelector('#lfx .lfx-pop')?.className || '')) && (await peek()).step === 0);
await page.click(`[data-tok="${q.kw[0]}"]`); await page.waitForTimeout(150);
check('⑥ ステップ ①：だいじな ことばを みつけると ＋10コイン', (await state()).pts === w0 + 10 && (await peek()).step === 1 && await page.locator('[data-op]').count() === 2);
await page.click(`[data-op="${q.op === '+' ? '-' : '+'}"]`); await page.waitForTimeout(150);
check('⑥ ステップ ②：ちがう けいさんを えらぶと すすまない', (await peek()).step === 1 && (await state()).pts === w0 + 10);
await page.click(`[data-op="${q.op}"]`); await page.waitForTimeout(150);
check('⑥ ステップ ②：たす？ ひく？を えらぶと ＋10コイン。式と 数字の ボタンが 出る', (await state()).pts === w0 + 20 && (await peek()).step === 2 && await page.locator('.lq-pad').count() === 1 && /の ことば！/.test(await text('.lq-note')));
await keys(q.ans); await page.waitForTimeout(250);
check('⑥ ステップ ③：けいさんが あうと ＋10コイン（ラッキーは 3ばい）。あわせて 30コイン', (await state()).pts === w0 + 20 + 10 * (q.lucky ? 3 : 1) && (await state()).learn.units.word.ok === 1, `${(await state()).pts - w0}`);
// 5もん せいかい するまで 3つの かずは 出ない。その あと 出たら えらぶのは 2回
const wq = []; let tri3 = null; const gw = (await state()).gp;
for (let i = 0; i < 40 && !tri3; i++) {
  q = await ready(); wq.push(q);
  if (q.tri) { // 3つの かず：1つめ → 2つめ（コインは 2つめまで えらんだ ときに ＋10）
    const b = (await state()).pts;
    await page.click(`[data-tok="${q.kw[0]}"]`); await page.waitForTimeout(120);
    await page.click(`[data-op="${q.o1}"]`); await page.waitForTimeout(120);
    const mid = { pts: (await state()).pts - b, step: (await peek()).step, opi: (await peek()).opi };
    await shot('10_word_tri');
    await page.click(`[data-op="${q.o2}"]`); await page.waitForTimeout(120);
    tri3 = { mid, two: (await state()).pts - b, step: (await peek()).step };
    await keys(q.ans === 0 ? 1 : 0); await page.waitForTimeout(200); tri3.hint = await text('#lq-hint');
    await keys(q.ans); await page.waitForTimeout(1500);
  } else await solve();
}
check('⑥ 3つの かずの 文しょう題は 5もん せいかい してから 出る', !!tri3 && wq.every((x) => !x.tri || x.okSeen >= 5), wq.map((x) => `${x.okSeen}${x.tri ? '*' : ''}`).join(' '));
check('⑥ 3つの かず：たす？ ひく？を 2回 えらぶ（1つめでは まだ ＋10 に ならない）。ヒントは とちゅうの けいさんも 見せる', !!tri3 && tri3.mid.pts === 10 && tri3.mid.step === 1 && tri3.mid.opi === 1 && tri3.two === 20 && tri3.step === 2 && /ひだりから じゅんに/.test(tri3.hint) && /＝/.test(tri3.hint), JSON.stringify(tri3 || {}));
check('⑥ せいちょうポイント：ぶんしょうもんだいの 3つの かずの 初かいほう ＋2（10もん せいかいで 初クリア ＋3 も）', (await state()).gp >= gw + 2 && (await state()).learn.units.word.tri === 1, `gp ${gw} → ${(await state()).gp}`);
await page.click('[data-menu]'); await page.click('[data-unit=mix]');
const mx = []; for (let i = 0; i < 12; i++) { r = await solve({ ask: 0 }); mx.push(r.q); }
check('⑥ まぜまぜ：たしざんと ひきざんが まざる', mx.some((x) => x.op === '+' || x.o1 === '+') && mx.some((x) => x.op === '-' || x.o1 === '-'));
await page.click('[data-menu]'); await page.click('[data-back]');

// ---- ⑦ ショップ：がくしゅうの コインで パックを 買う（100コイン）→ かいふう ----
s = await state();
await page.click('.pb-steps [data-go=shop]');
const shopT = await text('main.pb');
await shot('11_shop');
check('⑦ ショップ：リスト（16行）。ことばは「コイン」。ひらいた 第3弾は 買える・ほかは ロック', await page.locator('.cs-sets > .cs-set').count() === 16 && (await page.locator('[data-buy]').evaluateAll((xs) => xs.map((x) => x.dataset.buy).join())) === 'p1,s1,s2,s3' && new RegExp(`コイン ${s.pts}コイン`).test(shopT) && /100コイン/.test(shopT) && !/\dP\b/.test(shopT) && /せいちょうポイント 4/.test(await text('[data-lock=s4]')), shopT.slice(0, 80));
await page.click('[data-buy=s3]'); await page.waitForTimeout(200);
const buyT = await text('#sheet .sheet-body');
await sheetClick('あける');
for (let i = 0; i < 400 && await page.locator('.gacha').count(); i++) {
  for (const [sel, wait] of [['[data-open]', 650], ['[data-flip]', 1100], ['.stage.shown', 400], ['[data-done]', 100]]) if (await page.locator(sel).count()) { await page.click(sel, { force: true }); await page.waitForTimeout(wait); break; }
}
const s3 = await state();
const got = Object.keys(s3.cards).filter((id) => (s3.cards[id] || 0) > (s.cards[id] || 0));
check('⑦ パックを 100コインで 買う：コインが 100 へって、カードが 8まい ふえる（かいふうの 画面は いままでの まま）', new RegExp(`${s.pts}コイン − 100コイン ＝ ${s.pts - 100}コイン`).test(buyT.replace(/\s/g, ' ')) && s3.pts === s.pts - 100 && count(s3) === count(s) + 8 && got.length > 0, `${buyT.slice(0, 60)}・${s.pts} → ${s3.pts}`);
// もう 1パック（第1弾）
await page.click('[data-buy=s1]'); await sheetClick('あける');
for (let i = 0; i < 400 && await page.locator('.gacha').count(); i++) {
  for (const [sel, wait] of [['[data-open]', 650], ['[data-flip]', 1100], ['.stage.shown', 400], ['[data-done]', 100]]) if (await page.locator(sel).count()) { await page.click(sel, { force: true }); await page.waitForTimeout(wait); break; }
}
s3.pts -= 100;
check('⑦ もう 1パック：また 100コイン へって 8まい ふえる', (await state()).pts === s3.pts && count(await state()) === count(s) + 16);
await page.click('[data-back]');
check('⑦ ホーム：コインが へって いる。あたらしい カードが 入ったら「デッキ」が つぎ', (await text('#pb-pts')) === String(s3.pts) && (await page.evaluate(() => document.querySelector('.pb-steps .st-ep.next')?.dataset.go)) === 'deck');

// ---- ⑧ デッキ ----
await page.click('.pb-steps [data-go=deck]');
await page.click('[data-new]'); await page.locator('.builder').waitFor();
await shot('12_builder');
await page.click('[data-a=ok]'); await page.waitForTimeout(200);
if (await page.locator('#sheet:not([hidden]) button:has-text("デッキの いちらんへ")').count()) await sheetClick('デッキの いちらんへ');
check('⑧ デッキ：もって いる カードで 2つめの デッキを くめる', (await state()).decks.length === 2 && (await state()).decks[1].cards.length >= 6);
await page.click('[data-back]');

// ---- ⑨ バトル：かつと コイン（おなじ コイン）と せいちょうポイント ----
async function battle() {
  for (let i = 0; i < 4000; i++) {
    await page.waitForTimeout(30);
    if (!(await page.locator('.battle').count())) return;
    if (await page.locator('#term:not([hidden])').count()) { await page.click('#term'); continue; }
    if (await page.locator('#sheet:not([hidden]) .pick-list').count()) { await page.locator('#sheet .pick').first().click(); if (await page.locator('#sheet [data-ok]:not([disabled])').count()) await page.click('#sheet [data-ok]'); else await page.click('#sheet [data-no]'); continue; }
    if (await page.locator('#sheet:not([hidden]) .num-row').count() || await page.locator('#sheet:not([hidden]) .div-list').count()) { await page.click('#sheet [data-ok]'); continue; }
    if (await page.locator('#sheet:not([hidden]) .sheet-actions button').count()) {
      if (/かった！|まけて しまった|ひきわけ/.test(await sheetTitle())) return;
      const btns = page.locator('#sheet .sheet-actions button:not([disabled])');
      if (await btns.count()) await btns.first().click(); else await page.click('#sheet .sheet-back');
      continue;
    }
    if (await page.locator('[data-act=blockauto]').count()) { await tap('[data-act=blockauto]'); if (await tap('[data-act=blockdone]')) await page.locator('[data-act=blockdone]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {}); continue; }
    if (await page.locator('[data-act=pass]').count()) { await tap('[data-act=pass]'); continue; }
    if (await page.locator('[data-act=damage]').count()) { await tap('[data-act=damage]'); continue; }
    if (await page.locator('[data-act=auto]').count()) { if (await tap('[data-act=auto]')) await tap('[data-act=declare]'); continue; }
    const hand = page.locator('.hand-slot');
    if (await hand.count() && Math.random() < 0.92) { await tap(hand.nth(Math.floor(Math.random() * await hand.count()))); continue; }
    if (await page.locator('[data-act=attack]').count()) { await tap('[data-act=attack]'); continue; }
    if (await page.locator('[data-act=end]').count()) { await tap('[data-act=end]'); continue; }
  }
}
// きそデッキで たたかう（ロボットは でたらめに あそぶ ので、かつまで なんどか）
await page.click('.pb-steps [data-go=deck]'); await page.click('[data-deck=d0]'); if (await page.locator('#sheet:not([hidden]) button:has-text("この デッキを つかう")').count()) await sheetClick('この デッキを つかう'); else await sheetClick('とじる').catch(() => {});
await page.click('[data-back]');
const b0 = await state(); let tries = 0, lostOnce = null;
for (; tries < TRIES && (await state()).wins === 0; tries++) {
  if (tries) { if (!lostOnce) lostOnce = { t: await text('#sheet .sheet-body'), pts: (await state()).pts }; await sheetClick('ホームへ'); }
  await page.click('.pb-steps [data-go=battle]');
  if (!tries) check('⑨ バトル：ステージ 1 の 5人を えらべる（かつと ＋50コイン）', await page.locator('[data-foe]:not([disabled])').count() === 5 && /＋50コイン/.test(await text('[data-foe]')));
  await page.locator('[data-foe]').first().click(); await page.waitForTimeout(500);
  await battle();
}
await shot('13_win');
const winT = (await sheetTitle()) === 'かった！' ? await text('#sheet .sheet-body') : '';
const b1 = await state();
const m = winT.match(/(\d+)コイン ＋ (\d+)コイン ＝ (\d+)コイン/);
check(`⑨ バトルに かつ（${tries}回め）：おなじ コインが ふえる（かち ＋50、ぴったりの ボーナス）・せいちょうポイント ＋1`, b1.wins === 1 && !!m && +m[1] === b0.pts && +m[2] >= 50 && +m[3] === b0.pts + +m[2] && b1.gp === b0.gp + 1 && /かった ＋50コイン/.test(winT) && !/\dP\b/.test(winT), winT.slice(0, 120));
if (lostOnce) check('まけても コインと カードは そのまま', lostOnce.pts === b0.pts && /コインと カードは そのまま/.test(lostOnce.t));
await sheetClick('つぎへ'); await page.waitForTimeout(400);
check('⑨ アンティ：かつと カードを 1まい もらう', /アンティ/.test(await sheetTitle()));
await sheetClick('つぎへ'); await page.waitForTimeout(400);
if (await page.locator('#sheet:not([hidden]) .sheet-actions button').count()) await page.locator('#sheet:not([hidden]) .sheet-actions button').first().click();
await page.waitForTimeout(300);
if (await page.locator('[data-back]').count()) await page.click('[data-back]');
await page.locator('.pb-steps').waitFor();
const b2 = await state();
check('⑨ ホーム：バトルの コインが おなじ ところに 入って いる', (await text('#pb-pts')) === String(b2.pts) && b2.pts >= b0.pts + 50 && (await text('#pb-gp-home')) === String(b2.gp));

// ---- ⑩ まえからの「もんだい」：いままでの きまり（1もん 10・5もん れんぞくの ボーナス）で おなじ コインが ふえる ----
await page.click('.pb-steps [data-go=quiz]');
for (const c of ['three', 'ten', 'clock', 'kanji', 'particle']) if (await page.locator(`.qz-cat[data-cat=${c}]`).count()) await page.click(`.qz-cat[data-cat=${c}]`);
await page.click('[data-start]');
for (let k = 0; k < 5; k++) {
  await page.locator('.qz-mark[hidden]').waitFor({ state: 'attached', timeout: 5000 });
  const t = (await page.textContent('.qz-text')).replace(/\s/g, ''), mm = t.match(/^(\d+)([＋−])(\d+)/);
  for (const d of String(mm[2] === '＋' ? +mm[1] + +mm[3] : +mm[1] - +mm[3])) await page.click(`.qz-pad [data-d="${d}"]`);
  await page.click('.qz-pad [data-ok]'); await page.waitForTimeout(650);
}
check('⑩ もんだい：5もん せいかいで ＋60コイン（10 × 5 ＋ れんぞく ボーナス 10。いままでの きまり）', (await state()).pts === b2.pts + 60, `${(await state()).pts - b2.pts}`);
await page.click('[data-quit]'); await sheetClick('やめる');

// ---- ⑪ セーブ ----
const ks = await page.evaluate(() => Object.keys(localStorage));
check('⑪ セーブの キーは この アプリの もの だけ（motg-sansu-oripa…）。まえの アプリの キー（mtg-…・keisan-…）を つくらない', ks.length > 0 && ks.every((k) => k.startsWith('motg-sansu-oripa')) && ks.includes(KEY), ks.join(' '));
const fin = await state();
check('⑪ セーブの 中身：コイン・せいちょうポイント・カード・デッキ・せいちょう（枝と パック）・がくしゅうの すすみ。名前などは 入らない', ['pts', 'gp', 'cards', 'decks', 'tree', 'packs', 'learn'].every((k) => k in fin) && fin.tree.learn === 2 && fin.learn.best >= 20 && ['sf', 's20'].every((k) => fin.learn[k] === 1) && !/name"\s*:\s*"(?!きそデッキ|デッキ)/.test(JSON.stringify({ ...fin, decks: [] })), Object.keys(fin).join(','));
// まえの アプリの キーが あっても 読まない・書かない
await page.evaluate(() => { const raw = Object.getPrototypeOf(localStorage); const set = (k, v) => Object.getOwnPropertyDescriptor(raw, 'setItem'); });
const iframeSet = async (k, v) => page.evaluate(([k, v]) => { const f = document.createElement('iframe'); document.body.appendChild(f); f.contentWindow.Storage.prototype.setItem.call(localStorage, k, v); f.remove(); }, [k, v]);
const iframeGet = async (k) => page.evaluate((k) => { const f = document.createElement('iframe'); document.body.appendChild(f); const v = f.contentWindow.Storage.prototype.getItem.call(localStorage, k); f.remove(); return v; }, k);
await iframeSet('mtg-packbattle-solo-v1', JSON.stringify({ v: 8, pts: 9999, gp: 99, cards: { W10: 4 }, decks: [], wins: 50, starter: 1, open: 1 }));
await iframeSet('keisan-oripa-v1', JSON.stringify({ coins: 7777, cards: { N0: 3 }, combo: 30 }));
await page.reload(); await page.locator('.pb-steps').waitFor();
const after = await state();
check('⑪ よみこみなおしても つづきから（コイン・せいちょうポイント・たんげん・れんぞく）', after.pts === fin.pts && after.gp === fin.gp && after.tree.learn === 2 && after.learn.units.add.ok === fin.learn.units.add.ok && (await text('#pb-pts')) === String(fin.pts));
check('⑪ まえの アプリ（パック＆バトル 単体版・けいさんオリパ）の セーブは ひきつがない・書きかえない', after.pts !== 9999 && after.wins === fin.wins && JSON.parse(await iframeGet('mtg-packbattle-solo-v1')).pts === 9999 && JSON.parse(await iframeGet('keisan-oripa-v1')).coins === 7777);
// はじめから やりなおす
await page.click('[data-reset]'); await sheetClick('やりなおす');
const z = await state();
check('はじめから やりなおす：コイン 200・せいちょうポイント 0・たんげんは ロックに もどる', z.pts === 200 && z.gp === 0 && !z.tree.learn && z.learn.units.add.ok === 0 && z.learn.combo === 0);

// ---- ⑫ ぜんがめんの ボタン ----
{
  const b0 = await text('.oripa-full');
  const can = await page.evaluate(() => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled));
  await page.click('.oripa-full'); await page.waitForTimeout(600);
  const on = await page.evaluate(() => ({ full: !!(document.fullscreenElement || document.webkitFullscreenElement), t: document.querySelector('.oripa-full').innerText.trim(), home: !!document.querySelector('.pb-steps') }));
  await page.click('.oripa-full'); await page.waitForTimeout(600);
  const off = await page.evaluate(() => ({ full: !!(document.fullscreenElement || document.webkitFullscreenElement), t: document.querySelector('.oripa-full').innerText.trim() }));
  check('⑫ ホームに「ぜんがめん」の ボタン。おすと ぜんがめん、もう いちど おすと もどる（ボタンの ことばも かわる）', b0 === 'ぜんがめん' && can && on.full && on.home && /やめる/.test(on.t) && !off.full && off.t === 'ぜんがめん', JSON.stringify({ b0, can, on, off }));
  await page.click('.pb-steps [data-go=learn]');
  check('⑫ がくしゅうの メニューにも ぜんがめんの ボタン', await page.locator('.lq-menu .oripa-full').count() === 1);
  await page.click('[data-back]');
  // ブラウザが ぜんがめんを ゆるさない とき（iPhone など）：おしても こわれない・わけが 出る
  await page.evaluate(() => { for (const k of ['fullscreenEnabled', 'webkitFullscreenEnabled']) Object.defineProperty(document, k, { configurable: true, get: () => false }); });
  await page.click('.pb-steps [data-go=learn]'); await page.click('[data-back]');
  const offCls = await page.locator('.oripa-full.off').count();
  await page.click('.oripa-full'); await page.waitForTimeout(300);
  const tip = await text('#sheet .sheet-body');
  check('⑫ ぜんがめんが つかえない ブラウザ：ボタンは うすく 出て、おすと「できない」と わかる（こわれない）', offCls === 1 && /ぜんがめんに できない/.test(tip) && errors.length === 0, tip.slice(0, 60));
  await sheetClick('とじる');
  await page.evaluate(() => { for (const k of ['fullscreenEnabled', 'webkitFullscreenEnabled']) delete document[k]; });
}

// ---- ⑬ よこ画面（iPad：1180×820）と たて画面 ----
{
  await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.pts = 900; s.gp = 12; s.tree = { learn: 2 }; for (const id of ['W11', 'W14', 'U01', 'U30', 'R02', 'R28', 'G09', 'G11']) s.cards[id] = 4; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await page.setViewportSize({ width: 1180, height: 820 }); await page.reload(); await page.locator('.pb-steps').waitFor();
  const box = (sel) => page.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }; }, sel);
  const doc = () => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight }));
  const cols = (sel) => page.evaluate((q) => new Set([...document.querySelectorAll(q)].map((e) => Math.round(e.getBoundingClientRect().left))).size, sel);
  const L = {};
  L.home = { main: await box('main.pb'), stats: await box('.pb-stats'), steps: await box('.pb-steps'), doc: await doc() }; await shot('L1_home');
  check('⑬ よこ画面・ホーム：はばを 広く つかう（1000px いじょう）。左に ようす・右に 入口の 2れつ。横に はみ出さない', L.home.main.w >= 1000 && L.home.steps.x > L.home.stats.r && L.home.steps.y < L.home.stats.b && L.home.doc.sw <= 1180 && L.home.doc.sh <= 900, JSON.stringify(L.home));
  await page.click('.pb-steps [data-go=learn]');
  L.menu = { stats: await box('.pb-stats'), steps: await box('.pb-steps'), doc: await doc() }; await shot('L2_learn');
  check('⑬ よこ画面・がくしゅうの メニュー：左に ようす・右に たんげん 4つ', L.menu.steps.x > L.menu.stats.r && L.menu.doc.sw <= 1180 && L.menu.doc.sh <= 900, JSON.stringify(L.menu));
  await page.click('[data-unit=add]'); await page.waitForTimeout(300); await shot('L3_quiz_pres');
  let lq = await ready();
  L.quiz = { board: await box('#lq-board'), pad: await box('.lq-pad'), key: await box('.lq-key'), doc: await doc(), fs: await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('lq-eq')).fontSize)) }; await shot('L4_quiz');
  check('⑬ よこ画面・もんだい：1画面（スクロール なし）。左に 式、右に 数字の ボタン。式の 字は 64px いじょう・ボタンは 大きい', L.quiz.pad.x >= L.quiz.board.r && L.quiz.board.w >= 600 && L.quiz.doc.sh <= 820 && L.quiz.doc.sw <= 1180 && L.quiz.pad.b <= 820 && L.quiz.fs >= 64 && L.quiz.key.h >= 100, JSON.stringify(L.quiz));
  await keys(lq.ans === 11 ? 12 : 11); await page.waitForTimeout(200);
  check('⑬ よこ画面・もんだい：ヒントが 出ても 1画面に おさまる', (await doc()).sh <= 820 && (await box('#lq-hint')).b <= (await box('#lq-board')).b);
  await page.click('[data-menu]'); await page.click('[data-unit=word]'); lq = await ready(); await page.waitForTimeout(1200);
  L.word = { board: await box('#lq-board'), side: await box('.lq-side'), story: await box('#lq-story'), doc: await doc(), fs: await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('lq-story')).fontSize)) }; await shot('L5_word');
  await page.click(`[data-tok="${lq.kw[0]}"]`); await page.waitForTimeout(200);
  L.word.ops = await box('.lq-ops'); await shot('L6_word_op');
  check('⑬ よこ画面・文しょう題：1画面。左に 文（字は 28px いじょう）、右に たす？ ひく？', L.word.side.x >= L.word.board.r && L.word.fs >= 28 && L.word.doc.sh <= 820 && L.word.story.b <= L.word.board.b && L.word.ops.x >= L.word.board.r && L.word.ops.b <= 820, JSON.stringify(L.word));
  await page.click('[data-menu]'); await page.click('[data-back]');
  await page.click('.pb-steps [data-go=shop]'); L.shop = { cols: await cols('.cs-sets > .cs-set'), doc: await doc() }; await shot('L7_shop'); await page.click('[data-back]');
  await page.click('.pb-steps [data-go=grow]'); L.grow = { w: (await box('.em-branch')).w, row: await page.evaluate(() => new Set([...document.querySelectorAll('.em-branch[data-branch=pack] .em-node')].map((e) => Math.round(e.getBoundingClientRect().top))).size), doc: await doc() }; await shot('L8_grow'); await page.click('[data-back]');
  await page.click('.pb-steps [data-go=deck]'); L.decks = { cols: await page.evaluate(() => getComputedStyle(document.querySelector('.cs-decks')).gridTemplateColumns.split(' ').length), doc: await doc() }; await shot('L9_decks');
  await page.click('[data-new]'); await page.locator('.builder').waitFor(); L.builder = { main: await box('main.builder'), list: await box('.bp-list'), detail: await box('.bp-detail'), doc: await doc() }; await shot('L10_builder');
  await page.click('[data-a=ok]'); await page.waitForTimeout(200);
  if (await page.locator('#sheet:not([hidden]) button:has-text("デッキの いちらんへ")').count()) await sheetClick('デッキの いちらんへ');
  await page.click('[data-back]');
  await page.click('.pb-steps [data-go=battle]'); L.arena = { cols: await cols('.st-ch > ol > li'), doc: await doc() }; await shot('L11_arena');
  check('⑬ よこ画面・ショップ／デッキの いちらん／あいての リスト：2れつ。せいちょう：はば いっぱい（パックの 枝は 3だん いない）。横に はみ出さない', L.shop.cols === 2 && L.decks.cols === 2 && L.arena.cols === 2 && L.grow.w >= 1000 && L.grow.row <= 3 && [L.shop, L.grow, L.decks, L.arena].every((x) => x.doc.sw <= 1180), JSON.stringify({ shop: L.shop, grow: L.grow, decks: L.decks, arena: L.arena }));
  check('⑬ よこ画面・デッキを くむ：はばを 広く つかう（カードの ならびと せつめいの 2まい）', L.builder.main.w >= 1000 && L.builder.detail.x >= L.builder.list.r - 2 && L.builder.doc.sw <= 1180, JSON.stringify(L.builder));
  await page.locator('[data-foe]').first().click(); await page.waitForTimeout(500);
  if (await page.locator('#sheet:not([hidden]) button:has-text("はじめる")').count()) await sheetClick('はじめる');
  await page.locator('.battle').waitFor(); await page.waitForTimeout(1500);
  L.battle = { b: await box('.battle'), doc: await doc() }; await shot('L12_battle');
  check('⑬ よこ画面・バトル：画面 いっぱい（スクロール なし）', L.battle.b.w >= 1100 && L.battle.doc.sh <= 820 && L.battle.doc.sw <= 1180, JSON.stringify(L.battle));
  await page.click('[data-act=menu]'); await sheetClick('ホームへ もどる');
  // たて画面に もどす：まえの ならび（1れつ）
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
  const P = { stats: await box('.pb-stats'), steps: await box('.pb-steps'), main: await box('main.pb'), doc: await doc() };
  await page.click('.pb-steps [data-go=learn]'); await page.click('[data-unit=add]'); await ready();
  P.board = await box('#lq-board'); P.pad = await box('.lq-pad'); P.q = await doc();
  await page.click('[data-menu]'); await page.click('[data-back]'); await page.click('.pb-steps [data-go=shop]'); P.shop = await cols('.cs-sets > .cs-set'); await page.click('[data-back]');
  check('⑬ たて画面（390×844）：いままでの ならび（入口は ようすの 下・数字の ボタンは 式の 下・ショップは 1れつ）。横に はみ出さない', P.steps.y >= P.stats.b && P.main.w <= 390 && P.pad.y >= P.board.b && P.shop === 1 && P.doc.sw <= 390 && P.q.sw <= 390, JSON.stringify(P));
}

check('そとへの 通信が ない（この ファイル 1つ だけ）', outside.length === 0, outside.slice(0, 3).join(' '));
check('エラーが 出ない', errors.length === 0, errors.slice(0, 3).join(' ｜ '));
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no errors');
console.log(fails.length ? `FAILED: ${fails.length}\n${fails.join('\n')}` : 'ALL OK');
process.exit(fails.length ? 1 : 0);
