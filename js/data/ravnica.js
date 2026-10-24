// ラヴニカの 塔（REQUIREMENTS 7.4・docs/RAVNICA.md）：1〜4階は ギルドの リーダー、5階は ギルドパクトの ジェイス
// ニコル・ボーラスは とっておく（いつか レイドバトルの ボス）
import { FLOORS, KIT } from './enemies.js';

const { ecr, esp, pc, biggest, weakest, DIFF, build, toLib, attackers, sumPow } = KIT;
const att = (name, pow, tou, kw = [], x = {}) => ecr(name, pow, tou, [], kw, { attacks: true, ...x });
const wall = (name, pow, tou, kw = [], x = {}) => ecr(name, pow, tou, [], kw, { attacks: false, ...x });
const sap = ecr('苗木（なえぎ）', 1, 1, ['saproling'], [], { attacks: false, sapling: true });

// ---- セリフ（バトルの すすみぐあいで かわる。画面の ふきだしに 出る）----
// s.E.say ＝ いまの セリフ。おなじ ものは 1かいだけ（s.E.said）
export function speak(s, E, key, text) {
  if (!text || s.E.said?.[key]) return;
  s.E.said = { ...(s.E.said || {}), [key]: true };
  s.E.say = text;
  E.L(s, `${s.floor.speaker}「${text}」`);
}
// says = { mid（ライフ はんぶん・1かい ダメージ）, low（もう すこし）, pinch（きみの ライフが 5 いか）, win（きみの かち）, lose（きみの まけ）}
const pinch = (s, E, says) => { if (s.P.life > 0 && s.P.life <= 5) speak(s, E, 'pinch', says.pinch || 'もう ひと おし だ！'); };

// ---- ライフを もった リーダー（本体）の 階 ----
// c = { id, name, leader, line（リーダーの ことば）, goal, life: [かんたん, ふつう, むずかしい], deck, reveal?（めくる まいすう [かんたん, ふつう, むずかしい]）, turnStart?, beforeAttack?, hooks? }
function lifeFloor(c) {
  const check = (s, E) => {
    if (s.E.life <= 0) { s.over = 'win'; return; }
    if (s.E.life <= s.E.lifeMax / 4) speak(s, E, 'low', c.says.low);
    else if (s.E.life <= s.E.lifeMax / 2) speak(s, E, 'mid', c.says.mid);
  };
  // めくる まいすう：1.5 なら 1まい・2まいを かわりばんこ
  const revealN = (s) => Math.floor((s.E.flags.rv || 0) + (c.reveal ? DIFF(s, ...c.reveal) : 1));
  return () => ({
    id: c.id, name: c.name, rav: true, faceUnit: 1, faceLabel: c.leader, speaker: c.leader, lines: c.says,
    goal: () => `${c.leader}「${c.line}」\n${c.goal}`,
    setup(s, E) {
      s.E.life = DIFF(s, ...c.life); s.E.lifeMax = s.E.life; s.E.say = c.line;
      c.setup?.(s, E);
      for (const p of s.E.bf) p.sick = false;
      s.E.lib = toLib(s, E, build(c.deck));
    },
    async enemyTurn(s, E) {
      await c.turnStart?.(s, E);
      if (s.over) return;
      const k = revealN(s);
      s.E.flags.rv = (s.E.flags.rv || 0) + (c.reveal ? DIFF(s, ...c.reveal) : 1) - k;
      await E.reveal(s, k);
      if (s.over) return;
      const atk = attackers(s, E, (p) => p.def.attacks);
      c.beforeAttack?.(s, E, atk);
      await E.enemyAttack(s, atk);
      if (!s.over) pinch(s, E, c.says);
    },
    revealN,
    intent: (s, E) => (c.intent ? [c.intent(s, E)] : []),
    face(s, n, E) { s.E.life -= n; check(s, E); },
    faceValue: (s, n) => n * 1.5,
    check,
    priority(s, p, E) { return E.power(s, p) * 2 + 1; },
    assign(s, atkers, E) {
      if (sumPow(s, E, atkers) >= s.E.life) return atkers.map((p) => ({ p, t: 'face' }));
      const big = E.creatures(s, 'E').filter((p) => E.power(s, p) >= 3 || p.def.prio);
      return E.assignKill(s, atkers, E.killTargets(s, big), 'face');
    },
    threat(s, E) { const a = E.creatures(s, 'E').filter((p) => p.def.attacks); return { damage: sumPow(s, E, a) + (c.extra || 0), attackers: a.length }; },
    anyTarget() { return 'face'; },
    castThreat(s, d) { return d.types.includes('creature') ? d.pow + 1 : d.danger ?? 2; },
    status: (s) => `<span class="chip hot">${c.leader}の ライフ ${s.E.life}</span>`,
    ...c.hooks,
  });
}

