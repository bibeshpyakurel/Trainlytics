export type StrengthAggregationMode = "sum" | "average";

export type StrengthProgressGroup = "push" | "pull" | "legs" | "other";
export type ExerciseTrendCategory = "push" | "pull" | "legs" | "core";

export type TrackedMuscleGroup =
  | "back"
  | "bicep"
  | "tricep"
  | "chest"
  | "quad"
  | "hamstring"
  | "shoulder"
  | "abs";

export const TRACKED_MUSCLE_GROUPS: TrackedMuscleGroup[] = [
  "chest",
  "back",
  "tricep",
  "quad",
  "shoulder",
  "abs",
  "bicep",
  "hamstring",
];

export type StrengthSetLog = {
  date: string;
  exerciseName: string;
  muscleGroup?: string | null;
  primaryMuscle?: string | null;
  setNumber: number;
  weight: number;
  reps: number;
};

export type SessionStrengthScore = {
  date: string;
  exerciseName: string;
  muscleGroup: string | null;
  progressGroup: StrengthProgressGroup;
  sessionStrength: number;
  setSummary: string;
  setSummaryLines: string[];
};

export type StrengthSetInput = {
  weight_lb?: number | null;
  reps?: number | null;
};

export type StrengthSessionInput = {
  set1?: StrengthSetInput | null;
  set2?: StrengthSetInput | null;
};

export type StrengthTimeSeriesPoint = {
  date: string;
  score: number;
  summaryLines?: string[];
};

type AggregateSeriesPointInput = {
  date: string;
  sessionStrength: number;
  exerciseName?: string;
  setSummary?: string;
};

type AggregateSeriesOptions = {
  summaryExerciseNames?: string[];
  summaryLimit?: number;
};

type AggregateDateBucket = {
  total: number;
  count: number;
  byExercise: Map<string, { total: number; setSummary?: string; setSummaryLines?: string[] }>;
};

export type StrengthProgressDatasets = {
  overall: StrengthTimeSeriesPoint[];
  push: StrengthTimeSeriesPoint[];
  pull: StrengthTimeSeriesPoint[];
  legs: StrengthTimeSeriesPoint[];
  byExercise: Record<string, StrengthTimeSeriesPoint[]>;
  exerciseNames: string[];
};

export type MuscleGroupStrengthDatasets = {
  muscleGroups: TrackedMuscleGroup[];
  seriesByMuscleGroup: Record<TrackedMuscleGroup, StrengthTimeSeriesPoint[]>;
  selectedExercisesByMuscleGroup: Record<TrackedMuscleGroup, string[]>;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function computeRepMultiplier(reps: number): number {
  if (reps >= 1 && reps <= 3) return 0.8;
  if (reps >= 4 && reps <= 6) return 1;
  if (reps >= 7 && reps <= 9) return 1.15;
  if (reps >= 10 && reps <= 12) return 1.05;
  return 1;
}

export function computeSetStrengthScore(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight < 0 || reps < 0) {
    return 0;
  }

  return weight * reps * computeRepMultiplier(reps);
}

export function computeSetStrength(weight_lb: number, reps: number): number {
  return computeSetStrengthScore(weight_lb, reps);
}

function computeSetStrengthFromInput(setInput: StrengthSetInput | null | undefined): number | null {
  if (!setInput) return null;
  const { weight_lb, reps } = setInput;
  if (typeof weight_lb !== "number" || typeof reps !== "number") {
    return null;
  }
  if (!Number.isFinite(weight_lb) || !Number.isFinite(reps)) {
    return null;
  }

  return computeSetStrengthScore(weight_lb, reps);
}

export function computeSessionStrength(session: StrengthSessionInput): number {
  const set1Strength = computeSetStrengthFromInput(session.set1);
  const set2Strength = computeSetStrengthFromInput(session.set2);

  if (set1Strength != null && set2Strength != null) {
    return set1Strength * 0.4 + set2Strength * 0.6;
  }
  if (set1Strength != null) return set1Strength;
  if (set2Strength != null) return set2Strength;

  return 0;
}

export function computeProgressDelta(previousSessionStrength: number, currentSessionStrength: number): number {
  if (!Number.isFinite(previousSessionStrength) || !Number.isFinite(currentSessionStrength)) {
    return 0;
  }

  if (previousSessionStrength === 0) {
    if (currentSessionStrength === 0) return 0;
    return currentSessionStrength > 0 ? 1 : -1;
  }

  return (currentSessionStrength - previousSessionStrength) / previousSessionStrength;
}

