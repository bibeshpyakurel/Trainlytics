import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { getBurnLogForDate } from "@/features/calories/burn/service";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabaseClient";

function mockBurnDateLookup(
  row:
    | {
        id: string | number;
        log_date: string;
        estimated_kcal_spent: number;
        source: string | null;
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

describe("getBurnLogForDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matching same-day burn log", async () => {
    mockBurnDateLookup(
      {
        id: "row-1",
        log_date: "2026-02-23",
        estimated_kcal_spent: 2400,
        source: "Apple Watch",
      },
      null
    );

    const result = await getBurnLogForDate("u1", "2026-02-23");

    expect(result.error).toBeNull();
    expect(result.log).toEqual({
      id: "row-1",
      log_date: "2026-02-23",
      estimated_kcal_spent: 2400,
      source: "Apple Watch",
    });
  });

  it("returns null log when none exists", async () => {
    mockBurnDateLookup(null, null);
    await expect(getBurnLogForDate("u1", "2026-02-23")).resolves.toEqual({
      log: null,
      error: null,
    });
  });

  it("returns query errors", async () => {
    mockBurnDateLookup(null, "lookup failed");
    await expect(getBurnLogForDate("u1", "2026-02-23")).resolves.toEqual({
      log: null,
      error: "lookup failed",
    });
  });
});
