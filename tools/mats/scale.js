// プレイマット「タルキールの 龍の うろこ」：かさなった 龍の うろこ（1まいずつ かげと つや）、下から 炎の 光、とぶ 火の粉
window.drawScale = (cv, seed = 23) => {
  const W = cv.width, H = cv.height, g = cv.getContext('2d'), L = window.MatLib, rnd = L.rng(seed), { fbm } = L.noise(rnd);
  g.fillStyle = '#1a0504'; g.fillRect(0, 0, W, H);
  // うろこ：上の 列から じゅんに かさねる（下の 列が 上に のる）
  const R = 64, dx = R * 1.3, dy = R * 0.48; // 大きめに して ふかく かさねる
  const rows = Math.ceil((H + R) / dy) + 1;
  for (let j = rows; j >= -1; j--) for (let i = -1; i * dx < W + R; i++) { // 下の 列から かく：上の うろこが 下の うろこに かぶさる
    const x = i * dx + (j % 2 ? dx / 2 : 0), y = j * dy;
    const heat = Math.min(1, Math.max(0, y / H) * 0.9 + fbm(x / 300, y / 300) * 0.5); // 下ほど 赤く あつい
    const hue = 2 + heat * 18 + (rnd() - 0.5) * 6, lit = 8 + heat * 17 + rnd() * 4;
    const gr = g.createRadialGradient(x, y - R * 0.35, R * 0.1, x, y, R);
    gr.addColorStop(0, `hsl(${hue + 10} 80% ${lit + 14}%)`); gr.addColorStop(0.5, `hsl(${hue} 75% ${lit}%)`); gr.addColorStop(1, `hsl(${hue - 4} 85% ${lit * 0.25}%)`);
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - R * 0.68, y - R * 0.3); g.quadraticCurveTo(x - R * 0.72, y + R * 0.55, x, y + R * 1.0); g.quadraticCurveTo(x + R * 0.72, y + R * 0.55, x + R * 0.68, y - R * 0.3); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2; g.stroke();
    g.strokeStyle = `hsla(${hue + 20} 90% 70% / 0.22)`; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + R * 0.85); g.stroke(); // まんなかの すじ（龍の うろこ らしく）
  }
  // ざらざら
  L.layer(g, W, H, 3, (x, y) => { const n = fbm(x / 6, y / 6, 3); return [0, 0, 0, Math.max(0, n - 0.45) * 0.6]; });
  // 炎の 光（下）と 火の粉
  const fire = g.createLinearGradient(0, H, 0, H * 0.45);
  fire.addColorStop(0, 'rgba(255,110,30,0.4)'); fire.addColorStop(1, 'rgba(255,80,20,0)');
  g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = fire; g.fillRect(0, 0, W, H); g.restore();
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = H * (0.25 + rnd() * 0.75), r = 1 + rnd() * 2.5;
    L.glow(g, x, y, r * 5, 'rgba(255,170,60,A)', 0.5 + rnd() * 0.4);
    L.glow(g, x, y, r, 'rgba(255,240,190,A)', 0.9);
  }
  L.frame(g, W, H, 0.45, 0.65);
};
