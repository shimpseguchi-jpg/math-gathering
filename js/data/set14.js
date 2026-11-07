// 番外編「Fate/Grand Order」第2弾「異聞帯（いぶんたい）」のうごき（FG91〜FG185。名前・コスト・P/T は skel.js、文は docs/EXTRA2_FG.md 3章）
// しくみは 第1弾（set10.js）と 同じ：攻撃で NP が たまり、100 で 宝具（ほうぐ）。
// オーバーチャージ（oc: true）：NP を 100・200・300 の どれだけ つかうか えらぶ → 〔 〕の 数が 1倍・2倍・3倍（1ターンに 1回）。〔 〕の 数は oc(p, n)
// クリプター（第2弾の マスター）：宝具を つかうたび、つかった NP 100 に つき（onHogu の k 回）
// ねらいかた：コモンは ランダム、アンコモンは パワーが いちばん 大きい（ダメージ・−N/−N・−1/−1カウンターは たおせる なかで。game.js の pickOf・mostOrder。foeBest が したがう）。レアの 1体は 人が えらぶ（npTgt）
// クラス相性（あいしょう）は 入れない（2026-11-01 ユーザーが きめた）。クラスは サブタイプとして のこす
import { cr, mine, theirs, isCr, hit, foeBest, shrink, killIt, chosen1, dig, regrow, T, foe1, bestIn } from './kit.js';
import { PICK_FREE } from '../engine/game.js';
import { S10, np, oc, addNP, servants, isServant, bestServant, detain, biggest, allFoes, master, randomFoe, NP_MAX, phantasm, hostOf, allWhile, gives } from './set10.js';

// ---- 道具 ----
const ocNP = (g, fx, x = {}) => np(g, fx, { oc: true, ...x });
// サラスヴァティー・メルトアウト（FG176）が 装備されて いる がわ（味方は マイナスの 修整を 受けない。game.js の minusGuard）
const melt1 = (s, E, p) => {
  const all = [...s.P.bf, ...s.E.bf].filter((q) => E.isCreature(q));
  E.L(s, `${eqName(p)}：すべての クリーチャー（${all.length}体）を −1/−0`);
  for (const q of all) E.pump(q, -1, 0);
};
const guarded = (s, side) => s[side].bf.some((g) => g.def.minusGuard && g.attached && s[side].bf.some((h) => h.uid === g.attached));
// ねらえる 敵の クリーチャー（f で しぼる）と、パワーが 大きい じゅん
const foes = (s, E, f = () => true) => theirs(s, E).filter((t) => !s.floor.untargetable?.(s, t, E) && f(t));
const byPow = (s, E, list) => [...list].sort((a, b) => E.power(s, b) - E.power(s, a));
const topFoe = (s, E, f) => byPow(s, E, foes(s, E, f))[0];
// n 点（−n/−n）で たおせる なかで パワーが いちばん 大きい 敵（いなければ いちばん 大きい。2026-11-06。game.js の mostOrder）
const killTop = (s, E, n, f) => E.mostOrder(s, foes(s, E, f), n).order[0];
// じぶんで えらぶ（PICK_FREE。docs/REMOVAL.md 4.1）：留置（玄奘三蔵）・−1/−1 1こ（モース）・格闘（フェルグス）
PICK_FREE.add('FG97'); PICK_FREE.add('FG132'); PICK_FREE.add('FG160');
const canKill = (s, E) => (t) => !E.hasKw(s, t, 'indestructible') && !s.floor.cantLeave?.(s, t, E);
const canMove = (s, E) => (t) => !s.floor.cantLeave?.(s, t, E);
// AI が 宝具を つかう ときの 〔 〕の 数の よそう（黒の聖杯・モルガンの「1つ 上がる」も 入れる）
const ocN = (s, p, k, n) => (n + [...s.P.bf, ...s.E.bf].filter((q) => q.attached === p.uid && q.def.grail).length) * Math.min(3, k + (s[p.side].flags.ocUp || 0));
// AI が 宝具を つかう とき（人は いつでも つかえる）
const needFoe = (s, p, E) => foes(s, E).length > 0;
const preCombat = (s, p, E, ctx) => ctx.phase === 1 && E.readyAttackers(s).length > 0; // 戦闘の まえ（メイン1）に つかう もの
const selfSwing = (s, p, E, ctx) => ctx.phase === 1 && E.readyAttackers(s).includes(p);
// NP を ふやす。てきがわ（オンラインバトルの あいての ターン いがい）では 宝具を じどうで つかわず、ためるだけ
function gainNP(s, E, p, n) {
  if (p.side === 'P') return addNP(s, E, p, n);
  if (!E.onBf(s, p) || !p.def.npFx) return;
  const was = p.np || 0;
  p.np = Math.min(NP_MAX, was + n);
  E.L(s, `${p.def.name}：NP ${was} ＋ ${n} ＝ ${p.np}`);
}
// 戦場に 出たとき、あなたの サーヴァント1体の NP ＋n（人は 唱える ときに えらぶ。o.self：えらばなければ これ。o.after：その サーヴァントに）
const etbNP = (n, o = {}) => ({
  tgt: [{ side: 'P', min: 0, label: `NP ＋${n} する サーヴァント${o.self ? '（えらばないと これ）' : ''}`, filter: (s, E, q) => isServant(q) && !!q.def.npFx }],
  etb: (s, p, E, ch) => {
    if (p.side !== 'P') return;
    o.before?.(s, p, E);
    let t = chosen1(ch);
    if (t && !E.onBf(s, t)) t = undefined;
    if (t === undefined) t = bestServant(s, E, o.self ? undefined : p);
    if (!t && o.self) t = p;
    if (t) { addNP(s, E, t, n); o.after?.(s, p, E, t); }
  },
});
const tapBiggest = (s, E, n, f = () => true) => { for (const t of byPow(s, E, foes(s, E, (q) => !q.frozen && f(q))).slice(0, n)) detain(s, E, t); };
const sgn = (n) => (n < 0 ? `−${-n}` : `＋${n}`);
const KWJ = { hexproof: '呪禁（じゅきん）', trample: 'トランプル', indestructible: '破壊不能（はかいふのう）' };
const ptMsg = (a, b, kws = []) => `${sgn(a)}/${sgn(b)}${kws.length ? ` と ${kws.map((k) => KWJ[k] || k).join('・')}` : ''}`;
// あなたの クリーチャー みんな・1体に ＋a/＋b（ログに 出す）
const pumpAll = (s, E, a, b, kws = []) => { for (const q of mine(s, E)) E.pump(q, a, b, kws); E.L(s, `あなたの クリーチャーは みんな ${ptMsg(a, b, kws)}`); };
const pumpOne = (s, E, q, a, b, kws = []) => { if (!q || !E.onBf(s, q)) return; E.pump(q, a, b, kws); E.L(s, `${q.def.name}：${ptMsg(a, b, kws)}`); };
const counters = (s, E, q, n) => { if (!q || !E.onBf(s, q)) return; E.addCounters(s, q, n); E.L(s, `${q.def.name} に ＋1/＋1カウンター ${n}こ`); };
// あいての クリーチャーの 中から ランダムに 1体（p の もち主から 見た 敵）
const randomEnemyCreature = (s, E, side) => { const list = E.creatures(s, side === 'P' ? 'E' : 'P').filter((t) => side !== 'P' || !s.floor.untargetable?.(s, t, E)); return list.length ? list[Math.floor(s.rng() * list.length)] : null; };
const minusRandom = (s, E, side) => { const t = randomEnemyCreature(s, E, side); if (t) { E.addMinus(s, t, 1, side); E.sba(s); } };
// 1体に n 点（コモンは ランダム：foeBest が pickMode に したがう）
const hitOne = (s, E, n) => { const b = foeBest(s, E, n) || foeBest(s, E); if (b) hit(s, E, b.t, n); };

