import { supabase } from "@/lib/supabaseClient";
import { TABLES } from "@/lib/dbNames";
import type { Database } from "@/lib/supabaseTypes";
import type { MetricType, Split } from "@/features/log/types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];
type WorkoutSessionRow = Database["public"]["Tables"]["workout_sessions"]["Row"];
type WorkoutSetRow = Database["public"]["Tables"]["workout_sets"]["Row"];

export type ManagedExercise = ExerciseRow & {
  loggedSetCount: number;
  loggedSessionCount: number;
};

export type ExerciseDraft = {
  name: string;
  split: Split;
  muscleGroup: string;
  metricType: MetricType;
};

export type WorkoutExportFilter =
  | { mode: "single-date"; date: string }
  | { mode: "date-range"; startDate: string; endDate: string }
  | { mode: "all" };

export type WorkoutExportRow = {
  sessionDate: string;
  split: Split;
  exerciseName: string;
  muscleGroup: string;
  metricType: MetricType;
  setNumber: number;
  reps: number | null;
  weightInput: number | null;
  unitInput: Database["public"]["Enums"]["unit_type"] | null;
  weightKg: number | null;
  durationSeconds: number | null;
};

const SPLIT_ORDER: Split[] = ["push", "pull", "legs", "core"];
const NAME_MAX_LENGTH = 80;
const MUSCLE_GROUP_MAX_LENGTH = 40;

function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function escapeCsv(value: string | number | null) {
  if (value == null) return "";
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

async function loadUserExerciseNameIndex(userId: string) {
  const { data, error } = await supabase
    .from(TABLES.exercises)
    .select("id,name")
    .eq("user_id", userId);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  const nameIndex = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; name: string }>) {
    nameIndex.set(normalizeExerciseName(row.name).toLowerCase(), row.id);
  }

  return { ok: true as const, nameIndex };
}

async function getNextSortOrder(userId: string, split: Split) {
  const { data, error } = await supabase
    .from(TABLES.exercises)
    .select("sort_order")
    .eq("user_id", userId)
    .eq("split", split)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const, sortOrder: Number(data?.sort_order ?? 0) + 1 };
}

export function normalizeExerciseName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeMuscleGroup(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function validateExerciseDraft(draft: ExerciseDraft) {
  const name = normalizeExerciseName(draft.name);
  const muscleGroup = normalizeMuscleGroup(draft.muscleGroup);

  if (!name) {
    return { ok: false as const, message: "Exercise name is required." };
  }

  if (name.length > NAME_MAX_LENGTH) {
    return {
      ok: false as const,
      message: `Exercise name must be ${NAME_MAX_LENGTH} characters or fewer.`,
    };
  }

  if (!muscleGroup) {
    return { ok: false as const, message: "Muscle group is required." };
  }

  if (muscleGroup.length > MUSCLE_GROUP_MAX_LENGTH) {
    return {
      ok: false as const,
      message: `Muscle group must be ${MUSCLE_GROUP_MAX_LENGTH} characters or fewer.`,
    };
  }

  if (!SPLIT_ORDER.includes(draft.split)) {
    return { ok: false as const, message: "Split is invalid." };
  }

  if (draft.metricType !== "WEIGHTED_REPS" && draft.metricType !== "DURATION") {
    return { ok: false as const, message: "Metric type is invalid." };
  }

  return {
    ok: true as const,
    value: {
      name,
      split: draft.split,
      muscleGroup,
      metricType: draft.metricType,
    },
  };
}

export function buildWorkoutExportCsv(rows: WorkoutExportRow[]) {
  const header = [
    "session_date",
    "split",
    "exercise_name",
    "muscle_group",
    "metric_type",
    "set_number",
    "reps",
    "weight_input",
    "unit_input",
    "weight_kg",
    "duration_seconds",
  ];

  const body = rows.map((row) => [
    escapeCsv(row.sessionDate),
    escapeCsv(row.split),
    escapeCsv(row.exerciseName),
    escapeCsv(row.muscleGroup),
    escapeCsv(row.metricType),
    escapeCsv(row.setNumber),
    escapeCsv(row.reps),
    escapeCsv(row.weightInput),
    escapeCsv(row.unitInput),
    escapeCsv(row.weightKg),
    escapeCsv(row.durationSeconds),
  ].join(","));

  return [header.join(","), ...body].join("\n");
}

export function getWorkoutExportFileName(filter: WorkoutExportFilter) {
  if (filter.mode === "single-date") {
    return `trainlytics-workouts-${filter.date}.csv`;
  }

  if (filter.mode === "date-range") {
    return `trainlytics-workouts-${filter.startDate}-to-${filter.endDate}.csv`;
  }

  return "trainlytics-workouts-all-history.csv";
}

export function downloadCsvFile(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(blobUrl);
}

export async function loadManagedExercises(userId: string) {
  const { data: exerciseRows, error: exerciseError } = await supabase
    .from(TABLES.exercises)
    .select("id,user_id,name,split,muscle_group,metric_type,sort_order,is_active,replaced_by_exercise_id,created_at")
    .eq("user_id", userId);

  if (exerciseError) {
    return { ok: false as const, message: exerciseError.message };
  }

  const { data: setRows, error: setError } = await supabase
    .from(TABLES.workoutSets)
    .select("exercise_id,session_id")
    .eq("user_id", userId);

  if (setError) {
    return { ok: false as const, message: setError.message };
  }

  const setCountByExercise = new Map<string, number>();
  const sessionIdsByExercise = new Map<string, Set<string>>();

  for (const row of (setRows ?? []) as Array<{ exercise_id: string; session_id: string }>) {
    setCountByExercise.set(row.exercise_id, (setCountByExercise.get(row.exercise_id) ?? 0) + 1);
    if (!sessionIdsByExercise.has(row.exercise_id)) {
      sessionIdsByExercise.set(row.exercise_id, new Set<string>());
    }
    sessionIdsByExercise.get(row.exercise_id)!.add(row.session_id);
  }

  const exercises = ((exerciseRows ?? []) as ExerciseRow[])
    .map((row) => ({
      ...row,
      loggedSetCount: setCountByExercise.get(row.id) ?? 0,
      loggedSessionCount: sessionIdsByExercise.get(row.id)?.size ?? 0,
    }))
    .sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      const splitDiff = SPLIT_ORDER.indexOf(a.split) - SPLIT_ORDER.indexOf(b.split);
      if (splitDiff !== 0) return splitDiff;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name.localeCompare(b.name);
    });

  return { ok: true as const, exercises };
}

