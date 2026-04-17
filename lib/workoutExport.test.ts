import { describe, expect, it } from "vitest";
import {
  buildWorkoutExportCsv,
  formatWorkoutExportRangeLabel,
  getWorkoutExportFilename,
  type WorkoutExportRange,
  type WorkoutExportScope,
} from "@/lib/workoutExport";

describe("workoutExport", () => {
  it("builds a human-readable csv export", () => {
    const csv = buildWorkoutExportCsv([
      {
        sessionDate: "2026-04-17",
        split: "push",
        exerciseName: "Incline Bench Press",
        muscleGroup: "chest",
        metricType: "WEIGHTED_REPS",
        setNumber: 1,
        reps: 8,
        weightInput: 100,
        unitInput: "lb",
        weightKg: 45.36,
        durationSeconds: null,
      },
    ]);

    expect(csv).toContain("Session Date,Category,Exercise");
    expect(csv).toContain("Incline Bench Press");
  });

  it("creates a scoped filename with range and format", () => {
    const scope: WorkoutExportScope = { level: "exercise", exerciseId: "e1", label: "Incline Bench Press" };
    const range: WorkoutExportRange = { mode: "date-range", startDate: "2026-04-01", endDate: "2026-04-17" };
    expect(getWorkoutExportFilename(scope, range, "xlsx")).toBe(
      "trainlytics-incline-bench-press-2026-04-01-to-2026-04-17.xlsx"
    );
  });

  it("formats range labels for the export flow", () => {
    expect(formatWorkoutExportRangeLabel({ mode: "last-session" })).toBe("Most recent session");
    expect(formatWorkoutExportRangeLabel({ mode: "all" })).toBe("All workout history");
    expect(
      formatWorkoutExportRangeLabel({ mode: "date-range", startDate: "2026-04-01", endDate: "2026-04-17" })
    ).toBe("2026-04-01 to 2026-04-17");
  });
});