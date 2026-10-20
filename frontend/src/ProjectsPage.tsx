import { useEffect, useState } from "react";
import type { EntitySummary, Project, ProjectSummary } from "./types";
import { api } from "./api";
import { mdBody } from "./markdown";
import { useTypesetHtml } from "./useTypesetHtml";

interface Props {
  allEntities: EntitySummary[];
  onOpen: (slug: string) => void;
  onOpenBoard: (talkId: number) => void;
  onOpenTrainer: (talkId: number) => void;
  /** Paste the code a course on claude.ai gives for the cards made there. */
  onImportCards: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/** Research projects: each is a markdown page kept in the repo
 *  (projects/<slug>/project.md), rendered with formulas and with every
 *  knowledge-base term turned into a link to its card. The page also offers
 *  the project's files for download and, when the project has cards of its
 *  own, its trainer and board. A project's course is not read here: it lives
 *  on claude.ai, with the lecturer, and the page links to it ("claude_url"
 *  in lecture.json). */
export function ProjectsPage({ allEntities, onOpen, onOpenBoard, onOpenTrainer, onImportCards }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [current, setCurrent] = useState<Project | null>(null);

  useEffect(() => {
    api.listProjects().then((list) => {
      setProjects(list);
      if (list.length && !current) api.getProject(list[0].slug).then(setCurrent);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const html = current ? mdBody(current.body_md, "ru", allEntities) : "";
  const body = useTypesetHtml(html);

  function onBodyClick(e: React.MouseEvent<HTMLDivElement>) {
    const gotoEl = (e.target as HTMLElement).closest("[data-goto]") as HTMLElement | null;
    if (gotoEl) onOpen(gotoEl.dataset.goto!);
  }

  if (projects === null) return null;
  if (projects.length === 0) return <div className="main-inner"><p className="index-empty">Проектов пока нет.</p></div>;

  // The files come in blocks, each with a title and a word on what every
  // file is for (the project's files.json, see _file_groups on the server).
  const fileGroups = current ? current.file_groups : [];

  return (
    <div className="main-inner projects">
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
          {(current.talk_id !== null || current.lecture_claude_url) && (
            <div className="project-actions article-actions">
              {current.lecture_claude_url && (
                <a
                  href={current.lecture_claude_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Курс с лектором (отвечает Claude) — на claude.ai, в новой вкладке. Открывается у тех, с кем им поделились на claude.ai."
                >
                  {current.lecture_label ? "Курс" : "Лекция"} на claude.ai ↗
                </a>
              )}
              {current.talk_id !== null && <button onClick={() => onOpenTrainer(current.talk_id!)}>Тренажёр по теме</button>}
              {current.lecture_claude_url && (
                <button onClick={onImportCards} title="Карточки, собранные в курсе на claude.ai: вставить код, который он дал">
                  Карточки из курса
                </button>
              )}
              {current.talk_id !== null && <button onClick={() => onOpenBoard(current.talk_id!)}>Доска темы</button>}
            </div>
          )}
          <div className="project-body body-text" ref={body.ref} onClick={onBodyClick} style={{ opacity: body.ready ? 1 : 0 }} />
          {fileGroups.length > 0 && (
            <section className="project-files">
              <h3>Файлы</h3>
              {fileGroups.map((g) => (
                <div className="project-file-group" key={g.title}>
                  <h4>{g.title}</h4>
                  {g.note && <p className="project-file-group-note">{g.note}</p>}
                  <ul>
                    {g.files.map((f) => (
                      <li key={f.path}>
                        <a href={api.projectFileUrl(current.slug, f.path)} download title={f.path}>{f.path.split("/").pop()}</a>
                        <span className="project-file-note">{f.note}</span>
                        <span className="project-file-size">{formatSize(f.size)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </article>
      )}
    </div>
  );
}