export async function createManagedExercise(userId: string, draft: ExerciseDraft) {
  const validated = validateExerciseDraft(draft);
  if (!validated.ok) {
    return validated;
  }

  const nameIndexResult = await loadUserExerciseNameIndex(userId);
  if (!nameIndexResult.ok) {
    return nameIndexResult;
  }

  const nextNameKey = validated.value.name.toLowerCase();
  if (nameIndexResult.nameIndex.has(nextNameKey)) {
    return { ok: false as const, message: "You already have an exercise with that name." };
  }

  const sortOrderResult = await getNextSortOrder(userId, validated.value.split);
  if (!sortOrderResult.ok) {
    return sortOrderResult;
  }

  const { data, error } = await supabase
    .from(TABLES.exercises)
    .insert({
      user_id: userId,
      name: validated.value.name,
      split: validated.value.split,
      muscle_group: validated.value.muscleGroup,
      metric_type: validated.value.metricType,
      sort_order: sortOrderResult.sortOrder,
      is_active: true,
      replaced_by_exercise_id: null,
    })
    .select("id,user_id,name,split,muscle_group,metric_type,sort_order,is_active,replaced_by_exercise_id,created_at")
    .single();

  if (error || !data) {
    return { ok: false as const, message: error?.message ?? "Failed to create exercise." };
  }

  return {
    ok: true as const,
    exercise: {
      ...(data as ExerciseRow),
      loggedSetCount: 0,
      loggedSessionCount: 0,
    },
  };
}

export async function updateManagedExercise(userId: string, exerciseId: string, draft: ExerciseDraft) {
  const validated = validateExerciseDraft(draft);
  if (!validated.ok) {
    return validated;
  }

  const { data: existingRow, error: existingError } = await supabase
    .from(TABLES.exercises)
    .select("id,split,is_active,sort_order")
    .eq("id", exerciseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    return { ok: false as const, message: existingError.message };
  }

  if (!existingRow) {
    return { ok: false as const, message: "Exercise not found." };
  }

  const nameIndexResult = await loadUserExerciseNameIndex(userId);
  if (!nameIndexResult.ok) {
    return nameIndexResult;
  }

  const conflictingExerciseId = nameIndexResult.nameIndex.get(validated.value.name.toLowerCase());
  if (conflictingExerciseId && conflictingExerciseId !== exerciseId) {
    return { ok: false as const, message: "You already have an exercise with that name." };
  }

  let nextSortOrder = Number(existingRow.sort_order ?? 0);
  if (existingRow.split !== validated.value.split) {
    const sortOrderResult = await getNextSortOrder(userId, validated.value.split);
    if (!sortOrderResult.ok) {
      return sortOrderResult;
    }
    nextSortOrder = sortOrderResult.sortOrder;
  }

  const { error } = await supabase
    .from(TABLES.exercises)
    .update({
      name: validated.value.name,
      split: validated.value.split,
      muscle_group: validated.value.muscleGroup,
      metric_type: validated.value.metricType,
      sort_order: nextSortOrder,
      is_active: existingRow.is_active,
    })
    .eq("id", exerciseId)
    .eq("user_id", userId);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const };
}