// ---- クリーチャーの リーダーを たおす 階 ----
function bossFloor(c) {
  const boss = (s) => s.E.bf.find((p) => p.def.leader);
  return () => ({
    id: c.id, name: c.name, rav: true, speaker: c.leaderName, lines: c.says,
    goal: () => `${c.leaderName}「${c.line}」\n${c.goal}`,
    setup(s, E) {
      s.E.say = c.line;
      E.enter(s, 'E', c.leader(s));
      c.setup?.(s, E);
      for (const p of s.E.bf) p.sick = false;
      s.E.lib = toLib(s, E, build(c.deck));
    },
    async enemyTurn(s, E) {
      c.turnStart?.(s, E);
      if (s.over) return;
      await E.reveal(s, 1);
      if (s.over) return;
      await E.enemyAttack(s, attackers(s, E, (p) => p.def.attacks));
      if (!s.over) pinch(s, E, c.says);
    },
    onLeave(s, p) { if (p.def.leader) s.over = 'win'; },
    check(s, E) { const b = boss(s); if (b?.dmg > 0) speak(s, E, 'mid', c.says.mid); },
    priority(s, p, E) { return p.def.leader ? 30 : E.power(s, p) * 2 + 1; },
    assign(s, atkers, E) {
      const b = boss(s);
      if (!b) return [];
      if (sumPow(s, E, atkers) >= E.need(s, b)) return E.assignKill(s, atkers, [{ t: b, need: E.need(s, b), v: 30, creature: true }], b);
      return E.assignKill(s, atkers, E.killTargets(s, E.creatures(s, 'E').filter((p) => !p.def.leader)), b);
    },
    threat(s, E) { const a = E.creatures(s, 'E').filter((p) => p.def.attacks); return { damage: sumPow(s, E, a), attackers: a.length }; },
    anyTarget(s) { return boss(s) || null; },
    castThreat(s, d) { return d.types.includes('creature') ? d.pow + 1 : d.danger ?? 2; },
    status: (s, E) => { const b = boss(s); return b ? `<span class="chip hot">${c.leaderName} ${E.power(s, b)}/${E.pt(s, b)[1] - b.dmg}</span>` : ''; },
    ...c.hooks,
  });
}

