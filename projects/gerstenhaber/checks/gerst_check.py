"""Numerical check of the main theorem of the note
"A basis of free generalized Gerstenhaber algebras" (Kaygorodov, Viatkina).

Free unital generalized Gerstenhaber algebra G on X = {1, x_1..x_n} with
parities given.  G is graded by (x-content as a multilinear subset, number
of brackets beta).  For each component we compute its dimension as
(#reduced monomials - rank of the defining relations) over GF(p) and
compare it with the number of proposed basis elements U in that
component.  The free odd Lie superalgebra is checked the same way against
the set M of good words + squares.

Usage:  python gerst_check.py [n] [maxbeta] [odd|even] [deg|lex]
   n        number of generators x_i (all 2^n parity assignments are run)
   maxbeta  largest number of brackets checked
   odd      generalized Gerstenhaber (bracket of degree -1)  [default]
   even     generalized Poisson superalgebra of Kaygorodov 2017 (control run)
   deg      good words ordered by length first, as in the paper  [default]
   lex      Shirshov's lexicographic order (Lyndon-Shirshov type) -- gives
            a different set of good words, also a basis

Trees: ('1',), ('x', i), ('.', l, r), ('{', l, r).
Reduced: no '.' child equals ('1',).
"""
import itertools, sys
from functools import lru_cache

P = 1000003
SKIP_JACOBI = False  # when True the odd Jacobi identity is NOT imposed (used to test consequences of Leibniz alone)
MODE = 'odd'  # 'odd' = Gerstenhaber (bracket of degree -1); 'even' = generalized Poisson (K17)

def sg(e):
    return -1 if e % 2 else 1

# ---------- monomials ----------
ONE = ('1',)

def par(t, xpar):
    if t == ONE: return 0
    if t[0] == 'x': return xpar[t[1]]
    if t[0] == '.': return (par(t[1], xpar) + par(t[2], xpar)) % 2
    return (par(t[1], xpar) + par(t[2], xpar) + (1 if MODE == 'odd' else 0)) % 2

def subsets(fs):
    fs = tuple(sorted(fs))
    for r in range(len(fs) + 1):
        for c in itertools.combinations(fs, r):
            yield frozenset(c)

@lru_cache(None)
def gen(C, beta):
    """All reduced monomials with x-content C (frozenset) and beta brackets."""
    out = []
    if not C and beta == 0:
        out.append(ONE)
    if len(C) == 1 and beta == 0:
        out.append(('x', next(iter(C))))
    # dot: both children not ONE
    for C1 in subsets(C):
        C2 = C - C1
        for b1 in range(beta + 1):
            b2 = beta - b1
            # a dot child that is ONE is not reduced, and (empty, 0) only holds ONE
            if (not C1 and b1 == 0) or (not C2 and b2 == 0):
                continue
            L = [t for t in gen(C1, b1) if t != ONE]
            R = [t for t in gen(C2, b2) if t != ONE]
            for l in L:
                for r in R:
                    out.append(('.', l, r))
    if beta >= 1:
        for C1 in subsets(C):
            C2 = C - C1
            for b1 in range(beta):
                b2 = beta - 1 - b1
                for l in gen(C1, b1):
                    for r in gen(C2, b2):
                        out.append(('{', l, r))
    return out

def normalize(t):
    """Apply 1*a -> a, a*1 -> a."""
    if t == ONE or t[0] == 'x': return t
    l, r = normalize(t[1]), normalize(t[2])
    if t[0] == '.':
        if l == ONE: return r
        if r == ONE: return l
    return (t[0], l, r)

# ---------- linear algebra mod P ----------
def add(v, t, c):
    t = normalize(t)
    v[t] = (v.get(t, 0) + c) % P
    if v[t] == 0: del v[t]

class Basis:
    """Row-echelon set of sparse vectors keyed by monomial (with a fixed key order)."""
    def __init__(self):
        self.rows = {}  # pivot -> vector (dict) with pivot coeff 1
    def reduce(self, v):
        v = dict(v)
        while v:
            piv = min(v)  # deterministic pivot choice
            if piv in self.rows:
                c = v[piv]
                for k, x in self.rows[piv].items():
                    v[k] = (v.get(k, 0) - c * x) % P
                    if v[k] == 0: del v[k]
            else:
                return v, piv
        return v, None
    def insert(self, v):
        v, piv = self.reduce(v)
        if piv is None: return False
        inv = pow(v[piv], P - 2, P)
        v = {k: x * inv % P for k, x in v.items()}
        # keep other rows reduced w.r.t. new pivot? Not needed for rank.
        self.rows[piv] = v
        return True
    def __len__(self): return len(self.rows)

