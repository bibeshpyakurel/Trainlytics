import type { Unit } from "@/lib/convertWeight";
import type { BodyweightLog, ChartRange, HistoryFilterMode } from "@/features/bodyweight/types";
import { CHART_DAYS_BY_RANGE, formatWeightFromKg } from "@/features/bodyweight/utils";
import { getLocalIsoDateDaysAgo } from "@/lib/localDate";

type ChartPoint = {
  logDate: string;
  label: string;
  weight: number;
};

export function getBodyweightSummary(logs: BodyweightLog[], displayUnit: Unit) {
  const latestLog = logs[0] ?? null;
  const avgKg = logs.length
    ? (logs.reduce((sum, entry) => sum + Number(entry.weight_kg || 0), 0) / logs.length).toFixed(1)
    : null;
  const avgDisplay = avgKg ? formatWeightFromKg(Number(avgKg), displayUnit) : null;

  return { latestLog, avgDisplay };
}

function buildFullChartData(logs: BodyweightLog[], displayUnit: Unit): ChartPoint[] {
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
        weight: Number(formatWeightFromKg(Number(log.weight_kg || 0), displayUnit)),
      };
    });
}

export function getBodyweightChartView(
  logs: BodyweightLog[],
  displayUnit: Unit,
  chartRange: ChartRange
) {
  const fullChartData = buildFullChartData(logs, displayUnit);
  const rangeDays = CHART_DAYS_BY_RANGE[chartRange];
  const rangeStartIso = getLocalIsoDateDaysAgo(rangeDays - 1);

  const chartData = fullChartData.filter((point) => point.logDate >= rangeStartIso);
  const chartWeights = chartData.map((d) => d.weight);
  const minWeight = chartWeights.length ? Math.min(...chartWeights) : 0;
  const maxWeight = chartWeights.length ? Math.max(...chartWeights) : 0;
  const minSpan = displayUnit === "kg" ? 1 : 2;
  const basePadding = displayUnit === "kg" ? 0.6 : 1.2;
  const tickStep = displayUnit === "kg" ? 1 : 2;
  const span = Math.max(maxWeight - minWeight, minSpan);
  const yMinRaw = minWeight - basePadding - (span === minSpan ? minSpan / 2 : 0);
  const yMaxRaw = maxWeight + basePadding + (span === minSpan ? minSpan / 2 : 0);
  const yMin = Math.floor(yMinRaw / tickStep) * tickStep;
  const yMax = Math.ceil(yMaxRaw / tickStep) * tickStep;
  const yTicks = Array.from(
    { length: Math.floor((yMax - yMin) / tickStep) + 1 },
    (_, index) => Number((yMin + index * tickStep).toFixed(1))
  );

  return { chartData, yMin, yMax, yTicks, rangeStartIso };
}

export function getBodyweightHistoryView(
  logs: BodyweightLog[],
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
