// レイド（docs/RAID.md）の この 端末の きろく。しゅぎょう（study.js）からも 点を 足すので、画面（raid.js）と わけて おく
import { hasServer, call, CONF } from './server.js';

// いまの レイド。ends は おわる 時刻（ミリ秒）。null は 期間なし（開発中）
export const RAID = { id: 'tarkir-1', name: 'タルキール大戦（たいせん）', ends: Date.parse('2026-11-01T20:00:00+09:00') }; // 2026年11月1日（日）20時（日本時間）まで
export const WIN_PTS = 10, FINISH_PTS = 5, DEF_PTS = 3; // DEF：じぶんの ゴーストが かつと（ぼうえい点）
const KEY = 'mtg-raid-v1';
const fresh = () => ({ id: RAID.id, f: null, c: null, w: 0, l: 0, d: 0, q: 0, fin: 0, g: null, def: 0, defSeen: 0 });

export function loadRaid() {
  try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); return r && r.id === RAID.id ? { ...fresh(), ...r } : fresh(); } catch { return fresh(); }
}
export function saveRaid(r) { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* 保存できなくても あそべる */ } }
// WEB版（サーバーなし）は 仮モード：期間を 気に せず いつでも あそべる（点は この 端末だけ）
export const raidFree = () => !hasServer();
// WEB版：デバッグモードの せってい（settings.js）で タイトルに 出さない ことも できる（この 端末だけ。点は のこる）
const HIDE_KEY = 'mtg-raid-hide';
let hide = (() => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } })();
export const raidHidden = () => hide;
export const setRaidHidden = (v) => { hide = v; try { localStorage.setItem(HIDE_KEY, v ? '1' : '0'); } catch { /* この あいだだけ */ } applyRaid(); };
// GAS 版：レイドの ID と おわる 時刻は 先生の せってい シート（server.js の CONF.raid）。ない ときは レイドなし
// （開発モードの 画面で「出さない」に した ときも サーバーが レイドなしに する）
export function applyRaid() {
  if (!hasServer()) { RAID.off = hide; return; }
  RAID.off = !CONF.raid;
  if (CONF.raid) { RAID.id = CONF.raid.id; RAID.ends = CONF.raid.ends; }
}
applyRaid();
export const raidOpen = () => !RAID.off && (raidFree() || !RAID.ends || Date.now() < RAID.ends);
// おわってから 1週間は けっかを 見られる
export const raidShown = () => !RAID.off && (raidOpen() || Date.now() < RAID.ends + 7 * 86400000);
// じぶんの 点 ＝ かった 数 × 10 ＋ といた 問題の 数 ＋ 統率者で とどめ × 5 ＋ ゴーストが まもった 数 × 3
export const raidPoints = (r) => r.w * WIN_PTS + r.q + r.fin * FINISH_PTS + r.def * DEF_PTS;

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
