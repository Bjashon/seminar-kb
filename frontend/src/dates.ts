/** Today in the viewer's own calendar, as "YYYY-MM-DD" -- the same shape
 *  as the talk dates, so the two compare as plain strings. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDate(iso: string): string {
  // Reformat the "YYYY-MM-DD" string directly rather than going through
  // Date + Intl, which would apply the viewer's timezone and can shift a
  // date-only value onto the wrong day.
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
