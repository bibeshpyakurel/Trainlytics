"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { InsightsData } from "@/lib/insightsTypes";
import { STORAGE_KEYS } from "@/lib/preferences";
import { API_ROUTES, ROUTES, buildLoginRedirectPath } from "@/lib/routes";

type AssistantMessage = { role: "user" | "assistant"; text: string };

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

const QUICK_PROMPTS = [
  "How are calories affecting my strength lately?",
  "What should I improve this week?",
  "Summarize my top achievement this month",
  "Is my bodyweight trend healthy with my strength trend?",
];

function toChartLabel(dateIso: string) {
  const date = new Date(`${dateIso}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function InsightsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [data, setData] = useState<InsightsData | null>(null);
  const [question, setQuestion] = useState("");
  const [assistantThread, setAssistantThread] = useState<AssistantMessage[]>([]);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);

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

  const mergedTrendData = useMemo(() => {
    const byDate = new Map<string, { date: string; label: string; weightKg?: number; calories?: number; strength?: number }>();

    for (const point of data?.bodyweightSeries ?? []) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        weightKg: point.value,
      });
    }

    for (const point of data?.caloriesSeries ?? []) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        calories: point.value,
      });
    }

    for (const point of data?.strengthSeries ?? []) {
      byDate.set(point.date, {
        ...(byDate.get(point.date) ?? { date: point.date, label: toChartLabel(point.date) }),
        strength: point.value,
      });
    }

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const aiContext = useMemo(() => {
    if (!data) return null;
    return {
      facts: data.facts,
      correlations: data.correlations,
      improvements: data.improvements,
      achievements: data.achievements,
      suggestions: data.suggestions,
    };
  }, [data]);

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
  }, []);

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

    const recognition = new speechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) {
        setQuestion((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    recognition.onerror = () => {
      setAssistantError("Voice input failed. Please try again.");
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    setAssistantError(null);
    setIsListening(true);
    recognition.start();
  }

  async function askInsightsAssistant() {
    const trimmed = question.trim();
    if (!trimmed || !data || !aiContext) return;

    setAssistantError(null);
    setAssistantLoading(true);

    const nextThread: AssistantMessage[] = [...assistantThread, { role: "user", text: trimmed }];
    setAssistantThread(nextThread);
    setQuestion("");

    try {
      const response = await fetch(API_ROUTES.insightsAi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          context: aiContext,
          history: assistantThread,
        }),
      });

      const responseData = (await response.json()) as { answer?: string; error?: string };
      if (!response.ok || !responseData.answer) {
        throw new Error(responseData.error ?? "Failed to get AI response.");
      }

      setAssistantThread((prev) => [...prev, { role: "assistant", text: responseData.answer ?? "" }]);
      speak(responseData.answer);
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : "Failed to get AI response.");
    } finally {
      setAssistantLoading(false);
    }
  }

  function applyQuickPrompt(prompt: string) {
    setQuestion(prompt);
  }

  function toggleSpeakReplies() {
    setSpeakReplies((value) => {
      const nextValue = !value;
      localStorage.setItem(STORAGE_KEYS.insightsSpeakReplies, String(nextValue));
      return nextValue;
    });
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
          We connect bodyweight, calories, and strength trends to surface what is working and where to improve.
        </p>

        {msg && <p className="mt-4 text-sm text-red-300">{msg}</p>}

        <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-[radial-gradient(circle_at_15%_15%,rgba(245,158,11,0.16),transparent_32%),radial-gradient(circle_at_85%_20%,rgba(59,130,246,0.14),transparent_35%),rgba(24,24,27,0.74)] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Insights AI Assistant</h2>
              <p className="mt-1 text-sm text-zinc-300">
                Ask about trends, weak spots, and next actions. Type or talk.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700/70 bg-zinc-900/70 px-3 py-1 text-xs text-zinc-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              AI ready with your history
            </div>
          </div>

          {assistantError && <p className="mt-3 text-xs text-red-300">{assistantError}</p>}

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

          <div className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-2xl border border-zinc-700/70 bg-zinc-950/55 p-3">
            {assistantThread.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-700/70 bg-zinc-900/40 px-3 py-3 text-sm text-zinc-400">
                Try one of the quick prompts above, or ask anything about your calories, bodyweight, and strength history.
              </div>
            ) : (
              assistantThread.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line ${
                      message.role === "user"
                        ? "bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                        : "border border-zinc-700/70 bg-zinc-900/90 text-zinc-200"
                    }`}
                  >
                    <p className={`text-[10px] uppercase tracking-wide ${message.role === "user" ? "text-black/80" : "text-zinc-400"}`}>
                      {message.role === "user" ? "You" : "Insights AI"}
                    </p>
                    <p className="mt-1 leading-relaxed">{message.text}</p>
                  </div>
                </div>
              ))
            )}
            {assistantLoading && (
              <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-700/70 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />
                Insights AI is thinking...
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
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
              onClick={startVoiceInput}
              disabled={!speechSupported || isListening || assistantLoading}
              className="rounded-xl border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {isListening ? "Listening..." : "🎙️ Talk"}
            </button>
            <button
              type="button"
              onClick={toggleSpeakReplies}
              className="rounded-xl border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
            >
              {speakReplies ? "🔊 On" : "🔈 Off"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(data?.facts ?? []).map((fact) => (
            <div key={fact.label} className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-4 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-wide text-zinc-400">{fact.label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{loading ? "..." : fact.value}</p>
              <p className="mt-1 text-xs text-zinc-400">{fact.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Cross-Metric Trend</h2>
            <p className="text-xs text-zinc-400">Bodyweight (kg), Calories (kcal), Strength score</p>
          </div>

          <div className="mt-4 h-80 w-full">
            {mergedTrendData.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400">
                Not enough data yet for trend chart.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mergedTrendData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} />
                  <YAxis tick={{ fill: "#a1a1aa", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#52525b" }} width={56} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "10px" }}
                    labelStyle={{ color: "#e4e4e7" }}
                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.date || _label}
                  />
                  <Legend wrapperStyle={{ color: "#d4d4d8", fontSize: "12px" }} />
                  <Line type="monotone" dataKey="weightKg" name="Weight (kg)" stroke="#22d3ee" strokeWidth={2.5} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="calories" name="Calories" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="strength" name="Strength" stroke="#a78bfa" strokeWidth={2.5} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
            <h2 className="text-lg font-semibold text-white">Correlation Snapshot</h2>
            <div className="mt-3 space-y-3">
              {(data?.correlations ?? []).map((item) => (
                <div key={item.label} className="rounded-xl border border-zinc-700/70 bg-zinc-950/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-100">{item.label}</p>
                    <p className="text-sm font-semibold text-amber-300">
                      {item.value != null ? item.value.toFixed(2) : "—"}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-zinc-300">{item.interpretation}</p>
                  <p className="mt-1 text-xs text-zinc-500">Overlap days: {item.overlapDays}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
            <h2 className="text-lg font-semibold text-white">Where To Improve</h2>
            <div className="mt-3 space-y-2">
              {(data?.improvements ?? []).map((item) => (
                <p key={item} className="rounded-xl border border-zinc-700/70 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200">
                  {item}
                </p>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
            <h2 className="text-lg font-semibold text-white">Top Achievements</h2>
            <div className="mt-3 space-y-3">
              {(data?.achievements ?? []).map((item) => (
                <div key={`${item.period}-${item.title}`} className="rounded-xl border border-zinc-700/70 bg-zinc-950/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-400">{item.period}</p>
                  <p className="mt-1 text-sm font-medium text-zinc-100">{item.title}</p>
                  <p className="mt-1 text-xs text-zinc-300">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
            <h2 className="text-lg font-semibold text-white">Suggestions</h2>
            <div className="mt-3 space-y-2">
              {(data?.suggestions ?? []).map((item) => (
                <p key={item} className="rounded-xl border border-zinc-700/70 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200">
                  {item}
                </p>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
