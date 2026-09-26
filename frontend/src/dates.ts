/** Today in the viewer's own calendar, as "YYYY-MM-DD" -- the same shape
 *  as the talk dates, so the two compare as plain strings. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** How a talk is labelled next to its title: "s07_ep35 · 21/09/2026". A
 *  research project's own cards hang off a pseudo-talk coded proj_<slug>
 *  (see docs/adding-talks.md), which has no date and reads as "проект". */
export function partLabel(episodeCode: string, date: string | null): string {
  if (episodeCode.startsWith("proj_")) return "проект";
  return date ? `${episodeCode} · ${formatDate(date)}` : episodeCode;
}

export function formatDate(iso: string): string {
  // Reformat the "YYYY-MM-DD" string directly rather than going through
  // Date + Intl, which would apply the viewer's timezone and can shift a
  // date-only value onto the wrong day.
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
