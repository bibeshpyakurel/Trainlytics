import { supabase } from "@/lib/supabaseClient";
import { getCurrentSessionUser } from "@/lib/authSession";
import {
  aggregateSessionStrengthByDate,
  computeSessionStrengthByExerciseDate,
  type StrengthSetLog,
} from "@/lib/dashboardStrength";
import { buildInsightsView } from "@/lib/insightsView";
import type { InsightMetricPoint, InsightsLoadResult } from "@/lib/insightsTypes";
import { toKg } from "@/lib/convertWeight";
import { TABLES } from "@/lib/dbNames";

export async function loadInsightsData(): Promise<InsightsLoadResult> {
  const authState = await getCurrentSessionUser();
  if (authState.status === "error") {
    return { status: "error", message: authState.message };
  }

  if (authState.status === "unauthenticated") {
    return { status: "unauthenticated" };
  }

  const { user, userId } = authState;

  const [bodyweightRes, caloriesRes, metabolicRes, workoutSetsRes, workoutSessionsRes, exercisesRes, profileRes] = await Promise.all([
    supabase
      .from(TABLES.bodyweightLogs)
      .select("log_date,weight_input,unit_input,weight_kg")
      .eq("user_id", userId)
      .order("log_date", { ascending: true }),
    supabase
      .from(TABLES.caloriesLogs)
      .select("log_date,pre_workout_kcal,post_workout_kcal")
      .eq("user_id", userId)
      .order("log_date", { ascending: true }),
    supabase
      .from(TABLES.metabolicActivityLogs)
      .select("log_date,estimated_kcal_spent")
      .eq("user_id", userId)
      .order("log_date", { ascending: true }),
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
    bodyweightRes.error ||
    caloriesRes.error ||
    metabolicRes.error ||
    workoutSetsRes.error ||
    workoutSessionsRes.error ||
    exercisesRes.error
  ) {
    return {
      status: "error",
      message:
        bodyweightRes.error?.message ||
        caloriesRes.error?.message ||
        metabolicRes.error?.message ||
        workoutSetsRes.error?.message ||
        workoutSessionsRes.error?.message ||
        exercisesRes.error?.message ||
        "Failed to load insights.",
    };
  }

  const bodyweightSeries: InsightMetricPoint[] = ((bodyweightRes.data ?? []) as Array<{
    log_date: string;
    weight_input: number;
    unit_input: "kg" | "lb";
    weight_kg: number | null;
  }>).map((row) => ({
    date: row.log_date,
    value: row.weight_kg != null ? Number(row.weight_kg) : toKg(Number(row.weight_input), row.unit_input),
  }));

  const caloriesSeries: InsightMetricPoint[] = ((caloriesRes.data ?? []) as Array<{
    log_date: string;
    pre_workout_kcal: number | null;
    post_workout_kcal: number | null;
  }>).map((row) => ({
    date: row.log_date,
    value: Number(row.pre_workout_kcal ?? 0) + Number(row.post_workout_kcal ?? 0),
  }));

  const metabolicActivitySeries: InsightMetricPoint[] = ((metabolicRes.data ?? []) as Array<{
    log_date: string;
    estimated_kcal_spent: number;
  }>).map((row) => ({
    date: row.log_date,
    value: Number(row.estimated_kcal_spent),
  }));

  const intakeByDate = new Map(caloriesSeries.map((point) => [point.date, point.value]));
  const spendByDate = new Map(metabolicActivitySeries.map((point) => [point.date, point.value]));
  const netEnergySeries: InsightMetricPoint[] = [...intakeByDate.entries()]
    .filter(([date]) => spendByDate.has(date))
    .map(([date, intake]) => ({
      date,
      value: intake - Number(spendByDate.get(date) ?? 0),
    }));

  const sessionDateById = new Map<string, string>();
  for (const sessionRow of (workoutSessionsRes.data ?? []) as Array<{ id: string; session_date: string }>) {
    sessionDateById.set(sessionRow.id, sessionRow.session_date);
  }

  const exerciseMetaById = new Map<string, { name: string; muscleGroup: string | null }>();
  for (const exerciseRow of (exercisesRes.data ?? []) as Array<{ id: string; name: string; muscle_group: string }>) {
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
      setNumber: Number(setRow.set_number),
      reps: Number(setRow.reps),
      weight: Number(setRow.weight_input),
    });
  }

  const sessionScores = computeSessionStrengthByExerciseDate(strengthRows);
  const strengthSeries = aggregateSessionStrengthByDate(
    sessionScores.map((row) => ({
      date: row.date,
      sessionStrength: row.sessionStrength,
      exerciseName: row.exerciseName,
      setSummary: row.setSummary,
    })),
    "sum"
  ).map((point) => ({ date: point.date, value: point.score }));

  const insights = buildInsightsView({
    bodyweightSeries,
    caloriesSeries,
    metabolicActivitySeries,
    netEnergySeries,
    strengthSeries,
  });
  const firstName = profileRes.error ? null : ((profileRes.data?.first_name as string | null | undefined) ?? null);

  return {
    status: "ok",
    data: {
      email: user.email ?? "Athlete",
      firstName,
      ...insights,
      bodyweightSeries,
      caloriesSeries,
      metabolicActivitySeries,
      netEnergySeries,
      strengthSeries,
    },
  };
}
