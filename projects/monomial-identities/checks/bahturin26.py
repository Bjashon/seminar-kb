"""Dniester Notebook, problem 2.6 (Bahturin), checked by computer for small n.

A bracket arrangement on n letters = an unordered binary tree shape s with n
leaves. The identity w_s = 0 has, in degree n, exactly the consequences
M_s = K S_n . w_s  (a submodule of Lie(n), the multilinear part of the free
Lie algebra), and  w_s = 0  <=>  w_t = 0  iff  M_s = M_t.
So the conjecture says: different shapes give different submodules.

Lie(n) is embedded in the free associative algebra; a Lie element is
determined by its coefficients at the words starting with the letter 0, so
vectors have (n-1)! coordinates.

M_[a,b] = sum over splits S|T of [M_a(S), M_b(T)], which lets us build M_s
from bases of the smaller modules instead of all n!/|Aut| monomials.

Ranks are computed modulo the prime 2^61 - 1 and cross-checked modulo
2^31 - 1; for n <= 6 also exactly over Z and against the full orbit of
relabellings.

Needs python-flint (pip install python-flint).
Usage: python bahturin26.py NMAX      (NMAX = 8 takes about ten minutes)
"""
import itertools
import sys
import time
from functools import lru_cache
from math import factorial

import flint

P1 = (1 << 61) - 1
P2 = 2147483647


# ---------- shapes -----------------------------------------------------
def size(s):
    return 1 if s == "x" else size(s[0]) + size(s[1])


def key(s):
    return (size(s), show(s))


def show(s):
    return "x" if s == "x" else "[" + show(s[0]) + "," + show(s[1]) + "]"


