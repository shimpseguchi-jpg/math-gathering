// 冒険の流れ：タイトル → パック開封 → デッキ構築 → 塔 → たたかい → …
import { openPack, buildDeck, DECK_SIZE, CAPACITY, favorColor, legendChance, packColors, withExtra, rareLegendChance } from '../engine/run.js';
import { BY_ID, BASICS, SETS } from '../data/cards.js';
import { pickFloors } from '../data/enemies.js';
import { RAV_NAMES, pickRavnica } from '../data/ravnica.js';
import { STRIX, COLLEGES, STRIX_NAMES, SUBJECT_OF, pickStrix, grown, growText, starsOf, gradeOf, byDiff } from '../data/strixhaven.js';
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
import { loading } from './loading.js';
import { adminScreen } from './admin.js';
import { sfx, soundOn, setSound } from './sfx.js';
import { DEV, enabledSets, setsNote, settingsScreen, adsOn, applyTheme, applyConf } from './settings.js';
import { TROPHIES, award, onBattle, onClear, onPack, trophyCount, trophyScreen, cup } from './trophies.js';
import { zukanPack, zukanBattle, zukanRun, zukanScreen, zukanCount } from './zukan.js';
import { GATES, diffOpen, planeOpen, nextStep, LOCK_TEXT, NEWS_TEXT, unlockNews } from './unlock.js';
import { emblemScreen, activeEffects, activeIds, emblemLine, emblemPoints, gateStudy, moreStudy, blessStudy } from './emblem.js';
import { PATHS, PATH_BY_ID, blessText, blessChoices, blessFx, endlessBuff, endlessScore, ENDLESS, BLESS_MAX } from '../data/blessings.js';
import { QUIZ_SECONDS } from '../data/quiz.js';
import { loadFilter, filterPanel, applyFilter, onFilterClick, onFilterInput, filterCount, saveFilter } from './deckfilter.js';
import { cardFace, fullCard, detail, sheet, esc, ruby, info, COLOR_NAME, initTerms, toast, byColorCost, pickMany } from './view.js';
import { BANNERS } from '../data/emblems.js';
import { gacha } from './gacha.js';
import { constructMenu } from './construct.js';
import { addTickets, tickets, ENDLESS_PER } from './collection.js';

const SAVE = 'mtg-adventure-v1';
const ENDLESS_BEST = 'mtg-endless-best'; // むげんの とうの いちばんの きろく { floor, exact, score }
const TAP_MODE = 'mtg-build-tap'; // デッキ構築で タップしたとき：'detail'（せつめい）か 'quick'（すぐ 入れる・はずす）
export const FLOOR_NAMES = {
  hydra: '1階 ハイドラとの たいじ', horde: '2階 たいぐんとの たたかい', factory: '3階 ゴーレムの工場', slime: '3階 ふえるスライム',
  xenagos: '4階 神を うて', erebos: '5階 死者の神 エレボス',
  clock: '1階 からくり とけいとう', dragon: '2階 ドラゴンの たからの 山', twins: '3階 ふたごの きょじん', gorgon: '4階 メドゥーサの 石の 庭',
  ...RAV_NAMES, ...STRIX_NAMES,
};
// せかい（プレーン）：どの 塔に のぼるか（docs/RAVNICA.md・docs/STRIXHAVEN.md）
const PLANES = [['theros', 'テーロス'], ['ravnica', 'ラヴニカ'], ['strixhaven', 'ストリクスヘイヴン']];
const pickFor = (plane) => (plane === 'ravnica' ? pickRavnica : plane === 'strixhaven' ? pickStrix : pickFloors)(Math.random);
// ストリクスヘイヴン：入学式で えらんだ 寮・その 2色・階の なまえ（階の じゅんばんは ランダムなので ばんごうを つける）
const strix = () => A?.plane === 'strixhaven';
const college = () => (A?.college ? COLLEGES[A.college] : null);
const floorLabel = (i) => (strix() ? `${i + 1}階 ${FLOOR_NAMES[A.floors[i]]}` : FLOOR_NAMES[A.floors[i]]);
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
const draftCols = () => (A?.cmd ? cmdIdent() : A?.draftCols || (college() ? [...college().cols] : null));
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

// ---- タイトル ----
const tutorialDone = () => { try { return !!localStorage.getItem(TUTORIAL_DONE); } catch { return true; } };

// メニュー（タイトル）の 絵：線だけの 小さい マーク（24×24。スマホの ゲームの ホーム画面の ように、ボタンを タイルで ならべる）
const T_ICON = {
  build: '<rect x="3" y="6" width="11" height="15" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v13"/>',
  emblem: '<path d="M12 2l2.4 7.6H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.5 2.4-7.4L2 9.6h7.6z" fill="currentColor" stroke="none"/>',
  online: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  tut: '<path d="M5 21V4h12l-2 4 2 4H5"/>',
  story: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  zukan: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  admin: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>',
};
const tIcon = (k) => `<svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${T_ICON[k]}</svg>`;
// メニューの タイル：絵・名前・みじかい しらせ（data-go は これまでと おなじ）
const tile = (go, label, sub, ic = tIcon(go), cls = '') => `<button type="button" class="tile ${cls}" data-go="${go}"><span class="ti-wrap">${ic}</span><span class="ti-text"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span></button>`;
// ぼうけんの せってい：1行に 名前と えらぶ つまみ（input の name・id は これまでと おなじ）。まだ あそべない ものは うすく、タップで わけ（unlock.js）
const LOCK_SVG = '<svg class="lk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
const segRow = (name, label, items, cur, rb = false, locked = () => false) => `<div class="seg" role="radiogroup" aria-label="${label}"><b class="seg-l">${label}</b>${items.map(([k, l]) => locked(k)
  ? `<label class="lock" data-lock="${k}" role="button" tabindex="0" aria-label="${l}（まだ あそべない）"><span>${rb ? ruby(l) : l}${LOCK_SVG}</span></label>`
  : `<label><input type="radio" name="${name}" id="${name}-${k}" value="${k}" ${cur === k ? 'checked' : ''}><span>${rb ? ruby(l) : l}</span></label>`).join('')}</div>`;

