export type MetabolicActivityLog = {
  id: string | number;
  log_date: string;
  estimated_kcal_spent: number;
  source: string | null;
};

export type PendingBurnOverwrite = {
  userId: string;
  logDate: string;
  estimatedKcalSpent: number;
  source: string | null;
};

export type PendingBurnDelete = {
  id: string | number;
  logDate: string;
};

export type PendingBurnEdit = {
  id: string | number;
  originalLogDate: string;
  newLogDate: string;
  estimatedKcalSpent: string;
  source: string;
};

export type BurnChartRange = "biweekly" | "1m" | "3m" | "6m" | "1y";

export type BurnHistoryFilterMode = "single" | "range";