@lru_cache(None)
def shapes(n):
    if n == 1:
        return ("x",)
    out = set()
    for i in range(1, n // 2 + 1):
        for a in shapes(i):
            for b in shapes(n - i):
                out.add(tuple(sorted((a, b), key=key)))
    return tuple(sorted(out, key=key))


# ---------- expansion of labelled monomials -----------------------------
@lru_cache(maxsize=None)
def full(t):
    """Lie monomial -> all its words in the free associative algebra."""
    if isinstance(t, int):
        return {(t,): 1}
    a, b = full(t[0]), full(t[1])
    out = {}
    for u, cu in a.items():
        for v, cv in b.items():
            c = cu * cv
            out[u + v] = out.get(u + v, 0) + c
            out[v + u] = out.get(v + u, 0) - c
    return {w: c for w, c in out.items() if c}


@lru_cache(maxsize=None)
def has0(t):
    return t == 0 if isinstance(t, int) else has0(t[0]) or has0(t[1])


@lru_cache(maxsize=None)
def lead(t):
    """Only the words that start with the letter 0."""
    if isinstance(t, int):
        return {(t,): 1} if t == 0 else {}
    if has0(t[0]):
        a, b, sgn = lead(t[0]), full(t[1]), 1
    else:
        a, b, sgn = lead(t[1]), full(t[0]), -1
    out = {}
    for u, cu in a.items():
        for v, cv in b.items():
            out[u + v] = out.get(u + v, 0) + sgn * cu * cv
    return {w: c for w, c in out.items() if c}


def relabel(t, labels):
    return labels[t] if isinstance(t, int) else (relabel(t[0], labels), relabel(t[1], labels))


def clear():
    full.cache_clear()
    lead.cache_clear()
    has0.cache_clear()


# ---------- linear algebra ----------------------------------------------
@lru_cache(None)
def columns(n):
    return {(0,) + p: i for i, p in enumerate(itertools.permutations(range(1, n)))}


def vectors(monomials, n):
    col = columns(n)
    return [{col[w]: c for w, c in lead(m).items()} for m in monomials]


def matrix(rows, ncols, p, transpose=False):
    m = flint.nmod_mat(ncols, len(rows), p) if transpose else flint.nmod_mat(len(rows), ncols, p)
    for i, r in enumerate(rows):
        for j, c in r.items():
            if transpose:
                m[j, i] = c % p
            else:
                m[i, j] = c % p
    return m


def rank(rows, ncols, p=P1):
    return matrix(rows, ncols, p).rank() if rows else 0


def exact_rank(rows, ncols):
    m = flint.fmpz_mat(len(rows), ncols)
    for i, r in enumerate(rows):
        for j, c in r.items():
            m[i, j] = c
    return m.rank()


def pivot_rows(rows, ncols, p=P1):
    """Indices of rows forming a basis of the row space (pivot columns of the transpose)."""
    r, rk = matrix(rows, ncols, p, transpose=True).rref()
    table = r.table()
    piv = []
    for i in range(rk):
        piv.append(next(j for j, v in enumerate(table[i]) if int(v) != 0))
    return piv


# ---------- the modules M_s ----------------------------------------------
BASIS = {"x": [0]}  # shape -> labelled monomials forming a basis of M_shape


def candidates(s, n):
    """Monomials spanning M_s on the letters 0..n-1, built from bases of the two halves."""
    a, b = s
    i = size(a)
    out = []
    for S in itertools.combinations(range(n), i):
        if a == b and 0 not in S:
            continue  # [u,v] = -[v,u]: each unordered split once
        T = tuple(x for x in range(n) if x not in S)
        for ma in BASIS[a]:
            for mb in BASIS[b]:
                out.append((relabel(ma, S), relabel(mb, T)))
    return out


def all_monomials(s, n):
    """Every labelling of the shape, up to sign (used as an independent check)."""
    def canon(t):
        if isinstance(t, int):
            return t, t
        (l, ml), (r, mr) = canon(t[0]), canon(t[1])
        return ((l, r), ml) if ml < mr else ((r, l), mr)

    def lab(sh, it):
        return next(it) if sh == "x" else (lab(sh[0], it), lab(sh[1], it))

    return sorted({canon(lab(s, iter(p)))[0] for p in itertools.permutations(range(n))}, key=str)


def basis_and_rows(n, keep_basis=True):
    """For every shape with n leaves: vectors spanning M_s and dim M_s.

    With keep_basis the vectors are a basis and the monomials behind them are
    remembered for the next n; without it they are just a spanning set (the
    pivot search is the slow part for n = 8)."""
    for m in range(2, n):
        if any(s not in BASIS for s in shapes(m)):
            basis_and_rows(m)
    clear()
    ncols = factorial(n - 1)
    rows, dims = {}, {}
    for s in shapes(n):
        mons = candidates(s, n)
        vecs = vectors(mons, n)
        if keep_basis:
            piv = pivot_rows(vecs, ncols)
            BASIS[s] = [mons[i] for i in piv]
            rows[s] = [vecs[i] for i in piv]
            dims[s] = len(piv)
        else:
            rows[s] = vecs
            dims[s] = rank(vecs, ncols)
        # checks: a second prime; for small n the exact rank and the full orbit
        assert rank(rows[s], ncols, P2) == dims[s], ("second prime disagrees", show(s))
        if n <= 6:
            assert exact_rank(rows[s], ncols) == dims[s], ("exact rank disagrees", show(s))
            orbit = vectors(all_monomials(s, n), n)
            assert rank(orbit, ncols) == dims[s] == rank(orbit + rows[s], ncols), ("orbit disagrees", show(s))
    return rows, dims


def main(nmax):
    for n in range(2, nmax + 1):
        t0 = time.time()
        ncols = factorial(n - 1)
        rows, dims = basis_and_rows(n, keep_basis=n < nmax or n <= 7)
        print(f"n={n}: {len(dims)} shapes, dim Lie(n)={ncols}, {time.time() - t0:.0f}s")
        for s in shapes(n):
            print(f"   {dims[s]:6d}  {show(s)}")
        # equal dimensions -> are the modules equal?
        by_dim = {}
        for s in shapes(n):
            by_dim.setdefault(dims[s], []).append(s)
        clash = False
        for d, group in by_dim.items():
            for s, t in itertools.combinations(group, 2):
                both = rank(rows[s] + rows[t], ncols)
                same = both == d
                clash |= same
                print(f"   same dimension {d}: {show(s)}  vs  {show(t)}  -> dim of sum {both}"
                      + ("   *** EQUAL MODULES: COUNTEREXAMPLE ***" if same else "   (different)"))
        print("   RESULT:", "COUNTEREXAMPLE FOUND" if clash else "all shapes give different identities", flush=True)


if __name__ == "__main__":
    main(int(sys.argv[1]))
