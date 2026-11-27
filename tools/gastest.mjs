// gas/Code.gs を Google の かわりの 「にせもの」で うごかして しらべる（スプレッドシート・キャッシュ・ロック・ログイン）
// つかいかた：node tools/build_gas.mjs && node tools/gastest.mjs
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { makeGas, OWNER } from './gasmock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { G, book, setUser, fetched, setWeb, cache, props } = makeGas();


let bad = 0;
const ok = (c, msg) => { if (!c) { bad++; console.log('NG', msg); } else console.log('OK', msg); };
const throws = (f, msg) => { try { f(); bad++; console.log('NG（エラーに ならない）', msg); } catch (e) { console.log('OK', msg, '→', e.message); } };
const rows = (n) => (book.sheets[n]?.sh.cells || []).slice(1).filter((r) => r && r.some((x) => x !== ''));

// ---- はじめ ----
const c0 = G.mtgConfig();
ok(c0.login && !c0.admin && c0.sets === null && c0.raid && c0.raid.id === 'tarkir-1', 'mtgConfig（子ども・はじめ）');
ok(rows('せってい').length === 9, 'せってい シートが できる');
throws(() => G.mtgAdminGet(), '子どもは 管理画面を ひらけない');

// ---- ゴースト ----
const { BY_ID } = await import(join(ROOT, 'js/data/cards.js'));
const deck = Array(20).fill('W01');
const deckOk = [...Array(4).fill('W01'), ...Array(16).fill(Object.values(BY_ID).find((d) => d.basic && d.color === 'W').id)];
const g1 = G.mtgSubmitGhost({ d: deckOk, t: 3, n: [1, 2] });
ok(/^3-[0-9a-f]{8}$/.test(g1.i), 'ゴーストを あずける');
throws(() => G.mtgSubmitGhost({ d: deck.slice(0, 5), t: 3, n: [0, 0] }), '5まいの デッキは うけとらない');
// キャパシティ：とうは 1階ごとに ＋2（5階 38点・ストリクスヘイヴンの 6階 40点）。ゴーストは 40点まで（2026-11-04）
{
  const { ptsOf } = await import(join(ROOT, 'js/engine/ai.js'));
  const basicW = Object.values(BY_ID).find((d) => d.basic && d.color === 'W').id;
  const pts = (d) => d.reduce((t, id) => t + ptsOf(BY_ID[id]), 0);
  const d38 = [...Array(8).fill('W06'), ...Array(8).fill('W07'), ...Array(3).fill('W14'), basicW];
  const d41 = [...Array(8).fill('W08'), ...Array(5).fill('W16'), 'W06', ...Array(6).fill(basicW)];
  ok(pts(d38) === 38 && pts(d41) === 41, `しらべる デッキの 点（${pts(d38)}点・${pts(d41)}点）`);
  const m = makeGas(); // べつの にせもの（ほかの しらべの ゴーストを ふやさない）
  ok(/^6-[0-9a-f]{8}$/.test(m.G.mtgSubmitGhost({ d: d38, t: 6, n: [0, 0] }).i), '5階の 38点の デッキは うけとる');
  throws(() => m.G.mtgSubmitGhost({ d: d41, t: 6, n: [0, 0] }), '41点の デッキは うけとらない');
}
ok(rows('ゴースト').length === 1 && rows('デッキの点').length === 1, 'ゴースト・デッキの点 シートに 1行');
ok(G.mtgRandomGhost({ x: [g1.i] }) === null, 'じぶんの ゴーストは あいてに ならない');
const r = G.mtgRandomGhost({ x: [] });
ok(r && r.i === g1.i && r.d.length === 20 && r.n[1] === 2, 'ゴーストを もらう');
for (let k = 0; k < 35; k++) G.mtgSubmitGhost({ d: deckOk, t: 5, n: [0, 0] });
ok(rows('ゴースト').filter((x) => x[1] === '5' || x[1] === 5).length === 30, '階ごとに 30人まで');
const res = G.mtgResult({ g: r.i, i: g1.i, r: 'w', n: [1, 2], p: 'W' });
ok(res.s === 2, 'かったら デッキの 点 ＋2');
ok(G.mtgMyGhosts([g1.i])[0].l === 1, 'あいての ゴーストに まけが 1');
G.mtgResult({ i: g1.i, r: 'l', n: [1, 2] });
ok(G.mtgMyGhosts([g1.i])[0].s === 1, 'まけで −1');
const rk = G.mtgRanking();
ok(rk.l.length === 1 && rk.l[0][0] === 1 && rk.l[0][4] === g1.i && rows('ランキング').length === 1, 'ランキング');

