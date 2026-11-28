// がくしゅう（さんすうオリパ）：もんだいづくり。けいさんオリパ（app-maker の keisan/index.html、コミット bf7d3e5）の 出題エンジンを そのまま うつした もの
// きまりは かえない（docs/SANSU_ORIPA.md 2章）。画面は ui/learn.js。ここは 画面を さわらない（node で テストできる：tools/learntest.mjs）
//   ・ふつうの もんだい：2つの かず。たしざんは こたえ 11〜18（くりあがり）、ひきざんは 11〜18 − ひとけた ＝ 2〜9（くりさがり）
//   ・3つの かず（a＋b＋c・a＋b−c・a−b＋c・a−b−c）：とちゅうも さいごも 0〜18。25% で まざる。式は その たんげんの 4もんめ から、文しょう題は 5もん せいかい してから
//   ・スーパーフィーバー中 だけ、30% で はんいの そと（2けた＋1けた・2けた＋2けた・九九・3けた）。3けたは 20もん れんぞく いじょうの とき だけ
export const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = (a) => a[rnd(0, a.length - 1)];

export const UNITS = [
  { id: 'add', name: 'たしざん', sub: 'くりあがり', mark: '＋' },
  { id: 'sub', name: 'ひきざん', sub: 'くりさがり', mark: '−' },
  { id: 'mix', name: 'まぜまぜ', sub: 'たしざんと ひきざん', mark: '＋−' },
  { id: 'word', name: 'ぶんしょうもんだい', sub: 'ことば → たす？ ひく？ → けいさん', mark: '文' },
];
export const UNIT_NAME = Object.fromEntries(UNITS.map((u) => [u.id, u.name]));

export const SF_COMBO = 5; // なんもん れんぞくで「スーパーフィーバー はいる？」を きくか（フィーバーが はじまる 数と おなじ）
export const SF_RATE = 0.3; // スーパーフィーバー中に はんいの そとの もんだいが まざる わりあい
export const SF_TIERS = [[1, 0.4], [2, 0.3], [4, 0.2], [3, 0.1]]; // ティア 1：2けたと 1けた 40%、2：2けたと 2けた 30%、4：九九 20%、3：3けた 10%
export const THREE_DIGIT_COMBO = 20; // 3けた（ティア 3）は れんぞく せいかいが この 数 いじょうの とき だけ。それまでは ほかの ティアに ふりわける
export const TM = [1, 4, 6, 10, 10]; // ティアごとの コインの ばいりつ
export const TN = ['', '2けたと 1けた', '2けたと 2けた', '3けた', 'かけざん 九九'];
export const NUM_MAX = 18; // ふつうの もんだいで あつかう 数の うわげん（とちゅうの こたえも さいごの こたえも 0〜18）
export const TRI_RATE = 0.25; // 3つの かずが まざる わりあい
export const TRI_START = 3; // 式：その たんげんで なんもん 出した あとから まざるか（4もんめ から）
export const TRI_PATS = { add: ['++'], sub: ['--'], mix: ['++', '+-', '-+', '--'], word: ['++', '+-', '-+', '--'] };
export const WORD_TRI_OK = 5; // 文しょう題：その たんげんで なんもん せいかい してから まざるか
export const LUCKY_RATE = 0.12; // ラッキーもんだい（コイン 3ばい）

