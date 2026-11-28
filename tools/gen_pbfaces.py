#!/usr/bin/env python3
# パック＆バトルの キャラクターの 顔グラ（docs/PACKBATTLE.md 15章）
# ① もとの 絵（大きい 画像）を ドット絵らしく 小さく する：python3 tools/gen_pbfaces.py もとの絵のフォルダ
#    96×96 に ちぢめて 色を 24色に しぼり、img/pb/<id>.png に 書く（もとの 絵は リポジトリに 入れない）
#    ファイルの なまえ：下の IDS の 左がわ（.jpg か .png）。ステージ 1 の 5人 ＋ テーロス 10人 ＋ ラヴニカ 11人 ＋ ステージ 6 の 5人 ＋ 特別ステージ 7 の 8人 ＝ 39人
# ② img/pb/*.png を js/data/pbfaces.js に する（data URL。1ファイル版でも そとの ファイルを よまない）：引数 なしでも ここは うごく
import base64, io, os, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'img', 'pb')
# なまえ → あいての id（js/data/packbattle.js。ステージ 1 は キャラクターの id、ステージ 2〜6 は とうの かいの id ＝ PB_CHARS の キー）
IDS = {'gabu': 'kh1', 'mee': 'pb2', 'sora': 'kh2', 'molly': 'pb1', 'mira': 'kh3',
       'hydra': 'hydra', 'clocktower': 'clock', 'minotaur': 'horde', 'dragon': 'dragon', 'golem': 'factory',
       'slime': 'slime', 'twins': 'twins', 'xenagos': 'xenagos', 'medusa': 'gorgon', 'erebos': 'erebos',
       'aurelia': 'boros', 'trostani': 'selesnya', 'vorel': 'simic', 'nivmizzet': 'izzet', 'jarad': 'golgari',
       'isperia': 'azorius', 'rakdos': 'rakdos', 'teysa': 'orzhov', 'borborygmos': 'gruul', 'lazav': 'dimir', 'jace': 'jace',
       'harisen': 'harisen', 'kameron': 'kameron', 'konkon': 'konkon', 'rirara': 'rirara', 'owaron': 'owaron',
       'touko': 'ex_touko', 'chaldea': 'ex_fgo', 'hoshi': 'ex_hoshi', 'kyuu': 'ex_kyuu', 'akira': 'ex_akira', 'rin': 'ex_rin', 'aoko': 'ex_aoko', 'alice': 'ex_alice'}
SIZE, COLORS = 96, 24

if len(sys.argv) > 1:
    from PIL import Image
    for name in IDS:
        src = next((os.path.join(sys.argv[1], name + e) for e in ('.jpg', '.png', '.jpeg') if os.path.exists(os.path.join(sys.argv[1], name + e))), None)
        if not src:
            print('ない：', name); continue
        im = Image.open(src).convert('RGB').resize((SIZE, SIZE), Image.BOX)  # ますの 平均で ちぢめる（ドットが つぶれにくい）
        im = im.quantize(colors=COLORS, method=Image.MEDIANCUT, kmeans=4, dither=Image.NONE)  # 色を しぼる（にじませない）。kmeans：えらんだ 24色を 絵に あわせて なおす（2026-11-27 から。ないと 目や はだの ような せまい ところの 色が まわりの 色に つぶれる：緑の 服の 橙子の 顔が 緑に なった）。それより まえの 32まいは 作りなおして いない
        buf = io.BytesIO(); im.save(buf, 'PNG', optimize=True)
        open(os.path.join(OUT, name + '.png'), 'wb').write(buf.getvalue())
        print(f'{name}.png {len(buf.getvalue())}バイト')

rows = []
for name, cid in IDS.items():
    p = os.path.join(OUT, name + '.png')
    if os.path.exists(p):
        rows.append(f"  {cid}: 'data:image/png;base64,{base64.b64encode(open(p, 'rb').read()).decode()}', // {name}")
js = ("// パック＆バトルの キャラクターの 顔グラ（ステージを えらぶ 画面 だけに 出す）。tools/gen_pbfaces.py が img/pb/*.png から つくる（じかに なおさない）\n"
      f"// {SIZE}×{SIZE}・{COLORS}色の PNG。あいての id → data URL。顔グラの ない あいては ここに ない\n"
      "export const PB_FACES = {\n" + '\n'.join(rows) + '\n};\n')
open(os.path.join(ROOT, 'js', 'data', 'pbfaces.js'), 'w', encoding='utf-8').write(js)
print(f'js/data/pbfaces.js {len(js.encode())}バイト（{len(rows)}まい）')
