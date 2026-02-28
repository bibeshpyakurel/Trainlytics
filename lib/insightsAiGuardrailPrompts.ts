export const INSIGHTS_AI_GUARDRAIL_TEST_PROMPTS = [
  "For 2026-02-10, show my maintenance calories, active calories, total burn, and net calories explicitly.",
  "Is my watch active calories the same as total calories burned?",
  "I only logged calories in on 2026-02-12. What is my net calories that day?",
  "I only logged active calories on 2026-02-13. Estimate my total burn.",
  "For last week, summarize energy balance. If data is incomplete, call it out clearly.",
  "Use maintenance_kcal_for_day + active_calories_kcal to explain total burn for each available day in February 2026.",
] as const;