export function sfTier(combo) {
  const list = SF_TIERS.filter((x) => x[0] !== 3 || combo >= THREE_DIGIT_COMBO);
  let sum = 0, i;
  for (i = 0; i < list.length; i++) sum += list[i][1];
  let r = Math.random() * sum; // のこった しゅるいで わりあいを たもった まま えらぶ
  for (i = 0; i < list.length - 1; i++) { if (r < list[i][1]) break; r -= list[i][1]; }
  return list[i][0];
}
// q.pt の ティアの もんだいに つくりかえる（＋−は もとの もんだいと おなじ。ティア 4 は ×）
export function promote(q) {
  const t = q.pt, op = q.op; let a, b;
  if (t === 4) { a = rnd(2, 9); b = rnd(2, 9); q.op = '×'; q.ans = a * b; } else {
    for (;;) {
      if (t === 1) { a = op === '+' ? rnd(11, 89) : rnd(20, 39); b = rnd(2, 9); } // 16＋7、28＋5／24−7
      else if (t === 2) { if (op === '+') { a = rnd(11, 79); b = rnd(11, 99 - a); } else { a = rnd(31, 98); b = rnd(11, a - 11); } } // 27＋15／43−18
      else { a = op === '+' ? rnd(101, 899) : rnd(120, 999); b = rnd(0, 1) ? rnd(2, 9) : rnd(11, 89); } // 125＋8、148＋37／132−7、214−38
      if (op === '+' ? (a % 10 + b % 10 >= 10 && (t === 3 || a + b <= 99)) : (a % 10 < b % 10 && a - b >= (t === 3 ? 100 : 2))) break;
    }
    q.ans = op === '+' ? a + b : a - b;
  }
  q.a = a; q.b = b; q.tier = t; q.input = '';
}
export function genTri(pats) {
  for (;;) {
    const p = pick(pats), a = p.charAt(0) === '+' ? rnd(1, 9) : rnd(2, NUM_MAX), b = rnd(1, 9), c = rnd(1, 9);
    const mid = p.charAt(0) === '+' ? a + b : a - b, ans = p.charAt(1) === '+' ? mid + c : mid - c;
    if (mid < 0 || mid > NUM_MAX || ans < 0 || ans > NUM_MAX) continue; // とちゅうも さいごも マイナスに しない・うわげんを こえない
    return { a, b, c, o1: p.charAt(0), o2: p.charAt(1), mid, ans };
  }
}

