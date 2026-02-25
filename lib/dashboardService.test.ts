import { describe, expect, it } from "vitest";
import { buildStrengthRowsFromWorkoutData, getDashboardWindowStartIso } from "@/lib/dashboardService";

describe("dashboardService strength normalization", () => {
  it("uses normalized weight_kg when available", () => {
    const rows = buildStrengthRowsFromWorkoutData(
      [
        {
          session_id: "s1",
          exercise_id: "e1",
          set_number: 1,
          reps: 8,
          weight_input: 100,
          unit_input: "lb",
          weight_kg: 45.3592,
        },
      ],
      [{ id: "s1", session_date: "2026-02-20" }],
      [{ id: "e1", name: "Bench Press", muscle_group: "chest" }]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.weight).toBeCloseTo(45.3592, 4);
  });

  it("falls back to converting weight_input + unit_input and skips invalid rows", () => {
    const rows = buildStrengthRowsFromWorkoutData(
      [
        {
          session_id: "s1",
          exercise_id: "e1",
          set_number: 1,
          reps: 6,
          weight_input: 225,
          unit_input: "lb",
          weight_kg: null,
        },
        {
          session_id: "s1",
          exercise_id: "e1",
          set_number: 2,
          reps: 6,
          weight_input: 102.0583,
          unit_input: "kg",
          weight_kg: null,
        },
        {
          session_id: "s1",
          exercise_id: "e1",
          set_number: 3,
          reps: 6,
          weight_input: 100,
          unit_input: null,
          weight_kg: null,
        },
      ],
      [{ id: "s1", session_date: "2026-02-20" }],
      [{ id: "e1", name: "Barbell Row", muscle_group: "back" }]
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.weight).toBeCloseTo(102.0583, 3);
    expect(rows[1]?.weight).toBeCloseTo(102.0583, 3);
  });
});

describe("dashboardService windowing", () => {
  it("computes cutoff dates for 90d and 180d windows", () => {
    const ninety = getDashboardWindowStartIso("90d");
    const oneEighty = getDashboardWindowStartIso("180d");
    const all = getDashboardWindowStartIso("all");

    expect(ninety).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(oneEighty).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(all).toBeNull();
    expect(ninety! <= oneEighty!).toBe(false);
  });
});
