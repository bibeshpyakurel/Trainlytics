"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TABLES } from "@/lib/dbNames";
import { ROUTES } from "@/lib/routes";
import {
  DEFAULT_EXERCISE_SEEDS,
  ensureDefaultExercisesForUser,
  seedChosenExercisesForUser,
} from "@/lib/defaultExercises";
import { DEFAULT_SPLIT_NAMES, ensureUserSplits, normalizeSplitName } from "@/lib/splits";
import type { MetricType, Split } from "@/features/log/types";
import GradientButton from "@/shared/ui/GradientButton";
import ModalSheet from "@/shared/ui/ModalSheet";

type Step = "days" | "exercises" | "sets";

type ChosenExercise = {
  name: string;
  split: Split;
  muscleGroup: string;
  metricType: MetricType;
};

const FIELD_CLASS =
  "min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none ring-amber-300/70 placeholder:text-zinc-600 focus:ring-2";

/** Suggestions come from the standard catalog, grouped by the day they belong to. */
function suggestionsFor(split: Split) {
  return DEFAULT_EXERCISE_SEEDS.filter((seed) => seed.split === split);
}

export default function OnboardingWizard() {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>("days");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [days, setDays] = useState<Split[]>([...DEFAULT_SPLIT_NAMES]);
  const [customDay, setCustomDay] = useState("");
  const [chosen, setChosen] = useState<ChosenExercise[]>([]);
  const [customExercise, setCustomExercise] = useState<Record<string, string>>({});
  const [defaultSets, setDefaultSets] = useState(3);

  const isAuthRoute =
    pathname === ROUTES.login ||
    pathname === ROUTES.signup ||
    pathname === ROUTES.forgotPassword ||
    pathname === ROUTES.sessionExpired ||
    pathname === ROUTES.launch ||
    pathname === ROUTES.signout;

  useEffect(() => {
    if (isAuthRoute) return;
    let isMounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!isMounted || !session) return;

      // A user with no exercises has never set anything up.
      const { count, error: countError } = await supabase
        .from(TABLES.exercises)
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.user.id);

      if (!isMounted || countError || (count ?? 0) > 0) return;

      setUserId(session.user.id);
      setIsOpen(true);
    })();

    return () => {
      isMounted = false;
    };
  }, [isAuthRoute, pathname]);

  const chosenByDay = useMemo(() => {
    const map = new Map<Split, ChosenExercise[]>();
    for (const entry of chosen) {
      map.set(entry.split, [...(map.get(entry.split) ?? []), entry]);
    }
    return map;
  }, [chosen]);

  function toggleDay(day: Split) {
    setDays((current) =>
      current.includes(day) ? current.filter((entry) => entry !== day) : [...current, day]
    );
  }

  function addCustomDay() {
    const name = normalizeSplitName(customDay);
    if (!name || days.includes(name)) return;
    setDays((current) => [...current, name]);
    setCustomDay("");
  }

  function toggleExercise(entry: ChosenExercise) {
    setChosen((current) => {
      const exists = current.some((item) => item.name === entry.name && item.split === entry.split);
      return exists
        ? current.filter((item) => !(item.name === entry.name && item.split === entry.split))
        : [...current, entry];
    });
  }

  function addCustomExercise(day: Split) {
    const name = (customExercise[day] ?? "").trim();
    if (!name) return;
    setChosen((current) => [
      ...current,
      { name, split: day, muscleGroup: day, metricType: "WEIGHTED_REPS" },
    ]);
    setCustomExercise((current) => ({ ...current, [day]: "" }));
  }

  async function finish(useStandard: boolean) {
    if (!userId) return;
    setError(null);
    setIsBusy(true);

    if (useStandard) {
      const splitsResult = await ensureUserSplits(userId, DEFAULT_SPLIT_NAMES);
      if (!splitsResult.ok) {
        setIsBusy(false);
        setError(splitsResult.message);
        return;
      }
      const seedError = await ensureDefaultExercisesForUser(userId);
      setIsBusy(false);
      if (seedError) {
        setError(seedError);
        return;
      }
      setIsOpen(false);
      window.location.reload();
      return;
    }

    const splitsResult = await ensureUserSplits(userId, days);
    if (!splitsResult.ok) {
      setIsBusy(false);
      setError(splitsResult.message);
      return;
    }

    const seedError = await seedChosenExercisesForUser(
      userId,
      chosen.map((entry) => ({ ...entry, defaultSets }))
    );
    setIsBusy(false);

    if (seedError) {
      setError(seedError);
      return;
    }

    setIsOpen(false);
    window.location.reload();
  }

  if (!isOpen) return null;

  const canContinue =
    step === "days" ? days.length > 0 : step === "exercises" ? chosen.length > 0 : true;

  return (
    <ModalSheet>
      <div className="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-2xl border border-zinc-700 bg-zinc-900 shadow-2xl sm:rounded-2xl">
        <div className="border-b border-zinc-800 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
            Set up your training
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">
            {step === "days" ? "Which days do you train?" : step === "exercises" ? "What do you do on each day?" : "How many sets?"}
          </h3>
          <p className="mt-1 text-sm text-zinc-400">
            {step === "days"
              ? "Pick the ones you use, rename or add your own later."
              : step === "exercises"
                ? "Tick the ones you do. You can add more any time."
                : "This is just the starting number — you can add or remove sets while logging."}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          {step === "days" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[...new Set([...DEFAULT_SPLIT_NAMES, ...days])].map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`min-h-11 rounded-xl border px-3 text-sm font-semibold capitalize transition ${
                      days.includes(day)
                        ? "border-amber-300/70 bg-amber-400/10 text-amber-200"
                        : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    {days.includes(day) ? "✓ " : ""}
                    {day}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  value={customDay}
                  onChange={(e) => setCustomDay(e.target.value)}
                  maxLength={40}
                  placeholder="Add your own — e.g. arms"
                  aria-label="New training day"
                  className={FIELD_CLASS}
                />
                <button
                  type="button"
                  onClick={addCustomDay}
                  disabled={!customDay.trim()}
                  className="min-h-11 shrink-0 rounded-xl border border-emerald-400/60 px-4 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </>
          )}

          {step === "exercises" && (
            <div className="space-y-5">
              {days.map((day) => {
                const suggestions = suggestionsFor(day);
                const picked = chosenByDay.get(day) ?? [];

                return (
                  <div key={day} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                    <p className="text-sm font-semibold capitalize text-zinc-100">{day}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{picked.length} selected</p>

                    {suggestions.length > 0 ? (
                      <div className="mt-3 space-y-1">
                        {suggestions.map((seed) => {
                          const isPicked = chosen.some(
                            (item) => item.name === seed.name && item.split === day
                          );
                          return (
                            <button
                              key={seed.name}
                              type="button"
                              onClick={() =>
                                toggleExercise({
                                  name: seed.name,
                                  split: day,
                                  muscleGroup: seed.muscleGroup,
                                  metricType: seed.metricType,
                                })
                              }
                              className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition ${
                                isPicked ? "bg-amber-400/10 text-amber-200" : "text-zinc-300 hover:bg-zinc-800"
                              }`}
                            >
                              <span className="w-4">{isPicked ? "✓" : ""}</span>
                              <span className="min-w-0 truncate">{seed.name}</span>
                              <span className="ml-auto shrink-0 text-xs text-zinc-600">{seed.muscleGroup}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-zinc-500">
                        No suggestions for a custom day — add your own below.
                      </p>
                    )}

                    {picked
                      .filter((entry) => !suggestions.some((seed) => seed.name === entry.name))
                      .map((entry) => (
                        <p key={entry.name} className="mt-1 text-sm text-amber-200">
                          ✓ {entry.name}
                        </p>
                      ))}

                    <div className="mt-3 flex gap-2">
                      <input
                        value={customExercise[day] ?? ""}
                        onChange={(e) =>
                          setCustomExercise((current) => ({ ...current, [day]: e.target.value }))
                        }
                        maxLength={80}
                        placeholder="Add your own exercise"
                        aria-label={`Add an exercise to ${day}`}
                        className={FIELD_CLASS}
                      />
                      <button
                        type="button"
                        onClick={() => addCustomExercise(day)}
                        disabled={!(customExercise[day] ?? "").trim()}
                        className="min-h-11 shrink-0 rounded-xl border border-emerald-400/60 px-4 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step === "sets" && (
            <div className="flex items-center justify-center gap-4 py-6">
              <button
                type="button"
                onClick={() => setDefaultSets((current) => Math.max(1, current - 1))}
                aria-label="One fewer set"
                className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-700 text-2xl text-zinc-300 transition hover:bg-zinc-800"
              >
                −
              </button>
              <div className="text-center">
                <p className="text-4xl font-semibold text-white">{defaultSets}</p>
                <p className="text-xs uppercase tracking-wide text-zinc-500">sets per exercise</p>
              </div>
              <button
                type="button"
                onClick={() => setDefaultSets((current) => Math.min(20, current + 1))}
                aria-label="One more set"
                className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-700 text-2xl text-zinc-300 transition hover:bg-zinc-800"
              >
                +
              </button>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

          <button
            type="button"
            onClick={() => void finish(true)}
            disabled={isBusy}
            className="mt-6 min-h-11 w-full rounded-xl border border-dashed border-zinc-700 text-xs font-semibold text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-900 disabled:opacity-60"
          >
            Skip — use the standard push / pull / legs / core setup
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-800 p-4">
          <button
            type="button"
            onClick={() => setStep(step === "sets" ? "exercises" : "days")}
            disabled={isBusy || step === "days"}
            className="min-h-11 rounded-md border border-zinc-600 px-4 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-40"
          >
            Back
          </button>
          <GradientButton
            label={isBusy ? "Setting up…" : step === "sets" ? "Finish setup" : "Continue"}
            onClick={() => {
              if (step === "days") return setStep("exercises");
              if (step === "exercises") return setStep("sets");
              void finish(false);
            }}
            disabled={isBusy || !canContinue}
            className="min-h-11 px-4"
          />
        </div>
      </div>
    </ModalSheet>
  );
}
