import { toKg } from "@/lib/convertWeight";
import { supabase } from "@/lib/supabaseClient";
import type { BodyweightLog, PendingOverwrite } from "@/features/bodyweight/types";
import { TABLES } from "@/lib/dbNames";
import { getCurrentUserIdFromSession } from "@/lib/authSession";
import { refreshEnergyMetricsAfterWrite } from "@/lib/dailyEnergyMetrics";

async function getExistingBodyweightLogDateSafe(userId: string, logId: string | number) {
  try {
    const { data } = await supabase
      .from(TABLES.bodyweightLogs)
      .select("log_date")
      .eq("id", String(logId))
      .eq("user_id", userId)
      .maybeSingle();
    return data?.log_date ?? null;
  } catch {
    return null;
  }
}

export async function loadBodyweightLogsForCurrentUser(): Promise<{
  logs: BodyweightLog[];
  error: string | null;
}> {
  const { userId, error: userError } = await getCurrentUserIdFromSession();
  if (userError) {
    return { logs: [], error: userError };
  }

  if (!userId) {
    return { logs: [], error: null };
  }

  const { data, error } = await supabase
    .from(TABLES.bodyweightLogs)
    .select("*")
    .eq("user_id", userId)
    .order("log_date", { ascending: false });

  if (error) {
    return { logs: [], error: error.message };
  }

  return { logs: (data ?? []) as BodyweightLog[], error: null };
}

export async function upsertBodyweightEntry(payload: PendingOverwrite): Promise<string | null> {
  if (!Number.isFinite(payload.weightNum) || payload.weightNum <= 0) {
    return "Weight must be a valid number greater than 0.";
  }
  if (payload.inputUnit !== "kg" && payload.inputUnit !== "lb") {
    return "Weight unit must be kg or lb.";
  }

  const { error } = await supabase
    .from(TABLES.bodyweightLogs)
    .upsert(
      {
        user_id: payload.userId,
        log_date: payload.logDate,
        weight_input: payload.weightNum,
        unit_input: payload.inputUnit,
        weight_kg: toKg(payload.weightNum, payload.inputUnit),
      },
      { onConflict: "user_id,log_date" }
    );

  if (error) return error.message;
  await refreshEnergyMetricsAfterWrite({
    source: "bodyweight",
    userId: payload.userId,
    touchedDates: [payload.logDate],
    refreshMaintenanceCurrent: true,
  });
  return null;
}

export async function bodyweightEntryExistsForDate(
  userId: string,
  logDate: string
): Promise<{ exists: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from(TABLES.bodyweightLogs)
    .select("id")
    .eq("user_id", userId)
    .eq("log_date", logDate)
    .limit(1);

  if (error) {
    return { exists: false, error: error.message };
  }

  return { exists: (data?.length ?? 0) > 0, error: null };
}

export async function getCurrentUserId(): Promise<{ userId: string | null; error: string | null }> {
  return getCurrentUserIdFromSession();
}

export async function deleteBodyweightLogForCurrentUser(
  logId: string | number
): Promise<{ deleted: boolean; error: string | null }> {
  const { userId, error: userError } = await getCurrentUserId();
  if (userError) {
    return { deleted: false, error: userError };
  }

  if (!userId) {
    return { deleted: false, error: "Not logged in." };
  }

  const existingLogDate = await getExistingBodyweightLogDateSafe(userId, logId);

  const { error } = await supabase
    .from(TABLES.bodyweightLogs)
    .delete()
    .eq("id", String(logId))
    .eq("user_id", userId);

  if (error) {
    return { deleted: false, error: error.message };
  }

  if (existingLogDate) {
    await refreshEnergyMetricsAfterWrite({
      source: "bodyweight",
      userId,
      touchedDates: [existingLogDate],
      refreshMaintenanceCurrent: true,
    });
    return { deleted: true, error: null };
  }
  await refreshEnergyMetricsAfterWrite({
    source: "bodyweight",
    userId,
    refreshMaintenanceCurrent: true,
  });
  return { deleted: true, error: null };
}

export async function updateBodyweightLogForCurrentUser(
  logId: string | number,
  payload: {
    logDate: string;
    weightNum: number;
    inputUnit: "lb" | "kg";
  }
): Promise<string | null> {
  const { userId, error: userError } = await getCurrentUserId();
  if (userError) {
    return userError;
  }

  if (!userId) {
    return "Not logged in.";
  }

  if (!Number.isFinite(payload.weightNum) || payload.weightNum <= 0) {
    return "Weight must be a valid number greater than 0.";
  }
  if (payload.inputUnit !== "kg" && payload.inputUnit !== "lb") {
    return "Weight unit must be kg or lb.";
  }

  const existingLogDate = await getExistingBodyweightLogDateSafe(userId, logId);

  const { error } = await supabase
    .from(TABLES.bodyweightLogs)
    .update({
      log_date: payload.logDate,
      weight_input: payload.weightNum,
      unit_input: payload.inputUnit,
      weight_kg: toKg(payload.weightNum, payload.inputUnit),
    })
    .eq("id", String(logId))
    .eq("user_id", userId);

  if (error) return error.message;

  const touchedDates = existingLogDate && existingLogDate !== payload.logDate
    ? [existingLogDate, payload.logDate]
    : [payload.logDate];
  await refreshEnergyMetricsAfterWrite({
    source: "bodyweight",
    userId,
    touchedDates,
    refreshMaintenanceCurrent: true,
  });
  return null;
}