// ===== 1階 =====
const boros = lifeFloor({
  id: 'boros', name: '1階 ボロスの 軍団（ぐんだん）', leader: 'アウレリア', life: [9, 11, 14],
  intent: (s, E) => `3体 いじょうで こうげき すると ぜんぶ ＋1（いま ${E.creatures(s, 'E').filter((p) => p.def.attacks && !p.tapped).length}体）`,
  says: { mid: 'くっ、なかなかの こうげきだ！', low: 'ボロスは さいごまで たたかう！', win: 'みごとだ。きみの ゆうきを みとめよう', lose: 'まだまだ くんれんが たりないぞ！' },
  line: 'ボロスの 軍（ぐん）よ、すすめ！ 3体 そろえば もっと つよいぞ',
  goal: 'アウレリアの ライフを 0に する。てきが 3体 いじょうで こうげきして くると、ぜんぶ パワー ＋1（大隊（だいたい））。',
  deck: [[5, att('ボロスの 新兵（しんぺい）', 2, 1)], [3, att('ボロスの 騎兵（きへい）', 2, 2)], [2, att('ボロスの 天使（てんし）', 3, 3, ['flying'])],
    [2, esp('稲妻（いなずま）の 一撃（いちげき）', (s, E) => { const t = biggest(s, E); if (t) E.damage(s, t, 3, null); E.sba(s); }, { danger: 3 })],
    [2, esp('軍団（ぐんだん）の 集結（しゅうけつ）', (s, E) => E.token(s, 'E', att('ボロスの 兵士（へいし）', 1, 1), 2), { danger: 3 })]],
  beforeAttack(s, E, atk) { if (atk.length >= 3) { for (const p of atk) E.pump(p, 1, 0); E.L(s, `だいたい：${atk.length}体で こうげき、ぜんぶ ＋1`); } },
  extra: 1,
});
const selesnya = lifeFloor({
  id: 'selesnya', name: '1階 セレズニアの 森（もり）', leader: 'トロスターニ', life: [8, 10, 13],
  intent: (s) => `なえぎが 1体 ふえて、ライフ ＋${Math.min(3, s.E.bf.filter((p) => p.def.sapling).length + 1)}`,
  says: { mid: '森（もり）の いのちは つきません', low: 'あなたの ちからも、森の ように つよい……', win: 'あなたと わたしたちは ひとつ。とおりなさい', lose: 'やすみなさい。森は また まっています' },
  line: '森の みんなが わたしを まもる。なえぎの かずだけ いやされるのです',
  goal: 'トロスターニの ライフを 0に する。てきの ターンの はじめに 苗木（なえぎ）が 1体 ふえて、なえぎの かずだけ ライフが ふえる（3まで）。',
  setup(s, E) { E.token(s, 'E', sap); },
  deck: [[4, wall('ドライアド', 1, 3)], [4, att('セレズニアの ケンタウルス', 3, 3)], [2, att('森の エルフ', 2, 2)],
    [3, esp('苗木（なえぎ）の めばえ', (s, E) => E.token(s, 'E', sap, 2), { danger: 2 })], [2, esp('いやしの 歌', (s) => { s.E.life += 3; }, { danger: 1 })]],
  turnStart(s, E) {
    E.token(s, 'E', sap);
    const n = Math.min(3, s.E.bf.filter((p) => p.def.sapling).length);
    s.E.life += n; E.L(s, `トロスターニ：なえぎで ライフ ＋${n}（のこり ${s.E.life}）`);
  },
  hooks: { priority(s, p, E) { return p.def.sapling ? 6 : E.power(s, p) * 2 + 1; } },
});
const simic = lifeFloor({
  id: 'simic', name: '1階 シミックの 研究所（けんきゅうじょ）', leader: 'ヴォレル', life: [7, 9, 12],
  intent: () => 'てきの ＋1/＋1カウンターが 2ばい',
  says: { mid: 'おもしろい データだ！', low: 'じっけんは しっぱい……かな？', win: 'きみの 計算（けいさん）、すばらしい！', lose: 'じっけんは だいせいこう！' },
  line: 'ふえるのが シミックの ちから。カウンターは 2ばい、また 2ばいだ！',
  goal: 'ヴォレルの ライフを 0に する。てきの ターンの はじめに、てきの クリーチャーの ＋1/＋1カウンターが 2ばいに なる（なければ 1こ）。',
  deck: [[5, att('シミックの 実験体（じっけんたい）', 1, 1)], [3, att('くらげの 兵（へい）', 2, 1)], [2, wall('サンゴの 壁（かべ）', 0, 4)],
    [2, esp('急速（きゅうそく）な 成長（せいちょう）', (s, E) => { for (const p of E.creatures(s, 'E')) E.addCounters(s, p, 1); }, { danger: 3 })], [2, att('うみへびの 子（こ）', 2, 2)]],
  turnStart(s, E) { for (const p of E.creatures(s, 'E')) { const k = Math.min(8, p.ctr ? p.ctr * 2 : 1); E.addCounters(s, p, k - p.ctr); } E.L(s, 'ヴォレル：カウンターが 2ばい'); },
  extra: 2,
});

