// マスマティック・ザ・ギャザリング を Google Apps Script の ウェブアプリとして ひらく
// ・ゲーム本体は index.html（node mathtcg/tools/build_gas.mjs で つくる 1ファイル版）
// ・オンライン バトル（非同期）の「ゴースト」を この スクリプトの スクリプト プロパティに あずかる
//   ゴースト = 冒険を おえた デッキ（20まい）と なまえ・とどいた 階・勝ち負けの 数。プレイヤー本人の 情報は もたない
// ・デッキの 点（かち ＋2・ひきわけ ＋1・まけ −1。0より 下には ならない）と、上位20の ランキング（きまった 時刻に こうしん）
function doGet() {
  var out = HtmlService.createHtmlOutputFromFile('index');
  out.setTitle('マスマティック・ザ・ギャザリング')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  out.addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  try { out.addMetaTag('apple-mobile-web-app-capable', 'yes'); } catch (err) { /* なくても うごく */ }
  try { out.addMetaTag('apple-mobile-web-app-title', 'マスギャザ'); } catch (err) { /* なくても うごく */ }
  return out;
}

// ───── オンライン バトル ─────
// カードの 点数と 色（build_gas.mjs が js/data/cards.js から 書きこむ）。デッキの チェックに つかう
var CARDS = /*CARDS*/{};
var NAME_A = 20, NAME_B = 20; // なまえの 定型語の 数（js/ui/online.js の NAME_A・NAME_B）
var DECK_SIZE = 20, CAPACITY = 30;
var KEEP = 30;   // 階ごとに のこす ゴーストの 数（ふるい ものから けす。1件 9KB に おさまる）
var POINTS = { w: 2, d: 1, l: -1 };  // デッキの 点：かち・ひきわけ・まけ
var RANK_SIZE = 20;                 // ランキングに のせる 数
var RANK_HOURS = [7, 17];           // ランキングを こうしんする 時刻（日本時間、毎日）
var JST = 9 * 3600 * 1000;

function key_(tier) { return 'ghosts:' + tier; }
function loadTier_(props, tier) { var v = props.getProperty(key_(tier)); return v ? JSON.parse(v) : []; }
function saveTier_(props, tier, list) { props.setProperty(key_(tier), JSON.stringify(list)); }
function deckKey_(id) { return 'deck:' + id; }
function idOk_(id) { return /^[1-6]-[0-9a-f]{8}$/.test(String(id || '')); }
// デッキの 色（W・U・K・R・G の じゅん。旗が あれば 3色）
function pairOf_(d) {
  var has = {};
  d.forEach(function (id) { var c = CARDS[id]; if (c) for (var k = 0; k < c[1].length; k++) has[c[1].charAt(k)] = 1; });
  return 'WUKRG'.split('').filter(function (c) { return has[c]; }).join('');
}
function tierOf_(id) { var m = /^([1-6])-[0-9a-f]{8}$/.exec(String(id || '')); return m ? Number(m[1]) : 0; }

// デッキが ルールどおりか（20まい・30点まで・2色まで。旗が あれば その 3色まで。きほんカードは 0点）
function checkDeck_(d) {
  if (!Array.isArray(d) || d.length !== DECK_SIZE) throw new Error('デッキは 20まい');
  var pts = 0, colors = {}, count = {}, banner = null;
  for (var i = 0; i < d.length; i++) {
    var c = CARDS[d[i]];
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

// ゴーストを あずける。{ d: [カードID×20], t: とどいた 階（1〜5、クリアは 6）, n: [なまえ, なまえ] } → { i: ID }
function mtgSubmitGhost(g) {
  var tier = Math.floor(Number(g && g.t));
  if (!(tier >= 1 && tier <= 6)) throw new Error('階が おかしい');
  var ghost = {
    i: tier + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8),
    n: checkName_(g.n), d: checkDeck_(g.d), t: tier, w: 0, l: 0, c: Date.now()
  };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var list = loadTier_(props, tier);
    list.push(ghost);
    saveTier_(props, tier, list.slice(-KEEP));
    // デッキの 点（ゴーストが けされても のこる）
    props.setProperty(deckKey_(ghost.i), JSON.stringify({ s: 0, n: ghost.n, p: pairOf_(ghost.d), u: ghost.c }));
  } finally {
    lock.releaseLock();
  }
  return { i: ghost.i };
}

