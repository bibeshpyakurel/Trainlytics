import type { DurationSet, WeightedSet } from "@/features/log/types";

export const LOG_MESSAGES = {
  futureDateNotAllowed: "Future workout dates are not allowed.",
  notLoggedIn: "You’re not logged in. Go to /login first.",
  savedWorkout: "Saved workout progress ✅",
  emptyWorkoutSave: "Add at least one set before saving workout. Include reps + weight (or duration).",
} as const;

export function createDefaultWeightedPair(): [WeightedSet, WeightedSet] {
  return [
    { reps: "", weight: "", unit: "lb" },
    { reps: "", weight: "", unit: "lb" },
  ];
}

export function createDefaultDurationPair(): [DurationSet, DurationSet] {
  return [{ seconds: "" }, { seconds: "" }];
}