// ===== 2階 =====
const izzet = lifeFloor({
  id: 'izzet', name: '2階 イゼットの 実験室（じっけんしつ）', leader: 'ニヴ＝ミゼット', life: [13, 16, 20], reveal: [1, 1.5, 2],
  intent: () => 'じゅもんを めくったら きみに 1点',
  says: { mid: 'ほう、なぞが とけて きたか', low: 'わしの 計算（けいさん）が くるう だと!?', win: 'みごと。きみは なかなかの 天才（てんさい）だ', lose: 'なぞは まだ とけて いないぞ' },
  line: 'なぞを とけるかな？ わしが じゅもんを めくる たびに 1点 だ！',
  goal: 'ニヴ＝ミゼットの ライフを 0に する。てきが じゅもんを めくる たびに、きみは 1点 うける。',
  deck: [[4, att('イゼットの 魔道士（まどうし）', 2, 2)], [3, att('火花（ひばな）の 精（せい）', 3, 1)],
    [3, esp('ひらめき', () => {}, { danger: 1 })], [2, esp('電撃（でんげき）', (s, E) => { const t = weakest(s, E); if (t) E.damage(s, t, 2, null); E.sba(s); }, { danger: 3 })],
    [2, esp('実験（じっけん）の 失敗（しっぱい）', (s, E) => { for (const p of [...pc(s, E), ...E.creatures(s, 'E')]) E.damage(s, p, 1, null); E.sba(s); }, { danger: 3 })]],
  hooks: { onReveal(s, d, E) { if (d.types.includes('sorcery')) { E.L(s, 'ニヴ＝ミゼット：じゅもんで 1点'); E.hurt(s, 1); } } },
  extra: 1,
});
const golgari = lifeFloor({
  id: 'golgari', name: '2階 ゴルガリの 地下（ちか）', leader: 'ジャラド', life: [11, 13, 17], reveal: [1, 1.5, 2],
  intent: () => 'てきの クリーチャーが しぬと ジャラドの ライフ ＋1',
  says: { mid: 'つちの 下から、まだ わいて くるぞ', low: 'くさって しまいそうだ……', win: 'きみは つちに かえらなかったな', lose: 'つちに かえるが よい' },
  line: 'しんだ ものは つちに かえり、わたしの ちからに なる',
  goal: 'ジャラドの ライフを 0に する。てきの クリーチャーが しぬ たびに、ジャラドの ライフが 1 ふえる。',
  deck: [[4, att('ゴルガリの ゾンビ', 2, 2)], [4, att('地下（ちか）の 虫（むし）', 1, 1)], [2, att('苔（こけ）の ゴーレム', 3, 4)],
    [2, esp('墓（はか）からの 帰還（きかん）', (s, E) => { const i = s.E.gy.findIndex((c) => c.def.types.includes('creature')); if (i >= 0) { const [c] = s.E.gy.splice(i, 1); E.enter(s, 'E', c.def); } }, { danger: 3 })],
    [2, esp('腐敗（ふはい）の 霧（きり）', (s, E) => { const t = weakest(s, E); if (t) E.addMinus(s, t, 1, 'E'); E.sba(s); }, { danger: 2 })]],
  hooks: { onLeave(s, p, E, o) { if (p.side === 'E' && o?.died && E.isCreature(p)) { s.E.life += 1; E.L(s, `ジャラド：ライフ ＋1（${s.E.life}）`); } } },
});
const azorius = lifeFloor({
  id: 'azorius', name: '2階 アゾリウスの 議事堂（ぎじどう）', leader: 'イスペリア', life: [10, 12, 15],
  intent: () => 'きみの カードは コスト ＋1',
  says: { mid: 'ほうりつ いはんでは ありませんね', low: 'この しんぱんは……くつがえるのですか', win: 'あなたの かちを みとめます。ほうりつどおりに', lose: 'ほうりつは まもられました' },
  line: 'ほうりつを まもりなさい。じゅもんは 1マナ たかく なります',
  goal: 'イスペリアの ライフを 0に する。きみの カードは コストが 1 ふえる（きほんカードは そのまま）。',
  deck: [[4, att('アゾリウスの 飛行機械（ひこうきかい）', 1, 1, ['flying'])], [3, wall('法（ほう）の 番人（ばんにん）', 0, 4)], [3, att('アゾリウスの 騎士（きし）', 2, 3)],
    [2, esp('こおりつく 法（ほう）', (s, E) => { const t = biggest(s, E); if (t) { t.tapped = true; t.frozen = true; } }, { danger: 2 })], [2, att('スフィンクスの 使（つか）い', 3, 3, ['flying'])]],
  hooks: { costTax: (s, d) => (d.basic || !d.cost ? 0 : 1) },
});

