// Brings a project's lecture (projects/<slug>/lecture.html + lecture.json) to
// life after LecturePage has put its HTML into the page: table of contents,
// progress, quizzes, the calculators, flashcards and links to the project's
// cards. Plain DOM code on purpose -- the lecture is a long static text with
// a few widgets, and MathJax rewrites its formulas in place, which React
// would fight (see useTypesetHtml).
import type { EntitySummary } from "../types";
import {
  bracket, fact, genGerBasis, genGerCount, goodReason, goodWords, homParity, isZero,
  padd, parse, pconst, pmul, pscale, toTeX, wordParity,
} from "./core";

export interface LectureData {
  /** The same course on claude.ai, with the Claude chat modes the site lacks. */
  claude_url?: string;
  quizzes: Record<string, { q: string; o: string[]; a: number; e: string }[]>;
  flashcards: [string, string][];
  glossary: [string, string][];
  presets: { name: string; mode: "H" | "K"; a: string; b: string; c: string }[];
}

interface MountOptions {
  root: HTMLElement;
  tocs: HTMLElement[];
  data: LectureData;
  onOpenCard: (slug: string) => void;
}

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const store = {
  get(k: string, d: any) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k: string, v: any) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const sgn = (e: number) => (((e % 2) + 2) % 2 === 0 ? 1 : -1); // (-1)^e

// MathJax may still be starting; chain every typeset through its startup
// promise so calls never overlap.
export function typeset(el: Element): Promise<void> {
  const MJ: any = (window as any).MathJax;
  if (MJ?.startup?.promise && MJ.typesetPromise) {
    MJ.startup.promise = MJ.startup.promise.then(() => MJ.typesetPromise([el])).catch((e: unknown) => console.warn(e));
    return MJ.startup.promise;
  }
  return Promise.resolve();
}
function setMath(el: Element, html: string) {
  const MJ: any = (window as any).MathJax;
  if (MJ?.typesetClear) { try { MJ.typesetClear([el]); } catch { /* not typeset yet */ } }
  el.innerHTML = html;
  typeset(el);
}
function segValue(seg: Element): string | null {
  const b = seg.querySelector('button[aria-pressed="true"]') as HTMLElement | null;
  return b ? b.dataset.v ?? null : null;
}
function bindSeg(seg: Element, onChange: (v: string) => void) {
  seg.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button") as HTMLElement | null;
    if (!b || !seg.contains(b)) return;
    seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    onChange(b.dataset.v!);
  });
}
function letterHTML(l: number) { return l === 0 ? "1" : "x<sub>" + l + "</sub>"; }
function wordHTML(w: any): string { return w.deg === 1 ? letterHTML(w.l) : "{" + wordHTML(w.u) + ", " + wordHTML(w.v) + "}"; }

