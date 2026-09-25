import itertools, sys, time
import gerst_check as g  # run from this folder: python jacobiator_check.py [k]  (k = number of parity cases, default all 16)
g.MODE = 'odd'; g.SKIP_JACOBI = True
X = lambda i: ('x', i)
def br(a, b): return ('{', a, b)
def dot(*ts):
    t = ts[0]
    for s in ts[1:]: t = ('.', t, s)
    return t
sg = g.sg
def K(x, b, c, pb, pc):
    """Jacobiator K(x;b,c) = {b,{c,x}} - {{b,c},x} - (-1)^{(|b|-1)(|c|-1)} {c,{b,x}} as list of (tree, coeff)."""
    return [(br(b, br(c, x)), 1), (br(br(b, c), x), -1), (br(c, br(b, x)), -sg((pb-1)*(pc-1)))]
def times_right(terms, y): return [(dot(t, y), c) for t, c in terms]
def times_left(y, terms): return [(dot(y, t), c) for t, c in terms]
pars = list(itertools.product([0,1], repeat=4))
sel = pars if len(sys.argv) < 2 else pars[:int(sys.argv[1])]
allok = True
for xpar in sel:
    t0 = time.time()
    a1, a2, b, c = X(0), X(1), X(2), X(3)
    p1, p2, pb, pc = xpar
    terms = K(dot(a1, a2), b, c, pb, pc)
    terms += [(t, -cf) for t, cf in times_right(K(a1, b, c, pb, pc), a2)]
    terms += [(t, -sg((pb+pc)*p1) * cf) for t, cf in times_left(a1, K(a2, b, c, pb, pc))]
    terms += [(t, cf) for t, cf in times_right(K(g.ONE, b, c, pb, pc), dot(a1, a2))]
    v = {}
    for t, cf in terms: g.add(v, t, cf)
    B = g.relation_basis(frozenset({0,1,2,3}), 2, xpar, False)
    r, _ = B.reduce(v)
    ok = not r
    allok &= ok
    print(f"   parities {xpar}: {'OK' if ok else 'FAILS'}  ({time.time()-t0:.0f}s, rank {len(B)})", flush=True)
print("ALL OK (Jacobiator formula follows from Leibniz + skew-symmetry alone)" if allok else "PROBLEM")
