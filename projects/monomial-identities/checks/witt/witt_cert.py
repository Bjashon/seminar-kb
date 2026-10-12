"""Witt-only certificates: random Witt specs lam = [1, 1-d_1, ..., 1-d_(r-1)] (one 'ordinary'
weight 1 and a few 'special' weights), d_i in [-D, D], refined until all shapes with n leaves are
separated.  Prints the certificate (a list of lam vectors) for every n <= NMAX.

Usage: python witt_cert.py NMAX [SAMPLES] [SEED] [D]
"""
import random
import sys
import time
from pathlib import Path

CHECKS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CHECKS))
from thin_invariants import shapes, show          # noqa: E402
from thin_search import invariants                # noqa: E402


def search(n, samples, rng, D, initial):
    ss = list(shapes(n))
    cls = {s: 0 for s in ss}
    nclasses = 1
    used = []
    t0 = time.time()

    def refine(lam):
        nonlocal nclasses
        inv = invariants(n, {"type": "witt", "lam": lam})
        refined = {}
        for s in ss:
            refined.setdefault((cls[s], inv[s]), []).append(s)
        if len(refined) == nclasses:
            return False
        used.append(lam)
        for i, group in enumerate(refined.values()):
            for s in group:
                cls[s] = i
        nclasses = len(refined)
        return True

    for lam in initial:
        if nclasses < len(ss) and refine(lam):
            print(f"   n={n}: {nclasses}/{len(ss)} from previous certificate {lam} ({time.time() - t0:.0f}s)", flush=True)
    for it in range(samples):
        if nclasses == len(ss):
            break
        r = rng.choice([2, 3, 3, 4])
        lam = [1] + [1 - rng.randint(-D, D) for _ in range(r - 1)]
        if refine(lam):
            print(f"   n={n}: {nclasses}/{len(ss)} after {it + 1} tries with {lam} ({time.time() - t0:.0f}s)", flush=True)
    groups = {}
    for s in ss:
        groups.setdefault(cls[s], []).append(s)
    return used, nclasses == len(ss), [g for g in groups.values() if len(g) > 1]


def main():
    nmax = int(sys.argv[1])
    samples = int(sys.argv[2]) if len(sys.argv) > 2 else 2000
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    D = int(sys.argv[4]) if len(sys.argv) > 4 else 8
    rng = random.Random(seed)
    cert = []
    for n in range(4, nmax + 1):
        used, ok, clashes = search(n, samples, rng, D, cert)
        print(f"n={n}: {len(shapes(n))} shapes: {'SEPARATED by Witt alone' if ok else 'NOT separated'} with {len(used)} weight vectors: {used}", flush=True)
        for g in clashes[:10]:
            print("   not separated:", "   ".join(show(s) for s in g), flush=True)
        cert = used


if __name__ == "__main__":
    main()
