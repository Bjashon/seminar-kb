"""Witt algebra alone, with ALL integer weights in [-K, K] (or [0, K]) as one thin algebra
with 2K+1 (K+1) colours lam = (-K, ..., K): the complete Witt invariant restricted to that
weight range.  Reports, for every n <= NMAX, how many classes of shapes it separates.

Usage: python witt_full.py NMAX K [nonneg]
"""
import sys
import time
from pathlib import Path

CHECKS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CHECKS))
from thin_invariants import shapes, show          # noqa: E402
from thin_search import invariants, true_order    # noqa: E402


def run(nmax, K, nonneg=False):
    lam = list(range(0, K + 1)) if nonneg else list(range(-K, K + 1))
    spec = {"type": "witt", "lam": lam}
    print(f"Witt with weights {lam}")
    for n in range(4, nmax + 1):
        t0 = time.time()
        ss = list(shapes(n))
        inv = invariants(n, spec)
        groups = {}
        for s in ss:
            groups.setdefault(inv[s], []).append(s)
        clashes = [g for g in groups.values() if len(g) > 1]
        line = f"n={n}: {len(ss)} shapes -> {len(groups)} classes" + ("  ALL SEPARATED" if not clashes else "")
        order = true_order(n)
        if order is not None:
            ss2, true_in = order
            sets = [inv[s] for s in ss2]
            bad = [(i, j) for i, j in true_in if not sets[i] <= sets[j]]
            assert not bad, bad
            missed = [(i, j) for i in range(len(ss2)) for j in range(len(ss2))
                      if i != j and (i, j) not in true_in and sets[i] <= sets[j]]
            total = len(ss2) * (len(ss2) - 1) - len(true_in)
            line += f"; detects {total - len(missed)} of {total} true non-implications"
            if missed and len(missed) <= 12:
                line += "\n   missed: " + "; ".join(f"{show(ss2[i])} !< {show(ss2[j])}" for i, j in missed)
        print(line + f"  ({time.time() - t0:.0f}s)", flush=True)
        for g in clashes[:10]:
            print("   not separated:", "   ".join(show(s) for s in g), flush=True)


if __name__ == "__main__":
    run(int(sys.argv[1]), int(sys.argv[2]), len(sys.argv) > 3)
