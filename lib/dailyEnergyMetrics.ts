import { supabase } from "@/lib/supabaseClient";
import { TABLES } from "@/lib/dbNames";
import { getCurrentUserIdFromSession } from "@/lib/authSession";
import {
  calculateBmi,
  calculateMaintenanceCaloriesFromProfile,
  type ActivityLevel,
  type BmrSex,
} from "@/lib/energyCalculations";

type ProfileEnergyInputs = {
  sex: string | null;
  birth_date: string | null;
  height_cm: number | null;
  activity_level: string | null;
};

type WeightRow = { weight_kg: number | null } | null;
type CaloriesRow = { pre_workout_kcal: number | null; post_workout_kcal: number | null } | null;
type ActiveRow = { estimated_kcal_spent: number } | null;

export type DailyEnergySnapshot = {
  log_date: string;
  calories_in_kcal: number | null;
  active_calories_kcal: number | null;
  maintenance_kcal_for_day: number | null;
  total_burn_kcal: number | null;
  net_calories_kcal: number | null;
};

export type ProfileEnergySettingsRow = {
  sex: string | null;
  birth_date: string | null;
  height_cm: number | null;
  activity_level: string | null;
  maintenance_method: string | null;
  maintenance_kcal_current: number | null;
  maintenance_updated_at: string | null;
};

