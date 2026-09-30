import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EntitySummary, Project, ProjectSummary } from "./types";
import { api } from "./api";
import { mdBody } from "./markdown";
import { useTypesetHtml } from "./useTypesetHtml";
import { LecturePage } from "./lecture/LecturePage";

interface Props {
  allEntities: EntitySummary[];
  onOpen: (slug: string) => void;
  onOpenBoard: (talkId: number) => void;
  onOpenTrainer: (talkId: number) => void;
}

type View = "page" | "lecture";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/** Research projects: each is a markdown page kept in the repo
 *  (projects/<slug>/project.md), rendered with formulas and with every
 *  knowledge-base term turned into a link to its card. The page also offers
 *  the project's files for download and, when the project has cards of its
 *  own, its trainer and board; when it has a course (lecture.html), the
 *  course opens in place of the page. */
export function ProjectsPage({ allEntities, onOpen, onOpenBoard, onOpenTrainer }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [current, setCurrent] = useState<Project | null>(null);
  const [view, setView] = useState<View>("page");
  // The lecture stays mounted once opened (typesetting it takes a moment),
  // and the page and the lecture each keep their own scroll position in
  // the shared pane.
  const [lectureSlug, setLectureSlug] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollPos = useRef<Record<View, number>>({ page: 0, lecture: 0 });

  useEffect(() => {
    api.listProjects().then((list) => {
      setProjects(list);
      if (list.length && !current) api.getProject(list[0].slug).then(setCurrent);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pane = () => wrapRef.current?.closest(".main-pane") as HTMLElement | null;
  function switchView(next: View) {
    const p = pane();
    if (p) scrollPos.current[view] = p.scrollTop;
    if (next === "lecture" && current && lectureSlug !== current.slug) {
      setLectureSlug(current.slug);
      scrollPos.current.lecture = 0;
    }
    setView(next);
  }
  useLayoutEffect(() => {
    const p = pane();
    if (p) p.scrollTop = scrollPos.current[view];
  }, [view]);

  const html = current ? mdBody(current.body_md, "ru", allEntities) : "";
  const body = useTypesetHtml(html);

  function onBodyClick(e: React.MouseEvent<HTMLDivElement>) {
    const gotoEl = (e.target as HTMLElement).closest("[data-goto]") as HTMLElement | null;
    if (gotoEl) onOpen(gotoEl.dataset.goto!);
  }

  if (projects === null) return null;
  if (projects.length === 0) return <div className="main-inner"><p className="index-empty">Проектов пока нет.</p></div>;

  // The paper itself first (tex + pdf at the top level), then everything
  // else grouped by folder, so the two files people actually want don't
  // drown among check scripts and logs.
  const files = current ? current.files.slice().sort((a, b) => {
    const da = a.path.includes("/") ? 1 : 0;
    const db = b.path.includes("/") ? 1 : 0;
    return da - db || a.path.localeCompare(b.path);
  }) : [];

  return (
    <div ref={wrapRef}>
      <div className="main-inner projects" hidden={view === "lecture"}>
        {projects.length > 1 && (
          <div className="lang-switch project-switch">
            {projects.map((p) => (
              <button key={p.slug} aria-selected={current?.slug === p.slug} onClick={() => api.getProject(p.slug).then(setCurrent)}>
                {p.title}
              </button>
            ))}
          </div>
        )}
        {current && (
          <article className="project">
            <h2 className="title">{current.title}</h2>
            {(current.talk_id !== null || current.has_lecture) && (
              <div className="project-actions article-actions">
                {current.has_lecture && <button onClick={() => switchView("lecture")}>Лекция по статье</button>}
                {current.lecture_claude_url && (
                  <a
                    href={current.lecture_claude_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Та же лекция на claude.ai, и в ней ещё вопросы лектору и репетиция доклада с Claude. Открывается у тех, с кем ею поделились на claude.ai."
                  >
                    Лекция на claude.ai ↗
                  </a>
                )}
                {current.talk_id !== null && <button onClick={() => onOpenTrainer(current.talk_id!)}>Тренажёр по теме</button>}
                {current.talk_id !== null && <button onClick={() => onOpenBoard(current.talk_id!)}>Доска темы</button>}
              </div>
            )}
            <div className="project-body body-text" ref={body.ref} onClick={onBodyClick} style={{ opacity: body.ready ? 1 : 0 }} />
            {files.length > 0 && (
              <section className="project-files">
                <h3>Файлы</h3>
                <ul>
                  {files.map((f) => (
                    <li key={f.path}>
                      <a href={api.projectFileUrl(current.slug, f.path)} download>{f.path}</a>
                      <span className="project-file-size">{formatSize(f.size)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </article>
        )}
      </div>
      {lectureSlug && (
        <div className="main-inner lecture-wrap" hidden={view !== "lecture"}>
          <LecturePage
            slug={lectureSlug}
            projectTitle={projects.find((p) => p.slug === lectureSlug)?.title ?? ""}
            allEntities={allEntities}
            onOpenCard={onOpen}
            onBack={() => switchView("page")}
          />
        </div>
      )}
    </div>
  );
}
