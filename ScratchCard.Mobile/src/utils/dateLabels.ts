// Human-readable labels for the yyyy-MM-dd date strings used across the API.
// Paper-first users read "Thu, 11 Jun 2026", not ISO dates.
export function formatDayLabel(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// Human-readable LOCAL date+time for the ISO (UTC) timestamps the API returns. Parsing via `new Date`
// converts to the device's zone (e.g. BST); slicing the raw string instead shows UTC — an hour out for
// half the year in the UK, which matters on cash-audit screens.
export function formatDateTimeLabel(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
