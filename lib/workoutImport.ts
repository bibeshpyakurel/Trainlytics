import type { Unit } from "@/lib/convertWeight";
import type { Split } from "@/features/log/types";

/**
 * Parser for workouts written down as freeform notes.
 *
 * Supported line shapes (case-insensitive, `x` or `×`):
 *
 *   Headers      2026-03-03 push | Mar 3 - push | 3/3 legs | push
 *   Sets×reps    Bench 3x8 135      -> 3 sets, 8 reps, 135
 *   Bodyweight   Pull ups 3x8       -> 3 sets, 8 reps, no weight
 *   Weight×reps  Squat 225x5        -> 1 set, 5 reps, 225  (see WEIGHT_LIKE_THRESHOLD)
 *   Set list     Squat 225x5, 225x5 -> 2 sets
 *   Rep list     Bench 135 8,8,6    -> 3 sets at 135
 *   Duration     Plank 3x60s | Plank 60s
 *
 * Anything it cannot read is returned in `unparsedLines` rather than dropped, so
 * the review step can surface it instead of silently losing a workout.
 */

export type ParsedSet = {
  reps: number | null;
  weight: number | null;
  unit: Unit | null;
  durationSeconds: number | null;
};

export type ParsedExercise = {
  name: string;
  sets: ParsedSet[];
  lineNumber: number;
  rawLine: string;
};

export type ParsedSession = {
  /** ISO date, or null when the notes never named one. */
  date: string | null;
  split: Split | null;
  exercises: ParsedExercise[];
};

export type UnparsedLine = {
  lineNumber: number;
  rawLine: string;
  reason: string;
};

export type ParseNotesResult = {
  sessions: ParsedSession[];
  unparsedLines: UnparsedLine[];
};

/**
 * `12x5` is ambiguous: 12 sets of 5, or 12lb for 5 reps? Above this cutoff we read
 * the first number as a weight, since set counts that high are vanishingly rare.
 */
const WEIGHT_LIKE_THRESHOLD = 12;

const SPLITS: Split[] = ["push", "pull", "legs", "core"];

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function toUnit(raw: string | undefined): Unit | null {
  if (!raw) return null;
  return raw.toLowerCase().startsWith("k") ? "kg" : "lb";
}

function toSeconds(value: number, rawUnit: string): number {
  const unit = rawUnit.toLowerCase();
  if (unit === "m" || unit.startsWith("min")) return Math.round(value * 60);
  return Math.round(value);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Normalised key for matching a written name against the exercise catalog. */
export function normalizeExerciseKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function findSplit(text: string): Split | null {
  const lowered = text.toLowerCase();
  for (const split of SPLITS) {
    if (new RegExp(`\\b${split}\\b`).test(lowered)) return split;
  }
  return null;
}

/**
 * Reads a header line into a date and/or split. Returns null when the line does
 * not look like a header at all.
 */
export function parseHeaderLine(line: string, referenceYear: number): { date: string | null; split: Split | null } | null {
  const trimmed = line.trim().replace(/[–—]/g, "-");
  if (!trimmed) return null;

  const split = findSplit(trimmed);

  // 2026-03-03
  const iso = trimmed.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return { date: `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`, split };
  }

  // Mar 3 / March 3rd
  const named = trimmed.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (named) {
    const month = MONTHS[named[1].slice(0, 3).toLowerCase()];
    if (month) {
      return { date: `${referenceYear}-${pad(month)}-${pad(Number(named[2]))}`, split };
    }
  }

  // 3/3 or 3-3 (month/day), optionally with a year
  const numeric = trimmed.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) {
    const year = numeric[3]
      ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
      : referenceYear;
    return { date: `${year}-${pad(Number(numeric[1]))}-${pad(Number(numeric[2]))}`, split };
  }

  // A bare split name on its own line ("push").
  if (split && normalizeExerciseKey(trimmed) === split) {
    return { date: null, split };
  }

  return null;
}

type SetsParse = { name: string; sets: ParsedSet[] } | null;

function repeat(count: number, build: () => ParsedSet): ParsedSet[] {
  return Array.from({ length: Math.max(1, Math.min(count, 50)) }, build);
}

const UNIT = String.raw`(kgs?|lbs?)`;
const NUM = String.raw`(\d+(?:\.\d+)?)`;
const TIME_UNIT = String.raw`(s|secs?|seconds?|m|mins?|minutes?)`;

