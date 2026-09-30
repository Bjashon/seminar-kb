// Superpolynomials with the Buttin and Cantarini–Kac brackets, and Hall
// ("good") words -- the math behind the lecture's calculators. Checked
// against identities (3)-(5) of the paper on random elements.

// ===== Superpolynomials: even x1..x3, odd ξ1..ξ3 and τ =====
// A monomial is x^a ξ_S with S a strictly increasing list of odd indices
// (0,1,2 = ξ1,ξ2,ξ3; 3 = τ). A polynomial maps monomial keys to integer
// coefficients.
export type Poly = Map<string, number>;
interface Mono { a: number[]; S: number[] }

const NX = 3, TAU = 3;
function mkey(a: number[], S: number[]): string { return a.join(",") + "|" + S.join(","); }
function parseKey(k: string): Mono {
  const [xs, ss] = k.split("|");
  return { a: xs.split(",").map(Number), S: ss === "" ? [] : ss.split(",").map(Number) };
}
function P(): Poly { return new Map(); }
function addTerm(p: Poly, a: number[], S: number[], c: number): Poly {
  if (!c) return p;
  const k = mkey(a, S);
  const v = (p.get(k) || 0) + c;
  if (v === 0) p.delete(k); else p.set(k, v);
  return p;
}
export function pconst(c: number): Poly { return addTerm(P(), [0, 0, 0], [], c); }
function pvarX(i: number): Poly { const a = [0, 0, 0]; a[i] = 1; return addTerm(P(), a, [], 1); }
function pvarO(j: number): Poly { return addTerm(P(), [0, 0, 0], [j], 1); }
export function padd(p: Poly, q: Poly, s = 1): Poly {
  const r: Poly = new Map(p);
  for (const [k, c] of q) { const { a, S } = parseKey(k); addTerm(r, a, S, s * c); }
  return r;
}
export function pscale(p: Poly, s: number): Poly {
  const r = P();
  for (const [k, c] of p) { const { a, S } = parseKey(k); addTerm(r, a, S, s * c); }
  return r;
}
// Product of odd lists: concatenate, sort by adjacent swaps counting the sign; repeated index -> 0.
function mergeOdd(S: number[], T: number[]): { S: number[]; sign: number } | null {
  const seen = new Set(S);
  for (const t of T) if (seen.has(t)) return null;
  const arr = S.concat(T);
  let sign = 1;
  for (let i = 0; i < arr.length; i++)
    for (let j = 0; j < arr.length - 1 - i; j++)
      if (arr[j] > arr[j + 1]) { const t = arr[j]; arr[j] = arr[j + 1]; arr[j + 1] = t; sign = -sign; }
  return { S: arr, sign };
}
export function pmul(p: Poly, q: Poly): Poly {
  const r = P();
  for (const [k1, c1] of p) {
    const m1 = parseKey(k1);
    for (const [k2, c2] of q) {
      const m2 = parseKey(k2);
      const mo = mergeOdd(m1.S, m2.S);
      if (!mo) continue;
      addTerm(r, m1.a.map((v, i) => v + m2.a[i]), mo.S, mo.sign * c1 * c2);
    }
  }
  return r;
}
function ppow(p: Poly, n: number): Poly { let r = pconst(1); for (let i = 0; i < n; i++) r = pmul(r, p); return r; }
function dX(p: Poly, i: number): Poly {
  const r = P();
  for (const [k, c] of p) { const { a, S } = parseKey(k); if (a[i] > 0) { const b = a.slice(); b[i]--; addTerm(r, b, S, c * a[i]); } }
  return r;
}
// Left derivative in an odd variable: ∂/∂ξ_j (ξ_{s1}...ξ_{sk}) = (-1)^{r-1} (omit ξ_j) if j = s_r.
function dO(p: Poly, j: number): Poly {
  const r = P();
  for (const [k, c] of p) {
    const { a, S } = parseKey(k);
    const pos = S.indexOf(j);
    if (pos >= 0) addTerm(r, a, S.slice(0, pos).concat(S.slice(pos + 1)), (pos % 2 ? -1 : 1) * c);
  }
  return r;
}
function parityPart(p: Poly, par: number): Poly {
  const r = P();
  for (const [k, c] of p) { const { a, S } = parseKey(k); if (S.length % 2 === par) addTerm(r, a, S, c); }
  return r;
}
export function isZero(p: Poly): boolean { return p.size === 0; }
/** 0 or 1, or null if the polynomial is zero or inhomogeneous. */
export function homParity(p: Poly): number | null {
  let par: number | null = null;
  for (const k of p.keys()) {
    const q = parseKey(k).S.length % 2;
    if (par === null) par = q; else if (par !== q) return null;
  }
  return par;
}
// Euler operator E = Σ (x_i ∂/∂x_i + ξ_i ∂/∂ξ_i), i = 1..n (τ not counted).
function euler(p: Poly): Poly {
  const r = P();
  for (const [k, c] of p) {
    const { a, S } = parseKey(k);
    const d = a.reduce((s, v) => s + v, 0) + S.filter((t) => t !== TAU).length;
    addTerm(r, a, S, c * d);
  }
  return r;
}
// Buttin bracket {f,g}_H = Σ_i (∂f/∂x_i ∂g/∂ξ_i + (-1)^{p(f)} ∂f/∂ξ_i ∂g/∂x_i), bilinear.
function buttinHom(f: Poly, g: Poly, pf: number): Poly {
  let r = P();
  for (let i = 0; i < NX; i++) {
    r = padd(r, pmul(dX(f, i), dO(g, i)));
    r = padd(r, pscale(pmul(dO(f, i), dX(g, i)), pf ? -1 : 1));
  }
  return r;
}
// Cantarini–Kac PO(n,n+1): {f,g}_K = {f,g}_H + (E-2)(f) ∂g/∂τ + (-1)^{p(f)} ∂f/∂τ (E-2)(g).
function kHom(f: Poly, g: Poly, pf: number): Poly {
  const Em2 = (h: Poly) => padd(euler(h), pscale(h, -2));
  let r = buttinHom(f, g, pf);
  r = padd(r, pmul(Em2(f), dO(g, TAU)));
  r = padd(r, pscale(pmul(dO(f, TAU), Em2(g)), pf ? -1 : 1));
  return r;
}
export function bracket(f: Poly, g: Poly, mode: "H" | "K"): Poly {
  const hom = mode === "K" ? kHom : buttinHom;
  let r = P();
  for (const pf of [0, 1]) { const fp = parityPart(f, pf); if (!isZero(fp)) r = padd(r, hom(fp, g, pf)); }
  return r;
}

