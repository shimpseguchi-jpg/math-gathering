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
var CARDS = {"W01":[1,"W"],"W02":[1,"W"],"W03":[1,"W"],"W04":[1,"W"],"W05":[1,"W"],"W06":[2,"W"],"W07":[2,"W"],"W08":[3,"W"],"W09":[4,"W"],"W10":[1,"W"],"W11":[1,"W"],"W12":[1,"W"],"W13":[1,"W"],"W14":[2,"W"],"W15":[2,"W"],"W16":[3,"W"],"W17":[1,"W"],"W18":[1,"W"],"W19":[1,"W"],"W20":[2,"W"],"W21":[2,"W"],"W22":[2,"W"],"W23":[3,"W"],"W24":[3,"W"],"W25":[3,"W"],"W26":[4,"W"],"U01":[1,"U"],"U02":[1,"U"],"U03":[1,"U"],"U04":[1,"U"],"U05":[2,"U"],"U06":[2,"U"],"U07":[3,"U"],"U08":[4,"U"],"U09":[1,"U"],"U10":[1,"U"],"U11":[1,"U"],"U12":[1,"U"],"U13":[2,"U"],"U14":[2,"U"],"U15":[2,"U"],"U16":[3,"U"],"U17":[4,"U"],"U18":[1,"U"],"U19":[1,"U"],"U20":[1,"U"],"U21":[1,"U"],"U22":[2,"U"],"U23":[2,"U"],"U24":[3,"U"],"U25":[3,"U"],"U26":[3,"U"],"G01":[1,"G"],"G02":[1,"G"],"G03":[1,"G"],"G04":[1,"G"],"G05":[1,"G"],"G06":[2,"G"],"G07":[2,"G"],"G08":[1,"G"],"G09":[1,"G"],"G10":[1,"G"],"G11":[1,"G"],"G12":[2,"G"],"G13":[2,"G"],"G14":[2,"G"],"G15":[3,"G"],"G16":[3,"G"],"G17":[4,"G"],"G18":[1,"G"],"G19":[1,"G"],"G20":[1,"G"],"G21":[2,"G"],"G22":[2,"G"],"G23":[3,"G"],"G24":[3,"G"],"G25":[3,"G"],"G26":[4,"G"],"R01":[1,"R"],"R02":[1,"R"],"R03":[1,"R"],"R04":[1,"R"],"R05":[2,"R"],"R06":[2,"R"],"R07":[3,"R"],"R08":[4,"R"],"R09":[1,"R"],"R10":[1,"R"],"R11":[1,"R"],"R12":[1,"R"],"R13":[2,"R"],"R14":[2,"R"],"R15":[2,"R"],"R16":[3,"R"],"R17":[3,"R"],"R18":[1,"R"],"R19":[1,"R"],"R20":[1,"R"],"R21":[1,"R"],"R22":[2,"R"],"R23":[2,"R"],"R24":[3,"R"],"R25":[3,"R"],"R26":[4,"R"],"WG01":[2,"WG"],"WG02":[3,"WG"],"WU01":[2,"WU"],"WU02":[3,"WU"],"RW01":[2,"RW"],"RW02":[3,"RW"],"UR01":[2,"UR"],"UR02":[3,"UR"],"RG01":[2,"RG"],"RG02":[3,"RG"],"GU01":[2,"GU"],"GU02":[3,"GU"],"C01":[1,""],"C02":[1,""],"C03":[1,""],"C04":[1,""],"C05":[2,""],"C06":[2,""],"C07":[2,""],"C08":[3,""],"C09":[3,""],"C10":[4,""],"B01":[0,"W"],"B02":[0,"U"],"B03":[0,"G"],"B04":[0,"R"],"B05":[0,""]};
var NAME_A = 20, NAME_B = 20; // なまえの 定型語の 数（js/ui/online.js の NAME_A・NAME_B）
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
