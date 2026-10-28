// プレイマット「テーロスの 星空（ニクス）」を Canvas で えがく（tools/gen_mats.mjs が ブラウザで うごかして WebP に する）
// 絵の じゅんばん：夜空の グラデーション → 星雲（フラクタル ノイズの 天の川）→ ちりの 暗い すじ → 星 → 明るい 星（光の すじ）
//   → 金の 星座（テーロスの 神の しるし）→ 下の 神殿の かげ → まんなかを すこし 暗く（カードが 見やすい ように）
// seed が おなじなら 毎回 おなじ 絵に なる
window.drawNyx = (cv, seed = 7) => {
  const W = cv.width, H = cv.height, g = cv.getContext('2d');
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  // ---- ノイズ（なめらかな でこぼこ）----
  const P = 256, grid = Array.from({ length: P * P }, rnd);
  const at = (x, y) => grid[((y & (P - 1)) * P) + (x & (P - 1))];
  const sm = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const top = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * xf, bot = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * xf;
    return top + (bot - top) * yf;
  };
  const fbm = (x, y, oct = 6) => { let v = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { v += amp * noise(x * f, y * f); f *= 2.03; amp *= 0.5; } return v; };

  // ---- 1. 夜空 ----
  const sky = g.createLinearGradient(0, 0, W * 0.3, H);
  sky.addColorStop(0, '#05081e'); sky.addColorStop(0.55, '#0e0b33'); sky.addColorStop(1, '#1c0f3e');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);

  // ---- 2・3. 星雲と ちり（小さく 計算して 大きく のばす）----
  const s = 4, w = Math.ceil(W / s), h = Math.ceil(H / s);
  const neb = new OffscreenCanvas(w, h), ng = neb.getContext('2d'), img = ng.createImageData(w, h);
  // 天の川：左下から 右上への おび
  const band = (x, y) => { const d = (y / h - (1 - x / w) * 0.9 - 0.05) * 2.6; return Math.exp(-d * d); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm(x / 70, y / 70), m = fbm(x / 35 + 40, y / 35 + 9, 5), b = band(x, y);
    const glow = Math.max(0, n - 0.4) * 2.6 * (0.18 + b * 1.15) + b * b * 0.12; // おびの 外は うすく、まんなかは もやを たす
    const dust = Math.max(0, m - 0.55) * 2.4 * b; // 暗い すじ
    const k = Math.max(0, glow - dust * 0.9);
    const t = fbm(x / 120 + 5, y / 120 + 3, 3); // 色の まざり：むらさき ↔ もも ↔ あお
    const cy = Math.max(0, 0.38 - t) * 2.4; // ひくい ところは あおみどり（ニクスの 青い 光）
    const r = (110 * (1 - t) + 235 * t) * (1 - cy) + 70 * cy, gg = (60 * (1 - t) + 95 * t) * (1 - cy) + 190 * cy, bb = (225 * (1 - t) + 190 * t) * (1 - cy) + 230 * cy;
    const i = (y * w + x) * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = bb; img.data[i + 3] = Math.min(255, k * 190);
  }
  ng.putImageData(img, 0, 0);
  g.save(); g.imageSmoothingQuality = 'high'; g.globalCompositeOperation = 'screen'; g.filter = 'blur(6px)';
  g.drawImage(neb, 0, 0, W, H); g.filter = 'blur(1.5px)'; g.globalAlpha = 0.6; g.drawImage(neb, 0, 0, W, H); g.restore();

  // ---- 4. 星（天の川に 多め）----
  const star = (x, y, r, c, glowR = 0, alpha = 1) => {
    if (glowR) { const gr = g.createRadialGradient(x, y, 0, x, y, glowR); gr.addColorStop(0, c.replace('A', 0.5 * alpha)); gr.addColorStop(1, c.replace('A', 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, glowR, 0, 7); g.fill(); }
    g.fillStyle = c.replace('A', alpha); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  };
  const tint = () => ['rgba(255,255,255,A)', 'rgba(200,215,255,A)', 'rgba(255,236,200,A)', 'rgba(230,200,255,A)'][Math.floor(rnd() * 4)];
  for (let i = 0; i < 4200; i++) {
    const x = rnd() * W, y = rnd() * H;
    if (rnd() > 0.25 + band(x / s, y / s) * 0.75) continue;
    const big = rnd() < 0.04;
    star(x, y, big ? 1.1 + rnd() : 0.35 + rnd() * 0.6, tint(), big ? 6 + rnd() * 6 : 0, 0.5 + rnd() * 0.5);
  }
  // ---- 5. 明るい 星（4本の 光の すじ）----
  const spike = (x, y, L, c) => {
    star(x, y, 2.2, c, L * 0.45);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const [dx, dy, l] of [[1, 0, L], [0, 1, L], [0.7, 0.7, L * 0.35], [0.7, -0.7, L * 0.35]]) {
      const gr = g.createLinearGradient(x - dx * l, y - dy * l, x + dx * l, y + dy * l);
      gr.addColorStop(0, c.replace('A', 0)); gr.addColorStop(0.5, c.replace('A', 0.85)); gr.addColorStop(1, c.replace('A', 0));
      g.strokeStyle = gr; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - dx * l, y - dy * l); g.lineTo(x + dx * l, y + dy * l); g.stroke();
    }
    g.restore();
  };
  for (let i = 0; i < 9; i++) spike(rnd() * W, rnd() * H * 0.85, 18 + rnd() * 26, rnd() < 0.5 ? 'rgba(255,240,210,A)' : 'rgba(210,225,255,A)');

  // ---- 6. 金の 星座（ニクスの 神々。カードの じゃまに ならない よう はしに）----
  const cons = (pts, alpha = 0.55) => {
    const p = pts.map(([x, y]) => [x * W, y * H]);
    g.save(); g.strokeStyle = `rgba(242,192,79,${alpha})`; g.lineWidth = 1.4; g.setLineDash([2, 5]); g.beginPath();
    p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.restore();
    for (const [x, y] of p) star(x, y, 2.4, 'rgba(255,220,140,A)', 14, 0.95);
  };
  cons([[0.06, 0.12], [0.12, 0.08], [0.19, 0.13], [0.16, 0.22], [0.09, 0.24], [0.06, 0.12]]); // たて（ヘリオッドの しるし）
  cons([[0.8, 0.07], [0.86, 0.15], [0.93, 0.11], [0.9, 0.24], [0.84, 0.3]]); // やり（イロアスの しるし）
  cons([[0.88, 0.62], [0.94, 0.7], [0.9, 0.78], [0.83, 0.74]], 0.4); // 波（タッサの しるし）

  // ---- 7. 神殿の かげ（下の はし）----
  g.save(); g.fillStyle = 'rgba(4,4,16,0.78)';
  const base = H * 0.965, cx = W * 0.5, tw = W * 0.34;
  g.fillRect(0, base, W, H - base);
  g.fillRect(cx - tw / 2, base - H * 0.018, tw, H * 0.018); // だん
  for (let i = 0; i < 9; i++) { const x = cx - tw / 2 + tw * 0.04 + i * (tw * 0.92 / 8); g.fillRect(x - W * 0.006, base - H * 0.12, W * 0.012, H * 0.11); } // はしら
  g.fillRect(cx - tw / 2, base - H * 0.135, tw, H * 0.02);
  g.beginPath(); g.moveTo(cx - tw / 2 - 6, base - H * 0.135); g.lineTo(cx, base - H * 0.2); g.lineTo(cx + tw / 2 + 6, base - H * 0.135); g.fill(); // やね
  g.restore();

  // ---- 8. まんなかを すこし 暗く・まわりを しめる ----
  const mid = g.createRadialGradient(W / 2, H * 0.48, 0, W / 2, H * 0.48, Math.max(W, H) * 0.42);
  mid.addColorStop(0, 'rgba(4,6,20,0.38)'); mid.addColorStop(1, 'rgba(4,6,20,0)');
  g.fillStyle = mid; g.fillRect(0, 0, W, H);
  const vig = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vig; g.fillRect(0, 0, W, H);
};
