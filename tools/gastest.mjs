// gas/Code.gs を Google の かわりの 「にせもの」で うごかして しらべる（スプレッドシート・キャッシュ・ロック・ログイン）
// つかいかた：node mathtcg/tools/build_gas.mjs && node mathtcg/tools/gastest.mjs
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
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
ok(rows('せってい').length === 8, 'せってい シートが できる');
throws(() => G.mtgAdminGet(), '子どもは 管理画面を ひらけない');

// ---- ゴースト ----
const { BY_ID } = await import(join(ROOT, 'js/data/cards.js'));
const deck = Array(20).fill('W01');
const deckOk = [...Array(4).fill('W01'), ...Array(16).fill(Object.values(BY_ID).find((d) => d.basic && d.color === 'W').id)];
const g1 = G.mtgSubmitGhost({ d: deckOk, t: 3, n: [1, 2] });
ok(/^3-[0-9a-f]{8}$/.test(g1.i), 'ゴーストを あずける');
throws(() => G.mtgSubmitGhost({ d: deck.slice(0, 5), t: 3, n: [0, 0] }), '5まいの デッキは うけとらない');
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
ok(info.from === 'file' && fetched.some((u) => u.includes('/abc1234def/mathtcg/gas/index.html')), 'おなじ 版なら ファイルの まま（コミットの sha で とる）');
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

console.log(bad ? `\n${bad}こ NG` : '\nぜんぶ OK');
process.exit(bad ? 1 : 0);
