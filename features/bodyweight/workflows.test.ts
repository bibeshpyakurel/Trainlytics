import { describe, expect, it, vi } from "vitest";
import type { BodyweightLog } from "@/features/bodyweight/types";
import {
  deleteBodyweightWorkflow,
  editBodyweightWorkflow,
  evaluateSaveBodyweightRequest,
  persistBodyweightWorkflow,
} from "@/features/bodyweight/workflows";

const baseLogs: BodyweightLog[] = [
  { id: "1", log_date: "2026-02-20", weight_input: 180, unit_input: "lb", weight_kg: 81.65 },
];

describe("evaluateSaveBodyweightRequest", () => {
  it("returns auth error", async () => {
    const result = await evaluateSaveBodyweightRequest(
      {
        getCurrentUserId: vi.fn().mockResolvedValue({ userId: null, error: "auth failed" }),
        bodyweightEntryExistsForDate: vi.fn(),
      },
      {
        today: "2026-02-23",
        date: "2026-02-23",
        weight: "180",
        unit: "lb",
        logs: [],
      }
    );

    expect(result).toEqual({ status: "error", message: "auth failed" });
  });

  it("prompts overwrite from stale-server check even when local logs are empty", async () => {
    const result = await evaluateSaveBodyweightRequest(
      {
        getCurrentUserId: vi.fn().mockResolvedValue({ userId: "u1", error: null }),
        bodyweightEntryExistsForDate: vi.fn().mockResolvedValue({ exists: true, error: null }),
      },
      {
        today: "2026-02-23",
        date: "2026-02-23",
        weight: "180",
        unit: "lb",
        logs: [],
      }
    );

    expect(result.status).toBe("confirm_overwrite");
  });

  it("returns persist payload when valid and no collision", async () => {
    const result = await evaluateSaveBodyweightRequest(
      {
        getCurrentUserId: vi.fn().mockResolvedValue({ userId: "u1", error: null }),
        bodyweightEntryExistsForDate: vi.fn().mockResolvedValue({ exists: false, error: null }),
      },
      {
        today: "2026-02-23",
        date: "2026-02-22",
        weight: "180.5",
        unit: "lb",
        logs: baseLogs,
      }
    );

    expect(result).toEqual({
      status: "persist",
      payload: {
        userId: "u1",
        logDate: "2026-02-22",
        weightNum: 180.5,
        inputUnit: "lb",
      },
    });
  });
});

describe("persistBodyweightWorkflow", () => {
  it("returns save error", async () => {
    const result = await persistBodyweightWorkflow(
      { upsertBodyweightEntry: vi.fn().mockResolvedValue("write failed") },
      { userId: "u1", logDate: "2026-02-23", weightNum: 180, inputUnit: "lb" }
    );

    expect(result).toEqual({ status: "error", message: "write failed" });
  });
});

describe("deleteBodyweightWorkflow", () => {
  it("returns deleted on success", async () => {
    const result = await deleteBodyweightWorkflow(
      {
        deleteBodyweightLogForCurrentUser: vi.fn().mockResolvedValue({ deleted: true, error: null }),
      },
      "row-1"
    );

    expect(result).toEqual({ status: "deleted" });
  });
});

describe("editBodyweightWorkflow", () => {
  it("rejects future date and invalid weight before service call", async () => {
    const updateMock = vi.fn();
    const future = await editBodyweightWorkflow(
      { updateBodyweightLogForCurrentUser: updateMock },
      { today: "2026-02-23", logId: "row-1", newLogDate: "2026-02-24", weight: "180", unit: "lb" }
    );
    const invalid = await editBodyweightWorkflow(
      { updateBodyweightLogForCurrentUser: updateMock },
      { today: "2026-02-23", logId: "row-1", newLogDate: "2026-02-23", weight: "abc", unit: "lb" }
    );

    expect(future).toEqual({ status: "error", message: "Future log dates are not allowed." });
    expect(invalid).toEqual({ status: "error", message: "Enter valid weight." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns updated on successful service mutation", async () => {
    const result = await editBodyweightWorkflow(
      { updateBodyweightLogForCurrentUser: vi.fn().mockResolvedValue(null) },
      { today: "2026-02-23", logId: "row-1", newLogDate: "2026-02-23", weight: "180", unit: "lb" }
    );

    expect(result).toEqual({ status: "updated" });
  });
});
