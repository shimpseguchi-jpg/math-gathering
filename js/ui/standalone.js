// 単体版の 入口：パック＆バトル だけの ゲーム（tools/build_standalone.mjs が packbattle-standalone.html に まとめる）
// タイトルを とおらず、すぐに パック＆バトルの ホームへ。ぼうけん・こうちく・オンライン などへの 入口は ない
import './solo-on.js'; // かならず いちばん はじめ（app.js が タイトルを 出さない ように）
import { pbMenu } from './packbattle.js';

pbMenu(() => document.getElementById('app'), null);
