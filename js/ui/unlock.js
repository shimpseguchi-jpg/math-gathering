// あそべる ものが ひらく じゅんばん（2026-10-29。REQUIREMENTS 8.7）
//   はじめての 人：チュートリアル → ストーリー 1章「はじめの いっぽ」→ みならいの しけん（課題 3つで マスマティックスウォーカーの 証。2026-10-30）
//   → テーロスの とう（かんたん・ふつう）
//   テーロスを「ふつう」で のぼりきる → 「むずかしい」と ラヴニカ → ラヴニカを「ふつう」（か「むずかしい」）で のぼりきる → ストリクスヘイヴン
//   テーロスと ラヴニカを どちらも「むずかしい」で のぼりきる → 統率者ルール（ぼうけんの ルール・こうちくの デッキ・オンラインの れんしゅう。2026-11-04）
// まだ ひらいて いない ものは 出さない（2026-11-04。ユーザーが きめた）。ひらいた ときは「あたらしく 〇〇が かいほう された！」
// まえから あそんで いる 人（ぼうけんの きろくが ある）は、とうは さいしょから あそべる
// デバッグモードの せってい「ぜんぶ あそべる」で ぜんぶ ひらく（先生の たしかめ用・e2e）
import { TUTORIAL_DONE } from './tutorial.js';
import { storyDone, CHAPTERS } from './story.js';
import { clearedCount, adventuresCount } from './zukan.js';
import { unlockAll } from './settings.js';
import { kihonBadge } from './kihon.js';
import { KIHON_NAME } from '../data/kihon.js';
import { sheet, ruby } from './view.js';
import { sfx } from './sfx.js';

const tutDone = () => { try { return !!localStorage.getItem(TUTORIAL_DONE); } catch { return true; } };
const chapter1Done = () => { const S = storyDone(); return CHAPTERS[0].eps.every((e) => S.done[e.id]); };
const normalCleared = () => clearedCount('theros', 'normal') > 0;

export const GATES = {
  kihon: () => unlockAll() || adventuresCount() > 0 || (tutDone() && chapter1Done()),
  adventure: () => unlockAll() || adventuresCount() > 0 || kihonBadge(),
  hard: () => unlockAll() || normalCleared(),
  ravnica: () => unlockAll() || normalCleared(),
  // ストリクスヘイヴン：ラヴニカを「ふつう」（か「むずかしい」）で のぼりきると ひらく（2026-11-02。docs/STRIXHAVEN.md）
  // まえは 第5弾が パックに 入る ことも 条件だった。塔の パックは いつも ファウンデーションズ ＋ 第5弾（STRIX.sets）なので、はずした
  strixhaven: () => unlockAll() || clearedCount('ravnica', 'normal') + clearedCount('ravnica', 'hard') > 0,
  // 統率者ルール（2026-11-04）：テーロスと ラヴニカの「むずかしい」を どちらも のぼりきると ひらく
  cmd: () => unlockAll() || (clearedCount('theros', 'hard') > 0 && clearedCount('ravnica', 'hard') > 0),
};
export const diffOpen = (d) => (d === 'hard' ? GATES.hard() : GATES.adventure());
export const planeOpen = (p) => (GATES[p] ? GATES[p]() : true);
export const cmdOpen = () => GATES.cmd();
// とうが まだ なら、つぎに いく ところ：'tutorial'・'story'・'kihon'
export const nextStep = () => (GATES.adventure() ? null : !tutDone() ? 'tutorial' : !GATES.kihon() ? 'story' : 'kihon');

// ひらいた ときの しらせ：name は「あたらしく 〇〇が かいほう された！」の 〇〇、text は その あとの ことば
export const NEWS_TEXT = {
  kihon: { name: KIHON_NAME, text: `テフェリー「1章 クリア、おめでとう。つぎは ${KIHON_NAME}で じぶんの デッキを くもう。課題（かだい）を 3つ クリアすると、マスマティックスウォーカーの 証（あかし）を わたそう」` },
  adventure: { name: 'テーロスの とう', text: 'マスマティックスウォーカーの 証（あかし）を もつ きみの まえに、せかいが ひらけた。テーロスの とう・こうちく・もんしょう・ずかん・トロフィー・オンラインで あそべるよ。もんしょうは しゅぎょうで もらえる 力（ちから）。とうで かてなく なったら ためして みよう。テフェリー「まずは「かんたん」で テーロスの とうの てっぺんを めざそう」' },
  hard: { name: '「むずかしい」', text: 'エレボスが 目を さました。本気（ほんき）の 神々（かみがみ）に いどめ。' },
  ravnica: { name: 'ラヴニカの とう', text: 'ジェイス「ギルドパクトの 名に おいて、きみを ラヴニカに まねこう。10の ギルドが きみを まって いる」' },
  strixhaven: { name: 'ストリクスヘイヴンの とう', text: '魔法（まほう）学院（がくいん）ストリクスヘイヴンから 入学（にゅうがく）の てがみが とどいた。5つの 寮（りょう）から 1つ えらんで、6階の 卒業（そつぎょう）試験（しけん）を めざそう。' },
  cmd: { name: '統率者（とうそつしゃ）ルール', text: 'テーロスと ラヴニカの「むずかしい」を のぼりきった きみは、伝説（でんせつ）の クリーチャーを 統率者（とうそつしゃ）に して たたかえる。ぼうけんの「ルール」・こうちくの デッキ・オンラインの れんしゅうで あそべるよ。' },
};
export const newsTitle = (k) => `あたらしく${NEWS_TEXT[k].name.startsWith('「') ? '' : ' '}${NEWS_TEXT[k].name}が かいほう された！`; // 「 の まえは あけない
// しらせの まど：光の わと ひらいた かぎが ぽんと 出て、きらきら（css の .unlock）・おと
const OPEN_KEY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.7-1.5"/></svg>';
export const unlockSheet = (k) => sheet(`<div class="un-mark" aria-hidden="true">${'<i></i>'.repeat(6)}${OPEN_KEY}</div><p class="goal">${ruby(NEWS_TEXT[k].text)}</p>`,
  [{ label: 'やった！', value: 1, kind: 'primary' }], { title: ruby(newsTitle(k)), cls: 'unlock', onOpen: sfx.unlock });

// あたらしく ひらいた ものを かえす（1回だけ）。はじめて 見る ときは、いま ひらいて いる ものを おぼえるだけ（まえから あそんで いる 人に まとめて 出さない）
const SEEN = 'mtg-unlock-seen';
export function unlockNews() {
  if (unlockAll()) return [];
  const open = Object.keys(GATES).filter((k) => GATES[k]());
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(SEEN) || 'null'); } catch { /* なし */ }
  // みならいの しけん（あとから 足した）：もう とうに のぼれる 子には 出さない
  const news = Array.isArray(seen) ? open.filter((k) => !seen.includes(k) && !(k === 'kihon' && seen.includes('adventure'))) : [];
  if (!Array.isArray(seen) || news.length) { try { localStorage.setItem(SEEN, JSON.stringify(open)); } catch { /* この あいだだけ */ } }
  return news;
}
