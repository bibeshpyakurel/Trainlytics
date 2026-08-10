import { supabase } from "@/lib/supabaseClient";
import { TABLES } from "@/lib/dbNames";
import type { Database } from "@/lib/supabaseTypes";
import type { MetricType, Split } from "@/features/log/types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

export type ManagedExercise = ExerciseRow & {
  loggedSetCount: number;
  loggedSessionCount: number;
};

export type ExerciseDraft = {
  name: string;
  split: Split;
  muscleGroup: string;
  metricType: MetricType;
  /** How many set rows this exercise opens with. Defaults to 2, never below 1. */
  defaultSets?: number;
};

type ReplacementLinkExercise = Pick<ExerciseRow, "id" | "split" | "metric_type" | "is_active">;

/** Ordering hint only — user-defined splits fall after these, alphabetically. */
const SPLIT_ORDER: Split[] = ["push", "pull", "legs", "core"];
const NAME_MAX_LENGTH = 80;
const MUSCLE_GROUP_MAX_LENGTH = 40;
const SPLIT_MAX_LENGTH = 40;

function splitRank(split: Split) {
  const index = SPLIT_ORDER.indexOf(split);
  return index === -1 ? SPLIT_ORDER.length : index;
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

  // Splits are user-defined free text now, so only shape is checked here.
  const split = draft.split.trim().toLowerCase();
  if (!split) {
    return { ok: false as const, message: "Split is required." };
  }
  if (split.length > SPLIT_MAX_LENGTH) {
    return { ok: false as const, message: `Split must be ${SPLIT_MAX_LENGTH} characters or fewer.` };
  }

  if (draft.metricType !== "WEIGHTED_REPS" && draft.metricType !== "DURATION") {
    return { ok: false as const, message: "Metric type is invalid." };
  }

  return {
    ok: true as const,
    value: {
      name,
      split,
      muscleGroup,
      metricType: draft.metricType,
    },
  };
}

export function validateArchivedExerciseReplacementLink(input: {
  archivedExercise: ReplacementLinkExercise;
  replacementExercise: ReplacementLinkExercise | null;
  replacementPredecessorIds?: string[];
}) {
  const { archivedExercise, replacementExercise, replacementPredecessorIds = [] } = input;

  if (archivedExercise.is_active) {
    return { ok: false as const, message: "Only archived exercises can be linked to a replacement." };
  }

  if (!replacementExercise) {
    return { ok: true as const };
  }

  if (replacementExercise.id === archivedExercise.id) {
    return { ok: false as const, message: "An exercise cannot replace itself." };
  }

  if (!replacementExercise.is_active) {
    return { ok: false as const, message: "Choose an active exercise as the replacement." };
  }

  if (replacementExercise.split !== archivedExercise.split) {
    return { ok: false as const, message: "Replacement exercises must stay in the same split." };
  }

  if (replacementExercise.metric_type !== archivedExercise.metric_type) {
    return { ok: false as const, message: "Replacement exercises must use the same metric type." };
  }

  if (replacementPredecessorIds.includes(archivedExercise.id)) {
    return { ok: false as const, message: "This replacement would create a cycle in the exercise chain." };
  }

  return { ok: true as const };
}

export async function loadManagedExercises(userId: string) {
  const { data: exerciseRows, error: exerciseError } = await supabase
    .from(TABLES.exercises)
    .select("id,user_id,name,split,muscle_group,metric_type,sort_order,is_active,replaced_by_exercise_id,created_at,default_sets")
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
      const splitDiff = splitRank(a.split) - splitRank(b.split);
      if (splitDiff !== 0) return splitDiff;
      if (a.split !== b.split) return a.split.localeCompare(b.split);
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
      default_sets: Math.max(1, Math.round(draft.defaultSets ?? 2)),
    })
    .select("id,user_id,name,split,muscle_group,metric_type,sort_order,is_active,replaced_by_exercise_id,created_at,default_sets")
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

