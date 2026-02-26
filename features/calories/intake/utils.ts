import type { ChartRange } from "@/features/calories/intake/types";

export const CHART_DAYS_BY_RANGE: Record<ChartRange, number> = {
  biweekly: 14,
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
};

export function formatCalories(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "-";
  return String(Math.round(value));
}

export function getTotalCalories(preWorkoutKcal: number | null, postWorkoutKcal: number | null) {
  return (preWorkoutKcal ?? 0) + (postWorkoutKcal ?? 0);
}
