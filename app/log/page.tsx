"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { LB_PER_KG, toKg, type Unit } from "@/lib/convertWeight";

type Split = "push" | "pull" | "legs" | "core";
type MetricType = "WEIGHTED_REPS" | "DURATION";

type Exercise = {
  id: string;
  name: string;
  split: Split;
  muscle_group: string;
  metric_type: MetricType;
  sort_order: number;
};

type WeightedSet = { reps: string; weight: string; unit: Unit };
type DurationSet = { seconds: string };

type WorkoutSetInsert = {
  user_id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_input: number | null;
  unit_input: Unit | null;
  weight_kg: number | null;
  duration_seconds: number | null;
};

type ExistingWorkoutSet = {
  id: string;
  exercise_id: string;
  set_number: number;
  created_at?: string | null;
  updated_at?: string | null;
};

type LastSessionInfo = {
  sessionDate: string;
  daysAgo: number;
};

type RecentWorkoutSession = {
  id: string;
  split: Split;
  session_date: string;
};

type PendingSessionDelete = {
  id: string;
  split: Split;
  sessionDate: string;
};

type PendingSessionSummary = {
  id: string;
  split: Split;
  sessionDate: string;
};

type PendingSetDelete = {
  exerciseId: string;
  exerciseName: string;
  metricType: MetricType;
  setIdx: 0 | 1;
};

type PendingSessionEdit = {
  id: string;
  split: Split;
  sessionDate: string;
  newDate: string;
};

type SessionSummaryItem = {
  exerciseId: string;
  exerciseName: string;
  metricType: MetricType;
  sets: number;
  totalReps: number;
  maxWeight: number | null;
  unit: Unit | null;
  totalDurationSeconds: number;
  setDetails: Array<{
    setNumber: number;
    reps: number | null;
    weightInput: number | null;
    unitInput: Unit | null;
    durationSeconds: number | null;
  }>;
};

