// 冒険の流れ：タイトル → パック開封 → デッキ構築 → 塔 → たたかい → …
import { openPack, buildDeck, DECK_SIZE, CAPACITY, favorColor, legendChance, packColors, withExtra, rareLegendChance } from '../engine/run.js';
import { BY_ID, BASICS, SETS } from '../data/cards.js';
import { pickFloors } from '../data/enemies.js';
import { RAV_NAMES, pickRavnica } from '../data/ravnica.js';
import { colorsOf } from '../engine/game.js';
import { ptsOf } from '../engine/ai.js';
import { startBattle } from './battle.js';
import { tutorialDeck, tutorialSetup, TUTORIAL_DONE } from './tutorial.js';
import { onlineMenu, saveGhost, hasServer } from './online.js';
import { raidMenu } from './raid.js';
import { pickLegend, cmdColorText } from './commander.js';
import { storyMenu, storyCount, STORY_TOTAL } from './story.js';
import { applyMat, awardMat, matName, TOWER_MAT } from './mats.js';
import { RAID, raidOpen, raidShown, raidFree, applyRaid } from './raidstore.js';
import { CONF, loadConf } from './server.js';
import { adminScreen } from './admin.js';
import { sfx, soundOn, setSound } from './sfx.js';
import { DEV, enabledSets, setsNote, settingsScreen, adsOn, applyTheme, applyConf } from './settings.js';
import { TROPHIES, award, onBattle, onClear, onPack, trophyCount, trophyScreen, cup } from './trophies.js';
import { zukanPack, zukanBattle, zukanRun, zukanScreen, zukanCount } from './zukan.js';
import { emblemScreen, activeEffects, activeIds, emblemLine, emblemPoints, gateStudy, moreStudy, blessStudy } from './emblem.js';
import { PATHS, PATH_BY_ID, blessText, blessChoices, blessFx, endlessBuff, endlessScore, ENDLESS, BLESS_MAX } from '../data/blessings.js';
import { QUIZ_SECONDS } from '../data/quiz.js';
import { loadFilter, filterPanel, applyFilter, onFilterClick, filterCount, saveFilter } from './deckfilter.js';
import { cardFace, fullCard, detail, sheet, esc, ruby, info, COLOR_NAME, initTerms, toast } from './view.js';
import { BANNERS } from '../data/emblems.js';

const SAVE = 'mtg-adventure-v1';
const ENDLESS_BEST = 'mtg-endless-best'; // むげんの とうの いちばんの きろく { floor, exact, score }
const TAP_MODE = 'mtg-build-tap'; // デッキ構築で タップしたとき：'detail'（せつめい）か 'quick'（すぐ 入れる・はずす）
const FLOOR_NAMES = {
  hydra: '1階 ハイドラとの たいじ', horde: '2階 たいぐんとの たたかい', factory: '3階 ゴーレムの工場', slime: '3階 ふえるスライム',
  xenagos: '4階 神を うて', erebos: '5階 死者の神 エレボス',
  clock: '1階 からくり とけいとう', dragon: '2階 ドラゴンの たからの 山', twins: '3階 ふたごの きょじん', gorgon: '4階 メドゥーサの 石の 庭',
  ...RAV_NAMES,
};
// せかい（プレーン）：どの 塔に のぼるか（docs/RAVNICA.md）
const PLANES = [['theros', 'テーロス'], ['ravnica', 'ラヴニカ']];
const DIFFS = [['easy', 'かんたん'], ['normal', 'ふつう'], ['hard', 'むずかしい']];
// ルール：統率者戦（2026-10-26）は さいしょに 伝説の クリーチャーを 統率者に えらぶ（A.cmd）
const RULES = [['normal', 'ふつう'], ['cmd', '統率者（とうそつしゃ）戦（せん）']];
// カードの あつめかた：パック（ぜんぶ もらう）か ドラフト（2026-10-26。パック 1つの かわりに「3まいから 1まい」を 7回）
const GETS = [['pack', 'パック'], ['draft', 'ドラフト']];
const DRAFT_PER_PACK = 7, DRAFT_SHOW = 3; // 7回：5回だと カードが たりず 勝率が 9ポイント 下がった（AI ドラフト 30回）
const cmdDef = () => (A?.cmd ? BY_ID[A.cmd] : null);
const cmdIdent = () => (A?.cmd ? colorsOf(BY_ID[A.cmd]) : null);
// ドラフトの 色（2026-10-27：デュエプレの ドラフトの ように）。2色か、旗の ある 3色を えらぶと、その 色の カード だけが 出る
// 3色を えらぶと その 3色の 旗を 1まい もらう（デッキが 3色に できる）。統率者戦では 統率者の 色。階を のぼる ときに かえられる
const draftCols = () => (A?.cmd ? cmdIdent() : A?.draftCols || null);
const colsText = (cs) => ['W', 'U', 'K', 'R', 'G'].filter((c) => cs.includes(c)).map((c) => COLOR_NAME[c]).join('・'); // いつもの じゅん（白・青・黒・赤・緑）
// デュエプレの ように：2色か 3色（旗つき）の くみあわせが ランダムに 3つ 出て、そこから 1つ えらぶ
const PAIRS = ['WU', 'UK', 'KR', 'RG', 'GW', 'WK', 'UR', 'KG', 'RW', 'GU'];
function draftOffers() {
  const all = [...PAIRS.map((p) => ({ cols: [...p] })), ...BANNERS.map((d) => ({ cols: [...d.banner], banner: d.id }))].filter((o) => o.cols.join() !== (A.draftCols || []).join());
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all.slice(0, 3);
}
async function chooseDraftColors(back) {
  const offers = draftOffers();
  const v = await sheet(`<p>${ruby('ドラフトで つかう 色の くみあわせを 1つ えらぼう。えらんだ 色の カード だけが 出るよ。')}</p>`, [
    ...offers.map((o, k) => ({ label: `<span>${o.banner ? '3しょく' : '2しょく'}：${colsText(o.cols)}</span>`, value: k + 1, kind: 'primary', note: o.banner ? ruby(`${info(BY_ID[o.banner]).name}つき（デッキを 3色に できる）`) : '' })),
    ...(back ? [{ label: `かえない（${colsText(A.draftCols || [])}）`, value: 0 }] : []),
  ], { title: 'ドラフトの 色', dismiss: false });
  if (!v) return false;
  const o = offers[v - 1];
  if (o.banner && !A.pool.includes(o.banner)) A.pool.push(o.banner);
  A.draftCols = ['W', 'U', 'K', 'R', 'G'].filter((c) => o.cols.includes(c)); save();
  return true;
}

let A = null; // いまの冒険
const app = () => document.getElementById('app');
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch { return null; } };
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(A)); } catch { /* 保存できない環境でも遊べる */ } };
const clearSave = () => { try { localStorage.removeItem(SAVE); } catch { /* なし */ } };
const defs = (ids) => ids.map((id) => BY_ID[id]);
const nm = (d) => info(d).name; // ふりがなつきの 名前（ruby に とおして 出す）

// ---- タイトル ----
const tutorialDone = () => { try { return !!localStorage.getItem(TUTORIAL_DONE); } catch { return true; } };

