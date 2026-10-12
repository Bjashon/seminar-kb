"""Acc (ones + specials at cherries) for two shapes with |d| <= K: symmetric difference.
Usage: python acc_pair.py K "shape1" "shape2"
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from acc import acc_reduced, reduced, cherries   # noqa: E402
from separate_pair import parse                  # noqa: E402
from thin_invariants import show                 # noqa: E402

K = int(sys.argv[1])
s, t = parse(sys.argv[2]), parse(sys.argv[3])
dvals = [d for d in range(-K, K + 1) if d != 0]
A = acc_reduced(reduced(s), dvals, cherries(s))
B = acc_reduced(reduced(t), dvals, cherries(t))
print(show(s), len(A), " ", show(t), len(B))
print("only in first:", sorted(A - B, key=lambda m: (max(abs(x) for x in m), m))[:20])
print("only in second:", sorted(B - A, key=lambda m: (max(abs(x) for x in m), m))[:20])
