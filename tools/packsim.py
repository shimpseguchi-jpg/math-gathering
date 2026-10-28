# 2色まで の制限で、パックの枚数ごとに使えるカードの枚数と点数を見る
# python3 tools/packsim.py
import random, itertools
cols=['R','U','W','G']; pairs=list(itertools.combinations(cols,2))
def card():
    r=random.random()
    if r<0.8: c={cols[int(r/0.2)]}
    elif r<0.9: c=set(random.choice(pairs))
    else: c=set()
    return c
# 1パックのレアリティ構成（C, U, R）。レアは8パックに1回レジェンド（4点）、
# さらにコモン1枚が COMMON_TO_LEGEND の確率でレジェンドに変わる
COMPOS={5:(2,2,1),6:(3,2,1),8:(4,3,1),10:(5,4,1)}
COMMON_TO_LEGEND=1/20
def pack(n):
    c,u,r=COMPOS[n]
    rs=[1]*c+[2]*u+[4 if random.random()<1/8 else 3 for _ in range(r)]
    if c and random.random()<COMMON_TO_LEGEND: rs[0]=4
    return [(card(),p) for p in rs]
for n in COMPOS:
    for k in (3,5,7):
        tot_c=tot_p=0;T=4000
        for _ in range(T):
            pool=[c for _ in range(k) for c in pack(n)]
            best=max(((sum(1 for c,p in pool if c<=set(pr)),sum(p for c,p in pool if c<=set(pr))) for pr in pairs))
            tot_c+=best[0];tot_p+=best[1]
        print(f"pack={n:2d} packs={k} best2色の枚数={tot_c/T:5.1f} 点数={tot_p/T:5.1f}")
