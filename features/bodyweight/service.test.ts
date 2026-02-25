import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import {
  bodyweightEntryExistsForDate,
  deleteBodyweightLogForCurrentUser,
  getCurrentUserId,
  loadBodyweightLogsForCurrentUser,
  updateBodyweightLogForCurrentUser,
  upsertBodyweightEntry,
} from "@/features/bodyweight/service";

vi.mock("@/lib/authSession", () => ({
  getCurrentUserIdFromSession: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { getCurrentUserIdFromSession } from "@/lib/authSession";
import { supabase } from "@/lib/supabaseClient";

describe("bodyweight service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards getCurrentUserId from auth session helper", async () => {
    (getCurrentUserIdFromSession as Mock).mockResolvedValue({ userId: "u1", error: null });
    await expect(getCurrentUserId()).resolves.toEqual({ userId: "u1", error: null });
  });

  it("loadBodyweightLogsForCurrentUser handles auth error and unauthenticated", async () => {
    (getCurrentUserIdFromSession as Mock).mockResolvedValueOnce({ userId: null, error: "auth boom" });
    await expect(loadBodyweightLogsForCurrentUser()).resolves.toEqual({ logs: [], error: "auth boom" });

    (getCurrentUserIdFromSession as Mock).mockResolvedValueOnce({ userId: null, error: null });
    await expect(loadBodyweightLogsForCurrentUser()).resolves.toEqual({ logs: [], error: null });
  });

  it("loadBodyweightLogsForCurrentUser returns sorted query results", async () => {
    (getCurrentUserIdFromSession as Mock).mockResolvedValue({ userId: "u1", error: null });

    const order = vi.fn().mockResolvedValue({
      data: [{ id: "r1", log_date: "2026-02-23", weight_input: 180, unit_input: "lb", weight_kg: 81.65 }],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    (supabase.from as Mock).mockReturnValue({ select });

    const result = await loadBodyweightLogsForCurrentUser();
    expect(result.error).toBeNull();
    expect(result.logs).toHaveLength(1);
    expect(order).toHaveBeenCalledWith("log_date", { ascending: false });
  });

  it("upsertBodyweightEntry sends upsert with conflict key", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    (supabase.from as Mock).mockReturnValue({ upsert });

    const error = await upsertBodyweightEntry({
      userId: "u1",
      logDate: "2026-02-23",
      weightNum: 180,
      inputUnit: "lb",
    });

    expect(error).toBeNull();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        log_date: "2026-02-23",
        weight_input: 180,
        unit_input: "lb",
      }),
      { onConflict: "user_id,log_date" }
    );
  });

  it("bodyweightEntryExistsForDate returns exists and error states", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: "r1" }], error: null });
    const eqDate = vi.fn().mockReturnValue({ limit });
    const eqUser = vi.fn().mockReturnValue({ eq: eqDate });
    const select = vi.fn().mockReturnValue({ eq: eqUser });
    (supabase.from as Mock).mockReturnValue({ select });

    await expect(bodyweightEntryExistsForDate("u1", "2026-02-23")).resolves.toEqual({
      exists: true,
      error: null,
    });

    limit.mockResolvedValueOnce({ data: null, error: { message: "query failed" } });
    await expect(bodyweightEntryExistsForDate("u1", "2026-02-23")).resolves.toEqual({
      exists: false,
      error: "query failed",
    });
  });

  it("deleteBodyweightLogForCurrentUser handles auth and delete outcomes", async () => {
    (getCurrentUserIdFromSession as Mock).mockResolvedValueOnce({ userId: null, error: "auth failed" });
    await expect(deleteBodyweightLogForCurrentUser("row-1")).resolves.toEqual({
      deleted: false,
      error: "auth failed",
    });

    (getCurrentUserIdFromSession as Mock).mockResolvedValueOnce({ userId: null, error: null });
    await expect(deleteBodyweightLogForCurrentUser("row-1")).resolves.toEqual({
      deleted: false,
      error: "Not logged in.",
    });

    (getCurrentUserIdFromSession as Mock).mockResolvedValueOnce({ userId: "u1", error: null });
    const eqUser = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqUser });
    const del = vi.fn().mockReturnValue({ eq: eqId });
    (supabase.from as Mock).mockReturnValue({ delete: del });
    await expect(deleteBodyweightLogForCurrentUser("row-1")).resolves.toEqual({
      deleted: true,
      error: null,
    });
  });

  it("updateBodyweightLogForCurrentUser handles auth and update outcomes", async () => {
    (getCurrentUserIdFromSession as Mock).mockResolvedValueOnce({ userId: null, error: "auth failed" });
    await expect(
      updateBodyweightLogForCurrentUser("row-1", { logDate: "2026-02-23", weightNum: 180, inputUnit: "lb" })
    ).resolves.toBe("auth failed");

    (getCurrentUserIdFromSession as Mock).mockResolvedValueOnce({ userId: null, error: null });
    await expect(
      updateBodyweightLogForCurrentUser("row-1", { logDate: "2026-02-23", weightNum: 180, inputUnit: "lb" })
    ).resolves.toBe("Not logged in.");

    (getCurrentUserIdFromSession as Mock).mockResolvedValueOnce({ userId: "u1", error: null });
    const eqUser = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqUser });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    (supabase.from as Mock).mockReturnValue({ update });

    await expect(
      updateBodyweightLogForCurrentUser("row-1", { logDate: "2026-02-23", weightNum: 180, inputUnit: "lb" })
    ).resolves.toBeNull();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        log_date: "2026-02-23",
        weight_input: 180,
        unit_input: "lb",
      })
    );
  });
});