// ---- レイド ----
// せってい シートの はじめの「レイドのおわり」（2026/11/01 20:00）より まえの 時計で しらべる（きょうの 日付に よらない）
const GDate = vm.runInContext('Date', G), realNow = GDate.now;
GDate.now = () => Date.UTC(2026, 9, 31, 3);
const cmd = 'RG07';
const raidDeck = Array(20).fill(Object.values(BY_ID).find((d) => d.basic && d.color === 'R').id);
const rs = G.mtgRaidSubmit({ id: 'tarkir-1', f: 'dragon', c: cmd, d: raidDeck, n: [3, 4] });
ok(/^[0-9a-f]{12}$/.test(rs.i), 'レイドの ゴースト');
G.mtgRaidAdd({ id: 'tarkir-1', f: 'human', c: 'AB02', w: 1, fin: 1, q: 3 });
const rg = G.mtgRaidGhost({ id: 'tarkir-1', f: 'human' });
ok(rg && rg.i === rs.i && rg.d.length === 20, 'ちがう 陣営の ゴーストが あいて');
G.mtgRaidDefend({ id: 'tarkir-1', g: rs.i });
const st = G.mtgRaidState({ id: 'tarkir-1', me: rs.i, f: 'dragon' });
ok(st.f.human === 18 && st.f.dragon === 3 && st.c.RG07 === 3 && st.mine.w === 1 && st.mine.alive, `レイドの 点 ${JSON.stringify(st)}`);
G.mtgRaidSubmit({ id: 'tarkir-1', f: 'dragon', c: cmd, i: rs.i, d: raidDeck, n: [3, 4] });
ok(G.mtgRaidState({ id: 'tarkir-1', me: rs.i, f: 'dragon' }).mine.w === 1, '出しなおしても まもった 回数は のこる');
throws(() => G.mtgRaidAdd({ id: 'tarkir-9', f: 'human', c: 'AB02', w: 1 }), 'ちがう レイドIDは だめ');
GDate.now = () => Date.UTC(2026, 10, 1, 12); // おわって 1時間（30分の まちじかんも すぎた）
throws(() => G.mtgRaidAdd({ id: 'tarkir-1', f: 'human', c: 'AB02', w: 1 }), 'おわった レイドには 点を たせない');
GDate.now = realNow;

// ---- ひきつぎ ----
const big = JSON.stringify({ 'mtg-adventure-v1': 'x'.repeat(120000), 'mtg-emblem-v1': '{"a":1}' });
const up = G.mtgSaveUpload(big);
ok(up.size === big.length, 'セーブを あずける（3マスに わける）');
ok(G.mtgSaveDownload().data === big, 'セーブを もどす');
ok(!JSON.stringify(book.sheets['ひきつぎ'].sh.cells).includes('taro'), 'シートに メールアドレスが ない');
G.mtgSaveUpload('{"a":1}');
ok(G.mtgSaveDownload().data === '{"a":1}' && rows('ひきつぎ').length === 1, 'あずけなおすと 上書き（のこりの マスも けす）');
setUser('hanako@school.ed.jp');
ok(G.mtgSaveDownload() === null, 'ほかの 人の セーブは 見えない');
throws(() => G.mtgSaveUpload('こわれた'), 'こわれた セーブは うけとらない');
setUser('');
throws(() => G.mtgSaveDownload(), 'ログイン していないと ひきつぎ できない');
ok(G.mtgConfig().login === false, 'ログイン なし');