// あいてを さがす：あずかっている ゴースト ぜんぶから ランダムに 1人（じぶんの ゴーストは のぞく）。いなければ null
// { x: [じぶんの ゴーストID] }
function mtgRandomGhost(q) {
  var mine = (q && Array.isArray(q.x)) ? q.x.map(String) : [];
  var props = PropertiesService.getScriptProperties();
  var pool = [];
  for (var t = 1; t <= 6; t++) loadTier_(props, t).forEach(function (g) { if (mine.indexOf(g.i) < 0) pool.push(g); });
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

// （ふるい 画面の ため のこす）たたかいの けっか：{ i: ゴーストID, w: ゴーストが かったか }
function mtgReport(r) {
  var id = String((r && r.i) || ''), tier = tierOf_(id);
  if (!tier) throw new Error('ゴーストが いない');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var list = loadTier_(props, tier);
    for (var k = 0; k < list.length; k++) if (list[k].i === id) {
      if (r.w) list[k].w = Math.min(99999, list[k].w + 1); else list[k].l = Math.min(99999, list[k].l + 1);
      saveTier_(props, tier, list);
      return { w: list[k].w, l: list[k].l };
    }
  } finally {
    lock.releaseLock();
  }
  return null;
}

// たたかいの けっか（デッキの 点つき）：{ g: あいての ゴーストID, i: じぶんの デッキID, r: 'w'|'l'|'d'（じぶんから 見て）, n: なまえ, p: 2色 }
// → { s: じぶんの デッキの 点 }（デッキIDが ない とき・サーバーに ない ときは s: null）
function mtgResult(q) {
  var res = String(q && q.r);
  if (!(res in POINTS)) throw new Error('けっかが おかしい');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    // あいての ゴーストの 勝ち負け（ひきわけは 数えない）
    var gid = String(q.g || ''), tier = tierOf_(gid);
    if (tier && res !== 'd') {
      var list = loadTier_(props, tier);
      for (var k = 0; k < list.length; k++) if (list[k].i === gid) {
        if (res === 'l') list[k].w = Math.min(99999, list[k].w + 1); else list[k].l = Math.min(99999, list[k].l + 1);
        saveTier_(props, tier, list);
        break;
      }
    }
    // じぶんの デッキの 点
    var id = String(q.i || '');
    if (!idOk_(id)) return { s: null };
    var v = props.getProperty(deckKey_(id));
    var rec = v ? JSON.parse(v) : { s: 0, p: String(q.p || '').replace(/[^WUKGR]/g, '').slice(0, 3) };
    rec.s = Math.max(0, Math.min(99999, rec.s + POINTS[res]));
    rec.n = checkName_(q.n);
    rec.u = Date.now();
    props.setProperty(deckKey_(id), JSON.stringify(rec));
    return { s: rec.s };
  } finally {
    lock.releaseLock();
  }
}

// ランキング：上位20の デッキ。毎日 RANK_HOURS の 時刻に こうしんする（その あとで はじめて 見た 人が つくりなおす）
// → { at: こうしんした 時刻, next: つぎの こうしん, l: [[点, なまえ1, なまえ2, 2色, デッキID]…] }
function slots_(now) {
  // 日本時間の きょう 0時（UTC の ミリ秒）
  var day = Math.floor((now + JST) / 86400000) * 86400000 - JST;
  var all = [];
  [-1, 0, 1].forEach(function (k) { RANK_HOURS.forEach(function (h) { all.push(day + k * 86400000 + h * 3600000); }); });
  all.sort(function (a, b) { return a - b; });
  var last = all.filter(function (x) { return x <= now; }).pop();
  var next = all.filter(function (x) { return x > now; })[0];
  return { last: last, next: next };
}
function mtgRanking() {
  var now = Date.now(), sl = slots_(now);
  var props = PropertiesService.getScriptProperties();
  var v = props.getProperty('rank');
  var snap = v ? JSON.parse(v) : null;
  if (!snap || snap.at < sl.last) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      v = props.getProperty('rank'); snap = v ? JSON.parse(v) : null;
      if (!snap || snap.at < sl.last) {
        var all = props.getProperties(), rows = [];
        Object.keys(all).forEach(function (k) {
          if (k.indexOf('deck:') !== 0) return;
          var r = JSON.parse(all[k]), id = k.slice(5);
          // 0点の まま 30日 たった デッキは けす（ほぞんの 上限の ため）
          if (!r.s && now - (r.u || 0) > 30 * 86400000) { props.deleteProperty(k); return; }
          if (r.s > 0) rows.push([r.s, r.n[0], r.n[1], r.p, id, r.u || 0]);
        });
        rows.sort(function (a, b) { return b[0] - a[0] || a[5] - b[5]; }); // 点が 同じなら 先に とった デッキが 上
        snap = { at: sl.last, l: rows.slice(0, RANK_SIZE).map(function (r) { return r.slice(0, 5); }) };
        props.setProperty('rank', JSON.stringify(snap));
      }
    } finally {
      lock.releaseLock();
    }
  }
  return { at: snap.at, next: sl.next, l: snap.l };
}

