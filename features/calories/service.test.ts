import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { getCaloriesLogForDate } from "@/features/calories/service";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";

function mockCaloriesDateLookup(
  row:
    | {
        id: string | number;
        log_date: string;
        pre_workout_kcal: number | null;
        post_workout_kcal: number | null;
      }
    | null,
  errorMessage: string | null
) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: row,
    error: errorMessage ? { message: errorMessage } : null,
  });
  const eqDate = vi.fn().mockReturnValue({ maybeSingle });
  const eqUser = vi.fn().mockReturnValue({ eq: eqDate });
  const select = vi.fn().mockReturnValue({ eq: eqUser });
  (supabase.from as Mock).mockReturnValue({ select });
}

describe("getCaloriesLogForDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matching same-day log", async () => {
    mockCaloriesDateLookup(
      {
        id: "row-1",
        log_date: "2026-02-23",
        pre_workout_kcal: 300,
        post_workout_kcal: 600,
      },
      null
    );

    const result = await getCaloriesLogForDate("u1", "2026-02-23");

    expect(result.error).toBeNull();
    expect(result.log).toEqual({
      id: "row-1",
      log_date: "2026-02-23",
      pre_workout_kcal: 300,
      post_workout_kcal: 600,
    });
  });

  it("returns null log when none exists", async () => {
    mockCaloriesDateLookup(null, null);
    await expect(getCaloriesLogForDate("u1", "2026-02-23")).resolves.toEqual({
      log: null,
      error: null,
    });
  });

  it("returns query errors", async () => {
    mockCaloriesDateLookup(null, "lookup failed");
    await expect(getCaloriesLogForDate("u1", "2026-02-23")).resolves.toEqual({
      log: null,
      error: "lookup failed",
    });
  });
});
