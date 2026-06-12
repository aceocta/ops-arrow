// Week helpers for shops with a configurable start-of-week day.
// weekStartDay uses JS Date.getDay() numbering: 0 = Sunday … 6 = Saturday.

export const DEFAULT_WEEK_START_DAY = 1; // Monday

// Chip choices for "Week starts on" pickers — displayed starting Monday.
export const WEEK_START_CHOICES: { value: number; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeWeekStartDay(weekStartDay: number | null | undefined) {
  return typeof weekStartDay === "number" && Number.isInteger(weekStartDay) && weekStartDay >= 0 && weekStartDay <= 6
    ? weekStartDay
    : DEFAULT_WEEK_START_DAY;
}

// The yyyy-MM-dd that starts the week containing dateStr, for a week beginning on weekStartDay.
export function startOfWeekFor(dateStr: string, weekStartDay: number = DEFAULT_WEEK_START_DAY): string {
  const start = normalizeWeekStartDay(weekStartDay);
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return dateStr;
  }
  const diff = (d.getDay() - start + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toDateValue(d);
}
