// パック＆バトルの ステージ 6「しゅうまつの しま」の 5人（2026-11-21。docs/PACKBATTLE.md 17章）と、テーロスがわ 15人の セリフ
// とうの 階と おなじ つくり（まいターン じぶんの 山札から 1まい めくる）。ライフを もち、ライフが へると すがたが かわる（第2形態・ボスは 3だんかい）
// ここの あいては パック＆バトル だけに 出る（ぼうけんの とう・次元渡りには 出ない）
import { KIT, guardGoes } from './enemies.js';
import { RAV_KIT } from './ravnica.js';

const { ecr, esp, pc, biggest, weakest, DIFF, build, toLib, attackers, sumPow } = KIT;
const { speak } = RAV_KIT;
const att = (name, pow, tou, kw = [], x = {}) => ecr(name, pow, tou, [], kw, { attacks: true, ...x });
const wall = (name, pow, tou, kw = [], x = {}) => ecr(name, pow, tou, [], kw, { attacks: false, ...x });

// ---- セリフ（テーロスがわ 15人）：start ＝ とうじょう、sig ＝ きめわざ、low ＝ ピンチ（あいてが おいつめられた）、win ＝ あいてが まけた とき ----
// form：すがたが かわる とき（ステージ 6 の 5人 だけ。ボスは 2つ）。pinch：きみの ライフが 5 いかの とき（ステージ 6 の 5人 だけ）
export const PB_LINES = {
  hydra: { start: 'あたまを たおしても、また はえて くるぞ。', sig: 'ガオオオ！ みんなで ほえろ！', low: 'む……あたまが たりなく なって きた。', win: 'ぜんぶ たおされた……まいった。' },
  clock: { start: 'はりを ちょうど 12に とめて ごらん。', sig: 'カチッ。はりに いたずら しちゃえ。', low: 'チク、タク……もう すぐ 12に なって しまう。', win: 'ボーン。ぴったり 12時。おみごと。' },
  horde: { start: 'おれたちは やまほど いるぞ！', sig: 'ドドドド！ ぜんいん すすめ！', low: 'な、なかまが へって きた……！', win: 'やまほど いたのに……まけた！' },
  dragon: { start: 'ぐう……だれだ、わしの きんかに さわるのは。', sig: 'わしの たからに さわるな！ ボオオ！', low: 'ま、まて。それ いじょう もって いくな！', win: 'やれやれ……きんかは もって いけ。' },
  factory: { start: 'かぎと 同じ 数で ないと、こわれないよ。', sig: 'ギギギ。ねじを まいて うごきを とめる。', low: 'ガタガタ……きかいが おいつかない。', win: 'ピー……かぎが ぴったり。こうじょう ていし。' },
  slime: { start: 'ぷるん。きっても きっても ふえるよ。', sig: 'ぷるぷる〜。つかまえた！', low: 'ぷる……ちいさく なっちゃった。', win: 'ぷしゅう……もう わかれられない。' },
  twins: { start: 'ふたり いっしょで ないと、たおれないぞ。', sig: 'せーの、どしーん！', low: 'あにき！ ひとりに しないで くれ！', win: 'ふたり いっしょに……まけた。' },
  xenagos: { start: 'さあ、うたげの はじまりだ！', sig: 'たいこを ならせ！ もっと さわげ！', low: 'おい、なかまは どこへ いった？', win: 'うたげは おしまいか……たのしかったぞ。' },
  gorgon: { start: 'つよい 子ほど、石に なるのよ。', sig: '石の 庭の かぜよ、ふきなさい。', low: 'わたしの 目を 見ないで たたかうなんて……。', win: 'みごとね。石に ならなかったのは あなただけ。' },
  erebos: { start: 'ここまで 来るとは。ほんきを 見せよう。', sig: 'むちの おとを きくが よい。', low: '神（かみ）の わたしが、おされて いる……？', win: '……みとめよう。地上（ちじょう）へ かえるが よい。' },
  harisen: { start: 'さわると いたいぞ。とげとげ だからな！', sig: 'とげ、とんでけ！', low: 'いたた……とげが おれて きた。', win: 'まいった。もう ちくちく しないよ。',
    form: ['もう おこった！ ぜんいん とつげきだ！'], sig2: 'はりの あらしだ！ よけて みろ！', pinch: 'ちくちく、あと すこしだ！' },
  kameron: { start: 'ぼくの こうらは かたいよ。ぴったりで ないと とおらない。', sig: 'こうらに かくれて ひとやすみ。', low: 'こ、こうらに ひびが……。', win: 'ぴったり だったね。まいりました。',
    form: ['こうらを もっと かたく するよ。こんどは こっちの ばんだ。'], sig2: 'ごろごろ、こうら アタック！', pinch: 'ゆっくり でも、かつのは ぼくだよ。' },
  konkon: { start: 'いちばん 小さい 子から ねらうよ。コン。', sig: 'ねらって……えいっ！', low: 'あれれ、ねらいが さだまらない。', win: 'コン……きみの かちだ。',
    form: ['かくれるのは やめた。みんなで とびだすよ！'], sig2: 'つづけて うつよ！ えい、えい！', pinch: 'つぎは きみを ねらうよ。' },
  rirara: { start: 'ラララ……うたを きいたら、ねむく なるわよ。', sig: 'ねんねん、こもりうた。', low: 'こえが かすれて きたわ……。', win: 'すてきな たたかい だったわ。ラララ。',
    form: ['やさしい うたは おしまい。あらしの うたを きいて！'], sig2: 'あらしの うた、ラララ！', pinch: 'さいごの 一きょくを きかせて あげる。' },
  owaron: { start: 'わしが しゅうまつの りゅう オワロン。ここが さいごの たたかいだ。', sig: 'こりゅうたちよ、あつまれ！', low: 'ばかな……わしが おされて いるのか。', win: 'みごとだ。しゅうまつは まだ 来ない……きみの かちだ。',
    form: ['とげの うろこを 見せて やろう。さわると いたいぞ。', 'ほんとうの すがたを 見せよう。ぴったりで ないと とおらぬぞ！'], sig2: 'とげの うろこを くらえ！', sig3: 'しゅうまつの ほのおだ！', pinch: 'おわりの ときが 来たな。' },
};

