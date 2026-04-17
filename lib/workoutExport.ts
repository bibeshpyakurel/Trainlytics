import { supabase } from "@/lib/supabaseClient";
import { TABLES } from "@/lib/dbNames";
import { normalizeMuscleGroup } from "@/lib/exerciseManagement";
import type { Database } from "@/lib/supabaseTypes";
import type { Split } from "@/features/log/types";

type ExerciseRow = Pick<
  Database["public"]["Tables"]["exercises"]["Row"],
  "id" | "name" | "split" | "muscle_group" | "metric_type"
>;

type SessionRow = Pick<
  Database["public"]["Tables"]["workout_sessions"]["Row"],
  "id" | "session_date" | "split"
>;

type SetRow = Pick<
  Database["public"]["Tables"]["workout_sets"]["Row"],
  "session_id" | "exercise_id" | "set_number" | "reps" | "weight_input" | "unit_input" | "weight_kg" | "duration_seconds"
>;

export type WorkoutExportScope =
  | { level: "exercise"; exerciseId: string; label: string }
  | { level: "category"; split: Split; label: string }
  | { level: "muscle-group"; muscleGroup: string; label: string };

export type WorkoutExportRange =
  | { mode: "last-session" }
  | { mode: "date-range"; startDate: string; endDate: string }
  | { mode: "all" };

export type WorkoutExportFormat = "csv" | "xlsx" | "pdf";

export type WorkoutExportRow = {
  sessionDate: string;
  split: Split;
  exerciseName: string;
  muscleGroup: string;
  metricType: string;
  setNumber: number;
  reps: number | null;
  weightInput: number | null;
  unitInput: Database["public"]["Enums"]["unit_type"] | null;
  weightKg: number | null;
  durationSeconds: number | null;
};

type FlatExportRecord = Record<string, string | number>;

function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeFilePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workout-export";
}

function formatMetricType(metricType: string) {
  return metricType === "DURATION" ? "Duration" : "Weighted reps";
}

function toFlatRecords(rows: WorkoutExportRow[]): FlatExportRecord[] {
  return rows.map((row) => ({
    "Session Date": row.sessionDate,
    Category: row.split.toUpperCase(),
    Exercise: row.exerciseName,
    "Muscle Group": row.muscleGroup,
    Metric: formatMetricType(row.metricType),
    "Set Number": row.setNumber,
    Reps: row.reps ?? "",
    "Weight Input": row.weightInput ?? "",
    Unit: row.unitInput ?? "",
    "Weight (kg)": row.weightKg ?? "",
    "Duration (sec)": row.durationSeconds ?? "",
  }));
}

