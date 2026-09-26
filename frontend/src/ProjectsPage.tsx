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
 *  own, its trainer and board. */
export function ProjectsPage({ allEntities, onOpen, onOpenBoard, onOpenTrainer }: Props) {
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

  // The paper itself first (tex + pdf at the top level), then everything
  // else grouped by folder, so the two files people actually want don't
  // drown among check scripts and logs.
  const files = current ? current.files.slice().sort((a, b) => {
    const da = a.path.includes("/") ? 1 : 0;
    const db = b.path.includes("/") ? 1 : 0;
    return da - db || a.path.localeCompare(b.path);
  }) : [];

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
          {current.talk_id !== null && (
            <div className="project-actions article-actions">
              <button onClick={() => onOpenTrainer(current.talk_id!)}>Тренажёр по теме</button>
              <button onClick={() => onOpenBoard(current.talk_id!)}>Доска темы</button>
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
  );
}
