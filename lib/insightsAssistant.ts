import type { InsightsData } from "@/lib/insightsTypes";

type AssistantReply = {
  answer: string;
  bullets: string[];
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function correlationText(value: number | null): string {
  if (value == null) return "not enough overlapping data yet";
  const sign = value >= 0 ? "positive" : "negative";
  return `${sign} (${value.toFixed(2)})`;
}

function summarizeCorrelations(data: InsightsData): string[] {
  return data.correlations.map((item) => `${item.label}: ${correlationText(item.value)} over ${item.overlapDays} days`);
}

function latestSummary(data: InsightsData): string[] {
  return data.facts.map((fact) => `${fact.label}: ${fact.value} (${fact.detail})`);
}

function answerForCorrelations(question: string, data: InsightsData): AssistantReply {
  const caloriesStrength = data.correlations.find((item) => item.label === "Calories ↔ Strength");
  return {
    answer:
      caloriesStrength?.value != null
        ? `Your calories-to-strength relationship is ${correlationText(caloriesStrength.value)}. ${caloriesStrength.interpretation}.`
        : "There isn’t enough overlap yet between calories and strength logs for a strong correlation signal.",
    bullets: summarizeCorrelations(data),
  };
}

function answerForImprovements(data: InsightsData): AssistantReply {
  return {
    answer: "Based on your current data, these are the most impactful areas to improve right now.",
    bullets: data.improvements,
  };
}

function answerForAchievements(data: InsightsData): AssistantReply {
  return {
    answer: "Here are your top recent achievements from weekly/monthly performance snapshots.",
    bullets: data.achievements.map((item) => `${item.title}: ${item.detail}`),
  };
}

function answerForSuggestions(data: InsightsData): AssistantReply {
  return {
    answer: "These suggestions are generated from your bodyweight, intake, burn, net-energy, and strength trends.",
    bullets: data.suggestions,
  };
}

function answerForWeight(data: InsightsData): AssistantReply {
  const latestFact = data.facts.find((fact) => fact.label.toLowerCase().includes("weight"));
  return {
    answer: "Here is the current bodyweight snapshot from your recent logs.",
    bullets: latestFact ? [latestFact.value, latestFact.detail] : ["No weight logs found yet."],
  };
}

function defaultAnswer(data: InsightsData): AssistantReply {
  return {
    answer:
      "I can answer questions about your trends, correlations, strengths, weaknesses, and next actions using your history. Start with calories vs strength, bodyweight trend, or what to improve this week.",
    bullets: latestSummary(data),
  };
}

export function answerInsightsQuestion(question: string, data: InsightsData): AssistantReply {
  const normalizedQuestion = normalize(question);

  if (/(correlation|related|relationship|impact|affect|calories|strength)/.test(normalizedQuestion)) {
    return answerForCorrelations(question, data);
  }

  if (/(improve|better|weak|focus|fix|problem|issue)/.test(normalizedQuestion)) {
    return answerForImprovements(data);
  }

  if (/(achievement|best|top|record|milestone|win)/.test(normalizedQuestion)) {
    return answerForAchievements(data);
  }

  if (/(suggest|recommend|advice|next step|plan)/.test(normalizedQuestion)) {
    return answerForSuggestions(data);
  }

  if (/(weight|bodyweight|scale)/.test(normalizedQuestion)) {
    return answerForWeight(data);
  }

  return defaultAnswer(data);
}
