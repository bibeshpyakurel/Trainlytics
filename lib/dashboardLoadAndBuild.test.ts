import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { buildDashboardDataFromResults, loadDashboardData } from "@/lib/dashboardService";

vi.mock("@/lib/authSession", () => ({
  getCurrentSessionUser: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { getCurrentSessionUser } from "@/lib/authSession";
import { supabase } from "@/lib/supabaseClient";

describe("loadDashboardData auth states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unauthenticated when session user is missing", async () => {
    (getCurrentSessionUser as Mock).mockResolvedValue({ status: "unauthenticated" });

    const result = await loadDashboardData("90d");

    expect(result).toEqual({ status: "unauthenticated" });
    expect((supabase.from as Mock).mock.calls.length).toBe(0);
  });

  it("returns error when auth check fails", async () => {
    (getCurrentSessionUser as Mock).mockResolvedValue({ status: "error", message: "boom" });

    const result = await loadDashboardData("all");

    expect(result).toEqual({ status: "error", message: "boom" });
    expect((supabase.from as Mock).mock.calls.length).toBe(0);
  });
});

describe("buildDashboardDataFromResults scenarios", () => {
  it("builds empty datasets safely", () => {
    const data = buildDashboardDataFromResults({
      userEmail: "test@example.com",
      firstName: null,
      latestWorkout: null,
      latestBodyweight: null,
      latestCalories: null,
      latestMetabolicBurn: null,
      caloriesSeriesRows: [],
      metabolicSeriesRows: [],
      calories7dRows: [],
      metabolic7dRows: [],
      workoutSetRows: [],
      workoutSessions: [],
      exercises: [],
    });

    expect(data.email).toBe("test@example.com");
    expect(data.latestWorkout).toBeNull();
    expect(data.latestBodyweight).toBeNull();
    expect(data.latestCalories).toBeNull();
    expect(data.exerciseNames).toEqual([]);
  });

  it("normalizes mixed-unit weights before scoring", () => {
    const data = buildDashboardDataFromResults({
      userEmail: "mixed@example.com",
      firstName: "Mixed",
      latestWorkout: { session_date: "2026-02-20", split: "push" },
      latestBodyweight: null,
      latestCalories: null,
      latestMetabolicBurn: null,
      caloriesSeriesRows: [],
      metabolicSeriesRows: [],
      calories7dRows: [],
      metabolic7dRows: [],
      workoutSessions: [{ id: "s1", session_date: "2026-02-20" }],
      exercises: [{ id: "e1", name: "Bench Press", muscle_group: "chest" }],
      workoutSetRows: [
        {
          session_id: "s1",
          exercise_id: "e1",
          set_number: 1,
          reps: 5,
          weight_input: 225,
          unit_input: "lb",
          weight_kg: null,
        },
        {
          session_id: "s1",
          exercise_id: "e1",
          set_number: 2,
          reps: 5,
          weight_input: 102.0583,
          unit_input: "kg",
          weight_kg: null,
        },
      ],
    });

    const benchSeries = data.exerciseStrengthSeries["Bench Press"];
    expect(benchSeries).toHaveLength(1);
    expect(benchSeries?.[0]?.score).toBeCloseTo(510.29, 1);
  });

  it("handles large datasets without dropping exercise trends", () => {
    const sessions = Array.from({ length: 240 }, (_, i) => ({
      id: `s${i + 1}`,
      session_date: `2025-${String(((i % 12) + 1)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    }));

    const workoutSetRows = sessions.flatMap((session, i) => [
      {
        session_id: session.id,
        exercise_id: "e1",
        set_number: 1,
        reps: 8,
        weight_input: 100 + (i % 10),
        unit_input: "lb" as const,
        weight_kg: null,
      },
      {
        session_id: session.id,
        exercise_id: "e1",
        set_number: 2,
        reps: 8,
        weight_input: 105 + (i % 10),
        unit_input: "lb" as const,
        weight_kg: null,
      },
    ]);

    const data = buildDashboardDataFromResults({
      userEmail: "large@example.com",
      firstName: "Large",
      latestWorkout: { session_date: "2026-02-20", split: "push" },
      latestBodyweight: null,
      latestCalories: null,
      latestMetabolicBurn: null,
      caloriesSeriesRows: [],
      metabolicSeriesRows: [],
      calories7dRows: [],
      metabolic7dRows: [],
      workoutSessions: sessions,
      exercises: [{ id: "e1", name: "Bench Press", muscle_group: "chest" }],
      workoutSetRows,
    });

    expect(data.exerciseNames).toContain("Bench Press");
    expect(data.exerciseStrengthSeries["Bench Press"]?.length).toBeGreaterThan(0);
    expect(data.muscleGroupStrengthSeries.chest.length).toBeGreaterThan(0);
  });
});
