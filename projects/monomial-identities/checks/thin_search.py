"""Tell bracket shapes apart with thin-algebra functionals: a computer-checkable
proof of problem 2.6 for a given number of letters (characteristic 0), without
linear algebra.

Thin algebras. Colours 0..r-1, a basis e_u indexed by u in Z^r (the colour
content), and [e_u, e_v] = c(u, v) e_(u+v) with
  witt:         c(u, v) = lam(v) - lam(u), lam: Z^r -> Z linear
                (the Witt algebra Der K[t, 1/t]: e_i = t^(i+1) d/dt, [e_i, e_j] = (j - i) e_(i+j);
                 colour a is the element e_(lam_a));
  torus:        c(u, v) = w(u, v), w an antisymmetric integer bilinear form
                (Poisson bracket of trigonometric polynomials on a torus);
  hamiltonian:  colour a is the Laurent monomial x^(p_a[0]+1) y^(p_a[1]+1), P(u) = sum u_a p_a,
                c(u, v) = det(P(u) + (1,1), P(v) + (1,1))  (Poisson bracket of Laurent monomials).
All three satisfy the Jacobi identity. Colour the leaves of a shape; every
subtree gets a colour-count vector; a node with children of counts s, t is
degenerate when c(s, t) = 0. The value of the monomial on the coloured basis
elements is (product of c over the nodes) * e_(content).

INV_c(shape) = the set of contents m such that some colouring with content m
has no degenerate node. If M_s is inside M_t, then INV_c(s) is inside INV_c(t):
write the monomial of shape s as a combination of monomials of shape t and
evaluate both sides on the coloured basis elements. So two shapes with
different INV_c for some c have different modules M -- different identities.

`separate` looks for a list of structure functions whose invariants together
distinguish all shapes with n leaves; the list is a certificate that anyone
can re-check (`verify`). Certificates are stored in thin_certificates.json.

Usage: python thin_search.py find N [SAMPLES] [SEED]      search and store a certificate
       python thin_search.py verify                       re-check all stored certificates
       python thin_search.py families NMAX [SAMPLES]      which single family suffices, and
                                                          how many true non-implications each detects
"""
import json
import random
import sys
import time
from functools import lru_cache
from pathlib import Path

from thin_invariants import shapes, show

HERE = Path(__file__).resolve().parent
CERT = HERE / "thin_certificates.json"
FAMILIES = ("witt", "torus", "hamiltonian")


def structure(spec):
    """spec -> (number of colours, function c(s, t))."""
    if spec["type"] == "torus":
        w = spec["w"]
        r = len(w)

        def c(s, t):
            return sum(w[a][b] * s[a] * t[b] for a in range(r) for b in range(r) if w[a][b])
        return r, c
    if spec["type"] == "witt":
        lam = spec["lam"]
        r = len(lam)

        def c(s, t):
            return sum(lam[a] * (t[a] - s[a]) for a in range(r))
        return r, c
    p = spec["p"]
    r = len(p)

    def c(s, t):
        sx = sum(s[a] * p[a][0] for a in range(r)) + 1
        sy = sum(s[a] * p[a][1] for a in range(r)) + 1
        tx = sum(t[a] * p[a][0] for a in range(r)) + 1
        ty = sum(t[a] * p[a][1] for a in range(r)) + 1
        return sx * ty - sy * tx
    return r, c


def invariants(n, spec):
    """shape (n leaves) -> frozenset of contents with a colouring without degenerate nodes."""
    r, c = structure(spec)
    unit = frozenset(tuple(1 if i == a else 0 for i in range(r)) for a in range(r))

    @lru_cache(None)
    def ach(sh):
        if sh == "x":
            return unit
        left, right = ach(sh[0]), ach(sh[1])
        out = set()
        for s in left:
            for t in right:
                if c(s, t) != 0:
                    out.add(tuple(x + y for x, y in zip(s, t)))
        return frozenset(out)

    return {s: ach(s) for s in shapes(n)}


def random_spec(rng, family="all"):
    kind = rng.choice(FAMILIES) if family == "all" else family
    r = rng.choice([2, 3, 3, 4, 4, 5])
    if kind == "torus":
        w = [[0] * r for _ in range(r)]
        for a in range(r):
            for b in range(a + 1, r):
                w[a][b] = rng.choice([-2, -1, -1, 0, 0, 1, 1, 2])
                w[b][a] = -w[a][b]
        return {"type": "torus", "w": w}
    if kind == "witt":
        return {"type": "witt", "lam": [rng.randint(-3, 3) for _ in range(r)]}
    return {"type": "hamiltonian", "p": [[rng.randint(-2, 2), rng.randint(-2, 2)] for _ in range(r)]}


def classes_of(n, specs):
    """Shapes grouped by the tuple of their invariants."""
    ss = list(shapes(n))
    sig = {s: () for s in ss}
    for spec in specs:
        inv = invariants(n, spec)
        for s in ss:
            sig[s] += (inv[s],)
    groups = {}
    for s in ss:
        groups.setdefault(sig[s], []).append(s)
    return list(groups.values())


