import { toKg } from "@/lib/convertWeight";
import { supabase } from "@/lib/supabaseClient";
import type { BodyweightLog, PendingOverwrite } from "@/features/bodyweight/types";
import { TABLES } from "@/lib/dbNames";
import { getCurrentUserIdFromSession } from "@/lib/authSession";

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

  return error ? error.message : null;
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

  const { error } = await supabase
    .from(TABLES.bodyweightLogs)
    .delete()
    .eq("id", String(logId))
    .eq("user_id", userId);

  if (error) {
    return { deleted: false, error: error.message };
  }

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

  return error ? error.message : null;
}
