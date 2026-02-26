import type { Unit } from "@/lib/convertWeight";
import type { BodyweightLog, PendingOverwrite } from "@/features/bodyweight/types";

type SaveDependencies = {
  getCurrentUserId: () => Promise<{ userId: string | null; error: string | null }>;
  bodyweightEntryExistsForDate: (
    userId: string,
    logDate: string
  ) => Promise<{ exists: boolean; error: string | null }>;
};

type PersistDependencies = {
  upsertBodyweightEntry: (payload: PendingOverwrite) => Promise<string | null>;
};

type DeleteDependencies = {
  deleteBodyweightLogForCurrentUser: (
    logId: string | number
  ) => Promise<{ deleted: boolean; error: string | null }>;
};

type EditDependencies = {
  updateBodyweightLogForCurrentUser: (
    logId: string | number,
    payload: { logDate: string; weightNum: number; inputUnit: Unit }
  ) => Promise<string | null>;
};

export async function evaluateSaveBodyweightRequest(
  deps: SaveDependencies,
  params: {
    today: string;
    date: string;
    weight: string;
    unit: Unit;
    logs: BodyweightLog[];
  }
):
  Promise<
    | { status: "error"; message: string }
    | { status: "confirm_overwrite"; payload: PendingOverwrite }
    | { status: "persist"; payload: PendingOverwrite }
  > {
  if (params.date > params.today) {
    return { status: "error", message: "Future log dates are not allowed." };
  }

  const { userId, error: userError } = await deps.getCurrentUserId();
  if (userError) {
    return { status: "error", message: userError };
  }

  if (!userId) {
    return { status: "error", message: "Not logged in." };
  }

  const weightNum = Number(params.weight);
  if (!Number.isFinite(weightNum) || weightNum <= 0) {
    return { status: "error", message: "Enter valid weight." };
  }

  const payload: PendingOverwrite = {
    userId,
    logDate: params.date,
    weightNum,
    inputUnit: params.unit,
  };

  const localHasEntryForDate = params.logs.some((log) => log.log_date === params.date);
  if (localHasEntryForDate) {
    return { status: "confirm_overwrite", payload };
  }

  const { exists: serverHasEntryForDate, error: dateCheckError } = await deps.bodyweightEntryExistsForDate(
    userId,
    params.date
  );
  if (dateCheckError) {
    return { status: "error", message: dateCheckError };
  }

  if (serverHasEntryForDate) {
    return { status: "confirm_overwrite", payload };
  }

  return { status: "persist", payload };
}

export async function persistBodyweightWorkflow(
  deps: PersistDependencies,
  payload: PendingOverwrite
): Promise<{ status: "saved" } | { status: "error"; message: string }> {
  const error = await deps.upsertBodyweightEntry(payload);
  if (error) {
    return { status: "error", message: error };
  }

  return { status: "saved" };
}

export async function deleteBodyweightWorkflow(
  deps: DeleteDependencies,
  logId: string | number
): Promise<{ status: "deleted" } | { status: "error"; message: string }> {
  const { error } = await deps.deleteBodyweightLogForCurrentUser(logId);
  if (error) {
    return { status: "error", message: error };
  }

  return { status: "deleted" };
}

export async function editBodyweightWorkflow(
  deps: EditDependencies,
  params: {
    today: string;
    logId: string | number;
    newLogDate: string;
    weight: string;
    unit: Unit;
  }
): Promise<{ status: "updated" } | { status: "error"; message: string }> {
  if (params.newLogDate > params.today) {
    return { status: "error", message: "Future log dates are not allowed." };
  }

  const weightNum = Number(params.weight);
  if (!Number.isFinite(weightNum) || weightNum <= 0) {
    return { status: "error", message: "Enter valid weight." };
  }

  const error = await deps.updateBodyweightLogForCurrentUser(params.logId, {
    logDate: params.newLogDate,
    weightNum,
    inputUnit: params.unit,
  });

  if (error) {
    return { status: "error", message: error };
  }

  return { status: "updated" };
}
