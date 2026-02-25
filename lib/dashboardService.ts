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
import { toKg, type Unit } from "@/lib/convertWeight";
import { getLocalIsoDateDaysAgo } from "@/lib/localDate";

export type DashboardLoadResult =
  | { status: "ok"; data: DashboardData }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

export type DashboardChartWindow = "90d" | "180d" | "all";

const DEFAULT_STRENGTH_AGGREGATION_MODE: StrengthAggregationMode = "sum";

type WorkoutSetRowForStrength = {
  session_id: string;
  exercise_id: string;
  set_number: number;
  reps: number;
  weight_input: number | null;
  unit_input: Unit | null;
  weight_kg: number | null;
};

type WorkoutSessionRow = { id: string; session_date: string };
type ExerciseMetaRow = { id: string; name: string; muscle_group: string };
type LatestWorkoutRow = { session_date: string; split: DashboardData["latestWorkout"] extends infer T ? T extends { split: infer S } ? S : never : never } | null;
type LatestBodyweightRow = { log_date: string; weight_input: number; unit_input: DashboardData["latestBodyweight"] extends infer T ? T extends { unit_input: infer U } ? U : never : never } | null;
type LatestCaloriesRow = { log_date: string; pre_workout_kcal: number | null; post_workout_kcal: number | null } | null;
type LatestMetabolicRow = { log_date: string; estimated_kcal_spent: number } | null;
type CaloriesByDateRow = { log_date: string; pre_workout_kcal: number | null; post_workout_kcal: number | null };
type MetabolicByDateRow = { log_date: string; estimated_kcal_spent: number };

export function getDashboardWindowStartIso(window: DashboardChartWindow): string | null {
  if (window === "90d") return getLocalIsoDateDaysAgo(89);
  if (window === "180d") return getLocalIsoDateDaysAgo(179);
  return null;
}

export function buildStrengthRowsFromWorkoutData(
  workoutSetRows: WorkoutSetRowForStrength[],
  workoutSessions: WorkoutSessionRow[],
  exercises: ExerciseMetaRow[]
): StrengthSetLog[] {
  const sessionDateById = new Map<string, string>();
  for (const sessionRow of workoutSessions) {
    sessionDateById.set(sessionRow.id, sessionRow.session_date);
  }

  const exerciseMetaById = new Map<string, { name: string; muscleGroup: string | null }>();
  for (const exerciseRow of exercises) {
    exerciseMetaById.set(exerciseRow.id, {
      name: exerciseRow.name,
      muscleGroup: exerciseRow.muscle_group,
    });
  }

  const strengthRows: StrengthSetLog[] = [];
  for (const setRow of workoutSetRows) {
    const sessionDate = sessionDateById.get(setRow.session_id);
    const exerciseMeta = exerciseMetaById.get(setRow.exercise_id);
    if (!sessionDate || !exerciseMeta) continue;

    const normalizedWeightKg =
      setRow.weight_kg != null
        ? Number(setRow.weight_kg)
        : setRow.weight_input != null && setRow.unit_input != null
          ? toKg(Number(setRow.weight_input), setRow.unit_input)
          : null;
    if (normalizedWeightKg == null || !Number.isFinite(normalizedWeightKg) || normalizedWeightKg < 0) {
      continue;
    }

    strengthRows.push({
      date: sessionDate,
      exerciseName: exerciseMeta.name,
      muscleGroup: exerciseMeta.muscleGroup,
      setNumber: Number(setRow.set_number),
      reps: Number(setRow.reps),
      weight: normalizedWeightKg,
    });
  }

  return strengthRows;
}

