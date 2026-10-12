"""Cherry-specials families with base b: weights b on ordinary leaves, b - d_i at one leaf of each
cherry (d_i != 0).  Reduced constraints on (R', S):
   D(c) not in { b(s(c)-1), ..., b(S(c)-2) }  for every node c of R' (s(leaf) = 1);
   D(c1) - D(c2) != b (S(c1) - S(c2))          at every branching node.
(For b = 0 this is: D(c) != 0 at stalked nodes, D(c1) != D(c2) at branching nodes.)

Checks, for n <= NMAX and |d| <= K:
  * does Acc_b separate all shapes, for b = 0, b = 1, and both together;
  * Lemma 1: with T(s) = { sum d : d in Acc_1(s) },  k(s) = n - 2 - max(T(s) & [0, n-2]),
    where k(s) = length of the top stalk  (checked for every shape with >= 2 cherries).
Usage: python acc_b.py NMAX K
"""
import itertools
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from acc import reduced, cherries            # noqa: E402
from thin_invariants import shapes, show     # noqa: E402


def acc_base(R, dvals, r, b):
    def leaves(node):
        return 1 if node[0] == "leaf" else leaves(node[2]) + leaves(node[3])

    def ok(node, assignment):
        S = node[1]
        if node[0] == "leaf":
            d = assignment[0]
            s_node = 1
            D = d
        else:
            c1, c2 = node[2], node[3]
            k = leaves(c1)
            ok1, D1 = ok(c1, assignment[:k])
            if not ok1:
                return False, None
            ok2, D2 = ok(c2, assignment[k:])
            if not ok2:
                return False, None
            if D1 - D2 == b * (c1[1] - c2[1]):
                return False, None
            D = D1 + D2
            s_node = c1[1] + c2[1]
        for j in range(s_node - 1, S - 1):
            if D == b * j:
                return False, None
        return True, D

    out = set()
    for t in itertools.combinations_with_replacement(dvals, r):
        for perm in set(itertools.permutations(t)):
            if ok(R, list(perm))[0]:
                out.add(t)
                break
    return frozenset(out)


def top_stalk(s):
    k = 0
    while s != ("x", "x") and (s[0] == "x" or s[1] == "x"):
        s = s[1] if s[0] == "x" else s[0]
        k += 1
    return k


def main(nmax, K):
    dvals = [d for d in range(-K, K + 1) if d != 0]
    for n in range(4, nmax + 1):
        t0 = time.time()
        ss = list(shapes(n))
        acc = {b: {} for b in (0, 1)}
        for s in ss:
            R, r = reduced(s), cherries(s)
            for b in (0, 1):
                acc[b][s] = acc_base(R, dvals, r, b)
        for name, key in (("base 0", lambda s: acc[0][s]), ("base 1", lambda s: acc[1][s]),
                          ("both", lambda s: (acc[0][s], acc[1][s]))):
            groups = {}
            for s in ss:
                groups.setdefault((cherries(s), key(s)), []).append(s)
            clashes = [g for g in groups.values() if len(g) > 1]
            print(f"n={n}: {len(ss)} shapes, cherry specials {name}, |d|<={K}: {len(groups)} classes"
                  + ("  ALL SEPARATED" if not clashes else ""), flush=True)
            for g in clashes[:6]:
                print("   not separated:", "   ".join(show(x) for x in g))
        # Lemma 1
        bad = 0
        for s in ss:
            if cherries(s) < 2:
                continue
            T = {sum(t) for t in acc[1][s]}
            m = max(t for t in T if 0 <= t <= n - 2)
            if n - 2 - m != top_stalk(s):
                bad += 1
                print("   LEMMA 1 FAILS for", show(s), "predicted k =", n - 2 - m, "true k =", top_stalk(s))
        print(f"   Lemma 1 (top stalk from sums) checked on all shapes with >= 2 cherries: {'OK' if not bad else 'FAILS'}  ({time.time() - t0:.0f}s)", flush=True)


if __name__ == "__main__":
    main(int(sys.argv[1]), int(sys.argv[2]))
