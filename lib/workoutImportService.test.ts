import { describe, expect, it } from "vitest";
import { matchExercise, type CatalogEntry } from "@/lib/workoutImportService";

const catalog: CatalogEntry[] = [
  { id: "1", name: "Bench Press", split: "push", muscle_group: "chest", metric_type: "WEIGHTED_REPS" },
  { id: "2", name: "Incline Bench Press", split: "push", muscle_group: "chest", metric_type: "WEIGHTED_REPS" },
  { id: "3", name: "Lateral Raise", split: "push", muscle_group: "shoulders", metric_type: "WEIGHTED_REPS" },
  { id: "4", name: "Plank", split: "core", muscle_group: "core", metric_type: "DURATION" },
];

describe("matchExercise", () => {
  it("matches exactly, ignoring case and punctuation", () => {
    expect(matchExercise("bench press", catalog)?.id).toBe("1");
    expect(matchExercise("Bench-Press", catalog)?.id).toBe("1");
    expect(matchExercise("  LATERAL   RAISE ", catalog)?.id).toBe("3");
  });

  it("prefers an exact match over a partial one", () => {
    // "Bench Press" is contained in "Incline Bench Press" but must match itself.
    expect(matchExercise("Bench Press", catalog)?.id).toBe("1");
  });

  it("resolves an unambiguous partial match", () => {
    expect(matchExercise("Incline", catalog)?.id).toBe("2");
  });

  it("refuses an ambiguous partial match", () => {
    const ambiguous: CatalogEntry[] = [
      { id: "a", name: "Cable Row", split: "pull", muscle_group: "back", metric_type: "WEIGHTED_REPS" },
      { id: "b", name: "Barbell Row", split: "pull", muscle_group: "back", metric_type: "WEIGHTED_REPS" },
    ];
    // "Row" appears in both — guessing would silently log against the wrong exercise.
    expect(matchExercise("Row", ambiguous)).toBeNull();
  });

  it("returns null for unknown or empty names", () => {
    expect(matchExercise("Zercher Squat", catalog)).toBeNull();
    expect(matchExercise("   ", catalog)).toBeNull();
  });
});
