import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EntitySummary } from "../types";
import { api } from "../api";
import { mountLecture, typeset, type LectureData } from "./mount";
import "./lecture.css";

interface Props {
  slug: string;
  projectTitle: string;
  allEntities: EntitySummary[];
  onOpenCard: (slug: string) => void;
  onBack: () => void;
}

/** A project's course (projects/<slug>/lecture.html + lecture.json): the
 *  text goes into the page as is, then mountLecture wires up its widgets and
 *  MathJax typesets it. The HTML lives outside React's reconciliation for the
 *  same reason as useTypesetHtml: MathJax rewrites it in place. */
export function LecturePage({ slug, projectTitle, allEntities, onOpenCard, onBack }: Props) {
  const [lecture, setLecture] = useState<{ html: string; data: LectureData } | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const tocRef = useRef<HTMLElement>(null);
  const tocMobileRef = useRef<HTMLElement>(null);
  const mounted = useRef<ReturnType<typeof mountLecture> | null>(null);
  // Card links open cards through App; keep the latest callback without
  // re-mounting the whole lecture when it changes.
  const openCard = useRef(onOpenCard);
  openCard.current = onOpenCard;

  useEffect(() => {
    setLecture(null);
    setFailed(false);
    api.getLecture(slug).then((l) => setLecture(l as { html: string; data: LectureData })).catch(() => setFailed(true));
  }, [slug]);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!lecture || !el) return;
    setReady(false);
    el.innerHTML = lecture.html;
    const m = mountLecture({
      root: el,
      tocs: [tocRef.current, tocMobileRef.current].filter(Boolean) as HTMLElement[],
      data: lecture.data,
      onOpenCard: (s) => openCard.current(s),
    });
    mounted.current = m;
    let cancelled = false;
    // Show the text even if MathJax never settles.
    const safety = setTimeout(() => { if (!cancelled) setReady(true); }, 4000);
    typeset(el).then(() => { if (!cancelled) { clearTimeout(safety); setReady(true); } });
    return () => {
      cancelled = true;
      clearTimeout(safety);
      m.destroy();
      mounted.current = null;
    };
  }, [lecture]);

  useEffect(() => {
    mounted.current?.setEntities(allEntities);
  }, [allEntities, lecture]);

  return (
    <div className="lecture">
      {/* Stays on screen: the lecture is long, and leaving from where you
          are keeps your place for the next time you open it. */}
      <div className="lecture-bar">
        <button className="article-back lecture-back" onClick={onBack}>&larr; К странице проекта</button>
        <span className="lecture-bar-right">
          <span className="lecture-bar-title">Лекция · {projectTitle}</span>
          {lecture?.data.claude_url?.startsWith("https://") && (
            <a
              className="lecture-bar-link"
              href={lecture.data.claude_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Та же лекция на claude.ai, и в ней ещё вопросы лектору и репетиция доклада с Claude"
            >
              С вопросами к Claude — на claude.ai ↗
            </a>
          )}
        </span>
      </div>
      {failed && <p className="index-empty">Лекцию не удалось загрузить.</p>}
      {!failed && !ready && <p className="index-empty">Готовлю лекцию и формулы…</p>}
      <div className="lecture-layout" style={{ opacity: ready ? 1 : 0 }}>
        <aside className="lecture-toc-side" aria-label="Содержание лекции">
          <nav className="lecture-toc" ref={tocRef} />
        </aside>
        <div className="lecture-main">
          <details className="lecture-toc-mobile">
            <summary>Содержание курса</summary>
            <nav className="lecture-toc" ref={tocMobileRef} />
          </details>
          <div className="lecture-body" ref={bodyRef} />
        </div>
      </div>
    </div>
  );
}