// じぶんの ゴーストの 勝ち負けと デッキの 点：[ID…] → [{ i, w, l, s }]（もう けされた ものは かえさない）
function mtgMyGhosts(ids) {
  if (!Array.isArray(ids)) return [];
  var props = PropertiesService.getScriptProperties(), cache = {}, out = [];
  ids.slice(0, 10).forEach(function (id) {
    id = String(id); var tier = tierOf_(id); if (!tier) return;
    if (!cache[tier]) cache[tier] = loadTier_(props, tier);
    var g = cache[tier].filter(function (x) { return x.i === id; })[0];
    var d = props.getProperty(deckKey_(id)), s = d ? JSON.parse(d).s : null;
    if (g || s !== null) out.push({ i: id, w: g ? g.w : null, l: g ? g.l : null, s: s });
  });
  return out;
}

// ───── レイド（docs/RAID.md）：タルキール大戦（統率者戦）─────
// 陣営の 点 'raid:<id>:score' = { f: { dragon, human }, c: { 統率者ID: 点 } }
// ゴースト 'raid:<id>:g:<陣営>' = [{ c: 統率者ID, d: [カードID×20], n: [なまえ, なまえ], u: 時刻 }]（陣営ごとに RAID_KEEP まで）
// レイドの ID と おわる 時刻（js/ui/raidstore.js の RAID.ends と そろえる）。おわった あとも 30分は たたかいの けっかを うけとる
var RAID_IDS = { 'tarkir-1': 1793530800000 }; // 2026-11-01 20:00（日本時間）
var RAID_GRACE = 30 * 60 * 1000;
var RAID_CMD = { dragon: ['RG07', 'WG07', 'KR07', 'WU07', 'UK07'], human: ['AB02', 'JE02', 'SU02', 'MA02', 'TE02'] };
var RAID_KEEP = 20;
var RAID_DEF = 3; // ぼうえい点：ゴーストが かつと その 陣営に ＋3
// ゴーストが まもった 回数 'raid:<id>:def' = { ゴーストID: 回数 }（ゴーストが 20人から おちても のこる）
function raidGid_(i) { i = String(i || ''); return /^[0-9a-f]{12}$/.test(i) ? i : ''; }
function raidId_(q) { var id = String(q && q.id); if (!RAID_IDS[id]) throw new Error('レイドが ない'); return id; }
function raidFaction_(q) { var f = String(q && q.f); if (!RAID_CMD[f]) throw new Error('陣営が おかしい'); return f; }
function raidCmd_(f, c) { c = String(c || ''); if (RAID_CMD[f].indexOf(c) < 0) throw new Error('統率者が おかしい'); return c; }
function raidLive_(id, grace) { if (Date.now() > RAID_IDS[id] + (grace ? RAID_GRACE : 0)) throw new Error('レイドは おわった'); }
function raidScore_(props, id) { var v = props.getProperty('raid:' + id + ':score'); return v ? JSON.parse(v) : { f: { dragon: 0, human: 0 }, c: {} }; }

