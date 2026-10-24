// カード一覧（第1弾＋第2弾）を 1つの ファイルに まとめる
// つかいかた：node mathtcg/tools/gen_cardlist.mjs   → mathtcg/docs/CARDLIST.md
//             node mathtcg/tools/gen_cardlist.mjs --html=<ファイル>   → 色ごとに 見る ウェブページ（カードずかん）も 書く
// 文章は docs/cards/*.md の表から（gen_texts.py と おなじ）。どの弾かは js/data/cards.js の SET2 で きめる
// ウェブページには、開発中の 弾（第3弾〜第6弾・アルケミー。開発モードで 遊べる）と、まだ 案の プロモも 入れる
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { SET2 } from '../js/data/cards.js';
import { mapRuby } from '../js/ui/ruby.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'docs', 'cards');
const set2 = new Set(SET2.map((d) => d.id));

// 表を 読む：カード（ID の 列から）と トークン（「出すカード」の 列が ある 表）
const cards = {}, tokens = new Map();
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
function readTables(path, into) {
  let head = null;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.startsWith('|')) { head = null; continue; }
    const c = cells(line);
    if ((c[0] === 'ID' && c.includes('名前')) || (c[0] === '名前' && c.includes('出すカード'))) { head = c; continue; }
    if (!head || /^[-: ]+$/.test(c[0])) continue;
    const r = Object.fromEntries(head.map((h, i) => [h, c[i] ?? '']));
    if (head[0] === 'ID' && /^[A-Z]{1,2}\d\d$/.test(r.ID)) into[r.ID] = r;
    if (head[0] === '名前') {
      // トークン：名前・P/T・能力が おなじ ものは 1つに まとめる
      const k = `${r['名前']}|${r['P/T']}|${r['能力']}`;
      const t = tokens.get(k) || { ...r, from: new Set() };
      for (const x of r['出すカード'].split('・')) if (x && x !== '−') t.from.add(x.trim());
      tokens.set(k, t);
    }
  }
}
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.md')).sort()) readTables(join(DIR, f), cards);

const COLORS = [['W', '白'], ['U', '青'], ['G', '緑'], ['R', '赤']];
const GOLD = [['WG', '白緑'], ['WU', '青白'], ['RW', '赤白'], ['UR', '赤青'], ['RG', '緑赤'], ['GU', '青緑']];
const RAR = ['C', 'U', 'R', 'L'];
const RAR_NAME = { C: 'コモン', U: 'アンコモン', R: 'レア', L: 'レジェンド' };
const prefix = (id) => id.replace(/\d+$/, '');
const setOf = (id) => (set2.has(id) ? 2 : 1);
// コストの 数（X は 0 として ならべる）
const costNum = (c) => Number((c.replace(/\*\*/g, '').match(/\d+/) || ['0'])[0]);
const sortCards = (list) => list.sort((a, b) => costNum(a['コスト']) - costNum(b['コスト']) || a.ID.localeCompare(b.ID));
const esc = (t) => String(t ?? '').replace(/\|/g, '｜');

const table = (list) => [
  '| ID | 弾 | 名前 | レア | コスト | タイプ | P/T | テキスト | 元のカード | 算数 |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...sortCards(list).map((r) => `| ${r.ID} | ${setOf(r.ID)} | ${esc(r['名前'])} | ${r['レアリティ']} | ${esc(r['コスト'])} | ${esc(r['タイプ'])} | ${esc(r['P/T'])} | ${esc(r['テキスト'])} | ${esc(r['元のカード'])} | ${esc(r['算数'])} |`),
].join('\n');

const all = Object.values(cards).filter((r) => r['レアリティ'] in RAR_NAME);
const basics = Object.values(cards).filter((r) => !(r['レアリティ'] in RAR_NAME));
const groups = [
  ...COLORS.map(([k, n]) => ({ title: n, anchor: n, list: all.filter((r) => prefix(r.ID) === k) })),
  { title: '2色', anchor: '2色', sub: GOLD.map(([k, n]) => ({ title: n, list: all.filter((r) => prefix(r.ID) === k) })) },
  { title: '無色', anchor: '無色', list: all.filter((r) => prefix(r.ID) === 'C') },
];

