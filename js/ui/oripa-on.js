// 合体版「Mathematics of the Gathering〜さんすうオリパ〜」の しるしを つける（oripa-main.js の いちばん はじめの import）
// セーブ：この アプリ だけの キー（motg-sansu-oripa-v1）。まえの アプリ（パック＆バトル 単体版・けいさんオリパ・本編）の キーには 読み書き しない。
// おと・デッキの しぼりこみ など こまかい せっていを のこす ぶひんは、もとの キーの なまえで localStorage を よぶ ので、
// ここで ぜんぶの キーの あたまに「motg-sansu-oripa:」を つける（ほかの アプリの キーと ぜったいに かさならない）
import { setSolo, setOripa } from './solo.js';
setSolo(); setOripa();
document.documentElement.classList.add('oripa'); // 横画面の ならべかた など、合体版 だけの みため（css の :root.oripa）
const PRE = 'motg-sansu-oripa', P = Storage.prototype, key = (k) => (String(k).startsWith(PRE) ? String(k) : `${PRE}:${k}`);
const get = P.getItem, set = P.setItem, del = P.removeItem;
P.getItem = function (k) { return get.call(this, key(k)); };
P.setItem = function (k, v) { return set.call(this, key(k), v); };
P.removeItem = function (k) { return del.call(this, key(k)); };
