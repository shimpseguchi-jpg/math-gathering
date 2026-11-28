// 合体版「Mathematics of the Gathering〜さんすうオリパ〜」の 入口（tools/build_oripa.mjs が sansu-oripa.html に まとめる）
// 土台は パック＆バトル 単体版。がくしゅう（けいさんオリパの 出題）を たした もの。docs/SANSU_ORIPA.md
import './oripa-on.js'; // かならず いちばん はじめ
import { pbMenu } from './packbattle.js';
import { learnPeek, learnPoke } from './learn.js';

// どうさかくにん用：URL に #dbg を つけた とき だけ、いまの もんだいを そとから 見られる（tools/e2e_oripa.mjs が つかう）
if (/dbg/.test(location.hash)) window.__oripaTest = { peek: learnPeek, poke: learnPoke };

pbMenu(() => document.getElementById('app'), null);