// 特別ステージ「番外編の 挑戦者たち」の 8人（data/packbattle.js の PB_EX。デッキで たたかう）
Object.assign(PB_LINES, {
  ex_touko: { start: 'やあ。人形（にんぎょう）と あそんで いくかい？', sig: 'ざんねん、それは 予備（よび）の 体だよ。', low: 'ふむ……人形（にんぎょう）が たりなく なって きたな。', win: 'おみごと。つぎの 人形は もっと じょうずに 作るよ。' },
  ex_fgo: { start: '英霊（えいれい）たちよ、力を かして！', sig: '宝具（ほうぐ）、かいほう！', low: 'まだ……令呪（れいじゅ）が のこって いる！', win: 'いい たたかい だった。きみが マスターだ。' },
  ex_hoshi: { start: '列車（れっしゃ）の たびの とちゅうで、ひとしょうぶ！', sig: 'いまだ、必殺技（ひっさつわざ）！', low: 'せんぎポイントが もう ない……！', win: 'まけたよ。つぎの 星でも また あおう。' },
  ex_kyuu: { start: 'つぎの えきまで 時間が ある。ひとしょうぶ しよう。', sig: 'おいで、記憶（きおく）の精霊（せいれい）！', low: 'まずい、なかまが たりない……！', win: 'いい しょうぶ だった。列車（れっしゃ）で また あおう。' },
  ex_akira: { start: 'ホロウの しごとの まえに、うでだめしだ。', sig: 'ブレイク！ いっきに いくよ！', low: 'エージェントが たおれて いく……！', win: 'やるね。ビデオ屋（や）で また あおう。' },
  ex_rin: { start: 'おにいちゃんより わたしの ほうが 強いよ！ しょうぶ！', sig: '異常（いじょう）を つけたよ！ ここから いくね！', low: 'わわっ、ちょっと まって……！', win: 'まけちゃった！ こんどは ビデオを かりに 来てね。' },
  ex_aoko: { start: 'さあ、派手（はで）に いくわよ！', sig: 'マジックガンナー、うちぬく！', low: 'ちょっと、やるじゃない……！', win: 'まいったわ。つぎは まけないからね！' },
  ex_alice: { start: '……童話（どうわ）の 時間よ。', sig: 'おいで、グレートスリー。', low: '……プロイが、たりない。', win: '……わたしの まけ。お茶に しましょう。' },
});

