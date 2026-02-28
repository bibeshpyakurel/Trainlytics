import { supabase } from "@/lib/supabaseClient";
import type { CaloriesLog, PendingOverwrite } from "@/features/calories/intake/types";
import { TABLES } from "@/lib/dbNames";
import { getCurrentUserIdFromSession } from "@/lib/authSession";
import { refreshEnergyMetricsAfterWrite } from "@/lib/dailyEnergyMetrics";

async function getExistingCaloriesLogDateSafe(userId: string, logId: string | number) {
  try {
    const { data } = await supabase
      .from(TABLES.caloriesLogs)
      .select("log_date")
      .eq("id", String(logId))
      .eq("user_id", userId)
      .maybeSingle();
    return data?.log_date ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentUserId(): Promise<{ userId: string | null; error: string | null }> {
  return getCurrentUserIdFromSession();
}

const DEFAULT_CALORIES_LOG_FETCH_LIMIT = 400;

export async function loadCaloriesLogsForCurrentUser(options?: { limit?: number }): Promise<{
  logs: CaloriesLog[];
  error: string | null;
}> {
  const { userId, error: userError } = await getCurrentUserId();
  if (userError) {
    return { logs: [], error: userError };
  }

  if (!userId) {
    return { logs: [], error: null };
  }

  const fetchLimit = options?.limit ?? DEFAULT_CALORIES_LOG_FETCH_LIMIT;

  const { data, error } = await supabase
    .from(TABLES.caloriesLogs)
    .select("id,log_date,pre_workout_kcal,post_workout_kcal")
    .eq("user_id", userId)
    .order("log_date", { ascending: false })
    .limit(fetchLimit);

  if (error) {
    return { logs: [], error: error.message };
  }

  return { logs: (data ?? []) as CaloriesLog[], error: null };
}

export async function upsertCaloriesEntry(payload: PendingOverwrite): Promise<string | null> {
  const pre = payload.preWorkoutKcal;
  const post = payload.postWorkoutKcal;
  if (pre == null && post == null) {
    return "At least one calorie value is required.";
  }
  if (pre != null && (!Number.isFinite(pre) || pre < 0)) {
    return "Pre-workout calories must be 0 or greater.";
  }
  if (post != null && (!Number.isFinite(post) || post < 0)) {
    return "Post-workout calories must be 0 or greater.";
  }

  const { error } = await supabase
    .from(TABLES.caloriesLogs)
    .upsert(
      {
        user_id: payload.userId,
        log_date: payload.logDate,
        pre_workout_kcal: payload.preWorkoutKcal,
        post_workout_kcal: payload.postWorkoutKcal,
      },
      { onConflict: "user_id,log_date" }
    );

  if (error) return error.message;
  await refreshEnergyMetricsAfterWrite({
    source: "calories_intake",
    userId: payload.userId,
    touchedDates: [payload.logDate],
  });
  return null;
}

export async function getCaloriesLogForDate(
  userId: string,
  logDate: string
): Promise<{
  log: Pick<CaloriesLog, "id" | "log_date" | "pre_workout_kcal" | "post_workout_kcal"> | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(TABLES.caloriesLogs)
    .select("id,log_date,pre_workout_kcal,post_workout_kcal")
    .eq("user_id", userId)
    .eq("log_date", logDate)
    .maybeSingle();

  if (error) {
    return { log: null, error: error.message };
  }

  return {
    log: (data as Pick<CaloriesLog, "id" | "log_date" | "pre_workout_kcal" | "post_workout_kcal"> | null) ?? null,
    error: null,
  };
}

export async function deleteCaloriesLogForCurrentUser(
  logId: string | number
): Promise<{ deleted: boolean; error: string | null }> {
  const { userId, error: userError } = await getCurrentUserId();
  if (userError) {
    return { deleted: false, error: userError };
  }

  if (!userId) {
    return { deleted: false, error: "Not logged in." };
  }

  const existingLogDate = await getExistingCaloriesLogDateSafe(userId, logId);

  const { error } = await supabase
    .from(TABLES.caloriesLogs)
    .delete()
    .eq("id", String(logId))
    .eq("user_id", userId);

  if (error) {
    return { deleted: false, error: error.message };
  }

  if (existingLogDate) {
    await refreshEnergyMetricsAfterWrite({
      source: "calories_intake",
      userId,
      touchedDates: [existingLogDate],
    });
  }
  return { deleted: true, error: null };
}

export async function updateCaloriesLogForCurrentUser(
  logId: string | number,
  payload: {
    logDate: string;
    preWorkoutKcal: number | null;
    postWorkoutKcal: number | null;
  }
): Promise<string | null> {
  const { userId, error: userError } = await getCurrentUserId();
  if (userError) {
    return userError;
  }

  if (!userId) {
    return "Not logged in.";
  }

  if (payload.preWorkoutKcal == null && payload.postWorkoutKcal == null) {
    return "At least one calorie value is required.";
  }
  if (payload.preWorkoutKcal != null && (!Number.isFinite(payload.preWorkoutKcal) || payload.preWorkoutKcal < 0)) {
    return "Pre-workout calories must be 0 or greater.";
  }
  if (payload.postWorkoutKcal != null && (!Number.isFinite(payload.postWorkoutKcal) || payload.postWorkoutKcal < 0)) {
    return "Post-workout calories must be 0 or greater.";
  }

  const existingLogDate = await getExistingCaloriesLogDateSafe(userId, logId);

  const { error } = await supabase
    .from(TABLES.caloriesLogs)
    .update({
      log_date: payload.logDate,
      pre_workout_kcal: payload.preWorkoutKcal,
      post_workout_kcal: payload.postWorkoutKcal,
    })
    .eq("id", String(logId))
    .eq("user_id", userId);

  if (error) return error.message;

  const touchedDates = existingLogDate && existingLogDate !== payload.logDate
    ? [existingLogDate, payload.logDate]
    : [payload.logDate];
  await refreshEnergyMetricsAfterWrite({
    source: "calories_intake",
    userId,
    touchedDates,
  });
  return null;
}