// ---- parser: integers, x1..x3, ξ1..ξ3 (also xi1, s1), τ (also tau, t), + - * ^ ( ), implicit product
type Tok = { t: "num"; v: number } | { t: "var"; odd: boolean; i: number } | { t: "+" | "-" | "*" | "^" | "(" | ")" };
const SUB: Record<string, string> = { "₁": "1", "₂": "2", "₃": "3" };
function tokenize(src: string): Tok[] {
  const s = src.replace(/·|⋅|×/g, "*").replace(/−/g, "-").replace(/\s+/g, "");
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[0-9]/.test(ch)) { let j = i; while (j < s.length && /[0-9]/.test(s[j])) j++; toks.push({ t: "num", v: Number(s.slice(i, j)) }); i = j; continue; }
    if ("+-*^()".includes(ch)) { toks.push({ t: ch as "+" }); i++; continue; }
    const rest = s.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^(?:ξ|xi|s)([1-3₁₂₃])/))) { toks.push({ t: "var", odd: true, i: Number(SUB[m[1]] || m[1]) - 1 }); i += m[0].length; continue; }
    if ((m = rest.match(/^x([1-3₁₂₃])/))) { toks.push({ t: "var", odd: false, i: Number(SUB[m[1]] || m[1]) - 1 }); i += m[0].length; continue; }
    if ((m = rest.match(/^(?:τ|tau|t)/))) { toks.push({ t: "var", odd: true, i: TAU }); i += m[0].length; continue; }
    throw new Error("Не понимаю символ «" + ch + "» (позиция " + (i + 1) + ")");
  }
  return toks;
}
export function parse(src: string): Poly {
  const toks = tokenize(src);
  let pos = 0;
  const peek = (): Tok | undefined => toks[pos];
  function expr(): Poly {
    let sign = 1;
    const first = peek();
    if (first && (first.t === "+" || first.t === "-")) { if (first.t === "-") sign = -1; pos++; }
    let r = pscale(term(), sign);
    for (let tk = peek(); tk && (tk.t === "+" || tk.t === "-"); tk = peek()) { const s = tk.t === "-" ? -1 : 1; pos++; r = padd(r, term(), s); }
    return r;
  }
  function term(): Poly {
    let r = power();
    for (let tk = peek(); tk && (tk.t === "*" || tk.t === "num" || tk.t === "var" || tk.t === "("); tk = peek()) { if (tk.t === "*") pos++; r = pmul(r, power()); }
    return r;
  }
  function power(): Poly {
    let b = atom();
    const tk = peek();
    if (tk && tk.t === "^") {
      pos++;
      const e = peek();
      if (!e || e.t !== "num") throw new Error("После ^ нужна степень-число");
      pos++;
      if (e.v > 12) throw new Error("Слишком большая степень");
      b = ppow(b, e.v);
    }
    return b;
  }
  function atom(): Poly {
    const tk = peek();
    if (!tk) throw new Error("Выражение оборвалось");
    if (tk.t === "num") { pos++; return pconst(tk.v); }
    if (tk.t === "var") { pos++; return tk.odd ? pvarO(tk.i) : pvarX(tk.i); }
    if (tk.t === "(") {
      pos++;
      const r = expr();
      const close = peek();
      if (!close || close.t !== ")") throw new Error("Не хватает «)»");
      pos++;
      return r;
    }
    if (tk.t === "-") { pos++; return pscale(atom(), -1); }
    throw new Error("Неожиданный символ «" + tk.t + "»");
  }
  if (!toks.length) throw new Error("Пустое выражение");
  const r = expr();
  if (pos < toks.length) throw new Error("Лишний символ «" + toks[pos].t + "»");
  return r;
}
// ---- TeX output, terms in a stable order
function monoTeX(a: number[], S: number[]): string {
  let s = "";
  a.forEach((e, i) => { if (e) s += "x_" + (i + 1) + (e > 1 ? "^{" + e + "}" : ""); });
  S.forEach((j) => { s += j === TAU ? "\\tau " : "\\xi_" + (j + 1); });
  return s;
}
export function toTeX(p: Poly): string {
  if (isZero(p)) return "0";
  const terms = [...p.entries()].map(([k, c]) => ({ ...parseKey(k), c }));
  terms.sort((u, v) => {
    const du = u.a.reduce((s, x) => s + x, 0) + u.S.length, dv = v.a.reduce((s, x) => s + x, 0) + v.S.length;
    if (du !== dv) return dv - du;
    const ku = mkey(u.a, u.S), kv = mkey(v.a, v.S);
    return ku < kv ? 1 : ku > kv ? -1 : 0;
  });
  let out = "";
  terms.forEach((t, idx) => {
    const m = monoTeX(t.a, t.S);
    const abs = Math.abs(t.c);
    const coef = m === "" ? String(abs) : abs === 1 ? "" : String(abs);
    out += (t.c < 0 ? (idx ? " - " : "-") : (idx ? " + " : "")) + coef + m;
  });
  return out;
}