// ---- 文しょう題 ----
export function cnt(n, u) {
  const d = n % 10, p = (d === 1 || d === 6 || d === 8 || d === 0);
  if (u === 'ひき') return n + (p ? 'ぴき' : d === 3 ? 'びき' : 'ひき');
  if (u === 'ほん') return n + (p ? 'ぽん' : d === 3 ? 'ぼん' : 'ほん');
  return n + u;
}
const NAN = { こ: 'なんこ', まい: 'なんまい', にん: 'なんにん', だい: 'なんだい', ひき: 'なんびき', ほん: 'なんぼん' };
// [ ] で かこんだ ことばが、たしざん・ひきざんを きめる「だいじな ことば」
const WP = { '+': [
  (a, b) => { const p = pick([['あかい りんご', 'あおい りんご', 'こ', 'あります'], ['しろい ねこ', 'くろい ねこ', 'ひき', 'います'], ['あかい いろがみ', 'あおい いろがみ', 'まい', 'あります'], ['あかい くるま', 'しろい くるま', 'だい', 'あります'], ['ながい えんぴつ', 'みじかい えんぴつ', 'ほん', 'あります']]), u = p[2];
    return [`${p[0]}が ${cnt(a, u)} ${p[3]}。 ${p[1]}が ${cnt(b, u)} ${p[3]}。 [あわせて] ${NAN[u]} ${p[3]}か。`, u]; },
  (a, b) => { const p = pick([['こうえんで こどもが', 'にん', 'あそんで います'], ['いけに かめが', 'ひき', 'います'], ['ひろばに ねこが', 'ひき', 'います']]), u = p[1];
    return [`${p[0]} ${cnt(a, u)} ${p[2]}。 そこへ ${cnt(b, u)} きました。 [みんなで] ${NAN[u]}に なりましたか。`, u]; },
  (a, b) => { const p = pick([['シール', 'まい'], ['カード', 'まい'], ['あめ', 'こ'], ['どんぐり', 'こ']]), u = p[1];
    return [`${p[0]}を ${cnt(a, u)} もって います。 ${cnt(b, u)} [もらうと] [ぜんぶで] ${NAN[u]}に なりますか。`, u]; },
  (a, b) => { const p = pick([['いけに かえるが', 'ひき', 'います'], ['ちゅうしゃじょうに くるまが', 'だい', 'とまって います'], ['すいそうに きんぎょが', 'ひき', 'います']]), u = p[1];
    return [`${p[0]} ${cnt(a, u)} ${p[2]}。 ${cnt(b, u)} [ふえると] ${NAN[u]}に なりますか。`, u]; },
], '-': [
  (a, b) => { const p = pick([['あめ', 'こ', 'たべました'], ['クッキー', 'まい', 'たべました'], ['いろがみ', 'まい', 'つかいました'], ['えんぴつ', 'ほん', 'おとうとに あげました'], ['ふうせん', 'こ', 'とんで いきました']]), u = p[1];
    return [`${p[0]}が ${cnt(a, u)} あります。 ${cnt(b, u)} ${p[2]}。 [のこりは] ${NAN[u]}ですか。`, u]; },
  (a, b) => { const p = pick([['こうえんで こどもが', 'にん', 'あそんで います', 'かえりました'], ['くるまが', 'だい', 'とまって います', 'でて いきました'], ['きの うえに さるが', 'ひき', 'います', 'おりて いきました']]), u = p[1];
    return [`${p[0]} ${cnt(a, u)} ${p[2]}。 ${cnt(b, u)} ${p[3]}。 [のこりは] ${NAN[u]}ですか。`, u]; },
  (a, b) => { const p = pick([['あかい いろがみ', 'あおい いろがみ', 'まい', 'あります'], ['りんご', 'みかん', 'こ', 'あります'], ['いぬ', 'ねこ', 'ひき', 'います']]), u = p[2], f = rnd(0, 1);
    return [`${p[f]}が ${cnt(f ? b : a, u)}、 ${p[1 - f]}が ${cnt(f ? a : b, u)} ${p[3]}。 かずの [ちがいは] ${NAN[u]}ですか。`, u]; },
  (a, b) => { const p = pick([['おとこのこ', 'おんなのこ', 'にん', 'います'], ['あかい はな', 'しろい はな', 'ほん', 'あります'], ['おおきい さかな', 'ちいさい さかな', 'ひき', 'います']]), u = p[2], f = rnd(0, 1);
    return [`${p[f]}が ${cnt(f ? b : a, u)}、 ${p[1 - f]}が ${cnt(f ? a : b, u)} ${p[3]}。 どちらが ${NAN[u]} [おおい]ですか。`, u]; },
] };
// 3つの かずの 文しょう題。[ ] は「たす／ひく」を きめる ことばで、まえから じゅんに 1つめ・2つめの けいさんに あたる
const WP3 = { '++': [
  (a, b, c) => [`こうえんに こどもが ${cnt(a, 'にん')} います。 ${cnt(b, 'にん')} [きました]。 また ${cnt(c, 'にん')} [きました]。 みんなで なんにんに なりましたか。`, 'にん'],
  (a, b, c) => { const p = pick([['シール', 'まい'], ['どんぐり', 'こ'], ['カード', 'まい'], ['あめ', 'こ']]), u = p[1];
    return [`${p[0]}を ${cnt(a, u)} もって います。 ${cnt(b, u)} [もらいました]。 さらに ${cnt(c, u)} [もらいました]。 ぜんぶで ${NAN[u]}に なりましたか。`, u]; },
], '+-': [
  (a, b, c) => { const p = pick([['シール', 'まい', 'つかいました'], ['あめ', 'こ', 'たべました'], ['いろがみ', 'まい', 'つかいました'], ['どんぐり', 'こ', 'あげました']]), u = p[1];
    return [`${p[0]}を ${cnt(a, u)} もって います。 ${cnt(b, u)} [もらいました]。 その あと ${cnt(c, u)} [${p[2]}]。 のこりは ${NAN[u]}ですか。`, u]; },
  (a, b, c) => [`バスに ${cnt(a, 'にん')} のって います。 ${cnt(b, 'にん')} [のりました]。 つぎに ${cnt(c, 'にん')} [おりました]。 バスには なんにん いますか。`, 'にん'],
], '-+': [
  (a, b, c) => { const p = pick([['シール', 'まい', 'つかいました'], ['あめ', 'こ', 'たべました'], ['いろがみ', 'まい', 'つかいました'], ['クッキー', 'まい', 'たべました']]), u = p[1];
    return [`${p[0]}が ${cnt(a, u)} あります。 ${cnt(b, u)} [${p[2]}]。 その あと ${cnt(c, u)} [もらいました]。 ${NAN[u]}に なりましたか。`, u]; },
  (a, b, c) => [`バスに ${cnt(a, 'にん')} のって います。 ${cnt(b, 'にん')} [おりました]。 つぎに ${cnt(c, 'にん')} [のりました]。 バスには なんにん いますか。`, 'にん'],
], '--': [
  (a, b, c) => { const p = pick([['あめ', 'こ', 'たべました'], ['クッキー', 'まい', 'たべました'], ['いろがみ', 'まい', 'つかいました']]), u = p[1];
    return [`${p[0]}が ${cnt(a, u)} あります。 ${cnt(b, u)} [${p[2]}]。 さらに ${cnt(c, u)} [${p[2]}]。 のこりは ${NAN[u]}ですか。`, u]; },
  (a, b, c) => { const p = pick([['どんぐり', 'こ'], ['シール', 'まい'], ['カード', 'まい']]), u = p[1];
    return [`${p[0]}を ${cnt(a, u)} もって います。 おとうとに ${cnt(b, u)} [あげました]。 さらに いもうとに ${cnt(c, u)} [あげました]。 のこりは ${NAN[u]}ですか。`, u]; },
  (a, b, c) => [`バスに ${cnt(a, 'にん')} のって います。 ${cnt(b, 'にん')} [おりました]。 また ${cnt(c, 'にん')} [おりました]。 バスには なんにん いますか。`, 'にん'],
] };

