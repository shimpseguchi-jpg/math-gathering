// マスマティック・ザ・ギャザリング を Google Apps Script の ウェブアプリとして ひらく
// ・ゲーム本体は index.html（node mathtcg/tools/build_gas.mjs で つくる 1ファイル版）
// ・データは この スクリプトが ついている スプレッドシートに おく（シートが なければ じどうで つくる）
//   せってい・かんりしゃ・ゴースト・デッキの点・ランキング・レイド・レイドゴースト・あいことば・あいことばの記録・ひきつぎ
// ・学内（ドメイン内）だけに 公開する。ひらいた 人の 学校アカウントで 先生（かんりしゃ）か どうかと、ひきつぎの もちぬしを 見わける
//   シートには 子どもの メールアドレスは 書かない（ひきつぎは 読めない 番号に かえて おく）
function doGet() {
  var g = game_();
  var out = g.html ? HtmlService.createHtmlOutput(g.html) : HtmlService.createHtmlOutputFromFile('index');
  out.setTitle('マスマティック・ザ・ギャザリング')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  out.addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  try { out.addMetaTag('apple-mobile-web-app-capable', 'yes'); } catch (err) { /* なくても うごく */ }
  try { out.addMetaTag('apple-mobile-web-app-title', 'マスギャザ'); } catch (err) { /* なくても うごく */ }
  return out;
}

// カードの 点数と 色（build_gas.mjs が js/data/cards.js から 書きこむ）。デッキの チェックに つかう
// 「ゲームを 最新に する」で GitHub から とった ほうが 新しければ、そちらを つかう（cards_()）
var CARDS = /*CARDS*/{};
// 弾（build_gas.mjs が 書きこむ）：{ main: [ふつうの 弾], extra: [サブセット・番外編], released: [出ている 弾] }
var SET_IDS = /*SETS*/{ main: [1, 2], extra: [], released: [1, 2] };
var BUILT = /*BUILT*/0;          // この Code.gs と index.html を つくった 時刻（build_gas.mjs）
var SERVER_VER = /*SERVER*/'';   // サーバーの しくみの 版（tools/gas_Code.gs の ハッシュ）。ゲーム本体と あって いないと 最新に できない
var NAME_A = 20, NAME_B = 20; // なまえの 定型語の 数（js/ui/online.js の NAME_A・NAME_B）
var CODE_C = 10;              // あいことばの 3つめの ことば（かず）の 数
var DECK_SIZE = 20, CAPACITY = 30;
var POINTS = { w: 2, d: 1, l: -1 };  // デッキの 点：かち・ひきわけ・まけ
var RANK_SIZE = 20;                 // ランキングに のせる 数
var JST = 9 * 3600 * 1000;
var SAVE_CELL = 45000;              // ひきつぎ：1マスに 入れる 文字数（1マスの 上限は 5万字）
var SAVE_MAX = 40 * SAVE_CELL;      // ひきつぎの 大きさの 上限（約 1.8MB）

// ───── スプレッドシート ─────
// [シートの なまえ, 見出し]。どの シートも 書式は「書式なしテキスト」（ID や 日時が 勝手に 数や 日付に ならないように）
var SHEETS = {
  conf: ['せってい', ['こうもく', 'あたい', 'せつめい']],
  admin: ['かんりしゃ', ['メールアドレス', 'メモ']],
  ghost: ['ゴースト', ['ID', '階', 'なまえ1', 'なまえ2', 'デッキ', 'かち', 'まけ', 'あずけた日時']],
  deck: ['デッキの点', ['ID', '点', 'なまえ1', 'なまえ2', '色', 'こうしん']],
  rank: ['ランキング', ['じゅんい', '点', 'なまえ1', 'なまえ2', '色', 'ID']],
  raid: ['レイド', ['レイドID', 'しゅるい', 'キー', '点']],
  raidg: ['レイドゴースト', ['レイドID', '陣営', 'ID', '統率者', 'デッキ', 'なまえ1', 'なまえ2', '日時', 'まもった', 'いる']],
  code: ['あいことば', ['ことば', 'カードID', 'はじまり', 'おわり', 'のこり', 'メモ']],
  used: ['あいことばの記録', ['ことば', 'ひと', '日時']],
  save: ['ひきつぎ', ['ひと', '日時', 'おおきさ', 'データ']],
  game: ['ゲーム本体', ['index', 'cards']] // GitHub から とった ゲーム本体と カードの 一覧（45000字ずつ 下へ）。さわらない
};
// せってい シートの こうもく：[キー, はじめの あたい, せつめい]
var CONF = [
  ['パックの弾', '', 'パックに 入れる 弾の 番号（カンマで くぎる。例：1,2）。空なら 出ている 弾 ぜんぶ'],
  ['つかわない弾', '', 'もんしょうで 解放（かいほう）しても まぜない サブセット・番外編の 番号（例：10,11,12）'],
  ['レイドID', 'tarkir-1', 'レイドの なまえ（tarkir-1、tarkir-2 …。かえると 点と ゴーストが 0から）'],
  ['レイドのおわり', '2026/11/01 20:00', 'レイドが おわる 日時（日本時間）。空なら レイドなし'],
  ['ランキングの時刻', '7,17', 'ランキングを こうしんする 時刻（日本時間・カンマで くぎる）'],
  ['ゴーストの数', '30', 'とどいた 階ごとに のこす ゴーストの 数（ふるい ものから けす）'],
  ['レイドゴーストの数', '20', '陣営ごとに のこす レイドの ゴーストの 数'],
  ['読みこみ元', 'claude/math-tcg-requirements-8oklux', '「ゲームを 最新に する」で ゲーム本体を とる GitHub の ブランチ（マージした あとは ccr-a96fc02a-yijbz1）']
];

