// プレイマット「ラヴニカの 石だたみ」：上から 見た 石だたみの 道（ボロノイの 石・目地・ぬれた つや）、街灯の あかり、2つの ギルドの 色の 光
window.drawGuild = (cv, seed = 11) => {
  const W = cv.width, H = cv.height, g = cv.getContext('2d'), L = window.MatLib, rnd = L.rng(seed), { fbm } = L.noise(rnd);
  // 石の まんなか（すこし ゆらした ます目）
  const S = 2, w = Math.ceil(W / S), h = Math.ceil(H / S), cell = 34, cols = Math.ceil(w / cell) + 2, rows = Math.ceil(h / cell) + 2;
  const pts = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) pts.push([(i - 0.5 + 0.15 + rnd() * 0.7) * cell + (j % 2) * cell * 0.5, (j - 0.5 + 0.15 + rnd() * 0.7) * cell, 0.75 + rnd() * 0.5]);
  const near = (x, y) => {
    const ci = Math.floor(x / cell) + 1, cj = Math.floor(y / cell) + 1; let d1 = 1e9, d2 = 1e9, k = 0;
    for (let j = cj - 2; j <= cj + 2; j++) for (let i = ci - 2; i <= ci + 2; i++) {
      const p = pts[j * cols + i]; if (!p) continue; const d = Math.hypot(x - p[0], y - p[1]);
      if (d < d1) { d2 = d1; d1 = d; k = j * cols + i; } else if (d < d2) d2 = d;
    }
    return [d2 - d1, pts[k][2]];
  };
  L.layer(g, W, H, S, (x, y) => {
    const [edge, tone] = near(x, y), n = fbm(x / 9, y / 9, 4), big = fbm(x / 160 + 3, y / 160, 3);
    const mortar = Math.min(1, edge / 4.5); // 0：目地
    const v = (30 + 34 * n * tone + 18 * big) * (0.2 + 0.8 * mortar) * (0.7 + 0.3 * Math.min(1, edge / 12)); // よるの 石：くらめ
    return [v * 1.02, v * 0.98, v * 1.08, 1];
  });
  // ぬれた つや（ところどころ 光る）
  L.layer(g, W, H, 4, (x, y) => { const p = Math.max(0, fbm(x / 60 + 20, y / 60) - 0.55) * 3; return [170, 190, 230, p * 0.18]; }, { blur: 3, op: 'screen' });
  // ギルドの 色の 光（左上 赤・右下 青）と 街灯
  L.glow(g, W * 0.08, H * 0.1, W * 0.45, 'rgba(230,70,50,A)', 0.22);
  L.glow(g, W * 0.95, H * 0.95, W * 0.5, 'rgba(60,130,255,A)', 0.24);
  for (const [x, y] of [[0.28, 0.9], [0.72, 0.1], [0.96, 0.4], [0.04, 0.6]]) L.glow(g, W * x, H * y, W * 0.14, 'rgba(255,200,120,A)', 0.16);
  // ギルドの 旗の かげ（はしに 細い 布）
  g.save();
  for (const [x, c] of [[0.02, 'rgba(170,40,35,0.55)'], [0.97, 'rgba(40,80,170,0.55)']]) {
    g.fillStyle = c; g.beginPath(); g.moveTo(W * x - 18, 0); g.lineTo(W * x + 18, 0); g.lineTo(W * x + 18, H * 0.28); g.lineTo(W * x, H * 0.25); g.lineTo(W * x - 18, H * 0.28); g.fill();
  }
  g.restore();
  L.frame(g, W, H, 0.45, 0.65);
};
