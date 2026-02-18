import { describe, expect, it } from "vitest";
import {
  aggregateSessionStrengthByDate,
  buildMuscleGroupStrengthDatasets,
  buildSelectedExerciseSeries,
  buildStrengthProgressDatasets,
  computeRepMultiplier,
  computeSessionStrengthByExerciseDate,
  computeSetStrengthScore,
  mapToProgressGroup,
  type StrengthSetLog,
} from "@/lib/dashboardStrength";

describe("dashboardStrength", () => {
  it("computes rep multiplier by range", () => {
    expect(computeRepMultiplier(2)).toBe(0.8);
    expect(computeRepMultiplier(5)).toBe(1);
    expect(computeRepMultiplier(8)).toBe(1.15);
    expect(computeRepMultiplier(11)).toBe(1.05);
    expect(computeRepMultiplier(15)).toBe(1);
  });

  it("computes per-set strength score", () => {
    expect(computeSetStrengthScore(100, 8)).toBeCloseTo(920, 6);
  });

  it("computes session strength using 40/60 set weighting", () => {
    const rows: StrengthSetLog[] = [
      {
        date: "2026-02-01",
        exerciseName: "Bench Press",
        muscleGroup: "Chest",
        setNumber: 1,
        weight: 100,
        reps: 8,
      },
      {
        date: "2026-02-01",
        exerciseName: "Bench Press",
        muscleGroup: "Chest",
        setNumber: 2,
        weight: 110,
        reps: 7,
      },
    ];

    const [session] = computeSessionStrengthByExerciseDate(rows);
    const set1 = 100 * 8 * 1.15;
    const set2 = 110 * 7 * 1.15;
    expect(session.sessionStrength).toBeCloseTo(set1 * 0.4 + set2 * 0.6, 6);
  });

  it("maps muscle groups to push/pull/legs", () => {
    expect(mapToProgressGroup("Chest")).toBe("push");
    expect(mapToProgressGroup("Back")).toBe("pull");
    expect(mapToProgressGroup("Hamstring")).toBe("legs");
    expect(mapToProgressGroup("Abs")).toBe("other");
  });

  it("builds progress datasets and selected exercise series", () => {
    const rows: StrengthSetLog[] = [
      {
        date: "2026-02-01",
        exerciseName: "Bench Press",
        muscleGroup: "Chest",
        setNumber: 1,
        weight: 100,
        reps: 8,
      },
      {
        date: "2026-02-01",
        exerciseName: "Bench Press",
        muscleGroup: "Chest",
        setNumber: 2,
        weight: 110,
        reps: 7,
      },
      {
        date: "2026-02-01",
        exerciseName: "Lat Pulldown",
        muscleGroup: "Back",
        setNumber: 1,
        weight: 120,
        reps: 6,
      },
      {
        date: "2026-02-08",
        exerciseName: "Bench Press",
        muscleGroup: "Chest",
        setNumber: 1,
        weight: 105,
        reps: 8,
      },
    ];

    const sessionScores = computeSessionStrengthByExerciseDate(rows);
    const overall = aggregateSessionStrengthByDate(
      sessionScores.map((row) => ({ date: row.date, sessionStrength: row.sessionStrength })),
      "sum"
    );
    expect(overall).toHaveLength(2);

    const datasets = buildStrengthProgressDatasets(sessionScores, "sum");
    expect(datasets.exerciseNames).toContain("Bench Press");
    expect(datasets.push.length).toBeGreaterThan(0);
    expect(datasets.pull.length).toBeGreaterThan(0);

    const benchSeries = buildSelectedExerciseSeries(sessionScores, "Bench Press", "sum");
    expect(benchSeries).toHaveLength(2);
  });

  it("builds muscle-group datasets using top 2 exercises and excludes pull-up from back", () => {
    const rows: StrengthSetLog[] = [
      { date: "2026-02-01", exerciseName: "Pull Up", muscleGroup: "Back", setNumber: 1, weight: 100, reps: 5 },
      { date: "2026-02-08", exerciseName: "Pull Up", muscleGroup: "Back", setNumber: 1, weight: 100, reps: 5 },
      { date: "2026-02-01", exerciseName: "Barbell Row", muscleGroup: "Back", setNumber: 1, weight: 150, reps: 6 },
      { date: "2026-02-08", exerciseName: "Barbell Row", muscleGroup: "Back", setNumber: 1, weight: 155, reps: 6 },
      { date: "2026-02-15", exerciseName: "Barbell Row", muscleGroup: "Back", setNumber: 1, weight: 160, reps: 6 },
      { date: "2026-02-01", exerciseName: "Seated Row", muscleGroup: "Back", setNumber: 1, weight: 130, reps: 8 },
      { date: "2026-02-08", exerciseName: "Seated Row", muscleGroup: "Back", setNumber: 1, weight: 135, reps: 8 },
      { date: "2026-02-01", exerciseName: "Lat Pulldown", muscleGroup: "Back", setNumber: 1, weight: 120, reps: 8 },
      { date: "2026-02-01", exerciseName: "Preacher Curl", muscleGroup: "Bicep", setNumber: 1, weight: 60, reps: 10 },
    ];

    const sessionScores = computeSessionStrengthByExerciseDate(rows);
    const datasets = buildMuscleGroupStrengthDatasets(sessionScores, "sum", 2);

    expect(datasets.selectedExercisesByMuscleGroup.back).toEqual(["Barbell Row", "Seated Row"]);
    expect(datasets.selectedExercisesByMuscleGroup.back).not.toContain("Pull Up");
    expect(datasets.selectedExercisesByMuscleGroup.back).not.toContain("Lat Pulldown");
    expect(datasets.seriesByMuscleGroup.back.length).toBeGreaterThan(0);
    expect(datasets.seriesByMuscleGroup.bicep.length).toBeGreaterThan(0);
  });
});
