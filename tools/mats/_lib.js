// プレイマットの 絵の どうぐ（tools/gen_mats.mjs が さきに よみこむ。「_」で はじまる ファイルは 絵では ない）
window.MatLib = {
  // seed から いつも おなじ 乱数
  rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
  // なめらかな ノイズと、それを かさねた fbm（雲・もや・石の ざらざら）
  noise(rnd) {
    const P = 256, grid = Array.from({ length: P * P }, rnd);
    const at = (x, y) => grid[((y & (P - 1)) * P) + (x & (P - 1))];
    const sm = (t) => t * t * (3 - 2 * t);
    const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi); const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * xf, b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * xf; return a + (b - a) * yf; };
    const fbm = (x, y, oct = 5) => { let v = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { v += amp * n(x * f, y * f); f *= 2.03; amp *= 0.5; } return v; };
    return { n, fbm };
  },
  // 1まいの 層を ピクセルごとに 計算（s：あらさ。小さく 計算して 大きく のばす）。f(x, y, w, h) → [r, g, b, a(0〜1)]
  layer(g, W, H, s, f, { blur = 0, op = 'source-over', alpha = 1 } = {}) {
    const w = Math.ceil(W / s), h = Math.ceil(H / s), c = new OffscreenCanvas(w, h), cg = c.getContext('2d'), img = cg.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [r, gg, b, a] = f(x, y, w, h), i = (y * w + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = Math.max(0, Math.min(1, a)) * 255;
    }
    cg.putImageData(img, 0, 0);
    g.save(); g.globalCompositeOperation = op; g.globalAlpha = alpha; g.imageSmoothingQuality = 'high'; if (blur) g.filter = `blur(${blur}px)`;
    g.drawImage(c, 0, 0, W, H); g.restore();
  },
  // まるい 光（中心 c 色 → とうめい）
  glow(g, x, y, r, c, a = 1, op = 'lighter') {
    g.save(); g.globalCompositeOperation = op; const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, c.replace('A', a)); gr.addColorStop(1, c.replace('A', 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore();
  },
  // まんなかを すこし 暗く（カードが 見やすい）・まわりを しめる
  frame(g, W, H, mid = 0.38, edge = 0.55) {
    const m = g.createRadialGradient(W / 2, H * 0.48, 0, W / 2, H * 0.48, Math.max(W, H) * 0.42);
    m.addColorStop(0, `rgba(4,6,20,${mid})`); m.addColorStop(1, 'rgba(4,6,20,0)'); g.fillStyle = m; g.fillRect(0, 0, W, H);
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${edge})`); g.fillStyle = v; g.fillRect(0, 0, W, H);
  },
};