# ---------- relations ----------
def mons(C, b, odd_lie_only):
    ms = gen(C, b)
    return [m for m in ms if no_dot(m)] if odd_lie_only else ms

def instances(C, beta, xpar, odd_lie_only=False):
    """All template instances of exact component (C, beta) as sparse vectors."""
    out = []
    G = lambda C_, b_: mons(C_, b_, odd_lie_only)
    def pr(t): return par(t, xpar)
    # split content into ordered parts
    def parts2(C, b):
        for C1 in subsets(C):
            C2 = C - C1
            for b1 in range(b + 1):
                yield C1, b1, C2, b - b1
    def parts3(C, b):
        for C1 in subsets(C):
            rest = C - C1
            for b1 in range(b + 1):
                for C2, b2, C3, b3 in parts2(rest, b - b1):
                    yield C1, b1, C2, b2, C3, b3
    if not odd_lie_only:
        # T1 supercommutativity, T2 associativity (0 brackets used by template)
        for C1, b1, C2, b2 in parts2(C, beta):
            for a in G(C1, b1):
                for b in G(C2, b2):
                    v = {}
                    add(v, ('.', a, b), 1); add(v, ('.', b, a), -sg(pr(a) * pr(b)))
                    if v: out.append(v)
        for C1, b1, C2, b2, C3, b3 in parts3(C, beta):
            for a in G(C1, b1):
                for b in G(C2, b2):
                    for c in G(C3, b3):
                        v = {}
                        add(v, ('.', ('.', a, b), c), 1); add(v, ('.', a, ('.', b, c)), -1)
                        if v: out.append(v)
    # T3 odd anticommutativity (1 bracket)
    if beta >= 1:
        for C1, b1, C2, b2 in parts2(C, beta - 1):
            for a in G(C1, b1):
                for b in G(C2, b2):
                    v = {}
                    add(v, ('{', a, b), 1)
                    add(v, ('{', b, a), sg((pr(a) - 1) * (pr(b) - 1)) if MODE == 'odd' else sg(pr(a) * pr(b)))
                    if v: out.append(v)
    # T4 odd Jacobi (2 brackets)
    if beta >= 2 and not SKIP_JACOBI:
        for C1, b1, C2, b2, C3, b3 in parts3(C, beta - 2):
            for a in G(C1, b1):
                for b in G(C2, b2):
                    for c in G(C3, b3):
                        v = {}
                        add(v, ('{', a, ('{', b, c)), 1)
                        add(v, ('{', ('{', a, b), c), -1)
                        add(v, ('{', b, ('{', a, c)), -(sg((pr(a) - 1) * (pr(b) - 1)) if MODE == 'odd' else sg(pr(a) * pr(b))))
                        if v: out.append(v)
    # T5 generalized Leibniz (1 bracket in LHS; D-term has 1 bracket too)
    if beta >= 1 and not odd_lie_only:
        for C1, b1, C2, b2, C3, b3 in parts3(C, beta - 1):
            for a in G(C1, b1):
                for b in G(C2, b2):
                    for c in G(C3, b3):
                        v = {}
                        add(v, ('{', a, ('.', b, c)), 1)
                        add(v, ('.', ('{', a, b), c), -1)
                        if MODE == 'odd':
                            add(v, ('.', b, ('{', a, c)), -sg((pr(a) - 1) * pr(b)))
                            add(v, ('.', ('.', ('{', ONE, a), b), c), -sg(pr(a) - 1))
                        else:
                            add(v, ('.', b, ('{', a, c)), -sg(pr(a) * pr(b)))
                            add(v, ('.', ('.', ('{', a, ONE), b), c), 1)
                        if v: out.append(v)
    return out

