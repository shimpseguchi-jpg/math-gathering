// リアルタイムたいせんを 手元で ためす ための サーバー：ゲームの ファイルを くばり、gas/Code.gs を「にせものの Google」（tools/gasmock.mjs）で うごかす
// つかいかた：node tools/build_gas.mjs && node tools/rt_server.mjs   → http://localhost:8125/ を 2つの タブ（べつの ブラウザ・シークレット ウィンドウ）で ひらく
// ・1ファイル版（GAS に 上げる もの）で ためす ときは http://localhost:8125/gas/index.html
// ・ページには google.script.run の かわり（/rpc に POST する）を さしこむ。Code.gs は 1つ なので、2つの タブが おなじ へやを 見る
// ・/ctl に POST：{ down: true|false }（サーバーが おちた ふり）、{ skew: ミリ秒 }（サーバーの 時計を すすめる）
import http from 'http';
import vm from 'vm';
import { readFile } from 'fs/promises';
import { dirname, join, normalize, extname } from 'path';
import { fileURLToPath } from 'url';
import { makeGas } from './gasmock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8125);
const { G, setUser } = makeGas('');
const GDate = vm.runInContext('Date', G), realNow = GDate.now;
let down = false, skew = 0, calls = 0;
GDate.now = () => realNow() + skew;
const SHIM = `<script>
window.google = { script: { run: (function mk(ok, ng) { return new Proxy({}, { get: function (_, fn) {
  if (fn === 'withSuccessHandler') return function (f) { return mk(f, ng); };
  if (fn === 'withFailureHandler') return function (f) { return mk(ok, f); };
  return function (arg) {
    fetch('/rpc', { method: 'POST', body: JSON.stringify({ fn: fn, arg: arg === undefined ? null : arg, user: localStorage.getItem('gas-user') || '' }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j.ok) { if (ok) ok(j.r); } else if (ng) ng(new Error(j.e)); }, function (e) { if (ng) ng(e); });
  };
} }); })() } };
</script>`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const body = (req) => new Promise((ok) => { let t = ''; req.on('data', (c) => { t += c; }); req.on('end', () => ok(t)); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.method === 'POST' && url.pathname === '/ctl') { const q = JSON.parse(await body(req) || '{}'); if ('down' in q) down = !!q.down; if ('skew' in q) skew = Number(q.skew) || 0; return json(200, { down, skew, calls }); }
  if (req.method === 'POST' && url.pathname === '/rpc') {
    const q = JSON.parse(await body(req) || '{}');
    if (down) return json(503, { ok: false, e: 'サーバーが おちて いる（ためし）' });
    calls++;
    try {
      if (typeof G[q.fn] !== 'function' || !/^mtg[A-Z]/.test(q.fn)) throw new Error(`Script function not found: ${q.fn}`);
      setUser(String(q.user || ''));
      const r = G[q.fn](q.arg == null ? undefined : JSON.parse(JSON.stringify(q.arg)));
      return json(200, { ok: true, r: r === undefined ? null : JSON.parse(JSON.stringify(r)) });
    } catch (e) { return json(200, { ok: false, e: String(e.message || e) }); }
  }
  const path = normalize(url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname));
  if (path.includes('..')) { res.writeHead(403); return res.end(); }
  try {
    let data = await readFile(join(ROOT, path));
    if (path.endsWith('.html')) data = Buffer.from(data.toString('utf8').replace('<head>', `<head>\n${SHIM}`));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT, () => console.log(`リアルタイムたいせんの ためし：http://localhost:${PORT}/ （2つの タブで ひらく）`));
