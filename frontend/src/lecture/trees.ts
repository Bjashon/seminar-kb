// Bracket monomials of a free Lie algebra as binary trees: parsing, the
// unordered shape of a bracket arrangement, expansion into associative words
// (so that equality in the free Lie algebra can be decided), coordinates in
// the left-normed basis, and the simple invariants of a shape. Used by the
// course on problem 2.6 (labs/brackets.ts); checked against the Python
// results by projects/monomial-identities/checks/trees.test.mjs -- run it
// again (node .../trees.test.mjs . from the repo root) if this file changes.

/** A labelled monomial: a letter or a bracket of two monomials. */
export type Tree = string | [Tree, Tree];
/** A bracket arrangement without letters, children in canonical order. */
export type Shape = "x" | [Shape, Shape];
export interface Term { c: number; t: Tree }
/** word (letters joined by a space) -> coefficient */
export type Words = Map<string, number>;

export const MAX_LETTERS = 11; // 2^10 words per monomial: instant

// ---------- parsing ----------
class Reader {
  i = 0;
  src: string;
  constructor(src: string) { this.src = src; }
  skip() { while (this.i < this.src.length && /\s/.test(this.src[this.i])) this.i++; }
  peek(): string { this.skip(); return this.src[this.i] ?? ""; }
  fail(what: string): never { throw new Error(`${what} (позиция ${this.i + 1})`); }
  tree(): Tree {
    const ch = this.peek();
    if (ch === "[") {
      this.i++;
      const a = this.tree();
      if (this.peek() !== ",") this.fail("В скобке нужна запятая: [u,v]");
      this.i++;
      const b = this.tree();
      if (this.peek() !== "]") this.fail("Не закрыта скобка ]");
      this.i++;
      return [a, b];
    }
    const m = /^[a-zA-Z][0-9]*/.exec(this.src.slice(this.i));
    if (!m) return this.fail(ch ? `Не понимаю символ «${ch}»: нужна буква или скобка [u,v]` : "Выражение оборвалось");
    this.i += m[0].length;
    return m[0];
  }
}

export function parseTree(src: string): Tree {
  const r = new Reader(src);
  const t = r.tree();
  if (r.peek()) r.fail(`Лишний символ «${r.peek()}» после одночлена`);
  return t;
}

/** "2[[a,b],c] - [a,[b,c]]" -> terms. */
export function parsePoly(src: string): Term[] {
  const r = new Reader(src.replace(/−/g, "-"));
  const out: Term[] = [];
  if (!r.peek()) throw new Error("Пустое выражение");
  let first = true;
  while (r.peek()) {
    let sign = 1;
    const ch = r.peek();
    if (ch === "+" || ch === "-") { sign = ch === "-" ? -1 : 1; r.i++; } else if (!first) r.fail("Между одночленами нужен знак + или −");
    let c = 1;
    r.skip();
    const num = /^[0-9]+/.exec(r.src.slice(r.i));
    if (num) { c = Number(num[0]); r.i += num[0].length; if (r.peek() === "*") r.i++; }
    out.push({ c: sign * c, t: r.tree() });
    first = false;
  }
  return out;
}

// ---------- trees and shapes ----------
export const isLeaf = (t: Tree | Shape): t is string => typeof t === "string";
export function size(t: Tree | Shape): number { return isLeaf(t) ? 1 : size(t[0]) + size(t[1]); }
export function letters(t: Tree): string[] { return isLeaf(t) ? [t] : [...letters(t[0]), ...letters(t[1])]; }
export function showTree(t: Tree): string { return isLeaf(t) ? t : "[" + showTree(t[0]) + "," + showTree(t[1]) + "]"; }
export function showShape(s: Shape): string { return isLeaf(s) ? "x" : "[" + showShape(s[0]) + "," + showShape(s[1]) + "]"; }

// The same order as in the Python scripts: by size, then by the string.
function before(a: Shape, b: Shape): boolean {
  const sa = size(a), sb = size(b);
  return sa !== sb ? sa < sb : showShape(a) <= showShape(b);
}
function pair(a: Shape, b: Shape): Shape { return before(a, b) ? [a, b] : [b, a]; }
export function shapeOf(t: Tree | Shape): Shape { return isLeaf(t) ? "x" : pair(shapeOf(t[0]), shapeOf(t[1])); }
export function parseShape(src: string): Shape { return shapeOf(parseTree(src)); }

