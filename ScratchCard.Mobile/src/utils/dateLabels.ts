// Human-readable labels for the yyyy-MM-dd date strings used across the API.
// Paper-first users read "Thu, 11 Jun 2026", not ISO dates.
export function formatDayLabel(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
