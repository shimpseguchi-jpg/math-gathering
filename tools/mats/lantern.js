// プレイマット「卒業（そつぎょう）の ランタン」：夜の 魔法学院（ストリクスヘイヴン）の 塔の かげ と、空へ のぼる たくさんの ランタン
// 5つの 寮の 色の 旗。ストリクスヘイヴンの とうを のぼりきると もらえる
window.drawLantern = (cv, seed = 77) => {
  const W = cv.width, H = cv.height, g = cv.getContext('2d'), L = window.MatLib, rnd = L.rng(seed), { fbm } = L.noise(rnd);
  // 夜空：上は こい 青、下は すこし むらさき
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#060a24'); sky.addColorStop(0.6, '#1a1442'); sky.addColorStop(1, '#2c1a46'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
  L.layer(g, W, H, 4, (x, y, w, h) => { const n = fbm(x / 70, y / 50, 5); return [90, 70, 160, Math.max(0, n - 0.48) * 0.5 * (1 - y / h)]; }, { blur: 6, op: 'screen' });
  // 星
  for (let i = 0; i < 260; i++) L.glow(g, rnd() * W, rnd() * H * 0.7, 0.8 + rnd() * 1.8, 'rgba(220,230,255,A)', 0.4 + rnd() * 0.5);
  // 学院の 塔の かげ（下）：とがった やねの 塔を ならべる
  g.fillStyle = '#05050f';
  const base = H * 0.86;
  g.fillRect(0, base, W, H - base);
  for (let i = 0; i < 16; i++) {
    const cx = W * (i / 15) + (rnd() - 0.5) * 60, tw = 40 + rnd() * 70, th = 90 + rnd() * 230;
    g.fillRect(cx - tw / 2, base - th, tw, th + 2);
    g.beginPath(); g.moveTo(cx - tw / 2 - 8, base - th); g.lineTo(cx, base - th - tw * (1.2 + rnd())); g.lineTo(cx + tw / 2 + 8, base - th); g.fill();
    // まどの あかり
    for (let k = 0; k < 4; k++) if (rnd() < 0.6) { const wx = cx - tw / 4 + rnd() * tw / 2, wy = base - th * (0.2 + rnd() * 0.7); L.glow(g, wx, wy, 14, 'rgba(255,200,110,A)', 0.5); g.fillStyle = 'rgba(255,214,140,0.9)'; g.fillRect(wx - 3, wy - 5, 6, 10); g.fillStyle = '#05050f'; }
  }
  // 5つの 寮の 旗（塔の 上）
  const flags = ['#c9c9d6', '#d2453a', '#4f8f45', '#e07a3a', '#3a8fb3'];
  for (let i = 0; i < 5; i++) { const x = W * (0.12 + i * 0.19), y = base - 300 - rnd() * 60; g.strokeStyle = '#05050f'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y + 90); g.lineTo(x, y); g.stroke(); g.fillStyle = flags[i]; g.globalAlpha = 0.85; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 40, y + 6, x + 70, y + 2); g.lineTo(x + 66, y + 30); g.quadraticCurveTo(x + 36, y + 34, x, y + 28); g.fill(); g.globalAlpha = 1; }
  // ランタン：下ほど 大きく、上ほど 小さく とおく
  for (let i = 0; i < 110; i++) {
    const t = rnd(), y = H * (0.05 + t * 0.78), x = W * rnd(), s = 5 + t * 16;
    L.glow(g, x, y, s * 4, 'rgba(255,170,70,A)', 0.35);
    const lg = g.createLinearGradient(x, y - s, x, y + s); lg.addColorStop(0, 'rgba(255,236,170,0.95)'); lg.addColorStop(1, 'rgba(240,140,50,0.95)');
    g.fillStyle = lg; g.beginPath(); g.moveTo(x - s * 0.55, y - s * 0.8); g.lineTo(x + s * 0.55, y - s * 0.8); g.lineTo(x + s * 0.7, y + s * 0.6); g.quadraticCurveTo(x, y + s * 1.05, x - s * 0.7, y + s * 0.6); g.closePath(); g.fill();
  }
  L.frame(g, W, H, 0.3, 0.5);
};
