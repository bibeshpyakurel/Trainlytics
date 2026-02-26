import { describe, expect, it } from "vitest";
import { getDashboardViewModel } from "@/features/dashboard/view";

describe("dashboard view model", () => {
  it("returns unauthenticated error messaging state", () => {
    const vm = getDashboardViewModel({
      loading: false,
      msg: "You are not logged in.",
      data: null,
    });

    expect(vm.errorMessage).toBe("You are not logged in.");
    expect(vm.latestWorkoutText).toBe("No workouts yet");
    expect(vm.latestWeightText).toBe("No logs yet");
    expect(vm.latestCaloriesText).toBe("No logs yet");
    expect(vm.latestBurnText).toBe("No logs yet");
  });

  it("returns loading placeholders while data is loading", () => {
    const vm = getDashboardViewModel({
      loading: true,
      msg: null,
      data: null,
    });

    expect(vm.latestWorkoutText).toBe("Loading...");
    expect(vm.latestWeightText).toBe("Loading...");
    expect(vm.latestCaloriesText).toBe("Loading...");
    expect(vm.latestBurnText).toBe("Loading...");
  });

  it("formats populated state values", () => {
    const vm = getDashboardViewModel({
      loading: false,
      msg: null,
      data: {
        email: "x@example.com",
        firstName: "Alex",
        latestWorkout: { session_date: "2026-02-20", split: "push" },
        latestBodyweight: { log_date: "2026-02-20", weight_input: 180, unit_input: "lb" },
        latestCalories: { log_date: "2026-02-20", pre_workout_kcal: 300, post_workout_kcal: 500 },
        latestMetabolicBurn: { log_date: "2026-02-20", estimated_kcal_spent: 2300 },
        nextSessionSuggestion: {
          split: "pull",
          reason: "Last PULL session was 2026-02-14, which is oldest among your tracked splits.",
          lastDoneDate: "2026-02-14",
        },
        avgCalories7d: 2400,
        avgBurn7d: 2200,
        netEnergy7d: 200,
        energyDataCompletenessPct: 72,
        energyBalanceSeries: [],
        strengthAggregationMode: "sum",
        trackedMuscleGroups: ["chest", "back", "tricep", "quad", "shoulder", "abs", "bicep", "hamstring"],
        muscleGroupStrengthSeries: {
          chest: [],
          back: [],
          tricep: [],
          quad: [],
          shoulder: [],
          abs: [],
          bicep: [],
          hamstring: [],
        },
        selectedExercisesByMuscleGroup: {
          chest: [],
          back: [],
          tricep: [],
          quad: [],
          shoulder: [],
          abs: [],
          bicep: [],
          hamstring: [],
        },
        exerciseStrengthSeries: {},
        exerciseNames: [],
        exerciseNamesByCategory: { push: [], pull: [], legs: [], core: [] },
      },
    });

    expect(vm.welcomeTitle).toContain("Alex");
    expect(vm.latestWorkoutText).toBe("PUSH · 2026-02-20");
    expect(vm.latestWeightText).toBe("180 lb · 2026-02-20");
    expect(vm.latestCaloriesText).toBe("800 kcal · 2026-02-20");
    expect(vm.latestBurnText).toBe("2300 kcal · 2026-02-20");
  });
});
