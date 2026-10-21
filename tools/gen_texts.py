# docs/cards/*.md と docs/ENEMIES.md の表から、画面で見せるカードの名前・タイプ・テキストを js/data/texts.js に書き出す
# python3 mathtcg/tools/gen_texts.py
import re, glob, os, json

here = os.path.dirname(os.path.abspath(__file__))
docs = os.path.join(here, '..', 'docs')
cells = lambda line: [c.strip() for c in line.strip().strip('|').split('|')]
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
print(len(cards), 'cards', len(enemies), 'enemies')