export default function LogWorkoutPage() {
  const today = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);
  const [split, setSplit] = useState<Split>("push");
  const [date, setDate] = useState<string>(() => today);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastSessionBySplit, setLastSessionBySplit] = useState<Partial<Record<Split, LastSessionInfo>>>({});
  const [recentSessions, setRecentSessions] = useState<RecentWorkoutSession[]>([]);
  const [pendingSetDelete, setPendingSetDelete] = useState<PendingSetDelete | null>(null);
  const [pendingSessionDelete, setPendingSessionDelete] = useState<PendingSessionDelete | null>(null);
  const [pendingSessionSummary, setPendingSessionSummary] = useState<PendingSessionSummary | null>(null);
  const [pendingSessionEdit, setPendingSessionEdit] = useState<PendingSessionEdit | null>(null);
  const [sessionSummaryItems, setSessionSummaryItems] = useState<SessionSummaryItem[]>([]);
  const [sessionSummaryLoading, setSessionSummaryLoading] = useState(false);
  const [summaryUnit, setSummaryUnit] = useState<Unit>("lb");
  const [lastModifiedBySetKey, setLastModifiedBySetKey] = useState<Record<string, string>>({});

  // Form state keyed by exercise_id
  const [weightedForm, setWeightedForm] = useState<Record<string, [WeightedSet, WeightedSet]>>({});
  const [durationForm, setDurationForm] = useState<Record<string, [DurationSet, DurationSet]>>({});

  function getDaysAgo(sessionDate: string) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [year, month, day] = sessionDate.split("-").map(Number);
    const loggedDay = new Date(year, month - 1, day);

    const diffMs = today.getTime() - loggedDay.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  const loadLastSessions = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setLastSessionBySplit({});
      return;
    }

    const userId = sessionData.session.user.id;

    const { data, error } = await supabase
      .from("workout_sessions")
      .select("split,session_date")
      .eq("user_id", userId)
      .order("session_date", { ascending: false });

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

  const loadRecentSessions = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setRecentSessions([]);
      return;
    }

    const userId = sessionData.session.user.id;
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("id,split,session_date")
      .eq("user_id", userId)
      .eq("split", split)
      .order("session_date", { ascending: false })
      .limit(5);

    if (error) {
      setRecentSessions([]);
      return;
    }

    setRecentSessions((data ?? []) as RecentWorkoutSession[]);
  }, [split]);

  // Fetch exercises + existing saved sets for selected split/date
  useEffect(() => {
    (async () => {
      setMsg(null);

      void loadLastSessions();
      void loadRecentSessions();

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setMsg("Not logged in. Go to /login first.");
        setExercises([]);
        return;
      }

      const { data, error } = await supabase
        .from("exercises")
        .select("id,name,split,muscle_group,metric_type,sort_order")
        .eq("split", split)
        .eq("is_active", true)
        .order("sort_order");

      if (error) {
        setMsg(`Error loading exercises: ${error.message}`);
        setExercises([]);
        return;
      }

      const rows = (data ?? []) as Exercise[];
      setExercises(rows);

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
        .from("workout_sessions")
        .select("id")
        .eq("user_id", sessionData.session.user.id)
        .eq("session_date", date)
        .eq("split", split)
        .maybeSingle();

      if (existingSession?.id) {
        const { data: existingSets } = await supabase
          .from("workout_sets")
          .select("*")
          .eq("session_id", existingSession.id)
          .order("set_number", { ascending: true });

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
  }, [split, date, loadLastSessions, loadRecentSessions]);

  const grouped = useMemo(() => {
    const map = new Map<string, Exercise[]>();
    for (const ex of exercises) {
      const key = ex.muscle_group;
      map.set(key, [...(map.get(key) ?? []), ex]);
    }
    return Array.from(map.entries());
  }, [exercises]);

  const splitLabel = split.charAt(0).toUpperCase() + split.slice(1);
  const selectedLastSession = lastSessionBySplit[split];

  function formatLastSessionDate(sessionDate: string) {
    return new Date(`${sessionDate}T00:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function updateWeighted(exId: string, setIdx: 0 | 1, patch: Partial<WeightedSet>) {
    setWeightedForm((prev) => {
      const cur = prev[exId] ?? [
        { reps: "", weight: "", unit: "lb" as Unit },
        { reps: "", weight: "", unit: "lb" as Unit },
      ];
      const next: [WeightedSet, WeightedSet] = [
        { ...cur[0] },
        { ...cur[1] },
      ];
      next[setIdx] = { ...next[setIdx], ...patch };
      return { ...prev, [exId]: next };
    });
  }

  function updateDuration(exId: string, setIdx: 0 | 1, seconds: string) {
    setDurationForm((prev) => {
      const cur = prev[exId] ?? [{ seconds: "" }, { seconds: "" }];
      const next: [DurationSet, DurationSet] = [{ ...cur[0] }, { ...cur[1] }];
      next[setIdx] = { seconds };
      return { ...prev, [exId]: next };
    });
  }

  function formatModified(timestamp: string) {
    return new Date(timestamp).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatAlternateWeight(weightText: string, unit: Unit) {
    if (!weightText) return null;

    const value = Number(weightText);
    if (!Number.isFinite(value) || value < 0) return null;

    if (unit === "lb") {
      const kg = value / LB_PER_KG;
      return `${kg.toFixed(1)} kg`;
    }

    const lb = value * LB_PER_KG;
    return `${lb.toFixed(1)} lb`;
  }

  function formatSummaryWeight(weightValue: number | null, inputUnit: Unit | null) {
    if (weightValue == null) return "-";

    const sourceUnit = inputUnit ?? "lb";
    const kgValue = toKg(weightValue, sourceUnit);
    const valueInSelectedUnit = summaryUnit === "kg" ? kgValue : kgValue * LB_PER_KG;
    return `${valueInSelectedUnit.toFixed(1)} ${summaryUnit}`;
  }

  function makeSetKey(exerciseId: string, setNumber: number) {
    return `${exerciseId}:${setNumber}`;
  }

  function validateSessionDate() {
    if (date > today) {
      setMsg("Future workout dates are not allowed.");
      return false;
    }
    return true;
  }

  async function ensureSession(userId: string) {
    const { data: sessionRow, error: upsertErr } = await supabase
      .from("workout_sessions")
      .upsert({ user_id: userId, session_date: date, split }, { onConflict: "user_id,session_date,split" })
      .select("id")
      .single();

    if (upsertErr || !sessionRow?.id) {
      setMsg(`Failed to create session: ${upsertErr?.message ?? "Unknown error"}`);
      return null;
    }

    return sessionRow.id as string;
  }

  async function save() {
    if (!validateSessionDate()) return;

    setLoading(true);
    setMsg(null);

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    
    if (sessionErr || !sessionData.session) {
      setLoading(false);
      setMsg("You’re not logged in. Go to /login first.");
      return;
    }
    const userId = sessionData.session.user.id;

    // 1) Upsert/find workout session for date+split
    const { data: sessionRow, error: upsertErr } = await supabase
      .from("workout_sessions")
      .upsert(
          { user_id: userId, session_date: date, split },
          { onConflict: "user_id,session_date,split" }
        )

      .select("id")
      .single();

    if (upsertErr) {
      setLoading(false);
      setMsg(`Failed to create session: ${upsertErr.message}`);
      return;
    }

    const sessionId = sessionRow.id as string;

    const { data: existingSetRows, error: existingSetErr } = await supabase
      .from("workout_sets")
      .select("id,exercise_id,set_number")
      .eq("session_id", sessionId);

    if (existingSetErr) {
      setLoading(false);
      setMsg(`Failed loading existing sets: ${existingSetErr.message}`);
      return;
    }

    const existingByKey = new Map<string, string>();
    for (const row of (existingSetRows ?? []) as ExistingWorkoutSet[]) {
      existingByKey.set(`${row.exercise_id}:${row.set_number}`, row.id);
    }

    const inserts: WorkoutSetInsert[] = [];
    const updates: Array<WorkoutSetInsert & { id: string }> = [];
    const deleteIds: string[] = [];

    for (const ex of exercises) {
      if (ex.metric_type === "WEIGHTED_REPS") {
        const sets = weightedForm[ex.id];
        if (!sets) continue;

        for (let i = 0; i < 2; i++) {
          const repsNum = Number(sets[i].reps);
          const wNum = Number(sets[i].weight);
          const unit = sets[i].unit;

          // Skip empty set rows
          if (!sets[i].reps && !sets[i].weight) continue;

          if (!Number.isFinite(repsNum) || repsNum < 0) {
            setLoading(false);
            setMsg(`Invalid reps for ${ex.name} set ${i + 1}`);
            return;
          }
          if (!Number.isFinite(wNum) || wNum < 0) {
            setLoading(false);
            setMsg(`Invalid weight for ${ex.name} set ${i + 1}`);
            return;
          }

          const setNumber = i + 1;
          const key = `${ex.id}:${setNumber}`;
          const existingId = existingByKey.get(key);
          const rowPayload: WorkoutSetInsert = {
            user_id: userId,
            session_id: sessionId,
            exercise_id: ex.id,
            set_number: setNumber,
            reps: repsNum,
            weight_input: wNum,
            unit_input: unit,
            weight_kg: toKg(wNum, unit),
            duration_seconds: null,
          };

          if (existingId) {
            updates.push({ ...rowPayload, id: existingId });
          } else {
            inserts.push(rowPayload);
          }
        }
      } else {
        // DURATION (Plank)
        const sets = durationForm[ex.id];
        if (!sets) continue;

        for (let i = 0; i < 2; i++) {
          if (!sets[i].seconds) continue;
          const secNum = Number(sets[i].seconds);
          if (!Number.isFinite(secNum) || secNum < 0) {
            setLoading(false);
            setMsg(`Invalid seconds for ${ex.name} set ${i + 1}`);
            return;
          }

          const setNumber = i + 1;
          const key = `${ex.id}:${setNumber}`;
          const existingId = existingByKey.get(key);
          const rowPayload: WorkoutSetInsert = {
            user_id: userId,
            session_id: sessionId,
            exercise_id: ex.id,
            set_number: setNumber,
            reps: null,
            weight_input: null,
            unit_input: null,
            weight_kg: null,
            duration_seconds: secNum,
          };

          if (existingId) {
            updates.push({ ...rowPayload, id: existingId });
          } else {
            inserts.push(rowPayload);
          }
        }
      }

      for (let i = 0; i < 2; i++) {
        const setNumber = i + 1;
        const key = `${ex.id}:${setNumber}`;
        const existingId = existingByKey.get(key);
        if (!existingId) continue;

        const stillPresent = updates.some((row) => row.id === existingId);
        if (!stillPresent) {
          deleteIds.push(existingId);
        }
      }
    }

    if (inserts.length > 0) {
      const { error: insertErr } = await supabase.from("workout_sets").insert(inserts);
      if (insertErr) {
        setLoading(false);
        setMsg(`Failed inserting sets: ${insertErr.message}`);
        return;
      }
    }

    if (updates.length > 0) {
      const { error: updateErr } = await supabase.from("workout_sets").upsert(updates, { onConflict: "id" });
      if (updateErr) {
        setLoading(false);
        setMsg(`Failed updating sets: ${updateErr.message}`);
        return;
      }
    }

    if (deleteIds.length > 0) {
      const { error: deleteErr } = await supabase.from("workout_sets").delete().in("id", deleteIds);
      if (deleteErr) {
        setLoading(false);
        setMsg(`Failed deleting cleared sets: ${deleteErr.message}`);
        return;
      }
    }

    setLoading(false);
    setMsg("Saved workout progress ✅");
    void loadLastSessions();
    void loadRecentSessions();
  }

  async function saveSingleSet(ex: Exercise, setIdx: 0 | 1) {
    if (!validateSessionDate()) return;

    setLoading(true);
    setMsg(null);

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData.session) {
      setLoading(false);
      setMsg("You’re not logged in. Go to /login first.");
      return;
    }

    const userId = sessionData.session.user.id;
    const sessionId = await ensureSession(userId);
    if (!sessionId) {
      setLoading(false);
      return;
    }

    const setNumber = setIdx + 1;
    const key = makeSetKey(ex.id, setNumber);

    const { data: existingSet, error: existingErr } = await supabase
      .from("workout_sets")
      .select("id")
      .eq("session_id", sessionId)
      .eq("exercise_id", ex.id)
      .eq("set_number", setNumber)
      .maybeSingle();

    if (existingErr) {
      setLoading(false);
      setMsg(`Failed loading existing set: ${existingErr.message}`);
      return;
    }

    let payload: WorkoutSetInsert | null = null;

    if (ex.metric_type === "WEIGHTED_REPS") {
      const row = weightedForm[ex.id]?.[setIdx] ?? { reps: "", weight: "", unit: "lb" as Unit };
      if (!row.reps && !row.weight) {
        payload = null;
      } else {
        const repsNum = Number(row.reps);
        const weightNum = Number(row.weight);

        if (!Number.isFinite(repsNum) || repsNum < 0) {
          setLoading(false);
          setMsg(`Invalid reps for ${ex.name} set ${setNumber}`);
          return;
        }
        if (!Number.isFinite(weightNum) || weightNum < 0) {
          setLoading(false);
          setMsg(`Invalid weight for ${ex.name} set ${setNumber}`);
          return;
        }

        payload = {
          user_id: userId,
          session_id: sessionId,
          exercise_id: ex.id,
          set_number: setNumber,
          reps: repsNum,
          weight_input: weightNum,
          unit_input: row.unit,
          weight_kg: toKg(weightNum, row.unit),
          duration_seconds: null,
        };
      }
    } else {
      const row = durationForm[ex.id]?.[setIdx] ?? { seconds: "" };
      if (!row.seconds) {
        payload = null;
      } else {
        const secNum = Number(row.seconds);
        if (!Number.isFinite(secNum) || secNum < 0) {
          setLoading(false);
          setMsg(`Invalid seconds for ${ex.name} set ${setNumber}`);
          return;
        }

        payload = {
          user_id: userId,
          session_id: sessionId,
          exercise_id: ex.id,
          set_number: setNumber,
          reps: null,
          weight_input: null,
          unit_input: null,
          weight_kg: null,
          duration_seconds: secNum,
        };
      }
    }

    if (!payload) {
      if (existingSet?.id) {
        const { error: delErr } = await supabase.from("workout_sets").delete().eq("id", existingSet.id);
        if (delErr) {
          setLoading(false);
          setMsg(`Failed deleting set: ${delErr.message}`);
          return;
        }
      }

      setLastModifiedBySetKey((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setLoading(false);
      setMsg(`${ex.name} set ${setNumber} cleared ✅`);
      return;
    }

    if (existingSet?.id) {
      const { error: updateErr } = await supabase
        .from("workout_sets")
        .update(payload)
        .eq("id", existingSet.id);

      if (updateErr) {
        setLoading(false);
        setMsg(`Failed saving set: ${updateErr.message}`);
        return;
      }
    } else {
      const { error: insertErr } = await supabase.from("workout_sets").insert(payload);
      if (insertErr) {
        setLoading(false);
        setMsg(`Failed saving set: ${insertErr.message}`);
        return;
      }
    }

    setLastModifiedBySetKey((prev) => ({ ...prev, [key]: new Date().toISOString() }));
    setLoading(false);
    setMsg(`${ex.name} set ${setNumber} saved ✅`);
    void loadLastSessions();
    void loadRecentSessions();
  }

  function requestDeleteSingleSet(ex: Exercise, setIdx: 0 | 1) {
    setPendingSetDelete({
      exerciseId: ex.id,
      exerciseName: ex.name,
      metricType: ex.metric_type,
      setIdx,
    });
  }

  function cancelDeleteSingleSet() {
    setPendingSetDelete(null);
    setMsg("Set delete cancelled.");
  }

  async function confirmDeleteSingleSet() {
    if (!pendingSetDelete) return;
    const target = pendingSetDelete;
    setPendingSetDelete(null);

    const setNumber = target.setIdx + 1;

    setLoading(true);
    setMsg(null);

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData.session) {
      setLoading(false);
      setMsg("You’re not logged in. Go to /login first.");
      return;
    }

    const userId = sessionData.session.user.id;
    const { data: sessionRow, error: sessionLookupErr } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("session_date", date)
      .eq("split", split)
      .maybeSingle();

    if (sessionLookupErr) {
      setLoading(false);
      setMsg(`Failed finding session: ${sessionLookupErr.message}`);
      return;
    }

    if (sessionRow?.id) {
      const { error: deleteErr } = await supabase
        .from("workout_sets")
        .delete()
        .eq("session_id", sessionRow.id)
        .eq("exercise_id", target.exerciseId)
        .eq("set_number", setNumber);

      if (deleteErr) {
        setLoading(false);
        setMsg(`Failed deleting set: ${deleteErr.message}`);
        return;
      }
    }

    if (target.metricType === "WEIGHTED_REPS") {
      updateWeighted(target.exerciseId, target.setIdx, { reps: "", weight: "" });
    } else {
      updateDuration(target.exerciseId, target.setIdx, "");
    }

    const key = makeSetKey(target.exerciseId, setNumber);
    setLastModifiedBySetKey((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    setLoading(false);
    setMsg(`${target.exerciseName} set ${setNumber} deleted 🗑️`);
    void loadRecentSessions();
  }

  function requestDeleteSession(session: RecentWorkoutSession) {
    setPendingSessionDelete({
      id: session.id,
      split: session.split,
      sessionDate: session.session_date,
    });
  }

  function requestEditSessionDate(session: RecentWorkoutSession) {
    setPendingSessionEdit({
      id: session.id,
      split: session.split,
      sessionDate: session.session_date,
      newDate: session.session_date,
    });
  }

  function cancelEditSessionDate() {
    setPendingSessionEdit(null);
  }

  async function confirmEditSessionDate() {
    if (!pendingSessionEdit) return;

    if (pendingSessionEdit.newDate > today) {
      setMsg("Future workout dates are not allowed.");
      return;
    }

    if (pendingSessionEdit.newDate === pendingSessionEdit.sessionDate) {
      setPendingSessionEdit(null);
      return;
    }

    const target = pendingSessionEdit;
    setLoading(true);
    setMsg(null);

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData.session) {
      setLoading(false);
      setMsg("You’re not logged in. Go to /login first.");
      return;
    }

    const userId = sessionData.session.user.id;

    const { error: updateErr } = await supabase
      .from("workout_sessions")
      .update({ session_date: target.newDate })
      .eq("id", target.id)
      .eq("user_id", userId);

    if (updateErr) {
      setLoading(false);
      setMsg(`Failed updating session date: ${updateErr.message}`);
      return;
    }

    if (target.sessionDate === date && target.split === split) {
      setDate(target.newDate);
    }

    if (pendingSessionSummary?.id === target.id) {
      setPendingSessionSummary((prev) => {
        if (!prev) return prev;
        return { ...prev, sessionDate: target.newDate };
      });
    }

    setPendingSessionEdit(null);
    setLoading(false);
    setMsg(`Updated session date to ${target.newDate} ✅`);
    void loadLastSessions();
    void loadRecentSessions();
  }

  async function requestSessionSummary(session: RecentWorkoutSession) {
    setSummaryUnit("lb");
    setPendingSessionSummary({
      id: session.id,
      split: session.split,
      sessionDate: session.session_date,
    });
    setSessionSummaryItems([]);
    setSessionSummaryLoading(true);
    setMsg(null);

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData.session) {
      setSessionSummaryLoading(false);
      setMsg("You’re not logged in. Go to /login first.");
      return;
    }

    const userId = sessionData.session.user.id;

    const { data: setRows, error: setErr } = await supabase
      .from("workout_sets")
      .select("exercise_id,set_number,reps,weight_input,unit_input,duration_seconds")
      .eq("user_id", userId)
      .eq("session_id", session.id);

    if (setErr) {
      setSessionSummaryLoading(false);
      setMsg(`Failed loading session summary: ${setErr.message}`);
      return;
    }

    if (!setRows || setRows.length === 0) {
      setSessionSummaryItems([]);
      setSessionSummaryLoading(false);
      return;
    }

    const exerciseIds = Array.from(new Set((setRows as Array<{ exercise_id: string }>).map((row) => row.exercise_id)));

    const { data: exerciseRows, error: exerciseErr } = await supabase
      .from("exercises")
      .select("id,name,metric_type")
      .in("id", exerciseIds);

    if (exerciseErr) {
      setSessionSummaryLoading(false);
      setMsg(`Failed loading exercise names: ${exerciseErr.message}`);
      return;
    }

    const exerciseMeta = new Map<string, { name: string; metricType: MetricType }>();
    for (const row of (exerciseRows ?? []) as Array<{ id: string; name: string; metric_type: MetricType }>) {
      exerciseMeta.set(row.id, { name: row.name, metricType: row.metric_type });
    }

    const summaryMap = new Map<string, SessionSummaryItem>();

    for (const row of setRows as Array<{
      exercise_id: string;
      set_number: number;
      reps: number | null;
      weight_input: number | null;
      unit_input: Unit | null;
      duration_seconds: number | null;
    }>) {
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
          unit: null,
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
          item.maxWeight = item.maxWeight == null ? row.weight_input : Math.max(item.maxWeight, row.weight_input);
        }
        if (!item.unit && row.unit_input) {
          item.unit = row.unit_input;
        }
      } else {
        item.totalDurationSeconds += row.duration_seconds ?? 0;
      }
    }

    const splitSummaryOrder: Partial<Record<Split, string[]>> = {
      push: [
        "incline",
        "tricep push",
        "tricep pull",
        "barbell shoulder",
        "pec fly",
        "peck fly",
        "overhead tricep",
        "overhead tricept",
        "converging",
      ],
      pull: [
        "bendover barbell row",
        "bent over barbell row",
        "hammer",
        "upper back row",
        "preacher",
        "pracher",
        "preacher curl",
        "lat pull down",
        "lat pulldown",
      ],
      legs: [
        "squat",
        "romainian",
        "romanian",
        "leg extension",
        "leg curl",
        "calves",
        "prone leg curl",
      ],
    };

    const normalizeText = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const getOrderIndex = (exerciseName: string, orderList: string[]) => {
      const normalized = normalizeText(exerciseName);
      const index = orderList.findIndex((label) => normalized.includes(normalizeText(label)));
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };

    const sortedItems = Array.from(summaryMap.values())
      .map((item) => ({
        ...item,
        setDetails: [...item.setDetails].sort((a, b) => a.setNumber - b.setNumber),
      }))
      .sort((a, b) => {
        const activeOrder = splitSummaryOrder[session.split];
        if (activeOrder && activeOrder.length > 0) {
          const aIndex = getOrderIndex(a.exerciseName, activeOrder);
          const bIndex = getOrderIndex(b.exerciseName, activeOrder);
          if (aIndex !== bIndex) return aIndex - bIndex;
        }

        return a.exerciseName.localeCompare(b.exerciseName);
      });

    setSessionSummaryItems(sortedItems);
    setSessionSummaryLoading(false);
  }

  function closeSessionSummary() {
    setPendingSessionSummary(null);
    setSessionSummaryItems([]);
    setSessionSummaryLoading(false);
  }

  async function confirmDeleteSession() {
    if (!pendingSessionDelete) return;

    const target = pendingSessionDelete;
    setPendingSessionDelete(null);
    setLoading(true);
    setMsg(null);

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData.session) {
      setLoading(false);
      setMsg("You’re not logged in. Go to /login first.");
      return;
    }

    const userId = sessionData.session.user.id;

    const { error: deleteSetsErr } = await supabase
      .from("workout_sets")
      .delete()
      .eq("session_id", target.id)
      .eq("user_id", userId);

    if (deleteSetsErr) {
      setLoading(false);
      setMsg(`Failed deleting session sets: ${deleteSetsErr.message}`);
      return;
    }

    const { error: deleteSessionErr } = await supabase
      .from("workout_sessions")
      .delete()
      .eq("id", target.id)
      .eq("user_id", userId);

    if (deleteSessionErr) {
      setLoading(false);
      setMsg(`Failed deleting session: ${deleteSessionErr.message}`);
      return;
    }

    if (target.sessionDate === date && target.split === split) {
      const weightedDefaults: Record<string, [WeightedSet, WeightedSet]> = {};
      const durationDefaults: Record<string, [DurationSet, DurationSet]> = {};

      for (const ex of exercises) {
        if (ex.metric_type === "WEIGHTED_REPS") {
          weightedDefaults[ex.id] = [
            { reps: "", weight: "", unit: "lb" },
            { reps: "", weight: "", unit: "lb" },
          ];
        } else {
          durationDefaults[ex.id] = [{ seconds: "" }, { seconds: "" }];
        }
      }

      setWeightedForm(weightedDefaults);
      setDurationForm(durationDefaults);
      setLastModifiedBySetKey({});
    }

    setLoading(false);
    setMsg(`Deleted ${target.split.toUpperCase()} session from ${target.sessionDate} 🗑️`);
    void loadLastSessions();
    void loadRecentSessions();
  }

  function cancelDeleteSession() {
    setPendingSessionDelete(null);
    setMsg("Session delete cancelled.");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(245,158,11,0.2),transparent_34%),radial-gradient(circle_at_88%_10%,rgba(16,185,129,0.14),transparent_30%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:46px_46px] opacity-20" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">Workout Logger</p>
        <h1 className="mt-3 text-4xl font-bold text-white">Build Strength, Set by Set</h1>
        <p className="mt-2 max-w-2xl text-zinc-300">
          Log your {splitLabel} session with precision and keep momentum every training day.
        </p>

        <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="session-date" className="mb-1 block text-sm text-zinc-300">
                Session Date
              </label>
              <input
                id="session-date"
                className="rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="flex w-full flex-wrap gap-2 rounded-xl border border-zinc-700/70 bg-zinc-950/60 p-1.5 sm:w-auto sm:flex-1">
              {(["push", "pull", "legs", "core"] as Split[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSplit(s)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    split === s
                      ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                      : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  }`}
                >
                  <div className="text-center">
                    <div>{s.toUpperCase()}</div>
                    <div className={`mt-0.5 text-[11px] ${split === s ? "text-zinc-800/80" : "text-zinc-500"}`}>
                      {lastSessionBySplit[s] ? `${lastSessionBySplit[s]!.daysAgo}d ago` : "new"}
                    </div>
                  </div>
                </button>
              ))}
            </div>

          </div>

          <div className="mt-4 rounded-2xl border border-zinc-700/70 bg-gradient-to-r from-zinc-900 via-zinc-900/95 to-zinc-800/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300/85">Session Reminder</p>
            <p className="mt-2 text-sm text-zinc-200">
              {selectedLastSession
                ? `Last ${splitLabel} session: ${formatLastSessionDate(selectedLastSession.sessionDate)} · ${selectedLastSession.daysAgo} day${selectedLastSession.daysAgo === 1 ? "" : "s"} ago`
                : `No ${splitLabel} session logged yet. Start your first one today.`}
            </p>
          </div>

          {msg && (
            <p className={`mt-4 text-sm ${msg.toLowerCase().includes("saved") ? "text-emerald-300" : "text-red-300"}`}>
              {msg}
            </p>
          )}
        </div>

        <div className="mt-6 space-y-6">
          {grouped.map(([muscle, list]) => (
            <div key={muscle} className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
              <h2 className="text-lg font-semibold capitalize text-white">{muscle}</h2>

              <div className="mt-4 space-y-4">
                {list.map((ex) => (
                  <div key={ex.id} className="rounded-2xl border border-zinc-700/70 bg-zinc-950/60 p-4">
                    <div className="font-medium text-zinc-100">{ex.name}</div>

                    {ex.metric_type === "WEIGHTED_REPS" ? (
                      <div className="mt-3 grid gap-3">
                        {[0, 1].map((i) => {
                          const setIdx = i as 0 | 1;
                          const row = weightedForm[ex.id]?.[setIdx];
                          return (
                            <div key={i} className="flex flex-wrap items-center gap-2">
                              <span className="w-12 text-sm text-zinc-300">Set {i + 1}</span>

                              <input
                                className="w-24 rounded-md border border-zinc-700 bg-zinc-900 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                                placeholder="Reps"
                                inputMode="numeric"
                                value={row?.reps ?? ""}
                                onChange={(e) => updateWeighted(ex.id, setIdx, { reps: e.target.value })}
                              />

                              <input
                                className="w-28 rounded-md border border-zinc-700 bg-zinc-900 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                                placeholder="Weight"
                                inputMode="decimal"
                                value={row?.weight ?? ""}
                                onChange={(e) => updateWeighted(ex.id, setIdx, { weight: e.target.value })}
                              />

                              <select
                                className="rounded-md border border-zinc-700 bg-zinc-900 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                                value={row?.unit ?? "lb"}
                                onChange={(e) => updateWeighted(ex.id, setIdx, { unit: e.target.value as Unit })}
                              >
                                <option value="lb">lb</option>
                                <option value="kg">kg</option>
                              </select>

                              {row?.weight && (
                                <span className="text-xs font-medium text-amber-200/90">
                                  {formatAlternateWeight(row.weight, row.unit ?? "lb")}
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => void saveSingleSet(ex, setIdx)}
                                disabled={loading}
                                className="rounded-md border border-emerald-400/60 px-2 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-50"
                              >
                                Save
                              </button>

                              <button
                                type="button"
                                onClick={() => requestDeleteSingleSet(ex, setIdx)}
                                disabled={loading}
                                className="rounded-md border border-red-400/60 px-2 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                              >
                                Delete
                              </button>

                              {lastModifiedBySetKey[makeSetKey(ex.id, setIdx + 1)] && (
                                <span className="text-xs text-zinc-500">
                                  Modified {formatModified(lastModifiedBySetKey[makeSetKey(ex.id, setIdx + 1)])}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 grid gap-3">
                        {[0, 1].map((i) => {
                          const setIdx = i as 0 | 1;
                          const row = durationForm[ex.id]?.[setIdx];
                          return (
                            <div key={i} className="flex flex-wrap items-center gap-2">
                              <span className="w-12 text-sm text-zinc-300">Set {i + 1}</span>

                              <input
                                className="w-40 rounded-md border border-zinc-700 bg-zinc-900 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                                placeholder="Seconds"
                                inputMode="numeric"
                                value={row?.seconds ?? ""}
                                onChange={(e) => updateDuration(ex.id, setIdx, e.target.value)}
                              />

                              <span className="text-sm text-zinc-400">seconds</span>

                              <button
                                type="button"
                                onClick={() => void saveSingleSet(ex, setIdx)}
                                disabled={loading}
                                className="rounded-md border border-emerald-400/60 px-2 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-50"
                              >
                                Save
                              </button>

                              <button
                                type="button"
                                onClick={() => requestDeleteSingleSet(ex, setIdx)}
                                disabled={loading}
                                className="rounded-md border border-red-400/60 px-2 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                              >
                                Delete
                              </button>

                              {lastModifiedBySetKey[makeSetKey(ex.id, setIdx + 1)] && (
                                <span className="text-xs text-zinc-500">
                                  Modified {formatModified(lastModifiedBySetKey[makeSetKey(ex.id, setIdx + 1)])}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
          <div className="flex justify-center">
            <button
              onClick={save}
              disabled={loading}
              className="rounded-md bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 px-5 py-2 font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60"
            >
              {loading ? "Saving..." : "Save Workout"}
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Last 5 Sessions</h2>
              <p className="mt-1 text-xs text-zinc-400">Recent {splitLabel} sessions</p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {recentSessions.length === 0 ? (
              <p className="text-sm text-zinc-400">No {splitLabel} sessions logged yet.</p>
            ) : (
              recentSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{formatLastSessionDate(session.session_date)}</p>
                    <p className="text-xs uppercase tracking-wide text-zinc-500">{session.split}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => requestEditSessionDate(session)}
                      disabled={loading}
                      className="rounded-md border border-zinc-500/70 px-2 py-1 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700/40 disabled:opacity-50"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => void requestSessionSummary(session)}
                      disabled={loading || sessionSummaryLoading}
                      className="rounded-md border border-amber-300/60 px-2 py-1 text-xs font-medium text-amber-200 transition hover:bg-amber-400/10 disabled:opacity-50"
                    >
                      Summary
                    </button>

                    <button
                      type="button"
                      onClick={() => requestDeleteSession(session)}
                      disabled={loading}
                      className="rounded-md border border-red-400/60 px-2 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {pendingSessionDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Confirm Delete</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Delete workout session?</h3>
            <p className="mt-2 text-sm text-zinc-300">
              This will remove your <span className="font-semibold text-white">{pendingSessionDelete.split.toUpperCase()}</span>{" "}
              session on <span className="font-semibold text-white">{pendingSessionDelete.sessionDate}</span> and all sets in that session.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelDeleteSession}
                className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteSession()}
                className="rounded-md bg-gradient-to-r from-red-400 via-rose-400 to-orange-400 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:brightness-110"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingSetDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Confirm Delete</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Delete set?</h3>
            <p className="mt-2 text-sm text-zinc-300">
              This will remove <span className="font-semibold text-white">{pendingSetDelete.exerciseName}</span> set{" "}
              <span className="font-semibold text-white">{pendingSetDelete.setIdx + 1}</span> from this session.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelDeleteSingleSet}
                className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteSingleSet()}
                className="rounded-md bg-gradient-to-r from-red-400 via-rose-400 to-orange-400 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:brightness-110"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingSessionEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Edit Session Date</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Update workout date</h3>
            <p className="mt-2 text-sm text-zinc-300">
              Change only the date for this <span className="font-semibold text-white">{pendingSessionEdit.split.toUpperCase()}</span> session.
            </p>

            <div className="mt-4">
              <label htmlFor="edit-session-date" className="mb-1 block text-sm text-zinc-300">
                Session Date
              </label>
              <input
                id="edit-session-date"
                type="date"
                value={pendingSessionEdit.newDate}
                max={today}
                onChange={(e) =>
                  setPendingSessionEdit((prev) =>
                    prev
                      ? {
                          ...prev,
                          newDate: e.target.value,
                        }
                      : prev
                  )
                }
                className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2 text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelEditSessionDate}
                className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmEditSessionDate()}
                disabled={loading}
                className="rounded-md bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60"
              >
                Save Date
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingSessionSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Session Summary</p>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-xl font-semibold text-white">
                {pendingSessionSummary.split.toUpperCase()} · {formatLastSessionDate(pendingSessionSummary.sessionDate)}
              </h3>

              <div className="inline-flex rounded-lg border border-zinc-600 bg-zinc-950/80 p-1">
                {(["lb", "kg"] as Unit[]).map((unitOption) => (
                  <button
                    key={unitOption}
                    type="button"
                    onClick={() => setSummaryUnit(unitOption)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase transition ${
                      summaryUnit === unitOption
                        ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                        : "text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    {unitOption}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {sessionSummaryLoading ? (
                <p className="text-sm text-zinc-300">Loading summary...</p>
              ) : sessionSummaryItems.length === 0 ? (
                <p className="text-sm text-zinc-400">No sets found for this session.</p>
              ) : (
                sessionSummaryItems.map((item) => (
                  <div
                    key={item.exerciseId}
                    className="rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-zinc-100">{item.exerciseName}</p>
                        <p className="mt-1 text-xs text-zinc-300">
                          {item.metricType === "WEIGHTED_REPS"
                            ? `${item.sets} set${item.sets === 1 ? "" : "s"} · ${item.totalReps} total reps`
                            : `${item.sets} set${item.sets === 1 ? "" : "s"} · ${item.totalDurationSeconds}s total duration`}
                        </p>
                      </div>

                      {item.metricType === "WEIGHTED_REPS" && (
                        <div className="rounded-lg border border-amber-300/50 bg-gradient-to-r from-amber-400/20 via-orange-400/20 to-red-400/20 px-3 py-2 text-right">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/90">Best Weight</p>
                          <p className="mt-0.5 text-sm font-bold text-amber-100">
                            {formatSummaryWeight(item.maxWeight, item.unit)}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-2 space-y-1">
                      {item.setDetails.map((setDetail) => (
                        <p key={`${item.exerciseId}-${setDetail.setNumber}`} className="text-xs text-zinc-400">
                          {item.metricType === "WEIGHTED_REPS"
                            ? `Set ${setDetail.setNumber}: ${formatSummaryWeight(setDetail.weightInput, setDetail.unitInput ?? item.unit)} × ${setDetail.reps ?? "-"} reps`
                            : `Set ${setDetail.setNumber}: ${setDetail.durationSeconds ?? "-"}s`}
                        </p>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                onClick={closeSessionSummary}
                className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}