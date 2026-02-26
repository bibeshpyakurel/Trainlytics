import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCaloriesChartView, getCaloriesHistoryView, getCaloriesSummary } from "@/features/calories/view";
import type { CaloriesLog } from "@/features/calories/types";

const logs: CaloriesLog[] = [
  { id: 1, log_date: "2026-02-16", pre_workout_kcal: 300, post_workout_kcal: 600 },
  { id: 2, log_date: "2026-02-12", pre_workout_kcal: 280, post_workout_kcal: 620 },
  { id: 3, log_date: "2026-01-20", pre_workout_kcal: 250, post_workout_kcal: 550 },
];

describe("calories view helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-16T12:00:00Z"));
  });

  it("computes summary metrics", () => {
    const result = getCaloriesSummary(logs);

    expect(result.latestLog?.log_date).toBe("2026-02-16");
    expect(result.avgPre).toBeCloseTo(276.666, 2);
    expect(result.avgPost).toBeCloseTo(590, 2);
  });

  it("filters chart by selected range", () => {
    const biweekly = getCaloriesChartView(logs, "biweekly");

    expect(biweekly.chartData).toHaveLength(2);
    expect(biweekly.chartData.map((point) => point.logDate)).toEqual(["2026-02-12", "2026-02-16"]);
  });

  it("filters history in single-date mode", () => {
    const result = getCaloriesHistoryView(logs, "single", "2026-02-12", "", "", 5);

    expect(result.visibleLogs).toHaveLength(1);
    expect(result.visibleLogs[0]?.log_date).toBe("2026-02-12");
  });
});
