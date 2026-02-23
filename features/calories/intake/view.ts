import type { CaloriesLog, ChartRange, HistoryFilterMode } from "@/features/calories/intake/types";
import { CHART_DAYS_BY_RANGE, getTotalCalories } from "@/features/calories/intake/utils";
import { getLocalIsoDateDaysAgo } from "@/lib/localDate";

type CaloriesChartPoint = {
  logDate: string;
  label: string;
  preWorkout: number;
  postWorkout: number;
  total: number;
};

export function getCaloriesSummary(logs: CaloriesLog[]) {
  const latestLog = logs[0] ?? null;

  const totals = logs.map((log) => getTotalCalories(log.pre_workout_kcal, log.post_workout_kcal));
  const preValues = logs.map((log) => log.pre_workout_kcal ?? 0);
  const postValues = logs.map((log) => log.post_workout_kcal ?? 0);

  const avgTotal = totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : null;
  const avgPre = preValues.length ? preValues.reduce((sum, value) => sum + value, 0) / preValues.length : null;
  const avgPost = postValues.length ? postValues.reduce((sum, value) => sum + value, 0) / postValues.length : null;

  return { latestLog, avgTotal, avgPre, avgPost };
}

function buildFullChartData(logs: CaloriesLog[]): CaloriesChartPoint[] {
  return [...logs]
    .sort((a, b) => a.log_date.localeCompare(b.log_date))
    .map((log) => {
      const date = new Date(`${log.log_date}T00:00:00`);
      const preWorkout = log.pre_workout_kcal ?? 0;
      const postWorkout = log.post_workout_kcal ?? 0;
      return {
        logDate: log.log_date,
        label: date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        preWorkout,
        postWorkout,
        total: preWorkout + postWorkout,
      };
    });
}

export function getCaloriesChartView(logs: CaloriesLog[], chartRange: ChartRange) {
  const fullChartData = buildFullChartData(logs);
  const rangeDays = CHART_DAYS_BY_RANGE[chartRange];
  const rangeStartIso = getLocalIsoDateDaysAgo(rangeDays - 1);

  const chartData = fullChartData.filter((point) => point.logDate >= rangeStartIso);
  const chartTotals = chartData.map((point) => point.total);
  const maxTotal = chartTotals.length ? Math.max(...chartTotals) : 0;
  const yMax = Math.max(100, Math.ceil((maxTotal + 100) / 100) * 100);

  return { chartData, yMax, rangeStartIso };
}

export function getCaloriesHistoryView(
  logs: CaloriesLog[],
  filterMode: HistoryFilterMode,
  singleDate: string,
  startDate: string,
  endDate: string,
  visibleHistoryCount: number
) {
  const historyLogs = logs.filter((log) => {
    if (filterMode === "single") {
      return log.log_date === singleDate;
    }

    const startsAfterMin = startDate ? log.log_date >= startDate : true;
    const endsBeforeMax = endDate ? log.log_date <= endDate : true;
    return startsAfterMin && endsBeforeMax;
  });

  const cappedHistoryLogs = historyLogs.slice(0, 20);
  const visibleLogs = cappedHistoryLogs.slice(0, visibleHistoryCount);
  const hasMoreHistory = cappedHistoryLogs.length > visibleHistoryCount;
  const canShowLessHistory = visibleHistoryCount > 5;
  const hasActiveHistoryFilter =
    filterMode === "single" || startDate.length > 0 || endDate.length > 0;

  return {
    visibleLogs,
    hasMoreHistory,
    canShowLessHistory,
    hasActiveHistoryFilter,
  };
}
