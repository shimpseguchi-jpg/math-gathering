# docs/cards/*.md と docs/ENEMIES.md の表から、画面で見せるカードの名前・タイプ・テキストを js/data/texts.js に書き出す
# python3 mathtcg/tools/gen_texts.py
import re, glob, os, json

here = os.path.dirname(os.path.abspath(__file__))
docs = os.path.join(here, '..', 'docs')
cells = lambda line: [c.strip().replace('**', '') for c in line.strip().strip('|').split('|')]
plain = lambda t: re.sub(r'（[ぁ-ゖー]+）', '', t).replace(' ', '').replace('　', '')

cards, enemies = {}, {}
for f in sorted(glob.glob(os.path.join(docs, 'cards', '*.md'))):
    head = None
    for line in open(f, encoding='utf-8'):
        if not line.startswith('|'): head = None; continue
        c = cells(line)
        if c[0] == 'ID': head = c; continue
        if not head or set(c[0]) <= set('-:'): continue
        row = dict(zip(head, c))
        if re.fullmatch(r'[A-Z]{1,2}\d\d', row['ID']):
            cards[row['ID']] = {'name': row['名前'], 'type': row.get('タイプ', ''), 'text': row.get('テキスト', '').replace('<br>', '\n'), 'motif': row.get('元のカード', ''), 'math': row.get('算数', '')}

# 第3弾から あと（案の 表）：画面の 文と、エンジン用の 土台（js/data/skel.js）
# 3つめは ID の 頭（その 表の 中で この 頭の カードだけ。番外編は 1つの 案に 3つの パックが ある）
DRAFTS = [('SET3.md', 3), ('SET4.md', 4), ('SET5.md', 5), ('SET6.md', 6), ('ALCHEMY.md', 7), ('PLANESWALKERS.md', 8), ('SET7.md', 9), ('EXTRA.md', 10, 'FG')]
TYPES = {'プレインズウォーカー': 'planeswalker', 'クリーチャー': 'creature', 'インスタント': 'instant', 'ソーサリー': 'sorcery', 'アーティファクト': 'artifact', 'エンチャント': 'enchantment'}
KW = {'飛行': 'flying', '速攻': 'haste', '警戒': 'vigilance', '到達': 'reach', '接死': 'deathtouch', '絆魂': 'lifelink', 'トランプル': 'trample',
      '先制攻撃': 'first', '二段攻撃': 'double', '防衛': 'defender', '破壊不能': 'indestructible', '召集': 'convoke', '果敢': 'prowess'}
SUB = {'人間': 'human', '戦士': 'warrior', '兵士': 'soldier', 'スピリット': 'spirit', '神': 'god', 'エルフ': 'elf', 'ゴブリン': 'goblin', 'ドラゴン': 'dragon',
       'ウィザード': 'wizard', '騎士': 'knight', '巨人': 'giant', 'クレリック': 'cleric', 'ゾンビ': 'zombie', '吸血鬼': 'vampire', 'ヴァンパイア': 'vampire', '天使': 'angel',
       'ペガサス': 'pegasus', 'サテュロス': 'satyr', 'ビースト': 'beast', 'ワーム': 'wurm', 'ハイドラ': 'hydra', 'エレメンタル': 'elemental', '猫': 'cat', '鳥': 'bird',
       '狼': 'wolf', 'マイア': 'myr', 'クラーケン': 'kraken', '壁': 'wall', 'ニンフ': 'nymph', '半神': 'demigod', 'デーモン': 'demon', '忍者': 'ninja', 'オーラ': 'aura',
       '旗': 'banner', 'レッスン': 'lesson', '祠': 'shrine', '英雄譚': 'saga', '装備品': 'equipment', 'フラクタル': 'fractal', 'エルダー': 'elder', '昆虫': 'insect', 'サーヴァント': 'servant'}
