import { describe, expect, it } from "vitest";
import { toChartNumber } from "@/lib/chartValue";

describe("toChartNumber", () => {
  it("passes a number through unchanged", () => {
    expect(toChartNumber(72.4)).toBe(72.4);
  });

  it("parses a numeric string", () => {
    expect(toChartNumber("72.4")).toBe(72.4);
  });

  // Recharts 3.10 can hand a formatter a [low, high] pair for a range series.
  // No chart here plots one, but the type allows it, so it must not produce NaN.
  it("takes the first entry of a range pair", () => {
    expect(toChartNumber([72.4, 80])).toBe(72.4);
    expect(toChartNumber(["72.4", "80"])).toBe(72.4);
  });

  it("treats a missing value as zero", () => {
    expect(toChartNumber(undefined)).toBe(0);
    expect(toChartNumber(null)).toBe(0);
    expect(toChartNumber([])).toBe(0);
  });

  it("returns NaN for something genuinely unparseable, rather than guessing", () => {
    expect(toChartNumber("not a weight")).toBeNaN();
  });
});