@lru_cache(None)
def relation_basis(C, beta, xpar, odd_lie_only=False):
    """Echelon basis of the ideal component (C, beta)."""
    B = Basis()
    for v in instances(C, beta, xpar, odd_lie_only):
        B.insert(v)
    # contexts: op(m, r), op(r, m) for r in smaller components
    for C1 in subsets(C):
        C2 = C - C1
        for b1 in range(beta + 1):
            b2 = beta - b1
            if (C1, b1) == (C, beta):
                continue  # m would be '1' with a dot -> r itself; bracket changes beta
            rows = list(relation_basis(C1, b1, xpar, odd_lie_only).rows.values())
            if not rows: continue
            for m in mons(C2, b2, odd_lie_only):
                for r in rows:
                    if not odd_lie_only and m != ONE:
                        for (l_is_r) in (True, False):
                            v = {}
                            for t, c in r.items():
                                add(v, ('.', t, m) if l_is_r else ('.', m, t), c)
                            B.insert(v)
            if b2 >= 1 or True:
                pass
        # bracket contexts: {m, r}, {r, m} with b1 + b(m) = beta - 1
        for b1 in range(beta):
            b2 = beta - 1 - b1
            rows = list(relation_basis(C1, b1, xpar, odd_lie_only).rows.values())
            if not rows: continue
            for m in mons(C2, b2, odd_lie_only):
                for r in rows:
                    for l_is_r in (True, False):
                        v = {}
                        for t, c in r.items():
                            add(v, ('{', t, m) if l_is_r else ('{', m, t), c)
                        B.insert(v)
    return B

def quotient_dim(C, beta, xpar, odd_lie_only=False):
    mons = gen(C, beta)
    if odd_lie_only:
        mons = [m for m in mons if no_dot(m)]
    return len(mons) - len(relation_basis(C, beta, xpar, odd_lie_only))

def no_dot(t):
    if t == ONE or t[0] == 'x': return True
    if t[0] == '.': return False
    return no_dot(t[1]) and no_dot(t[2])

# ---------- the proposed basis: good words, M, U ----------
def leaves(t):
    if t == ONE: return ['1']
    if t[0] == 'x': return [t[1]]
    return leaves(t[1]) + leaves(t[2])

ORDER = 'deg'  # 'deg': by length first, then lexicographically by components (the paper's order);
               # 'lex': Shirshov's convention -- compare associative supports lexicographically,
               # a proper prefix being smaller

def word_key(t, n):
    if ORDER == 'lex':
        return tuple(0 if l == '1' else l + 1 for l in leaves(t))
    if t == ONE: return (1, 0, 0)
    if t[0] == 'x': return (1, 0, t[1] + 1)
    return (len(leaves(t)), 1, word_key(t[1], n), word_key(t[2], n))

def good_words(C, ones, xpar, n, nested_squares=False):
    """Good words with x-content C and given number of 1's (bracket-only trees)."""
    return _good(frozenset(C), ones, xpar, n, nested_squares)

@lru_cache(None)
def _good(C, ones, xpar, n, nested_squares):
    out = set()
    if not C and ones == 1: out.add(ONE)
    if len(C) == 1 and ones == 0: out.add(('x', next(iter(C))))
    for C1 in subsets(C):
        C2 = C - C1
        for o1 in range(ones + 1):
            o2 = ones - o1
            if (not C1 and o1 == 0) or (not C2 and o2 == 0):
                continue  # both halves of a bracket must be nonempty words
            for u in _good(C1, o1, xpar, n, nested_squares):
                for v in _good(C2, o2, xpar, n, nested_squares):
                    ku, kv = word_key(u, n), word_key(v, n)
                    if ku > kv:
                        if u[0] == '{' and u != ONE and word_key(u[2], n) > kv:
                            continue  # condition (2): u2 <= v
                        out.add(('{', u, v))
                    elif nested_squares and u == v and par(u, xpar) == (0 if MODE == 'odd' else 1):
                        out.add(('{', u, u))
    return frozenset(out)

