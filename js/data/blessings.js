// むげんの とうの 祝福（しゅくふく。docs/ENDLESS.md）：その ぼうけんの あいだ だけ つく つよさ
// ぴったりを 3回 するか、休けい所の しゅぎょうで ごうかくすると 1つ えらべる。同じ 運命を 3つ あつめると つよく なる
export const BLESS_MAX = 3;
// 3つ そろうと ばいに（1・2・4）
export const blessLv = (n) => [0, 1, 2, 4][Math.min(n, BLESS_MAX)] || 0;
export const PATHS = [
  { id: 'pres', name: '存護（そんご）', color: 'W', text: (v) => `はじめの ライフ ＋${3 * v}` },
  { id: 'dest', name: '壊滅（かいめつ）', color: 'R', text: (v) => `じぶんの ターンの はじめに てきに ${v}点` },
  { id: 'hunt', name: '巡狩（じゅんしゅ）', color: 'U', text: (v) => `ぴったりで たおすと てきに ${v}点` },
  { id: 'abun', name: '豊穣（ほうじょう）', color: 'G', text: (v) => `じぶんの ターンの はじめに ＋1/＋1カウンター ${v}こ（いちばん 小さい クリーチャーに）` },
  { id: 'nihi', name: '虚無（きょむ）', color: 'K', text: (v) => `じぶんの ターンの はじめに てきの いちばん つよい クリーチャーに −1/−1カウンター ${v}こ` },
  // 調和は マナ：ばいに しない（1・2・3まい）
  { id: 'harm', name: '調和（ちょうわ）', color: '', text: (v, n) => `さいしょから マナゾーンに きほんカード ${Math.min(n, BLESS_MAX)}まい` },
];
export const PATH_BY_ID = Object.fromEntries(PATHS.map((p) => [p.id, p]));
// 祝福の せつめい（n こ もって いる とき）
export const blessText = (id, n) => PATH_BY_ID[id].text(blessLv(n), n);
// えらべる 祝福（3つ そろった 運命は 出ない）。rng で 3つ
export function blessChoices(rng, have = {}) {
  const list = PATHS.filter((p) => (have[p.id] || 0) < BLESS_MAX);
  const out = [];
  while (out.length < 3 && list.length) out.push(list.splice(Math.floor(rng() * list.length), 1)[0]);
  return out;
}
// 祝福 → game.js の newGame（bless）
export function blessFx(have = {}) {
  const v = (id) => blessLv(have[id] || 0);
  const fx = { life: 3 * v('pres'), ping: v('dest'), exactPing: v('hunt'), bolster: v('abun'), wither: v('nihi'), startMana: Math.min(have.harm || 0, BLESS_MAX) };
  return Object.values(fx).some((x) => x) ? fx : null;
}
// むげんの とうの 階：テーロス・ラヴニカの 5階の あと 6階から。lap ＝ なん周め（1 から）。てきは ＋lap/＋lap
export const ENDLESS = { start: 6, rest: 5, exactPer: 3 };
export const endlessBuff = (lap) => lap - 1;
// スコア ＝ とどいた 階 × 10 ＋ ぴったりの 数
export const endlessScore = (floor, exact) => floor * 10 + exact;
