"""Which stored thin algebras (thin_certificates.json, level n) separate the given pair of shapes?
Usage: python which_cert.py n "shape1" "shape2"
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CHECKS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(CHECKS))
from separate_pair import parse                 # noqa: E402
from thin_search import invariants              # noqa: E402
from thin_invariants import show                # noqa: E402

n = int(sys.argv[1])
s, t = parse(sys.argv[2]), parse(sys.argv[3])
certs = json.loads((CHECKS / "thin_certificates.json").read_text(encoding="utf-8"))
for spec in certs[str(n)]:
    inv = invariants(n, spec)
    a, b = inv[s], inv[t]
    if a != b:
        only_s = sorted(a - b)[:3]
        only_t = sorted(b - a)[:3]
        print(f"SEPARATES: {spec}\n   contents only for {show(s)}: {only_s}\n   contents only for {show(t)}: {only_t}", flush=True)
    else:
        print(f"same invariant: {spec}", flush=True)