export function buildDashboardDataFromResults(input: {
  userEmail: string | null | undefined;
  firstName: string | null;
  latestWorkout: LatestWorkoutRow;
  latestBodyweight: LatestBodyweightRow;
  latestCalories: LatestCaloriesRow;
  latestMetabolicBurn: LatestMetabolicRow;
  caloriesSeriesRows: CaloriesByDateRow[];
  metabolicSeriesRows: MetabolicByDateRow[];
  calories7dRows: CaloriesByDateRow[];
  metabolic7dRows: MetabolicByDateRow[];
  workoutSetRows: WorkoutSetRowForStrength[];
  workoutSessions: WorkoutSessionRow[];
  exercises: ExerciseMetaRow[];
}): DashboardData {
  const strengthRows = buildStrengthRowsFromWorkoutData(
    input.workoutSetRows,
    input.workoutSessions,
    input.exercises
  );

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

  const intakeByDate = new Map<string, number>();
  for (const row of input.caloriesSeriesRows) {
    intakeByDate.set(row.log_date, Number(row.pre_workout_kcal ?? 0) + Number(row.post_workout_kcal ?? 0));
  }

  const spendByDate = new Map<string, number>();
  for (const row of input.metabolicSeriesRows) {
    spendByDate.set(row.log_date, Number(row.estimated_kcal_spent));
  }

  const unionDates = new Set<string>([...intakeByDate.keys(), ...spendByDate.keys()]);
  const energyBalanceSeries = [...unionDates]
    .sort((a, b) => a.localeCompare(b))
    .map((date) => {
      const intake = intakeByDate.get(date) ?? null;
      const spend = spendByDate.get(date) ?? null;
      return {
        date,
        intakeKcal: intake,
        spendKcal: spend,
        netKcal: intake != null && spend != null ? intake - spend : null,
      };
    });

  const calories7dValues = input.calories7dRows.map((row) => Number(row.pre_workout_kcal ?? 0) + Number(row.post_workout_kcal ?? 0));
  const metabolic7dValues = input.metabolic7dRows.map((row) => Number(row.estimated_kcal_spent));
  const avgCalories7d = calories7dValues.length
    ? calories7dValues.reduce((sum, value) => sum + value, 0) / calories7dValues.length
    : null;
  const avgBurn7d = metabolic7dValues.length
    ? metabolic7dValues.reduce((sum, value) => sum + value, 0) / metabolic7dValues.length
    : null;
  const netEnergy7d = avgCalories7d != null && avgBurn7d != null ? avgCalories7d - avgBurn7d : null;

  const bothLoggedDays = energyBalanceSeries.reduce((count, row) => (
    row.intakeKcal != null && row.spendKcal != null ? count + 1 : count
  ), 0);
  const energyDataCompletenessPct = energyBalanceSeries.length > 0
    ? (bothLoggedDays / energyBalanceSeries.length) * 100
    : 0;

  return {
    email: input.userEmail ?? "Athlete",
    firstName: input.firstName,
    latestWorkout: input.latestWorkout,
    latestBodyweight: input.latestBodyweight,
    latestCalories: input.latestCalories,
    latestMetabolicBurn: input.latestMetabolicBurn,
    avgCalories7d,
    avgBurn7d,
    netEnergy7d,
    energyDataCompletenessPct,
    energyBalanceSeries,
    strengthAggregationMode: DEFAULT_STRENGTH_AGGREGATION_MODE,
    trackedMuscleGroups: muscleGroupDatasets.muscleGroups,
    muscleGroupStrengthSeries: muscleGroupDatasets.seriesByMuscleGroup,
    selectedExercisesByMuscleGroup: muscleGroupDatasets.selectedExercisesByMuscleGroup,
    exerciseStrengthSeries: strengthDatasets.byExercise,
    exerciseNames: strengthDatasets.exerciseNames,
    exerciseNamesByCategory,
  };
}

