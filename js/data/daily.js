// きょうの ぼうけん（2026-11-11。docs/DAILY.md）：日づけで きまる 種（たね）と「きょうの ルール」。みんな おなじ 条件で 1日 1回
// fx：game.js の newGame に わたす もんしょうの こうか（emblems.js の emblemEffects と おなじ 形の 一部）。buff：てきの クリーチャーに ＋N/＋N
export const DAILY_RULES = [
  { id: 'mana', name: 'マナの 日', text: 'さいしょから マナゾーンに きほんカードが 1まい ある。', line: 'さいしょから マナ 1つ', fx: { startMana: 1 } },
  { id: 'hand6', name: 'てふだ 6まいの 日', text: 'ターンの はじめに、てふだが 6まいに なるまで 引ける（いつもは 5まい）。', line: 'てふだ 6まい', fx: { handSize: 6 } },
  { id: 'exact', name: 'ぴったりの 日', text: 'てきを ぴったりで たおすたび、ライフ ＋2。', line: 'ぴったりで ライフ ＋2', fx: { exactLife: 2 } },
  { id: 'life25', name: 'げんきの 日', text: 'はじめの ライフが 25（20 ＋ 5）。', line: 'はじめの ライフ 25', fx: { life: 5 } },
  { id: 'life15', name: 'しれんの 日', text: 'はじめの ライフが 15（20 − 5）。むずかしい 日。', line: 'はじめの ライフ 15', fx: { life: -5 } },
  { id: 'bolster', name: 'きたえる 日', text: 'ターンの はじめに、タフネスが いちばん 小さい じぶんの クリーチャーに ＋1/＋1カウンターを 1こ おく。', line: 'ターンの はじめに ＋1/＋1カウンター', fx: { turnBolster: 1 } },
  { id: 'ping', name: 'いなずまの 日', text: 'ターンの はじめに、てきに 1点の ダメージ。', line: 'ターンの はじめに てきに 1点', fx: { turnPing: 1 } },
  { id: 'ice', name: 'こおりの 日', text: 'ターンの はじめに、パワーが いちばん 大きい てきの クリーチャーを タップする（ブロック できなく なる）。', line: 'ターンの はじめに てきを タップ', fx: { turnTap: 1 } },
  { id: 'haste', name: 'はやての 日', text: 'あなたの クリーチャーは みんな 速攻（そっこう）を もつ（出した ターンに こうげき できる）。', line: 'みんな 速攻（そっこう）', fx: { kwAll: ['haste'] } },
  { id: 'sky', name: 'そらの 日', text: 'あなたの クリーチャーは みんな 飛行（ひこう）を もつ（飛行（ひこう）か 到達（とうたつ）の てきに しか ブロックされない）。', line: 'みんな 飛行（ひこう）', fx: { kwAll: ['flying'] } },
  { id: 'buff', name: 'つよい てきの 日', text: 'てきの クリーチャーは みんな ＋1/＋1。むずかしい 日。', line: 'てきの クリーチャー ＋1/＋1', fx: {}, buff: 1 },
];
export const DAILY_RULE = Object.fromEntries(DAILY_RULES.map((r) => [r.id, r]));

// 文字から 数（おなじ 文字なら おなじ 数）
export const hashStr = (str) => { let h = 2166136261; for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
// 日づけ（その 端末の 日）：'2026-11-11'
export const dateStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// 日の 番号（2026-01-01 が 0）。ルールは 4つ とびで まわる（11日で ひとまわり。おなじ ルールが つづかない）
const dayNo = (date) => { const [y, m, d] = date.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86400000); };
export function dailyOf(date = dateStr()) {
  const n = dayNo(date), k = (((n * 4 + 3) % DAILY_RULES.length) + DAILY_RULES.length) % DAILY_RULES.length;
  return { date, seed: hashStr(`daily:${date}`), rule: DAILY_RULES[k] };
}
export const dateLabel = (date) => { const [, m, d] = date.split('-').map(Number); return `${m}月${d}日`; };
