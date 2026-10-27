// プレイマット「ジェイスの 心の 図書館」：青い 光の 魔法陣（目もりと しるしの 輪）、うかぶ 本、左右の 本だな の かげ、光の ちり
window.drawJace = (cv, seed = 53) => {
  const W = cv.width, H = cv.height, g = cv.getContext('2d'), L = window.MatLib, rnd = L.rng(seed), { fbm } = L.noise(rnd);
  const bg = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.8);
  bg.addColorStop(0, '#0f2a4e'); bg.addColorStop(1, '#030a16'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // 本だな（左右）：たなと 本の せ
  for (const side of [0, 1]) {
    const x0 = side ? W * 0.84 : 0, x1 = side ? W : W * 0.16;
    g.fillStyle = 'rgba(2,8,20,0.9)'; g.fillRect(x0, 0, x1 - x0, H);
    for (let y = 30; y < H; y += 110) {
      g.fillStyle = 'rgba(40,90,150,0.35)'; g.fillRect(x0, y + 92, x1 - x0, 6);
      for (let x = x0 + 6; x < x1 - 8;) { const bw = 8 + rnd() * 14, bh = 50 + rnd() * 38; g.fillStyle = `hsla(${200 + rnd() * 30} 50% ${16 + rnd() * 14}% / 0.95)`; g.fillRect(x, y + 92 - bh, bw, bh); x += bw + 2; }
    }
  }
  // 魔法陣
  const cx = W / 2, cy = H * 0.47;
  g.save(); g.globalCompositeOperation = 'lighter'; g.shadowColor = 'rgba(90,190,255,1)'; g.shadowBlur = 12;
  for (const [r, a, w] of [[H * 0.42, 0.55, 2.5], [H * 0.37, 0.35, 1.5], [H * 0.28, 0.45, 2], [H * 0.16, 0.5, 2]]) { g.strokeStyle = `rgba(120,210,255,${a})`; g.lineWidth = w; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); }
  for (let i = 0; i < 72; i++) { const t = (i / 72) * Math.PI * 2, r1 = H * 0.37, r2 = r1 + (i % 6 ? 8 : 18); g.strokeStyle = 'rgba(140,220,255,0.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx + Math.cos(t) * r1, cy + Math.sin(t) * r1); g.lineTo(cx + Math.cos(t) * r2, cy + Math.sin(t) * r2); g.stroke(); }
  for (let i = 0; i < 12; i++) { // しるし：小さい 図形
    const t = (i / 12) * Math.PI * 2, x = cx + Math.cos(t) * H * 0.325, y = cy + Math.sin(t) * H * 0.325, k = i % 3;
    g.strokeStyle = 'rgba(160,230,255,0.6)'; g.lineWidth = 1.8; g.beginPath();
    if (k === 0) { g.moveTo(x, y - 9); g.lineTo(x + 8, y + 6); g.lineTo(x - 8, y + 6); g.closePath(); } else if (k === 1) g.rect(x - 6, y - 6, 12, 12); else g.arc(x, y, 6, 0, 7);
    g.stroke();
  }
  g.strokeStyle = 'rgba(120,210,255,0.35)'; g.lineWidth = 1.5; g.beginPath(); for (let i = 0; i <= 4; i++) { const t = (i / 4) * Math.PI * 2 - Math.PI / 2; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(t) * H * 0.28, cy + Math.sin(t) * H * 0.28); } g.stroke(); // ひし形（宗教の しるしに 見えない かたち）
  for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(t) * H * 0.17, cy + Math.sin(t) * H * 0.17); g.lineTo(cx + Math.cos(t) * H * 0.27, cy + Math.sin(t) * H * 0.27); g.stroke(); } // 光の すじ
  g.restore();
  // うかぶ 本（ひらいた かたち）
  for (let i = 0; i < 9; i++) {
    const x = W * (0.2 + rnd() * 0.6), y = H * (0.08 + rnd() * 0.84), s = 14 + rnd() * 14, rot = (rnd() - 0.5) * 0.8;
    g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = 'rgba(170,220,255,0.18)'; g.strokeStyle = 'rgba(170,225,255,0.55)'; g.lineWidth = 1.2;
    for (const d of [-1, 1]) { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(d * s * 0.6, -s * 0.25, d * s * 1.2, -s * 0.1); g.lineTo(d * s * 1.2, s * 0.6); g.quadraticCurveTo(d * s * 0.6, s * 0.45, 0, s * 0.7); g.closePath(); g.fill(); g.stroke(); }
    g.restore(); L.glow(g, x, y, s * 2.2, 'rgba(90,180,255,A)', 0.2);
  }
  // 光の ちり
  for (let i = 0; i < 220; i++) L.glow(g, rnd() * W, rnd() * H, 1 + rnd() * 2.2, 'rgba(170,230,255,A)', 0.3 + rnd() * 0.5);
  L.layer(g, W, H, 4, (x, y) => { const n = fbm(x / 80, y / 80, 4); return [60, 140, 220, Math.max(0, n - 0.5) * 0.5]; }, { blur: 5, op: 'screen' });
  L.frame(g, W, H, 0.3, 0.55);
};
