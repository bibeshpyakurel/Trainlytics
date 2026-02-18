export type CaloriesLog = {
  id: string | number;
  log_date: string;
  pre_workout_kcal: number | null;
  post_workout_kcal: number | null;
};

export type PendingOverwrite = {
  userId: string;
  logDate: string;
  preWorkoutKcal: number | null;
  postWorkoutKcal: number | null;
  replacePre?: boolean;
  replacePost?: boolean;
};

export type PendingDelete = {
  id: string | number;
  logDate: string;
};

export type PendingEdit = {
  id: string | number;
  originalLogDate: string;
  newLogDate: string;
  preWorkoutCalories: string;
  postWorkoutCalories: string;
};

export type ChartRange = "biweekly" | "1m" | "3m" | "6m" | "1y";

export type HistoryFilterMode = "single" | "range";