// まとめの 表：色ごと × レアリティ（第1弾＋第2弾）
const count = (list, rar, set) => list.filter((r) => r['レアリティ'] === rar && (!set || setOf(r.ID) === set)).length;
const sumRow = (name, list) => `| ${name} | ${RAR.map((x) => `${count(list, x)}（${count(list, x, 1)}＋${count(list, x, 2)}）`).join(' | ')} | **${list.length}**（${list.filter((r) => setOf(r.ID) === 1).length}＋${list.filter((r) => setOf(r.ID) === 2).length}） |`;
const goldAll = all.filter((r) => prefix(r.ID).length === 2);

const out = [];
out.push(`# カード一覧（第1弾 ${all.filter((r) => setOf(r.ID) === 1).length}種 ＋ 第2弾 ${all.filter((r) => setOf(r.ID) === 2).length}種 ＝ ${all.length}種）`);
out.push('');
out.push('マスマティック・ザ・ギャザリングの ぜんぶの カード。**自動生成**（`node mathtcg/tools/gen_cardlist.mjs`。手で なおさない）。もとは [`cards/`](cards/README.md) の 各ファイル、第2弾の コンセプトは [`SET2.md`](SET2.md)。');
out.push('');
out.push('- **弾**：1 ＝ 第1弾、2 ＝ 第2弾「英雄譚（えいゆうたん）の 時代（じだい）」。パックは 2つを まぜて 出る');
out.push('- **コスト**：「4 W」＝ 合計 4マナ、うち 白を 最低 1つ。「X R」＝ X ＋ 1マナ。「X X」＝ X を 2回 はらう。色は W＝白・U＝青・G＝緑・R＝赤');
out.push('- **レア**（デッキの 点数）：C＝コモン（1点）・U＝アンコモン（2点）・R＝レア（3点）・L＝レジェンド（4点）。デッキは 20まい・30点まで・2色まで');
out.push('- 色の 中は コストの 小さい じゅん');
out.push('');
out.push('## まとめ');
out.push('');
out.push('数は「合計（第1弾＋第2弾）」。');
out.push('');
out.push(`| 色 | ${RAR.map((x) => RAR_NAME[x]).join(' | ')} | 計 |`);
out.push(`|---|${RAR.map(() => '---').join('|')}|---|`);
for (const [k, n] of COLORS) out.push(sumRow(n, all.filter((r) => prefix(r.ID) === k)));
out.push(sumRow('2色', goldAll));
out.push(sumRow('無色', all.filter((r) => prefix(r.ID) === 'C')));
out.push(sumRow('**合計**', all));
out.push('');
out.push(`もくじ：${[...groups.map((g) => `[${g.title}](#${g.anchor})`), '[きほんカード](#きほんカード)', '[トークン](#トークン)'].join('・')}`);
out.push('');
for (const g of groups) {
  if (g.sub) {
    out.push(`## ${g.title}`);
    out.push('');
    for (const sg of g.sub) { out.push(`### ${sg.title}（${sg.list.length}種）`); out.push(''); out.push(table(sg.list)); out.push(''); }
  } else {
    out.push(`## ${g.title}`);
    out.push('');
    out.push(`${g.list.length}種（第1弾 ${g.list.filter((r) => setOf(r.ID) === 1).length}・第2弾 ${g.list.filter((r) => setOf(r.ID) === 2).length}）`);
    out.push('');
    out.push(table(g.list));
    out.push('');
  }
}
out.push('## きほんカード');
out.push('');
out.push('0点。デッキが 20まいに たりない ぶんを うめる（パックからは 出ない）。');
out.push('');
const bHead = Object.keys(basics[0] || {}).filter((h) => h && h !== 'ID');
out.push(`| ID | ${bHead.join(' | ')} |`);
out.push(`|---|${bHead.map(() => '---').join('|')}|`);
for (const r of basics.sort((a, b) => a.ID.localeCompare(b.ID))) out.push(`| ${r.ID} | ${bHead.map((h) => esc(r[h])).join(' | ')} |`);
out.push('');
out.push('## トークン');
out.push('');
out.push('| 名前 | 色 | P/T | 能力 | 出すカード |');
out.push('|---|---|---|---|---|');
for (const t of [...tokens.values()].sort((a, b) => a['名前'].localeCompare(b['名前'], 'ja'))) out.push(`| ${esc(t['名前'])} | ${esc(t['色'])} | ${esc(t['P/T'])} | ${esc(t['能力'])} | ${[...t.from].sort().join('・')} |`);
out.push('');

writeFileSync(join(ROOT, 'docs', 'CARDLIST.md'), out.join('\n'));
console.log(`docs/CARDLIST.md：${all.length}種 ＋ きほん ${basics.length} ＋ トークン ${tokens.size}`);

// ---- ウェブページ（tools/cardlist_page.html に データを 入れる）----
const htmlArg = process.argv.find((a) => a.startsWith('--html='));
if (htmlArg) {
  // 開発中の 弾（開発モードで 遊べる）と 案（プロモ）。B06 は 第3弾の 黒の きほんカード、LS は 第5弾の レッスン、YT は アルケミーの 創出だけの カード
  const DRAFTS = [['SET3.md', '3'], ['SET4.md', '4'], ['SET5.md', '5'], ['SET6.md', '6'], ['SET7.md', '7'], ['ALCHEMY.md', 'A'], ['PLANESWALKERS.md', 'W'], ['PROMO.md', 'P']];
  const SET_LABEL = { 1: '第1弾', 2: '第2弾', 3: '第3弾', 4: '第4弾', 5: '第5弾', 6: '第6弾', 7: '第7弾', A: 'アルケミー', W: 'プレインズウォーカー', P: 'プロモ' };
  const draftSet = {}, drafts = {};
  const DEV = new Set(['3', '4', '5', '6', '7', 'A', 'W']);
  for (const [f, k] of DRAFTS) {
    const got = {};
    readTables(join(ROOT, 'docs', f), got);
    for (const id of Object.keys(got)) { drafts[id] = got[id]; draftSet[id] = k; }
  }
  const CLANS = ['AB', 'JE', 'SU', 'MA', 'TE', 'BA', 'ES', 'GX', 'JU', 'NA'];
  const PAIR_KEYS = ['WG', 'WU', 'RW', 'UR', 'RG', 'GU', 'WK', 'UK', 'KR', 'KG'];
  // 色の なかま：ふつうは ID の 頭（W・WK・AB…）。アルケミー（Y）・レッスン（LS）・プロモ（P）は コストの 色で
  const groupOf = (id, cost) => {
    const p = prefix(id);
    if (CLANS.includes(p) || PAIR_KEYS.includes(p) || ['W', 'U', 'K', 'R', 'G', 'C'].includes(p)) return p;
    const cols = [...new Set(String(cost).match(/[WUKRG]/g) || [])];
    if (!cols.length) return 'C';
    if (cols.length === 1) return cols[0];
    return PAIR_KEYS.find((k) => [...k].every((x) => cols.includes(x)) && cols.length === 2) || cols.join('');
  };
  const h = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // 「漢字（よみ）」→ ルビ。<br> は 改行、*…* は ななめ（フレーバー）
  const rb = (x) => String(x ?? '').replace(/\*\*/g, '').split('<br>')
    .map((part) => mapRuby(part, (b, y) => `<ruby>${h(b)}<rt>${h(y)}</rt></ruby>`, h).replace(/\*([^*]+)\*/g, '<em>$1</em>')).join('<br>');
  const costHtml = (c) => {
    const parts = String(c).replace(/\*\*/g, '').split(/\s+/).filter(Boolean);
    const nums = parts.filter((x) => /^[\dX]+$/.test(x)), cols = parts.filter((x) => /^[WUKGR]+$/.test(x)).join('');
    const n = nums.join(' ') === 'X X' ? 'XX' : nums.join('+');
    return h(n) + [...cols].map((k) => `<i class="pip p-${k}"></i>`).join('');
  };
  const BASIC_COLOR = { B01: 'W', B02: 'U', B03: 'G', B04: 'R', B05: 'C', B06: 'K' };
  const RAR_PTS = { C: 1, U: 2, R: 3, L: 4, P: 2 };
  const RAR_NAMES = { ...RAR_NAME, P: 'プロモ' };
  const card = (r, basic = false) => {
    const set = draftSet[r.ID] || String(setOf(r.ID)), rar = basic ? '' : (r['レアリティ'] || (set === 'P' ? 'P' : ''));
    const extra = prefix(r.ID) === 'LS' ? 'レッスン' : prefix(r.ID) === 'YT' ? '創出だけ' : '';
    const text = r['テキスト'] ?? r['テキスト（案）'] ?? '';
    const motif = r['元のカード'] || (r['手に 入れる'] ? `手に 入れる：${r['手に 入れる']}` : '');
    return {
      id: r.ID, set, setLabel: SET_LABEL[set], draft: draftSet[r.ID] === 'P', dev: DEV.has(draftSet[r.ID]), extra,
      group: basic ? BASIC_COLOR[r.ID] || 'C' : groupOf(r.ID, r['コスト']),
      rar, rarName: rar ? `${RAR_NAMES[rar]}（${RAR_PTS[rar]}点）` : '',
      cost: costHtml(r['コスト']), name: rb(r['名前']), type: rb(r['タイプ']), pt: h(r['P/T'] || ''), text: rb(text),
      math: rb(r['算数'] || ''), motif: h(motif),
      plain: [r['名前'], r['タイプ'], text, r['算数'], motif, r.ID, SET_LABEL[set], extra].join(' ').replace(/\*\*/g, ''),
    };
  };
  const SET_ORDER = Object.keys(SET_LABEL);
  const bySet = (a, b) => SET_ORDER.indexOf(a.set) - SET_ORDER.indexOf(b.set);
  const isBasic = (r) => !(r['レアリティ'] in RAR_NAME) && !(draftSet[r.ID] === 'P');
  const everything = [...Object.values(cards), ...Object.values(drafts)];
  const playable = new Set(Object.keys(cards));
  const data = {
    cards: sortCards(everything.filter((r) => !isBasic(r))).map((r) => card(r)).sort(bySet),
    basics: everything.filter(isBasic).sort((a, b) => a.ID.localeCompare(b.ID)).map((r) => card(r, true)),
    tokens: [...tokens.values()].sort((a, b) => a['名前'].localeCompare(b['名前'], 'ja')).map((t) => ({
      name: rb(t['名前']), color: h(t['色']), pt: h(t['P/T']), text: rb(t['能力']), from: h([...t.from].sort().join('・')),
      draft: [...t.from].every((id) => draftSet[id] === 'P'),
      dev: ![...t.from].some((id) => playable.has(id)) && [...t.from].some((id) => DEV.has(draftSet[id])),
    })),
  };
  const page = readFileSync(join(ROOT, 'tools', 'cardlist_page.html'), 'utf8').replace('/*DATA*/null', () => JSON.stringify(data).replace(/</g, '\\u003c'));
  const out2 = htmlArg.slice('--html='.length);
  writeFileSync(out2, page);
  const nDraft = data.cards.filter((c) => c.draft).length, nDev = data.cards.filter((c) => c.dev).length;
  console.log(`${out2}：遊べる ${data.cards.length - nDraft - nDev}種 ＋ 開発中 ${nDev}種 ＋ 案 ${nDraft}種、きほん ${data.basics.length}、トークン ${data.tokens.length}（${(Buffer.byteLength(page) / 1024).toFixed(0)}KB）`);
}
