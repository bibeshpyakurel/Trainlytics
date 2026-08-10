import type { Unit } from "@/lib/convertWeight";

/**
 * A training day. Users define their own, so this is free text rather than a
 * fixed union — see db/migrations/custom_splits_and_default_sets.sql.
 * DEFAULT_SPLITS holds the push/pull/legs/core starter set.
 */
export type Split = string;
export type MetricType = "WEIGHTED_REPS" | "DURATION";

export type Exercise = {
  id: string;
  name: string;
  split: Split;
  muscle_group: string;
  metric_type: MetricType;
  sort_order: number;
  is_active: boolean;
  /** How many set rows this exercise opens with. Always at least 1. */
  default_sets: number;
  replaced_by_exercise_id?: string | null;
  memo?: string | null;
};

export type WeightedSet = { reps: string; weight: string; unit: Unit };
export type DurationSet = { seconds: string };

export type WorkoutSetInsert = {
  user_id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_input: number | null;
  unit_input: Unit | null;
  weight_kg: number | null;
  duration_seconds: number | null;
};

export type ExistingWorkoutSet = {
  id: string;
  exercise_id: string;
  set_number: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type LastSessionInfo = {
  sessionDate: string;
  daysAgo: number;
};

export type RecentWorkoutSession = {
  id: string;
  split: Split;
  session_date: string;
};

export type PendingSessionDelete = {
  id: string;
  split: Split;
  sessionDate: string;
};

export type PendingSessionSummary = {
  id: string;
  split: Split;
  sessionDate: string;
};

export type PendingSetDelete = {
  exerciseId: string;
  exerciseName: string;
  metricType: MetricType;
  setIdx: number;
};

export type PendingSessionEdit = {
  id: string;
  split: Split;
  sessionDate: string;
  newDate: string;
};

export type SessionSummaryItem = {
  exerciseId: string;
  exerciseName: string;
  metricType: MetricType;
  sets: number;
  totalReps: number;
  maxWeight: number | null;
  unit: Unit | null;
  totalDurationSeconds: number;
  setDetails: Array<{
    setNumber: number;
    reps: number | null;
    weightInput: number | null;
    unitInput: Unit | null;
    durationSeconds: number | null;
  }>;
};
