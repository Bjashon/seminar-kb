"""For two shapes (given as strings like [x,[x,x]]), list the multisets of integer weights
in [-K, K] that lie in exactly one of Inv_W(s), Inv_W(t), sorted by simplicity
(number of distinct values, then largest |weight|).

Usage: python separate_pair.py K "shape1" "shape2" [MAXPRINT]
"""
import sys
from functools import lru_cache
from pathlib import Path

CHECKS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CHECKS))
from thin_invariants import size, show  # noqa: E402


def parse(s):
    """'[x,[x,x]]' -> nested tuples; 'x' -> 'x'."""
    s = s.strip()
    if s == "x":
        return "x"
    assert s[0] == "[" and s[-1] == "]"
    depth = 0
    for i, ch in enumerate(s):
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
        elif ch == "," and depth == 1:
            return (parse(s[1:i]), parse(s[i + 1:-1]))
    raise ValueError(s)


def inv_witt(shape, weights):
    """frozenset of achievable weight-multisets (as sorted tuples) for the shape."""
    @lru_cache(None)
    def ach(sh):
        if sh == "x":
            return frozenset((w,) for w in weights)
        out = set()
        for u in ach(sh[0]):
            su = sum(u)
            for v in ach(sh[1]):
                if su != sum(v):
                    out.add(tuple(sorted(u + v)))
        return frozenset(out)
    return ach(shape)


def main():
    K = int(sys.argv[1])
    s, t = parse(sys.argv[2]), parse(sys.argv[3])
    maxprint = int(sys.argv[4]) if len(sys.argv) > 4 else 40
    assert size(s) == size(t)
    weights = list(range(-K, K + 1))
    A, B = inv_witt(s, weights), inv_witt(t, weights)
    only_s = sorted(A - B, key=lambda m: (len(set(m)), max(abs(x) for x in m), m))
    only_t = sorted(B - A, key=lambda m: (len(set(m)), max(abs(x) for x in m), m))
    print(f"{show(s)}: {len(A)} multisets;  {show(t)}: {len(B)} multisets")
    print(f"in Inv({show(s)}) only: {len(only_s)}")
    for m in only_s[:maxprint]:
        print("   ", m)
    print(f"in Inv({show(t)}) only: {len(only_t)}")
    for m in only_t[:maxprint]:
        print("   ", m)


if __name__ == "__main__":
    main()