export async function updateArchivedExerciseReplacement(
  userId: string,
  exerciseId: string,
  replacedByExerciseId: string | null
) {
  const { data: archivedExercise, error: archivedExerciseError } = await supabase
    .from(TABLES.exercises)
    .select("id,split,metric_type,is_active")
    .eq("id", exerciseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (archivedExerciseError) {
    return { ok: false as const, message: archivedExerciseError.message };
  }

  if (!archivedExercise) {
    return { ok: false as const, message: "Exercise not found." };
  }

  let replacementExercise: ReplacementLinkExercise | null = null;
  let replacementPredecessorIds: string[] = [];

  if (replacedByExerciseId) {
    const { data: replacementRow, error: replacementError } = await supabase
      .from(TABLES.exercises)
      .select("id,split,metric_type,is_active")
      .eq("id", replacedByExerciseId)
      .eq("user_id", userId)
      .maybeSingle();

    if (replacementError) {
      return { ok: false as const, message: replacementError.message };
    }

    if (!replacementRow) {
      return { ok: false as const, message: "Replacement exercise not found." };
    }

    replacementExercise = replacementRow as ReplacementLinkExercise;
    replacementPredecessorIds = await resolveExercisePredecessorIds(userId, replacedByExerciseId);
  }

  const validation = validateArchivedExerciseReplacementLink({
    archivedExercise: archivedExercise as ReplacementLinkExercise,
    replacementExercise,
    replacementPredecessorIds,
  });
  if (!validation.ok) {
    return validation;
  }

  const { error } = await supabase
    .from(TABLES.exercises)
    .update({ replaced_by_exercise_id: replacedByExerciseId })
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
    .update({ is_active: true, sort_order: sortOrderResult.sortOrder, replaced_by_exercise_id: null })
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

export async function renameManagedExercise(userId: string, exerciseId: string, newName: string) {
  const normalized = normalizeExerciseName(newName);
  if (!normalized) {
    return { ok: false as const, message: "Exercise name is required." };
  }
  if (normalized.length > NAME_MAX_LENGTH) {
    return { ok: false as const, message: `Exercise name must be ${NAME_MAX_LENGTH} characters or fewer.` };
  }

  const nameIndexResult = await loadUserExerciseNameIndex(userId);
  if (!nameIndexResult.ok) return nameIndexResult;

  const conflictId = nameIndexResult.nameIndex.get(normalized.toLowerCase());
  if (conflictId && conflictId !== exerciseId) {
    return { ok: false as const, message: "You already have an exercise with that name." };
  }

  const { error } = await supabase
    .from(TABLES.exercises)
    .update({ name: normalized })
    .eq("id", exerciseId)
    .eq("user_id", userId);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const, normalizedName: normalized };
}

export async function moveExercise(
  userId: string,
  exerciseId: string,
  targetSplit: Split,
  targetMuscleGroup: string
) {
  const normalizedGroup = normalizeMuscleGroup(targetMuscleGroup);
  if (!normalizedGroup) {
    return { ok: false as const, message: "Muscle group is required." };
  }
  if (normalizedGroup.length > MUSCLE_GROUP_MAX_LENGTH) {
    return { ok: false as const, message: `Muscle group must be ${MUSCLE_GROUP_MAX_LENGTH} characters or fewer.` };
  }

  const sortOrderResult = await getNextSortOrder(userId, targetSplit);
  if (!sortOrderResult.ok) return sortOrderResult;

  const { error } = await supabase
    .from(TABLES.exercises)
    .update({ split: targetSplit, muscle_group: normalizedGroup, sort_order: sortOrderResult.sortOrder })
    .eq("id", exerciseId)
    .eq("user_id", userId);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const };
}

export async function renameMuscleGroup(
  userId: string,
  split: Split,
  oldMuscleGroup: string,
  newMuscleGroup: string
) {
  const normalized = normalizeMuscleGroup(newMuscleGroup);
  if (!normalized) {
    return { ok: false as const, message: "Muscle group name is required." };
  }
  if (normalized.length > MUSCLE_GROUP_MAX_LENGTH) {
    return { ok: false as const, message: `Muscle group must be ${MUSCLE_GROUP_MAX_LENGTH} characters or fewer.` };
  }

  const { error } = await supabase
    .from(TABLES.exercises)
    .update({ muscle_group: normalized })
    .eq("user_id", userId)
    .eq("split", split)
    .eq("muscle_group", oldMuscleGroup);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const, normalizedName: normalized };
}

export async function moveMuscleGroupToSplit(
  userId: string,
  currentSplit: Split,
  muscleGroup: string,
  targetSplit: Split
) {
  const { data, error: fetchError } = await supabase
    .from(TABLES.exercises)
    .select("id")
    .eq("user_id", userId)
    .eq("split", currentSplit)
    .eq("muscle_group", muscleGroup);

  if (fetchError) {
    return { ok: false as const, message: fetchError.message };
  }

  const exerciseIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (exerciseIds.length === 0) {
    return { ok: true as const, movedCount: 0 };
  }

  const sortOrderResult = await getNextSortOrder(userId, targetSplit);
  if (!sortOrderResult.ok) return sortOrderResult;

  let baseOrder = sortOrderResult.sortOrder;
  for (const id of exerciseIds) {
    const { error: updateError } = await supabase
      .from(TABLES.exercises)
      .update({ split: targetSplit, sort_order: baseOrder })
      .eq("id", id)
      .eq("user_id", userId);

    if (updateError) {
      return { ok: false as const, message: updateError.message };
    }
    baseOrder++;
  }

  return { ok: true as const, movedCount: exerciseIds.length };
}

export async function updateExerciseMemo(
  userId: string,
  exerciseId: string,
  memo: string | null
) {
  const { error } = await supabase
    .from(TABLES.exercises)
    .update({ memo: memo ?? null })
    .eq("id", exerciseId)
    .eq("user_id", userId);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const };
}

/** Persists how many set rows an exercise opens with. Never drops below one. */
export async function updateExerciseDefaultSets(userId: string, exerciseId: string, count: number) {
  const nextCount = Math.max(1, Math.round(count));

  const { error } = await supabase
    .from(TABLES.exercises)
    .update({ default_sets: nextCount })
    .eq("id", exerciseId)
    .eq("user_id", userId);

  if (error) return { ok: false as const, message: error.message };
  return { ok: true as const, defaultSets: nextCount };
}
