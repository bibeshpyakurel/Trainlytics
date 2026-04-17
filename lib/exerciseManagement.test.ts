import { describe, expect, it } from "vitest";
import {
  buildWorkoutExportCsv,
  getWorkoutExportFileName,
  normalizeExerciseName,
  normalizeMuscleGroup,
  validateExerciseDraft,
} from "@/lib/exerciseManagement";

describe("exerciseManagement", () => {
  it("normalizes exercise names and muscle groups", () => {
    expect(normalizeExerciseName("  Incline   Bench Press  ")).toBe("Incline Bench Press");
    expect(normalizeMuscleGroup("  Upper   Back ")).toBe("upper back");
  });

  it("validates exercise drafts", () => {
    expect(
      validateExerciseDraft({
        name: "  Cable Fly  ",
        split: "push",
        muscleGroup: " Chest ",
        metricType: "WEIGHTED_REPS",
      })
    ).toEqual({
      ok: true,
      value: {
        name: "Cable Fly",
        split: "push",
        muscleGroup: "chest",
        metricType: "WEIGHTED_REPS",
      },
    });
  });

  it("builds csv with escaping for export rows", () => {
    const csv = buildWorkoutExportCsv([
      {
        sessionDate: "2026-04-17",
        split: "push",
        exerciseName: 'Bench, Press',
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

    expect(csv).toContain('"Bench, Press"');
    expect(csv.split("\n")).toHaveLength(2);
  });

  it("builds predictable filenames for each export mode", () => {
    expect(getWorkoutExportFileName({ mode: "single-date", date: "2026-04-17" })).toBe(
      "trainlytics-workouts-2026-04-17.csv"
    );
    expect(
      getWorkoutExportFileName({
        mode: "date-range",
        startDate: "2026-04-01",
        endDate: "2026-04-17",
      })
    ).toBe("trainlytics-workouts-2026-04-01-to-2026-04-17.csv");
    expect(getWorkoutExportFileName({ mode: "all" })).toBe("trainlytics-workouts-all-history.csv");
  });
});