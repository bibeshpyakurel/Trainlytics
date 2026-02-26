import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBurnChartView, getBurnHistoryView, getBurnSummary } from "@/features/calories/burn/view";
import type { MetabolicActivityLog } from "@/features/calories/burn/types";

const logs: MetabolicActivityLog[] = [
  { id: 1, log_date: "2026-02-16", estimated_kcal_spent: 2300, source: null },
  { id: 2, log_date: "2026-02-12", estimated_kcal_spent: 2250, source: "watch" },
  { id: 3, log_date: "2026-01-20", estimated_kcal_spent: 2100, source: null },
];

describe("burn view helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-16T12:00:00Z"));
  });

  it("computes summary metrics", () => {
    const result = getBurnSummary(logs);

    expect(result.latestLog?.log_date).toBe("2026-02-16");
    expect(result.avgSpent).toBeCloseTo(2216.666, 2);
  });

  it("filters chart by selected range", () => {
    const biweekly = getBurnChartView(logs, "biweekly");

    expect(biweekly.chartData).toHaveLength(2);
    expect(biweekly.chartData.map((point) => point.logDate)).toEqual(["2026-02-12", "2026-02-16"]);
  });

  it("filters history in single-date mode", () => {
    const result = getBurnHistoryView(logs, "single", "2026-02-12", "", "", 5);

    expect(result.visibleLogs).toHaveLength(1);
    expect(result.visibleLogs[0]?.log_date).toBe("2026-02-12");
  });
});
