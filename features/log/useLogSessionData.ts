import { useCallback, useEffect, useRef, useState } from "react";
import type { Unit } from "@/lib/convertWeight";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentSessionUser } from "@/lib/authSession";
import { TABLES } from "@/lib/dbNames";
import { ensureDefaultExercisesForUser } from "@/lib/defaultExercises";
import { getDaysAgo, makeSetKey } from "@/features/log/formatters";
import { createRequestVersionTracker } from "@/features/log/requestVersion";
import type {
  DurationSet,
  Exercise,
  LastSessionInfo,
  RecentWorkoutSession,
  Split,
  WeightedSet,
} from "@/features/log/types";

type UseLogSessionDataParams = {
  split: Split;
  date: string;
  isCurrentDate: boolean;
  setMsg: (message: string | null) => void;
};

type LastWeightedSetSnapshot = {
  sessionDate: string;
  reps: number | null;
  weightInput: number | null;
  unitInput: Unit | null;
};

type LastDurationSetSnapshot = {
  sessionDate: string;
  durationSeconds: number | null;
};

export function useLogSessionData({
  split,
  date,
  isCurrentDate,
  setMsg,
}: UseLogSessionDataParams) {
  const requestTrackerRef = useRef(createRequestVersionTracker());
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [lastSessionBySplit, setLastSessionBySplit] = useState<Partial<Record<Split, LastSessionInfo>>>({});
  const [recentSessions, setRecentSessions] = useState<RecentWorkoutSession[]>([]);
  const [weightedForm, setWeightedForm] = useState<Record<string, [WeightedSet, WeightedSet]>>({});
  const [durationForm, setDurationForm] = useState<Record<string, [DurationSet, DurationSet]>>({});
  const [lastModifiedBySetKey, setLastModifiedBySetKey] = useState<Record<string, string>>({});
  const [lastWeightedSetByKey, setLastWeightedSetByKey] = useState<
    Record<string, LastWeightedSetSnapshot>
  >({});
  const [lastDurationSetByKey, setLastDurationSetByKey] = useState<
    Record<string, LastDurationSetSnapshot>
  >({});

  const loadLastSessions = useCallback(async (requestVersion?: number) => {
    const isStale = () =>
      requestVersion != null && requestTrackerRef.current.isStale(requestVersion);

    const authState = await getCurrentSessionUser();
    if (isStale()) return;
    if (authState.status !== "ok") {
      setLastSessionBySplit({});
      return;
    }

    const userId = authState.userId;

    const { data, error } = await supabase
      .from(TABLES.workoutSessions)
      .select("split,session_date")
      .eq("user_id", userId)
      .order("session_date", { ascending: false });
    if (isStale()) return;

    if (error || !data) return;

    const next: Partial<Record<Split, LastSessionInfo>> = {};
    for (const row of data as Array<{ split: Split; session_date: string }>) {
      if (!next[row.split]) {
        next[row.split] = {
          sessionDate: row.session_date,
          daysAgo: getDaysAgo(row.session_date),
        };
      }
    }

    setLastSessionBySplit(next);
  }, []);

  const loadRecentSessions = useCallback(async (requestVersion?: number) => {
    const isStale = () =>
      requestVersion != null && requestTrackerRef.current.isStale(requestVersion);

    const authState = await getCurrentSessionUser();
    if (isStale()) return;
    if (authState.status !== "ok") {
      setRecentSessions([]);
      return;
    }

    const userId = authState.userId;
    const { data, error } = await supabase
      .from(TABLES.workoutSessions)
      .select("id,split,session_date")
      .eq("user_id", userId)
      .eq("split", split)
      .order("session_date", { ascending: false })
      .limit(5);
    if (isStale()) return;

    if (error) {
      setRecentSessions([]);
      return;
    }

    setRecentSessions((data ?? []) as RecentWorkoutSession[]);
  }, [split]);

  useEffect(() => {
    const tracker = requestTrackerRef.current;
    const requestVersion = tracker.next();
    const isStale = () => tracker.isStale(requestVersion);

    (async () => {
      if (isStale()) return;
      setMsg(null);

      void loadLastSessions(requestVersion);
      void loadRecentSessions(requestVersion);

      const authState = await getCurrentSessionUser();
      if (isStale()) return;
      if (authState.status === "error") {
        setMsg(`Error checking session: ${authState.message}`);
        setExercises([]);
        return;
      }

      if (authState.status === "unauthenticated") {
        setMsg("Not logged in. Go to /login first.");
        setExercises([]);
        return;
      }

      const userId = authState.userId;
      const seedError = await ensureDefaultExercisesForUser(userId);
      if (isStale()) return;
      if (seedError) {
        setMsg(`Error preparing default exercises: ${seedError}`);
        setExercises([]);
        return;
      }

      const { data, error } = await supabase
        .from(TABLES.exercises)
        .select("id,name,split,muscle_group,metric_type,sort_order")
        .eq("user_id", userId)
        .eq("split", split)
        .eq("is_active", true)
        .order("sort_order")
        .order("name");
      if (isStale()) return;

      if (error) {
        setMsg(`Error loading exercises: ${error.message}`);
        setExercises([]);
        return;
      }

      const rows = (data ?? []) as Exercise[];
      setExercises(rows);

      const weightedExerciseIds = rows
        .filter((exercise) => exercise.metric_type === "WEIGHTED_REPS")
        .map((exercise) => exercise.id);

      const durationExerciseIds = rows
        .filter((exercise) => exercise.metric_type === "DURATION")
        .map((exercise) => exercise.id);

      const trackedExerciseIds = [...weightedExerciseIds, ...durationExerciseIds];

      if (isCurrentDate && trackedExerciseIds.length > 0) {
        const { data: priorSessions, error: priorSessionsError } = await supabase
          .from(TABLES.workoutSessions)
          .select("id,session_date")
          .eq("user_id", userId)
          .eq("split", split)
          .lt("session_date", date)
          .order("session_date", { ascending: false })
          .limit(20);
        if (isStale()) return;

        if (priorSessionsError || !priorSessions || priorSessions.length === 0) {
          setLastWeightedSetByKey({});
          setLastDurationSetByKey({});
        } else {
          const sessionDateById = new Map(
            priorSessions.map((session) => [session.id as string, session.session_date as string])
          );

          const priorSessionIds = priorSessions.map((session) => session.id as string);
          const { data: priorSetRows, error: priorSetRowsError } = await supabase
            .from(TABLES.workoutSets)
            .select("session_id,exercise_id,set_number,reps,weight_input,unit_input,duration_seconds")
            .eq("user_id", userId)
            .in("session_id", priorSessionIds)
            .in("exercise_id", trackedExerciseIds);
          if (isStale()) return;

          if (priorSetRowsError || !priorSetRows) {
            setLastWeightedSetByKey({});
            setLastDurationSetByKey({});
          } else {
            const nextLastWeightedSetByKey: Record<string, LastWeightedSetSnapshot> = {};
            const nextLastDurationSetByKey: Record<string, LastDurationSetSnapshot> = {};

            for (const row of priorSetRows as Array<{
              session_id: string;
              exercise_id: string;
              set_number: number;
              reps: number | null;
              weight_input: number | null;
              unit_input: Unit | null;
              duration_seconds: number | null;
            }>) {
              if (row.set_number !== 1 && row.set_number !== 2) continue;

              const sessionDate = sessionDateById.get(row.session_id);
              if (!sessionDate) continue;

              const key = makeSetKey(row.exercise_id, row.set_number);
              if (weightedExerciseIds.includes(row.exercise_id)) {
                const existing = nextLastWeightedSetByKey[key];

                if (!existing || sessionDate > existing.sessionDate) {
                  nextLastWeightedSetByKey[key] = {
                    sessionDate,
                    reps: row.reps,
                    weightInput: row.weight_input,
                    unitInput: row.unit_input,
                  };
                }
              }

              if (durationExerciseIds.includes(row.exercise_id)) {
                const existing = nextLastDurationSetByKey[key];

                if (!existing || sessionDate > existing.sessionDate) {
                  nextLastDurationSetByKey[key] = {
                    sessionDate,
                    durationSeconds: row.duration_seconds,
                  };
                }
              }
            }

            setLastWeightedSetByKey(nextLastWeightedSetByKey);
            setLastDurationSetByKey(nextLastDurationSetByKey);
          }
        }
      } else {
        setLastWeightedSetByKey({});
        setLastDurationSetByKey({});
      }

      const weightedDefaults: Record<string, [WeightedSet, WeightedSet]> = {};
      const durationDefaults: Record<string, [DurationSet, DurationSet]> = {};

      for (const ex of rows) {
        if (ex.metric_type === "WEIGHTED_REPS") {
          weightedDefaults[ex.id] = [
            { reps: "", weight: "", unit: "lb" },
            { reps: "", weight: "", unit: "lb" },
          ];
        } else {
          durationDefaults[ex.id] = [{ seconds: "" }, { seconds: "" }];
        }
      }

      const { data: existingSession } = await supabase
        .from(TABLES.workoutSessions)
        .select("id")
        .eq("user_id", userId)
        .eq("session_date", date)
        .eq("split", split)
        .maybeSingle();
      if (isStale()) return;

      if (existingSession?.id) {
        const { data: existingSets } = await supabase
          .from(TABLES.workoutSets)
          .select("*")
          .eq("session_id", existingSession.id)
          .order("set_number", { ascending: true });
        if (isStale()) return;

        const modifiedMap: Record<string, string> = {};

        for (const row of (existingSets ?? []) as Array<{
          exercise_id: string;
          set_number: number;
          reps: number | null;
          weight_input: number | null;
          unit_input: Unit | null;
          duration_seconds: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        }>) {
          const setIdx = row.set_number === 2 ? 1 : 0;
          if (setIdx !== 0 && setIdx !== 1) continue;

          if (weightedDefaults[row.exercise_id]) {
            weightedDefaults[row.exercise_id][setIdx] = {
              reps: row.reps != null ? String(row.reps) : "",
              weight: row.weight_input != null ? String(row.weight_input) : "",
              unit: row.unit_input ?? "lb",
            };
          }

          if (durationDefaults[row.exercise_id]) {
            durationDefaults[row.exercise_id][setIdx] = {
              seconds: row.duration_seconds != null ? String(row.duration_seconds) : "",
            };
          }

          const modifiedAt = row.updated_at ?? row.created_at;
          if (modifiedAt) {
            modifiedMap[`${row.exercise_id}:${row.set_number}`] = modifiedAt;
          }
        }

        setLastModifiedBySetKey(modifiedMap);
      } else {
        setLastModifiedBySetKey({});
      }

      setWeightedForm(weightedDefaults);
      setDurationForm(durationDefaults);
    })();

    return () => {
      tracker.invalidate();
    };
  }, [date, isCurrentDate, loadLastSessions, loadRecentSessions, setMsg, split]);

  return {
    exercises,
    lastSessionBySplit,
    recentSessions,
    weightedForm,
    durationForm,
    lastWeightedSetByKey,
    lastDurationSetByKey,
    lastModifiedBySetKey,
    setWeightedForm,
    setDurationForm,
    setLastModifiedBySetKey,
    loadLastSessions,
    loadRecentSessions,
  };
}
