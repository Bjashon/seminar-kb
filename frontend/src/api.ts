import type { Board, DeletedCard, EditableField, EntityDetail, EntitySummary, Project, ProjectSummary, ReviewCardOut, TalkSummary, UserCard, CardTarget } from "./types";

// In prod the backend serves the built frontend from the same origin, so
// relative paths just work. In dev, Vite serves the frontend on :5173 while
// FastAPI runs separately on :8000.
const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "http://localhost:8000" : "");

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  listEntities: () => fetch(`${API_BASE}/entities`).then((r) => json<EntitySummary[]>(r)),
  getEntity: (slug: string) => fetch(`${API_BASE}/entities/${slug}`).then((r) => json<EntityDetail>(r)),
  search: (q: string) =>
    fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`).then((r) => json<EntitySummary[]>(r)),
  dueCards: (mode: "history" | "foundational" | "article" | "bookmarked" = "history", talkId?: number) =>
    fetch(`${API_BASE}/review/due?mode=${mode}${talkId != null ? `&talk_id=${talkId}` : ""}`).then((r) =>
      json<ReviewCardOut[]>(r)
    ),
  listTalks: () => fetch(`${API_BASE}/talks`).then((r) => json<TalkSummary[]>(r)),
  getBoard: (talkId: number) => fetch(`${API_BASE}/talks/${talkId}/board`).then((r) => json<Board>(r)),
  listProjects: () => fetch(`${API_BASE}/projects`).then((r) => json<ProjectSummary[]>(r)),
  getProject: (slug: string) => fetch(`${API_BASE}/projects/${encodeURIComponent(slug)}`).then((r) => json<Project>(r)),
  // Cards she made in a course on claude.ai, to the place she chose.
  addUserCards: (project: string | null, target: CardTarget, cards: UserCard[]) =>
    fetch(`${API_BASE}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, target, cards }),
    }).then((r) => json<{ added: string[]; already: number; talk_id: number | null }>(r)),
  // Her own wording of a card: only the fields sent change; the original
  // stays on the server and can be brought back (restoreEntity).
  editEntity: (slug: string, fields: Partial<Record<EditableField, string | null>>) =>
    fetch(`${API_BASE}/entities/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    }).then((r) => json<EntityDetail>(r)),
  restoreEntity: (slug: string) =>
    fetch(`${API_BASE}/entities/${encodeURIComponent(slug)}/restore`, { method: "POST" }).then((r) => json<EntityDetail>(r)),
  // Deleting only hides a card (any card, hers or from the content); it
  // can be brought back from the trainer's "Удалённые".
  deleteEntity: (slug: string) =>
    fetch(`${API_BASE}/entities/${encodeURIComponent(slug)}`, { method: "DELETE" }).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    }),
  undeleteEntity: (slug: string) =>
    fetch(`${API_BASE}/entities/${encodeURIComponent(slug)}/undelete`, { method: "POST" }).then((r) => json<EntityDetail>(r)),
  deletedEntities: () => fetch(`${API_BASE}/entities/deleted`).then((r) => json<DeletedCard[]>(r)),
  grade: (slug: string, grade: "again" | "good" | "easy") =>
    fetch(`${API_BASE}/review/${slug}/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade }),
    }).then((r) => json<ReviewCardOut>(r)),
  snooze: (slug: string, days = 3) =>
    fetch(`${API_BASE}/review/${slug}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    }).then((r) => json<ReviewCardOut>(r)),
  // Where the owner is in each of the trainer's fixed decks: the cards
  // passed in the current round, kept on the server for all her devices.
  deckProgress: () => fetch(`${API_BASE}/review/decks`).then((r) => json<Record<string, string[]>>(r)),
  deckPassed: (deck: string, slugs: string[]) =>
    fetch(`${API_BASE}/review/decks/${encodeURIComponent(deck)}/passed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs }),
    }).then((r) => json<string[]>(r)),
  deckRestart: (deck: string) =>
    fetch(`${API_BASE}/review/decks/${encodeURIComponent(deck)}`, { method: "DELETE" }).then((r) => json<string[]>(r)),
  bookmark: (slug: string, bookmarked: boolean) =>
    fetch(`${API_BASE}/review/${slug}/bookmark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarked }),
    }).then((r) => json<ReviewCardOut>(r)),
  sourceUrl: (episodeCode: string, document: string) => `${API_BASE}/sources/${episodeCode}/${document}`,
  projectFileUrl: (slug: string, path: string) =>
    `${API_BASE}/projects/${encodeURIComponent(slug)}/files/${path.split("/").map(encodeURIComponent).join("/")}`,
};
