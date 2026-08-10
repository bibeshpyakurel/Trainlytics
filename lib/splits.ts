import { supabase } from "@/lib/supabaseClient";
import { TABLES } from "@/lib/dbNames";
import type { Split } from "@/features/log/types";

/** The starter set offered to new users who don't want to design their own. */
export const DEFAULT_SPLIT_NAMES = ["push", "pull", "legs", "core"] as const;

export type UserSplit = {
  id: string;
  name: Split;
  sortOrder: number;
};

const NAME_MAX_LENGTH = 40;

/** Splits are stored lowercase so "Push" and "push" can't both exist. */
export function normalizeSplitName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function validateSplitName(value: string) {
  const name = normalizeSplitName(value);
  if (!name) return { ok: false as const, message: "Name your training day." };
  if (name.length > NAME_MAX_LENGTH) {
    return { ok: false as const, message: `Keep it to ${NAME_MAX_LENGTH} characters or fewer.` };
  }
  return { ok: true as const, name };
}

type SplitRow = { id: string; name: string; sort_order: number };

function toUserSplit(row: SplitRow): UserSplit {
  return { id: row.id, name: row.name, sortOrder: row.sort_order };
}

export async function loadUserSplits(userId: string) {
  const { data, error } = await supabase
    .from(TABLES.userSplits)
    .select("id,name,sort_order")
    .eq("user_id", userId)
    .order("sort_order")
    .order("name");

  if (error) return { ok: false as const, message: error.message };
  return { ok: true as const, splits: ((data ?? []) as SplitRow[]).map(toUserSplit) };
}

/**
 * Creates the given splits for a user who has none yet. Returns the resulting
 * list either way, so callers can treat it as "load, seeding if empty".
 */
export async function ensureUserSplits(userId: string, names: readonly string[] = DEFAULT_SPLIT_NAMES) {
  const existing = await loadUserSplits(userId);
  if (!existing.ok) return existing;
  if (existing.splits.length > 0) return existing;

  const payload = names
    .map((name, index) => ({ user_id: userId, name: normalizeSplitName(name), sort_order: index + 1 }))
    .filter((row) => row.name);

  if (payload.length === 0) return existing;

  const { error } = await supabase.from(TABLES.userSplits).insert(payload);
  if (error) return { ok: false as const, message: error.message };

  return loadUserSplits(userId);
}

export async function createUserSplit(userId: string, rawName: string, sortOrder?: number) {
  const validated = validateSplitName(rawName);
  if (!validated.ok) return validated;

  let order = sortOrder;
  if (order == null) {
    const existing = await loadUserSplits(userId);
    order = existing.ok ? existing.splits.length + 1 : 1;
  }

  const { data, error } = await supabase
    .from(TABLES.userSplits)
    .insert({ user_id: userId, name: validated.name, sort_order: order })
    .select("id,name,sort_order")
    .single();

  if (error || !data) {
    const duplicate = error?.message?.includes("user_splits_unique_per_user");
    return {
      ok: false as const,
      message: duplicate ? "You already have a training day with that name." : error?.message ?? "Could not create that split.",
    };
  }

  return { ok: true as const, split: toUserSplit(data as SplitRow) };
}

/**
 * Renames a split and carries every exercise and session across with it, since
 * both store the split by name.
 */
export async function renameUserSplit(userId: string, split: UserSplit, rawName: string) {
  const validated = validateSplitName(rawName);
  if (!validated.ok) return validated;
  if (validated.name === split.name) return { ok: true as const };

  const { error: renameError } = await supabase
    .from(TABLES.userSplits)
    .update({ name: validated.name })
    .eq("id", split.id)
    .eq("user_id", userId);

  if (renameError) {
    const duplicate = renameError.message.includes("user_splits_unique_per_user");
    return {
      ok: false as const,
      message: duplicate ? "You already have a training day with that name." : renameError.message,
    };
  }

  const { error: exerciseError } = await supabase
    .from(TABLES.exercises)
    .update({ split: validated.name })
    .eq("user_id", userId)
    .eq("split", split.name);

  if (exerciseError) return { ok: false as const, message: exerciseError.message };

  const { error: sessionError } = await supabase
    .from(TABLES.workoutSessions)
    .update({ split: validated.name })
    .eq("user_id", userId)
    .eq("split", split.name);

  if (sessionError) {
    // A session already exists on that date under the target name.
    const collision = sessionError.message.includes("workout_sessions_unique");
    return {
      ok: false as const,
      message: collision
        ? "Some logged days already use that name. Rename it to something else, or merge those days first."
        : sessionError.message,
    };
  }

  return { ok: true as const };
}

/** Refuses while exercises still reference the split, so nothing is orphaned. */
export async function deleteUserSplit(userId: string, split: UserSplit) {
  const { count, error: countError } = await supabase
    .from(TABLES.exercises)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("split", split.name);

  if (countError) return { ok: false as const, message: countError.message };

  if ((count ?? 0) > 0) {
    return {
      ok: false as const,
      message: `Move or delete the ${count} exercise${count === 1 ? "" : "s"} in "${split.name}" first.`,
    };
  }

  const { error } = await supabase
    .from(TABLES.userSplits)
    .delete()
    .eq("id", split.id)
    .eq("user_id", userId);

  if (error) return { ok: false as const, message: error.message };
  return { ok: true as const };
}

export async function reorderUserSplits(userId: string, orderedIds: string[]) {
  for (let index = 0; index < orderedIds.length; index++) {
    const { error } = await supabase
      .from(TABLES.userSplits)
      .update({ sort_order: index + 1 })
      .eq("id", orderedIds[index])
      .eq("user_id", userId);

    if (error) return { ok: false as const, message: error.message };
  }
  return { ok: true as const };
}