const shapeCache = new Map<number, Shape[]>();
/** All bracket arrangements on n letters (their number is the Wedderburn-Etherington number). */
export function allShapes(n: number): Shape[] {
  const hit = shapeCache.get(n);
  if (hit) return hit;
  let out: Shape[];
  if (n === 1) out = ["x"];
  else {
    const seen = new Map<string, Shape>();
    for (let i = 1; i <= Math.floor(n / 2); i++) {
      for (const a of allShapes(i)) for (const b of allShapes(n - i)) { const s = pair(a, b); seen.set(showShape(s), s); }
    }
    out = [...seen.values()].sort((a, b) => (showShape(a) < showShape(b) ? -1 : showShape(a) > showShape(b) ? 1 : 0));
  }
  shapeCache.set(n, out);
  return out;
}

/** Depth of the deepest leaf. */
export function height(s: Shape): number { return isLeaf(s) ? 0 : 1 + Math.max(height(s[0]), height(s[1])); }
/** Horton-Strahler number: leaf 0; equal children d, d -> d+1; otherwise the larger one. */
export function strahler(s: Shape): number {
  if (isLeaf(s)) return 0;
  const a = strahler(s[0]), b = strahler(s[1]);
  return a === b ? a + 1 : Math.max(a, b);
}
/** Number of symmetries of the shape: a factor 2 for every node with two equal children. */
export function autOrder(s: Shape): number {
  if (isLeaf(s)) return 1;
  return autOrder(s[0]) * autOrder(s[1]) * (showShape(s[0]) === showShape(s[1]) ? 2 : 1);
}
export function factorial(n: number): number { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; }
/** Number of different monomials of this shape on n given letters, up to sign. */
export function monomialCount(s: Shape): number { return factorial(size(s)) / autOrder(s); }

function combSize(s: Shape): number | null { // [x,[x,[x,x]]] -> 4
  if (isLeaf(s)) return 1;
  if (!isLeaf(s[0])) return null;
  const rest = combSize(s[1]);
  return rest === null ? null : rest + 1;
}
function completeDepth(s: Shape): number | null { // [[x,x],[x,x]] -> 2
  if (isLeaf(s)) return 0;
  if (showShape(s[0]) !== showShape(s[1])) return null;
  const d = completeDepth(s[0]);
  return d === null ? null : d + 1;
}
/** The verbal ideal of the shape in TeX: F for a letter, commutators of ideals for brackets. */
export function idealTeX(s: Shape): string {
  if (isLeaf(s)) return "F";
  const d = completeDepth(s);
  if (d !== null) return d <= 3 ? "F" + "'".repeat(d) : `F^{(${d})}`;
  const k = combSize(s);
  if (k !== null) return `\\gamma_{${k}}`;
  return `[${idealTeX(s[0])},${idealTeX(s[1])}]`;
}
/** What the identity of this shape is called, when it has a classical name. */
export function classicalName(s: Shape): string | null {
  const n = size(s);
  const d = completeDepth(s);
  if (n === 2) return "абелевы алгебры (нулевое умножение)";
  if (d !== null && d === 2) return "метабелевы алгебры";
  if (d !== null && d > 2) return `разрешимые алгебры ступени не выше ${d}`;
  if (combSize(s) !== null) return `нильпотентные алгебры ступени не выше ${n - 1}`;
  if (showShape(s) === "[x,[[x,x],[x,x]]]") return "центр-метабелевы алгебры: второй коммутант лежит в центре";
  return null;
}
/** The shape with letters x_1, x_2, ... in TeX. */
export function monomialTeX(s: Shape): string {
  let i = 0;
  const go = (t: Shape): string => (isLeaf(t) ? `x_{${++i}}` : `[${go(t[0])},${go(t[1])}]`);
  return go(s);
}

