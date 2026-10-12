"""Does M_s meet the PBW filtration only in the expected way?

Fix a letter z. Reading off the words that start with z identifies Lie(n)
with A = the multilinear part of the free associative algebra on the other
n-1 letters, and a monomial T with z at depth k becomes a product of k Lie
monomials (the spine of z). U_k = span of products of at most k Lie elements
(the PBW filtration of the enveloping algebra).

Expected ("no accidental drops"):
    M_s & U_k  =  span of the monomials T with z at depth <= k whose shape t
                  satisfies M_t inside M_s (t = s or t weaker than s; atlas.json).
The right-hand side is always inside the left-hand side; the script compares
dimensions. (Taking only the shape s itself on the right is wrong already for
n = 5: [x,[[x,x],[x,x]]] is weaker than [[x,x],[x,[x,x]]] and has z at depth 1.)

Usage: python filtration.py NMAX      (needs python-flint; NMAX = 7 takes a minute)
"""
import itertools
import json
import sys
import time
from math import factorial
from pathlib import Path

from bahturin26 import BASIS, basis_and_rows, clear, rank, relabel, shapes, show, size, vectors


def depth_of_zero(t, d=0):
    if isinstance(t, int):
        return d if t == 0 else None
    for c in t:
        r = depth_of_zero(c, d + 1)
        if r is not None:
            return r
    return None


def spanning_with_depth(s, n):
    """Monomials spanning M_s (from bases of the halves), with the depth of the letter 0."""
    a, b = s
    out = []
    for S in itertools.combinations(range(n), size(a)):
        if a == b and 0 not in S:
            continue
        T = tuple(x for x in range(n) if x not in S)
        for ma in BASIS[a]:
            for mb in BASIS[b]:
                m = (relabel(ma, S), relabel(mb, T))
                out.append((m, depth_of_zero(m)))
    return out


def products_upto(n, k):
    """Monomials [..[[0,u_1],u_2]..,u_j], j <= k, u_i left-normed: they span U_k."""
    letters = list(range(1, n))
    out = []

    def combs(block):  # basis of Lie(block): left-normed with the smallest letter first
        first, rest = block[0], block[1:]
        for p in itertools.permutations(rest):
            t = first
            for x in p:
                t = (t, x)
            yield t

    def ordered_partitions(items, j):
        if j == 1:
            yield [tuple(items)]
            return
        for r in range(1, len(items) - j + 2):
            for head in itertools.combinations(items, r):
                rest = [x for x in items if x not in head]
                for tail in ordered_partitions(rest, j - 1):
                    yield [head] + tail

    for j in range(1, k + 1):
        for parts in ordered_partitions(letters, j):
            for us in itertools.product(*[list(combs(b)) for b in parts]):
                t = 0
                for u in us:
                    t = (t, u)
                out.append(t)
    return out


def main(nmax):
    atlas = json.loads((Path(__file__).resolve().parent / "atlas.json").read_text(encoding="utf-8"))
    for n in range(4, nmax + 1):
        t0 = time.time()
        basis_and_rows(n - 1)          # bases of the smaller modules
        clear()
        ncols = factorial(n - 1)
        bad = 0
        lines = []
        u_rows = {k: vectors(products_upto(n, k), n) for k in range(1, n - 1)}
        u_dim = {k: rank(u_rows[k], ncols) for k in u_rows}
        level = atlas[str(n)]["shapes"]
        ss = list(shapes(n))
        assert [show(x) for x in ss] == [e["s"] for e in level]
        span = {s: spanning_with_depth(s, n) for s in ss}
        vec = {s: vectors([m for m, _ in span[s]], n) for s in ss}
        for i, s in enumerate(ss):
            mons, vecs = span[s], vec[s]
            dim_s = rank(vecs, ncols)
            depths = sorted({d for _, d in mons})
            below = [s] + [t for j, t in enumerate(ss) if i in level[j]["in"]]
            for k in range(1, n - 1):
                expected = rank([v for t in below for v, (_, d) in zip(vec[t], span[t]) if d <= k], ncols)
                actual = dim_s + u_dim[k] - rank(vecs + u_rows[k], ncols)
                if actual != expected:
                    bad += 1
                    lines.append(f"      {show(s)}: k={k}: dim(M & U_k) = {actual}, expected {expected}  (leaf depths {depths})")
        print(f"n={n}: {len(shapes(n))} shapes, dim U_k = {[u_dim[k] for k in sorted(u_dim)]}, accidental drops: {bad}  ({time.time() - t0:.0f}s)")
        for l in lines[:12]:
            print(l)
        sys.stdout.flush()


if __name__ == "__main__":
    main(int(sys.argv[1]))