// ===== 3階 =====
const rakdos = lifeFloor({
  id: 'rakdos', name: '3階 ラクドスの ショー', leader: 'ラクドス', life: [12, 15, 19],
  intent: (s, E) => `この ターンの ダメージ ${E.dmgThisTurn(s)}点：3点より すくないと ブーイング（2点）`,
  says: { mid: 'いいぞ いいぞ、もっと もりあげろ！', low: 'ショーの クライマックスだ！', win: 'さいこうの ショーだったぜ！', lose: 'ショーは おしまい！ また こいよ' },
  line: 'ショーの じかんだ！ 1ターンに 3点より すくないと つまらないぞ',
  goal: 'ラクドスの ライフを 0に する。2ターンめ から、きみの ターンに てきへの ダメージが 3点より すくないと、ラクドスの ターンの はじめに 2点 うける（ブーイング）。',
  deck: [[4, att('ラクドスの 悪魔（あくま）', 3, 1)], [3, att('ショーの 道化（どうけ）', 2, 2)], [2, att('火（ひ）を ふく 芸人（げいにん）', 4, 2)],
    [3, esp('かがり火（び）', (s, E) => { const t = weakest(s, E); if (t) E.damage(s, t, 2, null); E.sba(s); }, { danger: 3 })], [2, esp('もりあがり', (s, E) => { for (const p of E.creatures(s, 'E')) E.pump(p, 1, 0); }, { danger: 3 })]],
  turnStart(s, E) { const d = s.E.flags.show ?? 3; if (d < 3 && s.stats.playerTurns >= 2) { E.L(s, `ラクドス：${d}点 だけ？ ブーイング！`); E.hurt(s, 2); } },
  hooks: { endTurn(s, E) { if (s.active === 'P') s.E.flags.show = E.dmgThisTurn(s); } },
  extra: 2,
});
const orzhov = lifeFloor({
  id: 'orzhov', name: '3階 オルゾフの 聖堂（せいどう）', leader: 'テイサ', life: [11, 14, 18], reveal: [1, 1.5, 2],
  intent: () => 'じゅもんを めくったら きみ −1・テイサ ＋1',
  says: { mid: 'ずいぶん はらって くれるのね', low: 'わたしの きんこが……！', win: 'きみの かち。おつりは いらないよ', lose: 'しゃっきんは また こんど かえしてね' },
  line: 'ただでは とおさないよ。じゅもん 1つで 1点 いただく',
  goal: 'テイサの ライフを 0に する。てきが じゅもんを めくる たびに、きみは 1点 うけて テイサの ライフが 1 ふえる（強請（ゆすり））。',
  deck: [[3, att('オルゾフの 霊（れい）', 1, 1, ['flying'])], [3, att('オルゾフの 騎士（きし）', 2, 3)], [2, wall('聖堂（せいどう）の 番兵（ばんぺい）', 1, 5)],
    [4, esp('借金（しゃっきん）の とりたて', () => {}, { danger: 2 })], [1, esp('死（し）の 契約（けいやく）', (s, E) => { const t = biggest(s, E); if (t) E.destroy(s, t); E.sba(s); }, { danger: 5 })]],
  hooks: { onReveal(s, d, E) { if (d.types.includes('sorcery')) { s.E.life += 1; E.L(s, 'テイサ：ゆすり'); E.hurt(s, 1); } } },
  extra: 1,
});