export function mountLecture({ root, tocs, data, onOpenCard }: MountOptions) {
  const $ = (s: string): any => root.querySelector(s);
  const $$ = (s: string, r: ParentNode = root): any[] => Array.from(r.querySelectorAll(s));
  const cleanups: (() => void)[] = [];
  const scrollTo = (sel: string) => { const el = root.querySelector(sel); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };

  // ---------- modules, table of contents, progress ----------
  const modules = $$("section.module").map((s: HTMLElement) => ({ id: s.id, title: s.dataset.title || s.id, el: s }));
  const PROGRESS_KEY = "gg-lecture-progress-v1";
  const done = new Set<string>(store.get(PROGRESS_KEY, []));
  for (const nav of tocs) {
    nav.innerHTML = '<div class="toc-title">Модули</div><ol>' + modules.map((m: any, i: number) =>
      `<li><a href="#${m.id}" data-toc="${m.id}"><span class="n">${i}</span><span>${esc(m.title)}</span><span class="ok" aria-label="пройден">✓</span></a></li>`).join("") + "</ol>";
    const onNav = (e: Event) => {
      const a = (e.target as HTMLElement).closest("a[data-toc]") as HTMLElement | null;
      if (!a) return;
      e.preventDefault();
      scrollTo("#" + a.dataset.toc);
      const det = nav.closest("details"); if (det) det.open = false;
    };
    nav.addEventListener("click", onNav);
    cleanups.push(() => nav.removeEventListener("click", onNav));
  }
  const tocLinks = () => tocs.flatMap((n) => Array.from(n.querySelectorAll("[data-toc]"))) as HTMLElement[];
  function renderProgress() {
    tocLinks().forEach((a) => a.classList.toggle("done", done.has(a.dataset.toc!)));
    $$("[data-done]").forEach((b: HTMLElement) => {
      const on = done.has(b.dataset.done!);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.textContent = on ? "Пройден ✓" : "Модуль пройден";
    });
    const n = modules.filter((m: any) => done.has(m.id)).length;
    $("#progress-fill").style.width = (100 * n / modules.length) + "%";
    $("#progress-text").textContent = `Пройдено ${n} из ${modules.length}`;
    const next = modules.find((m: any) => !done.has(m.id));
    const btn = $("#continue-btn");
    if (!next) { btn.textContent = "Курс пройден — к подготовке доклада"; btn.setAttribute("href", "#m11"); }
    else if (n === 0) { btn.textContent = "Начать с модуля 0"; btn.setAttribute("href", "#m0"); }
    else { btn.textContent = `Продолжить: модуль ${modules.indexOf(next)}`; btn.setAttribute("href", "#" + next.id); }
  }
  $$("[data-done]").forEach((b: HTMLElement) => b.addEventListener("click", () => {
    const id = b.dataset.done!;
    if (done.has(id)) done.delete(id); else done.add(id);
    store.set(PROGRESS_KEY, [...done]);
    renderProgress();
  }));
  renderProgress();
  // In-page links (#m7, #lab-po, the continue button) scroll inside the
  // app's pane instead of rewriting the address bar.
  const onAnchor = (e: Event) => {
    const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a || !root.contains(a)) return;
    e.preventDefault();
    scrollTo(a.getAttribute("href")!);
  };
  root.addEventListener("click", onAnchor);
  cleanups.push(() => root.removeEventListener("click", onAnchor));
  if ("IntersectionObserver" in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const cur = modules.find((m: any) => m.el === en.target);
        if (cur) tocLinks().forEach((a) => a.classList.toggle("current", a.dataset.toc === cur.id));
      });
    }, { rootMargin: "-35% 0px -60% 0px" });
    modules.forEach((m: any) => obs.observe(m.el));
    cleanups.push(() => obs.disconnect());
  }

  // ---------- links to the project's cards ----------
  let entities: EntitySummary[] = [];
  function renderCards() {
    const bySlug = new Map(entities.map((e) => [e.slug, e]));
    $$(".lec-cards[data-cards]").forEach((box: HTMLElement) => {
      const slugs = box.dataset.cards!.split(",").filter((s) => bySlug.has(s));
      box.hidden = slugs.length === 0;
      box.innerHTML = '<span class="lec-cards-label">Карточки</span>' + slugs.map((s) => {
        const e = bySlug.get(s)!;
        return `<button type="button" data-card="${s}"><span class="dot" style="background: var(--${e.kind})"></span>${esc(e.title_ru || s)}</button>`;
      }).join("");
    });
  }
  const onCard = (e: Event) => {
    const b = (e.target as HTMLElement).closest("[data-card]") as HTMLElement | null;
    if (b) onOpenCard(b.dataset.card!);
  };
  root.addEventListener("click", onCard);
  cleanups.push(() => root.removeEventListener("click", onCard));
  renderCards();

  // ---------- quizzes ----------
  $$(".quiz[data-quiz]").forEach((box: HTMLElement) => {
    const id = box.dataset.quiz!, qs = data.quizzes[id] || [];
    box.innerHTML = "<h4>Проверь себя</h4>" + qs.map((q, i) =>
      `<div class="q" data-i="${i}"><div class="qt">${i + 1}. ${q.q}</div><div class="opts">` +
      q.o.map((o, j) => `<button type="button" class="opt" data-j="${j}">${o}</button>`).join("") + `</div><div class="fb" aria-live="polite"></div></div>`).join("");
    const answered: Record<number, boolean> = {};
    box.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest(".opt") as HTMLElement | null; if (!b) return;
      const qd = b.closest(".q") as HTMLElement, i = +qd.dataset.i!, q = qs[i], j = +b.dataset.j!;
      if (answered[i] !== undefined) return;
      answered[i] = j === q.a;
      qd.querySelectorAll(".opt").forEach((x, k) => { (x as HTMLButtonElement).disabled = true; if (k === q.a) x.classList.add("right"); else if (k === j) x.classList.add("wrong"); });
      setMath(qd.querySelector(".fb")!, (j === q.a ? '<b class="r">Верно.</b> ' : '<b class="w">Не совсем.</b> ') + q.e);
      const right = Object.values(answered).filter(Boolean).length, total = Object.keys(answered).length;
      const sc = root.querySelector(`[data-score="${id}"]`);
      if (sc) sc.textContent = `Тест: ${right} из ${total} верно` + (total === qs.length ? "" : ` (всего вопросов ${qs.length})`);
    });
  });

  // ---------- lab: signs ----------
  {
    const out = $("#sig-out");
    const par: Record<string, number> = { a: 0, b: 1 };
    $$("[data-sig]").forEach((seg: HTMLElement) => bindSeg(seg, (v) => { par[seg.dataset.sig!] = +v; render(); }));
    function render() {
      const a = par.a, b = par.b, ra = (a + 1) % 2, rb = (b + 1) % 2;
      const s = (x: number) => (x > 0 ? "+" : "-");
      const rows = [
        ["Чётность произведения", `|ab|=${a}+${b}=${(a + b) % 2}`],
        ["Перестановка множителей", `ab=${s(sgn(a * b))}\\,ba`],
        ["Обращённые чётности", `\\|a\\|=${ra},\\quad \\|b\\|=${rb}`],
        ["Чётность скобки", `|\\{a,b\\}|=${a}+${b}+1=${(a + b + 1) % 2}`],
        ["Кососимметричность (3)", `\\{a,b\\}=${s(-sgn(ra * rb))}\\{b,a\\}`],
        ["Знак в правиле Лейбница (5)", `(-1)^{\\|a\\||b|}=${sgn(ra * b) > 0 ? "+1" : "-1"}`],
        ["Может ли $\\{a,a\\}\\neq0$?", ra === 1 ? "\\text{да: } \\|a\\|=1" : "\\text{нет: } \\{a,a\\}=-\\{a,a\\}"],
      ];
      setMath(out, '<div class="table-wrap" style="margin:0"><table><tbody>' +
        rows.map((r) => `<tr><td>${r[0]}</td><td>$${r[1]}$</td></tr>`).join("") + "</tbody></table></div>");
    }
    render();
    const inp = $("#perm-in"), pout = $("#perm-out");
    const perm = () => {
      try {
        const p = parse(inp.value);
        setMath(pout, `<div class="res"><span class="mono">${esc(inp.value.trim())}</span> $\\;=\\;${toTeX(p)}$</div>` +
          (isZero(p) ? '<div class="small">Какая-то нечётная переменная встретилась дважды — такое произведение равно нулю.</div>' : ""));
      } catch (e: any) { pout.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    };
    inp.addEventListener("input", perm); perm();
  }

  // ---------- lab: superpolynomial brackets ----------
  {
    const out = $("#po-out"), modeSeg = $("#po-mode"), sel = $("#po-preset");
    const A = $("#po-a"), B = $("#po-b"), Cc = $("#po-c");
    let lastFocus = A;
    [A, B, Cc].forEach((i: HTMLInputElement) => i.addEventListener("focus", () => { lastFocus = i; }));
    const keys = ["x1", "x2", "x3", "ξ1", "ξ2", "ξ3", "τ", "^", "(", ")", "+", "-"];
    const keyLabel: Record<string, string> = { x1: "x₁", x2: "x₂", x3: "x₃", "ξ1": "ξ₁", "ξ2": "ξ₂", "ξ3": "ξ₃", "-": "−" };
    $("#po-keys").innerHTML = keys.map((k) => `<button class="key" type="button" data-k="${k}">${keyLabel[k] || k}</button>`).join("");
    $("#po-keys").addEventListener("click", (e: Event) => {
      const b = (e.target as HTMLElement).closest("[data-k]") as HTMLElement | null; if (!b) return;
      const el = lastFocus, k = b.dataset.k!, ins = /^[xξτ]/.test(k) ? " " + k + " " : k;
      const s = el.selectionStart ?? el.value.length, en = el.selectionEnd ?? el.value.length;
      el.value = el.value.slice(0, s) + ins + el.value.slice(en);
      el.focus(); el.selectionStart = el.selectionEnd = s + ins.length;
    });
    data.presets.forEach((p, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = p.name; sel.appendChild(o); });
    const setMode = (m: string) => modeSeg.querySelectorAll("button").forEach((b: HTMLElement) => b.setAttribute("aria-pressed", b.dataset.v === m ? "true" : "false"));
    sel.addEventListener("change", () => {
      const p = data.presets[+sel.value]; if (!p) return;
      setMode(p.mode); A.value = p.a; B.value = p.b; Cc.value = p.c;
      run(p.mode === "K" && p.name.startsWith("Лейбниц") ? "check" : p.name.startsWith("Ли") || p.name.startsWith("Непу") ? "aa" : p.name.startsWith("D(") ? "D" : "ab");
    });
    bindSeg(modeSeg, () => run("ab"));
    $$("[data-po-jump]").forEach((a: HTMLElement) => a.addEventListener("click", () => {
      setMode("K"); sel.value = String(data.presets.findIndex((x) => x.name.startsWith("Лейбниц"))); sel.dispatchEvent(new Event("change"));
    }));
    const mode = () => segValue(modeSeg) as "H" | "K";
    const br = (x: any, y: any) => bracket(x, y, mode());
    const parTxt = (p: any) => { const h = homParity(p); return h === null ? (isZero(p) ? "ноль" : "неоднородный") : h === 0 ? "чётный" : "нечётный"; };
    const T = (p: any) => toTeX(p);
    function get(inp: HTMLInputElement, name: string) {
      const v = inp.value.trim(); if (!v) throw new Error(`Поле ${name} пустое`);
      const p = parse(v);
      if (mode() === "H" && [...p.keys()].some((k: string) => k.split("|")[1].split(",").includes("3"))) throw new Error(`В ${name} есть τ — переключи режим на PO(3,4)`);
      return p;
    }
    function run(what: string) {
      try {
        const a = get(A, "a");
        let html = "";
        if (what === "ab" || what === "ba") {
          const b = get(B, "b");
          html = what === "ab" ? `$$\\{a,b\\}=${T(br(a, b))}$$` : `$$\\{b,a\\}=${T(br(b, a))}$$`;
          html += `<p class="small">$a=${T(a)}$ — ${parTxt(a)}; $b=${T(b)}$ — ${parTxt(b)}.</p>`;
        } else if (what === "aa") {
          const r = br(a, a);
          html = `$$\\{a,a\\}=${T(r)}$$<p class="small">$a=${T(a)}$ — ${parTxt(a)}. ` +
            (homParity(a) === 1 ? "Для нечётного $a$ всегда $\\{a,a\\}=0$ (кососимметричность)." :
              isZero(r) ? "Квадрат нулевой — для бивектора это условие Пуассона." : "Квадрат ненулевой — для бивектора это значит, что производная скобка не удовлетворяет тождеству Якоби.") + "</p>";
        } else if (what === "D") {
          html = `$$\\mathfrak{D}(a)=\\{1,a\\}=${T(br(pconst(1), a))}$$<p class="small">${mode() === "H" ? "В $PO(3,3)$ всегда $\\mathfrak{D}=0$: это алгебра Герстенхабера." : "В $PO(3,4)$ $\\mathfrak{D}=-2\\,\\partial/\\partial\\tau$."}</p>`;
        } else if (what === "check") {
          const b = get(B, "b"), c = get(Cc, "c");
          const pa = homParity(a), pb = homParity(b), pc = homParity(c);
          if (pa === null || pb === null || pc === null) throw new Error("Для проверки нужны однородные (чётные или нечётные) ненулевые элементы.");
          const ra = (pa + 1) % 2, rb = (pb + 1) % 2;
          const eq = (x: any, y: any) => isZero(padd(x, y, -1));
          const mark = (ok: boolean) => ok ? '<span class="ok-mark">✓ выполнено</span>' : '<span class="bad-mark">✗ нарушено</span>';
          const l3 = br(a, b), r3 = pscale(br(b, a), -sgn(ra * rb));
          const l4 = br(a, br(b, c)), r4 = padd(br(br(a, b), c), pscale(br(b, br(a, c)), sgn(ra * rb)));
          const L5 = br(a, pmul(b, c)), t1 = pmul(br(a, b), c), t2 = pscale(pmul(b, br(a, c)), sgn(ra * pb));
          const corr = pscale(pmul(pmul(br(pconst(1), a), b), c), sgn(ra));
          const R5 = padd(padd(t1, t2), corr), noCorr = padd(t1, t2);
          html = `<p class="small">$|a|=${pa},\\ |b|=${pb},\\ |c|=${pc}$; $\\|a\\|=${ra},\\ \\|b\\|=${rb}$.</p>` +
            `<p><b>(3)</b> $\\{a,b\\}=${T(l3)}$, $\\ -(-1)^{\\|a\\|\\|b\\|}\\{b,a\\}=${T(r3)}$ — ${mark(eq(l3, r3))}</p>` +
            `<p><b>(4)</b> $\\{a,\\{b,c\\}\\}=${T(l4)}$, $\\ \\{\\{a,b\\},c\\}+(-1)^{\\|a\\|\\|b\\|}\\{b,\\{a,c\\}\\}=${T(r4)}$ — ${mark(eq(l4, r4))}</p>` +
            `<p><b>(5)</b> $\\{a,bc\\}=${T(L5)}$</p><p>$\\{a,b\\}c+(-1)^{\\|a\\||b|}b\\{a,c\\}=${T(noCorr)}$</p>` +
            `<p>поправка $(-1)^{\\|a\\|}\\mathfrak{D}(a)bc=${T(corr)}$ — ${mark(eq(L5, R5))}` +
            (isZero(corr) ? "" : "; без поправки правило нарушилось бы ровно на этот член.") + "</p>";
        } else if (what === "derived") {
          const X = [1, 2, 3].map((i) => parse("x" + i));
          const d = (u: any, v: any) => br(br(u, a), v);
          let rows = "";
          for (let i = 0; i < 3; i++) rows += "<tr>" + [0, 1, 2].map((j) => `<td>$\\{x_${i + 1},x_${j + 1}\\}_a=${T(d(X[i], X[j]))}$</td>`).join("") + "</tr>";
          const J = padd(padd(d(X[0], d(X[1], X[2])), d(X[1], d(X[2], X[0]))), d(X[2], d(X[0], X[1])));
          html = `<p class="small">Производная скобка $\\{f,g\\}_a=\\{\\{f,a\\},g\\}$ на координатах:</p><div class="table-wrap" style="margin:6px 0"><table><tbody>${rows}</tbody></table></div>` +
            `<p>Якобиатор $\\{x_1,\\{x_2,x_3\\}_a\\}_a+\\text{цикл.}=${T(J)}$; $\\ \\{a,a\\}=${T(br(a, a))}$.</p>`;
        }
        setMath(out, html);
      } catch (e: any) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    }
    $$("[data-po]").forEach((b: HTMLElement) => b.addEventListener("click", () => run(b.dataset.po!)));
    [A, B, Cc].forEach((i: HTMLInputElement) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") run("ab"); }));
  }

  // ---------- lab: example 1 ----------
  {
    const seg = $("#ex1-k"), tbl = $("#ex1-table"), out = $("#ex1-out");
    const E = [[1, 0], [0, 1]], names = ["1", "\\varepsilon"], par = [0, 1];
    const add = (x: number[], y: number[]) => [x[0] + y[0], x[1] + y[1]], sc = (s: number, x: number[]) => [s * x[0], s * x[1]];
    const mul = (x: number[], y: number[]) => [x[0] * y[0], x[0] * y[1] + x[1] * y[0]];
    const tex = (x: number[]) => {
      const t: string[] = [];
      if (x[0]) t.push((x[0] === 1 ? "" : x[0] === -1 ? "-" : x[0]) + (Math.abs(x[0]) === 1 ? "1" : ""));
      if (x[1]) t.push((x[1] === 1 ? "" : x[1] === -1 ? "-" : x[1]) + "\\varepsilon");
      return t.length ? t.join("+").replace("+-", "-") : "0";
    };
    const render = () => {
      const k = +segValue(seg)!;
      const br = (x: number[], y: number[]) => [0, k * x[0] * y[0]];
      const D = (x: number[]) => br(E[0], x);
      let rows = "", allOk = true;
      for (const ia of [0, 1]) for (const ib of [0, 1]) for (const ic of [0, 1]) {
        const a = E[ia], b = E[ib], c = E[ic], ra = (par[ia] + 1) % 2;
        const L = br(a, mul(b, c));
        const t1 = mul(br(a, b), c), t2 = sc(sgn(ra * par[ib]), mul(b, br(a, c))), t3 = sc(sgn(ra), mul(mul(D(a), b), c));
        const R = add(add(t1, t2), t3), ok = L[0] === R[0] && L[1] === R[1];
        allOk = allOk && ok;
        rows += `<tr><td>$${names[ia]},${names[ib]},${names[ic]}$</td><td>$${tex(L)}$</td><td>$${tex(t1)}$</td><td>$${tex(t2)}$</td><td>$${tex(t3)}$</td><td>${ok ? '<span class="ok-mark">✓</span>' : '<span class="bad-mark">✗</span>'}</td></tr>`;
      }
      setMath(tbl, `<table><thead><tr><th>$a,b,c$</th><th>$\\{a,bc\\}$</th><th>$\\{a,b\\}c$</th><th>$\\pm b\\{a,c\\}$</th><th>$(-1)^{\\|a\\|}\\mathfrak{D}(a)bc$</th><th></th></tr></thead><tbody>${rows}</tbody></table>`);
      const D11 = D(mul(E[0], E[0])), Dsum = add(mul(D(E[0]), E[0]), mul(E[0], D(E[0])));
      setMath(out, `<p>Правило Лейбница: ${allOk ? '<span class="ok-mark">✓ во всех 8 случаях</span>' : '<span class="bad-mark">нарушено</span>'}. Кососимметричность: единственная возможно ненулевая скобка $\\{1,1\\}$, а (3) для неё пусто. Якоби: все скобки лежат в $\\mathbb{F}\\varepsilon$, а скобки с $\\varepsilon$ нулевые — обе части равны $0$.</p>` +
        `<p>$\\mathfrak{D}(1\\cdot1)=${tex(D11)}$, $\\ \\mathfrak{D}(1)\\cdot1+1\\cdot\\mathfrak{D}(1)=${tex(Dsum)}$ — ${D11[1] === Dsum[1] ? "$\\mathfrak{D}$ здесь дифференцирование." : "$\\mathfrak{D}$ <b>не</b> дифференцирование, как и предсказывает формула $\\mathfrak{D}(bc)=\\mathfrak{D}(b)c+(-1)^{|b|}b\\mathfrak{D}(c)-\\mathfrak{D}(1)bc$."}</p>`);
    };
    bindSeg(seg, render); render();
  }

  // ---------- lab: good words ----------
  {
    const nSeg = $("#hall-n"), dSeg = $("#hall-d"), parBox = $("#hall-par"), out = $("#hall-out");
    const parity = [0, 1, 0, 1];
    const render = () => {
      const n = +segValue(nSeg)!, dmax = +segValue(dSeg)!;
      const byDeg = goodWords([...Array(n + 1).keys()], dmax);
      let html = "", total = 0;
      for (let d = 1; d <= dmax; d++) {
        const ws = byDeg[d];
        const squares = d % 2 === 0 ? (byDeg[d / 2] || []).filter((v: any) => wordParity(v, parity) === 0) : [];
        total += ws.length + squares.length;
        const chips = ws.map((w: any) => { const p = wordParity(w, parity); return `<span class="chip word ${p ? "od" : "ev"}" title="|w| = ${p}">${wordHTML(w)}</span>`; }).join("") +
          squares.map((v: any) => `<span class="chip word sq od" title="квадрат чётного слова: нечётный элемент M">{${wordHTML(v)}, ${wordHTML(v)}}</span>`).join("");
        html += `<div class="deg-row"><div class="d">степень ${d}<br><span style="font-weight:400">${ws.length} хор.${squares.length ? ` + ${squares.length} кв.` : ""}</span></div><div class="chips">${chips}</div></div>`;
      }
      html += `<p class="stat" style="margin-top:10px">Элементов $M$ степени не выше ${dmax}: <b>${total}</b>. Число хороших слов каждой степени совпадает с формулой Витта для свободной алгебры Ли на ${n + 1} образующих.</p>`;
      setMath(out, html);
    };
    const renderPar = () => {
      const n = +segValue(nSeg)!;
      parBox.innerHTML = [...Array(n).keys()].map((i) => `<span class="small">$x_${i + 1}$:</span><span class="seg" data-hp="${i + 1}"><button type="button" aria-pressed="${parity[i + 1] === 0}" data-v="0">чётная</button><button type="button" aria-pressed="${parity[i + 1] === 1}" data-v="1">нечётная</button></span>`).join("");
      $$("[data-hp]", parBox).forEach((seg: HTMLElement) => bindSeg(seg, (v) => { parity[+seg.dataset.hp!] = +v; render(); }));
      typeset(parBox);
    };
    bindSeg(nSeg, () => { renderPar(); render(); });
    bindSeg(dSeg, render);
    renderPar(); render();

    const pool = goodWords([0, 1, 2], 3);
    const all: any[] = [...pool[1], ...pool[2], ...pool[3]];
    let cur: { u: any; v: any } | null = null, answered = false;
    const next = () => {
      answered = false;
      let u: any, v: any, tries = 0;
      do {
        if (Math.random() < 0.45) { const g = Math.random() < 0.5 ? pool[2] : pool[3]; const w: any = g[Math.floor(Math.random() * g.length)]; u = w.u; v = w.v; }
        else { u = all[Math.floor(Math.random() * all.length)]; v = all[Math.floor(Math.random() * all.length)]; }
        tries++;
      } while ((u.deg + v.deg > 4 || (cur && cur.u === u && cur.v === v)) && tries < 50);
      cur = { u, v };
      $("#hq-word").innerHTML = "{" + wordHTML(u) + ", " + wordHTML(v) + "}";
      $("#hq-fb").textContent = "";
    };
    $$("[data-hq]").forEach((b: HTMLElement) => b.addEventListener("click", () => {
      if (!cur || answered) return;
      answered = true;
      const r = goodReason(cur.u, cur.v), guess = b.dataset.hq === "1";
      $("#hq-fb").innerHTML = (guess === r.ok ? '<span class="ok-mark">Верно.</span> ' : '<span class="bad-mark">Нет.</span> ') +
        (r.ok ? "Хорошее: " : "Не хорошее: ") + esc(r.why) + (cur.u.deg > 1 ? ` (здесь u₂ = ${wordHTML(cur.u.v)}, v = ${wordHTML(cur.v)}).` : ".");
    }));
    $("#hq-next").addEventListener("click", next);
    next();
  }

  // ---------- lab: expansion of {x1, x2 x3} ----------
  {
    const box = $("#ex-par"), out = $("#ex-out");
    const par = [0, 0, 1, 0];
    box.innerHTML = [1, 2, 3].map((i) => `<span class="small">$x_${i}$:</span><span class="seg" data-xp="${i}"><button type="button" aria-pressed="${par[i] === 0}" data-v="0">чётная</button><button type="button" aria-pressed="${par[i] === 1}" data-v="1">нечётная</button></span>`).join("");
    const r = (i: number) => (par[i] + 1) % 2;
    const coef = (s: number, first = false) => (s > 0 ? (first ? "" : "+") : "-");
    const render = () => {
      const s1 = sgn(r(1) * par[2]), s2 = sgn(r(1));
      const ca = -sgn(r(1) * r(2)), cb = -sgn(r(1) * r(3)), cc = -sgn(r(1));
      const k1 = ca, k2 = s1 * cb, k3 = s2 * cc;
      setMath(out,
        `<p class="small">$\\|x_1\\|=${r(1)},\\ \\|x_2\\|=${r(2)},\\ \\|x_3\\|=${r(3)}$.</p>` +
        `<p><b>Шаг 1</b>, правило (5):</p>$$\\{x_1,x_2x_3\\}=\\{x_1,x_2\\}x_3${coef(s1)}x_2\\{x_1,x_3\\}${coef(s2)}\\{1,x_1\\}x_2x_3.$$` +
        `<p><b>Шаг 2</b>, кососимметричность (3) приводит скобки к хорошим словам:</p>$$\\{x_1,x_2\\}=${coef(ca, true)}\\{x_2,x_1\\},\\quad \\{x_1,x_3\\}=${coef(cb, true)}\\{x_3,x_1\\},\\quad \\{1,x_1\\}=${coef(cc, true)}\\{x_1,1\\}.$$` +
        `<p><b>Итог</b> — комбинация элементов $U$:</p>$$\\{x_1,x_2x_3\\}=${coef(k1, true)}\\{x_2,x_1\\}x_3${coef(k2)}x_2\\{x_3,x_1\\}${coef(k3)}\\{x_1,1\\}x_2x_3.$$` +
        `<p class="small">Слева 4 буквы, в последнем слагаемом 5 — поэтому индукция по числу букв не работает.</p>`);
    };
    $$("[data-xp]", box).forEach((seg: HTMLElement) => bindSeg(seg, (v) => { par[+seg.dataset.xp!] = +v; render(); }));
    typeset(box); render();
  }

  // ---------- lab: where the coefficient n-1 comes from ----------
  {
    const steps = [
      "Начало: $\\{a,\\,b_1b_2b_3\\}$, где $a\\in\\widehat{\\mathfrak{L}}$. Хотим выразить через скобки $\\{a,b_j\\}$.",
      "Правило Лейбница для $b_1\\cdot(b_2b_3)$: $$\\{a,b_1b_2b_3\\}=\\{a,b_1\\}b_2b_3\\pm b_1\\{a,b_2b_3\\}-\\{a,1\\}b_1b_2b_3.$$ Одна поправка уже появилась.",
      "Ещё раз — для $b_2\\cdot b_3$ внутри второго слагаемого: $$\\{a,b_2b_3\\}=\\{a,b_2\\}b_3\\pm b_2\\{a,b_3\\}-\\{a,1\\}b_2b_3.$$",
      "Собираем. Поправка из шага 2 стоит после $\\pm b_1$; переставляя $\\{a,1\\}$ через $b_1$, получаем тот же знак, и она становится второй копией $-\\{a,1\\}b_1b_2b_3$: $$\\{a,b_1b_2b_3\\}=\\{a,b_1\\}b_2b_3\\pm b_1\\{a,b_2\\}b_3\\pm b_1b_2\\{a,b_3\\}-2\\{a,1\\}b_1b_2b_3.$$",
      "Итог: $n=3$ слагаемых «со всеми множителями» и $n-1=2$ копии поправки. Так как $-\\{a,1\\}=(-1)^{\\|a\\|}\\mathfrak{D}(a)$, это ровно формула (8) при $m=1$: двойная сумма и член $(n-1)(-1)^{\\|a\\|}\\mathfrak{D}(a)b$. С произведением слева то же самое даёт $-(m-1)a\\mathfrak{D}(b)$, а «поправка к поправке» — $-(m-1)(n-1)a\\mathfrak{D}(1)b$.",
    ];
    let i = 0;
    const out = $("#step-out");
    const render = () => {
      setMath(out, `<p>${steps[i]}</p>`);
      $("#step-n").textContent = `шаг ${i} из ${steps.length - 1}`;
      $("#step-prev").disabled = i === 0; $("#step-next").disabled = i === steps.length - 1;
    };
    $("#step-prev").addEventListener("click", () => { if (i > 0) { i--; render(); } });
    $("#step-next").addEventListener("click", () => { if (i < steps.length - 1) { i++; render(); } });
    render();
  }

  // ---------- lab: basis of GenGer(n) ----------
  {
    const seg = $("#gb-n"), out = $("#gb-out");
    const blockHTML = (b: number[]) => "{" + b.slice().sort((x, y) => x - y).map(letterHTML).join(", ") + "}";
    const render = () => {
      const n = +segValue(seg)!;
      const els = genGerBasis(n);
      const groups = new Map<string, string[]>();
      els.forEach((e: any) => {
        const key = e.part.map((b: number[]) => b.slice().sort((x, y) => x - y)).sort((x: number[], y: number[]) => x[0] - y[0]).map(blockHTML).join(" ∪ ");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(e.words.map(wordHTML).join(" · "));
      });
      let html = `<p class="stat">Всего <b>${els.length}</b> элементов, $n\\cdot n!=${n}\\cdot${fact(n)}=${n * fact(n)}$.</p>`;
      groups.forEach((list, key) => { html += `<div class="deg-row"><div class="d">${key}</div><div class="chips">${list.map((t) => `<span class="chip word">${t}</span>`).join("")}</div></div>`; });
      setMath(out, html);
    };
    bindSeg(seg, render); render();
  }

  // ---------- lab: permutations and cycles ----------
  {
    const seg = $("#dm-n"), out = $("#dm-out"), tbl = $("#dm-table");
    const perms = (arr: number[]): number[][] => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms(arr.slice(0, i).concat(arr.slice(i + 1))).map((p) => [x].concat(p))));
    const cycles = (p: number[]) => {
      const seen = new Set<number>(), cs: number[][] = [];
      for (let i = 0; i < p.length; i++) {
        if (seen.has(i)) continue;
        const c: number[] = []; let j = i;
        while (!seen.has(j)) { seen.add(j); c.push(j); j = p[j]; }
        cs.push(c);
      }
      return cs;
    };
    const cycHTML = (c: number[]) => "(" + c.map(letterHTML).join(" ") + ")";
    const render = () => {
      const n = +segValue(seg)!;
      const inc: string[] = [], exc: string[] = [];
      perms([...Array(n + 1).keys()]).forEach((p) => (p[0] === 0 ? exc : inc).push(cycles(p).map(cycHTML).join("")));
      setMath(out, `<p class="stat">Перестановок $(n+1)!=${fact(n + 1)}$; с неподвижной $1$ — $n!=${fact(n)}$; остаётся <b>${inc.length}</b> $=n\\cdot n!$.</p>` +
        `<div class="deg-row"><div class="d">считаются</div><div class="chips">${inc.map((t) => `<span class="chip word">${t}</span>`).join("")}</div></div>` +
        `<div class="deg-row"><div class="d">вычитаются: $1$ неподвижна</div><div class="chips">${exc.map((t) => `<span class="chip word muted">${t}</span>`).join("")}</div></div>`);
    };
    bindSeg(seg, render); render();
    let rows = "";
    for (let n = 1; n <= 7; n++) rows += `<tr><td class="num">${n}</td><td class="num">${fact(n + 1)}</td><td class="num">${fact(n)}</td><td class="num">${genGerCount(n)}</td><td class="num">${n * fact(n)}</td></tr>`;
    setMath(tbl, `<thead><tr><th>$n$</th><th>$(n+1)!$</th><th>$n!$</th><th>$\\sum_\\pi\\prod(|B|-1)!$</th><th>$n\\cdot n!$</th></tr></thead><tbody>${rows}</tbody>`);
  }

  // ---------- flashcards and glossary ----------
  {
    const KEY = "gg-lecture-cards-v1";
    const marks: Record<number, string> = store.get(KEY, {});
    const cards = data.flashcards;
    let order = cards.map((_, i) => i), pos = 0, shown = false;
    const card = $("#fc-card"), list = $("#fc-list");
    const stat = () => {
      const know = Object.values(marks).filter((v) => v === "know").length;
      $("#fc-stat").textContent = `Карточка ${pos + 1} из ${cards.length} · знаю: ${know}`;
    };
    const renderList = () => setMath(list, cards.map((c, i) => `<button type="button" data-fc="${i}"><span class="st ${marks[i] || ""}">${marks[i] === "know" ? "✓" : marks[i] === "again" ? "↻" : "·"}</span> ${c[0]}</button>`).join(""));
    const render = () => {
      const c = cards[order[pos]];
      setMath(card, `<div class="cq">${c[0]}</div>` + (shown
        ? `<div class="ca">${c[1]}</div><div class="row" style="margin-top:12px"><button type="button" class="btn small" data-mark="again">Повторить</button><button type="button" class="btn small solid" data-mark="know">Знаю</button></div>`
        : '<button type="button" class="btn small solid" data-show="1">Показать ответ</button>'));
      stat();
    };
    card.addEventListener("click", (e: Event) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-show]")) { shown = true; render(); return; }
      const m = t.closest("[data-mark]") as HTMLElement | null;
      if (m) { marks[order[pos]] = m.dataset.mark!; store.set(KEY, marks); renderList(); pos = (pos + 1) % order.length; shown = false; render(); }
    });
    list.addEventListener("click", (e: Event) => {
      const b = (e.target as HTMLElement).closest("[data-fc]") as HTMLElement | null; if (!b) return;
      pos = order.indexOf(+b.dataset.fc!); shown = false; render(); card.scrollIntoView({ block: "nearest" });
    });
    $("#fc-next").addEventListener("click", () => { pos = (pos + 1) % order.length; shown = false; render(); });
    $("#fc-prev").addEventListener("click", () => { pos = (pos - 1 + order.length) % order.length; shown = false; render(); });
    $("#fc-shuffle").addEventListener("click", () => {
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      pos = 0; shown = false; render();
    });
    renderList(); render();
    setMath($("#glossary"), data.glossary.map((g) => `<tr><td>${g[0]}</td><td>${esc(g[1])}</td></tr>`).join(""));
  }

  return {
    setEntities(list: EntitySummary[]) { entities = list; renderCards(); },
    destroy() { cleanups.forEach((f) => f()); },
  };
}
