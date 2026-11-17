// 単体版「パック＆バトル だけの ゲーム」を 1つの HTML に まとめる（docs/PACKBATTLE.md 10章）
// つかいかた：node tools/build_standalone.mjs   → packbattle-standalone.html
// しくみは build_gas.mjs と おなじ（esbuild で 1つに まとめる）。ファイルを ブラウザで ひらくだけで あそべる ように、
// CSS・JS・ドットの 書体（DotGothic16。tools/fonts/、SIL Open Font License）を ぜんぶ 中に 入れる。そとへの 通信は しない
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packbattle-standalone.html');
const esbuild = (args) => execFileSync('npx', ['-y', 'esbuild@0.24.0', ...args], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();

// JS：入口は js/ui/standalone.js（タイトルを 出さずに パック＆バトルの ホームへ）
const js = esbuild(['js/ui/standalone.js', '--bundle', '--format=iife', '--minify', '--target=safari14', '--charset=utf8', '--legal-comments=none'])
  .replace(/<\/script/gi, '<\\/script'); // HTML の 中に じかに 書くので
// CSS：プレイマットの 絵（img/mats/。本編の ごほうび）は 入れない
const css = esbuild(['css/style.css', '--minify', '--target=safari14', '--charset=utf8'])
  .replace(/url\((["']?)\.\.\/img\/[^"')]+\1\)[^,;}]*,\s*/g, '');
const left = (css.match(/url\([^)]{0,40}/g) || []).filter((u) => !/^url\(["']?(data:|%23|#)/.test(u));
if (left.length) throw new Error(`CSS に そとの ファイルが のこって いる：${left.join(' ')}`);
// 書体：ドット（DotGothic16）だけ 中に 入れる。ほかの 字は 端末の ゴシック
const font = (f) => `url(data:font/woff2;base64,${readFileSync(join(ROOT, 'tools/fonts', f)).toString('base64')}) format("woff2")`;
const fonts = `@font-face{font-family:'DotGothic16';font-style:normal;font-weight:400;font-display:block;src:${font('dotgothic16-japanese-400-normal.woff2')}}
@font-face{font-family:'DotGothic16';font-style:normal;font-weight:400;font-display:block;src:${font('dotgothic16-latin-400-normal.woff2')};unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`;

// よみこみちゅうの しるし（index.html の <style>）は そのまま つかう
const loading = readFileSync(join(ROOT, 'index.html'), 'utf8').match(/<style>[\s\S]*?<\/style>/)[0];
const html = `<!doctype html>
<!-- パック＆バトル 単体版（マスマティック・ザ・ギャザリング）。この ファイル 1つで あそべる。tools/build_standalone.mjs が つくる（じかに なおさない）
     書体 DotGothic16：Copyright 2020 The DotGothic16 Project Authors、SIL Open Font License 1.1（tools/fonts/OFL.txt） -->
<html lang="ja" data-theme="gba">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="パック＆バトル">
  <meta name="theme-color" content="#141848">
  <title>パック＆バトル</title>
  ${loading}
  <style>${fonts}</style>
  <style>${css}</style>
</head>
<body>
  <div id="app"><main class="title"><div class="loading" role="status"><span class="ld-mark" aria-hidden="true"><span>＋</span><span>−</span><span>×</span><span>÷</span></span><span>よみこみちゅう</span></div></main></div>
  <div id="sheet" hidden></div>
  <script>${js}</script>
</body>
</html>
`;
if (/(?:src|href)="(?!data:)/.test(html.replace(js, ''))) throw new Error('そとの ファイルの よみこみが のこって いる');
writeFileSync(OUT, html);
console.log(`packbattle-standalone.html：${(Buffer.byteLength(html) / 1024).toFixed(0)}KB`);