plainT = lambda t: re.sub(r'（[ぁ-ゖー]+）', '', t)
skel, sets = {}, {}
for fname, set_id, *only in DRAFTS:
    head = None
    for line in open(os.path.join(docs, fname), encoding='utf-8'):
        if not line.startswith('|'): head = None; continue
        c = cells(line)
        if c[0] == 'ID' and '名前' in c: head = c; continue
        if not head or set(c[0]) <= set('-:') or not re.fullmatch(r'[A-Z]{1,2}\d\d', c[0]): continue
        if only and not c[0].startswith(only[0]): continue
        row = dict(zip(head, c))
        text = row.get('テキスト', row.get('テキスト（案）', '')).replace('<br>', '\n')
        cards[row['ID']] = {'name': row['名前'], 'type': row.get('タイプ', ''), 'text': text, 'motif': row.get('元のカード', ''), 'math': row.get('算数', '')}
        cost = row.get('コスト', '').split()
        xs = cost.count('X'); nums = [int(t) for t in cost if t.isdigit()]
        color = ''.join(t for t in cost if re.fullmatch(r'[WUKGR]+', t))
        n = nums[0] if nums else len(color)
        ty = plainT(row.get('タイプ', ''))
        main, _, subs = ty.partition('—')
        types = [v for k, v in TYPES.items() if k in main]
        if 'エンチャント・クリーチャー' in main or 'アーティファクト・クリーチャー' in main: types = [t for t in types if t != 'creature'] + ['creature']
        pt = row.get('P/T', '−')
        m = re.fullmatch(r'(\d+)/(\d+)', pt)
        first = plainT(text).split('。')[0]
        kws = [KW[k.strip()] for k in re.split(r'[、・]', first) if k.strip() in KW] if all(k.strip() in KW for k in re.split(r'[、・]', first)) else []
        d = {'id': row['ID'], 'name': row['名前'], 'rar': row.get('レアリティ', 'B') if row['ID'] != 'B06' else 'B', 'color': color, 'cost': n, 'types': types,
             'sub': [SUB.get(x, x) for x in re.split(r'[・ ]', subs.strip()) if x], 'kw': kws}
        if m: d['pow'], d['tou'] = int(m.group(1)), int(m.group(2))
        elif 'creature' in types: d['pow'] = d['tou'] = 0
        if xs: d['x'] = True
        if row.get('ちゅうせい', '').isdigit(): d['loyalty'] = int(row['ちゅうせい'])
        if xs > 1: d['xMul'] = xs
        if '瞬速' in first.split('、'): d['flash'] = True
        if '伝説' in main: d['legend'] = True
        skel[row['ID']] = d
        if row['ID'] != 'B06': sets.setdefault(set_id, []).append(row['ID'])
with open(os.path.join(here, '..', 'js', 'data', 'skel.js'), 'w', encoding='utf-8') as w:
    w.write('// 自動生成：python3 mathtcg/tools/gen_texts.py（docs/SET3〜6.md・ALCHEMY.md の 表から。手で直さない）\n')
    w.write('// カードの 土台（名前・コスト・色・P/T・はじめの キーワード）。うごきは js/data/set3.js など\n')
    w.write('export const SKEL = {\n' + ''.join(f'  {k}: {json.dumps(v, ensure_ascii=False)},\n' for k, v in skel.items()) + '};\n')
    w.write('export const SET_IDS = ' + json.dumps(sets) + ';\n')

head = None
for line in open(os.path.join(docs, 'ENEMIES.md'), encoding='utf-8'):
    if not line.startswith('|'): head = None; continue
    c = cells(line)
    if c[0] == '枚数': head = c; continue
    if not head or set(c[0]) <= set('-:'): continue
    row = dict(zip(head, c))
    name = re.sub(r'（ほっと）$', '', row['名前'])
    enemies[plain(name)] = {'name': name, 'type': row['タイプ'], 'text': row['テキスト'], 'reward': row['英雄の報酬'], 'motif': row['元のカード']}

out = os.path.join(here, '..', 'js', 'data', 'texts.js')
with open(out, 'w', encoding='utf-8') as w:
    w.write('// 自動生成：python3 mathtcg/tools/gen_texts.py（docs の表から。手で直さない）\n')
    w.write('export const CARD_TEXT = ' + json.dumps(cards, ensure_ascii=False, indent=0) + ';\n')
    w.write('export const ENEMY_TEXT = ' + json.dumps(enemies, ensure_ascii=False, indent=0) + ';\n')
    w.write("export const plainName = (t) => t.replace(/（[ぁ-ゖー]+）/g, '').replace(/[ 　]/g, '');\n")
print(len(cards), 'cards', len(enemies), 'enemies', len(skel), 'draft cards')
