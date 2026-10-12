"""Deterministic Witt-only certificate check: refine the shapes with n leaves by the invariants of a
fixed list of Witt weight vectors (colour a has weight lam[a]); report the classes that remain.

Usage: python witt_check.py N
"""
import sys
import time
from pathlib import Path

CHECKS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CHECKS))
from thin_invariants import shapes, show          # noqa: E402
from thin_search import invariants                # noqa: E402

VECTORS = [
    # from the random search with base 1 (cert12.txt), separate everything for n <= 10
    [1, -7, 9], [1, -4, -9, -1], [1, 8, -4], [1, 4, -7], [1, -3, -4], [1, 0, 4], [1, -7, 3, 7], [1, -1, -9, 0],
    # from the random search with bases 0/1 (cert12b.txt)
    [0, 0, -8], [0, -5, 9], [0, 5, 10, -5], [0, -6, 9, 5], [1, -9, 2], [0, -12, 3], [1, 6, -9, -3], [0, 2, -5], [1, 9, -4, 7],
    # predicted separators of the Y-pairs x^k[c_a,c_b] vs x^(k+1)[c_a,c_(b-1)]: weights {1^(n-2), 2, 1-(a+b)}
    [1, 2, -5], [1, 2, -6], [1, 2, -7], [1, 2, -8], [1, 2, -9], [1, 2, -10],
    [1, 3, -6], [1, 3, -7], [1, 3, -8], [1, 3, -9], [1, 3, -10],
    # predicted for [c2, x[c3,c5]] vs [c2, x^2[c3,c4]] (n=11): d = {2, -1, 7} -> weights {1^8, -1, 2, -6}
    [1, 2, 0, -6], [1, -1, -2, -4], [1, -1, 2, -6], [1, 2, -6, 3], [1, 2, -6, -2],
    # small base-0 / mixed vectors for the stalk-flag pair under x[c2, .]
    [0, 1, -1, 2], [0, 1, -1, -2], [0, 1, -1, 3], [0, 1, 2, -3], [0, 1, -1, 2, -2], [0, 1, 2, -1, -3],
    [0, 1, -2, 3], [0, 2, -3, 1, -1], [1, 0, -1, 2], [1, 0, 2, -2], [1, -1, 0, 3], [1, 0, -1, -2],
    [0, 1, -1, 4], [0, 1, -1, -4], [0, 1, 2, -4], [0, 1, -3, 4], [0, 1, 2, -3, -1],
]


def main(n):
    ss = list(shapes(n))
    cls = {s: 0 for s in ss}
    nclasses = 1
    used = []
    t0 = time.time()
    for lam in VECTORS:
        if nclasses == len(ss):
            break
        inv = invariants(n, {"type": "witt", "lam": lam})
        refined = {}
        for s in ss:
            refined.setdefault((cls[s], inv[s]), []).append(s)
        if len(refined) > nclasses:
            used.append(lam)
            for i, group in enumerate(refined.values()):
                for s in group:
                    cls[s] = i
            nclasses = len(refined)
            print(f"   n={n}: {nclasses}/{len(ss)} with {lam} ({time.time() - t0:.0f}s)", flush=True)
    groups = {}
    for s in ss:
        groups.setdefault(cls[s], []).append(s)
    clashes = [g for g in groups.values() if len(g) > 1]
    print(f"n={n}: {len(ss)} shapes: {'SEPARATED by the Witt algebra alone' if not clashes else 'NOT separated'} "
          f"using {len(used)} weight vectors: {used}", flush=True)
    for g in clashes:
        print("   not separated:", "   ".join(show(s) for s in g))


if __name__ == "__main__":
    main(int(sys.argv[1]))