export function title() {
  const old = load();
  const first = !tutorialDone() && !old;
  const pref = old || { diff: 'normal' };
  app().innerHTML = `<main class="title">
    <div class="title-mark" aria-hidden="true"><span>＋</span><span>−</span><span>×</span><span>÷</span></div>
    <h1>マスマティック・<br>ザ・ギャザリング</h1>
    <p class="title-sub">算数の デッキこうちく ローグライク。パックを あけて デッキを くみ、5階だての とうを のぼろう。</p>
    ${raidShown() ? `<button type="button" class="raid-banner ${raidOpen() ? '' : 'done'}" data-go="raid"><span class="rb-tag">${raidOpen() ? 'かいさい中' : 'けっか'}</span><b>レイド：タルキール</b><small>${ruby(raidOpen() ? `龍族（りゅうぞく） vs 人間（にんげん）の 統率者戦（とうそつしゃせん）${raidFree() ? '（WEBばんは 仮（かり）モード）' : `・${new Date(RAID.ends).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric' })} まで`}` : 'どちらの 陣営（じんえい）が かった？')}</small></button>` : ''}
    <fieldset class="seg"><legend>せかい</legend>${PLANES.map(([k, l]) => `<label><input type="radio" name="plane" id="plane-${k}" value="${k}" ${(pref.plane || 'theros') === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>
    <fieldset class="seg"><legend>むずかしさ</legend>${DIFFS.map(([k, l]) => `<label><input type="radio" name="diff" id="diff-${k}" value="${k}" ${pref.diff === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>
    <fieldset class="seg"><legend>ルール</legend>${RULES.map(([k, l]) => `<label><input type="radio" name="rule" id="rule-${k}" value="${k}" ${(pref.cmd ? 'cmd' : 'normal') === k ? 'checked' : ''}><span>${ruby(l)}</span></label>`).join('')}</fieldset>
    <fieldset class="seg"><legend>カードの あつめかた</legend>${GETS.map(([k, l]) => `<label><input type="radio" name="get" id="get-${k}" value="${k}" ${(pref.draft ? 'draft' : 'pack') === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>
    <div class="title-btns">
      ${first ? '<button type="button" class="btn primary" data-go="tut">チュートリアル（はじめての 人）</button>' : ''}
      ${old && !old.over ? `<button type="button" class="btn primary" data-go="cont">つづきから（${old.endless ? `むげんの とう ${old.endless.floor}階` : `${old.idx + 1}階`}）</button>` : ''}
      <button type="button" class="btn ${(old && !old.over) || first ? '' : 'primary'}" data-go="new">あたらしい ぼうけん</button>
      <button type="button" class="btn tro-btn em-btn" data-go="emblem"><span aria-hidden="true">✦</span>もんしょう<small>${activeIds().length ? `${activeIds().length}こ ついて いる` : 'しゅぎょうで てに いれる'}・ポイント ${emblemPoints()}</small></button>
      <button type="button" class="btn" data-go="online">オンライン バトル${hasServer() ? '' : '<small>（れんしゅう）</small>'}</button>
      ${first ? '' : '<button type="button" class="btn" data-go="tut">チュートリアル</button>'}
      <button type="button" class="btn tro-btn" data-go="story">ストーリー<small>せかいめぐり ${storyCount()} / ${STORY_TOTAL}話</small></button>
      <button type="button" class="btn tro-btn" data-go="zukan">ずかん<small>カード ${zukanCount()}しゅるい</small></button>
      <button type="button" class="btn tro-btn" data-go="trophy">${cup(trophyCount() ? 'G' : 'X')}トロフィー<small>${trophyCount()} / ${TROPHIES.length}</small></button>
      <button type="button" class="btn ghost" data-go="settings">せってい</button>
      ${hasServer() && CONF.admin ? '<button type="button" class="btn ghost" data-go="admin">開発モード（先生）</button>' : ''}
    </div>
    ${DEV ? `<p class="fine"><span class="dev-badge">デバッグモード</span>${setsNote() ? ` ${ruby(`パックに 入る 弾（だん）：${setsNote()}`)}` : ''}</p>` : ''}
    ${endlessBest() ? `<p class="fine">むげんの とうの きろく：${endlessBest().floor}階・${endlessBest().score}てん</p>` : ''}
    <p class="fine">しさくばん。てきを タフネスと ちょうど 同じ ダメージで たおすと「ぴったり！」。</p>
  </main>`;
  app().onclick = (e) => {
    const b = e.target.closest('[data-go]'); if (!b) return;
    if (b.dataset.go === 'cont') { A = old; return resume(); }
    if (b.dataset.go === 'tut') return tutorial();
    if (b.dataset.go === 'online') return onlineMenu(app, title);
    if (b.dataset.go === 'raid') return raidMenu(app, title);
    if (b.dataset.go === 'story') return storyMenu(title);
    if (b.dataset.go === 'admin') return adminScreen(app, title);
    if (b.dataset.go === 'settings') return settingsScreen(app, title, { activeIds: activeIds() });
    if (b.dataset.go === 'trophy') return trophyScreen(app, title);
    if (b.dataset.go === 'zukan') return zukanScreen(app, title);
    if (b.dataset.go === 'emblem') return emblemScreen(app, title);
    const diff = app().querySelector('input[name=diff]:checked').value;
    const plane = app().querySelector('input[name=plane]:checked').value;
    const rule = app().querySelector('input[name=rule]:checked')?.value;
    const draft = app().querySelector('input[name=get]:checked')?.value === 'draft';
    // 統率者戦：さいしょに 統率者を えらぶ → しゅぎょう（広告の ように）→ もんしょうを えらぶ → パック
    const begin = async () => {
    const cmd = rule === 'cmd' ? await pickLegend({ back: 'タイトルへ' }) : null;
    if (rule === 'cmd' && !cmd) return title();
    const start = () => {
      // パックの もんしょう：きまぐれな いろは ここで きめる。はじめの 旗は さいしょから もつ
      const pk = activeEffects()?.pack;
      const cols = packColors(withExtra(enabledSets(), pk?.extra));
      const luck = pk?.rand ? cols[Math.floor(Math.random() * cols.length)] : null;
      A = { diff, plane, luck, pool: pk?.banner ? [pk.banner] : [], deck: null, floors: (plane === 'ravnica' ? pickRavnica : pickFloors)(Math.random), idx: 0, continues: 1, toOpen: 3, opened: 0, exact: 0, cmd, draft };
      save();
      packs();
    };
    if (adsOn()) gateStudy(app, plane, start); else start(); // 開発モードの せっていで こうこく なし
    };
    begin();
  };
}

// ---- チュートリアル（メレティスの 訓練場）----
function tutorial() {
  startBattle({
    deck: tutorialDeck(), floorId: 'tutorial', diff: 'easy', floorName: 'メレティスの くんれんじょう', tutorial: true, setup: tutorialSetup,
    quit: { label: 'タイトルへ もどる', note: 'チュートリアルを やめて タイトルへ もどる？ あとで また はじめから できるよ。', go: title },
    onEnd: async (r) => {
      if (r.win) {
        try { localStorage.setItem(TUTORIAL_DONE, '1'); } catch { /* 保存できなくても よい */ }
        award('tutorial');
        await sheet(`<p>${ruby(r.exact ? 'ぴったり 10点で まとを たおした！ マナの おきかた、しょうしゅう、ブロック、あっとう、ぴったり。これで とうに いどめるよ。' : 'まとを たおした！ つぎは ぴったりを ねらってみよう。これで とうに いどめるよ。')}</p>`,
          [{ label: 'つぎへ', value: 1, kind: 'primary' }], { title: 'チュートリアル クリア！', dismiss: false });
        // かてなく なったら もんしょう（REQUIREMENTS 12章）
        const v = await sheet(`<p>とうで かてなく なったら、タイトルの「✦ もんしょう」で しゅぎょうしよう！</p><p>${QUIZ_SECONDS}びょうで もんだいを といて、7わりより おおく せいかいすると もんしょうポイントが もらえる。ポイントで もんしょうを えらぶと、12じかん ぼうけんで つよく なれるよ（はじめの ライフが ふえる・たいようの ゆびわ など）。</p>`,
          [{ label: 'もんしょうを 見る', value: 'em', kind: 'primary' }, { label: 'タイトルへ', value: 't' }], { title: 'かてなく なったら もんしょうを てに いれよう', dismiss: false });
        if (v === 'em') return emblemScreen(app, title);
      }
      title();
    },
  });
}

// パックの もんしょうの せつめい（パックを あける 画面）
function emblemPackNote(em) {
  const out = [];
  if (em.ident) out.push(`<span>${ruby(`統率者（とうそつしゃ）${info(cmdDef()).name}の 色`)}（${em.ident.map((c) => `<i class="pip m-${c}">${COLOR_NAME[c]}</i>`).join(' ') || 'むしょく'}）の カード${A.opened === 0 && em.ident.length ? 'だけが 出る（さいしょの パック）' : 'が 出やすい'}</span>`);
  if (em.colors.length) out.push(`<span>${[...new Set(em.colors)].map((c) => `<i class="pip m-${c}">${COLOR_NAME[c]}</i>`).join(' ')} の カードが 出やすい（もんしょう${A.luck ? '・きまぐれな いろ' : ''}）</span>`);
  if (em.unc) out.push('<span>アンコモンが 1まい ふえて 9まい いり（もんしょう）</span>');
  for (const x of activeEffects()?.pack?.extra || []) out.push(`<span>${ruby(`${SETS.find((z) => z.id === x)?.name || ''} の カードも 出る（もんしょう）`)}</span>`);
  if (em.leg) out.push(`<span>レジェンドが 出る かくりつ <b>${Math.round(legendChance(A.idx, em) * 100)}%</b>（もんしょう）</span>`);
  return out.join('');
}
function resume() { if (A.toOpen > 0) packs(); else if (!A.deck) deckBuilder(); else tower(); }

// ---- パック開封（ソシャゲの ガチャ演出） ----
// ① 光る パックを タップして やぶる → ② 1まいずつ めくる（裏の光り方で レアリティが わかる）→ ③ まとめ
const ORDER = [1, 2, 3, 0, 4, 5, 6, 7]; // コモン → アンコモン → レア の順。0 は「！？」の わく
const GLOW = { C: '', U: 'g-U', R: 'g-R', L: 'g-L' };
function packs() {
  // ごほうびパック：登った階が 多いほど レア以上が 出やすく、デッキで いちばん使う色が 出やすい
  const cleared = A.idx;
  const favor = cleared > 0 && A.deck ? favorColor(deckStats(A.deck).ds) : null;
  // パックの もんしょう（いまの もの）と、ぼうけんの はじめに きまった きまぐれな いろ
  const pk = activeEffects()?.pack;
  const em = { colors: [...(pk?.colors || []), ...(A.luck ? [A.luck] : [])], unc: pk?.unc || 0, leg: pk?.leg || 0, extra: pk?.extra || [], ident: cmdIdent() };
  const rare = !!A.rarePack; // むげんの とうに さんせんした ごほうびの レアパック
  if (A.draft && !draftCols()) return chooseDraftColors().then(() => packs()); // ドラフト：さいしょに 色を えらぶ
  const only = A.draft ? draftCols() : A.cmd && A.opened === 0 ? cmdIdent() : null; // ドラフトは えらんだ 色だけ。統率者戦の さいしょの パックは 統率者の 色の カードだけ
  const roll = () => openPack(Math.random, { cleared, favor, sets: withExtra(enabledSets(), pk?.extra), em, rare, only });
  if (A.draft) return draftPick(roll);
  const cards = roll();
  // めくる じゅんばん：アンコモンの もんしょうで ふえた 9まいめ（アンコモン）は レアの まえ
  const order = cards.length > 8 ? [1, 2, 3, 0, 4, 5, 6, 8, 7] : ORDER;
  const surprise = !!cards.surprise;
  const ids = cards.map((d) => d.id);
  const owned = new Set(A.pool);
  const best = cards.some((d) => d.rar === 'L') ? 'L' : 'R';
  let stage = 'pack', k = 0, cracked = false, flipped = false;
  const st = { aura: best === 'L' ? 'aura-L' : 'aura-R' };
  const top = () => `<div class="pk-top"><p class="eyebrow">${rare ? 'レアパック' : `パック ${A.opened + 1}${A.idx === 0 ? ' / 3' : ''}`}</p>
    <button type="button" class="snd" data-snd="1" aria-pressed="${soundOn()}">おと ${soundOn() ? 'あり' : 'なし'}</button></div>`;
  const burst = (n = 22) => Array.from({ length: n }, (_, i) => `<i style="--a:${(360 / n) * i + Math.random() * 12}deg;--d:${70 + Math.random() * 90}px;--h:${Math.floor(Math.random() * 360)}"></i>`).join('');

  const draw = () => {
    if (stage === 'pack') {
      app().innerHTML = `<main class="gacha">${top()}
        <button type="button" class="foil ${st.aura} ${rare ? 'rare-pack' : ''}" data-open="1" aria-label="パックを あける">
          <span class="foil-shine"></span><span class="foil-title">MATHEMATIC<br>THE GATHERING</span><span class="foil-sub">${ids.length}まい いり</span>
        </button>
        <p class="gacha-hint">${best === 'L' ? 'パックが にじいろに 光っている…！？' : 'タップして パックを やぶろう'}</p>
        ${rare ? `<div class="bonus"><p class="bonus-title">むげんの とう さんせんの レアパック</p>
          <span>レジェンドが 出る かくりつ <b>${Math.round(rareLegendChance() * 100)}%</b><small>（ふつうは ${Math.round(legendChance(0) * 100)}%）</small></span>
          <span>コモンの はんぶんが アンコモンに、アンコモンの はんぶんが レアに かわる</span></div>` : cleared > 0 ? `<div class="bonus"><p class="bonus-title">${A.endless ? A.endless.floor - 1 : cleared}階 クリアの ごほうびパック</p>
          <span>レジェンドが 出る かくりつ <b>${Math.round(legendChance(cleared, em) * 100)}%</b><small>（さいしょは ${Math.round(legendChance(0) * 100)}%）</small></span>
          <span>上の 階ほど、レアや アンコモンに かわりやすい</span>
          ${favor ? `<span><i class="pip m-${favor}">${COLOR_NAME[favor]}</i> の カードが 出やすい（デッキで いちばん 使っている色）</span>` : ''}${emblemPackNote(em)}</div>` : emblemPackNote(em) ? `<div class="bonus"><p class="bonus-title">${em.ident && !em.colors.length && !em.unc && !em.leg && !em.extra.length ? ruby('統率者（とうそつしゃ）の パック') : 'もんしょうの パック'}</p>${emblemPackNote(em)}</div>` : ''}
      </main>`;
      return;
    }
    if (stage === 'reveal') {
      const i = order[k], d = BY_ID[ids[i]];
      const isSurprise = surprise && i === 0;
      const rar = isSurprise && !cracked ? 'C' : d.rar;
      const isNew = !owned.has(ids[i]);
      app().innerHTML = `<main class="gacha">${top()}
        <div class="stage ${flipped ? `shown s-${d.rar}` : ''}">
          ${flipped ? `<div class="big-card ${d.rar === 'L' ? 'legend' : ''}">${fullCard(d)}${isNew ? '<span class="new">NEW</span>' : ''}${isSurprise ? '<span class="wow">！？</span>' : ''}</div>`
            : `<button type="button" class="big-back ${GLOW[rar]} ${isSurprise && cracked ? 'crack' : ''}" data-flip="1" aria-label="めくる"><span>${isSurprise && cracked ? '！？' : '?'}</span></button>`}
          ${flipped && (d.rar === 'R' || d.rar === 'L') ? `<div class="burst ${d.rar === 'L' ? 'b-L' : ''}" aria-hidden="true">${burst(d.rar === 'L' ? 36 : 20)}</div>` : ''}
          ${flipped && d.rar === 'L' ? `<p class="legend-call">${isSurprise ? '<small>しょうかく！</small>' : ''}LEGEND!!</p>` : ''}
        </div>
        <p class="gacha-hint">${flipped ? `${esc(RAR_NAME[d.rar])}「${ruby(nm(d))}」` : rar === 'L' ? 'にじいろ…！' : rar === 'R' ? 'きんいろに 光っている！' : rar === 'U' ? 'ぎんいろに 光っている' : 'タップして めくろう'}</p>
        <ol class="dots">${order.map((_, n) => `<li class="${n < k || (n === k && flipped) ? 'on' : ''} ${n === k ? 'now' : ''}"></li>`).join('')}</ol>
        <p class="tap-next">${flipped ? `カードを タップで ${k < order.length - 1 ? 'つぎへ' : 'まとめへ'}（点線の ことばは 長おしで せつめい）` : ''}</p>
        <div class="row-btns"><button type="button" class="btn ghost" data-skip="1">スキップ</button></div>
      </main>`;
      return;
    }
    app().innerHTML = `<main class="gacha">${top()}
      <h2 class="sum-title">このパックの カード</h2>
      <div class="pack-grid">${ids.map((id, i) => `<button type="button" class="sum-card ${GLOW[BY_ID[id].rar]}" data-i="${i}">${cardFace(BY_ID[id])}${!owned.has(id) ? '<span class="new">NEW</span>' : ''}</button>`).join('')}</div>
      <div class="row-btns"><button type="button" class="btn primary" data-done="1">つぎへ</button></div>
    </main>`;
  };
  draw();

  let flippedAt = 0;
  const next = () => { if (k < order.length - 1) { k++; flipped = false; cracked = false; } else stage = 'sum'; sfx.tap(); draw(); };
  app().onclick = async (e) => {
    // めくった あとは、音・スキップ 以外の どこを タップしても つぎへ（点線の ことばの 長おしは せつめいが 出て、つぎへは いかない）
    if (stage === 'reveal' && flipped && !e.target.closest('[data-snd], [data-skip]')) {
      if (Date.now() - flippedAt > 350) next();
      return;
    }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.snd) { setSound(!soundOn()); return draw(); }
    if (b.dataset.open) {
      sfx.tear();
      b.classList.add('torn');
      setTimeout(() => { stage = 'reveal'; draw(); }, 520);
      return;
    }
    if (b.dataset.skip) { stage = 'sum'; sfx.flip(); return draw(); }
    if (b.dataset.flip) {
      const i = order[k], d = BY_ID[ids[i]];
      if (surprise && i === 0 && !cracked) { cracked = true; sfx.surprise(); return draw(); } // コモンの はずが…！？
      if ((d.rar === 'R' || d.rar === 'L') && !b.classList.contains('charging')) {
        b.classList.add('charging'); sfx.charge();
        setTimeout(() => { flipped = true; flippedAt = Date.now(); (d.rar === 'L' ? sfx.legend : sfx.rare)(); draw(); if (d.rar === 'L') flash(); }, 900);
        return;
      }
      flipped = true; flippedAt = Date.now();
      (d.rar === 'U' ? sfx.uncommon : sfx.flip)();
      return draw();
    }
    if (b.dataset.done) {
      A.pool.push(...ids); A.toOpen--; A.opened++; A.rarePack = 0; save();
      onPack(cards); // トロフィー（めくりおわってから）
      zukanPack(cards);
      return A.toOpen > 0 ? packs() : deckBuilder();
    }
    if (b.dataset.i != null) await sheet(detail(BY_ID[ids[+b.dataset.i]]), [{ label: 'とじる', value: 0 }]);
  };
}
// ---- ドラフト：パックから 3まい 見せて 1まい えらぶ。パック 1つぶんで 7回（A.pick に とちゅうを のこす） ----
function draftPick(roll) {
  if (!A.pick) A.pick = { n: 0, opts: null };
  if (!A.pick.opts) {
    const ids = [...new Set(roll().map((d) => d.id))];
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    A.pick.opts = ids.slice(0, DRAFT_SHOW); save();
  }
  const opts = A.pick.opts, st = deckStats(A.pool.map((_, i) => i));
  const have = (id) => A.pool.filter((x) => x === id).length;
  app().innerHTML = `<main class="draft">
    <div class="pk-top"><p class="eyebrow">ドラフト　パック ${A.opened + 1}${A.idx === 0 ? ' / 3' : ''}　えらぶ ${A.pick.n + 1} / ${DRAFT_PER_PACK}</p>
      <button type="button" class="snd" data-snd="1" aria-pressed="${soundOn()}">おと ${soundOn() ? 'あり' : 'なし'}</button></div>
    <h2>${DRAFT_SHOW}まいから 1まい えらぼう</h2>
    <p class="dr-cols">${ruby(`ドラフトの 色：${colsText(draftCols() || [])}`)}${!A.cmd && A.idx > 0 && A.pick.n === 0 ? ' <button type="button" class="btn" data-dcol="1">色を かえる</button>' : ''}</p>
    <div class="draft-row">${opts.map((id) => `<button type="button" class="draft-card" data-pick="${id}">${fullCard(BY_ID[id])}${have(id) ? `<span class="dr-have">もって いる ${have(id)}まい</span>` : ''}</button>`).join('')}</div>
    <p class="hint">タップで せつめい → えらぶ。${A.cmd ? ruby(`統率者（とうそつしゃ）の 色：${cmdIdent().map((c) => COLOR_NAME[c]).join('・') || 'むしょく'}。`) : ''}いま もって いる カード ${A.pool.length}まい（${st.colors.map((c) => `<i class="pip m-${c}">${COLOR_NAME[c]}</i>`).join('') || '−'}）</p>
  </main>`;
  app().onclick = async (e) => {
    if (e.target.closest('[data-snd]')) { setSound(!soundOn()); return draftPick(roll); }
    // 階を のぼった あとの さいしょの 1まいの まえ：ドラフトの 色を かえられる（この パックから）
    if (e.target.closest('[data-dcol]')) { if (await chooseDraftColors(true)) A.pick.opts = null; return packs(); }
    const b = e.target.closest('[data-pick]'); if (!b) return;
    const d = BY_ID[b.dataset.pick];
    const v = await sheet(detail(d), [{ label: 'これに する', value: 1, kind: 'primary' }, { label: 'もどる', value: 0 }]);
    if (!v) return;
    sfx.tap();
    A.pool.push(d.id); zukanPack([d]);
    A.pick.n++; A.pick.opts = null;
    if (A.pick.n >= DRAFT_PER_PACK) { A.pick = null; A.toOpen--; A.opened++; A.rarePack = 0; save(); return A.toOpen > 0 ? packs() : deckBuilder(); }
    save(); return draftPick(roll);
  };
}
const RAR_NAME = { C: 'コモン', U: 'アンコモン', R: 'レア', L: 'レジェンド' };
function flash() {
  const f = document.createElement('div');
  f.className = 'flash';
  document.body.append(f);
  setTimeout(() => f.remove(), 900);
}

// ---- デッキ構築 ----
function autoDeck() {
  const b = buildDeck(defs(A.pool), A.cmd ? { pair: cmdIdent() } : {});
  const used = new Set(), sel = [];
  for (const d of b.deck) {
    if (d.basic) continue;
    const i = A.pool.findIndex((id, k) => id === d.id && !used.has(k));
    if (i >= 0) { used.add(i); sel.push(i); }
  }
  return sel;
}

function deckStats(sel, pool = A.pool) {
  const ds = sel.map((i) => BY_ID[pool[i]]);
  const colors = [...new Set(ds.flatMap(colorsOf))];
  return { ds, colors, points: ds.reduce((t, d) => t + ptsOf(d), 0), count: ds.length, banner: ds.find((d) => d.banner)?.banner || '' };
}

export function finalDeck() {
  const { ds, colors } = deckStats(A.deck);
  // 冒険の あいだ ずっと（アルケミー YW05・YG05）：クリアした 階の 数だけ 強く なる
  const g = A.idx || 0;
  const deck = ds.map((d) => (d.id === 'YW05' && g ? { ...d, pow: d.pow + g, tou: d.tou + g } : d.id === 'YG05' && g ? { ...d, grow: 1 + g } : d));
  const cnt = Object.fromEntries(colors.map((c) => [c, ds.filter((d) => colorsOf(d).includes(c)).length]));
  const order = colors.length ? [...colors].sort((a, b) => cnt[b] - cnt[a]) : ['C'];
  const fill = colors.length ? order : cmdIdent()?.length ? cmdIdent() : order;
  for (let k = 0; deck.length < DECK_SIZE; k++) deck.push(BASICS[fill[k % fill.length]]);
  return deck;
}

function whyNot(sel, i, pool = A.pool, free = false) {
  const st = deckStats(sel, pool);
  const d = BY_ID[pool[i]];
  if (free) return whyNotPts(sel, i, pool); // 統率者戦：プールが 統率者の 色だけ なので 色は 見ない
  const id = pool === A?.pool && cmdIdent();
  if (id) return colorsOf(d).every((c) => id.includes(c)) ? whyNotPts(sel, i, pool) : `統率者（とうそつしゃ）の 色（${id.map((c) => COLOR_NAME[c]).join('・') || 'むしょく'}）の カードだけ`;
  const nc = [...new Set([...st.colors, ...colorsOf(d)])];
  // 旗（第6弾）が あれば、その 3色まで
  const flag = d.banner || st.banner;
  const okFlag = flag && nc.length <= 3 && nc.every((c) => flag.includes(c)) && (!d.banner || !st.banner || d.banner === st.banner);
  if (nc.length > 2 && !okFlag) return `色は 2色まで${flag ? '（はたが あれば その 3色まで）' : ''}（いまは ${st.colors.map((c) => COLOR_NAME[c]).join('・')}）`;
  return whyNotPts(sel, i, pool);
}
// はたを はずすと 3色の デッキに なれない
function whyNotOut(sel, i, pool = A.pool, free = false) {
  const d = BY_ID[pool[i]];
  if (!d.banner || free || (pool === A?.pool && A.cmd)) return '';
  const rest = deckStats(sel.filter((k) => k !== i), pool);
  return rest.colors.length > 2 && !rest.banner ? '3色めの カードを さきに はずそう（はたが ないと 2色まで）' : '';
}
function whyNotPts(sel, i, pool = A.pool) {
  const st = deckStats(sel, pool);
  const d = BY_ID[pool[i]];
  if (st.points + ptsOf(d) > CAPACITY) return `キャパシティを こえる（のこり ${CAPACITY - st.points}点、このカードは ${ptsOf(d)}点）`;
  if (st.count >= DECK_SIZE) return `デッキは ${DECK_SIZE}まいまで`;
  return '';
}

// 冒険の デッキ構築。ctx を わたすと ほかの プールでも つかえる（レイドの 統率者デッキ：raid.js）
// ctx = { pool: カードIDの ならび, deck: えらんだ 番号, save(), auto() → 番号, ok(), title, free: 色の きまりを 見ない, colorNote }
const advCtx = () => ({
  get pool() { return A.pool; }, get deck() { return A.deck; }, set deck(v) { A.deck = v; }, save, auto: autoDeck, ok: tower, title: 'デッキを くむ', free: false,
  colorNote: A.cmd ? '色（統率者（とうそつしゃ）の 色）' : '',
  // 統率者戦：デッキを なおす ときに 統率者も かえられる。色が あわない カードは デッキから はずす
  cmd: A.cmd ? { label: `統率者（とうそつしゃ）：${info(cmdDef()).name}`, change: async () => {
    const id = await pickLegend({ cur: A.cmd, eyebrow: '統率者（とうそつしゃ）を かえる', back: 'かえない' });
    if (id && id !== A.cmd) { A.cmd = id; const ok = cmdIdent(); A.deck = (A.deck || []).filter((i) => colorsOf(BY_ID[A.pool[i]]).every((c) => ok.includes(c))); if (!A.deck.length) A.deck = autoDeck(); save(); }
    deckBuilder();
  } } : null,
});
export function deckBuilder(C = advCtx()) {
  if (!C.deck) { C.deck = C.auto(); C.save(); }
  const F = loadFilter(); // こまかく：ならべかえ・しぼりこみ（deckfilter.js）
  const shownIdx = () => applyFilter(F, C.pool.map((id, i) => { const inDeck = C.deck.includes(i); return { i, d: BY_ID[id], inDeck, no: !inDeck && whyNot(C.deck, i, C.pool, C.free) }; }));
  const poolHtml = (list) => (list.length ? list.map((i) => {
    const inDeck = C.deck.includes(i);
    const no = !inDeck && whyNot(C.deck, i, C.pool, C.free);
    return `<button type="button" class="pool-item ${inDeck ? 'in' : ''} ${no ? 'no' : ''}" data-i="${i}">${cardFace(BY_ID[C.pool[i]])}<span class="pts">${ptsOf(BY_ID[C.pool[i]])}点</span></button>`;
  }).join('') : '<p class="pool-empty">あてはまる カードが ない。しぼりこみを へらそう。</p>');
  let mode = (() => { try { return localStorage.getItem(TAP_MODE) === 'quick' ? 'quick' : 'detail'; } catch { return 'detail'; } })();
  const draw = () => {
    const st = deckStats(C.deck, C.pool);
    const left = CAPACITY - st.points;
    const list = shownIdx();
    app().innerHTML = `<main class="builder ${F.open ? 'has-filter' : ''}">
      <header class="b-head">
        <h2>${ruby(C.title)}</h2>
        <div class="meters">
          <div class="meter"><span>キャパシティ</span><b>${st.points}<small>/${CAPACITY}点</small></b><i style="--v:${st.points / CAPACITY}"></i><em>のこり ${left}点</em></div>
          <div class="meter"><span>カード</span><b>${st.count}<small>まい</small></b><i style="--v:${st.count / DECK_SIZE}"></i><em>きほんカード ${DECK_SIZE - st.count}まい</em></div>
          <div class="meter"><span>${C.free || C.colorNote ? ruby(C.colorNote || '色') : st.banner ? '色（はたで 3色まで）' : '色（2色まで）'}</span><b class="cols">${st.colors.map((c) => `<i class="pip m-${c}">${COLOR_NAME[c]}</i>`).join('') || '−'}</b></div>
        </div>
        ${C.cmd ? `<div class="b-cmd"><span>${ruby(C.cmd.label)}</span><button type="button" class="btn" data-a="cmd">かえる</button></div>` : ''}
        <div class="tapmode" role="group" aria-label="カードを タップしたとき">
          <span>タップで</span>
          <button type="button" data-mode="detail" aria-pressed="${mode === 'detail'}">せつめいを 見る</button>
          <button type="button" data-mode="quick" aria-pressed="${mode === 'quick'}">すぐ 入れる・はずす</button>
          <button type="button" class="fine" data-fine="1" aria-pressed="${F.open}" aria-expanded="${F.open}">こまかく${filterCount(F) ? `<b>${filterCount(F)}</b>` : ''}</button>
        </div>
        <p class="hint">${mode === 'quick' ? 'タップで 入れる ⇔ はずす。長おしで せつめい。' : 'タップで せつめい → 入れる・はずす。'}点数は コモン1・アンコモン2・レア3・レジェンド4。</p>
      </header>
      ${filterPanel(F, C.pool.map((id) => BY_ID[id]), list.length, C.pool.length)}
      <div class="pool ${mode}">${poolHtml(list)}</div>
      <footer class="actions"><button type="button" class="btn" data-a="auto">おまかせ</button><button type="button" class="btn" data-a="clear">ぜんぶ はずす</button><button type="button" class="btn primary" data-a="ok">けってい</button></footer>
    </main>`;
  };
  draw();
  const showDetail = async (i) => {
    const inDeck = C.deck.includes(i);
    const no = !inDeck && whyNot(C.deck, i, C.pool, C.free);
    const v = await sheet(detail(BY_ID[C.pool[i]]), [
      inDeck ? { label: 'デッキから はずす', value: 'out', kind: 'primary', disabled: !!whyNotOut(C.deck, i, C.pool, C.free), note: whyNotOut(C.deck, i, C.pool, C.free) } : { label: 'デッキに 入れる', value: 'in', kind: 'primary', disabled: !!no, note: no || '' },
      { label: 'とじる', value: null },
    ]);
    if (v === 'out') C.deck = C.deck.filter((k) => k !== i);
    if (v === 'in') C.deck.push(i);
    C.save(); draw();
  };
  // すぐ 入れる・はずす モード：長おしで せつめい（点線の ことばの 長おしは ことばの せつめいに まかせる）
  let press = null, pressed = false;
  app().onpointerdown = (e) => {
    clearTimeout(press); pressed = false;
    const el = mode === 'quick' && e.target.closest('.pool-item');
    if (!el || e.target.closest('[data-term]')) return;
    press = setTimeout(() => { pressed = true; showDetail(+el.dataset.i); }, 450);
  };
  app().onpointerup = app().onpointercancel = () => clearTimeout(press);
  // なまえで さがす：入力ちゅうは カードの ならびだけ かきかえる（入力欄が きえない ように）
  app().oninput = (e) => {
    if (!e.target.dataset?.fq) return;
    F.q = e.target.value; saveFilter(F);
    const list = shownIdx();
    app().querySelector('.pool').innerHTML = poolHtml(list);
    const sum = app().querySelector('.fsum span'); if (sum) sum.textContent = `${list.length} / ${C.pool.length}まい を 見せて いる`;
  };
  app().onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.fine) { F.open = !F.open; saveFilter(F); return draw(); }
    if (onFilterClick(F, b)) return draw();
    if (b.dataset.mode) { mode = b.dataset.mode; try { localStorage.setItem(TAP_MODE, mode); } catch { /* 保存できなくても 切りかえられる */ } return draw(); }
    if (b.dataset.a === 'cmd') return C.cmd.change();
    if (b.dataset.a === 'auto') { C.deck = C.auto(); C.save(); return draw(); }
    if (b.dataset.a === 'clear') { C.deck = []; C.save(); return draw(); }
    if (b.dataset.a === 'ok') {
      if (!C.deck.length && !C.cmd) return sheet('<p>カードを 1まい いじょう 入れよう。</p>', [{ label: 'とじる', value: 0 }]);
      C.save(); return C.ok();
    }
    if (b.dataset.i == null) return;
    const i = +b.dataset.i;
    if (mode === 'detail') return showDetail(i);
    if (pressed) { pressed = false; return; } // 長おしで せつめいを 出した あとの タップ
    if (C.deck.includes(i)) {
      const no = whyNotOut(C.deck, i, C.pool, C.free);
      if (no) { toast(`はずせない：${no}`); return; }
      C.deck = C.deck.filter((k) => k !== i);
    } else {
      const no = whyNot(C.deck, i, C.pool, C.free);
      if (no) { toast(`入れられない：${no}`); b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny'); return; }
      C.deck.push(i);
    }
    sfx.tap(); C.save(); draw();
  };
}

// ---- 塔 ----
function tower() {
  if (A.endless) return endlessTower();
  const st = deckStats(A.deck);
  app().innerHTML = `<main class="tower">
    <p class="eyebrow">${DIFFS.find(([k]) => k === A.diff)[1]}　コンティニュー のこり ${A.continues}回</p>
    <h2>${A.plane === 'ravnica' ? 'ラヴニカの とう' : 'テーロスの とう'}</h2>
    <ol class="floors">${A.floors.map((f, i) => `<li class="${i < A.idx ? 'done' : i === A.idx ? 'now' : ''}"><span>${ruby(FLOOR_NAMES[f])}</span><em>${i < A.idx ? 'クリア' : i === A.idx ? 'いま ここ' : ''}</em></li>`).reverse().join('')}</ol>
    ${A.cmd ? `<p class="deckline">${ruby(`統率者（とうそつしゃ）：${info(cmdDef()).name}`)}（${cmdColorText(cmdDef()) || 'むしょく'}）</p>` : ''}
    <p class="deckline">デッキ：${st.colors.map((c) => COLOR_NAME[c]).join('・') || 'むしょく'}　${st.points}点　カード${st.count}まい＋きほん${DECK_SIZE - st.count}まい</p>
    ${emblemLine() ? `<p class="em-line">もんしょう：${esc(emblemLine())}</p>` : ''}
    <div class="row-btns"><button type="button" class="btn" data-a="deck">デッキを なおす</button><button type="button" class="btn primary" data-a="go">${ruby(FLOOR_NAMES[A.floors[A.idx]])}へ</button></div>
    <button type="button" class="btn ghost" data-a="quit">タイトルへ（つづきは のこる）</button>
  </main>`;
  app().onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'deck') deckBuilder();
    if (a === 'quit') title();
    if (a === 'go') fight();
  };
}

const CMD_BUFF_FROM = 2; // 0 から かぞえる：2 ＝ 3階
function fight() {
  const f = A.floors[A.idx];
  startBattle({
    deck: finalDeck(), floorId: f, diff: A.diff, floorName: FLOOR_NAMES[f], emblem: activeEffects(), emblemNote: emblemLine(), cmd: cmdDef(),
    // 統率者モード：3階から 上は てきの クリーチャーが ＋1/＋1（統率者が いると つよすぎた。docs/REQUIREMENTS.md 8.5）
    buff: A.cmd && A.idx >= CMD_BUFF_FROM ? 1 : 0, extraNote: A.cmd && A.idx >= CMD_BUFF_FROM ? '統率者（とうそつしゃ）が いるので、てきも 本気（ほんき）！ てきの クリーチャーは ＋1/＋1' : '',
    quit: { label: 'タイトルへ もどる', note: 'ぼうけんの つづきは のこる。この 階は「つづきから」で はじめから やりなおしに なるよ。', go: title },
    onEnd: async (r) => {
      A.exact = (A.exact || 0) + r.exact;
      onBattle(r, { advExact: A.exact, floorIdx: A.idx, points: deckStats(A.deck).points });
      zukanBattle(r);
      if (r.win) {
        A.idx++;
        if (A.idx >= A.floors.length) return askEndless();
        A.toOpen = 1; save();
        await sheet('<p>パックを 1つ あけて、デッキを くみなおせる。</p>', [{ label: 'パックを あける', value: 1, kind: 'primary' }], { title: 'ごほうび', dismiss: false });
        return packs();
      }
      if (A.continues > 0) {
        const v = await sheet(`<p>コンティニューすると、${ruby(FLOOR_NAMES[f])}の はじめから やりなおせる（ライフは はじめの 数に もどる）。デッキを なおしてから いどんでも いい。</p>${emblemHint()}`,
          [{ label: 'コンティニュー（のこり1回）', value: 'c', kind: 'primary' }, { label: 'あきらめる', value: 'x' }], { title: 'まけてしまった', dismiss: false });
        if (v === 'c') { A.continues--; save(); return tower(); }
      }
      A.over = 'lose'; save(); return ending(false);
    },
  });
}

// まけた とき：もんしょうが ついて いなければ、しゅぎょうを すすめる
const emblemHint = (over = false) => (activeIds().length ? '' : `<p class="em-line">かてない ときは、タイトルの「✦ もんしょう」で しゅぎょうして もんしょうを つけよう${over ? '。つぎの ぼうけんが らくに なる' : '（ぼうけんは「つづきから」で もどれる）'}。</p>`);

const pairOf = () => (A.deck ? [...deckStats(A.deck).colors].sort((a, b) => 'WUKRG'.indexOf(a) - 'WUKRG'.indexOf(b)).join('') : '');
// とうの きろく（トロフィー・ずかん）。むげんの とうに すすむ ときは ここで きろくする
function recordRun(win) {
  const reached = win ? 5 : A.idx + 1, pair = pairOf();
  if (win && A.deck) onClear({ diff: A.diff, continued: A.continues < 1, pair });
  zukanRun({ diff: A.diff, reached, exact: A.exact || 0, pair, win });
  A.recorded = true;
}
function ending(win) {
  const reached = win ? 5 : A.idx + 1;
  if (!A.recorded) recordRun(win);
  const mat = win && awardMat(TOWER_MAT[A.plane || 'theros']) ? TOWER_MAT[A.plane || 'theros'] : null; // 塔を のぼりきった：プレイマット
  // デッキを ゴーストに して あずける（オンライン バトルで ほかの 人と たたかえる）
  if (A.deck) saveGhost(finalDeck(), win ? 6 : reached);
  app().innerHTML = `<main class="ending ${win ? 'win' : 'lose'}">
    <p class="eyebrow">${win ? 'とうを のぼりきった' : `${reached}階で ちからつきた`}</p>
    <h2>${win ? (A.plane === 'ravnica' ? 'ジェイスに みとめられた！' : 'エレボスを たおした！') : 'ぼうけん おわり'}</h2>
    <dl class="stats">
      <div><dt>とどいた 階</dt><dd>${reached}<small>/5</small></dd></div>
      <div><dt>ぴったり</dt><dd>${A.exact || 0}<small>回</small></dd></div>
      <div><dt>あけた パック</dt><dd>${A.opened}</dd></div>
      <div><dt>トロフィー</dt><dd>${trophyCount()}<small>/${TROPHIES.length}</small></dd></div>
    </dl>
    ${mat ? `<p class="what mat-get"><span class="mat-sw" data-m="${mat}"></span><span>${ruby(`プレイマット「${matName(mat)}」を 手に 入れた！（せっていで かえられる）`)}</span></p>` : ''}
    <p class="fine">この デッキは「ゴースト」に なった。タイトルの「オンライン バトル」で つかえるよ。</p>
    ${adsOn() ? `<p class="say"><b>${A.plane === 'ravnica' ? 'ジェイス' : 'テーロスの 神々'}</b><span>${A.plane === 'ravnica' ? 'もっと つよく なりたいかい？' : 'もっと つよく なりたいか？'}</span></p>
    <div class="row-btns"><button type="button" class="btn primary" data-a="more">しゅぎょうする<small>ボーナス ＋2ポイント</small></button><button type="button" class="btn" data-a="t">タイトルへ</button></div>` : '<button type="button" class="btn primary" data-a="t">タイトルへ</button>'}
  </main>`;
  clearSave();
  const plane = A.plane;
  app().onclick = (e) => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'more') moreStudy(app, plane, title); else title(); };
}

// ---- むげんの とう（docs/ENDLESS.md）：とうを クリアした あと、まけるまで のぼる ----
function endlessBest() { try { return JSON.parse(localStorage.getItem(ENDLESS_BEST) || 'null'); } catch { return null; } }
const lapOf = (floor) => Math.floor((floor - ENDLESS.start) / 5) + 1; // 6〜10階が 1周め
const floorTitle = (f, n) => `${n}階 ${FLOOR_NAMES[f].replace(/^\d+階 /, '')}`;
const pickPlane = () => (A.plane === 'ravnica' ? pickRavnica : pickFloors)(Math.random);
const blessLine = (have) => PATHS.filter((p) => have[p.id]).map((p) => `${p.name} ${'●'.repeat(have[p.id])}${'○'.repeat(BLESS_MAX - have[p.id])}`).join('　');

async function askEndless() {
  recordRun(true);
  A.over = 'clear'; save();
  const v = await sheet(`<p>${ruby(A.plane === 'ravnica' ? 'ジェイスを こえた きみの まえに、はてしなく つづく とうが あらわれた。' : 'エレボスを こえた きみの まえに、はてしなく つづく とうが あらわれた。')}</p>
    <p>${ruby(`6階から、まけるまで のぼりつづける。11階からは 5階ごとに てきが ＋1/＋1 つよく なる。ぴったりを ${ENDLESS.exactPer}回 するか、5階ごとの 休けい所で しゅぎょうに ごうかくすると「祝福（しゅくふく）」が もらえる。`)}</p>`,
  [{ label: 'さんせんする', value: 'go', kind: 'primary' }, { label: 'さんせんしない（おわり）', value: 'no' }], { title: 'むげんの とうに さんせんしますか？', dismiss: false });
  if (v !== 'go') return ending(true);
  A.over = null;
  A.endless = { floor: ENDLESS.start, idx: 0, floors: pickPlane(), have: {}, bank: 0, exact: 0 };
  // さんせんの ごほうび：レアパック
  A.toOpen = 1; A.rarePack = 1; save();
  await sheet('<p>さんせんの ごほうびに <b>レアパック</b>（いつもより いい カードが 出やすい）を 1つ あけよう！</p>', [{ label: 'レアパックを あける', value: 1, kind: 'primary' }], { title: 'むげんの とうへ ようこそ', dismiss: false });
  return packs();
}

function endlessTower() {
  const E = A.endless, st = deckStats(A.deck), lap = lapOf(E.floor), buff = endlessBuff(lap);
  const best = endlessBest();
  app().innerHTML = `<main class="tower endless">
    <p class="eyebrow">${DIFFS.find(([k]) => k === A.diff)[1]}　コンティニュー のこり ${A.continues}回　${lap}しゅうめ</p>
    <h2>むげんの とう</h2>
    <dl class="stats">
      <div><dt>いま</dt><dd>${E.floor}<small>階</small></dd></div>
      <div><dt>てき</dt><dd>${buff ? `＋${buff}/＋${buff}` : '±0'}</dd></div>
      <div><dt>ぴったり</dt><dd>${E.exact}<small>回</small></dd></div>
      <div><dt>きろく</dt><dd>${best ? best.floor : '−'}<small>階</small></dd></div>
    </dl>
    <ol class="floors">${E.floors.map((f, i) => `<li class="${i < E.idx ? 'done' : i === E.idx ? 'now' : ''}"><span>${ruby(floorTitle(f, E.floor - E.idx + i))}</span><em>${i < E.idx ? 'クリア' : i === E.idx ? 'いま ここ' : i === E.floors.length - 1 ? '休けい所' : ''}</em></li>`).reverse().join('')}</ol>
    <p class="em-line">${ruby('祝福（しゅくふく）')}：${E.have && Object.keys(E.have).length ? ruby(blessLine(E.have)) : 'まだ ない'}</p>
    <p class="em-line">つぎの ${ruby('祝福（しゅくふく）')}まで ぴったり あと ${ENDLESS.exactPer - E.bank}回</p>
    ${A.cmd ? `<p class="deckline">${ruby(`統率者（とうそつしゃ）：${info(cmdDef()).name}`)}（${cmdColorText(cmdDef()) || 'むしょく'}）</p>` : ''}
    <p class="deckline">デッキ：${st.colors.map((c) => COLOR_NAME[c]).join('・') || 'むしょく'}　${st.points}点　カード${st.count}まい＋きほん${DECK_SIZE - st.count}まい</p>
    <div class="row-btns"><button type="button" class="btn" data-a="deck">デッキを なおす</button><button type="button" class="btn primary" data-a="go">${ruby(floorTitle(E.floors[E.idx], E.floor))}へ</button></div>
    <button type="button" class="btn ghost" data-a="quit">タイトルへ（つづきは のこる）</button>
  </main>`;
  app().onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'deck') deckBuilder();
    if (a === 'quit') title();
    if (a === 'go') endlessFight();
  };
}