// ---- 部品 ----
const snipe = (s, E, who, n) => { const t = weakest(s, E); if (!t) return; E.L(s, `${who}の ねらいうち：${t.def.name}に ${n}点`); E.damage(s, t, n, null); E.sba(s); };
const sleep = (s, E, who) => { const t = biggest(s, E, (p) => !p.frozen); if (!t) return; t.tapped = true; t.frozen = true; E.L(s, `${who}の うた：${t.def.name}は ねむった（つぎの ターン うごけない）`); };
const allHit = (s, E, n) => { for (const p of pc(s, E)) E.damage(s, p, n, null); E.sba(s); };
const heal = (s, n) => { s.E.life += n; };
// きめわざ：すがた（s.phase）で なまえと こうかが かわる。fx[i] ＝ i+1 ばんめの すがたの こうか
const sigs = (id, list) => list.map(([name, fx, danger = 2], i) => esp(name, (s, E) => { fx(s, E); E.sba(s); const L = PB_LINES[id]; speak(s, E, `sig${i + 1}`, L[i ? `sig${i + 1}` : 'sig']); }, { danger, sig: true, form: i + 1 }));

// ---- ライフと すがたを もつ あいての 階 ----
// c = { id, who, life: [かんたん, ふつう, むずかしい], cuts：すがたが かわる ライフの わりあい, deck, sigs, goal,
//   mode(s)：こうげきの くせ（'rush' ぜんいん こうげき・'hold' 数で かって いる ときだけ・'' こうげき役 だけ）, thorn(s)：とげの 点, shell(s)：こうらの 数（0 ＝ なし）,
//   turnStart(s, E), onForm(s, E, ph), intent(s, E) }
function formFloor(c) {
  const L = PB_LINES[c.id];
  const formOf = (s) => c.cuts.filter((x) => s.E.life <= s.E.lifeMax * x).length + 1;
  const after = (s, E) => {
    if (s.E.life <= 0) { s.over = 'win'; return; }
    const ph = formOf(s);
    if (ph > s.phase) { // すがたが かわる（ライフが もどっても もとには もどらない）
      s.phase = ph; s.stats.phase = ph;
      E.L(s, `${c.who}の すがたが かわった（${ph}だんかいめ）`);
      const next = c.sigs[ph - 1];
      let n = 0;
      s.E.lib = s.E.lib.map((x) => (x.def.sig ? (n++, E.card(next)) : x)); // のこりの きめわざが あたらしい きめわざに かわる
      if (!n) s.E.lib.splice(Math.floor(s.rng() * (s.E.lib.length + 1)), 0, E.card(next)); // なければ 1まい 足す
      c.onForm?.(s, E, ph);
      speak(s, E, `form${ph}`, L.form[ph - 2]);
    }
    if (s.E.life <= s.E.lifeMax / 4) speak(s, E, 'low', L.low);
  };
  return () => ({
    id: c.id, name: c.who, rav: true, pbForm: true, faceUnit: 1, faceLabel: c.who, speaker: c.who, lines: { win: L.win },
    goal: () => `${c.who}「${L.start}」\n${c.goal}`,
    setup(s, E) {
      s.E.life = DIFF(s, ...c.life); s.E.lifeMax = s.E.life; s.E.say = L.start; s.phase = 1; s.stats.phase = 1;
      for (const d of c.start || []) E.enter(s, 'E', d);
      for (const p of s.E.bf) p.sick = false;
      s.E.lib = toLib(s, E, build(s.diff === 'easy' && !c.reveal ? c.deck : [...c.deck, ...c.deck])); // ふつう・むずかしいは 2まいずつ めくる ので、山札も 2ばい
    },
    async enemyTurn(s, E) {
      s.E.flags.pbTurn = (s.E.flags.pbTurn || 0) + 1;
      c.turnStart?.(s, E);
      if (s.over) return;
      await E.reveal(s, c.reveal ? c.reveal(s) : DIFF(s, 1, 2, 2));
      if (s.over) return;
      const mode = c.mode(s);
      let atk = attackers(s, E, (p) => mode === 'rush' || p.def.attacks);
      // 'hold'：きみの おきて いる クリーチャーより 多い ときだけ こうげき（きみの ライフが 5 いかなら せめる）。まもり役の すきを つく こうげきは そのまま
      if (mode === 'hold' && s.P.life > 5 && atk.length <= pc(s, E).filter((p) => !p.tapped).length) atk = atk.filter((p) => guardGoes(s, E, p));
      await E.enemyAttack(s, atk);
      if (!s.over && s.P.life > 0 && s.P.life <= 5) speak(s, E, 'pinch', L.pinch);
    },
    intent: (s, E) => c.intent(s, E),
    // 本体への ダメージ。こうら：こうらの 数と ちょうど 同じ ダメージは そのまま。ちがう 数は 半分（きりあげ）。とげ：こうげきして きた クリーチャーに かえす
    face(s, n, E, src) {
      const k = c.shell?.(s) || 0;
      if (k && n !== k) { const h = Math.ceil(n / 2); E.L(s, `こうら（${k}）：${n}点は ぴったりで ない → 半分の ${h}点`); n = h; } else if (k) E.L(s, `こうら（${k}）：ぴったり ${n}点！ そのまま とおる`);
      s.E.life -= n;
      const t = c.thorn?.(s) || 0;
      if (t && src && src.side === 'P' && E.isCreature(src) && s.P.bf.includes(src)) { E.L(s, `とげ：${src.def.name}に ${t}点 かえす`); E.damage(s, src, t, null); }
      after(s, E);
    },
    faceValue: (s, n) => n * 1.5,
    check: after,
    priority(s, p, E) { return E.power(s, p) * 2 + 1; },
    assign(s, atkers, E) {
      if (sumPow(s, E, atkers) >= s.E.life * (c.shell?.(s) ? 2 : 1)) return atkers.map((p) => ({ p, t: 'face' }));
      const big = E.creatures(s, 'E').filter((p) => E.power(s, p) >= 3);
      return E.assignKill(s, atkers, E.killTargets(s, big), 'face');
    },
    threat(s, E) { const m = c.mode(s), a = E.creatures(s, 'E').filter((p) => m === 'rush' || p.def.attacks); return { damage: sumPow(s, E, a) + 1, attackers: a.length }; },
    anyTarget() { return 'face'; },
    castThreat(s, d) { return d.types.includes('creature') ? d.pow + 1 : d.danger ?? 2; },
    status: (s) => `<span class="chip hot">${c.who}の ライフ ${s.E.life}</span>${c.cuts.length ? `<span class="chip">${s.phase}だんかいめ</span>` : ''}`,
  });
}

