// プレイマット「番外編の ネオン」：夜の 未来の まち。光る ビルの かげと まど、ネオンの かんばん、下は 遠近の ます目の ゆか
window.drawNeon = (cv, seed = 31) => {
  const W = cv.width, H = cv.height, g = cv.getContext('2d'), L = window.MatLib, rnd = L.rng(seed);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#07041a'); sky.addColorStop(0.5, '#24104a'); sky.addColorStop(0.62, '#5a1a6e'); sky.addColorStop(1, '#0a0618');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const hz = H * 0.6; // 地平線
  L.glow(g, W / 2, hz, W * 0.6, 'rgba(255,60,190,A)', 0.45);
  for (let i = 0; i < 160; i++) L.glow(g, rnd() * W, rnd() * hz * 0.7, 1.5, 'rgba(255,255,255,A)', 0.4 + rnd() * 0.5);
  // ビル（2れつ：とおく うすい・ちかく こい）
  for (const [k, top, col] of [[0, 0.32, '#160b32'], [1, 0.22, '#0b0620']]) {
    let x = -20;
    while (x < W) {
      const bw = 50 + rnd() * 90, bh = H * (top + rnd() * (0.3 - k * 0.05));
      g.fillStyle = col; g.fillRect(x, hz - bh, bw, bh);
      for (let wy = hz - bh + 10; wy < hz - 8; wy += 14) for (let wx = x + 7; wx < x + bw - 7; wx += 12) {
        if (rnd() < 0.32) { g.fillStyle = rnd() < 0.5 ? `rgba(0,240,255,${0.25 + k * 0.35})` : `rgba(255,90,220,${0.25 + k * 0.35})`; g.fillRect(wx, wy, 5, 7); }
      }
      if (k && rnd() < 0.35) { // ネオンの かんばん
        const sx = x + bw * 0.2, sy = hz - bh + 20, sw = bw * 0.6, sh = 18, c = rnd() < 0.5 ? '0,240,255' : '255,70,210';
        g.save(); g.shadowColor = `rgba(${c},1)`; g.shadowBlur = 18; g.strokeStyle = `rgba(${c},0.95)`; g.lineWidth = 3; g.strokeRect(sx, sy, sw, sh); g.restore();
      }
      x += bw + 4 + rnd() * 10;
    }
  }
  // ゆか：遠近の ます目
  g.fillStyle = '#08041a'; g.fillRect(0, hz, W, H - hz);
  g.save(); g.lineWidth = 2;
  for (let i = -24; i <= 24; i++) { // たての 線（地平線の まんなかに あつまる）
    const gr = g.createLinearGradient(0, hz, 0, H); gr.addColorStop(0, 'rgba(255,70,210,0)'); gr.addColorStop(1, 'rgba(255,70,210,0.75)');
    g.strokeStyle = gr; g.beginPath(); g.moveTo(W / 2 + i * 6, hz); g.lineTo(W / 2 + i * W * 0.09, H); g.stroke();
  }
  for (let k = 1; k < 16; k++) { const t = k / 16, y = hz + (H - hz) * t * t; g.strokeStyle = `rgba(0,240,255,${0.15 + t * 0.6})`; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.restore();
  L.glow(g, W / 2, hz, W * 0.35, 'rgba(255,120,230,A)', 0.35);
  L.frame(g, W, H, 0.45, 0.55);
};