function endlessFight() {
  const E = A.endless, f = E.floors[E.idx], buff = endlessBuff(lapOf(E.floor));
  const name = floorTitle(f, E.floor) + (buff ? `（てき ＋${buff}/＋${buff}）` : '');
  startBattle({
    deck: finalDeck(), floorId: f, diff: A.diff, floorName: name, emblem: activeEffects(), emblemNote: emblemLine(), bless: blessFx(E.have), buff, cmd: cmdDef(),
    quit: { label: 'タイトルへ もどる', note: 'むげんの とうの つづきは のこる。この 階は はじめから やりなおしに なるよ。', go: title },
    onEnd: async (r) => {
      E.exact += r.exact; E.bank += r.exact; A.exact = (A.exact || 0) + r.exact;
      onBattle(r, { advExact: A.exact, floorIdx: 4, points: deckStats(A.deck).points });
      zukanBattle(r);
      if (!r.win) {
        if (A.continues > 0) {
          const v = await sheet(`<p>コンティニューすると、${ruby(name)}の はじめから やりなおせる。</p>`,
            [{ label: `コンティニュー（のこり${A.continues}回）`, value: 'c', kind: 'primary' }, { label: 'あきらめる', value: 'x' }], { title: 'まけてしまった', dismiss: false });
          if (v === 'c') { A.continues--; save(); return endlessTower(); }
        }
        return endlessEnd();
      }
      const cleared = E.floor;
      E.floor++; E.idx++;
      if (E.idx >= E.floors.length) { E.idx = 0; E.floors = pickPlane(); }
      save();
      // ぴったり 3回で 祝福 → 5階ごとに 休けい所 → ごほうびパック（いつもの とうと 同じ）
      while (E.bank >= ENDLESS.exactPer) { E.bank -= ENDLESS.exactPer; save(); await blessPick(`ぴったり ${ENDLESS.exactPer}回の ごほうび`); }
      A.toOpen = 1;
      if (cleared % ENDLESS.rest === 0) return rest(cleared);
      save();
      await sheet(`<p>${cleared}階 クリア！ パックを 1つ あけて、デッキを くみなおせる。</p>`, [{ label: 'パックを あける', value: 1, kind: 'primary' }], { title: 'ごほうび', dismiss: false });
      return packs();
    },
  });
}

