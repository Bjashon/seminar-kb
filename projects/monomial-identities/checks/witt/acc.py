"""The 'ones + specials at the cherries' sub-family of the Witt invariant.

For a shape s with n leaves and r cherries, Acc(s) = { multisets {d_1..d_r}, d_i != 0 :
the weight multiset {1^(n-r), 1-d_1, ..., 1-d_r} is in Inv_W(s) }.
Acc0(s) = { d in Acc(s) : sum d <= n-2 }   (the part invisible to the top stalk).

Two computations of Acc, compared for consistency:
 (direct)  DP on the shape with weights 1 and 1-d, exactly r specials;
 (reduced) the (R', S)-conditions: specials one per cherry, D(c) = sum of d below c;
           for every node c of the reduced tree R' (special leaves + branching nodes):
           D(c) not in [s(c)-1, S(c)-2]  (s(leaf)=1 so [0, S-2] for leaves),
           and at every branching node p with children c1, c2:
           D(c1) - S(c1) != D(c2) - S(c2).
           (s(c) = size at c, S(c) = size at the top of the stalk above c; S(root) = n.)

Then: do Acc0 with |d_i| <= K separate all shapes with n leaves?

Usage: python acc.py NMAX K
"""
import itertools
import sys
import time
from functools import lru_cache
from pathlib import Path

CHECKS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CHECKS))
from thin_invariants import shapes, show, size  # noqa: E402


def cherries(s):
    if s == "x":
        return 0
    if s == ("x", "x"):
        return 1
    return cherries(s[0]) + cherries(s[1])


# ---------- direct ----------
def acc_direct(s, dvals, r):
    """set of sorted d-tuples (length r, entries in dvals) accepted by shape s (weights 1 and 1-d)."""
    n = size(s)

    @lru_cache(None)
    def ach(sh):
        # states: (ones, sorted tuple of d's) ; sum = ones + sum(1-d) = ones + len - sum(d)
        if sh == "x":
            out = {(1, ())}
            for d in dvals:
                out.add((0, (d,)))
            return frozenset(out)
        out = set()
        for (o1, t1) in ach(sh[0]):
            s1 = o1 + len(t1) - sum(t1)
            for (o2, t2) in ach(sh[1]):
                if len(t1) + len(t2) > r:
                    continue
                s2 = o2 + len(t2) - sum(t2)
                if s1 != s2:
                    out.add((o1 + o2, tuple(sorted(t1 + t2))))
        return frozenset(out)

    return frozenset(t for (o, t) in ach(s) if len(t) == r and o == n - r)


# ---------- reduced ----------
def reduced(s):
    """(R', S): R' as nested structure of ('leaf', S) / ('br', S, c1, c2); S = size at top of stalk."""
    def build(sh, S):
        # sh: the subtree at the top of the stalk (size S); strip the stalk
        while sh != ("x", "x") and (sh[0] == "x" or sh[1] == "x"):
            sh = sh[1] if sh[0] == "x" else sh[0]
        if sh == ("x", "x"):
            # cherry: special leaf (size 1) with stalk up to S; the cherry node is a stalk node
            return ("leaf", S)
        a, b = sh
        return ("br", S, build(a, size(a)), build(b, size(b)))
    return build(s, size(s))


def acc_reduced(R, dvals, r):
    def leaves(node):
        return 1 if node[0] == "leaf" else leaves(node[2]) + leaves(node[3])
    assert leaves(R) == r

    def ok(node, assignment):
        """assignment: list of d's for the leaves of node in order; returns (ok, D)."""
        S = node[1]
        if node[0] == "leaf":
            d = assignment[0]
            return (d not in range(0, S - 1)), d
        c1, c2 = node[2], node[3]
        k = leaves(c1)
        ok1, D1 = ok(c1, assignment[:k])
        if not ok1:
            return False, None
        ok2, D2 = ok(c2, assignment[k:])
        if not ok2:
            return False, None
        if D1 - c1[1] == D2 - c2[1]:
            return False, None
        D = D1 + D2
        s_node = c1[1] + c2[1]
        if s_node - 1 <= D <= S - 2:
            return False, None
        return True, D

    out = set()
    for t in itertools.combinations_with_replacement(dvals, r):
        for perm in set(itertools.permutations(t)):
            if ok(R, list(perm))[0]:
                out.add(t)
                break
    return frozenset(out)


def main(nmax, K):
    dvals = [d for d in range(-K, K + 1) if d != 0]
    for n in range(4, nmax + 1):
        t0 = time.time()
        ss = list(shapes(n))
        acc = {}
        for s in ss:
            r = cherries(s)
            a = acc_direct(s, dvals, r)
            b = acc_reduced(reduced(s), dvals, r)
            assert a == b, (show(s), sorted(a ^ b)[:5])
            acc[s] = a
        acc0 = {s: frozenset(t for t in acc[s] if sum(t) <= n - 2) for s in ss}
        for name, inv in (("Acc", acc), ("Acc0", acc0)):
            groups = {}
            for s in ss:
                groups.setdefault((cherries(s), inv[s]), []).append(s)
            clashes = [g for g in groups.values() if len(g) > 1]
            print(f"n={n}: {len(ss)} shapes, {name} with |d|<={K}: {len(groups)} classes"
                  + ("  ALL SEPARATED" if not clashes else "") + f"  ({time.time() - t0:.0f}s)", flush=True)
            for g in clashes[:8]:
                print("   not separated:", "   ".join(show(s) for s in g))
        print("   reduced formulas agree with the direct computation for all shapes", flush=True)


if __name__ == "__main__":
    main(int(sys.argv[1]), int(sys.argv[2]))
