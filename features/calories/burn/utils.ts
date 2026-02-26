import type { BurnChartRange } from "@/features/calories/burn/types";

export const BURN_CHART_DAYS_BY_RANGE: Record<BurnChartRange, number> = {
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