// ---- 先生 ----
setUser(OWNER);
ok(G.mtgConfig().admin, 'デプロイした 先生は かんりしゃ');
const a = G.mtgAdminSave({ conf: { 'パックの弾': '1,2,3', 'つかわない弾': '10,11', 'レイドのおわり': '2026/12/01 20:00' }, admins: [['Tanaka@School.ed.jp', '2組'], ['だめ', '']], codes: [['0-1-2', 'W01', '', '', '2', 'テスト'], ['x', 'W01'], ['1-1-1', 'NOPE']] });
ok(a.admins.length === 1 && a.admins[0][0] === 'tanaka@school.ed.jp' && a.codes.length === 1, '管理画面で 保存（まちがいは のぞく）');
setUser('tanaka@school.ed.jp');
const c1 = G.mtgConfig();
ok(c1.admin && String(c1.sets) === '1,2,3' && String(c1.ban) === '10,11' && c1.raid.ends === Date.UTC(2026, 11, 1, 11), `シートに 書いた 先生も かんりしゃ・せってい ${JSON.stringify(c1)}`);
// 開発モードで レイドを 出さない → レイドなし（点と ゴーストは のこる）
G.mtgAdminSave({ conf: { 'レイドを出す': '出さない' } });
ok(G.mtgConfig().raid === null, 'レイドを 出さない');
throws(() => G.mtgRaidAdd({ id: 'tarkir-1', f: 'human', c: 'AB02', w: 1 }), '出さない ときは レイドの 点を たせない');
G.mtgAdminSave({ conf: { 'レイドを出す': '出す' } });
ok(G.mtgConfig().raid?.id === 'tarkir-1' && G.mtgRaidState({ id: 'tarkir-1' }).f.human === 18, 'また 出すと つづきから');

// ---- きょうの ぼうけん ----
{ const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  setUser('taro@school.ed.jp');
  const b1 = G.mtgDailySubmit({ d: today, f: 3, e: 2, t: 21, n: [1, 2] });
  ok(b1.n === 1 && b1.rank === 1 && b1.hist[3] === 1 && b1.top[0].me === 1, 'きょうの ぼうけん：けっかを おくる');
  const b2 = G.mtgDailySubmit({ d: today, f: 5, e: 9, t: 10, n: [1, 2] });
  ok(b2.n === 1 && b2.top[0].f === 3, 'きょうの ぼうけん：おなじ 人の 2回めは かぞえない');
  setUser('jiro@school.ed.jp');
  const b3 = G.mtgDailySubmit({ d: today, f: 5, e: 1, t: 30, n: [3, 4] });
  ok(b3.n === 2 && b3.rank === 1 && b3.top[1].f === 3 && b3.hist[5] === 1, 'きょうの ぼうけん：のぼった 階の 多い じゅん');
  setUser('');
  const b4 = G.mtgDailySubmit({ d: today, f: 9, e: -3, t: 5, n: [0, 0], g: '0123456789ab' });
  ok(b4.n === 3 && b4.top.some((x) => x.me && x.f === 5 && x.e === 0), 'きょうの ぼうけん：アカウントが なくても 端末の 番号で（数は はんいに おさめる）');
  ok(G.mtgDailyBoard({ d: today, g: '0123456789ab' }).rank > 0 && G.mtgDailyBoard({ d: today }).rank === 0, 'きょうの ぼうけん：みんなの けっか');
  throws(() => G.mtgDailySubmit({ d: '2020-01-01', f: 1, e: 0, t: 1, n: [0, 0], g: '0123456789ab' }), 'きょうで ない 日づけは だめ');
  throws(() => G.mtgDailySubmit({ d: today, f: 1, e: 0, t: 1, n: [0, 0] }), 'アカウントも 番号も ない ときは だめ'); }