// ===== Good words (Hall basic commutators) =====
// Letter 0 is the unit 1, letters 1..n are x_1..x_n; 1 < x_1 < x_2 < ...
export type Word = { deg: 1; l: number } | { deg: number; u: Word; v: Word };
const isLeaf = (w: Word): w is { deg: 1; l: number } => "l" in w;
function leaf(l: number): Word { return { l, deg: 1 }; }
function node(u: Word, v: Word): Word { return { u, v, deg: u.deg + v.deg }; }
export function cmpW(w: Word, z: Word): number {
  if (w.deg !== z.deg) return w.deg - z.deg;
  if (isLeaf(w) && isLeaf(z)) return w.l - z.l;
  if (isLeaf(w) || isLeaf(z)) return 0; // same degree: never happens
  const c = cmpW(w.u, z.u);
  return c !== 0 ? c : cmpW(w.v, z.v);
}
/** |w|: the letters' parities plus one per bracket. */
export function wordParity(w: Word, par: number[]): number {
  if (isLeaf(w)) return par[w.l];
  return (wordParity(w.u, par) + wordParity(w.v, par) + 1) % 2;
}
/** Good words by degree: result[d] lists those of degree d (result[0] is empty). */
export function goodWords(letters: number[], maxDeg: number): Word[][] {
  const byDeg: Word[][] = [[], letters.map(leaf).sort(cmpW)];
  for (let n = 2; n <= maxDeg; n++) {
    const out: Word[] = [];
    for (let p = n - 1; p >= 1; p--) {
      const q = n - p;
      if (q > p) continue;
      for (const u of byDeg[p]) for (const v of byDeg[q]) {
        if (cmpW(u, v) <= 0) continue;
        if (!isLeaf(u) && cmpW(u.v, v) > 0) continue;
        out.push(node(u, v));
      }
    }
    out.sort(cmpW);
    byDeg.push(out);
  }
  return byDeg;
}
/** Why a bracket {u,v} of good words is (not) good. */
export function goodReason(u: Word, v: Word): { ok: boolean; why: string } {
  if (cmpW(u, v) <= 0) return { ok: false, why: "нужно u > v" };
  if (!isLeaf(u) && cmpW(u.v, v) > 0) return { ok: false, why: "u = {u₁,u₂}, но u₂ > v" };
  return { ok: true, why: "u > v" + (u.deg > 1 ? " и u₂ ≤ v" : "") };
}
function lettersOf(w: Word, acc: number[] = []): number[] {
  if (isLeaf(w)) acc.push(w.l); else { lettersOf(w.u, acc); lettersOf(w.v, acc); }
  return acc;
}

