import { toKg, type Unit } from "@/lib/convertWeight";
import { TABLES } from "@/lib/dbNames";
import { sortSessionSummaryItems } from "@/features/log/summary";
import type { MetricType, SessionSummaryItem, Split } from "@/features/log/types";

type AtomicRows = Array<{
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_input: number | null;
  unit_input: Unit | null;
  weight_kg: number | null;
  duration_seconds: number | null;
}>;

type AtomicRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: { set_count?: number } | null; error: { message: string } | null }>;
};

type SessionTableClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            neq: (column: string, value: string) => {
              limit: (count: number) => Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  };
};

export async function persistWorkoutSetsAtomic(
  client: AtomicRpcClient,
  params: { sessionDate: string; split: Split; rows: AtomicRows }
) {
  const { data, error } = await client.rpc("save_workout_sets_atomic", {
    p_session_date: params.sessionDate,
    p_split: params.split,
    p_rows: params.rows,
  });

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return {
    ok: true as const,
    setCount: typeof data?.set_count === "number" ? data.set_count : params.rows.length,
  };
}

export async function checkSessionDateCollision(
  client: SessionTableClient,
  params: { userId: string; split: Split; newDate: string; excludeSessionId: string }
) {
  const { data, error } = await client
    .from(TABLES.workoutSessions)
    .select("id")
    .eq("user_id", params.userId)
    .eq("split", params.split)
    .eq("session_date", params.newDate)
    .neq("id", params.excludeSessionId)
    .limit(1);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const, exists: (data?.length ?? 0) > 0 };
}

type SessionSummarySetRow = {
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_input: number | null;
  unit_input: Unit | null;
  duration_seconds: number | null;
};

type SessionSummaryExerciseRow = {
  id: string;
  name: string;
  metric_type: MetricType;
};

export function buildSessionSummaryItems(
  setRows: SessionSummarySetRow[],
  exerciseRows: SessionSummaryExerciseRow[],
  split: Split
) {
  const exerciseMeta = new Map<string, { name: string; metricType: MetricType }>();
  for (const row of exerciseRows) {
    exerciseMeta.set(row.id, { name: row.name, metricType: row.metric_type });
  }

  const summaryMap = new Map<string, SessionSummaryItem>();

  for (const row of setRows) {
    const meta = exerciseMeta.get(row.exercise_id);
    const metricType: MetricType = meta?.metricType ?? (row.duration_seconds != null ? "DURATION" : "WEIGHTED_REPS");

    if (!summaryMap.has(row.exercise_id)) {
      summaryMap.set(row.exercise_id, {
        exerciseId: row.exercise_id,
        exerciseName: meta?.name ?? "Unknown exercise",
        metricType,
        sets: 0,
        totalReps: 0,
        maxWeight: null,
        unit: metricType === "WEIGHTED_REPS" ? "kg" : null,
        totalDurationSeconds: 0,
        setDetails: [],
      });
    }

    const item = summaryMap.get(row.exercise_id)!;
    item.sets += 1;
    item.setDetails.push({
      setNumber: row.set_number,
      reps: row.reps,
      weightInput: row.weight_input,
      unitInput: row.unit_input,
      durationSeconds: row.duration_seconds,
    });

    if (metricType === "WEIGHTED_REPS") {
      item.totalReps += row.reps ?? 0;
      if (row.weight_input != null) {
        const normalizedWeightKg = toKg(row.weight_input, row.unit_input ?? "lb");
        item.maxWeight = item.maxWeight == null ? normalizedWeightKg : Math.max(item.maxWeight, normalizedWeightKg);
      }
    } else {
      item.totalDurationSeconds += row.duration_seconds ?? 0;
    }
  }

  return sortSessionSummaryItems(Array.from(summaryMap.values()), split);
}
