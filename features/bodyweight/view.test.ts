import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBodyweightChartView, getBodyweightHistoryView, getBodyweightSummary } from "@/features/bodyweight/view";
import type { BodyweightLog } from "@/features/bodyweight/types";

const logs: BodyweightLog[] = [
  { id: 1, log_date: "2026-02-16", weight_input: 180, unit_input: "lb", weight_kg: 81.65 },
  { id: 2, log_date: "2026-02-12", weight_input: 181, unit_input: "lb", weight_kg: 82.10 },
  { id: 3, log_date: "2026-01-30", weight_input: 182, unit_input: "lb", weight_kg: 82.55 },
  { id: 4, log_date: "2025-12-20", weight_input: 185, unit_input: "lb", weight_kg: 83.91 },
];

describe("bodyweight view helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-16T12:00:00Z"));
  });

  it("computes latest and average summary", () => {
    const result = getBodyweightSummary(logs, "lb");

    expect(result.latestLog?.log_date).toBe("2026-02-16");
    expect(result.avgDisplay).toBe("182.1");
  });

  it("filters chart points by selected range", () => {
    const biweekly = getBodyweightChartView(logs, "lb", "biweekly");
    const yearly = getBodyweightChartView(logs, "lb", "1y");

    expect(biweekly.chartData.map((point) => point.logDate)).toEqual([
      "2026-02-12",
      "2026-02-16",
    ]);
    expect(yearly.chartData).toHaveLength(4);
    expect(biweekly.yTicks.length).toBeGreaterThan(0);
  });

  it("applies single-date and range history filters", () => {
    const singleDate = getBodyweightHistoryView(logs, "single", "2026-02-12", "", "", 5);
    expect(singleDate.visibleLogs).toHaveLength(1);
    expect(singleDate.visibleLogs[0]?.log_date).toBe("2026-02-12");

    const ranged = getBodyweightHistoryView(logs, "range", "", "2026-01-01", "2026-02-16", 5);
    expect(ranged.visibleLogs).toHaveLength(3);
    expect(ranged.hasActiveHistoryFilter).toBe(true);
  });
});