// ===== Multilinear basis of GenGer(n) =====
function setPartitions(arr: number[]): number[][][] {
  if (!arr.length) return [[]];
  const [first, ...rest] = arr;
  const res: number[][][] = [];
  for (const p of setPartitions(rest)) {
    res.push([[first], ...p]);
    p.forEach((blk, i) => { const q = p.map((b) => b.slice()); q[i] = [first, ...blk]; res.push(q); });
  }
  return res;
}
function multilinearGood(block: number[]): Word[] {
  const byDeg = goodWords(block, block.length);
  const want = block.slice().sort((a, b) => a - b).join();
  return byDeg[block.length].filter((w) => lettersOf(w).sort((a, b) => a - b).join() === want);
}
export function genGerBasis(n: number): { part: number[][]; words: Word[] }[] {
  const X = [...Array(n + 1).keys()];
  const out: { part: number[][]; words: Word[] }[] = [];
  for (const part of setPartitions(X)) {
    if (part.some((b) => b.length === 1 && b[0] === 0)) continue;
    let combos: Word[][] = [[]];
    for (const b of part) {
      const ws = multilinearGood(b);
      const next: Word[][] = [];
      for (const c of combos) for (const w of ws) next.push(c.concat([w]));
      combos = next;
    }
    for (const c of combos) out.push({ part, words: c.slice().sort((a, b) => -cmpW(a, b)) });
  }
  return out;
}
export const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
/** Σ over partitions of {1,x1..xn} without the block {1} of Π (|B|-1)!. */
export function genGerCount(n: number): number {
  let s = 0;
  for (const part of setPartitions([...Array(n + 1).keys()])) {
    if (part.some((b) => b.length === 1 && b[0] === 0)) continue;
    s += part.reduce((m, b) => m * fact(b.length - 1), 1);
  }
  return s;
}
