// バトルの 演出（2026-10-26）：画面を かきなおす まえと あとを くらべて、ダメージの 数字・たおれた カード・ライフの へんかを 重ねて 出す
// ほかに：攻撃の とつげき・手札から 場へ とぶ カード・ぴったり！・ターンの おび・かち／まけ。絵は CSS だけ（css/style.css の fx-）
// 「動きを へらす」せっていの ときは なにも しない
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function layer() {
  let d = document.getElementById('fx');
  if (!d) { d = document.createElement('div'); d.id = 'fx'; d.setAttribute('aria-hidden', 'true'); document.body.appendChild(d); }
  return d;
}
const box = (el) => (el?.getBoundingClientRect ? el.getBoundingClientRect() : null);
// fixed の 要素を r の 位置に おく
function put(cls, r, html = '') {
  const e = document.createElement('div');
  e.className = cls;
  e.innerHTML = html;
  if (r) Object.assign(e.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  layer().appendChild(e);
  return e;
}
const gone = (e, ms) => setTimeout(() => e.remove(), ms);
// 画面の はしで 文字が きれない ように、まんなかの x を 内がわに よせる
const cx = (r, half = 110) => Math.min(Math.max(r.left + r.width / 2, half), innerWidth - half);
// 演出を 見せる あいだ まつ（動きを へらす ときは またない）
export const pause = (ms) => (reduced() ? Promise.resolve() : wait(ms));

// ---- かきなおす まえ：場の カードの 位置と 見た目を おぼえる ----
export function capture(root) {
  if (reduced() || !root) return null;
  const perms = new Map();
  for (const el of root.querySelectorAll('.perm[data-uid]')) perms.set(el.dataset.uid, { r: box(el), html: el.outerHTML });
  return { perms, face: box(root.querySelector('[data-face]')), life: box(root.querySelector('.me-bar .life')), ezone: box(root.querySelector('.zone.enemy')) };
}

// ---- かきなおした あと：かわった ところに 演出 ----
// prev / now ＝ { hp: Map(uid → のこり), objs: Map(uid → perm), life, elife }
export function play(root, snap, prev, now) {
  if (!snap || !prev?.hp) return;
  let big = 0;
  for (const [uid, hp] of prev.hp) {
    const el = root.querySelector(`.perm[data-uid="${uid}"]`);
    if (!el) {
      // たおれた（場から いなくなった）：くだける。ぴったり！なら スタンプ
      const old = snap.perms.get(String(uid));
      if (!old) continue;
      const p = prev.objs.get(uid);
      if (now.gy?.has(uid) || (p?.token && (p.dmg > 0 || hp <= 0))) shatter(old, p?.side === 'E');
      else fade(old);
      if (p?.exact) stamp(old.r, 'ぴったり！');
      continue;
    }
    const d = hp - (now.hp.get(uid) ?? hp);
    if (d > 0) { num(box(el), `−${d}`, 'dmg'); el.classList.add('fx-hurt'); big = Math.max(big, d); }
  }
  const lifeEl = root.querySelector('.me-bar .life');
  if (now.life < prev.life) { num(box(lifeEl), `−${prev.life - now.life}`, 'dmg big'); big = Math.max(big, prev.life - now.life); }
  if (now.life > prev.life) num(box(lifeEl), `＋${now.life - prev.life}`, 'heal big');
  if (now.elife < prev.elife) {
    const r = box(root.querySelector('[data-face]')) || box(root.querySelector('.bt-head .chips')) || snap.ezone;
    num(r, `−${prev.elife - now.elife}`, 'dmg big');
    big = Math.max(big, prev.elife - now.elife);
  }
  if (big >= 5) shake(root.querySelector('.battle'), big >= 8 ? 'hard' : '');
}

function num(r, text, cls) {
  if (!r) return;
  const e = put(`fx-num ${cls}`, null, text);
  Object.assign(e.style, { left: `${cx(r, 40)}px`, top: `${r.top + r.height * 0.35}px` });
  gone(e, 1100);
}
function shatter(old, enemy) {
  const e = put(`fx-ghost shatter ${enemy ? 'foe' : ''}`, old.r, old.html);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    s.className = 'fx-shard';
    s.style.setProperty('--a', `${(360 / n) * i + Math.random() * 30}deg`);
    s.style.setProperty('--d', `${40 + Math.random() * 40}px`);
    e.appendChild(s);
  }
  gone(e, 700);
}
function fade(old) { gone(put('fx-ghost fade', old.r, old.html), 450); }
export function stamp(r, text) {
  if (reduced() || !r) return;
  const e = put('fx-stamp', null, `<b>${text}</b>`);
  Object.assign(e.style, { left: `${cx(r)}px`, top: `${r.top + r.height / 2}px` });
  gone(e, 1300);
}
function shake(el, cls) {
  if (!el) return;
  el.classList.remove('fx-shake', 'hard'); void el.offsetWidth;
  el.classList.add('fx-shake'); if (cls) el.classList.add(cls);
  setTimeout(() => el.classList.remove('fx-shake', 'hard'), 500);
}

