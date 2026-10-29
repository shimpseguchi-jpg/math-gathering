// プレイマット「ストリクスヘイヴンの 黒板（こくばん）」：深い 緑の 黒板・チョークの こな・チョークで かいた 算数（2の だん・X × X・わり算）
// クアンドリクスの フラクタル（うずまきの 四角）、上と 下の 木の わく。ストーリー 5章を クリアで もらえる
window.drawChalk = (cv, seed = 31) => {
  const W = cv.width, H = cv.height, g = cv.getContext('2d'), L = window.MatLib, rnd = L.rng(seed), { fbm } = L.noise(rnd);
  // 黒板：まだらな 緑
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1d3a2f'); bg.addColorStop(0.5, '#173126'); bg.addColorStop(1, '#10241c'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  L.layer(g, W, H, 4, (x, y) => { const n = fbm(x / 60, y / 60, 5); return [40, 80, 64, Math.max(0, n - 0.45) * 0.7]; }, { blur: 6 });
  // けしあと：よこに ながい うすい もや
  for (let i = 0; i < 7; i++) {
    const y = H * (0.12 + rnd() * 0.76), x = W * (0.1 + rnd() * 0.6), w = W * (0.18 + rnd() * 0.3), h = 40 + rnd() * 50;
    const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, 'rgba(210,230,220,0)'); gr.addColorStop(0.5, `rgba(210,230,220,${0.05 + rnd() * 0.05})`); gr.addColorStop(1, 'rgba(210,230,220,0)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  }
  // チョークの 線：すこし ふるえる
  const chalk = (a = 0.55, w = 3) => { g.strokeStyle = `rgba(236,242,232,${a})`; g.fillStyle = `rgba(236,242,232,${a})`; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; };
  const write = (t, x, y, size, rot = 0, a = 0.5) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.font = `700 ${size}px "Comic Sans MS", "Chalkboard", sans-serif`; chalk(a);
    for (let k = 0; k < 3; k++) { g.globalAlpha = 0.45; g.fillText(t, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2); }
    g.restore();
  };
  write('2 × 4 = 8', W * 0.09, H * 0.2, 56, -0.04);
  write('X × X', W * 0.7, H * 0.18, 60, 0.05);
  write('2, 4, 6, 8 …', W * 0.08, H * 0.86, 50, 0.03);
  write('24 ÷ 3 = 8', W * 0.68, H * 0.88, 52, -0.03);
  write('1 → 2 → 4 → 8 → 16', W * 0.36, H * 0.1, 40, 0.02, 0.4);
  // クアンドリクスの フラクタル：すこしずつ まわって 小さく なる 四角（右）
  g.save(); g.translate(W * 0.84, H * 0.52); chalk(0.42, 2.5);
  for (let i = 0, s = 170; i < 14; i++, s *= 0.86) { g.rotate(0.2); g.strokeRect(-s / 2, -s / 2, s, s); }
  g.restore();
  // 左の フクロウ（ストリクスヘイヴン）の らくがき
  g.save(); g.translate(W * 0.13, H * 0.52); chalk(0.42, 3);
  g.beginPath(); g.ellipse(0, 0, 60, 78, 0, 0, 7); g.stroke();
  for (const d of [-1, 1]) { g.beginPath(); g.arc(d * 24, -20, 16, 0, 7); g.stroke(); g.beginPath(); g.arc(d * 24, -20, 4, 0, 7); g.fill(); g.beginPath(); g.moveTo(d * 30, -70); g.lineTo(d * 44, -96); g.lineTo(d * 52, -62); g.stroke(); }
  g.beginPath(); g.moveTo(-6, -2); g.lineTo(0, 10); g.lineTo(6, -2); g.stroke();
  for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(0, 30 + k * 12, 22 - k * 4, 0.2, Math.PI - 0.2); g.stroke(); }
  g.restore();
  // チョークの こな
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(230,240,230,${0.05 + rnd() * 0.12})`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }
  // 上と 下の 木の わく・チョークおき
  for (const [y, h] of [[0, 34], [H - 46, 46]]) {
    const wd = g.createLinearGradient(0, y, 0, y + h); wd.addColorStop(0, '#6b4524'); wd.addColorStop(0.5, '#8a5a30'); wd.addColorStop(1, '#4c2f17');
    g.fillStyle = wd; g.fillRect(0, y, W, h);
    L.layer(g, W, H, 2, (x, yy) => (yy * 2 >= y && yy * 2 < y + h ? [40, 20, 8, Math.max(0, fbm(x / 3, yy / 40, 3) - 0.5) * 0.6] : [0, 0, 0, 0]), { op: 'multiply' });
  }
  for (const [x, c] of [[W * 0.62, '#f2f2ea'], [W * 0.66, '#f4d48a'], [W * 0.69, '#9fd4f0']]) { g.fillStyle = c; g.fillRect(x, H - 58, 70, 12); }
  L.frame(g, W, H, 0.32, 0.5);
};
