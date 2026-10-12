"""Atlas of bracket shapes for problem 2.6: for every unordered binary tree
shape s with n <= NMAX leaves -- dim M_s and the full table of implications
(M_s inside M_t  <=>  the identity w_t = 0 implies w_s = 0).

Writes atlas.json next to this file; the course (lecture.json, key "atlas")
shows it. Needs python-flint.

M_s inside M_t is tested on one vector: M_t is S_n-invariant and M_s is
spanned by the orbit of a single monomial w_s, so it is enough to check
w_s in M_t. For that we take random vectors y of the null space of M_t
(B_t y = 0) and check <w_s, y> = 0 modulo a 61-bit prime, for three
independent y. For n <= 7 the same table is recomputed by ranks and the two
must agree.

Usage: python atlas.py NMAX        (NMAX = 8 takes about a quarter of an hour)
"""
import json
import random
import sys
import time
from math import factorial
from pathlib import Path

import flint

from bahturin26 import P1, P2, basis_and_rows, rank, shapes, show

HERE = Path(__file__).resolve().parent


def null_vectors(rows, ncols, how_many=3):
    """Random vectors y with B y = 0, B = the matrix of `rows`."""
    b = flint.nmod_mat(len(rows), ncols, P1)
    for i, r in enumerate(rows):
        for j, c in r.items():
            b[i, j] = c % P1
    x, nullity = b.nullspace()
    out = []
    for _ in range(how_many):
        r = flint.nmod_mat(x.ncols(), 1, P1)
        for i in range(nullity):
            r[i, 0] = random.randrange(1, P1)
        y = x * r
        assert all(int(v) == 0 for v in (b * y).entries()), "not a null vector"
        out.append([int(v) for v in y.entries()])
    return out, ncols - nullity


def main(nmax):
    atlas = {}
    for n in range(2, nmax + 1):
        t0 = time.time()
        ncols = factorial(n - 1)
        rows, dims = basis_and_rows(n, keep_basis=n < nmax)
        ss = list(shapes(n))
        inside = {s: set() for s in ss}  # inside[s] = shapes t != s with M_s < M_t
        for t in ss:
            if dims[t] == ncols:  # the comb: M_t is everything
                for s in ss:
                    if s != t:
                        inside[s].add(t)
                continue
            ys, rk = null_vectors(rows[t], ncols)
            assert rk == dims[t], ("rank from the null space disagrees", show(t))
            for s in ss:
                if s == t:
                    continue
                w = rows[s][0]  # one monomial of shape s
                if all(sum(c * y[j] for j, c in w.items()) % P1 == 0 for y in ys):
                    inside[s].add(t)
        if n <= 7:  # the same table by ranks
            for s in ss:
                for t in ss:
                    if s != t:
                        by_rank = rank(rows[s] + rows[t], ncols) == dims[t]
                        assert by_rank == (t in inside[s]), ("two methods disagree", show(s), show(t))
        for s in ss:
            assert all(dims[s] <= dims[t] for t in inside[s])
            # different shapes must never give the same module
            assert not any(s in inside[t] for t in inside[s]), ("COUNTEREXAMPLE", show(s))
        atlas[str(n)] = {
            "lie": ncols,
            "shapes": [{"s": show(s), "dim": dims[s], "in": sorted(ss.index(t) for t in inside[s])} for s in ss],
        }
        print(f"n={n}: {len(ss)} shapes, {sum(len(v) for v in inside.values())} inclusions, {time.time() - t0:.0f}s", flush=True)
    (HERE / "atlas.json").write_text(json.dumps(atlas, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("written atlas.json")


if __name__ == "__main__":
    main(int(sys.argv[1]))