// ===== とげとげ ハリセン：ダメージを うける たび、こうげきして きた クリーチャーに 1点 かえす =====
const HARI_SIG = sigs('harisen', [['とげ とばし', (s, E) => { const t = weakest(s, E); if (t) E.damage(s, t, 1, null); }], ['はりの あらし', (s, E) => allHit(s, E, 1), 3]]);
const harisen = formFloor({
  id: 'harisen', who: 'とげとげ ハリセン', life: [16, 20, 24], cuts: [0.5], sigs: HARI_SIG,
  goal: 'ハリセンの ライフを 0に する。クリーチャーで ハリセンに ダメージを あたえる たび、その クリーチャーが 1点 うける（とげ）。ライフが 半分に なると、ぜんいんで こうげきして くる。',
  mode: (s) => (s.phase >= 2 ? 'rush' : ''), thorn: () => 1,
  intent: (s) => ['とげ：ハリセンに ダメージを あたえた クリーチャーは 1点 うける', s.phase >= 2 ? 'おこって いる：ぜんいんで こうげきして くる' : 'こうげき役が せめて くる'],
  deck: [[4, att('とげねずみ', 2, 2)], [3, wall('いがぐりの たて', 2, 4)], [2, att('はりの やりつかい', 3, 2)],
    [2, esp('ちくちく', (s, E) => E.hurt(s, 2), { danger: 3 })], [2, esp('まるまる', (s) => heal(s, 2), { danger: 0 })]],
});

