// レイド（docs/RAID.md）の この 端末の きろく。しゅぎょう（study.js）からも 点を 足すので、画面（raid.js）と わけて おく
import { hasServer, call } from './online.js';

// いまの レイド。ends は おわる 時刻（ミリ秒）。null は 期間なし（開発中）
export const RAID = { id: 'tarkir-1', name: 'タルキール大戦（たいせん）', ends: null };
export const WIN_PTS = 10, FINISH_PTS = 5;
const KEY = 'mtg-raid-v1';
const fresh = () => ({ id: RAID.id, f: null, c: null, w: 0, l: 0, d: 0, q: 0, fin: 0 });

export function loadRaid() {
  try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); return r && r.id === RAID.id ? { ...fresh(), ...r } : fresh(); } catch { return fresh(); }
}
export function saveRaid(r) { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* 保存できなくても あそべる */ } }
export const raidOpen = () => !RAID.ends || Date.now() < RAID.ends;
// じぶんの 点 ＝ かった 数 × 10 ＋ といた 問題の 数 ＋ 統率者で とどめ × 5
export const raidPoints = (r) => r.w * WIN_PTS + r.q + r.fin * FINISH_PTS;

// 点を サーバーに たす（つながらなくても この 端末の きろくは のこる）
export function sendRaid(r, add) {
  if (!hasServer() || !r.f) return Promise.resolve(null);
  return call('mtgRaidAdd', { id: RAID.id, f: r.f, c: r.c, ...add }).catch(() => null);
}

// しゅぎょうで せいかいした 問題の 数（レイドに 参加中 だけ）
export function addRaidQuiz(ok) {
  if (!ok || !raidOpen()) return;
  const r = loadRaid();
  if (!r.f) return;
  r.q += ok;
  saveRaid(r);
  sendRaid(r, { q: ok });
}
