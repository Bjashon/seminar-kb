"""Cherry-special family with base b for two shapes, |d| <= K: symmetric difference.
Usage: python acc_pair_b.py K b "shape1" "shape2"
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from acc import reduced, cherries            # noqa: E402
from acc_b import acc_base                   # noqa: E402
from separate_pair import parse              # noqa: E402
from thin_invariants import show             # noqa: E402

K, b = int(sys.argv[1]), int(sys.argv[2])
s, t = parse(sys.argv[3]), parse(sys.argv[4])
dvals = [d for d in range(-K, K + 1) if d != 0]
A = acc_base(reduced(s), dvals, cherries(s), b)
B = acc_base(reduced(t), dvals, cherries(t), b)
print(f"base {b}:", show(s), len(A), " ", show(t), len(B))
print("only in first:", sorted(A - B, key=lambda m: (max(abs(x) for x in m), m))[:12])
print("only in second:", sorted(B - A, key=lambda m: (max(abs(x) for x in m), m))[:12])
