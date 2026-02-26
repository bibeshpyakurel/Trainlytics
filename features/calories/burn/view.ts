import { getLocalIsoDateDaysAgo } from "@/lib/localDate";
import type {
  BurnChartRange,
  BurnHistoryFilterMode,
  MetabolicActivityLog,
} from "@/features/calories/burn/types";
import { BURN_CHART_DAYS_BY_RANGE } from "@/features/calories/burn/utils";

type BurnChartPoint = {
  logDate: string;
  label: string;
  spent: number;
};

export function getBurnSummary(logs: MetabolicActivityLog[]) {
  const latestLog = logs[0] ?? null;
  const values = logs.map((log) => Number(log.estimated_kcal_spent));
  const avgSpent = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return { latestLog, avgSpent };
}

function buildFullChartData(logs: MetabolicActivityLog[]): BurnChartPoint[] {
  return [...logs]
    .sort((a, b) => a.log_date.localeCompare(b.log_date))
    .map((log) => {
      const date = new Date(`${log.log_date}T00:00:00`);
      return {
        logDate: log.log_date,
        label: date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        spent: Number(log.estimated_kcal_spent),
      };
    });
}

export function getBurnChartView(logs: MetabolicActivityLog[], chartRange: BurnChartRange) {
  const fullChartData = buildFullChartData(logs);
  const rangeDays = BURN_CHART_DAYS_BY_RANGE[chartRange];
  const rangeStartIso = getLocalIsoDateDaysAgo(rangeDays - 1);

  const chartData = fullChartData.filter((point) => point.logDate >= rangeStartIso);
  const chartValues = chartData.map((point) => point.spent);
  const maxValue = chartValues.length ? Math.max(...chartValues) : 0;
  const yMax = Math.max(100, Math.ceil((maxValue + 100) / 100) * 100);

  return { chartData, yMax, rangeStartIso };
}

export function getBurnHistoryView(
  logs: MetabolicActivityLog[],
  filterMode: BurnHistoryFilterMode,
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