// 祝福を 1つ えらぶ（3つから）
function blessPick(why) {
  const E = A.endless;
  const ch = blessChoices(Math.random, E.have);
  if (!ch.length) return Promise.resolve();
  return sheet(`<p>${ruby(why)}。${ruby('祝福（しゅくふく）')}を 1つ えらぼう。おなじ ${ruby('運命（うんめい）')}を 3つ あつめると つよく なる（1・2・4）。</p>`,
    ch.map((p) => { const n = (E.have[p.id] || 0) + 1; return { label: `${ruby(p.name)} ${'●'.repeat(n)}${'○'.repeat(BLESS_MAX - n)}`, value: p.id, kind: 'primary', note: ruby(blessText(p.id, n)) }; }),
    { title: ruby('祝福（しゅくふく）'), dismiss: false }).then((id) => { if (id) { E.have[id] = (E.have[id] || 0) + 1; save(); toast(`しゅくふくを もらった：${PATH_BY_ID[id].name}`); } });
}

// 休けい所（5階ごと）：ごほうびパックに 足して、パック・コンティニュー・しゅぎょう（ごうかくで 祝福）から 1つ
async function rest(cleared) {
  const v = await sheet(`<p>${cleared}階まで のぼった！ ひとやすみ。ごほうびパックの ほかに 1つ えらぼう。</p>`, [
    { label: 'パックを もう 1つ（ぜんぶで 2つ）', value: 'pack', kind: 'primary' },
    { label: 'コンティニュー ＋1', value: 'cont', note: `いま のこり ${A.continues}回` },
    { label: `しゅぎょうする（ごうかくで ${ruby('祝福（しゅくふく）')}）`, value: 'study', note: 'もんしょうポイントも もらえる' },
  ], { title: '休けい所', dismiss: false });
  if (v === 'cont') { A.continues++; save(); return packs(); }
  if (v === 'study') return blessStudy(app, A.plane, async (pass) => { if (pass) await blessPick('しゅぎょうに ごうかく'); else toast('こんどは ごうかく できなかった'); packs(); });
  A.toOpen = 2; save(); return packs();
}

