import type {
  InsightAchievement,
  InsightCorrelation,
  InsightFact,
  InsightMetricPoint,
} from "@/lib/insightsTypes";
import { getLocalIsoDateDaysAgo } from "@/lib/localDate";

type BuildInsightsViewInput = {
  bodyweightSeries: InsightMetricPoint[];
  caloriesSeries: InsightMetricPoint[];
  strengthSeries: InsightMetricPoint[];
};

type BuildInsightsViewOptions = {
  rangeDays?: number | null;
  rangeLabel?: string;
};

function sortByDateAsc(series: InsightMetricPoint[]): InsightMetricPoint[] {
  return [...series].sort((a, b) => a.date.localeCompare(b.date));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = average(values);
  if (avg == null) return null;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function getSeriesSpanDays(series: InsightMetricPoint[]): number {
  if (series.length === 0) return 0;
  const sorted = sortByDateAsc(series);
  const first = new Date(`${sorted[0].date}T00:00:00`);
  const last = new Date(`${sorted[sorted.length - 1].date}T00:00:00`);
  first.setHours(0, 0, 0, 0);
  last.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

function toDateMap(series: InsightMetricPoint[]) {
  return new Map(series.map((point) => [point.date, point.value]));
}

function pearsonCorrelation(
  leftSeries: InsightMetricPoint[],
  rightSeries: InsightMetricPoint[]
): { value: number | null; overlapDays: number } {
  const leftByDate = toDateMap(leftSeries);
  const rightByDate = toDateMap(rightSeries);

  const overlap: Array<[number, number]> = [];
  for (const [date, leftValue] of leftByDate.entries()) {
    const rightValue = rightByDate.get(date);
    if (rightValue != null) {
      overlap.push([leftValue, rightValue]);
    }
  }

  if (overlap.length < 3) {
    return { value: null, overlapDays: overlap.length };
  }

  const leftValues = overlap.map(([value]) => value);
  const rightValues = overlap.map(([, value]) => value);

  const leftMean = average(leftValues);
  const rightMean = average(rightValues);
  if (leftMean == null || rightMean == null) {
    return { value: null, overlapDays: overlap.length };
  }

  let numerator = 0;
  let leftDenominator = 0;
  let rightDenominator = 0;

  for (let index = 0; index < overlap.length; index += 1) {
    const leftDelta = leftValues[index] - leftMean;
    const rightDelta = rightValues[index] - rightMean;

    numerator += leftDelta * rightDelta;
    leftDenominator += leftDelta ** 2;
    rightDenominator += rightDelta ** 2;
  }

  if (leftDenominator === 0 || rightDenominator === 0) {
    return { value: null, overlapDays: overlap.length };
  }

  return {
    value: numerator / Math.sqrt(leftDenominator * rightDenominator),
    overlapDays: overlap.length,
  };
}

function correlationInterpretation(value: number | null): string {
  if (value == null) return "Not enough overlapping days yet (need at least 3 overlapping days).";
  const magnitude = Math.abs(value);

  if (magnitude >= 0.7) {
    return value > 0 ? "Strong positive relationship" : "Strong inverse relationship";
  }
  if (magnitude >= 0.35) {
    return value > 0 ? "Moderate positive relationship" : "Moderate inverse relationship";
  }
  return "Weak relationship so far";
}

function getLastNDatesSet(days: number): Set<string> {
  const dates = new Set<string>();

  for (let index = 0; index < days; index += 1) {
    dates.add(getLocalIsoDateDaysAgo(index));
  }

  return dates;
}

function filterByDates(series: InsightMetricPoint[], dateSet: Set<string>) {
  return series.filter((point) => dateSet.has(point.date));
}

function findMaxPoint(series: InsightMetricPoint[]): InsightMetricPoint | null {
  if (series.length === 0) return null;
  return [...series].sort((a, b) => b.value - a.value)[0] ?? null;
}

function buildFacts(input: BuildInsightsViewInput, options?: BuildInsightsViewOptions): InsightFact[] {
  const latestWeight = sortByDateAsc(input.bodyweightSeries).at(-1)?.value ?? null;
  const latestCalories = sortByDateAsc(input.caloriesSeries).at(-1)?.value ?? null;
  const latestStrength = sortByDateAsc(input.strengthSeries).at(-1)?.value ?? null;

  if (options && options.rangeDays !== undefined) {
    const rangeLabel = options.rangeLabel ?? "selected range";
    const weightLogs = input.bodyweightSeries.length;
    const caloriesLogs = input.caloriesSeries.length;
    const strengthLogs = input.strengthSeries.length;

    return [
      {
        label: "Latest Weight",
        value: latestWeight != null ? `${latestWeight.toFixed(1)} kg` : "—",
        detail: `${weightLogs} bodyweight logs in ${rangeLabel}`,
      },
      {
        label: "Latest Calories",
        value: latestCalories != null ? `${Math.round(latestCalories)} kcal` : "—",
        detail: `${caloriesLogs} calories logs in ${rangeLabel}`,
      },
      {
        label: "Latest Strength",
        value: latestStrength != null ? latestStrength.toFixed(1) : "—",
        detail: `${strengthLogs} strength days in ${rangeLabel}`,
      },
    ];
  }

  const last14Days = getLastNDatesSet(14);
  const weightLogs14 = filterByDates(input.bodyweightSeries, last14Days).length;
  const caloriesLogs14 = filterByDates(input.caloriesSeries, last14Days).length;
  const strengthLogs14 = filterByDates(input.strengthSeries, last14Days).length;

  return [
    {
      label: "Latest Weight",
      value: latestWeight != null ? `${latestWeight.toFixed(1)} kg` : "—",
      detail: `${weightLogs14} bodyweight logs in last 14 days`,
    },
    {
      label: "Latest Calories",
      value: latestCalories != null ? `${Math.round(latestCalories)} kcal` : "—",
      detail: `${caloriesLogs14} calories logs in last 14 days`,
    },
    {
      label: "Latest Strength",
      value: latestStrength != null ? latestStrength.toFixed(1) : "—",
      detail: `${strengthLogs14} strength days in last 14 days`,
    },
  ];
}

function buildCorrelations(input: BuildInsightsViewInput): InsightCorrelation[] {
  const caloriesVsStrength = pearsonCorrelation(input.caloriesSeries, input.strengthSeries);
  const caloriesVsWeight = pearsonCorrelation(input.caloriesSeries, input.bodyweightSeries);
  const strengthVsWeight = pearsonCorrelation(input.strengthSeries, input.bodyweightSeries);

  return [
    {
      label: "Calories ↔ Strength",
      value: caloriesVsStrength.value,
      interpretation: correlationInterpretation(caloriesVsStrength.value),
      overlapDays: caloriesVsStrength.overlapDays,
    },
    {
      label: "Calories ↔ Bodyweight",
      value: caloriesVsWeight.value,
      interpretation: correlationInterpretation(caloriesVsWeight.value),
      overlapDays: caloriesVsWeight.overlapDays,
    },
    {
      label: "Strength ↔ Bodyweight",
      value: strengthVsWeight.value,
      interpretation: correlationInterpretation(strengthVsWeight.value),
      overlapDays: strengthVsWeight.overlapDays,
    },
  ];
}

function buildAchievements(input: BuildInsightsViewInput, options?: BuildInsightsViewOptions): InsightAchievement[] {
  if (options && options.rangeDays !== undefined) {
    const rangeLabel = options.rangeLabel ?? "selected range";
    const bestStrength = findMaxPoint(input.strengthSeries);
    const highestFuel = findMaxPoint(input.caloriesSeries);
    const weightStability = sampleStdDev(input.bodyweightSeries.map((point) => point.value));
    const latestStrength = sortByDateAsc(input.strengthSeries).at(-1);

    return [
      {
        period: "week",
        title: "Best Strength Day",
        detail: bestStrength
          ? `${bestStrength.date} · score ${bestStrength.value.toFixed(1)} (${rangeLabel})`
          : `No strength data in ${rangeLabel}.`,
      },
      {
        period: "month",
        title: "Highest Fuel Day",
        detail: highestFuel
          ? `${highestFuel.date} · ${Math.round(highestFuel.value)} kcal (${rangeLabel})`
          : `No calories data in ${rangeLabel}.`,
      },
      {
        period: "month",
        title: "Bodyweight Stability",
        detail:
          weightStability != null
            ? `Std dev ${weightStability.toFixed(2)} kg in ${rangeLabel} (lower is steadier)`
            : `Not enough bodyweight logs in ${rangeLabel}.`,
      },
      {
        period: "week",
        title: "Latest Strength Checkpoint",
        detail: latestStrength
          ? `${latestStrength.date} · score ${latestStrength.value.toFixed(1)}`
          : `No strength checkpoint in ${rangeLabel}.`,
      },
    ];
  }

  const last7 = getLastNDatesSet(7);
  const last30 = getLastNDatesSet(30);

  const bestWeekStrength = findMaxPoint(filterByDates(input.strengthSeries, last7));
  const bestMonthStrength = findMaxPoint(filterByDates(input.strengthSeries, last30));

  const bestWeekCalories = findMaxPoint(filterByDates(input.caloriesSeries, last7));
  const weightStabilityMonth = sampleStdDev(filterByDates(input.bodyweightSeries, last30).map((point) => point.value));

  return [
    {
      period: "week",
      title: "Best Strength Day (7d)",
      detail: bestWeekStrength
        ? `${bestWeekStrength.date} · score ${bestWeekStrength.value.toFixed(1)}`
        : "No strength data in last 7 days.",
    },
    {
      period: "month",
      title: "Best Strength Day (30d)",
      detail: bestMonthStrength
        ? `${bestMonthStrength.date} · score ${bestMonthStrength.value.toFixed(1)}`
        : "No strength data in last 30 days.",
    },
    {
      period: "week",
      title: "Highest Fuel Day (7d)",
      detail: bestWeekCalories
        ? `${bestWeekCalories.date} · ${Math.round(bestWeekCalories.value)} kcal`
        : "No calories data in last 7 days.",
    },
    {
      period: "month",
      title: "Bodyweight Stability (30d)",
      detail:
        weightStabilityMonth != null
          ? `Std dev ${weightStabilityMonth.toFixed(2)} kg (lower is steadier)`
          : "Not enough bodyweight logs in last 30 days.",
    },
  ];
}

function buildImprovements(input: BuildInsightsViewInput, options?: BuildInsightsViewOptions): string[] {
  if (options && options.rangeDays !== undefined) {
    const rangeLabel = options.rangeLabel ?? "selected range";
    const weightLogs = input.bodyweightSeries.length;
    const caloriesLogs = input.caloriesSeries.length;
    const strengthLogs = input.strengthSeries.length;
    const items: string[] = [];

    if (options.rangeDays == null) {
      if (weightLogs === 0) items.push("No bodyweight logs yet. Start logging to unlock body composition insights.");
      if (caloriesLogs === 0) items.push("No calories logs yet. Add fuel data to explain strength fluctuations.");
      if (strengthLogs === 0) items.push("No workout strength logs yet. Log sessions to unlock training trend analysis.");
    } else {
      const expectedWeightLogs = Math.max(3, Math.ceil(options.rangeDays * 0.4));
      const expectedCaloriesLogs = Math.max(4, Math.ceil(options.rangeDays * 0.55));
      const expectedStrengthLogs = Math.max(2, Math.ceil(options.rangeDays * 0.25));

      if (weightLogs < expectedWeightLogs) {
        items.push(`Log bodyweight more consistently (target: ${expectedWeightLogs}+ logs in ${rangeLabel}).`);
      }
      if (caloriesLogs < expectedCaloriesLogs) {
        items.push(`Track calories on more days (target: ${expectedCaloriesLogs}+ logs in ${rangeLabel}).`);
      }
      if (strengthLogs < expectedStrengthLogs) {
        items.push(`Log more workout sessions (target: ${expectedStrengthLogs}+ strength days in ${rangeLabel}).`);
      }
    }

    const strengthValues = sortByDateAsc(input.strengthSeries).map((point) => point.value);
    if (strengthValues.length >= 4) {
      const splitIndex = Math.floor(strengthValues.length / 2);
      const priorAvg = average(strengthValues.slice(0, splitIndex));
      const recentAvg = average(strengthValues.slice(splitIndex));
      if (recentAvg != null && priorAvg != null && recentAvg < priorAvg * 0.95) {
        items.push("Strength trend dipped in this range. Review recovery, sleep, and pre/post workout fueling.");
      }
    }

    if (items.length === 0) {
      items.push(`Consistency is solid in ${rangeLabel}. Keep current logging cadence and progressive overload.`);
    }

    return items;
  }

  const last14Days = getLastNDatesSet(14);
  const weightLogs14 = filterByDates(input.bodyweightSeries, last14Days).length;
  const caloriesLogs14 = filterByDates(input.caloriesSeries, last14Days).length;
  const strengthLogs14 = filterByDates(input.strengthSeries, last14Days).length;

  const items: string[] = [];
  if (weightLogs14 < 6) items.push("Log bodyweight more consistently (target: 6+ logs per 14 days).");
  if (caloriesLogs14 < 8) items.push("Track calories on more training days (target: 8+ logs per 14 days).");
  if (strengthLogs14 < 4) items.push("Add more workout logging sessions to improve strength trend reliability.");

  const recentStrength = sortByDateAsc(filterByDates(input.strengthSeries, getLastNDatesSet(7))).map((point) => point.value);
  const priorStrength = sortByDateAsc(
    input.strengthSeries.filter((point) => {
      const date = new Date(`${point.date}T00:00:00`);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 8 && diffDays <= 14;
    })
  ).map((point) => point.value);

  const recentAvg = average(recentStrength);
  const priorAvg = average(priorStrength);
  if (recentAvg != null && priorAvg != null && recentAvg < priorAvg * 0.95) {
    items.push("Strength dipped vs prior week—review sleep, recovery, and pre-workout fueling.");
  }

  if (items.length === 0) {
    items.push("Consistency is solid—keep current logging cadence and progressive overload strategy.");
  }

  return items;
}

function buildSuggestions(
  input: BuildInsightsViewInput,
  correlations: InsightCorrelation[],
  options?: BuildInsightsViewOptions
): string[] {
  const suggestions: string[] = [];
  const rangeLabel = options?.rangeLabel ?? "the selected range";
  const spanDays = options?.rangeDays ?? Math.max(
    getSeriesSpanDays(input.bodyweightSeries),
    getSeriesSpanDays(input.caloriesSeries),
    getSeriesSpanDays(input.strengthSeries)
  );

  const expectedWeightLogs = Math.max(3, Math.ceil(spanDays * 0.4));
  const expectedCaloriesLogs = Math.max(4, Math.ceil(spanDays * 0.55));
  const expectedStrengthLogs = Math.max(2, Math.ceil(spanDays * 0.25));
  const weightAdherence = expectedWeightLogs === 0 ? 1 : input.bodyweightSeries.length / expectedWeightLogs;
  const caloriesAdherence = expectedCaloriesLogs === 0 ? 1 : input.caloriesSeries.length / expectedCaloriesLogs;
  const strengthAdherence = expectedStrengthLogs === 0 ? 1 : input.strengthSeries.length / expectedStrengthLogs;

  if (weightAdherence < 0.65) {
    suggestions.push(
      `Rule: Low bodyweight adherence detected (${input.bodyweightSeries.length}/${expectedWeightLogs} logs in ${rangeLabel}). Use a fixed morning weigh-in routine at least 4 days/week.`
    );
  }
  if (caloriesAdherence < 0.65) {
    suggestions.push(
      `Rule: Low calories adherence detected (${input.caloriesSeries.length}/${expectedCaloriesLogs} logs in ${rangeLabel}). Log pre/post-workout fuel on every training day for a cleaner performance signal.`
    );
  }
  if (strengthAdherence < 0.65) {
    suggestions.push(
      `Rule: Low strength adherence detected (${input.strengthSeries.length}/${expectedStrengthLogs} logs in ${rangeLabel}). Capture at least one top set and one back-off set each session.`
    );
  }

  const caloriesStrength = correlations.find((item) => item.label === "Calories ↔ Strength");
  if (!caloriesStrength || caloriesStrength.overlapDays < 3 || caloriesStrength.value == null) {
    suggestions.push(
      `Rule: Correlation sample too small (n=${caloriesStrength?.overlapDays ?? 0}; need >=3). Increase same-day calories + strength logs before acting on correlation.`
    );
  } else if (caloriesStrength.value >= 0.35) {
    suggestions.push(
      `Rule: Positive calories-strength link detected (r=${caloriesStrength.value.toFixed(2)}). Keep fueling timing stable around sessions and avoid large day-to-day calorie swings.`
    );
  } else if (caloriesStrength.value <= -0.35) {
    suggestions.push(
      `Rule: Negative calories-strength link detected (r=${caloriesStrength.value.toFixed(2)}). Shift more calories toward the 3-4 hours around training and reduce low-fuel sessions.`
    );
  } else {
    suggestions.push(
      `Rule: Weak calories-strength link detected (r=${caloriesStrength.value.toFixed(2)}). Standardize pre-workout nutrition and session logging before changing training volume.`
    );
  }

  const strengthValues = sortByDateAsc(input.strengthSeries).map((point) => point.value);
  if (strengthValues.length >= 6) {
    const splitIndex = Math.floor(strengthValues.length / 2);
    const priorAvg = average(strengthValues.slice(0, splitIndex));
    const recentAvg = average(strengthValues.slice(splitIndex));
    if (priorAvg != null && recentAvg != null && recentAvg < priorAvg * 0.95) {
      suggestions.push(
        "Rule: Strength downtrend detected (>5% drop in recent half). Run a 5-7 day deload and prioritize sleep plus recovery before increasing load again."
      );
    }
  }

  const bodyweightVolatility = sampleStdDev(input.bodyweightSeries.map((point) => point.value));
  if (bodyweightVolatility != null && bodyweightVolatility >= 1) {
    suggestions.push(
      `Rule: High bodyweight volatility detected (std dev ${bodyweightVolatility.toFixed(2)} kg). Keep sodium/hydration and weigh-in timing consistent to reduce noise.`
    );
  }

  if (suggestions.length === 0) {
    suggestions.push("Rule: No adverse patterns detected. Keep current training and logging cadence, then reassess after one more week of data.");
  }

  return suggestions.slice(0, 6);
}

export function buildInsightsView(input: BuildInsightsViewInput, options?: BuildInsightsViewOptions) {
  const normalizedInput: BuildInsightsViewInput = {
    bodyweightSeries: sortByDateAsc(input.bodyweightSeries),
    caloriesSeries: sortByDateAsc(input.caloriesSeries),
    strengthSeries: sortByDateAsc(input.strengthSeries),
  };

  const facts = buildFacts(normalizedInput, options);
  const correlations = buildCorrelations(normalizedInput);
  const improvements = buildImprovements(normalizedInput, options);
  const achievements = buildAchievements(normalizedInput, options);
  const suggestions = buildSuggestions(normalizedInput, correlations, options);

  return {
    facts,
    correlations,
    improvements,
    achievements,
    suggestions,
  };
}
