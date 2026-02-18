import type { Unit } from "@/lib/convertWeight";

export type BodyweightLog = {
  id: string | number;
  log_date: string;
  weight_input: number;
  unit_input: Unit;
  weight_kg: number;
};

export type PendingOverwrite = {
  userId: string;
  logDate: string;
  weightNum: number;
  inputUnit: Unit;
};

export type PendingDelete = {
  id: string | number;
  logDate: string;
};

export type PendingEdit = {
  id: string | number;
  originalLogDate: string;
  newLogDate: string;
  weight: string;
  unit: Unit;
};

export type ChartRange = "biweekly" | "1m" | "3m" | "6m" | "1y";

export type HistoryFilterMode = "single" | "range";
