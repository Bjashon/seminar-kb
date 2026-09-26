"""Exact symbolic check of Lemmas 6, 7, 8 of the note (the sign lemmas).

The model bracket (formulas (7), (8) of the paper) is implemented literally
inside a free supercommutative algebra with FORMAL symbols:
  g_1, g_2, ...        homogeneous factors (elements of L-hat), g_0 = 1 (unit)
  B(i,j) = {g_i, g_j}  the bracket of two factors, a new symbol of parity
                       |g_i|+|g_j|+1, subject only to odd skew-symmetry
                       {g_j,g_i} = -(-1)^{||g_i|| ||g_j||} {g_i,g_j}
                       (so {g_i,g_i} = 0 for odd g_i; {1,1} = B(0,0) is a
                       genuine odd symbol, as in the free algebra).
No Jacobi identity and no relation between different B's is used, so every
identity verified here holds in the actual model algebra S(L') of the paper
(the formal algebra maps onto it), for arbitrary factorizations.

Checked, for all numbers of factors m,n,p <= 3 and ALL parity assignments,
with exact integer coefficients:
  Lemma 6 (a) supersymmetry of D(a) and {a,b}* in the factors
          (b) removing a factor 1 changes nothing
          (i)  {u,v}* = {u,v}, D(u) = {1,u} on L-hat
          (ii) {1,a}* = D(a)
          (iii) D(bc) = D(b)c + (-1)^{|b|} b D(c) - D(1) bc
  Lemma 7 {a,b}* = -(-1)^{||a|| ||b||} {b,a}*
  Lemma 8 {a,bc}* = {a,b}* c + (-1)^{||a|| |b|} b {a,c}* + (-1)^{||a||} D(a) bc

Lemma 9 (the Jacobiator formula) needs brackets of brackets and is covered
by jacobiator_check.py instead.  Run:  python formal_identities_check.py
"""
import itertools, sys

sys.stdout.reconfigure(encoding="utf-8")


class FreeSuperComm:
    """Free supercommutative algebra over Z on the symbols ('g',i) and ('B',i,j)."""

    def __init__(self, gpar):
        self.gpar = dict(gpar)
        self.gpar[0] = 0  # the unit is even

    # -- parities ---------------------------------------------------------
    def par_sym(self, s):
        if s[0] == "g":
            return self.gpar[s[1]]
        return (self.gpar[s[1]] + self.gpar[s[2]] + 1) % 2

    def par_factors(self, A):
        return sum(self.gpar[i] for i in A) % 2

    def shifted(self, i):  # ||g_i|| = |g_i| + 1
        return (self.gpar[i] + 1) % 2

    # -- arithmetic -------------------------------------------------------
    def mul_mono(self, m1, m2):
        seq = [(s, self.par_sym(s)) for s in m1 + m2]
        sign = 1
        for i in range(1, len(seq)):  # insertion sort with the Koszul sign
            j = i
            while j > 0 and seq[j - 1][0] > seq[j][0]:
                if seq[j - 1][1] and seq[j][1]:
                    sign = -sign
                seq[j - 1], seq[j] = seq[j], seq[j - 1]
                j -= 1
        for k in range(1, len(seq)):
            if seq[k][0] == seq[k - 1][0] and seq[k][1]:
                return None, 0  # odd symbol squared
        return tuple(s for s, _ in seq), sign

    def mul(self, x, y):
        out = {}
        for m1, c1 in x.items():
            for m2, c2 in y.items():
                m, s = self.mul_mono(m1, m2)
                if s:
                    out[m] = out.get(m, 0) + s * c1 * c2
        return {m: c for m, c in out.items() if c}

    @staticmethod
    def add(x, y, c=1):
        out = dict(x)
        for m, v in y.items():
            out[m] = out.get(m, 0) + c * v
        return {m: v for m, v in out.items() if v}

    @staticmethod
    def scal(x, c):
        return {m: c * v for m, v in x.items()} if c else {}

    def one(self):
        return {(): 1}

    def gen(self, i):
        return self.one() if i == 0 else {(("g", i),): 1}

    def prod(self, A):
        x = self.one()
        for i in A:
            x = self.mul(x, self.gen(i))
        return x

    # -- the bracket on L-hat (formal, only skew-symmetry imposed) -------
    def br(self, i, j):
        if i > j:
            return self.scal(self.br(j, i), -((-1) ** (self.shifted(i) * self.shifted(j))))
        if i == j and self.gpar[i] == 1:
            return {}
        return {(("B", i, j),): 1}

    # -- formulas (7) and (8) of the paper -------------------------------
    def D(self, A):
        m = len(A)
        total = {}
        for i in range(m):
            sgn = (-1) ** self.par_factors(A[:i])
            term = self.mul(self.mul(self.prod(A[:i]), self.br(0, A[i])), self.prod(A[i + 1:]))
            total = self.add(total, term, sgn)
        total = self.add(total, self.mul(self.br(0, 0), self.prod(A)), -(m - 1))
        return total

    def bracket_star(self, A, B):
        m, n = len(A), len(B)
        res = {}
        for i in range(m):
            for j in range(n):
                sgn = (-1) ** (self.gpar[A[i]] * self.par_factors(A[i + 1:]) + self.gpar[B[j]] * self.par_factors(B[:j]))
                term = self.mul(self.mul(self.prod(A[:i] + A[i + 1:]), self.br(A[i], B[j])), self.prod(B[:j] + B[j + 1:]))
                res = self.add(res, term, sgn)
        a, b = self.prod(A), self.prod(B)
        res = self.add(res, self.mul(a, self.D(B)), -(m - 1))
        res = self.add(res, self.mul(self.D(A), b), (n - 1) * (-1) ** ((self.par_factors(A) + 1) % 2))
        res = self.add(res, self.mul(self.mul(a, self.br(0, 0)), b), -(m - 1) * (n - 1))
        return res