export function title() {
  const old = load();
  const first = !tutorialDone() && !old;
  const pref = old || { diff: 'easy' }; // はじめては「かんたん」
  // ひらく じゅんばん：まだの ものは えらべない。えらんで いた ものが まだ なら、あそべる ほうに
  const step = nextStep(); // 'tutorial' | 'story' | null（とうは あそべる）
  const plane0 = planeOpen(pref.plane || 'theros') ? (pref.plane || 'theros') : 'theros';
  const diff0 = diffOpen(pref.diff) ? pref.diff : 'normal';
  const lockBtn = (key) => `<button type="button" class="btn lock" data-lock="${key}">あたらしい ぼうけん<small>${key === 'tutorial' ? 'チュートリアルの あとで' : 'ストーリー 1章の あとで'}</small></button>`;
  app().innerHTML = `<main class="title">
    <header class="t-head">
      <div class="title-mark" aria-hidden="true"><span>＋</span><span>−</span><span>×</span><span>÷</span></div>
      <div class="t-logo">
        <h1>マスマティック・<br>ザ・ギャザリング</h1>
        <p class="title-sub">算数の デッキこうちく ローグライク。パックを あけて デッキを くみ、5階だての とうを のぼろう。</p>
      </div>
    </header>
    <section class="t-main">
      ${raidShown() ? `<button type="button" class="raid-banner ${raidOpen() ? '' : 'done'}" data-go="raid"><span class="rb-tag">${raidOpen() ? 'かいさい中' : 'けっか'}</span><b>レイド：タルキール</b><small>${ruby(raidOpen() ? `龍族（りゅうぞく） vs 人間（にんげん）の 統率者戦（とうそつしゃせん）${raidFree() ? '（WEBばんは 仮（かり）モード）' : `・${new Date(RAID.ends).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric' })} まで`}` : 'どちらの 陣営（じんえい）が かった？')}</small></button>` : ''}
      <div class="title-btns">
        ${first || step === 'tutorial' ? '<button type="button" class="btn primary" data-go="tut">チュートリアル（はじめての 人）</button>' : ''}
        ${step === 'story' ? '<button type="button" class="btn primary" data-go="story">ストーリーを すすめる<small>1章を クリアすると とうへ</small></button>' : ''}
        ${old && !old.over ? `<button type="button" class="btn primary" data-go="cont">つづきから<small>${old.endless ? `むげんの とう ${old.endless.floor}階` : `${old.idx + 1}階から`}</small></button>` : ''}
        ${step ? lockBtn(step) : `<button type="button" class="btn ${(old && !old.over) || first ? '' : 'primary'}" data-go="new">あたらしい ぼうけん</button>`}
      </div>
      ${step ? '' : `<div class="t-opts">
        <p class="t-opts-h">ぼうけんの せってい</p>
        ${segRow('plane', 'せかい', PLANES, plane0, false, (k) => !planeOpen(k))}
        ${segRow('diff', 'むずかしさ', DIFFS, diff0, false, (k) => !diffOpen(k))}
        ${segRow('rule', 'ルール', RULES, pref.cmd ? 'cmd' : 'normal', true)}
        ${segRow('get', 'あつめかた', GETS, pref.draft ? 'draft' : 'pack')}
      </div>`}
    </section>
    <nav class="t-menu" aria-label="メニュー">
      ${tile('build', 'こうちく', `パックけん ${tickets()}まい`)}
      ${tile('emblem', 'もんしょう', activeIds().length ? `${activeIds().length}こ ついて いる・ポイント ${emblemPoints()}` : `ポイント ${emblemPoints()}・しゅぎょうで ふえる`)}
      ${tile('story', 'ストーリー', step === 'story' ? '1章を クリアすると とうへ' : `せかいめぐり ${storyCount()} / ${STORY_TOTAL}話`, tIcon('story'), step === 'story' ? 'next' : '')}
      ${tile('zukan', 'ずかん', `カード ${zukanCount()}しゅるい`)}
      ${tile('trophy', 'トロフィー', `${trophyCount()} / ${TROPHIES.length}`, cup(trophyCount() ? 'G' : 'X'))}
      ${tile('online', 'オンライン', hasServer() ? 'ゴーストと たたかう' : 'れんしゅう')}
      ${first ? '' : tile('tut', 'チュートリアル', 'はじめての 人へ')}
      ${tile('settings', 'せってい', 'みため・おと', tIcon('settings'), 'ghost')}
      ${hasServer() && CONF.admin ? tile('admin', '開発モード（先生）', 'かんり の がめん', tIcon('admin'), 'ghost') : ''}
    </nav>
    <footer class="t-foot">
      ${DEV ? `<p class="fine"><span class="dev-badge">デバッグモード</span>${setsNote() ? ` ${ruby(`パックに 入る 弾（だん）：${setsNote()}`)}` : ''}</p>` : ''}
      ${endlessBest() ? `<p class="fine">むげんの とうの きろく：${endlessBest().floor}階・${endlessBest().score}てん</p>` : ''}
      <p class="fine">しさくばん。てきを タフネスと ちょうど 同じ ダメージで たおすと「ぴったり！」。</p>
    </footer>
  </main>`;
  // ひらいた しらせ（1回だけ）。ひらいた ものが 2つ あれば、まどを 2つ じゅんばんに
  for (const k of unlockNews()) sheet(`<p class="goal">${ruby(NEWS_TEXT[k].text)}</p>`, [{ label: 'やった！', value: 1, kind: 'primary' }], { title: NEWS_TEXT[k].title });
  app().onclick = (e) => {
    // まだ あそべない もの：わけと、つぎに いく ところ
    const lk = e.target.closest('[data-lock]');
    if (lk) {
      const t = LOCK_TEXT[lk.dataset.lock]; if (!t) return;
      const choices = t.go ? [{ label: t.label, value: 'go', kind: 'primary' }, { label: 'とじる', value: 0 }] : [{ label: 'わかった', value: 1, kind: 'primary' }];
      sheet(`<p class="goal">${ruby(t.text)}</p>`, choices, { title: t.title }).then((v) => { if (v === 'go') (t.go === 'tut' ? tutorial() : storyMenu(title)); });
      return;
    }
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
    if (b.dataset.go === 'build') return constructMenu(app, title);
    const diff = app().querySelector('input[name=diff]:checked').value;
    const plane = app().querySelector('input[name=plane]:checked').value;
    const rule = app().querySelector('input[name=rule]:checked')?.value;
    const draft = app().querySelector('input[name=get]:checked')?.value === 'draft';
    // 統率者戦：さいしょに 統率者を えらぶ → しゅぎょう（広告の ように）→ もんしょうを えらぶ → パック
    const begin = async () => {
    const cmd = rule === 'cmd' && plane !== 'strixhaven' ? await pickLegend({ back: 'タイトルへ' }) : null; // ストリクスヘイヴンは 統率者戦 なし（入学式の 2色）
    if (rule === 'cmd' && plane !== 'strixhaven' && !cmd) return title();
    const start = () => {
      if (old && !old.paid) payTower(old, false); // とちゅうで やめた ぼうけん：のぼった 階の パックけん
      // パックの もんしょう：きまぐれな いろは ここで きめる。はじめの 旗は さいしょから もつ
      const pk = activeEffects()?.pack;
      const cols = packColors(withExtra(enabledSets(), pk?.extra));
      const luck = pk?.rand ? cols[Math.floor(Math.random() * cols.length)] : null;
      A = { diff, plane, luck, pool: pk?.banner && plane !== 'strixhaven' ? [pk.banner] : [], deck: null, floors: pickFor(plane), idx: 0, continues: 1, toOpen: 3, opened: 0, exact: 0, cmd, draft };
      save();
      if (plane === 'strixhaven') return enroll().then(packs);
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
function resume() { if (strix() && !A.college) return enroll().then(resume); if (A.recess) return recess(); if (A.toOpen > 0) packs(); else if (!A.deck) deckBuilder(); else tower(); }

// ---- ストリクスヘイヴン：入学式（寮を えらぶ）----
async function enroll() {
  const ks = Object.keys(COLLEGES);
  app().innerHTML = `<main class="tower"><p class="eyebrow">ストリクスヘイヴン</p><h2>${ruby('入学式（にゅうがくしき）')}</h2></main>`; // うしろの 画面
  const v = await sheet(`<p>${ruby('魔法（まほう）学院（がくいん）ストリクスヘイヴンへ ようこそ！ 5つの 寮（りょう）から 1つ えらぼう。デッキは その 寮（りょう）の 2色に なり、パックからも その 2色の カードだけが 出る。')}</p>`,
    ks.map((k) => { const c = COLLEGES[k]; return { label: `<span>${c.cols.split('').map((x) => `<i class="pip m-${x}">${COLOR_NAME[x]}</i>`).join(' ')} ${ruby(c.name)}（${c.subject}）</span>`, value: k, kind: 'primary', note: ruby(`入学いわい：${[].concat(c.gift).map((id) => info(BY_ID[id]).name).join('・')}`) }; }),
    { title: ruby('入学式（にゅうがくしき）'), dismiss: false });
  const c = COLLEGES[v];
  const cap = byDiff(STRIX.life, A.diff) + (activeEffects()?.life || 0);
  Object.assign(A, { college: v, cap, life: cap, grow: {}, report: [] });
  A.pool.push(...[].concat(c.gift));
  save();
  await sheet(`<p>${ruby(`${c.name}に 入学（にゅうがく）した！ 入学いわいに ${[].concat(c.gift).map((id) => info(BY_ID[id]).name).join('と ')}を もらった。`)}</p><p>${ruby(`ライフは ${cap}。かっても まけても、のこった ライフで つぎの 階へ すすむ（${cap}より ふえない）。階と 階の あいだの 休み時間に、保健室（ほけんしつ）・図書室・授業（じゅぎょう）から 1つ えらべるよ。`)}</p>`,
    [{ label: 'パックを あける', value: 1, kind: 'primary' }], { title: ruby(`${c.name}の 寮（りょう）`), dismiss: false });
}

// ---- パック開封（ガチャの 演出は gacha.js） ----
function packs() {
  // ごほうびパック：登った階が 多いほど レア以上が 出やすく、デッキで いちばん使う色が 出やすい
  const cleared = A.idx;
  const favor = cleared > 0 && A.deck ? favorColor(deckStats(A.deck).ds) : null;
  // パックの もんしょう（いまの もの）と、ぼうけんの はじめに きまった きまぐれな いろ
  const pk = activeEffects()?.pack;
  const em = { colors: [...(pk?.colors || []), ...(A.luck ? [A.luck] : [])], unc: pk?.unc || 0, leg: pk?.leg || 0, extra: pk?.extra || [], ident: cmdIdent() };
  const rare = !!A.rarePack; // むげんの とうに さんせんした ごほうびの レアパック
  if (A.draft && !draftCols()) return chooseDraftColors().then(() => packs()); // ドラフト：さいしょに 色を えらぶ
  const only = A.draft || college() ? draftCols() : A.cmd && A.opened === 0 ? cmdIdent() : null; // ドラフトは えらんだ 色だけ。統率者戦の さいしょの パックは 統率者の 色の カードだけ。ストリクスヘイヴンは 寮の 2色だけ
  const sets = college() ? STRIX.sets : withExtra(enabledSets(), pk?.extra); // ストリクスヘイヴン：ファウンデーションズ ＋ 第5弾
  const roll = () => openPack(Math.random, { cleared, favor, sets, em, rare, only });
  if (A.draft) return draftPick(roll);
  const cards = roll();
  const bonus = rare ? `<div class="bonus"><p class="bonus-title">むげんの とう さんせんの レアパック</p>
      <span>レジェンドが 出る かくりつ <b>${Math.round(rareLegendChance() * 100)}%</b><small>（ふつうは ${Math.round(legendChance(0) * 100)}%）</small></span>
      <span>コモンの はんぶんが アンコモンに、アンコモンの はんぶんが レアに かわる</span></div>` : cleared > 0 ? `<div class="bonus"><p class="bonus-title">${A.endless ? A.endless.floor - 1 : cleared}階 クリアの ごほうびパック</p>
      <span>レジェンドが 出る かくりつ <b>${Math.round(legendChance(cleared, em) * 100)}%</b><small>（さいしょは ${Math.round(legendChance(0) * 100)}%）</small></span>
      <span>上の 階ほど、レアや アンコモンに かわりやすい</span>
      ${favor ? `<span><i class="pip m-${favor}">${COLOR_NAME[favor]}</i> の カードが 出やすい（デッキで いちばん 使っている色）</span>` : ''}${emblemPackNote(em)}</div>` : emblemPackNote(em) ? `<div class="bonus"><p class="bonus-title">${em.ident && !em.colors.length && !em.unc && !em.leg && !em.extra.length ? ruby('統率者（とうそつしゃ）の パック') : 'もんしょうの パック'}</p>${emblemPackNote(em)}</div>` : '';
  gacha(app, cards, {
    eyebrow: rare ? 'レアパック' : `パック ${A.opened + 1}${A.idx === 0 ? ' / 3' : ''}`, rare, bonus, owned: new Set(A.pool),
    done: () => {
      A.pool.push(...cards.map((d) => d.id)); A.toOpen--; A.opened++; A.rarePack = 0; save();
      onPack(cards); // トロフィー（めくりおわってから）
      zukanPack(cards);
      return A.toOpen > 0 ? packs() : deckBuilder();
    },
  });
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
    <p class="dr-cols">${ruby(`ドラフトの 色：${colsText(draftCols() || [])}`)}${!A.cmd && !college() && A.idx > 0 && A.pick.n === 0 ? ' <button type="button" class="btn" data-dcol="1">色を かえる</button>' : ''}</p>
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

// ---- デッキ構築 ----
function autoDeck() {
  const b = buildDeck(defs(A.pool), A.cmd ? { pair: cmdIdent() } : college() ? { pair: [...college().cols] } : {});
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
  const deck = ds.map((d) => (d.id === 'YW05' && g ? { ...d, pow: d.pow + g, tou: d.tou + g } : d.id === 'YG05' && g ? { ...d, grow: 1 + g } : d)).map((d) => grown(d, A.grow?.[d.id] || 0)); // ストリクスヘイヴンの 授業
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

// 冒険の デッキ構築。ctx を わたすと ほかの プールでも つかえる（レイドの 統率者デッキ：raid.js、こうちくモード：construct.js）
// ctx = { pool: カードIDの ならび, deck: えらんだ 番号, save(), auto() → 番号, ok(), title, free: 色の きまりを 見ない, colorNote,
//         noCap: キャパシティと 色を 見ない（エターナル）, ident: 統率者の 色（この 色の カードだけ。noCap でも 見る）, stack: 同じ カードを 1まいに まとめて「●●○○」と 見せる,
//         back: { label, go() }：もどる ボタン（入れる・はずすの たびに save() するので ここでは しない）, filterKey：こまかくの せっていを のこす key }
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
  const F = loadFilter(C.filterKey); // こまかく：ならべかえ・しぼりこみ（deckfilter.js）
  // 入れられない わけ。エターナル（noCap）は まい数だけ。統率者（ident）は その 色だけ
  const sizeNo = () => (C.deck.length >= DECK_SIZE ? `デッキは ${DECK_SIZE}まいまで` : '');
  const identNo = (i) => (colorsOf(BY_ID[C.pool[i]]).every((c) => C.ident.includes(c)) ? '' : `統率者（とうそつしゃ）の 色（${C.ident.map((c) => COLOR_NAME[c]).join('・') || 'むしょく'}）の カードだけ`);
  const ruleNo = (i) => (C.ident && identNo(i)) || (C.noCap ? sizeNo() : C.ident ? whyNotPts(C.deck, i, C.pool) : whyNot(C.deck, i, C.pool, C.free));
  const outNo = (i) => (C.noCap || C.ident ? '' : whyNotOut(C.deck, i, C.pool, C.free));
  // 同じ カードの 番号を まとめる（G：id → 番号の ならび）。stack では 見せるのは さいしょの 番号。デッキの カードの −／＋ でも つかう
  const G = new Map();
  C.pool.forEach((id, i) => { if (!G.has(id)) G.set(id, []); G.get(id).push(i); });
  const copies = (i) => G.get(C.pool[i]);
  const nIn = (i) => copies(i).filter((k) => C.deck.includes(k)).length;
  const freeOf = (i) => copies(i).find((k) => !C.deck.includes(k)); // まだ 入れて いない 1まい
  const lastIn = (i) => [...C.deck].reverse().find((k) => C.pool[k] === C.pool[i]);
  // ぜんぶ はずすと 3色の デッキに なれない（旗）
  const outAllNo = (i) => { const d = BY_ID[C.pool[i]]; if (C.noCap || C.ident || !d.banner || C.free) return ''; const rest = deckStats(C.deck.filter((k) => C.pool[k] !== d.id), C.pool); return rest.colors.length > 2 && !rest.banner ? '3色めの カードを さきに はずそう（はたが ないと 2色まで）' : ''; };
  const stackItem = (i) => { const f = freeOf(i), no = f == null ? 'もって いる カードは ぜんぶ 入れた' : ruleNo(f); return { i, d: BY_ID[C.pool[i]], inDeck: nIn(i) > 0, no, more: !no }; };
  const shownIdx = () => applyFilter(F, C.stack ? [...G.values()].map((l) => stackItem(l[0])) : C.pool.map((id, i) => { const inDeck = C.deck.includes(i); return { i, d: BY_ID[id], inDeck, no: !inDeck && ruleNo(i) }; }));
  const total = () => (C.stack ? G.size : C.pool.length);
  const unit = C.stack ? 'しゅるい' : 'まい';
  const poolHtml = (list) => (list.length ? list.map((i) => {
    if (C.stack) {
      const k = nIn(i), it = stackItem(i);
      return `<button type="button" class="pool-item ${k ? 'in' : ''} ${!k && it.no ? 'no' : ''}" data-i="${i}">${cardFace(it.d)}<span class="pts">${ptsOf(it.d)}点</span><span class="cnt" aria-label="デッキに ${k}まい（つかえる ${copies(i).length}まい）">${'●'.repeat(k)}${'○'.repeat(copies(i).length - k)}</span></button>`;
    }
    const inDeck = C.deck.includes(i);
    const no = !inDeck && ruleNo(i);
    return `<button type="button" class="pool-item ${inDeck ? 'in' : ''} ${no ? 'no' : ''}" data-i="${i}">${cardFace(BY_ID[C.pool[i]])}<span class="pts">${ptsOf(BY_ID[C.pool[i]])}点</span></button>`;
  }).join('') : '<p class="pool-empty">あてはまる カードが ない。しぼりこみを へらそう。</p>');
  let mode = (() => { try { return localStorage.getItem(TAP_MODE) === 'quick' ? 'quick' : 'detail'; } catch { return 'detail'; } })();
  // デッキの カード（view = 'deck'）：同じ カードを 1行に まとめて マナコストの じゅん。−／＋で 1まいずつ、なまえで せつめい
  let view = 'pool';
  const addOf = (id) => { const f = G.get(id).find((k) => !C.deck.includes(k)); return { f, no: f == null ? 'もって いる カードは ぜんぶ 入れた' : ruleNo(f) }; };
  const deckHtml = (st) => {
    if (!st.count) return '<p class="pool-empty">まだ デッキに カードが ない。「カード」の タブから 入れよう。</p>';
    const byId = new Map(); for (const k of C.deck) byId.set(C.pool[k], [...(byId.get(C.pool[k]) || []), k]);
    const rows = [...byId.entries()].sort(([a], [b]) => (BY_ID[a].cost ?? 0) - (BY_ID[b].cost ?? 0) || byColorCost(BY_ID[a], BY_ID[b])).map(([id, ks]) => {
      const d = BY_ID[id], add = addOf(id);
      return `<li class="dl-row"><button type="button" class="dl-name" data-dd="${ks[0]}"><span class="dl-cost">${d.cost ?? 0}</span><span class="zk-dots">${colorsOf(d).map((c) => `<i class="m-${c}"></i>`).join('')}</span><b>${ruby(info(d).name)}</b><small>${ptsOf(d)}点</small></button>
        <span class="dl-n">×${ks.length}</span><button type="button" class="dl-btn" data-dminus="${esc(id)}" aria-label="1まい はずす">−</button><button type="button" class="dl-btn" data-dplus="${esc(id)}" ${add.no ? 'disabled' : ''} aria-label="1まい 入れる">＋</button></li>`;
    }).join('');
    // マナコストごとの まい数（0〜6+）と クリーチャーの まい数
    const curve = Array(7).fill(0); for (const d of st.ds) curve[Math.min(6, d.cost ?? 0)]++;
    const top = Math.max(1, ...curve), cr = st.ds.filter((d) => (d.types || []).includes('creature')).length;
    return `<section class="dlist">
      <p class="dl-sum">クリーチャー ${cr}まい・ほか ${st.count - cr}まい・きほんカード ${DECK_SIZE - st.count}まい</p>
      <div class="dl-curve" aria-label="マナコストごとの まい数">${curve.map((v, c) => `<span><b>${v || ''}</b><i style="--h:${v / top}"></i><small>${c === 6 ? '6+' : c}</small></span>`).join('')}</div>
      <ul class="dl-rows">${rows}</ul>
    </section>`;
  };
  const draw = () => {
    const st = deckStats(C.deck, C.pool);
    const left = CAPACITY - st.points;
    const list = shownIdx();
    app().innerHTML = `<main class="builder ${F.open && view === 'pool' ? 'has-filter' : ''}">
      <header class="b-head">
        <h2>${ruby(C.title)}</h2>
        <div class="meters">
          ${C.noCap ? `<div class="meter"><span>てんすう</span><b>${st.points}<small>点</small></b><em>せいげん なし</em></div>` : `<div class="meter"><span>キャパシティ</span><b>${st.points}<small>/${CAPACITY}点</small></b><i style="--v:${st.points / CAPACITY}"></i><em>のこり ${left}点</em></div>`}
          <div class="meter"><span>カード</span><b>${st.count}<small>まい</small></b><i style="--v:${st.count / DECK_SIZE}"></i><em>きほんカード ${DECK_SIZE - st.count}まい</em></div>
          <div class="meter"><span>${C.colorNote ? ruby(C.colorNote) : C.noCap ? '色（なんしょくでも）' : C.free ? '色' : st.banner ? '色（はたで 3色まで）' : '色（2色まで）'}</span><b class="cols">${st.colors.map((c) => `<i class="pip m-${c}">${COLOR_NAME[c]}</i>`).join('') || '−'}</b></div>
        </div>
        ${C.cmd ? `<div class="b-cmd"><span>${ruby(C.cmd.label)}</span><button type="button" class="btn" data-a="cmd">かえる</button></div>` : ''}
        <div class="tapmode" role="group" aria-label="カードを タップしたとき">
          <span>タップで</span>
          <button type="button" data-mode="detail" aria-pressed="${mode === 'detail'}">せつめいを 見る</button>
          <button type="button" data-mode="quick" aria-pressed="${mode === 'quick'}">すぐ 入れる・はずす</button>
          <button type="button" class="fine" data-fine="1" aria-pressed="${F.open}" aria-expanded="${F.open}">こまかく${filterCount(F) ? `<b>${filterCount(F)}</b>` : ''}</button>
        </div>
        <div class="b-view" role="tablist"><button type="button" role="tab" data-view="pool" aria-selected="${view === 'pool'}">カードを えらぶ</button><button type="button" role="tab" data-view="deck" aria-selected="${view === 'deck'}">デッキ ${st.count}まい</button></div>
        <p class="hint">${mode === 'quick' ? (C.stack ? 'タップで 1まいずつ 入れる。ぜんぶ 入れた カードは タップで ぜんぶ はずす。長おしで せつめい。' : 'タップで 入れる ⇔ はずす。長おしで せつめい。') : 'タップで せつめい → 入れる・はずす。'}${C.stack ? '同じ カードは 4まいまで。' : ''}${C.noCap ? '' : '点数は コモン1・アンコモン2・レア3・レジェンド4。'}</p>
      </header>
      ${view === 'deck' ? deckHtml(st) : `${filterPanel(F, C.pool.map((id) => BY_ID[id]), list.length, total(), unit)}
      <div class="pool ${mode}">${poolHtml(list)}</div>`}
      <footer class="actions">${C.back ? `<button type="button" class="btn" data-a="back">${esc(C.back.label)}</button>` : ''}<button type="button" class="btn" data-a="auto">おまかせ</button><button type="button" class="btn" data-a="clear">ぜんぶ はずす</button><button type="button" class="btn primary" data-a="ok">けってい</button></footer>
    </main>`;
  };
  draw();
  window.scrollTo?.(0, 0); // まえの 画面の スクロールの まま ひらかない（上の メーターと タブの 下に かくれる）
  const showDetail = async (i) => {
    if (C.stack) {
      const f = freeOf(i), last = lastIn(i), no = f == null ? 'もって いる カードは ぜんぶ 入れた' : ruleNo(f);
      const v = await sheet(`${detail(BY_ID[C.pool[i]])}<p class="zk-note">デッキに ${nIn(i)}まい（つかえる カード ${copies(i).length}まい）</p>`, [
        { label: '1まい 入れる', value: 'in', kind: 'primary', disabled: !!no, note: no || '' },
        ...(last != null ? [{ label: '1まい はずす', value: 'out', disabled: !!outNo(last), note: outNo(last) }] : []),
        { label: 'とじる', value: null },
      ]);
      if (v === 'in') C.deck.push(f);
      if (v === 'out') C.deck = C.deck.filter((k) => k !== last);
      C.save(); return draw();
    }
    const inDeck = C.deck.includes(i);
    const no = !inDeck && ruleNo(i);
    const v = await sheet(detail(BY_ID[C.pool[i]]), [
      inDeck ? { label: 'デッキから はずす', value: 'out', kind: 'primary', disabled: !!outNo(i), note: outNo(i) } : { label: 'デッキに 入れる', value: 'in', kind: 'primary', disabled: !!no, note: no || '' },
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
    const el = mode === 'quick' && e.target.closest('.pool-item[data-i]'); // 統率者を えらぶ 画面（.pool-item[data-lid]）に うつっても はたらかない
    if (!el || e.target.closest('[data-term]')) return;
    press = setTimeout(() => { pressed = true; showDetail(+el.dataset.i); }, 450);
  };
  app().onpointerup = app().onpointercancel = () => clearTimeout(press);
  // なまえ・テキストで さがす：入力ちゅうは カードの ならびだけ かきかえる（入力欄が きえない ように）
  app().oninput = (e) => {
    if (!onFilterInput(F, e.target) || !app().querySelector('.pool')) return;
    const list = shownIdx();
    app().querySelector('.pool').innerHTML = poolHtml(list);
    const sum = app().querySelector('.fsum span'); if (sum) sum.textContent = `${list.length} / ${total()}${unit} を 見せて いる`;
  };
  app().onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.fine) { F.open = !F.open; saveFilter(F); view = 'pool'; return draw(); }
    if (onFilterClick(F, b)) return draw();
    if (b.dataset.view) { view = b.dataset.view; draw(); return window.scrollTo?.(0, 0); }
    // デッキの カード：なまえで せつめい、−／＋で 1まいずつ
    if (b.dataset.dd != null) return showDetail(+b.dataset.dd);
    if (b.dataset.dminus) {
      const last = [...C.deck].reverse().find((k) => C.pool[k] === b.dataset.dminus);
      const no = outNo(last); if (no) { toast(`はずせない：${no}`); return; }
      C.deck = C.deck.filter((k) => k !== last); sfx.tap(); C.save(); return draw();
    }
    if (b.dataset.dplus) {
      const { f, no } = addOf(b.dataset.dplus); if (no) { toast(`入れられない：${no}`); return; }
      C.deck.push(f); sfx.tap(); C.save(); return draw();
    }
    if (b.dataset.mode) { mode = b.dataset.mode; try { localStorage.setItem(TAP_MODE, mode); } catch { /* 保存できなくても 切りかえられる */ } return draw(); }
    if (b.dataset.a === 'cmd') return C.cmd.change();
    if (b.dataset.a === 'back') return C.back.go();
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
    if (C.stack) {
      // 1まいずつ 入れる。ぜんぶ 入れた カードは ぜんぶ はずす
      const f = freeOf(i), id = C.pool[i];
      if (f == null) {
        const no = outAllNo(i); if (no) { toast(`はずせない：${no}`); return; }
        C.deck = C.deck.filter((k) => C.pool[k] !== id);
      } else {
        const no = ruleNo(f);
        if (no) { toast(`入れられない：${no}${nIn(i) ? '（長おしで はずせる）' : ''}`); b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny'); return; }
        C.deck.push(f);
      }
      sfx.tap(); C.save(); return draw();
    }
    if (C.deck.includes(i)) {
      const no = outNo(i);
      if (no) { toast(`はずせない：${no}`); return; }
      C.deck = C.deck.filter((k) => k !== i);
    } else {
      const no = ruleNo(i);
      if (no) { toast(`入れられない：${no}`); b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny'); return; }
      C.deck.push(i);
    }
    sfx.tap(); C.save(); draw();
  };
}

// ---- 塔 ----
const TOWER_TITLE = { theros: 'テーロスの とう', ravnica: 'ラヴニカの とう', strixhaven: 'ストリクスヘイヴンの とう（魔法（まほう）学院（がくいん））' };
const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const reportStars = () => (A.report || []).reduce((t, x) => t + x.stars, 0);
// 授業で そだった カード（塔の 画面）
const grownLine = () => { const g = Object.entries(A.grow || {}).filter(([, n]) => n > 0); return g.length ? `<p class="deckline">${ruby(`そだった カード：${g.map(([id, n]) => `${info(BY_ID[id]).name} ${growText(BY_ID[id])}${n > 1 ? ` ×${n}` : ''}`).join('、')}`)}</p>` : ''; };
// 通知表（ストリクスヘイヴンの おわり）：教科ごとの ★と ごうけい
function reportCard() {
  const total = reportStars(), max = A.floors.length * 3;
  return `<section class="report"><h3>${ruby('通知表（つうちひょう）')}</h3>
    <ul class="zk-list">${A.floors.map((f, i) => `<li class="${A.report?.[i] ? 'got' : ''}"><b>${SUBJECT_OF[f]}<small>${ruby(FLOOR_NAMES[f].replace(/（.*）$/, '').replace(/^そつぎょう しけん：/, ''))}</small></b><em class="stars">${A.report?.[i] ? starText(A.report[i].stars) : 'まだ'}</em></li>`).join('')}</ul>
    <p class="report-total">★ <b>${total}</b> / ${max}　${gradeOf(total)}</p>
    <p class="fine">★：かった（コンティニュー なし）・ぴったりで たおした・へった ライフが 4 いか</p></section>`;
}
// ---- ストリクスヘイヴン：休み時間（保健室・図書室・授業から 1つ）----
const canGrow = (d, n) => (d.types.includes('creature') ? typeof d.pow === 'number' : grown(d, n + 1).cost < grown(d, n).cost);
function growNote(d) {
  const n = A.grow?.[d.id] || 0, a = grown(d, n), b = grown(d, n + 1);
  return d.types.includes('creature') ? `${a.pow}/${a.tou} → ${b.pow}/${b.tou}` : `コスト ${a.cost} → ${b.cost}`;
}
async function recess() {
  tower(); // うしろに 塔の 画面
  const heal = byDiff(STRIX.heal, A.diff), full = A.life >= A.cap;
  const v = await sheet(`<p>${ruby(`休み時間（やすみじかん）。つぎは ${floorLabel(A.idx)}。1つ えらぼう。`)}</p><p class="em-line">ライフ ${A.life} / ${A.cap}</p>`, [
    { label: `<span>${ruby('保健室（ほけんしつ）で やすむ')}</span>`, value: 'heal', kind: 'primary', disabled: full, note: full ? 'ライフは もう いっぱい' : `ライフ ${A.life} ＋ ${heal} ＝ ${A.life + heal}${A.life + heal > A.cap ? `（${A.cap}まで）` : ''}` },
    { label: '<span>図書室で パックを あける</span>', value: 'pack', kind: 'primary', note: ruby(`${college().name}の 2色の カード`) },
    { label: `<span>${ruby('授業（じゅぎょう）を うける')}</span>`, value: 'grow', kind: 'primary', note: 'デッキの カード 1しゅるいが ずっと つよく なる' },
  ], { title: ruby('休み時間（やすみじかん）'), dismiss: false });
  if (v === 'grow') {
    const list = [...new Set((A.deck ? deckStats(A.deck).ds : defs(A.pool)).map((d) => d.id))].map((id) => BY_ID[id]).filter((d) => canGrow(d, A.grow?.[d.id] || 0)).sort(byColorCost);
    const pick = await pickMany(ruby('授業（じゅぎょう）：つよく する カードを 1しゅるい えらぶ'), list.map((d) => ({ label: `${ruby(info(d).name)}<small>${growNote(d)}</small>`, value: d.id })),
      { min: 1, max: 1, note: 'クリーチャーは ＋1/＋1、ほかは コスト −1。ぼうけんの あいだ ずっと' });
    if (!pick?.length) return recess();
    A.grow = { ...(A.grow || {}), [pick[0]]: (A.grow?.[pick[0]] || 0) + 1 };
    toast(ruby(`${info(BY_ID[pick[0]]).name}が つよく なった！`));
  }
  if (v === 'heal') { A.life = Math.min(A.cap, A.life + heal); toast(`ライフが ${A.life}に なった`); }
  A.recess = false;
  if (v === 'pack') { A.toOpen = 1; save(); return packs(); }
  save();
  return tower();
}

function tower() {
  if (A.endless) return endlessTower();
  const st = deckStats(A.deck);
  const done = (i) => (strix() && A.report?.[i] ? `クリア ${starText(A.report[i].stars)}` : 'クリア');
  app().innerHTML = `<main class="tower">
    <p class="eyebrow">${DIFFS.find(([k]) => k === A.diff)[1]}　コンティニュー のこり ${A.continues}回</p>
    <h2>${ruby(TOWER_TITLE[A.plane || 'theros'])}</h2>
    <ol class="floors">${A.floors.map((f, i) => `<li class="${i < A.idx ? 'done' : i === A.idx ? 'now' : ''}"><span>${ruby(floorLabel(i))}</span><em>${i < A.idx ? done(i) : i === A.idx ? 'いま ここ' : ''}</em></li>`).reverse().join('')}</ol>
    ${strix() ? `<p class="deckline">${ruby(`${college().name}の 寮（りょう）`)}　ライフ <b>${A.life}</b> / ${A.cap}</p>${grownLine()}` : ''}
    ${A.cmd ? `<p class="deckline">${ruby(`統率者（とうそつしゃ）：${info(cmdDef()).name}`)}（${cmdColorText(cmdDef()) || 'むしょく'}）</p>` : ''}
    <p class="deckline">デッキ：${st.colors.map((c) => COLOR_NAME[c]).join('・') || 'むしょく'}　${st.points}点　カード${st.count}まい＋きほん${DECK_SIZE - st.count}まい</p>
    ${emblemLine() ? `<p class="em-line">もんしょう：${esc(emblemLine())}</p>` : ''}
    <div class="row-btns"><button type="button" class="btn" data-a="deck">デッキを なおす</button><button type="button" class="btn primary" data-a="go">${ruby(floorLabel(A.idx))}へ</button></div>
    <button type="button" class="btn ghost" data-a="quit">タイトルへ（つづきは のこる）</button>
  </main>`;
  app().onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'deck') deckBuilder();
    if (a === 'quit') title();
    if (a === 'go') fight();
  };
}

export const CMD_BUFF_FROM = 2; // 0 から かぞえる：2 ＝ 3階（こうちくモードの れんしゅうも 同じ）
function fight() {
  const f = A.floors[A.idx], start = A.life;
  startBattle({
    deck: finalDeck(), floorId: f, diff: A.diff, floorName: floorLabel(A.idx), emblem: activeEffects(), emblemNote: emblemLine(), cmd: cmdDef(),
    life: strix() ? A.life : null, // ストリクスヘイヴン：ライフを ひきつぐ
    // 統率者モード：3階から 上は てきの クリーチャーが ＋1/＋1（統率者が いると つよすぎた。docs/REQUIREMENTS.md 8.5）
    buff: A.cmd && A.idx >= CMD_BUFF_FROM ? 1 : 0,
    extraNote: strix() ? `ライフ ${A.life} から はじまる。のこった ライフで つぎの 階へ すすむ。` : A.cmd && A.idx >= CMD_BUFF_FROM ? '統率者（とうそつしゃ）が いるので、てきも 本気（ほんき）！ てきの クリーチャーは ＋1/＋1' : '',
    quit: { label: 'タイトルへ もどる', note: 'ぼうけんの つづきは のこる。この 階は「つづきから」で はじめから やりなおしに なるよ。', go: title },
    onEnd: async (r) => {
      A.exact = (A.exact || 0) + r.exact;
      onBattle(r, { advExact: A.exact, floorIdx: A.idx, points: deckStats(A.deck).points });
      zukanBattle(r);
      if (r.win) {
        if (strix()) {
          A.report = [...(A.report || []), { f, stars: starsOf({ win: true, continued: A.contAt === A.idx, exact: r.exact, lost: start - r.life }) }];
          A.life = Math.min(A.cap, Math.max(1, r.life));
        }
        A.idx++;
        if (A.idx >= A.floors.length) { if (!strix()) return askEndless(); A.over = 'clear'; save(); return ending(true); } // ストリクスヘイヴンは 通知表で おわり
        if (strix()) { A.recess = true; save(); return recess(); }
        A.toOpen = 1; save();
        await sheet('<p>パックを 1つ あけて、デッキを くみなおせる。</p>', [{ label: 'パックを あける', value: 1, kind: 'primary' }], { title: 'ごほうび', dismiss: false });
        return packs();
      }
      if (A.continues > 0) {
        const v = await sheet(`<p>コンティニューすると、${ruby(floorLabel(A.idx))}の はじめから やりなおせる（${strix() ? `ライフは ${Math.min(A.cap, STRIX.cont)}` : 'ライフは はじめの 数に もどる'}）。デッキを なおしてから いどんでも いい。</p>${emblemHint()}`,
          [{ label: 'コンティニュー（のこり1回）', value: 'c', kind: 'primary' }, { label: 'あきらめる', value: 'x' }], { title: 'まけてしまった', dismiss: false });
        if (v === 'c') { A.continues--; if (strix()) { A.life = Math.min(A.cap, STRIX.cont); A.contAt = A.idx; } save(); return tower(); }
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
  const reached = win ? A.floors.length : A.idx + 1, pair = pairOf();
  if (win && A.deck) onClear({ diff: A.diff, continued: A.continues < 1, pair });
  zukanRun({ diff: A.diff, plane: A.plane || 'theros', reached, exact: A.exact || 0, pair, win, stars: strix() ? reportStars() : null });
  A.recorded = true;
}
// こうちくモードの パックけん（docs/CONSTRUCTED.md）：クリアした 階 1つに 1まい、むげんの とうは 5階ごとに 1まい。とうの おわりに まとめて
// quiet：おわりの 画面に 書く ときは おしらせを 出さない
function payTower(a = A, quiet = true) {
  if (!a || a.paid) return 0;
  a.paid = true;
  return addTickets(Math.min(a.idx || 0, a.floors?.length || 5) + (a.endless ? Math.floor((a.endless.floor - ENDLESS.start) / ENDLESS_PER) : 0), 'とう', quiet);
}
const ticketLine = (n) => (n ? `<p class="what tk-get"><b>パックけん ＋${n}まい</b><span>タイトルの「こうちく」の ショップで パックと ひきかえられる</span></p>` : '');
function ending(win) {
  const reached = win ? A.floors.length : A.idx + 1;
  if (!A.recorded) recordRun(win);
  const got = payTower();
  const mat = win && awardMat(TOWER_MAT[A.plane || 'theros']) ? TOWER_MAT[A.plane || 'theros'] : null; // 塔を のぼりきった：プレイマット
  // デッキを ゴーストに して あずける（オンライン バトルで ほかの 人と たたかえる）
  if (A.deck) saveGhost(finalDeck(), win ? 6 : Math.min(5, reached));
  app().innerHTML = `<main class="ending ${win ? 'win' : 'lose'}">
    <p class="eyebrow">${win ? 'とうを のぼりきった' : `${reached}階で ちからつきた`}</p>
    <h2>${win ? (strix() ? 'そつぎょう おめでとう！' : A.plane === 'ravnica' ? 'ジェイスに みとめられた！' : 'エレボスを たおした！') : 'ぼうけん おわり'}</h2>
    ${strix() ? reportCard() : ''}
    <dl class="stats">
      <div><dt>とどいた 階</dt><dd>${reached}<small>/${A.floors.length}</small></dd></div>
      <div><dt>ぴったり</dt><dd>${A.exact || 0}<small>回</small></dd></div>
      <div><dt>あけた パック</dt><dd>${A.opened}</dd></div>
      <div><dt>トロフィー</dt><dd>${trophyCount()}<small>/${TROPHIES.length}</small></dd></div>
    </dl>
    ${mat ? `<p class="what mat-get"><span class="mat-sw" data-m="${mat}"></span><span>${ruby(`プレイマット「${matName(mat)}」を 手に 入れた！（せっていで かえられる）`)}</span></p>` : ''}
    ${ticketLine(got)}
    <p class="fine">この デッキは「ゴースト」に なった。タイトルの「オンライン バトル」で つかえるよ。</p>
    ${adsOn() ? `<p class="say"><b>${strix() ? 'ストリクスヘイヴンの 先生たち' : A.plane === 'ravnica' ? 'ジェイス' : 'テーロスの 神々'}</b><span>${strix() ? 'もっと まなびたいかな？' : A.plane === 'ravnica' ? 'もっと つよく なりたいかい？' : 'もっと つよく なりたいか？'}</span></p>
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
const pickPlane = () => pickFor(A.plane);
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
  const got = payTower();
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
    ${ticketLine(got)}
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
  app().innerHTML = `<main class="title">${loading()}</main>`;
  loadConf().then(() => { applyConf(); applyRaid(); title(); });
} else title();
