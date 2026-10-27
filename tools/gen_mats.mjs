// プレイマットの 絵を つくる：tools/mats/<名前>.js の Canvas の 絵を ブラウザ（Chromium）で えがいて img/mats/<名前>.webp に する
//   node mathtcg/tools/gen_mats.mjs nyx    … 1まい（なにも かかなければ ぜんぶ）
// 絵は コードで えがく ので、seed が おなじなら 毎回 おなじ 絵に なる
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const { chromium } = createRequire(import.meta.url)('playwright'); // require は どの フォルダからでも playwright が 見つかる
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1600, H = 1100; // よこ長。スマホの たて画面では まんなかを きりとって つかう（background-size: cover）
const names = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(join(ROOT, 'tools/mats')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
mkdirSync(join(ROOT, 'img/mats'), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<canvas id="c" width="${W}" height="${H}"></canvas>`);
for (const name of names) {
  await page.addScriptTag({ content: readFileSync(join(ROOT, 'tools/mats', `${name}.js`), 'utf8') });
  const fn = `draw${name[0].toUpperCase()}${name.slice(1)}`;
  const url = await page.evaluate(([fn]) => { const c = document.getElementById('c'); c.getContext('2d').clearRect(0, 0, c.width, c.height); window[fn](c); return c.toDataURL('image/webp', 0.82); }, [fn]);
  const buf = Buffer.from(url.split(',')[1], 'base64');
  writeFileSync(join(ROOT, 'img/mats', `${name}.webp`), buf);
  console.log(`img/mats/${name}.webp ${Math.round(buf.length / 1024)}KB`);
}
await browser.close();