export function mapProgressDeltaToScore(delta: number): number {
  if (!Number.isFinite(delta)) return 4;
  if (delta >= 0.18) return 7;
  if (delta >= 0.08) return 6;
  if (delta >= 0.02) return 5;
  if (delta > -0.02) return 4;
  if (delta > -0.08) return 3;
  if (delta > -0.18) return 2;
  return 1;
}

export function mapToProgressGroup(muscleGroupOrPrimaryMuscle: string | null | undefined): StrengthProgressGroup {
  const normalized = normalizeText(muscleGroupOrPrimaryMuscle);

  if (!normalized) return "other";

  if (
    normalized.includes("chest") ||
    normalized.includes("shoulder") ||
    normalized.includes("delt") ||
    normalized.includes("tricep") ||
    normalized.includes("triceps")
  ) {
    return "push";
  }

  if (
    normalized.includes("back") ||
    normalized.includes("lat") ||
    normalized.includes("bicep") ||
    normalized.includes("biceps")
  ) {
    return "pull";
  }

  if (
    normalized.includes("leg") ||
    normalized.includes("quad") ||
    normalized.includes("hamstring") ||
    normalized.includes("glute") ||
    normalized.includes("calf") ||
    normalized.includes("calves")
  ) {
    return "legs";
  }

  return "other";
}

export function mapToTrackedMuscleGroup(
  muscleGroupOrPrimaryMuscle: string | null | undefined
): TrackedMuscleGroup | null {
  const normalized = normalizeText(muscleGroupOrPrimaryMuscle);

  if (!normalized) return null;
  if (normalized.includes("back") || normalized.includes("lat")) return "back";
  if (normalized.includes("bicep") || normalized.includes("biceps")) return "bicep";
  if (normalized.includes("tricep") || normalized.includes("triceps")) return "tricep";
  if (normalized.includes("chest") || normalized.includes("pec")) return "chest";
  if (normalized.includes("quad")) return "quad";
  if (normalized.includes("hamstring")) return "hamstring";
  if (normalized.includes("shoulder") || normalized.includes("delt")) return "shoulder";
  if (
    normalized.includes("abs") ||
    normalized.includes("abdom") ||
    normalized.includes("core")
  ) {
    return "abs";
  }

  return null;
}

export function mapToExerciseTrendCategory(
  muscleGroupOrPrimaryMuscle: string | null | undefined
): ExerciseTrendCategory {
  const tracked = mapToTrackedMuscleGroup(muscleGroupOrPrimaryMuscle);

  if (tracked === "chest" || tracked === "tricep" || tracked === "shoulder") return "push";
  if (tracked === "back" || tracked === "bicep") return "pull";
  if (tracked === "quad" || tracked === "hamstring") return "legs";
  if (tracked === "abs") return "core";

  const progress = mapToProgressGroup(muscleGroupOrPrimaryMuscle);
  if (progress === "push" || progress === "pull" || progress === "legs") {
    return progress;
  }

  return "core";
}

function isExcludedExerciseForTrackedGroup(group: TrackedMuscleGroup, exerciseName: string): boolean {
  if (group !== "back") return false;
  const normalizedExercise = normalizeText(exerciseName).replace(/\s+/g, "");
  return normalizedExercise.includes("pullup");
}

