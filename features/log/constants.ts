import type { DurationSet, WeightedSet } from "@/features/log/types";

export const LOG_MESSAGES = {
  futureDateNotAllowed: "Future workout dates are not allowed.",
  notLoggedIn: "You’re not logged in. Go to /login first.",
  savedWorkout: "Saved workout progress ✅",
  emptyWorkoutSave: "Add at least one set before saving workout. Include reps + weight (or duration).",
} as const;

/** A workout must keep at least one set — removing the last one means deleting the exercise. */
export const MIN_SETS_PER_EXERCISE = 1;
export const MAX_SETS_PER_EXERCISE = 20;

export function clampSetCount(count: number) {
  if (!Number.isFinite(count)) return 2;
  return Math.min(MAX_SETS_PER_EXERCISE, Math.max(MIN_SETS_PER_EXERCISE, Math.round(count)));
}

export function createEmptyWeightedSet(): WeightedSet {
  return { reps: "", weight: "", unit: "lb" };
}

export function createEmptyDurationSet(): DurationSet {
  return { seconds: "" };
}

export function createDefaultWeightedSets(count: number): WeightedSet[] {
  return Array.from({ length: clampSetCount(count) }, createEmptyWeightedSet);
}

export function createDefaultDurationSets(count: number): DurationSet[] {
  return Array.from({ length: clampSetCount(count) }, createEmptyDurationSet);
}