export async function archiveManagedExercise(
  userId: string,
  exerciseId: string,
  replacedByExerciseId?: string | null
) {
  const { error } = await supabase
    .from(TABLES.exercises)
    .update({ is_active: false, replaced_by_exercise_id: replacedByExerciseId ?? null })
    .eq("id", exerciseId)
    .eq("user_id", userId);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const };
}

export async function resolveExercisePredecessorIds(
  userId: string,
  exerciseId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from(TABLES.exercises)
    .select("id,replaced_by_exercise_id")
    .eq("user_id", userId)
    .not("replaced_by_exercise_id", "is", null);

  if (error || !data) return [];

  // Build reverse map: successorId -> list of direct predecessor IDs
  const predecessorsOf = new Map<string, string[]>();
  for (const row of data as Array<{ id: string; replaced_by_exercise_id: string | null }>) {
    if (!row.replaced_by_exercise_id) continue;
    const list = predecessorsOf.get(row.replaced_by_exercise_id) ?? [];
    list.push(row.id);
    predecessorsOf.set(row.replaced_by_exercise_id, list);
  }

  // BFS backwards from exerciseId collecting all ancestors, cap at 20 hops
  const result: string[] = [];
  const visited = new Set<string>([exerciseId]);
  const queue = [exerciseId];
  let hops = 0;

  while (queue.length > 0 && hops < 20) {
    const current = queue.shift()!;
    const parents = predecessorsOf.get(current) ?? [];
    for (const parentId of parents) {
      if (!visited.has(parentId)) {
        visited.add(parentId);
        result.push(parentId);
        queue.push(parentId);
      }
    }
    hops++;
  }

  return result;
}

export async function restoreManagedExercise(userId: string, exerciseId: string, split: Split) {
  const sortOrderResult = await getNextSortOrder(userId, split);
  if (!sortOrderResult.ok) {
    return sortOrderResult;
  }

  const { error } = await supabase
    .from(TABLES.exercises)
    .update({ is_active: true, sort_order: sortOrderResult.sortOrder })
    .eq("id", exerciseId)
    .eq("user_id", userId);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const };
}

export async function deleteManagedExercise(userId: string, exerciseId: string) {
  const { data: setRows, error: setError } = await supabase
    .from(TABLES.workoutSets)
    .select("session_id")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId);

  if (setError) {
    return { ok: false as const, message: setError.message };
  }

  const touchedSessionIds = Array.from(
    new Set(((setRows ?? []) as Array<{ session_id: string }>).map((row) => row.session_id))
  );

  const { error: deleteSetsError } = await supabase
    .from(TABLES.workoutSets)
    .delete()
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId);

  if (deleteSetsError) {
    return { ok: false as const, message: deleteSetsError.message };
  }

  const { error: deleteExerciseError } = await supabase
    .from(TABLES.exercises)
    .delete()
    .eq("id", exerciseId)
    .eq("user_id", userId);

  if (deleteExerciseError) {
    return { ok: false as const, message: deleteExerciseError.message };
  }

  let deletedEmptySessions = 0;
  if (touchedSessionIds.length > 0) {
    const { data: remainingSetRows, error: remainingSetError } = await supabase
      .from(TABLES.workoutSets)
      .select("session_id")
      .eq("user_id", userId)
      .in("session_id", touchedSessionIds);

    if (remainingSetError) {
      return { ok: false as const, message: remainingSetError.message };
    }

    const remainingSessionIds = new Set(
      ((remainingSetRows ?? []) as Array<{ session_id: string }>).map((row) => row.session_id)
    );
    const emptySessionIds = touchedSessionIds.filter((sessionId) => !remainingSessionIds.has(sessionId));

    if (emptySessionIds.length > 0) {
      const { error: deleteSessionError, count } = await supabase
        .from(TABLES.workoutSessions)
        .delete({ count: "exact" })
        .eq("user_id", userId)
        .in("id", emptySessionIds);

      if (deleteSessionError) {
        return { ok: false as const, message: deleteSessionError.message };
      }

      deletedEmptySessions = count ?? emptySessionIds.length;
    }
  }

  return {
    ok: true as const,
    deletedSetCount: (setRows ?? []).length,
    deletedEmptySessions,
  };
}

