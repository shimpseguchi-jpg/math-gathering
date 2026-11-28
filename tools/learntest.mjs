// がくしゅう（合体版「さんすうオリパ」）の もんだいづくりの テスト：node tools/learntest.mjs
// たくさん つくって、きまり（docs/SANSU_ORIPA.md 2章 ＝ けいさんオリパと おなじ）を まもって いるか しらべる
import { newQ, genTri, promote, sfTier, mult, TRI_PATS, NUM_MAX, TRI_START, WORD_TRI_OK, THREE_DIGIT_COMBO, TM, SF_COMBO, UNITS, LEARN_GP, CLEAR_OK, LEARN_COIN } from '../js/data/learn.js';
import { PB, PB_TREE, PB_TREE_LEARN, learnUnitOpen, packsFor, ORIPA_NAME } from '../js/data/packbattle.js';

let n = 0, fails = 0;
const check = (name, ok, got = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${got !== '' ? `（${got}）` : ''}`); };
const N = 20000, MODES = ['add', 'sub', 'mix', 'word'];
// 1つの たんげんを つづけて n もん（ぜんぶ せいかい した ことに する）。sf：スーパーフィーバー中、combo：れんぞくの 数（きめた まま）
function run(mode, n, { sf = false, combo = 0, okStep = 1 } = {}) {
  const st = { mode, qSeen: 0, okSeen: 0, combo, hell: sf, prev: null }, out = [];
  for (let i = 0; i < n; i++) { const q = newQ(st); out.push({ ...q, i, okBefore: st.okSeen }); st.okSeen += okStep; if (sf) st.hell = true; }
  return out;
}
const sessions = (mode, o) => Array.from({ length: N / 40 }, () => run(mode, 40, o)).flat(); // 40もんずつ 500回（たんげんに 入りなおす）

// ---- ふつうの とき：はんいの そと・マイナスが 出ない ----
for (const m of MODES) {
  const qs = sessions(m);
  const two = qs.filter((q) => !q.tri), tri = qs.filter((q) => q.tri);
  const inR = (x) => Number.isInteger(x) && x >= 0 && x <= NUM_MAX;
  check(`${m}：ふつうの とき（${qs.length}もん）はんいの そと（ティア）が 出ない`, qs.every((q) => !q.tier && q.op !== '×'));
  check(`${m}：2つの かず：数も こたえも 0〜18・マイナス なし・こたえが あって いる`, two.every((q) => inR(q.a) && inR(q.b) && inR(q.ans) && q.ans === (q.op === '+' ? q.a + q.b : q.a - q.b)), two.length);
  check(`${m}：2つの かず：たしざんは くりあがり（こたえ 11〜18）、ひきざんは くりさがり（11〜18 − ひとけた ＝ 2〜9）`, two.every((q) => (q.op === '+' ? q.a >= 2 && q.a <= 9 && q.b >= 2 && q.b <= 9 && q.ans >= 11 && q.ans <= 18 : q.a >= 11 && q.a <= 18 && q.b <= 9 && q.ans >= 2 && q.ans <= 9 && q.a % 10 < q.b)));
  check(`${m}：3つの かず：とちゅうも さいごも 0〜18・マイナス なし・左から じゅんに 計算した こたえ`, tri.length > 0 && tri.every((q) => { const mid = q.o1 === '+' ? q.a + q.b : q.a - q.b, ans = q.o2 === '+' ? mid + q.c : mid - q.c; return inR(mid) && inR(ans) && q.mid === mid && q.ans === ans && [q.a, q.b, q.c].every((x) => x >= 1 && x <= NUM_MAX); }), tri.length);
  check(`${m}：3つの かずの パターンは その たんげんの もの だけ（${TRI_PATS[m].join(' ')}）`, tri.every((q) => TRI_PATS[m].includes(q.o1 + q.o2)) && (TRI_PATS[m].length === 1 || new Set(tri.map((q) => q.o1 + q.o2)).size === 4));
  const rate = tri.length / qs.filter((q) => (m === 'word' ? q.okBefore >= WORD_TRI_OK : q.i >= TRI_START)).length;
  check(`${m}：3つの かずは じょうけんの あと 25% くらい`, rate > 0.21 && rate < 0.29, `${(rate * 100).toFixed(1)}%`);
  if (m === 'word') check('word：3つの かずは 5もん せいかい する まえには 出ない', tri.every((q) => q.okBefore >= WORD_TRI_OK) && qs.filter((q) => q.okBefore < WORD_TRI_OK).length >= N / 10 && qs.every((q) => q.open3 === (q.okBefore >= WORD_TRI_OK)));
  else check(`${m}：3つの かずは 4もんめより まえには 出ない`, tri.every((q) => q.i >= TRI_START) && qs.every((q) => q.open3 === (q.i >= TRI_START)));
  check(`${m}：同じ もんだいが つづかない（2つの かず）`, qs.every((q, k) => !k || q.tri || qs[k - 1].tri || qs[k - 1].i > q.i || !(q.a === qs[k - 1].a && q.b === qs[k - 1].b)));
}
{ // せいかい しない まま だと 文しょう題の 3つの かずは いつまでも 出ない
  const qs = Array.from({ length: 200 }, () => run('word', 30, { okStep: 0 })).flat();
  check('word：せいかいが 0 の ままなら、何もん 出しても 3つの かずは 出ない', qs.every((q) => !q.tri));
}
// ---- 文しょう題 ----
{
  const qs = sessions('word');
  check('文しょう題：だいじな ことば（[ ]）が 2つの かずは 1つ いじょう、3つの かずは ちょうど 2つ（前から 1つめ・2つめの 計算）', qs.every((q) => (q.tri ? q.kw.length === 2 && q.toks.filter((t) => t.k).map((t) => t.o).join('') === q.o1 + q.o2 : q.kw.length >= 1 && q.toks.filter((t) => t.k).every((t) => t.o === q.op))));
  check('文しょう題：文に 数が ぜんぶ 出る・かっこが のこらない・ラッキーも ある', qs.every((q) => { const t = q.toks.map((x) => (x.k || '') + x.t).join(' '); return !/[\[\]]/.test(t) && [q.a, q.b, ...(q.tri ? [q.c] : [])].every((x) => t.includes(String(x))); }) && qs.some((q) => q.lucky));
}
// ---- スーパーフィーバー ----
for (const m of ['add', 'sub', 'mix']) {
  const lo = run(m, N, { sf: true, combo: 5 }), mid = run(m, N, { sf: true, combo: 19 }), hi = run(m, N, { sf: true, combo: 20 });
  const tiers = (qs) => [1, 2, 3, 4].map((t) => qs.filter((q) => q.tier === t).length);
  check(`${m}：スーパーフィーバー中、3けた（ティア 3）は 20もん れんぞく より 少ないと 出ない（5・19 れんぞくで ${N}もんずつ）`, tiers(lo)[2] === 0 && tiers(mid)[2] === 0 && [...lo, ...mid].every((q) => q.a < 100 && q.b < 100 && q.ans < 100), `${tiers(lo)}／${tiers(mid)}`);
  check(`${m}：20もん れんぞく からは 3けたも 出る`, tiers(hi)[2] > 0 && tiers(hi).every((x) => x > 0), String(tiers(hi)));
  const r = hi.filter((q) => q.tier).length / N;
  check(`${m}：はんいの そとは 30% くらい`, r > 0.27 && r < 0.33, `${(r * 100).toFixed(1)}%`);
  const all = [...lo, ...mid, ...hi].filter((q) => q.tier);
  check(`${m}：はんいの そとの もんだいの 形（2けた＋1けた・2けた＋2けた・九九・3けた）・こたえ・ラッキーに ならない`, all.every((q) => !q.lucky && !q.zoro && !q.tri && (q.tier === 4 ? q.op === '×' && q.ans === q.a * q.b && q.a >= 2 && q.a <= 9 && q.b >= 2 && q.b <= 9
    : q.ans === (q.op === '+' ? q.a + q.b : q.a - q.b) && q.ans >= 0 && (q.tier === 1 ? q.a >= 10 && q.a <= 99 && q.b <= 9 && q.ans <= 99 : q.tier === 2 ? q.a >= 10 && q.a <= 99 && q.b >= 10 && q.b <= 99 && q.ans <= 99 : q.a >= 100 && q.a <= 999 && q.ans >= 100))));
  check(`${m}：スーパーフィーバー中の のこりは ふつうの もんだい（0〜18）`, [...lo, ...hi].filter((q) => !q.tier).every((q) => q.ans >= 0 && q.ans <= NUM_MAX && q.a <= NUM_MAX));
}
{
  const w = run('word', 4000, { sf: true, combo: 30 });
  check('word：スーパーフィーバー中でも 文しょう題に はんいの そとは 出ない', w.every((q) => !q.tier));
  const st = { mode: 'add', qSeen: 0, okSeen: 0, combo: 0, hell: true, prev: null }; const q = newQ(st);
  check('れんぞくが 5 より 少なく なったら（まちがえた・パスした）スーパーフィーバーは おわる', st.hell === false && !q.tier);
  check('3けたの ティアは sfTier でも 20 より 少ないと えらばれない', Array.from({ length: 5000 }, () => sfTier(19)).every((t) => t !== 3) && Array.from({ length: 5000 }, () => sfTier(20)).some((t) => t === 3));
}
// ---- コイン・ばいりつ ----
{
  const q = (o) => ({ lucky: false, tier: 0, ...o });
  check('ばいりつ：フィーバー 5れんぞくで 2ばい・10れんぞくで 3ばい（かさねない・いちばん 大きい もの だけ）', mult(q(), 4) === 1 && mult(q(), 5) === 2 && mult(q(), 9) === 2 && mult(q(), 10) === 3 && mult(q({ lucky: true }), 10) === 3 && mult(q({ lucky: true }), 5) === 3 && mult(q({ lucky: true }), 0) === 3);
  check('ばいりつ：はんいの そと 2けた＋1けた 4ばい・2けた＋2けた 6ばい・3けた 10ばい・九九 10ばい', mult(q({ tier: 1 }), 5) === 4 && mult(q({ tier: 2 }), 12) === 6 && mult(q({ tier: 3 }), 20) === 10 && mult(q({ tier: 4 }), 5) === 10 && TM.join() === '1,4,6,10,10');
  check('コイン：式の せいかい・文しょう題の 1ステップ ＝ 10。フィーバーは 5れんぞく から', LEARN_COIN === 10 && SF_COMBO === 5 && THREE_DIGIT_COMBO === 20);
  const zs = run('add', N); const z = zs.filter((x) => !x.tri && x.a === x.b);
  check('ゾロめ（7＋7 など）は かならず ラッキー（3ばい）。ラッキーは ぜんたいの 12% くらい ＋ ゾロめ', z.length > 0 && z.every((x) => x.zoro && x.lucky) && zs.filter((x) => x.lucky && !x.zoro).length / N > 0.09 && zs.filter((x) => x.lucky && !x.zoro).length / N < 0.15, `ゾロめ ${z.length}`);
}
// ---- たんげんと せいちょう ----
{
  check('たんげんは 4つ：たしざん・ひきざん・まぜまぜ・ぶんしょうもんだい', UNITS.map((u) => u.id).join() === 'add,sub,mix,word');
  check('はじめから えらべるのは たしざん・ひきざん。まぜまぜは 枝 1つめ（3）、ぶんしょうもんだいは 2つめ（5）', learnUnitOpen({}, 'add') && learnUnitOpen({}, 'sub') && !learnUnitOpen({}, 'mix') && !learnUnitOpen({}, 'word') && learnUnitOpen({ learn: 1 }, 'mix') && !learnUnitOpen({ learn: 1 }, 'word') && learnUnitOpen({ learn: 2 }, 'word') && PB_TREE_LEARN.nodes.map((x) => `${x.unit}${x.cost}`).join() === 'mix3,word5');
  check('がくしゅうの 枝は「パック」の 枝とは べつ。まえからの 枝（キャパシティ・パック・もんだい・デッキの わく）は そのまま', PB_TREE_LEARN.id === 'learn' && PB_TREE.map((t) => t.id).join() === 'cap,pack,quiz,deck' && PB_TREE.filter((t) => !t.free).flatMap((t) => t.nodes).reduce((t, x) => t + x.cost, 0) === 38);
  check('がくしゅうの せいちょうポイント：初クリア（10もん せいかい）3・3つの かずの 初かいほう 2・スーパーフィーバー 初とつにゅう 2・20もん れんぞく 3', LEARN_GP.clear === 3 && LEARN_GP.tri === 2 && LEARN_GP.sf === 2 && LEARN_GP.s20 === 3 && CLEAR_OK === 10);
  check('パックと ねだんは そのまま（16しゅるい・100）。はじめの コイン 200・もんだい 10・かち 50・ボス 100', packsFor().length === 16 && PB.pack === 100 && PB.start === 200 && PB.quiz === 10 && PB.win === 50 && PB.boss === 100 && PB.exact === 10 && PB.exactMax === 5);
  check('アプリの なまえ', ORIPA_NAME === 'Mathematics of the Gathering〜さんすうオリパ〜');
}
console.log(fails ? `FAILED: ${fails} / ${n}` : `ALL OK（${n}）`);
process.exit(fails ? 1 : 0);
