import type { CatalogEntry, PendingExercise, PendingSet } from "@/lib/workoutImportService";
import type { Unit } from "@/lib/convertWeight";

/**
 * One editable row in the guided entry form. Numbers are held as strings so a
 * partially typed value is never rewritten under the user's cursor.
 */
export type EntryRow = {
  key: string;
  exerciseId: string;
  setCount: number;
  reps: string;
  weight: string;
  unit: Unit;
  durationValue: string;
  durationUnit: "sec" | "min";
  /** When true the row expands to one line per set. */
  perSet: boolean;
  perSetValues: Array<{ reps: string; weight: string; durationValue: string }>;
};

export const MAX_SETS = 12;

export function createEmptyRow(unit: Unit): EntryRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    exerciseId: "",
    setCount: 3,
    reps: "",
    weight: "",
    unit,
    durationValue: "",
    durationUnit: "sec",
    perSet: false,
    perSetValues: [],
  };
}

/** Keeps per-set lines in step with the set count, seeding new ones from the shared values. */
export function resizePerSetValues(row: EntryRow): EntryRow["perSetValues"] {
  const next = [...row.perSetValues];
  while (next.length < row.setCount) {
    next.push({ reps: row.reps, weight: row.weight, durationValue: row.durationValue });
  }
  return next.slice(0, row.setCount);
}

function toNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toSeconds(value: string, unit: "sec" | "min"): number | null {
  const parsed = toNumber(value);
  if (parsed == null) return null;
  return unit === "min" ? Math.round(parsed * 60) : Math.round(parsed);
}

export type BuildResult =
  | { ok: true; exercises: PendingExercise[] }
  | { ok: false; message: string };

/**
 * Turns form rows into the shape the save path expects. Rows with no exercise
 * chosen are ignored; rows that are chosen but incomplete are reported, so a
 * half-filled row never silently saves as an empty set.
 */
export function buildPendingExercises(rows: EntryRow[], catalog: CatalogEntry[]): BuildResult {
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  const exercises: PendingExercise[] = [];

  const chosen = rows.filter((row) => row.exerciseId);
  if (chosen.length === 0) {
    return { ok: false as const, message: "Pick at least one exercise." };
  }

  for (const row of chosen) {
    const exercise = byId.get(row.exerciseId);
    if (!exercise) {
      return { ok: false as const, message: "One of the selected exercises is no longer available." };
    }

    const isDuration = exercise.metric_type === "DURATION";
    const values = row.perSet ? resizePerSetValues(row) : null;
    const sets: PendingSet[] = [];

    for (let index = 0; index < row.setCount; index++) {
      if (isDuration) {
        const raw = values ? values[index].durationValue : row.durationValue;
        const seconds = toSeconds(raw, row.durationUnit);
        if (seconds == null || seconds <= 0) {
          return { ok: false as const, message: `Enter a duration for every set of ${exercise.name}.` };
        }
        sets.push({ reps: null, weight: null, unit: null, durationSeconds: seconds });
        continue;
      }

      const reps = toNumber(values ? values[index].reps : row.reps);
      if (reps == null || reps <= 0) {
        return { ok: false as const, message: `Enter reps for every set of ${exercise.name}.` };
      }

      const weight = toNumber(values ? values[index].weight : row.weight);
      sets.push({
        reps,
        weight,
        // Weightless sets are bodyweight, so the unit is meaningless there.
        unit: weight == null ? null : row.unit,
        durationSeconds: null,
      });
    }

    exercises.push({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      metricType: exercise.metric_type,
      sets,
    });
  }

  return { ok: true as const, exercises };
}
