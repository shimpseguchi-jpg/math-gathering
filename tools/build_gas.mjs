// Google Apps Script（GAS）で くばる ための「1ファイル版」を つくる
// つかいかた：node mathtcg/tools/build_gas.mjs   → mathtcg/gas/ に Code.gs・index.html・appsscript.json が できる
// しくみは リポジトリの tools/build_gas.mjs（アルカナンバー）と おなじ
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'gas');
const esbuild = (args) => execFileSync('npx', ['-y', 'esbuild@0.24.0', ...args], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();

// base64 を もどして CSS と JS を うごかす（この なかには「+」を つかわない）
const LOADER = `(function () {
  function unpack(id) {
    var el = document.getElementById(id);
    var t = el.textContent.replace(/[\\r\\n\\t]/g, '').replace(/ /g, '\\x2b');
    el.parentNode.removeChild(el);
    var bin = atob(t), n = bin.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i = i - (-1)) u[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(u);
  }
  var st = document.createElement('style');
  st.textContent = unpack('pack-css');
  document.head.appendChild(st);
  var code = 'window.__packRan = 1;'.concat(unpack('pack-js'));
  var sc = document.createElement('script');
  sc.text = code;
  document.body.appendChild(sc);
  if (!window.__packRan) { try { (0, eval)(code); } catch (e) { /* エラーは がめんに でる */ } }
})();
`;

mkdirSync(OUT, { recursive: true });
const BUILT = Date.now();
const TEMPLATE = readFileSync(join(ROOT, 'tools/gas_Code.gs'), 'utf8');
const SERVER = createHash('sha256').update(TEMPLATE).digest('hex').slice(0, 12); // サーバーの しくみの 版
// JS：モジュールを 1つに まとめる（ふるい iPad でも うごくように safari14 むけ）
const js = esbuild(['js/ui/app.js', '--bundle', '--format=iife', '--minify', '--target=safari14', '--charset=utf8', '--legal-comments=none']);
// 絵（img/）は GAS に ファイルを おけないので、CSS の 中に data URL で うめこむ
const css = esbuild(['css/style.css', '--minify', '--target=safari14', '--charset=utf8'])
  .replace(/url\((["']?)\.\.\/img\/([^"')]+)\1\)/g, (_, q, f) => `url(data:image/${f.split('.').pop()};base64,${readFileSync(join(ROOT, 'img', f)).toString('base64')})`);
// GAS は くばる ときに おおきな スクリプトを こわす ことが あるので、英数字だけの base64 にして いれておく
const b64 = (str) => Buffer.from(str, 'utf8').toString('base64').replace(/.{1,100}/g, '$&\n');
let html = readFileSync(join(ROOT, 'index.html'), 'utf8')
  .replace(/<meta name="viewport"[^>]*>\n?/, '') // GAS では Code.gs の addMetaTag で つける
  .replace(/<link rel="stylesheet" href="css\/style\.css">\n?/, '')
  .replace(/<script type="module" src="js\/ui\/app\.js"><\/script>/, () => `<div id="pack-css" hidden>\n${b64(css)}</div>\n<div id="pack-js" hidden>\n${b64(js)}</div>\n<script>\n${LOADER}</script>`)
  .replace('<head>', '<head>\n<base target="_top">')
  .replace(/^(<!doctype html>\n)/i, `$1<!--mtg-built:${BUILT} server:${SERVER}-->\n`); // 「ゲームを 最新に する」で どちらが 新しいか・サーバーと あうかを 見る
if (!html.includes('<!--mtg-built:')) throw new Error('版の しるしが ない');
if (html.includes('src="js/') || html.includes('href="css/')) throw new Error('のこった ファイル よみこみが ある');
writeFileSync(join(OUT, 'index.html'), html);

// Code.gs：サーバーが デッキを チェック できるように、カードの 点数と 色を 書きこむ
const { BY_ID, SETS } = await import(join(ROOT, 'js/data/cards.js'));
const PTS = { C: 1, U: 2, R: 3, L: 4, B: 0 };
// [点数, 色, 旗の 3色（旗だけ）]
const cards = Object.fromEntries(Object.values(BY_ID).map((d) => [d.id, [d.pts ?? PTS[d.rar] ?? 0, [...(d.color || '')].filter((c) => 'WUKGR'.includes(c)).join(''), ...(d.banner ? [d.banner] : [])]]));
const sets = { // 弾：先生が せってい シートで えらべる もの
  main: SETS.filter((x) => !x.extra && !x.sub && !x.raid).map((x) => x.id),
  extra: SETS.filter((x) => x.extra || x.sub).map((x) => x.id),
  released: SETS.filter((x) => x.released).map((x) => x.id),
};
const code = TEMPLATE.replace('/*CARDS*/{}', JSON.stringify(cards))
  .replace('/*BUILT*/0', String(BUILT)).replace("/*SERVER*/''", `'${SERVER}'`)
  .replace(/\/\*SETS\*\/\{[^}]*\}/, JSON.stringify(sets));
writeFileSync(join(OUT, 'Code.gs'), code);
// 「ゲームを 最新に する」で サーバーが とる カードの 一覧（新しい カードを サーバーの デッキ チェックが しって いるように）
writeFileSync(join(OUT, 'cards.json'), JSON.stringify({ server: SERVER, built: BUILT, cards, sets }));
writeFileSync(join(OUT, 'appsscript.json'), JSON.stringify({
  timeZone: 'Asia/Tokyo', exceptionLogging: 'STACKDRIVER', runtimeVersion: 'V8',
  webapp: { executeAs: 'USER_DEPLOYING', access: 'DOMAIN' }, // 学内（ドメイン内）だけ。ひらいた 人の 学校アカウントが わかる
}, null, 2) + '\n');
console.log(`mathtcg/gas/ に できた：index.html ${(Buffer.byteLength(html) / 1024).toFixed(0)}KB、Code.gs（カード ${Object.keys(cards).length}種）`);