// 点を たす：{ id, f, c, w: 1（かった）, fin: 1（統率者で とどめ）, q: といた 問題の 数 } → { f, c }
function mtgRaidAdd(q) {
  var id = raidId_(q), f = raidFaction_(q), c = raidCmd_(f, q.c);
  raidLive_(id, true);
  var add = (Number(q.w) === 1 ? 10 : 0) + (Number(q.w) === 1 && Number(q.fin) === 1 ? 5 : 0) + Math.max(0, Math.min(200, Math.floor(Number(q.q) || 0)));
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var s = raidScore_(props, id);
    s.f[f] = Math.min(99999999, (s.f[f] || 0) + add);
    s.c[c] = Math.min(99999999, (s.c[c] || 0) + add);
    props.setProperty('raid:' + id + ':score', JSON.stringify(s));
    return s;
  } finally {
    lock.releaseLock();
  }
}
// 陣営と 統率者の 点。{ id, me: じぶんの ゴーストID, f: じぶんの 陣営 } → { f, c, mine: { w: まもった 回数, alive: ゴーストが いるか } }
function mtgRaidState(q) {
  var id = raidId_(q), props = PropertiesService.getScriptProperties();
  var s = raidScore_(props, id), me = raidGid_(q && q.me);
  if (me) {
    var dv = props.getProperty('raid:' + id + ':def'), def = dv ? JSON.parse(dv) : {};
    var f = RAID_CMD[String(q.f)] ? String(q.f) : 'dragon', gv = props.getProperty('raid:' + id + ':g:' + f);
    s.mine = { w: def[me] || 0, alive: (gv ? JSON.parse(gv) : []).some(function (g) { return g.i === me; }) };
  }
  return s;
}
// ぼうえい：あいての ゴーストが かった。{ id, g: ゴーストID } → ゴーストの 陣営と 統率者に ＋3
function mtgRaidDefend(q) {
  var id = raidId_(q), gid = raidGid_(q && q.g);
  if (!gid) throw new Error('ゴーストが いない');
  raidLive_(id, true);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties(), hit = null, f = null;
    ['dragon', 'human'].forEach(function (k) { var v = props.getProperty('raid:' + id + ':g:' + k); (v ? JSON.parse(v) : []).forEach(function (g) { if (g.i === gid) { hit = g; f = k; } }); });
    if (!hit) return null;
    var dv = props.getProperty('raid:' + id + ':def'), def = dv ? JSON.parse(dv) : {};
    def[gid] = (def[gid] || 0) + 1;
    props.setProperty('raid:' + id + ':def', JSON.stringify(def));
    var s = raidScore_(props, id);
    s.f[f] = Math.min(99999999, (s.f[f] || 0) + RAID_DEF);
    s.c[hit.c] = Math.min(99999999, (s.c[hit.c] || 0) + RAID_DEF);
    props.setProperty('raid:' + id + ':score', JSON.stringify(s));
    return { w: def[gid] };
  } finally {
    lock.releaseLock();
  }
}

// じぶんの 統率者デッキを ゴーストに：{ id, f, c, d: [カードID×20], n: [なまえ, なまえ] }。色は 統率者の 色だけ
function mtgRaidSubmit(q) {
  var id = raidId_(q), f = raidFaction_(q), c = raidCmd_(f, q.c);
  raidLive_(id, false);
  var d = q && q.d;
  if (!Array.isArray(d) || d.length !== DECK_SIZE) throw new Error('デッキは 20まい');
  var ok = CARDS[c][1];
  d = d.map(String);
  var pts = 0;
  d.forEach(function (x) { var k = CARDS[x]; if (!k) throw new Error('しらない カード'); pts += k[0]; for (var i = 0; i < k[1].length; i++) if (ok.indexOf(k[1].charAt(i)) < 0) throw new Error('統率者の 色で ない'); });
  if (pts > CAPACITY) throw new Error('点数が おおすぎる');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties(), key = 'raid:' + id + ':g:' + f;
    var v = props.getProperty(key), list = v ? JSON.parse(v) : [];
    // おなじ ID で 出しなおす とき（20人から おちた とき）は 入れかえ
    var gid = raidGid_(q.i) || Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    list = list.filter(function (g) { return g.i !== gid; });
    list.push({ i: gid, c: c, d: d, n: checkName_(q.n), u: Date.now() });
    props.setProperty(key, JSON.stringify(list.slice(-RAID_KEEP)));
    return { i: gid };
  } finally {
    lock.releaseLock();
  }
}
// あいて：ちがう 陣営の ゴーストから ランダムに 1人。いなければ null
function mtgRaidGhost(q) {
  var id = raidId_(q), f = raidFaction_(q);
  var v = PropertiesService.getScriptProperties().getProperty('raid:' + id + ':g:' + (f === 'dragon' ? 'human' : 'dragon'));
  var list = v ? JSON.parse(v) : [];
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}
