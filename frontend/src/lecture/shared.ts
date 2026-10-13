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
  remove(k: string) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

/** What a reader has done in a course: modules marked as passed, flashcard
 *  marks, test answers. */
export interface LectureState {
  /** module id -> passed */
  done: Record<string, boolean>;
  /** flashcard index -> "know" | "again" */
  cards: Record<string, string>;
  /** quiz id -> question index -> chosen option */
  quiz: Record<string, Record<string, number>>;
}

/** One change to it; null removes the entry. */
export interface LecturePatch {
  done?: Record<string, true | null>;
  cards?: Record<string, string | null>;
  quiz?: Record<string, Record<string, number> | null>;
}

/** Where that state is kept. On the site it is the server (one user, the
 *  same on her phone and her desktop); a copy of the course on claude.ai
 *  has only the browser. Changes are sent one action at a time, to be
 *  merged -- never the whole state -- so a page left open elsewhere cannot
 *  wipe what was done since. */
export interface LectureStorage {
  initial: LectureState;
  save: (patch: LecturePatch) => void;
}

export function applyLecturePatch(state: LectureState, patch: LecturePatch): LectureState {
  for (const [id, on] of Object.entries(patch.done ?? {})) {
    if (on) state.done[id] = true; else delete state.done[id];
  }
  for (const [i, mark] of Object.entries(patch.cards ?? {})) {
    if (mark === null) delete state.cards[i]; else state.cards[i] = mark;
  }
  for (const [id, answers] of Object.entries(patch.quiz ?? {})) {
    if (answers === null) delete state.quiz[id]; else state.quiz[id] = { ...state.quiz[id], ...answers };
  }
  return state;
}

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