// ===== かたい カメロン：ぴったりガード（こうらの 数と ちょうど 同じ ダメージ いがいは 半分）=====
const KAME_SIG = sigs('kameron', [['こうらに こもる', (s) => heal(s, 2), 0], ['こうら アタック', (s, E) => E.hurt(s, 2), 3]]);
const kameShell = (s) => (s.phase >= 2 ? 4 : 3);
const kameron = formFloor({
  id: 'kameron', who: 'かたい カメロン', life: [16, 20, 24], cuts: [0.5], sigs: KAME_SIG,
  goal: 'カメロンの ライフを 0に する。カメロンへの ダメージは、こうらの 数（はじめは 3。タフネスと 同じ）と ちょうど 同じなら そのまま とおる。ちがう 数は 半分に なる（1点は 1点の まま）。ライフが 半分に なると、こうらが 4に なって せめて くる。',
  mode: (s) => (s.phase >= 2 ? '' : 'hold'), shell: kameShell,
  intent: (s) => [`ぴったりガード：こうらの 数は ${kameShell(s)}。ちょうど ${kameShell(s)}点の ダメージは そのまま、ちがう 数は 半分`, s.phase >= 2 ? 'こうげき役が せめて くる' : '数で かって いる ときだけ こうげきして くる'],
  deck: [[4, wall('いわガメ', 1, 4)], [3, att('かみつきガメ', 3, 3)], [2, att('うみの つかい', 2, 2, ['flying'])],
    [2, esp('しおの なみ', (s, E) => { const t = biggest(s, E, (p) => !p.tapped); if (t) t.tapped = true; })], [1, esp('ひなたぼっこ', (s) => heal(s, 2), { danger: 0 })]],
});

// ===== スナイパーギツネ コンコン：まいターン、きみの いちばん 小さい クリーチャーに 1点 =====
const KON_SIG = sigs('konkon', [['ねらいうち', (s, E) => { const t = weakest(s, E); if (t) E.damage(s, t, 2, null); }], ['れんしゃ', (s, E) => { for (let i = 0; i < 2; i++) { const t = weakest(s, E); if (t) { E.damage(s, t, 1, null); E.sba(s); } } E.hurt(s, 1); }, 3]]);
const konkon = formFloor({
  id: 'konkon', who: 'スナイパーギツネ コンコン', life: [11, 13, 14], cuts: [0.5], sigs: KON_SIG,
  goal: 'コンコンの ライフを 0に する。コンコンは まいターン、きみの いちばん 小さい（タフネスの ひくい）クリーチャーに 1点 ねらいうちする。ライフが 半分に なると、ぜんいんで こうげきして くる。',
  mode: (s) => (s.phase >= 2 ? 'rush' : ''),
  turnStart: (s, E) => snipe(s, E, 'コンコン', 1),
  intent: (s) => ['ねらいうち：ターンの はじめに、きみの いちばん 小さい クリーチャーに 1点', s.phase >= 2 ? 'とびだした：ぜんいんで こうげきして くる' : 'こうげき役が せめて くる'],
  deck: [[4, att('きつねの ゆみつかい', 2, 1)], [3, wall('しっぽの たて', 1, 3)], [2, att('はやがけ ぎつね', 3, 1, ['haste'])],
    [2, esp('とおぼえ', (s, E) => E.hurt(s, 1))], [2, esp('おとしあな', (s, E) => { const t = biggest(s, E, (p) => !p.tapped); if (t) t.tapped = true; })]],
});