// ---- 攻撃：攻撃する カードが あいてに むかって とつげきして もどる ----
// pairs = [{ from: 要素, to: 要素 }]
export async function lunge(pairs) {
  if (reduced()) return;
  const list = pairs.filter((x) => x.from && x.to);
  if (!list.length) return;
  for (const { from, to } of list) {
    const a = box(from), b = box(to);
    const dx = (b.left + b.width / 2 - (a.left + a.width / 2)) * 0.72, dy = (b.top + b.height / 2 - (a.top + a.height / 2)) * 0.72;
    from.animate?.([
      { transform: 'none' },
      { transform: `translate(${dx * 0.15}px, ${dy * 0.15 + 8}px) scale(1.04)`, offset: 0.25 },
      { transform: `translate(${dx}px, ${dy}px) scale(1.12)`, offset: 0.6 },
      { transform: 'none' },
    ], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)' });
    setTimeout(() => { const r = box(to); if (r) gone(put('fx-hit', r), 380); }, 300);
  }
  await wait(540);
}

// ---- カードを 出す：手札から 場（呪文は まんなか）へ とぶ ----
export async function flyCard(fromEl, toEl, spell) {
  if (reduced() || !fromEl) return;
  const a = box(fromEl);
  const t = box(toEl) || { left: innerWidth / 2 - 60, top: innerHeight / 2 - 80, width: 120, height: 160 };
  // パーマネントは 場の さいごの カードの となり（なければ 左上）へ
  const last = !spell && [...(toEl?.querySelectorAll('.perm') || [])].pop();
  const lr = box(last);
  const tx = spell ? t.left + t.width / 2 - a.width / 2 : lr ? lr.right + 10 : t.left + 10;
  const ty = spell ? t.top + t.height / 2 - a.height / 2 : lr ? lr.top : t.top + 10;
  const e = put('fx-fly', a, fromEl.innerHTML);
  fromEl.style.opacity = '0.25'; // 消さずに うすく（とちゅうで えらぶ 画面が 出ても 手札が きえない）
  await e.animate?.([
    { transform: 'none' },
    { transform: `translate(${(tx - a.left) * 0.5}px, ${(ty - a.top) * 0.5 - 40}px) scale(1.18) rotate(-4deg)`, offset: 0.5 },
    { transform: `translate(${tx - a.left}px, ${ty - a.top}px) scale(${spell ? 1.3 : 1})`, opacity: spell ? 0 : 1 },
  ], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).finished.catch(() => {});
  e.remove();
  if (spell) { const r = { left: tx, top: ty, width: a.width, height: a.height }; gone(put('fx-spell', r), 600); }
}

// ---- ターンの おび（あなたの ターン／てきの ターン） ----
export function banner(text, foe) {
  if (reduced()) return;
  gone(put(`fx-banner ${foe ? 'foe' : ''}`, null, `<b>${text}</b>`), 1300);
}

// ---- かち／まけ：画面いっぱいの 演出（タップで とばせる） ----
export function result(kind) {
  if (reduced()) return Promise.resolve();
  const text = { win: 'かった！', lose: 'まけた…', draw: 'ひきわけ' }[kind];
  const e = put(`fx-result ${kind}`, null, `<div class="fx-rays"></div><b>${text}</b>`);
  e.style.pointerEvents = 'auto';
  if (kind === 'win') for (let i = 0; i < 36; i++) {
    const c = document.createElement('i');
    c.className = 'fx-confetti';
    c.style.setProperty('--x', `${Math.random() * 100}vw`);
    c.style.setProperty('--h', `${Math.random() * 360}`);
    c.style.setProperty('--t', `${0.9 + Math.random() * 1.1}s`);
    c.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    c.style.animationDelay = `${Math.random() * 0.4}s`;
    e.appendChild(c);
  }
  return new Promise((res) => {
    const done = () => { if (!e.isConnected) return; e.classList.add('out'); setTimeout(() => { e.remove(); res(); }, 250); };
    e.onclick = done;
    setTimeout(done, kind === 'win' ? 1800 : 1400);
  });
}
