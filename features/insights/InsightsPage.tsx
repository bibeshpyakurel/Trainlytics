"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { loadInsightsData } from "@/lib/insightsService";
import { buildInsightsView } from "@/lib/insightsView";
import type { InsightMetricPoint, InsightsData } from "@/lib/insightsTypes";
import { calculateBmi } from "@/lib/energyCalculations";
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
type EnergyBreakdownRangeId = "biweekly" | "1m" | "3m" | "6m" | "1y";

type TopVisualTab = "weight_net_overlay" | "maintenance_intake_burn" | "bmi_trend" | "active_burn_consistency";
type BottomVisualTab = "strength_weight_change" | "weekday_pattern" | "fat_signal_14d" | "forecast_14d";
type PersistedThread = { messages: AssistantMessage[] };

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
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const ENERGY_BREAKDOWN_RANGE_OPTIONS: Array<{ id: EnergyBreakdownRangeId; label: string; days: number }> = [
  { id: "biweekly", label: "Biweekly", days: 14 },
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 90 },
  { id: "6m", label: "6M", days: 180 },
  { id: "1y", label: "1Y", days: 365 },
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
  const [, setLoading] = useState(true);
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
  const [energyBreakdownRange, setEnergyBreakdownRange] = useState<EnergyBreakdownRangeId>("biweekly");
  const [topVisualTab, setTopVisualTab] = useState<TopVisualTab>("weight_net_overlay");
  const [bottomVisualTab, setBottomVisualTab] = useState<BottomVisualTab>("strength_weight_change");
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
      maintenanceSeries: filterSeriesByRange(data?.maintenanceSeries ?? [], selectedRangeConfig.days),
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

  const weightVsNetOverlayData = useMemo(() => {
    const netRolling7 = computeRollingAverageByDate(filteredSeries.netEnergySeries, 7);
    const netRollingByDate = new Map<string, number>();
    const netRollingShiftedByDate = new Map<string, number>();
    for (const point of netRolling7) {
      const value = point.value;
      if (point.sampleSize < 3 || value == null) continue;
      netRollingByDate.set(point.date, value);
      const shiftedDate = addDays(parseIsoDate(point.date), 3)
        .toISOString()
        .slice(0, 10);
      netRollingShiftedByDate.set(shiftedDate, value);
    }

    const byDate = new Map<
      string,
      {
        date: string;
        label: string;
        weightKg?: number;
        net7d?: number;
        net7dLag3?: number;
      }
    >();

    for (const point of filteredSeries.bodyweightSeries) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        weightKg: point.value,
      });
    }

    for (const [date, value] of netRollingByDate.entries()) {
      byDate.set(date, {
        ...(byDate.get(date) ?? { date, label: toChartLabel(date) }),
        net7d: value,
      });
    }

    for (const [date, value] of netRollingShiftedByDate.entries()) {
      byDate.set(date, {
        ...(byDate.get(date) ?? { date, label: toChartLabel(date) }),
        net7dLag3: value,
      });
    }

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredSeries.bodyweightSeries, filteredSeries.netEnergySeries]);

  const maintenanceVsIntakeVsBurnData = useMemo(() => {
    const byDate = new Map<
      string,
      { date: string; label: string; intake?: number; maintenance?: number; activeBurn?: number }
    >();

    for (const point of filteredSeries.caloriesSeries) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        intake: point.value,
      });
    }
    for (const point of filteredSeries.maintenanceSeries) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        maintenance: point.value,
      });
    }
    for (const point of filteredSeries.metabolicActivitySeries) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        activeBurn: point.value,
      });
    }

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [
    filteredSeries.caloriesSeries,
    filteredSeries.maintenanceSeries,
    filteredSeries.metabolicActivitySeries,
  ]);

  const bmiTrendData = useMemo(() => {
    const heightCm = data?.profileHeightCm ?? null;
    if (!(heightCm && heightCm > 0)) {
      return [] as Array<{ date: string; label: string; bmi: number }>;
    }

    return filteredSeries.bodyweightSeries
      .map((point) => {
        const bmi = calculateBmi(point.value, heightCm);
        return {
          date: point.date,
          label: toChartLabel(point.date),
          bmi: bmi ?? NaN,
        };
      })
      .filter((point) => Number.isFinite(point.bmi))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredSeries.bodyweightSeries, data?.profileHeightCm]);

  const bmiYAxisDomain = useMemo<[number, number]>(() => {
    if (bmiTrendData.length === 0) return [15, 35];
    const values = bmiTrendData.map((point) => point.bmi);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const yMin = Math.max(10, Math.floor((min - 1) * 10) / 10);
    const yMax = Math.min(60, Math.ceil((max + 1) * 10) / 10);
    return [yMin, Math.max(yMax, yMin + 4)];
  }, [bmiTrendData]);

  const activeBurnConsistencyWeeklyData = useMemo(() => {
    const weekly = new Map<string, { weekStart: string; loggedDays: number; totalBurn: number }>();

    for (const point of filteredSeries.metabolicActivitySeries) {
      const pointDate = parseIsoDate(point.date);
      const weekStartDate = addDays(pointDate, -pointDate.getDay());
      const weekStart = weekStartDate.toISOString().slice(0, 10);
      const current = weekly.get(weekStart) ?? { weekStart, loggedDays: 0, totalBurn: 0 };
      current.loggedDays += 1;
      current.totalBurn += point.value;
      weekly.set(weekStart, current);
    }

    return Array.from(weekly.values())
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .map((row) => {
        const consistencyScore = Math.round((row.loggedDays / 7) * 100);
        const avgActiveBurn = row.loggedDays > 0 ? row.totalBurn / row.loggedDays : null;
        return {
          ...row,
          label: toChartLabel(row.weekStart),
          consistencyScore,
          avgActiveBurn,
        };
      });
  }, [filteredSeries.metabolicActivitySeries]);

  const strengthVsWeightChangeData = useMemo(() => {
    const byDate = new Map<string, { date: string; label: string; strength?: number; weightKg?: number }>();
    for (const point of filteredSeries.strengthSeries) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        strength: point.value,
      });
    }
    for (const point of filteredSeries.bodyweightSeries) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        weightKg: point.value,
      });
    }

    const rows = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    const baseStrength = rows.find((row) => row.strength != null && Number.isFinite(row.strength))?.strength ?? null;
    const baseWeight = rows.find((row) => row.weightKg != null && Number.isFinite(row.weightKg))?.weightKg ?? null;

    return rows.map((row) => {
      const strengthGrowthPct = row.strength != null && baseStrength != null && baseStrength > 0
        ? ((row.strength - baseStrength) / baseStrength) * 100
        : undefined;
      const weightChangeKg = row.weightKg != null && baseWeight != null
        ? row.weightKg - baseWeight
        : undefined;
      return {
        ...row,
        strengthGrowthPct,
        weightChangeKg,
      };
    });
  }, [filteredSeries.strengthSeries, filteredSeries.bodyweightSeries]);

  const weekdayPerformanceData = useMemo(() => {
    const base = WEEKDAY_LABELS.map((weekday, index) => ({
      weekday,
      index,
      intakeTotal: 0,
      intakeCount: 0,
      burnTotal: 0,
      burnCount: 0,
      netTotal: 0,
      netCount: 0,
      strengthTotal: 0,
      strengthCount: 0,
    }));

    function weekdayIndexFromIso(dateIso: string) {
      return new Date(`${dateIso}T00:00:00`).getDay();
    }

    for (const point of filteredSeries.caloriesSeries) {
      const idx = weekdayIndexFromIso(point.date);
      if (!Number.isFinite(idx)) continue;
      base[idx].intakeTotal += point.value;
      base[idx].intakeCount += 1;
    }
    for (const point of filteredSeries.metabolicActivitySeries) {
      const idx = weekdayIndexFromIso(point.date);
      if (!Number.isFinite(idx)) continue;
      base[idx].burnTotal += point.value;
      base[idx].burnCount += 1;
    }
    for (const point of filteredSeries.netEnergySeries) {
      const idx = weekdayIndexFromIso(point.date);
      if (!Number.isFinite(idx)) continue;
      base[idx].netTotal += point.value;
      base[idx].netCount += 1;
    }
    for (const point of filteredSeries.strengthSeries) {
      const idx = weekdayIndexFromIso(point.date);
      if (!Number.isFinite(idx)) continue;
      base[idx].strengthTotal += point.value;
      base[idx].strengthCount += 1;
    }

    return base.map((row) => ({
      weekday: row.weekday,
      avgIntake: row.intakeCount > 0 ? row.intakeTotal / row.intakeCount : null,
      avgBurn: row.burnCount > 0 ? row.burnTotal / row.burnCount : null,
      avgNet: row.netCount > 0 ? row.netTotal / row.netCount : null,
      avgStrength: row.strengthCount > 0 ? row.strengthTotal / row.strengthCount : null,
      intakeCount: row.intakeCount,
      burnCount: row.burnCount,
      netCount: row.netCount,
      strengthCount: row.strengthCount,
    }));
  }, [
    filteredSeries.caloriesSeries,
    filteredSeries.metabolicActivitySeries,
    filteredSeries.netEnergySeries,
    filteredSeries.strengthSeries,
  ]);

  const fatSignal14DayData = useMemo(() => {
    const sorted = [...mergedTrendData].sort((a, b) => a.date.localeCompare(b.date));
    const rawSignal: Array<{ date: string; label: string; projected14dKg: number }> = [];

    for (const row of sorted) {
      const endDate = parseIsoDate(row.date);
      const startDate = addDays(endDate, -13);
      const windowRows = sorted.filter((entry) => {
        const entryDate = parseIsoDate(entry.date);
        return entryDate >= startDate && entryDate <= endDate;
      });

      const netValues = windowRows
        .map((entry) => entry.net)
        .filter((value): value is number => value != null && Number.isFinite(value));
      if (netValues.length < 5) continue;

      const netAvg = netValues.reduce((sum, value) => sum + value, 0) / netValues.length;
      const netProjectedDailyKg = netAvg / 7700;

      const weightRows = windowRows
        .filter((entry) => entry.weightKg != null && Number.isFinite(entry.weightKg))
        .sort((a, b) => a.date.localeCompare(b.date));
      let observedDailyKg = 0;
      if (weightRows.length >= 2) {
        const first = weightRows[0];
        const last = weightRows[weightRows.length - 1];
        const days =
          (parseIsoDate(last.date).getTime() - parseIsoDate(first.date).getTime()) /
          (1000 * 60 * 60 * 24);
        if (days > 0 && first.weightKg != null && last.weightKg != null) {
          observedDailyKg = (last.weightKg - first.weightKg) / days;
        }
      }

      // Blend expected energy-driven change with observed direction to avoid noisy jumps.
      const blendedDailyKg = (netProjectedDailyKg * 0.65) + (observedDailyKg * 0.35);
      rawSignal.push({
        date: row.date,
        label: row.label,
        projected14dKg: blendedDailyKg * 14,
      });
    }

    if (rawSignal.length === 0) return [];

    const alpha = 0.35;
    let prev = rawSignal[0].projected14dKg;
    return rawSignal.map((point, index) => {
      const smoothed = index === 0 ? point.projected14dKg : (alpha * point.projected14dKg) + ((1 - alpha) * prev);
      prev = smoothed;
      return {
        ...point,
        smoothedProjected14dKg: smoothed,
      };
    });
  }, [mergedTrendData]);

  const weightForecast14DayData = useMemo(() => {
    const sorted = [...mergedTrendData]
      .filter((row) => row.weightKg != null && Number.isFinite(row.weightKg))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 4) return [] as Array<{
      date: string;
      label: string;
      actualWeightKg: number | null;
      forecastWeightKg: number | null;
      forecastLowKg: number | null;
      forecastRangeKg: number | null;
      isForecast: boolean;
    }>;

    const latest = sorted[sorted.length - 1];
    const latestDate = parseIsoDate(latest.date);
    const latestWeightKg = latest.weightKg ?? null;
    if (latestWeightKg == null) return [];

    const recentWindowStart = addDays(latestDate, -13);
    const recentRows = mergedTrendData
      .filter((row) => {
        const rowDate = parseIsoDate(row.date);
        return rowDate >= recentWindowStart && rowDate <= latestDate;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const recentNet = recentRows
      .map((row) => row.net)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const avgRecentNet = recentNet.length >= 4
      ? recentNet.reduce((sum, value) => sum + value, 0) / recentNet.length
      : 0;
    const projectedDailyKgFromNet = avgRecentNet / 7700;

    const recentWeightRows = recentRows
      .filter((row) => row.weightKg != null && Number.isFinite(row.weightKg))
      .sort((a, b) => a.date.localeCompare(b.date));
    let observedDailyKg = 0;
    if (recentWeightRows.length >= 2) {
      const first = recentWeightRows[0];
      const last = recentWeightRows[recentWeightRows.length - 1];
      const days =
        (parseIsoDate(last.date).getTime() - parseIsoDate(first.date).getTime()) /
        (1000 * 60 * 60 * 24);
      if (days > 0 && first.weightKg != null && last.weightKg != null) {
        observedDailyKg = (last.weightKg - first.weightKg) / days;
      }
    }

    // Weighted blend keeps forecast grounded in both energy balance and observed direction.
    const blendedDailyKg = (projectedDailyKgFromNet * 0.65) + (observedDailyKg * 0.35);

    const dailyDeltas: number[] = [];
    for (let index = 1; index < recentWeightRows.length; index += 1) {
      const prev = recentWeightRows[index - 1];
      const current = recentWeightRows[index];
      if (prev.weightKg == null || current.weightKg == null) continue;
      const days =
        (parseIsoDate(current.date).getTime() - parseIsoDate(prev.date).getTime()) /
        (1000 * 60 * 60 * 24);
      if (days <= 0) continue;
      dailyDeltas.push((current.weightKg - prev.weightKg) / days);
    }
    const volatility = dailyDeltas.length > 0
      ? Math.sqrt(
          dailyDeltas.reduce((sum, delta) => sum + (delta * delta), 0) /
          dailyDeltas.length
        )
      : 0.08;

    const history = sorted.slice(-14).map((row) => ({
      date: row.date,
      label: toChartLabel(row.date),
      actualWeightKg: row.weightKg ?? null,
      forecastWeightKg: null,
      forecastLowKg: null,
      forecastRangeKg: null,
      isForecast: false,
    }));

    const forecast = Array.from({ length: 14 }, (_, idx) => {
      const day = idx + 1;
      const date = addDays(latestDate, day).toISOString().slice(0, 10);
      const center = latestWeightKg + (blendedDailyKg * day);
      const halfBand = Math.max(0.15, volatility * Math.sqrt(day) * 1.15);
      const low = center - halfBand;
      const high = center + halfBand;
      return {
        date,
        label: toChartLabel(date),
        actualWeightKg: null,
        forecastWeightKg: center,
        forecastLowKg: low,
        forecastRangeKg: high - low,
        isForecast: true,
      };
    });

    return [...history, ...forecast];
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

  const weeklyCoachSummary = useMemo(() => {
    const win = rangeInsights.achievements[0]?.title && rangeInsights.achievements[0]?.detail
      ? `${rangeInsights.achievements[0].title}: ${rangeInsights.achievements[0].detail}`
      : "Consistency is building. Keep your current routine steady this week.";

    const risk = rangeInsights.improvements[0] ?? "No major risk detected from current logs.";

    const bestPattern =
      rangeInsights.correlations
        .filter((item) => item.value != null)
        .sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0))[0] ?? null;
    const pattern = bestPattern
      ? `${bestPattern.label}: ${bestPattern.interpretation}.`
      : "Pattern signal is still weak. More overlap logs will improve detection.";

    const nextAction = rangeInsights.suggestions[0] ?? "Log weight, intake, burn, and workout today to sharpen tomorrow's guidance.";

    const expectedCounts = {
      weight: Math.max(3, Math.ceil((selectedRangeConfig.days ?? 30) * 0.4)),
      calories: Math.max(4, Math.ceil((selectedRangeConfig.days ?? 30) * 0.55)),
      burn: Math.max(4, Math.ceil((selectedRangeConfig.days ?? 30) * 0.55)),
      strength: Math.max(2, Math.ceil((selectedRangeConfig.days ?? 30) * 0.25)),
    };
    const adherenceRatios = [
      filteredSeries.bodyweightSeries.length / expectedCounts.weight,
      filteredSeries.caloriesSeries.length / expectedCounts.calories,
      filteredSeries.metabolicActivitySeries.length / expectedCounts.burn,
      filteredSeries.strengthSeries.length / expectedCounts.strength,
    ];
    const averageAdherence = adherenceRatios.reduce((sum, value) => sum + value, 0) / adherenceRatios.length;
    const confidence = averageAdherence >= 1
      ? "High confidence"
      : averageAdherence >= 0.65
        ? "Medium confidence"
        : "Low confidence";
    const confidenceDetail = `Data coverage: ${Math.round(Math.min(1.5, averageAdherence) * 100)}% of target logging in ${selectedRangeConfig.label}.`;

    return {
      win,
      risk,
      pattern,
      nextAction,
      confidence: `${confidence}. ${confidenceDetail}`,
    };
  }, [rangeInsights, filteredSeries, selectedRangeConfig.days, selectedRangeConfig.label]);

  const energyBreakdownChartData = useMemo(() => {
    const sourceCalories = data?.caloriesSeries ?? [];
    const sourceMaintenance = data?.maintenanceSeries ?? [];
    const sourceBurned = data?.metabolicActivitySeries ?? [];

    const byDate = new Map<
      string,
      {
        date: string;
        label: string;
        maintenance?: number;
        totalIntake?: number;
        caloriesBurned?: number;
      }
    >();

    for (const point of sourceMaintenance) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        maintenance: point.value,
      });
    }
    for (const point of sourceCalories) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        totalIntake: point.value,
      });
    }
    for (const point of sourceBurned) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        caloriesBurned: point.value,
      });
    }

    const allRows = Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => {
        const calorieDeficit =
          row.maintenance != null && row.totalIntake != null
            ? row.maintenance - row.totalIntake
            : null;
        const totalCalorieDeficit =
          calorieDeficit != null && row.caloriesBurned != null
            ? calorieDeficit + row.caloriesBurned
            : null;
        return {
          ...row,
          calorieDeficit,
          totalCalorieDeficit,
        };
      });

    const selectedRangeOption =
      ENERGY_BREAKDOWN_RANGE_OPTIONS.find((option) => option.id === energyBreakdownRange) ??
      ENERGY_BREAKDOWN_RANGE_OPTIONS[0];
    const cutoff = startOfDay(addDays(new Date(), -(selectedRangeOption.days - 1)));

    return allRows.filter((row) => {
      const rowDate = new Date(`${row.date}T00:00:00`);
      return rowDate >= cutoff;
    });
  }, [data?.caloriesSeries, data?.maintenanceSeries, data?.metabolicActivitySeries, energyBreakdownRange]);

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

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-zinc-700/70 bg-zinc-900/70 p-1">
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

        <div className="mt-4 rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-100">Weekly Coach Summary</h2>
            <p className="text-xs text-zinc-400">{selectedRangeConfig.label}</p>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-zinc-200"><span className="font-semibold text-emerald-300">Win:</span> {weeklyCoachSummary.win}</p>
            <p className="text-zinc-200"><span className="font-semibold text-rose-300">Risk:</span> {weeklyCoachSummary.risk}</p>
            <p className="text-zinc-200"><span className="font-semibold text-sky-300">Pattern:</span> {weeklyCoachSummary.pattern}</p>
            <p className="text-zinc-200"><span className="font-semibold text-amber-300">Next Action:</span> {weeklyCoachSummary.nextAction}</p>
            <p className="text-zinc-200"><span className="font-semibold text-violet-300">Confidence:</span> {weeklyCoachSummary.confidence}</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-100">Daily Energy Breakdown Trend</h2>
            <div className="inline-flex items-center gap-1 rounded-full border border-zinc-700/70 bg-zinc-900/70 p-1 text-xs">
              {ENERGY_BREAKDOWN_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setEnergyBreakdownRange(option.id)}
                  className={`rounded-full px-3 py-1 transition ${
                    energyBreakdownRange === option.id
                      ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                      : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 h-80 w-full">
            {energyBreakdownChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400">
                Not enough energy data for this range.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={energyBreakdownChartData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} />
                  <YAxis tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} width={56} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "10px" }}
                    labelStyle={{ color: "#e4e4e7" }}
                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.date || _label}
                    formatter={(value, name) => {
                      if (typeof value !== "number") return [value, name];
                      return [`${Math.round(value)} kcal`, name];
                    }}
                  />
                  <Legend wrapperStyle={{ color: "#d4d4d8", fontSize: "12px" }} />
                  <Line type="monotone" dataKey="maintenance" name="Maintenance Calories" stroke="#71717a" strokeWidth={2.1} dot={false} connectNulls />
                  <Line type="monotone" dataKey="totalIntake" name="Total Intake" stroke="#f97316" strokeWidth={2.4} dot={false} connectNulls />
                  <Line type="monotone" dataKey="calorieDeficit" name="Calorie Deficit" stroke="#22c55e" strokeWidth={2.2} strokeDasharray="5 3" dot={false} connectNulls />
                  <Line type="monotone" dataKey="caloriesBurned" name="Calories Burned" stroke="#0ea5e9" strokeWidth={2.2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="totalCalorieDeficit" name="Total Calorie Deficit" stroke="#16a34a" strokeWidth={2.8} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Insights Visuals</h2>
            <p className="text-xs text-zinc-400">2 rows • 4 charts each</p>
          </div>

          <div className="inline-flex w-full flex-wrap items-center gap-2 rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-2 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setTopVisualTab("weight_net_overlay")}
              className={`rounded-full px-3 py-1 text-xs transition ${
                topVisualTab === "weight_net_overlay"
                  ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                  : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              Weight vs Net
            </button>
            <button
              type="button"
              onClick={() => setTopVisualTab("maintenance_intake_burn")}
              className={`rounded-full px-3 py-1 text-xs transition ${
                topVisualTab === "maintenance_intake_burn"
                  ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                  : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              Intake vs Burn
            </button>
            <button
              type="button"
              onClick={() => setTopVisualTab("bmi_trend")}
              className={`rounded-full px-3 py-1 text-xs transition ${
                topVisualTab === "bmi_trend"
                  ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                  : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              BMI Trend
            </button>
            <button
              type="button"
              onClick={() => setTopVisualTab("active_burn_consistency")}
              className={`rounded-full px-3 py-1 text-xs transition ${
                topVisualTab === "active_burn_consistency"
                  ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                  : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              Burn Consistency
            </button>
          </div>

          <>
              {topVisualTab === "weight_net_overlay" && (
              <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100">Weight vs 7-day Net Energy Overlay</h3>
                  <p className="text-xs text-zinc-400">{selectedRangeConfig.label}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Compare bodyweight with smoothed net energy; dashed line shifts net by +3 days to help reveal lagged effects.
                </p>
                <div className="mt-3 h-72 w-full">
                  {weightVsNetOverlayData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400">
                      Not enough weight/net data yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weightVsNetOverlayData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                        <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} />
                        <YAxis
                          yAxisId="weight"
                          tick={{ fill: "#67e8f9", fontSize: 11 }}
                          tickLine={false}
                          axisLine={{ stroke: "#0891b2" }}
                          width={56}
                        />
                        <YAxis
                          yAxisId="energy"
                          orientation="right"
                          tick={{ fill: "#fcd34d", fontSize: 11 }}
                          tickLine={false}
                          axisLine={{ stroke: "#d97706" }}
                          width={56}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "10px" }}
                          labelStyle={{ color: "#e4e4e7" }}
                          labelFormatter={(_label, payload) => payload?.[0]?.payload?.date || _label}
                          formatter={(value, name) => {
                            if (typeof value !== "number") return [value, name];
                            if (name?.toString().toLowerCase().includes("weight")) return [`${value.toFixed(1)} kg`, name];
                            return [`${Math.round(value)} kcal`, name];
                          }}
                        />
                        <Legend wrapperStyle={{ color: "#d4d4d8", fontSize: "12px" }} />
                        <Line
                          type="monotone"
                          dataKey="weightKg"
                          name="Weight (kg)"
                          yAxisId="weight"
                          stroke="#22d3ee"
                          strokeWidth={2.5}
                          dot={{ r: 2 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="net7d"
                          name="Net Energy 7d Avg"
                          yAxisId="energy"
                          stroke="#38bdf8"
                          strokeWidth={2.5}
                          dot={false}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="net7dLag3"
                          name="Net Energy 7d Avg (+3d)"
                          yAxisId="energy"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeDasharray="5 4"
                          dot={false}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              )}

              {topVisualTab === "maintenance_intake_burn" && (
              <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100">Maintenance vs Intake vs Burn (Stacked Daily)</h3>
                  <p className="text-xs text-zinc-400">{selectedRangeConfig.label}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Daily intake bar compared against stacked burn components (maintenance + active burn) for quick balance reading.
                </p>
                <div className="mt-3 h-72 w-full">
                  {maintenanceVsIntakeVsBurnData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400">
                      Not enough intake/burn data yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={maintenanceVsIntakeVsBurnData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                        <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} />
                        <YAxis tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} width={56} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "10px" }}
                          labelStyle={{ color: "#e4e4e7" }}
                          labelFormatter={(_label, payload) => payload?.[0]?.payload?.date || _label}
                          formatter={(value, name) => {
                            if (typeof value !== "number") return [value, name];
                            return [`${Math.round(value)} kcal`, name];
                          }}
                        />
                        <Legend wrapperStyle={{ color: "#d4d4d8", fontSize: "12px" }} />
                        <Bar dataKey="intake" name="Intake" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="maintenance" name="Maintenance Burn" stackId="burn" fill="#22c55e" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="activeBurn" name="Active Burn" stackId="burn" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              )}

              {topVisualTab === "bmi_trend" && (
              <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100">BMI Trend with Category Bands</h3>
                  <p className="text-xs text-zinc-400">{selectedRangeConfig.label}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  BMI over time with shaded category zones (underweight, normal, overweight, obese).
                </p>
                <div className="mt-3 h-72 w-full">
                  {!(data?.profileHeightCm && data.profileHeightCm > 0) ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400">
                      Add height in Profile to enable BMI trend.
                    </div>
                  ) : bmiTrendData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400">
                      Not enough bodyweight logs yet for BMI trend.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={bmiTrendData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                        <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} />
                        <YAxis
                          tick={{ fill: "#a1a1aa", fontSize: 12 }}
                          tickLine={false}
                          axisLine={{ stroke: "#52525b" }}
                          width={56}
                          domain={bmiYAxisDomain}
                          tickFormatter={(value: number) => value.toFixed(1)}
                        />
                        <ReferenceArea y1={0} y2={18.5} fill="#0ea5e9" fillOpacity={0.12} />
                        <ReferenceArea y1={18.5} y2={24.9} fill="#22c55e" fillOpacity={0.12} />
                        <ReferenceArea y1={25} y2={29.9} fill="#f59e0b" fillOpacity={0.14} />
                        <ReferenceArea y1={30} y2={60} fill="#ef4444" fillOpacity={0.12} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "10px" }}
                          labelStyle={{ color: "#e4e4e7" }}
                          labelFormatter={(_label, payload) => payload?.[0]?.payload?.date || _label}
                          formatter={(value, name) => {
                            if (typeof value !== "number") return [value, name];
                            return [value.toFixed(1), name];
                          }}
                        />
                        <Legend wrapperStyle={{ color: "#d4d4d8", fontSize: "12px" }} />
                        <Line
                          type="monotone"
                          dataKey="bmi"
                          name="BMI"
                          stroke="#f97316"
                          strokeWidth={2.8}
                          dot={{ r: 2 }}
                          activeDot={{ r: 5 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-400/80" />Underweight (&lt;18.5)</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400/80" />Normal (18.5-24.9)</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400/80" />Overweight (25.0-29.9)</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400/80" />Obese (30+)</span>
                </div>
              </div>

              )}

              {topVisualTab === "active_burn_consistency" && (
              <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100">Active Burn Consistency Score</h3>
                  <p className="text-xs text-zinc-400">{selectedRangeConfig.label}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Weekly consistency from watch activity logs (days logged out of 7), with average active burn per logged day.
                </p>
                <div className="mt-3 h-72 w-full">
                  {activeBurnConsistencyWeeklyData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400">
                      No active burn logs yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={activeBurnConsistencyWeeklyData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                        <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} />
                        <YAxis
                          yAxisId="score"
                          domain={[0, 100]}
                          tick={{ fill: "#86efac", fontSize: 11 }}
                          tickLine={false}
                          axisLine={{ stroke: "#16a34a" }}
                          width={56}
                        />
                        <YAxis
                          yAxisId="burn"
                          orientation="right"
                          tick={{ fill: "#fcd34d", fontSize: 11 }}
                          tickLine={false}
                          axisLine={{ stroke: "#d97706" }}
                          width={56}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "10px" }}
                          labelStyle={{ color: "#e4e4e7" }}
                          labelFormatter={(_label, payload) => payload?.[0]?.payload?.weekStart || _label}
                          formatter={(value, name, item) => {
                            if (typeof value !== "number") return [value, name];
                            if (name?.toString().toLowerCase().includes("consistency")) {
                              const days = item?.payload?.loggedDays;
                              return [`${value}%${Number.isFinite(days) ? ` (${days}/7 days)` : ""}`, name];
                            }
                            return [`${Math.round(value)} kcal`, name];
                          }}
                        />
                        <Legend wrapperStyle={{ color: "#d4d4d8", fontSize: "12px" }} />
                        <Bar
                          yAxisId="score"
                          dataKey="consistencyScore"
                          name="Consistency Score"
                          fill="#22c55e"
                          radius={[4, 4, 0, 0]}
                        />
                        <Line
                          yAxisId="burn"
                          type="monotone"
                          dataKey="avgActiveBurn"
                          name="Avg Active Burn"
                          stroke="#f59e0b"
                          strokeWidth={2.5}
                          dot={{ r: 2 }}
                          connectNulls
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              )}

              <div className="inline-flex w-full flex-wrap items-center gap-2 rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-2 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setBottomVisualTab("strength_weight_change")}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    bottomVisualTab === "strength_weight_change"
                      ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                      : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  Strength vs Weight
                </button>
                <button
                  type="button"
                  onClick={() => setBottomVisualTab("weekday_pattern")}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    bottomVisualTab === "weekday_pattern"
                      ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                      : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  Weekday Pattern
                </button>
                <button
                  type="button"
                  onClick={() => setBottomVisualTab("fat_signal_14d")}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    bottomVisualTab === "fat_signal_14d"
                      ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                      : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  14-Day Signal
                </button>
                <button
                  type="button"
                  onClick={() => setBottomVisualTab("forecast_14d")}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    bottomVisualTab === "forecast_14d"
                      ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                      : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  Forecast
                </button>
              </div>

              {bottomVisualTab === "strength_weight_change" && (
              <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100">Workout Strength vs Weight Change</h3>
                  <p className="text-xs text-zinc-400">{selectedRangeConfig.label}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Dual-axis trend of strength growth (%) and bodyweight change (kg) from the first visible baseline date.
                </p>
                <div className="mt-3 h-72 w-full">
                  {strengthVsWeightChangeData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400">
                      Not enough strength/weight data yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={strengthVsWeightChangeData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                        <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} />
                        <YAxis
                          yAxisId="strength"
                          tick={{ fill: "#c4b5fd", fontSize: 11 }}
                          tickLine={false}
                          axisLine={{ stroke: "#8b5cf6" }}
                          width={56}
                          tickFormatter={(value: number) => `${value.toFixed(0)}%`}
                        />
                        <YAxis
                          yAxisId="weight"
                          orientation="right"
                          tick={{ fill: "#67e8f9", fontSize: 11 }}
                          tickLine={false}
                          axisLine={{ stroke: "#0891b2" }}
                          width={56}
                          tickFormatter={(value: number) => `${value.toFixed(1)}kg`}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "10px" }}
                          labelStyle={{ color: "#e4e4e7" }}
                          labelFormatter={(_label, payload) => payload?.[0]?.payload?.date || _label}
                          formatter={(value, name) => {
                            if (typeof value !== "number") return [value, name];
                            if (name?.toString().toLowerCase().includes("strength")) return [`${value.toFixed(1)}%`, name];
                            return [`${value.toFixed(2)} kg`, name];
                          }}
                        />
                        <Legend wrapperStyle={{ color: "#d4d4d8", fontSize: "12px" }} />
                        <Line
                          yAxisId="strength"
                          type="monotone"
                          dataKey="strengthGrowthPct"
                          name="Strength Growth"
                          stroke="#a78bfa"
                          strokeWidth={2.5}
                          dot={{ r: 2 }}
                          connectNulls
                        />
                        <Line
                          yAxisId="weight"
                          type="monotone"
                          dataKey="weightChangeKg"
                          name="Weight Change"
                          stroke="#22d3ee"
                          strokeWidth={2.5}
                          dot={{ r: 2 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              )}

              {bottomVisualTab === "weekday_pattern" && (
              <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100">Day-of-Week Performance Pattern</h3>
                  <p className="text-xs text-zinc-400">{selectedRangeConfig.label}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Average intake, burn, net energy, and strength by weekday to highlight your best and weakest patterns.
                </p>
                <div className="mt-3 h-80 w-full">
                  {weekdayPerformanceData.every(
                    (row) =>
                      row.avgIntake == null &&
                      row.avgBurn == null &&
                      row.avgNet == null &&
                      row.avgStrength == null
                  ) ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400">
                      Not enough weekly pattern data yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={weekdayPerformanceData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                        <XAxis dataKey="weekday" tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} />
                        <YAxis
                          yAxisId="kcal"
                          tick={{ fill: "#fcd34d", fontSize: 11 }}
                          tickLine={false}
                          axisLine={{ stroke: "#d97706" }}
                          width={56}
                        />
                        <YAxis
                          yAxisId="strength"
                          orientation="right"
                          tick={{ fill: "#c4b5fd", fontSize: 11 }}
                          tickLine={false}
                          axisLine={{ stroke: "#8b5cf6" }}
                          width={56}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "10px" }}
                          labelStyle={{ color: "#e4e4e7" }}
                          formatter={(value, name, item) => {
                            if (typeof value !== "number") return [value, name];
                            if (name?.toString().toLowerCase().includes("strength")) {
                              const count = item?.payload?.strengthCount;
                              return [`${value.toFixed(1)}${Number.isFinite(count) ? ` (n=${count})` : ""}`, name];
                            }
                            const key =
                              name === "Avg Intake"
                                ? "intakeCount"
                                : name === "Avg Burn"
                                  ? "burnCount"
                                  : "netCount";
                            const count = item?.payload?.[key];
                            return [`${Math.round(value)} kcal${Number.isFinite(count) ? ` (n=${count})` : ""}`, name];
                          }}
                        />
                        <Legend wrapperStyle={{ color: "#d4d4d8", fontSize: "12px" }} />
                        <Bar
                          yAxisId="kcal"
                          dataKey="avgIntake"
                          name="Avg Intake"
                          fill="#f59e0b"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          yAxisId="kcal"
                          dataKey="avgBurn"
                          name="Avg Burn"
                          fill="#22c55e"
                          radius={[4, 4, 0, 0]}
                        />
                        <Line
                          yAxisId="kcal"
                          type="monotone"
                          dataKey="avgNet"
                          name="Avg Net"
                          stroke="#38bdf8"
                          strokeWidth={2.5}
                          dot={{ r: 2 }}
                          connectNulls
                        />
                        <Line
                          yAxisId="strength"
                          type="monotone"
                          dataKey="avgStrength"
                          name="Avg Strength"
                          stroke="#a78bfa"
                          strokeWidth={2.5}
                          dot={{ r: 2 }}
                          strokeDasharray="5 3"
                          connectNulls
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              )}

              {bottomVisualTab === "fat_signal_14d" && (
              <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100">Rolling 14-Day Fat-Loss/Fat-Gain Signal</h3>
                  <p className="text-xs text-zinc-400">{selectedRangeConfig.label}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Smoothed projection from 14-day net energy trend plus observed weight direction. Negative means fat-loss signal, positive means fat-gain signal.
                </p>
                <div className="mt-3 h-72 w-full">
                  {fatSignal14DayData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400">
                      Not enough net/weight overlap yet for 14-day signal.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={fatSignal14DayData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                        <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} />
                        <YAxis
                          tick={{ fill: "#a1a1aa", fontSize: 12 }}
                          tickLine={false}
                          axisLine={{ stroke: "#52525b" }}
                          width={56}
                          tickFormatter={(value: number) => `${value.toFixed(1)}kg`}
                        />
                        <ReferenceLine y={0} stroke="#a1a1aa" strokeDasharray="4 4" />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "10px" }}
                          labelStyle={{ color: "#e4e4e7" }}
                          labelFormatter={(_label, payload) => payload?.[0]?.payload?.date || _label}
                          formatter={(value) => {
                            if (typeof value !== "number") return [value, "14d Signal"];
                            const direction = value < 0 ? "Fat-loss signal" : value > 0 ? "Fat-gain signal" : "Neutral";
                            return [`${value.toFixed(2)} kg (${direction})`, "14d Signal"];
                          }}
                        />
                        <Legend wrapperStyle={{ color: "#d4d4d8", fontSize: "12px" }} />
                        <Line
                          type="monotone"
                          dataKey="smoothedProjected14dKg"
                          name="14d Signal"
                          stroke="#f97316"
                          strokeWidth={2.8}
                          dot={{ r: 2 }}
                          activeDot={{ r: 5 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              )}

              {bottomVisualTab === "forecast_14d" && (
              <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100">Forecast (Next 7–14 Days)</h3>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Estimate</p>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Projected bodyweight path using recent rolling trends, shown with an uncertainty band. This is guidance, not a guarantee.
                </p>
                <div className="mt-3 h-72 w-full">
                  {weightForecast14DayData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400">
                      Not enough recent weight/net trend data for forecast.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={weightForecast14DayData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                        <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} />
                        <YAxis
                          tick={{ fill: "#a1a1aa", fontSize: 12 }}
                          tickLine={false}
                          axisLine={{ stroke: "#52525b" }}
                          width={56}
                          tickFormatter={(value: number) => `${value.toFixed(1)}kg`}
                        />
                        <ReferenceLine y={weightForecast14DayData.findLast((row) => row.actualWeightKg != null)?.actualWeightKg ?? 0} stroke="#52525b" strokeDasharray="3 3" />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "10px" }}
                          labelStyle={{ color: "#e4e4e7" }}
                          labelFormatter={(_label, payload) => payload?.[0]?.payload?.date || _label}
                          formatter={(value, name, item) => {
                            if (typeof value !== "number") return [value, name];
                            if (name === "Forecast Band") {
                              const low = item?.payload?.forecastLowKg;
                              const range = item?.payload?.forecastRangeKg;
                              if (typeof low === "number" && typeof range === "number") {
                                const high = low + range;
                                return [`${low.toFixed(2)} to ${high.toFixed(2)} kg`, name];
                              }
                            }
                            return [`${value.toFixed(2)} kg`, name];
                          }}
                        />
                        <Legend wrapperStyle={{ color: "#d4d4d8", fontSize: "12px" }} />
                        <Area
                          type="monotone"
                          dataKey="forecastLowKg"
                          name="Forecast Base"
                          stackId="forecastBand"
                          stroke="none"
                          fill="transparent"
                          connectNulls
                        />
                        <Area
                          type="monotone"
                          dataKey="forecastRangeKg"
                          name="Forecast Band"
                          stackId="forecastBand"
                          stroke="none"
                          fill="#f59e0b"
                          fillOpacity={0.18}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="actualWeightKg"
                          name="Actual Weight"
                          stroke="#22d3ee"
                          strokeWidth={2.5}
                          dot={{ r: 2 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="forecastWeightKg"
                          name="Forecast Weight"
                          stroke="#f97316"
                          strokeWidth={2.5}
                          strokeDasharray="6 4"
                          dot={false}
                          connectNulls
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              )}

          </>
        </div>

      </div>
    </div>
  );
}