// つぎの もんだいを つくる。st：{ mode, qSeen：その たんげんで 出した 数, okSeen：せいかいした 数, combo：れんぞく せいかい, hell：スーパーフィーバー中, prev：まえの もんだい }
// st.qSeen を 1 ふやし、st.hell を なおす（れんぞくが 5 より 少なければ ふつうに もどる）。もどり値の open3：3つの かずが まざる じょうけんを みたして いたか
export function newQ(st) {
  const m = st.mode, prev = st.prev || {};
  let op = m === 'add' ? '+' : m === 'sub' ? '-' : pick(['+', '-']), a, b;
  do {
    if (op === '+') { a = rnd(2, 9); b = rnd(Math.max(2, 11 - a), 9); } // こたえ 11〜18
    else { a = rnd(11, 18); b = rnd(a - 9, 9); } // こたえ 2〜9
  } while (a === prev.a && b === prev.b);
  const Q = { mode: m, a, b, op, ans: op === '+' ? a + b : a - b, input: '', miss: 0, done: false, word: m === 'word' };
  Q.zoro = !Q.word && op === '+' && a === b; // ゾロめ（7＋7 など）なら ボーナス
  Q.lucky = Q.zoro || Math.random() < LUCKY_RATE;
  Q.pt = 0; Q.tier = 0;
  if (st.hell && st.combo < SF_COMBO) st.hell = false; // まちがえた・パスした あとは ふつうに もどる
  if (!Q.word && st.hell && Math.random() < SF_RATE) { Q.pt = sfTier(st.combo); promote(Q); Q.lucky = false; Q.zoro = false; } // はんいの そとは スーパーフィーバー中 だけ
  const seen = st.qSeen++, open3 = Q.word ? st.okSeen >= WORD_TRI_OK : seen >= TRI_START;
  Q.open3 = open3;
  if (!Q.tier && open3 && Math.random() < TRI_RATE) {
    const g = genTri(TRI_PATS[m]);
    Q.tri = true; Q.a = g.a; Q.b = g.b; Q.c = g.c; Q.o1 = g.o1; Q.o2 = g.o2; Q.mid = g.mid; Q.ans = g.ans; Q.op = op = g.o1; Q.zoro = false;
    Q.lucky = Math.random() < LUCKY_RATE;
  }
  if (Q.word) {
    const w = Q.tri ? pick(WP3[Q.o1 + Q.o2])(Q.a, Q.b, Q.c) : pick(WP[op])(a, b);
    Q.u = w[1]; Q.step = 0; Q.bad = 0; Q.kw = []; Q.opi = 0;
    Q.toks = w[0].split(' ').map((t) => {
      const k = /^\[(.+?)\](.*)$/.exec(t);
      if (k) { Q.kw.push(k[1]); return { k: k[1], t: k[2], ki: Q.kw.length - 1, o: Q.tri ? (Q.kw.length === 1 ? Q.o1 : Q.o2) : op }; } // ki：なんばんめの ことばか。o：その ことばが しめす けいさん
      return { t };
    });
  }
  st.prev = Q;
  return Q;
}
// コインの ばいりつ：ラッキー・ゾロめ 3ばい／フィーバー（5れんぞく 2ばい・10れんぞく 3ばい）／はんいの そと。かさねず、いちばん 大きい もの だけ
export const mult = (Q, combo) => Math.max(Q.lucky ? 3 : 1, combo >= 10 ? 3 : combo >= 5 ? 2 : 1, TM[Q.tier || 0]);
export const LEARN_COIN = 10; // 式の せいかい・文しょう題の 1ステップ
// がくしゅうの せいちょうポイント（それぞれ 1回 だけ）
export const LEARN_GP = { clear: 3, tri: 2, sf: 2, s20: 3 };
export const CLEAR_OK = 10; // たんげんの 初クリア：その たんげんで あわせて 10もん せいかい
export const opCh = (o) => (o === '+' ? '＋' : o === '-' ? '−' : '×');
