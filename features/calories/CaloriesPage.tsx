"use client";

import { useState } from "react";
import IntakePanel from "@/features/calories/intake/IntakePanel";
import BurnPanel from "@/features/calories/burn/BurnPanel";

type CaloriesTabId = "intake" | "burn";

const TAB_OPTIONS: Array<{ id: CaloriesTabId; label: string; subtitle: string }> = [
  {
    id: "intake",
    label: "Calorie Intake",
    subtitle: "Track pre-workout + post-workout intake",
  },
  {
    id: "burn",
    label: "Calorie Burn",
    subtitle: "Track estimated daily kcal burnt",
  },
];

export default function CaloriesPage() {
  const [selectedTab, setSelectedTab] = useState<CaloriesTabId>("intake");

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(245,158,11,0.18),transparent_34%),radial-gradient(circle_at_85%_10%,rgba(16,185,129,0.12),transparent_32%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:46px_46px] opacity-20" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">Calories Tracking</p>
        <h1 className="mt-3 text-4xl font-bold text-white">Energy Balance Hub</h1>
        <p className="mt-2 max-w-2xl text-zinc-300">
          Log intake and estimated burn to understand daily net energy and improve progress quality.
        </p>

        <div className="mt-6 rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-2 backdrop-blur-sm">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedTab(tab.id)}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  selectedTab === tab.id
                    ? "border-amber-300/80 bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 text-zinc-900"
                    : "border-zinc-700 bg-zinc-950/70 text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                <p className="text-sm font-semibold">{tab.label}</p>
                <p className={`mt-1 text-xs ${selectedTab === tab.id ? "text-zinc-900/80" : "text-zinc-400"}`}>
                  {tab.subtitle}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          {selectedTab === "intake" ? <IntakePanel /> : <BurnPanel />}
        </div>
      </div>
    </div>
  );
}
