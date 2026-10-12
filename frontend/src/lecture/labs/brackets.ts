// The calculators of the course on problem 2.6 (projects/monomial-identities):
// the atlas of bracket shapes (data computed by checks/atlas.py, shipped in
// lecture.json as "atlas"), a calculator for Lie polynomials and the "spine"
// of a letter in a monomial. The mathematics is in ../trees.ts.
import { bindSeg, esc, segValue, setMath, type AtlasLevel, type LabContext } from "../shared";
import {
  MAX_LETTERS, autOrder, classicalName, drawShape, expand, expandPoly, height, idealTeX, leftNormed, letters,
  monomialCount, monomialTeX, multilinearLetters, parsePoly, parseShape, parseTree, showTree, size, spine, strahler,
  type Shape, type Tree, type Words,
} from "../trees";

const PRESETS: [string, string][] = [
  ["Тождество Якоби", "[[a,b],c] + [[b,c],a] + [[c,a],b]"],
  ["Антикоммутативность", "[a,b] + [b,a]"],
  ["Скобка не ассоциативна", "[[a,b],c] - [a,[b,c]]"],
  ["[[a,b],[c,d]] через левонормированные", "[[a,b],[c,d]] - [[[a,b],c],d] + [[[a,b],d],c]"],
  ["Метабелев одночлен", "[[a,b],[c,d]]"],
  ["Одночлен формы [F′, γ₃]", "[[a,b],[c,[d,e]]]"],
  ["Якоби внутри: [[[a,b],[c,d]],e]", "[[[a,b],[c,d]],e] - [[[a,b],e],[c,d]] - [[a,b],[[c,d],e]]"],
];

const plural = (n: number, one: string, few: string, many: string) => {
  const d = n % 10, h = n % 100;
  return d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
};
const wordHTML = (w: string[]) => (w.every((l) => l.length === 1) ? w.join("") : w.join(" "));
const coef = (c: number, first: boolean) => {
  const a = Math.abs(c);
  return (c < 0 ? (first ? "−" : " − ") : first ? "" : " + ") + (a === 1 ? "" : a);
};
function sumHTML(items: { c: number; html: string }[], limit: number): string {
  const shown = items.slice(0, limit).map((x, i) => coef(x.c, i === 0) + x.html).join("");
  return shown + (items.length > limit ? ` + … <span class="small">(ещё ${items.length - limit})</span>` : "");
}
const wordsList = (w: Words) => [...w].map(([k, c]) => ({ c, word: k.split(" ") })).sort((a, b) => (a.word.join(" ") < b.word.join(" ") ? -1 : 1));