function endlessEnd() {
  const E = A.endless, floor = E.floor, score = endlessScore(floor, E.exact);
  const old = endlessBest(), isBest = !old || score > old.score;
  if (isBest) try { localStorage.setItem(ENDLESS_BEST, JSON.stringify({ floor, exact: E.exact, score, t: Date.now() })); } catch { /* 保存できなくても よい */ }
  if (A.deck) saveGhost(finalDeck(), 6);
  app().innerHTML = `<main class="ending lose endless">
    <p class="eyebrow">むげんの とう ${floor}階で ちからつきた</p>
    <h2>${isBest ? 'しんきろく！' : 'むげんの とう おわり'}</h2>
    <dl class="stats">
      <div><dt>とどいた 階</dt><dd>${floor}<small>階</small></dd></div>
      <div><dt>ぴったり</dt><dd>${E.exact}<small>回</small></dd></div>
      <div><dt>スコア</dt><dd>${score}</dd></div>
      <div><dt>きろく</dt><dd>${isBest ? score : old.score}</dd></div>
    </dl>
    <p class="say"><b>スコアの けいさん</b><span>${floor} × 10 ＋ ${E.exact} ＝ ${score}</span></p>
    ${Object.keys(E.have).length ? `<p class="em-line">${ruby('祝福（しゅくふく）')}：${ruby(blessLine(E.have))}</p>` : ''}
    ${adsOn() ? '<div class="row-btns"><button type="button" class="btn primary" data-a="more">しゅぎょうする<small>ボーナス ＋2ポイント</small></button><button type="button" class="btn" data-a="t">タイトルへ</button></div>' : '<button type="button" class="btn primary" data-a="t">タイトルへ</button>'}
  </main>`;
  clearSave();
  const plane = A.plane;
  app().onclick = (e) => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'more') moreStudy(app, plane, title); else title(); };
}

applyTheme();
applyMat();
initTerms();
// GAS 版：さいしょに 先生の せってい（パックの 弾・レイド）と、先生か どうかを もらう
if (hasServer()) {
  app().innerHTML = '<main class="title"><p class="fine">よみこみちゅう…</p></main>';
  loadConf().then(() => { applyConf(); applyRaid(); title(); });
} else title();
