# カードリスト（mathtcg/docs/cards/*.md）の枚数とレアリティを数える
# python3 mathtcg/tools/check_cards.py
import re, glob, os, collections

here = os.path.dirname(os.path.abspath(__file__))
row = re.compile(r'\| ((?:W|U|G|R|C)\d\d|(?:WG|WU|RW|UR|RG|GU)\d\d) \| [^|]+ \| (C|U|R|L) \|')
count = collections.Counter()
ids = []
for f in sorted(glob.glob(os.path.join(here, '..', 'docs', 'cards', '*.md'))):
    for line in open(f, encoding='utf-8'):
        m = row.match(line)
        if m:
            ids.append(m.group(1))
            color = re.match(r'[A-Z]+?(?=\d)', m.group(1)).group(0)
            count[('gold' if len(color) == 2 else color, m.group(2))] += 1

dups = [i for i, n in collections.Counter(ids).items() if n > 1]
print('全部', len(ids), '種', '（重複ID: ' + ', '.join(dups) + '）' if dups else '')
expect = {'W': (12, 7, 5, 2), 'U': (12, 7, 5, 2), 'G': (12, 7, 5, 2), 'R': (12, 7, 5, 2),
          'C': (4, 3, 2, 1), 'gold': (0, 6, 6, 0)}
ok = not dups and len(ids) == 126
for c, want in expect.items():
    got = tuple(count[(c, r)] for r in 'CURL')
    ok &= got == want
    print(f'{c:4s} C{got[0]} U{got[1]} R{got[2]} L{got[3]}', 'OK' if got == want else f'← 予定 {want}')
print('OK' if ok else 'NG')
