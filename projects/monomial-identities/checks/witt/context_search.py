"""Structured search for a Witt separator of two shapes: weight multisets m = m_small + m_pattern,
m_small = all multisets of size NS with entries in [-K, K], m_pattern from a list of fixed outer
patterns (huge generic values, zeros, ones ...).  Membership in Inv_W(shape) is decided by a DP
over sub-multisets of m.

Usage: python context_search.py K NS "shape1" "shape2"
"""
import itertools
import sys
from collections import Counter
from functools import lru_cache
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from separate_pair import parse            # noqa: E402
from thin_invariants import show, size     # noqa: E402

PATTERNS = {
    "huge5": [100, 201, 403, 807, 1615],
    "huge3+00": [100, 201, 403, 0, 0],
    "huge2+000": [100, 201, 0, 0, 0],
    "huge4+0": [100, 201, 403, 807, 0],
    "huge2+111": [100, 201, 1, 1, 1],
    "huge1+0000": [100, 0, 0, 0, 0],
    "huge+-": [100, -100, 201, -201, 403],
    "00011": [0, 0, 0, 1, 1],
    "0001-1": [0, 0, 0, 1, -1],
    "11111": [1, 1, 1, 1, 1],
    "huge2+1-10": [100, 201, 1, -1, 0],
    "huge3+1-1": [100, 201, 403, 1, -1],
}


def member(shape, m):
    """is the multiset m (tuple) in Inv_W(shape)?  DP over count vectors of sub-multisets."""
    vals = sorted(set(m))
    cnt = Counter(m)
    maxc = tuple(cnt[v] for v in vals)

    @lru_cache(None)
    def ach(sh):
        if sh == "x":
            return frozenset(tuple(1 if j == i else 0 for j in range(len(vals))) for i in range(len(vals)))
        out = set()
        A, B = ach(sh[0]), ach(sh[1])
        sums = {c: sum(x * v for x, v in zip(c, vals)) for c in A | B}
        for a in A:
            for b in B:
                c = tuple(x + y for x, y in zip(a, b))
                if any(x > mx for x, mx in zip(c, maxc)):
                    continue
                if sums[a] != sums[b]:
                    out.add(c)
        return frozenset(out)

    return maxc in ach(shape)


def main():
    K, NS = int(sys.argv[1]), int(sys.argv[2])
    s, t = parse(sys.argv[3]), parse(sys.argv[4])
    n = size(s)
    assert size(t) == n
    small_vals = list(range(-K, K + 1))
    found = 0
    for name, pat in PATTERNS.items():
        assert len(pat) + NS == n, (name, len(pat), NS, n)
        tested = 0
        for ms in itertools.combinations_with_replacement(small_vals, NS):
            m = tuple(sorted(ms + tuple(pat)))
            a, b = member(s, m), member(t, m)
            tested += 1
            if a != b:
                found += 1
                print(f"SEPARATOR pattern {name}: {m}  in Inv({show(s)}): {a}, in Inv({show(t)}): {b}", flush=True)
                if found >= 6:
                    return
        print(f"pattern {name}: {tested} multisets tested, separators so far {found}", flush=True)


if __name__ == "__main__":
    main()
