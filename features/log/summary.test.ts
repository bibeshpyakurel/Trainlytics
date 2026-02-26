import { describe, expect, it } from "vitest";
import { sortSessionSummaryItems } from "@/features/log/summary";
import type { SessionSummaryItem } from "@/features/log/types";

function weightedItem(exerciseName: string, setDetails: Array<{ setNumber: number; reps: number; weightInput: number }>): SessionSummaryItem {
  return {
    exerciseId: exerciseName.toLowerCase().replace(/\s+/g, "-"),
    exerciseName,
    metricType: "WEIGHTED_REPS",
    sets: setDetails.length,
    totalReps: setDetails.reduce((sum, set) => sum + set.reps, 0),
    maxWeight: Math.max(...setDetails.map((set) => set.weightInput)),
    unit: "lb",
    totalDurationSeconds: 0,
    setDetails: setDetails.map((set) => ({
      setNumber: set.setNumber,
      reps: set.reps,
      weightInput: set.weightInput,
      unitInput: "lb",
      durationSeconds: null,
    })),
  };
}

describe("sortSessionSummaryItems", () => {
  it("applies split-specific push ordering", () => {
    const items: SessionSummaryItem[] = [
      weightedItem("Converging Press", [{ setNumber: 1, reps: 10, weightInput: 120 }]),
      weightedItem("Incline Dumbbell Press", [{ setNumber: 1, reps: 8, weightInput: 60 }]),
      weightedItem("Barbell Shoulder Press", [{ setNumber: 1, reps: 6, weightInput: 95 }]),
      weightedItem("Cable Lateral Raises", [{ setNumber: 1, reps: 12, weightInput: 35 }]),
    ];

    const sorted = sortSessionSummaryItems(items, "push");
    expect(sorted.map((item) => item.exerciseName)).toEqual([
      "Incline Dumbbell Press",
      "Barbell Shoulder Press",
      "Cable Lateral Raises",
      "Converging Press",
    ]);
  });

  it("sorts set details by set number", () => {
    const item = weightedItem("Leg Extension", [
      { setNumber: 2, reps: 12, weightInput: 90 },
      { setNumber: 1, reps: 12, weightInput: 80 },
    ]);

    const [sorted] = sortSessionSummaryItems([item], "legs");
    expect(sorted.setDetails.map((set) => set.setNumber)).toEqual([1, 2]);
  });

});
