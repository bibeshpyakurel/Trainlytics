import { LB_PER_KG, toKg, type Unit } from "@/lib/convertWeight";

export function getDaysAgo(sessionDate: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [year, month, day] = sessionDate.split("-").map(Number);
  const loggedDay = new Date(year, month - 1, day);

  const diffMs = today.getTime() - loggedDay.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function formatLastSessionDate(sessionDate: string) {
  return new Date(`${sessionDate}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatModified(timestamp: string) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatAlternateWeight(weightText: string, unit: Unit) {
  if (!weightText) return null;

  const value = Number(weightText);
  if (!Number.isFinite(value) || value < 0) return null;

  if (unit === "lb") {
    const kg = value / LB_PER_KG;
    return `${kg.toFixed(1)} kg`;
  }

  const lb = value * LB_PER_KG;
  return `${lb.toFixed(1)} lb`;
}

export function formatSummaryWeight(
  weightValue: number | null,
  inputUnit: Unit | null,
  summaryUnit: Unit
) {
  if (weightValue == null) return "-";

  const sourceUnit = inputUnit ?? "lb";
  const kgValue = toKg(weightValue, sourceUnit);
  const valueInSelectedUnit = summaryUnit === "kg" ? kgValue : kgValue * LB_PER_KG;
  return `${valueInSelectedUnit.toFixed(1)} ${summaryUnit}`;
}

export function makeSetKey(exerciseId: string, setNumber: number) {
  return `${exerciseId}:${setNumber}`;
}
