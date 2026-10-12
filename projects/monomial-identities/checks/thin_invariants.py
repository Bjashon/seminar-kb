"""Combinatorial invariants of a bracket shape coming from "thin" Lie algebras.

A thin algebra has a basis e_u indexed by an abelian group and
[e_u, e_v] = c(u, v) e_(u+v). Sending the letters to basis elements gives a
linear functional on Lie(n) whose value on a monomial is the product of
c(left sum, right sum) over the internal nodes. Hence, if M_s is inside M_t and
the functional is non-zero somewhere on M_s, it is non-zero somewhere on M_t.
Three families (all are monotone invariants: M_s inside M_t  =>  Inv(s) inside Inv(t)):

  TREES(s): graph-trees G on n vertices having a hierarchy of shape s
      (c(S,T) = number of edges between S and T: the algebra of a generic
      antisymmetric matrix supported on G; the Sinha-Walter graph/tree pairing).
  EQ(s):   colour contents m such that the leaves of s can be coloured with
      content m and no node has two children with EQUAL colour counts
      (Witt algebra, c(u,v) = phi(v) - phi(u)).
  PROP(s): the same with "equal" replaced by "PROPORTIONAL"
      (torus algebra with a generic symplectic form, c(u,v) = omega(u,v)).

The script computes them and asks: do they tell all shapes apart, and do they
reproduce the true order between the modules (atlas.json, n <= 8)?

Usage: python thin_invariants.py NMAX        (pure combinatorics, no flint)
"""
import itertools
import json
import sys
import time
from functools import lru_cache
from pathlib import Path

HERE = Path(__file__).resolve().parent


# ---------- shapes (same canonical form as bahturin26.py, without flint) ----------
def size(s):
    return 1 if s == "x" else size(s[0]) + size(s[1])


def show(s):
    return "x" if s == "x" else "[" + show(s[0]) + "," + show(s[1]) + "]"


def key(s):
    return (size(s), show(s))


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


# ---------- graph-trees up to isomorphism ----------
def canon_tree(adj):
    """AHU code of a free tree given as adjacency lists."""
    n = len(adj)
    deg = [len(a) for a in adj]
    leaves = [i for i in range(n) if deg[i] <= 1]
    removed = len(leaves)
    while removed < n:
        new = []
        for u in leaves:
            for v in adj[u]:
                deg[v] -= 1
                if deg[v] == 1:
                    new.append(v)
        removed += len(new)
        leaves = new
    def code(u, p):
        return "(" + "".join(sorted(code(v, u) for v in adj[u] if v != p)) + ")"
    return min(code(c, -1) for c in leaves)


@lru_cache(None)
def free_trees(n):
    """All trees on n vertices up to isomorphism, as tuples of edges."""
    if n == 1:
        return ((),)
    seen = {}
    for edges in free_trees(n - 1):
        for v in range(n - 1):
            e = edges + ((v, n - 1),)
            adj = [[] for _ in range(n)]
            for a, b in e:
                adj[a].append(b)
                adj[b].append(a)
            seen.setdefault(canon_tree(adj), e)
    return tuple(seen[k] for k in sorted(seen))


def tree_name(edges, n):
    deg = [0] * n
    for a, b in edges:
        deg[a] += 1
        deg[b] += 1
    return "deg" + "".join(str(d) for d in sorted(deg, reverse=True))


def has_hierarchy(edges, n, shape):
    """Can the edges of the tree be removed one by one following the shape?"""
    adj = [[] for _ in range(n)]
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)

    def component(start, banned, mask):
        comp, stack = 1 << start, [start]
        while stack:
            u = stack.pop()
            for v in adj[u]:
                if mask >> v & 1 and not comp >> v & 1 and (u, v) != banned and (v, u) != banned:
                    comp |= 1 << v
                    stack.append(v)
        return comp

    @lru_cache(None)
    def ok(mask, s):
        if s == "x":
            return mask & (mask - 1) == 0
        a, b = s
        na = size(a)
        for u, v in edges:
            if mask >> u & 1 and mask >> v & 1:
                cu = component(u, (u, v), mask)
                cv = mask & ~cu
                for x, y in ((cu, cv), (cv, cu)):
                    if bin(x).count("1") == na and ok(x, a) and ok(y, b):
                        return True
        return False

    return ok((1 << n) - 1, shape)


# ---------- colourings ----------
def achievable(n, colours, relation):
    """shape -> set of colour-count vectors of colourings without a degenerate node."""
    unit = [tuple(1 if i == c else 0 for i in range(colours)) for c in range(colours)]

    @lru_cache(None)
    def ach(s):
        if s == "x":
            return frozenset(unit)
        a, b = s
        na, nb = size(a), size(b)
        out = set()
        for u in ach(a):
            for v in ach(b):
                if relation == "eq":
                    bad = u == v
                else:  # proportional: u/|u| == v/|v|
                    bad = all(x * nb == y * na for x, y in zip(u, v))
                if not bad:
                    out.add(tuple(x + y for x, y in zip(u, v)))
        return frozenset(out)

    return ach


def contents(vectors):
    return frozenset(tuple(sorted((x for x in v if x), reverse=True)) for v in vectors)


def main(nmax):
    atlas_path = HERE / "atlas.json"
    atlas = json.loads(atlas_path.read_text(encoding="utf-8")) if atlas_path.is_file() else {}
    for n in range(4, nmax + 1):
        t0 = time.time()
        ss = list(shapes(n))
        trees = free_trees(n)
        eq, prop = achievable(n, n, "eq"), achievable(n, n, "prop")
        sig = {}
        for s in ss:
            sig[s] = (
                frozenset(i for i, t in enumerate(trees) if has_hierarchy(t, n, s)),
                contents(eq(s)),
                contents(prop(s)),
            )
        names = ("TREES", "EQ", "PROP")
        groups = {}
        for s in ss:
            groups.setdefault(sig[s], []).append(s)
        clashes = [g for g in groups.values() if len(g) > 1]
        print(f"n={n}: {len(ss)} shapes, {len(trees)} graph-trees, {time.time() - t0:.0f}s")
        for which in range(3):
            distinct = len({sig[s][which] for s in ss})
            print(f"   {names[which]} alone distinguishes {distinct} classes of {len(ss)}")
        print(f"   all three together: {len(groups)} classes of {len(ss)}" + ("  -- ALL SHAPES SEPARATED" if not clashes else ""))
        for g in clashes[:6]:
            print("      not separated:", "   ".join(show(s) for s in g))
        if str(n) in atlas:
            level = atlas[str(n)]["shapes"]
            assert [show(s) for s in ss] == [e["s"] for e in level]
            below = lambda i, j: all(sig[ss[i]][w] <= sig[ss[j]][w] for w in range(3))
            unsound = [(i, j) for i, e in enumerate(level) for j in e["in"] if not below(i, j)]
            missed = [(i, j) for i in range(len(ss)) for j in range(len(ss))
                      if i != j and j not in level[i]["in"] and below(i, j)]
            print(f"   against the true order: violations of monotonicity {len(unsound)} (must be 0); "
                  f"non-inclusions not detected {len(missed)} of {len(ss) * (len(ss) - 1) - sum(len(e['in']) for e in level)}")
            for i, j in missed[:8]:
                print(f"      not detected: M[{show(ss[i])}] is not inside M[{show(ss[j])}]")
            assert not unsound, unsound
        sys.stdout.flush()


if __name__ == "__main__":
    main(int(sys.argv[1]))
