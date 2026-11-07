// 番外編「Fate/Grand Order」のうごき（名前・コスト・P/T は skel.js、文は docs/EXTRA.md 2章）
// 宝具：攻撃するたび NP が ふえる（さいだい 300）。100 いじょうなら メインフェイズに NP を 100 へらして 宝具の こうか（あいては 自動で えらぶ）
// オーバーチャージ（第2弾 set14.js の サーヴァント。def.oc）：NP を 100・200・300 の どれだけ つかうか えらぶ → 〔 〕の 数が 1倍・2倍・3倍（1ターンに 1回）。docs/EXTRA2_FG.md 2章
import { cr, hit, mine, theirs, isSub, isCr, chosen1, foeBest, killIt, single, dig, foe1 } from './kit.js';

export const isServant = (p) => isSub(p, 'servant');
export const servants = (s, E) => mine(s, E).filter(isServant);
// NP を ふやす（さいだい 300）。宝具は じぶんの メインフェイズに ボタンで つかう（NP −100）。
// てきがわの サーヴァントは 100 で じどう（オーバーチャージの サーヴァントは 1ターンに 1回、つかえる いちばん 大きい 倍で）
export const NP_MAX = 300;
// why：ログの おしまいに 出す わけ（「ダメージを うけた」など）
export function addNP(s, E, p, n, why) {
  if (!p || !E.onBf(s, p) || !p.def.npFx) return;
  const was = p.np || 0;
  p.np = Math.min(NP_MAX, was + n);
  E.L(s, `${p.def.name}：NP ${was} ＋ ${n} ＝ ${p.np}${was + n > NP_MAX ? `（さいだい ${NP_MAX}）` : ''}${why ? `（${why}）` : ''}`);
  if (p.side !== 'P') while (p.np >= 100 && E.onBf(s, p) && !s.over && !ocUsed(s, p)) fireNP(s, E, p, undefined, p.def.oc ? Math.min(3, Math.floor(p.np / 100)) : 1);
}
// オーバーチャージの サーヴァントが この ターン もう 宝具を つかったか（てきがわの ターンでも 見られる ように ターンの 番号で おぼえる）
export const ocUsed = (s, p) => !!p.def.oc && p.ocT === s.turn;
// 〔 〕の 数：n に 黒の聖杯（FG166）の ＋1 を 足して、オーバーチャージの 倍（1・2・3）を かける。npFx の 中で つかう
export const oc = (p, n) => (n + (p.grailPlus || 0)) * (p.ocK || 1);
// 宝具を つかう。k は つかう NP の 100 の 数（オーバーチャージ。第1弾の サーヴァントは いつも 1）
export function fireNP(s, E, p, t, k = 1) {
  const use = 100 * k, was = p.np || 0;
  if (was < use || ocUsed(s, p)) return;
  p.np = was - use;
  let lv = k;
  if (p.def.oc) {
    p.ocT = s.turn; // 1ターンに 1回
    const F = s[p.side].flags;
    if (F.ocUp) { lv = Math.min(3, k + F.ocUp); F.ocUp = 0; } // モルガン（FG164）：つぎの オーバーチャージが 1つ 上がる
    p.grailPlus = [...s.P.bf, ...s.E.bf].filter((q) => q.attached === p.uid && q.def.grail).length; // 黒の聖杯（FG166）
  }
  p.ocK = lv;
  E.L(s, `ほうぐ！ ${p.def.name}（NP ${was} − ${use} ＝ ${p.np}）${p.def.oc ? `オーバーチャージ ×${lv}${lv > k ? `（${k} ＋ ${lv - k}）` : ''}` : ''}`);
  p.def.npFx(s, E, p, t, lv); // t：レアの 宝具で 人が えらんだ あいて（npTgt）。lv：〔 〕の 倍
  p.ocK = 1;
  for (const q of [...s[p.side].bf]) if (q.def.onHogu && E.onBf(s, q)) q.def.onHogu(s, q, p, E, k); // クリプター（第2弾の マスター）：つかった NP 100 に つき
  E.sba(s);
}
// 宝具まで あと なん回 攻撃するか（NP 40・1回 ＋40 → 40 ＋ 40 ＋ 40 ＝ 120 で あと 2回）。100 いじょうは 0
export const npLeft = (p) => { const g = p.def.np || 0, n = p.np || 0; return n >= 100 ? 0 : g ? Math.ceil((100 - n) / g) : null; };
export function npNote(p) {
  const g = p.def.np, n = p.np || 0, k = npLeft(p);
  const how = (p.def.oc
    ? `ほうぐは じぶんの メインフェイズに「ほうぐ」ボタンで つかう。オーバーチャージ：NP を 100・200・300 の どれだけ つかうか えらぶと、〔 〕の 数が 1ばい・2ばい・3ばい（1ターンに 1回）。NP は ${NP_MAX} まで ためられる`
    : `ほうぐは じぶんの メインフェイズに「ほうぐ」ボタンで つかう（NP − 100）。NP は ${NP_MAX} まで ためられる`) + `。ダメージを うけて たおれなければ NP ＋${NP_HIT}`;
  if (!k) return `NP ${n} ／ 100。ほうぐ を ${p.def.oc ? `いま ×${Math.min(3, Math.floor(n / 100))} まで` : `${Math.floor(n / 100)}回`} つかえる。${how}`;
  return `NP ${n} ／ 100。こうげき 1回で ＋${g}。あと ${k}回 こうげき すると ほうぐ（${[n, ...Array(k).fill(g)].filter((x, i) => i || x).join(' ＋ ')} ＝ ${n + g * k}）。${how}`;
}
// 宝具の ボタン（ソーサリーと 同じ：じぶんの メインフェイズ）。AI は たまったら すぐ つかう
const hogu = {
  cost: 0, npUse: true, when: [1, 2], label: 'ほうぐ（NP − 100）', can: (s, p) => (p.np || 0) >= 100, cantWhy: 'NP が 100 に たりない',
  play: (s, p, E) => ((p.np || 0) >= 100 ? { score: 8, run: () => fireNP(s, E, p) } : null),
};
// オーバーチャージの 宝具の ボタン：×1（NP − 100）・×2（NP − 200）・×3（NP − 300）。AI は つかえる いちばん 大きい 倍（点が 8・12・16）
// x.npAI(s, p, E, ctx, k)：AI が いま つかって よいか（戦闘の まえに つかう ものは メイン1 だけ など）。人は いつでも
const hoguK = (k, x) => ({
  cost: 0, npUse: 100 * k, ocK: k, when: [1, 2], label: `ほうぐ ×${k}（NP − ${100 * k}）`,
  can: (s, p) => (p.np || 0) >= 100 * k && !ocUsed(s, p), cantWhy: `NP が ${100 * k} に たりない か、この ターンは もう ほうぐを つかった`,
  play: (s, p, E, ctx = {}) => ((p.np || 0) >= 100 * k && !ocUsed(s, p) && (ctx.human || !x.npAI || x.npAI(s, p, E, ctx, k)) ? { score: 8 + 4 * (k - 1), run: () => fireNP(s, E, p, undefined, k) } : null),
});
// 宝具の ある サーヴァント：npGain は 攻撃した ときに ふえる NP（40 いじょう。30 だと 4回 攻撃が いって ほぼ 出ない）。npFx(s, E, p, t, k)
// x.oc：オーバーチャージ（×1・×2・×3 の ボタン）。x.npTgt：レアの 宝具で 人が あいてを えらぶ
const withTgt = (a, x) => (x.npTgt ? { ...a, tgt: [x.npTgt], apply: (s, E, [[t]], _x, p) => fireNP(s, E, p, t, a.ocK || 1) } : a);
export const np = (npGain, npFx, x = {}) => ({
  np: npGain, npFx, ...x, acts: [...(x.oc ? [1, 2, 3].map((k) => withTgt(hoguK(k, x), x)) : [withTgt(hogu, x)]), ...(x.acts || [])],
  onAttack: (s, p, E, atk, a) => { x.onAttack?.(s, p, E, atk, a); addNP(s, E, p, npGain); },
  onHurt: (s, p, n, src, E) => { x.onHurt?.(s, p, n, src, E); npHit(s, E, p); },
});
// ダメージで NP（2026-11-05。FGO の「ダメージを うけると NP が たまる」）：サーヴァントが ダメージを うけて たおれなければ（のこりの タフネスが 1 いじょう・接死 なし）NP ＋NP_HIT。
// 戦闘でも 呪文でも。どちらの がわも おなじ。てきがわは ためる だけ（宝具は その がわの メインフェイズに。set14.js の gainNP と おなじ）
export const NP_HIT = 20;
function npHit(s, E, p) {
  if (!E.onBf(s, p) || !p.def.npFx || !isServant(p) || p.dt || E.need(s, p) <= 0) return;
  if (p.side === 'P') return addNP(s, E, p, NP_HIT, 'ダメージを うけた');
  const was = p.np || 0;
  p.np = Math.min(NP_MAX, was + NP_HIT);
  E.L(s, `${p.def.name}：NP ${was} ＋ ${NP_HIT} ＝ ${p.np}（ダメージを うけた）`);
}
// NP を いちばん ほしい サーヴァント（宝具に いちばん ちかい もの）。except は のぞく
export const bestServant = (s, E, except) => servants(s, E).filter((p) => p.def.npFx && p !== except).sort((a, b) => (b.np || 0) - (a.np || 0) || E.power(s, b) - E.power(s, a))[0];
export const detain = (s, E, t) => { if (t && E.onBf(s, t)) { t.tapped = true; t.frozen = true; E.L(s, `${t.def.name} を タップ（つぎも おきない）`); } };
export const biggest = (s, E, f = () => true) => theirs(s, E).filter(f).sort((a, b) => E.power(s, b) - E.power(s, a))[0];
export const allFoes = (s, E, n) => { for (const t of [...theirs(s, E)]) E.damage(s, t, n, null); E.sba(s); };