// ---- リアルタイムたいせん（docs/REALTIME_PVP.md）----
{ const m = makeGas(''), R = m.G, D = vm.runInContext('Date', R), real = D.now; let skew = 0; D.now = () => real() + skew;
  const { SAMPLE, sampleIds } = await import(join(ROOT, 'js/data/samples.js'));
  for (const k of Object.keys(SAMPLE)) { const x = R.mtgRtCreate({ d: sampleIds(k), n: [0, 0] }); ok(/^\d{4}$/.test(x.c) && x.k.length === 32, `スターターデッキ ${k} で へやを つくれる（あいことば ${x.c}）`); R.mtgRtEnd({ c: x.c, k: x.k, why: 'cancel' }); }
  throws(() => R.mtgRtCreate({ d: [...sampleIds('WG').slice(0, 19), 'NOPE'], n: [0, 0] }), 'しらない カードの デッキでは へやを つくれない');
  throws(() => R.mtgRtCreate({ d: sampleIds('WG').slice(0, 5), n: [0, 0] }), '5まいの デッキでは へやを つくれない');
  // ほかんした デッキ（デッキID つき）どうし
  const ha = R.mtgSubmitGhost({ d: deckOk, t: 3, n: [1, 2] }).i, gb = R.mtgSubmitGhost({ d: deckOk, t: 2, n: [3, 4] }).i;
  const h = R.mtgRtCreate({ d: deckOk, n: [1, 2], i: ha });
  ok(R.mtgRtSync({ c: h.c, k: h.k }).st === 'wait' && R.mtgRtSync({ c: h.c, k: h.k }).left > 9 * 60 * 1000, 'まちあい：のこり時間');
  throws(() => R.mtgRtSync({ c: h.c, k: 'x' }), 'ひみつの 番号が ちがうと 入れない');
  throws(() => R.mtgRtJoin({ c: h.c, d: ['W01'], n: [0, 0] }), 'おかしな デッキでは 入れない');
  throws(() => R.mtgRtJoin({ c: 'ab12', d: deckOk, n: [0, 0] }), 'あいことばは 4けたの すうじ');
  const g = R.mtgRtJoin({ c: h.c, d: sampleIds('UR'), n: [3, 4], i: gb });
  ok(g.st === 'play' && g.side === 'g' && g.foe.d.length === 20 && g.foe.n[1] === 2 && ['h', 'g'].includes(g.first) && g.seed >= 0 && !('k' in g.foe), `入る：あいての デッキと なまえ・たね・先手（${g.first}）を もらう（ひみつの 番号は もらわない）`);
  throws(() => R.mtgRtJoin({ c: h.c, d: deckOk, n: [0, 0] }), '3人めは 入れない');
  const hs = R.mtgRtSync({ c: h.c, k: h.k });
  ok(hs.st === 'play' && hs.side === 'h' && hs.seed === g.seed && hs.first === g.first && hs.foe.d[0] === sampleIds('UR')[0] && hs.ops.length === 0, 'つくった 人にも はじまりが つたわる（おなじ たね・先手）');
  // そうさ：通し番号の じゅん・かさなっても 2回 入らない・あいては まだの ぶん だけ もらう
  const op = (n) => ({ n, e: ['hand', n], a: [['s', 'c', 0]], h: 'abc' });
  ok(R.mtgRtSync({ c: h.c, k: h.k, ops: [op(0), op(1)], from: 0 }).n === 2, 'そうさを 2つ おくる');
  ok(R.mtgRtSync({ c: h.c, k: h.k, ops: [op(1), op(2)], from: 0 }).n === 3, 'おくりなおしが かさなっても 2回 入らない');
  ok(R.mtgRtSync({ c: h.c, k: h.k, ops: [op(5)], from: 0 }).n === 3, '番号が とんだ そうさは 入れない');
  const g1 = R.mtgRtSync({ c: h.c, k: g.k, from: 0 });
  ok(g1.ops.length === 3 && g1.ops[2].n === 2 && g1.ops[1].e[1] === 1 && g1.n === 0, 'あいてが そうさを もらう');
  ok(R.mtgRtSync({ c: h.c, k: g.k, from: 2 }).ops.length === 1 && R.mtgRtSync({ c: h.c, k: g.k, from: 3 }).ops.length === 0, 'まだ もらって いない ぶん だけ');
  for (let k = 3; k < 130; k += 30) R.mtgRtSync({ c: h.c, k: h.k, ops: Array.from({ length: 30 }, (_, j) => op(k + j)), from: 0 });
  { let from = 0, n = 0; for (let t = 0; t < 10; t++) { const r = R.mtgRtSync({ c: h.c, k: g.k, from }); if (!r.ops.length) break; ok(r.ops[0].n === from, `つづきから もらう（${from}〜）`); from += r.ops.length; n += r.ops.length; } ok(n === 153, `たくさんの そうさも ぜんぶ とどく（${n}）`); }
  ok(R.mtgRtSync({ c: h.c, k: h.k, ops: [{ n: 153, e: ["x"], a: ["y".repeat(3000)], h: "" }], from: 0 }).n === 153, '大きすぎる そうさは 入れない');
  // けっか：ふたりが そろって きまる。デッキID が あれば デッキの 点（ゴーストたいせんと おなじ 表）
  ok(R.mtgRtEnd({ c: h.c, k: h.k, why: 'play', r: 'w' }).st === 'play', 'かたほう だけの けっかでは まだ きまらない');
  const e2 = R.mtgRtEnd({ c: h.c, k: g.k, why: 'play', r: 'l' });
  ok(e2.st === 'over' && e2.res.w === 'h' && e2.res.why === 'play' && e2.pts === 0, 'ふたりの けっかが そろって きまる（まけた がわは 0点の まま）');
  const e1 = R.mtgRtSync({ c: h.c, k: h.k, from: 0 });
  ok(e1.st === 'over' && e1.pts === 2 && R.mtgMyGhosts([ha])[0].s === 2 && R.mtgMyGhosts([gb])[0].s === 0, 'かった デッキに ＋2（デッキの点 シート）');
  ok(R.mtgRtEnd({ c: h.c, k: g.k, why: 'resign' }).res.w === 'h', 'きまった あとは かわらない');
  const mk = (ia, ib) => { const x = R.mtgRtCreate({ d: deckOk, n: [1, 2], i: ia }), y = R.mtgRtJoin({ c: x.c, d: deckOk, n: [3, 4], i: ib }); return { c: x.c, h: x.k, g: y.k }; };
  { const r = mk(ha, gb); const x = R.mtgRtEnd({ c: r.c, k: r.g, why: 'resign' }); ok(x.res.w === 'h' && x.res.why === 'resign' && R.mtgMyGhosts([ha])[0].s === 4, 'こうさん：あいての かち（＋2）'); }
  { const r = mk(ha, gb); R.mtgRtEnd({ c: r.c, k: r.h, why: 'play', r: 'd' }); const x = R.mtgRtEnd({ c: r.c, k: r.g, why: 'play', r: 'd' }); ok(x.res.w === 'd' && x.pts === 1 && R.mtgMyGhosts([ha])[0].s === 5, 'ひきわけ：どちらも ＋1'); }
  { const r = mk(ha, gb); R.mtgRtEnd({ c: r.c, k: r.h, why: 'play', r: 'w' }); const x = R.mtgRtEnd({ c: r.c, k: r.g, why: 'play', r: 'w' }); ok(x.res.w === 'x' && x.res.why === 'mismatch' && x.pts === null && R.mtgMyGhosts([ha])[0].s === 5, 'けっかが くいちがう：しょうぶなし（点は かわらない）'); }
  { const r = mk(ha, gb); ok(R.mtgRtEnd({ c: r.c, k: r.h, why: 'desync' }).res.w === 'x', '画面が ずれた：しょうぶなし'); }
  { const r = mk(ha, gb); R.mtgRtSync({ c: r.c, k: r.g, from: 0 }); throws(() => R.mtgRtEnd({ c: r.c, k: r.h, why: 'left' }), 'あいてが いる あいだは「いなく なった」と いえない');
    skew += 30000; R.mtgRtSync({ c: r.c, k: r.h, from: 0 }); skew += 30000;
    ok(R.mtgRtSync({ c: r.c, k: r.h, from: 0 }).away >= 45000, 'あいてが しずかな 時間が わかる');
    const x = R.mtgRtEnd({ c: r.c, k: r.h, why: 'left' }); ok(x.res.w === 'h' && x.res.why === 'left' && R.mtgMyGhosts([ha])[0].s === 7, '45秒 しずかなら のこった がわの かち'); }
  { const r = mk(ha, gb); R.mtgRtEnd({ c: r.c, k: r.g, why: 'play', r: 'w' }); skew += 31000; const x = R.mtgRtSync({ c: r.c, k: r.g, from: 0 }); ok(x.st === 'over' && x.res.w === 'g' && x.pts === 2, 'かたほうが けっかを おくらない まま 30秒：とどいた けっかで きまる'); }
  // まちあい：10分で きえる
  { const x = R.mtgRtCreate({ d: deckOk, n: [0, 0] }); skew += 10 * 60 * 1000 + 1000; ok(R.mtgRtSync({ c: x.c, k: x.k }).st === 'gone', 'まちあいが 10分 つづいた へやは きえる'); throws(() => R.mtgRtJoin({ c: x.c, d: deckOk, n: [0, 0] }), 'きえた へやには 入れない'); }
  { const x = R.mtgRtCreate({ d: deckOk, n: [0, 0] }); skew += 10 * 60 * 1000 + 1000; throws(() => R.mtgRtJoin({ c: x.c, d: deckOk, n: [0, 0] }), 'つくった 人が 見て いなくても、10分 すぎた へやには 入れない'); }
  { const x = R.mtgRtCreate({ d: deckOk, n: [0, 0] }); ok(R.mtgRtEnd({ c: x.c, k: x.k, why: 'cancel' }).st === 'gone' && R.mtgRtSync({ c: x.c, k: x.k }).st === 'gone', 'まつのを やめると へやは きえる'); }
  ok(!Object.keys(m.book.sheets).some((n) => /リアル|rt/i.test(n)), 'へやは シートに 書かない（キャッシュ だけ）'); }