// トークン（FG93 ワルキューレ・FG124 式神・FG130 コウモリ）
const TK = {
  valkyrie: cr('t_valkyrie', 'ワルキューレ', null, 'W', 0, 1, 1, ['ワルキューレ'], ['flying']),
  shikigami: cr('t_shikigami', '式神（しきがみ）', null, 'K', 0, 1, 1, ['式神']),
  bat: cr('t_bat', 'コウモリ', null, 'K', 0, 1, 1, ['bat'], ['flying']),
};

// クリプター（FG98・FG112・FG123・FG138・FG152）：第1弾の マスターと 同じ（コスト −1・かさならない）＋ その 色の サーヴァントが 宝具を つかうたび、つかった NP 100 に つき f
// 2026-11-01：はじめは どの サーヴァントでも にしたが、第2弾だけの パックで クリア 38% と 第1弾（33%）より つよかったので、クリプターの 色の サーヴァント だけに した（35%）
const crypter = (col, f) => ({
  ...master,
  onHogu: (s, q, p, E, k) => {
    if (q.side !== 'P' || !E.colorsOf(p.def).includes(col)) return;
    E.L(s, `${q.def.name}：つかった NP 100 に つき → ${k}回`);
    for (let i = 0; i < k && !s.over; i++) f(s, q, p, E);
    E.sba(s);
  },
});

// NP を 2倍に する（FG118 ダブルチャージ）
function doubleNP(s, E, t) {
  if (!t || !E.onBf(s, t)) return;
  const n = t.np || 0;
  E.L(s, `ダブルチャージ：NP ${n} × 2 ＝ ${n * 2}${n * 2 > NP_MAX ? `（さいだい ${NP_MAX}）` : ''}`);
  if (n > 0) addNP(s, E, t, n);
}
// 100 の まとまりが いくつ ふえるか（NP 150 → 300 は 1 → 3 で 2）
const ocUpBy = (n) => Math.floor(Math.min(NP_MAX, 2 * n) / 100) - Math.floor(n / 100);

// 宝具の 装備品（FG171〜FG185。2026-11-05）：第1弾の FG76〜FG90 と 同じ phantasm（シャドウ召喚 1）
// 「その サーヴァント」の こうかは NP の ある サーヴァントに ついて いる ときだけ（FG167 虚数魔術と 同じ）
const npHost = (h) => !!h && isServant(h) && !!h.def.npFx;
// 装備している サーヴァントが 宝具を つかうたび（set10.js の fireNP が 同じ 側の パーマネントの onHogu を よぶ。k ＝ つかった NP の 100 の 数）
const hostHogu = (f) => ({
  onHogu: (s, q, p, E, k) => {
    if (q.side !== 'P' || q.attached !== p.uid || !E.onBf(s, q)) return;
    f(s, q, p, E, k);
    E.sba(s);
  },
});
// 装備品の 名前（ログ用。ふりがなと ★を とる）
const eqName = (q) => q.def.name.replace(/（[ぁ-ゖー]+）|《[^《》\n]*》|｜/g, '').replace(/^★/, '');

