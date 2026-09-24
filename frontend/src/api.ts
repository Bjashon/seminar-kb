import type { Board, EntityDetail, EntitySummary, ReviewCardOut, TalkSummary } from "./types";

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
  dueCards: (mode: "history" | "foundational" | "article" = "history", talkId?: number) =>
    fetch(`${API_BASE}/review/due?mode=${mode}${talkId != null ? `&talk_id=${talkId}` : ""}`).then((r) =>
      json<ReviewCardOut[]>(r)
    ),
  listTalks: () => fetch(`${API_BASE}/talks`).then((r) => json<TalkSummary[]>(r)),
  getBoard: (talkId: number) => fetch(`${API_BASE}/talks/${talkId}/board`).then((r) => json<Board>(r)),
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
  sourceUrl: (episodeCode: string, document: string) => `${API_BASE}/sources/${episodeCode}/${document}`,
};
