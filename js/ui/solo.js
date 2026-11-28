// 単体版（パック＆バトル だけの ゲーム。docs/PACKBATTLE.md 10章）か どうか。
// 単体版の 入口（standalone.js）が、ほかの どの モジュールより さきに solo-on.js を よみこんで しるしを つける。
// しるしが あると：app.js は タイトルを 出さない・packbattle.js は べつの セーブで、タイトルへ もどる ボタンを 出さない
let on = false;
export const isSolo = () => on;
export const setSolo = () => { on = true; };
// 合体版「Mathematics of the Gathering〜さんすうオリパ〜」（docs/SANSU_ORIPA.md）か どうか。入口（oripa-main.js）が oripa-on.js で しるしを つける。
// 単体版の うえに：がくしゅう（けいさんオリパの 出題）・コインの よびかた・べつの セーブ（まえの アプリの セーブには さわらない）
let oripa = false;
export const isOripa = () => oripa;
export const setOripa = () => { oripa = true; };