// データを おく スプレッドシート。スクリプト プロパティ SHEET_ID が あれば その シート（学校の アカウントの ドライブに おく とき）、
// なければ スクリプトが ついて いる シート
var BOOK_ = null;
function book_() {
  if (BOOK_) return BOOK_;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(String(id).trim()) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('スプレッドシートが ない');
  return (BOOK_ = ss);
}
var SH_ = {};
function sh_(k) {
  if (SH_[k]) return SH_[k];
  var d = SHEETS[k], ss = book_(), s = ss.getSheetByName(d[0]);
  if (!s) {
    s = ss.insertSheet(d[0]);
    var w = k === 'save' ? 4 + SAVE_MAX / SAVE_CELL : d[1].length;
    if (s.getMaxColumns() < w) s.insertColumnsAfter(s.getMaxColumns(), w - s.getMaxColumns());
    s.getRange(1, 1, s.getMaxRows(), w).setNumberFormat('@');
    s.getRange(1, 1, 1, d[1].length).setValues([d[1]]).setFontWeight('bold');
    s.setFrozenRows(1);
    if (k === 'conf') s.getRange(2, 1, CONF.length, 3).setValues(CONF);
    if (k === 'game') { if (s.getMaxRows() < 120) s.insertRowsAfter(s.getMaxRows(), 120 - s.getMaxRows()); s.getRange(1, 1, s.getMaxRows(), 2).setNumberFormat('@'); try { s.hideSheet(); } catch (err) { /* みえても よい */ } }
  }
  SH_[k] = s;
  return s;
}
// データの 行（見出しの 下）。[ [セル…] … ]
function rows_(k) {
  var s = sh_(k), n = s.getLastRow(), w = Math.max(s.getLastColumn(), SHEETS[k][1].length);
  return n < 2 ? [] : s.getRange(2, 1, n - 1, w).getValues();
}
function put_(k, i, row) { var r = sh_(k).getRange(i + 2, 1, 1, row.length); r.setNumberFormat('@'); r.setValues([row.map(str_)]); } // i：データの 何行目（0から）
function add_(k, row) {
  var s = sh_(k), n = Math.max(s.getLastRow(), 1);
  if (n + 1 > s.getMaxRows()) s.insertRowsAfter(s.getMaxRows(), 500); // シートの 行が たりなく なったら ふやす（書式は put_ で つける）
  put_(k, n - 1, row);
}
function del_(k, idx) { var s = sh_(k); idx.slice().sort(function (a, b) { return b - a; }).forEach(function (i) { s.deleteRow(i + 2); }); }
function str_(v) { return v === null || v === undefined ? '' : String(v); }
function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
// 日時は「2026/10/27 15:00:00」（日本時間）で 書く
function time_(ms) { return Utilities.formatDate(new Date(ms), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'); }
function ms_(v) {
  if (v instanceof Date) return v.getTime();
  var m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(v || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - JST : 0;
}
function ids_(v) { return String(v || '').split(/[,、\s]+/).map(Number).filter(function (x) { return x > 0; }); }
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// せってい（5分 おぼえておく。先生が かえたら すぐ わすれる）
function conf_() {
  var c = CacheService.getScriptCache(), v = c.get('conf');
  if (v) return JSON.parse(v);
  var o = {};
  CONF.forEach(function (r) { o[r[0]] = r[1]; });
  rows_('conf').forEach(function (r) { if (r[0]) o[String(r[0])] = str_(r[1]); });
  c.put('conf', JSON.stringify(o), 300);
  return o;
}
function setConf_(key, val) {
  var list = rows_('conf');
  for (var i = 0; i < list.length; i++) if (String(list[i][0]) === key) { put_('conf', i, [key, val]); return; }
  var def = CONF.filter(function (r) { return r[0] === key; })[0];
  add_('conf', [key, val, def ? def[2] : '']);
}
function keep_() { return Math.max(1, Math.min(200, num_(conf_()['ゴーストの数']) || 30)); }

// ───── ひと（学校アカウント）─────
// メールアドレスは シートに 書かない。ひきつぎ・あいことばの 記録には 読めない 番号（ハッシュ）を つかう
function email_() { try { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (err) { return ''; } }
function owner_() { try { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (err) { return ''; } }
function who_() {
  var e = email_();
  if (!e) return '';
  var p = PropertiesService.getScriptProperties(), salt = p.getProperty('SALT');
  if (!salt) { salt = Utilities.getUuid(); p.setProperty('SALT', salt); }
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + e).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').slice(0, 24);
}
// 先生（かんりしゃ）：この スクリプトを デプロイした 人と、かんりしゃ シートに 書いた 人
function isAdmin_() {
  var e = email_();
  if (!e) return false;
  if (e === owner_()) return true;
  return rows_('admin').some(function (r) { return String(r[0]).trim().toLowerCase() === e; });
}
function needAdmin_() { if (!isAdmin_()) throw new Error('先生だけが つかえる'); }

// ───── はじめに よぶ：せってい と じぶんの こと ─────
// → { admin, login, sets: [弾]|null, ban: [弾], raid: { id, ends }|null, saved: { at, size }|null }
function mtgConfig() {
  var c = conf_(), me = who_(), sets = ids_(c['パックの弾']).filter(function (x) { return sets_().main.indexOf(x) >= 0; });
  return {
    admin: isAdmin_(), login: !!me,
    sets: sets.length ? sets : null,
    ban: ids_(c['つかわない弾']).filter(function (x) { return sets_().extra.indexOf(x) >= 0; }),
    raid: raidNow_(),
    saved: me ? saveInfo_(me) : null
  };
}

// ───── オンライン バトル ─────
function idOk_(id) { return /^[1-6]-[0-9a-f]{8}$/.test(String(id || '')); }
function tierOf_(id) { var m = /^([1-6])-[0-9a-f]{8}$/.exec(String(id || '')); return m ? Number(m[1]) : 0; }
// デッキの 色（W・U・K・R・G の じゅん。旗が あれば 3色）
function pairOf_(d) {
  var has = {};
  d.forEach(function (id) { var c = cards_()[id]; if (c) for (var k = 0; k < c[1].length; k++) has[c[1].charAt(k)] = 1; });
  return 'WUKRG'.split('').filter(function (c) { return has[c]; }).join('');
}
// デッキが ルールどおりか（20まい・30点まで・2色まで。旗が あれば その 3色まで。きほんカードは 0点）
function checkDeck_(d) {
  if (!Array.isArray(d) || d.length !== DECK_SIZE) throw new Error('デッキは 20まい');
  var pts = 0, colors = {}, count = {}, banner = null;
  for (var i = 0; i < d.length; i++) {
    var c = cards_()[d[i]];
    if (!c) throw new Error('しらない カード');
    pts += c[0];
    if (c[2]) banner = c[2];
    for (var k = 0; k < c[1].length; k++) colors[c[1].charAt(k)] = 1;
    count[d[i]] = (count[d[i]] || 0) + 1;
    if (c[0] > 0 && count[d[i]] > 8) throw new Error('おなじ カードが おおすぎる');
  }
  if (pts > CAPACITY) throw new Error('点数が おおすぎる');
  var cs = Object.keys(colors);
  if (cs.length > 2 && !(banner && cs.length <= 3 && cs.every(function (k) { return banner.indexOf(k) >= 0; }))) throw new Error('色が おおすぎる');
  return d.map(String);
}
function checkName_(n) {
  if (!Array.isArray(n) || n.length !== 2) return [0, 0];
  var a = Math.floor(Number(n[0])), b = Math.floor(Number(n[1]));
  return [a >= 0 && a < NAME_A ? a : 0, b >= 0 && b < NAME_B ? b : 0];
}
// ゴーストの 行 ⇔ { i, t, n, d, w, l, c }
function ghostOf_(r) { return { i: String(r[0]), t: num_(r[1]), n: [num_(r[2]), num_(r[3])], d: JSON.parse(r[4] || '[]'), w: num_(r[5]), l: num_(r[6]), c: ms_(r[7]) }; }
function ghostRow_(g) { return [g.i, g.t, g.n[0], g.n[1], JSON.stringify(g.d), g.w, g.l, time_(g.c)]; }
function findRow_(k, id) { var list = rows_(k); for (var i = 0; i < list.length; i++) if (String(list[i][0]) === id) return { i: i, r: list[i] }; return null; }

// ゴーストを あずける。{ d: [カードID×20], t: とどいた 階（1〜5、クリアは 6）, n: [なまえ, なまえ] } → { i: ID }
function mtgSubmitGhost(g) {
  var tier = Math.floor(Number(g && g.t));
  if (!(tier >= 1 && tier <= 6)) throw new Error('階が おかしい');
  var ghost = {
    i: tier + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8),
    n: checkName_(g.n), d: checkDeck_(g.d), t: tier, w: 0, l: 0, c: Date.now()
  };
  withLock_(function () {
    add_('ghost', ghostRow_(ghost));
    // おなじ 階が おおすぎたら ふるい ものから けす
    var same = [];
    rows_('ghost').forEach(function (r, i) { if (num_(r[1]) === tier) same.push(i); });
    if (same.length > keep_()) del_('ghost', same.slice(0, same.length - keep_()));
    // デッキの 点（ゴーストが けされても のこる）
    add_('deck', [ghost.i, 0, ghost.n[0], ghost.n[1], pairOf_(ghost.d), time_(ghost.c)]);
  });
  return { i: ghost.i };
}

// あいてを さがす：あずかっている ゴースト ぜんぶから ランダムに 1人（じぶんの ゴーストは のぞく）。いなければ null
// { x: [じぶんの ゴーストID] }
function mtgRandomGhost(q) {
  var mine = (q && Array.isArray(q.x)) ? q.x.map(String) : [];
  var pool = rows_('ghost').filter(function (r) { return r[0] && mine.indexOf(String(r[0])) < 0; });
  return pool.length ? ghostOf_(pool[Math.floor(Math.random() * pool.length)]) : null;
}

// ゴーストの 勝ち負けを 1つ たす（win：ゴーストが かった）
function ghostWL_(id, win) {
  var h = findRow_('ghost', id);
  if (!h) return null;
  var g = ghostOf_(h.r);
  if (win) g.w = Math.min(99999, g.w + 1); else g.l = Math.min(99999, g.l + 1);
  put_('ghost', h.i, ghostRow_(g));
  return g;
}
// （ふるい 画面の ため のこす）たたかいの けっか：{ i: ゴーストID, w: ゴーストが かったか }
function mtgReport(r) {
  var id = String((r && r.i) || '');
  if (!tierOf_(id)) throw new Error('ゴーストが いない');
  return withLock_(function () { var g = ghostWL_(id, !!r.w); return g ? { w: g.w, l: g.l } : null; });
}

// たたかいの けっか（デッキの 点つき）：{ g: あいての ゴーストID, i: じぶんの デッキID, r: 'w'|'l'|'d'（じぶんから 見て）, n: なまえ, p: 2色 }
// → { s: じぶんの デッキの 点 }（デッキIDが ない とき・サーバーに ない ときは s: null）
function mtgResult(q) {
  var res = String(q && q.r);
  if (!(res in POINTS)) throw new Error('けっかが おかしい');
  return withLock_(function () {
    // あいての ゴーストの 勝ち負け（ひきわけは 数えない）
    var gid = String(q.g || '');
    if (tierOf_(gid) && res !== 'd') ghostWL_(gid, res === 'l');
    // じぶんの デッキの 点
    var id = String(q.i || '');
    if (!idOk_(id)) return { s: null };
    var h = findRow_('deck', id), n = checkName_(q.n);
    var s = Math.max(0, Math.min(99999, (h ? num_(h.r[1]) : 0) + POINTS[res]));
    var row = [id, s, n[0], n[1], h ? str_(h.r[4]) : String(q.p || '').replace(/[^WUKGR]/g, '').slice(0, 3), time_(Date.now())];
    if (h) put_('deck', h.i, row); else add_('deck', row);
    return { s: s };
  });
}

// ランキング：上位20の デッキ。毎日 ランキングの時刻 に こうしんする（その あとで はじめて 見た 人が つくりなおす）
// → { at: こうしんした 時刻, next: つぎの こうしん, l: [[点, なまえ1, なまえ2, 2色, デッキID]…] }
function slots_(now) {
  var hours = ids_(conf_()['ランキングの時刻']).filter(function (h) { return h < 24; });
  if (!hours.length) hours = [7, 17];
  // 日本時間の きょう 0時（UTC の ミリ秒）
  var day = Math.floor((now + JST) / 86400000) * 86400000 - JST;
  var all = [];
  [-1, 0, 1].forEach(function (k) { hours.forEach(function (h) { all.push(day + k * 86400000 + h * 3600000); }); });
  all.sort(function (a, b) { return a - b; });
  var last = all.filter(function (x) { return x <= now; }).pop();
  var next = all.filter(function (x) { return x > now; })[0];
  return { last: last, next: next };
}
function rankSnap_() {
  var at = num_(PropertiesService.getScriptProperties().getProperty('RANK_AT'));
  return { at: at, l: rows_('rank').map(function (r) { return [num_(r[1]), num_(r[2]), num_(r[3]), String(r[4]), String(r[5])]; }) };
}
function mtgRanking() {
  var now = Date.now(), sl = slots_(now), snap = rankSnap_();
  if (snap.at < sl.last) {
    snap = withLock_(function () {
      var cur = rankSnap_();
      if (cur.at >= sl.last) return cur;
      var rows = [], old = [];
      rows_('deck').forEach(function (r, i) {
        var s = num_(r[1]), u = ms_(r[5]);
        // 0点の まま 30日 たった デッキは けす
        if (!s && now - u > 30 * 86400000) { old.push(i); return; }
        if (s > 0) rows.push([s, num_(r[2]), num_(r[3]), String(r[4]), String(r[0]), u]);
      });
      if (old.length) del_('deck', old);
      rows.sort(function (a, b) { return b[0] - a[0] || a[5] - b[5]; }); // 点が 同じなら 先に とった デッキが 上
      var top = rows.slice(0, RANK_SIZE);
      var s = sh_('rank');
      if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, 6).clearContent();
      top.forEach(function (r, i) { put_('rank', i, [i + 1, r[0], r[1], r[2], r[3], r[4]]); });
      PropertiesService.getScriptProperties().setProperty('RANK_AT', String(sl.last));
      return { at: sl.last, l: top.map(function (r) { return r.slice(0, 5); }) };
    });
  }
  return { at: snap.at, next: sl.next, l: snap.l };
}

// じぶんの ゴーストの 勝ち負けと デッキの 点：[ID…] → [{ i, w, l, s }]（もう けされた ものは かえさない）
function mtgMyGhosts(ids) {
  if (!Array.isArray(ids)) return [];
  var gs = {}, ds = {}, out = [];
  rows_('ghost').forEach(function (r) { gs[String(r[0])] = r; });
  rows_('deck').forEach(function (r) { ds[String(r[0])] = r; });
  ids.slice(0, 10).forEach(function (id) {
    id = String(id); if (!tierOf_(id)) return;
    var g = gs[id] ? ghostOf_(gs[id]) : null, s = ds[id] ? num_(ds[id][1]) : null;
    if (g || s !== null) out.push({ i: id, w: g ? g.w : null, l: g ? g.l : null, s: s });
  });
  return out;
}

// ───── レイド（docs/RAID.md）：タルキール大戦（統率者戦）─────
// レイド シート：[レイドID, '陣営'|'統率者', キー, 点]
// レイドゴースト シート：[レイドID, 陣営, ゴーストID, 統率者, デッキ, なまえ1, なまえ2, 日時, まもった 回数, いる（1 / 空）]
//   陣営ごとに「レイドゴーストの数」まで いる。おちても 行は のこす（まもった 回数を おぼえて おくため）
// レイドの ID と おわる 時刻は せってい シート。おわった あとも 30分は たたかいの けっかを うけとる
var RAID_GRACE = 30 * 60 * 1000;
var RAID_CMD = { dragon: ['RG07', 'WG07', 'KR07', 'WU07', 'UK07'], human: ['AB02', 'JE02', 'SU02', 'MA02', 'TE02'] };
var RAID_DEF = 3; // ぼうえい点：ゴーストが かつと その 陣営に ＋3
function raidGid_(i) { i = String(i || ''); return /^[0-9a-f]{12}$/.test(i) ? i : ''; }
function raidNow_() { var c = conf_(), ends = ms_(c['レイドのおわり']), id = String(c['レイドID'] || ''); return ends && /^tarkir-\d+$/.test(id) ? { id: id, ends: ends } : null; }
function raidId_(q) { var r = raidNow_(), id = String(q && q.id); if (!r || r.id !== id) throw new Error('レイドが ない'); return id; }
function raidFaction_(q) { var f = String(q && q.f); if (!RAID_CMD[f]) throw new Error('陣営が おかしい'); return f; }
function raidCmd_(f, c) { c = String(c || ''); if (RAID_CMD[f].indexOf(c) < 0) throw new Error('統率者が おかしい'); return c; }
function raidLive_(grace) { var r = raidNow_(); if (!r || Date.now() > r.ends + (grace ? RAID_GRACE : 0)) throw new Error('レイドは おわった'); }
function raidKeep_() { return Math.max(1, Math.min(100, num_(conf_()['レイドゴーストの数']) || 20)); }
function raidScore_(id) {
  var s = { f: { dragon: 0, human: 0 }, c: {} };
  rows_('raid').forEach(function (r) { if (String(r[0]) !== id) return; if (r[1] === '陣営') s.f[String(r[2])] = num_(r[3]); else s.c[String(r[2])] = num_(r[3]); });
  return s;
}
function raidAddPts_(id, f, c, add) {
  var list = rows_('raid'), hitF = -1, hitC = -1;
  list.forEach(function (r, i) { if (String(r[0]) !== id) return; if (r[1] === '陣営' && String(r[2]) === f) hitF = i; if (r[1] === '統率者' && String(r[2]) === c) hitC = i; });
  var fv = Math.min(99999999, (hitF >= 0 ? num_(list[hitF][3]) : 0) + add), cv = Math.min(99999999, (hitC >= 0 ? num_(list[hitC][3]) : 0) + add);
  if (hitF >= 0) put_('raid', hitF, [id, '陣営', f, fv]); else add_('raid', [id, '陣営', f, fv]);
  if (hitC >= 0) put_('raid', hitC, [id, '統率者', c, cv]); else add_('raid', [id, '統率者', c, cv]);
}

// 点を たす：{ id, f, c, w: 1（かった）, fin: 1（統率者で とどめ）, q: といた 問題の 数 } → { f, c }
function mtgRaidAdd(q) {
  var id = raidId_(q), f = raidFaction_(q), c = raidCmd_(f, q.c);
  raidLive_(true);
  var add = (Number(q.w) === 1 ? 10 : 0) + (Number(q.w) === 1 && Number(q.fin) === 1 ? 5 : 0) + Math.max(0, Math.min(200, Math.floor(Number(q.q) || 0)));
  return withLock_(function () { raidAddPts_(id, f, c, add); return raidScore_(id); });
}
// 陣営と 統率者の 点。{ id, me: じぶんの ゴーストID, f: じぶんの 陣営 } → { f, c, mine: { w: まもった 回数, alive: ゴーストが いるか } }
function mtgRaidState(q) {
  var id = raidId_(q), s = raidScore_(id), me = raidGid_(q && q.me);
  if (me) {
    var g = rows_('raidg').filter(function (r) { return String(r[0]) === id && String(r[2]) === me; })[0];
    s.mine = { w: g ? num_(g[8]) : 0, alive: !!(g && String(g[9]) === '1') };
  }
  return s;
}
// ぼうえい：あいての ゴーストが かった。{ id, g: ゴーストID } → ゴーストの 陣営と 統率者に ＋3
function mtgRaidDefend(q) {
  var id = raidId_(q), gid = raidGid_(q && q.g);
  if (!gid) throw new Error('ゴーストが いない');
  raidLive_(true);
  return withLock_(function () {
    var list = rows_('raidg');
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (String(r[0]) !== id || String(r[2]) !== gid) continue;
      r[8] = num_(r[8]) + 1;
      put_('raidg', i, r.slice(0, 10));
      raidAddPts_(id, String(r[1]), String(r[3]), RAID_DEF);
      return { w: r[8] };
    }
    return null;
  });
}
// じぶんの 統率者デッキを ゴーストに：{ id, f, c, i: まえの ゴーストID, d: [カードID×20], n: [なまえ, なまえ] }。色は 統率者の 色だけ
function mtgRaidSubmit(q) {
  var id = raidId_(q), f = raidFaction_(q), c = raidCmd_(f, q.c);
  raidLive_(false);
  var d = q && q.d;
  if (!Array.isArray(d) || d.length !== DECK_SIZE) throw new Error('デッキは 20まい');
  var ok = cards_()[c][1];
  d = d.map(String);
  var pts = 0;
  d.forEach(function (x) { var k = cards_()[x]; if (!k) throw new Error('しらない カード'); pts += k[0]; for (var i = 0; i < k[1].length; i++) if (ok.indexOf(k[1].charAt(i)) < 0) throw new Error('統率者の 色で ない'); });
  if (pts > CAPACITY) throw new Error('点数が おおすぎる');
  var n = checkName_(q.n);
  return withLock_(function () {
    // おなじ ID で 出しなおす とき（いなく なった とき）は 入れかえ。まもった 回数は のこす
    var gid = raidGid_(q.i) || Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    var list = rows_('raidg'), def = 0, drop = [];
    list.forEach(function (r, i) { if (String(r[0]) === id && String(r[2]) === gid) { def = num_(r[8]); drop.push(i); } });
    if (drop.length) del_('raidg', drop);
    add_('raidg', [id, f, gid, c, JSON.stringify(d), n[0], n[1], time_(Date.now()), def, '1']);
    // 陣営の いる ゴーストが おおすぎたら ふるい ものから「いない」に する
    list = rows_('raidg');
    var alive = [];
    list.forEach(function (r, i) { if (String(r[0]) === id && String(r[1]) === f && String(r[9]) === '1') alive.push(i); });
    alive.slice(0, Math.max(0, alive.length - raidKeep_())).forEach(function (i) { var r = list[i].slice(0, 10); r[9] = ''; r[4] = ''; put_('raidg', i, r); });
    return { i: gid };
  });
}
// あいて：ちがう 陣営の ゴーストから ランダムに 1人。いなければ null
function mtgRaidGhost(q) {
  var id = raidId_(q), f = raidFaction_(q), other = f === 'dragon' ? 'human' : 'dragon';
  var list = rows_('raidg').filter(function (r) { return String(r[0]) === id && String(r[1]) === other && String(r[9]) === '1'; });
  if (!list.length) return null;
  var r = list[Math.floor(Math.random() * list.length)];
  return { i: String(r[2]), c: String(r[3]), d: JSON.parse(r[4] || '[]'), n: [num_(r[5]), num_(r[6])], u: ms_(r[7]) };
}

// ───── ひきつぎ（セーブの バックアップ）─────
// 学校アカウントごとに 1つ。シートの 1行：[ひと（読めない 番号）, 日時, おおきさ, データを 45000字ずつ …]
function saveInfo_(me) { var h = findRow_('save', me); return h ? { at: ms_(h.r[1]), size: num_(h.r[2]) } : null; }
function needWho_() { var me = who_(); if (!me) throw new Error('学校の アカウントで ひらいて ください'); return me; }
// あずける：data は セーブの 文字列（JSON）→ { at, size }
function mtgSaveUpload(data) {
  var me = needWho_();
  data = String(data || '');
  if (!data || data.length > SAVE_MAX) throw new Error('セーブが 大きすぎる');
  try { JSON.parse(data); } catch (err) { throw new Error('セーブが こわれて いる'); } // こわれた データは うけとらない
  var row = [me, time_(Date.now()), data.length];
  for (var k = 0; k < data.length; k += SAVE_CELL) row.push(data.slice(k, k + SAVE_CELL));
  return withLock_(function () {
    var h = findRow_('save', me), s = sh_('save');
    if (h) { s.getRange(h.i + 2, 1, 1, s.getLastColumn()).clearContent(); put_('save', h.i, row); } else add_('save', row);
    return saveInfo_(me);
  });
}
// もどす → { at, data }（あずけて いなければ null）
function mtgSaveDownload() {
  var me = needWho_(), h = findRow_('save', me);
  if (!h) return null;
  return { at: ms_(h.r[1]), data: h.r.slice(3).map(str_).join('') };
}

// ───── あいことば（docs/PROMO.md 2.2）─────
// ことばは 3つの 番号「a-b-c」（なまえの 定型語 NAME_A・NAME_B と かず）。プルダウンで えらぶので 打ちまちがいが ない
// 1つの アカウントで 1つの ことばは 1回だけ
function codeKey_(w) {
  if (!Array.isArray(w) || w.length !== 3) return '';
  var a = Math.floor(Number(w[0])), b = Math.floor(Number(w[1])), c = Math.floor(Number(w[2]));
  return a >= 0 && a < NAME_A && b >= 0 && b < NAME_B && c >= 0 && c < CODE_C ? a + '-' + b + '-' + c : '';
}
// { w: [a, b, c] } → { card: カードID }
function mtgRedeem(q) {
  var me = needWho_(), key = codeKey_(q && q.w);
  if (!key) throw new Error('ことばが おかしい');
  return withLock_(function () {
    var h = findRow_('code', key), now = Date.now();
    if (!h) throw new Error('その あいことばは ない');
    var r = h.r, from = ms_(r[2]), to = ms_(r[3]), left = String(r[4]) === '' ? -1 : num_(r[4]);
    if ((from && now < from) || (to && now > to)) throw new Error('いまは つかえない あいことば');
    if (rows_('used').some(function (u) { return String(u[0]) === key && String(u[1]) === me; })) throw new Error('もう もらった');
    if (left === 0) throw new Error('もう おわり');
    if (left > 0) { r = r.slice(0, 6); r[4] = left - 1; put_('code', h.i, r); }
    add_('used', [key, me, time_(now)]);
    return { card: String(r[1]) };
  });
}

// ───── 開発モード（先生だけ）─────
// 管理画面の ための ぜんぶ：{ conf: { こうもく: あたい }, admins: [[メール, メモ]], codes: [[ことば, カード, はじまり, おわり, のこり, メモ]], url, me, owner, count: { ghost, deck, save } }
function mtgAdminGet() {
  needAdmin_();
  return {
    conf: conf_(), url: book_().getUrl(), me: email_(), owner: owner_(),
    admins: rows_('admin').filter(function (r) { return r[0]; }).map(function (r) { return [str_(r[0]), str_(r[1])]; }),
    codes: rows_('code').filter(function (r) { return r[0]; }).map(function (r) { return r.slice(0, 6).map(str_); }),
    game: gameInfo_(),
    count: { ghost: rows_('ghost').length, deck: rows_('deck').length, save: rows_('save').length, used: rows_('used').length }
  };
}
// { conf: { こうもく: あたい }, admins: [[メール, メモ]], codes: [[ことば, カード, はじまり, おわり, のこり, メモ]] }（ある ものだけ かえる）
function mtgAdminSave(q) {
  needAdmin_();
  withLock_(function () {
    if (q && q.conf) CONF.forEach(function (c) { if (c[0] in q.conf) setConf_(c[0], String(q.conf[c[0]] == null ? '' : q.conf[c[0]]).slice(0, 200)); });
    if (q && Array.isArray(q.admins)) replace_('admin', q.admins.filter(function (r) { return /^[^@\s]+@[^@\s]+$/.test(String(r[0]).trim()); }).map(function (r) { return [String(r[0]).trim().toLowerCase(), String(r[1] || '').slice(0, 100)]; }));
    if (q && Array.isArray(q.codes)) replace_('code', q.codes.filter(function (r) { return /^\d+-\d+-\d+$/.test(r[0]) && cards_()[String(r[1])]; }).map(function (r) {
      return [r[0], r[1], r[2] ? time_(ms_(r[2])) : '', r[3] ? time_(ms_(r[3])) : '', String(r[4]) === '' ? '' : Math.max(0, Math.floor(num_(r[4]))), String(r[5] || '').slice(0, 100)];
    }));
    CacheService.getScriptCache().remove('conf');
  });
  return mtgAdminGet();
}
function replace_(k, rows) {
  var s = sh_(k);
  if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, s.getLastColumn()).clearContent();
  rows.forEach(function (r, i) { put_(k, i, r); });
}

