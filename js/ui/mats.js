// プレイマット（2026-10-27）：たたかいの 卓の 背景。ストーリーの 章や 塔を クリアすると もらえる（つよさは かわらない）
// えらぶのは せっていの「プレイマット」。画面では body[data-mat] と CSS（css/style.css の プレイマット）
const KEY = 'mtg-mats';
export const MATS = [
  { id: 'plain', name: 'ふつう', how: '' },
  { id: 'nyx', name: 'テーロスの 星空（ほしぞら）', how: 'ストーリー 1章を クリア' },
  { id: 'guild', name: 'ラヴニカの 石（いし）だたみ', how: 'ストーリー 2章を クリア' },
  { id: 'scale', name: 'タルキールの 龍（りゅう）の うろこ', how: 'ストーリー 3章を クリア' },
  { id: 'neon', name: '番外編（ばんがいへん）の ネオン', how: 'ストーリー 4章を クリア' },
  { id: 'erebos', name: 'エレボスの 冥界（めいかい）', how: 'テーロスの とうを のぼりきる' },
  { id: 'jace', name: 'ジェイスの 心の 図書館', how: 'ラヴニカの とうを のぼりきる' },
  { id: 'chalk', name: 'ストリクスヘイヴンの 黒板（こくばん）', how: 'ストーリー 5章を クリア' },
  { id: 'lantern', name: '卒業（そつぎょう）の ランタン', how: 'ストリクスヘイヴンの とうを のぼりきる' },
];
export const CHAPTER_MAT = { 1: 'nyx', 2: 'guild', 3: 'scale', 4: 'neon', 5: 'chalk' };
export const TOWER_MAT = { theros: 'erebos', ravnica: 'jace', strixhaven: 'lantern' };
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { got: [], use: 'plain' }; } catch { return { got: [], use: 'plain' }; } };
const save = (M) => { try { localStorage.setItem(KEY, JSON.stringify(M)); } catch { /* 保存できなくても この あいだは つかえる */ } };
// 開発モード（デモ）では ぜんぶ えらべる（settings.js が setMatFree(DEV) を よぶ）
let free = false;
export const setMatFree = (v) => { free = !!v; };
export const hasMat = (id) => id === 'plain' || free || load().got.includes(id);
export const matName = (id) => MATS.find((m) => m.id === id)?.name || '';
export const usingMat = () => { const u = load().use; return hasMat(u) ? u : 'plain'; };
export const applyMat = () => { document.body.dataset.mat = usingMat(); };
export function useMat(id) { if (!hasMat(id)) return; const M = load(); M.use = id; save(M); applyMat(); }
// もらう：あたらしく もらえたら true（もらった マットは すぐ つかう）
export function awardMat(id) {
  if (!id || load().got.includes(id)) return false; // ごほうびは 開発モードでも きろくする
  const M = load(); M.got.push(id); M.use = id; save(M); applyMat();
  return true;
}