export function computeSessionStrengthByExerciseDate(rows: StrengthSetLog[]): SessionStrengthScore[] {
  type Aggregate = {
    date: string;
    exerciseName: string;
    muscleGroup: string | null;
    set1Score: number | null;
    set2Score: number | null;
    set1Weight: number | null;
    set1Reps: number | null;
    set2Weight: number | null;
    set2Reps: number | null;
    fallbackScores: number[];
  };

  const grouped = new Map<string, Aggregate>();

  for (const row of rows) {
    const key = `${row.date}__${row.exerciseName}`;
    const existing = grouped.get(key) ?? {
      date: row.date,
      exerciseName: row.exerciseName,
      muscleGroup: row.muscleGroup ?? row.primaryMuscle ?? null,
      set1Score: null,
      set2Score: null,
      set1Weight: null,
      set1Reps: null,
      set2Weight: null,
      set2Reps: null,
      fallbackScores: [],
    };

    const setScore = computeSetStrengthScore(row.weight, row.reps);

    if (row.setNumber === 1) {
      existing.set1Score = setScore;
      existing.set1Weight = row.weight;
      existing.set1Reps = row.reps;
    } else if (row.setNumber === 2) {
      existing.set2Score = setScore;
      existing.set2Weight = row.weight;
      existing.set2Reps = row.reps;
    } else {
      existing.fallbackScores.push(setScore);
    }

    if (!existing.muscleGroup) {
      existing.muscleGroup = row.muscleGroup ?? row.primaryMuscle ?? null;
    }

    grouped.set(key, existing);
  }

  const sessionScores: SessionStrengthScore[] = [];

  for (const value of grouped.values()) {
    let sessionStrength = 0;

    if (value.set1Score != null && value.set2Score != null) {
      sessionStrength = value.set1Score * 0.4 + value.set2Score * 0.6;
    } else if (value.set1Score != null) {
      sessionStrength = value.set1Score;
    } else if (value.set2Score != null) {
      sessionStrength = value.set2Score;
    } else if (value.fallbackScores.length > 0) {
      sessionStrength =
        value.fallbackScores.reduce((sum, score) => sum + score, 0) / value.fallbackScores.length;
    }

    const setSummaryParts: string[] = [];
    const setSummaryLines: string[] = [];
    if (value.set1Weight != null && value.set1Reps != null) {
      setSummaryParts.push(`S1 ${value.set1Weight}×${value.set1Reps}`);
      setSummaryLines.push(`S1: ${value.set1Weight}×${value.set1Reps}`);
    }
    if (value.set2Weight != null && value.set2Reps != null) {
      setSummaryParts.push(`S2 ${value.set2Weight}×${value.set2Reps}`);
      setSummaryLines.push(`S2: ${value.set2Weight}×${value.set2Reps}`);
    }

    const setSummary = setSummaryParts.length > 0 ? setSummaryParts.join(", ") : "Set details unavailable";

    sessionScores.push({
      date: value.date,
      exerciseName: value.exerciseName,
      muscleGroup: value.muscleGroup,
      progressGroup: mapToProgressGroup(value.muscleGroup),
      sessionStrength,
      setSummary,
      setSummaryLines,
    });
  }

  return sessionScores.sort((a, b) =>
    a.date === b.date ? a.exerciseName.localeCompare(b.exerciseName) : a.date.localeCompare(b.date)
  );
}

