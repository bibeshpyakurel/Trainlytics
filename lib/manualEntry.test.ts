import { describe, expect, it } from "vitest";
import { buildPendingExercises, createEmptyRow, resizePerSetValues, type EntryRow } from "@/lib/manualEntry";
import { mergeDuplicateExercises, type CatalogEntry, type PendingExercise } from "@/lib/workoutImportService";

const catalog: CatalogEntry[] = [
  { id: "bench", name: "Bench Press", split: "push", muscle_group: "chest", metric_type: "WEIGHTED_REPS" },
  { id: "plank", name: "Plank", split: "core", muscle_group: "core", metric_type: "DURATION" },
];

function row(patch: Partial<EntryRow> = {}): EntryRow {
  return { ...createEmptyRow("lb"), ...patch };
}

describe("buildPendingExercises", () => {
  it("repeats one set spec across the set count", () => {
    const result = buildPendingExercises([row({ exerciseId: "bench", setCount: 3, reps: "8", weight: "135" })], catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exercises[0]?.sets).toEqual([
      { reps: 8, weight: 135, unit: "lb", durationSeconds: null },
      { reps: 8, weight: 135, unit: "lb", durationSeconds: null },
      { reps: 8, weight: 135, unit: "lb", durationSeconds: null },
    ]);
  });

  it("treats a blank weight as bodyweight with no unit", () => {
    const result = buildPendingExercises([row({ exerciseId: "bench", setCount: 1, reps: "10", weight: "" })], catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exercises[0]?.sets[0]).toEqual({ reps: 10, weight: null, unit: null, durationSeconds: null });
  });

  it("converts durations and ignores reps for duration exercises", () => {
    const seconds = buildPendingExercises(
      [row({ exerciseId: "plank", setCount: 2, durationValue: "45", durationUnit: "sec" })],
      catalog
    );
    expect(seconds.ok).toBe(true);
    if (seconds.ok) {
      expect(seconds.exercises[0]?.sets).toEqual([
        { reps: null, weight: null, unit: null, durationSeconds: 45 },
        { reps: null, weight: null, unit: null, durationSeconds: 45 },
      ]);
    }

    const minutes = buildPendingExercises(
      [row({ exerciseId: "plank", setCount: 1, durationValue: "2", durationUnit: "min" })],
      catalog
    );
    if (minutes.ok) expect(minutes.exercises[0]?.sets[0]?.durationSeconds).toBe(120);
  });

  it("uses per-set values when the row is expanded", () => {
    const result = buildPendingExercises(
      [
        row({
          exerciseId: "bench",
          setCount: 3,
          perSet: true,
          perSetValues: [
            { reps: "8", weight: "135", durationValue: "" },
            { reps: "8", weight: "145", durationValue: "" },
            { reps: "6", weight: "155", durationValue: "" },
          ],
        }),
      ],
      catalog
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exercises[0]?.sets.map((set) => [set.reps, set.weight])).toEqual([
      [8, 135],
      [8, 145],
      [6, 155],
    ]);
  });

  it("ignores rows with no exercise picked", () => {
    const result = buildPendingExercises(
      [row({ exerciseId: "bench", reps: "8", weight: "135" }), row()],
      catalog
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.exercises).toHaveLength(1);
  });

  it("reports incomplete rows instead of saving empty sets", () => {
    expect(buildPendingExercises([row()], catalog)).toEqual({ ok: false, message: "Pick at least one exercise." });

    const missingReps = buildPendingExercises([row({ exerciseId: "bench", reps: "", weight: "135" })], catalog);
    expect(missingReps.ok).toBe(false);
    if (!missingReps.ok) expect(missingReps.message).toContain("Bench Press");

    const missingDuration = buildPendingExercises([row({ exerciseId: "plank", durationValue: "" })], catalog);
    expect(missingDuration.ok).toBe(false);
  });
});

describe("resizePerSetValues", () => {
  it("grows from the shared values and trims when the count drops", () => {
    const grown = resizePerSetValues(row({ setCount: 3, reps: "8", weight: "135" }));
    expect(grown).toHaveLength(3);
    expect(grown[2]).toEqual({ reps: "8", weight: "135", durationValue: "" });

    const trimmed = resizePerSetValues(
      row({
        setCount: 1,
        perSetValues: [
          { reps: "8", weight: "135", durationValue: "" },
          { reps: "6", weight: "155", durationValue: "" },
        ],
      })
    );
    expect(trimmed).toHaveLength(1);
    expect(trimmed[0]?.reps).toBe("8");
  });
});

describe("mergeDuplicateExercises", () => {
  it("appends sets when the same exercise is entered twice", () => {
    // set_number is unique per (session, exercise), so two entries would collide on insert.
    const exercises: PendingExercise[] = [
      {
        exerciseId: "bench",
        exerciseName: "Bench Press",
        metricType: "WEIGHTED_REPS",
        sets: [{ reps: 8, weight: 135, unit: "lb", durationSeconds: null }],
      },
      {
        exerciseId: "bench",
        exerciseName: "Bench Press",
        metricType: "WEIGHTED_REPS",
        sets: [{ reps: 6, weight: 155, unit: "lb", durationSeconds: null }],
      },
    ];

    const merged = mergeDuplicateExercises(exercises);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.sets.map((set) => set.weight)).toEqual([135, 155]);
  });

  it("leaves distinct exercises alone", () => {
    const exercises: PendingExercise[] = [
      { exerciseId: "a", exerciseName: "A", metricType: "WEIGHTED_REPS", sets: [] },
      { exerciseId: "b", exerciseName: "B", metricType: "WEIGHTED_REPS", sets: [] },
    ];
    expect(mergeDuplicateExercises(exercises)).toHaveLength(2);
  });
});
