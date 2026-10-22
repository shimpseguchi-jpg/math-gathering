// マスマティック・ザ・ギャザリング を Google Apps Script の ウェブアプリとして ひらく
// ・ゲーム本体は index.html（node mathtcg/tools/build_gas.mjs で つくる 1ファイル版）
// ・オンライン バトル（非同期）の「ゴースト」を この スクリプトの スクリプト プロパティに あずかる
//   ゴースト = 冒険を おえた デッキ（20まい）と なまえ・とどいた 階・勝ち負けの 数。プレイヤー本人の 情報は もたない
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
var NAME_A = 10, NAME_B = 10; // なまえの ことばの 数（js/ui/online.js の NAME_A・NAME_B）
var DECK_SIZE = 20, CAPACITY = 30;
var KEEP = 30;   // 階ごとに のこす ゴーストの 数（ふるい ものから けす。1件 9KB に おさまる）
var SHOW = 3;    // いちどに みせる あいての 数

function key_(tier) { return 'ghosts:' + tier; }
function loadTier_(props, tier) { var v = props.getProperty(key_(tier)); return v ? JSON.parse(v) : []; }
function saveTier_(props, tier, list) { props.setProperty(key_(tier), JSON.stringify(list)); }
function tierOf_(id) { var m = /^([1-6])-[0-9a-f]{8}$/.exec(String(id || '')); return m ? Number(m[1]) : 0; }

// デッキが ルールどおりか（20まい・30点まで・2色まで。きほんカードは 0点）
function checkDeck_(d) {
  if (!Array.isArray(d) || d.length !== DECK_SIZE) throw new Error('デッキは 20まい');
  var pts = 0, colors = {}, count = {};
  for (var i = 0; i < d.length; i++) {
    var c = CARDS[d[i]];
    if (!c) throw new Error('しらない カード');
    pts += c[0];
    for (var k = 0; k < c[1].length; k++) colors[c[1].charAt(k)] = 1;
    count[d[i]] = (count[d[i]] || 0) + 1;
    if (c[0] > 0 && count[d[i]] > 8) throw new Error('おなじ カードが おおすぎる');
  }
  if (pts > CAPACITY) throw new Error('点数が おおすぎる');
  if (Object.keys(colors).length > 2) throw new Error('色が おおすぎる');
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
  } finally {
    lock.releaseLock();
  }
  return { i: ghost.i };
}

// あいてを さがす：おなじ 階の ゴーストを 中心に、となりの 階からも。{ t: 階, x: [じぶんの ゴーストID] }
function mtgFindGhosts(q) {
  var tier = Math.max(1, Math.min(6, Math.floor(Number(q && q.t)) || 1));
  var mine = (q && Array.isArray(q.x)) ? q.x.map(String) : [];
  var props = PropertiesService.getScriptProperties();
  var pool = [];
  [tier, tier - 1, tier + 1].forEach(function (t, k) {
    if (t < 1 || t > 6 || pool.length >= 12) return;
    loadTier_(props, t).forEach(function (g) { if (mine.indexOf(g.i) < 0) pool.push({ g: g, near: k === 0 ? 0 : 1 }); });
  });
  // おなじ 階を 先に、あとは ランダム
  pool.sort(function (a, b) { return a.near - b.near || Math.random() - 0.5; });
  return pool.slice(0, SHOW).map(function (x) { return x.g; });
}

// たたかいの けっか：{ i: ゴーストID, w: ゴーストが かったか }
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

// じぶんの ゴーストの 勝ち負け：[ID…] → [{ i, w, l }]（もう けされた ものは かえさない）
function mtgMyGhosts(ids) {
  if (!Array.isArray(ids)) return [];
  var props = PropertiesService.getScriptProperties(), cache = {}, out = [];
  ids.slice(0, 10).forEach(function (id) {
    id = String(id); var tier = tierOf_(id); if (!tier) return;
    if (!cache[tier]) cache[tier] = loadTier_(props, tier);
    cache[tier].forEach(function (g) { if (g.i === id) out.push({ i: g.i, w: g.w, l: g.l }); });
  });
  return out;
}