def check():
    failures = []
    cases = 0

    def expect(name, x, y):
        nonlocal cases
        cases += 1
        if x != y:
            failures.append(name)

    for m, n, p in itertools.product([1, 2, 3], repeat=3):
        k = m + n + p
        for pars in itertools.product([0, 1], repeat=k):
            alg = FreeSuperComm({i + 1: pars[i] for i in range(k)})
            A = list(range(1, m + 1))
            B = list(range(m + 1, m + n + 1))
            C = list(range(m + n + 1, k + 1))
            ab = alg.bracket_star(A, B)
            tag = f"m={m},n={n},p={p},pars={pars}"

            # Lemma 6 (a): supersymmetry in the factors
            for pos in range(m - 1):
                A2 = A[:pos] + [A[pos + 1], A[pos]] + A[pos + 2:]
                s = (-1) ** (alg.gpar[A[pos]] * alg.gpar[A[pos + 1]])
                expect("6a bracket in a " + tag, alg.bracket_star(A2, B), alg.scal(ab, s))
                expect("6a D " + tag, alg.D(A2), alg.scal(alg.D(A), s))
            for pos in range(n - 1):
                B2 = B[:pos] + [B[pos + 1], B[pos]] + B[pos + 2:]
                s = (-1) ** (alg.gpar[B[pos]] * alg.gpar[B[pos + 1]])
                expect("6a bracket in b " + tag, alg.bracket_star(A, B2), alg.scal(ab, s))
            # Lemma 6 (b): removing a unit factor
            expect("6b a " + tag, alg.bracket_star(A + [0], B), ab)
            expect("6b b " + tag, alg.bracket_star(A, B + [0]), ab)
            expect("6b D " + tag, alg.D(A + [0]), alg.D(A))
            expect("6b D(1) " + tag, alg.D([0]), alg.br(0, 0))
            # Lemma 6 (i), (ii)
            expect("6i " + tag, alg.bracket_star([A[0]], [B[0]]), alg.br(A[0], B[0]))
            expect("6i D " + tag, alg.D([A[0]]), alg.br(0, A[0]))
            expect("6ii " + tag, alg.bracket_star([0], B), alg.D(B))
            # Lemma 6 (iii)
            b, c = alg.prod(B), alg.prod(C)
            rhs = alg.add(alg.mul(alg.D(B), c), alg.mul(b, alg.D(C)), (-1) ** alg.par_factors(B))
            rhs = alg.add(rhs, alg.mul(alg.mul(alg.br(0, 0), b), c), -1)
            expect("6iii " + tag, alg.D(B + C), rhs)
            # Lemma 7: odd skew-symmetry
            sa, sb = (alg.par_factors(A) + 1) % 2, (alg.par_factors(B) + 1) % 2
            expect("7 " + tag, alg.add(ab, alg.bracket_star(B, A), (-1) ** (sa * sb)), {})
            # Lemma 8: generalized odd Leibniz rule
            lhs = alg.bracket_star(A, B + C)
            rhs = alg.mul(ab, c)
            rhs = alg.add(rhs, alg.mul(b, alg.bracket_star(A, C)), (-1) ** (sa * alg.par_factors(B)))
            rhs = alg.add(rhs, alg.mul(alg.mul(alg.D(A), b), c), (-1) ** sa)
            expect("8 " + tag, lhs, rhs)

    print(f"{cases} identities checked (m,n,p <= 3 factors, all parities, exact integer arithmetic)")
    if failures:
        print("FAILED:", len(failures))
        for f in failures[:20]:
            print("  ", f)
        return 1
    print("ALL OK: Lemmas 6, 7, 8 hold as formal identities")
    return 0


if __name__ == "__main__":
    raise SystemExit(check())
