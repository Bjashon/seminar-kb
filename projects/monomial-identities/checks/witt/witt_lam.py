"""Witt invariant with a prescribed list of weights (colours), for n <= NMAX.

Usage: python witt_lam.py NMAX w1 w2 ...            (literal weights)
       python witt_lam.py NMAX scales R             (weights 0, 1, B, B^2, ..., B^(R-1), B = NMAX+1:
                                                      R scales with 0/1 coefficients, 'EQ with an invisible colour')
"""
import sys
import time
from pathlib import Path

CHECKS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CHECKS))
from thin_invariants import shapes, show          # noqa: E402
from thin_search import invariants, true_order    # noqa: E402


def run(nmax, lam):
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
        print(line + f"  ({time.time() - t0:.0f}s)", flush=True)
        for g in clashes[:10]:
            print("   not separated:", "   ".join(show(s) for s in g), flush=True)


if __name__ == "__main__":
    nmax = int(sys.argv[1])
    if sys.argv[2] == "scales":
        R = int(sys.argv[3])
        B = nmax + 1
        lam = [0] + [B ** i for i in range(R)]
    else:
        lam = [int(x) for x in sys.argv[2:]]
    run(nmax, lam)
