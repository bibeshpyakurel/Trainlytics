import { supabase } from "@/lib/supabaseClient";
import { TABLES } from "@/lib/dbNames";
import type { MetricType, Split } from "@/features/log/types";

type DefaultExerciseSeed = {
  name: string;
  split: Split;
  muscleGroup: string;
  metricType: MetricType;
  sortOrder: number;
};

const DEFAULT_EXERCISE_SEEDS: DefaultExerciseSeed[] = [
  { name: "Incline Bench Press", split: "push", muscleGroup: "chest", metricType: "WEIGHTED_REPS", sortOrder: 1 },
  { name: "Triceps Push Down", split: "push", muscleGroup: "triceps", metricType: "WEIGHTED_REPS", sortOrder: 2 },
  { name: "Barbell Shoulder Press", split: "push", muscleGroup: "shoulders", metricType: "WEIGHTED_REPS", sortOrder: 3 },
  { name: "Cable Lateral Raises", split: "push", muscleGroup: "shoulders", metricType: "WEIGHTED_REPS", sortOrder: 4 },
  { name: "Pec Fly", split: "push", muscleGroup: "chest", metricType: "WEIGHTED_REPS", sortOrder: 5 },
  { name: "Overhead Tricep Press", split: "push", muscleGroup: "triceps", metricType: "WEIGHTED_REPS", sortOrder: 6 },
  { name: "Converging Shoulder Press", split: "push", muscleGroup: "shoulders", metricType: "WEIGHTED_REPS", sortOrder: 7 },

  { name: "Bendover Barbell Row", split: "pull", muscleGroup: "back", metricType: "WEIGHTED_REPS", sortOrder: 1 },
  { name: "Diverging Low Row", split: "pull", muscleGroup: "back", metricType: "WEIGHTED_REPS", sortOrder: 2 },
  { name: "Pull Up", split: "pull", muscleGroup: "back", metricType: "WEIGHTED_REPS", sortOrder: 3 },
  { name: "Hammer Curl", split: "pull", muscleGroup: "biceps", metricType: "WEIGHTED_REPS", sortOrder: 4 },
  { name: "Upper Back Row", split: "pull", muscleGroup: "back", metricType: "WEIGHTED_REPS", sortOrder: 5 },
  { name: "Preacher Curl", split: "pull", muscleGroup: "biceps", metricType: "WEIGHTED_REPS", sortOrder: 6 },
  { name: "Lat Pull", split: "pull", muscleGroup: "back", metricType: "WEIGHTED_REPS", sortOrder: 7 },

  { name: "Squat", split: "legs", muscleGroup: "quads", metricType: "WEIGHTED_REPS", sortOrder: 1 },
  { name: "Romanian Deadlift", split: "legs", muscleGroup: "hamstrings", metricType: "WEIGHTED_REPS", sortOrder: 2 },
  { name: "Leg Extension", split: "legs", muscleGroup: "quads", metricType: "WEIGHTED_REPS", sortOrder: 3 },
  { name: "Leg Curl", split: "legs", muscleGroup: "hamstrings", metricType: "WEIGHTED_REPS", sortOrder: 4 },
  { name: "Prone Leg Curl", split: "legs", muscleGroup: "hamstrings", metricType: "WEIGHTED_REPS", sortOrder: 5 },
  { name: "Calf Raise", split: "legs", muscleGroup: "calves", metricType: "WEIGHTED_REPS", sortOrder: 6 },

  { name: "Plank", split: "core", muscleGroup: "core", metricType: "DURATION", sortOrder: 1 },
  { name: "Weighted Leg Raises", split: "core", muscleGroup: "core", metricType: "WEIGHTED_REPS", sortOrder: 2 },
  { name: "Dumbbell Crunches", split: "core", muscleGroup: "core", metricType: "WEIGHTED_REPS", sortOrder: 3 },
];

export async function ensureDefaultExercisesForUser(userId: string): Promise<string | null> {
  const { data: existingRows, error: existingError } = await supabase
    .from(TABLES.exercises)
    .select("id")
    .eq("user_id", userId);

  if (existingError) {
    return existingError.message;
  }

  if ((existingRows ?? []).length > 0) {
    return null;
  }

  const payload = DEFAULT_EXERCISE_SEEDS.map((row) => ({
    user_id: userId,
    name: row.name,
    split: row.split,
    muscle_group: row.muscleGroup,
    metric_type: row.metricType,
    sort_order: row.sortOrder,
    is_active: true,
  }));

  const { error: insertError } = await supabase
    .from(TABLES.exercises)
    .insert(payload);

  if (insertError) {
    return insertError.message;
  }

  return null;
}
