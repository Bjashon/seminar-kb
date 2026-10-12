"""Do the modules M_D mirror the lattice of Jacobi-closed sets of shapes?

A set D of shapes (all with n leaves) is Jacobi-closed if, whenever two
members of a Jacobi triple-in-context lie in D, so does the third.
M_D = sum of M_s over s in D.

E1 (completeness for sums): for every closed D, the shapes s with M_s inside
    M_D are exactly the members of D.
E2 (intersections): for closed D, D':  M_D & M_D' = M_(D & D').
    Since M_(D & D') is inside the intersection anyway, it is enough to compare
    dimensions:  dim M_D + dim M_D' - dim M_(cl(D | D'))  ==  dim M_(D & D').

Usage: python lattice.py NMAX     (NMAX <= 7: all closed sets)
"""
import sys
import time
from math import factorial

from atlas import null_vectors
from bahturin26 import P1, basis_and_rows, rank, shapes, show
from jacobi_order import decompositions


def closure_fn(n):
    ss = list(shapes(n))
    index = {s: i for i, s in enumerate(ss)}
    dec = [[(index[a], index[b]) for a, b in decompositions(s)] for s in ss]

    def closure(mask):
        changed = True
        while changed:
            changed = False
            for i in range(len(ss)):
                if not mask >> i & 1 and any(mask >> a & 1 and mask >> b & 1 for a, b in dec[i]):
                    mask |= 1 << i
                    changed = True
        return mask

    return ss, closure


def main(nmax):
    for n in range(4, nmax + 1):
        t0 = time.time()
        ss, closure = closure_fn(n)
        k = len(ss)
        ncols = factorial(n - 1)
        rows, dims = basis_and_rows(n)
        closed = sorted({closure(m) for m in range(1 << k)})
        members = lambda m: [i for i in range(k) if m >> i & 1]
        # dim M_D and the completeness test E1
        dim = {0: 0}
        bad1 = []
        for m in closed:
            if m == 0:
                continue
            stack = [v for i in members(m) for v in rows[ss[i]]]
            if len(members(m)) == 1:
                dim[m] = dims[ss[members(m)[0]]]
            else:
                dim[m] = rank(stack, ncols)
            if dim[m] == ncols:
                extra = [i for i in range(k) if not m >> i & 1]
            else:
                ys, rk = null_vectors(stack, ncols)
                assert rk == dim[m]
                extra = [i for i in range(k) if not m >> i & 1
                         and all(sum(c * y[j] for j, c in rows[ss[i]][0].items()) % P1 == 0 for y in ys)]
            if extra:
                bad1.append((m, extra))
        # E2
        bad2 = []
        for a in closed:
            for b in closed:
                if a < b and a & b not in (a, b):
                    if dim[a] + dim[b] - dim[closure(a | b)] != dim[a & b]:
                        bad2.append((a, b))
        # is the lattice of closed sets distributive?  a & (b v c) == (a & b) v (a & c)
        nondistr = 0
        if len(closed) <= 400:
            for a in closed:
                for b in closed:
                    for c in closed:
                        if b < c and a & closure(b | c) != closure((a & b) | (a & c)):
                            nondistr += 1
        print(f"n={n}: {k} shapes, {len(closed)} closed sets ({time.time() - t0:.0f}s)")
        print(f"   E1 failures (a shape inside M_D but not in D): {len(bad1)}")
        for m, extra in bad1[:5]:
            print("      D =", [show(ss[i]) for i in members(m)], " extra:", [show(ss[i]) for i in extra])
        print(f"   E2 failures (intersection bigger than expected): {len(bad2)}")
        for a, b in bad2[:5]:
            print("      D =", [show(ss[i]) for i in members(a)], "\n      D'=", [show(ss[i]) for i in members(b)],
                  f"\n      dim(M_D & M_D') = {dim[a] + dim[b] - dim[closure(a | b)]}, dim M_(D&D') = {dim[a & b]}")
        print(f"   distributive law failures in the lattice of closed sets: {nondistr}", flush=True)


if __name__ == "__main__":
    main(int(sys.argv[1]))