// ---------- expansion into associative words ----------
const key = (w: string[]) => w.join(" ");
function add(m: Words, k: string, c: number) {
  const v = (m.get(k) ?? 0) + c;
  if (v === 0) m.delete(k); else m.set(k, v);
}
/** [u,v] = uv - vu, all the way down: 2^(n-1) words for n different letters. */
export function expand(t: Tree): Words {
  if (isLeaf(t)) return new Map([[t, 1]]);
  const a = expand(t[0]), b = expand(t[1]);
  const out: Words = new Map();
  for (const [u, cu] of a) for (const [v, cv] of b) { add(out, u + " " + v, cu * cv); add(out, v + " " + u, -cu * cv); }
  return out;
}
export function expandPoly(p: Term[]): Words {
  const out: Words = new Map();
  for (const { c, t } of p) for (const [w, cw] of expand(t)) add(out, w, c * cw);
  return out;
}
/** Every letter exactly once in every term, and the same letters in all terms. */
export function multilinearLetters(p: Term[]): string[] | null {
  let ref: string | null = null;
  for (const { t } of p) {
    const ls = letters(t).slice().sort();
    if (new Set(ls).size !== ls.length) return null;
    if (ref === null) ref = key(ls); else if (ref !== key(ls)) return null;
  }
  return ref === null ? null : ref.split(" ");
}

export function leftNormedTree(ls: string[]): Tree { return ls.slice(1).reduce<Tree>((acc, l) => [acc, l], ls[0]); }
/** Coordinates of a multilinear Lie polynomial in the basis [z, y_1, ..., y_k]
 *  (left-normed, z fixed in the first place): the coefficient of
 *  [z, y_1, ..., y_k] is the coefficient of the word z y_1 ... y_k. */
export function leftNormed(p: Term[], z?: string): { first: string; terms: { c: number; word: string[] }[] } {
  const ls = multilinearLetters(p);
  if (!ls) throw new Error("Нужен полилинейный многочлен: в каждом одночлене каждая буква ровно один раз и набор букв один и тот же");
  const first = z ?? ls[0];
  if (!ls.includes(first)) throw new Error(`Буквы ${first} нет в многочлене`);
  const terms: { c: number; word: string[] }[] = [];
  for (const [w, c] of expandPoly(p)) { const word = w.split(" "); if (word[0] === first) terms.push({ c, word }); }
  terms.sort((a, b) => (key(a.word) < key(b.word) ? -1 : 1));
  return { first, terms };
}

/** The path from the letter z to the root: T = sign * [..[[z,u_1],u_2]..,u_k],
 *  and the words of T that start with z are exactly sign * z * u_1 * ... * u_k
 *  (each u_i expanded). */
export function spine(t: Tree, z: string): { sign: number; factors: Tree[] } | null {
  if (isLeaf(t)) return t === z ? { sign: 1, factors: [] } : null;
  const inLeft = spine(t[0], z);
  if (inLeft) return { sign: inLeft.sign, factors: [...inLeft.factors, t[1]] };
  const inRight = spine(t[1], z);
  if (inRight) return { sign: -inRight.sign, factors: [...inRight.factors, t[0]] };
  return null;
}

// ---------- drawing ----------
/** The shape as a small SVG tree: root on top, leaves as dots. */
export function drawShape(s: Shape, dx = 13, dy = 13): string {
  const pad = 6;
  const lines: string[] = [], dots: string[] = [];
  let nextLeaf = 0;
  const place = (t: Shape, depth: number): number => {
    const y = pad + depth * dy;
    if (isLeaf(t)) {
      const x = pad + nextLeaf++ * dx;
      dots.push(`<circle cx="${x}" cy="${y}" r="2.3"/>`);
      return x;
    }
    const xa = place(t[0], depth + 1), xb = place(t[1], depth + 1);
    const x = (xa + xb) / 2;
    lines.push(`<path d="M${xa} ${y + dy}L${x} ${y}L${xb} ${y + dy}"/>`);
    return x;
  };
  place(s, 0);
  const w = pad * 2 + (size(s) - 1) * dx, h = pad * 2 + height(s) * dy;
  return `<svg class="shape-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${showShape(s)}">` +
    `<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">${lines.join("")}</g><g fill="currentColor">${dots.join("")}</g></svg>`;
}
