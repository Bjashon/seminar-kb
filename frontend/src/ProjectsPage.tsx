import { useEffect, useState } from "react";
import type { EntitySummary, Project, ProjectSummary } from "./types";
import { api } from "./api";
import { mdBody } from "./markdown";
import { useTypesetHtml } from "./useTypesetHtml";

interface Props {
  allEntities: EntitySummary[];
  onOpen: (slug: string) => void;
}

/** Research projects: each is a markdown page kept in the repo
 *  (projects/<slug>/project.md), rendered with formulas and with every
 *  knowledge-base term turned into a link to its card. */
export function ProjectsPage({ allEntities, onOpen }: Props) {
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
          <div className="project-body body-text" ref={body.ref} onClick={onBodyClick} style={{ opacity: body.ready ? 1 : 0 }} />
        </article>
      )}
    </div>
  );
}