export function mountBracketLabs({ $$, data }: LabContext) {
  const atlas = data.atlas ?? {};

  // ---------- atlas of shapes ----------
  $$('[data-lab="atlas"]').forEach((lab: HTMLElement) => {
    const full = lab.dataset.mode !== "shapes";
    const seg = lab.querySelector(".atlas-n")!, grid = lab.querySelector(".atlas-grid") as HTMLElement, out = lab.querySelector(".atlas-out")!;
    const ns = Object.keys(atlas).map(Number).sort((a, b) => a - b);
    if (!ns.length) { out.innerHTML = '<div class="err">В lecture.json нет данных атласа.</div>'; return; }
    const start = ns.includes(Number(lab.dataset.n)) ? Number(lab.dataset.n) : ns[Math.min(3, ns.length - 1)];
    seg.innerHTML = ns.map((n) => `<button type="button" data-v="${n}" aria-pressed="${n === start}">${n}</button>`).join("");
    let level: AtlasLevel, shapes: Shape[], sel = -1;
    const stronger = (i: number) => level.shapes[i].in;                                  // their identity implies ours
    const weaker = (i: number) => level.shapes.flatMap((s, j) => (s.in.includes(i) ? [j] : [])); // ours implies theirs

    function renderGrid() {
      const up = sel < 0 ? [] : stronger(sel), down = sel < 0 ? [] : weaker(sel);
      setMath(grid, shapes.map((s, i) => {
        const cls = i === sel ? " sel" : full && up.includes(i) ? " stronger" : full && down.includes(i) ? " weaker" : "";
        const mark = i === sel ? "выбрана" : full && up.includes(i) ? "сильнее" : full && down.includes(i) ? "слабее" : full && sel >= 0 ? "не сравнима" : "";
        return `<button type="button" class="shape-card${cls}" data-i="${i}" title="${esc(level.shapes[i].s)}">${drawShape(s)}` +
          `<span class="shape-ideal">$${idealTeX(s)}$</span>` +
          (full ? `<span class="shape-dim">${level.shapes[i].dim}</span>` : "") +
          (mark ? `<span class="shape-mark">${mark}</span>` : "") + "</button>";
      }).join(""));
    }
    const chips = (list: number[]) => (list.length
      ? list.map((j) => `<button type="button" class="shape-chip" data-i="${j}" title="${esc(level.shapes[j].s)}">${drawShape(shapes[j], 9, 9)}<span>$${idealTeX(shapes[j])}$</span></button>`).join("")
      : '<span class="small">нет</span>');
    function renderOut() {
      const n = size(shapes[0]);
      if (sel < 0) {
        const dims = level.shapes.map((s) => s.dim);
        const twins = dims.filter((d, i) => dims.indexOf(d) !== i).length;
        setMath(out, `<p class="stat">Букв: <b>${n}</b>. Форм: <b>${shapes.length}</b>. Размерность $\\mathrm{Lie}(${n})=(n-1)!=$ <b>${level.lie}</b>.` +
          (full ? ` Число под формой — $\\dim M_\\sigma$.${twins ? ` Совпадений размерности у разных форм: <b>${twins}</b>.` : ""}` : "") +
          "</p><p class=\"small\">Нажми на форму, чтобы увидеть её одночлен, идеал" + (full ? " и все тождества, которые из неё следуют или её влекут." : " и число одночленов.") + "</p>");
        return;
      }
      const s = shapes[sel], info = level.shapes[sel], name = classicalName(s);
      let html = `<p><b>Одночлен:</b> $w_\\sigma=${monomialTeX(s)}$</p>` +
        `<p><b>Идеал следствий:</b> $I_\\sigma=${idealTeX(s)}$` + (name ? ` — тождество $w_\\sigma=0$ задаёт ${name}.` : ".") + "</p>" +
        `<p class="stat">Симметрий дерева: <b>${autOrder(s)}</b> · разных одночленов этой формы на ${n} буквах: <b>${monomialCount(s)}</b>` +
        (full ? ` · $\\dim M_\\sigma=$ <b>${info.dim}</b> из ${level.lie} · высота <b>${height(s)}</b> · число Стралера <b>${strahler(s)}</b>` : "") + "</p>";
      if (full) {
        const up = stronger(sel), down = weaker(sel);
        const rest = shapes.map((_, j) => j).filter((j) => j !== sel && !up.includes(j) && !down.includes(j));
        const same = rest.filter((j) => level.shapes[j].dim === info.dim);
        html += `<div class="deg-row"><div class="d">Сильнее: из них следует $w_\\sigma=0$</div><div class="chips">${chips(up)}</div></div>` +
          `<div class="deg-row"><div class="d">Слабее: следуют из $w_\\sigma=0$</div><div class="chips">${chips(down)}</div></div>` +
          `<div class="deg-row"><div class="d">Не сравнимы</div><div class="chips">${chips(rest)}</div></div>` +
          (same.length ? `<p class="small">Среди несравнимых ${same.length === 1 ? "есть форма" : "есть формы"} с той же размерностью ${info.dim}: размерность не различает формы, а сами подпространства разные.</p>` : "");
      }
      setMath(out, html);
    }
    function setLevel(n: number) {
      level = atlas[String(n)];
      shapes = level.shapes.map((s) => parseShape(s.s));
      sel = -1;
      renderGrid(); renderOut();
    }
    const pick = (e: Event) => {
      const b = (e.target as HTMLElement).closest("[data-i]") as HTMLElement | null;
      if (!b) return;
      const i = Number(b.dataset.i);
      sel = sel === i && grid.contains(b) ? -1 : i;
      renderGrid(); renderOut();
    };
    grid.addEventListener("click", pick);
    out.addEventListener("click", pick);
    bindSeg(seg, (v) => setLevel(Number(v)));
    setLevel(start);
  });

  // ---------- calculator for Lie polynomials ----------
  $$('[data-lab="calc"]').forEach((lab: HTMLElement) => {
    const inp = lab.querySelector(".calc-in") as HTMLInputElement, out = lab.querySelector(".calc-out")!;
    const sel = lab.querySelector(".calc-preset") as HTMLSelectElement | null;
    function parse() {
      const p = parsePoly(inp.value);
      const most = Math.max(...p.map((x) => size(x.t)));
      if (most > MAX_LETTERS) throw new Error(`Слишком длинный одночлен: ${most} букв, а считаю до ${MAX_LETTERS}`);
      return p;
    }
    function run(what: string) {
      try {
        const p = parse(), w = expandPoly(p), list = wordsList(w);
        let html = "";
        if (what === "zero") {
          html = w.size === 0
            ? '<p><span class="ok-mark">Да, это нуль.</span> После раскрытия всех скобок по правилу $[u,v]=uv-vu$ все слова сократились — значит, равенство верно в любой алгебре Ли.</p>'
            : `<p><span class="bad-mark">Нет, не нуль.</span> После раскрытия скобок осталось ${w.size} ${plural(w.size, "слово", "слова", "слов")}, например ${sumHTML(list.slice(0, 4).map((x) => ({ c: x.c, html: wordHTML(x.word) })), 4)}.</p>`;
        } else if (what === "words") {
          html = w.size === 0 ? "<p>Все слова сократились: выражение равно нулю.</p>"
            : `<p class="mono">${sumHTML(list.map((x) => ({ c: x.c, html: wordHTML(x.word) })), 64)}</p><p class="small">${w.size} ${plural(w.size, "слово", "слова", "слов")}. Один одночлен от $n$ разных букв даёт $2^{n-1}$ слов: в каждой из $n-1$ скобок выбирается порядок двух множителей.</p>`;
        } else {
          const ln = leftNormed(p);
          const n = multilinearLetters(p)!.length;
          let total = 1; for (let i = 2; i < n; i++) total *= i;
          html = ln.terms.length === 0 ? "<p>Выражение равно нулю: все координаты нулевые.</p>"
            : `<p class="mono">${sumHTML(ln.terms.map((x) => ({ c: x.c, html: "[" + x.word.join(",") + "]" })), 48)}</p>` +
              `<p class="small">Здесь $[${ln.first},y_1,\\dots,y_k]=[\\dots[[${ln.first},y_1],y_2],\\dots,y_k]$ — левонормированные скобки с буквой $${ln.first}$ на первом месте; они образуют базис $\\mathrm{Lie}(${n})$. Ненулевых координат ${ln.terms.length} из ${total}. Координата при $[${ln.first},y_1,\\dots,y_k]$ — это коэффициент при слове $${ln.first}\\,y_1\\cdots y_k$.</p>`;
        }
        setMath(out, html);
      } catch (e: any) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    }
    if (sel) {
      PRESETS.forEach(([name, expr]) => { const o = document.createElement("option"); o.value = expr; o.textContent = name; sel.appendChild(o); });
      sel.addEventListener("change", () => { if (sel.value) { inp.value = sel.value; run("zero"); } });
    }
    lab.querySelectorAll("[data-calc]").forEach((b) => b.addEventListener("click", () => run((b as HTMLElement).dataset.calc!)));
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") run("zero"); });
    run("zero");
  });

  // ---------- spine of a letter ----------
  $$('[data-lab="spine"]').forEach((lab: HTMLElement) => {
    const inp = lab.querySelector(".spine-in") as HTMLInputElement, seg = lab.querySelector(".spine-z")!, out = lab.querySelector(".spine-out")!;
    let tree: Tree | null = null;
    function render() {
      const z = segValue(seg);
      if (!tree || !z) return;
      const sp = spine(tree, z)!;
      const k = sp.factors.length;
      const lead = wordsList(expand(tree)).filter((x) => x.word[0] === z);
      const nested = sp.factors.reduce<string>((acc, u) => `[${acc},${showTree(u)}]`, z);
      const zTeX = z.replace(/^([a-zA-Z])([0-9]+)$/, "$1_{$2}");
      const product = sp.factors.map((_, i) => `\\widetilde{u_{${i + 1}}}`).join("\\,");
      const count = sp.factors.map((u) => `2^{${size(u) - 1}}`).join("\\cdot ");
      setMath(out,
        `<p><b>Путь от буквы ${esc(z)} к корню:</b> <span class="mono">${esc(showTree(tree))} = ${sp.sign < 0 ? "−" : ""}${esc(nested)}</span></p>` +
        (k ? `<p><b>Позвоночник</b> — поддеревья, висящие на этом пути, снизу вверх: ${sp.factors.map((u, i) => `$u_{${i + 1}}=$ <span class="mono">${esc(showTree(u))}</span>`).join(", ")}. Глубина листа ${esc(z)} равна ${k}.</p>` : "") +
        `<p><b>Слова, начинающиеся с ${esc(z)}:</b> <span class="mono">${sumHTML(lead.map((x) => ({ c: x.c, html: wordHTML(x.word) })), 32)}</span></p>` +
        (k ? `<p class="small">Это в точности ${sp.sign < 0 ? "$-$" : ""}$${zTeX}\\,${product}$, где $\\widetilde{u}$ — одночлен $u$ с раскрытыми скобками. Число слов: $${count}=${lead.length}$.</p>` : ""));
    }
    function load() {
      try {
        const t = parseTree(inp.value);
        const ls = letters(t);
        if (new Set(ls).size !== ls.length) throw new Error("Буквы в одночлене должны быть разными");
        if (ls.length > MAX_LETTERS) throw new Error(`Слишком длинный одночлен: считаю до ${MAX_LETTERS} букв`);
        tree = t;
        const keep = segValue(seg);
        const z = keep && ls.includes(keep) ? keep : ls[0];
        seg.innerHTML = ls.map((l) => `<button type="button" data-v="${esc(l)}" aria-pressed="${l === z}">${esc(l)}</button>`).join("");
        render();
      } catch (e: any) { tree = null; out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    }
    bindSeg(seg, render);
    inp.addEventListener("input", load);
    load();
  });
}
