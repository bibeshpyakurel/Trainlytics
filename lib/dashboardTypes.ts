import type { Split } from "@/features/log/types";
import type {
  ExerciseTrendCategory,
  TrackedMuscleGroup,
  StrengthAggregationMode,
  StrengthTimeSeriesPoint,
} from "@/lib/dashboardStrength";
import type { Unit } from "@/lib/convertWeight";

export type DashboardData = {
  email: string;
  latestWorkout: { session_date: string; split: Split } | null;
  latestBodyweight: { log_date: string; weight_input: number; unit_input: Unit } | null;
  latestCalories: {
    log_date: string;
    pre_workout_kcal: number | null;
    post_workout_kcal: number | null;
  } | null;
  strengthAggregationMode: StrengthAggregationMode;
  trackedMuscleGroups: TrackedMuscleGroup[];
  muscleGroupStrengthSeries: Record<TrackedMuscleGroup, StrengthTimeSeriesPoint[]>;
  selectedExercisesByMuscleGroup: Record<TrackedMuscleGroup, string[]>;
  exerciseStrengthSeries: Record<string, StrengthTimeSeriesPoint[]>;
  exerciseNames: string[];
  exerciseNamesByCategory: Record<ExerciseTrendCategory, string[]>;
};
