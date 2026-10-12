// What the generic part of a course (mount.ts) and its calculators (labs/)
// have in common: the shape of lecture.json and a few DOM helpers.

/** One level of the atlas of bracket shapes (projects/monomial-identities). */
export interface AtlasLevel {
  /** dim Lie(n) = (n-1)! */
  lie: number;
  /** s: the shape, e.g. "[[x,x],x]"; dim: dim M_s; in: indices of the shapes t with M_s inside M_t. */
  shapes: { s: string; dim: number; in: number[] }[];
}

export interface LectureData {
  /** The same course on claude.ai, with the Claude chat modes the site lacks. */
  claude_url?: string;
  /** What the course is called on its button and in its top bar ("Лекция по статье" / "Лекция" by default). */
  label?: string;
  bar_label?: string;
  /** Which set of calculators the text uses (see LABS in mount.ts). */
  labs?: string;
  quizzes: Record<string, { q: string; o: string[]; a: number; e: string }[]>;
  flashcards: [string, string][];
  glossary: [string, string][];
  presets?: { name: string; mode: "H" | "K"; a: string; b: string; c: string }[];
  atlas?: Record<string, AtlasLevel>;
}

export interface LabContext {
  root: HTMLElement;
  $: (selector: string) => any;
  $$: (selector: string, within?: ParentNode) => any[];
  data: LectureData;
}

export const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const store = {
  get(k: string, d: any) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k: string, v: any) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

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

export function setMath(el: Element, html: string) {
  const MJ: any = (window as any).MathJax;
  if (MJ?.typesetClear) { try { MJ.typesetClear([el]); } catch { /* not typeset yet */ } }
  el.innerHTML = html;
  typeset(el);
}

export function segValue(seg: Element): string | null {
  const b = seg.querySelector('button[aria-pressed="true"]') as HTMLElement | null;
  return b ? b.dataset.v ?? null : null;
}

export function bindSeg(seg: Element, onChange: (v: string) => void) {
  seg.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button") as HTMLElement | null;
    if (!b || !seg.contains(b)) return;
    seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    onChange(b.dataset.v!);
  });
}
