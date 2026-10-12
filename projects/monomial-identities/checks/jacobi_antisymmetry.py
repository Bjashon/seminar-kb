"""A cheap hunt for a counterexample to problem 2.6 among larger trees.

Implications derived by Jacobi steps (see jacobi_order.py) are true
implications. So if two DIFFERENT shapes s, t each imply the other by Jacobi
steps alone, then w_s = 0 and w_t = 0 are equivalent identities with
different bracket shapes -- a counterexample to the conjecture. This needs no
linear algebra, only trees, so it reaches n far beyond the rank computations.

Passing this test proves nothing by itself: it only says that the simplest
possible counterexample does not exist up to NMAX leaves.

Usage: python jacobi_antisymmetry.py NMAX     (NMAX = 14 takes a few minutes)
"""
import sys
import time

from bahturin26 import shapes, show
from jacobi_order import decompositions


def check(n):
    ss = shapes(n)
    index = {s: i for i, s in enumerate(ss)}
    dec = [[(index[t1], index[t2]) for t1, t2 in decompositions(s)] for s in ss]
    up = [1 << i for i in range(len(ss))]  # bit j of up[i]: shape i implies ... is implied by shape j
    changed = True
    while changed:
        changed = False
        for i in range(len(ss)):
            u = up[i]
            for a, b in dec[i]:
                u |= up[a] & up[b]
            if u != up[i]:
                up[i] = u
                changed = True
    relations = sum(bin(u).count("1") - 1 for u in up)
    clashes = [(i, j) for i in range(len(ss)) for j in range(i + 1, len(ss)) if up[i] >> j & 1 and up[j] >> i & 1]
    return len(ss), relations, [(show(ss[i]), show(ss[j])) for i, j in clashes]


def main(nmax):
    for n in range(2, nmax + 1):
        t0 = time.time()
        count, relations, clashes = check(n)
        print(f"n={n}: {count} shapes, {relations} Jacobi-derivable implications, "
              + (f"MUTUAL PAIRS: {clashes[:5]}" if clashes else "no two shapes imply each other")
              + f"  ({time.time() - t0:.0f}s)", flush=True)


if __name__ == "__main__":
    main(int(sys.argv[1]))
