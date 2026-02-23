import { describe, expect, it, vi } from "vitest";
import type { Split } from "@/features/log/types";
import { checkSessionDateCollision, buildSessionSummaryItems, persistWorkoutSetsAtomic } from "@/features/log/workflows";

describe("persistWorkoutSetsAtomic", () => {
  it("uses RPC atomic save path and returns RPC set_count", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { set_count: 4 }, error: null });
    const result = await persistWorkoutSetsAtomic(
      { rpc },
      {
        sessionDate: "2026-02-20",
        split: "push",
        rows: [
          {
            exercise_id: "e1",
            set_number: 1,
            reps: 10,
            weight_input: 100,
            unit_input: "lb",
            weight_kg: 45.35,
            duration_seconds: null,
          },
        ],
      }
    );

    expect(rpc).toHaveBeenCalledWith("save_workout_sets_atomic", {
      p_session_date: "2026-02-20",
      p_split: "push",
      p_rows: expect.any(Array),
    });
    expect(result).toEqual({ ok: true, setCount: 4 });
  });

  it("returns error message when RPC fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "rpc failed" } });
    const result = await persistWorkoutSetsAtomic(
      { rpc },
      { sessionDate: "2026-02-20", split: "push", rows: [] }
    );

    expect(result).toEqual({ ok: false, message: "rpc failed" });
  });
});

describe("buildSessionSummaryItems", () => {
  it("normalizes mixed units for max weight and sorts set details", () => {
    const items = buildSessionSummaryItems(
      [
        {
          exercise_id: "bench",
          set_number: 2,
          reps: 8,
          weight_input: 100,
          unit_input: "lb",
          duration_seconds: null,
        },
        {
          exercise_id: "bench",
          set_number: 1,
          reps: 6,
          weight_input: 50,
          unit_input: "kg",
          duration_seconds: null,
        },
      ],
      [{ id: "bench", name: "Bench Press", metric_type: "WEIGHTED_REPS" }],
      "push"
    );

    expect(items).toHaveLength(1);
    expect(items[0].maxWeight).toBe(50);
    expect(items[0].totalReps).toBe(14);
    expect(items[0].setDetails.map((d) => d.setNumber)).toEqual([1, 2]);
  });
});

describe("checkSessionDateCollision", () => {
  function buildCollisionClient(rows: Array<{ id: string }> | null, message: string | null) {
    const limit = vi.fn().mockResolvedValue({
      data: rows,
      error: message ? { message } : null,
    });
    const neq = vi.fn().mockReturnValue({ limit });
    const eq3 = vi.fn().mockReturnValue({ neq });
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });
    return { from };
  }

  it("detects collisions for same user/split/date", async () => {
    const client = buildCollisionClient([{ id: "s-existing" }], null);
    const result = await checkSessionDateCollision(client, {
      userId: "u1",
      split: "push" as Split,
      newDate: "2026-02-21",
      excludeSessionId: "s-current",
    });

    expect(result).toEqual({ ok: true, exists: true });
  });

  it("returns non-collision when no rows found", async () => {
    const client = buildCollisionClient([], null);
    const result = await checkSessionDateCollision(client, {
      userId: "u1",
      split: "push" as Split,
      newDate: "2026-02-21",
      excludeSessionId: "s-current",
    });

    expect(result).toEqual({ ok: true, exists: false });
  });

  it("returns lookup errors", async () => {
    const client = buildCollisionClient(null, "db down");
    const result = await checkSessionDateCollision(client, {
      userId: "u1",
      split: "push" as Split,
      newDate: "2026-02-21",
      excludeSessionId: "s-current",
    });

    expect(result).toEqual({ ok: false, message: "db down" });
  });
});
