import { supabase } from "@/lib/supabaseClient";
import { TABLES } from "@/lib/dbNames";
import { toKg, type Unit } from "@/lib/convertWeight";
import { persistWorkoutSetsAtomic } from "@/features/log/workflows";
import { normalizeExerciseKey, type ParsedExercise, type ParsedSession } from "@/lib/workoutImport";
import type { Exercise, Split } from "@/features/log/types";

export type CatalogEntry = Pick<Exercise, "id" | "name" | "split" | "muscle_group" | "metric_type">;

export type ResolvedExercise = {
  parsed: ParsedExercise;
  /** Catalog entry this line will be written against, or null when unmatched. */
  match: CatalogEntry | null;
  /** True when the sets look like durations but the matched exercise records reps (or vice versa). */
  metricMismatch: boolean;
};

export type ImportSession = {
  date: string | null;
  split: Split | null;
  exercises: ResolvedExercise[];
  /** True when a session already exists for this date+split — importing replaces it. */
  willOverwrite: boolean;
};

export type ImportPlan = {
  sessions: ImportSession[];
  unmatchedNames: string[];
};

/** Exact match on the normalised name, then a containment fallback ("Bench" -> "Bench Press"). */
export function matchExercise(name: string, catalog: CatalogEntry[]): CatalogEntry | null {
  const key = normalizeExerciseKey(name);
  if (!key) return null;

  const exact = catalog.find((entry) => normalizeExerciseKey(entry.name) === key);
  if (exact) return exact;

  const candidates = catalog.filter((entry) => {
    const entryKey = normalizeExerciseKey(entry.name);
    return entryKey.startsWith(`${key} `) || entryKey.endsWith(` ${key}`) || entryKey.includes(` ${key} `);
  });

  // Only accept a partial match when it is unambiguous.
  return candidates.length === 1 ? candidates[0] : null;
}

function isDurationLine(parsed: ParsedExercise) {
  return parsed.sets.every((set) => set.durationSeconds != null);
}

export async function loadExerciseCatalog(userId: string) {
  const { data, error } = await supabase
    .from(TABLES.exercises)
    .select("id,name,split,muscle_group,metric_type")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) return { ok: false as const, message: error.message };
  return { ok: true as const, catalog: (data ?? []) as CatalogEntry[] };
}

async function findExistingSessionDates(userId: string, pairs: Array<{ date: string; split: Split }>) {
  if (pairs.length === 0) return new Set<string>();

  const { data, error } = await supabase
    .from(TABLES.workoutSessions)
    .select("session_date,split")
    .eq("user_id", userId)
    .in("session_date", [...new Set(pairs.map((pair) => pair.date))]);

  if (error || !data) return new Set<string>();

  return new Set(
    (data as Array<{ session_date: string; split: Split }>).map((row) => `${row.session_date}|${row.split}`)
  );
}

/**
 * Turns parsed notes into a reviewable plan: every line resolved against the
 * catalog, with the sessions that would be overwritten flagged.
 */
export async function buildImportPlan(
  userId: string,
  sessions: ParsedSession[]
): Promise<{ ok: true; plan: ImportPlan } | { ok: false; message: string }> {
  const catalogResult = await loadExerciseCatalog(userId);
  if (!catalogResult.ok) return catalogResult;

  const { catalog } = catalogResult;

  const resolvedSessions: ImportSession[] = sessions.map((session) => ({
    date: session.date,
    split: session.split,
    willOverwrite: false,
    exercises: session.exercises.map((parsed) => {
      const match = matchExercise(parsed.name, catalog);
      const durationLine = isDurationLine(parsed);
      return {
        parsed,
        match,
        metricMismatch: match
          ? (match.metric_type === "DURATION") !== durationLine
          : false,
      };
    }),
  }));

  const complete = resolvedSessions
    .filter((session): session is ImportSession & { date: string; split: Split } =>
      Boolean(session.date && session.split)
    )
    .map((session) => ({ date: session.date, split: session.split }));

  const existing = await findExistingSessionDates(userId, complete);
  for (const session of resolvedSessions) {
    if (session.date && session.split) {
      session.willOverwrite = existing.has(`${session.date}|${session.split}`);
    }
  }

  const unmatchedNames = [
    ...new Set(
      resolvedSessions
        .flatMap((session) => session.exercises)
        .filter((entry) => !entry.match)
        .map((entry) => entry.parsed.name)
    ),
  ];

  return { ok: true as const, plan: { sessions: resolvedSessions, unmatchedNames } };
}