def separate(n, samples=20000, seed=1, initial=(), family="all", quiet=False):
    """Thin algebras whose invariants together separate all shapes with n leaves.
    `initial` (the previous level's certificate) is tried first, then random ones."""
    rng = random.Random(seed)
    ss = list(shapes(n))
    cls = {s: 0 for s in ss}
    nclasses = 1
    used = []
    t0 = time.time()

    def refine(spec):
        nonlocal nclasses
        inv = invariants(n, spec)
        refined = {}
        for s in ss:
            refined.setdefault((cls[s], inv[s]), []).append(s)
        if len(refined) == nclasses:
            return False
        used.append(spec)
        for i, group in enumerate(refined.values()):
            for s in group:
                cls[s] = i
        nclasses = len(refined)
        return True

    for spec in initial:
        if nclasses < len(ss) and refine(spec) and not quiet:
            print(f"   n={n}: {nclasses} classes of {len(ss)} from the previous certificate ({time.time() - t0:.0f}s)", flush=True)
    for it in range(samples):
        if nclasses == len(ss):
            break
        if refine(random_spec(rng, family)) and not quiet:
            print(f"   n={n}: {nclasses} classes of {len(ss)} after {it + 1} tries ({time.time() - t0:.0f}s)", flush=True)
    return used, nclasses == len(ss)


def true_order(n):
    """(shapes, set of (i, j) with M_i inside M_j) from atlas.json, or None."""
    atlas_path = HERE / "atlas.json"
    if not atlas_path.is_file():
        return None
    atlas = json.loads(atlas_path.read_text(encoding="utf-8"))
    if str(n) not in atlas:
        return None
    ss = list(shapes(n))
    level = atlas[str(n)]["shapes"]
    assert [show(s) for s in ss] == [e["s"] for e in level]
    return ss, {(i, j) for i, e in enumerate(level) for j in e["in"]}


def detected_noninclusions(n, specs):
    """With atlas.json: which true non-inclusions do the invariants detect? Also re-checks monotonicity."""
    order = true_order(n)
    if order is None:
        return None
    ss, true_in = order
    seen = set()
    for spec in specs:
        inv = invariants(n, spec)
        sets = [inv[s] for s in ss]
        for i, j in true_in:
            assert sets[i] <= sets[j], ("monotonicity violated", show(ss[i]), show(ss[j]), spec)
        for i in range(len(ss)):
            for j in range(len(ss)):
                if i != j and (i, j) not in true_in and not sets[i] <= sets[j]:
                    seen.add((i, j))
    total = len(ss) * (len(ss) - 1) - len(true_in)
    return seen, total, ss, true_in


def verify():
    certs = json.loads(CERT.read_text(encoding="utf-8"))
    for n_str in sorted(certs, key=int):
        n = int(n_str)
        t0 = time.time()
        groups = classes_of(n, certs[n_str])
        ok = all(len(g) == 1 for g in groups)
        extra = detected_noninclusions(n, certs[n_str])
        print(f"n={n}: {len(shapes(n))} shapes, {len(certs[n_str])} thin algebras -> {len(groups)} classes: "
              + ("ALL SHAPES HAVE DIFFERENT IDENTITIES" if ok else "NOT SEPARATED")
              + (f"; detects {len(extra[0])} of {extra[1]} true non-implications, no violation of monotonicity" if extra else "")
              + f"  ({time.time() - t0:.0f}s)", flush=True)
        assert ok


def find(n, samples, seed):
    certs = json.loads(CERT.read_text(encoding="utf-8")) if CERT.is_file() else {}
    used, ok = separate(n, samples, seed, initial=certs.get(str(n - 1), []))
    print(f"n={n}: {'separated' if ok else 'NOT separated'} with {len(used)} thin algebras")
    if ok:
        certs[str(n)] = used
        CERT.write_text(json.dumps(certs, separators=(",", ":")), encoding="utf-8")
    else:
        for g in classes_of(n, used):
            if len(g) > 1:
                print("   not separated:", "   ".join(show(s) for s in g))


def families(nmax, samples=3000):
    for n in range(4, nmax + 1):
        print(f"n={n}: {len(shapes(n))} shapes")
        for fam in FAMILIES:
            used, ok = separate(n, samples, 1, family=fam, quiet=True)
            line = f"   {fam:12s}: {'separates all' if ok else 'does NOT separate'} with {len(used)} algebras"
            order = true_order(n)
            if order is not None:
                rng = random.Random(2)
                seen = set()
                for _ in range(samples):
                    d = detected_noninclusions(n, [random_spec(rng, fam)])
                    seen |= d[0]
                ss, true_in = order
                total = d[1]
                missed = sorted({(i, j) for i in range(len(ss)) for j in range(len(ss)) if i != j and (i, j) not in true_in} - seen)
                line += f"; detects {len(seen)} of {total} true non-implications"
                if missed and len(missed) <= 6:
                    line += "; missed: " + "; ".join(f"{show(ss[i])} not in {show(ss[j])}" for i, j in missed)
            print(line, flush=True)
            if not ok:
                for g in classes_of(n, used):
                    if len(g) > 1:
                        print("      not separated:", "   ".join(show(s) for s in g))


if __name__ == "__main__":
    if sys.argv[1] == "verify":
        verify()
    elif sys.argv[1] == "families":
        families(int(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 3000)
    else:
        find(int(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 20000, int(sys.argv[4]) if len(sys.argv) > 4 else 1)
