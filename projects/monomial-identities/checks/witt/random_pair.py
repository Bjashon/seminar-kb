"""Random search for a Witt separator of two shapes: multisets of n integers in [-K, K] built from
2..6 distinct values with random multiplicities.  Usage: python random_pair.py K SAMPLES SEED "s1" "s2"
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from context_search import member          # noqa: E402
from separate_pair import parse            # noqa: E402
from thin_invariants import show, size     # noqa: E402

K, samples, seed = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
s, t = parse(sys.argv[4]), parse(sys.argv[5])
n = size(s)
rng = random.Random(seed)
found = 0
seen = set()
for it in range(samples):
    k = rng.choice([2, 3, 3, 4, 4, 5, 6])
    vals = rng.sample(range(-K, K + 1), k)
    m = tuple(sorted(rng.choice(vals) for _ in range(n)))
    if m in seen:
        continue
    seen.add(m)
    a, b = member(s, m), member(t, m)
    if a != b:
        found += 1
        print(f"SEPARATOR {m}: in Inv({show(s)}) {a}, in Inv({show(t)}) {b}", flush=True)
        if found >= 5:
            break
    if it % 20000 == 0:
        print(f"   {it} samples, {len(seen)} distinct multisets, separators {found}", flush=True)
print(f"done: {len(seen)} distinct multisets tested, separators found: {found}")
