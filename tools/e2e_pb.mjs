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
check('ステージ 1 の あいてが 4たい ならぶ（かった 回数つき）。ステージ 2〜6 は まだ', await page.locator('[data-foe]:not([disabled])').count() === 4 && await page.locator('.pb-stages [data-stage]:disabled').count() === 5 && /☆☆/.test(await page.locator('[data-foe]').first().innerText()) && await page.locator('[data-go=deck]').count() === 0);

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
await edit("for (const id of a) s.cards[id] = 4; s.beat = { 'kihon:kh1': 1, 'kihon:kh2': 2, 'kihon:pb1': 2, 'kihon:kh3': 2 }; s.wins = 7; s.gp = 7;", pool1);
before = await state();
await page.click('.pb-steps [data-go=battle]');
check('クリアまで あと 1回と 出る', /あと 1回/.test(await page.locator('.st-ch h3').first().innerText()));
wins = await winFoe(0);
s = await state();
const ante = wins.find((w) => /アンティ/.test(w.title));
check(`アンティ：もう 4まい もって いる カードは ＋${PB.anteDupe}P に かわる（カードは ふえない・わかる ように 出る）`, count(s) === count(before) && s.pts >= before.pts + PB.win + PB.anteDupe && /かわった/.test(ante?.text || ''), ante?.text.slice(0, 60));
check(`ステージの ぜんいんを ${PB.need}回ずつ たおすと つぎの ステージが ひらく（おしらせ・せいちょうポイント ＋${PB.gpStage}）`, s.stage === 1 && s.gp === before.gp + PB.gpWin + PB.gpStage && wins.some((w) => /ステージ 2.*かいほう された/.test(w.title)), wins.map((w) => w.title).join(' → '));
check('ひらいた ステージ 2 が えらばれて いる（ステージ 1 にも もどれる）', (await page.locator('.pb-stages .chip.on').innerText()).trim() === '2' && await page.locator('.pb-stages [data-stage]:not([disabled])').count() === 2 && await page.locator('[data-foe]').count() === 5);
await shot('04_arena_stage2');
await page.click('.pb-stages [data-stage="0"]');
check('クリアした ステージの あいてとも なんどでも たたかえる', await page.locator('[data-foe]:not([disabled])').count() === 4 && /クリア/.test(await page.locator('[data-foe]').first().innerText()));
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
await page.click('.pb-steps [data-go=battle]'); await page.click('.pb-stages [data-stage="0"]');
await page.locator('[data-foe]').nth(1).click();
await battle(true);
await shot('12_lose');
const title = await sheetTitle();
await sheetClick('ホームへ');
s = await state();
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
check('まえの セーブ（4たい たおした）：ステージ 2 が ひらいて いて、たおした あいては クリア・せいちょうポイントも もらう', m.open === 1 && m.pts === 30 && m.wins === 4 && m.stage === 1 && m.gp === 4 * PB.gpWin + PB.gpStage && Object.values(m.beat).filter((n) => n >= PB.need).length === 5 && m.decks.length === 2 && m.active === 'd1' && stockOk(m), `ステージ ${m.stage + 1}・せいちょう ${m.gp}・${Object.keys(m.beat).join(' ')}`);
await page.click('.pb-steps [data-go=battle]');
check('まえの セーブ：ステージ 2 の 画面に クリアが 1つ', await page.locator('.pb-stages [data-stage]:not([disabled])').count() === 2 && await page.locator('[data-foe].done').count() === 1);
// まだ 1たいも たおして いない：あいて いない。きそデッキで たたかう
m = await old({ v: 1, pts: 30, cards: { U01: 2, U02: 2, R01: 3, C01: 1 }, deck: ['U01', 'U01', 'U02', 'U02', 'R01', 'R01', 'R01', 'C01'], wins: 0, seed: 7, quiz: { n: 9, ok: 8, sessions: 2 }, opened: 1, earned: 0, lost: 0 });
check('まえの セーブ（まだ たおして いない）：あいて いない。きそデッキで たたかう（もとの デッキは のこる）', m.open !== 1 && m.active === 'd0' && m.decks.length === 2 && m.stage === 0 && m.gp === 0 && await page.locator('.pb-steps [data-go=shop]:disabled').count() === 1 && (await nextStep()) === 'battle');
// ひとつ まえ（デッキ 5こ・28たいを じゅんばんに）で 30たい たおして いた：ぜんぶ クリア・むげんの たたかい・デッキは とりあげない
const five = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, name: i ? `デッキ ${i + 1}` : 'きそデッキ', cards: i ? [] : ['W10', 'W10', 'W02', 'W02', 'W03', 'W31', 'W101', 'G01', 'G01', 'G09', 'G11', 'G11', 'C18', 'C18'] }));
m = await old({ v: 2, pts: 500, cards: { W10: 2, W02: 2, W03: 1, W31: 1, W101: 1, G01: 2, G09: 1, G11: 2, C18: 2 }, decks: five, active: 'd0', wins: 30, seed: 7, quiz: { n: 9, ok: 8, sessions: 2 }, opened: 3, earned: 0, lost: 0, starter: 1, open: 1 });
check('まえの セーブ（30たい たおした）：ステージは ぜんぶ クリア・むげんの たたかいの つづきから', m.stage === 6 && m.endless === 2 && m.gp === 30 * PB.gpWin + 6 * PB.gpStage && m.wins === 30, `せいちょう ${m.gp}・むげん ${m.endless}`);
await page.click('.pb-steps [data-go=battle]');
check('むげんの たたかいに いどめる', (await page.locator('.pb-stages .chip.on').innerText()).trim() === '∞' && await page.locator('[data-foe=endless]:not([disabled])').count() === 1);
await page.click('[data-back]'); await page.click('.pb-steps [data-go=deck]');
check(`デッキが 5こ ある まえの セーブ：とりあげない。わく（${PB.deckBase}こ）が おいつくまで あたらしく つくれない だけ`, (await state()).decks.length === 5 && await page.locator('.cs-deck').count() === 5 && await page.locator('[data-new]:disabled').count() === 1);

console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join('\n')}` : 'no errors');
console.log(fails.length ? `FAILED: ${fails.length}` : 'ALL OK');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