export function aggregateSessionStrengthByDate(
  sessionScores: AggregateSeriesPointInput[],
  aggregationMode: StrengthAggregationMode = "sum",
  options?: AggregateSeriesOptions
): StrengthTimeSeriesPoint[] {
  const byDate = new Map<string, AggregateDateBucket>();

  for (const score of sessionScores) {
    const existing: AggregateDateBucket = byDate.get(score.date) ?? {
      total: 0,
      count: 0,
      byExercise: new Map<string, { total: number; setSummary?: string; setSummaryLines?: string[] }>(),
    };
    existing.total += score.sessionStrength;
    existing.count += 1;

    if (score.exerciseName) {
      const existingExercise = existing.byExercise.get(score.exerciseName) ?? {
        total: 0,
      };
      existingExercise.total += score.sessionStrength;
      if (score.setSummary && !existingExercise.setSummary) {
        existingExercise.setSummary = score.setSummary;
      }
      if (score.setSummary && !existingExercise.setSummaryLines) {
        existingExercise.setSummaryLines = score.setSummary
          .split(",")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
      }
      existing.byExercise.set(score.exerciseName, existingExercise);
    }

    byDate.set(score.date, existing);
  }

  return Array.from(byDate.entries())
    .map(([date, value]) => {
      const exerciseRows = Array.from(value.byExercise.entries());
      const summaryExerciseNames = options?.summaryExerciseNames;

      const orderedExerciseRows = summaryExerciseNames && summaryExerciseNames.length > 0
        ? summaryExerciseNames
            .map((exerciseName) => {
              const row = value.byExercise.get(exerciseName);
              if (!row) return null;
              return [exerciseName, row] as const;
            })
            .filter(
              (
                entry
              ): entry is readonly [
                string,
                { total: number; setSummary?: string; setSummaryLines?: string[] }
              ] => entry !== null
            )
        : exerciseRows.sort((a, b) => b[1].total - a[1].total);

      const summaryLimit = options?.summaryLimit ?? 3;
      const summaryLines = orderedExerciseRows
        .slice(0, summaryLimit)
        .flatMap(([exerciseName, exerciseDetails]) => {
          const setLines =
            exerciseDetails.setSummaryLines && exerciseDetails.setSummaryLines.length > 0
              ? exerciseDetails.setSummaryLines
              : [exerciseDetails.setSummary ?? "Set details unavailable"];

          return setLines.map((line) => `${exerciseName} ${line}`);
        });

      return {
        date,
        score: aggregationMode === "average" ? value.total / value.count : value.total,
        summaryLines: summaryLines.length > 0 ? summaryLines : undefined,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildSelectedExerciseSeries(
  sessionScores: SessionStrengthScore[],
  exerciseName: string,
  aggregationMode: StrengthAggregationMode = "sum"
): StrengthTimeSeriesPoint[] {
  return aggregateSessionStrengthByDate(
    sessionScores
      .filter((row) => row.exerciseName === exerciseName)
      .map((row) => ({
        date: row.date,
        sessionStrength: row.sessionStrength,
        exerciseName: row.exerciseName,
        setSummary: row.setSummary,
      })),
    aggregationMode,
    {
      summaryExerciseNames: [exerciseName],
      summaryLimit: 1,
    }
  );
}

export function buildStrengthProgressDatasets(
  sessionScores: SessionStrengthScore[],
  aggregationMode: StrengthAggregationMode = "sum"
): StrengthProgressDatasets {
  const overall = aggregateSessionStrengthByDate(
    sessionScores.map((row) => ({
      date: row.date,
      sessionStrength: row.sessionStrength,
      exerciseName: row.exerciseName,
      setSummary: row.setSummary,
    })),
    aggregationMode
  );

  const push = aggregateSessionStrengthByDate(
    sessionScores
      .filter((row) => row.progressGroup === "push")
      .map((row) => ({
        date: row.date,
        sessionStrength: row.sessionStrength,
        exerciseName: row.exerciseName,
        setSummary: row.setSummary,
      })),
    aggregationMode
  );

  const pull = aggregateSessionStrengthByDate(
    sessionScores
      .filter((row) => row.progressGroup === "pull")
      .map((row) => ({
        date: row.date,
        sessionStrength: row.sessionStrength,
        exerciseName: row.exerciseName,
        setSummary: row.setSummary,
      })),
    aggregationMode
  );

  const legs = aggregateSessionStrengthByDate(
    sessionScores
      .filter((row) => row.progressGroup === "legs")
      .map((row) => ({
        date: row.date,
        sessionStrength: row.sessionStrength,
        exerciseName: row.exerciseName,
        setSummary: row.setSummary,
      })),
    aggregationMode
  );

  const exerciseNames = Array.from(new Set(sessionScores.map((row) => row.exerciseName))).sort((a, b) =>
    a.localeCompare(b)
  );

  const byExercise: Record<string, StrengthTimeSeriesPoint[]> = {};
  for (const exerciseName of exerciseNames) {
    byExercise[exerciseName] = buildSelectedExerciseSeries(sessionScores, exerciseName, aggregationMode);
  }

  return { overall, push, pull, legs, byExercise, exerciseNames };
}

export function buildMuscleGroupStrengthDatasets(
  sessionScores: SessionStrengthScore[],
  aggregationMode: StrengthAggregationMode = "sum",
  maxExercisesPerMuscleGroup = 2
): MuscleGroupStrengthDatasets {
  const seriesByMuscleGroup = {} as Record<TrackedMuscleGroup, StrengthTimeSeriesPoint[]>;
  const selectedExercisesByMuscleGroup = {} as Record<TrackedMuscleGroup, string[]>;

  for (const muscleGroup of TRACKED_MUSCLE_GROUPS) {
    const groupRows = sessionScores.filter((row) => {
      const mapped = mapToTrackedMuscleGroup(row.muscleGroup);
      if (mapped !== muscleGroup) return false;
      return !isExcludedExerciseForTrackedGroup(muscleGroup, row.exerciseName);
    });

    const countByExercise = new Map<string, number>();
    for (const row of groupRows) {
      countByExercise.set(row.exerciseName, (countByExercise.get(row.exerciseName) ?? 0) + 1);
    }

    const selectedExercises = Array.from(countByExercise.entries())
      .sort((a, b) => (b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1]))
      .slice(0, maxExercisesPerMuscleGroup)
      .map(([exerciseName]) => exerciseName);

    const selectedExerciseSet = new Set(selectedExercises);

    const series = aggregateSessionStrengthByDate(
      groupRows
        .filter((row) => selectedExerciseSet.has(row.exerciseName))
        .map((row) => ({
          date: row.date,
          sessionStrength: row.sessionStrength,
          exerciseName: row.exerciseName,
          setSummary: row.setSummary,
        })),
      aggregationMode,
      {
        summaryExerciseNames: selectedExercises,
        summaryLimit: selectedExercises.length,
      }
    );

    selectedExercisesByMuscleGroup[muscleGroup] = selectedExercises;
    seriesByMuscleGroup[muscleGroup] = series;
  }

  return {
    muscleGroups: TRACKED_MUSCLE_GROUPS,
    seriesByMuscleGroup,
    selectedExercisesByMuscleGroup,
  };
}