// ---- あいことば ----
setUser('taro@school.ed.jp');
ok(G.mtgRedeem({ w: [0, 1, 2] }).card === 'W01', 'あいことばで カード');
throws(() => G.mtgRedeem({ w: [0, 1, 2] }), 'おなじ 人は 2回 もらえない');
setUser('jiro@school.ed.jp'); G.mtgRedeem({ w: [0, 1, 2] });
setUser('saburo@school.ed.jp');
throws(() => G.mtgRedeem({ w: [0, 1, 2] }), '回数が おわった');
throws(() => G.mtgRedeem({ w: [5, 5, 5] }), 'ない あいことば');

// ---- 行が 1000を こえても ----
setUser('taro@school.ed.jp');
for (let k = 0; k < 1100; k++) G.mtgResult({ i: `2-${k.toString(16).padStart(8, '0')}`, r: 'w', n: [0, 0], p: 'R' });
ok(rows('デッキの点').length > 1100, `デッキの点が 1000行を こえても 書ける（${rows('デッキの点').length}）`);

// ---- ゲームを 最新に する（GitHub → シート）----
setUser(OWNER);
ok(G.doGet().content === 'FILE:index', 'はじめは clasp で 上げた index を 出す');
let info = G.mtgAdminUpdate();
ok(info.from === 'file' && fetched.some((u) => u.includes('/abc1234def/gas/index.html')), 'おなじ 版なら ファイルの まま（コミットの sha で とる）');
const bump = (n, s) => (n === 'index.html' ? s.replace(/<!--mtg-built:(\d+)/, (_, b) => `<!--mtg-built:${+b + 1000}`) : s.replace(/"cards":\{/, '"cards":{"NEW1":[2,"R"],'));
setWeb(bump);
info = G.mtgAdminUpdate();
ok(info.from === 'github' && info.sha === 'abc1234def', 'あたらしい 版を とる');
const html = G.doGet().content;
ok(html.startsWith('<!doctype html>') && html.length > 2000000 && html.includes('pack-js'), `シートから 出す（${html.length}字）`);
ok(Object.keys(cache).some((k) => k.startsWith('game:')), 'キャッシュに のる');
for (const k of Object.keys(cache)) if (k.startsWith('game:')) delete cache[k];
ok(G.doGet().content === html, 'キャッシュが きえても シートから おなじ もの');
ok(G.mtgAdminGet().game.from === 'github', '管理画面に 版が 出る');
const nd = [...Array(4).fill('NEW1'), ...Array(16).fill(Object.values(BY_ID).find((d) => d.basic && d.color === 'R').id)];
ok(/^1-/.test(G.mtgSubmitGhost({ d: nd, t: 1, n: [0, 0] }).i), 'GitHub から とった あたらしい カードも デッキの チェックを とおる');
setWeb((n, s) => bump(n, s).replace(/server:\w+/, 'server:zzzz').replace(/"server":"\w+"/, '"server":"zzzz"'));
throws(() => G.mtgAdminUpdate(), 'サーバーが ふるい ときは 最新に しない');
setWeb((n, s) => (n === 'index.html' ? 'こわれた' : s));
throws(() => G.mtgAdminUpdate(), 'こわれた ファイルは とらない');
setUser('taro@school.ed.jp');
throws(() => G.mtgAdminUpdate(), '子どもは 最新に できない');

// ---- SHEET_ID（データを 学校の ドライブの シートに）----
{ const m = makeGas(); m.props.SHEET_ID = ' SCHOOL '; ok(m.G.mtgConfig().login, 'SHEET_ID の シートを つかう'); }
{ const m = makeGas(); m.props.SHEET_ID = 'NOPE'; throws(() => m.G.mtgRanking(), 'SHEET_ID が まちがって いたら エラー'); }

// ---- ひっこし（エディタで 実行する）は 先生だけ ----
{ const m = makeGas('taro@school.ed.jp'); m.props['deck:2-00000001'] = JSON.stringify({ s: 3, n: [1, 2], p: 'R', u: 0 });
  throws(() => m.G.mtgMigrate(), '子どもは ひっこしを よべない');
  m.setUser(OWNER); m.G.mtgMigrate();
  ok((m.book.sheets['デッキの点']?.sh.cells || []).slice(1).some((r) => r && r[0] === '2-00000001'), '先生は ひっこしできる'); }

// ---- index.html を 上げて いない とき（エディタに Code.gs だけ）----
{ const m = makeGas(OWNER); m.setNoFile(true);
  ok(/mtgAdminUpdate/.test(m.G.doGet().content), 'index が ない ときは あんないを 出す');
  m.G.mtgAdminUpdate();
  ok(m.G.doGet().content.includes('pack-js'), 'mtgAdminUpdate の あとは とって きた ゲームを 出す（おなじ 版でも）'); }

console.log(bad ? `\n${bad}こ NG` : '\nぜんぶ OK');
process.exit(bad ? 1 : 0);