/** Tries each supported notation in priority order. */
export function parseExerciseLine(line: string): SetsParse {
  const text = line.trim().replace(/[×]/g, "x");
  if (!text) return null;

  // Plank 3x60s  — sets × duration
  const setsByDuration = text.match(new RegExp(String.raw`^(.+?)\s+(\d+)\s*x\s*${NUM}\s*${TIME_UNIT}\s*$`, "i"));
  if (setsByDuration) {
    const seconds = toSeconds(Number(setsByDuration[3]), setsByDuration[4]);
    return {
      name: setsByDuration[1].trim(),
      sets: repeat(Number(setsByDuration[2]), () => ({ reps: null, weight: null, unit: null, durationSeconds: seconds })),
    };
  }

  // Bench 3x8 135lb — sets × reps @ weight
  const setsRepsWeight = text.match(
    new RegExp(String.raw`^(.+?)\s+(\d+)\s*x\s*(\d+)\s*(?:@\s*)?${NUM}\s*${UNIT}?\s*$`, "i")
  );
  if (setsRepsWeight) {
    const reps = Number(setsRepsWeight[3]);
    const weight = Number(setsRepsWeight[4]);
    const unit = toUnit(setsRepsWeight[5]);
    return {
      name: setsRepsWeight[1].trim(),
      sets: repeat(Number(setsRepsWeight[2]), () => ({ reps, weight, unit, durationSeconds: null })),
    };
  }

  // Squat 225x5, 225x5, 205x5 — an explicit list of weight × reps
  const listPattern = new RegExp(
    String.raw`^(.+?)\s+(${NUM}\s*x\s*\d+\s*${UNIT}?(?:\s*,\s*${NUM}\s*x\s*\d+\s*${UNIT}?)+)\s*$`,
    "i"
  );
  const setList = text.match(listPattern);
  if (setList) {
    const sets: ParsedSet[] = [];
    for (const chunk of setList[2].split(",")) {
      const pair = chunk.trim().match(new RegExp(String.raw`^${NUM}\s*x\s*(\d+)\s*${UNIT}?$`, "i"));
      if (!pair) continue;
      sets.push({
        reps: Number(pair[2]),
        weight: Number(pair[1]),
        unit: toUnit(pair[3]),
        durationSeconds: null,
      });
    }
    if (sets.length > 0) return { name: setList[1].trim(), sets };
  }

  // Bench 135 8,8,6 — one weight, then a rep per set
  const repList = text.match(new RegExp(String.raw`^(.+?)\s+${NUM}\s*${UNIT}?\s+(\d+(?:\s*,\s*\d+)+)\s*$`, "i"));
  if (repList) {
    const weight = Number(repList[2]);
    const unit = toUnit(repList[3]);
    const sets = repList[4]
      .split(",")
      .map((rep) => Number(rep.trim()))
      .filter((rep) => Number.isFinite(rep))
      .map((reps) => ({ reps, weight, unit, durationSeconds: null }));
    if (sets.length > 0) return { name: repList[1].trim(), sets };
  }

  // Plank 60s — a single duration
  const singleDuration = text.match(new RegExp(String.raw`^(.+?)\s+${NUM}\s*${TIME_UNIT}\s*$`, "i"));
  if (singleDuration) {
    return {
      name: singleDuration[1].trim(),
      sets: [{ reps: null, weight: null, unit: null, durationSeconds: toSeconds(Number(singleDuration[2]), singleDuration[3]) }],
    };
  }

  // Pull ups 3x8 — bodyweight, or a lone weight × reps above the threshold
  const bare = text.match(new RegExp(String.raw`^(.+?)\s+${NUM}\s*x\s*(\d+)\s*$`, "i"));
  if (bare) {
    const first = Number(bare[2]);
    const second = Number(bare[3]);
    if (first > WEIGHT_LIKE_THRESHOLD) {
      return {
        name: bare[1].trim(),
        sets: [{ reps: second, weight: first, unit: null, durationSeconds: null }],
      };
    }
    return {
      name: bare[1].trim(),
      sets: repeat(first, () => ({ reps: second, weight: null, unit: null, durationSeconds: null })),
    };
  }

  return null;
}

export function parseWorkoutNotes(input: string, referenceYear = new Date().getFullYear()): ParseNotesResult {
  const sessions: ParsedSession[] = [];
  const unparsedLines: UnparsedLine[] = [];

  let current: ParsedSession | null = null;

  const lines = input.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index];
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();

    if (!trimmed) continue;
    // Bullet and checkbox prefixes are common in note apps.
    const line = trimmed.replace(/^[-*••]\s*/, "").replace(/^\[[ xX]?\]\s*/, "");
    if (!line) continue;

    const header = parseHeaderLine(line, referenceYear);
    const asExercise = parseExerciseLine(line);

    // A header wins only when the line isn't also readable as an exercise, so
    // "Row 3x10" is never mistaken for a March date.
    if (header && !asExercise) {
      current = { date: header.date, split: header.split, exercises: [] };
      sessions.push(current);
      continue;
    }

    if (asExercise) {
      if (!current) {
        current = { date: null, split: null, exercises: [] };
        sessions.push(current);
      }
      current.exercises.push({
        name: asExercise.name,
        sets: asExercise.sets,
        lineNumber,
        rawLine: trimmed,
      });
      continue;
    }

    unparsedLines.push({ lineNumber, rawLine: trimmed, reason: "Could not read sets or reps from this line" });
  }

  return { sessions: sessions.filter((session) => session.exercises.length > 0), unparsedLines };
}