// ===== 4階 =====
// ラザーヴの すがた：きみの いちばん パワーの 大きい クリーチャーの パワー・タフネス（3/3 いじょう）
function lazav(s, E) {
  const t = biggest(s, E);
  const [a, b] = t ? E.pt(s, t) : [0, 0];
  return [Math.max(3, a), Math.max(3, b)];
}
const gruul = bossFloor({
  id: 'gruul', name: '4階 グルールの あれ地（ち）', leaderName: 'ボルボルグミ',
  says: { mid: 'いたく ない！ もっと こい！', win: 'ガ……ア……おまえ、つよい', lose: 'ガハハ！ おれの かちだ！' },
  line: 'ガアアア！ 1ターンで たくさん あてないと おれは たおれないぞ',
  goal: 'ボルボルグミを たおす。ダメージは ターンの おわりに なくなるので、1ターンで タフネスと おなじ だけ あてよう（たし算）。',
  leader: (s) => ecr('ボルボルグミ', DIFF(s, 3, 3, 4), DIFF(s, 5, 5, 7), ['cyclops'], ['trample'], { leader: true, attacks: true, noCopy: true, noBlock: true }),
  deck: [[4, att('グルールの 狂戦士（きょうせんし）', 2, 2)], [2, att('あれ地の 獣（けもの）', 3, 3)], [2, att('さけぶ ゴブリン', 2, 1, ['haste'])],
    [3, esp('いかりの 雄叫（おたけ）び', (s, E) => { for (const p of E.creatures(s, 'E')) E.pump(p, 1, 0); }, { danger: 3 })], [2, esp('岩（いわ）なげ', (s, E) => { const t = weakest(s, E); if (t) E.damage(s, t, 3, null); E.sba(s); }, { danger: 3 })]],
});
const dimir = bossFloor({
  id: 'dimir', name: '4階 ディミーアの 影（かげ）', leaderName: 'ラザーヴ',
  says: { mid: 'ほう、わたしが 見えるのかい？', win: 'ほんものを 見ぬくとは……おみごと', lose: 'わたしの ことは わすれて おくれ' },
  line: 'わたしは だれにでも なれる。きみの いちばん つよい クリーチャーにも ね',
  goal: 'ラザーヴを 2かい たおす（1かいめは にせもの）。ラザーヴは いつも きみの いちばん パワーの 大きい クリーチャーと おなじ パワー・タフネスに なる（3/3 より 小さく ならない）。',
  leader: () => ecr('ラザーヴ', (s, p, E) => lazav(s, E)[0], (s, p, E) => lazav(s, E)[1], ['shapeshifter'], [], { leader: true, attacks: true, noCopy: true, noBlock: true }),
  hooks: {
    onLeave(s, p, E) {
      if (!p.def.leader) return;
      if (s.E.flags.lzReal) { s.over = 'win'; return; }
      s.E.flags.lzReal = true;
      speak(s, E, 'fake', 'それは にせものさ。ほんものの わたしは ここだ');
      E.enter(s, 'E', p.def);
    },
  },
  deck: [[4, att('ディミーアの 密偵（みってい）', 2, 1, [], { unblockable: true })], [3, att('影（かげ）の 刺客（しかく）', 2, 2, ['deathtouch'])], [2, wall('記憶（きおく）の 番人（ばんにん）', 0, 5)],
    [3, esp('記憶（きおく）けし', (s, E) => { E.mill(s, 2); }, { danger: 1 })], [2, esp('心（こころ）の よみとり', (s, E) => { const t = biggest(s, E); if (t) { E.bounce(s, t); E.sba(s); } }, { danger: 4 })]],
});

// ===== 5階：ギルドパクトの ジェイス =====
// ライフを 3つに わけた だんかい。だんかいが かわる ときと ライフが へった ときに しゃべる（s.E.say）
const JACE_LINES = {
  start: 'ようこそ、ラヴニカへ。ぼくは ジェイス、ギルドパクトそのものだ。10の ギルドの ちからで きみを ためさせて もらうよ',
  p2: 'なかなか やるね。つぎは ギルドの まもり手たちの ばんだ',
  p3: '……ここまで くるとは。ぼくの 心（こころ）の まほうを 見せよう',
  low: 'まだだ……ギルドパクトは くずれない！',
  pinch: 'あきらめるかい？ ラヴニカの ギルドは きびしいよ',
  win: 'きみの かちだ。ラヴニカの ギルドは きみを みとめた',
  lose: 'また いつでも おいで。ラヴニカは にげない',
};
const GUARDS = ['ボロス', 'セレズニア', 'シミック', 'イゼット', 'ゴルガリ', 'アゾリウス', 'ラクドス', 'オルゾフ', 'グルール', 'ディミーア'];
const JACE_DECK = [[4, att('ジェイスの 幻影（げんえい）', 2, 2)], [3, att('思考（しこう）の 飛行機械（ひこうきかい）', 1, 1, ['flying'])], [2, wall('ギルドの 門番（もんばん）', 0, 5)],
  [2, esp('心（こころ）の ゆさぶり', (s, E) => { const t = weakest(s, E); if (t) { t.tapped = true; t.frozen = true; } }, { danger: 2 })],
  [2, esp('ギルドパクトの いかずち', (s, E) => { const t = biggest(s, E); if (t) E.damage(s, t, 4, null); E.sba(s); }, { danger: 4 })]];
