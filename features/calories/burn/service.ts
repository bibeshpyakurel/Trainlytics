import { supabase } from "@/lib/supabaseClient";
import { TABLES } from "@/lib/dbNames";
import { getCurrentUserIdFromSession } from "@/lib/authSession";
import type { MetabolicActivityLog, PendingBurnOverwrite } from "@/features/calories/burn/types";
import { refreshEnergyMetricsAfterWrite } from "@/lib/dailyEnergyMetrics";

async function getExistingBurnLogDateSafe(userId: string, logId: string | number) {
  try {
    const { data } = await supabase
      .from(TABLES.metabolicActivityLogs)
      .select("log_date")
      .eq("id", String(logId))
      .eq("user_id", userId)
      .maybeSingle();
    return data?.log_date ?? null;
  } catch {
    return null;
  }
}

const DEFAULT_BURN_LOG_FETCH_LIMIT = 400;

export async function getCurrentUserId(): Promise<{ userId: string | null; error: string | null }> {
  return getCurrentUserIdFromSession();
}

export async function loadBurnLogsForCurrentUser(options?: { limit?: number }): Promise<{
  logs: MetabolicActivityLog[];
  error: string | null;
}> {
  const { userId, error: userError } = await getCurrentUserId();
  if (userError) {
    return { logs: [], error: userError };
  }

  if (!userId) {
    return { logs: [], error: null };
  }

  const fetchLimit = options?.limit ?? DEFAULT_BURN_LOG_FETCH_LIMIT;

  const { data, error } = await supabase
    .from(TABLES.metabolicActivityLogs)
    .select("id,log_date,estimated_kcal_spent,source")
    .eq("user_id", userId)
    .order("log_date", { ascending: false })
    .limit(fetchLimit);

  if (error) {
    return { logs: [], error: error.message };
  }

  return { logs: (data ?? []) as MetabolicActivityLog[], error: null };
}

export async function upsertBurnEntry(payload: PendingBurnOverwrite): Promise<string | null> {
  if (!Number.isFinite(payload.estimatedKcalSpent) || payload.estimatedKcalSpent < 0) {
    return "Active calories must be 0 or greater.";
  }

  const { error } = await supabase
    .from(TABLES.metabolicActivityLogs)
    .upsert(
      {
        user_id: payload.userId,
        log_date: payload.logDate,
        estimated_kcal_spent: payload.estimatedKcalSpent,
        source: payload.source,
      },
      { onConflict: "user_id,log_date" }
    );

  if (error) return error.message;
  await refreshEnergyMetricsAfterWrite({
    source: "calories_burn",
    userId: payload.userId,
    touchedDates: [payload.logDate],
  });
  return null;
}

export async function getBurnLogForDate(
  userId: string,
  logDate: string
): Promise<{
  log: Pick<MetabolicActivityLog, "id" | "log_date" | "estimated_kcal_spent" | "source"> | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(TABLES.metabolicActivityLogs)
    .select("id,log_date,estimated_kcal_spent,source")
    .eq("user_id", userId)
    .eq("log_date", logDate)
    .maybeSingle();

  if (error) {
    return { log: null, error: error.message };
  }

  return {
    log: (data as Pick<MetabolicActivityLog, "id" | "log_date" | "estimated_kcal_spent" | "source"> | null) ?? null,
    error: null,
  };
}

export async function deleteBurnLogForCurrentUser(
  logId: string | number
): Promise<{ deleted: boolean; error: string | null }> {
  const { userId, error: userError } = await getCurrentUserId();
  if (userError) {
    return { deleted: false, error: userError };
  }

  if (!userId) {
    return { deleted: false, error: "Not logged in." };
  }

  const existingLogDate = await getExistingBurnLogDateSafe(userId, logId);

  const { error } = await supabase
    .from(TABLES.metabolicActivityLogs)
    .delete()
    .eq("id", String(logId))
    .eq("user_id", userId);

  if (error) {
    return { deleted: false, error: error.message };
  }

  if (existingLogDate) {
    await refreshEnergyMetricsAfterWrite({
      source: "calories_burn",
      userId,
      touchedDates: [existingLogDate],
    });
  }
  return { deleted: true, error: null };
}

export async function updateBurnLogForCurrentUser(
  logId: string | number,
  payload: {
    logDate: string;
    estimatedKcalSpent: number;
    source: string | null;
  }
): Promise<string | null> {
  const { userId, error: userError } = await getCurrentUserId();
  if (userError) {
    return userError;
  }

  if (!userId) {
    return "Not logged in.";
  }

  if (!Number.isFinite(payload.estimatedKcalSpent) || payload.estimatedKcalSpent < 0) {
    return "Active calories must be 0 or greater.";
  }

  const existingLogDate = await getExistingBurnLogDateSafe(userId, logId);

  const { error } = await supabase
    .from(TABLES.metabolicActivityLogs)
    .update({
      log_date: payload.logDate,
      estimated_kcal_spent: payload.estimatedKcalSpent,
      source: payload.source,
    })
    .eq("id", String(logId))
    .eq("user_id", userId);

  if (error) return error.message;

  const touchedDates = existingLogDate && existingLogDate !== payload.logDate
    ? [existingLogDate, payload.logDate]
    : [payload.logDate];
  await refreshEnergyMetricsAfterWrite({
    source: "calories_burn",
    userId,
    touchedDates,
  });
  return null;
}
