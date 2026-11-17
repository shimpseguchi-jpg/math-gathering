// 単体版（パック＆バトル だけの ゲーム。docs/PACKBATTLE.md 10章）か どうか。
// 単体版の 入口（standalone.js）が、ほかの どの モジュールより さきに solo-on.js を よみこんで しるしを つける。
// しるしが あると：app.js は タイトルを 出さない・packbattle.js は べつの セーブで、タイトルへ もどる ボタンを 出さない
let on = false;
export const isSolo = () => on;
export const setSolo = () => { on = true; };
