import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateSessionStrengthByDate,
  computeSessionStrengthByExerciseDate,
  type StrengthSetLog,
} from "@/lib/dashboardStrength";
import { TABLES } from "@/lib/dbNames";
import { buildInsightsView } from "@/lib/insightsView";
import { LB_PER_KG, toKg } from "@/lib/convertWeight";
import type { Database } from "@/lib/supabaseTypes";

export type InsightsAiContext = {
  firstName: string | null;
  facts: Array<{ label: string; value: string; detail: string }>;
  correlations: Array<{ label: string; value: number | null; interpretation: string; overlapDays: number }>;
  improvements: string[];
  achievements: Array<{ period: string; title: string; detail: string }>;
  suggestions: string[];
  monthlyAverages: Array<{
    month: string;
    weightKgAvg: number | null;
    weightLbAvg: number | null;
    caloriesAvg: number | null;
    burnAvg: number | null;
    netEnergyAvg: number | null;
    strengthAvg: number | null;
    weightDays: number;
    caloriesDays: number;
    burnDays: number;
    netEnergyDays: number;
    strengthDays: number;
  }>;
  calorieCoverage: {
    firstLogDate: string | null;
    lastLogDate: string | null;
    totalLogs: number;
    avgKcalPerLog: number | null;
    minKcal: number | null;
    maxKcal: number | null;
  };
  recentCaloriesLogs: Array<{ date: string; totalKcal: number }>;
  yearlyTimeline: {
    windowStartDate: string;
    windowEndDate: string;
    dailyMetrics: Array<{
      date: string;
      weightKg: number | null;
      weightLb: number | null;
      caloriesKcal: number | null;
      burnKcal: number | null;
      netEnergyKcal: number | null;
      maintenanceKcalForDay: number | null;
      activeCaloriesKcal: number | null;
      totalBurnKcal: number | null;
      netCaloriesKcal: number | null;
      isPartialEstimate: boolean;
      strengthScore: number | null;
    }>;
    workoutSessions: Array<{
      sessionId: string;
      date: string;
      split: "push" | "pull" | "legs" | "core";
      exercises: Array<{
        name: string;
        muscleGroup: string | null;
        sets: Array<{
          setNumber: number;
          reps: number | null;
          weightInput: number | null;
          unit: "kg" | "lb" | null;
          weightKg: number | null;
          durationSeconds: number | null;
        }>;
      }>;
    }>;
  };
  yearlyRawLogs: {
    bodyweight: Array<{ date: string; weightKg: number; weightLb: number }>;
    calories: Array<{ date: string; totalKcal: number }>;
    burn: Array<{ date: string; estimatedKcalSpent: number }>;
    netEnergy: Array<{ date: string; netKcal: number }>;
    strength: Array<{ date: string; score: number }>;
  };
  energyDataContract: {
    note: string;
    dailyEnergySnapshots: Array<{
      date: string;
      maintenance_kcal_for_day: number | null;
      active_calories_kcal: number | null;
      total_burn_kcal: number | null;
      net_calories_kcal: number | null;
      is_partial_estimate: boolean;
    }>;
  };
};

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function minValue(values: number[]) {
  if (values.length === 0) return null;
  return Math.min(...values);
}

function maxValue(values: number[]) {
  if (values.length === 0) return null;
  return Math.max(...values);
}