function escapeCsv(value: string | number) {
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildWorkoutExportCsv(rows: WorkoutExportRow[]) {
  const flatRows = toFlatRecords(rows);
  if (flatRows.length === 0) {
    return "Session Date,Category,Exercise,Muscle Group,Metric,Set Number,Reps,Weight Input,Unit,Weight (kg),Duration (sec)";
  }

  const headers = Object.keys(flatRows[0]);
  const lines = flatRows.map((row) => headers.map((header) => escapeCsv(row[header] ?? "")).join(","));
  return [headers.join(","), ...lines].join("\n");
}

export function getWorkoutExportFilename(scope: WorkoutExportScope, range: WorkoutExportRange, format: WorkoutExportFormat) {
  const scopePart = sanitizeFilePart(scope.label);
  const rangePart =
    range.mode === "last-session"
      ? "last-session"
      : range.mode === "all"
        ? "all-history"
        : `${range.startDate}-to-${range.endDate}`;

  return `trainlytics-${scopePart}-${rangePart}.${format}`;
}

export function formatWorkoutExportRangeLabel(range: WorkoutExportRange) {
  if (range.mode === "last-session") return "Most recent session";
  if (range.mode === "all") return "All workout history";
  return `${range.startDate} to ${range.endDate}`;
}

export async function loadWorkoutExportRows(
  userId: string,
  scope: WorkoutExportScope,
  range: WorkoutExportRange
): Promise<{ ok: false; message: string } | { ok: true; rows: WorkoutExportRow[] }> {
  if (range.mode === "date-range") {
    if (!isValidIsoDate(range.startDate) || !isValidIsoDate(range.endDate)) {
      return { ok: false as const, message: "Choose a valid start and end date." };
    }
    if (range.startDate > range.endDate) {
      return { ok: false as const, message: "Start date must be before end date." };
    }
  }

  const { data: exercises, error: exerciseError } = await supabase
    .from(TABLES.exercises)
    .select("id,name,split,muscle_group,metric_type")
    .eq("user_id", userId);

  if (exerciseError) {
    return { ok: false as const, message: exerciseError.message };
  }

  const exerciseRows = (exercises ?? []) as ExerciseRow[];
  const relevantExercises = exerciseRows.filter((exercise) => {
    if (scope.level === "exercise") {
      return exercise.id === scope.exerciseId;
    }
    if (scope.level === "category") {
      return exercise.split === scope.split;
    }
    return normalizeMuscleGroup(exercise.muscle_group) === normalizeMuscleGroup(scope.muscleGroup);
  });

  if (relevantExercises.length === 0) {
    return { ok: true as const, rows: [] as WorkoutExportRow[] };
  }

  const relevantExerciseIds = relevantExercises.map((exercise) => exercise.id);
  const exerciseById = new Map(relevantExercises.map((exercise) => [exercise.id, exercise]));

  let sessionQuery = supabase
    .from(TABLES.workoutSessions)
    .select("id,session_date,split")
    .eq("user_id", userId)
    .order("session_date", { ascending: true });

  if (scope.level === "category") {
    sessionQuery = sessionQuery.eq("split", scope.split);
  }

  if (range.mode === "date-range") {
    sessionQuery = sessionQuery.gte("session_date", range.startDate).lte("session_date", range.endDate);
  }

  const { data: sessions, error: sessionError } = await sessionQuery;
  if (sessionError) {
    return { ok: false as const, message: sessionError.message };
  }

  const sessionRows = (sessions ?? []) as SessionRow[];
  if (sessionRows.length === 0) {
    return { ok: true as const, rows: [] as WorkoutExportRow[] };
  }

  const sessionIds = sessionRows.map((session) => session.id);
  const { data: sets, error: setError } = await supabase
    .from(TABLES.workoutSets)
    .select("session_id,exercise_id,set_number,reps,weight_input,unit_input,weight_kg,duration_seconds")
    .eq("user_id", userId)
    .in("session_id", sessionIds)
    .in("exercise_id", relevantExerciseIds)
    .order("session_id", { ascending: true })
    .order("set_number", { ascending: true });

  if (setError) {
    return { ok: false as const, message: setError.message };
  }

  const sessionById = new Map(sessionRows.map((session) => [session.id, session]));
  let rows: WorkoutExportRow[] = [];

  for (const setRow of (sets ?? []) as SetRow[]) {
    const session = sessionById.get(setRow.session_id);
    const exercise = exerciseById.get(setRow.exercise_id);
    if (!session || !exercise) {
      continue;
    }

    rows.push({
      sessionDate: session.session_date,
      split: session.split,
      exerciseName: exercise.name,
      muscleGroup: exercise.muscle_group,
      metricType: exercise.metric_type,
      setNumber: setRow.set_number,
      reps: setRow.reps,
      weightInput: setRow.weight_input,
      unitInput: setRow.unit_input,
      weightKg: setRow.weight_kg,
      durationSeconds: setRow.duration_seconds,
    });
  }

  if (range.mode === "last-session" && rows.length > 0) {
    const latestDate = rows.reduce((latest, row) => (row.sessionDate > latest ? row.sessionDate : latest), rows[0].sessionDate);
    rows = rows.filter((row) => row.sessionDate === latestDate);
  }

  rows.sort((a, b) => {
    const dateDiff = a.sessionDate.localeCompare(b.sessionDate);
    if (dateDiff !== 0) return dateDiff;
    const splitDiff = a.split.localeCompare(b.split);
    if (splitDiff !== 0) return splitDiff;
    const exerciseDiff = a.exerciseName.localeCompare(b.exerciseName);
    if (exerciseDiff !== 0) return exerciseDiff;
    return a.setNumber - b.setNumber;
  });

  return { ok: true as const, rows };
}

export async function downloadWorkoutExport(
  rows: WorkoutExportRow[],
  options: {
    scope: WorkoutExportScope;
    range: WorkoutExportRange;
    format: WorkoutExportFormat;
  }
) {
  const filename = getWorkoutExportFilename(options.scope, options.range, options.format);

  if (options.format === "csv") {
    const blob = new Blob([buildWorkoutExportCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  if (options.format === "xlsx") {
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet(toFlatRecords(rows));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Workout Export");
    XLSX.writeFile(workbook, filename);
    return;
  }

  const { jsPDF } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text(`Workout Export: ${options.scope.label}`, 14, 18);
  doc.setFontSize(11);
  doc.text(`Range: ${formatWorkoutExportRangeLabel(options.range)}`, 14, 26);
  autoTable(doc, {
    startY: 32,
    head: [["Session Date", "Category", "Exercise", "Muscle Group", "Metric", "Set", "Reps", "Weight", "Unit", "Weight (kg)", "Duration (sec)"]],
    body: rows.map((row) => [
      row.sessionDate,
      row.split.toUpperCase(),
      row.exerciseName,
      row.muscleGroup,
      formatMetricType(row.metricType),
      row.setNumber,
      row.reps ?? "",
      row.weightInput ?? "",
      row.unitInput ?? "",
      row.weightKg ?? "",
      row.durationSeconds ?? "",
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [24, 24, 27] },
  });
  doc.save(filename);
}