export async function exportWorkoutHistory(userId: string, filter: WorkoutExportFilter) {
  if (filter.mode === "single-date" && !isValidIsoDate(filter.date)) {
    return { ok: false as const, message: "Choose a valid export date." };
  }

  if (filter.mode === "date-range") {
    if (!isValidIsoDate(filter.startDate) || !isValidIsoDate(filter.endDate)) {
      return { ok: false as const, message: "Choose a valid start and end date." };
    }
    if (filter.startDate > filter.endDate) {
      return { ok: false as const, message: "Start date must be before end date." };
    }
  }

  let sessionQuery = supabase
    .from(TABLES.workoutSessions)
    .select("id,session_date,split,created_at")
    .eq("user_id", userId)
    .order("session_date", { ascending: true });

  if (filter.mode === "single-date") {
    sessionQuery = sessionQuery.eq("session_date", filter.date);
  }

  if (filter.mode === "date-range") {
    sessionQuery = sessionQuery.gte("session_date", filter.startDate).lte("session_date", filter.endDate);
  }

  const { data: sessions, error: sessionError } = await sessionQuery;
  if (sessionError) {
    return { ok: false as const, message: sessionError.message };
  }

  const sessionRows = (sessions ?? []) as Array<Pick<WorkoutSessionRow, "id" | "session_date" | "split">>;
  if (sessionRows.length === 0) {
    return { ok: true as const, rows: [] as WorkoutExportRow[] };
  }

  const sessionIds = sessionRows.map((session) => session.id);
  const { data: sets, error: setsError } = await supabase
    .from(TABLES.workoutSets)
    .select("session_id,exercise_id,set_number,reps,weight_input,unit_input,weight_kg,duration_seconds")
    .eq("user_id", userId)
    .in("session_id", sessionIds)
    .order("session_id", { ascending: true })
    .order("set_number", { ascending: true });

  if (setsError) {
    return { ok: false as const, message: setsError.message };
  }

  const setRows = (sets ?? []) as Array<
    Pick<
      WorkoutSetRow,
      "session_id" | "exercise_id" | "set_number" | "reps" | "weight_input" | "unit_input" | "weight_kg" | "duration_seconds"
    >
  >;

  const exerciseIds = Array.from(new Set(setRows.map((row) => row.exercise_id)));
  const { data: exercises, error: exerciseError } = await supabase
    .from(TABLES.exercises)
    .select("id,name,muscle_group,metric_type")
    .in("id", exerciseIds);

  if (exerciseError) {
    return { ok: false as const, message: exerciseError.message };
  }

  const sessionById = new Map(sessionRows.map((row) => [row.id, row]));
  const exerciseById = new Map(
    ((exercises ?? []) as Array<Pick<ExerciseRow, "id" | "name" | "muscle_group" | "metric_type">>).map((row) => [
      row.id,
      row,
    ])
  );

  const rows: WorkoutExportRow[] = setRows
    .map((row) => {
      const session = sessionById.get(row.session_id);
      const exercise = exerciseById.get(row.exercise_id);
      if (!session || !exercise) return null;

      return {
        sessionDate: session.session_date,
        split: session.split,
        exerciseName: exercise.name,
        muscleGroup: exercise.muscle_group,
        metricType: exercise.metric_type,
        setNumber: row.set_number,
        reps: row.reps,
        weightInput: row.weight_input,
        unitInput: row.unit_input,
        weightKg: row.weight_kg,
        durationSeconds: row.duration_seconds,
      };
    })
    .filter((row): row is WorkoutExportRow => row != null)
    .sort((a, b) => {
      const dateDiff = a.sessionDate.localeCompare(b.sessionDate);
      if (dateDiff !== 0) return dateDiff;
      const splitDiff = SPLIT_ORDER.indexOf(a.split) - SPLIT_ORDER.indexOf(b.split);
      if (splitDiff !== 0) return splitDiff;
      const exerciseDiff = a.exerciseName.localeCompare(b.exerciseName);
      if (exerciseDiff !== 0) return exerciseDiff;
      return a.setNumber - b.setNumber;
    });

  return { ok: true as const, rows };
}