export function formatDate(iso: string): string {
  // Reformat the "YYYY-MM-DD" string directly rather than going through
  // Date + Intl, which would apply the viewer's timezone and can shift a
  // date-only value onto the wrong day.
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