/* ------------------------------------------------------------------ *
 * Pending save — the shape both entry modes converge on before saving. *
 * ------------------------------------------------------------------ */

export type PendingSet = {
  reps: number | null;
  weight: number | null;
  unit: Unit | null;
  durationSeconds: number | null;
};

export type PendingExercise = {
  exerciseId: string;
  exerciseName: string;
  metricType: CatalogEntry["metric_type"];
  sets: PendingSet[];
};

export type PendingSession = {
  date: string;
  split: Split;
  exercises: PendingExercise[];
  willOverwrite: boolean;
  /** How many sets the existing session holds — shown in the overwrite warning. */
  existingSetCount: number;
};

/**
 * Collapses repeats of the same exercise into one entry. set_number is unique per
 * (session, exercise), so two separate entries for one exercise would collide on
 * insert; appending the sets is what the user meant anyway.
 */
export function mergeDuplicateExercises(exercises: PendingExercise[]): PendingExercise[] {
  const byId = new Map<string, PendingExercise>();
  for (const exercise of exercises) {
    const existing = byId.get(exercise.exerciseId);
    if (existing) {
      existing.sets = [...existing.sets, ...exercise.sets];
    } else {
      byId.set(exercise.exerciseId, { ...exercise, sets: [...exercise.sets] });
    }
  }
  return [...byId.values()];
}

/** Converts a reviewed paste plan into pending sessions, dropping unmatched lines. */
export function toPendingSessions(sessions: ImportSession[]): PendingSession[] {
  return sessions
    .filter((session) => session.date && session.split)
    .map((session) => ({
      date: session.date!,
      split: session.split!,
      willOverwrite: session.willOverwrite,
      existingSetCount: 0,
      exercises: mergeDuplicateExercises(
        session.exercises
          .filter((entry) => entry.match)
          .map((entry) => ({
            exerciseId: entry.match!.id,
            exerciseName: entry.match!.name,
            metricType: entry.match!.metric_type,
            sets: entry.parsed.sets,
          }))
      ),
    }))
    .filter((session) => session.exercises.length > 0);
}

/** Looks up whether a date+split already holds a session, and how many sets it has. */
export async function checkSessionOverwrite(userId: string, date: string, split: Split) {
  const { data, error } = await supabase
    .from(TABLES.workoutSessions)
    .select("id")
    .eq("user_id", userId)
    .eq("session_date", date)
    .eq("split", split)
    .maybeSingle();

  if (error || !data) return { willOverwrite: false, existingSetCount: 0 };

  const { count } = await supabase
    .from(TABLES.workoutSets)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("session_id", (data as { id: string }).id);

  return { willOverwrite: true, existingSetCount: count ?? 0 };
}

/** Fills in the overwrite flag and existing set count for each pending session. */
export async function withOverwriteInfo(userId: string, sessions: PendingSession[]): Promise<PendingSession[]> {
  return Promise.all(
    sessions.map(async (session) => ({
      ...session,
      ...(await checkSessionOverwrite(userId, session.date, session.split)),
    }))
  );
}

export function buildAtomicRows(exercises: PendingExercise[], defaultUnit: Unit) {
  return mergeDuplicateExercises(exercises).flatMap((exercise) =>
    exercise.sets.map((set, setIndex) => {
      const unit = set.unit ?? defaultUnit;
      const hasWeight = set.weight != null;
      return {
        exercise_id: exercise.exerciseId,
        // Unique per (session, exercise), so numbering restarts for each exercise.
        set_number: setIndex + 1,
        reps: set.reps,
        weight_input: hasWeight ? set.weight : null,
        unit_input: hasWeight ? unit : null,
        weight_kg: hasWeight ? toKg(set.weight!, unit) : null,
        duration_seconds: set.durationSeconds,
      };
    })
  );
}

/** Commits one confirmed session. Replaces whatever that date+split already held. */
export async function commitPendingSession(
  session: PendingSession,
  defaultUnit: Unit
): Promise<{ ok: true; setCount: number } | { ok: false; message: string }> {
  const rows = buildAtomicRows(session.exercises, defaultUnit);

  if (rows.length === 0) {
    return { ok: false as const, message: "This session has no sets to save." };
  }

  return persistWorkoutSetsAtomic(
    // Same structural cast the log page uses for this helper.
    supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: { set_count?: number } | null; error: { message: string } | null }>;
    },
    {
      sessionDate: session.date,
      split: session.split,
      rows,
    }
  );
}
