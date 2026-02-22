import { supabase } from "@/lib/supabaseClient";
import { getCurrentSessionUser } from "@/lib/authSession";
import {
  buildMuscleGroupStrengthDatasets,
  buildStrengthProgressDatasets,
  computeSessionStrengthByExerciseDate,
  mapToExerciseTrendCategory,
  type ExerciseTrendCategory,
  type StrengthAggregationMode,
  type StrengthSetLog,
} from "@/lib/dashboardStrength";
import type { DashboardData } from "@/lib/dashboardTypes";
import { TABLES } from "@/lib/dbNames";

export type DashboardLoadResult =
  | { status: "ok"; data: DashboardData }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

const DEFAULT_STRENGTH_AGGREGATION_MODE: StrengthAggregationMode = "sum";

export async function loadDashboardData(): Promise<DashboardLoadResult> {
  const authState = await getCurrentSessionUser();
  if (authState.status === "error") {
    return { status: "error", message: authState.message };
  }

  if (authState.status === "unauthenticated") {
    return { status: "unauthenticated" };
  }

  const { user, userId } = authState;

  const [
    latestWorkoutRes,
    latestBodyweightRes,
    latestCaloriesRes,
    workoutSetsRes,
    workoutSessionsRes,
    exercisesRes,
    profileRes,
  ] =
    await Promise.all([
      supabase
        .from(TABLES.workoutSessions)
        .select("session_date,split")
        .eq("user_id", userId)
        .order("session_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from(TABLES.bodyweightLogs)
        .select("log_date,weight_input,unit_input")
        .eq("user_id", userId)
        .order("log_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from(TABLES.caloriesLogs)
        .select("log_date,pre_workout_kcal,post_workout_kcal")
        .eq("user_id", userId)
        .order("log_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from(TABLES.workoutSets)
        .select("session_id,exercise_id,set_number,reps,weight_input")
        .eq("user_id", userId)
        .not("reps", "is", null)
        .not("weight_input", "is", null),
      supabase
        .from(TABLES.workoutSessions)
        .select("id,session_date")
        .eq("user_id", userId),
      supabase
        .from(TABLES.exercises)
        .select("id,name,muscle_group")
        .eq("user_id", userId),
      supabase
        .from(TABLES.profiles)
        .select("first_name")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  if (
    latestWorkoutRes.error ||
    latestBodyweightRes.error ||
    latestCaloriesRes.error ||
    workoutSetsRes.error ||
    workoutSessionsRes.error ||
    exercisesRes.error
  ) {
    return {
      status: "error",
      message:
        latestWorkoutRes.error?.message ||
        latestCaloriesRes.error?.message ||
        latestBodyweightRes.error?.message ||
        workoutSetsRes.error?.message ||
        workoutSessionsRes.error?.message ||
        exercisesRes.error?.message ||
        "Failed to load dashboard.",
    };
  }

  const sessionDateById = new Map<string, string>();
  for (const sessionRow of (workoutSessionsRes.data ?? []) as Array<{
    id: string;
    session_date: string;
  }>) {
    sessionDateById.set(sessionRow.id, sessionRow.session_date);
  }

  const exerciseMetaById = new Map<string, { name: string; muscleGroup: string | null }>();
  for (const exerciseRow of (exercisesRes.data ?? []) as Array<{
    id: string;
    name: string;
    muscle_group: string;
  }>) {
    exerciseMetaById.set(exerciseRow.id, {
      name: exerciseRow.name,
      muscleGroup: exerciseRow.muscle_group,
    });
  }

  const strengthRows: StrengthSetLog[] = [];
  for (const setRow of (workoutSetsRes.data ?? []) as Array<{
    session_id: string;
    exercise_id: string;
    set_number: number;
    reps: number;
    weight_input: number;
  }>) {
    const sessionDate = sessionDateById.get(setRow.session_id);
    const exerciseMeta = exerciseMetaById.get(setRow.exercise_id);

    if (!sessionDate || !exerciseMeta) continue;

    strengthRows.push({
      date: sessionDate,
      exerciseName: exerciseMeta.name,
      muscleGroup: exerciseMeta.muscleGroup,
      setNumber: setRow.set_number,
      weight: Number(setRow.weight_input),
      reps: Number(setRow.reps),
    });
  }

  const sessionStrengthScores = computeSessionStrengthByExerciseDate(strengthRows);
  const strengthDatasets = buildStrengthProgressDatasets(
    sessionStrengthScores,
    DEFAULT_STRENGTH_AGGREGATION_MODE
  );
  const muscleGroupDatasets = buildMuscleGroupStrengthDatasets(
    sessionStrengthScores,
    DEFAULT_STRENGTH_AGGREGATION_MODE,
    2
  );

  const exerciseCategoryByName = new Map<string, ExerciseTrendCategory>();
  for (const row of sessionStrengthScores) {
    if (!exerciseCategoryByName.has(row.exerciseName)) {
      exerciseCategoryByName.set(row.exerciseName, mapToExerciseTrendCategory(row.muscleGroup));
    }
  }

  const exerciseNamesByCategory: Record<ExerciseTrendCategory, string[]> = {
    push: [],
    pull: [],
    legs: [],
    core: [],
  };

  for (const exerciseName of strengthDatasets.exerciseNames) {
    const category = exerciseCategoryByName.get(exerciseName) ?? "core";
    exerciseNamesByCategory[category].push(exerciseName);
  }
  const firstName = profileRes.error ? null : ((profileRes.data?.first_name as string | null | undefined) ?? null);

  return {
    status: "ok",
    data: {
      email: user.email ?? "Athlete",
      firstName,
      latestWorkout: (latestWorkoutRes.data as DashboardData["latestWorkout"]) ?? null,
      latestBodyweight: (latestBodyweightRes.data as DashboardData["latestBodyweight"]) ?? null,
      latestCalories: (latestCaloriesRes.data as DashboardData["latestCalories"]) ?? null,
      strengthAggregationMode: DEFAULT_STRENGTH_AGGREGATION_MODE,
      trackedMuscleGroups: muscleGroupDatasets.muscleGroups,
      muscleGroupStrengthSeries: muscleGroupDatasets.seriesByMuscleGroup,
      selectedExercisesByMuscleGroup: muscleGroupDatasets.selectedExercisesByMuscleGroup,
      exerciseStrengthSeries: strengthDatasets.byExercise,
      exerciseNames: strengthDatasets.exerciseNames,
      exerciseNamesByCategory,
    },
  };
}