// トークン（FG47 海魔・FG53 アサシン・FG64 王の軍勢）
const TK = {
  kaima: cr('t_kaima', '海魔（かいま）', null, 'U', 0, 1, 1, ['horror']),
  assassin: cr('t_assassin', 'アサシン', null, 'K', 0, 1, 1, ['assassin']),
  soldier22: cr('t_soldier22', '兵士（へいし）', null, 'R', 0, 2, 2, ['soldier']),
};
// サーヴァント1体の NP を ふやす 呪文（いちばん 宝具に ちかい サーヴァント）
const npSpell = (n, more) => ({
  play: (s, E) => { const t = bestServant(s, E); return t ? { score: 3 + Math.round(((t.np || 0) + n >= 100 ? 6 : n / 20)), run: () => { addNP(s, E, t, n); more?.(s, E); } } : null; },
  tgt: [{ side: 'P', label: `NP ＋${n} する サーヴァント`, filter: (s, E, q) => isServant(q) && !!q.def.npFx }],
  apply: (s, E, [[t]]) => { E.target(s, t); addNP(s, E, t, n); more?.(s, E); },
});
// マスター（2026-10-27：エンチャントに）：サーヴァントを 唱える コストと 装備の コストが 1 少なく なる。場に いる さいしょの マスターだけ（かさならない）
export const isMaster = (p) => isSub(p, 'マスター');
export const master = { equipLess: true, costCut: (s, q, d) => (isServant({ def: d }) && s.P.bf.find(isMaster) === q ? 1 : 0) };
// 令呪（デッキ）（2026-11-05）：FGO の カードが ある デッキ（s.P.fgDeck）は、たたかいの はじめに 令呪 3画（s.P.reiju。game.js の REIJU_START）。
// マスター（FG71〜FG75・クリプター。エンチャント）が じぶんの 場に いる とき、じぶんの メインフェイズに 1ターン 1回、1画 つかって サーヴァント1体の NP ＋100（FG16 と おなじ）。
// FG16 の 令呪（その カードの p.seals）とは べつ。増殖では ふえない（カウンターでは ない）。画面は battle.js の showReiju、AI は ai.js の main
const npServants = (s, E) => servants(s, E).filter((q) => !!q.def.npFx);
// いま つかえない わけ（つかえる なら ''）。メインフェイズか どうかは 画面と AI が 見る
export function reijuWhy(s, E) {
  if (!s.P.fgDeck) return 'FGO の カードが デッキに ない';
  if (!(s.P.reiju > 0)) return 'れいじゅが のこって いない';
  if (s.P.flags.reijuT === s.turn) return 'この ターンは もう つかった（1ターンに 1回）';
  if (!s.P.bf.some(isMaster)) return 'マスターが 場に いない';
  if (!npServants(s, E).length) return 'NP の ある サーヴァントが 場に いない';
  return '';
}
export function useReiju(s, E, t) {
  if (reijuWhy(s, E) || !t || !E.onBf(s, t) || t.side !== 'P' || !t.def.npFx) return false;
  const was = s.P.reiju;
  s.P.reiju = was - 1; s.P.flags.reijuT = s.turn;
  s.stats.reiju = (s.stats.reiju || 0) + 1;
  E.L(s, `れいじゅ（デッキ）を 1画 つかった（${was} − 1 ＝ ${s.P.reiju}）：${t.def.name}`);
  addNP(s, E, t, 100);
  return true;
}
// AI：NP ＋100 が むだに ならない（300 を こえない）サーヴァントで、NP が いちばん 多い もの。オーバーチャージで この ターン もう つかった ものは のぞく
export const reijuPick = (s, E) => npServants(s, E).filter((q) => (q.np || 0) <= NP_MAX - 100 && !ocUsed(s, q)).sort((a, b) => (b.np || 0) - (a.np || 0) || E.power(s, b) - E.power(s, a))[0];
// AI の えらびかた（ai.js の main。FG16 と おなじ 点 7 → つぎに 宝具 8）：てきの クリーチャーが いる とき
export function reijuOption(s, E) {
  if (reijuWhy(s, E) || !theirs(s, E).length) return null;
  const t = reijuPick(s, E);
  return t ? { score: 7, name: 'れいじゅ（デッキ）', exec: () => useReiju(s, E, t) } : null;
}
const forServants = (a, b) => (s, q, p, E) => (p.side === q.side && E.isCreature(p) && isServant(p) ? [a, b] : null);