export async function loadDashboardData(window: DashboardChartWindow = "all"): Promise<DashboardLoadResult> {
  const authState = await getCurrentSessionUser();
  if (authState.status === "error") {
    return { status: "error", message: authState.message };
  }

  if (authState.status === "unauthenticated") {
    return { status: "unauthenticated" };
  }

  const { user, userId } = authState;

  const windowStartIso = getDashboardWindowStartIso(window);
  let workoutSessionsQuery = supabase
    .from(TABLES.workoutSessions)
    .select("id,session_date")
    .eq("user_id", userId);
  if (windowStartIso) {
    workoutSessionsQuery = workoutSessionsQuery.gte("session_date", windowStartIso);
  }

  let caloriesSeriesQuery = supabase
    .from(TABLES.caloriesLogs)
    .select("log_date,pre_workout_kcal,post_workout_kcal")
    .eq("user_id", userId)
    .order("log_date", { ascending: true });
  if (windowStartIso) {
    caloriesSeriesQuery = caloriesSeriesQuery.gte("log_date", windowStartIso);
  }

  let metabolicSeriesQuery = supabase
    .from(TABLES.metabolicActivityLogs)
    .select("log_date,estimated_kcal_spent")
    .eq("user_id", userId)
    .order("log_date", { ascending: true });
  if (windowStartIso) {
    metabolicSeriesQuery = metabolicSeriesQuery.gte("log_date", windowStartIso);
  }

  const sevenDaysAgoIso = getLocalIsoDateDaysAgo(6);

  const [latestWorkoutRes, latestBodyweightRes, latestCaloriesRes, latestMetabolicRes, caloriesSeriesRes, metabolicSeriesRes, calories7dRes, metabolic7dRes, workoutSessionsRes, exercisesRes, profileRes] =
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
        .from(TABLES.metabolicActivityLogs)
        .select("log_date,estimated_kcal_spent")
        .eq("user_id", userId)
        .order("log_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      caloriesSeriesQuery,
      metabolicSeriesQuery,
      supabase
        .from(TABLES.caloriesLogs)
        .select("log_date,pre_workout_kcal,post_workout_kcal")
        .eq("user_id", userId)
        .gte("log_date", sevenDaysAgoIso),
      supabase
        .from(TABLES.metabolicActivityLogs)
        .select("log_date,estimated_kcal_spent")
        .eq("user_id", userId)
        .gte("log_date", sevenDaysAgoIso),
      workoutSessionsQuery,
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

  const windowSessionIds = ((workoutSessionsRes.data ?? []) as WorkoutSessionRow[]).map((row) => row.id);
  const workoutSetsRes = windowSessionIds.length
    ? await supabase
        .from(TABLES.workoutSets)
        .select("session_id,exercise_id,set_number,reps,weight_input,unit_input,weight_kg")
        .eq("user_id", userId)
        .in("session_id", windowSessionIds)
        .not("reps", "is", null)
        .not("weight_input", "is", null)
    : { data: [], error: null };

  if (
    latestWorkoutRes.error ||
    latestBodyweightRes.error ||
      latestCaloriesRes.error ||
      latestMetabolicRes.error ||
      caloriesSeriesRes.error ||
      metabolicSeriesRes.error ||
      calories7dRes.error ||
      metabolic7dRes.error ||
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
        latestMetabolicRes.error?.message ||
        caloriesSeriesRes.error?.message ||
        metabolicSeriesRes.error?.message ||
        calories7dRes.error?.message ||
        metabolic7dRes.error?.message ||
        workoutSetsRes.error?.message ||
        workoutSessionsRes.error?.message ||
        exercisesRes.error?.message ||
        "Failed to load dashboard.",
    };
  }

  const firstName = profileRes.error ? null : ((profileRes.data?.first_name as string | null | undefined) ?? null);

  return {
    status: "ok",
    data: buildDashboardDataFromResults({
      userEmail: user.email,
      firstName,
      latestWorkout: (latestWorkoutRes.data as DashboardData["latestWorkout"]) ?? null,
      latestBodyweight: (latestBodyweightRes.data as DashboardData["latestBodyweight"]) ?? null,
      latestCalories: (latestCaloriesRes.data as DashboardData["latestCalories"]) ?? null,
      latestMetabolicBurn: (latestMetabolicRes.data as DashboardData["latestMetabolicBurn"]) ?? null,
      caloriesSeriesRows: (caloriesSeriesRes.data ?? []) as CaloriesByDateRow[],
      metabolicSeriesRows: (metabolicSeriesRes.data ?? []) as MetabolicByDateRow[],
      calories7dRows: (calories7dRes.data ?? []) as CaloriesByDateRow[],
      metabolic7dRows: (metabolic7dRes.data ?? []) as MetabolicByDateRow[],
      workoutSetRows: (workoutSetsRes.data ?? []) as WorkoutSetRowForStrength[],
      workoutSessions: (workoutSessionsRes.data ?? []) as WorkoutSessionRow[],
      exercises: (exercisesRes.data ?? []) as ExerciseMetaRow[],
    }),
  };
}