function monthKey(dateIso: string) {
  return dateIso.slice(0, 7);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function valuesByMonth(series: Array<{ date: string; value: number }>) {
  const byMonth = new Map<string, number[]>();
  for (const point of series) {
    const key = monthKey(point.date);
    const values = byMonth.get(key) ?? [];
    values.push(point.value);
    byMonth.set(key, values);
  }
  return byMonth;
}

export async function loadInsightsAiContextForUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<InsightsAiContext> {
  const oneYearAgo = new Date();
  oneYearAgo.setHours(0, 0, 0, 0);
  oneYearAgo.setDate(oneYearAgo.getDate() - 364);
  const oneYearAgoIso = toIsoDate(oneYearAgo);
  const todayIso = toIsoDate(new Date());

  const [bodyweightRes, caloriesRes, metabolicRes, dailyEnergyRes, workoutSetsRes, workoutSessionsRes, exercisesRes, profileRes] = await Promise.all([
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
      .from(TABLES.dailyEnergyMetrics)
      .select("log_date,maintenance_kcal_for_day,active_calories_kcal,total_burn_kcal,net_calories_kcal")
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
      .select("id,session_date,split")
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

  if (bodyweightRes.error) throw bodyweightRes.error;
  if (caloriesRes.error) throw caloriesRes.error;
  if (metabolicRes.error) throw metabolicRes.error;
  if (dailyEnergyRes.error) throw dailyEnergyRes.error;
  if (workoutSetsRes.error) throw workoutSetsRes.error;
  if (workoutSessionsRes.error) throw workoutSessionsRes.error;
  if (exercisesRes.error) throw exercisesRes.error;

  const bodyweightSeries = (bodyweightRes.data ?? []).map((row) => ({
    date: row.log_date,
    value: row.weight_kg != null ? Number(row.weight_kg) : toKg(Number(row.weight_input), row.unit_input),
  }));

  const caloriesSeries = (caloriesRes.data ?? []).map((row) => ({
    date: row.log_date,
    value: Number(row.pre_workout_kcal ?? 0) + Number(row.post_workout_kcal ?? 0),
  }));

  const metabolicActivitySeries = (metabolicRes.data ?? []).map((row) => ({
    date: row.log_date,
    value: Number(row.estimated_kcal_spent),
  }));

  const intakeByDate = new Map(caloriesSeries.map((point) => [point.date, point.value]));
  const spendByDate = new Map(metabolicActivitySeries.map((point) => [point.date, point.value]));
  const netEnergySeries = [...intakeByDate.entries()]
    .filter(([date]) => spendByDate.has(date))
    .map(([date, intake]) => ({
      date,
      value: intake - Number(spendByDate.get(date) ?? 0),
    }));

  const sessionDateById = new Map((workoutSessionsRes.data ?? []).map((row) => [row.id, row.session_date]));
  const exerciseMetaById = new Map((exercisesRes.data ?? []).map((row) => [row.id, { name: row.name, muscleGroup: row.muscle_group }]));

  const strengthRows: StrengthSetLog[] = [];
  for (const setRow of workoutSetsRes.data ?? []) {
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

  const view = buildInsightsView({
    bodyweightSeries,
    caloriesSeries,
    metabolicActivitySeries,
    netEnergySeries,
    strengthSeries,
  });
  const weightByMonth = valuesByMonth(bodyweightSeries);
  const caloriesByMonth = valuesByMonth(caloriesSeries);
  const burnByMonth = valuesByMonth(metabolicActivitySeries);
  const netByMonth = valuesByMonth(netEnergySeries);
  const strengthByMonth = valuesByMonth(strengthSeries);
  const allMonths = new Set<string>([
    ...weightByMonth.keys(),
    ...caloriesByMonth.keys(),
    ...burnByMonth.keys(),
    ...netByMonth.keys(),
    ...strengthByMonth.keys(),
  ]);
  const monthlyAverages = [...allMonths]
    .sort((a, b) => a.localeCompare(b))
    .map((month) => {
      const weightValues = weightByMonth.get(month) ?? [];
      const caloriesValues = caloriesByMonth.get(month) ?? [];
      const burnValues = burnByMonth.get(month) ?? [];
      const netValues = netByMonth.get(month) ?? [];
      const strengthValues = strengthByMonth.get(month) ?? [];
      const weightKgAvg = average(weightValues);

      return {
        month,
        weightKgAvg,
        weightLbAvg: weightKgAvg != null ? Number((weightKgAvg * LB_PER_KG).toFixed(2)) : null,
        caloriesAvg: average(caloriesValues),
        burnAvg: average(burnValues),
        netEnergyAvg: average(netValues),
        strengthAvg: average(strengthValues),
        weightDays: weightValues.length,
        caloriesDays: caloriesValues.length,
        burnDays: burnValues.length,
        netEnergyDays: netValues.length,
        strengthDays: strengthValues.length,
      };
    });
  const sortedCaloriesSeries = [...caloriesSeries].sort((a, b) => a.date.localeCompare(b.date));
  const calorieValues = sortedCaloriesSeries.map((point) => point.value);
  const calorieCoverage = {
    firstLogDate: sortedCaloriesSeries[0]?.date ?? null,
    lastLogDate: sortedCaloriesSeries.at(-1)?.date ?? null,
    totalLogs: sortedCaloriesSeries.length,
    avgKcalPerLog: average(calorieValues),
    minKcal: minValue(calorieValues),
    maxKcal: maxValue(calorieValues),
  };
  const recentCaloriesLogs = sortedCaloriesSeries.slice(-30).map((point) => ({
    date: point.date,
    totalKcal: point.value,
  }));
  const weightByDate = new Map(bodyweightSeries.map((point) => [point.date, point.value]));
  const caloriesByDate = new Map(caloriesSeries.map((point) => [point.date, point.value]));
  const burnByDate = new Map(metabolicActivitySeries.map((point) => [point.date, point.value]));
  const netByDate = new Map(netEnergySeries.map((point) => [point.date, point.value]));
  const strengthByDate = new Map(strengthSeries.map((point) => [point.date, point.value]));
  const energyByDate = new Map(
    (dailyEnergyRes.data ?? []).map((row) => [
      row.log_date,
      {
        maintenanceKcalForDay: row.maintenance_kcal_for_day != null ? Number(row.maintenance_kcal_for_day) : null,
        activeCaloriesKcal: row.active_calories_kcal != null ? Number(row.active_calories_kcal) : null,
        totalBurnKcal: row.total_burn_kcal != null ? Number(row.total_burn_kcal) : null,
        netCaloriesKcal: row.net_calories_kcal != null ? Number(row.net_calories_kcal) : null,
      },
    ])
  );

  const workoutSessionsInYear = (workoutSessionsRes.data ?? [])
    .filter((row) => row.session_date >= oneYearAgoIso)
    .sort((a, b) => a.session_date.localeCompare(b.session_date));
  const workoutSessionIdSet = new Set(workoutSessionsInYear.map((row) => row.id));
  const workoutSetsDetailed = workoutSessionsInYear.length
    ? await supabase
        .from(TABLES.workoutSets)
        .select("session_id,exercise_id,set_number,reps,weight_input,unit_input,weight_kg,duration_seconds")
        .eq("user_id", userId)
        .in("session_id", workoutSessionsInYear.map((row) => row.id))
    : { data: [], error: null };
  if (workoutSetsDetailed.error) throw workoutSetsDetailed.error;

  const setsBySession = new Map<string, Array<{
    exerciseId: string;
    setNumber: number;
    reps: number | null;
    weightInput: number | null;
    unit: "kg" | "lb" | null;
    weightKg: number | null;
    durationSeconds: number | null;
  }>>();
  for (const row of workoutSetsDetailed.data ?? []) {
    if (!workoutSessionIdSet.has(row.session_id)) continue;
    const items = setsBySession.get(row.session_id) ?? [];
    items.push({
      exerciseId: row.exercise_id,
      setNumber: Number(row.set_number),
      reps: row.reps != null ? Number(row.reps) : null,
      weightInput: row.weight_input != null ? Number(row.weight_input) : null,
      unit: row.unit_input as "kg" | "lb" | null,
      weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
      durationSeconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    });
    setsBySession.set(row.session_id, items);
  }

  const workoutSessionsDetailed = workoutSessionsInYear.map((session) => {
    const sets = setsBySession.get(session.id) ?? [];
    const byExercise = new Map<string, Array<typeof sets[number]>>();
    for (const set of sets) {
      const values = byExercise.get(set.exerciseId) ?? [];
      values.push(set);
      byExercise.set(set.exerciseId, values);
    }
    const exercises = [...byExercise.entries()]
      .map(([exerciseId, exerciseSets]) => {
        const exerciseMeta = exerciseMetaById.get(exerciseId);
        return {
          name: exerciseMeta?.name ?? "Unknown exercise",
          muscleGroup: exerciseMeta?.muscleGroup ?? null,
          sets: [...exerciseSets]
            .sort((a, b) => a.setNumber - b.setNumber)
            .map((set) => ({
              setNumber: set.setNumber,
              reps: set.reps,
              weightInput: set.weightInput,
              unit: set.unit,
              weightKg: set.weightKg,
              durationSeconds: set.durationSeconds,
            })),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      sessionId: session.id,
      date: session.session_date,
      split: session.split,
      exercises,
    };
  });

  const allTimelineDates = new Set<string>([
    ...[...weightByDate.keys()].filter((date) => date >= oneYearAgoIso && date <= todayIso),
    ...[...caloriesByDate.keys()].filter((date) => date >= oneYearAgoIso && date <= todayIso),
    ...[...burnByDate.keys()].filter((date) => date >= oneYearAgoIso && date <= todayIso),
    ...[...netByDate.keys()].filter((date) => date >= oneYearAgoIso && date <= todayIso),
    ...[...strengthByDate.keys()].filter((date) => date >= oneYearAgoIso && date <= todayIso),
    ...workoutSessionsDetailed.map((session) => session.date).filter((date) => date >= oneYearAgoIso && date <= todayIso),
  ]);
  const dailyMetrics = [...allTimelineDates]
    .sort((a, b) => a.localeCompare(b))
    .map((date) => {
      const energy = energyByDate.get(date);
      const maintenanceKcalForDay = energy?.maintenanceKcalForDay ?? null;
      const activeCaloriesKcal = energy?.activeCaloriesKcal ?? null;
      const totalBurnKcal = energy?.totalBurnKcal ?? null;
      const netCaloriesKcal = energy?.netCaloriesKcal ?? null;
      const isPartialEstimate =
        maintenanceKcalForDay == null ||
        activeCaloriesKcal == null ||
        totalBurnKcal == null ||
        netCaloriesKcal == null;

      return {
        date,
        weightKg: weightByDate.get(date) ?? null,
        weightLb: weightByDate.get(date) != null ? Number((Number(weightByDate.get(date)) * LB_PER_KG).toFixed(2)) : null,
        caloriesKcal: caloriesByDate.get(date) ?? null,
        burnKcal: activeCaloriesKcal ?? burnByDate.get(date) ?? null,
        netEnergyKcal: netCaloriesKcal ?? netByDate.get(date) ?? null,
        maintenanceKcalForDay,
        activeCaloriesKcal,
        totalBurnKcal,
        netCaloriesKcal,
        isPartialEstimate,
        strengthScore: strengthByDate.get(date) ?? null,
      };
    });
  const dailyEnergySnapshots = (dailyEnergyRes.data ?? [])
    .filter((row) => row.log_date >= oneYearAgoIso && row.log_date <= todayIso)
    .map((row) => {
      const maintenance = row.maintenance_kcal_for_day != null ? Number(row.maintenance_kcal_for_day) : null;
      const active = row.active_calories_kcal != null ? Number(row.active_calories_kcal) : null;
      const totalBurn = row.total_burn_kcal != null ? Number(row.total_burn_kcal) : null;
      const net = row.net_calories_kcal != null ? Number(row.net_calories_kcal) : null;
      return {
        date: row.log_date,
        maintenance_kcal_for_day: maintenance,
        active_calories_kcal: active,
        total_burn_kcal: totalBurn,
        net_calories_kcal: net,
        is_partial_estimate: maintenance == null || active == null || totalBurn == null || net == null,
      };
    });
  const yearlyRawLogs = {
    bodyweight: bodyweightSeries
      .filter((point) => point.date >= oneYearAgoIso && point.date <= todayIso)
      .map((point) => ({ date: point.date, weightKg: point.value, weightLb: Number((point.value * LB_PER_KG).toFixed(2)) })),
    calories: caloriesSeries
      .filter((point) => point.date >= oneYearAgoIso && point.date <= todayIso)
      .map((point) => ({ date: point.date, totalKcal: point.value })),
    burn: metabolicActivitySeries
      .filter((point) => point.date >= oneYearAgoIso && point.date <= todayIso)
      .map((point) => ({ date: point.date, estimatedKcalSpent: point.value })),
    netEnergy: netEnergySeries
      .filter((point) => point.date >= oneYearAgoIso && point.date <= todayIso)
      .map((point) => ({ date: point.date, netKcal: point.value })),
    strength: strengthSeries
      .filter((point) => point.date >= oneYearAgoIso && point.date <= todayIso)
      .map((point) => ({ date: point.date, score: point.value })),
  };

  return {
    firstName: (profileRes.data?.first_name as string | null | undefined) ?? null,
    facts: view.facts,
    correlations: view.correlations,
    improvements: view.improvements,
    achievements: view.achievements,
    suggestions: view.suggestions,
    monthlyAverages,
    calorieCoverage,
    recentCaloriesLogs,
    yearlyTimeline: {
      windowStartDate: oneYearAgoIso,
      windowEndDate: todayIso,
      dailyMetrics,
      workoutSessions: workoutSessionsDetailed,
    },
    yearlyRawLogs,
    energyDataContract: {
      note: "active_calories_kcal is activity-only from watch and excludes maintenance/resting. maintenance_kcal_for_day is computed separately. total_burn_kcal = maintenance_kcal_for_day + active_calories_kcal. If any component is missing, treat the result as a partial estimate.",
      dailyEnergySnapshots,
    },
  };
}