// ---- 宝具（ほうぐ・装備品。FG76〜FG90）：シャドウ召喚（1マナ 多く はらうと 1/1 の シャドウ・サーヴァントが 出て、それに 装備した ままで 出る）。シャドウ召喚 なしなら 出る だけで、つけるには 装備の コスト ----
// phantasm・hostOf・allWhile・gives は 第2弾の 宝具（FG171〜FG185。set14.js）でも つかう
const SHADOW = cr('t_shadow', 'シャドウ・サーヴァント', null, '', 0, 1, 1, ['servant', 'シャドウ']);
export const phantasm = (x) => ({
  kicker: 1, kickName: 'シャドウ召喚（しょうかん）', ...x,
  // シャドウ召喚：シャドウに さいしょから 装備した ままで 出る（2026-11-06。ユーザーが きめた。「装備したとき」も おきる）。シャドウが いなく なったら つけかえは 装備の コスト
  etb: (s, p, E, o) => {
    if (o?.kicked) {
      E.L(s, 'シャドウ召喚（しょうかん）：シャドウ・サーヴァントが あらわれた');
      const [t] = E.token(s, p.side, SHADOW);
      if (t && E.onBf(s, t)) { p.attached = t.uid; E.L(s, `そうび：${p.def.name} → ${t.def.name}`); p.def.onEquip?.(s, p, t, E); }
    }
    x.etb?.(s, p, E, o);
  },
});
export const hostOf = (s, q) => (q.attached ? [...s.P.bf, ...s.E.bf].find((p) => p.uid === q.attached) : null);
// 装備されている あいだ、あなたの クリーチャー すべてに ＋a/＋b
export const allWhile = (a, b) => (s, q, p, E) => (q.attached && p.side === q.side && E.isCreature(p) ? [a, b] : null);
export const gives = (...kws) => (s, q, p) => (p.uid === q.attached ? kws : null);
// ランダムな 敵（クリーチャー・プレインズウォーカー・本体）
export function randomFoe(s, E) {
  const list = [...(s.floor.face ? ['face'] : []), ...s.E.bf.filter((p) => (E.isCreature(p) || E.isPW(p)) && !s.floor.untargetable?.(s, p, E))];
  return list.length ? list[Math.floor(s.rng() * list.length)] : null;
}
export const S10 = {
  FG01: np(40, (s, E) => { for (const q of mine(s, E)) q.shieldT = s.turn; E.L(s, 'いまは 遥（はる）か 理想（りそう）の 城（しろ）：ダメージ 0'); }),
  FG02: np(50, (s, E) => allFoes(s, E, 4)),
  FG03: np(40, (s, E) => { E.gain(s, 5); for (const q of mine(s, E)) E.pump(q, 0, 0, ['indestructible']); }),
  FG04: np(40, (s, E) => { const b = foeBest(s, E, 4) || foeBest(s, E); if (b) hit(s, E, b.t, 4); }),
  FG05: np(30, (s, E) => { E.hitEnemy(s, 3, null); allFoes(s, E, 3); }, { upkeep: (s, p, E) => { if (p.side === 'P') addNP(s, E, p, 20); } }),
  FG06: np(40, (s, E) => { for (const d of E.divide(s, 6, theirs(s, E))) hit(s, E, d.t, d.n); }),
  FG07: np(50, (s, E) => { const b = foeBest(s, E); if (b) killIt(s, E, b.t); }, {
    // 戦闘続行：ゲームで 1回だけ もどる
    onDie: (s, p, E) => {
      const k = `guts_${p.def.id}`;
      if (p.side !== 'P' || s.P.flags[k]) return;
      const i = s.P.gy.findIndex((c) => c.def.id === p.def.id); if (i < 0) return;
      s.P.flags[k] = true;
      const [c] = s.P.gy.splice(i, 1);
      E.L(s, `せんとうぞっこう：${p.def.name} が もどった`);
      E.enter(s, 'P', c.def, { card: c.def });
    },
  }),
  FG08: np(40, (s, E, p, t) => { const b = t ? { t } : foeBest(s, E); if (b) killIt(s, E, b.t); E.drawCard(s); }, { npTgt: { side: 'E', label: 'はかいする クリーチャー' } }), // レア：人は えらべる
  FG09: np(50, (s, E, p, t) => detain(s, E, t || biggest(s, E, (q) => !q.frozen)), { npTgt: { side: 'E', label: 'タップして つぎの ターン 起きない クリーチャー' } }), // じぶんで えらぶ（PICK_FREE。2026-11-06）
  FG10: np(20, (s, E) => E.drawCard(s, 2), { onCast: (s, p, d, E) => { if (p.side === 'P' && ['instant', 'sorcery'].some((t) => d.types.includes(t))) addNP(s, E, p, 20); } }),
  FG11: np(20, (s, E) => { E.gain(s, 3); for (const q of mine(s, E)) E.addCounters(s, q, 1); }, { upkeep: (s, p, E) => { if (p.side === 'P') for (const q of servants(s, E)) addNP(s, E, q, 20); } }),
  // 十二の試練：試練カウンター 3こ。死亡する かわりに 1こ とって ダメージを 0 に
  FG12: {
    etb: (s, p) => { p.trial = 3; },
    saveDeath: (s, p, E) => { if (!(p.trial > 0)) return false; p.trial--; p.dmg = 0; p.dt = false; E.L(s, `じゅうにの しれん：${p.def.name} は たおれない（のこり ${p.trial}）`); return true; },
  },
  FG13: np(50, (s, E, p) => { E.pump(p, 0, 0, ['double']); E.L(s, `${p.def.name}：にだんこうげき`); }),
  FG14: np(40, (s, E) => { for (const t of [...theirs(s, E)]) E.addMinus(s, t, 1); E.sba(s); }), // 2026-11-05：−2/−2 → −1/−1カウンター 1こずつ（ゴルゴーン FG57 と おなじ）
  FG15: np(50, (s, E) => { for (const q of servants(s, E)) if (q.def.id !== 'FG15') addNP(s, E, q, 50); E.gain(s, 4); }, { // 2026-11-07：R → L（伝説）。出たとき なかまの NP ＋20・宝具で 4点 回復
    etb: (s, p, E) => { if (p.side === 'P') for (const q of servants(s, E)) if (q !== p) addNP(s, E, q, 20); },
  }),
  // 令呪：3画。1画 つかうと サーヴァント1体の NP ＋100（すぐ 宝具を つかえる）
  FG16: {
    etb: (s, p) => { p.seals = 3; },
    acts: [{
      cost: 0, when: [1, 2], label: 'れいじゅを 1画 つかう：NP ＋100',
      can: (s, p) => p.seals > 0, cantWhy: 'れいじゅが のこって いない',
      play: (s, p, E, ctx) => { const t = bestServant(s, E); return t && (ctx.phase === 1 || ctx.human) && theirs(s, E).length ? { score: 7, run: () => { p.seals--; addNP(s, E, t, 100); } } : null; },
      tgt: [{ side: 'P', label: 'NP ＋100 する サーヴァント', filter: (s, E, q) => isServant(q) && !!q.def.npFx }],
      apply: (s, E, [[t]], x, p) => { p.seals--; addNP(s, E, t, 100); },
    }],
  },
  // カレイドスコープ：つけた とき NP ＋80
  FG17: { equip: 2, onEquip: (s, p, host, E) => addNP(s, E, host, 80) },
  FG18: {
    play: (s, E) => { const t = E.bestBuffTarget(s, null); return t ? { score: 5, run: () => E.addCounters(s, t, 2) } : null; },
    tgt: [{ side: 'P', label: '＋1/＋1カウンターを 2こ おく クリーチャー' }], apply: (s, E, [[t]]) => { E.target(s, t); E.addCounters(s, t, 2); },
  },
  FG19: { play: (s, E) => (s.P.lib.length ? { score: 4, run: () => dig(s, E, 5, 1, (d) => isCr(d) && (d.sub || []).includes('servant')) } : null) },
  FG20: {
    acts: [{
      cost: 0, tap: true, when: [1, 2], label: 'サーヴァントに ＋1/＋1カウンター と NP ＋10',
      play: (s, p, E) => { const t = bestServant(s, E) || servants(s, E)[0]; return t ? { score: 4, run: () => { E.addCounters(s, t, 1); addNP(s, E, t, 10); } } : null; },
      tgt: [{ side: 'P', label: 'サーヴァント', filter: (s, E, q) => isServant(q) }],
      apply: (s, E, [[t]]) => { E.addCounters(s, t, 1); addNP(s, E, t, 10); },
    }],
  },
  FG21: {
    tgt: [{ side: 'P', min: 0, label: 'NP ＋30 する サーヴァント', filter: (s, E, q) => isServant(q) && !!q.def.npFx }],
    etb: (s, p, E, o) => { if (p.side !== 'P') return; const t = chosen1(o); addNP(s, E, t === undefined ? bestServant(s, E) : t, 30); },
  },
  FG22: np(50, (s, E) => E.gain(s, 4)),
  FG23: np(50, (s, E) => E.drawCard(s)),
  FG24: np(40, (s, E) => { const t = biggest(s, E, (p) => E.power(s, p) >= 2); if (t) { E.bounce(s, t); E.sba(s); } }),
  FG25: np(50, (s, E) => { const b = foeBest(s, E, 2) || foeBest(s, E); if (b && E.onBf(s, b.t)) { E.addMinus(s, b.t, 2); E.sba(s); } }), // 2026-11-05：−2/−2 → −1/−1カウンター（ステンノ FG54 と おなじ。はかって ほぼ かわらない ので P/T は その まま）
  FG26: np(40, (s, E) => { const b = foeBest(s, E, 99, (p) => E.power(s, p) <= 3); if (b) killIt(s, E, b.t); }),
  FG27: np(40, (s, E) => allFoes(s, E, 1)),
  FG28: np(40, (s, E) => E.hitEnemy(s, 3, null)),
  FG29: { onAttack: (s, p, E) => E.pump(p, 1, 0) },
  FG30: np(50, (s, E) => { const t = E.bestBuffTarget(s, null); if (t) E.addCounters(s, t, 2); }),
  FG31: {
    play: (s, E, ctx) => { const t = ctx.phase === 1 || ctx.human ? biggest(s, E, (p) => !p.frozen && p.def.attacks !== false) : null; return t && E.power(s, t) >= 2 ? { score: 3 + E.power(s, t), run: () => detain(s, E, t) } : null; },
    tgt: [{ side: 'E', label: 'タップする クリーチャー（つぎも おきない）' }], apply: (s, E, [[t]]) => detain(s, E, t),
  },
  FG32: single(0, 0, { kw: ['indestructible'] }),
  FG33: single(3, 0),
  FG34: {
    play: (s, E) => { const t = bestServant(s, E); return t ? { score: 5, run: () => { E.addCounters(s, t, 1); addNP(s, E, t, 30); } } : null; },
    tgt: [{ side: 'P', label: 'サーヴァント', filter: (s, E, q) => isServant(q) }], apply: (s, E, [[t]]) => { E.target(s, t); E.addCounters(s, t, 1); addNP(s, E, t, 30); },
  },
  FG35: np(40, (s, E) => { const b = foeBest(s, E, 3) || foeBest(s, E); if (b) hit(s, E, b.t, 3); E.gain(s, 3); }),
  FG36: np(30, (s, E) => { for (const t of theirs(s, E)) t.tapped = true; E.L(s, 'てきの クリーチャーを ぜんぶ タップ'); }, { upkeep: (s, p, E) => { if (p.side === 'P') for (const q of servants(s, E)) addNP(s, E, q, 10); } }),
  FG38: np(40, (s, E) => allFoes(s, E, 3)),
  FG39: np(40, (s, E) => E.drawCard(s, 2), { etb: (s, p, E) => { if (p.side === 'P') E.drawCard(s); } }),
  FG40: { acts: [{ cost: 0, sac: true, when: [1, 2], label: 'ぼちに おいて 1まい 引く', play: (s, p, E) => (s.P.hand.length <= 2 ? { score: 3, run: () => { E.leave(s, p, 'gy'); E.drawCard(s); } } : null) }] },
  // ---- 70種に ふやした ぶん（FG41〜FG70） ----
  FG41: np(50, (s, E) => detain(s, E, biggest(s, E, (p) => !p.frozen))),
  FG42: { etb: (s, p, E) => { if (p.side === 'P') for (const q of servants(s, E)) addNP(s, E, q, 10); } },
  FG43: np(40, (s, E) => { for (const q of mine(s, E)) E.pump(q, 1, 1); }),
  FG44: np(40, (s, E) => allFoes(s, E, 2)),
  FG45: np(40, (s, E) => E.gain(s, 3), { anthem: (s, q, p) => (p !== q && p.side === q.side && isServant(p) ? [0, 1] : null) }),
  FG46: npSpell(30),
  FG47: np(50, (s, E) => E.token(s, 'P', TK.kaima, 2)),
  FG48: npSpell(20, (s, E) => E.drawCard(s)),
  FG49: np(40, (s, E) => { const t = biggest(s, E, (p) => E.power(s, p) >= 2); if (t) { E.bounce(s, t); E.sba(s); } }),
  FG50: np(40, (s, E) => { for (const t of theirs(s, E)) detain(s, E, t); }),
  FG51: np(50, (s, E) => E.hitEnemy(s, 2, null), { onAttack: (s, p) => { p.flags.turn.unblockable = true; } }),
  // フィン・マックール（2026-10-27：ネモと いれかえ）：出たとき 占術2。宝具で 敵1体を 手札へ ＋ 1まい 引く
  FG52: { etb: (s, p, E) => { if (p.side === 'P') E.scry(s, 2); }, ...np(40, (s, E, p, t) => { const b = t ? { t } : foeBest(s, E); if (b && E.onBf(s, b.t)) { E.bounce(s, b.t); E.sba(s); } E.drawCard(s); }, { npTgt: { side: 'E', label: '手札（てふだ）に もどす クリーチャー' } }) },
  FG53: { etb: (s, p, E) => { if (p.side === 'P') E.token(s, 'P', TK.assassin, 2); } },
  FG54: np(50, (s, E) => { const b = foeBest(s, E, 2) || foeBest(s, E); if (b && E.onBf(s, b.t)) { E.addMinus(s, b.t, 2); E.sba(s); } }),
  FG55: np(40, (s, E) => { const b = foeBest(s, E, 99, (p) => E.power(s, p) <= 4); if (b) killIt(s, E, b.t); }),
  FG56: foe1('−1/−1カウンターを 2こ おく クリーチャー', (s, E, t) => { if (t && E.onBf(s, t)) { E.addMinus(s, t, 2); E.sba(s); } }, { n: 2 }), // 2026-11-05：−2/−2 → −1/−1カウンター。コスト 1 → 2
  FG57: np(40, (s, E) => { for (const t of [...theirs(s, E)]) E.addMinus(s, t, 1); E.sba(s); }),
  FG58: np(50, (s, E) => { const t = biggest(s, E, (p) => !s.floor.untargetable?.(s, p, E)); if (t) killIt(s, E, t); }),
  FG59: np(50, (s, E) => { for (const q of mine(s, E)) E.pump(q, 1, 0); }),
  FG60: np(50, (s, E) => { const b = foeBest(s, E, 3) || foeBest(s, E); if (b) hit(s, E, b.t, 3); }),
  FG61: np(40, (s, E) => { E.hitEnemy(s, 3, null); const b = foeBest(s, E, 3) || foeBest(s, E); if (b) hit(s, E, b.t, 3); }),
  FG62: npSpell(50),
  FG63: np(50, (s, E, p) => E.pump(p, 4, 0)),
  // 出たとき NP ＋20、攻撃で ＋40：2回の 攻撃で 王の軍勢（20 ＋ 40 ＋ 40 ＝ 100）
  FG64: np(40, (s, E) => E.token(s, 'P', TK.soldier22, 5), { etb: (s, p, E) => { if (p.side === 'P') addNP(s, E, p, 20); } }),
  FG65: np(50, (s, E) => { const b = foeBest(s, E, 3) || foeBest(s, E); if (b) hit(s, E, b.t, 3); }),
  FG66: np(40, (s, E) => { const t = E.bestBuffTarget(s, null); if (t) E.addCounters(s, t, 3); }),
  FG67: np(50, (s, E, p) => { const b = foeBest(s, E, E.power(s, p)) || foeBest(s, E); if (b && E.onBf(s, b.t)) E.fight(s, p, b.t); }),
  FG68: { play: (s, E) => (E.basicsInLib(s) ? { score: 5, run: () => E.rampBasic(s, 1) } : null) },
  FG69: np(40, (s, E, p, t) => { const b = t ? { t } : foeBest(s, E); if (b) killIt(s, E, b.t); }, { npTgt: { side: 'E', label: 'はかいする クリーチャー' } }),
  FG70: np(40, (s, E) => { E.gain(s, 3); for (const q of mine(s, E)) E.addCounters(s, q, 1); }), // 2026-11-07：L → R（5点 → 3点、3/4 → 2/4）
  // ---- マスター（FG71〜FG75・エンチャント） ----
  FG71: { ...master, anthem: forServants(0, 1) },
  FG72: { ...master, onOtherEnter: (s, p, q, E) => { if (q.side === p.side && isServant(q)) addNP(s, E, q, 20); } },
  FG73: { ...master, grant: (s, q, p) => (p.side === q.side && isServant(p) ? ['haste'] : null) },
  FG74: { ...master, anthem: forServants(1, 0) },
  FG75: { ...master, onOtherLeave: (s, p, q, E, o) => { if (!o?.died || q.side !== p.side || !isServant(q) || p.side !== 'P') return; E.hitEnemy(s, 1, null); E.gain(s, 1); } },
  // ---- 宝具 ----
  // 白：ぜんたいを つよく する
  FG76: phantasm({ equip: 2, anthem: allWhile(1, 1), acts: [{
    cost: 5, req: ['W'], when: [1, 2], label: '敵（てき）の クリーチャー1体に 4点（1ターンに1回）', can: (s, p) => !p.flags.turn.used, cantWhy: 'この ターンは もう つかった',
    play: (s, p, E) => { const b = foeBest(s, E, 4); return b ? { score: 5 + b.score, run: () => { p.flags.turn.used = true; hit(s, E, b.t, 4); } } : null; },
    tgt: [{ side: 'E', label: '4点を あたえる クリーチャー' }], apply: (s, E, [[t]], x, p) => { p.flags.turn.used = true; hit(s, E, t, 4); },
  }] }),
  FG77: phantasm({ equip: 2, anthem: allWhile(1, 1) }),
  FG78: phantasm({ equip: 1, anthem: allWhile(0, 2), onEquip: (s, p, host, E) => { for (const q of mine(s, E)) E.pump(q, 0, 0, ['indestructible']); E.L(s, 'わが神は ここに ありて：この ターン みんな 破壊不能（はかいふのう）'); } }),
  // 青：キーワード（飛行・二段攻撃・呪禁）
  FG79: phantasm({ equip: 1, eqP: 2, grant: gives('flying'), acts: [{
    cost: 0, when: [1], label: 'はずして 二段攻撃（にだんこうげき）（この ターン）', can: (s, p) => !!p.attached, cantWhy: 'どの クリーチャーにも ついて いない',
    play: (s, p, E, ctx) => { const h = hostOf(s, p); if (!h || !ctx.human) return null; return { score: 1, run: () => { p.attached = null; E.pump(h, 0, 0, ['double']); E.L(s, `${h.def.name}：死翔（しかけ）の 槍（やり）を はずして 二段攻撃（にだんこうげき）`); } }; },
  }] }),
  FG80: phantasm({ equip: 1, eqT: 2, grant: gives('hexproof') }),
  FG81: phantasm({ equip: 1, eqP: 2, grant: gives('hexproof') }),
  // 赤：こうげきの 力・火力
  FG82: phantasm({ equip: 2, eqP: 3,
    hostTrig: { pay: 2, label: '2マナ はらって 敵（てき）の パーマネント1つを 追放（ついほう）する？', spec: { side: 'E', perm: true, label: '追放（ついほう）する 敵（てき）の パーマネント', filter: (s, E, p) => !p.def.factory && !s.floor.cantLeave?.(s, p, E) },
      pick: (s, E) => s.E.bf.filter((p) => !p.def.factory && !s.floor.cantLeave?.(s, p, E) && !s.floor.untargetable?.(s, p, E)).sort((a, b) => (b.def.cost || 0) - (a.def.cost || 0) || E.power(s, b) - E.power(s, a))[0] },
    onHostAttack: (s, q, host, E) => { const tp = q.trigPick; q.trigPick = null; if (tp && tp !== 'skip' && tp.paid && E.onBf(s, tp.t)) { E.L(s, `天地乖離（てんちかいり）す 開闢（かいびゃく）の 星：${tp.t.def.name} を 追放（ついほう）`); E.target(s, tp.t); E.exile(s, tp.t); E.sba(s); } } }),
  FG83: phantasm({ equip: 1, eqPT: (s, q) => [s[q.side].bf.filter((x) => (x.def.types || []).includes('artifact')).length, 0] }),
  FG84: phantasm({ equip: 1, eqP: 1, onHostAttack: (s, q, host, E) => { if (q.side !== 'P') return; const t = randomFoe(s, E); if (t) hit(s, E, t, 2); } }),
  // 緑：大きな クリーチャー
  FG85: phantasm({ equip: 1,
    grant: (s, q, p, E) => (q.attached && p.side === q.side && E.isCreature(p) ? ['trample'] : null),
    onOtherEnter: (s, q, p, E) => { if (q.attached && q.side === 'P' && p.side === 'P' && E.isCreature(p) && E.power(s, p) >= 4) E.drawCard(s); },
    onEquip: (s, q, host, E) => { if (q.side === 'P' && mine(s, E).some((p) => E.power(s, p) >= 4)) E.drawCard(s); } }),
  FG86: phantasm({ equip: 1, eqP: 4, onHostAttack: (s, q, host, E) => { host.frozen = true; E.L(s, `${host.def.name} は 麻痺（まひ）した（つぎの ターン おきない）`); } }),
  FG87: phantasm({ equip: 1,
    hostTrig: { spec: { side: 'P', label: '盾（たて）カウンターを おく クリーチャー', filter: (s, E, p) => !p.shieldCtr } },
    onHostAttack: (s, q, host, E) => {
      const tp = q.trigPick; q.trigPick = null;
      const t = tp?.t && E.onBf(s, tp.t) ? tp.t : [host, ...mine(s, E)].find((p) => E.onBf(s, p) && !p.shieldCtr);
      if (t && !t.shieldCtr) { t.shieldCtr = 1; E.L(s, `${t.def.name} に 盾（たて）カウンター`); }
    } }),
  // 黒：接死・絆魂・−1/−1
  FG88: phantasm({ equip: 1, eqP: 2, grant: gives('deathtouch', 'lifelink') }),
  FG89: phantasm({ equip: 1, eqP: 1, grant: gives('flying', 'lifelink') }),
  FG90: phantasm({ equip: 1, eqP: 1, grant: gives('wither') }),
};