// ===== うたう セイレーン リララ：2ターンに 1回、きみの いちばん 大きい クリーチャーを ねむらせる =====
const RIRA_SIG = sigs('rirara', [['こもりうた', (s, E) => sleep(s, E, 'リララ')], ['あらしの うた', (s, E) => E.hurt(s, 2), 3]]);
const rirara = formFloor({
  id: 'rirara', who: 'うたう セイレーン リララ', life: [13, 16, 19], cuts: [0.5], sigs: RIRA_SIG,
  goal: 'リララの ライフを 0に する。リララは 2ターンに 1回、きみの いちばん 大きい クリーチャーを うたで ねむらせる（つぎの きみの ターン、こうげきも ブロックも できない）。ライフが 半分に なると、せめて くる。',
  mode: (s) => (s.phase >= 2 ? '' : 'hold'),
  turnStart: (s, E) => { if (s.E.flags.pbTurn % 2 === 0) sleep(s, E, 'リララ'); },
  intent: (s) => [`うた：2ターンに 1回、きみの いちばん 大きい クリーチャーが ねむる（${(s.E.flags.pbTurn || 0) % 2 === 1 ? 'つぎの あいての ターン' : 'その つぎの ターン'}）`, s.phase >= 2 ? 'こうげき役が せめて くる' : '数で かって いる ときだけ こうげきして くる'],
  deck: [[3, att('なみの せいれい', 2, 2, ['flying'])], [3, wall('かいがらの たて', 0, 4)], [3, att('うみへび', 3, 2)],
    [2, esp('しおかぜ', (s) => heal(s, 2), { danger: 0 })], [2, esp('うずまき', (s, E) => { const t = weakest(s, E); if (t) E.damage(s, t, 2, null); E.sba(s); }, { danger: 3 })]],
});

// ===== しゅうまつの りゅう オワロン（ボス）：3だんかい。数で おす → とげ → ぴったりガード ＋ ねらいうち =====
const WHELP = att('おわりの こりゅう', 1, 1);
const OWA_SIG = sigs('owaron', [['むれの ごうれい', (s, E) => E.token(s, 'E', WHELP, 2), 3], ['とげの うろこ', (s, E) => allHit(s, E, 1), 3], ['しゅうまつの ほのお', (s, E) => { E.hurt(s, 2); const t = weakest(s, E); if (t) E.damage(s, t, 2, null); }, 4]]);
const owaron = formFloor({
  id: 'owaron', who: 'しゅうまつの りゅう オワロン', life: [20, 25, 30], cuts: [2 / 3, 1 / 3], sigs: OWA_SIG,
  goal: 'オワロンの ライフを 0に する。3つの だんかい：① こりゅうが まいターン ふえて こうげき ② とげ（ダメージを あたえた クリーチャーが 1点 うける）③ ぴったりガード（ちょうど 4点 いがいは 半分）と ねらいうち（いちばん 小さい 子に 1点）。',
  reveal: (s) => (s.phase >= 3 ? DIFF(s, 1, 1, 2) : 1),
  mode: () => '', thorn: (s) => (s.phase === 2 ? 1 : 0), shell: (s) => (s.phase >= 3 ? 4 : 0),
  turnStart(s, E) {
    if (s.phase === 1 && s.E.flags.pbTurn >= 2 && E.creatures(s, 'E').filter((p) => p.def === WHELP).length < 2) { E.token(s, 'E', WHELP); E.L(s, 'オワロン：こりゅうが ふえた'); }
    if (s.phase >= 3) snipe(s, E, 'オワロン', 1);
  },
  intent: (s) => (s.phase === 1 ? ['数で おす：2ターンめから、ターンの はじめに こりゅうが 1体（たい） ふえて（2体まで）、こうげきして くる']
    : s.phase === 2 ? ['とげ：オワロンに ダメージを あたえた クリーチャーは 1点 うける']
      : ['ぴったりガード：ちょうど 4点の ダメージは そのまま、ちがう 数は 半分', 'ねらいうち：ターンの はじめに、きみの いちばん 小さい クリーチャーに 1点']),
  deck: [[3, att('こりゅう', 2, 1)], [2, wall('うろこの ばんにん', 1, 4)], [1, att('ほのおの りゅう', 4, 4, ['flying'])],
    [1, esp('やけのはら', (s, E) => allHit(s, E, 1), { danger: 3 })], [1, esp('りゅうの いかり', (s, E) => E.hurt(s, 2), { danger: 3 })], [1, esp('ひとねむり', (s) => heal(s, 3), { danger: 0 })]],
});

