import { FoodCategory } from "../../types/enums";

// §16 time control: hot food kept below 63°C has a 2-hour limit, chilled food above 8°C a 4-hour limit.
// Timers are computed from the issue's IssueStartedOn anchor (not stored ticking), matching the backend
// TemperatureTimerAlertsBackgroundService. Frozen units have no §16 dwell rule.
const HOT_LIMIT_MINUTES = 120;
const COLD_LIMIT_MINUTES = 240;
const NEAR_LIMIT_MINUTES = 30;

export type TemperatureTimerInfo = {
  hasLimit: boolean;
  elapsedMinutes: number;
  limitMinutes: number;
  remainingMinutes: number; // negative once over the limit
  stage: "ok" | "near" | "over";
  label: string;
};

export function formatDurationShort(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

export function computeTemperatureTimer(
  issueStartedOnIso: string,
  category: FoodCategory,
  nowMs: number,
): TemperatureTimerInfo {
  const startedMs = Date.parse(issueStartedOnIso);
  const elapsedMinutes = Number.isFinite(startedMs)
    ? Math.max(0, Math.floor((nowMs - startedMs) / 60000))
    : 0;

  if (category === FoodCategory.Frozen) {
    return {
      hasLimit: false,
      elapsedMinutes,
      limitMinutes: 0,
      remainingMinutes: 0,
      stage: "ok",
      label: `${formatDurationShort(elapsedMinutes)} open`,
    };
  }

  const limitMinutes = category === FoodCategory.HotFood ? HOT_LIMIT_MINUTES : COLD_LIMIT_MINUTES;
  const remainingMinutes = limitMinutes - elapsedMinutes;
  const stage: TemperatureTimerInfo["stage"] =
    remainingMinutes <= 0 ? "over" : remainingMinutes <= NEAR_LIMIT_MINUTES ? "near" : "ok";
  const limitHours = Math.round(limitMinutes / 60);
  const label =
    stage === "over"
      ? `Over the ${limitHours}h limit by ${formatDurationShort(-remainingMinutes)}`
      : `${formatDurationShort(remainingMinutes)} left of the ${limitHours}h limit`;

  return { hasLimit: true, elapsedMinutes, limitMinutes, remainingMinutes, stage, label };
}
