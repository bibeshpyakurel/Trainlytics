"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { loadInsightsData } from "@/lib/insightsService";
import { buildInsightsView } from "@/lib/insightsView";
import type { InsightMetricPoint, InsightsData } from "@/lib/insightsTypes";
import { LB_PER_KG } from "@/lib/convertWeight";
import { STORAGE_KEYS } from "@/lib/preferences";
import { API_ROUTES, ROUTES, buildLoginRedirectPath } from "@/lib/routes";

type AssistantMessage = { role: "user" | "assistant"; text: string };
type AssistantSection = { title: string; content: string };
type AssistantTone = "coach" | "technical" | "plain";
type AssistantOutputMode = "default" | "fitness_structured";

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<{ isFinal?: boolean } & ArrayLike<{ transcript: string }>>; resultIndex?: number }) => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop?: () => void;
  abort?: () => void;
};

const QUICK_PROMPTS = [
  "How are calories affecting my strength lately?",
  "What should I improve this week?",
  "Summarize my top achievement this month",
];

const RANGE_OPTIONS = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "all", label: "All", days: null },
] as const;

type RangeOptionId = (typeof RANGE_OPTIONS)[number]["id"];

type MetricId = "weight" | "calories" | "spend" | "net" | "strength";

type TrendMetricConfig = {
  id: MetricId;
  label: string;
  unit: string;
  targetLogsPerWeek: number;
};

type DrilldownEntry = {
  date: string;
  value: string;
  note?: string;
};

type DrilldownState = {
  title: string;
  subtitle: string;
  entries: DrilldownEntry[];
};

type ChartMode = "raw" | "index";
type CoachingItem = { id: string; message: string };
type PersistedThread = { messages: AssistantMessage[] };

const TREND_METRICS: TrendMetricConfig[] = [
  { id: "weight", label: "Bodyweight", unit: "kg", targetLogsPerWeek: 4 },
  { id: "calories", label: "Calories", unit: "kcal", targetLogsPerWeek: 5 },
  { id: "spend", label: "Estimated Burn", unit: "kcal", targetLogsPerWeek: 5 },
  { id: "net", label: "Net Energy", unit: "kcal", targetLogsPerWeek: 4 },
  { id: "strength", label: "Strength", unit: "score", targetLogsPerWeek: 3 },
];

const VOICE_RESTART_DELAY_MS = 180;
const FOLLOW_UP_SOURCE_MAX_CHARS = 1_200;
const STREAM_REVEAL_TICK_MIN_MS = 18;
const STREAM_REVEAL_TICK_MAX_MS = 28;
const STREAM_REVEAL_BASE_CHARS_PER_TICK = 1;
const STREAM_REVEAL_MAX_CHARS_PER_TICK = 4;
const STREAM_REVEAL_BOOST_MAX_CHARS_PER_TICK = 7;
const STREAM_REVEAL_BOOST_QUEUE_THRESHOLD = 200;
const STREAM_COMPLETION_FORMAT_DELAY_MS = 180;
const AUTO_SCROLL_PAUSE_THRESHOLD_PX = 80;
const AUTO_SCROLL_RESUME_THRESHOLD_PX = 24;
const ASSISTANT_TONE_STORAGE_KEY = "insights_assistant_tone";
const ASSISTANT_TONE_OPTIONS: Array<{ id: AssistantTone; label: string }> = [
  { id: "coach", label: "Coach" },
  { id: "technical", label: "Technical" },
  { id: "plain", label: "Plain English" },
];
const ASSISTANT_OUTPUT_MODE_STORAGE_KEY = "insights_assistant_output_mode";
const ASSISTANT_OUTPUT_MODE_OPTIONS: Array<{ id: AssistantOutputMode; label: string }> = [
  { id: "default", label: "Default" },
  { id: "fitness_structured", label: "Fitness Structured" },
];

function filterSeriesByRange(series: InsightMetricPoint[], days: number | null): InsightMetricPoint[] {
  if (days == null) return series;

  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));

  return series.filter((point) => {
    const pointDate = new Date(`${point.date}T00:00:00`);
    return pointDate >= cutoff;
  });
}