// ───── まえの 版（スクリプト プロパティ）からの ひっこし：エディタで 1回だけ 実行する ─────
function mtgMigrate() {
  var p = PropertiesService.getScriptProperties(), all = p.getProperties(), n = 0;
  for (var t = 1; t <= 6; t++) if (all['ghosts:' + t]) JSON.parse(all['ghosts:' + t]).forEach(function (g) { add_('ghost', ghostRow_(g)); n++; });
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('deck:') === 0) { var r = JSON.parse(all[k]), n2 = r.n || [0, 0]; add_('deck', [k.slice(5), r.s || 0, n2[0], n2[1], r.p || '', time_(r.u || Date.now())]); n++; }
    var m = /^raid:([^:]+):score$/.exec(k);
    if (m) { var s = JSON.parse(all[k]); Object.keys(s.f).forEach(function (f) { add_('raid', [m[1], '陣営', f, s.f[f]]); }); Object.keys(s.c).forEach(function (c) { add_('raid', [m[1], '統率者', c, s.c[c]]); }); n++; }
    m = /^raid:([^:]+):g:(\w+)$/.exec(k);
    if (m) { var def = JSON.parse(all['raid:' + m[1] + ':def'] || '{}'); JSON.parse(all[k]).forEach(function (g) { add_('raidg', [m[1], m[2], g.i, g.c, JSON.stringify(g.d), g.n[0], g.n[1], time_(g.u), def[g.i] || 0, '1']); n++; }); }
  });
  Logger.log('ひっこした 数：' + n + '（うまく いったら スクリプト プロパティの ghosts: deck: raid: rank は けして よい）');
}

