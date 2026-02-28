import { describe, expect, it } from "vitest";
import { buildInsightsSystemPrompt, getOutputModeInstruction, getToneInstruction } from "@/lib/insightsAiPrompt";

describe("insights AI prompt guardrails", () => {
  it("contains hard rules to avoid active vs maintenance confusion", () => {
    const prompt = buildInsightsSystemPrompt({
      firstName: "Alex",
      tone: "coach",
      outputMode: "default",
    });

    expect(prompt).toContain("active_calories_kcal is activity-only from watch");
    expect(prompt).toContain("Maintenance is computed separately from profile");
    expect(prompt).toContain("Total burn is always maintenance + active");
    expect(prompt).toContain("maintenance_kcal_for_day, active_calories_kcal, total_burn_kcal, net_calories_kcal");
    expect(prompt).toContain("partial estimate");
  });

  it("includes first name when available", () => {
    const prompt = buildInsightsSystemPrompt({
      firstName: "Taylor",
      tone: "coach",
      outputMode: "default",
    });
    expect(prompt).toContain("The athlete's first name is Taylor.");
  });

  it("maps tone and output mode instructions", () => {
    expect(getToneInstruction("technical")).toContain("Technical");
    expect(getToneInstruction("plain")).toContain("Plain English");
    expect(getOutputModeInstruction("fitness_structured")).toContain("Key insight, Risk, Next workout action");
  });
});
