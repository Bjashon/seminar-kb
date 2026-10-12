// Checks lecture/trees.ts against the Python results (atlas.json) and against identities
// of the free Lie algebra. Run: node trees.test.mjs <repo root>
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const root = process.argv[2];
const T = await import(pathToFileURL(join(root, "frontend/src/lecture/trees.ts")).href);
const atlas = JSON.parse(readFileSync(join(root, "projects/monomial-identities/checks/atlas.json"), "utf8"));
let fails = 0;
const ok = (cond, what) => { if (!cond) { fails++; console.log("FAIL:", what); } };

// 1. shapes: same list, same order as Python; Wedderburn-Etherington numbers
const WE = [0, 1, 1, 1, 2, 3, 6, 11, 23, 46, 98, 207, 451];
for (let n = 1; n <= 12; n++) ok(T.allShapes(n).length === WE[n], `number of shapes n=${n}: ${T.allShapes(n).length}`);
for (const [n, level] of Object.entries(atlas)) {
  const mine = T.allShapes(+n).map(T.showShape);
  ok(JSON.stringify(mine) === JSON.stringify(level.shapes.map((s) => s.s)), `shape list n=${n}`);
  for (const s of level.shapes) {
    const sh = T.parseShape(s.s);
    ok(T.showShape(sh) === s.s, `canonical form ${s.s}`);
    ok(s.dim <= T.monomialCount(sh), `dim <= number of monomials ${s.s}`);
    ok(s.dim <= level.lie, "dim <= (n-1)!");
  }
}
// 2. expansion: 2^(n-1) words, all +-1, for every shape up to 8 letters
const abc = "abcdefghijk";
const label = (s, it) => (s === "x" ? it.next().value : [label(s[0], it), label(s[1], it)]);
for (let n = 1; n <= 8; n++) for (const s of T.allShapes(n)) {
  const t = label(s, abc[Symbol.iterator]());
  const w = T.expand(t);
  ok(w.size === 2 ** (n - 1) && [...w.values()].every((c) => Math.abs(c) === 1), `expansion of ${T.showTree(t)}`);
  ok(T.showShape(T.shapeOf(t)) === T.showShape(s), "shapeOf");
  // 3. left-normed coordinates reproduce the element
  const ln = T.leftNormed([{ c: 1, t }]);
  const back = T.expandPoly(ln.terms.map((x) => ({ c: x.c, t: T.leftNormedTree(x.word) })));
  const diff = T.expandPoly([{ c: 1, t }, ...ln.terms.map((x) => ({ c: -x.c, t: T.leftNormedTree(x.word) }))]);
  ok(diff.size === 0 && back.size === w.size, `left-normed coordinates of ${T.showTree(t)}`);
  // 4. spine: words starting with z are sign * z * u_1 * ... * u_k
  for (const z of T.letters(t)) {
    const sp = T.spine(t, z);
    let prod = new Map([[z, sp.sign]]);
    for (const u of sp.factors) {
      const next = new Map();
      for (const [p, cp] of prod) for (const [q, cq] of T.expand(u)) next.set(p + " " + q, cp * cq);
      prod = next;
    }
    const lead = new Map([...w].filter(([k]) => k.split(" ")[0] === z));
    ok(lead.size === prod.size && [...lead].every(([k, c]) => prod.get(k) === c), `spine of ${z} in ${T.showTree(t)}`);
  }
}
// 5. identities
const zero = (src) => T.expandPoly(T.parsePoly(src)).size === 0;
ok(zero("[[a,b],c] + [[b,c],a] + [[c,a],b]"), "Jacobi");
ok(zero("[a,b] + [b,a]"), "antisymmetry");
ok(zero("[[a,b],[c,d]] - [[[a,b],c],d] + [[[a,b],d],c]"), "[[a,b],[c,d]] via left-normed");
ok(!zero("[[a,b],c] - [a,[b,c]]"), "non-associativity");
ok(zero("2[[a,b],c] - [[a,b],c] − [[a,b],c]"), "coefficients and the long minus");
// 6. invariants
const sh = (s) => T.parseShape(s);
ok(T.height(sh("[x,[x,[x,x]]]")) === 3 && T.strahler(sh("[x,[x,[x,x]]]")) === 1, "comb invariants");
ok(T.height(sh("[[x,x],[x,x]]")) === 2 && T.strahler(sh("[[x,x],[x,x]]")) === 2 && T.autOrder(sh("[[x,x],[x,x]]")) === 8, "balanced invariants");
ok(T.strahler(sh("[x,[[x,x],[x,x]]]")) === 2 && T.strahler(sh("[[x,x],[x,[x,[x,x]]]]")) === 2, "Strahler");
const P = sh("[[x,x],[x,[x,[x,x]]]]"), Q = sh("[x,[x,[[x,x],[x,x]]]]");
ok(T.height(P) === 4 && T.height(Q) === 4 && T.strahler(Q) === 2, "the n=6 pair has equal height and Strahler number");
ok(T.idealTeX(sh("[[x,x],[x,[x,x]]]")) === "[F',\\gamma_{3}]" && T.idealTeX(sh("[x,[[x,x],[x,x]]]")) === "[F,F'']" && T.idealTeX(sh("[x,[x,x]]")) === "\\gamma_{3}", "ideal names: " + T.idealTeX(sh("[[x,x],[x,[x,x]]]")));
ok(T.monomialCount(sh("[[x,x],[x,x]]")) === 3 && T.monomialCount(sh("[x,[x,[x,x]]]")) === 12, "monomial counts");
// 7. parser errors are errors
for (const bad of ["[a,b", "[a b]", "a b", "[a,b]]", "", "[a,,b]", "[a,b] [c,d]"]) {
  let threw = false;
  try { T.parsePoly(bad); } catch { threw = true; }
  ok(threw, `parser must reject «${bad}»`);
}
ok(T.drawShape(sh("[[x,x],[x,x]]")).startsWith("<svg"), "drawing");
console.log(fails ? `${fails} FAILED` : "all tree checks passed");
process.exit(fails ? 1 : 0);
