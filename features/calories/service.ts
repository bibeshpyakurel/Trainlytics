import { supabase } from "@/lib/supabaseClient";
import type { CaloriesLog, PendingOverwrite } from "@/features/calories/types";
import { TABLES } from "@/lib/dbNames";
import { getCurrentUserIdFromSession } from "@/lib/authSession";

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

  return error ? error.message : null;
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

  const { error } = await supabase
    .from(TABLES.caloriesLogs)
    .delete()
    .eq("id", String(logId))
    .eq("user_id", userId);

  if (error) {
    return { deleted: false, error: error.message };
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

  const { error } = await supabase
    .from(TABLES.caloriesLogs)
    .update({
      log_date: payload.logDate,
      pre_workout_kcal: payload.preWorkoutKcal,
      post_workout_kcal: payload.postWorkoutKcal,
    })
    .eq("id", String(logId))
    .eq("user_id", userId);

  return error ? error.message : null;
}