function toChartLabel(dateIso: string) {
  const date = new Date(`${dateIso}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseIsoDate(dateIso: string) {
  return startOfDay(new Date(`${dateIso}T00:00:00`));
}

function formatValue(value: number, metric: TrendMetricConfig) {
  if (metric.id === "calories") return `${Math.round(value)} ${metric.unit}`;
  return `${value.toFixed(1)} ${metric.unit}`;
}

function formatDeltaPercent(deltaPct: number | null) {
  if (deltaPct == null) return "Not enough data";
  const sign = deltaPct > 0 ? "+" : "";
  return `${sign}${(deltaPct * 100).toFixed(1)}%`;
}

function computeRollingAverageByDate(series: InsightMetricPoint[], windowDays = 7) {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((point) => {
    const pointDate = parseIsoDate(point.date);
    const windowStart = addDays(pointDate, -(windowDays - 1));
    const windowValues = sorted
      .filter((candidate) => {
        const candidateDate = parseIsoDate(candidate.date);
        return candidateDate >= windowStart && candidateDate <= pointDate;
      })
      .map((candidate) => candidate.value);

    const avg = windowValues.length === 0
      ? null
      : windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length;

    return {
      date: point.date,
      value: avg,
      sampleSize: windowValues.length,
    };
  });
}

function computeWeekOverWeekDelta(series: InsightMetricPoint[]) {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) {
    return { deltaPct: null as number | null, recentSample: 0, priorSample: 0 };
  }

  const latestDate = parseIsoDate(sorted[sorted.length - 1].date);
  const recentStart = addDays(latestDate, -6);
  const priorStart = addDays(latestDate, -13);
  const priorEnd = addDays(latestDate, -7);

  const recentValues = sorted
    .filter((point) => {
      const date = parseIsoDate(point.date);
      return date >= recentStart && date <= latestDate;
    })
    .map((point) => point.value);
  const priorValues = sorted
    .filter((point) => {
      const date = parseIsoDate(point.date);
      return date >= priorStart && date <= priorEnd;
    })
    .map((point) => point.value);

  if (recentValues.length < 2 || priorValues.length < 2) {
    return { deltaPct: null as number | null, recentSample: recentValues.length, priorSample: priorValues.length };
  }

  const recentAvg = recentValues.reduce((sum, value) => sum + value, 0) / recentValues.length;
  const priorAvg = priorValues.reduce((sum, value) => sum + value, 0) / priorValues.length;
  if (priorAvg === 0) {
    return { deltaPct: null as number | null, recentSample: recentValues.length, priorSample: priorValues.length };
  }

  return {
    deltaPct: (recentAvg - priorAvg) / priorAvg,
    recentSample: recentValues.length,
    priorSample: priorValues.length,
  };
}

function resolveAdherenceWindowDays(metricSeries: InsightMetricPoint[], selectedRangeDays: number | null) {
  if (selectedRangeDays != null) return selectedRangeDays;
  if (metricSeries.length < 2) return 7;

  const sorted = [...metricSeries].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = parseIsoDate(sorted[0].date);
  const lastDate = parseIsoDate(sorted[sorted.length - 1].date);
  const spanDays = Math.floor((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(7, spanDays);
}

function getCorrelationConfidence(overlapDays: number) {
  if (overlapDays >= 15) {
    return {
      label: "High confidence",
      detail: `n=${overlapDays} overlap days (15+ days)`,
      className: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
    };
  }
  if (overlapDays >= 7) {
    return {
      label: "Medium confidence",
      detail: `n=${overlapDays} overlap days (7-14 days)`,
      className: "border-amber-400/40 bg-amber-500/10 text-amber-300",
    };
  }
  if (overlapDays >= 3) {
    return {
      label: "Low confidence",
      detail: `n=${overlapDays} overlap days (3-6 days)`,
      className: "border-orange-400/40 bg-orange-500/10 text-orange-300",
    };
  }

  return {
    label: "Insufficient data",
    detail: `n=${overlapDays} overlap days (need at least 3)`,
    className: "border-zinc-600/70 bg-zinc-800/60 text-zinc-300",
  };
}

function formatEntryDate(dateIso: string) {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function countOverlapDays(left: InsightMetricPoint[], right: InsightMetricPoint[]) {
  const rightDates = new Set(right.map((point) => point.date));
  return left.reduce((count, point) => (rightDates.has(point.date) ? count + 1 : count), 0);
}

function countLaggedOverlapDays(
  left: InsightMetricPoint[],
  right: InsightMetricPoint[],
  lagDays: number
) {
  const shiftedRightDates = new Set(
    right.map((point) => {
      const shiftedDate = addDays(parseIsoDate(point.date), -lagDays);
      const year = shiftedDate.getFullYear();
      const month = String(shiftedDate.getMonth() + 1).padStart(2, "0");
      const day = String(shiftedDate.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    })
  );
  return left.reduce((count, point) => (shiftedRightDates.has(point.date) ? count + 1 : count), 0);
}

function countPresenceSpanDays(left: InsightMetricPoint[], right: InsightMetricPoint[]) {
  if (left.length === 0 || right.length === 0) return 0;
  const allDates = [...left, ...right].map((point) => point.date).sort();
  if (allDates.length === 0) return 0;
  const start = parseIsoDate(allDates[0]);
  const end = parseIsoDate(allDates[allDates.length - 1]);
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function getLastUserMessageIndex(messages: AssistantMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

function splitAssistantSections(text: string): AssistantSection[] | null {
  const normalized = text.trim();
  if (!normalized) return null;

  const isLong = normalized.length >= 280 || normalized.split("\n").length >= 6;
  if (!isLong) return null;

  const defaultSectionTitles = ["Summary", "Details", "Action Plan"];
  const fitnessSectionTitles = ["Key insight", "Risk", "Next workout action"];
  const headingRegex =
    /^\s{0,3}(?:#{1,3}\s*)?(Summary|Details|Action Plan|Key insight|Risk|Next workout action)\s*:?\s*$/i;
  const lines = normalized.split("\n");
  const sectionsFromHeadings = new Map<string, string[]>();
  let currentTitle: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const headingMatch = line.match(headingRegex);
    if (headingMatch) {
      const matched = headingMatch[1].toLowerCase();
      currentTitle = matched === "summary"
        ? "Summary"
        : matched === "details"
          ? "Details"
          : matched === "action plan"
            ? "Action Plan"
            : matched === "key insight"
              ? "Key insight"
              : matched === "risk"
                ? "Risk"
                : "Next workout action";
      if (!sectionsFromHeadings.has(currentTitle)) {
        sectionsFromHeadings.set(currentTitle, []);
      }
      continue;
    }

    if (currentTitle) {
      sectionsFromHeadings.get(currentTitle)?.push(line);
    }
  }

  if (sectionsFromHeadings.size >= 2) {
    const sectionTitles = sectionsFromHeadings.has("Key insight")
      ? fitnessSectionTitles
      : defaultSectionTitles;
    const resolved = sectionTitles.map((title) => ({
      title,
      content: (sectionsFromHeadings.get(title) ?? []).join("\n").trim(),
    }));
    return resolved.filter((section) => section.content.length > 0);
  }

  const paragraphs = normalized.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (paragraphs.length >= 3) {
    return [
      { title: "Summary", content: paragraphs[0] },
      { title: "Details", content: paragraphs.slice(1, -1).join("\n\n") },
      { title: "Action Plan", content: paragraphs[paragraphs.length - 1] },
    ].filter((section) => section.content.length > 0);
  }

  const sentences = normalized.match(/[^.!?]+[.!?]*/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  if (sentences.length >= 6) {
    const summary = sentences.slice(0, 2).join(" ");
    const details = sentences.slice(2, -2).join(" ");
    const actionPlan = sentences.slice(-2).join(" ");
    return [
      { title: "Summary", content: summary },
      { title: "Details", content: details },
      { title: "Action Plan", content: actionPlan },
    ].filter((section) => section.content.length > 0);
  }

  return null;
}

export default function InsightsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [data, setData] = useState<InsightsData | null>(null);
  const [question, setQuestion] = useState("");
  const [questionInterim, setQuestionInterim] = useState("");
  const [assistantThread, setAssistantThread] = useState<AssistantMessage[]>([]);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [isAutoScrollPinned, setIsAutoScrollPinned] = useState(true);
  const [assistantTone, setAssistantTone] = useState<AssistantTone>("coach");
  const [assistantOutputMode, setAssistantOutputMode] = useState<AssistantOutputMode>("default");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [selectedRange, setSelectedRange] = useState<RangeOptionId>("7d");
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("index");
  const [threadHydrated, setThreadHydrated] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechFrameRef = useRef<number | null>(null);
  const pendingSpeechFinalRef = useRef("");
  const pendingSpeechInterimRef = useRef("");
  const keepListeningRef = useRef(false);
  const voiceStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const assistantAbortRef = useRef<AbortController | null>(null);
  const stopGenerationRequestedRef = useRef(false);
  const formatSwapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollPinnedRef = useRef(true);
  const isProgrammaticScrollRef = useRef(false);
  const [deferLastAssistantFormatting, setDeferLastAssistantFormatting] = useState(false);

  function setAutoScrollPinned(nextValue: boolean) {
    autoScrollPinnedRef.current = nextValue;
    setIsAutoScrollPinned(nextValue);
  }

  function scrollChatToBottom(smooth: boolean) {
    const container = chatScrollRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    if (!smooth && distanceFromBottom <= 1) return;
    isProgrammaticScrollRef.current = true;
    container.scrollTo({ top: scrollHeight, behavior: smooth ? "smooth" : "auto" });
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
      return;
    }
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 0);
  }

  function clearVoiceStopTimer() {
    const timer = voiceStopTimerRef.current;
    if (timer != null) {
      clearTimeout(timer);
      voiceStopTimerRef.current = null;
    }
  }

  function clearFormatSwapTimer() {
    const timer = formatSwapTimerRef.current;
    if (timer != null) {
      clearTimeout(timer);
      formatSwapTimerRef.current = null;
    }
  }

  function cancelSpeechFrame() {
    if (typeof window === "undefined") return;
    if (speechFrameRef.current != null) {
      window.cancelAnimationFrame(speechFrameRef.current);
      speechFrameRef.current = null;
    }
  }

  function flushPendingSpeechUpdates() {
    const pendingFinal = pendingSpeechFinalRef.current.trim();
    const pendingInterim = pendingSpeechInterimRef.current;
    pendingSpeechFinalRef.current = "";
    pendingSpeechInterimRef.current = "";

    if (pendingFinal) {
      setQuestion((prev) => (prev ? `${prev} ${pendingFinal}` : pendingFinal));
    }
    setQuestionInterim(pendingInterim);
  }

  function scheduleSpeechFrame() {
    if (typeof window === "undefined" || speechFrameRef.current != null) return;
    speechFrameRef.current = window.requestAnimationFrame(() => {
      speechFrameRef.current = null;
      flushPendingSpeechUpdates();
    });
  }

  function stopVoiceInput(options?: { reason?: string }) {
    keepListeningRef.current = false;
    clearVoiceStopTimer();
    cancelSpeechFrame();
    flushPendingSpeechUpdates();

    const activeRecognition = recognitionRef.current;
    recognitionRef.current = null;
    if (activeRecognition) {
      try {
        activeRecognition.stop?.();
        activeRecognition.abort?.();
      } catch {
        // Ignore provider-specific stop errors.
      }
    }

    setIsListening(false);
    setQuestionInterim("");
    if (options?.reason) {
      setAssistantError(options.reason);
    }
  }

  useEffect(() => {
    let isMounted = true;

    (async () => {
      setLoading(true);
      setMsg(null);
      const result = await loadInsightsData();
      if (!isMounted) return;

      if (result.status === "unauthenticated") {
        setMsg("You are not logged in.");
        setLoading(false);
        router.replace(buildLoginRedirectPath(ROUTES.insights, "session_expired"));
        return;
      }

      if (result.status === "error") {
        setMsg(result.message);
        setLoading(false);
        return;
      }

      setData(result.data);
      setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const selectedRangeConfig = useMemo(
    () => RANGE_OPTIONS.find((item) => item.id === selectedRange) ?? RANGE_OPTIONS[1],
    [selectedRange]
  );

  const filteredSeries = useMemo(() => {
    return {
      bodyweightSeries: filterSeriesByRange(data?.bodyweightSeries ?? [], selectedRangeConfig.days),
      caloriesSeries: filterSeriesByRange(data?.caloriesSeries ?? [], selectedRangeConfig.days),
      metabolicActivitySeries: filterSeriesByRange(data?.metabolicActivitySeries ?? [], selectedRangeConfig.days),
      netEnergySeries: filterSeriesByRange(data?.netEnergySeries ?? [], selectedRangeConfig.days),
      strengthSeries: filterSeriesByRange(data?.strengthSeries ?? [], selectedRangeConfig.days),
    };
  }, [data, selectedRangeConfig.days]);

  const rangeInsights = useMemo(() => {
    return buildInsightsView(
      {
        bodyweightSeries: filteredSeries.bodyweightSeries,
        caloriesSeries: filteredSeries.caloriesSeries,
        metabolicActivitySeries: filteredSeries.metabolicActivitySeries,
        netEnergySeries: filteredSeries.netEnergySeries,
        strengthSeries: filteredSeries.strengthSeries,
      },
      {
        rangeDays: selectedRangeConfig.days,
        rangeLabel: selectedRangeConfig.label === "All" ? "all time" : `last ${selectedRangeConfig.label}`,
      }
    );
  }, [filteredSeries, selectedRangeConfig.days, selectedRangeConfig.label]);

  const trendDecomposition = useMemo(() => {
    const seriesByMetric: Record<MetricId, InsightMetricPoint[]> = {
      weight: filteredSeries.bodyweightSeries,
      calories: filteredSeries.caloriesSeries,
      spend: filteredSeries.metabolicActivitySeries,
      net: filteredSeries.netEnergySeries,
      strength: filteredSeries.strengthSeries,
    };

    const metricRows = TREND_METRICS.map((metric) => {
      const series = seriesByMetric[metric.id];
      const rolling = computeRollingAverageByDate(series, 7);
      const latestRolling = rolling.at(-1) ?? null;
      const wow = computeWeekOverWeekDelta(series);
      const windowDays = resolveAdherenceWindowDays(series, selectedRangeConfig.days);
      const expectedLogs = Math.max(1, Math.round((windowDays / 7) * metric.targetLogsPerWeek));
      const actualLogs = series.length;
      const adherenceScore = Math.min(100, Math.round((actualLogs / expectedLogs) * 100));

      return {
        metric,
        latestRolling,
        wow,
        actualLogs,
        expectedLogs,
        adherenceScore,
        windowDays,
      };
    });

    const overallAdherence = Math.round(
      metricRows.reduce((sum, row) => sum + row.adherenceScore, 0) / metricRows.length
    );

    return {
      metricRows,
      overallAdherence,
    };
  }, [filteredSeries, selectedRangeConfig.days]);

  const coachingItems = useMemo<CoachingItem[]>(() => {
    const items: CoachingItem[] = [];
    const rangeText = selectedRangeConfig.label === "All" ? "all time" : `the last ${selectedRangeConfig.label}`;

    if (filteredSeries.bodyweightSeries.length === 0) {
      items.push({
        id: "weight-start",
        message: `You need 1 bodyweight log to unlock weight trend insights for ${rangeText}.`,
      });
    }
    if (filteredSeries.caloriesSeries.length === 0) {
      items.push({
        id: "calories-start",
        message: `You need 1 calories log to unlock fueling insights for ${rangeText}.`,
      });
    }
    if (filteredSeries.metabolicActivitySeries.length === 0) {
      items.push({
        id: "burn-start",
        message: `You need 1 burn log to unlock energy-spend insights for ${rangeText}.`,
      });
    }
    if (filteredSeries.strengthSeries.length === 0) {
      items.push({
        id: "strength-start",
        message: `You need 1 workout strength log to unlock performance insights for ${rangeText}.`,
      });
    }

    const caloriesStrengthOverlap = countOverlapDays(filteredSeries.caloriesSeries, filteredSeries.strengthSeries);
    const netLag3Overlap = countLaggedOverlapDays(filteredSeries.netEnergySeries, filteredSeries.bodyweightSeries, 3);
    const netLag7Overlap = countLaggedOverlapDays(filteredSeries.netEnergySeries, filteredSeries.bodyweightSeries, 7);
    const strengthWeightOverlap = countOverlapDays(filteredSeries.strengthSeries, filteredSeries.bodyweightSeries);
    const spendConsistencyOverlap = countPresenceSpanDays(filteredSeries.metabolicActivitySeries, filteredSeries.strengthSeries);

    const missingCaloriesStrength = Math.max(0, 3 - caloriesStrengthOverlap);
    if (missingCaloriesStrength > 0) {
      items.push({
        id: "corr-cal-strength",
        message: `You need ${missingCaloriesStrength} more overlapping calories + strength day${missingCaloriesStrength === 1 ? "" : "s"} to unlock reliable calories-strength correlation.`,
      });
    }

    const missingNetLag3 = Math.max(0, 3 - netLag3Overlap);
    if (missingNetLag3 > 0) {
      items.push({
        id: "corr-net-weight-lag3",
        message: `You need ${missingNetLag3} more overlap day${missingNetLag3 === 1 ? "" : "s"} to unlock net-energy (lag 3d) vs bodyweight correlation.`,
      });
    }

    const missingNetLag7 = Math.max(0, 3 - netLag7Overlap);
    if (missingNetLag7 > 0) {
      items.push({
        id: "corr-net-weight-lag7",
        message: `You need ${missingNetLag7} more overlap day${missingNetLag7 === 1 ? "" : "s"} to unlock net-energy (lag 7d) vs bodyweight correlation.`,
      });
    }

    const missingStrengthWeight = Math.max(0, 3 - strengthWeightOverlap);
    if (missingStrengthWeight > 0) {
      items.push({
        id: "corr-strength-weight",
        message: `You need ${missingStrengthWeight} more overlapping strength + bodyweight day${missingStrengthWeight === 1 ? "" : "s"} to unlock strength-bodyweight correlation.`,
      });
    }

    const missingSpendConsistency = Math.max(0, 3 - spendConsistencyOverlap);
    if (missingSpendConsistency > 0) {
      items.push({
        id: "corr-spend-consistency",
        message: `You need ${missingSpendConsistency} more day${missingSpendConsistency === 1 ? "" : "s"} of burn/workout logging span to unlock spend-consistency vs workout-consistency correlation.`,
      });
    }

    for (const row of trendDecomposition.metricRows) {
      const missingRecent = Math.max(0, 2 - row.wow.recentSample);
      const missingPrior = Math.max(0, 2 - row.wow.priorSample);
      const missingWoW = missingRecent + missingPrior;
      if (missingWoW > 0) {
        items.push({
          id: `wow-${row.metric.id}`,
          message: `You need ${missingWoW} more ${row.metric.label.toLowerCase()} log${missingWoW === 1 ? "" : "s"} to unlock week-over-week delta for ${row.metric.label}.`,
        });
      }
    }

    return items.slice(0, 5);
  }, [filteredSeries, trendDecomposition.metricRows, selectedRangeConfig.label]);

  const mergedTrendData = useMemo(() => {
    const byDate = new Map<string, { date: string; label: string; weightKg?: number; calories?: number; spend?: number; net?: number; strength?: number }>();

    for (const point of filteredSeries.bodyweightSeries) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        weightKg: point.value,
      });
    }

    for (const point of filteredSeries.caloriesSeries) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        calories: point.value,
      });
    }

    for (const point of filteredSeries.metabolicActivitySeries) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        spend: point.value,
      });
    }

    for (const point of filteredSeries.netEnergySeries) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        net: point.value,
      });
    }

    for (const point of filteredSeries.strengthSeries) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        strength: point.value,
      });
    }

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredSeries]);

  const indexedTrendData = useMemo(() => {
    function toIndexSeries(values: Array<number | undefined>) {
      const base = values.find((value) => value != null && Number.isFinite(value));
      return values.map((value) => {
        if (value == null || !Number.isFinite(value) || base == null || base === 0) return undefined;
        return (value / base) * 100;
      });
    }

    const weightIndex = toIndexSeries(mergedTrendData.map((row) => row.weightKg));
    const caloriesIndex = toIndexSeries(mergedTrendData.map((row) => row.calories));
    const spendIndex = toIndexSeries(mergedTrendData.map((row) => row.spend));
    const netIndex = toIndexSeries(mergedTrendData.map((row) => row.net));
    const strengthIndex = toIndexSeries(mergedTrendData.map((row) => row.strength));

    return mergedTrendData.map((row, idx) => ({
      ...row,
      weightIdx: weightIndex[idx],
      caloriesIdx: caloriesIndex[idx],
      spendIdx: spendIndex[idx],
      netIdx: netIndex[idx],
      strengthIdx: strengthIndex[idx],
    }));
  }, [mergedTrendData]);

  const aiContext = useMemo(() => {
    if (!data) return null;
    return {
      facts: rangeInsights.facts,
      correlations: rangeInsights.correlations,
      improvements: rangeInsights.improvements,
      achievements: rangeInsights.achievements,
      suggestions: rangeInsights.suggestions,
    };
  }, [data, rangeInsights]);

  const threadStorageKey = useMemo(() => {
    if (!data?.email) return null;
    return `insights_thread_session_${data.email.trim().toLowerCase()}`;
  }, [data?.email]);
  const visibleQuestion = useMemo(() => {
    const finalTranscript = question.trim();
    const interimTranscript = questionInterim.trim();
    if (!interimTranscript) return question;
    if (!finalTranscript) return questionInterim;
    return `${question} ${questionInterim}`.trim();
  }, [question, questionInterim]);

  const canRegenerate = useMemo(() => {
    if (assistantLoading) return false;
    if (assistantThread.length < 2) return false;
    const lastIndex = assistantThread.length - 1;
    const lastUserIndex = getLastUserMessageIndex(assistantThread);
    return lastUserIndex >= 0 && lastIndex > lastUserIndex && assistantThread[lastIndex]?.role === "assistant";
  }, [assistantThread, assistantLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const speechRecognitionCtor =
      (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition ||
      (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
    setSpeechSupported(Boolean(speechRecognitionCtor));

    const savedSpeakReplies = localStorage.getItem(STORAGE_KEYS.insightsSpeakReplies);
    if (savedSpeakReplies != null) {
      setSpeakReplies(savedSpeakReplies === "true");
    }
    const savedTone = localStorage.getItem(ASSISTANT_TONE_STORAGE_KEY);
    if (savedTone === "coach" || savedTone === "technical" || savedTone === "plain") {
      setAssistantTone(savedTone);
    }
    const savedOutputMode = localStorage.getItem(ASSISTANT_OUTPUT_MODE_STORAGE_KEY);
    if (savedOutputMode === "default" || savedOutputMode === "fitness_structured") {
      setAssistantOutputMode(savedOutputMode);
    }

    return () => {
      assistantAbortRef.current?.abort();
      assistantAbortRef.current = null;
      clearFormatSwapTimer();
      stopVoiceInput();
    };
  }, []);

  useEffect(() => {
    if (assistantLoading) {
      clearFormatSwapTimer();
      setDeferLastAssistantFormatting(true);
      return;
    }

    const lastMessage = assistantThread[assistantThread.length - 1];
    if (lastMessage?.role !== "assistant" || !deferLastAssistantFormatting) {
      return;
    }

    clearFormatSwapTimer();
    formatSwapTimerRef.current = setTimeout(() => {
      setDeferLastAssistantFormatting(false);
      formatSwapTimerRef.current = null;
    }, STREAM_COMPLETION_FORMAT_DELAY_MS);
  }, [assistantLoading, assistantThread, deferLastAssistantFormatting]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!threadStorageKey) {
      setThreadHydrated(true);
      return;
    }

    setThreadHydrated(false);
    try {
      const raw = sessionStorage.getItem(threadStorageKey);
      if (!raw) {
        setAssistantThread([]);
        setThreadHydrated(true);
        return;
      }

      const parsed = JSON.parse(raw) as PersistedThread;
      const restored = Array.isArray(parsed?.messages)
        ? parsed.messages.filter((entry): entry is AssistantMessage =>
            (entry?.role === "user" || entry?.role === "assistant") && typeof entry?.text === "string"
          )
        : [];
      setAssistantThread(restored);
    } catch {
      setAssistantThread([]);
    } finally {
      setThreadHydrated(true);
    }
  }, [threadStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!threadStorageKey || !threadHydrated) return;
    const payload: PersistedThread = { messages: assistantThread.slice(-30) };
    sessionStorage.setItem(threadStorageKey, JSON.stringify(payload));
  }, [assistantThread, threadStorageKey, threadHydrated]);

  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container) return;

    const onScroll = () => {
      if (isProgrammaticScrollRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

      if (distanceFromBottom > AUTO_SCROLL_PAUSE_THRESHOLD_PX && autoScrollPinnedRef.current) {
        setAutoScrollPinned(false);
      } else if (distanceFromBottom <= AUTO_SCROLL_RESUME_THRESHOLD_PX && !autoScrollPinnedRef.current) {
        setAutoScrollPinned(true);
      }
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!isAutoScrollPinned) return;
    if (assistantLoading) return;
    scrollChatToBottom(true);
  }, [assistantThread, assistantLoading, isAutoScrollPinned]);

  function speak(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis || !speakReplies) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  function startVoiceInput() {
    if (typeof window === "undefined") return;
    const speechRecognitionCtor =
      (window as Window & { webkitSpeechRecognition?: new () => BrowserSpeechRecognition }).webkitSpeechRecognition ||
      (window as Window & { SpeechRecognition?: new () => BrowserSpeechRecognition }).SpeechRecognition;

    if (!speechRecognitionCtor) {
      setAssistantError("Voice input is not supported in this browser.");
      return;
    }

    keepListeningRef.current = true;
    setAssistantError(null);
    setQuestionInterim("");
    clearVoiceStopTimer();

    const startRecognition = () => {
      if (!keepListeningRef.current) return;
      let transientRestartScheduled = false;

      const recognition = new speechRecognitionCtor();
      recognitionRef.current = recognition;
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.onresult = (event) => {
        const startIndex = event.resultIndex ?? 0;
        let appendedFinal = "";
        const interimParts: string[] = [];

        for (let index = startIndex; index < event.results.length; index += 1) {
          const result = event.results?.[index];
          const transcript = result?.[0]?.transcript?.trim();
          if (!transcript) continue;
          if (result.isFinal) {
            appendedFinal = appendedFinal ? `${appendedFinal} ${transcript}` : transcript;
          } else {
            interimParts.push(transcript);
          }
        }
        if (appendedFinal) {
          pendingSpeechFinalRef.current = pendingSpeechFinalRef.current
            ? `${pendingSpeechFinalRef.current} ${appendedFinal}`
            : appendedFinal;
        }
        pendingSpeechInterimRef.current = interimParts.join(" ").trim();
        scheduleSpeechFrame();
      };
      recognition.onerror = (event) => {
        const errorCode = event?.error ?? "unknown";
        if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
          stopVoiceInput({ reason: "Microphone access is blocked. Please allow mic permission and try again." });
          return;
        }
        setAssistantError("Voice input had a brief hiccup. Reconnecting...");
        if (!keepListeningRef.current || transientRestartScheduled) return;
        transientRestartScheduled = true;
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
        try {
          recognition.abort?.();
        } catch {
          // Ignore abort errors during transient reconnect.
        }
        setTimeout(() => {
          if (keepListeningRef.current) {
            startRecognition();
          }
        }, VOICE_RESTART_DELAY_MS);
      };
      recognition.onend = () => {
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
        if (transientRestartScheduled) {
          return;
        }
        cancelSpeechFrame();
        flushPendingSpeechUpdates();
        setQuestionInterim("");
        if (!keepListeningRef.current) {
          setIsListening(false);
          return;
        }
        setTimeout(() => {
          if (keepListeningRef.current) {
            startRecognition();
          }
        }, VOICE_RESTART_DELAY_MS);
      };

      setIsListening(true);
      try {
        recognition.start();
      } catch {
        stopVoiceInput({ reason: "Voice input could not start. Please check microphone permissions." });
      }
    };

    startRecognition();
  }

  function stopAssistantGeneration() {
    const activeController = assistantAbortRef.current;
    if (!activeController) return;
    stopGenerationRequestedRef.current = true;
    activeController.abort();
    assistantAbortRef.current = null;
  }

  async function requestAssistantAnswer(
    prompt: string,
    historyBeforePrompt: AssistantMessage[],
    nextThread: AssistantMessage[]
  ) {
    setAssistantError(null);
    setAssistantLoading(true);
    setAssistantThread([...nextThread, { role: "assistant", text: "" }]);
    let isStreaming = true;
    stopGenerationRequestedRef.current = false;

    try {
      const controller = new AbortController();
      assistantAbortRef.current = controller;

      const response = await fetch(API_ROUTES.insightsAi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: prompt,
          context: aiContext,
          history: historyBeforePrompt,
          tone: assistantTone,
          outputMode: assistantOutputMode,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let responseMessage = "Failed to get AI response.";
        try {
          const responseData = (await response.json()) as { answer?: string; error?: string };
          if (responseData.error) {
            responseMessage = responseData.error;
          }
        } catch {
          // Keep fallback message when provider body is unavailable.
        }
        throw new Error(responseMessage);
      }

      if (!response.body) {
        throw new Error("AI provider returned an empty stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let visibleText = "";
      let sseBuffer = "";
      let rawQueue = "";
      isStreaming = true;

      const getRevealTickMs = (queueLength: number) => {
        if (queueLength >= 420) return STREAM_REVEAL_TICK_MIN_MS;
        if (queueLength >= 240) return 20;
        if (queueLength >= 100) return 22;
        return STREAM_REVEAL_TICK_MAX_MS;
      };

      const nextFrame = () => new Promise<number>((resolve) => {
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame((timestamp) => resolve(timestamp));
          return;
        }
        setTimeout(() => resolve(Date.now()), STREAM_REVEAL_TICK_MIN_MS);
      });

      const revealLoop = (async () => {
        let lastRevealAt = 0;
        while (isStreaming || rawQueue.length > 0) {
          const frameAt = await nextFrame();
          if (stopGenerationRequestedRef.current) {
            rawQueue = "";
            isStreaming = false;
          }
          if (rawQueue.length > 0) {
            const tickMs = getRevealTickMs(rawQueue.length);
            if (lastRevealAt !== 0 && frameAt - lastRevealAt < tickMs) {
              continue;
            }
            lastRevealAt = frameAt;
            const queueBoost = rawQueue.length > STREAM_REVEAL_BOOST_QUEUE_THRESHOLD
              ? Math.ceil((rawQueue.length - STREAM_REVEAL_BOOST_QUEUE_THRESHOLD) / 160)
              : 0;
            const charsThisTick = Math.min(
              rawQueue.length > 260 ? STREAM_REVEAL_BOOST_MAX_CHARS_PER_TICK : STREAM_REVEAL_MAX_CHARS_PER_TICK,
              STREAM_REVEAL_BASE_CHARS_PER_TICK + queueBoost
            );
            const nextSlice = rawQueue.slice(0, charsThisTick);
            rawQueue = rawQueue.slice(charsThisTick);
            visibleText += nextSlice;
            setAssistantThread([...nextThread, { role: "assistant", text: visibleText }]);
            if (autoScrollPinnedRef.current) {
              scrollChatToBottom(false);
            }
          }
        }
      })();

      const flushSseEvents = () => {
        let separatorIndex = sseBuffer.indexOf("\n\n");
        while (separatorIndex >= 0) {
          const rawEvent = sseBuffer.slice(0, separatorIndex);
          sseBuffer = sseBuffer.slice(separatorIndex + 2);

          const dataLines = rawEvent
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart());

          const eventData = dataLines.join("");
          if (!eventData || eventData === "[DONE]") {
            separatorIndex = sseBuffer.indexOf("\n\n");
            continue;
          }

          try {
            const parsed = JSON.parse(eventData) as {
              error?: { message?: string };
              choices?: Array<{ delta?: { content?: string } }>;
            };
            if (parsed.error?.message) {
              throw new Error(parsed.error.message);
            }

            const deltaText = parsed.choices?.[0]?.delta?.content;
            if (!stopGenerationRequestedRef.current && typeof deltaText === "string" && deltaText.length > 0) {
              rawQueue += deltaText;
            }
          } catch (error) {
            if (error instanceof Error) {
              throw error;
            }
          }

          separatorIndex = sseBuffer.indexOf("\n\n");
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        flushSseEvents();
      }
      sseBuffer += decoder.decode();
      flushSseEvents();
      isStreaming = false;
      await revealLoop;
      if (autoScrollPinnedRef.current) {
        scrollChatToBottom(true);
      }

      const finalAnswer = visibleText.trim();
      if (!finalAnswer) {
        throw new Error("AI returned an empty response.");
      }

      setAssistantThread([...nextThread, { role: "assistant", text: finalAnswer }]);
      speak(finalAnswer);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setAssistantThread((current) => {
          const lastMessage = current[current.length - 1];
          if (lastMessage?.role === "assistant" && lastMessage.text.trim().length === 0) {
            return current.slice(0, -1);
          }
          return current;
        });
        return;
      }
      setAssistantError(error instanceof Error ? error.message : "Failed to get AI response.");
    } finally {
      isStreaming = false;
      assistantAbortRef.current = null;
      stopGenerationRequestedRef.current = false;
      setAssistantLoading(false);
    }
  }

  async function askInsightsAssistant() {
    if (assistantLoading) return;

    const trimmed = visibleQuestion.trim();
    if (!trimmed || !data || !aiContext) return;

    const historyBeforePrompt = assistantThread;
    const nextThread: AssistantMessage[] = [...historyBeforePrompt, { role: "user", text: trimmed }];
    setAutoScrollPinned(true);
    scrollChatToBottom(true);
    setQuestion("");
    setQuestionInterim("");
    await requestAssistantAnswer(trimmed, historyBeforePrompt, nextThread);
  }

  async function regenerateLastAnswer() {
    if (assistantLoading || !data || !aiContext) return;

    const lastUserIndex = getLastUserMessageIndex(assistantThread);
    if (lastUserIndex < 0) {
      setAssistantError("No previous user prompt found to regenerate.");
      return;
    }

    const userPrompt = assistantThread[lastUserIndex]?.text?.trim();
    if (!userPrompt) {
      setAssistantError("Last user prompt is empty.");
      return;
    }

    const historyBeforePrompt = assistantThread.slice(0, lastUserIndex);
    const nextThread: AssistantMessage[] = [...historyBeforePrompt, { role: "user", text: userPrompt }];
    setAutoScrollPinned(true);
    scrollChatToBottom(true);
    await requestAssistantAnswer(userPrompt, historyBeforePrompt, nextThread);
  }

  function applyQuickPrompt(prompt: string) {
    setQuestion(prompt);
  }

  async function askFollowUpFromAnswer(answerText: string, mode: "explain" | "examples" | "shorter", index: number) {
    if (assistantLoading || !data || !aiContext) return;

    const sourceText = answerText.trim().slice(0, FOLLOW_UP_SOURCE_MAX_CHARS);
    if (!sourceText) return;

    const followUpPrompt =
      mode === "explain"
        ? `Explain this answer in more detail and connect it to my recent trends:\n\n${sourceText}`
        : mode === "examples"
          ? `Give 3 concrete examples from my data related to this answer:\n\n${sourceText}`
          : `Rewrite this answer to be shorter (3 to 5 bullets max):\n\n${sourceText}`;

    const historyBeforePrompt = assistantThread.slice(0, index + 1);
    const nextThread: AssistantMessage[] = [...historyBeforePrompt, { role: "user", text: followUpPrompt }];
    setAutoScrollPinned(true);
    scrollChatToBottom(true);
    await requestAssistantAnswer(followUpPrompt, historyBeforePrompt, nextThread);
  }

  function toggleSpeakReplies() {
    setSpeakReplies((value) => {
      const nextValue = !value;
      localStorage.setItem(STORAGE_KEYS.insightsSpeakReplies, String(nextValue));
      return nextValue;
    });
  }

  function updateAssistantTone(nextTone: AssistantTone) {
    setAssistantTone(nextTone);
    localStorage.setItem(ASSISTANT_TONE_STORAGE_KEY, nextTone);
  }

  function updateAssistantOutputMode(nextMode: AssistantOutputMode) {
    setAssistantOutputMode(nextMode);
    localStorage.setItem(ASSISTANT_OUTPUT_MODE_STORAGE_KEY, nextMode);
  }

  function clearAssistantChat() {
    stopAssistantGeneration();
    setAutoScrollPinned(true);
    setAssistantThread([]);
    setAssistantError(null);
    setQuestion("");
    setQuestionInterim("");
  }

  function toggleVoiceInput() {
    if (isListening) {
      stopVoiceInput();
      return;
    }
    startVoiceInput();
  }

  function getMetricDrilldownEntries(metric: MetricId): DrilldownEntry[] {
    if (metric === "weight") {
      return [...filteredSeries.bodyweightSeries]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((point) => ({
          date: point.date,
          value: `${point.value.toFixed(1)} kg`,
        }));
    }

    if (metric === "calories") {
      return [...filteredSeries.caloriesSeries]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((point) => ({
          date: point.date,
          value: `${Math.round(point.value)} kcal`,
        }));
    }

    if (metric === "spend") {
      return [...filteredSeries.metabolicActivitySeries]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((point) => ({
          date: point.date,
          value: `${Math.round(point.value)} kcal`,
        }));
    }

    if (metric === "net") {
      return [...filteredSeries.netEnergySeries]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((point) => ({
          date: point.date,
          value: `${Math.round(point.value)} kcal`,
        }));
    }

    return [...filteredSeries.strengthSeries]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((point) => ({
        date: point.date,
        value: point.value.toFixed(1),
      }));
  }

  function openMetricDrilldown(title: string, metric: MetricId, subtitle: string) {
    setDrilldown({
      title,
      subtitle,
      entries: getMetricDrilldownEntries(metric),
    });
  }

  function openCorrelationDrilldown(label: string) {
    const byDateLeft = new Map<string, number>();
    const byDateRight = new Map<string, number>();
    let leftName = "";
    let rightName = "";

    if (label === "Calories ↔ Strength") {
      leftName = "Calories";
      rightName = "Strength";
      for (const point of filteredSeries.caloriesSeries) byDateLeft.set(point.date, point.value);
      for (const point of filteredSeries.strengthSeries) byDateRight.set(point.date, point.value);
    } else if (label === "Net Energy (lag 3d) ↔ Bodyweight" || label === "Net Energy (lag 7d) ↔ Bodyweight") {
      leftName = "Net";
      rightName = "Weight";
      for (const point of filteredSeries.netEnergySeries) byDateLeft.set(point.date, point.value);
      for (const point of filteredSeries.bodyweightSeries) byDateRight.set(point.date, point.value);
    } else if (label === "Spend Consistency ↔ Workout Consistency") {
      leftName = "Spend logged";
      rightName = "Workout logged";
      for (const point of filteredSeries.metabolicActivitySeries) byDateLeft.set(point.date, 1);
      for (const point of filteredSeries.strengthSeries) byDateRight.set(point.date, 1);
    } else {
      leftName = "Strength";
      rightName = "Weight";
      for (const point of filteredSeries.strengthSeries) byDateLeft.set(point.date, point.value);
      for (const point of filteredSeries.bodyweightSeries) byDateRight.set(point.date, point.value);
    }

    const entries = Array.from(byDateLeft.entries())
      .filter(([date]) => byDateRight.has(date))
      .map(([date, leftValue]) => ({
        date,
        value: `${leftName}: ${leftName === "Calories" || leftName === "Net" ? Math.round(leftValue) : leftValue.toFixed(1)}`,
        note: `${rightName}: ${rightName === "Weight" ? byDateRight.get(date)!.toFixed(1) : byDateRight.get(date)!.toFixed(1)}`,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    setDrilldown({
      title: label,
      subtitle: "Overlapping days used in correlation",
      entries,
    });
  }

  function openTextInsightDrilldown(title: string, text: string) {
    const metric: MetricId | "all" =
      /bodyweight|weigh/i.test(text) ? "weight" :
      /calories|fuel/i.test(text) ? "calories" :
      /burn|metabolic|spend/i.test(text) ? "spend" :
      /net\s*energy|surplus|deficit/i.test(text) ? "net" :
      /strength|workout|recovery|deload/i.test(text) ? "strength" :
      "all";

    if (metric === "all") {
      const entries = mergedTrendData
        .map((item) => ({
          date: item.date,
          value: `Weight ${item.weightKg != null ? item.weightKg.toFixed(1) : "—"} kg`,
          note: `Calories ${item.calories != null ? Math.round(item.calories) : "—"} | Burn ${item.spend != null ? Math.round(item.spend) : "—"} | Net ${item.net != null ? Math.round(item.net) : "—"} | Strength ${item.strength != null ? item.strength.toFixed(1) : "—"}`,
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      setDrilldown({
        title,
        subtitle: text,
        entries,
      });
      return;
    }

    openMetricDrilldown(title, metric, text);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(245,158,11,0.18),transparent_34%),radial-gradient(circle_at_85%_10%,rgba(16,185,129,0.12),transparent_32%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:46px_46px] opacity-20" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">Insights</p>
        <h1 className="mt-3 text-4xl font-bold text-white">
          {data?.firstName?.trim()
            ? `Performance Intelligence for ${data.firstName.trim()}`
            : "Performance Intelligence"}
        </h1>
        <p className="mt-2 max-w-3xl text-zinc-300">
          We connect bodyweight, intake, estimated burn, net energy, and strength trends to surface what is working and where to improve.
        </p>

        {msg && <p className="mt-4 text-sm text-red-300">{msg}</p>}

        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-zinc-700/70 bg-zinc-900/70 p-1">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedRange(option.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                selectedRange === option.id
                  ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                  : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="relative mt-6 overflow-hidden rounded-3xl border border-amber-300/25 bg-zinc-900/75 p-5 shadow-[0_0_0_1px_rgba(251,191,36,0.10),0_18px_48px_rgba(0,0,0,0.38)] backdrop-blur-md">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-16 left-10 h-44 w-44 rounded-full bg-amber-400/10 blur-3xl" />
            <div className="absolute -right-10 top-8 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(251,191,36,0.05),transparent_38%,rgba(255,255,255,0.03)_52%,transparent_70%)]" />
          </div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Ask Trainlytics AI</h2>
              <p className="mt-1 text-sm text-zinc-300">Ask about trends, and get live streaming answers with data-backed context.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/35 bg-zinc-900/80 px-3 py-1 text-xs text-zinc-200 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]">
                <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]" />
                AI ready with your history
              </div>
              {!assistantLoading ? (
                <>
                  <label className="inline-flex items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-900/70 px-2.5 py-1 text-[11px] text-zinc-200">
                    <span className="font-semibold text-zinc-400">Tone</span>
                    <select
                      value={assistantTone}
                      onChange={(event) => updateAssistantTone(event.target.value as AssistantTone)}
                      className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-100 outline-none"
                    >
                      {ASSISTANT_TONE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-900/70 px-2.5 py-1 text-[11px] text-zinc-200">
                    <span className="font-semibold text-zinc-400">Format</span>
                    <select
                      value={assistantOutputMode}
                      onChange={(event) => updateAssistantOutputMode(event.target.value as AssistantOutputMode)}
                      className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-100 outline-none"
                    >
                      {ASSISTANT_OUTPUT_MODE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/35 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
                  Generating...
                </div>
              )}
            </div>
          </div>

          {assistantError && <p className="mt-3 text-xs text-red-300">{assistantError}</p>}

          <div>
            <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] lg:flex lg:h-[38rem] lg:flex-col lg:overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Ask</p>
                <button
                  type="button"
                  onClick={clearAssistantChat}
                  disabled={assistantThread.length === 0 && !assistantLoading}
                  className="rounded-full border border-zinc-600 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
                >
                  Clear chat
                </button>
              </div>
              {!assistantLoading && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => applyQuickPrompt(prompt)}
                      className="rounded-full border border-zinc-700 bg-zinc-900/70 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-amber-300/60 hover:bg-zinc-800"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              <div
                ref={chatScrollRef}
                style={{ scrollbarGutter: "stable" }}
                className="mt-4 space-y-4 overflow-y-auto rounded-2xl border border-zinc-700/70 bg-zinc-950/55 p-4 lg:min-h-0 lg:flex-1"
              >
                {assistantThread.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-700/70 bg-zinc-900/40 px-3 py-3 text-sm text-zinc-400">
                    Try one of the quick prompts above, or ask anything about intake, burn, net energy, bodyweight, and strength history.
                  </div>
                ) : (
                  assistantThread.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {(() => {
                        const showTypingCursor =
                          assistantLoading &&
                          message.role === "assistant" &&
                          index === assistantThread.length - 1;
                        const deferFormatting =
                          !assistantLoading &&
                          deferLastAssistantFormatting &&
                          message.role === "assistant" &&
                          index === assistantThread.length - 1;

                        return (
                      <div
                        className={`rounded-2xl px-3 py-2 text-[15px] whitespace-pre-line ${
                          message.role === "user"
                            ? "max-w-[82%] bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                            : `w-full max-w-[min(92%,44rem)] border border-zinc-700/70 bg-zinc-900/90 text-zinc-200 ${
                                showTypingCursor ? "min-h-16" : ""
                              }`
                        }`}
                      >
                        <p className={`text-[10px] uppercase tracking-wide ${message.role === "user" ? "text-black/80" : "text-zinc-400"}`}>
                          {message.role === "user" ? "You" : "Trainlytics AI"}
                        </p>
                        {message.role === "assistant" ? (
                          <div>
                          {(() => {
                            if (showTypingCursor) {
                              return (
                                <p className="mt-1 leading-7">
                                  {message.text}
                                  <span className="ml-1 inline-block align-middle text-amber-300 motion-safe:animate-pulse">▋</span>
                                </p>
                              );
                            }
                            if (deferFormatting) {
                              return (
                                <p className="mt-1 leading-7">
                                  {message.text}
                                  <span className="ml-1 inline-block align-middle text-amber-300/80 motion-safe:animate-pulse">▋</span>
                                </p>
                              );
                            }
                            const sections = splitAssistantSections(message.text);
                            if (!sections) {
                              return (
                                <>
                                  <p className="mt-1 leading-7">
                                    {message.text}
                                  </p>
                                </>
                              );
                            }

                            return (
                              <div className="mt-2 space-y-2 transition-opacity duration-200">
                                {sections.map((section) => (
                                  <div key={section.title} className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 p-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">{section.title}</p>
                                    <p className="mt-1 leading-7 whitespace-pre-line">{section.content}</p>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                          </div>
                        ) : (
                          <p className="mt-1 leading-7">{message.text}</p>
                        )}
                        {message.role === "assistant" && !showTypingCursor && !assistantLoading && (
                          <div className="mt-2">
                            <div className="flex flex-wrap gap-1.5">
                            {index === assistantThread.length - 1 && (
                              <button
                                type="button"
                                onClick={() => void regenerateLastAnswer()}
                                disabled={!canRegenerate}
                                className="rounded-full border border-amber-300/40 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
                              >
                                Regenerate response
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void askFollowUpFromAnswer(message.text, "explain", index)}
                              disabled={assistantLoading}
                              className="rounded-full border border-zinc-600 px-2 py-1 text-[11px] font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
                            >
                              Explain more
                            </button>
                            <button
                              type="button"
                              onClick={() => void askFollowUpFromAnswer(message.text, "examples", index)}
                              disabled={assistantLoading}
                              className="rounded-full border border-zinc-600 px-2 py-1 text-[11px] font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
                            >
                              Give examples
                            </button>
                            <button
                              type="button"
                              onClick={() => void askFollowUpFromAnswer(message.text, "shorter", index)}
                              disabled={assistantLoading}
                              className="rounded-full border border-zinc-600 px-2 py-1 text-[11px] font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
                            >
                              Make shorter
                            </button>
                            </div>
                          </div>
                        )}
                      </div>
                        );
                      })()}
                    </div>
                  ))
                )}
              </div>
              {!isAutoScrollPinned && assistantLoading && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setAutoScrollPinned(true);
                      scrollChatToBottom(true);
                    }}
                    className="rounded-full border border-amber-300/40 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-200 transition hover:bg-amber-500/20"
                  >
                    Jump to latest
                  </button>
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
                <input
                  value={visibleQuestion}
                  onChange={(event) => {
                    setQuestion(event.target.value);
                    setQuestionInterim("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !assistantLoading) {
                      event.preventDefault();
                      void askInsightsAssistant();
                    }
                  }}
                  placeholder="Ask about your trends, correlations, strengths, or improvements"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950/90 px-3 py-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                />
                <button
                  type="button"
                  onClick={() => void askInsightsAssistant()}
                  disabled={!data || question.trim().length === 0 || assistantLoading}
                  className="rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60"
                >
                  Ask
                </button>
                <button
                  type="button"
                  onClick={stopAssistantGeneration}
                  disabled={!assistantLoading}
                  className="rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  Stop generating
                </button>
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  disabled={!speechSupported || assistantLoading}
                  className="rounded-xl border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
                >
                  {isListening ? "Stop talk" : "🎙️ Talk"}
                </button>
                <button
                  type="button"
                  onClick={toggleSpeakReplies}
                  disabled={assistantLoading}
                  className="rounded-xl border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
                >
                  {speakReplies ? "🔊 On" : "🔈 Off"}
                </button>
              </div>
            </div>

          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-700/80 bg-zinc-900/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Unlock Next Insights</p>
          {coachingItems.length === 0 ? (
            <p className="mt-2 text-sm text-emerald-300">All core insight types are unlocked for this range.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {coachingItems.map((item) => (
                <p key={item.id} className="rounded-lg border border-zinc-700/70 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200">
                  {item.message}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {rangeInsights.facts.map((fact) => (
            <div
              key={fact.label}
              onClick={() =>
                openMetricDrilldown(
                  fact.label,
                  fact.label === "Latest Weight"
                    ? "weight"
                    : fact.label === "Latest Calories"
                      ? "calories"
                      : fact.label === "Latest Burn"
                        ? "spend"
                        : fact.label === "Latest Net Energy"
                          ? "net"
                          : "strength",
                  `${fact.detail}. Raw logs for ${selectedRangeConfig.label}.`
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openMetricDrilldown(
                    fact.label,
                    fact.label === "Latest Weight"
                      ? "weight"
                      : fact.label === "Latest Calories"
                        ? "calories"
                        : fact.label === "Latest Burn"
                          ? "spend"
                          : fact.label === "Latest Net Energy"
                            ? "net"
                            : "strength",
                    `${fact.detail}. Raw logs for ${selectedRangeConfig.label}.`
                  );
                }
              }}
              role="button"
              tabIndex={0}
              className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 text-left backdrop-blur-sm transition hover:border-amber-300/50 hover:bg-zinc-900/90"
            >
              <p className="text-xs uppercase tracking-wide text-zinc-400">{fact.label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {loading
                  ? "..."
                  : fact.label === "Latest Weight"
                    ? (() => {
                        const latestWeightKg = filteredSeries.bodyweightSeries.at(-1)?.value;
                        if (latestWeightKg == null || !Number.isFinite(latestWeightKg)) return "—";
                        return `${(latestWeightKg * LB_PER_KG).toFixed(1)} lb`;
                      })()
                    : fact.value}
              </p>
              <p className="mt-1 text-xs text-zinc-400">{fact.detail}</p>
              <p className="mt-2 text-[11px] text-amber-200/80 underline underline-offset-2">
                Click to view underlying logs
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Cross-Metric Trend</h2>
            <div className="flex items-center gap-3">
              <p className="text-xs text-zinc-400">
                {chartMode === "raw"
                  ? `Separate axes · ${selectedRangeConfig.label}`
                  : `Indexed to 100 at first visible point · ${selectedRangeConfig.label}`}
              </p>
              <div className="inline-flex rounded-full border border-zinc-700/70 bg-zinc-900/70 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setChartMode("index")}
                  className={`rounded-full px-3 py-1 transition ${
                    chartMode === "index"
                      ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                      : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  Index
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode("raw")}
                  className={`rounded-full px-3 py-1 transition ${
                    chartMode === "raw"
                      ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                      : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  Raw
                </button>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-xs text-zinc-500"
            title="Strength score = sum of per-exercise session strength on each day. Per-exercise session strength uses set score (weight × reps × rep multiplier), weighted as 40% Set 1 + 60% Set 2 when both exist."
          >
            Strength score definition: weighted volume-based daily score from your logged sets.
          </p>

          <div className="mt-4 h-80 w-full">
            {mergedTrendData.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400">
                Not enough data yet for trend chart.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartMode === "index" ? indexedTrendData : mergedTrendData}
                  margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} />
                  {chartMode === "index" ? (
                    <YAxis
                      tick={{ fill: "#a1a1aa", fontSize: 12 }}
                      tickLine={false}
                      axisLine={{ stroke: "#52525b" }}
                      width={56}
                      domain={["auto", "auto"]}
                    />
                  ) : (
                    <>
                      <YAxis
                        yAxisId="weight"
                        tick={{ fill: "#67e8f9", fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: "#0891b2" }}
                        width={52}
                      />
                      <YAxis
                        yAxisId="energy"
                        orientation="right"
                        tick={{ fill: "#fcd34d", fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: "#d97706" }}
                        width={52}
                      />
                      <YAxis yAxisId="strength" hide domain={["auto", "auto"]} />
                    </>
                  )}
                  <Tooltip
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "10px" }}
                    labelStyle={{ color: "#e4e4e7" }}
                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.date || _label}
                    formatter={(value, name) => {
                      if (typeof value !== "number") return [value, name];
                      if (chartMode === "index") return [`${value.toFixed(1)} idx`, name];
                      if (name?.toString().toLowerCase().includes("weight")) return [`${value.toFixed(1)} kg`, name];
                      if (name?.toString().toLowerCase().includes("calories")) return [`${Math.round(value)} kcal`, name];
                      if (name?.toString().toLowerCase().includes("burn")) return [`${Math.round(value)} kcal`, name];
                      if (name?.toString().toLowerCase().includes("net")) return [`${Math.round(value)} kcal`, name];
                      return [`${value.toFixed(1)}`, name];
                    }}
                  />
                  <Legend wrapperStyle={{ color: "#d4d4d8", fontSize: "12px" }} />
                  <Line
                    type="monotone"
                    dataKey={chartMode === "index" ? "weightIdx" : "weightKg"}
                    name={chartMode === "index" ? "Weight Index" : "Weight (kg)"}
                    yAxisId={chartMode === "index" ? undefined : "weight"}
                    stroke="#22d3ee"
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey={chartMode === "index" ? "caloriesIdx" : "calories"}
                    name={chartMode === "index" ? "Calories Index" : "Calories"}
                    yAxisId={chartMode === "index" ? undefined : "energy"}
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey={chartMode === "index" ? "spendIdx" : "spend"}
                    name={chartMode === "index" ? "Burn Index" : "Estimated Burn"}
                    yAxisId={chartMode === "index" ? undefined : "energy"}
                    stroke="#22c55e"
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey={chartMode === "index" ? "netIdx" : "net"}
                    name={chartMode === "index" ? "Net Index" : "Net Energy"}
                    yAxisId={chartMode === "index" ? undefined : "energy"}
                    stroke="#38bdf8"
                    strokeWidth={2.5}
                    strokeDasharray="5 3"
                    dot={{ r: 2 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey={chartMode === "index" ? "strengthIdx" : "strength"}
                    name={chartMode === "index" ? "Strength Index" : "Strength"}
                    yAxisId={chartMode === "index" ? undefined : "strength"}
                    stroke="#a78bfa"
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Trend Decomposition</h2>
            <p className="text-xs text-zinc-400">
              7-day rolling averages, week-over-week deltas, and logging adherence
            </p>
          </div>
          <div className="mt-2 inline-flex items-center rounded-full border border-zinc-700/70 bg-zinc-950/60 px-3 py-1 text-xs text-zinc-300">
            Consistency score:
            <span className="ml-1 font-semibold text-emerald-300">{trendDecomposition.overallAdherence}%</span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {trendDecomposition.metricRows.map((row) => (
              <div key={row.metric.id} className="rounded-2xl border border-zinc-700/70 bg-zinc-950/40 p-4">
                <p className="text-sm font-semibold text-zinc-100">{row.metric.label}</p>

                <p className="mt-2 text-xs uppercase tracking-wide text-zinc-500">7-day rolling average</p>
                <p className="mt-1 text-base font-medium text-zinc-100">
                  {row.latestRolling?.value != null ? formatValue(row.latestRolling.value, row.metric) : "Not enough data"}
                </p>
                <p className="text-xs text-zinc-500">
                  {row.latestRolling?.sampleSize != null
                    ? `${row.latestRolling.sampleSize} logs in current 7-day window`
                    : "Need logs within a 7-day window"}
                </p>

                <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">Week-over-week delta</p>
                <p className="mt-1 text-base font-medium text-zinc-100">{formatDeltaPercent(row.wow.deltaPct)}</p>
                <p className="text-xs text-zinc-500">
                  Recent n={row.wow.recentSample}, prior n={row.wow.priorSample} (minimum 2 logs each week)
                </p>

                <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">Logging adherence</p>
                <p className="mt-1 text-base font-medium text-zinc-100">{row.adherenceScore}%</p>
                <p className="text-xs text-zinc-500">
                  {row.actualLogs}/{row.expectedLogs} logs (target {row.metric.targetLogsPerWeek}/week over {row.windowDays} days)
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
            <h2 className="text-lg font-semibold text-white">Correlation Snapshot</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Pearson r shown when overlap is at least 3 days. Confidence is based on overlap sample size.
            </p>
            <div className="mt-3 space-y-3">
              {rangeInsights.correlations.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => openCorrelationDrilldown(item.label)}
                  className="flex min-h-[172px] w-full flex-col rounded-xl border border-zinc-700/70 bg-zinc-950/40 p-3 text-left transition hover:border-amber-300/50 hover:bg-zinc-900/70"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-100">{item.label}</p>
                    <p className="text-sm font-semibold text-amber-300">
                      {item.value != null ? item.value.toFixed(2) : "—"}
                    </p>
                  </div>
                  {(() => {
                    const confidence = getCorrelationConfidence(item.overlapDays);
                    const missingOverlap = Math.max(0, 3 - item.overlapDays);
                    return (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${confidence.className}`}>
                          {confidence.label}
                        </span>
                        <span className="text-[11px] text-zinc-400">{confidence.detail}</span>
                        {missingOverlap > 0 && (
                          <span className="text-[11px] text-amber-300">
                            Need {missingOverlap} more overlap day{missingOverlap === 1 ? "" : "s"} for r.
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  <p className="mt-1 text-xs text-zinc-300">{item.interpretation}</p>
                  <p className="mt-1 text-xs text-zinc-500">Overlap days: {item.overlapDays}</p>
                  <p className="mt-auto pt-2 text-[11px] text-amber-200/80">Click to view overlap-day raw values</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
            <h2 className="text-lg font-semibold text-white">Top Achievements</h2>
            <div className="mt-3 space-y-3">
              {rangeInsights.achievements.map((item) => (
                <button
                  key={`${item.period}-${item.title}`}
                  type="button"
                  onClick={() => openTextInsightDrilldown(item.title, item.detail)}
                  className="flex min-h-[128px] w-full flex-col rounded-xl border border-zinc-700/70 bg-zinc-950/40 p-3 text-left transition hover:border-amber-300/50 hover:bg-zinc-900/70"
                >
                  <p className="text-xs uppercase tracking-wide text-zinc-400">{item.period}</p>
                  <p className="mt-1 text-sm font-medium text-zinc-100">{item.title}</p>
                  <p className="mt-1 text-xs text-zinc-300">{item.detail}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {drilldown && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-6">
            <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-950 p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{drilldown.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">{drilldown.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrilldown(null)}
                  className="rounded-lg border border-zinc-600 px-3 py-1 text-xs text-zinc-200 transition hover:bg-zinc-800"
                >
                  Close
                </button>
              </div>
              <div className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {drilldown.entries.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-700 px-3 py-2 text-sm text-zinc-400">
                    No raw logs available for this card in the selected range.
                  </p>
                ) : (
                  drilldown.entries.map((entry, index) => (
                    <div key={`${entry.date}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                      <p className="text-xs text-zinc-400">{formatEntryDate(entry.date)}</p>
                      <p className="mt-1 text-sm font-medium text-zinc-100">{entry.value}</p>
                      {entry.note && <p className="mt-1 text-xs text-zinc-400">{entry.note}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
