import { toKg } from "@/lib/convertWeight";
import { supabase } from "@/lib/supabaseClient";
import type { BodyweightLog, PendingOverwrite } from "@/features/bodyweight/types";

export async function loadBodyweightLogsForCurrentUser(): Promise<{
  logs: BodyweightLog[];
  error: string | null;
}> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { logs: [], error: sessionError.message };
  }

  if (!sessionData.session) {
    return { logs: [], error: null };
  }

  const userId = sessionData.session.user.id;

  const { data, error } = await supabase
    .from("bodyweight_logs")
    .select("*")
    .eq("user_id", userId)
    .order("log_date", { ascending: false });

  if (error) {
    return { logs: [], error: error.message };
  }

  return { logs: data ?? [], error: null };
}

export async function upsertBodyweightEntry(payload: PendingOverwrite): Promise<string | null> {
  const { error } = await supabase
    .from("bodyweight_logs")
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
  const { data: sessionData, error } = await supabase.auth.getSession();
  if (error) {
    return { userId: null, error: error.message };
  }

  return { userId: sessionData.session?.user.id ?? null, error: null };
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
    .from("bodyweight_logs")
    .delete()
    .eq("id", logId)
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
    .from("bodyweight_logs")
    .update({
      log_date: payload.logDate,
      weight_input: payload.weightNum,
      unit_input: payload.inputUnit,
      weight_kg: toKg(payload.weightNum, payload.inputUnit),
    })
    .eq("id", logId)
    .eq("user_id", userId);

  return error ? error.message : null;
}
