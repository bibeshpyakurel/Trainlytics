import { describe, expect, it } from "vitest";
import {
  normalizeExerciseName,
  normalizeMuscleGroup,
  validateArchivedExerciseReplacementLink,
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

  it("validates archived replacement links", () => {
    expect(
      validateArchivedExerciseReplacementLink({
        archivedExercise: { id: "archived", split: "push", metric_type: "WEIGHTED_REPS", is_active: false },
        replacementExercise: { id: "active", split: "push", metric_type: "WEIGHTED_REPS", is_active: true },
        replacementPredecessorIds: [],
      })
    ).toEqual({ ok: true });

    expect(
      validateArchivedExerciseReplacementLink({
        archivedExercise: { id: "archived", split: "push", metric_type: "WEIGHTED_REPS", is_active: false },
        replacementExercise: { id: "active", split: "pull", metric_type: "WEIGHTED_REPS", is_active: true },
        replacementPredecessorIds: [],
      })
    ).toEqual({ ok: false, message: "Replacement exercises must stay in the same split." });

    expect(
      validateArchivedExerciseReplacementLink({
        archivedExercise: { id: "archived", split: "push", metric_type: "WEIGHTED_REPS", is_active: false },
        replacementExercise: { id: "active", split: "push", metric_type: "WEIGHTED_REPS", is_active: true },
        replacementPredecessorIds: ["archived"],
      })
    ).toEqual({ ok: false, message: "This replacement would create a cycle in the exercise chain." });
  });
});