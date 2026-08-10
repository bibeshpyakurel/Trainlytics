import { describe, expect, it } from "vitest";
import {
  normalizeExerciseKey,
  parseExerciseLine,
  parseHeaderLine,
  parseWorkoutNotes,
} from "@/lib/workoutImport";

describe("parseExerciseLine", () => {
  it("reads sets x reps with a weight", () => {
    const result = parseExerciseLine("Bench 3x8 135");
    expect(result?.name).toBe("Bench");
    expect(result?.sets).toHaveLength(3);
    expect(result?.sets[0]).toEqual({ reps: 8, weight: 135, unit: null, durationSeconds: null });
  });

  it("reads an explicit unit and the @ separator", () => {
    const result = parseExerciseLine("Incline DB Press 3x10 @ 50lb");
    expect(result?.name).toBe("Incline DB Press");
    expect(result?.sets[0]?.unit).toBe("lb");
    expect(result?.sets[0]?.weight).toBe(50);

    expect(parseExerciseLine("Squat 5x5 100kg")?.sets[0]?.unit).toBe("kg");
  });

  it("treats a low first number as a set count and a high one as a weight", () => {
    const bodyweight = parseExerciseLine("Pull ups 3x8");
    expect(bodyweight?.sets).toHaveLength(3);
    expect(bodyweight?.sets[0]).toEqual({ reps: 8, weight: null, unit: null, durationSeconds: null });

    const weighted = parseExerciseLine("Squat 225x5");
    expect(weighted?.sets).toHaveLength(1);
    expect(weighted?.sets[0]).toEqual({ reps: 5, weight: 225, unit: null, durationSeconds: null });
  });

  it("reads a comma separated list of weight x reps", () => {
    const result = parseExerciseLine("Squat 225x5, 225x5, 205x8");
    expect(result?.name).toBe("Squat");
    expect(result?.sets).toEqual([
      { reps: 5, weight: 225, unit: null, durationSeconds: null },
      { reps: 5, weight: 225, unit: null, durationSeconds: null },
      { reps: 8, weight: 205, unit: null, durationSeconds: null },
    ]);
  });

  it("reads one weight followed by a rep per set", () => {
    const result = parseExerciseLine("Bench 135 8,8,6");
    expect(result?.name).toBe("Bench");
    expect(result?.sets.map((set) => set.reps)).toEqual([8, 8, 6]);
    expect(result?.sets.every((set) => set.weight === 135)).toBe(true);
  });

  it("reads durations in seconds and minutes", () => {
    const threeByMinute = parseExerciseLine("Plank 3x60s");
    expect(threeByMinute?.sets).toHaveLength(3);
    expect(threeByMinute?.sets[0]?.durationSeconds).toBe(60);
    expect(threeByMinute?.sets[0]?.reps).toBeNull();

    expect(parseExerciseLine("Plank 90s")?.sets[0]?.durationSeconds).toBe(90);
    expect(parseExerciseLine("Bike 20min")?.sets[0]?.durationSeconds).toBe(1200);
  });

  it("returns null for lines with no set information", () => {
    expect(parseExerciseLine("felt strong today")).toBeNull();
    expect(parseExerciseLine("")).toBeNull();
  });
});

describe("parseHeaderLine", () => {
  it("reads ISO dates with a split", () => {
    expect(parseHeaderLine("2026-03-03 push", 2026)).toEqual({ date: "2026-03-03", split: "push" });
  });

  it("reads month names and numeric dates", () => {
    expect(parseHeaderLine("Mar 3 - push", 2026)).toEqual({ date: "2026-03-03", split: "push" });
    expect(parseHeaderLine("March 3rd", 2026)).toEqual({ date: "2026-03-03", split: null });
    expect(parseHeaderLine("3/3 legs", 2026)).toEqual({ date: "2026-03-03", split: "legs" });
    expect(parseHeaderLine("3/3/25 legs", 2026)).toEqual({ date: "2025-03-03", split: "legs" });
  });

  it("reads a bare split name", () => {
    expect(parseHeaderLine("push", 2026)).toEqual({ date: null, split: "push" });
  });

  it("returns null for lines that are not headers", () => {
    expect(parseHeaderLine("Bench press", 2026)).toBeNull();
  });
});

describe("parseWorkoutNotes", () => {
  it("groups exercises under the preceding header", () => {
    const result = parseWorkoutNotes(
      ["Mar 3 - push", "Bench 3x8 135", "Lateral raise 4x12 20", "", "Mar 5 - pull", "Row 3x10 95"].join("\n"),
      2026
    );

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0]?.date).toBe("2026-03-03");
    expect(result.sessions[0]?.split).toBe("push");
    expect(result.sessions[0]?.exercises.map((e) => e.name)).toEqual(["Bench", "Lateral raise"]);
    expect(result.sessions[1]?.split).toBe("pull");
    expect(result.sessions[1]?.exercises).toHaveLength(1);
  });

  it("does not mistake an exercise line for a date header", () => {
    // "Row 3x10 95" could look like a 3/10 date; the exercise reading must win.
    const result = parseWorkoutNotes("Row 3x10 95", 2026);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.exercises[0]?.name).toBe("Row");
    expect(result.sessions[0]?.date).toBeNull();
  });

  it("keeps unreadable lines instead of dropping them", () => {
    const result = parseWorkoutNotes(["Mar 3 push", "Bench 3x8 135", "felt strong, shoulder tweaky"].join("\n"), 2026);
    expect(result.unparsedLines).toHaveLength(1);
    expect(result.unparsedLines[0]).toMatchObject({ lineNumber: 3, rawLine: "felt strong, shoulder tweaky" });
  });

  it("strips bullet and checkbox prefixes from note apps", () => {
    const result = parseWorkoutNotes(["- Bench 3x8 135", "* Squat 225x5", "[ ] Plank 60s"].join("\n"), 2026);
    expect(result.sessions[0]?.exercises.map((e) => e.name)).toEqual(["Bench", "Squat", "Plank"]);
  });

  it("starts an implicit session when notes have no header", () => {
    const result = parseWorkoutNotes("Bench 3x8 135", 2026);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.date).toBeNull();
    expect(result.sessions[0]?.split).toBeNull();
  });

  it("drops headers that have no exercises under them", () => {
    const result = parseWorkoutNotes(["Mar 3 - push", "", "Mar 5 - pull", "Row 3x10 95"].join("\n"), 2026);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.split).toBe("pull");
  });
});

describe("normalizeExerciseKey", () => {
  it("matches names that differ only by punctuation and case", () => {
    expect(normalizeExerciseKey("Incline DB Press")).toBe("incline db press");
    expect(normalizeExerciseKey("bench-press")).toBe(normalizeExerciseKey("Bench Press"));
    expect(normalizeExerciseKey("  Lat   Pulldown  ")).toBe("lat pulldown");
  });
});