function toNullableNumber(value: unknown) {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeCaloriesIn(row: CaloriesRow) {
  if (!row) return null;
  const pre = toNullableNumber(row.pre_workout_kcal) ?? 0;
  const post = toNullableNumber(row.post_workout_kcal) ?? 0;
  return pre + post;
}

function normalizeSex(value: string | null): BmrSex | null {
  if (value === "male" || value === "female") return value;
  return null;
}

function normalizeActivityLevel(value: string | null): ActivityLevel | null {
  if (
    value === "sedentary" ||
    value === "light" ||
    value === "moderate" ||
    value === "very_active" ||
    value === "extra_active"
  ) {
    return value;
  }
  return null;
}

function calculateMaintenanceForWeight(profile: ProfileEnergyInputs | null, weightKg: number | null) {
  if (!profile || weightKg == null || weightKg <= 0) return null;
  const sex = normalizeSex(profile.sex);
  const activityLevel = normalizeActivityLevel(profile.activity_level);
  const birthDateIso = profile.birth_date;
  const heightCm = toNullableNumber(profile.height_cm);
  if (!sex || !activityLevel || !birthDateIso || heightCm == null || heightCm <= 0) return null;

  return calculateMaintenanceCaloriesFromProfile({
    sex,
    weightKg,
    heightCm,
    birthDateIso,
    activityLevel,
  });
}

export async function recomputeMaintenanceKcalCurrentForUser(userId: string): Promise<string | null> {
  const [profileRes, latestWeightRes] = await Promise.all([
    supabase
      .from(TABLES.profiles)
      .select("sex,birth_date,height_cm,activity_level")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from(TABLES.bodyweightLogs)
      .select("weight_kg")
      .eq("user_id", userId)
      .order("log_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (profileRes.error) return profileRes.error.message;
  if (latestWeightRes.error) return latestWeightRes.error.message;

  const maintenance = calculateMaintenanceForWeight(
    (profileRes.data as ProfileEnergyInputs | null) ?? null,
    toNullableNumber(latestWeightRes.data?.weight_kg)
  );

  const { error: updateError } = await supabase
    .from(TABLES.profiles)
    .upsert(
      {
        user_id: userId,
        maintenance_kcal_current: maintenance,
        maintenance_updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  return updateError ? updateError.message : null;
}

export async function recomputeDailyEnergyMetricsForDate(userId: string, logDate: string): Promise<string | null> {
  const [weightRes, caloriesRes, activeRes, profileRes] = await Promise.all([
    supabase
      .from(TABLES.bodyweightLogs)
      .select("weight_kg")
      .eq("user_id", userId)
      .eq("log_date", logDate)
      .maybeSingle(),
    supabase
      .from(TABLES.caloriesLogs)
      .select("pre_workout_kcal,post_workout_kcal")
      .eq("user_id", userId)
      .eq("log_date", logDate)
      .maybeSingle(),
    supabase
      .from(TABLES.metabolicActivityLogs)
      .select("estimated_kcal_spent")
      .eq("user_id", userId)
      .eq("log_date", logDate)
      .maybeSingle(),
    supabase
      .from(TABLES.profiles)
      .select("sex,birth_date,height_cm,activity_level")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (weightRes.error) return weightRes.error.message;
  if (caloriesRes.error) return caloriesRes.error.message;
  if (activeRes.error) return activeRes.error.message;
  if (profileRes.error) return profileRes.error.message;

  const weightKg = toNullableNumber((weightRes.data as WeightRow)?.weight_kg);
  const caloriesInKcal = normalizeCaloriesIn((caloriesRes.data as CaloriesRow) ?? null);
  const activeCaloriesKcal = toNullableNumber((activeRes.data as ActiveRow)?.estimated_kcal_spent);
  const maintenanceForDay = calculateMaintenanceForWeight(
    (profileRes.data as ProfileEnergyInputs | null) ?? null,
    weightKg
  );

  const profileHeightCm = toNullableNumber((profileRes.data as ProfileEnergyInputs | null)?.height_cm);
  const bmi = weightKg != null && profileHeightCm != null ? calculateBmi(weightKg, profileHeightCm) : null;
  const totalBurnKcal = maintenanceForDay != null && activeCaloriesKcal != null
    ? maintenanceForDay + activeCaloriesKcal
    : null;
  const netCaloriesKcal = caloriesInKcal != null && totalBurnKcal != null
    ? caloriesInKcal - totalBurnKcal
    : null;

  const hasAnySignal =
    weightKg != null ||
    caloriesInKcal != null ||
    activeCaloriesKcal != null ||
    bmi != null ||
    maintenanceForDay != null ||
    totalBurnKcal != null ||
    netCaloriesKcal != null;

  if (!hasAnySignal) {
    const { error: deleteError } = await supabase
      .from(TABLES.dailyEnergyMetrics)
      .delete()
      .eq("user_id", userId)
      .eq("log_date", logDate);
    return deleteError ? deleteError.message : null;
  }

  const { error: upsertError } = await supabase
    .from(TABLES.dailyEnergyMetrics)
    .upsert(
      {
        user_id: userId,
        log_date: logDate,
        weight_kg: weightKg,
        calories_in_kcal: caloriesInKcal,
        active_calories_kcal: activeCaloriesKcal,
        bmi,
        maintenance_kcal_for_day: maintenanceForDay,
        total_burn_kcal: totalBurnKcal,
        net_calories_kcal: netCaloriesKcal,
      },
      { onConflict: "user_id,log_date" }
    );

  return upsertError ? upsertError.message : null;
}

export async function recomputeDailyEnergyMetricsFromDateForward(
  userId: string,
  fromDateInclusive: string
): Promise<string | null> {
  const [weightRes, caloriesRes, activeRes] = await Promise.all([
    supabase
      .from(TABLES.bodyweightLogs)
      .select("log_date")
      .eq("user_id", userId)
      .gte("log_date", fromDateInclusive),
    supabase
      .from(TABLES.caloriesLogs)
      .select("log_date")
      .eq("user_id", userId)
      .gte("log_date", fromDateInclusive),
    supabase
      .from(TABLES.metabolicActivityLogs)
      .select("log_date")
      .eq("user_id", userId)
      .gte("log_date", fromDateInclusive),
  ]);

  if (weightRes.error) return weightRes.error.message;
  if (caloriesRes.error) return caloriesRes.error.message;
  if (activeRes.error) return activeRes.error.message;

  const dates = new Set<string>();
  for (const row of weightRes.data ?? []) dates.add(row.log_date);
  for (const row of caloriesRes.data ?? []) dates.add(row.log_date);
  for (const row of activeRes.data ?? []) dates.add(row.log_date);

  const orderedDates = [...dates].sort((a, b) => a.localeCompare(b));
  for (const date of orderedDates) {
    const recalcError = await recomputeDailyEnergyMetricsForDate(userId, date);
    if (recalcError) return recalcError;
  }
  return null;
}

type RefreshAfterWriteInput = {
  source: "bodyweight" | "calories_intake" | "calories_burn" | "profile";
  userId: string;
  touchedDates?: string[];
  refreshMaintenanceCurrent?: boolean;
};

export async function refreshEnergyMetricsAfterWrite(input: RefreshAfterWriteInput) {
  const touchedDates = [...new Set(input.touchedDates ?? [])].filter(Boolean);
  for (const date of touchedDates) {
    try {
      const recalcError = await recomputeDailyEnergyMetricsForDate(input.userId, date);
      if (recalcError) {
        console.warn(`[${input.source}] daily energy metric refresh failed`, {
          userId: input.userId,
          logDate: date,
          recalcError,
        });
      }
    } catch (error) {
      console.warn(`[${input.source}] daily energy metric refresh failed`, {
        userId: input.userId,
        logDate: date,
        error,
      });
    }
  }

  if (input.refreshMaintenanceCurrent) {
    try {
      const recalcError = await recomputeMaintenanceKcalCurrentForUser(input.userId);
      if (recalcError) {
        console.warn(`[${input.source}] maintenance refresh failed`, {
          userId: input.userId,
          recalcError,
        });
      }
    } catch (error) {
      console.warn(`[${input.source}] maintenance refresh failed`, {
        userId: input.userId,
        error,
      });
    }
  }
}

export async function loadLatestDailyEnergySnapshotForCurrentUser(): Promise<{
  snapshot: DailyEnergySnapshot | null;
  error: string | null;
}> {
  const { userId, error: userError } = await getCurrentUserIdFromSession();
  if (userError) return { snapshot: null, error: userError };
  if (!userId) return { snapshot: null, error: null };

  const { data, error } = await supabase
    .from(TABLES.dailyEnergyMetrics)
    .select("log_date,calories_in_kcal,active_calories_kcal,maintenance_kcal_for_day,total_burn_kcal,net_calories_kcal")
    .eq("user_id", userId)
    .order("log_date", { ascending: false })
    .limit(120);

  if (error) return { snapshot: null, error: error.message };
  const snapshots = ((data as DailyEnergySnapshot[] | null) ?? []);
  if (snapshots.length === 0) return { snapshot: null, error: null };

  const latestComplete = snapshots.find((row) =>
    row.maintenance_kcal_for_day != null &&
    row.active_calories_kcal != null &&
    row.total_burn_kcal != null &&
    row.net_calories_kcal != null
  ) ?? null;

  return {
    snapshot: latestComplete ?? snapshots[0] ?? null,
    error: null,
  };
}

export async function loadProfileEnergySettingsForCurrentUser(): Promise<{
  row: ProfileEnergySettingsRow | null;
  error: string | null;
}> {
  const { userId, error: userError } = await getCurrentUserIdFromSession();
  if (userError) return { row: null, error: userError };
  if (!userId) return { row: null, error: null };

  const { data, error } = await supabase
    .from(TABLES.profiles)
    .select("sex,birth_date,height_cm,activity_level,maintenance_method,maintenance_kcal_current,maintenance_updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { row: null, error: error.message };
  return {
    row: (data as ProfileEnergySettingsRow | null) ?? null,
    error: null,
  };
}
