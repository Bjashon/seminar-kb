// "brief" is never a real entity: it's the synthetic summary card a paper's
// board opens with (see App.openBoard).
export type Kind = "definition" | "theorem" | "property" | "brief";

export interface EntitySummary {
  slug: string;
  kind: Kind;
  title_ru: string | null;
  title_en: string | null;
  topic: string | null;
  topic_order: number;
  source_citation: string | null;
  source_page: number | null;
  episode_code: string | null;
}

export interface LinkRef {
  slug: string;
  title_ru: string | null;
  title_en: string | null;
  kind: Kind;
}

/** An outside page about a card's own term. */
export interface ExternalLink {
  source: "wikipedia" | "nlab" | "eom";
  url: string;
}

export interface EntityDetail {
  slug: string;
  kind: Kind;
  title_ru: string | null;
  title_en: string | null;
  statement_ru: string | null;
  statement_en: string | null;
  proof_ru: string | null;
  proof_en: string | null;
  aliases: string[];
  /** Best first; the card underlines its defined term and opens these. */
  links: ExternalLink[];
  /** In the owner's own study set (the violet bookmark). Absent on the
   *  synthetic "brief" card, which is not an entity. */
  bookmarked?: boolean;
  topic: string | null;
  source: {
    label: string | null;
    document: string | null;
    page: number | null;
    episode_code: string | null;
    citation: string | null;
  };
  uses: LinkRef[];
  used_by: LinkRef[];
}

export interface ProjectSummary {
  slug: string;
  title: string;
}

export interface ProjectFile {
  /** Relative to the project folder. */
  path: string;
  size: number;
  /** What the file is for. */
  note: string | null;
}

export interface Project extends ProjectSummary {
  body_md: string;
  files: ProjectFile[];
  /** The same files in blocks, as the page shows them (the project's files.json). */
  file_groups: { title: string; note: string | null; files: ProjectFile[] }[];
  talk_id: number | null;
  /** projects/<slug>/lecture.html exists: the page offers the course. */
  has_lecture: boolean;
  /** The same course on claude.ai, with the Claude chat modes the site lacks. */
  lecture_claude_url: string | null;
  /** What the course's button says, when not "Лекция по статье" ("label" in lecture.json). */
  lecture_label: string | null;
}

export interface Board {
  slugs: string[];
  edges: { from_slug: string; to_slug: string }[];
  brief: {
    title: string;
    parts: { episode_code: string; date: string | null }[];
    bibliography: string | null;
    brief_ru: string;
    brief_en: string | null;
  } | null;
}

export interface TalkSummary {
  id: number;
  episode_code: string;
  title: string;
  parts: { episode_code: string; date: string | null }[];
  season_number: number | null;
  entity_count: number;
}

export interface ReviewCardOut {
  slug: string;
  title_ru: string | null;
  kind: Kind;
  level: number;
  due_at: string;
  bookmarked: boolean;
}

export type Lang = "ru" | "en";

export interface CanvasNode {
  slug: string;
  x: number;
  y: number;
  lang: Lang;
  proofOpen: boolean;
  /** Per-card size, set by dragging the card's corner: scales the whole
   *  card, text and formulas included, on top of the canvas zoom. */
  scale: number;
}

export interface CanvasEdge {
  from: string;
  to: string;
}

export const KIND_LABEL_RU: Record<Kind, string> = {
  definition: "Определение",
  theorem: "Теорема",
  property: "Свойство",
  brief: "Кратко о статье",
};