// ───── ゲーム本体を 最新に する（GitHub → スプレッドシート）─────
// 開発モードの ボタンで、Google の サーバーが 公開リポジトリから gas/index.html と gas/cards.json を とって「ゲーム本体」シートに おく
// iPad は GitHub に つながらない（学校の フィルターでも だいじょうぶ）。Code.gs（サーバーの しくみ）が かわった ときだけ clasp push が いる
var REPO = 'shimpseguchi-jpg/app-maker', GAME_DIR = 'mathtcg/gas/';
var CHUNK_CACHE = 30000; // キャッシュ 1つの 大きさ（上限 100KB。日本語も あるので 小さめ）
// とって ある ゲーム本体（clasp で 上げた ものの ほうが 新しければ ''。そのときは ファイルの ほうを つかう）
function fresh_() { var m = gameMeta_(); return m && m.built > BUILT ? m : null; }
function game_() {
  var meta = fresh_();
  if (!meta) return { html: '' };
  var c = CacheService.getScriptCache(), keys = [];
  for (var i = 0; i < (meta.parts || 0); i++) keys.push('game:' + meta.sha + ':' + i);
  var got = keys.length ? c.getAll(keys) : {};
  if (keys.length && keys.every(function (k) { return k in got; })) return { html: keys.map(function (k) { return got[k]; }).join('') };
  var html = gameRows_().map(function (r) { return str_(r[0]); }).join(''), put = {};
  for (var k = 0, j = 0; k < html.length; k += CHUNK_CACHE, j++) put['game:' + meta.sha + ':' + j] = html.slice(k, k + CHUNK_CACHE);
  try { c.putAll(put, 21600); meta.parts = Object.keys(put).length; PropertiesService.getScriptProperties().setProperty('GAME_META', JSON.stringify(meta)); } catch (err) { /* キャッシュ できなくても シートから よめる */ }
  return { html: html };
}
// カードの 一覧と 弾（デッキの チェック・せってい）。GitHub から とった ほうが 新しければ そちら
var DATA_ = null;
function data_() {
  if (DATA_) return DATA_;
  var meta = fresh_();
  if (!meta) return (DATA_ = { cards: CARDS, sets: SET_IDS });
  var c = CacheService.getScriptCache(), cj = c.get('cards:' + meta.sha);
  if (!cj) { cj = gameRows_().map(function (r) { return str_(r[1]); }).join(''); try { c.put('cards:' + meta.sha, cj, 21600); } catch (err) { /* おおきすぎ */ } }
  var cd = JSON.parse(cj);
  return (DATA_ = { cards: cd.cards, sets: cd.sets });
}
function gameRows_() { var s = sh_('game'), n = s.getLastRow(); return n < 2 ? [] : s.getRange(2, 1, n - 1, 2).getValues(); }
function gameMeta_() { var v = PropertiesService.getScriptProperties().getProperty('GAME_META'); return v ? JSON.parse(v) : null; }
function cards_() { return data_().cards; }
function sets_() { return data_().sets; }
function fetch_(url) {
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'mathgathering-gas' } });
  if (res.getResponseCode() !== 200) throw new Error('GitHub から とれなかった（' + res.getResponseCode() + '）：' + url);
  return res.getContentText('UTF-8');
}
// 開発モードの「ゲームを 最新に する」→ { at, sha, branch, size, built }
function mtgAdminUpdate() {
  needAdmin_();
  var branch = String(conf_()['読みこみ元'] || 'main').trim();
  var sha = branch;
  try { sha = JSON.parse(fetch_('https://api.github.com/repos/' + REPO + '/commits/' + encodeURIComponent(branch))).sha || branch; } catch (err) { /* API が だめでも ブランチ名で とる */ }
  var base = 'https://raw.githubusercontent.com/' + REPO + '/' + sha + '/' + GAME_DIR;
  var html = fetch_(base + 'index.html'), cj = fetch_(base + 'cards.json'), cd = JSON.parse(cj);
  var m = /<!--mtg-built:(\d+) server:(\w*)-->/.exec(html);
  if (!m || html.indexOf('pack-js') < 0 || !cd.cards) throw new Error('ゲーム本体の ファイルが おかしい');
  if (m[2] !== SERVER_VER || cd.server !== SERVER_VER) throw new Error('サーバー（Code.gs）が かわって います。さきに 新しい Code.gs を clasp push して、デプロイを 新バージョンに して ください');
  var built = Number(m[1]);
  withLock_(function () {
    var s = sh_('game'), rows = [], n = Math.max(Math.ceil(html.length / SAVE_CELL), Math.ceil(cj.length / SAVE_CELL));
    for (var i = 0; i < n; i++) rows.push([html.slice(i * SAVE_CELL, (i + 1) * SAVE_CELL), cj.slice(i * SAVE_CELL, (i + 1) * SAVE_CELL)]);
    if (s.getMaxRows() < n + 1) s.insertRowsAfter(s.getMaxRows(), n + 1 - s.getMaxRows());
    if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, 2).clearContent();
    s.getRange(2, 1, n, 2).setNumberFormat('@').setValues(rows);
    var meta = { at: Date.now(), sha: String(sha).slice(0, 40), branch: branch, size: html.length, built: built, parts: 0 };
    PropertiesService.getScriptProperties().setProperty('GAME_META', JSON.stringify(meta));
    DATA_ = null;
  });
  return gameInfo_();
}
// いま 出して いる ゲームの 版 → { from: 'github'|'file', at, sha, branch, built }
function gameInfo_() {
  var meta = fresh_();
  if (meta) return { from: 'github', at: meta.at, sha: meta.sha, branch: meta.branch, built: meta.built };
  return { from: 'file', built: BUILT, branch: String(conf_()['読みこみ元'] || '') };
}
