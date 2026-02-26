export type InsightFact = {
  label: string;
  value: string;
  detail: string;
};

export type InsightCorrelation = {
  label: string;
  value: number | null;
  interpretation: string;
  overlapDays: number;
};

export type InsightAchievement = {
  period: "week" | "month";
  title: string;
  detail: string;
};

export type InsightMetricPoint = {
  date: string;
  value: number;
};

export type InsightsData = {
  email: string;
  firstName: string | null;
  facts: InsightFact[];
  correlations: InsightCorrelation[];
  improvements: string[];
  achievements: InsightAchievement[];
  suggestions: string[];
  bodyweightSeries: InsightMetricPoint[];
  caloriesSeries: InsightMetricPoint[];
  metabolicActivitySeries: InsightMetricPoint[];
  netEnergySeries: InsightMetricPoint[];
  strengthSeries: InsightMetricPoint[];
};

export type InsightsLoadResult =
  | { status: "ok"; data: InsightsData }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };
