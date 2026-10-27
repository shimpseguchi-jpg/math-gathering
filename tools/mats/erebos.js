// プレイマット「エレボスの 冥界」：暗い 谷の あいだを ながれる 光る 川、たちのぼる きり、ただよう たましいの 光、とおくの 門の かげ
window.drawErebos = (cv, seed = 41) => {
  const W = cv.width, H = cv.height, g = cv.getContext('2d'), L = window.MatLib, rnd = L.rng(seed), { fbm } = L.noise(rnd);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#05030b'); sky.addColorStop(0.5, '#160a24'); sky.addColorStop(1, '#0b0614');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // とおくの 門（2本の はしらと アーチ）
  g.save(); g.fillStyle = 'rgba(70,40,100,0.35)';
  const gx = W / 2, gy = H * 0.3, gw = W * 0.16, gh = H * 0.3;
  g.fillRect(gx - gw / 2, gy, gw * 0.12, gh); g.fillRect(gx + gw / 2 - gw * 0.12, gy, gw * 0.12, gh);
  g.beginPath(); g.arc(gx, gy, gw / 2, Math.PI, 0); g.lineWidth = gw * 0.1; g.strokeStyle = 'rgba(70,40,100,0.35)'; g.stroke(); g.restore();
  L.glow(g, gx, gy + gh * 0.4, gw * 0.9, 'rgba(160,90,230,A)', 0.35);
  // がけ（左右の 黒い かべ）
  const cliff = (side) => {
    g.beginPath(); g.moveTo(side ? W : 0, 0);
    for (let y = 0; y <= H; y += 20) { const n = fbm(y / 140 + side * 9, 3, 4); g.lineTo(side ? W - (W * 0.18 + n * W * 0.22 + (y / H) * W * 0.05) : W * 0.18 + n * W * 0.22 + (y / H) * W * 0.05, y); }
    g.lineTo(side ? W : 0, H); g.closePath(); g.fillStyle = '#040208'; g.fill();
  };
  cliff(0); cliff(1);
  // 光る 川（ステュクス）：下から 門へ くねる
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const [wd, a, bl] of [[160, 0.1, 30], [70, 0.2, 14], [26, 0.35, 5], [6, 0.5, 1]]) { // ふとい ほど ぼかして 水の ひろがりに
    g.filter = `blur(${bl}px)`;
    g.strokeStyle = `rgba(110,220,230,${a})`; g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(W * 0.42, H + 20);
    g.bezierCurveTo(W * 0.62, H * 0.82, W * 0.36, H * 0.62, W * 0.53, H * 0.5); g.bezierCurveTo(W * 0.6, H * 0.44, W * 0.48, H * 0.4, W * 0.5, H * 0.36); g.stroke();
  }
  g.restore();
  // きり
  L.layer(g, W, H, 4, (x, y, w, h) => { const n = fbm(x / 55, y / 30 + 7, 5), k = Math.max(0, n - 0.42) * 1.8 * (0.4 + y / h); return [150, 120, 200, k * 0.55]; }, { blur: 4, op: 'screen' });
  // たましいの 光（しっぽつき）
  for (let i = 0; i < 26; i++) {
    const x = W * (0.2 + rnd() * 0.6), y = H * (0.15 + rnd() * 0.75), r = 3 + rnd() * 3;
    g.save(); g.globalCompositeOperation = 'lighter'; const tl = g.createLinearGradient(x, y, x - 10, y + 40);
    tl.addColorStop(0, 'rgba(170,240,255,0.5)'); tl.addColorStop(1, 'rgba(170,240,255,0)'); g.strokeStyle = tl; g.lineWidth = r; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y + 20, x - 10, y + 40); g.stroke(); g.restore();
    L.glow(g, x, y, r * 6, 'rgba(150,230,255,A)', 0.45); L.glow(g, x, y, r, 'rgba(240,255,255,A)', 0.95);
  }
  L.frame(g, W, H, 0.35, 0.6);
};
