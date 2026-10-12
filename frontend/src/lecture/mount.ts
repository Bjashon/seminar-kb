// Brings a project's course (projects/<slug>/lecture.html + lecture.json) to
// life after LecturePage has put its HTML into the page: table of contents,
// progress, quizzes, flashcards, links to the knowledge base's cards, and the
// course's own calculators (labs/, chosen by "labs" in lecture.json). Plain
// DOM code on purpose -- a course is a long static text with a few widgets,
// and MathJax rewrites its formulas in place, which React would fight (see
// useTypesetHtml).
import type { EntitySummary } from "../types";
import { esc, setMath, store, typeset, type LabContext, type LectureData } from "./shared";
import { mountBracketLabs } from "./labs/brackets";
import { mountGerstenhaberLabs } from "./labs/gerstenhaber";

export { typeset };
export type { LectureData };

/** Calculators by the name given in lecture.json ("labs"). */
const LABS: Record<string, (ctx: LabContext) => void> = {
  gerstenhaber: mountGerstenhaberLabs,
  brackets: mountBracketLabs,
};

interface MountOptions {
  root: HTMLElement;
  tocs: HTMLElement[];
  data: LectureData;
  /** The project: progress and flashcard marks are kept per course. */
  slug: string;
  onOpenCard: (slug: string) => void;
}

// The first course stored its progress under fixed names; keep them so that
// nobody's progress is lost.
const storageKey = (what: "progress" | "cards", slug: string) =>
  slug === "gerstenhaber" ? `gg-lecture-${what}-v1` : `lecture-${what}-v1:${slug}`;

export function mountLecture({ root, tocs, data, slug, onOpenCard }: MountOptions) {
  const $ = (s: string): any => root.querySelector(s);
  const $$ = (s: string, r: ParentNode = root): any[] => Array.from(r.querySelectorAll(s));
  const cleanups: (() => void)[] = [];
  const scrollTo = (sel: string) => { const el = root.querySelector(sel); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };

  // ---------- modules, table of contents, progress ----------
  const modules = $$("section.module").map((s: HTMLElement) => ({ id: s.id, title: s.dataset.title || s.id, el: s }));
  const PROGRESS_KEY = storageKey("progress", slug);
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
    if (!modules.length) return;
    const n = modules.filter((m: any) => done.has(m.id)).length;
    const fill = $("#progress-fill"), text = $("#progress-text"), btn = $("#continue-btn");
    if (fill) fill.style.width = (100 * n / modules.length) + "%";
    if (text) text.textContent = `Пройдено ${n} из ${modules.length}`;
    if (!btn) return;
    const next = modules.find((m: any) => !done.has(m.id));
    // When everything is done the button leads to the last module (the
    // course's own closing words go into data-done-text).
    if (!next) { btn.textContent = btn.dataset.doneText || "Курс пройден — к последнему модулю"; btn.setAttribute("href", "#" + modules[modules.length - 1].id); }
    else if (n === 0) { btn.textContent = "Начать с модуля 0"; btn.setAttribute("href", "#" + modules[0].id); }
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

  // ---------- links to the knowledge base's cards ----------
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

  // ---------- the course's calculators ----------
  // A broken calculator must not take the text down with it, and must not
  // fail quietly either.
  const labs = data.labs ? LABS[data.labs] : undefined;
  try {
    if (data.labs && !labs) throw new Error(`в lecture.json указан неизвестный набор вычислителей «${data.labs}»`);
    labs?.({ root, $, $$, data });
  } catch (e) {
    console.error(e);
    const note = document.createElement("p");
    note.className = "err";
    note.textContent = "Вычислители этого курса не запустились: " + (e instanceof Error ? e.message : String(e));
    root.prepend(note);
  }

  // ---------- flashcards and glossary ----------
  if ($("#fc-card")) {
    const KEY = storageKey("cards", slug);
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
  }
  const glossary = $("#glossary");
  if (glossary) setMath(glossary, data.glossary.map((g) => `<tr><td>${g[0]}</td><td>${esc(g[1])}</td></tr>`).join(""));

  return {
    setEntities(list: EntitySummary[]) { entities = list; renderCards(); },
    destroy() { cleanups.forEach((f) => f()); },
  };
}