export const PB_NEW = { harisen, kameron, konkon, rirara, owaron };
// えらぶ 画面の しょうかい（js/data/packbattle.js の PB_CHARS・PB_SIG・PB_PAL に まぜる）
export const NEW_CHARS = {
  harisen: { who: 'とげとげ ハリセン', cols: 'R', theme: 'さわると いたい とげ', style: 'こうげきして きた 子に とげを かえす', line: PB_LINES.harisen.start },
  kameron: { who: 'かたい カメロン', cols: 'G', theme: 'ぴったりガード', style: 'ちょうどの ダメージ いがいは 半分', line: PB_LINES.kameron.start },
  konkon: { who: 'スナイパーギツネ コンコン', cols: 'W', theme: 'ねらいうち', style: 'いちばん 小さい 子を まいターン ねらう', line: PB_LINES.konkon.start },
  rirara: { who: 'うたう セイレーン リララ', cols: 'U', theme: 'ねむりの うた', style: 'いちばん 大きい 子を ねむらせる', line: PB_LINES.rirara.start },
  owaron: { who: 'しゅうまつの りゅう オワロン', cols: 'KR', theme: '3つの だんかい', style: '数 → とげ → ぴったりガードと ねらいうち', line: 'ここが さいごの たたかいだ。' },
};
export const NEW_SIG = {
  harisen: { text: 'いちばん 小さい 子に 1点。2つめの すがたは「はりの あらし」：きみの クリーチャー ぜんぶに 1点', def: HARI_SIG[0] },
  kameron: { text: 'あいての ライフ ＋2。2つめの すがたは「こうら アタック」：きみに 2点', def: KAME_SIG[0] },
  konkon: { text: 'いちばん 小さい 子に 2点。2つめの すがたは「れんしゃ」：小さい 子に 1点を 2回・きみに 1点', def: KON_SIG[0] },
  rirara: { text: 'いちばん 大きい 子を ねむらせる。2つめの すがたは「あらしの うた」：きみに 2点', def: RIRA_SIG[0] },
  owaron: { text: 'こりゅうが 2体（たい） 出る。2だんかいめ「とげの うろこ」：ぜんぶに 1点。3だんかいめ「しゅうまつの ほのお」：きみに 2点・小さい 子に 2点', def: OWA_SIG[0] },
};
const pal = (name, pow, tou, kw, role, text) => ({ text, swap: false, def: ecr(name, pow, tou, [], kw, { attacks: role, pal: true }) });
export const NEW_PAL = {
  harisen: pal('ちびとげ', 2, 1, [], true, '2/1・こうげきして くる'),
  kameron: pal('こガメ', 1, 4, [], false, '1/4・まもり役'),
  konkon: pal('みはりの こぎつね', 2, 2, [], true, '2/2・こうげきして くる'),
  rirara: pal('うたう さかな', 1, 3, [], false, '1/3・まもり役'),
  owaron: pal('しゅうまつの つかい', 2, 2, ['flying'], true, '2/2 飛行（ひこう）・こうげきして くる'),
};
// テーロスの 10人が おいつめられた とき（とうの 階には ライフの ない あいても いる ので、階ごとに きめる）
export const PB_LOW = {
  hydra: (s) => s.E.gy.filter((c) => c.def.head).length >= 2 && s.E.bf.filter((p) => p.def.head).length <= 1,
  clock: (s) => s.E.hour >= 8,
  horde: (s) => s.E.lib.length <= 6,
  dragon: (s) => s.E.gold >= s.E.goal * 0.6,
  factory: (s, E) => s.stats.playerTurns >= 4 && !E.creatures(s, 'E').length,
  slime: (s, E) => { const l = s.E.bf.filter((p) => p.def.slime); return l.length > 0 && s.stats.playerTurns >= 2 && l.every((p) => E.pt(s, p)[1] <= 2); },
  twins: (s) => s.stats.playerTurns >= 1 && s.E.bf.filter((p) => p.def.twin).length === 1,
  xenagos: (s) => s.E.bf.some((p) => p.def.xenagos) && !s.E.bf.some((p) => p.def.reveler),
  gorgon: (s) => s.E.life <= (s.E.pbLife0 || 0) / 2,
  erebos: (s) => s.phase === 3 && s.E.life <= (s.E.pbLife3 || 99) / 2,
};
