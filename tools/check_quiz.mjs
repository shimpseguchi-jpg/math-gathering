// しゅぎょうの もんだいを たくさん 作って、こたえと えらびが ただしいか しらべる
//   node tools/check_quiz.mjs
import { GEN, CATS, KANJI, PARTICLES, quizSession, passed, pointsFor, clockLabel } from '../js/data/quiz.js';
import { seeded } from '../js/engine/rng.js';

const GRADE1 = '一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六';
const rng = seeded(7);
const N = 3000;
let bad = 0;
const ng = (m) => { bad++; if (bad < 30) console.log('NG', m); };
const calc = (t) => {
  const xs = t.replace(/＋/g, ' + ').replace(/−/g, ' - ').split(/\s+/).filter(Boolean);
  let v = +xs[0], mid = [];
  for (let i = 1; i < xs.length; i += 2) { v = xs[i] === '+' ? v + +xs[i + 1] : v - +xs[i + 1]; mid.push(v); }
  return { v, mid, nums: xs.filter((_, i) => i % 2 === 0).map(Number) };
};
const kanjiIn = (t) => [...t].filter((ch) => /\p{Script=Han}/u.test(ch));

for (let i = 0; i < N; i++) {
  const a = GEN.add(rng); const ca = calc(a.text);
  if (ca.v !== a.answer || ca.v < 11 || ca.v > 18 || ca.nums.some((x) => x < 2 || x > 9)) ng(`add ${a.text} = ${a.answer}`);
  const s = GEN.sub(rng); const cs = calc(s.text);
  if (cs.v !== s.answer || cs.nums[0] < 11 || cs.nums[0] > 18 || cs.nums[0] % 10 >= cs.nums[1] || cs.v < 0 || cs.v > 9) ng(`sub ${s.text} = ${s.answer}`);
  const t = GEN.three(rng); const ct = calc(t.text);
  if (ct.v !== t.answer || ct.mid.some((x) => x < 0 || x > 20) || ct.nums.length !== 3) ng(`three ${t.text} = ${t.answer}`);
  const x = GEN.ten(rng);
  const m = x.text.match(/^(\d+)は (\d+)と □$/) || x.text.match(/^□と (\d+)で (\d+)$/);
  const [n, k] = x.text.startsWith('□') ? [+m[2], +m[1]] : [+m[1], +m[2]];
  if (!m || n - k !== x.answer || x.answer < 1) ng(`ten ${x.text} = ${x.answer}`);
  const c = GEN.clock(rng);
  if (c.answer !== clockLabel(...c.clock) || c.choices.length !== 4 || new Set(c.choices).size !== 4 || !c.choices.includes(c.answer)) ng(`clock ${c.clock} ${c.choices}`);
  if (c.clock[1] === 30 && !c.choices.includes(clockLabel((c.clock[0] % 12) + 1, 30))) ng(`clock no next-hour half ${c.clock}`);
  const j = GEN.kanji(rng);
  if (j.choices.length !== 4 || new Set(j.choices).size !== 4 || !j.choices.includes(j.answer)) ng(`kanji ${j.text} ${j.choices}`);
  const p = GEN.particle(rng);
  if (!p.choices.includes(p.answer) || new Set(p.choices).size !== p.choices.length || !p.text.includes('□')) ng(`particle ${p.text}`);
}
// かんじ：もんだいの 文に 出る かんじは ぜんぶ 1ねんせいの かんじ。よむ ところは ［ ］ で 1つ
for (const [w, yomi, text, g] of KANJI) {
  const outside = kanjiIn(text).filter((ch) => !GRADE1.includes(ch));
  if (outside.length) ng(`kanji not grade 1: ${text} ${outside.join('')}`);
  if (!text.includes(`［${w}］`)) ng(`kanji target ${w} not in ${text}`);
  if (!/^[ぁ-ゖー]+$/.test(yomi)) ng(`kanji yomi ${yomi}`);
  if (KANJI.filter((k) => k[3] === g).length < 4) ng(`kanji group ${g} too small`);
}
for (const [text, answer, opts] of PARTICLES) {
  if ((text.match(/□/g) || []).length !== 1 || !opts.includes(answer) || kanjiIn(text).some((ch) => !GRADE1.includes(ch))) ng(`particle ${text}`);
}
// 1かいの しゅぎょう：しゅるいの かず（おもさ どおり）
const next = quizSession(rng);
const cnt = {};
for (let i = 0; i < 900; i++) { const q = next(); cnt[q.cat] = (cnt[q.cat] || 0) + 1; }
const W = Object.values(CATS).reduce((t, c) => t + c.weight, 0);
for (const [k, c] of Object.entries(CATS)) if (Math.abs(cnt[k] - 900 * c.weight / W) > 1) ng(`session ${k} ${cnt[k]}`);
const only = quizSession(rng, ['clock']);
for (let i = 0; i < 50; i++) if (only().cat !== 'clock') ng('session filter');
// ごうかく：7わりより おおく（ちょうど 7わりは だめ）・5もん いじょう
const cases = [[10, 7, false], [10, 8, true], [4, 4, false], [5, 5, true], [5, 3, false], [20, 15, true], [20, 14, false]];
for (const [n, ok, want] of cases) if (passed(n, ok) !== want) ng(`passed ${ok}/${n}`);
if (pointsFor(10, 8) !== 3 || pointsFor(10, 10) !== 4 || pointsFor(10, 7) !== 0) ng('points');

console.log(`もんだい ${N * 7}こ・かんじ ${KANJI.length}こ・てにをは ${PARTICLES.length}こ・しゅるい ${JSON.stringify(cnt)}`);
console.log(bad ? `NG ${bad}` : 'OK');
process.exitCode = bad ? 1 : 0;
