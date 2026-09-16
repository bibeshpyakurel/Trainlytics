/**
 * Coerce a Recharts tooltip value to the number the chart tooltips want.
 *
 * Recharts 3.10 widened a tooltip formatter's `value` from `string | number`
 * to `ValueType`, which also admits `readonly (string | number)[]` — the shape
 * a range series supplies, where one point carries a `[low, high]` pair. None
 * of this app's charts plot a range, so an array is not expected here; taking
 * the first entry keeps a tooltip readable instead of rendering `NaN` if one
 * ever turns up.
 *
 * A missing or unparseable value becomes 0, which is what the three call sites
 * did individually before this helper existed.
 */
export function toChartNumber(value: unknown): number {
  const scalar = Array.isArray(value) ? value[0] : value;
  return typeof scalar === "number" ? scalar : Number(scalar ?? 0);
}