function jace() {
  const say = (s, E, k) => speak(s, E, k, JACE_LINES[k]);
  const phaseOf = (s) => (s.E.life > (s.E.lifeMax * 2) / 3 ? 1 : s.E.life > s.E.lifeMax / 3 ? 2 : 3);
  const talk = (s, E) => {
    const ph = phaseOf(s);
    if (ph !== s.phase && !s.over) { s.phase = ph; s.stats.phase = ph; say(s, E, ph === 2 ? 'p2' : 'p3'); }
    if (s.E.life > 0 && s.E.life <= s.E.lifeMax / 6) say(s, E, 'low');
    pinch(s, E, JACE_LINES);
  };
  return {
    id: 'jace', name: '5階 ギルドパクトの ジェイス', rav: true, faceUnit: 1.5, faceLabel: 'ジェイス', speaker: 'ジェイス', lines: JACE_LINES,
    goal: () => `ジェイス「${JACE_LINES.start}」\n3つの だんかいを こえて、ジェイスの ライフを 0に する。1だんかい：きみの カードは コスト ＋1。2だんかい：ギルドの まもり手が 毎ターン 出る。3だんかい：毎ターン、きみの いちばん つよい クリーチャーを てふだに もどして、きみに 3点。`,
    setup(s, E) {
      s.E.life = DIFF(s, 30, 38, 45); s.E.lifeMax = s.E.life;
      s.phase = 1; s.stats.phase = 1;
      s.E.say = JACE_LINES.start;
      s.E.lib = toLib(s, E, build(JACE_DECK));
    },
    async enemyTurn(s, E) {
      if (s.phase === 2) E.token(s, 'E', att(`${GUARDS[Math.floor(s.rng() * GUARDS.length)]}の まもり手`, 3, 3));
      if (s.phase === 3) { const t = biggest(s, E); if (t) { E.L(s, `ジェイス：${t.def.name} を てふだに`); E.bounce(s, t); E.sba(s); } E.hurt(s, DIFF(s, 2, 3, 3)); }
      if (s.over) return;
      await E.reveal(s, 1);
      if (s.over) return;
      await E.enemyAttack(s, attackers(s, E, (p) => p.def.attacks));
      talk(s, E);
    },
    intent: (s) => [['きみの カードは コスト ＋1', 'ギルドの まもり手（3/3）が 出る', 'いちばん つよい クリーチャーを てふだに もどして きみに 3点'][s.phase - 1]],
    costTax: (s, d) => (s.phase === 1 && !d.basic && d.cost ? 1 : 0),
    face(s, n, E) { s.E.life -= n; if (s.E.life <= 0) s.over = 'win'; else talk(s, E); },
    faceValue: (s, n) => n * 2,
    check(s, E) {
      if (s.E.life <= 0) s.over = 'win';
      if (!s.over) talk(s, E);
    },
    priority(s, p, E) { return E.power(s, p) * 2 + 1; },
    assign(s, atkers, E) {
      if (sumPow(s, E, atkers) >= s.E.life) return atkers.map((p) => ({ p, t: 'face' }));
      return E.assignKill(s, atkers, E.killTargets(s, E.creatures(s, 'E').filter((p) => E.power(s, p) >= 3)), 'face');
    },
    threat(s, E) { const a = E.creatures(s, 'E').filter((p) => p.def.attacks); return { damage: sumPow(s, E, a) + (s.phase === 3 ? 2 : 0), attackers: a.length + (s.phase === 2 ? 1 : 0) }; },
    anyTarget() { return 'face'; },
    castThreat(s, d) { return d.types.includes('creature') ? d.pow + 1 : d.danger ?? 2; },
    status: (s) => `<span class="chip">だんかい ${s.phase}/3</span><span class="chip hot">ジェイスの ライフ ${s.E.life}</span>`,
  };
}

export const RAVNICA = { boros, selesnya, simic, izzet, golgari, azorius, rakdos, orzhov, gruul, dimir, jace };
Object.assign(FLOORS, RAVNICA);
export const RAV_SLOTS = [['boros', 'selesnya', 'simic'], ['izzet', 'golgari', 'azorius'], ['rakdos', 'orzhov'], ['gruul', 'dimir'], ['jace']];
export const pickRavnica = (rng) => RAV_SLOTS.map((ids) => ids[Math.floor(rng() * ids.length)]);
export const RAV_NAMES = Object.fromEntries(Object.entries(RAVNICA).map(([k, f]) => [k, f().name]));
