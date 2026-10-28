// gas/Code.gs を Google の かわりの「にせもの」で うごかす（tools/gastest.mjs と ブラウザの テストで つかう）
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash, randomUUID } from 'crypto';
import vm from 'vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OWNER = 'sensei@school.ed.jp';
// → { G: Code.gs の 関数, book: シート, setUser(メール) }
export function makeGas(first = 'taro@school.ed.jp') {
const code = readFileSync(join(ROOT, 'gas/Code.gs'), 'utf8');
// ---- にせの スプレッドシート ----
function makeSheet(name) {
  const sh = { name, cells: [], maxRows: 1000, maxCols: 26, frozen: 0 };
  const get = (r, c) => (sh.cells[r - 1] || [])[c - 1] ?? '';
  const set = (r, c, v) => {
    if (r > sh.maxRows || c > sh.maxCols) throw new Error(`${name}：はんいの 外 (${r},${c})`);
    (sh.cells[r - 1] ||= [])[c - 1] = v;
  };
  const range = (r, c, nr, nc) => {
    if (r + nr - 1 > sh.maxRows || c + nc - 1 > sh.maxCols) throw new Error(`${name}：はんいの 外 ${r},${c},${nr},${nc}`);
    return {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => get(r + i, c + j))),
      setValues: (v) => { if (v.length !== nr || v[0].length !== nc) throw new Error('おおきさが ちがう'); v.forEach((row, i) => row.forEach((x, j) => set(r + i, c + j, typeof x === 'string' ? x : x))); return range(r, c, nr, nc); },
      setNumberFormat: () => range(r, c, nr, nc),
      setFontWeight: () => range(r, c, nr, nc),
      clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (sh.cells[r + i - 1]) sh.cells[r + i - 1][c + j - 1] = ''; return range(r, c, nr, nc); },
    };
  };
  const lastRow = () => { for (let i = sh.cells.length; i > 0; i--) if ((sh.cells[i - 1] || []).some((x) => x !== '' && x != null)) return i; return 0; };
  const lastCol = () => Math.max(0, ...sh.cells.map((row) => { for (let j = (row || []).length; j > 0; j--) if (row[j - 1] !== '' && row[j - 1] != null) return j; return 0; }));
  return {
    sh, getRange: range, getLastRow: lastRow, getLastColumn: lastCol, getMaxRows: () => sh.maxRows, getMaxColumns: () => sh.maxCols,
    insertRowsAfter: (_, n) => { sh.maxRows += n; }, insertColumnsAfter: (_, n) => { sh.maxCols += n; },
    deleteRow: (r) => { sh.cells.splice(r - 1, 1); }, setFrozenRows: (n) => { sh.frozen = n; }, getName: () => name, hideSheet: () => { sh.hidden = true; },
  };
}
const book = { sheets: {} };
const ss = {
  getSheetByName: (n) => book.sheets[n] || null,
  insertSheet: (n) => (book.sheets[n] = makeSheet(n)),
  getUrl: () => 'https://docs.google.com/spreadsheets/d/xxx',
};
const props = {};
const cache = {};
let user = first;
let noFile = false;
const fetched = [];
// にせの GitHub：ファイルの なかみを かえて ためせる（web.edit(name, text) → text）
let edit = (name, text) => text;
const web = (url) => {
  if (url.startsWith('https://api.github.com/')) return JSON.stringify({ sha: 'abc1234def' });
  const m = /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/gas\/(.+)$/.exec(url);
  if (!m) return null;
  try { return edit(m[1], readFileSync(join(ROOT, 'gas', m[1]), 'utf8')); } catch { return null; }
};
const page = (content) => { const o = { content, setTitle: () => o, setXFrameOptionsMode: () => o, addMetaTag: () => o }; return o; };
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: (id) => { if (id !== 'SCHOOL') throw new Error('ない シート'); return ss; } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); }, getProperties: () => ({ ...props }), deleteProperty: (k) => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; },
    getAll: (ks) => Object.fromEntries(ks.filter((k) => k in cache).map((k) => [k, cache[k]])), putAll: (o) => { for (const [k, v] of Object.entries(o)) { if (v.length > 100000) throw new Error('大きすぎ'); cache[k] = v; } } }) },
  UrlFetchApp: { fetch: (url) => { fetched.push(url); const body = web(url); return { getResponseCode: () => (body == null ? 404 : 200), getContentText: () => body ?? '' }; } },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  Session: { getActiveUser: () => ({ getEmail: () => user }), getEffectiveUser: () => ({ getEmail: () => OWNER }) },
  Utilities: {
    getUuid: () => randomUUID(),
    formatDate: (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().replace('T', ' ').slice(0, 19).replace(/-/g, '/'),
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (a, s) => [...createHash('sha256').update(s).digest()].map((b) => (b > 127 ? b - 256 : b)),
  },
  Logger: { log: () => {} },
  HtmlService: {
    createHtmlOutputFromFile: (n) => { if (noFile) throw new Error('ない'); return page(`FILE:${n}`); }, createHtmlOutput: (h) => page(h),
    XFrameOptionsMode: { ALLOWALL: 1 },
  },
};
vm.createContext(ctx);
vm.runInContext(code, ctx);
const G = ctx;
return { G, book, setUser: (u) => { user = u; }, fetched, setWeb: (f) => { edit = f; }, setNoFile: (v) => { noFile = v; }, cache, props };
}
