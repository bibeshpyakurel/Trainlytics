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
  if (value == null) return "Not enough overlapping days yet.";
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

function buildFacts(input: BuildInsightsViewInput): InsightFact[] {
  const latestWeight = sortByDateAsc(input.bodyweightSeries).at(-1)?.value ?? null;
  const latestCalories = sortByDateAsc(input.caloriesSeries).at(-1)?.value ?? null;
  const latestStrength = sortByDateAsc(input.strengthSeries).at(-1)?.value ?? null;

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

function buildAchievements(input: BuildInsightsViewInput): InsightAchievement[] {
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

function buildImprovements(input: BuildInsightsViewInput): string[] {
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
  correlations: InsightCorrelation[],
  improvements: string[]
): string[] {
  const suggestions: string[] = [];

  const caloriesStrength = correlations.find((item) => item.label === "Calories ↔ Strength");
  if (caloriesStrength?.value != null) {
    if (caloriesStrength.value >= 0.35) {
      suggestions.push("Your calories and strength trend move together—keep pre/post workout fueling consistent.");
    } else if (caloriesStrength.value <= -0.35) {
      suggestions.push("Calories and strength are diverging—consider meal timing quality around sessions.");
    } else {
      suggestions.push("Calories and strength link is weak—track both more consistently for clearer signal.");
    }
  } else {
    suggestions.push("Need more overlapping calories + strength days before strong correlation recommendations.");
  }

  if (improvements.some((item) => item.toLowerCase().includes("bodyweight"))) {
    suggestions.push("Set a fixed morning weigh-in schedule (same time, same routine) for cleaner body data.");
  }

  if (improvements.some((item) => item.toLowerCase().includes("strength dipped"))) {
    suggestions.push("Run a lighter deload week or reduce fatigue before chasing heavier top sets.");
  }

  return suggestions;
}

export function buildInsightsView(input: BuildInsightsViewInput) {
  const normalizedInput: BuildInsightsViewInput = {
    bodyweightSeries: sortByDateAsc(input.bodyweightSeries),
    caloriesSeries: sortByDateAsc(input.caloriesSeries),
    strengthSeries: sortByDateAsc(input.strengthSeries),
  };

  const facts = buildFacts(normalizedInput);
  const correlations = buildCorrelations(normalizedInput);
  const improvements = buildImprovements(normalizedInput);
  const achievements = buildAchievements(normalizedInput);
  const suggestions = buildSuggestions(correlations, improvements);

  return {
    facts,
    correlations,
    improvements,
    achievements,
    suggestions,
  };
}
