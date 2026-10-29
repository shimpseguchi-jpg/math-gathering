// あそべる ものが ひらく じゅんばん（2026-10-29。REQUIREMENTS 8.7）
//   はじめての 人：チュートリアル → ストーリー 1章「はじめの いっぽ」→ テーロスの とう（かんたん・ふつう）
//   テーロスを「ふつう」で のぼりきる → 「むずかしい」と ラヴニカ → ラヴニカを「ふつう」で のぼりきる → ストリクスヘイヴン（第5弾が 出て いる とき）
// まえから あそんで いる 人（ぼうけんの きろくが ある）は、とうは さいしょから あそべる
// デバッグモードの せってい「ぜんぶ あそべる」で ぜんぶ ひらく（先生の たしかめ用・e2e）
import { TUTORIAL_DONE } from './tutorial.js';
import { storyDone, CHAPTERS } from './story.js';
import { clearedCount, adventuresCount } from './zukan.js';
import { unlockAll, enabledSets } from './settings.js';

const tutDone = () => { try { return !!localStorage.getItem(TUTORIAL_DONE); } catch { return true; } };
const chapter1Done = () => { const S = storyDone(); return CHAPTERS[0].eps.every((e) => S.done[e.id]); };
const normalCleared = () => clearedCount('theros', 'normal') > 0;

export const GATES = {
  adventure: () => unlockAll() || adventuresCount() > 0 || (tutDone() && chapter1Done()),
  hard: () => unlockAll() || normalCleared(),
  ravnica: () => unlockAll() || normalCleared(),
  // ストリクスヘイヴン：第5弾と いっしょに ひらく（第5弾が パックに 入る とき）＋ ラヴニカを「ふつう」で のぼりきる（2026-10-29。docs/STRIXHAVEN.md）
  strixhaven: () => enabledSets().includes(5) && (unlockAll() || clearedCount('ravnica', 'normal') > 0),
};
export const diffOpen = (d) => (d === 'hard' ? GATES.hard() : GATES.adventure());
export const planeOpen = (p) => (GATES[p] ? GATES[p]() : true);
// とうが まだ なら、つぎに いく ところ：'tutorial' か 'story'
export const nextStep = () => (GATES.adventure() ? null : !tutDone() ? 'tutorial' : 'story');

// まだ あそべない わけ（フレーバー）と、つぎに いく ところ
export const LOCK_TEXT = {
  tutorial: { title: 'とうの 門（もん）は まだ とじて いる', text: 'テーロスの とうは、カードを つかいこなす ものだけが のぼれる。まずは メレティスの くんれんじょうで、テフェリーと いっしょに きほんを おぼえよう。', go: 'tut', label: 'チュートリアルへ' },
  story: { title: 'テフェリーが まって いる', text: 'くんれんは おわった。でも とうに のぼる まえに、せかいめぐりの 1章「はじめの いっぽ」を おわらせよう。テフェリーが、テーロスの 神々（かみがみ）の ことを 教（おし）えて くれる。', go: 'story', label: 'ストーリーへ' },
  hard: { title: '「むずかしい」は まだ', text: 'エレボスは まだ 本気（ほんき）を 出して いない。テーロスの とうを「ふつう」で のぼりきった とき、ほんとうの たたかいが はじまる。' },
  ravnica: { title: 'ラヴニカへの 門（もん）', text: '10の ギルドが ひしめく 大きな まち、ラヴニカ。ギルドパクトの ジェイスは、テーロスの とうを「ふつう」で のぼりきった ものだけを まねく。――まずは テーロスの 神々（かみがみ）に いどもう。' },
  strixhaven: { title: 'ストリクスヘイヴンへの 門（もん）', text: '魔法（まほう）学院（がくいん）ストリクスヘイヴンは、第5弾（だん）「大きな 数の 塔（とう）」と いっしょに ひらく。ラヴニカの とうを「ふつう」で のぼりきると、入学（にゅうがく）の てがみが とどくよ。' },
};
// ひらいた ときの しらせ
export const NEWS_TEXT = {
  adventure: { title: 'とうの 門（もん）が ひらいた！', text: 'テフェリー「よく やった。テーロスの とうが きみを まって いる。まずは「かんたん」で てっぺんを めざそう」' },
  hard: { title: '「むずかしい」が ひらいた！', text: 'エレボスが 目を さました。本気（ほんき）の 神々（かみがみ）に いどめ。' },
  ravnica: { title: 'ラヴニカへの 門（もん）が ひらいた！', text: 'ジェイス「ギルドパクトの 名に おいて、きみを ラヴニカに まねこう。10の ギルドが きみを まって いる」' },
  strixhaven: { title: 'ストリクスヘイヴンへの 門（もん）が ひらいた！', text: '魔法（まほう）学院（がくいん）ストリクスヘイヴンから 入学（にゅうがく）の てがみが とどいた。5つの 寮（りょう）から 1つ えらんで、6階の 卒業（そつぎょう）試験（しけん）を めざそう。' },
};

// あたらしく ひらいた ものを かえす（1回だけ）。はじめて 見る ときは、いま ひらいて いる ものを おぼえるだけ（まえから あそんで いる 人に まとめて 出さない）
const SEEN = 'mtg-unlock-seen';
export function unlockNews() {
  if (unlockAll()) return [];
  const open = Object.keys(GATES).filter((k) => GATES[k]());
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(SEEN) || 'null'); } catch { /* なし */ }
  const news = Array.isArray(seen) ? open.filter((k) => !seen.includes(k)) : [];
  if (!Array.isArray(seen) || news.length) { try { localStorage.setItem(SEEN, JSON.stringify(open)); } catch { /* この あいだだけ */ } }
  return news;
}