def M_words(C, ones, xpar, n, nested_squares=False):
    W = set(good_words(C, ones, xpar, n, nested_squares))
    # top-level squares {v,v} for even good v (only if content allows a double)
    if not nested_squares:
        # content must be C = C1 ∪ C1 with C1 ∩ C1 = ∅ -> only possible with C empty
        if not C and ones % 2 == 0:
            for v in good_words(frozenset(), ones // 2, xpar, n):
                if par(v, xpar) == (0 if MODE == 'odd' else 1):
                    W.add(('{', v, v))
    return W

def count_U(C, beta, xpar, n, nested_squares=False):
    """Number of U-elements (products of distinct-or-repeated M words) of component (C, beta).
    Multilinear in x, so an M word with x-content S appears at most once unless S is empty."""
    # M words of x-content S (nonempty) and any ones, with bracket count b = leaves-1
    C = frozenset(C)
    total = 0
    # enumerate multisets of M-words: choose a set partition of C into blocks (each block an M-word
    # with x-content = block), plus any multiset of x-free M-words (e.g. {1,1}, {{1,1},1}?, ...)
    # x-free M words: content empty, ones o, brackets o-1.
    def xfree_words(bmax):
        ws = []
        for o in range(2, bmax + 2):
            for w in M_words(frozenset(), o, xpar, n, nested_squares):
                ws.append(w)
        return ws
    xfree = xfree_words(beta)
    def brackets(w): return len(leaves(w)) - 1
    # count: for each set partition of C into blocks, for each choice of word per block, remaining
    # brackets filled with multiset of xfree words with parity constraint (odd words at most once).
    def set_partitions(s):
        s = list(s)
        if not s:
            yield []
            return
        first = s[0]
        for smaller in set_partitions(s[1:]):
            for i, blk in enumerate(smaller):
                yield smaller[:i] + [[first] + blk] + smaller[i + 1:]
            yield [[first]] + smaller
    # precompute multisets of xfree words with total brackets = k (as counts), returning number
    @lru_cache(None)
    def xfree_count(k, idx):
        if k == 0: return 1
        if idx >= len(xfree): return 0
        w = xfree[idx]; b = brackets(w); res = 0
        maxe = 1 if par(w, xpar) == 1 else k // b
        for e in range(0, maxe + 1):
            if e * b > k: break
            res += xfree_count(k - e * b, idx + 1)
        return res
    for part in set_partitions(sorted(C)):
        # each block -> M words of that content with ones o; ones free; brackets = |block|+o-1
        # choose for each block a word; total brackets sum <= beta
        choices = []
        for blk in part:
            opts = []
            for o in range(0, beta + 2):
                for w in M_words(frozenset(blk), o, xpar, n, nested_squares):
                    if brackets(w) <= beta:
                        opts.append(w)
            choices.append(opts)
        for combo in itertools.product(*choices):
            b = sum(brackets(w) for w in combo)
            if b > beta: continue
            total += xfree_count(beta - b, 0)
    return total

def count_M(C, ones, xpar, n, nested_squares=False):
    return len(M_words(frozenset(C), ones, xpar, n, nested_squares))

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    maxbeta = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    if len(sys.argv) > 3: MODE = sys.argv[3]
    if len(sys.argv) > 4: ORDER = sys.argv[4]
    print('MODE', MODE, 'ORDER', ORDER)
    for xpar in itertools.product([0, 1], repeat=n):
        xpar = tuple(xpar)
        print(f"=== n={n}, parities of x: {xpar}")
        C = frozenset(range(n))
        print("-- free odd Lie superalgebra (content = all x's, by #ones):")
        for ones in range(0, maxbeta + 1):
            beta = n + ones - 1
            if beta < 0: continue
            d = quotient_dim(C, beta, xpar, odd_lie_only=True)
            # restrict to bracket-only monomials with exactly `ones` ones: bracket-only words have
            # leaves = beta+1 = n + ones, so component (C, beta) is exactly #ones = ones.
            m1 = count_M(C, ones, xpar, n, False)
            m2 = count_M(C, ones, xpar, n, True)
            print(f"   ones={ones}: dim={d}  |M|={m1}  |M nested squares|={m2}")
        print("-- free unital generalized Gerstenhaber algebra, component (all x's, beta):")
        for beta in range(0, maxbeta + 1):
            d = quotient_dim(C, beta, xpar)
            u1 = count_U(C, beta, xpar, n, False)
            u2 = count_U(C, beta, xpar, n, True)
            print(f"   beta={beta}: dim={d}  |U|={u1}  |U nested squares|={u2}")