export const S14 = {
  // ---- 白 ----
  FG91: {
    ...etbNP(50),
    ...ocNP(40, (s, E, p) => {
      for (const q of mine(s, E)) E.pump(q, 0, 0, ['indestructible']);
      E.L(s, 'きみをいだく 希望（きぼう）の 星（ほし）：この ターン みんな 破壊不能（はかいふのう）');
      for (const q of servants(s, E)) if (q !== p) addNP(s, E, q, oc(p, 20));
    }),
  },
  FG92: ocNP(40, (s, E, p) => {
    for (const t of theirs(s, E)) if (t.ctr > 0) { E.L(s, `${t.def.name} の ＋1/＋1カウンターを ${t.ctr}こ とりのぞいた`); t.ctr = 0; }
    allFoes(s, E, oc(p, 2));
  }, { npAI: needFoe }),
  FG93: ocNP(40, (s, E, p) => E.token(s, p.side, TK.valkyrie, oc(p, 2))),
  FG94: ocNP(50, (s, E, p) => { for (const t of theirs(s, E)) E.pump(t, -oc(p, 2), 0); E.L(s, `てきの クリーチャーは みんな −${oc(p, 2)}/−0`); }, { npAI: (s, p, E, ctx) => preCombat(s, p, E, ctx) && needFoe(s, p, E) }),
  FG95: ocNP(40, (s, E, p) => pumpAll(s, E, oc(p, 1), oc(p, 1)), { npAI: preCombat }),
  FG96: ocNP(50, (s, E, p) => pumpOne(s, E, p, oc(p, 2), 0), {
    npAI: selfSwing,
    onDie: (s, p, E) => { if (p.side !== 'P') return; const t = bestServant(s, E); if (t) addNP(s, E, t, 50); },
  }),
  FG97: ocNP(40, (s, E, p) => tapBiggest(s, E, oc(p, 1)), { npAI: (s, p, E) => foes(s, E, (t) => !t.frozen).length > 0 }),
  FG98: crypter('W', (s, q, p, E) => E.gain(s, 2)),
  FG99: ocNP(40, (s, E, p) => E.gain(s, oc(p, 3)), { onBlock: (s, p, E) => gainNP(s, E, p, 40) }),
  FG100: ocNP(50, (s, E, p) => { const t = E.bestBuffTarget(s, null); if (t) { E.target(s, t); counters(s, E, t, oc(p, 1)); } }),
  FG101: ocNP(50, (s, E, p) => pumpAll(s, E, 0, oc(p, 2)), { npAI: preCombat }),
  FG102: { etb: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', T.food); } },
  FG103: { trick: { kind: 'single', p: 0, t: 3 }, singleRun: (s, E, q) => { pumpOne(s, E, q, 0, 3); E.gain(s, 2); } },
  FG104: { trick: { kind: 'single', p: 0, t: 20 }, singleRun: (s, E, q) => { q.shieldT = s.turn; E.L(s, `オシリスの 塵（ちり）：${q.def.name} に あたえられる ダメージは この ターン 0`); } },

  // ---- 青 ----
  FG105: ocNP(40, (s, E, p) => pumpAll(s, E, oc(p, 1), 0, ['hexproof']), {
    npAI: preCombat,
    upkeep: (s, p, E) => { if (p.side !== 'P') return; const t = bestServant(s, E, p); if (t) addNP(s, E, t, 50); },
  }),
  FG106: ocNP(40, (s, E, p) => { const n = oc(p, 2); for (const t of theirs(s, E)) if (E.power(s, t) <= n) detain(s, E, t); }, {
    npAI: (s, p, E, ctx, k) => foes(s, E, (t) => !t.frozen && E.power(s, t) <= ocN(s, p, k, 2)).length > 0,
  }),
  FG107: ocNP(36, (s, E, p) => { for (const t of byPow(s, E, foes(s, E, canMove(s, E))).slice(0, oc(p, 1))) { E.target(s, t); E.bounce(s, t); } E.sba(s); }, { npAI: needFoe }),
  FG108: ocNP(40, (s, E, p) => { for (const t of theirs(s, E)) E.pump(t, 0, -oc(p, 1)); E.L(s, `てきの クリーチャーは みんな −0/−${oc(p, 1)}`); E.sba(s); }, {
    npAI: needFoe,
    etb: (s, p, E) => { if (p.side === 'P') E.scry(s, 3); },
  }),
  FG109: ocNP(40, (s, E, p) => {
    const ready = E.readyAttackers(s);
    for (const q of byPow(s, E, ready.length ? ready : mine(s, E)).slice(0, oc(p, 2))) { q.flags.turn.unblockable = true; E.L(s, `${q.def.name} は この ターン ブロックされない`); }
  }, { npAI: preCombat }),
  // メルトリリス（2026-11-07：U → L・青）：ほかの クリーチャー ぜんぶ（敵も 味方も）−〔1〕/−〔1〕、その 数の ＋1/＋1カウンター。
  // 2026-11-07（あと）：攻撃するたび メルトウイルス（敵1体に −1/−1カウンター、じぶんに ＋1/＋1カウンター）。サラスヴァティー・メルトアウト（FG176）が あると 味方は −〔1〕/−〔1〕を 受けず、その ぶん 装備している クリーチャーが ＋
  FG110: ocNP(40, (s, E, p) => {
    const n = oc(p, 1), others = [...s.P.bf, ...s.E.bf].filter((q) => q !== p && E.isCreature(q));
    for (const q of others) E.pump(q, -n, -n);
    E.L(s, `${p.def.name}：ほかの クリーチャー ${others.length}体を −${n}/−${n}`);
    E.sba(s);
    if (others.length) E.addCounters(s, p, others.length);
  }, {
    npAI: (s, p, E) => theirs(s, E).length > 0 && (guarded(s, p.side) || theirs(s, E).length >= mine(s, E).filter((q) => q !== p).length),
    trigTgt: { on: 'attack', label: '−1/−1カウンターを おく てきの クリーチャー' },
    onAttack: (s, p, E) => {
      if (p.side !== 'P') return;
      const pk = E.takePick(s, p), t = pk && E.onBf(s, pk) ? pk : (foeBest(s, E, 1) || foeBest(s, E))?.t;
      if (t) { E.target(s, t); E.addMinus(s, t, 1); E.L(s, `メルトウイルス：${t.def.name} に −1/−1カウンター`); E.sba(s); }
      E.addCounters(s, p, 1);
    },
  }),
  FG111: ocNP(40, (s, E, p) => {
    const n = oc(p, 2), t = topFoe(s, E, (q) => E.stealable(s, q) && !q.def.head && E.power(s, q) <= n);
    if (t && E.onBf(s, t) && t.side === 'E') { E.target(s, t); E.steal(s, t, p); }
  }, { npAI: (s, p, E, ctx, k) => !!topFoe(s, E, (q) => E.stealable(s, q) && !q.def.head && E.power(s, q) <= ocN(s, p, k, 2)) }),
  FG112: crypter('U', (s, q, p, E) => { const t = topFoe(s, E, (x) => !x.tapped); if (t) { t.tapped = true; E.L(s, `${t.def.name} を タップ`); } }),
  FG113: np(50, (s, E) => { const b = foeBest(s, E, 99, canMove(s, E)); if (b && E.onBf(s, b.t)) { E.target(s, b.t); E.bounce(s, b.t); E.sba(s); } }, {
    npAI: needFoe,
    etb: (s, p, E) => { if (p.side === 'P') regrow(s, E, (d) => (d.types || []).some((k) => k === 'instant' || k === 'sorcery')); },
  }),
  FG114: ocNP(50, (s, E, p) => hitOne(s, E, oc(p, 2)), { npAI: needFoe }),
  FG115: ocNP(50, (s, E, p) => { pumpOne(s, E, p, oc(p, 2), 0); p.flags.turn.unblockable = true; E.L(s, `${p.def.name} は この ターン ブロックされない`); }, { npAI: selfSwing }),
  FG116: etbNP(20, { before: (s, p, E) => E.scry(s, 2) }),
  FG117: {
    play: (s, E) => {
      const list = servants(s, E).filter((q) => q.def.npFx);
      if (!list.length) return null;
      const n = list.length >= 3 ? 30 : 20, ready = list.filter((q) => (q.np || 0) % 100 + n >= 100).length;
      return { score: 2 + list.length * 2 + ready * 4, run: () => { const m = servants(s, E).length >= 3 ? 30 : 20; E.L(s, `アーツチェイン：サーヴァント ${servants(s, E).length}体`); for (const q of servants(s, E)) addNP(s, E, q, m); } };
    },
  },
  FG118: {
    play: (s, E) => {
      const b = servants(s, E).filter((q) => q.def.npFx && (q.np || 0) > 0).map((q) => ({ q, up: ocUpBy(q.np) })).sort((a, c) => c.up - a.up || (c.q.np || 0) - (a.q.np || 0))[0];
      return b && b.up > 0 ? { score: 3 + 4 * b.up, run: () => doubleNP(s, E, b.q) } : null;
    },
    tgt: [{ side: 'P', label: 'NP を 2ばいに する サーヴァント', filter: (s, E, q) => isServant(q) && !!q.def.npFx }],
    apply: (s, E, [[t]]) => { if (t) E.target(s, t); doubleNP(s, E, t); },
  },

  // ---- 黒 ----
  FG119: ocNP(40, (s, E, p) => { for (const t of byPow(s, E, foes(s, E, canKill(s, E))).slice(0, oc(p, 1))) { E.target(s, t); killIt(s, E, t); } }, {
    npAI: (s, p, E) => foes(s, E, canKill(s, E)).length > 0,
    onHurt: (s, p, n, src, E) => gainNP(s, E, p, 20),
  }),
  FG120: ocNP(40, (s, E, p, t) => {
    const n = oc(p, 2), b = t ? { t } : (foeBest(s, E, n) || foeBest(s, E));
    if (b && E.onBf(s, b.t)) { E.target(s, b.t); E.addMinus(s, b.t, n); E.sba(s); }
  }, { npAI: needFoe, npTgt: { side: 'E', label: '−1/−1カウンターを おく クリーチャー' } }),
  FG121: ocNP(40, (s, E, p) => { allFoes(s, E, oc(p, 1)); regrow(s, E, isCr); }, { npAI: (s, p, E) => needFoe(s, p, E) || s.P.gy.some((c) => isCr(c.def)) }),
  FG122: ocNP(50, (s, E, p) => { const n = oc(p, 1); allFoes(s, E, n); if (E.onBf(s, p)) { E.damage(s, p, n, null); E.sba(s); } }, { npAI: needFoe, onDie: S10.FG07.onDie }),
  FG123: crypter('K', (s, q, p, E) => minusRandom(s, E, q.side)),
  FG124: ocNP(40, (s, E, p) => { const n = oc(p, 2), t = killTop(s, E, n); if (t) { E.target(s, t); E.L(s, `${t.def.name}：${ptMsg(-n, -n)}`); shrink(s, E, t, n, n); } }, {
    npAI: needFoe,
    etb: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', TK.shikigami, 2); },
  }),
  FG125: { ...etbNP(50), ...ocNP(40, (s, E, p) => { E.hitEnemy(s, oc(p, 2), null); E.gain(s, oc(p, 2)); }) },
  FG126: ocNP(40, (s, E, p) => { const n = oc(p, 1); for (const t of [...theirs(s, E)]) if (E.onBf(s, t) && E.pt(s, t)[1] <= n) killIt(s, E, t); }, {
    npAI: (s, p, E, ctx, k) => theirs(s, E).some((t) => E.pt(s, t)[1] <= ocN(s, p, k, 1) && canKill(s, E)(t)),
  }),
  FG127: ocNP(40, (s, E, p) => {
    const n = oc(p, 2), c = bestIn(s.P.gy, (x) => isCr(x.def) && x.def.cost <= n);
    if (!c) { E.L(s, `ぼちに コスト ${n} いかの クリーチャーが ない`); return; }
    s.P.gy.splice(s.P.gy.indexOf(c), 1);
    E.L(s, `ぼちから せんじょうへ：${c.def.name}（コスト ${c.def.cost} ≦ ${n}）`);
    E.enter(s, 'P', c.def, { card: c.def });
  }, { npAI: (s, p, E, ctx, k) => p.side === 'P' && s.P.gy.some((x) => isCr(x.def) && x.def.cost <= ocN(s, p, k, 2)) }),
  FG128: np(50, (s, E, p) => {
    const t = topFoe(s, E, canKill(s, E));
    if (t) { E.target(s, t); killIt(s, E, t); }
    if (E.onBf(s, p)) E.leave(s, p, 'gy', { died: true });
    E.sba(s);
  }, { npAI: (s, p, E) => { const t = topFoe(s, E, canKill(s, E)); return !!t && E.power(s, t) >= 2; } }),
  FG129: ocNP(50, (s, E, p) => E.token(s, p.side, T.treasure, oc(p, 2))),
  FG130: ocNP(50, (s, E, p) => E.token(s, p.side, TK.bat, oc(p, 1))),
  FG131: ocNP(50, (s, E, p) => { const n = oc(p, 2), b = foeBest(s, E, 99, (t) => E.power(s, t) <= n && canKill(s, E)(t)); if (b) { E.target(s, b.t); killIt(s, E, b.t); } }, {
    npAI: (s, p, E, ctx, k) => foes(s, E, (t) => E.power(s, t) <= ocN(s, p, k, 2) && canKill(s, E)(t)).length > 0,
  }),
  FG132: { onDie: (s, p, E) => { if (p.side !== 'P') return minusRandom(s, E, p.side); const b = foeBest(s, E, 1) || foeBest(s, E); if (b) { E.addMinus(s, b.t, 1); E.sba(s); } } }, // じぶんで えらぶ（AI が いちばん よい あいて）
  FG133: foe1('−1/−1カウンターを 2こ おく クリーチャー', (s, E, t) => { if (t && E.onBf(s, t)) { E.addMinus(s, t, 2); E.sba(s); } }, { n: 2 }),

  // ---- 赤 ----
  FG134: ocNP(40, (s, E, p) => {
    const t = killTop(s, E, oc(p, 4));
    if (t) hit(s, E, t, oc(p, 4));
    E.hitEnemy(s, oc(p, 2), null);
  }, { etb: (s, p, E) => { if (p.side === 'P') addNP(s, E, p, 50); } }),
  FG135: ocNP(50, (s, E, p) => pumpOne(s, E, p, oc(p, 3), 0), { npAI: selfSwing }), // 2026-11-07：R → L（3/3・NP ＋50・＋〔3〕）
  FG136: ocNP(40, (s, E, p) => { const n = oc(p, 3); E.L(s, `三千世界（さんだんうち）：1点 × ${n}回`); for (let i = 0; i < n && !s.over; i++) { const t = randomFoe(s, E); if (t) hit(s, E, t, 1); } }),
  FG137: ocNP(40, (s, E, p) => allFoes(s, E, oc(p, 2)), { npAI: needFoe }),
  FG138: crypter('R', (s, q, p, E) => E.hitEnemy(s, 1, null)),
  FG139: ocNP(40, (s, E, p) => E.hitEnemy(s, oc(p, 3), null), { onHurt: (s, p, n, src, E) => gainNP(s, E, p, 30) }),
  FG140: ocNP(50, (s, E, p) => {
    const n = oc(p, 1), t = killTop(s, E, 3 * n);
    if (!t) return;
    E.target(s, t);
    E.L(s, `無明三段突（むみょうさんだんづ）き：${n}点 × 3回`);
    for (let i = 0; i < 3 && E.onBf(s, t); i++) { E.damage(s, t, n, null); E.sba(s); }
  }, { npAI: needFoe }),
  FG141: ocNP(50, (s, E, p) => pumpOne(s, E, p, oc(p, 2), 0, ['trample']), { npAI: selfSwing }),
  FG142: ocNP(40, (s, E, p) => { E.hitEnemy(s, oc(p, 2), null); const t = killTop(s, E, oc(p, 2)); if (t) hit(s, E, t, oc(p, 2)); }),
  FG143: ocNP(50, (s, E, p) => hitOne(s, E, oc(p, 2)), { npAI: needFoe }),
  FG144: np(50, (s, E, p) => { E.pump(p, 0, 0, ['indestructible']); E.L(s, `不滅（ふめつ）の 誠（まこと）：${p.def.name} は この ターン 破壊不能（はかいふのう）`); }, {
    npAI: selfSwing,
    anthem: (s, q, p) => (p === q && (s[q.side].life ?? 99) <= 10 ? [2, 0] : null),
  }),
  FG145: ocNP(50, (s, E, p) => E.hitEnemy(s, oc(p, 2), null)),
  FG146: np(50, (s, E, p) => { allFoes(s, E, 1); E.token(s, p.side, T.treasure); }),
  FG147: np(50, (s, E, p) => { allFoes(s, E, 2); if (E.onBf(s, p)) E.leave(s, p, 'gy', { died: true }); E.sba(s); }, {
    npAI: (s, p, E) => { const k = theirs(s, E).filter((t) => E.need(s, t) <= 2); return k.length >= 2 || k.some((t) => E.power(s, t) >= 3); },
  }),
  FG148: {
    trick: { kind: 'mass', p: 1, t: 0 },
    massRun: (s, E) => { const a = mine(s, E).filter((q) => q.attacking).length, n = a >= 3 ? 2 : 1; E.L(s, `バスターチェイン：こうげきして いる クリーチャー ${a}体`); pumpAll(s, E, n, 0); },
  },

  // ---- 緑 ----
  FG149: {
    ...etbNP(100, { after: (s, p, E, t) => { t.frozen = true; E.L(s, `夢（ゆめ）の おわり：${t.def.name} は つぎの ターン アンタップしない`); } }),
    ...ocNP(40, (s, E, p) => tapBiggest(s, E, oc(p, 2)), { npAI: (s, p, E) => foes(s, E, (t) => !t.frozen).length > 0 }),
  },
  FG150: ocNP(40, (s, E, p) => counters(s, E, p, oc(p, 2))),
  FG151: ocNP(40, (s, E, p) => { const n = oc(p, 2); for (const t of [...theirs(s, E)]) if (E.onBf(s, t) && E.pt(s, t)[1] <= n) killIt(s, E, t); }, {
    npAI: (s, p, E, ctx, k) => theirs(s, E).some((t) => E.pt(s, t)[1] <= ocN(s, p, k, 2) && canKill(s, E)(t)),
  }),
  FG152: crypter('G', (s, q, p, E) => counters(s, E, p, 1)),
  FG153: ocNP(40, (s, E, p) => pumpAll(s, E, oc(p, 2), 0, ['trample']), { npAI: preCombat }),
  FG154: {
    ...etbNP(50, { self: true }),
    ...ocNP(40, (s, E, p) => {
      const n = oc(p, 2);
      E.hitEnemy(s, n, null);
      for (const t of [...theirs(s, E)]) if (E.onBf(s, t) && E.hasKw(s, t, 'flying')) E.damage(s, t, n, null);
      E.sba(s);
    }),
  },
  FG155: ocNP(40, (s, E, p) => { E.gain(s, oc(p, 3)); regrow(s, E, isCr); }),
  FG156: ocNP(40, (s, E, p) => {
    const n = oc(p, 4), t = topFoe(s, E, (q) => E.power(s, q) <= n && canKill(s, E)(q));
    if (t) { E.target(s, t); killIt(s, E, t); }
    counters(s, E, p, oc(p, 1));
  }),
  FG158: etbNP(20),
  FG159: ocNP(50, (s, E, p) => counters(s, E, p, oc(p, 1))),
  FG160: np(50, (s, E, p, t) => { const b = t ? { t } : (foeBest(s, E, E.power(s, p)) || foeBest(s, E)); if (b && E.onBf(s, b.t) && E.onBf(s, p)) { E.target(s, b.t); E.fight(s, p, b.t); } }, { npAI: needFoe, npTgt: { side: 'E', label: 'かくとうする てきの クリーチャー' } }), // じぶんで えらぶ（PICK_FREE。2026-11-06）
  FG161: ocNP(50, (s, E, p) => hitOne(s, E, oc(p, 2)), { npAI: needFoe }),
  FG162: { trick: { kind: 'single', p: 2, t: 2 }, singleRun: (s, E, q) => { pumpOne(s, E, q, 2, 2); if (isServant(q)) addNP(s, E, q, 20); } },

  // ---- 2色 ----
  FG163: ocNP(40, (s, E, p) => {
    for (const t of theirs(s, E)) t.tapped = true;
    E.L(s, 'てきの クリーチャーを ぜんぶ タップ');
    for (const q of servants(s, E)) if (q !== p) addNP(s, E, q, oc(p, 10));
  }, { anthem: (s, q, p) => (p !== q && isServant(p) ? [1, 1] : null) }),
  FG164: ocNP(40, (s, E, p) => {
    allFoes(s, E, oc(p, 2));
    s[p.side].flags.ocUp = 1;
    E.L(s, 'はや 辿（たど）り 着（つ）けぬ 理想郷（りそうきょう）：つぎの オーバーチャージが 1つ 上がる');
  }, { etb: (s, p, E) => { if (p.side === 'P') detain(s, E, biggest(s, E, (t) => !t.frozen && !s.floor.untargetable?.(s, t, E))); } }),
  FG165: ocNP(40, (s, E, p) => {
    const n = oc(p, 1) * E.power(s, p);
    E.L(s, `${p.def.name}：パワー ${E.power(s, p)} × ${oc(p, 1)} ＝ ${n}点を わりふる`);
    for (const d of E.divide(s, n, foes(s, E))) E.damage(s, d.t, d.n, null);
    E.sba(s);
  }, { npAI: needFoe, anthem: (s, q, p) => (p === q && s[q.side].bf.some((x) => x.def.id === 'FG122') ? [2, 2] : null) }),

  // ---- 無色 ----
  // 黒の聖杯：〔 〕の ＋1 は set10.js の fireNP（def.grail）
  FG166: {
    equip: 1, eqP: 2, grail: true,
    upkeep: (s, p, E) => { if (p.side === 'P' && p.attached) { E.L(s, '黒（くろ）の 聖杯（せいはい）：ライフ −1'); E.hurt(s, 1); } },
  },
  FG167: { equip: 1, eqP: 1, eqT: 1, onEquip: (s, p, host, E) => { if (isServant(host)) addNP(s, E, host, 60); } },
  FG168: {
    upkeep: (s, p, E) => {
      if (p.side !== 'P') return;
      const t = servants(s, E).filter((q) => q.def.npFx).sort((a, b) => (a.np || 0) - (b.np || 0))[0];
      if (t) addNP(s, E, t, 20);
    },
  },
  FG169: {
    acts: [{
      cost: 0, sac: true, when: [1, 2], label: 'ぼちに おいて 上から 3まい 見る（サーヴァントを 1まい てふだへ）',
      play: (s, p, E, ctx) => (s.P.lib.length && (ctx.human || ctx.phase === 2 || s.P.hand.length <= 3) ? { score: 3, run: () => { E.leave(s, p, 'gy'); dig(s, E, 3, 1, (d) => isCr(d) && (d.sub || []).includes('servant')); } } : null),
    }],
  },
  FG170: {
    acts: [{
      cost: 0, sac: true, when: [1, 2], label: 'ぼちに おいて クリーチャー1体を アンタップ',
      play: (s, p, E, ctx) => {
        const t = ctx.phase === 2 && theirs(s, E).some((q) => E.power(s, q) >= 2) ? mine(s, E).filter((q) => q.tapped && q !== p).sort((a, b) => E.pt(s, b)[1] - E.pt(s, a)[1])[0] : null;
        return t ? { score: 2, run: () => { E.leave(s, p, 'gy'); t.tapped = false; E.L(s, `${t.def.name} を アンタップ`); } } : null;
      },
      tgt: [{ side: 'P', label: 'アンタップする クリーチャー', filter: (s, E, q) => q.tapped }],
      apply: (s, E, [[t]], x, p) => { E.leave(s, p, 'gy'); if (t && E.onBf(s, t)) { t.tapped = false; E.L(s, `${t.def.name} を アンタップ`); } },
    }],
  },

  // ---- 宝具（ほうぐ・装備品。FG171〜FG185。2026-11-05）：第1弾の FG76〜FG90 と 同じ 形 ＋ NP・オーバーチャージ ----
  // 白：ぜんたい・まもる
  FG171: phantasm({
    equip: 2, anthem: allWhile(1, 1),
    onEquip: (s, q, host, E) => {
      const list = servants(s, E).filter((x) => x.def.npFx);
      if (!list.length) return;
      E.L(s, `${eqName(q)}：サーヴァント ${list.length}体の NP ＋20（20 × ${list.length} ＝ ${20 * list.length}）`);
      for (const x of list) addNP(s, E, x, 20);
    },
  }),
  FG172: phantasm({ equip: 1, eqP: 1, grant: gives('first'), ...hostHogu((s, q, p, E, k) => { E.L(s, `${eqName(q)}：NP 100 が ${k}つ → ＋2 × ${k} ＝ ＋${2 * k}`); pumpOne(s, E, p, 2 * k, 0); }) }),
  FG173: phantasm({
    equip: 1, anthem: allWhile(0, 1),
    ...hostHogu((s, q, p, E) => { for (const x of mine(s, E)) E.pump(x, 0, 0, ['indestructible']); E.L(s, `${eqName(q)}：この ターン みんな 破壊不能（はかいふのう）`); }),
  }),
  // 青：飛行・タップ・パワーを うばう
  FG174: phantasm({
    equip: 1, eqP: 1, eqT: 1, grant: gives('flying'),
    upkeep: (s, q, E) => { if (q.side !== 'P') return; const h = hostOf(s, q); if (npHost(h) && E.onBf(s, h)) addNP(s, E, h, 30); },
  }),
  FG175: phantasm({
    equip: 1, eqP: 1, eqT: 1,
    onHostAttack: (s, q, host, E) => {
      if (q.side !== 'P') return;
      const t = topFoe(s, E, (x) => !x.tapped);
      if (t) { t.tapped = true; E.L(s, `${eqName(q)}：${t.def.name} を タップ`); }
    },
  }),
  // サラスヴァティー・メルトアウト（メルトリリスの 宝具。2026-11-07 つくりなおし。ユーザーが きめた）：
  // 装備されて いる あいだ 味方は マイナスの 修整を 受けず、その ぶん 装備している クリーチャーが プラス（game.js の minusGuard）。
  // 2：すべての クリーチャー（敵も 味方も）−1/−0。味方の ぶんは 装備している クリーチャーに ＋1/＋0 ずつ
  FG176: phantasm({
    equip: 1, eqP: 1, minusGuard: true,
    acts: [{
      cost: 2, when: [1, 2], label: 'すべての クリーチャー −1/−0（ターン終了時まで）',
      play: (s, p, E, ctx) => {
        const n = theirs(s, E).filter((q) => E.power(s, q) > 0).length;
        if (ctx.human) return [...s.P.bf, ...s.E.bf].some((q) => E.isCreature(q)) ? { score: 1, run: () => melt1(s, E, p) } : null; // 人は いつでも（てきの ターンの まども）
        // AI：装備されて いる とき、戦闘の まえに（てきの パワーが へり、装備している クリーチャーが ＋）
        return n && guarded(s, p.side) && ctx.phase === 1 ? { score: 2 + n + mine(s, E).length, run: () => melt1(s, E, p) } : null;
      },
    }],
  }),
  // 黒：−1/−1カウンター・NP・墓地
  FG177: phantasm({
    equip: 1, eqP: 2, grant: gives('lifelink'), // 絆魂は 2026-11-05 の シミュレーションで 足した（第1弾の 死告天使より 弱かった。バーヴァン・シーは 血を すう 妖精）
    hostTrig: { spec: { side: 'E', label: '−1/−1カウンターを おく 敵（てき）の クリーチャー' } }, // 人は 攻撃の ときに えらぶ（battle.js の preTrig）。AI は パワーが いちばん 大きい もの
    onHostAttack: (s, q, host, E) => {
      const tp = q.trigPick; q.trigPick = null;
      if (q.side !== 'P') return;
      const t = tp?.t && tp.t !== 'face' && E.onBf(s, tp.t) ? tp.t : topFoe(s, E);
      if (!t) return;
      E.target(s, t); E.addMinus(s, t, 1); E.sba(s);
    },
  }),
  FG178: phantasm({ equip: 1, eqP: 1, eqT: 1, grant: gives('haste'), onHostAttack: (s, q, host, E) => { if (q.side === 'P' && npHost(host)) addNP(s, E, host, 20); } }),
  FG179: phantasm({ equip: 1, eqP: 1, eqT: 1, ...hostHogu((s, q, p, E) => { if (!regrow(s, E, isCr)) E.L(s, `${eqName(q)}：ぼちに クリーチャーが ない`); }) }),
  // 赤：パワー・ダメージ
  FG180: phantasm({
    equip: 2, eqP: 3,
    ...hostHogu((s, q, p, E, k) => { E.L(s, `${eqName(q)}：NP 100 が ${k}つ → てきの クリーチャー みんなに 1点 × ${k}回`); for (let i = 0; i < k && !s.over; i++) allFoes(s, E, 1); }),
  }),
  FG181: phantasm({
    equip: 1, eqP: 2,
    ...hostHogu((s, q, p, E) => {
      const n = E.onBf(s, p) ? E.power(s, p) : 0, t = killTop(s, E, n); // たおせる なかで いちばん 大きい（2026-11-06）
      if (!t || n <= 0) return;
      E.L(s, `${eqName(q)}：${p.def.name} の パワー ${n} → ${n}点`);
      hit(s, E, t, n);
    }),
  }),
  FG182: phantasm({ equip: 1, grant: gives('trample'), eqPT: (s, q, p, E) => [s[q.side].bf.filter((x) => isServant(x) && E.isCreature(x)).length, 0] }),
  // 緑：大きな からだ・＋1/＋1カウンター・NP
  FG183: phantasm({
    equip: 2, eqP: 2, eqT: 2, grant: gives('trample'),
    ...hostHogu((s, q, p, E, k) => {
      for (let i = 0; i < k; i++) {
        const t = topFoe(s, E, (x) => E.pt(s, x)[1] <= 2 && canKill(s, E)(x));
        if (!t) break;
        E.L(s, `${eqName(q)}：${t.def.name}（タフネス ${E.pt(s, t)[1]} ≦ 2）を はかい`);
        E.target(s, t); killIt(s, E, t);
      }
    }),
  }),
  FG184: phantasm({ equip: 1, eqP: 1, eqT: 1, onHostAttack: (s, q, host, E) => { if (q.side === 'P') counters(s, E, host, 1); } }),
  FG185: phantasm({
    equip: 2, eqP: 1, eqT: 1,
    onEquip: (s, q, host, E) => {
      if (!npHost(host) || !E.onBf(s, host)) return;
      addNP(s, E, host, 100);
      host.frozen = true;
      E.L(s, `夢（ゆめ）の おわり：${host.def.name} は つぎの ターン アンタップしない`);
    },
  }),
};
