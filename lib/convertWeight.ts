export const LB_PER_KG = 2.2046226218;

export type Unit = "kg" | "lb";

export function toKg(value: number, unit: Unit) {
  return unit === "kg" ? value : value / LB_PER_KG;
}