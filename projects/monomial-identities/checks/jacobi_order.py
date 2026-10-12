"""Which implications between bracket identities follow from the Jacobi identity alone?

For ideals A, B, C of a Lie algebra:  [[A,B],C]  is inside  [[A,C],B] + [A,[B,C]].
In terms of shapes: if a shape s contains a subtree [[a,b],c], let t1 and t2 be
s with that subtree replaced by [[a,c],b] and by [a,[b,c]]. Then
I_s is inside I_t1 + I_t2, so every identity that implies both w_t1 = 0 and
w_t2 = 0 implies w_s = 0:      Up(s) contains Up(t1) & Up(t2),
where Up(s) = the set of shapes t with I_s inside I_t. The least sets Up(s)
closed under this rule (starting from Up(s) = {s}) give the "Jacobi-derivable"
implications. This script compares them with the true ones from atlas.json.

Usage: python jacobi_order.py      (reads atlas.json written by atlas.py)
"""
import json
from pathlib import Path

from bahturin26 import key, shapes, show

HERE = Path(__file__).resolve().parent


def canon(t):
    if t == "x":
        return t
    return tuple(sorted((canon(t[0]), canon(t[1])), key=key))


def decompositions(s):
    """All pairs (t1, t2) obtained by one Jacobi step at some node of s."""
    out = set()

    def walk(t, rebuild):
        if t == "x":
            return
        for p, c in ((t[0], t[1]), (t[1], t[0])):
            if p != "x":
                a, b = p
                out.add((canon(rebuild(((a, c), b))), canon(rebuild((a, (b, c))))))
        walk(t[0], lambda u, t=t: rebuild((u, t[1])))
        walk(t[1], lambda u, t=t: rebuild((t[0], u)))

    walk(s, lambda u: u)
    return out


def derivable(n):
    ss = shapes(n)
    up = {s: {s} for s in ss}
    dec = {s: decompositions(s) for s in ss}
    changed = True
    while changed:
        changed = False
        for s in ss:
            for t1, t2 in dec[s]:
                new = (up[t1] & up[t2]) - up[s]
                if new:
                    up[s] |= new
                    changed = True
    return up


def main():
    atlas = json.loads((HERE / "atlas.json").read_text(encoding="utf-8"))
    for n_str, level in atlas.items():
        n = int(n_str)
        ss = list(shapes(n))
        assert [show(s) for s in ss] == [e["s"] for e in level["shapes"]]
        true = {(i, j) for i, e in enumerate(level["shapes"]) for j in e["in"]}
        up = derivable(n)
        derived = {(i, ss.index(t)) for i, s in enumerate(ss) for t in up[s] if t != s}
        extra = sorted(derived - true)   # derived but false: would mean a bug
        missed = sorted(true - derived)  # true but not derivable by Jacobi steps
        print(f"n={n}: true {len(true)}, Jacobi-derivable {len(derived)}, derived-but-false {len(extra)}, true-but-not-derived {len(missed)}")
        for i, j in missed:
            print(f"      not derived: {show(ss[i])}  <  {show(ss[j])}")
        assert not extra, [(show(ss[i]), show(ss[j])) for i, j in extra]
        # antisymmetry of the derivable order
        assert not any((j, i) in derived for i, j in derived), "the derivable relation is not antisymmetric"


if __name__ == "__main__":
    main()
