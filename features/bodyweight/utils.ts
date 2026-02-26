import { LB_PER_KG, type Unit } from "@/lib/convertWeight";
import type { ChartRange } from "@/features/bodyweight/types";

export const CHART_DAYS_BY_RANGE: Record<ChartRange, number> = {
  biweekly: 14,
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
};

export function formatWeightFromKg(weightKg: number, targetUnit: Unit) {
  const converted = targetUnit === "kg" ? weightKg : weightKg * LB_PER_KG;
  return converted.toFixed(1);
}
