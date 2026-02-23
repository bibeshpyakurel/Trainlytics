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
  firstName: string | null;
  latestWorkout: { session_date: string; split: Split } | null;
  latestBodyweight: { log_date: string; weight_input: number; unit_input: Unit } | null;
  latestCalories: {
    log_date: string;
    pre_workout_kcal: number | null;
    post_workout_kcal: number | null;
  } | null;
  latestMetabolicBurn: {
    log_date: string;
    estimated_kcal_spent: number;
  } | null;
  avgCalories7d: number | null;
  avgBurn7d: number | null;
  netEnergy7d: number | null;
  energyDataCompletenessPct: number;
  energyBalanceSeries: Array<{
    date: string;
    intakeKcal: number | null;
    spendKcal: number | null;
    netKcal: number | null;
  }>;
  strengthAggregationMode: StrengthAggregationMode;
  trackedMuscleGroups: TrackedMuscleGroup[];
  muscleGroupStrengthSeries: Record<TrackedMuscleGroup, StrengthTimeSeriesPoint[]>;
  selectedExercisesByMuscleGroup: Record<TrackedMuscleGroup, string[]>;
  exerciseStrengthSeries: Record<string, StrengthTimeSeriesPoint[]>;
  exerciseNames: string[];
  exerciseNamesByCategory: Record<ExerciseTrendCategory, string[]>;
};
